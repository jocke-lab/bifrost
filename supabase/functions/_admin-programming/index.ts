// Standalone operator endpoint for the card-PROGRAMMING service queue.
// Kept separate from the big `admin` function to keep that one stable.
// Auth: same HUB-JWT + ADMIN_EMAILS allowlist; runs with the nft service role.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const HUB_URL = 'https://zgvqnaorhtafqffzagll.supabase.co';
const HUB_ANON = 'sb_publishable_lgI1O2aderasrvjazJZSPw_Oul6pHvx';
const ADMIN_EMAILS = (Deno.env.get('ADMIN_EMAILS') || 'arivd.arvidsson@gmail.com').toLowerCase().split(',').map((s) => s.trim());

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'authorization,content-type,apikey,x-client-info', 'Content-Type': 'application/json' };
const j = (s, b) => new Response(JSON.stringify(b), { status: s, headers: cors });

async function whoAmI(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { code: 401 };
  const r = await fetch(HUB_URL + '/auth/v1/user', { headers: { apikey: HUB_ANON, Authorization: 'Bearer ' + token } });
  if (!r.ok) return { code: 401 };
  const u = await r.json();
  if (!u || !u.email || !ADMIN_EMAILS.includes(String(u.email).toLowerCase())) return { code: 403 };
  return { user: u };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = await whoAmI(req);
  if (auth.code === 401) return j(401, { ok: false, unauthorized: true, error: 'sign in required' });
  if (auth.code === 403) return j(403, { ok: false, forbidden: true, error: 'not an authorized admin' });
  const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const url = new URL(req.url);
  const ok = (o) => j(200, Object.assign({ ok: true }, o));
  const bad = (e, s) => j(s || 400, { ok: false, error: e });
  try {
    if (req.method === 'GET') {
      const [reqs, dls, cols, coins, tags] = await Promise.all([
        sb.from('card_programming_requests').select('id,dealer_id,collection_id,status,note,created_at').order('created_at', { ascending: false }).limit(100),
        sb.from('dealers').select('id,name'),
        sb.from('collections').select('id,name,dealer_id'),
        sb.from('coins').select('id,collection_id'),
        sb.from('nfc_tags').select('coin_id').not('coin_id', 'is', null),
      ]);
      const dn = {}; (dls.data || []).forEach((d) => dn[d.id] = d.name);
      const cn = {}; (cols.data || []).forEach((c) => cn[c.id] = c.name);
      const total = {}, carded = new Set((tags.data || []).map((t) => t.coin_id)), done = {};
      (coins.data || []).forEach((c) => { if (!c.collection_id) return; total[c.collection_id] = (total[c.collection_id] || 0) + 1; if (carded.has(c.id)) done[c.collection_id] = (done[c.collection_id] || 0) + 1; });
      const rows = (reqs.data || []).map((r) => ({ ...r, dealer_name: dn[r.dealer_id] || null, collection_name: cn[r.collection_id] || null, coins: total[r.collection_id] || 0, cards_done: done[r.collection_id] || 0 }));
      const active = rows.find((r) => r.status === 'in_progress') || null;
      if (url.searchParams.get('view') === 'active') return ok({ job: active });
      return ok({ rows, active });
    }
    if (req.method === 'POST') {
      let b = {}; try { b = await req.json(); } catch (_) { b = {}; }
      if (!b.id) return bad('id required');
      const STATES = ['requested', 'queued', 'in_progress', 'done', 'cancelled'];
      if (b.action === 'start') {
        await sb.from('card_programming_requests').update({ status: 'queued', updated_at: new Date().toISOString() }).eq('status', 'in_progress');
        const { data } = await sb.from('card_programming_requests').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', b.id).select().single();
        return ok({ row: data });
      }
      if (b.action === 'set_status' && STATES.includes(b.status)) {
        const { data } = await sb.from('card_programming_requests').update({ status: b.status, updated_at: new Date().toISOString() }).eq('id', b.id).select().single();
        return ok({ row: data });
      }
      return bad('unknown action');
    }
    return bad('method not allowed', 405);
  } catch (e) { return j(500, { ok: false, error: String((e && e.message) || e) }); }
});
