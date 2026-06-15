/* ============================================================================
   meetings.js — Meetings. Recorded, transcribed, briefed calls kept as files.
   Sections:
     1) KPI row (this week / hours recorded / open action items / avg brief time)
     2) Upcoming calls — title, time, provider tag, attendee avatars, Join & record
     3) Recordings library — cards with duration, provider, thumbnail, status pills
     4) Detail pane — TRANSCRIPT (speaker-tagged) + AI BRIEF (summary + action
        items checklist + decisions) + "Save brief to Vault" (→ H.show('vault')
        + HELM.audit.log)
   Follows the Command Deck reference shape EXACTLY:
     1) HELM.register({id,label,icon,scope,render})
     2) build DOM from documented .classes + HELM.charts only
     3) deterministic mock data via HELM.data (no Math.random / no Date at eval)
     4) every button wired to H.toast / H.show / H.audit / local state
   Namespaced tweaks live in meetings.css under the .meetings-* prefix.
   ========================================================================== */
(function () {
  const H = window.HELM;

  H.register({
    id: 'meetings',
    label: 'Meetings',
    icon: '🎥',
    scope: 'company',
    render(root) {
      const D = H.data;
      const sess = H.session;
      const team = sess.team;

      /* ── helper: resolve a seeded Person by id (for avatars/names) ────── */
      const person = (id) => team.find(p => p.id === id) || { id, name: id, avatar: '??' };
      const nameOf = (id) => person(id).name;

      /* ── provider palette (token-only) ─────────────────────────────────── */
      const PROVIDER = {
        Meet:  { ico: '🟢', tag: 'ok' },
        Zoom:  { ico: '🔵', tag: 'info' },
        Slack: { ico: '🟣', tag: 'info' }
      };
      const providerTag = (p) => `<span class="tag ${PROVIDER[p] ? PROVIDER[p].tag : 'info'} meetings-prov">${PROVIDER[p] ? PROVIDER[p].ico : '🎥'} ${p}</span>`;

      /* ── attendee avatar stack from a list of person ids ───────────────── */
      function avatarStack(ids, extra) {
        const shown = ids.slice(0, 4).map(id =>
          `<div class="avatar" title="${nameOf(id)}">${person(id).avatar}</div>`).join('');
        const more = (extra || ids.length > 4)
          ? `<div class="avatar meetings-av-more" title="more">+${(extra || 0) + Math.max(0, ids.length - 4)}</div>` : '';
        return `<div class="avatar-stack">${shown}${more}</div>`;
      }

      /* ════════════════════════════════════════════════════════════════════
         SEED DATA — deterministic, realistic Swedish/EU meetings
      ════════════════════════════════════════════════════════════════════ */

      /* upcoming calls (3) */
      const upcoming = [
        { id: 'mt-up-1', title: 'Investor sync — Q2 metrics', when: 'Today · 14:30', dur: '30 min',
          provider: 'Meet', host: 'u-arvid', attendees: ['u-arvid', 'u-mira', 'u-ola'], extra: 2,
          note: 'Almi + Norrsken · runway & MRR walk-through' },
        { id: 'mt-up-2', title: 'Sales pipeline review', when: 'Today · 16:00', dur: '45 min',
          provider: 'Zoom', host: 'u-sofia', attendees: ['u-sofia', 'u-arvid', 'u-kai'],
          note: 'Forecast commit · Forsberg + Halland Bryggeri' },
        { id: 'mt-up-3', title: 'Customer onboarding — Lykke Studios', when: 'Tomorrow · 09:15', dur: '30 min',
          provider: 'Slack', host: 'u-isa', attendees: ['u-isa', 'u-noah'],
          note: 'Kickoff + portal walkthrough' }
      ];

      /* recordings library (5) — each fully recorded/transcribed/briefed unless noted */
      const recordings = [
        {
          id: 'mt-88', title: 'Q2 board review', date: 'Jun 14 · 09:00', dur: '42 min', durMin: 42,
          provider: 'Meet', host: 'u-mira', attendees: ['u-arvid', 'u-mira', 'u-ola', 'u-sofia'], extra: 1,
          recorded: true, transcribed: true, briefed: true, openItems: 2,
          summary: 'The board reviewed Q2 performance: MRR reached $48.2K (+12.4% MoM) and cash sits at $284.5K, giving 14.2 months of runway at the current $38K monthly burn. Sales reported a healthy $612K pipeline; the board pushed to convert two enterprise deals before raising. Hiring was paused for one quarter to protect runway, and the team agreed to revisit a seed extension in the autumn.',
          transcript: [
            ['u-arvid', '00:14', 'Let’s open with the numbers. MRR is up 12.4% to forty-eight two, and cash is two-eighty-four five.'],
            ['u-ola', '00:41', 'Burn held at thirty-eight a month, so runway is fourteen point two. Comfortable, but I’d like a buffer before we hire again.'],
            ['u-mira', '01:09', 'Agreed. I propose we pause hiring for one quarter and re-open in the autumn.'],
            ['u-sofia', '01:33', 'Pipeline is six-twelve. If we close Forsberg and Halland this quarter we cover the gap without a raise.'],
            ['u-arvid', '02:05', 'Good. Let’s commit to those two and look at a seed extension in October.']
          ],
          actions: [
            { id: 'a1', text: 'Pause hiring one quarter — revisit in autumn', who: 'u-mira', done: true },
            { id: 'a2', text: 'Close Forsberg Konsult before quarter-end', who: 'u-sofia', done: false },
            { id: 'a3', text: 'Model a seed extension scenario for October', who: 'u-ola', done: false }
          ],
          decisions: [
            'Hiring paused for Q3 to protect runway.',
            'Target a seed extension conversation in October.',
            'Commit Forsberg + Halland deals to this quarter’s forecast.'
          ]
        },
        {
          id: 'mt-71', title: 'Sales pipeline review', date: 'Jun 12 · 16:00', dur: '38 min', durMin: 38,
          provider: 'Zoom', host: 'u-sofia', attendees: ['u-sofia', 'u-arvid', 'u-kai'],
          recorded: true, transcribed: true, briefed: true, openItems: 3,
          summary: 'Sales walked the board through a $612K weighted pipeline. Forsberg Konsult (96,000 kr) moved to verbal-yes and is expected to close this week. Halland Bryggeri stalled on a security review; Kai will supply the SOC2 summary. Two top-of-funnel demo requests came in from the Midsummer campaign, lifting projected ROAS to 3.4×.',
          transcript: [
            ['u-sofia', '00:08', 'Weighted pipeline is six-twelve. Forsberg is a verbal yes — paperwork this week.'],
            ['u-kai', '00:35', 'Midsummer drove two demo requests overnight. ROAS is tracking at three-four.'],
            ['u-arvid', '01:02', 'What’s blocking Halland?'],
            ['u-sofia', '01:10', 'Security review. They want our SOC2 summary before they’ll sign.'],
            ['u-kai', '01:28', 'I’ll send the one-pager today.']
          ],
          actions: [
            { id: 'a1', text: 'Send SOC2 one-pager to Halland Bryggeri', who: 'u-kai', done: false },
            { id: 'a2', text: 'Get Forsberg signature this week', who: 'u-sofia', done: false },
            { id: 'a3', text: 'Add 2 Midsummer demo requests to CRM', who: 'u-sofia', done: false }
          ],
          decisions: [
            'Forsberg committed to this week’s forecast.',
            'Halland gated on the security review — not yet committed.'
          ]
        },
        {
          id: 'mt-66', title: 'Weekly standup — Engineering', date: 'Jun 12 · 09:15', dur: '14 min', durMin: 14,
          provider: 'Slack', host: 'u-noah', attendees: ['u-noah', 'u-lena', 'u-mira'],
          recorded: true, transcribed: true, briefed: true, openItems: 1,
          summary: 'A tight standup. helm-web v1.8.2 shipped to production and is healthy. Noah is investigating an intermittent AX-12 inventory sync error and expects a fix by Friday. Lena flagged that the reorder automation should pause while the sync is unstable. No blockers carried over.',
          transcript: [
            ['u-noah', '00:05', 'v1.8.2 is live and production is green. One thing on my plate — the AX-12 sync error.'],
            ['u-lena', '00:22', 'Can we pause the reorder automation until that’s fixed? I don’t want a bad reorder.'],
            ['u-noah', '00:34', 'Good call. I’ll gate it and aim for a fix by Friday.'],
            ['u-mira', '00:47', 'Thanks both. Nothing else from me.']
          ],
          actions: [
            { id: 'a1', text: 'Fix AX-12 inventory sync error', who: 'u-noah', done: false }
          ],
          decisions: [
            'Pause the AX-12 reorder automation until the sync is fixed.'
          ]
        },
        {
          id: 'mt-59', title: 'Customer onboarding — Forsberg Konsult', date: 'Jun 10 · 11:00', dur: '27 min', durMin: 27,
          provider: 'Meet', host: 'u-isa', attendees: ['u-isa', 'u-sofia', 'u-noah'],
          recorded: true, transcribed: true, briefed: true, openItems: 2,
          summary: 'Kickoff with Forsberg Konsult. Isa walked the customer through the portal and account setup. The customer requested SSO via their Azure tenant and a custom invoice reference field. Go-live is targeted for the end of the month, with Isa owning the onboarding checklist.',
          transcript: [
            ['u-isa', '00:11', 'Welcome aboard! I’ll start with the portal, then we’ll set up your account.'],
            ['u-sofia', '00:40', 'They’d like SSO through their Azure tenant — is that in scope?'],
            ['u-noah', '00:52', 'Yes, SAML is supported. I’ll need their metadata XML.'],
            ['u-isa', '01:15', 'And a custom invoice reference field — noted. Go-live end of month.']
          ],
          actions: [
            { id: 'a1', text: 'Collect Azure SAML metadata from Forsberg', who: 'u-noah', done: false },
            { id: 'a2', text: 'Add custom invoice reference field', who: 'u-isa', done: true }
          ],
          decisions: [
            'Enable Azure SSO (SAML) for Forsberg Konsult.',
            'Target go-live for end of month.'
          ]
        },
        {
          id: 'mt-52', title: 'Marketing — Midsummer campaign retro', date: 'Jun 9 · 13:30', dur: '31 min', durMin: 31,
          provider: 'Zoom', host: 'u-kai', attendees: ['u-kai', 'u-sofia', 'u-mira'],
          recorded: true, transcribed: true, briefed: false, openItems: 0,
          summary: 'Retro on the Midsummer launch across three channels. Early ROAS is 3.4× with strong creative performance on the carousel format. The team agreed to shift budget toward carousels and to brief a follow-up campaign for the autumn. AI brief is still generating for this session.',
          transcript: [
            ['u-kai', '00:09', 'Three channels live. Carousels are the clear winner — ROAS three-four.'],
            ['u-sofia', '00:31', 'Leads quality looks good too. Two turned into demos already.'],
            ['u-mira', '00:48', 'Let’s move budget into carousels and brief an autumn follow-up.']
          ],
          actions: [],
          decisions: [
            'Shift budget toward the carousel format.',
            'Brief an autumn follow-up campaign.'
          ]
        }
      ];

      /* local UI state — which recording is open in the detail pane */
      let selectedId = recordings[0].id;
      const recById = (id) => recordings.find(r => r.id === id);

      /* ════════════════════════════════════════════════════════════════════
         VIEW HEAD
      ════════════════════════════════════════════════════════════════════ */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">🎥</div>
            <div>
              <h1>Meetings</h1>
              <p>Recorded, transcribed and briefed calls — kept as files.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="schedule">◇ Schedule</button>
            <button class="btn btn-primary btn-sm" data-act="record-now">● Record a call</button>
          </div>
        </div>
      `));

      /* ════════════════════════════════════════════════════════════════════
         KPI ROW
      ════════════════════════════════════════════════════════════════════ */
      const hoursRecorded = recordings.reduce((a, r) => a + r.durMin, 0) / 60; // ~2.5h
      const openActions = recordings.reduce((a, r) =>
        a + r.actions.filter(x => !x.done).length, 0);

      const kpiRow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
      [
        { label: 'MEETINGS · THIS WEEK', count: 8, fmt: 'num', sub: '5 recorded · 3 upcoming',
          trend: '+2 vs last wk', dir: 'up', spark: D.series('mt-week', 12, 3, 8, 0.18) },
        { label: 'HOURS RECORDED', count: hoursRecorded, fmt: 'plain', dp: 1, suffix: ' h',
          sub: 'across 5 calls', trend: '+0.8 h', dir: 'up', spark: D.series('mt-hours', 12, 1.4, 2.5, 0.10) },
        { label: 'ACTION ITEMS OPEN', count: openActions, fmt: 'num', sub: 'from briefs · 3 due today',
          trend: '-2 cleared', dir: 'up', spark: D.series('mt-actions', 12, 6, openActions, 0.16) },
        { label: 'AVG BRIEF TIME', count: 38, fmt: 'plain', suffix: ' s', sub: 'transcript → AI brief',
          trend: '-9 s', dir: 'up', spark: D.series('mt-brief', 12, 64, 38, 0.10) }
      ].forEach(k => {
        kpiRow.appendChild(H.el(`
          <div class="card kpi meetings-kpi">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-value sm" data-count="${k.count}" data-fmt="${k.fmt}"${k.dp != null ? ` data-dp="${k.dp}"` : ''}${k.suffix ? ` data-suffix="${k.suffix}"` : ''}>0</div>
            <div class="row between mt-sm">
              <span class="kpi-sub">${k.sub}</span>
              <span class="kpi-trend ${k.dir}">${k.trend}</span>
            </div>
            <div class="spark">${H.charts.spark(k.spark)}</div>
          </div>
        `));
      });
      root.appendChild(kpiRow);

      /* ════════════════════════════════════════════════════════════════════
         ROW: UPCOMING CALLS (span) | RECORDINGS-AT-A-GLANCE pill summary
      ════════════════════════════════════════════════════════════════════ */
      const upRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      /* — Upcoming calls list (span 2) — */
      const upCard = H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">📅</span> Upcoming calls</h3>
            <span class="ch-meta">${upcoming.length} SCHEDULED</span>
          </div>
          <div class="meetings-up-list"></div>
        </div>
      `);
      const upList = upCard.querySelector('.meetings-up-list');
      upcoming.forEach(m => {
        const node = H.el(`
          <div class="meetings-up">
            <div class="meetings-up-when">
              <div class="meetings-up-time">${m.when.split('·')[1] ? m.when.split('·')[1].trim() : m.when}</div>
              <div class="meetings-up-day">${m.when.split('·')[0].trim()}</div>
            </div>
            <div class="meetings-up-body">
              <div class="meetings-up-title">${m.title}</div>
              <div class="meetings-up-sub">${m.note}</div>
              <div class="row gap-sm mt-sm meetings-up-foot">
                ${providerTag(m.provider)}
                <span class="meetings-up-dur mono">${m.dur}</span>
                ${avatarStack(m.attendees, m.extra)}
              </div>
            </div>
            <div class="meetings-up-cta">
              <button class="btn btn-primary btn-sm" data-join="${m.id}">▶ Join &amp; record</button>
            </div>
          </div>
        `);
        node.querySelector('[data-join]').addEventListener('click', () => {
          H.toast(`Joining “${m.title}” — recording armed`, 'success');
        });
        upList.appendChild(node);
      });
      upRow.appendChild(upCard);

      /* — Library status summary card — */
      const libProv = {};
      recordings.forEach(r => { libProv[r.provider] = (libProv[r.provider] || 0) + 1; });
      const summaryCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">📼</span> Library</h3>
            <span class="ch-meta">${recordings.length} FILES</span>
          </div>
          <div class="meetings-lib-stats"></div>
        </div>
      `);
      const libStats = summaryCard.querySelector('.meetings-lib-stats');
      [
        ['Recorded', recordings.filter(r => r.recorded).length, 'ok', '✓'],
        ['Transcribed', recordings.filter(r => r.transcribed).length, 'ok', '✓'],
        ['Briefed', recordings.filter(r => r.briefed).length, 'info', '✦'],
        ['Brief pending', recordings.filter(r => !r.briefed).length, 'warn', '◷']
      ].forEach(([label, n, sev, ico]) => {
        libStats.appendChild(H.el(`
          <div class="stat-row">
            <span class="sr-label">${ico} ${label}</span>
            <span class="sr-val"><span class="pill ${sev} meetings-stat-pill">${n}</span></span>
          </div>
        `));
      });
      Object.keys(libProv).forEach(p => {
        libStats.appendChild(H.el(`
          <div class="stat-row">
            <span class="sr-label">${providerTag(p)}</span>
            <span class="sr-val mono">${libProv[p]} call${libProv[p] > 1 ? 's' : ''}</span>
          </div>
        `));
      });
      upRow.appendChild(summaryCard);
      root.appendChild(upRow);

      /* ════════════════════════════════════════════════════════════════════
         RECORDINGS LIBRARY — cards w/ thumbnail, duration, provider, pills
      ════════════════════════════════════════════════════════════════════ */
      root.appendChild(H.el(`<div class="section-title">Recordings library</div>`));
      const libGrid = H.el(`<div class="grid cols-3 meetings-lib" style="margin-bottom:var(--gap)"></div>`);

      function pillRow(r) {
        return `
          <span class="pill ${r.recorded ? 'ok' : 'bad'} meetings-pill">Recorded ${r.recorded ? '✓' : '✕'}</span>
          <span class="pill ${r.transcribed ? 'ok' : 'bad'} meetings-pill">Transcribed ${r.transcribed ? '✓' : '✕'}</span>
          <span class="pill ${r.briefed ? 'info' : 'warn'} meetings-pill">Briefed ${r.briefed ? '✓' : '◷'}</span>`;
      }

      function buildLibCard(r) {
        const node = H.el(`
          <div class="card flush meetings-card${r.id === selectedId ? ' active' : ''}" data-rec="${r.id}">
            <div class="meetings-thumb">
              <div class="meetings-thumb-grad"></div>
              <div class="meetings-thumb-prov">${providerTag(r.provider)}</div>
              <div class="meetings-thumb-dur mono">${r.dur}</div>
              <button class="meetings-play" data-play="${r.id}" title="Play recording">▶</button>
              <div class="meetings-thumb-wave">
                <span></span><span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span><span></span>
              </div>
            </div>
            <div class="meetings-card-body">
              <div class="meetings-card-title">${r.title}</div>
              <div class="row between meetings-card-meta">
                <span class="muted">${r.date}</span>
                ${avatarStack(r.attendees, r.extra)}
              </div>
              <div class="row wrap gap-sm mt-sm">${pillRow(r)}</div>
              <button class="btn btn-sm btn-block mt-sm meetings-open" data-open="${r.id}">
                ${r.briefed ? 'Open brief →' : 'Open transcript →'}
              </button>
            </div>
          </div>
        `);
        node.querySelector('[data-play]').addEventListener('click', (e) => {
          e.stopPropagation();
          H.toast(`Playing “${r.title}” (${r.dur})`, 'info');
        });
        const openFn = () => selectRecording(r.id);
        node.querySelector('[data-open]').addEventListener('click', (e) => { e.stopPropagation(); openFn(); });
        node.addEventListener('click', openFn);
        return node;
      }

      recordings.forEach(r => libGrid.appendChild(buildLibCard(r)));
      root.appendChild(libGrid);

      /* ════════════════════════════════════════════════════════════════════
         DETAIL PANE — transcript + AI brief (rebuilt on selection)
      ════════════════════════════════════════════════════════════════════ */
      root.appendChild(H.el(`<div class="section-title">Meeting detail</div>`));
      const detailHost = H.el(`<div class="meetings-detail-host" style="margin-bottom:var(--gap)"></div>`);
      root.appendChild(detailHost);

      function selectRecording(id) {
        selectedId = id;
        // toggle active state on cards
        libGrid.querySelectorAll('.meetings-card').forEach(c =>
          c.classList.toggle('active', c.dataset.rec === id));
        renderDetail(recById(id));
        // bring the detail into view
        detailHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      function renderDetail(r) {
        detailHost.innerHTML = '';
        const canSign = sess.can('vault.sign');

        const wrap = H.el(`<div class="grid cols-2 meetings-detail"></div>`);

        /* — TRANSCRIPT panel — */
        const tCard = H.el(`
          <div class="card meetings-transcript">
            <div class="card-head">
              <h3><span class="hico">📝</span> Transcript</h3>
              <span class="ch-meta">${r.provider.toUpperCase()} · ${r.dur}</span>
            </div>
            <div class="meetings-tc-meta row between">
              <span class="muted">${r.title}</span>
              <span class="mono faint">${r.date}</span>
            </div>
            <div class="meetings-tc-lines"></div>
            <div class="row between mt">
              <span class="faint meetings-tc-foot">${r.transcribed ? 'Auto-transcribed · 99.2% confidence' : 'Transcription pending'}</span>
              <button class="btn btn-ghost btn-sm" data-act="full-tc">Full transcript</button>
            </div>
          </div>
        `);
        const tcLines = tCard.querySelector('.meetings-tc-lines');
        r.transcript.forEach(([who, ts, text]) => {
          tcLines.appendChild(H.el(`
            <div class="meetings-tc-line">
              <div class="avatar sq meetings-tc-av" title="${nameOf(who)}">${person(who).avatar}</div>
              <div class="meetings-tc-body">
                <div class="meetings-tc-head">
                  <span class="meetings-tc-name">${nameOf(who)}</span>
                  <span class="meetings-tc-ts mono">${ts}</span>
                </div>
                <div class="meetings-tc-text">${text}</div>
              </div>
            </div>
          `));
        });
        tCard.querySelector('[data-act="full-tc"]').addEventListener('click', () =>
          H.toast('Opening full transcript file…', 'info'));
        wrap.appendChild(tCard);

        /* — AI BRIEF panel — */
        const bCard = H.el(`
          <div class="card meetings-brief">
            <div class="card-head">
              <h3><span class="hico">✦</span> AI Brief</h3>
              <span class="pill ${r.briefed ? 'info' : 'warn'} meetings-brief-pill">${r.briefed ? 'READY' : 'GENERATING'}</span>
            </div>
            <div class="meetings-brief-body"></div>
          </div>
        `);
        const bBody = bCard.querySelector('.meetings-brief-body');

        if (!r.briefed) {
          bBody.appendChild(H.el(`
            <div class="meetings-brief-pending">
              <div class="meetings-brief-spinner">✦</div>
              <p class="muted">Summarising the transcript and extracting action items… the brief will appear here in moments.</p>
              <button class="btn btn-sm btn-primary mt" data-act="gen-now">Generate brief now</button>
            </div>
          `));
          bBody.querySelector('[data-act="gen-now"]').addEventListener('click', () => {
            H.toast(`Generating brief for “${r.title}”…`, 'info');
          });
        } else {
          /* summary */
          bBody.appendChild(H.el(`
            <div class="meetings-brief-sec">
              <div class="meetings-brief-label">Summary</div>
              <p class="meetings-brief-summary">${r.summary}</p>
            </div>
          `));

          /* action items checklist (interactive) */
          const actSec = H.el(`
            <div class="meetings-brief-sec">
              <div class="meetings-brief-label">Action items <span class="badge">${r.actions.filter(a => !a.done).length}</span></div>
              <div class="meetings-acts"></div>
            </div>
          `);
          const actWrap = actSec.querySelector('.meetings-acts');
          if (!r.actions.length) {
            actWrap.appendChild(H.el(`<p class="faint">No action items captured.</p>`));
          }
          r.actions.forEach(a => {
            const ck = H.el(`
              <button class="check meetings-act${a.done ? ' done' : ''}" data-act-id="${a.id}">
                <span class="box">✓</span>
                <span class="ck-body">
                  <span class="ck-title">${a.text}</span>
                  <span class="ck-sub">Owner · ${nameOf(a.who)}</span>
                </span>
                <span class="avatar meetings-act-av" title="${nameOf(a.who)}">${person(a.who).avatar}</span>
              </button>
            `);
            ck.addEventListener('click', () => {
              a.done = !a.done;
              ck.classList.toggle('done', a.done);
              // refresh open-count badge
              const badge = actSec.querySelector('.meetings-brief-label .badge');
              if (badge) badge.textContent = r.actions.filter(x => !x.done).length;
              H.toast(a.done ? 'Action marked done' : 'Action re-opened', a.done ? 'success' : 'info');
            });
            actWrap.appendChild(ck);
          });
          bBody.appendChild(actSec);

          /* decisions */
          const decSec = H.el(`
            <div class="meetings-brief-sec">
              <div class="meetings-brief-label">Decisions</div>
              <div class="meetings-decs"></div>
            </div>
          `);
          const decWrap = decSec.querySelector('.meetings-decs');
          r.decisions.forEach(d => {
            decWrap.appendChild(H.el(`
              <div class="meetings-dec">
                <span class="meetings-dec-ico">◆</span>
                <span class="meetings-dec-text">${d}</span>
              </div>
            `));
          });
          bBody.appendChild(decSec);

          /* save-to-vault CTA */
          const cta = H.el(`
            <div class="row between mt meetings-brief-cta">
              <button class="btn btn-ghost btn-sm" data-act="copy">⧉ Copy brief</button>
              <button class="btn btn-primary btn-sm" data-act="vault"${canSign ? '' : ' disabled title="Needs member role"'}>🗄️ Save brief to Vault</button>
            </div>
          `);
          cta.querySelector('[data-act="copy"]').addEventListener('click', () =>
            H.toast('Brief copied to clipboard', 'success'));

          const vaultBtn = cta.querySelector('[data-act="vault"]');
          vaultBtn.addEventListener('click', () => {
            // re-check live in case the acting user changed since render
            if (!sess.can('vault.sign')) { H.toast('Needs member role to save to Vault', 'warn'); return; }
            const actor = sess.user;
            // audit the data-changing action
            H.audit.log({
              action: 'doc.created',
              entityType: 'Document',
              entityId: 'doc-brief-' + r.id,
              summary: `${actor.name} saved the “${r.title}” meeting brief to the Vault`,
              links: [{ entityType: 'Meeting', entityId: r.id }],
              module: 'meetings',
              after: { kind: 'meeting-brief', source: r.id, actions: r.actions.length, decisions: r.decisions.length }
            });
            H.toast(`Brief saved to Vault — opening…`, 'success');
            setTimeout(() => H.show('vault'), 650);
          });
          bBody.appendChild(cta);
        }

        wrap.appendChild(bCard);
        detailHost.appendChild(wrap);
      }

      // initial detail render
      renderDetail(recById(selectedId));

      /* ════════════════════════════════════════════════════════════════════
         HEADER ACTIONS
      ════════════════════════════════════════════════════════════════════ */
      root.querySelector('[data-act="schedule"]').addEventListener('click', () => {
        H.toast('Opening scheduler…', 'info');
        H.show('calendar');
      });
      root.querySelector('[data-act="record-now"]').addEventListener('click', () =>
        H.toast('Recorder armed — start your call to capture it', 'success'));

      // count-ups auto-run by the shell after render(); nothing else needed.
    }
  });
})();
