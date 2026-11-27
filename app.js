/* Pharma Suite — distributor dashboard (no build step, data kept in localStorage) */
(() => {
  'use strict';

  // ---------- Utilities ----------
  const KEY = 'pharmaSuite.v1';
  const DAY = 86400000;
  const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf = new Intl.NumberFormat('en-IN');
  const money = v => inr0.format(Math.round(v || 0));
  const money2 = v => inr2.format(v || 0);
  const qty = v => nf.format(v || 0);
  const round2 = v => Math.round(v * 100) / 100;
  const compact = v => {
    v = v || 0;
    if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + ' Cr';
    if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + ' L';
    return money(v);
  };
  const iso = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
  const fmtDate = s => s ? parse(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtMonth = s => s ? parse(s).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—';
  const daysFrom = s => Math.round((parse(s) - TODAY) / DAY);
  const addDays = (s, n) => iso(parse(s).getTime() + n * DAY);
  const expDays = exp => { const [y, m] = exp.split('-').map(Number); return Math.round((new Date(y, m, 0) - TODAY) / DAY); };
  const monthKey = s => s.slice(0, 7);
  const todayIso = iso(TODAY);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nextNo = (prefix, arr, field = 'no') => prefix + (Math.max(0, ...arr.map(x => +String(x[field]).replace(/\D/g, '') || 0)) + 1);
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

  // ---------- Sample data ----------
  function seed() {
    const r = rng(20261127);
    const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
    const pick = a => a[Math.floor(r() * a.length)];
    const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const letters = n => Array.from({ length: n }, () => pick(L)).join('');
    const digits = n => Array.from({ length: n }, () => ri(0, 9)).join('');
    const gstin = st => `${st}${letters(5)}${digits(4)}${pick(L)}1Z${pick(L)}`;
    const phone = () => `9${ri(6, 9)}${digits(8)}`;
    const monthOff = off => iso(new Date(TODAY.getFullYear(), TODAY.getMonth() + off, 1)).slice(0, 7);

    const suppliers = [
      ['Arogya Labs Pvt Ltd', 'Vikram Mehta', 'Ahmedabad', '24', 30],
      ['Sanjeevani Healthcare', 'Neha Kapoor', 'Mumbai', '27', 45],
      ['Nirmal Pharmaceuticals', 'Rakesh Jain', 'Indore', '23', 30],
      ['Vedant Lifesciences', 'Anita Desai', 'Pune', '27', 21],
      ['Medisure Formulations', 'Sunil Verma', 'Delhi', '07', 30],
      ['Dhanvantari Remedies', 'Kavita Rao', 'Hyderabad', '36', 45],
    ].map((s, i) => ({
      id: 'S' + String(i + 1).padStart(3, '0'), name: s[0], contact: s[1], city: s[2], phone: phone(),
      gstin: gstin(s[3]), dl: `${s[3]}-WH-${digits(5)}`, terms: s[4],
    }));

    const P = [
      ['Paracetamol 650 mg', 'Paracetamol', 'Tablet', '15 Tab', 34, 5, 0, 400, '3004'],
      ['Amoxicillin 500 mg', 'Amoxicillin', 'Capsule', '10 Cap', 98, 5, 1, 200, '3004'],
      ['Azithromycin 500 mg', 'Azithromycin', 'Tablet', '3 Tab', 119, 5, 1, 200, '3004'],
      ['Pantoprazole 40 mg', 'Pantoprazole', 'Tablet', '15 Tab', 155, 5, 2, 250, '3004'],
      ['Metformin 500 mg SR', 'Metformin', 'Tablet', '15 Tab', 42, 5, 2, 300, '3004'],
      ['Atorvastatin 10 mg', 'Atorvastatin', 'Tablet', '15 Tab', 128, 5, 3, 200, '3004'],
      ['Amlodipine 5 mg', 'Amlodipine', 'Tablet', '15 Tab', 56, 5, 3, 250, '3004'],
      ['Cetirizine 10 mg', 'Cetirizine', 'Tablet', '10 Tab', 22, 5, 0, 300, '3004'],
      ['Ondansetron 4 mg', 'Ondansetron', 'Tablet', '10 Tab', 65, 5, 4, 150, '3004'],
      ['ORS Orange 21 g', 'Oral rehydration salts', 'Sachet', '21 g', 22, 5, 4, 500, '3004'],
      ['Vitamin D3 60000 IU', 'Cholecalciferol', 'Capsule', '4 Cap', 125, 5, 5, 150, '3004'],
      ['Diclofenac Gel 30 g', 'Diclofenac', 'Gel', '30 g Tube', 115, 5, 5, 100, '3004'],
      ['Ambroxol Syrup 100 ml', 'Ambroxol', 'Syrup', '100 ml', 98, 5, 1, 120, '3004'],
      ['Telmisartan 40 mg', 'Telmisartan', 'Tablet', '15 Tab', 138, 5, 3, 200, '3004'],
      ['Montelukast 10 mg', 'Montelukast', 'Tablet', '10 Tab', 189, 5, 2, 150, '3004'],
      ['Calcium + D3 500 mg', 'Calcium carbonate', 'Tablet', '15 Tab', 112, 5, 5, 200, '3004'],
      ['Insulin Glargine 100 IU', 'Insulin glargine', 'Injection', '3 ml Pen', 780, 5, 4, 40, '3004'],
      ['Hand Sanitizer 500 ml', 'Isopropyl alcohol', 'Liquid', '500 ml', 250, 18, 0, 80, '3808'],
    ];
    const products = P.map((p, i) => ({
      id: 'P' + String(i + 1).padStart(3, '0'), name: p[0], salt: p[1], category: p[2], pack: p[3],
      mrp: p[4], gst: p[5], supplierId: suppliers[p[6]].id, reorder: p[7], hsn: p[8],
      ptr: round2(p[4] * 0.7), pts: round2(p[4] * 0.6),
    }));

    const batches = [];
    const lowSet = new Set([4, 10, 16]);
    products.forEach((p, i) => {
      const code = p.name.replace(/[^A-Z]/g, '').slice(0, 2) || 'BT';
      const n = lowSet.has(i) ? 1 : ri(1, 3);
      for (let k = 0; k < n; k++) {
        let off = pick([3, 6, 9, 14, 18, 24, 30]);
        if (i === 2 && k === 0) off = 1;
        if (i === 8 && k === 0) off = -1;
        if (i === 12 && k === 0) off = 2;
        const q = lowSet.has(i) ? Math.round(p.reorder * 0.4) : ri(Math.round(p.reorder * 0.5), Math.round(p.reorder * 2.5));
        batches.push({ id: uid() + i + k, productId: p.id, batch: code + digits(4), expiry: monthOff(off), qty: q });
      }
    });

    const chemists = [
      ['Shree Ram Medicals', 'Ramesh Agarwal', 'Jaipur', '08'],
      ['Sanjivani Pharmacy', 'Pooja Sharma', 'Jaipur', '08'],
      ['Gupta Medical Store', 'Alok Gupta', 'Kota', '08'],
      ['Apna Chemist', 'Imran Khan', 'Ajmer', '08'],
      ['Life Care Pharmacy', 'Deepa Nair', 'Udaipur', '08'],
      ['Om Sai Medicos', 'Sachin Patil', 'Jodhpur', '08'],
      ['City Health Mart', 'Manish Bansal', 'Jaipur', '08'],
      ['Jeevan Medical Hall', 'Harpreet Singh', 'Bikaner', '08'],
      ['Balaji Medicals', 'Suresh Choudhary', 'Alwar', '08'],
      ['Wellness Point Chemist', 'Ritu Malhotra', 'Jaipur', '08'],
      ['Raj Medical Agency', 'Rajendra Meena', 'Bhilwara', '08'],
      ['Care Plus Pharmacy', 'Sneha Joshi', 'Sikar', '08'],
    ].map((c, i) => ({
      id: 'C' + String(i + 1).padStart(3, '0'), name: c[0], owner: c[1], city: c[2], phone: phone(),
      dl: `RJ-${c[2].slice(0, 3).toUpperCase()}-20B/21B-${digits(5)}`, gstin: gstin(c[3]),
      creditLimit: pick([100000, 150000, 200000, 300000]), terms: pick([21, 30, 30, 45]),
      joined: addDays(todayIso, -ri(200, 900)),
      status: i === 11 ? 'Pending verification' : i === 7 ? 'On hold' : 'Active',
    }));
    chemists[11].joined = addDays(todayIso, -3);

    const lineTotals = lines => {
      let sub = 0, gst = 0;
      lines.forEach(l => { const p = products.find(x => x.id === l.productId); const a = l.qty * l.rate; sub += a; gst += a * p.gst / 100; });
      return { sub: round2(sub), gst: round2(gst), total: round2(sub + gst) };
    };
    const scaleQty = (p, q) => p.mrp > 500 ? Math.max(1, Math.ceil(q / 12)) : q;

    // Sales invoices
    const sales = [];
    const activeChem = chemists.filter(c => c.status !== 'Pending verification');
    const saleDates = Array.from({ length: 160 }, () => addDays(todayIso, -ri(0, 179))).sort();
    saleDates.forEach((d, i) => {
      const c = r() < 0.45 ? activeChem[ri(0, 3)] : pick(activeChem);
      const used = new Set(); const lines = [];
      const n = ri(1, 4);
      while (lines.length < n) {
        const p = pick(products); if (used.has(p.id)) continue; used.add(p.id);
        const b = batches.find(x => x.productId === p.id);
        lines.push({ productId: p.id, qty: scaleQty(p, ri(20, 150)), rate: p.ptr, batches: [{ batch: b ? b.batch : '—', qty: 0 }] });
      }
      lines.forEach(l => { l.batches[0].qty = l.qty; });
      const t = lineTotals(lines);
      const age = -daysFrom(d);
      let paid = 0; const x = r();
      if (age > 45) paid = x < 0.93 ? t.total : round2(t.total * 0.5);
      else if (age > 20) paid = x < 0.6 ? t.total : x < 0.8 ? round2(t.total * 0.5) : 0;
      else paid = x < 0.3 ? t.total : x < 0.5 ? round2(t.total * 0.4) : 0;
      sales.push({ no: 'SI-' + (1001 + i), date: d, chemistId: c.id, lines, ...t, paid });
    });

    // Purchase orders, GRNs, purchase invoices
    const pos = [], grns = [], pinvoices = [];
    const poCount = 24;
    for (let i = 0; i < poCount; i++) {
      const date = addDays(todayIso, -Math.round(175 - i * (172 / (poCount - 1))));
      const s = suppliers[i % suppliers.length];
      let pool = products.filter(p => p.supplierId === s.id);
      if (pool.length < 2) pool = products;
      const used = new Set(); const lines = [];
      const n = Math.min(pool.length, ri(2, 4));
      while (lines.length < n) {
        const p = pick(pool); if (used.has(p.id)) continue; used.add(p.id);
        lines.push({ productId: p.id, qty: scaleQty(p, ri(25, 120) * 10), rate: p.pts });
      }
      const t = lineTotals(lines);
      const po = { no: 'PO-' + (2001 + i), date, expected: addDays(date, 7), supplierId: s.id, lines, ...t, status: 'Open' };
      pos.push(po);
      const fromEnd = poCount - 1 - i;
      if (fromEnd < 3) continue; // still open
      const partial = fromEnd === 3;
      const gDate = addDays(date, ri(3, 6));
      const gLines = lines.map(l => ({
        productId: l.productId, batch: products.find(p => p.id === l.productId).name.replace(/[^A-Z]/g, '').slice(0, 2) + digits(4),
        expiry: monthOff(ri(12, 30)), qty: partial ? Math.round(l.qty / 2) : l.qty, rate: l.rate,
      }));
      po.status = partial ? 'Partially received' : 'Received';
      const g = { no: 'GRN-' + (3001 + grns.length), date: gDate, poNo: po.no, supplierId: s.id, challan: 'DC/' + digits(5), lines: gLines, ...lineTotals(gLines), invoiced: '' };
      grns.push(g);
      if (fromEnd < 6) continue; // awaiting invoice
      const piDate = addDays(gDate, ri(0, 2));
      const due = addDays(piDate, s.terms);
      const paid = daysFrom(due) < 0 ? (r() < 0.85 ? g.total : round2(g.total * 0.5)) : (r() < 0.3 ? g.total : 0);
      const pi = { no: 'PI-' + (4001 + pinvoices.length), supplierInvNo: s.name.slice(0, 3).toUpperCase() + '/' + digits(5), date: piDate, due, supplierId: s.id, grnNo: g.no, sub: g.sub, gst: g.gst, total: g.total, paid };
      pinvoices.push(pi);
      g.invoiced = pi.no;
    }

    return { products, batches, chemists, suppliers, sales, pos, grns, pinvoices };
  }

  function load() {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage unavailable */ }
  }

  let db = load() || seed();

  // ---------- Derived data ----------
  const prod = id => db.products.find(p => p.id === id);
  const chem = id => db.chemists.find(c => c.id === id);
  const sup = id => db.suppliers.find(s => s.id === id);
  const stockQty = pid => db.batches.filter(b => b.productId === pid).reduce((a, b) => a + b.qty, 0);
  const sellableQty = pid => db.batches.filter(b => b.productId === pid && expDays(b.expiry) >= 0).reduce((a, b) => a + b.qty, 0);
  const batchValue = b => b.qty * (prod(b.productId)?.pts || 0);
  const stockValue = () => db.batches.filter(b => expDays(b.expiry) >= 0).reduce((a, b) => a + batchValue(b), 0);
  const lineTotals = lines => {
    let sub = 0, gst = 0;
    lines.forEach(l => { const p = prod(l.productId); const a = l.qty * l.rate; sub += a; gst += a * (p ? p.gst : 0) / 100; });
    return { sub: round2(sub), gst: round2(gst), total: round2(sub + gst) };
  };
  const balance = d => Math.max(0, round2(d.total - (d.paid || 0)));
  const saleStatus = s => {
    if (balance(s) <= 0.5) return 'Paid';
    const terms = chem(s.chemistId)?.terms || 30;
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
  const chemOutstanding = cid => db.sales.filter(s => s.chemistId === cid).reduce((a, s) => a + balance(s), 0);
  const supPayable = sid => db.pinvoices.filter(p => p.supplierId === sid).reduce((a, p) => a + balance(p), 0);
  const lowStock = () => db.products.filter(p => sellableQty(p.id) < p.reorder);
  const sumBy = (arr, pred, f = x => x.total) => arr.filter(pred).reduce((a, x) => a + f(x), 0);
  const pctChange = (a, b) => b ? Math.round((a - b) / b * 100) : 0;

  const PILL = {
    Paid: 'ok', Partial: 'info', Due: 'warn', Overdue: 'bad', Unpaid: 'warn',
    Open: 'info', 'Partially received': 'warn', Received: 'ok', Cancelled: 'neutral',
    Invoiced: 'ok', 'Awaiting invoice': 'warn',
    Active: 'ok', 'Pending verification': 'warn', 'On hold': 'bad',
    Good: 'ok', 'Near expiry': 'warn', Expired: 'bad', 'Low stock': 'warn', 'Out of stock': 'bad', 'In stock': 'ok',
    PO: 'info', GRN: 'ok', Invoice: 'neutral',
  };
  const pill = s => `<span class="pill ${PILL[s] || 'neutral'}">${esc(s)}</span>`;

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
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    rupee: '<path d="M7 4h10M7 9h10M7 4c6 0 6 9 0 9l7 7"/>',
  };
  const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;

  // ---------- Navigation ----------
  const NAV = [
    { group: 'Dashboard', items: [['overview', 'Overview', 'grid']] },
    { group: 'Sales', items: [['sales', 'Sales', 'trend'], ['chemists', 'Onboard Chemists', 'store']] },
    { group: 'Inventory', items: [['stock', 'Stock Details', 'box'], ['products', 'Products', 'pill']] },
    { group: 'Purchase', items: [['purchase', 'Purchase', 'cart'], ['suppliers', 'Supplier Details', 'truck'], ['orders', 'Purchase Orders', 'clipboard'], ['grn', 'Goods Receipt (GRN)', 'check'], ['invoices', 'Purchase Invoices', 'file']] },
  ];
  const SUBTITLES = {
    overview: 'Your business at a glance',
    sales: 'Invoices raised to chemists and payments collected',
    chemists: 'Retail chemists onboarded for B2B supply',
    stock: 'Batch-wise stock with expiry tracking',
    products: 'Product master with pricing and tax',
    purchase: 'Purchase summary across suppliers',
    suppliers: 'Manufacturers and stockists you buy from',
    orders: 'Orders placed with suppliers',
    grn: 'Goods received against purchase orders',
    invoices: 'Supplier bills and payments due',
    search: 'Search results',
  };

  function renderNav(route) {
    const badges = {
      orders: db.pos.filter(p => p.status === 'Open' || p.status === 'Partially received').length,
      stock: db.batches.filter(b => batchStatus(b) !== 'Good').length,
      chemists: db.chemists.filter(c => c.status === 'Pending verification').length,
      grn: db.grns.filter(g => !g.invoiced).length,
    };
    $('#nav').innerHTML = NAV.map(g => `
      <div class="nav-group-title">${g.group}</div>
      <div class="nav">${g.items.map(([id, label, ic]) => `
        <button type="button" data-nav="${id}" class="${route === id ? 'active' : ''}">${icon(ic)}<span>${label}</span>${badges[id] ? `<span class="badge-n">${badges[id]}</span>` : ''}</button>`).join('')}
      </div>`).join('');
  }

  // ---------- Building blocks ----------
  const kpi = (label, value, foot = '') => `<div class="card kpi"><div class="kpi-label"><span class="dot"></span>${label}</div><div class="kpi-value num">${value}</div><div class="kpi-foot">${foot}</div></div>`;
  const trendFoot = (cur, prev, text = 'vs last month') => {
    const p = pctChange(cur, prev);
    return `<span class="${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%</span> ${text}`;
  };
  const actBtn = (act, id, label, cls = '') => `<button type="button" class="btn sm ${cls}" data-act="${act}" data-id="${esc(id)}">${label}</button>`;

  function table(columns, rows, empty = 'Nothing to show yet.') {
    if (!rows.length) return `<div class="empty">${empty}</div>`;
    return `<table><thead><tr>${columns.map(c => `<th class="${c.r ? 'r' : ''}">${c.h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(row => `<tr>${columns.map(c => `<td class="${c.r ? 'r num' : ''}">${c.c(row)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  const lists = {};
  const listState = {};
  function useList(cfg) {
    lists[cfg.key] = cfg;
    const st = listState[cfg.key] || (listState[cfg.key] = { q: '', tab: cfg.tabs ? cfg.tabs[0].id : null });
    return `<section class="card">
      <div class="card-head">
        <h2 class="card-title">${cfg.title}</h2><span class="hint" id="cnt-${cfg.key}"></span>
        <div class="spacer"></div>
        <div class="toolbar">
          ${cfg.tabs ? `<div class="tabs" data-tabs="${cfg.key}">${cfg.tabs.map(t => `<button type="button" data-tab="${t.id}" class="${st.tab === t.id ? 'active' : ''}">${t.label}</button>`).join('')}</div>` : ''}
          ${cfg.noSearch ? '' : `<label class="search">${icon('search')}<input data-list-search="${cfg.key}" value="${esc(st.q)}" placeholder="Search…"></label>`}
          ${cfg.actions || ''}
        </div>
      </div>
      <div class="table-wrap" id="tbl-${cfg.key}"></div>
    </section>`;
  }
  function fillList(key) {
    const cfg = lists[key]; const st = listState[key];
    const el = $('#tbl-' + key); if (!cfg || !el) return;
    let rows = cfg.rows();
    if (cfg.tabs) { const t = cfg.tabs.find(t => t.id === st.tab); if (t && t.filter) rows = rows.filter(t.filter); }
    if (st.q) { const q = st.q.toLowerCase(); rows = rows.filter(r => cfg.text(r).toLowerCase().includes(q)); }
    el.innerHTML = table(cfg.columns, rows, cfg.empty);
    const cnt = $('#cnt-' + key); if (cnt) cnt.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
  }

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
    const pM = sumBy(db.grns, g => monthKey(g.date) === thisM), pP = sumBy(db.grns, g => monthKey(g.date) === prevM);
    const recv = db.sales.reduce((a, s) => a + balance(s), 0);
    const overdue = db.sales.filter(s => saleStatus(s) === 'Overdue');
    const months = lastMonths(6);
    const series = [
      { label: 'Sales', color: 'var(--brand)', values: months.map(m => sumBy(db.sales, s => monthKey(s.date) === m.key)) },
      { label: 'Purchases', color: 'var(--gold)', values: months.map(m => sumBy(db.grns, g => monthKey(g.date) === m.key)) },
    ];
    const alerts = [];
    const low = lowStock();
    if (low.length) alerts.push(['warn', 'alert', `${low.length} products below reorder level`, low.slice(0, 3).map(p => p.name).join(', ') + (low.length > 3 ? '…' : ''), 'stock']);
    const near = db.batches.filter(b => batchStatus(b) === 'Near expiry');
    if (near.length) alerts.push(['warn', 'clock', `${near.length} batches expiring within 90 days`, `Stock value ${compact(near.reduce((a, b) => a + batchValue(b), 0))}`, 'stock']);
    const exp = db.batches.filter(b => batchStatus(b) === 'Expired');
    if (exp.length) alerts.push(['bad', 'alert', `${exp.length} expired batches in stock`, 'Return to supplier or write off', 'stock']);
    if (overdue.length) alerts.push(['bad', 'rupee', `${overdue.length} overdue sales invoices`, `${compact(overdue.reduce((a, s) => a + balance(s), 0))} to collect`, 'sales']);
    const openPo = db.pos.filter(p => p.status === 'Open' || p.status === 'Partially received');
    if (openPo.length) alerts.push(['info', 'truck', `${openPo.length} purchase orders awaiting delivery`, `Worth ${compact(openPo.reduce((a, p) => a + p.total, 0))}`, 'orders']);
    const dueSoon = db.pinvoices.filter(p => piStatus(p) !== 'Paid' && daysFrom(p.due) <= 7);
    if (dueSoon.length) alerts.push(['warn', 'file', `${dueSoon.length} supplier bills due within 7 days`, `${compact(dueSoon.reduce((a, p) => a + balance(p), 0))} payable`, 'invoices']);
    const pend = db.chemists.filter(c => c.status === 'Pending verification');
    if (pend.length) alerts.push(['info', 'store', `${pend.length} chemist awaiting verification`, pend.map(c => c.name).join(', '), 'chemists']);

    const since = addDays(todayIso, -90);
    const byChem = {};
    db.sales.filter(s => s.date >= since).forEach(s => { byChem[s.chemistId] = (byChem[s.chemistId] || 0) + s.total; });
    const top = Object.entries(byChem).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, v]) => ({ label: chem(id)?.name || id, value: v }));

    const recent = [...db.sales].sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no)).slice(0, 7);

    return `
      <div class="grid g-4">
        ${kpi('Sales this month', compact(sM), trendFoot(sM, sP))}
        ${kpi('Purchases this month', compact(pM), trendFoot(pM, pP))}
        ${kpi('Stock value (at cost)', compact(stockValue()), `${db.products.filter(p => sellableQty(p.id) > 0).length} products · ${db.batches.length} batches`)}
        ${kpi('Receivables', compact(recv), overdue.length ? `<span class="down">${overdue.length} overdue</span> invoices` : 'All invoices within terms')}
      </div>
      <div class="grid g-2-1">
        <section class="card"><div class="card-head"><h2 class="card-title">Sales vs purchases</h2><span class="hint">Last 6 months</span><div class="spacer"></div>${legend(series)}</div>
          <div class="card-body">${barChart(months.map(m => m.label), series)}</div></section>
        <section class="card"><div class="card-head"><h2 class="card-title">Needs attention</h2></div>
          <div class="alert-list">${alerts.map(([k, ic, t, s, go]) => `
            <div class="alert-item"><div class="alert-icon ${k}">${icon(ic)}</div><div style="flex:1;min-width:0"><div class="strong">${esc(t)}</div><div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s)}</div></div><button type="button" class="btn ghost sm" data-nav="${go}">View</button></div>`).join('') || '<div class="empty">All clear.</div>'}
          </div></section>
      </div>
      <div class="grid g-2-1">
        <section class="card"><div class="card-head"><h2 class="card-title">Recent sales</h2><div class="spacer"></div><button type="button" class="btn sm" data-nav="sales">All sales</button>${actBtn('new-sale', '', icon('plus') + 'New sale', 'primary')}</div>
          <div class="table-wrap">${table([
            { h: 'Invoice', c: s => `<span class="strong">${s.no}</span>` },
            { h: 'Date', c: s => fmtDate(s.date) },
            { h: 'Chemist', c: s => esc(chem(s.chemistId)?.name) },
            { h: 'Amount', r: 1, c: s => money(s.total) },
            { h: 'Status', c: s => pill(saleStatus(s)) },
            { h: '', c: s => actBtn('view-sale', s.no, 'View', 'ghost') },
          ], recent)}</div></section>
        <section class="card"><div class="card-head"><h2 class="card-title">Top chemists</h2><span class="hint">Last 90 days</span></div>
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
        ${kpi('Invoices this month', qty(nM), nM ? `Avg ${compact(sM / nM)} per invoice` : '—')}
      </div>
      ${useList({
        key: 'sales', title: 'Sales invoices',
        actions: actBtn('new-sale', '', icon('plus') + 'New sale', 'primary'),
        tabs: [{ id: 'all', label: 'All' }, ...['Paid', 'Partial', 'Due', 'Overdue'].map(s => ({ id: s, label: s, filter: x => saleStatus(x) === s }))],
        rows: () => [...db.sales].sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no)),
        text: s => [s.no, chem(s.chemistId)?.name, chem(s.chemistId)?.city].join(' '),
        columns: [
          { h: 'Invoice', c: s => `<span class="strong">${s.no}</span>` },
          { h: 'Date', c: s => fmtDate(s.date) },
          { h: 'Chemist', c: s => `${esc(chem(s.chemistId)?.name)}<div class="small muted">${esc(chem(s.chemistId)?.city)}</div>` },
          { h: 'Items', r: 1, c: s => s.lines.length },
          { h: 'Amount', r: 1, c: s => money(s.total) },
          { h: 'Received', r: 1, c: s => money(s.paid) },
          { h: 'Balance', r: 1, c: s => `<span class="${balance(s) > 0 ? 'strong' : 'muted'}">${money(balance(s))}</span>` },
          { h: 'Status', c: s => pill(saleStatus(s)) },
          { h: '', c: s => actBtn('view-sale', s.no, 'View', 'ghost') + (balance(s) > 0.5 ? ' ' + actBtn('pay-sale', s.no, 'Receive') : '') },
        ],
      })}`;
  };

  VIEWS.chemists = () => {
    const active = db.chemists.filter(c => c.status === 'Active').length;
    const pend = db.chemists.filter(c => c.status === 'Pending verification').length;
    const out = db.sales.reduce((a, s) => a + balance(s), 0);
    const newM = db.chemists.filter(c => monthKey(c.joined) === thisM).length;
    return `
      <div class="grid g-4">
        ${kpi('Active chemists', qty(active), `${db.chemists.length} onboarded in total`)}
        ${kpi('Pending verification', qty(pend), 'Check drug licence and GSTIN')}
        ${kpi('Total receivable', compact(out), 'Across all chemists')}
        ${kpi('Onboarded this month', qty(newM), 'New retail partners')}
      </div>
      ${useList({
        key: 'chemists', title: 'Chemists',
        actions: actBtn('new-chemist', '', icon('plus') + 'Onboard chemist', 'primary'),
        tabs: [{ id: 'all', label: 'All' }, ...['Active', 'Pending verification', 'On hold'].map(s => ({ id: s, label: s === 'Pending verification' ? 'Pending' : s, filter: c => c.status === s }))],
        rows: () => db.chemists,
        text: c => [c.id, c.name, c.owner, c.city, c.phone, c.dl, c.gstin].join(' '),
        columns: [
          { h: 'Chemist', c: c => `<span class="strong">${esc(c.name)}</span><div class="small muted">${esc(c.owner)} · ${esc(c.id)}</div>` },
          { h: 'City', c: c => esc(c.city) },
          { h: 'Phone', c: c => esc(c.phone) },
          { h: 'Drug licence', c: c => `<span class="small">${esc(c.dl)}</span>` },
          { h: 'GSTIN', c: c => `<span class="small">${esc(c.gstin || '—')}</span>` },
          { h: 'Credit limit', r: 1, c: c => money(c.creditLimit) },
          { h: 'Outstanding', r: 1, c: c => { const o = chemOutstanding(c.id); return `<span class="${o > c.creditLimit ? 'strong' : ''}" style="${o > c.creditLimit ? 'color:var(--bad)' : ''}">${money(o)}</span>`; } },
          { h: 'Status', c: c => pill(c.status) },
          { h: '', c: c => actBtn('view-chemist', c.id, 'View', 'ghost') },
        ],
      })}`;
  };

  VIEWS.stock = () => {
    const near = db.batches.filter(b => batchStatus(b) === 'Near expiry');
    const exp = db.batches.filter(b => batchStatus(b) === 'Expired');
    const low = lowStock();
    return `
      <div class="grid g-4">
        ${kpi('Saleable stock value', compact(stockValue()), 'At purchase rate (PTS)')}
        ${kpi('Below reorder level', qty(low.length), 'Products to reorder')}
        ${kpi('Near expiry (≤ 90 days)', compact(near.reduce((a, b) => a + batchValue(b), 0)), `${near.length} batches`)}
        ${kpi('Expired stock', compact(exp.reduce((a, b) => a + batchValue(b), 0)), `${exp.length} batches`)}
      </div>
      ${useList({
        key: 'stock', title: 'Batch-wise stock',
        tabs: [{ id: 'all', label: 'All' }, { id: 'near', label: 'Near expiry', filter: b => batchStatus(b) === 'Near expiry' }, { id: 'exp', label: 'Expired', filter: b => batchStatus(b) === 'Expired' }],
        rows: () => db.batches.filter(b => b.qty > 0).sort((a, b) => a.expiry.localeCompare(b.expiry)),
        text: b => [prod(b.productId)?.name, prod(b.productId)?.salt, b.batch].join(' '),
        columns: [
          { h: 'Product', c: b => `<span class="strong">${esc(prod(b.productId)?.name)}</span><div class="small muted">${esc(prod(b.productId)?.pack)}</div>` },
          { h: 'Batch', c: b => esc(b.batch) },
          { h: 'Expiry', c: b => fmtMonth(b.expiry) },
          { h: 'Days left', r: 1, c: b => { const d = expDays(b.expiry); return d < 0 ? `<span style="color:var(--bad)">${d}</span>` : qty(d); } },
          { h: 'Qty', r: 1, c: b => qty(b.qty) },
          { h: 'Rate (PTS)', r: 1, c: b => money2(prod(b.productId)?.pts) },
          { h: 'Value', r: 1, c: b => money(batchValue(b)) },
          { h: 'Status', c: b => pill(batchStatus(b)) },
        ],
      })}
      ${useList({
        key: 'reorder', title: 'Reorder required', noSearch: true,
        rows: () => lowStock(),
        text: p => p.name,
        empty: 'Every product is above its reorder level.',
        columns: [
          { h: 'Product', c: p => `<span class="strong">${esc(p.name)}</span><div class="small muted">${esc(p.salt)}</div>` },
          { h: 'Supplier', c: p => esc(sup(p.supplierId)?.name) },
          { h: 'Saleable stock', r: 1, c: p => qty(sellableQty(p.id)) },
          { h: 'Reorder level', r: 1, c: p => qty(p.reorder) },
          { h: 'Suggested qty', r: 1, c: p => qty(p.reorder * 2 - sellableQty(p.id)) },
          { h: '', c: p => actBtn('reorder-po', p.id, 'Create PO', 'primary') },
        ],
      })}`;
  };

  VIEWS.products = () => `
    ${useList({
      key: 'products', title: 'Product master',
      actions: actBtn('new-product', '', icon('plus') + 'Add product', 'primary'),
      tabs: [{ id: 'all', label: 'All' }, { id: 'low', label: 'Low stock', filter: p => { const q = sellableQty(p.id); return q > 0 && q < p.reorder; } }, { id: 'out', label: 'Out of stock', filter: p => sellableQty(p.id) <= 0 }],
      rows: () => [...db.products].sort((a, b) => a.name.localeCompare(b.name)),
      text: p => [p.id, p.name, p.salt, p.category, sup(p.supplierId)?.name, p.hsn].join(' '),
      columns: [
        { h: 'Product', c: p => `<span class="strong">${esc(p.name)}</span><div class="small muted">${esc(p.salt)} · ${esc(p.id)}</div>` },
        { h: 'Company', c: p => esc(sup(p.supplierId)?.name) },
        { h: 'Category', c: p => esc(p.category) },
        { h: 'Pack', c: p => esc(p.pack) },
        { h: 'HSN', c: p => esc(p.hsn) },
        { h: 'GST', r: 1, c: p => p.gst + '%' },
        { h: 'MRP', r: 1, c: p => money2(p.mrp) },
        { h: 'PTR', r: 1, c: p => money2(p.ptr) },
        { h: 'PTS', r: 1, c: p => money2(p.pts) },
        { h: 'Stock', r: 1, c: p => qty(sellableQty(p.id)) },
        { h: 'Status', c: p => { const q = sellableQty(p.id); return pill(q <= 0 ? 'Out of stock' : q < p.reorder ? 'Low stock' : 'In stock'); } },
        { h: '', c: p => actBtn('edit-product', p.id, 'Edit', 'ghost') },
      ],
    })}`;

  VIEWS.purchase = () => {
    const pM = sumBy(db.grns, g => monthKey(g.date) === thisM), pP = sumBy(db.grns, g => monthKey(g.date) === prevM);
    const payable = db.pinvoices.reduce((a, p) => a + balance(p), 0);
    const overdue = db.pinvoices.filter(p => piStatus(p) === 'Overdue');
    const openPo = db.pos.filter(p => p.status === 'Open' || p.status === 'Partially received');
    const awaiting = db.grns.filter(g => !g.invoiced);
    const months = lastMonths(6);
    const series = [{ label: 'Goods received', color: 'var(--gold)', values: months.map(m => sumBy(db.grns, g => monthKey(g.date) === m.key)) }];
    const since = months[0].key;
    const bySup = db.suppliers.map(s => ({ label: s.name, value: sumBy(db.grns, g => g.supplierId === s.id && monthKey(g.date) >= since) })).sort((a, b) => b.value - a.value);
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
      <div class="grid g-2-1">
        <section class="card"><div class="card-head"><h2 class="card-title">Monthly purchases</h2><span class="hint">Value of goods received</span></div>
          <div class="card-body">${barChart(months.map(m => m.label), series)}</div></section>
        <section class="card"><div class="card-head"><h2 class="card-title">By supplier</h2><span class="hint">Last 6 months</span></div>
          <div class="card-body">${barList(bySup, 'gold')}</div></section>
      </div>
      <section class="card">
        <div class="card-head"><h2 class="card-title">Recent purchase activity</h2><div class="spacer"></div>
          <div class="toolbar">${actBtn('new-po', '', icon('plus') + 'Purchase order', 'primary')}${actBtn('new-grn', '', icon('plus') + 'Goods receipt')}${actBtn('new-pi', '', icon('plus') + 'Purchase invoice')}</div></div>
        <div class="table-wrap">${table([
          { h: 'Type', c: a => pill(a.type) },
          { h: 'Number', c: a => `<span class="strong">${a.no}</span>` },
          { h: 'Date', c: a => fmtDate(a.date) },
          { h: 'Supplier', c: a => esc(sup(a.supplierId)?.name) },
          { h: 'Amount', r: 1, c: a => money(a.total) },
          { h: 'Status', c: a => pill(a.status) },
          { h: '', c: a => actBtn(a.act, a.no, 'View', 'ghost') },
        ], activity)}</div>
      </section>`;
  };

  VIEWS.suppliers = () => {
    const since = lastMonths(6)[0].key;
    return useList({
      key: 'suppliers', title: 'Suppliers',
      actions: actBtn('new-supplier', '', icon('plus') + 'Add supplier', 'primary'),
      rows: () => db.suppliers,
      text: s => [s.id, s.name, s.contact, s.city, s.gstin, s.dl, s.phone].join(' '),
      columns: [
        { h: 'Supplier', c: s => `<span class="strong">${esc(s.name)}</span><div class="small muted">${esc(s.contact)} · ${esc(s.id)}</div>` },
        { h: 'City', c: s => esc(s.city) },
        { h: 'Phone', c: s => esc(s.phone) },
        { h: 'GSTIN', c: s => `<span class="small">${esc(s.gstin)}</span>` },
        { h: 'Drug licence', c: s => `<span class="small">${esc(s.dl)}</span>` },
        { h: 'Terms', r: 1, c: s => s.terms + ' days' },
        { h: 'Purchases (6 mo)', r: 1, c: s => money(sumBy(db.grns, g => g.supplierId === s.id && monthKey(g.date) >= since)) },
        { h: 'Payable', r: 1, c: s => money(supPayable(s.id)) },
        { h: '', c: s => actBtn('view-supplier', s.id, 'View', 'ghost') },
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
      { h: '', c: p => actBtn('view-po', p.no, 'View', 'ghost') + ((p.status === 'Open' || p.status === 'Partially received') ? ' ' + actBtn('receive-po', p.no, 'Receive') : '') },
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
      { h: 'Qty received', r: 1, c: g => qty(g.lines.reduce((a, l) => a + l.qty, 0)) },
      { h: 'Value', r: 1, c: g => money(g.total) },
      { h: 'Invoice', c: g => g.invoiced ? pill('Invoiced') + ` <span class="small muted">${esc(g.invoiced)}</span>` : pill('Awaiting invoice') },
      { h: '', c: g => actBtn('view-grn', g.no, 'View', 'ghost') + (!g.invoiced ? ' ' + actBtn('invoice-grn', g.no, 'Add invoice') : '') },
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
        actions: actBtn('new-pi', '', icon('plus') + 'New purchase invoice', 'primary'),
        tabs: [{ id: 'all', label: 'All' }, { id: 'unpaid', label: 'Unpaid', filter: p => piStatus(p) !== 'Paid' }, { id: 'Overdue', label: 'Overdue', filter: p => piStatus(p) === 'Overdue' }, { id: 'Paid', label: 'Paid', filter: p => piStatus(p) === 'Paid' }],
        rows: () => [...db.pinvoices].sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no)),
        text: p => [p.no, p.supplierInvNo, p.grnNo, sup(p.supplierId)?.name].join(' '),
        columns: [
          { h: 'Invoice', c: p => `<span class="strong">${p.no}</span><div class="small muted">Supplier bill ${esc(p.supplierInvNo)}</div>` },
          { h: 'Date', c: p => fmtDate(p.date) },
          { h: 'Supplier', c: p => esc(sup(p.supplierId)?.name) },
          { h: 'GRN', c: p => esc(p.grnNo) },
          { h: 'Amount', r: 1, c: p => money(p.total) },
          { h: 'Paid', r: 1, c: p => money(p.paid) },
          { h: 'Balance', r: 1, c: p => `<span class="${balance(p) > 0 ? 'strong' : 'muted'}">${money(balance(p))}</span>` },
          { h: 'Due date', c: p => fmtDate(p.due) },
          { h: 'Status', c: p => pill(piStatus(p)) },
          { h: '', c: p => actBtn('view-pi', p.no, 'View', 'ghost') + (balance(p) > 0.5 ? ' ' + actBtn('pay-pi', p.no, 'Pay') : '') },
        ],
      })}`;
  };

  let searchQuery = '';
  VIEWS.search = () => {
    const q = searchQuery.toLowerCase();
    const has = (...v) => v.join(' ').toLowerCase().includes(q);
    const sections = [
      ['Products', db.products.filter(p => has(p.name, p.salt, p.id)), p => `${esc(p.name)} <span class="muted small">${esc(p.salt)}</span>`, 'edit-product', p => p.id],
      ['Chemists', db.chemists.filter(c => has(c.name, c.owner, c.city, c.id, c.gstin)), c => `${esc(c.name)} <span class="muted small">${esc(c.city)}</span>`, 'view-chemist', c => c.id],
      ['Suppliers', db.suppliers.filter(s => has(s.name, s.contact, s.city, s.id)), s => esc(s.name), 'view-supplier', s => s.id],
      ['Sales invoices', db.sales.filter(s => has(s.no, chem(s.chemistId)?.name)).slice(0, 20), s => `${s.no} <span class="muted small">${esc(chem(s.chemistId)?.name)} · ${money(s.total)}</span>`, 'view-sale', s => s.no],
      ['Purchase orders', db.pos.filter(p => has(p.no, sup(p.supplierId)?.name)), p => `${p.no} <span class="muted small">${esc(sup(p.supplierId)?.name)}</span>`, 'view-po', p => p.no],
      ['Goods receipts', db.grns.filter(g => has(g.no, g.poNo, g.challan)), g => `${g.no} <span class="muted small">${esc(g.poNo)}</span>`, 'view-grn', g => g.no],
      ['Purchase invoices', db.pinvoices.filter(p => has(p.no, p.supplierInvNo)), p => `${p.no} <span class="muted small">${esc(p.supplierInvNo)}</span>`, 'view-pi', p => p.no],
    ].filter(s => s[1].length);
    if (!sections.length) return `<section class="card"><div class="empty">Nothing matches “${esc(searchQuery)}”.</div></section>`;
    return `<div class="grid g-2">${sections.map(([t, rows, label, act, id]) => `
      <section class="card"><div class="card-head"><h2 class="card-title">${t}</h2><span class="hint">${rows.length}</span></div>
        <div class="alert-list">${rows.map(r => `<div class="alert-item"><div style="flex:1;min-width:0">${label(r)}</div>${actBtn(act, id(r), 'Open', 'ghost')}</div>`).join('')}</div></section>`).join('')}</div>`;
  };

  // ---------- Render ----------
  let route = 'overview';
  function render() {
    const hash = location.hash.replace('#', '');
    route = VIEWS[hash] && hash !== 'search' ? hash : 'overview';
    const r = searchQuery.length >= 2 ? 'search' : route;
    renderNav(r === 'search' ? '' : route);
    const item = NAV.flatMap(g => g.items).find(i => i[0] === r);
    $('#pageTitle').textContent = r === 'search' ? `Search: “${searchQuery}”` : item[1];
    $('#pageSub').textContent = `${SUBTITLES[r]} · ${TODAY.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
    document.title = `${r === 'search' ? 'Search' : item[1]} · Pharma Suite`;
    Object.keys(lists).forEach(k => delete lists[k]);
    $('#content').innerHTML = VIEWS[r]();
    Object.keys(lists).forEach(fillList);
  }
  const refresh = () => { save(); render(); };

  // ---------- Modal ----------
  let modalSubmit = null;
  function openModal({ title, body, submitLabel = 'Save', onSubmit, wide = false, extraFoot = '' }) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = `<form id="mform" novalidate>${body}</form>`;
    $('.modal').style.maxWidth = wide ? '920px' : '720px';
    $('#modalFoot').innerHTML = `${extraFoot}<button type="button" class="btn" data-close>${onSubmit ? 'Cancel' : 'Close'}</button>${onSubmit ? `<button type="button" class="btn primary" data-submit>${submitLabel}</button>` : ''}`;
    modalSubmit = onSubmit || null;
    $('#modalBack').classList.add('open');
    const first = $('#mform input:not([readonly]), #mform select');
    if (first) setTimeout(() => first.focus(), 30);
  }
  function closeModal() { $('#modalBack').classList.remove('open'); modalSubmit = null; }
  function submitModal() {
    const form = $('#mform');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const data = Object.fromEntries(new FormData(form).entries());
    const result = modalSubmit && modalSubmit(data, form);
    if (result === false) return;
    closeModal(); refresh();
    if (typeof result === 'string') toast(result);
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  const field = (label, name, { type = 'text', value = '', required = false, full = false, attrs = '', options = null } = {}) => `
    <div class="field ${full ? 'full' : ''}"><label for="f-${name}">${label}${required ? ' *' : ''}</label>
    ${options
      ? `<select id="f-${name}" name="${name}" ${required ? 'required' : ''} ${attrs}>${options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`
      : `<input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${attrs}>`}
    </div>`;
  const GSTIN_RE = '[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]';
  const detailGrid = pairs => `<div class="detail-grid">${pairs.map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div>`;
  const totalsBlock = d => `<div class="totals"><div>Subtotal <b class="num">${money2(d.sub)}</b></div><div>GST <b class="num">${money2(d.gst)}</b></div><div class="grand">Total <span class="num">${money2(d.total)}</span></div></div>`;
  const miniTable = (cols, rows) => `<div class="lines"><div class="table-wrap">${table(cols, rows)}</div></div>`;

  // Line editor (sales and purchase orders)
  function lineRow(mode, l = {}) {
    const opts = [...db.products].sort((a, b) => a.name.localeCompare(b.name)).map(p => `<option value="${p.id}" ${p.id === l.productId ? 'selected' : ''}>${esc(p.name)} — ${esc(p.pack)}</option>`).join('');
    return `<tr data-line>
      <td style="min-width:220px"><select data-f="productId"><option value="">Select product</option>${opts}</select></td>
      ${mode === 'sale' ? '<td class="r small muted" data-avl>—</td>' : ''}
      <td style="width:90px"><input data-f="qty" type="number" min="1" step="1" value="${l.qty || ''}"></td>
      <td style="width:110px"><input data-f="rate" type="number" min="0" step="0.01" value="${l.rate ?? ''}"></td>
      <td class="r small muted" data-gst>—</td>
      <td class="r num" data-amt>—</td>
      <td><button type="button" class="btn ghost sm" data-rm-line aria-label="Remove line">✕</button></td>
    </tr>`;
  }
  function linesBlock(mode, lines) {
    const rows = (lines && lines.length ? lines : [{}]).map(l => lineRow(mode, l)).join('');
    return `<div class="lines"><div class="table-wrap"><table>
      <thead><tr><th>Product</th>${mode === 'sale' ? '<th class="r">Saleable</th>' : ''}<th>Qty</th><th>Rate ₹</th><th class="r">GST</th><th class="r">Amount</th><th></th></tr></thead>
      <tbody id="lineBody" data-mode="${mode}">${rows}</tbody></table></div>
      <div class="add-line"><button type="button" class="btn sm" data-add-line>+ Add line</button></div></div>
      <div class="totals"><div>Subtotal <b id="tSub" class="num">₹0</b></div><div>GST <b id="tGst" class="num">₹0</b></div><div class="grand">Total <span id="tTot" class="num">₹0</span></div></div>`;
  }
  function readLines() {
    return $$('#lineBody tr[data-line]').map(tr => ({
      productId: $('[data-f=productId]', tr).value,
      qty: Math.floor(+$('[data-f=qty]', tr).value || 0),
      rate: round2(+$('[data-f=rate]', tr).value || 0),
    })).filter(l => l.productId && l.qty > 0);
  }
  function recalcLines() {
    const body = $('#lineBody'); if (!body) return;
    const mode = body.dataset.mode;
    $$('tr[data-line]', body).forEach(tr => {
      const p = prod($('[data-f=productId]', tr).value);
      const q = +$('[data-f=qty]', tr).value || 0, rate = +$('[data-f=rate]', tr).value || 0;
      if (mode === 'sale') { const avl = p ? sellableQty(p.id) : null; const c = $('[data-avl]', tr); c.textContent = p ? qty(avl) : '—'; c.style.color = p && q > avl ? 'var(--bad)' : ''; }
      $('[data-gst]', tr).textContent = p ? p.gst + '%' : '—';
      $('[data-amt]', tr).textContent = p && q ? money2(q * rate) : '—';
    });
    const t = lineTotals(readLines());
    $('#tSub').textContent = money2(t.sub); $('#tGst').textContent = money2(t.gst); $('#tTot').textContent = money2(t.total);
  }

  // GRN line editor (driven by a purchase order)
  function grnLines(poNo) {
    const po = db.pos.find(p => p.no === poNo);
    if (!po) return '<div class="muted">Select a purchase order to see its items.</div>';
    const defExp = iso(new Date(TODAY.getFullYear() + 2, TODAY.getMonth(), 1)).slice(0, 7);
    const rows = po.lines.map((l, i) => {
      const p = prod(l.productId); const rec = receivedQty(po.no, l.productId); const pend = Math.max(0, l.qty - rec);
      return `<tr data-gline="${i}" data-pending="${pend}">
        <td><span class="strong">${esc(p?.name)}</span><div class="small muted">Ordered ${qty(l.qty)} · received ${qty(rec)} · rate ${money2(l.rate)}</div></td>
        <td class="r">${qty(pend)}</td>
        <td style="width:120px"><input data-g="batch" placeholder="Batch no." ${pend ? '' : 'disabled'}></td>
        <td style="width:140px"><input data-g="expiry" type="month" value="${defExp}" min="${todayIso.slice(0, 7)}" ${pend ? '' : 'disabled'}></td>
        <td style="width:100px"><input data-g="qty" type="number" min="0" max="${pend}" step="1" value="${pend}" ${pend ? '' : 'disabled'}></td>
      </tr>`;
    }).join('');
    return `<div class="lines"><div class="table-wrap"><table><thead><tr><th>Product</th><th class="r">Pending</th><th>Batch</th><th>Expiry</th><th>Qty received</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  // ---------- Actions ----------
  const ACTIONS = {};

  ACTIONS['new-sale'] = () => {
    const chemOpts = [['', 'Select chemist'], ...db.chemists.filter(c => c.status === 'Active').map(c => [c.id, `${c.name} — ${c.city}`])];
    openModal({
      title: 'New sales invoice', wide: true, submitLabel: 'Create invoice',
      body: `<div class="form-grid">
          ${field('Chemist', 'chemistId', { required: true, options: chemOpts })}
          ${field('Invoice date', 'date', { type: 'date', value: todayIso, required: true, attrs: `max="${todayIso}"` })}
        </div>
        <div id="chemInfo" class="small muted"></div>
        ${linesBlock('sale')}
        <div class="form-grid">${field('Payment received now (₹)', 'paid', { type: 'number', value: 0, attrs: 'min="0" step="0.01"' })}</div>
        <div class="small muted">Stock is taken from the earliest-expiring batch first. Only chemists marked Active can be billed.</div>`,
      onSubmit: d => {
        const lines = readLines();
        if (!lines.length) { toast('Add at least one product with a quantity.'); return false; }
        const need = {};
        lines.forEach(l => { need[l.productId] = (need[l.productId] || 0) + l.qty; });
        for (const pid in need) {
          if (need[pid] > sellableQty(pid)) { toast(`Only ${qty(sellableQty(pid))} of ${prod(pid).name} in saleable stock.`); return false; }
        }
        lines.forEach(l => {
          let left = l.qty; l.batches = [];
          db.batches.filter(b => b.productId === l.productId && b.qty > 0 && expDays(b.expiry) >= 0)
            .sort((a, b) => a.expiry.localeCompare(b.expiry))
            .forEach(b => { if (!left) return; const take = Math.min(left, b.qty); b.qty -= take; left -= take; l.batches.push({ batch: b.batch, qty: take }); });
        });
        const t = lineTotals(lines);
        const no = nextNo('SI-', db.sales);
        const c = chem(d.chemistId);
        db.sales.push({ no, date: d.date, chemistId: d.chemistId, lines, ...t, paid: Math.min(t.total, round2(+d.paid || 0)) });
        const over = chemOutstanding(c.id) > c.creditLimit;
        return over ? `${no} created. Note: ${c.name} is now above their credit limit.` : `${no} created for ${money(t.total)}.`;
      },
    });
    recalcLines();
    $('#f-chemistId').addEventListener('change', e => {
      const c = chem(e.target.value);
      $('#chemInfo').innerHTML = c ? `Credit limit ${money(c.creditLimit)} · outstanding ${money(chemOutstanding(c.id))} · terms ${c.terms} days` : '';
    });
  };

  ACTIONS['view-sale'] = no => {
    const s = db.sales.find(x => x.no === no); if (!s) return;
    const c = chem(s.chemistId);
    openModal({
      title: `Sales invoice ${s.no}`, wide: true,
      extraFoot: balance(s) > 0.5 ? `<button type="button" class="btn gold" data-act="pay-sale" data-id="${s.no}" style="margin-right:auto">Record payment</button>` : '',
      body: `${detailGrid([['Chemist', esc(c?.name)], ['City', esc(c?.city)], ['Date', fmtDate(s.date)], ['GSTIN', esc(c?.gstin || '—')], ['Drug licence', esc(c?.dl)], ['Status', pill(saleStatus(s))]])}
        ${miniTable([
          { h: 'Product', c: l => esc(prod(l.productId)?.name) },
          { h: 'Batch', c: l => (l.batches || []).map(b => `${esc(b.batch)} (${qty(b.qty)})`).join(', ') || '—' },
          { h: 'Qty', r: 1, c: l => qty(l.qty) },
          { h: 'Rate', r: 1, c: l => money2(l.rate) },
          { h: 'GST', r: 1, c: l => (prod(l.productId)?.gst ?? 0) + '%' },
          { h: 'Amount', r: 1, c: l => money2(l.qty * l.rate) },
        ], s.lines)}
        ${totalsBlock(s)}
        <div class="totals"><div>Received <b class="num">${money2(s.paid)}</b></div><div>Balance <b class="num">${money2(balance(s))}</b></div></div>`,
    });
  };

  ACTIONS['pay-sale'] = no => {
    const s = db.sales.find(x => x.no === no); if (!s) return;
    openModal({
      title: `Receive payment · ${s.no}`, submitLabel: 'Save payment',
      body: `${detailGrid([['Chemist', esc(chem(s.chemistId)?.name)], ['Invoice total', money2(s.total)], ['Balance', money2(balance(s))]])}
        <div class="form-grid">
          ${field('Amount (₹)', 'amount', { type: 'number', value: balance(s), required: true, attrs: `min="0.01" max="${balance(s)}" step="0.01"` })}
          ${field('Mode', 'mode', { options: ['UPI', 'NEFT / RTGS', 'Cheque', 'Cash'] })}
        </div>`,
      onSubmit: d => { s.paid = round2((s.paid || 0) + Math.min(+d.amount, balance(s))); return `Payment of ${money(+d.amount)} recorded on ${s.no}.`; },
    });
  };

  function productForm(p = {}) {
    const isNew = !p.id;
    return `<div class="form-grid">
      ${field('Product name', 'name', { value: p.name || '', required: true })}
      ${field('Salt / composition', 'salt', { value: p.salt || '', required: true })}
      ${field('Company / supplier', 'supplierId', { value: p.supplierId, required: true, options: db.suppliers.map(s => [s.id, s.name]) })}
      ${field('Category', 'category', { value: p.category || 'Tablet', options: ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Gel', 'Sachet', 'Liquid', 'Drops', 'Ointment', 'Device', 'Other'] })}
      ${field('Pack size', 'pack', { value: p.pack || '', required: true, attrs: 'placeholder="e.g. 10 Tab"' })}
      ${field('HSN code', 'hsn', { value: p.hsn || '3004', required: true, attrs: 'pattern="[0-9]{4,8}"' })}
      ${field('GST rate', 'gst', { value: p.gst ?? 5, options: [[0, '0%'], [5, '5%'], [12, '12%'], [18, '18%']] })}
      ${field('MRP (₹)', 'mrp', { type: 'number', value: p.mrp ?? '', required: true, attrs: 'min="0" step="0.01"' })}
      ${field('PTR — rate to chemist (₹)', 'ptr', { type: 'number', value: p.ptr ?? '', required: true, attrs: 'min="0" step="0.01"' })}
      ${field('PTS — purchase rate (₹)', 'pts', { type: 'number', value: p.pts ?? '', required: true, attrs: 'min="0" step="0.01"' })}
      ${field('Reorder level (units)', 'reorder', { type: 'number', value: p.reorder ?? 100, required: true, attrs: 'min="0" step="1"' })}
    </div>
    ${isNew ? `<div class="card-title" style="font-size:15px">Opening stock <span class="small muted">(optional)</span></div>
    <div class="form-grid">
      ${field('Batch no.', 'obatch')}
      ${field('Expiry', 'oexpiry', { type: 'month' })}
      ${field('Quantity', 'oqty', { type: 'number', attrs: 'min="0" step="1"' })}
    </div>` : ''}`;
  }
  function readProduct(d, p) {
    Object.assign(p, {
      name: d.name.trim(), salt: d.salt.trim(), supplierId: d.supplierId, category: d.category, pack: d.pack.trim(), hsn: d.hsn.trim(),
      gst: +d.gst, mrp: round2(+d.mrp), ptr: round2(+d.ptr), pts: round2(+d.pts), reorder: Math.floor(+d.reorder),
    });
  }
  ACTIONS['new-product'] = () => openModal({
    title: 'Add product', body: productForm(), submitLabel: 'Add product',
    onSubmit: d => {
      if (+d.ptr > +d.mrp || +d.pts > +d.ptr) { toast('Rates should follow PTS ≤ PTR ≤ MRP.'); return false; }
      const p = { id: nextNo('P', db.products, 'id').replace(/^P(\d+)$/, (m, n) => 'P' + n.padStart(3, '0')) };
      readProduct(d, p); db.products.push(p);
      if (d.obatch && d.oexpiry && +d.oqty > 0) db.batches.push({ id: uid(), productId: p.id, batch: d.obatch.trim(), expiry: d.oexpiry, qty: Math.floor(+d.oqty) });
      return `${p.name} added.`;
    },
  });
  ACTIONS['edit-product'] = id => {
    const p = prod(id); if (!p) return;
    openModal({
      title: `Edit ${p.name}`, body: productForm(p),
      onSubmit: d => {
        if (+d.ptr > +d.mrp || +d.pts > +d.ptr) { toast('Rates should follow PTS ≤ PTR ≤ MRP.'); return false; }
        readProduct(d, p); return `${p.name} updated.`;
      },
    });
  };

  ACTIONS['new-chemist'] = () => openModal({
    title: 'Onboard a chemist', submitLabel: 'Onboard',
    body: `<div class="form-grid">
      ${field('Firm name', 'name', { required: true })}
      ${field('Owner / pharmacist', 'owner', { required: true })}
      ${field('Mobile', 'phone', { type: 'tel', required: true, attrs: 'pattern="[6-9][0-9]{9}" title="10-digit mobile number"' })}
      ${field('City', 'city', { required: true })}
      ${field('Drug licence no. (20B / 21B)', 'dl', { required: true })}
      ${field('GSTIN', 'gstin', { attrs: `pattern="${GSTIN_RE}" title="15-character GSTIN, e.g. 08ABCDE1234F1Z5" style="text-transform:uppercase"` })}
      ${field('Credit limit (₹)', 'creditLimit', { type: 'number', value: 100000, required: true, attrs: 'min="0" step="1000"' })}
      ${field('Payment terms (days)', 'terms', { type: 'number', value: 30, required: true, attrs: 'min="0" step="1"' })}
      ${field('Address', 'address', { full: true })}
    </div>
    <div class="small muted">New chemists start as “Pending verification”. Activate them after checking the drug licence to allow billing.</div>`,
    onSubmit: d => {
      const id = 'C' + String(Math.max(0, ...db.chemists.map(c => +c.id.slice(1))) + 1).padStart(3, '0');
      db.chemists.push({ id, name: d.name.trim(), owner: d.owner.trim(), phone: d.phone, city: d.city.trim(), dl: d.dl.trim(), gstin: (d.gstin || '').toUpperCase(), creditLimit: +d.creditLimit, terms: +d.terms, address: d.address, joined: todayIso, status: 'Pending verification' });
      return `${d.name} onboarded — pending verification.`;
    },
  });
  ACTIONS['view-chemist'] = id => {
    const c = chem(id); if (!c) return;
    const inv = db.sales.filter(s => s.chemistId === id).sort((a, b) => b.date.localeCompare(a.date));
    const btns = [['Active', 'Activate'], ['On hold', 'Put on hold']].filter(([s]) => s !== c.status)
      .map(([s, l]) => `<button type="button" class="btn ${s === 'Active' ? 'primary' : ''}" data-act="chemist-status" data-id="${c.id}|${s}">${l}</button>`).join('');
    openModal({
      title: c.name, wide: true,
      extraFoot: `<div style="margin-right:auto;display:flex;gap:8px">${btns}</div>`,
      body: `${detailGrid([['Owner', esc(c.owner)], ['Mobile', esc(c.phone)], ['City', esc(c.city)], ['Drug licence', esc(c.dl)], ['GSTIN', esc(c.gstin || '—')], ['Status', pill(c.status)], ['Credit limit', money(c.creditLimit)], ['Outstanding', money(chemOutstanding(c.id))], ['Onboarded', fmtDate(c.joined)]])}
        <div class="card-title" style="font-size:15px">Invoices (${inv.length})</div>
        ${miniTable([
          { h: 'Invoice', c: s => s.no }, { h: 'Date', c: s => fmtDate(s.date) },
          { h: 'Amount', r: 1, c: s => money(s.total) }, { h: 'Balance', r: 1, c: s => money(balance(s)) }, { h: 'Status', c: s => pill(saleStatus(s)) },
        ], inv.slice(0, 12))}`,
    });
  };
  ACTIONS['chemist-status'] = v => {
    const [id, status] = v.split('|'); const c = chem(id); if (!c) return;
    c.status = status; closeModal(); refresh(); toast(`${c.name} is now ${status}.`);
  };

  const supplierForm = (s = {}) => `<div class="form-grid">
    ${field('Supplier name', 'name', { value: s.name || '', required: true })}
    ${field('Contact person', 'contact', { value: s.contact || '', required: true })}
    ${field('Mobile', 'phone', { type: 'tel', value: s.phone || '', required: true, attrs: 'pattern="[6-9][0-9]{9}" title="10-digit mobile number"' })}
    ${field('City', 'city', { value: s.city || '', required: true })}
    ${field('GSTIN', 'gstin', { value: s.gstin || '', required: true, attrs: `pattern="${GSTIN_RE}" title="15-character GSTIN" style="text-transform:uppercase"` })}
    ${field('Drug licence no.', 'dl', { value: s.dl || '', required: true })}
    ${field('Payment terms (days)', 'terms', { type: 'number', value: s.terms ?? 30, required: true, attrs: 'min="0" step="1"' })}
  </div>`;
  ACTIONS['new-supplier'] = () => openModal({
    title: 'Add supplier', body: supplierForm(), submitLabel: 'Add supplier',
    onSubmit: d => {
      const id = 'S' + String(Math.max(0, ...db.suppliers.map(s => +s.id.slice(1))) + 1).padStart(3, '0');
      db.suppliers.push({ id, name: d.name.trim(), contact: d.contact.trim(), phone: d.phone, city: d.city.trim(), gstin: d.gstin.toUpperCase(), dl: d.dl.trim(), terms: +d.terms });
      return `${d.name} added.`;
    },
  });
  ACTIONS['view-supplier'] = id => {
    const s = sup(id); if (!s) return;
    const pos = db.pos.filter(p => p.supplierId === id).sort((a, b) => b.date.localeCompare(a.date));
    openModal({
      title: s.name, wide: true, submitLabel: 'Save changes',
      body: `${detailGrid([['Payable', money(supPayable(id))], ['Products supplied', db.products.filter(p => p.supplierId === id).length], ['Purchase orders', pos.length]])}
        ${supplierForm(s)}
        <div class="card-title" style="font-size:15px">Recent purchase orders</div>
        ${miniTable([{ h: 'PO', c: p => p.no }, { h: 'Date', c: p => fmtDate(p.date) }, { h: 'Value', r: 1, c: p => money(p.total) }, { h: 'Status', c: p => pill(p.status) }], pos.slice(0, 8))}`,
      onSubmit: d => { Object.assign(s, { name: d.name.trim(), contact: d.contact.trim(), phone: d.phone, city: d.city.trim(), gstin: d.gstin.toUpperCase(), dl: d.dl.trim(), terms: +d.terms }); return `${s.name} updated.`; },
    });
  };

  function poModal(preset = {}) {
    openModal({
      title: 'New purchase order', wide: true, submitLabel: 'Create PO',
      body: `<div class="form-grid">
          ${field('Supplier', 'supplierId', { required: true, value: preset.supplierId || '', options: [['', 'Select supplier'], ...db.suppliers.map(s => [s.id, s.name])] })}
          ${field('Expected delivery', 'expected', { type: 'date', value: addDays(todayIso, 7), required: true, attrs: `min="${todayIso}"` })}
        </div>
        ${linesBlock('po', preset.lines)}`,
      onSubmit: d => {
        const lines = readLines();
        if (!lines.length) { toast('Add at least one product with a quantity.'); return false; }
        const no = nextNo('PO-', db.pos);
        db.pos.push({ no, date: todayIso, expected: d.expected, supplierId: d.supplierId, lines, ...lineTotals(lines), status: 'Open' });
        return `${no} created for ${money(lineTotals(lines).total)}.`;
      },
    });
    recalcLines();
  }
  ACTIONS['new-po'] = () => poModal();
  ACTIONS['reorder-po'] = pid => {
    const p = prod(pid); if (!p) return;
    poModal({ supplierId: p.supplierId, lines: [{ productId: p.id, qty: Math.max(1, p.reorder * 2 - sellableQty(p.id)), rate: p.pts }] });
  };
  ACTIONS['view-po'] = no => {
    const po = db.pos.find(p => p.no === no); if (!po) return;
    const open = po.status === 'Open' || po.status === 'Partially received';
    openModal({
      title: `Purchase order ${po.no}`, wide: true,
      extraFoot: open ? `<div style="margin-right:auto;display:flex;gap:8px"><button type="button" class="btn primary" data-act="receive-po" data-id="${po.no}">Receive goods</button>${po.status === 'Open' ? `<button type="button" class="btn" data-act="cancel-po" data-id="${po.no}">Cancel PO</button>` : ''}</div>` : '',
      body: `${detailGrid([['Supplier', esc(sup(po.supplierId)?.name)], ['Order date', fmtDate(po.date)], ['Expected', fmtDate(po.expected)], ['Status', pill(po.status)], ['GRNs', db.grns.filter(g => g.poNo === po.no).map(g => g.no).join(', ') || '—']])}
        ${miniTable([
          { h: 'Product', c: l => esc(prod(l.productId)?.name) },
          { h: 'Ordered', r: 1, c: l => qty(l.qty) },
          { h: 'Received', r: 1, c: l => qty(receivedQty(po.no, l.productId)) },
          { h: 'Rate', r: 1, c: l => money2(l.rate) },
          { h: 'Amount', r: 1, c: l => money2(l.qty * l.rate) },
        ], po.lines)}
        ${totalsBlock(po)}`,
    });
  };
  ACTIONS['cancel-po'] = no => {
    const po = db.pos.find(p => p.no === no); if (!po) return;
    if (!confirm(`Cancel ${po.no}? This cannot be undone.`)) return;
    po.status = 'Cancelled'; closeModal(); refresh(); toast(`${po.no} cancelled.`);
  };

  function grnModal(poNo = '') {
    const openPos = db.pos.filter(p => p.status === 'Open' || p.status === 'Partially received');
    if (!openPos.length) { toast('No open purchase orders to receive against.'); return; }
    if (!poNo || !openPos.some(p => p.no === poNo)) poNo = openPos[0].no;
    openModal({
      title: 'New goods receipt (GRN)', wide: true, submitLabel: 'Save GRN & add to stock',
      body: `<div class="form-grid">
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
          const l = po.lines[+tr.dataset.gline]; const pend = +tr.dataset.pending;
          const q = Math.floor(+$('[data-g=qty]', tr).value || 0);
          if (!q) continue;
          const batch = $('[data-g=batch]', tr).value.trim(); const expiry = $('[data-g=expiry]', tr).value;
          const name = prod(l.productId)?.name;
          if (q > pend) { toast(`${name}: only ${qty(pend)} pending on this PO.`); return false; }
          if (!batch || !expiry) { toast(`${name}: enter batch number and expiry.`); return false; }
          lines.push({ productId: l.productId, batch, expiry, qty: q, rate: l.rate });
        }
        if (!lines.length) { toast('Enter a received quantity for at least one item.'); return false; }
        lines.forEach(l => {
          const b = db.batches.find(x => x.productId === l.productId && x.batch === l.batch);
          if (b) b.qty += l.qty; else db.batches.push({ id: uid(), productId: l.productId, batch: l.batch, expiry: l.expiry, qty: l.qty });
        });
        const no = nextNo('GRN-', db.grns);
        db.grns.push({ no, date: d.date, poNo: po.no, supplierId: po.supplierId, challan: d.challan.trim(), lines, ...lineTotals(lines), invoiced: '' });
        po.status = po.lines.every(l => receivedQty(po.no, l.productId) >= l.qty) ? 'Received' : 'Partially received';
        return `${no} saved — ${qty(lines.reduce((a, l) => a + l.qty, 0))} units added to stock.`;
      },
    });
    $('#f-poNo').addEventListener('change', e => { $('#grnLines').innerHTML = grnLines(e.target.value); });
  }
  ACTIONS['new-grn'] = () => grnModal();
  ACTIONS['receive-po'] = no => grnModal(no);
  ACTIONS['view-grn'] = no => {
    const g = db.grns.find(x => x.no === no); if (!g) return;
    openModal({
      title: `Goods receipt ${g.no}`, wide: true,
      extraFoot: !g.invoiced ? `<button type="button" class="btn primary" data-act="invoice-grn" data-id="${g.no}" style="margin-right:auto">Add purchase invoice</button>` : '',
      body: `${detailGrid([['Supplier', esc(sup(g.supplierId)?.name)], ['Date', fmtDate(g.date)], ['Purchase order', esc(g.poNo)], ['Challan', esc(g.challan || '—')], ['Invoice', g.invoiced ? esc(g.invoiced) : pill('Awaiting invoice')]])}
        ${miniTable([
          { h: 'Product', c: l => esc(prod(l.productId)?.name) }, { h: 'Batch', c: l => esc(l.batch) }, { h: 'Expiry', c: l => fmtMonth(l.expiry) },
          { h: 'Qty', r: 1, c: l => qty(l.qty) }, { h: 'Rate', r: 1, c: l => money2(l.rate) }, { h: 'Amount', r: 1, c: l => money2(l.qty * l.rate) },
        ], g.lines)}
        ${totalsBlock(g)}`,
    });
  };

  function piModal(grnNo = '') {
    const open = db.grns.filter(g => !g.invoiced);
    if (!open.length) { toast('Every goods receipt already has an invoice.'); return; }
    if (!grnNo || !open.some(g => g.no === grnNo)) grnNo = open[0].no;
    const info = no => {
      const g = db.grns.find(x => x.no === no); const s = sup(g.supplierId);
      return `${detailGrid([['Supplier', esc(s?.name)], ['GRN date', fmtDate(g.date)], ['Terms', s?.terms + ' days']])}${totalsBlock(g)}`;
    };
    openModal({
      title: 'New purchase invoice', submitLabel: 'Save invoice',
      body: `<div class="form-grid">
          ${field('Goods receipt', 'grnNo', { required: true, value: grnNo, options: open.map(g => [g.no, `${g.no} — ${sup(g.supplierId)?.name} — ${money(g.total)}`]) })}
          ${field('Supplier bill number', 'supplierInvNo', { required: true })}
          ${field('Bill date', 'date', { type: 'date', value: todayIso, required: true, attrs: `max="${todayIso}"` })}
          ${field('Paid now (₹)', 'paid', { type: 'number', value: 0, attrs: 'min="0" step="0.01"' })}
        </div>
        <div id="piInfo">${info(grnNo)}</div>
        <div class="small muted">Amount is taken from the goods receipt. Due date follows the supplier’s payment terms.</div>`,
      onSubmit: d => {
        const g = db.grns.find(x => x.no === d.grnNo); const s = sup(g.supplierId);
        const no = nextNo('PI-', db.pinvoices);
        db.pinvoices.push({ no, supplierInvNo: d.supplierInvNo.trim(), date: d.date, due: addDays(d.date, s?.terms || 30), supplierId: g.supplierId, grnNo: g.no, sub: g.sub, gst: g.gst, total: g.total, paid: Math.min(g.total, round2(+d.paid || 0)) });
        g.invoiced = no;
        return `${no} saved — due ${fmtDate(addDays(d.date, s?.terms || 30))}.`;
      },
    });
    $('#f-grnNo').addEventListener('change', e => { $('#piInfo').innerHTML = info(e.target.value); });
  }
  ACTIONS['new-pi'] = () => piModal();
  ACTIONS['invoice-grn'] = no => piModal(no);
  ACTIONS['view-pi'] = no => {
    const p = db.pinvoices.find(x => x.no === no); if (!p) return;
    const g = db.grns.find(x => x.no === p.grnNo);
    openModal({
      title: `Purchase invoice ${p.no}`, wide: true,
      extraFoot: balance(p) > 0.5 ? `<button type="button" class="btn gold" data-act="pay-pi" data-id="${p.no}" style="margin-right:auto">Record payment</button>` : '',
      body: `${detailGrid([['Supplier', esc(sup(p.supplierId)?.name)], ['Supplier bill', esc(p.supplierInvNo)], ['Bill date', fmtDate(p.date)], ['Due date', fmtDate(p.due)], ['GRN', esc(p.grnNo)], ['Status', pill(piStatus(p))]])}
        ${g ? miniTable([
          { h: 'Product', c: l => esc(prod(l.productId)?.name) }, { h: 'Batch', c: l => esc(l.batch) },
          { h: 'Qty', r: 1, c: l => qty(l.qty) }, { h: 'Rate', r: 1, c: l => money2(l.rate) }, { h: 'Amount', r: 1, c: l => money2(l.qty * l.rate) },
        ], g.lines) : ''}
        ${totalsBlock(p)}
        <div class="totals"><div>Paid <b class="num">${money2(p.paid)}</b></div><div>Balance <b class="num">${money2(balance(p))}</b></div></div>`,
    });
  };
  ACTIONS['pay-pi'] = no => {
    const p = db.pinvoices.find(x => x.no === no); if (!p) return;
    openModal({
      title: `Pay supplier · ${p.no}`, submitLabel: 'Save payment',
      body: `${detailGrid([['Supplier', esc(sup(p.supplierId)?.name)], ['Bill total', money2(p.total)], ['Balance', money2(balance(p))]])}
        <div class="form-grid">
          ${field('Amount (₹)', 'amount', { type: 'number', value: balance(p), required: true, attrs: `min="0.01" max="${balance(p)}" step="0.01"` })}
          ${field('Mode', 'mode', { options: ['NEFT / RTGS', 'UPI', 'Cheque', 'Cash'] })}
        </div>`,
      onSubmit: d => { p.paid = round2((p.paid || 0) + Math.min(+d.amount, balance(p))); return `Payment of ${money(+d.amount)} recorded on ${p.no}.`; },
    });
  };

  // ---------- Events ----------
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      searchQuery = ''; $('#globalSearch').value = '';
      $('#sidebar').classList.remove('open');
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
    const act = e.target.closest('[data-act]');
    if (act && ACTIONS[act.dataset.act]) { ACTIONS[act.dataset.act](act.dataset.id); return; }
    if (e.target.closest('[data-close]') || e.target.id === 'modalBack') { closeModal(); return; }
    if (e.target.closest('[data-submit]')) { submitModal(); return; }
    if (e.target.closest('[data-add-line]')) {
      const body = $('#lineBody'); body.insertAdjacentHTML('beforeend', lineRow(body.dataset.mode)); recalcLines(); return;
    }
    const rm = e.target.closest('[data-rm-line]');
    if (rm) { const body = $('#lineBody'); if ($$('tr[data-line]', body).length > 1) rm.closest('tr').remove(); recalcLines(); }
  });

  document.addEventListener('input', e => {
    const s = e.target.closest('[data-list-search]');
    if (s) { listState[s.dataset.listSearch].q = s.value; fillList(s.dataset.listSearch); return; }
    if (e.target.closest('#lineBody')) recalcLines();
  });
  document.addEventListener('change', e => {
    const sel = e.target.closest('#lineBody [data-f=productId]');
    if (sel) {
      const p = prod(sel.value); const tr = sel.closest('tr');
      if (p) $('[data-f=rate]', tr).value = $('#lineBody').dataset.mode === 'sale' ? p.ptr : p.pts;
      recalcLines();
    }
  });

  let searchTimer;
  $('#globalSearch').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { searchQuery = e.target.value.trim(); render(); }, 180);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#modalBack').classList.contains('open')) closeModal();
    if (e.key === 'Enter' && $('#modalBack').classList.contains('open') && e.target.closest('#mform') && e.target.tagName === 'INPUT') { e.preventDefault(); submitModal(); }
  });
  $('#modalClose').addEventListener('click', closeModal);
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#resetData').addEventListener('click', () => {
    if (!confirm('Replace all data in this browser with fresh sample data?')) return;
    db = seed(); Object.keys(listState).forEach(k => delete listState[k]); refresh(); toast('Sample data restored.');
  });
  window.addEventListener('hashchange', render);

  save();
  render();
})();
