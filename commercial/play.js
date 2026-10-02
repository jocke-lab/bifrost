/* ============================================================================
   play.js — window.BVPlay
   Bifrost Vault commercial · the PLAYABLE DEMO after the film (page only; never
   in the rendered video; does nothing in render mode).

   An interactive copy of the client's real opening (bp-shop PackOpening.tsx +
   vault-reveal.module.css + PackGlitter.tsx):
     sealed   the REAL sealed case (assets/box/frames, the vault-opening-hq.mp4 frames)
              waits, the seam light double-pulses (1.7 s). The five possible coins are
              shown first ("Chances shown before you buy" · "In this preview: 1 in 5 for each
              design."). Press (or press-and-hold) the clasp.
     charge   frames advance, the seal pulse tightens to 1.1 s, a gold ring fills
              around the clasp ("A moment of possibility.").
     open     release light, the lid unlatches (latch hit), slow lid rise, the film
              FREEZES on frame 105 (4.375 s), glitter rises from the mouth, the coin —
              drawn uniformly from the five — rises from INSIDE the rim (clipped below
              the rim until 45 % of the rise), scale .28 -> 1 over 1.8 s, turning; one
              bloom + burst when it clears the rim.
     result   the coin hangs over the open case, turning slowly. "Revealed from the
              vault", name, "Your exact coin. Keep it vaulted, list it, or bring it
              home." + four choices (Keep it vaulted / List it / Bring it home / 80%
              buyback quote), each with a short preview confirmation; "Open another".
   Always labelled "Free preview · no purchase · no coin awarded".

   Layout: a fixed full-viewport dialog holding a logical stage (1920x1080 when the
   viewport is landscape, 1080x1920 when portrait — with the 220/320 px top/bottom
   safe zones), scaled to fit. Real time (requestAnimationFrame) is allowed here;
   prefers-reduced-motion skips straight to the result and removes shake/drift.
   Keyboard: Tab through Sound / Close / the clasp / choices; Enter or Space opens
   (hold to charge); Esc skips the opening, then closes. Focus is trapped and restored.

   API
     BVPlay.open({source}) · BVPlay.close() · BVPlay.isOpen()
     BVPlay._pose({portrait, phase:'sealed'|'charge'|'open', charge, u, coin, choice, choiceU})
        test hook: freezes the clock and paints one pose (used for the stills).
   ========================================================================== */
