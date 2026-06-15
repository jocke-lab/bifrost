/* ============================================================================
   billing.js — Billing & Accounts Receivable.
   Invoicing, the AR aging picture, DSO/collections health, and the overdue
   chase queue. Get paid; chase the late.
   Follows the HELM module contract: register({id,label,icon,render}),
   build DOM via H.el + documented classes + H.charts, wire every button.
   ========================================================================== */
(function () {
  const H = window.HELM;

  /* ── Bifrost aurora logo mark (verbatim inline SVG, ~40px on the paper) ──
     Used in the branded invoice header. Gradient id is namespaced (#bfrInv)
     so it never collides with the chart defs the shell emits elsewhere. */
  const BIFROST_MARK = `<svg viewBox="0 0 120 110" width="100%" height="100%" aria-hidden="true"><defs><linearGradient id="bfrInv" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7C5CFF"/><stop offset=".5" stop-color="#19D3FF"/><stop offset="1" stop-color="#46E6A6"/></linearGradient></defs><path d="M14 94 A46 60 0 0 1 106 94" fill="none" stroke="url(#bfrInv)" stroke-width="12" stroke-linecap="round"/><circle cx="14" cy="94" r="9" fill="#7C5CFF"/><circle cx="106" cy="94" r="9" fill="#46E6A6"/></svg>`;

  /* status pill presentation, shared by the table + the overlay doc */
  const STATUS_MAP = {
    draft:   { cls: 'info', label: 'DRAFT' },
    paid:    { cls: 'ok',   label: 'PAID' },
    sent:    { cls: 'warn', label: 'SENT' },
    overdue: { cls: 'bad',  label: 'OVERDUE' }
  };

  H.register({
    id: 'billing',
    label: 'Billing',
    icon: '🧾',
    render(root) {
      const D = H.data;

      /* ── deterministic mock data (unique series names → stable + distinct) ─ */
      const dsoTrend = D.series('bill-dso-trend', 14, 41, 28, 0.10);   // DSO falling ↘ (good)
      const collected = D.series('bill-collected', 12, 88000, 142000, 0.14); // cash collected / mo
      const billedSr = D.series('bill-billed', 12, 96000, 158000, 0.12);     // billed / mo
      const months12 = D.months.slice(0, 12);

      // AR aging buckets (kronor)
      const aging = [
        { label: 'CURRENT', value: 184200, color: 'var(--accent1)' },
        { label: '1–30', value: 96400, color: 'var(--accent2)' },
        { label: '31–60', value: 48100 },
        { label: '61–90', value: 27600 },
        { label: '90+', value: 18900 }
      ];
      const totalAR = aging.reduce((a, b) => a + b.value, 0);
      const overdueAR = aging.slice(1).reduce((a, b) => a + b.value, 0);

      const dso = 28;            // days sales outstanding
      const collectRate = 91;    // % collected within terms

      /* ── view head ───────────────────────────────────────────────────── */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">🧾</div>
            <div>
              <h1>Billing</h1>
              <p>Invoicing &amp; accounts receivable. Get paid — chase the overdue.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="statements">◇ Send statements</button>
            <button class="btn btn-primary btn-sm" data-act="new">＋ New invoice</button>
          </div>
        </div>
      `));

      /* ── KPI ROW ─────────────────────────────────────────────────────── */
      const kpiRow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
      // money KPIs render in kr (SEK module) via data-fmt="num"+kr prefix so
      // they stay consistent with the kr figures in the tables/pills/chart.
      [
        { label: 'OUTSTANDING AR', count: totalAR, fmt: 'num', prefix: 'kr', sub: '42 open invoices', trend: '+6.2%', dir: 'up', spark: billedSr },
        { label: 'OVERDUE', count: overdueAR, fmt: 'num', prefix: 'kr', sub: '11 invoices late', trend: '+3 vs last wk', dir: 'down', spark: D.series('bill-od-spark', 12, 120, 191, 0.18) },
        { label: 'DSO', count: dso, fmt: 'num', sub: 'days · target 25', trend: '4d faster', dir: 'up', spark: dsoTrend, suffix: ' d' },
        { label: 'PAID THIS MONTH', count: 142800, fmt: 'num', prefix: 'kr', sub: '38 invoices cleared', trend: '+18.1%', dir: 'up', spark: collected }
      ].forEach(k => {
        kpiRow.appendChild(H.el(`
          <div class="card kpi billing-kpi">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-value" data-count="${k.count}" data-fmt="${k.fmt}"${k.prefix ? ` data-prefix="${k.prefix}"` : ''}${k.suffix ? ` data-suffix="${k.suffix}"` : ''}>0</div>
            <div class="row between mt-sm">
              <span class="kpi-sub">${k.sub}</span>
              <span class="kpi-trend ${k.dir}">${k.trend}</span>
            </div>
            <div class="spark">${H.charts.spark(k.spark)}</div>
          </div>
        `));
      });
      root.appendChild(kpiRow);

      /* ── ROW 2: collections gauge | AR aging bars | sync status ──────── */
      const row2 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // Collections / DSO gauge
      const gaugeCard = H.el(`
        <div class="card billing-gauge-card">
          <div class="card-head">
            <h3><span class="hico">🎯</span> Collections Health</h3>
            <span class="ch-meta">DSO · ${dso} DAYS</span>
          </div>
          <div class="billing-gauge">
            <div class="billing-gauge-ring">
              ${H.charts.gauge(collectRate, { max: 100, size: 210, arc: 270 })}
              <div class="billing-gauge-core">
                <div class="bg-num" data-count="${collectRate}" data-suffix="%">0</div>
                <div class="bg-lbl">ON-TIME RATE</div>
              </div>
            </div>
            <div class="billing-gauge-legend">
              <div class="stat-row"><span class="sr-label">Median days to pay</span><span class="sr-val">${dso} d</span></div>
              <div class="stat-row"><span class="sr-label">Best customer</span><span class="sr-val">12 d</span></div>
              <div class="stat-row"><span class="sr-label">Worst customer</span><span class="sr-val" style="color:var(--danger)">61 d</span></div>
              <div class="stat-row"><span class="sr-label">Net terms</span><span class="sr-val">30 d</span></div>
            </div>
          </div>
        </div>
      `);
      // hide the gauge's built-in big number; use the styled core overlay
      const gtxt = gaugeCard.querySelector('.billing-gauge-ring svg text');
      if (gtxt) gtxt.style.display = 'none';
      row2.appendChild(gaugeCard);

      // AR aging bars
      const agingCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">📊</span> AR Aging</h3>
            <span class="ch-meta">SEK · BY BUCKET</span>
          </div>
          <div class="chart" style="height:188px">
            ${H.charts.bars(aging, { height: 188, warnAt: 27000 })}
          </div>
          <div class="row between mt-sm">
            <span class="pill ok">● ${H.fmt.money(aging[0].value, 'kr')} CURRENT</span>
            <span class="pill bad">● ${H.fmt.money(overdueAR, 'kr')} OVERDUE</span>
          </div>
        </div>
      `);
      row2.appendChild(agingCard);

      // Integration / sync status
      const syncCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🔌</span> Sync Status</h3>
            <span class="pill ok" style="font-size:9px">● HEALTHY</span>
          </div>
          <div class="billing-sync"></div>
        </div>
      `);
      const syncWrap = syncCard.querySelector('.billing-sync');
      [
        { name: 'Stripe', sub: 'Payments · webhook live', ico: '💳', state: 'ok', meta: '2 min ago' },
        { name: 'Fortnox', sub: 'Bookkeeping · 18 vouchers synced', ico: '📒', state: 'ok', meta: '6 min ago' },
        { name: 'Tink', sub: 'Bank feed · 2 accounts', ico: '🏦', state: 'ok', meta: '11 min ago' },
        { name: 'Swish', sub: 'Reconnect required', ico: '📲', state: 'warn', meta: 'action' }
      ].forEach(s => {
        const node = H.el(`
          <div class="billing-sync-row">
            <div class="bsr-ico">${s.ico}</div>
            <div class="bsr-body">
              <div class="bsr-name">${s.name}</div>
              <div class="bsr-sub">${s.sub}</div>
            </div>
            <div class="bsr-right">
              <span class="pill ${s.state === 'ok' ? 'ok' : 'warn'}">${s.state === 'ok' ? 'SYNCED' : 'FIX'}</span>
              <span class="bsr-meta">${s.meta}</span>
            </div>
          </div>
        `);
        if (s.state !== 'ok') {
          node.querySelector('.pill').style.cursor = 'pointer';
          node.querySelector('.pill').addEventListener('click', () => H.toast('Opening ' + s.name + ' reconnect flow…', 'info'));
        }
        syncWrap.appendChild(node);
      });
      row2.appendChild(syncCard);
      root.appendChild(row2);

      /* ── ROW 3: invoices table (span 2) | overdue chase queue ────────── */
      const row3 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // Invoices table. `lines` drive the branded invoice document in the
      // overlay; `amount` is the kr TOTAL (incl. 25% moms) shown in the table.
      const invoices = [
        { no: '2312', cust: 'Northwind AB',     addr: 'Sveavägen 44, 111 34 Stockholm, SE',  amount: 42000, issued: 'May 28', due: 'Jun 27', status: 'sent',
          lines: [{ d: 'Platform retainer · June', q: 1, u: 28000 }, { d: 'Onboarding & data migration', q: 1, u: 5600 }] },
        { no: '2311', cust: 'Lykke Studios',     addr: 'Götgatan 9, 116 46 Stockholm, SE',    amount: 18400, issued: 'May 24', due: 'Jun 08', status: 'overdue',
          lines: [{ d: 'Brand campaign — production', q: 1, u: 12720 }, { d: 'Motion design', q: 4, u: 600 }] },
        { no: '2309', cust: 'Forsberg Konsult',  addr: 'Drottninggatan 2, 602 24 Norrköping, SE', amount: 26500, issued: 'May 20', due: 'Jun 19', status: 'sent',
          lines: [{ d: 'Advisory hours', q: 18, u: 1100 }, { d: 'Workshop facilitation', q: 1, u: 1400 }] },
        { no: '2307', cust: 'Bergström Design',  addr: 'Kungsgatan 30, 411 19 Göteborg, SE',  amount: 9800,  issued: 'May 16', due: 'May 31', status: 'overdue',
          lines: [{ d: 'UI design sprint', q: 1, u: 7840 }] },
        { no: '2305', cust: 'Vasa Logistik',     addr: 'Hamngatan 12, 211 22 Malmö, SE',      amount: 64200, issued: 'May 12', due: 'Jun 11', status: 'paid',
          lines: [{ d: 'Fleet integration · annual', q: 1, u: 43360 }, { d: 'Priority support tier', q: 12, u: 700 }] },
        { no: '2302', cust: 'Hedlund &amp; Co',  addr: 'Storgatan 5, 903 25 Umeå, SE',        amount: 13750, issued: 'May 08', due: 'Jun 07', status: 'paid',
          lines: [{ d: 'Audit & compliance review', q: 1, u: 11000 }] },
        { no: '2300', cust: 'Aurora Medtech',    addr: 'Forskningsvägen 1, 583 30 Linköping, SE', amount: 38900, issued: 'May 04', due: 'May 19', status: 'overdue',
          lines: [{ d: 'Custom module development', q: 1, u: 24720 }, { d: 'Validation testing', q: 8, u: 880 }] },
        { no: '2298', cust: 'Kvarnström AB',     addr: 'Industrigatan 7, 721 30 Västerås, SE', amount: 21300, issued: 'Apr 30', due: 'May 30', status: 'paid',
          lines: [{ d: 'Quarterly subscription', q: 3, u: 5680 }] }
      ];
      const statusMap = STATUS_MAP;
      const tableCard = H.el(`
        <div class="card span-2 flush billing-table-card">
          <div class="card-head" style="padding:16px 16px 0">
            <h3><span class="hico">🧾</span> Invoices</h3>
            <div class="row gap-sm">
              <span class="ch-meta">${invoices.length} RECENT · ${invoices.filter(i => i.status !== 'paid').length} OPEN</span>
              <button class="btn btn-primary btn-sm" data-act="new-inline">＋ New invoice</button>
            </div>
          </div>
          <div class="billing-table-scroll">
            <table class="table billing-inv-table">
              <thead>
                <tr>
                  <th>Invoice</th><th>Customer</th><th class="num">Amount</th>
                  <th>Issued</th><th>Due</th><th>Status</th><th class="billing-actions-th">Actions</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `);
      const tbody = tableCard.querySelector('tbody');
      invoices.forEach(inv => {
        const st = statusMap[inv.status];
        // inline action depends on status: chase the overdue, send the rest
        const inlineRemind = inv.status === 'overdue';
        const row = H.el(`
          <tr data-no="${inv.no}">
            <td class="mono">#${inv.no}</td>
            <td>
              <div class="billing-cust"><span class="avatar sq" style="width:24px;height:24px;font-size:9px">${D.initials(inv.cust.replace('&amp;', '&'))}</span>${inv.cust}</div>
            </td>
            <td class="num mono">${H.fmt.money(inv.amount, 'kr')}</td>
            <td class="mono faint">${inv.issued}</td>
            <td class="mono">${inv.due}</td>
            <td><span class="pill ${st.cls} billing-row-pill">${st.label}</span></td>
            <td>
              <div class="billing-row-actions">
                <button class="btn btn-sm" data-row-act="view">View</button>
                ${inlineRemind
                  ? '<button class="btn btn-sm" data-row-act="remind">Remind</button>'
                  : '<button class="btn btn-sm" data-row-act="send">Send</button>'}
              </div>
            </td>
          </tr>
        `);
        // View → open the branded invoice overlay for this invoice
        row.querySelector('[data-row-act="view"]').addEventListener('click', () => openInvoice(inv));
        // inline Send / Remind → audit + toast + flip the status pill in place
        const inlineBtn = row.querySelector('[data-row-act="send"], [data-row-act="remind"]');
        if (inlineBtn) {
          inlineBtn.addEventListener('click', () => {
            if (inlineRemind) {
              H.audit.log({
                action: 'invoice.reminded', entityType: 'Invoice', entityId: 'inv-' + inv.no,
                summary: H.session.user.name + ' sent a payment reminder for invoice #' + inv.no + ' to ' + cleanName(inv.cust),
                amount: { value: inv.amount, currency: 'SEK' }, after: { reminded: true }
              });
              H.toast('Reminder sent — invoice #' + inv.no + ' · ' + cleanName(inv.cust), 'success');
            } else {
              H.audit.log({
                action: 'invoice.sent', entityType: 'Invoice', entityId: 'inv-' + inv.no,
                summary: H.session.user.name + ' sent invoice #' + inv.no + ' to ' + cleanName(inv.cust),
                amount: { value: inv.amount, currency: 'SEK' }, after: { status: 'sent' }
              });
              H.toast('Invoice #' + inv.no + ' sent to ' + cleanName(inv.cust), 'success');
              setRowStatus(inv.no, 'sent');
              inv.status = 'sent';
            }
          });
        }
        tbody.appendChild(row);
      });
      row3.appendChild(tableCard);

      // Overdue chase queue (attn rows + Send reminder)
      const chase = [
        { sev: 'bad', cust: 'Aurora Medtech', no: '2300', amt: 38900, days: 27 },
        { sev: 'bad', cust: 'Lykke Studios', no: '2311', amt: 18400, days: 7 },
        { sev: 'warn', cust: 'Bergström Design', no: '2307', amt: 9800, days: 15 }
      ];
      const chaseCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">⚠️</span> Overdue Chase Queue</h3>
            <span class="badge bad">${chase.length}</span>
          </div>
          <div class="billing-chase"></div>
          <button class="btn btn-sm btn-block mt" data-act="chase-all">✉️ Chase all overdue</button>
        </div>
      `);
      const chaseWrap = chaseCard.querySelector('.billing-chase');
      chase.forEach(c => {
        const node = H.el(`
          <div class="attn ${c.sev}">
            <span class="a-ico">${c.sev === 'bad' ? '🔴' : '🟠'}</span>
            <div class="a-body">
              <div class="a-title">${c.cust} · ${H.fmt.money(c.amt, 'kr')}</div>
              <div class="a-sub">#${c.no} — ${c.days} days overdue</div>
            </div>
            <button class="btn btn-sm" data-cust="${c.cust}">Send reminder</button>
          </div>
        `);
        node.querySelector('[data-cust]').addEventListener('click', () => {
          H.audit.log({
            action: 'invoice.reminded', entityType: 'Invoice', entityId: 'inv-' + c.no,
            summary: H.session.user.name + ' sent a payment reminder for invoice #' + c.no + ' to ' + c.cust,
            amount: { value: c.amt, currency: 'SEK' }, after: { reminded: true }
          });
          H.toast('Reminder sent to ' + c.cust + ' — invoice #' + c.no, 'success');
        });
        chaseWrap.appendChild(node);
      });
      row3.appendChild(chaseCard);
      root.appendChild(row3);

      /* ── ROW 4: billed vs collected trend (full width) ───────────────── */
      const billedTotal = billedSr.reduce((a, b) => a + b, 0);
      const collectedTotal = collected.reduce((a, b) => a + b, 0);
      const collectionRatio = Math.round((collectedTotal / billedTotal) * 100); // ~ on-time/collection efficiency
      const avgMonthly = Math.round(collectedTotal / collected.length);
      const trendCard = H.el(`
        <div class="card billing-trend-card">
          <div class="card-head">
            <h3><span class="hico">📈</span> Billed vs Collected</h3>
            <span class="ch-meta">TRAILING 12 MONTHS · SEK</span>
          </div>
          <div class="billing-trend-legend">
            <span class="btl billed"><i></i>BILLED</span>
            <span class="btl collected"><i></i>COLLECTED</span>
          </div>
          <div class="chart" style="height:210px">
            ${H.charts.area(billedSr, { height: 210, v2: collected, labels: [months12[0], months12[3], months12[6], months12[9], months12[11]] })}
          </div>
          <div class="billing-trend-stats">
            <div class="bts">
              <span class="bts-k">BILLED · 12M</span>
              <span class="bts-v">${H.fmt.money(billedTotal, 'kr')}</span>
            </div>
            <div class="bts">
              <span class="bts-k">COLLECTED · 12M</span>
              <span class="bts-v">${H.fmt.money(collectedTotal, 'kr')}</span>
            </div>
            <div class="bts">
              <span class="bts-k">COLLECTION RATE</span>
              <span class="bts-v ok">${collectionRatio}%</span>
            </div>
            <div class="bts">
              <span class="bts-k">AVG / MONTH</span>
              <span class="bts-v">${H.fmt.money(avgMonthly, 'kr')}</span>
            </div>
          </div>
        </div>
      `);
      root.appendChild(trendCard);

      /* ══════════════════════════════════════════════════════════════════
         INVOICE OVERLAY + BIFROST-BRANDED INVOICE DOCUMENT
         A centered modal (.billing-modal) appended to the module root, with a
         scrim, close button and Escape-to-close (listener added on open and
         removed on close — no permanent global listener). Inside sits a real
         printable invoice (.billing-doc) on a light "paper" panel, branded
         with the Bifrost aurora mark + issuer legal details from session.org.
         ══════════════════════════════════════════════════════════════════ */

      const org = (H.session && H.session.org) || {};
      const orgAddr = (org.addresses && org.addresses[0]) || {};
      const orgIds = org.identifiers || {};
      const VAT_RATE = 0.25; // moms

      function cleanName(s) { return String(s).replace(/&amp;/g, '&'); }

      // flip a table row's status pill in place after a state change
      function setRowStatus(no, status) {
        const st = STATUS_MAP[status]; if (!st) return;
        const rowEl = root.querySelector('tr[data-no="' + no + '"] .billing-row-pill');
        if (rowEl) { rowEl.className = 'pill ' + st.cls + ' billing-row-pill'; rowEl.textContent = st.label; }
      }

      // a single live modal at a time; track its Escape handler so we can detach
      let modalEl = null;
      let onKey = null;

      function closeInvoice() {
        if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
        if (modalEl) { modalEl.remove(); modalEl = null; }
      }

      /* openInvoice(inv, opts)
         inv: invoice record (or a preview shape). opts.preview=true draws the
         "+ New invoice" draft. Builds the modal, the Bifrost paper, and a live
         action bar wired to toasts + audit. */
      function openInvoice(inv, opts) {
        opts = opts || {};
        closeInvoice(); // never stack modals

        modalEl = H.el(`
          <div class="billing-modal" role="dialog" aria-modal="true" aria-label="Invoice #${inv.no}">
            <div class="billing-modal-scrim" data-modal-close></div>
            <div class="billing-modal-box">
              <button class="billing-modal-x" data-modal-close aria-label="Close">✕</button>
              <div class="billing-modal-scroll">
                ${buildInvoiceDoc(inv, opts)}
              </div>
              <div class="billing-modal-bar"></div>
            </div>
          </div>
        `);

        // ── action bar (outside the paper) ──────────────────────────────
        const bar = modalEl.querySelector('.billing-modal-bar');
        const isPreview = !!opts.preview;
        const custName = cleanName(inv.cust);
        const eid = 'inv-' + inv.no;

        // status-aware primary action label
        const actions = [];
        if (isPreview) {
          actions.push({ key: 'send', label: '✦ Send invoice', primary: true });
        } else if (inv.status === 'overdue') {
          actions.push({ key: 'remind', label: '✉️ Send reminder', primary: true });
          actions.push({ key: 'paid', label: '✓ Mark as paid' });
        } else if (inv.status === 'paid') {
          actions.push({ key: 'send', label: '↻ Resend receipt', primary: true });
        } else {
          actions.push({ key: 'send', label: '✦ Send invoice', primary: true });
          actions.push({ key: 'paid', label: '✓ Mark as paid' });
        }
        actions.push({ key: 'print', label: '⤓ Download / Print' });

        bar.appendChild(H.el('<div class="billing-bar-meta">Invoice <b>#' + inv.no + '</b> · ' + custName + '</div>'));
        const barBtns = H.el('<div class="billing-bar-btns"></div>');
        actions.forEach(a => {
          const b = H.el('<button class="btn btn-sm ' + (a.primary ? 'btn-primary' : '') + '" data-bar-act="' + a.key + '">' + a.label + '</button>');
          barBtns.appendChild(b);
        });
        bar.appendChild(barBtns);

        // ── wire the action bar ─────────────────────────────────────────
        barBtns.querySelectorAll('[data-bar-act]').forEach(b => {
          b.addEventListener('click', () => {
            const act = b.getAttribute('data-bar-act');
            if (act === 'send') {
              H.audit.log({
                action: 'invoice.sent', entityType: 'Invoice', entityId: eid,
                summary: H.session.user.name + (isPreview ? ' issued & sent' : ' sent') + ' invoice #' + inv.no + ' to ' + custName,
                amount: { value: inv.amount, currency: 'SEK' }, after: { status: 'sent' }
              });
              H.toast('Invoice #' + inv.no + ' sent to ' + custName, 'success');
              if (!isPreview && inv.status !== 'paid') { setRowStatus(inv.no, 'sent'); inv.status = 'sent'; }
              closeInvoice();
            } else if (act === 'remind') {
              H.audit.log({
                action: 'invoice.reminded', entityType: 'Invoice', entityId: eid,
                summary: H.session.user.name + ' sent a payment reminder for invoice #' + inv.no + ' to ' + custName,
                amount: { value: inv.amount, currency: 'SEK' }, after: { reminded: true }
              });
              H.toast('Reminder sent — invoice #' + inv.no + ' · ' + custName, 'success');
            } else if (act === 'paid') {
              H.audit.log({
                action: 'invoice.paid', entityType: 'Invoice', entityId: eid,
                summary: H.session.user.name + ' marked invoice #' + inv.no + ' paid — ' + H.fmt.money(inv.amount, '') + ' kr from ' + custName,
                amount: { value: inv.amount, currency: 'SEK' }, after: { status: 'paid' }
              });
              H.toast('Invoice #' + inv.no + ' marked paid · ' + H.fmt.money(inv.amount, 'kr'), 'success');
              setRowStatus(inv.no, 'paid'); inv.status = 'paid';
              // reflect the new state inside the open paper, then close
              const docPill = modalEl.querySelector('.billing-doc-status');
              if (docPill) { docPill.className = 'pill ok billing-doc-status'; docPill.textContent = 'PAID'; }
              closeInvoice();
            } else if (act === 'print') {
              H.toast('Preparing PDF for invoice #' + inv.no + '…', 'info');
              if (typeof window.print === 'function') { try { window.print(); } catch (e) {} }
            }
          });
        });

        // close affordances: scrim + ✕, and Escape (attached now, removed on close)
        modalEl.querySelectorAll('[data-modal-close]').forEach(x =>
          x.addEventListener('click', closeInvoice));
        onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeInvoice(); } };
        document.addEventListener('keydown', onKey);

        root.appendChild(modalEl);
        H.countAll(modalEl);
      }

      /* buildInvoiceDoc(inv, opts) → the Bifrost invoice paper HTML string.
         A light/near-white panel that reads like a printable invoice. */
      function buildInvoiceDoc(inv, opts) {
        opts = opts || {};
        const st = STATUS_MAP[inv.status] || STATUS_MAP.draft;
        const lines = inv.lines || [];
        const subtotal = lines.reduce((a, l) => a + l.q * l.u, 0);
        const vat = Math.round(subtotal * VAT_RATE);
        const total = subtotal + vat;
        const issuerCity = [orgAddr.zip, orgAddr.city].filter(Boolean).join(' ');
        const issuerLines = [
          orgAddr.line1,
          issuerCity,
          (org.country || orgAddr.country) === 'SE' ? 'Sweden' : (org.country || orgAddr.country || '')
        ].filter(Boolean).join(' · ');
        // a deterministic OCR/reference number from the invoice no
        const ocr = '90' + inv.no + String((parseInt(inv.no, 10) * 7) % 10);

        const lineRows = lines.map(l => `
          <tr>
            <td class="billing-doc-desc">${l.d}</td>
            <td class="billing-doc-num">${l.q}</td>
            <td class="billing-doc-num">${H.fmt.money(l.u, 'kr')}</td>
            <td class="billing-doc-num billing-doc-amt">${H.fmt.money(l.q * l.u, 'kr')}</td>
          </tr>`).join('');

        return `
          <div class="billing-doc">
            <!-- branded header: aurora mark + wordmark + issuer legal details -->
            <div class="billing-doc-head">
              <div class="billing-doc-brand">
                <span class="billing-doc-mark">${BIFROST_MARK}</span>
                <div class="billing-doc-brandtext">
                  <div class="billing-doc-word">bifrost</div>
                  <div class="billing-doc-issuer">${org.name || 'Bifrost'}</div>
                </div>
              </div>
              <div class="billing-doc-issuer-legal">
                <div>${issuerLines}</div>
                <div>Org.nr ${orgIds.orgNo || '—'} · VAT ${orgIds.vat || '—'}</div>
              </div>
            </div>

            <!-- title + meta row -->
            <div class="billing-doc-title-row">
              <div>
                <div class="billing-doc-title">INVOICE</div>
                <div class="billing-doc-no">#${inv.no}</div>
              </div>
              <div class="billing-doc-meta">
                <div class="billing-doc-meta-row"><span>Issue date</span><b>${inv.issued || '—'}</b></div>
                <div class="billing-doc-meta-row"><span>Due date</span><b>${inv.due || '—'}</b></div>
                <div class="billing-doc-meta-row"><span>Status</span><span class="pill ${st.cls} billing-doc-status">${st.label}</span></div>
              </div>
            </div>

            <!-- bill-to -->
            <div class="billing-doc-billto">
              <div class="billing-doc-billto-label">BILL TO</div>
              <div class="billing-doc-billto-body">
                <span class="billing-doc-mono">${D.initials(cleanName(inv.cust))}</span>
                <div>
                  <div class="billing-doc-cust">${inv.cust}</div>
                  <div class="billing-doc-addr">${inv.addr || ''}</div>
                </div>
              </div>
            </div>

            <!-- line items -->
            <table class="billing-doc-table">
              <thead>
                <tr><th>Description</th><th class="billing-doc-num">Qty</th><th class="billing-doc-num">Unit price</th><th class="billing-doc-num">Amount</th></tr>
              </thead>
              <tbody>${lineRows}</tbody>
            </table>

            <!-- totals -->
            <div class="billing-doc-totals">
              <div class="billing-doc-total-row"><span>Subtotal</span><b>${H.fmt.money(subtotal, 'kr')}</b></div>
              <div class="billing-doc-total-row"><span>VAT / moms 25%</span><b>${H.fmt.money(vat, 'kr')}</b></div>
              <div class="billing-doc-total-row grand"><span>TOTAL</span><b>${H.fmt.money(total, 'kr')}</b></div>
            </div>

            <!-- payment block -->
            <div class="billing-doc-pay">
              <div class="billing-doc-pay-col">
                <div class="billing-doc-pay-label">PAYMENT</div>
                <div class="billing-doc-pay-row"><span>Bankgiro</span><b>5512-3456</b></div>
                <div class="billing-doc-pay-row"><span>IBAN</span><b>SE45 5000 0000 0583 9825 7466</b></div>
                <div class="billing-doc-pay-row"><span>Swish</span><b>123 456 78 90</b></div>
              </div>
              <div class="billing-doc-pay-col">
                <div class="billing-doc-pay-label">REFERENCE</div>
                <div class="billing-doc-pay-row"><span>Terms</span><b>Net 30</b></div>
                <div class="billing-doc-pay-row"><span>OCR / ref</span><b>${ocr}</b></div>
                <div class="billing-doc-pay-row"><span>Currency</span><b>${org.fiscalCurrency || 'SEK'}</b></div>
              </div>
            </div>

            <!-- footer note + aurora keyline -->
            <div class="billing-doc-keyline"></div>
            <div class="billing-doc-foot">
              Thank you for your business. Payment is due within 30 days; late
              payment interest accrues per the Swedish Interest Act (Räntelagen).
              Questions? billing@${(org.name || 'bifrost').toLowerCase().replace(/[^a-z]/g, '').slice(0, 10) || 'bifrost'}.se
            </div>
          </div>`;
      }

      /* ── wire view-head + footer actions ─────────────────────────────── */
      // "+ New invoice" (view-head + inline in the table) → open the overlay in
      // preview mode with a deterministic draft for the next invoice number.
      function newInvoicePreview() {
        const nextNo = String(Math.max.apply(null, invoices.map(i => parseInt(i.no, 10))) + 1);
        const draft = {
          no: nextNo, cust: 'New customer', addr: 'Add billing address…',
          issued: 'Today', due: 'Net 30', status: 'draft', amount: 0,
          lines: [{ d: 'Add a line item…', q: 1, u: 0 }]
        };
        openInvoice(draft, { preview: true });
      }

      root.querySelector('[data-act="new"]').addEventListener('click', newInvoicePreview);
      const newInline = root.querySelector('[data-act="new-inline"]');
      if (newInline) newInline.addEventListener('click', newInvoicePreview);
      root.querySelector('[data-act="statements"]').addEventListener('click', () => H.toast('Monthly statements queued to 42 accounts', 'success'));
      root.querySelector('[data-act="chase-all"]').addEventListener('click', () => H.toast('Chase sequence queued to ' + chase.length + ' overdue accounts', 'info'));
    }
  });
})();
