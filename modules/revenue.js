/* ============================================================================
   revenue.js — the Revenue & MRR engine.
   "The growth machine": recurring revenue, expansion, churn.
   Follows the command.js reference shape exactly:
     1) HELM.register({id,label,icon,render})
     2) build DOM with H.el(...) + ONLY documented classes + HELM.charts
     3) deterministic mock data via H.data (no Math.random / no Date)
     4) every button wired to H.toast / H.show / H.openCmdk
   Module-local widgets (legends, MRR bridge, cohort heat-grid) are namespaced
   in revenue.css under .revenue-* using palette tokens only.
   ========================================================================== */
(function () {
  const H = window.HELM;

  H.register({
    id: 'revenue',
    label: 'Revenue',
    icon: '💹',
    render(root) {
      const D = H.data;
      const S = H.session;
      const M = D.months;
      // Swedish company — show money in kronor consistently across this module.
      const kr = (n) => H.fmt.money(n, 'kr ');
      // gate: booking revenue is a finance-level write (revenue.write → min role finance)
      const canWrite = S.can('revenue.write');

      /* ── deterministic data ──────────────────────────────────────────── */
      // 24-month MRR climb (kronor) with a soft forecast tail after month 19.
      const mrrSeries = D.series('rev-mrr', 24, 214000, 482000, 0.06);   // monthly MRR ↗
      const targetSeries = D.series('rev-target', 24, 230000, 520000, 0.02); // plan/target line
      const FORECAST_FROM = 19;

      // 24 month axis labels (compact: every ~6 months)
      const heroLabels = ['M1', 'M6', 'M12', 'M18', 'NOW', '+5'];

      // MRR movement: new vs churned MRR per month (last 8 months)
      const months8 = M.slice(0, 8);
      const newMrr = D.series('rev-new', 8, 24000, 41000, 0.18);
      const churnMrr = D.series('rev-churn', 8, 9000, 14000, 0.22);

      // KPI sparks (14 pts each, distinct names so each is stable)
      const sparkMrr = D.series('rev-k-mrr', 14, 360, 482, 0.05);
      const sparkArr = D.series('rev-k-arr', 14, 4100, 5784, 0.05);
      const sparkArpu = D.series('rev-k-arpu', 14, 318, 376, 0.07);
      const sparkNrr = D.series('rev-k-nrr', 14, 104, 114, 0.04);
      const sparkChurn = D.series('rev-k-chrn', 14, 28, 21, 0.20);

      /* ── view header ─────────────────────────────────────────────────── */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">💹</div>
            <div>
              <h1>Revenue</h1>
              <p>The growth machine — recurring revenue, expansion and churn in one engine.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="export">↧ Export MRR</button>
            <button class="btn btn-ghost btn-sm" data-act="stripe">◇ Open Stripe</button>
            <button class="btn btn-primary btn-sm" data-act="forecast">⤴ Run forecast</button>
          </div>
        </div>
      `));

      /* ── HERO: MRR area chart over 24 months w/ forecast ─────────────── */
      const hero = H.el(`
        <div class="card glow pad-lg revenue-hero" style="margin-bottom:var(--gap)">
          <div class="card-head">
            <h3><span class="hico">📈</span> Monthly Recurring Revenue</h3>
            <span class="ch-meta">24 MONTHS · KR · FORECAST +5M</span>
          </div>
          <div class="revenue-legend">
            <span class="rl actual"><i></i>ACTUAL</span>
            <span class="rl target"><i></i>TARGET</span>
            <span class="rl forecast"><i></i>FORECAST</span>
          </div>
          <div class="row wrap" style="gap:22px;align-items:baseline;margin-bottom:6px">
            <div>
              <div class="kpi-label">CURRENT MRR</div>
              <div class="big-num" data-count="482000" data-fmt="num" data-prefix="kr ">0</div>
            </div>
            <span class="kpi-trend up">+12.4% QoQ</span>
            <div class="muted" style="font-size:12px">Tracking <b style="color:var(--warn)">93%</b> of plan · projected <b style="color:var(--accent1)">kr 561K</b> by +5M</div>
          </div>
          <div class="chart" style="height:248px">
            ${H.charts.area(mrrSeries, { height: 248, v2: targetSeries, forecastFrom: FORECAST_FROM, labels: heroLabels })}
          </div>
        </div>
      `);
      root.appendChild(hero);

      /* ── KPI ROW: MRR · ARR · ARPU · NRR with count-up + spark + trend ─ */
      // money KPIs render via 'num' + a 'kr ' prefix so they stay in kronor
      // (data-fmt="money" would force the engine's default '$').
      const kpis = [
        { label: 'MRR', count: 482000, fmt: 'num', prefix: 'kr ', sub: 'Recurring · monthly', trend: '+12.4%', dir: 'up', spark: sparkMrr },
        { label: 'ARR', count: 5784000, fmt: 'num', prefix: 'kr ', sub: 'Annualised run-rate', trend: '+38.2%', dir: 'up', spark: sparkArr },
        { label: 'ARPU', count: 376, fmt: 'num', prefix: 'kr ', sub: 'Per active account', trend: '+4.1%', dir: 'up', spark: sparkArpu },
        { label: 'NET REVENUE RETENTION', count: 113, fmt: 'num', sub: 'Expansion − churn', trend: '+2.0pp', dir: 'up', spark: sparkNrr, suffix: '%' }
      ];
      const krow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
      kpis.forEach(k => {
        krow.appendChild(H.el(`
          <div class="card revenue-kpi kpi">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-value" data-count="${k.count}" data-fmt="${k.fmt}" ${k.prefix ? `data-prefix="${k.prefix}"` : ''} ${k.suffix ? `data-suffix="${k.suffix}"` : ''}>0</div>
            <div class="row between mt-sm">
              <span class="kpi-sub">${k.sub}</span>
              <span class="kpi-trend ${k.dir}">${k.trend}</span>
            </div>
            <div class="spark">${H.charts.spark(k.spark)}</div>
          </div>
        `));
      });
      root.appendChild(krow);

      /* ── MOVEMENT ROW: grouped bars (new vs churned) | net-new bridge ── */
      const moveRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // grouped bars — new vs churned MRR by month
      moveRow.appendChild(H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">📊</span> MRR Movement</h3>
            <div class="revenue-movelegend">
              <span class="ml new"><i></i>NEW + EXPANSION</span>
              <span class="ml churn"><i></i>CHURNED</span>
            </div>
          </div>
          <div class="chart" style="height:210px">
            ${H.charts.bars(newMrr.map((v, i) => ({ label: months8[i], value: v })), { height: 210, b: churnMrr })}
          </div>
          <div class="row between mt-sm">
            <span class="muted" style="font-size:12px">Net-new this month <b style="color:var(--success)">+kr 26.4K</b></span>
            <button class="btn btn-sm" data-go="customers">View accounts</button>
          </div>
        </div>
      `));

      // net-new bridge (waterfall as labelled bars)
      const bridgeRows = [
        { name: 'New business', value: 21400, max: 21400, pos: true, col: 'var(--accent1)' },
        { name: 'Expansion', value: 14200, max: 21400, pos: true, col: 'var(--accent2)' },
        { name: 'Reactivation', value: 3800, max: 21400, pos: true, col: 'var(--accent3)' },
        { name: 'Contraction', value: -4600, max: 21400, pos: false, col: 'var(--warn)' },
        { name: 'Churn', value: -8400, max: 21400, pos: false, col: 'var(--danger)' }
      ];
      const bridgeCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🔀</span> Net-New Bridge</h3>
            <span class="ch-meta">THIS MONTH</span>
          </div>
          <div class="revenue-bridge"></div>
        </div>
      `);
      const bridge = bridgeCard.querySelector('.revenue-bridge');
      bridgeRows.forEach(r => {
        const pct = Math.round((Math.abs(r.value) / r.max) * 100);
        const node = H.el(`
          <div class="rb-row">
            <span class="rb-name"><span class="rb-dot" style="background:${r.col}"></span>${r.name}</span>
            <div class="rb-track"><div class="rb-fill" style="width:0;background:${r.col}"></div></div>
            <span class="rb-val ${r.pos ? 'pos' : 'neg'}">${r.pos ? '+' : '−'}${kr(Math.abs(r.value))}</span>
          </div>
        `);
        bridge.appendChild(node);
        const fill = node.querySelector('.rb-fill');
        setTimeout(() => { fill.style.width = pct + '%'; }, 250);
      });
      bridge.appendChild(H.el(`
        <div class="rb-row rb-net">
          <span class="rb-name">Net new MRR</span>
          <div class="rb-track"><div class="rb-fill" style="width:84%;background:var(--accent-grad)"></div></div>
          <span class="rb-val">+${kr(26400)}</span>
        </div>
      `));
      moveRow.appendChild(bridgeCard);
      root.appendChild(moveRow);

      /* ── PLAN MIX (donut) | TOP ACCOUNTS (table) ─────────────────────── */
      const planRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // revenue-by-plan donut
      // Account counts sum to 1284 — the canonical CUSTOMERS figure the Tape and
      // Command Deck show — and divide total MRR 482K to ARPU ≈ kr 376, keeping
      // this card coherent with the ARPU KPI above and the shell's CUSTOMERS chip.
      const plans = [
        { label: 'Enterprise', value: 214000, accts: 38, col: 'var(--accent1)' },
        { label: 'Growth', value: 158000, accts: 142, col: 'var(--accent2)' },
        { label: 'Studio', value: 74000, accts: 286, col: 'var(--accent3)' },
        { label: 'Starter', value: 36000, accts: 818, col: 'var(--warn)' }
      ];
      const TOTAL_CUSTOMERS = plans.reduce((a, p) => a + p.accts, 0); // === 1284 (matches Command)
      const planTotal = plans.reduce((a, p) => a + p.value, 0);
      const planCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🍩</span> Revenue by Plan</h3>
            <span class="ch-meta">MRR SPLIT · ${H.fmt.num(TOTAL_CUSTOMERS)} ACCOUNTS</span>
          </div>
          <div class="revenue-plan">
            <div class="rp-ring">
              ${H.charts.donut(plans, { size: 180, thickness: 24, center: { value: kr(planTotal), label: 'TOTAL MRR' } })}
            </div>
            <div class="revenue-plan-legend"></div>
          </div>
        </div>
      `);
      const planLegend = planCard.querySelector('.revenue-plan-legend');
      plans.forEach(p => {
        const share = Math.round((p.value / planTotal) * 100);
        planLegend.appendChild(H.el(`
          <div class="pl">
            <span class="pl-dot" style="background:${p.col}"></span>
            <span class="pl-name">${p.label}<small>${p.accts} accounts · ${share}%</small></span>
            <span class="pl-val">${kr(p.value)}</span>
          </div>
        `));
      });
      planRow.appendChild(planCard);

      // top revenue accounts table
      const accounts = [
        { name: 'Northwind AB', sub: 'STOCKHOLM', plan: 'Enterprise', tag: 'info', mrr: 38400, grow: 8.2, dir: 'up' },
        { name: 'Lykke Studios', sub: 'MALMÖ', plan: 'Growth', tag: 'ok', mrr: 24800, grow: 22.4, dir: 'up' },
        { name: 'Forsberg Konsult', sub: 'GÖTEBORG', plan: 'Enterprise', tag: 'info', mrr: 21200, grow: 3.1, dir: 'up' },
        { name: 'Vinterhav Group', sub: 'UPPSALA', plan: 'Growth', tag: 'ok', mrr: 17600, grow: 0.0, dir: 'flat' },
        { name: 'Bergqvist Media', sub: 'LUND', plan: 'Studio', tag: 'warn', mrr: 12900, grow: -6.4, dir: 'down' },
        { name: 'Solberg & Co', sub: 'NORRKÖPING', plan: 'Growth', tag: 'ok', mrr: 11400, grow: 14.7, dir: 'up' }
      ];
      const acctCard = H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">🏦</span> Top Revenue Accounts</h3>
            <span class="ch-meta">BY MRR · TOP 6</span>
          </div>
          <div class="revenue-tablewrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Account</th><th>Plan</th>
                  <th class="num">MRR</th><th class="num">Growth</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `);
      const acctBody = acctCard.querySelector('tbody');
      accounts.forEach(a => {
        const gsign = a.dir === 'up' ? '▲ +' : a.dir === 'down' ? '▼ ' : '■ ';
        const row = H.el(`
          <tr style="cursor:pointer">
            <td>
              <div class="revenue-acct-name">
                <span class="avatar sq">${H.data.initials(a.name)}</span>
                <div><div style="font-weight:600">${a.name}</div><div class="ra-sub">${a.sub}</div></div>
              </div>
            </td>
            <td><span class="tag ${a.tag}">${a.plan}</span></td>
            <td class="num mono">${kr(a.mrr)}</td>
            <td class="num"><span class="revenue-grow ${a.dir}">${gsign}${Math.abs(a.grow).toFixed(1)}%</span></td>
          </tr>
        `);
        row.addEventListener('click', () => H.show('customers'));
        acctBody.appendChild(row);
      });
      planRow.appendChild(acctCard);
      root.appendChild(planRow);

      /* ── COHORT RETENTION GRID | CHURN STATS ─────────────────────────── */
      const cohortRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // cohort retention mini-grid (table, colored heat cells)
      const cohorts = [
        { label: 'JAN', size: 64, ret: [100, 96, 92, 90, 88, 87, 85] },
        { label: 'FEB', size: 71, ret: [100, 95, 93, 90, 88, 86] },
        { label: 'MAR', size: 58, ret: [100, 97, 94, 92, 90] },
        { label: 'APR', size: 83, ret: [100, 94, 91, 89] },
        { label: 'MAY', size: 77, ret: [100, 96, 93] },
        { label: 'JUN', size: 92, ret: [100, 98] }
      ];
      const maxMonths = 7;
      function heatStyle(v) {
        // map 80..100% retention onto accent alpha; lower = warn/danger tint.
        // token-based (color-mix) so the heat grid follows the active accent theme
        // instead of being locked to the default aurora palette.
        if (v == null) return '';
        if (v >= 95) return 'background:color-mix(in srgb, var(--accent1) 28%, transparent)';
        if (v >= 90) return 'background:color-mix(in srgb, var(--accent1) 20%, transparent)';
        if (v >= 86) return 'background:color-mix(in srgb, var(--accent2) 18%, transparent)';
        if (v >= 82) return 'background:color-mix(in srgb, var(--warn) 18%, transparent)';
        return 'background:color-mix(in srgb, var(--danger) 18%, transparent)';
      }
      let cohortHead = '<th class="rc-rowhead">COHORT</th><th>SIZE</th>';
      for (let m = 0; m < maxMonths; m++) cohortHead += `<th>M${m}</th>`;
      let cohortRows = '';
      cohorts.forEach(c => {
        let cells = `<td class="rc-label">${c.label} '26</td><td class="rc-size">${c.size}</td>`;
        for (let m = 0; m < maxMonths; m++) {
          const v = c.ret[m];
          if (v == null) cells += `<td class="rc-empty">·</td>`;
          else cells += `<td style="${heatStyle(v)}" title="${c.label} · M${m}: ${v}%">${v}</td>`;
        }
        cohortRows += `<tr>${cells}</tr>`;
      });
      cohortRow.appendChild(H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">🧬</span> Cohort Retention</h3>
            <span class="ch-meta">% LOGO RETAINED · BY START MONTH</span>
          </div>
          <div class="revenue-cohort">
            <table>
              <thead><tr>${cohortHead}</tr></thead>
              <tbody>${cohortRows}</tbody>
            </table>
          </div>
          <div class="row between mt-sm">
            <span class="muted" style="font-size:12px">Avg M3 retention <b style="color:var(--accent1)">90.5%</b> · trending up</span>
            <span class="pill ok">● HEALTHY</span>
          </div>
        </div>
      `));

      // churn-rate stat-rows + a small spark
      const churnCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🩸</span> Churn</h3>
            <span class="badge warn">2.1%</span>
          </div>
          <div class="stat-row">
            <span class="sr-label">Gross MRR churn</span>
            <span class="sr-val" style="color:var(--warn)">2.1%</span>
          </div>
          <div class="stat-row">
            <span class="sr-label">Net MRR churn</span>
            <span class="sr-val" style="color:var(--success)">−1.3%</span>
          </div>
          <div class="stat-row">
            <span class="sr-label">Logo churn · 30d</span>
            <span class="sr-val">1.8%</span>
          </div>
          <div class="stat-row">
            <span class="sr-label">At-risk MRR</span>
            <span class="sr-val" style="color:var(--danger)">${kr(31200)}</span>
          </div>
          <div class="section-title" style="margin-top:14px">CHURN RATE · 14W</div>
          <div class="spark" style="height:46px">${H.charts.spark(sparkChurn, { height: 46, color: 'var(--warn)' })}</div>
          <button class="btn btn-sm btn-block mt" data-go="customers">Open save-list · 7 accounts</button>
        </div>
      `);
      cohortRow.appendChild(churnCard);
      root.appendChild(cohortRow);

      /* ── REVENUE STREAMS (donut) | RECORD REVENUE (form + recent list) ─── */
      const streamRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // ── revenue-streams donut: subscriptions / one-off / services ───────
      // Monthly billed revenue by type. Subscriptions === current MRR (482K),
      // keeping the recurring core consistent with the hero + MRR KPI; one-off
      // and services are the non-recurring tail. The 'type' field on each new
      // recorded-revenue entry maps straight onto these three streams.
      const STREAMS = [
        { key: 'subscription', label: 'Subscriptions', sub: 'Recurring · monthly plans', value: 482000, col: 'var(--accent1)' },
        { key: 'oneoff', label: 'One-off', sub: 'Setup · licences · hardware', value: 96000, col: 'var(--accent2)' },
        { key: 'services', label: 'Services', sub: 'Onboarding · consulting', value: 64000, col: 'var(--accent3)' }
      ];
      const streamTotal = STREAMS.reduce((a, s) => a + s.value, 0);
      const streamCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🍩</span> Revenue Streams</h3>
            <span class="ch-meta">BY TYPE · MONTHLY</span>
          </div>
          <div class="revenue-plan">
            <div class="rp-ring">
              ${H.charts.donut(STREAMS, { size: 180, thickness: 24, center: { value: kr(streamTotal), label: 'BILLED / MO' } })}
            </div>
            <div class="revenue-plan-legend"></div>
          </div>
        </div>
      `);
      const streamLegend = streamCard.querySelector('.revenue-plan-legend');
      STREAMS.forEach(s => {
        const share = Math.round((s.value / streamTotal) * 100);
        streamLegend.appendChild(H.el(`
          <div class="pl">
            <span class="pl-dot" style="background:${s.col}"></span>
            <span class="pl-name">${s.label}<small>${s.sub} · ${share}%</small></span>
            <span class="pl-val">${kr(s.value)}</span>
          </div>
        `));
      });
      streamRow.appendChild(streamCard);

      // ── record-revenue card: form (amount, customer, stream/type, date) ──
      // Prepends to a recent-revenue list, audits revenue.recorded, toasts.
      const STREAM_OPTS = STREAMS.map(s => `<option value="${s.key}">${s.label}</option>`).join('');
      // customers to credit — names align with the Top Accounts table above
      const REV_CUSTOMERS = [
        'Northwind AB', 'Lykke Studios', 'Forsberg Konsult',
        'Vinterhav Group', 'Bergqvist Media', 'Solberg & Co', 'Halland Bryggeri'
      ];
      const custOpts = REV_CUSTOMERS.map(c => `<option value="${c}">${c}</option>`).join('');
      const streamMeta = k => STREAMS.find(s => s.key === k) || STREAMS[0];

      // seeded recent-revenue entries (deterministic — no Date/Math.random at eval)
      const RECENT = [
        { cust: 'Northwind AB', type: 'subscription', amount: 38400, date: '2026-06-14', who: 'Ola Forsberg' },
        { cust: 'Forsberg Konsult', type: 'services', amount: 18600, date: '2026-06-13', who: 'Sofia Berg' },
        { cust: 'Lykke Studios', type: 'oneoff', amount: 9200, date: '2026-06-12', who: 'Ola Forsberg' }
      ];

      const recordCard = H.el(`
        <div class="card span-2 revenue-record">
          <div class="card-head">
            <h3><span class="hico">＋</span> Record Revenue</h3>
            <span class="ch-meta">BOOK A NEW LINE</span>
          </div>
          <div class="revenue-rec-form">
            <label class="revenue-field"><span>Amount</span>
              <div class="revenue-amount">
                <span class="revenue-cur">kr</span>
                <input type="number" min="0" step="100" inputmode="numeric" data-f="amount" placeholder="0" autocomplete="off">
              </div>
            </label>
            <label class="revenue-field"><span>Customer</span>
              <select data-f="cust">${custOpts}</select></label>
            <label class="revenue-field"><span>Stream / type</span>
              <select data-f="type">${STREAM_OPTS}</select></label>
            <label class="revenue-field"><span>Date</span>
              <input type="date" data-f="date" value="2026-06-15"></label>
            <button class="btn btn-primary revenue-rec-save"${canWrite ? '' : ' disabled title="Needs finance role"'}>＋ Record revenue</button>
          </div>
          <div class="revenue-rec-note muted">Saving writes a <code>revenue.recorded</code> entry to the <b>Audit</b> log so Ledger and Command can reference it.</div>
          <div class="section-title" style="margin-top:14px">RECENT REVENUE</div>
          <div class="list revenue-rec-list"></div>
        </div>
      `);
      const recList = recordCard.querySelector('.revenue-rec-list');
      const get = f => recordCard.querySelector(`[data-f="${f}"]`);

      function recItemNode(r, fresh) {
        const sm = streamMeta(r.type);
        const node = H.el(`
          <div class="list-item revenue-rec-item${fresh ? ' revenue-rec-new' : ''}">
            <div class="li-ico"><span class="avatar sq">${D.initials(r.cust)}</span></div>
            <div class="li-body">
              <div class="li-title">${r.cust}</div>
              <div class="li-sub"><span class="revenue-rec-dot" style="background:${sm.col}"></span>${sm.label} · ${r.date}</div>
            </div>
            <span class="li-meta revenue-rec-amt">+${kr(r.amount)}</span>
          </div>
        `);
        return node;
      }
      RECENT.forEach(r => recList.appendChild(recItemNode(r, false)));

      function recordRevenue() {
        if (!canWrite) { H.toast('Needs finance role to record revenue', 'warn'); return; }
        const amount = Math.round(parseFloat(get('amount').value) || 0);
        if (!(amount > 0)) {
          get('amount').classList.add('revenue-invalid');
          get('amount').focus();
          H.toast('Enter an amount above zero', 'warn');
          return;
        }
        get('amount').classList.remove('revenue-invalid');
        const cust = get('cust').value;
        const type = get('type').value;
        const date = get('date').value || '2026-06-15';
        const sm = streamMeta(type);
        const rec = {
          id: 'rev-' + Date.now().toString(36),
          cust, type, amount, date, who: S.user.name
        };
        RECENT.unshift(rec);

        // prepend to the recent list with a fresh-highlight
        const node = recItemNode(rec, true);
        recList.insertBefore(node, recList.firstChild);
        requestAnimationFrame(() => node.classList.remove('revenue-rec-new'));

        // AUDIT — required on every data-changing action
        H.audit.log({
          action: 'revenue.recorded',
          entityType: 'Revenue',
          entityId: rec.id,
          summary: `${S.user.name} recorded ${kr(amount)} ${sm.label.toLowerCase()} revenue from ${cust}`,
          amount: { value: amount, currency: 'SEK' },
          links: [{ entityType: 'Customer', entityId: cust }],
          after: { stream: type, date },
          module: 'revenue'
        });

        H.toast(`Recorded ${kr(amount)} from ${cust}`, 'success');
        get('amount').value = '';
        get('amount').focus();
      }
      recordCard.querySelector('.revenue-rec-save').addEventListener('click', recordRevenue);
      get('amount').addEventListener('keydown', e => { if (e.key === 'Enter') recordRevenue(); });
      streamRow.appendChild(recordCard);
      root.appendChild(streamRow);

      /* ── wire actions (no global keys; shell owns ⌘K) ────────────────── */
      root.querySelector('[data-act="export"]').addEventListener('click', () => H.toast('Exporting MRR ledger to CSV…', 'info'));
      root.querySelector('[data-act="stripe"]').addEventListener('click', () => H.toast('Opening Stripe billing…', 'info'));
      root.querySelector('[data-act="forecast"]').addEventListener('click', () => {
        H.toast('Recomputing 5-month MRR forecast…', 'info');
        setTimeout(() => H.toast('Forecast ready — projected kr 561K by +5M', 'success'), 1100);
      });
      root.querySelectorAll('[data-go]').forEach(b =>
        b.addEventListener('click', () => H.show(b.getAttribute('data-go'))));

      // count-ups auto-run by the shell after render(); nothing else needed.
    }
  });
})();