(function () {
  'use strict';

  if (/[?&]render(=(?!0|false)|&|$)/.test(location.search)) {   // never in render mode
    window.BVPlay = { open() {}, close() {}, isOpen: () => false };
    return;
  }

  const CFG = window.BV_CONFIG || {};
  const COL = CFG.collection || {};
  const COINS = (COL.coins && COL.coins.length ? COL.coins : [
    { id: 'silence', name: 'Silence', file: 'assets/coins/silence.webp' },
    { id: 'ametherion', name: 'Ametherion', file: 'assets/coins/ametherion.webp' },
    { id: 'cycle', name: 'Cycle', file: 'assets/coins/cycle.webp' },
    { id: 'dominion', name: 'Dominion', file: 'assets/coins/dominion.webp' },
    { id: 'veritas', name: 'Veritas', file: 'assets/coins/veritas.webp' }
  ]);
  const N = COINS.length;
  const EDITION = COL.edition || 50;
  const METAL = COL.metal || 'Silver';
  const BUY = CFG.buyback || { pct: 80, basisLabel: "of the coin’s stated original value" };
  const VAULT = (CFG.vault && CFG.vault.label) || 'Secure vault · Liechtenstein';
  const CHAIN = (CFG.chain && CFG.chain.name) || 'Base';
  const DOMAIN = (CFG.brand && CFG.brand.domain) || 'bifrostvault.io';
  const LABEL = 'Free preview · no purchase · no coin awarded';
  const LABEL_SR = '18 plus. ' + LABEL;           // the pill shows a round 18+ badge in front of LABEL
  const ODDS = 'In this preview: 1 in ' + N + ' for each design';
  const BUY_BASIS = BUY.pct + '% ' + BUY.basisLabel + ' · terms apply';

  const GOLD = '#E6B45A', VIOLET = '#855CFF', VIOLET_LT = '#B29AFF', LAV = '#BAA9E5', WHITE = '#F6F7FC', SEC = '#B4BFD1';
  const BRIDGE = ['#67DCEA', '#7793FF', '#855CFF'];

  /* ── math / easing ───────────────────────────────────────────────────────── */
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const range = (x, a, b) => clamp((x - a) / (b - a));
  const oCubic = t => 1 - Math.pow(1 - clamp(t), 3);
  const oQuint = t => 1 - Math.pow(1 - clamp(t), 5);
  const ioSine = t => -(Math.cos(Math.PI * clamp(t)) - 1) / 2;
  const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = s => ((ax * s + bx) * s + cx) * s, Y = s => ((ay * s + by) * s + cy) * s;
    const dX = s => (3 * ax * s + 2 * bx) * s + cx;
    return x => {
      x = clamp(x); let s = x;
      for (let i = 0; i < 8; i++) { const e = X(s) - x; if (Math.abs(e) < 1e-5) break; const d = dX(s); if (Math.abs(d) < 1e-6) break; s -= e / d; }
      return Y(clamp(s));
    };
  }
  const E_RISE = bezier(0.2, 0.7, 0.25, 1);     // .coin coinRise (vault-reveal.module.css)
  const E_BRAND = bezier(0.16, 1, 0.3, 1);      // brand motion curve
  const E_IO = bezier(0.42, 0, 0.58, 1);
  const env = (x, a, b, c, d) => (x <= a || x >= d ? 0 : x < b ? range(x, a, b) : x <= c ? 1 : 1 - range(x, c, d));
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Uniform draw from the five (crypto when available; rejection sampling, no bias).
  function drawIndex() {
    try {
      const u = new Uint32Array(1), lim = Math.floor(4294967296 / N) * N;
      for (let k = 0; k < 16; k++) { crypto.getRandomValues(u); if (u[0] < lim) return u[0] % N; }
    } catch (e) { /* no crypto */ }
    return Math.floor(Math.random() * N) % N;
  }

  /* ── the real opening, timings (seconds) ─────────────────────────────────── */
  const FILM_FPS = 24, RIM = 0.5352;
  const F_IDLE = 24;                 // 1.0 s: the seam LED already lit
  const F_CHARGE = 63;               // 2.625 s: just before the release
  const F_LATCH = 72;                // 3.0 s: the lid unlatches
  const F_FREEZE = 105;              // 4.375 s: the in-app freeze frame
  const CHARGE_DUR = 1.1;            // the clasp ring (gather -> charge)
  const O_LATCH = 0.35, O_FREEZE = 2.15, O_RISE = 2.3, RISE_DUR = 1.8;
  const O_CLEAR = O_RISE + RISE_DUR * 0.45;   // the coin clears the rim (clip released)
  const O_PAN = 3.35, PAN_DUR = 1.25, O_RESULT = 4.0;
  const CLASP = { x: 964, y: 597 };  // in film px (measured on f024)

  /* ── assets ──────────────────────────────────────────────────────────────── */
  const FRAME_SRC = i => 'assets/box/frames/f' + String(i).padStart(3, '0') + '.webp';
  const FACE_SRC = id => 'assets/coins3d/' + id + '-face.webp';
  const TURN_IDS = { dominion: 1, veritas: 1 };
  const TURN_IDX = []; for (let i = 6; i <= 34; i += 2) TURN_IDX.push(i);   // yaw -28..+28, 4° steps
  const TURN_SRC = (id, i) => 'assets/coins3d/' + id + '-turn/' + String(i).padStart(2, '0') + '.webp';
  const TURN_DISC = 976 / 1100, FACE_DISC = 1418 / 1600;
  const imgCache = {};
  function img(src) {
    if (imgCache[src]) return imgCache[src];
    const im = new Image();
    im.decoding = 'async';
    im.src = src;
    const p = (im.decode ? im.decode() : new Promise((r, j) => { im.onload = r; im.onerror = j; })).catch(() => {});
    imgCache[src] = { im, p };
    return imgCache[src];
  }
  const ok = im => im && im.complete && im.naturalWidth > 0;
  const FRAMES = [];
  function loadFrames() {
    if (FRAMES.length) return;
    // the idle frame first, then the opening in order
    FRAMES[F_IDLE] = img(FRAME_SRC(F_IDLE)).im;
    for (let i = F_IDLE; i <= F_FREEZE; i++) FRAMES[i] = img(FRAME_SRC(i)).im;
  }
  function loadFaces() { COINS.forEach(c => { img(FACE_SRC(c.id)); img(c.file); }); }
  const TURN = {};
  function loadTurn(id) {
    if (!TURN_IDS[id] || TURN[id]) return;
    TURN[id] = TURN_IDX.map(i => img(TURN_SRC(id, i)).im);
  }
  const turnReady = id => !!(TURN[id] && TURN[id].every(ok));

  /* ── PackGlitter.tsx: 22 fixed trajectories ──────────────────────────────── */
  const SPARKS = Array.from({ length: 22 }, (_, i) => {
    const n = i + 1;
    return {
      x: (8 + ((i * 37) % 85)) / 100, drift: ((i * 13) % 35) - 17, h: (61 + ((i * 17) % 40)) / 100,
      size: i % 5 === 0 ? 3.4 : i % 3 === 0 ? 2.7 : 1.8, dur: 3.1 + ((i * 7) % 17) / 10,
      delay: ((i * 23) % 47) / 10, col: n % 7 === 0 ? 2 : n % 4 === 0 ? 1 : 0
    };
  });
  const SPARK_COL = [['#e4d9ff', 'rgba(177,132,255,.45)'], ['#cff8ff', 'rgba(118,218,255,.40)'], ['#fff1d2', 'rgba(246,222,176,.35)']];
  const SPARK_OP = [[0, 0], [0.13, 0.8], [0.4, 0.95], [0.65, 0.86], [0.86, 0.32], [1, 0]];
  function sparkAt(p) {
    let dx, dy, sc;
    if (p < 0.4) { const u = p / 0.4; dx = 0.4 * u; dy = -0.4 * u; sc = 0.55 + 0.45 * u; }
    else { const u = (p - 0.4) / 0.6; dx = 0.4 + 0.6 * u; dy = -0.4 - 0.6 * u; sc = 1 - 0.7 * u; }
    let o = 0;
    for (let k = 0; k < SPARK_OP.length - 1; k++) {
      const a = SPARK_OP[k], b = SPARK_OP[k + 1];
      if (p <= b[0]) { o = lerp(a[1], b[1], (p - a[0]) / (b[0] - a[0])); break; }
    }
    return { dx, dy, sc, o };
  }
  // the bloom burst (seeded once; analytic)
  const BURST = (() => {
    const r = mulberry(7177), out = [];
    for (let i = 0; i < 46; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.9, sp = 260 + r() * 820;
      out.push({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.82, life: 0.7 + r() * 1.1, size: 1.6 + r() * 2.8,
        col: i % 7 === 0 ? 2 : i % 4 === 0 ? 1 : 0, k: 2.2 + r() * 1.6, r0: r() * 0.35 });
    }
    return out;
  })();
  // dust that keeps drifting up around the coin in the result
  const DUST = (() => {
    const r = mulberry(4242), out = [];
    for (let i = 0; i < 26; i++) out.push({ x: (r() - 0.5) * 1.5, y: r(), sp: 0.05 + r() * 0.08, ph: r(), size: 1.2 + r() * 2, col: i % 7 === 0 ? 2 : i % 4 === 0 ? 1 : 0, sw: r() * 6.28 });
    return out;
  })();

  /* ── sealPulse keyframes (vault-reveal.module.css) ───────────────────────── */
  const SEAL_KF = [[0, 0.2, 0.88, 0.75], [0.17, 0.7, 1, 1], [0.31, 0.3, 0.95, 0.85], [0.46, 1, 1.035, 1.12], [0.72, 0.2, 0.9, 0.8], [1, 0.2, 0.88, 0.75]];
  function sealAt(p) {
    p = p - Math.floor(p);
    for (let i = 0; i < SEAL_KF.length - 1; i++) {
      const a = SEAL_KF[i], b = SEAL_KF[i + 1];
      if (p <= b[0]) { const u = E_IO((p - a[0]) / (b[0] - a[0])); return { o: lerp(a[1], b[1], u), sx: lerp(a[2], b[2], u), sy: lerp(a[3], b[3], u) }; }
    }
    return { o: 0.2, sx: 0.88, sy: 0.75 };
  }

  /* ── sprites ─────────────────────────────────────────────────────────────── */
  const spriteCache = {};
  function sprite(core, glow) {
    const key = core + glow;
    if (spriteCache[key]) return spriteCache[key];
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.14, core); g.addColorStop(0.28, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    return (spriteCache[key] = cv);
  }

  /* ── geometry per format ─────────────────────────────────────────────────── */
  function geo(portrait) {
    return portrait ? {
      P: true, W: 1080, H: 1920,
      pivot: { x: 540, y: 930 }, S: [0.96, 1.02, 1.14],
      D: 440, coinY: 690, pan: { x: 0, y: -130 }, filmDim: 0.5,
      chipY: 814,
      safe: { t: 220, b: 1600, l: 64, r: 1016 }
    } : {
      P: false, W: 1920, H: 1080,
      pivot: { x: 960, y: 578 }, S: [1.0, 1.04, 1.07],
      D: 480, coinY: 350, pan: { x: -330, y: 0 }, filmDim: 0.6,
      chipY: 652,
      safe: { t: 64, b: 1016, l: 115, r: 1805 }
    };
  }

  /* ── styles (namespaced .bvx-*, injected once) ───────────────────────────── */
  const CSS = `
.bvx{position:fixed;inset:0;z-index:2147483000;background:#020203;overflow:hidden;
  font-family:'Geist',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${WHITE};
  -webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent;overscroll-behavior:contain;touch-action:manipulation}
.bvx[hidden]{display:none}
.bvx *{box-sizing:border-box}
.bvx-stage{position:absolute;left:50%;top:50%;overflow:hidden;transform-origin:0 0;background:#020203}
.bvx-abs{position:absolute;left:0;top:0}
.bvx-world{position:absolute;left:0;top:0;width:100%;height:100%;will-change:transform}
.bvx-film{position:absolute;width:1920px;height:1080px;transform-origin:960px ${1080 * RIM}px;will-change:transform,opacity;
  -webkit-mask-image:linear-gradient(180deg,transparent,#000 9%,#000 86%,transparent);mask-image:linear-gradient(180deg,transparent,#000 9%,#000 86%,transparent)}
.bvx-film canvas{position:absolute;left:0;top:0;width:1920px;height:1080px}
.bvx-blend{mix-blend-mode:screen;pointer-events:none}
.bvx-ui{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
.bvx-ui button,.bvx-ui a{pointer-events:auto}
.bvx-fade{will-change:opacity,transform}
.bvx-eyebrow{font-weight:600;text-transform:uppercase;letter-spacing:.26em;color:${LAV};line-height:1.2}
.bvx-h1{font-weight:700;text-transform:uppercase;letter-spacing:-.02em;line-height:.98;color:${WHITE};margin:0}
.bvx-body{font-weight:500;color:${SEC};line-height:1.35}
.bvx-mono{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-weight:500;letter-spacing:.06em}
.bvx-pill{display:inline-flex;align-items:center;gap:.7em;border-radius:999px;border:1px solid rgba(255,255,255,.12);
  background:rgba(12,14,24,.62);color:${SEC};font-weight:600;letter-spacing:.2em;text-transform:uppercase;white-space:nowrap}
.bvx-pill i{display:inline-block;width:.5em;height:.5em;border-radius:50%;background:${VIOLET_LT};box-shadow:0 0 .7em ${VIOLET}}
.bvx-18{flex:none;display:inline-flex;align-items:center;justify-content:center;width:2.75em;height:2.75em;border-radius:50%;
  border:2px solid rgba(246,247,252,.86);color:${WHITE};font-weight:700;font-size:.84em;letter-spacing:-.02em;line-height:1}
.bvx-hbtn{display:inline-flex;align-items:center;justify-content:center;gap:.5em;border-radius:999px;cursor:pointer;
  border:1px solid rgba(255,255,255,.14);background:rgba(14,16,26,.66);color:${WHITE};font:inherit;font-weight:600;letter-spacing:.02em;
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.bvx-hbtn:hover{border-color:rgba(186,169,229,.55);background:rgba(30,28,48,.8)}
.bvx-hbtn svg{width:1.05em;height:1.05em}
.bvx button:focus{outline:none}
.bvx button:focus-visible{outline:3px solid ${VIOLET_LT};outline-offset:5px}
.bvx-clasp{position:absolute;border:0;background:transparent;cursor:pointer;border-radius:40px;padding:0;margin:0;
  -webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:none}
.bvx .bvx-clasp:focus-visible{outline:none}
.bvx-choice{position:absolute;display:flex;align-items:center;gap:.6em;padding:0 .9em;white-space:nowrap;cursor:pointer;text-align:left;
  border-radius:22px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.045);color:${WHITE};
  font:inherit;font-weight:600;letter-spacing:-.005em;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.bvx-choice:hover{border-color:rgba(186,169,229,.5);background:rgba(133,92,255,.10)}
.bvx-choice[aria-pressed="true"]{border-color:${VIOLET_LT};background:rgba(133,92,255,.18);box-shadow:0 0 0 1px rgba(178,154,255,.35),0 10px 40px -12px rgba(133,92,255,.6)}
.bvx-choice svg{width:1.15em;height:1.15em;flex:none;color:${LAV}}
.bvx-choice[aria-pressed="true"] svg{color:${WHITE}}
.bvx-again{position:absolute;display:inline-flex;align-items:center;gap:.55em;border:0;background:transparent;color:${LAV};
  font:inherit;font-weight:600;cursor:pointer;padding:.3em .2em;letter-spacing:.01em}
.bvx-again:hover{color:${WHITE}}
.bvx-again svg{width:1em;height:1em}
.bvx-chip{position:absolute;display:flex;align-items:center;gap:.8em;border-radius:22px;padding:.75em 1.1em .75em .9em;
  border:1px solid rgba(255,255,255,.14);background:rgba(10,12,22,.78);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);
  box-shadow:0 20px 60px -20px rgba(0,0,0,.8);white-space:nowrap}
.bvx-chip .ic{display:grid;place-items:center;width:2.1em;height:2.1em;border-radius:50%;background:rgba(133,92,255,.18);color:${VIOLET_LT};flex:none}
.bvx-chip .ic svg{width:1.15em;height:1.15em}
.bvx-chip b{display:block;font-weight:700;color:${WHITE};letter-spacing:-.01em}
.bvx-chip span{display:block;color:${SEC};font-weight:500;font-size:.78em;margin-top:.15em}
.bvx-chip em{font-style:normal;margin-left:.6em;font-size:.58em;letter-spacing:.22em;font-weight:600;color:${LAV};
  border:1px solid rgba(186,169,229,.35);border-radius:999px;padding:.35em .8em;align-self:center}
.bvx-chip.gold .ic{background:rgba(230,180,90,.16);color:${GOLD}}
.bvx-thumb{position:absolute;text-align:center}
.bvx-thumb img{display:block;width:100%;height:auto;filter:drop-shadow(0 10px 18px rgba(0,0,0,.6))}
.bvx-thumb b{display:block;font-weight:600;letter-spacing:.14em;margin-right:-.14em;text-transform:uppercase;color:${WHITE};margin-top:.55em}
.bvx-thumb span{display:block;color:${SEC};margin-top:.25em}
.bvx-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.bvx-grain{position:absolute;inset:0;pointer-events:none;opacity:.035;mix-blend-mode:screen}
.bvx-loading{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:${SEC};letter-spacing:.24em;text-transform:uppercase;font-weight:600}
`;
  function injectCSS() {
    if (document.getElementById('bvx-style')) return;
    const s = document.createElement('style'); s.id = 'bvx-style'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ── tiny DOM helpers ────────────────────────────────────────────────────── */
  function el(tag, cls, parent, css, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (css) e.style.cssText = css;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  const sv = (d, w = 1.9) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    vault: sv('<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="m8 12 3 3 5-6"/>', 1.8),
    tag: sv('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.4"/>', 1.8),
    truck: sv('<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>', 1.8),
    ring: sv('<circle cx="12" cy="12" r="8.5" opacity=".32"/><path d="M12 3.5A8.5 8.5 0 1 1 3.92 9.37"/><path d="M9.6 14.6l4.8-5.2"/><circle cx="9.7" cy="9.6" r=".6"/><circle cx="14.3" cy="14.4" r=".6"/>', 1.9),
    again: sv('<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>', 2),
    close: sv('<path d="M6 6l12 12M18 6 6 18"/>', 2.2),
    sndOff: sv('<path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z"/><path d="M16 9.5l5 5m0-5-5 5"/>', 1.8),
    sndOn: sv('<path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.6a7.6 7.6 0 0 1 0 10.8"/>', 1.8),
    skip: sv('<path d="M7 17 17 7M9 7h8v8"/>', 2)
  };
  let gidN = 0;
  function markSVG(size) {
    const g = 'bvxg' + (++gidN);
    return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="${g}" x1="3" y1="24" x2="29" y2="8" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0" stop-color="${BRIDGE[0]}"/><stop offset=".5" stop-color="${BRIDGE[1]}"/><stop offset="1" stop-color="${BRIDGE[2]}"/></linearGradient></defs>` +
      `<circle cx="16" cy="16" r="12.5" fill="none" stroke="${GOLD}" stroke-width="2.4"/>` +
      `<path d="M3 24 Q16 2 29 12" fill="none" stroke="url(#${g})" stroke-width="3" stroke-linecap="round"/></svg>`;
  }

  /* ── state ───────────────────────────────────────────────────────────────── */
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const S = {
    open: false, phase: 'sealed', t0: 0, charge: 0, holding: false, auto: false,
    coin: 3, choice: null, choiceT: 0, sealPh: 0, resetT: -10, lastT: 0, turn: false,
    frozen: null, raf: 0, opener: null, sound: false, announced: false, resultFocused: false
  };
  const now = () => (S.frozen != null ? S.frozen : performance.now() / 1000);
  let D = null;   // DOM for the current format
  let portrait = false;

  /* ── build ───────────────────────────────────────────────────────────────── */
  function build() {
    injectCSS();
    if (!D) {
      const root = el('div', 'bvx', document.body);
      root.hidden = true;
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', 'Free preview: open a sealed case');
      D = { root };
      root.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.bvx-clasp')) e.preventDefault(); });
    }
    const root = D.root;
    if (D.stage) D.stage.remove();
    const G = geo(portrait);
    const st = el('div', 'bvx-stage', root, `width:${G.W}px;height:${G.H}px`);
    Object.assign(D, { G, stage: st });

    /* world: film, lights, coin, glitter (pans/shakes as one) */
    const world = D.world = el('div', 'bvx-world', st);
    D.ambient = el('div', 'bvx-abs', world, `width:${G.W}px;height:${G.H}px;background:radial-gradient(60% 46% at 50% ${G.P ? 52 : 56}%,rgba(55,32,91,.42),rgba(7,49,107,.12) 55%,transparent 80%)`);
    D.film = el('div', 'bvx-film', world, `left:${G.pivot.x - 960}px;top:${G.pivot.y - 1080 * RIM}px`);
    D.fcv = el('canvas', '', D.film); D.fcv.width = 1920; D.fcv.height = 1080;
    D.fcx = D.fcv.getContext('2d');
    D.fFrame = -1;
    // seal light (34% x 16% of the film, centred on the rim) — in film px, scales with the film
    D.seal = el('div', 'bvx-abs bvx-blend', D.film, `left:${1920 * 0.33}px;top:${1080 * RIM - 1080 * 0.08}px;width:${1920 * 0.34}px;height:${1080 * 0.16}px`);
    D.sealLine = el('div', 'bvx-abs', D.seal, `width:100%;top:48%;height:3%;border-radius:50%;background:linear-gradient(90deg,transparent,#ae82ff80 18%,#e3d4ff 50%,#ae82ff80 82%,transparent)`);
    D.sealGlow = el('div', 'bvx-abs', D.seal, `width:100%;height:100%;background:radial-gradient(ellipse,#d6c1ff50,#8f55ff25 32%,transparent 70%)`);
    D.release = el('div', 'bvx-abs bvx-blend', D.film, `left:${1920 * 0.31}px;top:${1080 * 0.51 - 1080 * 0.145}px;width:${1920 * 0.38}px;height:${1080 * 0.29}px;opacity:0;
      background:radial-gradient(ellipse,#d8c4ff40,#9470ff22 40%,transparent 72%)`);
    // anamorphic streak along the seam at the release
    D.streak = el('div', 'bvx-abs bvx-blend', world, `left:${G.pivot.x - G.W * 0.7}px;top:${G.pivot.y - 70}px;width:${G.W * 1.4}px;height:140px;opacity:0`);
    el('div', 'bvx-abs', D.streak, `width:100%;height:100%;border-radius:50%;background:radial-gradient(closest-side,rgba(178,154,255,.5),rgba(119,147,255,.18) 45%,transparent)`);
    el('div', 'bvx-abs', D.streak, `top:63px;width:100%;height:14px;border-radius:50%;background:linear-gradient(90deg,transparent 6%,${BRIDGE[0]}88 30%,#efe9ff 50%,${BRIDGE[2]}88 70%,transparent 94%)`);
    // shade over the film so the type stays legible
    D.shade = el('div', 'bvx-abs', world, `left:${-400}px;top:${-400}px;width:${G.W + 800}px;height:${G.H + 800}px;pointer-events:none;opacity:0;
      background:${G.P ? `linear-gradient(180deg,transparent ${400 + G.pivot.y + 70}px,rgba(2,2,3,.88) ${400 + G.pivot.y + 250}px,#020203 ${400 + G.pivot.y + 420}px)` : `linear-gradient(90deg,transparent ${400 + 1050}px,rgba(2,2,3,.82) ${400 + 1420}px,#020203)`}`);

    // coin: halo, bloom, coin canvas (clipped below the rim while inside the case), ring, chip
    const D0 = G.D;
    D.halo = el('div', 'bvx-abs', world, `width:${D0 * 2}px;height:${D0 * 2}px;border-radius:50%;opacity:0;will-change:transform,opacity;
      background:radial-gradient(closest-side,rgba(170,140,255,.40),rgba(118,96,224,.20) 40%,rgba(77,90,200,.07) 64%,transparent)`);
    D.bloomBack = el('div', 'bvx-abs bvx-blend', world, `width:1100px;height:1100px;border-radius:50%;opacity:0;will-change:transform,opacity;
      background:radial-gradient(closest-side,#fff,rgba(236,228,255,.9) 14%,rgba(190,168,255,.6) 30%,rgba(133,92,255,.28) 52%,rgba(119,147,255,.09) 74%,transparent)`);
    D.clip = el('div', 'bvx-abs', world, `width:${G.W}px;height:${G.H}px`);
    D.coinEl = el('div', 'bvx-abs', D.clip, `width:${D0}px;height:${D0}px;will-change:transform,opacity`);
    D.ccv = el('canvas', '', D.coinEl, `position:absolute;left:0;top:0;width:${D0}px;height:${D0}px`);
    D.ccx = D.ccv.getContext('2d');
    D.ring = el('div', 'bvx-abs bvx-blend', world, `width:${D0 * 1.5}px;height:${D0 * 1.5}px;border-radius:50%;opacity:0;will-change:transform,opacity;
      background:radial-gradient(closest-side,transparent 56%,rgba(214,200,255,.22) 62%,rgba(240,234,255,.85) 66.5%,rgba(178,154,255,.32) 72%,rgba(133,92,255,.1) 84%,transparent)`);
    // vault choice: a line of light across the case mouth
    D.lidLine = el('div', 'bvx-abs bvx-blend', world, `width:${G.P ? 760 : 820}px;height:60px;opacity:0;border-radius:50%;
      background:radial-gradient(closest-side,rgba(239,233,255,.95),rgba(178,154,255,.45) 35%,rgba(119,147,255,.12) 65%,transparent)`);
    // buyback quote: the gold ring meter (the ONE gold accent of that view)
    const RR = D0 * 0.56;
    D.meter = el('div', 'bvx-abs', world, `width:${RR * 2 + 40}px;height:${RR * 2 + 40}px;opacity:0;pointer-events:none`,
      `<svg width="${RR * 2 + 40}" height="${RR * 2 + 40}" viewBox="0 0 ${RR * 2 + 40} ${RR * 2 + 40}" style="overflow:visible">` +
      `<circle cx="${RR + 20}" cy="${RR + 20}" r="${RR}" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="5"/>` +
      `<circle class="arc" cx="${RR + 20}" cy="${RR + 20}" r="${RR}" fill="none" stroke="${GOLD}" stroke-width="7" stroke-linecap="round"
        transform="rotate(-90 ${RR + 20} ${RR + 20})" style="filter:drop-shadow(0 0 10px rgba(230,180,90,.75))"
        stroke-dasharray="${(2 * Math.PI * RR).toFixed(2)}" stroke-dashoffset="${(2 * Math.PI * RR).toFixed(2)}"/></svg>`);
    D.meterArc = D.meter.querySelector('.arc');
    D.meterC = 2 * Math.PI * RR;
    D.meterHead = el('div', 'bvx-abs bvx-blend', D.meter, `width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:radial-gradient(closest-side,#fff6dd,rgba(230,180,90,.7) 40%,transparent)`);

    // glitter + burst canvas
    D.gcv = el('canvas', '', world, `position:absolute;left:0;top:0;width:${G.W}px;height:${G.H}px;pointer-events:none`);
    D.gcx = D.gcv.getContext('2d');

    // the hold ring around the clasp (gold = the action of the sealed view)
    D.hold = el('div', 'bvx-abs', world, `width:180px;height:180px;margin:-90px 0 0 -90px;pointer-events:none;will-change:transform,opacity`,
      `<svg width="180" height="180" viewBox="0 0 180 180" style="overflow:visible">
        <circle class="pulse" cx="90" cy="90" r="52" fill="none" stroke="${GOLD}" stroke-width="1.5" opacity="0"/>
        <circle cx="90" cy="90" r="52" fill="none" stroke="rgba(230,180,90,.28)" stroke-width="2.5"/>
        <circle class="arc" cx="90" cy="90" r="52" fill="none" stroke="${GOLD}" stroke-width="4" stroke-linecap="round" transform="rotate(-90 90 90)"
          stroke-dasharray="${(2 * Math.PI * 52).toFixed(2)}" stroke-dashoffset="${(2 * Math.PI * 52).toFixed(2)}" style="filter:drop-shadow(0 0 8px rgba(230,180,90,.8))"/>
        <circle class="focus" cx="90" cy="90" r="64" fill="none" stroke="${VIOLET_LT}" stroke-width="3" opacity="0"/>
      </svg>`);
    D.holdArc = D.hold.querySelector('.arc'); D.holdPulse = D.hold.querySelector('.pulse'); D.holdFocus = D.hold.querySelector('.focus');
    D.holdC = 2 * Math.PI * 52;

    // flash + grain
    D.flash = el('div', 'bvx-abs', st, `width:${G.W}px;height:${G.H}px;pointer-events:none;opacity:0;background:radial-gradient(70% 60% at 50% 50%,#f3eeff,#b9a4ff 60%,#6d5bd0)`);
    D.grain = el('div', 'bvx-grain', st);
    D.grain.style.backgroundImage = 'url(' + grainURL() + ')';

    buildUI(G);
    setScale();
    D.fFrame = -1;
  }

  let GRAIN = null;
  function grainURL() {
    if (GRAIN) return GRAIN;
    const c = document.createElement('canvas'); c.width = c.height = 192;
    const x = c.getContext('2d'), id = x.createImageData(192, 192), r = mulberry(99);
    for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    x.putImageData(id, 0, 0);
    return (GRAIN = c.toDataURL());
  }

  function buildUI(G) {
    const P = G.P, ui = D.ui = el('div', 'bvx-ui', D.stage);
    const fs = (l, p) => (P ? p : l) + 'px';

    /* header: brand (left) · Skip / Sound / Close (right) */
    const hy = P ? G.safe.t + 6 : 44;
    const brand = el('div', 'bvx-abs', ui, `left:${G.safe.l}px;top:${hy}px;display:flex;align-items:center;gap:${P ? 18 : 14}px`);
    brand.innerHTML = markSVG(P ? 50 : 40) +
      `<div style="line-height:1"><div style="font-weight:700;letter-spacing:.18em;font-size:${fs(22, 32)}">BIFROST</div>` +
      `<div style="margin-top:${P ? 8 : 6}px;font-weight:600;letter-spacing:.3em;font-size:${fs(12, 17)};color:${LAV}">THE VAULT REVEAL</div></div>`;
    const hbar = el('div', 'bvx-abs', ui, `right:${G.W - G.safe.r}px;left:auto;top:${hy - (P ? 2 : 2)}px;display:flex;gap:${P ? 16 : 12}px;font-size:${fs(18, 30)}`);
    const hb = (label, icon) => { const b = el('button', 'bvx-hbtn', hbar, `height:${P ? 74 : 48}px;padding:0 ${P ? 26 : 20}px`); b.type = 'button'; b.innerHTML = icon + '<span>' + label + '</span>'; return b; };
    D.bSkip = hb('Skip', ICON.skip);
    D.bSound = hb('Sound off', ICON.sndOff);
    D.bClose = hb('Close', ICON.close);
    D.bClose.setAttribute('aria-label', 'Close the free preview');
    D.bSkip.addEventListener('click', skip);
    D.bSound.addEventListener('click', toggleSound);
    D.bClose.addEventListener('click', () => close());
    renderSound();

    /* sealed block: copy + odds */
    const sw = P ? G.W - 2 * G.safe.l : 560;
    const sx = P ? G.safe.l : 115, sy = P ? 350 : 300;
    const sealed = D.sealedText = el('div', 'bvx-abs bvx-fade', ui, `left:${sx}px;top:${sy}px;width:${sw}px;text-align:${P ? 'center' : 'left'}`);
    el('div', 'bvx-eyebrow', sealed, `font-size:${fs(19, 27)}`, 'Sealed case · ' + (COL.name || 'Eye of the Unknown'));
    const hwrap = el('div', '', sealed, `position:relative;margin-top:${P ? 22 : 22}px;height:${P ? 168 : 160}px`);
    D.h1 = ['Every coin has a story.', 'A moment of possibility.', 'Here it comes.'].map(t =>
      el('h2', 'bvx-h1 bvx-abs bvx-fade', hwrap, `width:100%;font-size:${fs(74, 80)};${P ? 'left:0;text-align:center' : ''}`, t));
    D.sealBody = el('p', 'bvx-body', sealed, `margin:${P ? 6 : 18}px 0 0;font-size:${fs(27, 36)}`,
      'One coin inside. Five possible designs.');
    D.hint = el('p', 'bvx-body', sealed, `margin:${P ? 16 : 26}px 0 0;font-size:${fs(23, 33)};color:${WHITE};display:flex;align-items:center;gap:.6em;${P ? 'justify-content:center' : ''}`,
      `<span style="display:inline-block;width:.62em;height:.62em;border-radius:50%;border:2px solid ${GOLD};box-shadow:0 0 12px rgba(230,180,90,.6)"></span>` +
      `<span>Press and hold the clasp to open</span>`);

    // chances shown before you buy: the five, 1 in 5 each IN THIS PREVIEW (real cases allocate
    // from the remaining pool, so the line is scoped to the preview and set small, never a headline)
    const ow = P ? G.W - 2 * G.safe.l : 500;
    const ox = P ? G.safe.l : G.safe.r - ow, oy = P ? 1196 : 318;
    const odds = D.odds = el('div', 'bvx-abs bvx-fade', ui, `left:${ox}px;top:${oy}px;width:${ow}px;text-align:${P ? 'center' : 'left'}`);
    el('div', 'bvx-eyebrow', odds, `font-size:${fs(17, 26)};color:${SEC}`, 'Chances shown before you buy');
    el('div', 'bvx-body', odds, `margin-top:${P ? 10 : 12}px;font-size:${fs(21, 29)};color:${WHITE}`, ODDS + '.');
    const tw = P ? 124 : 84, gap = (ow - 5 * tw) / 4;
    const row = el('div', '', odds, `position:relative;height:${P ? 210 : 168}px;margin-top:${P ? 20 : 24}px`);
    COINS.forEach((c, i) => {
      const th = el('div', 'bvx-thumb', row, `left:${i * (tw + gap) - 30}px;top:0;width:${tw + 60}px;padding:0 30px;font-size:${fs(12.5, 21)}`);
      const im = el('img', '', th); im.alt = ''; im.src = c.file; im.draggable = false;
      el('b', '', th, '', c.name);
      el('span', 'bvx-mono', th, `font-size:${fs(13, 21)}`, '1 in ' + N);
    });
    if (!P) el('div', 'bvx-body', odds, 'font-size:18px', METAL + ' · edition of ' + EDITION + ' per design');

    /* the clasp button covers the case */
    const cb = D.clasp = el('button', 'bvx-clasp', ui);
    cb.type = 'button';
    cb.setAttribute('aria-label', 'Open the case: press the clasp, or press Enter. Free preview, no purchase.');
    cb.addEventListener('pointerdown', onPress);
    cb.addEventListener('pointerup', onRelease);
    cb.addEventListener('pointercancel', onRelease);
    cb.addEventListener('lostpointercapture', onRelease);
    cb.addEventListener('focus', () => { D.holdFocused = true; });
    cb.addEventListener('blur', () => { D.holdFocused = false; });

    /* result block */
    const rx = P ? G.safe.l : 1180, rw = P ? G.W - 2 * G.safe.l : G.safe.r - 1180;
    const ry = P ? 968 : 196;
    const res = D.resText = el('div', 'bvx-abs', ui, `left:${rx}px;top:${ry}px;width:${rw}px;text-align:${P ? 'center' : 'left'}`);
    const arr = D.arrive = [];
    arr.push(el('div', 'bvx-eyebrow bvx-fade', res, `font-size:${fs(19, 27)}`, 'Revealed from the vault'));
    D.name = el('h2', 'bvx-h1 bvx-fade', res, `margin-top:${P ? 12 : 18}px;font-size:${fs(124, 104)};letter-spacing:-.03em;white-space:nowrap`, '');
    D.nameBase = P ? 104 : 124; D.nameW = rw;
    arr.push(D.name);
    arr.push(el('div', 'bvx-mono bvx-fade', res, `margin-top:${P ? 10 : 16}px;font-size:${fs(22, 27)};color:${SEC};text-transform:uppercase;letter-spacing:.14em`, METAL + ' · edition of ' + EDITION));
    arr.push(el('p', 'bvx-body bvx-fade', res, `margin:${P ? 18 : 26}px 0 0;font-size:${fs(30, 34)};color:${WHITE}`,
      'Your exact coin. Keep it vaulted, list it, or bring it home.'));
    // the four choices
    const bw = P ? (rw - 20) / 2 : (rw - 18) / 2, bh = 88, rg = P ? 14 : 18;
    const by = P ? 1250 - ry : 520 - ry;
    const box = el('div', 'bvx-fade', res, `position:absolute;left:0;top:${by}px;width:${rw}px;height:${bh * 2 + rg}px`);
    arr.push(box);
    D.choices = [
      { id: 'vault', label: 'Keep it vaulted', icon: ICON.vault },
      { id: 'list', label: 'List it', icon: ICON.tag },
      { id: 'home', label: 'Bring it home', icon: ICON.truck },
      { id: 'buyback', label: BUY.pct + '% buyback quote', icon: ICON.ring }   // basis + terms shown right under the grid
    ].map((c, i) => {
      const b = el('button', 'bvx-choice', box, `left:${(i % 2) * (bw + (P ? 20 : 18))}px;top:${Math.floor(i / 2) * (bh + rg)}px;width:${bw}px;height:${bh}px;font-size:${fs(24, 34)}`);
      b.type = 'button'; b.setAttribute('aria-pressed', 'false');
      b.innerHTML = c.icon + '<span>' + c.label + '</span>';
      b.addEventListener('click', () => choose(c.id));
      return Object.assign(c, { b });
    });
    // the 80% always travels with its basis and terms while the choices are visible
    const basisTop = by + bh * 2 + rg + (P ? 10 : 16);
    D.basis = el('div', 'bvx-body', box, `position:absolute;left:0;top:${basisTop - by}px;width:${rw}px;font-size:${fs(19, 25)};color:${SEC};text-align:${P ? 'center' : 'left'}`,
      BUY_BASIS);
    const again = D.again = el('button', 'bvx-again bvx-fade', res, `left:${P ? '50%' : '0'};top:${basisTop + (P ? 30 : 44)}px;font-size:${fs(24, 32)};${P ? 'transform:translateX(-50%)' : ''}`);
    again.type = 'button'; again.innerHTML = ICON.again + '<span>Open another</span>';
    again.addEventListener('click', openAnother);
    arr.push(again);

    /* confirmation chip (docks under the coin) */
    D.chip = el('div', 'bvx-chip', ui, `font-size:${fs(25, 32)};opacity:0`);
    D.chip.setAttribute('aria-hidden', 'true');

    /* footer: the demo label (always visible) */
    const fy = P ? G.safe.b - 34 : G.H - 66;
    D.footer = el('div', 'bvx-abs', ui, `left:0;width:${G.W}px;top:${fy}px;display:flex;justify-content:center`);
    el('div', 'bvx-pill', D.footer, `font-size:${fs(15, 21)};padding:${P ? '9px 26px 9px 10px' : '6px 22px 6px 8px'}`, '<b class="bvx-18" aria-hidden="true">18+</b>' + LABEL);
    if (!P) {
      el('div', 'bvx-abs bvx-eyebrow', ui, `left:${G.safe.l}px;top:${fy + 12}px;font-size:13px;color:#7D879A;letter-spacing:.24em`, 'Bifrost Vault · One opening. One physical coin.');
      el('div', 'bvx-abs bvx-mono', ui, `left:auto;right:${G.W - G.safe.r}px;top:${fy + 10}px;font-size:15px;color:#7D879A`, DOMAIN);
    }

    D.live = el('div', 'bvx-sr', ui); D.live.setAttribute('aria-live', 'polite');
    D.loading = el('div', 'bvx-loading', ui, `font-size:${fs(18, 26)}`, 'Opening your case…');
    D.loading.setAttribute('aria-hidden', 'true');
  }

  function setScale() {
    if (!D || !D.stage) return;
    const vw = window.innerWidth, vh = window.innerHeight, G = D.G;
    const s = Math.min(vw / G.W, vh / G.H);
    D.scale = s;
    D.stage.style.transform = `scale(${s}) translate(${-G.W / 2}px,${-G.H / 2}px)`;
    // canvases: internal resolution follows the on-screen size (capped)
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rs = clamp(s * dpr, 0.35, 1.5);
    D.rs = rs;
    D.gcv.width = Math.round(G.W * rs); D.gcv.height = Math.round(G.H * rs);
    const cs = clamp(s * dpr, 0.4, 2);
    D.ccv.width = D.ccv.height = Math.round(G.D * cs);
    D.cs = cs;
  }

  function onResize() {
    if (!S.open) return;
    const p = window.innerWidth < window.innerHeight;
    if (p !== portrait) { portrait = p; build(); }
    else setScale();
    paint();
  }

  /* ── interaction ─────────────────────────────────────────────────────────── */
  function startCharge() {
    if (S.phase !== 'sealed') return false;
    if (now() - S.resetT < 0.25) return false;
    S.coin = drawIndex();
    loadTurn(COINS[S.coin].id);
    S.choice = null;
    S.announced = false; S.skipFocused = false; clearName();
    if (reduced()) { S.phase = 'open'; S.t0 = now() - O_RESULT - PAN_DUR; announceResult(); return true; }
    S.phase = 'charge'; S.charge = 0; S.t0 = now();
    say('Opening the case.');
    S.chimed = false;
    if (S.sound) actx();
    audioStart(F_IDLE / FILM_FPS);
    return true;
  }
  function onPress(e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    try { D.clasp.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    try { D.clasp.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
    if (startCharge() || S.phase === 'charge') { S.holding = true; S.auto = false; }
  }
  function onRelease() {
    if (S.phase === 'charge') { S.holding = false; S.auto = true; }   // a tap opens too: the charge completes on its own
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); if (S.phase === 'charge' || (S.phase === 'open' && now() - S.t0 < O_RESULT)) skip(); else close(); return; }
    if (e.key === 'Tab') { trapTab(e); return; }
    if (e.target === D.clasp && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) {
      e.preventDefault();
      if (e.repeat) return;
      if (startCharge() || S.phase === 'charge') { S.holding = true; S.auto = false; }
      const up = ev => { if (ev.key === e.key) { onRelease(); document.removeEventListener('keyup', up, true); } };
      document.addEventListener('keyup', up, true);
    }
  }
  function focusables() {
    return Array.from(D.root.querySelectorAll('button')).filter(b => !b.disabled && b.offsetParent !== null && b.style.visibility !== 'hidden' && b.tabIndex >= 0);
  }
  function trapTab(e) {
    const f = focusables(); if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
  }
  function skip() {
    if (S.phase === 'sealed') return;
    if (S.phase === 'charge') { S.phase = 'open'; }
    S.t0 = now() - O_RESULT - PAN_DUR;
    S.chimed = true;
    audioStop();
    announceResult();
  }
  function choose(id) {
    S.choice = id; S.choiceT = now();
    D.choices.forEach(c => c.b.setAttribute('aria-pressed', String(c.id === id)));
    fillChip(id);
    say(chipText(id).map(x => x.replace(/\.$/, '')).join('. ') + '. Preview only.');
  }
  function openAnother() {
    S.phase = 'sealed'; S.charge = 0; S.choice = null; S.holding = false; S.auto = false;
    S.resetT = now(); S.resultFocused = false; S.announced = false; S.skipFocused = false;
    clearName();
    D.choices.forEach(c => c.b.setAttribute('aria-pressed', 'false'));
    say('A new sealed case.');
    setActive(D.clasp, true);
    D.clasp.focus({ preventScroll: true });
  }
  function clearName() { if (D && D.name) { D.name.textContent = ''; D.name.setAttribute('aria-hidden', 'true'); } }
  function setName() {
    const c = COINS[S.coin];
    D.name.removeAttribute('aria-hidden');
    D.name.textContent = c.name + '.';
    D.name.style.fontSize = D.nameBase + 'px';
    const w = D.name.scrollWidth;
    if (w > D.nameW) D.name.style.fontSize = Math.floor(D.nameBase * D.nameW / w) + 'px';
  }
  function announceResult() {
    const c = COINS[S.coin];
    setName();
    S.announced = true;
    say('Revealed from the vault: ' + c.name + '. ' + LABEL + '. Choices: keep it vaulted, list it, bring it home, or a buyback quote of ' + BUY.pct + '% ' + BUY.basisLabel + ', terms apply.');
  }
  function say(t) { if (D && D.live) { D.live.textContent = ''; D.live.textContent = t; } }

  function chipText(id) {
    if (id === 'vault') return ['Kept vaulted.', VAULT];
    if (id === 'list') return ['Listed for collectors.', 'On ' + CHAIN + ' · you set the asking price'];
    if (id === 'home') return ['On its way home.', 'Ship home · tracked'];
    return ['Your buyback quote.', BUY.pct + '% ' + BUY.basisLabel + ' · terms apply'];
  }
  function fillChip(id) {
    const t = chipText(id), ic = { vault: ICON.vault, list: ICON.tag, home: ICON.truck, buyback: ICON.ring }[id];
    D.chip.className = 'bvx-chip' + (id === 'buyback' ? ' gold' : '');
    D.chip.innerHTML = `<div class="ic">${ic}</div><div><b>${t[0]}</b><span>${t[1]}</span></div><em>Preview</em>`;
    D.chipW = 0;
  }

  /* ── sound: the film's own track (muted by default, like the app) ────────── */
  let AUD = null;
  function audioEl() {
    if (!AUD) { try { AUD = new Audio('assets/sound/box-film-audio.wav'); AUD.preload = 'auto'; } catch (e) { AUD = null; } }
    return AUD;
  }
  function audioStart(at) {
    if (!S.sound) return;
    const a = audioEl(); if (!a) return;
    try { a.currentTime = at; a.volume = 1; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  }
  // packChimes.ts (silver): a soft C6 bell with a fifth, ~1.1 s, when the coin clears the rim
  let ACX = null;
  function actx() {
    if (ACX) return ACX;
    try { const C = window.AudioContext || window.webkitAudioContext; if (C) ACX = new C(); } catch (e) { ACX = null; }
    return ACX;
  }
  function chime() {
    const c = actx(); if (!c) return;
    try {
      if (c.state === 'suspended') c.resume();
      const t0 = c.currentTime + 0.01, out = c.createGain();
      out.gain.value = 0.16; out.connect(c.destination);
      [[1046.5, 1, 1.4], [1568, 0.45, 1.1], [2093, 0.22, 0.8], [2637, 0.1, 0.6]].forEach(([f, a, d]) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(a, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t0 + d);
        o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + d + 0.05);
      });
    } catch (e) { /* ignore */ }
  }
  function audioSeek(at) { if (!S.sound || !AUD) return; try { AUD.currentTime = at; } catch (e) { /* ignore */ } }
  function audioStop() { if (AUD) { try { AUD.pause(); } catch (e) { /* ignore */ } } }
  function toggleSound() {
    S.sound = !S.sound;
    renderSound();
    if (!S.sound) audioStop();
    else actx();
    if (S.sound && S.phase === 'charge') audioStart(F_IDLE / FILM_FPS + S.charge * 1.5);
  }
  function renderSound() {
    if (!D || !D.bSound) return;
    D.bSound.innerHTML = (S.sound ? ICON.sndOn : ICON.sndOff) + '<span>' + (S.sound ? 'Sound on' : 'Sound off') + '</span>';
    D.bSound.setAttribute('aria-pressed', String(S.sound));
  }

  /* ── the frame ───────────────────────────────────────────────────────────── */
  function tick() {
    S.raf = 0;
    if (!S.open) return;
    const t = now(), dt = clamp(t - S.lastT, 0, 0.1);
    S.lastT = t;
    if (S.phase === 'charge') {
      if (S.holding || S.auto) S.charge = clamp(S.charge + dt / CHARGE_DUR);
      if (S.charge >= 1) { S.phase = 'open'; S.t0 = t; audioSeek(2.65); }
    }
    S.sealPh += dt / (S.phase === 'charge' ? 1.1 : 1.7);
    if (S.phase === 'open' && !S.chimed && t - S.t0 >= O_CLEAR) { S.chimed = true; if (S.sound && t - S.t0 < O_CLEAR + 0.3) chime(); }
    paint();
    S.raf = requestAnimationFrame(tick);
  }

  function drawFilm(i) {
    i = clamp(Math.round(i), 0, F_FREEZE);
    let im = FRAMES[i];
    if (!ok(im)) {                                // nearest loaded frame (never a black flash)
      for (let k = 1; k < 40 && !ok(im); k++) im = ok(FRAMES[i - k]) ? FRAMES[i - k] : FRAMES[i + k];
    }
    if (!ok(im)) return false;
    if (D.fImg === im) return true;
    D.fcx.drawImage(im, 0, 0, 1920, 1080);
    D.fImg = im;
    return true;
  }

  function drawCoin(id, yaw, sweep) {
    const c = D.ccx, n = D.ccv.width, R = n / 2;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, n, n);
    const yawC = clamp(yaw, -28, 28);
    if (S.turn && turnReady(id)) {
      const f = (yawC + 40) / 2, fi = clamp((f - 6) / 2, 0, TURN_IDX.length - 1);
      const i0 = Math.floor(fi), w = fi - i0, sz = n / TURN_DISC, o = (n - sz) / 2;
      c.globalAlpha = 1; c.drawImage(TURN[id][i0], o, o, sz, sz);
      if (w > 0.01 && TURN[id][i0 + 1]) { c.globalAlpha = w; c.drawImage(TURN[id][i0 + 1], o, o, sz, sz); }
      c.globalAlpha = 1;
    } else {
      const face = img(FACE_SRC(id)).im;
      const src = ok(face) ? face : img(COINS.find(x => x.id === id).file).im;
      if (!ok(src)) return;
      const disc = src === face ? FACE_DISC : 0.872;
      const a = yawC * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
      const dir = yawC >= 0 ? 1 : -1;
      const r = R * 0.985;
      const edge = 2 * r * 0.075 * Math.abs(sn);
      const fx = R + dir * edge / 2;
      // the reeded edge (stacked ellipses, darker toward the back)
      const steps = Math.max(1, Math.ceil(edge / 1.5));
      for (let k = 0; k <= steps; k++) {
        const u = k / steps;
        c.beginPath();
        c.ellipse(R - dir * edge / 2 + dir * edge * u, R, r * cs, r, 0, 0, Math.PI * 2);
        const g = c.createLinearGradient(0, R - r, 0, R + r);
        const L = Math.round(lerp(46, 120, u));
        g.addColorStop(0, `rgb(${L + 30},${L + 30},${L + 36})`); g.addColorStop(0.45, `rgb(${L},${L},${L + 6})`); g.addColorStop(1, `rgb(${L * 0.5 | 0},${L * 0.5 | 0},${L * 0.55 | 0})`);
        c.fillStyle = g; c.fill();
      }
      c.setTransform(cs, 0, 0, 1, fx * (1 - cs), 0);
      const sz = 2 * r / disc;
      c.drawImage(src, fx - sz / 2, R - sz / 2, sz, sz);
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    // specular sweep across the relief
    if (sweep > 0 && sweep < 1) {
      c.globalCompositeOperation = 'source-atop';
      const x = lerp(-0.6, 1.6, sweep) * n;
      const g = c.createLinearGradient(x - n * 0.35, 0, x + n * 0.1, n * 0.45);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(240,236,255,.30)'); g.addColorStop(0.56, 'rgba(255,255,255,.42)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, n, n);
      c.globalCompositeOperation = 'source-over';
    }
  }

  function paint() {
    if (!D || !D.stage) return;
    const G = D.G, t = now(), RM = reduced();
    const ph = S.phase;
    const charge = ph === 'charge' ? S.charge : ph === 'open' ? 1 : 0;
    const u = ph === 'open' ? t - S.t0 : -1;           // seconds since the release
    const inResult = ph === 'open' && u >= O_RESULT;
    const reset = clamp((t - S.resetT) / 0.6);          // "Open another" fade-in

    /* film frame + camera */
    let frame, Sc;
    if (ph === 'sealed') { frame = F_IDLE; Sc = G.S[0]; }
    else if (ph === 'charge') { frame = lerp(F_IDLE, F_CHARGE, ioSine(charge)); Sc = lerp(G.S[0], G.S[1], ioSine(charge)); }
    else {
      if (u < O_LATCH) frame = lerp(F_CHARGE, F_LATCH, u / O_LATCH);
      else { const p = range(u, O_LATCH, O_FREEZE); frame = lerp(F_LATCH, F_FREEZE, 0.55 * p + 0.45 * oCubic(p)); }
      Sc = lerp(G.S[1], G.S[2], oCubic(range(u, 0, O_FREEZE + 0.6)));
    }
    if (!RM && ph === 'sealed') Sc *= 1 + 0.012 * (0.5 - 0.5 * Math.cos(t * 2 * Math.PI / 9));   // the slow push-in, breathing
    const loaded = drawFilm(frame);
    D.loading.style.opacity = loaded ? '0' : '1';
    const pan = RM && inResult ? 1 : E_BRAND(range(u, O_PAN, O_PAN + PAN_DUR));
    const filmO = (ph === 'open' ? lerp(1, G.filmDim, smooth(range(u, O_RISE + 0.3, O_PAN + PAN_DUR))) : 1) * (ph === 'sealed' ? reset : 1);
    D.film.style.transform = `scale(${Sc.toFixed(4)})`;
    D.film.style.opacity = filmO.toFixed(3);
    D.ambient.style.opacity = (0.6 + 0.4 * charge).toFixed(3);
    D.shade.style.opacity = (pan).toFixed(3);

    /* world: pan + shake */
    let shx = 0, shy = 0;
    if (!RM && ph === 'open') {
      const sh = (a, t0, dec) => { const k = u - t0; if (k < 0 || k > dec) return; const e = a * Math.pow(1 - k / dec, 2); shx += e * Math.sin(k * 71 + t0); shy += e * Math.cos(k * 63 + 2 * t0); };
      sh(5, O_LATCH, 0.4); sh(7, O_CLEAR, 0.55);
    }
    const px = G.pan.x * pan + shx, py = G.pan.y * pan + shy;
    D.world.style.transform = `translate3d(${px.toFixed(2)}px,${py.toFixed(2)}px,0)`;

    /* seal light (gather .42 / charge .9 / release -> 0 over 450 ms) */
    const sk = sealAt(S.sealPh);
    let so = ph === 'sealed' ? 0.42 : ph === 'charge' ? lerp(0.42, 0.9, charge) : 0.9 * (1 - range(u, 0, 0.45));
    if (ph === 'sealed') so *= reset;
    D.seal.style.opacity = so.toFixed(3);
    const str = `scale(${sk.sx.toFixed(3)},${sk.sy.toFixed(3)})`;
    D.sealLine.style.transform = str; D.sealGlow.style.transform = str;
    D.sealLine.style.opacity = D.sealGlow.style.opacity = (RM ? 0.8 : sk.o).toFixed(3);
    const rel = ph === 'open' ? range(u, 0, 0.6) * (1 - 0.35 * range(u, O_FREEZE, O_PAN + 1)) : 0;
    D.release.style.opacity = rel.toFixed(3);
    D.release.style.transform = `scale(${lerp(0.82, 1, oCubic(range(u, 0, 1.4))).toFixed(3)})`;
    const stk = RM ? 0 : ph === 'open' ? env(u, 0, 0.06, 0.25, 1.1) * 0.9 + env(u, O_LATCH - 0.02, O_LATCH + 0.04, O_LATCH + 0.1, O_LATCH + 0.7) * 0.6 : 0;
    D.streak.style.opacity = stk.toFixed(3);
    D.streak.style.transform = `scaleX(${lerp(0.4, 1.15, oCubic(range(u, 0, 0.9))).toFixed(3)})`;

    /* flash (latch, bloom) */
    const fl = RM || ph !== 'open' ? 0 : Math.max(env(u, O_LATCH - 0.02, O_LATCH + 0.03, O_LATCH + 0.05, O_LATCH + 0.35) * 0.08, env(u, O_CLEAR - 0.04, O_CLEAR + 0.03, O_CLEAR + 0.06, O_CLEAR + 0.5) * 0.1);
    D.flash.style.opacity = fl.toFixed(3);
    D.grain.style.backgroundPosition = RM ? '0 0' : `${(Math.floor(t * 24) * 37) % 192}px ${(Math.floor(t * 24) * 61) % 192}px`;

    /* hold ring around the clasp */
    const cx = G.pivot.x + (CLASP.x - 960) * Sc, cy = G.pivot.y + (CLASP.y - 1080 * RIM) * Sc;
    const ho = ph === 'sealed' ? reset : ph === 'charge' ? 1 : 1 - range(u, 0, 0.3);
    D.hold.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0) scale(${(G.P ? 1.12 : 1) * lerp(1, 1.08, charge)})`;
    D.hold.style.opacity = ho.toFixed(3);
    D.holdArc.setAttribute('stroke-dashoffset', (D.holdC * (1 - charge)).toFixed(2));
    const pp = RM ? 0 : (t % 2.2) / 2.2;
    D.holdPulse.setAttribute('r', (52 + 34 * oCubic(pp)).toFixed(1));
    D.holdPulse.setAttribute('opacity', (ph === 'sealed' ? 0.7 * (1 - pp) : 0).toFixed(3));
    D.holdFocus.setAttribute('opacity', document.activeElement === D.clasp && fv(D.clasp) && ph === 'sealed' ? '1' : '0');

    /* clasp hit area: the whole case */
    const caseW = 640 * Sc, caseTop = G.pivot.y - 230 * Sc, caseBot = G.pivot.y + 250 * Sc;
    const cs = D.clasp.style;
    cs.left = (G.pivot.x - caseW / 2) + 'px'; cs.top = caseTop + 'px'; cs.width = caseW + 'px'; cs.height = (caseBot - caseTop) + 'px';
    const claspOn = ph === 'sealed' || ph === 'charge';
    setActive(D.clasp, claspOn);

    /* coin */
    const id = COINS[S.coin].id, D0 = G.D;
    const rimY = G.pivot.y;
    let cOp = 0, cy2 = rimY, csc = 0.28, yaw = -24, clipOn = true, sweep = -1;
    if (ph === 'open' && u >= O_RISE) {
      if (u - O_RISE < 0.02 && !RM) S.turn = turnReady(id);
      if (RM) S.turn = turnReady(id);
      const rp = range(u, O_RISE, O_RISE + RISE_DUR), e = E_RISE(rp);
      cOp = RM ? 1 : clamp(rp / 0.06);
      const y0 = rimY + D0 * 0.28 * 0.5 + 16;
      cy2 = lerp(y0, G.coinY, e);
      csc = lerp(0.28, 1, e);
      clipOn = rp < 0.45;
      const tr = u - (O_RISE + RISE_DUR);
      yaw = tr < 0 ? lerp(-26, 0, oCubic(rp)) : 13 * Math.sin(2 * Math.PI * tr / 9) * smooth(tr / 1.6);
      if (RM) yaw = 0;
      // float
      if (!RM && tr > 0) cy2 += 7 * Math.sin(2 * Math.PI * tr / 6) * smooth(tr / 1.2);
      // choice reactions
      if (S.choice && !RM) {
        const k = t - S.choiceT;
        if (S.choice === 'vault') { cy2 += 34 * oCubic(range(k, 0, 0.9)) * (1 - 0.0 * k); csc *= 1 - 0.06 * oCubic(range(k, 0, 0.9)); }
        if (S.choice === 'home') { cy2 -= 18 * oCubic(range(k, 0, 0.7)); }
        if (S.choice === 'list') { yaw = lerp(yaw, 0, oCubic(range(k, 0, 0.5))); }
      }
      sweep = RM ? -1 : Math.max(range(u, O_CLEAR - 0.1, O_CLEAR + 0.9), 0);
      if (tr > 2) { const sp = ((tr - 2) % 7) / 1.4; sweep = sp < 1 ? sp : -1; }
      if (S.choice && !RM) { const k = t - S.choiceT; if (k < 1.2) sweep = range(k, 0.05, 1.05); }
      if (sweep >= 1) sweep = -1;
    }
    D.coinEl.style.opacity = cOp.toFixed(3);
    D.coinEl.style.transform = `translate3d(${(G.pivot.x - D0 / 2).toFixed(1)}px,${(cy2 - D0 / 2).toFixed(1)}px,0) scale(${csc.toFixed(4)})`;
    D.clip.style.clipPath = clipOn ? `inset(0 0 ${(G.H - rimY).toFixed(1)}px 0)` : 'none';
    if (cOp > 0) drawCoin(id, yaw, sweep);
    // halo + bloom
    const hO = ph === 'open' ? (RM ? 1 : range(u, O_RISE + 0.4, O_RISE + 1.4)) : 0;
    D.halo.style.opacity = hO.toFixed(3);
    D.halo.style.transform = `translate3d(${G.pivot.x - D0}px,${(cy2 - D0).toFixed(1)}px,0) scale(${(0.6 + 0.4 * csc).toFixed(3)})`;
    const bl = RM || ph !== 'open' ? 0 : env(u, O_CLEAR - 0.06, O_CLEAR + 0.06, O_CLEAR + 0.12, O_CLEAR + 1.1);
    D.bloomBack.style.opacity = (bl * 0.85).toFixed(3);
    D.bloomBack.style.transform = `translate3d(${G.pivot.x - 550}px,${(cy2 - 550 + D0 * 0.1).toFixed(1)}px,0) scale(${lerp(0.45, 1.25, oCubic(range(u, O_CLEAR - 0.06, O_CLEAR + 1.1))).toFixed(3)},${lerp(0.4, 1.1, oCubic(range(u, O_CLEAR - 0.06, O_CLEAR + 1.1))).toFixed(3)})`;
    const rO = RM || ph !== 'open' ? 0 : env(u, O_CLEAR - 0.02, O_CLEAR + 0.1, O_CLEAR + 0.2, O_CLEAR + 1.0);
    D.ring.style.opacity = rO.toFixed(3);
    D.ring.style.transform = `translate3d(${G.pivot.x - D0 * 0.75}px,${(cy2 - D0 * 0.75).toFixed(1)}px,0) scale(${(csc * (0.9 + 0.25 * oCubic(range(u, O_CLEAR, O_CLEAR + 1)))).toFixed(3)})`;

    /* choice visuals: lid line (vault) · gold ring meter (buyback) · chip */
    const k = S.choice ? t - S.choiceT : -1;
    const ll = S.choice === 'vault' && inResult ? (RM ? 0.7 : env(k, 0.1, 0.45, 1.0, 2.4) * 0.9 + 0.25 * range(k, 1.0, 2.4)) : 0;
    D.lidLine.style.opacity = ll.toFixed(3);
    const lw = G.P ? 760 : 820;
    D.lidLine.style.transform = `translate3d(${G.pivot.x - lw / 2}px,${(rimY - 30)}px,0) scale(${lerp(0.3, 1, oCubic(range(k, 0.1, 0.8))).toFixed(3)},1)`;
    const mOn = S.choice === 'buyback' && inResult;
    const mp = mOn ? (RM ? 1 : E_BRAND(range(k, 0.1, 1.3))) : 0;
    const RR = D0 * 0.56;
    D.meter.style.opacity = (mOn ? (RM ? 1 : range(k, 0, 0.25)) : 0).toFixed(3);
    D.meter.style.transform = `translate3d(${(G.pivot.x - RR - 20).toFixed(1)}px,${(cy2 - RR - 20).toFixed(1)}px,0)`;
    const frac = BUY.pct / 100 * mp;
    D.meterArc.setAttribute('stroke-dashoffset', (D.meterC * (1 - frac)).toFixed(2));
    const ang = -Math.PI / 2 + frac * 2 * Math.PI;
    D.meterHead.style.transform = `translate3d(${(RR + 20 + RR * Math.cos(ang)).toFixed(1)}px,${(RR + 20 + RR * Math.sin(ang)).toFixed(1)}px,0)`;
    D.meterHead.style.opacity = mOn ? (1 - range(k, 1.2, 1.8) * 0.6).toFixed(3) : '0';

    // chip under the coin (in stage coords, follows the pan)
    const chO = S.choice && inResult ? (RM ? 1 : oCubic(range(k, 0.15, 0.55))) : 0;
    D.chip.style.opacity = chO.toFixed(3);
    if (chO > 0) {
      if (!D.chipW) D.chipW = D.chip.offsetWidth;
      const chipX = G.pivot.x + G.pan.x - D.chipW / 2;
      D.chip.style.transform = `translate3d(${chipX.toFixed(1)}px,${(G.chipY + 14 * (1 - chO)).toFixed(1)}px,0)`;
    }

    /* glitter (mouth stream from the freeze; burst at the bloom; dust in the result) */
    paintGlitter(G, Sc, u, ph, RM, cy2);

    /* type */
    const sealedO = ph === 'sealed' ? reset : ph === 'charge' ? 1 : 1 - range(u, O_FREEZE - 0.3, O_FREEZE);
    D.sealedText.style.opacity = sealedO.toFixed(3);
    const hIdx = ph === 'sealed' ? 0 : ph === 'charge' ? 1 : 2;
    const hT = ph === 'charge' ? t - S.t0 : ph === 'open' ? u : 9;
    D.h1.forEach((h, i) => {
      const o = i === hIdx ? (RM ? 1 : oCubic(range(hT, 0.08, 0.4))) : i === hIdx - 1 && ph !== 'sealed' && !RM ? 1 - range(hT, 0, 0.12) : 0;
      h.style.opacity = o.toFixed(3);
      h.style.transform = `translate3d(0,${(10 * (1 - o)).toFixed(1)}px,0)`;
    });
    D.sealBody.style.opacity = D.hint.style.opacity = (ph === 'sealed' ? 1 : ph === 'charge' ? 1 - range(hT, 0, 0.3) : 0).toFixed(3);
    const oddsO = ph === 'sealed' ? reset : ph === 'charge' ? 1 - 0.45 * charge : 0.55 * (1 - range(u, 0, 0.4));
    D.odds.style.opacity = oddsO.toFixed(3);
    D.odds.style.transform = `translate3d(0,${(ph === 'open' ? -12 * range(u, 0, 0.4) : 0).toFixed(1)}px,0)`;
    setActive(D.bSkip, ph === 'charge' || (ph === 'open' && !inResult));
    // the clasp leaves the tab order when the case opens: hand focus to Skip (never to <body>)
    if (ph === 'open' && !inResult && !S.skipFocused) {
      S.skipFocused = true;
      const ae = document.activeElement;
      if (!ae || ae === document.body || ae === D.clasp || !D.root.contains(ae)) { try { D.bSkip.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    }

    // result type arrives (translateY 16 -> 0, staggered)
    D.arrive.forEach((e, i) => {
      const a = ph !== 'open' ? 0 : RM ? 1 : E_BRAND(range(u, O_RESULT - 0.35 + i * 0.09, O_RESULT + 0.3 + i * 0.09));
      e.style.opacity = a.toFixed(3);
      if (!e.classList.contains('bvx-again') || !G.P) e.style.transform = `translate3d(0,${(16 * (1 - a)).toFixed(1)}px,0)`;
      else e.style.transform = `translate3d(-50%,${(16 * (1 - a)).toFixed(1)}px,0)`;
    });
    D.choices.forEach(c => setActive(c.b, inResult));
    setActive(D.again, inResult);
    // the name is written as the result type starts to arrive (still invisible), announced once in the result
    if (ph === 'open' && u >= O_RESULT - 0.4 && !D.name.textContent) setName();
    if (inResult && !S.announced) announceResult();
    if (inResult && !S.resultFocused) {
      S.resultFocused = true;
      const ae = document.activeElement;
      if (!ae || ae === document.body || ae === D.clasp || ae === D.bSkip || !D.root.contains(ae)) D.choices[0].b.focus({ preventScroll: true });
    }
    if (ph === 'open' && u >= O_FREEZE && u < O_FREEZE + 0.2) audioStop();
  }

  function fv(e) { try { return e.matches(':focus-visible'); } catch (x) { return true; } }
  function setActive(b, on) {
    if (!b) return;
    if (b._on === on) return;
    b._on = on;
    b.style.visibility = on ? 'visible' : 'hidden';
    b.tabIndex = on ? 0 : -1;
    if (on) b.removeAttribute('aria-hidden'); else b.setAttribute('aria-hidden', 'true');
  }

  function paintGlitter(G, Sc, u, ph, RM, coinY) {
    const c = D.gcx, rs = D.rs;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, D.gcv.width, D.gcv.height);
    if (ph !== 'open' || RM) return;
    c.setTransform(rs, 0, 0, rs, 0, 0);
    c.globalCompositeOperation = 'lighter';
    // mouth stream (PackGlitter: x 50%, y 51%, width 29%, rise 30% of the film)
    const gt = u - O_FREEZE;
    if (gt > 0) {
      const sw = 1920 * 0.29 * Sc, sh = 1080 * 0.3 * Sc;
      const left = G.pivot.x - sw / 2, base = G.pivot.y + (1080 * 0.51 - 1080 * RIM) * Sc;
      const fadeIn = clamp(gt / 0.5);
      SPARKS.forEach(s => {
        const p = (((gt + s.delay) / s.dur) % 1 + 1) % 1;
        const k = sparkAt(p);
        const x = left + s.x * sw + s.drift * 1.6 * k.dx, y = base + k.dy * s.h * sh * 1.25;
        const sz = s.size * 7 * k.sc * (G.P ? 1.15 : 1);
        c.globalAlpha = k.o * fadeIn;
        c.drawImage(sprite(SPARK_COL[s.col][0], SPARK_COL[s.col][1]), x - sz, y - sz, sz * 2, sz * 2);
      });
    }
    // burst when the coin clears the rim
    const bt = u - O_CLEAR;
    if (bt > 0 && bt < 2.2) {
      const ox = G.pivot.x, oy = coinY;
      BURST.forEach(b => {
        const k = bt;
        if (k > b.life) return;
        const f = (1 - Math.exp(-b.k * k)) / b.k;
        const x = ox + b.vx * f, y = oy + b.vy * f + 40 * k * k - G.D * 0.1;
        const a = Math.pow(1 - k / b.life, 1.4);
        const sz = b.size * 6;
        c.globalAlpha = a;
        c.drawImage(sprite(SPARK_COL[b.col][0], SPARK_COL[b.col][1]), x - sz, y - sz, sz * 2, sz * 2);
      });
    }
    // fine dust drifting up around the coin in the result
    const dt = u - (O_RISE + RISE_DUR);
    if (dt > 0) {
      const R = G.D * 0.75, fi = clamp(dt / 1.5);
      DUST.forEach(d => {
        const p = ((d.ph + dt * d.sp) % 1);
        const x = G.pivot.x + d.x * R + 10 * Math.sin(dt * 0.8 + d.sw);
        const y = coinY + R * 0.9 - p * R * 2.1;
        const a = Math.sin(Math.PI * p) * 0.75 * fi;
        const sz = d.size * 5;
        c.globalAlpha = a;
        c.drawImage(sprite(SPARK_COL[d.col][0], SPARK_COL[d.col][1]), x - sz, y - sz, sz * 2, sz * 2);
      });
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  /* ── open / close ────────────────────────────────────────────────────────── */
  function open(opts) {
    portrait = window.innerWidth < window.innerHeight;
    if (!S.open) S.opener = document.activeElement;
    loadFrames(); loadFaces();
    if (!D || !D.stage || D.G.P !== portrait) build();
    S.open = true;
    S.phase = 'sealed'; S.charge = 0; S.choice = null; S.holding = false; S.auto = false; S.resultFocused = false;
    S.announced = false; S.skipFocused = false;
    S.resetT = now() - 0.2; S.lastT = now();
    D.choices.forEach(c => c.b.setAttribute('aria-pressed', 'false'));
    clearName();
    const pl = document.getElementById('bvp-player');
    S.sound = !!(pl && pl.classList.contains('is-sound'));
    renderSound();
    D.root.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    setScale();
    paint();
    try { D.clasp.focus({ preventScroll: true }); } catch (e) { D.clasp.focus(); }
    say(LABEL_SR + '. ' + ODDS + '. Press the clasp to open the case.');
    if (S.frozen == null && !S.raf) S.raf = requestAnimationFrame(tick);
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKey, true);
    return true;
  }
  function close() {
    if (!S.open) return;
    S.open = false;
    if (S.raf) cancelAnimationFrame(S.raf);
    S.raf = 0;
    audioStop();
    D.root.hidden = true;
    document.documentElement.style.overflow = '';
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey, true);
    const o = S.opener;
    S.opener = null;
    if (o && o.focus && document.contains(o)) { try { o.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }

  /* test hook for stills: freeze the clock and paint one pose */
  function pose(o) {
    o = o || {};
    if (o.portrait != null && (!D || !D.stage || o.portrait !== portrait)) { portrait = !!o.portrait; if (D && D.stage) build(); }
    S.frozen = 1000;
    if (!S.open) open();
    if (o.portrait != null && portrait !== !!o.portrait) { portrait = !!o.portrait; build(); }
    if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
    const T = 1000;
    S.coin = o.coin != null ? o.coin : 3;
    loadTurn(COINS[S.coin].id);
    S.turn = o.turn != null ? o.turn : turnReady(COINS[S.coin].id);
    S.phase = o.phase || 'sealed';
    S.charge = o.charge || 0;
    S.resetT = T - 5;
    S.t0 = S.phase === 'open' ? T - (o.u || 0) : T - (o.chargeT || 0);
    S.sealPh = o.seal != null ? o.seal : 0.46;
    S.choice = o.choice || null;
    S.choiceT = T - (o.choiceU || 0);
    D.choices.forEach(c => c.b.setAttribute('aria-pressed', String(c.id === S.choice)));
    if (S.choice) fillChip(S.choice);
    setName();
    S.resultFocused = true; S.skipFocused = true; S.announced = S.phase === 'open' && (o.u || 0) >= O_RESULT;
    S.frozen = T;
    setScale();
    paint(); paint();
    return { turn: S.turn, film: !!D.fImg };
  }
  function ready() {
    loadFrames(); loadFaces(); COINS.forEach(c => { if (TURN_IDS[c.id]) loadTurn(c.id); });
    const all = [];
    Object.keys(imgCache).forEach(k => all.push(imgCache[k].p));
    return Promise.all(all);
  }

  window.BVPlay = { open, close, isOpen: () => S.open, _pose: pose, _ready: ready };
})();
