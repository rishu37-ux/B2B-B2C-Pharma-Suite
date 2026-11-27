#!/usr/bin/env node
/*
 * Pharma Suite server — one central place for the distributor dashboard and the chemist portal.
 * No packages needed: run `node server.js` (Node 18+).
 *
 *   PORT=8080           port to listen on
 *   HOST=127.0.0.1      use 0.0.0.0 to let other devices on your network connect
 *   DATA_DIR=./data     where the data files are kept (back this folder up)
 *
 * Data files: db.json (dashboard data), auth.json (logins, passwords are scrypt-hashed),
 * orders.json (orders placed by chemists).
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = +process.env.PORT || 8080;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
fs.mkdirSync(DATA, { recursive: true });

// ---------- Storage (atomic JSON files) ----------
const file = name => path.join(DATA, name);
function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
function writeJson(name, value) {
  const tmp = file(name) + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file(name));
}
let store = readJson('db.json', { rev: 0, data: null });
let auth = readJson('auth.json', { admin: null, chemists: {} });
let orders = readJson('orders.json', []);
const saveAuth = () => writeJson('auth.json', auth);
const saveOrders = () => writeJson('orders.json', orders);

// ---------- Passwords & sessions ----------
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) =>
  ({ salt, hash: crypto.scryptSync(String(password), salt, 64).toString('hex') });
const checkPassword = (password, rec) => {
  if (!rec || !rec.salt || !rec.hash) return false;
  const a = crypto.scryptSync(String(password), rec.salt, 64);
  const b = Buffer.from(rec.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
// A login ID is an email address or a simple user name
const USERNAME_RE = /^[a-z0-9._@+-]{3,100}$/;
const USERNAME_MSG = 'Login ID: an email address, or 3–100 letters, numbers, dot, dash, underscore or @.';
const passwordProblem = p => (typeof p !== 'string' || p.length < 8) ? 'Password must be at least 8 characters.' : p.length > 200 ? 'Password is too long.' : '';

const sessions = new Map(); // token -> { role, chemistId, expires }
const SESSION_MS = 12 * 3600 * 1000;
function newSession(res, req, info) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { ...info, expires: Date.now() + SESSION_MS });
  res.setHeader('Set-Cookie', cookie('ps_session', token, req, SESSION_MS / 1000));
}
function cookie(name, value, req, maxAge) {
  const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
function getSession(req) {
  const m = /(?:^|;\s*)ps_session=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  if (!m) return null;
  const s = sessions.get(m[1]);
  if (!s || s.expires < Date.now()) { sessions.delete(m[1]); return null; }
  if (s.role === 'chemist') {
    // A chemist session ends as soon as their login is switched off or they stop being Active
    const rec = auth.chemists[s.chemistId];
    if (!rec || !rec.active || chemistOf(s.chemistId)?.status !== 'Active') { sessions.delete(m[1]); return null; }
  }
  return { token: m[1], ...s };
}
const endSessionsFor = chemistId => { for (const [t, s] of sessions) if (s.chemistId === chemistId) sessions.delete(t); };

// Slow down password guessing: 5 failures per username+IP locks for 10 minutes
const failures = new Map();
const failKey = (req, u) => `${req.socket.remoteAddress}|${u}`;
const locked = k => { const f = failures.get(k); return f && f.count >= 5 && f.until > Date.now(); };
const fail = k => { const f = failures.get(k) || { count: 0, until: 0 }; f.count++; f.until = Date.now() + 10 * 60 * 1000; failures.set(k, f); };

// ---------- Helpers ----------
const chemistOf = id => (store.data?.chemists || []).find(c => c.id === id);
function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}
const fail400 = (res, msg) => send(res, 400, { error: msg });
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Request is too large.'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('Bad JSON.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// What a chemist may see: the product list with availability and their own price — never purchase rates or suppliers.
function catalogue() {
  const d = store.data; if (!d) return [];
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const notExpired = exp => { if (!exp) return false; const [y, m] = exp.split('-').map(Number); return new Date(y, m, 0) >= now; };
  return d.products.map(p => {
    const bs = d.batches.filter(b => b.productId === p.id && (b.qty || 0) + (b.free || 0) > 0 && notExpired(b.expiry)).sort((a, b) => a.expiry.localeCompare(b.expiry));
    const available = bs.reduce((a, b) => a + (b.qty || 0) + (b.free || 0), 0);
    return {
      id: p.id, name: p.name, company: d.companies.find(c => c.id === p.companyId)?.name || '', category: d.categories.find(c => c.id === p.categoryId)?.name || '',
      form: p.form || '', pack: p.pack || '', mrp: p.mrp || 0, rate: p.ptr || 0, gst: p.gst || 0, available,
      status: available <= 0 ? 'Not in stock' : available < (p.reorder || 0) ? 'Limited stock' : 'In stock',
      nearestExpiry: bs[0]?.expiry || '',
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- API ----------
async function api(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  const s = getSession(req);
  // Cross-site requests are refused for anything that changes data (SameSite cookies also block them)
  if (req.method !== 'GET') {
    const origin = req.headers.origin;
    let originHost = null;
    if (origin) { try { originHost = new URL(origin).host; } catch { originHost = ''; } }
    if (origin && originHost !== req.headers.host) return send(res, 403, { error: 'Cross-site request refused.' });
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'Send JSON.' });
  }

  if (route === 'GET /api/me') {
    if (!s) return send(res, 200, { role: null, setupNeeded: !auth.admin });
    if (s.role === 'admin') return send(res, 200, { role: 'admin', username: auth.admin.username });
    const c = chemistOf(s.chemistId);
    return send(res, 200, { role: 'chemist', chemistId: s.chemistId, username: auth.chemists[s.chemistId].username, mustChange: !!auth.chemists[s.chemistId].mustChange, name: c?.name || '', firm: store.data?.settings?.firm?.name || '' });
  }
  if (route === 'POST /api/setup') {
    if (auth.admin) return send(res, 409, { error: 'The admin account already exists.' });
    const b = await readBody(req, 10_000);
    const username = str(b.username, 100).toLowerCase();
    if (!USERNAME_RE.test(username)) return fail400(res, USERNAME_MSG);
    const pp = passwordProblem(b.password); if (pp) return fail400(res, pp);
    auth.admin = { username, ...hashPassword(b.password), created: new Date().toISOString() };
    saveAuth();
    newSession(res, req, { role: 'admin' });
    return send(res, 200, { role: 'admin' });
  }
  if (route === 'POST /api/login') {
    const b = await readBody(req, 10_000);
    const username = str(b.username, 100).toLowerCase(); const k = failKey(req, username);
    if (locked(k)) return send(res, 429, { error: 'Too many wrong tries. Wait 10 minutes and try again.' });
    if (auth.admin && username === auth.admin.username && checkPassword(b.password, auth.admin)) {
      failures.delete(k); newSession(res, req, { role: 'admin' }); return send(res, 200, { role: 'admin' });
    }
    const entry = Object.entries(auth.chemists).find(([, r]) => r.username === username);
    if (entry && checkPassword(b.password, entry[1])) {
      const [chemistId, rec] = entry;
      if (!rec.active) return send(res, 403, { error: 'Your portal login is switched off. Please contact the distributor.' });
      if (chemistOf(chemistId)?.status !== 'Active') return send(res, 403, { error: 'Your account is not active yet. Please contact the distributor.' });
      failures.delete(k); rec.lastLogin = new Date().toISOString(); saveAuth();
      newSession(res, req, { role: 'chemist', chemistId }); return send(res, 200, { role: 'chemist', mustChange: !!rec.mustChange });
    }
    fail(k);
    return send(res, 401, { error: 'Wrong login ID or password.' });
  }
  if (route === 'POST /api/logout') {
    if (s) sessions.delete(s.token);
    res.setHeader('Set-Cookie', cookie('ps_session', '', req, 0));
    return send(res, 200, { ok: true });
  }
  if (route === 'POST /api/password') {
    if (!s) return send(res, 401, { error: 'Please log in.' });
    const b = await readBody(req, 10_000);
    const rec = s.role === 'admin' ? auth.admin : auth.chemists[s.chemistId];
    if (!checkPassword(b.current, rec)) return send(res, 403, { error: 'Current password is wrong.' });
    const pp = passwordProblem(b.password); if (pp) return fail400(res, pp);
    if (checkPassword(b.password, rec)) return fail400(res, 'Choose a new password that is different from the current one.');
    Object.assign(rec, hashPassword(b.password), { mustChange: false }); saveAuth();
    for (const [t, x] of sessions) if (t !== s.token && x.role === s.role && x.chemistId === s.chemistId) sessions.delete(t);
    return send(res, 200, { ok: true });
  }

  if (!s) return send(res, 401, { error: 'Please log in.' });

  // ----- Chemist portal -----
  if (url.pathname.startsWith('/api/portal/')) {
    if (s.role !== 'chemist') return send(res, 403, { error: 'Chemist accounts only.' });
    const cid = s.chemistId;
    if (auth.chemists[cid]?.mustChange) return send(res, 403, { error: 'Please set your own password first.', mustChange: true });
    if (route === 'GET /api/portal/catalogue') {
      const c = chemistOf(cid);
      return send(res, 200, { items: catalogue(), cd: c?.cd || 0, td: c?.td || 0, firm: store.data?.settings?.firm || {} });
    }
    if (route === 'GET /api/portal/orders') return send(res, 200, orders.filter(o => o.chemistId === cid).sort((a, b) => b.created.localeCompare(a.created)));
    if (route === 'GET /api/portal/bills') {
      const bills = (store.data?.sales || []).filter(x => x.party?.chemistId === cid).sort((a, b) => b.date.localeCompare(a.date))
        .map(x => ({ no: x.no, date: x.date, total: x.total, paid: x.paid || 0, items: x.lines.length, lines: x.lines.map(l => ({ name: store.data.products.find(p => p.id === l.productId)?.name || '', batch: l.batch, expiry: l.expiry, qty: l.qty, free: l.free, rate: l.rate })) }));
      return send(res, 200, bills);
    }
    if (route === 'POST /api/portal/orders') {
      const b = await readBody(req, 100_000);
      if (!Array.isArray(b.lines) || !b.lines.length || b.lines.length > 200) return fail400(res, 'Add between 1 and 200 items.');
      const prods = store.data?.products || [];
      const lines = [];
      for (const l of b.lines) {
        const qty = Math.floor(Number(l.qty));
        if (!Number.isFinite(qty) || qty < 1 || qty > 100000) return fail400(res, 'Each quantity must be a whole number from 1 to 100000.');
        if (l.productId) {
          const p = prods.find(x => x.id === l.productId); if (!p) return fail400(res, 'An item in the order no longer exists. Refresh the list.');
          const avail = catalogue().find(x => x.id === p.id)?.available || 0;
          lines.push({ productId: p.id, name: p.name, pack: p.pack || '', qty, availableAtOrder: avail, note: str(l.note, 200) });
        } else {
          const name = str(l.name, 120); if (!name) return fail400(res, 'Enter the name of the item you need.');
          lines.push({ productId: '', name, pack: str(l.pack, 40), company: str(l.company, 60), qty, availableAtOrder: 0, note: str(l.note, 200) });
        }
      }
      const max = orders.reduce((a, o) => Math.max(a, +String(o.id).replace(/\D/g, '') || 0), 1000);
      const order = { id: 'ORD-' + (max + 1), chemistId: cid, created: new Date().toISOString(), date: today(), lines, note: str(b.note, 500), status: 'New', history: [{ at: new Date().toISOString(), status: 'New', by: 'chemist' }] };
      orders.push(order); saveOrders();
      return send(res, 200, order);
    }
    const cancel = /^POST \/api\/portal\/orders\/(ORD-\d+)\/cancel$/.exec(route);
    if (cancel) {
      const o = orders.find(x => x.id === cancel[1] && x.chemistId === cid);
      if (!o) return send(res, 404, { error: 'Order not found.' });
      if (o.status !== 'New') return send(res, 409, { error: 'This order is already being handled. Please call the distributor to change it.' });
      o.status = 'Cancelled'; o.history.push({ at: new Date().toISOString(), status: 'Cancelled', by: 'chemist' }); saveOrders();
      return send(res, 200, o);
    }
    return send(res, 404, { error: 'Not found.' });
  }

  // ----- Admin -----
  if (s.role !== 'admin') return send(res, 403, { error: 'Admin only.' });
  if (route === 'GET /api/db') return send(res, 200, store);
  if (route === 'PUT /api/db') {
    const b = await readBody(req, 50 * 1024 * 1024);
    if (!b || typeof b.data !== 'object' || !Array.isArray(b.data?.products)) return fail400(res, 'Bad data.');
    if (b.rev !== store.rev) return send(res, 409, { error: 'The data was changed in another window. Reload to continue.', rev: store.rev });
    store = { rev: store.rev + 1, data: b.data, saved: new Date().toISOString() };
    writeJson('db.json', store);
    return send(res, 200, { rev: store.rev });
  }
  if (route === 'GET /api/orders') return send(res, 200, orders);
  const upd = /^POST \/api\/orders\/(ORD-\d+)$/.exec(route);
  if (upd) {
    const o = orders.find(x => x.id === upd[1]); if (!o) return send(res, 404, { error: 'Order not found.' });
    const b = await readBody(req, 10_000);
    const allowed = ['New', 'Accepted', 'Arranging', 'Billed', 'Rejected', 'Cancelled'];
    if (b.status && !allowed.includes(b.status)) return fail400(res, 'Unknown status.');
    if (b.status && b.status !== o.status) { o.status = b.status; o.history.push({ at: new Date().toISOString(), status: b.status, by: 'distributor' }); }
    if (b.saleNo != null) o.saleNo = str(b.saleNo, 30);
    if (b.reply != null) o.reply = str(b.reply, 500);
    saveOrders();
    return send(res, 200, o);
  }
  if (route === 'GET /api/logins') {
    return send(res, 200, Object.fromEntries(Object.entries(auth.chemists).map(([id, r]) => [id, { username: r.username, active: r.active, created: r.created, lastLogin: r.lastLogin || '', mustChange: !!r.mustChange }])));
  }
  const lg = /^(PUT|DELETE) \/api\/logins\/(C[0-9A-Za-z]+)$/.exec(route);
  if (lg) {
    const id = lg[2];
    if (lg[1] === 'DELETE') { delete auth.chemists[id]; saveAuth(); endSessionsFor(id); return send(res, 200, { ok: true }); }
    const b = await readBody(req, 10_000);
    const rec = auth.chemists[id];
    const username = str(b.username ?? rec?.username, 100).toLowerCase();
    if (!USERNAME_RE.test(username)) return fail400(res, USERNAME_MSG);
    if (username === auth.admin.username || Object.entries(auth.chemists).some(([cid, r]) => cid !== id && r.username === username)) return send(res, 409, { error: `The username “${username}” is already taken.` });
    if (!rec && !b.password) return fail400(res, 'Set a password for the new login.');
    if (b.password) { const pp = passwordProblem(b.password); if (pp) return fail400(res, pp); }
    const next = { ...(rec || { created: new Date().toISOString() }), username, active: b.active !== false };
    if (b.password) Object.assign(next, hashPassword(b.password), { mustChange: !!b.mustChange });
    auth.chemists[id] = next; saveAuth();
    if (!next.active || b.password) endSessionsFor(id);
    return send(res, 200, { username, active: next.active });
  }
  return send(res, 404, { error: 'Not found.' });
}

// ---------- Static files (only these are served) ----------
const STATIC = {
  '/index.html': 'text/html', '/app.js': 'text/javascript', '/hospitals-data.js': 'text/javascript', '/styles.css': 'text/css',
  '/login.html': 'text/html', '/login.js': 'text/javascript', '/portal.html': 'text/html', '/portal.js': 'text/javascript',
};
function serveStatic(req, res, url) {
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const s = getSession(req);
  // Pages need the right login
  if (p === '/index.html' && s?.role !== 'admin') return send(res, 302, '', { Location: s?.role === 'chemist' ? '/portal.html' : '/login.html' });
  if (p === '/portal.html' && s?.role !== 'chemist') return send(res, 302, '', { Location: s?.role === 'admin' ? '/' : '/login.html' });
  const type = STATIC[p];
  if (!type) return send(res, 404, 'Not found');
  fs.readFile(path.join(ROOT, p), (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, 'Bad request'); }
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return serveStatic(req, res, url);
  } catch (err) {
    if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'Server error.' });
    if (!err.status) console.error(err);
  }
});
server.listen(PORT, HOST, () => {
  console.log(`Pharma Suite is running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Data folder: ${DATA}`);
  if (!auth.admin) console.log('First run: open the address above to create the admin login.');
});
