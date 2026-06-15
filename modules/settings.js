/* ============================================================================
   settings.js — Settings. Slim and real. Two sections, nothing fake:
     1) Profile — display name + title (persisted to localStorage('helm.profile')),
        your real sign-in email (read-only), and body metrics that feed Vitals
        + the Dashboard (persisted to localStorage('helm.body')).
     2) Appearance — accent theme (real, applied instantly via HELM.setTheme).
   Operator/company controls for the NFT platform live in the NFT Site tab.
   ========================================================================== */
(function () {
  const H = window.HELM;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function loadJSON(k) { try { const v = JSON.parse(localStorage.getItem(k)); return (v && typeof v === 'object') ? v : {}; } catch (e) { return {}; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  H.register({
    id: 'settings', label: 'Settings', icon: '⚙️', scope: 'personal',
    render(root) {
      const S = H.session;
      const me = S.user;

      const SECTIONS = [
        { id: 'profile', ico: '🧑', label: 'Profile', sub: 'Name, email & body metrics' },
        { id: 'workspace', ico: '🧩', label: 'Workspace', sub: 'Show or hide sections' },
        { id: 'appearance', ico: '🎨', label: 'Appearance', sub: 'Accent theme' }
      ];

      root.innerHTML = `
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">⚙️</div>
            <div><h1>Settings</h1><p>Your profile, body metrics and the look of the deck.</p></div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="vitals">💗 Open Vitals</button>
          </div>
        </div>`;

      const shell = H.el(`<div class="settings-shell"></div>`);
      const nav = H.el(`
        <aside class="card flush settings-navwrap">
          <div class="settings-org">
            <span class="avatar sq lg settings-orgmark">${esc(me.avatar)}</span>
            <div class="settings-orgmeta">
              <div class="settings-orgname">${esc(me.name)}</div>
              <div class="settings-orgsub">${esc(me.title)} · ${esc(me.role)}</div>
            </div>
          </div>
          <nav class="settings-nav"></nav>
          <div class="settings-navfoot">
            <div class="settings-plan-chip">
              <span class="settings-plan-name">OWNER</span>
              <span class="pill ok">${esc(S.org.name)}</span>
            </div>
          </div>
        </aside>`);
      const navEl = nav.querySelector('.settings-nav');
      SECTIONS.forEach((s, i) => navEl.appendChild(H.el(`
        <button class="settings-nav-btn${i === 0 ? ' active' : ''}" data-sec="${s.id}">
          <span class="settings-nav-ico">${s.ico}</span>
          <span class="settings-nav-text"><span class="settings-nav-label">${s.label}</span><span class="settings-nav-sub">${s.sub}</span></span>
          <span class="settings-nav-chev">›</span>
        </button>`)));
      shell.appendChild(nav);
      const host = H.el(`<div class="settings-host"></div>`);
      shell.appendChild(host);
      root.appendChild(shell);

      function panel(ico, label, meta) {
        return `<div class="card-head"><h3><span class="hico">${ico}</span> ${label}</h3>${meta ? `<span class="ch-meta">${meta}</span>` : ''}</div>`;
      }

      /* ── 1) PROFILE ── */
      function buildProfile() {
        const wrap = H.el(`<div class="settings-panel"></div>`);

        const idCard = H.el(`
          <div class="card">
            ${panel('🧑', 'My profile', 'PERSONAL')}
            <div class="settings-fieldgrid"></div>
            <div class="row between mt">
              <span class="kpi-sub">Your display name shows on the deck and on signed documents.</span>
              <button class="btn btn-sm btn-primary" data-act="profile-save">Save profile</button>
            </div>
          </div>`);
        const fg = idCard.querySelector('.settings-fieldgrid');
        [
          ['Display name', me.name, false, 'name'],
          ['Title', me.title, false, 'title'],
          ['Sign-in email', me.email, true, 'email']
        ].forEach(([label, val, locked, key]) => {
          fg.appendChild(H.el(`
            <label class="settings-field${locked ? ' locked' : ''}">
              <span class="settings-field-label">${label}${locked ? ' <span class="settings-lock">🔒</span>' : ''}</span>
              <input class="settings-input${key === 'email' ? ' mono' : ''}" value="${esc(val)}" data-key="${key}" ${locked ? 'readonly' : ''} spellcheck="false" />
            </label>`));
        });
        idCard.querySelector('[data-act="profile-save"]').addEventListener('click', () => {
          const name = idCard.querySelector('[data-key="name"]').value.trim() || me.name;
          const title = idCard.querySelector('[data-key="title"]').value.trim() || me.title;
          me.name = name; me.title = title; me.avatar = H.data.initials(name);
          saveJSON('helm.profile', { name, title });
          // refresh the topbar chip + this panel header
          if (H.rerender) H.rerender('settings');
          H.toast('Profile saved', 'success');
        });
        wrap.appendChild(idCard);

        /* body metrics → feed Vitals + Dashboard (persisted) */
        const stored = loadJSON('helm.body');
        const body = {
          weightKg: stored.weightKg ?? '', heightCm: stored.heightCm ?? '',
          age: stored.age ?? '', sex: stored.sex || 'male'
        };
        const bodyCard = H.el(`
          <div class="card settings-scorecard">
            ${panel('💗', 'Body metrics', 'FEEDS VITALS + DASHBOARD')}
            <div class="settings-bodygrid"></div>
            <div class="settings-bmibar">
              <div class="row between"><span class="settings-field-label">BMI</span><span class="sr-val mono" data-out="bmi">—</span></div>
              <div class="progress mt-sm"><div class="bar" data-out="bmibar" style="width:0"></div></div>
            </div>
            <div class="row gap-sm mt">
              <button class="btn btn-sm btn-primary fill" data-act="body-save">Save &amp; sync to Vitals</button>
              <button class="btn btn-sm btn-ghost" data-act="open-vitals">Open Vitals →</button>
            </div>
          </div>`);
        const bgrid = bodyCard.querySelector('.settings-bodygrid');
        [
          ['Weight · kg', body.weightKg, 'weightKg', 'number'],
          ['Height · cm', body.heightCm, 'heightCm', 'number'],
          ['Age · yrs', body.age, 'age', 'number'],
          ['Sex', body.sex, 'sex', 'text']
        ].forEach(([label, val, key, type]) => {
          bgrid.appendChild(H.el(`
            <label class="settings-field">
              <span class="settings-field-label">${label}</span>
              <input class="settings-input mono" type="${type}" value="${esc(val)}" data-bkey="${key}" placeholder="—" spellcheck="false" />
            </label>`));
        });
        function paintBMI() {
          const w = parseFloat(bgrid.querySelector('[data-bkey="weightKg"]').value);
          const h = parseFloat(bgrid.querySelector('[data-bkey="heightCm"]').value);
          const o = bodyCard.querySelector('[data-out="bmi"]');
          const bar = bodyCard.querySelector('[data-out="bmibar"]');
          if (w > 0 && h > 0) {
            const bmi = +(w / Math.pow(h / 100, 2)).toFixed(1);
            const state = bmi < 18.5 ? 'LOW' : bmi < 25 ? 'HEALTHY' : bmi < 30 ? 'ELEVATED' : 'HIGH';
            o.innerHTML = `${bmi} <span class="muted">· ${state}</span>`;
            bar.style.width = Math.max(6, Math.min(100, Math.round((bmi / 40) * 100))) + '%';
            bar.className = 'bar' + (bmi >= 30 ? ' bad' : bmi >= 25 ? ' warn' : '');
          } else { o.textContent = '—'; bar.style.width = '0'; bar.className = 'bar'; }
        }
        bgrid.querySelectorAll('[data-bkey]').forEach(inp => inp.addEventListener('input', paintBMI));
        paintBMI();
        bodyCard.querySelector('[data-act="body-save"]').addEventListener('click', () => {
          const next = {};
          bgrid.querySelectorAll('[data-bkey]').forEach(inp => {
            const k = inp.dataset.bkey;
            next[k] = (k === 'sex') ? (inp.value.trim().toLowerCase() || 'male') : (parseFloat(inp.value) || null);
          });
          saveJSON('helm.body', next);
          if (me) me.body = Object.assign({}, me.body, next);
          try { document.dispatchEvent(new CustomEvent('helm:body')); } catch (e) {}
          if (H.rerender) H.rerender('vitals');
          H.toast('Body metrics saved — synced to Vitals & Dashboard', 'success');
        });
        bodyCard.querySelector('[data-act="open-vitals"]').addEventListener('click', () => H.show('vitals'));
        wrap.appendChild(bodyCard);
        return wrap;
      }

      /* ── 2) APPEARANCE ── */
      function buildAppearance() {
        const wrap = H.el(`<div class="settings-panel"></div>`);
        const THEMES = [
          ['aurora', 'Aurora', '#19D3FF', '#4D8DFF'],
          ['violet', 'Violet', '#7C6CFF', '#34C3FF'],
          ['amber', 'Amber', '#F5A524', '#FF7A59'],
          ['rose', 'Rose', '#FF4D6D', '#7C6CFF']
        ];
        const card = H.el(`
          <div class="card">
            ${panel('🎨', 'Theme & accent', 'APPLIES INSTANTLY')}
            <p class="kpi-sub" style="margin-bottom:13px">The accent tints charts, glows and active states across the whole deck.</p>
            <div class="settings-themes"></div>
          </div>`);
        const tg = card.querySelector('.settings-themes');
        const cur = (localStorage.getItem('helm.theme') || 'aurora');
        THEMES.forEach(([key, label, a1, a2]) => {
          const sw = H.el(`
            <button class="settings-themeswatch${key === cur ? ' active' : ''}" data-theme="${key}" aria-label="${label}">
              <span class="settings-themedot" style="background:linear-gradient(120deg,${a1},${a2})"></span>
              <span class="settings-themename">${label}</span>
            </button>`);
          sw.addEventListener('click', () => {
            H.setTheme(key);
            try { localStorage.setItem('helm.theme', key); } catch (e) {}
            tg.querySelectorAll('.settings-themeswatch').forEach(b => b.classList.toggle('active', b === sw));
            H.toast('Accent set to ' + label, 'success');
          });
          tg.appendChild(sw);
        });
        wrap.appendChild(card);
        return wrap;
      }

      /* ── WORKSPACE — show/hide deck sections ── */
      function toggleRow(label, sub, on, cb) {
        const node = H.el(`
          <div class="settings-toggle-row">
            <div class="settings-toggle-body"><div class="settings-field-label">${esc(label)}</div><div class="kpi-sub">${esc(sub)}</div></div>
            <button class="settings-toggle${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(label)}"><span class="settings-knob"></span></button>
          </div>`);
        node.querySelector('.settings-toggle').addEventListener('click', (e) => {
          const t = e.currentTarget; const now = t.classList.toggle('on'); t.setAttribute('aria-checked', now ? 'true' : 'false'); if (cb) cb(now);
        });
        return node;
      }
      function buildWorkspace() {
        const wrap = H.el(`<div class="settings-panel"></div>`);
        const card = H.el(`
          <div class="card">
            ${panel('🧩', 'Deck sections', 'SHOW / HIDE')}
            <p class="kpi-sub" style="margin-bottom:13px">Turn sections on or off. Hidden sections leave the sidebar immediately.</p>
            <div class="settings-toggle-list" id="ws-toggles"></div>
          </div>`);
        const list = card.querySelector('#ws-toggles');
        let vitalsOn = true; try { vitalsOn = localStorage.getItem('helm.show.vitals') !== '0'; } catch (e) {}
        list.appendChild(toggleRow('Vitals', 'Per-employee health tracker', vitalsOn, (on) => {
          try { localStorage.setItem('helm.show.vitals', on ? '1' : '0'); } catch (e) {}
          if (H.rebuildNav) H.rebuildNav();
          H.toast('Vitals ' + (on ? 'shown' : 'hidden'), on ? 'success' : 'info');
        }));
        wrap.appendChild(card);
        return wrap;
      }

      const BUILDERS = { profile: buildProfile, workspace: buildWorkspace, appearance: buildAppearance };
      const cache = {};
      let activeSec = null;
      function showSection(id) {
        if (id === activeSec) return;
        activeSec = id;
        navEl.querySelectorAll('.settings-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.sec === id));
        host.innerHTML = '';
        let node = cache[id] || (cache[id] = BUILDERS[id]());
        host.appendChild(node);
        host.scrollTop = 0;
      }
      navEl.querySelectorAll('.settings-nav-btn').forEach(btn => btn.addEventListener('click', () => showSection(btn.dataset.sec)));

      const hb = root.querySelector('[data-act="vitals"]');
      if (hb) hb.addEventListener('click', () => H.show('vitals'));

      showSection('profile');
    }
  });
})();
