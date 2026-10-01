/* ============================================================================
   Bifrost Vault commercial — shared choreography (window.BVShared)
   One source of truth for cue times, the four pulls, the Bifrost bridge arc
   the coins ride, and the HUD layout. Scenes read from here so the rip, the
   pulls, the Legendary and the HUD all agree on where things are and when.
   Pure data + geometry: no DOM, no randomness.
   ========================================================================== */
(function () {
  // Cue sheet (seconds). 120 BPM, one bar = 2.0 s. Mirrors the shooting script.
  const CUES = {
    nftDrop: 0.0, nftReveal: 0.5, nftFlex: 1.0, nftTrade: 1.5, scaleZero: 2.0,
    strike: 4.0, goldLand: 4.8, matchCut: 5.85,
    packIn: 6.0, hudIn: 6.2, everyPackHits: 7.2, packFlip: 8.0, noEmptyPulls: 8.4, packFlipBack: 9.4,
    grab: 10.0, hush: 11.5, tear: 12.0, slowIn: 12.25, slowOut: 13.5, bridge: 13.5,
    pullSilver: 14.0, pullRare: 15.5, pullGold: 17.0, lastCoinRide: 18.5,
    lastCoin: 20.0, heartbeats: [20.0, 20.8, 21.4, 21.8], black: 21.93,
    legendary: 22.0, legendarySlowOut: 23.0, engrave: 23.6, beauty: 24.6,
    mint: 26.0, nfcTap: 28.6,
    yourCall: 30.0, stamps: [31.0, 31.5, 32.0, 32.5], vaultLock: 32.9,
    ship: 34.0, trade: 38.0, escrowLatch: 41.0, released: 42.6, royalty: 43.0,
    sellBack: 45.0, buybackSlam: 46.0, instant: 46.6,
    callback: [50.0, 50.5, 51.0, 51.5], endImpact: 52.0, finePrintIn: 52.5, glint: 58.5,
    end: 60.0
  };

  // The four pulls, in reveal order. `t` = the beat the coin lands and flips.
  const PULLS = [
    { coin: 'huginn',   tier: 'silver',    t: 14.0, edition: 412, mintage: 999, metal: 'ag', grams: 31.10, label: 'SILVER.' },
    { coin: 'fjord',    tier: 'rare',      t: 15.5, edition: 88,  mintage: 250, metal: 'ag', grams: 31.10, label: 'RARE SILVER.' },
    { coin: 'valkyrie', tier: 'gold',      t: 17.0, edition: 19,  mintage: 99,  metal: 'au', grams: 7.78,  label: 'GOLD.' },
    { coin: 'heimdall', tier: 'legendary', t: 22.0, edition: 7,   mintage: 25,  metal: 'au', grams: 31.10, label: 'LEGENDARY' }
  ];

  // Running metal totals (grams) as the HUD odometer should read after each pull.
  // AG 0 -> 31.10 -> 62.20 ; AU 0 -> 7.78 -> 38.88
  function metalAt(t) {
    let ag = 0, au = 0;
    for (const p of PULLS) if (t >= p.t) { if (p.metal === 'ag') ag += p.grams; else au += p.grams; }
    return { ag: Math.round(ag * 100) / 100, au: Math.round(au * 100) / 100 };
  }

  /* Layout for a format. ctx = { W, H, portrait }.
     bridge: an elliptical arc from the pack mouth (left foot, theta=0) over an apex
     (theta=PI/2) to the right foot (theta=PI). The same arc is drawn by the rip
     scene and ridden by every coin, so pull scenes must use bridgeAt/coinRide. */
  function layout(ctx) {
    const P = !!ctx.portrait, W = ctx.W, H = ctx.H;
    const bridge = P
      ? { cx: 540, cy: 1500, rx: 390, ry: 980 }      // feet (150,1500)/(930,1500), apex y=520
      : { cx: 960, cy: 940,  rx: 660, ry: 760 };     // feet (300,940)/(1620,940),  apex y=180
    const mouth = { x: bridge.cx - bridge.rx, y: bridge.cy };
    const land = P ? { x: 540, y: 820, size: 720 } : { x: 960, y: 540, size: 720 };

    // Rail of docked pulls (4 glass slots).
    const slot = P ? 140 : 120, gap = P ? 28 : 24;
    const railY = P ? 1262 : H - 110;
    const railW = 4 * slot + 3 * gap, railX0 = W / 2 - railW / 2 + slot / 2;
    const rail = [0, 1, 2, 3].map((i) => ({ x: railX0 + i * (slot + gap), y: railY, size: slot }));

    // HUD anchors (top-left of each block unless noted). Safe margins: 6% landscape; 64/220/320 portrait.
    const hud = P ? {
      live: { x: 64, y: 220 },                          // LIVE RIP pill + DRAMATISATION + 18+
      odometer: { x: W - 64, y: 300, align: 'right' },  // METAL PULLED, right aligned
      ladder: { x: 64, y: 300, w: 520, h: 14, dir: 'h' }, // horizontal 4-segment bar under the HUD
      chat: { x: 64, y: 1372, w: W - 128, h: 228, mode: 'ticker' }, // 3-line bottom ticker (ends at the 320px bottom safe zone)
      hype: { x: 64, y: 1352, w: W - 128 }              // sits on the ticker's top edge
    } : {
      live: { x: 96, y: 64 },
      odometer: { x: 96, y: 136, align: 'left' },
      ladder: { x: 96, y: 360, w: 14, h: 360, dir: 'v' }, // vertical 4-segment ladder, bottom = silver
      chat: { x: W - 96 - 440, y: 170, w: 440, h: 700, mode: 'column' },
      hype: { x: 96, y: H - 84, w: 360 }
    };
    const safe = P ? { l: 64, r: W - 64, t: 220, b: H - 320 } : { l: W * 0.06, r: W * 0.94, t: H * 0.06, b: H * 0.94 };

    // Point on the bridge arc, theta in [0, PI]. Returns position + tangent angle (deg).
    function bridgeAt(theta) {
      const x = bridge.cx - bridge.rx * Math.cos(theta);
      const y = bridge.cy - bridge.ry * Math.sin(theta);
      const dx = bridge.rx * Math.sin(theta), dy = -bridge.ry * Math.cos(theta);
      return { x, y, angle: Math.atan2(dy, dx) * 180 / Math.PI };
    }
    // SVG path for the full arc (stroke it with the four aurora bands).
    const bridgePath = `M ${mouth.x} ${mouth.y} A ${bridge.rx} ${bridge.ry} 0 0 1 ${bridge.cx + bridge.rx} ${bridge.cy}`;

    // A coin's flight: u in [0,1]. 0..0.62 rides the arc from the mouth to the apex,
    // 0.62..1 drops from the apex into the landing spot (quadratic ease, scale grows).
    // Returns {x, y, s} where s is the scale relative to `land.size` (coins are mounted at land.size).
    function coinRide(u) {
      u = Math.max(0, Math.min(1, u));
      const split = 0.62, apex = bridgeAt(Math.PI / 2);
      if (u <= split) {
        const k = u / split, p = bridgeAt(k * Math.PI / 2);
        return { x: p.x, y: p.y, s: 0.16 + 0.14 * k };
      }
      const k = (u - split) / (1 - split), e = 1 - (1 - k) * (1 - k);
      const c = { x: (apex.x + land.x) / 2 + (P ? 120 : 220), y: apex.y - (P ? 40 : 30) }; // control point
      const x = (1 - e) * (1 - e) * apex.x + 2 * (1 - e) * e * c.x + e * e * land.x;
      const y = (1 - e) * (1 - e) * apex.y + 2 * (1 - e) * e * c.y + e * e * land.y;
      return { x, y, s: 0.30 + 0.70 * e };
    }

    return { W, H, portrait: P, bridge, bridgePath, bridgeAt, mouth, land, coinRide, rail, hud, safe };
  }

  const TIER_COLOR = { silver: '#C9CED8', rare: '#4D8DFF', gold: '#E9C46A', legendary: '#F2C66D' };
  const TIER_LABEL = { silver: 'SILVER', rare: 'RARE SILVER', gold: 'GOLD', legendary: 'LEGENDARY GOLD' };

  window.BVShared = { CUES, PULLS, metalAt, layout, TIER_COLOR, TIER_LABEL };
})();
