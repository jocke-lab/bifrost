/* ============================================================================
   portal.js — Clients (FULL MODULE).
   A FLEXIBLE MULTI-CLIENT WORKSPACE. Bifrost serves MANY clients across MANY
   different areas/industries — so this module feels like a tenant switcher:
   you run ONE client's mini-site, then jump straight to another's. Each client
   is its own little product surface with its OWN identity (icon, accent, area).

   TWO VIEWS, swapped inside the same module root (no shell routing needed):
     A) DIRECTORY  — the default. KPI strip + responsive grid of client
        "workspace" cards (icon/monogram · name · area tag · accent · status ·
        quick stats). A "＋ Add client" inline form (name · area · icon picker ·
        accent) prepends a fresh card + audit + toast.
     B) WORKSPACE  — clicking a client opens its space and the module RE-THEMES
        to that client's accent (inline-styled, .portal-* scoped) so it clearly
        feels like a different site: header, accounts/users table, what they can
        see, their branding (icon · accent · client login URL), and a framed
        "Client preview" mock of what THAT client sees. A prominent "Switch
        client" control + a quick client-switcher dropdown jump between sites.

   Contract: HELM module shape (see command.js). ONLY documented core classes +
   namespaced .portal-* . Tokens only — the sole hardcoded colours are each
   client's chosen ACCENT, applied INLINE as that client's identity. Every
   button is wired (H.toast / H.audit.log / local state). Deterministic data.
   ========================================================================== */
