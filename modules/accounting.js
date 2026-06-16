/* ============================================================================
   bifrost · Accounting — the operator books for the Swedish AB "Opulence Tech".
   A premium tabbed control center over the hub `company` edge function
   (window.DB.company). SEK base; moms (VAT) default 25%, per-line 25/12/6/0.

   Everything is keyless: window.DB.company attaches the hub bearer + apikey.
   Books endpoints require an admin (owner) — {forbidden:true} is handled.
   Not-signed-in → {unauthorized:true} → a clean sign-in gate (hub auth).
   Offline → {_offline:true} → graceful note.

   PDFs: window.Faktura.build(invoice,org,customer)->Promise<Uint8Array> and
   window.Faktura.download(...) (assets/faktura.js). All Faktura use is guarded
   so the module degrades gracefully if that asset is not yet loaded.
   ========================================================================== */
(function () {
  const H = window.HELM;

  const ic = (k) => (window.icon ? window.icon(k) : '');

  const TABS = [
    { id: 'overview', label: 'Overview', icon: 'finance' },
    { id: 'invoices', label: 'Invoices', icon: 'fileText' },
    { id: 'bills',    label: 'Bills',    icon: 'download' },
    { id: 'expenses', label: 'Expenses', icon: 'creditCard' },
    { id: 'ledger',   label: 'Ledger',   icon: 'layers' },
    { id: 'export',   label: 'Export',   icon: 'upload' }
  ];

  let active = 'overview';
  let rootEl = null;

  /* ── helpers ──────────────────────────────────────────────────────────── */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0);
  const sek = (n, cur) => {
    if (n == null || n === '') return '—';
    const c = cur || 'SEK';
    const v = Number(n).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return c === 'SEK' ? v + ' kr' : v + ' ' + c;
  };
  const sek0 = (n) => (n == null || n === '') ? '—' : Number(n).toLocaleString('sv-SE', { maximumFractionDigits: 0 }) + ' kr';
  const when = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: '2-digit' }); };
  const today = () => new Date().toISOString().slice(0, 10);
  const thisMonth = () => new Date().toISOString().slice(0, 7);
  const thisYear = () => String(new Date().getFullYear());
  const addDays = (iso, days) => { const d = new Date(iso || today()); d.setDate(d.getDate() + Number(days || 0)); return d.toISOString().slice(0, 10); };
  const DBok = () => !!(window.DB && window.DB.company);
  const hasFaktura = () => !!(window.Faktura && typeof window.Faktura.build === 'function');

  // wrap DB.company → on unauthorized open the sign-in gate
  async function api(path, opts) {
    if (!DBok()) return { ok: false, _offline: true };
    const r = await window.DB.company(path, opts || {});
    if (r && (r.unauthorized || r.forbidden)) openSignIn();
    return r || { ok: false, _offline: true };
  }

  const VAT_RATES = [25, 12, 6, 0];
  const STATUS_CHIP = {
    draft: '', sent: 'info', paid: 'ok', overdue: 'warn', void: 'bad', voided: 'bad',
    unpaid: 'warn', partial: 'info', registered: 'info'
  };
  const chip = (status) => `<span class="acc-chip ${STATUS_CHIP[status] || ''}">${esc(status || '—')}</span>`;

  // a sale/bill is "open" (counts toward AR/AP) when sent/unpaid/partial/overdue
  const isOpen = (s) => ['sent', 'overdue', 'unpaid', 'partial', 'registered'].includes(s);

  /* ── Uint8Array → base64 (for PDF upload) ─────────────────────────────── */
  function bytesToB64(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  function fileToB64(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
      fr.onerror = () => reject(fr.error || new Error('read failed'));
      fr.readAsDataURL(file);
    });
  }

  /* ── auth chip / sign-in gate (hub auth, mirrors nft-site) ────────────── */
  async function updateAuthChip(root) {
    const el = (root || rootEl || document).querySelector('#acc-auth'); if (!el) return;
    let u = null; try { u = window.DB && window.DB.auth ? await window.DB.auth.getUser() : null; } catch (e) {}
    if (u && u.email) {
      el.innerHTML = ic('check') + ' ' + esc(u.email.split('@')[0]); el.classList.remove('off');
      el.onclick = async () => { try { await window.DB.auth.signOut(); } catch (e) {} H.toast('Signed out', 'info'); updateAuthChip(); paint(); };
    } else {
      el.innerHTML = ic('lock') + ' sign in'; el.classList.add('off');
      el.onclick = () => openSignIn();
    }
  }

  function openSignIn() {
    if (document.querySelector('.acc-modal.signin')) return;
    const ov = document.createElement('div'); ov.className = 'acc-modal signin open';
    ov.innerHTML = `
      <div class="acc-modal-box">
        <div class="acc-modal-head"><b>${ic('lock')} Sign in to the books</b><button class="acc-modal-x" data-x>${ic('close')}</button></div>
        <div class="acc-modal-body">
          <p class="acc-muted" style="margin:0">Sign in with your admin email to manage Opulence Tech's accounting. One-time — just your email, no keys.</p>
          <div class="acc-field"><label>Email</label><input class="acc-in" id="acc-si-email" type="email" value="arivd.arvidsson@gmail.com"/></div>
          <div class="acc-field"><label>Password</label><input class="acc-in" id="acc-si-pass" type="password" placeholder="password"/></div>
          <button class="acc-btn" id="acc-si-go" style="width:100%">Sign in</button>
          <button class="acc-mini" id="acc-si-magic" style="width:100%">Email me a magic link instead</button>
          <div class="acc-muted" id="acc-si-msg"></div>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector('[data-x]').addEventListener('click', close);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    const msg = ov.querySelector('#acc-si-msg');
    ov.querySelector('#acc-si-go').addEventListener('click', async () => {
      const email = ov.querySelector('#acc-si-email').value.trim(), pass = ov.querySelector('#acc-si-pass').value;
      if (!email || !pass) { msg.textContent = 'Enter email + password.'; return; }
      msg.textContent = 'Signing in…';
      try {
        const r = await window.DB.auth.signInPassword(email, pass);
        if (r && r.error) { msg.textContent = r.error.message; return; }
        H.toast('Signed in', 'success'); close(); updateAuthChip(); paint();
      } catch (e) { msg.textContent = e.message; }
    });
    ov.querySelector('#acc-si-magic').addEventListener('click', async () => {
      const email = ov.querySelector('#acc-si-email').value.trim(); if (!email) { msg.textContent = 'Enter your email first.'; return; }
      try { const r = await window.DB.auth.signInMagicLink(email); msg.textContent = (r && r.error) ? r.error.message : 'Magic link sent — open it, then return here.'; }
      catch (e) { msg.textContent = e.message; }
    });
  }

  // gate: returns true if there is a hub session, else paints the sign-in state.
  async function gate(body) {
    let token = null;
    try { const s = window.DB && window.DB.auth ? await window.DB.auth.getSession() : null; token = s && s.access_token; } catch (e) {}
    if (token) return true;
    body.innerHTML = `
      <div class="acc-gate">
        <div class="g-mark">${ic('finance')}</div>
        <h3>Sign in to manage the books</h3>
        <p>Accounting is admin-only. Sign in with your owner email to view invoices, bills, the ledger and run month-end.</p>
        <button class="acc-btn" data-si>${ic('lock')} Sign in</button>
      </div>`;
    const b = body.querySelector('[data-si]'); if (b) b.onclick = () => openSignIn();
    return false;
  }

  // shared {forbidden}/{_offline}/{error} renderer for a failed call
  function failNote(r) {
    if (!r || r._offline) return `<div class="acc-note">${ic('alertTriangle')} Offline — the books run against the live hub edge function. Check your connection.</div>`;
    if (r.forbidden) return `<div class="acc-warn">${ic('lock')} Admins only — your account isn't an owner of Opulence Tech's books.</div>`;
    if (r.unauthorized) return `<div class="acc-warn">${ic('lock')} Session expired — sign in again to continue.</div>`;
    return `<div class="acc-warn">${esc(r.error || 'Could not load.')}</div>`;
  }

  /* ── modal kit ────────────────────────────────────────────────────────── */
  function modal(title, opts) {
    opts = opts || {};
    const ov = document.createElement('div'); ov.className = 'acc-modal open';
    ov.innerHTML = `
      <div class="acc-modal-box${opts.sm ? ' sm' : ''}">
        <div class="acc-modal-head"><b>${esc(title)}</b><button class="acc-modal-x" data-x>${ic('close')}</button></div>
        <div class="acc-modal-body"></div>
        <div class="acc-modal-foot"><span class="msg"></span><div class="acc-actions"></div></div>
      </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector('[data-x]').addEventListener('click', close);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape' && document.body.contains(ov)) { close(); document.removeEventListener('keydown', onEsc); } });
    return {
      el: ov,
      body: ov.querySelector('.acc-modal-body'),
      foot: ov.querySelector('.acc-actions'),
      msg: (t) => { ov.querySelector('.acc-modal-foot .msg').textContent = t || ''; },
      close
    };
  }

  /* ====================================================================== */
  /* RENDER SHELL                                                           */
  /* ====================================================================== */
  function render(root) {
    rootEl = root;
    root.innerHTML = `
      <div class="accounting">
        <header class="acc-head">
          <div class="acc-headmain">
            <h1 class="acc-title">Accounting
              <span class="acc-live" id="acc-live">live</span>
              <span class="acc-live off auth" id="acc-auth" style="cursor:pointer">${ic('lock')} sign in</span>
            </h1>
            <p class="acc-sub">The books for <b>Opulence Tech AB</b> · SEK · moms (VAT) 25% default — fakturor, leverantörsfakturor, utgifter, verifikat &amp; export. <span class="acc-brandchip"><b>bifrost</b> · the bridge</span></p>
          </div>
        </header>
        <nav class="acc-tabs">
          ${TABS.map(t => `<button class="acc-tab${t.id === active ? ' active' : ''}" data-tab="${t.id}"><span class="acc-tab-ico">${ic(t.icon)}</span>${t.label}</button>`).join('')}
        </nav>
        <div class="acc-body" id="acc-body"></div>
      </div>`;

    root.querySelectorAll('.acc-tab').forEach(b => b.addEventListener('click', () => {
      active = b.dataset.tab;
      root.querySelectorAll('.acc-tab').forEach(x => x.classList.toggle('active', x === b));
      paint();
    }));

    if (!DBok()) { const live = root.querySelector('#acc-live'); if (live) { live.textContent = 'offline'; live.classList.add('off'); } }
    updateAuthChip(root);
    paint();
  }

  async function paint() {
    const body = rootEl && rootEl.querySelector('#acc-body'); if (!body) return;
    if (!DBok()) { body.innerHTML = `<div class="acc-note">${ic('alertTriangle')} The live data layer is offline — ensure assets/data.js and the Supabase script loaded (needs network).</div>`; return; }
    if (!(await gate(body))) return;
    body.innerHTML = `<div class="acc-loading"><span class="acc-spin"></span> Loading…</div>`;
    try {
      if (active === 'overview') return void await paintOverview(body);
      if (active === 'invoices') return void await paintInvoices(body);
      if (active === 'bills')    return void await paintBills(body);
      if (active === 'expenses') return void await paintExpenses(body);
      if (active === 'ledger')   return void await paintLedger(body);
      if (active === 'export')   return void await paintExport(body);
    } catch (e) { body.innerHTML = `<div class="acc-warn">Failed to load: ${esc(e.message)}</div>`; }
  }

  /* ====================================================================== */
  /* 1) OVERVIEW                                                            */
  /* ====================================================================== */
  async function paintOverview(body) {
    const period = thisMonth();
    const [led, pay, inv, bill] = await Promise.all([
      api('ledger?period=' + period),
      api('payments'),
      api('invoices'),
      api('bills')
    ]);
    if (led && !led.ok && (led.forbidden || led.unauthorized || led._offline)) { body.innerHTML = failNote(led); return; }

    const result = (led && led.result) || {};
    const revenue = num(result.revenue);
    const costs = num(result.costs);
    const profit = result.profit != null ? num(result.profit) : (revenue - costs);

    // moms position from the ledger accounts (Swedish BAS: 2610-2650 output VAT, 2640 input VAT).
    let outVat = 0, inVat = 0;
    (led && led.accounts || []).forEach(a => {
      const acct = String(a.account || '');
      const bal = num(a.balance);
      if (/^26(1|2|3|5)/.test(acct)) outVat += -bal;        // output VAT (moms på försäljning), credit-normal
      else if (/^264/.test(acct)) inVat += bal;              // input VAT (ingående moms), debit-normal
    });
    const momsNet = outVat - inVat; // >0 = pay to Skatteverket, <0 = reclaim

    const payt = (pay && pay.totals) || {};
    const cashIn = num(payt.in), cashOut = num(payt.out);

    // AR = open customer invoices; AP = unpaid bills
    const invRows = (inv && inv.rows) || [];
    const billRows = (bill && bill.rows) || [];
    const ar = invRows.filter(r => isOpen(r.status)).reduce((a, r) => a + num(r.gross), 0);
    const ap = billRows.filter(r => isOpen(r.status)).reduce((a, r) => a + num(r.gross), 0);

    // simple aging on AR
    const buckets = agingBuckets(invRows);
    const apBuckets = agingBuckets(billRows);

    // 6-month revenue vs expense chart (from monthly ledger pulls)
    const months = lastMonths(6);
    const series = await Promise.all(months.map(m => api('ledger?period=' + m)));
    const rev = series.map(s => num(s && s.result && s.result.revenue));
    const exp = series.map(s => num(s && s.result && s.result.costs));
    const labels = months.map(m => new Date(m + '-01').toLocaleDateString('en-GB', { month: 'short' }));
    const chartSvg = H.charts.area(rev, { v2: exp, labels, height: 200, fmt: 'num' });

    const kpi = (k, l, sub, cls) => `<div class="acc-kpi${cls ? ' ' + cls : ''}"><span class="k${cls === 'pos' ? ' pos' : cls === 'neg' ? ' neg' : ''}">${k}</span><span class="l">${esc(l)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</div>`;

    body.innerHTML = `
      <div class="acc-kpis wide">
        ${kpi(sek0(revenue), 'Revenue', 'this month', 'pos')}
        ${kpi(sek0(costs), 'Expenses', 'this month', 'warnaccent')}
        ${kpi(sek0(profit), 'Result', 'revenue − costs', profit >= 0 ? 'pos' : 'neg')}
        ${kpi(sek0(Math.abs(momsNet)), momsNet >= 0 ? 'Moms to pay' : 'Moms to reclaim', momsNet >= 0 ? 'owed to Skatteverket' : 'refund due', momsNet >= 0 ? 'warnaccent' : 'pos')}
        ${kpi(sek0(cashIn), 'Cash in', 'payments received')}
        ${kpi(sek0(cashOut), 'Cash out', 'payments made')}
        ${kpi(sek0(cashIn - cashOut), 'Net cash', 'in − out', (cashIn - cashOut) >= 0 ? 'pos' : 'neg')}
      </div>

      <div class="acc-grid2">
        <section class="acc-panel">
          <h3>Revenue vs expenses <span class="acc-muted">— last 6 months</span></h3>
          <div class="acc-chartwrap">${chartSvg}
            <div class="acc-legend"><span><i style="background:var(--accent1)"></i>Revenue</span><span><i style="background:var(--accent3)"></i>Expenses</span></div>
          </div>
        </section>
        <section class="acc-panel">
          <h3>Receivables &amp; payables</h3>
          <div class="acc-kpis" style="grid-template-columns:1fr 1fr;margin-bottom:16px">
            ${kpi(sek0(ar), 'AR — owed to us', invRows.filter(r => isOpen(r.status)).length + ' open invoice(s)')}
            ${kpi(sek0(ap), 'AP — we owe', billRows.filter(r => isOpen(r.status)).length + ' unpaid bill(s)')}
          </div>
          <h3 style="font-size:13px">AR aging</h3>
          ${agingHTML(buckets, ar)}
          <h3 style="font-size:13px;margin-top:14px">AP aging</h3>
          ${agingHTML(apBuckets, ap, true)}
        </section>
      </div>`;
  }

  function agingBuckets(rows) {
    const b = { current: 0, d30: 0, d60: 0, d90: 0 };
    const now = Date.now();
    rows.filter(r => isOpen(r.status)).forEach(r => {
      const due = r.due_date ? new Date(r.due_date).getTime() : now;
      const over = Math.floor((now - due) / 86400000);
      const g = num(r.gross);
      if (over <= 0) b.current += g;
      else if (over <= 30) b.d30 += g;
      else if (over <= 60) b.d60 += g;
      else b.d90 += g;
    });
    return b;
  }
  function agingHTML(b, total, dueStyle) {
    const t = total || (b.current + b.d30 + b.d60 + b.d90) || 1;
    const row = (lbl, v, isDue) => `
      <div class="acc-aging-row${isDue ? ' due' : ''}">
        <span class="lbl">${esc(lbl)}</span>
        <span class="track"><span class="fill" style="width:${Math.max(0, Math.min(100, (v / t) * 100)).toFixed(1)}%"></span></span>
        <span class="amt">${sek0(v)}</span>
      </div>`;
    return `<div class="acc-aging">
      ${row('Not due', b.current, false)}
      ${row('1–30 d', b.d30, true)}
      ${row('31–60 d', b.d60, true)}
      ${row('60 d +', b.d90, true)}
    </div>`;
  }
  function lastMonths(n) {
    const out = []; const d = new Date(); d.setDate(1);
    for (let i = n - 1; i >= 0; i--) { const m = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(m.toISOString().slice(0, 7)); }
    return out;
  }

  /* ====================================================================== */
  /* 2) INVOICES                                                           */
  /* ====================================================================== */
  async function paintInvoices(body) {
    const r = await api('invoices');
    if (!r || !r.ok) { body.innerHTML = failNote(r); return; }
    const rows = r.rows || [];
    const t = r.totals || {};
    const now = Date.now();
    // derive overdue display for sent+past-due
    const dispStatus = (row) => (row.status === 'sent' && row.due_date && new Date(row.due_date).getTime() < now) ? 'overdue' : row.status;

    const tr = rows.map(row => {
      const st = dispStatus(row);
      const isDraft = row.status === 'draft';
      const remaining = num(row.gross) - num(row.paid);
      const acts = [];
      acts.push(`<button class="acc-mini" data-inv-preview="${esc(row.id)}">Preview PDF</button>`);
      if (isDraft) acts.push(`<button class="acc-mini go" data-inv-send="${esc(row.id)}">Send</button>`);
      if (isDraft) acts.push(`<button class="acc-mini" data-inv-edit="${esc(row.id)}">Edit</button>`);
      if (!isDraft && row.status !== 'paid' && row.status !== 'void' && row.status !== 'voided') acts.push(`<button class="acc-mini go" data-inv-paid="${esc(row.id)}" data-remaining="${remaining}">Mark paid</button>`);
      if (!isDraft) acts.push(`<button class="acc-mini" data-inv-pdf="${esc(row.id)}">View PDF</button>`);
      if (isDraft) acts.push(`<button class="acc-mini danger" data-inv-del="${esc(row.id)}">Delete</button>`);
      else if (row.status !== 'void' && row.status !== 'voided') acts.push(`<button class="acc-mini danger" data-inv-void="${esc(row.id)}">Void</button>`);
      return `<tr>
        <td class="acc-mono">${row.number ? esc(row.number) : '<span class="acc-muted">draft</span>'}</td>
        <td>${esc(row.customer_name || '—')}</td>
        <td>${when(row.issue_date)}</td>
        <td>${when(row.due_date)}</td>
        <td class="num">${sek(row.net, row.currency)}</td>
        <td class="num">${sek(row.vat, row.currency)}</td>
        <td class="num"><b>${sek(row.gross, row.currency)}</b></td>
        <td>${chip(st)}</td>
        <td><div class="acc-actions">${acts.join('')}</div></td>
      </tr>`;
    }).join('') || `<tr><td colspan="9" class="acc-muted">No invoices yet — create your first with “New invoice”.</td></tr>`;

    const bs = t.by_status || {};
    body.innerHTML = `
      <div class="acc-kpis">
        <div class="acc-kpi"><span class="k">${sek0(t.net)}</span><span class="l">Net (all)</span></div>
        <div class="acc-kpi"><span class="k">${sek0(t.vat)}</span><span class="l">Moms (all)</span></div>
        <div class="acc-kpi pos"><span class="k pos">${sek0(t.gross)}</span><span class="l">Gross (all)</span></div>
        <div class="acc-kpi"><span class="k">${Object.keys(bs).map(k => (bs[k] || 0)).reduce((a, b) => a + b, 0) || rows.length}</span><span class="l">Invoices</span></div>
      </div>
      <section class="acc-panel">
        <div class="acc-panel-head">
          <h3>Invoices <span class="acc-muted">fakturor · ${rows.length}</span></h3>
          <button class="acc-btn" id="acc-new-inv">${ic('plus')} New invoice</button>
        </div>
        <div class="acc-tablewrap">
          <table class="acc-table">
            <thead><tr><th>Number</th><th>Customer</th><th>Issued</th><th>Due</th><th class="num">Net</th><th class="num">Moms</th><th class="num">Gross</th><th>Status</th><th></th></tr></thead>
            <tbody>${tr}</tbody>
          </table>
        </div>
      </section>`;

    body.querySelector('#acc-new-inv').addEventListener('click', () => openInvoiceComposer(null, body));
    body.querySelectorAll('[data-inv-edit]').forEach(b => b.addEventListener('click', () => openInvoiceComposer(b.dataset.invEdit, body)));
    body.querySelectorAll('[data-inv-preview]').forEach(b => b.addEventListener('click', () => previewInvoicePDF(b.dataset.invPreview)));
    body.querySelectorAll('[data-inv-send]').forEach(b => b.addEventListener('click', () => sendInvoice(b.dataset.invSend, body)));
    body.querySelectorAll('[data-inv-paid]').forEach(b => b.addEventListener('click', () => openMarkPaidInvoice(b.dataset.invPaid, num(b.dataset.remaining), body)));
    body.querySelectorAll('[data-inv-pdf]').forEach(b => b.addEventListener('click', () => downloadStoredPDF(b.dataset.invPdf)));
    body.querySelectorAll('[data-inv-void]').forEach(b => b.addEventListener('click', () => voidInvoice(b.dataset.invVoid, body)));
    body.querySelectorAll('[data-inv-del]').forEach(b => b.addEventListener('click', () => deleteInvoice(b.dataset.invDel, body)));
  }

  // ── invoice composer modal (create OR edit draft) ──
  async function openInvoiceComposer(invoiceId, body) {
    const m = modal(invoiceId ? 'Edit invoice (draft)' : 'New invoice');
    m.body.innerHTML = `<div class="acc-loading"><span class="acc-spin"></span> Loading customers…</div>`;

    const [custRes, existing, prof] = await Promise.all([
      api('customers'),
      invoiceId ? api('invoices/' + invoiceId) : Promise.resolve(null),
      api('billing-profile')
    ]);
    const customers = (custRes && custRes.rows) || [];
    const settings = (prof && prof.org && prof.org.settings) || {};
    const defaultTerms = num(settings.payment_terms_days) || 30;

    const inv = existing && existing.invoice;
    const lines = (existing && existing.lines && existing.lines.length)
      ? existing.lines.map(l => ({ description: l.description, qty: l.qty, unit_price: l.unit_price, vat_rate: l.vat_rate }))
      : [{ description: '', qty: 1, unit_price: '', vat_rate: 25 }];

    const custOpts = customers.map(c => `<option value="${esc(c.id)}"${inv && inv.customer_id === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('');

    m.body.innerHTML = `
      <div class="acc-modal-grid two">
        <div class="acc-form">
          <div class="acc-field">
            <label>Customer</label>
            <div class="acc-row" style="gap:8px">
              <select class="acc-in" id="iv-cust" style="flex:1 1 auto"><option value="">Select customer…</option>${custOpts}</select>
              <button class="acc-mini" id="iv-quickcust" style="flex:none;height:38px">${ic('plus')} New</button>
            </div>
          </div>
          <div class="acc-row">
            <div class="acc-field"><label>Currency</label>
              <select class="acc-in" id="iv-cur">
                ${['SEK', 'EUR', 'USD'].map(c => `<option${(inv ? inv.currency : 'SEK') === c ? ' selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
            <div class="acc-field"><label>Issue date</label><input class="acc-in" id="iv-issue" type="date" value="${esc(inv && inv.issue_date ? inv.issue_date.slice(0, 10) : today())}"/></div>
            <div class="acc-field"><label>Terms (days)</label><input class="acc-in" id="iv-terms" type="number" min="0" value="${inv && inv.payment_terms_days != null ? esc(inv.payment_terms_days) : defaultTerms}"/></div>
          </div>
          <div class="acc-row">
            <div class="acc-field"><label>Our reference</label><input class="acc-in" id="iv-ourref" value="${esc(inv && inv.our_reference || '')}" placeholder="e.g. Arvid"/></div>
            <div class="acc-field"><label>Your reference</label><input class="acc-in" id="iv-yourref" value="${esc(inv && inv.your_reference || '')}"/></div>
          </div>

          <div class="acc-sep"></div>
          <div class="acc-line-head"><span>Description</span><span>Qty</span><span>Unit price</span><span>Moms</span><span></span></div>
          <div class="acc-lines" id="iv-lines"></div>
          <button class="acc-mini" id="iv-addline" style="align-self:flex-start">${ic('plus')} Add line</button>

          <div class="acc-field"><label>Notes</label><textarea class="acc-in" id="iv-notes" placeholder="Optional note on the invoice">${esc(inv && inv.notes || '')}</textarea></div>
        </div>
        <div class="acc-totals" id="iv-totals"></div>
      </div>`;

    const linesHost = m.body.querySelector('#iv-lines');
    function lineRow(l) {
      const row = document.createElement('div'); row.className = 'acc-line';
      row.innerHTML = `
        <input class="acc-in l-desc" placeholder="Description" value="${esc(l.description || '')}"/>
        <input class="acc-in l-qty" type="number" step="any" min="0" value="${l.qty != null ? esc(l.qty) : 1}"/>
        <input class="acc-in l-price" type="number" step="any" placeholder="0.00" value="${l.unit_price != null ? esc(l.unit_price) : ''}"/>
        <select class="acc-in l-vat">${VAT_RATES.map(v => `<option value="${v}"${Number(l.vat_rate) === v ? ' selected' : ''}>${v}%</option>`).join('')}</select>
        <button class="acc-line-x" title="Remove line">${ic('close')}</button>`;
      row.querySelector('.acc-line-x').addEventListener('click', () => { row.remove(); recalc(); });
      row.querySelectorAll('input,select').forEach(i => i.addEventListener('input', recalc));
      return row;
    }
    lines.forEach(l => linesHost.appendChild(lineRow(l)));
    m.body.querySelector('#iv-addline').addEventListener('click', () => { linesHost.appendChild(lineRow({ description: '', qty: 1, unit_price: '', vat_rate: 25 })); recalc(); });

    function readLines() {
      return Array.from(linesHost.querySelectorAll('.acc-line')).map(r => ({
        description: r.querySelector('.l-desc').value.trim(),
        qty: num(r.querySelector('.l-qty').value),
        unit_price: num(r.querySelector('.l-price').value),
        vat_rate: Number(r.querySelector('.l-vat').value)
      }));
    }
    function recalc() {
      const cur = m.body.querySelector('#iv-cur').value;
      const ls = readLines();
      let net = 0; const byRate = {};
      ls.forEach(l => { const n = l.qty * l.unit_price; net += n; byRate[l.vat_rate] = (byRate[l.vat_rate] || 0) + n * l.vat_rate / 100; });
      const vat = Object.values(byRate).reduce((a, b) => a + b, 0);
      const gross = net + vat;
      const ratesHtml = Object.keys(byRate).sort((a, b) => b - a).filter(r => byRate[r] > 0)
        .map(r => `<div class="row"><span>Moms ${r}%</span><b>${sek(byRate[r], cur)}</b></div>`).join('');
      m.body.querySelector('#iv-totals').innerHTML = `
        <div class="row"><span>Net</span><b>${sek(net, cur)}</b></div>
        ${ratesHtml || `<div class="row"><span>Moms</span><b>${sek(0, cur)}</b></div>`}
        <div class="row gross"><span>Total (gross)</span><b>${sek(gross, cur)}</b></div>`;
    }
    recalc();

    m.body.querySelector('#iv-quickcust').addEventListener('click', () => openQuickCustomer(m.body.querySelector('#iv-cust')));

    m.foot.innerHTML = `<button class="acc-mini" data-cancel>Cancel</button><button class="acc-btn" data-save>${invoiceId ? 'Save draft' : 'Create draft'}</button>`;
    m.foot.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.foot.querySelector('[data-save]').addEventListener('click', async () => {
      const customer_id = m.body.querySelector('#iv-cust').value;
      if (!customer_id) return m.msg('Pick a customer first.');
      const ls = readLines().filter(l => l.description || l.unit_price);
      if (!ls.length) return m.msg('Add at least one line.');
      m.msg('Saving…');
      const issue = m.body.querySelector('#iv-issue').value || today();
      const terms = num(m.body.querySelector('#iv-terms').value);
      const payload = {
        customer_id,
        currency: m.body.querySelector('#iv-cur').value || 'SEK',
        issue_date: issue,
        due_date: addDays(issue, terms),
        payment_terms_days: terms,
        our_reference: m.body.querySelector('#iv-ourref').value.trim() || undefined,
        your_reference: m.body.querySelector('#iv-yourref').value.trim() || undefined,
        notes: m.body.querySelector('#iv-notes').value.trim() || undefined,
        lines: ls
      };
      const res = invoiceId
        ? await api('invoices/' + invoiceId, { method: 'PUT', body: payload })
        : await api('invoices', { method: 'POST', body: payload });
      if (res && res.ok) { H.toast(invoiceId ? 'Draft saved' : 'Draft created', 'success'); m.close(); paintInvoices(body); }
      else m.msg(res && res.error ? res.error : (res && res.forbidden ? 'Admins only.' : 'Save failed.'));
    });
  }

  // quick-add a customer inline; appends + selects it in the given <select>
  function openQuickCustomer(selectEl) {
    const m = modal('New customer', { sm: true });
    m.body.innerHTML = `
      <div class="acc-field"><label>Name *</label><input class="acc-in" id="qc-name" placeholder="Company or person"/></div>
      <div class="acc-row">
        <div class="acc-field"><label>Org no</label><input class="acc-in" id="qc-org"/></div>
        <div class="acc-field"><label>VAT no</label><input class="acc-in" id="qc-vat"/></div>
      </div>
      <div class="acc-field"><label>Email</label><input class="acc-in" id="qc-email" type="email"/></div>
      <div class="acc-field"><label>Address</label><textarea class="acc-in" id="qc-addr"></textarea></div>
      <div class="acc-field"><label>Currency</label><select class="acc-in" id="qc-cur"><option>SEK</option><option>EUR</option><option>USD</option></select></div>`;
    m.foot.innerHTML = `<button class="acc-mini" data-cancel>Cancel</button><button class="acc-btn" data-save>Create customer</button>`;
    m.foot.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.foot.querySelector('[data-save]').addEventListener('click', async () => {
      const name = m.body.querySelector('#qc-name').value.trim();
      if (!name) return m.msg('Name is required.');
      m.msg('Creating…');
      const res = await api('customers', { method: 'POST', body: {
        name,
        org_no: m.body.querySelector('#qc-org').value.trim() || undefined,
        vat_no: m.body.querySelector('#qc-vat').value.trim() || undefined,
        email: m.body.querySelector('#qc-email').value.trim() || undefined,
        address: m.body.querySelector('#qc-addr').value.trim() || undefined,
        currency: m.body.querySelector('#qc-cur').value || 'SEK'
      }});
      if (res && res.ok) {
        const c = res.customer || res.row || res;
        const id = c.id || (res.customer && res.customer.id);
        if (selectEl && id) {
          const opt = document.createElement('option'); opt.value = id; opt.textContent = name; opt.selected = true;
          selectEl.appendChild(opt);
        }
        H.toast('Customer created', 'success'); m.close();
      } else m.msg(res && res.error ? res.error : 'Create failed.');
    });
  }

  // build the full invoice payload Faktura needs from invoices/<id> + billing-profile
  async function loadInvoiceBundle(invoiceId) {
    const [full, prof] = await Promise.all([api('invoices/' + invoiceId), api('billing-profile')]);
    if (!full || !full.ok) throw new Error((full && full.error) || 'Could not load invoice');
    const invoice = Object.assign({}, full.invoice, { lines: full.lines || [], payments: full.payments || [] });
    return { invoice, org: (prof && prof.org) || {}, customer: full.customer || {} };
  }

  // upload signed/built PDF bytes back to the invoice (stored as its PDF)
  async function saveInvoicePDF(invoiceId, bytes) {
    const b64 = bytesToB64(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    return api('invoices/' + invoiceId + '/pdf', { method: 'POST', body: { base64: b64 } });
  }
  // open our signing tool on these bytes; on save, store the signed PDF on the invoice
  function signInvoiceBytes(invoiceId, bytes, number, viewer) {
    if (!window.PdfSign) { H.toast('Signer not loaded', 'warn'); return; }
    window.PdfSign.openSigner(bytes, {
      title: 'Sign faktura ' + (number || ''),
      fileName: 'Faktura-' + (number || 'utkast') + '.pdf',
      saveLabel: 'Save signed to invoice',
      onSave: async (signed) => {
        const r = await saveInvoicePDF(invoiceId, signed);
        if (r && r.ok) { if (viewer && viewer.setBytes) viewer.setBytes(signed); H.toast('Signed PDF saved to the invoice', 'success'); }
        else H.toast('Signed, but saving failed: ' + ((r && r.error) || 'error'), 'warn');
      }
    });
  }

  // Review = VIEW the PDF in-site (not download). Build it fresh, open the viewer.
  async function previewInvoicePDF(invoiceId) {
    if (!hasFaktura()) { H.toast('PDF engine (faktura.js) not loaded yet', 'warn'); return; }
    if (!window.PdfView) { H.toast('Viewer not loaded', 'warn'); return; }
    H.toast('Building PDF…', 'info');
    try {
      const { invoice, org, customer } = await loadInvoiceBundle(invoiceId);
      const bytes = await window.Faktura.build(invoice, org, customer);
      const number = invoice.number || 'utkast';
      window.PdfView.open({
        bytes, title: 'Faktura ' + number, fileName: 'Faktura-' + number + '.pdf',
        onSign: (curBytes, viewer) => signInvoiceBytes(invoiceId, curBytes, invoice.number, viewer)
      });
    } catch (e) { H.toast('Preview failed: ' + e.message, 'danger'); }
  }

  // Send: assigns number + posts the issue voucher, THEN builds the PDF with the
  // now-assigned number and uploads it (base64) so the stored PDF is correct.
  async function sendInvoice(invoiceId, body) {
    const m = modal('Send invoice', { sm: true });
    m.body.innerHTML = `<p class="acc-muted" style="margin:0">Sending assigns the next invoice number, posts the issue voucher to the ledger, then generates and stores the final PDF. This cannot be undone (you can later Void).</p>`;
    m.foot.innerHTML = `<button class="acc-mini" data-cancel>Cancel</button><button class="acc-btn" data-go>Send invoice</button>`;
    m.foot.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.foot.querySelector('[data-go]').addEventListener('click', async () => {
      m.msg('Assigning number…');
      const sent = await api('invoices/' + invoiceId + '/send', { method: 'POST' });
      if (!sent || !sent.ok) { m.msg(sent && sent.error ? sent.error : 'Send failed.'); return; }
      H.toast('Invoice ' + (sent.invoice && sent.invoice.number ? '#' + sent.invoice.number : '') + ' sent', 'success');
      // Build + store the PDF now the number exists (best-effort; non-fatal).
      if (hasFaktura()) {
        try {
          m.msg('Building & storing PDF…');
          const { invoice, org, customer } = await loadInvoiceBundle(invoiceId);
          const bytes = await window.Faktura.build(invoice, org, customer);
          const b64 = bytesToB64(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
          await api('invoices/' + invoiceId + '/pdf', { method: 'POST', body: { base64: b64 } });
        } catch (e) { H.toast('Sent, but PDF storage failed: ' + e.message, 'warn'); }
      }
      m.close(); paintInvoices(body);
    });
  }

  async function downloadStoredPDF(invoiceId) {
    H.toast('Fetching PDF…', 'info');
    const r = await api('invoices/' + invoiceId + '/pdf');
    if (r && r.ok && r.pdf_url) {
      if (window.PdfView) window.PdfView.open({ url: r.pdf_url, title: 'Faktura (lagrad)', fileName: 'Faktura.pdf' });
      else window.open(r.pdf_url, '_blank', 'noopener');
    }
    else if (hasFaktura()) { previewInvoicePDF(invoiceId); }  // fall back to a fresh build
    else H.toast(r && r.error ? r.error : 'No stored PDF — view Preview to build one.', 'warn');
  }

  function openMarkPaidInvoice(invoiceId, remaining, body) {
    const m = modal('Mark invoice paid', { sm: true });
    m.body.innerHTML = `
      <div class="acc-field"><label>Amount received</label><input class="acc-in" id="mp-amt" type="number" step="any" value="${remaining > 0 ? remaining : ''}"/></div>
      <div class="acc-field"><label>Paid date</label><input class="acc-in" id="mp-date" type="date" value="${today()}"/></div>
      <div class="acc-row">
        <div class="acc-field"><label>Method</label><select class="acc-in" id="mp-method"><option value="bank">Bank transfer</option><option value="card">Card</option><option value="cash">Cash</option><option value="swish">Swish</option><option value="other">Other</option></select></div>
        <div class="acc-field"><label>Reference</label><input class="acc-in" id="mp-ref" placeholder="OCR / note"/></div>
      </div>
      <p class="acc-muted" style="margin:0">Partial payments are supported — enter less than the remaining ${sek0(remaining)} to record a partial.</p>`;
    m.foot.innerHTML = `<button class="acc-mini" data-cancel>Cancel</button><button class="acc-btn" data-go>Record payment</button>`;
    m.foot.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.foot.querySelector('[data-go]').addEventListener('click', async () => {
      m.msg('Recording…');
      const res = await api('invoices/' + invoiceId + '/mark-paid', { method: 'POST', body: {
        amount: num(m.body.querySelector('#mp-amt').value) || undefined,
        paid_at: m.body.querySelector('#mp-date').value || undefined,
        method: m.body.querySelector('#mp-method').value,
        reference: m.body.querySelector('#mp-ref').value.trim() || undefined
      }});
      if (res && res.ok) { H.toast('Payment recorded', 'success'); try { H._internal && H._internal.fireMoney && H._internal.fireMoney(); } catch (e) {} m.close(); paintInvoices(body); }
      else m.msg(res && res.error ? res.error : 'Failed.');
    });
  }

  function voidInvoice(invoiceId, body) {
    const m = modal('Void invoice', { sm: true });
    m.body.innerHTML = `<p class="acc-muted" style="margin:0">Voiding reverses the invoice with a credit voucher. Provide a reason for the audit trail.</p>
      <div class="acc-field"><label>Reason</label><input class="acc-in" id="vd-reason" placeholder="e.g. issued in error"/></div>`;
    m.foot.innerHTML = `<button class="acc-mini" data-cancel>Cancel</button><button class="acc-btn danger" data-go>Void invoice</button>`;
    m.foot.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.foot.querySelector('[data-go]').addEventListener('click', async () => {
      m.msg('Voiding…');
      const res = await api('invoices/' + invoiceId + '/void', { method: 'POST', body: { reason: m.body.querySelector('#vd-reason').value.trim() || 'voided' } });
      if (res && res.ok) { H.toast('Invoice voided', 'info'); m.close(); paintInvoices(body); }
      else m.msg(res && res.error ? res.error : 'Failed.');
    });
  }

  async function deleteInvoice(invoiceId, body) {
    const m = modal('Delete draft', { sm: true });
    m.body.innerHTML = `<p class="acc-muted" style="margin:0">Delete this draft invoice permanently? Only drafts (no number, no voucher) can be deleted.</p>`;
    m.foot.innerHTML = `<button class="acc-mini" data-cancel>Cancel</button><button class="acc-btn danger" data-go>Delete draft</button>`;
    m.foot.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.foot.querySelector('[data-go]').addEventListener('click', async () => {
      m.msg('Deleting…');
      const res = await api('invoices/' + invoiceId, { method: 'DELETE' });
      if (res && res.ok) { H.toast('Draft deleted', 'info'); m.close(); paintInvoices(body); }
      else m.msg(res && res.error ? res.error : 'Failed.');
    });
  }

  /* ====================================================================== */
  /* 3) BILLS (incoming supplier invoices)                                 */
  /* ====================================================================== */
  const BILL_CATEGORIES = [
    { v: 'hosting', l: 'Hosting & cloud', acct: '5420' },
    { v: 'software', l: 'Software & SaaS', acct: '5420' },
    { v: 'consulting', l: 'Consulting / services', acct: '6550' },
    { v: 'marketing', l: 'Marketing & ads', acct: '5910' },
    { v: 'office', l: 'Office & supplies', acct: '6110' },
    { v: 'travel', l: 'Travel', acct: '5800' },
    { v: 'fees', l: 'Bank / platform fees', acct: '6570' },
    { v: 'goods', l: 'Goods / inventory', acct: '4010' },
    { v: 'other', l: 'Other cost', acct: '6990' }
  ];

  async function paintBills(body) {
    const r = await api('bills');
    if (!r || !r.ok) { body.innerHTML = failNote(r); return; }
    const rows = r.rows || [];
    const t = r.totals || {};
    const tr = rows.map(row => {
      const paid = row.status === 'paid';
      const acts = [];
      acts.push(`<button class="acc-mini" data-bill-view="${esc(row.id)}">View</button>`);
      if (!paid) acts.push(`<button class="acc-mini go" data-bill-paid="${esc(row.id)}" data-remaining="${num(row.gross) - num(row.paid)}">Mark paid</button>`);
      return `<tr>
        <td class="acc-mono">${esc(row.number || row.supplier_number || '—')}</td>
        <td>${esc(row.partner_name || '—')}</td>
        <td>${when(row.issue_date)}</td>
        <td>${when(row.due_date)}</td>
        <td class="num">${sek(row.net, row.currency)}</td>
        <td class="num">${row.reverse_charge ? '<span class="acc-chip special">RC</span>' : sek(row.vat, row.currency)}</td>
        <td class="num"><b>${sek(row.gross, row.currency)}</b></td>
        <td>${chip(paid ? 'paid' : 'unpaid')}</td>
        <td><div class="acc-actions">${acts.join('')}</div></td>
      </tr>`;
    }).join('') || `<tr><td colspan="9" class="acc-muted">No bills yet — log an incoming supplier invoice with “Enter a bill”.</td></tr>`;

    body.innerHTML = `
      <div class="acc-kpis">
        <div class="acc-kpi"><span class="k">${sek0(t.net)}</span><span class="l">Net (all)</span></div>
        <div class="acc-kpi"><span class="k">${sek0(t.vat)}</span><span class="l">Input moms</span></div>
        <div class="acc-kpi warnaccent"><span class="k">${sek0(t.gross)}</span><span class="l">Gross (all)</span></div>
        <div class="acc-kpi"><span class="k">${rows.filter(x => x.status !== 'paid').length}</span><span class="l">Unpaid</span></div>
      </div>
      <section class="acc-panel">
        <div class="acc-panel-head">
          <h3>Bills <span class="acc-muted">leverantörsfakturor · ${rows.length}</span></h3>
          <button class="acc-btn" id="acc-new-bill">${ic('plus')} Enter a bill</button>
        </div>
        <div class="acc-tablewrap">
          <table class="acc-table">
            <thead><tr><th>Number</th><th>Supplier</th><th>Issued</th><th>Due</th><th class="num">Net</th><th class="num">Moms</th><th class="num">Gross</th><th>Status</th><th></th></tr></thead>
            <tbody>${tr}</tbody>
          </table>
        </div>
      </section>`;

    body.querySelector('#acc-new-bill').addEventListener('click', () => openBillComposer(body));
    body.querySelectorAll('[data-bill-view]').forEach(b => b.addEventListener('click', () => openBillView(b.dataset.billView, body)));
    body.querySelectorAll('[data-bill-paid]').forEach(b => b.addEventListener('click', () => openMarkPaidBill(b.dataset.billPaid, num(b.dataset.remaining), body)));
  }

  async function openBillComposer(body) {
    const m = modal('Enter a bill');
    m.body.innerHTML = `<div class="acc-loading"><span class="acc-spin"></span> Loading suppliers…</div>`;
    const pres = await api('partners');
    const partners = (pres && pres.rows) || [];
    const partOpts = partners.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');

    m.body.innerHTML = `
      <div class="acc-form">
        <div class="acc-field">
          <label>Supplier</label>
          <div class="acc-row" style="gap:8px">
            <select class="acc-in" id="bl-part" style="flex:1 1 auto"><option value="">Select supplier…</option>${partOpts}</select>
            <button class="acc-mini" id="bl-quickpart" style="flex:none;height:38px">${ic('plus')} New</button>
          </div>
        </div>
        <div class="acc-row">
          <div class="acc-field"><label>Supplier invoice no</label><input class="acc-in" id="bl-num" placeholder="from their invoice"/></div>
          <div class="acc-field"><label>Currency</label><select class="acc-in" id="bl-cur"><option>SEK</option><option>EUR</option><option>USD</option></select></div>
        </div>
        <div class="acc-row">
          <div class="acc-field"><label>Issue date</label><input class="acc-in" id="bl-issue" type="date" value="${today()}"/></div>
          <div class="acc-field"><label>Due date</label><input class="acc-in" id="bl-due" type="date" value="${addDays(today(), 30)}"/></div>
        </div>
        <div class="acc-field">
          <label>Category</label>
          <select class="acc-in" id="bl-cat">${BILL_CATEGORIES.map(c => `<option value="${c.v}" data-acct="${c.acct}">${esc(c.l)} (${c.acct})</option>`).join('')}</select>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted);cursor:pointer">
          <input type="checkbox" id="bl-rc"/> EU reverse charge (omvänd skattskyldighet — no input moms; we self-account)
        </label>

        <div class="acc-sep"></div>
        <div class="acc-line-head"><span>Description</span><span style="grid-column:span 2">Amount (net)</span><span>Moms</span><span></span></div>
        <div class="acc-lines" id="bl-lines"></div>
        <button class="acc-mini" id="bl-addline" style="align-self:flex-start">${ic('plus')} Add line</button>

        <div class="acc-totals" id="bl-totals"></div>

        <div class="acc-field"><label>Attach supplier invoice file (PDF / image)</label><input class="acc-in" id="bl-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" style="padding:7px 10px;height:auto"/></div>
        <div class="acc-field"><label>Notes</label><textarea class="acc-in" id="bl-notes"></textarea></div>
      </div>`;

    const linesHost = m.body.querySelector('#bl-lines');
    function lineRow(l) {
      const row = document.createElement('div'); row.className = 'acc-line'; row.style.gridTemplateColumns = '1fr 64px 96px 84px 30px';
      row.innerHTML = `
        <input class="acc-in l-desc" placeholder="Description" value="${esc(l.description || '')}"/>
        <input class="acc-in l-qty" type="number" value="1" style="visibility:hidden"/>
        <input class="acc-in l-amt" type="number" step="any" placeholder="0.00" value="${l.amount_net != null ? esc(l.amount_net) : ''}"/>
        <select class="acc-in l-vat">${VAT_RATES.map(v => `<option value="${v}"${Number(l.vat_rate) === v ? ' selected' : ''}>${v}%</option>`).join('')}</select>
        <button class="acc-line-x" title="Remove line">${ic('close')}</button>`;
      row.querySelector('.acc-line-x').addEventListener('click', () => { row.remove(); recalc(); });
      row.querySelectorAll('input,select').forEach(i => i.addEventListener('input', recalc));
      return row;
    }
    linesHost.appendChild(lineRow({ description: '', amount_net: '', vat_rate: 25 }));
    m.body.querySelector('#bl-addline').addEventListener('click', () => { linesHost.appendChild(lineRow({ description: '', amount_net: '', vat_rate: 25 })); recalc(); });

    const rcEl = m.body.querySelector('#bl-rc');
    function readLines() {
      return Array.from(linesHost.querySelectorAll('.acc-line')).map(r => ({
        description: r.querySelector('.l-desc').value.trim(),
        amount_net: num(r.querySelector('.l-amt').value),
        vat_rate: Number(r.querySelector('.l-vat').value)
      }));
    }
    function recalc() {
      const cur = m.body.querySelector('#bl-cur').value;
      const rc = rcEl.checked;
      const ls = readLines();
      let net = 0, vat = 0;
      ls.forEach(l => { net += l.amount_net; if (!rc) vat += l.amount_net * l.vat_rate / 100; });
      const gross = net + vat;
      m.body.querySelector('#bl-totals').innerHTML = `
        <div class="row"><span>Net</span><b>${sek(net, cur)}</b></div>
        <div class="row"><span>Input moms${rc ? ' (reverse charge → 0)' : ''}</span><b>${sek(vat, cur)}</b></div>
        <div class="row gross"><span>Total (gross)</span><b>${sek(gross, cur)}</b></div>`;
    }
    rcEl.addEventListener('change', recalc);
    recalc();

    m.body.querySelector('#bl-quickpart').addEventListener('click', () => openQuickPartner(m.body.querySelector('#bl-part')));

    m.foot.innerHTML = `<button class="acc-mini" data-cancel>Cancel</button><button class="acc-btn" data-save>Save bill</button>`;
    m.foot.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.foot.querySelector('[data-save]').addEventListener('click', async () => {
      const partner_id = m.body.querySelector('#bl-part').value;
      if (!partner_id) return m.msg('Pick a supplier first.');
      const ls = readLines().filter(l => l.description || l.amount_net);
      if (!ls.length) return m.msg('Add at least one line.');
      m.msg('Saving bill…');
      const catSel = m.body.querySelector('#bl-cat');
      const expense_account = catSel.options[catSel.selectedIndex].dataset.acct;
      const res = await api('bills', { method: 'POST', body: {
        partner_id,
        supplier_number: m.body.querySelector('#bl-num').value.trim() || undefined,
        currency: m.body.querySelector('#bl-cur').value || 'SEK',
        issue_date: m.body.querySelector('#bl-issue').value || today(),
        due_date: m.body.querySelector('#bl-due').value || undefined,
        category: catSel.value,
        expense_account,
        reverse_charge: rcEl.checked,
        lines: ls,
        notes: m.body.querySelector('#bl-notes').value.trim() || undefined
      }});
      if (!res || !res.ok) { m.msg(res && res.error ? res.error : 'Save failed.'); return; }
      const billId = (res.bill && res.bill.id) || res.id;
      // attach the file if one was chosen (best-effort)
      const f = m.body.querySelector('#bl-file').files[0];
      if (f && billId) {
        try {
          m.msg('Uploading attachment…');
          const b64 = await fileToB64(f);
          await api('bills/' + billId + '/attachment', { method: 'POST', body: { base64: b64, content_type: f.type || 'application/pdf', filename: f.name } });
        } catch (e) { H.toast('Bill saved, attachment failed: ' + e.message, 'warn'); }
      }
      H.toast('Bill saved', 'success'); m.close(); paintBills(body);
    });
  }

  function openQuickPartner(selectEl) {
    const m = modal('New supplier', { sm: true });
    m.body.innerHTML = `
      <div class="acc-field"><label>Name *</label><input class="acc-in" id="qp-name"/></div>
      <div class="acc-row">
        <div class="acc-field"><label>Org no</label><input class="acc-in" id="qp-org"/></div>
        <div class="acc-field"><label>VAT no</label><input class="acc-in" id="qp-vat"/></div>
      </div>
      <div class="acc-row">
        <div class="acc-field"><label>Country</label><input class="acc-in" id="qp-country" value="SE"/></div>
        <div class="acc-field"><label>Kind</label><select class="acc-in" id="qp-kind"><option value="vendor">Vendor</option><option value="platform">Platform</option><option value="bank">Bank</option><option value="other">Other</option></select></div>
      </div>
      <div class="acc-field"><label>Address</label><textarea class="acc-in" id="qp-addr"></textarea></div>`;
    m.foot.innerHTML = `<button class="acc-mini" data-cancel>Cancel</button><button class="acc-btn" data-save>Create supplier</button>`;
    m.foot.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.foot.querySelector('[data-save]').addEventListener('click', async () => {
      const name = m.body.querySelector('#qp-name').value.trim();
      if (!name) return m.msg('Name is required.');
      m.msg('Creating…');
      const res = await api('partners', { method: 'POST', body: {
        name,
        kind: m.body.querySelector('#qp-kind').value,
        org_no: m.body.querySelector('#qp-org').value.trim() || undefined,
        vat_no: m.body.querySelector('#qp-vat').value.trim() || undefined,
        country: m.body.querySelector('#qp-country').value.trim() || undefined,
        address: m.body.querySelector('#qp-addr').value.trim() || undefined
      }});
      if (res && res.ok) {
        const id = (res.partner && res.partner.id) || (res.row && res.row.id) || res.id;
        if (selectEl && id) { const opt = document.createElement('option'); opt.value = id; opt.textContent = name; opt.selected = true; selectEl.appendChild(opt); }
        H.toast('Supplier created', 'success'); m.close();
      } else m.msg(res && res.error ? res.error : 'Create failed.');
    });
  }

  async function openBillView(billId, body) {
    const m = modal('Bill detail');
    m.body.innerHTML = `<div class="acc-loading"><span class="acc-spin"></span> Loading…</div>`;
    const r = await api('bills/' + billId);
    if (!r || !r.ok) { m.body.innerHTML = failNote(r); return; }
    const b = r.bill || {};
    const lines = (b.lines || []).map(l => `<tr><td>${esc(l.description || '')}</td><td class="num">${sek(l.amount_net, b.currency)}</td><td class="num">${l.vat_rate}%</td></tr>`).join('') || `<tr><td colspan="3" class="acc-muted">No lines.</td></tr>`;
    const att = r.attachment_url;
    m.body.innerHTML = `
      <div class="acc-row">
        <div><div class="acc-muted">Supplier</div><b>${esc(b.partner_name || '—')}</b></div>
        <div><div class="acc-muted">Number</div><b class="acc-mono">${esc(b.number || b.supplier_number || '—')}</b></div>
        <div><div class="acc-muted">Status</div>${chip(b.status === 'paid' ? 'paid' : 'unpaid')}</div>
      </div>
      <div class="acc-row">
        <div><div class="acc-muted">Issued</div>${when(b.issue_date)}</div>
        <div><div class="acc-muted">Due</div>${when(b.due_date)}</div>
        <div><div class="acc-muted">Gross</div><b>${sek(b.gross, b.currency)}</b></div>
      </div>
      <table class="acc-table"><thead><tr><th>Description</th><th class="num">Net</th><th class="num">Moms</th></tr></thead><tbody>${lines}</tbody></table>
      ${att ? `<a class="acc-btn" href="${esc(att)}" target="_blank" rel="noopener" style="text-decoration:none">${ic('fileText')} View attachment</a>` : `<div class="acc-note">No attachment uploaded for this bill.</div>`}`;
    m.foot.innerHTML = `<button class="acc-mini" data-cancel>Close</button>${b.status !== 'paid' ? `<button class="acc-btn" data-paid>Mark paid</button>` : ''}`;
    m.foot.querySelector('[data-cancel]').addEventListener('click', m.close);
    const pb = m.foot.querySelector('[data-paid]');
    if (pb) pb.addEventListener('click', () => { m.close(); openMarkPaidBill(billId, num(b.gross) - num(b.paid), body); });
  }

  function openMarkPaidBill(billId, remaining, body) {
    const m = modal('Mark bill paid', { sm: true });
    m.body.innerHTML = `
      <div class="acc-field"><label>Amount paid</label><input class="acc-in" id="bp-amt" type="number" step="any" value="${remaining > 0 ? remaining : ''}"/></div>
      <div class="acc-field"><label>Paid date</label><input class="acc-in" id="bp-date" type="date" value="${today()}"/></div>
      <div class="acc-row">
        <div class="acc-field"><label>Method</label><select class="acc-in" id="bp-method"><option value="bank">Bank transfer</option><option value="card">Card</option><option value="autogiro">Autogiro</option><option value="other">Other</option></select></div>
        <div class="acc-field"><label>Reference</label><input class="acc-in" id="bp-ref"/></div>
      </div>`;
    m.foot.innerHTML = `<button class="acc-mini" data-cancel>Cancel</button><button class="acc-btn" data-go>Record payment</button>`;
    m.foot.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.foot.querySelector('[data-go]').addEventListener('click', async () => {
      m.msg('Recording…');
      const res = await api('bills/' + billId + '/mark-paid', { method: 'POST', body: {
        amount: num(m.body.querySelector('#bp-amt').value) || undefined,
        paid_at: m.body.querySelector('#bp-date').value || undefined,
        method: m.body.querySelector('#bp-method').value,
        reference: m.body.querySelector('#bp-ref').value.trim() || undefined
      }});
      if (res && res.ok) { H.toast('Bill marked paid', 'success'); m.close(); paintBills(body); }
      else m.msg(res && res.error ? res.error : 'Failed.');
    });
  }

  /* ====================================================================== */
  /* 4) EXPENSES                                                           */
  /* ====================================================================== */
  const EXP_CATEGORIES = ['hosting', 'software', 'consulting', 'marketing', 'office', 'travel', 'fees', 'goods', 'other'];

  async function paintExpenses(body) {
    const r = await api('expenses');
    if (!r || !r.ok) { body.innerHTML = failNote(r); return; }
    const rows = r.rows || [];
    const recurring = r.recurring || [];

    const logRows = rows.map(e => `<tr>
      <td>${when(e.occurred_at || e.created_at)}</td>
      <td>${esc(e.description || '—')}</td>
      <td>${esc(e.category || '—')}</td>
      <td class="num">${sek(e.amount)}</td>
      <td class="num">${e.vat_rate != null ? e.vat_rate + '%' : '—'}</td>
      <td>${e.paid === false ? chip('unpaid') : chip('paid')}</td>
    </tr>`).join('') || `<tr><td colspan="6" class="acc-muted">No expenses logged yet.</td></tr>`;

    const recRows = recurring.map(e => `<tr>
      <td>${esc(e.description || '—')}</td>
      <td>${esc(e.category || '—')}</td>
      <td class="num">${sek(e.amount)}</td>
      <td><span class="acc-chip info">${esc(e.recurrence || '—')}${e.interval && e.interval > 1 ? ' ×' + e.interval : ''}</span></td>
      <td>${when(e.next_charge_at)}</td>
      <td><button class="acc-mini danger" data-exp-del="${esc(e.id)}">Stop</button></td>
    </tr>`).join('') || `<tr><td colspan="6" class="acc-muted">No recurring expenses.</td></tr>`;

    body.innerHTML = `
      <div class="acc-grid2">
        <section class="acc-panel">
          <h3>Quick log <span class="acc-muted">— a one-off or recurring expense</span></h3>
          <div class="acc-form">
            <div class="acc-field"><label>Description *</label><input class="acc-in" id="ex-desc" placeholder="e.g. Figma subscription"/></div>
            <div class="acc-row">
              <div class="acc-field"><label>Amount (net) *</label><input class="acc-in" id="ex-amt" type="number" step="any" placeholder="0.00"/></div>
              <div class="acc-field"><label>Moms</label><select class="acc-in" id="ex-vat">${VAT_RATES.map(v => `<option value="${v}"${v === 25 ? ' selected' : ''}>${v}%</option>`).join('')}</select></div>
            </div>
            <div class="acc-row">
              <div class="acc-field"><label>Category</label><select class="acc-in" id="ex-cat">${EXP_CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select></div>
              <div class="acc-field"><label>Date</label><input class="acc-in" id="ex-date" type="date" value="${today()}"/></div>
            </div>
            <div class="acc-row">
              <div class="acc-field"><label>Recurrence</label><select class="acc-in" id="ex-rec"><option value="once">One-off</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></div>
              <div class="acc-field"><label>Paid?</label><select class="acc-in" id="ex-paid"><option value="true">Paid</option><option value="false">Unpaid</option></select></div>
            </div>
            <button class="acc-btn" id="ex-log">Log expense</button>
            <div class="acc-muted" id="ex-msg"></div>
          </div>
        </section>
        <section class="acc-panel">
          <h3>Recurring <span class="acc-muted">— materialized by month-end</span></h3>
          <div class="acc-tablewrap" style="max-height:300px">
            <table class="acc-table"><thead><tr><th>Description</th><th>Category</th><th class="num">Net</th><th>Cadence</th><th>Next</th><th></th></tr></thead><tbody>${recRows}</tbody></table>
          </div>
          <div class="acc-sep"></div>
          <button class="acc-btn" id="ex-reconcile">${ic('refreshCw')} Run month-end (reconcile)</button>
          <p class="acc-muted" style="margin:8px 0 0">Materializes due recurring expenses, imports the NFT platform fees as our revenue, and flags overdue invoices.</p>
        </section>
      </div>
      <section class="acc-panel">
        <h3>Logged expenses <span class="acc-muted">utgifter · ${rows.length}</span></h3>
        <div class="acc-tablewrap"><table class="acc-table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Net</th><th class="num">Moms</th><th>Status</th></tr></thead><tbody>${logRows}</tbody></table></div>
      </section>`;

    const msg = body.querySelector('#ex-msg');
    body.querySelector('#ex-log').addEventListener('click', async () => {
      const description = body.querySelector('#ex-desc').value.trim();
      const amount = num(body.querySelector('#ex-amt').value);
      if (!description || !amount) { msg.textContent = 'Description and amount are required.'; return; }
      msg.textContent = 'Logging…';
      const recurrence = body.querySelector('#ex-rec').value;
      const dateVal = body.querySelector('#ex-date').value || today();
      const res = await api('expenses', { method: 'POST', body: {
        description, amount,
        vat_rate: Number(body.querySelector('#ex-vat').value),
        category: body.querySelector('#ex-cat').value,
        recurrence,
        paid: body.querySelector('#ex-paid').value === 'true',
        occurred_at: dateVal,
        next_charge_at: recurrence !== 'once' ? dateVal : undefined
      }});
      if (res && res.ok) { H.toast('Expense logged', 'success'); paintExpenses(body); }
      else msg.textContent = res && res.error ? res.error : 'Failed.';
    });

    body.querySelectorAll('[data-exp-del]').forEach(b => b.addEventListener('click', async () => {
      const res = await api('expenses/' + b.dataset.expDel, { method: 'DELETE' });
      if (res && res.ok) { H.toast('Recurring expense stopped', 'info'); paintExpenses(body); }
      else H.toast(res && res.error ? res.error : 'Failed', 'danger');
    }));

    body.querySelector('#ex-reconcile').addEventListener('click', async () => {
      const m = modal('Month-end reconcile', { sm: true });
      m.body.innerHTML = `<div class="acc-loading"><span class="acc-spin"></span> Running reconcile for ${thisMonth()}…</div>`;
      m.foot.innerHTML = '';
      const res = await api('reconcile', { method: 'POST', body: { period: thisMonth() } });
      if (res && res.ok) {
        m.body.innerHTML = `
          <div class="acc-info" style="margin:0">${ic('checkCircle')} Reconcile complete for <b>${thisMonth()}</b>.</div>
          <div class="acc-kpis" style="grid-template-columns:1fr 1fr 1fr">
            <div class="acc-kpi"><span class="k">${num(res.materialized_expenses)}</span><span class="l">Recurring materialized</span></div>
            <div class="acc-kpi pos"><span class="k">${sek0(res.platform_revenue)}</span><span class="l">Platform revenue imported</span></div>
            <div class="acc-kpi warnaccent"><span class="k">${num(res.overdue_flagged)}</span><span class="l">Overdue flagged</span></div>
          </div>`;
        m.foot.innerHTML = `<button class="acc-btn" data-done>Done</button>`;
        m.foot.querySelector('[data-done]').addEventListener('click', () => { m.close(); paintExpenses(body); });
        H.toast('Month-end reconciled', 'success');
      } else { m.body.innerHTML = failNote(res); m.foot.innerHTML = `<button class="acc-mini" data-done>Close</button>`; m.foot.querySelector('[data-done]').addEventListener('click', m.close); }
    });
  }

  /* ====================================================================== */
  /* 5) LEDGER (verifikat / vouchers)                                      */
  /* ====================================================================== */
  let ledgerPeriod = thisMonth();
  async function paintLedger(body) {
    body.innerHTML = `
      <section class="acc-panel">
        <div class="acc-panel-head">
          <h3>Ledger <span class="acc-muted">verifikat — every voucher, balanced debit = credit</span></h3>
          <div class="acc-seg">
            <input class="acc-in" id="lg-period" type="month" value="${esc(ledgerPeriod)}"/>
            <button class="acc-mini" id="lg-go">Load</button>
            <button class="acc-mini" id="lg-manual">${ic('plus')} Manual journal</button>
          </div>
        </div>
        <div id="lg-list"><div class="acc-loading"><span class="acc-spin"></span> Loading vouchers…</div></div>
      </section>`;

    body.querySelector('#lg-go').addEventListener('click', () => { ledgerPeriod = body.querySelector('#lg-period').value || thisMonth(); loadVouchers(body); });
    body.querySelector('#lg-manual').addEventListener('click', () => openManualJournal(body));
    await loadVouchers(body);
  }

  async function loadVouchers(body) {
    const host = body.querySelector('#lg-list'); if (!host) return;
    host.innerHTML = `<div class="acc-loading"><span class="acc-spin"></span> Loading vouchers…</div>`;
    const r = await api('vouchers?period=' + ledgerPeriod);
    if (!r || !r.ok) { host.innerHTML = failNote(r); return; }
    const rows = r.rows || [];
    const totals = r.totals || {};
    if (!rows.length) { host.innerHTML = `<div class="acc-note">No vouchers in ${esc(ledgerPeriod)}. Issue an invoice, log a bill, or post a manual journal.</div>`; return; }

    const html = rows.map(v => {
      const entries = v.entries || [];
      const dr = entries.reduce((a, e) => a + num(e.debit), 0);
      const cr = entries.reduce((a, e) => a + num(e.credit), 0);
      const balanced = Math.abs(dr - cr) < 0.005;
      const lines = entries.map(e => `<tr>
        <td class="acc-mono">${esc(e.account)}</td>
        <td>${esc(e.text || '')}</td>
        <td class="num">${num(e.debit) ? sek(e.debit) : ''}</td>
        <td class="num">${num(e.credit) ? sek(e.credit) : ''}</td>
      </tr>`).join('');
      return `<details class="acc-voucher">
        <summary>
          <span class="vch-id">${esc(v.series || 'V')}·${esc(String(v.id).slice(0, 8))}</span>
          <span class="vch-txt">${when(v.vdate)} — ${esc(v.vtext || '')}</span>
          <span class="vch-amt">${sek(dr)}</span>
          <span class="vch-bal ${balanced ? 'ok' : 'bad'}">${balanced ? ic('check') + ' balanced' : ic('alertTriangle') + ' off'}</span>
        </summary>
        <div class="vch-lines">
          <table class="acc-table"><thead><tr><th>Account</th><th>Text</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
          <tbody>${lines}</tbody>
          <tfoot><tr><td colspan="2">Σ</td><td class="num">${sek(dr)}</td><td class="num">${sek(cr)}</td></tr></tfoot></table>
        </div>
      </details>`;
    }).join('');

    const tDr = num(totals.debit), tCr = num(totals.credit);
    const allBalanced = Math.abs(tDr - tCr) < 0.005;
    host.innerHTML = `
      <div class="acc-${allBalanced ? 'info' : 'warn'}" style="margin-bottom:14px">${allBalanced ? ic('checkCircle') : ic('alertTriangle')} Period Σ debit ${sek(tDr)} ${allBalanced ? '=' : '≠'} Σ credit ${sek(tCr)} — ${rows.length} voucher(s)</div>
      ${html}`;
  }

  function openManualJournal(body) {
    const m = modal('Manual journal voucher');
    m.body.innerHTML = `
      <div class="acc-row">
        <div class="acc-field"><label>Date</label><input class="acc-in" id="mj-date" type="date" value="${today()}"/></div>
        <div class="acc-field"><label>Series</label><input class="acc-in" id="mj-series" value="M" placeholder="M"/></div>
      </div>
      <div class="acc-field"><label>Text</label><input class="acc-in" id="mj-text" placeholder="Voucher description"/></div>
      <div class="acc-sep"></div>
      <div class="acc-line-head" style="grid-template-columns:1fr 1fr 96px 96px 30px"><span>Account</span><span>Text</span><span>Debit</span><span>Credit</span><span></span></div>
      <div class="acc-lines" id="mj-lines"></div>
      <button class="acc-mini" id="mj-add" style="align-self:flex-start">${ic('plus')} Add entry</button>
      <div class="acc-totals" id="mj-totals"></div>`;
    const host = m.body.querySelector('#mj-lines');
    function row(e) {
      const r = document.createElement('div'); r.className = 'acc-line'; r.style.gridTemplateColumns = '1fr 1fr 96px 96px 30px';
      r.innerHTML = `
        <input class="acc-in e-acct" placeholder="1930" value="${esc(e.account || '')}"/>
        <input class="acc-in e-text" placeholder="text" value="${esc(e.text || '')}"/>
        <input class="acc-in e-dr" type="number" step="any" placeholder="0" value="${e.debit != null ? esc(e.debit) : ''}"/>
        <input class="acc-in e-cr" type="number" step="any" placeholder="0" value="${e.credit != null ? esc(e.credit) : ''}"/>
        <button class="acc-line-x">${ic('close')}</button>`;
      r.querySelector('.acc-line-x').addEventListener('click', () => { r.remove(); recalc(); });
      r.querySelectorAll('input').forEach(i => i.addEventListener('input', recalc));
      return r;
    }
    host.appendChild(row({})); host.appendChild(row({}));
    m.body.querySelector('#mj-add').addEventListener('click', () => { host.appendChild(row({})); recalc(); });
    function readEntries() {
      return Array.from(host.querySelectorAll('.acc-line')).map(r => ({
        account: r.querySelector('.e-acct').value.trim(),
        text: r.querySelector('.e-text').value.trim() || undefined,
        debit: num(r.querySelector('.e-dr').value),
        credit: num(r.querySelector('.e-cr').value)
      })).filter(e => e.account && (e.debit || e.credit));
    }
    function recalc() {
      const es = readEntries();
      const dr = es.reduce((a, e) => a + e.debit, 0), cr = es.reduce((a, e) => a + e.credit, 0);
      const bal = Math.abs(dr - cr) < 0.005;
      m.body.querySelector('#mj-totals').innerHTML = `
        <div class="row"><span>Σ Debit</span><b>${sek(dr)}</b></div>
        <div class="row"><span>Σ Credit</span><b>${sek(cr)}</b></div>
        <div class="row gross"><span>${bal ? ic('check') + ' Balanced' : ic('alertTriangle') + ' Out of balance'}</span><b style="color:${bal ? 'var(--ok)' : 'var(--danger)'}">${sek(Math.abs(dr - cr))}</b></div>`;
    }
    recalc();
    m.foot.innerHTML = `<button class="acc-mini" data-cancel>Cancel</button><button class="acc-btn" data-save>Post voucher</button>`;
    m.foot.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.foot.querySelector('[data-save]').addEventListener('click', async () => {
      const entries = readEntries();
      if (entries.length < 2) return m.msg('Need at least two entries.');
      const dr = entries.reduce((a, e) => a + e.debit, 0), cr = entries.reduce((a, e) => a + e.credit, 0);
      if (Math.abs(dr - cr) >= 0.005) return m.msg('Debit and credit must balance.');
      m.msg('Posting…');
      const res = await api('vouchers', { method: 'POST', body: {
        date: m.body.querySelector('#mj-date').value || today(),
        series: m.body.querySelector('#mj-series').value.trim() || 'M',
        text: m.body.querySelector('#mj-text').value.trim() || 'Manual journal',
        entries
      }});
      if (res && res.ok) { H.toast('Voucher posted', 'success'); m.close(); loadVouchers(body); }
      else m.msg(res && res.error ? res.error : 'Failed.');
    });
  }

  /* ====================================================================== */
  /* 6) EXPORT                                                             */
  /* ====================================================================== */
  async function paintExport(body) {
    const custRes = await api('customers');
    const partRes = await api('partners');
    const customers = (custRes && custRes.rows) || [];
    const partners = (partRes && partRes.rows) || [];

    body.innerHTML = `
      <div class="acc-info">${ic('upload')} Everything you hand your accountant. <b>CSV</b> = a full transaction journal for a month. <b>SIE</b> = the Swedish standard bookkeeping export (.se) that imports straight into Fortnox / Visma / Bokio. Per-party exports give each dealer or customer their own books.</div>
      <div class="acc-grid2">
        <section class="acc-panel">
          <h3>Monthly transaction CSV</h3>
          <div class="acc-form">
            <div class="acc-field"><label>Period</label><input class="acc-in" id="ex-csv-month" type="month" value="${thisMonth()}"/></div>
            <button class="acc-btn" id="ex-csv-go">Download CSV</button>
            <p class="acc-muted" style="margin:0">Every voucher line for the month — date, account, debit, credit, moms code. Open in Excel/Numbers or hand straight to the accountant.</p>
          </div>
        </section>
        <section class="acc-panel">
          <h3>Year-end SIE (.se)</h3>
          <div class="acc-form">
            <div class="acc-field"><label>Fiscal year</label><input class="acc-in" id="ex-sie-year" type="number" min="2020" max="2099" value="${thisYear()}"/></div>
            <button class="acc-btn" id="ex-sie-go">${ic('download')} Download SIE</button>
            <p class="acc-muted" style="margin:0">The full year's chart of accounts + vouchers in SIE4 format — the file Swedish accounting software imports natively.</p>
          </div>
        </section>
      </div>
      <section class="acc-panel">
        <h3>Per-party books <span class="acc-muted">— a dealer or customer gets their own ledger</span></h3>
        <div class="acc-form" style="max-width:620px">
          <div class="acc-row">
            <div class="acc-field"><label>Party type</label><select class="acc-in" id="ex-pt-type"><option value="dealer">Dealer</option><option value="customer">Customer</option><option value="partner">Supplier</option></select></div>
            <div class="acc-field"><label>Party</label><select class="acc-in" id="ex-pt-id"><option value="">Select / paste id below…</option>${customers.map(c => `<option value="${esc(c.id)}" data-type="customer">${esc(c.name)}</option>`).join('')}${partners.map(p => `<option value="${esc(p.id)}" data-type="partner">${esc(p.name)} (supplier)</option>`).join('')}</select></div>
          </div>
          <div class="acc-field"><label>…or paste a party id (e.g. a dealer UUID from NFT Site)</label><input class="acc-in" id="ex-pt-manual" placeholder="00000000-0000-0000-0000-000000000000"/></div>
          <div class="acc-field"><label>Period</label><input class="acc-in" id="ex-pt-month" type="month" value="${thisMonth()}"/></div>
          <button class="acc-btn" id="ex-pt-go">Download party export</button>
          <div class="acc-muted" id="ex-pt-msg"></div>
        </div>
      </section>`;

    body.querySelector('#ex-csv-go').addEventListener('click', async () => {
      const period = body.querySelector('#ex-csv-month').value || thisMonth();
      try { await window.DB.companyDownload('export?type=csv&period=' + period, 'opulence-tech-' + period + '.csv'); H.toast('CSV downloaded', 'success'); }
      catch (e) { H.toast('Export failed: ' + e.message, 'danger'); }
    });
    body.querySelector('#ex-sie-go').addEventListener('click', async () => {
      const year = body.querySelector('#ex-sie-year').value || thisYear();
      try { await window.DB.companyDownload('export?type=sie&year=' + year, 'opulence-tech-' + year + '.se'); H.toast('SIE downloaded', 'success'); }
      catch (e) { H.toast('Export failed: ' + e.message, 'danger'); }
    });
    body.querySelector('#ex-pt-go').addEventListener('click', async () => {
      const sel = body.querySelector('#ex-pt-id');
      const manual = body.querySelector('#ex-pt-manual').value.trim();
      const party_id = manual || sel.value;
      if (!party_id) { body.querySelector('#ex-pt-msg').textContent = 'Pick a party or paste an id.'; return; }
      let party_type = body.querySelector('#ex-pt-type').value;
      const selType = sel.value && sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].dataset.type;
      if (!manual && selType) party_type = selType;
      const period = body.querySelector('#ex-pt-month').value || thisMonth();
      try {
        await window.DB.companyDownload('export?type=party&party_type=' + encodeURIComponent(party_type) + '&party_id=' + encodeURIComponent(party_id) + '&period=' + period, party_type + '-' + party_id.slice(0, 8) + '-' + period + '.csv');
        H.toast('Party export downloaded', 'success');
      } catch (e) { body.querySelector('#ex-pt-msg').textContent = 'Export failed: ' + e.message; }
    });
  }

  /* ── register ─────────────────────────────────────────────────────────── */
  H.register({ id: 'accounting', label: 'Accounting', icon: '◆', scope: 'company', render });
})();
