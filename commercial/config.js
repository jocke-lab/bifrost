/* ============================================================================
   config.js — window.BV_CONFIG
   Bifrost Vault commercial · every marketing-tweakable number and line of copy.
   EVERY number shown on screen comes from here — scenes, the epilogue and the
   page read these values; nothing is hardcoded twice.

   Additions beyond the build contract (documented, non-breaking):
     tiers[].rarity  maps a product tier to the BVArt rarity key
                     (common | rare | epic | legendary) used for colour / glow.
     tiers[].metal   'silver' | 'gold' (every pack contains real precious metal).
     buyback.sentence  derived: "Instant buyback at 80% of the coin's current
                       listed value; terms apply" — built from pct + basisLabel.
     currency        'EUR' (fmtEUR in BVKit formats amounts).
   ========================================================================== */
(function () {
  'use strict';

  // Buyback — the single source of the percentage and its basis wording.
  const buyback = {
    pct: 80,
    basisLabel: "of the coin's current listed value"
  };
  buyback.sentence = 'Instant buyback at ' + buyback.pct + '% ' + buyback.basisLabel + '; terms apply';

  window.BV_CONFIG = {
    film: {
      duration: 60,   // seconds
      fps: 30         // render-mode frame rate
    },

    brand: {
      name: 'Bifrost Vault',
      domain: 'bifrostvault.io',
      url: 'https://bifrostvault.io',
      tagline: ''
    },

    currency: 'EUR',

    pack: {
      name: 'Vault Pack',
      series: 'Series 01',
      coinsPerPack: 3
    },

    buyback: buyback,

    chain: {
      name: 'Base',
      gasCovered: true
    },

    royaltyPct: 5,

    // PLACEHOLDER ODDS — these numbers are illustrative only and MUST be replaced
    // by the published odds for the drop before this film is used publicly.
    // They must always sum to 100.
    tiers: [
      { id: 'silver',    label: 'Silver',      rarity: 'common',    metal: 'silver', odds: 70  },  // PLACEHOLDER
      { id: 'rare',      label: 'Rare Silver', rarity: 'rare',      metal: 'silver', odds: 22  },  // PLACEHOLDER
      { id: 'gold',      label: 'Gold',        rarity: 'epic',      metal: 'gold',   odds: 7.5 },  // PLACEHOLDER
      { id: 'legendary', label: 'Legendary',   rarity: 'legendary', metal: 'gold',   odds: 0.5 }   // PLACEHOLDER
    ],

    // Coin roster with illustrative values — filled in by the art pass (art.js /
    // BVArt.COINS reads values from here when present). Leave empty until then.
    coins: [],

    finePrint: {
      long: '18+ · Pack contents are random; odds published for every drop · ' + buyback.sentence +
            ' · Silver, gold and collectible values go up and down; you may get back less than you paid' +
            ' · Not investment advice · Dramatisation; values shown are illustrative.',
      short: '18+ · Random contents, odds published · ' + buyback.pct + '% buyback, terms apply' +
             ' · Values vary · Not investment advice'
    }
  };
})();
