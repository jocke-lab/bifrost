/* ============================================================================
   HELM — core.js  (vanilla, zero dependencies)
   The single global: window.HELM
   ----------------------------------------------------------------------------
   PUBLIC CONTRACT (modules may rely on exactly this):

   HELM.register({id, label, icon, render})
       Register one module. id=kebab-case, icon=single emoji,
       render(root) builds DOM into the module's <section> element.
       render() is called LAZILY the first time the view is shown,
       and AT MOST ONCE per module (idempotent).

   HELM.el(htmlString)            -> DOM node from an HTML string
   HELM.count(el)                 -> animate a [data-count] element 0 -> target
   HELM.toast(msg, type)          -> type ∈ 'success'|'warn'|'danger'|'info'
   HELM.fmt.money(n)/.num(n)/.pct(n)   tabular-safe formatters
   HELM.charts.area/bars/donut/gauge/spark  -> inline SVG strings (viewBox)
   HELM.data                      -> seeded deterministic mock-data helpers
   HELM.boot()                    -> splash, wiring, first render

   Modules MUST NOT inject fonts/colors/chart libs or touch other modules.
   The Tape and ⌘K palette are owned by the shell, not modules.
   ========================================================================== */
(function () {
  'use strict';

  /* ── TWO-LEVEL NAVIGATION CONFIG ────────────────────────────────────────
     Sections are the PRIMARY (left sidebar) nav, grouped by zone.
     Each section's `children` are module ids shown in the SECONDARY sub-tab
     bar. Section ids live in their OWN namespace (separate from module ids),
     so a section may share a name with a module (e.g. 'customers'). Two maps
     are kept: byId (modules) and sectionById (sections). ─────────────────── */
  const SECTIONS = [
    { id: 'home',     label: 'Dashboard',   icon: '🛰️', zone: 'HOME',         children: ['command'] },
    { id: 'vitals',   label: 'Vitals',      icon: '❤️', zone: 'HOME',         children: ['vitals'] },
    { id: 'nftsite',  label: 'NFT Site',    icon: '🪙', zone: 'NFT PLATFORM', children: ['nft-site'] },
    { id: 'connect',  label: 'Connections', icon: '🔌', zone: 'TOOLS',        children: ['connect'] },
    { id: 'tools',    label: 'Tools',       icon: '🛠️', zone: 'TOOLS',        children: ['sign', 'settings'] }
  ];
  // zones rendered in this order, with the human label shown above each group
  const ZONES = ['HOME', 'NFT PLATFORM', 'TOOLS'];

  /* ── tiny DOM utils ─────────────────────────────────────────────────── */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ── seeded deterministic RNG (mulberry32) ──────────────────────────── */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // hash a string -> int seed, so HELM.data.seed('revenue') is stable
  function strSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* deterministic mock-data toolkit (NO Math.random, NO Date in module eval) */
  const data = {
    seed(name) { return rng(strSeed('HELM::' + name)); },
    // n points trending from `from` to `to` with `vol` jitter, deterministic
    series(name, n, from, to, vol) {
      const r = this.seed(name); const out = []; vol = vol == null ? 0.12 : vol;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 1 : i / (n - 1);
        const base = from + (to - from) * t;
        const jitter = (r() - 0.5) * 2 * vol * Math.max(Math.abs(base), 1);
        out.push(Math.max(0, Math.round(base + jitter)));
      }
      return out;
    },
    // pick deterministic item
    pick(name, arr) { return arr[Math.floor(this.seed(name)() * arr.length)]; },
    int(name, lo, hi) { return Math.floor(this.seed(name)() * (hi - lo + 1)) + lo; },
    months: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
    initials(name) {
      return name.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
    }
  };

  /* ── formatters (tabular-safe) ──────────────────────────────────────── */
  const fmt = {
    money(n, cur) {
      cur = cur || '$';
      const neg = n < 0; n = Math.abs(n);
      let s;
      if (n >= 1e9) s = (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
      else if (n >= 1e6) s = (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
      else if (n >= 1e4) s = (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
      else s = Math.round(n).toLocaleString('en-US');
      return (neg ? '-' : '') + cur + s;
    },
    num(n) {
      if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
      if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
      return Math.round(n).toLocaleString('en-US');
    },
    pct(n, dp) { return (n > 0 ? '+' : '') + n.toFixed(dp == null ? 1 : dp) + '%'; }
  };

  /* ── count-up animation ─────────────────────────────────────────────── */
  function count(node) {
    if (!node) return;
    const target = parseFloat(node.getAttribute('data-count'));
    if (isNaN(target)) return;
    if (node.__counted) return; node.__counted = true;
    const prefix = node.getAttribute('data-prefix') || '';
    const suffix = node.getAttribute('data-suffix') || '';
    const dp = parseInt(node.getAttribute('data-dp') || '0', 10);
    const mode = node.getAttribute('data-fmt'); // 'money' | 'num' | null
    const dur = 900; const start = performance.now();
    node.classList.remove('counting');
    function frame(now) {
      let p = Math.min(1, (now - start) / dur);
      p = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const v = target * p;
      let txt;
      if (mode === 'money') txt = fmt.money(v);
      else if (mode === 'num') txt = fmt.num(v);
      else txt = v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
      node.textContent = prefix + txt + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  // auto-run count-up on any [data-count] within a root
  function countAll(root) { $$('[data-count]', root).forEach(count); }

  /* ── toasts ─────────────────────────────────────────────────────────── */
  function ensureToastWrap() {
    let w = $('.toast-wrap');
    if (!w) { w = el('<div class="toast-wrap"></div>'); document.body.appendChild(w); }
    return w;
  }
  const TOAST_ICO = { success: '✓', warn: '!', danger: '✕', info: 'i' };
  function toast(msg, type) {
    type = type || 'info';
    const w = ensureToastWrap();
    const t = el(
      `<div class="toast ${type}"><div class="t-ico">${TOAST_ICO[type] || 'i'}</div><div class="t-msg">${esc(msg)}</div></div>`);
    w.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 3200);
  }

  /* ====================================================================== */
  /* CHARTS — every helper RETURNS an inline <svg> string sized via viewBox */
  /* ====================================================================== */
  const uid = (() => { let i = 0; return () => 'h' + (++i); })();

  function defsArea(id) {
    return `<defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--accent1)" stop-opacity="0.32"/>
        <stop offset="1" stop-color="var(--accent1)" stop-opacity="0"/>
      </linearGradient></defs>`;
  }

  const charts = {
    /* area(data, opts)
       data: number[]  OR  [{label,value}]  OR  {series:[[..],[..]], labels:[..]}
       opts: { height=180, labels=[], forecastFrom=null (idx), v2=number[]|null,
               smooth=true, grid=true, fmt='num'|'money', pad } */
    area(input, opts) {
      opts = opts || {};
      const W = 600, H = opts.height || 180, pad = opts.pad || { t: 12, r: 8, b: 18, l: 8 };
      let s1 = normalize(input);
      const s2 = opts.v2 ? normalize(opts.v2) : null;
      const all = s2 ? s1.concat(s2) : s1;
      const max = Math.max(1, ...all), min = Math.min(0, ...all);
      const id = uid();
      const X = i => pad.l + (s1.length <= 1 ? 0 : i * (W - pad.l - pad.r) / (s1.length - 1));
      const Y = v => pad.t + (1 - (v - min) / (max - min || 1)) * (H - pad.t - pad.b);
      const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
      const areaPath = `${path(s1)} L${X(s1.length - 1)} ${H - pad.b} L${X(0)} ${H - pad.b} Z`;
      let grid = '';
      if (opts.grid !== false) {
        grid = '<g class="hc-grid">';
        for (let g = 0; g <= 3; g++) { const y = pad.t + g * (H - pad.t - pad.b) / 3; grid += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}"/>`; }
        grid += '</g>';
      }
      let labels = '';
      if (opts.labels && opts.labels.length) {
        labels = '<g>' + opts.labels.map((lb, i) => {
          const idx = Math.round(i * (s1.length - 1) / (opts.labels.length - 1 || 1));
          return `<text class="hc-axis" x="${X(idx).toFixed(1)}" y="${H - 4}" text-anchor="middle">${esc(lb)}</text>`;
        }).join('') + '</g>';
      }
      let fc = '';
      if (opts.forecastFrom != null) {
        const fx = X(opts.forecastFrom);
        fc = `<rect x="${fx}" y="${pad.t}" width="${W - pad.r - fx}" height="${H - pad.t - pad.b}" fill="var(--accent3)" opacity="0.05"/>
              <line x1="${fx}" y1="${pad.t}" x2="${fx}" y2="${H - pad.b}" stroke="var(--accent3)" stroke-dasharray="3 4" stroke-width="1" opacity="0.5"/>`;
      }
      const dotI = s1.length - 1;
      const v2line = s2 ? `<path class="hc-line v2 draw" d="${path(s2)}"/>` : '';
      return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        ${defsArea(id)}${grid}${fc}
        <path class="hc-area" style="fill:url(#${id})" d="${areaPath}"/>
        <path class="hc-line draw" d="${path(s1)}"/>
        ${v2line}
        <circle class="hc-dot" cx="${X(dotI)}" cy="${Y(s1[dotI])}" r="3"/>
        ${labels}
      </svg>`;
    },

    /* bars(data, opts)
       data: number[] | [{label,value,color?}] | {a:[],b:[]} (grouped via opts.b)
       opts: { height=180, labels=[], grid=true, b=number[]|null (second series),
               warnAt=null (value→amber), color } */
    bars(input, opts) {
      opts = opts || {};
      const W = 600, H = opts.height || 180, pad = { t: 12, r: 8, b: 20, l: 8 };
      const items = toItems(input);
      const second = opts.b ? normalize(opts.b) : null;
      const all = items.map(d => d.value).concat(second || []);
      const max = Math.max(1, ...all);
      const n = items.length;
      const slot = (W - pad.l - pad.r) / n;
      const grouped = !!second;
      const bw = grouped ? slot * 0.30 : slot * 0.56;
      const baseY = H - pad.b;
      let grid = '<g class="hc-grid">';
      for (let g = 0; g <= 3; g++) { const y = pad.t + g * (baseY - pad.t) / 3; grid += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}"/>`; }
      grid += '</g>';
      let bars = '';
      items.forEach((d, i) => {
        const cx = pad.l + slot * (i + 0.5);
        const h = (d.value / max) * (baseY - pad.t);
        const x1 = grouped ? cx - bw - 2 : cx - bw / 2;
        const col = d.color || (opts.warnAt != null && d.value >= opts.warnAt ? 'var(--warn)' : 'url(#hcBar)');
        bars += `<rect class="hc-bar" x="${x1.toFixed(1)}" y="${(baseY - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${col}"><title>${esc(d.label || '')}: ${d.value}</title></rect>`;
        if (grouped) {
          const h2 = (second[i] / max) * (baseY - pad.t);
          bars += `<rect class="hc-bar" x="${(cx + 2).toFixed(1)}" y="${(baseY - h2).toFixed(1)}" width="${bw.toFixed(1)}" height="${h2.toFixed(1)}" rx="3" fill="var(--accent3)" opacity="0.85"/>`;
        }
      });
      const labels = '<g>' + items.map((d, i) => d.label ?
        `<text class="hc-axis" x="${(pad.l + slot * (i + 0.5)).toFixed(1)}" y="${H - 5}" text-anchor="middle">${esc(d.label)}</text>` : '').join('') + '</g>';
      return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="hcBar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--accent1)"/><stop offset="1" stop-color="var(--accent2)" stop-opacity="0.5"/>
        </linearGradient></defs>${grid}${bars}${labels}</svg>`;
    },

    /* donut(segments, opts)
       segments: [{label, value, color?}]
       opts: { size=200, thickness=22, center:{value,label} } */
    donut(segments, opts) {
      opts = opts || {};
      const S = opts.size || 200, cx = S / 2, cy = S / 2;
      const th = opts.thickness || 22, r = (S - th) / 2 - 2;
      const C = 2 * Math.PI * r;
      const total = segments.reduce((a, s) => a + s.value, 0) || 1;
      const palette = ['var(--accent1)', 'var(--accent2)', 'var(--accent3)', 'var(--warn)', '#5ad1b0', '#9d8bff'];
      let off = 0, segs = '';
      segments.forEach((s, i) => {
        const frac = s.value / total;
        const len = frac * C;
        const col = s.color || palette[i % palette.length];
        segs += `<circle class="hc-donut-seg" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${th}"
          stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"
          transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt"><title>${esc(s.label)}: ${s.value}</title></circle>`;
        off += len;
      });
      let center = '';
      if (opts.center) {
        center = `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-family="var(--font-display)" font-size="26" font-weight="600" fill="var(--text)">${esc(opts.center.value)}</text>
          <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="hc-axis">${esc(opts.center.label || '')}</text>`;
      }
      return `<svg class="chart" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${th}" opacity="0.5"/>
        ${segs}${center}</svg>`;
    },

    /* gauge(value, opts)
       value: 0..max ; opts: { max=100, size=200, label, sub, arc=270 (deg) } */
    gauge(value, opts) {
      opts = opts || {};
      const S = opts.size || 200, max = opts.max || 100, cx = S / 2, cy = S / 2;
      const r = S / 2 - 16, arc = (opts.arc || 270) * Math.PI / 180;
      const start = -Math.PI / 2 - arc / 2;
      const frac = Math.max(0, Math.min(1, value / max));
      const full = r * arc;
      const off = full * (1 - frac);
      const id = uid();
      const big = opts.value != null ? opts.value : Math.round(value);
      // describe track arc
      const p0 = polar(cx, cy, r, start), p1 = polar(cx, cy, r, start + arc);
      const large = arc > Math.PI ? 1 : 0;
      const trackPath = `M${p0.x} ${p0.y} A${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`;
      const col = frac < 0.5 ? 'var(--danger)' : frac < 0.75 ? 'var(--warn)' : 'var(--accent1)';
      return `<svg class="chart" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="var(--accent2)"/></linearGradient></defs>
        <path d="${trackPath}" fill="none" stroke="var(--border)" stroke-width="11" stroke-linecap="round"/>
        <path d="${trackPath}" fill="none" stroke="url(#${id})" stroke-width="11" stroke-linecap="round"
          style="stroke-dasharray:${full.toFixed(1)};stroke-dashoffset:${full.toFixed(1)};animation:hcGaugeFill 1.4s var(--ease) forwards"/>
        <style>@keyframes hcGaugeFill{to{stroke-dashoffset:${off.toFixed(1)}}}</style>
        <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="var(--font-display)" font-size="40" font-weight="600" fill="var(--text)">${esc(big)}</text>
        ${opts.label ? `<text x="${cx}" y="${cy + 26}" text-anchor="middle" class="hc-axis">${esc(opts.label)}</text>` : ''}
        ${opts.sub ? `<text x="${cx}" y="${cy - 22}" text-anchor="middle" class="hc-axis">${esc(opts.sub)}</text>` : ''}
      </svg>`;
    },

    /* spark(data, opts) — tiny inline trend line
       data: number[] ; opts:{ height=34, area=true, color, v2 } */
    spark(input, opts) {
      opts = opts || {};
      const W = 120, H = opts.height || 34, pad = 3;
      const s = normalize(input);
      const max = Math.max(...s), min = Math.min(...s);
      const X = i => pad + (s.length <= 1 ? 0 : i * (W - pad * 2) / (s.length - 1));
      const Y = v => pad + (1 - (v - min) / (max - min || 1)) * (H - pad * 2);
      const line = s.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
      const id = uid();
      const areaP = opts.area === false ? '' :
        `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent1)" stop-opacity="0.28"/><stop offset="1" stop-color="var(--accent1)" stop-opacity="0"/></linearGradient></defs>
         <path class="hc-spark-area" style="fill:url(#${id})" d="${line} L${X(s.length - 1)} ${H - pad} L${X(0)} ${H - pad} Z"/>`;
      const stroke = opts.color ? ` style="stroke:${opts.color}"` : '';
      return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        ${areaP}<path class="hc-spark-line"${stroke} d="${line}"/>
        <circle r="2" cx="${X(s.length - 1).toFixed(1)}" cy="${Y(s[s.length - 1]).toFixed(1)}" fill="var(--accent1)"/></svg>`;
    }
  };

  function polar(cx, cy, r, a) { return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; }
  function normalize(input) {
    if (Array.isArray(input)) {
      if (input.length && typeof input[0] === 'object') return input.map(d => d.value);
      return input.slice();
    }
    return [];
  }
  function toItems(input) {
    if (Array.isArray(input) && input.length && typeof input[0] === 'object') return input;
    return (input || []).map((v, i) => ({ value: v, label: '' }));
  }

  /* ====================================================================== */
  /* IDENTITY & SESSION LAYER  (Section A — shell spine)                    */
  /* ---------------------------------------------------------------------- */
  /* HELM.session is a shell-owned singleton: the acting Person, the Org,   */
  /* the full team, role/permission gates, presence, and switchUser/        */
  /* setPresence. Team + org are seeded deterministically so the app opens  */
  /* cold; only { userId, presence } persist to localStorage['helm.session'].*/
  /* ====================================================================== */

  const NOW_ISO = new Date().toISOString();

  // role rank — owner(5) > admin(4) > finance(3) > member(2) > viewer(1)
  const ROLE_RANK = { owner: 5, admin: 4, finance: 3, member: 2, viewer: 1 };

  // permission → minimum role required (per-person permissions[] can override-grant)
  const PERM_MIN_ROLE = {
    'ledger.write': 'finance',
    'ledger.read': 'viewer',
    'payroll.run': 'finance',
    'crew.manage': 'admin',
    'partners.write': 'member',
    'revenue.write': 'finance',
    'billing.write': 'finance',
    'vault.sign': 'member',
    'vault.generate': 'member',
    'settings.company': 'admin',
    'projects.write': 'member',
    'deploy.run': 'admin',
    'audit.export': 'finance'
  };

  // universal metadata stamp helper (Section D)
  function meta(createdBy, source, createdAt) {
    const ts = createdAt || NOW_ISO;
    return { createdAt: ts, updatedAt: ts, createdBy: createdBy || 'system', updatedBy: createdBy || 'system', source: source || 'system' };
  }

  // ── owner record — the single real operator of this deck ────────────────
  // Body metrics persist in localStorage('helm.body') so Vitals + the Dashboard
  // share one source of truth across reloads.
  function loadBody() {
    try { const b = JSON.parse(localStorage.getItem('helm.body')); return (b && typeof b === 'object') ? b : {}; }
    catch (e) { return {}; }
  }
  function loadProfile() {
    try { const p = JSON.parse(localStorage.getItem('helm.profile')); return (p && typeof p === 'object') ? p : {}; }
    catch (e) { return {}; }
  }
  function seedTeam() {
    const b = loadBody();
    const p = loadProfile();
    const name = p.name || 'Arvid Arvidsson';
    return [{
      id: 'u-arvid', name, role: 'owner', title: p.title || 'Owner',
      accent: '🜨', email: 'arivd.arvidsson@gmail.com',
      mailIdentities: ['arivd.arvidsson@gmail.com'],
      permissions: [],
      status: 'active',
      presence: 'available',
      avatar: data.initials(name),
      body: { weightKg: b.weightKg ?? null, heightCm: b.heightCm ?? null, age: b.age ?? null, sex: b.sex ?? null },
      connections: {},
      notificationPrefs: {},
      ...meta('u-arvid', 'system')
    }];
  }

  function seedOrg() {
    return {
      id: 'org-opulence-tech',
      name: 'Opulence Tech',
      logoUrl: null,
      addresses: [{ line1: '', city: 'Norrköping', zip: '', country: 'SE' }],
      country: 'SE',
      identifiers: {},
      primaryContactId: 'u-arvid',
      fiscalCurrency: 'EUR',
      fiscalYearStart: '01-01',
      connectedServices: [],
      ...meta('u-arvid', 'system')
    };
  }

  // session state — persisted slice only
  const SESSION_KEY = 'helm.session';
  function loadSessionPersist() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveSessionPersist() {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: session.user.id, presence: session.presence })); } catch (e) {}
  }

  const _team = seedTeam();
  const _org = seedOrg();
  const _sessEvt = {};   // evt -> [fn]
  function sessOn(evt, fn) { (_sessEvt[evt] = _sessEvt[evt] || []).push(fn); return () => { _sessEvt[evt] = (_sessEvt[evt] || []).filter(f => f !== fn); }; }
  function sessEmit(evt, detail) {
    (_sessEvt[evt] || []).forEach(fn => { try { fn(detail); } catch (e) { console.error('[HELM.session] handler', evt, e); } });
    try { document.dispatchEvent(new CustomEvent(evt, { detail })); } catch (e) {}
  }

  const session = {
    org: _org,
    team: _team,
    user: null,         // set below
    presence: 'available',
    is(role) {
      const have = ROLE_RANK[(this.user && this.user.role) || 'viewer'] || 0;
      const need = ROLE_RANK[role] || 0;
      return have >= need;
    },
    can(perm) {
      if (!perm) return true;
      const u = this.user;
      if (u && Array.isArray(u.permissions) && u.permissions.includes(perm)) return true; // explicit grant
      const min = PERM_MIN_ROLE[perm];
      if (!min) return this.is('admin');   // unknown perm → admin-gated by default
      return this.is(min);
    },
    switchUser(id) {
      const next = _team.find(p => p.id === id);
      if (!next || next === this.user) return this.user;
      const prev = this.user;
      this.user = next;
      this.presence = next.presence || 'available';
      saveSessionPersist();
      sessEmit('helm:user', { userId: next.id, user: next, prev: prev && prev.id });
      return next;
    },
    setPresence(state) {
      const ok = ['available', 'focus', 'meeting', 'away'];
      if (!ok.includes(state)) return this.presence;
      this.presence = state;
      if (this.user) this.user.presence = state;
      saveSessionPersist();
      sessEmit('helm:presence', { userId: this.user && this.user.id, presence: state });
      return state;
    },
    on: sessOn
  };

  // boot the session from persistence (default = u-arvid)
  (function initSession() {
    const persisted = loadSessionPersist();
    const startId = (persisted.userId && _team.some(p => p.id === persisted.userId)) ? persisted.userId : 'u-arvid';
    session.user = _team.find(p => p.id === startId) || _team[0];
    if (persisted.presence && ['available', 'focus', 'meeting', 'away'].includes(persisted.presence)) {
      session.presence = persisted.presence;
      session.user.presence = persisted.presence;
    } else {
      session.presence = session.user.presence || 'available';
    }
  })();

  const PRESENCE_META = {
    available: { label: 'Available', dot: 'available', ico: '●' },
    focus:     { label: 'Focus',     dot: 'focus',     ico: '◐' },
    meeting:   { label: 'In a meeting', dot: 'meeting', ico: '◆' },
    away:      { label: 'Away',       dot: 'away',      ico: '○' }
  };

  /* ====================================================================== */
  /* AUDIT — append-only, hash-chained event log (Section D keystone)       */
  /* ---------------------------------------------------------------------- */
  /* HELM.audit.log({action,entityType,entityId,summary,...}) stamps        */
  /* id/ts/actor/context + chained hash, appends to helm.audit, prepends to */
  /* the Flight Log, and notifies subscribers. list()/exportJSONL() read it.*/
  /* ====================================================================== */
  const AUDIT_KEY = 'helm.audit';

  // tiny stable string hash → hex (djb2-ish), used for the tamper-evident chain
  function hash32(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) + h + str.charCodeAt(i)) | 0; }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  let _audit = [];
  const _auditSubs = [];
  let _auditCounter = 0;

  function auditHashSelf(evt, hashPrev) {
    const payload = [hashPrev, evt.ts, evt.actorId, evt.action, evt.entityType, evt.entityId, evt.summary,
      evt.amount ? (evt.amount.value + evt.amount.currency) : '', JSON.stringify(evt.after || null)].join('|');
    return hash32(payload);
  }

  function auditCommit(evt) {
    const prev = _audit.length ? _audit[_audit.length - 1] : null;
    evt.hashPrev = prev ? prev.hashSelf : '00000000';
    evt.hashSelf = auditHashSelf(evt, evt.hashPrev);
    _audit.push(evt);
    return evt;
  }

  function persistAudit() {
    try { localStorage.setItem(AUDIT_KEY, JSON.stringify(_audit)); } catch (e) {}
  }

  function newAuditId() { return 'ae-' + Date.now().toString(36) + '-' + (++_auditCounter).toString(36); }

  const audit = {
    log(input) {
      input = input || {};
      const actor = session.user || { id: 'system', role: 'system' };
      const evt = {
        id: input.id || newAuditId(),
        ts: input.ts || new Date().toISOString(),
        actorId: input.actorId || actor.id,
        actorRole: input.actorRole || actor.role,
        action: input.action || 'event',
        entityType: input.entityType || 'Unknown',
        entityId: input.entityId || '',
        summary: input.summary || '',
        before: input.before || null,
        after: input.after || null,
        amount: input.amount || null,
        links: input.links || [],
        context: Object.assign({ module: input.module || (current || null), source: input.source || 'manual', sessionId: SESSION_ID }, input.context || {})
      };
      auditCommit(evt);
      persistAudit();
      // live views: prepend to Flight Log + notify subscribers
      prependFlightLog(evt);
      _auditSubs.forEach(fn => { try { fn(evt); } catch (e) { console.error('[HELM.audit] sub', e); } });
      return evt;
    },
    list(filter) {
      let out = _audit.slice().reverse(); // newest first
      if (filter) {
        if (filter.actorId) out = out.filter(e => e.actorId === filter.actorId);
        if (filter.action) out = out.filter(e => e.action === filter.action);
        if (filter.entityType) out = out.filter(e => e.entityType === filter.entityType);
        if (filter.entityId) out = out.filter(e => e.entityId === filter.entityId);
        if (filter.module) out = out.filter(e => e.context && e.context.module === filter.module);
        if (Array.isArray(filter.actions)) out = out.filter(e => filter.actions.includes(e.action));
        if (typeof filter.limit === 'number') out = out.slice(0, filter.limit);
      }
      return out;
    },
    exportJSONL() {
      // chronological newline-delimited JSON — the single artifact an LLM reads
      return _audit.map(e => JSON.stringify(e)).join('\n');
    },
    on(fn) { _auditSubs.push(fn); return () => { const i = _auditSubs.indexOf(fn); if (i >= 0) _auditSubs.splice(i, 1); }; }
  };

  const SESSION_ID = 's-' + Math.random().toString(36).slice(2, 9);

  // ── seed ~12 deterministic past events (chronological, oldest first) ────
  function seedAudit() {
    _audit = [];
    const day = (n, h, m) => `2026-06-${String(n).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
    const SEED = [
      { ts: day(8, 9, 12),  actorId: 'u-ola',   action: 'payment.created',  entityType: 'Payment',  entityId: 'pay-2287', summary: 'Ola Forsberg recorded a 14,500 kr payment from Lykke Studios', amount: { value: 14500, currency: 'SEK' }, links: [{ entityType: 'Customer', entityId: 'cu-lykke' }], context: { module: 'ledger', source: 'stripe' }, after: { amount: 14500, direction: 'in' } },
      { ts: day(9, 10, 4),  actorId: 'u-arvid', action: 'partner.created',  entityType: 'Partner',  entityId: 'pt-postnord', summary: 'Arvid Arvidsson added PostNord as a vendor partner', links: [{ entityType: 'Partner', entityId: 'pt-postnord' }], context: { module: 'partners', source: 'manual' }, after: { kind: 'vendor' } },
      { ts: day(9, 14, 33), actorId: 'u-ola',   action: 'cost.added',       entityType: 'Cost',     entityId: 'co-1180', summary: 'Ola Forsberg booked a 4,200 kr fixed cost to Northwind Hosting AB', amount: { value: 4200, currency: 'SEK' }, links: [{ entityType: 'Partner', entityId: 'pt-hosting' }], context: { module: 'ledger', source: 'fortnox' }, after: { costType: 'fixed' } },
      { ts: day(10, 8, 47), actorId: 'u-arvid', action: 'role.changed',     entityType: 'Person',   entityId: 'u-ola', summary: 'Arvid Arvidsson promoted Ola Forsberg to Finance role', before: { role: 'member' }, after: { role: 'finance' }, links: [{ entityType: 'Person', entityId: 'u-ola' }], context: { module: 'crew', source: 'manual' } },
      { ts: day(10, 11, 20),actorId: 'u-noah',  action: 'deploy.succeeded', entityType: 'Deploy',   entityId: 'dp-441', summary: 'Noah Ek shipped helm-web v1.8.2 to production', links: [{ entityType: 'Deploy', entityId: 'dp-441' }], context: { module: 'infra', source: 'github' }, after: { env: 'production', version: 'v1.8.2' } },
      { ts: day(11, 9, 5),  actorId: 'u-sofia', action: 'deal.won',         entityType: 'Deal',     entityId: 'de-302', summary: 'Sofia Berg closed the Forsberg Konsult deal — 96,000 kr', amount: { value: 96000, currency: 'SEK' }, links: [{ entityType: 'Customer', entityId: 'cu-forsberg' }], context: { module: 'pipeline', source: 'manual' }, after: { stage: 'won' } },
      { ts: day(11, 13, 41),actorId: 'u-mira',  action: 'doc.signed',       entityType: 'Document', entityId: 'doc-77', summary: 'Mira Lindqvist countersigned the Lykke Studios MSA', links: [{ entityType: 'Document', entityId: 'doc-77' }, { entityType: 'Customer', entityId: 'cu-lykke' }], context: { module: 'vault', source: 'manual' }, after: { signing: 'signed' } },
      { ts: day(12, 9, 30), actorId: 'u-lena',  action: 'task.moved',       entityType: 'Task',     entityId: 'tk-512', summary: 'Lena Holm moved “Reorder AX-12 stock” to Doing', before: { status: 'todo' }, after: { status: 'doing' }, links: [{ entityType: 'Task', entityId: 'tk-512' }], context: { module: 'projects', source: 'manual' } },
      { ts: day(12, 12, 0), actorId: 'u-ola',   action: 'invoice.paid',     entityType: 'Invoice',  entityId: 'inv-2294', summary: 'Ola Forsberg marked invoice #2294 paid — 4,200 kr from Northwind AB', amount: { value: 4200, currency: 'SEK' }, links: [{ entityType: 'Invoice', entityId: 'inv-2294' }], context: { module: 'billing', source: 'stripe' }, after: { status: 'paid' } },
      { ts: day(13, 10, 15),actorId: 'u-kai',   action: 'campaign.launched',entityType: 'Campaign', entityId: 'cmp-19', summary: 'Kai Nyström launched the “Midsummer” ad campaign across 3 channels', links: [{ entityType: 'Campaign', entityId: 'cmp-19' }], context: { module: 'signal', source: 'manual' }, after: { channels: 3 } },
      { ts: day(14, 9, 0),  actorId: 'u-mira',  action: 'meeting.recorded', entityType: 'Meeting',  entityId: 'mt-88', summary: 'Mira Lindqvist recorded the Q2 board review (42 min, transcript ready)', links: [{ entityType: 'Meeting', entityId: 'mt-88' }], context: { module: 'meetings', source: 'system' }, after: { duration: 42 } },
      { ts: day(14, 16, 22),actorId: 'u-isa',   action: 'portal.invited',   entityType: 'PortalAccount', entityId: 'pa-12', summary: 'Isa Dahl invited Lykke Studios to the customer portal', links: [{ entityType: 'Customer', entityId: 'cu-lykke' }], context: { module: 'portal', source: 'manual' }, after: { status: 'invited' } }
    ];
    SEED.forEach((s, i) => {
      const p = _team.find(t => t.id === s.actorId);
      const evt = {
        id: 'ae-seed-' + String(i + 1).padStart(2, '0'),
        ts: s.ts,
        actorId: s.actorId,
        actorRole: p ? p.role : 'system',
        action: s.action,
        entityType: s.entityType,
        entityId: s.entityId,
        summary: s.summary,
        before: s.before || null,
        after: s.after || null,
        amount: s.amount || null,
        links: s.links || [],
        context: Object.assign({ source: 'system', sessionId: 'seed' }, s.context || {})
      };
      auditCommit(evt);
    });
    persistAudit();
  }

  /* ====================================================================== */
  /* NOTIFICATIONS — per-person feed derived from audit + Gmail-style items  */
  /* ====================================================================== */
  const _notifs = [];      // all notifications across the team
  let _notifCounter = 0;
  function notifId() { return 'nt-' + (++_notifCounter).toString(36); }

  function seedNotifications() {
    _notifs.length = 0;
    // a few per-person, mixing audit-derived + inbox-style items
    const SEED = [
      ['u-arvid', 'deal.won',     'Sofia closed Forsberg Konsult', '96,000 kr — your sign-off recorded', 'pipeline', false],
      ['u-arvid', 'gmail',        'Reply from Lykke Studios', 'Re: MSA — “looks good, signing today”', 'inbox', false],
      ['u-arvid', 'infra.deploy', 'helm-web v1.8.2 is live', 'Deployed by Noah · production healthy', 'infra', true],
      ['u-arvid', 'approval',     'VAT draft awaiting approval', 'Fortnox · period May 2026', 'ledger', false],
      ['u-mira',  'doc.signed',   'You countersigned the Lykke MSA', 'Document doc-77 · fully executed', 'vault', true],
      ['u-mira',  'meeting',      'Q2 board review transcript ready', 'meetings · 42 min · AI brief queued', 'meetings', false],
      ['u-mira',  'mention',      'Kai mentioned you in #marketing', '“@mira can we get budget sign-off?”', 'comms', false],
      ['u-ola',   'payment',      'Stripe payout settled', '12,400 kr to operating account', 'ledger', false],
      ['u-ola',   'cost.added',   'New cost needs a category', '4,200 kr · Northwind Hosting AB', 'ledger', false],
      ['u-ola',   'approval',     'Payroll run ready for June', 'crew · 8 employees · review & approve', 'crew', false],
      ['u-sofia', 'deal.won',     'Your deal closed 🎉', 'Forsberg Konsult · 96,000 kr', 'pipeline', true],
      ['u-sofia', 'gmail',        'New lead from the website', 'demo request · Halland Bryggeri', 'inbox', false],
      ['u-noah',  'infra.deploy', 'Deploy succeeded', 'helm-web v1.8.2 · production', 'infra', true],
      ['u-noah',  'mention',      'Lena assigned you a task', '“Investigate AX-12 sync error”', 'projects', false],
      ['u-noah',  'devlog',       '3 new pushes on helm-web', 'main · since your last visit', 'devlog', false],
      ['u-lena',  'stock',        'SKU AX-12 below par', '8 left · reorder suggested', 'inventory', false],
      ['u-lena',  'order',        'Return requested', 'Order #0992 · via PostNord', 'orders', false],
      ['u-kai',   'signal',       'Midsummer campaign is live', '3 channels · ROAS tracking on', 'signal', true],
      ['u-kai',   'mention',      'Mira replied in #marketing', 'Re: budget sign-off', 'comms', false],
      ['u-isa',   'portal',       'Lykke Studios accepted the invite', 'portal account active', 'portal', true],
      ['u-isa',   'gmail',        'Support ticket reopened', 'Forsberg Konsult · billing question', 'inbox', false]
    ];
    const base = Date.now();
    SEED.forEach(([rid, type, title, body, mod, read], i) => {
      _notifs.push({
        id: notifId(),
        recipientId: rid,
        eventType: type,
        title, body,
        link: { moduleId: mod, ref: null },
        channelsSent: ['inApp'],
        read: !!read,
        createdAt: new Date(base - i * 11 * 60000).toISOString(),
        ...meta('system', 'system')
      });
    });
  }

  function notifsFor(userId) {
    return _notifs.filter(n => n.recipientId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  function unreadCount(userId) { return notifsFor(userId).filter(n => !n.read).length; }

  /* ====================================================================== */
  /* REGISTRY + ROUTER                                                      */
  /* ====================================================================== */
  const modules = [];          // ordered registration list
  const byId = {};             // id -> module
  let current = null;

  // SECTION maps (separate namespace from modules)
  const sectionById = {};
  const sectionOfModule = {};  // moduleId -> sectionId (owning section)
  let currentSection = null;
  const lastChild = {};        // sectionId -> last-viewed moduleId (remembered)
  SECTIONS.forEach(sec => {
    sectionById[sec.id] = sec;
    sec.children.forEach(cid => { if (!(cid in sectionOfModule)) sectionOfModule[cid] = sec.id; });
  });

  // title-case a kebab id as a label fallback (e.g. 'my-day' -> 'My Day')
  function titleCase(id) {
    return String(id).split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
  }
  // resolve a module's display label / icon (registered, else fallback)
  function modLabel(id) { return (byId[id] && byId[id].label) || titleCase(id); }
  function modIcon(id) { return (byId[id] && byId[id].icon) || '◻'; }

  function register(mod) {
    if (!mod || !mod.id) return;
    if (byId[mod.id]) return;  // dedupe
    mod.rendered = false;
    // additive scope: 'personal' modules re-render when the acting user changes.
    // default 'company' keeps the existing 18 modules back-compatible.
    if (mod.scope !== 'personal') mod.scope = 'company';
    modules.push(mod); byId[mod.id] = mod;
    // if shell already booted, wire dock state lazily (boot builds dock too)
    return mod;
  }

  /* rerender(id): force a module to re-render NOW (clears the lazy flag and,
     if it is the active view, runs render() immediately; otherwise it will
     re-render the next time it is shown). Personal modules use this on a user
     switch; any module may call it to self-refresh. */
  function rerender(id) {
    const mod = byId[id];
    const viewEl = document.getElementById('view-' + id);
    if (!mod || !viewEl) return;
    mod.rendered = false;
    if (current === id) {
      viewEl.innerHTML = '';
      mod.rendered = true;
      try { mod.render(viewEl); } catch (e) { console.error('[HELM] rerender failed for', id, e); }
      countAll(viewEl);
    } else {
      viewEl.innerHTML = '';   // drop stale DOM; render() re-runs on next show()
    }
  }

  /* On a user switch, invalidate every PERSONAL module that already rendered so
     its render() re-runs for the new acting user. The active personal view is
     refreshed immediately; the rest lazily on next show(). */
  function refreshPersonalModules() {
    modules.forEach(m => {
      if (m.scope !== 'personal' || !m.rendered) return;
      rerender(m.id);
    });
  }

  /* show(moduleId): activate the view, its owning section, and the sub-tab. */
  function show(id) {
    const mod = byId[id];
    const viewEl = document.getElementById('view-' + id);
    if (!viewEl) return;
    // toggle views
    $$('.view').forEach(v => v.classList.remove('active'));
    viewEl.classList.add('active');
    // resolve + activate owning section
    const secId = sectionOfModule[id] || null;
    if (secId) {
      currentSection = secId;
      lastChild[secId] = id;
      $$('.nav-section').forEach(b => b.classList.toggle('active', b.dataset.section === secId));
      buildSubtabs(secId, id);
    }
    // lazy render once
    if (mod && mod.render && !mod.rendered) {
      mod.rendered = true;
      try { mod.render(viewEl); } catch (e) { console.error('[HELM] render failed for', id, e); }
      // run count-ups that the module declared
      countAll(viewEl);
    }
    current = id;
    if (location.hash.slice(1) !== id) history.replaceState(null, '', '#' + id);
    $('.stage') && ($('.stage').scrollTop = 0);
  }

  /* showSection(sectionId): activate a section and show its first child
     (or the last-viewed child for that section, if remembered). */
  function showSection(secId) {
    const sec = sectionById[secId]; if (!sec) return;
    const target = (lastChild[secId] && byId[lastChild[secId]]) ? lastChild[secId]
      : sec.children.find(c => byId[c]) || sec.children[0];
    if (target) show(target);
  }

  /* ====================================================================== */
  /* SHELL BUILD (sidebar nav, sub-tabs, tape) — uses SECTIONS + modules    */
  /* ====================================================================== */

  /* PRIMARY NAV — grouped, labeled section rows in the left sidebar.
     Renders the same markup for the desktop sidebar and the mobile bottom
     bar (CSS handles the layout switch). */
  function buildDock() {
    const dock = $('.dock'); if (!dock) return;
    // remove anything after the helm-mark (old dock buttons / spacer / settings)
    const mark = $('.helm-mark', dock);
    Array.from(dock.children).forEach(c => { if (c !== mark) c.remove(); });

    const nav = el('<div class="nav-groups"></div>');
    ZONES.forEach(zone => {
      const inZone = SECTIONS.filter(s => s.zone === zone);
      if (!inZone.length) return;
      const group = el(`<div class="nav-group" data-zone="${esc(zone)}"></div>`);
      group.appendChild(el(`<div class="nav-zone">${esc(zone)}</div>`));
      inZone.forEach(sec => {
        const btn = el(
          `<button class="nav-section" data-section="${esc(sec.id)}" aria-label="${esc(sec.label)}">
             <span class="ns-ico">${sec.icon}</span>
             <span class="ns-label">${esc(sec.label)}</span>
           </button>`);
        btn.addEventListener('click', () => showSection(sec.id));
        group.appendChild(btn);
      });
      nav.appendChild(group);
    });
    dock.appendChild(nav);
  }

  /* SECONDARY NAV — horizontal sub-tab bar showing the active section's
     children. Hidden (single-title shown) when the section has one child. */
  function buildSubtabs(secId, activeChild) {
    const bar = $('.subtabs'); if (!bar) return;
    const sec = sectionById[secId]; if (!sec) { bar.innerHTML = ''; bar.dataset.mode = 'hidden'; return; }
    const kids = sec.children;
    bar.innerHTML = '';
    if (kids.length <= 1) {
      // single-page section: show just the section title, no tabs
      bar.dataset.mode = 'single';
      bar.appendChild(el(
        `<div class="subtabs-title"><span class="st-ico">${sec.icon}</span>${esc(sec.label)}</div>`));
      return;
    }
    bar.dataset.mode = 'tabs';
    const wrap = el('<div class="subtabs-track"></div>');
    kids.forEach(cid => {
      const tab = el(
        `<button class="subtab${cid === activeChild ? ' active' : ''}" data-view="${esc(cid)}">
           <span class="stb-ico">${modIcon(cid)}</span>
           <span class="stb-label">${esc(modLabel(cid))}</span>
         </button>`);
      tab.addEventListener('click', () => show(cid));
      wrap.appendChild(tab);
    });
    bar.appendChild(wrap);
  }

  // The Tape — owned by the shell. Clicking a chip routes to a related module.
  const TAPE = [
    ['CASH', '$284.5K', 'up', 'ledger'],
    ['MRR', '$48.2K', 'up', 'revenue'],
    ['ORDERS·24H', '37', 'up', 'orders'],
    ['RUNWAY', '14.2 MO', 'warn', 'ledger'],
    ['NPS', '62', 'up', 'customers'],
    ['CHURN', '2.1%', 'down', 'revenue'],
    ['STOCK', '94%', '', 'inventory'],
    ['PIPELINE', '$612K', 'up', 'pipeline'],
    ['DSO', '28 D', '', 'billing'],
    ['ROAS', '3.4×', 'up', 'signal']
  ];
  function buildTape() {
    // Removed the fake KPI ticker — keep the deck clean and real.
    const tape = $('.tape'); if (tape) tape.style.display = 'none';
  }

  /* ── live flight log (shell-owned, simulated, deterministic-ish) ────── */
  const LOG_SEED = [
    ['payment', 'Invoice #2294 paid — Northwind AB', 'ok'],
    ['signup', 'New customer: Lykke Studios', 'ok'],
    ['stock', 'SKU AX-12 dropped below par (8 left)', 'warn'],
    ['auto', 'Automation "chase overdue" fired ×3', 'auto'],
    ['order', 'Order #1043 shipped via PostNord', 'ok'],
    ['payment', 'Stripe payout $12.4K settled', 'ok'],
    ['alert', 'Runway under 15 months', 'bad'],
    ['signup', 'Trial started: Forsberg Konsult', 'ok'],
    ['auto', 'Integration "Fortnox" synced 18 vouchers', 'auto'],
    ['order', 'Return requested — Order #0992', 'warn']
  ];
  function pad2(n) { return String(n).padStart(2, '0'); }

  // map an audit action verb → a flight-log tick severity class
  function auditTick(action) {
    if (/fail|error|down|overdue|incident|deactivat/i.test(action)) return 'bad';
    if (/warn|return|stock|below|risk|churn/i.test(action)) return 'warn';
    if (/deploy|automation|sync|integration|presence|role\.changed/i.test(action)) return 'auto';
    return 'ok';
  }

  /* prependFlightLog(evt): live-prepend an AuditEvent to the Flight Log so
     real actions surface immediately (Section A.4 / D — Flight Log is a view
     over the audit stream). Safe no-op before the log exists. */
  function prependFlightLog(evt) {
    const log = $('.flightlog'); if (!log || !evt) return;
    const t = evt.ts ? new Date(evt.ts) : new Date();
    const tick = auditTick(evt.action || '');
    const item = el(
      `<div class="log-item" style="opacity:0;transform:translateX(-8px)"><span class="tick ${tick}"></span>
        <div class="lg-body"><div class="lg-msg">${esc(evt.summary || evt.action || 'event')}</div>
        <div class="lg-ts">T+ ${pad2(t.getHours())}:${pad2(t.getMinutes())}:${pad2(t.getSeconds())}</div></div></div>`);
    log.insertBefore(item, log.firstChild);
    requestAnimationFrame(() => { item.style.transition = 'all .4s var(--ease)'; item.style.opacity = '1'; item.style.transform = 'none'; });
    while (log.children.length > 24) log.lastChild.remove();
  }

  function buildFlightLog() {
    const log = $('.flightlog'); if (!log) return;
    const now = new Date();
    LOG_SEED.forEach((row, i) => {
      const ts = new Date(now.getTime() - i * 7 * 60000);
      log.appendChild(el(
        `<div class="log-item"><span class="tick ${row[2]}"></span>
          <div class="lg-body"><div class="lg-msg">${esc(row[1])}</div>
          <div class="lg-ts">T+ ${pad2(ts.getHours())}:${pad2(ts.getMinutes())}:${pad2(ts.getSeconds())}</div></div></div>`));
    });
    // periodically prepend a fresh entry to feel alive
    const fresh = [
      ['Live: page view spike +18%', 'ok'],
      ['Automation heartbeat OK', 'auto'],
      ['New deal entered pipeline — €24K', 'ok'],
      ['Low stock cleared on AX-12', 'ok'],
      ['Email opened by 41 recipients', 'ok']
    ];
    let fi = 0;
    setInterval(() => {
      if (document.hidden) return;
      const f = fresh[fi++ % fresh.length];
      const t = new Date();
      const item = el(
        `<div class="log-item" style="opacity:0;transform:translateX(-8px)"><span class="tick ${f[1]}"></span>
          <div class="lg-body"><div class="lg-msg">${esc(f[0])}</div>
          <div class="lg-ts">T+ ${pad2(t.getHours())}:${pad2(t.getMinutes())}:${pad2(t.getSeconds())}</div></div></div>`);
      log.insertBefore(item, log.firstChild);
      requestAnimationFrame(() => { item.style.transition = 'all .4s var(--ease)'; item.style.opacity = '1'; item.style.transform = 'none'; });
      while (log.children.length > 22) log.lastChild.remove();
    }, 9000);
  }

  /* ── live clock + T+ mission clock ──────────────────────────────────── */
  const bootTime = Date.now();
  function tickClock() {
    const c = $('.t-clock'); if (!c) return;
    const d = new Date();
    const wall = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    const up = Math.floor((Date.now() - bootTime) / 1000);
    const tplus = `${pad2(Math.floor(up / 3600))}:${pad2(Math.floor(up / 60) % 60)}:${pad2(up % 60)}`;
    c.innerHTML = `<b>${wall}</b> · T+ ${tplus}`;
  }

  /* ====================================================================== */
  /* COMMAND PALETTE (⌘K) — shell owned                                     */
  /* ====================================================================== */
  const QUICK_ACTIONS = [
    { title: 'NFT Site — control center', sub: 'Collections · NFC · orders · support', hint: '↵', ico: '🪙', run: () => show('nft-site') },
    { title: 'Dashboard', sub: 'KPIs · attention queue · sales', hint: '↵', ico: '🛰️', run: () => show('command') },
    { title: 'Sign a PDF', sub: 'Upload & sign a document', hint: '↵', ico: '🖊️', run: () => show('sign') },
    { title: 'Connections', sub: 'Slack · Google · wearables', hint: '↵', ico: '🔌', run: () => show('connect') }
  ];
  let cmdkArmed = 0, cmdkResults = [];

  function openCmdk() {
    const m = $('.cmdk'); if (!m) return;
    m.classList.add('open');
    const inp = $('.cmdk-input input', m); inp.value = ''; inp.focus();
    renderCmdk('');
  }
  function closeCmdk() { const m = $('.cmdk'); m && m.classList.remove('open'); }
  function renderCmdk(q) {
    const list = $('.cmdk-list'); if (!list) return;
    q = q.trim().toLowerCase();
    const mods = modules.filter(m => !q || m.label.toLowerCase().includes(q) || m.id.includes(q))
      .map(m => ({ kind: 'nav', title: m.label, sub: 'Go to module', hint: '↵', ico: m.icon, id: m.id }));
    const secs = SECTIONS.filter(s => !q || s.label.toLowerCase().includes(q) || s.id.includes(q))
      .map(s => ({ kind: 'section', title: s.label, sub: s.zone + ' · section', hint: '↵', ico: s.icon, id: s.id }));
    const acts = QUICK_ACTIONS.filter(a => !q || a.title.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q))
      .map(a => Object.assign({ kind: 'action' }, a));
    cmdkResults = (q ? acts.concat(secs, mods) : acts.slice(0, 3).concat(secs, mods));
    cmdkArmed = 0;
    if (!cmdkResults.length) { list.innerHTML = '<div class="cmdk-empty">No matches. Try “NFT”, “vitals”, “connect”…</div>'; return; }
    let html = '';
    const actItems = cmdkResults.filter(r => r.kind === 'action');
    const secItems = cmdkResults.filter(r => r.kind === 'section');
    const navItems = cmdkResults.filter(r => r.kind === 'nav');
    function block(label, arr) {
      if (!arr.length) return '';
      let s = `<div class="cmdk-group">${label}</div>`;
      arr.forEach(r => {
        s += `<div class="cmdk-item" data-i="${cmdkResults.indexOf(r)}">
          <div class="ci-ico">${r.ico}</div>
          <div class="ci-main"><div class="ci-title">${esc(r.title)}</div><div class="ci-sub">${esc(r.sub)}</div></div>
          <div class="ci-hint">${esc(r.hint)}</div></div>`;
      });
      return s;
    }
    html += block('Actions', actItems);
    html += block('Sections', secItems);
    html += block('Navigate', navItems);
    list.innerHTML = html;
    paintArmed();
    $$('.cmdk-item', list).forEach(it => {
      it.addEventListener('click', () => fireCmdk(parseInt(it.dataset.i, 10)));
      it.addEventListener('mousemove', () => { cmdkArmed = parseInt(it.dataset.i, 10); paintArmed(); });
    });
  }
  function paintArmed() {
    $$('.cmdk-item').forEach(it => it.classList.toggle('armed', parseInt(it.dataset.i, 10) === cmdkArmed));
  }
  function fireCmdk(i) {
    const r = cmdkResults[i]; if (!r) return;
    closeCmdk();
    if (r.kind === 'nav') show(r.id);
    else if (r.kind === 'section') showSection(r.id);
    else if (r.run) setTimeout(r.run, 120);
  }

  /* ── money particle: flies into the health ring on a payment ────────── */
  function fireMoney() {
    const ring = document.getElementById('healthRingAnchor') || $('.dock .helm-mark');
    const target = ring ? ring.getBoundingClientRect() : { left: innerWidth / 2, top: 80, width: 0, height: 0 };
    const p = el('<div style="position:fixed;z-index:400;font-size:20px;pointer-events:none;transition:all .9s cubic-bezier(.5,-0.2,.3,1)">💸</div>');
    p.style.left = (innerWidth / 2) + 'px'; p.style.top = (innerHeight - 120) + 'px';
    document.body.appendChild(p);
    requestAnimationFrame(() => {
      p.style.left = (target.left + target.width / 2) + 'px';
      p.style.top = (target.top + target.height / 2) + 'px';
      p.style.transform = 'scale(0.4)'; p.style.opacity = '0.2';
    });
    setTimeout(() => p.remove(), 950);
  }

  /* ====================================================================== */
  /* PERSON SWITCHER POPOVER (Section A.2) — shell-owned, like .cmdk        */
  /* ---------------------------------------------------------------------- */
  /* Opens off the topbar .profile-chip: team avatars+roles, a presence     */
  /* selector, and a "View my profile" link → settings. Selecting a person  */
  /* calls session.switchUser(id); the chip updates live via 'helm:user'.   */
  /* ====================================================================== */
  function openIdMenu() {
    const m = $('.idmenu'); if (!m) return;
    renderIdMenu();
    m.classList.add('open');
  }
  function closeIdMenu() { const m = $('.idmenu'); m && m.classList.remove('open'); }

  function renderIdMenu() {
    const box = $('.idmenu-box'); if (!box) return;
    const me = session.user;
    const presence = session.presence;
    const presenceRow = Object.keys(PRESENCE_META).map(k => {
      const pm = PRESENCE_META[k];
      return `<button class="id-presence${k === presence ? ' active' : ''}" data-presence="${k}">
        <span class="pdot ${pm.dot}"></span>${esc(pm.label)}</button>`;
    }).join('');
    box.innerHTML = `
      <div class="idmenu-head">
        <div class="idmenu-me">
          <span class="av lg">${esc(me.avatar)}</span>
          <div class="idmenu-me-meta">
            <div class="idmenu-me-name">${esc(me.name)} <span class="role-badge ${esc(me.role)}">${esc(me.role)}</span></div>
            <div class="idmenu-me-sub">${esc(me.title)} · ${esc(me.email)}</div>
          </div>
        </div>
      </div>
      <div class="idmenu-sec">
        <div class="idmenu-label">Presence</div>
        <div class="id-presence-row">${presenceRow}</div>
      </div>
      <div class="idmenu-foot">
        <button class="btn btn-ghost btn-sm id-profile">View my profile</button>
      </div>`;

    $$('.id-presence', box).forEach(b => b.addEventListener('click', () => {
      session.setPresence(b.dataset.presence);
      renderIdMenu();
    }));
    const prof = $('.id-profile', box);
    prof && prof.addEventListener('click', () => { closeIdMenu(); if (byId['settings']) show('settings'); });
  }

  // keep the topbar chip in sync with the acting user + presence
  function refreshProfileChip() {
    const chip = $('.profile-chip'); if (!chip) return;
    const me = session.user;
    const pm = PRESENCE_META[session.presence] || PRESENCE_META.available;
    const av = $('.av', chip); if (av) av.textContent = me.avatar;
    const nm = $('.pc-name', chip); if (nm) nm.textContent = me.name.split(' ')[0];
    let dot = $('.pc-dot', chip);
    if (dot) dot.className = 'pc-dot pdot ' + pm.dot;
    chip.setAttribute('title', me.name + ' · ' + pm.label);
  }

  /* ====================================================================== */
  /* NOTIFICATION CENTER (Section A.3) — shell drawer, like .cmdk           */
  /* ====================================================================== */
  function openNotif() {
    const m = $('.notif'); if (!m) return;
    renderNotif();
    m.classList.add('open');
  }
  function closeNotif() { const m = $('.notif'); m && m.classList.remove('open'); }

  const NOTIF_ICO = {
    'deal.won': '🎯', 'gmail': '✉️', 'infra.deploy': '🚀', 'approval': '✅',
    'doc.signed': '🖊️', 'meeting': '🎥', 'mention': '💬', 'payment': '💸',
    'cost.added': '📒', 'devlog': '📟', 'stock': '📦', 'order': '🚚',
    'signal': '📡', 'portal': '🪟'
  };
  function renderNotif() {
    const list = $('.notif-list'); if (!list) return;
    const me = session.user;
    const items = notifsFor(me.id);
    const head = $('.notif .nh-title');
    const unread = items.filter(n => !n.read).length;
    if (head) head.innerHTML = `◆ NOTIFICATIONS ${unread ? `<span class="badge bad">${unread}</span>` : ''}`;
    if (!items.length) {
      list.innerHTML = `<div class="notif-empty">No notifications for ${esc(me.name.split(' ')[0])}.</div>`;
      return;
    }
    list.innerHTML = items.map(n => `
      <button class="notif-item${n.read ? '' : ' unread'}" data-id="${esc(n.id)}" data-mod="${esc(n.link.moduleId || '')}">
        <span class="ni-ico">${NOTIF_ICO[n.eventType] || '◆'}</span>
        <span class="ni-body">
          <span class="ni-title">${esc(n.title)}</span>
          <span class="ni-sub">${esc(n.body)}</span>
          <span class="ni-meta">${esc(timeAgo(n.createdAt))}${n.link.moduleId ? ' · ' + esc(modLabel(n.link.moduleId)) : ''}</span>
        </span>
        ${n.read ? '' : '<span class="ni-dot"></span>'}
      </button>`).join('');
    $$('.notif-item', list).forEach(it => it.addEventListener('click', () => {
      const n = _notifs.find(x => x.id === it.dataset.id);
      if (n) { n.read = true; }
      refreshBell();
      closeNotif();
      const mod = it.dataset.mod;
      if (mod && byId[mod]) show(mod);
    }));
  }

  function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.round(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }

  // unread badge on the topbar bell for the acting user
  function refreshBell() {
    const bell = $('.icon-btn[data-act="bell"]'); if (!bell) return;
    const n = unreadCount(session.user.id);
    let badge = $('.bell-count', bell);
    if (n > 0) {
      if (!badge) { badge = el('<span class="bell-count"></span>'); bell.appendChild(badge); }
      badge.textContent = n > 9 ? '9+' : String(n);
      bell.classList.add('has-unread');
    } else {
      if (badge) badge.remove();
      bell.classList.remove('has-unread');
    }
  }

  /* ====================================================================== */
  /* COMPANY OVERVIEW OVERLAY HOST (Section C — command fills it later)     */
  /* ====================================================================== */
  function openOverview() {
    const m = $('.overview'); if (!m) return;
    const body = $('.overview-body', m);
    // let the command module fill it if it provides a hook; else placeholder
    const filler = (byId['command'] && byId['command'].renderOverview);
    if (body && (!body.dataset.filled || filler)) {
      if (filler) {
        try { byId['command'].renderOverview(body); body.dataset.filled = '1'; }
        catch (e) { console.error('[HELM] overview render failed', e); overviewPlaceholder(body); }
      } else {
        overviewPlaceholder(body);
      }
    }
    m.classList.add('open');
  }
  function closeOverview() { const m = $('.overview'); m && m.classList.remove('open'); }
  function overviewPlaceholder(body) {
    body.innerHTML = `
      <div class="ov-placeholder">
        <div class="ov-ph-mark">⤢</div>
        <h2>Company Overview</h2>
        <p>A single canvas of the whole company — value-flow map, org-wide KPIs and a live map of every subsystem — assembles here. The Command Deck fills this overlay.</p>
        <div class="ov-ph-grid">
          ${['Finance', 'Sales', 'Operations', 'People', 'Platform'].map(z =>
            `<div class="ov-ph-cell">${esc(z)}</div>`).join('')}
        </div>
      </div>`;
  }

  /* ====================================================================== */
  /* ACCENT THEME SWITCHER                                                  */
  /* ====================================================================== */
  const THEMES = {
    aurora: { a1: '#19D3FF', a2: '#4D8DFF', glow: 'rgba(25,211,255,0.16)' },
    violet: { a1: '#7C6CFF', a2: '#34C3FF', glow: 'rgba(124,108,255,0.18)' },
    amber: { a1: '#F5A524', a2: '#FF7A59', glow: 'rgba(245,165,36,0.16)' },
    rose: { a1: '#FF4D6D', a2: '#7C6CFF', glow: 'rgba(255,77,109,0.16)' }
  };
  function setTheme(name) {
    const t = THEMES[name]; if (!t) return;
    const r = document.documentElement.style;
    r.setProperty('--accent1', t.a1);
    r.setProperty('--accent2', t.a2);
    r.setProperty('--glow', t.glow);
    r.setProperty('--accent-grad', `linear-gradient(120deg,var(--accent3),${t.a2} 42%,${t.a1} 74%,#46E6A6)`);
    r.setProperty('--accent-soft', t.glow);
    $$('.swatch').forEach(s => s.classList.toggle('on', s.dataset.theme === name));
  }

  /* health-as-color-weather: shift ambient glow toward warn under stress */
  function setWeather(score) {
    const r = document.documentElement.style;
    if (score < 60) r.setProperty('--weather', 'rgba(255,77,109,0.16)');
    else if (score < 78) r.setProperty('--weather', 'rgba(245,165,36,0.16)');
    else r.setProperty('--weather', 'var(--glow)');
    const mc = $('.master-caution');
    if (mc) {
      mc.dataset.state = score < 78 ? 'warn' : 'ok';
      $('.mc-text', mc) && ($('.mc-text', mc).textContent = score < 78 ? 'CAUTION — REVIEW' : 'ALL SYSTEMS NOMINAL');
    }
  }

  /* ====================================================================== */
  /* BACKGROUND CANVAS — drifting starfield + faint scan, rAF, pauses hidden*/
  /* ====================================================================== */
  function startCanvas() {
    const cv = document.getElementById('bg-canvas'); if (!cv) return;
    const ctx = cv.getContext('2d');
    let w, h, stars = [], raf = null, t = 0;
    function resize() {
      w = cv.width = innerWidth * devicePixelRatio;
      h = cv.height = innerHeight * devicePixelRatio;
      cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
      const n = Math.min(110, Math.floor(innerWidth / 14));
      const r = rng(1337); stars = [];
      for (let i = 0; i < n; i++) stars.push({
        x: r() * w, y: r() * h, z: 0.3 + r() * 1.4, s: 0.4 + r() * 1.3, ph: r() * 6.28
      });
    }
    function frame() {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      t += 0.006;
      ctx.clearRect(0, 0, w, h);
      for (const st of stars) {
        st.y += st.z * 0.12 * devicePixelRatio;
        if (st.y > h) { st.y = -2; }
        const tw = 0.55 + 0.45 * Math.sin(t * 2 + st.ph);
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.s * devicePixelRatio, 0, 6.283);
        ctx.fillStyle = `rgba(138,164,188,${0.10 + tw * 0.22})`;
        ctx.fill();
      }
    }
    addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !raf) frame();
    });
    resize(); frame();
  }

  /* ====================================================================== */
  /* BOOT SEQUENCE                                                          */
  /* ====================================================================== */
  const BOOT_STEPS = [
    'CONNECTING DATA LAYER',
    'LOADING NFT PLATFORM',
    'READING LIVE COUNTS',
    'ARMING COMMAND PALETTE',
    'DECK ONLINE'
  ];
  function runBoot(done) {
    const boot = document.getElementById('boot');
    const bar = boot && $('.boot-bar .fill', boot);
    const logEl = boot && $('.boot-log', boot);
    if (!boot) { done(); return; }
    let i = 0; const total = BOOT_STEPS.length;
    const skip = $('.boot-skip', boot);
    let finished = false;
    function finish() {
      if (finished) return; finished = true;
      boot.classList.add('gone');
      setTimeout(() => boot.remove(), 600);
      done();
    }
    skip && skip.addEventListener('click', finish);
    const iv = setInterval(() => {
      i++;
      if (bar) bar.style.width = Math.min(100, (i / total) * 100) + '%';
      if (logEl) logEl.innerHTML = `<b>›</b> ${BOOT_STEPS[Math.min(i, total - 1)]}…`;
      if (i >= total) { clearInterval(iv); setTimeout(finish, 260); }
    }, 200);
  }

  /* ====================================================================== */
  /* WIRING                                                                 */
  /* ====================================================================== */
  function wireShell() {
    buildDock();

    refreshProfileChip();

    // search box opens palette
    const sb = $('.topbar-search');
    sb && sb.addEventListener('click', openCmdk);

    // person switcher — profile chip opens the identity popover
    const chip = $('.profile-chip');
    chip && chip.addEventListener('click', openIdMenu);

    // identity popover close affordance
    const idScrim = $('.idmenu-scrim'); idScrim && idScrim.addEventListener('click', closeIdMenu);

    // session reactions: keep chip + personal views in sync
    session.on('helm:user', () => {
      refreshProfileChip();
      refreshPersonalModules();
      if ($('.idmenu') && $('.idmenu').classList.contains('open')) renderIdMenu();
    });
    session.on('helm:presence', () => {
      refreshProfileChip();
      if ($('.idmenu') && $('.idmenu').classList.contains('open')) renderIdMenu();
    });

    // theme swatches
    $$('.swatch').forEach(s => s.addEventListener('click', () => setTheme(s.dataset.theme)));

    // command palette wiring
    const cmdkInput = $('.cmdk-input input');
    if (cmdkInput) cmdkInput.addEventListener('input', e => renderCmdk(e.target.value));
    const scrim = $('.cmdk-scrim'); scrim && scrim.addEventListener('click', closeCmdk);

    // global keys
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); const m = $('.cmdk'); m && m.classList.contains('open') ? closeCmdk() : openCmdk(); return; }
      // Escape closes any shell overlay (popover/drawer/overview) before cmdk
      if (e.key === 'Escape') {
        if ($('.idmenu') && $('.idmenu').classList.contains('open')) { closeIdMenu(); return; }
        if ($('.notif') && $('.notif').classList.contains('open')) { closeNotif(); return; }
        if ($('.overview') && $('.overview').classList.contains('open')) { closeOverview(); return; }
      }
      const open = $('.cmdk') && $('.cmdk').classList.contains('open');
      if (!open) return;
      if (e.key === 'Escape') closeCmdk();
      else if (e.key === 'ArrowDown') { e.preventDefault(); cmdkArmed = Math.min(cmdkResults.length - 1, cmdkArmed + 1); paintArmed(); scrollArmed(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cmdkArmed = Math.max(0, cmdkArmed - 1); paintArmed(); scrollArmed(); }
      else if (e.key === 'Enter') { e.preventDefault(); fireCmdk(cmdkArmed); }
    });

    // hash routing
    addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && byId[id]) show(id); });
  }
  function scrollArmed() {
    const it = $(`.cmdk-item[data-i="${cmdkArmed}"]`);
    it && it.scrollIntoView({ block: 'nearest' });
  }

  /* boot orchestration */
  function boot() {
    let savedTheme = 'aurora';
    try { savedTheme = localStorage.getItem('helm.theme') || 'aurora'; } catch (e) {}
    setTheme(THEMES[savedTheme] ? savedTheme : 'aurora');
    startCanvas();
    setInterval(tickClock, 1000); tickClock();
    runBoot(() => {
      wireShell();
      const app = document.getElementById('app');
      app && app.classList.add('ready');
      // initial route: hash if valid+registered, else 'my-day' (the morning page), else 'command'
      const hash = location.hash.slice(1);
      const first = (hash && byId[hash]) ? hash
        : (byId['command'] ? 'command' : (modules[0] && modules[0].id));
      if (first) show(first);
      // health weather after the deck is live
      setWeather(86);
      setTimeout(() => toast('Deck online — all systems nominal', 'success'), 600);
    });
  }

  /* ── expose the single global ───────────────────────────────────────── */
  window.HELM = {
    register, show, showSection, boot, rerender,
    el, count, countAll, toast,
    fmt, charts, data,
    setTheme, setWeather, openCmdk,
    // identity + audit spine
    session, audit,
    openOverview, closeOverview,
    openNotif, closeNotif, openIdMenu, closeIdMenu,
    // notification helpers (modules may push/read, e.g. settings notif center)
    notifications: {
      for(userId) { return notifsFor(userId || (session.user && session.user.id)); },
      unread(userId) { return unreadCount(userId || (session.user && session.user.id)); },
      add(n) {
        const note = Object.assign({ id: notifId(), channelsSent: ['inApp'], read: false, createdAt: new Date().toISOString(), link: {} }, n, meta('system', n && n.source || 'system'));
        _notifs.push(note); refreshBell();
        if ($('.notif') && $('.notif').classList.contains('open')) renderNotif();
        return note;
      },
      markRead(id) { const n = _notifs.find(x => x.id === id); if (n) { n.read = true; refreshBell(); } }
    },
    get modules() { return modules.slice(); },
    get sections() { return SECTIONS.slice(); },
    _internal: { byId, sectionById, sectionOfModule, fireMoney, meta, PRESENCE_META }
  };
})();
