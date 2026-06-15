/* ============================================================================
   devlog.js — Dev Log.
   Every code change across all the company's platforms, auto-logged after each
   push. A live commit feed (newest first) with deploy markers interleaved,
   per-repo summaries, a deployment-frequency chart, and repo/platform/author
   filters. Read-only; clicking a deploy toasts its details.
   Follows the HELM module contract (see command.js): register → render(root),
   build with H.el + documented classes + H.charts, wire buttons to H.toast/H.show.
   Only adds namespaced .devlog-* tweaks in devlog.css (tokens only).
   ========================================================================== */
(function () {
  const H = window.HELM;

  /* ── platform registry (glyph + accent class) ───────────────────────────── */
  const PLATFORMS = {
    github:   { label: 'GitHub',   glyph: '🐙' },
    gitlab:   { label: 'GitLab',   glyph: '🦊' },
    vercel:   { label: 'Vercel',   glyph: '▲' },
    supabase: { label: 'Supabase', glyph: '⚡' }
  };

  /* ── repo registry — seeded, realistic Northwind Labs platforms ──────────── */
  const REPOS = [
    { id: 'helm-web',   name: 'helm-web',   lang: 'TypeScript', langDot: '#3178c6', platform: 'vercel',   branch: 'main',    desc: 'Operator console (this app)' },
    { id: 'helm-api',   name: 'helm-api',   lang: 'Go',         langDot: '#00add8', platform: 'github',   branch: 'main',    desc: 'Core services & GraphQL gateway' },
    { id: 'storefront', name: 'storefront', lang: 'TypeScript', langDot: '#3178c6', platform: 'vercel',   branch: 'main',    desc: 'Customer-facing shop (Next.js)' },
    { id: 'infra',      name: 'infra',      lang: 'HCL',        langDot: '#7c6cff', platform: 'gitlab',   branch: 'trunk',   desc: 'Terraform + edge / Supabase' }
  ];

  H.register({
    id: 'devlog',
    label: 'Dev Log',
    icon: '📟',
    scope: 'company',
    render(root) {
      const D = H.data;
      const S = H.session;
      const team = S.team || [];

      /* ── author pool: the engineering-facing slice of the crew ─────────────
         Noah (Lead Eng) + Mira/Kai/Lena/Arvid push to platform repos too. Each
         author gets a deterministic accent glyph from the team seed.          */
      const findP = id => team.find(p => p.id === id) || null;
      const AUTHORS = ['u-noah', 'u-mira', 'u-kai', 'u-lena', 'u-arvid', 'u-sofia']
        .map(findP).filter(Boolean)
        .map(p => ({ id: p.id, name: p.name, initials: p.avatar || D.initials(p.name), accent: p.accent || '◆' }));
      const authorById = id => AUTHORS.find(a => a.id === id) || { id, name: 'System', initials: '··', accent: '◦' };

      /* ── deterministic commit-message vocabulary ──────────────────────────── */
      const VERBS = [
        'fix', 'feat', 'refactor', 'chore', 'perf', 'test', 'docs', 'build', 'style'
      ];
      const SUBJECTS = {
        'helm-web':   ['render loop for the Dev Log feed', 'count-up animation easing', 'sub-tab focus ring on mobile', 'session switch re-render guard', 'audit export JSONL stream', 'KPI sparkline overflow', 'command palette fuzzy match', 'tape scroll jank on Safari'],
        'helm-api':   ['voucher sync race on Fortnox webhook', 'GraphQL N+1 on customer.orders', 'Stripe payout idempotency key', 'rate-limit bucket for /search', 'JWT refresh rotation', 'pagination cursor encoding', 'audit hash-chain verifier', 'invoice PDF render queue'],
        'storefront': ['cart hydration mismatch', 'checkout shipping rules SE/EU', 'PostNord tracking widget', 'product gallery lazy-load', 'Klarna express button', 'SEO meta for category pages', 'cookie-consent banner a11y', 'image CDN srcset'],
        'infra':      ['edge cache TTL for /api/search', 'Supabase RLS on audit_events', 'Terraform state lock on apply', 'autoscaling min replicas to 2', 'Vercel project env promotion', 'CDN purge on deploy hook', 'DNS failover record for api', 'backup retention to 30d']
      };

      /* ── build a deterministic commit timeline per repo ───────────────────── */
      // relative-time buckets (minutes ago), newest first, deterministic
      function relTime(mins) {
        if (mins < 1) return 'now';
        if (mins < 60) return mins + 'm';
        if (mins < 1440) return Math.floor(mins / 60) + 'h';
        return Math.floor(mins / 1440) + 'd';
      }
      function shortSha(seed) {
        // 7-char hex from the seeded int generator
        const n = D.int('dl-sha-' + seed, 0x1000000, 0xfffffff);
        return n.toString(16).slice(0, 7);
      }

      let _evtCounter = 0;
      const commits = [];
      const deploys = [];

      REPOS.forEach((repo, ri) => {
        // how many commits this repo has in the window (helm-web busiest)
        const nCommits = [14, 11, 9, 6][ri];
        let minsCursor = D.int('dl-start-' + repo.id, 6, 40); // first commit age
        for (let c = 0; c < nCommits; c++) {
          const seed = repo.id + '-' + c;
          const aIdx = D.int('dl-auth-' + seed, 0, AUTHORS.length - 1);
          const author = AUTHORS[aIdx];
          const verb = D.pick('dl-verb-' + seed, VERBS);
          const subj = D.pick('dl-subj-' + seed, SUBJECTS[repo.id]);
          const onSide = D.int('dl-side-' + seed, 0, 4) === 0; // ~1 in 5 on a feature branch
          const branch = onSide
            ? D.pick('dl-br-' + seed, ['feat/queue-v2', 'fix/sync-race', 'spike/edge-cache', 'chore/deps'])
            : repo.branch;
          const files = D.int('dl-files-' + seed, 1, 14);
          const adds = D.int('dl-add-' + seed, 4, 240);
          const dels = D.int('dl-del-' + seed, 0, 120);
          minsCursor += D.int('dl-gap-' + seed, 7, 95);
          commits.push({
            kind: 'commit',
            id: 'cm-' + (++_evtCounter),
            repo, author, verb, subject: subj,
            msg: verb + ': ' + subj,
            branch, files, adds, dels,
            platform: repo.platform,
            sha: shortSha(seed),
            mins: minsCursor
          });
        }
      });

      /* ── deploy markers — a handful, interleaved by time ──────────────────── */
      const DEPLOYS = [
        { repo: 'helm-web',   target: 'web',     env: 'production', version: 'v2.4.1', mins: 8,   status: 'ok',   author: 'u-noah',  platform: 'vercel',   dur: '1m 12s' },
        { repo: 'storefront', target: 'shop',    env: 'production', version: 'v5.9.0', mins: 34,  status: 'ok',   author: 'u-mira',  platform: 'vercel',   dur: '2m 03s' },
        { repo: 'helm-api',   target: 'api',     env: 'staging',    version: 'v3.1.7', mins: 96,  status: 'ok',   author: 'u-noah',  platform: 'github',   dur: '3m 41s' },
        { repo: 'infra',      target: 'edge',    env: 'production', version: 'v0.8.2', mins: 210, status: 'fail', author: 'u-noah',  platform: 'gitlab',   dur: '0m 48s' },
        { repo: 'helm-api',   target: 'api',     env: 'production', version: 'v3.1.6', mins: 360, status: 'ok',   author: 'u-mira',  platform: 'github',   dur: '3m 09s' }
      ];
      DEPLOYS.forEach((d, i) => {
        const repo = REPOS.find(r => r.id === d.repo);
        deploys.push({
          kind: 'deploy',
          id: 'dp-' + (i + 1),
          repo, target: d.target, env: d.env, version: d.version,
          status: d.status, author: authorById(d.author),
          platform: d.platform, dur: d.dur, mins: d.mins
        });
      });

      /* ── merged feed, newest first ────────────────────────────────────────── */
      const feed = commits.concat(deploys).sort((a, b) => a.mins - b.mins);

      /* ── KPI series for sparkline/aggregate ───────────────────────────────── */
      const commitsToday = commits.filter(c => c.mins < 1440).length + DEPLOYS.length; // pushes today
      const openPRs = 7;
      const deploysWeek = 19;
      const failedBuilds = DEPLOYS.filter(d => d.status === 'fail').length + 1;

      /* deployment-frequency: deploys/day over the last 14 days */
      const freqSeries = D.series('dl-freq', 14, 1, 6, 0.5).map(v => Math.max(0, Math.round(v)));
      const day14 = ['14d', '12d', '10d', '8d', '6d', '4d', '2d', 'today'];

      /* per-repo commit sparkline (commits/day, 14d) */
      const repoSpark = {
        'helm-web':   D.series('dl-sp-web', 14, 2, 9, 0.3),
        'helm-api':   D.series('dl-sp-api', 14, 1, 6, 0.35),
        'storefront': D.series('dl-sp-store', 14, 1, 5, 0.4),
        'infra':      D.series('dl-sp-infra', 14, 0, 3, 0.5)
      };
      const repoLastDeploy = {
        'helm-web':   { v: 'v2.4.1', mins: 8,   status: 'ok' },
        'storefront': { v: 'v5.9.0', mins: 34,  status: 'ok' },
        'helm-api':   { v: 'v3.1.7', mins: 96,  status: 'ok' },
        'infra':      { v: 'v0.8.2', mins: 210, status: 'fail' }
      };
      const repoCommitCount = {};
      REPOS.forEach(r => { repoCommitCount[r.id] = commits.filter(c => c.repo.id === r.id).length; });

      /* ── filter state ─────────────────────────────────────────────────────── */
      const state = { repo: 'all', platform: 'all', author: 'all' };

      /* exporting the dev log is an audit-export action — gate it by permission
         (audit.export → finance role). When the acting user can't export, the
         button renders disabled with an explanatory title. */
      const canExport = S.can ? S.can('audit.export') : true;

      /* ======================================================================
         VIEW HEAD
         ====================================================================== */
      root.appendChild(H.el(`
        <div class="view-head">
          <div class="vh-title">
            <div class="vh-ico">📟</div>
            <div>
              <h1>Dev Log</h1>
              <p>Every commit and deploy across all platforms — streamed the moment it ships.</p>
            </div>
          </div>
          <div class="vh-actions">
            <span class="pill ok devlog-live"><span class="devlog-live-dot"></span>LIVE FEED</span>
            <button class="btn btn-ghost btn-sm" data-act="export"${canExport ? '' : ' disabled title="Needs finance role"'}>⤓ Export log</button>
            <button class="btn btn-primary btn-sm" data-act="repos">⌥ Repositories</button>
          </div>
        </div>
      `));

      /* ======================================================================
         KPI ROW
         ====================================================================== */
      const kpiRow = H.el(`<div class="grid cols-4" style="margin-bottom:var(--gap)"></div>`);
      [
        { label: 'COMMITS · TODAY',    count: commitsToday,  fmt: 'num', trend: '+' + Math.round(commitsToday * 0.3), dir: 'up',   spark: D.series('dl-k-commits', 14, 18, commitsToday, 0.2) },
        { label: 'OPEN PRs',           count: openPRs,       fmt: 'num', trend: '+2',  dir: 'up',   spark: D.series('dl-k-prs', 14, 3, openPRs, 0.25) },
        { label: 'DEPLOYS · THIS WEEK',count: deploysWeek,   fmt: 'num', trend: '+5',  dir: 'up',   spark: D.series('dl-k-dep', 14, 8, deploysWeek, 0.18) },
        { label: 'FAILED BUILDS',      count: failedBuilds,  fmt: 'num', trend: '-1',  dir: 'down', bad: true, spark: D.series('dl-k-fail', 14, 0, failedBuilds + 2, 0.5) }
      ].forEach(v => {
        kpiRow.appendChild(H.el(`
          <div class="card kpi devlog-kpi">
            <div class="kpi-label">${v.label}</div>
            <div class="kpi-value" data-count="${v.count}" data-fmt="${v.fmt}">0</div>
            <div class="row between mt-sm">
              <span class="kpi-trend ${v.dir}">${v.trend}</span>
              <span class="faint mono devlog-kpi-tag">${v.bad ? '7D' : '7D'}</span>
            </div>
            <div class="spark">${H.charts.spark(v.spark, v.bad ? { color: 'var(--danger)' } : {})}</div>
          </div>
        `));
      });
      root.appendChild(kpiRow);

      /* ======================================================================
         MAIN GRID: feed (span 2) + side column (deploy-freq + per-repo)
         ====================================================================== */
      const main = H.el(`<div class="grid cols-3" style="margin-bottom:var(--gap)"></div>`);

      /* ── LEFT: the live feed card (span 2) ────────────────────────────────── */
      const feedCard = H.el(`
        <div class="card flush span-2 devlog-feed-card">
          <div class="card-head devlog-feed-head">
            <h3><span class="hico">📟</span> Push Stream</h3>
            <span class="ch-meta" data-role="count"></span>
          </div>
          <div class="devlog-filters" data-role="filters"></div>
          <div class="devlog-feed" data-role="feed"></div>
        </div>
      `);

      /* filter bar — three deterministic filter groups */
      const filterWrap = feedCard.querySelector('[data-role="filters"]');

      function buildFilterGroup(key, label, options) {
        const grp = H.el(`<div class="devlog-fgroup"><span class="devlog-fgroup-label">${label}</span><div class="devlog-fchips"></div></div>`);
        const chips = grp.querySelector('.devlog-fchips');
        options.forEach(opt => {
          const chip = H.el(`<button class="devlog-fchip${opt.val === state[key] ? ' active' : ''}" data-key="${key}" data-val="${opt.val}">${opt.glyph ? '<span class="devlog-fchip-g">' + opt.glyph + '</span>' : ''}${opt.label}</button>`);
          chip.addEventListener('click', () => {
            state[key] = opt.val;
            chips.querySelectorAll('.devlog-fchip').forEach(c => c.classList.toggle('active', c.dataset.val === opt.val));
            renderFeed();
          });
          chips.appendChild(chip);
        });
        return grp;
      }

      filterWrap.appendChild(buildFilterGroup('repo', 'REPO',
        [{ val: 'all', label: 'All' }].concat(REPOS.map(r => ({ val: r.id, label: r.name })))));
      filterWrap.appendChild(buildFilterGroup('platform', 'PLATFORM',
        [{ val: 'all', label: 'All' }].concat(Object.keys(PLATFORMS).map(k => ({ val: k, label: PLATFORMS[k].label, glyph: PLATFORMS[k].glyph })))));
      filterWrap.appendChild(buildFilterGroup('author', 'AUTHOR',
        [{ val: 'all', label: 'All' }].concat(AUTHORS.map(a => ({ val: a.id, label: a.name.split(' ')[0] })))));

      const feedEl = feedCard.querySelector('[data-role="feed"]');
      const countEl = feedCard.querySelector('[data-role="count"]');

      function passes(item) {
        if (state.repo !== 'all' && item.repo.id !== state.repo) return false;
        if (state.platform !== 'all' && item.platform !== state.platform) return false;
        if (state.author !== 'all' && (!item.author || item.author.id !== state.author)) return false;
        return true;
      }

      function commitRow(c) {
        const row = H.el(`
          <div class="devlog-row" data-id="${c.id}">
            <div class="devlog-av" title="${c.author.name}">${c.author.initials}</div>
            <div class="devlog-row-body">
              <div class="devlog-row-top">
                <span class="devlog-msg">${escapeHtml(c.msg)}</span>
              </div>
              <div class="devlog-row-meta">
                <span class="tag devlog-repo-tag">${c.repo.name}</span>
                <span class="devlog-branch">⎇ ${c.branch}</span>
                <span class="devlog-sha mono">${c.sha}</span>
                <span class="devlog-files">${c.files} file${c.files === 1 ? '' : 's'}</span>
                <span class="devlog-diff"><span class="devlog-add">+${c.adds}</span> <span class="devlog-del">−${c.dels}</span></span>
              </div>
            </div>
            <div class="devlog-row-right">
              <span class="devlog-plat" title="${PLATFORMS[c.platform].label}">${PLATFORMS[c.platform].glyph}</span>
              <span class="devlog-time mono">${relTime(c.mins)}</span>
            </div>
          </div>
        `);
        return row;
      }

      function deployRow(d) {
        const cls = d.status === 'fail' ? 'fail' : 'ok';
        const glyph = d.status === 'fail' ? '⚠️' : '🚀';
        const verb = d.status === 'fail' ? 'Deploy FAILED' : 'Deployed';
        const row = H.el(`
          <div class="devlog-row devlog-deploy ${cls}" data-id="${d.id}" tabindex="0" role="button">
            <div class="devlog-deploy-ico">${glyph}</div>
            <div class="devlog-row-body">
              <div class="devlog-row-top">
                <span class="devlog-deploy-msg">${verb} <b>${d.repo.name}</b> → <b>${d.env}</b> <span class="devlog-ver mono">${d.version}</span></span>
              </div>
              <div class="devlog-row-meta">
                <span class="devlog-deploy-sub">${d.author.name} · ${d.dur} · ${PLATFORMS[d.platform].label}</span>
              </div>
            </div>
            <div class="devlog-row-right">
              <span class="pill ${d.status === 'fail' ? 'bad' : 'ok'} devlog-deploy-pill">${d.status === 'fail' ? 'FAILED' : 'LIVE'}</span>
              <span class="devlog-time mono">${relTime(d.mins)}</span>
            </div>
          </div>
        `);
        row.addEventListener('click', () => toastDeploy(d));
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toastDeploy(d); } });
        return row;
      }

      function toastDeploy(d) {
        const ok = d.status !== 'fail';
        H.toast(
          `${ok ? '🚀' : '⚠️'} ${d.repo.name} ${d.version} → ${d.env} · ${d.author.name} · ${d.dur}${ok ? '' : ' · build failed'}`,
          ok ? 'success' : 'danger'
        );
      }

      function renderFeed() {
        feedEl.innerHTML = '';
        const shown = feed.filter(passes);
        let nCommits = 0, nDeploys = 0;
        if (!shown.length) {
          feedEl.appendChild(H.el(`<div class="devlog-empty">No pushes match these filters.<br><span class="faint">Loosen a filter to see the stream.</span></div>`));
        } else {
          shown.forEach(item => {
            if (item.kind === 'deploy') { feedEl.appendChild(deployRow(item)); nDeploys++; }
            else { feedEl.appendChild(commitRow(item)); nCommits++; }
          });
        }
        countEl.textContent = `${nCommits} COMMITS · ${nDeploys} DEPLOYS`;
      }
      renderFeed();
      main.appendChild(feedCard);

      /* ── RIGHT COLUMN: deployment frequency + per-repo summary ────────────── */
      const sideCol = H.el(`<div class="col" style="gap:var(--gap)"></div>`);

      // deployment frequency chart
      sideCol.appendChild(H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">📈</span> Deploy Frequency</h3>
            <span class="ch-meta">14 DAYS</span>
          </div>
          <div class="chart" style="height:150px">
            ${(() => {
              // place the 8 axis labels on evenly-spaced bars across the 14, so
              // the freshest bucket (last bar) reads "today" and none are dropped
              const labelAt = {};
              day14.forEach((lb, k) => {
                const idx = Math.round(k * (freqSeries.length - 1) / (day14.length - 1));
                labelAt[idx] = lb;
              });
              return H.charts.bars(
                freqSeries.map((v, i) => ({ label: labelAt[i] || '', value: v })),
                { height: 150 }
              );
            })()}
          </div>
          <div class="row between mt-sm">
            <span class="faint mono devlog-freq-foot">PEAK ${Math.max.apply(null, freqSeries)}/DAY</span>
            <span class="faint mono devlog-freq-foot">AVG ${(freqSeries.reduce((a, b) => a + b, 0) / freqSeries.length).toFixed(1)}/DAY</span>
          </div>
        </div>
      `));

      // per-repo summary panel
      const repoCard = H.el(`
        <div class="card flush">
          <div class="card-head devlog-feed-head">
            <h3><span class="hico">🗂️</span> Repositories</h3>
            <span class="ch-meta">${REPOS.length} ACTIVE</span>
          </div>
          <div class="devlog-repos"></div>
        </div>
      `);
      const reposEl = repoCard.querySelector('.devlog-repos');
      REPOS.forEach(r => {
        const ld = repoLastDeploy[r.id];
        const depCls = ld.status === 'fail' ? 'bad' : 'ok';
        const item = H.el(`
          <button class="devlog-repo-item" data-repo="${r.id}">
            <div class="devlog-repo-top">
              <span class="devlog-lang-dot" style="background:${r.langDot}"></span>
              <span class="devlog-repo-name">${r.name}</span>
              <span class="devlog-plat devlog-repo-plat" title="${PLATFORMS[r.platform].label}">${PLATFORMS[r.platform].glyph}</span>
            </div>
            <div class="devlog-repo-sub">
              <span class="devlog-lang">${r.lang}</span>
              <span class="devlog-repo-commits">${repoCommitCount[r.id]} commits</span>
            </div>
            <div class="spark devlog-repo-spark">${H.charts.spark(repoSpark[r.id], { height: 26 })}</div>
            <div class="devlog-repo-deploy">
              <span class="faint mono">LAST DEPLOY</span>
              <span class="pill ${depCls} devlog-repo-deploy-pill">${ld.v} · ${relTime(ld.mins)}</span>
            </div>
          </button>
        `);
        item.addEventListener('click', () => {
          // clicking a repo filters the feed to it + scrolls feed into view
          state.repo = r.id;
          filterWrap.querySelectorAll('.devlog-fchip[data-key="repo"]').forEach(c =>
            c.classList.toggle('active', c.dataset.val === r.id));
          renderFeed();
          H.toast(`Filtering stream → ${r.name} (${r.lang})`, 'info');
          feedCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        reposEl.appendChild(item);
      });
      sideCol.appendChild(repoCard);
      main.appendChild(sideCol);
      root.appendChild(main);

      /* ======================================================================
         CONTRIBUTORS STRIP — authors + their push counts (read-only)
         ====================================================================== */
      const contribCard = H.el(`
        <div class="card">
          <div class="card-head">
            <h3><span class="hico">👥</span> Contributors</h3>
            <span class="ch-meta">THIS WEEK</span>
          </div>
          <div class="devlog-contribs"></div>
        </div>
      `);
      const contribEl = contribCard.querySelector('.devlog-contribs');
      const maxByAuthor = {};
      AUTHORS.forEach(a => { maxByAuthor[a.id] = commits.filter(c => c.author.id === a.id).length; });
      const maxPush = Math.max(1, ...Object.values(maxByAuthor));
      AUTHORS.slice().sort((a, b) => maxByAuthor[b.id] - maxByAuthor[a.id]).forEach(a => {
        const n = maxByAuthor[a.id];
        const pct = Math.round((n / maxPush) * 100);
        const chip = H.el(`
          <button class="devlog-contrib" data-author="${a.id}">
            <div class="devlog-av sm">${a.initials}</div>
            <div class="devlog-contrib-body">
              <div class="row between">
                <span class="devlog-contrib-name">${a.name}</span>
                <span class="devlog-contrib-n mono">${n}</span>
              </div>
              <div class="progress devlog-contrib-bar"><div class="bar" style="width:0" data-w="${pct}"></div></div>
            </div>
          </button>
        `);
        chip.addEventListener('click', () => {
          state.author = a.id;
          filterWrap.querySelectorAll('.devlog-fchip[data-key="author"]').forEach(c =>
            c.classList.toggle('active', c.dataset.val === a.id));
          renderFeed();
          H.toast(`Filtering stream → ${a.name.split(' ')[0]}'s pushes`, 'info');
          feedCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        contribEl.appendChild(chip);
        setTimeout(() => { const bar = chip.querySelector('.bar'); bar.style.width = bar.dataset.w + '%'; }, 250);
      });
      root.appendChild(contribCard);

      /* ======================================================================
         WIRE HEADER ACTIONS
         ====================================================================== */
      root.querySelector('[data-act="export"]').addEventListener('click', () => {
        // gated: exporting the log is an audit-export action (finance+)
        if (!canExport) { H.toast('Exporting the dev log needs the finance role.', 'warn'); return; }
        H.toast(`Exported ${commits.length} commits + ${DEPLOYS.length} deploys to dev-log.jsonl`, 'success');
        H.audit.log({
          action: 'devlog.exported',
          entityType: 'DevLog',
          entityId: 'devlog-feed',
          summary: `${(S.user && S.user.name) || 'Someone'} exported the dev log (${commits.length} commits, ${DEPLOYS.length} deploys)`,
          module: 'devlog'
        });
      });

      root.querySelector('[data-act="repos"]').addEventListener('click', () => {
        H.toast(`${REPOS.length} repositories connected · ${Object.keys(PLATFORMS).length} platforms (GitHub, GitLab, Vercel, Supabase)`, 'info');
      });

      /* count-ups run automatically by the shell after render(). */
    }
  });

  /* local escape (mirrors the shell's, kept module-private for commit msgs) */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
