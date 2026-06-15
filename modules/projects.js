/* ============================================================================
   projects.js — Projects & the GLOBAL task board (capability #17).
   The single Trello-style board for the whole company: every task, every
   person, every column. Filter to "my tasks" or a teammate, toggle per-person
   swimlanes, advance cards through Backlog → Todo → Doing → Review → Done.
   Each move writes HELM.audit.log({action:'task.moved'…}). The task pool mirrors
   what My Day reads, so the same work shows up in both places.

   Follows the HELM module contract (see command.js for the canonical shape):
     1) HELM.register({ id, label, icon, render })
     2) build DOM with H.el() + documented .classes + HELM.charts
     3) namespaced .projects-* tweaks live in projects.css
     4) never inject fonts/colors/global styles; never touch another module
   ========================================================================== */
(function () {
  const H = window.HELM;
  const D = H.data;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ── board column model (the global workflow) ───────────────────────────── */
  const COLS = [
    { id: 'backlog', title: 'Backlog', accent: 'var(--text-faint)' },
    { id: 'todo',    title: 'Todo',    accent: 'var(--accent2)' },
    { id: 'doing',   title: 'Doing',   accent: 'var(--accent1)' },
    { id: 'review',  title: 'Review',  accent: 'var(--warn)' },
    { id: 'done',    title: 'Done',    accent: 'var(--success)' }
  ];
  const COL_INDEX = COLS.reduce((m, c, i) => { m[c.id] = i; return m; }, {});

  /* ── deterministic task seed — ~16 tasks across the real 8-person team ─────
     `who` is a HELM.session team id so avatars/filters resolve against the
     actual roster. Titles/projects echo My Day's per-person task pool so the
     same work feels shared between the two surfaces. ───────────────────────── */
  const SEED_TASKS = [
    // Arvid — owner / CEO
    { id: 't-01', t: 'Review Q2 board deck before 14:00', who: 'u-arvid', project: 'Board', tag: 'Strategy', tagk: 'info', due: 'Jun 15', pr: 'high', col: 'doing' },
    { id: 't-02', t: 'Sign the Lykke Studios MSA', who: 'u-arvid', project: 'Legal', tag: 'Vault', tagk: 'warn', due: 'Jun 16', pr: 'high', col: 'review' },
    // Mira — admin / COO
    { id: 't-03', t: 'Approve June hiring plan', who: 'u-mira', project: 'People', tag: 'Crew', tagk: 'info', due: 'Jun 17', pr: 'med', col: 'todo' },
    { id: 't-04', t: 'Finalise Q2 board minutes', who: 'u-mira', project: 'Board', tag: 'Meetings', tagk: '', due: 'Jun 18', pr: 'low', col: 'doing' },
    // Ola — finance
    { id: 't-05', t: 'Categorise 4,200 kr cost', who: 'u-ola', project: 'Finance', tag: 'Ledger', tagk: 'warn', due: 'Jun 16', pr: 'med', col: 'todo' },
    { id: 't-06', t: 'Close the May books', who: 'u-ola', project: 'Finance', tag: 'Ledger', tagk: '', due: 'Jun 20', pr: 'high', col: 'backlog' },
    // Sofia — sales
    { id: 't-07', t: 'Call Halland Bryggeri back', who: 'u-sofia', project: 'Northwind AB — Portal', tag: 'Pipeline', tagk: 'info', due: 'Jun 15', pr: 'high', col: 'doing' },
    { id: 't-08', t: 'Send Forsberg the signed order', who: 'u-sofia', project: 'Forsberg CRM', tag: 'Sales', tagk: 'ok', due: 'Jun 14', pr: 'med', col: 'done' },
    // Noah — engineering
    { id: 't-09', t: 'Fix AX-12 inventory sync error', who: 'u-noah', project: 'Helm Command Deck', tag: 'Backend', tagk: 'bad', due: 'Jun 16', pr: 'high', col: 'doing', blocked: true },
    { id: 't-10', t: 'Cut helm-web v1.8.3', who: 'u-noah', project: 'Helm Command Deck', tag: 'Release', tagk: 'info', due: 'Jun 18', pr: 'med', col: 'todo' },
    { id: 't-11', t: 'Command palette — task search', who: 'u-noah', project: 'Helm Command Deck', tag: 'Frontend', tagk: 'ok', due: 'Jun 19', pr: 'low', col: 'review' },
    // Lena — ops
    { id: 't-12', t: 'Reorder AX-12 stock', who: 'u-lena', project: 'Ops', tag: 'Inventory', tagk: 'bad', due: 'Jun 15', pr: 'high', col: 'todo', blocked: true },
    { id: 't-13', t: 'Process return — Order #0992', who: 'u-lena', project: 'Ops', tag: 'Orders', tagk: 'warn', due: 'Jun 17', pr: 'med', col: 'backlog' },
    // Kai — marketing
    { id: 't-14', t: 'Check Midsummer campaign ROAS', who: 'u-kai', project: 'Lykke Studios Rebrand', tag: 'Growth', tagk: 'info', due: 'Jun 16', pr: 'med', col: 'doing' },
    { id: 't-15', t: 'Draft the June newsletter', who: 'u-kai', project: 'Comms', tag: 'Content', tagk: '', due: 'Jun 19', pr: 'low', col: 'backlog' },
    // Isa — customer success
    { id: 't-16', t: 'Onboard Lykke to the portal', who: 'u-isa', project: 'Northwind AB — Portal', tag: 'Portal', tagk: 'ok', due: 'Jun 13', pr: 'low', col: 'done' }
  ];

  // module-level mutable state survives re-renders (filter/swimlane/user switch)
  let TASKS = SEED_TASKS.map(t => Object.assign({}, t));
  const STATE = { filter: 'all', swimlanes: false };
  let _unsubUser = null; // active helm:user subscription (one at a time)

  H.register({
    id: 'projects',
    label: 'Projects',
    icon: '🗂️',
    render(root) {
      /* ── acting person (board filters reference the live session user) ───── */
      const _sessionUser = H.session.user || (H.session.team && H.session.team[0]) || { id: '?', name: 'You' };
      // local, non-destructive copy — NEVER mutate the session/team record itself
      const me = { id: _sessionUser.id, name: _sessionUser.name };
      const team = H.session.team || [];
      const byId = {}; team.forEach(p => byId[p.id] = p);
      // write-gate tracks the ACTING user — recomputed on every user switch below,
      // so the move arrows / add-card / composer enable-state follow the live role.
      let canWrite = H.session.can('projects.write');

      // deterministic avatar palette keyed by person id (stable colours)
      const AV_COLORS = ['var(--accent1)', 'var(--accent2)', 'var(--accent3)', 'var(--warn)', 'var(--success)', 'var(--danger)', 'var(--accent2)', 'var(--accent3)'];
      const colorFor = (id) => AV_COLORS[Math.abs(team.findIndex(p => p.id === id)) % AV_COLORS.length] || 'var(--accent2)';
      const personOf = (id) => byId[id] || { id, name: 'Unassigned', avatar: '–' };
      const av = (id, opts) => {
        const p = personOf(id);
        const cls = (opts && opts.cls) || '';
        const init = p.avatar || D.initials(p.name);
        return `<div class="avatar ${cls} projects-av" style="background:${colorFor(id)};color:var(--bg)" title="${esc(p.name)}">${esc(init)}</div>`;
      };

      /* ── 0. VIEW HEAD ──────────────────────────────────────────────────── */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">🗂️</div>
            <div>
              <h1>Projects</h1>
              <p>The company task board — every project, sprint and task in one cockpit.</p>
            </div>
          </div>
          <div class="vh-actions">
            <button class="btn btn-ghost btn-sm" data-act="cmdk">⌘K Jump to task</button>
            <button class="btn btn-ghost btn-sm" data-act="sprint">◷ Sprint review</button>
            <button class="btn btn-primary btn-sm" data-act="newtask"${canWrite ? '' : ' disabled title="Needs member role"'}>＋ New task</button>
          </div>
        </div>
      `));

      /* ── 1. KPI ROW — board health (Open / Due this week / Blocked / Done) ─ */
      const kRow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
      root.appendChild(kRow);

      /* ── 2. BURNDOWN + SPRINT VITALS (kept intact) ─────────────────────── */
      const ideal = [120, 108, 96, 84, 72, 60, 48, 36, 24, 12];
      const actual = D.series('proj-burn', 10, 120, 30, 0.05);
      const burnRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      burnRow.appendChild(H.el(`
        <div class="card span-2 projects-burn">
          <div class="card-head">
            <h3><span class="hico">📉</span> Sprint Burndown</h3>
            <span class="ch-meta">SPRINT 14 · 120 SP</span>
          </div>
          <div class="projects-burn-legend">
            <span class="bl ideal"><i></i>IDEAL</span>
            <span class="bl actual"><i></i>REMAINING</span>
          </div>
          <div class="chart" style="height:220px">
            ${H.charts.area(actual, { height: 220, v2: ideal, labels: ['D1', 'D4', 'D7', 'D10'], forecastFrom: 7 })}
          </div>
        </div>
      `));

      const vitals = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🎯</span> Sprint 14</h3>
            <span class="pill ok">ON TRACK</span>
          </div>
          <div class="projects-vitals"></div>
        </div>
      `);
      const vWrap = vitals.querySelector('.projects-vitals');
      [
        ['Velocity', '76 SP', 'avg 71 · +7%'],
        ['Committed', '120 SP', '24 stories'],
        ['Completed', '76 SP', '15 stories done'],
        ['Scope change', '+8 SP', '1 story added day 5'],
        ['Days left', '2', 'demo Friday 14:00']
      ].forEach(([l, v, sub]) => {
        vWrap.appendChild(H.el(`
          <div class="projects-vital-row">
            <div class="pv-l"><div class="pv-label">${l}</div><div class="pv-sub">${sub}</div></div>
            <div class="pv-val mono">${v}</div>
          </div>
        `));
      });
      vitals.appendChild(H.el(`
        <div class="mt">
          <div class="row between" style="margin-bottom:6px">
            <span class="kpi-label">SPRINT GOAL</span>
            <span class="mono" style="font-size:11px;color:var(--accent1)">63%</span>
          </div>
          <div class="progress"><div class="bar" style="width:0" data-fill="63"></div></div>
        </div>
      `));
      burnRow.appendChild(vitals);
      root.appendChild(burnRow);

      /* ── 3. GLOBAL TASK BOARD ──────────────────────────────────────────── */
      const boardCard = H.el(`
        <div class="card flush projects-boardwrap" style="margin-bottom:var(--gap)">
          <div class="projects-board-head">
            <div class="row gap-sm" style="flex-wrap:wrap">
              <h3><span class="hico">🗂️</span> Task Board <span class="muted" style="font-weight:400;font-size:12px">· company-wide</span></h3>
              <span class="pill" data-board-count><i></i>0 OPEN</span>
            </div>
            <div class="row gap-sm">
              <button class="btn btn-sm projects-swim-toggle" data-act="swimlanes" aria-pressed="false">⇋ Swimlanes</button>
              <button class="btn btn-sm btn-primary" data-act="newtask2"${canWrite ? '' : ' disabled title="Needs member role"'}>＋ Task</button>
            </div>
          </div>
          <div class="projects-filters"></div>
          <div class="projects-board-host"></div>
        </div>
      `);
      const filterWrap = boardCard.querySelector('.projects-filters');
      const boardHost = boardCard.querySelector('.projects-board-host');
      root.appendChild(boardCard);

      /* ── filter chips: All / My tasks / per-person ─────────────────────── */
      function buildFilters() {
        filterWrap.innerHTML = '';
        const chip = (key, label, sub, avHtml) => {
          const active = STATE.filter === key;
          const c = H.el(`
            <button class="projects-chip${active ? ' active' : ''}" data-filter="${esc(key)}" title="${esc(sub || label)}">
              ${avHtml || ''}<span class="projects-chip-lbl">${esc(label)}</span>
              <span class="projects-chip-n">${countFor(key)}</span>
            </button>
          `);
          c.addEventListener('click', () => {
            STATE.filter = key;
            buildFilters();
            renderBoard();
            H.toast(key === 'all' ? 'Showing all tasks' : key === 'mine' ? 'Showing your tasks' : 'Filtering to ' + personOf(key).name, 'info');
          });
          return c;
        };
        filterWrap.appendChild(chip('all', 'All', 'Every task on the board'));
        filterWrap.appendChild(chip('mine', 'My tasks', 'Assigned to you (' + me.name + ')',
          `<span class="projects-chip-av">${av(me.id, { cls: 'sq' })}</span>`));
        filterWrap.appendChild(H.el(`<span class="projects-chip-div"></span>`));
        team.forEach(p => {
          filterWrap.appendChild(chip(p.id, firstNameOf(p.name), p.name + ' · ' + (p.title || ''),
            `<span class="projects-chip-av">${av(p.id, { cls: 'sq' })}</span>`));
        });
      }
      function firstNameOf(n) { return String(n || '').trim().split(/\s+/)[0] || n; }
      function countFor(key) {
        if (key === 'all') return TASKS.length;
        if (key === 'mine') return TASKS.filter(t => t.who === me.id).length;
        return TASKS.filter(t => t.who === key).length;
      }
      function visibleTasks() {
        if (STATE.filter === 'all') return TASKS;
        if (STATE.filter === 'mine') return TASKS.filter(t => t.who === me.id);
        return TASKS.filter(t => t.who === STATE.filter);
      }

      const prDot = pr => `<span class="projects-pr ${esc(pr)}" title="${esc(pr)} priority"></span>`;

      // build one task card element (wired for click-to-advance + open)
      function makeCard(c) {
        const isDone = c.col === 'done';
        const node = H.el(`
          <div class="projects-card ${isDone ? 'is-done' : ''} ${c.blocked ? 'is-blocked' : ''}" tabindex="0" data-task="${esc(c.id)}">
            ${c.blocked ? '<div class="projects-card-flag">⚑ BLOCKED</div>' : ''}
            <div class="projects-card-title">${esc(c.t)}</div>
            <div class="projects-card-tags">
              <span class="tag ${esc(c.tagk || '')}">${esc(c.tag)}</span>
              <span class="projects-proj">${esc(c.project)}</span>
            </div>
            <div class="projects-card-foot">
              <div class="row gap-sm" style="min-width:0">
                ${av(c.who, { cls: 'sq' })}
                ${prDot(c.pr)}
                <span class="projects-due ${isDone ? 'done' : ''}">${isDone ? '✓ ' : '◷ '}${esc(c.due)}</span>
              </div>
              <div class="projects-card-move">
                <button class="projects-mv" data-mv="back" title="Move back" ${COL_INDEX[c.col] === 0 ? 'disabled' : ''} ${canWrite ? '' : 'disabled'}>‹</button>
                <button class="projects-mv" data-mv="fwd" title="Advance" ${COL_INDEX[c.col] === COLS.length - 1 ? 'disabled' : ''} ${canWrite ? '' : 'disabled'}>›</button>
              </div>
            </div>
          </div>
        `);
        // click body opens; arrows advance/retreat (click-to-advance on the card too)
        node.addEventListener('click', (e) => {
          if (e.target.closest('.projects-mv')) return;
          H.toast('Opening task: ' + c.t, 'info');
        });
        node.querySelector('[data-mv="fwd"]').addEventListener('click', (e) => { e.stopPropagation(); moveTask(c.id, +1); });
        node.querySelector('[data-mv="back"]').addEventListener('click', (e) => { e.stopPropagation(); moveTask(c.id, -1); });
        return node;
      }

      /* ── move a card between columns + audit ───────────────────────────── */
      function moveTask(taskId, dir) {
        if (!canWrite) { H.toast('Needs member role to move tasks', 'warn'); return; }
        const t = TASKS.find(x => x.id === taskId);
        if (!t) return;
        const from = COL_INDEX[t.col];
        const to = from + dir;
        if (to < 0 || to > COLS.length - 1) return;
        const fromCol = COLS[from], toCol = COLS[to];
        t.col = toCol.id;
        if (toCol.id === 'done') t.blocked = false;
        H.audit.log({
          action: 'task.moved',
          entityType: 'Task',
          entityId: t.id,
          summary: `${me.name} moved "${t.t}" from ${fromCol.title} to ${toCol.title}`,
          before: { status: fromCol.id },
          after: { status: toCol.id },
          links: [{ entityType: 'Person', entityId: t.who }],
          module: 'projects'
        });
        H.toast(`"${t.t}" → ${toCol.title}`, toCol.id === 'done' ? 'success' : 'info');
        renderBoard();
        renderKpis();
        renderMyTasks(); // keep the My Tasks panel (column subtitle + count) in sync
      }

      /* ── render the board (columns or per-person swimlanes) ────────────── */
      function renderBoard() {
        boardHost.innerHTML = '';
        const tasks = visibleTasks();
        updateBoardCount(tasks);

        if (STATE.swimlanes) {
          // group by person, one swimlane each (only people with visible tasks)
          const people = team.filter(p => tasks.some(t => t.who === p.id));
          if (!people.length) { boardHost.appendChild(emptyState()); return; }
          people.forEach(p => {
            const mine = tasks.filter(t => t.who === p.id);
            const lane = H.el(`
              <div class="projects-lane">
                <div class="projects-lane-head">
                  ${av(p.id, { cls: 'sq' })}
                  <span class="projects-lane-name">${esc(p.name)}</span>
                  <span class="projects-lane-role">${esc(p.title || '')}</span>
                  <span class="projects-lane-n">${mine.length} TASK${mine.length === 1 ? '' : 'S'}</span>
                </div>
                <div class="projects-board projects-board-lane"></div>
              </div>
            `);
            fillColumns(lane.querySelector('.projects-board'), mine, true);
            boardHost.appendChild(lane);
          });
        } else {
          if (!tasks.length) { boardHost.appendChild(emptyState()); return; }
          const board = H.el(`<div class="projects-board"></div>`);
          fillColumns(board, tasks, false);
          boardHost.appendChild(board);
        }
      }

      function fillColumns(boardEl, tasks, compact) {
        COLS.forEach(col => {
          const cards = tasks.filter(t => t.col === col.id);
          const colEl = H.el(`
            <div class="projects-col ${compact ? 'projects-col-compact' : ''}" data-col="${col.id}">
              <div class="projects-col-head" style="--col-accent:${col.accent}">
                <span class="pc-dot"></span>
                <span class="pc-title">${esc(col.title)}</span>
                <span class="pc-count">${cards.length}</span>
              </div>
              <div class="projects-col-body"></div>
              ${compact ? '' : `<button class="projects-add" data-col-add="${col.id}"${canWrite ? '' : ' disabled'}>＋ Add card</button>`}
            </div>
          `);
          const body = colEl.querySelector('.projects-col-body');
          cards.forEach(c => body.appendChild(makeCard(c)));
          if (!compact) {
            const addBtn = colEl.querySelector('[data-col-add]');
            if (addBtn) addBtn.addEventListener('click', () => openNewTask(col.id));
          }
          boardEl.appendChild(colEl);
        });
      }

      function emptyState() {
        return H.el(`<div class="projects-board-empty">🍃 No tasks here yet — nothing assigned for this view.</div>`);
      }

      function updateBoardCount(tasks) {
        const open = tasks.filter(t => t.col !== 'done').length;
        const el = boardCard.querySelector('[data-board-count]');
        if (el) el.innerHTML = `<i></i>${open} OPEN · ${tasks.length - open} DONE`;
      }

      /* ── ＋ New task — inline composer with assignee select ────────────── */
      function openNewTask(presetCol) {
        if (!canWrite) { H.toast('Needs member role to add tasks', 'warn'); return; }
        // remove any existing composer first
        const existing = boardCard.querySelector('.projects-composer');
        if (existing) existing.remove();
        const opts = team.map(p => `<option value="${esc(p.id)}"${p.id === me.id ? ' selected' : ''}>${esc(p.name)} · ${esc(p.title || '')}</option>`).join('');
        const colOpts = COLS.map(c => `<option value="${esc(c.id)}"${c.id === (presetCol || 'backlog') ? ' selected' : ''}>${esc(c.title)}</option>`).join('');
        const composer = H.el(`
          <div class="projects-composer">
            <div class="projects-composer-row">
              <input type="text" class="projects-input" data-f="title" placeholder="Task title — e.g. Draft the launch checklist" />
            </div>
            <div class="projects-composer-row projects-composer-meta">
              <label class="projects-field"><span>Assignee</span><select class="projects-select" data-f="who">${opts}</select></label>
              <label class="projects-field"><span>Column</span><select class="projects-select" data-f="col">${colOpts}</select></label>
              <label class="projects-field"><span>Priority</span>
                <select class="projects-select" data-f="pr"><option value="low">Low</option><option value="med" selected>Medium</option><option value="high">High</option></select>
              </label>
              <label class="projects-field"><span>Project</span><input type="text" class="projects-input projects-input-sm" data-f="project" value="Internal" /></label>
            </div>
            <div class="projects-composer-row projects-composer-actions">
              <button class="btn btn-sm btn-primary" data-c="save">Create task</button>
              <button class="btn btn-sm btn-ghost" data-c="cancel">Cancel</button>
            </div>
          </div>
        `);
        boardCard.insertBefore(composer, boardHost);
        const titleEl = composer.querySelector('[data-f="title"]');
        titleEl.focus();
        composer.querySelector('[data-c="cancel"]').addEventListener('click', () => composer.remove());
        composer.querySelector('[data-c="save"]').addEventListener('click', () => {
          const title = titleEl.value.trim();
          if (!title) { H.toast('Give the task a title first', 'warn'); titleEl.focus(); return; }
          const who = composer.querySelector('[data-f="who"]').value;
          const col = composer.querySelector('[data-f="col"]').value;
          const pr = composer.querySelector('[data-f="pr"]').value;
          const project = composer.querySelector('[data-f="project"]').value.trim() || 'Internal';
          const id = 't-' + (TASKS.length + 1).toString().padStart(2, '0') + '-' + Date.now().toString(36).slice(-3);
          const task = { id, t: title, who, project, tag: 'New', tagk: 'info', due: 'TBD', pr, col };
          TASKS.push(task);
          H.audit.log({
            action: 'task.created',
            entityType: 'Task',
            entityId: id,
            summary: `${me.name} created "${title}" for ${personOf(who).name} in ${COLS[COL_INDEX[col]].title}`,
            after: { status: col, assignee: who, priority: pr },
            links: [{ entityType: 'Person', entityId: who }],
            module: 'projects'
          });
          H.toast('Task created — assigned to ' + personOf(who).name, 'success');
          composer.remove();
          buildFilters();
          renderBoard();
          renderKpis();
          renderMyTasks(); // a task assigned to the acting user must surface in My Tasks now
        });
        composer.querySelector('[data-f="title"]').addEventListener('keydown', (e) => {
          if (e.key === 'Enter') composer.querySelector('[data-c="save"]').click();
        });
      }

      /* ── swimlane toggle ───────────────────────────────────────────────── */
      const swimBtn = boardCard.querySelector('[data-act="swimlanes"]');
      function syncSwim() {
        swimBtn.classList.toggle('btn-primary', STATE.swimlanes);
        swimBtn.setAttribute('aria-pressed', String(STATE.swimlanes));
      }
      swimBtn.addEventListener('click', () => {
        STATE.swimlanes = !STATE.swimlanes;
        syncSwim();
        renderBoard();
        H.toast(STATE.swimlanes ? 'Swimlanes on — grouped by person' : 'Swimlanes off — single board', 'info');
      });
      syncSwim();

      /* ── 4. KPI ROW builder (recomputes from live TASKS) ───────────────── */
      function renderKpis() {
        const open = TASKS.filter(t => t.col !== 'done').length;
        // "due this week" = committed work (todo/doing/review) — backlog isn't scheduled yet
        const dueWeek = TASKS.filter(t => t.col === 'todo' || t.col === 'doing' || t.col === 'review').length;
        const blocked = TASKS.filter(t => t.blocked).length;
        const doneWeek = TASKS.filter(t => t.col === 'done').length;
        const kpis = [
          { label: 'OPEN TASKS', count: open, fmt: 'num', trend: '+' + Math.max(1, Math.round(open / 6)), dir: 'flat', sub: 'across ' + new Set(TASKS.filter(t => t.col !== 'done').map(t => t.who)).size + ' people', spark: D.series('k-open', 12, 8, open, 0.18) },
          { label: 'DUE THIS WEEK', count: dueWeek, fmt: 'num', trend: '6 today', dir: 'flat', sub: 'Sprint 14 · day 8/10', spark: D.series('k-due', 12, 6, Math.max(1, dueWeek), 0.2) },
          { label: 'BLOCKED', count: blocked, fmt: 'num', trend: blocked ? blocked + ' to clear' : 'clear', dir: blocked ? 'down' : 'up', sub: blocked ? 'waiting on deps' : 'nothing stuck', spark: D.series('k-block', 12, 0, Math.max(1, blocked), 0.3) },
          { label: 'DONE THIS WEEK', count: doneWeek, fmt: 'num', trend: '+' + doneWeek, dir: 'up', sub: 'shipped & closed', spark: D.series('k-done', 12, 1, Math.max(1, doneWeek), 0.16) }
        ];
        kRow.innerHTML = '';
        kpis.forEach(k => {
          kRow.appendChild(H.el(`
            <div class="card kpi projects-kpi">
              <div class="kpi-label">${k.label}</div>
              <div class="kpi-value" data-count="${k.count}" data-fmt="${k.fmt}">0</div>
              <div class="row between mt-sm">
                <span class="kpi-trend ${k.dir}">${k.trend}</span>
                <span class="kpi-sub">${k.sub}</span>
              </div>
              <div class="spark">${H.charts.spark(k.spark)}</div>
            </div>
          `));
        });
        // re-run count-ups on the freshly-built KPI tiles
        if (H.count) kRow.querySelectorAll('[data-count]').forEach(H.count);
      }

      /* ── 5. PROJECTS LIST + MY TASKS (kept) ────────────────────────────── */
      const midRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      const projList = H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">📁</span> Projects</h3>
            <span class="ch-meta">7 ACTIVE · 2 AT RISK</span>
          </div>
          <div class="projects-plist"></div>
        </div>
      `);
      const plist = projList.querySelector('.projects-plist');
      const PROJECTS = [
        { name: 'Helm Command Deck', client: 'Internal', pct: 78, team: ['u-noah', 'u-mira', 'u-arvid'], due: 'Jul 04', state: 'ok' },
        { name: 'Northwind AB — Portal', client: 'Northwind AB', pct: 54, team: ['u-sofia', 'u-isa'], due: 'Jul 18', state: 'ok' },
        { name: 'Lykke Studios Rebrand', client: 'Lykke Studios', pct: 31, team: ['u-kai', 'u-mira'], due: 'Aug 01', state: 'warn' },
        { name: 'Forsberg Konsult CRM', client: 'Forsberg Konsult', pct: 12, team: ['u-sofia', 'u-noah'], due: 'Aug 22', state: 'warn' },
        { name: 'PostNord Tracking Sync', client: 'Ops', pct: 92, team: ['u-lena', 'u-noah'], due: 'Jun 20', state: 'ok' }
      ];
      PROJECTS.forEach(p => {
        const cls = p.state === 'warn' ? 'warn' : '';
        const stack = p.team.map(t => av(t)).join('');
        plist.appendChild(H.el(`
          <div class="projects-prow">
            <div class="projects-prow-main">
              <div class="row between">
                <div class="pr-name">${esc(p.name)} ${p.state === 'warn' ? '<span class="tag warn" style="margin-left:4px">AT RISK</span>' : ''}</div>
                <span class="pr-pct mono">${p.pct}%</span>
              </div>
              <div class="pr-client muted">${esc(p.client)} · due ${esc(p.due)}</div>
              <div class="progress mt-sm"><div class="bar ${cls}" style="width:0" data-fill="${p.pct}"></div></div>
            </div>
            <div class="avatar-stack projects-stack">${stack}</div>
          </div>
        `));
      });
      midRow.appendChild(projList);

      // My tasks — the SAME pool, scoped to the acting person (mirrors My Day)
      const myTaskCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">✅</span> My Tasks</h3>
            <span class="badge" data-my-count>0</span>
          </div>
          <div class="projects-mytasks"></div>
          <button class="btn btn-ghost btn-sm btn-block mt-sm" data-act="filter-mine">Filter board to my tasks →</button>
        </div>
      `);
      const mt = myTaskCard.querySelector('.projects-mytasks');
      function renderMyTasks() {
        mt.innerHTML = '';
        const mine = TASKS.filter(t => t.who === me.id);
        const badge = myTaskCard.querySelector('[data-my-count]');
        if (badge) badge.textContent = String(mine.length);
        if (!mine.length) {
          mt.appendChild(H.el(`<div class="projects-board-empty" style="padding:18px">No tasks assigned to you right now.</div>`));
          return;
        }
        mine.forEach(task => {
          const isDone = task.col === 'done';
          const node = H.el(`
            <div class="check ${isDone ? 'done' : ''} projects-check" data-task="${esc(task.id)}">
              <div class="box">✓</div>
              <div class="ck-body">
                <div class="ck-title">${esc(task.t)}</div>
                <div class="ck-sub">${esc(task.project)} · ${esc(COLS[COL_INDEX[task.col]].title)}</div>
              </div>
              <span class="tag ${isDone ? 'ok' : (task.blocked ? 'bad' : '')}">${isDone ? 'DONE' : (task.blocked ? 'BLOCKED' : esc(task.due))}</span>
            </div>
          `);
          node.addEventListener('click', () => {
            // toggling here advances to/from Done so the board stays the source of truth
            if (!canWrite) { H.toast('Needs member role to update tasks', 'warn'); return; }
            const t = TASKS.find(x => x.id === task.id);
            if (!t) return;
            const before = COLS[COL_INDEX[t.col]];
            t.col = (t.col === 'done') ? 'doing' : 'done';
            if (t.col === 'done') t.blocked = false;
            const after = COLS[COL_INDEX[t.col]];
            H.audit.log({
              action: 'task.moved',
              entityType: 'Task',
              entityId: t.id,
              summary: `${me.name} moved "${t.t}" from ${before.title} to ${after.title}`,
              before: { status: before.id }, after: { status: after.id },
              links: [{ entityType: 'Person', entityId: t.who }],
              module: 'projects'
            });
            H.toast(t.col === 'done' ? 'Task completed — nice' : 'Task reopened', t.col === 'done' ? 'success' : 'info');
            renderMyTasks();
            renderBoard();
            renderKpis();
          });
          mt.appendChild(node);
        });
      }
      myTaskCard.querySelector('[data-act="filter-mine"]').addEventListener('click', () => {
        STATE.filter = 'mine';
        buildFilters();
        renderBoard();
        boardCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        H.toast('Showing your tasks', 'info');
      });
      midRow.appendChild(myTaskCard);
      root.appendChild(midRow);

      /* ── 6. TEAM WORKLOAD BARS (recomputed from the live board) ────────── */
      const wlRow = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);
      const CAP = 6; // open tasks per person before "at capacity" in this seed
      const loadColor = v => v > CAP ? 'var(--danger)' : v >= CAP - 1 ? 'var(--warn)' : 'var(--accent1)';
      const workload = team.map(p => {
        const v = TASKS.filter(t => t.who === p.id && t.col !== 'done').length;
        return { label: firstNameOf(p.name).toUpperCase(), value: v, color: loadColor(v) };
      });
      wlRow.appendChild(H.el(`
        <div class="card span-2">
          <div class="card-head">
            <h3><span class="hico">⚖️</span> Team Workload</h3>
            <span class="ch-meta">OPEN TASKS · CAP ${CAP}</span>
          </div>
          <div class="chart" style="height:200px">
            ${H.charts.bars(workload, { height: 200 })}
          </div>
          <div class="row between mt-sm">
            <span class="pill ok">● HEALTHY</span>
            <span class="pill warn">● AT/OVER CAPACITY</span>
          </div>
        </div>
      `));

      const cap = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">🚨</span> Capacity</h3>
            <span class="badge warn" data-cap-count>0</span>
          </div>
          <div class="col" style="gap:10px"></div>
        </div>
      `);
      const capWrap = cap.querySelector('.col');
      // derive callouts from the live workload (over / near / has-room)
      const over = workload.filter(w => w.value > CAP).map(w => ({ sev: 'bad', ico: '🔥', title: w.label.charAt(0) + w.label.slice(1).toLowerCase() + ' over capacity', sub: w.value + ' open · cap ' + CAP }));
      const near = workload.filter(w => w.value === CAP).map(w => ({ sev: 'warn', ico: '📈', title: w.label.charAt(0) + w.label.slice(1).toLowerCase() + ' at cap', sub: w.value + ' open' }));
      const room = workload.filter(w => w.value <= 1).slice(0, 1).map(w => ({ sev: 'info', ico: '🫶', title: w.label.charAt(0) + w.label.slice(1).toLowerCase() + ' has room', sub: w.value + ' open · can take more' }));
      const callouts = over.concat(near, room).slice(0, 3);
      const finalCallouts = callouts.length ? callouts : [{ sev: 'info', ico: '✅', title: 'Workload balanced', sub: 'No one over capacity' }];
      const capBadge = cap.querySelector('[data-cap-count]');
      if (capBadge) capBadge.textContent = String(over.length + near.length);
      finalCallouts.forEach(a => {
        const node = H.el(`
          <div class="attn ${a.sev}">
            <span class="a-ico">${a.ico}</span>
            <div class="a-body"><div class="a-title">${esc(a.title)}</div><div class="a-sub">${esc(a.sub)}</div></div>
            <button class="btn btn-sm" data-act="rebalance">Balance</button>
          </div>
        `);
        node.querySelector('button').addEventListener('click', () => H.toast('Opening workload rebalancer…', 'info'));
        capWrap.appendChild(node);
      });
      wlRow.appendChild(cap);
      root.appendChild(wlRow);

      /* ── keep the two STATIC write-gated buttons (view-head "New task" +
         board-head "Task") in step with the acting user's role. The board's
         move arrows / add-card buttons are rebuilt by renderBoard() and pick
         up `canWrite` there, so this only handles the persistent header buttons. */
      function syncWriteGate() {
        const gated = [root.querySelector('[data-act="newtask"]'), boardCard.querySelector('[data-act="newtask2"]')];
        gated.forEach(b => {
          if (!b) return;
          b.disabled = !canWrite;
          if (canWrite) b.removeAttribute('title');
          else b.setAttribute('title', 'Needs member role');
        });
      }

      /* ── INITIAL PAINT ─────────────────────────────────────────────────── */
      buildFilters();
      renderBoard();
      renderKpis();
      renderMyTasks();
      syncWriteGate();

      // animate progress bars after mount
      root.querySelectorAll('.bar[data-fill]').forEach(bar => {
        const pct = bar.getAttribute('data-fill');
        setTimeout(() => { bar.style.width = pct + '%'; }, 260);
      });

      /* ── re-render the board when the acting user switches ──────────────
         This module is company-scope (the shell won't re-render it), but the
         "My tasks" chip + My Tasks card reference the live user, so resync.
         Drop any prior subscription so re-renders don't stack stale handlers. */
      if (H.session.on) {
        if (typeof _unsubUser === 'function') { try { _unsubUser(); } catch (e) {} }
        _unsubUser = H.session.on('helm:user', () => {
          // bail if this render's DOM has been replaced/detached
          if (!document.body.contains(boardCard)) return;
          const nu = H.session.user;
          if (nu) { me.id = nu.id; me.name = nu.name; }
          canWrite = H.session.can('projects.write'); // role may differ for the new user
          buildFilters();
          renderBoard();
          renderMyTasks();
          syncWriteGate();
        });
      }

      /* ── WIRE HEADER ACTIONS (no global keys; shell owns ⌘K) ───────────── */
      const wire = (sel, fn) => { const b = root.querySelector(sel); if (b) b.addEventListener('click', fn); };
      wire('[data-act="cmdk"]', () => H.openCmdk && H.openCmdk());
      wire('[data-act="sprint"]', () => H.toast('Compiling Sprint 14 review…', 'info'));
      wire('[data-act="newtask"]', () => openNewTask('backlog'));
      wire('[data-act="newtask2"]', () => openNewTask('backlog'));

      // count-ups auto-run by the shell after render(); KPI tiles re-run on rebuild.
    }
  });
})();
