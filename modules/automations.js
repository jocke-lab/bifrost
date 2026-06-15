/* ============================================================================
   automations.js — Automations & Workflows.
   The robots that run the company.
   Follows the HELM module contract (see command.js): register → render(root),
   build with H.el + documented classes + H.charts, wire buttons to H.toast/H.show.
   Only adds namespaced .automations-* tweaks in automations.css.
   ========================================================================== */
(function () {
  const H = window.HELM;

  H.register({
    id: 'automations',
    label: 'Automations',
    icon: '⚙️',
    render(root) {
      const D = H.data;

      /* ── deterministic mock data ──────────────────────────────────────── */
      const runsSeries = D.series('auto-runs', 24, 180, 1240, 0.16);   // runs/hour-ish trend
      const savedSeries = D.series('auto-saved', 12, 22, 96, 0.12);     // hours saved by month
      const successSeries = D.series('auto-succ', 14, 94, 99, 0.04);    // success-rate spark
      const months12 = D.months.slice(0, 12);
      const successRate = 98.4;

      // KPI sparklines
      const kActive = D.series('auto-k-active', 14, 18, 24, 0.10);
      const kRuns = D.series('auto-k-runs', 14, 900, 1284, 0.18);
      const kSaved = D.series('auto-k-saved', 14, 60, 96, 0.10);
      const kSucc = successSeries;

      /* ── VIEW HEAD ────────────────────────────────────────────────────── */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">⚙️</div>
            <div>
              <h1>Automations</h1>
              <p>The robots that run the company — triggers, actions, and the hours they hand back.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="library">◇ Recipe library</button>
            <button class="btn btn-primary btn-sm" data-act="new">＋ New automation</button>
          </div>
        </div>
      `));

      /* ── KPI ROW (4 tiles) + success gauge ────────────────────────────── */
      const kpiRow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
      [
        { label: 'ARMED AUTOMATIONS', count: 22, fmt: 'num', trend: '+3', dir: 'up', spark: kActive },
        { label: 'RUNS · TODAY', count: 1284, fmt: 'num', trend: '+162', dir: 'up', spark: kRuns },
        { label: 'TIME SAVED · MTD', count: 96, fmt: 'num', suffix: ' h', trend: '+14h', dir: 'up', spark: kSaved },
        { label: 'SUCCESS RATE', count: 98.4, dp: 1, suffix: '%', trend: '+0.6%', dir: 'up', spark: kSucc }
      ].forEach(v => {
        kpiRow.appendChild(H.el(`
          <div class="card kpi automations-kpi">
            <div class="kpi-label">${v.label}</div>
            <div class="kpi-value" data-count="${v.count}" ${v.fmt ? `data-fmt="${v.fmt}"` : ''} ${v.dp ? `data-dp="${v.dp}"` : ''} ${v.suffix ? `data-suffix="${v.suffix}"` : ''}>0</div>
            <div class="row between mt-sm">
              <span class="kpi-trend ${v.dir}">${v.trend}</span>
            </div>
            <div class="spark">${H.charts.spark(v.spark)}</div>
          </div>
        `));
      });
      root.appendChild(kpiRow);

      /* ── ROW: success gauge | runs-over-time area | hours-saved bars ──── */
      const chartsRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // success-rate gauge card
      const gaugeCard = H.el(`
        <div class="card automations-gauge-card">
          <div class="card-head">
            <h3><span class="hico">🎯</span> Success Rate</h3>
            <span class="ch-meta">LAST 7 DAYS</span>
          </div>
          <div class="chart" style="height:188px">
            ${H.charts.gauge(successRate, { max: 100, size: 200, arc: 260, value: successRate + '%' })}
          </div>
          <div class="row between mt-sm">
            <span class="pill ok">● 1,264 OK</span>
            <span class="pill warn">● 16 RETRIED</span>
            <span class="pill bad">● 4 FAILED</span>
          </div>
        </div>
      `);
      chartsRow.appendChild(gaugeCard);

      // runs over time
      chartsRow.appendChild(H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">📈</span> Runs Over Time</h3>
            <span class="ch-meta">TRAILING 24H</span>
          </div>
          <div class="chart" style="height:188px">
            ${H.charts.area(runsSeries, { height: 188, labels: ['00:00', '06:00', '12:00', '18:00', 'NOW'] })}
          </div>
        </div>
      `));

      // hours saved per month
      chartsRow.appendChild(H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">⏱️</span> Hours Saved</h3>
            <span class="ch-meta">PER MONTH</span>
          </div>
          <div class="chart" style="height:188px">
            ${H.charts.bars(savedSeries.map((v, i) => ({ label: months12[i], value: v })), { height: 188 })}
          </div>
        </div>
      `));
      root.appendChild(chartsRow);

      /* ── ROW: rules list (span 2) + build-new mock panel ──────────────── */
      const rulesRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // RULES LIST ----------------------------------------------------------
      const rulesCard = H.el(`
        <div class="card span-2 flush">
          <div class="card-head" style="padding:16px 16px 0">
            <h3><span class="hico">🔀</span> Active Rules</h3>
            <span class="ch-meta">WHEN → THEN · TOP 8 OF 24</span>
          </div>
          <div class="automations-rules"></div>
        </div>
      `);
      const rulesWrap = rulesCard.querySelector('.automations-rules');
      const rules = [
        { on: true, sev: 'ok', trigger: 'invoice is 5 days overdue', action: 'email PostNord-style chase sequence', runs: 312, tag: 'BILLING' },
        { on: true, sev: 'ok', trigger: 'Stripe payment succeeds', action: 'create Fortnox voucher + receipt', runs: 1840, tag: 'FINANCE' },
        { on: true, sev: 'ok', trigger: 'order is marked paid', action: 'draft PostNord / DHL shipping label', runs: 724, tag: 'OPS' },
        { on: false, sev: 'off', trigger: 'SKU drops below reorder point', action: 'draft purchase order to supplier', runs: 58, tag: 'INVENTORY' },
        { on: true, sev: 'ok', trigger: 'new lead fills the contact form', action: 'enrich via Tink + assign to sales rep', runs: 196, tag: 'SALES' },
        { on: true, sev: 'warn', trigger: 'deal sits 14 days with no activity', action: 'nudge owner + flag in pipeline', runs: 87, tag: 'SALES' },
        { on: false, sev: 'off', trigger: 'customer churns', action: 'send win-back offer after 30 days', runs: 22, tag: 'GROWTH' },
        { on: true, sev: 'ok', trigger: 'payroll cutoff is reached', action: 'compile run + ping founder to approve', runs: 12, tag: 'TEAM' }
      ];
      rules.forEach((r, i) => {
        const node = H.el(`
          <div class="automations-rule${r.on ? '' : ' is-off'}">
            <button class="automations-toggle${r.on ? ' on' : ''}" role="switch" aria-checked="${r.on}" aria-label="Toggle rule">
              <span class="ka-knob"></span>
            </button>
            <div class="automations-rule-body">
              <div class="automations-rule-line">
                <span class="automations-when">WHEN</span>
                <span class="automations-trigger">${r.trigger}</span>
                <span class="automations-arrow">→</span>
                <span class="automations-then">THEN</span>
                <span class="automations-action">${r.action}</span>
              </div>
              <div class="automations-rule-meta">
                <span class="tag ${r.sev === 'warn' ? 'warn' : ''}">${r.tag}</span>
                <span class="automations-runs">${H.fmt.num(r.runs)} runs</span>
                <span class="automations-state ${r.on ? 'live' : 'paused'}">${r.on ? '● LIVE' : '⏸ PAUSED'}</span>
              </div>
            </div>
            <button class="btn btn-sm btn-ghost automations-rule-edit" aria-label="Edit rule">⋯</button>
          </div>
        `);

        // working on/off toggle
        const tog = node.querySelector('.automations-toggle');
        tog.addEventListener('click', () => {
          const nowOn = !tog.classList.contains('on');
          tog.classList.toggle('on', nowOn);
          tog.setAttribute('aria-checked', String(nowOn));
          node.classList.toggle('is-off', !nowOn);
          const stateEl = node.querySelector('.automations-state');
          stateEl.textContent = nowOn ? '● LIVE' : '⏸ PAUSED';
          stateEl.classList.toggle('live', nowOn);
          stateEl.classList.toggle('paused', !nowOn);
          H.toast(`Rule ${nowOn ? 'armed' : 'paused'} — ${r.trigger}`, nowOn ? 'success' : 'warn');
        });

        node.querySelector('.automations-rule-edit')
          .addEventListener('click', () => H.toast('Opening rule editor…', 'info'));

        rulesWrap.appendChild(node);
      });
      rulesRow.appendChild(rulesCard);

      // BUILD NEW mock panel ------------------------------------------------
      const builderCard = H.el(`
        <div class="card automations-builder">
          <div class="card-head">
            <h3><span class="hico">🧩</span> Build New</h3>
            <span class="ch-meta">WHEN THIS · DO THAT</span>
          </div>

          <div class="automations-bld-step">
            <div class="automations-bld-tag when">WHEN THIS…</div>
            <button class="automations-bld-slot" data-pick="trigger">
              <span class="automations-bld-ico">⚡</span>
              <span class="automations-bld-txt">Pick a trigger</span>
              <span class="automations-bld-chev">＋</span>
            </button>
          </div>

          <div class="automations-bld-conn"><span></span></div>

          <div class="automations-bld-step">
            <div class="automations-bld-tag do">DO THAT…</div>
            <button class="automations-bld-slot" data-pick="action">
              <span class="automations-bld-ico">🤖</span>
              <span class="automations-bld-txt">Pick an action</span>
              <span class="automations-bld-chev">＋</span>
            </button>
          </div>

          <div class="section-title mt">SUGGESTED TRIGGERS</div>
          <div class="automations-chips">
            <button class="automations-chip" data-trig="Stripe payment received">💳 Stripe payment</button>
            <button class="automations-chip" data-trig="New Tink bank transaction">🏦 Bank transaction</button>
            <button class="automations-chip" data-trig="Order shipped via PostNord">📦 Order shipped</button>
            <button class="automations-chip" data-trig="Form submitted on site">📝 Form submit</button>
          </div>

          <button class="btn btn-primary btn-block mt" data-act="save-flow">⚙️ Create automation</button>
        </div>
      `);

      builderCard.querySelectorAll('.automations-bld-slot').forEach(s =>
        s.addEventListener('click', () => H.toast(`Choose a ${s.dataset.pick}…`, 'info')));
      builderCard.querySelectorAll('.automations-chip').forEach(c =>
        c.addEventListener('click', () => {
          const slot = builderCard.querySelector('.automations-bld-slot[data-pick="trigger"] .automations-bld-txt');
          slot.textContent = c.dataset.trig;
          slot.closest('.automations-bld-slot').classList.add('filled');
          H.toast(`Trigger set: ${c.dataset.trig}`, 'success');
        }));
      builderCard.querySelector('[data-act="save-flow"]')
        .addEventListener('click', () => H.toast('Automation drafted — review and arm it', 'success'));

      rulesRow.appendChild(builderCard);
      root.appendChild(rulesRow);

      /* ── RECIPES LIBRARY (grid of cards) ──────────────────────────────── */
      root.appendChild(H.el(`<div class="section-title">RECIPE LIBRARY · ONE CLICK TO ADD</div>`));
      const recipesGrid = H.el(`<div class="grid cols-4 automations-recipes" style="margin-bottom:var(--gap)"></div>`);
      const recipes = [
        { ico: '💸', name: 'Chase overdue invoices', desc: 'Email a polite escalation series until paid.', uses: 312, tag: 'BILLING' },
        { ico: '🧾', name: 'Stripe → Fortnox sync', desc: 'Book every payout as a voucher automatically.', uses: 1840, tag: 'FINANCE' },
        { ico: '📦', name: 'Auto-print shipping labels', desc: 'Paid order → PostNord/DHL label drafted.', uses: 724, tag: 'OPS' },
        { ico: '🔁', name: 'Low-stock reorder', desc: 'Below par → draft PO to your supplier.', uses: 58, tag: 'INVENTORY' },
        { ico: '👋', name: 'Welcome new customers', desc: 'Onboarding email + Slack ping to the team.', uses: 263, tag: 'GROWTH' },
        { ico: '🧭', name: 'Stale deal nudge', desc: '14 days quiet → remind the deal owner.', uses: 87, tag: 'SALES' },
        { ico: '⭐', name: 'Request a review', desc: 'Delivered order → ask for a rating in 3 days.', uses: 141, tag: 'GROWTH' },
        { ico: '📅', name: 'Weekly founder digest', desc: 'Every Monday 08:00, mail the week ahead.', uses: 52, tag: 'TEAM' }
      ];
      recipes.forEach(rc => {
        const card = H.el(`
          <div class="card automations-recipe">
            <div class="automations-recipe-top">
              <div class="automations-recipe-ico">${rc.ico}</div>
              <span class="tag">${rc.tag}</span>
            </div>
            <div class="automations-recipe-name">${rc.name}</div>
            <div class="automations-recipe-desc">${rc.desc}</div>
            <div class="row between mt-sm">
              <span class="automations-recipe-uses">${H.fmt.num(rc.uses)} teams use this</span>
              <button class="btn btn-sm btn-primary automations-recipe-use">Use</button>
            </div>
          </div>
        `);
        card.querySelector('.automations-recipe-use')
          .addEventListener('click', () => H.toast(`Added “${rc.name}” — configure and arm`, 'success'));
        recipesGrid.appendChild(card);
      });
      root.appendChild(recipesGrid);

      /* ── RUN HISTORY TABLE ────────────────────────────────────────────── */
      const histCard = H.el(`
        <div class="card flush">
          <div class="card-head" style="padding:16px 16px 0">
            <h3><span class="hico">🗒️</span> Run History</h3>
            <span class="ch-meta">LATEST 9 EXECUTIONS</span>
          </div>
          <div style="overflow-x:auto">
            <table class="table automations-history">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Automation</th>
                  <th>Detail</th>
                  <th>Result</th>
                  <th class="num">Duration</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `);
      const tbody = histCard.querySelector('tbody');
      const history = [
        ['09:42:18', 'Stripe → Fortnox sync', 'Voucher #4471 booked · Northwind AB', 'ok', '0.8s'],
        ['09:41:55', 'Auto-print shipping labels', 'PostNord label · Order #1043', 'ok', '1.2s'],
        ['09:40:02', 'Chase overdue invoices', '6 reminders queued', 'ok', '2.4s'],
        ['09:38:47', 'Low-stock reorder', 'SKU AX-12 · supplier timeout', 'warn', '4.9s'],
        ['09:36:10', 'Stale deal nudge', 'Forsberg Konsult · owner pinged', 'ok', '0.6s'],
        ['09:33:21', 'Welcome new customers', 'Lykke Studios onboarded', 'ok', '1.1s'],
        ['09:30:09', 'Stripe → Fortnox sync', 'Payout €12.4K reconciled', 'ok', '0.9s'],
        ['09:27:44', 'Request a review', 'DHL webhook 502 · auto-retried', 'bad', '6.1s'],
        ['09:24:30', 'Weekly founder digest', 'Sent to arvid@northwind.se', 'ok', '0.7s']
      ];
      const pillFor = { ok: 'pill ok', warn: 'pill warn', bad: 'pill bad' };
      const pillTxt = { ok: 'SUCCESS', warn: 'RETRIED', bad: 'FAILED' };
      history.forEach(([t, name, detail, res, dur]) => {
        tbody.appendChild(H.el(`
          <tr>
            <td class="mono">${t}</td>
            <td><strong>${name}</strong></td>
            <td class="muted">${detail}</td>
            <td><span class="${pillFor[res]}">${pillTxt[res]}</span></td>
            <td class="num mono">${dur}</td>
          </tr>
        `));
      });
      root.appendChild(histCard);

      /* ── view-head action wiring ──────────────────────────────────────── */
      root.querySelector('[data-act="new"]')
        .addEventListener('click', () => {
          H.toast('New automation — pick a trigger to begin', 'info');
          builderCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      root.querySelector('[data-act="library"]')
        .addEventListener('click', () => {
          recipesGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
          H.toast('Browse the recipe library', 'info');
        });
    }
  });
})();
