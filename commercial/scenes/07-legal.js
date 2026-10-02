/* ============================================================================
   07-legal.js — persistent legal line (0.0–25.0), above every scene, below BV.fx
   The client's own previous film carried a legal line on every frame; this does the same
   with BV_CONFIG.finePrint.short, bottom-left, colour rgba(196,204,220,.9) + soft dark shadow:
     16:9  16 px Geist, x 116, one line, baseline ~ y 1048
     9:16  22 px Geist, x 64, two balanced lines, block y 1540–1595 (inside the 1600 safe line,
           clear of the bottom platform-UI zone)
   Fades out 24.75–25.0 while 06's long fine print band takes over.
   Rock-steady on screen: a counter-transform cancels BV.camera (push / shake / rotation /
   over-scan) — this scene has the highest z so it updates after every other scene, when
   BV.camera holds its final value for the frame.
   noRemap: always real t (callback flash-cuts never hide or replay it).
   Pure function of t: no timers, no randomness.
   ========================================================================== */
(function () {
  'use strict';
  const K = window.BVKit, BV = window.BV;
  if (!K || !BV) { console.error('[07-legal] missing BVKit/BV'); return; }
  const CFG = window.BV_CONFIG || {};
  // a separator never starts a line; "80% buyback" never splits
  const TEXT = String((CFG.finePrint && CFG.finePrint.short) || '').replace(/ · /g, '\u00a0· ').replace(/(\d+%) /g, '$1\u00a0');
  const T0 = 0.0, FADE = [24.75, 25.0];
  const COLOR = 'rgba(196,204,220,.9)';

  // 16:9: one line, baseline ~ y 1048 (8 px under the 1040 brief so the cap height clears 04's
  //       anticipation bar, y 1023–1026 at x 880–1040, by 10 px).
  // 9:16: two balanced lines, block y 1540–1595, inside the 1600 safe line so TikTok/Reels/Shorts
  //       caption + CTA overlays (bottom 320 px) never cover it. The lowest 9:16 content was lifted to
  //       end at ~1500 (02 name/descriptor, 03 phone 1472, 04 anticipation bar 1470, 05 LIST IT card).
  function layout(P) {
    return P
      ? { x: 64, top: 1540, size: 22, lh: 1.25, ls: '0', maxW: 1080 - 64 - 64 }
      : { x: 116, bottom: 1053, size: 16, lh: 1.3, ls: '.03em', maxW: 1920 - 116 - 116 };
  }

  BV.scene({
    id: 'legal', start: T0, end: FADE[1], z: 1000, noRemap: true,

    build(root, ctx) {
      const L = layout(ctx.portrait);
      root.style.pointerEvents = 'none';
      // full-stage counter-camera layer (same origin as #bv-world)
      const steady = K.el('div', { parent: root,
        style: 'position:absolute;left:0;top:0;width:' + ctx.W + 'px;height:' + ctx.H + 'px;transform-origin:50% 50%;pointer-events:none' });
      const anchor = L.top != null ? `top:${L.top}px` : `bottom:${ctx.H - L.bottom}px`;
      const line = K.el('div', { parent: steady, text: TEXT,
        style: `position:absolute;left:${L.x}px;${anchor};max-width:${L.maxW}px;
          font:500 ${L.size}px/${L.lh} 'Geist',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;
          letter-spacing:${L.ls};color:${COLOR};white-space:normal;text-wrap:balance;
          text-shadow:0 1px 2px rgba(0,0,0,.85),0 0 10px rgba(0,0,0,.6);opacity:0` });
      return { steady, line, L };
    },

    update(s, local, t, ctx) {
      const o = 1 - K.ease.inOutSine(K.range(t, FADE[0], FADE[1]));
      s.line.style.opacity = o.toFixed(3);
      counterCamera(s.steady, ctx.W, ctx.H);
    }
  });

  // Inverse of film.js applyCamera (world: translate(x,y) rotate(r) scale(s), origin 50% 50%,
  // with the same translation/rotation over-scan), so the line stays put on screen.
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
})();
