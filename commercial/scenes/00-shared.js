/* ============================================================================
   Bifrost Vault commercial — shared choreography (window.BVShared)
   v3 "the real thing": one source of truth for cue times, the five Eye of the
   Unknown coins, the phone placement and the sealed-case film mapping, so every
   scene agrees on where things are and when. Mirrors SCRIPT.md.
   Pure data + geometry: no DOM, no randomness.
   ========================================================================== */
(function () {
  // Cue sheet (seconds). 120 BPM, one bar = 2.0 s.
  const CUES = {
    // 01 hook
    hookSweep: 0.0, caughtYourEye: 0.9, hookPullBack: 1.6,
    // 02 the five (hard cuts on the half-beats)
    five: [2.5, 3.0, 3.5, 4.0, 4.5], fiveRow: 4.3,
    // 03 mint the one you love
    mint: 5.0, fallForOne: 5.2, tapCoin: 5.8, sheet: 6.4, mintIt: 7.0, tapMint: 7.2, confirmed: 8.2, certificate: 8.6,
    // 04 or let the box choose (the client's real opening)
    box: 10.0, anticipation: 11.4, hereItComes: 12.4, release: 12.65, latch: 13.0, freeze: 15.0,
    rise: 15.2, clearsRim: 16.1, result: 17.0, yoursToDiscover: 17.2,
    // 05 your coin, your call
    decide: [20.0, 21.25, 22.5, 23.75], buybackConfirm: 24.5,
    // 06 end card
    end: 25.0, finePrintIn: 25.0, logo: 25.8, glint: 28.8,
    filmEnd: 30.0
  };

  // The five coins (ids match BV_CONFIG.collection.coins).
  const ORDER = ['silence', 'ametherion', 'cycle', 'dominion', 'veritas'];
  const coin = (id) => (window.BV_CONFIG.collection.coins.find((c) => c.id === id));

  // Who plays which part.
  const ROLES = {
    hook: 'silence',          // the macro iris + first full coin
    minted: 'veritas',        // the coin chosen and minted in the app
    mintedEdition: 7,
    boxReveal: 'dominion',    // the coin that rises from the sealed case
    boxEdition: 7
  };

  /* The sealed-case film (assets/box/vault-opening-hq.mp4, 1920x1080, 24 fps, 6.05 s).
     Global time -> film time: real time 10.0-13.0 (film 0-3.0), a slow-motion lid
     rise 13.0-15.0 (film 3.0-4.375), then the frame freezes at 4.375 s like the app. */
  const FILM = { fps: 24, frames: 145, duration: 6.05, freeze: 4.375, rimFrac: 0.5352, w: 1920, h: 1080 };
  function filmTime(t) {
    if (t <= 10.0) return 0;
    if (t <= 13.0) return t - 10.0;
    if (t <= 15.0) return 3.0 + (t - 13.0) * (1.375 / 2.0);
    return FILM.freeze;
  }
  const filmFrame = (t) => Math.min(FILM.frames - 1, Math.round(filmTime(t) * FILM.fps));

  /* Layout for a format. ctx = { W, H, portrait }. */
  function layout(ctx) {
    const P = !!ctx.portrait, W = ctx.W, H = ctx.H;
    // Phone (scene 03): 9:19.5 device.
    const ph = P ? 1240 : 940, pw = Math.round(ph * 0.4615);
    const pcx = P ? 540 : 700, ptop = P ? 470 : (H - ph) / 2;
    const phone = { x: pcx - pw / 2, y: ptop, w: pw, h: ph, cx: pcx, cy: ptop + ph / 2, r: Math.round(pw * 0.15) };
    // Big type zone outside the phone.
    const supers = P
      ? { x: 64, y: 220, w: W - 128, h: 230, align: 'center' }
      : { x: 1150, y: 200, w: 680, h: 680, align: 'left' };
    const safe = P ? { l: 64, r: W - 64, t: 220, b: H - 320 } : { l: W * 0.06, r: W * 0.94, t: H * 0.06, b: H * 0.94 };
    // The sealed-case film rect: full frame in 16:9; in 9:16 scaled 0.84 and centred low so the case fits the width.
    const film = P
      ? (() => { const s = 0.84, w = FILM.w * s, h = FILM.h * s; return { x: (W - w) / 2, y: 1020 - h / 2, w, h, s }; })()
      : { x: 0, y: 0, w: W, h: H, s: 1 };
    film.rimY = film.y + film.h * FILM.rimFrac;   // the case's front rim (where the seal glows and the coin emerges)
    film.cx = film.x + film.w / 2;
    // Where a hero coin floats (scenes 01, 04, 05).
    const hero = P ? { x: 540, y: 960, size: 820 } : { x: 960, y: 520, size: 760 };
    // The coin rising out of the case (scene 04): from the rim to its float position.
    const rise = P ? { x: film.cx, y0: film.rimY + 40, y1: 760, size: 700 } : { x: film.cx, y0: film.rimY + 40, y1: 400, size: 600 };
    return { W, H, portrait: P, phone, supers, safe, film, hero, rise };
  }

  window.BVShared = { CUES, ORDER, coin, ROLES, FILM, filmTime, filmFrame, layout };
})();
