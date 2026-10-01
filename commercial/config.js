/* ============================================================================
   config.js — window.BV_CONFIG
   Bifrost Vault commercial · every marketing-tweakable number and line of copy.
   EVERY number shown on screen comes from here — scenes, the epilogue and the
   page read these values; nothing is hardcoded twice. Sentences that contain
   numbers (buyback, royalty, coins per pack) are BUILT from the values below.

   v2 (ARCH.md "30-SECOND CUT"): film.duration = 30, 4 coins per pack,
   Liechtenstein vault, Eye of the Unknown collection, fine print per SCRIPT_V2.

   Additions beyond the build contract (documented, non-breaking):
     tiers[].rarity    BVArt rarity key (common | rare | epic | legendary) for colour / glow.
     tiers[].metal     'silver' | 'gold' (every pack contains real precious metal).
     buyback.sentence  "Instant buyback at 80% of the coin's current listed value; terms apply"
     pack.collection / pack.subtitle   "EYE OF THE UNKNOWN · 4 COINS · SILVER & GOLD"
     vault             { location, label } (contract: "Company + vault").
     currency          'EUR' (BVKit.fmtEUR formats amounts).
     finePrint.cutdown short-form disclosure for 15 s / 6 s cutdowns.
   ========================================================================== */
(function () {
  'use strict';

  // Buyback — the single source of the percentage and its basis wording.
  const buyback = {
    pct: 80,
    basisLabel: "of the coin's current listed value"
  };
  buyback.sentence = 'Instant buyback at ' + buyback.pct + '% ' + buyback.basisLabel + '; terms apply';

  const brand = {
    name: 'Bifrost Vault',
    domain: 'bifrostvault.io',
    url: 'https://bifrostvault.io',
    tagline: ''
  };

  const pack = {
    name: 'Vault Pack',
    series: 'Series 01',
    collection: 'Eye of the Unknown',
    coinsPerPack: 4
  };
  pack.subtitle = pack.collection.toUpperCase() + ' · ' + pack.coinsPerPack + ' COINS · SILVER & GOLD';

  const chain = { name: 'Base', gasCovered: true };
  const vault = { location: 'Liechtenstein', label: 'Secure vault in Liechtenstein' };
  const royaltyPct = 5;

  window.BV_CONFIG = {
    film: {
      duration: 30,   // seconds (v2 30 s cut)
      fps: 30         // render-mode frame rate
    },

    brand,
    currency: 'EUR',
    pack,
    buyback,
    chain,
    vault,
    royaltyPct,

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
      // Exact wording per SCRIPT_V2 "Fine print"; numbers and names are spliced in from the values above.
      long: '18+. ' + pack.name + ' contents are random; odds are published for every drop before you buy. ' +
            'Every pack contains at least one .9999 silver coin; gold coins appear in higher tiers at the published odds. ' +
            'Pulls shown are a dramatisation and not typical. ' +
            buyback.sentence + '. ' +
            'Silver, gold and collectible values go up and down; you may get back less than you paid. ' +
            'Not investment advice. ' +
            pack.collection + ': 1 oz .9999 silver, 100 per design, Cook Islands legal tender, struck by CIT, ' + vault.location + '. ' +
            'Bifrost Gold coin shown is a concept design. ' +
            'Coins are held in a secure vault in ' + vault.location + ' until shipped. ' +
            'Certificates minted on ' + chain.name + '; network fees covered by Bifrost. ' +
            'Marketplace funds held in escrow until delivery; creator royalty (default ' + royaltyPct + '%) applies on resale. ' +
            'App screens, offers and activity shown are illustrative. ' +
            'Shipping and eligibility per Terms at ' + brand.domain + '.',
      short: '18+ · Random contents, odds published · ' + buyback.pct + '% buyback, terms apply' +
             ' · Values vary · Not investment advice',
      cutdown: '18+. Random contents; odds published for every drop. Every pack contains silver or gold. ' +
               'Pull shown is dramatised, not typical. ' + buyback.sentence + '. ' +
               'Values go up and down; you may get back less than you paid. Not investment advice. ' +
               'Terms at ' + brand.domain + '.'
    }
  };
})();
