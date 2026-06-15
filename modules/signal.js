/* ============================================================================
   signal.js — Signal: Marketing & growth.
   Channels, funnels, ROAS. Built on the HELM module contract (see command.js).
     1) HELM.register({id,label,icon,render})
     2) render(root) builds DOM with ONLY documented classes + HELM.charts
     3) deterministic data only (HELM.data) — no Math.random / no Date at eval
     4) every button wired to H.toast / H.show; never touch other modules
   ========================================================================== */
(function () {
  const H = window.HELM;

  H.register({
    id: 'signal',
    label: 'Signal',
    icon: '📡',
    render(root) {
      const D = H.data;

      /* ── deterministic data ─────────────────────────────────────────── */
      // sessions / traffic over 24 months (area, two series)
      const sessions = D.series('sig-sessions', 24, 18400, 41200, 0.13);
      const lastYear = D.series('sig-sessions-ly', 24, 14200, 28800, 0.12);

      // channels — ROAS by channel (bars)
      const channels = [
        { name: 'Google', roas: 4.6, spend: 86000, color: 'var(--accent1)' },
        { name: 'Meta', roas: 3.8, spend: 64000, color: 'var(--accent2)' },
        { name: 'TikTok', roas: 2.4, spend: 38000, color: 'var(--accent3)' },
        { name: 'Email', roas: 6.9, spend: 9000, color: 'var(--success)' },
        { name: 'Organic', roas: 9.2, spend: 4000, color: 'var(--warn)' }
      ];

      // acquisition funnel
      const funnel = [
        { label: 'Visitors', value: 184200, ico: '🌐' },
        { label: 'Signups', value: 41800, ico: '✍️' },
        { label: 'Trials', value: 12400, ico: '🚀' },
        { label: 'Paid', value: 3160, ico: '💳' }
      ];

      // campaigns table
      const campaigns = [
        { name: 'Vinterkampanj — Nordic', ch: 'Google', chCls: 'info', spend: 28400, conv: 612, roas: 5.1, status: 'live' },
        { name: 'Retarget · Cart Abandon', ch: 'Meta', chCls: 'info', spend: 14200, conv: 388, roas: 4.4, status: 'live' },
        { name: 'Creator Drop · Lykke', ch: 'TikTok', chCls: '', spend: 19800, conv: 244, roas: 2.1, status: 'review' },
        { name: 'Spring Newsletter v3', ch: 'Email', chCls: 'ok', spend: 2100, conv: 196, roas: 7.8, status: 'live' },
        { name: 'Brand Search — EU', ch: 'Google', chCls: 'info', spend: 9600, conv: 318, roas: 6.2, status: 'live' },
        { name: 'Lookalike · Forsberg', ch: 'Meta', chCls: 'info', spend: 11400, conv: 142, roas: 1.7, status: 'paused' }
      ];

      // top content
      const content = [
        { ico: '📝', title: 'How Northwind AB cut CAC 38%', sub: 'Blog · organic', views: 24800, ctr: 6.4 },
        { ico: '🎥', title: 'Product tour — 90 seconds', sub: 'YouTube · paid', views: 18200, ctr: 5.1 },
        { ico: '📰', title: 'State of Nordic SaaS 2026', sub: 'Report · gated', views: 12600, ctr: 9.2 },
        { ico: '🎙️', title: 'Founder pod w/ Forsberg Konsult', sub: 'Podcast · organic', views: 8400, ctr: 4.3 }
      ];

      /* ── view head ──────────────────────────────────────────────────── */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">📡</div>
            <div>
              <h1>Signal</h1>
              <p>Marketing &amp; growth — where the demand comes from, and what it costs.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="report">◇ Growth report</button>
            <button class="btn btn-primary btn-sm" data-act="launch">＋ New campaign</button>
          </div>
        </div>
      `));

      /* ── KPI ROW: ROAS · CAC · LTV · LTV:CAC ────────────────────────── */
      const kpis = [
        { label: 'BLENDED ROAS', count: 3.4, fmt: '', suffix: '×', dp: 1, trend: '+0.6×', dir: 'up', spark: D.series('k-roas', 14, 2.6, 3.4, 0.16) },
        { label: 'CAC', count: 412, fmt: 'money', trend: '9.2% lower', dir: 'up', spark: D.series('k-cac', 14, 520, 412, 0.10) },
        { label: 'LTV', count: 2240, fmt: 'money', trend: '+11.4%', dir: 'up', spark: D.series('k-ltv', 14, 1740, 2240, 0.08) },
        { label: 'LTV : CAC', count: 5.4, fmt: '', suffix: '×', dp: 1, trend: 'HEALTHY', dir: 'flat', spark: D.series('k-ratio', 14, 3.3, 5.4, 0.10) }
      ];
      const krow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
      kpis.forEach(k => {
        krow.appendChild(H.el(`
          <div class="card signal-kpi kpi">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-value" data-count="${k.count}" ${k.fmt ? `data-fmt="${k.fmt}"` : ''} ${k.suffix ? `data-suffix="${k.suffix}"` : ''} ${k.dp ? `data-dp="${k.dp}"` : ''}>0</div>
            <div class="row between mt-sm">
              <span class="kpi-trend ${k.dir}">${k.trend}</span>
            </div>
            <div class="spark">${H.charts.spark(k.spark)}</div>
          </div>
        `));
      });
      root.appendChild(krow);

      /* ── ROW: sessions AREA (span 2) + channel ROAS bars ────────────── */
      const row1 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      row1.appendChild(H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">📈</span> Sessions &amp; Traffic</h3>
            <span class="ch-meta">THIS YEAR × LAST · 24M</span>
          </div>
          <div class="signal-legend">
            <span class="sl now"><i></i>THIS YEAR</span>
            <span class="sl prev"><i></i>LAST YEAR</span>
          </div>
          <div class="chart" style="height:210px">
            ${H.charts.area(sessions, { height: 210, v2: lastYear, labels: ['JAN', 'JUN', 'DEC', 'JUN', 'DEC'] })}
          </div>
        </div>
      `));

      const chanCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">📡</span> ROAS by Channel</h3>
            <span class="ch-meta">RETURN ON AD SPEND</span>
          </div>
          <div class="chart" style="height:166px">
            ${H.charts.bars(channels.map(c => ({ label: c.name, value: c.roas, color: c.color })), { height: 166 })}
          </div>
          <div class="signal-chanlist mt-sm"></div>
        </div>
      `);
      const chanList = chanCard.querySelector('.signal-chanlist');
      channels.forEach(c => {
        chanList.appendChild(H.el(`
          <div class="signal-chan">
            <span class="sc-dot" style="background:${c.color};box-shadow:0 0 7px ${c.color}"></span>
            <span class="sc-name">${c.name}</span>
            <span class="sc-spend mono faint">${H.fmt.money(c.spend)}</span>
            <span class="sc-roas mono">${c.roas.toFixed(1)}×</span>
          </div>
        `));
      });
      row1.appendChild(chanCard);
      root.appendChild(row1);

      /* ── ROW: acquisition funnel (span 2) + email/social stat rows ──── */
      const row2 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      const funnelCard = H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">🛬</span> Acquisition Funnel</h3>
            <span class="ch-meta">VISITORS → PAID · 30D</span>
          </div>
          <div class="signal-funnel"></div>
        </div>
      `);
      const funWrap = funnelCard.querySelector('.signal-funnel');
      const top = funnel[0].value;
      funnel.forEach((f, i) => {
        const pct = (f.value / top) * 100;
        const fromPrev = i === 0 ? 100 : (f.value / funnel[i - 1].value) * 100;
        const node = H.el(`
          <div class="signal-fstep">
            <div class="fs-head">
              <span class="fs-ico">${f.ico}</span>
              <span class="fs-label">${f.label}</span>
              <span class="fs-val mono">${H.fmt.num(f.value)}</span>
              <span class="fs-rate mono ${i === 0 ? 'faint' : ''}">${i === 0 ? 'TOP' : fromPrev.toFixed(1) + '%'}</span>
            </div>
            <div class="fs-track"><div class="fs-fill" style="width:0"></div></div>
          </div>
        `);
        funWrap.appendChild(node);
        const fill = node.querySelector('.fs-fill');
        setTimeout(() => { fill.style.width = Math.max(6, pct) + '%'; }, 200 + i * 90);
      });
      row2.appendChild(funnelCard);

      // email + social stat rows
      const stats = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">✉️</span> Email &amp; Social</h3>
            <span class="ch-meta">LAST 30 DAYS</span>
          </div>
          <div class="signal-stats"></div>
        </div>
      `);
      const statWrap = stats.querySelector('.signal-stats');
      [
        ['Email open rate', '42.6%', 'ok'],
        ['Email CTR', '6.1%', 'ok'],
        ['List size', '18,420', ''],
        ['Followers · LinkedIn', '24.1K', 'info'],
        ['Followers · Instagram', '11.8K', 'info'],
        ['Avg. engagement', '4.3%', 'warn']
      ].forEach(([label, val, cls]) => {
        statWrap.appendChild(H.el(`
          <div class="stat-row">
            <span class="sr-label">${label}</span>
            <span class="sr-val ${cls ? 'signal-tone-' + cls : ''}">${val}</span>
          </div>
        `));
      });
      row2.appendChild(stats);
      root.appendChild(row2);

      /* ── ROW: campaigns TABLE (span 2) + top content list ───────────── */
      const row3 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      const liveCount = campaigns.filter(c => c.status === 'live').length;
      const campCard = H.el(`
        <div class="card span-2 flush signal-camp">
          <div class="card-head" style="padding:16px 16px 0">
            <h3><span class="hico">🎯</span> Active Campaigns</h3>
            <span class="ch-meta">${liveCount} LIVE · ${campaigns.length} TOTAL</span>
          </div>
          <div class="signal-tablewrap">
            <table class="table" style="margin-top:8px">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Channel</th>
                  <th class="num">Spend</th>
                  <th class="num">Conv.</th>
                  <th class="num">ROAS</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody></tbody>
              <tfoot></tfoot>
            </table>
          </div>
        </div>
      `);
      const tbody = campCard.querySelector('tbody');
      const statusMap = { live: ['ok', 'LIVE'], review: ['warn', 'REVIEW'], paused: ['', 'PAUSED'] };
      campaigns.forEach(c => {
        const [scls, slabel] = statusMap[c.status];
        const roasCls = c.roas >= 4 ? 'signal-tone-ok' : c.roas >= 2.5 ? '' : 'signal-tone-bad';
        const tr = H.el(`
          <tr>
            <td>${c.name}</td>
            <td><span class="tag ${c.chCls}">${c.ch}</span></td>
            <td class="num mono">${H.fmt.money(c.spend)}</td>
            <td class="num mono">${H.fmt.num(c.conv)}</td>
            <td class="num mono ${roasCls}">${c.roas.toFixed(1)}×</td>
            <td><span class="pill ${scls}">${slabel}</span></td>
          </tr>
        `);
        tr.addEventListener('click', () => H.toast('Opening campaign — ' + c.name, 'info'));
        tbody.appendChild(tr);
      });
      // live-computed footer totals (keeps the column math coherent)
      const totSpend = campaigns.reduce((a, c) => a + c.spend, 0);
      const totConv = campaigns.reduce((a, c) => a + c.conv, 0);
      const totRev = campaigns.reduce((a, c) => a + c.spend * c.roas, 0);
      const blended = totRev / totSpend;
      campCard.querySelector('tfoot').appendChild(H.el(`
        <tr class="signal-camp-total">
          <td>Paid total</td>
          <td><span class="faint mono">${campaigns.length} CAMP</span></td>
          <td class="num mono">${H.fmt.money(totSpend)}</td>
          <td class="num mono">${H.fmt.num(totConv)}</td>
          <td class="num mono signal-tone-ok">${blended.toFixed(1)}×</td>
          <td></td>
        </tr>
      `));
      row3.appendChild(campCard);

      const contentCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🏆</span> Top Content</h3>
            <span class="ch-meta">BY REACH</span>
          </div>
          <div class="list"></div>
        </div>
      `);
      const contentList = contentCard.querySelector('.list');
      content.forEach(c => {
        contentList.appendChild(H.el(`
          <div class="list-item">
            <div class="li-ico">${c.ico}</div>
            <div class="li-body">
              <div class="li-title">${c.title}</div>
              <div class="li-sub">${c.sub} · ${c.ctr.toFixed(1)}% CTR</div>
            </div>
            <span class="li-meta">${H.fmt.num(c.views)}</span>
          </div>
        `));
      });
      row3.appendChild(contentCard);
      root.appendChild(row3);

      /* ── wire actions (shell owns ⌘K; only local toasts/nav) ────────── */
      root.querySelector('[data-act="report"]').addEventListener('click', () => H.toast('Compiling growth report…', 'info'));
      root.querySelector('[data-act="launch"]').addEventListener('click', () => H.toast('New campaign draft created', 'success'));

      // count-ups run automatically by the shell after render().
    }
  });
})();
