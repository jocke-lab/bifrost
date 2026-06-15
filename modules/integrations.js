/* ============================================================================
   integrations.js — the Integrations Hub. Connect everything.
   THE in-app place to wire up the real company. Sweden-first.
   THE ACTIONABLE TWIN of the wiring guide — every row connects/disconnects
   for real (against local state) and writes to the audit log.
   Follows the HELM module contract (see command.js):
     1) HELM.register({id,label,icon,render})
     2) build DOM with H.el(...) using ONLY documented .classes + namespaced
        .integrations-* tweaks (integrations.css) + HELM.charts
     3) never inject fonts/colors/global styles; never touch other modules
     4) every on-screen number goes through HELM.fmt or [data-count]
   Layout:
     view-head → KPI row (4) →
     PER-USER connections (reads HELM.session.user, re-renders on switch) →
     COMPANY connections grid →
     webhook-health TABLE + delivery chart →
     API-keys panel (mask/reveal/rotate) + finish-wiring checklist
   Identity: scope stays 'company' (lives under Platform), but the PER-USER
   section reads the ACTING user fresh and re-builds on helm:user switch.
   ========================================================================== */
(function () {
  const H = window.HELM;

  H.register({
    id: 'integrations',
    label: 'Integrations',
    icon: '🔌',
    render(root) {
      const D = H.data;
      const sess = H.session;

      /* ── PER-USER connectors — each teammate connects their OWN. The state
         lives on the Person record (user.connections {google,whoop,googleFit}).
         `key` maps the row to that field; `acct` is shown when connected. ──── */
      const PER_USER = [
        {
          id: 'google', key: 'google', name: 'Google Workspace', glyph: '📅',
          cat: 'GMAIL · CALENDAR', accent: 'a3',
          powers: 'Your Gmail, calendar & shared contacts feed My Day and Comms.'
        },
        {
          id: 'whoop', key: 'whoop', name: 'Whoop / Google Fit', glyph: '💓',
          cat: 'WEARABLE · HEALTH', accent: 'a1',
          powers: 'Recovery, sleep & strain power your personal Vitals.',
          alt: 'googleFit'
        }
      ];

      /* ── COMPANY connectors — one shared connection for the whole org.
         `link` routes a connected service to the module it powers. ────────── */
      const COMPANY = [
        {
          id: 'slack', name: 'Slack', glyph: '💬', cat: 'ALERTS · APPROVALS',
          powers: 'Route alerts & approvals to #ops and #finance.',
          connected: false, acct: 'Workspace not linked', sync: '—', accent: 'a2'
        },
        {
          id: 'github', name: 'GitHub / GitLab', glyph: '🐙', cat: 'DEV · WEBHOOKS',
          powers: 'Push & deploy events stream into the Dev Log.',
          connected: true, acct: 'northwind/helm-web', sync: '7m ago', accent: 'a3',
          link: 'devlog'
        },
        {
          id: 'monitor', name: 'Server Monitor', glyph: '🖥️', cat: 'UPTIME · INFRA',
          powers: 'Health checks & incidents land on the Infra board.',
          connected: true, acct: '4 hosts · EU-North', sync: '40s ago', accent: 'a1',
          link: 'infra'
        },
        {
          id: 'stripe', name: 'Stripe', glyph: '💳', cat: 'PAYMENTS',
          powers: 'Card payments, payouts & subscriptions.',
          connected: true, acct: 'acct_1Q · SEK', sync: '2m ago', accent: 'a3'
        },
        {
          id: 'fortnox', name: 'Fortnox', glyph: '📒', cat: 'BOOKKEEPING · SE',
          powers: 'Bookkeeping, VAT returns & SIE export.',
          connected: true, acct: '18 vouchers synced', sync: '11m ago', accent: 'a1'
        },
        {
          id: 'tink', name: 'Tink', glyph: '🏦', cat: 'BANK FEEDS · SE/EU',
          powers: 'Open-banking account & balance feeds.',
          connected: true, acct: '2 accounts · SEB, Swedbank', sync: '4m ago', accent: 'a2'
        },
        {
          id: 'scrive', name: 'Scrive', glyph: '✍️', cat: 'E-SIGN · SE',
          powers: 'Qualified e-signatures wired into the Vault.',
          connected: false, acct: 'Connect to sign documents', sync: '—', accent: 'a2',
          link: 'vault'
        },
        {
          id: 'recall', name: 'Recall.ai', glyph: '🎙️', cat: 'TRANSCRIPTION',
          powers: 'Meeting bots & transcripts feed the Meetings board.',
          connected: false, acct: 'Add bot token to enable', sync: '—', accent: 'a3',
          link: 'meetings'
        },
        {
          id: 'anthropic', name: 'Anthropic Claude', glyph: '🛰️', cat: 'AI COPILOT',
          powers: 'Copilot reasoning · claude-opus-4-8.',
          connected: false, acct: 'Add API key to arm copilot', sync: '—', accent: 'a1'
        }
      ];

      /* mutating company actions are gated to admins (company settings perm).
         canCompany is the render-time hint for the disabled attribute; click
         handlers call gateOk() so a mid-session user switch is honoured live
         (this module is company-scoped and does not re-render on switch). */
      const gateOk = () => sess.can('settings.company');
      const canCompany = gateOk();
      const gateTitle = canCompany ? '' : ' title="Needs admin role"';
      const gateDis = canCompany ? '' : ' disabled';

      /* ── webhook endpoints (deterministic delivery sparkline) ──────────── */
      const HOOKS = [
        { ep: '/hooks/stripe', svc: 'Stripe', glyph: '💳', events: 'payment_intent, payout', last: '12s ago', rate: 100, state: 'ok', deliv: D.series('hk-stripe', 16, 96, 100, 0.03) },
        { ep: '/hooks/fortnox', svc: 'Fortnox', glyph: '📒', events: 'voucher.created', last: '11m ago', rate: 100, state: 'ok', deliv: D.series('hk-fortnox', 16, 92, 100, 0.05) },
        { ep: '/hooks/tink', svc: 'Tink', glyph: '🏦', events: 'transaction, balance', last: '4m ago', rate: 99, state: 'ok', deliv: D.series('hk-tink', 16, 90, 99, 0.06) },
        { ep: '/hooks/github', svc: 'GitHub', glyph: '🐙', events: 'push, deployment', last: '7m ago', rate: 100, state: 'ok', deliv: D.series('hk-github', 16, 95, 100, 0.04) },
        { ep: '/hooks/monitor', svc: 'Monitor', glyph: '🖥️', events: 'incident, recovery', last: '40s ago', rate: 100, state: 'ok', deliv: D.series('hk-monitor', 16, 97, 100, 0.02) },
        { ep: '/hooks/google', svc: 'Google', glyph: '📅', events: 'calendar.push', last: '9m ago', rate: 94, state: 'warn', deliv: D.series('hk-google', 16, 88, 94, 0.10) }
      ];
      const avgHealth = Math.round(HOOKS.reduce((a, h) => a + h.rate, 0) / HOOKS.length);

      /* ── API keys (masked) ─────────────────────────────────────────────── */
      const KEYS = [
        { svc: 'Stripe', glyph: '💳', env: 'LIVE', tail: 'a91F', kind: 'sk_live', rotated: '34d ago', scope: 'charges, payouts', fresh: false },
        { svc: 'Fortnox', glyph: '📒', env: 'LIVE', tail: '7Kp2', kind: 'access_token', rotated: '6d ago', scope: 'bookkeeping, invoices', fresh: true },
        { svc: 'Tink', glyph: '🏦', env: 'LIVE', tail: 'd0Qe', kind: 'client_secret', rotated: '12d ago', scope: 'accounts, transactions', fresh: true },
        { svc: 'GitHub', glyph: '🐙', env: 'PAT', tail: 'Mc4x', kind: 'ghp_token', rotated: '58d ago', scope: 'repo, deployments', fresh: false },
        { svc: 'Anthropic', glyph: '🛰️', env: 'LIVE', tail: 'zN8r', kind: 'sk_ant', rotated: '3d ago', scope: 'messages, copilot', fresh: true }
      ];

      /* ════════════════════════════════════════════════════════════════════
         VIEW HEAD
         ════════════════════════════════════════════════════════════════════ */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">🔌</div>
            <div>
              <h1>Integrations</h1>
              <p>Connect everything — the actionable twin of the wiring guide. Sweden-first.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="guide">◇ Wiring guide</button>
            <button class="btn btn-primary btn-sm" data-act="browse">＋ Browse catalogue</button>
          </div>
        </div>
      `));

      /* KPI counts depend on company + the acting user's per-user state.
         These are computed once for the header; the per-user section keeps its
         own live count and re-renders on switch (header stays representative). */
      const companyConnected = COMPANY.filter(s => s.connected).length;
      const companyTotal = COMPANY.length;

      /* ════════════════════════════════════════════════════════════════════
         KPI ROW — Company connected / Webhook health / Live keys / Last sync
         ════════════════════════════════════════════════════════════════════ */
      const kpis = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
      [
        { label: 'COMPANY LINKED', count: companyConnected, fmt: 'num', sub: `of ${companyTotal} shared services`, trend: '+2 this wk', dir: 'up', spark: D.series('ig-conn', 14, 2, companyConnected, 0.12) },
        { label: 'WEBHOOK HEALTH', count: avgHealth, fmt: 'num', suffix: '%', sub: '6 live endpoints', trend: '1 degraded', dir: 'down', spark: D.series('ig-wh', 14, 95, avgHealth, 0.05) },
        { label: 'VAULTED KEYS', count: KEYS.length, fmt: 'num', sub: 'encrypted · EU region', trend: '2 rotate soon', dir: 'flat', spark: D.series('ig-keys', 14, 3, KEYS.length, 0.1) },
        { label: 'LAST SYNC', count: 1, fmt: 'num', suffix: 'm', sub: 'Monitor · just now', trend: 'all nominal', dir: 'up', spark: D.series('ig-sync', 14, 14, 1, 0.3) }
      ].forEach(k => {
        kpis.appendChild(H.el(`
          <div class="card kpi integrations-kpi">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-value" data-count="${k.count}" data-fmt="${k.fmt}"${k.suffix ? ` data-suffix="${k.suffix}"` : ''}>0</div>
            <div class="kpi-sub">${k.sub}</div>
            <div class="row between mt-sm">
              <span class="kpi-trend ${k.dir}">${k.trend}</span>
            </div>
            <div class="spark">${H.charts.spark(k.spark)}</div>
          </div>
        `));
      });
      root.appendChild(kpis);

      /* ════════════════════════════════════════════════════════════════════
         PER-USER CONNECTIONS  (reads HELM.session.user; re-renders on switch)
         ────────────────────────────────────────────────────────────────────
         Each teammate connects their OWN Google + wearable. We mount a host
         <div> and rebuild ONLY its contents whenever the acting user changes,
         so the rest of the company view stays put. Disconnecting on this row
         flips the acting Person's connections flag + writes the audit log. ── */
      const peopleHost = H.el(`<div class="integrations-peoplehost" style="margin-bottom:var(--gap)"></div>`);
      root.appendChild(peopleHost);

      function buildPerUser() {
        const u = sess.user || (sess.team && sess.team[0]) || { id: '?', name: 'You', email: 'you@northwind-helm.se', connections: {} };
        const fname = (u.name || 'You').split(/\s+/)[0];
        const conns = u.connections || {};

        peopleHost.innerHTML = '';
        peopleHost.appendChild(H.el(`
          <div class="section-title">Your connections · ${esc(fname)}
            <span class="integrations-section-note">each teammate connects their own</span>
          </div>
        `));

        const grid = H.el(`<div class="grid cols-2 integrations-user-grid"></div>`);
        PER_USER.forEach(s => {
          const isOn = !!conns[s.key] || (s.alt && !!conns[s.alt]);
          const pill = isOn
            ? `<span class="pill ok">● CONNECTED</span>`
            : `<span class="pill integrations-pill-off">NOT CONNECTED</span>`;
          const acctLine = isOn
            ? `Connected as ${esc(u.email || u.id)}`
            : 'Connect to bring your data in';
          const btnLabel = isOn ? 'Disconnect' : 'Connect';
          const btnCls = isOn ? 'btn btn-sm btn-block' : 'btn btn-sm btn-block btn-primary';
          const card = H.el(`
            <div class="card integrations-card integrations-user-card ${isOn ? 'is-connected' : ''}" data-acc="${s.accent}">
              <div class="integrations-card-top">
                <div class="integrations-logo">${s.glyph}</div>
                <div class="integrations-card-id">
                  <div class="integrations-card-name">${s.name}</div>
                  <div class="integrations-card-cat">${s.cat}</div>
                </div>
                ${pill}
              </div>
              <div class="integrations-card-powers">${s.powers}</div>
              <div class="integrations-user-note">🙋 Personal — each teammate connects their own.</div>
              <div class="integrations-card-foot">
                <div class="integrations-card-meta">
                  <span class="integrations-meta-dot ${isOn ? '' : 'off'}"></span>
                  <span>${acctLine}</span>
                </div>
                <button class="${btnCls}" data-puser="${s.key}" data-name="${esc(s.name)}" data-on="${isOn ? '1' : '0'}">${btnLabel}</button>
              </div>
            </div>
          `);
          grid.appendChild(card);
        });
        peopleHost.appendChild(grid);

        // wire connect/disconnect for the ACTING user — mutate + audit + toast
        grid.querySelectorAll('button[data-puser]').forEach(btn => {
          btn.addEventListener('click', () => {
            const key = btn.dataset.puser;
            const name = btn.dataset.name;
            const turningOn = btn.dataset.on !== '1';
            // mutate the acting person's connection flag (local state)
            u.connections = u.connections || {};
            u.connections[key] = turningOn;
            if (key === 'whoop') u.connections.googleFit = turningOn; // wearable pair moves together
            H.audit.log({
              action: turningOn ? 'integration.connected' : 'integration.disconnected',
              entityType: 'Integration',
              entityId: key,
              summary: `${u.name || 'A teammate'} ${turningOn ? 'connected' : 'disconnected'} ${name} (${u.email || u.id})`,
              links: [{ entityType: 'Person', entityId: u.id }],
              module: 'integrations',
              after: { scope: 'per-user', service: key, connected: turningOn }
            });
            H.toast(
              turningOn ? `${name} connected as ${u.email || u.id}` : `${name} disconnected for ${fname}`,
              turningOn ? 'success' : 'warn'
            );
            buildPerUser(); // re-render the section to reflect new state
          });
        });
      }
      buildPerUser();

      // Re-render the per-user section when the acting user switches. The module
      // itself is company-scoped so the shell won't re-run render(); we listen.
      const offUser = sess.on('helm:user', () => {
        if (!document.body.contains(peopleHost)) { offUser(); return; }
        buildPerUser();
      });

      /* ════════════════════════════════════════════════════════════════════
         COMPANY CONNECTIONS GRID
         ════════════════════════════════════════════════════════════════════ */
      const companyTitle = H.el(`
        <div class="section-title">Company connections · <span data-count-live>${companyConnected} live · ${companyTotal - companyConnected} available</span>
          <span class="integrations-section-note">shared by the whole org</span>
        </div>
      `);
      root.appendChild(companyTitle);

      /* keep the header + Finish-Wiring tally honest after every toggle */
      function refreshCounts() {
        const live = COMPANY.filter(s => s.connected).length;
        const liveSpan = companyTitle.querySelector('[data-count-live]');
        if (liveSpan) liveSpan.textContent = `${live} live · ${companyTotal - live} available`;
        const setupMeta = setupCard && setupCard.querySelector('.ch-meta');
        if (setupMeta) setupMeta.textContent = `${live} / ${companyTotal}`;
      }

      const grid = H.el(`<div class="grid cols-4 integrations-grid" style="margin-bottom:var(--gap)"></div>`);
      COMPANY.forEach(s => {
        const card = renderCompanyCard(s);
        grid.appendChild(card);
      });
      root.appendChild(grid);

      function renderCompanyCard(s) {
        const pill = s.connected
          ? `<span class="pill ok">● CONNECTED</span>`
          : `<span class="pill integrations-pill-off">NOT CONNECTED</span>`;
        const btnLabel = s.connected ? 'Disconnect' : 'Connect';
        const btnCls = s.connected ? 'btn btn-sm btn-block' : 'btn btn-sm btn-block btn-primary';
        const linkBtn = (s.connected && s.link)
          ? `<button class="btn btn-sm integrations-link-btn" data-link="${s.link}" title="Open ${s.link}">Open ▸</button>`
          : '';
        const card = H.el(`
          <div class="card integrations-card ${s.connected ? 'is-connected' : ''}" data-acc="${s.accent}" data-svc="${s.id}" tabindex="0">
            <div class="integrations-card-top">
              <div class="integrations-logo">${s.glyph}</div>
              <div class="integrations-card-id">
                <div class="integrations-card-name">${s.name}</div>
                <div class="integrations-card-cat">${s.cat}</div>
              </div>
              ${pill}
            </div>
            <div class="integrations-card-powers">${s.powers}</div>
            <div class="integrations-card-foot">
              <div class="integrations-card-meta">
                <span class="integrations-meta-dot ${s.connected ? '' : 'off'}"></span>
                <span>${s.acct}</span>
                ${s.connected ? `<span class="integrations-card-sync">· synced ${s.sync}</span>` : ''}
              </div>
              <div class="integrations-card-cta">
                ${linkBtn}
                <button class="${btnCls}" data-connbtn="${s.id}" data-name="${esc(s.name)}"${gateDis}${gateTitle}>${btnLabel}</button>
              </div>
            </div>
          </div>
        `);
        wireCompanyCard(card, s);
        return card;
      }

      function wireCompanyCard(card, s) {
        const connBtn = card.querySelector('button[data-connbtn]');
        const linkBtn = card.querySelector('button[data-link]');
        if (linkBtn) {
          linkBtn.addEventListener('click', e => {
            e.stopPropagation();
            H.show(linkBtn.dataset.link);
          });
        }
        connBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (!gateOk()) { H.toast('Needs admin role to change company connections', 'warn'); return; }
          const turningOn = !s.connected;
          s.connected = turningOn;
          if (turningOn) { s.sync = 'just now'; if (s.acct.includes('not') || s.acct.includes('Add') || s.acct.includes('Connect')) s.acct = 'Linked · pending first sync'; }
          H.audit.log({
            action: turningOn ? 'integration.connected' : 'integration.disconnected',
            entityType: 'Integration',
            entityId: s.id,
            summary: `${(sess.user && sess.user.name) || 'Admin'} ${turningOn ? 'connected' : 'disconnected'} ${s.name} for ${sess.org ? sess.org.name : 'the company'}`,
            links: s.link ? [{ entityType: 'Module', entityId: s.link }] : [],
            module: 'integrations',
            after: { scope: 'company', service: s.id, connected: turningOn }
          });
          H.toast(
            turningOn ? `${s.name} connected — webhook armed` : `${s.name} disconnected`,
            turningOn ? 'success' : 'warn'
          );
          const fresh = renderCompanyCard(s);
          card.replaceWith(fresh);
          refreshCounts();
        });
        // whole-card click (not on a button) opens the connect flow
        card.addEventListener('click', e => { if (!e.target.closest('button')) connBtn.click(); });
        card.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); connBtn.click(); }
        });
      }

      /* ════════════════════════════════════════════════════════════════════
         WEBHOOK HEALTH TABLE  +  delivery overview chart
         ════════════════════════════════════════════════════════════════════ */
      const hookRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // table (span 2)
      const hookCard = H.el(`
        <div class="card span-2 integrations-hooks">
          <div class="card-head">
            <h3><span class="hico">🛰️</span> Webhook Health</h3>
            <span class="ch-meta">6 ENDPOINTS · ${avgHealth}% AVG</span>
          </div>
          <div class="integrations-table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Endpoint</th>
                  <th>Events</th>
                  <th>Last delivery</th>
                  <th class="num">7d</th>
                  <th class="num">Success</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `);
      const hbody = hookCard.querySelector('tbody');
      HOOKS.forEach(h => {
        const statePill = h.state === 'ok'
          ? `<span class="pill ok">● OK</span>`
          : `<span class="pill warn">◆ DEGRADED</span>`;
        const row = H.el(`
          <tr>
            <td class="mono">
              <span class="integrations-ep"><span class="integrations-ep-glyph">${h.glyph}</span>${h.ep}</span>
            </td>
            <td><span class="tag">${h.events}</span></td>
            <td class="mono">${h.last}</td>
            <td class="num"><span class="integrations-mini-spark">${H.charts.spark(h.deliv, { height: 26 })}</span></td>
            <td class="num mono">${H.fmt.num(h.rate)}%</td>
            <td>${statePill}</td>
          </tr>
        `);
        hbody.appendChild(row);
      });
      hookRow.appendChild(hookCard);

      // delivery summary — bars of success% by endpoint
      const summaryCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">📡</span> Deliveries · 24h</h3>
            <span class="ch-meta">BY ENDPOINT</span>
          </div>
          <div class="chart" style="height:170px">
            ${H.charts.bars(
              HOOKS.map(h => ({
                label: h.svc.slice(0, 4).toUpperCase(),
                value: h.rate,
                color: h.state === 'ok' ? 'url(#hcBar)' : 'var(--warn)'
              })),
              { height: 170 }
            )}
          </div>
          <div class="integrations-sumstats mt-sm">
            <div class="stat-row"><span class="sr-label">Delivered</span><span class="sr-val">${H.fmt.num(D.int('ig-deliv', 4800, 5200))}</span></div>
            <div class="stat-row"><span class="sr-label">Retried</span><span class="sr-val">${H.fmt.num(D.int('ig-retry', 12, 28))}</span></div>
            <div class="stat-row"><span class="sr-label">Failed · last 24h</span><span class="sr-val" style="color:var(--warn)">${H.fmt.num(D.int('ig-fail', 1, 4))}</span></div>
          </div>
          <button class="btn btn-sm btn-block mt-sm" data-act="replay"${gateDis}${gateTitle}>↻ Replay failed events</button>
        </div>
      `);
      hookRow.appendChild(summaryCard);
      root.appendChild(hookRow);

      /* ════════════════════════════════════════════════════════════════════
         API KEYS PANEL  +  connection setup checklist
         ════════════════════════════════════════════════════════════════════ */
      const keysRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      const keysCard = H.el(`
        <div class="card span-2 integrations-keys">
          <div class="card-head">
            <h3><span class="hico">🔑</span> API Keys & Secrets</h3>
            <span class="ch-meta">VAULTED · MASKED BY DEFAULT</span>
          </div>
          <div class="integrations-keylist"></div>
          <div class="row between mt">
            <span class="faint" style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px">🔒 ENCRYPTED AT REST · EU REGION</span>
            <button class="btn btn-sm" data-act="addkey"${gateDis}${gateTitle}>＋ Add secret</button>
          </div>
        </div>
      `);
      const klist = keysCard.querySelector('.integrations-keylist');
      KEYS.forEach(k => {
        const ageCls = k.fresh ? 'ok' : 'warn';
        const node = H.el(`
          <div class="integrations-key" data-svc="${k.svc}">
            <div class="integrations-key-glyph">${k.glyph}</div>
            <div class="integrations-key-body">
              <div class="integrations-key-top">
                <span class="integrations-key-svc">${k.svc}</span>
                <span class="tag ${k.env === 'LIVE' || k.env === 'PROD' ? 'bad' : 'info'}">${k.env}</span>
                <span class="integrations-key-scope">${k.scope}</span>
              </div>
              <div class="integrations-key-val mono" data-tail="${k.tail}" data-kind="${k.kind}" data-revealed="0">${k.kind}_••••••••••••${k.tail}</div>
            </div>
            <div class="integrations-key-side">
              <span class="pill ${ageCls}" style="font-size:9px">↻ ${k.rotated}</span>
              <div class="integrations-key-actions">
                <button class="btn btn-sm integrations-reveal" data-act="reveal">Reveal</button>
                <button class="btn btn-sm" data-act="rotate"${gateDis}${gateTitle}>Rotate</button>
              </div>
            </div>
          </div>
        `);
        klist.appendChild(node);
      });
      keysRow.appendChild(keysCard);

      // setup checklist — what's left to wire (per-user + company)
      const setupCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🚦</span> Finish Wiring</h3>
            <span class="ch-meta">${companyConnected} / ${companyTotal}</span>
          </div>
          <div class="integrations-setup"></div>
        </div>
      `);
      const setup = setupCard.querySelector('.integrations-setup');
      [
        ['Payments live', 'Stripe connected', true, null],
        ['Bank feed linked', 'Tink · 2 accounts', true, null],
        ['Bookkeeping syncing', 'Fortnox · VAT ready', true, null],
        ['Dev events flowing', 'GitHub → Dev Log', true, null],
        ['Route alerts to Slack', 'Link #ops workspace', false, 'slack'],
        ['Arm AI copilot', 'Add Anthropic API key', false, 'anthropic'],
        ['Enable e-sign', 'Connect Scrive → Vault', false, 'scrive']
      ].forEach(([title, sub, done, svc]) => {
        const node = H.el(`
          <div class="check ${done ? 'done' : ''}">
            <div class="box">✓</div>
            <div class="ck-body"><div class="ck-title">${title}</div><div class="ck-sub">${sub}</div></div>
            ${done ? '<span class="pill ok">DONE</span>' : `<button class="btn btn-sm btn-primary" data-jump="${svc}">Connect</button>`}
          </div>
        `);
        setup.appendChild(node);
      });
      keysRow.appendChild(setupCard);
      root.appendChild(keysRow);

      /* ════════════════════════════════════════════════════════════════════
         WIRING — view-head, replay, keys, checklist
         ════════════════════════════════════════════════════════════════════ */

      // view-head actions
      root.querySelector('[data-act="guide"]').addEventListener('click', () =>
        H.toast('Opening the wiring guide — connect Sweden-first stack', 'info'));
      root.querySelector('[data-act="browse"]').addEventListener('click', () =>
        H.toast('48 more integrations in the catalogue', 'info'));

      // webhook replay (mutating → admin-gated, same as company connections)
      summaryCard.querySelector('[data-act="replay"]').addEventListener('click', () => {
        if (!gateOk()) { H.toast('Needs admin role to replay webhook events', 'warn'); return; }
        H.audit.log({
          action: 'webhook.replayed', entityType: 'Webhook', entityId: 'failed-24h',
          summary: `${(sess.user && sess.user.name) || 'Someone'} replayed failed webhook events (last 24h)`,
          module: 'integrations'
        });
        H.toast('Replaying failed webhook events…', 'info');
      });

      // API keys: reveal toggles mask, rotate mutates + audit + toast.
      // remask helpers are collected so a tab change can hide every revealed key.
      const remaskers = [];
      klist.querySelectorAll('.integrations-key').forEach(keyEl => {
        const val = keyEl.querySelector('.integrations-key-val');
        const revealBtn = keyEl.querySelector('[data-act="reveal"]');
        const rotateBtn = keyEl.querySelector('[data-act="rotate"]');
        const agePill = keyEl.querySelector('.pill');
        const svc = keyEl.dataset.svc;

        // re-mask this key (used by Hide, Rotate, and the tab-change auto-hide)
        const mask = () => {
          val.textContent = `${val.dataset.kind}_••••••••••••${val.dataset.tail}`;
          val.dataset.revealed = '0';
          revealBtn.textContent = 'Reveal';
          keyEl.classList.remove('is-revealed');
        };
        remaskers.push(mask);

        revealBtn.addEventListener('click', () => {
          const shown = val.dataset.revealed === '1';
          if (shown) {
            mask();
          } else {
            // deterministic, fake-but-real-looking middle section
            const r = D.seed('key-' + svc);
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789';
            let mid = '';
            for (let i = 0; i < 16; i++) mid += chars[Math.floor(r() * chars.length)];
            val.textContent = `${val.dataset.kind}_${mid}${val.dataset.tail}`;
            val.dataset.revealed = '1';
            revealBtn.textContent = 'Hide';
            keyEl.classList.add('is-revealed');
            H.audit.log({
              action: 'secret.revealed', entityType: 'ApiKey', entityId: svc,
              summary: `${(sess.user && sess.user.name) || 'Someone'} revealed the ${svc} API key`,
              module: 'integrations'
            });
            H.toast(`${svc} key revealed — auto-hides on tab change`, 'warn');
          }
        });

        rotateBtn.addEventListener('click', () => {
          if (!gateOk()) { H.toast('Needs admin role to rotate keys', 'warn'); return; }
          if (agePill) { agePill.textContent = '↻ just now'; agePill.classList.remove('warn'); agePill.classList.add('ok'); }
          mask(); // re-mask after a rotate
          H.audit.log({
            action: 'secret.rotated', entityType: 'ApiKey', entityId: svc,
            summary: `${(sess.user && sess.user.name) || 'Someone'} rotated the ${svc} API key (old key valid 24h)`,
            module: 'integrations'
          });
          H.toast(`Rotating ${svc} key — old key valid 24h`, 'success');
        });
      });

      // honour the "auto-hides on tab change" promise: when the browser tab is
      // backgrounded, re-mask every revealed secret. Self-cleans once the keys
      // panel leaves the DOM (e.g. a hard re-render), so no listener leaks.
      const onHide = () => {
        if (!document.body.contains(keysCard)) { document.removeEventListener('visibilitychange', onHide); return; }
        if (document.hidden) remaskers.forEach(m => m());
      };
      document.addEventListener('visibilitychange', onHide);

      keysCard.querySelector('[data-act="addkey"]').addEventListener('click', () => {
        if (!gateOk()) { H.toast('Needs admin role to add secrets', 'warn'); return; }
        H.toast('Add a new secret to the vault…', 'info');
      });

      // setup checklist connect buttons → scroll to the company card + open flow.
      // gate here too: the company connect button is disabled for non-admins, so
      // a blind .click() would be a silent no-op — give explicit feedback instead.
      setup.querySelectorAll('button[data-jump]').forEach(b => {
        b.addEventListener('click', () => {
          const svc = b.dataset.jump;
          if (!gateOk()) { H.toast('Needs admin role to change company connections', 'warn'); return; }
          const target = grid.querySelector(`.integrations-card[data-svc="${svc}"]`);
          if (target) {
            target.scrollIntoView({ block: 'center', behavior: 'smooth' });
            const cb = target.querySelector('button[data-connbtn]');
            if (cb) cb.click();
          } else {
            H.toast(`Connecting ${svc}…`, 'info');
          }
        });
      });

      // count-ups auto-run by the shell after render(); nothing else needed.
    }
  });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
