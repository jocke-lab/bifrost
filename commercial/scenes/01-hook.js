/* ============================================================================
   01-hook.js — HOOK 0.0–2.5 "CAUGHT YOUR EYE."            (scene 0.0–2.6)
   Built only from the client's real Silence coin: the 2400 px macro render of
   the real GLB (assets/coins3d/silence-macro.webp) and its face-on hero render
   (assets/coins3d/silence-face.webp).

   0.00  black; a hairline arc of light (bridge gradient) sweeps across the frame
         and reveals the extreme macro of the enamel spiral iris behind it
   0.00–1.60  slow push on the macro, rack focus blur -> sharp, light raking the relief
   0.90  super CAUGHT YOUR EYE.
   1.60  whip-zoom pull back (iris stays registered: the macro is aligned to the face
         render) to the full Silence coin floating on a soft violet glow + reflection
   2.05–2.45  one gold glint travels along the rim (the single gold accent)
   2.50  hard cut to 02-five (which sits above this scene)
   Pure function of t. No randomness.
   ========================================================================== */
(function () {
  'use strict';
  const K = window.BVKit;
  const { clamp, lerp, range, ease } = K;

  const MACRO = 'assets/coins3d/silence-macro.webp';   // 2400 px, view = 0.55 coin diameter
  const FACE = 'assets/coins3d/silence-face.webp';     // 1600 px, disc 1418 px (88.6 %)
  const DISC = 1418 / 1600;
  // Registration of the macro inside the face render (measured by correlation):
  // macro centre = face pixel (825, 801), macro span = 750 face px.
  const MAC_SPAN = 750 / 1600;
  const MAC_OFF = { x: (825 - 800) / 1600, y: (801 - 800) / 1600 };

  const T_SUPER = 0.9, T_PULL = 1.6, T_SETTLE = 2.22;
  const BRIDGE = ['#67DCEA', '#7793FF', '#855CFF'];

  const px = n => n.toFixed(2) + 'px';
  function box(el, cx, cy, size, base) {   // place an element of base size `base` centred at cx,cy at `size`
    el.style.transform = 'translate3d(' + px(cx - base / 2) + ',' + px(cy - base / 2) + ',0) scale(' + (size / base).toFixed(5) + ')';
  }
  function img(parent, src, base, css) {
    const i = K.el('img', { parent, attrs: { src, alt: '', draggable: 'false' } });
    i.style.cssText = 'position:absolute;left:0;top:0;width:' + base + 'px;height:' + base + 'px;transform-origin:50% 50%;' +
      'user-select:none;pointer-events:none;' + (css || '');
    if (window.BV && BV.preload) BV.preload(i);
    return i;
  }
  function layer(parent, css) {
    return K.el('div', { parent, style: 'position:absolute;left:0;top:0;pointer-events:none;' + (css || '') });
  }

  function layout(ctx) {
    const P = ctx.portrait, W = ctx.W, H = ctx.H;
    return P ? {
      macroC: { x: 540, y: 990 }, M0: 2120, M1: 2330,
      hero: { x: 540, y: 980, F: 900 },
      super: { x: 540, y: 336, size: 128, text: 'CAUGHT\nYOUR EYE.' },
      arcR: 1650, arcCy: H * 0.6,
      W, H, P
    } : {
      macroC: { x: 960, y: 500 }, M0: 2080, M1: 2290,
      hero: { x: 960, y: 446, F: 720 },
      super: { x: 960, y: 916, size: 124, text: 'CAUGHT YOUR EYE.' },
      arcR: 1500, arcCy: H * 0.62,
      W, H, P
    };
  }

  BV.scene({
    id: 'hook',
    start: 0.0, end: 2.6, z: 10,
    chapter: 'Caught your eye',

    build(root, ctx) {
      const L = layout(ctx), W = L.W, H = L.H;
      root.style.background = '#080A12';
      root.style.overflow = 'hidden';
      const st = { L };

      // ── coin world (behind the macro) ──────────────────────────────────────
      st.world = layer(root, 'width:' + W + 'px;height:' + H + 'px;');
      // soft violet glow + enamel hint behind the coin
      st.glow = layer(st.world, 'width:1000px;height:1000px;transform-origin:50% 50%;border-radius:50%;' +
        'background:radial-gradient(closest-side,rgba(133,92,255,.7) 0%,rgba(119,147,255,.5) 38%,rgba(26,127,224,.22) 50%,rgba(133,92,255,.08) 68%,rgba(133,92,255,0) 86%);');
      // floor: a faint horizon of light under the coin + contact glow
      st.floor = layer(st.world, 'width:1000px;height:120px;transform-origin:50% 50%;border-radius:50%;' +
        'background:radial-gradient(closest-side,rgba(178,154,255,.30),rgba(119,147,255,.10) 55%,rgba(0,0,0,0));');
      // reflection (flipped coin, fading down)
      st.reflWrap = layer(st.world, 'width:' + W + 'px;height:' + H + 'px;');
      st.refl = img(st.reflWrap, FACE, 1600, 'opacity:.26;' +
        '-webkit-mask-image:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0) 38%,rgba(0,0,0,.9) 100%);' +
        'mask-image:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0) 38%,rgba(0,0,0,.9) 100%);');
      // zoom trails (whip) + the coin
      st.trail2 = img(st.world, FACE, 1600, 'opacity:0;mix-blend-mode:screen;');
      st.trail1 = img(st.world, FACE, 1600, 'opacity:0;mix-blend-mode:screen;');
      st.coin = img(st.world, FACE, 1600, 'filter:drop-shadow(0 30px 40px rgba(0,0,0,.55));');
      // specular sweep masked to the coin
      st.spec = layer(st.world, 'width:1600px;height:1600px;transform-origin:50% 50%;overflow:hidden;mix-blend-mode:screen;opacity:0;' +
        '-webkit-mask-image:url("' + FACE + '");mask-image:url("' + FACE + '");-webkit-mask-size:100% 100%;mask-size:100% 100%;');
      st.specBand = layer(st.spec, 'left:-50%;width:200%;height:100%;' +
        'background:linear-gradient(105deg,rgba(255,255,255,0) 40%,rgba(220,226,255,.22) 47%,rgba(255,255,255,.55) 50%,rgba(220,226,255,.22) 53%,rgba(255,255,255,0) 60%);');
      // gold glint along the rim (SVG in face-render units)
      const NS = 'http://www.w3.org/2000/svg';
      st.glint = document.createElementNS(NS, 'svg');
      st.glint.setAttribute('viewBox', '0 0 1600 1600');
      st.glint.style.cssText = 'position:absolute;left:0;top:0;width:1600px;height:1600px;transform-origin:50% 50%;overflow:visible;mix-blend-mode:screen;opacity:0;pointer-events:none;';
      const R = 1418 / 2 - 14, C = 2 * Math.PI * R;
      st.glintR = R; st.glintC = C;
      st.glint.innerHTML =
        '<defs><radialGradient id="hk-gl" cx="50%" cy="50%" r="50%">' +
        '<stop offset="0" stop-color="#FFFFFF"/><stop offset=".18" stop-color="#FFF4D6"/><stop offset=".45" stop-color="#E6B45A" stop-opacity=".55"/>' +
        '<stop offset="1" stop-color="#E6B45A" stop-opacity="0"/></radialGradient></defs>' +
        '<g transform="rotate(0 800 800)">' +
        '<circle class="g0" cx="800" cy="800" r="' + R + '" fill="none" stroke="#E6B45A" stroke-opacity=".28" stroke-width="30" stroke-linecap="round"/>' +
        '<circle class="g1" cx="800" cy="800" r="' + R + '" fill="none" stroke="#E6B45A" stroke-opacity=".7" stroke-width="12" stroke-linecap="round"/>' +
        '<circle class="g2" cx="800" cy="800" r="' + R + '" fill="none" stroke="#FFF1CF" stroke-width="5" stroke-linecap="round"/>' +
        '</g>' +
        '<g class="star"><circle r="120" fill="url(#hk-gl)"/>' +
        '<path d="M0 -150 L9 -9 L150 0 L9 9 L0 150 L-9 9 L-150 0 L-9 -9 Z" fill="#FFF6E0"/>' +
        '<path d="M0 -60 L5 -5 L60 0 L5 5 L0 60 L-5 5 L-60 0 L-5 -5 Z" fill="#FFFFFF" transform="rotate(45)"/></g>';
      st.world.appendChild(st.glint);
      st.g = [st.glint.querySelector('.g0'), st.glint.querySelector('.g1'), st.glint.querySelector('.g2')];
      st.star = st.glint.querySelector('.star');

      // ── macro layer (masked by the sweeping arc) ───────────────────────────
      st.macroWrap = layer(root, 'width:' + W + 'px;height:' + H + 'px;');
      const feather = '-webkit-mask-image:radial-gradient(closest-side,#000 80%,rgba(0,0,0,0) 100%);mask-image:radial-gradient(closest-side,#000 80%,rgba(0,0,0,0) 100%);';
      st.macro = img(st.macroWrap, MACRO, 2400, feather);
      // rack-focus: a pre-blurred copy drawn once the macro decodes (deterministic)
      st.blur = K.el('canvas', { parent: st.macroWrap });
      st.blur.width = 600; st.blur.height = 600;
      st.blur.style.cssText = 'position:absolute;left:0;top:0;width:2400px;height:2400px;transform-origin:50% 50%;pointer-events:none;' + feather;
      const drawBlur = () => {
        const g = st.blur.getContext('2d');
        g.filter = 'blur(7px)';
        g.drawImage(st.macro, -20, -20, 640, 640);
        g.filter = 'none';
      };
      BV.preload((st.macro.decode ? st.macro.decode() : Promise.resolve()).then(drawBlur).catch(() => {}));
      // raking light over the relief (overlay) + edge spill (screen)
      st.rake = layer(st.macroWrap, 'width:' + W + 'px;height:' + H + 'px;mix-blend-mode:overlay;opacity:0;');
      st.spill = layer(st.macroWrap, 'width:' + W + 'px;height:' + H + 'px;mix-blend-mode:screen;');
      // legibility gradient for the super (bottom in 16:9, top band in 9:16)
      st.shade = layer(st.macroWrap, 'width:' + W + 'px;height:' + H + 'px;background:' + (L.P
        ? 'linear-gradient(180deg,rgba(8,10,18,.82) 0%,rgba(8,10,18,.55) 22%,rgba(8,10,18,0) 36%)'
        : 'linear-gradient(0deg,rgba(8,10,18,.85) 0%,rgba(8,10,18,.5) 18%,rgba(8,10,18,0) 36%)') + ';');

      // ── the arc of light (hairline) ────────────────────────────────────────
      st.arc = document.createElementNS(NS, 'svg');
      st.arc.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      st.arc.style.cssText = 'position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;pointer-events:none;mix-blend-mode:screen;';
      st.arc.innerHTML =
        '<defs><linearGradient id="hk-arc" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="' + BRIDGE[0] + '"/><stop offset=".5" stop-color="' + BRIDGE[1] + '"/><stop offset="1" stop-color="' + BRIDGE[2] + '"/>' +
        '</linearGradient></defs>' +
        '<circle class="a0" fill="none" stroke="url(#hk-arc)" stroke-width="110" stroke-opacity=".12"/>' +
        '<circle class="a1" fill="none" stroke="url(#hk-arc)" stroke-width="30" stroke-opacity=".38"/>' +
        '<circle class="a2" fill="none" stroke="url(#hk-arc)" stroke-width="7" stroke-opacity=".75"/>' +
        '<circle class="a3" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-opacity=".95"/>';
      root.appendChild(st.arc);
      st.arcs = ['.a0', '.a1', '.a2', '.a3'].map(s => st.arc.querySelector(s));
      st.arcs.forEach(c => { c.setAttribute('r', L.arcR); c.setAttribute('cy', L.arcCy); });

      // ── super ──────────────────────────────────────────────────────────────
      st.sup = K.superText(root, L.super.text, {
        cls: 'hero', x: L.super.x, y: L.super.y, size: L.super.size, align: 'center',
        color: '#F6F7FC', letterSpacing: '-0.02em', lineHeight: 0.94, shadow: true, split: 'chars', chroma: 6
      });
      return st;
    },

    update(st, local, t, ctx) {
      const L = st.L, W = L.W, H = L.H;

      // ── camera: face-render box size F and iris screen point ───────────────
      // Phase A (0..1.6): macro push. Macro box M (px) centred on L.macroC.
      const pushP = range(local, 0, T_PULL);
      let M = lerp(L.M0, L.M1, ease.outSine(pushP));
      // tiny anticipation before the whip
      M *= 1 + 0.025 * ease.inOutSine(range(local, T_PULL - 0.14, T_PULL)) * (1 - range(local, T_PULL, T_PULL + 0.04));
      let F = M / MAC_SPAN;
      let iris = { x: L.macroC.x, y: L.macroC.y };
      // Phase B (1.6..2.22): whip-zoom out to the hero coin (log-space size, iris stays registered).
      const wp = range(local, T_PULL, T_SETTLE);
      const we = ease.outQuart(wp);
      const heroIris = { x: L.hero.x + MAC_OFF.x * L.hero.F, y: L.hero.y + MAC_OFF.y * L.hero.F };
      if (local > T_PULL) {
        F = Math.exp(lerp(Math.log(F), Math.log(L.hero.F), we));
        iris = { x: lerp(L.macroC.x, heroIris.x, ease.inOutSine(wp)), y: lerp(L.macroC.y, heroIris.y, ease.inOutSine(wp)) };
      }
      // zoom speed (for trails / blur), analytic derivative of the log size
      const speed = local > T_PULL && local < T_SETTLE ? 4 * Math.pow(1 - wp, 3) : 0;   // d(outQuart)/dp
      // float after settling
      const fl = range(local, 1.9, 2.4);
      const bob = Math.sin((local - 1.9) * 2.6) * 7 * fl;
      const cx = iris.x - MAC_OFF.x * F, cy = iris.y - MAC_OFF.y * F + bob;

      // ── macro ──────────────────────────────────────────────────────────────
      const macroO = 1 - ease.inQuad(range(local, T_PULL + 0.02, T_PULL + 0.2));
      const mBox = MAC_SPAN * F;
      if (macroO > 0.001) {
        st.macroWrap.style.display = '';
        st.macroWrap.style.opacity = macroO.toFixed(3);
        box(st.macro, iris.x, iris.y, mBox, 2400);
        box(st.blur, iris.x, iris.y, mBox, 2400);
        // rack focus: blurred -> sharp
        const focus = ease.inOutSine(range(local, 0.12, 0.85));
        st.blur.style.opacity = (1 - focus).toFixed(3);
        // raking light across the relief (overlay band), 0.55..1.55
        const rk = range(local, 0.5, 1.6);
        if (rk > 0 && rk < 1) {
          const bx = lerp(-0.35, 1.35, ease.inOutSine(rk));
          st.rake.style.opacity = (Math.sin(Math.PI * rk) * 0.95).toFixed(3);
          st.rake.style.background = 'linear-gradient(' + (L.P ? 112 : 104) + 'deg,rgba(255,255,255,0) ' + ((bx - 0.22) * 100).toFixed(1) + '%,rgba(235,240,255,.85) ' +
            (bx * 100).toFixed(1) + '%,rgba(255,255,255,0) ' + ((bx + 0.22) * 100).toFixed(1) + '%)';
        } else st.rake.style.opacity = '0';
        st.shade.style.opacity = ease.outCubic(range(local, 0.55, 1.0)).toFixed(3);
      } else {
        st.macroWrap.style.display = 'none';
      }

      // ── arc of light sweeping across, revealing the macro ──────────────────
      const R = L.arcR, cyA = L.arcCy;
      const dev = R - Math.sqrt(Math.max(0, R * R - Math.pow(Math.max(cyA, H - cyA), 2)));   // arc bow across the frame
      const sp = range(local, 0.0, 0.66);
      const edge = lerp(0.03 * W, W + dev + 0.1 * W, ease.outQuad(sp));
      const acx = edge - R;
      if (sp < 1) {
        const m = 'radial-gradient(circle ' + R + 'px at ' + acx.toFixed(1) + 'px ' + cyA.toFixed(1) + 'px,#000 ' + (R - 70) + 'px,rgba(0,0,0,0) ' + R + 'px)';
        st.macroWrap.style.webkitMaskImage = m; st.macroWrap.style.maskImage = m;
        st.spill.style.background = 'radial-gradient(circle ' + R + 'px at ' + acx.toFixed(1) + 'px ' + cyA.toFixed(1) + 'px,rgba(0,0,0,0) ' + (R - 420) + 'px,rgba(119,147,255,.16) ' + (R - 160) + 'px,rgba(190,205,255,.55) ' + (R - 12) + 'px,rgba(0,0,0,0) ' + R + 'px)';
        st.spill.style.opacity = '1';
        st.arc.style.display = '';
        st.arcs.forEach(c => c.setAttribute('cx', acx.toFixed(1)));
        st.arc.style.opacity = (K.env(local, 0, 0.04, 0.56, 0.66)).toFixed(3);
      } else {
        if (st.macroWrap.style.maskImage) { st.macroWrap.style.webkitMaskImage = ''; st.macroWrap.style.maskImage = ''; }
        st.spill.style.opacity = '0';
        st.arc.style.display = 'none';
      }

      // ── coin world ─────────────────────────────────────────────────────────
      const worldO = range(local, T_PULL - 0.05, T_PULL + 0.06);
      st.world.style.opacity = worldO.toFixed(3);
      box(st.coin, cx, cy, F, 1600);
      // zoom trails during the whip
      const tr = clamp(speed / 4) * worldO;
      box(st.trail1, cx, cy, F * (1 + 0.09 * clamp(speed / 2)), 1600);
      box(st.trail2, cx, cy, F * (1 + 0.2 * clamp(speed / 2)), 1600);
      st.trail1.style.opacity = (0.32 * tr).toFixed(3);
      st.trail2.style.opacity = (0.16 * tr).toFixed(3);
      // glow + floor + reflection fade in as the coin arrives
      const arrive = ease.outCubic(range(local, T_PULL + 0.18, T_SETTLE + 0.1));
      const disc = DISC * F;
      box(st.glow, cx, cy, disc * 2.1, 1000);
      st.glow.style.opacity = (arrive * (0.92 + 0.08 * Math.sin(local * 3))).toFixed(3);
      const floorY = L.hero.y + DISC * L.hero.F / 2 + 34;
      st.floor.style.transform = 'translate3d(' + px(cx - 500) + ',' + px(floorY - 60) + ',0) scale(' + (disc * 1.6 / 1000).toFixed(4) + ',' + (disc * 0.2 / 120).toFixed(4) + ')';
      st.floor.style.opacity = arrive.toFixed(3);
      // reflection: mirror about the floor line
      const reflCy = 2 * floorY - cy;
      st.refl.style.transform = 'translate3d(' + px(cx - 800) + ',' + px(reflCy - 800) + ',0) scale(' + (F / 1600).toFixed(5) + ',' + (-F / 1600).toFixed(5) + ')';
      st.reflWrap.style.opacity = arrive.toFixed(3);

      // specular sweep across the face as it lands
      const sw = range(local, 1.95, 2.5);
      box(st.spec, cx, cy, F, 1600);
      if (sw > 0 && sw < 1) {
        st.spec.style.opacity = Math.sin(Math.PI * sw).toFixed(3);
        st.specBand.style.transform = 'translate3d(' + lerp(-55, 55, ease.inOutSine(sw)).toFixed(2) + '%,0,0)';
      } else st.spec.style.opacity = '0';

      // gold glint along the rim (the one gold accent)
      const gp = range(local, 2.02, 2.48);
      box(st.glint, cx, cy, F, 1600);
      if (gp > 0 && gp < 1) {
        const a0 = 160, a1 = 345;                    // degrees, SVG frame (y down): sweeps over the top of the rim
        const a = lerp(a0, a1, ease.inOutSine(gp));
        const Rr = st.glintR, Cc = st.glintC;
        const seg = [0.2, 0.1, 0.045];
        st.g.forEach((c, i) => {
          const len = seg[i] * Cc;
          const head = a / 360 * Cc;
          c.setAttribute('stroke-dasharray', len.toFixed(1) + ' ' + (Cc - len).toFixed(1));
          c.setAttribute('stroke-dashoffset', (-(head - len)).toFixed(1));
        });
        const ar = a * Math.PI / 180;
        const sx = 800 + Rr * Math.cos(ar), sy = 800 + Rr * Math.sin(ar);
        const tw = 0.75 + 0.25 * Math.sin(gp * Math.PI * 3);
        st.star.setAttribute('transform', 'translate(' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ') scale(' + (tw * (0.7 + 0.5 * Math.sin(Math.PI * gp))).toFixed(3) + ')');
        st.glint.style.opacity = Math.min(1, Math.sin(Math.PI * gp) * 1.6).toFixed(3);
      } else st.glint.style.opacity = '0';

      // ── super ──────────────────────────────────────────────────────────────
      K.animText(st.sup, local, T_SUPER, Infinity, { style: 'blur', stagger: 0.016, dur: 0.42 });

      // ── film finish ────────────────────────────────────────────────────────
      BV.fx.vignette(0.3 * (1 - worldO) + 0.3 * worldO);
      // a soft violet-white bloom as the whip releases
      const bl = range(local, T_PULL, T_PULL + 0.3);
      if (bl > 0 && bl < 1) BV.fx.flash(0.22 * Math.sin(Math.PI * bl) * (1 - bl), 'rgba(178,154,255,1)');
      // the whip pushes the camera a hair
      if (speed > 0) { BV.camera.s *= 1 + 0.01 * clamp(speed / 4); }
    }
  });
})();
