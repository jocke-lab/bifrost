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

// Uniform failure response. "Not configured" returns 200 + configured:false so
// the frontend can render a clean "add this key" state instead of an error.
function fail(res, e) {
  if (e && e.code === 'NOT_CONFIGURED') {
    return json(res, 200, { ok: false, configured: false, need: e.env, project: e.project, message: 'Add ' + e.env + ' to Vercel env vars to enable this.' });
  }
  return json(res, (e && e.status) || 500, { ok: false, error: (e && e.message) || 'error', detail: e && e.data });
}

module.exports = { PROJECTS, key, json, readBody, supa, fail };
