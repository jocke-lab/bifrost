// api/_lib.js — shared helpers for the bifrost serverless admin API.
// CommonJS, zero npm deps (uses global fetch on Vercel's Node runtime).
// Underscore-prefixed → Vercel does NOT treat this as a route.
const PROJECTS = {
  nft: { url: 'https://mumnyvmxyzsgducbbvxi.supabase.co', keyEnv: 'OPULENCE_TECH_SERVICE_ROLE' },
  hub: { url: 'https://zgvqnaorhtafqffzagll.supabase.co', keyEnv: 'BIFROST_SERVICE_ROLE' }
};

function key(project) { const p = PROJECTS[project]; return p ? process.env[p.keyEnv] : null; }

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise(r => {
    let d = '';
    req.on('data', c => { d += c; });
    req.on('end', () => { try { r(d ? JSON.parse(d) : {}); } catch (e) { r({}); } });
  });
}

// PostgREST call against a project using its service_role key (RLS-bypassing).
async function supa(project, path, opts) {
  opts = opts || {};
  const p = PROJECTS[project], k = key(project);
  if (!k) { const e = new Error('not_configured'); e.code = 'NOT_CONFIGURED'; e.env = p.keyEnv; e.project = project; throw e; }
  const r = await fetch(p.url + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: Object.assign(
      { apikey: k, Authorization: 'Bearer ' + k, 'content-type': 'application/json', Prefer: opts.prefer || 'return=representation' },
      opts.headers || {}
    ),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const t = await r.text();
  let data; try { data = t ? JSON.parse(t) : null; } catch (e) { data = t; }
  if (!r.ok) { const e = new Error('supabase_' + r.status); e.status = r.status; e.data = data; throw e; }
  return data;
}

// ── Admin auth gate ────────────────────────────────────────────────────────
// Verifies the caller's bifrost-hub Supabase session JWT and checks it against
// an email allowlist. Without this, the service-role endpoints would be
// world-writable once the key is set. Hub publishable key is safe to embed.
const HUB_ANON = 'sb_publishable_lgI1O2aderasrvjazJZSPw_Oul6pHvx';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'arivd.arvidsson@gmail.com')
  .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

async function requireAdmin(req) {
  const h = req.headers || {};
  const token = String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) { const e = new Error('sign in required'); e.code = 'UNAUTHORIZED'; throw e; }
  let user;
  try {
    const r = await fetch(PROJECTS.hub.url + '/auth/v1/user', { headers: { apikey: HUB_ANON, Authorization: 'Bearer ' + token } });
    if (!r.ok) { const e = new Error('sign in required'); e.code = 'UNAUTHORIZED'; throw e; }
    user = await r.json();
  } catch (e) { if (e.code) throw e; const er = new Error('auth check failed'); er.code = 'UNAUTHORIZED'; throw er; }
  if (!user || !user.email || !ADMIN_EMAILS.includes(String(user.email).toLowerCase())) {
    const e = new Error('not an authorized admin'); e.code = 'FORBIDDEN'; throw e;
  }
  return user;
}

// ── Signed-in user gate (no admin allowlist) ────────────────────────────────
// Verifies the caller's bifrost-hub session JWT via /auth/v1/user (same as
// requireAdmin) but accepts ANY valid hub user. Returns {uid,email,user} so
// per-employee endpoints (wearables) know which person is acting. Does NOT
// touch requireAdmin / ADMIN_EMAILS — the admin gate is unchanged.
async function requireUser(req) {
  const h = req.headers || {};
  const token = String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) { const e = new Error('sign in required'); e.code = 'UNAUTHORIZED'; throw e; }
  let user;
  try {
    const r = await fetch(PROJECTS.hub.url + '/auth/v1/user', { headers: { apikey: HUB_ANON, Authorization: 'Bearer ' + token } });
    if (!r.ok) { const e = new Error('sign in required'); e.code = 'UNAUTHORIZED'; throw e; }
    user = await r.json();
  } catch (e) { if (e.code) throw e; const er = new Error('auth check failed'); er.code = 'UNAUTHORIZED'; throw er; }
  if (!user || !user.id) { const e = new Error('sign in required'); e.code = 'UNAUTHORIZED'; throw e; }
  return { uid: user.id, email: user.email || null, token, user };
}

// Single stable origin used IDENTICALLY in OAuth start + callback so the
// redirect_uri matches the provider-console allowlist exactly. Override per
// environment with PUBLIC_ORIGIN (no trailing slash).
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || 'https://bifrostlkl.com').replace(/\/+$/, '');

// Uniform failure response. "Not configured" returns 200 + configured:false so
// the frontend can render a clean "add this key" state instead of an error.
function fail(res, e) {
  if (e && e.code === 'UNAUTHORIZED') return json(res, 401, { ok: false, unauthorized: true, error: 'sign in required' });
  if (e && e.code === 'FORBIDDEN') return json(res, 403, { ok: false, forbidden: true, error: 'not an authorized admin' });
  if (e && e.code === 'NOT_CONFIGURED') {
    return json(res, 200, { ok: false, configured: false, need: e.env, project: e.project, message: 'Add ' + e.env + ' to Vercel env vars to enable this.' });
  }
  return json(res, (e && e.status) || 500, { ok: false, error: (e && e.message) || 'error', detail: e && e.data });
}

module.exports = { PROJECTS, key, json, readBody, supa, fail, requireAdmin, requireUser, PUBLIC_ORIGIN, HUB_ANON };
