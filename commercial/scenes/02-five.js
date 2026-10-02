/* ============================================================================
   02-five.js — THE FIVE 2.5–5.0 "EYE OF THE UNKNOWN."      (scene 2.5–5.1)
   The five real Eye of the Unknown coins (face-on renders of the client's own
   GLB models, assets/coins3d/<id>-face.webp), hard cuts on the half-beats:
     2.5 SILENCE · 3.0 AMETHERION · 3.5 CYCLE · 4.0 DOMINION · 4.5 VERITAS
   each full-frame, its name in small tracked caps, its enamel colour bleeding
   into the glow. Then (4.62–4.95) Veritas pulls back into a floating row of all
   five over one arc of light (the bridge), with floor reflections.
   Supers: EYE OF THE UNKNOWN. (from the first cut) and small caps
   FIVE COINS IN SILVER · EDITION OF 50 EACH (edition from BV_CONFIG) from the second cut (3.0).
   9:16: the row is a gentle crowned arc of five, slightly overlapping, edge to edge between the margins.
   Sits above 01-hook (z) and starts with an opaque frame = hard cut at 2.5.
   Pure function of t. No randomness.
   ========================================================================== */
(function () {
  'use strict';
  const K = window.BVKit;
  const { clamp, lerp, range, ease } = K;
  const NS = 'http://www.w3.org/2000/svg';

  const DISC = 1418 / 1600;                 // coin disc / render box
  const CUT = 0.5;                          // seconds per coin
  const T_ROW = 2.08, T_ROW_END = 2.36;     // local: Veritas pulls back into the row (4.58–4.86)
  const BRIDGE = ['#67DCEA', '#7793FF', '#855CFF'];
  // The face renders are centred opaque discs (alpha bbox 94..1506 of 1600 = 44.1 % radius), so the light layers
  // are clipped to that circle instead of mask-image:url(...), which Chrome blocks as cross-origin on file://.
  const CLIP = '-webkit-clip-path:circle(44.1% at 50% 50%);clip-path:circle(44.1% at 50% 50%);';

  const px = n => n.toFixed(2) + 'px';
  function box(el, cx, cy, size, base, rot) {
    el.style.transform = 'translate3d(' + px(cx - base / 2) + ',' + px(cy - base / 2) + ',0) scale(' + (size / base).toFixed(5) + ')' +
      (rot ? ' rotate(' + rot.toFixed(3) + 'deg)' : '');
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
  function hexA(hex, a) { return K.rgba(hex, a); }

  function layout(ctx) {
    const P = ctx.portrait, W = ctx.W, H = ctx.H;
    if (P) {
      // 9:16: a gentle crowned arc of five, slightly overlapping, filling the width between the 64 px margins
      const discs = [200, 212, 228, 212, 200], ys = [1036, 1000, 982, 1000, 1036];
      const xs = [164, 352, 540, 728, 916];
      return {
        P, W, H,
        full: { x: 540, y: 975, disc: 960 },
        title: { x: 540, y: 336, size: 116, align: 'center', text: 'EYE OF THE\nUNKNOWN.' },
        name: { x: 540, y: 1512, align: 'center', size: 34 },
        desc: { x: 540, y: 1566, align: 'center', size: 24, tuck: 1290 },
        row: { xs, ys, discs, order: [0, 4, 1, 3, 2] },
        arc: 'M -60 1180 Q 540 700 1140 1180',
        floors: ys.map((y, i) => y + discs[i] / 2 + 22),
        glowY: 1040, glowS: [1.3, 0.62]
      };
    }
    const disc = 290, gap = 38, y = 726;
    return {
      P, W, H,
      full: { x: 1328, y: 540, disc: 920 },
      title: { x: 118, y: 196, size: 104, align: 'left', text: 'EYE OF THE\nUNKNOWN.', fit: 700 },
      name: { x: 118, y: 902, align: 'left', size: 32 },
      desc: { x: 121, y: 462, align: 'left', size: 26 },
      row: { xs: [0, 1, 2, 3, 4].map(i => 960 + (i - 2) * (disc + gap)), ys: [y, y, y, y, y], discs: [disc, disc, disc, disc, disc], order: [4, 3, 2, 1, 0] },
      arc: 'M -60 990 Q 820 400 1980 650',
      floors: [0, 1, 2, 3, 4].map(() => y + disc / 2 + 30),
      glowY: y + disc * 0.15, glowS: [1.9, 0.62]
    };
  }

  BV.scene({
    id: 'five',
    start: 2.5, end: 5.1, z: 20,
    chapter: 'Eye of the Unknown',

    build(root, ctx) {
      const L = layout(ctx), W = L.W, H = L.H;
      const S = window.BVShared;
      const ids = (S && S.ORDER) || ['silence', 'ametherion', 'cycle', 'dominion', 'veritas'];
      const coins = ids.map(id => {
        const c = (S && S.coin(id)) || ctx.cfg.collection.coins.find(x => x.id === id);
        return { id, name: c.name, enamel: c.enamel || '#855CFF', src: 'assets/coins3d/' + id + '-face.webp' };
      });
      const edition = (ctx.cfg.collection && ctx.cfg.collection.edition) || 50;
      root.style.background = '#080A12';
      root.style.overflow = 'hidden';
      const st = { L, coins };

      // ── full-frame cuts ─────────────────────────────────────────────────────
      st.cut = layer(root, 'width:' + W + 'px;height:' + H + 'px;');
      st.bleed = layer(st.cut, 'width:1000px;height:1000px;transform-origin:50% 50%;border-radius:50%;');
      st.glow = layer(st.cut, 'width:1000px;height:1000px;transform-origin:50% 50%;border-radius:50%;');
      st.full = coins.map(c => img(st.cut, c.src, 1600, 'display:none;filter:drop-shadow(0 40px 60px rgba(0,0,0,.6));'));
      // specular sweep, masked to the active coin
      st.spec = coins.map(c => {
        const s = layer(st.cut, 'display:none;width:1600px;height:1600px;transform-origin:50% 50%;overflow:hidden;mix-blend-mode:screen;' +
          CLIP);
        s._band = layer(s, 'left:-50%;width:200%;height:100%;' +
          'background:linear-gradient(100deg,rgba(255,255,255,0) 41%,rgba(220,226,255,.2) 47%,rgba(255,255,255,.5) 50%,rgba(220,226,255,.2) 53%,rgba(255,255,255,0) 59%);');
        return s;
      });

      // ── the row ─────────────────────────────────────────────────────────────
      st.rowWrap = layer(root, 'width:' + W + 'px;height:' + H + 'px;');
      root.insertBefore(st.rowWrap, st.cut);           // the row fans out from BEHIND the full-frame Veritas
      // the one arc of light (bridge curve) behind the row
      st.arcSvg = document.createElementNS(NS, 'svg');
      st.arcSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      st.arcSvg.style.cssText = 'position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;overflow:visible;mix-blend-mode:screen;';
      st.arcSvg.innerHTML =
        '<defs><linearGradient id="fv-br" x1="0" y1="1" x2="1" y2="0">' +
        '<stop offset="0" stop-color="' + BRIDGE[0] + '"/><stop offset=".5" stop-color="' + BRIDGE[1] + '"/><stop offset="1" stop-color="' + BRIDGE[2] + '"/>' +
        '</linearGradient></defs>' +
        '<path class="b0" d="' + L.arc + '" fill="none" stroke="url(#fv-br)" stroke-width="120" stroke-opacity=".06" stroke-linecap="round"/>' +
        '<path class="b1" d="' + L.arc + '" fill="none" stroke="url(#fv-br)" stroke-width="34" stroke-opacity=".2" stroke-linecap="round"/>' +
        '<path class="b2" d="' + L.arc + '" fill="none" stroke="url(#fv-br)" stroke-width="9" stroke-opacity=".8" stroke-linecap="round"/>' +
        '<path class="b3" d="' + L.arc + '" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-opacity=".9" stroke-linecap="round"/>';
      st.rowWrap.appendChild(st.arcSvg);
      st.arcs = ['.b0', '.b1', '.b2', '.b3'].map(s => st.arcSvg.querySelector(s));
      st.arcLen = st.arcs[0].getTotalLength ? st.arcs[0].getTotalLength() : 2400;
      st.arcs.forEach(p => p.setAttribute('stroke-dasharray', st.arcLen.toFixed(1) + ' ' + (st.arcLen + 10).toFixed(1)));
      // floor glow pools, reflections, coins
      st.pool = coins.map(c => layer(st.rowWrap, 'width:400px;height:100px;transform-origin:50% 50%;border-radius:50%;' +
        'background:radial-gradient(closest-side,' + hexA(c.enamel, 0.42) + ',' + hexA(c.enamel, 0.1) + ' 55%,rgba(0,0,0,0));'));
      st.refl = coins.map(c => img(st.rowWrap, c.src, 1600, 'opacity:.24;' +
        '-webkit-mask-image:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0) 50%,rgba(0,0,0,.95) 100%);' +
        'mask-image:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0) 50%,rgba(0,0,0,.95) 100%);'));
      st.rowCoin = coins.map(c => img(st.rowWrap, c.src, 1600, 'filter:drop-shadow(0 18px 22px rgba(0,0,0,.6));'));
      L.row.order.forEach(i => st.rowWrap.appendChild(st.rowCoin[i]));      // stacking order of the (overlapping) row
      // one light sweep that travels across the settled row (per-coin, masked to each coin)
      st.rowSpec = coins.map(c => {
        const s = layer(st.rowWrap, 'width:1600px;height:1600px;transform-origin:50% 50%;overflow:hidden;mix-blend-mode:screen;opacity:0;' +
          CLIP);
        s._band = layer(s, 'left:0;width:100%;height:100%;');
        return s;
      });
      // soft violet light under the row
      st.rowGlow = layer(st.rowWrap, 'width:1000px;height:1000px;transform-origin:50% 50%;border-radius:50%;' +
        'background:radial-gradient(closest-side,rgba(133,92,255,.30),rgba(119,147,255,.12) 50%,rgba(8,10,18,0) 100%);');
      st.rowWrap.insertBefore(st.rowGlow, st.rowWrap.firstChild);

      // ── type ────────────────────────────────────────────────────────────────
      const T = L.title;
      st.title = K.superText(root, T.text, {
        cls: 'hero', x: T.x, y: T.y, size: T.size, align: T.align, valign: L.P ? 'middle' : 'top',
        color: '#F6F7FC', letterSpacing: '-0.02em', lineHeight: 0.94, shadow: true, fit: T.fit || 0, chroma: 5
      });
      // coin name: small tracked caps + index
      st.nameWrap = layer(root, 'left:' + L.name.x + 'px;top:' + L.name.y + 'px;width:0;height:0;');
      st.names = coins.map((c, i) => {
        const d = K.el('div', { parent: st.nameWrap });
        d.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;display:none;align-items:center;gap:' + (L.P ? 18 : 20) + 'px;' +
          'transform:translate(' + (L.name.align === 'center' ? '-50%' : '0') + ',-50%);font-family:' + K.FONT.display + ';';
        d.innerHTML =
          '<span style="font-family:' + K.FONT.mono + ';font-weight:500;font-size:' + Math.round(L.name.size * 0.62) + 'px;letter-spacing:.18em;color:#B4BFD1;">' +
          String(i + 1).padStart(2, '0') + ' / 05</span>' +
          '<span style="display:inline-block;width:' + (L.P ? 40 : 54) + 'px;height:2px;border-radius:2px;background:' + c.enamel + ';box-shadow:0 0 12px ' + hexA(c.enamel, 0.9) + ';"></span>' +
          '<span style="font-weight:700;font-size:' + L.name.size + 'px;letter-spacing:.3em;color:#F6F7FC;margin-right:-.3em;">' + c.name.toUpperCase() + '</span>';
        return d;
      });
      // descriptor (small caps)
      // 16:9: two stacked lines so the 26 px caps clear the full-frame coin; 9:16: one line under the row
      st.desc = K.superText(root, L.P ? 'FIVE COINS IN SILVER · EDITION OF ' + edition + ' EACH' : 'FIVE COINS IN SILVER\nEDITION OF ' + edition + ' EACH', {
        cls: 'tag', x: L.desc.x, y: L.desc.y, size: L.desc.size, align: L.desc.align, font: K.FONT.display, weight: 600, lineHeight: 1.7, valign: L.P ? 'middle' : 'top',
        letterSpacing: L.P ? '0.22em' : '0.2em', color: '#C9D1E0', split: 'words'
      });
      return st;
    },

    update(st, local, t, ctx) {
      const L = st.L, coins = st.coins;
      const k = Math.min(4, Math.max(0, Math.floor(local / CUT + 1e-6)));
      const u = local - k * CUT;                   // time since this cut
      const c = coins[k];
      const rowP = range(local, T_ROW, T_ROW_END);   // 0..1 Veritas -> row
      const rowE = ease.outExpo(rowP);

      // ── full-frame coin ─────────────────────────────────────────────────────
      const inRow = local >= T_ROW;
      const hit = ease.outExpo(range(u, 0, 0.22));
      let s = lerp(1.07, 1.0, hit) * (1 + 0.03 * ease.inOutSine(range(u, 0, CUT)));
      const dir = k % 2 ? -1 : 1;
      const rot = dir * 2.2 * (1 - hit);
      let fx = L.full.x + dir * 14 * ease.inOutSine(range(u, 0, CUT)), fy = L.full.y;
      let fd = L.full.disc * s;
      if (k === 4 && inRow) {                       // Veritas becomes the row's last coin
        fx = lerp(fx, L.row.xs[4], rowE);
        fy = lerp(fy, L.row.ys[4], rowE);
        fd = lerp(fd, L.row.discs[4], rowE);
      }
      const F = fd / DISC;
      st.full.forEach((e, i) => { const on = i === k && !(inRow && rowP >= 1); if (e._on !== on) { e.style.display = on ? '' : 'none'; e._on = on; } });
      st.spec.forEach((e, i) => { const on = i === k && !inRow; if (e._on !== on) { e.style.display = on ? '' : 'none'; e._on = on; } });
      box(st.full[k], fx, fy, F, 1600, k === 4 && inRow ? 0 : rot);
      // light sweep across the relief, alternating direction
      const sw = range(u, 0.04, 0.46);
      if (!inRow) {
        const sp = st.spec[k];
        box(sp, fx, fy, F, 1600, rot);
        sp.style.opacity = (0.8 * Math.sin(Math.PI * sw)).toFixed(3);
        sp._band.style.transform = 'translate3d(' + (dir * lerp(-55, 55, ease.inOutSine(sw))).toFixed(2) + '%,0,0)';
      }

      // enamel glow (pops on the cut, settles), bleeding sideways into the frame
      if (st._gk !== k) {
        st._gk = k;
        const e = c.enamel;
        st.glow.style.background = 'radial-gradient(closest-side,' + hexA(e, 0.8) + ' 0%,' + hexA(e, 0.62) + ' 46%,' + hexA(e, 0.4) + ' 52%,' +
          hexA(e, 0.2) + ' 61%,' + hexA(e, 0.09) + ' 73%,' + hexA(e, 0.03) + ' 86%,' + hexA(e, 0) + ' 100%)';
        st.bleed.style.background = 'radial-gradient(closest-side,' + hexA(e, 0.26) + ' 0%,' + hexA('#855CFF', 0.10) + ' 55%,rgba(8,10,18,0) 100%)';
      }
      const pop = 1 + 0.35 * Math.exp(-u * 9);
      const glowO = (1 - rowE) * Math.min(1, 0.85 * pop);
      box(st.glow, fx, fy, fd * 2.1 * (1 + 0.05 * (pop - 1)), 1000);
      st.glow.style.opacity = glowO.toFixed(3);
      st.bleed.style.transform = 'translate3d(' + px(fx - 500 - (L.P ? 0 : fd * 0.28)) + ',' + px(fy - 500) + ',0) scale(' +
        (fd * (L.P ? 2.0 : 2.6) / 1000).toFixed(4) + ',' + (fd * (L.P ? 2.4 : 1.6) / 1000).toFixed(4) + ')';
      st.bleed.style.opacity = ((1 - rowE) * 0.95).toFixed(3);

      // cut punch: a short exposure pop on every hard cut
      if (u < 0.07 && local < T_ROW) BV.fx.flash(0.07 * (1 - u / 0.07), 'rgba(235,240,255,1)');

      // ── row formation ──────────────────────────────────────────────────────
      const rowVis = local >= T_ROW - 0.02;
      if (st._rv !== rowVis) { st.rowWrap.style.display = rowVis ? '' : 'none'; st._rv = rowVis; }
      if (rowVis) {
        const R = L.row;
        for (let i = 0; i < 5; i++) {
          const rd = R.discs[i], rF = rd / DISC, floorY = L.floors[i];
          let x, y = R.ys[i], o = 1;
          if (i === 4) {
            x = L.row.xs[4];
            o = rowP >= 1 ? 1 : 0;                // the full-frame Veritas element flies in; hand off on landing
          } else {
            // fan out from behind the shrinking Veritas into the row
            const d0 = T_ROW + 0.03 + (3 - i) * 0.02;
            const p = ease.outExpo(range(local, d0, d0 + 0.36));
            x = lerp(fx, L.row.xs[i], p);
            y = lerp(fy, R.ys[i], p);
            o = range(local, d0, d0 + 0.04);
          }
          const bob = Math.sin((local - T_ROW) * 2.4 + i * 1.3) * 4 * range(local, T_ROW_END - 0.1, T_ROW_END + 0.2);
          const cy = y + bob;
          box(st.rowCoin[i], x, cy, rF, 1600);
          st.rowCoin[i].style.opacity = o.toFixed(3);
          // the sweep: a diagonal band at stage x = bandX crossing every coin in turn
          const sp = st.rowSpec[i];
          box(sp, x, cy, rF, 1600);
          const bandX = lerp(R.xs[0] - R.discs[0] * 1.2, R.xs[4] + R.discs[4] * 1.2, ease.inOutSine(range(local, T_ROW_END - 0.06, 2.6)));
          const rel = (bandX - (x - rd / 2 / DISC)) / (rd / DISC) * 100;      // band position in the coin box, %
          if (rel > -40 && rel < 140 && local > T_ROW_END - 0.06) {
            sp.style.opacity = '0.9';
            sp._band.style.background = 'linear-gradient(100deg,rgba(255,255,255,0) ' + (rel - 18).toFixed(1) + '%,rgba(225,230,255,.28) ' + (rel - 5).toFixed(1) +
              '%,rgba(255,255,255,.7) ' + rel.toFixed(1) + '%,rgba(225,230,255,.28) ' + (rel + 5).toFixed(1) + '%,rgba(255,255,255,0) ' + (rel + 18).toFixed(1) + '%)';
          } else sp.style.opacity = '0';
          const ry = 2 * floorY - cy;
          st.refl[i].style.transform = 'translate3d(' + px(x - 800) + ',' + px(ry - 800) + ',0) scale(' + (rF / 1600).toFixed(5) + ',' + (-rF / 1600).toFixed(5) + ')';
          const settled = i === 4 ? rowE : range(local, T_ROW + 0.1, T_ROW_END);
          st.refl[i].style.opacity = (0.24 * o * settled).toFixed(3);
          st.pool[i].style.transform = 'translate3d(' + px(x - 200) + ',' + px(floorY - 50) + ',0) scale(' + (rd * 1.4 / 400).toFixed(4) + ',' + (rd * 0.3 / 100).toFixed(4) + ')';
          st.pool[i].style.opacity = (o * settled).toFixed(3);
        }
        box(st.rowGlow, L.W / 2, L.glowY, 1000, 1000);
        st.rowGlow.style.transform += ' scale(' + L.glowS[0] + ',' + L.glowS[1] + ')';
        st.rowGlow.style.opacity = ease.outCubic(range(local, T_ROW, T_ROW_END)).toFixed(3);
        // the arc of light draws through behind the row
        const ap = ease.inOutCubic(range(local, T_ROW, T_ROW + 0.36));
        st.arcs.forEach(p => p.setAttribute('stroke-dashoffset', (st.arcLen * (1 - ap)).toFixed(1)));
        st.arcSvg.style.opacity = (0.4 + 0.6 * ap).toFixed(3);
      }

      // ── type ────────────────────────────────────────────────────────────────
      K.animText(st.title, local, 0.0, Infinity, { style: 'scale', stagger: 0.012, dur: 0.32 });
      K.animText(st.desc, local, 0.5, Infinity, { style: 'rise', stagger: 0.025, dur: 0.34 });
      if (L.P) st.desc.el.style.transform = 'translate3d(0,' + (lerp(0, L.desc.tuck - L.desc.y, ease.outCubic(range(local, T_ROW + 0.2, T_ROW + 0.42)))).toFixed(2) + 'px,0)';   // 9:16: tuck under the row
      // coin name: swaps on every cut with a short tracking-in; holds Veritas through the pull-back
      const nameOut = 1 - ease.inCubic(range(local, T_ROW + 0.1, T_ROW + 0.22));
      st.names.forEach((n, i) => {
        const on = i === k && nameOut > 0.001;
        if (n._on !== on) { n.style.display = on ? 'flex' : 'none'; n._on = on; }
      });
      const ni = ease.outExpo(range(u, 0.0, 0.25));
      const nn = st.names[k];
      nn.style.opacity = nameOut.toFixed(3);
      nn.style.transform = 'translate(' + (L.name.align === 'center' ? '-50%' : '0') + ',-50%) translate3d(' + ((1 - ni) * (L.P ? 0 : -18)).toFixed(2) + 'px,' + ((1 - ni) * (L.P ? 10 : 0)).toFixed(2) + 'px,0)';

      // ── out: hand over to 03 ────────────────────────────────────────────────
      const out = 1 - range(local, 2.5, 2.6);
      st._root = st._root || st.title.el.parentNode;
      st._root.style.opacity = out.toFixed(3);
      BV.fx.vignette(0.18);
    }
  });
})();
