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
    const gstin = () => { const g = `02${letters(5)}${digits(4)}${pick(L)}1Z`, cs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; let sum = 0; for (let i = 0; i < 14; i++) { const v = cs.indexOf(g[i]) * (i % 2 + 1); sum += Math.floor(v / 36) + (v % 36); } return g + cs[(36 - (sum % 36)) % 36]; };
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
    const customers = people.map(([name, town], i) => ({ id: 'U' + String(i + 1).padStart(3, '0'), name, phone: phone(), ...seedAddr(town), joined: iso(TODAY.getTime() - 200 * DAY) }));

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
      const cu = individual ? pick(customers) : null;
      const party = individual ? { type: 'individual', customerId: cu.id, name: cu.name, phone: cu.phone } : { type: 'chemist', chemistId: c.id };
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
      defaultCd: 2, individualTerms: 0, demo: true,
    };
    // Hospital directory, with each sample chemist linked to a civil hospital or CHC in its tehsil where one is listed
    const hospitals = seedHospitals();
    chemists.forEach(c => {
      const h = hospitals.filter(x => x.district === c.district && norm(x.tehsil) === norm(c.tehsil)).sort(hospSort)[0];
      if (h) { c.hospitalId = h.id; c.hospital = h.name; }
    });
    return { version: 2, settings, companies, categories, forms, products, batches, chemists, suppliers, sales, pos, grns, pinvoices, hospitals, customers, inquiries: [], returns: [] };
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
  // Blocked batches (drug alerts / recalls) are kept in stock but cannot be billed
  const sellableBatches = pid => db.batches.filter(b => b.productId === pid && avail(b) > 0 && !b.blocked && expDays(b.expiry) >= 0).sort((a, b) => a.expiry.localeCompare(b.expiry));
  const sellableQty = pid => sellableBatches(pid).reduce((a, b) => a + avail(b), 0);
  const batchAmount = b => round2((b.qty || 0) * (b.rate || 0));
  const stockValue = () => db.batches.filter(b => expDays(b.expiry) >= 0).reduce((a, b) => a + batchAmount(b), 0);
  // Balance of a bill: total less payments and (for sale bills) approved returns credited to it
  const balance = d => Math.max(0, round2(d.total - (d.paid || 0) - (d.returned || 0)));
  const custById = id => (db.customers || []).find(c => c.id === id);
  const partyName = s => s.party.type === 'chemist' ? (chem(s.party.chemistId)?.name || 'Unknown chemist') : (custById(s.party.customerId)?.name || s.party.name || 'Individual');
  const partyCity = s => s.party.type === 'chemist' ? (chem(s.party.chemistId)?.city || '') : (custById(s.party.customerId)?.phone || s.party.phone || '');
  // Dated payments of a bill. Older bills only have a total "paid", shown as paid on the bill date.
  const payList = d => d.payments?.length ? d.payments : (d.paid > 0 ? [{ date: d.date, amount: d.paid, mode: d.mode && d.mode !== 'Credit' ? d.mode : 'Payment' }] : []);
  function addPayment(d, amount, date, mode) {
    d.payments = payList(d).map(x => ({ ...x }));
    d.payments.push({ date, amount: round2(amount), mode });
    d.paid = round2(d.payments.reduce((a, x) => a + x.amount, 0));
  }
  // Keep the payment history in step when a bill's "paid" figure is edited directly
  function adjustPaid(d, newPaid, label) {
    const diff = round2(newPaid - (d.paid || 0));
    if (Math.abs(diff) < 0.005) return;
    addPayment(d, diff, todayIso, label);
  }
  const nextNum = (prefix, arr, start) => arr.length ? nextNo(prefix, arr) : prefix + start;
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
  // Party balance = all bills − all payments − approved returns (same as the ledger; a credit shows as a negative amount)
  const partyDue = bills => round2(bills.reduce((a, s) => a + s.total - (s.paid || 0) - (s.returned || 0), 0));
  const chemOutstanding = cid => partyDue(db.sales.filter(s => s.party.chemistId === cid));
  // Payable = unpaid purchase bills less purchase returns (debit notes)
  const supPayable = sid => round2(db.pinvoices.filter(p => p.supplierId === sid).reduce((a, p) => a + balance(p), 0) - (db.purchaseReturns || []).filter(x => x.supplierId === sid).reduce((a, x) => a + x.total, 0));
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
    Waiting: 'warn', Done: 'ok', Dismissed: 'neutral', 'Sample data loaded': 'warn',
    Requested: 'warn', Approved: 'ok', Quoted: 'info', Converted: 'ok', Lost: 'neutral', 'Follow-up due': 'warn', Customer: 'neutral', 'New person': 'neutral',
    'Medical College': 'info', 'Medical University': 'info', AIIMS: 'info', 'Zonal Hospital': 'info', 'Regional Hospital': 'info', 'Civil Hospital': 'ok', CHC: 'ok',
    New: 'info', Accepted: 'info', Arranging: 'warn', Billed: 'ok', Rejected: 'bad', Off: 'neutral', 'All in stock': 'ok', 'Not stocked': 'bad', 'Limited stock': 'warn', 'Not in stock': 'bad',
    Verified: 'ok', 'Needs check': 'warn', OK: 'ok', Check: 'warn', Error: 'bad', AI: 'info', CSV: 'info', Manual: 'neutral',
    Matched: 'ok', Mismatch: 'warn', 'Not in 2B': 'bad', 'Not in books': 'warn', 'e-Way bill': 'info', 'e-Invoice': 'info',
    Blocked: 'bad', Upcoming: 'info', Ended: 'neutral', Claimed: 'warn', 'Score A': 'ok', 'Score B': 'info', 'Score C': 'warn', 'Score D': 'bad',
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
    tick: '<path d="M20 6 9 17l-5-5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8 11h8M8 14h5"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    book: '<path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h11"/><path d="M8 8h6"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    doctor: '<circle cx="12" cy="7" r="4"/><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/><path d="M12 14v4M10 16h4"/>',
    hospital: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 7v6M9 10h6"/><path d="M9 21v-4h6v4"/>',
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
    { group: 'Sales', items: [['sales', 'Sales', 'trend'], ['returns', 'Sales Returns', 'undo'], ['inquiries', 'Enquiries', 'chat'], ['chemorders', 'Chemist Orders', 'cart'], ['customers', 'Customers', 'user'], ['chemists', 'Onboard Chemists', 'store']] },
    { group: 'Accounts', items: [['ledger', 'Party Ledger', 'book'], ['itc', 'GST / ITC Match', 'file']] },
    { group: 'Inventory', items: [['stock', 'Stock Details', 'box'], ['products', 'Products & Masters', 'pill'], ['recalls', 'Recalls & NSQ', 'alert']] },
    { group: 'Directory', items: [['hospitals', 'Hospital Directory', 'hospital'], ['doctors', 'Doctors Directory', 'doctor']] },
  { group: 'Purchase', items: [['purchase', 'Purchase', 'cart'], ['billentry', 'Bill Upload / Entry', 'spark'], ['suppliers', 'Supplier Details', 'truck'], ['orders', 'Purchase Orders', 'clipboard'], ['grn', 'Goods Receipt (GRN)', 'check'], ['invoices', 'Purchase Invoices', 'file'], ['preturns', 'Purchase Returns', 'undo'], ['schemes', 'Schemes & Claims', 'spark']] },
  { group: 'System', items: [['agents', 'Agents & Approvals', 'spark'], ['settings', 'Settings', 'settings']] },
  ];
  const SUBTITLES = {
    overview: 'Your business at a glance',
    sales: 'Bills to chemists and individual customers — stock is deducted automatically',
    chemists: 'Retail chemists onboarded for B2B supply, with their portal logins',
    chemorders: 'Orders placed by chemists on their portal',
    customers: 'Walk-in and retail customers (B2C)',
    inquiries: 'Who asked for what — follow up and turn enquiries into bills',
    returns: 'Goods returned against sale bills — request, approve, credit',
    ledger: 'Party-wise account: bills, payments and returns with running balance',
    agents: 'Your assistants prepare purchase orders, reminders and alerts — you approve',
    settings: 'Business details, integrations, agents and data',
    preturns: 'Goods sent back to suppliers — expiry claims and debit notes',
    recalls: 'CDSCO NSQ / spurious drug alerts, banned FDCs and recalls — checked against your stock and sales',
    schemes: 'Company schemes, free goods and claims on your sales',
    itc: 'Your purchase bills matched with GSTR-2B — input tax credit at risk',
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
    hospitals: 'Medical colleges, hospitals, CHCs and PHCs of Himachal Pradesh — and the chemists near them',
    doctors: 'Medical officers and doctors — specialization, mobile and the hospital they work at',
  };

  function renderNav(route) {
    const badges = {
      orders: db.pos.filter(p => p.status === 'Open' || p.status === 'Partially received').length,
      stock: db.batches.filter(b => avail(b) > 0 && (batchStatus(b) !== 'Good' || !b.verified)).length,
      chemists: db.chemists.filter(c => c.status === 'Pending verification').length,
      grn: db.grns.filter(g => !g.invoiced).length,
      billentry: entry && entry.lines.length ? '•' : 0,
      chemorders: chemOrders.filter(o => o.status === 'New').length,
      agents: (db.approvals || []).filter(a => a.status === 'Pending' && a.kind !== 'briefing').length,
      recalls: (db.approvals || []).filter(a => a.status === 'Pending' && a.kind === 'recall').length,
    };
    $('#nav').innerHTML = NAV.map(g => `
      <div class="nav-group-title">${g.group}</div>
      <div class="nav">${g.items.filter(([id]) => SERVER || id !== 'chemorders').map(([id, label, ic]) => `
        <button type="button" data-nav="${id}" class="${route === id ? 'active' : ''}">${icon(ic)}<span>${label}</span>${badges[id] ? `<span class="badge-n">${badges[id]}</span>` : ''}</button>`).join('')}
      </div>`).join('');
    const f = db.settings.firm, pr = db.settings.profile || {};
    $('#brandName').textContent = f.name || 'Pharma Suite';
    $('#brandSub').textContent = f.tagline ?? 'Pharma Suite';
    $('.brand-home').title = `${f.name || 'Pharma Suite'} — Home (Overview)`;
    $('#brandMark').classList.toggle('has-logo', !!f.logo);
    $('#brandMark').innerHTML = f.logo ? `<img src="${esc(f.logo)}" alt="">` : esc((f.name || 'P').trim().charAt(0).toUpperCase());
    const who = (pr.name || f.name || 'Pharma Suite').trim();
    $('#avatarBtn').textContent = who.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
    $('#avatarBtn').title = `${pr.name ? pr.name + (pr.role ? ' · ' + pr.role : '') : 'Set up your profile'} — Profile`;
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
    const fu = (db.inquiries || []).filter(inqDue);
    if (fu.length) alerts.unshift(['warn', 'chat', `${fu.length} enquiry follow-up${fu.length === 1 ? '' : 's'} due`, fu.map(inqPartyName).slice(0, 4).join(', '), 'inquiries']);
    const rq = (db.returns || []).filter(r => r.status === 'Requested');
    if (rq.length) alerts.unshift(['info', 'undo', `${rq.length} sales return request${rq.length === 1 ? '' : 's'} to approve`, `Worth ${money2(rq.reduce((a, r) => a + r.total, 0))}`, 'returns']);
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
        filters: [...prodFilters(s => s.lines.map(l => prod(l.productId))), { k: 'chemist', label: 'Chemist', options: db.chemists.map(c => [c.id, c.name]).sort(byName), test: (s, v) => s.party.chemistId === v }, { k: 'district', label: 'District', options: [...new Set(db.chemists.map(c => c.district).filter(Boolean))].sort().map(v => [v, v]), test: (s, v) => chem(s.party.chemistId)?.district === v }, monthFilter(db.sales.map(s => s.date), s => s.date)],
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
        filters: [{ k: 'district', label: 'District', options: [...new Set(db.chemists.map(c => c.district).filter(Boolean))].sort().map(v => [v, v]), test: (c, v) => c.district === v }, { k: 'tehsil', label: 'Tehsil', options: [...new Set(db.chemists.map(c => c.tehsil).filter(Boolean))].sort().map(v => [v, v]), test: (c, v) => c.tehsil === v }, { k: 'hosp', label: 'Nearby hospital', options: [...new Set(db.chemists.map(hospitalName).filter(Boolean))].sort().map(v => [v, v]), test: (c, v) => hospitalName(c) === v }],
        columns: [
          { h: 'Chemist', c: c => `<span class="strong">${esc(c.name)}</span><div class="small muted">${esc(c.owner)} · ${esc(c.id)}</div>` },
          { h: 'Area', c: c => `${esc(c.locality || c.city || '—')}<div class="small muted">${esc([c.tehsil && 'Teh. ' + c.tehsil, c.district].filter(Boolean).join(' · '))}</div>` },
          { h: 'Phone', c: c => esc(c.phone) },
          { h: 'Drug licence 1 / 2', c: c => licCell(c) },
          { h: 'GSTIN', c: c => `<span class="small">${esc(c.gstin || '—')}</span>` },
          { h: 'CD% / TD%', r: 1, c: c => `${dec(c.cd)} / ${dec(c.td)}` },
          { h: 'Credit limit', r: 1, c: c => `${money(c.creditLimit)}<div>${gradePill(creditProfile(c.id))}</div>` },
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

  VIEWS.hospitals = () => {
    const hs = db.hospitals || [];
    const count = (...t) => hs.filter(h => t.includes(h.type)).length;
    const linked = db.chemists.filter(c => c.hospitalId || c.hospital).length;
    return `
      <div class="grid g-4">
        ${kpi('Hospitals & health centres', qty(hs.length), `${usedValues('district').filter(d => hs.some(h => h.district === d)).length} districts`)}
        ${kpi('Medical colleges & big hospitals', qty(count('Medical College', 'Medical University', 'AIIMS', 'Zonal Hospital', 'Regional Hospital', 'District Hospital')), 'Colleges, AIIMS, zonal & regional')}
        ${kpi('Civil hospitals & CHCs', qty(count('Civil Hospital', 'Sub-Divisional Hospital', 'CHC')), `${count('PHC')} PHCs as well`)}
        ${kpi('Chemists linked to a hospital', qty(linked), `of ${db.chemists.length} chemists`)}
      </div>
      ${useList({
        key: 'hospitals', title: 'Hospital directory · Himachal Pradesh',
        actions: `<label class="btn sm">${icon('file')}Import CSV<input type="file" id="hospCsv" accept=".csv,text/csv" hidden></label>${actBtn('hosp-export', '', 'Export CSV', 'ghost')}${actBtn('new-hospital', '', icon('plus') + 'Add hospital', 'primary')}`,
        tabs: [{ id: 'all', label: 'All' }, { id: 'big', label: 'Colleges & big hospitals', filter: h => hospRank(h.type) <= 5 }, { id: 'civil', label: 'Civil & CHC', filter: h => ['Civil Hospital', 'Sub-Divisional Hospital', 'CHC'].includes(h.type) }, { id: 'phc', label: 'PHC', filter: h => h.type === 'PHC' }, { id: 'near', label: 'With chemists', filter: h => nearChemists(h).length > 0 }],
        filters: [
          { k: 'district', label: 'District', options: [...new Set(hs.map(h => h.district).filter(Boolean))].sort().map(v => [v, v]), test: (h, v) => h.district === v },
          { k: 'tehsil', label: 'Tehsil / block', options: [...new Set(hs.map(h => h.tehsil).filter(Boolean))].sort().map(v => [v, v]), test: (h, v) => h.tehsil === v },
          { k: 'type', label: 'Type', options: HOSP_TYPES.filter(t => hs.some(h => h.type === t)).map(t => [t, t]), test: (h, v) => h.type === v },
        ],
        select: {
          id: h => h.id,
          fields: [{ k: 'type', label: 'Type', type: 'select', options: HOSP_TYPES.map(t => [t, t]) }, { k: 'district', label: 'District', type: 'select', options: HP_DISTRICTS.map(d => [d, d]) }],
          extra: `<button type="button" class="btn sm ghost danger" data-bulkact="hospitals|delete">Delete</button>`,
          actions: { delete: items => { deleteHospitals(items); return false; } },
        },
        rows: () => [...(db.hospitals || [])].sort((a, b) => (a.district || 'zz').localeCompare(b.district || 'zz') || hospSort(a, b)),
        text: h => [h.name, h.type, h.district, h.tehsil, h.locality, h.pincode, h.phone, h.headName, h.headMobile, h.pharmName, h.pharmMobile].join(' '),
        empty: 'No hospitals match.',
        columns: [
          { h: 'Hospital / health centre', c: h => `<a href="#" data-act="view-hospital" data-id="${esc(h.id)}" class="strong">${esc(h.name)}</a>${h.source && h.source !== 'HPPCB list' ? `<div class="small muted">${esc(h.source)}</div>` : ''}` },
          { h: 'Type', c: h => pill(h.type) },
          { h: 'District', c: h => esc(h.district || '—') },
          { h: 'Tehsil / block', c: h => esc(h.tehsil || '—') },
          { h: 'Village / locality', c: h => esc(h.locality || '—') },
          { h: 'PIN', c: h => esc(h.pincode || '—') },
          { h: 'Head of hospital', c: h => contactHtml(h.headName, h.headMobile) },
          { h: 'Pharmacist', c: h => contactHtml(h.pharmName, h.pharmMobile) },
          { h: 'Doctors', r: 1, c: h => { const n = (db.doctors || []).filter(d => d.hospitalId === h.id).length; return n ? `<a href="#" data-act="view-hospital" data-id="${esc(h.id)}">${n}</a>` : '<span class="muted">0</span>'; } },
          { h: 'Chemists near', r: 1, c: h => { const n = nearChemists(h).length; return n ? `<a href="#" data-act="view-hospital" data-id="${esc(h.id)}">${n}</a>` : '<span class="muted">0</span>'; } },
          { h: '', c: h => rowActs(actBtn('edit-hospital', h.id, 'Edit', 'ghost'), actBtn('del-hospital', h.id, 'Delete', 'ghost danger')) },
        ],
      })}
      <div class="small muted">Starting list: PHCs, CHCs, civil, sub-divisional, ESI and ayurvedic hospitals from the HP State Pollution Control Board’s health-care-facility list, with district and block filled from India Post PIN data where it was not printed. Medical colleges, AIIMS, the medical university and zonal/regional hospitals were added from a well-known list — please check them. The list may not have every health centre: add missing ones, or import an official list as CSV (columns: name, type, district, tehsil, locality, pincode, phone).</div>`;
  };

  const docHosp = d => hospById(d.hospitalId);
  const docDistrict = d => docHosp(d)?.district || d.district || '';
  VIEWS.doctors = () => {
    const ds = db.doctors || [];
    const spec = [...new Set(ds.map(d => d.specialization).filter(Boolean))];
    return `
      <div class="grid g-4">
        ${kpi('Doctors', qty(ds.length), `${spec.length} specializations`)}
        ${kpi('Specialists', qty(ds.filter(d => d.specialization && !/^(general|medical officer|mbbs)/i.test(d.specialization)).length), 'Other than general / MO')}
        ${kpi('Hospitals covered', qty(new Set(ds.map(d => d.hospitalId).filter(Boolean)).size), `of ${(db.hospitals || []).length} in the directory`)}
        ${kpi('With mobile number', qty(ds.filter(d => d.mobile).length), ds.length ? `${Math.round(ds.filter(d => d.mobile).length / ds.length * 100)}% of doctors` : '—')}
      </div>
      ${useList({
        key: 'doctors', title: 'Doctors & medical officers',
        actions: `<label class="btn sm">${icon('file')}Import CSV<input type="file" id="docCsv" accept=".csv,text/csv" hidden></label>${actBtn('doc-export', '', 'Export CSV', 'ghost')}${actBtn('new-doctor', '', icon('plus') + 'Add doctor', 'primary')}`,
        filters: [
          { k: 'district', label: 'District', options: [...new Set(ds.map(docDistrict).filter(Boolean))].sort().map(v => [v, v]), test: (d, v) => docDistrict(d) === v },
          { k: 'spec', label: 'Specialization', options: spec.sort().map(v => [v, v]), test: (d, v) => d.specialization === v },
          { k: 'desig', label: 'Designation', options: [...new Set(ds.map(d => d.designation).filter(Boolean))].sort().map(v => [v, v]), test: (d, v) => d.designation === v },
          { k: 'hosp', label: 'Hospital', options: [...new Set(ds.map(d => d.hospitalId).filter(Boolean))].map(id => [id, hospById(id)?.name || id]).sort(byName), test: (d, v) => d.hospitalId === v },
        ],
        select: {
          id: d => d.id,
          fields: [{ k: 'specialization', label: 'Specialization', type: 'select', options: DOC_SPECS.map(v => [v, v]) }, { k: 'designation', label: 'Designation', type: 'select', options: DOC_DESIGS.map(v => [v, v]) }],
          extra: `<button type="button" class="btn sm ghost danger" data-bulkact="doctors|delete">Delete</button>`,
          actions: { delete: items => { deleteDoctors(items); return false; } },
        },
        rows: () => [...(db.doctors || [])].sort((a, b) => a.name.localeCompare(b.name)),
        text: d => [d.name, d.designation, d.specialization, d.qualification, d.mobile, d.hospital, docHosp(d)?.name, docDistrict(d), docHosp(d)?.tehsil].join(' '),
        empty: (db.doctors || []).length ? 'No doctors match.' : 'No doctors yet. Use “Add doctor”, or import a CSV (name, designation, specialization, qualification, mobile, hospital, district).',
        columns: [
          { h: 'Doctor', c: d => `<a href="#" data-act="view-doctor" data-id="${esc(d.id)}" class="strong">${esc(d.name)}</a>${d.qualification ? `<div class="small muted">${esc(d.qualification)}</div>` : ''}` },
          { h: 'Designation', c: d => esc(d.designation || '—') },
          { h: 'Specialization', c: d => d.specialization ? pill(d.specialization) : '—' },
          { h: 'Mobile', c: d => telLink(d.mobile) },
          { h: 'Hospital', c: d => { const h = docHosp(d); return h ? `<a href="#" data-act="view-hospital" data-id="${esc(h.id)}">${esc(h.name)}</a><div class="small muted">${esc(h.type)}</div>` : esc(d.hospital || '—'); } },
          { h: 'District', c: d => `${esc(docDistrict(d) || '—')}${docHosp(d)?.tehsil ? `<div class="small muted">${esc(docHosp(d).tehsil)}</div>` : ''}` },
          { h: '', c: d => rowActs(actBtn('edit-doctor', d.id, 'Edit', 'ghost'), actBtn('del-doctor', d.id, 'Delete', 'ghost danger')) },
        ],
      })}`;
  };

  // ---------- Customers (walk-in / retail) ----------
  const custSales = id => db.sales.filter(s => s.party.customerId === id);
  VIEWS.customers = () => {
    const cs = db.customers || [];
    const ind = db.sales.filter(s => s.party.type === 'individual');
    const due = cs.reduce((a, c) => a + Math.max(0, partyDue(custSales(c.id))), 0);
    return `
      <div class="grid g-4">
        ${kpi('Customers', qty(cs.length), `${cs.filter(c => custSales(c.id).length).length} have bought`)}
        ${kpi('Retail sales this month', compact(sumBy(ind, s => monthKey(s.date) === thisM)), `${ind.filter(s => monthKey(s.date) === thisM).length} bills`)}
        ${kpi('Retail sales (all time)', compact(sumBy(ind, () => true)), `${ind.length} bills`)}
        ${kpi('Due from customers', compact(due), 'Unpaid retail bills')}
      </div>
      ${useList({
        key: 'customers', title: 'Customers',
        actions: actBtn('new-customer', '', icon('plus') + 'Add customer', 'primary'),
        filters: [{ k: 'district', label: 'District', options: [...new Set(cs.map(c => c.district).filter(Boolean))].sort().map(v => [v, v]), test: (c, v) => c.district === v }],
        rows: () => [...(db.customers || [])].sort((a, b) => a.name.localeCompare(b.name)),
        text: c => [c.id, c.name, c.phone, c.email, addrText(c), hospitalName(c)].join(' '),
        empty: 'No customers yet. They are added here when you bill an individual, or with “Add customer”.',
        columns: [
          { h: 'Customer', c: c => `<a href="#" data-act="view-customer" data-id="${esc(c.id)}" class="strong">${esc(c.name)}</a><div class="small muted">${esc(c.id)}</div>` },
          { h: 'Mobile', c: c => telLink(c.phone) },
          { h: 'Area', c: c => esc([c.locality || c.city, c.district].filter(Boolean).join(', ') || '—') },
          { h: 'Bills', r: 1, c: c => custSales(c.id).length },
          { h: 'Purchases', r: 1, c: c => money(custSales(c.id).reduce((a, s) => a + s.total, 0)) },
          { h: 'Last purchase', c: c => { const d = custSales(c.id).map(s => s.date).sort().pop(); return d ? fmtDate(d) : '—'; } },
          { h: 'Balance', r: 1, c: c => { const b = partyDue(custSales(c.id)); return b < -0.5 ? `<span class="ok-text">${money(-b)} credit</span>` : `<span class="${b > 0.5 ? 'strong' : 'muted'}">${money(b)}</span>`; } },
          { h: '', c: c => rowActs(actBtn('sale-for-customer', c.id, 'New sale', 'ghost'), actBtn('open-ledger', 'customer|' + c.id, 'Ledger', 'ghost'), actBtn('edit-customer', c.id, 'Edit', 'ghost'), actBtn('del-customer', c.id, 'Delete', 'ghost danger')) },
        ],
      })}`;
  };

  // ---------- Enquiries ----------
  const INQ_SOURCES = ['Walk-in', 'Phone call', 'WhatsApp', 'Field visit', 'Chemist portal', 'Other'];
  const INQ_STATUS = ['Open', 'Quoted', 'Converted', 'Lost'];
  const inqOpen = q => q.status === 'Open' || q.status === 'Quoted';
  const inqDue = q => inqOpen(q) && q.followUp && q.followUp <= todayIso;
  const inqPartyName = q => q.party.type === 'chemist' ? (chem(q.party.chemistId)?.name || 'Unknown chemist') : q.party.type === 'customer' ? (custById(q.party.customerId)?.name || 'Customer') : (q.party.name || 'New person');
  const inqPartyPhone = q => q.party.type === 'chemist' ? chem(q.party.chemistId)?.phone : q.party.type === 'customer' ? custById(q.party.customerId)?.phone : q.party.phone;
  VIEWS.inquiries = () => {
    const qs = db.inquiries || [];
    const conv = qs.filter(q => q.status === 'Converted'), lost = qs.filter(q => q.status === 'Lost');
    return `
      <div class="grid g-4">
        ${kpi('Open enquiries', qty(qs.filter(inqOpen).length), `${qs.filter(q => q.status === 'Quoted').length} quoted`)}
        ${kpi('Follow-ups due', qty(qs.filter(inqDue).length), 'Today or earlier')}
        ${kpi('Converted this month', qty(conv.filter(q => monthKey(q.closedOn || q.date) === thisM).length), 'Turned into sale bills')}
        ${kpi('Conversion rate', conv.length + lost.length ? Math.round(conv.length / (conv.length + lost.length) * 100) + '%' : '—', 'Converted out of closed enquiries')}
      </div>
      ${useList({
        key: 'inquiries', title: 'Enquiries',
        actions: actBtn('new-inquiry', '', icon('plus') + 'New enquiry', 'primary'),
        tabs: [{ id: 'open', label: 'Open', filter: inqOpen }, { id: 'due', label: 'Follow-up due', filter: inqDue }, { id: 'Converted', label: 'Converted', filter: q => q.status === 'Converted' }, { id: 'Lost', label: 'Lost', filter: q => q.status === 'Lost' }, { id: 'all', label: 'All' }],
        filters: [{ k: 'source', label: 'Source', options: INQ_SOURCES.map(v => [v, v]), test: (q, v) => q.source === v }, { k: 'ptype', label: 'Party', options: [['chemist', 'Chemists'], ['customer', 'Customers'], ['new', 'New people']], test: (q, v) => q.party.type === v }, ...prodFilters(q => q.items.map(i => prod(i.productId)), ['company', 'item'])],
        rows: () => [...(db.inquiries || [])].sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no)),
        text: q => [q.no, inqPartyName(q), inqPartyPhone(q), q.notes, q.source, ...q.items.map(i => i.name)].join(' '),
        empty: 'No enquiries here. Use “New enquiry” when someone asks for an item, a rate or availability.',
        columns: [
          { h: 'Enquiry', c: q => `<a href="#" data-act="view-inquiry" data-id="${esc(q.no)}" class="strong">${esc(q.no)}</a><div class="small muted">${fmtDate(q.date)}</div>` },
          { h: 'From', c: q => `${esc(inqPartyName(q))} ${pill(q.party.type === 'chemist' ? 'Chemist' : q.party.type === 'customer' ? 'Customer' : 'New person')}<div class="small">${telLink(inqPartyPhone(q))}</div>` },
          { h: 'Asked for', c: q => `<span class="small ellipsis" style="display:block;max-width:300px">${esc(q.items.map(i => `${i.name} × ${i.qty}`).join(', ') || q.notes || '—')}</span>` },
          { h: 'Source', c: q => esc(q.source || '—') },
          { h: 'Follow-up', c: q => q.followUp ? `<span class="${inqDue(q) ? 'bad-text strong' : ''}">${fmtDate(q.followUp)}</span>` : '—' },
          { h: 'Status', c: q => pill(q.status) + (q.saleNo ? `<div class="small muted">${esc(q.saleNo)}</div>` : '') },
          { h: '', c: q => rowActs(inqOpen(q) && actBtn('inq-convert', q.no, 'Make bill', 'primary'), actBtn('edit-inquiry', q.no, 'Edit', 'ghost'), actBtn('del-inquiry', q.no, 'Delete', 'ghost danger')) },
        ],
      })}`;
  };

  // ---------- Sales returns ----------
  const RETURN_REASONS = ['Expired / near expiry', 'Damaged / broken', 'Wrong item supplied', 'Excess stock', 'Short expiry on delivery', 'Rate difference', 'Other'];
  const retPartyName = r => r.party.type === 'chemist' ? (chem(r.party.chemistId)?.name || 'Unknown chemist') : (custById(r.party.customerId)?.name || 'Customer');
  VIEWS.returns = () => {
    const rs = db.returns || [];
    const appr = rs.filter(r => r.status === 'Approved');
    return `
      <div class="grid g-4">
        ${kpi('Return requests', qty(rs.filter(r => r.status === 'Requested').length), 'Waiting for approval')}
        ${kpi('Returned this month', compact(sumBy(appr, r => monthKey(r.approvedOn || r.date) === thisM)), `${appr.filter(r => monthKey(r.approvedOn || r.date) === thisM).length} credit notes`)}
        ${kpi('Total credit given', compact(sumBy(appr, () => true)), `${appr.length} approved returns`)}
        ${kpi('Units back in stock', qty(appr.reduce((a, r) => a + r.lines.reduce((x, l) => x + l.qty + (l.free || 0), 0), 0)), 'From approved returns')}
      </div>
      ${useList({
        key: 'returns', title: 'Sales returns',
        actions: actBtn('new-return', '', icon('plus') + 'New return', 'primary'),
        tabs: [{ id: 'req', label: 'Requested', filter: r => r.status === 'Requested' }, { id: 'Approved', label: 'Approved', filter: r => r.status === 'Approved' }, { id: 'Rejected', label: 'Rejected', filter: r => r.status === 'Rejected' }, { id: 'all', label: 'All' }],
        filters: [{ k: 'reason', label: 'Reason', options: RETURN_REASONS.map(v => [v, v]), test: (r, v) => r.reason === v }, { k: 'ptype', label: 'Party', options: [['chemist', 'Chemists'], ['customer', 'Customers']], test: (r, v) => r.party.type === v }, ...prodFilters(r => r.lines.map(l => prod(l.productId)), ['company', 'item'])],
        rows: () => [...(db.returns || [])].sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no)),
        text: r => [r.no, retPartyName(r), r.reason, r.note, ...r.lines.map(l => `${prod(l.productId)?.name} ${l.batch} ${l.saleNo}`)].join(' '),
        empty: 'No returns here. Use “New return”, pick the party and tick the items coming back.',
        columns: [
          { h: 'Return', c: r => `<a href="#" data-act="view-return" data-id="${esc(r.no)}" class="strong">${esc(r.no)}</a><div class="small muted">${fmtDate(r.date)}</div>` },
          { h: 'Party', c: r => esc(retPartyName(r)) },
          { h: 'Against bills', c: r => esc([...new Set(r.lines.map(l => l.saleNo))].join(', ')) },
          { h: 'Items', c: r => `<span class="small ellipsis" style="display:block;max-width:260px">${esc(r.lines.map(l => `${prod(l.productId)?.name || ''} × ${l.qty}${l.free ? '+' + l.free : ''}`).join(', '))}</span>` },
          { h: 'Reason', c: r => esc(r.reason || '—') },
          { h: 'Credit', r: 1, c: r => money2(r.total) },
          { h: 'Status', c: r => pill(r.status) },
          { h: '', c: r => rowActs(r.status === 'Requested' && actBtn('approve-return', r.no, 'Approve', 'primary'), r.status === 'Requested' && actBtn('reject-return', r.no, 'Reject', 'ghost'), r.status === 'Requested' && actBtn('edit-return', r.no, 'Edit', 'ghost'), actBtn('del-return', r.no, 'Delete', 'ghost danger')) },
        ],
      })}`;
  };

  // ---------- Party ledger ----------
  const ledgerState = { type: 'chemist', id: '', from: '', to: '' };
  const LEDGER_TYPES = { chemist: 'Chemists', customer: 'Customers', supplier: 'Suppliers' };
  const ledgerParties = type => (type === 'chemist' ? db.chemists.map(c => [c.id, `${c.name}${c.city ? ' — ' + c.city : ''}`]) : type === 'customer' ? (db.customers || []).map(c => [c.id, `${c.name}${c.phone ? ' — ' + c.phone : ''}`]) : db.suppliers.map(x => [x.id, x.name])).sort(byName);
  const ledgerPartyName = (type, id) => type === 'chemist' ? chem(id)?.name : type === 'customer' ? custById(id)?.name : sup(id)?.name;
  function ledgerEntries(type, id) {
    const out = [];
    if (type === 'supplier') {
      db.pinvoices.filter(p => p.supplierId === id).forEach(p => {
        out.push({ date: p.date, kind: 'Purchase bill', ref: p.no, note: p.supplierInvNo ? `Supplier bill ${p.supplierInvNo}` : '', dr: 0, cr: p.total, act: 'view-pi', ord: 0 });
        payList(p).forEach(x => out.push({ date: x.date, kind: x.amount < 0 ? 'Payment adjusted' : 'Payment made', ref: p.no, note: x.mode || '', dr: x.amount, cr: 0, act: 'view-pi', ord: 1 }));
      });
      (db.purchaseReturns || []).filter(x => x.supplierId === id).forEach(x => out.push({ date: x.date, kind: 'Purchase return (debit note)', ref: x.no, note: x.reason || '', dr: x.total, cr: 0, act: 'view-preturn', ord: 2 }));
    } else {
      const mine = x => type === 'chemist' ? x.party.chemistId === id : x.party.customerId === id;
      db.sales.filter(mine).forEach(x => {
        out.push({ date: x.date, kind: 'Sale bill', ref: x.no, note: `${x.lines.length} item${x.lines.length === 1 ? '' : 's'}`, dr: x.total, cr: 0, act: 'view-sale', ord: 0 });
        payList(x).forEach(y => out.push({ date: y.date, kind: y.amount < 0 ? 'Payment adjusted' : 'Payment received', ref: x.no, note: y.mode || '', dr: 0, cr: y.amount, act: 'view-sale', ord: 1 }));
      });
      (db.returns || []).filter(r => r.status === 'Approved' && mine(r)).forEach(r => out.push({ date: r.approvedOn || r.date, kind: 'Sales return (credit note)', ref: r.no, note: r.reason || '', dr: 0, cr: r.total, act: 'view-return', ord: 2 }));
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.ord - b.ord || a.ref.localeCompare(b.ref));
  }
  // Receivable parties: Dr − Cr; suppliers (payable): Cr − Dr. Positive = normal side.
  function ledgerCalc(type, id, from = '', to = '') {
    const sign = type === 'supplier' ? -1 : 1;
    let open = 0; const rows = [];
    ledgerEntries(type, id).forEach(e => { const v = sign * (e.dr - e.cr); if (from && e.date < from) open += v; else if (!to || e.date <= to) rows.push({ ...e }); });
    let bal = open;
    rows.forEach(e => { bal += sign * (e.dr - e.cr); e.bal = round2(bal); });
    return { open: round2(open), rows, dr: round2(rows.reduce((a, e) => a + e.dr, 0)), cr: round2(rows.reduce((a, e) => a + e.cr, 0)), close: round2(bal) };
  }
  const balSide = (v, type) => Math.abs(v) < 0.005 ? '' : type === 'supplier' ? (v > 0 ? 'Cr' : 'Dr') : (v > 0 ? 'Dr' : 'Cr');
  const balTxt = (v, type) => `${dec(Math.abs(v))} ${balSide(v, type)}`.trim();
  const ledgerTable = (L, type, printing = false) => `<table class="ledger-table">
      <thead><tr><th>Date</th><th>Particulars</th><th>Voucher</th><th class="r">Debit</th><th class="r">Credit</th><th class="r">Balance</th></tr></thead>
      <tbody>
        <tr class="ledger-open"><td></td><td colspan="4">Opening balance</td><td class="r">${balTxt(L.open, type)}</td></tr>
        ${L.rows.map(e => `<tr><td>${fmtDate(e.date)}</td><td>${esc(e.kind)}${e.note ? `<div class="small muted">${esc(e.note)}</div>` : ''}</td><td>${printing ? esc(e.ref) : `<a href="#" data-act="${e.act}" data-id="${esc(e.ref)}">${esc(e.ref)}</a>`}</td><td class="r">${e.dr ? dec(e.dr) : ''}</td><td class="r">${e.cr ? dec(e.cr) : ''}</td><td class="r">${balTxt(e.bal, type)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No entries in this period.</td></tr>'}
      </tbody>
      <tfoot><tr><td colspan="3">Total for the period</td><td class="r">${dec(L.dr)}</td><td class="r">${dec(L.cr)}</td><td class="r">${balTxt(L.close, type)}</td></tr></tfoot>
    </table>`;
  VIEWS.ledger = () => {
    const st = ledgerState;
    const parties = ledgerParties(st.type);
    if (!parties.some(x => x[0] === st.id)) st.id = '';
    const head = `<section class="card"><div class="card-body ledger-pick">
        <div class="seg">${Object.entries(LEDGER_TYPES).map(([k, l]) => `<label><input type="radio" name="ledgerType" value="${k}" ${st.type === k ? 'checked' : ''}> ${l}</label>`).join('')}</div>
        <label class="filter ledger-party"><span>Party</span><select id="ledgerParty"><option value="">All ${LEDGER_TYPES[st.type].toLowerCase()} — summary</option>${parties.map(([v, l]) => `<option value="${esc(v)}" ${v === st.id ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label class="filter"><span>From</span><input type="date" id="ledgerFrom" value="${esc(st.from)}"></label>
        <label class="filter"><span>To</span><input type="date" id="ledgerTo" value="${esc(st.to)}"></label>
        ${st.from || st.to ? `<button type="button" class="btn sm ghost" data-act="ledger-clear-dates" data-id="">All dates</button>` : ''}
        ${st.id ? `<span class="spacer"></span>${actBtn('ledger-print', '', icon('file') + 'Print')}${actBtn('ledger-csv', '', 'Export CSV', 'ghost')}` : ''}
      </div></section>`;
    if (!st.id) {
      const isSup = st.type === 'supplier';
      return head + useList({
        key: 'ledgerall', title: `${LEDGER_TYPES[st.type]} — balances`,
        rows: () => ledgerParties(st.type).map(([id, label]) => ({ id, label, ...ledgerCalc(st.type, id, st.from, st.to) })).filter(x => x.rows.length || Math.abs(x.open) > 0.005),
        text: x => x.label,
        empty: 'No entries for these parties yet.',
        columns: [
          { h: 'Party', c: x => `<a href="#" data-act="open-ledger" data-id="${st.type}|${esc(x.id)}" class="strong">${esc(x.label)}</a>` },
          { h: 'Opening', r: 1, c: x => balTxt(x.open, st.type) },
          { h: isSup ? 'Paid (Dr)' : 'Billed (Dr)', r: 1, c: x => dec(x.dr) },
          { h: isSup ? 'Billed (Cr)' : 'Received & returns (Cr)', r: 1, c: x => dec(x.cr) },
          { h: 'Closing', r: 1, c: x => `<span class="strong">${balTxt(x.close, st.type)}</span>` },
          { h: '', c: x => actBtn('open-ledger', `${st.type}|${x.id}`, 'Open ledger', 'ghost') },
        ],
        foot: rows => rows.length ? `<tfoot><tr><td class="strong">Total</td><td></td><td class="r num">${dec(rows.reduce((a, x) => a + x.dr, 0))}</td><td class="r num">${dec(rows.reduce((a, x) => a + x.cr, 0))}</td><td class="r num strong">${balTxt(rows.reduce((a, x) => a + x.close, 0), st.type)}</td><td></td></tr></tfoot>` : '',
      });
    }
    const L = ledgerCalc(st.type, st.id, st.from, st.to);
    const isSup = st.type === 'supplier';
    return head + `
      <div class="grid g-4">
        ${kpi('Opening balance', balTxt(L.open, st.type), st.from ? `Before ${fmtDate(st.from)}` : 'Start of account')}
        ${kpi(isSup ? 'Paid / debits' : 'Billed / debits', dec(L.dr), `${L.rows.filter(e => e.dr).length} entries`)}
        ${kpi(isSup ? 'Billed / credits' : 'Received & returns', dec(L.cr), `${L.rows.filter(e => e.cr).length} entries`)}
        ${kpi(isSup ? 'Closing — payable' : 'Closing — receivable', balTxt(L.close, st.type), L.close < -0.005 ? (isSup ? 'Advance paid to supplier' : 'Party has a credit with you') : st.to ? `As on ${fmtDate(st.to)}` : 'As on today')}
      </div>
      <section class="card"><div class="card-head"><h2 class="card-title">Ledger · ${esc(ledgerPartyName(st.type, st.id))}</h2><span class="hint">${L.rows.length} entries${st.from || st.to ? ` · ${st.from ? fmtDate(st.from) : 'start'} to ${st.to ? fmtDate(st.to) : 'today'}` : ''}</span></div>
        <div class="table-wrap">${ledgerTable(L, st.type)}</div></section>`;
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
          { id: 'blocked', label: 'Blocked', filter: b => avail(b) > 0 && b.blocked },
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
          { h: 'Item name', c: b => `<span class="strong">${esc(prod(b.productId)?.name)}</span>${b.blocked ? ' ' + pill('Blocked') : ''}${b.source ? `<div class="small muted">${esc(b.source)}</div>` : ''}${b.blocked && b.blockNote ? `<div class="small bad-text">${esc(b.blockNote)}</div>` : ''}` },
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
          { h: '', c: b => rowActs(!b.verified && actBtn('verify-batch', b.id, 'Mark checked'), b.blocked && actBtn('batch-unblock', b.id, 'Unblock', 'ghost'), actBtn('edit-batch', b.id, 'Edit', 'ghost'), actBtn('del-batch', b.id, 'Delete', 'ghost danger')) },
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
      filters: [...prodFilters(p => [p], ['company', 'category', 'form']), { k: 'sch', label: 'Schedule', options: [['none', 'Not set'], ...RX_SCHEDULES.filter(x => x[0])], test: (p, v) => v === 'none' ? !p.schedule : p.schedule === v }],
      select: {
        id: p => p.id,
        fields: [GST_FIELD, { k: 'schedule', label: 'Schedule', type: 'select', options: RX_SCHEDULES.filter(x => x[0]) }, { k: 'cold', label: 'Cold chain', type: 'select', options: [['1', 'Yes (2–8 °C)'], ['0', 'No']] }, { k: 'categoryId', label: 'Category', type: 'select', options: db.categories.map(c => [c.id, c.name]) }, { k: 'form', label: 'Form', type: 'select', options: db.forms.map(f => [f.name, f.name]) }, { k: 'companyId', label: 'Company', type: 'select', options: db.companies.map(c => [c.id, c.name]).sort(byName) }],
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
        { h: 'Item name', c: p => `<span class="strong">${esc(p.name)}</span><div class="small muted">${esc(p.id)}${p.salt ? ' · ' + esc(p.salt) : ''}${p.schedule ? ` · <b>${p.schedule === 'NDPS' || p.schedule === 'OTC' ? esc(p.schedule) : 'Sch. ' + esc(p.schedule)}</b>` : ''}${p.ceiling > 0 ? ` · ceiling ₹${dec(p.ceiling)}` : ''}${isCold(p) ? ' · ❄ 2–8 °C' : ''}</div>` },
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
          <div class="toolbar">${actBtn('open-ledger', 'supplier|' + s.id, 'Ledger', 'ghost')}${actBtn('edit-supplier', s.id, 'Edit supplier', 'ghost')}${actBtn('new-po', '', icon('plus') + 'Purchase order')}<button type="button" class="btn sm primary" data-act="upload-for" data-id="${esc(s.id)}">${icon('upload')}Upload bill</button></div></div>
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
    if (p) { const b = db.batches.find(x => x.productId === p.id && norm(x.batch) === norm(l.batch)); if (b) msgs.push('Adds to existing batch'); priceChecks(l, p, warn); }
    phase4LineChecks(l, p, warn);
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
            : `AI reading needs an Anthropic API key in this browser. <a href="#" data-act="ask-api-key" data-id="">Add the key</a>. You can still import a CSV or type the bill in.`}</div>
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

  const extractBill = files => callClaudeJson(files, EXTRACT_PROMPT, BILL_SCHEMA, 32000, aiModel('bill'));
  const extractLicence = files => callClaudeJson(files, LIC_PROMPT, LIC_SCHEMA, 4000, aiModel('bill'));
  async function callClaudeJson(files, prompt, schema, maxTokens, model) {
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
        model: model || 'claude-opus-5-5',
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
      if (err instanceof SyntaxError) throw new Error('The AI reply could not be understood. Please try again.');
      throw new Error(aiErrorText(err, Anthropic, true));
    }
  }
  // Plain words for errors from the Anthropic API. Account problems (no credit, key not accepted) are told
  // as such, so they are not mistaken for a problem with the uploaded file.
  function aiErrorText(err, Anthropic, withFile) {
    const raw = String(err?.error?.error?.message || err?.message || '');
    if (/credit balance|billing|purchase credits|plans? ?& ?billing/i.test(raw)) return 'Your Anthropic account has no credit left, so the AI cannot read anything. Add credit at console.anthropic.com → Settings → Billing (the API is paid separately from a Claude.ai subscription), then try again. You can still import a CSV or type the bill in.';
    if (err?.status === 401 || (Anthropic && err instanceof Anthropic.AuthenticationError)) return 'The API key was not accepted. Check it in Settings → Integrations → AI providers.';
    if (err?.status === 403 || (Anthropic && err instanceof Anthropic.PermissionDeniedError)) return 'This API key is not allowed to use the model. Check your Anthropic account (console.anthropic.com).';
    if (err?.status === 429 || (Anthropic && err instanceof Anthropic.RateLimitError)) return /spend|limit|quota/i.test(raw) && !/rate/i.test(raw) ? 'Your Anthropic account has reached its spend limit. Raise it at console.anthropic.com → Settings → Limits, then try again.' : 'Too many requests right now. Wait a minute and try again.';
    if (err?.status === 529 || err?.status >= 500) return 'Anthropic is busy right now. Wait a minute and try again.';
    if (Anthropic && err instanceof Anthropic.APIConnectionError) return 'Could not reach Anthropic. Check your internet connection.';
    if (err?.status === 413 || /too large|too long|maximum.*(pages|size)|exceeds/i.test(raw)) return 'The file is too large to read in one go. Upload fewer pages, or a smaller photo / PDF (up to 100 pages, 32 MB).';
    if (err?.status === 400 || (Anthropic && err instanceof Anthropic.BadRequestError)) return withFile ? `The file could not be read (${raw.replace(/^\d+\s*/, '').slice(0, 200) || 'bad request'}). Try a clear JPG/PNG photo or a smaller PDF.` : `Anthropic did not accept the request: ${raw.slice(0, 200)}`;
    return raw ? `Anthropic returned an error: ${raw.slice(0, 200)}` : 'Could not reach the AI. Please try again.';
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
      ['Customers', (db.customers || []).filter(c => has(c.name, c.phone, c.id, c.locality)), c => `${esc(c.name)} <span class="muted small">${esc(c.phone || '')}</span>`, 'view-customer', c => c.id],
      ['Enquiries', (db.inquiries || []).filter(q => has(q.no, inqPartyName(q), ...q.items.map(i => i.name))).slice(0, 20), q => `${esc(q.no)} <span class="muted small">${esc(inqPartyName(q))} · ${esc(q.status)}</span>`, 'view-inquiry', q => q.no],
      ['Sales returns', (db.returns || []).filter(r => has(r.no, retPartyName(r))).slice(0, 20), r => `${esc(r.no)} <span class="muted small">${esc(retPartyName(r))} · ${money2(r.total)}</span>`, 'view-return', r => r.no],
      ['Doctors', (db.doctors || []).filter(d => has(d.name, d.specialization, d.designation, d.mobile, docHosp(d)?.name || d.hospital)).slice(0, 20), d => `${esc(d.name)} <span class="muted small">${esc([d.specialization, docHosp(d)?.name || d.hospital].filter(Boolean).join(' · '))}</span>`, 'view-doctor', d => d.id],
      ['Hospitals', (db.hospitals || []).filter(h => has(h.name, h.locality, h.tehsil, h.headName, h.pharmName)).slice(0, 20), h => `${esc(h.name)} <span class="muted small">${esc([h.tehsil, h.district].filter(Boolean).join(', '))}</span>`, 'view-hospital', h => h.id],
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
    if (db.settings.demo && intCfg('demo').banner !== false && r !== 'settings') $('#content').insertAdjacentHTML('afterbegin', `<div class="demo-note">${icon('spark')}<span>You are looking at <b>sample data</b>. When you are ready, start with your own data.</span><button type="button" class="btn sm" data-act="settings-data" data-id="">Settings → Data</button></div>`);
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
    if ($('#hospResults')) refreshHospitalSelect();
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
    // Longer messages (such as AI account errors) stay up long enough to read
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), Math.min(12000, Math.max(3800, String(msg).length * 55)));
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
  // Tehsil / locality suggestions come from your own records and from the hospital directory
  const usedValues = (key, district) => [...new Set([...addrHolders(), ...(key === 'tehsil' || key === 'locality' || key === 'district' ? (db.hospitals || []) : [])]
    .filter(h => !district || h.district === district).map(h => h[key]).filter(Boolean))].sort();

  // ---------- Hospital directory ----------
  const HOSP_TYPES = ['Medical College', 'Medical University', 'AIIMS', 'Zonal Hospital', 'Regional Hospital', 'District Hospital', 'Civil Hospital', 'Sub-Divisional Hospital', 'CHC', 'PHC', 'ESI', 'Ayurvedic Hospital', 'Other Govt Hospital', 'Private Hospital', 'Other'];
  const hospRank = t => { const i = HOSP_TYPES.indexOf(t); return i < 0 ? 99 : i; };
  const hospById = id => (db.hospitals || []).find(h => h.id === id);
  const hospSort = (a, b) => hospRank(a.type) - hospRank(b.type) || a.name.localeCompare(b.name);
  const hospitalName = x => (x?.hospitalId && hospById(x.hospitalId)?.name) || x?.hospital || '';
  const seedHospitals = () => (window.HP_HOSPITALS?.rows || []).map(r => Object.fromEntries(window.HP_HOSPITALS.keys.map((k, i) => [k, r[i]])));
  const nearChemists = h => db.chemists.filter(c => c.hospitalId === h.id || (!c.hospitalId && c.hospital && norm(c.hospital) === norm(h.name)));
  // Options for the "Nearby hospital" dropdown: the chosen tehsil first, then the rest of the district
  function hospitalOptions(district, tehsil, selId) {
    const opt = (h) => `<option value="${esc(h.id)}" ${h.id === selId ? 'selected' : ''}>${esc(h.name)}${h.locality && !norm(h.name).includes(norm(h.locality)) ? ' — ' + esc(h.locality) : ''} (${esc(h.type)})</option>`;
    if (!district) {
      const sel = hospById(selId);
      return `<option value="">— choose the district first —</option>${sel ? opt(sel) : ''}<option value="__other" ${selId === '__other' ? 'selected' : ''}>+ Hospital not in the list…</option>`;
    }
    const hs = (db.hospitals || []).filter(h => norm(h.district) === norm(district)).sort(hospSort);
    const near = tehsil ? hs.filter(h => norm(h.tehsil) === norm(tehsil)) : [];
    const rest = hs.filter(h => !near.includes(h));
    const sel = hospById(selId);
    const outside = sel && !hs.includes(sel) ? `<optgroup label="Other district${sel.district ? ': ' + esc(sel.district) : ''}">${opt(sel)}</optgroup>` : '';
    return `<option value="">— None —</option>${outside}
      ${near.length ? `<optgroup label="In ${esc(tehsil)} (${near.length})">${near.map(opt).join('')}</optgroup>` : ''}
      ${rest.length ? `<optgroup label="${near.length ? 'Elsewhere in ' : ''}${esc(district)} district (${rest.length})">${rest.map(opt).join('')}</optgroup>` : ''}
      <option value="__other" ${selId === '__other' ? 'selected' : ''}>+ Hospital not in the list…</option>`;
  }
  // Hospital picker: a search box and a visible list of hospitals. With no search, it lists the chosen
  // district (that tehsil first), or the whole directory by district; typing searches all of Himachal.
  const hospSearchBox = (mode, label) => `<div class="field full hosp-search" data-area="${mode}">
      <label for="hospSearch">${label}</label>
      <div class="hosp-picked" id="hospPicked"></div>
      <div class="hosp-panel">
        <div class="hosp-search-wrap">${icon('search')}<input id="hospSearch" autocomplete="off" placeholder="Search by hospital name, village, tehsil or district — e.g. Ghumarwin, CHC Bharari, IGMC"></div>
        <div class="hosp-list-head"><span class="small muted" id="hospHint"></span><span class="spacer"></span>
          <button type="button" class="btn sm ghost" data-hosp-none>No hospital</button>
          <button type="button" class="btn sm ghost" data-hosp-other>+ Not in the list</button></div>
        <div class="hosp-results" id="hospResults" role="listbox" aria-label="Hospitals"></div>
      </div>
    </div>`;
  function hospSearchResults(q, limit = 80) {
    const words = norm(q).split(' ').filter(Boolean);
    if (!words.length) return [];
    const dist = norm($('#mform [name="district"]')?.value);
    const hay = h => norm([h.name, h.locality, h.tehsil, h.district, h.type, h.pincode].join(' '));
    return (db.hospitals || []).filter(h => { const t = hay(h); return words.every(w => t.includes(w)); })
      .sort((a, b) => (norm(b.district) === dist) - (norm(a.district) === dist) || norm(b.name).startsWith(words[0]) - norm(a.name).startsWith(words[0]) || hospSort(a, b))
      .slice(0, limit);
  }
  const hospRow = (h, selId) => `<button type="button" class="hosp-res ${h.id === selId ? 'selected' : ''}" data-pick-hosp="${esc(h.id)}" role="option" aria-selected="${h.id === selId}">
      <span class="hosp-res-main"><span class="strong">${esc(h.name)}</span> ${pill(h.type)}</span>
      <span class="small muted">${esc([h.locality && !norm(h.name).includes(norm(h.locality)) ? h.locality : '', h.tehsil && 'Teh. ' + h.tehsil, h.district].filter(Boolean).join(' · '))}</span>
    </button>`;
  function renderHospResults() {
    const box = $('#hospResults'); if (!box) return;
    const q = ($('#hospSearch')?.value || '').trim();
    const dist = $('#mform [name="district"]')?.value.trim() || '';
    const teh = $('#mform [name="tehsil"]')?.value.trim() || '';
    const selId = $('#f-hospitalId')?.value || '';
    const groups = []; let hint;
    if (q) {
      const rs = hospSearchResults(q);
      groups.push(['', rs]);
      hint = rs.length ? `${rs.length}${rs.length === 80 ? '+' : ''} match${rs.length === 1 ? '' : 'es'} for “${q}” across Himachal` : `No hospital matches “${q}”.`;
    } else if (dist) {
      const hs = (db.hospitals || []).filter(h => norm(h.district) === norm(dist)).sort(hospSort);
      const near = teh ? hs.filter(h => norm(h.tehsil) === norm(teh)) : [];
      if (near.length) groups.push([`In ${teh} (${near.length})`, near]);
      groups.push([`${near.length ? 'Elsewhere in' : 'All of'} ${dist} district (${hs.length - near.length})`, hs.filter(h => !near.includes(h))]);
      hint = hs.length ? `${hs.length} hospitals in ${dist}${near.length ? `, ${teh} first` : ''}` : `No hospitals saved for “${dist}” yet.`;
    } else {
      const by = {};
      (db.hospitals || []).forEach(h => { (by[h.district || 'District not known'] = by[h.district || 'District not known'] || []).push(h); });
      Object.keys(by).sort((a, b) => (a === 'District not known') - (b === 'District not known') || a.localeCompare(b)).forEach(d => groups.push([`${d} (${by[d].length})`, by[d].sort(hospSort)]));
      hint = `All ${(db.hospitals || []).length} hospitals — fill in the district above to see only that area`;
    }
    box.innerHTML = groups.filter(([, rows]) => rows.length).map(([title, rows]) => `${title ? `<div class="hosp-grp">${esc(title)}</div>` : ''}${rows.map(h => hospRow(h, selId)).join('')}`).join('')
      || '<div class="small muted hosp-more">Nothing to show. Choose “+ Not in the list” to add the hospital.</div>';
    const first = box.querySelector('.hosp-res.selected') || box.querySelector('.hosp-res');
    if (first) first.classList.add('active');
    $('#hospHint').textContent = hint;
    const sel = hospById(selId);
    $('#hospPicked').innerHTML = selId === '__other'
      ? `<span class="pill warn">Not in the list</span> <span class="small">Type its name below — it will be added to the directory.</span>`
      : sel ? `${icon('tick')}<span><span class="strong">${esc(sel.name)}</span> <span class="small muted">${esc([sel.type, sel.tehsil && 'Teh. ' + sel.tehsil, sel.district].filter(Boolean).join(' · '))}</span></span>`
      : '<span class="small muted">No hospital selected — pick one from the list below.</span>';
    $('#hospPicked').classList.toggle('on', !!sel);
  }
  function pickHospital(id) {
    const h = hospById(id); if (!h) return;
    const always = $('.hosp-search')?.dataset.area === 'always';
    const dEl = $('#mform [name="district"]'), tEl = $('#mform [name="tehsil"]');
    if (dEl && h.district && (always || !dEl.value.trim())) { dEl.value = h.district; refreshAddrLists(); }
    if (tEl && h.tehsil && (always || !tEl.value.trim())) tEl.value = h.tehsil;
    const sel = $('#f-hospitalId');
    sel.innerHTML = hospitalOptions(dEl?.value.trim(), tEl?.value.trim(), h.id);
    sel.value = h.id;
    $('#hospSearch').value = '';
    refreshHospitalSelect();
    $('#hospResults .hosp-res.selected')?.scrollIntoView({ block: 'nearest' });
  }
  function setHospitalChoice(v) {
    const sel = $('#f-hospitalId'); if (!sel) return;
    sel.value = v;
    $('#hospOtherWrap')?.classList.toggle('hidden', v !== '__other');
    renderHospResults();
    if (v === '__other') $('#f-hospitalOther')?.focus();
  }
  function refreshHospitalSelect() {
    const sel = $('#f-hospitalId'); if (!sel) return;
    const keep = sel.value;
    sel.innerHTML = hospitalOptions($('#mform [name="district"]')?.value.trim(), $('#mform [name="tehsil"]')?.value.trim(), keep);
    if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
    $('#hospOtherWrap')?.classList.toggle('hidden', sel.value !== '__other');
    renderHospResults();
  }
  const dlOptions = vals => vals.map(v => `<option value="${esc(v)}">`).join('');
  const addrFields = (x, required) => `
    <div class="field full form-sec">Address</div>
    ${field('District', 'district', { value: x.district || '', required, attrs: 'list="dl-a-district" autocomplete="off"' })}
    ${field('Tehsil', 'tehsil', { value: x.tehsil || '', required, attrs: 'list="dl-a-tehsil" autocomplete="off"' })}
    ${field('Sub-tehsil', 'subTehsil', { value: x.subTehsil || '', attrs: 'list="dl-a-subTehsil" autocomplete="off"' })}
    ${field('Village / locality', 'locality', { value: x.locality || '', required, attrs: 'list="dl-a-locality" autocomplete="off"' })}
    ${field('House / shop no., street, landmark', 'address', { value: x.address || '', full: true })}
    ${field('PIN code', 'pincode', { value: x.pincode || '', attrs: 'pattern="[1-9][0-9]{5}" inputmode="numeric" maxlength="6" title="6-digit PIN code"' })}
    ${hospSearchBox('empty', 'Nearby hospital')}
    <div class="hidden"><select id="f-hospitalId" name="hospitalId" aria-hidden="true" tabindex="-1">${hospitalOptions(x.district, x.tehsil, x.hospitalId || (x.hospital && ((db.hospitals || []).find(h => norm(h.name) === norm(x.hospital))?.id || '__other')) || '')}</select></div>
    <div class="field ${x.hospital && !x.hospitalId && !(db.hospitals || []).some(h => norm(h.name) === norm(x.hospital)) ? '' : 'hidden'}" id="hospOtherWrap"><label for="f-hospitalOther">Hospital name (it will be added to the directory)</label><input id="f-hospitalOther" name="hospitalOther" value="${esc(x.hospital && !x.hospitalId ? x.hospital : '')}"></div>
    <datalist id="dl-a-district">${dlOptions([...new Set([...HP_DISTRICTS, ...usedValues('district')])].sort())}</datalist>
    ${['tehsil', 'subTehsil', 'locality'].map(k => `<datalist id="dl-a-${k}">${dlOptions(usedValues(k, x.district))}</datalist>`).join('')}`;
  // When the district or tehsil changes, suggest only that area's tehsils, villages and hospitals
  function refreshAddrLists() {
    const d = $('#mform [name="district"]')?.value.trim();
    ['tehsil', 'subTehsil', 'locality'].forEach(k => { const el = $(`#dl-a-${k}`); if (el) el.innerHTML = dlOptions(usedValues(k, d)); });
    refreshHospitalSelect();
  }
  const readAddr = d => {
    const a = { district: (d.district || '').trim(), tehsil: (d.tehsil || '').trim(), subTehsil: (d.subTehsil || '').trim(), locality: (d.locality || '').trim(), address: (d.address || '').trim(), pincode: (d.pincode || '').trim(), hospitalId: '', hospital: '' };
    Object.assign(a, resolveHospital(d, a));
    a.city = placeCity(a);
    return a;
  };
  // The hospital chosen in a form's dropdown; "+ not in the list" adds it to the directory
  function resolveHospital(d, area) {
    if (d.hospitalId === '__other') {
      const name = String(d.hospitalOther || '').trim();
      if (!name) return { hospitalId: '', hospital: '' };
      let h = (db.hospitals || []).find(x => norm(x.name) === norm(name) && (!area.district || x.district === area.district));
      if (!h) { h = { id: nextId('H', db.hospitals, 4), name, type: 'Other', district: area.district || '', tehsil: area.tehsil || '', locality: area.locality || '', pincode: area.pincode || '', source: 'Added by you' }; db.hospitals.push(h); }
      return { hospitalId: h.id, hospital: h.name };
    }
    const h = d.hospitalId && hospById(d.hospitalId);
    return h ? { hospitalId: h.id, hospital: h.name } : { hospitalId: '', hospital: '' };
  }
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
    // Hospital directory (added later): start from the bundled Himachal list and link saved hospital names to it
    if (!Array.isArray(d.hospitals)) { d.hospitals = seedHospitals(); d.hospitalsRev = 2; }
    // Corrected starting list (rev 2): fix names in saved copies, leaving rows the user has edited alone, and add new rows
    if ((d.hospitalsRev || 1) < 2) {
      const ids = new Set(d.hospitals.map(h => h.id)), names = new Set(d.hospitals.map(h => norm(h.name)));
      seedHospitals().forEach(s => {
        const h = d.hospitals.find(x => x.id === s.id);
        if (h && h.source === s.source && h.source === 'HPPCB list' && (h.name !== s.name || h.district !== s.district)) {
          Object.assign(h, { name: s.name, district: s.district, tehsil: s.tehsil, locality: s.locality });
          [d.settings?.firm, ...(d.chemists || []), ...(d.suppliers || []), ...(d.doctors || [])].forEach(x => { if (x && x.hospitalId === h.id) x.hospital = h.name; });
        } else if (!h && !ids.has(s.id) && !names.has(norm(s.name))) d.hospitals.push(s);
      });
      d.hospitalsRev = 2;
    }
    if (!Array.isArray(d.doctors)) d.doctors = [];
    if (!Array.isArray(d.customers)) {
      d.customers = [];
      (d.sales || []).filter(s => s.party?.type === 'individual').sort((a, b) => a.date.localeCompare(b.date)).forEach(s => {
        const ph = String(s.party.phone || '').trim(), nm = String(s.party.name || 'Customer').trim();
        let c = d.customers.find(x => ph ? x.phone === ph : !x.phone && norm(x.name) === norm(nm));
        if (!c) { c = { id: 'U' + String(d.customers.length + 1).padStart(3, '0'), name: nm, phone: ph, joined: s.date }; d.customers.push(c); }
        s.party.customerId = c.id;
      });
    }
    if (!Array.isArray(d.inquiries)) d.inquiries = [];
    if (!Array.isArray(d.returns)) d.returns = [];
    ['approvals', 'agentLog', 'reminders', 'purchaseReturns', 'recalls', 'schemes', 'schemeClaims', 'visits', 'gstr2b', 'tempLog', 'auditLog'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
    // Delivery tracking (added later): bills made before it count as delivered
    if (!d.deliveryRev) { (d.sales || []).forEach(s => { if (!s.delivered) s.delivered = s.date; }); d.deliveryRev = 1; }
    if (d.settings && !d.settings.profile) d.settings.profile = {};
    [d.settings?.firm, ...(d.chemists || []), ...(d.suppliers || [])].forEach(x => {
      if (!x || x.hospitalId || !x.hospital) return;
      const h = d.hospitals.find(h => norm(h.name) === norm(x.hospital));
      if (h) x.hospitalId = h.id;
    });
    return d;
  }

  // ---------- Printable bills: A4, A4 landscape, A5 and thermal receipts ----------
  const PRINT_SIZES = {
    a4: { label: 'A4', page: 'A4 portrait', margin: '10mm', hint: 'Full page — all columns' },
    a4l: { label: 'A4 landscape', page: 'A4 landscape', margin: '8mm', hint: 'Wide page — roomy columns' },
    a5: { label: 'A5 (half sheet)', page: 'A5 landscape', margin: '6mm', hint: 'Half an A4 sheet, landscape — common for chemist bills' },
    t80: { label: 'Thermal 80 mm', thermal: true, hint: '3-inch receipt roll — choose the thermal printer and its 80 mm paper in the print window' },
    t58: { label: 'Thermal 58 mm', thermal: true, hint: '2-inch receipt roll — choose the thermal printer and its 58 mm paper in the print window' },
  };
  const printSize = () => PRINT_SIZES[db.settings.printSize] ? db.settings.printSize : 'a4';
  // Amount in words, Indian system (lakh, crore)
  function inWords(num) {
    let n = Math.round(Math.abs(num || 0));
    if (!n) return 'Zero';
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = x => x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : '');
    const three = x => [x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' : '', x % 100 ? two(x % 100) : ''].filter(Boolean).join(' ');
    const cr = Math.floor(n / 1e7); n %= 1e7;
    const lk = Math.floor(n / 1e5); n %= 1e5;
    const th = Math.floor(n / 1e3); n %= 1e3;
    return [cr && (cr > 999 ? inWords(cr) : three(cr)) + ' Crore', lk && two(lk) + ' Lakh', th && two(th) + ' Thousand', n && three(n)].filter(Boolean).join(' ');
  }
  const rupeesInWords = v => `Rupees ${inWords(v)} Only`;
  const firmLines = f => [addrText(f), f.phone && `Ph: ${f.phone}`, f.gstin && `GSTIN: ${f.gstin}`, (f.dl1 || f.dl2) && `DL No: ${[f.dl1, f.dl2].filter(Boolean).join(', ')}`, f.fssai && `FSSAI: ${f.fssai}`].filter(Boolean);

  // A4 / A5 bill in the layout of a printed pharma bill
  function billDoc({ title, no, date, partyTitle = '', partyLines = [], metaLines = [], lines, t, paid, isSale = false }) {
    const f = db.settings.firm;
    const slabs = Object.entries(t.slabs || {}).filter(([, s]) => s.taxable).sort((a, b) => b[0] - a[0]);
    const qtyTotal = lines.reduce((x, l) => x + (+l.qty || 0), 0), freeTotal = lines.reduce((x, l) => x + (+l.free || 0), 0);
    return `<div class="bill">
      <div class="bill-top"><span class="bill-title">${esc(title)}</span>${isSale ? '<span class="bill-copy">Original for recipient</span>' : ''}</div>
      <div class="bill-head">
        <div class="bill-from">${f.logo ? `<img class="bill-logo" src="${esc(f.logo)}" alt="">` : ''}<div><div class="bill-firm">${esc(f.name)}</div>${firmLines(f).map(x => `<div>${esc(x)}</div>`).join('')}</div></div>
        <div class="bill-meta"><div><span>Bill no.</span><b>${esc(no)}</b></div><div><span>Date</span><b>${fmtDate(date)}</b></div>${metaLines.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
        <div class="bill-to"><div class="bill-to-label">${isSale ? 'Billed to' : 'Supplier'}</div><div class="strong">${esc(partyTitle)}</div>${partyLines.filter(Boolean).map(x => `<div>${esc(x)}</div>`).join('')}</div>
      </div>
      <div class="table-wrap"><table class="bill-table">
        <thead><tr><th>SN</th><th>Item name</th><th>Company</th><th class="c-mfg">MFG</th><th>Pack</th><th>HSN</th><th>Batch</th><th>Exp</th><th class="r">Qty</th><th class="r">Free</th><th class="r">Rate</th><th class="r">MRP</th><th class="r">CD%</th><th class="r">TD%</th><th class="r">GST%</th><th class="r">Amount</th></tr></thead>
        <tbody>${lines.map((l, i) => { const p = prod(l.productId); return `<tr><td>${i + 1}</td><td class="strong">${esc(p?.name || l.name)}</td><td>${esc(company(p?.companyId)?.name || '')}</td><td class="c-mfg">${esc(p?.mfg || '')}</td><td>${esc(p?.pack || '')}</td><td>${esc(p?.hsn || '')}</td><td>${esc(l.batch || '')}</td><td>${l.expiry ? isoToExp(l.expiry) : ''}</td><td class="r">${qty(l.qty)}</td><td class="r">${l.free ? qty(l.free) : ''}</td><td class="r">${dec(l.rate)}</td><td class="r">${dec(l.mrp)}</td><td class="r">${l.cd ? dec(l.cd) : ''}</td><td class="r">${l.td ? dec(l.td) : ''}</td><td class="r">${dec(l.gst)}</td><td class="r">${dec(calcLine(l).amount)}</td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td colspan="3">${lines.length} item${lines.length === 1 ? '' : 's'}</td><td class="c-mfg"></td><td colspan="4"></td><td class="r">${qty(qtyTotal)}</td><td class="r">${freeTotal ? qty(freeTotal) : ''}</td><td colspan="5"></td><td class="r">${dec(t.gross)}</td></tr></tfoot>
      </table></div>
      <div class="bill-foot">
        <div class="bill-left">
          <table class="bill-slabs"><thead><tr><th>GST%</th><th class="r">Taxable</th><th class="r">CGST</th><th class="r">SGST</th><th class="r">Total GST</th></tr></thead>
            <tbody>${slabs.map(([k, s]) => `<tr><td>${k}%</td><td class="r">${dec(s.taxable)}</td><td class="r">${dec(s.gst / 2)}</td><td class="r">${dec(s.gst / 2)}</td><td class="r">${dec(s.gst)}</td></tr>`).join('')}</tbody></table>
          <div class="bill-words"><span>Amount in words</span>${esc(rupeesInWords(t.total))}</div>
          ${isSale && f.bank ? `<div class="bill-note"><span>Bank details</span>${esc(f.bank)}</div>` : ''}
          ${isSale ? `<div class="bill-note"><span>Terms</span>${esc(f.terms || 'E. & O.E. Goods once sold will be taken back only as per terms. Subject to local jurisdiction.')}</div>` : ''}
        </div>
        <table class="bill-totals"><tbody>
          <tr><td>Gross amount</td><td class="r">${dec(t.gross)}</td></tr>
          ${t.cd ? `<tr><td>Less CD</td><td class="r">-${dec(t.cd)}</td></tr>` : ''}
          ${t.td ? `<tr><td>Less TD</td><td class="r">-${dec(t.td)}</td></tr>` : ''}
          <tr><td>Taxable value</td><td class="r">${dec(t.taxable)}</td></tr>
          <tr><td>CGST</td><td class="r">${dec(t.cgst)}</td></tr>
          <tr><td>SGST</td><td class="r">${dec(t.sgst)}</td></tr>
          ${t.roundOff ? `<tr><td>Round off</td><td class="r">${dec(t.roundOff)}</td></tr>` : ''}
          <tr class="net"><td>Net amount</td><td class="r">₹ ${dec(t.total)}</td></tr>
          ${paid != null ? `<tr><td>Received / paid</td><td class="r">${dec(paid)}</td></tr><tr><td>Balance</td><td class="r">${dec(Math.max(0, t.total - paid))}</td></tr>` : ''}
        </tbody></table>
      </div>
      <div class="bill-sign"><div><span>&nbsp;</span><span class="sig-line">${isSale ? "Receiver's signature" : 'Checked by'}</span></div><div><span>For <b>${esc(f.name)}</b></span><span class="sig-line">Authorised signatory</span></div></div>
    </div>`;
  }

  // Thermal receipt (80 mm or 58 mm roll)
  function billThermal({ title, no, date, partyTitle = '', partyLines = [], metaLines = [], lines, t, paid, isSale = false }) {
    const f = db.settings.firm;
    const slabs = Object.entries(t.slabs || {}).filter(([, s]) => s.taxable).sort((a, b) => b[0] - a[0]);
    const row = (k, v, cls = '') => `<div class="t-row ${cls}"><span>${k}</span><span>${v}</span></div>`;
    return `<div class="bill-t">
      <div class="t-c"><div class="t-firm">${esc(f.name)}</div>${firmLines(f).map(x => `<div>${esc(x)}</div>`).join('')}</div>
      <div class="t-hr"></div>
      <div class="t-c t-title">${esc(title)}</div>
      ${row(`No: ${esc(no)}`, fmtDate(date))}
      ${metaLines.map(([k, v]) => row(esc(k), esc(v))).join('')}
      ${partyTitle ? `<div class="t-party"><b>${esc(partyTitle)}</b>${partyLines.filter(Boolean).map(x => `<div>${esc(x)}</div>`).join('')}</div>` : ''}
      <div class="t-hr"></div>
      ${row('<b>Item</b>', '<b>Amount</b>')}
      ${lines.map((l, i) => { const p = prod(l.productId); return `<div class="t-item">
        <div class="t-name">${i + 1}. ${esc(p?.name || l.name)}</div>
        ${row(`${qty(l.qty)}${l.free ? ` + ${qty(l.free)} free` : ''} × ${dec(l.rate)}`, dec(calcLine(l).amount))}
        <div class="t-sub">${[l.batch && `B: ${esc(l.batch)}`, l.expiry && `Exp ${isoToExp(l.expiry)}`, l.mrp && `MRP ${dec(l.mrp)}`, l.cd && `CD ${dec(l.cd)}%`, `GST ${dec(l.gst)}%`].filter(Boolean).join(' · ')}</div>
      </div>`; }).join('')}
      <div class="t-hr"></div>
      ${row('Gross', dec(t.gross))}
      ${t.cd ? row('Less CD', '-' + dec(t.cd)) : ''}
      ${t.td ? row('Less TD', '-' + dec(t.td)) : ''}
      ${row('CGST', dec(t.cgst))}
      ${row('SGST', dec(t.sgst))}
      ${t.roundOff ? row('Round off', dec(t.roundOff)) : ''}
      ${row('NET', '₹ ' + dec(t.total), 't-net')}
      <div class="t-words">${esc(rupeesInWords(t.total))}</div>
      ${paid != null ? row('Paid', dec(paid)) + row('Balance', dec(Math.max(0, t.total - paid))) : ''}
      ${slabs.length ? `<div class="t-hr"></div><div class="t-sub">GST summary</div>${slabs.map(([k, s]) => row(`${k}%  on ${dec(s.taxable)}`, dec(s.gst), 't-small')).join('')}` : ''}
      <div class="t-hr"></div>
      <div class="t-c t-small">${isSale ? esc(f.terms || 'Goods once sold will be taken back only as per terms.') : ''}</div>
      <div class="t-c">${isSale ? 'Thank you! Get well soon.' : esc(f.name)}</div>
    </div>`;
  }

  // Bill preview with a paper size picker; Print uses the chosen size
  let currentBill = null;
  const renderBill = (args, size) => PRINT_SIZES[size].thermal ? billThermal(args) : billDoc(args);
  function billBody(args) {
    currentBill = args;
    const size = printSize();
    return `<div class="paper-bar no-print">
        <div class="seg paper-seg">${Object.entries(PRINT_SIZES).map(([k, v]) => `<label><input type="radio" name="paperSize" value="${k}" ${k === size ? 'checked' : ''}> ${v.label}</label>`).join('')}</div>
        <span class="small muted" id="paperHint">${esc(PRINT_SIZES[size].hint)}</span>
      </div>
      <div class="paper-wrap"><div class="paper paper-${size}" id="billPaper">${renderBill(args, size)}</div></div>`;
  }
  function setPaperSize(size) {
    if (!PRINT_SIZES[size] || !currentBill) return;
    db.settings.printSize = size; save();
    const el = $('#billPaper'); if (!el) return;
    el.className = `paper paper-${size}`; el.innerHTML = renderBill(currentBill, size);
    $('#paperHint').textContent = PRINT_SIZES[size].hint;
  }
  function printBill(sizeOverride) {
    const size = PRINT_SIZES[sizeOverride] ? sizeOverride : printSize(), cfg = PRINT_SIZES[size];
    let st = $('#pageRule');
    if (!st) { st = document.createElement('style'); st.id = 'pageRule'; document.head.appendChild(st); }
    // Thermal: no fixed page size, so the printer's own roll paper is used and the receipt is not padded to a full page
    st.textContent = cfg.thermal ? '@page { margin: 2mm; }' : `@page { size: ${cfg.page}; margin: ${cfg.margin}; }`;
    document.body.dataset.print = size;
    window.print();
  }
  const printBtn = () => `<button type="button" class="btn" data-act="print" data-id="">${icon('file')}Print</button>`;

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
    const s = existing || { party: preset.customerId ? { type: 'individual', customerId: preset.customerId } : { type: 'chemist', chemistId: preset.chemistId || '' }, date: todayIso, lines: preset.lines || [], paid: 0, mode: preset.customerId ? 'Cash' : 'Credit' };
    const custOpts = [['', '+ New customer'], ...[...(db.customers || [])].sort((a, b) => a.name.localeCompare(b.name)).map(c => [c.id, `${c.name}${c.phone ? ' — ' + c.phone : ''}`])];
    const chemOpts = [['', 'Select chemist'], ...db.chemists.filter(c => c.status === 'Active' || c.id === s.party.chemistId).map(c => [c.id, `${c.name} — ${c.city}`])];
    const isChem = s.party.type === 'chemist';
    openModal({
      title: existing ? `Edit sale bill ${existing.no}` : preset.orderId ? `Sale bill for order ${preset.orderId}` : preset.inquiryNo ? `Sale bill for enquiry ${preset.inquiryNo}` : 'New sale bill', size: 'xl', submitLabel: existing ? 'Save changes' : 'Create bill',
      body: `
        <div class="seg"><label><input type="radio" name="ptype" value="chemist" ${isChem ? 'checked' : ''}> Chemist (B2B)</label><label><input type="radio" name="ptype" value="individual" ${!isChem ? 'checked' : ''}> Individual / walk-in (B2C)</label></div>
        <div class="form-grid g4">
          <div class="field ${isChem ? '' : 'hidden'}" data-pt="chemist"><label for="f-chemistId">Chemist</label><select id="f-chemistId" name="chemistId">${chemOpts.map(([v, l]) => `<option value="${esc(v)}" ${v === (s.party.chemistId || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          <div class="field ${isChem ? 'hidden' : ''}" data-pt="individual"><label for="f-customerId">Customer</label><select id="f-customerId" name="customerId">${custOpts.map(([v, l]) => `<option value="${esc(v)}" ${v === (s.party.customerId || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          <div class="field ${isChem || s.party.customerId ? 'hidden' : ''}" data-pt="individual" data-newcust><label for="f-cname">New customer name</label><input id="f-cname" name="cname" value=""></div>
          <div class="field ${isChem || s.party.customerId ? 'hidden' : ''}" data-pt="individual" data-newcust><label for="f-cphone">Mobile</label><input id="f-cphone" name="cphone" type="tel" inputmode="numeric" maxlength="10" value=""></div>
          ${field('Bill date', 'date', { type: 'date', value: s.date, required: true, attrs: `max="${todayIso}"` })}
          ${field('Term', 'mode', { value: s.mode || 'Credit', options: ['Credit', 'Cash', 'UPI', 'Card'] })}
          <div class="field ${isChem ? 'hidden' : ''}" data-pt="individual"><label for="f-rx">Prescription (doctor, reg. no.)</label><input id="f-rx" name="rx" value="${esc(s.rx || '')}" placeholder="For Schedule H1 / X / NDPS items"></div>
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
        if (type === 'chemist' && !existing) {
          const ch = chem(d.chemistId), cc = agentCfg('compliance');
          if (cc.enabled && cc.blockExpired && ch?.dlValid && daysFrom(ch.dlValid) < 0 && !confirm(`${ch.name}'s drug licence expired on ${fmtDate(ch.dlValid)}. Selling to a chemist with an expired licence is not allowed.\n\nCreate the bill anyway?`)) return false;
        }
        if (type === 'individual' && !d.customerId && !String(d.cname || '').trim()) { toast('Choose the customer, or enter the new customer’s name.'); return false; }
        if (type === 'individual' && !d.customerId && d.cphone && !/^[6-9]\d{9}$/.test(d.cphone.trim())) { toast('Mobile must be a 10-digit number.'); return false; }
        const need = {};
        lines.forEach(l => { need[l.batchId] = (need[l.batchId] || 0) + l.qty + l.free; });
        for (const bid in need) {
          const b = batchById(bid);
          if (need[bid] > avail(b)) { toast(`Batch ${b.batch} of ${prod(b.productId).name} has only ${qty(avail(b))} in stock.`); return false; }
          if (b.blocked && !(existing && existing.lines.some(l => l.batchId === bid))) { toast(`Batch ${b.batch} of ${prod(b.productId).name} is blocked (${b.blockNote || 'drug alert'}) and cannot be billed.`); return false; }
        }
        if (type === 'chemist' && !existing) {
          const ch = chem(d.chemistId), cr = agentCfg('credit'), tot = billCalc(lines).total;
          const after = round2(chemOutstanding(ch.id) + tot - Math.min(tot, num(d.paid)));
          if (cr.enabled && cr.blockOverLimit && ch.creditLimit && after > ch.creditLimit && !confirm(`${ch.name}: this bill takes the outstanding to ${money(after)}, above the credit limit of ${money(ch.creditLimit)}.\n\nCreate the bill anyway?`)) return false;
        }
        if (type === 'individual' && agentCfg('h1').enabled && !String(d.rx || '').trim() && lines.some(l => regItem(prod(l.productId))) && !confirm('This bill has Schedule H1 / X / NDPS items. They need a prescription — enter the doctor’s name and registration number in “Prescription”.\n\nCreate the bill without it?')) return false;
        lines.forEach(deductLine);
        const t = billCalc(lines);
        let party;
        if (type === 'chemist') party = { type, chemistId: d.chemistId };
        else {
          let cu = custById(d.customerId);
          if (!cu) {
            const ph = String(d.cphone || '').trim();
            cu = (ph && db.customers.find(x => x.phone === ph)) || null;
            if (!cu) { cu = { id: nextId('U', db.customers), name: d.cname.trim(), phone: ph, joined: d.date }; db.customers.push(cu); }
          }
          party = { type, customerId: cu.id, name: cu.name, phone: cu.phone };
        }
        const paid = Math.min(t.total, round2(num(d.paid)));
        if (existing) {
          const hadPay = payList(existing).map(x => ({ ...x })), before = existing.total;
          Object.assign(existing, { date: d.date, party, lines, ...t, mode: d.mode, rx: type === 'individual' ? String(d.rx || '').trim() : '' });
          existing.payments = hadPay; existing.paid = round2(hadPay.reduce((a, x) => a + x.amount, 0));
          adjustPaid(existing, paid, 'Adjusted when the bill was edited');
          auditNote('Sale bill edited', existing.no, { before, amount: t.total, party: partyName(existing), billDate: existing.date });
          return `${existing.no} updated — stock adjusted.`;
        }
        const no = nextNo('SMS-', db.sales);
        db.sales.push({ no, date: d.date, party, lines, ...t, paid, payments: paid > 0 ? [{ date: d.date, amount: paid, mode: d.mode === 'Credit' ? 'Cash' : d.mode }] : [], mode: d.mode, ...(type === 'individual' && String(d.rx || '').trim() ? { rx: String(d.rx).trim() } : {}), ...(preset.orderId ? { orderId: preset.orderId } : {}), ...(preset.inquiryNo ? { inquiryNo: preset.inquiryNo } : {}) });
        if (preset.orderId) setOrder(preset.orderId, { status: 'Billed', saleNo: no });
        fireHook('sale.created', { no, date: d.date, party: type === 'chemist' ? chem(d.chemistId)?.name : party.name, total: t.total });
        if (preset.inquiryNo) { const q = db.inquiries.find(x => x.no === preset.inquiryNo); if (q) Object.assign(q, { status: 'Converted', saleNo: no, closedOn: todayIso }); }
        const c = type === 'chemist' ? chem(d.chemistId) : null;
        return c && chemOutstanding(c.id) > c.creditLimit ? `${no} created. Note: ${c.name} is now above their credit limit.` : `${no} created for ${money(t.total)} — stock deducted.`;
      },
    });
    $$('#lineBody tr[data-line]').forEach((tr, i) => { if (s.lines[i]) fillBatchOptions(tr, s.lines[i].batchId); });
    recalcSale();
    const showInfo = () => {
      const c = chem($('#f-chemistId').value);
      $('#chemInfo').innerHTML = c ? `Credit limit ${money(c.creditLimit)} · outstanding ${money(chemOutstanding(c.id))} · terms ${c.terms} days · default CD ${dec(c.cd)}% · ${gradePill(creditProfile(c.id))}` : '';
    };
    $('#f-chemistId').addEventListener('change', () => {
      showInfo();
      const d = partyDefaults();
      $$('#lineBody tr[data-line]').forEach(tr => { if ($('[data-f=productId]', tr).value) { $('[data-f=cd]', tr).value = d.cd; $('[data-f=td]', tr).value = d.td; } });
      recalcSale();
    });
    const syncNewCust = () => { const ind = $('#mform [name=ptype]:checked').value === 'individual'; $$('#mform [data-newcust]').forEach(el => el.classList.toggle('hidden', !ind || !!$('#f-customerId').value)); };
    $$('#mform [name=ptype]').forEach(r => r.addEventListener('change', () => {
      const t = $('#mform [name=ptype]:checked').value;
      $$('#mform [data-pt]').forEach(el => el.classList.toggle('hidden', el.dataset.pt !== t));
      $('#f-mode').value = t === 'individual' ? 'Cash' : 'Credit';
      syncNewCust();
    }));
    $('#f-customerId').addEventListener('change', syncNewCust);
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
  const saleReturns = no => (db.returns || []).filter(r => r.status !== 'Rejected' && r.lines.some(l => l.saleNo === no));
  ACTIONS['edit-sale'] = no => {
    const s = db.sales.find(x => x.no === no); if (!s) return;
    const rs = saleReturns(no);
    if (rs.length) { toast(`${no} has sales return ${rs.map(r => r.no).join(', ')}. Delete or reject the return before editing the bill.`); return; }
    saleModal(s);
  };
  ACTIONS['view-sale'] = no => {
    const s = db.sales.find(x => x.no === no); if (!s) return;
    const c = s.party.type === 'chemist' ? chem(s.party.chemistId) : null;
    const party = c
      ? { partyTitle: `M/S ${c.name}`, partyLines: [addrText(c), `DL No: ${dlText(c) || '—'}`, c.fssai && `FSSAI: ${c.fssai}`, `GSTIN: ${c.gstin || '—'}`, `Mob: ${c.phone}`] }
      : (() => { const cu = custById(s.party.customerId); return { partyTitle: cu?.name || s.party.name, partyLines: [cu && addrText(cu), `Mob: ${cu?.phone || s.party.phone || '—'}`] }; })();
    openModal({
      title: `Sale bill ${s.no}`, size: 'xl',
      extraFoot: `<div class="foot-left">${balance(s) > 0.5 ? `<button type="button" class="btn gold" data-act="pay-sale" data-id="${s.no}">Record payment</button>` : ''}${printBtn()}<button type="button" class="btn" data-act="edit-sale" data-id="${s.no}">Edit</button></div>`,
      body: billBody({ title: c && c.gstin ? 'TAX INVOICE' : 'SALE BILL', no: s.no, date: s.date, ...party, metaLines: [['Terms', s.mode || 'Credit'], ['Status', saleStatus(s)], ...(s.returned ? [['Returned', money2(s.returned)]] : []), ...(s.ewb ? [['e-Way bill', s.ewb]] : []), ...(s.vehicle ? [['Vehicle', s.vehicle]] : []), ...(s.irn ? [['IRN', s.irn.length > 24 ? s.irn.slice(0, 12) + '…' + s.irn.slice(-8) : s.irn]] : [])], lines: s.lines, t: s, paid: s.paid, isSale: true }),
    });
  };
  ACTIONS['pay-sale'] = no => {
    const s = db.sales.find(x => x.no === no); if (!s) return;
    openModal({
      title: `Receive payment · ${s.no}`, submitLabel: 'Save payment', size: 'sm',
      body: `${detailGrid([['Party', esc(partyName(s))], ['Bill total', money2(s.total)], ['Balance', money2(balance(s))]])}
        <div class="form-grid">
          ${field('Amount (₹)', 'amount', { type: 'number', value: balance(s), required: true, attrs: `min="0.01" max="${balance(s)}" step="0.01"` })}
          ${field('Date', 'date', { type: 'date', value: todayIso, required: true, attrs: `max="${todayIso}"` })}
          ${field('Mode', 'mode', { options: ['UPI', 'NEFT / RTGS', 'Cheque', 'Cash'] })}
          ${field('Reference (UTR / cheque no.)', 'ref', { value: '' })}
        </div>`,
      onSubmit: d => { const a = Math.min(num(d.amount), balance(s)); addPayment(s, a, d.date || todayIso, [d.mode, d.ref].filter(Boolean).join(' · ')); fireHook('payment.received', { bill: s.no, party: partyName(s), amount: a, date: d.date, mode: d.mode }); return `Payment of ${money(a)} recorded on ${s.no}.`; },
    });
  };
  ACTIONS['del-sale'] = no => {
    const s = db.sales.find(x => x.no === no); if (!s) return;
    if (saleReturns(no).length) { toast(`${no} has sales returns against it. Delete or reject them first.`); return; }
    confirmModal(`Delete ${s.no}?`, `This removes the bill for <b>${esc(partyName(s))}</b> (${money(s.total)}) and puts its ${s.lines.length} item line(s) back into stock. This cannot be undone.`, 'Delete bill', () => {
      s.lines.forEach(restoreLine); db.sales = db.sales.filter(x => x !== s); auditNote('Sale bill deleted', no, { amount: s.total, party: partyName(s), billDate: s.date }); return `${no} deleted — stock returned.`;
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
      ${field('Schedule', 'schedule', { value: p.schedule || '', options: RX_SCHEDULES })}
      ${field('NPPA ceiling price per pack, before GST (₹)', 'ceiling', { type: 'number', value: p.ceiling || '', attrs: numAttrs() + ' placeholder="Only for scheduled (DPCO) medicines"' })}
      <div class="field"><label>&nbsp;</label><label class="check-line"><input type="checkbox" name="dpco" ${p.dpco ? 'checked' : ''}> Scheduled formulation under DPCO (NLEM)</label></div>
      <div class="field"><label>&nbsp;</label><label class="check-line"><input type="checkbox" name="cold" ${isCold(p) ? 'checked' : ''}> Cold chain — store at 2–8 °C</label></div>
    </div>`;
  }
  function readProduct(d, p) {
    Object.assign(p, {
      name: norm(d.name), companyId: findOrCreateCompany(d.company), mfg: d.mfg.trim(), categoryId: d.categoryId, form: d.form, pack: d.pack.trim(), hsn: d.hsn.trim(), salt: (d.salt || '').trim(),
      gst: num(d.gst), mrp: round2(num(d.mrp)), ptr: round2(num(d.ptr)), pts: round2(num(d.pts)), reorder: Math.floor(num(d.reorder)),
      schedule: d.schedule || '', ceiling: round2(num(d.ceiling)) || 0, dpco: !!d.dpco || num(d.ceiling) > 0, cold: !!d.cold,
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
      ${field('Mobile', 'phone', { type: 'tel', value: c.phone || '', required: true, attrs: 'pattern="[6-9][0-9]{9}" inputmode="numeric" maxlength="10" title="10-digit mobile number"' })}
      ${field('Email', 'email', { type: 'email', value: c.email || '', attrs: 'autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="used as the portal login ID"' })}
      ${addrFields(c, true)}
      ${licFields(c, true)}
      <div class="field full form-sec">Credit &amp; discount</div>
      ${field('Credit limit (₹)', 'creditLimit', { type: 'number', value: c.creditLimit ?? 100000, required: true, attrs: numAttrs('1') })}
      ${field('Payment terms (days)', 'terms', { type: 'number', value: c.terms ?? 14, required: true, attrs: numAttrs('1') })}
      ${field('Default CD %', 'cd', { type: 'number', value: c.cd ?? db.settings.defaultCd ?? 0, attrs: numAttrs() })}
      ${field('Default TD %', 'td', { type: 'number', value: c.td ?? 0, attrs: numAttrs() })}
    </div>`;
  const readChemist = (d, c) => Object.assign(c, { name: d.name.trim(), owner: d.owner.trim(), phone: d.phone, email: String(d.email || '').trim().toLowerCase(), ...readAddr(d), ...readLic(d), creditLimit: num(d.creditLimit), terms: num(d.terms), cd: num(d.cd), td: num(d.td) });
  // Portal login section inside the chemist form: optional when onboarding, edits the login when it exists
  const chemistPortalBlock = (c, isNew) => !SERVER ? '' : `<div class="field full form-sec">Portal login</div>
    <label class="check-line field full"><input type="checkbox" name="pWant" id="pWant" ${portalLogins[c.id] ? 'checked disabled' : isNew ? 'checked' : ''}> ${portalLogins[c.id] ? 'Has a portal login' : 'Create a portal login for this chemist'}</label>
    <div id="pBlock" class="field full ${portalLogins[c.id] || isNew ? '' : 'hidden'}">${portalFields(c, portalLogins[c.id])}</div>`;
  function afterChemistSave(c, d) {
    if (!SERVER) return;
    const l = portalLogins[c.id];
    if (!l && !d.pWant) return;
    if (l && !d.pPass && String(d.pUser || '').trim().toLowerCase() === l.username && !!d.pActive === l.active) return;
    if (!l && !d.pPass) { toast(`${c.name} saved without a portal login (no password set).`); return; }
    savePortalLogin(c, d).then(msg => { render(); if (d.pPass) showNotice(msg); else toast(msg); }).catch(err => toast(`${c.name} was saved, but the login was not: ${err.message}`));
  }
  const portalFieldsOk = d => {
    if (!SERVER || !(d.pWant || d.pUser)) return true;
    if (!(d.pWant || portalLogins[d._id])) return true;
    if (!LOGIN_ID_RE.test(String(d.pUser || '').trim().toLowerCase())) { toast('Login ID: an email address, or 3–100 letters, numbers, dot, dash, underscore or @.'); return false; }
    if (!portalLogins[d._id] && !d.pPass) { toast('Set a password for the new login — fill in the mobile number, or type a password.'); return false; }
    if (d.pPass && d.pPass.length < 8) { toast('The password must be at least 8 characters.'); return false; }
    return true;
  };
  ACTIONS['new-chemist'] = () => {
    openModal({
      title: 'Onboard a chemist', submitLabel: 'Onboard', size: 'lg',
      body: chemistForm() + `<div class="form-grid"><div class="field full form-sec">Status</div>
          ${field('Status', 'status', { value: 'Pending verification', options: ['Pending verification', 'Active'] })}
          <div class="field small muted status-note">Choose “Pending verification” until the drug licence is checked. Only Active chemists can be billed and can sign in to the portal.</div>
          ${chemistPortalBlock({}, true)}</div>`,
      onSubmit: d => {
        if (!addrOk(d) || (d.pWant && !portalFieldsOk(d))) return false;
        const c = { id: nextId('C', db.chemists), joined: todayIso, status: d.status === 'Active' ? 'Active' : 'Pending verification' };
        readChemist(d, c); db.chemists.push(c); fileLicence('chemist', c.id);
        afterChemistSave(c, d);
        return `${c.name} onboarded — ${c.status.toLowerCase()}.`;
      },
    });
    $('#pWant')?.addEventListener('change', e => { $('#pBlock').classList.toggle('hidden', !e.target.checked); syncLoginDefaults(); });
  };
  ACTIONS['edit-chemist'] = id => {
    const c = chem(id); if (!c) return;
    openModal({
      title: `Edit ${c.name}`, size: 'lg', body: chemistForm(c) + (SERVER ? `<div class="form-grid">${chemistPortalBlock(c)}</div>` : ''),
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
      extraFoot: `<div class="foot-left">${btns}<button type="button" class="btn" data-act="open-ledger" data-id="chemist|${c.id}">Ledger</button><button type="button" class="btn" data-act="edit-chemist" data-id="${c.id}">Edit</button>${SERVER ? `<button type="button" class="btn" data-act="portal-login" data-id="${c.id}">${portalLogins[c.id] ? 'Portal login' : 'Create portal login'}</button>` : ''}</div>`,
      body: `${detailGrid([['Owner', esc(c.owner)], ['Mobile', esc(c.phone)], ['Address', esc(addrText(c) || '—')], ['Nearby hospital', esc(c.hospital || '—')], ['Drug licence 1', esc(c.dl1 || '—')], ['Drug licence 2', esc(c.dl2 || '—')], ['Drug licence valid upto', licValid(c)], ['FSSAI no.', esc(c.fssai || '—')], ['FSSAI valid upto', fssaiValid(c)], ['GSTIN', esc(c.gstin || '—')], ['Licence copies', licDocsBtn('chemist', c.id)], ['Status', pill(c.status)], ['Credit limit', money(c.creditLimit)], ['Outstanding', money(chemOutstanding(c.id))], ['Default CD / TD', `${dec(c.cd)}% / ${dec(c.td)}%`], ...(SERVER ? [['Portal login', portalCell(c)], ['Portal orders', String(chemOrders.filter(o => o.chemistId === c.id).length)]] : [])])}
        <div class="card-title" style="font-size:15px">Bills (${inv.length})</div>
        ${miniTable([{ h: 'Bill', c: s => s.no }, { h: 'Date', c: s => fmtDate(s.date) }, { h: 'Amount', r: 1, c: s => money(s.total) }, { h: 'Balance', r: 1, c: s => money(balance(s)) }, { h: 'Status', c: s => pill(saleStatus(s)) }], inv.slice(0, 12))}`,
    });
  };
  // Hospital directory
  const hospitalForm = (h = {}) => `<div class="form-grid">
      ${field('Name', 'name', { value: h.name || '', required: true, full: true, attrs: 'placeholder="e.g. CHC Bharari"' })}
      ${field('Type', 'type', { value: h.type || 'PHC', options: HOSP_TYPES })}
      ${field('District', 'district', { value: h.district || '', required: true, attrs: 'list="dl-a-district" autocomplete="off"' })}
      ${field('Tehsil / block', 'tehsil', { value: h.tehsil || '', attrs: 'list="dl-a-tehsil" autocomplete="off"' })}
      ${field('Village / locality', 'locality', { value: h.locality || '', attrs: 'list="dl-a-locality" autocomplete="off"' })}
      ${field('PIN code', 'pincode', { value: h.pincode || '', attrs: 'pattern="[1-9][0-9]{5}" inputmode="numeric" maxlength="6"' })}
      ${field('Hospital phone / landline', 'phone', { value: h.phone || '' })}
      <div class="field full form-sec">Contacts</div>
      ${field('Head of hospital (name)', 'headName', { value: h.headName || '', attrs: 'placeholder="e.g. BMO / SMO / Principal"' })}
      ${field('Head of hospital — mobile', 'headMobile', { type: 'tel', value: h.headMobile || '', attrs: 'pattern=\"[6-9][0-9]{9}\" inputmode=\"numeric\" maxlength=\"10\" title=\"10-digit mobile number\"' })}
      ${field('Pharmacist (name)', 'pharmName', { value: h.pharmName || '' })}
      ${field('Pharmacist — mobile', 'pharmMobile', { type: 'tel', value: h.pharmMobile || '', attrs: 'pattern=\"[6-9][0-9]{9}\" inputmode=\"numeric\" maxlength=\"10\" title=\"10-digit mobile number\"' })}
      <datalist id="dl-a-district">${dlOptions(HP_DISTRICTS)}</datalist>
      <datalist id="dl-a-tehsil">${dlOptions(usedValues('tehsil', h.district))}</datalist>
      <datalist id="dl-a-locality">${dlOptions(usedValues('locality', h.district))}</datalist>
    </div>`;
  const readHospital = (d, h) => Object.assign(h, { name: d.name.trim(), type: d.type, district: d.district.trim(), tehsil: (d.tehsil || '').trim(), locality: (d.locality || '').trim(), pincode: (d.pincode || '').trim(), phone: (d.phone || '').trim(), headName: (d.headName || '').trim(), headMobile: (d.headMobile || '').trim(), pharmName: (d.pharmName || '').trim(), pharmMobile: (d.pharmMobile || '').trim() });
  const telLink = v => v ? `<a href="tel:${esc(String(v).replace(/[^\d+]/g, ''))}">${esc(v)}</a>` : '—';
  const contactHtml = (name, mob) => name || mob ? `${name ? `<span>${esc(name)}</span>` : ''}${mob ? `<div class="small">${telLink(mob)}</div>` : ''}` : '<span class="muted">—</span>';
  const hospDup = (d, self) => (db.hospitals || []).find(x => x !== self && norm(x.name) === norm(d.name) && norm(x.district) === norm(d.district));
  ACTIONS['new-hospital'] = () => openModal({
    title: 'Add hospital / health centre', submitLabel: 'Add', body: hospitalForm(),
    onSubmit: d => { if (hospDup(d)) { toast(`${d.name} is already in ${d.district}.`); return false; } const h = { id: nextId('H', db.hospitals, 4), source: 'Added by you' }; readHospital(d, h); db.hospitals.push(h); return `${h.name} added.`; },
  });
  ACTIONS['edit-hospital'] = id => {
    const h = hospById(id); if (!h) return;
    openModal({
      title: `Edit ${h.name}`, body: hospitalForm(h),
      onSubmit: d => {
        if (hospDup(d, h)) { toast(`${d.name} is already in ${d.district}.`); return false; }
        readHospital(d, h); if (h.source === 'HPPCB list' || /verify/i.test(h.source || '')) h.source = 'Checked by you';
        [...addrHolders(), ...(db.doctors || [])].forEach(x => { if (x.hospitalId === h.id) x.hospital = h.name; });
        return `${h.name} saved.`;
      },
    });
  };
  function deleteHospitals(items) {
    const ids = new Set(items.map(h => h.id));
    const linked = [...addrHolders(), ...(db.doctors || [])].filter(x => ids.has(x.hospitalId)).length;
    confirmModal(`Delete ${items.length === 1 ? items[0].name : items.length + ' hospitals'}?`, `${linked ? `${linked} chemist/supplier record(s) point to ${items.length === 1 ? 'it' : 'them'} (chemists, suppliers or doctors); they will keep the hospital name but no longer link to the directory. ` : ''}This cannot be undone.`, 'Delete', () => {
      [...addrHolders(), ...(db.doctors || [])].forEach(x => { if (ids.has(x.hospitalId)) x.hospitalId = ''; });
      db.hospitals = db.hospitals.filter(h => !ids.has(h.id));
      if (listState.hospitals) listState.hospitals.sel.clear();
      return `${items.length} deleted.`;
    });
  }
  ACTIONS['del-hospital'] = id => { const h = hospById(id); if (h) deleteHospitals([h]); };
  ACTIONS['view-hospital'] = id => {
    const h = hospById(id); if (!h) return;
    const near = nearChemists(h);
    const docs = (db.doctors || []).filter(d => d.hospitalId === h.id).sort((a, b) => a.name.localeCompare(b.name));
    const sameArea = db.chemists.filter(c => !near.includes(c) && h.tehsil && norm(c.tehsil) === norm(h.tehsil) && norm(c.district) === norm(h.district));
    const chemCols = [{ h: 'Chemist', c: c => `<a href="#" data-act="view-chemist" data-id="${esc(c.id)}">${esc(c.name)}</a>` }, { h: 'Village / locality', c: c => esc(c.locality || c.city || '—') }, { h: 'Mobile', c: c => esc(c.phone) }, { h: 'Status', c: c => pill(c.status) }, { h: 'Outstanding', r: 1, c: c => money(chemOutstanding(c.id)) }];
    openModal({
      title: h.name, size: 'lg',
      extraFoot: `<div class="foot-left"><button type="button" class="btn" data-act="edit-hospital" data-id="${esc(h.id)}">Edit</button><button type="button" class="btn" data-act="new-doctor" data-id="${esc(h.id)}">Add doctor here</button></div>`,
      body: `${detailGrid([['Type', pill(h.type)], ['District', esc(h.district || '—')], ['Tehsil / block', esc(h.tehsil || '—')], ['Village / locality', esc(h.locality || '—')], ['PIN', esc(h.pincode || '—')], ['Hospital phone', telLink(h.phone)], ['Head of hospital', contactHtml(h.headName, h.headMobile)], ['Pharmacist', contactHtml(h.pharmName, h.pharmMobile)], ['Source', esc(h.source || '—')]])}
        <div class="card-title" style="font-size:15px">Doctors working here (${docs.length})</div>
        ${docs.length ? miniTable([{ h: 'Doctor', c: d => `<a href="#" data-act="view-doctor" data-id="${esc(d.id)}">${esc(d.name)}</a>` }, { h: 'Designation', c: d => esc(d.designation || '—') }, { h: 'Specialization', c: d => esc(d.specialization || '—') }, { h: 'Mobile', c: d => telLink(d.mobile) }], docs) : '<div class="small muted">No doctors saved for this hospital yet.</div>'}
        <div class="card-title" style="font-size:15px">Chemists with this as nearby hospital (${near.length})</div>
        ${near.length ? miniTable(chemCols, near) : '<div class="small muted">None yet. Set it as “Nearby hospital” when onboarding or editing a chemist.</div>'}
        ${sameArea.length ? `<div class="card-title" style="font-size:15px">Other chemists in ${esc(h.tehsil)} (${sameArea.length})</div>${miniTable(chemCols, sameArea)}` : ''}`,
    });
  };
  const HOSP_CSV = ['name', 'type', 'district', 'tehsil', 'locality', 'pincode', 'phone', 'headName', 'headMobile', 'pharmName', 'pharmMobile'];
  ACTIONS['hosp-export'] = () => downloadText(`hospital-directory-${todayIso}.csv`, [HOSP_CSV.join(','), ...listRows('hospitals').map(h => HOSP_CSV.map(k => csvCell(h[k])).join(','))].join('\r\n'));
  function importHospitals(text) {
    const rows = parseCsv(text.replace(/^﻿/, ''));
    if (rows.length < 2) throw new Error('The CSV has no rows.');
    const head = rows[0].map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
    const alias = { name: 'name', hospital: 'name', facility: 'name', facilityname: 'name', type: 'type', facilitytype: 'type', district: 'district', tehsil: 'tehsil', block: 'tehsil', subdistrict: 'tehsil', locality: 'locality', village: 'locality', place: 'locality', pincode: 'pincode', pin: 'pincode', phone: 'phone', landline: 'phone', headname: 'headName', head: 'headName', headofhospital: 'headName', headmobile: 'headMobile', headofhospitalmobile: 'headMobile', pharmname: 'pharmName', pharmacist: 'pharmName', pharmacistname: 'pharmName', pharmmobile: 'pharmMobile', pharmacistmobile: 'pharmMobile' };
    const map = head.map(h => alias[h] || null);
    if (!map.includes('name') || !map.includes('district')) throw new Error('The CSV needs at least “name” and “district” columns.');
    let added = 0, updated = 0;
    rows.slice(1).forEach(r => {
      const d = {}; map.forEach((k, i) => { if (k) d[k] = String(r[i] ?? '').trim(); });
      if (!d.name || !d.district) return;
      const dist = HP_DISTRICTS.find(x => norm(x) === norm(d.district)) || d.district;
      const type = HOSP_TYPES.find(t => norm(t) === norm(d.type)) || (/\bPHC\b/i.test(d.type + ' ' + d.name) ? 'PHC' : /\bCHC\b/i.test(d.type + ' ' + d.name) ? 'CHC' : /civil/i.test(d.type + ' ' + d.name) ? 'Civil Hospital' : 'Other');
      const ex = db.hospitals.find(h => norm(h.name) === norm(d.name) && norm(h.district) === norm(dist));
      const vals = { name: d.name, type, district: dist, tehsil: d.tehsil || ex?.tehsil || '', locality: d.locality || ex?.locality || '', pincode: d.pincode || ex?.pincode || '', phone: d.phone || ex?.phone || '', headName: d.headName || ex?.headName || '', headMobile: d.headMobile || ex?.headMobile || '', pharmName: d.pharmName || ex?.pharmName || '', pharmMobile: d.pharmMobile || ex?.pharmMobile || '' };
      if (ex) { Object.assign(ex, vals); updated++; } else { db.hospitals.push({ id: nextId('H', db.hospitals, 4), ...vals, source: 'Imported' }); added++; }
    });
    return { added, updated };
  }

  // Doctors directory
  const DOC_SPECS = ['Medical Officer (General)', 'General Medicine', 'General Surgery', 'Paediatrics', 'Obstetrics & Gynaecology', 'Orthopaedics', 'ENT', 'Ophthalmology', 'Dermatology', 'Psychiatry', 'Anaesthesia', 'Radiology', 'Pathology', 'Cardiology', 'Neurology', 'Nephrology', 'Gastroenterology', 'Pulmonology / Chest', 'Endocrinology / Diabetes', 'Oncology', 'Urology', 'Community Medicine', 'Dental', 'Ayurveda', 'Homoeopathy', 'Other'];
  const DOC_DESIGS = ['Medical Officer', 'Senior Medical Officer', 'Block Medical Officer', 'Chief Medical Officer', 'Medical Superintendent', 'Specialist', 'Principal', 'Professor', 'Associate Professor', 'Assistant Professor', 'Senior Resident', 'Junior Resident', 'Dental Officer', 'Ayurvedic Medical Officer', 'Private Practitioner', 'Other'];
  const doctorById = id => (db.doctors || []).find(d => d.id === id);
  const doctorForm = (d = {}) => {
    const dist = docDistrict(d);
    return `<div class="form-grid">
      ${field('Doctor name', 'name', { value: d.name || '', required: true, attrs: 'placeholder="e.g. Dr. A. Sharma"' })}
      ${field('Mobile', 'mobile', { type: 'tel', value: d.mobile || '', attrs: 'pattern="[6-9][0-9]{9}" inputmode="numeric" maxlength="10" title="10-digit mobile number"' })}
      ${field('Designation', 'designation', { value: d.designation || '', attrs: 'list="dl-doc-desig" autocomplete="off" placeholder="e.g. Medical Officer"' })}
      ${field('Specialization', 'specialization', { value: d.specialization || '', required: true, attrs: 'list="dl-doc-spec" autocomplete="off" placeholder="e.g. Paediatrics"' })}
      ${field('Qualification', 'qualification', { value: d.qualification || '', attrs: 'placeholder="e.g. MBBS, MD (Paediatrics)"' })}
      ${field('Email', 'email', { type: 'email', value: d.email || '' })}
      <div class="field full form-sec">Working at</div>
      ${field('District', 'district', { value: dist, attrs: 'list="dl-a-district" autocomplete="off"' })}
      ${field('Tehsil (optional, to list its hospitals first)', 'tehsil', { value: docHosp(d)?.tehsil || '', attrs: 'list="dl-a-tehsil" autocomplete="off"' })}
      ${hospSearchBox('always', 'Hospital where they work')}
      <div class="hidden"><select id="f-hospitalId" name="hospitalId" aria-hidden="true" tabindex="-1">${hospitalOptions(dist, docHosp(d)?.tehsil || '', d.hospitalId || (d.hospital ? '__other' : ''))}</select></div>
      <div class="field full ${d.hospital && !d.hospitalId ? '' : 'hidden'}" id="hospOtherWrap"><label for="f-hospitalOther">Hospital / clinic name (it will be added to the directory)</label><input id="f-hospitalOther" name="hospitalOther" value="${esc(d.hospital && !d.hospitalId ? d.hospital : '')}"></div>
      ${field('Notes', 'notes', { value: d.notes || '', full: true, attrs: 'placeholder="OPD days, preferred brands, visit notes…"' })}
      <datalist id="dl-doc-spec">${dlOptions(DOC_SPECS)}</datalist>
      <datalist id="dl-doc-desig">${dlOptions(DOC_DESIGS)}</datalist>
      <datalist id="dl-a-district">${dlOptions(HP_DISTRICTS)}</datalist>
      <datalist id="dl-a-tehsil">${dlOptions(usedValues('tehsil', dist))}</datalist>
    </div>`;
  };
  function readDoctor(f, d) {
    const area = { district: (f.district || '').trim(), tehsil: (f.tehsil || '').trim() };
    const h = resolveHospital(f, area);
    Object.assign(d, { name: f.name.trim(), mobile: (f.mobile || '').trim(), designation: (f.designation || '').trim(), specialization: (f.specialization || '').trim(), qualification: (f.qualification || '').trim(), email: (f.email || '').trim(), notes: (f.notes || '').trim(), district: hospById(h.hospitalId)?.district || area.district, ...h });
  }
  const doctorOk = (f, self) => {
    if (f.mobile && (db.doctors || []).some(x => x !== self && x.mobile === f.mobile.trim())) { toast(`Mobile ${f.mobile} is already saved for ${(db.doctors || []).find(x => x !== self && x.mobile === f.mobile.trim()).name}.`); return false; }
    if (f.hospitalId === '__other' && !String(f.hospitalOther || '').trim()) { toast('Type the hospital or clinic name, or pick one from the list.'); return false; }
    return true;
  };
  ACTIONS['new-doctor'] = presetHosp => {
    const h = hospById(presetHosp);
    openModal({
      title: 'Add doctor', size: 'lg', submitLabel: 'Add doctor', body: doctorForm(h ? { hospitalId: h.id, district: h.district } : {}),
      onSubmit: f => { if (!doctorOk(f)) return false; const d = { id: nextId('D', db.doctors, 4), added: todayIso }; readDoctor(f, d); db.doctors.push(d); return `${d.name} added${d.hospital ? ' at ' + d.hospital : ''}.`; },
    });
    refreshHospitalSelect();
  };
  ACTIONS['edit-doctor'] = id => {
    const d = doctorById(id); if (!d) return;
    openModal({ title: `Edit ${d.name}`, size: 'lg', body: doctorForm(d), onSubmit: f => { if (!doctorOk(f, d)) return false; readDoctor(f, d); return `${d.name} saved.`; } });
    refreshHospitalSelect();
  };
  function deleteDoctors(items) {
    confirmModal(`Delete ${items.length === 1 ? items[0].name : items.length + ' doctors'}?`, 'This cannot be undone.', 'Delete', () => {
      const ids = new Set(items.map(d => d.id)); db.doctors = db.doctors.filter(d => !ids.has(d.id));
      if (listState.doctors) listState.doctors.sel.clear();
      return `${items.length} deleted.`;
    });
  }
  ACTIONS['del-doctor'] = id => { const d = doctorById(id); if (d) deleteDoctors([d]); };
  ACTIONS['view-doctor'] = id => {
    const d = doctorById(id); if (!d) return;
    const h = docHosp(d);
    const near = h ? nearChemists(h) : [];
    openModal({
      title: d.name, size: 'lg',
      extraFoot: `<div class="foot-left"><button type="button" class="btn" data-act="edit-doctor" data-id="${esc(d.id)}">Edit</button>${h ? `<button type="button" class="btn" data-act="view-hospital" data-id="${esc(h.id)}">Open hospital</button>` : ''}</div>`,
      body: `${detailGrid([['Designation', esc(d.designation || '—')], ['Specialization', esc(d.specialization || '—')], ['Qualification', esc(d.qualification || '—')], ['Mobile', telLink(d.mobile)], ['Email', d.email ? `<a href="mailto:${esc(d.email)}">${esc(d.email)}</a>` : '—'], ['Hospital', esc(h?.name || d.hospital || '—')], ['Hospital type', esc(h?.type || '—')], ['District', esc(docDistrict(d) || '—')], ['Tehsil / block', esc(h?.tehsil || '—')]])}
        ${d.notes ? `<div><div class="small muted">Notes</div><div>${esc(d.notes)}</div></div>` : ''}
        ${h ? `<div class="card-title" style="font-size:15px">Chemists near ${esc(h.name)} (${near.length})</div>${near.length ? miniTable([{ h: 'Chemist', c: c => `<a href="#" data-act="view-chemist" data-id="${esc(c.id)}">${esc(c.name)}</a>` }, { h: 'Village / locality', c: c => esc(c.locality || c.city || '—') }, { h: 'Mobile', c: c => telLink(c.phone) }], near) : '<div class="small muted">No chemist has this hospital as nearby hospital yet.</div>'}` : ''}`,
    });
  };
  const DOC_CSV = ['name', 'designation', 'specialization', 'qualification', 'mobile', 'email', 'hospital', 'district', 'notes'];
  ACTIONS['doc-export'] = () => downloadText(`doctors-directory-${todayIso}.csv`, [DOC_CSV.join(','), ...listRows('doctors').map(d => DOC_CSV.map(k => csvCell(k === 'hospital' ? (docHosp(d)?.name || d.hospital) : k === 'district' ? docDistrict(d) : d[k])).join(','))].join('\r\n'));
  function importDoctors(text) {
    const rows = parseCsv(text.replace(/^﻿/, ''));
    if (rows.length < 2) throw new Error('The CSV has no rows.');
    const head = rows[0].map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
    const alias = { name: 'name', doctor: 'name', doctorname: 'name', designation: 'designation', post: 'designation', specialization: 'specialization', specialisation: 'specialization', speciality: 'specialization', specialty: 'specialization', qualification: 'qualification', degree: 'qualification', mobile: 'mobile', phone: 'mobile', mobileno: 'mobile', email: 'email', hospital: 'hospital', hospitalname: 'hospital', workingat: 'hospital', district: 'district', notes: 'notes' };
    const map = head.map(h => alias[h] || null);
    if (!map.includes('name')) throw new Error('The CSV needs a “name” column.');
    let added = 0, updated = 0, newHosp = 0;
    rows.slice(1).forEach(r => {
      const f = {}; map.forEach((k, i) => { if (k) f[k] = String(r[i] ?? '').trim(); });
      if (!f.name) return;
      const mobile = f.mobile ? f.mobile.replace(/\D/g, '').replace(/^(91|0)(?=[6-9]\d{9}$)/, '') : '';
      const district = HP_DISTRICTS.find(x => norm(x) === norm(f.district)) || f.district || '';
      let h = f.hospital ? (db.hospitals || []).filter(x => norm(x.name) === norm(f.hospital)).sort((a, b) => (norm(b.district) === norm(district)) - (norm(a.district) === norm(district)))[0] : null;
      if (f.hospital && !h) { h = { id: nextId('H', db.hospitals, 4), name: f.hospital, type: 'Other', district, tehsil: '', locality: '', pincode: '', source: 'Imported with doctors' }; db.hospitals.push(h); newHosp++; }
      const vals = { name: f.name, designation: f.designation || '', specialization: f.specialization || '', qualification: f.qualification || '', mobile, email: f.email || '', notes: f.notes || '', hospitalId: h?.id || '', hospital: h?.name || '', district: h?.district || district };
      const ex = (db.doctors || []).find(x => (mobile && x.mobile === mobile) || (norm(x.name) === norm(f.name) && x.hospitalId === vals.hospitalId));
      if (ex) { Object.keys(vals).forEach(k => { if (vals[k]) ex[k] = vals[k]; }); updated++; } else { db.doctors.push({ id: nextId('D', db.doctors, 4), added: todayIso, ...vals }); added++; }
    });
    return { added, updated, newHosp };
  }

  // ---------- Customers ----------
  const customerForm = (c = {}) => `<div class="form-grid">
      ${field('Customer name', 'name', { value: c.name || '', required: true })}
      ${field('Mobile', 'phone', { type: 'tel', value: c.phone || '', attrs: 'pattern="[6-9][0-9]{9}" inputmode="numeric" maxlength="10" title="10-digit mobile number"' })}
      ${field('Email', 'email', { type: 'email', value: c.email || '' })}
      ${field('Notes', 'notes', { value: c.notes || '', attrs: 'placeholder="Regular medicines, doctor, preferences…"' })}
      ${addrFields(c, false)}
    </div>`;
  const readCustomer = (d, c) => Object.assign(c, { name: d.name.trim(), phone: (d.phone || '').trim(), email: (d.email || '').trim().toLowerCase(), notes: (d.notes || '').trim(), ...readAddr(d) });
  const customerDup = (d, self) => d.phone && (db.customers || []).find(x => x !== self && x.phone === d.phone.trim());
  ACTIONS['new-customer'] = () => openModal({
    title: 'Add customer', size: 'lg', submitLabel: 'Add customer', body: customerForm(),
    onSubmit: d => { const dup = customerDup(d); if (dup) { toast(`Mobile ${d.phone} is already saved for ${dup.name}.`); return false; } if (!addrOk(d)) return false; const c = { id: nextId('U', db.customers), joined: todayIso }; readCustomer(d, c); db.customers.push(c); return `${c.name} added.`; },
  });
  ACTIONS['edit-customer'] = id => {
    const c = custById(id); if (!c) return;
    openModal({ title: `Edit ${c.name}`, size: 'lg', body: customerForm(c), onSubmit: d => { const dup = customerDup(d, c); if (dup) { toast(`Mobile ${d.phone} is already saved for ${dup.name}.`); return false; } if (!addrOk(d)) return false; readCustomer(d, c); db.sales.filter(x => x.party.customerId === c.id).forEach(x => { x.party.name = c.name; x.party.phone = c.phone; }); return `${c.name} saved.`; } });
  };
  ACTIONS['del-customer'] = id => {
    const c = custById(id); if (!c) return;
    const n = custSales(id).length + (db.returns || []).filter(r => r.party.customerId === id).length + (db.inquiries || []).filter(q => q.party.customerId === id).length;
    if (n) { toast(`${c.name} has ${n} bill(s), return(s) or enquiries, so the record can’t be deleted.`); return; }
    confirmModal(`Delete ${c.name}?`, 'This cannot be undone.', 'Delete customer', () => { db.customers = db.customers.filter(x => x !== c); return `${c.name} deleted.`; });
  };
  ACTIONS['view-customer'] = id => {
    const c = custById(id); if (!c) return;
    const bills = custSales(id).sort((a, b) => b.date.localeCompare(a.date));
    openModal({
      title: c.name, size: 'lg',
      extraFoot: `<div class="foot-left"><button type="button" class="btn primary" data-act="sale-for-customer" data-id="${esc(c.id)}">New sale</button><button type="button" class="btn" data-act="open-ledger" data-id="customer|${esc(c.id)}">Ledger</button><button type="button" class="btn" data-act="edit-customer" data-id="${esc(c.id)}">Edit</button></div>`,
      body: `${detailGrid([['Mobile', telLink(c.phone)], ['Email', esc(c.email || '—')], ['Address', esc(addrText(c) || '—')], ['Nearby hospital', esc(hospitalName(c) || '—')], ['Customer since', fmtDate(c.joined)], ['Purchases', money(bills.reduce((a, x) => a + x.total, 0))], ['Balance', (b => b < -0.5 ? `${money(-b)} credit` : money(b))(partyDue(bills))], ['Notes', esc(c.notes || '—')]])}
        <div class="card-title" style="font-size:15px">Bills (${bills.length})</div>
        ${miniTable([{ h: 'Bill', c: x => `<a href="#" data-act="view-sale" data-id="${esc(x.no)}">${esc(x.no)}</a>` }, { h: 'Date', c: x => fmtDate(x.date) }, { h: 'Items', r: 1, c: x => x.lines.length }, { h: 'Amount', r: 1, c: x => money(x.total) }, { h: 'Balance', r: 1, c: x => money(balance(x)) }, { h: 'Status', c: x => pill(saleStatus(x)) }], bills.slice(0, 15))}`,
    });
  };
  ACTIONS['sale-for-customer'] = id => { if (custById(id)) saleModal(null, { customerId: id }); };

  // ---------- Enquiries ----------
  const inqRow = (it = {}) => `<tr data-iline>
      <td><input data-i="name" list="dl-products" value="${esc(it.name || '')}" placeholder="Item name (type or pick)" autocomplete="off"></td>
      <td><input data-i="qty" type="number" min="1" step="1" value="${esc(it.qty || 1)}" style="width:80px"></td>
      <td><input data-i="note" value="${esc(it.note || '')}" placeholder="Strength, brand, rate asked…"></td>
      <td><button type="button" class="btn ghost sm" data-rm-iline aria-label="Remove">✕</button></td></tr>`;
  function inquiryModal(q) {
    const e = q || { party: { type: 'chemist' }, date: todayIso, source: 'Phone call', status: 'Open', items: [], followUp: addDays(todayIso, 2) };
    const pt = e.party.type;
    openModal({
      title: q ? `Edit enquiry ${q.no}` : 'New enquiry', size: 'xl', submitLabel: q ? 'Save enquiry' : 'Save enquiry',
      body: `<div class="seg"><label><input type="radio" name="itype" value="chemist" ${pt === 'chemist' ? 'checked' : ''}> Chemist</label><label><input type="radio" name="itype" value="customer" ${pt === 'customer' ? 'checked' : ''}> Customer</label><label><input type="radio" name="itype" value="new" ${pt === 'new' ? 'checked' : ''}> New person</label></div>
        <div class="form-grid g4">
          <div class="field ${pt === 'chemist' ? '' : 'hidden'}" data-it="chemist"><label for="f-iChem">Chemist</label><select id="f-iChem" name="iChem"><option value="">Select chemist</option>${db.chemists.map(c => [c.id, `${c.name} — ${c.city || ''}`]).sort(byName).map(([v, l]) => `<option value="${esc(v)}" ${v === e.party.chemistId ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          <div class="field ${pt === 'customer' ? '' : 'hidden'}" data-it="customer"><label for="f-iCust">Customer</label><select id="f-iCust" name="iCust"><option value="">Select customer</option>${(db.customers || []).map(c => [c.id, `${c.name}${c.phone ? ' — ' + c.phone : ''}`]).sort(byName).map(([v, l]) => `<option value="${esc(v)}" ${v === e.party.customerId ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          <div class="field ${pt === 'new' ? '' : 'hidden'}" data-it="new"><label for="f-iName">Name</label><input id="f-iName" name="iName" value="${esc(e.party.name || '')}"></div>
          <div class="field ${pt === 'new' ? '' : 'hidden'}" data-it="new"><label for="f-iPhone">Mobile</label><input id="f-iPhone" name="iPhone" type="tel" inputmode="numeric" maxlength="10" value="${esc(e.party.phone || '')}"></div>
          ${field('Date', 'date', { type: 'date', value: e.date, required: true, attrs: `max="${todayIso}"` })}
          ${field('Source', 'source', { value: e.source, options: INQ_SOURCES })}
          ${field('Follow up on', 'followUp', { type: 'date', value: e.followUp || '' })}
          ${field('Status', 'status', { value: e.status, options: INQ_STATUS.filter(x => x !== 'Converted' || e.status === 'Converted') })}
        </div>
        <div class="lines"><div class="table-wrap"><table><thead><tr><th>Item asked for</th><th>Qty</th><th>Note</th><th></th></tr></thead>
          <tbody id="iBody">${(e.items.length ? e.items : [{}]).map(inqRow).join('')}</tbody></table></div>
          <div class="add-line"><button type="button" class="btn sm" data-add-iline>+ Add item</button> <span class="small muted">Items not in your product list can be typed too — they show up as requests.</span></div></div>
        ${field('Notes', 'notes', { value: e.notes || '', full: true, attrs: 'placeholder="Rate quoted, delivery asked for, competitor, reason lost…"' })}`,
      onSubmit: d => {
        const type = d.itype;
        let party;
        if (type === 'chemist') { if (!d.iChem) { toast('Choose the chemist.'); return false; } party = { type, chemistId: d.iChem }; }
        else if (type === 'customer') { if (!d.iCust) { toast('Choose the customer, or pick “New person”.'); return false; } party = { type, customerId: d.iCust }; }
        else {
          if (!String(d.iName || '').trim()) { toast('Enter the person’s name.'); return false; }
          if (d.iPhone && !/^[6-9]\d{9}$/.test(d.iPhone.trim())) { toast('Mobile must be a 10-digit number.'); return false; }
          party = { type: 'new', name: d.iName.trim(), phone: (d.iPhone || '').trim() };
        }
        const items = $$('#iBody tr[data-iline]').map(tr => {
          const name = $('[data-i=name]', tr).value.trim(); const pr = name && findProductByName(name);
          return { productId: pr?.id || '', name: pr?.name || name, qty: Math.max(1, Math.floor(num($('[data-i=qty]', tr).value)) || 1), note: $('[data-i=note]', tr).value.trim() };
        }).filter(x => x.name);
        if (!items.length && !String(d.notes || '').trim()) { toast('Add at least one item or a note.'); return false; }
        const vals = { party, date: d.date, source: d.source, followUp: d.followUp || '', status: d.status, items, notes: (d.notes || '').trim() };
        if (['Converted', 'Lost'].includes(vals.status) && !(q && q.status === vals.status)) vals.closedOn = todayIso;
        if (q) { Object.assign(q, vals); return `${q.no} saved.`; }
        const no = nextNum('ENQ-', db.inquiries, 1001);
        db.inquiries.push({ no, created: todayIso, ...vals });
        return `${no} saved${vals.followUp ? ` — follow up on ${fmtDate(vals.followUp)}` : ''}.`;
      },
    });
  }
  ACTIONS['new-inquiry'] = () => inquiryModal(null);
  ACTIONS['edit-inquiry'] = no => { const q = db.inquiries.find(x => x.no === no); if (q) inquiryModal(q); };
  ACTIONS['del-inquiry'] = no => { const q = db.inquiries.find(x => x.no === no); if (!q) return; confirmModal(`Delete ${q.no}?`, 'This cannot be undone.', 'Delete enquiry', () => { db.inquiries = db.inquiries.filter(x => x !== q); return `${no} deleted.`; }); };
  ACTIONS['view-inquiry'] = no => {
    const q = db.inquiries.find(x => x.no === no); if (!q) return;
    openModal({
      title: `Enquiry ${q.no}`, size: 'lg',
      extraFoot: `<div class="foot-left">${inqOpen(q) ? `<button type="button" class="btn primary" data-act="inq-convert" data-id="${esc(q.no)}">Make sale bill</button><button type="button" class="btn" data-act="inq-status" data-id="${esc(q.no)}|Quoted">Mark quoted</button><button type="button" class="btn ghost danger" data-act="inq-status" data-id="${esc(q.no)}|Lost">Mark lost</button>` : ''}<button type="button" class="btn" data-act="edit-inquiry" data-id="${esc(q.no)}">Edit</button></div>`,
      body: `${detailGrid([['From', esc(inqPartyName(q))], ['Mobile', telLink(inqPartyPhone(q))], ['Date', fmtDate(q.date)], ['Source', esc(q.source || '—')], ['Follow up on', q.followUp ? fmtDate(q.followUp) : '—'], ['Status', pill(q.status)], ['Sale bill', q.saleNo ? `<a href="#" data-act="view-sale" data-id="${esc(q.saleNo)}">${esc(q.saleNo)}</a>` : '—']])}
        ${miniTable([{ h: 'Item', c: i => `<span class="strong">${esc(i.name)}</span>${i.productId ? '' : ' <span class="small muted">not in product list</span>'}${i.note ? `<div class="small muted">${esc(i.note)}</div>` : ''}` }, { h: 'Asked', r: 1, c: i => qty(i.qty) }, { h: 'In stock now', r: 1, c: i => i.productId ? qty(sellableQty(i.productId)) : '—' }, { h: 'Rate', r: 1, c: i => i.productId ? dec(q.party.type === 'chemist' ? prod(i.productId)?.ptr : prod(i.productId)?.mrp) : '—' }], q.items)}
        ${q.notes ? `<div><div class="small muted">Notes</div>${esc(q.notes)}</div>` : ''}`,
    });
  };
  ACTIONS['inq-status'] = v => {
    const [no, status] = v.split('|'); const q = db.inquiries.find(x => x.no === no); if (!q) return;
    Object.assign(q, { status }, ['Converted', 'Lost'].includes(status) ? { closedOn: todayIso } : {}); refresh(); toast(`${no} marked ${status.toLowerCase()}.`);
  };
  ACTIONS['inq-convert'] = no => {
    const q = db.inquiries.find(x => x.no === no); if (!q) return;
    let preset = {};
    if (q.party.type === 'chemist') {
      const c = chem(q.party.chemistId); if (!c) { toast('This chemist no longer exists.'); return; }
      if (c.status !== 'Active') { toast(`${c.name} is ${c.status}. Activate them before billing.`); return; }
      preset.chemistId = c.id;
    } else {
      if (q.party.type === 'new') {
        let cu = q.party.phone && db.customers.find(x => x.phone === q.party.phone);
        if (!cu) { cu = { id: nextId('U', db.customers), name: q.party.name, phone: q.party.phone || '', joined: todayIso }; db.customers.push(cu); }
        q.party = { type: 'customer', customerId: cu.id }; save();
      }
      preset.customerId = q.party.customerId;
    }
    const c = chem(preset.chemistId);
    const lines = q.items.filter(i => i.productId && sellableQty(i.productId) > 0).map(i => {
      const pr = prod(i.productId); const b = sellableBatches(pr.id)[0];
      return { productId: pr.id, batchId: b.id, qty: Math.min(i.qty, avail(b)), free: 0, rate: c ? pr.ptr : round2(pr.mrp / (1 + pr.gst / 100)), cd: c ? c.cd || 0 : 0, td: c ? c.td || 0 : 0 };
    });
    const left = q.items.length - lines.length;
    saleModal(null, { ...preset, lines, inquiryNo: q.no });
    if (left) toast(`${left} item(s) are not in stock or not in your product list, so they were left out.`);
  };

  // ---------- Sales returns ----------
  // retDraft.picks: { 'SALE-NO#lineIndex': { qty, free } } — what is ticked in the return form
  let retDraft = { editing: '', picks: {} };
  const retKey = (saleNo, idx) => `${saleNo}#${idx}`;
  function returnedSoFar(saleNo, idx, exceptNo) {
    let q = 0, f = 0;
    (db.returns || []).forEach(r => { if (r.status === 'Rejected' || r.no === exceptNo) return; r.lines.forEach(l => { if (l.saleNo === saleNo && l.idx === idx) { q += l.qty; f += l.free || 0; } }); });
    return { q, f };
  }
  function suppliedLines(type, id) {
    if (!id) return [];
    const mine = x => type === 'chemist' ? x.party.chemistId === id : x.party.customerId === id;
    const out = [];
    db.sales.filter(mine).sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no)).forEach(sl => sl.lines.forEach((l, idx) => {
      const done = returnedSoFar(sl.no, idx, retDraft.editing);
      const remQ = l.qty - done.q, remF = (l.free || 0) - done.f;
      const key = retKey(sl.no, idx);
      if (remQ > 0 || remF > 0 || retDraft.picks[key]) out.push({ key, sale: sl, idx, l, done, remQ: Math.max(0, remQ), remF: Math.max(0, remF) });
    }));
    return out;
  }
  const retLineFrom = (x, pk) => ({ saleNo: x.sale.no, idx: x.idx, productId: x.l.productId, batchId: x.l.batchId, batch: x.l.batch, expiry: x.l.expiry, qty: pk.qty, free: pk.free, rate: x.l.rate, mrp: x.l.mrp, cd: x.l.cd || 0, td: x.l.td || 0, gst: x.l.gst });
  const retLineValue = l => { const c = calcLine(l); return round2(c.taxable + c.gstA); };
  function retTotals(lines) { const t = billCalc(lines); return { ...t, total: round2(lines.reduce((a, l) => a + retLineValue(l), 0)), roundOff: 0 }; }
  const retPartyFromForm = () => { const type = $('#mform [name="rtype"]:checked')?.value || 'chemist'; return { type, id: type === 'chemist' ? $('#f-rChem')?.value : $('#f-rCust')?.value }; };
  function renderReturnLines() {
    const box = $('#retLines'); if (!box) return;
    const { type, id } = retPartyFromForm();
    if (!id) { box.innerHTML = `<div class="empty">Choose the ${type === 'chemist' ? 'chemist' : 'customer'} to see everything supplied to them.</div>`; updateRetSum(); return; }
    const rows = suppliedLines(type, id);
    box.innerHTML = rows.length ? `<div class="lines"><div class="table-wrap"><table class="ret-table">
      <thead><tr><th><input type="checkbox" class="cb" data-rselall aria-label="Tick all shown"></th><th>Bill</th><th>Item</th><th>Batch</th><th>Exp</th><th class="r">Supplied</th><th class="r">Returned</th><th>Return qty</th><th>Free back</th><th class="r">Rate</th><th class="r">Disc.</th><th class="r">GST</th><th class="r">Credit</th></tr></thead>
      <tbody>${rows.map(x => { const pk = retDraft.picks[x.key]; const pr = prod(x.l.productId); return `<tr data-rkey="${esc(x.key)}" data-text="${esc(norm([x.sale.no, pr?.name, x.l.batch].join(' ')))}" class="${pk ? 'picked' : ''}">
        <td><input type="checkbox" class="cb" data-rsel ${pk ? 'checked' : ''} aria-label="Tick line"></td>
        <td><span class="strong">${esc(x.sale.no)}</span><div class="small muted">${fmtDate(x.sale.date)}</div></td>
        <td><span class="strong">${esc(pr?.name || '')}</span><div class="small muted">${esc(pr?.pack || '')}</div></td>
        <td>${esc(x.l.batch || '')}</td><td>${x.l.expiry ? isoToExp(x.l.expiry) : ''}</td>
        <td class="r">${qty(x.l.qty)}${x.l.free ? ` + ${qty(x.l.free)}` : ''}</td>
        <td class="r">${x.done.q || x.done.f ? `${qty(x.done.q)}${x.done.f ? ` + ${qty(x.done.f)}` : ''}` : '—'}</td>
        <td><input data-rq="qty" type="number" min="0" max="${x.remQ}" step="1" value="${pk ? pk.qty : ''}" placeholder="max ${x.remQ}" style="width:84px"></td>
        <td><input data-rq="free" type="number" min="0" max="${x.remF}" step="1" value="${pk && pk.free ? pk.free : ''}" placeholder="${x.remF ? 'max ' + x.remF : '—'}" ${x.remF ? '' : 'disabled'} style="width:70px"></td>
        <td class="r">${dec(x.l.rate)}</td><td class="r small">${[x.l.cd && `CD ${dec(x.l.cd)}%`, x.l.td && `TD ${dec(x.l.td)}%`].filter(Boolean).join('<br>') || '—'}</td><td class="r">${dec(x.l.gst)}%</td>
        <td class="r num" data-ramt>${pk ? dec(retLineValue(retLineFrom(x, pk))) : '—'}</td></tr>`; }).join('')}</tbody></table></div></div>`
      : `<div class="empty">Nothing left to return — everything supplied to this party has already been returned, or there are no bills.</div>`;
    filterReturnLines(); updateRetSum();
  }
  function filterReturnLines() {
    const q = norm($('#retSearch')?.value || '');
    $$('#retLines tr[data-rkey]').forEach(tr => { tr.style.display = !q || tr.dataset.text.includes(q) || tr.classList.contains('picked') ? '' : 'none'; });
  }
  function retRowsMap() { const { type, id } = retPartyFromForm(); return Object.fromEntries(suppliedLines(type, id).map(x => [x.key, x])); }
  function updateRetSum() {
    const map = retRowsMap();
    const lines = Object.entries(retDraft.picks).filter(([k]) => map[k]).map(([k, pk]) => retLineFrom(map[k], pk)).filter(l => l.qty + l.free > 0);
    const el = $('#retSum'); if (el) el.innerHTML = lines.length ? `<b>${lines.length}</b> line${lines.length === 1 ? '' : 's'} ticked · ${qty(lines.reduce((a, l) => a + l.qty + l.free, 0))} units · credit <b>${money2(retTotals(lines).total)}</b>` : 'Tick the items coming back and enter how many.';
  }
  function retPick(tr, fromQtyInput) {
    const key = tr.dataset.rkey; const map = retRowsMap(); const x = map[key]; if (!x) return;
    const cb = $('[data-rsel]', tr), qi = $('[data-rq=qty]', tr), fi = $('[data-rq=free]', tr);
    let q = Math.floor(num(qi.value)), f = Math.floor(num(fi.value));
    if (q > x.remQ) { q = x.remQ; qi.value = q; toast(`Only ${x.remQ} can be returned on this line.`); }
    if (f > x.remF) { f = x.remF; fi.value = f || ''; }
    if (!fromQtyInput) { if (cb.checked && !q && !f) { q = x.remQ; f = 0; qi.value = q || ''; if (!q) { f = x.remF; fi.value = f; } } if (!cb.checked) { q = 0; f = 0; qi.value = ''; fi.value = ''; } }
    if (q + f > 0) { retDraft.picks[key] = { qty: q, free: f }; cb.checked = true; tr.classList.add('picked'); $('[data-ramt]', tr).textContent = dec(retLineValue(retLineFrom(x, { qty: q, free: f }))); }
    else { delete retDraft.picks[key]; cb.checked = false; tr.classList.remove('picked'); $('[data-ramt]', tr).textContent = '—'; }
    updateRetSum();
  }
  function returnModal(r) {
    const e = r || { party: { type: 'chemist' }, date: todayIso, reason: RETURN_REASONS[0], note: '', lines: [] };
    retDraft = { editing: r ? r.no : '', picks: Object.fromEntries((r ? r.lines : []).map(l => [retKey(l.saleNo, l.idx), { qty: l.qty, free: l.free || 0 }])) };
    const pt = e.party.type;
    openModal({
      title: r ? `Edit return ${r.no}` : 'New sales return', size: 'xl', submitLabel: r ? 'Save return' : 'Create return request',
      body: `<div class="seg"><label><input type="radio" name="rtype" value="chemist" ${pt === 'chemist' ? 'checked' : ''}> Chemist</label><label><input type="radio" name="rtype" value="customer" ${pt === 'customer' ? 'checked' : ''}> Customer</label></div>
        <div class="form-grid g4">
          <div class="field ${pt === 'chemist' ? '' : 'hidden'}" data-rt="chemist"><label for="f-rChem">Chemist</label><select id="f-rChem" name="rChem"><option value="">Select chemist</option>${db.chemists.map(c => [c.id, `${c.name} — ${c.city || ''}`]).sort(byName).map(([v, l]) => `<option value="${esc(v)}" ${v === e.party.chemistId ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          <div class="field ${pt === 'customer' ? '' : 'hidden'}" data-rt="customer"><label for="f-rCust">Customer</label><select id="f-rCust" name="rCust"><option value="">Select customer</option>${(db.customers || []).map(c => [c.id, `${c.name}${c.phone ? ' — ' + c.phone : ''}`]).sort(byName).map(([v, l]) => `<option value="${esc(v)}" ${v === e.party.customerId ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          ${field('Return date', 'date', { type: 'date', value: e.date, required: true, attrs: `max="${todayIso}"` })}
          ${field('Reason', 'reason', { value: e.reason, options: RETURN_REASONS })}
          ${field('Note', 'note', { value: e.note || '', attrs: 'placeholder="Condition, who brought it back…"' })}
        </div>
        <div class="ret-tools"><label class="search">${icon('search')}<input id="retSearch" placeholder="Filter by item, batch or bill no." autocomplete="off"></label><span class="small" id="retSum"></span></div>
        <div id="retLines"></div>
        ${r ? '' : '<label class="check-line"><input type="checkbox" name="approveNow"> Approve now — put the stock back and give the credit straight away</label>'}`,
      onSubmit: d => {
        const { type, id } = retPartyFromForm();
        if (!id) { toast(`Choose the ${type === 'chemist' ? 'chemist' : 'customer'}.`); return false; }
        const map = retRowsMap();
        const lines = Object.entries(retDraft.picks).filter(([k, pk]) => map[k] && pk.qty + pk.free > 0).map(([k, pk]) => retLineFrom(map[k], pk));
        if (!lines.length) { toast('Tick at least one item and enter the quantity coming back.'); return false; }
        for (const l of lines) { const x = map[retKey(l.saleNo, l.idx)]; if (l.qty > x.remQ || l.free > x.remF) { toast(`${prod(l.productId)?.name}: more than what is left to return.`); return false; } }
        const party = type === 'chemist' ? { type, chemistId: id } : { type, customerId: id };
        const vals = { party, date: d.date, reason: d.reason, note: (d.note || '').trim(), lines, ...retTotals(lines) };
        if (r) { Object.assign(r, vals); return `${r.no} saved.`; }
        const rec = { no: nextNum('SR-', db.returns, 1001), status: 'Requested', created: todayIso, ...vals };
        db.returns.push(rec);
        if (d.approveNow) { approveReturn(rec); return `${rec.no} approved — stock back and ${money2(rec.total)} credited.`; }
        return `${rec.no} created as a request for ${money2(rec.total)}. Approve it to put the stock back.`;
      },
    });
    renderReturnLines();
  }
  // Approving puts the goods back into the same batch and credits each sale bill
  function approveReturn(r) {
    r.lines.forEach(l => {
      let b = batchById(l.batchId) || db.batches.find(x => x.productId === l.productId && norm(x.batch) === norm(l.batch));
      if (!b) { const pr = prod(l.productId); b = { id: uid(), productId: l.productId, batch: l.batch, expiry: l.expiry, qty: 0, free: 0, rate: pr?.pts || 0, mrp: l.mrp, cd: 0, td: 0, gst: l.gst, source: `Sales return ${r.no}`, verified: true }; db.batches.push(b); }
      b.qty += l.qty; b.free = (b.free || 0) + (l.free || 0);
    });
    const credits = {};
    r.lines.forEach(l => { credits[l.saleNo] = round2((credits[l.saleNo] || 0) + retLineValue(l)); });
    Object.entries(credits).forEach(([no, amt]) => { const sl = db.sales.find(x => x.no === no); if (sl) sl.returned = round2((sl.returned || 0) + amt); });
    Object.assign(r, { status: 'Approved', approvedOn: todayIso, credits, total: round2(Object.values(credits).reduce((a, v) => a + v, 0)) });
    fireHook('return.approved', { no: r.no, party: retPartyName(r), total: r.total, bills: Object.keys(credits) });
    closeApprovalKey('ret:' + r.no, 'Return approved');
  }
  function undoApprovedReturn(r) {
    const short = r.lines.filter(l => { const b = batchById(l.batchId) || db.batches.find(x => x.productId === l.productId && norm(x.batch) === norm(l.batch)); return !b || avail(b) < l.qty + (l.free || 0); });
    if (short.length) return short.map(l => `${prod(l.productId)?.name} (${l.batch})`);
    r.lines.forEach(l => {
      const b = batchById(l.batchId) || db.batches.find(x => x.productId === l.productId && norm(x.batch) === norm(l.batch));
      let need = l.qty + (l.free || 0); const fq = Math.min(b.qty, need); b.qty -= fq; need -= fq; b.free = (b.free || 0) - need;
    });
    Object.entries(r.credits || {}).forEach(([no, amt]) => { const sl = db.sales.find(x => x.no === no); if (sl) sl.returned = Math.max(0, round2((sl.returned || 0) - amt)); });
    return [];
  }
  const returnById = no => (db.returns || []).find(x => x.no === no);
  ACTIONS['new-return'] = () => returnModal(null);
  ACTIONS['edit-return'] = no => { const r = returnById(no); if (!r) return; if (r.status !== 'Requested') { toast('Only requested returns can be edited.'); return; } returnModal(r); };
  ACTIONS['approve-return'] = no => {
    const r = returnById(no); if (!r || r.status !== 'Requested') return;
    confirmModal(`Approve ${r.no}?`, `${r.lines.length} line(s) go back into stock and <b>${money2(r.total)}</b> is credited to ${esc(retPartyName(r))} against ${esc([...new Set(r.lines.map(l => l.saleNo))].join(', '))}.`, 'Approve return', () => { approveReturn(r); return `${r.no} approved — stock back, ${money2(r.total)} credited.`; });
    $('#modalFoot [data-submit]').classList.remove('danger-solid'); $('#modalFoot [data-submit]').classList.add('primary');
  };
  ACTIONS['reject-return'] = no => {
    const r = returnById(no); if (!r || r.status !== 'Requested') return;
    openModal({ title: `Reject ${r.no}?`, size: 'sm', submitLabel: 'Reject return', body: `<div class="form-grid">${field('Reason for rejecting', 'why', { full: true })}</div>`, onSubmit: d => { Object.assign(r, { status: 'Rejected', rejectedOn: todayIso, rejectNote: (d.why || '').trim() }); closeApprovalKey('ret:' + r.no, 'Return rejected'); return `${r.no} rejected. No stock or credit changed.`; } });
    $('#modalFoot [data-submit]').classList.add('danger-solid');
  };
  ACTIONS['del-return'] = no => {
    const r = returnById(no); if (!r) return;
    confirmModal(`Delete ${r.no}?`, r.status === 'Approved' ? `This return was approved: its ${r.lines.length} line(s) will be taken back out of stock and the ${money2(r.total)} credit removed from the bills. This cannot be undone.` : 'This cannot be undone.', 'Delete return', () => {
      if (r.status === 'Approved') { const short = undoApprovedReturn(r); if (short.length) { toast(`Some of the returned stock is already sold again: ${short.join(', ')}. The return can’t be deleted.`); return false; } }
      db.returns = db.returns.filter(x => x !== r); return `${no} deleted.`;
    });
  };
  ACTIONS['view-return'] = no => {
    const r = returnById(no); if (!r) return;
    const c = r.party.type === 'chemist' ? chem(r.party.chemistId) : null, cu = c ? null : custById(r.party.customerId);
    const party = c ? { partyTitle: `M/S ${c.name}`, partyLines: [addrText(c), `DL No: ${dlText(c) || '—'}`, `GSTIN: ${c.gstin || '—'}`, `Mob: ${c.phone}`] } : { partyTitle: cu?.name || 'Customer', partyLines: [cu && addrText(cu), `Mob: ${cu?.phone || '—'}`] };
    openModal({
      title: `Sales return ${r.no}`, size: 'xl',
      extraFoot: `<div class="foot-left">${r.status === 'Requested' ? `<button type="button" class="btn primary" data-act="approve-return" data-id="${esc(r.no)}">Approve</button><button type="button" class="btn" data-act="reject-return" data-id="${esc(r.no)}">Reject</button><button type="button" class="btn" data-act="edit-return" data-id="${esc(r.no)}">Edit</button>` : ''}${printBtn()}</div>`,
      body: billBody({ title: r.status === 'Approved' ? 'CREDIT NOTE · SALES RETURN' : 'SALES RETURN REQUEST', no: r.no, date: r.date, ...party, metaLines: [['Against', [...new Set(r.lines.map(l => l.saleNo))].join(', ')], ['Reason', r.reason || '—'], ['Status', r.status], ...(r.approvedOn ? [['Approved', fmtDate(r.approvedOn)]] : [])], lines: r.lines, t: r, isSale: true }),
    });
  };

  // ---------- Ledger actions ----------
  ACTIONS['open-ledger'] = v => {
    const [type, id] = v.split('|');
    Object.assign(ledgerState, { type, id });
    if (location.hash === '#ledger') render(); else location.hash = 'ledger';
    window.scrollTo(0, 0);
  };
  ACTIONS['ledger-clear-dates'] = () => { ledgerState.from = ''; ledgerState.to = ''; render(); };
  ACTIONS['ledger-csv'] = () => {
    const st = ledgerState; const L = ledgerCalc(st.type, st.id, st.from, st.to);
    const rows = [['Date', 'Particulars', 'Note', 'Voucher', 'Debit', 'Credit', 'Balance'], ['', 'Opening balance', '', '', '', '', `${round2(Math.abs(L.open)).toFixed(2)} ${balSide(L.open, st.type)}`.trim()], ...L.rows.map(e => [e.date, e.kind, e.note, e.ref, e.dr ? round2(e.dr).toFixed(2) : '', e.cr ? round2(e.cr).toFixed(2) : '', `${round2(Math.abs(e.bal)).toFixed(2)} ${balSide(e.bal, st.type)}`.trim()]), ['', 'Total', '', '', round2(L.dr).toFixed(2), round2(L.cr).toFixed(2), `${round2(Math.abs(L.close)).toFixed(2)} ${balSide(L.close, st.type)}`.trim()]];
    downloadText(`ledger-${(ledgerPartyName(st.type, st.id) || 'party').replace(/[^\w-]+/g, '_')}-${todayIso}.csv`, rows.map(r => r.map(csvCell).join(',')).join('\r\n'));
  };
  ACTIONS['ledger-print'] = () => {
    const st = ledgerState; const L = ledgerCalc(st.type, st.id, st.from, st.to); const f = db.settings.firm;
    const pty = st.type === 'chemist' ? chem(st.id) : st.type === 'customer' ? custById(st.id) : sup(st.id);
    openModal({
      title: `Ledger · ${pty?.name || ''}`, size: 'xl',
      extraFoot: `<div class="foot-left"><button type="button" class="btn" data-act="print" data-id="a4">${icon('file')}Print (A4)</button></div>`,
      body: `<div class="paper-wrap"><div class="paper paper-a4"><div class="bill">
        <div class="bill-top"><span class="bill-title">ACCOUNT STATEMENT</span></div>
        <div class="bill-head ledger-head">
          <div class="bill-from">${f.logo ? `<img class="bill-logo" src="${esc(f.logo)}" alt="">` : ''}<div><div class="bill-firm">${esc(f.name)}</div>${firmLines(f).map(x => `<div>${esc(x)}</div>`).join('')}</div></div>
          <div class="bill-to"><div class="bill-to-label">${st.type === 'supplier' ? 'Supplier' : 'Party'}</div><div class="strong">${esc(pty?.name || '')}</div>${[pty && addrText(pty), pty?.gstin && `GSTIN: ${pty.gstin}`, pty?.phone && `Mob: ${pty.phone}`].filter(Boolean).map(x => `<div>${esc(x)}</div>`).join('')}
            <div class="small" style="margin-top:4px">Period: ${st.from ? fmtDate(st.from) : 'Beginning'} to ${st.to ? fmtDate(st.to) : fmtDate(todayIso)}</div></div>
        </div>
        ${ledgerTable(L, st.type, true)}
        <div class="bill-words"><span>Closing balance</span>${balTxt(L.close, st.type)} — ${esc(rupeesInWords(Math.abs(L.close)))}</div>
        <div class="bill-sign"><div><span>&nbsp;</span><span class="sig-line">Party's confirmation</span></div><div><span>For <b>${esc(f.name)}</b></span><span class="sig-line">Authorised signatory</span></div></div>
      </div></div></div>`,
    });
  };

  // ---------- Profile ----------
  let pendingLogo; // undefined = unchanged, '' = removed, data URL = new logo
  function imageToDataUrl(file, max = 200) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); resolve(cv.toDataURL('image/png')); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be read. Use a PNG or JPG.')); };
      img.src = url;
    });
  }
  const logoPreview = src => src ? `<img src="${esc(src)}" alt="Logo">` : `<span>${esc((db.settings.firm.name || 'P').trim().charAt(0).toUpperCase())}</span>`;
  ACTIONS['open-profile'] = () => {
    const f = db.settings.firm, pr = db.settings.profile || {};
    pendingLogo = undefined;
    openModal({
      title: 'Profile', size: 'lg', submitLabel: 'Save profile',
      extraFoot: `<div class="foot-left"><button type="button" class="btn" data-act="open-settings" data-id="">Settings</button>${SERVER ? '<button type="button" class="btn" data-act="change-password" data-id="">Change password</button>' : ''}</div>`,
      body: `<div class="profile-head">
          <div class="profile-logo" id="profLogo">${logoPreview(f.logo)}</div>
          <div class="profile-logo-acts"><div class="strong">Business logo</div><div class="small muted">Shown in the sidebar and on printed bills. A square PNG or JPG works best.</div>
            <div class="toolbar" style="margin-top:8px"><label class="btn sm">${icon('upload')}Upload logo<input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp" hidden></label><button type="button" class="btn sm ghost" id="logoRemove">Remove</button></div></div>
        </div>
        <div class="form-grid">
          <div class="field full form-sec">Business</div>
          ${field('Business name', 'bizName', { value: f.name || '', required: true })}
          ${field('Tagline (shown under the name)', 'tagline', { value: f.tagline ?? 'Pharma Suite', attrs: 'placeholder="e.g. Pharma Distributors"' })}
          ${field('Type of business', 'bizType', { value: f.bizType || 'Pharmaceutical distributor', options: ['Pharmaceutical distributor', 'Wholesale chemist', 'Retail chemist / medical store', 'Surgical & medical supplies', 'Hospital pharmacy', 'Other'] })}
          ${field('Business phone', 'bizPhone', { value: f.phone || '' })}
          <div class="field full form-sec">Your profile</div>
          ${field('Your name', 'pName', { value: pr.name || '', attrs: 'autocomplete="name"' })}
          ${field('Designation', 'pRole', { value: pr.role || '', attrs: 'list="dl-roles" placeholder="e.g. Proprietor"' })}
          ${field('Mobile', 'pPhone', { type: 'tel', value: pr.phone || '', attrs: 'inputmode="numeric" maxlength="10"' })}
          ${field('Email', 'pEmail', { type: 'email', value: pr.email || '' })}
          <datalist id="dl-roles">${dlOptions(['Proprietor', 'Partner', 'Director', 'Manager', 'Pharmacist', 'Accountant', 'Sales executive'])}</datalist>
        </div>
        <div class="small muted">Address, licences, bank details, terms and backups are in Settings.</div>`,
      onSubmit: d => {
        if (d.pPhone && !/^[6-9]\d{9}$/.test(d.pPhone.trim())) { toast('Mobile must be a 10-digit number.'); return false; }
        Object.assign(f, { name: d.bizName.trim(), tagline: (d.tagline || '').trim(), bizType: d.bizType, phone: (d.bizPhone || '').trim() });
        if (pendingLogo !== undefined) f.logo = pendingLogo;
        db.settings.profile = { name: (d.pName || '').trim(), role: (d.pRole || '').trim(), phone: (d.pPhone || '').trim(), email: (d.pEmail || '').trim().toLowerCase() };
        return 'Profile saved.';
      },
    });
  };

  // =====================================================================
  // Integrations, agents and approvals
  // =====================================================================
  const MODEL_OPTS = [['claude-opus-5-5', 'Claude Opus 5.5 — most accurate'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 — balanced'], ['claude-haiku-5-5', 'Claude Haiku 5.5 — fastest, cheapest']];
  // Field types: text, secret (kept on the server), browserkey (Anthropic key, kept in this browser), select, check, textarea, number
  const INT_DEFS = [
    { id: 'ai', name: 'AI providers', icon: 'spark', desc: 'Claude reads purchase bills and licences, and understands free-text orders for the Order Desk agent.', works: 'Works now — the browser key stays in this browser; the Chemist Assistant uses a separate key stored on the server.', test: 'ai',
      fields: [{ k: 'key', label: 'Anthropic API key', type: 'browserkey', required: true }, { k: 'billModel', label: 'Model for reading bills and licences', type: 'select', options: MODEL_OPTS, def: 'claude-opus-5-5' }, { k: 'agentModel', label: 'Model for agents (Order Desk, Chemist Assistant)', type: 'select', options: MODEL_OPTS, def: 'claude-haiku-5-5' }, { k: 'serverKey', label: 'Anthropic API key for the server (Chemist Assistant)', type: 'secret' }, { k: 'budget', label: 'Monthly AI budget (₹, for your reference)', type: 'number' }] },
    { id: 'whatsapp', name: 'WhatsApp', icon: 'chat', desc: 'Payment reminders, order replies and the daily briefing.', works: 'Works now: opens WhatsApp with the message typed. Direct sending needs the Business API and the server.', test: 'server',
      fields: [{ k: 'mode', label: 'How to send', type: 'select', options: [['click', 'Open WhatsApp with the message ready (no setup)'], ['cloud', 'WhatsApp Business API — sends directly (server)']], def: 'click' }, { k: 'businessNumber', label: 'Your WhatsApp business number' }, { k: 'phoneId', label: 'Phone number ID', when: 'cloud', required: true }, { k: 'token', label: 'Permanent access token', type: 'secret', when: 'cloud', required: true }, { k: 'template', label: 'Approved reminder template name (outside 24-hour chats)', when: 'cloud' }, { k: 'lang', label: 'Template language code', def: 'en', when: 'cloud' }, { k: 'apiVersion', label: 'Graph API version', def: 'v23.0', when: 'cloud' }] },
    { id: 'voice', name: 'Voice calls', icon: 'chat', desc: 'Missed-call orders, click-to-call and call recordings.', works: 'Saves settings — calling is not connected yet.',
      fields: [{ k: 'provider', label: 'Provider', type: 'select', options: [['exotel', 'Exotel'], ['knowlarity', 'Knowlarity'], ['twilio', 'Twilio'], ['other', 'Other']], def: 'exotel' }, { k: 'accountSid', label: 'Account SID / ID' }, { k: 'apiKey', label: 'API key / token', type: 'secret' }, { k: 'callerId', label: 'Caller ID / virtual number' }] },
    { id: 'sms', name: 'SMS backup', icon: 'chat', desc: 'Reminders by SMS when WhatsApp is not possible.', works: 'Works now: opens the SMS app with the message. Bulk SMS through a provider needs DLT registration (saved for later).',
      fields: [{ k: 'mode', label: 'How to send', type: 'select', options: [['device', 'Open the SMS app (no setup)'], ['api', 'SMS provider — saved for later']], def: 'device' }, { k: 'provider', label: 'Provider (MSG91, Fast2SMS…)', when: 'api' }, { k: 'apiKey', label: 'API key', type: 'secret', when: 'api' }, { k: 'senderId', label: 'DLT sender ID (6 letters)', when: 'api' }, { k: 'dltEntity', label: 'DLT entity ID', when: 'api' }, { k: 'dltTemplate', label: 'DLT template ID for reminders', when: 'api' }] },
    { id: 'payments', name: 'Online payments', icon: 'rupee', desc: 'UPI ID or payment link added to payment reminders.', works: 'UPI ID works now. Razorpay payment links need the server.', test: 'server',
      fields: [{ k: 'upiId', label: 'UPI ID (VPA) for payments', placeholder: 'e.g. shankarmedical@sbi' }, { k: 'payee', label: 'Name shown for UPI payments' }, { k: 'keyId', label: 'Razorpay key ID (optional)' }, { k: 'keySecret', label: 'Razorpay key secret', type: 'secret' }] },
    { id: 'email', name: 'Email', icon: 'file', desc: 'Bills, ledger statements and reminders by email.', works: 'Works now: opens your email app with the message. Direct SMTP sending is saved for later.',
      fields: [{ k: 'mode', label: 'How to send', type: 'select', options: [['app', 'Open my email app (no setup)'], ['smtp', 'SMTP — saved for later']], def: 'app' }, { k: 'fromName', label: 'From name' }, { k: 'fromEmail', label: 'From email' }, { k: 'smtpHost', label: 'SMTP host', when: 'smtp' }, { k: 'smtpPort', label: 'SMTP port', when: 'smtp', def: '587' }, { k: 'smtpUser', label: 'SMTP user', when: 'smtp' }, { k: 'smtpPass', label: 'SMTP password', type: 'secret', when: 'smtp' }] },
    { id: 'social', name: 'Instagram & Facebook', icon: 'spark', desc: 'Posts for new stock and schemes. Prescription (Schedule H/H1/X) medicines must not be advertised to the public.', works: 'Saves settings — posting is not connected yet.',
      fields: [{ k: 'pageId', label: 'Facebook page ID' }, { k: 'igId', label: 'Instagram business account ID' }, { k: 'pageToken', label: 'Page access token', type: 'secret' }] },
    { id: 'bizprofile', name: 'Business Profiles', icon: 'store', desc: 'Your Google Business Profile — map listing and reviews.', works: 'The review link can be added to messages now. Managing posts and reviews is not connected yet.',
      fields: [{ k: 'profileUrl', label: 'Google Maps / profile link' }, { k: 'reviewLink', label: 'Review link (“Write a review”)' }] },
    { id: 'geodemand', name: 'Geo search demand', icon: 'trend', desc: 'Which items are in demand in which district — from your own sales and enquiries.', works: 'Works now — shown in the Daily Briefing.',
      fields: [{ k: 'useSales', label: 'Use sales by district', type: 'check', def: true }, { k: 'useEnquiries', label: 'Use enquiries (items asked for)', type: 'check', def: true }, { k: 'days', label: 'Look back (days)', type: 'number', def: 30 }] },
    { id: 'classes', name: 'Online classes', icon: 'user', desc: 'Training sessions for your staff or chemists.', works: 'Saves the meeting link and schedule.',
      fields: [{ k: 'purpose', label: 'For whom / what' }, { k: 'meetLink', label: 'Zoom / Google Meet link' }, { k: 'schedule', label: 'Schedule (e.g. Every Saturday 4 pm)' }] },
    { id: 'accounting', name: 'Sheets & accounting', icon: 'book', desc: 'Accounts in Tally Prime, Marg, Busy or Google Sheets.', works: 'Works now: Tally XML of sale vouchers (Accounts Sync agent), GST summary CSV and ledger CSV. Live Tally/Marg sync is not connected yet.',
      fields: [{ k: 'target', label: 'Accounting software', type: 'select', options: [['tally', 'Tally Prime'], ['marg', 'Marg ERP'], ['busy', 'Busy'], ['sheets', 'Google Sheets'], ['none', 'None']], def: 'tally' }, { k: 'company', label: 'Company name in the software' }, { k: 'salesLedger', label: 'Sales ledger name', def: 'Sales GST' }, { k: 'purchaseLedger', label: 'Purchase ledger name', def: 'Purchase GST' }, { k: 'cgstLedger', label: 'CGST ledger name', def: 'Output CGST' }, { k: 'sgstLedger', label: 'SGST ledger name', def: 'Output SGST' }, { k: 'roundLedger', label: 'Round-off ledger name', def: 'Round Off' }, { k: 'partyGroup', label: 'Group for party ledgers', def: 'Sundry Debtors' }] },
    { id: 'backups', name: 'Google & backups', icon: 'upload', desc: 'Keep a copy of your data safe.', works: 'Works now: backup reminders and download. Automatic Google Drive backup is not connected yet.',
      fields: [{ k: 'remindDays', label: 'Remind me if no backup for (days)', type: 'number', def: 7 }, { k: 'driveFolder', label: 'Google Drive folder link (for later)' }] },
    { id: 'demo', name: 'Data & demo mode', icon: 'grid', desc: 'Sample data, reset and starting fresh.', works: 'Works now — see the Data & backups tab.',
      fields: [{ k: 'banner', label: 'Show a note while sample data is loaded', type: 'check', def: true }] },
    { id: 'einvoice', name: 'GST e-invoice & e-way bill', icon: 'file', desc: 'Required once turnover is above ₹5 crore.', works: 'Saves settings — e-invoice generation is not connected yet.',
      fields: [{ k: 'gsp', label: 'GSP / provider' }, { k: 'gstin', label: 'GSTIN' }, { k: 'username', label: 'API username' }, { k: 'password', label: 'API password', type: 'secret' }] },
  ];
  const intDef = id => INT_DEFS.find(d => d.id === id);
  function intCfg(id) {
    const all = db.settings.integrations || (db.settings.integrations = {});
    const c = all[id] || (all[id] = { enabled: ['ai', 'geodemand', 'demo', 'backups', 'whatsapp', 'payments', 'email', 'sms'].includes(id) });
    (intDef(id)?.fields || []).forEach(f => { if (c[f.k] === undefined && f.def !== undefined) c[f.k] = f.def; });
    return c;
  }
  const aiModel = kind => intCfg('ai')[kind === 'bill' ? 'billModel' : 'agentModel'] || (kind === 'bill' ? 'claude-opus-5-5' : 'claude-haiku-5-5');
  let secretMask = {};
  async function loadSecretMask() { if (!SERVER) return; try { secretMask = await api('GET', 'api/secrets'); } catch { secretMask = {}; } }
  const secretSet = (id, k) => (id === 'ai' && k === 'key') ? !!getApiKey() : !!secretMask[id]?.[k];
  const fieldShown = (f, c) => !f.when || c.mode === f.when;
  function intStatus(d) {
    const c = intCfg(d.id);
    if (!c.enabled) return ['off', 'Off'];
    const missing = d.fields.filter(f => f.required && fieldShown(f, c) && !(f.type === 'secret' || f.type === 'browserkey' ? secretSet(d.id, f.k) : String(c[f.k] ?? '').trim()));
    if (missing.length) return ['warn', 'Needs setup'];
    if (c.lastTest && !c.lastTest.ok) return ['warn', 'Test failed'];
    return ['ok', c.lastTest?.ok ? 'Connected' : 'On'];
  }
  const waCloudReady = () => SERVER && intCfg('whatsapp').enabled && intCfg('whatsapp').mode === 'cloud' && intStatus(intDef('whatsapp'))[0] === 'ok';
  const rzpReady = () => SERVER && intCfg('payments').enabled && !!intCfg('payments').keyId && secretSet('payments', 'keySecret');
  const fireHook = (event, data) => { if (!SERVER) return; const c = intCfg('custom'); if (!c.enabled || !(c.hooks || []).some(h => (h.events || []).includes(event))) return; api('POST', 'api/hooks/fire', { event, data }).catch(() => {}); };
  const HOOK_EVENTS = [['sale.created', 'Sale bill created'], ['payment.received', 'Payment received'], ['return.approved', 'Sales return approved']];

  // ----- Settings page -----
  let settingsTab = 'business';
  const SETTINGS_TABS = [['business', 'Business'], ['integrations', 'Integrations'], ['agents', 'Agents'], ['data', 'Data & backups']];
  function intCard(d) {
    const c = intCfg(d.id); const [cls, label] = intStatus(d);
    const testable = d.test === 'ai' || (d.test === 'server' && SERVER && (d.id !== 'whatsapp' || c.mode === 'cloud') && (d.id !== 'payments' || c.keyId));
    return `<div class="int-card">
      <div class="int-head"><span class="sdot sdot-${cls}" title="${label}"></span><span class="int-ic">${icon(d.icon)}</span><div class="int-title">${esc(d.name)}</div><span class="small muted">${label}</span><span class="spacer"></span>
        <label class="switch" title="On / off"><input type="checkbox" data-int-toggle="${d.id}" ${c.enabled ? 'checked' : ''}><span></span></label></div>
      <div class="small">${esc(d.desc)}</div>
      <div class="small muted int-works">${esc(d.works)}</div>
      <div class="int-acts">${actBtn('int-config', d.id, 'Configure')}${testable ? actBtn('int-test', d.id, 'Test', 'ghost') : ''}${c.lastTest ? `<span class="small ${c.lastTest.ok ? 'ok-text' : 'bad-text'}">${esc(c.lastTest.msg)} · ${fmtDate(c.lastTest.at.slice(0, 10))}</span>` : ''}</div>
    </div>`;
  }
  function customCard() {
    const c = intCfg('custom'); c.hooks = c.hooks || [];
    const st = !c.enabled ? ['off', 'Off'] : c.hooks.length ? ['ok', `${c.hooks.length} webhook${c.hooks.length === 1 ? '' : 's'}`] : ['warn', 'Add a webhook'];
    return `<div class="int-card int-wide">
      <div class="int-head"><span class="sdot sdot-${st[0]}"></span><span class="int-ic">${icon('plus')}</span><div class="int-title">Custom integrations</div><span class="small muted">${st[1]}</span><span class="spacer"></span>
        <label class="switch"><input type="checkbox" data-int-toggle="custom" ${c.enabled ? 'checked' : ''}><span></span></label></div>
      <div class="small">Connect any other service: when something happens here (a sale, a payment, an approved return), the server sends the details to the address you enter.</div>
      <div class="small muted int-works">${SERVER ? 'Works now with the server.' : 'Needs the server (node server.js).'}</div>
      ${c.hooks.length ? `<div class="hook-list">${c.hooks.map(h => `<div class="hook-row"><div><span class="strong">${esc(h.name)}</span><div class="small muted ellipsis">${esc(h.url)} · ${esc((h.events || []).map(e => HOOK_EVENTS.find(x => x[0] === e)?.[1] || e).join(', ') || 'no events')}</div></div>${actBtn('hook-edit', h.id, 'Edit', 'ghost')}${SERVER ? actBtn('hook-test', h.id, 'Test', 'ghost') : ''}${actBtn('hook-del', h.id, 'Delete', 'ghost danger')}</div>`).join('')}</div>` : ''}
      <div class="int-acts">${actBtn('hook-edit', '', icon('plus') + 'Add webhook')}</div>
    </div>`;
  }
  VIEWS.settings = () => {
    const f = db.settings.firm, pr = db.settings.profile || {};
    const tabs = `<div class="tabs settings-tabs">${SETTINGS_TABS.map(([k, l]) => `<button type="button" data-settings-tab="${k}" class="${settingsTab === k ? 'active' : ''}">${l}</button>`).join('')}</div>`;
    let body = '';
    if (settingsTab === 'business') {
      body = `<section class="card"><div class="card-head"><h2 class="card-title">Business</h2><div class="spacer"></div>${actBtn('open-profile', '', 'Profile & logo', 'ghost')}${actBtn('open-settings', '', 'Edit business details', 'primary')}</div>
        <div class="card-body">${detailGrid([['Business name', esc(f.name || '—')], ['Tagline', esc(f.tagline ?? 'Pharma Suite')], ['Owner', esc([pr.name, pr.role].filter(Boolean).join(' · ') || '—')], ['Address', esc(addrText(f) || '—')], ['Phone', esc(f.phone || '—')], ['GSTIN', esc(f.gstin || '—')], ['Drug licences', esc(dlText(f) || '—')], ['FSSAI', esc(f.fssai || '—')], ['Bank details', esc(f.bank || '—')], ['Default CD %', dec(db.settings.defaultCd || 0)], ['Bill paper size', esc(PRINT_SIZES[printSize()].label)]])}</div></section>`;
    } else if (settingsTab === 'integrations') {
      const counts = { ok: 0, warn: 0, off: 0 }; INT_DEFS.forEach(d => counts[intStatus(d)[0]]++);
      body = `<div class="small muted int-legend"><span class="sdot sdot-ok"></span> Working · <span class="sdot sdot-warn"></span> Needs attention · <span class="sdot sdot-off"></span> Off &nbsp;—&nbsp; ${counts.ok} working, ${counts.warn} need attention, ${counts.off} off${SERVER ? '' : ' · Keys for WhatsApp, Razorpay and other services can be saved only when the dashboard runs on the server (node server.js).'}</div>
        <div class="int-grid">${INT_DEFS.map(intCard).join('')}${customCard()}</div>`;
    } else if (settingsTab === 'agents') {
      body = `<div class="int-grid">${Object.keys(AGENT_DEFS).map(id => agentCard(id, true)).join('')}</div>`;
    } else {
      const last = db.settings.lastBackup;
      body = `<div class="grid g-2">
        <section class="card"><div class="card-head"><h2 class="card-title">Backup</h2></div><div class="card-body">
          <p class="small" style="margin-top:0">Last backup downloaded: <b>${last ? fmtDate(last) : 'never'}</b>${last && daysFrom(last) < -(intCfg('backups').remindDays || 7) ? ' <span class="pill warn">Due</span>' : ''}. ${SERVER ? 'Data is on the server — also copy the server’s data folder regularly.' : 'Data is only in this browser — download a backup regularly.'}</p>
          <div class="toolbar">${actBtn('export-data', '', icon('upload') + 'Download backup (JSON)', 'primary')}<label class="btn sm">Restore backup<input type="file" id="restoreFile" accept="application/json,.json" hidden></label></div>
          <div class="small muted" style="margin-top:8px">Bill copies and licence files are stored separately in this browser and are not in the backup.</div></div></section>
        <section class="card"><div class="card-head"><h2 class="card-title">Sample data</h2>${db.settings.demo ? pill('Sample data loaded') : ''}</div><div class="card-body">
          <p class="small" style="margin-top:0">The app starts with sample products, chemists and bills so you can try it. When you are ready, start with empty data — your business details, settings, integrations and the hospital directory are kept.</p>
          <div class="toolbar">${actBtn('empty-data', '', 'Start with empty data', 'danger-solid')}${actBtn('reset-data', '', 'Reset to sample data', 'ghost danger')}</div></div></section>
      </div>`;
    }
    return tabs + body;
  };
  ACTIONS['int-config'] = id => {
    const d = intDef(id); if (!d) return; const c = intCfg(id);
    const fieldHtml = f => {
      const shown = fieldShown(f, c) ? '' : 'hidden';
      const wrap = inner => `<div class="field ${f.type === 'textarea' ? 'full' : ''} ${shown}" ${f.when ? `data-when="${f.when}"` : ''}><label for="f-${f.k}">${esc(f.label)}${f.required ? ' *' : ''}</label>${inner}</div>`;
      if (f.type === 'select') return wrap(`<select id="f-${f.k}" name="${f.k}" ${f.k === 'mode' ? 'data-int-mode' : ''}>${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(c[f.k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`);
      if (f.type === 'check') return `<div class="field ${shown}" ${f.when ? `data-when="${f.when}"` : ''}><label>&nbsp;</label><label class="check-line"><input type="checkbox" name="${f.k}" ${c[f.k] ? 'checked' : ''}> ${esc(f.label)}</label></div>`;
      if (f.type === 'browserkey') return wrap(`<input id="f-${f.k}" name="${f.k}" type="password" autocomplete="off" placeholder="${getApiKey() ? 'Saved in this browser — type to replace' : 'sk-ant-…'}">${getApiKey() ? '<label class="check-line small"><input type="checkbox" name="clear_key"> Remove the saved key</label>' : ''}`);
      if (f.type === 'secret') {
        if (!SERVER) return wrap(`<input disabled placeholder="Start the server to save this safely"><div class="small muted">Keys are stored on the server only, never in the browser.</div>`);
        const m = secretMask[id]?.[f.k];
        return wrap(`<input id="f-${f.k}" name="${f.k}" type="password" autocomplete="new-password" placeholder="${m ? `Saved (…${esc(m.last4)}) — type to replace` : ''}">${m ? `<label class="check-line small"><input type="checkbox" name="clear_${f.k}"> Remove the saved value</label>` : ''}`);
      }
      return wrap(`<input id="f-${f.k}" name="${f.k}" type="${f.type === 'number' ? 'number' : 'text'}" value="${esc(c[f.k] ?? '')}" placeholder="${esc(f.placeholder || '')}" autocomplete="off">`);
    };
    openModal({
      title: d.name, size: 'lg', submitLabel: 'Save',
      body: `<div class="small">${esc(d.desc)}</div><div class="small muted">${esc(d.works)}</div>
        <label class="check-line"><input type="checkbox" name="enabled" ${c.enabled ? 'checked' : ''}> Turned on</label>
        <div class="form-grid">${d.fields.map(fieldHtml).join('')}</div>`,
      onSubmit: v => {
        c.enabled = !!v.enabled;
        const sec = {};
        d.fields.forEach(f => {
          if (f.type === 'browserkey') { if (v.clear_key) setApiKey(''); else if (String(v[f.k] || '').trim()) setApiKey(v[f.k].trim()); return; }
          if (f.type === 'secret') { if (v['clear_' + f.k]) sec[f.k] = null; else if (String(v[f.k] || '').trim()) sec[f.k] = v[f.k].trim(); return; }
          if (f.type === 'check') { c[f.k] = !!v[f.k]; return; }
          if (v[f.k] !== undefined) c[f.k] = f.type === 'number' ? num(v[f.k]) : String(v[f.k]).trim();
        });
        delete c.lastTest;
        const done = () => { closeModal(false); refresh(); toast(`${d.name} saved.`); };
        if (SERVER && Object.keys(sec).length) { api('PUT', `api/secrets/${encodeURIComponent(id)}`, { fields: sec }).then(loadSecretMask).then(done).catch(err => toast(err.message)); return false; }
        return `${d.name} saved.`;
      },
    });
  };
  ACTIONS['int-test'] = async id => {
    const d = intDef(id); const c = intCfg(id);
    toast(`Testing ${d.name}…`);
    let res;
    try {
      if (id === 'ai') {
        if (!getApiKey()) throw new Error('Enter the Anthropic API key first.');
        const Anthropic = await loadSdk();
        const client = new Anthropic({ apiKey: getApiKey(), dangerouslyAllowBrowser: true });
        const m = await client.messages.create({ model: aiModel('agent'), max_tokens: 16, messages: [{ role: 'user', content: 'Reply with the word OK.' }] });
        res = { ok: true, msg: `Key works (${m.model})` };
      } else res = await api('POST', `api/int/test/${encodeURIComponent(id)}`, {});
    } catch (err) { res = { ok: false, msg: id === 'ai' && err?.status ? aiErrorText(err, null, false) : (err.message || 'Could not connect') }; }
    c.lastTest = { ok: !!res.ok, msg: res.msg || (res.ok ? 'OK' : 'Failed'), at: new Date().toISOString() };
    refresh(); toast(`${d.name}: ${c.lastTest.msg}`);
  };
  ACTIONS['hook-edit'] = hid => {
    const c = intCfg('custom'); c.hooks = c.hooks || [];
    const h = c.hooks.find(x => x.id === hid) || { name: '', url: '', header: 'Authorization', events: ['sale.created'] };
    const m = secretMask['custom:' + h.id]?.key;
    openModal({
      title: hid ? `Edit ${h.name}` : 'Add webhook', size: 'lg', submitLabel: 'Save webhook',
      body: `<div class="form-grid">
          ${field('Name', 'name', { value: h.name, required: true, attrs: 'placeholder="e.g. My accounting sheet"' })}
          ${field('Address (URL)', 'url', { type: 'url', value: h.url, required: true, attrs: 'placeholder="https://…"' })}
          ${field('Header name for the key (optional)', 'header', { value: h.header || '' })}
          ${SERVER ? field('Key / token (optional)', 'key', { type: 'password', value: '', attrs: `autocomplete="new-password" placeholder="${m ? `Saved (…${esc(m.last4)}) — type to replace` : ''}"` }) : '<div class="field"><label>Key / token</label><input disabled placeholder="Needs the server"></div>'}
        </div>
        <div class="field"><label>Send when</label>${HOOK_EVENTS.map(([k, l]) => `<label class="check-line"><input type="checkbox" name="ev_${k.replace('.', '_')}" ${(h.events || []).includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div>`,
      onSubmit: v => {
        if (!/^https:\/\//i.test(v.url.trim())) { toast('The address must start with https://'); return false; }
        const rec = hid ? h : { id: uid() };
        Object.assign(rec, { name: v.name.trim(), url: v.url.trim(), header: (v.header || '').trim(), events: HOOK_EVENTS.map(e => e[0]).filter(e => v['ev_' + e.replace('.', '_')]) });
        if (!hid) c.hooks.push(rec);
        if (SERVER && String(v.key || '').trim()) { api('PUT', `api/secrets/${encodeURIComponent('custom:' + rec.id)}`, { fields: { key: v.key.trim() } }).then(loadSecretMask).then(() => { closeModal(false); refresh(); toast('Webhook saved.'); }).catch(err => toast(err.message)); return false; }
        return 'Webhook saved.';
      },
    });
  };
  ACTIONS['hook-del'] = hid => { const c = intCfg('custom'); const h = (c.hooks || []).find(x => x.id === hid); if (!h) return; confirmModal(`Delete ${h.name}?`, 'This cannot be undone.', 'Delete', () => { c.hooks = c.hooks.filter(x => x !== h); if (SERVER) api('PUT', `api/secrets/${encodeURIComponent('custom:' + h.id)}`, { fields: { key: null } }).then(loadSecretMask).catch(() => {}); return `${h.name} deleted.`; }); };
  ACTIONS['hook-test'] = async hid => { save(); try { const r = await api('POST', `api/int/test/${encodeURIComponent('custom:' + hid)}`, {}); toast(r.msg || (r.ok ? 'OK' : 'Failed')); } catch (err) { toast(err.message); } };
  ACTIONS['empty-data'] = () => confirmModal('Start with empty data?', 'All products, stock, chemists, customers, suppliers, bills, orders, returns, enquiries and doctors are removed. Your business details, profile, settings, integrations and the hospital directory are kept. Download a backup first if you may need the sample data. This cannot be undone.', 'Start empty', () => {
    Object.assign(db, { products: [], batches: [], chemists: [], suppliers: [], sales: [], pos: [], grns: [], pinvoices: [], customers: [], inquiries: [], returns: [], doctors: [], approvals: [], agentLog: [], reminders: [], purchaseReturns: [], recalls: [], schemes: [], schemeClaims: [], visits: [], gstr2b: [], tempLog: [], auditLog: [] });
    db.settings.demo = false; entry = null; Object.keys(listState).forEach(k => delete listState[k]);
    return 'Data cleared — you are starting fresh.';
  });

  // ----- Approvals inbox & sending -----
  const approvalById = id => (db.approvals || []).find(a => a.id === id);
  function upsertApproval(item) {
    const ex = db.approvals.find(a => a.key === item.key && a.status === 'Pending');
    if (ex) { Object.assign(ex, item, { id: ex.id, created: ex.created, status: 'Pending', updated: new Date().toISOString() }); return 0; }
    db.approvals.unshift({ id: uid(), status: 'Pending', created: new Date().toISOString(), ...item });
    return 1;
  }
  function closeStale(agent, keep) { db.approvals.forEach(a => { if (a.agent === agent && a.status === 'Pending' && !keep.has(a.key)) Object.assign(a, { status: 'Dismissed', done: new Date().toISOString(), note: 'No longer needed' }); }); }
  function doneApproval(id, note) { const a = approvalById(id); if (a) Object.assign(a, { status: 'Done', done: new Date().toISOString(), note: note || '' }); }
  function logAgent(agent, msg) { db.agentLog.unshift({ at: new Date().toISOString(), agent, msg }); if (db.agentLog.length > 300) db.agentLog.length = 300; }
  const phone10 = v => String(v || '').replace(/\D/g, '').replace(/^(91|0)(?=[6-9]\d{9}$)/, '');
  const fillTpl = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? '').replace(/\n{3,}/g, '\n\n').trim();
  const upiText = (amount, note) => { const p = intCfg('payments'); if (!p.enabled || !p.upiId) return ''; return `UPI: ${p.upiId}${amount ? ` · ₹${dec(amount)}` : ''}`; };
  let sendState = null;
  function openSendDialog(o) {
    sendState = o;
    const ph = phone10(o.phone);
    openModal({
      title: o.title || 'Send message', size: 'lg', submitLabel: 'Mark as sent',
      body: `<div class="send-to"><div><div class="small muted">To</div><div class="strong">${esc(o.name || '')}</div><div class="small">${ph ? esc(ph) : '<span class="bad-text">No mobile number saved</span>'}${o.email ? ' · ' + esc(o.email) : ''}</div></div>
          ${o.payAmount ? `<button type="button" class="btn sm" data-send="paylink">${icon('rupee')}${rzpReady() ? 'Add Razorpay payment link' : 'Add UPI details'}</button>` : ''}</div>
        <div class="field"><label for="sendText">Message — you can edit it</label><textarea id="sendText" rows="9">${esc(o.text || '')}</textarea></div>
        <div class="send-btns">
          <button type="button" class="btn primary" data-send="wa" ${ph ? '' : 'disabled'}>${icon('chat')}${waCloudReady() ? 'Send on WhatsApp' : 'Open in WhatsApp'}</button>
          <button type="button" class="btn" data-send="sms" ${ph ? '' : 'disabled'}>SMS</button>
          <button type="button" class="btn" data-send="email" ${o.email ? '' : 'disabled'}>Email</button>
          <button type="button" class="btn ghost" data-send="copy">Copy text</button>
        </div>
        <div class="small muted">${waCloudReady() ? 'WhatsApp sends directly through your Business API number.' : 'WhatsApp, SMS and email open with the message typed — you press send there.'} After sending, press “Mark as sent” so the agent does not remind again too soon.</div>`,
      onSubmit: () => { markSent('manual'); return 'Marked as sent.'; },
    });
  }
  function markSent(channel) {
    const o = sendState; if (!o) return;
    if (o.approvalId) doneApproval(o.approvalId, `Sent (${channel})`);
    if (o.reminderKey) db.reminders.push({ date: todayIso, key: o.reminderKey, channel, amount: o.payAmount || 0 });
    if (o.onSent) o.onSent(channel);
    logAgent(o.agent || 'manual', `${o.title || 'Message'} → ${o.name || ''} (${channel})`);
    save();
  }
  async function handleSend(kind) {
    const o = sendState; if (!o) return;
    const text = $('#sendText').value.trim(); const ph = phone10(o.phone);
    const openLink = url => { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); };
    if (kind === 'copy') { try { await navigator.clipboard.writeText(text); toast('Copied.'); } catch { toast('Could not copy — select the text and copy it.'); } return; }
    if (kind === 'paylink') {
      let add = '';
      if (rzpReady()) { try { const r = await api('POST', 'api/int/razorpay/link', { amount: o.payAmount, description: o.payNote || 'Payment', name: o.name, phone: ph, ref: `${o.reminderKey || 'pay'}-${Date.now()}`.slice(0, 40) }); add = `Pay online: ${r.url}`; } catch (err) { toast(err.message); return; } }
      else { add = upiText(o.payAmount); if (!add) { toast('Add your UPI ID in Settings → Integrations → Online payments.'); return; } }
      $('#sendText').value = `${text}\n${add}`; return;
    }
    if (kind === 'wa') {
      if (waCloudReady()) {
        try { const w = intCfg('whatsapp'); await api('POST', 'api/int/whatsapp/send', o.template && w.template ? { to: ph, template: w.template, lang: w.lang, params: o.templateParams } : { to: ph, text }); markSent('WhatsApp API'); closeModal(false); refresh(); toast('Sent on WhatsApp.'); } catch (err) { toast(err.message); }
        return;
      }
      openLink(`https://wa.me/91${ph}?text=${encodeURIComponent(text)}`); markSent('WhatsApp'); closeModal(false); refresh(); toast('WhatsApp opened with the message — press send there.'); return;
    }
    if (kind === 'sms') { openLink(`sms:+91${ph}?body=${encodeURIComponent(text)}`); markSent('SMS'); closeModal(false); refresh(); return; }
    if (kind === 'email') { const e = intCfg('email'); openLink(`mailto:${encodeURIComponent(o.email)}?subject=${encodeURIComponent(o.subject || `${db.settings.firm.name}`)}&body=${encodeURIComponent(text + (e.fromName ? `\n\n${e.fromName}` : ''))}`); markSent('Email'); closeModal(false); refresh(); }
  }

  // ----- The five agents -----
  const DEFAULT_REMINDER = 'Namaste {party} ji,\n{firm} ki taraf se yaad dilana tha: aapke {count} bill ({bills}) ka ₹{amount} baaki hai — sabse purana {days} din purana hai.\nKripya jaldi bhugtan kar dein.\n{pay}\nDhanyavaad';
  const DEFAULT_ODREPLY = 'Namaste {party} ji, aapke order ke liye:\n{lines}\n— {firm}';
  const AGENT_DEFS = {
    orderdesk: { name: 'Order Desk', icon: 'chat', auto: false, desc: 'Paste an order message (WhatsApp, SMS, email or phone notes). AI matches the items to your products and stock, then you make a bill, save an enquiry or reply with availability.', defaults: { enabled: true, reply: DEFAULT_ODREPLY } },
    stock: { name: 'Stock & Purchase', icon: 'box', auto: true, desc: 'Every morning: items running low (from sales and open enquiries/orders), near-expiry and slow-moving stock, and draft purchase orders grouped by supplier.', defaults: { enabled: true, auto: true, time: '09:00', coverDays: 30, lookbackDays: 60, nearExpiryDays: 90, slowDays: 90, useEnquiries: true } },
    collections: { name: 'Collections', icon: 'rupee', auto: true, desc: 'Every day: overdue bills party by party, with a ready reminder (and UPI / payment link) for you to send.', defaults: { enabled: true, auto: true, time: '10:00', minAmount: 500, repeatDays: 7, includeCustomers: false, template: DEFAULT_REMINDER } },
    compliance: { name: 'Compliance', icon: 'file', auto: true, desc: 'Every day: expired or expiring drug licences and FSSAI, missing licences, wrong GSTINs — for chemists, suppliers and your firm. Can block billing to a chemist with an expired licence. GST summary for returns.', defaults: { enabled: true, auto: true, time: '09:00', warnDays: 60, blockExpired: true, checkGstin: true } },
    briefing: { name: 'Daily Briefing', icon: 'spark', auto: true, desc: 'Every morning: yesterday’s sales and collections, today’s follow-ups, approvals waiting, stock and licence alerts, and where demand is coming from.', defaults: { enabled: true, auto: true, time: '08:30' } },
  };
  function agentCfg(id) {
    const all = db.settings.agents || (db.settings.agents = {});
    const c = all[id] || (all[id] = {});
    Object.entries(AGENT_DEFS[id].defaults).forEach(([k, v]) => { if (c[k] === undefined) c[k] = v; });
    return c;
  }
  const AGENT_FIELDS = {
    orderdesk: [{ k: 'reply', label: 'Availability reply — {party} {lines} {firm}', type: 'textarea' }],
    stock: [{ k: 'coverDays', label: 'Keep stock for (days of sales)', type: 'number' }, { k: 'lookbackDays', label: 'Average sales over the last (days)', type: 'number' }, { k: 'nearExpiryDays', label: 'Near expiry within (days)', type: 'number' }, { k: 'slowDays', label: 'Slow-moving if not sold for (days)', type: 'number' }, { k: 'useEnquiries', label: 'Count open enquiries and chemist orders as demand', type: 'check' }],
    collections: [{ k: 'minAmount', label: 'Remind only if overdue amount is at least (₹)', type: 'number' }, { k: 'repeatDays', label: 'Do not remind the same party again within (days)', type: 'number' }, { k: 'includeCustomers', label: 'Also remind walk-in customers', type: 'check' }, { k: 'template', label: 'Reminder message — {party} {amount} {count} {bills} {days} {firm} {pay}', type: 'textarea' }],
    compliance: [{ k: 'warnDays', label: 'Warn this many days before a licence expires', type: 'number' }, { k: 'blockExpired', label: 'Stop billing a chemist whose drug licence has expired (you can override)', type: 'check' }, { k: 'checkGstin', label: 'Check GSTIN check digits', type: 'check' }],
    briefing: [],
  };
  const agentName = id => AGENT_DEFS[id]?.name || (id === 'manual' ? 'You' : id);

  // Stock & Purchase
  function runStockAgent() {
    const c = agentCfg('stock'); const since = addDays(todayIso, -c.lookbackDays);
    const sold = {}; db.sales.filter(x => x.date >= since).forEach(x => x.lines.forEach(l => { sold[l.productId] = (sold[l.productId] || 0) + l.qty + (l.free || 0); }));
    const asked = {};
    if (c.useEnquiries) {
      db.inquiries.filter(inqOpen).forEach(q => q.items.forEach(i => { if (i.productId) asked[i.productId] = (asked[i.productId] || 0) + i.qty; }));
      chemOrders.filter(o => ['New', 'Accepted', 'Arranging'].includes(o.status)).forEach(o => o.lines.forEach(l => { if (l.productId) asked[l.productId] = (asked[l.productId] || 0) + l.qty; }));
    }
    const plines = purchaseLines();
    const sc = agentCfg('supplier'), best = sc.enabled && sc.preferBest ? bestSupplierMap() : {};
    const lastSup = pid => best[pid] || plines.find(x => x.productId === pid)?.supplierId || [...db.batches].reverse().find(b => b.productId === pid && b.supplierId)?.supplierId || '';
    const groups = {};
    db.products.forEach(p => {
      const daily = (sold[p.id] || 0) / c.lookbackDays, have = sellableQty(p.id), want = asked[p.id] || 0;
      const target = Math.ceil(daily * c.coverDays) + want;
      const low = have < (p.reorder || 0);
      if (have >= target && !low) return;
      if (!daily && !want && !low) return;
      const q = Math.max(target - have, low ? (p.reorder || 0) * 2 - have : 0, 1);
      const sid = lastSup(p.id);
      (groups[sid] = groups[sid] || []).push({ productId: p.id, qty: q, rate: p.pts, why: `${qty(have)} in stock · ~${qty(Math.round(daily * 30))}/month${want ? ` · ${qty(want)} asked` : ''}` });
    });
    const keep = new Set(); let made = 0;
    Object.entries(groups).forEach(([sid, lines]) => {
      const key = 'po:' + (sid || 'none'); keep.add(key);
      made += upsertApproval({ agent: 'stock', kind: 'po', key, title: sid ? `Draft purchase order — ${sup(sid)?.name || sid} (${lines.length} item${lines.length === 1 ? '' : 's'})` : `Items to order — no supplier on record (${lines.length})`, detail: lines.slice(0, 5).map(l => `${prod(l.productId)?.name}: order ${qty(l.qty)} (${l.why})`).concat(lines.length > 5 ? [`…and ${lines.length - 5} more`] : []), payload: { supplierId: sid, lines: lines.map(({ productId, qty: q, rate }) => ({ productId, qty: q, rate })) } });
    });
    const near = db.batches.filter(b => avail(b) > 0 && expDays(b.expiry) <= c.nearExpiryDays);
    if (near.length) {
      keep.add('stock:expiry');
      const exp = near.filter(b => expDays(b.expiry) < 0);
      made += upsertApproval({ agent: 'stock', kind: 'info', key: 'stock:expiry', title: `${near.length} batch${near.length === 1 ? '' : 'es'} expired or expiring within ${c.nearExpiryDays} days`, detail: [`${exp.length} already expired · stock value ${money(near.reduce((a, b) => a + batchAmount(b), 0))}`, ...near.sort((a, b) => a.expiry.localeCompare(b.expiry)).slice(0, 4).map(b => `${prod(b.productId)?.name} · ${b.batch} · exp ${isoToExp(b.expiry)} · ${qty(avail(b))}`), 'Sell these first, or return them to the supplier for expiry credit.'], payload: { go: 'stock', tab: 'near' } });
    }
    const slowSince = addDays(todayIso, -c.slowDays);
    const soldRecently = new Set(); db.sales.filter(x => x.date >= slowSince).forEach(x => x.lines.forEach(l => soldRecently.add(l.productId)));
    const slow = db.products.filter(p => sellableQty(p.id) > 0 && !soldRecently.has(p.id));
    if (slow.length) {
      keep.add('stock:slow');
      made += upsertApproval({ agent: 'stock', kind: 'info', key: 'stock:slow', title: `${slow.length} item${slow.length === 1 ? '' : 's'} not sold in ${c.slowDays} days`, detail: slow.slice(0, 5).map(p => `${p.name} · ${qty(sellableQty(p.id))} in stock`), payload: { go: 'stock' } });
    }
    closeStale('stock', keep);
    return { made, summary: `${Object.keys(groups).length} purchase order draft(s), ${near.length} near-expiry batch(es), ${slow.length} slow item(s)` };
  }
  // Collections
  function runCollectionsAgent() {
    const c = agentCfg('collections'); const parties = {};
    db.sales.forEach(x => {
      if (balance(x) <= 0.5 || saleStatus(x) !== 'Overdue') return;
      const isChem = x.party.type === 'chemist'; if (!isChem && !c.includeCustomers) return;
      const key = isChem ? 'chemist:' + x.party.chemistId : 'customer:' + x.party.customerId;
      (parties[key] = parties[key] || []).push(x);
    });
    const keep = new Set(); let made = 0, skipped = 0;
    Object.entries(parties).forEach(([key, bills]) => {
      const [type, id] = key.split(':');
      const amount = round2(bills.reduce((a, x) => a + balance(x), 0));
      const net = partyDue(db.sales.filter(x => type === 'chemist' ? x.party.chemistId === id : x.party.customerId === id));
      const due = Math.min(amount, net);
      if (due < c.minAmount) return;
      const recent = db.reminders.some(r => r.key === key && r.date >= addDays(todayIso, -c.repeatDays));
      if (recent) { skipped++; return; }
      const name = type === 'chemist' ? chem(id)?.name : custById(id)?.name;
      const days = Math.max(...bills.map(x => -daysFrom(x.date)));
      keep.add('rem:' + key);
      made += upsertApproval({ agent: 'collections', kind: 'reminder', key: 'rem:' + key, title: `Payment reminder — ${name}: ${money(due)} overdue`, detail: [`${bills.length} bill${bills.length === 1 ? '' : 's'}: ${bills.map(x => x.no).join(', ')}`, `Oldest ${days} days · total balance with returns ${money(net)}`], payload: { type, id, amount: due, bills: bills.map(x => x.no), days } });
    });
    closeStale('collections', keep);
    return { made, summary: `${keep.size} part${keep.size === 1 ? 'y' : 'ies'} to remind${skipped ? `, ${skipped} reminded recently` : ''}` };
  }
  // GSTIN check digit (mod-36 checksum)
  function gstinOk(g) {
    g = String(g || '').toUpperCase().trim();
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
    const cs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; let sum = 0;
    for (let i = 0; i < 14; i++) { const v = cs.indexOf(g[i]) * (i % 2 + 1); sum += Math.floor(v / 36) + (v % 36); }
    return cs[(36 - (sum % 36)) % 36] === g[14];
  }
  // Compliance
  function runComplianceAgent() {
    const c = agentCfg('compliance'); const keep = new Set(); let made = 0, issues = 0;
    const check = (kind, x, label, act) => {
      if (!x) return;
      const out = [];
      const lic = (v, what) => { if (!v) return; const d = daysFrom(v); if (d < 0) out.push(`${what} expired on ${fmtDate(v)}`); else if (d <= c.warnDays) out.push(`${what} expires on ${fmtDate(v)} (${d} days)`); };
      lic(x.dlValid, 'Drug licence'); lic(x.fssaiValid, 'FSSAI licence');
      if (kind === 'chemist' && x.status === 'Active' && !x.dl1) out.push('No drug licence number saved');
      if (kind !== 'customer' && !x.gstin && kind !== 'firm') out.push('No GSTIN saved (billed as unregistered)');
      if (c.checkGstin && x.gstin && !gstinOk(x.gstin)) out.push(`GSTIN ${x.gstin} looks wrong (format or check digit)`);
      if (!out.length) return;
      issues += out.length;
      const key = `lic:${kind}:${x.id || 'firm'}`; keep.add(key);
      made += upsertApproval({ agent: 'compliance', kind: 'info', key, title: `${label} — ${out.length} issue${out.length === 1 ? '' : 's'}`, detail: out, payload: { act } });
    };
    check('firm', { ...db.settings.firm, id: 'firm' }, `${db.settings.firm.name || 'Your firm'} (your firm)`, ['open-settings', '']);
    db.chemists.filter(x => x.status !== 'On hold').forEach(x => check('chemist', x, `Chemist ${x.name}`, ['view-chemist', x.id]));
    db.suppliers.forEach(x => check('supplier', x, `Supplier ${x.name}`, ['edit-supplier', x.id]));
    closeStale('compliance', keep);
    return { made, summary: `${keep.size} part${keep.size === 1 ? 'y' : 'ies'} with ${issues} licence/GSTIN issue${issues === 1 ? '' : 's'}` };
  }
  // Daily briefing
  function briefingLines() {
    const yday = addDays(todayIso, -1);
    const sY = db.sales.filter(x => x.date === yday);
    const payY = db.sales.flatMap(x => payList(x).filter(p => p.date === yday)).reduce((a, p) => a + p.amount, 0);
    const recv = db.chemists.reduce((a, c) => a + Math.max(0, chemOutstanding(c.id)), 0);
    const overdue = db.sales.filter(x => saleStatus(x) === 'Overdue');
    const pend = db.approvals.filter(a => a.status === 'Pending' && a.kind !== 'briefing');
    const g = intCfg('geodemand'); const since = addDays(todayIso, -(g.days || 30));
    const byDist = {};
    if (g.enabled && g.useSales !== false) db.sales.filter(x => x.date >= since).forEach(x => { const p = x.party.type === 'chemist' ? chem(x.party.chemistId) : custById(x.party.customerId); const d = p?.district || 'Unknown'; byDist[d] = (byDist[d] || 0) + x.total; });
    const askedOut = {};
    if (g.enabled && g.useEnquiries !== false) db.inquiries.filter(q => q.date >= since).forEach(q => q.items.forEach(i => { if (!i.productId || sellableQty(i.productId) <= 0) askedOut[i.name] = (askedOut[i.name] || 0) + i.qty; }));
    const lastBk = db.settings.lastBackup, bkDays = intCfg('backups').remindDays || 7;
    const L = [
      `Good morning! ${db.settings.firm.name} — ${fmtDate(todayIso)}`,
      `Yesterday: ${sY.length} bill${sY.length === 1 ? '' : 's'} for ${money(sY.reduce((a, x) => a + x.total, 0))}, ${money(payY)} collected.`,
      `To collect: ${money(recv)} from chemists — ${overdue.length} overdue bill${overdue.length === 1 ? '' : 's'} worth ${money(overdue.reduce((a, x) => a + balance(x), 0))}.`,
      `Waiting for you: ${pend.length} approval${pend.length === 1 ? '' : 's'}${pend.length ? ` (${Object.entries(pend.reduce((m, a) => (m[agentName(a.agent)] = (m[agentName(a.agent)] || 0) + 1, m), {})).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}.`,
      `Follow-ups due: ${db.inquiries.filter(inqDue).length} enquir${db.inquiries.filter(inqDue).length === 1 ? 'y' : 'ies'} · return requests: ${db.returns.filter(r => r.status === 'Requested').length} · chemist orders new: ${chemOrders.filter(o => o.status === 'New').length}.`,
      `Stock: ${lowStock().length} below reorder level, ${db.batches.filter(b => avail(b) > 0 && expDays(b.expiry) <= 90).length} batches expiring within 90 days.`,
    ];
    const top = Object.entries(byDist).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) L.push(`Demand by district (last ${g.days || 30} days): ${top.map(([d, v]) => `${d} ${money(v)}`).join(', ')}.`);
    const miss = Object.entries(askedOut).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (miss.length) L.push(`Asked for but not in stock: ${miss.map(([n, q]) => `${n} (${q})`).join(', ')}.`);
    if (!lastBk || daysFrom(lastBk) < -bkDays) L.push(`Backup: ${lastBk ? `last one ${-daysFrom(lastBk)} days ago` : 'never downloaded'} — please download a backup (Settings → Data & backups).`);
    return L;
  }
  function runBriefingAgent() {
    const L = briefingLines();
    db.approvals.forEach(a => { if (a.kind === 'briefing' && a.status === 'Pending' && a.key !== 'brief:' + todayIso) Object.assign(a, { status: 'Done', done: new Date().toISOString(), note: 'Older briefing' }); });
    const made = upsertApproval({ agent: 'briefing', kind: 'briefing', key: 'brief:' + todayIso, title: `Daily briefing — ${fmtDate(todayIso)}`, detail: L.slice(1), payload: { lines: L } });
    return { made, summary: 'Briefing ready' };
  }
  const AGENT_RUN = { stock: runStockAgent, collections: runCollectionsAgent, compliance: runComplianceAgent, briefing: runBriefingAgent };
  function runAgent(id, auto) {
    const c = agentCfg(id); const r = AGENT_RUN[id](auto);
    Object.assign(c, { lastRun: todayIso, lastRunAt: new Date().toISOString(), lastResult: r.summary });
    logAgent(id, `${auto ? 'Daily run' : 'Run now'}: ${r.summary}${r.made ? ` · ${r.made} new item${r.made === 1 ? '' : 's'}` : ''}`);
    return r.made;
  }
  function agentsTick() {
    if (!db) return;
    const hhmm = new Date().toTimeString().slice(0, 5); let made = 0, ran = 0;
    autoAgents().forEach(id => { const c = agentCfg(id); if (!c.enabled || !c.auto || c.lastRun === todayIso || hhmm < (c.time || '09:00')) return; made += runAgent(id, true); ran++; });
    if (!ran) return;
    save();
    if (!$('#modalBack').classList.contains('open') && !document.activeElement?.matches('input, select, textarea')) render(); else renderNav(route);
    if (made) toast(`Agents added ${made} item${made === 1 ? '' : 's'} to Approvals.`);
  }

  // Order Desk (AI)
  const OD_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['sender', 'lines', 'notes'],
    properties: {
      sender: { type: 'string', description: 'Shop or person name if the message says who it is from, else empty' },
      lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'product_id', 'qty', 'free'], properties: { text: { type: 'string' }, product_id: { type: 'string' }, qty: { type: 'number' }, free: { type: 'number' } } } },
      notes: { type: 'string' },
    },
  };
  let odState = null;
  ACTIONS['orderdesk'] = () => {
    odState = null;
    const partyOpts = `<option value="">Let AI find out from the message</option><optgroup label="Chemists">${db.chemists.map(c => [c.id, c.name]).sort(byName).map(([v, l]) => `<option value="chemist|${esc(v)}">${esc(l)}</option>`).join('')}</optgroup><optgroup label="Customers">${(db.customers || []).map(c => [c.id, c.name]).sort(byName).map(([v, l]) => `<option value="customer|${esc(v)}">${esc(l)}</option>`).join('')}</optgroup>`;
    openModal({
      title: 'Order Desk — read an order message', size: 'xl', submitLabel: 'Read with AI',
      body: `<div class="form-grid">
          <div class="field full"><label for="odText">Paste the order message *</label><textarea id="odText" name="odText" rows="6" placeholder="e.g. Sharma Medicos: Dolo 650 - 10 strip, Pan 40 5 box, Moisturex lotion 2"></textarea></div>
          <div class="field"><label for="odParty">From</label><select id="odParty" name="odParty">${partyOpts}</select></div>
        </div>
        <div id="odResult"></div>
        <div class="small muted">${getApiKey() ? `Uses ${esc(MODEL_OPTS.find(m => m[0] === aiModel('agent'))?.[1] || aiModel('agent'))}. The message and your product list are sent to Anthropic to be read.` : 'Needs the Anthropic API key — Settings → Integrations → AI providers.'}</div>`,
      onSubmit: v => {
        const text = String(v.odText || '').trim();
        if (!text) { toast('Paste the order message first.'); return false; }
        if (!getApiKey()) { toast('Add the Anthropic API key in Settings → Integrations → AI providers.'); return false; }
        readOrderMessage(text, v.odParty || ''); return false;
      },
    });
  };
  async function readOrderMessage(text, partyPick) {
    const btn = $('#modalFoot [data-submit]'); if (btn) { btn.disabled = true; btn.textContent = 'Reading…'; }
    const list = db.products.map(p => `${p.id} | ${p.name} | ${p.pack || ''} | ${company(p.companyId)?.name || ''}`).join('\n');
    const prompt = `You read an order message sent to a pharmaceutical distributor in India by a chemist or a customer. Messages are short and may be in Hindi, English or Hinglish, with abbreviations such as tab, cap, syp, inj, strip, box, pcs.

Product list (ID | name | pack | company):
${list}

For each item ordered, return:
- text: the item exactly as written
- product_id: the ID of the matching product from the list, only when you are confident. Strength and form must match (for example 500 mg and 650 mg are different products). Use an empty string when there is no confident match.
- qty: the quantity ordered (use 1 if none is written); free: free quantity if the message asks for it, else 0.
Ignore greetings and signatures. Put anything else useful (delivery time, urgency, scheme or rate asked) in notes, briefly.

Message:
"""${text}"""`;
    try {
      const x = await callClaudeJson([], prompt, OD_SCHEMA, 2000, aiModel('agent'));
      let party = null;
      if (partyPick) { const [type, id] = partyPick.split('|'); party = { type, id }; }
      else if (x.sender) {
        const s = norm(x.sender);
        const c = db.chemists.find(c => norm(c.name) === s || norm(c.name).includes(s) || s.includes(norm(c.name)));
        const cu = !c && (db.customers || []).find(c => norm(c.name) === s);
        if (c) party = { type: 'chemist', id: c.id }; else if (cu) party = { type: 'customer', id: cu.id };
      }
      odState = { text, sender: x.sender || '', notes: x.notes || '', party, lines: (x.lines || []).map(l => ({ text: l.text, productId: prod(l.product_id) ? l.product_id : '', qty: Math.max(1, Math.round(num(l.qty)) || 1), free: Math.max(0, Math.round(num(l.free))) })) };
      logAgent('orderdesk', `Read an order${x.sender ? ` from ${x.sender}` : ''}: ${odState.lines.length} item(s), ${odState.lines.filter(l => l.productId).length} matched`);
      save(); renderOdResult();
    } catch (err) { toast(err.message || 'Could not read the message.'); }
    finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = 'Read again'; } }
  }
  function renderOdResult() {
    const box = $('#odResult'); if (!box || !odState) return;
    const opts = sel => `<option value="">— not matched —</option>${[...db.products].sort((a, b) => a.name.localeCompare(b.name)).map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)} · ${esc(p.pack || '')}</option>`).join('')}`;
    const pv = odState.party ? `${odState.party.type}|${odState.party.id}` : '';
    if (pv) $('#odParty').value = pv;
    box.innerHTML = `<div class="od-result">
      <div class="small">${odState.sender ? `Message says it is from <b>${esc(odState.sender)}</b>. ` : ''}${odState.party ? '' : '<span class="bad-text">Choose who it is from above before making a bill.</span>'}${odState.notes ? ` Notes: ${esc(odState.notes)}` : ''}</div>
      <div class="lines"><div class="table-wrap"><table><thead><tr><th>Written as</th><th>Product</th><th>Qty</th><th>Free</th><th class="r">In stock</th></tr></thead>
        <tbody>${odState.lines.map((l, i) => { const have = l.productId ? sellableQty(l.productId) : 0; return `<tr data-odl="${i}"><td>${esc(l.text)}</td><td><select data-od="productId">${opts(l.productId)}</select></td><td><input data-od="qty" type="number" min="1" value="${l.qty}" style="width:70px"></td><td><input data-od="free" type="number" min="0" value="${l.free || 0}" style="width:60px"></td><td class="r">${l.productId ? (have >= l.qty ? pill('In stock') : have > 0 ? pill(`Short ${l.qty - have}`) : pill('Not in stock')) : '—'}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">No items found in the message.</td></tr>'}</tbody></table></div></div>
      <div class="toolbar"><button type="button" class="btn primary" data-od-act="bill">Make sale bill</button><button type="button" class="btn" data-od-act="enquiry">Save as enquiry</button><button type="button" class="btn" data-od-act="reply">Reply with availability</button></div>
    </div>`;
  }
  function odParty() { const v = $('#odParty')?.value || ''; if (!v) return null; const [type, id] = v.split('|'); return { type, id }; }
  function odAction(kind) {
    if (!odState) return;
    const party = odParty();
    if (!party) { toast('Choose who the order is from.'); return; }
    const c = party.type === 'chemist' ? chem(party.id) : null, cu = party.type === 'customer' ? custById(party.id) : null;
    if (kind === 'bill') {
      if (c && c.status !== 'Active') { toast(`${c.name} is ${c.status}. Activate them before billing.`); return; }
      const lines = odState.lines.filter(l => l.productId && sellableQty(l.productId) > 0).map(l => { const p = prod(l.productId), b = sellableBatches(p.id)[0]; return { productId: p.id, batchId: b.id, qty: Math.min(l.qty, avail(b)), free: Math.min(l.free || 0, Math.max(0, avail(b) - l.qty)), rate: c ? p.ptr : round2(p.mrp / (1 + p.gst / 100)), cd: c ? c.cd || 0 : 0, td: c ? c.td || 0 : 0 }; });
      if (!lines.length) { toast('None of the matched items are in stock. Save it as an enquiry instead.'); return; }
      const left = odState.lines.length - lines.length;
      closeModal(false);
      saleModal(null, c ? { chemistId: c.id, lines } : { customerId: cu.id, lines });
      logAgent('orderdesk', `Bill drafted for ${c?.name || cu?.name}`);
      if (left) toast(`${left} item(s) not matched or not in stock were left out.`);
      return;
    }
    if (kind === 'enquiry') {
      const no = nextNum('ENQ-', db.inquiries, 1001);
      db.inquiries.push({ no, created: todayIso, party: c ? { type: 'chemist', chemistId: c.id } : { type: 'customer', customerId: cu.id }, date: todayIso, source: 'WhatsApp', followUp: addDays(todayIso, 1), status: 'Open', items: odState.lines.map(l => ({ productId: l.productId, name: l.productId ? prod(l.productId).name : l.text, qty: l.qty, note: l.productId ? '' : 'Not matched' })), notes: [odState.notes, `Message: ${odState.text}`].filter(Boolean).join('\n').slice(0, 1000) });
      logAgent('orderdesk', `Enquiry ${no} saved for ${c?.name || cu?.name}`);
      closeModal(false); refresh(); toast(`${no} saved.`); return;
    }
    if (kind === 'reply') {
      const lines = odState.lines.map(l => { if (!l.productId) return `• ${l.text}: we will check and confirm`; const p = prod(l.productId), have = sellableQty(p.id); return `• ${p.name}: ${have >= l.qty ? 'available' : have > 0 ? `${have} available now, rest in a few days` : 'not in stock — we will arrange'}`; }).join('\n');
      closeModal(false);
      openSendDialog({ agent: 'orderdesk', title: 'Reply with availability', name: c?.name || cu?.name, phone: c?.phone || cu?.phone, email: c?.email || cu?.email, text: fillTpl(agentCfg('orderdesk').reply, { party: c?.owner || c?.name || cu?.name, lines, firm: db.settings.firm.name }) });
    }
  }

  // Agents page
  function agentCard(id, inSettings) {
    const d = AGENT_DEFS[id], c = agentCfg(id);
    const pend = (db.approvals || []).filter(a => a.agent === id && a.status === 'Pending').length;
    const st = !c.enabled ? ['off', 'Off'] : ['ok', d.auto ? (c.auto ? `Daily at ${c.time}` : 'Manual only') : 'On demand'];
    return `<div class="int-card agent-card">
      <div class="int-head"><span class="sdot sdot-${st[0]}"></span><span class="int-ic">${icon(d.icon)}</span><div class="int-title">${esc(d.name)}</div><span class="small muted">${st[1]}</span><span class="spacer"></span>
        <label class="switch" title="On / off"><input type="checkbox" data-agent-toggle="${id}" ${c.enabled ? 'checked' : ''}><span></span></label></div>
      <div class="small">${esc(d.desc)}</div>
      <div class="small muted int-works">${c.lastRunAt ? `Last run ${new Date(c.lastRunAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} — ${esc(c.lastResult || '')}` : id === 'orderdesk' ? (getApiKey() ? 'Ready.' : 'Needs the Anthropic API key (Integrations → AI providers).') : id === 'assistant' ? (assistantStatus() || (c.enabled ? 'Answering chemists in the portal.' : 'Switch it on to show the chat in the chemist portal.')) : 'Not run yet.'}${pend ? ` · <b>${pend} waiting</b>` : ''}</div>
      <div class="int-acts">${id === 'orderdesk' ? actBtn('orderdesk', '', icon('chat') + 'Read an order', 'primary') : id === 'assistant' ? actBtn('assistant-log', '', icon('chat') + 'Conversations', inSettings ? '' : 'primary') : actBtn('agent-run', id, 'Run now', inSettings ? '' : 'primary')}${actBtn('agent-config', id, 'Settings', 'ghost')}${agentExtraBtns(id)}</div>
    </div>`;
  }
  VIEWS.agents = () => {
    const ap = db.approvals || [];
    const pend = ap.filter(a => a.status === 'Pending');
    const brief = pend.find(a => a.kind === 'briefing');
    return `
      <div class="grid g-4">
        ${kpi('Waiting for you', qty(pend.filter(a => a.kind !== 'briefing').length), 'Approvals and alerts')}
        ${kpi('Agents on', `${Object.keys(AGENT_DEFS).filter(id => agentCfg(id).enabled).length} / ${Object.keys(AGENT_DEFS).length}`, 'Daily agents run when the dashboard is open')}
        ${kpi('Reminders sent (7 days)', qty((db.reminders || []).filter(r => r.date >= addDays(todayIso, -7)).length), 'By WhatsApp, SMS or email')}
        ${kpi('Done this week', qty(ap.filter(a => a.status === 'Done' && (a.done || '') >= addDays(todayIso, -7)).length), 'Approved and acted on')}
      </div>
      ${brief ? `<section class="card brief-card"><div class="card-head"><h2 class="card-title">${esc(brief.title)}</h2><div class="spacer"></div>${actBtn('appr-open', brief.id, 'Share', 'ghost')}${actBtn('appr-done', brief.id, 'Mark read', 'ghost')}</div><div class="card-body"><ul class="brief-list">${brief.detail.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div></section>` : ''}
      ${useList({
        key: 'approvals', title: 'Approvals',
        actions: actBtn('agents-run-all', '', 'Run all agents now', 'ghost'),
        tabs: [{ id: 'pend', label: 'Waiting', filter: a => a.status === 'Pending' && a.kind !== 'briefing' }, { id: 'Done', label: 'Done', filter: a => a.status === 'Done' }, { id: 'Dismissed', label: 'Dismissed', filter: a => a.status === 'Dismissed' }, { id: 'all', label: 'All' }],
        filters: [{ k: 'agent', label: 'Agent', options: Object.entries(AGENT_DEFS).map(([k, v]) => [k, v.name]), test: (a, v) => a.agent === v }],
        rows: () => [...(db.approvals || [])].sort((a, b) => (b.updated || b.created).localeCompare(a.updated || a.created)),
        text: a => [a.title, ...(a.detail || [])].join(' '),
        empty: 'Nothing waiting. Agents put purchase orders, payment reminders and alerts here for you to approve.',
        columns: [
          { h: 'Agent', c: a => `<span class="agent-tag">${icon(AGENT_DEFS[a.agent]?.icon || 'spark')}${esc(agentName(a.agent))}</span>` },
          { h: 'Item', c: a => `<span class="strong">${esc(a.title)}</span>${(a.detail || []).slice(0, 3).map(l => `<div class="small muted">${esc(l)}</div>`).join('')}${a.note ? `<div class="small">${esc(a.note)}</div>` : ''}` },
          { h: 'When', c: a => `<span class="small">${new Date(a.updated || a.created).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>` },
          { h: 'Status', c: a => pill(a.status === 'Pending' ? 'Waiting' : a.status) },
          { h: '', c: a => a.status !== 'Pending' ? '' : rowActs(actBtn('appr-open', a.id, APPR_LABEL[a.kind] || 'Open', 'primary'), a.kind === 'returnadvice' ? actBtn('view-return', a.payload.no, 'View', 'ghost') : '', a.kind === 'info' ? actBtn('appr-done', a.id, 'Done', 'ghost') : '', actBtn('appr-dismiss', a.id, 'Dismiss', 'ghost')) },
        ],
      })}
      <div class="int-grid">${Object.keys(AGENT_DEFS).map(id => agentCard(id, false)).join('')}</div>
      <section class="card"><div class="card-head"><h2 class="card-title">Activity</h2><span class="hint">What the agents and you did</span></div>
        <div class="alert-list">${(db.agentLog || []).slice(0, 25).map(l => `<div class="alert-item"><span class="agent-tag">${icon(AGENT_DEFS[l.agent]?.icon || 'user')}${esc(agentName(l.agent))}</span><div style="flex:1;min-width:0" class="small">${esc(l.msg)}</div><span class="small muted">${new Date(l.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>`).join('') || '<div class="empty">No activity yet.</div>'}</div></section>`;
  };
  ACTIONS['agent-run'] = id => { if (!AGENT_RUN[id]) return; const made = runAgent(id, false); refresh(); toast(`${agentName(id)}: ${agentCfg(id).lastResult}${made ? ` — ${made} new` : ''}.`); };
  ACTIONS['agents-run-all'] = () => { let made = 0; autoAgents().forEach(id => { if (agentCfg(id).enabled) made += runAgent(id, false); }); refresh(); toast(`Agents ran — ${made} new item${made === 1 ? '' : 's'}.`); };
  ACTIONS['agent-config'] = id => {
    const d = AGENT_DEFS[id], c = agentCfg(id);
    const fs = AGENT_FIELDS[id] || [];
    openModal({
      title: `${d.name} — settings`, size: 'lg', submitLabel: 'Save',
      body: `<div class="small">${esc(d.desc)}</div>
        <div class="form-grid">
          <div class="field"><label>&nbsp;</label><label class="check-line"><input type="checkbox" name="enabled" ${c.enabled ? 'checked' : ''}> Agent turned on</label></div>
          ${d.auto ? `<div class="field"><label>&nbsp;</label><label class="check-line"><input type="checkbox" name="auto" ${c.auto ? 'checked' : ''}> Run by itself every day</label></div>${field('Run after (time)', 'time', { type: 'time', value: c.time || '09:00' })}` : ''}
          ${fs.map(f => f.type === 'check' ? `<div class="field full"><label class="check-line"><input type="checkbox" name="${f.k}" ${c[f.k] ? 'checked' : ''}> ${esc(f.label)}</label></div>` : f.type === 'textarea' ? `<div class="field full"><label for="f-${f.k}">${esc(f.label)}</label><textarea id="f-${f.k}" name="${f.k}" rows="6">${esc(c[f.k] || '')}</textarea></div>` : field(f.label, f.k, { type: 'number', value: c[f.k], attrs: 'min="0" step="1"' })).join('')}
        </div>
        ${d.auto ? '<div class="small muted">Daily agents run the first time the dashboard is open after this time each day. They only prepare items for you to approve — nothing is sent or ordered without you.</div>' : ''}`,
      onSubmit: v => {
        c.enabled = !!v.enabled; if (d.auto) { c.auto = !!v.auto; c.time = v.time || '09:00'; }
        fs.forEach(f => { c[f.k] = f.type === 'check' ? !!v[f.k] : f.type === 'number' ? Math.max(0, num(v[f.k])) : String(v[f.k] || '').trim() || d.defaults[f.k]; });
        return `${d.name} settings saved.`;
      },
    });
  };
  ACTIONS['appr-dismiss'] = id => { const a = approvalById(id); if (!a) return; Object.assign(a, { status: 'Dismissed', done: new Date().toISOString() }); logAgent('manual', `Dismissed: ${a.title}`); refresh(); };
  ACTIONS['appr-done'] = id => { const a = approvalById(id); if (!a) return; doneApproval(id, 'Seen'); refresh(); };
  ACTIONS['appr-open'] = id => {
    const a = approvalById(id); if (!a) return;
    if (APPR_HANDLERS[a.kind]) { APPR_HANDLERS[a.kind](a); return; }
    if (a.kind === 'po') { poModal(null, { supplierId: a.payload.supplierId, lines: a.payload.lines.filter(l => prod(l.productId)), approvalId: a.id }); return; }
    if (a.kind === 'reminder') {
      const { type, id: pid, amount, bills, days } = a.payload;
      const p = type === 'chemist' ? chem(pid) : custById(pid); if (!p) { toast('This party no longer exists.'); return; }
      const c = agentCfg('collections');
      openSendDialog({ agent: 'collections', approvalId: a.id, reminderKey: `${type}:${pid}`, title: `Payment reminder — ${p.name}`, name: p.name, phone: p.phone, email: p.email, payAmount: amount, payNote: `Bills ${bills.join(', ')}`, subject: `Payment reminder — ${db.settings.firm.name}`, template: true, templateParams: [p.owner || p.name, money(amount), bills.join(', ')],
        text: fillTpl(c.template, { party: p.owner || p.name, amount: dec(amount), count: bills.length, bills: bills.join(', '), days, firm: db.settings.firm.name, pay: upiText(amount) }) });
      return;
    }
    if (a.kind === 'briefing') {
      const pr = db.settings.profile || {};
      openSendDialog({ agent: 'briefing', approvalId: a.id, title: 'Share the daily briefing', name: pr.name || 'Me', phone: pr.phone || intCfg('whatsapp').businessNumber, email: pr.email, subject: `Daily briefing — ${fmtDate(todayIso)}`, text: a.payload.lines.join('\n') });
      return;
    }
    if (a.payload?.act) { const [act, aid] = a.payload.act; ACTIONS[act]?.(aid); return; }
    if (a.payload?.go) { if (a.payload.tab && listState[a.payload.go]) listState[a.payload.go].tab = a.payload.tab; location.hash = a.payload.go; }
  };

  // GST summary for the monthly return (GSTR-1 working)
  const plainNum = v => round2(v).toFixed(2); // CSV: no thousands separators
  ACTIONS['gst-export'] = () => {
    const prev = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1); const def = iso(prev).slice(0, 7);
    openModal({
      title: 'GST summary for a month', size: 'sm', submitLabel: 'Download CSV',
      body: `<div class="form-grid">${field('Month', 'month', { type: 'month', value: def, required: true, full: true })}</div><div class="small muted">B2B invoices (chemists with GSTIN), B2C totals by rate, HSN summary and credit notes from approved sales returns — a working sheet for GSTR-1. Check it with your accountant before filing.</div>`,
      onSubmit: v => {
        const m = v.month; if (!/^\d{4}-\d{2}$/.test(m)) { toast('Choose a month.'); return false; }
        const sales = db.sales.filter(x => x.date.slice(0, 7) === m);
        const rows = [['B2B invoices'], ['GSTIN', 'Party', 'Invoice no', 'Date', 'Invoice value', 'Rate %', 'Taxable', 'CGST', 'SGST']];
        const b2c = {}, hsn = {};
        sales.forEach(x => {
          const c = x.party.type === 'chemist' ? chem(x.party.chemistId) : null;
          Object.entries(x.slabs || {}).forEach(([rate, sl]) => {
            if (c?.gstin) rows.push([c.gstin, c.name, x.no, x.date, plainNum(x.total), rate, plainNum(sl.taxable), plainNum(sl.gst / 2), plainNum(sl.gst / 2)]);
            else { const k = rate; b2c[k] = b2c[k] || { taxable: 0, gst: 0 }; b2c[k].taxable += sl.taxable; b2c[k].gst += sl.gst; }
          });
          x.lines.forEach(l => { const p = prod(l.productId); const k = `${p?.hsn || ''}|${l.gst}`; const cl = calcLine(l); hsn[k] = hsn[k] || { qty: 0, taxable: 0, gst: 0 }; hsn[k].qty += l.qty + (l.free || 0); hsn[k].taxable += cl.taxable; hsn[k].gst += cl.gstA; });
        });
        rows.push([], ['B2C (unregistered) by rate'], ['Rate %', 'Taxable', 'CGST', 'SGST']);
        Object.entries(b2c).sort((a, b) => a[0] - b[0]).forEach(([r, x]) => rows.push([r, plainNum(x.taxable), plainNum(x.gst / 2), plainNum(x.gst / 2)]));
        rows.push([], ['HSN summary'], ['HSN', 'Rate %', 'Total qty', 'Taxable', 'CGST', 'SGST']);
        Object.entries(hsn).sort().forEach(([k, x]) => { const [h, r] = k.split('|'); rows.push([h, r, x.qty, plainNum(x.taxable), plainNum(x.gst / 2), plainNum(x.gst / 2)]); });
        rows.push([], ['Credit notes (approved sales returns)'], ['Note no', 'Date', 'Party', 'GSTIN', 'Against', 'Taxable', 'CGST', 'SGST', 'Total']);
        (db.returns || []).filter(r => r.status === 'Approved' && (r.approvedOn || r.date).slice(0, 7) === m).forEach(r => { const c = r.party.type === 'chemist' ? chem(r.party.chemistId) : null; rows.push([r.no, r.approvedOn || r.date, retPartyName(r), c?.gstin || '', [...new Set(r.lines.map(l => l.saleNo))].join(' '), plainNum(r.taxable), plainNum(r.gst / 2), plainNum(r.gst / 2), plainNum(r.total)]); });
        downloadText(`gst-summary-${m}.csv`, rows.map(r => r.map(csvCell).join(',')).join('\r\n'));
        logAgent('compliance', `GST summary downloaded for ${m}`);
        return `GST summary for ${m} downloaded.`;
      },
    });
  };

  // =====================================================================
  // Phase 2 agents: Purchase Intake, Returns & Expiry Claims, Enquiry Follow-up, Accounts Sync
  // =====================================================================
  const closeApprovalKey = (key, note) => (db.approvals || []).forEach(a => { if (a.key === key && a.status === 'Pending') Object.assign(a, { status: 'Done', done: new Date().toISOString(), note }); });

  // ----- Purchase returns (debit notes to suppliers) -----
  const PR_REASONS = ['Expiry claim', 'Near expiry', 'Damaged / broken', 'Wrong item received', 'Excess / not ordered', 'Rate difference', 'Other'];
  const prById = no => (db.purchaseReturns || []).find(x => x.no === no);
  const prTotals = lines => { const t = billCalc(lines); return { ...t, total: round2(t.taxable + t.gst), roundOff: 0 }; };
  let prDraft = { picks: {}, approvalId: '' };
  const prBatches = sid => db.batches.filter(b => b.supplierId === sid && avail(b) > 0).sort((a, b) => a.expiry.localeCompare(b.expiry));
  const prLineFrom = (b, pk) => ({ productId: b.productId, batchId: b.id, batch: b.batch, expiry: b.expiry, qty: pk.qty, free: pk.free, rate: b.rate, mrp: b.mrp, cd: b.cd || 0, td: b.td || 0, gst: b.gst });
  function renderPrLines() {
    const box = $('#prLines'); if (!box) return;
    const sid = $('#f-prSup')?.value;
    if (!sid) { box.innerHTML = '<div class="empty">Choose the supplier to see their stock with you.</div>'; updatePrSum(); return; }
    const rows = prBatches(sid);
    box.innerHTML = rows.length ? `<div class="lines"><div class="table-wrap"><table class="ret-table">
      <thead><tr><th></th><th>Item</th><th>Batch</th><th>Exp</th><th class="r">In stock</th><th>Return qty</th><th>Free back</th><th class="r">Rate</th><th class="r">GST</th><th class="r">Value</th></tr></thead>
      <tbody>${rows.map(b => { const pk = prDraft.picks[b.id]; const p = prod(b.productId); const st = batchStatus(b); return `<tr data-pkey="${esc(b.id)}" data-text="${esc(norm([p?.name, b.batch].join(' ')))}" class="${pk ? 'picked' : ''}">
        <td><input type="checkbox" class="cb" data-psel ${pk ? 'checked' : ''} aria-label="Tick batch"></td>
        <td><span class="strong">${esc(p?.name || '')}</span><div class="small muted">${esc(p?.pack || '')}</div></td>
        <td>${esc(b.batch)}</td><td>${isoToExp(b.expiry)}${st !== 'Good' ? ' ' + pill(st) : ''}</td>
        <td class="r">${qty(b.qty)}${b.free ? ` + ${qty(b.free)}` : ''}</td>
        <td><input data-pq="qty" type="number" min="0" max="${b.qty}" step="1" value="${pk ? pk.qty : ''}" placeholder="max ${b.qty}" style="width:84px"></td>
        <td><input data-pq="free" type="number" min="0" max="${b.free || 0}" step="1" value="${pk && pk.free ? pk.free : ''}" ${b.free ? '' : 'disabled'} placeholder="${b.free ? 'max ' + b.free : '—'}" style="width:70px"></td>
        <td class="r">${dec(b.rate)}</td><td class="r">${dec(b.gst)}%</td><td class="r num" data-pamt>${pk ? dec(prTotals([prLineFrom(b, pk)]).total) : '—'}</td></tr>`; }).join('')}</tbody></table></div></div>`
      : '<div class="empty">You have no stock from this supplier.</div>';
    filterPrLines(); updatePrSum();
  }
  function filterPrLines() { const q = norm($('#prSearch')?.value || ''); $$('#prLines tr[data-pkey]').forEach(tr => { tr.style.display = !q || tr.dataset.text.includes(q) || tr.classList.contains('picked') ? '' : 'none'; }); }
  function prPickedLines() { return Object.entries(prDraft.picks).map(([bid, pk]) => { const b = batchById(bid); return b && pk.qty + pk.free > 0 ? prLineFrom(b, pk) : null; }).filter(Boolean); }
  function updatePrSum() { const ls = prPickedLines(); const el = $('#prSum'); if (el) el.innerHTML = ls.length ? `<b>${ls.length}</b> batch${ls.length === 1 ? '' : 'es'} · ${qty(ls.reduce((a, l) => a + l.qty + l.free, 0))} units · debit note <b>${money2(prTotals(ls).total)}</b>` : 'Tick the batches going back and enter how many.'; }
  function prPick(tr, fromInput) {
    const b = batchById(tr.dataset.pkey); if (!b) return;
    const cb = $('[data-psel]', tr), qi = $('[data-pq=qty]', tr), fi = $('[data-pq=free]', tr);
    let q = Math.floor(num(qi.value)), f = Math.floor(num(fi.value));
    if (q > b.qty) { q = b.qty; qi.value = q; } if (f > (b.free || 0)) { f = b.free || 0; fi.value = f || ''; }
    if (!fromInput) { if (cb.checked && !q && !f) { q = b.qty; f = b.free || 0; qi.value = q || ''; fi.value = f || ''; } if (!cb.checked) { q = 0; f = 0; qi.value = ''; fi.value = ''; } }
    if (q + f > 0) { prDraft.picks[b.id] = { qty: q, free: f }; cb.checked = true; tr.classList.add('picked'); $('[data-pamt]', tr).textContent = dec(prTotals([prLineFrom(b, { qty: q, free: f })]).total); }
    else { delete prDraft.picks[b.id]; cb.checked = false; tr.classList.remove('picked'); $('[data-pamt]', tr).textContent = '—'; }
    updatePrSum();
  }
  function purchaseReturnModal(preset = {}) {
    prDraft = { picks: { ...(preset.picks || {}) }, approvalId: preset.approvalId || '' };
    openModal({
      title: 'New purchase return (debit note)', size: 'xl', submitLabel: 'Create debit note & take out of stock',
      body: `<div class="form-grid g4">
          ${field('Supplier', 'prSup', { required: true, value: preset.supplierId || '', options: [['', 'Select supplier'], ...db.suppliers.map(s => [s.id, s.name]).sort(byName)] })}
          ${field('Date', 'date', { type: 'date', value: todayIso, required: true, attrs: `max="${todayIso}"` })}
          ${field('Reason', 'reason', { value: preset.reason || PR_REASONS[0], options: PR_REASONS })}
          ${field('Supplier claim / credit note no.', 'ref', { value: '' })}
        </div>
        ${field('Note', 'note', { value: '', full: true, attrs: 'placeholder="Sent with whom, courier, claim form…"' })}
        <div class="ret-tools"><label class="search">${icon('search')}<input id="prSearch" placeholder="Filter by item or batch" autocomplete="off"></label><span class="small" id="prSum"></span></div>
        <div id="prLines"></div>
        <div class="small muted">The ticked quantities are taken out of stock now and the supplier’s payable goes down by the debit note value. Mark it settled when the supplier sends their credit note.</div>`,
      onSubmit: d => {
        const sid = d.prSup; if (!sid) { toast('Choose the supplier.'); return false; }
        const lines = prPickedLines().filter(l => batchById(l.batchId)?.supplierId === sid);
        if (!lines.length) { toast('Tick at least one batch and enter the quantity going back.'); return false; }
        for (const l of lines) { const b = batchById(l.batchId); if (l.qty > b.qty || l.free > (b.free || 0)) { toast(`${prod(l.productId)?.name}: more than in stock.`); return false; } }
        lines.forEach(l => { const b = batchById(l.batchId); b.qty -= l.qty; b.free = (b.free || 0) - l.free; });
        const no = nextNum('PR-', db.purchaseReturns, 1001);
        db.purchaseReturns.push({ no, date: d.date, supplierId: sid, lines, reason: d.reason, ref: (d.ref || '').trim(), note: (d.note || '').trim(), status: 'Sent', created: todayIso, ...prTotals(lines) });
        if (prDraft.approvalId) doneApproval(prDraft.approvalId, `Debit note ${no}`);
        logAgent(prDraft.approvalId ? 'retclaims' : 'manual', `Purchase return ${no} to ${sup(sid)?.name}: ${money2(prTotals(lines).total)}`);
        return `${no} created — ${qty(lines.reduce((a, l) => a + l.qty + l.free, 0))} units out of stock, ${money2(prTotals(lines).total)} debited to ${sup(sid)?.name}.`;
      },
    });
    renderPrLines();
  }
  VIEWS.preturns = () => {
    const prs = db.purchaseReturns || [];
    const open = prs.filter(x => x.status === 'Sent');
    return `
      <div class="grid g-4">
        ${kpi('Claims waiting for credit', compact(open.reduce((a, x) => a + x.total, 0)), `${open.length} debit note${open.length === 1 ? '' : 's'} sent`)}
        ${kpi('Settled this month', compact(prs.filter(x => x.status === 'Settled' && monthKey(x.settledOn || x.date) === thisM).reduce((a, x) => a + x.total, 0)), 'Credit received from suppliers')}
        ${kpi('Returned (all time)', compact(prs.reduce((a, x) => a + x.total, 0)), `${prs.length} debit notes`)}
        ${kpi('Expired stock still with you', compact(db.batches.filter(b => avail(b) > 0 && expDays(b.expiry) < 0).reduce((a, b) => a + batchAmount(b), 0)), 'Claim it back from suppliers')}
      </div>
      ${useList({
        key: 'preturns', title: 'Purchase returns (debit notes)',
        actions: actBtn('new-preturn', '', icon('plus') + 'New purchase return', 'primary'),
        tabs: [{ id: 'Sent', label: 'Waiting for credit', filter: x => x.status === 'Sent' }, { id: 'Settled', label: 'Settled', filter: x => x.status === 'Settled' }, { id: 'all', label: 'All' }],
        filters: [supplierFilter(x => x.supplierId), { k: 'reason', label: 'Reason', options: PR_REASONS.map(v => [v, v]), test: (x, v) => x.reason === v }],
        rows: () => [...(db.purchaseReturns || [])].sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no)),
        text: x => [x.no, sup(x.supplierId)?.name, x.reason, x.ref, ...x.lines.map(l => `${prod(l.productId)?.name} ${l.batch}`)].join(' '),
        empty: 'No purchase returns yet. The Returns & Expiry Claims agent drafts expiry claims for you.',
        columns: [
          { h: 'Debit note', c: x => `<a href="#" data-act="view-preturn" data-id="${esc(x.no)}" class="strong">${esc(x.no)}</a><div class="small muted">${fmtDate(x.date)}</div>` },
          { h: 'Supplier', c: x => `<a href="#" data-nav="folder/${esc(x.supplierId)}">${esc(sup(x.supplierId)?.name || '—')}</a>` },
          { h: 'Items', c: x => `<span class="small ellipsis" style="display:block;max-width:280px">${esc(x.lines.map(l => `${prod(l.productId)?.name || ''} (${l.batch}) × ${l.qty}${l.free ? '+' + l.free : ''}`).join(', '))}</span>` },
          { h: 'Reason', c: x => esc(x.reason || '—') },
          { h: 'Value', r: 1, c: x => money2(x.total) },
          { h: 'Status', c: x => pill(x.status === 'Sent' ? 'Waiting' : 'Done') + (x.ref ? `<div class="small muted">${esc(x.ref)}</div>` : '') },
          { h: '', c: x => rowActs(x.status === 'Sent' && actBtn('settle-preturn', x.no, 'Mark settled', 'ghost'), actBtn('del-preturn', x.no, 'Delete', 'ghost danger')) },
        ],
      })}`;
  };
  ACTIONS['new-preturn'] = sid => purchaseReturnModal({ supplierId: sid || '' });
  ACTIONS['view-preturn'] = no => {
    const x = prById(no); if (!x) return; const s = sup(x.supplierId);
    openModal({
      title: `Purchase return ${x.no}`, size: 'xl',
      extraFoot: `<div class="foot-left">${x.status === 'Sent' ? `<button type="button" class="btn" data-act="settle-preturn" data-id="${esc(x.no)}">Mark settled</button>` : ''}${printBtn()}</div>`,
      body: billBody({ title: 'DEBIT NOTE · PURCHASE RETURN', no: x.no, date: x.date, partyTitle: s?.name || '', partyLines: [s && addrText(s), `GSTIN: ${s?.gstin || '—'}`, s && dlText(s) && `DL No: ${dlText(s)}`], metaLines: [['Reason', x.reason || '—'], ['Status', x.status === 'Sent' ? 'Waiting for credit' : 'Settled'], ...(x.ref ? [['Supplier ref.', x.ref]] : [])], lines: x.lines, t: x }),
    });
  };
  ACTIONS['settle-preturn'] = no => {
    const x = prById(no); if (!x) return;
    openModal({ title: `Settle ${x.no}`, size: 'sm', submitLabel: 'Mark settled', body: `<div class="form-grid">${field('Supplier credit note no.', 'ref', { value: x.ref || '', full: true })}${field('Date', 'date', { type: 'date', value: todayIso, full: true })}</div>`, onSubmit: d => { Object.assign(x, { status: 'Settled', settledOn: d.date || todayIso, ref: (d.ref || '').trim() || x.ref }); return `${x.no} marked settled.`; } });
  };
  ACTIONS['del-preturn'] = no => {
    const x = prById(no); if (!x) return;
    confirmModal(`Delete ${x.no}?`, `The ${x.lines.length} batch line(s) go back into stock and the ${money2(x.total)} debit is removed. This cannot be undone.`, 'Delete', () => {
      x.lines.forEach(l => {
        let b = batchById(l.batchId) || db.batches.find(y => y.productId === l.productId && norm(y.batch) === norm(l.batch));
        if (!b) { b = { id: uid(), productId: l.productId, batch: l.batch, expiry: l.expiry, qty: 0, free: 0, rate: l.rate, mrp: l.mrp, cd: l.cd, td: l.td, gst: l.gst, supplierId: x.supplierId, source: `Restored from ${x.no}`, verified: true }; db.batches.push(b); }
        b.qty += l.qty; b.free = (b.free || 0) + (l.free || 0);
      });
      db.purchaseReturns = db.purchaseReturns.filter(y => y !== x); return `${no} deleted — stock restored.`;
    });
  };

  // ----- Purchase Intake: rate checks -----
  let lpCache = { key: '', map: {} };
  // Latest purchase line of a product (newest first), optionally before a given bill
  function lastBuy(pid, beforeDate, beforeNo) {
    const key = `${db.pinvoices.length}|${db.grns.length}|${db.pinvoices.at(-1)?.no || ''}|${db.grns.at(-1)?.no || ''}`;
    if (lpCache.key !== key) { const map = {}; purchaseLines().forEach(l => { (map[l.productId] = map[l.productId] || []).push(l); }); lpCache = { key, map }; }
    return (lpCache.map[pid] || []).find(l => l.docNo !== beforeNo && (!beforeDate || l.date <= beforeDate));
  }
  function priceChecks(l, p, warn) {
    const c = agentCfg('intake'); if (!c.enabled) return;
    const last = lastBuy(p.id);
    if (last && num(l.rate) > 0 && last.rate > 0) { const ch = (num(l.rate) - last.rate) / last.rate * 100; if (Math.abs(ch) >= c.rateAlertPct) warn(`Rate ${ch > 0 ? 'up' : 'down'} ${Math.abs(ch).toFixed(1)}% vs last purchase (₹${dec(last.rate)} on ${fmtDate(last.date)})`); }
    if (num(l.mrp) > 0 && p.mrp && Math.abs(num(l.mrp) - p.mrp) > 0.009) warn(`MRP changed: ₹${dec(p.mrp)} → ₹${dec(l.mrp)}`);
    if (p.gst != null && String(l.gst) !== '' && num(l.gst) !== num(p.gst)) warn(`GST ${dec(l.gst)}% but the product is set to ${dec(p.gst)}%`);
  }
  function suggestedPtr(p, minMarginPct) {
    const mrpEx = round2(num(p.mrp) / (1 + num(p.gst) / 100));
    return round2(Math.min(mrpEx, Math.max(salePtr(p.mrp, p.gst), num(p.pts) * (1 + minMarginPct / 100))));
  }
  function runIntakeAgent() {
    const c = agentCfg('intake'); const since = addDays(todayIso, -c.lookbackDays); const keep = new Set(); let made = 0;
    const changes = [];
    db.pinvoices.filter(p => p.date >= since).forEach(pi => piLines(pi).forEach(l => {
      const prev = lastBuy(l.productId, pi.date, pi.no);
      if (prev && prev.rate > 0 && l.rate > 0) { const ch = (l.rate - prev.rate) / prev.rate * 100; if (Math.abs(ch) >= c.rateAlertPct) changes.push({ pi, l, prev, ch }); }
    }));
    if (changes.length) {
      keep.add('intake:rates');
      made += upsertApproval({ agent: 'intake', kind: 'info', key: 'intake:rates', title: `${changes.length} purchase rate change${changes.length === 1 ? '' : 's'} in the last ${c.lookbackDays} days`, detail: changes.sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch)).slice(0, 6).map(x => `${prod(x.l.productId)?.name}: ₹${dec(x.prev.rate)} → ₹${dec(x.l.rate)} (${x.ch > 0 ? '+' : ''}${x.ch.toFixed(1)}%) · ${sup(x.pi.supplierId)?.name || ''} · ${x.pi.no}`), payload: { go: 'invoices' } });
    }
    db.products.forEach(p => {
      if (!p.mrp || !p.pts) return;
      const mrpEx = round2(p.mrp / (1 + num(p.gst) / 100));
      let why = '';
      if (num(p.ptr) < p.pts) why = `Sale rate ₹${dec(p.ptr)} is below the purchase rate ₹${dec(p.pts)} — selling at a loss`;
      else if (num(p.ptr) > mrpEx + 0.01) why = `Sale rate ₹${dec(p.ptr)} is above MRP without GST (₹${dec(mrpEx)})`;
      if (!why) return;
      const to = suggestedPtr(p, c.minMarginPct); if (Math.abs(to - num(p.ptr)) < 0.01) return;
      const key = 'price:' + p.id; keep.add(key);
      made += upsertApproval({ agent: 'intake', kind: 'price', key, title: `Fix sale rate — ${p.name}: ₹${dec(p.ptr)} → ₹${dec(to)}`, detail: [why, `MRP ₹${dec(p.mrp)} · GST ${dec(p.gst)}% · purchase ₹${dec(p.pts)}`], payload: { productId: p.id, ptr: to } });
    });
    const piDate = {}; db.pinvoices.forEach(pi => { piDate[pi.no] = pi.date; });
    const unver = db.batches.filter(b => !b.verified && avail(b) > 0).filter(b => { const no = /PI-\d+/.exec(b.source || '')?.[0]; const d = no && piDate[no]; return !d || d <= addDays(todayIso, -c.verifyDays); });
    if (unver.length) { keep.add('intake:verify'); made += upsertApproval({ agent: 'intake', kind: 'info', key: 'intake:verify', title: `${unver.length} stock line${unver.length === 1 ? '' : 's'} from uploaded bills still not checked`, detail: [`Older than ${c.verifyDays} days. Compare them with the paper bills and mark them checked in Stock Details.`, ...unver.slice(0, 4).map(b => `${prod(b.productId)?.name} · ${b.batch} · ${b.source || ''}`)], payload: { go: 'stock', tab: 'unver' } }); }
    closeStale('intake', keep);
    return { made, summary: `${changes.length} rate change(s), ${[...keep].filter(k => k.startsWith('price:')).length} sale rate(s) to fix, ${unver.length} unchecked line(s)` };
  }

  // ----- Returns & Expiry Claims -----
  function returnAdvice(r) {
    const c = agentCfg('retclaims'); const notes = [];
    r.lines.forEach(l => {
      const sl = db.sales.find(x => x.no === l.saleNo); const name = prod(l.productId)?.name || '';
      if (sl) { const age = Math.round((parse(r.date) - parse(sl.date)) / DAY); if (age > c.maxSaleDays) notes.push(`${name}: sold ${age} days ago (policy ${c.maxSaleDays})`); }
      if (/expir/i.test(r.reason || '') && l.expiry) {
        const left = Math.round((new Date(+l.expiry.slice(0, 4), +l.expiry.slice(5, 7), 0) - parse(r.date)) / DAY);
        if (left > c.acceptBeforeDays) notes.push(`${name}: still ${left} days to expiry (accept within ${c.acceptBeforeDays})`);
        if (left < -c.acceptAfterDays) notes.push(`${name}: expired ${-left} days ago (accept up to ${c.acceptAfterDays})`);
      }
    });
    if (/damag|broken/i.test(r.reason || '') && !String(r.note || '').trim()) notes.push('Damage reported without a note');
    return { verdict: notes.length ? 'Check' : 'Approve', notes };
  }
  function runRetClaimsAgent() {
    const c = agentCfg('retclaims'); const keep = new Set(); let made = 0, adv = 0, claims = 0;
    db.returns.filter(r => r.status === 'Requested').forEach(r => {
      const a = returnAdvice(r); r.advice = { ...a, at: todayIso }; adv++;
      const key = 'ret:' + r.no; keep.add(key);
      made += upsertApproval({ agent: 'retclaims', kind: 'returnadvice', key, title: `${a.verdict === 'Approve' ? 'Recommend approving' : 'Check before approving'} ${r.no} — ${retPartyName(r)}: ${money2(r.total)}`, detail: a.notes.length ? a.notes : [`${r.lines.length} line(s) · ${r.reason} · within your return policy`], payload: { no: r.no, verdict: a.verdict } });
    });
    const groups = {};
    db.batches.filter(b => avail(b) > 0 && b.supplierId && expDays(b.expiry) <= c.claimDays).forEach(b => { (groups[b.supplierId] = groups[b.supplierId] || []).push(b); });
    Object.entries(groups).forEach(([sid, bs]) => {
      const key = 'claim:' + sid; keep.add(key); claims++;
      const val = bs.reduce((a, b) => a + batchAmount(b), 0);
      made += upsertApproval({ agent: 'retclaims', kind: 'claim', key, title: `Expiry claim to ${sup(sid)?.name || sid}: ${bs.length} batch${bs.length === 1 ? '' : 'es'}, ~${money(val)}`, detail: bs.slice(0, 5).map(b => `${prod(b.productId)?.name} · ${b.batch} · exp ${isoToExp(b.expiry)} · ${qty(b.qty)}${b.free ? '+' + qty(b.free) : ''}`).concat(bs.length > 5 ? [`…and ${bs.length - 5} more`] : []), payload: { supplierId: sid, picks: Object.fromEntries(bs.map(b => [b.id, { qty: b.qty, free: b.free || 0 }])) } });
    });
    closeStale('retclaims', keep);
    return { made, summary: `${adv} return request(s) checked, ${claims} expiry claim draft(s)` };
  }

  // ----- Enquiry Follow-up -----
  const DEFAULT_FOLLOWUP = 'Namaste {party} ji,\n{firm} se — aapne {date} ko in items ke baare mein poocha tha:\n{lines}\nOrder confirm karna ho to bas reply kar dein.';
  function inquiryLinesText(q) {
    const isChem = q.party.type === 'chemist';
    return q.items.map(i => { if (!i.productId) return `• ${i.name}: we are checking`; const p = prod(i.productId), have = sellableQty(p.id); return `• ${p.name}: ${have >= i.qty ? 'available' : have > 0 ? `${qty(have)} available now` : 'not in stock yet — we will arrange'}${have > 0 ? ` · rate ₹${dec(isChem ? p.ptr : p.mrp)}` : ''}`; }).join('\n');
  }
  function runFollowupAgent() {
    const c = agentCfg('followup'); const keep = new Set(); let made = 0, due = 0, avl = 0, stale = 0;
    db.inquiries.filter(inqOpen).forEach(q => {
      const isDue = q.followUp && q.followUp <= todayIso;
      const nowAvail = q.items.some(i => i.productId && sellableQty(i.productId) >= i.qty) && q.availNotifiedOn !== todayIso && (!q.lastContact || q.lastContact < todayIso);
      const isStale = q.followUp && q.followUp <= addDays(todayIso, -c.staleDays);
      if (isStale) { const key = 'lost:' + q.no; keep.add(key); stale++; made += upsertApproval({ agent: 'followup', kind: 'lost', key, title: `${q.no} — ${inqPartyName(q)}: no progress for ${-daysFrom(q.followUp)} days. Mark as lost?`, detail: [q.items.map(i => `${i.name} × ${i.qty}`).join(', ') || q.notes || '', 'Or edit the enquiry and set a new follow-up date.'], payload: { no: q.no } }); return; }
      if (!isDue && !nowAvail) return;
      if (isDue) due++; else avl++;
      const key = 'fu:' + q.no; keep.add(key);
      made += upsertApproval({ agent: 'followup', kind: 'followup', key, title: isDue ? `Follow up — ${inqPartyName(q)} (${q.no})` : `Good news for ${inqPartyName(q)} — asked-for items now in stock (${q.no})`, detail: inquiryLinesText(q).split('\n'), payload: { no: q.no, avail: !isDue } });
    });
    closeStale('followup', keep);
    return { made, summary: `${due} follow-up(s) due, ${avl} back-in-stock message(s), ${stale} old enquir${stale === 1 ? 'y' : 'ies'}` };
  }

  // ----- Accounts Sync: statements, bank statement matching, Tally export -----
  const DEFAULT_STATEMENT = 'Namaste {party} ji,\n{firm} — aapka account statement ({month}):\nOpening: ₹{opening}\nBills: ₹{billed}\nPayments & returns: ₹{credits}\nClosing: ₹{closing}\nAaj tak ka balance: ₹{today}\n{pay}\nKoi farq ho to batayein. Dhanyavaad';
  function runAccountsAgent() {
    const c = agentCfg('accounts'); const keep = new Set(); let made = 0, n = 0;
    const thisMonth = todayIso.slice(0, 7);
    if (c.statements && c.lastStatementMonth !== thisMonth && +todayIso.slice(8, 10) >= Math.min(28, Math.max(1, c.statementDay || 1))) {
      const pm = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1); const from = iso(pm), to = iso(new Date(TODAY.getFullYear(), TODAY.getMonth(), 0));
      const parties = [...db.chemists.map(x => ['chemist', x.id]), ...(c.includeCustomers ? (db.customers || []).map(x => ['customer', x.id]) : [])];
      parties.forEach(([type, id]) => {
        const L = ledgerCalc(type, id, from, to); const now = ledgerCalc(type, id).close;
        if (Math.abs(L.close) < c.minBalance) return; // only parties with a balance at the end of the statement month
        const key = `st:${type}:${id}:${thisMonth}`; keep.add(key); n++;
        made += upsertApproval({ agent: 'accounts', kind: 'statement', key, title: `Statement for ${ledgerPartyName(type, id)} — ${monthLabel(from.slice(0, 7))}: closing ${balTxt(L.close, type)}`, detail: [`Opening ${balTxt(L.open, type)} · bills ${dec(L.dr)} · payments & returns ${dec(L.cr)}`, `Balance today ${balTxt(now, type)}`], payload: { type, id, from, to, month: monthLabel(from.slice(0, 7)) } });
      });
      c.lastStatementMonth = thisMonth;
    } else (db.approvals || []).forEach(a => { if (a.agent === 'accounts' && a.kind === 'statement' && a.status === 'Pending') keep.add(a.key); });
    (db.approvals || []).forEach(a => { if (a.agent === 'accounts' && a.kind === 'bankmatch' && a.status === 'Pending') keep.add(a.key); if (a.agent === 'accounts' && a.key?.startsWith('bank:unmatched') && a.status === 'Pending') keep.add(a.key); });
    closeStale('accounts', keep);
    return { made, summary: n ? `${n} statement(s) ready to send` : 'No statements due this month' };
  }
  function parseAnyDate(s) {
    s = String(s || '').trim(); let m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(s))) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`; }
    if ((m = /^(\d{1,2})[\s\-]([A-Za-z]{3})[A-Za-z]*[\s\-,]+(\d{2,4})/.exec(s))) { const mo = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[2].toLowerCase()) / 3 + 1; if (mo < 1) return ''; let y = +m[3]; if (y < 100) y += 2000; return `${y}-${String(mo).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`; }
    return '';
  }
  const NAME_SKIP = new Set(['MEDICAL', 'MEDICOS', 'MEDICOSE', 'PHARMACY', 'PHARMA', 'STORE', 'STORES', 'CHEMIST', 'CHEMISTS', 'HALL', 'AGENCY', 'AGENCIES', 'MEDICINE', 'MEDICINES', 'HEALTH', 'CARE', 'CENTRE', 'CENTER', 'SHOP', 'TRADERS', 'ENTERPRISES']);
  function matchBankCredit(amount, narr) {
    const n = norm(narr);
    const parties = [...db.chemists.map(x => ({ type: 'chemist', id: x.id, name: x.name, phone: x.phone, bills: db.sales.filter(s => s.party.chemistId === x.id && balance(s) > 0.5) })), ...(db.customers || []).map(x => ({ type: 'customer', id: x.id, name: x.name, phone: x.phone, bills: db.sales.filter(s => s.party.customerId === x.id && balance(s) > 0.5) }))].filter(p => p.bills.length);
    const tokens = name => norm(name).split(' ').filter(w => w.length >= 4 && !NAME_SKIP.has(w));
    let cands = parties.filter(p => (p.phone && n.includes(p.phone)) || tokens(p.name).some(t => n.includes(t)));
    let how = 'name in the narration';
    if (cands.length > 1) { const exact = cands.filter(p => p.bills.some(b => Math.abs(balance(b) - amount) < 0.01) || Math.abs(p.bills.reduce((a, b) => a + balance(b), 0) - amount) < 0.01); if (exact.length === 1) cands = exact; }
    if (!cands.length) { cands = parties.filter(p => p.bills.some(b => Math.abs(balance(b) - amount) < 0.01)); how = 'same amount as one open bill (no name found)'; if (cands.length !== 1) return null; }
    if (cands.length !== 1) return { ambiguous: cands.map(p => p.name) };
    const p = cands[0];
    const bills = [...p.bills].sort((a, b) => a.date.localeCompare(b.date));
    const exact = bills.find(b => Math.abs(balance(b) - amount) < 0.01);
    const alloc = []; let left = amount;
    (exact ? [exact] : bills).forEach(b => { if (left <= 0.005) return; const take = round2(Math.min(left, balance(b))); alloc.push({ no: b.no, amount: take }); left = round2(left - take); });
    return { type: p.type, id: p.id, name: p.name, alloc, extra: left, how };
  }
  function importBankCsv(text) {
    const rows = parseCsv(text.replace(/^﻿/, ''));
    const hi = rows.findIndex(r => r.some(c => /date/i.test(c)) && r.some(c => /credit|deposit|\bcr\b/i.test(c)));
    if (hi < 0) throw new Error('Could not find the header row. The CSV needs a Date column and a Credit / Deposit column.');
    const head = rows[hi].map(h => h.trim().toLowerCase());
    const col = re => head.findIndex(h => re.test(h));
    const ci = { date: col(/^(txn |transaction |value )?date/), narr: col(/narration|description|particular|remark|details/), credit: col(/credit|deposit|\bcr\b/), ref: col(/ref|chq|cheque|utr/) };
    if (ci.date < 0 || ci.credit < 0) throw new Error('The CSV needs a Date column and a Credit / Deposit column.');
    let matched = 0, unmatched = [], seen = 0;
    rows.slice(hi + 1).forEach(r => {
      const amount = round2(num(r[ci.credit])); if (!(amount > 0)) return;
      const date = parseAnyDate(r[ci.date]) || todayIso; const narr = [r[ci.narr], ci.ref >= 0 ? r[ci.ref] : ''].filter(Boolean).join(' ').trim();
      const key = `bank:${date}:${amount}:${norm(narr).slice(0, 60)}`;
      if (db.approvals.some(a => a.key === key)) { seen++; return; }
      const m = matchBankCredit(amount, narr);
      if (!m || m.ambiguous) { unmatched.push(`${fmtDate(date)} · ₹${dec(amount)} · ${narr.slice(0, 60)}${m?.ambiguous ? ` (could be: ${m.ambiguous.slice(0, 3).join(', ')})` : ''}`); return; }
      matched++;
      upsertApproval({ agent: 'accounts', kind: 'bankmatch', key, title: `Bank credit ₹${dec(amount)} on ${fmtDate(date)} → ${m.name}`, detail: [narr.slice(0, 120), `Against ${m.alloc.map(a => `${a.no} ₹${dec(a.amount)}`).join(', ')}${m.extra > 0.005 ? ` · ₹${dec(m.extra)} more than the open bills` : ''}`, `Matched by ${m.how} — please check`], payload: { date, amount, narr: narr.slice(0, 80), type: m.type, id: m.id, alloc: m.alloc, extra: m.extra } });
    });
    if (unmatched.length) upsertApproval({ agent: 'accounts', kind: 'info', key: 'bank:unmatched:' + todayIso + ':' + Date.now(), title: `${unmatched.length} bank credit${unmatched.length === 1 ? '' : 's'} could not be matched`, detail: unmatched.slice(0, 8).concat(unmatched.length > 8 ? [`…and ${unmatched.length - 8} more`] : []).concat(['Record these with “Receive” on the sale bill.']), payload: { go: 'sales' } });
    logAgent('accounts', `Bank statement read: ${matched} matched, ${unmatched.length} not matched${seen ? `, ${seen} already seen` : ''}`);
    return { matched, unmatched: unmatched.length, seen };
  }
  ACTIONS['bank-import'] = () => openModal({
    title: 'Match a bank statement', size: 'lg',
    body: `<p class="small" style="margin:0">Download your bank statement as <b>CSV</b> from net banking and choose it here. Each credit (money received) is matched to a chemist or customer by name or mobile in the narration, or by an exact bill amount. Matches go to Approvals — a payment is recorded only when you approve it.</p>
      <label class="dropzone" style="margin-top:12px"><input type="file" id="bankFile" accept=".csv,text/csv" hidden><div class="dz-icon">${icon('upload')}</div><div class="strong">Choose the bank statement CSV</div><div class="small muted">Needs a Date column and a Credit / Deposit column; Narration / Description helps matching</div></label>
      <div class="small muted">The file is read in this browser only.</div>`,
  });
  // Tally Prime / ERP 9 import: sale vouchers (accounting view) with party ledgers
  function tallyXml(month) {
    const a = intCfg('accounting');
    const xe = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
    const sales = db.sales.filter(x => x.date.slice(0, 7) === month).sort((x, y) => x.date.localeCompare(y.date) || x.no.localeCompare(y.no));
    const partyLedger = x => (partyName(x) || 'Cash').slice(0, 90);
    const ent = (ledger, amt) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xe(ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${amt < 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${amt.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
    const masters = [...new Set(sales.map(partyLedger))].map(n => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${xe(n)}" ACTION="Create"><NAME.LIST><NAME>${xe(n)}</NAME></NAME.LIST><PARENT>${xe(a.partyGroup || 'Sundry Debtors')}</PARENT><ISBILLWISEON>Yes</ISBILLWISEON></LEDGER></TALLYMESSAGE>`).join('\n');
    const vouchers = sales.map(x => {
      // CGST/SGST exactly as printed on the bill; any paisa difference goes to round off so the voucher balances
      const total = round2(x.total), taxable = round2(x.taxable), cg = round2(x.cgst ?? x.gst / 2), sg = round2(x.sgst ?? x.gst - cg), ro = round2(total - taxable - cg - sg);
      const party = partyLedger(x);
      return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${x.date.replace(/-/g, '')}</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>${xe(x.no)}</VOUCHERNUMBER><REFERENCE>${xe(x.no)}</REFERENCE><PARTYLEDGERNAME>${xe(party)}</PARTYLEDGERNAME><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW><NARRATION>${xe(`${x.lines.length} item(s)`)}</NARRATION>${ent(party, -total)}${ent(a.salesLedger || 'Sales GST', taxable)}${ent(a.cgstLedger || 'Output CGST', cg)}${ent(a.sgstLedger || 'Output SGST', sg)}${Math.abs(ro) >= 0.005 ? ent(a.roundLedger || 'Round Off', ro) : ''}</VOUCHER></TALLYMESSAGE>`;
    }).join('\n');
    return { xml: `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME>${a.company ? `<STATICVARIABLES><SVCURRENTCOMPANY>${xe(a.company)}</SVCURRENTCOMPANY></STATICVARIABLES>` : ''}</REQUESTDESC><REQUESTDATA>\n${masters}\n${vouchers}\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`, count: sales.length };
  }
  ACTIONS['tally-export'] = () => {
    const def = iso(new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1)).slice(0, 7);
    openModal({
      title: 'Export sale vouchers for Tally', size: 'sm', submitLabel: 'Download Tally XML',
      body: `<div class="form-grid">${field('Month', 'month', { type: 'month', value: def, required: true, full: true })}</div>
        <div class="small muted">Imports in Tally Prime through Import → Transactions. Party ledgers are created under “${esc(intCfg('accounting').partyGroup || 'Sundry Debtors')}”; the ledgers “${esc(intCfg('accounting').salesLedger || 'Sales GST')}”, “${esc(intCfg('accounting').cgstLedger || 'Output CGST')}”, “${esc(intCfg('accounting').sgstLedger || 'Output SGST')}” and “${esc(intCfg('accounting').roundLedger || 'Round Off')}” must already exist (names can be changed in Settings → Integrations → Sheets & accounting). Try it on a copy of your company first.</div>`,
      onSubmit: v => { if (!/^\d{4}-\d{2}$/.test(v.month)) { toast('Choose a month.'); return false; } const r = tallyXml(v.month); if (!r.count) { toast('No sale bills in that month.'); return false; } downloadText(`tally-sales-${v.month}.xml`, r.xml, 'application/xml'); logAgent('accounts', `Tally XML downloaded for ${v.month}: ${r.count} vouchers`); return `${r.count} sale vouchers exported for ${v.month}.`; },
    });
  };

  // ----- Register the Phase 2 agents -----
  Object.assign(AGENT_DEFS, {
    intake: { name: 'Purchase Intake', icon: 'cart', auto: true, desc: 'Checks every bill you enter: rate higher or lower than last time, MRP changed, GST different. Daily: purchase rate changes, sale rates below cost or above MRP (one-click fix), and stock lines from bills still not checked.', defaults: { enabled: true, auto: true, time: '09:10', rateAlertPct: 5, minMarginPct: 5, lookbackDays: 7, verifyDays: 3 } },
    retclaims: { name: 'Returns & Expiry Claims', icon: 'undo', auto: true, desc: 'Advises on each sales return request against your return policy, and drafts expiry claims (debit notes) to suppliers for expired and near-expiry stock.', defaults: { enabled: true, auto: true, time: '09:20', maxSaleDays: 180, acceptBeforeDays: 90, acceptAfterDays: 30, claimDays: 30 } },
    followup: { name: 'Enquiry Follow-up', icon: 'chat', auto: true, desc: 'Follow-up messages for enquiries that are due, “now in stock” messages when asked-for items arrive, and old enquiries to close as lost.', defaults: { enabled: true, auto: true, time: '10:15', gapDays: 3, staleDays: 14, template: DEFAULT_FOLLOWUP } },
    accounts: { name: 'Accounts Sync', icon: 'book', auto: true, desc: 'Monthly account statements to parties, matching a bank statement to open bills, and sale vouchers for Tally.', defaults: { enabled: true, auto: true, time: '10:30', statements: true, statementDay: 1, minBalance: 1000, includeCustomers: false, template: DEFAULT_STATEMENT } },
  });
  // Keep the Daily Briefing last so it can count the others' results
  const briefing = AGENT_DEFS.briefing; delete AGENT_DEFS.briefing; AGENT_DEFS.briefing = briefing;
  Object.assign(AGENT_FIELDS, {
    intake: [{ k: 'rateAlertPct', label: 'Warn when the rate changes by at least (%)', type: 'number' }, { k: 'minMarginPct', label: 'Minimum margin over purchase rate for suggested sale rates (%)', type: 'number' }, { k: 'lookbackDays', label: 'Report rate changes from bills of the last (days)', type: 'number' }, { k: 'verifyDays', label: 'Remind about unchecked stock lines after (days)', type: 'number' }],
    retclaims: [{ k: 'maxSaleDays', label: 'Accept returns of goods sold within (days)', type: 'number' }, { k: 'acceptBeforeDays', label: 'Expiry returns: accept when expiry is within (days)', type: 'number' }, { k: 'acceptAfterDays', label: 'Expiry returns: accept up to (days) after expiry', type: 'number' }, { k: 'claimDays', label: 'Draft supplier claims for stock expiring within (days)', type: 'number' }],
    followup: [{ k: 'gapDays', label: 'Next follow-up after a message (days)', type: 'number' }, { k: 'staleDays', label: 'Suggest “lost” when overdue by (days)', type: 'number' }, { k: 'template', label: 'Follow-up message — {party} {date} {lines} {firm}', type: 'textarea' }],
    accounts: [{ k: 'statements', label: 'Prepare monthly statements', type: 'check' }, { k: 'statementDay', label: 'Prepare them on day (1–28) of the month', type: 'number' }, { k: 'minBalance', label: 'Only for parties whose balance is at least (₹)', type: 'number' }, { k: 'includeCustomers', label: 'Include walk-in customers', type: 'check' }, { k: 'template', label: 'Statement message — {party} {month} {opening} {billed} {credits} {closing} {today} {firm} {pay}', type: 'textarea' }],
  });
  Object.assign(AGENT_RUN, { intake: runIntakeAgent, retclaims: runRetClaimsAgent, followup: runFollowupAgent, accounts: runAccountsAgent });
  const autoAgents = () => Object.keys(AGENT_RUN).filter(id => id !== 'briefing').concat('briefing');
  function agentExtraBtns(id) {
    return ({
      compliance: actBtn('gst-export', '', 'GST summary CSV', 'ghost'),
      retclaims: actBtn('new-preturn', '', 'New purchase return', 'ghost'),
      accounts: actBtn('bank-import', '', 'Match bank statement', 'ghost') + actBtn('tally-export', '', 'Tally XML', 'ghost'),
      recall: actBtn('recall-new', '', 'Add alert list', 'ghost') + '<button type="button" class="btn sm ghost" data-nav="recalls">Alert lists</button>',
      ceiling: actBtn('ceiling-import', '', 'Import NPPA list', 'ghost'),
      h1: actBtn('h1-register', '', 'Register', 'ghost'),
      credit: actBtn('credit-report', '', 'Credit scores', 'ghost'),
      schemes: '<button type="button" class="btn sm ghost" data-nav="schemes">Schemes</button>',
      route: actBtn('route-plan', '', 'Dispatch list', 'ghost'),
      gstr2b: actBtn('gstr2b-import', '', 'Import GSTR-2B', 'ghost') + '<button type="button" class="btn sm ghost" data-nav="itc">ITC match</button>',
      payplan: actBtn('payplan-view', '', 'Payment plan', 'ghost'),
      gstdocs: actBtn('gstdocs-open', '', 'Documents', 'ghost'),
      clearance: actBtn('clearance-open', '', 'Clearance list', 'ghost'),
      coldchain: actBtn('temp-log', '', 'Temperature log', 'ghost'),
      supplier: actBtn('supplier-report', '', 'Supplier scores', 'ghost'),
      audit: actBtn('audit-log', '', 'Bill changes', 'ghost'),
    })[id] || '';
  }
  const APPR_LABEL = { po: 'Review PO', reminder: 'Send reminder', briefing: 'Share', price: 'Apply new rate', returnadvice: 'Approve return', claim: 'Review claim', followup: 'Send message', lost: 'Mark lost', statement: 'Send statement', bankmatch: 'Record payment', info: 'Open' };
  const APPR_HANDLERS = {
    price: a => { const p = prod(a.payload.productId); if (!p) return; const old = p.ptr; p.ptr = a.payload.ptr; doneApproval(a.id, `Sale rate ₹${dec(old)} → ₹${dec(p.ptr)}`); logAgent('intake', `${p.name}: sale rate ₹${dec(old)} → ₹${dec(p.ptr)}`); refresh(); toast(`${p.name}: sale rate is now ₹${dec(p.ptr)}.`); },
    returnadvice: a => { const r = returnById(a.payload.no); if (!r || r.status !== 'Requested') { doneApproval(a.id, 'Already handled'); refresh(); return; } ACTIONS['approve-return'](r.no); },
    claim: a => purchaseReturnModal({ supplierId: a.payload.supplierId, picks: Object.fromEntries(Object.entries(a.payload.picks || {}).filter(([bid]) => batchById(bid) && avail(batchById(bid)) > 0).map(([bid, pk]) => { const b = batchById(bid); return [bid, { qty: Math.min(pk.qty, b.qty), free: Math.min(pk.free || 0, b.free || 0) }]; })), reason: 'Expiry claim', approvalId: a.id }),
    followup: a => {
      const q = db.inquiries.find(x => x.no === a.payload.no); if (!q) { doneApproval(a.id, 'Enquiry deleted'); refresh(); return; }
      const c = agentCfg('followup'); const pc = q.party.type === 'chemist' ? chem(q.party.chemistId) : q.party.type === 'customer' ? custById(q.party.customerId) : null;
      openSendDialog({ agent: 'followup', approvalId: a.id, title: `Follow up — ${inqPartyName(q)}`, name: inqPartyName(q), phone: inqPartyPhone(q), email: pc?.email, subject: `Your enquiry — ${db.settings.firm.name}`,
        text: fillTpl(c.template, { party: pc?.owner || inqPartyName(q), date: fmtDate(q.date), lines: inquiryLinesText(q), firm: db.settings.firm.name }),
        onSent: () => { q.lastContact = todayIso; q.followUp = addDays(todayIso, c.gapDays); if (a.payload.avail) q.availNotifiedOn = todayIso; } });
    },
    lost: a => { const q = db.inquiries.find(x => x.no === a.payload.no); if (q) Object.assign(q, { status: 'Lost', closedOn: todayIso }); doneApproval(a.id, 'Marked lost'); logAgent('followup', `${a.payload.no} marked lost`); refresh(); toast(`${a.payload.no} marked lost.`); },
    statement: a => {
      const { type, id, from, to, month } = a.payload; const p = type === 'chemist' ? chem(id) : custById(id); if (!p) return;
      const L = ledgerCalc(type, id, from, to), now = ledgerCalc(type, id).close;
      openSendDialog({ agent: 'accounts', approvalId: a.id, title: `Statement — ${p.name}`, name: p.name, phone: p.phone, email: p.email, subject: `Account statement ${month} — ${db.settings.firm.name}`, payAmount: now > 0 ? now : 0, payNote: `Account ${month}`,
        text: fillTpl(agentCfg('accounts').template, { party: p.owner || p.name, month, opening: balTxt(L.open, type), billed: dec(L.dr), credits: dec(L.cr), closing: balTxt(L.close, type), today: balTxt(now, type), firm: db.settings.firm.name, pay: now > 0 ? upiText(now) : '' }) });
    },
    bankmatch: a => {
      const { alloc, narr, date } = a.payload; let done = 0;
      alloc.forEach(x => { const s = db.sales.find(y => y.no === x.no); if (!s) return; const amt = Math.min(x.amount, balance(s)); if (amt > 0.005) { addPayment(s, amt, date, `Bank · ${narr}`.slice(0, 80)); done += amt; } });
      doneApproval(a.id, `Recorded ₹${dec(done)}`); logAgent('accounts', `Bank credit recorded: ₹${dec(done)} (${a.title})`);
      refresh(); toast(done ? `₹${dec(done)} recorded against ${alloc.map(x => x.no).join(', ')}.` : 'Those bills are already paid — nothing recorded.');
    },
  };

  // =====================================================================
  // Phase 3 agents: Marketing, Reviews & Reputation, Chemist Assistant
  // =====================================================================
  const PUBLIC_CAT_RE = /cosmetic|derma|nutra|ayur|surgical|otc|fmcg|wellness|personal|baby|device/i;
  const DEFAULT_B2B_PROMO = 'Namaste {party} ji,\n{firm} mein is hafte naya stock aaya hai:\n{lines}\n{offer}\nOrder ke liye reply karein ya portal par order karein.';
  const DEFAULT_SOCIAL = 'New at {firm} ✨\n{lines}\n{offer}\nVisit us at {address} · {phone}';
  const DEFAULT_REVIEW = 'Namaste {party} ji,\n{firm} se kharidari ke liye dhanyavaad! Agar aapko hamari seva achhi lagi ho, to 1 minute nikal kar Google par review dein:\n{link}';
  const marketingItems = days => {
    const since = addDays(todayIso, -days); const seen = new Set(); const out = [];
    purchaseLines().filter(l => l.date >= since).forEach(l => { if (seen.has(l.productId) || sellableQty(l.productId) <= 0) return; seen.add(l.productId); const p = prod(l.productId); if (p) out.push(p); });
    return out;
  };
  const isPublicSafe = p => PUBLIC_CAT_RE.test(category(p.categoryId)?.name || '') || PUBLIC_CAT_RE.test(p.form || '') && !/tablet|capsule|injection|syrup|pen/i.test(p.form || '');
  function runMarketingAgent(auto) {
    const c = agentCfg('marketing');
    if (auto && new Date().getDay() !== +c.weekday) return { made: 0, summary: `Runs on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][+c.weekday]}s` };
    const items = marketingItems(c.days);
    const week = `${todayIso.slice(0, 4)}-W${Math.ceil(((parse(todayIso) - new Date(TODAY.getFullYear(), 0, 1)) / DAY + 1) / 7)}`;
    if (!items.length && !c.offer) { closeStale('marketing', new Set()); return { made: 0, summary: `No new stock in the last ${c.days} days` }; }
    const pub = items.filter(isPublicSafe);
    const f = db.settings.firm;
    const made = upsertApproval({ agent: 'marketing', kind: 'promo', key: 'promo:' + week, title: `This week’s update — ${items.length} new item${items.length === 1 ? '' : 's'}${pub.length ? `, ${pub.length} for public posts` : ''}`, detail: [items.slice(0, 6).map(p => p.name).join(', ') + (items.length > 6 ? '…' : ''), pub.length ? `Public post: ${pub.slice(0, 4).map(p => p.name).join(', ')}` : 'No public post this week — new items are prescription medicines (trade update to chemists only).'], payload: { items: items.map(p => p.id), pub: pub.map(p => p.id), firm: f.name } });
    closeStale('marketing', new Set(['promo:' + week]));
    return { made, summary: `${items.length} new item(s), ${pub.length} suitable for public posts` };
  }
  function runReviewsAgent() {
    const c = agentCfg('reviews'); const link = intCfg('bizprofile').reviewLink;
    const keep = new Set(); let made = 0;
    if (!link) { keep.add('review:nolink'); made += upsertApproval({ agent: 'reviews', kind: 'info', key: 'review:nolink', title: 'Add your Google review link to start asking for reviews', detail: ['Settings → Integrations → Business Profiles → Review link. In Google Business Profile, use “Ask for reviews” to get the link.'], payload: { act: ['int-config', 'bizprofile'] } }); closeStale('reviews', keep); return { made, summary: 'Needs your Google review link' }; }
    const since = addDays(todayIso, -c.days), asked = addDays(todayIso, -c.repeatDays);
    const cands = [];
    const add = (type, id, name, phone, bills) => { if (!phone || bills.reduce((a, x) => a + x.total, 0) < c.minAmount) return; const key = `review:${type}:${id}`; if (db.reminders.some(r => r.key === key && r.date >= asked)) return; cands.push({ type, id, name, phone, key, last: bills.map(x => x.date).sort().pop() }); };
    (db.customers || []).forEach(cu => add('customer', cu.id, cu.name, cu.phone, db.sales.filter(x => x.party.customerId === cu.id && x.date >= since)));
    if (c.includeChemists) db.chemists.forEach(ch => add('chemist', ch.id, ch.name, ch.phone, db.sales.filter(x => x.party.chemistId === ch.id && x.date >= since)));
    cands.sort((a, b) => b.last.localeCompare(a.last)).slice(0, c.maxPerRun).forEach(x => { keep.add('appr:' + x.key); made += upsertApproval({ agent: 'reviews', kind: 'review', key: 'appr:' + x.key, title: `Ask ${x.name} for a Google review`, detail: [`Last bought ${fmtDate(x.last)}`], payload: { type: x.type, id: x.id } }); });
    closeStale('reviews', keep);
    return { made, summary: `${keep.size} review request(s) ready` };
  }
  const assistantStatus = () => SERVER ? (secretSet('ai', 'serverKey') ? '' : 'Needs the server key (Integrations → AI providers)') : 'Needs the server (node server.js)';
  Object.assign(AGENT_DEFS, {
    marketing: { name: 'Marketing', icon: 'spark', auto: true, desc: 'Each week: a WhatsApp update for chemists about new stock and offers, a public post (only non-prescription items) and an image card to share.', defaults: { enabled: true, auto: true, time: '11:00', weekday: 1, days: 7, offer: '', b2b: DEFAULT_B2B_PROMO, social: DEFAULT_SOCIAL } },
    reviews: { name: 'Reviews & Reputation', icon: 'user', auto: true, desc: 'Asks recent customers for a Google review with your review link — the same person at most once in the set days.', defaults: { enabled: true, auto: true, time: '18:00', days: 7, repeatDays: 90, minAmount: 200, maxPerRun: 10, includeChemists: false, template: DEFAULT_REVIEW } },
    assistant: { name: 'Chemist Assistant', icon: 'chat', auto: false, desc: '24×7 chat in the chemist portal: answers about stock, rates, their orders and balance, and places orders after the chemist confirms. Runs on the server with Claude.', defaults: { enabled: false, perChemistPerDay: 40, dailyTotal: 400, greeting: 'Namaste! Stock, rate, order ya balance ke baare mein poochiye.' } },
  });
  { const b = AGENT_DEFS.briefing; delete AGENT_DEFS.briefing; AGENT_DEFS.briefing = b; }
  Object.assign(AGENT_FIELDS, {
    marketing: [{ k: 'weekday', label: 'Day of the week (0 = Sunday … 6 = Saturday)', type: 'number' }, { k: 'days', label: 'New stock from the last (days)', type: 'number' }, { k: 'offer', label: 'Offer / scheme line (optional), e.g. “Buy 10 get 1 free on ADDI-D3”', type: 'textarea' }, { k: 'b2b', label: 'Chemist update — {party} {lines} {offer} {firm}', type: 'textarea' }, { k: 'social', label: 'Public post — {lines} {offer} {firm} {address} {phone}', type: 'textarea' }],
    reviews: [{ k: 'days', label: 'Customers who bought in the last (days)', type: 'number' }, { k: 'repeatDays', label: 'Do not ask the same person again within (days)', type: 'number' }, { k: 'minAmount', label: 'Only if they bought at least (₹)', type: 'number' }, { k: 'maxPerRun', label: 'At most this many requests a day', type: 'number' }, { k: 'includeChemists', label: 'Also ask chemists', type: 'check' }, { k: 'template', label: 'Message — {party} {firm} {link}', type: 'textarea' }],
    assistant: [{ k: 'perChemistPerDay', label: 'Questions per chemist per day', type: 'number' }, { k: 'dailyTotal', label: 'Questions per day for all chemists (cost limit)', type: 'number' }, { k: 'greeting', label: 'Greeting shown in the portal', type: 'textarea' }],
  });
  Object.assign(AGENT_RUN, { marketing: runMarketingAgent, reviews: runReviewsAgent });
  Object.assign(APPR_LABEL, { promo: 'Share', review: 'Send request' });

  // Image card (1080×1080 PNG) for WhatsApp status / Instagram / Facebook
  async function promoImage(products, title, offer) {
    const f = db.settings.firm; const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1080; const x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1080, 1080); g.addColorStop(0, '#0d4a42'); g.addColorStop(1, '#135e54'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1080);
    x.fillStyle = '#b48a4f'; x.fillRect(0, 0, 1080, 14);
    let y = 110;
    if (f.logo) { try { const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = f.logo; }); x.fillStyle = '#fff'; x.beginPath(); x.roundRect(80, 70, 120, 120, 24); x.fill(); x.drawImage(img, 90, 80, 100, 100); } catch { /* no logo */ } }
    x.fillStyle = '#fff'; x.font = '600 54px Fraunces, Georgia, serif'; x.fillText(f.name || '', f.logo ? 230 : 80, y + 10);
    x.fillStyle = '#d6b47e'; x.font = '500 28px Inter, Arial, sans-serif'; x.fillText((f.tagline || 'Pharma Suite').toUpperCase(), f.logo ? 230 : 80, y + 56);
    y = 280; x.fillStyle = '#fff'; x.font = '600 64px Fraunces, Georgia, serif'; x.fillText(title, 80, y);
    y += 40; x.fillStyle = 'rgba(255,255,255,.15)'; x.fillRect(80, y, 920, 2);
    x.font = '500 38px Inter, Arial, sans-serif';
    products.slice(0, 8).forEach((p, i) => { y += 72; x.fillStyle = '#d6b47e'; x.beginPath(); x.arc(98, y - 12, 9, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; let t = `${p.name}${p.pack ? ' · ' + p.pack : ''}`; while (x.measureText(t).width > 880 && t.length > 4) t = t.slice(0, -2); x.fillText(t, 130, y); });
    if (products.length > 8) { y += 60; x.fillStyle = '#d6b47e'; x.font = '500 32px Inter, Arial, sans-serif'; x.fillText(`+ ${products.length - 8} more`, 130, y); }
    if (offer) { x.fillStyle = '#b48a4f'; x.beginPath(); x.roundRect(80, 850, 920, 80, 18); x.fill(); x.fillStyle = '#fff'; x.font = '600 34px Inter, Arial, sans-serif'; let t = offer.split('\n')[0]; while (x.measureText(t).width > 860 && t.length > 4) t = t.slice(0, -2); x.fillText(t, 110, 902); }
    x.fillStyle = 'rgba(255,255,255,.8)'; x.font = '400 28px Inter, Arial, sans-serif'; let addr = [addrText(f), f.phone].filter(Boolean).join(' · '); while (x.measureText(addr).width > 920 && addr.length > 4) addr = addr.slice(0, -2); x.fillText(addr, 80, 1010);
    return new Promise(res => cv.toBlob(res, 'image/png'));
  }
  let promoState = null;
  function openPromo(a) {
    const c = agentCfg('marketing'), f = db.settings.firm;
    const items = (a.payload.items || []).map(prod).filter(Boolean), pub = (a.payload.pub || []).map(prod).filter(Boolean);
    const list = ps => ps.map(p => `• ${p.name}${p.pack ? ` (${p.pack})` : ''}`).join('\n');
    const b2b = fillTpl(c.b2b, { party: '{party}', lines: list(items), offer: c.offer || '', firm: f.name });
    const social = pub.length ? fillTpl(c.social, { lines: list(pub), offer: c.offer || '', firm: f.name, address: addrText(f), phone: f.phone || '' }) : '';
    promoState = { a, items, pub };
    const chems = db.chemists.filter(x => x.status === 'Active' && x.phone);
    openModal({
      title: 'Share this week’s update', size: 'xl', submitLabel: 'Mark as shared',
      body: `<div class="grid g-2 promo-grid">
        <section><div class="card-title" style="font-size:15px">For chemists (trade update)</div>
          <div class="field"><textarea id="promoB2b" rows="10">${esc(b2b)}</textarea></div>
          <div class="small muted">{party} is replaced with each chemist’s name. Open WhatsApp for each chemist below, or copy the text into a WhatsApp broadcast list.</div>
          <div class="toolbar" style="margin-top:6px"><button type="button" class="btn sm" data-promo="copyb2b">Copy</button><button type="button" class="btn sm" data-promo="imgb2b">${icon('upload')}Image card</button></div>
          <div class="promo-list">${chems.map(x => `<div class="hook-row"><div><span class="strong">${esc(x.name)}</span><div class="small muted">${esc(x.phone)}</div></div><button type="button" class="btn sm ghost" data-promo-wa="${esc(x.id)}">${icon('chat')}WhatsApp</button></div>`).join('') || '<div class="small muted">No active chemists with a mobile number.</div>'}</div></section>
        <section><div class="card-title" style="font-size:15px">Public post (Instagram, Facebook, WhatsApp Status)</div>
          ${pub.length ? `<div class="field"><textarea id="promoSocial" rows="10">${esc(social)}</textarea></div>
          <div class="toolbar"><button type="button" class="btn sm" data-promo="copysocial">Copy</button><button type="button" class="btn sm primary" data-promo="imgsocial">${icon('upload')}Download image card</button>${getApiKey() ? '<button type="button" class="btn sm" data-promo="ai">' + icon('spark') + 'Improve wording with AI</button>' : ''}</div>
          <div class="small muted">Only non-prescription items are included. Prescription (Schedule H/H1/X) medicines must not be advertised to the public. Posting directly to Instagram/Facebook is not connected yet — download the image and post it.</div>`
          : '<div class="empty">No public post this week — all new items are prescription medicines. Share the trade update with chemists only.</div>'}</section>
      </div>`,
      onSubmit: () => { doneApproval(a.id, 'Shared'); logAgent('marketing', 'Weekly update shared'); return 'Marked as shared.'; },
    });
  }
  async function promoAction(kind, chemId) {
    const st = promoState; if (!st) return;
    const b2b = $('#promoB2b')?.value || '', social = $('#promoSocial')?.value || '';
    const copy = async t => { try { await navigator.clipboard.writeText(t); toast('Copied.'); } catch { toast('Select the text and copy it.'); } };
    if (kind === 'copyb2b') return copy(b2b.replace(/\{party\}/g, '').replace(/ ji,/, ','));
    if (kind === 'copysocial') return copy(social);
    if (kind === 'imgb2b' || kind === 'imgsocial') {
      const ps = kind === 'imgsocial' ? st.pub : st.items;
      const blob = await promoImage(ps, kind === 'imgsocial' ? 'New this week' : 'New stock arrived', agentCfg('marketing').offer || '');
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${(db.settings.firm.name || 'update').replace(/[^\w]+/g, '-')}-${todayIso}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      return;
    }
    if (kind === 'wa') {
      const ch = chem(chemId); if (!ch) return;
      const text = b2b.replace(/\{party\}/g, ch.owner || ch.name);
      const a = document.createElement('a'); a.href = `https://wa.me/91${phone10(ch.phone)}?text=${encodeURIComponent(text)}`; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
      $(`[data-promo-wa="${chemId}"]`)?.closest('.hook-row')?.classList.add('done');
      return;
    }
    if (kind === 'ai') {
      const btn = $('[data-promo="ai"]'); btn.disabled = true; btn.textContent = 'Writing…';
      try {
        const x = await callClaudeJson([], `Rewrite this social media post for a pharmacy business in India so it is warm, short (under 60 words) and suitable for Instagram and WhatsApp Status. Keep every product name exactly as given, keep the offer and contact details, and add 3 to 5 relevant hashtags. Do not make medical or health claims, and do not promise cures. Write in English with simple Hindi words where natural.\n\nPost:\n"""${social}"""`, { type: 'object', additionalProperties: false, required: ['post'], properties: { post: { type: 'string' } } }, 800, aiModel('agent'));
        if (x.post) $('#promoSocial').value = x.post;
      } catch (err) { toast(err.message || 'Could not reach the AI.'); }
      finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = icon('spark') + 'Improve wording with AI'; } }
    }
  }
  Object.assign(APPR_HANDLERS, {
    promo: a => openPromo(a),
    review: a => {
      const { type, id } = a.payload; const p = type === 'chemist' ? chem(id) : custById(id); if (!p) return;
      openSendDialog({ agent: 'reviews', approvalId: a.id, reminderKey: `review:${type}:${id}`, title: `Ask ${p.name} for a review`, name: p.name, phone: p.phone, email: p.email, subject: `Thank you — ${db.settings.firm.name}`, text: fillTpl(agentCfg('reviews').template, { party: p.owner || p.name, firm: db.settings.firm.name, link: intCfg('bizprofile').reviewLink || '' }) });
    },
  });
  // Chemist Assistant: conversations (server)
  ACTIONS['assistant-log'] = async () => {
    if (!SERVER) { toast('The Chemist Assistant runs on the server — start it with “node server.js”.'); return; }
    let d; try { d = await api('GET', 'api/assistant/log'); } catch (err) { toast(err.message); return; }
    const c = agentCfg('assistant');
    openModal({
      title: 'Chemist Assistant — conversations', size: 'xl',
      extraFoot: `<div class="foot-left"><button type="button" class="btn" data-act="agent-config" data-id="assistant">Settings</button></div>`,
      body: `${detailGrid([['Status', c.enabled ? pill('Active') : pill('Off')], ['Server package', d.sdk ? 'Installed' : '<span class="bad-text">Run “npm install”</span>'], ['Server key', d.key ? 'Saved' : '<span class="bad-text">Add it in Integrations → AI providers</span>'], ['Questions today', `${d.usage.total} / ${c.dailyTotal}`]])}
        ${d.chats.length ? d.chats.map(ch => `<div class="chat-log"><div class="strong">${esc(ch.name)} <span class="small muted">${ch.last ? new Date(ch.last).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span></div>${ch.messages.slice(-8).map(m => `<div class="chat-line ${m.role}"><b>${m.role === 'user' ? 'Chemist' : 'Assistant'}:</b> ${esc(m.text)}${m.order ? ` ${pill(m.order)}` : ''}</div>`).join('')}</div>`).join('') : '<div class="empty">No conversations yet.</div>'}`,
    });
  };

  // =====================================================================
  // Phase 4 agents: Recall & NSQ Watch, Price Ceiling (NPPA), Schedule H1 / NDPS
  // register, Chemist Credit Risk, Schemes & Claims, Route & Delivery, and
  // Hospital & Doctor Outreach
  // =====================================================================
  const RX_SCHEDULES = [['', 'Not set'], ['OTC', 'OTC (no prescription)'], ['G', 'Schedule G'], ['H', 'Schedule H'], ['H1', 'Schedule H1'], ['X', 'Schedule X'], ['NDPS', 'NDPS (narcotic / psychotropic)']];
  const REG_SCH = ['H1', 'X', 'NDPS'];
  const regItem = p => !!p && REG_SCH.includes(p.schedule);
  const bkey = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const maxMrp = p => p && p.ceiling > 0 ? round2(p.ceiling * (1 + num(p.gst) / 100)) : 0;
  const partyOf = s => s.party.type === 'chemist' ? chem(s.party.chemistId) : custById(s.party.customerId);
  const docById = id => (db.doctors || []).find(d => d.id === id);
  const weekKey = () => `${todayIso.slice(0, 4)}-W${Math.ceil(((parse(todayIso) - new Date(TODAY.getFullYear(), 0, 1)) / DAY + 1) / 7)}`;
  const monthlySold = pid => Math.round(db.sales.filter(s => s.date >= addDays(todayIso, -90)).reduce((a, s) => a + s.lines.filter(l => l.productId === pid).reduce((b, l) => b + l.qty + (l.free || 0), 0), 0) / 3);
  // An item the user already approved or dismissed is not suggested again for `days` days
  const recentlyHandled = (key, days) => db.approvals.some(a => a.key === key && a.status !== 'Pending' && String(a.done || a.updated || a.created || '').slice(0, 10) >= addDays(todayIso, -days));
  const p4Add = (agent, keep, item, days) => { if (days && recentlyHandled(item.key, days)) return 0; keep.add(item.key); return upsertApproval({ agent, ...item }); };
  const openWa = (phone, text) => { const a = document.createElement('a'); a.href = `https://wa.me/91${phone10(phone)}?text=${encodeURIComponent(text)}`; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); };
  const paperHead = (title, right) => { const f = db.settings.firm; return `<div class="bill-top"><span class="bill-title">${title}</span></div>
    <div class="bill-head ledger-head"><div class="bill-from">${f.logo ? `<img class="bill-logo" src="${esc(f.logo)}" alt="">` : ''}<div><div class="bill-firm">${esc(f.name)}</div>${firmLines(f).map(x => `<div>${esc(x)}</div>`).join('')}</div></div><div class="bill-to">${right}</div></div>`; };
  const printFoot = (size, extra = '') => `<div class="foot-left"><button type="button" class="btn" data-act="print" data-id="${size}">${icon('file')}Print (${size === 'a4l' ? 'A4 landscape' : 'A4'})</button>${extra}</div>`;
  PR_REASONS.splice(PR_REASONS.length - 1, 0, 'Recall / drug alert');

  // ----- Recall & NSQ Watch -----
  const RECALL_SOURCES = ['CDSCO NSQ alert (Not of Standard Quality)', 'Spurious / adulterated drug alert', 'Banned FDC list', 'Company recall', 'State Drug Controller alert', 'Other'];
  const DEFAULT_RECALL_MSG = 'Namaste {party} ji,\n{firm} ki taraf se zaroori soochna: {product}{batch} drug alert list mein aaya hai ({reason}).\nKripya is batch ko bechna turant band karein aur bacha hua stock hamein wapas bhej dein — hum credit de denge.\nDhanyavaad';
  const recallById = id => (db.recalls || []).find(r => r.id === id);
  // Stock and sales matching one entry of a drug alert. A batch number matches exactly (spaces and dashes ignored).
  // An entry without a batch (a banned combination) matches products whose salt has every ingredient it lists.
  function recallHits(it) {
    const k = bkey(it.batch); let batches = [], lines = [];
    if (k) {
      batches = db.batches.filter(b => bkey(b.batch) === k);
      db.sales.forEach(s => s.lines.forEach(l => { if (bkey(l.batch) === k) lines.push({ s, l }); }));
    } else {
      const parts = norm(it.name).split(/\s*\+\s*|\s*&\s*|\s+AND\s+/).map(x => x.replace(/[^A-Z0-9 ]/g, '').trim()).filter(x => x.length > 2);
      if (parts.length < 2) return [];
      const pids = new Set(db.products.filter(p => p.salt && parts.every(x => norm(p.salt).includes(x.split(' ')[0]))).map(p => p.id));
      batches = db.batches.filter(b => pids.has(b.productId));
      const since = addDays(todayIso, -180);
      db.sales.filter(s => s.date >= since).forEach(s => s.lines.forEach(l => { if (pids.has(l.productId)) lines.push({ s, l }); }));
    }
    const by = {}; const slot = pid => by[pid] || (by[pid] = { batches: [], lines: [] });
    batches.forEach(b => slot(b.productId).batches.push(b));
    lines.forEach(x => slot(x.l.productId).lines.push(x));
    const word = norm(it.name).split(/[^A-Z0-9]+/).find(w => w.length > 2) || '';
    return Object.entries(by).filter(([pid]) => prod(pid)).map(([pid, v]) => ({ pid, ...v, nameOk: !k || !word || norm(prod(pid).name).includes(word) || norm(prod(pid).salt).includes(word) }));
  }
  const hitParties = h => { const m = {}; h.lines.forEach(({ s, l }) => { const k = s.party.type === 'chemist' ? 'chemist:' + s.party.chemistId : 'customer:' + s.party.customerId; const x = m[k] || (m[k] = { k, p: partyOf(s), name: partyName(s), bills: [], qty: 0 }); if (!x.bills.includes(s.no)) x.bills.push(s.no); x.qty += l.qty + (l.free || 0); }); return Object.values(m); };
  function runRecallAgent() {
    const c = agentCfg('recall'); const keep = new Set(); let made = 0, hits = 0;
    const rs = db.recalls || [];
    rs.forEach(r => r.items.forEach((it, i) => recallHits(it).forEach(h => {
      if (it.done?.[h.pid]) return;
      const stock = h.batches.reduce((a, b) => a + avail(b), 0), parties = hitParties(h);
      if (!stock && !parties.length) return;
      hits++;
      const p = prod(h.pid), open = h.batches.filter(b => avail(b) > 0), blocked = open.filter(b => b.blocked).length;
      made += p4Add('recall', keep, { key: `recall:${r.id}:${i}:${h.pid}`, kind: 'recall', title: `${r.source.split(' (')[0]}: ${p.name}${it.batch ? ` · batch ${it.batch}` : ''}`,
        detail: [`${stock ? `${qty(stock)} in stock — ${blocked === open.length ? 'blocked for billing' : 'not blocked yet'}` : 'None left in stock'} · sold to ${parties.length} part${parties.length === 1 ? 'y' : 'ies'}`, `Alert: ${[it.name, it.mfg, it.reason].filter(Boolean).join(' · ')}`, h.nameOk ? `${r.ref || r.source} · ${fmtDate(r.date)}` : 'Only the batch number matches — check it is the same product and manufacturer'],
        payload: { rid: r.id, i, pid: h.pid } });
    })));
    const month = todayIso.slice(0, 7);
    if (TODAY.getDate() >= c.remindDay && !rs.some(r => (r.created || '').slice(0, 7) === month)) made += p4Add('recall', keep, { key: 'recall:remind:' + month, kind: 'info', title: 'Add this month’s CDSCO drug alert (NSQ / spurious list)', detail: ['CDSCO publishes the list of drugs found Not of Standard Quality every month (cdsco.gov.in → Drug Alerts). Add it so your stock and sales are checked.'], payload: { act: ['recall-new', ''] } }, 25);
    closeStale('recall', keep);
    return { made, summary: rs.length ? `${hits} match${hits === 1 ? '' : 'es'} in stock or sold, from ${rs.length} alert list${rs.length === 1 ? '' : 's'}` : 'No alert lists added yet' };
  }
  const RECALL_SCHEMA = { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'batch', 'manufacturer', 'reason'], properties: { name: strS, batch: strS, manufacturer: strS, reason: strS } } } } };
  const RECALL_PROMPT = `This is a drug safety alert published in India — for example the CDSCO or a State Drug Controller's monthly list of drugs declared Not of Standard Quality (NSQ), spurious or adulterated, a list of banned fixed-dose combinations (FDCs), or a manufacturer's recall notice.

List every drug in it, one entry per batch:
- name: the product name with strength and dosage form exactly as printed (the brand name if printed, else the generic name). For a banned combination, write the ingredients joined with " + ".
- batch: the batch number exactly as printed; empty if none is printed.
- manufacturer: the manufacturer's company name only, without the address.
- reason: a short reason, e.g. "Fails dissolution", "Fails assay", "Spurious", "Banned FDC".

Copy text exactly as printed. Use an empty string for anything not printed. Do not guess. Skip page headers, footers and notes.`;
  function parseRecallItems(text) {
    return String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const c = (l.includes('|') ? l.split('|') : l.includes('\t') ? l.split('\t') : parseCsv(l)[0] || [l]).map(x => String(x).trim());
      return { name: c[0] || '', batch: (c[1] || '').toUpperCase(), mfg: c[2] || '', reason: c[3] || '' };
    }).filter(x => (x.name || x.batch) && !(/^(product|name|drug)/i.test(x.name) && /^batch/i.test(x.batch)));
  }
  ACTIONS['recall-new'] = () => openModal({
    title: 'Add a drug alert list', size: 'xl', submitLabel: 'Save and check stock',
    body: `<div class="form-grid">
        ${field('Type of alert', 'source', { options: RECALL_SOURCES })}
        ${field('Reference (e.g. CDSCO NSQ list, October 2026)', 'ref', {})}
        ${field('Date of the alert', 'date', { type: 'date', value: todayIso, required: true })}
        <div class="field full"><label for="rcFiles">Alert PDF or photo (optional) — AI reads the list</label><div class="toolbar"><input type="file" id="rcFiles" accept="application/pdf,image/*" multiple><button type="button" class="btn" data-p4="rc-read">${icon('spark')}Read with AI</button></div></div>
        <div class="field full"><label for="rcItems">Items — one per line: Product name | Batch no. | Manufacturer | Reason *</label><textarea id="rcItems" name="items" rows="10" placeholder="Paracetamol Tablets IP 500 mg | PCT2401 | XYZ Pharma | Fails dissolution&#10;Nimesulide + Paracetamol | | | Banned FDC"></textarea></div>
      </div>
      <div class="small muted">Get the monthly list of drugs Not of Standard Quality / spurious from cdsco.gov.in (Drug Alerts), or paste it from a circular. An entry with a batch number is matched to your batches and to the bills that sold them. A banned combination without a batch matches products whose salt / composition has every ingredient — keep the salt filled in your products. ${getApiKey() ? 'AI reading sends the file to Anthropic.' : 'AI reading needs the Anthropic API key (Settings → Integrations → AI providers).'}</div>`,
    onSubmit: v => {
      const items = parseRecallItems(v.items);
      if (!items.length) { toast('Add at least one item.'); return false; }
      db.recalls.unshift({ id: uid(), source: v.source, ref: (v.ref || '').trim(), date: v.date || todayIso, created: todayIso, items });
      const made = runAgent('recall', false);
      return `${items.length} item(s) saved. ${agentCfg('recall').lastResult}${made ? ` — ${made} new in Approvals` : ''}.`;
    },
  });
  async function readRecallFile() {
    const files = [...($('#rcFiles')?.files || [])];
    if (!files.length) { toast('Choose the alert PDF or photo first.'); return; }
    if (!getApiKey()) { toast('Add the Anthropic API key in Settings → Integrations → AI providers.'); return; }
    const btn = $('[data-p4="rc-read"]'); btn.disabled = true; btn.textContent = 'Reading…';
    try {
      const x = await callClaudeJson(files, RECALL_PROMPT, RECALL_SCHEMA, 32000, aiModel('bill'));
      const rows = (x.items || []).map(i => [i.name, i.batch, i.manufacturer, i.reason].map(v => String(v || '').replace(/\|/g, '/').trim()).join(' | '));
      const ta = $('#rcItems'); if (ta) ta.value = [ta.value.trim(), ...rows].filter(Boolean).join('\n');
      logAgent('recall', `Read an alert file: ${rows.length} item(s)`);
      toast(`${rows.length} item(s) read — check them before saving.`);
    } catch (err) { toast(err.message || 'Could not read the file.'); }
    finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = icon('spark') + 'Read with AI'; } }
  }
  let recallState = null;
  function recallModal(a) {
    const r = recallById(a.payload.rid), it = r?.items[a.payload.i], p = prod(a.payload.pid);
    if (!r || !it || !p) { doneApproval(a.id, 'Alert removed'); refresh(); return; }
    const h = recallHits(it).find(x => x.pid === p.id) || { batches: [], lines: [] };
    const parties = hitParties(h);
    recallState = { a, r, it, p, h, parties };
    const open = h.batches.filter(b => avail(b) > 0);
    openModal({
      title: `Drug alert — ${p.name}`, size: 'xl', submitLabel: 'Mark as handled',
      extraFoot: open.some(b => b.supplierId) ? '<div class="foot-left"><button type="button" class="btn" data-p4="rc-return">Purchase return to supplier</button></div>' : '',
      body: `${detailGrid([['Alert', esc(r.source)], ['Reference', esc(r.ref || '—')], ['Date', fmtDate(r.date)], ['Listed as', esc([it.name, it.mfg].filter(Boolean).join(' · '))], ['Batch', esc(it.batch || 'All batches (combination)')], ['Reason', esc(it.reason || '—')]])}
        <div class="card-title" style="font-size:15px">Your stock of ${esc(p.name)}</div>
        ${miniTable([
          { h: 'Batch', c: b => `<span class="strong">${esc(b.batch)}</span>${b.blocked ? ' ' + pill('Blocked') : ''}` },
          { h: 'Exp', c: b => isoToExp(b.expiry) },
          { h: 'In stock', r: 1, c: b => qty(avail(b)) },
          { h: 'Supplier', c: b => esc(sup(b.supplierId)?.name || '—') },
          { h: '', c: b => avail(b) > 0 ? `<button type="button" class="btn sm ${b.blocked ? 'ghost' : 'primary'}" data-p4="rc-block" data-id="${esc(b.id)}">${b.blocked ? 'Unblock' : 'Block for billing'}</button>` : '' },
        ], h.batches)}
        <div class="card-title" style="font-size:15px">Sold to</div>
        ${miniTable([
          { h: 'Party', c: x => `<span class="strong">${esc(x.name)}</span><div class="small muted">${esc(x.p?.phone || 'No mobile')}</div>` },
          { h: 'Bills', c: x => `<span class="small">${esc(x.bills.join(', '))}</span>` },
          { h: 'Qty', r: 1, c: x => qty(x.qty) },
          { h: '', c: x => x.p?.phone ? `<button type="button" class="btn sm ghost" data-p4="rc-wa" data-id="${esc(x.k)}">${icon('chat')}WhatsApp</button>` : '' },
        ], parties)}
        <div class="field"><label for="rcMsg">Message to parties — {party} is replaced with each name</label><textarea id="rcMsg" rows="5">${esc(fillTpl(agentCfg('recall').template, { party: '{party}', product: p.name, batch: it.batch ? ` (batch ${it.batch})` : '', reason: it.reason || r.source.split(' (')[0], firm: db.settings.firm.name }))}</textarea></div>
        <div class="small muted">What to do: block the batch so it cannot be billed, tell the chemists who bought it to stop selling and send it back, and return it to the supplier (purchase return) — or keep it aside if the Drug Inspector asks you to. Press “Mark as handled” when done.</div>`,
      onSubmit: () => { it.done = { ...(it.done || {}), [p.id]: todayIso }; doneApproval(a.id, 'Handled'); logAgent('recall', `${p.name}${it.batch ? ' ' + it.batch : ''}: alert handled`); return 'Marked as handled.'; },
    });
  }
  function toggleBlock(bid) {
    const b = batchById(bid); if (!b) return;
    b.blocked = !b.blocked;
    if (b.blocked) { b.blockNote = recallState ? `${recallState.r.source.split(' (')[0]} · ${recallState.r.ref || fmtDate(recallState.r.date)}` : 'Blocked'; b.blockedOn = todayIso; } else { delete b.blockNote; delete b.blockedOn; }
    logAgent('recall', `${prod(b.productId)?.name} batch ${b.batch} ${b.blocked ? 'blocked' : 'unblocked'} for billing`);
    save(); toast(`Batch ${b.batch} ${b.blocked ? 'blocked — it cannot be billed' : 'unblocked'}.`);
    if (recallState && $('#modalBack').classList.contains('open')) recallModal(recallState.a);
  }
  function recallWa(k) {
    const x = recallState?.parties.find(y => y.k === k); if (!x?.p) return;
    openWa(x.p.phone, ($('#rcMsg')?.value || '').replace(/\{party\}/g, x.p.owner || x.p.name));
    logAgent('recall', `Recall message → ${x.name} (WhatsApp)`);
  }
  function recallReturn() {
    const st = recallState; if (!st) return;
    const open = st.h.batches.filter(b => avail(b) > 0 && b.supplierId); if (!open.length) return;
    const sid = open[0].supplierId;
    purchaseReturnModal({ supplierId: sid, picks: Object.fromEntries(open.filter(b => b.supplierId === sid).map(b => [b.id, { qty: b.qty || 0, free: b.free || 0 }])), reason: 'Recall / drug alert' });
  }
  ACTIONS['batch-unblock'] = id => { const b = batchById(id); if (!b) return; b.blocked = false; delete b.blockNote; delete b.blockedOn; logAgent('manual', `${prod(b.productId)?.name} batch ${b.batch} unblocked`); refresh(); toast(`Batch ${b.batch} can be billed again.`); };
  ACTIONS['recall-view'] = id => {
    const r = recallById(id); if (!r) return;
    openModal({
      title: `${r.source} — ${r.ref || fmtDate(r.date)}`, size: 'xl',
      body: `${detailGrid([['Date', fmtDate(r.date)], ['Items', qty(r.items.length)], ['Added on', fmtDate(r.created || r.date)]])}
        ${miniTable([
          { h: 'Listed as', c: it => `<span class="strong">${esc(it.name || '—')}</span><div class="small muted">${esc(it.mfg || '')}</div>` },
          { h: 'Batch', c: it => esc(it.batch || '—') },
          { h: 'Reason', c: it => `<span class="small">${esc(it.reason || '')}</span>` },
          { h: 'Your stock / sales', c: it => { const hs = recallHits(it); return hs.length ? hs.map(h => `<div><b>${esc(prod(h.pid).name)}</b> · ${qty(h.batches.reduce((a, b) => a + avail(b), 0))} in stock · ${hitParties(h).length} part(ies)${it.done?.[h.pid] ? ' ' + pill('Done') : ''}</div>`).join('') : '<span class="muted">No match</span>'; } },
        ], r.items)}`,
    });
  };
  ACTIONS['recall-del'] = id => { const r = recallById(id); if (!r) return; confirmModal('Delete this alert list?', `${esc(r.source)} with ${r.items.length} item(s). Blocked batches stay blocked until you unblock them. This cannot be undone.`, 'Delete', () => { db.recalls = db.recalls.filter(x => x !== r); db.approvals.forEach(a => { if (a.kind === 'recall' && a.status === 'Pending' && a.payload?.rid === id) Object.assign(a, { status: 'Dismissed', done: new Date().toISOString(), note: 'Alert list deleted' }); }); return 'Alert list deleted.'; }); };
  VIEWS.recalls = () => {
    const rs = db.recalls || [];
    const blocked = db.batches.filter(b => b.blocked && avail(b) > 0);
    const all = rs.flatMap(r => r.items.map(it => recallHits(it)));
    const inStock = all.filter(hs => hs.some(h => h.batches.some(b => avail(b) > 0))).length;
    return `
      <div class="grid g-4">
        ${kpi('Alert lists saved', qty(rs.length), rs[0] ? `Latest ${fmtDate(rs[0].date)}` : 'Add the monthly CDSCO list')}
        ${kpi('Items on the lists', qty(all.length), 'Product / batch entries')}
        ${kpi('Matches in your stock', qty(inStock), inStock ? 'See Agents & Approvals' : 'Nothing in stock matches')}
        ${kpi('Blocked batches', qty(blocked.length), 'Cannot be billed')}
      </div>
      ${useList({
        key: 'recalls', title: 'Drug alert lists',
        actions: actBtn('recall-new', '', icon('plus') + 'Add alert list', 'primary'),
        rows: () => rs, text: r => [r.source, r.ref, ...r.items.map(i => [i.name, i.batch, i.mfg].join(' '))].join(' '),
        empty: 'No alert lists yet. Add the monthly CDSCO NSQ / spurious drug alert, a banned FDC list or a company recall — the Recall & NSQ Watch agent checks your stock and sales against it.',
        columns: [
          { h: 'Date', c: r => fmtDate(r.date) },
          { h: 'Alert', c: r => `<span class="strong">${esc(r.source)}</span><div class="small muted">${esc(r.ref || '')}</div>` },
          { h: 'Items', r: 1, c: r => qty(r.items.length) },
          { h: 'Found in stock / sales', r: 1, c: r => { const n = r.items.filter(it => recallHits(it).length).length; return n ? `<span class="bad-text strong">${n}</span>` : '0'; } },
          { h: '', c: r => rowActs(actBtn('recall-view', r.id, 'View', 'ghost'), actBtn('recall-del', r.id, 'Delete', 'ghost danger')) },
        ],
      })}
      ${useList({
        key: 'blocked', title: 'Blocked batches', noSearch: true, rows: () => blocked, text: b => prod(b.productId)?.name || '',
        empty: 'No batch is blocked.',
        columns: [
          { h: 'Item', c: b => `<span class="strong">${esc(prod(b.productId)?.name || '')}</span><div class="small muted">${esc(b.blockNote || '')}${b.blockedOn ? ' · ' + fmtDate(b.blockedOn) : ''}</div>` },
          { h: 'Batch', c: b => esc(b.batch) }, { h: 'Exp', c: b => isoToExp(b.expiry) }, { h: 'In stock', r: 1, c: b => qty(avail(b)) },
          { h: 'Supplier', c: b => esc(sup(b.supplierId)?.name || '—') },
          { h: '', c: b => rowActs(actBtn('batch-unblock', b.id, 'Unblock', 'ghost')) },
        ],
      })}`;
  };

  // ----- Price Ceiling (NPPA / DPCO) -----
  function runCeilingAgent() {
    const keep = new Set(); let made = 0, over = 0;
    db.products.forEach(p => {
      const mx = maxMrp(p); if (!mx) return;
      const bad = db.batches.filter(b => b.productId === p.id && avail(b) > 0 && num(b.mrp) > mx + 0.01);
      const masterBad = num(p.mrp) > mx + 0.01;
      if (!bad.length && !masterBad) return;
      over++;
      made += p4Add('ceiling', keep, { key: 'ceil:' + p.id, kind: 'info', title: `MRP above the NPPA ceiling — ${p.name}`,
        detail: [`Ceiling ₹${dec(p.ceiling)} + GST ${dec(p.gst)}% = highest allowed MRP ₹${dec(mx)} per pack${p.ceilingRef ? ` (${p.ceilingRef})` : ''}`, ...(masterBad ? [`Product MRP ₹${dec(p.mrp)}`] : []), ...bad.slice(0, 4).map(b => `Batch ${b.batch}: MRP ₹${dec(b.mrp)} · ${qty(avail(b))} in stock${b.supplierId ? ' · ' + (sup(b.supplierId)?.name || '') : ''}`), 'Do not sell above the ceiling: ask the supplier for corrected stock or a credit note, or return it. Check the latest NPPA notification first.'],
        payload: { act: ['edit-product', p.id] } });
    });
    const missing = db.products.filter(p => p.dpco && !(p.ceiling > 0));
    if (missing.length) made += p4Add('ceiling', keep, { key: 'ceil:missing', kind: 'info', title: `${missing.length} scheduled (DPCO) product${missing.length === 1 ? '' : 's'} without a ceiling price`, detail: [missing.slice(0, 6).map(p => p.name).join(', ') + (missing.length > 6 ? '…' : ''), 'Add the NPPA ceiling price in the product, or import the NPPA list.'], payload: { act: ['ceiling-import', ''] } }, 7);
    closeStale('ceiling', keep);
    return { made, summary: `${over} product(s) above the ceiling · ${db.products.filter(p => p.ceiling > 0).length} with a ceiling price` };
  }
  // Checks while entering a supplier bill (Bill Upload / Entry)
  function phase4LineChecks(l, p, warn) {
    const mx = maxMrp(p);
    if (mx && num(l.mrp) > mx + 0.01 && agentCfg('ceiling').enabled) warn(`MRP ₹${dec(l.mrp)} is above the NPPA ceiling (₹${dec(mx)} with GST)`);
    const k = bkey(l.batch);
    if (k && agentCfg('recall').enabled && (db.recalls || []).some(r => r.items.some(it => bkey(it.batch) === k))) warn('This batch number is on a drug alert list — check before adding it to stock');
  }
  const CEIL_SCHEMA = { type: 'object', additionalProperties: false, required: ['matches'], properties: { matches: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['product_id', 'formulation', 'ceiling_per_unit', 'unit', 'units_per_pack', 'ceiling_per_pack', 'notification'], properties: { product_id: strS, formulation: strS, ceiling_per_unit: numS, unit: strS, units_per_pack: numS, ceiling_per_pack: numS, notification: strS } } } } };
  let ceilState = [];
  ACTIONS['ceiling-import'] = () => {
    ceilState = [];
    openModal({
      title: 'Import NPPA ceiling prices', size: 'xl', submitLabel: 'Save ticked prices',
      body: `<div class="form-grid">
          <div class="field full"><label for="ceFiles">NPPA notification (PDF or photo) — AI matches it to your products</label><div class="toolbar"><input type="file" id="ceFiles" accept="application/pdf,image/*" multiple><button type="button" class="btn" data-p4="ceil-read">${icon('spark')}Read with AI</button></div></div>
          <div class="field full"><label for="ceCsv">Or type: product ID or name, ceiling price per pack before GST — one per line</label><textarea id="ceCsv" rows="4" placeholder="P012, 41.20&#10;DOLO 650 15TAB, 30.50"></textarea><div style="margin-top:6px"><button type="button" class="btn sm" data-p4="ceil-csv">Check these</button></div></div>
        </div>
        <div id="ceResult"></div>
        <div class="small muted">NPPA ceiling prices are per tablet / capsule / ml and exclude GST. The MRP may be at most the ceiling × units in the pack + GST. Notifications are on nppaindia.nic.in. Check every row before saving — an AI or name match can be wrong.</div>`,
      onSubmit: v => {
        const pick = ceilState.filter((r, i) => v['ce_' + i]);
        if (!pick.length) { toast('Tick at least one row.'); return false; }
        pick.forEach(r => { const p = prod(r.pid); if (p) Object.assign(p, { ceiling: round2(r.perPack), dpco: true, ceilingRef: r.ref || '' }); });
        logAgent('ceiling', `Ceiling prices saved for ${pick.length} product(s)`);
        runAgent('ceiling', false);
        return `Ceiling prices saved for ${pick.length} product(s). ${agentCfg('ceiling').lastResult}.`;
      },
    });
  };
  function renderCeil() {
    const box = $('#ceResult'); if (!box) return;
    box.innerHTML = ceilState.length ? `<div class="card-title" style="font-size:15px">Matches — untick any that are wrong</div>${miniTable([
      { h: '', c: (r, i) => `<input type="checkbox" class="cb" name="ce_${i}" checked aria-label="Use this row">` },
      { h: 'Your product', c: r => `<span class="strong">${esc(prod(r.pid)?.name || '')}</span><div class="small muted">${esc(prod(r.pid)?.pack || '')}${prod(r.pid)?.salt ? ' · ' + esc(prod(r.pid).salt) : ''}</div>` },
      { h: 'NPPA formulation', c: r => `<span class="small">${esc(r.formulation || '')}</span><div class="small muted">${esc(r.ref || '')}</div>` },
      { h: 'Per unit', r: 1, c: r => r.perUnit ? `${dec(r.perUnit)}<div class="small muted">${esc(r.unit || '')}</div>` : '—' },
      { h: 'Units', r: 1, c: r => r.units ? qty(r.units) : '—' },
      { h: 'Ceiling / pack', r: 1, c: r => dec(r.perPack) },
      { h: 'Max MRP', r: 1, c: r => dec(round2(r.perPack * (1 + num(prod(r.pid)?.gst) / 100))) },
      { h: 'Your MRP', r: 1, c: r => { const p = prod(r.pid), mx = round2(r.perPack * (1 + num(p?.gst) / 100)); return `<span class="${num(p?.mrp) > mx + 0.01 ? 'bad-text strong' : ''}">${dec(p?.mrp)}</span>`; } },
    ], ceilState)}` : '<div class="empty">No products matched.</div>';
  }
  async function readCeilingFile() {
    const files = [...($('#ceFiles')?.files || [])];
    if (!files.length) { toast('Choose the NPPA notification first.'); return; }
    if (!getApiKey()) { toast('Add the Anthropic API key in Settings → Integrations → AI providers.'); return; }
    const btn = $('[data-p4="ceil-read"]'); btn.disabled = true; btn.textContent = 'Reading…';
    const list = db.products.slice(0, 1500).map(p => `${p.id} | ${p.name} | salt: ${p.salt || ''} | form: ${p.form || ''} | pack: ${p.pack || ''}`).join('\n');
    const prompt = `This is a price notification of India's National Pharmaceutical Pricing Authority (NPPA) under the Drugs (Prices Control) Order 2013 — ceiling prices or retail prices of formulations.

Our product list (ID | name | salt | form | pack):
${list}

For each of OUR products that is clearly the same formulation as a row in the document — same active ingredient(s), same strength and same dosage form — return:
- product_id: our ID
- formulation: the formulation as printed in the document, with strength
- ceiling_per_unit: the ceiling (or retail) price in rupees per unit as printed, excluding GST
- unit: the unit it is priced per, e.g. "1 tablet", "1 ml", "1 vial"
- units_per_pack: how many such units are in our pack (e.g. 10TAB → 10, 15TAB → 15, 100ML priced per ml → 100)
- ceiling_per_pack: ceiling_per_unit × units_per_pack, rounded to 2 decimals
- notification: the S.O. number and date if printed, else empty

Only include confident matches. A brand name alone is not enough: the ingredients and strength must match. Leave out our products that are not in the document. If no product matches, return an empty list.`;
    try {
      const x = await callClaudeJson(files, prompt, CEIL_SCHEMA, 16000, aiModel('bill'));
      ceilState = (x.matches || []).filter(m => prod(m.product_id) && num(m.ceiling_per_pack) > 0).map(m => ({ pid: m.product_id, formulation: m.formulation, perUnit: num(m.ceiling_per_unit), unit: m.unit, units: num(m.units_per_pack), perPack: round2(num(m.ceiling_per_pack)), ref: m.notification }));
      logAgent('ceiling', `Read an NPPA notification: ${ceilState.length} product match(es)`);
      renderCeil();
    } catch (err) { toast(err.message || 'Could not read the file.'); }
    finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = icon('spark') + 'Read with AI'; } }
  }
  function ceilingFromCsv() {
    const rows = String($('#ceCsv')?.value || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const out = [], miss = [];
    rows.forEach(l => {
      const m = /^(.*?)[,\t|]\s*([\d.]+)\s*$/.exec(l); if (!m) { miss.push(l); return; }
      const key = m[1].trim(); const p = prod(key.toUpperCase()) || prod(key) || findProductByName(key);
      if (!p || !(num(m[2]) > 0)) { miss.push(l); return; }
      out.push({ pid: p.id, formulation: 'Typed by you', perUnit: 0, unit: '', units: 0, perPack: round2(num(m[2])), ref: '' });
    });
    ceilState = out; renderCeil();
    if (miss.length) toast(`${miss.length} line(s) not matched: ${miss.slice(0, 2).join('; ')}`);
  }

  // ----- Schedule H1 / X / NDPS register -----
  function registerRows(month, sch) {
    const out = [];
    db.sales.filter(s => s.date.slice(0, 7) === month).sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no)).forEach(s => s.lines.forEach(l => {
      const p = prod(l.productId); if (!regItem(p) || (sch && p.schedule !== sch)) return;
      out.push({ s, l, p, pt: partyOf(s) });
    }));
    return out;
  }
  let regState = { month: todayIso.slice(0, 7), sch: '' };
  ACTIONS['h1-register'] = m => { if (m && /^\d{4}-\d{2}$/.test(m)) regState.month = m; registerModal(); };
  function registerModal() {
    const { month, sch } = regState; const rows = registerRows(month, sch);
    const unset = db.products.filter(p => !p.schedule).length;
    const mLabel = new Date(month + '-01T00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const head = sch ? (sch === 'NDPS' ? 'NDPS' : 'SCHEDULE ' + sch) : 'SCHEDULE H1 / X / NDPS';
    openModal({
      title: 'Schedule H1 / X / NDPS sale register', size: 'xl',
      extraFoot: printFoot('a4l', '<button type="button" class="btn" data-p4="reg-csv">CSV</button>'),
      body: `<div class="toolbar no-print"><label class="bf"><span>Month</span><input type="month" id="regMonth" value="${month}"></label><label class="bf"><span>Schedule</span><select id="regSch">${[['', 'H1, X and NDPS'], ['H1', 'Schedule H1'], ['X', 'Schedule X'], ['NDPS', 'NDPS']].map(([v, l]) => `<option value="${v}" ${v === sch ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${unset ? `<span class="small bad-text">${unset} product(s) have no schedule set and are not in this register (Products & Masters → Edit, or tick and set Schedule).</span>` : ''}</div>
        <div class="paper-wrap"><div class="paper paper-a4l"><div class="bill">
          ${paperHead(`REGISTER OF SALE — ${head} DRUGS`, `<div class="strong">Month: ${esc(mLabel)}</div><div>${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}</div>`)}
          <table class="ledger-table"><thead><tr><th>#</th><th>Date</th><th>Bill no.</th><th>Sold to (name and address)</th><th>Licence no. / prescriber</th><th>Name of drug</th><th>Sch.</th><th>Batch</th><th>Exp</th><th class="r">Qty</th></tr></thead>
          <tbody>${rows.map((x, i) => `<tr><td>${i + 1}</td><td>${fmtDate(x.s.date)}</td><td>${esc(x.s.no)}</td><td><b>${esc(partyName(x.s))}</b><div class="small">${esc((x.pt && addrText(x.pt)) || x.s.party.phone || '')}</div></td><td class="small">${esc(x.s.party.type === 'chemist' ? [x.pt?.dl1, x.pt?.dl2].filter(Boolean).join(', ') || 'No licence saved' : x.s.rx || 'Prescription not entered')}</td><td>${esc(x.p.name)}<div class="small">${esc(x.p.salt || x.p.pack || '')}</div></td><td>${esc(x.p.schedule)}</td><td>${esc(x.l.batch)}</td><td>${isoToExp(x.l.expiry)}</td><td class="r num">${qty(x.l.qty + (x.l.free || 0))}</td></tr>`).join('') || '<tr><td colspan="10" class="muted">No sales of these drugs in this month.</td></tr>'}</tbody></table>
          <div class="bill-sign"><div><span>&nbsp;</span><span class="sig-line">Checked by</span></div><div><span>For <b>${esc(db.settings.firm.name)}</b></span><span class="sig-line">Registered pharmacist / competent person</span></div></div>
        </div></div></div>`,
    });
  }
  function registerCsv() {
    const rows = registerRows(regState.month, regState.sch);
    const out = [['Date', 'Bill no', 'Sold to', 'Address', 'Licence / prescriber', 'Drug', 'Salt', 'Schedule', 'Batch', 'Expiry', 'Qty'], ...rows.map(x => [x.s.date, x.s.no, partyName(x.s), (x.pt && addrText(x.pt)) || '', x.s.party.type === 'chemist' ? [x.pt?.dl1, x.pt?.dl2].filter(Boolean).join(' / ') : x.s.rx || '', x.p.name, x.p.salt || '', x.p.schedule, x.l.batch, isoToExp(x.l.expiry), x.l.qty + (x.l.free || 0)])];
    downloadText(`register-${regState.sch || 'H1-X-NDPS'}-${regState.month}.csv`, out.map(r => r.map(csvCell).join(',')).join('\r\n'));
  }
  function runRegisterAgent() {
    const c = agentCfg('h1'); const keep = new Set(); let made = 0;
    const add = (item, days) => { made += p4Add('h1', keep, item, days); };
    const recent = db.sales.filter(s => s.date >= addDays(todayIso, -c.days));
    // Sold to chemists without a valid drug licence on the bill date
    const noLic = {};
    recent.forEach(s => {
      if (s.party.type !== 'chemist' || !s.lines.some(l => regItem(prod(l.productId)))) return;
      const ch = chem(s.party.chemistId); if (!ch) return;
      const why = !ch.dl1 && !ch.dl2 ? 'no drug licence number saved' : ch.dlValid && ch.dlValid < s.date ? `licence expired on ${fmtDate(ch.dlValid)}` : '';
      if (why) (noLic[ch.id] = noLic[ch.id] || { ch, why, bills: [] }).bills.push(s.no);
    });
    Object.values(noLic).forEach(x => add({ key: 'reg:lic:' + x.ch.id, kind: 'info', title: `H1 / X / NDPS items sold to ${x.ch.name} — ${x.why}`, detail: [`Bills: ${x.bills.join(', ')}`, 'These drugs may be sold only to a licensed chemist. Update the licence, or stop supplying these items.'], payload: { act: ['view-chemist', x.ch.id] } }, 7));
    // Retail bills without prescription details
    const noRx = recent.filter(s => s.party.type !== 'chemist' && !String(s.rx || '').trim() && s.lines.some(l => regItem(prod(l.productId))));
    if (noRx.length) add({ key: 'reg:rx', kind: 'info', title: `${noRx.length} retail bill(s) with H1 / X / NDPS items have no prescription details`, detail: [noRx.slice(0, 8).map(s => s.no).join(', '), 'Edit the bill and fill “Prescription (doctor, reg. no.)”, and keep a copy of the prescription.'], payload: { go: 'sales' } }, 7);
    // Unusual quantities to one chemist (possible misuse)
    const watch = ['X', 'NDPS', ...(c.watchH1 ? ['H1'] : [])];
    const from30 = addDays(todayIso, -30), from120 = addDays(todayIso, -120); const sum = {};
    db.sales.filter(s => s.date >= from120 && s.party.type === 'chemist').forEach(s => s.lines.forEach(l => {
      const p = prod(l.productId); if (!p || !watch.includes(p.schedule)) return;
      const o = sum[s.party.chemistId + '|' + p.id] || (sum[s.party.chemistId + '|' + p.id] = { now: 0, before: 0 });
      if (s.date >= from30) o.now += l.qty + (l.free || 0); else o.before += l.qty + (l.free || 0);
    }));
    Object.entries(sum).forEach(([k, o]) => {
      const avgM = o.before / 3; if (o.now < c.minQty || o.now < avgM * c.spikeX) return;
      const [cid, pid] = k.split('|');
      add({ key: 'reg:spike:' + k, kind: 'info', title: `Unusual quantity — ${prod(pid).name} to ${chem(cid)?.name || cid}`, detail: [`${qty(o.now)} in the last 30 days · usually ${qty(Math.round(avgM))} a month`, 'Check the reason before supplying more. Schedule X and NDPS sales are watched by the Drug Controller and the NCB.'], payload: { act: ['view-chemist', cid] } }, 30);
    });
    if (c.remindUnset) { const unset = db.products.filter(p => !p.schedule); if (unset.length) add({ key: 'reg:unset', kind: 'info', title: `${unset.length} product(s) have no schedule set (OTC, G, H, H1, X, NDPS)`, detail: [unset.slice(0, 5).map(p => p.name).join(', ') + (unset.length > 5 ? '…' : ''), 'Products & Masters → tick products → Schedule. Only H1, X and NDPS items go into the register.'], payload: { go: 'products' } }, 14); }
    if (TODAY.getDate() >= c.printDay) {
      const prev = iso(new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1)).slice(0, 7); const n = registerRows(prev, '').length;
      if (n) add({ key: 'reg:print:' + prev, kind: 'info', title: `Print the H1 / X / NDPS register for ${prev}`, detail: [`${n} entr${n === 1 ? 'y' : 'ies'} · sign it and keep it for inspection`], payload: { act: ['h1-register', prev] } }, 45);
    }
    closeStale('h1', keep);
    return { made, summary: `${db.products.filter(regItem).length} register item(s) · ${keep.size} alert(s)` };
  }

  // ----- Chemist Credit Risk -----
  const DEFAULT_WINBACK = 'Namaste {party} ji,\n{firm} se kaafi din se aapka order kam aaya hai. Koi dikkat ho, rate ya koi item chahiye ho to bataiye — hum turant arrange karenge.\nDhanyavaad';
  function creditProfile(cid) {
    const ch = chem(cid); if (!ch) return null;
    const terms = ch.terms ?? 30, out = chemOutstanding(cid);
    const bills = db.sales.filter(s => s.party.chemistId === cid && s.date >= addDays(todayIso, -365));
    if (!bills.length) return { grade: '—', score: null, avgPay: 0, out, overdue: 0, util: ch.creditLimit ? out / ch.creditLimit : 0, why: ['No bills in the last 12 months'] };
    let wDays = 0, wAmt = 0;
    bills.forEach(s => {
      const closed = balance(s) <= 0.5;
      if (!closed && -daysFrom(s.date) <= terms) return; // still within terms — no signal yet
      const end = closed ? (payList(s).filter(p => p.amount > 0).map(p => p.date).sort().pop() || s.date) : todayIso;
      wDays += Math.max(0, Math.round((parse(end) - parse(s.date)) / DAY)) * s.total; wAmt += s.total;
    });
    const avgPay = wAmt ? Math.round(wDays / wAmt) : 0;
    const od = db.sales.filter(s => s.party.chemistId === cid && saleStatus(s) === 'Overdue');
    const overdue = round2(od.reduce((a, s) => a + balance(s), 0));
    const oldest = od.length ? Math.max(...od.map(s => -daysFrom(s.date))) : 0;
    const util = ch.creditLimit ? out / ch.creditLimit : 0;
    const why = [];
    const p1 = Math.min(40, Math.round(Math.max(0, avgPay - terms) * 1.5));
    if (wAmt) why.push(p1 ? `Pays in ${avgPay} days on average (terms ${terms})` : `Pays within terms (${avgPay} days on average)`);
    const p2 = out > 0 && overdue > 0.5 ? Math.min(30, Math.round(Math.min(overdue, out) / out * 30)) : 0;
    if (overdue > 0.5) why.push(`${money(overdue)} overdue in ${od.length} bill${od.length === 1 ? '' : 's'}`);
    const p3 = util > 1 ? 20 : util > 0.8 ? 8 : 0; if (util > 0.8) why.push(`Using ${Math.round(util * 100)}% of the credit limit`);
    const p4 = oldest > terms + 60 ? 10 : 0; if (p4) why.push(`Oldest unpaid bill is ${oldest} days old`);
    const score = 100 - p1 - p2 - p3 - p4;
    return { score, grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D', avgPay, out, overdue, oldest, util, why };
  }
  const gradePill = pr => pr && pr.score != null ? pill('Score ' + pr.grade) : '<span class="muted small">—</span>';
  function runCreditAgent() {
    const c = agentCfg('credit'); const keep = new Set(); let made = 0, over = 0, up = 0, down = 0, wb = 0;
    const add = (item, days) => { const n = p4Add('credit', keep, item, days); made += n; return keep.has(item.key); };
    const r10 = v => Math.ceil(v / 10000) * 10000;
    const sumSince = (cid, from, to) => db.sales.filter(s => s.party.chemistId === cid && s.date >= from && (!to || s.date < to)).reduce((a, s) => a + s.total, 0);
    db.chemists.filter(ch => ch.status === 'Active').forEach(ch => {
      const pr = creditProfile(ch.id); if (!pr) return;
      if (ch.creditLimit && pr.out > ch.creditLimit && add({ key: 'credit:over:' + ch.id, kind: 'info', title: `${ch.name} is ${money(pr.out - ch.creditLimit)} above the credit limit`, detail: [`Outstanding ${money(pr.out)} · limit ${money(ch.creditLimit)} · score ${pr.grade}`, ...pr.why], payload: { act: ['view-chemist', ch.id] } }, 7)) over++;
      const recent = sumSince(ch.id, addDays(todayIso, -90));
      if (pr.grade === 'A' && ch.creditLimit && pr.util >= c.raiseAt / 100 && recent > 0) {
        const nl = r10(Math.max(ch.creditLimit * (1 + c.stepPct / 100), pr.out * 1.2));
        if (add({ key: 'credit:limit:' + ch.id, kind: 'creditlimit', title: `Raise ${ch.name}’s credit limit to ${money(nl)}?`, detail: [`Score A · ${pr.why[0] || ''} · using ${Math.round(pr.util * 100)}% of ${money(ch.creditLimit)}`, `Bought ${money(recent)} in the last 90 days`], payload: { cid: ch.id, limit: nl, from: ch.creditLimit } }, c.reviewDays)) up++;
      } else if (pr.grade === 'D' && ch.creditLimit > Math.max(pr.out, 0)) {
        const nl = Math.max(r10(Math.max(pr.out, 0)), r10(ch.creditLimit * (1 - c.stepPct / 100)));
        if (nl < ch.creditLimit && add({ key: 'credit:limit:' + ch.id, kind: 'creditlimit', title: `Lower ${ch.name}’s credit limit to ${money(nl)}?`, detail: [`Score D (${pr.score}/100)`, ...pr.why], payload: { cid: ch.id, limit: nl, from: ch.creditLimit } }, c.reviewDays)) down++;
      }
      const usual = sumSince(ch.id, addDays(todayIso, -120), addDays(todayIso, -30)) / 3, now = sumSince(ch.id, addDays(todayIso, -30));
      if (usual >= c.winbackMin && now < usual * (1 - c.dropPct / 100)) {
        const last = db.sales.filter(s => s.party.chemistId === ch.id).map(s => s.date).sort().pop();
        if (add({ key: 'credit:winback:' + ch.id, kind: 'winback', title: `${ch.name} is buying less — ${money(now)} in the last 30 days, usually ${money(usual)}`, detail: [`Last bill ${last ? fmtDate(last) : '—'} · score ${pr.grade}`, 'Call or message them: ask about service, rates or items they need.'], payload: { cid: ch.id } }, c.winbackDays)) wb++;
      }
    });
    closeStale('credit', keep);
    return { made, summary: `${over} over limit, ${up} limit raise(s), ${down} limit cut(s), ${wb} to win back` };
  }
  ACTIONS['credit-report'] = () => {
    const rows = db.chemists.filter(ch => ch.status !== 'Pending verification').map(ch => ({ ch, pr: creditProfile(ch.id) })).sort((a, b) => (a.pr.score ?? 101) - (b.pr.score ?? 101));
    openModal({
      title: 'Chemist credit scores', size: 'xl',
      body: `<div class="small muted">Score out of 100 from the last 12 months: how fast bills are paid against the chemist’s terms, overdue amount, use of the credit limit and the oldest unpaid bill. A ≥ 80 · B ≥ 60 · C ≥ 40 · D below 40.</div>
        ${miniTable([
          { h: 'Chemist', c: x => `<span class="strong">${esc(x.ch.name)}</span><div class="small muted">${esc([x.ch.tehsil, x.ch.district].filter(Boolean).join(', '))} · ${pill(x.ch.status)}</div>` },
          { h: 'Score', c: x => `${gradePill(x.pr)} <span class="small">${x.pr.score ?? ''}</span>` },
          { h: 'Pays in', r: 1, c: x => x.pr.score != null ? `${x.pr.avgPay} d` : '—' },
          { h: 'Outstanding', r: 1, c: x => money(x.pr.out) },
          { h: 'Limit', r: 1, c: x => money(x.ch.creditLimit) },
          { h: 'Used', r: 1, c: x => `${Math.round(x.pr.util * 100)}%` },
          { h: 'Why', c: x => `<span class="small">${esc(x.pr.why.join(' · '))}</span>` },
        ], rows)}`,
    });
  };

  // ----- Schemes & Claims -----
  const SCHEME_TYPES = [['free', 'Free goods on purchase (buy X get Y)'], ['discount', 'Extra discount on purchase (%)'], ['claim', 'Company pays back on our sales (₹ per unit or %)']];
  const schemeById = id => (db.schemes || []).find(s => s.id === id);
  const schemeStatus = s => todayIso < s.from ? 'Upcoming' : todayIso > s.to ? 'Ended' : 'Active';
  const schemeOffer = s => s.type === 'free' ? `Buy ${qty(s.buy)} get ${qty(s.get)} free` : s.type === 'discount' ? `${dec(s.pct)}% extra off on purchase` : s.perUnit > 0 ? `₹${dec(s.perUnit)} back per unit sold` : `${dec(s.pct)}% of sale value back`;
  const schemeProducts = s => s.productIds?.length ? s.productIds.filter(prod) : db.products.filter(p => p.companyId === s.companyId).map(p => p.id);
  const claimFrom = s => { const last = (db.schemeClaims || []).filter(c => c.schemeId === s.id).map(c => c.to).sort().pop(); return last ? addDays(last, 1) : s.from; };
  function schemeClaimRows(s, from, to) {
    const pids = new Set(schemeProducts(s)); const rows = [];
    db.sales.filter(x => x.date >= from && x.date <= to).forEach(x => x.lines.forEach(l => {
      if (!pids.has(l.productId)) return;
      const val = calcLine(l).taxable;
      rows.push({ x, l, q: l.qty, val, amt: round2(s.perUnit > 0 ? l.qty * s.perUnit : val * num(s.pct) / 100) });
    }));
    return rows;
  }
  function schemeModal(s) {
    const isNew = !s; s = s || { type: 'free', from: todayIso, to: addDays(todayIso, 30), productIds: [], buy: 10, get: 1, pct: 0, perUnit: 0 };
    const sel = new Set(s.productIds || []);
    openModal({
      title: isNew ? 'Add a scheme' : `Edit ${s.name}`, size: 'lg', submitLabel: isNew ? 'Add scheme' : 'Save',
      body: `<div class="form-grid">
          ${field('Scheme name', 'name', { value: s.name || '', required: true, attrs: 'placeholder="e.g. Lupin Diwali 10+1"' })}
          ${field('Company / brand', 'company', { value: company(s.companyId)?.name || '', required: true, attrs: 'list="dl-companies"' })}
          ${field('Type', 'type', { value: s.type, options: SCHEME_TYPES, full: true })}
          ${field('Buy (qty)', 'buy', { type: 'number', value: s.buy || '', attrs: numAttrs('1') })}
          ${field('Get free (qty)', 'get', { type: 'number', value: s.get || '', attrs: numAttrs('1') })}
          ${field('Discount / claim %', 'pct', { type: 'number', value: s.pct || '', attrs: numAttrs() })}
          ${field('Claim ₹ per unit sold', 'perUnit', { type: 'number', value: s.perUnit || '', attrs: numAttrs() })}
          ${field('From', 'from', { type: 'date', value: s.from, required: true })}
          ${field('To', 'to', { type: 'date', value: s.to, required: true })}
          ${field('Only on bills from supplier (optional)', 'supplierId', { value: s.supplierId || '', options: [['', 'Any supplier'], ...db.suppliers.map(x => [x.id, x.name]).sort(byName)] })}
          <div class="field full"><label for="f-pids">Products — none ticked means every product of the company</label><select id="f-pids" multiple size="8">${[...db.products].sort((a, b) => a.name.localeCompare(b.name)).map(p => `<option value="${p.id}" ${sel.has(p.id) ? 'selected' : ''}>${esc(p.name)} · ${esc(company(p.companyId)?.name || '')}</option>`).join('')}</select><div class="small muted">Hold Ctrl (or Cmd) to pick several.</div></div>
          ${field('Note', 'note', { value: s.note || '', full: true })}
        </div>
        <div class="small muted">Free goods and discount schemes are checked against your purchase bills. Claim schemes add up your sales of the products in the period so you can claim the amount from the company.</div>`,
      onSubmit: (d, form) => {
        const rec = { name: d.name.trim(), companyId: findOrCreateCompany(d.company), type: d.type, buy: Math.floor(num(d.buy)), get: Math.floor(num(d.get)), pct: num(d.pct), perUnit: num(d.perUnit), from: d.from, to: d.to, supplierId: d.supplierId || '', note: (d.note || '').trim(), productIds: [...form.querySelector('#f-pids').selectedOptions].map(o => o.value) };
        if (rec.to < rec.from) { toast('“To” must be on or after “From”.'); return false; }
        if (rec.type === 'free' && !(rec.buy > 0 && rec.get > 0)) { toast('Enter Buy and Get free quantities.'); return false; }
        if (rec.type === 'discount' && !(rec.pct > 0)) { toast('Enter the discount %.'); return false; }
        if (rec.type === 'claim' && !(rec.perUnit > 0 || rec.pct > 0)) { toast('Enter the claim ₹ per unit or %.'); return false; }
        if (isNew) db.schemes.unshift({ id: uid(), created: todayIso, ...rec }); else Object.assign(s, rec);
        return `${rec.name} ${isNew ? 'added' : 'saved'}.`;
      },
    });
  }
  ACTIONS['scheme-new'] = () => schemeModal(null);
  ACTIONS['scheme-edit'] = id => { const s = schemeById(id); if (s) schemeModal(s); };
  ACTIONS['scheme-del'] = id => { const s = schemeById(id); if (!s) return; confirmModal(`Delete ${esc(s.name)}?`, 'Saved claims for it are kept. This cannot be undone.', 'Delete', () => { db.schemes = db.schemes.filter(x => x !== s); return 'Scheme deleted.'; }); };
  let claimState = null;
  function claimModal(sid, approvalId) {
    const s = schemeById(sid); if (!s) { if (approvalId) { doneApproval(approvalId, 'Scheme deleted'); refresh(); } return; }
    const from = claimFrom(s), to = s.to < todayIso ? s.to : todayIso;
    const rows = from <= to ? schemeClaimRows(s, from, to) : [];
    const tot = round2(rows.reduce((a, r) => a + r.amt, 0)), q = rows.reduce((a, r) => a + r.q, 0), co = company(s.companyId);
    claimState = { s, from, to, rows };
    openModal({
      title: `Scheme claim — ${s.name}`, size: 'xl', submitLabel: 'Save as claimed',
      extraFoot: printFoot('a4', '<button type="button" class="btn" data-p4="claim-csv">CSV</button>'),
      body: `<div class="paper-wrap"><div class="paper paper-a4"><div class="bill">
          ${paperHead('SCHEME CLAIM', `<div class="bill-to-label">To</div><div class="strong">${esc(co?.name || 'Company')}</div><div>${esc(s.name)} · ${esc(schemeOffer(s))}</div><div class="small">Period: ${fmtDate(from)} to ${fmtDate(to)}</div>`)}
          <table class="ledger-table"><thead><tr><th>Date</th><th>Bill</th><th>Party</th><th>Product</th><th>Batch</th><th class="r">Qty</th><th class="r">Taxable ₹</th><th class="r">Claim ₹</th></tr></thead>
          <tbody>${rows.map(r => `<tr><td>${fmtDate(r.x.date)}</td><td>${esc(r.x.no)}</td><td>${esc(partyName(r.x))}</td><td>${esc(prod(r.l.productId)?.name || '')}</td><td>${esc(r.l.batch)}</td><td class="r num">${qty(r.q)}</td><td class="r num">${dec(r.val)}</td><td class="r num">${dec(r.amt)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">No sales of these products in this period.</td></tr>'}</tbody>
          <tfoot><tr><td colspan="5">Total</td><td class="r num">${qty(q)}</td><td class="r num">${dec(rows.reduce((a, r) => a + r.val, 0))}</td><td class="r num">${dec(tot)}</td></tr></tfoot></table>
          <div class="bill-words"><span>Amount claimed</span>${money2(tot)} — ${esc(rupeesInWords(tot))}</div>
          <div class="small">Sales returns are not deducted — adjust if the company asks.</div>
          <div class="bill-sign"><div><span>&nbsp;</span><span class="sig-line">Company representative</span></div><div><span>For <b>${esc(db.settings.firm.name)}</b></span><span class="sig-line">Authorised signatory</span></div></div>
        </div></div></div>`,
      onSubmit: () => {
        if (!rows.length || tot <= 0) { toast('Nothing to claim in this period.'); return false; }
        db.schemeClaims.unshift({ id: uid(), schemeId: s.id, from, to, qty: q, amount: tot, status: 'Claimed', date: todayIso });
        if (approvalId) doneApproval(approvalId, `Claimed ₹${dec(tot)}`);
        logAgent('schemes', `Claim ${money(tot)} saved for ${s.name}`);
        return `Claim of ${money(tot)} saved — mark it received when the company pays or gives a credit note.`;
      },
    });
  }
  function claimCsv() {
    const st = claimState; if (!st) return;
    const out = [['Date', 'Bill', 'Party', 'Product', 'Batch', 'Qty', 'Taxable', 'Claim'], ...st.rows.map(r => [r.x.date, r.x.no, partyName(r.x), prod(r.l.productId)?.name || '', r.l.batch, r.q, plainNum(r.val), plainNum(r.amt)])];
    downloadText(`claim-${st.s.name.replace(/[^\w-]+/g, '_')}-${st.from}-${st.to}.csv`, out.map(r => r.map(csvCell).join(',')).join('\r\n'));
  }
  ACTIONS['scheme-claim'] = id => claimModal(id, '');
  ACTIONS['claim-received'] = id => { const c = (db.schemeClaims || []).find(x => x.id === id); if (!c) return; Object.assign(c, { status: 'Received', receivedOn: todayIso }); logAgent('manual', `Scheme claim ${money(c.amount)} received`); refresh(); toast('Marked received.'); };
  ACTIONS['claim-del'] = id => { const c = (db.schemeClaims || []).find(x => x.id === id); if (!c) return; confirmModal('Delete this claim?', `${money(c.amount)} for ${fmtDate(c.from)} – ${fmtDate(c.to)}. Its sales can then be claimed again.`, 'Delete', () => { db.schemeClaims = db.schemeClaims.filter(x => x !== c); return 'Claim deleted.'; }); };
  VIEWS.schemes = () => {
    const ss = db.schemes || [], cl = db.schemeClaims || [];
    const act = ss.filter(s => schemeStatus(s) === 'Active');
    return `
      <div class="grid g-4">
        ${kpi('Active schemes', qty(act.length), `${ss.length} saved`)}
        ${kpi('Ending within 7 days', qty(act.filter(s => daysFrom(s.to) <= 7).length), 'Stock up if needed')}
        ${kpi('Claims waiting', compact(cl.filter(c => c.status === 'Claimed').reduce((a, c) => a + c.amount, 0)), `${cl.filter(c => c.status === 'Claimed').length} claim(s) not received`)}
        ${kpi('Claims received', compact(cl.filter(c => c.status === 'Received').reduce((a, c) => a + c.amount, 0)), 'All time')}
      </div>
      ${useList({
        key: 'schemes', title: 'Schemes',
        actions: actBtn('scheme-new', '', icon('plus') + 'Add scheme', 'primary'),
        tabs: [{ id: 'all', label: 'All' }, ...['Active', 'Upcoming', 'Ended'].map(t => ({ id: t, label: t, filter: s => schemeStatus(s) === t }))],
        rows: () => [...ss].sort((a, b) => b.to.localeCompare(a.to)),
        text: s => [s.name, company(s.companyId)?.name, s.note, ...schemeProducts(s).map(id => prod(id)?.name)].join(' '),
        empty: 'No schemes yet. Add company schemes (10+1 free, extra discount, or claims on sales) — the Schemes & Claims agent checks your purchase bills and works out claims.',
        columns: [
          { h: 'Scheme', c: s => `<span class="strong">${esc(s.name)}</span><div class="small muted">${esc(company(s.companyId)?.name || '')}${s.supplierId ? ' · via ' + esc(sup(s.supplierId)?.name || '') : ''}</div>` },
          { h: 'Offer', c: s => esc(schemeOffer(s)) },
          { h: 'Products', c: s => { const ps = schemeProducts(s); return `<span class="small">${s.productIds?.length ? esc(ps.slice(0, 3).map(id => prod(id)?.name).join(', ')) + (ps.length > 3 ? ` +${ps.length - 3}` : '') : `All ${ps.length} of the company`}</span>`; } },
          { h: 'Valid', c: s => `${fmtDate(s.from)} – ${fmtDate(s.to)}` },
          { h: 'Status', c: s => pill(schemeStatus(s)) },
          { h: '', c: s => rowActs(s.type === 'claim' && s.from <= todayIso ? actBtn('scheme-claim', s.id, 'Claim', 'ghost') : '', actBtn('scheme-edit', s.id, 'Edit', 'ghost'), actBtn('scheme-del', s.id, 'Delete', 'ghost danger')) },
        ],
      })}
      ${useList({
        key: 'claims', title: 'Claims', noSearch: true, rows: () => cl, text: c => schemeById(c.schemeId)?.name || '',
        empty: 'No claims yet.',
        columns: [
          { h: 'Claimed on', c: c => fmtDate(c.date) },
          { h: 'Scheme', c: c => `<span class="strong">${esc(schemeById(c.schemeId)?.name || 'Deleted scheme')}</span><div class="small muted">${esc(company(schemeById(c.schemeId)?.companyId)?.name || '')}</div>` },
          { h: 'Period', c: c => `${fmtDate(c.from)} – ${fmtDate(c.to)}` },
          { h: 'Units', r: 1, c: c => qty(c.qty) },
          { h: 'Amount', r: 1, c: c => money(c.amount) },
          { h: 'Status', c: c => pill(c.status) + (c.receivedOn ? `<div class="small muted">${fmtDate(c.receivedOn)}</div>` : '') },
          { h: '', c: c => rowActs(c.status === 'Claimed' ? actBtn('claim-received', c.id, 'Mark received', 'ghost') : '', actBtn('claim-del', c.id, 'Delete', 'ghost danger')) },
        ],
      })}`;
  };
  function runSchemesAgent() {
    const c = agentCfg('schemes'); const keep = new Set(); let made = 0;
    const add = (item, days) => { made += p4Add('schemes', keep, item, days); };
    const plines = purchaseLines();
    (db.schemes || []).forEach(s => {
      const st = schemeStatus(s), pids = schemeProducts(s), coName = company(s.companyId)?.name || 'the company';
      if (st === 'Active' && daysFrom(s.to) <= c.warnDays) add({ key: 'sch:end:' + s.id, kind: 'info', title: `Scheme ends ${daysFrom(s.to) === 0 ? 'today' : `in ${daysFrom(s.to)} day(s)`} — ${s.name}`, detail: [`${schemeOffer(s)} · till ${fmtDate(s.to)}`, ...pids.slice(0, 4).map(id => `${prod(id).name}: ${qty(sellableQty(id))} in stock · ~${qty(monthlySold(id))}/month`), 'Order now if you need stock at the scheme rate.'], payload: { act: ['scheme-edit', s.id] } }, 365);
      if (s.type === 'free' || s.type === 'discount') {
        const set = new Set(pids), short = {};
        plines.filter(l => set.has(l.productId) && l.date >= s.from && l.date <= s.to && (!s.supplierId || l.supplierId === s.supplierId)).forEach(l => {
          const name = prod(l.productId)?.name || l.name;
          if (s.type === 'free') { const due = Math.floor(num(l.qty) / s.buy) * s.get; if (num(l.free) + 0.001 < due) (short[l.docNo] = short[l.docNo] || { act: l.act, lines: [] }).lines.push(`${name}: bought ${qty(l.qty)}, free ${qty(l.free)} — should be ${qty(due)}`); }
          else if (num(l.cd) + num(l.td) + 0.01 < s.pct) (short[l.docNo] = short[l.docNo] || { act: l.act, lines: [] }).lines.push(`${name}: discount ${dec(num(l.cd) + num(l.td))}% — scheme ${dec(s.pct)}%`);
        });
        Object.entries(short).forEach(([doc, x]) => add({ key: `sch:short:${s.id}:${doc}`, kind: 'info', title: `Scheme not given in full on ${doc} — ${s.name}`, detail: [...x.lines.slice(0, 4), `Ask ${sup(plines.find(l => l.docNo === doc)?.supplierId)?.name || 'the supplier'} for the free goods or a credit note.`], payload: { act: [x.act, doc] } }, 365));
      }
      if (s.type === 'claim' && s.to < todayIso) {
        const from = claimFrom(s);
        if (from <= s.to) { const rows = schemeClaimRows(s, from, s.to), amt = rows.reduce((a, r) => a + r.amt, 0); if (amt > 0.5) add({ key: `sch:claim:${s.id}:${s.to}`, kind: 'schemeclaim', title: `Claim ${money(amt)} from ${coName} — ${s.name}`, detail: [`${qty(rows.reduce((a, r) => a + r.q, 0))} units sold ${fmtDate(from)} – ${fmtDate(s.to)}`, schemeOffer(s)], payload: { sid: s.id } }, 365); }
      }
    });
    (db.schemeClaims || []).filter(x => x.status === 'Claimed' && daysFrom(x.date) <= -c.followDays).forEach(x => add({ key: 'sch:follow:' + x.id, kind: 'info', title: `Claim not received yet — ${money(x.amount)} from ${company(schemeById(x.schemeId)?.companyId)?.name || 'the company'}`, detail: [`Claimed on ${fmtDate(x.date)} for ${schemeById(x.schemeId)?.name || 'a scheme'} · ${fmtDate(x.from)} – ${fmtDate(x.to)}`, 'Follow up with the company representative.'], payload: { go: 'schemes' } }, 30));
    closeStale('schemes', keep);
    return { made, summary: `${(db.schemes || []).filter(s => schemeStatus(s) === 'Active').length} active scheme(s) · ${keep.size} item(s)` };
  }

  // ----- Route & Delivery -----
  const DEFAULT_DELIVERY = 'Namaste {party} ji,\n{firm} se aaj aapki delivery aa rahi hai: {bills}.\n{due}Dhanyavaad';
  function parseRoutes(text) {
    const map = {};
    String(text || '').split(/\r?\n/).forEach(line => {
      const m = /^\s*([A-Za-z]+)\s*[:\-–]\s*(.+)$/.exec(line); if (!m) return;
      const d = DAYS_EN.findIndex(x => x.slice(0, 3).toLowerCase() === m[1].slice(0, 3).toLowerCase()); if (d < 0) return;
      map[d] = (map[d] || []).concat(m[2].split(/[,;]/).map(s => s.trim()).filter(Boolean));
    });
    return map;
  }
  const inArea = (ch, areas) => !!ch && areas.some(a => [ch.tehsil, ch.subTehsil, ch.locality, ch.city, ch.district].some(v => v && norm(v) === norm(a)));
  const pendingDeliveries = () => db.sales.filter(s => s.party.type === 'chemist' && !s.delivered);
  function dispatchFor(day) {
    const routes = parseRoutes(agentCfg('route').routes), areas = routes[day] || null, any = Object.keys(routes).length > 0;
    const pend = pendingDeliveries();
    const bills = !any ? pend : areas ? pend.filter(s => inArea(chem(s.party.chemistId), areas)) : [];
    const byChem = {}; bills.forEach(s => (byChem[s.party.chemistId] = byChem[s.party.chemistId] || []).push(s));
    const orders = chemOrders.filter(o => ['New', 'Accepted', 'Arranging'].includes(o.status) && (!any || (areas && inArea(chem(o.chemistId), areas))));
    return { any, areas, bills, byChem, orders };
  }
  function runRouteAgent() {
    const c = agentCfg('route'); const keep = new Set(); let made = 0;
    const day = TODAY.getDay(), D = dispatchFor(day), n = Object.keys(D.byChem).length;
    if (!D.any) made += p4Add('route', keep, { key: 'route:setup', kind: 'info', title: 'Set your delivery routes', detail: ['Agents → Route & Delivery → Settings: one line per day, e.g. “Monday: Ghumarwin, Jhandutta”. Until then the dispatch list has every bill not yet delivered.'], payload: { act: ['agent-config', 'route'] } }, 30);
    if (D.bills.length || D.orders.length) made += p4Add('route', keep, { key: 'route:' + todayIso, kind: 'dispatch', title: `Today’s dispatch${D.areas ? ` — ${D.areas.join(', ')}` : ''}: ${D.bills.length} bill(s) for ${n} chemist(s)`, detail: [`Bills worth ${money(D.bills.reduce((a, s) => a + s.total, 0))}${D.orders.length ? ` · ${D.orders.length} chemist order(s) on this route still to bill` : ''}`, ...Object.entries(D.byChem).slice(0, 4).map(([cid, bs]) => `${chem(cid)?.name || cid} · ${bs.map(s => s.no).join(', ')}`)], payload: { day } });
    const late = pendingDeliveries().filter(s => -daysFrom(s.date) > c.lateDays);
    if (late.length) made += p4Add('route', keep, { key: 'route:late', kind: 'info', title: `${late.length} bill(s) not delivered after ${c.lateDays} days`, detail: [...late.slice(0, 5).map(s => `${s.no} · ${partyName(s)} · ${fmtDate(s.date)}`), 'Deliver them, or tick them as delivered in the dispatch list.'], payload: { act: ['route-plan', ''] } }, 1);
    closeStale('route', keep);
    return { made, summary: D.any && !D.areas ? `No route on ${DAYS_EN[day]} · ${pendingDeliveries().length} bill(s) waiting` : `${D.bills.length} bill(s) for ${n} chemist(s) today${late.length ? ` · ${late.length} late` : ''}` };
  }
  let dispState = null;
  function dispatchModal(day, approvalId) {
    const D = dispatchFor(day); dispState = { day, approvalId, D };
    const groups = {}; Object.keys(D.byChem).forEach(cid => { const ch = chem(cid); const g = [ch?.tehsil, ch?.district].filter(Boolean).join(', ') || 'Other'; (groups[g] = groups[g] || []).push(cid); });
    let n = 0;
    const body = Object.keys(groups).sort().map(g => `<tr class="ledger-open"><td colspan="8">${esc(g)}</td></tr>${groups[g].map(cid => {
      const ch = chem(cid), bs = D.byChem[cid]; n++;
      return `<tr><td>${n}</td><td><label class="check-line"><input type="checkbox" class="no-print" name="dl_${esc(cid)}" checked> <b>${esc(ch?.name || cid)}</b></label><div class="small">${esc(addrText(ch) || '')}</div></td><td>${esc(ch?.phone || '')}</td><td>${bs.map(s => esc(s.no)).join(', ')}${bs.some(s => s.lines.some(l => isCold(prod(l.productId)))) ? '<div class="small bad-text">❄ Cold items — pack with ice packs, deliver first</div>' : ''}<div class="small muted">${bs.reduce((a, s) => a + s.lines.length, 0)} line(s) · ${qty(bs.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty + (l.free || 0), 0), 0))} units</div></td><td class="r num">${dec(bs.reduce((a, s) => a + s.total, 0))}</td><td class="r num">${dec(Math.max(0, chemOutstanding(cid)))}</td><td></td><td class="no-print">${ch?.phone ? `<button type="button" class="btn sm ghost" data-p4="route-wa" data-id="${esc(cid)}">${icon('chat')}</button>` : ''}</td></tr>`;
    }).join('')}`).join('');
    openModal({
      title: 'Dispatch list', size: 'xl', submitLabel: 'Mark ticked as delivered',
      extraFoot: printFoot('a4'),
      body: `<div class="toolbar no-print"><label class="bf"><span>Route for</span><select id="dispDay">${DAYS_EN.map((d, i) => `<option value="${i}" ${i === day ? 'selected' : ''}>${d}${i === TODAY.getDay() ? ' (today)' : ''}</option>`).join('')}</select></label><span class="small muted">${D.any ? (D.areas ? `Areas: ${esc(D.areas.join(', '))}` : 'No route set for this day') : 'No routes set — showing every bill not yet delivered'}</span></div>
        <div class="paper-wrap"><div class="paper paper-a4"><div class="bill">
          ${paperHead('DISPATCH / LOADING SHEET', `<div class="strong">${DAYS_EN[day]}${day === TODAY.getDay() ? ', ' + fmtDate(todayIso) : ''}</div><div>${esc(D.areas ? D.areas.join(', ') : 'All areas')}</div><div>${D.bills.length} bill(s) · ${n} chemist(s)</div>`)}
          <table class="ledger-table"><thead><tr><th>#</th><th>Chemist</th><th>Mobile</th><th>Bills</th><th class="r">Bill ₹</th><th class="r">Total due ₹</th><th>Received by</th><th class="no-print"></th></tr></thead>
          <tbody>${body || '<tr><td colspan="8" class="muted">Nothing to deliver on this route.</td></tr>'}</tbody>
          <tfoot><tr><td colspan="4">Total</td><td class="r num">${dec(D.bills.reduce((a, s) => a + s.total, 0))}</td><td colspan="3"></td></tr></tfoot></table>
          ${D.orders.length ? `<div class="small"><b>Chemist orders on this route still to bill:</b> ${D.orders.map(o => `${esc(o.id)} (${esc(chem(o.chemistId)?.name || '')}, ${esc(o.status)})`).join(', ')}</div>` : ''}
          <div class="bill-sign"><div><span>Vehicle / driver: ____________</span><span class="sig-line">Loaded by</span></div><div><span>For <b>${esc(db.settings.firm.name)}</b></span><span class="sig-line">Dispatched by</span></div></div>
        </div></div></div>`,
      onSubmit: v => {
        const done = Object.keys(D.byChem).filter(cid => v['dl_' + cid]);
        if (!done.length) { toast('Tick the chemists whose goods were delivered.'); return false; }
        let nb = 0; done.forEach(cid => D.byChem[cid].forEach(s => { s.delivered = todayIso; nb++; }));
        if (approvalId) doneApproval(approvalId, `${nb} bill(s) delivered`);
        logAgent('route', `${nb} bill(s) delivered to ${done.length} chemist(s)`);
        return `${nb} bill(s) marked delivered.`;
      },
    });
  }
  function routeWa(cid) {
    const ch = chem(cid), bs = dispState?.D.byChem[cid] || []; if (!ch) return;
    const due = Math.max(0, chemOutstanding(cid));
    openWa(ch.phone, fillTpl(agentCfg('route').template, { party: ch.owner || ch.name, firm: db.settings.firm.name, bills: bs.map(s => `${s.no} (₹${dec(s.total)})`).join(', '), due: due > 0 ? `Kul baaki: ₹${dec(due)}. ${upiText(due)}\n` : '' }));
    logAgent('route', `Delivery message → ${ch.name} (WhatsApp)`);
  }
  ACTIONS['route-plan'] = () => dispatchModal(TODAY.getDay(), '');

  // ----- Hospital & Doctor Outreach -----
  const DEFAULT_DOC_INTRO = 'Namaste Dr. {doctor},\n{firm}, {place} se. Hamare paas ab ye products uplabdh hain:\n{lines}\nAapke area ke chemists ko hum supply karte hain. Jaankari ya visit ke liye bataiye.';
  const SPEC_HINTS = [
    [/DIAB|INSULIN|METFORMIN|GLIMEPIRIDE|GLICLAZIDE|SITAGLIPTIN|VILDAGLIPTIN|TENELIGLIPTIN|DAPAGLIFLOZIN|EMPAGLIFLOZIN|VOGLIBOSE/, ['Endocrinology / Diabetes', 'General Medicine']],
    [/CARDI|TELMISARTAN|AMLODIPINE|ATORVASTATIN|ROSUVASTATIN|METOPROLOL|CLOPIDOGREL|NICORANDIL|ISOSORBIDE|TORSEMIDE|RAMIPRIL|OLMESARTAN|BISOPROLOL/, ['Cardiology', 'General Medicine']],
    [/DERMA|COSMETIC|SKIN|MOISTUR|ACNE|KETOCONAZOLE|LULICONAZOLE|TERBINAFINE|ITRACONAZOLE|SUNSCREEN|EMOLLIENT|LOTION/, ['Dermatology']],
    [/ORTHO|CALCI|CHOLECALCIFEROL|VITAMIN D|ACECLOFENAC|DICLOFENAC|ETORICOXIB|GLUCOSAMINE|THIOCOLCHICOSIDE/, ['Orthopaedics']],
    [/PAED|PEDIA|BABY|DROPS/, ['Paediatrics']],
    [/GYNA|OBST|FOLIC|FERROUS|IRON|PROGESTERONE|DYDROGESTERONE|LETROZOLE|PREGNAN|TRANEXAMIC/, ['Obstetrics & Gynaecology']],
    [/GASTRO|PANTOPRAZOLE|RABEPRAZOLE|OMEPRAZOLE|ESOMEPRAZOLE|DOMPERIDONE|ITOPRIDE|LACTULOSE|URSODEOXYCHOLIC|LIVER/, ['Gastroenterology', 'General Medicine']],
    [/RESPIR|ASTHMA|MONTELUKAST|LEVOCETIRIZINE|SALBUTAMOL|BUDESONIDE|FORMOTEROL|DOXOFYLLINE|COUGH/, ['Pulmonology / Chest', 'ENT', 'General Medicine']],
    [/NEURO|PREGABALIN|GABAPENTIN|LEVETIRACETAM|VALPROATE|METHYLCOBALAMIN|DULOXETINE/, ['Neurology', 'General Medicine']],
    [/PSYCH|ESCITALOPRAM|SERTRALINE|CLONAZEPAM|ALPRAZOLAM|OLANZAPINE|QUETIAPINE|FLUOXETINE/, ['Psychiatry']],
    [/OPHTH|\bEYE\b/, ['Ophthalmology']],
    [/DENTAL|TOOTH|\bGUM\b/, ['Dental']],
    [/TAMSULOSIN|SILODOSIN|FINASTERIDE|DUTASTERIDE|UROLOG/, ['Urology']],
    [/AYUR|HERBAL/, ['Ayurveda']],
  ];
  function productSpecs(p) {
    const s = norm([category(p.categoryId)?.name, p.name, p.salt, p.form].join(' '));
    const out = new Set(); SPEC_HINTS.forEach(([re, sp]) => { if (re.test(s)) sp.forEach(x => out.add(x)); });
    if (!out.size) ['General Medicine', 'Medical Officer (General)'].forEach(x => out.add(x));
    return [...out];
  }
  function outreachPlan(c) {
    const since = addDays(todayIso, -c.days), first = {};
    purchaseLines().forEach(l => { if (!first[l.productId] || l.date < first[l.productId]) first[l.productId] = l.date; });
    const newP = db.products.filter(p => first[p.id] && first[p.id] >= since && sellableQty(p.id) > 0);
    const dists = new Set([db.settings.firm.district, ...db.chemists.filter(x => x.status === 'Active').map(x => x.district)].filter(Boolean));
    const last = {}; (db.visits || []).forEach(v => { if (!last[v.doctorId] || v.date > last[v.doctorId]) last[v.doctorId] = v.date; });
    const plan = (db.doctors || []).filter(d => (!d.district || dists.has(d.district)) && (!last[d.id] || daysFrom(last[d.id]) < -c.gapDays))
      .map(d => ({ did: d.id, pids: newP.filter(p => productSpecs(p).includes(d.specialization)).map(p => p.id), last: last[d.id] || '' }))
      .filter(x => x.pids.length || c.routine)
      .sort((a, b) => b.pids.length - a.pids.length || (a.last || '').localeCompare(b.last || '') || hospRank(hospById(docById(a.did)?.hospitalId)?.type) - hospRank(hospById(docById(b.did)?.hospitalId)?.type))
      .slice(0, c.maxPerRun);
    return { plan, newP, dists };
  }
  function runOutreachAgent(auto) {
    const c = agentCfg('outreach');
    if (auto && TODAY.getDay() !== +c.weekday) return { made: 0, summary: `Runs on ${DAYS_EN[+c.weekday] || 'the set day'}s` };
    const keep = new Set(); let made = 0; const add = (item, days) => { made += p4Add('outreach', keep, item, days); };
    const { plan, newP, dists } = outreachPlan(c);
    if (!(db.doctors || []).length) add({ key: 'out:nodoc', kind: 'info', title: 'Add doctors to get weekly visit plans', detail: ['Doctors Directory → Add doctor or Import CSV. The agent then plans visits to doctors whose speciality fits your new products.'], payload: { go: 'doctors' } }, 60);
    else if (plan.length) add({ key: 'out:plan:' + weekKey(), kind: 'visit', title: `Visit plan — ${plan.length} doctor(s)${newP.length ? `, ${newP.length} new product(s) to introduce` : ''}`, detail: plan.slice(0, 4).map(x => { const d = docById(x.did); return `Dr. ${d.name} · ${d.specialization || '—'} · ${hospitalName(d) || '—'}${x.pids.length ? ` · ${x.pids.length} product(s)` : ''}`; }), payload: { plan } });
    const cap = hospRank('CHC'), act = db.chemists.filter(x => x.status === 'Active');
    const gaps = (db.hospitals || []).filter(h => dists.has(h.district) && hospRank(h.type) <= cap && !act.some(x => x.hospitalId === h.id || (h.tehsil && x.district === h.district && norm(x.tehsil) === norm(h.tehsil)))).sort(hospSort);
    if (gaps.length) add({ key: 'out:gaps', kind: 'info', title: `${gaps.length} hospital(s) in your districts have no chemist of yours nearby`, detail: [...gaps.slice(0, 5).map(h => `${h.name} · ${h.type} · ${[h.tehsil, h.district].filter(Boolean).join(', ')}`), 'Chemists near these hospitals are new customers to look for.'], payload: { go: 'hospitals' } }, 30);
    closeStale('outreach', keep);
    return { made, summary: `${plan.length} doctor visit(s) planned · ${gaps.length} hospital(s) without a nearby chemist` };
  }
  let visitState = null;
  function visitModal(a) {
    const plan = (a.payload.plan || []).filter(x => docById(x.did)); visitState = { a, plan };
    openModal({
      title: 'Doctor visit plan', size: 'xl', submitLabel: 'Save ticked as visited',
      extraFoot: printFoot('a4l'),
      body: `<div class="paper-wrap"><div class="paper paper-a4l"><div class="bill">
          ${paperHead('DOCTOR VISIT PLAN', `<div class="strong">Week of ${fmtDate(todayIso)}</div><div>${plan.length} doctor(s)</div>`)}
          <table class="ledger-table"><thead><tr><th>#</th><th>Doctor</th><th>Hospital</th><th>Mobile</th><th>Products to introduce</th><th>Last visit</th><th>Remarks</th><th class="no-print">Visited</th></tr></thead>
          <tbody>${plan.map((x, i) => { const d = docById(x.did); return `<tr><td>${i + 1}</td><td><b>Dr. ${esc(d.name)}</b><div class="small">${esc([d.designation, d.specialization].filter(Boolean).join(' · '))}</div></td><td>${esc(hospitalName(d) || '—')}<div class="small">${esc(d.district || '')}</div></td><td>${esc(d.mobile || '')}</td><td>${x.pids.map(pid => esc(prod(pid)?.name || '')).join(', ') || '<span class="muted">Routine visit</span>'}</td><td>${x.last ? fmtDate(x.last) : 'Never'}</td><td style="min-width:120px"></td><td class="no-print"><label class="check-line"><input type="checkbox" name="v_${i}"> Done</label>${d.mobile ? `<button type="button" class="btn sm ghost" data-p4="visit-wa" data-id="${i}">${icon('chat')}</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">No doctors to visit.</td></tr>'}</tbody></table>
        </div></div></div>
        <div class="small muted">Only tell doctors which products are available — no gifts or claims (UCPMP rules).</div>`,
      onSubmit: v => {
        const done = plan.filter((x, i) => v['v_' + i]);
        done.forEach(x => db.visits.push({ id: uid(), doctorId: x.did, date: todayIso, products: x.pids }));
        if (done.length) logAgent('outreach', `${done.length} doctor visit(s) recorded`);
        if (done.length && done.length === plan.length) doneApproval(a.id, `${done.length} visited`);
        return done.length ? `${done.length} visit(s) saved.` : 'Nothing ticked — the plan is kept.';
      },
    });
  }
  function visitWa(i) {
    const x = visitState?.plan[+i], d = x && docById(x.did); if (!d) return;
    const f = db.settings.firm;
    openWa(d.mobile, fillTpl(agentCfg('outreach').template, { doctor: d.name, firm: f.name, place: f.locality || f.tehsil || f.district || '', lines: x.pids.map(pid => `• ${prod(pid)?.name}`).join('\n') || '• (our full range)' }));
    logAgent('outreach', `Intro message → Dr. ${d.name} (WhatsApp)`);
  }

  // ----- Register the Phase 4 agents -----
  Object.assign(AGENT_DEFS, {
    recall: { name: 'Recall & NSQ Watch', icon: 'alert', auto: true, desc: 'Checks CDSCO NSQ / spurious drug alerts, banned FDC lists and company recalls against your batches and the bills that sold them: block the batch, tell the chemists who bought it and return it to the supplier.', defaults: { enabled: true, auto: true, time: '09:05', remindDay: 25, template: DEFAULT_RECALL_MSG } },
    ceiling: { name: 'Price Ceiling (NPPA)', icon: 'rupee', auto: true, desc: 'Every day: stock whose MRP is above the NPPA ceiling price (+ GST) of scheduled (DPCO) medicines, and scheduled products without a ceiling price. Warns in Bill Entry too. Import NPPA notifications with AI.', defaults: { enabled: true, auto: true, time: '09:15' } },
    h1: { name: 'Schedule H1 / NDPS Register', icon: 'book', auto: true, desc: 'Keeps the sale register of Schedule H1, X and NDPS drugs (print / CSV), flags these drugs sold to chemists without a valid licence or to customers without prescription details, and unusual quantities to one chemist.', defaults: { enabled: true, auto: true, time: '09:25', days: 30, minQty: 20, spikeX: 3, watchH1: true, remindUnset: true, printDay: 1 } },
    credit: { name: 'Chemist Credit Risk', icon: 'rupee', auto: true, desc: 'Scores every chemist (A–D) on how fast they pay, overdue amount and limit use. Suggests raising or lowering credit limits, asks before billing over the limit, and lists chemists who are buying less (win-back).', defaults: { enabled: true, auto: true, time: '10:05', blockOverLimit: true, raiseAt: 80, stepPct: 25, reviewDays: 30, winbackMin: 5000, dropPct: 50, winbackDays: 30, template: DEFAULT_WINBACK } },
    schemes: { name: 'Schemes & Claims', icon: 'spark', auto: true, desc: 'Tracks company schemes: warns before a scheme ends, checks purchase bills for the free goods or discount promised, and works out claims on your sales for the company to pay back.', defaults: { enabled: true, auto: true, time: '09:35', warnDays: 7, followDays: 45 } },
    route: { name: 'Route & Delivery', icon: 'truck', auto: true, desc: 'Every morning: today’s dispatch list by route (district / tehsil) with a printable loading sheet, “delivery today” WhatsApp messages, and bills not yet delivered.', defaults: { enabled: true, auto: true, time: '08:15', routes: '', lateDays: 3, template: DEFAULT_DELIVERY } },
    outreach: { name: 'Hospital & Doctor Outreach', icon: 'doctor', auto: true, desc: 'Each week: a doctor visit plan (doctors whose speciality fits your new products, from the Doctors Directory) and hospitals in your districts with none of your chemists nearby.', defaults: { enabled: true, auto: true, time: '11:30', weekday: 3, days: 30, gapDays: 30, maxPerRun: 10, routine: true, template: DEFAULT_DOC_INTRO } },
  });
  { const b = AGENT_DEFS.briefing; delete AGENT_DEFS.briefing; AGENT_DEFS.briefing = b; }
  Object.assign(AGENT_FIELDS, {
    recall: [{ k: 'remindDay', label: 'Remind to add the monthly CDSCO list from day (1–28)', type: 'number' }, { k: 'template', label: 'Message to parties — {party} {product} {batch} {reason} {firm}', type: 'textarea' }],
    ceiling: [],
    h1: [{ k: 'days', label: 'Check bills of the last (days)', type: 'number' }, { k: 'minQty', label: 'Unusual quantity: at least this many units in 30 days', type: 'number' }, { k: 'spikeX', label: '…and at least this many times the usual monthly quantity', type: 'number' }, { k: 'watchH1', label: 'Also watch Schedule H1 quantities (X and NDPS are always watched)', type: 'check' }, { k: 'remindUnset', label: 'Remind me about products with no schedule set', type: 'check' }, { k: 'printDay', label: 'Remind to print last month’s register from day (1–28)', type: 'number' }],
    credit: [{ k: 'blockOverLimit', label: 'Ask before a bill takes a chemist over the credit limit', type: 'check' }, { k: 'raiseAt', label: 'Suggest a higher limit for A-score chemists using at least (%) of it', type: 'number' }, { k: 'stepPct', label: 'Change limits by (%)', type: 'number' }, { k: 'reviewDays', label: 'Do not suggest a limit change again within (days)', type: 'number' }, { k: 'winbackMin', label: 'Win-back: only chemists who usually buy at least (₹ a month)', type: 'number' }, { k: 'dropPct', label: 'Win-back when this month is down by at least (%)', type: 'number' }, { k: 'winbackDays', label: 'Do not suggest the same chemist again within (days)', type: 'number' }, { k: 'template', label: 'Win-back message — {party} {firm}', type: 'textarea' }],
    schemes: [{ k: 'warnDays', label: 'Warn this many days before a scheme ends', type: 'number' }, { k: 'followDays', label: 'Remind about claims not received after (days)', type: 'number' }],
    route: [{ k: 'routes', label: 'Routes — one line per day, e.g. “Monday: Ghumarwin, Jhandutta” (tehsil, sub-tehsil, village or district names)', type: 'textarea' }, { k: 'lateDays', label: 'Warn about bills not delivered after (days)', type: 'number' }, { k: 'template', label: 'Delivery message — {party} {bills} {due} {firm}', type: 'textarea' }],
    outreach: [{ k: 'weekday', label: 'Day of the week (0 = Sunday … 6 = Saturday)', type: 'number' }, { k: 'days', label: 'New products: first bought in the last (days)', type: 'number' }, { k: 'gapDays', label: 'Plan a doctor again after (days)', type: 'number' }, { k: 'maxPerRun', label: 'Doctors per weekly plan', type: 'number' }, { k: 'routine', label: 'Also plan routine visits when there is no new product for a doctor', type: 'check' }, { k: 'template', label: 'Intro message — {doctor} {firm} {place} {lines}', type: 'textarea' }],
  });
  Object.assign(AGENT_RUN, { recall: runRecallAgent, ceiling: runCeilingAgent, h1: runRegisterAgent, credit: runCreditAgent, schemes: runSchemesAgent, route: runRouteAgent, outreach: runOutreachAgent });
  Object.assign(APPR_LABEL, { recall: 'Handle alert', creditlimit: 'Review limit', winback: 'Send message', schemeclaim: 'Prepare claim', dispatch: 'Dispatch list', visit: 'Visit plan' });
  Object.assign(APPR_HANDLERS, {
    recall: a => recallModal(a),
    creditlimit: a => {
      const ch = chem(a.payload.cid); if (!ch) { doneApproval(a.id, 'Chemist removed'); refresh(); return; }
      const pr = creditProfile(ch.id);
      openModal({
        title: `Credit limit — ${ch.name}`, size: 'sm', submitLabel: 'Save new limit',
        body: `${detailGrid([['Score', `${gradePill(pr)} ${pr.score ?? ''}`], ['Outstanding', money(pr.out)], ['Current limit', money(ch.creditLimit)], ['Pays in', `${pr.avgPay} days`]])}
          <div class="small">${esc(pr.why.join(' · '))}</div>
          <div class="form-grid">${field('New credit limit (₹)', 'limit', { type: 'number', value: a.payload.limit, required: true, full: true, attrs: numAttrs('1') })}</div>`,
        onSubmit: v => { const old = ch.creditLimit; ch.creditLimit = Math.round(num(v.limit)); doneApproval(a.id, `Limit ${money(old)} → ${money(ch.creditLimit)}`); logAgent('credit', `${ch.name}: credit limit ${money(old)} → ${money(ch.creditLimit)}`); return `${ch.name}’s credit limit is now ${money(ch.creditLimit)}.`; },
      });
    },
    winback: a => { const ch = chem(a.payload.cid); if (!ch) return; openSendDialog({ agent: 'credit', approvalId: a.id, title: `Win back — ${ch.name}`, name: ch.name, phone: ch.phone, email: ch.email, subject: `${db.settings.firm.name}`, text: fillTpl(agentCfg('credit').template, { party: ch.owner || ch.name, firm: db.settings.firm.name }) }); },
    schemeclaim: a => claimModal(a.payload.sid, a.id),
    dispatch: a => dispatchModal(a.payload.day ?? TODAY.getDay(), a.id),
    visit: a => visitModal(a),
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-p4]'); if (!b) return;
    const id = b.dataset.id;
    ({ 'rc-read': readRecallFile, 'rc-block': () => toggleBlock(id), 'rc-wa': () => recallWa(id), 'rc-return': recallReturn, 'reg-csv': registerCsv, 'ceil-read': readCeilingFile, 'ceil-csv': ceilingFromCsv, 'claim-csv': claimCsv, 'route-wa': () => routeWa(id), 'visit-wa': () => visitWa(id) })[b.dataset.p4]?.();
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'regMonth' || e.target.id === 'regSch') { regState = { month: $('#regMonth').value || regState.month, sch: $('#regSch').value }; registerModal(); }
    if (e.target.id === 'dispDay') dispatchModal(+e.target.value, dispState?.approvalId || '');
  });

  // =====================================================================
  // Phase 5 agents: GSTR-2B / ITC match, Payment Planner, e-Invoice & e-Way Bill,
  // Near-Expiry Clearance, Cold Chain Watch, Supplier Performance, Audit & Anomaly
  // =====================================================================
  const stateOf = g => /^\d{2}/.test(String(g || '')) ? String(g).slice(0, 2) : '';
  const firmState = () => stateOf(db.settings.firm.gstin) || '02';
  const ddmmyyyy = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '';
  const isCold = p => !!p && (p.cold === true || p.cold === '1');
  const prevMonth = () => iso(new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1)).slice(0, 7);
  const monthName = m => new Date(m + '-01T00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const cleanNum = v => num(String(v ?? '').replace(/[,₹\s]/g, ''));
  const dayDiff = (a, b) => Math.round((parse(a) - parse(b)) / DAY);
  const fmtD = s => s ? fmtDate(s) : '—';
  // Record of changes to bills, for the Audit agent
  function auditNote(what, ref, extra = {}) {
    if (!Array.isArray(db.auditLog)) db.auditLog = [];
    db.auditLog.unshift({ at: new Date().toISOString(), date: todayIso, what, ref, by: (db.settings.profile || {}).name || '', ...extra });
    if (db.auditLog.length > 500) db.auditLog.length = 500;
  }

  // ----- GSTR-2B reconciliation (input tax credit) -----
  // GSTR-2B JSON from the GST portal (data.docdata.b2b[].inv[]); also reads the older 2A layout (itms[].itm_det)
  function parse2bJson(obj) {
    const data = obj?.data || obj;
    const d = data?.docdata || data;
    const rows = [];
    (d?.b2b || []).forEach(s => (s.inv || []).forEach(v => {
      const items = v.items || v.itms || [];
      const sum = (...ks) => round2(items.reduce((a, i) => a + ks.reduce((x, k) => x || num(i[k] ?? i.itm_det?.[k]), 0), 0));
      rows.push({ gstin: String(s.ctin || '').toUpperCase(), name: s.trdnm || '', invNo: String(v.inum || ''), date: parseAnyDate(v.dt || v.idt || ''), taxable: sum('txval'), igst: sum('igst', 'iamt'), cgst: sum('cgst', 'camt'), sgst: sum('sgst', 'samt'), total: num(v.val), itc: (v.itcavl || 'Y') !== 'N', rev: v.rev === 'Y' });
    }));
    const rp = String(data?.rtnprd || obj?.rtnprd || obj?.fp || '');
    return { rows, period: /^\d{6}$/.test(rp) ? `${rp.slice(2)}-${rp.slice(0, 2)}` : '' };
  }
  // CSV saved from the B2B sheet of the GSTR-2B Excel (the header is two rows there)
  function parse2bCsv(text) {
    const rows = parseCsv(text.replace(/^﻿/, ''));
    const hi = rows.findIndex(r => r.some(c => /gstin/i.test(c)));
    if (hi < 0) throw new Error('No “GSTIN of supplier” column found. Open the GSTR-2B Excel, go to the B2B sheet and save it as CSV.');
    const h = rows[hi].map((c, i) => `${c} ${rows[hi + 1]?.[i] || ''}`.toLowerCase());
    const col = (...res) => { for (const re of res) { const i = h.findIndex(c => re.test(c)); if (i >= 0) return i; } return -1; };
    const iG = col(/gstin/), iN = col(/trade|legal|name/), iI = col(/invoice\s*(number|no)/, /inv.*no/), iD = col(/invoice\s*date/, /\bdate\b/), iV = col(/invoice\s*value/, /value/), iT = col(/taxable/), iIg = col(/integrated/), iC = col(/central/), iS = col(/state\s*\/\s*ut|state.*tax|ut tax/), iA = col(/itc\s*avail/);
    if (iI < 0) throw new Error('No “Invoice number” column found in the CSV.');
    const cell = (r, i) => i >= 0 ? String(r[i] ?? '').trim() : '';
    return rows.filter(r => /^\d{2}[A-Z0-9]{13}$/i.test(cell(r, iG))).map(r => ({ gstin: cell(r, iG).toUpperCase(), name: cell(r, iN), invNo: cell(r, iI), date: parseAnyDate(cell(r, iD)), taxable: cleanNum(cell(r, iT)), igst: cleanNum(cell(r, iIg)), cgst: cleanNum(cell(r, iC)), sgst: cleanNum(cell(r, iS)), total: cleanNum(cell(r, iV)), itc: !/^no/i.test(cell(r, iA)), rev: false }));
  }
  const invKey = s => bkey(s).replace(/^0+/, '');
  // Every GSTR-2B invoice matched to a purchase bill, plus our bills of the imported months that are not in 2B
  function itcRows() {
    const bills = db.pinvoices.map(p => { const s = sup(p.supplierId); return { p, s, gstin: String(s?.gstin || '').toUpperCase(), key: invKey(p.supplierInvNo), taxable: round2(p.taxable), tax: round2(p.gst ?? (p.total - p.taxable)) }; }).filter(x => x.gstin);
    const used = new Set(), out = [];
    (db.gstr2b || []).forEach(imp => imp.rows.forEach(r => {
      const tax = round2(r.igst + r.cgst + r.sgst);
      let b = bills.find(x => !used.has(x.p.no) && x.gstin === r.gstin && x.key && x.key === invKey(r.invNo));
      if (!b) b = bills.find(x => !used.has(x.p.no) && x.gstin === r.gstin && Math.abs(x.p.total - r.total) <= 1 && r.date && Math.abs(dayDiff(x.p.date, r.date)) <= 3);
      if (!b) { out.push({ status: 'Not in books', r, tax, period: imp.period }); return; }
      used.add(b.p.no);
      const diff = round2(Math.max(Math.abs(b.taxable - r.taxable), Math.abs(b.tax - tax)));
      out.push({ status: diff > 1 ? 'Mismatch' : 'Matched', r, tax, b, diff, period: imp.period });
    }));
    const periods = new Set((db.gstr2b || []).map(x => x.period));
    bills.filter(x => periods.has(x.p.date.slice(0, 7)) && !used.has(x.p.no)).forEach(b => out.push({ status: 'Not in 2B', b, tax: b.tax, period: b.p.date.slice(0, 7) }));
    return out;
  }
  ACTIONS['gstr2b-import'] = () => openModal({
    title: 'Import GSTR-2B', size: 'lg', submitLabel: 'Import and match',
    body: `<div class="form-grid">
        ${field('Return period (month)', 'period', { type: 'month', value: prevMonth(), required: true })}
        <div class="field"><label for="g2File">GSTR-2B file — JSON, or CSV *</label><input type="file" id="g2File" accept=".json,.csv,application/json,text/csv"></div>
      </div>
      <div class="small muted">On the GST portal: Returns Dashboard → choose the month → GSTR-2B → Download → “Generate JSON file to download” (best), or the Excel file — open its B2B sheet and save it as CSV. GSTR-2B for a month is ready on the 14th of the next month. B2B invoices are matched to your purchase bills by the supplier’s GSTIN and invoice number (or amount and date). Credit notes in 2B are not checked yet. The file stays only in your data.</div>`,
    onSubmit: v => {
      const f = $('#g2File')?.files?.[0]; if (!f) { toast('Choose the GSTR-2B file.'); return false; }
      f.text().then(txt => {
        let rows, period = v.period;
        try {
          if (/\.json$/i.test(f.name) || txt.trim().startsWith('{')) { const x = parse2bJson(JSON.parse(txt)); rows = x.rows; if (x.period) period = x.period; }
          else rows = parse2bCsv(txt);
        } catch (err) { toast(err instanceof SyntaxError ? 'The JSON file could not be read — download it again from the GST portal.' : err.message); return; }
        if (!rows.length) { toast('No B2B invoices found in the file.'); return; }
        db.gstr2b = (db.gstr2b || []).filter(x => x.period !== period);
        db.gstr2b.unshift({ id: uid(), period, created: todayIso, file: f.name, rows });
        db.gstr2b.sort((a, b) => b.period.localeCompare(a.period));
        logAgent('gstr2b', `GSTR-2B ${period} imported: ${rows.length} invoice(s)`);
        closeModal(false); runAgent('gstr2b', false);
        if (location.hash !== '#itc') location.hash = 'itc'; refresh();
        toast(`${rows.length} invoice(s) from GSTR-2B ${monthName(period)} imported. ${agentCfg('gstr2b').lastResult}.`);
      }).catch(() => toast('The file could not be opened.'));
      return false;
    },
  });
  ACTIONS['gstr2b-del'] = id => { const x = (db.gstr2b || []).find(g => g.id === id); if (!x) return; confirmModal(`Remove GSTR-2B ${monthName(x.period)}?`, `${x.rows.length} invoice(s) from ${esc(x.file || 'the file')}. You can import it again.`, 'Remove', () => { db.gstr2b = db.gstr2b.filter(g => g !== x); runAgent('gstr2b', false); return 'GSTR-2B removed.'; }); };
  ACTIONS['itc-hold'] = sid => { const s = sup(sid); if (!s) return; s.itcHold = !s.itcHold; logAgent('manual', `${s.name}: payment ${s.itcHold ? 'put on hold (GSTR-2B)' : 'hold removed'}`); refresh(); toast(`${s.name}: payment ${s.itcHold ? 'on hold until their bills appear in GSTR-2B' : 'hold removed'}.`); };
  VIEWS.itc = () => {
    const imps = db.gstr2b || [], rows = itcRows();
    const by = st => rows.filter(x => x.status === st);
    const itcIn2b = rows.filter(x => x.r && x.r.itc !== false).reduce((a, x) => a + x.tax, 0);
    return `
      <div class="grid g-4">
        ${kpi('ITC in GSTR-2B', compact(itcIn2b), imps.length ? `${imps.length} month(s) · latest ${monthName(imps[0].period)}` : 'Import a GSTR-2B to start')}
        ${kpi('Matched bills', qty(by('Matched').length), `${by('Mismatch').length} with a difference`)}
        ${kpi('ITC at risk', compact(by('Not in 2B').reduce((a, x) => a + x.tax, 0)), `${by('Not in 2B').length} of your bills not filed by suppliers`)}
        ${kpi('In 2B, not in your books', qty(by('Not in books').length), 'Enter the bill, or check with the supplier')}
      </div>
      ${useList({
        key: 'itc', title: 'Purchase bills vs GSTR-2B',
        actions: actBtn('gstr2b-import', '', icon('upload') + 'Import GSTR-2B', 'primary'),
        tabs: [{ id: 'all', label: 'All' }, ...['Not in 2B', 'Mismatch', 'Not in books', 'Matched'].map(s => ({ id: s, label: s, filter: x => x.status === s }))],
        filters: [{ k: 'period', label: 'Month', options: [...new Set(rows.map(x => x.period))].sort().reverse().map(m => [m, monthName(m)]), test: (x, v) => x.period === v }],
        rows: () => rows.sort((a, b) => ['Not in 2B', 'Mismatch', 'Not in books', 'Matched'].indexOf(a.status) - ['Not in 2B', 'Mismatch', 'Not in books', 'Matched'].indexOf(b.status)),
        text: x => [x.status, x.r?.gstin, x.r?.name, x.r?.invNo, x.b?.p.no, x.b?.p.supplierInvNo, x.b?.s?.name].join(' '),
        empty: 'Import the GSTR-2B of a month to match it with your purchase bills.',
        columns: [
          { h: 'Status', c: x => pill(x.status) },
          { h: 'Supplier', c: x => `<span class="strong">${esc(x.b?.s?.name || x.r?.name || '')}</span><div class="small muted">${esc(x.b?.gstin || x.r?.gstin || '')}${x.b?.s?.itcHold ? ' · ' + pill('On hold') : ''}</div>` },
          { h: 'Invoice', c: x => `${esc(x.r?.invNo || x.b?.p.supplierInvNo || '')}<div class="small muted">${fmtD(x.r?.date || x.b?.p.date)}</div>` },
          { h: 'Our bill', c: x => x.b ? `<a href="#" data-act="view-pi" data-id="${esc(x.b.p.no)}" class="strong">${esc(x.b.p.no)}</a>` : '—' },
          { h: 'Taxable ours / 2B', r: 1, c: x => `${x.b ? dec(x.b.taxable) : '—'}<div class="small muted">${x.r ? dec(x.r.taxable) : '—'}</div>` },
          { h: 'Tax ours / 2B', r: 1, c: x => `${x.b ? dec(x.b.tax) : '—'}<div class="small muted">${x.r ? dec(x.tax) : '—'}</div>` },
          { h: '', c: x => x.status === 'Not in 2B' && x.b?.s ? actBtn('itc-hold', x.b.s.id, x.b.s.itcHold ? 'Release hold' : 'Hold payment', 'ghost') : '' },
        ],
      })}
      ${useList({
        key: 'gstr2b', title: 'Imported GSTR-2B', noSearch: true, rows: () => imps, text: x => x.period,
        empty: 'Nothing imported yet.',
        columns: [
          { h: 'Month', c: x => `<span class="strong">${monthName(x.period)}</span>` },
          { h: 'File', c: x => `<span class="small">${esc(x.file || '')}</span>` },
          { h: 'Invoices', r: 1, c: x => qty(x.rows.length) },
          { h: 'Imported', c: x => fmtD(x.created) },
          { h: '', c: x => actBtn('gstr2b-del', x.id, 'Remove', 'ghost danger') },
        ],
      })}`;
  };
  function runItcAgent() {
    const c = agentCfg('gstr2b'); const keep = new Set(); let made = 0;
    const add = (it, days) => { made += p4Add('gstr2b', keep, it, days); };
    const pm = prevMonth();
    if (TODAY.getDate() >= c.remindDay && !(db.gstr2b || []).some(x => x.period === pm)) add({ key: 'itc:import:' + pm, kind: 'info', title: `Import GSTR-2B for ${monthName(pm)}`, detail: ['GST portal → Returns Dashboard → GSTR-2B → Download (JSON, or the Excel B2B sheet saved as CSV). It is ready on the 14th.', 'The agent then checks every purchase bill against what your suppliers filed.'], payload: { act: ['gstr2b-import', ''] } }, 20);
    const rows = itcRows();
    const miss = rows.filter(x => x.status === 'Not in 2B'), bySup = {};
    miss.forEach(x => { (bySup[x.b.p.supplierId] = bySup[x.b.p.supplierId] || []).push(x); });
    Object.entries(bySup).forEach(([sid, xs]) => {
      const s = sup(sid), tax = round2(xs.reduce((a, x) => a + x.tax, 0)); if (tax < c.minTax) return;
      add({ key: 'itc:miss:' + sid, kind: 'itchold', title: `${s?.name || sid} has not filed ${xs.length} bill(s) — ${money(tax)} ITC at risk`, detail: [xs.slice(0, 5).map(x => `${x.b.p.supplierInvNo || x.b.p.no} (${fmtD(x.b.p.date)})`).join(', '), s?.itcHold ? 'Payment is on hold.' : 'Ask them to file GSTR-1, and hold their payment until the bills show in your GSTR-2B.'], payload: { sid } }, 7);
    });
    const mis = rows.filter(x => x.status === 'Mismatch');
    if (mis.length) add({ key: 'itc:mismatch', kind: 'info', title: `${mis.length} bill(s) differ from GSTR-2B`, detail: mis.slice(0, 4).map(x => `${x.b.p.no} · ${x.b.s?.name || ''}: our tax ₹${dec(x.b.tax)}, 2B ₹${dec(x.tax)}`).concat('Check the bill entry, or ask the supplier to amend their return.'), payload: { go: 'itc' } }, 7);
    const nib = rows.filter(x => x.status === 'Not in books');
    if (nib.length) add({ key: 'itc:books', kind: 'info', title: `${nib.length} invoice(s) in GSTR-2B are not in your purchase bills`, detail: [...nib.slice(0, 4).map(x => `${x.r.name || x.r.gstin} · ${x.r.invNo} · ${fmtD(x.r.date)} · ₹${dec(x.r.total)}`), 'Enter the bill if you received the goods; if not, ask the supplier — your GSTIN may have been used by mistake.'], payload: { go: 'itc' } }, 7);
    db.suppliers.forEach(s => { if (s.itcHold && !bySup[s.id]) { s.itcHold = false; logAgent('gstr2b', `${s.name}: all bills now in GSTR-2B — payment hold removed`); } });
    closeStale('gstr2b', keep);
    return { made, summary: (db.gstr2b || []).length ? `${rows.filter(x => x.status === 'Matched').length} matched, ${mis.length} differ, ${miss.length} not in 2B, ${nib.length} not in books` : 'No GSTR-2B imported yet' };
  }

  // ----- Payment Planner -----
  function cashPlan(c) {
    const nW = Math.max(1, Math.ceil(c.days / 7)), weeks = [];
    for (let i = 0; i < nW; i++) weeks.push({ from: addDays(todayIso, i * 7), to: addDays(todayIso, i * 7 + 6), inn: 0, out: 0, ins: [], outs: [] });
    const wk = date => { const i = Math.floor(Math.max(0, daysFrom(date)) / 7); return i < nW ? weeks[i] : null; };
    const pays = {};
    db.sales.filter(s => balance(s) > 0.5).forEach(s => {
      let due, sure = 1;
      if (s.party.type === 'chemist') { const ch = chem(s.party.chemistId); const pr = pays[s.party.chemistId] || (pays[s.party.chemistId] = creditProfile(s.party.chemistId)); due = addDays(s.date, Math.max(ch?.terms ?? 30, pr?.avgPay || 0)); }
      else due = addDays(s.date, db.settings.individualTerms || 0);
      if (due < todayIso) sure = c.overduePct / 100;
      const w = wk(due); if (!w) return;
      const amt = round2(balance(s) * sure); w.inn += amt; w.ins.push({ s, amt, due, late: due < todayIso });
    });
    const held = [];
    db.pinvoices.filter(p => balance(p) > 0.5).forEach(p => {
      if (sup(p.supplierId)?.itcHold) { held.push(p); return; }
      const w = wk(p.due || p.date); if (!w) return;
      w.out += balance(p); w.outs.push(p);
    });
    let bal = num(c.cash);
    weeks.forEach(w => { w.inn = round2(w.inn); w.out = round2(w.out); bal = round2(bal + w.inn - w.out); w.bal = bal; });
    return { weeks, held };
  }
  ACTIONS['payplan-view'] = () => {
    const c = agentCfg('payplan'), { weeks, held } = cashPlan(c);
    const payNow = weeks[0].outs.slice().sort((a, b) => (a.due || '').localeCompare(b.due || ''));
    const chase = weeks[0].ins.filter(x => x.late).sort((a, b) => balance(b.s) - balance(a.s)).slice(0, 8);
    openModal({
      title: 'Payment plan', size: 'xl',
      extraFoot: '<div class="foot-left"><button type="button" class="btn" data-act="agent-config" data-id="payplan">Settings</button></div>',
      body: `<div class="small muted">Money in: open sale bills, expected on the chemist’s usual payment day (terms or their average); overdue bills are counted at ${c.overduePct}%. Money out: supplier bills by due date${held.length ? ', except suppliers on hold' : ''}. Starting balance ${money(c.cash)} (set it in Settings).</div>
        ${miniTable([
          { h: 'Week', c: w => `${fmtDate(w.from)} – ${fmtDate(w.to)}` },
          { h: 'Money in', r: 1, c: w => money(w.inn) },
          { h: 'Money out', r: 1, c: w => money(w.out) },
          { h: 'Net', r: 1, c: w => `<span class="${w.inn - w.out < 0 ? 'bad-text' : 'ok-text'}">${money(w.inn - w.out)}</span>` },
          { h: 'Balance', r: 1, c: w => `<span class="strong ${w.bal < 0 ? 'bad-text' : ''}">${money(w.bal)}</span>` },
        ], weeks)}
        <div class="card-title" style="font-size:15px">To pay this week (due or overdue)</div>
        ${miniTable([
          { h: 'Bill', c: p => `<span class="strong">${esc(p.no)}</span><div class="small muted">${esc(p.supplierInvNo || '')}</div>` },
          { h: 'Supplier', c: p => esc(sup(p.supplierId)?.name || '') },
          { h: 'Due', c: p => `<span class="${daysFrom(p.due) < 0 ? 'bad-text' : ''}">${fmtD(p.due)}</span>` },
          { h: 'Balance', r: 1, c: p => money2(balance(p)) },
          { h: '', c: p => actBtn('pay-pi', p.no, 'Record payment', 'ghost') },
        ], payNow)}
        ${held.length ? `<div class="small"><b>On hold (bills not in GSTR-2B):</b> ${held.map(p => `${esc(p.no)} · ${esc(sup(p.supplierId)?.name || '')} · ${money(balance(p))}`).join('; ')}</div>` : ''}
        <div class="card-title" style="font-size:15px">Collect first (overdue)</div>
        ${miniTable([
          { h: 'Bill', c: x => esc(x.s.no) }, { h: 'Party', c: x => esc(partyName(x.s)) }, { h: 'Bill date', c: x => fmtD(x.s.date) }, { h: 'Balance', r: 1, c: x => money2(balance(x.s)) },
        ], chase)}`,
    });
  };
  function runPayplanAgent() {
    const c = agentCfg('payplan'); const keep = new Set(); let made = 0;
    const add = (it, days) => { made += p4Add('payplan', keep, it, days); };
    const { weeks, held } = cashPlan(c);
    const due = weeks[0].outs;
    if (due.length) add({ key: 'pay:' + weekKey(), kind: 'paylist', title: `Supplier payments due this week — ${money(weeks[0].out)} (${due.length} bill${due.length === 1 ? '' : 's'})`, detail: [...due.slice(0, 4).map(p => `${p.no} · ${sup(p.supplierId)?.name || ''} · ${money(balance(p))} · due ${fmtD(p.due)}`), `Expected in this week: ${money(weeks[0].inn)}${held.length ? ` · ${held.length} bill(s) on hold (GSTR-2B)` : ''}`], payload: {} });
    if (num(c.cash) > 0) {
      const short = weeks.find(w => w.bal < 0);
      if (short) add({ key: 'pay:short:' + short.from, kind: 'info', title: `Cash may run short by ${money(-short.bal)} in the week of ${fmtDate(short.from)}`, detail: [`In ${money(short.inn)} · out ${money(short.out)} that week`, 'Collect overdue bills first, or move some supplier payments — see the payment plan.'], payload: { act: ['payplan-view', ''] } }, 3);
    } else add({ key: 'pay:setcash', kind: 'info', title: 'Set your cash and bank balance for the payment plan', detail: ['Agents → Payment Planner → Settings → “Cash and bank balance today”. Then the agent warns before a week where money may run short.'], payload: { act: ['agent-config', 'payplan'] } }, 30);
    closeStale('payplan', keep);
    return { made, summary: `${money(weeks[0].out)} to pay this week · ${money(weeks[0].inn)} expected in` };
  }

  // ----- e-Invoice & e-Way Bill -----
  const gstDocNeeds = (s, c) => { const n = []; if (s.total >= c.ewayLimit && !s.ewb) n.push('e-Way bill'); if (c.einvoice && s.party.type === 'chemist' && chem(s.party.chemistId)?.gstin && !s.irn) n.push('e-Invoice'); return n; };
  const gstDocBills = c => db.sales.filter(s => s.date >= addDays(todayIso, -c.days) && gstDocNeeds(s, c).length).sort((a, b) => b.date.localeCompare(a.date));
  function ewbJson(sales, veh, km) {
    const f = db.settings.firm, fs = firmState();
    return { version: '1.0.0621', billLists: sales.map(s => {
      const pt = partyOf(s), toG = s.party.type === 'chemist' && pt?.gstin ? pt.gstin.toUpperCase() : 'URP', ts = stateOf(toG) || fs, inter = ts !== fs;
      const itemList = s.lines.map(l => { const c = calcLine(l), p = prod(l.productId); return { productName: p?.name || '', productDesc: p?.name || '', hsnCode: Number(p?.hsn) || 0, quantity: l.qty + (l.free || 0), qtyUnit: 'NOS', taxableAmount: round2(c.taxable), sgstRate: inter ? 0 : num(l.gst) / 2, cgstRate: inter ? 0 : num(l.gst) / 2, igstRate: inter ? num(l.gst) : 0, cessRate: 0, cessNonAdvol: 0 }; });
      const tax = round2(s.gst ?? (s.total - s.taxable));
      return { userGstin: f.gstin, supplyType: 'O', subSupplyType: 1, subSupplyDesc: '', docType: 'INV', docNo: s.no, docDate: ddmmyyyy(s.date), fromGstin: f.gstin, fromTrdName: f.name, fromAddr1: (f.address || f.locality || f.name || '').slice(0, 120), fromAddr2: [f.tehsil, f.district].filter(Boolean).join(', '), fromPlace: f.locality || f.city || f.tehsil || '', fromPincode: Number(f.pincode) || 0, fromStateCode: Number(fs), actFromStateCode: Number(fs),
        toGstin: toG, toTrdName: pt?.name || s.party.name || '', toAddr1: (pt?.address || pt?.locality || '').slice(0, 120), toAddr2: [pt?.tehsil, pt?.district].filter(Boolean).join(', '), toPlace: pt?.locality || pt?.city || pt?.tehsil || '', toPincode: Number(pt?.pincode) || 0, toStateCode: Number(ts), actToStateCode: Number(ts), transactionType: 1,
        totalValue: round2(s.taxable), cgstValue: inter ? 0 : round2(tax / 2), sgstValue: inter ? 0 : round2(tax / 2), igstValue: inter ? tax : 0, cessValue: 0, cessNonAdvolValue: 0, otherValue: round2(s.roundOff || 0), totInvValue: round2(s.total),
        transMode: 1, transDistance: String(Math.round(num(km)) || 0), transporterId: '', transporterName: '', transDocNo: '', transDocDate: '', vehicleNo: String(veh || '').replace(/[\s-]/g, '').toUpperCase(), vehicleType: 'R', itemList };
    }) };
  }
  function einvJson(sales) {
    const f = db.settings.firm, fs = firmState();
    return sales.filter(s => s.party.type === 'chemist').map(s => {
      const pt = chem(s.party.chemistId), ts = stateOf(pt?.gstin) || fs, inter = ts !== fs;
      const ItemList = s.lines.map((l, i) => { const c = calcLine(l), p = prod(l.productId), gr = num(l.gst), tax = c.taxable * gr / 100; return { SlNo: String(i + 1), PrdDesc: p?.name || '', IsServc: 'N', HsnCd: String(p?.hsn || ''), Qty: l.qty, FreeQty: l.free || 0, Unit: 'NOS', UnitPrice: round2(num(l.rate)), TotAmt: round2(c.amount), Discount: round2(c.cdA + c.tdA), AssAmt: round2(c.taxable), GstRt: gr, IgstAmt: inter ? round2(tax) : 0, CgstAmt: inter ? 0 : round2(tax / 2), SgstAmt: inter ? 0 : round2(tax / 2), CesRt: 0, CesAmt: 0, CesNonAdvlAmt: 0, StateCesRt: 0, StateCesAmt: 0, StateCesNonAdvlAmt: 0, OthChrg: 0, TotItemVal: round2(c.taxable + tax) }; });
      const sumK = k => round2(ItemList.reduce((a, x) => a + x[k], 0));
      return { Version: '1.1', TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' }, DocDtls: { Typ: 'INV', No: s.no, Dt: ddmmyyyy(s.date) },
        SellerDtls: { Gstin: f.gstin, LglNm: f.name, Addr1: (addrText(f) || f.name).slice(0, 100), Loc: f.locality || f.tehsil || f.district || 'NA', Pin: Number(f.pincode) || 0, Stcd: fs },
        BuyerDtls: { Gstin: (pt?.gstin || '').toUpperCase(), LglNm: pt?.name || '', Pos: ts, Addr1: (addrText(pt) || pt?.name || '').slice(0, 100), Loc: pt?.locality || pt?.tehsil || pt?.district || 'NA', Pin: Number(pt?.pincode) || 0, Stcd: ts },
        ItemList, ValDtls: { AssVal: sumK('AssAmt'), CgstVal: sumK('CgstAmt'), SgstVal: sumK('SgstAmt'), IgstVal: sumK('IgstAmt'), CesVal: 0, StCesVal: 0, Discount: 0, OthChrg: 0, RndOffAmt: round2(s.total - sumK('TotItemVal')), TotInvVal: round2(s.total) } };
    });
  }
  let gdState = null;
  function gstDocsModal(approvalId) {
    const c = agentCfg('gstdocs'), bills = gstDocBills(c); gdState = { bills, approvalId };
    openModal({
      title: 'e-Way bills and e-Invoices', size: 'xl', submitLabel: 'Save numbers',
      extraFoot: '<div class="foot-left"><button type="button" class="btn" data-p5="ewb-json">e-Way bill JSON</button>' + (c.einvoice ? '<button type="button" class="btn" data-p5="einv-json">e-Invoice JSON</button>' : '') + '</div>',
      body: `<div class="small muted">An e-way bill is needed when goods worth more than ${money(c.ewayLimit)} are moved${c.einvoice ? '; e-invoices (IRN) for every B2B bill because your turnover crossed the e-invoice limit' : ''}. Tick bills, download the JSON and upload it on ewaybillgst.gov.in (Generate Bulk)${c.einvoice ? ' or einvoice1.gst.gov.in' : ''} — try one bill first. Then type the numbers you got back and save. Distance 0 lets the portal work it out from the PIN codes, so keep the PIN codes of your firm and chemists filled.</div>
        <div class="form-grid g4">${field('Vehicle number', 'veh', { value: c.vehicle || '', attrs: 'placeholder="HP24A1234"' })}${field('Distance (km)', 'km', { type: 'number', value: 0, attrs: numAttrs('1') })}</div>
        ${miniTable([
          { h: '', c: s => `<input type="checkbox" class="cb" name="gd_${esc(s.no)}" checked aria-label="Tick bill">` },
          { h: 'Bill', c: s => `<span class="strong">${esc(s.no)}</span><div class="small muted">${fmtD(s.date)}</div>` },
          { h: 'Party', c: s => `${esc(partyName(s))}<div class="small muted">${esc((partyOf(s)?.gstin) || 'Unregistered')}${partyOf(s)?.pincode ? '' : ' · <span class="bad-text">no PIN</span>'}</div>` },
          { h: 'Amount', r: 1, c: s => money2(s.total) },
          { h: 'Needs', c: s => gstDocNeeds(s, c).map(pill).join(' ') },
          { h: 'e-Way bill no.', c: s => `<input name="ewb_${esc(s.no)}" value="${esc(s.ewb || '')}" style="width:130px" inputmode="numeric">` },
          ...(c.einvoice ? [{ h: 'IRN', c: s => `<input name="irn_${esc(s.no)}" value="${esc(s.irn || '')}" style="width:160px">` }] : []),
        ], bills)}`,
      onSubmit: v => {
        let n = 0;
        bills.forEach(s => { const e = String(v['ewb_' + s.no] || '').trim(), r = String(v['irn_' + s.no] || '').trim(); if (e && e !== s.ewb) { s.ewb = e; n++; } if (r && r !== s.irn) { s.irn = r; n++; } if ((e || r) && v.veh) s.vehicle = v.veh.trim().toUpperCase(); });
        if (v.veh) c.vehicle = v.veh.trim().toUpperCase();
        if (n) logAgent('gstdocs', `${n} e-way bill / IRN number(s) saved`);
        if (approvalId && !gstDocBills(c).length) doneApproval(approvalId, 'All documents made');
        return n ? `${n} number(s) saved.` : 'Nothing changed.';
      },
    });
  }
  function gstDocsDownload(kind) {
    const st = gdState; if (!st) return;
    const pick = st.bills.filter(s => $(`#mform [name="gd_${CSS.escape(s.no)}"]`)?.checked);
    if (!pick.length) { toast('Tick at least one bill.'); return; }
    const f = db.settings.firm;
    if (!f.gstin) { toast('Add your firm’s GSTIN in Settings first.'); return; }
    if (kind === 'ewb') {
      const veh = $('#f-veh')?.value || '', km = $('#f-km')?.value || 0;
      if (!veh.trim()) { toast('Enter the vehicle number (Part B of the e-way bill).'); return; }
      downloadText(`ewaybill-${todayIso}.json`, JSON.stringify(ewbJson(pick, veh, km), null, 1), 'application/json');
      logAgent('gstdocs', `e-Way bill JSON for ${pick.length} bill(s) downloaded`);
    } else {
      const j = einvJson(pick); if (!j.length) { toast('e-Invoices are only for bills to registered chemists.'); return; }
      downloadText(`einvoice-${todayIso}.json`, JSON.stringify(j, null, 1), 'application/json');
      logAgent('gstdocs', `e-Invoice JSON for ${j.length} bill(s) downloaded`);
    }
  }
  ACTIONS['gstdocs-open'] = () => gstDocsModal('');
  function runGstDocsAgent() {
    const c = agentCfg('gstdocs'); const keep = new Set(); let made = 0;
    const bills = gstDocBills(c);
    if (bills.length) made += p4Add('gstdocs', keep, { key: 'gstdocs', kind: 'gstdocs', title: `${bills.length} bill(s) need an e-way bill${c.einvoice ? ' or e-invoice' : ''}`, detail: bills.slice(0, 5).map(s => `${s.no} · ${partyName(s)} · ${money(s.total)} · ${gstDocNeeds(s, c).join(', ')}`), payload: {} });
    closeStale('gstdocs', keep);
    return { made, summary: `${bills.length} bill(s) need documents` };
  }

  // ----- Near-Expiry Clearance -----
  const DEFAULT_CLEAR = 'Namaste {party} ji,\n{firm} — short expiry stock par special rate:\n{lines}\nStock limited hai. Order ke liye reply karein.';
  const clearDisc = (c, d) => d <= 60 ? c.disc60 : d <= 120 ? c.disc120 : c.disc180;
  function clearancePlan(c) {
    const batches = db.batches.filter(b => avail(b) > 0 && !b.blocked && expDays(b.expiry) >= c.minDays && expDays(b.expiry) <= c.maxDays).sort((a, b) => a.expiry.localeCompare(b.expiry));
    const pids = new Set(batches.map(b => b.productId)), since = addDays(todayIso, -c.buyerDays), buyers = {};
    db.sales.filter(s => s.date >= since && s.party.type === 'chemist').forEach(s => s.lines.forEach(l => { if (pids.has(l.productId)) (buyers[s.party.chemistId] = buyers[s.party.chemistId] || new Set()).add(l.productId); }));
    const offered = cid => db.reminders.filter(r => r.key === 'clear:' + cid).map(r => r.date).sort().pop();
    const chems = Object.entries(buyers).map(([cid, set]) => ({ ch: chem(cid), pids: [...set], last: offered(cid) })).filter(x => x.ch && x.ch.status === 'Active').sort((a, b) => b.pids.length - a.pids.length);
    return { batches, chems };
  }
  const offerRate = (c, b) => { const p = prod(b.productId); return round2(num(p?.ptr) * (1 - clearDisc(c, expDays(b.expiry)) / 100)); };
  let clearState = null;
  function clearanceModal(approvalId) {
    const c = agentCfg('clearance'), plan = clearancePlan(c); clearState = { ...plan, approvalId };
    openModal({
      title: 'Near-expiry clearance', size: 'xl', submitLabel: 'Done for now',
      body: `<div class="small muted">Stock expiring in ${c.minDays}–${c.maxDays} days, offered to chemists who bought those items in the last ${c.buyerDays} days. Offer: ${c.disc180}% off up to ${c.maxDays} days, ${c.disc120}% within 120 days, ${c.disc60}% within 60 days (from your sale rate) — give it as CD% on the bill. What does not sell goes to Returns & Expiry Claims.</div>
        ${miniTable([
          { h: 'Item', c: b => `<span class="strong">${esc(prod(b.productId)?.name || '')}</span><div class="small muted">Batch ${esc(b.batch)}</div>` },
          { h: 'Expiry', c: b => `${isoToExp(b.expiry)}<div class="small muted">${expDays(b.expiry)} days</div>` },
          { h: 'Stock', r: 1, c: b => qty(avail(b)) },
          { h: 'At cost', r: 1, c: b => money(batchAmount(b)) },
          { h: 'Offer', r: 1, c: b => `₹${dec(offerRate(c, b))}<div class="small muted">${clearDisc(c, expDays(b.expiry))}% off</div>` },
        ], plan.batches)}
        <div class="card-title" style="font-size:15px">Offer to chemists</div>
        ${miniTable([
          { h: 'Chemist', c: x => `<span class="strong">${esc(x.ch.name)}</span><div class="small muted">${esc(x.ch.phone || 'No mobile')}${x.last ? ` · offered ${fmtD(x.last)}` : ''}</div>` },
          { h: 'Buys', c: x => `<span class="small">${esc(x.pids.map(id => prod(id)?.name).join(', '))}</span>` },
          { h: '', c: x => x.ch.phone ? `<button type="button" class="btn sm ${x.last ? 'ghost' : 'primary'}" data-p5="clr-wa" data-id="${esc(x.ch.id)}">${icon('chat')}WhatsApp offer</button>` : '' },
        ], plan.chems)}`,
      onSubmit: () => { if (approvalId) doneApproval(approvalId, 'Offers sent'); return 'Clearance offers done.'; },
    });
  }
  function clearanceWa(cid) {
    const st = clearState, c = agentCfg('clearance'), x = st?.chems.find(y => y.ch.id === cid); if (!x) return;
    const lines = st.batches.filter(b => x.pids.includes(b.productId)).map(b => `• ${prod(b.productId)?.name} (exp ${isoToExp(b.expiry)}) — ₹${dec(offerRate(c, b))} (${clearDisc(c, expDays(b.expiry))}% off) · ${qty(avail(b))} available`).join('\n');
    openWa(x.ch.phone, fillTpl(c.template, { party: x.ch.owner || x.ch.name, firm: db.settings.firm.name, lines }));
    db.reminders.push({ date: todayIso, key: 'clear:' + cid, channel: 'WhatsApp' });
    logAgent('clearance', `Clearance offer → ${x.ch.name} (WhatsApp)`); save();
    x.last = todayIso;
  }
  ACTIONS['clearance-open'] = () => clearanceModal('');
  function runClearanceAgent() {
    const c = agentCfg('clearance'); const keep = new Set(); let made = 0;
    const { batches, chems } = clearancePlan(c);
    const fresh = chems.filter(x => x.ch.phone && (!x.last || x.last < addDays(todayIso, -c.repeatDays)));
    if (batches.length) made += p4Add('clearance', keep, { key: 'clear:' + weekKey(), kind: 'clearance', title: `${batches.length} near-expiry batch(es) worth ${money(batches.reduce((a, b) => a + batchAmount(b), 0))} to clear — ${fresh.length} chemist(s) to offer`, detail: batches.slice(0, 4).map(b => `${prod(b.productId)?.name} · ${b.batch} · exp ${isoToExp(b.expiry)} · ${qty(avail(b))}`), payload: {} });
    closeStale('clearance', keep);
    return { made, summary: `${batches.length} batch(es) to clear · ${fresh.length} chemist(s) to offer` };
  }

  // ----- Cold Chain Watch -----
  const COLD_HINT = /INSULIN|SULIN|VACCIN|\bPEN\b|GLARGINE|ASPART|LISPRO|DEGLUDEC|LIRAGLUTIDE|ERYTHROPOIETIN|OXYTOCIN|BIOSIM|RABIES|TETANUS/;
  const fridges = () => String(agentCfg('coldchain').fridges || 'Fridge 1').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  const coldStock = () => db.products.filter(p => isCold(p) && sellableQty(p.id) > 0);
  ACTIONS['temp-log'] = () => {
    const c = agentCfg('coldchain'), last = (db.tempLog || []).slice(0, 20);
    const slot = new Date().getHours() < 13 ? 'Morning' : 'Evening';
    openModal({
      title: 'Fridge temperature log', size: 'lg', submitLabel: 'Save reading',
      body: `<div class="form-grid g4">
          ${field('Fridge', 'fridge', { options: fridges() })}
          ${field('Time', 'slot', { value: slot, options: ['Morning', 'Evening', 'Other'] })}
          ${field('Temperature (°C)', 'temp', { type: 'number', required: true, attrs: 'step="0.1" inputmode="decimal"' })}
          ${field('Note', 'note', {})}
        </div>
        <div class="small muted">Safe range ${c.min}–${c.max} °C for insulin, vaccines and other cold-chain items. ${coldStock().length} cold-chain product(s) in stock.</div>
        ${miniTable([
          { h: 'When', c: t => `${fmtD(t.date)} · ${esc(t.slot)}` }, { h: 'Fridge', c: t => esc(t.fridge) },
          { h: '°C', r: 1, c: t => `<span class="${t.temp < c.min || t.temp > c.max ? 'bad-text strong' : ''}">${dec(t.temp)}</span>` },
          { h: 'Note', c: t => `<span class="small">${esc(t.note || '')}${t.by ? ' · ' + esc(t.by) : ''}</span>` },
        ], last)}`,
      onSubmit: v => {
        const t = num(v.temp); if (!Number.isFinite(t) || String(v.temp).trim() === '' || t < -30 || t > 60) { toast('Enter the temperature in °C.'); return false; }
        if (!Array.isArray(db.tempLog)) db.tempLog = [];
        db.tempLog.unshift({ id: uid(), at: new Date().toISOString(), date: todayIso, slot: v.slot, fridge: v.fridge, temp: round2(t), note: (v.note || '').trim(), by: (db.settings.profile || {}).name || '' });
        if (db.tempLog.length > 2000) db.tempLog.length = 2000;
        const bad = t < c.min || t > c.max;
        if (bad) runAgent('coldchain', false);
        return bad ? `${v.fridge} is at ${dec(t)} °C — outside ${c.min}–${c.max} °C. Check the fridge and the cold-chain stock.` : 'Reading saved.';
      },
    });
  };
  function runColdAgent() {
    const c = agentCfg('coldchain'); const keep = new Set(); let made = 0;
    const add = (it, days) => { made += p4Add('coldchain', keep, it, days); };
    const cold = coldStock(), log = db.tempLog || [], yday = addDays(todayIso, -1);
    if (cold.length || log.length) fridges().forEach(fr => {
      const n = log.filter(t => t.fridge === fr && t.date === yday).length;
      if (n < c.readingsPerDay) add({ key: `cold:miss:${fr}:${yday}`, kind: 'info', title: `${fr}: ${n ? 'only ' + n : 'no'} temperature reading${n === 1 ? '' : 's'} yesterday`, detail: [`Record ${c.readingsPerDay} readings a day (morning and evening) — the Drug Inspector asks for this log.`], payload: { act: ['temp-log', ''] } }, 2);
      const bad = log.filter(t => t.fridge === fr && t.date >= yday && (t.temp < c.min || t.temp > c.max));
      if (bad.length) add({ key: `cold:range:${fr}:${bad[0].date}`, kind: 'info', title: `${fr} was at ${dec(bad[0].temp)} °C (${bad[0].slot}, ${fmtD(bad[0].date)}) — outside ${c.min}–${c.max} °C`, detail: [`${cold.length} cold-chain product(s) in stock: ${cold.slice(0, 5).map(p => p.name).join(', ')}`, 'Check the fridge and move the stock if needed. Stock kept warm for long may have to be returned or destroyed — ask the supplier.'], payload: { act: ['temp-log', ''] } }, 3);
    });
    // Name / salt / form only — a category such as “Diabetes & Insulin” also holds tablets; tablets, capsules and syrups are left out
    if (c.suggest) { const sug = db.products.filter(p => !isCold(p) && !/TABLET|CAPSULE|SYRUP|CREAM|LOTION|POWDER|SACHET/i.test(p.form || '') && COLD_HINT.test(norm([p.name, p.salt, p.form].join(' ')))); if (sug.length) add({ key: 'cold:suggest', kind: 'info', title: `${sug.length} product(s) may need cold storage (2–8 °C)`, detail: [sug.slice(0, 6).map(p => p.name).join(', '), 'Products & Masters → Edit → tick “Cold chain”, or tick several and set Cold chain.'], payload: { go: 'products' } }, 30); }
    closeStale('coldchain', keep);
    return { made, summary: `${cold.length} cold-chain product(s) in stock · ${log.filter(t => t.date >= yday).length} reading(s) since yesterday` };
  }

  // ----- Supplier Performance -----
  const netRate = l => round2(num(l.rate) * (1 - num(l.cd) / 100) * (1 - num(l.td) / 100));
  const shelfDays = (exp, from) => { if (!exp) return 9999; const [y, m] = exp.split('-').map(Number); return Math.round((new Date(y, m, 0) - parse(from)) / DAY); };
  // Latest net purchase rate of each product from each supplier, in the look-back period
  function latestRates(c) {
    const since = addDays(todayIso, -c.days), m = {};
    purchaseLines().filter(l => l.date >= since && l.supplierId && num(l.rate) > 0).forEach(l => { const k = l.productId; m[k] = m[k] || {}; if (!m[k][l.supplierId]) m[k][l.supplierId] = { rate: netRate(l), date: l.date }; });
    return m; // purchaseLines() is newest first, so the first line seen is the latest
  }
  function supplierStats(sid, c, rates) {
    const since = addDays(todayIso, -c.days);
    const pos = db.pos.filter(p => p.supplierId === sid && p.date >= since && p.date <= addDays(todayIso, -7) && p.status !== 'Cancelled');
    let ord = 0, got = 0; pos.forEach(p => p.lines.forEach(l => { ord += l.qty; got += Math.min(l.qty, receivedQty(p.no, l.productId)); }));
    const fill = ord ? got / ord : null;
    const lates = db.grns.filter(g => g.supplierId === sid && g.poNo && g.date >= since).map(g => { const p = db.pos.find(x => x.no === g.poNo); return p?.expected ? Math.max(0, dayDiff(g.date, p.expected)) : null; }).filter(x => x != null);
    const late = lates.length ? Math.round(lates.reduce((a, x) => a + x, 0) / lates.length) : null;
    const lines = purchaseLines(sid).filter(l => l.date >= since);
    const short = lines.filter(l => shelfDays(l.expiry, l.date) < c.minShelfDays).length;
    const mine = Object.entries(rates).filter(([, s]) => s[sid]);
    const costlier = mine.filter(([, s]) => { const best = Math.min(...Object.values(s).map(x => x.rate)); return s[sid].rate > best * (1 + c.savePct / 100); }).length;
    const why = []; let score = 100;
    if (fill != null) { const p = Math.min(30, Math.round(Math.max(0, 0.95 - fill) * 100)); score -= p; why.push(`Supplied ${Math.round(fill * 100)}% of ordered qty`); }
    if (late != null) { const p = Math.min(20, late * 3); score -= p; why.push(late ? `${late} day(s) late on average` : 'Delivers on time'); }
    if (lines.length) { const pct = Math.round(short / lines.length * 100); score -= Math.min(20, Math.round(pct / 2)); if (short) why.push(`${pct}% of lines with less than ${c.minShelfDays} days of shelf life`); }
    if (mine.length) { const pct = Math.round(costlier / mine.length * 100); score -= Math.min(20, Math.round(pct / 5)); if (costlier) why.push(`Costlier than others on ${costlier} of ${mine.length} item(s)`); }
    const has = fill != null || late != null || lines.length;
    return { sid, fill, late, lines: lines.length, short, costlier, items: mine.length, score: has ? score : null, grade: !has ? '—' : score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D', why };
  }
  // Supplier with the lowest recent net rate for each product (ties: better score); used for draft purchase orders
  function bestSupplierMap() {
    const c = agentCfg('supplier'), rates = latestRates(c), score = {}, out = {};
    db.suppliers.forEach(s => { score[s.id] = supplierStats(s.id, c, rates).score ?? 50; });
    Object.entries(rates).forEach(([pid, s]) => { const best = Object.entries(s).sort((a, b) => a[1].rate - b[1].rate || (score[b[0]] - score[a[0]]))[0]; if (best && sup(best[0])) out[pid] = best[0]; });
    return out;
  }
  ACTIONS['supplier-report'] = () => {
    const c = agentCfg('supplier'), rates = latestRates(c);
    const rows = db.suppliers.map(s => ({ s, st: supplierStats(s.id, c, rates) })).sort((a, b) => (a.st.score ?? 101) - (b.st.score ?? 101));
    openModal({
      title: `Supplier performance — last ${c.days} days`, size: 'xl',
      body: `<div class="small muted">Fill rate = ordered qty received (POs older than a week); late = days after the PO’s expected date; short shelf life = lines with less than ${c.minShelfDays} days to expiry when bought; costlier = more than ${c.savePct}% above the cheapest supplier’s latest rate for the same item.</div>
        ${miniTable([
          { h: 'Supplier', c: x => `<span class="strong">${esc(x.s.name)}</span>${x.s.itcHold ? ' ' + pill('On hold') : ''}` },
          { h: 'Score', c: x => x.st.score == null ? '<span class="muted small">—</span>' : `${pill('Score ' + x.st.grade)} <span class="small">${x.st.score}</span>` },
          { h: 'Fill', r: 1, c: x => x.st.fill == null ? '—' : `${Math.round(x.st.fill * 100)}%` },
          { h: 'Late', r: 1, c: x => x.st.late == null ? '—' : `${x.st.late} d` },
          { h: 'Short expiry', r: 1, c: x => x.st.lines ? `${x.st.short}/${x.st.lines}` : '—' },
          { h: 'Costlier', r: 1, c: x => x.st.items ? `${x.st.costlier}/${x.st.items}` : '—' },
          { h: 'Why', c: x => `<span class="small">${esc(x.st.why.join(' · '))}</span>` },
        ], rows)}`,
    });
  };
  function runSupplierAgent() {
    const c = agentCfg('supplier'); const keep = new Set(); let made = 0;
    const add = (it, days) => { made += p4Add('supplier', keep, it, days); };
    const rates = latestRates(c);
    db.suppliers.forEach(s => { const st = supplierStats(s.id, c, rates); if (st.grade === 'D') add({ key: 'sup:poor:' + s.id, kind: 'info', title: `${s.name} scores D (${st.score}/100) as a supplier`, detail: [...st.why, 'Talk to them, or buy these items elsewhere.'], payload: { act: ['supplier-report', ''] } }, 30); });
    const lastBuy = {}; purchaseLines().forEach(l => { if (!lastBuy[l.productId] && l.supplierId) lastBuy[l.productId] = l; });
    const cheaper = [];
    Object.entries(rates).forEach(([pid, s]) => {
      const l = lastBuy[pid]; if (!l || !s[l.supplierId]) return;
      const [bsid, b] = Object.entries(s).sort((x, y) => x[1].rate - y[1].rate)[0];
      const mine = s[l.supplierId].rate; if (bsid === l.supplierId || mine <= b.rate * (1 + c.savePct / 100)) return;
      cheaper.push(`${prod(pid)?.name}: last from ${sup(l.supplierId)?.name} at ₹${dec(mine)}, ${sup(bsid)?.name} ₹${dec(b.rate)} (−${Math.round((1 - b.rate / mine) * 100)}%)`);
    });
    if (cheaper.length) add({ key: 'sup:cheaper', kind: 'info', title: `${cheaper.length} item(s) are cheaper from another supplier`, detail: [...cheaper.slice(0, 5), c.preferBest ? 'Draft purchase orders already use the cheaper supplier.' : 'Turn on “Draft purchase orders from the cheapest supplier” in Supplier Performance settings.'], payload: { act: ['supplier-report', ''] } }, 14);
    closeStale('supplier', keep);
    return { made, summary: `${db.suppliers.length} supplier(s) scored · ${cheaper.length} item(s) cheaper elsewhere` };
  }

  // ----- Audit & Anomaly -----
  function runAuditAgent() {
    const c = agentCfg('audit'); const keep = new Set(); let made = 0;
    const add = (it, days) => { made += p4Add('audit', keep, it, days); };
    const since = addDays(todayIso, -c.days), recent = db.sales.filter(s => s.date >= since);
    const disc = recent.filter(s => s.lines.some(l => num(l.cd) + num(l.td) > c.maxDisc));
    if (disc.length) add({ key: 'aud:disc', kind: 'info', title: `${disc.length} bill(s) with discount above ${c.maxDisc}%`, detail: disc.slice(0, 5).map(s => `${s.no} · ${partyName(s)} · up to ${dec(Math.max(...s.lines.map(l => num(l.cd) + num(l.td))))}%`), payload: { go: 'sales' } }, 7);
    const loss = [];
    recent.forEach(s => s.lines.forEach(l => { const b = batchById(l.batchId), p = prod(l.productId); if (!b || !l.qty) return; const sell = calcLine(l).taxable / l.qty, cost = netRate(b); if (cost > 0 && sell < cost - 0.01) loss.push(`${s.no} · ${p?.name}: sold at ₹${dec(sell)}, cost ₹${dec(cost)}`); }));
    if (loss.length) add({ key: 'aud:loss', kind: 'info', title: `${loss.length} bill line(s) sold below purchase cost`, detail: loss.slice(0, 5), payload: { go: 'sales' } }, 7);
    const ch = (db.auditLog || []).filter(x => x.date >= since && (x.what === 'Sale bill deleted' || (x.what === 'Sale bill edited' && x.billDate && dayDiff(x.date, x.billDate) > c.editDays)));
    if (ch.length) add({ key: 'aud:edits', kind: 'info', title: `${ch.length} sale bill(s) deleted or changed later`, detail: ch.slice(0, 5).map(x => `${fmtD(x.date)} · ${x.what} · ${x.ref}${x.party ? ' · ' + x.party : ''}${x.before != null ? ` · ₹${dec(x.before)} → ₹${dec(x.amount)}` : x.amount ? ` · ₹${dec(x.amount)}` : ''}`), payload: { act: ['audit-log', ''] } }, 7);
    const neg = db.batches.filter(b => (b.qty || 0) < 0 || (b.free || 0) < 0);
    if (neg.length) add({ key: 'aud:neg', kind: 'info', title: `${neg.length} stock line(s) below zero`, detail: neg.slice(0, 5).map(b => `${prod(b.productId)?.name} · ${b.batch} · qty ${b.qty} free ${b.free || 0}`), payload: { go: 'stock' } }, 7);
    const pay = db.sales.filter(s => (s.paid || 0) > s.total + 0.5 || payList(s).some((p, i, a) => a.findIndex(q => q.date === p.date && Math.abs(q.amount - p.amount) < 0.01) !== i));
    if (pay.length) add({ key: 'aud:pay', kind: 'info', title: `${pay.length} bill(s) with a repeated payment or paid more than the total`, detail: pay.slice(0, 5).map(s => `${s.no} · ${partyName(s)} · total ₹${dec(s.total)}, paid ₹${dec(s.paid || 0)}`), payload: { go: 'sales' } }, 7);
    const dup = [], seen = (arr, f, label) => { const m = {}; arr.forEach(x => { const k = f(x); if (!k) return; if (m[k]) dup.push(`${label}: ${m[k].name} = ${x.name}`); else m[k] = x; }); };
    seen(db.products, p => bkey(p.name), 'Product'); seen(db.chemists, x => phone10(x.phone), 'Chemist (same mobile)'); seen(db.chemists, x => String(x.gstin || '').toUpperCase(), 'Chemist (same GSTIN)'); seen(db.suppliers, x => String(x.gstin || '').toUpperCase(), 'Supplier (same GSTIN)');
    if (dup.length) add({ key: 'aud:dup', kind: 'info', title: `${dup.length} possible duplicate record(s)`, detail: dup.slice(0, 6), payload: { go: 'products' } }, 14);
    const bad = db.products.filter(p => !/^\d{4,8}$/.test(String(p.hsn || '').trim()) || ![0, 5, 12, 18, 28].includes(num(p.gst)));
    if (bad.length) add({ key: 'aud:master', kind: 'info', title: `${bad.length} product(s) with a missing HSN or unusual GST rate`, detail: bad.slice(0, 6).map(p => `${p.name} · HSN ${p.hsn || '—'} · GST ${dec(p.gst)}%`), payload: { go: 'products' } }, 14);
    closeStale('audit', keep);
    return { made, summary: `${keep.size} thing(s) to check` };
  }
  ACTIONS['audit-log'] = () => openModal({
    title: 'Bill changes', size: 'lg',
    body: `<div class="small muted">Sale bills edited or deleted (newest first). Kept in your data.</div>${miniTable([
      { h: 'When', c: x => new Date(x.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) },
      { h: 'What', c: x => `<span class="strong">${esc(x.what)}</span> ${esc(x.ref)}<div class="small muted">${esc(x.party || '')}${x.billDate ? ' · bill of ' + fmtD(x.billDate) : ''}</div>` },
      { h: 'Amount', r: 1, c: x => x.before != null ? `₹${dec(x.before)} → ₹${dec(x.amount)}` : x.amount != null ? `₹${dec(x.amount)}` : '' },
      { h: 'By', c: x => esc(x.by || '—') },
    ], (db.auditLog || []).slice(0, 200))}`,
  });

  // ----- Register the Phase 5 agents -----
  Object.assign(AGENT_DEFS, {
    gstr2b: { name: 'GSTR-2B Reconciliation', icon: 'file', auto: true, desc: 'Matches the GSTR-2B you download from the GST portal with your purchase bills: bills your suppliers have not filed (input tax credit at risk — hold their payment), amount differences, and invoices in 2B that are not in your books.', defaults: { enabled: true, auto: true, time: '10:40', remindDay: 14, minTax: 100 } },
    payplan: { name: 'Payment Planner', icon: 'rupee', auto: true, desc: 'Cash plan for the coming weeks: money expected from chemists (by their usual payment days) against supplier bills due. Lists this week’s supplier payments and warns before a week where money may run short.', defaults: { enabled: true, auto: true, time: '10:20', days: 35, cash: 0, overduePct: 50 } },
    gstdocs: { name: 'e-Invoice & e-Way Bill', icon: 'truck', auto: true, desc: 'Finds bills that need an e-way bill (above the limit) or an e-invoice (IRN, when your turnover requires it), and makes the JSON files to upload on the government portals. Saves the numbers you get back; they print on the bill.', defaults: { enabled: true, auto: true, time: '09:45', ewayLimit: 50000, einvoice: false, days: 7, vehicle: '' } },
    clearance: { name: 'Near-Expiry Clearance', icon: 'clock', auto: true, desc: 'Each week: stock expiring in the next months, offered at a step-up discount to the chemists who buy those items — a WhatsApp offer for each. What does not sell goes to expiry claims.', defaults: { enabled: true, auto: true, time: '11:15', minDays: 30, maxDays: 180, disc180: 10, disc120: 15, disc60: 20, buyerDays: 180, repeatDays: 14, template: DEFAULT_CLEAR } },
    coldchain: { name: 'Cold Chain Watch', icon: 'alert', auto: true, desc: 'Fridge temperature log (morning and evening) for insulin, vaccines and other 2–8 °C items: missed readings, readings out of range, and products that may need cold storage. Cold items are marked on the dispatch list.', defaults: { enabled: true, auto: true, time: '10:50', fridges: 'Fridge 1', min: 2, max: 8, readingsPerDay: 2, suggest: true } },
    supplier: { name: 'Supplier Performance', icon: 'truck', auto: true, desc: 'Scores suppliers on fill rate, delivery delay, short-expiry stock and rates; points out items that are cheaper from another supplier, and can draft purchase orders to the cheapest supplier.', defaults: { enabled: true, auto: true, time: '11:20', days: 180, minShelfDays: 365, savePct: 3, preferBest: false } },
    audit: { name: 'Audit & Anomaly', icon: 'search', auto: true, desc: 'Every day: big discounts, sales below cost, bills deleted or changed later, stock below zero, repeated payments, duplicate products / chemists / suppliers and products with a wrong HSN or GST rate.', defaults: { enabled: true, auto: true, time: '18:30', days: 7, maxDisc: 10, editDays: 2 } },
  });
  { const b = AGENT_DEFS.briefing; delete AGENT_DEFS.briefing; AGENT_DEFS.briefing = b; }
  Object.assign(AGENT_FIELDS, {
    gstr2b: [{ k: 'remindDay', label: 'Remind to import last month’s GSTR-2B from day (1–28)', type: 'number' }, { k: 'minTax', label: 'Flag a supplier only if the ITC at risk is at least (₹)', type: 'number' }],
    payplan: [{ k: 'cash', label: 'Cash and bank balance today (₹)', type: 'number' }, { k: 'days', label: 'Plan for the next (days)', type: 'number' }, { k: 'overduePct', label: 'Count overdue chemist bills at (%) — they may not all come in', type: 'number' }],
    gstdocs: [{ k: 'ewayLimit', label: 'e-Way bill needed above (₹)', type: 'number' }, { k: 'einvoice', label: 'My turnover needs e-invoices (IRN) for B2B bills', type: 'check' }, { k: 'days', label: 'Check bills of the last (days)', type: 'number' }],
    clearance: [{ k: 'minDays', label: 'Offer stock expiring in at least (days)', type: 'number' }, { k: 'maxDays', label: '…and at most (days)', type: 'number' }, { k: 'disc180', label: 'Discount (%) — up to the maximum days', type: 'number' }, { k: 'disc120', label: 'Discount (%) — within 120 days', type: 'number' }, { k: 'disc60', label: 'Discount (%) — within 60 days', type: 'number' }, { k: 'buyerDays', label: 'Offer to chemists who bought the item in the last (days)', type: 'number' }, { k: 'repeatDays', label: 'Do not offer the same chemist again within (days)', type: 'number' }, { k: 'template', label: 'Offer message — {party} {lines} {firm}', type: 'textarea' }],
    coldchain: [{ k: 'fridges', label: 'Fridges (comma separated)', type: 'textarea' }, { k: 'min', label: 'Lowest safe temperature (°C)', type: 'number' }, { k: 'max', label: 'Highest safe temperature (°C)', type: 'number' }, { k: 'readingsPerDay', label: 'Readings a day per fridge', type: 'number' }, { k: 'suggest', label: 'Suggest products that may need cold storage', type: 'check' }],
    supplier: [{ k: 'days', label: 'Look at the last (days)', type: 'number' }, { k: 'minShelfDays', label: 'Short shelf life: less than (days) to expiry when bought', type: 'number' }, { k: 'savePct', label: 'Cheaper elsewhere: at least (%) lower rate', type: 'number' }, { k: 'preferBest', label: 'Draft purchase orders from the cheapest supplier (Stock & Purchase agent)', type: 'check' }],
    audit: [{ k: 'days', label: 'Check bills of the last (days)', type: 'number' }, { k: 'maxDisc', label: 'Flag discounts (CD + TD) above (%)', type: 'number' }, { k: 'editDays', label: 'Flag bills edited more than (days) after the bill date', type: 'number' }],
  });
  Object.assign(AGENT_RUN, { gstr2b: runItcAgent, payplan: runPayplanAgent, gstdocs: runGstDocsAgent, clearance: runClearanceAgent, coldchain: runColdAgent, supplier: runSupplierAgent, audit: runAuditAgent });
  Object.assign(APPR_LABEL, { itchold: 'Hold payment', paylist: 'Payment plan', gstdocs: 'Make documents', clearance: 'Send offers' });
  Object.assign(APPR_HANDLERS, {
    itchold: a => {
      const s = sup(a.payload.sid); if (!s) { doneApproval(a.id, 'Supplier removed'); refresh(); return; }
      if (s.itcHold) { doneApproval(a.id, 'Already on hold'); refresh(); toast(`${s.name} is already on hold.`); return; }
      confirmModal(`Hold payments to ${esc(s.name)}?`, `Their bills are not in your GSTR-2B yet, so you cannot claim the input tax credit. The Payment Planner leaves them out and the payment screen warns you. The hold is removed by itself when their bills show up in a later GSTR-2B.`, 'Hold payments', () => { s.itcHold = true; doneApproval(a.id, 'Payment on hold'); logAgent('gstr2b', `${s.name}: payment put on hold`); return `${s.name}: payment on hold.`; });
      $('#modalFoot [data-submit]')?.classList.remove('danger-solid');
    },
    paylist: a => { doneApproval(a.id, 'Seen'); save(); ACTIONS['payplan-view'](); },
    gstdocs: a => gstDocsModal(a.id),
    clearance: a => clearanceModal(a.id),
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-p5]'); if (!b) return;
    const id = b.dataset.id;
    ({ 'ewb-json': () => gstDocsDownload('ewb'), 'einv-json': () => gstDocsDownload('einv'), 'clr-wa': () => clearanceWa(id) })[b.dataset.p5]?.();
  });

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
    return `<span class="small strong">${esc(l.username)}</span> ${l.active ? pill('Active') : pill('Off')}<div class="small muted">${l.lastLogin ? 'Last in ' + fmtDate(l.lastLogin.slice(0, 10)) : 'Never signed in'}${l.mustChange ? ' · must set own password' : ''}</div>`;
  };
  const LOGIN_ID_RE = /^[a-z0-9._@+-]{3,100}$/;
  const defaultLoginId = c => String(c.email || '').trim().toLowerCase() || '';
  const portalFields = (c, l) => `
    <div class="small muted">The chemist signs in to the portal with these to see your stock and place orders. By default the <b>login ID is their email</b> and the <b>password is their mobile number</b>.${c.status && c.status !== 'Active' ? ' <b>The login works only after the chemist is Active.</b>' : ''}</div>
    <div class="form-grid g3">
      ${field('Login ID (email)', 'pUser', { value: l?.username || defaultLoginId(c), attrs: `autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="filled from Email" data-auto="${l ? '0' : '1'}"` })}
      ${field(l ? 'New password (leave empty to keep)' : 'Password (mobile number)', 'pPass', { value: l ? '' : (c.phone || ''), attrs: `autocomplete="new-password" placeholder="${l ? '' : 'filled from Mobile'}" data-auto="${l ? '0' : '1'}"` })}
      <div class="field"><label>&nbsp;</label><label class="check-line"><input type="checkbox" name="pActive" ${!l || l.active ? 'checked' : ''}> Login switched on</label></div>
      <div class="field full"><label class="check-line"><input type="checkbox" name="pTemp" ${l ? '' : 'checked'}> Ask the chemist to set their own password at first sign-in <span class="muted small">(recommended — a mobile number is easy for others to know)</span></label></div>
    </div>`;
  // While onboarding, keep Login ID = Email and Password = Mobile until the admin types something else
  function syncLoginDefaults() {
    const u = $('#f-pUser'), p = $('#f-pPass');
    if (u && u.dataset.auto === '1') u.value = String($('#mform [name="email"]')?.value || '').trim().toLowerCase();
    if (p && p.dataset.auto === '1') p.value = String($('#mform [name="phone"]')?.value || '').trim();
  }
  async function savePortalLogin(c, d) {
    const body = { username: String(d.pUser || '').trim().toLowerCase(), active: !!d.pActive };
    if (d.pPass) { body.password = d.pPass; body.mustChange = !!d.pTemp; }
    await api('PUT', `api/logins/${encodeURIComponent(c.id)}`, body);
    await loadLogins();
    return d.pPass ? `Portal login for ${c.name}: login ID “${body.username}”, password “${d.pPass}”${d.pPass === c.phone ? ' (their mobile number)' : ''}.${body.mustChange ? ' They will be asked to set their own password when they first sign in.' : ''} Share it with them privately.` : `Login for ${c.name} updated.`;
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
        if (preset.approvalId) { doneApproval(preset.approvalId, `Created ${no}`); logAgent('stock', `${no} created from the agent's draft`); }
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
      extraFoot: `<div class="foot-left">${!g.invoiced ? `<button type="button" class="btn primary" data-act="invoice-grn" data-id="${g.no}">Add purchase invoice</button>` : ''}${printBtn()}</div>`,
      body: billBody({ title: 'GOODS RECEIPT NOTE', no: g.no, date: g.date, partyTitle: s?.name || '', partyLines: [s && addrText(s), `GSTIN: ${s?.gstin || '—'}`], metaLines: [['PO', g.poNo || '—'], ['Challan', g.challan || '—'], ['Invoice', g.invoiced || 'Awaiting']], lines: g.lines, t: g }),
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
      extraFoot: `<div class="foot-left">${balance(p) > 0.5 ? `<button type="button" class="btn gold" data-act="pay-pi" data-id="${p.no}">Record payment</button>` : ''}${printBtn()}</div>`,
      body: billBody({ title: 'PURCHASE BILL', no: p.no, date: p.date, partyTitle: s?.name || '', partyLines: [s && addrText(s), `GSTIN: ${s?.gstin || '—'}`], metaLines: [['Supplier bill', p.supplierInvNo || '—'], ['Due', fmtDate(p.due)], ['Status', piStatus(p)], ['Source', p.grnNo || p.source || 'Manual']], lines: piLines(p), t: p, paid: p.paid }),
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
      onSubmit: d => { Object.assign(p, { supplierInvNo: d.supplierInvNo.trim(), date: d.date, due: d.due }); adjustPaid(p, Math.min(p.total, round2(num(d.paid))), 'Adjusted when the bill was edited'); return `${p.no} updated.`; },
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
        ${sup(p.supplierId)?.itcHold ? '<div class="small bad-text">Payment is on hold: this supplier’s bills are not in your GSTR-2B yet, so the input tax credit is at risk. See GST / ITC Match.</div>' : ''}
        <div class="form-grid">
          ${field('Amount (₹)', 'amount', { type: 'number', value: balance(p), required: true, attrs: `min="0.01" max="${balance(p)}" step="0.01"` })}
          ${field('Date', 'date', { type: 'date', value: todayIso, required: true, attrs: `max="${todayIso}"` })}
          ${field('Mode', 'mode', { options: ['NEFT / RTGS', 'UPI', 'Cheque', 'Cash'] })}
          ${field('Reference (UTR / cheque no.)', 'ref', { value: '' })}
        </div>`,
      onSubmit: d => { const a = Math.min(num(d.amount), balance(p)); addPayment(p, a, d.date || todayIso, [d.mode, d.ref].filter(Boolean).join(' · ')); return `Payment of ${money(a)} recorded on ${p.no}.`; },
    });
  };

  // Ask for the Anthropic API key where it is needed, then carry on with what the user was doing.
  // The key is kept in this browser for this address only (localStorage is per address and port).
  function askApiKey(then) {
    openModal({
      title: 'Anthropic API key needed', size: 'sm', submitLabel: then ? 'Save and read the bill' : 'Save key',
      body: `<div class="small">Reading bills with AI uses your own Anthropic API key. No key is saved in this browser for <b>${esc(location.host || 'this page')}</b>.</div>
        <div class="form-grid">${field('Anthropic API key', 'apikey', { type: 'password', required: true, full: true, attrs: 'autocomplete="off" placeholder="sk-ant-…"' })}</div>
        <div class="small muted">Create a key at console.anthropic.com → API keys. It is saved only in this browser on this computer, for this address — if you saved it earlier at another address (for example localhost instead of 127.0.0.1, or the server on port 8080), enter it here once more. You can change it later in Settings → Integrations → AI providers.</div>`,
      onSubmit: v => {
        const k = String(v.apikey || '').trim();
        if (!/^sk-ant-[\w-]{20,}$/.test(k)) { toast('That does not look like an Anthropic API key — it starts with “sk-ant-”.'); return false; }
        setApiKey(k);
        if (then) setTimeout(then, 0);
        return then ? 'Key saved — reading the bill…' : 'Key saved.';
      },
    });
  }
  ACTIONS['ask-api-key'] = () => askApiKey(null);

  // Bill upload / entry
  ACTIONS['entry-ai'] = async () => {
    if (entryBusy) return;
    if (!pendingFiles.length) { toast('Choose the bill photo(s) or PDF first.'); return; }
    if (!getApiKey()) { askApiKey(() => ACTIONS['entry-ai']()); return; }
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
          ${field('Bank details (printed on sale bills)', 'bank', { value: f.bank || '', full: true, attrs: 'placeholder="e.g. SBI Ghumarwin · A/c 1234567890 · IFSC SBIN0001234 · UPI shop@sbi"' })}
          ${field('Terms (printed on sale bills)', 'terms', { value: f.terms || '', full: true, attrs: 'placeholder="E. & O.E. Goods once sold will be taken back only as per terms. Subject to local jurisdiction."' })}
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
        Object.assign(db.settings.firm, { name: d.name.trim(), phone: d.phone.trim(), ...readAddr(d), ...readLic(d), bank: (d.bank || '').trim(), terms: (d.terms || '').trim() });
        fileLicence('firm', 'firm');
        db.settings.defaultCd = num(d.defcd);
        setApiKey((d.apikey || '').trim());
        return 'Settings saved.';
      },
    });
  };
  ACTIONS['export-data'] = () => { db.settings.lastBackup = todayIso; save(); downloadText(`pharma-suite-backup-${todayIso}.json`, JSON.stringify(db, null, 1), 'application/json'); if (route === 'settings') render(); };
  ACTIONS['settings-data'] = () => { settingsTab = 'data'; if (location.hash === '#settings') render(); else location.hash = 'settings'; };
  ACTIONS['reset-data'] = () => confirmModal('Reset to sample data?', 'Everything in this browser will be replaced with the sample data. Download a backup first if you need it. This cannot be undone.', 'Reset', () => {
    db = migrate(seed()); entry = null; Object.keys(listState).forEach(k => delete listState[k]); billStore.clear().catch(() => {}); return 'Sample data restored.';
  });
  ACTIONS['print'] = id => printBill(id);

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
    const stab = e.target.closest('[data-settings-tab]');
    if (stab) { settingsTab = stab.dataset.settingsTab; render(); return; }
    const snd = e.target.closest('[data-send]');
    if (snd) { handleSend(snd.dataset.send); return; }
    const pm = e.target.closest('[data-promo]');
    if (pm) { promoAction(pm.dataset.promo); return; }
    const pw = e.target.closest('[data-promo-wa]');
    if (pw) { promoAction('wa', pw.dataset.promoWa); return; }
    const oda = e.target.closest('[data-od-act]');
    if (oda) { odAction(oda.dataset.odAct); return; }
    if (e.target.closest('[data-add-iline]')) { $('#iBody').insertAdjacentHTML('beforeend', inqRow()); $('#iBody tr:last-child [data-i=name]').focus(); return; }
    const ril = e.target.closest('[data-rm-iline]');
    if (ril) { if ($$('#iBody tr[data-iline]').length > 1) ril.closest('tr').remove(); else $$('input', ril.closest('tr')).forEach(i => { i.value = i.dataset.i === 'qty' ? 1 : ''; }); return; }
    if (e.target.closest('#logoRemove')) { pendingLogo = ''; $('#profLogo').innerHTML = logoPreview(''); return; }
    if (e.target.closest('[data-hosp-none]')) { setHospitalChoice(''); return; }
    if (e.target.closest('[data-hosp-other]')) { setHospitalChoice('__other'); return; }
    const ph = e.target.closest('[data-pick-hosp]');
    if (ph) { pickHospital(ph.dataset.pickHosp); return; }
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
    if (e.target.matches('#mform [name="tehsil"]')) refreshHospitalSelect();
    if (e.target.id === 'hospSearch') { renderHospResults(); return; }
    if (e.target.matches('[data-rq]')) { retPick(e.target.closest('tr'), true); return; }
    if (e.target.matches('[data-pq]')) { prPick(e.target.closest('tr'), true); return; }
    if (e.target.id === 'prSearch') { filterPrLines(); return; }
    if (e.target.id === 'retSearch') { filterReturnLines(); return; }
    if (e.target.matches('#mform [name="email"], #mform [name="phone"]')) syncLoginDefaults();
    if (e.target.matches('#f-pUser, #f-pPass')) e.target.dataset.auto = e.target.value ? '0' : '1';
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
    if (t.id === 'docCsv' && t.files[0]) {
      try { const r = importDoctors(await t.files[0].text()); refresh(); toast(`${r.added} doctors added, ${r.updated} updated${r.newHosp ? `, ${r.newHosp} new hospitals added to the directory` : ''}.`); }
      catch (err) { toast(err.message || 'Could not read the CSV.'); }
      t.value = ''; return;
    }
    if (t.matches('[name="paperSize"]')) { setPaperSize(t.value); return; }
    if (t.matches('[data-int-toggle]')) { const c = intCfg(t.dataset.intToggle); c.enabled = t.checked; delete c.lastTest; refresh(); return; }
    if (t.matches('[data-agent-toggle]')) { agentCfg(t.dataset.agentToggle).enabled = t.checked; refresh(); return; }
    if (t.matches('[data-int-mode]')) { $$('#mform [data-when]').forEach(el => el.classList.toggle('hidden', el.dataset.when !== t.value)); return; }
    if (t.matches('[data-od]') && odState) { const i = +t.closest('tr').dataset.odl, k = t.dataset.od; odState.lines[i][k] = k === 'productId' ? t.value : Math.max(k === 'qty' ? 1 : 0, Math.round(num(t.value))); renderOdResult(); return; }
    if (t.id === 'odParty' && odState) { odState.party = odParty(); renderOdResult(); return; }
    if (t.matches('[name="itype"]')) { $$('#mform [data-it]').forEach(el => el.classList.toggle('hidden', el.dataset.it !== t.value)); return; }
    if (t.matches('[name="rtype"]')) { $$('#mform [data-rt]').forEach(el => el.classList.toggle('hidden', el.dataset.rt !== t.value)); retDraft.picks = {}; renderReturnLines(); return; }
    if (t.id === 'f-prSup') { prDraft.picks = {}; renderPrLines(); return; }
    if (t.matches('[data-psel]')) { prPick(t.closest('tr'), false); return; }
    if (t.id === 'bankFile' && t.files[0]) {
      try { const r = importBankCsv(await t.files[0].text()); closeModal(false); refresh(); toast(`Bank statement read: ${r.matched} matched (see Approvals), ${r.unmatched} not matched${r.seen ? `, ${r.seen} already seen` : ''}.`); }
      catch (err) { toast(err.message || 'Could not read the CSV.'); }
      t.value = ''; return;
    }
    if (t.id === 'f-rChem' || t.id === 'f-rCust') { retDraft.picks = {}; renderReturnLines(); return; }
    if (t.matches('[data-rsel]')) { retPick(t.closest('tr'), false); return; }
    if (t.matches('[data-rselall]')) { $$('#retLines tr[data-rkey]').filter(tr => tr.style.display !== 'none').forEach(tr => { $('[data-rsel]', tr).checked = t.checked; retPick(tr, false); }); return; }
    if (t.matches('[name="ledgerType"]')) { Object.assign(ledgerState, { type: t.value, id: '' }); render(); return; }
    if (t.id === 'ledgerParty') { ledgerState.id = t.value; render(); return; }
    if (t.id === 'ledgerFrom' || t.id === 'ledgerTo') { ledgerState[t.id === 'ledgerFrom' ? 'from' : 'to'] = t.value; render(); return; }
    if (t.id === 'logoFile' && t.files[0]) {
      try { pendingLogo = await imageToDataUrl(t.files[0]); $('#profLogo').innerHTML = logoPreview(pendingLogo); } catch (err) { toast(err.message); }
      t.value = ''; return;
    }
    if (t.id === 'hospCsv' && t.files[0]) {
      try { const r = importHospitals(await t.files[0].text()); refresh(); toast(`${r.added} added, ${r.updated} updated in the hospital directory.`); }
      catch (err) { toast(err.message || 'Could not read the CSV.'); }
      t.value = ''; return;
    }
    if (t.id === 'f-hospitalId') { $('#hospOtherWrap')?.classList.toggle('hidden', t.value !== '__other'); if (t.value === '__other') $('#f-hospitalOther')?.focus(); return; }
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
    if (e.target.id === 'hospSearch' && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
      const items = $$('#hospResults [data-pick-hosp]'); let i = items.findIndex(x => x.classList.contains('active'));
      if (e.key === 'Escape') { if ($('#hospSearch').value) { e.preventDefault(); e.stopImmediatePropagation(); $('#hospSearch').value = ''; renderHospResults(); } return; }
      e.preventDefault();
      if (e.key === 'Enter') { if (items[i]) pickHospital(items[i].dataset.pickHosp); return; }
      if (!items.length) return;
      i = e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
      items.forEach((x, j) => x.classList.toggle('active', j === i)); items[i].scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Escape' && $('#modalBack').classList.contains('open')) closeModal();
    if (e.key === 'Enter' && $('#modalBack').classList.contains('open') && e.target.closest('#mform') && e.target.tagName === 'INPUT' && !e.target.closest('#lineBody, #grnLines, .bulk-inline, .hosp-search')) { e.preventDefault(); submitModal(); }
  });
  $('#modalClose').addEventListener('click', () => closeModal());
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#settingsBtn').addEventListener('click', () => { closeModal(); if (location.hash === '#settings') render(); else location.hash = 'settings'; });
  $('#avatarBtn').addEventListener('click', () => ACTIONS['open-profile']());
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
      await Promise.all([loadOrders(), loadLogins(), loadSecretMask()]);
      setInterval(loadOrders, 30000);
    } else {
      db = migrate(load() || seed());
      save();
    }
    render();
    agentsTick();
    setInterval(agentsTick, 15 * 60 * 1000);
  }
  boot();
})();
