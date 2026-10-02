/* ============================================================================
   config.js — window.BV_CONFIG
   Bifrost Vault commercial · every marketing-tweakable number and line of copy.
   Scenes, the page and the soundtrack read these values; nothing is hardcoded
   twice. Sentences that contain numbers (buyback, edition size) are BUILT from
   the values below, so changing a number here changes it everywhere.

   v3 "the real thing": the client's real product. Eye of the Unknown (five coins
   in silver, edition of 50 each, by invitation), the sealed case and its opening,
   the two ways in (mint the coin you love on Base, or open a sealed case), and
   what you can do after: keep it vaulted, list it, bring it home, or take the
   buyback quote. Copy follows the client's own voice and word rules.
   ========================================================================== */
(function () {
  'use strict';

  const brand = {
    name: 'Bifrost Vault',
    domain: 'bifrostvault.io',
    url: 'https://bifrostvault.io',
    line: 'Real coins. A new way to collect.',
    access: 'By invitation.',
    accessSub: 'Your invitation is your way in.'
  };

  // The collection (live site: "Eye of the Unknown: five coins in silver. Edition of 50 each.")
  const collection = {
    name: 'Eye of the Unknown',
    metal: 'Silver',
    edition: 50,
    issuer: 'Cook Islands',          // legal-tender reverse: 5 DOLLARS · CHARLES III · 2026 · COOK ISLANDS
    // Photo files are the client's real product photographs (alpha cut-outs).
    coins: [
      { id: 'silence',    name: 'Silence',    file: 'assets/coins/silence.webp',    enamel: '#1A7FE0' },
      { id: 'ametherion', name: 'Ametherion', file: 'assets/coins/ametherion.webp', enamel: '#9410D2' },
      { id: 'cycle',      name: 'Cycle',      file: 'assets/coins/cycle.webp',      enamel: '#0B8A44' },
      { id: 'dominion',   name: 'Dominion',   file: 'assets/coins/dominion.webp',   enamel: '#D8401A' },
      { id: 'veritas',    name: 'Veritas',    file: 'assets/coins/veritas.webp',    enamel: '#C9CED6' }
    ],
    reverse: 'assets/coins/reverse.webp'
  };

  // Buyback quote — the single source of the percentage and its basis wording.
  const buyback = { pct: 80, basisLabel: "of the coin’s stated original value" };
  buyback.sentence = 'Buyback quote: ' + buyback.pct + '% ' + buyback.basisLabel + '; terms apply';

  const chain = { name: 'Base', gasCovered: true };
  const vault = { location: 'Liechtenstein', label: 'Secure vault · Liechtenstein' };

  window.BV_CONFIG = {
    film: { duration: 30, fps: 30 },
    brand,
    collection,
    buyback,
    chain,
    vault,

    finePrint: {
      long: '18+ · Dramatisation; app screens illustrative · Sealed cases contain one coin, revealed after payment; ' +
            'chances shown before you buy · ' + buyback.sentence + ' · ' +
            'Collector prices move both ways; coins may be worth less than you paid · Not investment advice · ' +
            collection.name + ': ' + collection.metal.toLowerCase() + ', ' + collection.issuer + ' legal tender, edition of ' +
            collection.edition + ' per design · Certificates minted on ' + chain.name + '; network fee covered by Bifrost · ' +
            'Coins held in a secure vault in ' + vault.location + ' until shipped · ' + brand.access.replace('.', '') +
            ' · ' + brand.domain,
      short: '18+ · Dramatisation · One coin per sealed case, chances shown before you buy · ' +
             buyback.pct + '% buyback quote, terms apply · Prices move both ways · Not investment advice · ' + brand.domain
    }
  };
})();
