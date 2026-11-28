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
// Integration keys and passwords live only here (data/secrets.json), never in the dashboard data or the browser
let secrets = readJson('secrets.json', {});
const saveSecrets = () => writeJson('secrets.json', secrets);
const maskSecret = v => ({ set: true, last4: String(v).slice(-4) });
const intCfg = id => store.data?.settings?.integrations?.[id] || {};
const SECRET_ID_RE = /^[a-z0-9:_-]{2,60}$/;
async function outbound(url, opts = {}) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  return { ok: r.ok, status: r.status, body };
}
const indianNumber = v => { const d = String(v || '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };
async function whatsappSend({ to, text, template, lang, params }) {
  const c = intCfg('whatsapp'), token = secrets.whatsapp?.token;
  if (!c.enabled || c.mode !== 'cloud' || !c.phoneId || !token) throw Object.assign(new Error('WhatsApp Business API is not set up in Settings → Integrations.'), { status: 400 });
  const ver = /^v\d+\.\d+$/.test(c.apiVersion || '') ? c.apiVersion : 'v23.0';
  const body = template
    ? { messaging_product: 'whatsapp', to: indianNumber(to), type: 'template', template: { name: template, language: { code: lang || 'en' }, components: params?.length ? [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: String(t).slice(0, 900) })) }] : [] } }
    : { messaging_product: 'whatsapp', to: indianNumber(to), type: 'text', text: { body: String(text || '').slice(0, 4000) } };
  const r = await outbound(`https://graph.facebook.com/${ver}/${encodeURIComponent(c.phoneId)}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw Object.assign(new Error(r.body?.error?.message || `WhatsApp returned ${r.status}`), { status: 502 });
  return { id: r.body?.messages?.[0]?.id || '' };
}
const razorpayAuth = () => { const c = intCfg('payments'), sec = secrets.payments?.keySecret; if (!c.enabled || !c.keyId || !sec) throw Object.assign(new Error('Razorpay is not set up in Settings → Integrations → Online payments.'), { status: 400 }); return 'Basic ' + Buffer.from(`${c.keyId}:${sec}`).toString('base64'); };
async function fireHooks(event, data) {
  const c = intCfg('custom'); if (!c.enabled) return 0;
  let n = 0;
  for (const h of c.hooks || []) {
    if (!h.url || !(h.events || []).includes(event)) continue;
    const headers = { 'Content-Type': 'application/json' };
    const key = secrets['custom:' + h.id]?.key; if (key && h.header) headers[h.header] = key;
    try { await outbound(h.url, { method: 'POST', headers, body: JSON.stringify({ event, at: new Date().toISOString(), data }) }); n++; } catch (e) { console.error('Webhook failed', h.name, e.message); }
  }
  return n;
}

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

// ---------- Chemist orders (portal and assistant) ----------
function createOrder(cid, inLines, note, by) {
  const bad = msg => Object.assign(new Error(msg), { status: 400 });
  if (!Array.isArray(inLines) || !inLines.length || inLines.length > 200) throw bad('Add between 1 and 200 items.');
  const prods = store.data?.products || [];
  const cat = catalogue();
  const lines = [];
  for (const l of inLines) {
    const qty = Math.floor(Number(l.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 100000) throw bad('Each quantity must be a whole number from 1 to 100000.');
    if (l.productId) {
      const p = prods.find(x => x.id === l.productId); if (!p) throw bad('An item in the order no longer exists. Refresh the list.');
      lines.push({ productId: p.id, name: p.name, pack: p.pack || '', qty, availableAtOrder: cat.find(x => x.id === p.id)?.available || 0, note: str(l.note, 200) });
    } else {
      const name = str(l.name, 120); if (!name) throw bad('Enter the name of the item you need.');
      lines.push({ productId: '', name, pack: str(l.pack, 40), company: str(l.company, 60), qty, availableAtOrder: 0, note: str(l.note, 200) });
    }
  }
  const max = orders.reduce((a, o) => Math.max(a, +String(o.id).replace(/\D/g, '') || 0), 1000);
  const order = { id: 'ORD-' + (max + 1), chemistId: cid, created: new Date().toISOString(), date: today(), lines, note: str(note, 500), status: 'New', via: by, history: [{ at: new Date().toISOString(), status: 'New', by: by === 'assistant' ? 'chemist (assistant)' : 'chemist' }] };
  orders.push(order); saveOrders();
  return order;
}

// ---------- Chemist Assistant (Claude, on the server) ----------
// Needs: npm install (for @anthropic-ai/sdk) and the server key in Settings → Integrations → AI providers.
let assistantLog = readJson('assistant.json', { chats: {}, usage: {} });
const saveAssistant = () => writeJson('assistant.json', assistantLog);
let sdkMod = null;
async function loadServerSdk() {
  if (sdkMod) return sdkMod;
  try {
    const [core, js] = await Promise.all([import('@anthropic-ai/sdk'), import('@anthropic-ai/sdk/helpers/beta/json-schema')]);
    sdkMod = { Anthropic: core.default, betaTool: js.betaTool };
    return sdkMod;
  } catch { throw Object.assign(new Error('The assistant needs the Anthropic package on the server — run “npm install” in the app folder and restart.'), { status: 503 }); }
}
const assistantCfg = () => ({ enabled: false, perChemistPerDay: 40, dailyTotal: 400, ...(store.data?.settings?.agents?.assistant || {}) });
function assistantTools(cid, betaTool, state) {
  const d = store.data;
  const chemist = (d.chemists || []).find(c => c.id === cid);
  const due = () => {
    const bills = (d.sales || []).filter(x => x.party?.chemistId === cid);
    const bal = x => Math.max(0, x.total - (x.paid || 0) - (x.returned || 0));
    const open = bills.filter(x => bal(x) > 0.5).sort((a, b) => a.date.localeCompare(b.date));
    const pays = bills.flatMap(x => (x.payments?.length ? x.payments : x.paid > 0 ? [{ date: x.date, amount: x.paid }] : [])).sort((a, b) => b.date.localeCompare(a.date));
    return { total_due: Math.round(bills.reduce((a, x) => a + x.total - (x.paid || 0) - (x.returned || 0), 0) * 100) / 100, open_bills: open.slice(0, 15).map(x => ({ bill: x.no, date: x.date, amount: x.total, balance: Math.round(bal(x) * 100) / 100 })), last_payment: pays[0] || null, credit_limit: chemist?.creditLimit || 0, payment_terms_days: chemist?.terms || 0 };
  };
  return [
    betaTool({
      name: 'search_products',
      description: 'Search the distributor’s product list by name, salt, company or form. Returns availability, this chemist’s rate (PTR, before discount and GST), MRP and GST. Use it for every stock or rate question.',
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Words to search, e.g. "dolo 650" or "lupin insulin"' } }, required: ['query'], additionalProperties: false },
      run: async ({ query }) => {
        const words = String(query || '').toUpperCase().split(/\s+/).filter(Boolean);
        const hits = catalogue().filter(p => { const t = `${p.name} ${p.company} ${p.category} ${p.form} ${p.pack}`.toUpperCase(); return words.every(w => t.includes(w)); }).slice(0, 12);
        return JSON.stringify(hits.length ? hits.map(p => ({ product_id: p.id, name: p.name, company: p.company, pack: p.pack, form: p.form, status: p.status, available_units: p.available, rate: p.rate, mrp: p.mrp, gst_percent: p.gst, nearest_expiry: p.nearestExpiry })) : { result: 'No matching product. It can still be requested by name in an order.' });
      },
    }),
    betaTool({
      name: 'my_orders',
      description: 'This chemist’s recent orders and their status.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: async () => JSON.stringify(orders.filter(o => o.chemistId === cid).sort((a, b) => b.created.localeCompare(a.created)).slice(0, 8).map(o => ({ order: o.id, date: o.date, status: o.status, items: o.lines.map(l => `${l.name} × ${l.qty}`), reply: o.reply || '', bill: o.saleNo || '' }))),
    }),
    betaTool({
      name: 'my_account',
      description: 'This chemist’s balance with the distributor: total due, open bills, last payment, credit limit and payment terms.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: async () => JSON.stringify(due()),
    }),
    betaTool({
      name: 'place_order',
      description: 'Send an order to the distributor. Only call this after you listed the items and quantities and the chemist clearly confirmed. Items not in stock can be ordered too; unknown items go by name.',
      inputSchema: { type: 'object', properties: { lines: { type: 'array', items: { type: 'object', properties: { product_id: { type: 'string', description: 'product_id from search_products, or empty for an item not in the list' }, name: { type: 'string', description: 'Item name when product_id is empty' }, qty: { type: 'integer' } }, required: ['product_id', 'name', 'qty'], additionalProperties: false } }, note: { type: 'string' }, chemist_confirmed: { type: 'boolean', description: 'true only if the chemist confirmed this exact order in their last message' } }, required: ['lines', 'note', 'chemist_confirmed'], additionalProperties: false },
      run: async ({ lines, note, chemist_confirmed }) => {
        if (!chemist_confirmed) return 'Not placed: ask the chemist to confirm the items and quantities first.';
        if (state.ordered) return `Already placed ${state.ordered} in this message.`;
        try {
          const o = createOrder(cid, (lines || []).map(l => (l.product_id ? { productId: l.product_id, qty: l.qty } : { name: l.name, qty: l.qty })), note, 'assistant');
          state.ordered = o.id;
          return `Placed order ${o.id} with ${o.lines.length} item(s). The distributor will check and confirm it.`;
        } catch (e) { return `Could not place the order: ${e.message}`; }
      },
    }),
  ];
}
async function assistantReply(cid, text) {
  const cfg = assistantCfg();
  if (!cfg.enabled) throw Object.assign(new Error('The assistant is switched off. Please call the distributor.'), { status: 403 });
  const key = secrets.ai?.serverKey;
  if (!key) throw Object.assign(new Error('The assistant is not set up yet. Please call the distributor.'), { status: 503 });
  const day = today(); const u = assistantLog.usage[day] || (assistantLog.usage = { [day]: { total: 0, per: {} } })[day];
  if ((u.per[cid] || 0) >= cfg.perChemistPerDay) throw Object.assign(new Error(`You have reached today’s limit of ${cfg.perChemistPerDay} questions. Please call the distributor.`), { status: 429 });
  if (u.total >= cfg.dailyTotal) throw Object.assign(new Error('The assistant is busy today. Please call the distributor.'), { status: 429 });
  const { Anthropic, betaTool } = await loadServerSdk();
  const d = store.data; const f = d.settings?.firm || {}; const c = (d.chemists || []).find(x => x.id === cid);
  const history = (assistantLog.chats[cid] || []).slice(-12).map(m => ({ role: m.role, content: m.text }));
  const state = { ordered: '' };
  const client = new Anthropic({ apiKey: key });
  const system = `You are the ordering assistant of ${f.name || 'the distributor'}, a pharmaceutical distributor${f.city ? ` in ${f.city}` : ''}. You are chatting with ${c?.name || 'a chemist'}${c?.city ? ` (${c.city})` : ''} on their portal. Today is ${day}.
Reply in the language the chemist writes in (Hindi, English or Hinglish), briefly and politely, like a helpful counter staff member.
- Use the tools for every question about stock, rates, orders or their account. Never guess numbers, availability or dates.
- Rates are this chemist's rates (PTR) before discount and GST. Their usual cash discount is ${c?.cd || 0}%.
- Never discuss other chemists, the distributor's purchase prices or suppliers, or anything outside this business.
- Do not give medical advice, dosage or substitutes; for that, suggest a doctor or pharmacist.
- To order: find each item, then list the items with quantities and ask the chemist to confirm. Call place_order only after they clearly confirm. Items that are not in stock can still be ordered — the distributor arranges them.
- If you cannot help, say the distributor will call back${f.phone ? ` or that they can call ${f.phone}` : ''}.`;
  const runner = client.beta.messages.toolRunner({
    model: d.settings?.integrations?.ai?.agentModel || 'claude-haiku-5-5',
    max_tokens: 1500,
    max_iterations: 6,
    system,
    tools: assistantTools(cid, betaTool, state),
    messages: [...history, { role: 'user', content: text }],
  });
  let final;
  try { final = await runner.runUntilDone(); }
  catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw Object.assign(new Error('The assistant is not set up correctly. Please call the distributor.'), { status: 503 });
    if (e instanceof Anthropic.RateLimitError) throw Object.assign(new Error('The assistant is busy. Please try again in a minute.'), { status: 429 });
    if (e instanceof Anthropic.APIError) { console.error('Assistant API error', e.status, e.message); throw Object.assign(new Error('The assistant could not answer right now. Please try again.'), { status: 502 }); }
    throw e;
  }
  let reply = (final.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if (final.stop_reason === 'refusal') reply = 'Sorry, I can’t help with that. Please call the distributor.';
  if (!reply) reply = state.ordered ? `Your order ${state.ordered} has been sent.` : 'Sorry, please ask again in a different way.';
  const log = assistantLog.chats[cid] || (assistantLog.chats[cid] = []);
  const at = new Date().toISOString();
  log.push({ role: 'user', text: String(text).slice(0, 2000), at }, { role: 'assistant', text: reply.slice(0, 4000), at, order: state.ordered || undefined });
  if (log.length > 60) log.splice(0, log.length - 60);
  u.total++; u.per[cid] = (u.per[cid] || 0) + 1;
  saveAssistant();
  return { reply, order: state.ordered || '' };
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
    if (route === 'GET /api/portal/assistant') {
      const cfg = assistantCfg();
      return send(res, 200, { enabled: !!cfg.enabled && !!secrets.ai?.serverKey, greeting: cfg.greeting || '', history: (assistantLog.chats[cid] || []).slice(-30).map(m => ({ role: m.role, text: m.text, at: m.at, order: m.order })) });
    }
    if (route === 'POST /api/portal/assistant') {
      const b = await readBody(req, 10_000);
      const text = str(b.message, 1000); if (!text) return fail400(res, 'Type a question.');
      return send(res, 200, await assistantReply(cid, text));
    }
    if (route === 'GET /api/portal/orders') return send(res, 200, orders.filter(o => o.chemistId === cid).sort((a, b) => b.created.localeCompare(a.created)));
    if (route === 'GET /api/portal/bills') {
      const bills = (store.data?.sales || []).filter(x => x.party?.chemistId === cid).sort((a, b) => b.date.localeCompare(a.date))
        .map(x => ({ no: x.no, date: x.date, total: x.total, paid: x.paid || 0, returned: x.returned || 0, items: x.lines.length, lines: x.lines.map(l => ({ name: store.data.products.find(p => p.id === l.productId)?.name || '', batch: l.batch, expiry: l.expiry, qty: l.qty, free: l.free, rate: l.rate })) }));
      return send(res, 200, bills);
    }
    if (route === 'POST /api/portal/orders') {
      const b = await readBody(req, 100_000);
      const order = createOrder(cid, b.lines, b.note, 'chemist');
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
  if (route === 'GET /api/assistant/log') {
    const chemName = id => (store.data?.chemists || []).find(c => c.id === id)?.name || id;
    return send(res, 200, { usage: assistantLog.usage[today()] || { total: 0, per: {} }, sdk: await loadServerSdk().then(() => true, () => false), key: !!secrets.ai?.serverKey, chats: Object.entries(assistantLog.chats).map(([id, m]) => ({ chemistId: id, name: chemName(id), last: m.at(-1)?.at || '', messages: m.slice(-20) })).sort((a, b) => b.last.localeCompare(a.last)).slice(0, 30) });
  }
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
  // ----- Integrations -----
  if (route === 'GET /api/secrets') return send(res, 200, Object.fromEntries(Object.entries(secrets).map(([id, f]) => [id, Object.fromEntries(Object.entries(f).map(([k, v]) => [k, maskSecret(v)]))])));
  const sec = /^PUT \/api\/secrets\/([^/]+)$/.exec(route);
  if (sec) {
    const id = decodeURIComponent(sec[1]); if (!SECRET_ID_RE.test(id)) return fail400(res, 'Bad id.');
    const b = await readBody(req, 20_000);
    const cur = secrets[id] || {};
    for (const [k, v] of Object.entries(b.fields || {})) {
      if (!/^[A-Za-z0-9_]{1,40}$/.test(k)) continue;
      if (v === null) delete cur[k]; else if (typeof v === 'string' && v.trim()) cur[k] = v.trim().slice(0, 2000);
    }
    if (Object.keys(cur).length) secrets[id] = cur; else delete secrets[id];
    saveSecrets();
    return send(res, 200, { ok: true });
  }
  const test = /^POST \/api\/int\/test\/([^/]+)$/.exec(route);
  if (test) {
    const id = decodeURIComponent(test[1]);
    try {
      if (id === 'whatsapp') {
        const c = intCfg('whatsapp'), token = secrets.whatsapp?.token;
        if (!c.phoneId || !token) return fail400(res, 'Enter the phone number ID and access token first, and save.');
        const ver = /^v\d+\.\d+$/.test(c.apiVersion || '') ? c.apiVersion : 'v23.0';
        const r = await outbound(`https://graph.facebook.com/${ver}/${encodeURIComponent(c.phoneId)}?fields=display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return send(res, 200, { ok: false, msg: r.body?.error?.message || `WhatsApp returned ${r.status}` });
        return send(res, 200, { ok: true, msg: `Connected: ${r.body.verified_name || ''} ${r.body.display_phone_number || ''}`.trim() });
      }
      if (id === 'payments') {
        const r = await outbound('https://api.razorpay.com/v1/payments?count=1', { headers: { Authorization: razorpayAuth() } });
        return send(res, 200, r.ok ? { ok: true, msg: 'Razorpay keys accepted.' } : { ok: false, msg: r.body?.error?.description || `Razorpay returned ${r.status}` });
      }
      if (id.startsWith('custom:')) {
        const h = (intCfg('custom').hooks || []).find(x => 'custom:' + x.id === id); if (!h?.url) return fail400(res, 'Save the webhook URL first.');
        const headers = { 'Content-Type': 'application/json' }; const key = secrets[id]?.key; if (key && h.header) headers[h.header] = key;
        const r = await outbound(h.url, { method: 'POST', headers, body: JSON.stringify({ event: 'test', at: new Date().toISOString(), data: { message: 'Test from Pharma Suite' } }) });
        return send(res, 200, r.ok ? { ok: true, msg: `Webhook answered ${r.status}.` } : { ok: false, msg: `Webhook answered ${r.status}.` });
      }
      return fail400(res, 'This integration has no connection test yet.');
    } catch (e) { return send(res, 200, { ok: false, msg: e.message || 'Could not connect.' }); }
  }
  if (route === 'POST /api/int/whatsapp/send') {
    const b = await readBody(req, 20_000);
    if (!/^\d{10,13}$/.test(String(b.to || '').replace(/\D/g, ''))) return fail400(res, 'Enter a valid mobile number.');
    return send(res, 200, await whatsappSend(b));
  }
  if (route === 'POST /api/int/razorpay/link') {
    const b = await readBody(req, 10_000);
    const amount = Math.round(Number(b.amount) * 100);
    if (!(amount >= 100)) return fail400(res, 'Amount must be at least ₹1.');
    const body = { amount, currency: 'INR', description: str(b.description, 240) || 'Payment', reference_id: str(b.ref, 40) || undefined, customer: { name: str(b.name, 80) || undefined, contact: b.phone ? '+' + indianNumber(b.phone) : undefined }, notify: { sms: false, email: false }, reminder_enable: false };
    const r = await outbound('https://api.razorpay.com/v1/payment_links', { method: 'POST', headers: { Authorization: razorpayAuth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return send(res, 502, { error: r.body?.error?.description || `Razorpay returned ${r.status}` });
    return send(res, 200, { url: r.body.short_url, id: r.body.id });
  }
  if (route === 'POST /api/hooks/fire') {
    const b = await readBody(req, 200_000);
    if (!/^[a-z.]{3,40}$/.test(String(b.event || ''))) return fail400(res, 'Bad event.');
    fireHooks(b.event, b.data || {}).catch(() => {});
    return send(res, 202, { ok: true });
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
