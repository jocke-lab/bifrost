/* ============================================================================
   Bifrost — public client config.
   SAFE to commit & ship to the browser: the publishable key only grants what
   your Row-Level-Security policies allow. NEVER put the service_role key or any
   API secret (Stripe, Fortnox, Slack, etc.) here — those live in Vercel env vars
   and run only in serverless / Supabase Edge Functions.
   ========================================================================== */
window.BIFROST_CONFIG = {
  supabaseUrl: 'https://zgvqnaorhtafqffzagll.supabase.co',
  supabaseAnonKey: 'sb_publishable_lgI1O2aderasrvjazJZSPw_Oul6pHvx',
  region: 'eu-central-1'
};
