/* ============================================================================
   06-end.js — beat 06 END CARD (25.0–30.0)
   The five real Eye of the Unknown coins (face-on renders of the client's own
   GLB models, assets/coins3d/<id>-face.webp) burst out of the hero DOMINION
   (match cut from 05) and settle into one arch — the bridge. The arc of light
   draws through them left to right (each coin lights up in its own enamel as
   the head passes), then the light lifts off the coins and condenses into the
   real Bifrost Vault mark (BVApp.mark: the bridge stroke lands, the gold ring
   draws around it — the ONE gold accent of the view), and the lockup reveals:
     25.00  final impact: punch + shake, match cut on 05's lit Dominion (05's turn render, grade, key light,
            glow and backdrop at 05's last screen pose; no flash on the cut frame); it holds 3 frames, then the
            coins fan out of it (soft flash on the burst, 25.10) and our backdrop bloom rises
     25.25  the arc of light draws through the coins (head flare + glitter trail)
     25.68  the light condenses into the mark's bridge stroke; 25.80 ring draws (CUES.logo)
     26.00  the mark lands (bloom + glitter burst); "BIFROST VAULT" + bifrostvault.io
     26.60  REAL COINS. A NEW WAY TO COLLECT.
     27.30  BY INVITATION.  27.55 "Your invitation is your way in."
     28.80  glint (CUES.glint): a white-gold glint runs the ring, a light sweep crosses the coins
   Fine print band (BV_CONFIG.finePrint.long) + 18+ badge on screen 25.0–30.0 in both formats (on with the cut,
   after 07's short line has faded, so the two never stack), on a counter-camera layer (rock-steady through the
   impact punch / shake), 20 px (16:9) / 24 px (9:16), inside the 6 % margin / the 220/320 px 9:16 safe zones.
   Pure function of t: no timers, no randomness (hash-seeded analytic glitter),
   every image preloaded with BV.preload.
   ========================================================================== */
