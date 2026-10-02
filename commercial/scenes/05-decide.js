/* ============================================================================
   05-decide.js — beat 05 "YOUR COIN, YOUR CALL" (20.0–25.0)
   The spine is the client's own reveal line: "Your exact coin. Keep it vaulted,
   list it, or bring it home." Four hard beats (1.25 s each, on the 120 BPM
   grid), the real DOMINION coin (3D yaw-sweep renders of the client's GLB)
   staying the hero, each beat with ONE real-UI element from BVApp:
     20.00  KEEP IT VAULTED.             chip "Secure vault · Liechtenstein"  (coin settles into a velvet slot, seam line of light)
     21.25  LIST IT.                     ask card + chip "Listed · collectors on Base"  (no amounts)
     22.50  BRING IT HOME.               chip "Ship home · tracked"  (a label card slides under the coin)
     23.75  OR TAKE 80% BACK. INSTANTLY. always-visible subtitle from BV_CONFIG.buyback,
                                         gold ring meter fills to 80% around the coin (the ONE gold accent)
     24.50  confirm pulse on the ring.
   Continuity: starts on 04's live hand-off pose (window.BVBox.pose(ctx, 20.0): same coin, same turn
   frame, same size and screen position incl. 04's truck), our 20.0 punch divided out, then the hit
   whips it into the beat. Beat 1: visible velvet bed + slot with a lit upper lip, coin sinks 8 %;
   the lid line sweeps down over the coin and is gone by 20.86 (one arc of light remains).
   Lighting continuity with 04: the shared turn frames (window.BVBox.turnImages()), 04's coin-layer grade
   (filter brightness(1.08) contrast(1.05)), 04's key light + cool rim specular, frames cross-faded like 04,
   and no flash on the 20.0 hit, so the coin's mean luminance holds across the cut (within ~3 %).
   Pure function of t: no timers, no randomness
   (seeded BVKit.rng only), every image preloaded with BV.preload.
   ========================================================================== */
