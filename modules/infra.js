/* ============================================================================
   infra.js — Infra (the ops console).
   Server & computer status: a node fleet with CPU/MEM/DISK + uptime, a live
   metrics waveform, deploys, incidents and a public-style status page.
   Follows the HELM module contract (see command.js):
     1) HELM.register({ id, label, icon, scope, render })
     2) render(root) builds DOM with ONLY documented .classes + HELM.charts
     3) no fonts/colors/global styles; never touch another module's DOM
     4) every on-screen number goes through HELM.fmt or [data-count]
     5) data-changing buttons are role-gated (HELM.session.can) + audited.
   ========================================================================== */
(function () {
  const H = window.HELM;

  H.register({
    id: 'infra',
    label: 'Infra',
    icon: '🖥️',
    scope: 'company',
    render(root) {
      const D = H.data;
      const S = H.session;
      const me = S.user;

      /* ── deterministic fleet ─────────────────────────────────────────────
         Each node carries provider/region, a status, live-ish CPU/MEM/DISK
         and an uptime %. db-primary is intentionally 'degraded' for texture.
         Metrics series are seeded → identical every cold open. ───────────── */
      const NODES = [
        { id: 'web-1',     role: 'Web', kind: 'server', provider: 'Hetzner',  region: 'fsn1 · Falkenstein', status: 'up',       cpu: 38, mem: 54, disk: 41, up: 99.98, rps: D.series('inf-web1', 40, 180, 420, 0.18) },
        { id: 'web-2',     role: 'Web', kind: 'server', provider: 'Hetzner',  region: 'fsn1 · Falkenstein', status: 'up',       cpu: 44, mem: 58, disk: 39, up: 99.97, rps: D.series('inf-web2', 40, 160, 400, 0.2) },
        { id: 'api-1',     role: 'API', kind: 'server', provider: 'Hetzner',  region: 'hel1 · Helsinki',    status: 'up',       cpu: 51, mem: 63, disk: 47, up: 99.95, rps: D.series('inf-api1', 40, 120, 360, 0.22) },
        { id: 'db-primary',role: 'Database', kind: 'server', provider: 'AWS', region: 'eu-north-1 · Sthlm',  status: 'degraded', cpu: 83, mem: 91, disk: 78, up: 99.71, rps: D.series('inf-db', 40, 60, 200, 0.16) },
        { id: 'worker-1',  role: 'Worker', kind: 'server', provider: 'Hetzner', region: 'hel1 · Helsinki',  status: 'up',       cpu: 29, mem: 47, disk: 33, up: 99.99, rps: D.series('inf-wk1', 40, 20, 140, 0.3) },
        { id: 'mac-studio',role: 'Build / CI', kind: 'workstation', provider: 'Office', region: 'Norrköping HQ', status: 'up',  cpu: 22, mem: 61, disk: 64, up: 99.40, rps: D.series('inf-mac', 40, 5, 60, 0.4) },
        { id: 'noah-dev',  role: "Noah's Linux", kind: 'workstation', provider: 'Office', region: 'Norrköping HQ', status: 'up', cpu: 17, mem: 38, disk: 52, up: 98.80, rps: D.series('inf-noah', 40, 2, 40, 0.45) }
      ];

      const STATUS = {
        up:       { key: 'ok',   label: 'Operational', dot: 'up' },
        degraded: { key: 'warn', label: 'Degraded',    dot: 'degraded' },
        down:     { key: 'bad',  label: 'Down',        dot: 'down' }
      };
      const sevOfMetric = (v) => v >= 85 ? 'bad' : v >= 70 ? 'warn' : '';

      /* ── roll-ups ────────────────────────────────────────────────────── */
      const servers = NODES.filter(n => n.kind === 'server');
      const nodesUp = NODES.filter(n => n.status === 'up').length;
      const degraded = NODES.filter(n => n.status === 'degraded');
      const anyTrouble = NODES.some(n => n.status !== 'up');
      const worst = NODES.some(n => n.status === 'down') ? 'down' : anyTrouble ? 'degraded' : 'up';
      const avgCpu = Math.round(NODES.reduce((a, n) => a + n.cpu, 0) / NODES.length);
      const avgLatency = 86;            // ms, p95 across web+api
      const incidents30d = 2;

      /* ── live metrics waveform (requests/sec, animated subtly) ───────────
         Sum the per-node rps series into a fleet total, 40 samples. We mutate
         the SVG path in place every ~1.8s so it breathes without re-rendering. */
      const N = 40;
      const fleetRps = [];
      for (let i = 0; i < N; i++) fleetRps.push(NODES.reduce((a, n) => a + (n.rps[i] || 0), 0));
      const fleetP95 = fleetRps.map((v, i) => Math.round(v * (0.34 + 0.10 * ((i % 7) / 7)))); // a 2nd "p95 latency proxy" line

      /* ── deploys (newest first) ──────────────────────────────────────── */
      const deploys = [
        { env: 'production', service: 'helm-web',  version: 'v1.8.2', by: 'u-noah',  status: 'live',     ago: '2h ago',  dur: '3m 12s' },
        { env: 'production', service: 'helm-api',  version: 'v2.4.0', by: 'u-noah',  status: 'live',     ago: '6h ago',  dur: '4m 41s' },
        { env: 'staging',    service: 'helm-web',  version: 'v1.8.3', by: 'u-mira',  status: 'live',     ago: '1d ago',  dur: '2m 58s' },
        { env: 'production', service: 'worker',    version: 'v0.9.7', by: 'u-noah',  status: 'rollback', ago: '2d ago',  dur: '5m 03s' },
        { env: 'production', service: 'helm-web',  version: 'v1.8.1', by: 'u-noah',  status: 'live',     ago: '3d ago',  dur: '3m 30s' }
      ];

      /* ── incidents ───────────────────────────────────────────────────── */
      const incidents = [
        { id: 'INC-204', sev: 'major', title: 'db-primary elevated CPU & replication lag', summary: 'Replica fell behind ~40s; failover armed, queries throttled.', state: 'open', opened: 'Today 13:42', resolved: null, owner: 'u-noah' },
        { id: 'INC-203', sev: 'minor', title: 'Elevated 5xx on helm-api after deploy', summary: 'v2.4.0 bumped error rate to 1.8%; mitigated by config rollback.', state: 'resolved', opened: 'Jun 12 09:10', resolved: 'Jun 12 09:48', owner: 'u-noah' },
        { id: 'INC-201', sev: 'minor', title: 'PostNord webhook timeouts', summary: 'Upstream slowness queued ~30 order events; auto-retried clean.', state: 'resolved', opened: 'Jun 09 16:20', resolved: 'Jun 09 16:35', owner: 'u-lena' }
      ];
      const SEV = { major: 'bad', minor: 'warn', critical: 'bad' };

      /* ── status-page components (public-style) ───────────────────────── */
      const components = [
        { name: 'Website & App', status: 'up' },
        { name: 'API', status: 'up' },
        { name: 'Database', status: 'degraded' },
        { name: 'Background jobs', status: 'up' },
        { name: 'Webhooks & integrations', status: 'up' }
      ];

      const personName = (uid) => { const p = (S.team || []).find(t => t.id === uid); return p ? p.name : uid; };
      const canDeploy = S.can('deploy.run');
      const gate = (btn) => canDeploy ? btn : btn.replace('<button ', '<button disabled title="Needs admin role" ');

      /* ─────────────────────────────────────────────────────────────────────
         VIEW HEAD
         ───────────────────────────────────────────────────────────────────── */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">🖥️</div>
            <div>
              <h1>Infra</h1>
              <p>Servers and computers — uptime, live metrics, deploys and incidents.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="status">◇ Status page</button>
            ${gate('<button class="btn btn-primary btn-sm" data-act="deploy">▲ Deploy</button>')}
          </div>
        </div>
      `));

      /* ─────────────────────────────────────────────────────────────────────
         HEADLINE STATUS BANNER
         ───────────────────────────────────────────────────────────────────── */
      const bannerSev = STATUS[worst].key;
      const bannerTitle = worst === 'up'
        ? 'All systems operational'
        : worst === 'degraded'
          ? 'Partial degradation — investigating'
          : 'Major outage in progress';
      const openInc = incidents.filter(i => i.state === 'open').length;
      const bannerSub = worst === 'up'
        ? `${NODES.length} nodes reporting · ${nodesUp} up · last check just now`
        : `${degraded.length} node${degraded.length === 1 ? '' : 's'} degraded · ${nodesUp}/${NODES.length} fully up · ${openInc} open incident${openInc === 1 ? '' : 's'}`;
      const banner = H.el(`
        <div class="infra-banner ${bannerSev}" style="margin-bottom:var(--gap)">
          <span class="infra-banner-led"></span>
          <div class="infra-banner-body">
            <div class="infra-banner-title">${bannerTitle}</div>
            <div class="infra-banner-sub">${bannerSub}</div>
          </div>
          <div class="infra-banner-meta">
            <span class="pill ${bannerSev}">${STATUS[worst].label}</span>
            <button class="btn btn-sm" data-act="refresh">↻ Re-check</button>
          </div>
        </div>
      `);
      root.appendChild(banner);

      /* ─────────────────────────────────────────────────────────────────────
         KPI ROW — Nodes up · Avg CPU · Avg latency · Incidents 30d
         ───────────────────────────────────────────────────────────────────── */
      const kpis = [
        { label: 'NODES UP', count: nodesUp, fmt: 'num', suffix: ' / ' + NODES.length, sub: 'fleet reporting', trend: 'STEADY', dir: 'flat', spark: D.series('inf-k-up', 14, NODES.length, nodesUp, 0.04) },
        { label: 'AVG CPU', count: avgCpu, fmt: 'num', suffix: '%', sub: 'across all nodes', trend: '+6 pts', dir: 'down', spark: D.series('inf-k-cpu', 14, 38, avgCpu, 0.12) },
        { label: 'AVG LATENCY', count: avgLatency, fmt: 'num', suffix: ' ms', sub: 'p95 · web + api', trend: '−12 ms', dir: 'up', spark: D.series('inf-k-lat', 14, 110, avgLatency, 0.14) },
        { label: 'INCIDENTS · 30D', count: incidents30d, fmt: 'num', sub: '1 open right now', trend: '−1 MoM', dir: 'up', spark: D.series('inf-k-inc', 14, 4, incidents30d, 0.2) }
      ];
      const kpiRow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
      kpis.forEach(k => {
        kpiRow.appendChild(H.el(`
          <div class="card infra-kpi kpi">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-value" data-count="${k.count}" data-fmt="${k.fmt}"${k.suffix ? ` data-suffix="${k.suffix}"` : ''}>0</div>
            <div class="row between mt-sm">
              <span class="kpi-sub">${k.sub}</span>
              <span class="kpi-trend ${k.dir}">${k.trend}</span>
            </div>
            <div class="spark">${H.charts.spark(k.spark)}</div>
          </div>
        `));
      });
      root.appendChild(kpiRow);

      /* ─────────────────────────────────────────────────────────────────────
         LIVE METRICS WAVEFORM (span 2) + STATUS PAGE (1)
         ───────────────────────────────────────────────────────────────────── */
      const liveRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      const waveCard = H.el(`
        <div class="card span-2 infra-wave-card">
          <div class="card-head">
            <h3><span class="hico">📈</span> Live Metrics</h3>
            <span class="ch-meta infra-live-meta"><span class="infra-live-dot"></span>REQUESTS / SEC · FLEET</span>
          </div>
          <div class="infra-wave-legend">
            <span class="infra-wl rps"><i></i>REQUESTS/SEC</span>
            <span class="infra-wl p95"><i></i>P95 PROXY</span>
            <span class="infra-wl-now">NOW <b class="infra-rps-now">${H.fmt.num(fleetRps[N - 1])}</b> req/s</span>
          </div>
          <div class="chart infra-wave" style="height:220px">
            ${H.charts.area(fleetRps, { height: 220, v2: fleetP95, labels: ['−40s', '−30s', '−20s', '−10s', 'NOW'] })}
          </div>
        </div>
      `);
      liveRow.appendChild(waveCard);

      // public-style status page
      const upComponents = components.filter(c => c.status === 'up').length;
      const statusCard = H.el(`
        <div class="card infra-statuspage">
          <div class="card-head">
            <h3><span class="hico">🌐</span> Status Page</h3>
            <span class="ch-meta">PUBLIC</span>
          </div>
          <div class="infra-sp-banner ${STATUS[worst].key}">
            <span class="infra-sp-led"></span>
            ${worst === 'up' ? 'All services operational' : 'Some services degraded'}
          </div>
          <div class="infra-sp-list"></div>
          <div class="infra-sp-foot">
            <span class="faint mono">${upComponents}/${components.length} components healthy</span>
            <button class="btn btn-sm btn-ghost" data-act="subscribe">Subscribe</button>
          </div>
        </div>
      `);
      const spList = statusCard.querySelector('.infra-sp-list');
      components.forEach(c => {
        const st = STATUS[c.status];
        spList.appendChild(H.el(`
          <div class="infra-sp-row">
            <span class="infra-status-dot ${st.dot}"></span>
            <span class="infra-sp-name">${c.name}</span>
            <span class="tag ${st.key}">${st.label}</span>
          </div>
        `));
      });
      liveRow.appendChild(statusCard);
      root.appendChild(liveRow);

      /* ─────────────────────────────────────────────────────────────────────
         FLEET GRID — every node with status pill, provider/region, gauges
         ───────────────────────────────────────────────────────────────────── */
      root.appendChild(H.el(`<div class="section-title">Fleet · ${servers.length} servers · ${NODES.length - servers.length} workstations</div>`));
      const fleetGrid = H.el(`<div class="grid cols-3 infra-fleet" style="margin-bottom:var(--gap)"></div>`);
      NODES.forEach(n => {
        const st = STATUS[n.status];
        const metrics = [['CPU', n.cpu], ['MEM', n.mem], ['DISK', n.disk]];
        const node = H.el(`
          <div class="card infra-node ${st.key}" data-node="${n.id}">
            <div class="infra-node-head">
              <div class="infra-node-id">
                <span class="infra-status-dot ${st.dot}"></span>
                <span class="infra-node-name mono">${n.id}</span>
              </div>
              <span class="pill ${st.key}">${st.label}</span>
            </div>
            <div class="infra-node-meta">
              <span class="infra-node-role">${n.role}</span>
              <span class="faint">·</span>
              <span class="faint mono">${n.kind === 'workstation' ? '💻' : '☁️'} ${n.provider}</span>
            </div>
            <div class="infra-node-region faint mono">${n.region}</div>
            <div class="infra-node-bars"></div>
            <div class="infra-node-foot">
              <span class="infra-uptime mono">${n.up.toFixed(2)}% <span class="faint">uptime</span></span>
              <button class="btn btn-sm btn-ghost" data-restart="${n.id}">Restart</button>
            </div>
          </div>
        `);
        const bars = node.querySelector('.infra-node-bars');
        metrics.forEach(([label, val]) => {
          const sev = sevOfMetric(val);
          const row = H.el(`
            <div class="infra-bar-row">
              <span class="infra-bar-label">${label}</span>
              <div class="progress"><div class="bar ${sev}" style="width:0"></div></div>
              <span class="infra-bar-val mono ${sev === 'bad' ? 'infra-val-bad' : sev === 'warn' ? 'infra-val-warn' : ''}">${val}%</span>
            </div>
          `);
          bars.appendChild(row);
          const fill = row.querySelector('.bar');
          setTimeout(() => { fill.style.width = val + '%'; }, 260);
        });
        // restart is a data-changing action → gate + audit
        const rbtn = node.querySelector('[data-restart]');
        if (!canDeploy) { rbtn.disabled = true; rbtn.title = 'Needs admin role'; }
        rbtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!canDeploy) return;
          H.audit.log({
            action: 'node.restarted', entityType: 'Node', entityId: n.id,
            summary: `${me.name} restarted node ${n.id} (${n.role})`,
            links: [{ entityType: 'Node', entityId: n.id }], module: 'infra'
          });
          H.toast(`Restart signal sent to ${n.id}…`, 'warn');
        });
        node.addEventListener('click', () => H.toast(`${n.id} · ${n.role} · ${n.provider} · CPU ${n.cpu}% · MEM ${n.mem}% · DISK ${n.disk}% · ${n.up.toFixed(2)}% uptime`, 'info'));
        fleetGrid.appendChild(node);
      });
      root.appendChild(fleetGrid);

      /* ─────────────────────────────────────────────────────────────────────
         DEPLOYS (span 2) + INCIDENTS (1)
         ───────────────────────────────────────────────────────────────────── */
      const bottomRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // deploys list
      const deployCard = H.el(`
        <div class="card span-2 infra-deploys">
          <div class="card-head">
            <h3><span class="hico">🚀</span> Recent Deploys</h3>
            <span class="ch-meta">LAST 5 · CI/CD</span>
          </div>
          <div class="infra-deploy-scroll">
            <table class="table infra-deploy-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Env</th>
                  <th>Version</th>
                  <th>By</th>
                  <th class="num">Duration</th>
                  <th>State</th>
                  <th class="num">When</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `);
      const dtbody = deployCard.querySelector('tbody');
      deploys.forEach(d => {
        const envSev = d.env === 'production' ? 'bad' : d.env === 'staging' ? 'warn' : 'info';
        const stSev = d.status === 'live' ? 'ok' : d.status === 'rollback' ? 'warn' : 'bad';
        const stLabel = d.status === 'live' ? 'Live' : d.status === 'rollback' ? 'Rolled back' : 'Failed';
        dtbody.appendChild(H.el(`
          <tr>
            <td class="mono">${d.service}</td>
            <td><span class="tag ${envSev}">${d.env}</span></td>
            <td class="mono">${d.version}</td>
            <td><span class="infra-by"><span class="avatar sq infra-mini-av">${D.initials(personName(d.by))}</span>${personName(d.by).split(' ')[0]}</span></td>
            <td class="num faint mono">${d.dur}</td>
            <td><span class="pill ${stSev}">${stLabel}</span></td>
            <td class="num faint mono">${d.ago}</td>
          </tr>
        `));
      });
      bottomRow.appendChild(deployCard);

      // incidents list
      const openCount = incidents.filter(i => i.state === 'open').length;
      const incCard = H.el(`
        <div class="card infra-incidents">
          <div class="card-head">
            <h3><span class="hico">🚨</span> Incidents</h3>
            <span class="badge ${openCount ? 'bad' : ''}">${openCount} open</span>
          </div>
          <div class="list infra-inc-list"></div>
        </div>
      `);
      const incList = incCard.querySelector('.infra-inc-list');
      incidents.forEach(inc => {
        const sev = SEV[inc.sev] || 'warn';
        const open = inc.state === 'open';
        const node = H.el(`
          <div class="infra-inc" data-inc="${inc.id}">
            <div class="infra-inc-top">
              <span class="tag ${sev}">${inc.sev}</span>
              <span class="infra-inc-id mono faint">${inc.id}</span>
              <span class="pill ${open ? 'warn' : 'ok'} infra-inc-state">${open ? 'Open' : 'Resolved'}</span>
            </div>
            <div class="infra-inc-title">${inc.title}</div>
            <div class="infra-inc-sub">${inc.summary}</div>
            <div class="infra-inc-foot mono faint">
              <span>▲ ${inc.opened}</span>
              <span>${open ? '⏱ ongoing' : '✓ ' + inc.resolved}</span>
              <span>${D.initials(personName(inc.owner))}</span>
            </div>
          </div>
        `);
        node.addEventListener('click', () => H.toast(`${inc.id} · ${inc.title} · owner ${personName(inc.owner)}`, open ? 'warn' : 'info'));
        incList.appendChild(node);
      });
      bottomRow.appendChild(incCard);
      root.appendChild(bottomRow);

      /* ─────────────────────────────────────────────────────────────────────
         WIRE ACTIONS — every button reaches H.toast / H.audit / local state
         ───────────────────────────────────────────────────────────────────── */
      const deployBtn = root.querySelector('[data-act="deploy"]');
      if (deployBtn) deployBtn.addEventListener('click', () => {
        if (!canDeploy) { H.toast('Needs admin role to deploy', 'warn'); return; }
        H.audit.log({
          action: 'deploy.run', entityType: 'Deploy', entityId: 'dp-' + Date.now().toString(36),
          summary: `${me.name} triggered a production deploy of helm-web`,
          links: [{ entityType: 'Deploy', entityId: 'helm-web' }], module: 'infra'
        });
        H.toast('Deploy pipeline started — helm-web → production', 'success');
      });
      root.querySelector('[data-act="status"]').addEventListener('click', () => H.toast('Opening public status page…', 'info'));
      root.querySelector('[data-act="subscribe"]').addEventListener('click', () => H.toast('Subscribed to status updates', 'success'));
      root.querySelector('[data-act="refresh"]').addEventListener('click', () => {
        banner.classList.add('infra-rechecking');
        H.toast('Re-checking all nodes…', 'info');
        setTimeout(() => banner.classList.remove('infra-rechecking'), 900);
      });

      /* ─────────────────────────────────────────────────────────────────────
         SUBTLE LIVE ANIMATION — gently re-shape the waveform area+line in place
         every ~1.8s. We re-run the chart helper into a fresh string and swap
         the inner SVG, nudging the "NOW" readout. Pauses when tab is hidden;
         self-cleans when the view's DOM is replaced (node detached). ───────── */
      const waveBox = waveCard.querySelector('.infra-wave');
      const nowReadout = waveCard.querySelector('.infra-rps-now');
      let phase = 0;
      const timer = setInterval(() => {
        if (document.hidden) return;
        if (!waveBox.isConnected) { clearInterval(timer); return; }
        phase++;
        // roll the window: drop the oldest sample, append a gently varied new one.
        const last = fleetRps[fleetRps.length - 1];
        const drift = Math.sin(phase / 2.3) * 60 + Math.sin(phase / 1.1) * 22;
        const next = Math.max(40, Math.round(last + drift));
        fleetRps.push(next); fleetRps.shift();
        const p95next = fleetP95.slice(1).concat(Math.round(next * 0.4));
        for (let i = 0; i < fleetP95.length; i++) fleetP95[i] = p95next[i];
        waveBox.innerHTML = H.charts.area(fleetRps, { height: 220, v2: fleetP95, labels: ['−40s', '−30s', '−20s', '−10s', 'NOW'] });
        if (nowReadout) nowReadout.textContent = H.fmt.num(next);
      }, 1800);

      // count-ups run automatically by the shell after render().
    }
  });
})();
