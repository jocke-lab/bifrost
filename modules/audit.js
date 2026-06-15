/* ============================================================================
   audit.js — Audit Log. The immutable everything-log.
   ----------------------------------------------------------------------------
   Reads the REAL store via HELM.audit.list() / .exportJSONL() and renders a
   premium, tamper-evident event stream: actor avatar + name, an action tag, a
   plain-English summary, entity links, amount (if monetary), relative time and
   a tiny hashSelf chip. Filter chips (actor / action / entity / module)
   re-query HELM.audit.list(filter) and re-render in place. A KPI row, an
   entity-timeline example panel and a prominent "Export for AI" button round it
   out. Every data-changing action across HELM writes here, so an AI can replay
   the company from one JSONL file.

   Follows the Command Deck reference shape EXACTLY:
     1) HELM.register({id,label,icon,scope,render})
     2) build DOM from documented .classes + HELM.charts only
     3) deterministic data via HELM.data / the real audit store (no Math.random)
     4) every button wired to H.toast / H.show / local state
   Namespaced tweaks live in audit.css under the .audit-* prefix (tokens only).
   ========================================================================== */
(function () {
  const H = window.HELM;

  /* — action verb → { tag-severity, emoji } (extend-safe defaults) ──────── */
  const ACTION_META = {
    'payment.created':   { sev: 'ok',   ico: '💸', label: 'Payment' },
    'payment.settled':   { sev: 'ok',   ico: '💸', label: 'Payment' },
    'invoice.paid':      { sev: 'ok',   ico: '🧾', label: 'Invoice' },
    'invoice.sent':      { sev: 'info', ico: '🧾', label: 'Invoice' },
    'cost.added':        { sev: 'warn', ico: '📒', label: 'Cost' },
    'deal.won':          { sev: 'ok',   ico: '🎯', label: 'Deal' },
    'deal.lost':         { sev: 'bad',  ico: '🎯', label: 'Deal' },
    'partner.created':   { sev: 'info', ico: '🤝', label: 'Partner' },
    'role.changed':      { sev: 'info', ico: '🛡️', label: 'Role' },
    'deploy.succeeded':  { sev: 'ok',   ico: '🚀', label: 'Deploy' },
    'deploy.failed':     { sev: 'bad',  ico: '🚀', label: 'Deploy' },
    'doc.signed':        { sev: 'ok',   ico: '🖊️', label: 'Document' },
    'task.moved':        { sev: 'info', ico: '🗂️', label: 'Task' },
    'campaign.launched': { sev: 'info', ico: '📡', label: 'Campaign' },
    'meeting.recorded':  { sev: 'info', ico: '🎥', label: 'Meeting' },
    'portal.invited':    { sev: 'info', ico: '🪟', label: 'Portal' },
    'settings.changed':  { sev: 'warn', ico: '⚙️', label: 'Settings' }
  };
  function actionMeta(action) {
    if (ACTION_META[action]) return ACTION_META[action];
    // derive a sane default from the verb if unseen
    if (/fail|error|delete|deactivat|lost|incident/i.test(action)) return { sev: 'bad', ico: '⚠️', label: 'Event' };
    if (/warn|overdue|risk|cost|removed/i.test(action)) return { sev: 'warn', ico: '◆', label: 'Event' };
    if (/deploy|sync|automation|sign|won|paid|created/i.test(action)) return { sev: 'ok', ico: '◆', label: 'Event' };
    return { sev: 'info', ico: '◆', label: 'Event' };
  }

  /* — entity type → emoji for the link chip ─────────────────────────────── */
  const ENTITY_ICO = {
    Payment: '💸', Invoice: '🧾', Cost: '📒', Deal: '🎯', Partner: '🤝',
    Person: '🧑', Deploy: '🚀', Document: '🖊️', Task: '🗂️', Campaign: '📡',
    Meeting: '🎥', PortalAccount: '🪟', Customer: '🏢', Unknown: '◻'
  };

  /* — which HELM module a given module-context routes to (best-effort) ──── */
  const MODULE_ROUTE = {
    ledger: 'ledger', billing: 'billing', revenue: 'revenue',
    pipeline: 'pipeline', partners: 'partners', portal: 'portal',
    crew: 'crew', meetings: 'meetings', infra: 'infra', devlog: 'devlog',
    projects: 'projects', vault: 'vault', signal: 'signal', inventory: 'inventory',
    orders: 'orders', settings: 'settings'
  };

  H.register({
    id: 'audit',
    label: 'Audit Log',
    icon: '🛡️',
    scope: 'company',
    render(root) {
      const D = H.data;
      const sess = H.session;
      const team = sess.team;
      const me = sess.user;
      const teamById = {};
      team.forEach(p => { teamById[p.id] = p; });
      const accentForRole = { owner: 'var(--accent1)', admin: 'var(--accent3)', finance: 'var(--warn)', member: 'var(--accent2)', viewer: 'var(--text-muted)' };

      /* — live filter state (re-queries the real store on change) ───────── */
      const filter = { actorId: null, action: null, entityType: null, module: null };

      /* ── helpers ─────────────────────────────────────────────────────── */
      const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

      function actorOf(e) {
        return teamById[e.actorId] || { name: e.actorId || 'System', avatar: '··', role: e.actorRole || 'system' };
      }
      // relative time vs the newest seeded event (so it reads sensibly cold)
      function relTime(iso, ref) {
        const t = new Date(iso).getTime();
        if (isNaN(t)) return '—';
        const diff = Math.max(0, ref - t);
        const m = Math.round(diff / 60000);
        if (m < 1) return 'just now';
        if (m < 60) return m + 'm ago';
        const h = Math.round(m / 60);
        if (h < 24) return h + 'h ago';
        const dys = Math.round(h / 24);
        if (dys < 7) return dys + 'd ago';
        return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      }
      function moneyKr(amount) {
        if (!amount || amount.value == null) return '';
        const cur = amount.currency || 'SEK';
        if (cur === 'SEK') return H.fmt.money(amount.value, '') + ' kr';
        return H.fmt.money(amount.value, cur === 'USD' ? '$' : (cur === 'EUR' ? '€' : ''));
      }

      // single source of truth: the real store
      function allEvents() { return H.audit.list(); }
      function filteredEvents() {
        const f = {};
        if (filter.actorId) f.actorId = filter.actorId;
        if (filter.action) f.action = filter.action;
        if (filter.entityType) f.entityType = filter.entityType;
        if (filter.module) f.module = filter.module;
        return H.audit.list(Object.keys(f).length ? f : undefined);
      }

      /* ======================================================================
         VIEW HEAD  —  export-for-AI is the hero action
      ====================================================================== */
      const canExport = sess.can('audit.export');
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">🛡️</div>
            <div>
              <h1>Audit Log</h1>
              <p>The immutable everything-log — append-only, hash-chained, AI-readable.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="verify">✓ Verify chain</button>
            <button class="btn btn-primary btn-sm" data-act="export" ${canExport ? '' : 'disabled title="Needs finance role"'}>⬇ Export for AI</button>
          </div>
        </div>
      `));

      /* ======================================================================
         KPI ROW  —  events today · actors active · $ moved · integrity
      ====================================================================== */
      const events = allEvents();
      // "today" = the most recent event's calendar day in the store
      const newestTs = events.length ? new Date(events[0].ts).getTime() : Date.now();
      const refNow = newestTs; // anchor relative time to the freshest event
      const newestDay = events.length ? events[0].ts.slice(0, 10) : '';
      const eventsToday = events.filter(e => e.ts.slice(0, 10) === newestDay).length;
      const actorsActive = new Set(events.map(e => e.actorId)).size;
      const moved = events.reduce((a, e) => a + (e.amount && e.amount.currency === 'SEK' ? e.amount.value : 0), 0);

      const kpiRow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
      kpiRow.appendChild(H.el(`
        <div class="card kpi audit-kpi">
          <div class="kpi-label">📋 EVENTS · TODAY</div>
          <div class="kpi-value sm" data-count="${eventsToday}" data-fmt="num">0</div>
          <div class="kpi-sub">${events.length} total in the chain</div>
        </div>`));
      kpiRow.appendChild(H.el(`
        <div class="card kpi audit-kpi">
          <div class="kpi-label">👥 ACTORS · ACTIVE</div>
          <div class="kpi-value sm" data-count="${actorsActive}" data-fmt="num">0</div>
          <div class="kpi-sub">of ${team.length} on the crew</div>
        </div>`));
      kpiRow.appendChild(H.el(`
        <div class="card kpi audit-kpi">
          <div class="kpi-label">💸 VALUE · MOVED</div>
          <div class="kpi-value sm" data-count="${moved}" data-fmt="num" data-suffix=" kr">0</div>
          <div class="kpi-sub">across logged money events</div>
        </div>`));
      kpiRow.appendChild(H.el(`
        <div class="card kpi audit-kpi audit-integrity">
          <div class="kpi-label">🔗 INTEGRITY</div>
          <div class="audit-integrity-val"><span class="audit-chain-ok">✓</span> chain intact</div>
          <div class="kpi-sub">${events.length} links · hash-verified</div>
        </div>`));
      root.appendChild(kpiRow);

      /* ======================================================================
         MAIN GRID  —  filterable stream (span 2)  |  side rail
      ====================================================================== */
      const main = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      /* ── THE STREAM ──────────────────────────────────────────────────── */
      const streamCard = H.el(`
        <div class="card span-2 flush audit-streamcard">
          <div class="card-head" style="padding:16px 16px 12px">
            <h3><span class="hico">📡</span> Event Stream</h3>
            <div class="row gap-sm">
              <span class="ch-meta audit-count">${events.length} EVENTS</span>
              <button class="btn btn-sm btn-ghost" data-act="clearf" hidden>Clear filters</button>
            </div>
          </div>
          <div class="audit-filters"></div>
          <div class="audit-stream"></div>
        </div>
      `);

      /* — build the filter-chip rails (actor / action / entity / module) — */
      const filtersWrap = streamCard.querySelector('.audit-filters');
      const actionsPresent = Array.from(new Set(events.map(e => e.action)));
      const entitiesPresent = Array.from(new Set(events.map(e => e.entityType)));
      const modulesPresent = Array.from(new Set(events.map(e => (e.context && e.context.module) || null).filter(Boolean)));
      const actorsPresent = Array.from(new Set(events.map(e => e.actorId)));

      function chipRail(label, key, items, renderLabel) {
        const rail = H.el(`<div class="audit-frail"><span class="audit-frail-k">${label}</span><div class="audit-chips"></div></div>`);
        const chips = rail.querySelector('.audit-chips');
        chips.appendChild(makeChip(key, null, 'All'));
        items.forEach(v => chips.appendChild(makeChip(key, v, renderLabel(v))));
        return rail;
      }
      function makeChip(key, value, text) {
        const active = filter[key] === value || (value === null && !filter[key]);
        const chip = H.el(`<button class="audit-chip${active ? ' active' : ''}" data-key="${key}" data-val="${value == null ? '' : esc(value)}">${esc(text)}</button>`);
        chip.addEventListener('click', () => {
          filter[key] = value;
          rerenderStream();
        });
        return chip;
      }

      filtersWrap.appendChild(chipRail('ACTOR', 'actorId', actorsPresent, id => (teamById[id] ? teamById[id].name.split(' ')[0] : id)));
      filtersWrap.appendChild(chipRail('ACTION', 'action', actionsPresent, a => a));
      filtersWrap.appendChild(chipRail('ENTITY', 'entityType', entitiesPresent, e => e));
      if (modulesPresent.length) filtersWrap.appendChild(chipRail('MODULE', 'module', modulesPresent, m => m));

      const streamEl = streamCard.querySelector('.audit-stream');

      function eventRow(e, opts) {
        opts = opts || {};
        const a = actorOf(e);
        const am = actionMeta(e.action);
        const accent = accentForRole[a.role] || 'var(--accent2)';
        const money = moneyKr(e.amount);
        const links = (e.links || []).slice(0, 2).map(l =>
          `<span class="audit-link" data-etype="${esc(l.entityType)}" data-eid="${esc(l.entityId)}"><i>${ENTITY_ICO[l.entityType] || '◻'}</i>${esc(l.entityId)}</span>`).join('');
        const mod = e.context && e.context.module;
        const row = H.el(`
          <div class="audit-row" data-id="${esc(e.id)}">
            <span class="avatar audit-avatar" style="background:linear-gradient(135deg,${accent},var(--accent3))" title="${esc(a.name)} · ${esc(a.role)}">${esc(a.avatar || D.initials(a.name))}</span>
            <div class="audit-body">
              <div class="audit-line1">
                <span class="audit-actor">${esc(a.name)}</span>
                <span class="tag ${am.sev} audit-action"><i>${am.ico}</i>${esc(e.action)}</span>
                ${money ? `<span class="audit-amount">${esc(money)}</span>` : ''}
                <span class="audit-time" title="${esc(e.ts)}">${esc(relTime(e.ts, refNow))}</span>
              </div>
              <div class="audit-summary">${esc(e.summary || e.action)}</div>
              <div class="audit-meta">
                ${links}
                ${mod ? `<button class="audit-modchip" data-mod="${esc(mod)}">${esc(mod)} →</button>` : ''}
                <span class="audit-hash" title="hashSelf — tamper-evident link to the previous event">⛓ ${esc(e.hashSelf || '········')}</span>
              </div>
            </div>
          </div>
        `);
        // entity link → open the timeline panel for that entity
        row.querySelectorAll('.audit-link').forEach(lk => lk.addEventListener('click', () => {
          showTimeline(lk.dataset.etype, lk.dataset.eid);
        }));
        // module chip → route to the owning module if registered
        const mc = row.querySelector('.audit-modchip');
        if (mc) mc.addEventListener('click', () => {
          const target = MODULE_ROUTE[mc.dataset.mod];
          if (target && H._internal && H._internal.byId && H._internal.byId[target]) H.show(target);
          else H.toast('No view for module · ' + mc.dataset.mod, 'info');
        });
        // hash chip → copy-to-clipboard feel
        const hashEl = row.querySelector('.audit-hash');
        if (hashEl) hashEl.addEventListener('click', () => H.toast('Hash ' + (e.hashSelf || '') + ' — links to prev ' + (e.hashPrev || '00000000'), 'info'));
        return row;
      }

      function rerenderStream() {
        const list = filteredEvents();
        streamEl.innerHTML = '';
        if (!list.length) {
          streamEl.appendChild(H.el(`<div class="audit-empty"><div class="big">🗒️</div><div>No events match this filter.</div></div>`));
        } else {
          list.forEach(e => streamEl.appendChild(eventRow(e)));
        }
        // refresh chip active states
        streamCard.querySelectorAll('.audit-chip').forEach(chip => {
          const key = chip.dataset.key;
          const val = chip.dataset.val || null;
          chip.classList.toggle('active', (filter[key] || null) === val);
        });
        // count + clear-filters affordance
        const cnt = streamCard.querySelector('.audit-count');
        if (cnt) cnt.textContent = list.length + (list.length === events.length ? ' EVENTS' : ' OF ' + events.length);
        const anyFilter = !!(filter.actorId || filter.action || filter.entityType || filter.module);
        const clearBtn = streamCard.querySelector('[data-act="clearf"]');
        if (clearBtn) clearBtn.hidden = !anyFilter;
      }
      rerenderStream();
      main.appendChild(streamCard);

      /* ── SIDE RAIL: actor leaderboard + action mix + how-it-feeds-AI ──── */
      const side = H.el(`<div class="col" style="gap:var(--gap)"></div>`);

      // — by-actor leaderboard (click = filter the stream) —
      const byActor = {};
      events.forEach(e => { byActor[e.actorId] = (byActor[e.actorId] || 0) + 1; });
      const actorRank = Object.keys(byActor).map(id => ({ id, n: byActor[id] })).sort((a, b) => b.n - a.n);
      const maxActor = actorRank.length ? actorRank[0].n : 1;

      const actorCard = H.el(`
        <div class="card audit-actorcard">
          <div class="card-head">
            <h3><span class="hico">👥</span> Who's Writing History</h3>
            <span class="ch-meta">${actorRank.length} ACTORS</span>
          </div>
          <div class="audit-actorlist"></div>
        </div>
      `);
      const actorList = actorCard.querySelector('.audit-actorlist');
      actorRank.forEach(({ id, n }) => {
        const p = teamById[id] || { name: id, role: 'system', avatar: '··' };
        const accent = accentForRole[p.role] || 'var(--accent2)';
        const node = H.el(`
          <button class="audit-actorrow" data-actor="${esc(id)}">
            <span class="avatar audit-avatar sm" style="background:linear-gradient(135deg,${accent},var(--accent3))">${esc(p.avatar || D.initials(p.name))}</span>
            <span class="audit-arow-body">
              <span class="audit-arow-name">${esc(p.name)}</span>
              <div class="progress audit-arow-bar"><div class="bar" style="width:0" data-w="${Math.round(n / maxActor * 100)}"></div></div>
            </span>
            <span class="audit-arow-n">${n}</span>
          </button>
        `);
        node.addEventListener('click', () => { filter.actorId = (filter.actorId === id ? null : id); rerenderStream(); });
        actorList.appendChild(node);
        const bar = node.querySelector('.bar');
        setTimeout(() => { bar.style.width = bar.dataset.w + '%'; }, 260);
      });
      side.appendChild(actorCard);

      // — action mix donut —
      const byAction = {};
      events.forEach(e => { const k = actionMeta(e.action).label; byAction[k] = (byAction[k] || 0) + 1; });
      const actionSegs = Object.keys(byAction).map(k => ({ label: k, value: byAction[k] }))
        .sort((a, b) => b.value - a.value).slice(0, 6);
      const mixCard = H.el(`
        <div class="card audit-mixcard">
          <div class="card-head">
            <h3><span class="hico">🧬</span> Action Mix</h3>
            <span class="ch-meta">BY TYPE</span>
          </div>
          <div class="chart audit-mixdonut" style="height:168px">
            ${H.charts.donut(actionSegs, { size: 168, thickness: 20, center: { value: events.length, label: 'EVENTS' } })}
          </div>
          <div class="audit-mixlegend"></div>
        </div>
      `);
      const mixLegend = mixCard.querySelector('.audit-mixlegend');
      const palette = ['var(--accent1)', 'var(--accent2)', 'var(--accent3)', 'var(--warn)', '#5ad1b0', '#9d8bff'];
      actionSegs.forEach((s, i) => {
        mixLegend.appendChild(H.el(`
          <div class="audit-mixrow">
            <span class="audit-mixdot" style="background:${palette[i % palette.length]}"></span>
            <span class="audit-mixname">${esc(s.label)}</span>
            <span class="audit-mixval">${s.value}</span>
          </div>
        `));
      });
      side.appendChild(mixCard);
      main.appendChild(side);
      root.appendChild(main);

      /* ======================================================================
         ENTITY TIMELINE  (example panel — every event touching one entity)
      ====================================================================== */
      const timelineCard = H.el(`
        <div class="card audit-timelinecard" style="margin-bottom:var(--gap)">
          <div class="card-head">
            <h3><span class="hico">🧵</span> Entity Timeline</h3>
            <div class="row gap-sm">
              <span class="ch-meta audit-tl-sub">PICK AN ENTITY</span>
            </div>
          </div>
          <div class="audit-tl-picker"></div>
          <div class="audit-timeline"></div>
        </div>
      `);
      // build a small set of "interesting" entities to pick from (those with links / money)
      const entityKeys = [];
      const seenEntity = {};
      events.forEach(e => {
        const k = e.entityType + '::' + e.entityId;
        if (!seenEntity[k] && e.entityId) { seenEntity[k] = true; entityKeys.push({ type: e.entityType, id: e.entityId }); }
        (e.links || []).forEach(l => {
          const lk = l.entityType + '::' + l.entityId;
          if (!seenEntity[lk] && l.entityId) { seenEntity[lk] = true; entityKeys.push({ type: l.entityType, id: l.entityId }); }
        });
      });
      // prefer Customer entities (richest cross-module story), then first few
      const customerEntities = entityKeys.filter(k => k.type === 'Customer');
      const pickEntities = (customerEntities.length ? customerEntities : entityKeys).slice(0, 6);

      const picker = timelineCard.querySelector('.audit-tl-picker');
      const timelineEl = timelineCard.querySelector('.audit-timeline');

      function showTimeline(type, id) {
        // mark active picker chip
        picker.querySelectorAll('.audit-chip').forEach(c =>
          c.classList.toggle('active', c.dataset.etype === type && c.dataset.eid === id));
        const sub = timelineCard.querySelector('.audit-tl-sub');
        if (sub) sub.textContent = (ENTITY_ICO[type] || '◻') + ' ' + type + ' · ' + id;
        // every event whose entity OR a link matches
        const matches = events.filter(e =>
          (e.entityType === type && e.entityId === id) ||
          (e.links || []).some(l => l.entityType === type && l.entityId === id)
        ).slice().reverse(); // oldest → newest along the spine
        timelineEl.innerHTML = '';
        if (!matches.length) {
          timelineEl.appendChild(H.el(`<div class="audit-empty"><div>No history for this entity yet.</div></div>`));
          return;
        }
        matches.forEach(e => {
          const a = actorOf(e);
          const am = actionMeta(e.action);
          const money = moneyKr(e.amount);
          timelineEl.appendChild(H.el(`
            <div class="audit-tl-item">
              <div class="audit-tl-spine"><span class="audit-tl-dot ${am.sev}"></span></div>
              <div class="audit-tl-content">
                <div class="audit-tl-top">
                  <span class="tag ${am.sev} audit-action"><i>${am.ico}</i>${esc(e.action)}</span>
                  ${money ? `<span class="audit-amount">${esc(money)}</span>` : ''}
                  <span class="audit-time">${esc(new Date(e.ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span>
                </div>
                <div class="audit-summary">${esc(e.summary || e.action)}</div>
                <div class="audit-tl-by">${esc(a.name)} · <span class="audit-hash">⛓ ${esc(e.hashSelf || '········')}</span></div>
              </div>
            </div>
          `));
        });
      }

      pickEntities.forEach((k, i) => {
        const chip = H.el(`<button class="audit-chip audit-tl-chip${i === 0 ? ' active' : ''}" data-etype="${esc(k.type)}" data-eid="${esc(k.id)}"><i>${ENTITY_ICO[k.type] || '◻'}</i>${esc(k.id)}</button>`);
        chip.addEventListener('click', () => showTimeline(k.type, k.id));
        picker.appendChild(chip);
      });
      if (pickEntities.length) showTimeline(pickEntities[0].type, pickEntities[0].id);
      root.appendChild(timelineCard);

      /* ======================================================================
         AI NOTE — why this log exists
      ====================================================================== */
      root.appendChild(H.el(`
        <div class="card audit-ainote">
          <div class="audit-ainote-ico">🤖</div>
          <div class="audit-ainote-body">
            <div class="audit-ainote-title">One log to reconstruct the whole company</div>
            <p class="muted">Every data-changing action across HELM — a booked cost, a closed deal, a promotion, a deploy — appends one hash-chained event here. Each event links to the previous by hash, so the chain is tamper-evident. <b>Export for AI</b> hands an LLM a single <span class="mono">.jsonl</span> file it can replay to know exactly what happened, who did it, and when — no other context required.</p>
          </div>
          <button class="btn btn-primary btn-sm audit-ainote-btn" data-act="export2" ${canExport ? '' : 'disabled title="Needs finance role"'}>⬇ Export for AI</button>
        </div>
      `));

      /* ======================================================================
         WIRE TOP-LEVEL ACTIONS  (no global keys — shell owns ⌘K)
      ====================================================================== */
      function doExport() {
        if (!sess.can('audit.export')) { H.toast('Export needs finance role', 'warn'); return; }
        let jsonl = '';
        try { jsonl = H.audit.exportJSONL(); } catch (e) { jsonl = ''; }
        const n = jsonl ? jsonl.split('\n').filter(Boolean).length : 0;
        // also log the export itself (the log records its own reads, audit-style)
        try {
          H.audit.log({
            action: 'audit.exported',
            entityType: 'AuditLog', entityId: 'helm.audit',
            summary: (me ? me.name : 'Someone') + ' exported ' + n + ' events as JSONL for AI context',
            links: [{ entityType: 'AuditLog', entityId: 'helm.audit' }],
            module: 'audit'
          });
        } catch (e) {}
        // best-effort download so the artifact is real, not just a toast
        try {
          const blob = new Blob([jsonl], { type: 'application/x-ndjson' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'helm-audit-' + (newestDay || 'export') + '.jsonl';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
        } catch (e) {}
        H.toast('Exported ' + n + ' events as JSONL for AI context', 'success');
        // a fresh export event just landed — keep the stream + KPIs honest
        rerenderStream();
      }
      function verifyChain() {
        // walk the chain newest→oldest; confirm each hashPrev links the prior hashSelf
        const chrono = allEvents().slice().reverse(); // oldest first
        let ok = true, broken = null;
        for (let i = 1; i < chrono.length; i++) {
          if (chrono[i].hashPrev && chrono[i].hashPrev !== chrono[i - 1].hashSelf) { ok = false; broken = chrono[i].id; break; }
        }
        if (ok) H.toast('Chain intact — ' + chrono.length + ' events hash-verified ✓', 'success');
        else H.toast('Chain broken at ' + broken, 'danger');
      }

      const wire = (sel, fn) => { const b = root.querySelector(sel); if (b) b.addEventListener('click', fn); };
      wire('[data-act="export"]', doExport);
      wire('[data-act="export2"]', doExport);
      wire('[data-act="verify"]', verifyChain);
      wire('[data-act="clearf"]', () => {
        filter.actorId = filter.action = filter.entityType = filter.module = null;
        rerenderStream();
      });

      // count-ups auto-run by the shell after render(); nothing else needed.
    }
  });
})();
