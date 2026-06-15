/* ============================================================================
   command.js — the Command Deck.
   REFERENCE IMPLEMENTATION. Every other module copies this shape:
     1) call HELM.register({ id, label, icon, render })
     2) inside render(root), build DOM using ONLY documented .classes + HELM.charts
     3) never inject fonts/colors/global styles; never touch another module's DOM
     4) all on-screen numbers pass through HELM.fmt or [data-count] (+ HELM.count)
   ========================================================================== */
(function () {
  const H = window.HELM;

  /* ── Company Pulse: which audit actions count as "wins" worth celebrating ──
     deal won · hire/promotion · shipped · deploy · payment (+ a few siblings) */
  const PULSE_ACTIONS = [
    'deal.won', 'role.changed', 'order.shipped', 'task.moved',
    'deploy.succeeded', 'payment.created', 'invoice.paid',
    'doc.signed', 'campaign.launched', 'portal.invited'
  ];
  // per-action presentation: emoji glyph + short kind label
  const PULSE_META = {
    'deal.won':         { ico: '🎯', kind: 'DEAL WON',  accent: 'ok' },
    'role.changed':     { ico: '🎖️', kind: 'HIRE',      accent: 'info' },
    'order.shipped':    { ico: '🚀', kind: 'SHIPPED',   accent: 'ok' },
    'task.moved':       { ico: '📦', kind: 'SHIPPED',   accent: 'info' },
    'deploy.succeeded': { ico: '🛰️', kind: 'DEPLOY',    accent: 'info' },
    'payment.created':  { ico: '💸', kind: 'PAYMENT',   accent: 'ok' },
    'invoice.paid':     { ico: '💰', kind: 'PAYMENT',   accent: 'ok' },
    'doc.signed':       { ico: '🖊️', kind: 'SIGNED',    accent: 'info' },
    'campaign.launched':{ ico: '📣', kind: 'LAUNCH',    accent: 'info' },
    'portal.invited':   { ico: '🪟', kind: 'ONBOARD',   accent: 'info' }
  };

  // resolve the actor Person behind an audit event (for avatar + name)
  function actorOf(ev) {
    const team = (H.session && H.session.team) || [];
    return team.find(p => p.id === ev.actorId) || null;
  }
  // relative-time label (audit ts is ISO; deterministic-enough for the feed)
  function ago(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.round(diff / 60000);
    if (!isFinite(m)) return '';
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm';
    const h = Math.round(m / 60);
    if (h < 24) return h + 'h';
    return Math.round(h / 24) + 'd';
  }

  /* paintPulse(host): (re)render the celebratory feed from HELM.audit.list().
     Newest-first; actor avatars + summaries; amount chip when present. */
  function paintPulse(host) {
    if (!host) return;
    const wins = H.audit.list({ actions: PULSE_ACTIONS, limit: 8 });
    if (!wins.length) {
      host.innerHTML = '<div class="command-pulse-empty faint">No wins logged yet — go close something.</div>';
      return;
    }
    host.innerHTML = '';
    wins.forEach(ev => {
      const m = PULSE_META[ev.action] || { ico: '✨', kind: 'WIN', accent: 'ok' };
      const p = actorOf(ev);
      const av = p ? p.avatar : '✦';
      const amt = ev.amount ? `<span class="command-pulse-amt">${H.fmt.money(ev.amount.value, '')} kr</span>` : '';
      const node = H.el(`
        <div class="command-pulse-item">
          <div class="avatar sq command-pulse-av">${av}</div>
          <div class="command-pulse-body">
            <div class="command-pulse-top">
              <span class="tag ${m.accent} command-pulse-kind">${m.ico} ${m.kind}</span>
              ${amt}
            </div>
            <div class="command-pulse-sum">${ev.summary || ev.action}</div>
          </div>
          <span class="command-pulse-ts">${ago(ev.ts)}</span>
        </div>
      `);
      host.appendChild(node);
    });
  }

  H.register({
    id: 'command',
    label: 'Command Deck',
    icon: '🛰️',
    render(root) {
      /* ── deterministic mock data (no Math.random / no Date at eval) ──── */
      const D = H.data;
      const revSeries = D.series('cmd-rev', 24, 21000, 48200, 0.10);     // monthly revenue ↗
      const sigSeries = D.series('cmd-sig', 24, 14000, 33000, 0.16);     // "signal" line
      const cashBars = D.series('cmd-cash', 8, 30000, 62000, 0.18);     // cash-in by month
      const burnBars = D.series('cmd-burn', 8, 28000, 41000, 0.10);     // burn by month
      const months8 = D.months.slice(0, 8);

      const health = 86;
      const subs = [
        { name: 'FINANCE', val: 78 },
        { name: 'SALES', val: 91 },
        { name: 'OPS', val: 84 },
        { name: 'TEAM', val: 88 },
        { name: 'GROWTH', val: 73 }
      ];

      const vitals = [
        { label: 'REVENUE · MTD', count: 48200, fmt: 'money', trend: '+12.4%', dir: 'up', spark: D.series('v-rev', 14, 30, 48, 0.2) },
        { label: 'CASH ON HAND', count: 284500, fmt: 'money', trend: '+4.1%', dir: 'up', spark: D.series('v-cash', 14, 240, 285, 0.08) },
        { label: 'CUSTOMERS', count: 1284, fmt: 'num', trend: '+38', dir: 'up', spark: D.series('v-cust', 14, 1100, 1284, 0.06) },
        { label: 'ORDERS · 24H', count: 37, fmt: 'num', trend: '-3', dir: 'down', spark: D.series('v-ord', 14, 28, 37, 0.25) }
      ];

      /* ── build markup ───────────────────────────────────────────────── */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">🛰️</div>
            <div>
              <h1>Command Deck</h1>
              <p>Is the ship okay? One glance, every subsystem reporting.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="brief">◇ Daily briefing</button>
            <button class="btn btn-ghost btn-sm" data-act="overview">⤢ Company Overview</button>
            <button class="btn btn-primary btn-sm" data-act="cmdk">⌘K Command</button>
          </div>
        </div>
      `));

      /* HERO ROW: health ring + sub-gauges | telemetry waveform */
      const hero = H.el(`<div class="grid cols-2" style="margin-bottom:var(--gap)"></div>`);

      // ── health card
      const healthCard = H.el(`
        <div class="card glow pad-lg">
          <div class="card-head">
            <h3><span class="hico">🛰️</span> Company Health</h3>
            <span class="ch-meta">VITALITY INDEX</span>
          </div>
          <div class="command-health">
            <div class="command-ring" id="healthRingAnchor">
              ${H.charts.gauge(health, { max: 100, size: 220, arc: 280 })}
              <div class="command-ring-core">
                <div class="command-ring-num" data-count="${health}">0</div>
                <div class="command-ring-lbl">/ 100 NOMINAL</div>
                <div class="command-ring-state">● ALL SYSTEMS GO</div>
              </div>
            </div>
            <div class="command-subs"></div>
          </div>
        </div>
      `);
      // The gauge svg already prints a big number; hide its built-in text, use overlay core.
      const gsvg = healthCard.querySelector('.command-ring svg text');
      if (gsvg) gsvg.style.display = 'none';
      const subWrap = healthCard.querySelector('.command-subs');
      subs.forEach(s => {
        const cls = s.val >= 80 ? '' : s.val >= 70 ? 'warn' : 'bad';
        subWrap.appendChild(H.el(`
          <div class="command-sub">
            <span class="command-sub-name">${s.name}</span>
            <div class="progress"><div class="bar ${cls}" style="width:0"></div></div>
            <span class="command-sub-val">${s.val}</span>
          </div>
        `));
        // animate the bar fill after mount
        const bar = subWrap.lastElementChild.querySelector('.bar');
        setTimeout(() => { bar.style.width = s.val + '%'; }, 250);
      });
      hero.appendChild(healthCard);

      // ── telemetry waveform card
      const waveCard = H.el(`
        <div class="card command-wave">
          <div class="card-head">
            <h3><span class="hico">📈</span> Live Telemetry</h3>
            <span class="ch-meta">REV × SIGNAL · 24M</span>
          </div>
          <div class="command-wave-legend">
            <span class="command-wl rev"><i></i>REVENUE</span>
            <span class="command-wl sig"><i></i>SIGNAL</span>
          </div>
          <div class="chart" style="height:230px">
            ${H.charts.area(revSeries, { height: 230, v2: sigSeries, labels: ['JAN', 'JUN', 'DEC', 'JUN', 'DEC'] })}
          </div>
        </div>
      `);
      hero.appendChild(waveCard);
      root.appendChild(hero);

      /* VITALS ROW: 4 KPI tiles w/ count-up + sparkline + trend */
      const vrow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
      vitals.forEach(v => {
        vrow.appendChild(H.el(`
          <div class="card command-vital kpi">
            <div class="kpi-label">${v.label}</div>
            <div class="kpi-value" data-count="${v.count}" data-fmt="${v.fmt}">0</div>
            <div class="row between mt-sm">
              <span class="kpi-trend ${v.dir}">${v.trend}</span>
            </div>
            <div class="spark">${H.charts.spark(v.spark)}</div>
          </div>
        `));
      });
      root.appendChild(vrow);

      /* MAIN GRID: revenue area (span 2) + cash/burn bars */
      const main = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      main.appendChild(H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">📈</span> Revenue Trajectory</h3>
            <span class="ch-meta">TRAILING 24 MONTHS</span>
          </div>
          <div class="chart" style="height:200px">
            ${H.charts.area(revSeries, { height: 200, forecastFrom: 18, labels: ['18M', '12M', '6M', 'NOW', '+5M'] })}
          </div>
        </div>
      `));

      main.appendChild(H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">⛽</span> Cash vs Burn</h3>
            <span class="ch-meta">8 MO</span>
          </div>
          <div class="chart" style="height:200px">
            ${H.charts.bars(cashBars.map((v, i) => ({ label: months8[i], value: v })), { height: 200, b: burnBars })}
          </div>
          <div class="row between mt-sm">
            <span class="pill ok">CASH IN</span>
            <span class="pill command-pill-burn">BURN</span>
          </div>
        </div>
      `));
      root.appendChild(main);

      /* ATTENTION + AGENDA + ACTIVITY ROW */
      const row3 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // Needs-you attention queue
      const attn = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">⚠️</span> Needs You</h3>
            <span class="badge bad">3</span>
          </div>
          <div class="command-attn-stack"></div>
        </div>
      `);
      const attnItems = [
        { sev: 'bad', ico: '⛽', title: 'Runway under 15 months', sub: 'Burn $38K/mo · review spend', act: 'ledger' },
        { sev: 'warn', ico: '🧾', title: '6 invoices overdue · $18.4K', sub: 'Oldest 47 days — chase now', act: 'billing' },
        { sev: 'warn', ico: '📦', title: 'SKU AX-12 below par', sub: '8 units left · reorder point 20', act: 'inventory' }
      ];
      const stack = attn.querySelector('.command-attn-stack');
      attnItems.forEach(a => {
        const node = H.el(`
          <div class="attn ${a.sev}">
            <span class="a-ico">${a.ico}</span>
            <div class="a-body"><div class="a-title">${a.title}</div><div class="a-sub">${a.sub}</div></div>
            <button class="btn btn-sm" data-go="${a.act}">Open</button>
          </div>
        `);
        node.querySelector('[data-go]').addEventListener('click', () => H.show(a.act));
        stack.appendChild(node);
      });
      row3.appendChild(attn);

      // Today's agenda
      const agenda = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">📅</span> Today's Mission</h3>
            <span class="ch-meta">5 ITEMS</span>
          </div>
          <div class="list"></div>
        </div>
      `);
      const agendaList = agenda.querySelector('.list');
      [
        ['09:30', 'Investor sync — Q2 metrics', 'info'],
        ['11:00', 'Ship order batch #1041–1048', 'ok'],
        ['13:00', 'Payroll run cutoff', 'warn'],
        ['15:30', 'Pipeline review w/ sales', 'info'],
        ['17:00', 'Approve Fortnox VAT draft', 'warn']
      ].forEach(([t, label, sev]) => {
        agendaList.appendChild(H.el(`
          <div class="list-item">
            <div class="li-ico">${sev === 'warn' ? '◆' : sev === 'ok' ? '▶' : '●'}</div>
            <div class="li-body"><div class="li-title">${label}</div></div>
            <span class="li-meta">${t}</span>
          </div>
        `));
      });
      row3.appendChild(agenda);

      // Live activity feed
      const activity = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">📡</span> Activity</h3>
            <span class="pill ok command-pill-live">LIVE</span>
          </div>
          <div class="list"></div>
        </div>
      `);
      const actList = activity.querySelector('.list');
      [
        ['💸', 'Invoice #2294 paid', 'Northwind AB · $4,200', '2M'],
        ['👤', 'New customer', 'Lykke Studios', '8M'],
        ['🚀', 'Order #1043 shipped', 'PostNord · Stockholm', '14M'],
        ['⚙️', 'Automation fired', 'Chase overdue ×3', '22M'],
        ['📈', 'Deal advanced', 'Forsberg · $24K → Won', '31M']
      ].forEach(([ico, title, sub, ts]) => {
        actList.appendChild(H.el(`
          <div class="list-item">
            <div class="li-ico">${ico}</div>
            <div class="li-body"><div class="li-title">${title}</div><div class="li-sub">${sub}</div></div>
            <span class="li-meta">${ts}</span>
          </div>
        `));
      });
      row3.appendChild(activity);
      root.appendChild(row3);

      /* COMPANY PULSE — celebratory wins drawn live from the audit stream */
      const pulse = H.el(`
        <div class="card command-pulse">
          <div class="card-head">
            <h3><span class="hico">🎉</span> Company Pulse</h3>
            <span class="pill ok command-pill-live">LIVE</span>
          </div>
          <div class="command-pulse-feed"></div>
        </div>
      `);
      const pulseFeed = pulse.querySelector('.command-pulse-feed');
      paintPulse(pulseFeed);
      // keep the pulse alive: re-paint whenever a fresh celebratory action lands
      const offPulse = H.audit.on(ev => {
        if (!document.body.contains(pulseFeed)) { offPulse(); return; }
        if (PULSE_ACTIONS.includes(ev.action)) paintPulse(pulseFeed);
      });
      root.appendChild(pulse);

      /* GET SET UP CHECKLIST */
      const setup = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🚦</span> Get Set Up</h3>
            <span class="ch-meta">4 / 6 COMPLETE</span>
          </div>
          <div class="grid cols-2"></div>
        </div>
      `);
      const ckGrid = setup.querySelector('.grid');
      // setup steps; incomplete ones expose a "Connect" action that mutates the
      // org's connected-services data model → gated by 'settings.company'.
      const canSetup = H.session.can('settings.company');
      [
        { key: 'company', title: 'Register the company (org.nr)', sub: 'Bolagsverket · AB filed', done: true },
        { key: 'tink', title: 'Connect bank feed', sub: 'Tink · 2 accounts linked', done: true },
        { key: 'fortnox', title: 'Set up bookkeeping', sub: 'Fortnox · syncing', done: true },
        { key: 'stripe', title: 'Connect Stripe revenue', sub: 'Webhook live', done: true },
        { key: 'shopify', title: 'Connect store & inventory', sub: 'Shopify — not connected', done: false },
        { key: 'crew', title: 'Invite your crew', sub: '1 of 5 seats used', done: false }
      ].forEach(({ key, title, sub, done }) => {
        const node = H.el(`
          <div class="check ${done ? 'done' : ''}">
            <div class="box">✓</div>
            <div class="ck-body"><div class="ck-title">${title}</div><div class="ck-sub">${sub}</div></div>
            ${done ? '<span class="pill ok">DONE</span>' : '<button class="btn btn-sm btn-primary" data-connect="' + key + '">Connect</button>'}
          </div>
        `);
        const cbtn = node.querySelector('[data-connect]');
        if (cbtn) {
          if (!canSetup) {
            cbtn.disabled = true;
            cbtn.title = 'Needs admin role';
          } else {
            cbtn.addEventListener('click', () => {
              H.audit.log({
                action: 'integration.connect.started',
                entityType: 'Integration',
                entityId: key,
                summary: H.session.user.name + ' started the setup step “' + title + '” (' + key + ')',
                after: { service: key, status: 'connecting' }
              });
              H.toast('Opening connection flow…', 'info');
            });
          }
        }
        ckGrid.appendChild(node);
      });
      root.appendChild(setup);

      /* ── wire local actions (no global keys; shell owns ⌘K) ─────────── */
      // checklist "Connect" buttons are wired (+gated +audited) inline above.
      root.querySelector('[data-act="cmdk"]').addEventListener('click', () => H.openCmdk());
      root.querySelector('[data-act="brief"]').addEventListener('click', () => H.toast('Generating daily briefing…', 'info'));
      root.querySelector('[data-act="overview"]').addEventListener('click', () => H.openOverview());

      // count-ups are auto-run by the shell after render(); nothing else needed.
    },

    /* ====================================================================
       COMPANY OVERVIEW — a single stunning full-canvas view of the whole
       company. The shell's H.openOverview() calls this with the overlay's
       .overview-body host; we also handle being handed the raw .overview
       host (find/clear the inner .overview-body, else append into it).
       Builds: org header · "where revenue is generated" value-flow viz ·
       org-wide KPI band · subsystem map (Finance/Sales/Ops/People/Platform),
       each tile drilling into a module via H.show() + closing the overlay.
       ==================================================================== */
    renderOverview(arg) {
      const D = H.data;
      const sess = H.session || {};
      const org = sess.org || { name: 'Northwind Labs AB' };

      /* resolve the host: accept .overview-body directly, or the .overview
         shell host (use its inner .overview-body if present, else itself). */
      let host = arg;
      if (host && host.classList && host.classList.contains('overview')) {
        host = host.querySelector('.overview-body') || host;
      }
      if (!host) return;
      host.innerHTML = '';

      const health = 86;
      const wrap = H.el('<div class="command-ov"></div>');

      /* ── ORG HEADER ─────────────────────────────────────────────────── */
      wrap.appendChild(H.el(`
        <div class="command-ov-hero">
          <div class="command-ov-id">
            <div class="command-ov-mark">${(org.name || 'NL').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</div>
            <div>
              <div class="command-ov-name">${org.name || 'Company'}</div>
              <div class="command-ov-meta">${[org.city, (org.identifiers && org.identifiers.orgNo) || org.orgNo, 'FY ' + (org.fiscalCurrency || 'SEK')].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
          <div class="command-ov-health">
            <div class="command-ov-health-num"><span data-count="${health}">0</span><small>/100</small></div>
            <div class="command-ov-health-lbl">VITALITY · <span class="command-ov-ok">ALL SYSTEMS GO</span></div>
            <div class="progress command-ov-health-bar"><div class="bar" style="width:0"></div></div>
          </div>
          <button class="btn btn-ghost btn-sm command-ov-x" data-ov-close>✕ Close</button>
        </div>
      `));

      /* ── VALUE FLOW: where revenue is generated ─────────────────────── */
      // channels (revenue sources) → segments → net, with labelled flows
      const channels = [
        { label: 'Direct / Web', value: 218, color: 'var(--accent1)' },
        { label: 'Marketplace', value: 142, color: 'var(--accent2)' },
        { label: 'Wholesale / B2B', value: 96, color: 'var(--accent3)' },
        { label: 'Subscriptions', value: 78, color: 'var(--warn)' }
      ];
      const grossK = channels.reduce((a, c) => a + c.value, 0);   // 534K
      const cogsK = Math.round(grossK * 0.34);
      const opexK = Math.round(grossK * 0.28);
      const netK = grossK - cogsK - opexK;
      const segments = [
        { label: 'New business', value: 58, color: 'var(--accent1)' },
        { label: 'Expansion', value: 26, color: 'var(--accent2)' },
        { label: 'Renewals', value: 16, color: 'var(--accent3)' }
      ];
      const flowTrail = D.series('ov-flow', 18, 320, 534, 0.08);

      const flow = H.el(`
        <div class="card command-flow-card">
          <div class="card-head">
            <h3><span class="hico">💰</span> Where Revenue Is Generated</h3>
            <span class="ch-meta">TRAILING 12 MONTHS · kr 000s</span>
          </div>
          <div class="command-flow">
            <div class="command-flow-col">
              <div class="command-flow-h">CHANNELS</div>
              <div class="command-flow-bars"></div>
            </div>
            <div class="command-flow-link">
              <div class="command-flow-arrow">→</div>
              <div class="command-flow-area"></div>
              <div class="command-flow-caption">gross ${H.fmt.money(grossK * 1000, '')} kr</div>
            </div>
            <div class="command-flow-col command-flow-mix">
              <div class="command-flow-h">REVENUE MIX</div>
              <div class="command-flow-donut"></div>
            </div>
            <div class="command-flow-link">
              <div class="command-flow-arrow">→</div>
              <div class="command-flow-waterfall"></div>
            </div>
            <div class="command-flow-col command-flow-net">
              <div class="command-flow-h">NET</div>
              <div class="command-flow-net-val">${H.fmt.money(netK * 1000, '')} kr</div>
              <div class="command-flow-net-sub">${Math.round(netK / grossK * 100)}% margin</div>
              <div class="command-flow-net-foot">after ${H.fmt.money(cogsK * 1000, '')} COGS · ${H.fmt.money(opexK * 1000, '')} opex</div>
            </div>
          </div>
        </div>
      `);
      // channel bars (horizontal, labelled flows)
      const fb = flow.querySelector('.command-flow-bars');
      channels.forEach(c => {
        const pct = Math.round(c.value / channels[0].value * 100);
        const row = H.el(`
          <div class="command-flow-bar">
            <div class="command-flow-bar-top"><span>${c.label}</span><span class="command-flow-bar-v">${H.fmt.money(c.value * 1000, '')} kr</span></div>
            <div class="command-flow-bar-track"><div class="command-flow-bar-fill" style="width:0;background:${c.color}"></div></div>
          </div>
        `);
        fb.appendChild(row);
        const fill = row.querySelector('.command-flow-bar-fill');
        setTimeout(() => { fill.style.width = pct + '%'; }, 260);
      });
      flow.querySelector('.command-flow-area').innerHTML =
        `<div class="chart" style="height:84px">${H.charts.area(flowTrail, { height: 84, grid: false })}</div>`;
      flow.querySelector('.command-flow-donut').innerHTML =
        H.charts.donut(segments, { size: 132, thickness: 18, center: { value: grossK + 'K', label: 'GROSS' } });
      // mini waterfall gross → −cogs → −opex → net
      flow.querySelector('.command-flow-waterfall').innerHTML =
        `<div class="chart" style="height:96px">${H.charts.bars(
          [{ label: 'GROSS', value: grossK, color: 'var(--accent1)' },
           { label: 'COGS', value: cogsK, color: 'var(--danger)' },
           { label: 'OPEX', value: opexK, color: 'var(--warn)' },
           { label: 'NET', value: netK, color: 'var(--accent2)' }], { height: 96 })}</div>`;
      wrap.appendChild(flow);

      /* ── ORG-WIDE KPI BAND ──────────────────────────────────────────── */
      const band = H.el('<div class="command-ov-band"></div>');
      [
        ['MRR', 48200, 'money', '+12.4%', 'up'],
        ['CASH', 284500, 'money', '+4.1%', 'up'],
        ['RUNWAY', 14.2, 'mo', '−0.4', 'down'],
        ['PIPELINE', 612000, 'money', '+8%', 'up'],
        ['CUSTOMERS', 1284, 'num', '+38', 'up'],
        ['NPS', 62, 'num', '+5', 'up'],
        ['ROAS', 3.4, 'x', '+0.3', 'up'],
        ['CHURN', 2.1, 'pctv', '−0.2', 'up']
      ].forEach(([label, val, fmt, trend, dir]) => {
        let inner;
        if (fmt === 'money' || fmt === 'num') {
          inner = `<div class="command-ov-kpi-v" data-count="${val}" data-fmt="${fmt}">0</div>`;
        } else if (fmt === 'mo') {
          inner = `<div class="command-ov-kpi-v">${val}<small> mo</small></div>`;
        } else if (fmt === 'x') {
          inner = `<div class="command-ov-kpi-v">${val}<small>×</small></div>`;
        } else {
          inner = `<div class="command-ov-kpi-v">${val}<small>%</small></div>`;
        }
        band.appendChild(H.el(`
          <div class="command-ov-kpi">
            <div class="command-ov-kpi-l">${label}</div>
            ${inner}
            <span class="kpi-trend ${dir} command-ov-kpi-t">${trend}</span>
          </div>
        `));
      });
      wrap.appendChild(band);

      /* ── SUBSYSTEM MAP — drill into each domain ─────────────────────── */
      wrap.appendChild(H.el('<div class="section-title">Subsystems</div>'));
      const map = H.el('<div class="command-ov-map"></div>');
      const subsystems = [
        { name: 'Finance', ico: '💰', metric: H.fmt.money(284500, '') + ' kr', sub: 'Cash on hand', go: 'ledger', val: 78 },
        { name: 'Sales', ico: '🎯', metric: H.fmt.money(612000, '') + ' kr', sub: 'Open pipeline', go: 'pipeline', val: 91 },
        { name: 'Operations', ico: '📦', metric: '94%', sub: 'Stock health · 37 orders/24h', go: 'inventory', val: 84 },
        { name: 'People', ico: '👥', metric: (sess.team ? sess.team.length : 8) + ' crew', sub: 'Payroll June ready', go: 'crew', val: 88 },
        { name: 'Platform', ico: '🛰️', metric: '99.9%', sub: 'Uptime · v1.8.2 live', go: 'infra', val: 73 }
      ];
      subsystems.forEach(s => {
        const cls = s.val >= 80 ? 'ok' : s.val >= 70 ? 'warn' : 'bad';
        const tile = H.el(`
          <button class="command-ov-tile" data-go="${s.go}">
            <div class="command-ov-tile-head">
              <span class="command-ov-tile-ico">${s.ico}</span>
              <span class="command-ov-tile-name">${s.name}</span>
              <span class="command-ov-tile-arrow">→</span>
            </div>
            <div class="command-ov-tile-metric">${s.metric}</div>
            <div class="command-ov-tile-sub">${s.sub}</div>
            <div class="progress command-ov-tile-bar"><div class="bar ${cls === 'ok' ? '' : cls}" style="width:0"></div></div>
          </button>
        `);
        const bar = tile.querySelector('.bar');
        setTimeout(() => { bar.style.width = s.val + '%'; }, 300);
        tile.addEventListener('click', () => { H.closeOverview(); H.show(s.go); });
        map.appendChild(tile);
      });
      wrap.appendChild(map);

      host.appendChild(wrap);

      // animate org-health bar + run the count-ups inside the overlay
      const hb = wrap.querySelector('.command-ov-health-bar .bar');
      if (hb) setTimeout(() => { hb.style.width = health + '%'; }, 260);
      H.countAll(host);

      // our own close control (shell also wires scrim/Esc)
      const x = wrap.querySelector('[data-ov-close]');
      x && x.addEventListener('click', () => H.closeOverview());
    }
  });
})();
