/* ============================================================================
   Bifrost Vault commercial — shared choreography (window.BVShared)
   30 s hero cut ("fast, simple, real product"). One source of truth for cue
   times, the four pulls, the phone/app placement and the end-card bridge arc,
   so every scene agrees on where things are and when.
   Pure data + geometry: no DOM, no randomness.
   ========================================================================== */
(function () {
  // Cue sheet (seconds). 120 BPM, one bar = 2.0 s. Mirrors SCRIPT.md.
  const CUES = {
    hookZero: 0.0, strike: 1.0, intoPhone: 1.7,
    appIn: 2.0, everyPackHits: 2.4, silverOrGold: 3.0, tapRip: 3.5,
    rip: 4.0, drag: 4.1, tear: 4.6, slowOut: 5.4,
    pullSilver: 6.0, pullRare: 7.3, pullGold: 8.6,
    lastCoin: 10.0, heartbeats: [10.0, 10.8], black: 11.4, legendary: 11.5, oneOf25: 12.3, engrave: 12.6, backIntoPhone: 13.4,
    decide: [14.0, 16.0, 18.0, 20.0], vaultLine: 20.8,
    proof: 22.0, nfcTap: 22.5, mintLog: 23.2,
    endCard: 24.5, logo: 25.3, finePrintIn: 25.0, glint: 28.8,
    end: 30.0
  };

  // The four pulls, in reveal order. `t` = the beat the coin flips.
  // Silver pulls are real coins from the Eye of the Unknown series (1 oz .9999 Ag, 100 minted per
  // design, struck by CIT in Liechtenstein). The gold pulls are the Bifrost Gold concept coin.
  // Tier assignments are placeholders until the published odds table exists.
  const PULLS = [
    { coin: 'silence',        tier: 'silver',    t: 6.0,  edition: 41, mintage: 100, metal: 'ag', grams: 31.10, label: 'SILVER.',    metalLine: '.9999 Ag · 31.10 g' },
    { coin: 'ametherion',     tier: 'rare',      t: 7.3,  edition: 12, mintage: 100, metal: 'ag', grams: 31.10, label: 'RARE.',      metalLine: '.9999 Ag · 31.10 g' },
    { coin: 'bifrost-gold-q', tier: 'gold',      t: 8.6,  edition: 19, mintage: 99,  metal: 'au', grams: 7.78,  label: 'GOLD.',      metalLine: '.9999 Au · 7.78 g' },
    { coin: 'bifrost-gold',   tier: 'legendary', t: 11.5, edition: 7,  mintage: 25,  metal: 'au', grams: 31.10, label: 'LEGENDARY.', metalLine: '.9999 Au · 31.10 g' }
  ];

  // The four decisions (scene 06), in order.
  const CHOICES = [
    { t: 14.0, coin: 'bifrost-gold',   action: 'ship',  status: 'SHIPPING',  super: 'SHIP IT HOME.' },
    { t: 16.0, coin: 'ametherion',     action: 'trade', status: 'LISTED',    super: 'TRADE IT ON-CHAIN.' },
    { t: 18.0, coin: 'silence',        action: 'sell',  status: 'SOLD BACK', super: '80% BACK. INSTANTLY.' },
    { t: 20.0, coin: 'bifrost-gold-q', action: 'vault', status: 'VAULTED',   super: 'OR VAULT IT.' }
  ];

  // The six coins on the end-card bridge, left to right.
  const END_COINS = ['silence', 'dominion', 'cycle', 'ametherion', 'veritas', 'bifrost-gold'];

  // Running metal totals (grams) after each pull: Ag 0 -> 31.10 -> 62.20 ; Au 0 -> 7.78 -> 38.88
  function metalAt(t) {
    let ag = 0, au = 0;
    for (const p of PULLS) if (t >= p.t) { if (p.metal === 'ag') ag += p.grams; else au += p.grams; }
    return { ag: Math.round(ag * 100) / 100, au: Math.round(au * 100) / 100 };
  }

  /* Layout for a format. ctx = { W, H, portrait }.
     phone: the device rect (stage px). supers: the zone for big type outside the phone.
     bridge: end-card arc (theta 0 = left foot .. PI = right foot).
     hero: where the Legendary lands when it bursts out of the phone (scene 05). */
  function layout(ctx) {
    const P = !!ctx.portrait, W = ctx.W, H = ctx.H;
    const ph = P ? 1240 : 940, pw = Math.round(ph * 0.4615);
    const pcx = P ? 540 : 700, ptop = P ? 450 : (H - ph) / 2;
    const phone = { x: pcx - pw / 2, y: ptop, w: pw, h: ph, cx: pcx, cy: ptop + ph / 2, r: Math.round(pw * 0.15) };
    const supers = P
      ? { x: 64, y: 220, w: W - 128, h: 210, align: 'center' }
      : { x: 1150, y: 200, w: 680, h: 680, align: 'left' };
    const safe = P ? { l: 64, r: W - 64, t: 220, b: H - 320 } : { l: W * 0.06, r: W * 0.94, t: H * 0.06, b: H * 0.94 };
    const bridge = P ? { cx: 540, cy: 1180, rx: 400, ry: 560 } : { cx: 960, cy: 760, rx: 620, ry: 470 };
    function bridgeAt(theta) {
      const x = bridge.cx - bridge.rx * Math.cos(theta), y = bridge.cy - bridge.ry * Math.sin(theta);
      const dx = bridge.rx * Math.sin(theta), dy = -bridge.ry * Math.cos(theta);
      return { x, y, angle: Math.atan2(dy, dx) * 180 / Math.PI };
    }
    const bridgePath = `M ${bridge.cx - bridge.rx} ${bridge.cy} A ${bridge.rx} ${bridge.ry} 0 0 1 ${bridge.cx + bridge.rx} ${bridge.cy}`;
    const hero = P ? { x: 540, y: 980, size: 900 } : { x: 1240, y: 540, size: 820 };
    return { W, H, portrait: P, phone, supers, safe, bridge, bridgeAt, bridgePath, hero };
  }

  const TIER_COLOR = { silver: '#C9D1D9', rare: '#9A4CC9', gold: '#E9C46A', legendary: '#F2C66D' };
  const TIER_LABEL = { silver: 'SILVER', rare: 'RARE SILVER', gold: 'GOLD', legendary: 'LEGENDARY GOLD' };

  window.BVShared = { CUES, PULLS, CHOICES, END_COINS, metalAt, layout, TIER_COLOR, TIER_LABEL };
})();
