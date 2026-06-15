// =====================================================================
// bifrost hub edge function: "access"
// Login/onboarding + team management for the panel.
//   PRE-LOGIN (no token):
//     POST /access/check  {email}            -> {ok, exists, needs_password}
//     POST /access/claim  {email, password}  -> sets the first password for an
//                                               INVITED account, activates it
//   ADMIN (hub JWT, owner/admin or allowlist):
//     GET    /access/team                     -> list people
//     POST   /access/team  {email,name,role}  -> register (invite) a person
//     PUT    /access/team  {id, role?, status?}-> change role / suspend / reactivate
// Keyless: verify_jwt=false, auto service-role. profiles.status drives state:
//   'invited' = must set password, 'active' = normal, 'suspended' = revoked.
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const HUB_URL = 'https://zgvqnaorhtafqffzagll.supabase.co';
const HUB_ANON = 'sb_publishable_lgI1O2aderasrvjazJZSPw_Oul6pHvx';
const ADMIN_EMAILS = (Deno.env.get('ADMIN_EMAILS') || 'arivd.arvidsson@gmail.com').toLowerCase().split(',').map((s) => s.trim());
const ROLES = ['owner', 'admin', 'finance', 'member', 'viewer'];

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS', 'Access-Control-Allow-Headers': 'authorization,content-type,apikey,x-client-info', 'Content-Type': 'application/json' };
const j = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: cors });
const norm = (e: string) => String(e || '').trim().toLowerCase();

function svc() { return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } }); }

async function requireUser(req: Request, sb: any) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { code: 401 };
  const r = await fetch(HUB_URL + '/auth/v1/user', { headers: { apikey: HUB_ANON, Authorization: 'Bearer ' + token } });
  if (!r.ok) return { code: 401 };
  const u = await r.json();
  if (!u || !u.id) return { code: 401 };
  return { uid: u.id, email: u.email };
}

