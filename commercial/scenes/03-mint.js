/* ============================================================================
   03-mint.js — beat 03 "MINT THE ONE YOU LOVE" (5.0–10.0)
   The client's real app on a phone (BVApp): the Eye of the Unknown chooser,
   a tap on VERITAS, the "Make it yours." checkout, a tap on the gold Mint
   button, the real PayStages rail to "Payment confirmed", then the real
   Veritas coin (3D yaw-sweep renders of the client's GLB) flies up out of the
   phone and the on-chain certificate chip docks under it.
   Supers: FALL FOR ONE? (5.2) · MINT IT. LIVE ON BASE. (7.0) ·
           GAS COVERED · ON-CHAIN CERTIFICATE (8.6)
   Pure function of t: no timers, no randomness (seeded BVKit.rng only).
   ========================================================================== */
(function () {
  'use strict';
  const K = window.BVKit, S = window.BVShared, A = window.BVApp, BV = window.BV;
  if (!K || !S || !A || !BV) { console.error('[03-mint] missing BVKit/BVShared/BVApp/BV'); return; }

  const C = S.CUES;
  const COIN = S.ROLES.minted;                 // 'veritas'
  const ED = S.ROLES.mintedEdition || 7;
  const T0 = 4.85, T1 = 10.1;                  // scene window (overlaps 02 / 04)
  const CUT_OUT = 10.0;                        // hard cut on the downbeat into the sealed case
  const { clamp, lerp, range, ease } = K;
  const oq = ease.outQuint, oc = ease.outCubic, ioc = ease.inOutCubic, ios = ease.inOutSine;

  // Brand
  const WHITE = '#F6F7FC', SEC = '#B4BFD1';
  const BRIDGE = ['#67DCEA', '#7793FF', '#855CFF'];

  // Real 3D renders of the client's Veritas GLB: yaw = -40 + 2*i, i = 0..40 (frame 20 face-on).
  const TURN = Array.from({ length: 41 }, (_, i) => 'assets/coins3d/' + COIN + '-turn/' + String(i).padStart(2, '0') + '.webp');
  const DISC = 0.887;                          // coin disc / frame size in the turn renders

  // Timeline (global seconds)
  const TL = {
    phoneIn: [4.88, 5.6],
    sheetUp: [5.08, 5.55],
    scroll: [5.38, 5.72],
    tapCoin: C.tapCoin,                        // 5.8
    lift: [5.8, 6.15],
    checkout: [6.22, 6.72],                    // sheet 6.4
    tapMint: C.tapMint,                        // 7.2
    stage: [7.32, 8.22],                       // rail Prepare..Complete -> Payment confirmed 8.2
    fly: [8.2, 8.9],
    chip: [8.6, 9.15],
    pulse: [8.55, 9.35]
  };

  let images = null;                           // shared preloaded turn frames (Image objects)
  function loadTurn() {
    if (images) return images;
    images = TURN.map(src => { const im = new Image(); im.decoding = 'sync'; im.src = src; BV.preload(im); return im; });
    return images;
  }

  // Bezier helpers for the arc of light / flight path
  const bez = (p0, p1, p2, p3, u) => {
    const v = 1 - u;
    return v * v * v * p0 + 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u * p3;
  };

  function geometry(ctx) {
    const P = ctx.portrait, W = ctx.W, H = ctx.H;
    const L = S.layout(ctx);
    if (P) {
      return {
        L,
        // coin landing (over the receding phone) + chip under it
        coin: { x: 540, y: 742, D: 740 },
        chipY: 1172, nameY: 1114,
        // supers in the 9:16 top band (220 .. 450)
        sup: { x: 540, y: 335, align: 'center', size: 112, sizeSm: 34, w: 952 },
        smallY: 335,
        arc: { d: `M -120 1560 C 120 420, 900 300, 1200 980`, w: W, h: H },
        phoneOut: { y: 720, s: 0.94, dim: 0.72 }
      };
    }
    return {
      L,
      coin: { x: 1440, y: 420, D: 620 },
      chipY: 806, nameY: 752,
      sup: { x: 1075, y: 520, align: 'left', size: 142, sizeSm: 24, w: 760 },
      smallY: 884,
      arc: { d: `M -140 1080 C 260 160, 1320 -60, 2060 700`, w: W, h: H },
      phoneOut: { y: 30, s: 0.95, dim: 0.5 }
    };
  }

  BV.scene({
    id: 'mint',
    start: T0, end: T1, z: 30,
    chapter: 'Mint the one you love',

    build(root, ctx) {
      const G = geometry(ctx);
      const W = ctx.W, H = ctx.H, P = ctx.portrait;
      loadTurn();
      root.style.overflow = 'hidden';

      /* ── background: obsidian + one arc of light ─────────────────────────── */
      const bg = K.el('div', { parent: root, style: `position:absolute;inset:0;background:
        radial-gradient(${P ? '90% 46% at 50% 44%' : '60% 70% at 52% 48%'},#120f26 0%,#0b0c18 46%,#080A12 78%)` });
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('width', W); svg.setAttribute('height', H);
      svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none';
      svg.innerHTML = `<defs>
          <linearGradient id="m3-br" gradientUnits="userSpaceOnUse" x1="0" y1="${H}" x2="${W}" y2="0">
            <stop offset="0" stop-color="${BRIDGE[0]}"/><stop offset=".5" stop-color="${BRIDGE[1]}"/><stop offset="1" stop-color="${BRIDGE[2]}"/></linearGradient>
          <filter id="m3-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${P ? 34 : 30}"/></filter>
          <filter id="m3-blur2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
        </defs>
        <g class="m3-glow" filter="url(#m3-blur)" opacity="0"><path d="${G.arc.d}" fill="none" stroke="url(#m3-br)" stroke-width="${P ? 120 : 110}" stroke-linecap="round" opacity=".42"/></g>
        <g class="m3-halo" filter="url(#m3-blur2)"><path class="m3-hp" d="${G.arc.d}" fill="none" stroke="url(#m3-br)" stroke-width="14" stroke-linecap="round" opacity=".55"/></g>
        <path class="m3-core" d="${G.arc.d}" fill="none" stroke="url(#m3-br)" stroke-width="2.4" stroke-linecap="round"/>
        <path class="m3-pulse" d="${G.arc.d}" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0"/>
        <path class="m3-pulseg" d="${G.arc.d}" fill="none" stroke="#cfe0ff" stroke-width="22" stroke-linecap="round" opacity="0" filter="url(#m3-blur2)"/>`;
      root.appendChild(svg);
      const glowG = svg.querySelector('.m3-glow');
      const core = svg.querySelector('.m3-core'), halo = svg.querySelector('.m3-hp');
      const pulse = svg.querySelector('.m3-pulse'), pulseG = svg.querySelector('.m3-pulseg');
      const arcLen = core.getTotalLength();
      [core, halo].forEach(p => { p.style.strokeDasharray = arcLen + ' ' + arcLen; });
      const plen = arcLen * 0.09;
      [pulse, pulseG].forEach(p => { p.style.strokeDasharray = plen + ' ' + arcLen * 2; });

      /* ── the phone with the real app ─────────────────────────────────────── */
      const ph = G.L.phone;
      const floor = K.el('div', { parent: root, style: `position:absolute;left:${ph.cx - ph.w * 0.95}px;top:${ph.y + ph.h - ph.h * 0.16}px;width:${ph.w * 1.9}px;height:${ph.h * 0.32}px;
        border-radius:50%;background:radial-gradient(closest-side,rgba(133,92,255,.34),rgba(119,147,255,.12) 55%,transparent);opacity:0;pointer-events:none` });

      const phone = A.phone(root, ctx, { time: '9:41' });
      const scr = phone.screen;
      const chooser = A.chooser(scr, { coins: S.ORDER, edition: 50 });
      const checkout = A.checkout(scr, { coinId: COIN, edition: 50, button: 'Mint' });
      const dim = K.el('div', { parent: scr, style: 'position:absolute;inset:0;background:#05060c;opacity:0;pointer-events:none;z-index:30' });
      const glassWrap = K.el('div', { parent: scr, style: 'position:absolute;inset:0;pointer-events:none;z-index:44;overflow:hidden' });
      const glass = K.el('div', { parent: glassWrap, style: `position:absolute;left:0;top:-50%;width:55%;height:200%;opacity:0;will-change:transform,opacity;
        background:linear-gradient(90deg,rgba(255,255,255,0),rgba(214,226,255,.07) 35%,rgba(255,255,255,.16) 50%,rgba(214,226,255,.07) 65%,rgba(255,255,255,0))` });
      const touch = A.touch(scr);
      touch.el.style.filter = 'drop-shadow(0 0 5px rgba(0,0,0,.55))';
      phone.raise();
      checkout.open(0);
      chooser.open(0);

      // where things are inside the screen (stage px relative to the screen, untransformed)
      const k = phone.k;
      const flow = checkout.sheet.querySelector('.bva-flow');
      const pieceArt = checkout.sheet.querySelector('.bva-piece-art');
      const pieceImg = pieceArt && pieceArt.querySelector('img');
      // scroll the chooser so the Veritas card (row 3) is fully in view
      const sheetBox = A.pos(chooser.sheet, scr);
      const vcard = chooser.cards[COIN].card;
      const vbox = A.pos(vcard, chooser.sheet);
      const needScroll = Math.max(0, (vbox.y + vbox.h + 22 * k - sheetBox.h) / k);
      const scrollPx = Math.min(needScroll, chooser.maxScroll ? chooser.maxScroll() + 4 : needScroll);

      /* ── coin flight (canvas over everything) ───────────────────────────── */
      const coinGlow = K.el('div', { parent: root, style: `position:absolute;left:0;top:0;width:${G.coin.D * 1.6}px;height:${G.coin.D * 1.6}px;margin:${-G.coin.D * 0.8}px 0 0 ${-G.coin.D * 0.8}px;
        border-radius:50%;background:radial-gradient(closest-side,rgba(190,170,255,.5),rgba(133,92,255,.24) 42%,rgba(119,147,255,.08) 64%,transparent);opacity:0;pointer-events:none;will-change:transform,opacity` });
      const bloom = K.el('div', { parent: root, style: `position:absolute;left:0;top:0;width:600px;height:600px;margin:-300px 0 0 -300px;border-radius:50%;
        background:radial-gradient(closest-side,rgba(255,255,255,.95),rgba(212,195,255,.55) 22%,rgba(133,92,255,.22) 50%,transparent);opacity:0;pointer-events:none;mix-blend-mode:screen;will-change:transform,opacity` });
      const cv = K.el('canvas', { parent: root, style: 'position:absolute;left:0;top:0;pointer-events:none' });
      cv.width = W; cv.height = H; cv.style.width = W + 'px'; cv.style.height = H + 'px';
      const cx2 = cv.getContext('2d');

      const glitter = K.particles(cv, {
        seed: 303, count: P ? 70 : 60, x: 0, y: 0, spread: 14, speed: [180, 820], angle: [0, 360],
        gravity: 120, drag: 3.2, life: [0.45, 1.0], size: [1.6, 3.6], shape: ['star', 'dot', 'spark'],
        colors: ['#e4d9ff', '#e4d9ff', '#e4d9ff', '#cff8ff', '#e4d9ff', '#e4d9ff', '#fff1d2'], twinkle: 0.4, tail: 0.03
      });
      const dust = K.emitter(cv, {
        seed: 31, rate: 16, x: G.coin.x, y: G.coin.y + G.coin.D * 0.36, w: G.coin.D * 0.7, h: 30,
        speed: [20, 60], angle: [250, 290], gravity: -14, drag: 0.4, life: [1.6, 2.6], size: [1.2, 2.6], shape: 'dot',
        colors: ['#e4d9ff', '#e4d9ff', '#e4d9ff', '#cff8ff', '#e4d9ff', '#e4d9ff', '#fff1d2'], twinkle: 0.5, sway: [10, 0.4], alpha: 0.8
      });

      /* ── name + certificate chip under the coin ─────────────────────────── */
      const chipK = P ? 1.62 : 1.38;
      const name = K.el('div', { parent: root, html: 'VERITAS', style: `position:absolute;left:${G.coin.x}px;top:${G.nameY}px;transform:translate(-50%,-50%);
        font:600 ${P ? 26 : 21}px 'Geist',system-ui,sans-serif;letter-spacing:.34em;padding-left:.34em;color:${SEC};white-space:nowrap;opacity:0` });
      const chipWrap = K.el('div', { parent: root, style: `position:absolute;left:${G.coin.x}px;top:${G.chipY}px;width:0;height:0` });
      const chipIn = K.el('div', { parent: chipWrap, style: 'position:absolute;left:0;top:0;transform:translate(-50%,-50%)' });
      const chip = A.record(chipIn, { coinId: COIN, edition: ED, mintage: 50, variant: 'chip', scale: chipK });
      chip.show(0);

      /* ── supers ─────────────────────────────────────────────────────────── */
      const sp = G.sup;
      const supOpts = { cls: 'hero', x: sp.x, y: sp.y, align: sp.align, size: sp.size, color: WHITE, weight: 700,
        letterSpacing: '-0.02em', lineHeight: 0.92, split: 'chars', shadow: true };
      const sFall = K.superText(root, P ? 'FALL FOR ONE?' : 'FALL FOR\nONE?', Object.assign({}, supOpts, { fit: sp.w }));
      const sMint = K.superText(root, P ? 'MINT IT.\nLIVE ON BASE.' : 'MINT IT.\nLIVE ON\nBASE.', Object.assign({}, supOpts, { size: P ? 104 : 128, fit: sp.w }));
      const sSmall = K.superText(root, 'GAS COVERED · ON-CHAIN CERTIFICATE', {
        cls: 'tag', x: P ? 540 : G.coin.x, y: G.smallY, align: 'center', size: sp.sizeSm, color: SEC, weight: 600,
        letterSpacing: P ? '0.26em' : '0.22em', font: "'Geist', system-ui, sans-serif", split: 'words' });

      // where the coin leaves the phone: the checkout's piece thumbnail at the moment of payment (8.2)
      const pb = pieceArt ? A.pos(pieceArt, root) : { cx: ph.cx, cy: ph.cy, w: 68 * k };
      const dY = (8.2 - 5.6) * (P ? -3 : -4);
      const a0 = { x: pb.cx, y: pb.cy + dY, D: pb.w * 0.92 * 0.872 / DISC };
      // trail sparkles: colours per the case glitter rule (#e4d9ff, every 4th #cff8ff, every 7th #fff1d2)
      const R = K.rng(3031);
      const COLS = ['#e4d9ff', '#cff8ff', '#fff1d2'];
      const sprites = COLS.map(sprite);
      const trail = [];
      for (let i = 0; i < (P ? 110 : 96); i++) {
        const ang = R() * Math.PI * 2, sp = 30 + R() * 140;
        trail.push({ tb: TL.fly[0] + 0.02 + Math.pow(R(), 1.3) * 0.62, rr: 0.55 + R() * 0.55, th: R() * Math.PI * 2,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 40, life: 0.45 + R() * 0.8, size: 1.6 + R() * 2.8,
          tw: 6 + R() * 14, ph: R() * 6, col: (i % 7 === 6) ? 2 : (i % 4 === 3) ? 1 : 0 });
      }

      return { G, P, a0, trail, sprites, glass, svg, glowG, core, halo, pulse, pulseG, arcLen, floor, phone, chooser, checkout, dim, touch, flow,
        pieceArt, pieceImg, scrollPx, coinGlow, bloom, cv, cx2, glitter, dust, name, chipWrap, chip, sFall, sMint, sSmall, bg };
    },

    update(s, local, t, ctx) {
      const G = s.G, P = ctx.portrait, W = ctx.W, H = ctx.H;
      const root = s.svg.parentNode;

      /* scene in / out */
      const vin = range(t, 4.95, 5.0);            // near-hard cut on the downbeat (no double exposure with 02)
      root.style.opacity = t >= CUT_OUT ? 0 : vin;

      /* ── arc of light: draws in across the frame, then breathes ─────────── */
      const draw = oq(range(t, 4.95, 5.85));
      const off = s.arcLen * (1 - draw);
      s.core.style.strokeDashoffset = off; s.halo.style.strokeDashoffset = off;
      s.glowG.setAttribute('opacity', (draw * (0.75 + 0.25 * Math.sin((t - 5) * 2.2)) + 0.35 * K.env(t, 8.18, 8.3, 8.6, 9.4)).toFixed(3));
      s.core.style.opacity = 0.55 + 0.45 * draw;
      // certificate pulse rides the arc when the chip docks
      const pu = range(t, TL.pulse[0], TL.pulse[1]);
      const pa = pu > 0 && pu < 1 ? Math.sin(pu * Math.PI) : 0;
      const poff = s.arcLen * (1 - ios(pu) * 1.1) ;
      [s.pulse, s.pulseG].forEach(p => { p.style.strokeDashoffset = poff; });
      s.pulse.setAttribute('opacity', (pa * 0.95).toFixed(3));
      s.pulseG.setAttribute('opacity', (pa * 0.6).toFixed(3));

      /* ── phone entrance / recede ────────────────────────────────────────── */
      const pin = oq(range(t, TL.phoneIn[0], TL.phoneIn[1]));
      const prc = oc(range(t, 8.22, 9.0));
      const drift = (t - 5.6) * (P ? -3 : -4);   // slow float
      const pY = (1 - pin) * (P ? 900 : 820) + prc * G.phoneOut.y + drift;
      const pS = (0.9 + 0.1 * pin) * (1 - (1 - G.phoneOut.s) * prc);
      const pRx = (1 - pin) * 22;
      const pRy = (P ? 0 : -6 * (1 - pin)) + (P ? 0 : 3.5 * ios(range(t, 5.4, 9.5)));
      s.phone.set({ x: P ? 0 : -prc * 40, y: pY, s: pS, rx: pRx, ry: pRy, o: 1, glow: 0.2 + 0.25 * pin - 0.1 * prc });
      s.floor.style.opacity = (0.9 * pin * (1 - 0.4 * prc)).toFixed(3);
      s.dim.style.opacity = (G.phoneOut.dim * prc).toFixed(3);

      // a glint of light across the glass as the phone lands, and again at "Payment confirmed"
      const gw1 = range(t, 5.2, 5.85), gw2 = range(t, 8.05, 8.45);
      const gw = gw1 > 0 && gw1 < 1 ? gw1 : (gw2 > 0 && gw2 < 1 ? gw2 : -1);
      if (gw >= 0) {
        s.glass.style.opacity = Math.sin(Math.PI * gw).toFixed(3);
        s.glass.style.transform = `translateX(${(-110 + 330 * ios(gw)).toFixed(1)}%) rotate(18deg)`;
      } else s.glass.style.opacity = 0;

      /* ── screen: chooser -> tap Veritas -> checkout -> tap Mint -> rail ── */
      s.chooser.open(range(t, TL.sheetUp[0], TL.sheetUp[1]));
      s.chooser.scroll(s.scrollPx * ioc(range(t, TL.scroll[0], TL.scroll[1])));
      s.chooser.press(COIN, range(t, TL.tapCoin - 0.1, TL.tapCoin + 0.32));
      s.chooser.highlight(COIN, oc(range(t, TL.lift[0], TL.lift[1])));
      const focus = oc(range(t, 5.86, 6.25));
      S.ORDER.forEach(id => { if (id !== COIN) s.chooser.cards[id].card.style.opacity = (1 - 0.6 * focus).toFixed(3); });

      s.checkout.open(range(t, TL.checkout[0], TL.checkout[1]));
      s.checkout.press(range(t, TL.tapMint - 0.08, TL.tapMint + 0.42));
      const sv = t < TL.stage[0] ? -1 : 5.3 * range(t, TL.stage[0], TL.stage[1] + 0.05);
      s.checkout.stage(sv);

      // touch ring: Veritas card, then the gold Mint button
      const scr = s.phone.screen;
      let tp = range(t, TL.tapCoin - 0.28, TL.tapCoin + 0.42);
      if (tp > 0 && tp < 1) {
        const c = s.chooser.center(COIN, scr);
        s.touch.set(c.x + c.w * 0.06, c.y + c.w * 0.36, tp);   // thumb lands on the card's lower half, not over the silver iris
      } else {
        tp = range(t, TL.tapMint - 0.28, TL.tapMint + 0.42);
        if (tp > 0 && tp < 1) { const b = s.checkout.center(scr); s.touch.set(b.cx, b.cy, tp); }
        else s.touch.set(0, 0, 0);
      }

      /* ── supers ─────────────────────────────────────────────────────────── */
      K.animText(s.sFall, t, C.fallForOne, 6.9, { style: 'rise', stagger: 0.022, dur: 0.5, outStyle: 'blur', outDur: 0.25 });
      K.animText(s.sMint, t, C.mintIt, 8.32, { style: 'rise', stagger: 0.02, dur: 0.5, outStyle: 'blur', outDur: 0.22 });
      K.animText(s.sSmall, t, C.certificate + 0.05, Infinity, { style: 'rise', stagger: 0.05, dur: 0.45 });

      /* ── payment confirmed: the coin flies up out of the phone ─────────── */
      const cx2 = s.cx2;
      cx2.setTransform(1, 0, 0, 1, 0, 0);
      cx2.clearRect(0, 0, W, H);
      cx2.globalCompositeOperation = 'source-over'; cx2.globalAlpha = 1;
      const a = s.a0;
      if (s.pieceImg) s.pieceImg.style.opacity = t >= TL.fly[0] ? 0 : 1;

      // light bloom where the coin leaves the screen
      const bl = K.env(t, 8.16, 8.22, 8.28, 8.8);
      s.bloom.style.opacity = bl.toFixed(3);
      s.bloom.style.transform = `translate3d(${a.x}px,${a.y}px,0) scale(${(0.3 + 1.2 * oc(range(t, 8.16, 8.75))).toFixed(3)})`;
      if (t >= 8.2 && t < 8.7) { const sh = K.shake(t - 8.2, 6, 37, 7); BV.camera.x += sh.x; BV.camera.y += sh.y; }

      if (t >= TL.fly[0]) {
        const q = flight(s, t);
        const tgt = G.coin;
        const floatY = Math.sin((t - 8.9) * 2.1) * 7 * clamp((t - 8.9) / 0.5);
        // yaw: arrives edge-on from the right, settles face-on, then a slow living turn
        let yaw = lerp(40, 0, oc(range(t, TL.fly[0], TL.fly[1] + 0.1)));
        yaw += -9 * Math.sin((t - 9.0) * 1.35) * clamp((t - 8.95) / 0.6);
        const roll = lerp(-16, 0, oc(range(t, TL.fly[0], TL.fly[1]))) + Math.sin((t - 8.9) * 1.1) * 1.2 * clamp((t - 8.9) / 0.6);
        const exitS = 1 + 0.07 * ease.inCubic(range(t, 9.7, CUT_OUT));

        // light trail: ghosts while it is fast
        const fast = 1 - range(t, TL.fly[0] + 0.2, TL.fly[0] + 0.5);
        if (fast > 0) {
          for (let g = 5; g >= 1; g--) {
            const qg = flight(s, Math.max(TL.fly[0], t - g * 0.016));
            drawCoin(cx2, qg.x, qg.y, qg.D, yaw + g * 2.5, roll, (0.22 / g) * fast, null);
          }
        }
        // soft glow behind
        const gl = oc(range(t, 8.3, 9.0));
        s.coinGlow.style.opacity = (gl * 0.95).toFixed(3);
        s.coinGlow.style.transform = `translate3d(${q.x}px,${(q.y + floatY + q.D * 0.03).toFixed(1)}px,0) scale(${(q.D / tgt.D * exitS).toFixed(3)})`;
        // sheen: one sweep across the relief as it faces us, one before the cut
        const sw1 = range(t, 8.66, 9.2), sw2 = range(t, 9.45, 9.95);
        const sheen = sw1 > 0 && sw1 < 1 ? { u: sw1, a: 0.85 } : (sw2 > 0 && sw2 < 1 ? { u: sw2, a: 0.6 } : null);
        drawCoin(cx2, q.x, q.y + floatY, q.D * exitS, yaw, roll, 1, sheen);
      } else {
        s.coinGlow.style.opacity = 0;
      }

      // glitter: burst at the screen, sparkles shed along the flight, fine dust under the hovering coin
      if (t >= 8.18) {
        cx2.save(); cx2.translate(a.x, a.y);
        s.glitter.draw(cx2, t - 8.18);
        cx2.restore();
        drawTrail(cx2, s, t);
      }
      if (t >= 8.8) { s.dust.draw(cx2, t - 8.8); }
      cx2.globalCompositeOperation = 'source-over'; cx2.globalAlpha = 1;

      /* ── name + chip dock under the coin ────────────────────────────────── */
      const np = oc(range(t, 8.55, 9.0));
      s.name.style.opacity = np.toFixed(3);
      s.name.style.transform = `translate(-50%,-50%) translateY(${((1 - np) * 12).toFixed(1)}px)`;
      s.chip.show(range(t, TL.chip[0], TL.chip[1]));

      /* ── camera: slow push across the beat ──────────────────────────────── */
      BV.camera.s *= 1 + 0.025 * ios(range(t, 5.0, 10.0));
      // push in on the checkout while it works, release as the coin flies out
      BV.camera.s *= 1 + 0.045 * ios(range(t, 6.3, 8.1)) * (1 - oc(range(t, 8.15, 8.9)));
      // into the cut: the coin leans in, the frame darkens around it
      if (t >= 9.7) BV.fx.vignette(0.55 * ease.inCubic(range(t, 9.7, CUT_OUT)));
    }
  });

  // Flight path (pure function of global time): out of the screen, towards camera, landing on its float spot.
  function flight(s, t) {
    const a = s.a0, tgt = s.G.coin, P = s.P;
    const f = range(t, TL.fly[0], TL.fly[1]);
    const e = 1 - Math.pow(1 - f, 3.2);
    const c1 = P ? { x: a.x + 30, y: a.y - 260 } : { x: a.x + 120, y: a.y - 230 };
    const c2 = P ? { x: tgt.x, y: tgt.y + 40 } : { x: tgt.x - 220, y: tgt.y - 60 };
    const x = bez(a.x, c1.x, c2.x, tgt.x, e), y = bez(a.y, c1.y, c2.y, tgt.y, e);
    const g = 1 - Math.pow(1 - f, 2.6);
    const D = lerp(a.D, tgt.D, g) * (1 + 0.035 * Math.sin(Math.PI * range(f, 0.5, 1)));
    return { x, y, D, f };
  }

  // Sparkles shed along the flight path (closed form: born at a point on the path, drift, fade).
  function drawTrail(c, s, t) {
    const list = s.trail, spr = s.sprites;
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const age = t - p.tb;
      if (age < 0 || age > p.life) continue;
      const u = age / p.life;
      const q = flight(s, p.tb);
      const r = q.D * DISC * 0.5 * p.rr;
      const k = 1 - Math.exp(-2.4 * age);
      const x = q.x + Math.cos(p.th) * r + p.vx * k / 2.4;
      const y = q.y + Math.sin(p.th) * r + p.vy * k / 2.4 + 40 * age * age;
      const tw = 0.65 + 0.35 * Math.sin(age * p.tw + p.ph);
      const al = (1 - u) * (1 - u) * tw * (u < 0.08 ? u / 0.08 : 1);
      const sz = p.size * (1 - 0.4 * u);
      c.globalAlpha = Math.min(1, al);
      c.drawImage(spr[p.col], x - sz * 3, y - sz * 3, sz * 6, sz * 6);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }

  function sprite(hex) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 48;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(24, 24, 0, 24, 24, 24);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, hex); g.addColorStop(0.45, K.rgba(hex, 0.35)); g.addColorStop(1, K.rgba(hex, 0));
    c.fillStyle = g; c.fillRect(0, 0, 48, 48);
    return cv;
  }

  let off = null, offC = null;                 // offscreen buffer for the additive specular sweep
  function drawCoin(c, x, y, D, yaw, roll, alpha, sheen) {
    const fi = clamp(Math.round((yaw + 40) / 2), 0, 40);
    const im = images && images[fi];
    if (!im || !im.complete || !im.naturalWidth) return;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    if (roll) c.rotate(roll * Math.PI / 180);
    c.drawImage(im, -D / 2, -D / 2, D, D);
    if (sheen) {
      // a narrow band of light, masked by the coin's own alpha, added on top (reads as a specular glint on the relief)
      const N = Math.max(64, Math.ceil(D));
      if (!off) { off = document.createElement('canvas'); offC = off.getContext('2d'); }
      if (off.width !== N) { off.width = N; off.height = N; }
      offC.setTransform(1, 0, 0, 1, 0, 0);
      offC.globalCompositeOperation = 'source-over'; offC.globalAlpha = 1;
      offC.clearRect(0, 0, N, N);
      offC.drawImage(im, 0, 0, N, N);
      offC.globalCompositeOperation = 'source-in';
      const u = ease.inOutSine(sheen.u);
      const cx = lerp(-0.45, 1.45, u) * N;
      const g = offC.createLinearGradient(cx - N * 0.2, 0, cx + N * 0.2, N * 0.35);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.38, 'rgba(214,226,255,0.22)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.62, 'rgba(214,226,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      offC.fillStyle = g;
      offC.fillRect(0, 0, N, N);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = alpha * sheen.a * Math.sin(Math.PI * sheen.u);
      c.drawImage(off, -D / 2, -D / 2, D, D);
    }
    c.restore();
  }
})();
