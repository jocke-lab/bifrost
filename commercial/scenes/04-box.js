/* ============================================================================
   04-box.js — beat 04 "OR LET THE BOX CHOOSE" (10.0–20.0)      scene 9.9–20.15
   The client's favourite moment, built only from their real product:
     · the REAL sealed-case film (assets/box/frames/f000–f144 = vault-opening-hq.mp4,
       1:1 frames), played through BVShared.filmTime/filmFrame inside layout().film
       (real time 10.0–13.0, slow-motion lid rise 13.0–15.0, freeze on f105 = 4.375 s)
     · the app's own overlays, recreated from PackOpening.tsx + vault-reveal.module.css
       + PackGlitter.tsx: the seal light on the rim (53.52 %) double-pulsing 1.7 s ->
       1.1 s, the release light, the 22-particle mouth glitter, the coin rising from
       INSIDE the rim (clipped below the rim until 45 % of the 1.8 s rise, scale
       0.28 -> 1, cubic-bezier(.2,.7,.25,1)), filmAway, the open-case still arriving
       under the coin (caseArrive), the halo and the result block (BVApp.result)
     · the real Dominion coin: yaw renders of the client's GLB (assets/coins3d/dominion-turn)
   Flash on top (Aurora Noir: one arc of light, the object as hero, one gold accent):
   anamorphic seam streak on the release, latch nudge, frame-blended slow motion,
   the big violet-white bloom + glitter burst + 6 px shake when the coin clears the
   rim (16.1), specular sweeps across the relief, one gold glint along the rim, a
   camera push in on the case (16:9 1.18 -> 1.36, following the lid up) that pulls back
   through the rise; the coin layer is graded + key-lit to match the silver of 02 / 05.
   Supers: OR LET THE BOX CHOOSE. (10.2–12.0) · "A little anticipation." (11.4) ·
           "Here it comes." (12.4) · YOURS TO DISCOVER. (17.2)
   Result: "Revealed from the vault" / Dominion / "Silver · № 07 of 50" (17.0; small lines 28 / 23 px)
   Micro-tag 10–20: "Dramatisation · chances shown before you buy"
   Layout: 16:9 trucks the case + coin left after the reveal (16.4–17.6) so the type sits
   on a right-hand rail at x 1090 (the same rail 05 uses); 9:16 stacks super / coin over
   the case / result inside the 220 / 320 px safe zones.
   HAND-OFF (for 05 at the 20.0 cut): window.BVBox.pose(ctx, t) -> {x, y, D, disc, yaw}
   = the coin on screen at time t, camera included (stage px; D = turn-render frame box,
   disc = visible coin). At 20.0: 16:9 (678, 349) D 530 · 9:16 (540, 751) D 630 · yaw 38.4.
   window.BVBox.turnImages() -> the shared Image[41] of the Dominion yaw sweep (for 05).
   Page mode keeps f000–f105 as 960x540 bitmaps; ?render=1 draws the full-res frames.
   Pure function of t: no timers, no randomness (seeded BVKit.rng only).
   ========================================================================== */
