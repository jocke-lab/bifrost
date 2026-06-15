/* ============================================================================
   crew.js — Crew. The EMPLOYEES · ACCESS · PAYROLL · HR · PRESENCE hub.
   Driven by HELM.session.team (the 8 seeded people) + HELM.session.org.
   Follows the Command Deck reference shape EXACTLY:
     1) HELM.register({id,label,icon,render})
     2) build DOM from documented .classes + HELM.charts only
     3) deterministic mock data via HELM.data (no Math.random / no Date at eval)
     4) every button wired to H.toast / H.show / HELM.audit.log / local state
   Tabbed (namespaced .crew-tab):
     ROSTER · ACCESS · PAYROLL · HR · PRESENCE
   Mutating actions (invite / role / deactivate / payroll) are gated by
   HELM.session.can(...) — disabled + tooltip when the acting user lacks it —
   and every change is recorded via HELM.audit.log({...}).
   Namespaced tweaks live in crew.css under the .crew-* prefix.
   ========================================================================== */
(function () {
  const H = window.HELM;

  /* role rank for the role <select> ordering + readable labels */
  const ROLE_LABEL = {
    owner: 'Owner', admin: 'Admin', finance: 'Finance', member: 'Member', viewer: 'Viewer'
  };
  const ROLE_ORDER = ['owner', 'admin', 'finance', 'member', 'viewer'];

  /* per-person department inferred from title (deterministic, no extra state) */
  function deptOf(p) {
    const t = (p.title || '').toLowerCase();
    if (/engineer|cto|developer|platform/.test(t)) return 'Engineering';
    if (/sales|account|revenue/.test(t)) return 'Sales';
    if (/marketing|growth|brand/.test(t)) return 'Marketing';
    if (/finance|account|cfo/.test(t)) return 'Finance';
    if (/ops|logistics|coo|operations/.test(t)) return 'Operations';
    if (/customer|success|support/.test(t)) return 'Customer Success';
    if (/founder|ceo|chief/.test(t)) return 'Executive';
    return 'Company';
  }

  const DEPT_COLOR = {
    Executive: 'var(--accent1)',
    Engineering: 'var(--accent2)',
    Sales: 'var(--accent3)',
    Finance: 'var(--warn)',
    Operations: 'var(--accent1)',
    Marketing: 'var(--accent3)',
    'Customer Success': 'var(--accent2)',
    Company: 'var(--text-muted)'
  };

  H.register({
    id: 'crew',
    label: 'Crew',
    icon: '🧑‍🚀',
    scope: 'company',
    render(root) {
      const D = H.data;
      const S = H.session;
      const PMETA = (H._internal && H._internal.PRESENCE_META) || {
        available: { label: 'Available', dot: 'available', ico: '●' },
        focus: { label: 'Focus', dot: 'focus', ico: '◐' },
        meeting: { label: 'In a meeting', dot: 'meeting', ico: '◆' },
        away: { label: 'Away', dot: 'away', ico: '○' }
      };

      /* ── LOCAL STATE — a working copy of the team so ACCESS edits are live ──
         We mirror the canonical session.team into a local list the module owns
         for the session, plus any invited rows. session.team itself is never
         mutated destructively here (status/role overlays kept in `overlay`). */
      const overlay = {};          // personId -> {role?, status?}
      const invited = [];          // newly-invited rows added this session
      let activeTab = 'roster';

      /* derived: the full working roster (seeded 8 + invites), with overlays */
      function roster() {
        const base = S.team.map(p => {
          const o = overlay[p.id] || {};
          return {
            id: p.id,
            name: p.name,
            title: p.title,
            role: o.role || p.role,
            status: o.status || p.status || 'active',
            presence: p.presence || 'available',
            email: p.email,
            avatar: p.avatar || D.initials(p.name),
            dept: deptOf(p),
            employment: p.employment || { startDate: '2025-01-15', type: 'full-time', leaveBalance: 25 },
            seeded: true
          };
        });
        return base.concat(invited);
      }

      /* deterministic per-person monthly gross (kr) keyed by id → stable */
      function grossFor(p) {
        // anchor salary bands by role, jittered deterministically per person
        const band = { owner: 78000, admin: 68000, finance: 62000, member: 52000, viewer: 44000 };
        const base = band[p.role] || 50000;
        const jitter = D.int('crew-sal-' + p.id, -4000, 6000);
        return Math.max(32000, base + jitter);
      }
      const EMPLOYER_FEE = 0.3142;   // arbetsgivaravgift
      function taxFor(gross) { return Math.round(gross * 0.30); }     // prelim skatt ~30%
      function netFor(gross) { return gross - taxFor(gross); }
      function feeFor(gross) { return Math.round(gross * EMPLOYER_FEE); }

      /* money helper — Swedish company, show kr */
      const kr = n => H.fmt.money(n, '') + ' kr';

      /* ── audit shorthand (always module:'crew') ───────────────────────── */
      function logIt(o) {
        try { H.audit.log(Object.assign({ module: 'crew' }, o)); } catch (e) { /* no-op */ }
      }

      /* presence dot markup */
      function pdot(state, corner) {
        const m = PMETA[state] || PMETA.available;
        return `<span class="pdot ${m.dot}${corner ? ' corner' : ''}"></span>`;
      }
      function rolePill(role) {
        return `<span class="role-badge ${role}">${ROLE_LABEL[role] || role}</span>`;
      }
      function statusPill(status) {
        if (status === 'active') return '<span class="pill ok">Active</span>';
        if (status === 'invited') return '<span class="pill info">Invited</span>';
        return '<span class="pill bad">Deactivated</span>';
      }

      /* ======================================================================
         VIEW HEAD
      ====================================================================== */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">🧑‍🚀</div>
            <div>
              <h1>Crew</h1>
              <p>${S.org.name} · ${S.team.length} people — roster, access, payroll, HR and who's available right now.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-head="directory">⌕ Directory</button>
            <button class="btn btn-primary btn-sm" data-head="invite">＋ Invite member</button>
          </div>
        </div>
      `));

      /* ======================================================================
         TAB BAR (namespaced .crew-tab) + HOST
      ====================================================================== */
      const TABS = [
        { id: 'roster', ico: '👥', label: 'Roster' },
        { id: 'access', ico: '🔐', label: 'Access' },
        { id: 'payroll', ico: '💳', label: 'Payroll' },
        { id: 'hr', ico: '📋', label: 'HR' },
        { id: 'presence', ico: '🟢', label: 'Presence' }
      ];
      const tabBar = H.el(`<div class="crew-tabs"></div>`);
      TABS.forEach(t => {
        tabBar.appendChild(H.el(`
          <button class="crew-tab${t.id === activeTab ? ' active' : ''}" data-tab="${t.id}">
            <span class="crew-tab-ico">${t.ico}</span><span>${t.label}</span>
          </button>
        `));
      });
      root.appendChild(tabBar);

      const host = H.el(`<div class="crew-host"></div>`);
      root.appendChild(host);

      /* ======================================================================
         GATE HELPER — disables a button + adds a tooltip when perm is missing
      ====================================================================== */
      function gate(btn, perm, role) {
        if (!btn) return btn;
        if (!S.can(perm)) {
          btn.disabled = true;
          btn.classList.add('crew-locked');
          btn.title = 'Needs ' + (role || 'admin') + ' role';
        }
        return btn;
      }

      /* ======================================================================
         TAB 1 · ROSTER — the team table
      ====================================================================== */
      function buildRoster() {
        const list = roster();
        const wrap = H.el(`<div class="crew-panel"></div>`);

        /* mini KPI strip */
        const active = list.filter(p => p.status === 'active').length;
        const onLeave = S.team.filter(p => (p.employment && p.employment.onLeave)).length;
        const depts = Array.from(new Set(list.map(p => p.dept)));
        const krow = H.el(`<div class="grid cols-4 crew-kpis"></div>`);
        [
          { label: 'HEADCOUNT', count: list.length, sub: active + ' active' },
          { label: 'DEPARTMENTS', count: depts.length, sub: depts.slice(0, 3).join(' · ') },
          { label: 'AVAILABLE NOW', count: list.filter(p => p.presence === 'available').length, sub: 'of ' + list.length },
          { label: 'OPEN SEATS', count: Math.max(0, 15 - list.length), sub: 'plan: 15 seats' }
        ].forEach(k => {
          krow.appendChild(H.el(`
            <div class="card crew-kpi kpi">
              <div class="kpi-label">${k.label}</div>
              <div class="kpi-value sm" data-count="${k.count}" data-fmt="num">0</div>
              <div class="kpi-sub">${k.sub}</div>
            </div>
          `));
        });
        wrap.appendChild(krow);

        const card = H.el(`
          <div class="card flush crew-roster">
            <div class="card-head" style="padding:15px 16px 12px">
              <h3><span class="hico">👥</span> The Crew</h3>
              <span class="ch-meta">${list.length} PEOPLE · ${active} ACTIVE</span>
            </div>
            <div class="crew-tablewrap">
              <table class="table">
                <thead><tr>
                  <th>Member</th><th>Role</th><th>Title</th><th>Department</th>
                  <th>Presence</th><th>Status</th>
                </tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        `);
        const tb = card.querySelector('tbody');
        list.forEach(p => {
          const dc = DEPT_COLOR[p.dept] || 'var(--text-muted)';
          const pm = PMETA[p.presence] || PMETA.available;
          const tr = H.el(`
            <tr data-id="${p.id}">
              <td>
                <div class="crew-member">
                  <span class="avatar" style="background:linear-gradient(135deg,${dc},var(--accent3))">${p.avatar}</span>
                  <div class="crew-mwrap">
                    <span class="crew-mname">${p.name}</span>
                    <span class="crew-memail">${p.email}</span>
                  </div>
                </div>
              </td>
              <td>${rolePill(p.role)}</td>
              <td class="muted">${p.title}</td>
              <td><span class="tag crew-dept"><i style="background:${dc}"></i>${p.dept}</span></td>
              <td><span class="crew-presence">${pdot(p.presence)}<span class="muted">${pm.label}</span></span></td>
              <td>${statusPill(p.status)}</td>
            </tr>
          `);
          tr.addEventListener('click', () => H.toast('Profile · ' + p.name + ' (' + ROLE_LABEL[p.role] + ')', 'info'));
          tb.appendChild(tr);
        });
        wrap.appendChild(card);
        return wrap;
      }

      /* ======================================================================
         TAB 2 · ACCESS — invite, per-person role/permissions, deactivate
         ALL gated by can('crew.manage') (admin+).
      ====================================================================== */
      function buildAccess() {
        const canManage = S.can('crew.manage');
        const wrap = H.el(`<div class="crew-panel"></div>`);

        if (!canManage) {
          wrap.appendChild(H.el(`
            <div class="attn warn crew-gate-note">
              <span class="a-ico">🔒</span>
              <div class="a-body">
                <div class="a-title">Access management is restricted</div>
                <div class="a-sub">You're signed in as ${S.user.name} (${ROLE_LABEL[S.user.role]}). Inviting people and changing roles needs the <b>Admin</b> role. Everything below is read-only.</div>
              </div>
            </div>
          `));
        }

        const grid = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

        /* — invite form (span 1) — */
        const inviteCard = H.el(`
          <div class="card crew-invite">
            <div class="card-head"><h3><span class="hico">✉️</span> Invite a member</h3></div>
            <label class="crew-field">
              <span class="crew-flabel">WORK EMAIL</span>
              <input class="crew-input" type="email" placeholder="name@northwind-helm.se" data-inv="email">
            </label>
            <label class="crew-field">
              <span class="crew-flabel">ROLE</span>
              <select class="crew-input" data-inv="role"></select>
            </label>
            <div class="crew-sep-login">
              <span class="pdot available"></span>
              <span>Gets a <b>separate login</b> — their own credentials &amp; audit trail.</span>
            </div>
            <button class="btn btn-block btn-primary mt" data-inv="send">＋ Send invite</button>
          </div>
        `);
        const sel = inviteCard.querySelector('[data-inv="role"]');
        ROLE_ORDER.filter(r => r !== 'owner').forEach(r => {
          sel.appendChild(H.el(`<option value="${r}"${r === 'member' ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`));
        });
        const sendBtn = inviteCard.querySelector('[data-inv="send"]');
        gate(sendBtn, 'crew.manage', 'admin');
        if (canManage) {
          sendBtn.addEventListener('click', () => {
            const emailEl = inviteCard.querySelector('[data-inv="email"]');
            const email = (emailEl.value || '').trim();
            const role = sel.value;
            if (!email || !/.+@.+\..+/.test(email)) { H.toast('Enter a valid work email', 'warn'); emailEl.focus(); return; }
            const id = 'u-inv-' + (invited.length + 1);
            const name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            invited.push({
              id, name, title: 'Pending onboarding', role, status: 'invited',
              presence: 'away', email, avatar: D.initials(name), dept: 'Company',
              employment: { startDate: '—', type: 'full-time', leaveBalance: 25 }, seeded: false
            });
            logIt({
              action: 'crew.invited', entityType: 'Person', entityId: id,
              summary: S.user.name + ' invited ' + email + ' as ' + ROLE_LABEL[role],
              after: { email, role, status: 'invited' },
              links: [{ entityType: 'Person', entityId: id }]
            });
            H.toast('Invite sent to ' + email + ' · ' + ROLE_LABEL[role] + ' role', 'success');
            emailEl.value = '';
            rebuild('access');
          });
        }
        grid.appendChild(inviteCard);

        /* — permission reference card — */
        const permCard = H.el(`
          <div class="card crew-perms">
            <div class="card-head"><h3><span class="hico">🧩</span> What roles can do</h3><span class="ch-meta">RANK</span></div>
            <div class="crew-permlist"></div>
          </div>
        `);
        const pl = permCard.querySelector('.crew-permlist');
        [
          ['owner', 'Everything — billing, company, payroll, deletion'],
          ['admin', 'Manage crew & access, settings, deploys'],
          ['finance', 'Ledger, revenue, billing, run payroll'],
          ['member', 'Day-to-day ops, projects, partners'],
          ['viewer', 'Read-only across the company']
        ].forEach(([r, desc]) => {
          pl.appendChild(H.el(`
            <div class="crew-permrow">
              ${rolePill(r)}
              <span class="crew-permdesc">${desc}</span>
            </div>
          `));
        });
        grid.appendChild(permCard);

        /* — separate-login explainer — */
        const loginCard = H.el(`
          <div class="card crew-loginfo">
            <div class="card-head"><h3><span class="hico">🔑</span> Separate logins</h3></div>
            <p class="kpi-sub" style="line-height:1.6;margin-bottom:12px">Every member signs in with their <b>own</b> account. Actions are stamped to them in the audit log — no shared passwords.</p>
            <div class="stat-row"><span class="sr-label">Members with a login</span><span class="sr-val">${S.team.length}</span></div>
            <div class="stat-row"><span class="sr-label">Pending invites</span><span class="sr-val">${invited.length}</span></div>
            <div class="stat-row"><span class="sr-label">SSO (Google)</span><span class="sr-val" style="color:var(--success)">Enabled</span></div>
          </div>
        `);
        grid.appendChild(loginCard);
        wrap.appendChild(grid);

        /* — per-person access editor table — */
        const list = roster();
        const card = H.el(`
          <div class="card flush crew-access-table">
            <div class="card-head" style="padding:15px 16px 12px">
              <h3><span class="hico">🔐</span> Per-person access</h3>
              <span class="ch-meta">${list.length} ACCOUNTS</span>
            </div>
            <div class="crew-tablewrap">
              <table class="table">
                <thead><tr>
                  <th>Member</th><th>Role</th><th>Login</th><th>Status</th><th class="num">Manage</th>
                </tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        `);
        const tb = card.querySelector('tbody');
        list.forEach(p => {
          const isOwner = p.role === 'owner';
          const tr = H.el(`
            <tr data-id="${p.id}">
              <td>
                <div class="crew-member">
                  <span class="avatar" style="width:28px;height:28px;font-size:11px">${p.avatar}</span>
                  <div class="crew-mwrap"><span class="crew-mname">${p.name}</span><span class="crew-memail">${p.email}</span></div>
                </div>
              </td>
              <td><select class="crew-input crew-rolesel" data-role-for="${p.id}"></select></td>
              <td><span class="crew-login-ind"><span class="pdot available"></span>separate</span></td>
              <td data-statuscell>${statusPill(p.status)}</td>
              <td class="num">
                <button class="btn btn-sm crew-toggle-act" data-toggle="${p.id}">${p.status === 'deactivated' ? 'Reactivate' : 'Deactivate'}</button>
              </td>
            </tr>
          `);
          const rs = tr.querySelector('.crew-rolesel');
          ROLE_ORDER.forEach(r => {
            rs.appendChild(H.el(`<option value="${r}"${r === p.role ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`));
          });
          // gate role select + toggle
          if (!canManage || isOwner) {
            rs.disabled = true;
            if (isOwner) rs.title = 'Owner role is fixed';
            else rs.title = 'Needs admin role';
          } else {
            rs.addEventListener('change', () => {
              const prev = p.role;
              const next = rs.value;
              if (next === prev) return;
              if (p.seeded) overlay[p.id] = Object.assign({}, overlay[p.id], { role: next });
              else { const inv = invited.find(x => x.id === p.id); if (inv) inv.role = next; }
              logIt({
                action: 'role.changed', entityType: 'Person', entityId: p.id,
                summary: S.user.name + ' changed ' + p.name + ' from ' + ROLE_LABEL[prev] + ' to ' + ROLE_LABEL[next],
                before: { role: prev }, after: { role: next },
                links: [{ entityType: 'Person', entityId: p.id }]
              });
              H.toast(p.name + ' is now ' + ROLE_LABEL[next], 'success');
            });
          }
          const toggle = tr.querySelector('.crew-toggle-act');
          gate(toggle, 'crew.manage', 'admin');
          if (isOwner) { toggle.disabled = true; toggle.title = 'The owner account cannot be deactivated'; toggle.classList.add('crew-locked'); }
          if (canManage && !isOwner) {
            toggle.addEventListener('click', () => {
              const now = (overlay[p.id] && overlay[p.id].status) || p.status;
              const next = now === 'deactivated' ? 'active' : 'deactivated';
              if (p.seeded) overlay[p.id] = Object.assign({}, overlay[p.id], { status: next });
              else { const inv = invited.find(x => x.id === p.id); if (inv) inv.status = next; }
              logIt({
                action: next === 'deactivated' ? 'crew.deactivated' : 'crew.reactivated',
                entityType: 'Person', entityId: p.id,
                summary: S.user.name + (next === 'deactivated' ? ' deactivated ' : ' reactivated ') + p.name + "'s access",
                before: { status: now }, after: { status: next },
                links: [{ entityType: 'Person', entityId: p.id }]
              });
              H.toast(p.name + ' ' + (next === 'deactivated' ? 'deactivated' : 'reactivated'),
                next === 'deactivated' ? 'warn' : 'success');
              rebuild('access');
            });
          }
          tb.appendChild(tr);
        });
        wrap.appendChild(card);
        return wrap;
      }

      /* ======================================================================
         TAB 3 · PAYROLL — per-person monthly run + totals, gated run button
      ====================================================================== */
      function buildPayroll() {
        const canRun = S.can('payroll.run');
        const list = roster().filter(p => p.status === 'active');
        const wrap = H.el(`<div class="crew-panel"></div>`);

        let tGross = 0, tTax = 0, tNet = 0, tFee = 0;
        const rows = list.map(p => {
          const g = grossFor(p), tx = taxFor(g), nt = netFor(g), fe = feeFor(g);
          tGross += g; tTax += tx; tNet += nt; tFee += fe;
          return { p, g, tx, nt, fe };
        });
        const totalCost = tGross + tFee;

        /* totals strip */
        const krow = H.el(`<div class="grid cols-4 crew-kpis"></div>`);
        [
          { label: 'GROSS · THIS RUN', count: tGross, sub: list.length + ' employees' },
          { label: 'NET TO ACCOUNTS', count: tNet, sub: 'after prelim tax' },
          { label: 'EMPLOYER FEE', count: tFee, sub: '31.42% arb.giv.avg' },
          { label: 'TOTAL COST', count: totalCost, sub: 'gross + employer fee' }
        ].forEach(k => {
          krow.appendChild(H.el(`
            <div class="card crew-kpi kpi">
              <div class="kpi-label">${k.label}</div>
              <div class="kpi-value sm" data-count="${k.count}" data-fmt="num" data-suffix=" kr">0</div>
              <div class="kpi-sub">${k.sub}</div>
            </div>
          `));
        });
        wrap.appendChild(krow);

        const card = H.el(`
          <div class="card flush crew-payroll-table">
            <div class="card-head" style="padding:15px 16px 12px">
              <h3><span class="hico">💳</span> Monthly payroll run</h3>
              <div class="row gap-sm">
                <span class="pill info">CYCLE · JUN 2026</span>
                <button class="btn btn-sm btn-primary" data-pay="run">▶ Run payroll</button>
              </div>
            </div>
            <div class="crew-tablewrap">
              <table class="table">
                <thead><tr>
                  <th>Employee</th><th>Role</th>
                  <th class="num">Gross</th><th class="num">Prelim tax</th>
                  <th class="num">Employer fee</th><th class="num">Net pay</th>
                </tr></thead>
                <tbody></tbody>
                <tfoot></tfoot>
              </table>
            </div>
          </div>
        `);
        const tb = card.querySelector('tbody');
        rows.forEach(({ p, g, tx, nt, fe }) => {
          tb.appendChild(H.el(`
            <tr>
              <td>
                <div class="crew-member">
                  <span class="avatar" style="width:26px;height:26px;font-size:10px">${p.avatar}</span>
                  <span class="crew-mname">${p.name}</span>
                </div>
              </td>
              <td>${rolePill(p.role)}</td>
              <td class="num mono">${kr(g)}</td>
              <td class="num mono muted">${kr(tx)}</td>
              <td class="num mono muted">${kr(fe)}</td>
              <td class="num mono" style="color:var(--accent1)">${kr(nt)}</td>
            </tr>
          `));
        });
        card.querySelector('tfoot').appendChild(H.el(`
          <tr class="crew-payfoot">
            <td colspan="2"><b>Totals · ${rows.length} employees</b></td>
            <td class="num mono">${kr(tGross)}</td>
            <td class="num mono">${kr(tTax)}</td>
            <td class="num mono">${kr(tFee)}</td>
            <td class="num mono" style="color:var(--accent1)">${kr(tNet)}</td>
          </tr>
        `));

        const runBtn = card.querySelector('[data-pay="run"]');
        gate(runBtn, 'payroll.run', 'finance');
        if (canRun) {
          runBtn.addEventListener('click', () => {
            logIt({
              action: 'payroll.run', entityType: 'PayrollRun', entityId: 'pr-2026-06',
              summary: S.user.name + ' ran June 2026 payroll — ' + kr(tGross) + ' gross across ' + rows.length + ' employees',
              amount: { value: tGross, currency: 'SEK' },
              after: { period: '2026-06', employees: rows.length, gross: tGross, net: tNet, employerFee: tFee },
              links: [{ entityType: 'Vault', entityId: 'vault-payslips-2026-06' }]
            });
            H.toast('Payslips generated to Vault · ' + kr(tGross) + ' gross', 'success');
          });
        }
        wrap.appendChild(card);

        /* breakdown footnote */
        wrap.appendChild(H.el(`
          <div class="card crew-paynote">
            <div class="row between wrap">
              <span class="kpi-sub">Net = gross − ~30% preliminary tax (skatt). Employer fee (arbetsgivaravgift) 31.42% is on top of gross.</span>
              <span class="sr-val mono">Cost / head ${kr(Math.round(totalCost / Math.max(1, rows.length)))}</span>
            </div>
          </div>
        `));
        return wrap;
      }

      /* ======================================================================
         TAB 4 · HR — employment record, leave bars, onboarding, documents
      ====================================================================== */
      function buildHr() {
        const list = roster();
        const wrap = H.el(`<div class="crew-panel"></div>`);

        const grid = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

        /* — employment records (span 2) — */
        const empCard = H.el(`
          <div class="card span-2 flush crew-hr-table">
            <div class="card-head" style="padding:15px 16px 12px">
              <h3><span class="hico">📋</span> Employment &amp; leave</h3>
              <span class="ch-meta">${list.filter(p => p.seeded).length} EMPLOYEES</span>
            </div>
            <div class="crew-tablewrap">
              <table class="table">
                <thead><tr>
                  <th>Member</th><th>Type</th><th>Start date</th><th>Leave balance</th>
                </tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        `);
        const tb = empCard.querySelector('tbody');
        list.filter(p => p.seeded).forEach(p => {
          const bal = (p.employment && p.employment.leaveBalance != null) ? p.employment.leaveBalance : 25;
          const pct = Math.round(bal / 25 * 100);
          const cls = pct < 25 ? 'bad' : pct < 50 ? 'warn' : '';
          tb.appendChild(H.el(`
            <tr>
              <td>
                <div class="crew-member">
                  <span class="avatar" style="width:26px;height:26px;font-size:10px">${p.avatar}</span>
                  <span class="crew-mname">${p.name}</span>
                </div>
              </td>
              <td class="muted">${(p.employment && p.employment.type) || 'full-time'}</td>
              <td class="mono muted">${(p.employment && p.employment.startDate) || '2025-01-15'}</td>
              <td>
                <div class="crew-leave">
                  <div class="progress crew-leave-bar"><div class="bar ${cls}" style="width:0" data-w="${pct}"></div></div>
                  <span class="crew-leave-num">${bal} <small>/ 25 d</small></span>
                </div>
              </td>
            </tr>
          `));
        });
        grid.appendChild(empCard);

        /* — onboarding checklist — */
        const onbCard = H.el(`
          <div class="card crew-onboard">
            <div class="card-head"><h3><span class="hico">🚦</span> Onboarding</h3><span class="ch-meta">NEW HIRES</span></div>
            <div class="crew-onb-list"></div>
          </div>
        `);
        const ol = onbCard.querySelector('.crew-onb-list');
        [
          ['Signed employment contract', true],
          ['Bank & tax details (skatt)', true],
          ['Equipment issued', true],
          ['Accounts & SSO provisioned', true],
          ['Benefits & pension enrolled', false],
          ['First-week buddy assigned', false]
        ].forEach(([label, done]) => {
          ol.appendChild(H.el(`
            <div class="check ${done ? 'done' : ''}">
              <div class="box">✓</div>
              <div class="ck-body"><div class="ck-title">${label}</div></div>
              ${done ? '<span class="pill ok">DONE</span>' : '<button class="btn btn-sm" data-onb="' + label + '">Do</button>'}
            </div>
          `));
        });
        grid.appendChild(onbCard);
        wrap.appendChild(grid);

        /* — HR documents → vault — */
        const docCard = H.el(`
          <div class="card crew-hr-docs">
            <div class="card-head"><h3><span class="hico">🗄️</span> HR documents</h3>
              <button class="btn btn-sm btn-ghost" data-hr="vault">Open in Vault →</button>
            </div>
            <div class="list"></div>
          </div>
        `);
        const dl = docCard.querySelector('.list');
        [
          ['📄', 'Employment contracts', '8 signed · stored in Vault', 'ok'],
          ['🧾', 'Tax & pension forms', 'AGI reported · Skatteverket', 'info'],
          ['🏥', 'Insurance & benefits', 'Collectum · up to date', 'ok'],
          ['📑', 'Policies & handbook', 'v3 · acknowledged by 7/8', 'warn']
        ].forEach(([ico, title, sub, sev]) => {
          const item = H.el(`
            <div class="list-item">
              <div class="li-ico">${ico}</div>
              <div class="li-body"><div class="li-title">${title}</div><div class="li-sub">${sub}</div></div>
              <button class="btn btn-sm" data-doc="${title}">Open</button>
            </div>
          `);
          item.querySelector('[data-doc]').addEventListener('click', () => H.toast('Opening · ' + title + ' (Vault)', 'info'));
          dl.appendChild(item);
        });
        wrap.appendChild(docCard);

        // wire onboarding + vault
        wrap.querySelectorAll('[data-onb]').forEach(b =>
          b.addEventListener('click', () => {
            logIt({
              action: 'onboarding.completed', entityType: 'OnboardingTask', entityId: 'onb-' + D.initials(b.dataset.onb),
              summary: S.user.name + ' completed onboarding step: ' + b.dataset.onb,
              after: { step: b.dataset.onb, done: true }
            });
            H.toast('Marked done · ' + b.dataset.onb, 'success');
            const chk = b.closest('.check'); chk.classList.add('done');
            b.replaceWith(H.el('<span class="pill ok">DONE</span>'));
          }));
        wrap.querySelector('[data-hr="vault"]').addEventListener('click', () => H.show('vault'));
        return wrap;
      }

      /* ======================================================================
         TAB 5 · PRESENCE — team availability board reading session.team presence
      ====================================================================== */
      function buildPresence() {
        const list = roster().filter(p => p.seeded);
        const wrap = H.el(`<div class="crew-panel"></div>`);

        /* my-presence setter (acting user) */
        const me = S.user;
        const setRow = H.el(`
          <div class="card crew-mypresence">
            <div class="card-head"><h3><span class="hico">🟢</span> Your presence</h3>
              <span class="ch-meta">${me.name}</span>
            </div>
            <div class="crew-presence-set"></div>
          </div>
        `);
        const ps = setRow.querySelector('.crew-presence-set');
        ['available', 'focus', 'meeting', 'away'].forEach(state => {
          const m = PMETA[state];
          const btn = H.el(`
            <button class="crew-pchip${S.presence === state ? ' active' : ''}" data-pres="${state}">
              ${pdot(state)}<span>${m.label}</span>
            </button>
          `);
          btn.addEventListener('click', () => {
            S.setPresence(state);
            logIt({
              action: 'presence.changed', entityType: 'Person', entityId: me.id,
              summary: me.name + ' set presence to ' + m.label,
              after: { presence: state }, links: [{ entityType: 'Person', entityId: me.id }]
            });
            H.toast('Presence · ' + m.label, 'info');
            rebuild('presence');
          });
          ps.appendChild(btn);
        });
        wrap.appendChild(setRow);

        /* availability board — grouped columns by presence state */
        const board = H.el(`<div class="crew-board"></div>`);
        const STATES = [
          { id: 'available', label: 'Available', sub: 'free to ping' },
          { id: 'focus', label: 'Focus', sub: 'heads-down' },
          { id: 'meeting', label: 'In a meeting', sub: 'busy' },
          { id: 'away', label: 'Away', sub: 'offline' }
        ];
        STATES.forEach(st => {
          const people = list.filter(p => p.presence === st.id);
          const m = PMETA[st.id];
          const col = H.el(`
            <div class="crew-bcol" data-state="${st.id}">
              <div class="crew-bcol-head">
                ${pdot(st.id)}
                <span class="crew-bcol-title">${st.label}</span>
                <span class="badge">${people.length}</span>
              </div>
              <div class="crew-bcol-sub">${st.sub}</div>
              <div class="crew-bcol-body"></div>
            </div>
          `);
          const body = col.querySelector('.crew-bcol-body');
          if (!people.length) {
            body.appendChild(H.el(`<div class="crew-bempty">— nobody —</div>`));
          } else {
            people.forEach(p => {
              const dc = DEPT_COLOR[p.dept] || 'var(--text-muted)';
              const cardp = H.el(`
                <div class="crew-bcard">
                  <span class="avatar" style="width:28px;height:28px;font-size:11px;background:linear-gradient(135deg,${dc},var(--accent3))">${p.avatar}</span>
                  <div class="crew-bmeta">
                    <span class="crew-bname">${p.name}${p.id === me.id ? ' <small>(you)</small>' : ''}</span>
                    <span class="crew-btitle">${p.title}</span>
                  </div>
                </div>
              `);
              cardp.addEventListener('click', () => H.toast(p.name + ' · ' + m.label, 'info'));
              body.appendChild(cardp);
            });
          }
          board.appendChild(col);
        });
        wrap.appendChild(board);
        return wrap;
      }

      /* ======================================================================
         TAB SWITCHING + post-mount effects
      ====================================================================== */
      const BUILDERS = {
        roster: buildRoster, access: buildAccess, payroll: buildPayroll,
        hr: buildHr, presence: buildPresence
      };

      function animateBars(node) {
        node.querySelectorAll('.bar[data-w]').forEach(bar => {
          setTimeout(() => { bar.style.width = bar.dataset.w + '%'; }, 240);
        });
      }

      function mount(tabId) {
        host.innerHTML = '';
        const node = BUILDERS[tabId]();
        host.appendChild(node);
        animateBars(node);
        H.countAll(node);
      }

      /* rebuild current tab in place (after a mutation) */
      function rebuild(tabId) {
        if (tabId && tabId !== activeTab) return;
        mount(activeTab);
      }

      function showTab(tabId) {
        if (!BUILDERS[tabId]) return;
        activeTab = tabId;
        tabBar.querySelectorAll('.crew-tab').forEach(b =>
          b.classList.toggle('active', b.dataset.tab === tabId));
        mount(tabId);
      }
      tabBar.querySelectorAll('.crew-tab').forEach(b =>
        b.addEventListener('click', () => showTab(b.dataset.tab)));

      /* ======================================================================
         WIRE VIEW-HEAD ACTIONS (no global keys — shell owns ⌘K)
      ====================================================================== */
      const head = sel => root.querySelector('[data-head="' + sel + '"]');
      head('directory').addEventListener('click', () => H.openCmdk());
      const inviteHead = head('invite');
      // the head "Invite" jumps to the Access tab (where the gated form lives)
      inviteHead.addEventListener('click', () => {
        showTab('access');
        const em = host.querySelector('[data-inv="email"]');
        if (em && !em.disabled) em.focus();
        if (!S.can('crew.manage')) H.toast('Inviting needs the Admin role', 'warn');
      });

      /* ======================================================================
         LIVE RE-GATE — crew is a company module (rendered once), but its
         permission gates + "Your presence" read the ACTING user. If the user
         is switched via the shell identity menu while Crew is open, re-mount
         the active tab so gating / presence stay correct. Subscribed once;
         the guard self-detaches if Crew is ever removed from the DOM.
      ====================================================================== */
      const offUser = S.on('helm:user', () => {
        if (!document.body.contains(host)) { offUser(); return; }
        mount(activeTab);
      });

      /* default tab */
      mount(activeTab);
    }
  });
})();