(function () {
  'use strict';
  const K = window.BVKit, S = window.BVShared, A = window.BVApp, BV = window.BV;
  if (!K || !S || !A || !BV) { console.error('[06-end] missing BVKit/BVShared/BVApp/BV'); return; }
  const CFG = window.BV_CONFIG || {};
  const { clamp, lerp, range, ease } = K;
  const oX = ease.outExpo, oQ = ease.outQuint, oC = ease.outCubic, ioC = ease.inOutCubic, ioS = ease.inOutSine;
  const NS = 'http://www.w3.org/2000/svg';

  const C = S.CUES;
  const T_END = C.end || 25.0;              // the cut
  const T_LOGO = C.logo || 25.8;            // ring starts drawing (audio: the full chord)
  const T_GLINT = C.glint || 28.8;
  const T0 = 24.75, T1 = C.filmEnd || 30.0;
  // fine print: comes on with the cut in both formats (07's short legal line has faded out by 25.0, so the two
  // never stack; in 9:16 05's buyback subline sits exactly where the band goes); 5.0 s on screen
  const FINE_IN = T_END, FINE_RAMP = 0.15;

  // timings (global seconds)
  const HOLD = 25.083;                      // Dominion holds the 05 pose for 3 frames
  const HERO_DUR = 0.6;                     // then eases (outExpo, soft start) into its arch slot
  const FAN0 = 25.1, FAN_DUR = 0.5;         // the other four emerge from behind Dominion
  const DRAW = [25.25, 25.7];               // arc of light draws through the coins
  const FLY = [25.68, 26.0];                // the light condenses into the mark's bridge stroke
  const LIFT_B = 1.34, LIFT_C = 1.05, LIFT_S = 1.18;   // static key-light lift for the face renders (match 02)
  const LIFT = 'brightness(' + LIFT_B + ') contrast(' + LIFT_C + ') saturate(' + LIFT_S + ')';
  const SHADOW = 'drop-shadow(0 14px 22px rgba(0,0,0,.65))';
  const RING = [T_LOGO, 26.12];             // gold ring draws
  const LAND = 26.0;                        // mark lands
  const WORD = 26.12, DOMAIN = 26.36, LINE = 26.6, INV = 27.3, INVSUB = 27.55;

  const DISC = 1418 / 1600;                 // coin disc / render box (face renders)
  const WHITE = '#F6F7FC', WORDC = '#F4F3F8', SEC = '#B4BFD1', VIOLET = '#855CFF', VLT = '#B29AFF', LAV = '#BAA9E5';
  const BRIDGE = ['#67DCEA', '#7793FF', '#855CFF'];
  const GLIT = ['#e4d9ff', '#e4d9ff', '#e4d9ff', '#cff8ff', '#e4d9ff', '#e4d9ff', '#fff1d2'];
  const FLASH = 'radial-gradient(ellipse 70% 70% at 50% 45%,rgba(255,255,255,.95) 0%,rgba(212,195,255,.6) 35%,rgba(133,92,255,.25) 70%,rgba(133,92,255,0) 100%)';

  /* match cut from 05: on the cut frame Dominion is drawn exactly as 05 draws it -- the same yaw-sweep
     turn render (window.BVBox.turnImages(), shared with 04/05), 05's coin-layer grade and 05's key light +
     cool rim specular -- at 05's last screen pose with our own impact camera divided out. It hands over to
     the face render (end-card lift) while it travels into its arch slot. */
  const TURN_DISC = 976 / 1100;             // coin disc / frame size in the turn renders (= 04/05)
  const GRADE05 = 'brightness(1.08) contrast(1.05)';   // 04/05 coin-layer grade
  const XF = [HOLD, HOLD + 0.28];           // turn render -> face render hand-off
  const IMPACT_S = 0.03, IMPACT_SH = [7, 606, 8];      // impact punch / shake (amp, seed, decay)
  // the impact camera (multiplies BV.camera) at ie seconds after the cut -- one formula for update() and geometry()
  function impactCam(ie) {
    if (ie < 0 || ie >= 0.5) return { x: 0, y: 0, s: 1 };
    const sh = ie < 0.35 ? K.shake(ie, IMPACT_SH[0], IMPACT_SH[1], IMPACT_SH[2]) : { x: 0, y: 0 };
    return { x: sh.x, y: sh.y, s: 1 + IMPACT_S * (1 - oC(range(ie, 0, 0.45))) };
  }
  // stage (screen) point -> world point under camera c (inverse of film.js applyCamera incl. over-scan)
  function unCam(p, c, W, H) {
    let sc = c.s;
    if (c.x || c.y) {
      const cover = Math.max(1 + 2 * Math.abs(c.x) / W, 1 + 2 * Math.abs(c.y) / H);
      sc = sc >= 1 ? Math.max(sc, cover) : sc * cover;
    }
    return { x: W / 2 + (p.x - c.x - W / 2) / sc, y: H / 2 + (p.y - c.y - H / 2) / sc, k: sc };
  }

  const ORDER = S.ORDER || ['silence', 'ametherion', 'cycle', 'dominion', 'veritas'];
  const HERO = (S.ROLES && S.ROLES.boxReveal) || 'dominion';
  const HERO_I = Math.max(0, ORDER.indexOf(HERO));
  const COINS = ORDER.map(id => {
    const c = (A.coin && A.coin(id)) || S.coin(id) || { id, name: id, enamel: '#855CFF' };
    return { id, name: c.name, enamel: c.enamel || '#855CFF', src: 'assets/coins3d/' + id + '-face.webp' };
  });
  // Veritas' enamel is silver-white: give it a cool silver glow instead of grey
  const GLOWC = COINS.map(c => (c.id === 'veritas' ? '#C9D6EA' : c.enamel));

  const FINE = String((CFG.finePrint && CFG.finePrint.long) || '').replace(/^\s*18\+\s*·\s*/, '').replace(/ · /g, '\u00a0· ')
    .replace(/By invitation/g, 'By\u00a0invitation')
    .replace(/of (\d+) per design/g, 'of\u00a0$1\u00a0per\u00a0design');
  const BRAND = CFG.brand || {};
  const DOMAIN_TXT = BRAND.domain || 'bifrostvault.io';
  const LINE_TXT = String(BRAND.line || 'Real coins. A new way to collect.').toUpperCase();
  const ACCESS = String(BRAND.access || 'By invitation.').toUpperCase();
  const ACCESS_SUB = BRAND.accessSub || 'Your invitation is your way in.';

  /* ── helpers ──────────────────────────────────────────────────────────── */
  const f2 = n => n.toFixed(2);
  function layer(parent, css) { return K.el('div', { parent, style: 'position:absolute;left:0;top:0;pointer-events:none;' + (css || '') }); }
  function qPt(P0, Cc, P1, u) {
    const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    return { x: a * P0.x + b * Cc.x + c * P1.x, y: a * P0.y + b * Cc.y + c * P1.y };
  }
  // sub/super segment [a,b] of a quadratic (blossom) -> new control points
  function qSeg(P0, Cc, P1, a, b) {
    const k0 = (1 - a) * (1 - b), k1 = (1 - a) * b + a * (1 - b), k2 = a * b;
    return {
      P0: qPt(P0, Cc, P1, a), P1: qPt(P0, Cc, P1, b),
      C: { x: k0 * P0.x + k1 * Cc.x + k2 * P1.x, y: k0 * P0.y + k1 * Cc.y + k2 * P1.y }
    };
  }
  const qD = q => 'M ' + f2(q.P0.x) + ' ' + f2(q.P0.y) + ' Q ' + f2(q.C.x) + ' ' + f2(q.C.y) + ' ' + f2(q.P1.x) + ' ' + f2(q.P1.y);
  const lerpP = (a, b, u) => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) });

  /* ── geometry per format ──────────────────────────────────────────────── */
  function geometry(ctx) {
    const P = ctx.portrait, W = ctx.W, H = ctx.H;
    const g = P ? {
      E0: { x: 150, y: 690 }, E1: { x: 930, y: 690 }, apexY: 410, disc: 196,
      mark: { x: 540, y: 630, m: 136 },
      word: { y: 854, size: 84 }, domain: { y: 922, size: 32 },
      line: { y: 1064, size: 77, text: LINE_TXT.replace('. ', '.\n') },
      inv: { y: 1206, size: 27 }, invSub: { y: 1251, size: 32 },
      fine: { l: 64, r: W - 64, b: 1598, size: 24, lh: 1.32, badge: 64 },
      // the arch group starts bigger and lower (fills the frame while it forms), settles as the lockup arrives
      intro: { s: 1.1, dy: 300 },
      // where 05 leaves Dominion at 25.0 (pose 3, under its 1.02 camera push)
      hero: { x: 540, y: 900.6, disc: 624 }
    } : {
      E0: { x: 330, y: 596 }, E1: { x: 1590, y: 596 }, apexY: 236, disc: 232,
      mark: { x: 960, y: 442, m: 128 },
      word: { y: 576, size: 80 }, domain: { y: 638, size: 28 },
      line: { y: 724, size: 58, text: LINE_TXT },
      inv: { y: 796, size: 24 }, invSub: { y: 833, size: 27 },
      fine: { l: Math.round(W * 0.06), r: Math.round(W * 0.94), b: Math.round(H * 0.94), size: 20, lh: 1.36, badge: 56 },
      intro: { s: 1.08, dy: 56 },
      hero: { x: 592.8, y: 516.2, disc: 561 }
    };
    g.P = P; g.W = W; g.H = H;
    g.C = { x: (g.E0.x + g.E1.x) / 2, y: 2 * g.apexY - (g.E0.y + g.E1.y) / 2 };
    // coins at equal arc length along the arch
    const N = 400, pts = [], cum = [0];
    for (let i = 0; i <= N; i++) pts.push(qPt(g.E0, g.C, g.E1, i / N));
    for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const Ltot = cum[N];
    g.slots = [0, 1, 2, 3, 4].map(k => {
      const target = Ltot * k / 4;
      let j = 0; while (j < N && cum[j + 1] < target) j++;
      const u = (j + (cum[j + 1] > cum[j] ? (target - cum[j]) / (cum[j + 1] - cum[j]) : 0)) / N;
      const p = qPt(g.E0, g.C, g.E1, Math.min(1, u));
      return { x: p.x, y: p.y, u: Math.min(1, u) };
    });
    // the light path: the arch extended beyond the outer coins
    g.arc = qSeg(g.E0, g.C, g.E1, -0.16, 1.16);
    g.arcU = u => -0.16 + 1.32 * u;      // light-path param -> arch param
    // the mark's bridge stroke in stage coordinates (BrandMark: M3 24 Q16 2 29 12, viewBox 32)
    const mk = g.mark, sc = mk.m / 32, mp = (x, y) => ({ x: mk.x + (x - 16) * sc, y: mk.y + (y - 16) * sc });
    g.bridge = { P0: mp(3, 24), C: mp(16, 2), P1: mp(29, 12) };
    g.bridgeW = 3 * sc; g.ringW = 2.4 * sc;
    g.origin = { x: W / 2, y: g.apexY };
    // 05's last screen pose -> world, with our cut-frame impact camera (punch + shake at ie = 0) divided out
    const w0 = unCam(g.hero, impactCam(0), W, H);
    const hs = { x: w0.x, y: w0.y, disc: g.hero.disc / w0.k }, I = g.intro;
    g.heroG = { x: g.origin.x + (hs.x - g.origin.x) / I.s, y: g.origin.y + (hs.y - g.origin.y - I.dy) / I.s, disc: hs.disc / I.s };
    return g;
  }

  /* ── 05's Dominion, drawn the way 05 draws it (match cut) ─────────────── */
  const TURN_SRC = i => 'assets/coins3d/' + HERO + '-turn/' + String(i).padStart(2, '0') + '.webp';
  let turn = null;
  function turnImages() {
    if (!turn) {
      const shared = window.BVBox && typeof window.BVBox.turnImages === 'function' ? window.BVBox.turnImages() : null;
      turn = shared && shared.length === 41 ? shared
        : Array.from({ length: 41 }, (_, i) => { const im = new Image(); im.decoding = 'sync'; im.src = TURN_SRC(i); return im; });
    }
    return turn;
  }
  const imgOk = im => !!im && im.complete && im.naturalWidth > 0;
  function turnFrames(yaw) {
    const f = clamp((yaw + 40) / 2, 0, 40), a = Math.floor(f);
    return { a, b: Math.min(40, a + 1), u: f - a };
  }
  // the turn render at (x, y), frame box D, two neighbouring frames cross-faded (05 drawCoin, no sheen)
  function drawTurn(c, x, y, D, yaw) {
    const fr = turnFrames(yaw), im = turn && turn[fr.a], ib = turn && turn[fr.b];
    if (!imgOk(im)) return false;
    c.drawImage(im, x - D / 2, y - D / 2, D, D);
    if (fr.u > 0.02 && imgOk(ib)) { c.globalAlpha = fr.u; c.drawImage(ib, x - D / 2, y - D / 2, D, D); c.globalAlpha = 1; }
    return true;
  }
  // 05's keyLight(): soft white falloff from the upper left masked to the coin (screen) + thin cool rim specular
  let kl = null, klC = null, klKey = '';
  function keyLight(c, x, y, D, yaw) {
    const fr = turnFrames(yaw), im = turn && turn[fr.a];
    if (!imgOk(im)) return;
    const Nk = Math.max(64, Math.ceil(D / 8) * 8);
    if (!kl) { kl = document.createElement('canvas'); klC = kl.getContext('2d'); }
    const key = fr.a + '|' + Nk;
    if (klKey !== key) {
      klKey = key;
      if (kl.width !== Nk) { kl.width = Nk; kl.height = Nk; }
      klC.setTransform(1, 0, 0, 1, 0, 0);
      klC.globalCompositeOperation = 'source-over'; klC.globalAlpha = 1;
      klC.clearRect(0, 0, Nk, Nk);
      klC.drawImage(im, 0, 0, Nk, Nk);
      klC.globalCompositeOperation = 'source-in';
      const g = klC.createRadialGradient(Nk * 0.3, Nk * 0.24, 0, Nk * 0.3, Nk * 0.24, Nk * 0.72);
      g.addColorStop(0, 'rgba(255,255,255,.3)'); g.addColorStop(0.3, 'rgba(238,242,255,.16)');
      g.addColorStop(0.65, 'rgba(220,226,250,.06)'); g.addColorStop(1, 'rgba(220,226,250,0)');
      klC.fillStyle = g;
      klC.fillRect(0, 0, Nk, Nk);
    }
    c.save();
    c.globalCompositeOperation = 'screen';
    c.globalAlpha = 1;
    c.drawImage(kl, x - D / 2, y - D / 2, D, D);
    const ry = D * TURN_DISC * 0.5 - Math.max(1.5, D * 0.004), rx = ry * Math.max(0.05, Math.cos(yaw * Math.PI / 180));
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    const W1 = Math.max(1.2, D * 0.0045);
    [[W1 * 3.2, 0.1], [W1, 0.5]].forEach(([w, al]) => {
      c.lineWidth = w;
      c.strokeStyle = 'rgba(236,240,255,1)';
      c.globalAlpha = al;
      c.beginPath(); c.ellipse(x, y, rx, ry, 0, Math.PI * 1.02, Math.PI * 1.5); c.stroke();
      c.globalAlpha = al * 0.45;
      c.beginPath(); c.ellipse(x, y, rx, ry, 0, Math.PI * 0.86, Math.PI * 1.02); c.stroke();
      c.beginPath(); c.ellipse(x, y, rx, ry, 0, Math.PI * 1.5, Math.PI * 1.64); c.stroke();
    });
    c.restore();
  }

  /* inverse of film.js applyCamera on a full-stage layer (same as 07-legal.js): keeps the fine print
     rock-steady on screen through the impact punch / shake */
  function counterCamera(el, W, H) {
    const c = BV.camera || {};
    const x = +c.x || 0, y = +c.y || 0, r = +c.r || 0;
    let sc = c.s == null ? 1 : +c.s;
    if (!isFinite(sc) || sc <= 0) sc = 1;
    if (c.overscan !== false && (x || y || r)) {
      const rr = Math.abs(r) * Math.PI / 180;
      const asp = Math.max(W / H, H / W);
      const cover = Math.max(1 + 2 * Math.abs(x) / W, 1 + 2 * Math.abs(y) / H) * (Math.cos(rr) + asp * Math.sin(rr));
      sc = sc >= 1 ? Math.max(sc, cover) : sc * cover;
    }
    const tr = (x || y || r || sc !== 1)
      ? `scale(${(1 / sc).toFixed(5)})${r ? ` rotate(${(-r).toFixed(3)}deg)` : ''} translate(${(-x).toFixed(2)}px,${(-y).toFixed(2)}px)`
      : '';
    if (el.style.transform !== tr) el.style.transform = tr;
  }

  /* ── sprites for glitter / flares ─────────────────────────────────────── */
  const spriteCache = {};
  function sprite(hex) {
    if (spriteCache[hex]) return spriteCache[hex];
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.14, hex); g.addColorStop(0.4, K.rgba(hex, 0.32)); g.addColorStop(1, K.rgba(hex, 0));
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    spriteCache[hex] = cv;
    return cv;
  }

  /* analytic glitter: every particle's state is closed-form in its age */
  function glitterSet(seed, n, spawn) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const h = k => K.hash(i * 7 + k, seed);
      out.push(Object.assign({ col: GLIT[i % 7], star: i % 5 === 0, h }, spawn(i, h)));
    }
    return out;
  }
  function drawGlitter(c, set, t, alphaK) {
    for (let i = 0; i < set.length; i++) {
      const p = set[i], age = t - p.t0;
      if (age < 0 || age > p.life) continue;
      const k = age / p.life;
      // drag + gentle lift (glitter rises like the app's mouth glitter)
      const dr = p.drag || 2.2, e = (1 - Math.exp(-dr * age)) / dr;
      const x = p.x + p.vx * e;
      const y = p.y + p.vy * e - (p.lift || 30) * age * age * 0.5;
      const tw = 0.65 + 0.35 * Math.sin(age * (9 + p.h(5) * 10) + p.h(6) * 6.28);
      const a = Math.sin(Math.PI * Math.min(1, k * 1.15)) * tw * (alphaK == null ? 1 : alphaK) * (p.a || 1);
      if (a <= 0.01) continue;
      const r = p.size * (1 - 0.4 * k);
      c.globalAlpha = Math.min(1, a);
      c.drawImage(sprite(p.col), x - r * 2, y - r * 2, r * 4, r * 4);
      if (p.star && r > 1.6) {
        c.globalAlpha = Math.min(1, a * 0.8);
        c.fillStyle = '#ffffff';
        const L = r * 4.2, w = Math.max(0.8, r * 0.28);
        c.fillRect(x - L, y - w / 2, L * 2, w);
        c.fillRect(x - w / 2, y - L, w, L * 2);
      }
    }
    c.globalAlpha = 1;
  }

  /* ── fine print band: on with the cut (73 % on the cut frame, full by 25.15), holds to 30.0 ── */
  function fineUpdate(st, t, ctx) {
    const G = st.G, H = ctx.H, P = ctx.portrait;
    const fA = t >= FINE_IN ? oC(0.35 + 0.65 * range(t, FINE_IN, FINE_IN + FINE_RAMP)) : 0;
    st.fine.style.opacity = fA.toFixed(3);
    st.fineShade.style.opacity = fA.toFixed(3);
    st.fineRule.style.opacity = (fA * 0.9).toFixed(3);
    if (!st._fineH) {
      const h = st.fine.offsetHeight || 100;
      st._fineH = h;
      const F = G.fine, top = F.b - h;
      st.fineRule.style.top = (top - (P ? 22 : 16)) + 'px';
      st.fineShade.style.height = (H - top + (P ? 120 : 90)) + 'px';
    }
    counterCamera(st.steady, ctx.W, H);
  }

  /* 05's Dominion over the face render: fully on through the hold, hands over (opacity) during XF */
  function drawHero05(st, t, x, y, disc, W, H) {
    const a = 1 - ioS(range(t, XF[0], XF[1]));
    if (a <= 0.001) { st.heroCv.style.display = 'none'; return; }
    const c = st.heroCx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.clearRect(0, 0, W, H);
    const yaw = 4 * Math.sin((t - 20) * 1.3);   // 05's live yaw wobble, continued
    const D = disc / TURN_DISC;
    const ok = drawTurn(c, x, y, D, yaw);
    if (ok) keyLight(c, x, y, D, yaw);
    st.heroCv.style.display = ok ? '' : 'none';
    st.heroCv.style.opacity = a.toFixed(3);
  }

  /* ── the scene ────────────────────────────────────────────────────────── */
  BV.scene({
    id: 'end', start: T0, end: T1, z: 60, chapter: 'Bifrost Vault',

    build(root, ctx) {
      const G = geometry(ctx), W = ctx.W, H = ctx.H, P = ctx.portrait;
      const st = { G };
      // the root stays transparent so the fine print can fade in over 05's last frames;
      // the opaque base colour lives on the backdrop layer (shown from the cut)
      root.style.background = 'transparent';
      root.style.overflow = 'hidden';

      // backdrop: deep obsidian + vignette (on from the cut), and a soft violet bloom under the arch that
      // rises after the cut (so the cut frame keeps 05's dark surround around the coin: no lavender wash)
      st.bg = layer(root, `width:${W}px;height:${H}px;` +
        `background:radial-gradient(ellipse 120% 90% at 50% 45%,rgba(8,10,18,0) 55%,rgba(3,4,8,.65) 100%) #080A12;`);
      // 05's own backdrop (05-decide.js), on at the cut so the surround matches too, then handing over to ours
      st.bg05 = layer(st.bg, `width:${W}px;height:${H}px;` +
        `background:radial-gradient(${P ? '95% 48% at 50% 47%' : '62% 74% at 34% 50%'},#130f28 0%,#0b0c18 48%,#080A12 80%);`);
      st.bgBloom = layer(st.bg, `width:${W}px;height:${H}px;opacity:0;` +
        `background:radial-gradient(ellipse ${P ? '75% 34%' : '52% 46%'} at 50% ${P ? '30%' : '40%'},rgba(133,92,255,.20),rgba(119,147,255,.07) 48%,rgba(8,10,18,0) 78%);`);

      // everything but the fine print lives in `world` (gets the slow push)
      st.world = layer(root, `width:${W}px;height:${H}px;transform-origin:50% ${P ? '40%' : '45%'};`);
      // the arch group: coins + light + mark (starts bigger/lower, settles into the end-card layout)
      st.arch = layer(st.world, `width:${W}px;height:${H}px;transform-origin:${f2(G.origin.x)}px ${f2(G.origin.y)}px;`);

      // the arc of light (stage svg, screen blend)
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('width', W); svg.setAttribute('height', H);
      svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;mix-blend-mode:screen;pointer-events:none;';
      const d = qD(G.arc);
      svg.innerHTML =
        '<defs><linearGradient id="end-br" gradientUnits="userSpaceOnUse" x1="' + f2(G.arc.P0.x) + '" y1="0" x2="' + f2(G.arc.P1.x) + '" y2="0">' +
        '<stop offset="0" stop-color="' + BRIDGE[0] + '"/><stop offset=".5" stop-color="' + BRIDGE[1] + '"/><stop offset="1" stop-color="' + BRIDGE[2] + '"/></linearGradient>' +
        '<linearGradient id="end-fly" x1="0" y1="1" x2="1" y2="0">' +
        '<stop offset="0" stop-color="' + BRIDGE[0] + '"/><stop offset=".5" stop-color="' + BRIDGE[1] + '"/><stop offset="1" stop-color="' + BRIDGE[2] + '"/></linearGradient></defs>' +
        '<linearGradient id="end-fade" gradientUnits="userSpaceOnUse" x1="0" y1="' + f2(G.E0.y + (P ? 10 : 0)) + '" x2="0" y2="' + f2(G.E0.y + (P ? 150 : 170)) + '">' +
        '<stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>' +
        '<mask id="end-mask" maskUnits="userSpaceOnUse" x="-200" y="-400" width="' + (W + 400) + '" height="' + (H + 800) + '">' +
        '<rect x="-200" y="-400" width="' + (W + 400) + '" height="' + (H + 800) + '" fill="url(#end-fade)"/></mask>' +
        '<g class="arc" mask="url(#end-mask)">' +
        '<path class="a0" d="' + d + '" fill="none" stroke="url(#end-br)" stroke-width="' + (P ? 120 : 150) + '" stroke-opacity=".07" stroke-linecap="round"/>' +
        '<path class="a1" d="' + d + '" fill="none" stroke="url(#end-br)" stroke-width="' + (P ? 30 : 38) + '" stroke-opacity=".22" stroke-linecap="round"/>' +
        '<path class="a2" d="' + d + '" fill="none" stroke="url(#end-br)" stroke-width="' + (P ? 8 : 10) + '" stroke-opacity=".85" stroke-linecap="round"/>' +
        '<path class="a3" d="' + d + '" fill="none" stroke="#FFFFFF" stroke-width="' + (P ? 2.2 : 2.6) + '" stroke-opacity=".95" stroke-linecap="round"/>' +
        '</g>' +
        '<g class="fly" opacity="0" mask="url(#end-mask)">' +
        '<path class="f0" fill="none" stroke="url(#end-fly)" stroke-linecap="round" stroke-opacity=".16"/>' +
        '<path class="f1" fill="none" stroke="url(#end-fly)" stroke-linecap="round" stroke-opacity=".9"/>' +
        '<path class="f2" fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-opacity=".9"/>' +
        '</g>';
      st.svg = svg;
      st.arcG = svg.querySelector('.arc');
      st.arcs = ['.a0', '.a1', '.a2', '.a3'].map(s => svg.querySelector(s));
      st.arcLen = st.arcs[0].getTotalLength ? st.arcs[0].getTotalLength() : 2000;
      st.arcs.forEach(p => p.setAttribute('stroke-dasharray', f2(st.arcLen) + ' ' + f2(st.arcLen + 20)));
      st.flyG = svg.querySelector('.fly');
      st.fly = ['.f0', '.f1', '.f2'].map(s => svg.querySelector(s));

      // 05's coin glow + floor light under Dominion (05-decide.js), carried across the cut, then released
      st.glow05 = layer(st.arch, 'width:1000px;height:1000px;border-radius:50%;transform-origin:0 0;' +
        'background:radial-gradient(closest-side,rgba(190,170,255,.42),rgba(133,92,255,.2) 42%,rgba(119,147,255,.07) 64%,transparent);');
      st.floor05 = layer(st.arch, 'width:1000px;height:220px;border-radius:50%;transform-origin:0 0;' +
        'background:radial-gradient(closest-side,rgba(133,92,255,.42),rgba(119,147,255,.14) 55%,transparent);');
      // coin glows (enamel colour bleeding into the dark), coins, sweeps
      st.glows = COINS.map((c, i) => layer(st.arch, 'width:400px;height:400px;border-radius:50%;opacity:0;' +
        'background:radial-gradient(closest-side,' + K.rgba(GLOWC[i], 0.55) + ',' + K.rgba(GLOWC[i], 0.18) + ' 45%,' + K.rgba(GLOWC[i], 0) + ' 100%);'));
      st.arch.appendChild(svg);                 // light passes behind the coins
      st.coins = COINS.map(c => {
        const im = K.el('img', { parent: st.arch, attrs: { src: c.src, alt: '', draggable: 'false' } });
        im.decoding = 'sync';
        im.style.cssText = 'position:absolute;left:0;top:0;width:100px;height:100px;user-select:none;pointer-events:none;' +
          'filter:' + LIFT + ' ' + SHADOW + ';';
        BV.preload(im);
        return im;
      });
      // z-order: Dominion (the hero we cut from) on top during the fan-out
      st.arch.appendChild(st.coins[HERO_I]);
      // ...and over it, 05's Dominion (turn render + 05 grade + key light) for the match cut
      turnImages().forEach(im => BV.preload(im));
      st.heroCv = K.el('canvas', { parent: st.arch, attrs: { width: W, height: H },
        style: `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;filter:${GRADE05};` });
      st.heroCx = st.heroCv.getContext('2d');
      st.sweeps = COINS.map(c => {
        const s = layer(st.arch, 'width:100px;height:100px;overflow:hidden;mix-blend-mode:screen;opacity:0;' +
          '-webkit-mask-image:radial-gradient(closest-side,#000 calc(88.25% - .5px),rgba(0,0,0,0) calc(88.25% + .5px));mask-image:radial-gradient(closest-side,#000 calc(88.25% - .5px),rgba(0,0,0,0) calc(88.25% + .5px));');
        // ^ the face render's disc (alpha edge r~706 of 800) as a generated gradient mask: same AA rim as the
        //   old url() alpha mask, but nothing is fetched, so no file:// CORS error
        s._band = layer(s, 'width:100%;height:100%;');
        return s;
      });

      // head flare that rides the light as it draws
      st.flare = layer(st.arch, 'width:400px;height:400px;border-radius:50%;opacity:0;mix-blend-mode:screen;' +
        'background:radial-gradient(closest-side,rgba(255,255,255,1) 0%,rgba(230,236,255,.85) 9%,rgba(178,154,255,.42) 26%,rgba(119,147,255,.14) 52%,rgba(133,92,255,0) 100%);');
      st.streak = layer(st.arch, 'width:600px;height:12px;border-radius:50%;opacity:0;mix-blend-mode:screen;' +
        'background:radial-gradient(closest-side,rgba(255,255,255,.95),rgba(200,210,255,.4) 40%,rgba(133,92,255,0));');

      // glitter canvas
      st.cv = K.el('canvas', { parent: st.arch, attrs: { width: W, height: H }, style: `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;mix-blend-mode:screen;` });
      st.cx = st.cv.getContext('2d');

      // the mark (the real BrandMark via BVApp) + its bloom
      const mk = G.mark;
      st.bloom = layer(st.arch, 'width:400px;height:400px;border-radius:50%;opacity:0;mix-blend-mode:screen;' +
        'background:radial-gradient(closest-side,rgba(255,255,255,.9),rgba(212,195,255,.5) 18%,rgba(133,92,255,.22) 45%,rgba(103,220,234,.06) 70%,rgba(133,92,255,0) 100%);');
      st.markWrap = layer(st.arch, `left:${f2(mk.x - mk.m / 2)}px;top:${f2(mk.y - mk.m / 2)}px;width:${mk.m}px;height:${mk.m}px;`);
      st.mark = A.mark(st.markWrap, mk.m, { gradientId: 'end-mark-br' });
      st.mark.style.cssText += ';position:absolute;left:0;top:0;overflow:visible;';
      st.ring = st.mark.querySelector('circle');
      st.bridge = st.mark.querySelector('path');
      st.ringLen = 2 * Math.PI * 12.5;
      st.ring.setAttribute('stroke-dasharray', f2(st.ringLen) + ' ' + f2(st.ringLen + 2));
      st.ring.setAttribute('transform', 'rotate(150 16 16)');   // the ring draws from where the bridge enters (lower left)
      // glint: a short white-gold dash orbiting the ring at T_GLINT
      st.glint = document.createElementNS(NS, 'circle');
      st.glint.setAttribute('cx', 16); st.glint.setAttribute('cy', 16); st.glint.setAttribute('r', 12.5);
      st.glint.setAttribute('fill', 'none'); st.glint.setAttribute('stroke', '#FFF6DE'); st.glint.setAttribute('stroke-width', 2.4);
      st.glint.setAttribute('stroke-linecap', 'round');
      st.glint.setAttribute('stroke-dasharray', '10 ' + f2(st.ringLen));
      st.glint.style.filter = 'drop-shadow(0 0 1.5px #FFF3D0) drop-shadow(0 0 4px rgba(255,214,140,.9))';
      st.glint.setAttribute('opacity', 0);
      st.mark.appendChild(st.glint);

      // type
      const tx = layer(st.world, `width:${W}px;height:${H}px;`);
      st.word = K.superText(tx, 'BIFROST VAULT', { x: W / 2, y: G.word.y, size: G.word.size, weight: 700, color: WORDC,
        letterSpacing: '0.1em', lineHeight: 1, align: 'center', split: 'chars', seed: 61 });
      // colour split like the real lockup: BIFROST white, VAULT lavender
      st.word.faces.forEach((f, i) => { if (i >= 7) f.style.color = LAV; });
      st.word.inner.style.marginLeft = '0.05em';   // optical: compensate trailing letter-spacing
      st.domain = K.el('div', { parent: tx, html: 'bifrostvault<span style="color:' + VLT + '">.io</span>',
        style: `position:absolute;left:${W / 2}px;top:${G.domain.y}px;transform:translate(-50%,-50%);white-space:nowrap;` +
          `font:500 ${G.domain.size}px 'Geist',system-ui,sans-serif;letter-spacing:.06em;color:${SEC};opacity:0` });
      if (DOMAIN_TXT !== 'bifrostvault.io') st.domain.textContent = DOMAIN_TXT;
      st.line = K.superText(tx, G.line.text, { x: W / 2, y: G.line.y, size: G.line.size, weight: 700, color: WHITE,
        letterSpacing: '-0.02em', lineHeight: 1.0, align: 'center', split: 'words', seed: 62, fit: P ? 930 : 1600 });
      st.inv = K.el('div', { parent: tx, text: ACCESS,
        style: `position:absolute;left:${W / 2}px;top:${G.inv.y}px;transform:translate(-50%,-50%);white-space:nowrap;` +
          `font:700 ${G.inv.size}px 'Geist',system-ui,sans-serif;letter-spacing:.32em;padding-left:.32em;color:${VLT};opacity:0` });
      st.invSub = K.el('div', { parent: tx, text: ACCESS_SUB,
        style: `position:absolute;left:${W / 2}px;top:${G.invSub.y}px;transform:translate(-50%,-50%);white-space:nowrap;` +
          `font:500 ${G.invSub.size}px 'Geist',system-ui,sans-serif;letter-spacing:.005em;color:${SEC};opacity:0` });

      // fine print band (outside the push, and on a counter-camera layer so neither the push nor the
      // impact punch / shake ever moves it) + 18+ badge
      const F = G.fine;
      st.steady = layer(root, `width:${W}px;height:${H}px;transform-origin:50% 50%;`);
      st.fine = layer(st.steady, `left:${F.l}px;width:${F.r - F.l}px;top:auto;bottom:${H - F.b}px;display:flex;align-items:center;gap:${P ? 22 : 22}px;opacity:0;`);
      st.badge = K.el('div', { parent: st.fine, text: '18+',
        style: `flex:none;width:${F.badge}px;height:${F.badge}px;border-radius:50%;border:2px solid rgba(246,247,252,.86);` +
          `display:flex;align-items:center;justify-content:center;font:700 ${Math.round(F.badge * 0.36)}px 'Geist',system-ui,sans-serif;` +
          `letter-spacing:-.01em;color:${WHITE};box-sizing:border-box;` });
      st.fineTx = K.el('div', { parent: st.fine, text: FINE,
        style: `flex:1;font:500 ${F.size}px/${F.lh} 'Geist',system-ui,sans-serif;letter-spacing:.005em;color:rgba(196,204,220,.9);` +
          `text-align:left;text-wrap:pretty;` });
      st.fineRule = layer(st.steady, `left:${F.l}px;width:${F.r - F.l}px;height:1px;opacity:0;` +
        'background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.14) 20%,rgba(255,255,255,.14) 80%,rgba(255,255,255,0));');
      st.fineShade = layer(st.steady, `width:${W}px;top:auto;bottom:0;opacity:0;` +
        'background:linear-gradient(180deg,rgba(8,10,18,0),rgba(5,6,11,.82) 45%,rgba(5,6,11,.92));');
      st.steady.insertBefore(st.fineShade, st.fine);

      // glitter sets (positions known at build time)
      const arcAt = u => qPt(G.E0, G.C, G.E1, G.arcU(u));
      st.trail = glitterSet(601, P ? 70 : 90, (i, h) => {
        const u = (i + h(1)) / (P ? 70 : 90);
        const v = lerp(0.08, 0.92, u);
        let lo = 0, hi = 1; for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (ioC(m) < v) lo = m; else hi = m; }
        const t0 = lerp(DRAW[0], DRAW[1], lo);       // when the head passes this point
        const p = arcAt(v);
        const ang = -Math.PI / 2 + (h(2) - 0.5) * 2.4;
        const sp = 40 + h(3) * 160;
        return { t0, x: p.x + (h(4) - 0.5) * 14, y: p.y + (h(7) - 0.5) * 14, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          life: 0.7 + h(8) * 1.0, size: (P ? 1.6 : 1.9) + h(9) * 2.2, lift: 30 + h(10) * 40, drag: 2.4 };
      });
      st.burst = glitterSet(602, 64, (i, h) => {
        const ang = (i / 64) * Math.PI * 2 + (h(1) - 0.5) * 0.5;
        const sp = 220 + h(2) * 560;
        return { t0: LAND + h(3) * 0.06, x: mk.x + Math.cos(ang) * mk.m * 0.3, y: mk.y + Math.sin(ang) * mk.m * 0.3,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.8, life: 0.8 + h(4) * 1.0, size: 1.6 + h(5) * 2.4, lift: 50, drag: 3.2 };
      });
      st.fanBurst = glitterSet(603, 48, (i, h) => {
        const ang = (i / 48) * Math.PI * 2 + (h(1) - 0.5) * 0.4;
        const sp = 220 + h(2) * 420;
        const hp = G.heroG;
        return { t0: T_END + h(3) * 0.04, x: hp.x + Math.cos(ang) * hp.disc * 0.4, y: hp.y + Math.sin(ang) * hp.disc * 0.4,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.7, life: 0.5 + h(4) * 0.6, size: 1.8 + h(5) * 2.6, lift: 60, drag: 4.2 };
      });
      // slow ambient glitter rising off the arch for the hold (looped analytically)
      st.ambient = [];
      for (let i = 0; i < (P ? 26 : 34); i++) {
        const h = k => K.hash(i * 13 + k, 604);
        st.ambient.push({ u: h(1), per: 2.2 + h(2) * 1.6, ph: h(3), size: 1.2 + h(4) * 1.6, col: GLIT[i % 7], dx: (h(5) - 0.5) * 40, rise: 70 + h(6) * 90 });
      }
      st.arcAt = arcAt;
      return st;
    },

    update(st, local, t, ctx) {
      const G = st.G, W = ctx.W, H = ctx.H, P = ctx.portrait;
      const root = st.world.parentNode;

      /* in / out: hard cut on the downbeat (25.0); hold to the last frame.
         Only the fine print band shows before the cut (fades in from 24.75). */
      const on = t >= T_END;
      root.style.opacity = 1;
      st.bg.style.opacity = on ? 1 : 0;
      st.world.style.opacity = on ? 1 : 0;
      if (!on) { fineUpdate(st, t, ctx); return; }

      /* impact at the cut: punch + shake (camera = whole stage, very short). No flash on the cut frame --
         it is a match cut on 05's lit coin (same rule as the 20.0 cut); the flash rides the fan-out burst. */
      const ie = t - T_END;
      const ic = impactCam(ie);
      BV.camera.x += ic.x; BV.camera.y += ic.y; BV.camera.s *= ic.s;
      const fe = t - FAN0;
      if (fe >= 0 && fe < 0.5) BV.fx.flash(0.1 * Math.exp(-fe * 9), FLASH);
      const bgX = ioS(range(t, T_END + 0.05, T_END + 0.6));
      st.bgBloom.style.opacity = bgX.toFixed(3);
      st.bg05.style.opacity = (1 - bgX).toFixed(3);
      fineUpdate(st, t, ctx);   // after our camera change, so the counter-camera cancels the final value
      /* mark landing: a softer bloom flash */
      const le = t - LAND;
      if (le >= 0 && le < 0.6) BV.fx.flash(0.16 * Math.exp(-le * 8), FLASH);
      BV.fx.vignette(0.12);

      /* slow push on the world (not the fine print) */
      const push = 1 + 0.028 * ioS(range(t, 25.6, 30.0));
      st.world.style.transform = 'scale(' + push.toFixed(5) + ')';
      const sp = ioC(range(t, 25.66, 26.16));
      const as = lerp(G.intro.s, 1, sp), ady = lerp(G.intro.dy, 0, sp);
      st.arch.style.transform = 'translate3d(0,' + f2(ady) + 'px,0) scale(' + as.toFixed(5) + ')';

      /* ── coins: Dominion holds the 05 pose, then the arch fans out of it ── */
      const hg = G.heroG, hs = G.slots[HERO_I];
      // outExpo on a smoothstep-warped clock: no first-frame jump, still a fast settle
      const fanE = (a, dur) => { const u = range(t, a, a + dur); return oX(u * u * (3 - 2 * u)); };
      const hP = fanE(HOLD, HERO_DUR);
      const heroX = lerp(hg.x, hs.x, hP), heroY = lerp(hg.y, hs.y, hP), heroD = lerp(hg.disc, G.disc, hP);
      const drawP = ioC(range(t, DRAW[0], DRAW[1]));          // light head progress (0..1 along the light path)
      const headU = G.arcU(drawP);                            // in arch param
      const life = range(t, 25.55, 26.2);                     // float: each coin bobs on its own phase once settled
      for (let i = 0; i < 5; i++) {
        const sl = G.slots[i];
        const hero = i === HERO_I;
        const rank = Math.abs(i - HERO_I);
        // spawn order: neighbours first, outermost last (all hidden behind Dominion at spawn)
        const s0 = hero ? HOLD : FAN0 + 0.03 * (rank - 1) + (i < HERO_I ? 0.015 : 0);
        const p = hero ? hP : fanE(s0, FAN_DUR);
        let x, y, disc;
        if (hero) { x = heroX; y = heroY; disc = heroD; }
        else {
          // emerge from behind Dominion's CURRENT position, growing 0.6 -> 1
          x = lerp(heroX, sl.x, p); y = lerp(heroY, sl.y, p);
          disc = G.disc * lerp(0.6, 1, oC(range(t, s0, s0 + FAN_DUR * 0.8)));
        }
        // a little overshoot lift so the arch "breathes" into place
        y -= Math.sin(Math.PI * range(t, s0, s0 + 0.75)) * (P ? 16 : 20) * (hero ? 0.3 : 1);
        y += Math.sin((t - 25) * 1.7 + i * 1.25) * (P ? 4 : 5) * life;
        x += Math.sin((t - 25) * 1.1 + i * 2.1) * 1.5 * life;
        const rot = (1 - p) * (i - HERO_I) * -6;
        const box = disc / DISC;
        const c = st.coins[i];
        c.style.width = c.style.height = f2(box) + 'px';
        c.style.transform = 'translate3d(' + f2(x - box / 2) + 'px,' + f2(y - box / 2) + 'px,0) rotate(' + rot.toFixed(2) + 'deg)';
        // always opaque once spawned; the reveal is scale + a brightness ramp, never a cross-fade
        c.style.opacity = hero || t >= s0 ? 1 : 0;
        if (hero) {
          // under 05's turn render (heroCv) the face render takes the end-card lift as it travels
          const k = oC(range(t, HOLD, HOLD + 0.4));
          c.style.filter = 'brightness(' + lerp(1, LIFT_B, k).toFixed(3) + ') contrast(' + lerp(1, LIFT_C, k).toFixed(3) + ') saturate(' + lerp(1, LIFT_S, k).toFixed(3) + ') ' + SHADOW;
        } else {
          const k = oC(range(t, s0, s0 + 0.35));
          c.style.filter = 'brightness(' + lerp(2.2, LIFT_B, k).toFixed(3) + ') contrast(' + LIFT_C + ') saturate(' + LIFT_S + ') ' + SHADOW;
        }
        c._x = x; c._y = y; c._d = disc;
        if (hero) {
          drawHero05(st, t, x, y, disc, W, H);
          // 05's glow + floor light ride with Dominion and fade out as it leaves the pose
          const g5 = 1 - ioS(range(t, HOLD, HOLD + 0.45));
          st.glow05.style.opacity = (0.85 * g5).toFixed(3);
          st.floor05.style.opacity = (0.8 * g5).toFixed(3);
          if (g5 > 0) {
            const gk = disc * 1.9 / 1000, fk = disc * 1.5 / 1000;
            st.glow05.style.transform = 'translate3d(' + f2(x - 500 * gk) + 'px,' + f2(y - 500 * gk) + 'px,0) scale(' + gk.toFixed(4) + ')';
            st.floor05.style.transform = 'translate3d(' + f2(x - 500 * fk) + 'px,' + f2(y + disc * 0.6 - 110 * fk) + 'px,0) scale(' + fk.toFixed(4) + ')';
          }
        }

        // light passes this coin: enamel glow flares then settles
        const pass = clamp(1 - Math.abs(headU - sl.u) / 0.12);
        const passed = headU >= sl.u ? 1 : 0;
        const settle = 0.5 + 0.08 * Math.sin((t - 25) * 2.1 + i);
        const gA = Math.max(pass, passed * lerp(1, settle, range(t, DRAW[1], DRAW[1] + 0.8))) * p;
        const gb = st.glows[i], gs = disc * (1.9 + 0.5 * pass);
        gb.style.transform = 'translate3d(' + f2(x - 200) + 'px,' + f2(y - 200) + 'px,0) scale(' + (gs / 400).toFixed(4) + ')';
        gb.style.opacity = gA.toFixed(3);

        // sweeps: (a) as the arc head passes, (b) the glint pass at T_GLINT (left -> right)
        const sw = st.sweeps[i];
        const gp = range(t, T_GLINT - 0.25 + i * 0.09, T_GLINT + 0.35 + i * 0.09);   // 0..1 glint band across this coin
        const hpass = range(t, lerp(DRAW[0], DRAW[1], 0), DRAW[1] + 0.1);
        let rel = null, amp = 0;
        if (gp > 0 && gp < 1) { rel = -30 + gp * 160; amp = 0.85; }
        else if (pass > 0.02 && t < DRAW[1] + 0.2) { rel = 50 + (headU - sl.u) / 0.12 * 60; amp = 0.75 * pass; }
        if (rel != null && amp > 0.01) {
          sw.style.width = sw.style.height = f2(box) + 'px';
          sw.style.transform = c.style.transform;
          sw.style.opacity = amp.toFixed(3);
          sw._band.style.background = 'linear-gradient(105deg,rgba(255,255,255,0) ' + f2(rel - 20) + '%,rgba(225,230,255,.25) ' + f2(rel - 6) +
            '%,rgba(255,255,255,.75) ' + f2(rel) + '%,rgba(225,230,255,.25) ' + f2(rel + 6) + '%,rgba(255,255,255,0) ' + f2(rel + 20) + '%)';
        } else sw.style.opacity = 0;
        void hpass;
      }

      /* ── the arc of light: draws through the coins, then condenses into the mark ── */
      const flyP = ioC(range(t, FLY[0], FLY[1]));
      const off = st.arcLen * (1 - drawP);
      const residual = lerp(1, 0.5, oC(range(t, FLY[0], FLY[0] + 0.3)));
      const breathe = 1 + 0.08 * Math.sin((t - 26) * 1.6);
      st.arcs.forEach((p, k) => {
        p.setAttribute('stroke-dashoffset', f2(off));
        if (k === 3) p.setAttribute('stroke-opacity', (0.95 * lerp(1, 0.35, range(t, FLY[0], FLY[0] + 0.3))).toFixed(3));
      });
      st.arcG.setAttribute('opacity', (drawP > 0 ? residual * (t > 26.3 ? breathe : 1) : 0).toFixed(3));

      // head flare + streak
      if (drawP > 0 && t < DRAW[1] + 0.12) {
        const hpnt = st.arcAt(drawP);
        const fa = Math.sin(Math.PI * clamp(range(t, DRAW[0], DRAW[1] + 0.12)));
        const fs = (P ? 150 : 210) * (0.8 + 0.4 * fa);
        st.flare.style.transform = 'translate3d(' + f2(hpnt.x - 200) + 'px,' + f2(hpnt.y - 200) + 'px,0) scale(' + (fs / 400).toFixed(4) + ')';
        st.flare.style.opacity = (fa).toFixed(3);
        st.streak.style.transform = 'translate3d(' + f2(hpnt.x - 300) + 'px,' + f2(hpnt.y - 6) + 'px,0) scale(' + (0.6 + 0.8 * fa).toFixed(3) + ',1)';
        st.streak.style.opacity = (fa * 0.9).toFixed(3);
      } else { st.flare.style.opacity = 0; st.streak.style.opacity = 0; }

      // the condensing light: arch -> the mark's bridge stroke
      if (t >= FLY[0] && t < LAND + 0.14) {
        const q = {
          P0: lerpP(G.arc.P0, G.bridge.P0, flyP),
          C: lerpP(G.arc.C, G.bridge.C, flyP),
          P1: lerpP(G.arc.P1, G.bridge.P1, flyP)
        };
        const dd = qD(q);
        const bw = G.bridgeW;
        const widths = [lerp(P ? 60 : 80, bw * 4.5, flyP), lerp(P ? 9 : 11, bw, flyP), lerp(P ? 2.6 : 3, bw * 0.34, flyP)];
        st.fly.forEach((p, k) => { p.setAttribute('d', dd); p.setAttribute('stroke-width', f2(widths[k])); });
        const fo = range(t, FLY[0], FLY[0] + 0.08) * (1 - range(t, LAND + 0.02, LAND + 0.14));
        st.flyG.setAttribute('opacity', fo.toFixed(3));
      } else st.flyG.setAttribute('opacity', 0);

      /* ── the mark ───────────────────────────────────────────────────────── */
      const rp = oQ(range(t, RING[0], RING[1]));
      st.ring.setAttribute('stroke-dashoffset', f2(st.ringLen * (1 - rp)));
      st.ring.setAttribute('opacity', rp > 0 ? 1 : 0);
      st.bridge.setAttribute('opacity', range(t, LAND - 0.02, LAND + 0.06).toFixed(3));
      const mpop = 1 + 0.06 * Math.sin(Math.PI * range(t, LAND, LAND + 0.4)) ;
      st.markWrap.style.transform = 'scale(' + mpop.toFixed(4) + ')';
      st.markWrap.style.filter = t >= LAND ? 'drop-shadow(0 0 ' + f2(G.mark.m * (0.05 + 0.12 * Math.exp(-(t - LAND) * 3))) + 'px rgba(178,154,255,.55))' : 'none';
      // bloom behind the mark
      const ba = le >= 0 ? Math.exp(-le * 2.6) : 0;
      const bAmb = 0.22 * range(t, LAND, LAND + 0.6);
      const bs = G.mark.m * (2.6 + 2.2 * oC(range(le, 0, 0.8)));
      st.bloom.style.transform = 'translate3d(' + f2(G.mark.x - 200) + 'px,' + f2(G.mark.y - 200) + 'px,0) scale(' + (bs / 400).toFixed(4) + ')';
      st.bloom.style.opacity = Math.max(ba * 0.95, bAmb).toFixed(3);
      // glint around the ring
      const gl = range(t, T_GLINT, T_GLINT + 0.55);
      if (gl > 0 && gl < 1) {
        st.glint.setAttribute('opacity', Math.sin(Math.PI * gl).toFixed(3));
        st.glint.setAttribute('stroke-dashoffset', f2(-st.ringLen * ioS(gl) * 0.92));
        st.glint.setAttribute('transform', 'rotate(150 16 16)');
      } else st.glint.setAttribute('opacity', 0);

      /* ── glitter ────────────────────────────────────────────────────────── */
      const c = st.cx;
      c.clearRect(0, 0, W, H);
      c.globalCompositeOperation = 'lighter';
      drawGlitter(c, st.fanBurst, t);
      drawGlitter(c, st.trail, t);
      drawGlitter(c, st.burst, t);
      const amb = range(t, 25.8, 26.6);
      if (amb > 0) {
        for (let i = 0; i < st.ambient.length; i++) {
          const a = st.ambient[i];
          const ph = ((t - 25.8) / a.per + a.ph) % 1;
          const p = st.arcAt(a.u);
          const x = p.x + a.dx * ph, y = p.y - a.rise * ph;
          const al = Math.sin(Math.PI * ph) * 0.55 * amb * (0.7 + 0.3 * Math.sin(t * 7 + i));
          const r = a.size;
          c.globalAlpha = al;
          c.drawImage(sprite(a.col), x - r * 2, y - r * 2, r * 4, r * 4);
        }
        c.globalAlpha = 1;
      }
      // glint star riding the ring
      if (gl > 0 && gl < 1) {
        const mk = G.mark, R = 12.5 * mk.m / 32 * mpop;
        const ang = (150 + 360 * ioS(gl) * 0.92 + 360 * 5 / st.ringLen) * Math.PI / 180;
        const gx = mk.x + Math.cos(ang) * R, gy = mk.y + Math.sin(ang) * R;
        const ga = Math.sin(Math.PI * gl), L = mk.m * 0.3 * ga, w = Math.max(1, mk.m * 0.012);
        c.globalAlpha = ga;
        c.drawImage(sprite('#ffe2a8'), gx - mk.m * 0.12, gy - mk.m * 0.12, mk.m * 0.24, mk.m * 0.24);
        c.fillStyle = '#fff8ea';
        c.fillRect(gx - L, gy - w / 2, L * 2, w);
        c.fillRect(gx - w / 2, gy - L * 0.7, w, L * 1.4);
        c.globalAlpha = 1;
      }
      c.globalCompositeOperation = 'source-over';

      /* ── type ───────────────────────────────────────────────────────────── */
      K.animText(st.word, t, WORD, Infinity, { style: 'rise', stagger: 0.022, dur: 0.5, order: 'center' });
      const dA = oC(range(t, DOMAIN, DOMAIN + 0.4));
      st.domain.style.opacity = dA.toFixed(3);
      st.domain.style.transform = 'translate(-50%,-50%) translate3d(0,' + f2((1 - dA) * 10) + 'px,0)';
      st.domain.style.letterSpacing = (0.06 + 0.1 * (1 - dA)).toFixed(3) + 'em';
      K.animText(st.line, t, LINE, Infinity, { style: 'rise', stagger: 0.06, dur: 0.5 });
      const iA = oC(range(t, INV, INV + 0.45));
      st.inv.style.opacity = iA.toFixed(3);
      st.inv.style.letterSpacing = (0.32 + 0.18 * (1 - iA)).toFixed(3) + 'em';
      const sA = oC(range(t, INVSUB, INVSUB + 0.45));
      st.invSub.style.opacity = sA.toFixed(3);
      st.invSub.style.transform = 'translate(-50%,-50%) translate3d(0,' + f2((1 - sA) * 10) + 'px,0)';
    }
  });
})();
