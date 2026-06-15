/* ============================================================================
   bifrost — live data layer.
   Replaces the in-memory mock seeds with real Supabase access.
   - window.DB.hub  → bifrost's own project (company/team/auth)
   - window.DB.nft  → the numismatic NFT trading platform (operator admin)
   Public reads use the publishable key (RLS-protected). Privileged admin
   writes will go through Vercel serverless functions (api/) using service_role
   keys held in Vercel env — never shipped to the browser.
   ========================================================================== */
(function () {
  const C = window.BIFROST_CONFIG || {};
  const SB = window.supabase;
  if (!SB || !SB.createClient) {
    console.error('[bifrost] @supabase/supabase-js not loaded — data layer disabled');
    window.DB = { ready: false };
    return;
  }

  const make = (p) =>
    (p && p.url && p.anonKey)
      ? SB.createClient(p.url, p.anonKey, {
          auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bifrost.auth.' + (p.ref || 'x') }
        })
      : null;

  const projects = C.projects || {};
  const hub = make(projects.hub) || (C.supabaseUrl ? SB.createClient(C.supabaseUrl, C.supabaseAnonKey) : null);
  const nft = make(projects.nft);

  // Generic read helper: read(client, 'table', { select, eq, order:{col,asc}, limit, count })
  async function read(client, table, opts = {}) {
    if (!client) return { data: [], error: 'no client', count: 0 };
    let q = client.from(table).select(opts.select || '*', opts.count ? { count: 'exact' } : undefined);
    if (opts.eq) for (const [k, v] of Object.entries(opts.eq)) q = q.eq(k, v);
    if (opts.order) q = q.order(opts.order.col, { ascending: !!opts.order.asc });
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error, count } = await q;
    if (error) console.warn('[bifrost] read', table, error.message || error);
    return { data: data || [], error, count: count ?? (data ? data.length : 0) };
  }

  // Fast row count without pulling rows.
  async function count(client, table, eq) {
    if (!client) return 0;
    let q = client.from(table).select('id', { count: 'exact', head: true });
    if (eq) for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
    const { count: c, error } = await q;
    if (error) { console.warn('[bifrost] count', table, error.message || error); return 0; }
    return c || 0;
  }

  window.DB = {
    ready: true,
    hub, nft,
    read, count,

    // NFT platform convenience wrappers
    nft_read: (table, opts) => read(nft, table, opts),
    nft_count: (table, eq) => count(nft, table, eq),

    // Auth (against the hub project) — used by the admin login gate.
    auth: {
      client: hub,
      getSession: () => hub ? hub.auth.getSession().then(r => r.data.session) : Promise.resolve(null),
      getUser: () => hub ? hub.auth.getUser().then(r => r.data.user) : Promise.resolve(null),
      signInPassword: (email, password) => hub.auth.signInWithPassword({ email, password }),
      signInMagicLink: (email) => hub.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } }),
      signOut: () => hub.auth.signOut(),
      onChange: (cb) => hub ? hub.auth.onAuthStateChange((_e, s) => cb(s)) : null
    }
  };

  console.log('[bifrost] data layer ready', { hub: !!hub, nft: !!nft });
})();
