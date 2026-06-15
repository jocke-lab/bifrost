/* ============================================================================
   settings.js — Settings. Where the person and the company are configured.
   Follows the HELM module contract (see command.js for the canonical shape):
     1) HELM.register({id,label,icon,scope,render})
     2) build DOM from documented .classes + HELM.charts only
     3) deterministic mock data via HELM.data (no Math.random / no Date at eval)
     4) every button wired to H.toast / H.show / H.audit.log / local state

   This is a PERSONAL module: the shell re-renders it on a user switch, so we
   READ HELM.session.user FRESH at the top of render() and build for that person.

   A LEFT section-nav (.settings-nav) swaps the RIGHT content panel across:
     1) MY PROFILE        — personal · identity, mail, connections, login, body→Vitals
     2) NOTIFICATIONS     — personal · the matrix (sources × channels) → user.notificationPrefs
     3) COMPANY RECORDS   — company  · org editor (gated by can('settings.company'))
     4) APPEARANCE        — theme/accent (HELM.setTheme) + team default notif policy
   Namespaced tweaks live in settings.css under the .settings-* prefix.
   ========================================================================== */
(function () {
  const H = window.HELM;

  /* ── COUNTRY-AWARE legal identifier sets (Company Records) ──────────────── */
  const COUNTRY_IDS = {
    SE: { flag: '🇸🇪', label: 'Sweden', fields: [
      ['orgNo', 'Org.nr', 'Bolagsverket registration'],
      ['vat', 'VAT / moms-nr', 'Skatteverket']
    ] },
    US: { flag: '🇺🇸', label: 'United States', fields: [
      ['ein', 'EIN', 'IRS employer ID'],
      ['stateId', 'State filing no.', 'Secretary of State']
    ] },
    GB: { flag: '🇬🇧', label: 'United Kingdom', fields: [
      ['crn', 'Company no. (CRN)', 'Companies House'],
      ['vat', 'VAT no.', 'HMRC']
    ] },
    DE: { flag: '🇩🇪', label: 'Germany', fields: [
      ['hrb', 'Handelsregister (HRB)', 'Amtsgericht'],
      ['vat', 'USt-IdNr.', 'Bundeszentralamt']
    ] }
  };
  const CURRENCIES = ['SEK', 'EUR', 'USD', 'GBP'];

  /* ── notification matrix definition (shared by personal + team policy) ──── */
  const NOTIF_SOURCES = [
    ['gmail',    '✉️', 'Gmail',            'New mail in a connected inbox'],
    ['approval', '✅', 'Approvals',        'Something is waiting on your sign-off'],
    ['mention',  '💬', 'Mentions',         'You were @-mentioned in Comms'],
    ['deal',     '🎯', 'Deal won',         'A pipeline deal moves to Won'],
    ['payment',  '💸', 'Payment',          'Inbound payment or payout settles'],
    ['infra',    '🔥', 'Infra incident',   'A production incident is opened'],
    ['devpush',  '📟', 'Dev push',         'New commits land on a watched repo'],
    ['meeting',  '🎥', 'Meeting starting', '10 minutes before a calendar event'],
    ['task',     '🗂️', 'Task assigned',    'A task is assigned to you']
  ];
  const NOTIF_CHANNELS = [
    ['inApp', 'In-app'],
    ['email', 'Email'],
    ['slack', 'Slack'],
    ['push',  'Push']
  ];

  H.register({
    id: 'settings',
    label: 'Settings',
    icon: '⚙️',
    scope: 'personal',          // re-render per acting user; read session fresh below
    render(root) {
      const D = H.data;
      const S = H.session;
      const me = S.user;                       // READ FRESH — re-rendered per user
      const org = S.org;
      const canCompany = S.can('settings.company');

      /* ──────────────────────────────────────────────────────────────────
         SECTION DEFINITIONS — drive the left nav + which panel is visible
      ────────────────────────────────────────────────────────────────── */
      const SECTIONS = [
        { id: 'profile', ico: '🧑', label: 'My profile', sub: 'Identity, mail & login' },
        { id: 'notifications', ico: '🔔', label: 'Notifications', sub: 'What reaches you, where' },
        { id: 'company', ico: '🏢', label: 'Company records', sub: 'Legal entity & org', gated: !canCompany },
        { id: 'appearance', ico: '🎨', label: 'Appearance', sub: 'Theme & team policy' }
      ];

      /* ──────────────────────────────────────────────────────────────────
         VIEW HEAD
      ────────────────────────────────────────────────────────────────── */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">⚙️</div>
            <div>
              <h1>Settings</h1>
              <p>Tune your own profile and alerts — and, with the right role, the company record itself.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="vitals">💗 Open Vitals</button>
            <button class="btn btn-primary btn-sm" data-act="saveall">✓ Save all</button>
          </div>
        </div>
      `));

      /* ──────────────────────────────────────────────────────────────────
         SHELL — left section nav | right content host
      ────────────────────────────────────────────────────────────────── */
      const shell = H.el(`<div class="settings-shell"></div>`);

      const pm = (H._internal.PRESENCE_META[me.presence] || H._internal.PRESENCE_META.available);
      const nav = H.el(`
        <aside class="card flush settings-navwrap">
          <div class="settings-org">
            <span class="avatar sq lg settings-orgmark">${me.avatar}</span>
            <div class="settings-orgmeta">
              <div class="settings-orgname">${me.name}</div>
              <div class="settings-orgsub">${me.title} · ${me.role}</div>
            </div>
          </div>
          <nav class="settings-nav"></nav>
          <div class="settings-navfoot">
            <div class="settings-plan-chip">
              <span class="settings-plan-name">${pm.label.toUpperCase()}</span>
              <span class="pill ${me.role === 'owner' ? 'ok' : 'info'}">${me.role.toUpperCase()}</span>
            </div>
            <div class="settings-plan-meta">${org.name} · ${COUNTRY_IDS[org.country] ? COUNTRY_IDS[org.country].label : org.country}</div>
          </div>
        </aside>
      `);
      const navEl = nav.querySelector('.settings-nav');
      SECTIONS.forEach((s, i) => {
        const btn = H.el(`
          <button class="settings-nav-btn${i === 0 ? ' active' : ''}" data-sec="${s.id}">
            <span class="settings-nav-ico">${s.ico}</span>
            <span class="settings-nav-text">
              <span class="settings-nav-label">${s.label}${s.gated ? ' <span class="settings-lock">🔒</span>' : ''}</span>
              <span class="settings-nav-sub">${s.sub}</span>
            </span>
            <span class="settings-nav-chev">›</span>
          </button>
        `);
        navEl.appendChild(btn);
      });
      shell.appendChild(nav);

      const host = H.el(`<div class="settings-host"></div>`);
      shell.appendChild(host);
      root.appendChild(shell);

      /* ──────────────────────────────────────────────────────────────────
         SHARED helpers
      ────────────────────────────────────────────────────────────────── */
      function panel(title, meta) {
        return `<div class="card-head"><h3><span class="hico">${title.ico}</span> ${title.label}</h3>${meta ? `<span class="ch-meta">${meta}</span>` : ''}</div>`;
      }
      function audit(action, summary, extra) {
        H.audit.log(Object.assign({
          action, entityType: 'Settings', entityId: me.id,
          summary, module: 'settings'
        }, extra || {}));
      }
      // a labeled toggle row (settings-toggle); on change → cb(on)
      function toggleRow(label, sub, on, cb) {
        const node = H.el(`
          <div class="settings-toggle-row">
            <div class="settings-toggle-body">
              <div class="settings-field-label">${label}</div>
              <div class="kpi-sub">${sub}</div>
            </div>
            <button class="settings-toggle${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="${label}"><span class="settings-knob"></span></button>
          </div>
        `);
        node.querySelector('.settings-toggle').addEventListener('click', (e) => {
          const t = e.currentTarget;
          const now = t.classList.toggle('on');
          t.setAttribute('aria-checked', now ? 'true' : 'false');
          if (cb) cb(now);
        });
        return node;
      }
      function gauge(node) {  // hide the gauge svg's built-in number, use overlay
        node.querySelectorAll('.settings-gauge svg text').forEach(t => { t.style.display = 'none'; });
      }

      /* =================================================================== */
      /* 1) MY PROFILE — personal                                            */
      /* =================================================================== */
      function buildProfile() {
        const wrap = H.el(`<div class="settings-panel"></div>`);

        /* — identity card — */
        const idCard = H.el(`
          <div class="card">
            ${panel({ ico: '🧑', label: 'My profile' }, 'PERSONAL')}
            <div class="settings-profilehead">
              <div class="settings-avatarwrap">
                <span class="avatar sq lg settings-bigavatar">${me.avatar}</span>
                <button class="btn btn-sm btn-ghost settings-avatar-edit" data-act="avatar">Change</button>
              </div>
              <div class="settings-fieldgrid fill"></div>
            </div>
            <div class="row between mt">
              <span class="kpi-sub">Shown on the deck, in mentions and across every module.</span>
              <button class="btn btn-sm btn-primary" data-act="profile-save">Save profile</button>
            </div>
          </div>
        `);
        const fg = idCard.querySelector('.settings-fieldgrid');
        [
          ['Full name', me.name, 'text', false, 'name'],
          ['Title', me.title, 'text', false, 'title'],
          ['Role', me.role, 'text', true, 'role'],
          ['Primary email', me.email, 'mono', true, 'email']
        ].forEach(([label, val, kind, locked, key]) => {
          fg.appendChild(H.el(`
            <label class="settings-field${locked ? ' locked' : ''}">
              <span class="settings-field-label">${label}${locked ? ' <span class="settings-lock">🔒</span>' : ''}</span>
              <input class="settings-input${kind === 'mono' ? ' mono' : ''}" value="${val}" data-key="${key}" ${locked ? 'readonly' : ''} spellcheck="false" />
            </label>
          `));
        });
        idCard.querySelector('[data-act="profile-save"]').addEventListener('click', () => {
          const name = idCard.querySelector('[data-key="name"]').value.trim() || me.name;
          const title = idCard.querySelector('[data-key="title"]').value.trim() || me.title;
          const changed = (name !== me.name) || (title !== me.title);
          me.name = name; me.title = title; me.avatar = D.initials(name);
          audit('profile.updated', `${me.name} updated their profile (name · title)`, {
            links: [{ entityType: 'Person', entityId: me.id }]
          });
          H.toast(changed ? 'Profile saved' : 'Profile saved (no changes)', 'success');
        });
        idCard.querySelector('[data-act="avatar"]').addEventListener('click', () =>
          H.toast('Avatar uploader — drop a square image', 'info'));
        wrap.appendChild(idCard);

        /* — mail identities + connected accounts — */
        const row = H.el(`<div class="grid cols-2 settings-subgrid"></div>`);

        // mail identities
        const mailCard = H.el(`
          <div class="card">
            ${panel({ ico: '📮', label: 'Mail identities' }, 'SEND-AS')}
            <div class="list settings-maillist"></div>
            <button class="btn btn-block btn-sm mt" data-act="addmail">＋ Add a send-as address</button>
          </div>
        `);
        const ml = mailCard.querySelector('.settings-maillist');
        const idents = (me.mailIdentities && me.mailIdentities.length) ? me.mailIdentities : [me.email];
        idents.forEach((addr, i) => {
          ml.appendChild(H.el(`
            <div class="list-item">
              <div class="li-ico">📧</div>
              <div class="li-body"><div class="li-title mono">${addr}</div><div class="li-sub">${i === 0 ? 'Primary · verified' : 'Alias · verified'}</div></div>
              ${i === 0 ? '<span class="tag ok">PRIMARY</span>' : '<span class="tag info">ALIAS</span>'}
            </div>
          `));
        });
        mailCard.querySelector('[data-act="addmail"]').addEventListener('click', () =>
          H.toast('Verification email sent to confirm the new address', 'info'));
        row.appendChild(mailCard);

        // connected accounts (Google / Slack / Whoop)
        const conn = me.connections || (me.connections = {});
        const connCard = H.el(`
          <div class="card">
            ${panel({ ico: '🔗', label: 'Connected accounts' }, 'PERSONAL')}
            <div class="settings-toggle-list settings-connlist"></div>
          </div>
        `);
        const cl = connCard.querySelector('.settings-connlist');
        [
          ['google', 'Google Workspace', 'Calendar, mail & contacts'],
          ['slack', 'Slack', 'DMs, mentions & alerts'],
          ['whoop', 'Whoop', 'Recovery & strain → Vitals']
        ].forEach(([key, label, sub]) => {
          cl.appendChild(toggleRow(label, sub, !!conn[key], (on) => {
            conn[key] = on;
            audit('connection.toggled', `${me.name} ${on ? 'connected' : 'disconnected'} ${label}`, {
              after: { service: key, connected: on }
            });
            H.toast(`${label} ${on ? 'connected' : 'disconnected'}`, on ? 'success' : 'info');
          }));
        });
        row.appendChild(connCard);
        wrap.appendChild(row);

        /* — login & password (mock) + body metrics hand-off to Vitals — */
        const row2 = H.el(`<div class="grid cols-2 settings-subgrid"></div>`);

        const loginCard = H.el(`
          <div class="card">
            ${panel({ ico: '🔑', label: 'Login & password' }, 'SECURITY')}
            <div class="settings-toggle-list"></div>
            <div class="row gap-sm mt">
              <button class="btn btn-sm fill" data-act="password">Change password</button>
              <button class="btn btn-sm btn-ghost" data-act="signout">Sign out everywhere</button>
            </div>
          </div>
        `);
        const lg = loginCard.querySelector('.settings-toggle-list');
        lg.appendChild(toggleRow('Two-factor authentication', 'TOTP authenticator app', true, (on) =>
          H.toast('2FA ' + (on ? 'enabled' : 'disabled — re-enable soon'), on ? 'success' : 'warn')));
        lg.appendChild(toggleRow('Passkey sign-in', 'WebAuthn on this device', !!conn.google, (on) =>
          H.toast('Passkey ' + (on ? 'armed' : 'removed'), 'info')));
        loginCard.querySelector('[data-act="password"]').addEventListener('click', () => {
          audit('password.changed', `${me.name} changed their password`);
          H.toast('Password updated', 'success');
        });
        loginCard.querySelector('[data-act="signout"]').addEventListener('click', () => {
          audit('sessions.revoked', `${me.name} signed out of all other sessions`);
          H.toast('Signed out of all other sessions', 'success');
        });
        row2.appendChild(loginCard);

        // body metrics (read/seed me.body — same model Vitals uses) → hand off
        const body = me.body || (me.body = {});
        if (body.weightKg == null) {
          const seed = (function () {
            const r = D.seed('settings-body-' + me.id);
            return { weightKg: 60 + Math.round(r() * 35), heightCm: 162 + Math.round(r() * 26), age: 26 + Math.round(r() * 24), sex: r() > 0.5 ? 'male' : 'female' };
          })();
          body.weightKg = seed.weightKg; body.heightCm = seed.heightCm; body.age = seed.age; body.sex = seed.sex;
        }
        const bmi = +(body.weightKg / Math.pow(body.heightCm / 100, 2)).toFixed(1);
        const bmiState = bmi < 18.5 ? 'LOW' : bmi < 25 ? 'HEALTHY' : bmi < 30 ? 'ELEVATED' : 'HIGH';
        const bodyCard = H.el(`
          <div class="card settings-scorecard">
            ${panel({ ico: '💗', label: 'Body metrics' }, 'FEEDS VITALS')}
            <div class="settings-bodygrid"></div>
            <div class="settings-bmibar">
              <div class="row between">
                <span class="settings-field-label">BMI</span>
                <span class="sr-val mono">${bmi} <span class="muted">· ${bmiState}</span></span>
              </div>
              <div class="progress mt-sm"><div class="bar${bmi >= 30 ? ' bad' : bmi >= 25 ? ' warn' : ''}" style="width:0" data-w="${Math.max(6, Math.min(100, Math.round((bmi / 40) * 100)))}"></div></div>
            </div>
            <div class="row gap-sm mt">
              <button class="btn btn-sm btn-primary fill" data-act="body-save">Save & sync to Vitals</button>
              <button class="btn btn-sm btn-ghost" data-act="open-vitals">Open Vitals →</button>
            </div>
          </div>
        `);
        const bgrid = bodyCard.querySelector('.settings-bodygrid');
        [
          ['Weight', body.weightKg, 'kg', 'weightKg', 'number'],
          ['Height', body.heightCm, 'cm', 'heightCm', 'number'],
          ['Age', body.age, 'yrs', 'age', 'number'],
          ['Sex', body.sex, '', 'sex', 'text']
        ].forEach(([label, val, unit, key, type]) => {
          bgrid.appendChild(H.el(`
            <label class="settings-field">
              <span class="settings-field-label">${label}${unit ? ' · ' + unit : ''}</span>
              <input class="settings-input mono" type="${type}" value="${val}" data-bkey="${key}" spellcheck="false" />
            </label>
          `));
        });
        bodyCard.querySelector('[data-act="body-save"]').addEventListener('click', () => {
          bgrid.querySelectorAll('[data-bkey]').forEach(inp => {
            const k = inp.dataset.bkey;
            body[k] = (k === 'sex') ? inp.value.trim().toLowerCase() : (parseFloat(inp.value) || body[k]);
          });
          audit('body.updated', `${me.name} updated body metrics (${body.weightKg} kg · ${body.heightCm} cm)`, {
            entityType: 'Body', after: { weightKg: body.weightKg, heightCm: body.heightCm, age: body.age, sex: body.sex },
            links: [{ entityType: 'Person', entityId: me.id }]
          });
          if (H.rerender) H.rerender('vitals');     // hand-off: Vitals recomputes BMR/TDEE
          H.toast('Body metrics saved — synced to Vitals', 'success');
        });
        bodyCard.querySelector('[data-act="open-vitals"]').addEventListener('click', () => H.show('vitals'));
        row2.appendChild(bodyCard);
        wrap.appendChild(row2);

        wrap.__afterMount = () => gauge(wrap);
        return wrap;
      }

      /* =================================================================== */
      /* 2) NOTIFICATION CONTROL CENTER — personal · the matrix              */
      /* =================================================================== */
      // resolve the persisted pref for a (source, channel), with sane defaults
      function prefDefault(srcKey, chKey) {
        if (chKey === 'inApp') return true;                 // in-app on by default
        if (chKey === 'email') return ['gmail', 'approval', 'payment', 'infra'].includes(srcKey);
        if (chKey === 'slack') return ['mention', 'deal', 'infra', 'devpush'].includes(srcKey);
        if (chKey === 'push') return ['approval', 'infra', 'meeting'].includes(srcKey);
        return false;
      }
      function readPref(prefs, srcKey, chKey) {
        const cell = prefs[srcKey];
        if (cell && typeof cell[chKey] === 'boolean') return cell[chKey];
        return prefDefault(srcKey, chKey);
      }
      function writePref(prefs, srcKey, chKey, on) {
        (prefs[srcKey] = prefs[srcKey] || {})[chKey] = on;
      }

      function buildNotifications() {
        const wrap = H.el(`<div class="settings-panel"></div>`);
        const prefs = me.notificationPrefs || (me.notificationPrefs = {});

        // intro / what this drives
        wrap.appendChild(H.el(`
          <div class="attn info">
            <span class="a-ico">🔔</span>
            <div class="a-body">
              <div class="a-title">This is your notification control center</div>
              <div class="a-sub">Every toggle below is what the bell and the Notification Center actually read for ${me.name.split(' ')[0]}.</div>
            </div>
            <button class="btn btn-sm" data-act="opennotif">Open center</button>
          </div>
        `));

        // THE MATRIX — rows = sources, cols = channels
        const matrixCard = H.el(`
          <div class="card flush settings-matrixcard">
            <div class="card-head" style="padding:16px 16px 13px">
              <h3><span class="hico">🎚️</span> Notification matrix</h3>
              <span class="ch-meta">${NOTIF_SOURCES.length} EVENTS × ${NOTIF_CHANNELS.length} CHANNELS</span>
            </div>
            <div class="settings-matrix">
              <div class="settings-matrix-head"></div>
              <div class="settings-matrix-body"></div>
            </div>
          </div>
        `);
        const mhead = matrixCard.querySelector('.settings-matrix-head');
        mhead.appendChild(H.el(`<span class="settings-matrix-rowlabel settings-matrix-corner">EVENT SOURCE</span>`));
        NOTIF_CHANNELS.forEach(([, label]) =>
          mhead.appendChild(H.el(`<span class="settings-matrix-col">${label}</span>`)));

        const mbody = matrixCard.querySelector('.settings-matrix-body');
        NOTIF_SOURCES.forEach(([srcKey, ico, label, sub]) => {
          const rowEl = H.el(`
            <div class="settings-matrix-row">
              <span class="settings-matrix-rowlabel">
                <span class="settings-matrix-ico">${ico}</span>
                <span class="settings-matrix-text"><span class="settings-matrix-name">${label}</span><span class="settings-matrix-sub">${sub}</span></span>
              </span>
            </div>
          `);
          NOTIF_CHANNELS.forEach(([chKey]) => {
            const on = readPref(prefs, srcKey, chKey);
            const cell = H.el(`
              <span class="settings-matrix-cell">
                <button class="settings-toggle settings-toggle-sm${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="${label} · ${chKey}" data-src="${srcKey}" data-ch="${chKey}"><span class="settings-knob"></span></button>
              </span>
            `);
            cell.querySelector('.settings-toggle').addEventListener('click', (e) => {
              const t = e.currentTarget;
              const now = t.classList.toggle('on');
              t.setAttribute('aria-checked', now ? 'true' : 'false');
              writePref(prefs, srcKey, chKey, now);
            });
            rowEl.appendChild(cell);
          });
          mbody.appendChild(rowEl);
        });
        wrap.appendChild(matrixCard);

        // save / reset bar + global mute
        const ctrl = H.el(`
          <div class="grid cols-2 settings-subgrid"></div>
        `);
        ctrl.appendChild(H.el(`
          <div class="card">
            ${panel({ ico: '🌙', label: 'Quiet hours' }, 'DO NOT DISTURB')}
            <div class="settings-toggle-list settings-quietlist"></div>
            <div class="stat-row"><span class="sr-label">Window</span><span class="sr-val">21:00 – 07:00</span></div>
            <div class="stat-row"><span class="sr-label">Always pass through</span><span class="sr-val">Payment · Infra incident</span></div>
          </div>
        `));
        const ql = ctrl.querySelector('.settings-quietlist');
        ql.appendChild(toggleRow('Mute non-critical alerts', 'Outside working hours', true, (on) =>
          H.toast('Quiet hours ' + (on ? 'on' : 'off'), on ? 'success' : 'info')));
        ql.appendChild(toggleRow('Weekend mode', 'Critical-only on Sat & Sun', true, (on) =>
          H.toast('Weekend mode ' + (on ? 'on' : 'off'), 'info')));

        ctrl.appendChild(H.el(`
          <div class="card settings-prefsave">
            ${panel({ ico: '💾', label: 'Apply preferences' }, 'PER PERSON')}
            <p class="kpi-sub" style="margin-bottom:14px">Save writes the matrix to your profile so the bell honours it immediately. Reset restores HELM defaults.</p>
            <div class="row gap-sm">
              <button class="btn btn-primary fill" data-act="prefs-save">Save preferences</button>
              <button class="btn btn-ghost" data-act="prefs-reset">Reset</button>
            </div>
          </div>
        `));
        wrap.appendChild(ctrl);

        // wire save / reset
        wrap.querySelector('[data-act="prefs-save"]').addEventListener('click', () => {
          let count = 0;
          NOTIF_SOURCES.forEach(([srcKey]) => NOTIF_CHANNELS.forEach(([chKey]) => {
            if (prefs[srcKey] && typeof prefs[srcKey][chKey] === 'boolean') count++;
          }));
          audit('notifications.updated', `${me.name} updated notification preferences (${count} overrides set)`, {
            entityType: 'NotificationPrefs', after: { overrides: count },
            links: [{ entityType: 'Person', entityId: me.id }]
          });
          H.toast('Notification preferences saved', 'success');
        });
        wrap.querySelector('[data-act="prefs-reset"]').addEventListener('click', () => {
          Object.keys(prefs).forEach(k => delete prefs[k]);
          audit('notifications.reset', `${me.name} reset notification preferences to defaults`, {
            entityType: 'NotificationPrefs', links: [{ entityType: 'Person', entityId: me.id }]
          });
          // repaint matrix cells to defaults
          mbody.querySelectorAll('.settings-toggle[data-src]').forEach(t => {
            const on = prefDefault(t.dataset.src, t.dataset.ch);
            t.classList.toggle('on', on);
            t.setAttribute('aria-checked', on ? 'true' : 'false');
          });
          H.toast('Preferences reset to HELM defaults', 'info');
        });
        wrap.querySelector('[data-act="opennotif"]').addEventListener('click', () => H.openNotif());
        return wrap;
      }

      /* =================================================================== */
      /* 3) COMPANY RECORDS — company · gated by can('settings.company')     */
      /* =================================================================== */
      function buildCompany() {
        const wrap = H.el(`<div class="settings-panel"></div>`);

        if (!canCompany) {
          wrap.appendChild(H.el(`
            <div class="card settings-gatecard">
              <div class="settings-gate-ico">🔒</div>
              <h3>Company records are admin-only</h3>
              <p class="kpi-sub">You're signed in as <b>${me.name}</b> (${me.role}). Editing the legal entity, identifiers and fiscal setup needs an <b>admin</b> or <b>owner</b> seat.</p>
              <div class="settings-gate-meta">
                <div class="stat-row"><span class="sr-label">Legal name</span><span class="sr-val">${org.name}</span></div>
                <div class="stat-row"><span class="sr-label">Country</span><span class="sr-val">${COUNTRY_IDS[org.country] ? COUNTRY_IDS[org.country].flag + ' ' + COUNTRY_IDS[org.country].label : org.country}</span></div>
                <div class="stat-row"><span class="sr-label">Currency</span><span class="sr-val">${org.fiscalCurrency}</span></div>
              </div>
              <button class="btn btn-sm btn-ghost mt" data-act="switchadmin">Switch to an admin to edit</button>
            </div>
          `));
          wrap.querySelector('[data-act="switchadmin"]').addEventListener('click', () =>
            H.toast('Use the profile chip (top-right) to switch identity', 'info'));
          return wrap;
        }

        const ids = org.identifiers || (org.identifiers = {});
        const addr = (org.addresses && org.addresses[0]) || (org.addresses = [{}], org.addresses[0]);
        const cc = COUNTRY_IDS[org.country] || COUNTRY_IDS.SE;
        const contact = S.team.find(p => p.id === org.primaryContactId) || me;

        /* — org profile (logo + name + address) — */
        const profile = H.el(`
          <div class="card">
            ${panel({ ico: '🏢', label: 'Company records' }, 'LEGAL ENTITY')}
            <div class="settings-brandrow">
              <span class="avatar sq lg settings-orgmark" style="font-size:18px">${D.initials(org.name)}</span>
              <div class="fill">
                <div class="settings-field-label">Logo & mark</div>
                <div class="kpi-sub">Used on invoices, the deck, PDFs and the customer portal.</div>
              </div>
              <button class="btn btn-sm" data-act="logo">Replace</button>
            </div>
            <div class="settings-fieldgrid"></div>
          </div>
        `);
        const fg = profile.querySelector('.settings-fieldgrid');
        const FIELDS = [
          ['Legal name', org.name, 'text', false, 'name'],
          ['Address', addr.line1 || '', 'text', false, 'line1'],
          ['Postal / ZIP', addr.zip || '', 'mono', false, 'zip'],
          ['City', addr.city || '', 'text', false, 'city']
        ];
        FIELDS.forEach(([label, val, kind, locked, key]) => {
          fg.appendChild(H.el(`
            <label class="settings-field">
              <span class="settings-field-label">${label}</span>
              <input class="settings-input${kind === 'mono' ? ' mono' : ''}" value="${val}" data-okey="${key}" spellcheck="false" />
            </label>
          `));
        });
        profile.querySelector('[data-act="logo"]').addEventListener('click', () =>
          H.toast('Logo uploader — square PNG/SVG recommended', 'info'));
        wrap.appendChild(profile);

        /* — country-aware identifiers + fiscal + contact — */
        const row = H.el(`<div class="grid cols-2 settings-subgrid"></div>`);

        // identifiers (country-aware set)
        const idCard = H.el(`
          <div class="card">
            ${panel({ ico: '🪪', label: 'Registration & identifiers' }, cc.flag + ' ' + cc.label.toUpperCase())}
            <label class="settings-field">
              <span class="settings-field-label">Country of registration</span>
              <select class="settings-input settings-select" data-okey="country"></select>
            </label>
            <div class="settings-fieldgrid settings-idfields" style="margin-top:13px"></div>
          </div>
        `);
        const sel = idCard.querySelector('[data-okey="country"]');
        Object.keys(COUNTRY_IDS).forEach(code => {
          const o = COUNTRY_IDS[code];
          sel.appendChild(H.el(`<option value="${code}"${code === org.country ? ' selected' : ''}>${o.flag} ${o.label}</option>`));
        });
        const idFields = idCard.querySelector('.settings-idfields');
        function paintIdFields(code) {
          idFields.innerHTML = '';
          (COUNTRY_IDS[code] || cc).fields.forEach(([key, label, sub]) => {
            idFields.appendChild(H.el(`
              <label class="settings-field">
                <span class="settings-field-label">${label}</span>
                <input class="settings-input mono" value="${ids[key] || ''}" data-idkey="${key}" placeholder="${sub}" spellcheck="false" />
              </label>
            `));
          });
        }
        paintIdFields(org.country);
        sel.addEventListener('change', () => paintIdFields(sel.value));
        row.appendChild(idCard);

        // fiscal + primary contact
        const fiscalCard = H.el(`
          <div class="card">
            ${panel({ ico: '🧮', label: 'Fiscal & contact' }, 'BOOKKEEPING')}
            <div class="settings-fieldgrid"></div>
            <div class="stat-row mt"><span class="sr-label">Primary contact</span><span class="sr-val">${contact.name} · ${contact.role}</span></div>
            <div class="settings-contactpick"></div>
          </div>
        `);
        const ffg = fiscalCard.querySelector('.settings-fieldgrid');
        ffg.appendChild(H.el(`
          <label class="settings-field">
            <span class="settings-field-label">Fiscal currency</span>
            <select class="settings-input settings-select" data-okey="fiscalCurrency">
              ${CURRENCIES.map(c => `<option value="${c}"${c === org.fiscalCurrency ? ' selected' : ''}>${c}</option>`).join('')}
            </select>
          </label>
        `));
        ffg.appendChild(H.el(`
          <label class="settings-field">
            <span class="settings-field-label">Fiscal year starts</span>
            <input class="settings-input mono" value="${org.fiscalYearStart || '01-01'}" data-okey="fiscalYearStart" placeholder="MM-DD" spellcheck="false" />
          </label>
        `));
        const cpick = fiscalCard.querySelector('.settings-contactpick');
        const csel = H.el(`<select class="settings-input settings-select" data-okey="primaryContactId"></select>`);
        S.team.forEach(p => csel.appendChild(H.el(`<option value="${p.id}"${p.id === org.primaryContactId ? ' selected' : ''}>${p.name} · ${p.role}</option>`)));
        cpick.appendChild(csel);
        row.appendChild(fiscalCard);
        wrap.appendChild(row);

        /* — metadata line (read-only) + save — */
        const stamp = H.el(`
          <div class="card settings-metacard">
            <div class="settings-metaline"></div>
            <div class="row between mt">
              <span class="kpi-sub">Saving stamps a new “last modified by” entry and writes to the audit log.</span>
              <button class="btn btn-sm btn-primary" data-act="company-save">Save company record</button>
            </div>
          </div>
        `);
        function paintMeta() {
          const created = (org.createdAt || '').slice(0, 10);
          const updated = (org.updatedAt || '').slice(0, 10);
          const by = S.team.find(p => p.id === org.updatedBy);
          stamp.querySelector('.settings-metaline').innerHTML = `
            <span class="settings-metachip">📅 Created <b>${created}</b></span>
            <span class="settings-metachip">✎ Updated <b>${updated}</b></span>
            <span class="settings-metachip">👤 Last modified by <b>${by ? by.name : (org.updatedBy || 'system')}</b></span>`;
        }
        paintMeta();
        wrap.appendChild(stamp);

        stamp.querySelector('[data-act="company-save"]').addEventListener('click', () => {
          // collect org-level fields
          wrap.querySelectorAll('[data-okey]').forEach(inp => {
            const k = inp.dataset.okey, v = inp.value.trim();
            if (k === 'name') org.name = v || org.name;
            else if (k === 'line1' || k === 'zip' || k === 'city') addr[k] = v;
            else if (k === 'country') org.country = v;
            else if (k === 'fiscalCurrency') org.fiscalCurrency = v;
            else if (k === 'fiscalYearStart') org.fiscalYearStart = v || org.fiscalYearStart;
            else if (k === 'primaryContactId') org.primaryContactId = v;
          });
          // identifiers (only those currently shown for the chosen country)
          idFields.querySelectorAll('[data-idkey]').forEach(inp => { ids[inp.dataset.idkey] = inp.value.trim(); });
          // stamp metadata
          const nowISO = new Date().toISOString();
          org.updatedAt = nowISO; org.updatedBy = me.id;
          audit('company.updated', `${me.name} updated the company record for ${org.name}`, {
            entityType: 'Company', entityId: org.id,
            after: { name: org.name, country: org.country, currency: org.fiscalCurrency },
            links: [{ entityType: 'Company', entityId: org.id }]
          });
          paintMeta();
          H.toast('Company record saved', 'success');
        });
        return wrap;
      }

      /* =================================================================== */
      /* 4) APPEARANCE — theme/accent + team default notification policy     */
      /* =================================================================== */
      function buildAppearance() {
        const wrap = H.el(`<div class="settings-panel"></div>`);

        const row = H.el(`<div class="grid cols-2 settings-subgrid"></div>`);

        // theme / accent — reuse HELM.setTheme
        const THEMES = [
          ['aurora', 'Aurora', '#00E5D1', '#34C3FF'],
          ['violet', 'Violet', '#7C6CFF', '#34C3FF'],
          ['amber', 'Amber', '#F5A524', '#FF7A59'],
          ['rose', 'Rose', '#FF4D6D', '#7C6CFF']
        ];
        const themeCard = H.el(`
          <div class="card">
            ${panel({ ico: '🎨', label: 'Theme & accent' }, 'PERSONAL')}
            <p class="kpi-sub" style="margin-bottom:13px">The accent tints charts, glows and active states across the whole deck.</p>
            <div class="settings-themes"></div>
          </div>
        `);
        const tg = themeCard.querySelector('.settings-themes');
        THEMES.forEach(([key, label, a1, a2]) => {
          const sw = H.el(`
            <button class="settings-themeswatch" data-theme="${key}" aria-label="${label}">
              <span class="settings-themedot" style="background:linear-gradient(120deg,${a1},${a2})"></span>
              <span class="settings-themename">${label}</span>
            </button>
          `);
          sw.addEventListener('click', () => {
            H.setTheme(key);
            tg.querySelectorAll('.settings-themeswatch').forEach(b => b.classList.toggle('active', b === sw));
            audit('theme.changed', `${me.name} switched the accent theme to ${label}`, { after: { theme: key } });
            H.toast('Accent set to ' + label, 'success');
          });
          tg.appendChild(sw);
        });
        tg.firstElementChild.classList.add('active');
        row.appendChild(themeCard);

        // density toggle (decorative personal pref)
        const densCard = H.el(`
          <div class="card">
            ${panel({ ico: '🖥️', label: 'Display' }, 'PERSONAL')}
            <div class="settings-toggle-list"></div>
          </div>
        `);
        const dl = densCard.querySelector('.settings-toggle-list');
        dl.appendChild(toggleRow('Dense layout', 'Tighter spacing, more on screen', true, (on) =>
          H.toast('Dense layout ' + (on ? 'on' : 'off'), 'info')));
        dl.appendChild(toggleRow('Animated background', 'Drifting starfield behind the deck', true, (on) =>
          H.toast('Background animation ' + (on ? 'on' : 'off'), 'info')));
        dl.appendChild(toggleRow('Reduce motion', 'Calmer transitions', false, (on) =>
          H.toast('Reduced motion ' + (on ? 'on' : 'off'), 'info')));
        row.appendChild(densCard);
        wrap.appendChild(row);

        // team default notification policy (company default — gated)
        const policyCard = H.el(`
          <div class="card flush settings-policycard">
            <div class="card-head" style="padding:16px 16px 13px">
              <h3><span class="hico">📣</span> Team default notification policy</h3>
              <span class="ch-meta">${canCompany ? 'COMPANY DEFAULT' : 'VIEW ONLY 🔒'}</span>
            </div>
            <div class="settings-policy"></div>
          </div>
        `);
        const pol = policyCard.querySelector('.settings-policy');
        // the channel each NEW hire gets by default for each source
        const TEAM_DEFAULTS = [
          ['gmail', 'In-app only'],
          ['approval', 'In-app + Email + Push'],
          ['mention', 'In-app + Slack'],
          ['deal', 'In-app + Slack'],
          ['payment', 'In-app + Email'],
          ['infra', 'All channels'],
          ['devpush', 'Slack'],
          ['meeting', 'In-app + Push'],
          ['task', 'In-app']
        ];
        const SRC_MAP = {};
        NOTIF_SOURCES.forEach(([k, ico, label]) => { SRC_MAP[k] = [ico, label]; });
        TEAM_DEFAULTS.forEach(([srcKey, chans]) => {
          const [ico, label] = SRC_MAP[srcKey];
          const node = H.el(`
            <div class="settings-policyrow">
              <span class="settings-matrix-ico">${ico}</span>
              <span class="settings-policy-name">${label}</span>
              <span class="settings-policy-chans">${chans}</span>
              <button class="btn btn-sm btn-ghost settings-policy-edit"${canCompany ? '' : ' disabled title="Needs admin role"'}>Edit</button>
            </div>
          `);
          const eb = node.querySelector('.settings-policy-edit');
          if (canCompany) eb.addEventListener('click', () => {
            audit('notif.policy.updated', `${me.name} edited the team default policy for ${label}`, {
              entityType: 'NotificationPolicy', after: { source: srcKey }
            });
            H.toast('Team default updated · ' + label, 'success');
          });
          pol.appendChild(node);
        });
        wrap.appendChild(policyCard);
        return wrap;
      }

      /* ──────────────────────────────────────────────────────────────────
         PANEL ROUTER — swap which panel is visible
      ────────────────────────────────────────────────────────────────── */
      const BUILDERS = {
        profile: buildProfile,
        notifications: buildNotifications,
        company: buildCompany,
        appearance: buildAppearance
      };
      const cache = {};
      let activeSec = null;

      function animateBars(node) {
        node.querySelectorAll('.bar[data-w]').forEach(bar => {
          setTimeout(() => { bar.style.width = bar.dataset.w + '%'; }, 240);
        });
      }

      function showSection(id) {
        if (id === activeSec) return;
        activeSec = id;
        navEl.querySelectorAll('.settings-nav-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.sec === id));
        host.innerHTML = '';
        let node = cache[id];
        if (!node) { node = BUILDERS[id](); cache[id] = node; }
        host.appendChild(node);
        if (node.__afterMount) node.__afterMount();
        animateBars(node);
        H.countAll(node);
        host.scrollTop = 0;
      }

      navEl.querySelectorAll('.settings-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => showSection(btn.dataset.sec));
      });

      /* ──────────────────────────────────────────────────────────────────
         WIRE VIEW-HEAD ACTIONS (no global keys — shell owns ⌘K)
      ────────────────────────────────────────────────────────────────── */
      const headWire = (sel, fn) => { const b = root.querySelector(sel); if (b) b.addEventListener('click', fn); };
      headWire('[data-act="vitals"]', () => H.show('vitals'));
      headWire('[data-act="saveall"]', () => {
        audit('settings.saved', `${me.name} saved all settings`);
        H.toast('All settings saved', 'success');
      });

      /* default panel → My profile */
      showSection('profile');
    }
  });
})();
