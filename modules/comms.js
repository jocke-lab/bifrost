/* ============================================================================
   comms.js — Comms.
   Slack-inside-HELM. A 3-pane chat surface (all classes .comms-* prefixed):
     LEFT   — workspace rail: company channels (#general …) + direct messages
              (the other 7 teammates, with presence dots + per-user unread).
     CENTER — the open conversation: header w/ Start/Join-call, a scrollable
              message thread (avatar · name · time · body), and a composer that
              appends locally + HELM.audit.log + toast.
     RIGHT  — members / pinned (collapses on mobile).
   PERSONAL scope: reads HELM.session.user fresh at the top of render(), so the
   acting person's DMs / unread / "you" bubbles reflect whoever is signed in.
   Follows the command.js reference shape: register + lazy render(root).
   ========================================================================== */
(function () {
  const H = window.HELM;
  const S = H.session;

  /* ── deterministic palette for avatars (token-driven, no hardcoded hex) ── */
  const AV_BG = [
    'linear-gradient(135deg,var(--accent1),var(--accent2))',
    'linear-gradient(135deg,var(--accent3),var(--accent2))',
    'linear-gradient(135deg,var(--accent2),var(--accent1))',
    'linear-gradient(135deg,var(--warn),var(--accent3))',
    'linear-gradient(135deg,var(--accent1),var(--accent3))',
    'linear-gradient(135deg,var(--accent3),var(--accent1))',
    'linear-gradient(135deg,var(--accent2),var(--accent3))',
    'linear-gradient(135deg,var(--warn),var(--accent2))'
  ];
  function avBg(id) { return AV_BG[Math.abs(H.data.int('comms-av-' + id, 0, 999)) % AV_BG.length]; }

  H.register({
    id: 'comms',
    label: 'Comms',
    icon: '💬',
    scope: 'personal',
    render(root) {
      const me = S.user;                       // read fresh — personal scope
      const team = S.team;
      const others = team.filter(p => p.id !== me.id);
      const esc = (s) => String(s == null ? '' : s)
        .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const byId = {}; team.forEach(p => { byId[p.id] = p; });

      /* presence → core .pdot class */
      const dotClass = (p) => 'pdot ' + (p.presence || 'away');
      const presenceLabel = (p) => ({
        available: 'Active', focus: 'In focus', meeting: 'In a meeting', away: 'Away'
      }[p.presence] || 'Away');

      /* ── COMPANY CHANNELS (same for everyone) ───────────────────────────── */
      const CHANNELS = [
        { id: 'general',     name: 'general',     topic: 'Company-wide — announcements & watercooler', members: team.map(p => p.id) },
        { id: 'sales',       name: 'sales',       topic: 'Pipeline, deals & revenue chatter',          members: ['u-arvid', 'u-mira', 'u-sofia', 'u-kai', 'u-isa'] },
        { id: 'engineering', name: 'engineering', topic: 'helm-web, deploys & incidents',              members: ['u-arvid', 'u-noah', 'u-mira'] },
        { id: 'ops',         name: 'ops',         topic: 'Logistics, stock & fulfilment',              members: ['u-arvid', 'u-mira', 'u-lena', 'u-ola'] },
        { id: 'random',      name: 'random',      topic: 'Off-topic — memes, fika & Friday plans',     members: team.map(p => p.id) }
      ];

      /* per-channel unread counts vary by who you are (deterministic) */
      const chanUnread = (cid) => {
        const ch = CHANNELS.find(c => c.id === cid);
        if (!ch || !ch.members.includes(me.id)) return 0;
        return H.data.int('comms-cu-' + me.id + '-' + cid, 0, 4);
      };

      /* per-DM unread (deterministic per acting user) */
      const dmUnread = (otherId) => H.data.int('comms-du-' + me.id + '-' + otherId, 0, 5);

      /* ── SEEDED THREADS ─────────────────────────────────────────────────
         Each conversation is a list of {from, t, body}. The acting user's own
         lines are stamped with their id so they render as "you". Where a seed
         line is authored by the acting user themselves, we re-point it to a
         teammate so the thread still reads naturally from their seat. ──────── */
      const reauthor = (uid) => uid === me.id ? (others[0] ? others[0].id : uid) : uid;

      const THREADS = {
        'ch-general': [
          ['u-arvid', '08:42', 'God morgon allihop ☕ — Q2 board review went well, transcript is in #engineering for the deploy notes. Proud of this team.'],
          ['u-mira',  '08:44', 'Stark kvartal. Reminder: midsummer week half the company is off, plan handovers in your squads.'],
          ['u-kai',   '08:51', 'Midsummer ad campaign is live across all 3 channels 🎉 ROAS already tracking at 3.4×.'],
          ['u-sofia', '09:05', 'Big one: closed Forsberg Konsult — 96 000 kr 🥳 Champagne on me at the Friday fika.'],
          ['u-ola',   '09:12', 'Nice! Booked the Stripe payout, operating account looks healthy. Runway at 14.2 months — keeping an eye on burn.'],
          ['u-isa',   '09:30', 'Lykke Studios accepted the portal invite, they are fully onboarded now ✅']
        ],
        'ch-sales': [
          ['u-sofia', '09:01', 'Pipeline review at 15:30 today. Halland Bryggeri requested a demo via the website — hot lead.'],
          ['u-kai',   '09:08', 'I can spin up a tailored one-pager for them. What vertical are they in?'],
          ['u-sofia', '09:09', 'Craft brewery, ~40 staff. Classic mid-market. Forsberg is now WON so I have room to push.'],
          ['u-arvid', '09:20', 'Love it. Keep DSO under control — we are at 28 days, do not let it creep.'],
          ['u-isa',   '09:41', 'Heads up: Forsberg reopened a billing ticket, nothing blocking but worth a mention on the call.']
        ],
        'ch-engineering': [
          ['u-noah',  '10:02', 'Shipped helm-web v1.8.2 to production 🚀 All green, error rate flat.'],
          ['u-arvid', '10:05', 'Beautiful. Any migrations needed on the customers side?'],
          ['u-noah',  '10:07', 'No schema changes — pure frontend + the audit chain hardening we discussed.'],
          ['u-mira',  '10:15', 'Board transcript is uploaded if anyone wants the AI brief — 42 min, summarised to 6 bullets.'],
          ['u-noah',  '10:31', 'Investigating the AX-12 sync error Lena flagged. Looks like a rate-limit on the Fortnox side, not us.']
        ],
        'ch-ops': [
          ['u-lena',  '09:28', 'SKU AX-12 is below par — 8 units left, reorder point is 20. Moving the reorder task to Doing.'],
          ['u-ola',   '09:33', 'Approved the PO. Northwind Hosting AB invoice (4 200 kr) is also booked as a fixed cost.'],
          ['u-mira',  '09:40', 'PostNord pickup is confirmed for the 1041–1048 batch. Lena can you double-check the labels?'],
          ['u-lena',  '09:46', 'On it. Labels printed, batch staged for the afternoon collection.']
        ],
        'ch-random': [
          ['u-kai',   '12:01', 'Who is in for padel after work on Thursday? 🎾'],
          ['u-noah',  '12:04', 'In. Loser buys kanelbullar.'],
          ['u-isa',   '12:09', 'I will keep score 😄'],
          ['u-lena',  '12:20', 'Bringing my speaker. Friday fika theme: midsommar 🌸']
        ]
      };

      /* DM threads — keyed by the OTHER person's id, from the acting user's seat */
      const DM_SEED = {
        'u-arvid': [['t', '08:40', 'Quick one — can you sign off the VAT draft in Fortnox before the board sync?'], ['m', '08:44', 'Looking at it now, will approve within the hour.']],
        'u-mira':  [['t', '09:02', 'Handover plan for midsummer week is in the ops doc. Can you review your squad coverage?'], ['m', '09:06', 'Yep, adding Lena as backup on logistics. Done in a sec.']],
        'u-ola':   [['t', '09:15', 'Stripe payout settled — 12 400 kr to operating. Runway holding at 14.2 mo.'], ['m', '09:18', 'Great, thanks for the heads up. Let us keep burn flat this month.']],
        'u-sofia': [['t', '09:10', 'Forsberg is WON 🎉 96k. Pushing Halland Bryggeri next.'], ['m', '09:11', 'Incredible work. Loop me in before the demo.']],
        'u-noah':  [['t', '10:33', 'AX-12 sync error is a Fortnox rate-limit, not our code. Adding a backoff.'], ['m', '10:35', 'Perfect. Ship it when you are happy with the retry curve.']],
        'u-lena':  [['t', '09:47', 'Batch 1041–1048 staged for PostNord this afternoon. Labels done.'], ['m', '09:49', 'Thanks Lena. Reorder on AX-12 approved on the ops channel.']],
        'u-kai':   [['t', '12:02', 'Midsummer campaign live — ROAS 3.4×. Want a daily creative-perf digest?'], ['m', '12:05', 'Yes please, keep it short. Nice numbers.']],
        'u-isa':   [['t', '09:31', 'Lykke onboarded. Forsberg reopened a billing ticket — minor.'], ['m', '09:33', 'Good, thanks. Flag it to Ola if it touches an invoice.']]
      };

      function dmThread(otherId) {
        const seed = DM_SEED[otherId] || [['t', '09:00', 'Hej! 👋']];
        return seed.map(([who, t, body]) => ({
          from: who === 'm' ? me.id : otherId, t, body
        }));
      }

      function channelThread(cid) {
        return (THREADS['ch-' + cid] || []).map(([uid, t, body]) => ({
          from: reauthor(uid), t, body
        }));
      }

      /* ── LOCAL VIEW STATE ───────────────────────────────────────────────── */
      // active conversation: {kind:'channel'|'dm', id}
      let active = { kind: 'channel', id: 'general' };
      // live message store so sends persist within this render session
      const store = {};   // key -> [{from,t,body}]
      const keyOf = (a) => a.kind + ':' + a.id;
      function thread(a) {
        const k = keyOf(a);
        if (!store[k]) store[k] = a.kind === 'channel' ? channelThread(a.id) : dmThread(a.id);
        return store[k];
      }

      /* ── HEADER ─────────────────────────────────────────────────────────── */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">💬</div>
            <div>
              <h1>Comms</h1>
              <p>Channels, direct messages and huddles — ${esc(S.org.name)}, in one place.</p>
            </div>
          </div>
          <div class="vh-actions">
            <span class="pill comms-me-pill"><span class="${dotClass(me)}"></span>${esc(me.name.split(' ')[0])} · ${esc(presenceLabel(me))}</span>
            <button class="btn btn-ghost btn-sm" data-act="new-dm">✎ New message</button>
          </div>
        </div>
      `));

      /* ── 3-PANE SHELL ───────────────────────────────────────────────────── */
      const shell = H.el(`<div class="card flush comms-shell"></div>`);

      /* LEFT RAIL ----------------------------------------------------------- */
      const rail = H.el(`
        <aside class="comms-rail">
          <div class="comms-ws">
            <div class="comms-ws-mark">${esc(H.data.initials(S.org.name))}</div>
            <div class="comms-ws-meta">
              <div class="comms-ws-name">${esc(S.org.name)}</div>
              <div class="comms-ws-sub"><span class="${dotClass(me)}"></span>${esc(me.name)}</div>
            </div>
          </div>
          <div class="comms-rail-scroll">
            <div class="comms-group" data-group="channels">
              <div class="comms-group-head"><span>Channels</span><span class="comms-group-meta">${CHANNELS.length}</span></div>
              <div class="comms-chan-list"></div>
            </div>
            <div class="comms-group" data-group="dms">
              <div class="comms-group-head"><span>Direct messages</span><span class="comms-group-meta">${others.length}</span></div>
              <div class="comms-dm-list"></div>
            </div>
          </div>
        </aside>
      `);

      const chanList = rail.querySelector('.comms-chan-list');
      CHANNELS.forEach(ch => {
        const isMember = ch.members.includes(me.id);
        const u = chanUnread(ch.id);
        const row = H.el(`
          <button class="comms-rail-row comms-chan-row${active.kind === 'channel' && active.id === ch.id ? ' active' : ''}"
                  data-kind="channel" data-id="${ch.id}" title="${esc(ch.topic)}">
            <span class="comms-hash">#</span>
            <span class="comms-rail-name">${esc(ch.name)}</span>
            ${u ? `<span class="badge bad comms-rail-badge">${u}</span>` : ''}
            ${!isMember ? '<span class="comms-rail-guest">guest</span>' : ''}
          </button>
        `);
        chanList.appendChild(row);
      });

      const dmList = rail.querySelector('.comms-dm-list');
      others.forEach(p => {
        const u = dmUnread(p.id);
        const row = H.el(`
          <button class="comms-rail-row comms-dm-row${active.kind === 'dm' && active.id === p.id ? ' active' : ''}"
                  data-kind="dm" data-id="${p.id}">
            <span class="comms-dm-av" style="background:${avBg(p.id)}">${esc(p.avatar)}<span class="${dotClass(p)} corner"></span></span>
            <span class="comms-rail-name">${esc(p.name.split(' ')[0])} ${esc((p.name.split(' ')[1] || '')[0] || '')}${(p.name.split(' ')[1] ? '.' : '')}</span>
            ${u ? `<span class="badge bad comms-rail-badge">${u}</span>` : `<span class="${dotClass(p)} comms-rail-pdot"></span>`}
          </button>
        `);
        dmList.appendChild(row);
      });

      /* CENTER -------------------------------------------------------------- */
      const center = H.el(`
        <section class="comms-main">
          <header class="comms-conv-head"></header>
          <div class="comms-stream" id="commsStream"></div>
          <form class="comms-composer" autocomplete="off">
            <button type="button" class="comms-comp-attach" title="Attach" data-act="attach">＋</button>
            <textarea class="comms-comp-input" rows="1" placeholder="Message…" aria-label="Message"></textarea>
            <button type="button" class="comms-comp-emoji" title="Emoji" data-act="emoji">☺</button>
            <button type="submit" class="btn btn-primary btn-sm comms-comp-send">Send ➤</button>
          </form>
        </section>
      `);

      /* RIGHT --------------------------------------------------------------- */
      const right = H.el(`<aside class="comms-info"></aside>`);

      shell.appendChild(rail);
      shell.appendChild(center);
      shell.appendChild(right);
      root.appendChild(shell);

      /* ── RENDERERS ──────────────────────────────────────────────────────── */
      const streamEl = center.querySelector('#commsStream');
      const headEl = center.querySelector('.comms-conv-head');
      const inputEl = center.querySelector('.comms-comp-input');

      function activeTitle() {
        if (active.kind === 'channel') {
          const ch = CHANNELS.find(c => c.id === active.id);
          return { title: '# ' + ch.name, topic: ch.topic, ch };
        }
        const p = byId[active.id];
        return { title: p.name, topic: p.title + ' · ' + presenceLabel(p), person: p };
      }

      function renderHead() {
        const a = activeTitle();
        const callLabel = active.kind === 'channel' ? 'Start huddle' : 'Start call';
        const sub = active.kind === 'channel'
          ? `<span class="comms-head-ico">#</span>`
          : `<span class="comms-dm-av sm" style="background:${avBg(active.id)}">${esc(a.person.avatar)}<span class="${dotClass(a.person)} corner"></span></span>`;
        const memberCount = active.kind === 'channel' ? a.ch.members.length : 2;
        headEl.innerHTML = `
          <div class="comms-head-id">
            ${sub}
            <div class="comms-head-meta">
              <div class="comms-head-title">${esc(active.kind === 'channel' ? a.ch.name : a.person.name)}
                ${active.kind === 'dm' ? `<span class="role-badge ${a.person.role}">${esc(a.person.role)}</span>` : ''}
              </div>
              <div class="comms-head-topic">${esc(a.topic)}</div>
            </div>
          </div>
          <div class="comms-head-actions">
            <button class="btn btn-ghost btn-sm comms-head-members" data-act="toggle-info" title="Members">👥 ${memberCount}</button>
            <button class="btn btn-sm comms-call-btn" data-act="call">📞 ${callLabel}</button>
            <button class="btn btn-ghost btn-sm comms-head-more" data-act="more" title="More">⋯</button>
          </div>`;
        headEl.querySelector('[data-act="call"]').addEventListener('click', () => startCall());
        headEl.querySelector('[data-act="toggle-info"]').addEventListener('click', () => right.classList.toggle('open'));
        headEl.querySelector('[data-act="more"]').addEventListener('click', () => H.toast('Conversation settings — coming soon', 'info'));
      }

      function bubbleHTML(m, prevFrom) {
        const p = byId[m.from] || me;
        const mine = m.from === me.id;
        const grouped = prevFrom === m.from;
        if (grouped) {
          return `<div class="comms-msg grouped${mine ? ' mine' : ''}">
            <div class="comms-msg-gutter"><span class="comms-msg-ghost-t">${esc(m.t)}</span></div>
            <div class="comms-msg-body"><div class="comms-bubble">${esc(m.body)}</div></div>
          </div>`;
        }
        return `<div class="comms-msg${mine ? ' mine' : ''}">
          <div class="comms-msg-gutter">
            <span class="comms-msg-av" style="background:${avBg(p.id)}">${esc(p.avatar)}</span>
          </div>
          <div class="comms-msg-body">
            <div class="comms-msg-head">
              <span class="comms-msg-name">${esc(mine ? 'You' : p.name)}</span>
              ${mine ? '' : `<span class="role-badge ${p.role}">${esc(p.role)}</span>`}
              <span class="comms-msg-time">${esc(m.t)}</span>
            </div>
            <div class="comms-bubble">${esc(m.body)}</div>
          </div>
        </div>`;
      }

      function renderStream() {
        const msgs = thread(active);
        let html = `<div class="comms-stream-cap">
            <div class="comms-cap-mark">${active.kind === 'channel' ? '#' : esc((byId[active.id] || me).avatar)}</div>
            <div class="comms-cap-title">${esc(active.kind === 'channel' ? 'This is the start of #' + CHANNELS.find(c => c.id === active.id).name : 'Direct messages with ' + byId[active.id].name)}</div>
            <div class="comms-cap-sub">${esc(active.kind === 'channel' ? CHANNELS.find(c => c.id === active.id).topic : (byId[active.id].title))}</div>
          </div>
          <div class="comms-daysep"><span>Today</span></div>`;
        let prev = null;
        msgs.forEach(m => { html += bubbleHTML(m, prev); prev = m.from; });
        streamEl.innerHTML = html;
        streamEl.scrollTop = streamEl.scrollHeight;
      }

      function renderInfo() {
        let html = '';
        if (active.kind === 'channel') {
          const ch = CHANNELS.find(c => c.id === active.id);
          html += `
            <div class="comms-info-head"><span class="ch-meta">CHANNEL</span><button class="comms-info-x" data-act="close-info">✕</button></div>
            <div class="comms-info-sec">
              <div class="comms-info-topic"><div class="comms-info-label">Topic</div><p>${esc(ch.topic)}</p></div>
            </div>
            <div class="comms-info-sec">
              <div class="comms-info-label">Pinned</div>
              <div class="comms-pin"><span class="comms-pin-ico">📌</span><div><div class="comms-pin-t">Q2 board review — 6-bullet brief</div><div class="comms-pin-s">Shared by Mira · meetings</div></div></div>
            </div>
            <div class="comms-info-sec">
              <div class="comms-info-label">Members · ${ch.members.length}</div>
              <div class="comms-info-people"></div>
            </div>`;
        } else {
          const p = byId[active.id];
          html += `
            <div class="comms-info-head"><span class="ch-meta">PROFILE</span><button class="comms-info-x" data-act="close-info">✕</button></div>
            <div class="comms-info-profile">
              <div class="comms-info-av" style="background:${avBg(p.id)}">${esc(p.avatar)}<span class="${dotClass(p)} corner"></span></div>
              <div class="comms-info-name">${esc(p.name)}</div>
              <div class="comms-info-title">${esc(p.title)}</div>
              <span class="role-badge ${p.role}">${esc(p.role)}</span>
            </div>
            <div class="comms-info-sec">
              <div class="stat-row"><span class="sr-label">Presence</span><span class="sr-val">${esc(presenceLabel(p))}</span></div>
              <div class="stat-row"><span class="sr-label">Email</span><span class="sr-val comms-info-email">${esc(p.email)}</span></div>
              <div class="stat-row"><span class="sr-label">Slack</span><span class="sr-val">${p.connections && p.connections.slack ? 'Connected' : '—'}</span></div>
            </div>
            <div class="comms-info-sec">
              <div class="comms-info-label">Pinned</div>
              <div class="comms-pin"><span class="comms-pin-ico">📌</span><div><div class="comms-pin-t">Shared files & decisions</div><div class="comms-pin-s">Nothing pinned yet</div></div></div>
            </div>`;
        }
        right.innerHTML = html;

        if (active.kind === 'channel') {
          const ch = CHANNELS.find(c => c.id === active.id);
          const wrap = right.querySelector('.comms-info-people');
          ch.members.forEach(mid => {
            const p = byId[mid];
            wrap.appendChild(H.el(`
              <div class="comms-info-person">
                <span class="comms-dm-av sm" style="background:${avBg(p.id)}">${esc(p.avatar)}<span class="${dotClass(p)} corner"></span></span>
                <span class="comms-info-pname">${esc(p.name)}${mid === me.id ? ' <span class="comms-you-tag">you</span>' : ''}</span>
              </div>
            `));
          });
        }
        const x = right.querySelector('[data-act="close-info"]');
        if (x) x.addEventListener('click', () => right.classList.remove('open'));
      }

      function renderAll() {
        renderHead();
        renderStream();
        renderInfo();
        // sync rail active state
        rail.querySelectorAll('.comms-rail-row').forEach(r => {
          r.classList.toggle('active', r.dataset.kind === active.kind && r.dataset.id === active.id);
        });
      }

      /* ── INTERACTIONS ───────────────────────────────────────────────────── */
      rail.querySelectorAll('.comms-rail-row').forEach(r => {
        r.addEventListener('click', () => {
          active = { kind: r.dataset.kind, id: r.dataset.id };
          // clear the unread badge on open
          const badge = r.querySelector('.comms-rail-badge');
          if (badge) badge.remove();
          renderAll();
        });
      });

      function startCall() {
        const isChannel = active.kind === 'channel';
        const dest = isChannel ? '#' + CHANNELS.find(c => c.id === active.id).name : byId[active.id].name;
        const verb = isChannel ? 'huddle' : 'call';
        H.audit.log({
          action: isChannel ? 'huddle.started' : 'call.started',
          entityType: isChannel ? 'Channel' : 'DirectMessage',
          entityId: (isChannel ? 'ch-' : 'dm-') + active.id,
          summary: `${me.name} started a ${verb} in ${dest}`,
          links: isChannel ? [] : [{ entityType: 'Person', entityId: active.id }],
          module: 'comms'
        });
        H.toast(`Starting ${verb} in ${dest}…`, 'info');
      }

      function sendMessage() {
        const text = (inputEl.value || '').trim();
        if (!text) return;
        const now = new Date();
        const t = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        thread(active).push({ from: me.id, t, body: text });
        inputEl.value = '';
        inputEl.style.height = '';
        renderStream();

        const a = activeTitle();
        const dest = active.kind === 'channel' ? '#' + CHANNELS.find(c => c.id === active.id).name : byId[active.id].name;
        H.audit.log({
          action: 'message.sent',
          entityType: active.kind === 'channel' ? 'Channel' : 'DirectMessage',
          entityId: (active.kind === 'channel' ? 'ch-' : 'dm-') + active.id,
          summary: `${me.name} sent a message in ${dest}`,
          links: active.kind === 'dm' ? [{ entityType: 'Person', entityId: active.id }] : [],
          module: 'comms'
        });
        H.toast('Message sent to ' + dest, 'success');
      }

      center.querySelector('.comms-composer').addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });
      inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
      inputEl.addEventListener('input', () => { inputEl.style.height = 'auto'; inputEl.style.height = Math.min(140, inputEl.scrollHeight) + 'px'; });
      center.querySelector('[data-act="attach"]').addEventListener('click', () => H.toast('Attach a file — coming soon', 'info'));
      center.querySelector('[data-act="emoji"]').addEventListener('click', () => { inputEl.value += ' 👍'; inputEl.focus(); });

      /* header actions */
      root.querySelector('[data-act="new-dm"]').addEventListener('click', () => {
        if (others[0]) {
          active = { kind: 'dm', id: others[0].id };
          renderAll();
          inputEl.focus();
          H.toast('New message to ' + byId[others[0].id].name.split(' ')[0], 'info');
        } else {
          H.toast('No teammates to message yet', 'info');
        }
      });

      /* first paint */
      renderAll();
    }
  });
})();