(function () {
  'use strict';
  const K = window.BVKit, S = window.BVShared, A = window.BVApp, BV = window.BV;
  if (!K || !S || !A || !BV) { console.error('[04-box] missing BVKit/BVShared/BVApp/BV'); return; }
  const { clamp, lerp, range, ease } = K;
  const C = S.CUES, FILM = S.FILM;

  const COIN = S.ROLES.boxReveal;              // 'dominion'
  const ED = S.ROLES.boxEdition || 7;
  const T0 = 9.9, T1 = 20.15;                  // scene window (overlaps 03 / 05)
  const CUT_IN = C.box;                        // 10.0 hard cut (03 is visible until 10.0)
  const CUT_OUT = C.decide ? C.decide[0] : 20.0;

  // The app's choreography (PackOpening.tsx), on the global clock.
  const CHARGE = CUT_IN + 1.35;                // tension 'charge' (video 1.35 s)
  const RELEASE = C.release;                   // 12.65 tension 'release' (video 2.65 s)
  const LATCH = C.latch;                       // 13.0 lid unlatches (film 3.0 s)
  const FREEZE = C.freeze;                     // 15.0 video pinned at 4.375 s -> boxOpen
  const RISE = C.rise;                         // 15.2 phase 'rising'
  const RISE_DUR = 1.8;
  const DONE = RISE + RISE_DUR;                // 17.0 phase 'result'
  const CLIP_OFF = RISE + 0.45 * RISE_DUR;     // 16.01 clearRim step-end at 45 %
  const BLOOM = C.clearsRim;                   // 16.1
  const RESULT = C.result;                     // 17.0
  const SUP2 = C.yoursToDiscover;              // 17.2

  const WHITE = '#F6F7FC', SEC = '#B4BFD1';
  const BRIDGE = ['#67DCEA', '#7793FF', '#855CFF'];
  const GL_COLS = ['#e4d9ff', '#e4d9ff', '#e4d9ff', '#cff8ff', '#e4d9ff', '#e4d9ff', '#fff1d2'];

  /* ── easing: CSS cubic-bezier, solved exactly (Newton + bisection) ─────── */
  function bezier(p1x, p1y, p2x, p2y) {
    const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
    const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
    const X = s => ((ax * s + bx) * s + cx) * s;
    const Y = s => ((ay * s + by) * s + cy) * s;
    const dX = s => (3 * ax * s + 2 * bx) * s + cx;
    return x => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let s = x;
      for (let i = 0; i < 8; i++) {
        const e = X(s) - x, d = dX(s);
        if (Math.abs(e) < 1e-7 || Math.abs(d) < 1e-6) break;
        s -= e / d;
      }
      if (!(s >= 0 && s <= 1) || Math.abs(X(s) - x) > 1e-5) {
        let lo = 0, hi = 1; s = x;
        for (let i = 0; i < 40; i++) { if (X(s) < x) lo = s; else hi = s; s = (lo + hi) / 2; }
      }
      return Y(s);
    };
  }
  const E_RISE = bezier(0.2, 0.7, 0.25, 1);    // .coin coinRise
  const E_CSS = bezier(0.25, 0.1, 0.25, 1);    // CSS 'ease' (transitions, filmAway, caseArrive, arrive)
  const E_IO = bezier(0.42, 0, 0.58, 1);       // ease-in-out (sealPulse)
  const E_BRAND = bezier(0.16, 1, 0.3, 1);     // brand motion curve
  const oc = ease.outCubic, ios = ease.inOutSine, ioc = ease.inOutCubic;

  /* ── assets (loaded once, shared by both formats) ────────────────────────── */
  const FRAME_SRC = i => 'assets/box/frames/f' + String(i).padStart(3, '0') + '.webp';
  const TURN_SRC = i => 'assets/coins3d/' + COIN + '-turn/' + String(i).padStart(2, '0') + '.webp';
  const STILL_SRC = 'assets/box/vault-box-open.webp';
  const TURN_DISC = 976 / 1100;                // coin disc / frame in the yaw renders
  // Only f000–f105 are ever shown (the app pins the film at 4.375 s = f105); f106–f144 are never loaded.
  const NFR = Math.round(FILM.freeze * FILM.fps) + 1;          // 106
  // Render mode (?render=1) draws the full-res 1920x1080 frames. On the live page the stage is shown
  // at <= ~0.65 scale, so every frame is decoded once and kept as a 960x540 bitmap: ~2 MB each instead
  // of ~8.3 MB (~220 MB pinned for all 106 instead of up to ~880 MB of decode cache), and drawImage
  // never has to re-decode a frame mid-playback.
  const PAGE_FW = 960, PAGE_FH = 540;
  let FR = null, FR_P = null, TURN = null;
  function loadImg(src) {
    const im = new Image();
    im.decoding = 'sync';
    im.src = src;
    BV.preload(im);
    return im;
  }
  function frameCanvas(im) {
    const cv = document.createElement('canvas'); cv.width = PAGE_FW; cv.height = PAGE_FH;
    cv.getContext('2d').drawImage(im, 0, 0, PAGE_FW, PAGE_FH);
    return cv;
  }
  function downscale(im) {
    if (typeof window.createImageBitmap === 'function') {
      return window.createImageBitmap(im, { resizeWidth: PAGE_FW, resizeHeight: PAGE_FH, resizeQuality: 'high' })
        .then(bm => { if (bm.width === PAGE_FW) return bm; if (bm.close) bm.close(); return frameCanvas(im); }, () => frameCanvas(im));
    }
    return Promise.resolve(frameCanvas(im));
  }
  // Served over http(s): fetch -> createImageBitmap(blob, resize) decodes straight to the small copy,
  // so no full-res decoded frame is ever cached. Elsewhere (file://) the frame loads as an <img> and
  // is downscaled once. One frame is decoded at a time (a chain): the load never holds more than a
  // couple of full-res decodes at once.
  const HTTP = /^https?:$/.test(location.protocol) && typeof window.fetch === 'function' && typeof window.createImageBitmap === 'function';
  let chain = Promise.resolve();
  function viaBlob(src) {
    const blob = fetch(src).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); });   // downloads in parallel
    blob.catch(() => {});
    return () => blob
      .then(b => window.createImageBitmap(b, { resizeWidth: PAGE_FW, resizeHeight: PAGE_FH, resizeQuality: 'high' }))
      .then(bm => { if (bm.width === PAGE_FW) return bm; const cv = frameCanvas(bm); if (bm.close) bm.close(); return cv; });
  }
  function viaImg(src) {
    const im = new Image();
    im.decoding = 'async';
    im.src = src;
    // (load event, not img.decode(): Chromium rejects decode() for detached images on file://)
    const loaded = new Promise((res, rej) => {
      if (im.complete && im.naturalWidth) res(); else { im.onload = () => res(); im.onerror = rej; }
    });
    return () => loaded.then(() => downscale(im)).then(small => { im.onload = im.onerror = null; im.removeAttribute('src'); return small; });
  }
  function loadFrame(i) {
    const src = FRAME_SRC(i);
    let job;
    if (HTTP) { const blobJob = viaBlob(src); job = () => blobJob().catch(() => viaImg(src)()); }
    else job = viaImg(src);
    chain = chain.then(job).then(small => { FR[i] = small; }, () => { FR[i] = loadImg(src); });
    return chain;
  }
  // The Dominion yaw sweep is shared with 05-decide (same 41 URLs): window.BVBox.turnImages().
  function turnImages() {
    if (!TURN) { TURN = []; for (let i = 0; i <= 40; i++) TURN.push(loadImg(TURN_SRC(i))); }
    return TURN;
  }
  function loadAll() {
    if (FR) { BV.preload(FR_P); turnImages().forEach(im => BV.preload(im)); return; }
    FR = new Array(NFR);
    if (BV.render) { for (let i = 0; i < NFR; i++) FR[i] = loadImg(FRAME_SRC(i)); FR_P = FR.slice(); }
    else { FR_P = []; for (let i = 0; i < NFR; i++) FR_P.push(loadFrame(i)); BV.preload(FR_P); }
    turnImages();
  }
  const ok = im => !!im && (typeof im.naturalWidth === 'number' ? (im.complete && im.naturalWidth > 0) : im.width > 0);
  const srcW = im => im.naturalWidth || im.width;

  /* ── PackGlitter.tsx: 22 fixed trajectories (exact) ──────────────────────── */
  const SPARKS = Array.from({ length: 22 }, (_, i) => {
    const n = i + 1;                           // CSS nth-child is 1-based
    return {
      x: (8 + ((i * 37) % 85)) / 100,          // --spark-x (of the stream width)
      drift: ((i * 13) % 35) - 17,             // --spark-drift px
      h: (61 + ((i * 17) % 40)) / 100,         // --spark-height (of the stream height)
      size: i % 5 === 0 ? 3.4 : i % 3 === 0 ? 2.7 : 1.8,
      dur: 3.1 + ((i * 7) % 17) / 10,          // --spark-duration
      delay: ((i * 23) % 47) / 10,             // --spark-delay (negative -> phase offset)
      col: n % 7 === 0 ? 2 : n % 4 === 0 ? 1 : 0,
      tall: n % 5 === 0
    };
  });
  // particle core + its box-shadow glow colour (pack-glitter.module.css)
  const SPARK_COL = [['#e4d9ff', 'rgba(177,132,255,.45)'], ['#cff8ff', 'rgba(118,218,255,.40)'], ['#fff1d2', 'rgba(246,222,176,.35)']];
  const SPARK_OP = [[0, 0], [0.13, 0.8], [0.4, 0.95], [0.65, 0.86], [0.86, 0.32], [1, 0]];
  function sparkAt(p) {                        // @keyframes rise (linear)
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

  /* ── sealPulse keyframes (ease-in-out per segment) ───────────────────────── */
  const SEAL_KF = [[0, 0.2, 0.88, 0.75], [0.17, 0.7, 1, 1], [0.31, 0.3, 0.95, 0.85], [0.46, 1, 1.035, 1.12], [0.72, 0.2, 0.9, 0.8], [1, 0.2, 0.88, 0.75]];
  function sealAt(p) {
    p = p - Math.floor(p);
    for (let i = 0; i < SEAL_KF.length - 1; i++) {
      const a = SEAL_KF[i], b = SEAL_KF[i + 1];
      if (p <= b[0]) {
        const u = E_IO((p - a[0]) / (b[0] - a[0]));
        return { o: lerp(a[1], b[1], u), sx: lerp(a[2], b[2], u), sy: lerp(a[3], b[3], u) };
      }
    }
    return { o: 0.2, sx: 0.88, sy: 0.75 };
  }
  // 1.7 s cycle while gathering, tightening to 1.1 s on 'charge' (phase kept continuous).
  // Phase offset 0.85 puts the two bright peaks (46 % keyframe) on the score's seam pulses (11.1 / 12.2).
  const SEAL_PHASE0 = 0.85;
  function sealPhase(t) {
    if (t <= CHARGE) return SEAL_PHASE0 + (t - CUT_IN) / 1.7;
    return SEAL_PHASE0 + (CHARGE - CUT_IN) / 1.7 + (t - CHARGE) / 1.1;
  }

  /* ── sprites ─────────────────────────────────────────────────────────────── */
  const spriteCache = {};
  function sprite(core, glow) {
    const key = core + '|' + glow;
    if (spriteCache[key]) return spriteCache[key];
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.16, core); g.addColorStop(0.3, core);
    g.addColorStop(0.42, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    return (spriteCache[key] = cv);
  }

  /* ── layout per format ───────────────────────────────────────────────────── */
  function geometry(ctx) {
    const P = ctx.portrait, W = ctx.W, H = ctx.H;
    const L = S.layout(ctx);
    const F = L.film;                          // {x,y,w,h,s,rimY,cx}
    const k = F.w / FILM.w;                    // film px -> stage px
    // vault-box-open.webp is the same footage at 0.99x: registered on f105 (case edges + rim)
    const still = { x: F.x + 426 * k, y: F.y + 6 * k, size: 1069 * k };
    const D = P ? 560 : 530;                   // coin frame box (disc = 88.7 %), world px
    const disc = D * TURN_DISC;
    const gap = P ? 14 : 16;                   // final disc bottom sits just above the rim
    const coin = { x: F.cx, y: F.rimY - gap - disc / 2, D, disc };
    return {
      P, W, H, L, F, k, still, coin,
      rim: F.rimY,
      cam: { ox: F.cx, oy: F.rimY },           // camera pivot: the centre of the case's front rim
      // supers + app type (stage px, not moved by the camera)
      sup1: P ? { x: 540, y: 336, size: 112, text: 'OR LET THE\nBOX CHOOSE.', fit: 952, align: 'center' }
              : { x: 960, y: 184, size: 124, text: 'OR LET THE\nBOX CHOOSE.', fit: 1500, align: 'center' },
      sup2: P ? { x: 540, y: 336, size: 116, text: 'YOURS TO\nDISCOVER.', fit: 952, align: 'center' }
              : { x: 1090, y: 322, size: 120, text: 'YOURS TO\nDISCOVER.', fit: 700, align: 'left' },
      anti: P ? { x: 540, y: 1492, size: 58, bar: 180 } : { x: 960, y: 974, size: 52, bar: 160 },
      // result block: eyebrow -> name -> edition (PackOpening order); small lines sized for a phone
      res: P ? { x: 540, y: 1314, k: 1.8, small: 28, align: 'center' } : { x: 1094, y: 512, k: 1.75, small: 23, align: 'left' },
      tag: P ? { x: 64, y: 1596, size: 24 } : { x: 116, y: 1012, size: 20 }
    };
  }

  // Camera (world only; type stays steady): zoom about the rim centre + a truck in 16:9.
  function camera(G, t) {
    let s, tx = 0, ty = 0;
    if (G.P) {
      s = 1.13 + 0.05 * ios(range(t, CUT_IN, FREEZE)) - 0.09 * ioc(range(t, RISE - 0.1, DONE + 0.2)) + 0.035 * E_BRAND(range(t, DONE - 0.2, T1));
      ty = -64 * (1 - ioc(range(t, RISE - 0.1, DONE + 0.2)));
    } else {
      // the real case big in frame: push 1.18 -> 1.36 while it charges (10–13), then follow the lid
      // up (ease to 1.24, tilt +54 px so the open lid keeps its top edge), then pull back through the
      // rise so the coin clears the rim in a wide frame; the hold sits ~3 % wider (lid headroom ~50 px)
      const push = ios(range(t, CUT_IN, LATCH));
      const lid = ios(range(t, LATCH + 0.25, FREEZE));
      const back = ioc(range(t, FREEZE + 0.05, 16.4));
      const sOpen = 1.18 + 0.18 * push - 0.12 * lid, tyOpen = 54 * lid;
      const sHold = 0.97 + 0.03 * E_BRAND(range(t, RISE, T1));
      s = lerp(sOpen, sHold, back);
      tx = -282 * ease.inOutCubic(range(t, 16.42, 17.62));        // make room for the type on the right
      ty = lerp(tyOpen, 0, back) + 26 * ios(range(t, 16.42, 17.62));
    }
    const kick = range(t, RELEASE, RELEASE + 0.5);                 // a breath of push on the light release
    s += 0.012 * Math.sin(Math.PI * kick) * (1 - kick);
    return { s, tx, ty, ox: G.cam.ox, oy: G.cam.oy };
  }
  const toScreen = (cam, x, y) => ({ x: cam.tx + cam.ox + (x - cam.ox) * cam.s, y: cam.ty + cam.oy + (y - cam.oy) * cam.s });

  // The coin (world px): rises from inside the rim with the app's curve, then a slow living hold.
  function coinPose(G, t) {
    const c0 = G.coin;
    const e = E_RISE(range(t, RISE, DONE));
    const y0 = G.rim + 0.14 * c0.D;              // --rise-y: starts with its top at the rim (scale .28)
    const sc = lerp(0.28, 1, e);
    const fl = range(t, DONE - 0.3, DONE + 0.8);
    const y = lerp(y0, c0.y, e) + Math.sin((t - DONE) * 1.7) * (G.P ? 5 : 4) * fl;
    return { x: c0.x, y, sc, D: c0.D * sc, yaw: -24 + 13 * (t - RISE) };   // calm turn from the app's initial yaw
  }

  // Hand-off for 05-decide (continuity across the 20.0 cut): the coin on screen at time t,
  // camera included (stage px). D = turn-render frame box, disc = visible coin diameter.
  window.BVBox = {
    turnImages,                                // shared Image[41] of assets/coins3d/dominion-turn (05 can reuse it)
    pose(ctx, t) {
      const G = geometry(ctx), p = coinPose(G, t), cam = camera(G, t), q = toScreen(cam, p.x, p.y);
      return { x: q.x, y: q.y, D: p.D * cam.s, disc: p.D * cam.s * TURN_DISC, yaw: p.yaw, frame: coinFrames(p.yaw) };
    }
  };

  BV.scene({
    id: 'box',
    start: T0, end: T1, z: 40,
    chapter: 'Or let the box choose',

    build(root, ctx) {
      loadAll();
      const G = geometry(ctx);
      const { W, H, P, F } = G;
      root.style.overflow = 'hidden';
      root.style.background = '#020203';
      const st = { G };
      const abs = (parent, css) => K.el('div', { parent, style: 'position:absolute;left:0;top:0;pointer-events:none;' + (css || '') });

      // app result ambient (#05060c + violet/blue radial wash), arrives with the result
      st.ambient = abs(root, `width:${W}px;height:${H}px;opacity:0;background:
        radial-gradient(ellipse at 50% 40%,#37205b55,transparent 55%),radial-gradient(ellipse at 75% 60%,#07316b44,transparent 50%),#05060c`);

      // world: everything that the camera push moves (text stays rock-steady above it)
      st.world = abs(root, `width:${W}px;height:${H}px;transform-origin:0 0`);

      /* film: the real frames, masked like .filmMedia */
      const fm = 'linear-gradient(180deg,transparent,#000 9%,#000 88%,transparent)';
      st.film = abs(st.world, `left:${F.x}px;top:${F.y}px;width:${F.w}px;height:${F.h}px;overflow:hidden;
        -webkit-mask-image:${fm};mask-image:${fm}`);
      st.fcv = K.el('canvas', { parent: st.film, style: `position:absolute;left:0;top:0;width:${F.w}px;height:${F.h}px` });
      st.fcv.width = BV.render ? FILM.w : PAGE_FW; st.fcv.height = BV.render ? FILM.h : PAGE_FH;
      st.fcx = st.fcv.getContext('2d');
      st.fkey = '';
      // .sealLight (34% x 16% of the film, centred on the rim) with its two pulsing layers
      st.seal = abs(st.film, `left:${F.w * 0.5}px;top:${F.h * FILM.rimFrac}px;width:${F.w * 0.34}px;height:${F.h * 0.16}px;
        margin:${-F.h * 0.08}px 0 0 ${-F.w * 0.17}px;opacity:.42`);
      st.sealLine = abs(st.seal, `width:100%;top:48%;height:3%;border-radius:50%;
        background:linear-gradient(90deg,transparent,#ae82ff80 18%,#e3d4ff 50%,#ae82ff80 82%,transparent)`);
      st.sealGlow = abs(st.seal, `width:100%;height:100%;background:radial-gradient(ellipse,#d6c1ff50,#8f55ff25 32%,transparent 70%)`);
      // .releaseLight (38% x 29% at 51%)
      st.release = abs(st.film, `left:${F.w * 0.5}px;top:${F.h * 0.51}px;width:${F.w * 0.38}px;height:${F.h * 0.29}px;
        margin:${-F.h * 0.145}px 0 0 ${-F.w * 0.19}px;opacity:0;background:radial-gradient(ellipse,#d8c4ff28,#9470ff16 40%,transparent 72%)`);
      // .filmGlitter (PackGlitter over the film: x 50%, y 51%, width 29%, rise 30%)
      st.gcv = K.el('canvas', { parent: st.film, style: `position:absolute;left:0;top:0;width:${F.w}px;height:${F.h}px` });
      st.gcv.width = FILM.w; st.gcv.height = FILM.h;
      st.gcx = st.gcv.getContext('2d');
      // .film:after shade over the whole stage (fades with the film)
      st.shade = abs(st.world, `width:${W}px;height:${H}px;background:linear-gradient(180deg,#02020399,transparent 22%,transparent 70%,#020203)`);

      /* the open-case still (data-opened-case), registered on the film's case */
      // feathered with smoothstep ramps (no slope break -> no visible plate edge): fully opaque over the
      // case (x 18.5–82 %, y 2–79 %), fading to the stage at the sides and under the floor glow
      const sm = 'linear-gradient(90deg,' + feather(0, 18) + ',' + feather(100, 82) + '),linear-gradient(180deg,' + feather(0, 1.6) + ',' + feather(100, 80) + ')';
      st.stillWrap = abs(st.world, `left:${G.still.x}px;top:${G.still.y}px;width:${G.still.size}px;height:${G.still.size}px;opacity:0;
        -webkit-mask-image:${sm};mask-image:${sm};-webkit-mask-composite:source-in;mask-composite:intersect`);
      st.still = K.el('img', { parent: st.stillWrap, attrs: { src: STILL_SRC, alt: '', draggable: 'false' },
        style: 'position:absolute;left:0;top:0;width:100%;height:100%;display:block' });
      BV.preload(st.still);

      /* halo + coin + glitter (canvas over the case) */
      const c0 = G.coin;
      st.halo = abs(st.world, `left:${c0.x}px;top:${c0.y}px;width:${c0.D * 1.9}px;height:${c0.D * 1.9}px;margin:${-c0.D * 0.95}px 0 0 ${-c0.D * 0.95}px;
        border-radius:50%;opacity:0;background:radial-gradient(closest-side,rgba(170,140,255,.42),rgba(118,96,224,.22) 38%,rgba(77,90,200,.08) 62%,transparent)`);
      // light from inside the case: the front wall occludes it below the rim (mask in world px)
      const bm = `linear-gradient(180deg,#000 0px,#000 ${G.rim - 10}px,transparent ${G.rim + 70}px)`;
      st.bloomWrap = abs(st.world, `width:${W}px;height:${H}px;-webkit-mask-image:${bm};mask-image:${bm}`);
      st.bloomBack = abs(st.bloomWrap, `left:${c0.x}px;top:${c0.y}px;width:1000px;height:1000px;margin:-500px 0 0 -500px;border-radius:50%;opacity:0;mix-blend-mode:screen;
        background:radial-gradient(closest-side,rgba(255,255,255,1),rgba(236,228,255,.92) 14%,rgba(190,168,255,.62) 30%,rgba(133,92,255,.3) 52%,rgba(119,147,255,.1) 74%,transparent)`);
      // the coin layer is lifted to the exposure of the same coin in 02 / 05 (static grade, never animated)
      st.ccv = K.el('canvas', { parent: st.world, style: `position:absolute;left:0;top:0;width:${W}px;height:${H}px;filter:brightness(1.08) contrast(1.05)` });
      st.ccv.width = W; st.ccv.height = H;
      st.ccx = st.ccv.getContext('2d');

      /* bloom + anamorphic streak (screen) */
      st.bloom = abs(st.world, `left:${c0.x}px;top:${c0.y}px;width:${c0.disc * 1.5}px;height:${c0.disc * 1.5}px;margin:${-c0.disc * 0.75}px 0 0 ${-c0.disc * 0.75}px;border-radius:50%;opacity:0;mix-blend-mode:screen;
        background:radial-gradient(closest-side,transparent 56%,rgba(214,200,255,.22) 62%,rgba(240,234,255,.85) 66.5%,rgba(178,154,255,.32) 72%,rgba(133,92,255,.1) 84%,transparent)`);
      st.streak = abs(st.world, `left:${W / 2}px;top:${G.rim}px;width:${W * 1.2}px;height:140px;margin:-70px 0 0 ${-W * 0.6}px;opacity:0;mix-blend-mode:screen`);
      st.streakGlow = abs(st.streak, `width:100%;height:100%;border-radius:50%;
        background:radial-gradient(closest-side,rgba(178,154,255,.55),rgba(119,147,255,.22) 45%,transparent)`);
      st.streakMid = abs(st.streak, `top:61px;width:100%;height:18px;border-radius:50%;opacity:.55;
        background:linear-gradient(90deg,transparent 8%,${BRIDGE[0]}88 30%,#e9e2ff 50%,${BRIDGE[2]}88 70%,transparent 92%)`);
      st.streakCore = abs(st.streak, `top:66px;width:100%;height:8px;border-radius:50%;
        background:linear-gradient(90deg,transparent 4%,${BRIDGE[0]}cc 26%,#ffffff 50%,${BRIDGE[2]}cc 74%,transparent 96%)`);

      /* analytic particle systems (seeded) */
      const mouthW = 640 * G.k;                // the case mouth (film px 640)
      st.burst = K.particles(st.ccv, {
        seed: 4041, count: P ? 96 : 88, x: 0, y: 0, w: mouthW * 0.8, h: 14,
        speed: [260, 1080], angle: [198, 342], gravity: 520, drag: 2.1, life: [0.6, 1.45],
        size: [1.6, 3.8], shape: ['star', 'dot', 'spark', 'dot'], colors: GL_COLS, twinkle: 0.35, tail: 0.035, speedBias: 1.4
      });
      st.burst2 = K.particles(st.ccv, {
        seed: 4043, count: P ? 46 : 40, x: 0, y: 0, spread: c0.disc * 0.32,
        speed: [120, 520], angle: [0, 360], gravity: 140, drag: 2.6, life: [0.5, 1.1],
        size: [1.4, 3], shape: ['star', 'dot'], colors: GL_COLS, twinkle: 0.4
      });
      st.dust = K.emitter(st.ccv, {
        seed: 4047, rate: P ? 9 : 8, x: c0.x, y: G.rim - 6, w: mouthW * 0.62, h: 10,
        speed: [26, 70], angle: [255, 285], gravity: -10, drag: 0.35, life: [2.2, 3.4], size: [1.2, 2.6], shape: 'dot',
        colors: GL_COLS, twinkle: 0.5, sway: [9, 0.35], alpha: 0.75, prewarm: 0
      });

      /* ── type layer ─────────────────────────────────────────────────────── */
      st.type = abs(root, `width:${W}px;height:${H}px`);
      const supOpts = { cls: 'hero', align: 'center', color: WHITE, weight: 700, letterSpacing: '-0.02em', lineHeight: 0.92,
        split: 'chars', shadow: true, chroma: 5 };
      st.sup1 = K.superText(st.type, G.sup1.text, Object.assign({}, supOpts, { x: G.sup1.x, y: G.sup1.y, size: G.sup1.size, fit: G.sup1.fit }));
      st.sup2 = K.superText(st.type, G.sup2.text, Object.assign({}, supOpts, { x: G.sup2.x, y: G.sup2.y, size: G.sup2.size, fit: G.sup2.fit, align: G.sup2.align }));

      // the app's anticipation block: H1 line(s) + the 100 px violet progress bar
      const an = G.anti;
      st.anti = abs(st.type, `left:${an.x}px;top:${an.y}px;width:0;height:0;opacity:0`);
      const lineCss = `position:absolute;left:0;top:0;transform:translate(-50%,-50%);white-space:nowrap;
        font:500 ${an.size}px 'Geist',system-ui,sans-serif;letter-spacing:-.035em;color:#f2f1fc;text-shadow:0 2px 18px rgba(0,0,0,.6)`;
      st.line1 = K.el('div', { parent: st.anti, text: 'A little anticipation.', style: lineCss });
      st.line2 = K.el('div', { parent: st.anti, text: 'Here it comes.', style: lineCss + ';opacity:0' });
      const barY = Math.round(an.size * 0.95);
      st.bar = abs(st.anti, `left:${-an.bar / 2}px;top:${barY}px;width:${an.bar}px;height:${P ? 3 : 2.5}px;background:#ffffff15;overflow:hidden;border-radius:2px`);
      st.barFill = abs(st.bar, 'width:100%;height:100%;background:#b399ff;transform-origin:0 50%;transform:scaleX(0)');

      // the app's result block (PackOpening), format "Silver · № 07 of 50"
      const rs = G.res;
      st.resWrap = abs(st.type, `left:${rs.x}px;top:${rs.y}px;width:0;height:0`);
      st.result = A.result(st.resWrap, { coinId: COIN, edition: ED, mintage: (ctx.cfg.collection && ctx.cfg.collection.edition) || 50,
        metal: 'Silver', actions: false, align: rs.align, format: 'short', scale: rs.k });
      const rEl = st.result.el;
      rEl.style.position = 'absolute';
      rEl.style.top = '0';
      if (rs.align === 'center') { rEl.style.left = '0'; rEl.style.transform = 'translateX(-50%)'; }
      else rEl.style.left = '0';
      const [rEb, rMt, rName, rLine] = st.result.parts;
      if (rLine) rLine.style.display = 'none';   // the "Your exact coin…" line is beat 05's spine
      rName.after(rMt);                          // script order: eyebrow -> DOMINION -> Silver · № 07 of 50
      rEb.style.cssText += `;font-size:${rs.small}px;line-height:1.4;letter-spacing:.22em;color:#bdb2da`;
      rMt.style.cssText += `;font-size:${rs.small}px;line-height:1.3;letter-spacing:.16em;margin-top:0;color:#c3bfd4`;
      rName.style.margin = `${Math.round(rs.small * 0.2)}px 0 ${Math.round(rs.small * 0.42)}px`;
      st.resParts = [rEb, rName, rMt];
      rEl.style.textShadow = '0 2px 24px rgba(0,0,0,.65)';
      resultShow(st.resParts, 0);

      // micro-tag (disclosure), bottom-left inside the safe area
      st.tag = K.el('div', { parent: st.type, text: 'Dramatisation · chances shown before you buy',
        style: `position:absolute;left:${G.tag.x}px;top:${G.tag.y}px;transform:translateY(-100%);white-space:nowrap;
          font:500 ${G.tag.size}px 'Geist',system-ui,sans-serif;letter-spacing:.04em;color:rgba(196,204,220,.9);
          text-shadow:0 1px 10px rgba(0,0,0,.8);opacity:0` });

      // offscreen buffer for the specular sweep over the coin relief
      st.off = document.createElement('canvas');
      st.offC = st.off.getContext('2d');
      return st;
    },

    update(st, local, t, ctx) {
      const G = st.G, { W, H, P, F } = G;
      const root = st.world.parentNode;

      /* ── scene in / out ─────────────────────────────────────────────────── */
      root.style.opacity = t < CUT_IN ? 0 : 1;   // hard cut on the downbeat (03 owns the frames before it)
      if (t < CUT_IN) return;
      const live = t < CUT_OUT;                  // global fx / camera only inside our beat (05 owns 20.0+)

      /* ── camera: a subtle push (world only) + latch nudge + rim-clear shake ─ */
      const c0 = G.coin;
      const cam = camera(G, t);
      st.world.style.transform = `translate(${(cam.tx + cam.ox).toFixed(2)}px,${(cam.ty + cam.oy).toFixed(2)}px) scale(${cam.s.toFixed(5)}) translate(${(-cam.ox).toFixed(2)}px,${(-cam.oy).toFixed(2)}px)`;
      if (t >= LATCH && t < LATCH + 0.6) { const sh = K.shake(t - LATCH, 3, 1301, 7); BV.camera.x += sh.x; BV.camera.y += sh.y; }
      if (live && t >= BLOOM - 0.02 && t < BLOOM + 1.0) { const sh = K.shake(t - BLOOM + 0.02, 6, 1611, 5.5); BV.camera.x += sh.x; BV.camera.y += sh.y; BV.camera.r += sh.r; }

      /* ── film: real frames, frame-blended (slow motion reads as a speed ramp) ─ */
      const fadeUp = E_CSS(range(t, CUT_IN, CUT_IN + 0.42));
      const away = t < RISE + 0.54 ? 1 : 1 - E_CSS(range(t, RISE + 0.54, DONE));   // filmAway 0–30 % hold, then fade
      const filmO = fadeUp * away;
      st.film.style.opacity = filmO.toFixed(3);
      st.shade.style.opacity = filmO.toFixed(3);
      if (filmO > 0.002) {
        const fpos = Math.min(FILM.freeze * FILM.fps, S.filmTime(t) * FILM.fps);
        const fa = Math.min(NFR - 1, Math.floor(fpos + 1e-6));
        // frame blending only where the film is stretched (slow-motion lid rise 13–15 s)
        const fu = t > LATCH && t < FREEZE ? fpos - fa : 0;
        const ia = FR[fa], ib = FR[Math.min(NFR - 1, fa + 1)];
        // the case's own light surges: on the release, and when the coin clears the rim
        const sRel = 0.55 * K.env(t, RELEASE - 0.02, RELEASE + 0.1, RELEASE + 0.18, RELEASE + 1.0);
        const sBlm = 0.7 * K.env(t, BLOOM - 0.06, BLOOM + 0.04, BLOOM + 0.1, BLOOM + 0.9);
        const blend = fu > 0.02 && ok(ib);
        const key = fa + '|' + (blend ? fu.toFixed(3) : 0) + '|' + sRel.toFixed(3) + '|' + sBlm.toFixed(3);
        if (ok(ia) && key !== st.fkey) {             // the film canvas only repaints when its content changes
          st.fkey = key;
          const c = st.fcx, fs = st.fcv.width / FILM.w;
          c.setTransform(fs, 0, 0, fs, 0, 0);          // draw in film px whatever the backing size
          c.globalCompositeOperation = 'source-over';
          c.globalAlpha = 1;
          c.drawImage(ia, 0, 0, FILM.w, FILM.h);
          if (blend) { c.globalAlpha = fu; c.drawImage(ib, 0, 0, FILM.w, FILM.h); c.globalAlpha = 1; }
          // release: the seam itself flares (a feathered band around the rim);
          // bloom: the interior light, above the rim, feathered into the front wall so the wall stays dark
          const cut = Math.round(FILM.h * FILM.rimFrac), q = srcW(ia) / FILM.w;
          if (sRel > 0.003 || sBlm > 0.003) {
            c.globalCompositeOperation = 'lighter';
            if (sBlm > 0.003) { c.globalAlpha = sBlm; c.drawImage(ia, 0, 0, FILM.w * q, cut * q, 0, 0, FILM.w, cut); }
            for (let k = -10; k < 10; k++) {
              const y = cut + k * 12, f = (k + 0.5) / 10;           // -1..1 around the rim
              const a = sRel * Math.max(0, 1 - Math.abs(f)) * Math.max(0, 1 - Math.abs(f)) + (k >= 0 ? sBlm * Math.max(0, 1 - f * 1.25) : 0);
              if (a < 0.003) continue;
              c.globalAlpha = Math.min(1, a);
              c.drawImage(ia, 0, y * q, FILM.w * q, 12 * q, 0, y, FILM.w, 12);
            }
            c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
          }
        }
      }

      /* ── seal light: gather (.42, 1.7 s) -> charge (.9, 1.1 s) -> release (0) ─ */
      let so = 0.42;
      if (t >= CHARGE) so = lerp(0.42, 0.9, E_CSS(range(t, CHARGE, CHARGE + 0.45)));
      if (t >= RELEASE) so = lerp(0.9, 0, E_CSS(range(t, RELEASE, RELEASE + 0.45)));
      st.seal.style.opacity = so.toFixed(3);
      if (so > 0.002) {
        const kf = sealAt(sealPhase(t));
        const tr = `scale(${kf.sx.toFixed(4)},${kf.sy.toFixed(4)})`;
        st.sealLine.style.transform = tr; st.sealGlow.style.transform = tr;
        st.sealLine.style.opacity = kf.o.toFixed(3); st.sealGlow.style.opacity = kf.o.toFixed(3);
      }
      // release light: opacity .6 s, scale .82 -> 1 over 1.4 s
      const rl = E_CSS(range(t, RELEASE, RELEASE + 0.6));
      st.release.style.opacity = rl.toFixed(3);
      st.release.style.transform = `scale(${(0.82 + 0.18 * E_CSS(range(t, RELEASE, RELEASE + 1.4))).toFixed(4)})`;

      /* ── glitter from the mouth over the film (boxOpen) ─────────────────── */
      const gc = st.gcx;
      gc.setTransform(1, 0, 0, 1, 0, 0);
      if (st.gDirty || t >= FREEZE) gc.clearRect(0, 0, FILM.w, FILM.h);   // untouched (and not repainted) before the freeze
      st.gDirty = t >= FREEZE;
      if (t >= FREEZE) {
        const flowO = E_CSS(range(t, FREEZE, FREEZE + 0.42));
        drawFlow(gc, { x: 0, y: 0, w: FILM.w, h: FILM.h }, { x: 0.5, y: 0.51, w: 0.29, rise: 0.3 }, t - FREEZE, flowO, 1.25);
      }

      /* ── the open-case still arrives under the coin (caseArrive) ────────── */
      const ca = t < RISE ? 0 : (t >= DONE ? 1 : (range(t, RISE, DONE) < 0.25 ? 0 : E_CSS((range(t, RISE, DONE) - 0.25) / 0.75)));
      const caY = 12 * G.k * (1 - ca) * (t >= RISE ? 1 : 0);
      st.stillWrap.style.opacity = ca.toFixed(3);
      st.stillWrap.style.transform = `translate(0px,${caY.toFixed(2)}px)`;
      st.ambient.style.opacity = E_CSS(range(t, DONE - 0.4, DONE + 0.8)).toFixed(3);

      /* ── coin rise ──────────────────────────────────────────────────────── */
      const c = st.ccx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      const cOn = t >= RISE - 0.06;              // nothing is drawn on the coin layer before the rise
      if (st.cDirty || cOn) c.clearRect(0, 0, W, H);
      st.cDirty = cOn;
      const pose = coinPose(G, t);
      const cx = pose.x, cy = pose.y, sc = pose.sc;
      if (t >= RISE) {
        const D = pose.D, yaw = pose.yaw;

        // halo (app: radial #7660e0 at 110 % of the coin, here stronger for the film)
        const hO = oc(range(t, RISE + 0.25, DONE + 0.6)) * (0.9 + 0.1 * Math.sin((t - DONE) * 1.3));
        st.halo.style.opacity = hO.toFixed(3);
        st.halo.style.transform = `translate(0px,${(cy - c0.y).toFixed(2)}px) scale(${(0.55 + 0.45 * sc).toFixed(4)})`;

        // clipped below the rim until 45 % of the rise (reads as emerging from inside the case)
        c.save();
        if (t < CLIP_OFF) { c.beginPath(); c.rect(0, 0, W, G.rim); c.clip(); }
        const fast = 1 - range(t, RISE + 0.12, RISE + 0.55);
        if (fast > 0 && t > RISE + 0.01) {
          for (let g = 4; g >= 1; g--) {
            const q = coinPose(G, Math.max(RISE, t - g * 0.018));
            drawCoin(c, st, q.x, q.y, q.D, q.yaw, (0.2 / g) * fast);
          }
        }
        drawCoin(c, st, cx, cy, D, yaw, 1);
        // silver: a soft key light from the upper left + a thin specular rim (matches the coin in 02 / 05)
        keyLight(c, st, cx, cy, D, yaw, 1);
        // specular sweeps across the relief: as it clears the rim, and once in the hold
        const s1 = range(t, BLOOM + 0.05, BLOOM + 0.75), s2 = range(t, 18.55, 19.35);
        if (s1 > 0 && s1 < 1) sheen(c, st, cx, cy, D, yaw, s1, 0.55);
        else if (s2 > 0 && s2 < 1) sheen(c, st, cx, cy, D, yaw, s2, 0.42);
        c.restore();
        // one gold glint along the rim (the single gold accent of this view)
        const gp = range(t, 18.95, 19.6);
        if (gp > 0 && gp < 1) glint(c, cx, cy, D * TURN_DISC * 0.5 * Math.cos(yaw * Math.PI / 180), D * TURN_DISC * 0.5, gp);
      } else {
        st.halo.style.opacity = 0;
      }

      // the mouth flares while the coin passes through it (light spilling out of the case)
      const mf = K.env(t, RISE - 0.05, RISE + 0.25, RISE + 0.55, BLOOM + 0.2);
      if (mf > 0.003) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.translate(c0.x, G.rim - 4);
        c.scale(c0.disc * 0.75, c0.disc * 0.11);
        const mg = c.createRadialGradient(0, 0, 0, 0, 0, 1);
        mg.addColorStop(0, 'rgba(236,228,255,.55)'); mg.addColorStop(0.35, 'rgba(178,154,255,.28)'); mg.addColorStop(1, 'rgba(133,92,255,0)');
        c.globalAlpha = mf * 0.9;
        c.fillStyle = mg;
        c.fillRect(-1, -1, 2, 2);
        c.restore();
      }

      /* ── glitter over the case still (PackGlitter .resultGlitter, above the coin) ─ */
      if (t >= RISE && ca > 0.002) {
        drawFlow(c, { x: G.still.x, y: G.still.y + caY, w: G.still.size, h: G.still.size }, { x: 0.5, y: 0.51, w: 0.54, rise: 0.34 },
          t - RISE, ca, 1.15 * G.k);
      }
      // the bloom moment: burst from the mouth + sparks around the coin, fine dust after
      if (t >= BLOOM - 0.03) {
        c.save(); c.translate(c0.x, G.rim - 8); st.burst.draw(c, t - BLOOM + 0.03); c.restore();
        c.save(); c.translate(cx, cy); st.burst2.draw(c, t - BLOOM); c.restore();
      }
      if (t >= DONE - 0.6) { c.globalAlpha = 1; st.dust.draw(c, t - (DONE - 0.6)); }
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;

      /* ── release: anamorphic streak along the seam; bloom when the coin clears the rim ─ */
      const r1 = range(t, RELEASE - 0.04, RELEASE + 0.9);
      const r2 = range(t, BLOOM - 0.06, BLOOM + 0.8);
      const k1 = r1 > 0 && r1 < 1 ? Math.pow(1 - r1, 2.2) * Math.min(1, r1 * 12) : 0;
      const k2 = r2 > 0 && r2 < 1 ? Math.pow(1 - r2, 2) * Math.min(1, r2 * 9) : 0;
      const sk = Math.max(k1 * 0.85, k2);
      st.streak.style.opacity = sk.toFixed(3);
      if (sk > 0) {
        const sy = k2 > k1 ? cy - G.rim + c0.disc * 0.06 : 0;
        st.streak.style.transform = `translate(0px,${sy.toFixed(1)}px) scale(${(0.55 + 0.6 * (k2 > k1 ? oc(r2) : oc(r1))).toFixed(4)},1)`;
      }
      // one big violet-white bloom from the case mouth, behind the coin; a rim of light hugging its edge
      const bl = r2 > 0 && r2 < 1 ? Math.pow(1 - r2, 1.5) * Math.min(1, r2 * 8) : 0;
      const bsc = (0.45 + 1.55 * oc(r2)) * c0.disc / 470;
      st.bloomBack.style.opacity = bl.toFixed(3);
      st.bloomBack.style.transform = `translate(0px,${(cy - c0.y + c0.disc * 0.1).toFixed(1)}px) scale(${bsc.toFixed(4)},${(bsc * 0.88).toFixed(4)})`;
      const rimO = r2 > 0 && r2 < 1 ? Math.pow(1 - r2, 1.2) * Math.min(1, r2 * 6) : 0;
      st.bloom.style.opacity = (rimO * 0.9).toFixed(3);
      st.bloom.style.transform = `translate(0px,${(cy - c0.y).toFixed(1)}px) scale(${(sc * (1 + 0.06 * oc(r2))).toFixed(4)},${sc.toFixed(4)})`;
      if (live && bl > 0) {
        const sp = toScreen(cam, c0.x, cy);
        BV.fx.flash(0.3 * bl, `radial-gradient(ellipse ${P ? '58% 26%' : '38% 44%'} at ${(sp.x / W * 100).toFixed(1)}% ${(sp.y / H * 100).toFixed(1)}%,` +
          'rgba(255,255,255,.42),rgba(226,216,255,.58) 20%,rgba(150,118,255,.2) 52%,rgba(133,92,255,0) 100%)');
      }
      if (live && k1 > 0) {
        const sp = toScreen(cam, F.cx, G.rim);
        BV.fx.flash(0.16 * k1, `radial-gradient(ellipse ${P ? '70% 16%' : '42% 22%'} at ${(sp.x / W * 100).toFixed(1)}% ${(sp.y / H * 100).toFixed(1)}%,` +
          'rgba(232,222,255,.85),rgba(150,118,255,.3) 45%,rgba(133,92,255,0) 100%)');
      }

      /* ── type ───────────────────────────────────────────────────────────── */
      K.animText(st.sup1, t, 10.2, 12.0, { style: 'rise', stagger: 0.022, dur: 0.55, outStyle: 'blur', outDur: 0.3 });
      // anticipation block: arrives with its first line, fades when the coin starts rising (.3 s)
      const aIn = E_CSS(range(t, 11.3, 11.65)), aOut = 1 - E_CSS(range(t, RISE, RISE + 0.3));
      st.anti.style.opacity = (aIn * aOut).toFixed(3);
      lineSwap(st.line1, 1 - E_CSS(range(t, 12.22, 12.38)), E_BRAND(range(t, 11.4, 11.9)), -1);
      lineSwap(st.line2, 1, E_BRAND(range(t, 12.4, 12.9)), 1);
      st.barFill.style.transform = `scaleX(${clamp(S.filmTime(t) / FILM.freeze).toFixed(4)})`;

      resultShow(st.resParts, range(t, RESULT, RESULT + 0.85));
      K.animText(st.sup2, t, SUP2, Infinity, { style: 'rise', stagger: 0.022, dur: 0.55 });

      st.tag.style.opacity = (0.95 * E_CSS(range(t, CUT_IN + 0.15, CUT_IN + 0.6))).toFixed(3);

      if (live) BV.fx.vignette(0.18 + 0.12 * range(t, RISE, DONE));
    }
  });

  /* ── helpers ──────────────────────────────────────────────────────────────── */
  // mask stops: transparent at `a` % -> opaque at `b` % along a smoothstep (C1 at both ends)
  function feather(a, b) {
    const out = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8, v = u * u * (3 - 2 * u);
      out.push(`rgba(0,0,0,${v.toFixed(3)}) ${(a + (b - a) * u).toFixed(2)}%`);
    }
    if (a > b) out.reverse();
    return out.join(',');
  }
  // BVApp.result's own stagger (oCubic, .12 s apart, 16 u rise), in the script's order
  function resultShow(parts, p) {
    p = clamp(p);
    parts.forEach((e, i) => {
      const q = oc(range(p, i * 0.12, i * 0.12 + 0.5));
      e.style.opacity = q.toFixed(3);
      e.style.transform = q < 1 ? `translateY(calc(${((1 - q) * 16).toFixed(2)} * var(--u,1px)))` : '';
    });
  }

  function lineSwap(el, out, inP, dir) {
    const a = clamp(inP), b = clamp(out);
    const o = a * b;
    el.style.opacity = o.toFixed(3);
    const dy = (1 - a) * 16 - (1 - b) * 12;
    el.style.transform = `translate(-50%,-50%) translateY(${dy.toFixed(2)}px)`;
    el.style.filter = o > 0.001 && o < 0.98 ? `blur(${((1 - o) * 6).toFixed(2)}px)` : 'none';
  }

  // PackGlitter: mouth glow + 22 fixed sparks rising; tau = seconds since the flow became active
  function drawFlow(c, rect, o, tau, alpha, kpx) {
    if (alpha <= 0.002) return;
    const mx = rect.x + rect.w * o.x, my = rect.y + rect.h * o.y;
    const sw = rect.w * o.w, sh = rect.h * o.rise;
    // .mouth: an ellipse of light across the opening
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = alpha;
    c.translate(mx, my);
    c.scale(sw / 2, rect.h * 0.045 / 2);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(221,214,255,.2)'); g.addColorStop(0.4, 'rgba(150,110,255,.1)'); g.addColorStop(0.72, 'rgba(150,110,255,0)');
    c.fillStyle = g;
    c.fillRect(-1, -1, 2, 2);
    c.restore();
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < SPARKS.length; i++) {
      const s = SPARKS[i];
      const p = ((s.delay + tau) / s.dur) % 1;
      const kf = sparkAt(p);
      const a = kf.o * alpha;
      if (a < 0.004) continue;
      const size = s.size * kpx;
      const eh = s.h * sh;                       // the particle element's height (its dot sits at the bottom)
      const x = mx - sw / 2 + s.x * sw + size / 2 + s.drift * kpx * kf.dx;
      const dw = size * kf.sc, dh = (s.tall ? 2.1 : 1) * size * kf.sc;   // scaled about its bottom centre
      const y = my + kf.dy * eh - dh / 2;
      const rx = dw / 2 + 6 * kpx, ry = dh / 2 + 6 * kpx;               // core + box-shadow halo
      c.globalAlpha = Math.min(1, a);
      c.drawImage(sprite(SPARK_COL[s.col][0], SPARK_COL[s.col][1]), x - rx, y - ry, rx * 2, ry * 2);
    }
    c.restore();
  }

  function coinFrames(yaw) {
    const f = clamp((yaw + 40) / 2, 0, 40), a = Math.floor(f);
    return { a, b: Math.min(40, a + 1), u: f - a };
  }
  function drawCoin(c, st, x, y, D, yaw, alpha) {
    const q = coinFrames(yaw);
    const ia = TURN[q.a], ib = TURN[q.b];
    if (!ok(ia)) return;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = alpha;
    c.drawImage(ia, x - D / 2, y - D / 2, D, D);
    if (q.u > 0.02 && ok(ib)) { c.globalAlpha = alpha * q.u; c.drawImage(ib, x - D / 2, y - D / 2, D, D); }
    c.globalAlpha = 1;
  }

  // key light: a broad white falloff from the upper left, masked by the coin's alpha, screened on;
  // plus a thin cool specular along the upper-left of the rim
  function keyLight(c, st, x, y, D, yaw, amt) {
    const q = coinFrames(yaw);
    if (!ok(TURN[q.a])) return;
    // the lit mask only changes with the turn frame (~6 / s) and the size (quantised), so it is cached
    const N = Math.max(64, Math.ceil(D / 8) * 8);
    if (!st.kl) { st.kl = document.createElement('canvas'); st.klC = st.kl.getContext('2d'); st.klKey = ''; }
    const off = st.kl, o2 = st.klC, key = q.a + '|' + N;
    if (st.klKey !== key) {
      st.klKey = key;
      if (off.width !== N) { off.width = N; off.height = N; }
      o2.setTransform(1, 0, 0, 1, 0, 0);
      o2.globalCompositeOperation = 'source-over'; o2.globalAlpha = 1;
      o2.clearRect(0, 0, N, N);
      o2.drawImage(TURN[q.a], 0, 0, N, N);
      o2.globalCompositeOperation = 'source-in';
      const g = o2.createRadialGradient(N * 0.3, N * 0.24, 0, N * 0.3, N * 0.24, N * 0.72);
      g.addColorStop(0, 'rgba(255,255,255,.3)'); g.addColorStop(0.3, 'rgba(238,242,255,.16)');
      g.addColorStop(0.65, 'rgba(220,226,250,.06)'); g.addColorStop(1, 'rgba(220,226,250,0)');
      o2.fillStyle = g;
      o2.fillRect(0, 0, N, N);
    }
    c.save();
    c.globalCompositeOperation = 'screen';
    c.globalAlpha = amt;
    c.drawImage(off, x - D / 2, y - D / 2, D, D);
    // specular rim
    const ry = D * TURN_DISC * 0.5 - Math.max(1.5, D * 0.004), rx = ry * Math.max(0.05, Math.cos(yaw * Math.PI / 180));
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    const W1 = Math.max(1.2, D * 0.0045);
    [[W1 * 3.2, 0.1], [W1, 0.5]].forEach(([w, al]) => {
      c.lineWidth = w;
      c.strokeStyle = 'rgba(236,240,255,1)';
      c.globalAlpha = amt * al;
      c.beginPath(); c.ellipse(x, y, rx, ry, 0, Math.PI * 1.02, Math.PI * 1.5); c.stroke();
      c.globalAlpha = amt * al * 0.45;
      c.beginPath(); c.ellipse(x, y, rx, ry, 0, Math.PI * 0.86, Math.PI * 1.02); c.stroke();
      c.beginPath(); c.ellipse(x, y, rx, ry, 0, Math.PI * 1.5, Math.PI * 1.64); c.stroke();
    });
    c.restore();
  }

  // a narrow band of light, masked by the coin's own alpha, added on top (a glint across the relief)
  function sheen(c, st, x, y, D, yaw, u, amt) {
    const N = Math.max(64, Math.ceil(D));
    const off = st.off, oc2 = st.offC;
    if (off.width !== N) { off.width = N; off.height = N; }
    oc2.setTransform(1, 0, 0, 1, 0, 0);
    oc2.globalCompositeOperation = 'source-over'; oc2.globalAlpha = 1;
    oc2.clearRect(0, 0, N, N);
    const q = coinFrames(yaw);
    if (!ok(TURN[q.a])) return;
    oc2.drawImage(TURN[q.a], 0, 0, N, N);
    oc2.globalCompositeOperation = 'source-in';
    const b = lerp(-0.4, 1.4, ios(u));
    const g = oc2.createLinearGradient(N * (b - 0.3), N * (b - 0.5), N * (b + 0.3), N * (b + 0.1));
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.38, 'rgba(206,196,255,0)');
    g.addColorStop(0.46, 'rgba(214,204,255,.16)');
    g.addColorStop(0.5, 'rgba(255,255,255,.78)');
    g.addColorStop(0.54, 'rgba(214,204,255,.16)');
    g.addColorStop(0.62, 'rgba(206,196,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    oc2.fillStyle = g;
    oc2.fillRect(0, 0, N, N);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = amt * Math.sin(Math.PI * u);
    c.drawImage(off, x - D / 2, y - D / 2, D, D);
    c.restore();
  }

  // gold light travelling over the top of the rim, with a four-point star at its head
  function glint(c, x, y, rx, ry, u) {
    const a0 = 200, a1 = 330;
    const a = lerp(a0, a1, ios(u)) * Math.PI / 180;
    const env = Math.sin(Math.PI * u);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.translate(x, y);
    c.lineCap = 'round';
    const trail = 0.42;
    for (let k = 0; k < 3; k++) {
      const w = [16, 7, 2.6][k], al = [0.18, 0.4, 0.9][k];
      c.strokeStyle = k === 2 ? '#FFF1CF' : '#E6B45A';
      c.globalAlpha = al * env;
      c.lineWidth = w;
      c.beginPath();
      c.ellipse(0, 0, rx - 6, ry - 6, 0, a - trail * (1 - k * 0.25), a);
      c.stroke();
    }
    const sx = (rx - 6) * Math.cos(a), sy = (ry - 6) * Math.sin(a);
    const R = 44 * (0.75 + 0.35 * env);
    const g = c.createRadialGradient(sx, sy, 0, sx, sy, R);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,241,207,.85)');
    g.addColorStop(0.5, 'rgba(230,180,90,.35)'); g.addColorStop(1, 'rgba(230,180,90,0)');
    c.globalAlpha = env;
    c.fillStyle = g;
    c.beginPath(); c.arc(sx, sy, R, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#FFF6E0';
    c.translate(sx, sy);
    const L = 56 * env + 10, V = 0.62 * L, w = 3.2;   // anamorphic: the horizontal ray is the long one
    c.beginPath();
    c.moveTo(0, -V); c.lineTo(w, -w); c.lineTo(L, 0); c.lineTo(w, w); c.lineTo(0, V); c.lineTo(-w, w); c.lineTo(-L, 0); c.lineTo(-w, -w);
    c.closePath(); c.fill();
    c.restore();
  }
})();
