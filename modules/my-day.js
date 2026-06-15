/* ============================================================================
   my-day.js — My Day  (PERSONAL landing).
   The page each person opens every morning. Everything reflects WHO is logged
   in: read HELM.session.user fresh at the top of render() and build for that
   person. The shell re-renders this module on a user switch (scope:'personal'),
   so a switch swaps the name, greeting, tasks, meetings, pulse and feed.

   Sections:
     • Greeting header — "Good morning, {first}" + date + presence + Focus toggle
     • Needs you today — my tasks due, approvals on me, follow-ups (attn rows)
     • Today's meetings — timeline (time, title, attendees, Join → meetings)
     • My unread that matter — top emails/DMs (→ inbox / comms)
     • My pulse — my KPIs for the day with sparklines
     • Company pulse — celebratory mini-feed from HELM.audit.list()

   Follows the command.js reference shape: register + lazy render(root).
   ========================================================================== */
(function () {
  const H = window.HELM;
  const D = H.data;

  /* The currently-open presence dropdown (if any). A SINGLE document-level
     outside-click handler (installed once below) closes it — render() must
     NOT add its own document listener, or every user-switch re-render would
     stack another permanent handler bound to a now-detached menu node. */
  let _openPresMenu = null;
  document.addEventListener('click', () => {
    if (_openPresMenu) { _openPresMenu.hidden = true; _openPresMenu = null; }
  });

  /* ── small helpers ───────────────────────────────────────────────────── */
  function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || 'there'; }

  // time-of-day greeting — read at render() (clock is fine here, never at eval)
  function greetingFor() {
    const hour = (typeof Date !== 'undefined') ? new Date().getHours() : 9;
    if (hour < 5) return 'Still up';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  // a stable, readable date line — built once at render (clock is fine here)
  function dateLine() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const d = new Date();
    return `${days[d.getDay()]}, ${d.getDate()} ${mon[d.getMonth()]}`;
  }

  const PRESENCE = (H._internal && H._internal.PRESENCE_META) || {
    available: { label: 'Available', dot: 'available' },
    focus:     { label: 'Focus',     dot: 'focus' },
    meeting:   { label: 'In a meeting', dot: 'meeting' },
    away:      { label: 'Away',       dot: 'away' }
  };
  const PRESENCE_ORDER = ['available', 'focus', 'meeting', 'away'];

  function avatarFor(p) {
    return `<span class="avatar" title="${esc(p.name)}">${esc(p.avatar || D.initials(p.name))}</span>`;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ── per-person deterministic data builders ──────────────────────────────
     All keyed on the user id so each person gets their own (stable) day. ─── */

  // role-aware "needs you today" — tasks due, approvals, follow-ups
  function buildNeedsYou(u) {
    const role = u.role;
    const can = (p) => H.session.can(p);
    const items = [];

    // 1) tasks assigned to me (everyone has some)
    const taskPool = {
      'u-arvid': [
        { ico: '🖊️', title: 'Sign the Lykke Studios MSA', sub: 'Vault · waiting on your signature', go: 'vault', sev: 'warn' },
        { ico: '📊', title: 'Review Q2 board deck before 14:00', sub: 'Due today · 12 slides', go: 'analytics', sev: 'info' }
      ],
      'u-mira': [
        { ico: '🗂️', title: 'Approve June hiring plan', sub: 'Crew · 2 roles pending', go: 'crew', sev: 'warn' },
        { ico: '📝', title: 'Finalise Q2 board minutes', sub: 'Meetings · transcript ready', go: 'meetings', sev: 'info' }
      ],
      'u-ola': [
        { ico: '🧾', title: 'Categorise 4,200 kr cost', sub: 'Ledger · Northwind Hosting AB', go: 'ledger', sev: 'warn' },
        { ico: '📅', title: 'Close the May books', sub: 'Ledger · 3 vouchers left', go: 'ledger', sev: 'info' }
      ],
      'u-sofia': [
        { ico: '📞', title: 'Call Halland Bryggeri back', sub: 'Pipeline · demo follow-up due', go: 'pipeline', sev: 'warn' },
        { ico: '📤', title: 'Send Forsberg the signed order', sub: 'Pipeline · won 96,000 kr', go: 'pipeline', sev: 'info' }
      ],
      'u-noah': [
        { ico: '🐞', title: 'Fix AX-12 inventory sync error', sub: 'Projects · assigned by Lena', go: 'projects', sev: 'bad' },
        { ico: '🚀', title: 'Cut helm-web v1.8.3', sub: 'Infra · 4 commits queued', go: 'infra', sev: 'info' }
      ],
      'u-lena': [
        { ico: '📦', title: 'Reorder AX-12 stock', sub: 'Inventory · 8 left, below par', go: 'inventory', sev: 'bad' },
        { ico: '↩️', title: 'Process return — Order #0992', sub: 'Orders · via PostNord', go: 'orders', sev: 'warn' }
      ],
      'u-kai': [
        { ico: '📣', title: 'Check Midsummer campaign ROAS', sub: 'Signal · day 2 live', go: 'signal', sev: 'info' },
        { ico: '✍️', title: 'Draft the June newsletter', sub: 'Comms · due Friday', go: 'comms', sev: 'info' }
      ],
      'u-isa': [
        { ico: '🎫', title: 'Reply to reopened support ticket', sub: 'Inbox · Forsberg Konsult', go: 'inbox', sev: 'warn' },
        { ico: '🤝', title: 'Onboard Lykke to the portal', sub: 'Portal · invite accepted', go: 'portal', sev: 'info' }
      ]
    };
    (taskPool[u.id] || [
      { ico: '✅', title: 'Clear your inbox triage', sub: 'Inbox · a few items waiting', go: 'inbox', sev: 'info' }
    ]).forEach(t => items.push(Object.assign({ kind: 'task' }, t)));

    // 2) approvals waiting on me — only if I can actually approve
    if (can('payroll.run')) {
      items.push({ kind: 'approval', sev: 'warn', ico: '💸', title: 'Payroll run ready — June', sub: '8 employees · review & approve', go: 'crew' });
    }
    if (role === 'finance' || role === 'owner') {
      items.push({ kind: 'approval', sev: 'warn', ico: '🏛️', title: 'VAT draft awaiting approval', sub: 'Fortnox · period May 2026', go: 'ledger' });
    }
    if (can('crew.manage') && role !== 'owner') {
      items.push({ kind: 'approval', sev: 'info', ico: '🌴', title: 'Leave request to approve', sub: 'Crew · Kai · 3 days', go: 'crew' });
    }
    if (role === 'owner') {
      items.push({ kind: 'approval', sev: 'info', ico: '✍️', title: 'Vendor contract needs sign-off', sub: 'Vault · PostNord SLA', go: 'vault' });
    }

    // 3) a follow-up due (everyone gets one)
    const followPool = {
      'u-arvid': { ico: '🔁', title: 'Follow up with the board on runway', sub: 'Flagged 2 days ago', go: 'command' },
      'u-mira':  { ico: '🔁', title: 'Chase Kai on the budget sign-off', sub: 'Mentioned in #marketing', go: 'comms' },
      'u-ola':   { ico: '🔁', title: 'Follow up on 6 overdue invoices', sub: '18,400 kr · oldest 47 days', go: 'billing' },
      'u-sofia': { ico: '🔁', title: 'Re-engage the cold Malmö lead', sub: 'No reply in 9 days', go: 'pipeline' },
      'u-noah':  { ico: '🔁', title: 'Confirm staging passed with Lena', sub: 'AX-12 fix verification', go: 'projects' },
      'u-lena':  { ico: '🔁', title: 'Confirm PostNord pickup window', sub: 'Tomorrow · 3 shipments', go: 'orders' },
      'u-kai':   { ico: '🔁', title: 'Follow up with the agency on assets', sub: 'Midsummer creatives v2', go: 'signal' },
      'u-isa':   { ico: '🔁', title: 'Follow up on the billing question', sub: 'Forsberg · ticket reopened', go: 'inbox' }
    };
    const f = followPool[u.id];
    if (f) items.push(Object.assign({ kind: 'followup', sev: 'info' }, f));

    return items;
  }

  // today's meetings — a timeline keyed per person
  function buildMeetings(u) {
    const team = H.session.team;
    const byId = {}; team.forEach(p => byId[p.id] = p);
    const att = (ids) => ids.map(id => byId[id]).filter(Boolean);

    const pool = {
      'u-arvid': [
        { t: '09:30', title: 'Daily standup', who: ['u-mira', 'u-noah', 'u-lena'], len: '15m', live: true },
        { t: '11:00', title: 'Investor sync — Q2 metrics', who: ['u-mira', 'u-ola'], len: '45m' },
        { t: '14:00', title: 'Board review', who: ['u-mira', 'u-ola', 'u-sofia'], len: '60m' }
      ],
      'u-mira': [
        { t: '09:30', title: 'Daily standup', who: ['u-arvid', 'u-noah', 'u-lena'], len: '15m', live: true },
        { t: '10:30', title: '1:1 with Kai', who: ['u-kai'], len: '30m' },
        { t: '14:00', title: 'Board review', who: ['u-arvid', 'u-ola'], len: '60m' }
      ],
      'u-ola': [
        { t: '10:00', title: 'Fortnox month-end sync', who: ['u-arvid'], len: '30m' },
        { t: '13:00', title: 'Payroll review', who: ['u-mira'], len: '45m' },
        { t: '14:00', title: 'Board review', who: ['u-arvid', 'u-mira'], len: '60m' }
      ],
      'u-sofia': [
        { t: '09:30', title: 'Pipeline review', who: ['u-arvid'], len: '30m', live: true },
        { t: '11:30', title: 'Demo — Halland Bryggeri', who: ['u-isa'], len: '45m' },
        { t: '15:30', title: 'Forsberg handover', who: ['u-lena'], len: '30m' }
      ],
      'u-noah': [
        { t: '09:30', title: 'Daily standup', who: ['u-arvid', 'u-mira', 'u-lena'], len: '15m', live: true },
        { t: '13:30', title: 'AX-12 sync debug', who: ['u-lena'], len: '60m' },
        { t: '16:00', title: 'Release readiness', who: ['u-mira'], len: '30m' }
      ],
      'u-lena': [
        { t: '09:30', title: 'Daily standup', who: ['u-arvid', 'u-mira', 'u-noah'], len: '15m', live: true },
        { t: '12:00', title: 'PostNord logistics call', who: [], len: '30m' },
        { t: '13:30', title: 'AX-12 sync debug', who: ['u-noah'], len: '60m' }
      ],
      'u-kai': [
        { t: '10:30', title: '1:1 with Mira', who: ['u-mira'], len: '30m' },
        { t: '12:30', title: 'Agency creative review', who: [], len: '45m' },
        { t: '15:00', title: 'Campaign stand-up', who: ['u-sofia'], len: '20m' }
      ],
      'u-isa': [
        { t: '11:30', title: 'Demo support — Halland', who: ['u-sofia'], len: '45m' },
        { t: '14:30', title: 'CS weekly', who: ['u-mira'], len: '30m' },
        { t: '16:00', title: 'Portal onboarding — Lykke', who: [], len: '30m' }
      ]
    };
    return (pool[u.id] || [
      { t: '10:00', title: 'Team sync', who: ['u-arvid'], len: '30m' }
    ]).map(m => Object.assign({}, m, { attendees: att(m.who) }));
  }

  // unread that matter — top emails/DMs, routes to inbox or comms
  function buildUnread(u) {
    // prefer real seeded notifications for this user (inbox/comms-flavoured)
    let notes = [];
    try { notes = H.notifications.for(u.id) || []; } catch (e) { notes = []; }
    const mailish = notes.filter(n =>
      ['gmail', 'mention', 'approval', 'doc.signed', 'deal.won', 'portal', 'order', 'stock'].includes(n.eventType)
    ).slice(0, 4);

    if (mailish.length) {
      return mailish.map(n => ({
        ico: n.eventType === 'mention' ? '💬' : n.eventType === 'gmail' ? '✉️' : '🔔',
        title: n.title,
        sub: n.body,
        meta: n.read ? 'READ' : 'NEW',
        unread: !n.read,
        go: (n.link && n.link.moduleId) || 'inbox'
      }));
    }
    // fallback (should rarely trigger)
    return [
      { ico: '✉️', title: 'Inbox is quiet', sub: 'Nothing urgent waiting on you', meta: '—', unread: false, go: 'inbox' }
    ];
  }

  // my pulse — per-person KPIs for the day with sparklines
  function buildPulse(u) {
    const seed = (k) => u.id + ':' + k;
    const tasksDone = D.int(seed('tdone'), 3, 9);
    const tasksTotal = tasksDone + D.int(seed('topen'), 2, 5);
    const focusHours = (D.int(seed('focusx10'), 18, 52) / 10); // 1.8–5.2h
    const dealsTouched = D.int(seed('deals'), 1, 7);
    return [
      {
        label: 'TASKS DONE', value: tasksDone, sub: `of ${tasksTotal} today`,
        trend: '+' + D.int(seed('tt'), 1, 3), dir: 'up',
        spark: D.series(seed('s-tasks'), 12, 0, tasksDone, 0.4)
      },
      {
        label: 'FOCUS HOURS', value: focusHours, fmt: 'dec', sub: 'deep work logged',
        trend: '+' + (D.int(seed('ft'), 3, 9) / 10).toFixed(1), dir: 'up',
        spark: D.series(seed('s-focus'), 12, 1, Math.max(2, focusHours), 0.3)
      },
      {
        label: 'DEALS TOUCHED', value: dealsTouched, sub: 'moved or noted',
        trend: D.int(seed('dd'), 0, 1) ? '+' + D.int(seed('dt'), 1, 2) : '0', dir: D.int(seed('dd'), 0, 1) ? 'up' : 'flat',
        spark: D.series(seed('s-deals'), 12, 0, dealsTouched, 0.5)
      }
    ];
  }

  // company pulse — celebratory / notable events from the audit stream
  function buildCompanyPulse() {
    let evts = [];
    try { evts = H.audit.list({ limit: 40 }) || []; } catch (e) { evts = []; }
    const team = {};
    try { H.session.team.forEach(p => team[p.id] = p); } catch (e) {}
    const CELEBRATORY = /won|paid|created|succeeded|signed|launched|recorded|invited|promoted|accepted/i;
    const ICO = {
      'deal.won': '🎉', 'invoice.paid': '💰', 'payment.created': '💰',
      'deploy.succeeded': '🚀', 'doc.signed': '🖊️', 'campaign.launched': '📣',
      'meeting.recorded': '🎥', 'portal.invited': '🤝', 'role.changed': '⭐',
      'partner.created': '🤝', 'cost.added': '🧾', 'task.moved': '✅'
    };
    return evts
      .filter(e => CELEBRATORY.test(e.action || ''))
      .slice(0, 6)
      .map(e => ({
        ico: ICO[e.action] || '✨',
        summary: e.summary || e.action,
        amount: e.amount ? H.fmt.money(e.amount.value, '') + ' kr' : null,
        module: (e.context && e.context.module) || null,
        when: relTime(e.ts)
      }));
  }

  function relTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.round(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm';
    const h = Math.round(m / 60);
    if (h < 24) return h + 'h';
    return Math.round(h / 24) + 'd';
  }

  /* ── module registration ─────────────────────────────────────────────── */
  H.register({
    id: 'my-day',
    label: 'My Day',
    icon: '☀️',
    scope: 'personal',
    render(root) {
      /* read the acting person FRESH — the shell re-renders us on user switch */
      const u = H.session.user || (H.session.team && H.session.team[0]) || { id: '?', name: 'There', role: 'viewer' };
      const presence = H.session.presence || u.presence || 'available';
      const fname = firstName(u.name);

      const needs = buildNeedsYou(u);
      const meetings = buildMeetings(u);
      const unread = buildUnread(u);
      const pulse = buildPulse(u);
      const company = buildCompanyPulse();

      /* ───────── GREETING HEADER ───────── */
      const head = H.el(`
        <div class="view-head my-day-head">
          <div class="vh-title">
            <div class="vh-ico">${greetTimeEmoji()}</div>
            <div>
              <h1>${esc(greetingFor())}, ${esc(fname)}</h1>
              <p><span class="my-day-date">${esc(dateLine())}</span> · <span class="muted">${esc(u.title || 'Team')} · ${esc(H.session.org ? H.session.org.name : 'Northwind Labs AB')}</span></p>
            </div>
          </div>
          <div class="vh-actions my-day-presence-wrap"></div>
        </div>
      `);

      // presence selector + Focus toggle
      const pwrap = head.querySelector('.my-day-presence-wrap');
      const presBtn = H.el(`
        <button class="my-day-presence" data-act="presence" title="Set your presence">
          <span class="pdot ${PRESENCE[presence] ? PRESENCE[presence].dot : 'available'}"></span>
          <span class="my-day-presence-lbl">${esc(PRESENCE[presence] ? PRESENCE[presence].label : 'Available')}</span>
          <span class="my-day-caret">▾</span>
        </button>
      `);
      const presMenu = H.el(`<div class="my-day-presence-menu" hidden></div>`);
      PRESENCE_ORDER.forEach(key => {
        const meta = PRESENCE[key] || { label: key, dot: key };
        const opt = H.el(`
          <button class="my-day-presence-opt${key === presence ? ' active' : ''}" data-presence="${key}">
            <span class="pdot ${meta.dot}"></span><span>${esc(meta.label)}</span>
          </button>
        `);
        opt.addEventListener('click', () => {
          H.session.setPresence(key);
          H.audit.log({
            action: 'presence.changed', entityType: 'Person', entityId: u.id,
            summary: `${u.name} set presence to ${meta.label}`,
            after: { presence: key }, module: 'my-day'
          });
          H.toast('Presence set to ' + meta.label, key === 'focus' ? 'info' : 'success');
          presMenu.hidden = true;
          if (_openPresMenu === presMenu) _openPresMenu = null;
          // refresh the visible chip locally (shell also re-renders on the event)
          presBtn.querySelector('.pdot').className = 'pdot ' + meta.dot;
          presBtn.querySelector('.my-day-presence-lbl').textContent = meta.label;
          presMenu.querySelectorAll('.my-day-presence-opt').forEach(o =>
            o.classList.toggle('active', o.dataset.presence === key));
          syncFocusToggle();
        });
        presMenu.appendChild(opt);
      });
      presBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        presMenu.hidden = !presMenu.hidden;
        _openPresMenu = presMenu.hidden ? null : presMenu;
      });

      const focusBtn = H.el(`
        <button class="btn btn-sm my-day-focus" data-act="focus">
          <span class="my-day-focus-ico">◐</span><span class="my-day-focus-lbl">Focus</span>
        </button>
      `);
      function syncFocusToggle() {
        const on = (H.session.presence || presence) === 'focus';
        focusBtn.classList.toggle('btn-primary', on);
        focusBtn.classList.toggle('on', on);
        focusBtn.querySelector('.my-day-focus-lbl').textContent = on ? 'Focus on' : 'Focus';
      }
      focusBtn.addEventListener('click', () => {
        const next = (H.session.presence === 'focus') ? 'available' : 'focus';
        H.session.setPresence(next);
        H.audit.log({
          action: 'presence.changed', entityType: 'Person', entityId: u.id,
          summary: `${u.name} turned Focus ${next === 'focus' ? 'on' : 'off'}`,
          after: { presence: next }, module: 'my-day'
        });
        H.toast(next === 'focus' ? 'Focus mode on — notifications muted' : 'Focus mode off', next === 'focus' ? 'info' : 'success');
        // reflect on the presence chip too
        const meta = PRESENCE[next] || { label: next, dot: next };
        presBtn.querySelector('.pdot').className = 'pdot ' + meta.dot;
        presBtn.querySelector('.my-day-presence-lbl').textContent = meta.label;
        presMenu.querySelectorAll('.my-day-presence-opt').forEach(o =>
          o.classList.toggle('active', o.dataset.presence === next));
        syncFocusToggle();
      });

      const presHost = H.el(`<div class="my-day-presence-host"></div>`);
      presHost.appendChild(presBtn);
      presHost.appendChild(presMenu);
      pwrap.appendChild(presHost);
      pwrap.appendChild(focusBtn);
      syncFocusToggle();
      root.appendChild(head);

      /* ───────── ROW 1: NEEDS YOU (span-2) + TODAY'S MEETINGS ───────── */
      const row1 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // Needs you today
      const urgent = needs.filter(n => n.sev === 'bad' || n.sev === 'warn').length;
      const needCard = H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">⚡</span> Needs you today</h3>
            <span class="badge ${urgent ? 'bad' : 'warn'}">${needs.length}</span>
          </div>
          <div class="my-day-attn-stack"></div>
        </div>
      `);
      const stack = needCard.querySelector('.my-day-attn-stack');
      const KIND_LABEL = { task: 'TASK', approval: 'APPROVAL', followup: 'FOLLOW-UP' };
      needs.forEach(n => {
        const node = H.el(`
          <div class="attn ${n.sev === 'info' ? 'info' : n.sev}">
            <span class="a-ico">${n.ico}</span>
            <div class="a-body">
              <div class="a-title">${esc(n.title)}</div>
              <div class="a-sub"><span class="my-day-kind">${KIND_LABEL[n.kind] || ''}</span>${esc(n.sub)}</div>
            </div>
            <button class="btn btn-sm" data-go="${esc(n.go)}">Open</button>
          </div>
        `);
        node.querySelector('[data-go]').addEventListener('click', () => H.show(n.go));
        stack.appendChild(node);
      });
      if (!needs.length) {
        stack.appendChild(H.el(`<div class="my-day-empty">🎉 Nothing needs you right now — enjoy the calm.</div>`));
      }
      row1.appendChild(needCard);

      // Today's meetings
      const meetCard = H.el(`
        <div class="card my-day-meetings">
          <div class="card-head">
            <h3><span class="hico">📅</span> Today's meetings</h3>
            <span class="ch-meta">${meetings.length} TODAY</span>
          </div>
          <div class="my-day-timeline"></div>
          <button class="btn btn-ghost btn-sm btn-block mt-sm" data-act="all-meetings">Open calendar →</button>
        </div>
      `);
      const tl = meetCard.querySelector('.my-day-timeline');
      meetings.forEach(m => {
        const avs = m.attendees.slice(0, 4).map(avatarFor).join('');
        const extra = m.attendees.length > 4 ? `<span class="avatar my-day-av-more">+${m.attendees.length - 4}</span>` : '';
        const node = H.el(`
          <div class="my-day-slot${m.live ? ' live' : ''}">
            <div class="my-day-slot-time">
              <span class="my-day-time">${esc(m.t)}</span>
              <span class="my-day-len">${esc(m.len)}</span>
            </div>
            <div class="my-day-slot-line"><span class="my-day-node"></span></div>
            <div class="my-day-slot-body">
              <div class="my-day-slot-title">${esc(m.title)}${m.live ? '<span class="pill ok my-day-livepill">LIVE</span>' : ''}</div>
              <div class="avatar-stack my-day-attendees">${avs}${extra}${m.attendees.length ? '' : '<span class="muted my-day-solo">Solo / external</span>'}</div>
            </div>
            <button class="btn btn-sm ${m.live ? 'btn-primary' : ''} my-day-join" data-act="join">Join</button>
          </div>
        `);
        node.querySelector('[data-act="join"]').addEventListener('click', () => {
          H.toast('Opening "' + m.title + '"…', 'info');
          H.show('meetings');
        });
        tl.appendChild(node);
      });
      if (!meetings.length) {
        tl.appendChild(H.el(`<div class="my-day-empty">No meetings today — a clear runway.</div>`));
      }
      meetCard.querySelector('[data-act="all-meetings"]').addEventListener('click', () => H.show('meetings'));
      row1.appendChild(meetCard);
      root.appendChild(row1);

      /* ───────── ROW 2: MY PULSE (span-2) + MY UNREAD ───────── */
      const row2 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      // My pulse
      const pulseCard = H.el(`
        <div class="card span-2 glow">
          <div class="card-head">
            <h3><span class="hico">🫀</span> My pulse</h3>
            <span class="ch-meta">TODAY</span>
          </div>
          <div class="my-day-pulse grid cols-3"></div>
        </div>
      `);
      const pulseGrid = pulseCard.querySelector('.my-day-pulse');
      pulse.forEach(p => {
        const isDec = p.fmt === 'dec';
        const tile = H.el(`
          <div class="kpi my-day-kpi">
            <div class="kpi-label">${esc(p.label)}</div>
            <div class="kpi-value sm" data-count="${p.value}"${isDec ? ' data-dp="1"' : ' data-fmt="num"'}>0</div>
            <div class="kpi-sub muted">${esc(p.sub)}</div>
            <div class="row between mt-sm">
              <span class="kpi-trend ${p.dir}">${esc(p.trend)}</span>
            </div>
            <div class="spark">${H.charts.spark(p.spark)}</div>
          </div>
        `);
        pulseGrid.appendChild(tile);
      });
      row2.appendChild(pulseCard);

      // My unread that matter
      const unreadCount = unread.filter(x => x.unread).length;
      const unreadCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">✉️</span> Unread that matter</h3>
            <span class="badge ${unreadCount ? '' : 'warn'}">${unreadCount || 0}</span>
          </div>
          <div class="list my-day-unread"></div>
          <div class="row gap-sm mt-sm">
            <button class="btn btn-ghost btn-sm fill" data-act="inbox">Inbox</button>
            <button class="btn btn-ghost btn-sm fill" data-act="comms">Messages</button>
          </div>
        </div>
      `);
      const ulist = unreadCard.querySelector('.my-day-unread');
      unread.forEach(m => {
        const node = H.el(`
          <div class="list-item my-day-mail${m.unread ? ' unread' : ''}">
            <div class="li-ico">${m.ico}</div>
            <div class="li-body">
              <div class="li-title">${esc(m.title)}</div>
              <div class="li-sub">${esc(m.sub)}</div>
            </div>
            <span class="li-meta">${esc(m.meta)}</span>
          </div>
        `);
        node.addEventListener('click', () => H.show(m.go || 'inbox'));
        ulist.appendChild(node);
      });
      unreadCard.querySelector('[data-act="inbox"]').addEventListener('click', () => H.show('inbox'));
      unreadCard.querySelector('[data-act="comms"]').addEventListener('click', () => H.show('comms'));
      row2.appendChild(unreadCard);
      root.appendChild(row2);

      /* ───────── ROW 3: COMPANY PULSE (mini-feed) ───────── */
      const pulseFeed = H.el(`
        <div class="card my-day-company">
          <div class="card-head">
            <h3><span class="hico">🎊</span> Company pulse</h3>
            <span class="pill ok my-day-pill-live">LIVE</span>
          </div>
          <div class="list my-day-feed"></div>
          <button class="btn btn-ghost btn-sm btn-block mt-sm" data-act="audit">See the full audit trail →</button>
        </div>
      `);
      const feed = pulseFeed.querySelector('.my-day-feed');
      company.forEach(c => {
        const node = H.el(`
          <div class="list-item my-day-feed-item">
            <div class="li-ico">${c.ico}</div>
            <div class="li-body">
              <div class="li-title">${esc(c.summary)}</div>
              ${c.amount ? `<div class="li-sub"><span class="my-day-amount">${esc(c.amount)}</span></div>` : ''}
            </div>
            <span class="li-meta">${esc(c.when)}</span>
          </div>
        `);
        if (c.module) node.addEventListener('click', () => { if (H._internal.byId[c.module]) H.show(c.module); });
        feed.appendChild(node);
      });
      if (!company.length) {
        feed.appendChild(H.el(`<div class="my-day-empty">A quiet day across the company so far.</div>`));
      }
      pulseFeed.querySelector('[data-act="audit"]').addEventListener('click', () => H.show('audit'));
      root.appendChild(pulseFeed);

      // count-ups run by the shell after render(); nothing else needed.
    }
  });

  // a tiny time-of-day emoji for the header tile
  function greetTimeEmoji() {
    const h = (typeof Date !== 'undefined') ? new Date().getHours() : 9;
    if (h < 5) return '🌙';
    if (h < 12) return '☀️';
    if (h < 18) return '🌤️';
    return '🌇';
  }
})();
