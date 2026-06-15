/* ============================================================================
   analytics.js — Analytics & BI · the cross-company explorer.
   Follows the command.js reference shape EXACTLY:
     1) HELM.register({ id, label, icon, render })
     2) build DOM with H.el(...) + documented .classes + HELM.charts only
     3) never inject fonts/colors/global styles; never touch other modules
     4) all on-screen numbers via HELM.fmt or [data-count]
   Sections: hero metric-explorer (tabbed area chart) · 6-KPI spark grid ·
   traffic-sources donut · conversion-over-time area · retention cohort heatmap ·
   insights/anomalies feed. Deterministic data only (HELM.data, no random/clock).
   ========================================================================== */
(function () {
  const H = window.HELM;

  H.register({
    id: 'analytics',
    label: 'Analytics',
    icon: '📊',
    render(root) {
      const D = H.data;

      /* ── hero metric-explorer series: 4 swappable metrics ──────────────── */
      // Each metric: a 24-pt primary series + a 24-pt comparison ("prev period")
      // + axis labels, a money/num formatter, a headline value & trend.
      const METRICS = {
        revenue: {
          // money is rendered via the shell count-up (data-fmt="money"), which is
          // locked to the '$' symbol — so the unit label is USD to stay consistent
          // with the value and with the Shell tape (all '$').
          label: 'Revenue', accent: 'kronor', unit: 'USD',
          headline: 4820000, fmt: 'money', trend: '+18.4%', dir: 'up',
          sub: 'Net revenue · trailing 24 months · vs prior period',
          s1: D.series('an-rev', 24, 118000, 312000, 0.11),
          s2: D.series('an-rev-prev', 24, 96000, 248000, 0.13)
        },
        users: {
          label: 'Users', accent: 'people', unit: 'MAU',
          headline: 28940, fmt: 'num', trend: '+11.2%', dir: 'up',
          sub: 'Monthly active users · trailing 24 months · vs prior period',
          s1: D.series('an-usr', 24, 9200, 28940, 0.07),
          s2: D.series('an-usr-prev', 24, 7400, 22100, 0.09)
        },
        orders: {
          label: 'Orders', accent: 'orders', unit: 'ORD',
          headline: 11420, fmt: 'num', trend: '+6.9%', dir: 'up',
          sub: 'Orders placed · trailing 24 months · vs prior period',
          s1: D.series('an-ord', 24, 4100, 11420, 0.14),
          s2: D.series('an-ord-prev', 24, 3600, 9800, 0.15)
        },
        sessions: {
          label: 'Sessions', accent: 'sessions', unit: 'SESS',
          headline: 482300, fmt: 'num', trend: '-2.3%', dir: 'down',
          sub: 'Site sessions · trailing 24 months · vs prior period',
          s1: D.series('an-sess', 24, 210000, 482300, 0.16),
          s2: D.series('an-sess-prev', 24, 198000, 461000, 0.12)
        }
      };
      const METRIC_ORDER = ['revenue', 'users', 'orders', 'sessions'];
      let activeMetric = 'revenue';

      /* ── 6 KPI tiles (spark + trend) ───────────────────────────────────── */
      // NOTE: `dir` is the arrow/colour direction and MUST agree with the SIGN of
      // `trend` (HELM convention: ▲ green = up, ▼ red = down). A falling metric that
      // is "good" (e.g. bounce) still shows ▼ so the arrow never contradicts the sign.
      const KPIS = [
        { label: 'CONVERSION RATE', count: 3.84, fmt: null, suffix: '%', dp: 2, trend: '+0.42pp', dir: 'up', spark: D.series('k-cvr', 16, 2.9, 3.84, 0.10) },
        { label: 'AVG ORDER VALUE', count: 1284, fmt: 'money', trend: '+$96', dir: 'up', spark: D.series('k-aov', 16, 1080, 1284, 0.06) },
        { label: 'BOUNCE RATE', count: 38.2, fmt: null, suffix: '%', dp: 1, trend: '-3.1pp', dir: 'down', spark: D.series('k-bnc', 16, 46, 38, 0.08) },
        { label: 'NEW VISITORS', count: 64.7, fmt: null, suffix: '%', dp: 1, trend: '+1.8pp', dir: 'up', spark: D.series('k-new', 16, 58, 64, 0.05) },
        { label: 'AVG SESSION', count: 4.2, fmt: null, suffix: 'm', dp: 1, trend: '+0.4m', dir: 'up', spark: D.series('k-dur', 16, 3.1, 4.2, 0.09) },
        { label: 'CHURN · 30D', count: 2.1, fmt: null, suffix: '%', dp: 1, trend: '+0.3pp', dir: 'up', spark: D.series('k-chn', 16, 1.6, 2.1, 0.12) }
      ];

      /* ── traffic sources (donut) ───────────────────────────────────────── */
      const SOURCES = [
        { label: 'Organic search', value: 38, color: 'var(--accent1)' },
        { label: 'Direct', value: 24, color: 'var(--accent2)' },
        { label: 'Paid social', value: 18, color: 'var(--accent3)' },
        { label: 'Referral', value: 12, color: 'var(--warn)' },
        { label: 'Email', value: 8, color: '#5ad1b0' }
      ];
      const sourceTotal = SOURCES.reduce((a, s) => a + s.value, 0);

      /* ── retention cohort grid (heat-colored) ──────────────────────────── */
      // rows = signup cohort month; cols = weeks-since (W0..W7); values = % retained
      const COHORTS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN'];
      const COHORT_SIZE = [842, 910, 1024, 1188, 1356, 1502];
      // deterministic decaying retention per cohort.
      // A retention curve must be MONOTONICALLY non-increasing (a funnel can never
      // climb back up), so we clamp each week to be <= the previous week. Later
      // cohorts decay to a higher floor (they "hold better").
      const cohortRows = COHORTS.map((m, ci) => {
        const r = D.series('coh-' + m, 8, 100, 28 + ci * 2, 0.04);
        let prev = 100;
        return r.map((v, wi) => {
          if (wi === 0) return 100;                 // W0 is always 100%
          const clamped = Math.min(prev, Math.max(0, Math.round(v)));
          prev = clamped;
          return clamped;
        });
      });

      /* ── insights / anomalies ──────────────────────────────────────────── */
      const INSIGHTS = [
        { sev: 'info', ico: '📱', title: 'Conversion up 18% on mobile', sub: 'iOS Safari · last 7 days · now 4.31% vs 3.65%', tag: 'OPPORTUNITY' },
        { sev: 'warn', ico: '🐢', title: 'Checkout latency anomaly', sub: 'Step 3 load time +1.4s on Tue 03:00–06:00 · −210 orders est.', tag: 'INVESTIGATE' },
        { sev: 'info', ico: '🔎', title: 'Organic search overtook Direct', sub: 'First time this quarter · 38% of sessions (+6pp)', tag: 'TREND' },
        { sev: 'bad', ico: '📉', title: 'Sessions down 2.3% MoM', sub: 'Driven by paid social CPM spike · ROAS 3.4× → 2.9×', tag: 'WATCH' },
        { sev: 'info', ico: '🌍', title: 'New geo: Norway converting hot', sub: '4.9% CVR · 312 new sessions · AOV $1,540', tag: 'EXPAND' }
      ];

      /* ── HERO chart render helper (re-runs on tab swap) ────────────────── */
      function heroSvg(key) {
        const m = METRICS[key];
        return H.charts.area(m.s1, {
          height: 250,
          v2: m.s2,
          grid: true,
          labels: ['24M', '18M', '12M', '6M', 'NOW']
        });
      }

      /* ════════════════════════════════════════════════════════════════════
         BUILD MARKUP
         ════════════════════════════════════════════════════════════════════ */

      /* view header */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">📊</div>
            <div>
              <h1>Analytics</h1>
              <p>The cross-company explorer — every metric, one lens, drill anywhere.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="range">◷ Last 24 months ▾</button>
            <button class="btn btn-ghost btn-sm" data-act="export">⬇ Export</button>
            <button class="btn btn-primary btn-sm" data-act="explore">⌘K Explore</button>
          </div>
        </div>
      `));

      /* ── HERO: metric-explorer area chart with tab buttons ─────────────── */
      const hero = H.el(`
        <div class="card glow pad-lg analytics-hero" style="margin-bottom:var(--gap)">
          <div class="card-head">
            <h3><span class="hico">📈</span> Metric Explorer</h3>
            <span class="ch-meta" data-an="hero-sub">${METRICS[activeMetric].sub}</span>
          </div>
          <div class="analytics-hero-top">
            <div class="analytics-tabs" role="tablist"></div>
            <div class="analytics-hero-figure">
              <div class="analytics-hero-val" data-an="hero-val"></div>
              <div class="analytics-hero-meta">
                <span class="kpi-trend ${METRICS[activeMetric].dir}" data-an="hero-trend">${METRICS[activeMetric].trend}</span>
                <span class="analytics-legend">
                  <span class="al cur"><i></i>This period</span>
                  <span class="al prev"><i></i>Prior period</span>
                </span>
              </div>
            </div>
          </div>
          <div class="chart analytics-hero-chart" style="height:250px" data-an="hero-chart">${heroSvg(activeMetric)}</div>
        </div>
      `);

      // build tab buttons
      const tabWrap = hero.querySelector('.analytics-tabs');
      METRIC_ORDER.forEach(key => {
        const m = METRICS[key];
        const b = H.el(`<button class="analytics-tab ${key === activeMetric ? 'on' : ''}" data-metric="${key}" role="tab">${m.label}</button>`);
        tabWrap.appendChild(b);
      });

      // headline value tile (count-up). We render a fresh node per swap so the
      // shell's count-up can re-fire deterministically.
      const valHost = hero.querySelector('[data-an="hero-val"]');
      function paintHeadline(key) {
        const m = METRICS[key];
        valHost.innerHTML =
          `<span class="analytics-hero-unit">${m.unit}</span>` +
          `<span class="kpi-value" data-count="${m.headline}" data-fmt="${m.fmt}">0</span>`;
        H.count(valHost.querySelector('[data-count]'));
      }
      paintHeadline(activeMetric);

      // swap logic
      function swapMetric(key) {
        if (key === activeMetric) return;
        activeMetric = key;
        const m = METRICS[key];
        tabWrap.querySelectorAll('.analytics-tab').forEach(t =>
          t.classList.toggle('on', t.dataset.metric === key));
        hero.querySelector('[data-an="hero-chart"]').innerHTML = heroSvg(key);
        hero.querySelector('[data-an="hero-sub"]').textContent = m.sub;
        const tr = hero.querySelector('[data-an="hero-trend"]');
        tr.textContent = m.trend;
        tr.className = 'kpi-trend ' + m.dir;
        paintHeadline(key);
        H.toast('Explorer → ' + m.label, 'info');
      }
      tabWrap.querySelectorAll('.analytics-tab').forEach(b =>
        b.addEventListener('click', () => swapMetric(b.dataset.metric)));

      root.appendChild(hero);

      /* ── KPI GRID: 6 metrics, each spark + trend ───────────────────────── */
      root.appendChild(H.el(`<div class="section-title">Key metrics · last 16 weeks</div>`));
      const kpiGrid = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);
      KPIS.forEach(k => {
        const dataFmt = k.fmt ? `data-fmt="${k.fmt}"` : '';
        const dp = k.dp != null ? `data-dp="${k.dp}"` : '';
        const suffix = k.suffix ? `data-suffix="${k.suffix}"` : '';
        kpiGrid.appendChild(H.el(`
          <div class="card kpi analytics-kpi">
            <div class="row between">
              <div class="kpi-label">${k.label}</div>
              <span class="kpi-trend ${k.dir}">${k.trend}</span>
            </div>
            <div class="kpi-value sm" data-count="${k.count}" ${dataFmt} ${dp} ${suffix}>0</div>
            <div class="spark">${H.charts.spark(k.spark)}</div>
          </div>
        `));
      });
      root.appendChild(kpiGrid);

      /* ── MID ROW: traffic donut (1) + conversion area (span-2) ─────────── */
      const mid = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // traffic sources donut
      const donutCard = H.el(`
        <div class="card analytics-traffic">
          <div class="card-head">
            <h3><span class="hico">🌐</span> Traffic Sources</h3>
            <span class="ch-meta">SESSIONS · 30D</span>
          </div>
          <div class="analytics-donut-wrap">
            <div class="chart analytics-donut" style="height:188px">
              ${H.charts.donut(SOURCES, { size: 188, thickness: 24, center: { value: H.fmt.num(482300), label: 'SESSIONS' } })}
            </div>
            <div class="analytics-legend-list"></div>
          </div>
        </div>
      `);
      const legendList = donutCard.querySelector('.analytics-legend-list');
      SOURCES.forEach(s => {
        const pct = Math.round((s.value / sourceTotal) * 100);
        const node = H.el(`
          <button class="analytics-src" data-src="${s.label}">
            <span class="as-dot" style="background:${s.color};box-shadow:0 0 7px ${s.color}"></span>
            <span class="as-name">${s.label}</span>
            <span class="as-val">${pct}%</span>
          </button>
        `);
        node.addEventListener('click', () => H.toast('Drill into ' + s.label + ' · ' + pct + '% of sessions', 'info'));
        legendList.appendChild(node);
      });
      mid.appendChild(donutCard);

      // conversion-over-time area (span 2)
      const convSeries = D.series('an-conv', 30, 2.6, 3.84, 0.10);
      mid.appendChild(H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">🎯</span> Conversion Over Time</h3>
            <span class="ch-meta">RATE % · LAST 30 DAYS</span>
          </div>
          <div class="row gap-sm mt-sm" style="margin-bottom:6px">
            <span class="pill ok">● 3.84% NOW</span>
            <span class="tag info">PEAK 4.31% · DAY 27</span>
            <span class="tag">GOAL 4.00%</span>
          </div>
          <div class="chart" style="height:208px">
            ${H.charts.area(convSeries, { height: 208, forecastFrom: 25, labels: ['30D', '21D', '14D', '7D', 'NOW'] })}
          </div>
        </div>
      `));
      root.appendChild(mid);

      /* ── RETENTION COHORT TABLE (heat-colored) + INSIGHTS ──────────────── */
      const lower = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // cohort table (span 2)
      const cohortCard = H.el(`
        <div class="card span-2 analytics-cohort">
          <div class="card-head">
            <h3><span class="hico">🧬</span> Retention Cohorts</h3>
            <span class="ch-meta">% RETAINED · BY WEEK</span>
          </div>
          <div class="analytics-cohort-scroll">
            <table class="table analytics-cohort-table">
              <thead>
                <tr>
                  <th>COHORT</th>
                  <th class="num">SIZE</th>
                  <th class="num">W0</th><th class="num">W1</th><th class="num">W2</th>
                  <th class="num">W3</th><th class="num">W4</th><th class="num">W5</th>
                  <th class="num">W6</th><th class="num">W7</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
          <div class="analytics-heat-key">
            <span>LOW</span>
            <span class="ahk-bar"></span>
            <span>HIGH</span>
          </div>
        </div>
      `);
      const cohortBody = cohortCard.querySelector('tbody');
      cohortRows.forEach((row, ri) => {
        const tr = H.el(`<tr><td class="mono">${COHORTS[ri]} ’26</td><td class="num mono faint">${H.fmt.num(COHORT_SIZE[ri])}</td></tr>`);
        row.forEach(v => {
          // heat: 0..100 -> intensity tinted warm/cold by retention band.
          // Token-based via color-mix so the heatmap follows the active theme accents
          // (no hardcoded rgb literals) and inherits the theme switcher's --accent*.
          const t = Math.max(0, Math.min(1, v / 100));
          let token, pct;
          if (v >= 60) { token = 'var(--accent1)'; pct = (6 + t * 42).toFixed(1); }
          else if (v >= 35) { token = 'var(--accent2)'; pct = (5 + t * 30).toFixed(1); }
          else { token = 'var(--accent3)'; pct = (5 + t * 22).toFixed(1); }
          const bg = `color-mix(in srgb, ${token} ${pct}%, transparent)`;
          const txt = v >= 50 ? 'var(--text)' : 'var(--text-muted)';
          tr.appendChild(H.el(`<td class="num mono analytics-heat" style="background:${bg};color:${txt}">${v}</td>`));
        });
        cohortBody.appendChild(tr);
      });
      lower.appendChild(cohortCard);

      // insights / anomalies feed
      const insightCard = H.el(`
        <div class="card analytics-insights">
          <div class="card-head">
            <h3><span class="hico">✨</span> Insights & Anomalies</h3>
            <span class="badge">${INSIGHTS.length}</span>
          </div>
          <div class="analytics-insight-stack"></div>
        </div>
      `);
      const istack = insightCard.querySelector('.analytics-insight-stack');
      INSIGHTS.forEach(a => {
        const node = H.el(`
          <div class="attn ${a.sev} analytics-insight">
            <span class="a-ico">${a.ico}</span>
            <div class="a-body">
              <div class="a-title">${a.title}</div>
              <div class="a-sub">${a.sub}</div>
            </div>
            <span class="tag ${a.sev === 'bad' ? 'bad' : a.sev === 'warn' ? 'warn' : 'info'}">${a.tag}</span>
          </div>
        `);
        node.addEventListener('click', () => H.toast(a.title, a.sev === 'bad' ? 'danger' : a.sev === 'warn' ? 'warn' : 'info'));
        istack.appendChild(node);
      });
      lower.appendChild(insightCard);
      root.appendChild(lower);

      /* ── wire header actions (no global keys; shell owns ⌘K) ───────────── */
      root.querySelector('[data-act="explore"]').addEventListener('click', () => H.openCmdk());
      root.querySelector('[data-act="export"]').addEventListener('click', () => H.toast('Exporting analytics snapshot → CSV…', 'success'));
      root.querySelector('[data-act="range"]').addEventListener('click', () => H.toast('Date range: pick a window in Explore (⌘K)', 'info'));

      // count-ups inside the KPI grid + conversion pills are auto-run by the
      // shell after render(); the hero headline is count-driven manually on swap.
    }
  });
})();
