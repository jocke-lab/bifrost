/* ============================================================================
   app-ui.js — window.BVApp
   Bifrost Vault commercial · the client's REAL app UI as a film kit.

   Ported from the product repo (bp-shop/apps/market/src, read-only):
     app/globals.css ............ tokens, .btn / .btn-gold / .btn-ghost, .card, .kicker, .chip
     components/BrandMark.tsx ... the mark (gold ring + bridge stroke)
     home/CollectionMintButton + collection-mint.module.css + live/mint-image-progress.module.css
                                  "Eye of the Unknown / Choose your coin" picker (mobile = bottom sheet, 2 cols)
     checkout/CheckoutFlow + purchase.module.css   "Make it yours." (mobile layout, fixed gold action bar)
     pay/PayStages + payment.module.css            5-segment rail Prepare→Confirm→Payment→Check→Complete
     market/ChainRecordCard + detail.module.css    "On-chain on Base ↗", record rows, "Certificate minted"
     pack/PackOpening + vault-reveal.module.css    result block ("Revealed from the vault" …)
     market/OwnerStrip + orderbook/orderblock.module.css   owner panel ("This is your coin" …)
   Everything is pure DOM + time-driven setters: no timers, no CSS transitions/animations,
   no randomness. Setters take progress values (0..1) or stage numbers that scenes derive from t.

   UNITS / SCALE
     All component CSS is authored in DESIGN px of a 414 px-wide mobile viewport (the real app's
     mobile CSS px), written as `calc(N * var(--u))`. The device is 434 x 940 design px
     (10 px graphite bezel, screen 414 x 920). BVApp.phone() sets --u = rect.h / 940 px on the
     device, so everything inside the phone scales with it. Components placed directly on the
     stage (outside a phone) take an optional `scale` (stage px per design px) -> sets --u.
     Positions returned by helpers (center(), …) are in STAGE px relative to the given ancestor
     and ignore transforms set by the setters (layout positions).

   API
     BVApp.T                                   real tokens {bg,surface,surface2,surface3,line,line2,text,muted,faint,
                                               gold,onGold,accent,violet,lavender,...}
     BVApp.coin(id) -> {id,name,file,enamel}   from BV_CONFIG.collection.coins
     BVApp.icons                               {check,arrow,ext,lock,vault,tag,truck,gift,base,ring,chevron} svg strings
     BVApp.pos(el, ancestor) -> {x,y,w,h,cx,cy} layout box of el inside ancestor (offset walk, stage px)

     BVApp.phone(parent, ctx, {rect, time:'9:41', glow:false}) ->
        {el, screen, content, k, rect, set({x,y,s,r,o,rx,ry,glow}), toStage(x,y)}
        Thin graphite device at rect (default BVShared.layout(ctx).phone). `screen` = full display
        (414x920 design px, obsidian #080a12, rounded), status bar "9:41" + dynamic island +
        home indicator drawn above everything in the screen. `content` = an alias of screen
        (pages fill it; their own headers leave room for the 50 px status bar).
        set(): x,y translate (stage px), s scale, r rotateZ deg, rx/ry 3D tilt deg, o opacity,
        glow 0..1 violet under-glow. Pure transform/opacity write.
     BVApp.mark(parent, size, {gradientId}) -> svg el    BrandMark, viewBox 32, ring #E6B45A + bridge gradient
     BVApp.chooser(parent, {coins, edition=50, leftCounts:{id:n}, cols=2, page=true, collection}) ->
        {el, sheet, open(p), highlight(id,p), press(id,p), scroll(px), center(id) -> {x,y}}
        Screen layer: dimmed home page (Eye of the Unknown hero) behind the real mobile bottom-sheet
        dialog: "Eye of the Unknown" / "Choose your coin" / "Explore each design in 3D before you mint.",
        grid of coin cards (real photo on radial #252642→#10141f, overlay "{n} left · {N} editions" + bar,
        name, "Mint ↗"). open(p): sheet slides up + backdrop. highlight: accent border + lift + glow.
        press: press-in squeeze. scroll(px): scrolls the sheet body (design px). center(id): card centre.
     BVApp.checkout(parent, {coinId, edition=50, left, button:'Mint', sheet=true}) ->
        {el, open(p), press(p), stage(v), center() -> button centre}
        "Make it yours." screen as a sheet over the chooser: header (mark · BIFROST · Secure checkout),
        steps 01 Review / 02 Payment, piece card (photo, name, "2026 · Silver", "Edition of 50"),
        order lines "Base certificate — Included", "Network fee — Covered by Bifrost",
        "{n} of {N} editions remain.", vault option, fixed gold action bar. stage(v): v<0 hidden;
        v>=0 shows the PayStages rail inside the sheet and turns the gold button into the busy
        "Confirming your purchase…" state (spinner angle derived from v); v>=5 "Payment confirmed".
     BVApp.progress(parent, {labels=true, scale}) -> {el, set(stage)}
        Real PayStages block: 5-segment cyan track (fractional stage fills the active segment), bold
        label = active stage title, sub line = real sub copy; set(5) -> "Payment confirmed" /
        "Opening your coin…". labels:true adds the five stage names under the track (film legibility).
     BVApp.record(parent, {coinId, edition=7, mintage=50, token, variant:'chip'|'card', scale}) ->
        {el, show(p)}
        chip: glass pill "✓ Certificate minted · № 07 of 50 · On-chain on Base ↗" (docks under a coin).
        card: ChainRecordCard ("On-chain record" kicker + "On-chain on Base ↗" pill, rows Certificate /
        Edition / Contract 0x4Ac6…eDC9 ↗, event "Certificate minted" + tx ↗). Never prints "token".
     BVApp.result(parent, {coinId, edition=7, mintage=50, metal:'Silver', actions=true, align:'center',
        format:'real'|'short', scale}) -> {el, show(p)}
        PackOpening result: eyebrow "Revealed from the vault", "Silver / № 007 of 50" (real format;
        format:'short' -> "Silver · № 07 of 50"), coin name (h1), "Your exact coin. Keep it vaulted,
        list it, or bring it home.", buttons "View your certificate ↗" (lavender) + "Continue →".
     BVApp.owner(parent, {coinId, edition=7, status:'Vaulted · not listed', actions:[{label,variant}], scale}) ->
        {el, show(p), status(text), press(i,p)}
        OwnerStrip panel: gold kicker "This is your coin", "You hold edition #07 · Vaulted · not listed",
        ghost buttons "List #07 for sale" / "Gift" / "Ship home" (variant 'gold' for the one gold action).
     BVApp.chip(parent, label, {icon:'vault'|'tag'|'truck'|'ring'|'check'|'base'|null, tone:'mut'|'accent'|
        'gold'|'violet'|'ok', sub, scale}) -> {el, show(p)}       glass status pill (holdChip/badge look)
     BVApp.touch(parent, {scale}) -> {el, set(x, y, p)}
        Touch ring at (x,y) stage px in parent: p 0..0.3 appear, 0.3..0.5 press, 0.5..1 ripple + fade.
     BVApp.button(parent, label, {variant:'gold'|'ghost'|'neutral'|'lavender', block, scale}) -> {el, press(p)}

   All builders return elements already appended to parent. Styles: one <style id="bva-style">.
   ========================================================================== */
