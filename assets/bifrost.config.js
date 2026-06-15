/* ============================================================================
   Bifrost — public client config.
   SAFE to commit & ship to the browser: the publishable key only grants what
   your Row-Level-Security policies allow. NEVER put the service_role key or any
   API secret (Stripe, Fortnox, Slack, etc.) here — those live in Vercel env vars
   and run only in serverless / Supabase Edge Functions.
   ========================================================================== */
window.BIFROST_CONFIG = {
  // hub = bifrost's own project; also the Auth provider for the admin login.
  supabaseUrl: 'https://zgvqnaorhtafqffzagll.supabase.co',
  supabaseAnonKey: 'sb_publishable_lgI1O2aderasrvjazJZSPw_Oul6pHvx',
  region: 'eu-central-1',

  // Projects bifrost reads/administers. Publishable keys only (RLS-protected, safe to ship).
  // Privileged admin writes go through Vercel serverless functions using service_role keys
  // held in Vercel env vars — never in this file.
  projects: {
    hub: {
      ref: 'zgvqnaorhtafqffzagll',
      url: 'https://zgvqnaorhtafqffzagll.supabase.co',
      anonKey: 'sb_publishable_lgI1O2aderasrvjazJZSPw_Oul6pHvx'
    },
    // The numismatic NFT trading platform (opulence-tech) — bifrost is its operator admin.
    nft: {
      ref: 'mumnyvmxyzsgducbbvxi',
      url: 'https://mumnyvmxyzsgducbbvxi.supabase.co',
      anonKey: 'sb_publishable__oUKNAdEnZrqxyxvkUadmQ_tjdg74my'
    }
  }
};
