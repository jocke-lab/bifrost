/* TEMPORARY integration test scene (kit/engine smoke test). Remove before shipping. */
(function () {
  const BV = window.BV;
  BV.scene({
    id: 'zz-test', start: 0, end: 6.0, z: 1, chapter: 'Kit test',
    build(root, ctx) {
      const K = ctx.kit, W = ctx.W, H = ctx.H, P = ctx.portrait;
      root.style.background = 'radial-gradient(ellipse at 50% 60%, #0A1019, #05070D 70%)';
      const au = K.aurora(root, { W, H, seed: 11 });
      const cv = K.el('canvas', { class: 'bvk-canvas', parent: root });
      cv.width = W; cv.height = H; cv.style.width = W + 'px'; cv.style.height = H + 'px';
      const c2 = cv.getContext('2d');
      const dust = K.emitter(cv, { seed: 4, rate: 26, w: W, h: H, x: W / 2, y: H / 2, speed: [6, 30], angle: [250, 290],
        life: [3, 6], size: [1.2, 3.2], shape: 'dot', colors: ['#EAF2F8', '#19D3FF', '#7C5CFF'], twinkle: 0.5, alpha: 0.7, sway: [14, 0.2] });
      const bx = P ? W / 2 : W * 0.5, by = P ? H * 0.42 : H * 0.42;
      const burst = K.particles(cv, { seed: 9, count: 220, x: bx, y: by, spread: 30, speed: [300, 1500], gravity: 900, drag: 1.6,
        life: [0.6, 1.6], size: [2, 6], shape: ['spark', 'star', 'shard', 'dot'], colors: ['#FFFFFF', '#F2C66D', '#19D3FF', '#7C5CFF', '#46E6A6'] });

      const k = P ? 0.72 : 1;
      const y = f => H * f;
      const T = {
        hero: K.superText(root, 'REAL ART.\nREAL SILVER.', { cls: 'hero', y: y(P ? 0.2 : 0.2), gradient: 'aurora', chroma: true, glow: 'rgba(77,141,255,.45)' }),
        slam: K.superText(root, 'LEGENDARY.', { cls: 'hero', y: y(0.42), gradient: 'gold', chroma: true, glow: 'rgba(242,198,109,.5)', fit: W * 0.88 }),
        blur: K.superText(root, 'Every pack hits.', { cls: 'sub', y: y(0.56) }),
        scale: K.superText(root, '1 OF 25', { cls: 'num', y: y(0.66), gradient: 'silver' }),
        type: K.superText(root, 'tx 0x9f3a…c21e · Minted on Base', { cls: 'mono', y: y(0.75), color: '#46E6A6' }),
        wipe: K.superText(root, 'Eye of the Unknown · 4 coins', { cls: 'tag', y: y(0.81) }),
        rise2: K.superText(root, 'RIP IT.', { cls: 'hero', y: y(0.42), gradient: 'aurora', chroma: true, split: 'words' })
      };
      const box = K.el('div', { parent: root, style: { position: 'absolute', left: (W / 2 - 260 * k) + 'px', top: y(0.86) + 'px', width: 520 * k + 'px', height: 110 * k + 'px',
        borderRadius: 22 * k + 'px', background: 'linear-gradient(180deg,#F4F7FA,#9AA5B1 55%,#5B6670)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        font: '700 ' + Math.round(54 * k) + 'px "Space Grotesk"', color: '#05070D', letterSpacing: '-0.02em' } });
      const num = K.el('span', { parent: box, text: '0' });
      return { au, cv, c2, dust, burst, T, box, num };
    },
    update(s, local, t, ctx) {
      const K = ctx.kit;
      s.au.draw(t, 0.9 + 0.3 * Math.sin(t), 0);
      s.c2.setTransform(1, 0, 0, 1, 0, 0);
      s.c2.clearRect(0, 0, ctx.W, ctx.H);
      s.dust.draw(s.c2, local);
      K.animText(s.T.hero, local, 0.1, 5.6, { style: 'rise' });
      const sl = K.animText(s.T.slam, local, 1.0, 3.3, { style: 'slam' });
      s.burst.draw(s.c2, local - sl.impact);
      const sh = K.shake(local - sl.impact, 26, 3, 3.5);
      BV.camera.x += sh.x; BV.camera.y += sh.y; BV.camera.r += sh.r;
      BV.fx.flash(K.env(local, sl.impact - 0.02, sl.impact, sl.impact + 0.02, sl.impact + 0.35) * 0.8, 'gold');
      K.animText(s.T.blur, local, 0.4, 5.6, { style: 'blur' });
      K.animText(s.T.scale, local, 1.6, 5.6, { style: 'scale' });
      K.animText(s.T.type, local, 0.6, 5.6, { style: 'type' });
      K.animText(s.T.wipe, local, 0.8, 5.6, { style: 'wipe' });
      const r2 = K.animText(s.T.rise2, local, 3.5, 5.6, { style: 'slam' });
      BV.fx.flash(K.env(local, r2.impact - 0.02, r2.impact, r2.impact + 0.02, r2.impact + 0.3) * 0.7, 'aurora');
      K.countUp(s.num, local, 1.2, 2.6, 0, 31.1, v => v.toFixed(2) + ' g');
      K.sweep(s.box, local, 2.0, 3.0, {});
      BV.fx.vignette(K.range(local, 4.5, 5.5) * 0.6);
      BV.fx.bars(K.env(local, 3.3, 3.6, 4.6, 5.0));
      if (BV.params.has("nograin")) BV.fx.grain(false);
    }
  });
})();
