/* ============================================================================
   team.js — "Access". Owner/admin manage who can sign in and what they can do.
   Register a person by email (they set their own password on first login),
   change roles, suspend/reactivate. Backed by the hub edge function `access`.
   ========================================================================== */
(function () {
  const H = window.HELM;
  const DB = window.DB;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ROLES = [['admin', 'Administrator'], ['finance', 'Finance'], ['member', 'Team member'], ['viewer', 'Viewer']];
  const ROLE_LABEL = { owner: 'Owner', admin: 'Administrator', finance: 'Finance', member: 'Team member', viewer: 'Viewer' };
  const when = iso => { if (!iso) return 'never'; const d = new Date(iso); if (isNaN(d)) return ''; const days = Math.floor((Date.now() - d) / 864e5); return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + 'd ago'; };

  function render(root) {
    root.innerHTML = `
      <div class="nftsite">
        <header class="nft-head">
          <div class="nft-headmain">
            <h1 class="nft-title">Access <span class="nft-live">${window.icon('lock')}</span></h1>
            <p class="nft-sub">Who can sign in to bifrost, and what each person can reach. You register people by email — they create their own password the first time they log in.</p>
          </div>
        </header>

        <section class="nft-panel team-reg">
          <h3>Register a person</h3>
          <div class="team-regrow">
            <input class="team-in" id="t-email" type="email" placeholder="name@company.com" autocomplete="off">
            <input class="team-in" id="t-name" type="text" placeholder="Full name">
            <select class="team-in" id="t-role">${ROLES.map(r => `<option value="${r[0]}"${r[0] === 'member' ? ' selected' : ''}>${r[1]}</option>`).join('')}</select>
            <button class="nft-btn primary" id="t-add">${window.icon('plus')} Register</button>
          </div>
          <p class="team-hint" id="t-hint">They’ll appear below as <b>invited</b> until they set a password on first sign-in.</p>
        </section>

        <section class="nft-panel">
          <h3>People</h3>
          <div id="team-list"><div class="nft-loading"><span class="nft-spin"></span> Loading…</div></div>
        </section>
      </div>`;

    const hint = root.querySelector('#t-hint');
    const setHint = (m, cls) => { hint.innerHTML = m; hint.className = 'team-hint' + (cls ? ' ' + cls : ''); };

    root.querySelector('#t-add').addEventListener('click', async () => {
      const email = (root.querySelector('#t-email').value || '').trim().toLowerCase();
      const name = (root.querySelector('#t-name').value || '').trim();
      const role = root.querySelector('#t-role').value;
      if (!email || email.indexOf('@') < 0) { setHint('Enter a valid email.', 'warn'); return; }
      setHint('Registering…');
      const r = await DB.access('team', { method: 'POST', body: { email, name, role } });
      if (!r.ok) {
        const msg = r.error === 'already_registered' ? 'That email is already registered.' : (r.forbidden ? 'Only owner/admin can register people.' : ('Could not register: ' + (r.error || 'error')));
        setHint(msg, 'warn'); return;
      }
      root.querySelector('#t-email').value = ''; root.querySelector('#t-name').value = '';
      setHint('Registered <b>' + esc(email) + '</b> — they can now sign in and set their password.', 'ok');
      H.toast('Registered ' + email, 'success');
      load(root);
    });

    load(root);
  }

  async function load(root) {
    const host = root.querySelector('#team-list'); if (!host) return;
    const r = await DB.access('team', { method: 'GET' });
    if (r._offline) { host.innerHTML = '<div class="nft-warn">Can’t reach the server.</div>'; return; }
    if (r.unauthorized) { host.innerHTML = '<div class="nft-warn">Sign in as an admin to manage access.</div>'; return; }
    if (r.forbidden) { host.innerHTML = '<div class="nft-warn">Only owner/admin can manage access.</div>'; return; }
    const rows = r.rows || [];
    host.innerHTML = `<table class="nft-table team-table"><thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table>`;
    rows.forEach(p => wireRow(root, host, p));
  }

  function statusChip(s) {
    if (s === 'active') return '<span class="nft-chip ok">active</span>';
    if (s === 'invited') return '<span class="nft-chip warn">invited</span>';
    if (s === 'suspended') return '<span class="nft-chip bad">suspended</span>';
    return '<span class="nft-chip">' + esc(s) + '</span>';
  }
  function rowHtml(p) {
    const owner = p.role === 'owner';
    const roleCell = owner ? `<b>Owner</b>`
      : `<select class="team-rolesel" data-id="${esc(p.id)}">${ROLES.map(r => `<option value="${r[0]}"${r[0] === p.role ? ' selected' : ''}>${r[1]}</option>`).join('')}</select>`;
    const actions = owner ? '<span class="nft-muted">you</span>'
      : (p.status === 'suspended'
        ? `<button class="nft-btn sm" data-act="activate" data-id="${esc(p.id)}">Reactivate</button>`
        : `<button class="nft-btn sm danger" data-act="suspend" data-id="${esc(p.id)}">Suspend</button>`);
    return `<tr data-row="${esc(p.id)}">
      <td><div class="team-person"><span class="team-av">${esc((p.full_name || p.email || '?').slice(0, 2).toUpperCase())}</span><div><div class="team-name">${esc(p.full_name || '—')}</div><div class="nft-muted team-email">${esc(p.email)}</div></div></div></td>
      <td>${roleCell}</td>
      <td>${statusChip(p.status)}</td>
      <td class="nft-muted">${esc(when(p.last_sign_in_at))}</td>
      <td class="team-actions">${actions}</td>
    </tr>`;
  }
  function wireRow(root, host, p) {
    if (p.role === 'owner') return;
    const sel = host.querySelector(`.team-rolesel[data-id="${cssq(p.id)}"]`);
    if (sel) sel.addEventListener('change', async () => {
      const role = sel.value;
      const r = await DB.access('team', { method: 'PUT', body: { id: p.id, role } });
      if (r.ok) H.toast(esc(p.email) + ' → ' + (ROLE_LABEL[role] || role), 'success'); else { H.toast('Could not update role', 'warn'); load(root); }
    });
    host.querySelectorAll(`[data-act][data-id="${cssq(p.id)}"]`).forEach(btn => btn.addEventListener('click', async () => {
      const status = btn.dataset.act === 'suspend' ? 'suspended' : 'active';
      const r = await DB.access('team', { method: 'PUT', body: { id: p.id, status } });
      if (r.ok) { H.toast(esc(p.email) + ' ' + (status === 'suspended' ? 'suspended' : 'reactivated'), status === 'suspended' ? 'warn' : 'success'); load(root); }
      else H.toast('Could not update', 'warn');
    }));
  }
  function cssq(s) { return String(s).replace(/"/g, '\\"'); }

  H.register({ id: 'team', label: 'Access', icon: window.icon('lock'), scope: 'company', render });
})();
