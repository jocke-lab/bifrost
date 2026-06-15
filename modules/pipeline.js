/* ============================================================================
   pipeline.js — Pipeline. The kanban of money in motion.
   Sales pipeline & deals: KPIs + win-rate gauge, a 5-stage horizontal kanban
   (Lead → Qualified → Proposal → Negotiation → Won), monthly forecast bars,
   a deals table, and a conversion funnel.
   Follows the HELM module contract (see command.js): register({id,...}),
   build DOM in render(root) with H.el + documented classes + H.charts,
   wire every button to H.toast/H.show, no global keys, fully responsive.
   ========================================================================== */
(function () {
  const H = window.HELM;

  H.register({
    id: 'pipeline',
    label: 'Pipeline',
    icon: '🎯',
    render(root) {
      const D = H.data;
      const money = H.fmt.money;

      /* ── owners (deterministic avatar gradients keyed by name) ────────── */
      const OWNERS = {
        'Astrid Lund':    'linear-gradient(135deg,var(--accent1),var(--accent2))',
        'Viktor Holm':    'linear-gradient(135deg,var(--accent2),var(--accent3))',
        'Nora Berg':      'linear-gradient(135deg,var(--accent3),var(--accent1))',
        'Emil Søderberg': 'linear-gradient(135deg,var(--warn),var(--accent2))'
      };
      function avatar(name) {
        return `<span class="pipeline-av" title="${name}" style="background:${OWNERS[name] || 'var(--accent-grad)'}">${D.initials(name)}</span>`;
      }

      /* ── the deals (the single source of truth for kanban + table) ────── */
      // stage: 0 Lead · 1 Qualified · 2 Proposal · 3 Negotiation · 4 Won
      // Open-pipeline value (stage 0–3) sums to exactly $612K to match the
      // Shell tape's canonical PIPELINE chip. Won deals (stage 4) sit apart.
      const DEALS = [
        { co: 'Kjell & Co',        val: 27500,  owner: 'Viktor Holm',    stage: 0, age: 2,  prob: 10, heat: 'cold' },
        { co: 'Frost Logistik',    val: 19500,  owner: 'Emil Søderberg', stage: 0, age: 1,  prob: 10, heat: 'cold' },
        { co: 'Aurora Textil',     val: 24500,  owner: 'Nora Berg',      stage: 0, age: 4,  prob: 10, heat: 'cold' },
        { co: 'Bergström Mekan',   val: 34000,  owner: 'Emil Søderberg', stage: 1, age: 3,  prob: 25, heat: 'warm' },
        { co: 'Nordkvist Bygg',    val: 48000,  owner: 'Astrid Lund',    stage: 1, age: 5,  prob: 30, heat: 'warm' },
        { co: 'Granö Trä',         val: 21500,  owner: 'Astrid Lund',    stage: 1, age: 7,  prob: 20, heat: 'cold' },
        { co: 'Lykke Studios',     val: 58000,  owner: 'Viktor Holm',    stage: 2, age: 6,  prob: 45, heat: 'warm' },
        { co: 'Hedlund Energi',    val: 74000,  owner: 'Nora Berg',      stage: 2, age: 9,  prob: 50, heat: 'hot'  },
        { co: 'Lindqvist Pharma',  val: 87000,  owner: 'Viktor Holm',    stage: 2, age: 11, prob: 45, heat: 'warm' },
        { co: 'Northwind AB',      val: 92000,  owner: 'Astrid Lund',    stage: 3, age: 12, prob: 70, heat: 'hot'  },
        { co: 'Saga Robotics',     val: 77000,  owner: 'Astrid Lund',    stage: 3, age: 18, prob: 60, heat: 'hot'  },
        { co: 'Vinterberg Media',  val: 49000,  owner: 'Emil Søderberg', stage: 3, age: 14, prob: 65, heat: 'hot'  },
        { co: 'Forsberg Konsult',  val: 96000,  owner: 'Nora Berg',      stage: 4, age: 21, prob: 100, heat: 'won' },
        { co: 'Solvik Marin',      val: 63000,  owner: 'Viktor Holm',    stage: 4, age: 27, prob: 100, heat: 'won' },
        { co: 'Öresund Capital',   val: 84000,  owner: 'Nora Berg',      stage: 4, age: 19, prob: 100, heat: 'won' }
      ];

      const STAGES = [
        { key: 'Lead',        prob: 0.10, accent: 'var(--text-faint)' },
        { key: 'Qualified',   prob: 0.30, accent: 'var(--accent3)' },
        { key: 'Proposal',    prob: 0.50, accent: 'var(--accent2)' },
        { key: 'Negotiation', prob: 0.70, accent: 'var(--warn)' },
        { key: 'Won',         prob: 1.00, accent: 'var(--success)' }
      ];

      /* ── derived metrics ──────────────────────────────────────────────── */
      const open = DEALS.filter(d => d.stage < 4);
      const won = DEALS.filter(d => d.stage === 4);
      const pipelineValue = open.reduce((a, d) => a + d.val, 0);              // = $612K (matches the tape)
      const weighted = open.reduce((a, d) => a + d.val * (d.prob / 100), 0);  // probability-adjusted
      const winRate = 34; // %
      const avgDeal = Math.round(DEALS.reduce((a, d) => a + d.val, 0) / DEALS.length);

      const HEAT = { hot: 'bad', warm: 'warn', cold: 'info', won: 'ok' };
      const HEAT_LABEL = { hot: 'HOT', warm: 'WARM', cold: 'COLD', won: 'WON' };

      /* ════════════════════════════════════════════════════════════════════
         VIEW HEAD
         ══════════════════════════════════════════════════════════════════ */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">🎯</div>
            <div>
              <h1>Pipeline</h1>
              <p>The kanban of money in motion — every deal, weighted and tracked to close.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="forecast">◷ Forecast call</button>
            <button class="btn btn-primary btn-sm" data-act="newdeal">+ New deal</button>
          </div>
        </div>
      `));

      /* ════════════════════════════════════════════════════════════════════
         KPI ROW  (3 KPI tiles + win-rate gauge)
         ══════════════════════════════════════════════════════════════════ */
      const kpiRow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);

      const kpis = [
        { label: 'PIPELINE VALUE', count: pipelineValue, fmt: 'money', trend: '+18.2%', dir: 'up',
          sub: `${open.length} open deals`, spark: D.series('pl-pv', 14, 488, 612, 0.10) },
        { label: 'WEIGHTED FORECAST', count: Math.round(weighted), fmt: 'money', trend: '+9.4%', dir: 'up',
          sub: 'probability-adjusted', spark: D.series('pl-wf', 14, 244, 279, 0.08) },
        { label: 'AVG DEAL SIZE', count: avgDeal, fmt: 'money', trend: '+4.1%', dir: 'up',
          sub: 'rolling 90 days', spark: D.series('pl-ad', 14, 48, 57, 0.12) }
      ];
      kpis.forEach(k => {
        kpiRow.appendChild(H.el(`
          <div class="card kpi pipeline-kpi">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-value" data-count="${k.count}" data-fmt="${k.fmt}">0</div>
            <div class="row between mt-sm">
              <span class="kpi-trend ${k.dir}">${k.trend}</span>
              <span class="kpi-sub">${k.sub}</span>
            </div>
            <div class="spark">${H.charts.spark(k.spark)}</div>
          </div>
        `));
      });

      // win-rate gauge tile
      const gaugeCard = H.el(`
        <div class="card pipeline-gauge-card">
          <div class="kpi-label">WIN RATE</div>
          <div class="pipeline-gauge">
            ${H.charts.gauge(winRate, { max: 100, size: 150, arc: 250, value: winRate })}
            <div class="pipeline-gauge-core">
              <span class="pgc-num">${winRate}<i>%</i></span>
              <span class="pgc-lbl">CLOSED · WON</span>
            </div>
          </div>
          <div class="row between">
            <span class="kpi-trend up">+3.0%</span>
            <span class="kpi-sub">${won.length} won · ${open.length} open</span>
          </div>
        </div>
      `);
      // suppress the gauge's built-in big number — we overlay our own core
      const gtxt = gaugeCard.querySelector('.pipeline-gauge svg text');
      if (gtxt) gtxt.style.display = 'none';
      kpiRow.appendChild(gaugeCard);
      root.appendChild(kpiRow);

      /* ════════════════════════════════════════════════════════════════════
         KANBAN — 5 horizontally-scrolling stage columns
         ══════════════════════════════════════════════════════════════════ */
      const kanbanCard = H.el(`
        <div class="card flush pipeline-board-card" style="margin-bottom:var(--gap)">
          <div class="card-head" style="padding:16px 16px 0;margin-bottom:12px">
            <h3><span class="hico">🎯</span> Deal Board</h3>
            <span class="ch-meta">${DEALS.length} DEALS · ${money(pipelineValue + won.reduce((a, d) => a + d.val, 0))} TOTAL</span>
          </div>
          <div class="pipeline-board"></div>
        </div>
      `);
      const board = kanbanCard.querySelector('.pipeline-board');

      STAGES.forEach((st, si) => {
        const inStage = DEALS.filter(d => d.stage === si);
        const subtotal = inStage.reduce((a, d) => a + d.val, 0);
        const col = H.el(`
          <div class="pipeline-col" data-stage="${si}">
            <div class="pipeline-col-head" style="--stage-accent:${st.accent}">
              <div class="pch-top">
                <span class="pch-name">${st.key}</span>
                <span class="pch-count">${inStage.length}</span>
              </div>
              <div class="pch-total">${money(subtotal)}</div>
            </div>
            <div class="pipeline-col-body"></div>
            <button class="pipeline-addrow" data-stage="${st.key}">+ Add deal</button>
          </div>
        `);
        const body = col.querySelector('.pipeline-col-body');

        inStage.forEach(d => {
          const card = H.el(`
            <div class="pipeline-deal" data-co="${d.co}" tabindex="0">
              <div class="pd-top">
                <span class="pd-co">${d.co}</span>
                <span class="tag ${HEAT[d.heat]} pd-heat">${HEAT_LABEL[d.heat]}</span>
              </div>
              <div class="pd-val">${money(d.val)}</div>
              <div class="pd-foot">
                <span class="pd-owner">${avatar(d.owner)}<span class="pd-owner-name">${d.owner.split(' ')[0]}</span></span>
                <span class="pd-age" title="Days in stage">◷ ${d.age}d</span>
              </div>
              <div class="pd-prob"><div class="pd-prob-bar" style="width:${d.prob}%;background:${st.accent}"></div></div>
            </div>
          `);
          card.addEventListener('click', () => H.toast(`${d.co} — ${money(d.val)} · ${st.key} (${d.prob}%)`, 'info'));
          body.appendChild(card);
        });

        col.querySelector('.pipeline-addrow').addEventListener('click', () =>
          H.toast(`New deal in ${st.key}…`, 'info'));
        board.appendChild(col);
      });
      root.appendChild(kanbanCard);

      /* ════════════════════════════════════════════════════════════════════
         FORECAST BARS + CONVERSION FUNNEL  (cols-3: bars span 2 + funnel)
         ══════════════════════════════════════════════════════════════════ */
      const midRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // monthly forecast bars (commit vs best-case, last 3 months are forecast)
      // primary series = COMMIT (closed-won for mo 0–4, committed forecast for 5–7,
      //   coloured amber); second series = BEST CASE (always a touch higher).
      const months8 = D.months.slice(0, 8);
      const commitBars = D.series('pl-commit', 8, 180000, 320000, 0.16);
      const upsideBars = D.series('pl-upside', 8, 40000, 90000, 0.18);
      const bestCase = commitBars.map((v, i) => v + upsideBars[i]); // strictly above commit
      const barData = commitBars.map((v, i) => ({
        label: months8[i],
        value: v,
        color: i >= 5 ? 'var(--warn)' : undefined // forecast months read amber
      }));

      midRow.appendChild(H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">📊</span> Monthly Forecast</h3>
            <span class="ch-meta">COMMIT × BEST CASE · 8 MO</span>
          </div>
          <div class="chart" style="height:220px">
            ${H.charts.bars(barData, { height: 220, b: bestCase })}
          </div>
          <div class="row between mt-sm">
            <span class="pill ok">● COMMIT</span>
            <span class="pill" style="color:var(--accent3);border-color:var(--accent3)">● BEST CASE</span>
            <span class="pill warn">● FORECAST MO</span>
          </div>
        </div>
      `));

      // conversion funnel — stat-rows with shrinking bars
      const funnelCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">⏬</span> Conversion Funnel</h3>
            <span class="ch-meta">LEAD → WON</span>
          </div>
          <div class="pipeline-funnel"></div>
          <div class="stat-row mt">
            <span class="sr-label">Lead → Won</span>
            <span class="sr-val" style="color:var(--success)">22.5%</span>
          </div>
        </div>
      `);
      const funnel = funnelCard.querySelector('.pipeline-funnel');
      // counts entering each stage (deterministic, monotonically shrinking)
      const funnelData = [
        { label: 'Leads',        n: 320, pct: 100 },
        { label: 'Qualified',    n: 188, pct: 59 },
        { label: 'Proposal',     n: 104, pct: 33 },
        { label: 'Negotiation',  n: 88,  pct: 28 },
        { label: 'Won',          n: 72,  pct: 23 }
      ];
      funnelData.forEach((f, i) => {
        const st = STAGES[i];
        const drop = i > 0 ? Math.round((1 - f.n / funnelData[i - 1].n) * 100) : null;
        const node = H.el(`
          <div class="pipeline-fstep">
            <div class="pf-meta">
              <span class="pf-name">${f.label}</span>
              <span class="pf-n">${f.n} <i>· ${f.pct}%</i>${drop != null ? `<em class="pf-drop">−${drop}%</em>` : ''}</span>
            </div>
            <div class="pf-track"><div class="pf-bar" style="width:0;background:${st.accent}"></div></div>
          </div>
        `);
        funnel.appendChild(node);
        const bar = node.querySelector('.pf-bar');
        setTimeout(() => { bar.style.width = f.pct + '%'; }, 200 + i * 90);
      });
      midRow.appendChild(funnelCard);
      root.appendChild(midRow);

      /* ════════════════════════════════════════════════════════════════════
         DEALS TABLE
         ══════════════════════════════════════════════════════════════════ */
      const tableCard = H.el(`
        <div class="card flush">
          <div class="card-head" style="padding:16px 16px 0">
            <h3><span class="hico">📋</span> All Deals</h3>
            <div class="ch-meta row gap-sm">
              <button class="btn btn-sm btn-ghost" data-filter="all">ALL</button>
              <button class="btn btn-sm btn-ghost" data-filter="open">OPEN</button>
              <button class="btn btn-sm btn-ghost" data-filter="won">WON</button>
            </div>
          </div>
          <div class="pipeline-table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Owner</th>
                  <th>Stage</th>
                  <th class="num">Value</th>
                  <th class="num">Prob.</th>
                  <th class="num">Weighted</th>
                  <th class="num">Age</th>
                  <th>Heat</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `);
      const tbody = tableCard.querySelector('tbody');
      const sorted = DEALS.slice().sort((a, b) => b.val - a.val);
      function paintRows(filter) {
        tbody.innerHTML = '';
        sorted.filter(d =>
          filter === 'won' ? d.stage === 4 :
          filter === 'open' ? d.stage < 4 : true
        ).forEach(d => {
          const st = STAGES[d.stage];
          const row = H.el(`
            <tr data-co="${d.co}">
              <td><b>${d.co}</b></td>
              <td><span class="pipeline-tcell">${avatar(d.owner)}<span class="muted">${d.owner.split(' ')[0]}</span></span></td>
              <td><span class="pipeline-stage-chip" style="--stage-accent:${st.accent}">${st.key}</span></td>
              <td class="num mono">${money(d.val)}</td>
              <td class="num mono">${d.prob}%</td>
              <td class="num mono">${money(Math.round(d.val * d.prob / 100))}</td>
              <td class="num mono">${d.age}d</td>
              <td><span class="tag ${HEAT[d.heat]}">${HEAT_LABEL[d.heat]}</span></td>
            </tr>
          `);
          row.addEventListener('click', () => H.toast(`Opening ${d.co}…`, 'info'));
          tbody.appendChild(row);
        });
      }
      paintRows('all');
      // wire filter buttons
      tableCard.querySelectorAll('[data-filter]').forEach(b => {
        b.addEventListener('click', () => {
          tableCard.querySelectorAll('[data-filter]').forEach(x => x.classList.remove('btn-primary'));
          b.classList.add('btn-primary');
          paintRows(b.dataset.filter);
        });
      });
      tableCard.querySelector('[data-filter="all"]').classList.add('btn-primary');
      root.appendChild(tableCard);

      /* ════════════════════════════════════════════════════════════════════
         WIRE VIEW-HEAD ACTIONS
         ══════════════════════════════════════════════════════════════════ */
      root.querySelector('[data-act="newdeal"]').addEventListener('click', () => H.toast('Drafting a new deal…', 'success'));
      root.querySelector('[data-act="forecast"]').addEventListener('click', () => H.toast('Forecast call scheduled with sales', 'info'));

      // count-ups auto-run by the shell after render().
    }
  });
})();