async function requireAdmin(req: Request, sb: any) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { code: 401 };
  const r = await fetch(HUB_URL + '/auth/v1/user', { headers: { apikey: HUB_ANON, Authorization: 'Bearer ' + token } });
  if (!r.ok) return { code: 401 };
  const u = await r.json();
  if (!u || !u.id) return { code: 401 };
  const { data: prof } = await sb.from('profiles').select('id,role,status').eq('id', u.id).maybeSingle();
  const isAdmin = ADMIN_EMAILS.includes(norm(u.email)) || (prof && ['owner', 'admin'].includes(prof.role));
  if (!isAdmin) return { code: 403 };
  if (prof && prof.status !== 'active') return { code: 403 };
  return { uid: u.id, email: u.email, role: prof?.role || 'owner' };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const ci = parts.indexOf('access');
  const resource = (ci >= 0 ? parts[ci + 1] : parts[parts.length - 1]) || '';
  const sb = svc();
  let b: any = {};
  if (req.method !== 'GET') { try { b = await req.json(); } catch (_) { b = {}; } }

  try {
    // ---------- PRE-LOGIN (no token) ----------
    if (resource === 'check' && req.method === 'POST') {
      const email = norm(b.email);
      if (!email) return j(400, { ok: false, error: 'email required' });
      const { data: p } = await sb.from('profiles').select('status').eq('email', email).maybeSingle();
      return j(200, { ok: true, exists: !!p, needs_password: !!p && p.status === 'invited', suspended: !!p && p.status === 'suspended' });
    }
    if (resource === 'claim' && req.method === 'POST') {
      const email = norm(b.email); const password = String(b.password || '');
      if (!email || password.length < 8) return j(400, { ok: false, error: 'email and password (min 8 chars) required' });
      const { data: p } = await sb.from('profiles').select('id,status').eq('email', email).maybeSingle();
      if (!p) return j(404, { ok: false, error: 'no_account' });
      if (p.status === 'suspended') return j(403, { ok: false, error: 'suspended' });
      if (p.status !== 'invited') return j(409, { ok: false, error: 'already_active' });
      const upd = await sb.auth.admin.updateUserById(p.id, { password, email_confirm: true });
      if (upd.error) return j(400, { ok: false, error: upd.error.message });
      await sb.from('profiles').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', p.id);
      return j(200, { ok: true });
    }

    // ---------- ME (any signed-in user → own profile) ----------
    if (resource === 'me' && req.method === 'GET') {
      const auth = await requireUser(req, sb);
      if ((auth as any).code) return j(401, { ok: false, unauthorized: true, error: 'sign in required' });
      const { data: p } = await sb.from('profiles').select('id,email,full_name,title,role,status').eq('id', (auth as any).uid).maybeSingle();
      if (!p) return j(200, { ok: true, me: { id: (auth as any).uid, email: (auth as any).email, role: 'member', status: 'active', full_name: (auth as any).email } });
      const isAdmin = ADMIN_EMAILS.includes(norm(p.email)) || ['owner', 'admin'].includes(p.role);
      return j(200, { ok: true, me: { ...p, is_admin: isAdmin } });
    }

    // ---------- ADMIN (team management) ----------
    if (resource === 'team') {
      const auth = await requireAdmin(req, sb);
      if ((auth as any).code === 401) return j(401, { ok: false, unauthorized: true, error: 'sign in required' });
      if ((auth as any).code === 403) return j(403, { ok: false, forbidden: true, error: 'admins only' });

      if (req.method === 'GET') {
        const { data: profs } = await sb.from('profiles').select('id,email,full_name,title,role,status,created_at').order('created_at', { ascending: true });
        // last sign-in from auth.users (best effort)
        let lastById: Record<string, string> = {};
        try { const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 }); (list?.users || []).forEach((u: any) => { lastById[u.id] = u.last_sign_in_at; }); } catch (_) {}
        const rows = (profs || []).map((p: any) => ({ ...p, last_sign_in_at: lastById[p.id] || null }));
        return j(200, { ok: true, rows });
      }
      if (req.method === 'POST') {
        const email = norm(b.email); const name = String(b.name || '').trim() || email; const role = ROLES.includes(b.role) ? b.role : 'member';
        if (!email) return j(400, { ok: false, error: 'email required' });
        if (role === 'owner') return j(400, { ok: false, error: 'cannot assign owner' });
        const { data: existing } = await sb.from('profiles').select('id').eq('email', email).maybeSingle();
        if (existing) return j(409, { ok: false, error: 'already_registered' });
        const created = await sb.auth.admin.createUser({ email, email_confirm: true });
        if (created.error || !created.data?.user) return j(400, { ok: false, error: created.error?.message || 'create failed' });
        const uid = created.data.user.id;
        // a DB trigger (handle_new_user) auto-creates the profile row → UPSERT to
        // set the chosen role + 'invited' status (so they must set a password).
        const { data: prof, error } = await sb.from('profiles').upsert({ id: uid, email, full_name: name, role, status: 'invited' }, { onConflict: 'id' }).select('id,email,full_name,role,status').single();
        if (error) { try { await sb.auth.admin.deleteUser(uid); } catch (_) {} return j(400, { ok: false, error: error.message }); }
        return j(200, { ok: true, person: prof });
      }
      if (req.method === 'PUT') {
        if (!b.id) return j(400, { ok: false, error: 'id required' });
        const { data: target } = await sb.from('profiles').select('id,role').eq('id', b.id).maybeSingle();
        if (!target) return j(404, { ok: false, error: 'not found' });
        if (target.role === 'owner') return j(400, { ok: false, error: 'cannot modify owner' });
        const patch: any = { updated_at: new Date().toISOString() };
        if (b.role && ROLES.includes(b.role) && b.role !== 'owner') patch.role = b.role;
        if (b.status && ['active', 'suspended', 'invited'].includes(b.status)) patch.status = b.status;
        const { data, error } = await sb.from('profiles').update(patch).eq('id', b.id).select('id,email,full_name,role,status').single();
        if (error) return j(400, { ok: false, error: error.message });
        return j(200, { ok: true, person: data });
      }
    }

    return j(404, { ok: false, error: 'unknown route: ' + resource });
  } catch (e) {
    return j(500, { ok: false, error: String((e && (e as any).message) || e) });
  }
});