(function () {
  'use strict';

  /* ── tokens (apps/market/src/app/globals.css :root) ─────────────────────── */
  const T = {
    bg: '#080a12', surface: '#11141d', surface2: '#181c28', surface3: '#222736',
    line: 'rgba(255,255,255,.07)', line2: 'rgba(255,255,255,.13)',
    text: '#eaf1f8', muted: '#93a0b2', faint: '#8996aa',
    gold: '#e6b45a', goldSoft: 'rgba(230,180,90,.14)', onGold: '#20160a',
    accent: '#19d3ff', up: '#46e6a6', violet: '#855cff', violetLt: '#b29aff', lavender: '#d4c3ff',
    bridge: ['#67DCEA', '#7793FF', '#855CFF']
  };
  const DEV = { w: 434, h: 940, bezel: 10, sw: 414, sh: 920, status: 50 };
  const FONT = "'Geist', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";
  const CONTRACT = '0x4Ac6…eDC9';                  // Eye certificate contract on Base (shortAddr)

  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const range = (x, a, b) => clamp((x - a) / (b - a));
  const oQuint = t => 1 - Math.pow(1 - clamp(t), 5);
  const oCubic = t => 1 - Math.pow(1 - clamp(t), 3);
  const ioSine = t => -(Math.cos(Math.PI * clamp(t)) - 1) / 2;
  const pad = (n, w) => String(n).padStart(w, '0');
  let uid = 0;

  /* ── icons (stroke = currentColor) ──────────────────────────────────────── */
  const sv = (d, w = 1.9) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const icons = {
    check: sv('<path d="M5 13l4 4 10-10"/>', 2.6),
    arrow: sv('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    ext: sv('<path d="M7 17 17 7M9 7h8v8"/>'),
    lock: sv('<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', 1.8),
    vault: sv('<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="m8 12 3 3 5-6"/>', 1.8),
    tag: sv('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.4"/>', 1.8),
    truck: sv('<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>', 1.8),
    gift: sv('<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8s-1-5-4-5-2 5 4 5zM12 8s1-5 4-5 2 5-4 5z"/>', 1.7),
    base: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17"/>', 2),
    ring: sv('<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4h-4"/>', 1.9),
    chevron: sv('<path d="m9 6 6 6-6 6"/>', 2),
    close: sv('<path d="M6 6l12 12M18 6 6 18"/>', 1.6),
    search: sv('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>', 1.8)
  };

  /* ── styles ─────────────────────────────────────────────────────────────── */
  const CSS = `
.bva{font-family:${FONT};color:${T.text};font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;line-height:1.55;box-sizing:border-box;text-align:left;letter-spacing:0}
.bva *,.bva *::before,.bva *::after{box-sizing:border-box}
.bva svg{display:block}
.bva-abs{position:absolute;left:0;top:0}
.bva-fill{position:absolute;inset:0}

/* device */
.bva-phone{position:absolute;width:434u;height:940u;transform-origin:50% 50%;will-change:transform}
.bva-phone-glow{position:absolute;left:-30%;right:-30%;top:-12%;bottom:-12%;border-radius:50%;pointer-events:none;
  background:radial-gradient(closest-side,rgba(133,92,255,.55),rgba(119,147,255,.2) 50%,transparent 80%);opacity:0}
.bva-phone-shadow{position:absolute;left:6%;right:6%;bottom:-26u;height:60u;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.75),transparent);pointer-events:none}
.bva-frame{position:absolute;inset:0;border-radius:66u;
  background:linear-gradient(145deg,#4b4f58 0%,#24262c 18%,#15171b 50%,#2a2d33 82%,#55596282 100%);
  box-shadow:0 40u 110u -20u rgba(0,0,0,.85),inset 0 0 0 1.2u rgba(255,255,255,.14),inset 0 0 0 3u #0b0c0f}
.bva-frame::after{content:'';position:absolute;inset:3.5u;border-radius:62.5u;background:#000;box-shadow:inset 0 0 0 1u rgba(255,255,255,.05)}
.bva-btnside{position:absolute;width:4u;border-radius:2u;background:linear-gradient(90deg,#2b2e34,#55595f,#24262b)}
.bva-screen{position:absolute;left:10u;top:10u;width:414u;height:920u;border-radius:56u;overflow:hidden;background:${T.bg};isolation:isolate;transform:translateZ(0)}
.bva-status{position:absolute;left:0;right:0;top:0;height:50u;z-index:40;pointer-events:none;color:#fff}
.bva-time{position:absolute;left:44u;top:15u;font-size:17u;font-weight:700;letter-spacing:-.01em;line-height:20u}
.bva-sicons{position:absolute;right:34u;top:18u;display:flex;gap:6u;align-items:center}
.bva-island{position:absolute;left:50%;top:11u;width:124u;height:36u;margin-left:-62u;border-radius:20u;background:#000;z-index:41;
  box-shadow:inset 0 0 0 1u rgba(255,255,255,.03)}
.bva-island::after{content:'';position:absolute;right:16u;top:12u;width:12u;height:12u;border-radius:50%;background:radial-gradient(circle at 35% 35%,#2a3550,#0b0e16 60%)}
.bva-home{position:absolute;left:50%;bottom:8u;width:140u;height:5u;margin-left:-70u;border-radius:3u;background:rgba(255,255,255,.88);z-index:40}
.bva-glass{position:absolute;inset:0;border-radius:56u;pointer-events:none;z-index:45;
  background:linear-gradient(120deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,0) 28%,rgba(255,255,255,0) 70%,rgba(255,255,255,.025) 100%)}

/* shared bits */
.bva-btn{display:flex;align-items:center;justify-content:center;gap:10u;min-height:52u;padding:0 20u;border-radius:12u;border:1px solid ${T.line2};background:${T.surface2};color:${T.text};font-weight:600;font-size:15u;line-height:1.2;white-space:nowrap;position:relative;overflow:hidden}
.bva-btn svg{width:16u;height:16u}
.bva-btn.gold{background:${T.gold};border-color:${T.gold};color:${T.onGold};font-weight:700}
.bva-btn.ghost{background:transparent;border-color:${T.line};color:${T.muted}}
.bva-btn.lavender{background:${T.lavender};border-color:#e8ddff;color:#191326;border-radius:8u;font-size:13u;font-weight:600}
.bva-btn.sm{min-height:40u;padding:8u 13u;font-size:13u;border-radius:10u}
.bva-btn-sheen{position:absolute;top:-20%;bottom:-20%;width:40%;left:0;background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);opacity:0;pointer-events:none}
.bva-spin{width:18u;height:18u;border:2u solid currentColor;border-right-color:transparent;border-radius:50%;flex:none}
.bva-kicker{display:inline-flex;align-items:center;gap:8u;font-size:12.5u;font-weight:700;letter-spacing:.16em;font-variant-caps:all-small-caps;color:${T.accent}}
.bva-kicker::before{content:'';width:22u;height:2u;border-radius:2u;background:linear-gradient(120deg,#7c5cff,#4d8dff 38%,#19d3ff 68%,#46e6a6);-webkit-mask-image:linear-gradient(90deg,#000,transparent);mask-image:linear-gradient(90deg,#000,transparent)}
.bva-mono{font-family:${MONO};letter-spacing:0}
.bva-ext{display:inline-block;margin-left:.25em}

/* app nav (mobile) */
.bva-nav{position:absolute;left:0;right:0;top:50u;height:56u;display:flex;align-items:center;gap:8u;padding:0 16u;border-bottom:1px solid ${T.line};background:rgba(8,10,18,.82)}
.bva-brand{display:flex;align-items:center;gap:7u;font-weight:700;font-size:15u;letter-spacing:.08em;line-height:1}
.bva-nav-r{margin-left:auto;display:flex;gap:8u;align-items:center}
.bva-nav-pill{height:34u;padding:0 11u;display:flex;align-items:center;border-radius:100u;background:${T.surface};border:1px solid ${T.line};color:${T.muted};font-size:13u;font-weight:600}
.bva-nav-pill svg{width:16u;height:16u}

/* chooser: page behind */
.bva-ch{position:absolute;inset:0;overflow:hidden}
.bva-ch-page{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 30%,#1a1630,${T.bg} 62%)}
.bva-hero-coin{position:absolute;left:57u;top:128u;width:300u;height:300u;filter:drop-shadow(0 30u 40u rgba(0,0,0,.6))}
.bva-hero-copy{position:absolute;left:22u;right:22u;top:452u}
.bva-hero-meta{display:flex;gap:14u;font-size:11u;letter-spacing:.14em;text-transform:uppercase;color:${T.muted};font-weight:600}
.bva-hero-meta span+span{border-left:1px solid ${T.line2};padding-left:14u}
.bva-hero-copy h1{margin:12u 0 10u;font-size:38u;line-height:1.04;letter-spacing:-.045em;font-weight:600}
.bva-hero-copy p{margin:0 0 22u;font-size:15u;color:${T.muted};line-height:1.55}
.bva-backdrop{position:absolute;inset:0;background:rgba(4,6,14,.8);opacity:0}
.bva-sheet{position:absolute;left:0;right:0;bottom:0;border-radius:22u 22u 0 0;background:${T.surface};border:1px solid ${T.line2};border-bottom:0;box-shadow:0 28u 100u #0008;overflow:hidden}
.bva-sheet-in{padding:22u 18u 34u;will-change:transform}
.bva-grab{position:absolute;left:50%;top:7u;width:38u;height:4u;margin-left:-19u;border-radius:3u;background:rgba(255,255,255,.18)}
.bva-ch-head{display:flex;align-items:center;justify-content:space-between;gap:20u}
.bva-ch-head p{margin:0 0 7u;font-size:12u;color:${T.muted};line-height:1.4}
.bva-ch-head h2{margin:0;font-size:24u;line-height:1.15;letter-spacing:-.7u;font-weight:600}
.bva-x{flex:none;width:44u;height:44u;border-radius:50%;background:${T.surface2};border:1px solid ${T.line};color:${T.muted};display:grid;place-items:center}
.bva-x svg{width:20u;height:20u}
.bva-intro{color:${T.muted};font-size:13u;margin:14u 0 18u;line-height:1.5}
.bva-grid{display:grid;gap:12u}
.bva-card{position:relative;min-width:0;border:1px solid ${T.line};border-radius:14u;overflow:hidden;background:${T.bg};will-change:transform}
.bva-card-hl{position:absolute;inset:0;border-radius:14u;border:1.5u solid ${T.accent};opacity:0;pointer-events:none;z-index:3}
.bva-art{position:relative;aspect-ratio:1;background:radial-gradient(at 50% 35%,#252642,#10141f);overflow:hidden}
.bva-art img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.bva-art-glow{position:absolute;inset:0;opacity:0;pointer-events:none}
.bva-left{position:absolute;inset:auto 0 0;padding:25u 11u 12u;z-index:2;background:linear-gradient(transparent,rgba(8,10,18,.9))}
.bva-left-l{display:flex;align-items:baseline;justify-content:space-between;gap:4u;margin-bottom:7u;font-size:11u;line-height:1.4}
.bva-left-l strong{font-size:11.5u;font-weight:600}
.bva-left-l span{color:#b1bfd0;font-size:9.5u}
.bva-track{height:4u;border-radius:8u;overflow:hidden;background:rgba(255,255,255,.15)}
.bva-track i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#7c5cff,${T.accent})}
.bva-copy{padding:12u}
.bva-copy h3{margin:0 0 8u;font-size:13.5u;line-height:1.4;font-weight:600;letter-spacing:-.2u}
.bva-copy>span{display:flex;align-items:center;justify-content:space-between;gap:10u;font-size:12u;color:${T.muted}}
.bva-copy b{color:${T.accent};font-size:17u;font-weight:400;line-height:1}

/* checkout */
.bva-co{position:absolute;inset:0;pointer-events:none}
.bva-co-dim{position:absolute;inset:0;background:rgba(2,3,8,.6);opacity:0}
.bva-co-sheet{position:absolute;left:0;right:0;top:58u;bottom:0;border-radius:20u 20u 0 0;overflow:hidden;
  background:radial-gradient(ellipse at 80% -20%,rgba(124,92,255,.07),transparent 55%),${T.bg};border-top:1px solid ${T.line2};box-shadow:0 -20u 60u rgba(0,0,0,.6);will-change:transform}
.bva-co-sheet.full{top:0;border-radius:0;border-top:0}
.bva-co-head{height:52u;padding:0 20u;display:flex;align-items:center;justify-content:space-between;gap:12u;border-bottom:1px solid ${T.line};background:rgba(8,10,18,.94)}
.bva-co-sheet.full .bva-co-head{margin-top:50u}
.bva-secure{display:flex;align-items:center;gap:5u;font-size:11.5u;color:${T.muted}}
.bva-secure svg{width:14u;height:14u}
.bva-help{font-size:13u;color:${T.muted}}
.bva-flow{padding:4u 20u 0}
.bva-back{display:flex;align-items:center;gap:8u;min-height:38u;color:${T.muted};font-size:13u}
.bva-steps{display:flex;gap:26u;margin:4u 0 18u}
.bva-steps>div{display:flex;gap:9u;align-items:center;color:${T.muted};font-size:13u;font-weight:500}
.bva-steps>div>span{width:28u;height:28u;border-radius:50%;border:1px solid ${T.line};display:grid;place-items:center;font-size:12u}
.bva-steps .on{color:${T.text};font-weight:700}
.bva-steps .on>span{background:${T.surface3};border-color:${T.accent};color:${T.accent}}
.bva-sum{border:1px solid ${T.line};background:${T.surface};border-radius:18u;padding:16u}
.bva-piece{display:flex;align-items:center;gap:13u}
.bva-piece-art{width:68u;height:68u;flex:0 0 68u;border-radius:12u;background:${T.surface2};border:1px solid ${T.line};overflow:hidden;position:relative}
.bva-piece-art img{position:absolute;inset:4%;width:92%;height:92%;object-fit:contain}
.bva-piece-name{font-size:17u;font-weight:700;letter-spacing:-.025em;line-height:1.3}
.bva-piece-meta{font-size:12u;color:${T.muted};line-height:1.55;margin-top:3u}
.bva-lines{margin-top:14u;border-top:1px solid ${T.line};padding-top:12u;display:grid;gap:10u;font-size:13.5u}
.bva-line{display:flex;justify-content:space-between;gap:16u;color:${T.muted}}
.bva-line strong{color:${T.text};font-weight:500;text-align:right}
.bva-small{color:${T.muted};font-size:12.5u;line-height:1.6;margin:0}
.bva-title{font-size:30u;letter-spacing:-.045em;line-height:1.15;margin:22u 0 8u;font-weight:700}
.bva-co-intro{color:${T.muted};font-size:14u;line-height:1.6;margin:0 0 16u}
.bva-opt{display:flex;gap:13u;align-items:flex-start;padding:15u 14u;border-radius:14u;border:1px solid rgba(25,211,255,.55);background:linear-gradient(110deg,rgba(25,211,255,.05),rgba(124,92,255,.04)),${T.surface}}
.bva-radio{width:18u;height:18u;flex:none;border-radius:50%;border:5u solid ${T.accent};margin-top:2u}
.bva-opt-b{flex:1;min-width:0}
.bva-opt-h{display:flex;justify-content:space-between;gap:10u;font-size:14u;font-weight:700}
.bva-opt-h span:last-child{color:${T.accent};font-size:13u}
.bva-opt p{margin:4u 0 0;color:${T.muted};font-size:12.5u;line-height:1.5}
.bva-slot{position:relative;height:0}
.bva-action{position:absolute;left:0;right:0;bottom:0;padding:14u 20u 30u;background:rgba(8,10,18,.98);border-top:1px solid ${T.line};box-shadow:0 -8u 24u rgba(0,0,0,.18)}
.bva-action .bva-btn{width:100%;min-height:52u;font-size:15.5u}
.bva-legal{font-size:11.5u;line-height:1.5;color:${T.muted};margin:10u 0 0;text-align:center}
.bva-busy{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:10u;opacity:0}

/* progress (PayStages) */
.bva-prog{padding:16u 0;border-top:1px solid ${T.line};border-bottom:1px solid ${T.line}}
.bva-ptrack{display:flex;gap:5u;margin-bottom:12u}
.bva-ptrack>span{flex:1;height:3u;border-radius:3u;background:${T.line2};overflow:hidden;position:relative}
.bva-ptrack>span>i{position:absolute;left:0;top:0;bottom:0;width:100%;background:${T.accent};transform-origin:0 50%;transform:scaleX(0)}
.bva-plabels{display:flex;gap:5u;margin:-4u 0 12u}
.bva-plabels>span{flex:1;font-size:9.5u;letter-spacing:.08em;text-transform:uppercase;color:${T.faint};font-weight:600}
.bva-plabels>span.on{color:${T.text}}
.bva-prog-l{display:flex;align-items:center;gap:8u;font-size:14.5u;font-weight:700;min-height:22u}
.bva-prog-l .ok{width:18u;height:18u;border-radius:50%;background:${T.accent};color:#06121a;display:grid;place-items:center;flex:none}
.bva-prog-l .ok svg{width:11u;height:11u}
.bva-prog p{font-size:13u;color:${T.muted};margin:4u 0 0;line-height:1.55}

/* record */
.bva-rec-chip{display:inline-flex;align-items:center;gap:10u;height:40u;padding:0 16u 0 8u;border-radius:100u;white-space:nowrap;
  background:linear-gradient(180deg,rgba(24,28,40,.92),rgba(17,20,29,.92));border:1px solid ${T.line2};box-shadow:0 14u 40u -12u rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.05);font-size:13.5u;font-weight:600}
.bva-rec-chip .dot{width:26u;height:26u;border-radius:50%;display:grid;place-items:center;background:${T.goldSoft};color:${T.gold};border:1px solid rgba(230,180,90,.3)}
.bva-rec-chip .dot svg{width:13u;height:13u}
.bva-rec-chip .sep{width:1px;height:16u;background:${T.line2}}
.bva-rec-chip .ed{color:${T.text}}
.bva-rec-chip .base{color:${T.accent};display:flex;align-items:center;gap:6u}
.bva-rec-chip .base svg{width:13u;height:13u}
.bva-card-box{background:${T.surface};border:1px solid ${T.line};border-radius:20u;padding:20u;width:380u}
.bva-rec-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10u;gap:10u}
.bva-pill{display:inline-flex;align-items:center;gap:6u;height:26u;padding:0 10u;border-radius:100u;border:1px solid rgba(25,211,255,.35);background:rgba(25,211,255,.07);color:${T.accent};font-size:11.5u;font-weight:700;letter-spacing:.02em;white-space:nowrap}
.bva-pill svg{width:12u;height:12u}
.bva-row{display:flex;align-items:baseline;justify-content:space-between;gap:14u;padding:9u 0;border-bottom:1px solid ${T.line};font-size:13.5u}
.bva-row dt{color:${T.faint};font-size:12u;font-weight:600;letter-spacing:.07em;text-transform:uppercase}
.bva-row dd{margin:0;text-align:right}
.bva-row a{color:${T.accent}}
.bva-ev{display:flex;align-items:center;gap:10u;padding:12u 0 0;font-size:12.5u}
.bva-ev .chipx{font-size:11.5u;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${T.text};display:flex;align-items:center;gap:6u}
.bva-ev .chipx svg{width:13u;height:13u;color:${T.up}}
.bva-ev .hash{color:${T.muted};font-size:12u}
.bva-ev .ago{margin-left:auto;color:${T.faint};font-size:12u}

/* result (vault-reveal.module.css) */
.bva-res{width:560u;color:#f2f1fc}
.bva-res.center{text-align:center}
.bva-res .eb{font-size:11u;text-transform:uppercase;letter-spacing:.23em;color:#afa2cd;line-height:1.8}
.bva-res .mt{display:block;font-size:11u;color:#aba6bf;text-transform:uppercase;letter-spacing:.16em;margin-top:14u}
.bva-res h1{font-size:56u;line-height:1.08;letter-spacing:-.045em;font-weight:500;margin:10u 0 12u}
.bva-res p{color:#9496ac;font-size:14u;line-height:1.8;max-width:440u;margin:0}
.bva-res.center p{margin:0 auto}
.bva-res .acts{display:flex;gap:12u;margin-top:22u}
.bva-res.center .acts{justify-content:center}
.bva-res .acts .bva-btn{min-height:48u;padding:0 22u;gap:35u;border-radius:8u;font-size:13u;font-weight:600}
.bva-res .acts .ghostr{background:rgba(255,255,255,.024);border:1px solid rgba(255,255,255,.15);color:#d0ccdf}

/* owner strip */
.bva-own{width:390u;display:grid;gap:12u;padding:20u;border-radius:26u;border:1px solid rgba(25,211,255,.3);
  background:linear-gradient(180deg,rgba(230,180,90,.055),transparent 62%),linear-gradient(180deg,${T.surface2},${T.surface});box-shadow:0 24u 48u -30u #000}
.bva-own .k{font-family:${MONO};font-size:11.5u;letter-spacing:.32em;text-transform:uppercase;color:${T.gold}}
.bva-own .hold{display:flex;align-items:center;gap:8u;flex-wrap:wrap;font-size:13.5u;color:${T.muted}}
.bva-own .hc{border:1px solid rgba(25,211,255,.55);background:${T.goldSoft};color:${T.gold};border-radius:999u;padding:3u 12u;font-size:12.5u;font-weight:700}
.bva-own .st{font-size:12.5u;color:${T.faint}}
.bva-own .acts{display:flex;gap:8u;flex-wrap:wrap}

/* status chip */
.bva-chip{display:inline-flex;align-items:center;gap:10u;height:44u;padding:0 18u 0 10u;border-radius:100u;white-space:nowrap;
  background:linear-gradient(180deg,rgba(24,28,40,.9),rgba(14,17,26,.9));border:1px solid ${T.line2};box-shadow:0 16u 44u -14u rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.06);
  font-size:15u;font-weight:600;letter-spacing:-.005em;color:${T.text}}
.bva-chip.noicon{padding-left:18u}
.bva-chip .ic{width:28u;height:28u;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.05);border:1px solid ${T.line2};color:${T.muted}}
.bva-chip .ic svg{width:15u;height:15u}
.bva-chip .sub{color:${T.muted};font-weight:500;font-size:13.5u}
.bva-chip .sub::before{content:'';display:inline-block;width:1px;height:14u;background:${T.line2};margin:0 10u -2u 0}
.bva-chip.accent .ic{color:${T.accent};border-color:rgba(25,211,255,.35);background:rgba(25,211,255,.08)}
.bva-chip.gold{border-color:rgba(230,180,90,.45)}
.bva-chip.gold .ic{color:${T.gold};border-color:rgba(230,180,90,.35);background:${T.goldSoft}}
.bva-chip.violet .ic{color:${T.violetLt};border-color:rgba(178,154,255,.35);background:rgba(133,92,255,.12)}
.bva-chip.ok .ic{color:${T.up};border-color:rgba(70,230,166,.3);background:rgba(70,230,166,.1)}

/* touch */
.bva-touch{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:60}
.bva-touch i{position:absolute;left:0;top:0;border-radius:50%}
.bva-touch .ring{width:56u;height:56u;margin:-28u 0 0 -28u;border:2.5u solid rgba(255,255,255,.92);box-shadow:0 0 18u rgba(255,255,255,.35),inset 0 0 12u rgba(255,255,255,.2)}
.bva-touch .core{width:40u;height:40u;margin:-20u 0 0 -20u;background:radial-gradient(circle,rgba(255,255,255,.75),rgba(255,255,255,.25) 60%,transparent 72%)}
.bva-touch .rip{width:56u;height:56u;margin:-28u 0 0 -28u;border:2u solid rgba(255,255,255,.7)}
`;

  function injectStyle() {
    if (document.getElementById('bva-style')) return;
    const st = document.createElement('style');
    st.id = 'bva-style';
    st.textContent = CSS.replace(/(-?\d*\.?\d+)u\b/g, 'calc($1 * var(--u, 1px))');
    (document.head || document.documentElement).appendChild(st);
  }

  /* ── helpers ────────────────────────────────────────────────────────────── */
  function h(tag, cls, html, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function setScale(e, scale) { if (scale) e.style.setProperty('--u', scale + 'px'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function cfg() { return window.BV_CONFIG || {}; }
  function coin(id) {
    const list = (cfg().collection && cfg().collection.coins) || [];
    return list.find(c => c.id === id) || { id, name: id, file: '', enamel: '#855CFF' };
  }
  function edition() { return (cfg().collection && cfg().collection.edition) || 50; }
  function tf(e, o) {
    const x = o.x || 0, y = o.y || 0, s = o.s == null ? 1 : o.s;
    let t = `translate3d(${x}px,${y}px,0)`;
    if (o.rx) t += ` rotateX(${o.rx}deg)`;
    if (o.ry) t += ` rotateY(${o.ry}deg)`;
    if (o.r) t += ` rotate(${o.r}deg)`;
    if (s !== 1) t += ` scale(${s})`;
    e.style.transform = t;
    if (o.o != null) e.style.opacity = clamp(o.o);
  }
  function pos(e, anc) {
    let x = 0, y = 0, n = e;
    while (n && n !== anc) { x += n.offsetLeft; y += n.offsetTop; const p = n.offsetParent; if (!p) break; n = p; }
    const w = e.offsetWidth, hh = e.offsetHeight;
    return { x, y, w, h: hh, cx: x + w / 2, cy: y + hh / 2 };
  }
  function img(src, parent, cls) {
    const i = h('img', cls || '', null, parent);
    i.alt = ''; i.decoding = 'sync'; i.draggable = false;
    if (src) i.src = src;
    if (src && window.BV && window.BV.preload) window.BV.preload(i);
    return i;
  }
  // press-in curve: 0 -> squeeze at 0.35 -> release by 1
  const pressCurve = p => (p <= 0 || p >= 1) ? 0 : (p < 0.35 ? oCubic(p / 0.35) : 1 - ioSine((p - 0.35) / 0.65));

  /* ── mark ───────────────────────────────────────────────────────────────── */
  function markSVG(size, gid) {
    gid = gid || ('bvam' + (++uid));
    return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" style="overflow:visible"><defs><linearGradient id="${gid}" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#67DCEA"/><stop offset="50%" stop-color="#7793FF"/><stop offset="100%" stop-color="#855CFF"/></linearGradient></defs><circle cx="16" cy="16" r="12.5" fill="none" stroke="#E6B45A" stroke-width="2.4"/><path d="M3 24 Q16 2 29 12" fill="none" stroke="url(#${gid})" stroke-width="3" stroke-linecap="round"/></svg>`;
  }
  function mark(parent, size = 26, o = {}) {
    injectStyle();
    const w = document.createElement('div');
    w.innerHTML = markSVG(size, o.gradientId);
    const s = w.firstChild;
    if (parent) parent.appendChild(s);
    return s;
  }
  // mark sized in design units (inside .bva trees)
  const markU = (u) => markSVG(1, 'bvam' + (++uid)).replace('width="1" height="1"', `style="width:calc(${u} * var(--u,1px));height:calc(${u} * var(--u,1px));overflow:visible"`);

  /* ── button ─────────────────────────────────────────────────────────────── */
  function button(parent, label, o = {}) {
    injectStyle();
    const v = o.variant || 'neutral';
    const b = h('div', 'bva bva-btn ' + (v === 'neutral' ? '' : v) + (o.small ? ' sm' : ''), null, parent);
    setScale(b, o.scale);
    if (o.block) b.style.width = '100%';
    const lab = h('span', '', esc(label), b);
    if (o.icon && icons[o.icon]) b.insertAdjacentHTML('beforeend', icons[o.icon]);
    const sheen = h('i', 'bva-btn-sheen', null, b);
    return {
      el: b, label: lab,
      press(p) {
        const c = pressCurve(p);
        b.style.transform = c ? `scale(${1 - 0.045 * c})` : '';
        b.style.filter = c ? `brightness(${1 - 0.12 * c})` : '';
        const sp = range(p, 0.3, 1);
        sheen.style.opacity = sp > 0 && sp < 1 ? Math.sin(sp * Math.PI) * 0.9 : 0;
        sheen.style.transform = `translateX(${-60 + sp * 330}%) skewX(-12deg)`;
      }
    };
  }

  /* ── phone ──────────────────────────────────────────────────────────────── */
  function statusIcons() {
    return `<svg viewBox="0 0 18 12" style="width:calc(18 * var(--u));height:calc(12 * var(--u))"><rect x="0" y="8" width="3" height="4" rx="1" fill="#fff"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="#fff"/><rect x="10" y="3" width="3" height="9" rx="1" fill="#fff"/><rect x="15" y="0" width="3" height="12" rx="1" fill="#fff"/></svg>` +
      `<svg viewBox="0 0 17 12" style="width:calc(17 * var(--u));height:calc(12 * var(--u))"><path d="M8.5 2.2c2.5 0 4.8 1 6.5 2.6l1.2-1.3A11 11 0 0 0 8.5.4 11 11 0 0 0 .8 3.5L2 4.8a9.2 9.2 0 0 1 6.5-2.6zm0 3.6c1.5 0 2.9.6 3.9 1.6l1.3-1.3a7.3 7.3 0 0 0-10.4 0l1.3 1.3c1-1 2.4-1.6 3.9-1.6zm0 3.6c.6 0 1.1.2 1.5.6L8.5 11.6 7 10c.4-.4.9-.6 1.5-.6z" fill="#fff"/></svg>` +
      `<svg viewBox="0 0 28 13" style="width:calc(27 * var(--u));height:calc(13 * var(--u))"><rect x=".5" y=".5" width="24" height="12" rx="3.6" fill="none" stroke="rgba(255,255,255,.4)"/><rect x="2.2" y="2.2" width="18.6" height="8.6" rx="2.2" fill="#fff"/><path d="M26 4.4v4.2c.8-.3 1.4-1.2 1.4-2.1S26.8 4.7 26 4.4z" fill="rgba(255,255,255,.45)"/></svg>`;
  }
  function phone(parent, ctx = {}, o = {}) {
    injectStyle();
    let rect = o.rect;
    if (!rect && window.BVShared && window.BVShared.layout) rect = window.BVShared.layout(ctx).phone;
    if (!rect) rect = { x: (ctx.W || 1920) / 2 - 217, y: ((ctx.H || 1080) - 940) / 2, w: 434, h: 940 };
    const k = rect.h / DEV.h;
    const el = h('div', 'bva bva-phone', null, parent);
    el.style.setProperty('--u', k + 'px');
    el.style.left = rect.x + (rect.w - DEV.w * k) / 2 + 'px';
    el.style.top = rect.y + 'px';
    const glow = h('div', 'bva-phone-glow', null, el);
    h('div', 'bva-phone-shadow', null, el);
    const frame = h('div', 'bva-frame', null, el);
    [[-2.5, 150, 34], [-2.5, 208, 62], [-2.5, 282, 62], [432.5, 230, 96]].forEach(([x, y, hh]) => {
      const b = h('i', 'bva-btnside', null, el);
      b.style.left = `calc(${x} * var(--u))`; b.style.top = `calc(${y} * var(--u))`; b.style.height = `calc(${hh} * var(--u))`;
    });
    const screen = h('div', 'bva-screen', null, el);
    const status = h('div', 'bva-status', `<div class="bva-time">${esc(o.time || '9:41')}</div><div class="bva-sicons">${statusIcons()}</div>`, screen);
    const island = h('div', 'bva-island', null, screen);
    const home = h('div', 'bva-home', null, screen);
    h('div', 'bva-glass', null, screen);
    // keep the chrome layers on top of anything a scene appends later
    const chrome = [status, island, home];
    const api = {
      el, screen, content: screen, k, rect, frame, status,
      set(s = {}) {
        tf(el, s);
        glow.style.opacity = s.glow == null ? 0 : clamp(s.glow);
        if (s.rx || s.ry) el.style.transform = 'perspective(' + (2600 * k) + 'px) ' + el.style.transform;
      },
      // design px inside the screen -> stage px relative to phone's parent (no transform)
      toStage(x, y) { return { x: el.offsetLeft + (DEV.bezel + x) * k, y: el.offsetTop + (DEV.bezel + y) * k }; },
      u(px) { return px * k; }
    };
    api.raise = () => chrome.forEach(c => screen.appendChild(c));
    return api;
  }

  /* ── app nav bar (mobile marketplace header) ────────────────────────────── */
  function nav(parent) {
    return h('div', 'bva-nav', `<div class="bva-brand">${markU(24)}<span>BIFROST</span></div>
      <div class="bva-nav-r"><div class="bva-nav-pill">${icons.search}</div><div class="bva-nav-pill" style="color:${T.gold};font-weight:700">USDC</div></div>`, parent);
  }

  /* ── chooser: "Eye of the Unknown / Choose your coin" ───────────────────── */
  const DEFAULT_LEFT = { silence: 14, ametherion: 22, cycle: 27, dominion: 9, veritas: 19 };
  function chooser(parent, o = {}) {
    injectStyle();
    const C = cfg().collection || {};
    const ids = o.coins || (C.coins || []).map(c => c.id);
    const N = o.edition || edition();
    const left = Object.assign({}, DEFAULT_LEFT, o.leftCounts || {});
    const cols = o.cols || 2;
    const el = h('div', 'bva bva-ch', null, parent);
    setScale(el, o.scale);
    // the page behind (home hero of the collection world)
    if (o.page !== false) {
      const page = h('div', 'bva-ch-page', null, el);
      nav(page);
      const hc = h('div', 'bva-hero-coin', null, page);
      img(coin(ids[0]).file, hc).style.cssText = 'width:100%;height:100%;object-fit:contain';
      h('div', 'bva-hero-copy', `<div class="bva-hero-meta"><span>Silver</span><span>Bifrost</span></div>
        <h1>${esc(o.collection || C.name || 'Eye of the Unknown')}</h1>
        <p>Physical collector coins. Yours to collect, trade or bring home.</p>`, page)
        .appendChild(button(null, 'Mint now', { variant: 'gold' }).el);
    }
    const back = h('div', 'bva-backdrop', null, el);
    const sheet = h('div', 'bva-sheet', null, el);
    h('i', 'bva-grab', null, sheet);
    const inner = h('div', 'bva-sheet-in', null, sheet);
    h('div', 'bva-ch-head', `<div><p>${esc(o.collection || C.name || 'Eye of the Unknown')}</p><h2>Choose your coin</h2></div><div class="bva-x">${icons.close}</div>`, inner);
    h('p', 'bva-intro', 'Explore each design in 3D before you mint.', inner);
    const grid = h('div', 'bva-grid', null, inner);
    grid.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`;
    const cards = {};
    ids.forEach(id => {
      const c = coin(id);
      const n = left[id] == null ? 20 : left[id];
      const card = h('div', 'bva-card', null, grid);
      const art = h('div', 'bva-art', null, card);
      const glow = h('i', 'bva-art-glow', null, art);
      glow.style.background = `radial-gradient(circle at 50% 45%, ${c.enamel}55, transparent 62%)`;
      const im = img(c.file, art);
      h('div', 'bva-left', `<div class="bva-left-l"><strong>${n > 0 ? n + ' left' : 'Fully minted'}</strong><span>${N} editions</span></div><div class="bva-track"><i style="width:${clamp(n / N) * 100}%"></i></div>`, art);
      h('div', 'bva-copy', `<h3>${esc(c.name)}</h3><span>${n > 0 ? 'Mint' : 'Fully minted'}<b aria-hidden="true">↗</b></span>`, card);
      const hl = h('i', 'bva-card-hl', null, card);
      cards[id] = { card, hl, glow, im, h: 0, p: 0 };
    });
    // max height = 90% of the 920 screen (the real mobile dialog: max-height 90dvh)
    sheet.style.maxHeight = `calc(${0.9 * DEV.sh} * var(--u, 1px))`;
    let openP = 1, scrollPx = 0;
    function applyCard(id) {
      const c = cards[id]; if (!c) return;
      const lift = oCubic(c.h), pr = pressCurve(c.p);
      c.card.style.transform = (lift || pr) ? `translateY(calc(${-6 * lift} * var(--u,1px))) scale(${1 + 0.035 * lift - 0.05 * pr})` : '';
      c.card.style.borderColor = lift ? `rgba(25,211,255,${0.25 + 0.6 * lift})` : '';
      c.card.style.boxShadow = lift ? `0 calc(${18 * lift} * var(--u,1px)) calc(${40 * lift} * var(--u,1px)) -10px rgba(0,0,0,.7), 0 0 calc(${30 * lift} * var(--u,1px)) rgba(25,211,255,${0.22 * lift})` : '';
      c.card.style.zIndex = lift ? 2 : '';
      c.hl.style.opacity = lift;
      c.glow.style.opacity = lift;
      c.im.style.transform = lift ? `scale(${1 + 0.05 * lift})` : '';
    }
    function applySheet() {
      const e = oQuint(openP);
      sheet.style.transform = e < 1 ? `translateY(${(1 - e) * 104}%)` : '';
      back.style.opacity = e;
      inner.style.transform = scrollPx ? `translateY(calc(${-scrollPx} * var(--u,1px)))` : '';
    }
    applySheet();
    return {
      el, sheet, cards,
      open(p) { openP = clamp(p); applySheet(); },
      scroll(px) { scrollPx = px || 0; applySheet(); },
      // design px the sheet body can scroll before its last row sits at the sheet bottom
      maxScroll() { return Math.max(0, (inner.offsetHeight - sheet.clientHeight) / ((parseFloat(getComputedStyle(el).getPropertyValue('--u')) || 1))); },
      highlight(id, p) { if (cards[id]) { cards[id].h = clamp(p); applyCard(id); } },
      press(id, p) { if (cards[id]) { cards[id].p = clamp(p); applyCard(id); } },
      center(id, anc) {
        const c = cards[id]; if (!c) return { x: 0, y: 0 };
        const b = pos(c.card, anc || el.parentNode);
        const k = parseFloat(getComputedStyle(el).getPropertyValue('--u')) || 1;
        return { x: b.cx, y: b.y + b.w * 0.5 - scrollPx * k, w: b.w, h: b.h };
      }
    };
  }

  /* ── checkout: "Make it yours." ─────────────────────────────────────────── */
  const STAGES = [
    ['Prepare', 'Starting your order and checking your balance — nothing is charged yet.'],
    ['Confirm', 'Approve the purchase and payment in your connected wallet.'],
    ['Payment', 'Completing your payment. Bifrost covers the network fee.'],
    ['Check', 'Checking your payment confirmation.'],
    ['Complete', 'Getting your coin ready to open.']
  ];
  function checkout(parent, o = {}) {
    injectStyle();
    const c = coin(o.coinId || 'veritas');
    const N = o.edition || edition();
    const left = o.left == null ? (DEFAULT_LEFT[c.id] || 19) : o.left;
    const el = h('div', 'bva bva-co', null, parent);
    setScale(el, o.scale);
    const dim = h('div', 'bva-co-dim', null, el);
    const sh = h('div', 'bva-co-sheet' + (o.sheet === false ? ' full' : ''), null, el);
    if (o.sheet !== false) h('i', 'bva-grab', null, sh).style.zIndex = 3;
    h('div', 'bva-co-head', `<div class="bva-brand" style="font-size:calc(13*var(--u));font-weight:700">${markU(22)}<span>BIFROST</span></div>
      <span class="bva-secure">${icons.lock}Secure checkout</span><span class="bva-help">Help ↗</span>`, sh);
    const flow = h('div', 'bva-flow', null, sh);
    h('div', 'bva-back', '← Back to coin', flow);
    h('div', 'bva-steps', `<div class="on"><span>01</span>Review</div><div><span>02</span>Payment</div>`, flow);
    const sum = h('div', 'bva-sum', null, flow);
    const piece = h('div', 'bva-piece', null, sum);
    img(c.file, h('div', 'bva-piece-art', null, piece));
    h('div', '', `<div class="bva-piece-name">${esc(c.name)}</div><div class="bva-piece-meta">2026 · Silver</div><div class="bva-piece-meta">${esc(o.editionLine || ('Edition of ' + N))}</div>`, piece);
    h('div', 'bva-lines', `<div class="bva-line"><span>Base certificate</span><strong>Included</strong></div>
      <div class="bva-line"><span>Network fee</span><strong>Covered by Bifrost</strong></div>
      <p class="bva-small">${left} of ${N} editions remain.</p>`, sum);
    h('h1', 'bva-title', 'Make it yours.', flow);
    h('p', 'bva-co-intro', 'Collect this exact coin design. Your certificate is minted on Base.', flow);
    const optWrap = h('div', '', null, flow);
    h('div', 'bva-opt', `<span class="bva-radio"></span><span class="bva-opt-b"><span class="bva-opt-h"><span>Keep it vaulted</span><span>Free</span></span><p>One physical coin. An ownership certificate in your wallet.</p></span>`, optWrap);
    const slot = h('div', '', null, flow);
    slot.style.cssText = 'position:relative;margin-top:calc(14*var(--u))';
    const prog = progress(slot, { labels: o.labels !== false });
    prog.el.style.opacity = 0;
    const action = h('div', 'bva-action', null, sh);
    const btn = button(action, o.button || 'Mint', { variant: 'gold' });
    btn.label.style.display = 'inline-flex';
    btn.label.style.alignItems = 'center';
    btn.label.style.gap = 'calc(10 * var(--u))';
    btn.label.insertAdjacentHTML('beforeend', `<span aria-hidden="true">→</span>`);
    const busy = h('div', 'bva-busy', `<span class="bva-spin"></span><span>Confirming your purchase…</span>`, btn.el);
    const spin = busy.firstChild;
    const okl = h('div', 'bva-busy', `<span style="width:calc(20*var(--u));height:calc(20*var(--u));border-radius:50%;background:${T.onGold};color:${T.gold};display:grid;place-items:center">${icons.check.replace('<svg ', '<svg style="width:calc(12*var(--u));height:calc(12*var(--u))" ')}</span><span>Payment confirmed</span>`, btn.el);
    h('p', 'bva-legal', 'You haven’t been charged.', action);
    let openP = 1;
    function applyOpen() {
      const e = oQuint(openP);
      sh.style.transform = e < 1 ? `translateY(${(1 - e) * 104}%)` : '';
      dim.style.opacity = e;
    }
    applyOpen();
    return {
      el, sheet: sh, button: btn, progress: prog,
      open(p) { openP = clamp(p); applyOpen(); },
      press(p) { btn.press(p); },
      stage(v) {
        if (v == null || v < 0) {
          prog.el.style.opacity = 0; optWrap.style.opacity = ''; optWrap.style.transform = '';
          btn.label.style.opacity = ''; busy.style.opacity = 0; okl.style.opacity = 0; btn.el.style.opacity = '';
          return;
        }
        const a = oCubic(range(v, 0, 0.35));
        prog.el.style.opacity = a;
        prog.el.style.transform = `translateY(calc(${(1 - a) * 10} * var(--u,1px)))`;
        prog.set(v);
        const done = range(v, 4.95, 5.3);
        btn.label.style.opacity = 1 - a;
        busy.style.opacity = a * (1 - done);
        okl.style.opacity = done;
        spin.style.transform = `rotate(${v * 400}deg)`;
        btn.el.style.opacity = 1 - 0.38 * a * (1 - done);
      },
      center(anc) { return pos(btn.el, anc || el.parentNode); }
    };
  }

  /* ── progress rail (PayStages) ──────────────────────────────────────────── */
  function progress(parent, o = {}) {
    injectStyle();
    const el = h('div', 'bva bva-prog', null, parent);
    setScale(el, o.scale);
    if (o.width) el.style.width = `calc(${o.width} * var(--u,1px))`;
    const track = h('div', 'bva-ptrack', null, el);
    const fills = STAGES.map(() => h('i', '', null, h('span', '', null, track)));
    const labs = o.labels === false ? [] : STAGES.map(s => s[0]);
    const lrow = labs.length ? h('div', 'bva-plabels', labs.map(l => `<span>${l}</span>`).join(''), el) : null;
    const label = h('div', 'bva-prog-l', '', el);
    const sub = h('p', '', '', el);
    let last = null;
    function set(stage) {
      const v = clamp(+stage || 0, 0, 5);
      fills.forEach((f, i) => { f.style.transform = `scaleX(${clamp(v + 1 - i) >= 1 ? 1 : oCubic(clamp(v + 1 - i))})`; });
      const done = v >= 5;
      const idx = Math.min(4, Math.floor(v));
      const key = done ? 'done' : idx;
      if (key !== last) {
        last = key;
        label.innerHTML = done ? `<span class="ok">${icons.check}</span>Payment confirmed` : STAGES[idx][0];
        sub.textContent = done ? 'Opening your coin…' : STAGES[idx][1];
        if (lrow) Array.from(lrow.children).forEach((s, i) => s.classList.toggle('on', done || i <= idx));
      }
    }
    set(0);
    return { el, set };
  }

  /* ── on-chain record ────────────────────────────────────────────────────── */
  function record(parent, o = {}) {
    injectStyle();
    const c = coin(o.coinId || 'veritas');
    const ed = o.edition == null ? 7 : o.edition;
    const N = o.mintage || edition();
    const edTxt = `№ ${pad(ed, 2)} of ${N}`;
    let el, parts;
    if ((o.variant || 'chip') === 'chip') {
      el = h('div', 'bva bva-rec-chip', `<span class="dot">${icons.check}</span><span>Certificate minted</span><i class="sep"></i><span class="ed">${edTxt}</span><i class="sep"></i><span class="base">${icons.base}On-chain on Base ↗</span>`, parent);
      parts = Array.from(el.children);
    } else {
      const cert = o.cert || `cert_eye_${c.id}_${pad(ed, 3)}`;
      el = h('div', 'bva bva-card-box', `<div class="bva-rec-head"><span class="bva-kicker">On-chain record</span><span class="bva-pill">${icons.base}On-chain on Base ↗</span></div>
        <dl style="margin:0"><div class="bva-row"><dt>Certificate</dt><dd class="bva-mono">${esc(cert)}</dd></div>
        <div class="bva-row"><dt>Edition</dt><dd>${esc(c.name)} · ${edTxt}</dd></div>
        <div class="bva-row" style="border-bottom:0"><dt>Contract</dt><dd class="bva-mono"><a>${CONTRACT} ↗</a></dd></div></dl>
        <div class="bva-ev" style="border-top:1px solid ${T.line}"><span class="chipx">${icons.check}Certificate minted</span><span class="bva-mono hash">${esc(o.tx || '0x7d1e…b42c')} ↗</span><span class="ago">just now</span></div>`, parent);
      parts = [el.children[0], ...el.querySelectorAll('.bva-row'), el.querySelector('.bva-ev')];
    }
    setScale(el, o.scale);
    function show(p) {
      p = clamp(p);
      const a = oQuint(range(p, 0, 0.6));
      el.style.opacity = a;
      el.style.transform = `translateY(calc(${(1 - a) * 14} * var(--u,1px))) scale(${0.96 + 0.04 * a})`;
      parts.forEach((e, i) => {
        const q = oCubic(range(p, 0.12 + i * 0.09, 0.5 + i * 0.09));
        e.style.opacity = q;
      });
    }
    show(1);
    return { el, show };
  }

  /* ── reveal result (PackOpening) ────────────────────────────────────────── */
  function result(parent, o = {}) {
    injectStyle();
    const c = coin(o.coinId || 'dominion');
    const ed = o.edition == null ? 7 : o.edition;
    const N = o.mintage || edition();
    const metal = o.metal || 'Silver';
    const line = o.format === 'short' ? `${metal} · № ${pad(ed, 2)} of ${N}` : `${metal} / № ${pad(ed, 3)} of ${N}`;
    const el = h('div', 'bva bva-res ' + (o.align === 'left' ? 'left' : 'center'), null, parent);
    setScale(el, o.scale);
    if (o.width) el.style.width = `calc(${o.width} * var(--u,1px))`;
    let eb;
    if (o.detachEyebrow) { eb = h('div', 'bva bva-res center', null, parent); setScale(eb, o.scale); eb.style.width = 'auto'; eb = h('div', 'eb', esc(o.eyebrow || 'Revealed from the vault'), eb); }
    else eb = h('div', 'eb', esc(o.eyebrow || 'Revealed from the vault'), el);
    const parts = [
      eb,
      h('span', 'mt', esc(line), el),
      h('h1', '', esc(o.name || c.name), el),
      h('p', '', 'Your exact coin. Keep it vaulted, list it, or bring it home.', el)
    ];
    if (o.actions !== false) {
      const acts = h('div', 'acts', null, el);
      button(acts, 'View your certificate ↗', { variant: 'lavender' });
      const g = button(acts, 'Continue', { variant: 'neutral' });
      g.el.classList.add('ghostr'); g.label.insertAdjacentHTML('beforeend', ' →');
      parts.push(acts);
    }
    function show(p) {
      p = clamp(p);
      parts.forEach((e, i) => {
        const q = oCubic(range(p, i * 0.12, i * 0.12 + 0.5));
        e.style.opacity = q;
        e.style.transform = q < 1 ? `translateY(calc(${(1 - q) * 16} * var(--u,1px)))` : '';
      });
    }
    show(1);
    return { el, show, parts, eyebrow: o.detachEyebrow ? eb.parentNode : eb };
  }

  /* ── owner strip ────────────────────────────────────────────────────────── */
  function owner(parent, o = {}) {
    injectStyle();
    const ed = pad(o.edition == null ? 7 : o.edition, 2);
    const el = h('div', 'bva bva-own', null, parent);
    setScale(el, o.scale);
    h('div', 'k', esc(o.title || 'This is your coin'), el);
    const hold = h('div', 'hold', `<span>You hold</span><span class="hc">edition #${ed}</span>`, el);
    const st = h('span', 'st', '', hold);
    const acts = h('div', 'acts', null, el);
    const list = o.actions || [{ label: `List #${ed} for sale` }, { label: 'Gift' }, { label: 'Ship home' }];
    const btns = list.map(a => button(acts, a.label, { variant: a.variant || 'ghost', small: true }));
    let cur = null;
    function status(text) { if (text !== cur) { cur = text; st.textContent = '· ' + text; } }
    status(o.status || 'Vaulted · not listed');
    const parts = [el.children[0], hold, acts];
    return {
      el, buttons: btns, status,
      press(i, p) { if (btns[i]) btns[i].press(p); },
      show(p) {
        p = clamp(p);
        const a = oQuint(range(p, 0, 0.55));
        el.style.opacity = a;
        el.style.transform = `translateY(calc(${(1 - a) * 18} * var(--u,1px)))`;
        parts.forEach((e, i) => { e.style.opacity = oCubic(range(p, 0.15 + i * 0.12, 0.55 + i * 0.12)); });
      }
    };
  }

  /* ── status chip ────────────────────────────────────────────────────────── */
  function chip(parent, label, o = {}) {
    injectStyle();
    const tone = o.tone || 'mut';
    const ic = o.icon && icons[o.icon] ? `<span class="ic">${icons[o.icon]}</span>` : '';
    const el = h('div', `bva bva-chip ${tone}${ic ? '' : ' noicon'}`, `${ic}<span class="lb">${esc(label)}</span>${o.sub ? `<span class="sub">${esc(o.sub)}</span>` : ''}`, parent);
    setScale(el, o.scale);
    function show(p) {
      p = clamp(p);
      const a = oQuint(range(p, 0, 0.7));
      el.style.opacity = oCubic(range(p, 0, 0.4));
      el.style.transform = `translateY(calc(${(1 - a) * 18} * var(--u,1px))) scale(${0.92 + 0.08 * a})`;
    }
    show(1);
    return { el, show };
  }

  /* ── touch ring ─────────────────────────────────────────────────────────── */
  function touch(parent, o = {}) {
    injectStyle();
    const el = h('div', 'bva bva-touch', null, parent);
    setScale(el, o.scale);
    const rip = h('i', 'rip', null, el), core = h('i', 'core', null, el), ring = h('i', 'ring', null, el);
    function set(x, y, p) {
      if (p == null || p <= 0 || p >= 1) { el.style.opacity = 0; return; }
      el.style.opacity = 1;
      el.style.transform = `translate3d(${x}px,${y}px,0)`;
      const ap = oCubic(range(p, 0, 0.3));
      const pr = ioSine(range(p, 0.3, 0.5));
      const rp = range(p, 0.5, 1);
      const fade = 1 - oCubic(range(p, 0.6, 1));
      ring.style.opacity = ap * fade;
      ring.style.transform = `scale(${(1.45 - 0.45 * ap) * (1 - 0.18 * pr) * (1 + 0.1 * rp)})`;
      core.style.opacity = pr * (1 - rp);
      core.style.transform = `scale(${0.7 + 0.3 * pr})`;
      rip.style.opacity = rp > 0 ? (1 - rp) * 0.9 : 0;
      rip.style.transform = `scale(${1 + 2.2 * oCubic(rp)})`;
    }
    set(0, 0, 0);
    return { el, set };
  }

  injectStyle();
  window.BVApp = {
    T, DEV, icons, coin, pos, STAGES,
    phone, mark, markSVG, nav, button, chooser, checkout, progress, record, result, owner, chip, touch
  };
})();
