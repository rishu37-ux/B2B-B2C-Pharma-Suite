/* Pharma Suite — distributor dashboard (no build step, data kept in localStorage) */
(() => {
  'use strict';

  // ---------- Utilities ----------
  const KEY = 'pharmaSuite.v2';
  const KEY_API = 'pharmaSuite.anthropicKey';
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.8.0/+esm';
  const DAY = 86400000;
  const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf = new Intl.NumberFormat('en-IN');
  const n2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = v => inr0.format(Math.round(v || 0));
  const money2 = v => inr2.format(v || 0);
  const dec = v => n2.format(+v || 0);
  const qty = v => nf.format(v || 0);
  const round2 = v => Math.round((+v || 0) * 100) / 100;
  const num = v => { const x = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(x) ? x : 0; };
  const norm = s => String(s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
  const compact = v => {
    v = v || 0;
    if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + ' Cr';
    if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + ' L';
    return money(v);
  };
  const iso = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
  const fmtDate = s => s ? parse(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const daysFrom = s => Math.round((parse(s) - TODAY) / DAY);
  const addDays = (s, n) => iso(parse(s).getTime() + n * DAY);
  const expDays = exp => { if (!exp) return -1; const [y, m] = exp.split('-').map(Number); return Math.round((new Date(y, m, 0) - TODAY) / DAY); };
  const expToIso = e => {
    const m = String(e ?? '').trim().match(/^(\d{1,2})\s*[/\-.]\s*(\d{2}|\d{4})$/);
    if (!m) return '';
    const mo = +m[1]; if (mo < 1 || mo > 12) return '';
    let y = +m[2]; if (y < 100) y += 2000;
    return `${y}-${String(mo).padStart(2, '0')}`;
  };
  const isoToExp = s => s ? `${s.slice(5, 7)}/${s.slice(2, 4)}` : '—';
  const monthKey = s => s.slice(0, 7);
  const todayIso = iso(TODAY);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nextNo = (prefix, arr, field = 'no') => prefix + (Math.max(0, ...arr.map(x => +String(x[field]).replace(/\D/g, '') || 0)) + 1);
  const nextId = (prefix, arr, pad = 3) => prefix + String(Math.max(0, ...arr.map(x => +String(x.id).replace(/\D/g, '') || 0)) + 1).padStart(pad, '0');
  const lastMonths = n => {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - i, 1);
      out.push({ key: iso(d).slice(0, 7), label: d.toLocaleDateString('en-IN', { month: 'short' }) });
    }
    return out;
  };
  function rng(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ---------- Bill maths (same method as the printed sale bill) ----------
  // Amount = Qty × Rate; CD on amount; TD on amount after CD; GST on the taxable value.
  function calcLine(l) {
    const amount = round2(num(l.qty) * num(l.rate));
    const cdA = amount * num(l.cd) / 100;
    const tdA = (amount - cdA) * num(l.td) / 100;
    const taxable = amount - cdA - tdA;
    return { amount, cdA, tdA, taxable, gstA: taxable * num(l.gst) / 100 };
  }
  function billCalc(lines) {
    let gross = 0, cd = 0, td = 0, taxable = 0, gst = 0; const slabs = {};
    lines.forEach(l => {
      const c = calcLine(l);
      gross += c.amount; cd += c.cdA; td += c.tdA; taxable += c.taxable; gst += c.gstA;
      const k = num(l.gst); slabs[k] = slabs[k] || { taxable: 0, gst: 0 };
      slabs[k].taxable += c.taxable; slabs[k].gst += c.gstA;
    });
    const pre = taxable + gst, net = Math.round(pre);
    Object.values(slabs).forEach(s => { s.taxable = round2(s.taxable); s.gst = round2(s.gst); });
    return { gross: round2(gross), cd: round2(cd), td: round2(td), taxable: round2(taxable), cgst: round2(gst / 2), sgst: round2(gst / 2), gst: round2(gst), roundOff: round2(net - pre), total: net, slabs };
  }

  // Towns used in the sample data → district
  const TOWN_DISTRICT = { Ghumarwin: 'Bilaspur', Bilaspur: 'Bilaspur', Hamirpur: 'Hamirpur', Mandi: 'Mandi', Barsar: 'Hamirpur', Bhoranj: 'Hamirpur', Una: 'Una', Sundernagar: 'Mandi', Dharamshala: 'Kangra', Baddi: 'Solan' };
  const seedAddr = town => ({ district: TOWN_DISTRICT[town] || '', tehsil: town, subTehsil: '', locality: town, address: '', pincode: '', hospital: '', city: town });

  // ---------- Sample data ----------
  function seed() {
    const r = rng(20261127);
    const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
    const pick = a => a[Math.floor(r() * a.length)];
    const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const letters = n => Array.from({ length: n }, () => pick(L)).join('');
    const digits = n => Array.from({ length: n }, () => ri(0, 9)).join('');
    const gstin = () => `02${letters(5)}${digits(4)}${pick(L)}1Z${pick(L)}`;
    const phone = () => `9${ri(6, 9)}${digits(8)}`;

    const companies = ['LUPIN', 'ADDI B', 'TORRENT', 'SUN PHARMA', 'IPCA LAB'].map((name, i) => ({ id: 'M' + String(i + 1).padStart(2, '0'), name }));
    const categories = ['Medicinal', 'Cosmetic / Derma', 'Nutraceutical', 'Diabetes & Insulin', 'Ayurvedic', 'Surgical', 'OTC / FMCG']
      .map((name, i) => ({ id: 'K' + String(i + 1).padStart(2, '0'), name }));
    const forms = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Pen', 'Cream', 'Lotion', 'Oral solution', 'Drops', 'Sachet', 'Device', 'Other']
      .map((name, i) => ({ id: 'F' + String(i + 1).padStart(2, '0'), name }));
    const co = n => companies.find(c => c.name === n).id;
    const ca = n => categories.find(c => c.name === n).id;

    const suppliers = [
      ['Himachal Pharma Distributors', 'Rajesh Thakur', 'Hamirpur', 30],
      ['Shivalik Medical Agencies', 'Anjali Verma', 'Mandi', 21],
      ['Baddi Pharma Traders', 'Naveen Sharma', 'Baddi', 45],
      ['Kangra Drug House', 'Pankaj Katoch', 'Dharamshala', 30],
      ['Una Medicos Wholesale', 'Sunita Rana', 'Una', 30],
    ].map((s, i) => ({ id: 'S' + String(i + 1).padStart(3, '0'), name: s[0], contact: s[1], ...seedAddr(s[2]), phone: phone(), fssai: '1' + digits(13), fssaiValid: iso(TODAY.getTime() + ri(200, 1500) * DAY), gstin: gstin(), dl1: `HP-20B-${digits(5)}`, dl2: `HP-21B-${digits(5)}`, dlValid: iso(TODAY.getTime() + ri(120, 1500) * DAY), terms: s[3] }));

    // Items as printed on the sample sale bill: name, company, mfg, pack, hsn, batch, exp, qty, rate, mrp, gst, category, form
    const BILL = [
      ['BASUGINE PEN', 'LUPIN', 'LUPIN', '1PACK', '90183100', 'A25036CL', '01/29', 1, 823.57, 1153.00, 12, 'Diabetes & Insulin', 'Pen'],
      ['BASUGINE PEN', 'LUPIN', '', '1PACK', '90183100', 'A25048CL', '01/29', 4, 823.57, 1153.00, 12, 'Diabetes & Insulin', 'Pen'],
      ['SATPAM PLUS 15TAB', 'ADDI B', '', '15TAB', '30049099', 'AT2404098', '03/26', 10, 185.39, 259.54, 12, 'Medicinal', 'Tablet'],
      ['CARE NGT 2.6', 'ADDI B', '', '30TAB', '30049099', 'AT2504123D', '03/27', 15, 171.43, 240.00, 12, 'Medicinal', 'Tablet'],
      ['ADDI-D3 NANO SHOT 4*5ML', 'ADDI B', '', '1', '30049099', 'E25385', '04/27', 20, 210.00, 294.00, 12, 'Nutraceutical', 'Oral solution'],
      ['LUPISULIN-R 40 INJ', 'LUPIN', 'M.J.BI', '10ML', '30043110', 'AO32515014', '04/27', 10, 145.16, 181.45, 5, 'Diabetes & Insulin', 'Injection'],
      ['DILNIP 10MG 15TAB', 'LUPIN', '', '15TAB', '30049099', 'DNL250608', '05/27', 20, 171.36, 239.90, 12, 'Medicinal', 'Tablet'],
      ['RESTBRO D 10TAB', 'ADDI B', '', '10TAB', '30049099', 'AT2502176D', '01/27', 20, 189.19, 264.86, 12, 'Medicinal', 'Tablet'],
      ['ADENO PLUS XT 10TAB', 'ADDI B', '', '10TAB', '30049099', 'AT2503004', '08/26', 10, 113.57, 159.00, 12, 'Nutraceutical', 'Tablet'],
      ['AJADUO 25/5MG TAB', 'LUPIN', 'LUPIN', '10TAB', '300490', 'JB01390', '05/27', 10, 148.43, 207.80, 12, 'Diabetes & Insulin', 'Tablet'],
      ['NIKORAN-5MG TAB', 'TORRENT', '', '20TAB', '30049099', '2964M011', '11/26', 10, 343.04, 480.25, 12, 'Medicinal', 'Tablet'],
      ['MOISTUREX 100G', 'SUN PHARMA', 'SUN', '100 GM', '300490', 'SXG1212A', '05/27', 5, 214.29, 300.00, 12, 'Cosmetic / Derma', 'Cream'],
      ['MOISTUREX SOFT LOTION 100ML', 'SUN PHARMA', 'SUN', '100ML', '300490', 'JNC0012', '02/27', 5, 296.43, 415.00, 12, 'Cosmetic / Derma', 'Lotion'],
      ['ARZU 10MG TAB', 'LUPIN', '', '10TAB', '300490', 'AR250302', '02/27', 10, 164.75, 230.65, 12, 'Medicinal', 'Tablet'],
      ['ARZU 5MG 10TAB', 'LUPIN', 'LUPIN', '10TAB', '30049099', '06TAF001', '01/27', 10, 69.29, 97.00, 12, 'Medicinal', 'Tablet'],
      ['DARTVIT GOLD 15TAB', 'ADDI B', '', '15TAB', '30049099', '129D250293', '03/27', 10, 258.00, 361.20, 12, 'Nutraceutical', 'Tablet'],
      ['TORSTAR PLUS LS10 15TAB', 'ADDI B', '', '15TAB', '30049079', 'AT2501228A', '12/26', 7, 63.79, 89.30, 12, 'Medicinal', 'Tablet'],
      ['TORSTAR PLUS LS10 15TAB', 'ADDI B', '', '15TAB', '30049079', 'AT2504133B', '03/27', 3, 63.79, 89.30, 12, 'Medicinal', 'Tablet'],
      ['TORSTAR PLUS-10 15TAB', 'ADDI B', '', '15TAB', '30049079', 'AT2502145', '01/27', 10, 67.86, 95.00, 12, 'Medicinal', 'Tablet'],
      ['ISONORM - 30MG SR TAB', 'LUPIN', 'LUPIN', '10TAB', '300490', 'M250600', '03/27', 10, 46.57, 65.20, 12, 'Medicinal', 'Tablet'],
      ['PERISET SYP', 'IPCA LAB', 'IPCA', '30ML', '300490', 'EUT1125009AM', '03/27', 9, 30.72, 43.00, 12, 'Medicinal', 'Syrup'],
      ['DIPEXTIL-CV 325', 'ADDI B', '', '10TAB', '30049099', 'T250094G', '07/26', 5, 243.57, 341.00, 12, 'Medicinal', 'Tablet'],
      ['VINICOR XL 50MG TAB', 'IPCA LAB', 'IPCA', '10TAB', '300490', 'IAM0425001BH', '03/27', 10, 47.53, 66.53, 12, 'Medicinal', 'Tablet'],
      ['VINICOR XL 25MG TAB', 'IPCA LAB', '', '10TAB', '300490', 'IAO0425002BH', '03/27', 10, 34.56, 48.38, 12, 'Medicinal', 'Tablet'],
      ['LEFNO-20MG TAB', 'IPCA LAB', 'IPCA', '10TAB', '300490', 'GOV0125005AS', '09/27', 10, 230.68, 322.95, 12, 'Medicinal', 'Tablet'],
      ['ULYSES 300MG 15TAB', 'LUPIN', '', '15TAB', '300490', 'TB-042414', '03/26', 10, 525.91, 690.25, 5, 'Medicinal', 'Tablet'],
      ['PEGALUP 200ML', 'LUPIN', '', '200ML', '300490', 'A25011SD', '05/27', 4, 335.82, 470.15, 12, 'Medicinal', 'Syrup'],
    ];
    const products = [], batches = [];
    BILL.forEach(b => {
      let p = products.find(x => x.name === b[0]);
      if (!p) {
        p = {
          id: 'P' + String(products.length + 1).padStart(3, '0'), name: b[0], companyId: co(b[1]), mfg: b[2] || b[1], categoryId: ca(b[11]), form: b[12],
          pack: b[3], hsn: b[4], gst: b[10], mrp: b[9], ptr: b[8], pts: round2(b[8] * 0.9), reorder: Math.max(5, b[7] * 2),
        };
        products.push(p);
      } else if (!p.mfg && b[2]) p.mfg = b[2];
      batches.push({
        id: uid() + batches.length, productId: p.id, batch: b[5], expiry: expToIso(b[6]), qty: b[7] * ri(2, 6), free: 0,
        rate: p.pts, mrp: b[9], cd: 2, td: 0, gst: b[10], supplierId: pick(suppliers).id, source: 'Opening stock', verified: true,
      });
    });
    // a few batches with free goods and low stock to show alerts
    batches[4].free = 4; batches[9].free = 2;
    batches.filter(b => b.productId === 'P005' || b.productId === 'P020').forEach(b => { b.qty = 3; });

    const chemists = [
      ['Jai Durga Medicos', 'Rakesh Kumar', 'Ghumarwin'],
      ['Shiv Shakti Pharmacy', 'Meena Devi', 'Bilaspur'],
      ['Gupta Medical Hall', 'Ashok Gupta', 'Hamirpur'],
      ['New Life Chemist', 'Vikas Sood', 'Mandi'],
      ['Sharma Medicos', 'Deepak Sharma', 'Barsar'],
      ['Himalaya Medical Store', 'Kamal Chandel', 'Bhoranj'],
      ['Om Medicos', 'Sanjay Rana', 'Una'],
      ['City Care Pharmacy', 'Neha Guleria', 'Bilaspur'],
      ['Thakur Medical Agency', 'Ravi Thakur', 'Sundernagar'],
      ['Kailash Chemist', 'Pritam Singh', 'Ghumarwin'],
    ].map((c, i) => ({
      id: 'C' + String(i + 1).padStart(3, '0'), name: c[0], owner: c[1], ...seedAddr(c[2]), phone: phone(), ...(i % 3 === 0 ? { fssai: '2' + digits(13), fssaiValid: iso(TODAY.getTime() + ri(90, 1500) * DAY) } : {}),
      dl1: `HP-${c[2].slice(0, 3).toUpperCase()}-20-${digits(5)}`, dl2: `HP-${c[2].slice(0, 3).toUpperCase()}-21-${digits(5)}`, dlValid: iso(TODAY.getTime() + (i === 4 ? 25 : ri(120, 1500)) * DAY), gstin: gstin(),
      creditLimit: pick([100000, 150000, 200000, 300000]), terms: pick([14, 21, 30]), cd: 2, td: 0,
      joined: iso(TODAY.getTime() - ri(200, 900) * DAY), status: i === 9 ? 'Pending verification' : i === 6 ? 'On hold' : 'Active',
    }));
    chemists[9].joined = iso(TODAY.getTime() - 3 * DAY);

    const people = [['Ramesh Chand', 'Ghumarwin'], ['Sunita Devi', 'Bilaspur'], ['Mohan Lal', 'Bajoha'], ['Kiran Bala', 'Ghumarwin']];

    // Sales (historical — stock above is already net of these)
    const sales = [];
    const activeChem = chemists.filter(c => c.status === 'Active');
    const saleDates = Array.from({ length: 90 }, () => iso(TODAY.getTime() - ri(0, 179) * DAY)).sort();
    saleDates.forEach((d, i) => {
      const individual = r() < 0.18;
      const c = individual ? null : (r() < 0.45 ? activeChem[ri(0, 2)] : pick(activeChem));
      const used = new Set(); const lines = [];
      const n = individual ? ri(1, 2) : ri(2, 5);
      while (lines.length < n) {
        const b = pick(batches); if (used.has(b.id)) continue; used.add(b.id);
        const p = products.find(x => x.id === b.productId);
        const q = individual ? ri(1, 3) : ri(2, 12);
        lines.push({ productId: p.id, batchId: b.id, batch: b.batch, expiry: b.expiry, qty: q, free: 0, rate: individual ? round2(p.mrp / (1 + p.gst / 100)) : p.ptr, mrp: b.mrp, cd: individual ? 0 : 2, td: 0, gst: b.gst, alloc: { fromQty: q, fromFree: 0 } });
      }
      const t = billCalc(lines);
      const age = -daysFrom(d);
      let paid = 0; const x = r();
      if (individual) paid = t.total;
      else if (age > 45) paid = x < 0.93 ? t.total : Math.round(t.total * 0.5);
      else if (age > 15) paid = x < 0.6 ? t.total : x < 0.8 ? Math.round(t.total * 0.5) : 0;
      else paid = x < 0.3 ? t.total : x < 0.5 ? Math.round(t.total * 0.4) : 0;
      const party = individual ? { type: 'individual', name: pick(people)[0], phone: phone() } : { type: 'chemist', chemistId: c.id };
      sales.push({ no: 'SMS-' + (4001 + i), date: d, party, lines, ...t, paid, mode: individual ? 'Cash' : 'Credit' });
    });

    // Purchase orders, goods receipts and purchase invoices (history)
    const pos = [], grns = [], pinvoices = [];
    const poCount = 14;
    for (let i = 0; i < poCount; i++) {
      const date = iso(TODAY.getTime() - Math.round(170 - i * (167 / (poCount - 1))) * DAY);
      const s = suppliers[i % suppliers.length];
      const used = new Set(); const lines = [];
      const n = ri(3, 6);
      while (lines.length < n) {
        const p = pick(products); if (used.has(p.id)) continue; used.add(p.id);
        lines.push({ productId: p.id, qty: ri(2, 8) * 10, rate: p.pts, gst: p.gst });
      }
      const po = { no: 'PO-' + (2001 + i), date, expected: addDays(date, 7), supplierId: s.id, lines, ...billCalc(lines), status: 'Open' };
      pos.push(po);
      const fromEnd = poCount - 1 - i;
      if (fromEnd < 2) continue;
      const partial = fromEnd === 2;
      const gDate = addDays(date, ri(3, 6));
      const gLines = lines.map(l => {
        const p = products.find(x => x.id === l.productId);
        return { productId: l.productId, batch: letters(2) + digits(5), expiry: iso(new Date(TODAY.getFullYear() + 1, TODAY.getMonth() + ri(0, 18), 1)).slice(0, 7), qty: partial ? Math.round(l.qty / 2) : l.qty, free: 0, rate: l.rate, mrp: p.mrp, cd: 0, td: 0, gst: p.gst };
      });
      po.status = partial ? 'Partially received' : 'Received';
      const g = { no: 'GRN-' + (3001 + grns.length), date: gDate, poNo: po.no, supplierId: s.id, challan: 'DC/' + digits(5), lines: gLines, ...billCalc(gLines), invoiced: '' };
      grns.push(g);
      if (fromEnd < 4) continue;
      const piDate = addDays(gDate, ri(0, 2));
      const due = addDays(piDate, s.terms);
      const paid = daysFrom(due) < 0 ? (r() < 0.85 ? g.total : Math.round(g.total * 0.5)) : (r() < 0.3 ? g.total : 0);
      pinvoices.push({ no: 'PI-' + (4001 + pinvoices.length), supplierInvNo: s.name.slice(0, 3).toUpperCase() + '/' + digits(5), date: piDate, due, supplierId: s.id, grnNo: g.no, source: 'GRN', ...billCalc(gLines), paid });
      g.invoiced = pinvoices[pinvoices.length - 1].no;
    }

    const settings = {
      firm: { name: 'Shankar Medical Store', district: 'Bilaspur', tehsil: 'Ghumarwin', subTehsil: '', locality: 'Bajoha', address: '', pincode: '174021', hospital: '', city: 'Bajoha', phone: '01978-315172', gstin: '02AFNFS3835D1Z4', dl1: '20B 20160', dl2: '21B 20161' },
      defaultCd: 2, individualTerms: 0,
    };
    return { version: 2, settings, companies, categories, forms, products, batches, chemists, suppliers, sales, pos, grns, pinvoices };
  }

  function load() {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  // Server mode (node server.js): data lives on the server and is shared with the chemist portal.
  // Browser-only mode (any static server): data lives in this browser's localStorage.
  let SERVER = false, serverRev = 0, saveTimer = null, saving = false, saveAgain = false, saveBlocked = false;
  async function api(method, url, body) {
    const r = await fetch(url, { method, cache: 'no-store', headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (r.status === 401) { location.href = 'login.html'; throw new Error('Please log in again.'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || `Server error (${r.status})`), { status: r.status });
    return data;
  }
  async function pushToServer() {
    if (saving) { saveAgain = true; return; }
    saving = true;
    try {
      const r = await api('PUT', 'api/db', { rev: serverRev, data: db });
      serverRev = r.rev;
    } catch (err) {
      if (err.status === 409) { saveBlocked = true; showBanner('This data was changed in another window or by another person. <a href="./">Reload</a> to see the latest — changes made here since then were not saved.'); }
      else showBanner(`Could not save to the server: ${esc(err.message)}. Your last change is not saved yet — it will retry on the next change.`);
    } finally {
      saving = false;
      if (saveAgain) { saveAgain = false; pushToServer(); }
    }
  }
  function save() {
    if (SERVER) {
      if (saveBlocked) return;
      clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveTimer = null; pushToServer(); }, 250);
      return;
    }
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { toast('Could not save — browser storage is full or blocked.'); }
  }
  function showBanner(html) {
    let b = $('#banner');
    if (!b) { b = document.createElement('div'); b.id = 'banner'; b.className = 'banner'; $('.main').prepend(b); }
    b.innerHTML = html;
  }
  const getApiKey = () => { try { return localStorage.getItem(KEY_API) || ''; } catch { return ''; } };
  const setApiKey = k => { try { if (k) localStorage.setItem(KEY_API, k); else localStorage.removeItem(KEY_API); } catch { /* storage unavailable */ } };

  let db = null;
  // Chemist orders and portal logins (server mode only)
  let chemOrders = [];
  let portalLogins = {};
  async function loadOrders() {
    if (!SERVER) return;
    try {
      const prev = JSON.stringify(chemOrders);
      const before = new Set(chemOrders.map(o => o.id));
      chemOrders = await api('GET', 'api/orders');
      if (JSON.stringify(chemOrders) === prev) return;
      const fresh = chemOrders.filter(o => !before.has(o.id) && o.status === 'New');
      if (loadOrders.done && fresh.length) toast(`New order from ${chem(fresh[0].chemistId)?.name || 'a chemist'} — see Chemist Orders.`);
      loadOrders.done = true;
      const busy = $('#modalBack').classList.contains('open') || document.activeElement?.matches('input, select, textarea');
      if (!busy && ['chemorders', 'overview'].includes(route) && searchQuery.length < 2) render();
      else renderNav(searchQuery.length >= 2 ? '' : route === 'folder' ? 'suppliers' : route);
    } catch { /* will retry on the next poll */ }
  }
  async function loadLogins() {
    if (!SERVER) return;
    try { portalLogins = await api('GET', 'api/logins'); } catch { portalLogins = {}; }
  }

  // ---------- Lookups & derived data ----------
  const prod = id => db.products.find(p => p.id === id);
  const chem = id => db.chemists.find(c => c.id === id);
  const sup = id => db.suppliers.find(s => s.id === id);
  const company = id => db.companies.find(c => c.id === id);
  const category = id => db.categories.find(c => c.id === id);
  const batchById = id => db.batches.find(b => b.id === id);
  const avail = b => (b.qty || 0) + (b.free || 0);
  const sellableBatches = pid => db.batches.filter(b => b.productId === pid && avail(b) > 0 && expDays(b.expiry) >= 0).sort((a, b) => a.expiry.localeCompare(b.expiry));
  const sellableQty = pid => sellableBatches(pid).reduce((a, b) => a + avail(b), 0);
  const batchAmount = b => round2((b.qty || 0) * (b.rate || 0));
  const stockValue = () => db.batches.filter(b => expDays(b.expiry) >= 0).reduce((a, b) => a + batchAmount(b), 0);
  const balance = d => Math.max(0, round2(d.total - (d.paid || 0)));
  const partyName = s => s.party.type === 'chemist' ? (chem(s.party.chemistId)?.name || 'Unknown chemist') : (s.party.name || 'Individual');
  const partyCity = s => s.party.type === 'chemist' ? (chem(s.party.chemistId)?.city || '') : (s.party.phone || '');
  const saleStatus = s => {
    if (balance(s) <= 0.5) return 'Paid';
    const terms = s.party.type === 'chemist' ? (chem(s.party.chemistId)?.terms ?? 30) : (db.settings.individualTerms ?? 0);
    if (-daysFrom(s.date) > terms) return 'Overdue';
    return s.paid > 0 ? 'Partial' : 'Due';
  };
  const piStatus = p => {
    if (balance(p) <= 0.5) return 'Paid';
    if (daysFrom(p.due) < 0) return 'Overdue';
    return p.paid > 0 ? 'Partial' : 'Unpaid';
  };
  const batchStatus = b => { const d = expDays(b.expiry); return d < 0 ? 'Expired' : d <= 90 ? 'Near expiry' : 'Good'; };
  const receivedQty = (poNo, pid) => db.grns.filter(g => g.poNo === poNo).flatMap(g => g.lines).filter(l => l.productId === pid).reduce((a, l) => a + l.qty, 0);
  const chemOutstanding = cid => db.sales.filter(s => s.party.chemistId === cid).reduce((a, s) => a + balance(s), 0);
  const supPayable = sid => db.pinvoices.filter(p => p.supplierId === sid).reduce((a, p) => a + balance(p), 0);
  const lowStock = () => db.products.filter(p => sellableQty(p.id) < p.reorder);
  const sumBy = (arr, pred, f = x => x.total) => arr.filter(pred).reduce((a, x) => a + f(x), 0);
  const pctChange = (a, b) => b ? Math.round((a - b) / b * 100) : 0;
  const findProductByName = name => db.products.find(p => norm(p.name) === norm(name));
  function findOrCreateCompany(name) {
    if (!norm(name)) return '';
    let c = db.companies.find(x => norm(x.name) === norm(name));
    if (!c) { c = { id: nextId('M', db.companies, 2), name: norm(name) }; db.companies.push(c); }
    return c.id;
  }
  function guessForm(name, pack) {
    const s = norm(name + ' ' + pack);
    if (/\bPEN\b/.test(s)) return 'Pen';
    if (/INJ|VIAL|AMP/.test(s)) return 'Injection';
    if (/SYP|SYRUP|SUSP/.test(s)) return 'Syrup';
    if (/LOTION/.test(s)) return 'Lotion';
    if (/CREAM|GEL|OINT|\bGM\b|\d+G\b/.test(s)) return 'Cream';
    if (/DROP/.test(s)) return 'Drops';
    if (/SACHET/.test(s)) return 'Sachet';
    if (/CAP/.test(s)) return 'Capsule';
    if (/TAB/.test(s)) return 'Tablet';
    if (/ML\b/.test(s)) return 'Syrup';
    return 'Other';
  }
  const defaultCategoryId = () => (db.categories.find(c => c.name === 'Medicinal') || db.categories[0])?.id || '';
  const salePtr = (mrp, gst) => round2(num(mrp) / (1 + num(gst) / 100) * 0.8);

  const PILL = {
    Paid: 'ok', Partial: 'info', Due: 'warn', Overdue: 'bad', Unpaid: 'warn',
    Open: 'info', 'Partially received': 'warn', Received: 'ok', Cancelled: 'neutral',
    Invoiced: 'ok', 'Awaiting invoice': 'warn',
    Active: 'ok', 'Pending verification': 'warn', 'On hold': 'bad',
    Good: 'ok', 'Near expiry': 'warn', Expired: 'bad', 'Low stock': 'warn', 'Out of stock': 'bad', 'In stock': 'ok',
    PO: 'info', GRN: 'ok', Invoice: 'neutral', Chemist: 'info', Individual: 'neutral',
    New: 'info', Accepted: 'info', Arranging: 'warn', Billed: 'ok', Rejected: 'bad', Off: 'neutral', 'All in stock': 'ok', 'Not stocked': 'bad', 'Limited stock': 'warn', 'Not in stock': 'bad',
    Verified: 'ok', 'Needs check': 'warn', OK: 'ok', Check: 'warn', Error: 'bad', AI: 'info', CSV: 'info', Manual: 'neutral',
  };
  const pill = s => `<span class="pill ${PILL[s] || (/^Short/.test(s) || / short$/.test(s) ? 'warn' : 'neutral')}">${esc(s)}</span>`;

  // ---------- Icons ----------
  const ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9h18"/><path d="M12 12v5M9.5 14.5h5"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    pill: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M8.5 8.5l7 7"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11.5l2-8H6.2"/>',
    truck: '<path d="M1 6h13v10H1z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="5" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h3"/>',
    check: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5"/><path d="M15 18l2 2 4-4"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
    upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    clip: '<path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    rupee: '<path d="M7 4h10M7 9h10M7 4c6 0 6 9 0 9l7 7"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
  const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;

  // ---------- Navigation ----------
  const NAV = [
    { group: 'Dashboard', items: [['overview', 'Overview', 'grid']] },
    { group: 'Sales', items: [['sales', 'Sales', 'trend'], ['chemorders', 'Chemist Orders', 'cart'], ['chemists', 'Onboard Chemists', 'store']] },
    { group: 'Inventory', items: [['stock', 'Stock Details', 'box'], ['products', 'Products & Masters', 'pill']] },
    { group: 'Purchase', items: [['purchase', 'Purchase', 'cart'], ['billentry', 'Bill Upload / Entry', 'spark'], ['suppliers', 'Supplier Details', 'truck'], ['orders', 'Purchase Orders', 'clipboard'], ['grn', 'Goods Receipt (GRN)', 'check'], ['invoices', 'Purchase Invoices', 'file']] },
  ];
  const SUBTITLES = {
    overview: 'Your business at a glance',
    sales: 'Bills to chemists and individual customers — stock is deducted automatically',
    chemists: 'Retail chemists onboarded for B2B supply, with their portal logins',
    chemorders: 'Orders placed by chemists on their portal',
    stock: 'Batch-wise stock in bill format',
    products: 'Products, companies, categories and forms',
    purchase: 'Purchase summary across suppliers',
    billentry: 'Upload a bill photo or PDF, check every line, then add it to stock',
    suppliers: 'Distributors and stockists you buy from',
    orders: 'Orders placed with suppliers',
    grn: 'Goods received against purchase orders',
    invoices: 'Supplier bills and payments due',
    search: 'Search results',
    folder: 'Every bill from this supplier, and what was bought when',
  };

  function renderNav(route) {
    const badges = {
      orders: db.pos.filter(p => p.status === 'Open' || p.status === 'Partially received').length,
      stock: db.batches.filter(b => avail(b) > 0 && (batchStatus(b) !== 'Good' || !b.verified)).length,
      chemists: db.chemists.filter(c => c.status === 'Pending verification').length,
      grn: db.grns.filter(g => !g.invoiced).length,
      billentry: entry && entry.lines.length ? '•' : 0,
      chemorders: chemOrders.filter(o => o.status === 'New').length,
    };
    $('#nav').innerHTML = NAV.map(g => `
      <div class="nav-group-title">${g.group}</div>
      <div class="nav">${g.items.filter(([id]) => SERVER || id !== 'chemorders').map(([id, label, ic]) => `
        <button type="button" data-nav="${id}" class="${route === id ? 'active' : ''}">${icon(ic)}<span>${label}</span>${badges[id] ? `<span class="badge-n">${badges[id]}</span>` : ''}</button>`).join('')}
      </div>`).join('');
    $('#brandName').textContent = db.settings.firm.name || 'Pharma Suite';
    $('#brandMark').textContent = (db.settings.firm.name || 'P').trim().charAt(0).toUpperCase();
  }

  // ---------- Building blocks ----------
  const kpi = (label, value, foot = '') => `<div class="card kpi"><div class="kpi-label"><span class="dot"></span>${label}</div><div class="kpi-value num">${value}</div><div class="kpi-foot">${foot}</div></div>`;
  const trendFoot = (cur, prev, text = 'vs last month') => {
    const p = pctChange(cur, prev);
    return `<span class="${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%</span> ${text}`;
  };
  const actBtn = (act, id, label, cls = '') => `<button type="button" class="btn sm ${cls}" data-act="${act}" data-id="${esc(id)}">${label}</button>`;
  const rowActs = (...btns) => `<div class="row-acts">${btns.filter(Boolean).join('')}</div>`;

  function table(columns, rows, empty = 'Nothing to show yet.', foot = '') {
    if (!rows.length) return `<div class="empty">${empty}</div>`;
    return `<table><thead><tr>${columns.map(c => `<th class="${c.r ? 'r' : ''}">${c.h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row, i) => `<tr>${columns.map(c => `<td class="${c.r ? 'r num' : ''}">${c.c(row, i)}</td>`).join('')}</tr>`).join('')}</tbody>${foot}</table>`;
  }

  // Generic list card: tabs, search, dropdown filters, and (optionally) checkbox selection with a bulk-edit bar.
  // cfg.filters: [{ k, label, options: [[value, label]], test(row, value) }]
  // cfg.select:  { id(row), fields: [{ k, label, type: 'pct' | 'gst' | 'select', options? }], apply?(items, vals), extra?, actions? }
  const lists = {};
  const listState = {};
  const bulkInput = (key, f) => {
    const name = `data-bulk="${key}|${f.k}"`;
    if (f.type === 'select') return `<label class="bf"><span>${f.label}</span><select ${name}><option value="">— keep —</option>${f.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>`;
    return `<label class="bf"><span>${f.label}</span><input ${name} inputmode="decimal" placeholder="—" ${f.type === 'gst' ? 'list="dl-gst"' : ''}></label>`;
  };
  function useList(cfg) {
    lists[cfg.key] = cfg;
    const st = listState[cfg.key] || (listState[cfg.key] = { q: '', tab: cfg.tabs ? cfg.tabs[0].id : null, f: {}, sel: new Set(), visible: [] });
    const k = cfg.key;
    return `<section class="card">
      <div class="card-head">
        <h2 class="card-title">${cfg.title}</h2><span class="hint" id="cnt-${k}"></span>
        <div class="spacer"></div>
        <div class="toolbar">
          ${cfg.tabs ? `<div class="tabs" data-tabs="${k}">${cfg.tabs.map(t => `<button type="button" data-tab="${t.id}" class="${st.tab === t.id ? 'active' : ''}">${t.label}</button>`).join('')}</div>` : ''}
          ${cfg.noSearch ? '' : `<label class="search">${icon('search')}<input data-list-search="${k}" value="${esc(st.q)}" placeholder="Search…"></label>`}
          ${cfg.actions || ''}
        </div>
      </div>
      ${cfg.filters ? `<div class="filter-bar">${icon('filter')}${cfg.filters.map(f => `<label class="filter"><span>${f.label}</span><select data-list-filter="${k}|${f.k}"><option value="">All</option>${f.options.map(([v, l]) => `<option value="${esc(v)}" ${st.f[f.k] === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`).join('')}
        <button type="button" class="btn sm ghost ${Object.values(st.f).some(Boolean) ? '' : 'hidden'}" data-filter-clear="${k}" id="fclr-${k}">Clear filters</button></div>` : ''}
      ${cfg.select ? `<div class="bulk-bar hidden" id="bulk-${k}">
        <span class="bulk-n" id="bulkn-${k}"></span>
        ${cfg.select.fields.map(f => bulkInput(k, f)).join('')}
        <button type="button" class="btn sm primary" data-bulkapply="${k}">Apply to selected</button>
        ${cfg.select.extra || ''}
        <button type="button" class="btn sm ghost" data-bulkclear="${k}">Clear selection</button>
        <span class="small muted bulk-hint">Type a value to set it on every ticked row. Empty boxes are left as they are.</span>
      </div>` : ''}
      <div class="table-wrap" id="tbl-${k}"></div>
    </section>`;
  }
  function listRows(key) {
    const cfg = lists[key]; const st = listState[key];
    let rows = cfg.rows();
    if (cfg.tabs) { const t = cfg.tabs.find(t => t.id === st.tab); if (t && t.filter) rows = rows.filter(t.filter); }
    (cfg.filters || []).forEach(f => { const v = st.f[f.k]; if (v) rows = rows.filter(r => f.test(r, v)); });
    if (st.q) { const q = st.q.toLowerCase(); rows = rows.filter(r => cfg.text(r).toLowerCase().includes(q)); }
    return rows;
  }
  function fillList(key) {
    const cfg = lists[key]; const st = listState[key];
    const el = $('#tbl-' + key); if (!cfg || !el) return;
    const rows = listRows(key);
    let columns = cfg.columns;
    if (cfg.select) {
      const ids = rows.map(r => String(cfg.select.id(r)));
      st.visible = ids;
      const all = ids.length > 0 && ids.every(id => st.sel.has(id));
      columns = [{ h: `<input type="checkbox" class="cb" data-selall="${key}" ${all ? 'checked' : ''} aria-label="Select all shown rows">`, c: r => { const id = String(cfg.select.id(r)); return `<input type="checkbox" class="cb" data-sel="${key}" value="${esc(id)}" ${st.sel.has(id) ? 'checked' : ''} aria-label="Select row">`; } }, ...columns];
    }
    el.innerHTML = table(columns, rows, cfg.empty, cfg.foot ? cfg.foot(rows) : '');
    updateListMeta(key, rows.length);
  }
  function updateListMeta(key, shown) {
    const st = listState[key]; const cfg = lists[key];
    if (shown == null) shown = $$(`#tbl-${key} tbody tr`).length;
    const cnt = $('#cnt-' + key);
    if (cnt) cnt.textContent = `${shown} record${shown === 1 ? '' : 's'}${cfg.select && st.sel.size ? ` · ${st.sel.size} selected` : ''}`;
    $('#fclr-' + key)?.classList.toggle('hidden', !Object.values(st.f).some(Boolean));
    const bar = $('#bulk-' + key);
    if (bar) { bar.classList.toggle('hidden', !st.sel.size); $('#bulkn-' + key).textContent = `${st.sel.size} selected`; }
    const sa = $(`[data-selall="${key}"]`);
    if (sa) { const n = st.visible.filter(id => st.sel.has(id)).length; sa.checked = n > 0 && n === st.visible.length; sa.indeterminate = n > 0 && n < st.visible.length; }
  }
  const selectedItems = key => { const cfg = lists[key], st = listState[key]; return cfg.rows().filter(r => st.sel.has(String(cfg.select.id(r)))); };
  function bulkApply(key) {
    const cfg = lists[key]; const st = listState[key];
    const items = selectedItems(key);
    if (!items.length) { toast('Tick at least one row first.'); return; }
    const vals = {}; const said = [];
    for (const f of cfg.select.fields) {
      const el = $(`[data-bulk="${key}|${f.k}"]`); const raw = (el?.value || '').trim();
      if (raw === '') continue;
      if (f.type === 'select') { vals[f.k] = raw; said.push(`${f.label} ${f.options.find(o => String(o[0]) === raw)?.[1] || raw}`); continue; }
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0 || v > 100) { toast(`${f.label} must be a number from 0 to 100.`); el.focus(); return; }
      vals[f.k] = v; said.push(`${f.label} ${dec(v)}`);
    }
    if (!said.length) { toast('Type at least one value to apply.'); return; }
    const msg = cfg.select.apply ? cfg.select.apply(items, vals) : (items.forEach(it => Object.assign(it, vals)), null);
    st.sel.clear(); refresh();
    toast(msg || `${said.join(', ')} set on ${items.length} row${items.length === 1 ? '' : 's'}.`);
  }

  // Ready-made filters
  const byName = (a, b) => String(a[1]).localeCompare(String(b[1]));
  const PROD_FILTERS = {
    company: ['Company / brand', () => db.companies.map(c => [c.id, c.name]).sort(byName), (p, v) => p.companyId === v],
    category: ['Category', () => db.categories.map(c => [c.id, c.name]), (p, v) => p.categoryId === v],
    form: ['Type / form', () => db.forms.map(f => [f.name, f.name]), (p, v) => p.form === v],
    item: ['Item', () => db.products.map(p => [p.id, p.name]).sort(byName), (p, v) => p.id === v],
  };
  // getProds(row) returns the products on that row (one for a stock line, several for a bill)
  const prodFilters = (getProds, keys = ['company', 'category', 'form', 'item']) => keys.map(k => {
    const [label, opts, match] = PROD_FILTERS[k];
    return { k, label, options: opts(), test: (r, v) => getProds(r).some(p => p && match(p, v)) };
  });
  const monthLabel = k => parse(k + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const monthFilter = (dates, getDate) => ({ k: 'month', label: 'Month', options: [...new Set(dates.map(monthKey))].sort().reverse().map(m => [m, monthLabel(m)]), test: (r, v) => monthKey(getDate(r)) === v });
  const supplierFilter = getSid => ({ k: 'supplier', label: 'Supplier', options: db.suppliers.map(s => [s.id, s.name]).sort(byName), test: (r, v) => getSid(r) === v });
  const PCT_FIELDS = [{ k: 'cd', label: 'CD%', type: 'pct' }, { k: 'td', label: 'TD%', type: 'pct' }];
  const GST_FIELD = { k: 'gst', label: 'GST%', type: 'gst' };

  const niceMax = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
  const axisMoney = v => v >= 1e7 ? '₹' + +(v / 1e7).toFixed(1) + 'Cr' : v >= 1e5 ? '₹' + +(v / 1e5).toFixed(1) + 'L' : v >= 1e3 ? '₹' + +(v / 1e3).toFixed(0) + 'K' : '₹' + Math.round(v);
  function barChart(labels, series) {
    const W = 640, H = 250, Lp = 60, R = 12, T = 14, B = 30, iw = W - Lp - R, ih = H - T - B;
    const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const y = T + ih - ih * i / 4;
      g += `<line x1="${Lp}" x2="${W - R}" y1="${y}" y2="${y}" style="stroke:var(--line)" ${i ? 'stroke-dasharray="3 4"' : ''}/>`;
      g += `<text x="${Lp - 10}" y="${y + 4}" text-anchor="end">${axisMoney(max * i / 4)}</text>`;
    }
    const gw = iw / labels.length, n = series.length, gap = 4;
    const bw = Math.min(26, (gw * 0.6 - gap * (n - 1)) / n);
    labels.forEach((lb, i) => {
      const cx = Lp + gw * i + gw / 2;
      const start = cx - (n * bw + (n - 1) * gap) / 2;
      series.forEach((s, j) => {
        const v = s.values[i] || 0, bh = ih * v / max;
        g += `<rect x="${start + j * (bw + gap)}" y="${T + ih - bh}" width="${bw}" height="${bh}" rx="4" style="fill:${s.color}"><title>${s.label} · ${lb}: ${money(v)}</title></rect>`;
      });
      g += `<text x="${cx}" y="${H - 9}" text-anchor="middle">${lb}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">${g}</svg>`;
  }
  const legend = series => `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}</div>`;
  const barList = (items, cls = '') => {
    const max = Math.max(1, ...items.map(i => i.value));
    return `<div class="bar-list">${items.map(i => `<div class="bar-row"><div class="top"><span>${esc(i.label)}</span><span class="num strong">${compact(i.value)}</span></div><div class="bar-track"><div class="bar-fill ${cls}" style="width:${(i.value / max * 100).toFixed(1)}%"></div></div></div>`).join('') || '<div class="muted">No data yet.</div>'}</div>`;
  };

  const thisM = monthKey(todayIso);
  const prevM = monthKey(iso(new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1)));

  // ---------- Views ----------
  const VIEWS = {};

  VIEWS.overview = () => {
    const sM = sumBy(db.sales, s => monthKey(s.date) === thisM), sP = sumBy(db.sales, s => monthKey(s.date) === prevM);
    const purchDate = p => p.date;
    const pM = sumBy(db.pinvoices, p => monthKey(purchDate(p)) === thisM), pP = sumBy(db.pinvoices, p => monthKey(purchDate(p)) === prevM);
    const recv = db.sales.reduce((a, s) => a + balance(s), 0);
    const overdue = db.sales.filter(s => saleStatus(s) === 'Overdue');
    const months = lastMonths(6);
    const series = [
      { label: 'Sales', color: 'var(--brand)', values: months.map(m => sumBy(db.sales, s => monthKey(s.date) === m.key)) },
      { label: 'Purchases', color: 'var(--gold)', values: months.map(m => sumBy(db.pinvoices, p => monthKey(p.date) === m.key)) },
    ];
    const alerts = [];
    const unver = db.batches.filter(b => !b.verified && avail(b) > 0);
    if (unver.length) alerts.push(['info', 'spark', `${unver.length} stock lines added from bills need checking`, 'Open Stock Details → Needs check', 'stock']);
    const low = lowStock();
    if (low.length) alerts.push(['warn', 'alert', `${low.length} products below reorder level`, low.slice(0, 3).map(p => p.name).join(', ') + (low.length > 3 ? '…' : ''), 'stock']);
    const near = db.batches.filter(b => avail(b) > 0 && batchStatus(b) === 'Near expiry');
    if (near.length) alerts.push(['warn', 'clock', `${near.length} batches expiring within 90 days`, `Stock amount ${compact(near.reduce((a, b) => a + batchAmount(b), 0))}`, 'stock']);
    const exp = db.batches.filter(b => avail(b) > 0 && batchStatus(b) === 'Expired');
    if (exp.length) alerts.push(['bad', 'alert', `${exp.length} expired batches in stock`, 'Return to supplier or write off', 'stock']);
    if (overdue.length) alerts.push(['bad', 'rupee', `${overdue.length} overdue sale bills`, `${compact(overdue.reduce((a, s) => a + balance(s), 0))} to collect`, 'sales']);
    const openPo = db.pos.filter(p => p.status === 'Open' || p.status === 'Partially received');
    if (openPo.length) alerts.push(['info', 'truck', `${openPo.length} purchase orders awaiting delivery`, `Worth ${compact(openPo.reduce((a, p) => a + p.total, 0))}`, 'orders']);
    const dueSoon = db.pinvoices.filter(p => piStatus(p) !== 'Paid' && daysFrom(p.due) <= 7);
    if (dueSoon.length) alerts.push(['warn', 'file', `${dueSoon.length} supplier bills due within 7 days`, `${compact(dueSoon.reduce((a, p) => a + balance(p), 0))} payable`, 'invoices']);
    const lic = [[db.settings.firm.name + ' (your firm)', db.settings.firm], ...db.chemists.map(c => [c.name, c]), ...db.suppliers.map(s => [s.name, s])].filter(([, x]) => soon(x.dlValid) || soon(x.fssaiValid));
    if (lic.length) alerts.push(['warn', 'file', `${lic.length} drug/FSSAI licence${lic.length === 1 ? '' : 's'} expired or expiring within 60 days`, lic.map(x => x[0]).join(', '), 'chemists']);
    const newOrders = chemOrders.filter(o => o.status === 'New');
    if (newOrders.length) alerts.unshift(['info', 'cart', `${newOrders.length} new order${newOrders.length === 1 ? '' : 's'} from chemists`, newOrders.map(o => chem(o.chemistId)?.name || o.chemistId).join(', '), 'chemorders']);
    const pend = db.chemists.filter(c => c.status === 'Pending verification');
    if (pend.length) alerts.push(['info', 'store', `${pend.length} chemist awaiting verification`, pend.map(c => c.name).join(', '), 'chemists']);

    const since = addDays(todayIso, -90);
    const byParty = {};
    db.sales.filter(s => s.date >= since).forEach(s => { const k = partyName(s); byParty[k] = (byParty[k] || 0) + s.total; });
    const top = Object.entries(byParty).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }));
    const recent = [...db.sales].sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no)).slice(0, 7);

    return `
      <div class="grid g-4">
        ${kpi('Sales this month', compact(sM), trendFoot(sM, sP))}
        ${kpi('Purchases this month', compact(pM), trendFoot(pM, pP))}
        ${kpi('Stock amount (at purchase rate)', compact(stockValue()), `${db.products.filter(p => sellableQty(p.id) > 0).length} products · ${db.batches.filter(b => avail(b) > 0).length} batches`)}
        ${kpi('Receivables', compact(recv), overdue.length ? `<span class="down">${overdue.length} overdue</span> bills` : 'All bills within terms')}
      </div>
      <div class="grid g-2-1">
        <section class="card"><div class="card-head"><h2 class="card-title">Sales vs purchases</h2><span class="hint">Last 6 months</span><div class="spacer"></div>${legend(series)}</div>
          <div class="card-body">${barChart(months.map(m => m.label), series)}</div></section>
        <section class="card"><div class="card-head"><h2 class="card-title">Needs attention</h2></div>
          <div class="alert-list">${alerts.map(([k, ic, t, s, go]) => `
            <div class="alert-item"><div class="alert-icon ${k}">${icon(ic)}</div><div style="flex:1;min-width:0"><div class="strong">${esc(t)}</div><div class="small muted ellipsis">${esc(s)}</div></div><button type="button" class="btn ghost sm" data-nav="${go}">View</button></div>`).join('') || '<div class="empty">All clear.</div>'}
          </div></section>
      </div>
      <div class="grid g-2-1">
        <section class="card"><div class="card-head"><h2 class="card-title">Recent sales</h2><div class="spacer"></div><button type="button" class="btn sm" data-nav="sales">All sales</button>${actBtn('new-sale', '', icon('plus') + 'New sale', 'primary')}</div>
          <div class="table-wrap">${table([
            { h: 'Bill', c: s => `<span class="strong">${s.no}</span>` },
            { h: 'Date', c: s => fmtDate(s.date) },
            { h: 'Party', c: s => esc(partyName(s)) },
            { h: 'Amount', r: 1, c: s => money(s.total) },
            { h: 'Status', c: s => pill(saleStatus(s)) },
            { h: '', c: s => actBtn('view-sale', s.no, 'View', 'ghost') },
          ], recent)}</div></section>
        <section class="card"><div class="card-head"><h2 class="card-title">Top customers</h2><span class="hint">Last 90 days</span></div>
          <div class="card-body">${barList(top)}</div></section>
      </div>`;
  };

  VIEWS.sales = () => {
    const sM = sumBy(db.sales, s => monthKey(s.date) === thisM), sP = sumBy(db.sales, s => monthKey(s.date) === prevM);
    const cM = sumBy(db.sales, s => monthKey(s.date) === thisM, s => s.paid || 0);
    const out = db.sales.reduce((a, s) => a + balance(s), 0);
    const overdueAmt = db.sales.filter(s => saleStatus(s) === 'Overdue').reduce((a, s) => a + balance(s), 0);
    const nM = db.sales.filter(s => monthKey(s.date) === thisM).length;
    return `
      <div class="grid g-4">
        ${kpi('Sales this month', compact(sM), trendFoot(sM, sP))}
        ${kpi('Collected on this month’s bills', compact(cM), sM ? `${Math.round(cM / sM * 100)}% of billed` : '—')}
        ${kpi('Outstanding', compact(out), `<span class="down">${compact(overdueAmt)}</span> overdue`)}
        ${kpi('Bills this month', qty(nM), nM ? `Avg ${compact(sM / nM)} per bill` : '—')}
      </div>
      ${useList({
        key: 'sales', title: 'Sale bills',
        actions: actBtn('new-sale', '', icon('plus') + 'New sale', 'primary'),
        tabs: [{ id: 'all', label: 'All' }, { id: 'chem', label: 'Chemists', filter: s => s.party.type === 'chemist' }, { id: 'ind', label: 'Individuals', filter: s => s.party.type === 'individual' }, ...['Due', 'Overdue'].map(s => ({ id: s, label: s, filter: x => saleStatus(x) === s }))],
        filters: [...prodFilters(s => s.lines.map(l => prod(l.productId))), { k: 'chemist', label: 'Chemist', options: db.chemists.map(c => [c.id, c.name]).sort(byName), test: (s, v) => s.party.chemistId === v }, { k: 'district', label: 'District', options: usedValues('district').map(v => [v, v]), test: (s, v) => chem(s.party.chemistId)?.district === v }, monthFilter(db.sales.map(s => s.date), s => s.date)],
        rows: () => [...db.sales].sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no)),
        text: s => [s.no, partyName(s), partyCity(s), ...s.lines.map(l => prod(l.productId)?.name + ' ' + l.batch)].join(' '),
        columns: [
          { h: 'Bill no', c: s => `<span class="strong">${s.no}</span>` },
          { h: 'Date', c: s => fmtDate(s.date) },
          { h: 'Party', c: s => `${esc(partyName(s))}<div class="small muted">${esc(partyCity(s))}</div>` },
          { h: 'Type', c: s => pill(s.party.type === 'chemist' ? 'Chemist' : 'Individual') },
          { h: 'Items', r: 1, c: s => s.lines.length },
          { h: 'Net amount', r: 1, c: s => money(s.total) },
          { h: 'Received', r: 1, c: s => money(s.paid) },
          { h: 'Balance', r: 1, c: s => `<span class="${balance(s) > 0 ? 'strong' : 'muted'}">${money(balance(s))}</span>` },
          { h: 'Status', c: s => pill(saleStatus(s)) },
          { h: '', c: s => rowActs(actBtn('view-sale', s.no, 'View', 'ghost'), balance(s) > 0.5 && actBtn('pay-sale', s.no, 'Receive'), actBtn('edit-sale', s.no, 'Edit', 'ghost'), actBtn('del-sale', s.no, 'Delete', 'ghost danger')) },
        ],
      })}`;
  };

  VIEWS.chemists = () => {
    const active = db.chemists.filter(c => c.status === 'Active').length;
    const pend = db.chemists.filter(c => c.status === 'Pending verification').length;
    const out = db.chemists.reduce((a, c) => a + chemOutstanding(c.id), 0);
    const newM = db.chemists.filter(c => monthKey(c.joined) === thisM).length;
    return `
      <div class="grid g-4">
        ${kpi('Active chemists', qty(active), `${db.chemists.length} onboarded in total`)}
        ${kpi('Pending verification', qty(pend), 'Check drug licence and GSTIN')}
        ${kpi('Receivable from chemists', compact(out), 'Across all chemists')}
        ${kpi('Onboarded this month', qty(newM), 'New retail partners')}
      </div>
      ${useList({
        key: 'chemists', title: 'Chemists',
        actions: actBtn('new-chemist', '', icon('plus') + 'Onboard chemist', 'primary'),
        tabs: [{ id: 'all', label: 'All' }, ...['Active', 'Pending verification', 'On hold'].map(s => ({ id: s, label: s === 'Pending verification' ? 'Pending' : s, filter: c => c.status === s }))],
        rows: () => db.chemists,
        select: { id: c => c.id, fields: PCT_FIELDS, apply: (items, v) => { items.forEach(c => Object.assign(c, v)); return `Default ${Object.keys(v).map(k => k.toUpperCase() + ' ' + dec(v[k]) + '%').join(', ')} set for ${items.length} chemist(s). Used on their new bills.`; } },
        text: c => [c.id, c.name, c.owner, addrText(c), c.hospital, c.phone, c.dl1, c.dl2, c.fssai, c.gstin].join(' '),
        filters: [{ k: 'district', label: 'District', options: usedValues('district').map(v => [v, v]), test: (c, v) => c.district === v }, { k: 'tehsil', label: 'Tehsil', options: usedValues('tehsil').map(v => [v, v]), test: (c, v) => c.tehsil === v }],
        columns: [
          { h: 'Chemist', c: c => `<span class="strong">${esc(c.name)}</span><div class="small muted">${esc(c.owner)} · ${esc(c.id)}</div>` },
          { h: 'Area', c: c => `${esc(c.locality || c.city || '—')}<div class="small muted">${esc([c.tehsil && 'Teh. ' + c.tehsil, c.district].filter(Boolean).join(' · '))}</div>` },
          { h: 'Phone', c: c => esc(c.phone) },
          { h: 'Drug licence 1 / 2', c: c => licCell(c) },
          { h: 'GSTIN', c: c => `<span class="small">${esc(c.gstin || '—')}</span>` },
          { h: 'CD% / TD%', r: 1, c: c => `${dec(c.cd)} / ${dec(c.td)}` },
          { h: 'Credit limit', r: 1, c: c => money(c.creditLimit) },
          { h: 'Outstanding', r: 1, c: c => { const o = chemOutstanding(c.id); return `<span style="${o > c.creditLimit ? 'color:var(--bad);font-weight:600' : ''}">${money(o)}</span>`; } },
          { h: 'Status', c: c => pill(c.status) },
          ...(SERVER ? [{ h: 'Portal login', c: c => portalCell(c) }] : []),
          { h: '', c: c => rowActs(actBtn('view-chemist', c.id, 'View', 'ghost'), actBtn('edit-chemist', c.id, 'Edit', 'ghost'), actBtn('del-chemist', c.id, 'Delete', 'ghost danger')) },
        ],
      })}`;
  };

  // Orders placed by chemists on the portal
  const orderShort = l => l.productId ? Math.max(0, l.qty - sellableQty(l.productId)) : l.qty;
  VIEWS.chemorders = () => {
    const open = chemOrders.filter(o => ['New', 'Accepted', 'Arranging'].includes(o.status));
    const short = open.filter(o => o.lines.some(l => orderShort(l) > 0));
    return `
      <div class="grid g-4">
        ${kpi('New orders', qty(chemOrders.filter(o => o.status === 'New').length), 'Waiting for you to accept')}
        ${kpi('Open orders', qty(open.length), 'Accepted or being arranged')}
        ${kpi('Need stock', qty(short.length), 'Open orders with items short or not stocked')}
        ${kpi('Billed this month', qty(chemOrders.filter(o => o.status === 'Billed' && monthKey(o.date) === thisM).length), 'Orders turned into sale bills')}
      </div>
      ${useList({
        key: 'chemorders', title: 'Chemist orders',
        actions: `<button type="button" class="btn sm" data-act="orders-refresh" data-id="">Refresh</button>`,
        tabs: [{ id: 'open', label: 'Open', filter: o => ['New', 'Accepted', 'Arranging'].includes(o.status) }, ...['New', 'Arranging', 'Billed', 'Rejected', 'Cancelled'].map(s => ({ id: s, label: s, filter: o => o.status === s })), { id: 'all', label: 'All' }],
        filters: [{ k: 'chemist', label: 'Chemist', options: db.chemists.map(c => [c.id, c.name]).sort(byName), test: (o, v) => o.chemistId === v }, ...prodFilters(o => o.lines.map(l => prod(l.productId)), ['company', 'item'])],
        rows: () => [...chemOrders].sort((a, b) => b.created.localeCompare(a.created)),
        text: o => [o.id, chem(o.chemistId)?.name, o.note, ...o.lines.map(l => l.name)].join(' '),
        empty: chemOrders.length ? 'No orders in this view — try another tab.' : 'No orders yet. Chemists with a portal login can order from their phone or computer.',
        columns: [
          { h: 'Order', c: o => `<span class="strong">${esc(o.id)}</span><div class="small muted">${new Date(o.created).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>` },
          { h: 'Chemist', c: o => `${esc(chem(o.chemistId)?.name || o.chemistId)}<div class="small muted">${esc(chem(o.chemistId)?.city || '')}</div>` },
          { h: 'Items', c: o => `${o.lines.length}<div class="small muted ellipsis" style="max-width:280px">${esc(o.lines.map(l => `${l.name} × ${l.qty}`).join(', '))}</div>` },
          { h: 'Stock', c: o => { const n = o.lines.filter(l => orderShort(l) > 0).length; return n ? pill(`${n} short`) : pill('All in stock'); } },
          { h: 'Note', c: o => `<span class="small">${esc(o.note || '—')}</span>` },
          { h: 'Status', c: o => pill(o.status) + (o.saleNo ? `<div class="small muted">${esc(o.saleNo)}</div>` : '') },
          { h: '', c: o => rowActs(actBtn('view-order', o.id, 'View', 'ghost'), ['New', 'Accepted', 'Arranging'].includes(o.status) && actBtn('order-bill', o.id, 'Make bill', 'primary'), o.status === 'New' && actBtn('order-status', o.id + '|Accepted', 'Accept')) },
        ],
      })}`;
  };

  const stockText = b => { const p = prod(b.productId); return [p?.name, company(p?.companyId)?.name, p?.mfg, p?.pack, p?.hsn, b.batch, b.source, sup(b.supplierId)?.name].join(' '); };
  VIEWS.stock = () => {
    const live = db.batches.filter(b => avail(b) > 0);
    const near = live.filter(b => batchStatus(b) === 'Near expiry');
    const exp = live.filter(b => batchStatus(b) === 'Expired');
    const unver = live.filter(b => !b.verified);
    return `
      <div class="grid g-4">
        ${kpi('Stock amount (Qty × Rate)', compact(stockValue()), `${live.length} batches in stock`)}
        ${kpi('Needs checking', qty(unver.length), unver.length ? 'Lines added from uploaded bills' : 'Everything verified')}
        ${kpi('Near expiry (≤ 90 days)', compact(near.reduce((a, b) => a + batchAmount(b), 0)), `${near.length} batches`)}
        ${kpi('Expired stock', compact(exp.reduce((a, b) => a + batchAmount(b), 0)), `${exp.length} batches`)}
      </div>
      ${useList({
        key: 'stock', title: 'Stock register',
        actions: `${unver.length ? actBtn('verify-all', '', 'Mark all checked') : ''}${actBtn('new-batch', '', icon('plus') + 'Add stock', 'primary')}`,
        tabs: [
          { id: 'all', label: 'In stock', filter: b => avail(b) > 0 },
          { id: 'unver', label: 'Needs check', filter: b => !b.verified && avail(b) > 0 },
          { id: 'near', label: 'Near expiry', filter: b => avail(b) > 0 && batchStatus(b) === 'Near expiry' },
          { id: 'exp', label: 'Expired', filter: b => avail(b) > 0 && batchStatus(b) === 'Expired' },
          { id: 'zero', label: 'Sold out', filter: b => avail(b) <= 0 },
        ],
        rows: () => [...db.batches].sort((a, b) => (prod(a.productId)?.name || '').localeCompare(prod(b.productId)?.name || '') || a.expiry.localeCompare(b.expiry)),
        text: stockText,
        filters: [...prodFilters(b => [prod(b.productId)]), supplierFilter(b => b.supplierId)],
        select: {
          id: b => b.id, fields: [...PCT_FIELDS, GST_FIELD],
          extra: `<button type="button" class="btn sm" data-bulkact="stock|verify">Mark checked</button><button type="button" class="btn sm ghost danger" data-bulkact="stock|delete">Delete</button>`,
          actions: {
            verify: items => { items.forEach(b => { b.verified = true; }); return `${items.length} line(s) marked checked.`; },
            delete: items => {
              confirmModal(`Delete ${items.length} stock line(s)?`, `This removes ${qty(items.reduce((a, b) => a + avail(b), 0))} units from stock. Bills that used these batches keep their record. This cannot be undone.`, 'Delete lines', () => {
                const ids = new Set(items.map(b => b.id)); db.batches = db.batches.filter(b => !ids.has(b.id)); listState.stock.sel.clear(); return `${items.length} stock line(s) deleted.`;
              });
              return false;
            },
          },
        },
        foot: rows => rows.length ? `<tfoot><tr><td colspan="9" class="strong">Total</td><td class="r num strong">${qty(rows.reduce((a, b) => a + (b.qty || 0), 0))}</td><td class="r num">${qty(rows.reduce((a, b) => a + (b.free || 0), 0))}</td><td colspan="5"></td><td class="r num strong">${dec(rows.reduce((a, b) => a + batchAmount(b), 0))}</td><td colspan="2"></td></tr></tfoot>` : '',
        columns: [
          { h: 'SN', c: (b, i) => `<span class="muted">${i + 1}</span>` },
          { h: 'Item name', c: b => `<span class="strong">${esc(prod(b.productId)?.name)}</span>${b.source ? `<div class="small muted">${esc(b.source)}</div>` : ''}` },
          { h: 'Company', c: b => esc(company(prod(b.productId)?.companyId)?.name || '—') },
          { h: 'MFG name', c: b => esc(prod(b.productId)?.mfg || '—') },
          { h: 'Pack', c: b => esc(prod(b.productId)?.pack) },
          { h: 'HSN', c: b => esc(prod(b.productId)?.hsn) },
          { h: 'Batch', c: b => esc(b.batch) },
          { h: 'Exp', c: b => { const st = batchStatus(b); return `<span style="${st === 'Expired' ? 'color:var(--bad);font-weight:600' : st === 'Near expiry' ? 'color:var(--warn);font-weight:600' : ''}">${isoToExp(b.expiry)}</span>`; } },
          { h: 'Qty', r: 1, c: b => qty(b.qty) },
          { h: 'Free', r: 1, c: b => qty(b.free) },
          { h: 'Rate', r: 1, c: b => dec(b.rate) },
          { h: 'MRP', r: 1, c: b => dec(b.mrp) },
          { h: 'CD%', r: 1, c: b => dec(b.cd) },
          { h: 'TD%', r: 1, c: b => dec(b.td) },
          { h: 'GST%', r: 1, c: b => dec(b.gst) },
          { h: 'Amount', r: 1, c: b => dec(batchAmount(b)) },
          { h: 'Check', c: b => b.verified ? pill('Verified') : pill('Needs check') },
          { h: '', c: b => rowActs(!b.verified && actBtn('verify-batch', b.id, 'Mark checked'), actBtn('edit-batch', b.id, 'Edit', 'ghost'), actBtn('del-batch', b.id, 'Delete', 'ghost danger')) },
        ],
      })}
      ${useList({
        key: 'reorder', title: 'Reorder required', noSearch: true,
        rows: () => lowStock(),
        text: p => p.name,
        empty: 'Every product is above its reorder level.',
        columns: [
          { h: 'Product', c: p => `<span class="strong">${esc(p.name)}</span><div class="small muted">${esc(company(p.companyId)?.name || '')}</div>` },
          { h: 'Saleable stock', r: 1, c: p => qty(sellableQty(p.id)) },
          { h: 'Reorder level', r: 1, c: p => qty(p.reorder) },
          { h: 'Suggested qty', r: 1, c: p => qty(p.reorder * 2 - sellableQty(p.id)) },
          { h: '', c: p => actBtn('reorder-po', p.id, 'Create PO', 'primary') },
        ],
      })}`;
  };

  const masterUsage = {
    companies: id => db.products.filter(p => p.companyId === id).length,
    categories: id => db.products.filter(p => p.categoryId === id).length,
    forms: id => { const f = db.forms.find(x => x.id === id); return db.products.filter(p => p.form === f?.name).length; },
  };
  const MASTER_LABEL = { companies: ['Companies / brands', 'company'], categories: ['Categories', 'category'], forms: ['Forms (Tablet, Syrup…)', 'form'] };
  const masterCard = kind => `
    <section class="card">
      <div class="card-head"><h2 class="card-title">${MASTER_LABEL[kind][0]}</h2><span class="hint">${db[kind].length}</span><div class="spacer"></div>${actBtn('master-add', kind, icon('plus') + 'Add', 'sm')}</div>
      <div class="alert-list master-list">${db[kind].map(m => `
        <div class="alert-item"><div style="flex:1;min-width:0"><span class="strong">${esc(m.name)}</span> <span class="small muted">${masterUsage[kind](m.id)} products</span></div>
        ${actBtn('master-edit', kind + '|' + m.id, 'Edit', 'ghost')}${actBtn('master-del', kind + '|' + m.id, 'Delete', 'ghost danger')}</div>`).join('') || '<div class="empty">None yet.</div>'}</div>
    </section>`;

  VIEWS.products = () => `
    ${useList({
      key: 'products', title: 'Products',
      actions: actBtn('new-product', '', icon('plus') + 'Add product', 'primary'),
      tabs: [{ id: 'all', label: 'All' }, { id: 'low', label: 'Low stock', filter: p => { const q = sellableQty(p.id); return q > 0 && q < p.reorder; } }, { id: 'out', label: 'Out of stock', filter: p => sellableQty(p.id) <= 0 }],
      filters: prodFilters(p => [p], ['company', 'category', 'form']),
      select: {
        id: p => p.id,
        fields: [GST_FIELD, { k: 'categoryId', label: 'Category', type: 'select', options: db.categories.map(c => [c.id, c.name]) }, { k: 'form', label: 'Form', type: 'select', options: db.forms.map(f => [f.name, f.name]) }, { k: 'companyId', label: 'Company', type: 'select', options: db.companies.map(c => [c.id, c.name]).sort(byName) }],
        extra: '<label class="check-line small"><input type="checkbox" id="bulkSyncGst" checked> Also change GST on their stock</label>',
        apply: (items, v) => {
          const sync = $('#bulkSyncGst')?.checked;
          let nb = 0;
          items.forEach(p => {
            Object.assign(p, v);
            if (v.gst != null && sync) db.batches.filter(b => b.productId === p.id && avail(b) > 0).forEach(b => { b.gst = v.gst; nb++; });
          });
          return `${items.length} product(s) updated${nb ? ` · GST changed on ${nb} stock line(s)` : ''}.`;
        },
      },
      rows: () => [...db.products].sort((a, b) => a.name.localeCompare(b.name)),
      text: p => [p.id, p.name, p.salt, company(p.companyId)?.name, p.mfg, category(p.categoryId)?.name, p.form, p.hsn].join(' '),
      columns: [
        { h: 'Item name', c: p => `<span class="strong">${esc(p.name)}</span><div class="small muted">${esc(p.id)}${p.salt ? ' · ' + esc(p.salt) : ''}</div>` },
        { h: 'Company', c: p => esc(company(p.companyId)?.name || '—') },
        { h: 'MFG name', c: p => esc(p.mfg || '—') },
        { h: 'Category', c: p => esc(category(p.categoryId)?.name || '—') },
        { h: 'Form', c: p => esc(p.form) },
        { h: 'Pack', c: p => esc(p.pack) },
        { h: 'HSN', c: p => esc(p.hsn) },
        { h: 'GST%', r: 1, c: p => dec(p.gst) },
        { h: 'MRP', r: 1, c: p => dec(p.mrp) },
        { h: 'Sale rate', r: 1, c: p => dec(p.ptr) },
        { h: 'Purchase rate', r: 1, c: p => dec(p.pts) },
        { h: 'Stock', r: 1, c: p => qty(sellableQty(p.id)) },
        { h: 'Status', c: p => { const q = sellableQty(p.id); return pill(q <= 0 ? 'Out of stock' : q < p.reorder ? 'Low stock' : 'In stock'); } },
        { h: '', c: p => rowActs(actBtn('edit-product', p.id, 'Edit', 'ghost'), actBtn('del-product', p.id, 'Delete', 'ghost danger')) },
      ],
    })}
    <div class="grid g-3">${masterCard('companies')}${masterCard('categories')}${masterCard('forms')}</div>`;

  // Every purchased line (from purchase bills, and goods receipts not yet billed), newest first
  function purchaseLines(sid) {
    const out = [];
    db.pinvoices.filter(p => !sid || p.supplierId === sid).forEach(p => piLines(p).forEach((l, i) => out.push({ ...l, key: `${p.no}#${i}`, date: p.date, docNo: p.no, ref: p.supplierInvNo, supplierId: p.supplierId, act: 'view-pi' })));
    db.grns.filter(g => !g.invoiced && (!sid || g.supplierId === sid)).forEach(g => g.lines.forEach((l, i) => out.push({ ...l, key: `${g.no}#${i}`, date: g.date, docNo: g.no, ref: g.challan, supplierId: g.supplierId, act: 'view-grn' })));
    return out.sort((a, b) => b.date.localeCompare(a.date) || b.docNo.localeCompare(a.docNo));
  }
  const lineAmount = l => calcLine(l).amount;
  const plineCols = (withSupplier) => [
    { h: 'Date', c: l => fmtDate(l.date) },
    { h: 'Bill', c: l => `<a href="#" data-act="${l.act}" data-id="${esc(l.docNo)}" class="strong">${esc(l.docNo)}</a><div class="small muted">${esc(l.ref || '')}</div>` },
    ...(withSupplier ? [{ h: 'Supplier', c: l => `<a href="#" data-nav="folder/${esc(l.supplierId)}">${esc(sup(l.supplierId)?.name || '—')}</a>` }] : []),
    { h: 'Item name', c: l => `<span class="strong">${esc(prod(l.productId)?.name || l.name)}</span>` },
    { h: 'Company', c: l => esc(company(prod(l.productId)?.companyId)?.name || '—') },
    { h: 'Type', c: l => esc(prod(l.productId)?.form || '') },
    { h: 'Batch', c: l => esc(l.batch) },
    { h: 'Exp', c: l => isoToExp(l.expiry) },
    { h: 'Qty', r: 1, c: l => qty(l.qty) },
    { h: 'Free', r: 1, c: l => qty(l.free) },
    { h: 'Rate', r: 1, c: l => dec(l.rate) },
    { h: 'MRP', r: 1, c: l => dec(l.mrp) },
    { h: 'CD%', r: 1, c: l => dec(l.cd) },
    { h: 'GST%', r: 1, c: l => dec(l.gst) },
    { h: 'Amount', r: 1, c: l => dec(lineAmount(l)) },
  ];
  const plineFoot = (span) => rows => rows.length ? `<tfoot><tr><td colspan="${span}" class="strong">Total</td><td class="r num strong">${qty(rows.reduce((a, l) => a + (l.qty || 0), 0))}</td><td class="r num">${qty(rows.reduce((a, l) => a + (l.free || 0), 0))}</td><td colspan="4"></td><td class="r num strong">${dec(rows.reduce((a, l) => a + lineAmount(l), 0))}</td></tr></tfoot>` : '';
  const supplierDocs = sid => [...db.pinvoices.filter(p => p.supplierId === sid), ...db.grns.filter(g => g.supplierId === sid && !g.invoiced)];
  function folderCard(s) {
    const bills = db.pinvoices.filter(p => p.supplierId === s.id);
    const last = [...bills.map(p => p.date), ...db.grns.filter(g => g.supplierId === s.id).map(g => g.date)].sort().pop();
    const pay = supPayable(s.id);
    return `<button type="button" class="folder-card" data-nav="folder/${esc(s.id)}">
      <div class="folder-ic">${icon('folder')}</div>
      <div class="folder-main"><div class="strong ellipsis">${esc(s.name)}</div>
        <div class="small muted">${bills.length} bill${bills.length === 1 ? '' : 's'} · ${last ? 'last ' + fmtDate(last) : 'no purchases yet'}</div>
        <div class="small"><span class="num strong">${compact(bills.reduce((a, p) => a + p.total, 0))}</span> bought${pay > 0.5 ? ` · <span class="bad-text">${compact(pay)} due</span>` : ''}</div></div>
    </button>`;
  }
  const lastPurchase = sid => [...db.pinvoices.filter(p => p.supplierId === sid), ...db.grns.filter(g => g.supplierId === sid)].map(x => x.date).sort().pop() || '';

  VIEWS.purchase = () => {
    const pM = sumBy(db.pinvoices, p => monthKey(p.date) === thisM), pP = sumBy(db.pinvoices, p => monthKey(p.date) === prevM);
    const payable = db.pinvoices.reduce((a, p) => a + balance(p), 0);
    const overdue = db.pinvoices.filter(p => piStatus(p) === 'Overdue');
    const openPo = db.pos.filter(p => p.status === 'Open' || p.status === 'Partially received');
    const awaiting = db.grns.filter(g => !g.invoiced);
    const months = lastMonths(6);
    const series = [{ label: 'Purchases', color: 'var(--gold)', values: months.map(m => sumBy(db.pinvoices, p => monthKey(p.date) === m.key)) }];
    const since = months[0].key;
    const bySup = db.suppliers.map(s => ({ label: s.name, value: sumBy(db.pinvoices, p => p.supplierId === s.id && monthKey(p.date) >= since) })).sort((a, b) => b.value - a.value);
    const activity = [
      ...db.pos.map(p => ({ type: 'PO', no: p.no, date: p.date, supplierId: p.supplierId, total: p.total, status: p.status, act: 'view-po' })),
      ...db.grns.map(g => ({ type: 'GRN', no: g.no, date: g.date, supplierId: g.supplierId, total: g.total, status: g.invoiced ? 'Invoiced' : 'Awaiting invoice', act: 'view-grn' })),
      ...db.pinvoices.map(p => ({ type: 'Invoice', no: p.no, date: p.date, supplierId: p.supplierId, total: p.total, status: piStatus(p), act: 'view-pi' })),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no)).slice(0, 10);
    return `
      <div class="grid g-4">
        ${kpi('Purchases this month', compact(pM), trendFoot(pM, pP))}
        ${kpi('Payable to suppliers', compact(payable), overdue.length ? `<span class="down">${overdue.length} overdue</span> bills` : 'Nothing overdue')}
        ${kpi('Open purchase orders', compact(openPo.reduce((a, p) => a + p.total, 0)), `${openPo.length} orders awaiting delivery`)}
        ${kpi('GRNs awaiting invoice', qty(awaiting.length), `Worth ${compact(awaiting.reduce((a, g) => a + g.total, 0))}`)}
      </div>
      <section class="card cta-card">
        <div class="card-body cta">
          <div class="cta-icon">${icon('spark')}</div>
          <div style="flex:1;min-width:220px"><div class="card-title">Upload a purchase bill</div><div class="small muted">Photo or PDF of a supplier bill → read into a CSV → check every line → add to stock.</div></div>
          <button type="button" class="btn primary" data-nav="billentry">${icon('upload')}Upload bill</button>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2 class="card-title">Supplier folders</h2><span class="hint">Every bill is filed under its supplier — open a folder for its bills and item history</span><div class="spacer"></div>${actBtn('new-supplier', '', icon('plus') + 'Add supplier', 'sm')}</div>
        <div class="card-body"><div class="folder-grid">${[...db.suppliers].sort((a, b) => lastPurchase(b.id).localeCompare(lastPurchase(a.id)) || a.name.localeCompare(b.name)).map(folderCard).join('') || '<div class="muted">No suppliers yet.</div>'}</div></div>
      </section>
      <div class="grid g-2-1">
        <section class="card"><div class="card-head"><h2 class="card-title">Monthly purchases</h2><span class="hint">Purchase bills by date</span></div>
          <div class="card-body">${barChart(months.map(m => m.label), series)}</div></section>
        <section class="card"><div class="card-head"><h2 class="card-title">By supplier</h2><span class="hint">Last 6 months</span></div>
          <div class="card-body">${barList(bySup, 'gold')}</div></section>
      </div>
      <section class="card">
        <div class="card-head"><h2 class="card-title">Recent purchase activity</h2><div class="spacer"></div>
          <div class="toolbar">${actBtn('new-po', '', icon('plus') + 'Purchase order')}${actBtn('new-grn', '', icon('plus') + 'Goods receipt')}</div></div>
        <div class="table-wrap">${table([
          { h: 'Type', c: a => pill(a.type) },
          { h: 'Number', c: a => `<span class="strong">${a.no}</span>` },
          { h: 'Date', c: a => fmtDate(a.date) },
          { h: 'Supplier', c: a => esc(sup(a.supplierId)?.name) },
          { h: 'Amount', r: 1, c: a => money(a.total) },
          { h: 'Status', c: a => pill(a.status) },
          { h: '', c: a => actBtn(a.act, a.no, 'View', 'ghost') },
        ], activity)}</div>
      </section>
      ${useList({
        key: 'plines', title: 'Purchased items',
        filters: [supplierFilter(l => l.supplierId), ...prodFilters(l => [prod(l.productId)]), monthFilter(purchaseLines().map(l => l.date), l => l.date)],
        rows: () => purchaseLines(),
        text: l => [l.docNo, l.ref, sup(l.supplierId)?.name, prod(l.productId)?.name, company(prod(l.productId)?.companyId)?.name, l.batch].join(' '),
        columns: plineCols(true),
        foot: plineFoot(8),
      })}`;
  };

  // Supplier folder: one supplier's bills and everything bought from them
  let folderId = '';
  VIEWS.folder = () => {
    const s = sup(folderId);
    const docs = supplierDocs(s.id);
    const lines = purchaseLines(s.id);
    const total = db.pinvoices.filter(p => p.supplierId === s.id).reduce((a, p) => a + p.total, 0);
    const byItem = {};
    lines.forEach(l => {
      const k = l.productId; const x = byItem[k] || (byItem[k] = { productId: k, times: 0, qty: 0, free: 0, amount: 0, last: '', lastRate: 0 });
      x.times++; x.qty += l.qty || 0; x.free += l.free || 0; x.amount += lineAmount(l);
      if (l.date >= x.last) { x.last = l.date; x.lastRate = l.rate; }
    });
    return `
      <section class="card">
        <div class="card-head"><button type="button" class="btn sm ghost" data-nav="suppliers">← Suppliers</button><div class="folder-ic sm">${icon('folder')}</div><h2 class="card-title">${esc(s.name)}</h2><span class="hint">${esc(s.id)}</span><div class="spacer"></div>
          <div class="toolbar">${actBtn('edit-supplier', s.id, 'Edit supplier', 'ghost')}${actBtn('new-po', '', icon('plus') + 'Purchase order')}<button type="button" class="btn sm primary" data-act="upload-for" data-id="${esc(s.id)}">${icon('upload')}Upload bill</button></div></div>
        <div class="card-body">${detailGrid([['Contact', esc(s.contact || '—')], ['Mobile', esc(s.phone || '—')], ['Address', esc(addrText(s) || '—')], ['Nearby hospital', esc(s.hospital || '—')], ['GSTIN', esc(s.gstin || '—')], ['Drug licence 1', esc(s.dl1 || '—')], ['Drug licence 2', esc(s.dl2 || '—')], ['Drug licence valid upto', licValid(s)], ['FSSAI no.', esc(s.fssai || '—')], ['FSSAI valid upto', fssaiValid(s)], ['Terms', (s.terms ?? 30) + ' days'], ['Licence copies', licDocsBtn('supplier', s.id)]])}</div>
      </section>
      <div class="grid g-4">
        ${kpi('Purchase bills', qty(db.pinvoices.filter(p => p.supplierId === s.id).length), `${db.grns.filter(g => g.supplierId === s.id && !g.invoiced).length} receipts awaiting a bill`)}
        ${kpi('Total purchased', compact(total), `${Object.keys(byItem).length} different items`)}
        ${kpi('Payable', compact(supPayable(s.id)), `${db.pinvoices.filter(p => p.supplierId === s.id && piStatus(p) === 'Overdue').length} overdue bills`)}
        ${kpi('Last purchase', lastPurchase(s.id) ? fmtDate(lastPurchase(s.id)) : '—', lastPurchase(s.id) ? `${-daysFrom(lastPurchase(s.id))} days ago` : 'Nothing bought yet')}
      </div>
      ${useList({
        key: 'fbills', title: 'Bills in this folder',
        filters: [monthFilter(docs.map(d => d.date), d => d.date)],
        rows: () => supplierDocs(s.id).sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no)),
        text: d => [d.no, d.supplierInvNo, d.challan, ...(d.files || []), ...piLines(d).map(l => prod(l.productId)?.name)].join(' '),
        empty: 'No bills from this supplier yet. Use “Upload bill” to add one.',
        columns: [
          { h: 'Date', c: d => fmtDate(d.date) },
          { h: 'Our no.', c: d => `<span class="strong">${esc(d.no)}</span>` },
          { h: 'Supplier bill', c: d => esc(d.supplierInvNo || (d.challan ? 'Challan ' + d.challan : '—')) },
          { h: 'Source', c: d => d.supplierInvNo != null ? pill(d.grnNo ? 'GRN' : (d.source || 'Manual')) : pill('Awaiting invoice') },
          { h: 'Items', c: d => { const ls = piLines(d); return `${ls.length}<div class="small muted ellipsis" style="max-width:260px">${esc(ls.map(l => prod(l.productId)?.name).join(', '))}</div>`; } },
          { h: 'Amount', r: 1, c: d => money(d.total) },
          { h: 'Balance', r: 1, c: d => d.supplierInvNo != null ? money(balance(d)) : '—' },
          { h: 'Status', c: d => d.supplierInvNo != null ? pill(piStatus(d)) : '' },
          { h: 'Bill copy', c: d => d.supplierInvNo == null ? '' : d.files?.length ? `<button type="button" class="btn sm ghost" data-act="open-bill-file" data-id="${esc(d.no)}">${icon('clip')}${d.files.length} file${d.files.length === 1 ? '' : 's'}</button>` : `<button type="button" class="btn sm ghost" data-act="attach-bill" data-id="${esc(d.no)}">${icon('clip')}Attach</button>` },
          { h: '', c: d => d.supplierInvNo != null ? rowActs(actBtn('view-pi', d.no, 'View', 'ghost'), balance(d) > 0.5 && actBtn('pay-pi', d.no, 'Pay')) : rowActs(actBtn('view-grn', d.no, 'View', 'ghost'), actBtn('invoice-grn', d.no, 'Add invoice')) },
        ],
      })}
      ${useList({
        key: 'fitems', title: 'Item purchase history',
        filters: [...prodFilters(l => [prod(l.productId)]), monthFilter(lines.map(l => l.date), l => l.date)],
        rows: () => purchaseLines(s.id),
        text: l => [l.docNo, l.ref, prod(l.productId)?.name, company(prod(l.productId)?.companyId)?.name, l.batch].join(' '),
        empty: 'Nothing bought from this supplier yet.',
        columns: plineCols(false),
        foot: plineFoot(7),
      })}
      ${useList({
        key: 'fsum', title: 'Items bought — summary',
        rows: () => Object.values(byItem).sort((a, b) => b.amount - a.amount),
        text: x => [prod(x.productId)?.name, company(prod(x.productId)?.companyId)?.name].join(' '),
        empty: 'Nothing bought from this supplier yet.',
        columns: [
          { h: 'Item name', c: x => `<span class="strong">${esc(prod(x.productId)?.name || '—')}</span><div class="small muted">${esc(company(prod(x.productId)?.companyId)?.name || '')}</div>` },
          { h: 'Times bought', r: 1, c: x => x.times },
          { h: 'Total qty', r: 1, c: x => qty(x.qty) },
          { h: 'Free', r: 1, c: x => qty(x.free) },
          { h: 'Last rate', r: 1, c: x => dec(x.lastRate) },
          { h: 'Last bought', c: x => fmtDate(x.last) },
          { h: 'Amount', r: 1, c: x => dec(x.amount) },
        ],
      })}`;
  };

  VIEWS.suppliers = () => {
    const since = lastMonths(6)[0].key;
    return useList({
      key: 'suppliers', title: 'Suppliers',
      actions: actBtn('new-supplier', '', icon('plus') + 'Add supplier', 'primary'),
      rows: () => db.suppliers,
      text: s => [s.id, s.name, s.contact, addrText(s), s.gstin, s.dl1, s.dl2, s.fssai, s.phone].join(' '),
      columns: [
        { h: 'Supplier', c: s => `<a href="#" data-nav="folder/${esc(s.id)}" class="folder-link">${icon('folder')}<span class="strong">${esc(s.name)}</span></a><div class="small muted">${esc(s.contact || '—')} · ${esc(s.id)}</div>` },
        { h: 'Bills', r: 1, c: s => db.pinvoices.filter(p => p.supplierId === s.id).length },
        { h: 'Last purchase', c: s => lastPurchase(s.id) ? fmtDate(lastPurchase(s.id)) : '—' },
        { h: 'Area', c: s => `${esc(s.locality || s.city || '—')}<div class="small muted">${esc(s.district || '')}</div>` },
        { h: 'Phone', c: s => esc(s.phone || '—') },
        { h: 'GSTIN', c: s => `<span class="small">${esc(s.gstin || '—')}</span>` },
        { h: 'Drug licence 1 / 2', c: s => licCell(s) },
        { h: 'Terms', r: 1, c: s => s.terms + ' days' },
        { h: 'Purchases (6 mo)', r: 1, c: s => money(sumBy(db.pinvoices, p => p.supplierId === s.id && monthKey(p.date) >= since)) },
        { h: 'Payable', r: 1, c: s => money(supPayable(s.id)) },
        { h: '', c: s => rowActs(`<button type="button" class="btn sm" data-nav="folder/${esc(s.id)}">${icon('folder')}Open folder</button>`, actBtn('edit-supplier', s.id, 'Edit', 'ghost'), actBtn('del-supplier', s.id, 'Delete', 'ghost danger')) },
      ],
    });
  };

  VIEWS.orders = () => useList({
    key: 'orders', title: 'Purchase orders',
    actions: actBtn('new-po', '', icon('plus') + 'New purchase order', 'primary'),
    tabs: [{ id: 'all', label: 'All' }, ...['Open', 'Partially received', 'Received', 'Cancelled'].map(s => ({ id: s, label: s === 'Partially received' ? 'Partial' : s, filter: p => p.status === s }))],
    rows: () => [...db.pos].sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no)),
    text: p => [p.no, sup(p.supplierId)?.name, ...p.lines.map(l => prod(l.productId)?.name)].join(' '),
    columns: [
      { h: 'PO number', c: p => `<span class="strong">${p.no}</span>` },
      { h: 'Date', c: p => fmtDate(p.date) },
      { h: 'Supplier', c: p => esc(sup(p.supplierId)?.name) },
      { h: 'Items', r: 1, c: p => p.lines.length },
      { h: 'Value', r: 1, c: p => money(p.total) },
      { h: 'Expected', c: p => fmtDate(p.expected) },
      { h: 'Status', c: p => pill(p.status) },
      { h: '', c: p => { const open = p.status === 'Open' || p.status === 'Partially received'; const hasGrn = db.grns.some(g => g.poNo === p.no); return rowActs(actBtn('view-po', p.no, 'View', 'ghost'), open && actBtn('receive-po', p.no, 'Receive'), p.status === 'Open' && !hasGrn && actBtn('edit-po', p.no, 'Edit', 'ghost'), !hasGrn && actBtn('del-po', p.no, 'Delete', 'ghost danger')); } },
    ],
  });

  VIEWS.grn = () => useList({
    key: 'grn', title: 'Goods receipt notes',
    actions: actBtn('new-grn', '', icon('plus') + 'New goods receipt', 'primary'),
    tabs: [{ id: 'all', label: 'All' }, { id: 'await', label: 'Awaiting invoice', filter: g => !g.invoiced }, { id: 'inv', label: 'Invoiced', filter: g => !!g.invoiced }],
    rows: () => [...db.grns].sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no)),
    text: g => [g.no, g.poNo, g.challan, sup(g.supplierId)?.name, ...g.lines.map(l => l.batch)].join(' '),
    columns: [
      { h: 'GRN number', c: g => `<span class="strong">${g.no}</span>` },
      { h: 'Date', c: g => fmtDate(g.date) },
      { h: 'PO', c: g => esc(g.poNo) },
      { h: 'Supplier', c: g => esc(sup(g.supplierId)?.name) },
      { h: 'Challan', c: g => esc(g.challan || '—') },
      { h: 'Qty + free', r: 1, c: g => qty(g.lines.reduce((a, l) => a + l.qty + (l.free || 0), 0)) },
      { h: 'Value', r: 1, c: g => money(g.total) },
      { h: 'Invoice', c: g => g.invoiced ? pill('Invoiced') + ` <span class="small muted">${esc(g.invoiced)}</span>` : pill('Awaiting invoice') },
      { h: '', c: g => rowActs(actBtn('view-grn', g.no, 'View', 'ghost'), !g.invoiced && actBtn('invoice-grn', g.no, 'Add invoice'), !g.invoiced && actBtn('del-grn', g.no, 'Delete', 'ghost danger')) },
    ],
  });

  VIEWS.invoices = () => {
    const payable = db.pinvoices.reduce((a, p) => a + balance(p), 0);
    const overdue = db.pinvoices.filter(p => piStatus(p) === 'Overdue');
    const due7 = db.pinvoices.filter(p => piStatus(p) !== 'Paid' && daysFrom(p.due) >= 0 && daysFrom(p.due) <= 7);
    const paidM = db.pinvoices.filter(p => monthKey(p.date) === thisM).reduce((a, p) => a + (p.paid || 0), 0);
    return `
      <div class="grid g-4">
        ${kpi('Total payable', compact(payable), `${db.pinvoices.filter(p => piStatus(p) !== 'Paid').length} unpaid bills`)}
        ${kpi('Overdue', compact(overdue.reduce((a, p) => a + balance(p), 0)), `${overdue.length} bills past due date`)}
        ${kpi('Due in 7 days', compact(due7.reduce((a, p) => a + balance(p), 0)), `${due7.length} bills`)}
        ${kpi('Paid on this month’s bills', compact(paidM), 'Supplier payments')}
      </div>
      ${useList({
        key: 'invoices', title: 'Purchase invoices',
        actions: `<button type="button" class="btn sm" data-nav="billentry">${icon('upload')}Upload bill</button>${actBtn('new-pi', '', icon('plus') + 'Invoice for a GRN', 'primary')}`,
        tabs: [{ id: 'all', label: 'All' }, { id: 'unpaid', label: 'Unpaid', filter: p => piStatus(p) !== 'Paid' }, { id: 'Overdue', label: 'Overdue', filter: p => piStatus(p) === 'Overdue' }, { id: 'Paid', label: 'Paid', filter: p => piStatus(p) === 'Paid' }],
        filters: [supplierFilter(p => p.supplierId), ...prodFilters(p => piLines(p).map(l => prod(l.productId)), ['company', 'form', 'item']), monthFilter(db.pinvoices.map(p => p.date), p => p.date)],
        rows: () => [...db.pinvoices].sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no)),
        text: p => [p.no, p.supplierInvNo, p.grnNo, sup(p.supplierId)?.name].join(' '),
        columns: [
          { h: 'Invoice', c: p => `<span class="strong">${p.no}</span><div class="small muted">Supplier bill ${esc(p.supplierInvNo)}</div>` },
          { h: 'Date', c: p => fmtDate(p.date) },
          { h: 'Supplier', c: p => `<a href="#" data-nav="folder/${esc(p.supplierId)}">${esc(sup(p.supplierId)?.name)}</a>` },
          { h: 'Source', c: p => (p.grnNo ? esc(p.grnNo) : pill(p.source || 'Manual')) + (p.files?.length ? ` <span class="muted ic-inline" title="Bill copy saved">${icon('clip')}</span>` : '') },
          { h: 'Amount', r: 1, c: p => money(p.total) },
          { h: 'Paid', r: 1, c: p => money(p.paid) },
          { h: 'Balance', r: 1, c: p => `<span class="${balance(p) > 0 ? 'strong' : 'muted'}">${money(balance(p))}</span>` },
          { h: 'Due date', c: p => fmtDate(p.due) },
          { h: 'Status', c: p => pill(piStatus(p)) },
          { h: '', c: p => rowActs(actBtn('view-pi', p.no, 'View', 'ghost'), balance(p) > 0.5 && actBtn('pay-pi', p.no, 'Pay'), actBtn('edit-pi', p.no, 'Edit', 'ghost'), actBtn('del-pi', p.no, 'Delete', 'ghost danger')) },
        ],
      })}`;
  };

  // ---------- Bill upload / entry (purchase) ----------
  // entry = { source, files:[names], supplierId, supplierName, gstin, billNo, date, lines:[...], printed:{...}, csv }
  let entry = null;
  let uploadFor = ''; // supplier chosen from a supplier folder's "Upload bill"
  const withUploadFor = e => { if (uploadFor && sup(uploadFor)) e.supplierId = uploadFor; uploadFor = ''; return e; };
  let entryBusy = false;
  let pendingFiles = [];
  const ENTRY_COLS = [
    ['name', 'Item name', 'text', 210], ['company', 'Company', 'text', 110], ['mfg', 'MFG name', 'text', 90], ['pack', 'Pack', 'text', 80],
    ['hsn', 'HSN', 'text', 90], ['batch', 'Batch', 'text', 120], ['exp', 'Exp (MM/YY)', 'text', 76], ['qty', 'Qty', 'num', 64], ['free', 'Free', 'num', 56],
    ['rate', 'Rate', 'num', 84], ['mrp', 'MRP', 'num', 84], ['cd', 'CD%', 'num', 56], ['td', 'TD%', 'num', 56], ['gst', 'GST%', 'num', 56], ['amount', 'Amount (bill)', 'num', 92],
  ];
  const CSV_HEAD = ['ITEM NAME', 'COMPANY', 'MFG NAME', 'PACK', 'HSN', 'BATCH', 'EXP', 'QTY', 'FREE', 'RATE', 'MRP', 'CD%', 'TD%', 'GST%', 'AMOUNT'];
  const blankLine = () => ({ name: '', company: '', mfg: '', pack: '', hsn: '', batch: '', exp: '', qty: 0, free: 0, rate: 0, mrp: 0, cd: 0, td: 0, gst: 12, amount: 0 });
  const newEntry = (source, extra = {}) => ({ source, files: [], supplierId: '', supplierName: '', gstin: '', billNo: '', date: todayIso, lines: [], printed: null, ...extra });

  function checkLine(l) {
    const msgs = []; let level = 'ok';
    const bad = m => { msgs.push(m); level = 'bad'; };
    const warn = m => { msgs.push(m); if (level !== 'bad') level = 'warn'; };
    if (!String(l.name).trim()) bad('Item name missing');
    if (!String(l.batch).trim()) bad('Batch missing');
    const ex = expToIso(l.exp);
    if (!ex) bad('Expiry must be MM/YY'); else if (expDays(ex) < 0) warn('Already expired'); else if (expDays(ex) <= 90) warn('Expires within 90 days');
    if (num(l.qty) + num(l.free) <= 0) bad('Qty is 0');
    if (num(l.qty) > 0 && num(l.rate) <= 0) bad('Rate missing');
    if (num(l.mrp) > 0 && num(l.rate) > num(l.mrp)) warn('Rate is above MRP');
    if (![0, 5, 12, 18, 28].includes(num(l.gst))) warn(`GST ${l.gst}% is unusual`);
    if (l.hsn && !/^\d{4,8}$/.test(String(l.hsn).trim())) warn('HSN should be 4–8 digits');
    const calc = round2(num(l.qty) * num(l.rate));
    if (num(l.amount) > 0 && Math.abs(calc - num(l.amount)) > Math.max(1, calc * 0.01)) warn(`Qty × Rate = ${dec(calc)}, bill says ${dec(l.amount)}`);
    const p = findProductByName(l.name);
    const info = p ? 'Existing product' : (String(l.name).trim() ? 'New product will be created' : '');
    if (p) { const b = db.batches.find(x => x.productId === p.id && norm(x.batch) === norm(l.batch)); if (b) msgs.push('Adds to existing batch'); }
    return { level, msgs, info };
  }
  const levelPill = lv => pill(lv === 'ok' ? 'OK' : lv === 'warn' ? 'Check' : 'Error');
  const lineCheckHtml = l => { const c = checkLine(l); return `${levelPill(c.level)}<div class="small muted check-msg">${esc([c.info, ...c.msgs].filter(Boolean).join(' · '))}</div>`; };

  function entrySummary() {
    const checks = entry.lines.map(checkLine);
    const t = billCalc(entry.lines);
    const errors = checks.filter(c => c.level === 'bad').length, warns = checks.filter(c => c.level === 'warn').length;
    const printed = entry.printed;
    const cmp = (label, calc, pr) => pr ? `<div>${label} <b class="num">${dec(calc)}</b> <span class="small ${Math.abs(calc - pr) <= Math.max(1, pr * 0.005) ? 'ok-text' : 'bad-text'}">bill ${dec(pr)}</span></div>` : `<div>${label} <b class="num">${dec(calc)}</b></div>`;
    return `<div class="entry-summary">
      <div class="checks"><span>${pill('OK')} ${checks.length - errors - warns}</span><span>${pill('Check')} ${warns}</span><span>${pill('Error')} ${errors}</span></div>
      <div class="totals wrap">
        ${cmp('Gross', t.gross, printed?.gross)}
        ${cmp('Less CD', t.cd, printed?.cd)}
        <div>Less TD <b class="num">${dec(t.td)}</b></div>
        ${cmp('CGST', t.cgst, printed?.cgst)}
        ${cmp('SGST', t.sgst, printed?.sgst)}
        <div class="grand">Net ${money2(t.total)}${printed?.net ? ` <span class="small ${Math.abs(t.total - printed.net) <= 2 ? 'ok-text' : 'bad-text'}">bill ${dec(printed.net)}</span>` : ''}</div>
      </div></div>`;
  }

  VIEWS.billentry = () => {
    const hasKey = !!getApiKey();
    const upload = `
      <section class="card">
        <div class="card-head"><h2 class="card-title">1 · Upload the bill</h2><span class="hint">Photo (JPG, PNG, WEBP) or PDF · several pages allowed</span></div>
        <div class="card-body">
          <label class="dropzone" id="dropzone">
            <input type="file" id="billFiles" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" multiple hidden>
            <div class="dz-icon">${icon('upload')}</div>
            <div class="strong">Drop bill pages here or click to choose</div>
            <div class="small muted" id="fileList">${pendingFiles.length ? pendingFiles.map(f => esc(f.name)).join(', ') : 'No file chosen'}</div>
            ${uploadFor && sup(uploadFor) ? `<div class="small">${icon('folder')} Will be filed under <b>${esc(sup(uploadFor).name)}</b></div>` : ''}
          </label>
          <div class="toolbar" style="margin-top:14px">
            <button type="button" class="btn primary" data-act="entry-ai" ${entryBusy ? 'disabled' : ''}>${icon('spark')}${entryBusy ? 'Reading bill…' : 'Read bill with AI'}</button>
            <label class="btn">${icon('file')}Import CSV<input type="file" id="csvFile" accept=".csv,text/csv" hidden></label>
            ${actBtn('entry-manual', '', icon('plus') + 'Enter manually')}
            ${actBtn('entry-template', '', 'CSV template', 'ghost')}
          </div>
          <div class="small muted" style="margin-top:10px">${hasKey
            ? 'AI reading uses your Anthropic API key saved in Settings on this computer. The bill is sent to Anthropic to be read.'
            : `AI reading needs an Anthropic API key. <a href="#" data-act="open-settings" data-id="">Add it in Settings</a>. You can still import a CSV or type the bill in.`}</div>
          ${entryBusy ? '<div class="progress"><div></div></div>' : ''}
        </div>
      </section>`;
    if (!entry) return upload + `<section class="card"><div class="empty">Upload a bill, import a CSV, or choose “Enter manually” to start.</div></section>`;

    const supOpts = [['', entry.supplierName ? `New supplier: ${entry.supplierName}` : '— New supplier —'], ...db.suppliers.map(s => [s.id, s.name])];
    const details = `
      <section class="card">
        <div class="card-head"><h2 class="card-title">2 · Bill details</h2>${pill(entry.source)}${entry.files.length ? `<span class="hint">${esc(entry.files.join(', '))}</span>` : ''}<div class="spacer"></div>${actBtn('entry-clear', '', 'Discard', 'ghost danger')}</div>
        <div class="card-body"><div class="form-grid g4">
          <div class="field"><label>Supplier *</label><select data-eh="supplierId">${supOpts.map(([v, l]) => `<option value="${esc(v)}" ${v === entry.supplierId ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          <div class="field ${entry.supplierId ? 'hidden' : ''}" id="newSupName"><label>New supplier name *</label><input data-eh="supplierName" value="${esc(entry.supplierName)}"></div>
          <div class="field ${entry.supplierId ? 'hidden' : ''}" id="newSupGst"><label>Supplier GSTIN</label><input data-eh="gstin" value="${esc(entry.gstin)}" style="text-transform:uppercase"></div>
          <div class="field"><label>Supplier bill no. *</label><input data-eh="billNo" value="${esc(entry.billNo)}"></div>
          <div class="field"><label>Bill date *</label><input type="date" data-eh="date" value="${esc(entry.date)}" max="${todayIso}"></div>
        </div>
        <div class="toolbar" style="margin-top:14px">
          <label class="btn sm">${icon('clip')}Attach bill copy<input type="file" id="entryAttach" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" multiple hidden></label>
          <span class="small muted" id="entryFilesNote">${(entry.fileObjs || []).length ? `Will be filed in the supplier’s folder: ${esc(entry.fileObjs.map(f => f.name).join(', '))}` : 'Optional — the bill photo/PDF is kept in the supplier’s folder on this computer.'}</span>
        </div></div>
      </section>`;

    const grid = `
      <section class="card">
        <div class="card-head"><h2 class="card-title">3 · Check every line</h2><span class="hint">${entry.lines.length} lines · edit any cell</span><div class="spacer"></div>
          <div class="toolbar">${actBtn('entry-csv', '', 'Download CSV', 'ghost')}${actBtn('entry-add-row', '', icon('plus') + 'Add row')}</div></div>
        <div class="bulk-bar" id="entryBulk">
          <span class="bulk-n" id="eSelN">${entrySelText()}</span>
          <label class="bf"><span>CD%</span><input id="ebCd" inputmode="decimal" placeholder="—"></label>
          <label class="bf"><span>TD%</span><input id="ebTd" inputmode="decimal" placeholder="—"></label>
          <label class="bf"><span>GST%</span><input id="ebGst" inputmode="decimal" placeholder="—" list="dl-gst"></label>
          ${actBtn('entry-bulk', '', 'Apply', 'primary')}
          ${actBtn('entry-del-sel', '', 'Delete ticked', 'ghost danger')}
          <span class="small muted bulk-hint">Tick rows to give them the same discount or GST. With nothing ticked, the value goes on every row.</span>
        </div>
        <div class="table-wrap"><table class="entry-grid">
          <thead><tr><th><input type="checkbox" class="cb" data-eselall ${entry.lines.length && entry.lines.every(l => l.sel) ? 'checked' : ''} aria-label="Tick all rows"></th><th>SN</th>${ENTRY_COLS.map(([, h, t]) => `<th class="${t === 'num' ? 'r' : ''}">${h}</th>`).join('')}<th class="r">Qty × Rate</th><th>Check</th><th></th></tr></thead>
          <tbody id="entryBody">${entry.lines.map((l, i) => entryRow(l, i)).join('')}</tbody>
        </table></div>
        <div class="card-body" id="entrySummary">${entrySummary()}</div>
        <div class="card-foot">
          <div class="small muted">New products are created automatically. Stock added here is marked “Needs check” until you confirm it in Stock Details.</div>
          <button type="button" class="btn gold" data-act="entry-commit">${icon('check')}Add to stock &amp; save bill</button>
        </div>
      </section>`;
    return upload + details + grid;
  };
  function entryRow(l, i) {
    const c = checkLine(l);
    return `<tr data-row="${i}" class="lv-${c.level}"><td><input type="checkbox" class="cb" data-esel="${i}" ${l.sel ? 'checked' : ''} aria-label="Tick row ${i + 1}"></td><td class="muted">${i + 1}</td>${ENTRY_COLS.map(([k, , t, w]) =>
      `<td><input data-e="${i}|${k}" value="${esc(t === 'num' ? (l[k] || l[k] === 0 ? l[k] : '') : l[k])}" ${t === 'num' ? 'inputmode="decimal" class="r"' : ''} style="width:${w}px" ${k === 'name' ? 'list="dl-products"' : k === 'company' ? 'list="dl-companies"' : ''}></td>`).join('')}
      <td class="r num" data-calc>${dec(num(l.qty) * num(l.rate))}</td>
      <td data-check style="min-width:150px">${lineCheckHtml(l)}</td>
      <td>${actBtn('entry-del-row', i, '✕', 'ghost danger')}</td></tr>`;
  }
  function entrySelText() {
    const n = entry ? entry.lines.filter(l => l.sel).length : 0;
    return n ? `${n} row${n === 1 ? '' : 's'} ticked` : 'All rows';
  }
  function refreshEntryRow(i) {
    const tr = $(`#entryBody tr[data-row="${i}"]`); if (!tr) return;
    const l = entry.lines[i]; const c = checkLine(l);
    tr.className = 'lv-' + c.level;
    $('[data-calc]', tr).textContent = dec(num(l.qty) * num(l.rate));
    $('[data-check]', tr).innerHTML = lineCheckHtml(l);
    $('#entrySummary').innerHTML = entrySummary();
  }

  const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const linesToCsv = lines => [CSV_HEAD.join(','), ...lines.map(l => ENTRY_COLS.map(([k]) => csvCell(l[k])).join(','))].join('\r\n');
  function parseCsv(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim()));
  }
  function csvToLines(text) {
    const rows = parseCsv(text.replace(/^﻿/, ''));
    if (!rows.length) return [];
    const head = rows[0].map(h => norm(h).replace(/[^A-Z%]/g, ''));
    const want = { ITEMNAME: 'name', ITEM: 'name', PRODUCT: 'name', COMPANY: 'company', MFGNAME: 'mfg', MFG: 'mfg', PACK: 'pack', HSN: 'hsn', BATCH: 'batch', EXP: 'exp', EXPIRY: 'exp', QTY: 'qty', QUANTITY: 'qty', FREE: 'free', RATE: 'rate', MRP: 'mrp', 'CD%': 'cd', CD: 'cd', 'TD%': 'td', TD: 'td', 'GST%': 'gst', GST: 'gst', AMOUNT: 'amount' };
    const map = head.map(h => want[h] || null);
    if (!map.includes('name')) throw new Error('The CSV needs an “ITEM NAME” column. Download the template to see the layout.');
    return rows.slice(1).map(r => {
      const l = blankLine();
      map.forEach((k, i) => { if (!k) return; const v = (r[i] ?? '').trim(); l[k] = ['qty', 'free', 'rate', 'mrp', 'cd', 'td', 'gst', 'amount'].includes(k) ? num(v) : v; });
      return l;
    }).filter(l => l.name);
  }
  function downloadText(name, text, type = 'text/csv') {
    const blob = new Blob([text], { type: type + ';charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ----- Bill copies (photos/PDFs) kept in this browser's IndexedDB, keyed by purchase invoice number -----
  const billStore = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('pharmaSuite.billFiles', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('bills');
      r.onsuccess = () => res(r.result);
      r.onerror = () => { dbp = null; rej(r.error); };
    }));
    const run = async (mode, fn) => {
      const d = await open();
      return new Promise((res, rej) => {
        const t = d.transaction('bills', mode); const req = fn(t.objectStore('bills'));
        t.oncomplete = () => res(req.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      });
    };
    return {
      put: (k, files) => run('readwrite', s => s.put(files.map(f => ({ name: f.name, type: f.type, blob: f })), k)),
      get: k => run('readonly', s => s.get(k)),
      del: k => run('readwrite', s => s.delete(k)),
      clear: () => run('readwrite', s => s.clear()),
    };
  })();
  // Keep document files under `key`; their names are listed on holder[prop]
  function fileDocs(key, holder, prop, files) {
    if (!files || !files.length) return;
    holder[prop] = [...(holder[prop] || []), ...files.map(f => f.name)];
    billStore.get(key).catch(() => null)
      .then(old => billStore.put(key, [...(old || []).map(o => new File([o.blob], o.name, { type: o.type })), ...files]))
      .catch(() => { holder[prop] = (holder[prop] || []).filter(n => !files.some(f => f.name === n)); save(); toast('The file could not be saved in this browser (storage blocked or full).'); render(); });
  }
  const fileBillCopies = (pi, files) => fileDocs(pi.no, pi, 'files', files);

  // ----- AI bill reading (Claude API, called from the browser with the user's own key) -----
  const strS = { type: 'string' }, numS = { type: 'number' };
  const ITEM_KEYS = ['item_name', 'company', 'mfg_name', 'pack', 'hsn', 'batch', 'expiry', 'qty', 'free', 'rate', 'mrp', 'cd_pct', 'td_pct', 'gst_pct', 'amount'];
  const BILL_SCHEMA = {
    type: 'object', additionalProperties: false,
    required: ['seller_name', 'seller_gstin', 'buyer_name', 'bill_no', 'bill_date', 'items', 'totals'],
    properties: {
      seller_name: strS, seller_gstin: strS, buyer_name: strS, bill_no: strS,
      bill_date: { type: 'string', description: 'YYYY-MM-DD, or empty if not printed' },
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ITEM_KEYS,
          properties: {
            item_name: strS, company: strS, mfg_name: strS, pack: strS, hsn: strS, batch: strS,
            expiry: { type: 'string', description: 'MM/YY' },
            qty: numS, free: numS, rate: numS, mrp: numS, cd_pct: numS, td_pct: numS, gst_pct: numS, amount: numS,
          },
        },
      },
      totals: {
        type: 'object', additionalProperties: false, required: ['gross', 'cd', 'td', 'cgst', 'sgst', 'igst', 'net'],
        properties: { gross: numS, cd: numS, td: numS, cgst: numS, sgst: numS, igst: numS, net: numS },
      },
    },
  };
  const EXTRACT_PROMPT = `These pages are one bill (tax invoice) from an Indian pharmaceutical distributor. Read the header and every item row.

- seller_name and seller_gstin: the firm that issued the bill (usually at the top left). buyer_name: the party it is billed to (after "M/S").
- items: one entry per printed item row, in the printed order, across all pages. Keep rows that repeat an item with a different batch as separate entries. Leave out total and tax-summary rows.
- Copy item names, company, MFG name, pack, HSN and batch exactly as printed. Write expiry as MM/YY.
- Write numbers as plain numbers, without currency symbols or thousands separators. CD% and TD% are discount percentages.
- If a value is not printed, use an empty string for text and 0 for numbers. Do not calculate or guess values that are not printed.
- totals: the printed gross amount, CD and TD discount amounts (as positive numbers), CGST, SGST, IGST and net amount; 0 where not printed.
- bill_date: the bill date as YYYY-MM-DD. Indian bills print dates as DD/MM/YY.`;

  let sdkPromise = null;
  const loadSdk = () => sdkPromise || (sdkPromise = import(SDK_URL).then(m => m.default || m.Anthropic).catch(e => { sdkPromise = null; throw e; }));
  const fileToBase64 = f => new Promise((res, rej) => {
    const rd = new FileReader();
    rd.onload = () => res(String(rd.result).split(',')[1]);
    rd.onerror = () => rej(rd.error);
    rd.readAsDataURL(f);
  });
  const LIC_SCHEMA = {
    type: 'object', additionalProperties: false,
    required: ['firm_name', 'proprietor_name', 'address', 'locality', 'sub_tehsil', 'tehsil', 'district', 'pincode', 'phone', 'gstin', 'dl_form_20', 'dl_form_21', 'valid_upto', 'fssai_no', 'fssai_valid_upto'],
    properties: {
      firm_name: strS, proprietor_name: strS, phone: strS, gstin: strS,
      address: { type: 'string', description: 'House/shop number, street and landmark only' },
      locality: { type: 'string', description: 'Village, town or locality' }, sub_tehsil: strS, tehsil: strS, district: strS,
      pincode: { type: 'string', description: '6-digit PIN code' },
      fssai_no: { type: 'string', description: '14-digit FSSAI licence or registration number' },
      fssai_valid_upto: { type: 'string', description: 'YYYY-MM-DD, or empty if not printed' },
      dl_form_20: { type: 'string', description: 'Licence number on Form 20 / 20B (or 20C / 20F)' },
      dl_form_21: { type: 'string', description: 'Licence number on Form 21 / 21B (or 21C)' },
      valid_upto: { type: 'string', description: 'YYYY-MM-DD, or empty if not printed' },
    },
  };
  const LIC_PROMPT = `These files are documents of an Indian pharmacy business: drug licence certificates (Form 20 and 21 for retail, 20B and 21B for wholesale, or similar forms), an FSSAI food licence or registration certificate, and/or a GST registration certificate. Read them and return the business details.

- firm_name: the name of the firm or shop. On a GST certificate prefer the trade name; otherwise use the legal name.
- proprietor_name: the proprietor, partner or registered pharmacist.
- Split the premises address: address = house/shop number, street and landmark; locality = village, town or locality; sub_tehsil, tehsil and district as printed ("Teh." means tehsil, "Distt." means district); pincode = the 6-digit PIN.
- gstin: the 15-character GSTIN.
- dl_form_20: the licence number granted on Form 20 or 20B (or 20C / 20F). dl_form_21: the licence number on Form 21 or 21B (or 21C). If one certificate shows both numbers, split them.
- fssai_no: the 14-digit FSSAI licence or registration number. fssai_valid_upto: its validity date as YYYY-MM-DD.
- valid_upto: the drug licence validity or expiry date as YYYY-MM-DD. If the licences show different dates, use the earliest. Indian documents print dates as DD/MM/YYYY.
- phone: a phone number, if printed.

Copy text exactly as printed. Use an empty string for anything that is not printed. Do not guess.`;

  const extractBill = files => callClaudeJson(files, EXTRACT_PROMPT, BILL_SCHEMA, 32000);
  const extractLicence = files => callClaudeJson(files, LIC_PROMPT, LIC_SCHEMA, 4000);
  async function callClaudeJson(files, prompt, schema, maxTokens) {
    const Anthropic = await loadSdk();
    const client = new Anthropic({ apiKey: getApiKey(), dangerouslyAllowBrowser: true });
    const content = [];
    for (const f of files) {
      const data = await fileToBase64(f);
      if (f.type === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
      else content.push({ type: 'image', source: { type: 'base64', media_type: f.type, data } });
    }
    content.push({ type: 'text', text: prompt });
    try {
      const stream = client.beta.messages.stream({
        model: 'claude-opus-5-5',
        max_tokens: maxTokens,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { format: { type: 'json_schema', schema } },
        messages: [{ role: 'user', content }],
      });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') throw new Error('The AI declined to read this file. Try a clearer photo, or enter the details by hand.');
      if (msg.stop_reason === 'max_tokens') throw new Error('The file is too long to read in one go. Upload fewer pages at a time.');
      const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
      return JSON.parse(text);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new Error('The API key was not accepted. Check it in Settings.');
      if (err instanceof Anthropic.PermissionDeniedError) throw new Error('This API key is not allowed to use the model. Check your Anthropic account.');
      if (err instanceof Anthropic.RateLimitError) throw new Error('Too many requests right now. Wait a minute and try again.');
      if (err instanceof Anthropic.BadRequestError) throw new Error('The file could not be read: ' + (err.message || 'bad request') + '. Try a JPG/PNG photo or a smaller PDF.');
      if (err instanceof Anthropic.APIConnectionError) throw new Error('Could not reach Anthropic. Check your internet connection.');
      if (err instanceof Anthropic.APIError) throw new Error('Anthropic returned an error: ' + (err.message || err.status));
      if (err instanceof SyntaxError) throw new Error('The AI reply could not be understood. Please try again.');
      throw err;
    }
  }
  function entryFromExtraction(x, files) {
    const e = newEntry('AI', { files: files.map(f => f.name), fileObjs: files.slice() });
    e.supplierName = (x.seller_name || '').trim();
    e.gstin = (x.seller_gstin || '').trim().toUpperCase();
    const match = db.suppliers.find(s => (e.gstin && norm(s.gstin) === norm(e.gstin)) || norm(s.name) === norm(e.supplierName));
    e.supplierId = match ? match.id : '';
    e.billNo = (x.bill_no || '').trim();
    e.date = /^\d{4}-\d{2}-\d{2}$/.test(x.bill_date || '') && x.bill_date <= todayIso ? x.bill_date : todayIso;
    e.lines = (x.items || []).map(it => ({
      name: it.item_name || '', company: it.company || '', mfg: it.mfg_name || '', pack: it.pack || '', hsn: String(it.hsn || ''), batch: it.batch || '',
      exp: it.expiry || '', qty: num(it.qty), free: num(it.free), rate: num(it.rate), mrp: num(it.mrp), cd: num(it.cd_pct), td: num(it.td_pct), gst: num(it.gst_pct), amount: num(it.amount),
    }));
    e.printed = x.totals || null;
    e.csv = linesToCsv(e.lines);
    return e;
  }

  let searchQuery = '';
  VIEWS.search = () => {
    const q = searchQuery.toLowerCase();
    const has = (...v) => v.join(' ').toLowerCase().includes(q);
    const sections = [
      ['Products', db.products.filter(p => has(p.name, p.salt, p.id, company(p.companyId)?.name)), p => `${esc(p.name)} <span class="muted small">${esc(company(p.companyId)?.name || '')}</span>`, 'edit-product', p => p.id],
      ['Stock batches', db.batches.filter(b => avail(b) > 0 && has(b.batch, prod(b.productId)?.name)), b => `${esc(prod(b.productId)?.name)} <span class="muted small">Batch ${esc(b.batch)} · ${isoToExp(b.expiry)} · ${qty(avail(b))}</span>`, 'edit-batch', b => b.id],
      ['Chemists', db.chemists.filter(c => has(c.name, c.owner, c.city, c.id, c.gstin)), c => `${esc(c.name)} <span class="muted small">${esc(c.city)}</span>`, 'view-chemist', c => c.id],
      ['Suppliers', db.suppliers.filter(s => has(s.name, s.contact, s.city, s.id)), s => esc(s.name), 'view-supplier', s => s.id],
      ['Sale bills', db.sales.filter(s => has(s.no, partyName(s))).slice(0, 20), s => `${s.no} <span class="muted small">${esc(partyName(s))} · ${money(s.total)}</span>`, 'view-sale', s => s.no],
      ['Purchase orders', db.pos.filter(p => has(p.no, sup(p.supplierId)?.name)), p => `${p.no} <span class="muted small">${esc(sup(p.supplierId)?.name)}</span>`, 'view-po', p => p.no],
      ['Goods receipts', db.grns.filter(g => has(g.no, g.poNo, g.challan)), g => `${g.no} <span class="muted small">${esc(g.poNo)}</span>`, 'view-grn', g => g.no],
      ['Purchase invoices', db.pinvoices.filter(p => has(p.no, p.supplierInvNo, sup(p.supplierId)?.name)), p => `${p.no} <span class="muted small">${esc(p.supplierInvNo)}</span>`, 'view-pi', p => p.no],
    ].filter(s => s[1].length);
    if (!sections.length) return `<section class="card"><div class="empty">Nothing matches “${esc(searchQuery)}”.</div></section>`;
    return `<div class="grid g-2">${sections.map(([t, rows, label, act, id]) => `
      <section class="card"><div class="card-head"><h2 class="card-title">${t}</h2><span class="hint">${rows.length}</span></div>
        <div class="alert-list">${rows.map(r => `<div class="alert-item"><div style="flex:1;min-width:0">${label(r)}</div>${actBtn(act, id(r), 'Open', 'ghost')}</div>`).join('')}</div></section>`).join('')}</div>`;
  };

  // ---------- Render ----------
  let route = 'overview';
  function renderDatalists() {
    $('#datalists').innerHTML = `<datalist id="dl-products">${db.products.map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
      <datalist id="dl-companies">${db.companies.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
      <datalist id="dl-gst">${[0, 5, 12, 18, 28].map(g => `<option value="${g}">`).join('')}</datalist>`;
  }
  function render() {
    const hash = decodeURIComponent(location.hash.replace('#', ''));
    if (hash.startsWith('folder/') && sup(hash.slice(7))) {
      const id = hash.slice(7);
      if (id !== folderId) ['fbills', 'fitems', 'fsum'].forEach(k => delete listState[k]);
      folderId = id; route = 'folder';
    } else route = VIEWS[hash] && !['search', 'folder'].includes(hash) ? hash : 'overview';
    const r = searchQuery.length >= 2 ? 'search' : route;
    renderNav(r === 'search' ? '' : r === 'folder' ? 'suppliers' : route);
    renderDatalists();
    const item = r === 'folder' ? ['folder', `Supplier folder · ${sup(folderId).name}`] : NAV.flatMap(g => g.items).find(i => i[0] === r);
    $('#pageTitle').textContent = r === 'search' ? `Search: “${searchQuery}”` : item[1];
    $('#pageSub').textContent = `${SUBTITLES[r]} · ${TODAY.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
    document.title = `${r === 'search' ? 'Search' : item[1]} · ${db.settings.firm.name || 'Pharma Suite'}`;
    Object.keys(lists).forEach(k => delete lists[k]);
    $('#content').innerHTML = VIEWS[r]();
    Object.keys(lists).forEach(fillList);
  }
  const refresh = () => { save(); render(); };

  // ---------- Modal ----------
  let modalSubmit = null, modalCancel = null;
  function openModal({ title, body, submitLabel = 'Save', onSubmit, onCancel, size = '', extraFoot = '' }) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = `<form id="mform" novalidate>${body}</form>`;
    $('.modal').className = 'modal ' + size;
    $('#modalFoot').innerHTML = `${extraFoot}<button type="button" class="btn" data-close>${onSubmit ? 'Cancel' : 'Close'}</button>${onSubmit ? `<button type="button" class="btn primary" data-submit>${submitLabel}</button>` : ''}`;
    modalSubmit = onSubmit || null; modalCancel = onCancel || null; licPending = [];
    $('#modalBack').classList.add('open');
    const first = $('#mform input:not([readonly]):not([type=hidden]), #mform select');
    if (first) setTimeout(() => first.focus(), 30);
  }
  function closeModal(cancelled = true) {
    if (!$('#modalBack').classList.contains('open')) return;
    $('#modalBack').classList.remove('open');
    const c = modalCancel; modalSubmit = null; modalCancel = null;
    if (cancelled && c) c();
  }
  function submitModal() {
    const form = $('#mform');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const data = Object.fromEntries(new FormData(form).entries());
    const result = modalSubmit && modalSubmit(data, form);
    if (result === false) return;
    closeModal(false); refresh();
    if (typeof result === 'string') toast(result);
  }
  function confirmModal(title, text, label, onYes) {
    openModal({ title, body: `<p style="margin:0">${text}</p>`, submitLabel: label, size: 'sm', onSubmit: onYes });
    $('#modalFoot [data-submit]').classList.add('danger-solid');
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
  }

  const field = (label, name, { type = 'text', value = '', required = false, full = false, attrs = '', options = null } = {}) => `
    <div class="field ${full ? 'full' : ''}"><label for="f-${name}">${label}${required ? ' *' : ''}</label>
    ${options
      ? `<select id="f-${name}" name="${name}" ${required ? 'required' : ''} ${attrs}>${options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`
      : `<input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${attrs}>`}
    </div>`;
  const numAttrs = (step = '0.01') => `min="0" step="${step}" inputmode="decimal"`;
  const GSTIN_RE = '[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]';
  const detailGrid = pairs => `<div class="detail-grid">${pairs.map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div>`;
  const miniTable = (cols, rows) => `<div class="lines"><div class="table-wrap">${table(cols, rows)}</div></div>`;
  const GST_OPTS = [[0, '0%'], [5, '5%'], [12, '12%'], [18, '18%'], [28, '28%']];

  // ---------- Address (district first, then tehsil, sub-tehsil, village/locality) ----------
  const HP_DISTRICTS = ['Bilaspur', 'Chamba', 'Hamirpur', 'Kangra', 'Kinnaur', 'Kullu', 'Lahaul and Spiti', 'Mandi', 'Shimla', 'Sirmaur', 'Solan', 'Una'];
  const addrHolders = () => [db.settings.firm, ...db.chemists, ...db.suppliers];
  const placeCity = x => x.locality || x.tehsil || x.district || '';
  const addrText = x => {
    if (!x) return '';
    const parts = [x.address, x.locality, x.subTehsil && `Sub-Teh. ${x.subTehsil}`, x.tehsil && `Teh. ${x.tehsil}`, x.district && `Distt. ${x.district}`].filter(Boolean);
    if (!x.district && !x.tehsil && !x.locality && x.city && !String(x.address || '').includes(x.city)) parts.push(x.city);
    return parts.join(', ') + (x.pincode ? ` - ${x.pincode}` : '');
  };
  const usedValues = (key, district) => [...new Set(addrHolders().filter(h => !district || h.district === district).map(h => h[key]).filter(Boolean))].sort();
  const dlOptions = vals => vals.map(v => `<option value="${esc(v)}">`).join('');
  const addrFields = (x, required) => `
    <div class="field full form-sec">Address</div>
    ${field('District', 'district', { value: x.district || '', required, attrs: 'list="dl-a-district" autocomplete="off"' })}
    ${field('Tehsil', 'tehsil', { value: x.tehsil || '', required, attrs: 'list="dl-a-tehsil" autocomplete="off"' })}
    ${field('Sub-tehsil', 'subTehsil', { value: x.subTehsil || '', attrs: 'list="dl-a-subTehsil" autocomplete="off"' })}
    ${field('Village / locality', 'locality', { value: x.locality || '', required, attrs: 'list="dl-a-locality" autocomplete="off"' })}
    ${field('House / shop no., street, landmark', 'address', { value: x.address || '', full: true })}
    ${field('PIN code', 'pincode', { value: x.pincode || '', attrs: 'pattern="[1-9][0-9]{5}" inputmode="numeric" maxlength="6" title="6-digit PIN code"' })}
    ${field('Nearby hospital', 'hospital', { value: x.hospital || '', attrs: 'list="dl-a-hospital" autocomplete="off" placeholder="e.g. Civil Hospital Ghumarwin"' })}
    <datalist id="dl-a-district">${dlOptions([...new Set([...HP_DISTRICTS, ...usedValues('district')])].sort())}</datalist>
    ${['tehsil', 'subTehsil', 'locality', 'hospital'].map(k => `<datalist id="dl-a-${k}">${dlOptions(usedValues(k, x.district))}</datalist>`).join('')}`;
  // When the district changes, suggest only that district's tehsils, villages and hospitals
  function refreshAddrLists() {
    const d = $('#mform [name="district"]')?.value.trim();
    ['tehsil', 'subTehsil', 'locality', 'hospital'].forEach(k => { const el = $(`#dl-a-${k}`); if (el) el.innerHTML = dlOptions(usedValues(k, d)); });
  }
  const readAddr = d => {
    const a = { district: (d.district || '').trim(), tehsil: (d.tehsil || '').trim(), subTehsil: (d.subTehsil || '').trim(), locality: (d.locality || '').trim(), address: (d.address || '').trim(), pincode: (d.pincode || '').trim(), hospital: (d.hospital || '').trim() };
    a.city = placeCity(a);
    return a;
  };
  const addrOk = d => {
    if (d.pincode && !/^[1-9]\d{5}$/.test(String(d.pincode).trim())) { toast('PIN code must be 6 digits.'); return false; }
    if (d.fssai && !/^\d{14}$/.test(String(d.fssai).trim())) { toast('FSSAI licence number must be 14 digits.'); return false; }
    return true;
  };

  // ---------- Licences (drug licence 1 & 2, GSTIN, FSSAI, validity) ----------
  const dlText = x => [x?.dl1, x?.dl2].filter(Boolean).join(', ');
  const licValid = x => {
    if (!x?.dlValid) return '—';
    const d = daysFrom(x.dlValid);
    return `${fmtDate(x.dlValid)}${d < 0 ? ' ' + pill('Expired') : d <= 60 ? ' ' + pill('Near expiry') : ''}`;
  };
  const fssaiValid = x => {
    if (!x?.fssaiValid) return '—';
    const d = daysFrom(x.fssaiValid);
    return `${fmtDate(x.fssaiValid)}${d < 0 ? ' ' + pill('Expired') : d <= 60 ? ' ' + pill('Near expiry') : ''}`;
  };
  const soon = v => v && daysFrom(v) <= 60;
  const licCell = x => `<span class="small">${esc(x.dl1 || '—')}<br>${esc(x.dl2 || '')}${x.fssai ? `<br><span class="muted">FSSAI</span> ${esc(x.fssai)}` : ''}</span>${soon(x.dlValid) || soon(x.fssaiValid) ? `<div>${pill([x.dlValid, x.fssaiValid].some(v => v && daysFrom(v) < 0) ? 'Expired' : 'Near expiry')}</div>` : ''}`;
  const licFields = (x, required) => `
    <div class="field full form-sec">Licences</div>
    ${field('GSTIN', 'gstin', { value: x.gstin || '', attrs: `pattern="${GSTIN_RE}" title="15-character GSTIN, e.g. 02ABCDE1234F1Z5" style="text-transform:uppercase"` })}
    ${field('Drug licence 1 (Form 20 / 20B)', 'dl1', { value: x.dl1 || '', required })}
    ${field('Drug licence 2 (Form 21 / 21B)', 'dl2', { value: x.dl2 || '' })}
    ${field('Drug licence valid upto', 'dlValid', { type: 'date', value: x.dlValid || '' })}
    ${field('FSSAI licence / registration no.', 'fssai', { value: x.fssai || '', attrs: 'inputmode="numeric" maxlength="14" pattern="[0-9]{14}" title="14-digit FSSAI number"' })}
    ${field('FSSAI valid upto', 'fssaiValid', { type: 'date', value: x.fssaiValid || '' })}`;
  const readLic = d => ({ gstin: (d.gstin || '').trim().toUpperCase(), dl1: (d.dl1 || '').trim(), dl2: (d.dl2 || '').trim(), dlValid: d.dlValid || '', fssai: (d.fssai || '').trim(), fssaiValid: d.fssaiValid || '' });
  const licReadBox = kind => `<div class="lic-box">
      <div class="cta-icon">${icon('spark')}</div>
      <div style="flex:1;min-width:200px"><div class="strong">Fill from drug licence / FSSAI / GST certificate</div>
        <div class="small muted" id="licNote">Add photos or PDFs of the drug licences, FSSAI licence and GST certificate. AI reads them and fills the details below — check them before saving. The files are kept with this record.</div></div>
      <label class="btn sm">${icon('clip')}Choose files<input type="file" id="licFiles" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" multiple hidden></label>
      <button type="button" class="btn sm primary" data-lic-read="${kind}">${icon('spark')}Read with AI</button>
    </div>`;
  let licPending = [];
  const licHolder = (kind, id) => kind === 'firm' ? db.settings.firm : kind === 'chemist' ? chem(id) : sup(id);
  const licDocsBtn = (kind, id) => { const h = licHolder(kind, id); return h?.licFiles?.length ? `<button type="button" class="btn sm ghost" data-act="open-docs" data-id="lic:${kind}:${esc(id)}">${icon('clip')}${h.licFiles.length} file${h.licFiles.length === 1 ? '' : 's'}</button>` : '<span class="muted">None saved</span>'; };
  function fileLicence(kind, id) {
    const files = licPending; licPending = [];
    const h = licHolder(kind, id);
    if (h && files.length) fileDocs(`lic:${kind}:${id}`, h, 'licFiles', files);
  }
  async function readLicenceIntoForm(btn) {
    if (!licPending.length) { toast('Choose the licence or GST certificate files first.'); return; }
    if (!getApiKey()) { toast('Reading with AI needs your Anthropic API key (Settings). The chosen files will still be saved with this record.'); return; }
    const files = licPending.slice();
    btn.disabled = true; const label = btn.innerHTML; btn.textContent = 'Reading…';
    try {
      const x = await extractLicence(files);
      const phone = String(x.phone || '').replace(/\D/g, '').replace(/^(91|0)(?=[6-9]\d{9}$)/, '');
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(x.valid_upto || '') ? x.valid_upto : '';
      const fValid = /^\d{4}-\d{2}-\d{2}$/.test(x.fssai_valid_upto || '') ? x.fssai_valid_upto : '';
      const values = { name: x.firm_name, owner: x.proprietor_name, contact: x.proprietor_name, district: x.district, tehsil: x.tehsil, subTehsil: x.sub_tehsil, locality: x.locality, address: x.address, pincode: String(x.pincode || '').replace(/\D/g, ''), gstin: String(x.gstin || '').toUpperCase(), dl1: x.dl_form_20, dl2: x.dl_form_21, dlValid: valid, fssai: String(x.fssai_no || '').replace(/\s/g, ''), fssaiValid: fValid, phone };
      const filled = [];
      Object.entries(values).forEach(([name, v]) => {
        const el = $(`#mform [name="${name}"]`); v = String(v || '').trim();
        if (!el || !v) return;
        if (name === 'phone' && el.pattern && !new RegExp(`^(?:${el.pattern})$`).test(v)) return;
        el.value = v; el.classList.add('filled'); filled.push(el.closest('.field')?.querySelector('label')?.textContent.replace(' *', '') || name);
      });
      const note = $('#licNote');
      refreshAddrLists();
      if (note) note.textContent = filled.length ? `Filled from ${files.map(f => f.name).join(', ')}: ${filled.join(', ')}. Check the highlighted boxes, then save.` : 'Nothing could be read from these files. Enter the details by hand.';
      toast(filled.length ? `${filled.length} details filled — check them before saving.` : 'No details found in these files.');
    } catch (err) {
      toast(err.message || 'Could not read the files.');
    } finally {
      if (btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
    }
  }
  function migrate(d) {
    const fix = x => {
      if (!x) return;
      if (x.dl != null && !x.dl1 && !x.dl2) { const [a, ...rest] = String(x.dl).split(/\s*,\s*/); x.dl1 = a || ''; x.dl2 = rest.join(', '); }
      delete x.dl;
    };
    (d.chemists || []).forEach(fix); (d.suppliers || []).forEach(fix);
    // Old single-line addresses → district / tehsil / locality
    const splitAddr = x => {
      if (!x || x.district || x.tehsil || x.locality) return;
      const a = String(x.address || '');
      const teh = /Teh\.?\s*([^,]+)/i.exec(a)?.[1]?.trim() || '';
      const pin = /\b([1-9]\d{5})\b/.exec(a)?.[1] || '';
      const dist = HP_DISTRICTS.find(n => new RegExp(`\\b${n}\\b`, 'i').test(a)) || TOWN_DISTRICT[x.city] || TOWN_DISTRICT[teh] || '';
      const first = a.split(',')[0].trim();
      Object.assign(x, {
        district: dist, tehsil: teh || (x.city && x.city !== dist ? x.city : ''), subTehsil: '',
        locality: (teh && first && !/teh/i.test(first) ? first : '') || x.city || '', pincode: x.pincode || pin, hospital: x.hospital || '',
        address: teh || pin ? '' : a,
      });
      x.city = placeCity(x) || x.city || '';
    };
    [d.settings?.firm, ...(d.chemists || []), ...(d.suppliers || [])].forEach(splitAddr);
    return d;
  }

  // Printable bill (same layout as the paper bill)
  function billDoc({ title, no, date, partyHtml, extraHead = '', lines, t, paid, showBank = false }) {
    const f = db.settings.firm;
    const slabs = Object.entries(t.slabs || {}).filter(([, s]) => s.taxable).sort((a, b) => b[0] - a[0]);
    return `<div class="bill">
      <div class="bill-title">${title}</div>
      <div class="bill-head">
        <div><div class="bill-firm">${esc(f.name)}</div><div>${esc(addrText(f))}</div><div>Ph: ${esc(f.phone)}</div><div>GST NO: ${esc(f.gstin)}</div><div>DL NO: ${esc(f.dl1)}${f.dl2 ? ', ' + esc(f.dl2) : ''}</div>${f.fssai ? `<div>FSSAI NO: ${esc(f.fssai)}</div>` : ''}</div>
        <div><div><b>Bill no:</b> ${esc(no)}</div><div><b>Date:</b> ${fmtDate(date)}</div>${extraHead}</div>
        <div>${partyHtml}</div>
      </div>
      <div class="table-wrap"><table class="bill-table">
        <thead><tr><th>SN</th><th>Item name</th><th>Company</th><th>MFG</th><th>Pack</th><th>HSN</th><th>Batch</th><th>Exp</th><th class="r">Qty</th><th class="r">Free</th><th class="r">Rate</th><th class="r">MRP</th><th class="r">CD%</th><th class="r">TD%</th><th class="r">GST%</th><th class="r">Amount</th></tr></thead>
        <tbody>${lines.map((l, i) => { const p = prod(l.productId); return `<tr><td>${i + 1}</td><td class="strong">${esc(p?.name || l.name)}</td><td>${esc(company(p?.companyId)?.name || '')}</td><td>${esc(p?.mfg || '')}</td><td>${esc(p?.pack || '')}</td><td>${esc(p?.hsn || '')}</td><td>${esc(l.batch || '')}</td><td>${l.expiry ? isoToExp(l.expiry) : ''}</td><td class="r">${dec(l.qty)}</td><td class="r">${dec(l.free)}</td><td class="r">${dec(l.rate)}</td><td class="r">${dec(l.mrp)}</td><td class="r">${dec(l.cd)}</td><td class="r">${dec(l.td)}</td><td class="r">${dec(l.gst)}</td><td class="r">${dec(calcLine(l).amount)}</td></tr>`; }).join('')}</tbody>
      </table></div>
      <div class="bill-foot">
        <table class="bill-slabs"><thead><tr><th>GST%</th><th class="r">Taxable</th><th class="r">CGST</th><th class="r">SGST</th></tr></thead>
          <tbody>${slabs.map(([k, s]) => `<tr><td>${k}%</td><td class="r">${dec(s.taxable)}</td><td class="r">${dec(s.gst / 2)}</td><td class="r">${dec(s.gst / 2)}</td></tr>`).join('')}</tbody></table>
        <table class="bill-totals"><tbody>
          <tr><td>Gross amount</td><td class="r">${dec(t.gross)}</td></tr>
          <tr><td>Less CD</td><td class="r">-${dec(t.cd)}</td></tr>
          <tr><td>Less TD</td><td class="r">-${dec(t.td)}</td></tr>
          <tr><td>CGST</td><td class="r">${dec(t.cgst)}</td></tr>
          <tr><td>SGST</td><td class="r">${dec(t.sgst)}</td></tr>
          <tr><td>Round off</td><td class="r">${dec(t.roundOff)}</td></tr>
          <tr class="net"><td>Net amount</td><td class="r">${dec(t.total)}</td></tr>
          ${paid != null ? `<tr><td>Received / paid</td><td class="r">${dec(paid)}</td></tr><tr><td>Balance</td><td class="r">${dec(Math.max(0, t.total - paid))}</td></tr>` : ''}
        </tbody></table>
      </div>
      ${showBank ? `<div class="small muted">E. &amp; O.E. · Goods once sold will be taken back only as per terms.</div>` : ''}
    </div>`;
  }

  // ---------- Sale editor ----------
  function saleRowHtml(l = {}) {
    const opts = [...db.products].sort((a, b) => a.name.localeCompare(b.name)).map(p => { const q = sellableQty(p.id); return `<option value="${p.id}" ${p.id === l.productId ? 'selected' : ''} ${q <= 0 && p.id !== l.productId ? 'disabled' : ''}>${esc(p.name)}${q <= 0 ? ' (no stock)' : ''}</option>`; }).join('');
    return `<tr data-line>
      <td><input type="checkbox" class="cb" data-lsel aria-label="Tick line"></td>
      <td style="min-width:210px"><select data-f="productId"><option value="">Select item</option>${opts}</select></td>
      <td style="min-width:170px"><select data-f="batchId"></select></td>
      <td class="small" data-exp>—</td>
      <td><input data-f="qty" type="number" min="0" step="1" value="${l.qty || ''}" style="width:64px"></td>
      <td><input data-f="free" type="number" min="0" step="1" value="${l.free || ''}" style="width:56px"></td>
      <td><input data-f="rate" type="number" min="0" step="0.01" value="${l.rate ?? ''}" style="width:86px"></td>
      <td class="r small" data-mrp>—</td>
      <td><input data-f="cd" type="number" min="0" max="100" step="0.01" value="${l.cd ?? ''}" style="width:58px"></td>
      <td><input data-f="td" type="number" min="0" max="100" step="0.01" value="${l.td ?? ''}" style="width:58px"></td>
      <td class="r small" data-gst>—</td>
      <td class="r num" data-amt>—</td>
      <td><button type="button" class="btn ghost sm" data-rm-line aria-label="Remove line">✕</button></td>
    </tr>`;
  }
  function fillBatchOptions(tr, keepBatchId) {
    const pid = $('[data-f=productId]', tr).value;
    const sel = $('[data-f=batchId]', tr);
    const bs = pid ? sellableBatches(pid) : [];
    if (keepBatchId && !bs.some(b => b.id === keepBatchId)) { const kb = batchById(keepBatchId); if (kb) bs.unshift(kb); }
    sel.innerHTML = bs.length ? bs.map(b => `<option value="${b.id}" ${b.id === keepBatchId ? 'selected' : ''}>${esc(b.batch)} · ${isoToExp(b.expiry)} · ${qty(avail(b))} avl</option>`).join('') : '<option value="">No stock</option>';
  }
  function partyDefaults() {
    const type = $('#mform [name=ptype]:checked')?.value;
    if (type === 'chemist') { const c = chem($('#f-chemistId')?.value); return { cd: c ? c.cd || 0 : db.settings.defaultCd || 0, td: c ? c.td || 0 : 0 }; }
    return { cd: 0, td: 0 };
  }
  function recalcSale() {
    const body = $('#lineBody'); if (!body) return;
    const used = {};
    $$('tr[data-line]', body).forEach(tr => {
      const b = batchById($('[data-f=batchId]', tr).value);
      const p = prod($('[data-f=productId]', tr).value);
      const l = readSaleRow(tr);
      $('[data-exp]', tr).textContent = b ? isoToExp(b.expiry) : '—';
      $('[data-mrp]', tr).textContent = b ? dec(b.mrp) : '—';
      $('[data-gst]', tr).textContent = b ? dec(b.gst ?? p?.gst) + '%' : '—';
      $('[data-amt]', tr).textContent = p && l.qty ? dec(calcLine(l).amount) : '—';
      if (b) { used[b.id] = (used[b.id] || 0) + l.qty + l.free; }
      const over = b && used[b.id] > avail(b);
      $('[data-f=qty]', tr).classList.toggle('invalid', !!over);
    });
    const t = billCalc(readSaleLines());
    $('#tGross').textContent = dec(t.gross); $('#tCd').textContent = dec(t.cd); $('#tTd').textContent = dec(t.td);
    $('#tGst').textContent = dec(t.gst); $('#tRo').textContent = dec(t.roundOff); $('#tTot').textContent = money2(t.total);
  }
  function updateSaleSel() {
    const boxes = $$('#lineBody [data-lsel]'); const n = boxes.filter(c => c.checked).length;
    const el = $('#sbN'); if (el) el.textContent = n ? `${n} ticked line${n === 1 ? '' : 's'}` : 'All lines';
    const all = $('[data-lselall]'); if (all) { all.checked = n > 0 && n === boxes.length; all.indeterminate = n > 0 && n < boxes.length; }
  }
  function readSaleRow(tr) {
    const b = batchById($('[data-f=batchId]', tr).value);
    const p = prod($('[data-f=productId]', tr).value);
    return {
      productId: p?.id || '', batchId: b?.id || '', batch: b?.batch || '', expiry: b?.expiry || '',
      qty: Math.floor(num($('[data-f=qty]', tr).value)), free: Math.floor(num($('[data-f=free]', tr).value)),
      rate: round2(num($('[data-f=rate]', tr).value)), mrp: b?.mrp || p?.mrp || 0,
      cd: num($('[data-f=cd]', tr).value), td: num($('[data-f=td]', tr).value), gst: b ? (b.gst ?? p?.gst) : (p?.gst || 0),
    };
  }
  const readSaleLines = () => $$('#lineBody tr[data-line]').map(readSaleRow).filter(l => l.productId && l.batchId && l.qty + l.free > 0);

  function deductLine(l) {
    const b = batchById(l.batchId);
    let need = l.qty + (l.free || 0);
    const fromQty = Math.min(b.qty, need); b.qty -= fromQty; need -= fromQty;
    const fromFree = Math.min(b.free || 0, need); b.free = (b.free || 0) - fromFree;
    l.alloc = { fromQty, fromFree };
  }
  function restoreLine(l) {
    const a = l.alloc || { fromQty: l.qty + (l.free || 0), fromFree: 0 };
    let b = batchById(l.batchId);
    if (!b) {
      const p = prod(l.productId); if (!p) return;
      b = { id: l.batchId || uid(), productId: l.productId, batch: l.batch, expiry: l.expiry, qty: 0, free: 0, rate: p.pts, mrp: l.mrp, cd: 0, td: 0, gst: l.gst, source: 'Restored from deleted bill', verified: false };
      db.batches.push(b);
    }
    b.qty += a.fromQty; b.free = (b.free || 0) + a.fromFree;
  }

  function saleModal(existing, preset = {}) {
    // When editing, put the bill's stock back first; it is taken again on save (or re-applied on cancel).
    if (existing) existing.lines.forEach(restoreLine);
    const s = existing || { party: { type: 'chemist', chemistId: preset.chemistId || '' }, date: todayIso, lines: preset.lines || [], paid: 0, mode: 'Credit' };
    const chemOpts = [['', 'Select chemist'], ...db.chemists.filter(c => c.status === 'Active' || c.id === s.party.chemistId).map(c => [c.id, `${c.name} — ${c.city}`])];
    const isChem = s.party.type === 'chemist';
    openModal({
      title: existing ? `Edit sale bill ${existing.no}` : preset.orderId ? `Sale bill for order ${preset.orderId}` : 'New sale bill', size: 'xl', submitLabel: existing ? 'Save changes' : 'Create bill',
      body: `
        <div class="seg"><label><input type="radio" name="ptype" value="chemist" ${isChem ? 'checked' : ''}> Chemist (B2B)</label><label><input type="radio" name="ptype" value="individual" ${!isChem ? 'checked' : ''}> Individual / walk-in (B2C)</label></div>
        <div class="form-grid g4">
          <div class="field ${isChem ? '' : 'hidden'}" data-pt="chemist"><label for="f-chemistId">Chemist</label><select id="f-chemistId" name="chemistId">${chemOpts.map(([v, l]) => `<option value="${esc(v)}" ${v === (s.party.chemistId || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          <div class="field ${isChem ? 'hidden' : ''}" data-pt="individual"><label for="f-cname">Customer name</label><input id="f-cname" name="cname" value="${esc(s.party.name || '')}"></div>
          <div class="field ${isChem ? 'hidden' : ''}" data-pt="individual"><label for="f-cphone">Mobile</label><input id="f-cphone" name="cphone" type="tel" value="${esc(s.party.phone || '')}"></div>
          ${field('Bill date', 'date', { type: 'date', value: s.date, required: true, attrs: `max="${todayIso}"` })}
          ${field('Term', 'mode', { value: s.mode || 'Credit', options: ['Credit', 'Cash', 'UPI', 'Card'] })}
        </div>
        <div id="chemInfo" class="small muted"></div>
        <div class="lines"><div class="table-wrap"><table>
          <thead><tr><th><input type="checkbox" class="cb" data-lselall aria-label="Tick all lines"></th><th>Item</th><th>Batch</th><th>Exp</th><th>Qty</th><th>Free</th><th>Rate ₹</th><th class="r">MRP</th><th>CD%</th><th>TD%</th><th class="r">GST</th><th class="r">Amount</th><th></th></tr></thead>
          <tbody id="lineBody">${(s.lines.length ? s.lines : [{}]).map(saleRowHtml).join('')}</tbody></table></div>
          <div class="add-line bulk-inline"><button type="button" class="btn sm" data-add-line>+ Add line</button>
            <span class="spacer"></span>
            <span class="small strong" id="sbN">All lines</span>
            <label class="bf"><span>CD%</span><input id="sbCd" inputmode="decimal" placeholder="—"></label>
            <label class="bf"><span>TD%</span><input id="sbTd" inputmode="decimal" placeholder="—"></label>
            <button type="button" class="btn sm primary" data-sbulk>Apply discount</button></div></div>
        <div class="totals wrap"><div>Gross <b id="tGross" class="num">0</b></div><div>Less CD <b id="tCd" class="num">0</b></div><div>Less TD <b id="tTd" class="num">0</b></div><div>GST <b id="tGst" class="num">0</b></div><div>Round off <b id="tRo" class="num">0</b></div><div class="grand">Net <span id="tTot" class="num">₹0</span></div></div>
        <div class="form-grid g4">${field('Payment received (₹)', 'paid', { type: 'number', value: s.paid || 0, attrs: numAttrs() })}</div>
        <div class="small muted">Stock is taken from the batch you pick (earliest expiry is picked first). Qty is taken before free goods.</div>`,
      onCancel: existing ? () => existing.lines.forEach(deductLine) : null,
      onSubmit: d => {
        const lines = readSaleLines();
        if (!lines.length) { toast('Add at least one item with a quantity.'); return false; }
        const type = d.ptype;
        if (type === 'chemist' && !d.chemistId) { toast('Choose a chemist, or switch to Individual.'); return false; }
        if (type === 'individual' && !String(d.cname || '').trim()) { toast('Enter the customer’s name.'); return false; }
        const need = {};
        lines.forEach(l => { need[l.batchId] = (need[l.batchId] || 0) + l.qty + l.free; });
        for (const bid in need) {
          const b = batchById(bid);
          if (need[bid] > avail(b)) { toast(`Batch ${b.batch} of ${prod(b.productId).name} has only ${qty(avail(b))} in stock.`); return false; }
        }
        lines.forEach(deductLine);
        const t = billCalc(lines);
        const party = type === 'chemist' ? { type, chemistId: d.chemistId } : { type, name: d.cname.trim(), phone: (d.cphone || '').trim() };
        const paid = Math.min(t.total, round2(num(d.paid)));
        if (existing) {
          Object.assign(existing, { date: d.date, party, lines, ...t, paid, mode: d.mode });
          return `${existing.no} updated — stock adjusted.`;
        }
        const no = nextNo('SMS-', db.sales);
        db.sales.push({ no, date: d.date, party, lines, ...t, paid, mode: d.mode, ...(preset.orderId ? { orderId: preset.orderId } : {}) });
        if (preset.orderId) setOrder(preset.orderId, { status: 'Billed', saleNo: no });
        const c = type === 'chemist' ? chem(d.chemistId) : null;
        return c && chemOutstanding(c.id) > c.creditLimit ? `${no} created. Note: ${c.name} is now above their credit limit.` : `${no} created for ${money(t.total)} — stock deducted.`;
      },
    });
    $$('#lineBody tr[data-line]').forEach((tr, i) => { if (s.lines[i]) fillBatchOptions(tr, s.lines[i].batchId); });
    recalcSale();
    const showInfo = () => {
      const c = chem($('#f-chemistId').value);
      $('#chemInfo').innerHTML = c ? `Credit limit ${money(c.creditLimit)} · outstanding ${money(chemOutstanding(c.id))} · terms ${c.terms} days · default CD ${dec(c.cd)}%` : '';
    };
    $('#f-chemistId').addEventListener('change', () => {
      showInfo();
      const d = partyDefaults();
      $$('#lineBody tr[data-line]').forEach(tr => { if ($('[data-f=productId]', tr).value) { $('[data-f=cd]', tr).value = d.cd; $('[data-f=td]', tr).value = d.td; } });
      recalcSale();
    });
    $$('#mform [name=ptype]').forEach(r => r.addEventListener('change', () => {
      const t = $('#mform [name=ptype]:checked').value;
      $$('#mform [data-pt]').forEach(el => el.classList.toggle('hidden', el.dataset.pt !== t));
      $('#f-mode').value = t === 'individual' ? 'Cash' : 'Credit';
    }));
    showInfo();
  }

  // ---------- Simple line editor (purchase orders) ----------
  function poRowHtml(l = {}) {
    const opts = [...db.products].sort((a, b) => a.name.localeCompare(b.name)).map(p => `<option value="${p.id}" ${p.id === l.productId ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    return `<tr data-line>
      <td style="min-width:220px"><select data-f="productId"><option value="">Select item</option>${opts}</select></td>
      <td><input data-f="qty" type="number" min="1" step="1" value="${l.qty || ''}" style="width:80px"></td>
      <td><input data-f="rate" type="number" min="0" step="0.01" value="${l.rate ?? ''}" style="width:96px"></td>
      <td class="r small" data-gst>—</td><td class="r num" data-amt>—</td>
      <td><button type="button" class="btn ghost sm" data-rm-line aria-label="Remove line">✕</button></td></tr>`;
  }
  const readPoLines = () => $$('#lineBody tr[data-line]').map(tr => {
    const p = prod($('[data-f=productId]', tr).value);
    return { productId: p?.id || '', qty: Math.floor(num($('[data-f=qty]', tr).value)), rate: round2(num($('[data-f=rate]', tr).value)), gst: p?.gst || 0 };
  }).filter(l => l.productId && l.qty > 0);
  function recalcPo() {
    $$('#lineBody tr[data-line]').forEach(tr => {
      const p = prod($('[data-f=productId]', tr).value); const q = num($('[data-f=qty]', tr).value), r = num($('[data-f=rate]', tr).value);
      $('[data-gst]', tr).textContent = p ? dec(p.gst) + '%' : '—';
      $('[data-amt]', tr).textContent = p && q ? dec(q * r) : '—';
    });
    const t = billCalc(readPoLines());
    $('#tGross').textContent = dec(t.gross); $('#tGst').textContent = dec(t.gst); $('#tTot').textContent = money2(t.total);
  }

  // GRN line editor (driven by a purchase order)
  function grnLines(poNo) {
    const po = db.pos.find(p => p.no === poNo);
    if (!po) return '<div class="muted">Select a purchase order to see its items.</div>';
    const rows = po.lines.map((l, i) => {
      const p = prod(l.productId); const rec = receivedQty(po.no, l.productId); const pend = Math.max(0, l.qty - rec);
      const dis = pend ? '' : 'disabled';
      return `<tr data-gline="${i}" data-pending="${pend}">
        <td><span class="strong">${esc(p?.name)}</span><div class="small muted">Ordered ${qty(l.qty)} · received ${qty(rec)}</div></td>
        <td class="r">${qty(pend)}</td>
        <td><input data-g="batch" placeholder="Batch" style="width:110px" ${dis}></td>
        <td><input data-g="exp" placeholder="MM/YY" style="width:70px" ${dis}></td>
        <td><input data-g="qty" type="number" min="0" max="${pend}" step="1" value="${pend}" style="width:70px" ${dis}></td>
        <td><input data-g="free" type="number" min="0" step="1" value="0" style="width:56px" ${dis}></td>
        <td><input data-g="rate" type="number" min="0" step="0.01" value="${l.rate}" style="width:84px" ${dis}></td>
        <td><input data-g="mrp" type="number" min="0" step="0.01" value="${p?.mrp ?? ''}" style="width:84px" ${dis}></td>
        <td><input data-g="cd" type="number" min="0" step="0.01" value="0" style="width:56px" ${dis}></td>
      </tr>`;
    }).join('');
    return `<div class="lines"><div class="table-wrap"><table><thead><tr><th>Item</th><th class="r">Pending</th><th>Batch</th><th>Exp</th><th>Qty</th><th>Free</th><th>Rate</th><th>MRP</th><th>CD%</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  // Add received/purchased lines to stock
  function addToStock(lines, { supplierId, source, verified }) {
    lines.forEach(l => {
      const b = db.batches.find(x => x.productId === l.productId && norm(x.batch) === norm(l.batch));
      if (b) {
        b.qty += l.qty; b.free = (b.free || 0) + (l.free || 0);
        Object.assign(b, { rate: l.rate, mrp: l.mrp || b.mrp, cd: l.cd, td: l.td, gst: l.gst, expiry: l.expiry || b.expiry, source, supplierId });
        if (!verified) b.verified = false;
      } else {
        db.batches.push({ id: uid(), productId: l.productId, batch: l.batch, expiry: l.expiry, qty: l.qty, free: l.free || 0, rate: l.rate, mrp: l.mrp, cd: l.cd || 0, td: l.td || 0, gst: l.gst, supplierId, source, verified });
      }
    });
  }
  // Take stock back out (used when deleting a GRN or an uploaded bill)
  function removeFromStock(lines) {
    const short = [];
    lines.forEach(l => {
      const b = db.batches.find(x => x.productId === l.productId && norm(x.batch) === norm(l.batch));
      const need = l.qty + (l.free || 0);
      if (!b || avail(b) < need) short.push(`${prod(l.productId)?.name || l.name} (${l.batch})`);
    });
    if (short.length) return short;
    lines.forEach(l => {
      const b = db.batches.find(x => x.productId === l.productId && norm(x.batch) === norm(l.batch));
      let need = l.qty + (l.free || 0);
      const fq = Math.min(b.qty, need); b.qty -= fq; need -= fq; b.free = (b.free || 0) - need;
    });
    return [];
  }

  // ---------- Actions ----------
  const ACTIONS = {};

  // Sales
  ACTIONS['new-sale'] = () => saleModal(null);
  ACTIONS['edit-sale'] = no => { const s = db.sales.find(x => x.no === no); if (s) saleModal(s); };
  ACTIONS['view-sale'] = no => {
    const s = db.sales.find(x => x.no === no); if (!s) return;
    const c = s.party.type === 'chemist' ? chem(s.party.chemistId) : null;
    const partyHtml = c
      ? `<div class="strong">M/S: ${esc(c.name)}</div><div>${esc(addrText(c))}</div><div>DL NO: ${esc(dlText(c) || '—')}</div>${c.fssai ? `<div>FSSAI NO: ${esc(c.fssai)}</div>` : ''}<div>GST NO: ${esc(c.gstin || '—')}</div><div>Mob: ${esc(c.phone)}</div>`
      : `<div class="strong">${esc(s.party.name)}</div><div>Mob: ${esc(s.party.phone || '—')}</div><div class="small muted">Individual customer</div>`;
    openModal({
      title: `Sale bill ${s.no}`, size: 'xl',
      extraFoot: `<div class="foot-left">${balance(s) > 0.5 ? `<button type="button" class="btn gold" data-act="pay-sale" data-id="${s.no}">Record payment</button>` : ''}<button type="button" class="btn" data-act="print" data-id="">Print</button><button type="button" class="btn" data-act="edit-sale" data-id="${s.no}">Edit</button></div>`,
      body: billDoc({ title: 'SALE BILL', no: s.no, date: s.date, partyHtml, extraHead: `<div><b>Term:</b> ${esc(s.mode || 'Credit')}</div><div><b>Status:</b> ${saleStatus(s)}</div>`, lines: s.lines, t: s, paid: s.paid, showBank: true }),
    });
  };
  ACTIONS['pay-sale'] = no => {
    const s = db.sales.find(x => x.no === no); if (!s) return;
    openModal({
      title: `Receive payment · ${s.no}`, submitLabel: 'Save payment', size: 'sm',
      body: `${detailGrid([['Party', esc(partyName(s))], ['Bill total', money2(s.total)], ['Balance', money2(balance(s))]])}
        <div class="form-grid">
          ${field('Amount (₹)', 'amount', { type: 'number', value: balance(s), required: true, attrs: `min="0.01" max="${balance(s)}" step="0.01"` })}
          ${field('Mode', 'mode', { options: ['UPI', 'NEFT / RTGS', 'Cheque', 'Cash'] })}
        </div>`,
      onSubmit: d => { const a = Math.min(num(d.amount), balance(s)); s.paid = round2((s.paid || 0) + a); return `Payment of ${money(a)} recorded on ${s.no}.`; },
    });
  };
  ACTIONS['del-sale'] = no => {
    const s = db.sales.find(x => x.no === no); if (!s) return;
    confirmModal(`Delete ${s.no}?`, `This removes the bill for <b>${esc(partyName(s))}</b> (${money(s.total)}) and puts its ${s.lines.length} item line(s) back into stock. This cannot be undone.`, 'Delete bill', () => {
      s.lines.forEach(restoreLine); db.sales = db.sales.filter(x => x !== s); return `${no} deleted — stock returned.`;
    });
  };

  // Products & masters
  function productForm(p = {}) {
    return `<div class="form-grid">
      ${field('Item name', 'name', { value: p.name || '', required: true, full: true })}
      ${field('Company / brand', 'company', { value: company(p.companyId)?.name || '', required: true, attrs: 'list="dl-companies"' })}
      ${field('MFG name', 'mfg', { value: p.mfg || '' })}
      ${field('Category', 'categoryId', { value: p.categoryId || defaultCategoryId(), options: db.categories.map(c => [c.id, c.name]) })}
      ${field('Form', 'form', { value: p.form || 'Tablet', options: db.forms.map(f => f.name) })}
      ${field('Pack', 'pack', { value: p.pack || '', required: true, attrs: 'placeholder="e.g. 10TAB, 100ML"' })}
      ${field('HSN code', 'hsn', { value: p.hsn || '30049099', required: true, attrs: 'pattern="[0-9]{4,8}"' })}
      ${field('Salt / composition', 'salt', { value: p.salt || '' })}
      ${field('GST %', 'gst', { value: p.gst ?? 12, options: GST_OPTS })}
      ${field('MRP (₹)', 'mrp', { type: 'number', value: p.mrp ?? '', required: true, attrs: numAttrs() })}
      ${field('Sale rate to chemist (₹)', 'ptr', { type: 'number', value: p.ptr ?? '', required: true, attrs: numAttrs() })}
      ${field('Purchase rate (₹)', 'pts', { type: 'number', value: p.pts ?? '', required: true, attrs: numAttrs() })}
      ${field('Reorder level', 'reorder', { type: 'number', value: p.reorder ?? 10, required: true, attrs: numAttrs('1') })}
    </div>`;
  }
  function readProduct(d, p) {
    Object.assign(p, {
      name: norm(d.name), companyId: findOrCreateCompany(d.company), mfg: d.mfg.trim(), categoryId: d.categoryId, form: d.form, pack: d.pack.trim(), hsn: d.hsn.trim(), salt: (d.salt || '').trim(),
      gst: num(d.gst), mrp: round2(num(d.mrp)), ptr: round2(num(d.ptr)), pts: round2(num(d.pts)), reorder: Math.floor(num(d.reorder)),
    });
  }
  const productCheck = (d, self) => {
    if (num(d.ptr) > num(d.mrp)) { toast('Sale rate cannot be above MRP.'); return false; }
    const dup = findProductByName(d.name); if (dup && dup !== self) { toast(`${dup.name} already exists.`); return false; }
    return true;
  };
  ACTIONS['new-product'] = () => openModal({
    title: 'Add product', body: productForm(), submitLabel: 'Add product',
    onSubmit: d => { if (!productCheck(d, null)) return false; const p = { id: nextId('P', db.products) }; readProduct(d, p); db.products.push(p); return `${p.name} added. Use “Add stock” to enter its batches.`; },
  });
  ACTIONS['edit-product'] = id => {
    const p = prod(id); if (!p) return;
    openModal({ title: `Edit ${p.name}`, body: productForm(p), onSubmit: d => { if (!productCheck(d, p)) return false; readProduct(d, p); return `${p.name} updated.`; } });
  };
  ACTIONS['del-product'] = id => {
    const p = prod(id); if (!p) return;
    const inStock = db.batches.some(b => b.productId === id && avail(b) > 0);
    const used = db.sales.some(s => s.lines.some(l => l.productId === id)) || db.pos.some(o => o.lines.some(l => l.productId === id)) || db.grns.some(g => g.lines.some(l => l.productId === id)) || db.pinvoices.some(i => (i.lines || []).some(l => l.productId === id));
    if (inStock || used) { toast(`${p.name} has stock or appears on bills, so it can’t be deleted. Set its stock to zero or keep it.`); return; }
    confirmModal(`Delete ${p.name}?`, 'The product and its empty batches will be removed. This cannot be undone.', 'Delete product', () => {
      db.products = db.products.filter(x => x !== p); db.batches = db.batches.filter(b => b.productId !== id); return `${p.name} deleted.`;
    });
  };
  ACTIONS['master-add'] = kind => openModal({
    title: `Add ${MASTER_LABEL[kind][1]}`, size: 'sm', body: `<div class="form-grid">${field('Name', 'name', { required: true, full: true })}</div>`,
    onSubmit: d => {
      const name = kind === 'companies' ? norm(d.name) : d.name.trim();
      if (db[kind].some(m => norm(m.name) === norm(name))) { toast(`${name} already exists.`); return false; }
      db[kind].push({ id: nextId({ companies: 'M', categories: 'K', forms: 'F' }[kind], db[kind], 2), name }); return `${name} added.`;
    },
  });
  ACTIONS['master-edit'] = v => {
    const [kind, id] = v.split('|'); const m = db[kind].find(x => x.id === id); if (!m) return;
    openModal({
      title: `Edit ${MASTER_LABEL[kind][1]}`, size: 'sm', body: `<div class="form-grid">${field('Name', 'name', { value: m.name, required: true, full: true })}</div>`,
      onSubmit: d => {
        const name = kind === 'companies' ? norm(d.name) : d.name.trim();
        if (db[kind].some(x => x !== m && norm(x.name) === norm(name))) { toast(`${name} already exists.`); return false; }
        if (kind === 'forms') db.products.filter(p => p.form === m.name).forEach(p => { p.form = name; });
        m.name = name; return `${name} saved.`;
      },
    });
  };
  ACTIONS['master-del'] = v => {
    const [kind, id] = v.split('|'); const m = db[kind].find(x => x.id === id); if (!m) return;
    const n = masterUsage[kind](id);
    if (n) { toast(`${m.name} is used by ${n} product(s). Change those products first.`); return; }
    confirmModal(`Delete ${m.name}?`, 'This cannot be undone.', 'Delete', () => { db[kind] = db[kind].filter(x => x !== m); return `${m.name} deleted.`; });
  };

  // Stock batches
  function batchForm(b = {}) {
    const isNew = !b.id;
    return `<div class="form-grid g3">
      ${isNew ? field('Item', 'productId', { required: true, full: true, value: b.productId || '', options: [['', 'Select item'], ...[...db.products].sort((x, y) => x.name.localeCompare(y.name)).map(p => [p.id, p.name])] }) : `<div class="field full"><label>Item</label><div class="strong">${esc(prod(b.productId)?.name)}</div></div>`}
      ${field('Batch', 'batch', { value: b.batch || '', required: true })}
      ${field('Expiry (MM/YY)', 'exp', { value: b.expiry ? isoToExp(b.expiry) : '', required: true, attrs: 'pattern="(0[1-9]|1[0-2])/[0-9]{2}" placeholder="01/28"' })}
      ${field('Supplier', 'supplierId', { value: b.supplierId || '', options: [['', '—'], ...db.suppliers.map(s => [s.id, s.name])] })}
      ${field('Qty', 'qty', { type: 'number', value: b.qty ?? '', required: true, attrs: numAttrs('1') })}
      ${field('Free', 'free', { type: 'number', value: b.free ?? 0, attrs: numAttrs('1') })}
      ${field('Rate (₹)', 'rate', { type: 'number', value: b.rate ?? '', required: true, attrs: numAttrs() })}
      ${field('MRP (₹)', 'mrp', { type: 'number', value: b.mrp ?? '', required: true, attrs: numAttrs() })}
      ${field('CD %', 'cd', { type: 'number', value: b.cd ?? 0, attrs: numAttrs() })}
      ${field('TD %', 'td', { type: 'number', value: b.td ?? 0, attrs: numAttrs() })}
      ${field('GST %', 'gst', { value: b.gst ?? 12, options: GST_OPTS })}
    </div>`;
  }
  function readBatch(d, b) {
    Object.assign(b, { batch: d.batch.trim().toUpperCase(), expiry: expToIso(d.exp), supplierId: d.supplierId, qty: Math.floor(num(d.qty)), free: Math.floor(num(d.free)), rate: round2(num(d.rate)), mrp: round2(num(d.mrp)), cd: num(d.cd), td: num(d.td), gst: num(d.gst) });
  }
  ACTIONS['new-batch'] = () => {
    openModal({
      title: 'Add stock', size: 'lg', body: batchForm(), submitLabel: 'Add to stock',
      onSubmit: d => {
        if (!expToIso(d.exp)) { toast('Expiry must be MM/YY.'); return false; }
        const exists = db.batches.find(x => x.productId === d.productId && norm(x.batch) === norm(d.batch));
        if (exists) { toast('This batch already exists — edit it instead.'); return false; }
        const b = { id: uid(), productId: d.productId, source: 'Manual entry', verified: true }; readBatch(d, b); db.batches.push(b);
        return `Batch ${b.batch} added to stock.`;
      },
    });
    $('#f-productId').addEventListener('change', e => {
      const p = prod(e.target.value); if (!p) return;
      $('#f-rate').value = p.pts; $('#f-mrp').value = p.mrp; $('#f-gst').value = p.gst; $('#f-cd').value = db.settings.defaultCd || 0;
    });
  };
  ACTIONS['edit-batch'] = id => {
    const b = batchById(id); if (!b) return;
    openModal({
      title: `Edit stock · ${prod(b.productId)?.name}`, size: 'lg', body: batchForm(b) + `<label class="check-line"><input type="checkbox" name="verified" ${b.verified ? 'checked' : ''}> Checked against the bill</label>`,
      onSubmit: d => {
        if (!expToIso(d.exp)) { toast('Expiry must be MM/YY.'); return false; }
        if (db.batches.some(x => x !== b && x.productId === b.productId && norm(x.batch) === norm(d.batch))) { toast('Another line already has this batch.'); return false; }
        readBatch(d, b); b.verified = !!d.verified; return `Batch ${b.batch} updated.`;
      },
    });
  };
  ACTIONS['del-batch'] = id => {
    const b = batchById(id); if (!b) return;
    confirmModal(`Delete batch ${b.batch}?`, `This removes ${qty(avail(b))} units of <b>${esc(prod(b.productId)?.name)}</b> from stock. Bills that used this batch keep their record. This cannot be undone.`, 'Delete batch', () => {
      db.batches = db.batches.filter(x => x !== b); return `Batch ${b.batch} deleted.`;
    });
  };
  ACTIONS['verify-batch'] = id => { const b = batchById(id); if (!b) return; b.verified = true; refresh(); toast(`Batch ${b.batch} marked checked.`); };
  ACTIONS['verify-all'] = () => {
    const list = db.batches.filter(b => !b.verified && avail(b) > 0);
    confirmModal('Mark all lines checked?', `${list.length} stock lines added from bills will be marked as checked. Only do this after comparing them with the paper bills.`, 'Mark checked', () => { list.forEach(b => { b.verified = true; }); return `${list.length} lines marked checked.`; });
  };

  // Chemists
  const chemistForm = (c = {}) => `${licReadBox('chemist')}<div class="form-grid">
      ${field('Firm name', 'name', { value: c.name || '', required: true })}
      ${field('Owner / pharmacist', 'owner', { value: c.owner || '', required: true })}
      ${field('Mobile', 'phone', { type: 'tel', value: c.phone || '', required: true, attrs: 'pattern="[6-9][0-9]{9}" title="10-digit mobile number"' })}
      ${addrFields(c, true)}
      ${licFields(c, true)}
      <div class="field full form-sec">Credit &amp; discount</div>
      ${field('Credit limit (₹)', 'creditLimit', { type: 'number', value: c.creditLimit ?? 100000, required: true, attrs: numAttrs('1') })}
      ${field('Payment terms (days)', 'terms', { type: 'number', value: c.terms ?? 14, required: true, attrs: numAttrs('1') })}
      ${field('Default CD %', 'cd', { type: 'number', value: c.cd ?? db.settings.defaultCd ?? 0, attrs: numAttrs() })}
      ${field('Default TD %', 'td', { type: 'number', value: c.td ?? 0, attrs: numAttrs() })}
    </div>`;
  const readChemist = (d, c) => Object.assign(c, { name: d.name.trim(), owner: d.owner.trim(), phone: d.phone, ...readAddr(d), ...readLic(d), creditLimit: num(d.creditLimit), terms: num(d.terms), cd: num(d.cd), td: num(d.td) });
  // Portal login section inside the chemist form: optional when onboarding, edits the login when it exists
  const chemistPortalBlock = c => !SERVER ? '' : `<label class="check-line"><input type="checkbox" name="pWant" id="pWant" ${portalLogins[c.id] ? 'checked disabled' : ''}> ${portalLogins[c.id] ? 'Has a portal login' : 'Create a portal login for this chemist'}</label>
    <div id="pBlock" class="${portalLogins[c.id] ? '' : 'hidden'}">${portalFields(c, portalLogins[c.id])}</div>`;
  function afterChemistSave(c, d) {
    if (!SERVER) return;
    const l = portalLogins[c.id];
    if (!l && !d.pWant) return;
    if (l && !d.pPass && String(d.pUser || '').trim().toLowerCase() === l.username && !!d.pActive === l.active) return;
    savePortalLogin(c, d).then(msg => { render(); if (d.pPass) showNotice(msg); else toast(msg); }).catch(err => toast(`${c.name} was saved, but the login was not: ${err.message}`));
  }
  const portalFieldsOk = d => {
    if (!SERVER || !(d.pWant || d.pUser)) return true;
    if (!(d.pWant || portalLogins[d._id])) return true;
    if (!/^[a-z0-9._-]{3,32}$/.test(String(d.pUser || '').trim().toLowerCase())) { toast('Username: 3–32 lower-case letters, numbers, dot, dash or underscore.'); return false; }
    if (!portalLogins[d._id] && !d.pPass) { toast('Set a password for the new login.'); return false; }
    if (d.pPass && d.pPass.length < 8) { toast('The password must be at least 8 characters.'); return false; }
    return true;
  };
  ACTIONS['new-chemist'] = () => {
    openModal({
      title: 'Onboard a chemist', submitLabel: 'Onboard', size: 'lg',
      body: chemistForm() + `<div class="form-grid">${field('Status', 'status', { value: 'Pending verification', options: ['Pending verification', 'Active'] })}</div>
        <div class="small muted">Choose “Pending verification” until the drug licence is checked. Only Active chemists can be billed and can sign in to the portal.</div>${chemistPortalBlock({})}`,
      onSubmit: d => {
        if (!addrOk(d) || (d.pWant && !portalFieldsOk(d))) return false;
        const c = { id: nextId('C', db.chemists), joined: todayIso, status: d.status === 'Active' ? 'Active' : 'Pending verification' };
        readChemist(d, c); db.chemists.push(c); fileLicence('chemist', c.id);
        afterChemistSave(c, d);
        return `${c.name} onboarded — ${c.status.toLowerCase()}.`;
      },
    });
    $('#pWant')?.addEventListener('change', e => { $('#pBlock').classList.toggle('hidden', !e.target.checked); const n = $('#f-name').value.trim(); if (e.target.checked && n) $('#f-pUser').value = suggestUsername({ name: n }); });
  };
  ACTIONS['edit-chemist'] = id => {
    const c = chem(id); if (!c) return;
    openModal({
      title: `Edit ${c.name}`, size: 'lg', body: chemistForm(c) + chemistPortalBlock(c),
      onSubmit: d => { if (!addrOk(d) || !portalFieldsOk({ ...d, _id: c.id })) return false; readChemist(d, c); fileLicence('chemist', c.id); afterChemistSave(c, d); return `${c.name} updated.`; },
    });
    $('#pWant')?.addEventListener('change', e => $('#pBlock').classList.toggle('hidden', !e.target.checked));
  };
  ACTIONS['del-chemist'] = id => {
    const c = chem(id); if (!c) return;
    const n = db.sales.filter(s => s.party.chemistId === id).length;
    if (n) { toast(`${c.name} has ${n} sale bill(s), so it can’t be deleted. Put it on hold instead.`); return; }
    confirmModal(`Delete ${c.name}?`, 'This cannot be undone.', 'Delete chemist', () => { db.chemists = db.chemists.filter(x => x !== c); return `${c.name} deleted.`; });
  };
  ACTIONS['view-chemist'] = id => {
    const c = chem(id); if (!c) return;
    const inv = db.sales.filter(s => s.party.chemistId === id).sort((a, b) => b.date.localeCompare(a.date));
    const btns = [['Active', 'Activate'], ['On hold', 'Put on hold']].filter(([s]) => s !== c.status)
      .map(([s, l]) => `<button type="button" class="btn ${s === 'Active' ? 'primary' : ''}" data-act="chemist-status" data-id="${c.id}|${s}">${l}</button>`).join('');
    openModal({
      title: c.name, size: 'lg',
      extraFoot: `<div class="foot-left">${btns}<button type="button" class="btn" data-act="edit-chemist" data-id="${c.id}">Edit</button>${SERVER ? `<button type="button" class="btn" data-act="portal-login" data-id="${c.id}">${portalLogins[c.id] ? 'Portal login' : 'Create portal login'}</button>` : ''}</div>`,
      body: `${detailGrid([['Owner', esc(c.owner)], ['Mobile', esc(c.phone)], ['Address', esc(addrText(c) || '—')], ['Nearby hospital', esc(c.hospital || '—')], ['Drug licence 1', esc(c.dl1 || '—')], ['Drug licence 2', esc(c.dl2 || '—')], ['Drug licence valid upto', licValid(c)], ['FSSAI no.', esc(c.fssai || '—')], ['FSSAI valid upto', fssaiValid(c)], ['GSTIN', esc(c.gstin || '—')], ['Licence copies', licDocsBtn('chemist', c.id)], ['Status', pill(c.status)], ['Credit limit', money(c.creditLimit)], ['Outstanding', money(chemOutstanding(c.id))], ['Default CD / TD', `${dec(c.cd)}% / ${dec(c.td)}%`], ...(SERVER ? [['Portal login', portalCell(c)], ['Portal orders', String(chemOrders.filter(o => o.chemistId === c.id).length)]] : [])])}
        <div class="card-title" style="font-size:15px">Bills (${inv.length})</div>
        ${miniTable([{ h: 'Bill', c: s => s.no }, { h: 'Date', c: s => fmtDate(s.date) }, { h: 'Amount', r: 1, c: s => money(s.total) }, { h: 'Balance', r: 1, c: s => money(balance(s)) }, { h: 'Status', c: s => pill(saleStatus(s)) }], inv.slice(0, 12))}`,
    });
  };
  // Chemist orders
  const orderById = id => chemOrders.find(o => o.id === id);
  async function setOrder(id, body, msg) {
    try {
      const o = await api('POST', `api/orders/${encodeURIComponent(id)}`, body);
      chemOrders = chemOrders.map(x => x.id === o.id ? o : x);
      refresh(); if (msg) toast(msg);
    } catch (err) { toast(err.message); }
  }
  ACTIONS['orders-refresh'] = async () => { await loadOrders(); render(); toast('Orders refreshed.'); };
  ACTIONS['order-status'] = v => {
    const [id, status] = v.split('|'); const o = orderById(id); if (!o) return;
    if (status === 'Rejected') {
      openModal({
        title: `Reject ${id}?`, size: 'sm', submitLabel: 'Reject order',
        body: `<div class="form-grid">${field('Reason shown to the chemist', 'reply', { full: true, value: o.reply || '' })}</div>`,
        onSubmit: d => { setOrder(id, { status, reply: d.reply }, `${id} rejected.`); },
      });
      $('#modalFoot [data-submit]').classList.add('danger-solid');
      return;
    }
    setOrder(id, { status }, `${id} marked ${status}.`);
  };
  ACTIONS['view-order'] = id => {
    const o = orderById(id); if (!o) return;
    const c = chem(o.chemistId);
    const open = ['New', 'Accepted', 'Arranging'].includes(o.status);
    const shortLines = o.lines.filter(l => l.productId && orderShort(l) > 0);
    openModal({
      title: `Order ${o.id} · ${c?.name || o.chemistId}`, size: 'lg',
      extraFoot: open ? `<div class="foot-left">
        <button type="button" class="btn primary" data-act="order-bill" data-id="${esc(o.id)}">Make sale bill</button>
        ${shortLines.length ? `<button type="button" class="btn" data-act="order-po" data-id="${esc(o.id)}">Purchase order for short items</button>` : ''}
        ${o.status !== 'Arranging' ? `<button type="button" class="btn" data-act="order-status" data-id="${esc(o.id)}|Arranging">Mark arranging</button>` : ''}
        ${o.status === 'New' ? `<button type="button" class="btn" data-act="order-status" data-id="${esc(o.id)}|Accepted">Accept</button>` : ''}
        <button type="button" class="btn ghost danger" data-act="order-status" data-id="${esc(o.id)}|Rejected">Reject</button></div>` : '',
      body: `${detailGrid([['Chemist', esc(c?.name || o.chemistId)], ['Address', esc(addrText(c) || '—')], ['Mobile', esc(c?.phone || '—')], ['Placed', new Date(o.created).toLocaleString('en-IN')], ['Status', pill(o.status)], ['Sale bill', esc(o.saleNo || '—')]])}
        ${o.note ? `<div><div class="small muted">Chemist’s note</div><div>${esc(o.note)}</div></div>` : ''}
        ${miniTable([
          { h: 'Item', c: l => `<span class="strong">${esc(l.name)}</span><div class="small muted">${esc([l.pack, l.company].filter(Boolean).join(' · '))}${l.productId ? '' : ' · not in your product list'}</div>${l.note ? `<div class="small">${esc(l.note)}</div>` : ''}` },
          { h: 'Ordered', r: 1, c: l => qty(l.qty) },
          { h: 'In stock now', r: 1, c: l => l.productId ? qty(sellableQty(l.productId)) : '—' },
          { h: '', c: l => orderShort(l) > 0 ? pill(l.productId ? `Short ${qty(orderShort(l))}` : 'Not stocked') : pill('In stock') },
        ], o.lines)}
        ${o.reply ? `<div class="small"><b>Your reply:</b> ${esc(o.reply)}</div>` : ''}
        <div class="small muted">${o.history.map(h => `${h.status} by ${h.by} · ${new Date(h.at).toLocaleString('en-IN')}`).join('<br>')}</div>`,
    });
  };
  ACTIONS['order-bill'] = id => {
    const o = orderById(id); if (!o) return;
    const c = chem(o.chemistId);
    if (!c) { toast('This chemist no longer exists.'); return; }
    if (c.status !== 'Active') { toast(`${c.name} is ${c.status}. Activate them before billing.`); return; }
    const lines = o.lines.filter(l => l.productId && sellableQty(l.productId) > 0).map(l => {
      const p = prod(l.productId); const b = sellableBatches(p.id)[0];
      return { productId: p.id, batchId: b.id, qty: Math.min(l.qty, avail(b)), free: 0, rate: p.ptr, cd: c.cd || 0, td: c.td || 0 };
    });
    if (!lines.length) { toast('None of the ordered items are in stock yet. Use “Purchase order for short items” or mark it Arranging.'); return; }
    const left = o.lines.length - lines.length;
    saleModal(null, { chemistId: c.id, lines, orderId: o.id });
    toast(left ? `${left} item(s) are not in stock and were left out. Quantities are limited to the first batch — add lines for more.` : 'Check the batches and quantities, then create the bill.');
  };
  ACTIONS['order-po'] = id => {
    const o = orderById(id); if (!o) return;
    const lines = o.lines.filter(l => l.productId && orderShort(l) > 0).map(l => ({ productId: l.productId, qty: orderShort(l), rate: prod(l.productId)?.pts || 0 }));
    if (!lines.length) { toast('Nothing is short on this order.'); return; }
    if (o.status !== 'Arranging') setOrder(o.id, { status: 'Arranging' });
    poModal(null, { lines });
  };

  // Chemist portal logins (server mode)
  const portalCell = c => {
    if (!SERVER) return '<span class="muted small">Server only</span>';
    const l = portalLogins[c.id];
    if (!l) return actBtn('portal-login', c.id, 'Create login', 'ghost');
    return `<span class="small strong">${esc(l.username)}</span> ${l.active ? pill('Active') : pill('Off')}<div class="small muted">${l.lastLogin ? 'Last in ' + fmtDate(l.lastLogin.slice(0, 10)) : 'Never signed in'}</div>`;
  };
  const suggestUsername = c => (c.name || 'chemist').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 24) || 'chemist';
  const randomPassword = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const v = crypto.getRandomValues(new Uint32Array(10)); return [...v].map(x => a[x % a.length]).join(''); };
  const portalFields = (c, l) => `
    <div class="card-title" style="font-size:15px">Chemist portal login</div>
    <div class="small muted">The chemist signs in with these to see your stock and place orders. Share them privately.${c.status !== 'Active' ? ' <b>The login works only after the chemist is Active.</b>' : ''}</div>
    <div class="form-grid g3">
      ${field('Username', 'pUser', { value: l?.username || suggestUsername(c), attrs: 'autocomplete="off" autocapitalize="none" spellcheck="false"' })}
      ${field(l ? 'New password (leave empty to keep)' : 'Password (8+ characters)', 'pPass', { value: l ? '' : randomPassword(), attrs: 'autocomplete="new-password"' })}
      <div class="field"><label>&nbsp;</label><label class="check-line"><input type="checkbox" name="pActive" ${!l || l.active ? 'checked' : ''}> Login switched on</label></div>
    </div>`;
  async function savePortalLogin(c, d) {
    const body = { username: String(d.pUser || '').trim().toLowerCase(), active: !!d.pActive };
    if (d.pPass) body.password = d.pPass;
    await api('PUT', `api/logins/${encodeURIComponent(c.id)}`, body);
    await loadLogins();
    return d.pPass ? `Login for ${c.name}: username “${body.username}”, password “${d.pPass}”. Note it down and share it privately — it is not shown again.` : `Login for ${c.name} updated.`;
  }
  ACTIONS['portal-login'] = id => {
    const c = chem(id); if (!c) return;
    if (!SERVER) { toast('Chemist logins need the server. Start it with “node server.js”.'); return; }
    const l = portalLogins[c.id];
    openModal({
      title: `${l ? 'Edit' : 'Create'} portal login · ${c.name}`, size: 'lg', submitLabel: l ? 'Save login' : 'Create login',
      extraFoot: l ? `<div class="foot-left"><button type="button" class="btn ghost danger" data-act="portal-remove" data-id="${esc(c.id)}">Remove login</button></div>` : '',
      body: portalFields(c, l),
      onSubmit: d => {
        if (!portalFieldsOk({ ...d, pWant: 'on', _id: c.id })) return false;
        savePortalLogin(c, d).then(msg => { closeModal(false); refresh(); showNotice(msg); }).catch(err => toast(err.message));
        return false;
      },
    });
  };
  ACTIONS['portal-remove'] = id => {
    const c = chem(id); if (!c) return;
    confirmModal(`Remove the portal login of ${c.name}?`, 'They will be signed out and can no longer see stock or place orders. Their past orders stay.', 'Remove login', () => {
      api('DELETE', `api/logins/${encodeURIComponent(id)}`).then(loadLogins).then(() => { refresh(); toast(`Login of ${c.name} removed.`); }).catch(err => toast(err.message));
    });
  };
  // A message that stays until it is closed (used to show a new password once)
  function showNotice(msg) {
    openModal({ title: 'Done', size: 'sm', body: `<p style="margin:0">${esc(msg)}</p>` });
  }
  ACTIONS['change-password'] = () => openModal({
    title: 'Change your password', size: 'sm', submitLabel: 'Change password',
    body: `<div class="form-grid">${field('Current password', 'current', { type: 'password', required: true, full: true, attrs: 'autocomplete="current-password"' })}${field('New password (8+ characters)', 'password', { type: 'password', required: true, full: true, attrs: 'autocomplete="new-password" minlength="8"' })}${field('Repeat new password', 'confirm', { type: 'password', required: true, full: true, attrs: 'autocomplete="new-password"' })}</div>`,
    onSubmit: d => {
      if (d.password !== d.confirm) { toast('The new passwords do not match.'); return false; }
      api('POST', 'api/password', { current: d.current, password: d.password }).then(() => { closeModal(false); toast('Password changed.'); }).catch(err => toast(err.message));
      return false;
    },
  });

  ACTIONS['chemist-status'] = v => {
    const [id, status] = v.split('|'); const c = chem(id); if (!c) return;
    c.status = status; closeModal(false); refresh(); toast(`${c.name} is now ${status}.`);
  };

  // Suppliers
  const supplierForm = (s = {}) => `${licReadBox('supplier')}<div class="form-grid">
    ${field('Supplier name', 'name', { value: s.name || '', required: true })}
    ${field('Contact person', 'contact', { value: s.contact || '' })}
    ${field('Mobile', 'phone', { type: 'tel', value: s.phone || '', attrs: 'pattern="[6-9][0-9]{9}" title="10-digit mobile number"' })}
    ${field('Payment terms (days)', 'terms', { type: 'number', value: s.terms ?? 30, required: true, attrs: numAttrs('1') })}
    ${addrFields(s, false)}
    ${licFields(s, false)}
  </div>`;
  const readSupplier = (d, s) => Object.assign(s, { name: d.name.trim(), contact: d.contact.trim(), phone: d.phone, ...readAddr(d), ...readLic(d), terms: num(d.terms) });
  ACTIONS['new-supplier'] = () => openModal({ title: 'Add supplier', body: supplierForm(), submitLabel: 'Add supplier', onSubmit: d => { if (!addrOk(d)) return false; const s = { id: nextId('S', db.suppliers) }; readSupplier(d, s); db.suppliers.push(s); fileLicence('supplier', s.id); return `${s.name} added.`; } });
  ACTIONS['edit-supplier'] = id => { const s = sup(id); if (!s) return; openModal({ title: `Edit ${s.name}`, body: supplierForm(s), onSubmit: d => { if (!addrOk(d)) return false; readSupplier(d, s); fileLicence('supplier', s.id); return `${s.name} updated.`; } }); };
  ACTIONS['del-supplier'] = id => {
    const s = sup(id); if (!s) return;
    const n = db.pos.filter(p => p.supplierId === id).length + db.grns.filter(g => g.supplierId === id).length + db.pinvoices.filter(p => p.supplierId === id).length;
    if (n) { toast(`${s.name} has ${n} purchase document(s), so it can’t be deleted.`); return; }
    confirmModal(`Delete ${s.name}?`, 'This cannot be undone.', 'Delete supplier', () => { db.suppliers = db.suppliers.filter(x => x !== s); return `${s.name} deleted.`; });
  };
  const goFolder = id => {
    if (!sup(id)) return;
    searchQuery = ''; $('#globalSearch').value = '';
    if (location.hash === '#folder/' + id) render(); else location.hash = 'folder/' + id;
    window.scrollTo(0, 0);
  };
  ACTIONS['view-supplier'] = goFolder;

  // Supplier folder: bill copies
  ACTIONS['open-bill-file'] = no => ACTIONS['open-docs'](no);
  ACTIONS['open-docs'] = async key => {
    try {
      const files = await billStore.get(key);
      if (!files || !files.length) { toast('The file is not in this browser. It may have been saved on another computer or cleared.'); return; }
      files.forEach(f => {
        const url = URL.createObjectURL(f.blob);
        const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener';
        if (!/^(image\/|application\/pdf)/.test(f.type)) a.download = f.name;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      });
    } catch { toast('Could not open the file — browser storage is blocked.'); }
  };
  ACTIONS['attach-bill'] = no => {
    const p = db.pinvoices.find(x => x.no === no); if (!p) return;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true; inp.accept = 'image/jpeg,image/png,image/webp,image/gif,application/pdf';
    inp.addEventListener('change', () => {
      const files = [...inp.files].filter(f => ALLOWED.includes(f.type) && f.size <= 25 * 1024 * 1024);
      if (!files.length) { toast('Choose a JPG, PNG, WEBP or PDF up to 25 MB.'); return; }
      fileBillCopies(p, files); refresh(); toast(`Bill copy filed with ${p.no}.`);
    });
    inp.click();
  };
  ACTIONS['upload-for'] = sid => {
    if (entry && entry.lines.length && !confirm('Discard the bill you are checking now?')) return;
    const s = sup(sid);
    entry = null; uploadFor = s ? s.id : '';
    location.hash = 'billentry';
    toast(s ? `Upload, import or type the bill. It will be filed under ${s.name}.` : 'Upload the bill.');
  };

  // Purchase orders
  function poModal(existing, preset = {}) {
    const po = existing || { supplierId: preset.supplierId || '', expected: addDays(todayIso, 7), lines: preset.lines || [] };
    openModal({
      title: existing ? `Edit ${existing.no}` : 'New purchase order', size: 'lg', submitLabel: existing ? 'Save changes' : 'Create PO',
      body: `<div class="form-grid">
          ${field('Supplier', 'supplierId', { required: true, value: po.supplierId, options: [['', 'Select supplier'], ...db.suppliers.map(s => [s.id, s.name])] })}
          ${field('Expected delivery', 'expected', { type: 'date', value: po.expected, required: true })}
        </div>
        <div class="lines"><div class="table-wrap"><table>
          <thead><tr><th>Item</th><th>Qty</th><th>Rate ₹</th><th class="r">GST</th><th class="r">Amount</th><th></th></tr></thead>
          <tbody id="lineBody" data-mode="po">${(po.lines.length ? po.lines : [{}]).map(poRowHtml).join('')}</tbody></table></div>
          <div class="add-line"><button type="button" class="btn sm" data-add-line>+ Add line</button></div></div>
        <div class="totals"><div>Amount <b id="tGross" class="num">0</b></div><div>GST <b id="tGst" class="num">0</b></div><div class="grand">Total <span id="tTot" class="num">₹0</span></div></div>`,
      onSubmit: d => {
        const lines = readPoLines();
        if (!lines.length) { toast('Add at least one item with a quantity.'); return false; }
        if (existing) { Object.assign(existing, { supplierId: d.supplierId, expected: d.expected, lines, ...billCalc(lines) }); return `${existing.no} updated.`; }
        const no = nextNo('PO-', db.pos);
        db.pos.push({ no, date: todayIso, expected: d.expected, supplierId: d.supplierId, lines, ...billCalc(lines), status: 'Open' });
        return `${no} created for ${money(billCalc(lines).total)}.`;
      },
    });
    recalcPo();
  }
  ACTIONS['new-po'] = () => poModal(null);
  ACTIONS['edit-po'] = no => { const po = db.pos.find(p => p.no === no); if (po) poModal(po); };
  ACTIONS['reorder-po'] = pid => {
    const p = prod(pid); if (!p) return;
    const lastSup = db.batches.filter(b => b.productId === pid && b.supplierId).map(b => b.supplierId).pop() || '';
    poModal(null, { supplierId: lastSup, lines: [{ productId: p.id, qty: Math.max(1, p.reorder * 2 - sellableQty(p.id)), rate: p.pts }] });
  };
  ACTIONS['view-po'] = no => {
    const po = db.pos.find(p => p.no === no); if (!po) return;
    const open = po.status === 'Open' || po.status === 'Partially received';
    const hasGrn = db.grns.some(g => g.poNo === po.no);
    openModal({
      title: `Purchase order ${po.no}`, size: 'lg',
      extraFoot: open ? `<div class="foot-left"><button type="button" class="btn primary" data-act="receive-po" data-id="${po.no}">Receive goods</button>${po.status === 'Open' && !hasGrn ? `<button type="button" class="btn" data-act="edit-po" data-id="${po.no}">Edit</button><button type="button" class="btn" data-act="cancel-po" data-id="${po.no}">Cancel PO</button>` : ''}</div>` : '',
      body: `${detailGrid([['Supplier', esc(sup(po.supplierId)?.name)], ['Order date', fmtDate(po.date)], ['Expected', fmtDate(po.expected)], ['Status', pill(po.status)], ['GRNs', db.grns.filter(g => g.poNo === po.no).map(g => g.no).join(', ') || '—']])}
        ${miniTable([
          { h: 'Item', c: l => esc(prod(l.productId)?.name) },
          { h: 'Ordered', r: 1, c: l => qty(l.qty) },
          { h: 'Received', r: 1, c: l => qty(receivedQty(po.no, l.productId)) },
          { h: 'Rate', r: 1, c: l => dec(l.rate) },
          { h: 'Amount', r: 1, c: l => dec(l.qty * l.rate) },
        ], po.lines)}
        <div class="totals"><div>Amount <b class="num">${dec(po.gross)}</b></div><div>GST <b class="num">${dec(po.gst)}</b></div><div class="grand">Total ${money2(po.total)}</div></div>`,
    });
  };
  ACTIONS['cancel-po'] = no => {
    const po = db.pos.find(p => p.no === no); if (!po) return;
    confirmModal(`Cancel ${po.no}?`, 'The order will be marked Cancelled. This cannot be undone.', 'Cancel PO', () => { po.status = 'Cancelled'; return `${po.no} cancelled.`; });
  };
  ACTIONS['del-po'] = no => {
    const po = db.pos.find(p => p.no === no); if (!po) return;
    if (db.grns.some(g => g.poNo === no)) { toast('Goods were received against this PO, so it can’t be deleted.'); return; }
    confirmModal(`Delete ${po.no}?`, 'This cannot be undone.', 'Delete PO', () => { db.pos = db.pos.filter(x => x !== po); return `${no} deleted.`; });
  };

  // Goods receipt
  function grnModal(poNo = '') {
    const openPos = db.pos.filter(p => p.status === 'Open' || p.status === 'Partially received');
    if (!openPos.length) { toast('No open purchase orders to receive against.'); return; }
    if (!poNo || !openPos.some(p => p.no === poNo)) poNo = openPos[0].no;
    openModal({
      title: 'New goods receipt (GRN)', size: 'xl', submitLabel: 'Save GRN & add to stock',
      body: `<div class="form-grid g3">
          ${field('Purchase order', 'poNo', { required: true, value: poNo, options: openPos.map(p => [p.no, `${p.no} — ${sup(p.supplierId)?.name}`]) })}
          ${field('Receipt date', 'date', { type: 'date', value: todayIso, required: true, attrs: `max="${todayIso}"` })}
          ${field('Supplier challan / delivery note', 'challan', { required: true })}
        </div>
        <div id="grnLines">${grnLines(poNo)}</div>
        <div class="small muted">Received quantities are added to stock under the batch and expiry you enter.</div>`,
      onSubmit: d => {
        const po = db.pos.find(p => p.no === d.poNo);
        const lines = [];
        for (const tr of $$('#grnLines tr[data-gline]')) {
          const pl = po.lines[+tr.dataset.gline]; const pend = +tr.dataset.pending;
          const q = Math.floor(num($('[data-g=qty]', tr).value)); const fr = Math.floor(num($('[data-g=free]', tr).value));
          if (!q && !fr) continue;
          const p = prod(pl.productId);
          const batch = $('[data-g=batch]', tr).value.trim().toUpperCase(); const expiry = expToIso($('[data-g=exp]', tr).value);
          if (q > pend) { toast(`${p.name}: only ${qty(pend)} pending on this PO.`); return false; }
          if (!batch || !expiry) { toast(`${p.name}: enter batch and expiry as MM/YY.`); return false; }
          lines.push({ productId: pl.productId, batch, expiry, qty: q, free: fr, rate: round2(num($('[data-g=rate]', tr).value)), mrp: round2(num($('[data-g=mrp]', tr).value)) || p.mrp, cd: num($('[data-g=cd]', tr).value), td: 0, gst: p.gst });
        }
        if (!lines.length) { toast('Enter a received quantity for at least one item.'); return false; }
        addToStock(lines, { supplierId: po.supplierId, source: 'GRN', verified: true });
        const no = nextNo('GRN-', db.grns);
        db.grns.push({ no, date: d.date, poNo: po.no, supplierId: po.supplierId, challan: d.challan.trim(), lines, ...billCalc(lines), invoiced: '' });
        db.batches.filter(b => b.source === 'GRN' && lines.some(l => l.productId === b.productId && norm(l.batch) === norm(b.batch))).forEach(b => { b.source = no; });
        po.status = po.lines.every(l => receivedQty(po.no, l.productId) >= l.qty) ? 'Received' : 'Partially received';
        return `${no} saved — ${qty(lines.reduce((a, l) => a + l.qty + l.free, 0))} units added to stock.`;
      },
    });
    $('#f-poNo').addEventListener('change', e => { $('#grnLines').innerHTML = grnLines(e.target.value); });
  }
  ACTIONS['new-grn'] = () => grnModal();
  ACTIONS['receive-po'] = no => grnModal(no);
  ACTIONS['view-grn'] = no => {
    const g = db.grns.find(x => x.no === no); if (!g) return;
    const s = sup(g.supplierId);
    openModal({
      title: `Goods receipt ${g.no}`, size: 'xl',
      extraFoot: !g.invoiced ? `<div class="foot-left"><button type="button" class="btn primary" data-act="invoice-grn" data-id="${g.no}">Add purchase invoice</button></div>` : '',
      body: billDoc({ title: 'GOODS RECEIPT NOTE', no: g.no, date: g.date, partyHtml: `<div class="strong">Supplier: ${esc(s?.name)}</div><div>GST NO: ${esc(s?.gstin || '—')}</div><div>PO: ${esc(g.poNo)} · Challan: ${esc(g.challan || '—')}</div><div>Invoice: ${esc(g.invoiced || 'Awaiting')}</div>`, lines: g.lines, t: g }),
    });
  };
  ACTIONS['del-grn'] = no => {
    const g = db.grns.find(x => x.no === no); if (!g) return;
    if (g.invoiced) { toast('Delete the purchase invoice for this GRN first.'); return; }
    confirmModal(`Delete ${g.no}?`, `This takes the ${g.lines.length} received line(s) back out of stock and re-opens ${esc(g.poNo)}. This cannot be undone.`, 'Delete GRN', () => {
      const short = removeFromStock(g.lines);
      if (short.length) { toast(`Some of this stock is already sold: ${short.join(', ')}. The GRN can’t be deleted.`); return false; }
      db.grns = db.grns.filter(x => x !== g);
      const po = db.pos.find(p => p.no === g.poNo);
      if (po && po.status !== 'Cancelled') po.status = db.grns.some(x => x.poNo === po.no) ? 'Partially received' : 'Open';
      return `${no} deleted — stock removed.`;
    });
  };

  // Purchase invoices
  function piModal(grnNo = '') {
    const open = db.grns.filter(g => !g.invoiced);
    if (!open.length) { toast('Every goods receipt already has an invoice. To enter a bill without a PO, use Bill Upload / Entry.'); return; }
    if (!grnNo || !open.some(g => g.no === grnNo)) grnNo = open[0].no;
    const info = no => {
      const g = db.grns.find(x => x.no === no); const s = sup(g.supplierId);
      return `${detailGrid([['Supplier', esc(s?.name)], ['GRN date', fmtDate(g.date)], ['Terms', (s?.terms ?? 30) + ' days']])}<div class="totals"><div>Gross <b class="num">${dec(g.gross)}</b></div><div>GST <b class="num">${dec(g.gst)}</b></div><div class="grand">Net ${money2(g.total)}</div></div>`;
    };
    openModal({
      title: 'Purchase invoice for a GRN', submitLabel: 'Save invoice',
      body: `<div class="form-grid">
          ${field('Goods receipt', 'grnNo', { required: true, value: grnNo, options: open.map(g => [g.no, `${g.no} — ${sup(g.supplierId)?.name} — ${money(g.total)}`]) })}
          ${field('Supplier bill number', 'supplierInvNo', { required: true })}
          ${field('Bill date', 'date', { type: 'date', value: todayIso, required: true, attrs: `max="${todayIso}"` })}
          ${field('Paid now (₹)', 'paid', { type: 'number', value: 0, attrs: numAttrs() })}
        </div>
        <div id="piInfo">${info(grnNo)}</div>`,
      onSubmit: d => {
        const g = db.grns.find(x => x.no === d.grnNo); const s = sup(g.supplierId);
        const no = nextNo('PI-', db.pinvoices);
        const t = billCalc(g.lines);
        db.pinvoices.push({ no, supplierInvNo: d.supplierInvNo.trim(), date: d.date, due: addDays(d.date, s?.terms ?? 30), supplierId: g.supplierId, grnNo: g.no, source: 'GRN', ...t, paid: Math.min(t.total, round2(num(d.paid))) });
        g.invoiced = no;
        return `${no} saved — due ${fmtDate(addDays(d.date, s?.terms ?? 30))}.`;
      },
    });
    $('#f-grnNo').addEventListener('change', e => { $('#piInfo').innerHTML = info(e.target.value); });
  }
  ACTIONS['new-pi'] = () => piModal();
  ACTIONS['invoice-grn'] = no => piModal(no);
  const piLines = p => p.lines || db.grns.find(x => x.no === p.grnNo)?.lines || [];
  ACTIONS['view-pi'] = no => {
    const p = db.pinvoices.find(x => x.no === no); if (!p) return;
    const s = sup(p.supplierId);
    openModal({
      title: `Purchase invoice ${p.no}`, size: 'xl',
      extraFoot: `<div class="foot-left">${balance(p) > 0.5 ? `<button type="button" class="btn gold" data-act="pay-pi" data-id="${p.no}">Record payment</button>` : ''}<button type="button" class="btn" data-act="print" data-id="">Print</button></div>`,
      body: billDoc({ title: 'PURCHASE BILL', no: `${p.no} (supplier bill ${p.supplierInvNo})`, date: p.date, partyHtml: `<div class="strong">Supplier: ${esc(s?.name)}</div><div>GST NO: ${esc(s?.gstin || '—')}</div><div>Due: ${fmtDate(p.due)} · ${piStatus(p)}</div><div>Source: ${esc(p.grnNo || p.source || 'Manual')}</div>`, lines: piLines(p), t: p, paid: p.paid }),
    });
  };
  ACTIONS['edit-pi'] = no => {
    const p = db.pinvoices.find(x => x.no === no); if (!p) return;
    openModal({
      title: `Edit ${p.no}`, size: 'sm',
      body: `<div class="form-grid">
        ${field('Supplier bill number', 'supplierInvNo', { value: p.supplierInvNo, required: true })}
        ${field('Bill date', 'date', { type: 'date', value: p.date, required: true, attrs: `max="${todayIso}"` })}
        ${field('Due date', 'due', { type: 'date', value: p.due, required: true })}
        ${field('Paid so far (₹)', 'paid', { type: 'number', value: p.paid || 0, attrs: `min="0" max="${p.total}" step="0.01"` })}
      </div><div class="small muted">To change the items, edit the stock lines in Stock Details.</div>`,
      onSubmit: d => { Object.assign(p, { supplierInvNo: d.supplierInvNo.trim(), date: d.date, due: d.due, paid: Math.min(p.total, round2(num(d.paid))) }); return `${p.no} updated.`; },
    });
  };
  ACTIONS['del-pi'] = no => {
    const p = db.pinvoices.find(x => x.no === no); if (!p) return;
    const direct = !!p.lines;
    confirmModal(`Delete ${p.no}?`, direct
      ? `This bill was entered directly, so its ${p.lines.length} line(s) will also be taken back out of stock. This cannot be undone.`
      : `The goods receipt ${esc(p.grnNo)} will go back to “Awaiting invoice”. Stock is not changed. This cannot be undone.`, 'Delete invoice', () => {
      if (direct) { const short = removeFromStock(p.lines); if (short.length) { toast(`Some of this stock is already sold: ${short.join(', ')}. The bill can’t be deleted.`); return false; } }
      else { const g = db.grns.find(x => x.no === p.grnNo); if (g) g.invoiced = ''; }
      db.pinvoices = db.pinvoices.filter(x => x !== p);
      if (p.files?.length) billStore.del(no).catch(() => {});
      return `${no} deleted.`;
    });
  };
  ACTIONS['pay-pi'] = no => {
    const p = db.pinvoices.find(x => x.no === no); if (!p) return;
    openModal({
      title: `Pay supplier · ${p.no}`, submitLabel: 'Save payment', size: 'sm',
      body: `${detailGrid([['Supplier', esc(sup(p.supplierId)?.name)], ['Bill total', money2(p.total)], ['Balance', money2(balance(p))]])}
        <div class="form-grid">
          ${field('Amount (₹)', 'amount', { type: 'number', value: balance(p), required: true, attrs: `min="0.01" max="${balance(p)}" step="0.01"` })}
          ${field('Mode', 'mode', { options: ['NEFT / RTGS', 'UPI', 'Cheque', 'Cash'] })}
        </div>`,
      onSubmit: d => { const a = Math.min(num(d.amount), balance(p)); p.paid = round2((p.paid || 0) + a); return `Payment of ${money(a)} recorded on ${p.no}.`; },
    });
  };

  // Bill upload / entry
  ACTIONS['entry-ai'] = async () => {
    if (entryBusy) return;
    if (!pendingFiles.length) { toast('Choose the bill photo(s) or PDF first.'); return; }
    if (!getApiKey()) { toast('Add your Anthropic API key in Settings first.'); ACTIONS['open-settings'](); return; }
    if (entry && entry.lines.length && !confirm('Replace the bill you are checking now with this upload?')) return;
    entryBusy = true; render();
    try {
      const files = pendingFiles.slice();
      const x = await extractBill(files);
      entry = withUploadFor(entryFromExtraction(x, files));
      pendingFiles = [];
      toast(entry.lines.length ? `Read ${entry.lines.length} lines. Check them below, then add to stock.` : 'No item rows were found on this bill.');
    } catch (err) {
      toast(err.message || 'Could not read the bill.');
    } finally {
      entryBusy = false; if (route === 'billentry') render();
    }
  };
  ACTIONS['entry-manual'] = () => {
    if (entry && entry.lines.length && !confirm('Discard the bill you are checking now?')) return;
    entry = withUploadFor(newEntry('Manual')); entry.lines = [blankLine()]; render();
  };
  const entryTargets = () => { const t = entry.lines.filter(l => l.sel); return t.length ? t : entry.lines; };
  ACTIONS['entry-bulk'] = () => {
    if (!entry) return;
    const vals = {}; const said = [];
    for (const [id, k, label] of [['#ebCd', 'cd', 'CD%'], ['#ebTd', 'td', 'TD%'], ['#ebGst', 'gst', 'GST%']]) {
      const raw = $(id).value.trim(); if (raw === '') continue;
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0 || v > 100) { toast(`${label} must be a number from 0 to 100.`); $(id).focus(); return; }
      vals[k] = v; said.push(`${label} ${dec(v)}`);
    }
    if (!said.length) { toast('Type a CD%, TD% or GST% value to apply.'); $('#ebCd').focus(); return; }
    const rows = entryTargets();
    rows.forEach(l => Object.assign(l, vals));
    render();
    toast(`${said.join(', ')} set on ${rows.length === entry.lines.length ? 'all ' : ''}${rows.length} row${rows.length === 1 ? '' : 's'}.`);
  };
  ACTIONS['entry-del-sel'] = () => {
    if (!entry) return;
    const n = entry.lines.filter(l => l.sel).length;
    if (!n) { toast('Tick the rows you want to delete.'); return; }
    entry.lines = entry.lines.filter(l => !l.sel); render(); toast(`${n} row${n === 1 ? '' : 's'} deleted.`);
  };
  ACTIONS['entry-template'] = () => downloadText('purchase-bill-template.csv', CSV_HEAD.join(',') + '\r\nBASUGINE PEN,LUPIN,LUPIN,1PACK,90183100,A25036CL,01/29,1,0,823.57,1153.00,2.00,0,12,823.57\r\n');
  ACTIONS['entry-csv'] = () => { if (entry) downloadText(`bill-${(entry.billNo || 'draft').replace(/[^\w-]+/g, '_')}.csv`, linesToCsv(entry.lines)); };
  ACTIONS['entry-add-row'] = () => { entry.lines.push(blankLine()); render(); const ins = $$('#entryBody tr:last-child input'); if (ins[0]) ins[0].focus(); };
  ACTIONS['entry-del-row'] = i => { entry.lines.splice(+i, 1); render(); };
  ACTIONS['entry-clear'] = () => confirmModal('Discard this bill?', 'Nothing has been added to stock yet. The lines you are checking will be cleared.', 'Discard', () => { entry = null; return 'Bill discarded.'; });
  ACTIONS['entry-commit'] = () => {
    if (!entry) return;
    const lines = entry.lines.filter(l => String(l.name).trim());
    if (!lines.length) { toast('There are no item lines to add.'); return; }
    const errs = lines.map((l, i) => [i + 1, checkLine(l)]).filter(([, c]) => c.level === 'bad');
    if (errs.length) { toast(`Fix the errors on line ${errs.map(e => e[0]).slice(0, 6).join(', ')} first.`); return; }
    if (!entry.supplierId && !entry.supplierName.trim()) { toast('Choose the supplier or enter a new supplier name.'); return; }
    if (!entry.billNo.trim()) { toast('Enter the supplier bill number.'); return; }
    if (!entry.date) { toast('Enter the bill date.'); return; }
    const existingSup = entry.supplierId ? sup(entry.supplierId) : db.suppliers.find(s => norm(s.name) === norm(entry.supplierName));
    if (existingSup && db.pinvoices.some(p => p.supplierId === existingSup.id && norm(p.supplierInvNo) === norm(entry.billNo))) { toast(`Bill ${entry.billNo} from ${existingSup.name} is already saved.`); return; }
    const t = billCalc(lines);
    const newProducts = lines.filter(l => !findProductByName(l.name)).map(l => norm(l.name));
    const uniqNew = [...new Set(newProducts)];
    confirmModal('Add this bill to stock?', `${lines.length} lines · net ${money2(t.total)}${uniqNew.length ? ` · ${uniqNew.length} new product(s) will be created` : ''}${existingSup ? '' : ` · new supplier “${esc(entry.supplierName)}”`}. The stock lines will be marked “Needs check”.`, 'Add to stock', () => {
      let s = existingSup;
      if (!s) { s = { id: nextId('S', db.suppliers), name: entry.supplierName.trim(), contact: '', phone: '', city: '', gstin: entry.gstin.toUpperCase(), dl1: '', dl2: '', dlValid: '', terms: 30 }; db.suppliers.push(s); }
      const stockLines = lines.map(l => {
        let p = findProductByName(l.name);
        if (!p) {
          p = { id: nextId('P', db.products), name: norm(l.name), companyId: findOrCreateCompany(l.company), mfg: l.mfg || '', categoryId: defaultCategoryId(), form: guessForm(l.name, l.pack), pack: l.pack, hsn: String(l.hsn || ''), salt: '', gst: num(l.gst), mrp: num(l.mrp), ptr: salePtr(l.mrp, l.gst), pts: num(l.rate), reorder: 10 };
          db.products.push(p);
        } else {
          p.pts = num(l.rate) || p.pts; if (num(l.mrp)) p.mrp = num(l.mrp); if (!p.mfg && l.mfg) p.mfg = l.mfg;
        }
        return { productId: p.id, name: p.name, batch: String(l.batch).trim().toUpperCase(), expiry: expToIso(l.exp), qty: Math.floor(num(l.qty)), free: Math.floor(num(l.free)), rate: num(l.rate), mrp: num(l.mrp), cd: num(l.cd), td: num(l.td), gst: num(l.gst) };
      });
      const no = nextNo('PI-', db.pinvoices);
      addToStock(stockLines, { supplierId: s.id, source: `${no} · bill ${entry.billNo}`, verified: false });
      const pi = { no, supplierInvNo: entry.billNo.trim(), date: entry.date, due: addDays(entry.date, s.terms ?? 30), supplierId: s.id, grnNo: '', source: entry.source, lines: stockLines, ...t, paid: 0 };
      db.pinvoices.push(pi);
      fileBillCopies(pi, entry.fileObjs);
      entry = null;
      setTimeout(() => goFolder(s.id), 0);
      return `${no} saved — ${stockLines.length} lines added to stock and filed in the folder for ${s.name}.`;
    });
  };

  // Settings & backup
  ACTIONS['open-settings'] = () => {
    const f = db.settings.firm; const key = getApiKey();
    openModal({
      title: 'Settings', size: 'lg', submitLabel: 'Save settings',
      body: `<div class="card-title" style="font-size:15px">Firm details (printed on bills)</div>
        ${licReadBox('firm')}
        <div class="form-grid">
          ${field('Firm name', 'name', { value: f.name, required: true })}
          ${field('Phone', 'phone', { value: f.phone })}
          ${addrFields(f, false)}
          ${licFields(f, false)}
          ${field('Default CD % for new chemists', 'defcd', { type: 'number', value: db.settings.defaultCd ?? 0, attrs: numAttrs() })}
          <div class="field"><label>Licence copies</label><div>${licDocsBtn('firm', 'firm')}</div></div>
        </div>
        <div class="card-title" style="font-size:15px">AI bill reading</div>
        <div class="form-grid">
          ${field('Anthropic API key', 'apikey', { type: 'password', value: key, full: true, attrs: 'autocomplete="off" placeholder="sk-ant-…"' })}
        </div>
        <div class="small muted">The key is saved only in this browser on this computer and is used to send uploaded bills to Anthropic’s Claude model to be read. Anyone using this computer’s browser can use it. Leave empty to turn AI reading off. Create a key at console.anthropic.com.</div>
        <div class="card-title" style="font-size:15px">Backup</div>
        <div class="toolbar"><button type="button" class="btn" data-act="export-data" data-id="">Download backup (JSON)</button><label class="btn">Restore backup<input type="file" id="restoreFile" accept="application/json,.json" hidden></label><button type="button" class="btn ghost danger" data-act="reset-data" data-id="">Reset to sample data</button></div>
        <div class="small muted">All data lives in this browser. Download a backup regularly.</div>`,
      onSubmit: d => {
        if (!addrOk(d)) return false;
        Object.assign(db.settings.firm, { name: d.name.trim(), phone: d.phone.trim(), ...readAddr(d), ...readLic(d) });
        fileLicence('firm', 'firm');
        db.settings.defaultCd = num(d.defcd);
        setApiKey((d.apikey || '').trim());
        return 'Settings saved.';
      },
    });
  };
  ACTIONS['export-data'] = () => downloadText(`pharma-suite-backup-${todayIso}.json`, JSON.stringify(db, null, 1), 'application/json');
  ACTIONS['reset-data'] = () => confirmModal('Reset to sample data?', 'Everything in this browser will be replaced with the sample data. Download a backup first if you need it. This cannot be undone.', 'Reset', () => {
    db = seed(); entry = null; Object.keys(listState).forEach(k => delete listState[k]); billStore.clear().catch(() => {}); return 'Sample data restored.';
  });
  ACTIONS['print'] = () => window.print();

  // ---------- Events ----------
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      e.preventDefault();
      searchQuery = ''; $('#globalSearch').value = '';
      $('#sidebar').classList.remove('open');
      closeModal();
      if (location.hash === '#' + nav.dataset.nav) render(); else location.hash = nav.dataset.nav;
      window.scrollTo(0, 0);
      return;
    }
    const tab = e.target.closest('[data-tabs] [data-tab]');
    if (tab) {
      const key = tab.closest('[data-tabs]').dataset.tabs;
      listState[key].tab = tab.dataset.tab;
      $$('button', tab.parentElement).forEach(b => b.classList.toggle('active', b === tab));
      fillList(key); return;
    }
    const lr = e.target.closest('[data-lic-read]');
    if (lr) { readLicenceIntoForm(lr); return; }
    const ba = e.target.closest('[data-bulkapply]');
    if (ba) { bulkApply(ba.dataset.bulkapply); return; }
    const bc = e.target.closest('[data-bulkclear]');
    if (bc) { listState[bc.dataset.bulkclear].sel.clear(); fillList(bc.dataset.bulkclear); return; }
    const bx = e.target.closest('[data-bulkact]');
    if (bx) {
      const [key, name] = bx.dataset.bulkact.split('|');
      const items = selectedItems(key);
      if (!items.length) { toast('Tick at least one row first.'); return; }
      const msg = lists[key].select.actions[name](items);
      if (msg !== false) { listState[key].sel.clear(); refresh(); if (msg) toast(msg); }
      return;
    }
    const fc = e.target.closest('[data-filter-clear]');
    if (fc) { const key = fc.dataset.filterClear; listState[key].f = {}; $$(`[data-list-filter^="${key}|"]`).forEach(s => { s.value = ''; }); fillList(key); return; }
    if (e.target.closest('[data-sbulk]')) {
      const trs = $$('#lineBody tr[data-line]');
      const ticked = trs.filter(tr => $('[data-lsel]', tr)?.checked);
      const target = (ticked.length ? ticked : trs).filter(tr => $('[data-f=productId]', tr).value);
      const vals = {};
      for (const [id, k, label] of [['#sbCd', 'cd', 'CD%'], ['#sbTd', 'td', 'TD%']]) {
        const raw = $(id).value.trim(); if (raw === '') continue;
        const v = Number(raw);
        if (!Number.isFinite(v) || v < 0 || v > 100) { toast(`${label} must be a number from 0 to 100.`); $(id).focus(); return; }
        vals[k] = v;
      }
      if (!Object.keys(vals).length) { toast('Type a CD% or TD% to apply.'); $('#sbCd').focus(); return; }
      if (!target.length) { toast('Pick an item on at least one line first.'); return; }
      target.forEach(tr => Object.entries(vals).forEach(([k, v]) => { $(`[data-f=${k}]`, tr).value = v; }));
      recalcSale();
      toast(`Discount set on ${target.length} line${target.length === 1 ? '' : 's'}.`);
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act && ACTIONS[act.dataset.act]) {
      e.preventDefault();
      // Opening a new dialog from inside one: close the current one first (keeping any edit-in-progress reverted).
      if (act.closest('.modal') && !['print', 'export-data', 'open-docs'].includes(act.dataset.act)) closeModal();
      ACTIONS[act.dataset.act](act.dataset.id); return;
    }
    if (e.target.closest('[data-close]') || e.target.id === 'modalBack') { closeModal(); return; }
    if (e.target.closest('[data-submit]')) { submitModal(); return; }
    if (e.target.closest('[data-add-line]')) {
      const body = $('#lineBody');
      if (body.dataset.mode === 'po') { body.insertAdjacentHTML('beforeend', poRowHtml()); recalcPo(); }
      else { body.insertAdjacentHTML('beforeend', saleRowHtml()); recalcSale(); }
      return;
    }
    const rm = e.target.closest('[data-rm-line]');
    if (rm) {
      const body = $('#lineBody');
      if ($$('tr[data-line]', body).length > 1) rm.closest('tr').remove();
      if (body.dataset.mode === 'po') recalcPo(); else recalcSale();
    }
  });

  document.addEventListener('input', e => {
    if (e.target.matches('#mform [name="district"]')) refreshAddrLists();
    const s = e.target.closest('[data-list-search]');
    if (s) { listState[s.dataset.listSearch].q = s.value; fillList(s.dataset.listSearch); return; }
    const ei = e.target.closest('[data-e]');
    if (ei && entry) {
      const [i, k] = ei.dataset.e.split('|');
      const isNum = ENTRY_COLS.find(c => c[0] === k)[2] === 'num';
      entry.lines[+i][k] = isNum ? num(ei.value) : ei.value;
      refreshEntryRow(+i); return;
    }
    const eh = e.target.closest('[data-eh]');
    if (eh && entry) { entry[eh.dataset.eh] = eh.value; return; }
    if (e.target.closest('#lineBody')) { if ($('#lineBody').dataset.mode === 'po') recalcPo(); else recalcSale(); }
  });

  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.matches('[data-sel]')) {
      const key = t.dataset.sel; const st = listState[key];
      if (t.checked) st.sel.add(t.value); else st.sel.delete(t.value);
      updateListMeta(key); return;
    }
    if (t.matches('[data-selall]')) {
      const key = t.dataset.selall; const st = listState[key];
      st.visible.forEach(id => { if (t.checked) st.sel.add(id); else st.sel.delete(id); });
      fillList(key); return;
    }
    if (t.matches('[data-list-filter]')) {
      const [key, k] = t.dataset.listFilter.split('|');
      listState[key].f[k] = t.value; fillList(key); return;
    }
    if (t.matches('[data-esel]') && entry) {
      entry.lines[+t.dataset.esel].sel = t.checked;
      $('#eSelN').textContent = entrySelText();
      const all = $('[data-eselall]'); if (all) all.checked = entry.lines.every(l => l.sel);
      return;
    }
    if (t.matches('[data-eselall]') && entry) {
      entry.lines.forEach(l => { l.sel = t.checked; });
      $$('[data-esel]').forEach(c => { c.checked = t.checked; });
      $('#eSelN').textContent = entrySelText(); return;
    }
    if (t.matches('[data-lselall]')) { $$('#lineBody [data-lsel]').forEach(c => { c.checked = t.checked; }); updateSaleSel(); return; }
    if (t.matches('#lineBody [data-lsel]')) { updateSaleSel(); return; }
    if (t.id === 'licFiles') {
      const files = [...t.files].filter(f => ALLOWED.includes(f.type) && f.size <= 25 * 1024 * 1024);
      if (files.length < t.files.length) toast('Only JPG, PNG, WEBP, GIF and PDF files up to 25 MB can be used.');
      licPending = files;
      $('#licNote').textContent = files.length ? `Chosen: ${files.map(f => f.name).join(', ')}. Click “Read with AI” to fill the details, or just save — the files are kept either way.` : 'No file chosen.';
      t.value = ''; return;
    }
    if (t.id === 'entryAttach' && entry) {
      const files = [...t.files].filter(f => ALLOWED.includes(f.type) && f.size <= 25 * 1024 * 1024);
      if (files.length < t.files.length) toast('Only JPG, PNG, WEBP, GIF and PDF files up to 25 MB can be attached.');
      entry.fileObjs = [...(entry.fileObjs || []), ...files];
      $('#entryFilesNote').textContent = entry.fileObjs.length ? `Will be filed in the supplier’s folder: ${entry.fileObjs.map(f => f.name).join(', ')}` : '';
      t.value = ''; return;
    }
    if (t.matches('#lineBody [data-f=productId]')) {
      const tr = t.closest('tr'); const p = prod(t.value);
      if ($('#lineBody').dataset.mode === 'po') { if (p) $('[data-f=rate]', tr).value = p.pts; recalcPo(); return; }
      fillBatchOptions(tr);
      if (p) { const d = partyDefaults(); const ind = $('#mform [name=ptype]:checked')?.value === 'individual'; $('[data-f=rate]', tr).value = ind ? round2(p.mrp / (1 + p.gst / 100)) : p.ptr; $('[data-f=cd]', tr).value = d.cd; $('[data-f=td]', tr).value = d.td; if (!num($('[data-f=qty]', tr).value)) $('[data-f=qty]', tr).value = 1; }
      recalcSale(); return;
    }
    if (t.matches('#lineBody [data-f=batchId]')) { recalcSale(); return; }
    if (t.matches('[data-eh="supplierId"]')) { entry.supplierId = t.value; $('#newSupName')?.classList.toggle('hidden', !!t.value); $('#newSupGst')?.classList.toggle('hidden', !!t.value); return; }
    if (t.id === 'billFiles') { setPendingFiles([...t.files]); return; }
    if (t.id === 'csvFile' && t.files[0]) {
      try {
        const text = await t.files[0].text();
        const lines = csvToLines(text);
        if (!lines.length) { toast('No item rows found in this CSV.'); return; }
        if (entry && entry.lines.length && !confirm('Replace the bill you are checking now with this CSV?')) return;
        entry = withUploadFor(newEntry('CSV', { files: [t.files[0].name] })); entry.lines = lines; render();
        toast(`Imported ${lines.length} lines. Fill in the supplier and bill number, then check each line.`);
      } catch (err) { toast(err.message || 'Could not read the CSV.'); }
      t.value = ''; return;
    }
    if (t.id === 'restoreFile' && t.files[0]) {
      try {
        const data = JSON.parse(await t.files[0].text());
        if (!data || data.version !== 2 || !Array.isArray(data.products) || !Array.isArray(data.batches)) throw new Error('This is not a Pharma Suite backup file.');
        closeModal();
        confirmModal('Restore this backup?', `All data in this browser will be replaced with the backup (${data.products.length} products, ${data.sales?.length || 0} sale bills). This cannot be undone.`, 'Restore', () => { db = data; entry = null; return 'Backup restored.'; });
      } catch (err) { toast(err.message || 'Could not read the backup.'); }
      t.value = '';
    }
  });

  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  function setPendingFiles(files) {
    const ok = files.filter(f => ALLOWED.includes(f.type));
    if (ok.length < files.length) toast('Only JPG, PNG, WEBP, GIF photos and PDF files can be read.');
    const big = ok.find(f => f.size > 25 * 1024 * 1024);
    if (big) { toast(`${big.name} is larger than 25 MB.`); return; }
    pendingFiles = ok;
    const fl = $('#fileList'); if (fl) fl.textContent = ok.length ? ok.map(f => f.name).join(', ') : 'No file chosen';
  }
  document.addEventListener('dragover', e => { if (e.target.closest('#dropzone')) { e.preventDefault(); $('#dropzone').classList.add('over'); } });
  document.addEventListener('dragleave', e => { if (e.target.closest('#dropzone')) $('#dropzone').classList.remove('over'); });
  document.addEventListener('drop', e => {
    if (!e.target.closest('#dropzone')) return;
    e.preventDefault(); $('#dropzone').classList.remove('over');
    setPendingFiles([...e.dataTransfer.files]);
  });

  let searchTimer;
  $('#globalSearch').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { searchQuery = e.target.value.trim(); render(); }, 180);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#modalBack').classList.contains('open')) closeModal();
    if (e.key === 'Enter' && $('#modalBack').classList.contains('open') && e.target.closest('#mform') && e.target.tagName === 'INPUT' && !e.target.closest('#lineBody, #grnLines, .bulk-inline')) { e.preventDefault(); submitModal(); }
  });
  $('#modalClose').addEventListener('click', () => closeModal());
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#settingsBtn').addEventListener('click', () => ACTIONS['open-settings']());
  window.addEventListener('hashchange', render);
  window.addEventListener('beforeunload', e => { if ((entry && entry.lines.some(l => l.name)) || saveTimer || saving) { e.preventDefault(); e.returnValue = ''; } });
  $('#logoutBtn').addEventListener('click', async () => { try { await api('POST', 'api/logout', {}); } catch { /* signed out anyway */ } location.href = 'login.html'; });
  $('#pwBtn').addEventListener('click', () => ACTIONS['change-password']());

  async function boot() {
    let me = null;
    try {
      const r = await fetch('api/me', { cache: 'no-store' });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) me = await r.json();
    } catch { /* no server: browser-only mode */ }
    if (me) {
      if (me.role === 'chemist') { location.href = 'portal.html'; return; }
      if (me.role !== 'admin') { location.href = 'login.html'; return; }
      SERVER = true;
      try {
        const st = await api('GET', 'api/db');
        serverRev = st.rev;
        db = st.data ? migrate(st.data) : null;
      } catch (err) { $('#content').innerHTML = `<section class="card"><div class="empty">Could not load data from the server: ${esc(err.message)}</div></section>`; return; }
      if (!db) {
        // First run on the server: start from this browser's data if there is any, else the sample data
        db = migrate(load() || seed());
        await pushToServer();
      }
      $('#storageNote').textContent = `Signed in as ${me.username}. Data is saved on the server.`;
      $('#accountBtns').hidden = false;
      await Promise.all([loadOrders(), loadLogins()]);
      setInterval(loadOrders, 30000);
    } else {
      db = migrate(load() || seed());
      save();
    }
    render();
  }
  boot();
})();
