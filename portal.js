/* Chemist portal: see the distributor's stock, place orders (also for items not in stock), follow orders and bills. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = v => inr.format(v || 0);
  const nf = new Intl.NumberFormat('en-IN');
  const fmtDate = s => s ? new Date(s.length === 10 ? s + 'T00:00:00' : s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const expTxt = s => s ? `${s.slice(5, 7)}/${s.slice(2, 4)}` : '';
  const PILL = { 'In stock': 'ok', 'Limited stock': 'warn', 'Not in stock': 'bad', New: 'info', Accepted: 'info', Arranging: 'warn', Billed: 'ok', Rejected: 'bad', Cancelled: 'neutral', Paid: 'ok', Due: 'warn' };
  const pill = s => `<span class="pill ${PILL[s] || 'neutral'}">${esc(s)}</span>`;

  let me = null, cat = { items: [], cd: 0, td: 0, firm: {} }, orders = [], bills = [];
  let tab = 'stock';
  const f = { q: '', company: '', category: '', form: '', avail: '' };
  let cart = [];
  const cartKey = () => 'pharmaSuite.cart.' + (me?.chemistId || '');
  const loadCart = () => { try { cart = JSON.parse(localStorage.getItem(cartKey()) || '[]'); } catch { cart = []; } };
  const saveCart = () => { try { localStorage.setItem(cartKey(), JSON.stringify(cart)); } catch { /* cart only lasts this visit */ } updateCartBadge(); };

  async function api(method, url, body) {
    const r = await fetch(url, { method, cache: 'no-store', headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (r.status === 401) { location.href = 'login.html'; throw new Error('Please sign in again.'); }
    const data = await r.json().catch(() => ({}));
    if (r.status === 403 && data.mustChange) { forcePassword(); throw new Error(data.error); }
    if (!r.ok) throw new Error(data.error || `Server error (${r.status})`);
    return data;
  }
  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3800); }

  function updateCartBadge() {
    const n = cart.length; const b = $('#cartN');
    b.hidden = !n; b.textContent = n;
  }
  const itemById = id => cat.items.find(i => i.id === id);
  function addToCart(line) {
    const same = line.productId ? cart.find(l => l.productId === line.productId) : null;
    if (same) same.qty += line.qty; else cart.push(line);
    saveCart();
  }

  // ---------- Views ----------
  const opts = (vals, cur, all) => `<option value="">${all}</option>` + [...new Set(vals.filter(Boolean))].sort().map(v => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
  function viewStock() {
    const items = cat.items.filter(i =>
      (!f.q || `${i.name} ${i.company} ${i.category} ${i.form} ${i.pack}`.toLowerCase().includes(f.q.toLowerCase())) &&
      (!f.company || i.company === f.company) && (!f.category || i.category === f.category) && (!f.form || i.form === f.form) &&
      (!f.avail || (f.avail === 'in' ? i.available > 0 : i.available <= 0)));
    const inStock = cat.items.filter(i => i.available > 0).length;
    return `
      <section class="card">
        <div class="card-head"><h2 class="card-title">Stock list</h2><span class="hint">${inStock} of ${cat.items.length} items in stock · you can order anything, we arrange what is not in stock</span></div>
        <div class="filter-bar portal-filters">
          <label class="filter grow"><span>Search</span><input id="fq" value="${esc(f.q)}" placeholder="Item, brand, type…" autocomplete="off"></label>
          <label class="filter"><span>Company / brand</span><select data-f="company">${opts(cat.items.map(i => i.company), f.company, 'All')}</select></label>
          <label class="filter"><span>Category</span><select data-f="category">${opts(cat.items.map(i => i.category), f.category, 'All')}</select></label>
          <label class="filter"><span>Type / form</span><select data-f="form">${opts(cat.items.map(i => i.form), f.form, 'All')}</select></label>
          <label class="filter"><span>Availability</span><select data-f="avail"><option value="">All</option><option value="in" ${f.avail === 'in' ? 'selected' : ''}>In stock</option><option value="out" ${f.avail === 'out' ? 'selected' : ''}>Not in stock</option></select></label>
        </div>
        <div class="cat-list" id="catList">${items.map(itemRow).join('') || '<div class="empty">No items match. Use “Request an item” below to order something not in the list.</div>'}</div>
      </section>
      <section class="card">
        <div class="card-head"><h2 class="card-title">Request an item not in the list</h2></div>
        <div class="card-body"><form id="reqForm" class="form-grid g4" novalidate>
          <div class="field"><label for="rName">Item name *</label><input id="rName" maxlength="120" placeholder="e.g. Dolo 650 tab"></div>
          <div class="field"><label for="rCompany">Company</label><input id="rCompany" maxlength="60"></div>
          <div class="field"><label for="rPack">Pack</label><input id="rPack" maxlength="40" placeholder="e.g. 15TAB"></div>
          <div class="field"><label for="rQty">Qty *</label><input id="rQty" type="number" min="1" step="1" value="1" inputmode="numeric"></div>
          <div class="field full"><button type="submit" class="btn primary" style="align-self:flex-start">Add request to cart</button></div>
        </form></div>
      </section>`;
  }
  function itemRow(i) {
    const inCart = cart.find(l => l.productId === i.id);
    const st = i.available > 0 ? `${pill(i.status)} <span class="small muted">${nf.format(i.available)} available${i.nearestExpiry ? ' · exp ' + expTxt(i.nearestExpiry) : ''}</span>` : `${pill('Not in stock')} <span class="small muted">we can arrange it</span>`;
    return `<div class="cat-item">
      <div class="cat-main"><div class="strong">${esc(i.name)}</div>
        <div class="small muted">${esc([i.company, i.form, i.pack, i.category].filter(Boolean).join(' · '))}</div>
        <div class="cat-stock">${st}</div></div>
      <div class="cat-price"><div class="small muted">MRP ${money(i.mrp)}</div><div class="strong num">Rate ${money(i.rate)}</div><div class="small muted">+ GST ${i.gst}%</div></div>
      <div class="cat-add"><input type="number" min="1" step="1" value="1" inputmode="numeric" data-qty="${esc(i.id)}" aria-label="Quantity for ${esc(i.name)}">
        <button type="button" class="btn sm ${i.available > 0 ? 'primary' : ''}" data-add="${esc(i.id)}">${i.available > 0 ? 'Add' : 'Order anyway'}</button>
        ${inCart ? `<div class="small ok-text">${nf.format(inCart.qty)} in cart</div>` : ''}</div>
    </div>`;
  }
  function viewCart() {
    if (!cart.length) return `<section class="card"><div class="empty">Your cart is empty. Add items from the stock list.</div></section>`;
    const est = cart.reduce((a, l) => { const i = l.productId ? itemById(l.productId) : null; return a + (i ? i.rate * l.qty : 0); }, 0);
    return `<section class="card">
      <div class="card-head"><h2 class="card-title">Cart</h2><span class="hint">${cart.length} item${cart.length === 1 ? '' : 's'}</span><div class="spacer"></div><button type="button" class="btn sm ghost danger" id="clearCart">Empty cart</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Item</th><th>Availability</th><th class="r">Rate</th><th>Qty</th><th class="r">Value</th><th></th></tr></thead>
        <tbody>${cart.map((l, n) => { const i = l.productId ? itemById(l.productId) : null; return `<tr>
          <td><span class="strong">${esc(i ? i.name : l.name)}</span><div class="small muted">${esc(i ? [i.company, i.pack].join(' · ') : [l.company, l.pack, 'requested item'].filter(Boolean).join(' · '))}</div></td>
          <td>${i ? (i.available >= l.qty ? pill('In stock') : i.available > 0 ? pill('Limited stock') + `<div class="small muted">${nf.format(i.available)} now, rest arranged</div>` : pill('Not in stock') + '<div class="small muted">will be arranged</div>') : pill('Not in stock')}</td>
          <td class="r num">${i ? money(i.rate) : '—'}</td>
          <td><input type="number" min="1" step="1" value="${l.qty}" data-cqty="${n}" style="width:80px" class="cart-qty"></td>
          <td class="r num">${i ? money(i.rate * l.qty) : '—'}</td>
          <td><button type="button" class="btn ghost sm danger" data-rm="${n}" aria-label="Remove">✕</button></td></tr>`; }).join('')}</tbody>
      </table></div>
      <div class="card-body">
        <div class="field"><label for="orderNote">Note for the distributor (optional)</label><textarea id="orderNote" rows="2" maxlength="500" placeholder="Delivery time, scheme, substitute allowed…"></textarea></div>
        <div class="cart-foot"><div><div class="small muted">Estimated value at rate, before your ${cat.cd ? cat.cd + '% CD' : 'discount'} and GST</div><div class="kpi-value num" style="font-size:24px;margin:0">${money(est)}</div></div>
          <button type="button" class="btn gold" id="placeOrder">Place order</button></div>
        <div class="small muted">The final bill is made by the distributor with batch, discount and GST.</div>
      </div>
    </section>`;
  }
  function viewOrders() {
    if (!orders.length) return `<section class="card"><div class="empty">No orders yet.</div></section>`;
    return orders.map(o => `<section class="card">
      <div class="card-head"><h2 class="card-title">${esc(o.id)}</h2><span class="hint">${new Date(o.created).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><div class="spacer"></div>${pill(o.status)}${o.status === 'New' ? `<button type="button" class="btn sm ghost danger" data-cancel="${esc(o.id)}">Cancel</button>` : ''}</div>
      <div class="table-wrap"><table><thead><tr><th>Item</th><th class="r">Qty</th></tr></thead>
        <tbody>${o.lines.map(l => `<tr><td>${esc(l.name)}<div class="small muted">${esc([l.company, l.pack].filter(Boolean).join(' · '))}</div></td><td class="r num">${nf.format(l.qty)}</td></tr>`).join('')}</tbody></table></div>
      <div class="card-body small">${o.note ? `<div><b>Your note:</b> ${esc(o.note)}</div>` : ''}${o.reply ? `<div><b>Distributor:</b> ${esc(o.reply)}</div>` : ''}${o.saleNo ? `<div><b>Billed as:</b> ${esc(o.saleNo)}</div>` : ''}
        <div class="muted">${{ New: 'Sent — waiting for the distributor.', Accepted: 'Accepted by the distributor.', Arranging: 'The distributor is arranging the items.', Billed: 'Billed — see My bills.', Rejected: 'Not accepted.', Cancelled: 'You cancelled this order.' }[o.status] || ''}</div></div>
    </section>`).join('');
  }
  function viewBills() {
    const left = b => Math.max(0, b.total - b.paid - (b.returned || 0));
    const due = bills.reduce((a, b) => a + left(b), 0);
    return `<div class="grid g-2">
        <div class="card kpi"><div class="kpi-label"><span class="dot"></span>Bills</div><div class="kpi-value num">${bills.length}</div></div>
        <div class="card kpi"><div class="kpi-label"><span class="dot"></span>Balance due</div><div class="kpi-value num">${money(due)}</div></div>
      </div>
      <section class="card"><div class="card-head"><h2 class="card-title">My bills</h2></div>
      <div class="table-wrap">${bills.length ? `<table><thead><tr><th>Bill</th><th>Date</th><th class="r">Items</th><th class="r">Amount</th><th class="r">Paid</th><th class="r">Balance</th><th></th></tr></thead><tbody>${bills.map(b => `<tr>
        <td class="strong">${esc(b.no)}</td><td>${fmtDate(b.date)}</td><td class="r">${b.items}</td><td class="r num">${money(b.total)}</td><td class="r num">${money(b.paid)}</td>
        <td class="r num">${left(b) > 0.5 ? `<b>${money(left(b))}</b>` : pill('Paid')}${b.returned ? `<div class="small muted">${money(b.returned)} returned</div>` : ''}</td><td><button type="button" class="btn sm ghost" data-bill="${esc(b.no)}">Items</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No bills yet.</div>'}</div></section>`;
  }

  function render() {
    $$('#tabs [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('#content').innerHTML = tab === 'stock' ? viewStock() : tab === 'cart' ? viewCart() : tab === 'orders' ? viewOrders() : viewBills();
  }
  const refreshList = () => { const el = $('#catList'); if (!el) return render(); const pos = $('#fq') === document.activeElement; render(); if (pos) { const q = $('#fq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } };

  let forced = false;
  function openModal(title, body, foot = '', noClose = false) {
    $('#modalTitle').textContent = title; $('#modalBody').innerHTML = body;
    $('#modalFoot').innerHTML = foot + (noClose ? '' : '<button type="button" class="btn" data-close>Close</button>');
    $('#modalClose').style.display = noClose ? 'none' : '';
    $('#modalBack').classList.add('open');
  }
  const closeModal = () => { if (!forced) $('#modalBack').classList.remove('open'); };
  const pwForm = first => `<form id="pwForm" class="form-grid" novalidate>
        ${first ? '<div class="field full small muted">Welcome! For your security, choose your own password now. Your current password is the one your distributor gave you (usually your mobile number).</div>' : ''}
        <div class="field full"><label for="pwCur">Current password</label><input id="pwCur" type="password" autocomplete="current-password"></div>
        <div class="field full"><label for="pwNew">New password (8+ characters)</label><input id="pwNew" type="password" autocomplete="new-password"></div>
        <div class="field full"><label for="pwNew2">Repeat new password</label><input id="pwNew2" type="password" autocomplete="new-password"></div></form>`;
  // First sign-in with a password set by the distributor: nothing else works until the chemist sets their own
  function forcePassword() {
    forced = true;
    $('.modal').classList.add('sm'); $('.modal').classList.remove('lg');
    openModal('Set your own password', pwForm(true), '<button type="button" class="btn" id="logoutBtn2">Sign out</button><button type="button" class="btn primary" id="pwSave">Save password</button>', true);
    setTimeout(() => $('#pwCur')?.focus(), 50);
  }

  // ---------- Events ----------
  document.addEventListener('click', async e => {
    const t = e.target;
    const tb = t.closest('#tabs [data-tab]');
    if (tb) { tab = tb.dataset.tab; render(); if (tab === 'orders' || tab === 'bills') loadMine(); return; }
    const add = t.closest('[data-add]');
    if (add) {
      const i = itemById(add.dataset.add); const q = Math.floor(Number($(`[data-qty="${CSS.escape(add.dataset.add)}"]`)?.value));
      if (!i) return;
      if (!(q >= 1 && q <= 100000)) { toast('Enter a quantity of 1 or more.'); return; }
      addToCart({ productId: i.id, qty: q });
      toast(i.available >= q ? `${i.name} × ${q} added to cart.` : `${i.name} × ${q} added — the distributor will arrange what is not in stock.`);
      refreshList(); return;
    }
    const rm = t.closest('[data-rm]');
    if (rm) { cart.splice(+rm.dataset.rm, 1); saveCart(); render(); return; }
    if (t.closest('#clearCart')) { if (confirm('Remove everything from the cart?')) { cart = []; saveCart(); render(); } return; }
    if (t.closest('#placeOrder')) {
      if (!cart.length) return;
      const btn = t.closest('#placeOrder'); btn.disabled = true;
      try {
        const o = await api('POST', 'api/portal/orders', { lines: cart, note: $('#orderNote')?.value || '' });
        cart = []; saveCart(); orders.unshift(o); tab = 'orders'; render();
        toast(`Order ${o.id} sent to ${cat.firm.name || 'the distributor'}.`);
      } catch (err) { toast(err.message); btn.disabled = false; }
      return;
    }
    const cn = t.closest('[data-cancel]');
    if (cn) {
      if (!confirm(`Cancel order ${cn.dataset.cancel}?`)) return;
      try { const o = await api('POST', `api/portal/orders/${encodeURIComponent(cn.dataset.cancel)}/cancel`, {}); orders = orders.map(x => x.id === o.id ? o : x); render(); toast('Order cancelled.'); } catch (err) { toast(err.message); }
      return;
    }
    const bl = t.closest('[data-bill]');
    if (bl) {
      const b = bills.find(x => x.no === bl.dataset.bill); if (!b) return;
      openModal(`Bill ${b.no} · ${fmtDate(b.date)}`, `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Batch</th><th>Exp</th><th class="r">Qty</th><th class="r">Free</th><th class="r">Rate</th></tr></thead><tbody>${b.lines.map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.batch)}</td><td>${expTxt(l.expiry)}</td><td class="r">${nf.format(l.qty)}</td><td class="r">${nf.format(l.free || 0)}</td><td class="r">${money(l.rate)}</td></tr>`).join('')}</tbody></table></div><div class="totals"><div class="grand">Net ${money(b.total)}</div></div>`);
      $('.modal').classList.remove('sm'); $('.modal').classList.add('lg');
      return;
    }
    if (t.closest('[data-close]') || t.id === 'modalBack' || t.closest('#modalClose')) { closeModal(); return; }
    if (t.closest('#logoutBtn, #logoutBtn2')) { try { await api('POST', 'api/logout', {}); } catch { /* signed out anyway */ } location.href = 'login.html'; return; }
    if (t.closest('#pwBtn')) {
      $('.modal').classList.add('sm'); $('.modal').classList.remove('lg');
      openModal('Change your password', pwForm(false), '<button type="button" class="btn primary" id="pwSave">Change password</button>');
      return;
    }
    if (t.closest('#pwSave')) {
      const cur = $('#pwCur').value, nw = $('#pwNew').value;
      if (nw !== $('#pwNew2').value) { toast('The new passwords do not match.'); return; }
      try {
        await api('POST', 'api/password', { current: cur, password: nw });
        if (forced) { location.reload(); return; }
        closeModal(); toast('Password changed.');
      } catch (err) { toast(err.message); }
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'fq') { f.q = e.target.value; clearTimeout(document._qt); document._qt = setTimeout(refreshList, 150); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-f]')) { f[t.dataset.f] = t.value; render(); return; }
    if (t.matches('[data-cqty]')) {
      const q = Math.floor(Number(t.value)); const l = cart[+t.dataset.cqty];
      if (l && q >= 1 && q <= 100000) { l.qty = q; saveCart(); render(); } else { toast('Enter a quantity of 1 or more.'); render(); }
    }
  });
  document.addEventListener('submit', e => {
    if (e.target.id !== 'reqForm') return;
    e.preventDefault();
    const name = $('#rName').value.trim(); const q = Math.floor(Number($('#rQty').value));
    if (!name) { toast('Enter the item name.'); $('#rName').focus(); return; }
    if (!(q >= 1)) { toast('Enter a quantity of 1 or more.'); return; }
    addToCart({ productId: '', name, company: $('#rCompany').value.trim(), pack: $('#rPack').value.trim(), qty: q });
    toast(`${name} added to cart as a request.`);
    e.target.reset(); $('#rQty').value = 1;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter' && e.target.closest('#pwForm')) { e.preventDefault(); $('#pwSave')?.click(); }
  });

  async function loadMine() {
    try {
      [orders, bills] = await Promise.all([api('GET', 'api/portal/orders'), api('GET', 'api/portal/bills')]);
      if (tab === 'orders' || tab === 'bills') render();
    } catch (err) { toast(err.message); }
  }

  (async () => {
    try {
      me = await api('GET', 'api/me');
      if (me.role !== 'chemist') { location.href = me.role === 'admin' ? './' : 'login.html'; return; }
      if (me.mustChange) {
        $('#firmName').textContent = me.firm || 'Distributor'; $('#chemName').textContent = me.name; $('#chemUser').textContent = me.username;
        $('#content').innerHTML = '<div class="empty">Set your own password to continue.</div>';
        forcePassword(); return;
      }
      cat = await api('GET', 'api/portal/catalogue');
    } catch (err) { $('#content').innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
    const firm = cat.firm?.name || me.firm || 'Distributor';
    $('#firmName').textContent = firm; $('#brandMark').textContent = firm.trim().charAt(0).toUpperCase();
    $('#chemName').textContent = me.name; $('#chemUser').textContent = me.username;
    document.title = `${firm} · Chemist portal`;
    loadCart();
    // Drop cart lines for items that were removed from the list
    cart = cart.filter(l => !l.productId || itemById(l.productId)); saveCart();
    render(); loadMine();
    setInterval(async () => { try { cat = await api('GET', 'api/portal/catalogue'); if (tab === 'stock' && document.activeElement?.tagName !== 'INPUT') render(); } catch { /* retry later */ } }, 60000);
  })();
})();