(function () {
  'use strict';
  const K = window.BVKit, S = window.BVShared, A = window.BVApp, BV = window.BV;
  if (!K || !S || !A || !BV) { console.error('[05-decide] missing BVKit/BVShared/BVApp/BV'); return; }

  const CFG = window.BV_CONFIG || {};
  const C = S.CUES;
  const COIN = S.ROLES.boxReveal || 'dominion';
  const ED = S.ROLES.boxEdition || 7;
  const N = (CFG.collection && CFG.collection.edition) || 50;
  const BB = CFG.buyback || { pct: 80, basisLabel: "of the coin’s stated original value" };
  const VAULT = (CFG.vault && CFG.vault.label) || 'Secure vault · Liechtenstein';
  const { clamp, lerp, range, ease } = K;
  const oq = ease.outQuint, oc = ease.outCubic, ioc = ease.inOutCubic, ios = ease.inOutSine;

  const HITS = (C.decide && C.decide.length === 4) ? C.decide : [20.0, 21.25, 22.5, 23.75];
  const CONFIRM = C.buybackConfirm || 24.5;
  const T0 = 19.9, T1 = 25.15, END = C.end || 25.0;
  const SINK = 0.92, SLOT_GAP = 1.07;    // coin settles 8 % into the velvet slot; slot = 1.07 x the seated disc
  const PUNCH0 = 1.032;                   // camera punch on the first hit (see update: BV.camera.s)

  const WHITE = '#F6F7FC', SEC = '#B4BFD1', GOLD = '#E6B45A';
  const BRIDGE = ['#67DCEA', '#7793FF', '#855CFF'];
  const FLASH = 'radial-gradient(ellipse 70% 70% at 50% 50%,rgba(255,255,255,.95) 0%,rgba(212,195,255,.6) 35%,rgba(133,92,255,.25) 70%,rgba(133,92,255,0) 100%)';
  const GLIT = ['#e4d9ff', '#e4d9ff', '#e4d9ff', '#cff8ff', '#e4d9ff', '#e4d9ff', '#fff1d2'];

  // Real 3D renders of the client's Dominion GLB: yaw = -40 + 2*i (frame 20 = face-on).
  const TURN = Array.from({ length: 41 }, (_, i) => 'assets/coins3d/' + COIN + '-turn/' + String(i).padStart(2, '0') + '.webp');
  const DISC = 976 / 1100;                // coin disc / frame size in the turn renders (= 04's TURN_DISC)
  const GRADE = 'brightness(1.08) contrast(1.05)';   // 04-box.js coin-layer grade (continuity across the cut)
  const PHOTO = (A.coin(COIN) || {}).file || ('assets/coins/' + COIN + '.webp');

  const pad2 = n => String(n).padStart(2, '0');
  const coinName = ((A.coin(COIN) || {}).name || 'Dominion');

  // The 41 turn frames are shared with 04-box (window.BVBox.turnImages(): same URLs, one Image set);
  // our own set only if 04 is absent. Preloaded under this scene either way, so 05 never draws a gap.
  let images = null;
  function loadTurn() {
    if (!images) {
      const shared = window.BVBox && typeof window.BVBox.turnImages === 'function' ? window.BVBox.turnImages() : null;
      images = shared && shared.length === TURN.length ? shared
        : TURN.map(src => { const im = new Image(); im.decoding = 'sync'; im.src = src; return im; });
    }
    images.forEach(im => BV.preload(im));
    return images;
  }
  const ok = im => !!im && im.complete && im.naturalWidth > 0;

  /* ── geometry per format ──────────────────────────────────────────────── */
  function geometry(ctx) {
    const P = ctx.portrait, W = ctx.W, H = ctx.H;
    const L = S.layout(ctx);
    // where 04 leaves the coin at 20.0 (04-box.js geometry): centred on the film, disc bottom just above
    // the rim, frame box 560 (16:9) / 660 (9:16), yaw -24 + 13 * (20.0 - 15.2) = 38.4 deg, under 04's
    // camera push (~1.085). Our own hit punch (1.032) is divided out so the coin matches across the cut.
    const F = L.film, D04 = P ? 660 : 560, gap04 = P ? 14 : 16;
    const k04 = 1.085 / PUNCH0;
    const sx = F.cx, sy = F.rimY - gap04 - D04 * DISC / 2;
    let start = { x: W / 2 + (sx - W / 2) * k04, y: H / 2 + (sy - H / 2) * k04, D: D04 * k04, yaw: 38.4 };
    // preferred: 04's live hand-off pose at the cut (camera + truck included), with our own 20.0
    // hit punch (BV.camera.s = 1.032 about the stage centre) divided out so the coin holds still on the cut frame
    const bp = window.BVBox && typeof window.BVBox.pose === 'function' ? window.BVBox.pose(ctx, HITS[0]) : null;
    if (bp && isFinite(bp.x) && isFinite(bp.y) && bp.D > 0) {
      start = { x: W / 2 + (bp.x - W / 2) / PUNCH0, y: H / 2 + (bp.y - H / 2) / PUNCH0, D: bp.D / PUNCH0, yaw: bp.yaw };
    }
    if (P) {
      return {
        L, P, W, H, start,
        pose: [
          { x: 540, y: 900, D: 790, yaw: 0, s: SINK },
          { x: 540, y: 860, D: 770, yaw: -26, s: 1 },
          { x: 540, y: 830, D: 740, yaw: 22, s: 1 },
          { x: 540, y: 905, D: 690, yaw: 0, s: 1 }
        ],
        head: { x: 540, y: 372, align: 'center', valign: 'middle', size: 118, fit: 952 },
        ui: { x: 540, y: 1452 },          // centre of the beat's UI element (below the coin)
        cardY: 1335,                      // beat 2's taller LIST IT card: raised 27 px so its bottom edge (punch incl.) stays above the 1600 safe line
        sub: { x: 540, y: 1350 },         // buyback subtitle
        chipK: 2.1, cardK: 1.82,
        arc: `M -160 1500 C 80 520, 1000 420, 1240 1180`
      };
    }
    return {
      L, P, W, H, start,
      pose: [
        { x: 600, y: 500, D: 690, yaw: 0, s: SINK },
        { x: 590, y: 490, D: 670, yaw: -26, s: 1 },
        { x: 600, y: 440, D: 640, yaw: 22, s: 1 },
        { x: 600, y: 520, D: 620, yaw: 0, s: 1 }
      ],
      head: { x: 1090, y: 500, align: 'left', valign: 'middle', size: 140, fit: 740 },
      ui: { x: 1090, y: 0 },              // left edge; y computed from the headline block
      sub: { x: 1090, y: 0 },
      chipK: 1.8, cardK: 1.62,
      arc: `M -160 1060 C 220 120, 1380 -60, 2080 560`
    };
  }

  /* deterministic velvet tile */
  function velvetTile() {
    const n = 160, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const c = cv.getContext('2d'), img = c.createImageData(n, n), R = K.rng(5051);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (R() - 0.5) * 70;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }

  function sprite(hex) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 48;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(24, 24, 0, 24, 24, 24);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, hex); g.addColorStop(0.45, K.rgba(hex, 0.35)); g.addColorStop(1, K.rgba(hex, 0));
    c.fillStyle = g; c.fillRect(0, 0, 48, 48);
    return cv;
  }

  /* which beat is active at t (-1 before 20.0) */
  function beatAt(t) { let b = -1; for (let i = 0; i < 4; i++) if (t >= HITS[i]) b = i; return b; }

  /* coin pose: hard on the beat — each hit moves the coin to its beat pose with a fast settle */
  function poseAt(G, t) {
    const b = beatAt(t);
    if (b < 0) return Object.assign({ s: 1 }, G.start);
    const prev = b === 0 ? Object.assign({ s: 1 }, G.start) : G.pose[b - 1];
    const cur = G.pose[b];
    const e = oq(range(t, HITS[b], HITS[b] + (b === 0 ? 0.5 : 0.42)));
    const ey = oc(range(t, HITS[b], HITS[b] + 0.32));
    let s = lerp(prev.s == null ? 1 : prev.s, cur.s, e);
    if (b === 0) {
      // settles into the velvet slot: a little sink after it lands
      s = 1 - (1 - SINK) * ios(range(t, 20.22, 20.62));
    }
    return {
      x: lerp(prev.x, cur.x, e), y: lerp(prev.y, cur.y, e), D: lerp(prev.D, cur.D, e),
      yaw: lerp(prev.yaw, cur.yaw, ey), s, e
    };
  }

  BV.scene({
    id: 'decide',
    start: T0, end: T1, z: 50,
    chapter: 'Your coin, your call',

    build(root, ctx) {
      const G = geometry(ctx);
      const W = ctx.W, H = ctx.H, P = ctx.portrait;
      loadTurn();
      root.style.overflow = 'hidden';

      /* ── background: obsidian + one arc of light ─────────────────────── */
      K.el('div', { parent: root, style: `position:absolute;inset:0;background:
        radial-gradient(${P ? '95% 48% at 50% 47%' : '62% 74% at 34% 50%'},#130f28 0%,#0b0c18 48%,#080A12 80%)` });
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('width', W); svg.setAttribute('height', H);
      svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none';
      svg.innerHTML = `<defs>
          <linearGradient id="d5-br" gradientUnits="userSpaceOnUse" x1="0" y1="${H}" x2="${W}" y2="0">
            <stop offset="0" stop-color="${BRIDGE[0]}"/><stop offset=".5" stop-color="${BRIDGE[1]}"/><stop offset="1" stop-color="${BRIDGE[2]}"/></linearGradient>
          <filter id="d5-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${P ? 34 : 30}"/></filter>
          <filter id="d5-blur2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
        </defs>
        <g class="d5-glow" filter="url(#d5-blur)" opacity=".6"><path d="${G.arc}" fill="none" stroke="url(#d5-br)" stroke-width="${P ? 120 : 110}" stroke-linecap="round" opacity=".36"/></g>
        <path class="d5-halo" d="${G.arc}" fill="none" stroke="url(#d5-br)" stroke-width="14" stroke-linecap="round" opacity=".45" filter="url(#d5-blur2)"/>
        <path class="d5-core" d="${G.arc}" fill="none" stroke="url(#d5-br)" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>
        <path class="d5-pulse" d="${G.arc}" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0"/>
        <path class="d5-pulseg" d="${G.arc}" fill="none" stroke="#cfe0ff" stroke-width="22" stroke-linecap="round" opacity="0" filter="url(#d5-blur2)"/>`;
      root.appendChild(svg);
      const glowG = svg.querySelector('.d5-glow');
      const pulse = svg.querySelector('.d5-pulse'), pulseG = svg.querySelector('.d5-pulseg');
      const arcLen = svg.querySelector('.d5-core').getTotalLength();
      const plen = arcLen * 0.09;
      [pulse, pulseG].forEach(p => { p.style.strokeDasharray = plen + ' ' + arcLen * 2; });

      /* ── coin glow + floor light (follow the coin) ──────────────────────── */
      const GD = 1000;
      const coinGlow = K.el('div', { parent: root, style: `position:absolute;left:0;top:0;width:${GD}px;height:${GD}px;margin:${-GD / 2}px 0 0 ${-GD / 2}px;
        border-radius:50%;background:radial-gradient(closest-side,rgba(190,170,255,.42),rgba(133,92,255,.2) 42%,rgba(119,147,255,.07) 64%,transparent);pointer-events:none;will-change:transform,opacity` });
      const floor = K.el('div', { parent: root, style: `position:absolute;left:0;top:0;width:${GD}px;height:${GD * 0.22}px;margin:${-GD * 0.11}px 0 0 ${-GD / 2}px;
        border-radius:50%;background:radial-gradient(closest-side,rgba(133,92,255,.42),rgba(119,147,255,.14) 55%,transparent);pointer-events:none;will-change:transform,opacity` });

      /* ── beat 1: the velvet slot + the seam line of light ──────────────── */
      const vel = velvetTile();
      const TR = 1000;                    // tray box authored at 1000 px, scaled to the coin
      const tray = K.el('div', { parent: root, style: `position:absolute;left:0;top:0;width:${TR}px;height:${TR}px;margin:${-TR / 2}px 0 0 ${-TR / 2}px;pointer-events:none;opacity:0;will-change:transform,opacity` });
      // velvet bed (the case interior's blue-violet velvet): a visible cushion lit from above, the real
      // velvet nap from the deterministic tile, soft-edged so it melts into the obsidian
      const bedMask = 'radial-gradient(closest-side,#000 46%,rgba(0,0,0,.55) 70%,transparent 100%)';
      K.el('div', { parent: tray, style: `position:absolute;inset:0;border-radius:50%;
        background:radial-gradient(70% 52% at 47% 30%,#332e64 0%,#24204a 34%,#1a1739 62%,#110f28 100%);
        -webkit-mask-image:${bedMask};mask-image:${bedMask}` });
      K.el('div', { parent: tray, style: `position:absolute;inset:0;border-radius:50%;opacity:.5;mix-blend-mode:overlay;
        background:url(${vel}) 0 0/96px 96px repeat;-webkit-mask-image:${bedMask};mask-image:${bedMask}` });
      // the recess (coin slot): dark well, the upper wall's shadow, a crisp lit upper lip and a lit lower inner wall
      const slotD = TR * 0.5;
      K.el('div', { parent: tray, style: `position:absolute;left:${(TR - slotD) / 2}px;top:${(TR - slotD) / 2}px;width:${slotD}px;height:${slotD}px;border-radius:50%;
        background:radial-gradient(closest-side at 50% 56%,#0a0920 0%,#07061a 80%,#04030f 100%);
        box-shadow:inset 0 26px 34px rgba(0,0,0,.95),inset 0 -5px 7px rgba(196,182,255,.42),
          0 -4px 3px rgba(222,210,255,.62),0 -10px 22px rgba(170,150,255,.32),0 6px 10px rgba(0,0,0,.75)` });
      // seam line of light: a hairline (bridge gradient) drawn out from the centre under the coin
      const seam = K.el('div', { parent: root, style: `position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;opacity:0` });
      const seamLine = K.el('div', { parent: seam, style: `position:absolute;left:-600px;top:-1.5px;width:1200px;height:3px;border-radius:3px;
        background:linear-gradient(90deg,rgba(103,220,234,0),${BRIDGE[0]} 18%,#e9e4ff 50%,${BRIDGE[2]} 82%,rgba(133,92,255,0));box-shadow:0 0 18px rgba(178,154,255,.8),0 0 46px rgba(133,92,255,.5);transform-origin:50% 50%` });
      const seamBand = K.el('div', { parent: seam, style: `position:absolute;left:-600px;top:-240px;width:1200px;height:240px;transform-origin:50% 100%;
        background:linear-gradient(180deg,rgba(150,128,255,0),rgba(150,128,255,.05) 60%,rgba(190,176,255,.2));-webkit-mask-image:linear-gradient(90deg,transparent,#000 25%,#000 75%,transparent);mask-image:linear-gradient(90deg,transparent,#000 25%,#000 75%,transparent);mix-blend-mode:screen` });
      const seamFlare = K.el('div', { parent: seam, style: `position:absolute;left:-260px;top:-26px;width:520px;height:52px;border-radius:50%;
        background:radial-gradient(closest-side,rgba(255,255,255,.95),rgba(212,195,255,.5) 30%,rgba(133,92,255,.15) 60%,transparent);mix-blend-mode:screen` });

      /* ── beat 3: the shipping label card that slides under the coin ─────── */
      const lab = K.el('div', { parent: root, style: 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none' });
      const labW = 560, labH = 210;      // authored px (scaled to the coin)
      const R = K.rng(2250);
      let bars = '', bx = 0;
      while (bx < 230) { const w = 1 + Math.floor(R() * 4), g = 1 + Math.floor(R() * 3); bars += `<rect x="${bx}" y="0" width="${w}" height="36" fill="#cfd6e4"/>`; bx += w + g; }
      // one read only: the brand on a tracked parcel label (the chip carries "Ship home · tracked")
      const labCard = K.el('div', { parent: lab, html: `
        <div style="position:absolute;left:30px;right:30px;bottom:30px;display:flex;align-items:center;justify-content:space-between;gap:24px">
          <div style="display:flex;align-items:center;gap:14px">${A.markSVG(38)}<span style="font:700 22px 'Geist',system-ui,sans-serif;letter-spacing:.24em;color:${WHITE};white-space:nowrap">BIFROST VAULT</span></div>
          <svg width="170" height="44" viewBox="0 0 ${bx} 36" preserveAspectRatio="none" style="display:block;opacity:.75;flex:none">${bars}</svg>
        </div>`,
        style: `position:absolute;left:${-labW / 2}px;top:0;width:${labW}px;height:${labH}px;border-radius:20px;
          background:linear-gradient(180deg,#151a28,#0d1019);border:1px solid rgba(255,255,255,.13);
          box-shadow:0 30px 60px -24px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.07);transform-origin:50% 0` });

      /* ── beat 4: the gold ring meter (the ONE gold accent) ─────────────── */
      const RG = 1000, RR = 452;          // authored ring box / radius (scaled to the coin)
      const ring = document.createElementNS(svgNS, 'svg');
      ring.setAttribute('viewBox', `0 0 ${RG} ${RG}`);
      ring.setAttribute('width', RG); ring.setAttribute('height', RG);
      ring.style.cssText = `position:absolute;left:0;top:0;margin:${-RG / 2}px 0 0 ${-RG / 2}px;overflow:visible;pointer-events:none;opacity:0;will-change:transform,opacity`;
      let ticks = '';
      for (let i = 0; i < 100; i++) {
        const a = i / 100 * Math.PI * 2, r0 = RR + 20, r1 = RR + (i % 10 === 0 ? 34 : 27);
        ticks += `<line x1="${500 + Math.sin(a) * r0}" y1="${500 - Math.cos(a) * r0}" x2="${500 + Math.sin(a) * r1}" y2="${500 - Math.cos(a) * r1}" stroke="rgba(255,255,255,${i % 10 === 0 ? 0.34 : 0.13})" stroke-width="${i % 10 === 0 ? 2.4 : 1.4}"/>`;
      }
      ring.innerHTML = `<defs><filter id="d5-rb" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter></defs>
        <g class="d5-ticks">${ticks}</g>
        <circle cx="500" cy="500" r="${RR}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="5"/>
        <circle class="d5-rglow" cx="500" cy="500" r="${RR}" fill="none" stroke="${GOLD}" stroke-width="22" stroke-linecap="round" filter="url(#d5-rb)" opacity=".75" transform="rotate(-90 500 500)"/>
        <circle class="d5-rfill" cx="500" cy="500" r="${RR}" fill="none" stroke="${GOLD}" stroke-width="7" stroke-linecap="round" transform="rotate(-90 500 500)"/>
        <circle class="d5-rhead" cx="500" cy="${500 - RR}" r="7" fill="#fff6dc"/>
        <circle class="d5-rheadg" cx="500" cy="${500 - RR}" r="22" fill="${GOLD}" opacity=".55" filter="url(#d5-rb)"/>`;
      root.appendChild(ring);
      const rFill = ring.querySelector('.d5-rfill'), rGlow = ring.querySelector('.d5-rglow');
      const rHead = ring.querySelector('.d5-rhead'), rHeadG = ring.querySelector('.d5-rheadg');
      const circ = 2 * Math.PI * RR;
      [rFill, rGlow].forEach(c => { c.style.strokeDasharray = circ + ' ' + circ; c.style.strokeDashoffset = circ; });

      // shockwave ring on every hit (light, not clutter)
      const shock = K.el('div', { parent: root, style: `position:absolute;left:0;top:0;width:1000px;height:1000px;margin:-500px 0 0 -500px;border-radius:50%;
        border:3px solid rgba(214,200,255,.9);box-shadow:0 0 30px rgba(178,154,255,.7),inset 0 0 30px rgba(133,92,255,.45);opacity:0;pointer-events:none;will-change:transform,opacity` });

      /* ── canvas: coin + glitter ──────────────────────────────────────── */
      // the coin layer carries 04's static grade (brightness 1.08 / contrast 1.05, never animated) so the
      // Dominion's exposure is continuous across the 20.0 hard cut
      const cv = K.el('canvas', { parent: root, style: 'position:absolute;left:0;top:0;pointer-events:none;filter:' + GRADE });
      cv.width = W; cv.height = H; cv.style.width = W + 'px'; cv.style.height = H + 'px';
      const cx2 = cv.getContext('2d');
      const dust = K.emitter(cv, {
        seed: 505, rate: P ? 18 : 15, x: 0, y: 0, w: 520, h: 40,
        speed: [18, 56], angle: [250, 290], gravity: -16, drag: 0.4, life: [1.5, 2.6], size: [1.2, 2.6], shape: 'dot',
        colors: GLIT, twinkle: 0.5, sway: [10, 0.4], alpha: 0.75
      });
      const bursts = HITS.map((h, i) => K.particles(cv, {
        seed: 5100 + i, count: P ? 56 : 48, x: 0, y: 0, spread: 120, speed: [260, 820], angle: [0, 360],
        gravity: 90, drag: 3.4, life: [0.4, 0.9], size: [1.4, 3.2], shape: ['star', 'dot', 'spark'],
        colors: i === 3 ? ['#fff1d2', '#e4d9ff', '#fff1d2', '#cff8ff'] : GLIT, twinkle: 0.4, tail: 0.03
      }));
      const sprites = ['#e4d9ff', '#cff8ff', '#fff1d2'].map(sprite);

      /* ── type + UI (above the coin) ──────────────────────────────────── */
      const hd = G.head;
      const headOpts = { cls: 'hero', x: hd.x, y: hd.y, align: hd.align, valign: hd.valign, size: hd.size, color: WHITE, weight: 700,
        letterSpacing: '-0.02em', lineHeight: 0.92, split: 'chars', shadow: true, fit: hd.fit };
      const TXT = P
        ? ['KEEP IT VAULTED.', 'LIST IT.', 'BRING IT HOME.', 'OR TAKE ' + BB.pct + '% BACK.\nINSTANTLY.']
        : ['KEEP IT\nVAULTED.', 'LIST IT.', 'BRING IT\nHOME.', 'OR TAKE\n' + BB.pct + '% BACK.\nINSTANTLY.'];
      // beat 4 in 9:16: narrower fit so the line stays inside the 64 px margins even under the hit punch (x1.065)
      const heads = TXT.map((s, i) => K.superText(root, s, Object.assign({}, headOpts, i === 3 ? (P ? { size: 100, fit: 880 } : { size: 124 }) : {})));

      // UI elements per beat
      const uiWrap = [0, 1, 2].map(() => K.el('div', { parent: root, style: 'position:absolute;left:0;top:0;width:0;height:0' }));
      const inner = uiWrap.map(w => K.el('div', { parent: w, style: `position:absolute;left:0;top:0;transform:translate(${P ? '-50%' : '0'},-50%)` }));
      const vparts = VAULT.split(' · ');
      const chip1 = A.chip(inner[0], vparts[0], { icon: 'vault', tone: 'violet', sub: vparts[1] || '', scale: G.chipK });
      // beat 2: the ask card (real owner-panel look: glass, coin, edition chip, status chip) — no amounts
      const kk = G.cardK;
      const card = K.el('div', { parent: inner[1], html: `
        <div style="display:flex;align-items:center;gap:${14 * kk}px">
          <div style="width:${58 * kk}px;height:${58 * kk}px;border-radius:50%;flex:none;background:radial-gradient(circle at 50% 42%,#252642,#10141f);display:grid;place-items:center;overflow:hidden">
            <img src="${PHOTO}" alt="" style="width:94%;height:94%;object-fit:contain;display:block"/></div>
          <div style="display:flex;flex-direction:column;gap:${4 * kk}px">
            <span style="font:600 ${19 * kk}px 'Geist',system-ui,sans-serif;letter-spacing:-.01em;color:${WHITE};line-height:1.1">${coinName}</span>
            <span style="font:500 ${11.5 * kk}px 'JetBrains Mono',monospace;letter-spacing:.14em;color:#93a0b2;text-transform:uppercase;white-space:nowrap">Silver · № ${pad2(ED)} of ${N}</span>
          </div>
          <span style="margin-left:auto;border:1px solid rgba(25,211,255,.5);background:rgba(25,211,255,.08);color:#19d3ff;border-radius:999px;padding:${3 * kk}px ${11 * kk}px;font:700 ${12 * kk}px 'Geist',system-ui,sans-serif;white-space:nowrap;flex:none">edition #${pad2(ED)}</span>
        </div>
        <div class="d5-cardchip" style="margin-top:${16 * kk}px"></div>`,
        style: `width:${400 * kk}px;padding:${18 * kk}px;border-radius:${24 * kk}px;border:1px solid rgba(25,211,255,.28);
          background:linear-gradient(180deg,#181c28,#11141d);box-shadow:0 ${24 * kk}px ${48 * kk}px -${26 * kk}px #000,inset 0 1px 0 rgba(255,255,255,.06)` });
      const cardImg = card.querySelector('img'); if (cardImg) BV.preload(cardImg);
      const chip2 = A.chip(card.querySelector('.d5-cardchip'), 'Listed', { icon: 'tag', tone: 'accent', sub: 'collectors on Base', scale: kk });
      const chip3 = A.chip(inner[2], 'Ship home', { icon: 'truck', tone: 'violet', sub: 'tracked', scale: G.chipK });

      // beat 4: the always-visible subtitle (from BV_CONFIG.buyback) + the 80% read-out on the ring
      const subTxt = BB.pct + '% ' + BB.basisLabel + ' · terms apply';
      const sub = K.el('div', { parent: root, html: subTxt, style: `position:absolute;left:0;top:0;white-space:nowrap;
        font:500 ${P ? 31 : 30}px 'Geist',system-ui,sans-serif;letter-spacing:.01em;color:${SEC};opacity:0;
        text-shadow:0 2px 14px rgba(0,0,0,.8)` });
      const pctEl = K.el('div', { parent: root, html: '0%', style: `position:absolute;left:0;top:0;white-space:nowrap;
        font:600 ${P ? 34 : 30}px 'JetBrains Mono',monospace;letter-spacing:.02em;color:${GOLD};opacity:0;transform:translate(-50%,-50%);
        text-shadow:0 0 18px rgba(230,180,90,.45)` });

      /* layout of the text column (16:9): centre the headline + UI block on the coin */
      const lay = [];
      for (let i = 0; i < 4; i++) {
        const hh = heads[i].inner.offsetHeight || hd.size * 2;
        let uh = 0;
        if (i === 0) uh = chip1.el.offsetHeight; else if (i === 1) uh = card.offsetHeight; else if (i === 2) uh = chip3.el.offsetHeight; else uh = 40;
        const gap = P ? 0 : (i === 3 ? 30 : 46);
        if (P) {
          lay.push({ headY: hd.y, uiY: i === 1 && G.cardY ? G.cardY : G.ui.y });
        } else {
          const cy = G.pose[i].y;
          const total = hh + gap + uh;
          const top = cy - total / 2;
          lay.push({ headY: top + hh / 2, uiY: top + hh + gap + uh / 2 });
        }
      }
      heads.forEach((h, i) => { h.el.style.top = lay[i].headY + 'px'; });
      uiWrap.forEach((w, i) => { w.style.left = G.ui.x + 'px'; w.style.top = lay[i].uiY + 'px'; });
      if (P) { sub.style.left = G.sub.x + 'px'; sub.style.top = G.sub.y + 'px'; sub.style.transform = 'translate(-50%,-50%)'; }
      else { sub.style.left = G.sub.x + 'px'; sub.style.top = lay[3].uiY + 'px'; sub.style.transform = 'translate(0,-50%)'; }

      return { G, shock, svg, glowG, pulse, pulseG, arcLen, coinGlow, floor, tray, TR, seam, seamLine, seamFlare, seamBand, lab, labCard, labW, labH,
        ring, RG, RR, circ, rFill, rGlow, rHead, rHeadG, cv, cx2, dust, bursts, sprites, heads, uiWrap, chip1, card, chip2, chip3, sub, pctEl };
    },

    update(s, local, t, ctx) {
      const G = s.G, P = ctx.portrait, W = ctx.W, H = ctx.H;
      const root = s.svg.parentNode;

      /* scene in / out: hard cut on the downbeat (20.0), clean hand-off at 25.0 */
      root.style.opacity = t < HITS[0] ? 0 : (t >= END ? 1 - range(t, END, END + 0.1) : 1);
      const live = t >= HITS[0] && t < END;   // camera / fx only inside our window
      const b = beatAt(t);

      /* ── hit accents: flash, punch, shake, arc pulse, glitter burst ───── */
      let hitE = 0, hb = -1;
      for (let i = 0; i < 4; i++) { const d = t - HITS[i]; if (d >= 0 && d < 0.6) { hb = i; hitE = d; } }
      if (live && hb >= 0) {
        const fl = Math.exp(-hitE * 14);
        // the 20.0 hit is a continuity cut on the same lit coin: no flash there (even a 0.02 one lifts the
        // coin ~7 % on the cut frame); the punch, shake, arc pulse and burst carry that hit
        if (hb > 0) BV.fx.flash((hb === 3 ? 0.14 : 0.1) * fl, FLASH);
        BV.camera.s *= 1 + (hb === 3 ? 0.045 : PUNCH0 - 1) * (1 - oc(range(hitE, 0, 0.42)));
        if (hitE < 0.32) { const sh = K.shake(hitE, hb === 3 ? 6 : 4, 71 + hb, 9); BV.camera.x += sh.x; BV.camera.y += sh.y; }
      }
      if (live) BV.camera.s *= 1 + 0.02 * ios(range(t, 20.0, 25.0));
      // a light pulse rides the arc on every hit
      const pu = hb >= 0 ? range(hitE, 0, 0.55) : 0;
      const pa = pu > 0 && pu < 1 ? Math.sin(pu * Math.PI) : 0;
      const poff = s.arcLen * (1 - ios(pu) * 1.1);
      s.pulse.style.strokeDashoffset = poff; s.pulseG.style.strokeDashoffset = poff;
      s.pulse.setAttribute('opacity', (pa * 0.9).toFixed(3));
      s.pulseG.setAttribute('opacity', (pa * 0.55).toFixed(3));
      s.glowG.setAttribute('opacity', (0.55 + 0.2 * Math.sin((t - 20) * 2.2) + 0.25 * pa).toFixed(3));

      /* ── coin pose ─────────────────────────────────────────────────── */
      const q = poseAt(G, t);
      if (hb >= 0 && hitE < 0.5) {
        const u = oc(range(hitE, 0.02, 0.5));
        const pc = G.pose[hb], d0 = pc.D * DISC;
        s.shock.style.opacity = (Math.sin(Math.PI * range(hitE, 0.02, 0.5)) * 0.85 * (1 - u * 0.4)).toFixed(3);
        s.shock.style.transform = `translate3d(${pc.x}px,${pc.y}px,0) scale(${(d0 * (1.0 + 0.55 * u) / 1000).toFixed(4)})`;
      } else s.shock.style.opacity = 0;
      const life = clamp((t - HITS[0] - 0.4) / 0.6);
      const seated = b <= 0 ? 0 : oc(range(t, HITS[1], HITS[1] + 0.45));   // no bobbing while it sits in the slot
      const floatY = Math.sin((t - 20) * 2.0) * 6 * life * seated;
      const yawLive = 4 * Math.sin((t - 20) * 1.3) * life;
      const D = q.D * q.s;
      const cx = q.x, cy = q.y + floatY;
      const disc = D * DISC;

      s.coinGlow.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0) scale(${(disc * 1.9 / 1000).toFixed(4)})`;
      s.coinGlow.style.opacity = (0.75 + 0.25 * pa + (b === 3 ? 0.1 : 0)).toFixed(3);
      s.floor.style.transform = `translate3d(${cx.toFixed(1)}px,${(q.y + q.D * DISC * 0.6).toFixed(1)}px,0) scale(${(disc * 1.5 / 1000).toFixed(4)})`;
      s.floor.style.opacity = (b === 0 ? 0.35 : b === 2 ? 0.45 : 0.8).toFixed(3);

      /* beat 1: tray + seam */
      const trA = K.env(t, HITS[0] + 0.02, HITS[0] + 0.32, HITS[1] - 0.12, HITS[1] + 0.02);
      s.tray.style.opacity = trA.toFixed(3);
      if (trA > 0) {
        const p0 = G.pose[0];
        const tk = (p0.D * DISC * SINK * SLOT_GAP / (s.TR * 0.5)) * (1.06 - 0.06 * oc(range(t, 20.05, 20.5)));
        s.tray.style.transform = `translate3d(${p0.x}px,${p0.y}px,0) scale(${tk.toFixed(4)})`;
      }
      // the lid line of light: draws out above the coin, sweeps down over it like a closing lid and is
      // gone by 20.9 (it hands its light to the slot's lip) -- the only light line left is the arc
      const sd = oq(range(t, 20.26, 20.48));
      const sy = ioc(range(t, 20.3, 20.74));
      const sA = K.env(t, 20.26, 20.34, 20.62, 20.86);
      s.seam.style.opacity = sA.toFixed(3);
      if (sA > 0) {
        const p0 = G.pose[0], dd = p0.D * DISC;
        const wK = dd * 1.45 / 1200;
        const y = lerp(p0.y - dd * 0.62, p0.y + dd * 0.5, sy);
        s.seam.style.transform = `translate3d(${p0.x}px,${y.toFixed(1)}px,0)`;
        s.seamLine.style.transform = `scaleX(${(sd * wK * (1 - 0.35 * sy)).toFixed(4)})`;
        const fl = 0.35 + 0.45 * Math.sin(Math.PI * sy);
        s.seamFlare.style.opacity = Math.min(1, fl).toFixed(3);
        s.seamFlare.style.transform = `scale(${(wK * (0.5 + 0.7 * fl)).toFixed(3)},${(0.5 + 0.6 * fl).toFixed(3)})`;
        s.seamBand.style.opacity = (Math.sin(Math.PI * sy) * 0.9).toFixed(3);
        s.seamBand.style.transform = `scaleX(${(sd * wK).toFixed(4)})`;
      }

      /* beat 3: label card slides in under the coin */
      const lbIn = oq(range(t, HITS[2] + 0.06, HITS[2] + 0.5));
      const lbA = K.env(t, HITS[2] + 0.04, HITS[2] + 0.22, HITS[3] - 0.1, HITS[3] + 0.04);
      s.lab.style.opacity = lbA.toFixed(3);
      if (lbA > 0) {
        const p2 = G.pose[2];
        const lk = p2.D * DISC * (P ? 1.36 : 1.22) / s.labW;
        const top = p2.y + p2.D * DISC * 0.5 - s.labH * lk * 0.42;
        s.lab.style.transform = `translate3d(${p2.x}px,${(top + (1 - lbIn) * 120 * lk).toFixed(1)}px,0) scale(${(lk * (0.94 + 0.06 * lbIn)).toFixed(4)})`;
      }

      /* beat 4: ring meter fills to the buyback percentage */
      const rA = K.env(t, HITS[3] + 0.02, HITS[3] + 0.2);
      s.ring.style.opacity = rA.toFixed(3);
      const fillP = oq(range(t, HITS[3] + 0.12, CONFIRM)) * (BB.pct / 100);
      const conf = t >= CONFIRM ? Math.exp(-(t - CONFIRM) * 3.2) : 0;
      if (rA > 0) {
        const p3 = G.pose[3];
        const rk = (p3.D * DISC * 0.5 + (P ? 36 : 32)) / s.RR;
        s.ring.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0) scale(${(rk * (1 + 0.018 * conf)).toFixed(4)})`;
        const off = s.circ * (1 - fillP);
        s.rFill.style.strokeDashoffset = off; s.rGlow.style.strokeDashoffset = off;
        s.rGlow.setAttribute('opacity', (0.55 + 0.45 * conf).toFixed(3));
        const ang = fillP * Math.PI * 2;
        const hx = 500 + Math.sin(ang) * s.RR, hy = 500 - Math.cos(ang) * s.RR;
        s.rHead.setAttribute('cx', hx.toFixed(1)); s.rHead.setAttribute('cy', hy.toFixed(1));
        s.rHeadG.setAttribute('cx', hx.toFixed(1)); s.rHeadG.setAttribute('cy', hy.toFixed(1));
        s.rHeadG.setAttribute('opacity', (0.5 + 0.5 * conf).toFixed(3));
        // the read-out sits just outside the ring at the head
        const rr = (s.RR + 78) * rk;
        s.pctEl.style.left = (cx + Math.sin(ang) * rr).toFixed(1) + 'px';
        s.pctEl.style.top = (cy - Math.cos(ang) * rr).toFixed(1) + 'px';
        s.pctEl.textContent = Math.round(fillP * 100) + '%';
        s.pctEl.style.opacity = K.env(t, HITS[3] + 0.18, HITS[3] + 0.35).toFixed(3);
      } else s.pctEl.style.opacity = 0;

      /* ── canvas: coin, glitter ─────────────────────────────────────── */
      const c = s.cx2;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, W, H);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      if (t >= HITS[0]) {
        // dust rising around the coin (the case glitter carried over)
        c.save(); c.translate(cx, cy + disc * 0.42); c.scale(disc / 560, disc / 560);
        s.dust.draw(c, t - 19.0);
        c.restore();
      }
      // glitter burst on every hit, drawn behind the coin so it fans out from the rim
      if (hb >= 0) { c.save(); c.translate(cx, cy); s.bursts[hb].draw(c, hitE); c.restore(); }
      // motion ghosts on the whip into each beat
      if (b >= 0) {
        const fast = 1 - range(t, HITS[b] + 0.04, HITS[b] + 0.22);
        if (fast > 0 && t >= HITS[b]) {
          for (let g = 4; g >= 1; g--) {
            const qg = poseAt(G, Math.max(HITS[b], t - g * 0.018));
            drawCoin(c, qg.x, qg.y, qg.D * qg.s, qg.yaw, (0.2 / g) * fast, null);
          }
        }
      }
      // one sheen across the relief per beat
      let sheen = null;
      if (b >= 0) {
        const u = range(t, HITS[b] + 0.18, HITS[b] + 0.82);
        if (u > 0 && u < 1) sheen = { u, a: b === 3 ? 0.75 : 0.6 };
      }
      if (t >= CONFIRM) { const u = range(t, CONFIRM, CONFIRM + 0.5); if (u > 0 && u < 1) sheen = { u, a: 0.9, gold: true }; }
      drawCoin(c, cx, cy, D, q.yaw + yawLive, 1, sheen);
      // 04's key light (soft white from the upper left, masked to the coin) + thin cool rim specular
      keyLight(c, cx, cy, D, q.yaw + yawLive, 1);
      // seated in the slot: the upper wall of the recess shades the coin's top edge (reads as sunk in)
      const sinkA = ios(range(t, 20.22, 20.62)) * trA;
      if (sinkA > 0.002) {
        const r = disc / 2;
        c.save();
        c.beginPath(); c.arc(cx, cy, r + 1, 0, Math.PI * 2); c.clip();
        const g = c.createRadialGradient(cx, cy + r * 0.16, r * 0.66, cx, cy + r * 0.16, r * 1.12);
        g.addColorStop(0, 'rgba(4,3,14,0)'); g.addColorStop(0.55, 'rgba(4,3,14,.42)'); g.addColorStop(1, 'rgba(4,3,14,.92)');
        c.globalAlpha = sinkA; c.fillStyle = g;
        c.fillRect(cx - r - 2, cy - r - 2, disc + 4, disc + 4);
        c.restore();
      }
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;

      /* ── type + UI ─────────────────────────────────────────────────── */
      for (let i = 0; i < 4; i++) {
        const outAt = i < 3 ? HITS[i + 1] : Infinity;
        K.animText(s.heads[i], t, HITS[i] - 0.04, outAt, { style: 'rise', stagger: 0.016, dur: 0.38, outStyle: 'blur', outDur: 0.1 });
      }
      for (let i = 0; i < 3; i++) {
        const vis = t >= HITS[i] && t < HITS[i + 1];
        s.uiWrap[i].style.display = vis ? '' : 'none';
        if (!vis) continue;
        const pIn = range(t, HITS[i] + 0.12, HITS[i] + 0.55);
        const out = range(t, HITS[i + 1] - 0.1, HITS[i + 1]);
        s.uiWrap[i].style.opacity = (1 - out).toFixed(3);
        if (i === 0) s.chip1.show(pIn);
        if (i === 2) s.chip3.show(pIn);
        if (i === 1) {
          const e = oq(pIn);
          s.card.style.opacity = oc(range(pIn, 0, 0.5)).toFixed(3);
          s.card.style.transform = `translate3d(${((1 - e) * (P ? 0 : 90)).toFixed(1)}px,${((1 - e) * (P ? 60 : 0)).toFixed(1)}px,0)`;
          s.chip2.show(range(t, HITS[1] + 0.32, HITS[1] + 0.72));
        }
      }
      // the buyback subtitle is on screen whenever the 80% claim is
      s.sub.style.opacity = t >= HITS[3] ? oc(range(t, HITS[3], HITS[3] + 0.12)).toFixed(3) : 0;
    }
  });

  /* coin from the yaw-sweep renders (two neighbouring frames cross-faded, exactly as 04 draws it),
     with an optional specular sweep masked by the coin */
  function coinFrames(yaw) {
    const f = clamp((yaw + 40) / 2, 0, 40), a = Math.floor(f);
    return { a, b: Math.min(40, a + 1), u: f - a };
  }
  let off = null, offC = null;
  function drawCoin(c, x, y, D, yaw, alpha, sheen) {
    const fr = coinFrames(yaw);
    const im = images && images[fr.a], ib = images && images[fr.b];
    if (!ok(im)) return;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    c.drawImage(im, -D / 2, -D / 2, D, D);
    if (fr.u > 0.02 && ok(ib)) { c.globalAlpha = alpha * fr.u; c.drawImage(ib, -D / 2, -D / 2, D, D); c.globalAlpha = alpha; }
    if (sheen) {
      const Np = Math.max(64, Math.ceil(D));
      if (!off) { off = document.createElement('canvas'); offC = off.getContext('2d'); }
      if (off.width !== Np) { off.width = Np; off.height = Np; }
      offC.setTransform(1, 0, 0, 1, 0, 0);
      offC.globalCompositeOperation = 'source-over'; offC.globalAlpha = 1;
      offC.clearRect(0, 0, Np, Np);
      offC.drawImage(im, 0, 0, Np, Np);
      offC.globalCompositeOperation = 'source-in';
      const u = ease.inOutSine(sheen.u);
      const sx = lerp(-0.45, 1.45, u) * Np;
      const g = offC.createLinearGradient(sx - Np * 0.2, 0, sx + Np * 0.2, Np * 0.35);
      const tint = sheen.gold ? 'rgba(255,236,190,' : 'rgba(214,226,255,';
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.38, tint + '0.22)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.62, tint + '0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      offC.fillStyle = g;
      offC.fillRect(0, 0, Np, Np);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = alpha * sheen.a * Math.sin(Math.PI * sheen.u);
      c.drawImage(off, -D / 2, -D / 2, D, D);
    }
    c.restore();
  }

  /* key light, identical to 04-box.js keyLight(): a broad white falloff from the upper left, masked by
     the coin's alpha and screened on, plus a thin cool specular along the upper-left of the rim.
     The lit mask depends only on the turn frame and the (quantised) size, so it is cached. */
  let kl = null, klC = null, klKey = '';
  function keyLight(c, x, y, D, yaw, amt) {
    const fr = coinFrames(yaw);
    const im = images && images[fr.a];
    if (!ok(im)) return;
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
    c.globalAlpha = amt;
    c.drawImage(kl, x - D / 2, y - D / 2, D, D);
    const ry = D * DISC * 0.5 - Math.max(1.5, D * 0.004), rx = ry * Math.max(0.05, Math.cos(yaw * Math.PI / 180));
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
})();