(function () {
  const H = window.HELM;

  H.register({
    id: 'portal',
    label: 'Clients',
    icon: '🪟',
    scope: 'company',
    render(root) {
      const D = H.data;
      const S = H.session;

      /* kr formatter — H.fmt.money treats '' currency as falsy → default '$',
         so render with the default symbol then swap for a ' kr' suffix. */
      const kr = n => H.fmt.money(n).replace(/^(-?)\$/, '$1') + ' kr';

      /* permission gate — onboarding / editing a client tenant is admin-level */
      const CAN_MANAGE = S.can('settings.company');
      const gateAttr = CAN_MANAGE ? '' : ' disabled title="Needs admin role"';

      /* ── identity palettes ───────────────────────────────────────────────
         AREAS = the industries Bifrost serves (each card carries one as a tag).
         ICON_CHOICES = the ~12 emoji a user can pin to a client; monogram is the
         fallback when no emoji is picked. ACCENT_CHOICES = per-client accent. */
      const AREAS = ['Retail', 'Fintech', 'Logistics', 'Healthcare', 'Web3', 'Real Estate', 'SaaS', 'Hospitality', 'Energy', 'Media'];
      const ICON_CHOICES = ['🛍️', '🏦', '🚚', '🩺', '⛓️', '🏠', '☁️', '🍷', '⚡', '🎬', '🛰️', '🎨'];
      const ACCENT_CHOICES = ['#34C3FF', '#00E5D1', '#7C6CFF', '#F5A524', '#FF4D6D', '#5AD1B0', '#FF8AA1', '#9D8BFF', '#36C6FF', '#E8B84B'];

      const STATUSES = ['Live', 'Onboarding', 'Paused'];
      const STATUS_PILL = { Live: 'ok', Onboarding: 'info', Paused: 'warn' };

      /* what a client can see inside their own portal (scopes) */
      const ALL_SCOPES = [
        { key: 'invoices', label: 'Invoices', ico: '🧾' },
        { key: 'documents', label: 'Documents', ico: '📄' },
        { key: 'status', label: 'Status', ico: '📡' },
        { key: 'support', label: 'Support', ico: '🛟' }
      ];
      const SCOPE_LABEL = Object.fromEntries(ALL_SCOPES.map(s => [s.key, s.label]));

      /* ── seed roster: ~8 varied clients across different areas ───────────
         Each has a DISTINCT icon + accent so the per-tenant flexibility reads
         instantly. icon:'' means "use the coloured monogram tile" instead. */
      const CLIENTS = [
        { name: 'Saga Retail', area: 'Retail', icon: '🛍️', accent: '#F5A524', status: 'Live', site: 'saga', users: 14, mrr: 18400, lastDays: 0, contact: 'Klara Saga', scopes: ['invoices', 'documents', 'status', 'support'] },
        { name: 'Aurora Fintech', area: 'Fintech', icon: '🏦', accent: '#34C3FF', status: 'Live', site: 'aurora', users: 31, mrr: 42800, lastDays: 1, contact: 'Petra Almqvist', scopes: ['invoices', 'documents', 'status'] },
        { name: 'Nordkvist Logistik', area: 'Logistics', icon: '🚚', accent: '#5AD1B0', status: 'Live', site: 'nordkvist', users: 22, mrr: 26500, lastDays: 0, contact: 'Maria Nordkvist', scopes: ['invoices', 'documents', 'status', 'support'] },
        { name: 'Vita Health', area: 'Healthcare', icon: '🩺', accent: '#FF8AA1', status: 'Onboarding', site: 'vita', users: 6, mrr: 12000, lastDays: 2, contact: 'Dr. Henrik Vita', scopes: ['documents', 'support'] },
        { name: 'Chainforge', area: 'Web3', icon: '⛓️', accent: '#7C6CFF', status: 'Live', site: 'chainforge', users: 9, mrr: 33500, lastDays: 0, contact: 'Iris Lund', scopes: ['invoices', 'status', 'support'] },
        { name: 'Bergström Bygg', area: 'Real Estate', icon: '🏠', accent: '#E8B84B', status: 'Paused', site: 'bergstrom', users: 4, mrr: 0, lastDays: 21, contact: 'Ulf Bergström', scopes: ['invoices'] },
        { name: 'Lykke Studios', area: 'Media', icon: '🎬', accent: '#FF4D6D', status: 'Live', site: 'lykke', users: 11, mrr: 21600, lastDays: 3, contact: 'Jonas Lykke', scopes: ['invoices', 'documents', 'support'] },
        { name: 'Solvik Energi', area: 'Energy', icon: '⚡', accent: '#00E5D1', status: 'Onboarding', site: 'solvik', users: 7, mrr: 9800, lastDays: 5, contact: 'Henrik Solvik', scopes: ['documents', 'status'] }
      ];

      // derive deterministic per-client fields (account roster, docs, trend)
      CLIENTS.forEach((c, i) => {
        c.id = 'cl-' + (10 + i);
        c.email = 'portal@' + c.site + '.se';
      });

      /* ── helpers ────────────────────────────────────────────────────────── */
      const lastSeen = d => d == null ? '—' : d === 0 ? 'today' : d === 1 ? 'yesterday' : d + 'd ago';
      const clientRef = c => 'cu-' + c.name.toLowerCase().split(/\s+/)[0];

      /* the client identity tile — chosen emoji on the accent, OR a coloured
         monogram tile (initials) tinted with the accent when no icon is set. */
      function identityTile(c, cls) {
        const k = 'portal-id ' + (cls || '');
        if (c.icon) {
          return `<div class="${k}" style="background:${c.accent}1f;border-color:${c.accent}55" title="${c.name}">
                    <span class="portal-id-emoji">${c.icon}</span></div>`;
        }
        return `<div class="${k} portal-id-mono" style="background:${c.accent}1f;border-color:${c.accent}55;color:${c.accent}" title="${c.name}">${D.initials(c.name)}</div>`;
      }

      // audit + toast wrapper for every mutating action
      function act(client, action, summaryVerb, toastLabel, toastType) {
        H.audit.log({
          action: 'portal.' + action,
          entityType: 'ClientWorkspace',
          entityId: client.id,
          summary: `${S.user.name} ${summaryVerb} the client workspace for ${client.name}`,
          links: [{ entityType: 'Customer', entityId: clientRef(client) }],
          module: 'portal'
        });
        H.toast(`${client.name} · ${toastLabel}`, toastType || 'success');
      }

      /* ── live KPI helpers (directory strip) ─────────────────────────────── */
      function kpiFigures() {
        const total = CLIENTS.length;
        const live = CLIENTS.filter(c => c.status === 'Live').length;
        const onb = CLIENTS.filter(c => c.status === 'Onboarding').length;
        const mrr = CLIENTS.reduce((s, c) => s + (c.status === 'Paused' ? 0 : c.mrr), 0);
        return { total, live, onb, mrr };
      }

      /* ── module-local view state: 'directory' | client.id ───────────────── */
      let view = 'directory';

      /* a single host we repaint between the two views (keeps shell happy) */
      const host = H.el('<div class="portal-host"></div>');
      root.appendChild(host);

      function paint() {
        host.innerHTML = '';
        if (view === 'directory') paintDirectory();
        else paintWorkspace(CLIENTS.find(c => c.id === view) || CLIENTS[0]);
        // run any [data-count] count-ups inside the freshly painted view
        H.countAll(host);
      }

      /* ════════════════════════════════════════════════════════════════════
         VIEW A — CLIENT DIRECTORY
         ════════════════════════════════════════════════════════════════════ */
      function paintDirectory() {
        /* ── VIEW HEAD ── */
        host.appendChild(H.el(`
          <div class="view-head">
            <div class="vh-title">
              <div class="vh-ico">🪟</div>
              <div>
                <h1>Clients</h1>
                <p>Every client is its own workspace — open one, run their site, switch to the next.</p>
              </div>
            </div>
            <div class="vh-actions">
              <span class="pill info portal-ext-pill">${CLIENTS.length} TENANTS · MULTI-CLIENT</span>
              <button class="btn btn-primary btn-sm" data-act="add-top"${gateAttr}>＋ Add client</button>
            </div>
          </div>
        `));

        /* ── KPI STRIP ── */
        const f = kpiFigures();
        const kpis = [
          { label: 'CLIENTS', count: f.total, fmt: 'num', trend: '+2', dir: 'up' },
          { label: 'LIVE', count: f.live, fmt: 'num', trend: f.total ? Math.round(f.live / f.total * 100) + '%' : '0%', dir: 'flat' },
          { label: 'ONBOARDING', count: f.onb, fmt: 'num', trend: f.onb ? 'in setup' : 'clear', dir: f.onb ? 'down' : 'flat' },
          { label: 'COMBINED MRR', count: f.mrr, fmt: 'money', trend: '+14%', dir: 'up' }
        ];
        const kpiRow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
        kpis.forEach(k => {
          kpiRow.appendChild(H.el(`
            <div class="card kpi portal-kpi">
              <div class="kpi-label">${k.label}</div>
              <div class="kpi-value" data-count="${k.count}" data-fmt="${k.fmt}">0</div>
              <span class="kpi-trend ${k.dir}">${k.trend}</span>
            </div>
          `));
        });
        host.appendChild(kpiRow);

        /* ── ADD-CLIENT inline form (collapsed by default) ── */
        const add = { name: '', area: AREAS[0], icon: ICON_CHOICES[0], accent: ACCENT_CHOICES[0], mono: false };
        const addCard = H.el(`
          <div class="card portal-add" hidden>
            <div class="card-head">
              <h3><span class="hico">✨</span> Add a Client Workspace</h3>
              <span class="ch-meta">NEW TENANT</span>
            </div>
            <div class="portal-add-grid">
              <div class="portal-field portal-add-name">
                <label class="portal-label">Client name</label>
                <input class="portal-input" type="text" data-add="name" placeholder="e.g. Frost Mobility"${gateAttr} />
              </div>
              <div class="portal-field">
                <label class="portal-label">Area / industry</label>
                <select class="portal-select" data-add="area"${gateAttr}></select>
              </div>
            </div>
            <div class="portal-field">
              <label class="portal-label">Icon</label>
              <div class="portal-icon-picker" data-add="icons"></div>
            </div>
            <div class="portal-field">
              <label class="portal-label">Accent colour</label>
              <div class="portal-accent-picker" data-add="accents"></div>
            </div>
            <div class="portal-add-preview">
              <span class="portal-label">Preview</span>
              <div class="portal-add-prev-tile"></div>
            </div>
            <div class="portal-add-foot">
              <button class="btn btn-sm" data-add="cancel">Cancel</button>
              <button class="btn btn-primary btn-sm" data-add="create"${gateAttr}>Create workspace</button>
            </div>
          </div>
        `);

        // area picker
        const areaSel = addCard.querySelector('[data-add="area"]');
        AREAS.forEach(a => areaSel.appendChild(H.el(`<option value="${a}">${a}</option>`)));

        // live mini-preview of the identity tile being assembled
        const prevTile = addCard.querySelector('.portal-add-prev-tile');
        function renderAddPreview() {
          const fake = { name: add.name || 'New Client', area: add.area, icon: add.mono ? '' : add.icon, accent: add.accent };
          prevTile.innerHTML = `${identityTile(fake, 'lg')}
            <div class="portal-add-prev-meta">
              <div class="portal-add-prev-name">${fake.name}</div>
              <span class="portal-area-tag" style="color:${add.accent};border-color:${add.accent}55;background:${add.accent}14">${add.area}</span>
            </div>`;
        }

        // icon picker — emoji choices + a "monogram" fallback chip
        const iconWrap = addCard.querySelector('[data-add="icons"]');
        ICON_CHOICES.forEach(ic => {
          const b = H.el(`<button class="portal-icon-opt${ic === add.icon ? ' on' : ''}" data-icon="${ic}"${gateAttr}>${ic}</button>`);
          b.addEventListener('click', () => {
            if (!CAN_MANAGE) return;
            add.icon = ic; add.mono = false;
            iconWrap.querySelectorAll('.portal-icon-opt').forEach(x => x.classList.toggle('on', x === b));
            renderAddPreview();
          });
          iconWrap.appendChild(b);
        });
        const monoBtn = H.el(`<button class="portal-icon-opt portal-icon-mono" data-icon="mono"${gateAttr}>Aa</button>`);
        monoBtn.addEventListener('click', () => {
          if (!CAN_MANAGE) return;
          add.mono = true;
          iconWrap.querySelectorAll('.portal-icon-opt').forEach(x => x.classList.toggle('on', x === monoBtn));
          renderAddPreview();
        });
        iconWrap.appendChild(monoBtn);

        // accent picker — coloured swatches (the sole inline-colour per client)
        const accentWrap = addCard.querySelector('[data-add="accents"]');
        ACCENT_CHOICES.forEach(col => {
          const b = H.el(`<button class="portal-accent-opt${col === add.accent ? ' on' : ''}" data-accent="${col}" style="--c:${col};background:${col}"${gateAttr} aria-label="accent ${col}"></button>`);
          b.addEventListener('click', () => {
            if (!CAN_MANAGE) return;
            add.accent = col;
            accentWrap.querySelectorAll('.portal-accent-opt').forEach(x => x.classList.toggle('on', x === b));
            renderAddPreview();
          });
          accentWrap.appendChild(b);
        });

        const nameInput = addCard.querySelector('[data-add="name"]');
        nameInput.addEventListener('input', () => { add.name = nameInput.value; renderAddPreview(); });
        areaSel.addEventListener('change', () => { add.area = areaSel.value; renderAddPreview(); });
        renderAddPreview();

        const openAdd = () => {
          if (!CAN_MANAGE) { H.toast('Needs admin role to add a client', 'warn'); return; }
          addCard.hidden = false;
          addCard.scrollIntoView({ block: 'center', behavior: 'smooth' });
          nameInput.focus({ preventScroll: true });
        };
        addCard.querySelector('[data-add="cancel"]').addEventListener('click', () => { addCard.hidden = true; });

        // CREATE — prepend a fresh client card + audit + toast
        addCard.querySelector('[data-add="create"]').addEventListener('click', () => {
          if (!CAN_MANAGE) { H.toast('Needs admin role to add a client', 'warn'); return; }
          if (!add.name.trim()) { H.toast('Give the client a name first', 'warn'); return; }
          const site = add.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'client';
          const fresh = {
            id: 'cl-' + (10 + CLIENTS.length),
            name: add.name.trim(), area: add.area,
            icon: add.mono ? '' : add.icon, accent: add.accent,
            status: 'Onboarding', site, users: 1, mrr: 0, lastDays: 0,
            contact: 'New contact', email: 'portal@' + site + '.se',
            scopes: ['documents', 'support']
          };
          CLIENTS.unshift(fresh);
          H.audit.log({
            action: 'portal.client.added',
            entityType: 'ClientWorkspace',
            entityId: fresh.id,
            summary: `${S.user.name} added ${fresh.name} as a new client workspace (${fresh.area})`,
            links: [{ entityType: 'Customer', entityId: clientRef(fresh) }],
            module: 'portal',
            after: { area: fresh.area, status: 'onboarding' }
          });
          H.toast(`${fresh.name} workspace created`, 'success');
          paint(); // re-render directory so the new card leads the grid
        });

        host.appendChild(addCard);

        /* ── CLIENT GRID ── */
        host.appendChild(H.el('<div class="section-title">Client workspaces</div>'));
        const grid = H.el('<div class="portal-grid"></div>');
        CLIENTS.forEach(c => grid.appendChild(clientCard(c)));
        host.appendChild(grid);

        // wire the head "Add client" button to the inline form
        host.querySelector('[data-act="add-top"]').addEventListener('click', openAdd);
      }

      /* one client "workspace" card in the directory grid */
      function clientCard(c) {
        const pill = STATUS_PILL[c.status] || 'info';
        const card = H.el(`
          <button class="card portal-card" data-open="${c.id}" style="--c:${c.accent}">
            <div class="portal-card-keyline" style="background:${c.accent}"></div>
            <div class="portal-card-head">
              ${identityTile(c, 'lg')}
              <div class="portal-card-id">
                <div class="portal-card-name">${c.name}</div>
                <span class="portal-area-tag" style="color:${c.accent};border-color:${c.accent}55;background:${c.accent}14">${c.area}</span>
              </div>
              <span class="pill ${pill} portal-card-status">${c.status}</span>
            </div>
            <div class="portal-card-stats">
              <div class="portal-stat">
                <div class="portal-stat-v">${H.fmt.num(c.users)}</div>
                <div class="portal-stat-l">Users</div>
              </div>
              <div class="portal-stat">
                <div class="portal-stat-v">${c.mrr ? kr(c.mrr) : '—'}</div>
                <div class="portal-stat-l">MRR</div>
              </div>
              <div class="portal-stat">
                <div class="portal-stat-v">${lastSeen(c.lastDays)}</div>
                <div class="portal-stat-l">Last active</div>
              </div>
            </div>
            <div class="portal-card-foot">
              <span class="portal-card-url">${c.site}.bifrost.app</span>
              <span class="portal-card-go" style="color:${c.accent}">Open workspace →</span>
            </div>
          </button>
        `);
        card.addEventListener('click', () => { view = c.id; paint(); });
        return card;
      }

      /* ════════════════════════════════════════════════════════════════════
         VIEW B — CLIENT WORKSPACE (re-themed to the client's accent)
         ════════════════════════════════════════════════════════════════════ */
      function paintWorkspace(c) {
        const A = c.accent;                 // this client's identity colour
        const pill = STATUS_PILL[c.status] || 'info';
        const canSee = k => c.scopes.includes(k);

        // wrap everything in a themed scope so the whole view reads as "their site"
        const wrap = H.el(`<div class="portal-ws" style="--c:${A}"></div>`);

        /* ── WORKSPACE HEAD: switch-back + quick client-switcher ── */
        const head = H.el(`
          <div class="view-head portal-ws-head" style="border-bottom:2px solid ${A}33">
            <div class="vh-title">
              ${identityTile(c, 'xl')}
              <div>
                <h1>${c.name}</h1>
                <p>
                  <span class="portal-area-tag" style="color:${A};border-color:${A}55;background:${A}14">${c.area}</span>
                  <span class="pill ${pill}" style="margin-left:6px">${c.status}</span>
                  <span class="portal-ws-accent" style="margin-left:6px"><i style="background:${A}"></i>${A.toUpperCase()}</span>
                </p>
              </div>
            </div>
            <div class="vh-actions">
              <select class="portal-select portal-switcher" title="Jump to another client"></select>
              <button class="btn btn-primary btn-sm portal-switch-back" style="background:${A};box-shadow:0 0 18px ${A}44">← Switch client</button>
            </div>
          </div>
        `);
        // quick client-switcher: jump straight to another client's site
        const switcher = head.querySelector('.portal-switcher');
        switcher.appendChild(H.el(`<option value="">Switch to…</option>`));
        CLIENTS.forEach(x => {
          if (x.id === c.id) return;
          switcher.appendChild(H.el(`<option value="${x.id}">${x.icon || '▢'} ${x.name} · ${x.area}</option>`));
        });
        switcher.addEventListener('change', () => {
          if (!switcher.value) return;
          view = switcher.value; paint();
        });
        head.querySelector('.portal-switch-back').addEventListener('click', () => { view = 'directory'; paint(); });
        wrap.appendChild(head);

        /* ── ROW 1: accounts/users table (span 2) + branding panel ── */
        const row1 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

        // ----- ACCOUNTS / USERS TABLE -----
        const tableCard = H.el(`
          <div class="card span-2 flush portal-table-card">
            <div class="card-head portal-table-head" style="border-bottom:1px solid ${A}33">
              <h3><span class="hico">🪪</span> ${c.name} · Portal Accounts</h3>
              <span class="ch-meta">${c.users} USERS · EXTERNAL LOGINS</span>
            </div>
            <div class="portal-table-scroll">
              <table class="table portal-table">
                <thead>
                  <tr><th>User</th><th>Login email</th><th>Role</th><th>Last seen</th><th class="portal-th-act">Action</th></tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        `);
        const tbody = tableCard.querySelector('tbody');
        // deterministic per-client roster (names from the client contact + seed)
        const FIRST = ['Eva', 'Jonas', 'Petra', 'Anders', 'Maria', 'Klara', 'Henrik', 'Ulf', 'Iris', 'Noah'];
        const LAST = ['Sund', 'Berg', 'Holm', 'Ek', 'Lund', 'Dahl', 'Falk', 'Ström'];
        const ROLES = ['Admin', 'Billing', 'Member', 'Viewer'];
        const seatCount = Math.min(5, Math.max(2, Math.round(c.users / 4)));
        const seats = [{ name: c.contact, email: c.email, role: 'Admin', lastDays: c.lastDays }];
        for (let i = 1; i < seatCount; i++) {
          const fn = FIRST[D.int('pf-' + c.id + i, 0, FIRST.length - 1)];
          const ln = LAST[D.int('pl-' + c.id + i, 0, LAST.length - 1)] + 'sson';
          seats.push({
            name: fn + ' ' + ln,
            email: fn.toLowerCase() + '@' + c.site + '.se',
            role: ROLES[D.int('pr-' + c.id + i, 1, ROLES.length - 1)],
            lastDays: D.int('ps-' + c.id + i, 0, 14)
          });
        }
        seats.forEach((s, idx) => {
          const stale = s.lastDays > 10;
          const tr = H.el(`
            <tr class="portal-row">
              <td>
                <div class="portal-acct">
                  <div class="portal-seat-av" style="background:${A}22;color:${A};border-color:${A}55">${D.initials(s.name)}</div>
                  <div class="portal-acct-body"><div class="portal-acct-name">${s.name}</div></div>
                </div>
              </td>
              <td class="mono portal-email">${s.email}</td>
              <td><span class="portal-role-chip" style="color:${A};border-color:${A}44">${s.role}</span></td>
              <td class="portal-seen ${stale ? 'is-stale' : ''}">${lastSeen(s.lastDays)}</td>
              <td><div class="portal-row-actions"><button class="btn btn-sm" data-seat="${idx}">Manage</button></div></td>
            </tr>
          `);
          tr.querySelector('[data-seat]').addEventListener('click', () => {
            if (!CAN_MANAGE) { H.toast('Needs admin role to manage seats', 'warn'); return; }
            H.toast(`${s.name} · seat settings opened`, 'info');
          });
          tbody.appendChild(tr);
        });
        row1.appendChild(tableCard);

        // ----- BRANDING / IDENTITY PANEL -----
        const brand = H.el(`
          <div class="card portal-brand">
            <div class="card-head"><h3><span class="hico">🎨</span> Branding</h3><span class="ch-meta">CLIENT IDENTITY</span></div>
            <div class="portal-brand-hero" style="background:linear-gradient(135deg,${A}22,transparent)">
              ${identityTile(c, 'xl')}
              <div class="portal-brand-meta">
                <div class="portal-brand-name">${c.name}</div>
                <span class="portal-area-tag" style="color:${A};border-color:${A}55;background:${A}14">${c.area}</span>
              </div>
            </div>
            <div class="portal-brand-rows">
              <div class="portal-brand-row"><span>Icon</span><b>${c.icon ? c.icon + '  emoji' : D.initials(c.name) + '  monogram'}</b></div>
              <div class="portal-brand-row"><span>Accent</span><b class="portal-brand-accent"><i style="background:${A}"></i>${A.toUpperCase()}</b></div>
              <div class="portal-brand-row"><span>Status</span><b><span class="pill ${pill}">${c.status}</span></b></div>
            </div>
            <div class="portal-field">
              <label class="portal-label">Client login URL</label>
              <div class="portal-url-mock">
                <span class="portal-url-lock">🔒</span>
                <span class="portal-url-text">${c.site}.bifrost.app/login</span>
                <button class="btn btn-sm portal-url-copy" data-copy>Copy</button>
              </div>
            </div>
            <button class="btn btn-block btn-sm mt-sm" data-rebrand style="border-color:${A}55">Edit branding</button>
          </div>
        `);
        brand.querySelector('[data-copy]').addEventListener('click', () => {
          const url = c.site + '.bifrost.app/login';
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).catch(() => {});
          }
          H.toast('Client login URL copied', 'info');
        });
        brand.querySelector('[data-rebrand]').addEventListener('click', () => {
          if (!CAN_MANAGE) { H.toast('Needs admin role to edit branding', 'warn'); return; }
          act(c, 'rebrand.opened', 'opened branding for', 'Branding editor opened', 'info');
        });
        row1.appendChild(brand);
        wrap.appendChild(row1);

        /* ── ROW 2: "What they can see" + status ── */
        const row2 = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

        // what this client can access (shared scopes) — toggled live, audited
        const accessCard = H.el(`
          <div class="card span-2 portal-access">
            <div class="card-head"><h3><span class="hico">🔐</span> What ${c.name} Can See</h3><span class="ch-meta">SHARED ACCESS</span></div>
            <div class="portal-access-grid"></div>
            <div class="portal-access-note">Toggle a surface to grant or hide it inside ${c.name}'s portal. The client preview updates live.</div>
          </div>
        `);
        const accessGrid = accessCard.querySelector('.portal-access-grid');
        ALL_SCOPES.forEach(s => {
          const on = canSee(s.key);
          const tile = H.el(`
            <button class="portal-access-tile${on ? ' on' : ''}" data-scope="${s.key}"${gateAttr}
                    style="${on ? `border-color:${A}66;background:${A}12` : ''}">
              <span class="portal-access-ico">${s.ico}</span>
              <span class="portal-access-name">${s.label}</span>
              <span class="portal-access-state" style="${on ? `color:${A}` : ''}">${on ? 'SHARED' : 'HIDDEN'}</span>
            </button>
          `);
          tile.addEventListener('click', () => {
            if (!CAN_MANAGE) { H.toast('Needs admin role to change access', 'warn'); return; }
            const i = c.scopes.indexOf(s.key);
            if (i >= 0) c.scopes.splice(i, 1); else c.scopes.push(s.key);
            const nowOn = c.scopes.includes(s.key);
            act(c, nowOn ? 'access.granted' : 'access.revoked',
              (nowOn ? 'granted ' : 'hid ') + s.label + ' for', `${s.label} ${nowOn ? 'shared' : 'hidden'}`, nowOn ? 'success' : 'warn');
            paintWorkspaceLive(c);  // re-theme + refresh preview in place
          });
          accessGrid.appendChild(tile);
        });
        row2.appendChild(accessCard);

        // quick status / health snapshot for this tenant
        const statusCard = H.el(`
          <div class="card portal-status">
            <div class="card-head"><h3><span class="hico">📡</span> Status</h3><span class="pill ${pill}">${c.status}</span></div>
            <div class="portal-status-rows">
              <div class="stat-row"><span class="sr-label">Active seats</span><span class="sr-val">${c.users}</span></div>
              <div class="stat-row"><span class="sr-label">Monthly value</span><span class="sr-val">${c.mrr ? kr(c.mrr) : '—'}</span></div>
              <div class="stat-row"><span class="sr-label">Last login</span><span class="sr-val">${lastSeen(c.lastDays)}</span></div>
              <div class="stat-row"><span class="sr-label">Open invoices</span><span class="sr-val">${D.int('pi-' + c.id, 0, 3)}</span></div>
              <div class="stat-row"><span class="sr-label">Shared docs</span><span class="sr-val">${D.int('pd-' + c.id, 2, 9)}</span></div>
            </div>
            <button class="btn btn-block btn-sm mt-sm" data-status style="border-color:${A}55">Open status page</button>
          </div>
        `);
        statusCard.querySelector('[data-status]').addEventListener('click', () =>
          H.toast(`${c.name} · status page (preview only)`, 'info'));
        row2.appendChild(statusCard);
        wrap.appendChild(row2);

        /* ── CLIENT PREVIEW — framed mock of what THIS client sees ── */
        const preview = H.el(`
          <div class="card portal-preview-card">
            <div class="card-head">
              <h3><span class="hico">👁️</span> Client Preview · ${c.name}</h3>
              <span class="ch-meta">WHAT ${c.name.toUpperCase()} SEES</span>
            </div>
            <div class="portal-preview"></div>
          </div>
        `);
        preview.querySelector('.portal-preview').innerHTML = previewMarkup(c);
        // sandbox the mock buttons
        preview.querySelectorAll('.portal-pv-btn').forEach(b =>
          b.addEventListener('click', () => H.toast('This is the client-side button (preview only)', 'info')));
        wrap.appendChild(preview);

        host.appendChild(wrap);
      }

      /* re-paint ONLY the workspace (used after a live access toggle) so the
         re-theme + preview update without bouncing back to the directory */
      function paintWorkspaceLive(c) {
        host.innerHTML = '';
        paintWorkspace(c);
        H.countAll(host);
      }

      /* the framed customer-facing mock — themed to the client's accent */
      function previewMarkup(c) {
        const A = c.accent;
        const canSee = k => c.scopes.includes(k);
        const trend = D.series('portal-prev-' + c.id, 8, Math.max(3, c.users * 0.5 + 2), Math.max(6, c.users + 4), 0.18);
        const openInv = D.int('pi-' + c.id, 0, 3);
        const dueAmt = openInv ? D.int('pa-' + c.id, 4200, 38000) : 0;
        const docCount = D.int('pd-' + c.id, 2, 9);
        const tabs = [];
        if (canSee('invoices')) tabs.push('Invoices');
        if (canSee('documents')) tabs.push('Documents');
        if (canSee('status')) tabs.push('Status');
        if (canSee('support')) tabs.push('Support');

        return `
          <div class="portal-pv-chrome">
            <span class="portal-pv-dot"></span><span class="portal-pv-dot"></span><span class="portal-pv-dot"></span>
            <span class="portal-pv-url">${c.site}.bifrost.app / login</span>
          </div>
          <div class="portal-pv-body">
            <div class="portal-pv-head">
              <div class="portal-pv-brand">
                ${identityTile(c, 'lg')}
                <div>
                  <div class="portal-pv-hi" style="color:${A}">Welcome back, ${c.contact.split(' ')[0]}</div>
                  <div class="portal-pv-sub">${c.name} · ${c.email}</div>
                </div>
              </div>
              <div class="portal-pv-head-right">
                <div class="portal-pv-trend">
                  <span class="portal-pv-trend-lbl">${c.users} active users</span>
                  <div class="spark portal-pv-spark">${H.charts.spark(trend, { height: 30, color: A })}</div>
                </div>
                <div class="portal-pv-account" style="border-color:${A}44">Your account ▾</div>
              </div>
            </div>

            ${tabs.length ? `<div class="portal-pv-tabs">
              ${tabs.map((t, i) => `<span class="portal-pv-tab${i === 0 ? ' is-on' : ''}" style="${i === 0 ? `color:${A};background:${A}1a;box-shadow:inset 0 0 0 1px ${A}44` : ''}">${t}</span>`).join('')}
            </div>` : '<div class="portal-pv-empty">No surfaces shared yet — grant access on the left.</div>'}

            <div class="portal-pv-grid">
              ${canSee('invoices') ? `
                <div class="portal-pv-tile">
                  <div class="portal-pv-tile-top"><span>Open invoices</span><span class="portal-pv-pill ${openInv ? 'warn' : 'ok'}">${openInv ? 'DUE' : 'CLEAR'}</span></div>
                  <div class="portal-pv-big">${openInv}</div>
                  <div class="portal-pv-foot">${openInv ? kr(dueAmt) + ' outstanding' : 'All paid — thank you'}</div>
                </div>` : ''}
              ${canSee('status') ? `
                <div class="portal-pv-tile">
                  <div class="portal-pv-tile-top"><span>Service status</span><span class="portal-pv-pill ok">OPERATIONAL</span></div>
                  <div class="portal-pv-big" style="color:${A}">99.9%</div>
                  <div class="portal-pv-foot">Uptime · all systems green</div>
                </div>` : ''}
              ${canSee('documents') ? `
                <div class="portal-pv-tile">
                  <div class="portal-pv-tile-top"><span>Shared documents</span><span class="portal-pv-pill ok">${docCount}</span></div>
                  <div class="portal-pv-big">${docCount}</div>
                  <div class="portal-pv-foot">Contracts &amp; reports</div>
                </div>` : ''}
              ${canSee('support') ? `
                <div class="portal-pv-tile">
                  <div class="portal-pv-tile-top"><span>Support</span><span class="portal-pv-pill ok">ONLINE</span></div>
                  <div class="portal-pv-big">${D.int('pt-' + c.id, 0, 2)}</div>
                  <div class="portal-pv-foot">Open tickets · reply &lt; 4h</div>
                </div>` : ''}
            </div>

            ${canSee('invoices') ? `
              <div class="portal-pv-list">
                <div class="portal-pv-list-head">Recent invoices</div>
                ${[0, 1, 2].map(n => {
                  const num = 3120 - n - (parseInt(c.id.slice(3), 10) || 0);
                  const amt = D.int('portal-pvinv-' + c.id + n, 4200, 36000);
                  const paid = n > openInv - 1;
                  return `<div class="portal-pv-li">
                    <span class="portal-pv-li-ico">🧾</span>
                    <span class="portal-pv-li-main">Invoice #${num}</span>
                    <span class="portal-pv-li-amt">${kr(amt)}</span>
                    <span class="portal-pv-li-status ${paid ? 'ok' : 'warn'}">${paid ? 'Paid' : 'Due'}</span>
                  </div>`;
                }).join('')}
              </div>` : ''}

            <div class="portal-pv-cta">
              ${canSee('support') ? `<button class="portal-pv-btn" style="border-color:${A}55">Contact support</button>` : ''}
              ${canSee('invoices') ? `<button class="portal-pv-btn primary" style="background:${A};border-color:transparent;box-shadow:0 0 18px ${A}44">Pay open invoices</button>` : ''}
            </div>
          </div>
        `;
      }

      /* ── first paint ── */
      paint();
    }
  });
})();
