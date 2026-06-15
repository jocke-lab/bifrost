/* ============================================================================
   calendar.js — Calendar & Schedule. The month at a glance — PERSONAL scope.
   Follows the HELM module contract (see command.js for the canonical shape):
     • register({id,label,icon,scope:'personal',render})
     • read HELM.session.user FRESH at the top of render() — the shell re-renders
       this module on a user switch (scope:'personal'), so just build for that
       person; different people see different events.
     • build DOM with H.el(...) using ONLY documented classes + .calendar-* tweaks
     • deterministic data via H.data (no Math.random / no Date at eval)
     • wire every button to H.toast / H.show / HELM.audit.log / local state
   Sections: "Connected as" chip → Integrations · New-meeting create flow ·
   month grid (7×5) with color-coded per-user event chips · today highlighted ·
   today's agenda · upcoming meetings · stat-rows · deadlines (attn) ·
   event-colour legend · calendar sources · two charts.
   ========================================================================== */
(function () {
  const H = window.HELM;

  // tiny escaper for user-supplied / team-derived strings (no public H.esc)
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  H.register({
    id: 'calendar',
    label: 'Calendar',
    icon: '📅',
    scope: 'personal',
    render(root) {
      const D = H.data;

      /* read the acting person FRESH — the shell re-renders us on user switch */
      const u = H.session.user || (H.session.team && H.session.team[0]) ||
        { id: 'u-arvid', name: 'Arvid Arvidsson', email: 'arvid@northwind-helm.se', role: 'owner', title: 'Founder / CEO', connections: { google: true } };
      const team = (H.session.team || []).filter(p => p.id !== u.id);
      const googleOn = !!(u.connections && u.connections.google);
      const canMeet = H.session.can ? H.session.can('partners.write') : true; // 'member'+ may create meetings

      /* ── event taxonomy (colour-coded by type) ───────────────────────── */
      const TYPES = {
        meeting:  { label: 'Meeting',  color: 'var(--accent2)' },
        deadline: { label: 'Deadline', color: 'var(--danger)' },
        focus:    { label: 'Focus',    color: 'var(--accent3)' },
        finance:  { label: 'Finance',  color: 'var(--warn)' },
        personal: { label: 'Personal', color: 'var(--accent1)' }
      };
      const chip = (t, txt) =>
        `<span class="calendar-chip" style="--cc:${TYPES[t].color}" title="${esc(TYPES[t].label)}: ${esc(txt)}">${esc(txt)}</span>`;

      /* ── month model — JUNE 2026 (deterministic, no wall-clock) ────────
         June 1 2026 is a Monday. Week starts Monday (EU). 30 days → 5 rows. */
      const MONTH = 'June 2026';
      const TODAY = 15;                 // highlighted "today" cell
      const FIRST_DOW = 0;              // 0 = Monday column (Mon-first grid)
      const DAYS = 30;
      const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

      /* ── PER-USER events — deterministic, different people see different
            calendars. A shared company spine (standups, midsommar, month
            close) plus a role-flavoured personal layer keyed by user id. */
      const SHARED = {
        2:  [{ t: 'meeting', x: 'Standup' }],
        8:  [{ t: 'meeting', x: 'Standup' }],
        15: [{ t: 'meeting', x: 'All-hands' }],
        22: [{ t: 'meeting', x: 'Standup' }],
        26: [{ t: 'personal', x: 'Midsommar' }],
        29: [{ t: 'meeting', x: 'Standup' }],
        30: [{ t: 'finance', x: 'Month close' }]
      };
      // role → the kind of day this person tends to fill
      const ROLE_LAYER = {
        owner: {
          4:  [{ t: 'meeting', x: 'Northwind' }, { t: 'deadline', x: 'Q2 deck' }],
          11: [{ t: 'deadline', x: 'Investor' }],
          15: [{ t: 'meeting', x: 'Investor sync' }, { t: 'focus', x: 'Q3 plan' }],
          18: [{ t: 'meeting', x: 'Klarna' }],
          25: [{ t: 'meeting', x: 'Board mtg' }]
        },
        admin: {
          10: [{ t: 'focus', x: 'Roadmap' }, { t: 'meeting', x: '1:1 Sara' }],
          15: [{ t: 'meeting', x: 'Ops sync' }, { t: 'focus', x: 'Hiring plan' }],
          17: [{ t: 'meeting', x: 'Vendor review' }],
          24: [{ t: 'meeting', x: 'PostNord' }, { t: 'focus', x: 'Policy' }],
          30: [{ t: 'deadline', x: 'OKR review' }]
        },
        finance: {
          9:  [{ t: 'finance', x: 'Payroll' }],
          15: [{ t: 'finance', x: 'Payroll cutoff' }, { t: 'finance', x: 'VAT draft' }],
          16: [{ t: 'deadline', x: 'Tax filing' }],
          19: [{ t: 'finance', x: 'Stripe payout' }],
          23: [{ t: 'deadline', x: 'Moms report' }],
          25: [{ t: 'finance', x: 'Invoices' }]
        },
        member: {
          3:  [{ t: 'focus', x: 'Deep work' }],
          10: [{ t: 'meeting', x: '1:1' }, { t: 'focus', x: 'Build' }],
          15: [{ t: 'meeting', x: 'Pipeline' }, { t: 'focus', x: 'Demo prep' }],
          18: [{ t: 'focus', x: 'Deep work' }, { t: 'meeting', x: 'Lykke demo' }],
          24: [{ t: 'focus', x: 'Specs' }]
        },
        viewer: {
          5:  [{ t: 'personal', x: 'Onboarding' }],
          12: [{ t: 'meeting', x: 'CS sync' }],
          15: [{ t: 'meeting', x: 'Support triage' }, { t: 'focus', x: 'Macros' }],
          17: [{ t: 'meeting', x: 'QA review' }]
        }
      };
      // a small personal sprinkle keyed off the user id so two members still differ
      const personalDay = D.int('cal-pd-' + u.id, 3, 27);
      const personalKind = D.pick('cal-pk-' + u.id, ['Gym', 'Lunch', 'Off early', 'Dentist', 'Run']);

      const EV = {};
      const put = (day, ev) => { (EV[day] = EV[day] || []).push(ev); };
      Object.keys(SHARED).forEach(d => SHARED[d].forEach(e => put(+d, e)));
      const layer = ROLE_LAYER[u.role] || ROLE_LAYER.member;
      Object.keys(layer).forEach(d => layer[d].forEach(e => put(+d, e)));
      put(personalDay, { t: 'personal', x: personalKind });

      /* ── deterministic charts data (per-user series names) ─────────────── */
      const loadBars = [3, 5, 2, 4, 6, 1, 0].map((v, i) => ({
        label: DOW[i].slice(0, 1),
        value: D.int('cal-load-' + u.id + '-' + i, Math.max(0, v - 2), v + 2),
        color: i >= 5 ? 'var(--accent3)' : undefined
      }));
      const focusSpark = D.series('cal-focus-' + u.id, 14, 12, 26, 0.22);
      const mixDonut = [
        { label: 'Meetings', value: D.int('cal-mix-mt-' + u.id, 12, 22), color: TYPES.meeting.color },
        { label: 'Focus',    value: D.int('cal-mix-fc-' + u.id, 6, 14),  color: TYPES.focus.color },
        { label: 'Finance',  value: D.int('cal-mix-fi-' + u.id, 2, 8),   color: TYPES.finance.color },
        { label: 'Personal', value: D.int('cal-mix-pe-' + u.id, 3, 7),   color: TYPES.personal.color }
      ];
      const bookedH = mixDonut.reduce((a, b) => a + b.value, 0);

      /* count the acting user's own week (15–21) for the stat-rows */
      let wkMeetings = 0, wkDeadlines = 0;
      for (let d = 15; d <= 21; d++) (EV[d] || []).forEach(e => {
        if (e.t === 'meeting') wkMeetings++; if (e.t === 'deadline') wkDeadlines++;
      });

      /* ── VIEW HEAD ─────────────────────────────────────────────────────── */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">📅</div>
            <div>
              <h1>Calendar</h1>
              <p>${esc(u.name.split(' ')[0])}'s month at a glance — meetings, focus blocks and every deadline on one deck.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="calendar-conn" data-act="conn" title="Manage Google Calendar in Integrations">
              <span class="calendar-conn-dot${googleOn ? ' on' : ''}"></span>
              <span class="calendar-conn-txt">${googleOn ? 'Connected as ' : 'Connect '}<b>${esc(u.email || u.name)}</b></span>
              <span class="calendar-conn-go">→</span>
            </button>
            <button class="btn btn-ghost btn-sm" data-act="sync">⟳ Sync</button>
            <button class="btn btn-primary btn-sm" data-act="new">＋ New meeting</button>
          </div>
        </div>
      `));

      /* ── NEW-MEETING PANEL (collapsed by default) ──────────────────────── */
      const newPanel = H.el(`
        <div class="card calendar-newmtg" hidden style="margin-bottom:var(--gap)">
          <div class="card-head">
            <h3><span class="hico">🎥</span> New meeting</h3>
            <span class="ch-meta">SCHEDULE · RECORD · BRIEF</span>
          </div>
          <div class="calendar-newmtg-grid">
            <label class="calendar-field calendar-field--full">
              <span class="calendar-field-lbl">Title</span>
              <input class="calendar-input" data-f="title" type="text" placeholder="e.g. Northwind renewal sync" maxlength="80" />
            </label>
            <label class="calendar-field">
              <span class="calendar-field-lbl">When</span>
              <select class="calendar-input" data-f="time"></select>
            </label>
            <label class="calendar-field">
              <span class="calendar-field-lbl">Call provider</span>
              <select class="calendar-input" data-f="provider">
                <option value="Meet">📹 Google Meet</option>
                <option value="Zoom">🔵 Zoom</option>
                <option value="Slack">💬 Slack huddle</option>
              </select>
            </label>
            <div class="calendar-field calendar-field--full">
              <span class="calendar-field-lbl">Attendees <span class="muted calendar-att-count">0 selected</span></span>
              <div class="calendar-attendees"></div>
            </div>
          </div>
          <div class="row between wrap calendar-newmtg-foot">
            <button class="calendar-rec" data-f="record" role="switch" aria-checked="true">
              <span class="calendar-rec-tog on"><i></i></span>
              <span class="calendar-rec-lbl">🔴 Record &amp; transcribe</span>
            </button>
            <div class="row" style="gap:8px">
              <button class="btn btn-ghost btn-sm" data-act="mtg-cancel">Cancel</button>
              <button class="btn btn-primary btn-sm" data-act="mtg-create">Create meeting</button>
            </div>
          </div>
        </div>
      `);
      // time options (deterministic slots, today + next days)
      const timeSel = newPanel.querySelector('[data-f="time"]');
      [
        ['today-10', 'Today · 10:00'], ['today-14', 'Today · 14:00'], ['today-16', 'Today · 16:00'],
        ['tue-10', 'Tue 16 · 10:00'], ['wed-11', 'Wed 17 · 11:30'], ['thu-13', 'Thu 18 · 13:00'],
        ['fri-09', 'Fri 19 · 09:00']
      ].forEach(([v, l]) => timeSel.appendChild(H.el(`<option value="${v}">${esc(l)}</option>`)));
      // attendee multi-select chips (the team, minus the acting user)
      const attWrap = newPanel.querySelector('.calendar-attendees');
      const attCount = newPanel.querySelector('.calendar-att-count');
      const picked = new Set();
      const refreshAtt = () => { attCount.textContent = `${picked.size} selected`; };
      team.forEach(p => {
        const ini = (H.data.initials ? H.data.initials(p.name) : (p.avatar || '?'));
        const c = H.el(`
          <button class="calendar-att" data-uid="${esc(p.id)}" aria-pressed="false" title="${esc(p.title || '')}">
            <span class="avatar sq">${esc(ini)}</span>
            <span class="calendar-att-name">${esc(p.name.split(' ')[0])}</span>
          </button>
        `);
        c.addEventListener('click', () => {
          const on = c.getAttribute('aria-pressed') === 'true';
          c.setAttribute('aria-pressed', String(!on));
          c.classList.toggle('on', !on);
          if (on) picked.delete(p.id); else picked.add(p.id);
          refreshAtt();
        });
        attWrap.appendChild(c);
      });
      // record toggle
      const recBtn = newPanel.querySelector('[data-f="record"]');
      let recordOn = true;
      recBtn.addEventListener('click', () => {
        recordOn = !recordOn;
        recBtn.setAttribute('aria-checked', String(recordOn));
        recBtn.querySelector('.calendar-rec-tog').classList.toggle('on', recordOn);
        recBtn.querySelector('.calendar-rec-lbl').innerHTML = recordOn
          ? '🔴 Record &amp; transcribe' : '⚪ Record off';
      });
      // gate create when the role can't
      const createBtn = newPanel.querySelector('[data-act="mtg-create"]');
      if (!canMeet) {
        createBtn.disabled = true;
        createBtn.title = 'Needs member role';
      }
      root.appendChild(newPanel);

      const openPanel = () => {
        newPanel.hidden = false;
        const ti = newPanel.querySelector('[data-f="title"]');
        if (ti) ti.focus();
      };
      newPanel.querySelector('[data-act="mtg-cancel"]').addEventListener('click', () => {
        newPanel.hidden = true;
      });
      createBtn.addEventListener('click', () => {
        if (!canMeet) return;
        const title = (newPanel.querySelector('[data-f="title"]').value || '').trim() || 'Untitled meeting';
        const whenLbl = timeSel.options[timeSel.selectedIndex].text;
        const provider = newPanel.querySelector('[data-f="provider"]').value;
        const provLbl = { Meet: 'Google Meet', Zoom: 'Zoom', Slack: 'Slack huddle' }[provider] || provider;
        const attendees = [u.id, ...picked];
        const mtgId = 'mt-' + D.int('cal-newmtg-' + u.id + '-' + title, 1000, 9999);

        // seed the meeting + audit it (data-changing action)
        H.audit.log({
          action: 'meeting.created',
          entityType: 'Meeting',
          entityId: mtgId,
          summary: `${u.name} scheduled "${title}" (${provLbl}, ${whenLbl})${recordOn ? ' — will record & transcribe' : ''}`,
          links: [{ entityType: 'Meeting', entityId: mtgId }],
          after: { title, when: whenLbl, provider, record: recordOn, attendees: attendees.length },
          module: 'calendar'
        });

        // success toast (the kit owns the node; the panel below carries the
        // persistent "Open Meetings" jump affordance)
        H.toast(
          `Meeting created — ${recordOn ? 'will record' : 'no recording'}`,
          recordOn ? 'success' : 'info'
        );

        // drop a persistent confirmation row into the panel with the jump button
        const done = H.el(`
          <div class="attn info calendar-newmtg-done">
            <span class="a-ico">✅</span>
            <div class="a-body">
              <div class="a-title">${esc(title)}</div>
              <div class="a-sub">${esc(whenLbl)} · ${esc(provLbl)} · ${attendees.length} attendee${attendees.length === 1 ? '' : 's'}${recordOn ? ' · recording on' : ''}</div>
            </div>
            <button class="btn btn-sm" data-act="go-meetings">Open Meetings →</button>
          </div>
        `);
        done.querySelector('[data-act="go-meetings"]').addEventListener('click', () => H.show('meetings'));
        // replace any prior confirmation, keep one
        const prev = newPanel.querySelector('.calendar-newmtg-done');
        if (prev) prev.remove();
        newPanel.appendChild(done);

        // reset the form for the next one
        newPanel.querySelector('[data-f="title"]').value = '';
        picked.clear();
        attWrap.querySelectorAll('.calendar-att').forEach(c => { c.setAttribute('aria-pressed', 'false'); c.classList.remove('on'); });
        refreshAtt();
      });

      /* ── ROW 1: MONTH GRID (span 2) + side column (legend + stats) ─────── */
      const row1 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      /* — the big month grid card — */
      const calCard = H.el(`
        <div class="card span-2 flush calendar-card">
          <div class="calendar-bar">
            <div class="row" style="gap:9px">
              <button class="btn btn-sm btn-ghost calendar-nav" data-nav="prev" aria-label="Previous month">‹</button>
              <h3 class="calendar-month">${MONTH}</h3>
              <button class="btn btn-sm btn-ghost calendar-nav" data-nav="next" aria-label="Next month">›</button>
            </div>
            <div class="row" style="gap:7px">
              <button class="btn btn-sm calendar-nav calendar-today-btn" data-nav="today">Today</button>
              <div class="calendar-segs">
                <button class="calendar-seg active" data-view="month">Month</button>
                <button class="calendar-seg" data-view="week">Week</button>
                <button class="calendar-seg" data-view="day">Day</button>
              </div>
            </div>
          </div>
          <div class="calendar-dow">${DOW.map(d => `<span>${d}</span>`).join('')}</div>
          <div class="calendar-grid"></div>
        </div>
      `);

      const gridEl = calCard.querySelector('.calendar-grid');
      // leading blanks
      for (let b = 0; b < FIRST_DOW; b++) {
        gridEl.appendChild(H.el(`<div class="calendar-cell calendar-cell--mute"></div>`));
      }
      for (let day = 1; day <= DAYS; day++) {
        const evs = EV[day] || [];
        const colIdx = (FIRST_DOW + day - 1) % 7;
        const isWeekend = colIdx >= 5;
        const isToday = day === TODAY;
        const chips = evs.slice(0, 3).map(e => chip(e.t, e.x)).join('');
        const more = evs.length > 3 ? `<span class="calendar-more">+${evs.length - 3}</span>` : '';
        const cell = H.el(`
          <div class="calendar-cell${isToday ? ' calendar-cell--today' : ''}${isWeekend ? ' calendar-cell--weekend' : ''}" data-day="${day}" tabindex="0" role="button">
            <div class="calendar-daynum">${day}${isToday ? '<span class="calendar-today-dot"></span>' : ''}</div>
            <div class="calendar-chips">${chips}${more}</div>
          </div>
        `);
        const openDay = () => {
          const n = evs.length;
          H.toast(`${MONTH.split(' ')[0]} ${day} · ${n} event${n === 1 ? '' : 's'}${n ? ' — ' + evs.map(e => e.x).join(', ') : ' (open day)'}`, n ? 'info' : 'success');
        };
        cell.addEventListener('click', openDay);
        cell.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDay(); } });
        gridEl.appendChild(cell);
      }
      row1.appendChild(calCard);

      /* — side column: legend + this-week stat-rows + week-load mini chart — */
      const side = H.el(`<div class="col" style="gap:var(--gap)"></div>`);

      const legendCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🎨</span> Legend</h3>
            <span class="ch-meta">EVENT TYPES</span>
          </div>
          <div class="calendar-legend"></div>
        </div>
      `);
      const legendWrap = legendCard.querySelector('.calendar-legend');
      Object.keys(TYPES).forEach(k => {
        legendWrap.appendChild(H.el(`
          <span class="calendar-legend-item">
            <i style="background:${TYPES[k].color}"></i>${TYPES[k].label}
          </span>
        `));
      });
      side.appendChild(legendCard);

      const statsCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">📊</span> This Week</h3>
            <span class="ch-meta">W25 · 15–21 JUN</span>
          </div>
          <div class="calendar-stats"></div>
          <div class="section-title" style="margin-top:14px">WEEKDAY LOAD</div>
          <div class="chart" style="height:108px">
            ${H.charts.bars(loadBars, { height: 108 })}
          </div>
        </div>
      `);
      const statsWrap = statsCard.querySelector('.calendar-stats');
      [
        ['Meetings this week', String(mixDonut[0].value), ''],
        ['Focus hours', mixDonut[1].value + 'h', ''],
        ['Deadlines', String(Math.max(wkDeadlines, 1)), 'warn'],
        ['Free slots', String(D.int('cal-free-' + u.id, 4, 9)), 'ok']
      ].forEach(([label, val, sev]) => {
        statsWrap.appendChild(H.el(`
          <div class="stat-row">
            <span class="sr-label">${label}</span>
            <span class="sr-val${sev ? ' calendar-sr-' + sev : ''}">${val}</span>
          </div>
        `));
      });
      side.appendChild(statsCard);
      row1.appendChild(side);
      root.appendChild(row1);

      /* ── ROW 2: Today's agenda + Upcoming meetings + Time mix donut ────── */
      const row2 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      /* — Today's agenda (time · title · type pill) — built from this user's
           own day-15 events plus a couple of personal anchors — */
      const todayEv = (EV[TODAY] || []);
      const AGENDA = [['08:30', 'Daily standup', 'meeting']]
        .concat(todayEv.map((e, i) => [['09:30', '11:00', '13:00', '15:30', '17:00'][i] || '16:30', e.x + (e.t === 'focus' ? ' (focus block)' : ''), e.t]))
        .slice(0, 6);
      const agendaCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">📋</span> Today · Mon 15 Jun</h3>
            <span class="badge">${AGENDA.length}</span>
          </div>
          <div class="calendar-agenda"></div>
        </div>
      `);
      const agendaWrap = agendaCard.querySelector('.calendar-agenda');
      AGENDA.forEach(([time, title, type], i) => {
        const isNow = i === 1;
        const tc = TYPES[type] || TYPES.meeting;
        const node = H.el(`
          <div class="calendar-slot${isNow ? ' calendar-slot--now' : ''}">
            <span class="calendar-slot-time">${esc(time)}</span>
            <span class="calendar-slot-rail" style="--cc:${tc.color}"></span>
            <div class="calendar-slot-body">
              <div class="calendar-slot-title">${esc(title)}</div>
              <span class="tag" style="color:${tc.color};border-color:color-mix(in srgb,${tc.color} 35%,transparent)">${tc.label}</span>
            </div>
            <button class="btn btn-sm btn-ghost calendar-slot-go" aria-label="Open">→</button>
          </div>
        `);
        node.querySelector('.calendar-slot-go').addEventListener('click', () =>
          H.toast(`Opening "${title}" · ${time}`, 'info'));
        agendaWrap.appendChild(node);
      });
      row2.appendChild(agendaCard);

      /* — Upcoming meetings list — */
      const upCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🗓️</span> Upcoming Meetings</h3>
            <span class="ch-meta">NEXT 7 DAYS</span>
          </div>
          <div class="list"></div>
        </div>
      `);
      const upList = upCard.querySelector('.list');
      [
        ['NW', 'Northwind AB — renewal', 'Tue 16 · 10:00 · Google Meet', 'info'],
        ['LS', 'Lykke Studios — demo', 'Wed 17 · 14:00 · On-site', 'ok'],
        ['KL', 'Klarna integration call', 'Thu 18 · 11:30 · Zoom', 'info'],
        ['FK', 'Forsberg Konsult — kickoff', 'Fri 19 · 09:00 · Phone', 'ok'],
        ['BD', 'Board meeting — Q2', 'Thu 25 · 13:00 · HQ Norrköping', 'warn']
      ].forEach(([ini, title, sub, sev]) => {
        const node = H.el(`
          <div class="list-item calendar-up">
            <div class="avatar sq">${ini}</div>
            <div class="li-body">
              <div class="li-title">${title}</div>
              <div class="li-sub">${sub}</div>
            </div>
            <button class="btn btn-sm calendar-join" data-sev="${sev}">Join</button>
          </div>
        `);
        node.querySelector('.calendar-join').addEventListener('click', () =>
          H.toast(`Joining "${title}"…`, 'success'));
        upList.appendChild(node);
      });
      row2.appendChild(upCard);

      /* — Time mix donut + focus trend spark — */
      const mixCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">⏱️</span> Time Mix</h3>
            <span class="ch-meta">THIS WEEK · HRS</span>
          </div>
          <div class="calendar-mix">
            <div class="chart calendar-donut" style="height:150px">
              ${H.charts.donut(mixDonut, { size: 150, thickness: 20, center: { value: bookedH + 'h', label: 'BOOKED' } })}
            </div>
            <div class="calendar-mix-legend"></div>
          </div>
          <div class="section-title" style="margin-top:6px">FOCUS HOURS · 14D</div>
          <div class="spark">${H.charts.spark(focusSpark, { height: 38 })}</div>
        </div>
      `);
      const mixLeg = mixCard.querySelector('.calendar-mix-legend');
      mixDonut.forEach(s => {
        mixLeg.appendChild(H.el(`
          <div class="calendar-mix-row">
            <span class="calendar-mix-dot" style="background:${s.color}"></span>
            <span class="calendar-mix-lbl">${s.label}</span>
            <span class="calendar-mix-val">${s.value}h</span>
          </div>
        `));
      });
      row2.appendChild(mixCard);
      root.appendChild(row2);

      /* ── ROW 3: Deadlines (attn rows, span 2) + Quick add / calendars ──── */
      const row3 = H.el(`<div class="grid cols-3"></div>`);

      const deadCard = H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">⚠️</span> Deadlines</h3>
            <span class="badge bad">4</span>
          </div>
          <div class="col" style="gap:10px"></div>
        </div>
      `);
      const deadWrap = deadCard.querySelector('.col');
      const DEADLINES = [
        ['bad', '🧾', 'Moms (VAT) report due', 'Skatteverket · in 8 days · Q2 period', 'Prepare'],
        ['warn', '📊', 'Q2 investor deck', 'Board pack · in 11 days · 3 slides left', 'Open'],
        ['warn', '🗂️', 'OKR review — month close', 'Team · end of June · self-assessments out', 'Remind'],
        ['info', '📦', 'PostNord rate renewal', 'Logistics · in 14 days · auto-renews', 'Review']
      ];
      DEADLINES.forEach(([sev, ico, title, sub, cta]) => {
        const node = H.el(`
          <div class="attn ${sev}">
            <span class="a-ico">${ico}</span>
            <div class="a-body"><div class="a-title">${title}</div><div class="a-sub">${sub}</div></div>
            <button class="btn btn-sm">${cta}</button>
          </div>
        `);
        node.querySelector('.btn').addEventListener('click', () =>
          H.toast(`${cta}: ${title}`, sev === 'bad' ? 'warn' : 'info'));
        deadWrap.appendChild(node);
      });
      row3.appendChild(deadCard);

      const calsCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🔗</span> Calendars</h3>
            <span class="pill ${googleOn ? 'ok' : 'warn'}" style="font-size:9px">● ${googleOn ? 'SYNCED' : 'OFFLINE'}</span>
          </div>
          <div class="calendar-sources"></div>
          <button class="btn btn-block btn-sm calendar-quickadd" style="margin-top:13px">＋ New meeting</button>
          <button class="btn btn-block btn-ghost btn-sm calendar-schedlink" style="margin-top:8px">🔗 Manage in Integrations</button>
        </div>
      `);
      const srcWrap = calsCard.querySelector('.calendar-sources');
      [
        [`${esc(u.name.split(' ')[0])} · Google`, 'var(--accent2)', googleOn],
        ['Finance · Fortnox', 'var(--warn)', true],
        ['Personal', 'var(--accent1)', true],
        ['Team — shared', 'var(--accent3)', false]
      ].forEach(([name, color, on]) => {
        const node = H.el(`
          <div class="calendar-source">
            <span class="calendar-source-dot" style="background:${color}"></span>
            <span class="calendar-source-name">${name}</span>
            <span class="calendar-toggle${on ? ' on' : ''}" role="switch" aria-checked="${on}" tabindex="0"><i></i></span>
          </div>
        `);
        const tog = node.querySelector('.calendar-toggle');
        const flip = () => {
          const nowOn = tog.classList.toggle('on');
          tog.setAttribute('aria-checked', String(nowOn));
          H.toast(`${name} ${nowOn ? 'shown' : 'hidden'} on calendar`, nowOn ? 'success' : 'info');
        };
        tog.addEventListener('click', flip);
        tog.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
        srcWrap.appendChild(node);
      });
      row3.appendChild(calsCard);
      root.appendChild(row3);

      /* ── wire view-head + segmented + month-nav actions ────────────────── */
      root.querySelector('[data-act="new"]').addEventListener('click', openPanel);
      root.querySelector('[data-act="conn"]').addEventListener('click', () => H.show('integrations'));
      root.querySelector('[data-act="sync"]').addEventListener('click', () => {
        H.toast('Syncing Google Calendar…', 'info');
        setTimeout(() => H.toast('Calendar up to date', 'success'), 1000);
      });
      calsCard.querySelector('.calendar-quickadd').addEventListener('click', openPanel);
      calsCard.querySelector('.calendar-schedlink').addEventListener('click', () => H.show('integrations'));

      root.querySelectorAll('.calendar-nav').forEach(b => b.addEventListener('click', () => {
        const dir = b.dataset.nav;
        H.toast(dir === 'today' ? 'Jumped to today — June 2026' :
          dir === 'prev' ? 'May 2026' : 'July 2026', 'info');
      }));
      root.querySelectorAll('.calendar-seg').forEach(b => b.addEventListener('click', () => {
        root.querySelectorAll('.calendar-seg').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        H.toast(`${b.textContent} view`, 'info');
      }));

      // count-ups (none declared here) run automatically by the shell.
    }
  });
})();
