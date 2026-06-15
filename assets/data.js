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

  // Keyless company books + vitals: the hub edge function `company`
  // (hub-JWT allowlist auth + auto service-role). Mirrors the nft `admin` fn.
  const COMPANY_FN = ((projects.hub && projects.hub.url) || C.supabaseUrl || 'https://zgvqnaorhtafqffzagll.supabase.co') + '/functions/v1/company';
  const HUB_KEY = (projects.hub && projects.hub.anonKey) || C.supabaseAnonKey || 'sb_publishable_lgI1O2aderasrvjazJZSPw_Oul6pHvx';
  async function companyToken() { try { const s = hub ? (await hub.auth.getSession()).data.session : null; return s && s.access_token; } catch (e) { return null; } }
  async function company(path, opts = {}) {
    const token = await companyToken();
    const headers = { apikey: HUB_KEY, 'content-type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    let r;
    try { r = await fetch(COMPANY_FN + '/' + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined }); }
    catch (e) { return { ok: false, _offline: true, error: e.message }; }
    if (opts.raw) return r;
    const t = await r.text(); let json; try { json = JSON.parse(t); } catch (e) { json = { ok: false, error: t || ('HTTP ' + r.status) }; }
    return json;
  }
  // Auth/onboarding + team management: the hub edge function `access`.
  const ACCESS_FN = ((projects.hub && projects.hub.url) || C.supabaseUrl || 'https://zgvqnaorhtafqffzagll.supabase.co') + '/functions/v1/access';
  async function access(path, opts = {}) {
    const token = await companyToken();
    const headers = { apikey: HUB_KEY, 'content-type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    let r;
    try { r = await fetch(ACCESS_FN + '/' + path, { method: opts.method || 'POST', headers, body: opts.body ? JSON.stringify(opts.body) : undefined }); }
    catch (e) { return { ok: false, _offline: true, error: e.message }; }
    const t = await r.text(); let json; try { json = JSON.parse(t); } catch (e) { json = { ok: false, error: t || ('HTTP ' + r.status) }; }
    return json;
  }
  async function companyDownload(path, filename) {
    const r = await company(path, { raw: true });
    if (!r.ok) { const t = await r.text(); throw new Error(t || ('HTTP ' + r.status)); }
    const blob = await r.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename || 'export.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

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

    // Company books + vitals (keyless edge function)
    company, companyDownload,
    // Auth/onboarding + team management
    access,

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
