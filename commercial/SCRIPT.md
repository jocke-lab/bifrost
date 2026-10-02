# Bifrost Vault: 30-second commercial ("Eye of the Unknown")

A 30 s commercial for bifrostvault.io, built only from the real product: the real Eye of the Unknown coins,
the real sealed case and its in-app opening, the real app UI and copy, and the Bifrost Vault brand
(Geist, Aurora Noir, gold-ring bridge mark).

## Deliverables

| File | What |
|---|---|
| `dist/bifrost-vault-commercial-16x9.mp4` | 1920x1080, 30 fps, 30.0 s, H.264 + AAC 48 kHz, −14.5 LUFS, about 14 MB |
| `dist/bifrost-vault-commercial-9x16.mp4` | 1080x1920 cut for Reels, TikTok and Stories. Supers stay inside the 220/320 px top/bottom safe zones |
| `dist/poster-16x9.jpg`, `dist/poster-9x16.jpg` | End-card posters |
| `index.html` (served at `/commercial`) | The live version, with play/pause, sound, scrubber with chapters, a 16:9 / 9:16 toggle and fullscreen. "Open a case" launches a playable free preview of the real opening (`play.js`) |

## The cut

| Time | Beat | Supers (verbatim) |
|---|---|---|
| 0.0–2.5 | Macro of Silence's real iris, then a whip back to the full coin | CAUGHT YOUR EYE. |
| 2.5–5.0 | Hard cuts on the half-beats: Silence, Ametherion, Cycle, Dominion, Veritas, ending in a floating row | EYE OF THE UNKNOWN. · FIVE COINS IN SILVER · EDITION OF 50 EACH |
| 5.0–10.0 | Mint the one you love, in the real app: Choose your coin → "Make it yours." → payment rail → "Payment confirmed" → Veritas flies out, "Certificate minted · № 07 of 50 · On-chain on Base ↗" | FALL FOR ONE? · MINT IT. LIVE ON BASE. · GAS COVERED · ON-CHAIN CERTIFICATE |
| 10.0–20.0 | The real sealed-case film with the app's own choreography: seal pulse, release, slow-motion lid, freeze, glitter, Dominion rising from inside the rim, then "Revealed from the vault · Dominion · Silver · № 07 of 50" | OR LET THE BOX CHOOSE. · "A little anticipation." · "Here it comes." · YOURS TO DISCOVER. |
| 20.0–25.0 | The four choices | KEEP IT VAULTED. (Secure vault · Liechtenstein) · LIST IT. · BRING IT HOME. · OR TAKE 80% BACK. INSTANTLY. ("80% of the coin's stated original value · terms apply" stays on screen) |
| 25.0–30.0 | The five coins form the bridge, then the mark and lockup | REAL COINS. A NEW WAY TO COLLECT. · BY INVITATION. · "Your invitation is your way in." · bifrostvault.io · 18+ · fine print |

A legal line (`BV_CONFIG.finePrint.short`) sits on every frame from 0 to 25 s, like the footer on the earlier
15 s film. The full fine print (`finePrint.long`) holds on the end card from 24.75 to 30 s.

## Before this airs: needs sign-off

1. **80% buyback.** The ad states "80% of the coin's stated original value · terms apply". This comes from the
   client and the newest invite-buyback code, where it is still switched off. The product branch from 24 Sep
   (`PackDiscovery.tsx`) still says "No guaranteed resale price or cash buyback", and the Sealed Strike
   counsel brief says "no buy-back promise". The site, terms and counsel must agree before release.
   Change it in `config.js` → `buyback`.
2. **Pack marketing.** `docs/SEALED-STRIKE-COUNSEL-BRIEF.md` §6 (bifrost-platform) lists "Publish any
   marketing that references packs" as waiting on counsel.
3. **Vault location.** "Secure vault · Liechtenstein" is as stated by the client. The platform docs mention
   both Liechtenstein and Norrköping. No "insured" claim is made anywhere.
4. **Edition of 50 each, and the names Silence / Ametherion / Cycle / Dominion / Veritas.** These follow the
   live site on 1 Oct 2026. Older repo data uses 100/100/38/25/15 and "… Awakening" names; the ad uses neither.
5. Coins, editions (№ 07), app screens and pulls are a dramatisation, and the legal line says so.
   Both "Mint" and "sealed case" are shown as ways in. Check both are live for the audience the ad targets.

Copy follows the brand's own rules: ALL-CAPS headlines with a full stop, and no luck/chance/win/rip/NFT/
crypto language, no exclamation marks, no emoji. The client's "find your luck" is therefore written as
"Or let the box choose."

## Sources (real assets, from jocke-lab/bifrost-platform `apps/market/public`, branch codex/mobile-shop-review-20260923)

| Here | Source | Notes |
|---|---|---|
| `assets/coins/{silence,ametherion,cycle,dominion,veritas}.webp` | `media/eye/{blue,violet,emerald,crimson,silver}.webp` | Real product photos with alpha |
| `assets/coins/reverse*.webp` | `media/eye/reverse-cook-islands.webp` | `reverse-cut.webp` has the white ground keyed out |
| `assets/coins3d/` | Rendered from `media/ar/set_eye_*.glb` | Under the app's own AcquisitionScene lighting. See `assets/coins3d/README.txt` |
| `assets/box/vault-opening-hq.mp4`, `frames/`, `vault-box-*.webp` | `media/packs/` | The real sealed-case film. Frame 105 = the app's 4.375 s freeze |
| `assets/brand/bifrost-lockup.svg` | `public/brand/bifrost-lockup.svg` | The mark is also drawn in `app-ui.js` from `BrandMark.tsx` |
| `assets/fonts/geist-*.ttf` | `public/fonts/share/` | Geist (SIL Open Font License) |
| `assets/sound/bifrost-recorded-foley.wav` | `media/reveal/` | CC0, see `sound-credits.txt`. The rest of the score is procedural (`audio.js`) |
| `app-ui.js` | Ported from `src/components/*` and `app/globals.css` | Choose your coin, checkout, PayStages, ChainRecordCard, PackOpening result, OwnerStrip |

## Editing and rendering

- Copy and numbers live in `config.js`: edition, buyback percentage and basis, vault, fine print.
  Timings, roles and layout live in `scenes/00-shared.js`.
- Each scene is `scenes/0N-*.js`. The engine API is in the header of `film.js`. Every frame is a pure function of time.
- Preview: serve the repo root (`npx http-server .`) and open `/commercial/`. Add `?format=portrait` or `?t=12` as needed.
- Stills: `node tools/render-commercial.mjs --stills "1.2,16.6" --format both --out /tmp/stills`
- Final MP4s: `node tools/render-commercial.mjs --format both --out commercial/dist --crf 25 --preset slow`
  This takes about 10–15 min on 4 cores and needs Playwright's Chromium and ffmpeg.

## Notes

- `vercel.json` sends `X-Frame-Options: SAMEORIGIN`, so `/commercial` can't be iframed on bifrostvault.io.
  Either host the MP4s there, or copy the `commercial/` folder into the market app.
- The page waits for the first ~10 s of assets (about 12 MB) before playing. Later scenes stream in behind.
- Optional polish found in the final QC:
  - the legal line has low contrast over the macro texture from 0 to 1.6 s;
  - there are about 4 near-empty frames at 5.0 before the phone rises;
  - the 8.6 certificate tick and the 24.5 confirm chord are quiet in the mix.
