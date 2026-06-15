/* ============================================================================
   customers.js — Customers / CRM module.
   Customer directory & CRM: who they are, health, value.
   Sections: NPS gauge · KPI row · segments donut · main customers table
             · at-risk attention list · selectable customer detail mini-card.
   Follows the HELM module contract (see command.js). Deterministic data only.
   ========================================================================== */
(function () {
  const H = window.HELM;

  H.register({
    id: 'customers',
    label: 'Customers',
    icon: '👥',
    render(root) {
      const D = H.data;

      /* ── deterministic roster ─────────────────────────────────────────── */
      // owners (account managers) — small fixed crew
      const OWNERS = {
        EL: 'Elin Lindqvist',
        MF: 'Marcus Forsberg',
        SA: 'Sofia Ahlberg',
        JN: 'Johan Nyström'
      };

      // plan → tag severity class for colour
      const PLAN_CLS = { Enterprise: 'info', Growth: 'ok', Starter: '' };

      // the customer roster (deterministic; mrr/health derived from seeds)
      const ROSTER = [
        { name: 'Northwind AB', plan: 'Enterprise', industry: 'Logistics', owner: 'EL', city: 'Stockholm', since: '2024', seats: 48, nps: 9 },
        { name: 'Lykke Studios', plan: 'Growth', industry: 'Creative', owner: 'SA', city: 'Göteborg', since: '2025', seats: 12, nps: 8 },
        { name: 'Forsberg Konsult', plan: 'Growth', industry: 'Consulting', owner: 'MF', city: 'Malmö', since: '2024', seats: 22, nps: 7 },
        { name: 'Aurora Fintech', plan: 'Enterprise', industry: 'Fintech', owner: 'JN', city: 'Stockholm', since: '2023', seats: 86, nps: 9 },
        { name: 'Bergström Bygg', plan: 'Starter', industry: 'Construction', owner: 'MF', city: 'Uppsala', since: '2026', seats: 6, nps: 5 },
        { name: 'Saga Retail', plan: 'Growth', industry: 'Retail', owner: 'SA', city: 'Linköping', since: '2025', seats: 18, nps: 6 },
        { name: 'Nordkvist Logistik', plan: 'Enterprise', industry: 'Logistics', owner: 'EL', city: 'Helsingborg', since: '2024', seats: 64, nps: 8 },
        { name: 'Vinter Labs', plan: 'Starter', industry: 'Biotech', owner: 'JN', city: 'Lund', since: '2026', seats: 4, nps: 3 },
        { name: 'Hammar & Co', plan: 'Growth', industry: 'Consulting', owner: 'MF', city: 'Örebro', since: '2025', seats: 16, nps: 7 },
        { name: 'Solvik Energi', plan: 'Enterprise', industry: 'Energy', owner: 'EL', city: 'Västerås', since: '2023', seats: 52, nps: 9 },
        { name: 'Klang Audio', plan: 'Starter', industry: 'Hardware', owner: 'SA', city: 'Norrköping', since: '2026', seats: 8, nps: 4 },
        { name: 'Frost Mobility', plan: 'Growth', industry: 'Mobility', owner: 'JN', city: 'Umeå', since: '2025', seats: 20, nps: 6 }
      ];

      // derive mrr (kr) + health (0..100) + last-seen days, deterministically
      ROSTER.forEach(c => {
        const planBase = c.plan === 'Enterprise' ? 24000 : c.plan === 'Growth' ? 9000 : 2400;
        c.mrr = planBase + D.int('cust-mrr-' + c.name, 0, planBase) ;
        // health blends nps + a stable jitter
        c.health = Math.max(8, Math.min(99, c.nps * 9 + D.int('cust-h-' + c.name, -6, 10)));
        c.lastDays = D.int('cust-seen-' + c.name, 0, 38);
        c.trend = D.series('cust-tr-' + c.name, 12, c.mrr * 0.72, c.mrr, 0.14);
      });

      // the accounts surfaced in the "At Risk" list below — single source of truth
      const RISK_NAMES = ['Vinter Labs', 'Klang Audio', 'Bergström Bygg', 'Saga Retail'];

      const totalCustomers = 1284;
      const activeCustomers = 1147;
      const newThisMonth = 38;
      const atRiskCount = RISK_NAMES.length; // KPI, badge & risk list all agree

      const nps = 62;

      // segments by plan (counts across the whole base, not just the page)
      const segments = [
        { label: 'Enterprise', value: 296, color: 'var(--accent2)' },
        { label: 'Growth', value: 612, color: 'var(--accent1)' },
        { label: 'Starter', value: 376, color: 'var(--accent3)' }
      ];

      /* ── helpers ──────────────────────────────────────────────────────── */
      // NB: H.fmt.money treats a '' currency as falsy and falls back to '$',
      // so we render with the default symbol and swap it for a ' kr' suffix.
      const kr = n => H.fmt.money(n).replace(/^-?\$/, m => m.replace('$', '')) + ' kr';
      const healthCls = h => h >= 70 ? '' : h >= 45 ? 'warn' : 'bad';
      const lastSeen = d => d === 0 ? 'today' : d === 1 ? 'yesterday' : d + 'd ago';
      const avatar = (name, sq) =>
        `<div class="avatar${sq ? ' sq' : ''}">${H.data.initials(name)}</div>`;

      /* ── VIEW HEAD ────────────────────────────────────────────────────── */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">👥</div>
            <div>
              <h1>Customers</h1>
              <p>Who they are, how healthy they are, what they're worth.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="segment">⊞ Segment</button>
            <button class="btn btn-primary btn-sm" data-act="add">＋ Add customer</button>
          </div>
        </div>
      `));

      /* ── ROW 1: NPS gauge | KPI row (2×2) | segments donut ────────────── */
      const row1 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // NPS gauge card
      const npsCard = H.el(`
        <div class="card glow customers-nps">
          <div class="card-head">
            <h3><span class="hico">📣</span> NPS</h3>
            <span class="ch-meta">PROMOTER SCORE</span>
          </div>
          <div class="customers-gauge-wrap">
            <div class="chart" style="height:168px">
              ${H.charts.gauge(nps, { max: 100, size: 200, arc: 250 })}
            </div>
          </div>
          <div class="row between customers-nps-legend">
            <span class="customers-nps-chip"><i class="dot-bad"></i>Detractors · 8%</span>
            <span class="customers-nps-chip"><i class="dot-mid"></i>Passive · 22%</span>
            <span class="customers-nps-chip"><i class="dot-ok"></i>Promoters · 70%</span>
          </div>
        </div>
      `);
      row1.appendChild(npsCard);

      // KPI 2×2 card
      const kpis = [
        { label: 'TOTAL CUSTOMERS', count: totalCustomers, fmt: 'num', trend: '+18', dir: 'up' },
        { label: 'ACTIVE', count: activeCustomers, fmt: 'num', trend: '86%', dir: 'flat' },
        { label: 'NEW · THIS MONTH', count: newThisMonth, fmt: 'num', trend: '+5', dir: 'up' },
        { label: 'AT RISK', count: atRiskCount, fmt: 'num', trend: '-1', dir: 'down' }
      ];
      const kpiCard = H.el(`
        <div class="card customers-kpis">
          <div class="card-head">
            <h3><span class="hico">📊</span> Base Health</h3>
            <span class="ch-meta">SNAPSHOT</span>
          </div>
          <div class="grid cols-2 customers-kpi-grid"></div>
        </div>
      `);
      const kpiGrid = kpiCard.querySelector('.customers-kpi-grid');
      kpis.forEach(k => {
        kpiGrid.appendChild(H.el(`
          <div class="kpi customers-kpi">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-value sm" data-count="${k.count}" data-fmt="${k.fmt}">0</div>
            <span class="kpi-trend ${k.dir}">${k.trend}</span>
          </div>
        `));
      });
      row1.appendChild(kpiCard);

      // Segments donut card
      const segTotal = segments.reduce((a, s) => a + s.value, 0); // === totalCustomers (248)
      const donutCard = H.el(`
        <div class="card customers-seg">
          <div class="card-head">
            <h3><span class="hico">🧩</span> By Plan</h3>
            <span class="ch-meta">${segTotal} ACCOUNTS</span>
          </div>
          <div class="customers-seg-body">
            <div class="chart customers-donut" style="height:150px;width:150px">
              ${H.charts.donut(segments, { size: 150, thickness: 20, center: { value: String(segTotal), label: 'TOTAL' } })}
            </div>
            <div class="customers-seg-legend"></div>
          </div>
        </div>
      `);
      const segLegend = donutCard.querySelector('.customers-seg-legend');
      segments.forEach(s => {
        segLegend.appendChild(H.el(`
          <div class="customers-seg-row">
            <span class="customers-seg-key" style="background:${s.color}"></span>
            <span class="customers-seg-name">${s.label}</span>
            <span class="customers-seg-val">${s.value}</span>
          </div>
        `));
      });
      row1.appendChild(donutCard);
      root.appendChild(row1);

      /* ── ROW 2: main customers table (span 2) | detail mini-card ──────── */
      const row2 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // ----- TABLE -----
      const tableCard = H.el(`
        <div class="card span-2 flush customers-table-card">
          <div class="card-head customers-table-head">
            <h3><span class="hico">📇</span> Customer Directory</h3>
            <span class="ch-meta">${ROSTER.length} OF 1,284 · SORTED BY MRR</span>
          </div>
          <div class="customers-table-scroll">
            <table class="table customers-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Plan</th>
                  <th class="num">MRR</th>
                  <th>Health</th>
                  <th>Last seen</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `);
      const tbody = tableCard.querySelector('tbody');

      // sort by MRR desc for a "best first" directory
      const sorted = ROSTER.slice().sort((a, b) => b.mrr - a.mrr);

      sorted.forEach((c, i) => {
        const tr = H.el(`
          <tr data-cust="${c.name}" class="customers-row${i === 0 ? ' is-selected' : ''}">
            <td>
              <div class="customers-acct">
                ${avatar(c.name, true)}
                <div class="customers-acct-body">
                  <div class="customers-acct-name">${c.name}</div>
                  <div class="customers-acct-sub">${c.industry} · ${c.city}</div>
                </div>
              </div>
            </td>
            <td><span class="tag ${PLAN_CLS[c.plan]}">${c.plan}</span></td>
            <td class="num mono">${kr(c.mrr)}</td>
            <td>
              <div class="customers-health">
                <div class="progress customers-health-bar"><div class="bar ${healthCls(c.health)}" style="width:0"></div></div>
                <span class="customers-health-num ${healthCls(c.health)}">${c.health}</span>
              </div>
            </td>
            <td class="customers-seen ${c.lastDays > 21 ? 'is-stale' : ''}">${lastSeen(c.lastDays)}</td>
            <td>
              <div class="customers-owner" title="${OWNERS[c.owner]}">
                <div class="avatar">${c.owner}</div>
              </div>
            </td>
          </tr>
        `);
        tbody.appendChild(tr);
        // animate the health bar fill after mount
        const bar = tr.querySelector('.bar');
        setTimeout(() => { bar.style.width = c.health + '%'; }, 240 + i * 30);
      });
      row2.appendChild(tableCard);

      // ----- DETAIL MINI-CARD (panel) -----
      const detailCard = H.el(`
        <div class="card customers-detail">
          <div class="card-head">
            <h3><span class="hico">🪪</span> Account</h3>
            <span class="ch-meta">SELECTED</span>
          </div>
          <div class="customers-detail-body"></div>
        </div>
      `);
      const detailBody = detailCard.querySelector('.customers-detail-body');

      function renderDetail(c) {
        const o = OWNERS[c.owner];
        const ltv = c.mrr * 18; // rough lifetime value proxy
        const trendUp = c.trend[c.trend.length - 1] >= c.trend[0];
        detailBody.innerHTML = (`
          <div class="customers-detail-top">
            <div class="avatar lg sq">${H.data.initials(c.name)}</div>
            <div class="customers-detail-id">
              <div class="customers-detail-name">${c.name}</div>
              <div class="customers-detail-meta">${c.industry} · ${c.city}</div>
              <div class="customers-detail-tags">
                <span class="tag ${PLAN_CLS[c.plan]}">${c.plan}</span>
                <span class="pill ${c.health >= 70 ? 'ok' : c.health >= 45 ? 'warn' : 'bad'}">${c.health >= 70 ? 'Healthy' : c.health >= 45 ? 'Watch' : 'At risk'}</span>
              </div>
            </div>
          </div>

          <div class="customers-detail-spark">
            <div class="row between">
              <span class="customers-detail-sparklabel">MRR · 12 MO</span>
              <span class="kpi-trend ${trendUp ? 'up' : 'down'}">${trendUp ? '+' : '−'}${Math.abs(Math.round((c.trend[c.trend.length - 1] / c.trend[0] - 1) * 100))}%</span>
            </div>
            <div class="spark">${H.charts.spark(c.trend, { height: 40 })}</div>
          </div>

          <div class="customers-detail-stats">
            <div class="stat-row"><span class="sr-label">MRR</span><span class="sr-val">${kr(c.mrr)}</span></div>
            <div class="stat-row"><span class="sr-label">Est. lifetime value</span><span class="sr-val">${kr(ltv)}</span></div>
            <div class="stat-row"><span class="sr-label">Seats</span><span class="sr-val">${c.seats}</span></div>
            <div class="stat-row"><span class="sr-label">Health score</span><span class="sr-val">${c.health} / 100</span></div>
            <div class="stat-row"><span class="sr-label">NPS rating</span><span class="sr-val">${c.nps} / 10</span></div>
            <div class="stat-row"><span class="sr-label">Customer since</span><span class="sr-val">${c.since}</span></div>
            <div class="stat-row"><span class="sr-label">Last seen</span><span class="sr-val">${lastSeen(c.lastDays)}</span></div>
          </div>

          <div class="customers-detail-owner">
            <div class="avatar">${c.owner}</div>
            <div class="customers-detail-owner-body">
              <div class="customers-detail-owner-name">${o}</div>
              <div class="customers-detail-owner-role">Account owner</div>
            </div>
            <span class="pill info">● ACTIVE</span>
          </div>

          <div class="customers-detail-actions row gap-sm">
            <button class="btn btn-sm btn-primary btn-block" data-d-act="open">Open account</button>
            <button class="btn btn-sm" data-d-act="email">✉</button>
          </div>
        `);
        // wire the detail's own buttons
        detailBody.querySelector('[data-d-act="open"]')
          .addEventListener('click', () => H.toast('Opening ' + c.name + '…', 'info'));
        detailBody.querySelector('[data-d-act="email"]')
          .addEventListener('click', () => H.toast('Drafting email to ' + c.name, 'info'));
      }

      // initial selection = top MRR account
      let selected = sorted[0];
      renderDetail(selected);

      // row click → select + refresh detail
      tbody.addEventListener('click', e => {
        const tr = e.target.closest('tr[data-cust]');
        if (!tr) return;
        const c = ROSTER.find(x => x.name === tr.dataset.cust);
        if (!c) return;
        selected = c;
        tbody.querySelectorAll('tr').forEach(r => r.classList.toggle('is-selected', r === tr));
        renderDetail(c);
      });

      row2.appendChild(detailCard);
      root.appendChild(row2);

      /* ── ROW 3: at-risk attention list (span 2) | quick CRM stats ─────── */
      const row3 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // At-risk attention list
      const riskCard = H.el(`
        <div class="card span-2 customers-risk">
          <div class="card-head">
            <h3><span class="hico">⚠️</span> At Risk · Needs a Touch</h3>
            <span class="badge bad customers-risk-count">0</span>
          </div>
          <div class="customers-risk-stack"></div>
        </div>
      `);
      const riskStack = riskCard.querySelector('.customers-risk-stack');
      // helper: look up the live (derived) record so risk copy can't contradict the table
      const recOf = name => ROSTER.find(x => x.name === name) || {};
      const riskItems = [
        { sev: 'bad', ico: '📉', title: `Vinter Labs · health ${recOf('Vinter Labs').health}`, sub: 'No login in 31 days · renewal in 6 weeks', cust: 'Vinter Labs' },
        { sev: 'bad', ico: '🚪', title: 'Klang Audio · downgrade signal', sub: 'Dropped 2 seats · support ticket open', cust: 'Klang Audio' },
        { sev: 'warn', ico: '💳', title: 'Bergström Bygg · invoice overdue', sub: '2 400 kr · 19 days past due', cust: 'Bergström Bygg' },
        { sev: 'warn', ico: '😐', title: `Saga Retail · NPS dipped to ${recOf('Saga Retail').nps}`, sub: 'Detractor survey · owner: Sofia Ahlberg', cust: 'Saga Retail' }
      ];
      riskItems.forEach(a => {
        const node = H.el(`
          <div class="attn ${a.sev}">
            <span class="a-ico">${a.ico}</span>
            <div class="a-body"><div class="a-title">${a.title}</div><div class="a-sub">${a.sub}</div></div>
            <button class="btn btn-sm" data-risk="${a.cust}">Open</button>
          </div>
        `);
        node.querySelector('[data-risk]').addEventListener('click', () => {
          const c = ROSTER.find(x => x.name === a.cust);
          if (c) {
            selected = c;
            tbody.querySelectorAll('tr').forEach(r => r.classList.toggle('is-selected', r.dataset.cust === c.name));
            renderDetail(c);
            const tr = tbody.querySelector(`tr[data-cust="${CSS.escape(c.name)}"]`);
            tr && tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            H.toast('Focused ' + c.name + ' — see Account panel', 'warn');
          } else {
            H.show('customers');
          }
        });
        riskStack.appendChild(node);
      });
      // badge mirrors the visible at-risk list (and the AT RISK KPI)
      riskCard.querySelector('.customers-risk-count').textContent = riskItems.length;
      row3.appendChild(riskCard);

      // Portfolio figures — derived from the roster + segments so they can't
      // contradict the directory table (per-plan avg MRR × whole-base counts).
      const planAvgMrr = {};
      ['Enterprise', 'Growth', 'Starter'].forEach(p => {
        const list = ROSTER.filter(c => c.plan === p);
        planAvgMrr[p] = list.reduce((a, c) => a + c.mrr, 0) / list.length;
      });
      const planCount = {}; segments.forEach(s => { planCount[s.label] = s.value; });
      const totalMrr = Math.round(
        planAvgMrr.Enterprise * planCount.Enterprise +
        planAvgMrr.Growth * planCount.Growth +
        planAvgMrr.Starter * planCount.Starter);
      const avgMrr = Math.round(totalMrr / segTotal);
      const avgHealth = Math.round(ROSTER.reduce((a, c) => a + c.health, 0) / ROSTER.length);

      // Quick CRM stats card (lifetime value / retention etc.)
      const crmCard = H.el(`
        <div class="card customers-crm">
          <div class="card-head">
            <h3><span class="hico">💎</span> Portfolio</h3>
            <span class="ch-meta">ALL ACCOUNTS</span>
          </div>
          <div class="customers-crm-stats">
            <div class="stat-row"><span class="sr-label">Total MRR</span><span class="sr-val">${kr(totalMrr)}</span></div>
            <div class="stat-row"><span class="sr-label">Avg. MRR / account</span><span class="sr-val">${kr(avgMrr)}</span></div>
            <div class="stat-row"><span class="sr-label">Net revenue retention</span><span class="sr-val">112%</span></div>
            <div class="stat-row"><span class="sr-label">Logo churn · 30d</span><span class="sr-val">2.1%</span></div>
            <div class="stat-row"><span class="sr-label">Avg. health</span><span class="sr-val">${avgHealth} / 100</span></div>
          </div>
          <button class="btn btn-sm btn-block mt-sm" data-act="cmdk">⌘K · Run a play</button>
        </div>
      `);
      row3.appendChild(crmCard);
      root.appendChild(row3);

      /* ── wire view-head + misc actions (no global keys) ───────────────── */
      root.querySelector('[data-act="add"]')
        .addEventListener('click', () => H.toast('New customer form opened', 'info'));
      root.querySelector('[data-act="segment"]')
        .addEventListener('click', () => H.toast('Segment builder — group by plan, health, owner', 'info'));
      root.querySelector('[data-act="cmdk"]')
        .addEventListener('click', () => H.openCmdk());

      // count-ups auto-run by the shell after render().
    }
  });
})();
