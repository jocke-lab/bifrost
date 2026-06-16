import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const HUB_URL = 'https://zgvqnaorhtafqffzagll.supabase.co';
const HUB_ANON = 'sb_publishable_lgI1O2aderasrvjazJZSPw_Oul6pHvx';
const ADMIN_EMAILS = (Deno.env.get('ADMIN_EMAILS') || 'arivd.arvidsson@gmail.com').toLowerCase().split(',').map((s) => s.trim());

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'authorization,content-type,apikey,x-client-info', 'Content-Type': 'application/json' };
const j = (s, b) => new Response(JSON.stringify(b), { status: s, headers: cors });
const slugify = (s) => { const v = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60); return v.length >= 2 ? v : 'c-' + Date.now().toString(36); };
const clampRoy = (n) => Math.max(0, Math.min(2000, Number(n) || 0));
const likeSafe = (s) => '%' + String(s || '').replace(/[,%()*\\]/g, '').slice(0, 60) + '%';
const DEALER_ST = ['pending', 'approved', 'suspended'];
const CARD_ST = ['requested', 'approved', 'shipped', 'delivered', 'rejected'];
const ORDER_ST = ['awaiting_shipment', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded', 'disputed'];

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
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const ai = parts.indexOf('admin');
  const resource = (ai >= 0 ? parts[ai + 1] : parts[parts.length - 1]) || '';
  const auth = await whoAmI(req);
  if (auth.code === 401) return j(401, { ok: false, unauthorized: true, error: 'sign in required' });
  if (auth.code === 403) return j(403, { ok: false, forbidden: true, error: 'not an authorized admin' });
  const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  let b = {};
  if (req.method !== 'GET') { try { b = await req.json(); } catch (_) { b = {}; } }
  try {
    const out = await route(resource, sb, req, b, url, auth.user);
    return j(out.status || 200, out.body);
  } catch (e) { return j(500, { ok: false, error: String((e && e.message) || e) }); }
});

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function randHex(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase(); }
function fmtCode(h) { return h.slice(0, 4) + '-' + h.slice(4, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16); }
const cnt = (r) => (r && typeof r.count === 'number' ? r.count : 0);

async function route(resource, sb, req, b, url, actor) {
  const m = req.method;
  const ok = (o) => ({ status: 200, body: Object.assign({ ok: true, configured: true }, o) });
  const bad = (e, s) => ({ status: s || 400, body: { ok: false, error: e } });

  // ── PLATFORM STATS / OVERVIEW ──
  if (resource === 'stats') {
    if (m === 'GET') {
      const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
      const [sales30, salesAll, usersC, dealersC, coinsC, collsC, certsC, listC, ordersC, dispC, wdC, cfC, chainC, cardC, dealerPendC] = await Promise.all([
        sb.from('sales').select('price_eur,platform_fee_eur,created_at').gte('created_at', since30).limit(10000),
        sb.from('sales').select('price_eur,platform_fee_eur').limit(20000),
        sb.from('profiles').select('id', { count: 'exact', head: true }),
        sb.from('dealers').select('id', { count: 'exact', head: true }),
        sb.from('coins').select('id', { count: 'exact', head: true }),
        sb.from('collections').select('id', { count: 'exact', head: true }),
        sb.from('certificates').select('id', { count: 'exact', head: true }),
        sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        sb.from('orders').select('id', { count: 'exact', head: true }).in('status', ['awaiting_shipment', 'shipped', 'delivered']),
        sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'disputed'),
        sb.from('withdrawal_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        sb.from('counterfeit_reports').select('id', { count: 'exact', head: true }).neq('status', 'resolved'),
        sb.from('chain_jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
        sb.from('card_orders').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
        sb.from('dealers').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      let vol30 = 0, fee30 = 0; const days = {};
      (sales30.data || []).forEach((s) => { const p = Number(s.price_eur || 0); vol30 += p; fee30 += Number(s.platform_fee_eur || 0); const d = (s.created_at || '').slice(0, 10); days[d] = (days[d] || 0) + p; });
      let gmv = 0, feeAll = 0; (salesAll.data || []).forEach((s) => { gmv += Number(s.price_eur || 0); feeAll += Number(s.platform_fee_eur || 0); });
      const series = []; for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); series.push({ day: d, volume: Math.round(days[d] || 0) }); }
      return ok({
        gmv: Math.round(gmv), fee_all: Math.round(feeAll), vol30: Math.round(vol30), fee30: Math.round(fee30),
        counts: {
          users: cnt(usersC), dealers: cnt(dealersC), coins: cnt(coinsC), collections: cnt(collsC), certificates: cnt(certsC),
          listings_active: cnt(listC), orders_open: cnt(ordersC), disputes: cnt(dispC), withdrawals: cnt(wdC),
          counterfeit: cnt(cfC), chain_queued: cnt(chainC), card_requests: cnt(cardC), dealer_pending: cnt(dealerPendC),
        },
        series,
      });
    }
  }

  // ── GLOBAL SEARCH ──
  if (resource === 'search') {
    if (m === 'GET') {
      const q = (url.searchParams.get('q') || '').trim();
      if (q.length < 2) return ok({ results: {} });
      const like = likeSafe(q);
      const [users, dealers, coins, colls, certs, orders, tags] = await Promise.all([
        sb.from('profiles').select('id,username,display_name,role').or('username.ilike.' + like + ',display_name.ilike.' + like).limit(6),
        sb.from('dealers').select('id,name,slug,status').ilike('name', like).limit(6),
        sb.from('coins').select('id,name,collection_id,image_url').ilike('name', like).limit(6),
        sb.from('collections').select('id,name,slug').ilike('name', like).limit(6),
        sb.from('certificates').select('id,serial,coin_id').ilike('serial', like).limit(6),
        sb.from('orders').select('id,label_code,status,total_eur').ilike('label_code', like).limit(6),
        sb.from('nfc_tags').select('id,uid,coin_id,status').ilike('uid', like).limit(6),
      ]);
      return ok({ results: { users: users.data || [], dealers: dealers.data || [], coins: coins.data || [], collections: colls.data || [], certificates: certs.data || [], orders: orders.data || [], tags: tags.data || [] } });
    }
  }

  // ── USERS / PROFILES ──
  if (resource === 'users') {
    if (m === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const { data: p } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
        if (!p) return bad('not found', 404);
        const [certs, orders, listings, bal, dealer] = await Promise.all([
          sb.from('certificates').select('id,serial,coin_id,minted', { count: 'exact' }).eq('owner_id', id).limit(50),
          sb.from('orders').select('id,label_code,status,total_eur,created_at').or('buyer_id.eq.' + id + ',seller_id.eq.' + id).order('created_at', { ascending: false }).limit(20),
          sb.from('listings').select('id,price_eur,status,certificate_id').eq('seller_id', id).limit(20),
          sb.from('balance_entries').select('amount_eur').eq('user_id', id).limit(5000),
          sb.from('dealers').select('id,name,slug,status').eq('owner_id', id).maybeSingle(),
        ]);
        let balance = 0; (bal.data || []).forEach((e) => balance += Number(e.amount_eur || 0));
        return ok({ user: p, certs: certs.data || [], certs_count: certs.count || 0, orders: orders.data || [], listings: listings.data || [], balance: Math.round(balance * 100) / 100, dealer: dealer.data || null });
      }
      const q = url.searchParams.get('q');
      let qq = sb.from('profiles').select('id,username,display_name,role,wallet_address,suspended,created_at').order('created_at', { ascending: false }).limit(100);
      if (q) qq = qq.or('username.ilike.' + likeSafe(q) + ',display_name.ilike.' + likeSafe(q));
      const { data } = await qq; return ok({ users: data || [] });
    }
    if (m === 'PATCH') {
      if (!b.id) return bad('id required');
      const patch = {};
      if (b.role && ['collector', 'creator', 'admin'].includes(b.role)) patch.role = b.role;
      if (b.suspended !== undefined) { patch.suspended = !!b.suspended; patch.suspended_reason = b.suspended ? (b.reason || null) : null; patch.suspended_at = b.suspended ? new Date().toISOString() : null; }
      if (!Object.keys(patch).length) return bad('nothing to update');
      const { data, error } = await sb.from('profiles').update(patch).eq('id', b.id).select().single(); if (error) throw error;
      return ok({ user: data });
    }
  }

  // ── BALANCE (credit / adjust user money) ──
  if (resource === 'balance') {
    if (m === 'GET') { const uid = url.searchParams.get('user_id'); if (!uid) return bad('user_id required'); const { data } = await sb.from('balance_entries').select('id,amount_eur,kind,note,created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(100); let sum = 0; (data || []).forEach((e) => sum += Number(e.amount_eur || 0)); return ok({ entries: data || [], balance: Math.round(sum * 100) / 100 }); }
    if (m === 'POST') { if (b.action === 'adjust') { if (!b.user_id || b.amount_eur == null) return bad('user_id and amount_eur required'); const { data, error } = await sb.from('balance_entries').insert({ user_id: b.user_id, amount_eur: Number(b.amount_eur), kind: 'adjustment', note: b.note || 'admin adjustment' }).select().single(); if (error) throw error; return ok({ row: data }); } return bad('unknown action'); }
  }

  // ── MARKETPLACE LISTINGS ──
  if (resource === 'listings') {
    if (m === 'GET') {
      const status = url.searchParams.get('status');
      let q = sb.from('listings').select('id,certificate_id,seller_id,price_eur,status,kind,created_at,top_bid_eur,ends_at').order('created_at', { ascending: false }).limit(120);
      if (status) q = q.eq('status', status);
      const { data } = await q; const rows = data || [];
      const certIds = [...new Set(rows.map((r) => r.certificate_id).filter(Boolean))];
      const { data: certs } = certIds.length ? await sb.from('certificates').select('id,coin_id').in('id', certIds) : { data: [] };
      const coinByCert = {}; (certs || []).forEach((c) => coinByCert[c.id] = c.coin_id);
      const coinIds = [...new Set((certs || []).map((c) => c.coin_id).filter(Boolean))];
      const { data: coins } = coinIds.length ? await sb.from('coins').select('id,name,image_url').in('id', coinIds) : { data: [] };
      const cmap = {}; (coins || []).forEach((c) => cmap[c.id] = c);
      rows.forEach((r) => { const coin = cmap[coinByCert[r.certificate_id]]; r.coin_name = coin ? coin.name : null; r.coin_image = coin ? coin.image_url : null; });
      return ok({ rows });
    }
    if (m === 'POST') {
      if (b.action === 'cancel') { if (!b.id) return bad('id required'); const { data } = await sb.from('listings').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', b.id).select().single(); return ok({ row: data }); }
      return bad('unknown action');
    }
  }

  // ── ROYALTY PAYOUTS ──
  if (resource === 'royalties') {
    if (m === 'GET') { const { data } = await sb.from('royalty_payouts').select('id,sale_id,collection_id,label,kind,bps,amount_eur,beneficiary_id,created_at').order('created_at', { ascending: false }).limit(120); return ok({ rows: data || [] }); }
  }

  // ── INBOX (conversations) ──
  if (resource === 'inbox') {
    if (m === 'GET') {
      const { data: convs } = await sb.from('conversations').select('id,kind,order_id,dealer_id,a,b,last_message_at,created_at').order('last_message_at', { ascending: false }).limit(80);
      const rows = convs || [];
      const uids = [...new Set(rows.flatMap((c) => [c.a, c.b]).filter(Boolean))];
      const dids = [...new Set(rows.map((c) => c.dealer_id).filter(Boolean))];
      const [profs, deals] = await Promise.all([
        uids.length ? sb.from('profiles').select('id,username,display_name').in('id', uids) : Promise.resolve({ data: [] }),
        dids.length ? sb.from('dealers').select('id,name').in('id', dids) : Promise.resolve({ data: [] }),
      ]);
      const pm = {}; (profs.data || []).forEach((p) => pm[p.id] = p.username || p.display_name); const dm = {}; (deals.data || []).forEach((d) => dm[d.id] = d.name);
      rows.forEach((c) => { c.party = c.dealer_id ? (dm[c.dealer_id] || 'dealer') : ([pm[c.a], pm[c.b]].filter(Boolean).join(' ↔ ') || 'conversation'); });
      return ok({ rows });
    }
  }

  if (resource === 'dealers') {
    if (m === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const { data: d } = await sb.from('dealers').select('*').eq('id', id).maybeSingle();
        if (!d) return bad('not found', 404);
        const [colls, sales] = await Promise.all([
          sb.from('collections').select('id,name,published,approved').eq('dealer_id', id).limit(50),
          sb.from('sales').select('price_eur,royalty_eur,created_at').eq('dealer_id', id).order('created_at', { ascending: false }).limit(200),
        ]);
        let vol = 0, roy = 0; (sales.data || []).forEach((s) => { vol += Number(s.price_eur || 0); roy += Number(s.royalty_eur || 0); });
        return ok({ dealer: d, collections: colls.data || [], volume: Math.round(vol), royalties: Math.round(roy), sales_count: (sales.data || []).length });
      }
      const { data, error } = await sb.from('dealers').select('id,owner_id,name,slug,bio,logo_url,verified,status,default_royalty_bps,contact_email,contact_phone,website,custom_domain,custom_domain_verified,ship_name,ship_line1,ship_postcode,ship_city,ship_country,ai_credit_cents,created_at').order('created_at', { ascending: false }); if (error) throw error; return ok({ dealers: data });
    }
    if (m === 'POST') { if (!b.name) return bad('name required'); const row = { name: b.name, slug: slugify(b.slug || b.name), default_royalty_bps: b.royalty_bps != null ? clampRoy(b.royalty_bps) : 500, contact_email: b.contact_email || null, website: b.website || null, bio: b.bio || null }; if (b.status && DEALER_ST.includes(b.status)) row.status = b.status; if (b.verified != null) row.verified = !!b.verified; const { data, error } = await sb.from('dealers').insert(row).select().single(); if (error) throw error; return ok({ dealer: data }); }
    if (m === 'PATCH') {
      if (!b.id) return bad('id required');
      if (b.action === 'domain_verified') { const { data, error } = await sb.from('dealers').update({ custom_domain_verified: !!b.verified }).eq('id', b.id).select().single(); if (error) throw error; return ok({ dealer: data }); }
      const patch = {};
      if (b.action === 'approve') { patch.status = 'approved'; patch.verified = true; }
      if (b.action === 'set_status' && b.status && DEALER_ST.includes(b.status)) patch.status = b.status;
      if (b.status && DEALER_ST.includes(b.status) && patch.status === undefined) patch.status = b.status;
      ['verified', 'default_royalty_bps', 'name', 'contact_email', 'website', 'bio'].forEach((k) => { if (b[k] !== undefined && patch[k] === undefined) patch[k] = b[k]; });
      const { data, error } = await sb.from('dealers').update(patch).eq('id', b.id).select().single(); if (error) throw error;
      if (patch.status === 'approved' && data && data.owner_id) { await sb.from('profiles').update({ role: 'creator' }).eq('id', data.owner_id).eq('role', 'collector'); }
      return ok({ dealer: data });
    }
  }
  if (resource === 'collections') {
    if (m === 'GET') { const { data, error } = await sb.from('collections').select('id,name,slug,dealer_id,published,approved,verified,featured,royalty_bps,chain,created_at').order('created_at', { ascending: false }); if (error) throw error; return ok({ collections: data }); }
    if (m === 'POST') { if (b.action === 'feature') { if (!b.id) return bad('id required'); const { data, error } = await sb.from('collections').update({ featured: !!b.featured }).eq('id', b.id).select().single(); if (error) throw error; return ok({ collection: data }); } if (b.action === 'approve') { if (!b.id) return bad('id required'); const patch = { approved: true }; if (b.publish !== false) patch.published = true; if (b.verified !== undefined) patch.verified = !!b.verified; const { data, error } = await sb.from('collections').update(patch).eq('id', b.id).select().single(); if (error) throw error; return ok({ collection: data }); } if (!b.name || !b.dealer_id) return bad('name and dealer_id required'); const row = { name: b.name, slug: slugify(b.slug || b.name), dealer_id: b.dealer_id, description: b.description || null, royalty_bps: b.royalty_bps != null ? clampRoy(b.royalty_bps) : 500, chain: b.chain || 'base', approved: !!b.approved, published: !!b.published, verified: !!b.verified }; const { data, error } = await sb.from('collections').insert(row).select().single(); if (error) throw error; return ok({ collection: data }); }
  }
  if (resource === 'coins') {
    if (m === 'GET') { const col = url.searchParams.get('collection_id'); let q = sb.from('coins').select('id,name,collection_id,edition_no,edition_total,metal,year,image_url,created_at').order('created_at', { ascending: false }).limit(200); if (col) q = q.eq('collection_id', col); const { data, error } = await q; if (error) throw error; return ok({ coins: data }); }
    if (m === 'POST') { if (!b.name || !b.collection_id) return bad('name and collection_id required'); const row = { name: b.name, collection_id: b.collection_id, edition_no: b.edition_no != null ? Number(b.edition_no) : null, edition_total: b.edition_total != null ? Number(b.edition_total) : null, metal: b.metal || null, year: b.year != null ? Number(b.year) : null, image_url: b.image_url || null, description: b.description || null }; const { data, error } = await sb.from('coins').insert(row).select().single(); if (error) throw error; return ok({ coin: data }); }
  }
  if (resource === 'certificates') {
    if (m === 'POST') { if (!b.coin_id) return bad('coin_id required'); const serial = b.serial || ('OPV-' + Date.now().toString(36).toUpperCase()); const { data, error } = await sb.from('certificates').insert({ coin_id: b.coin_id, serial, tag_id: b.tag_id || null }).select().single(); if (error) throw error; if (b.tag_id) { await sb.from('nfc_tags').update({ status: 'assigned', coin_id: b.coin_id }).eq('id', b.tag_id); } return ok({ certificate: data }); }
  }
  if (resource === 'nfc') {
    if (m === 'GET') { const { data, error } = await sb.from('nfc_tags').select('id,uid,coin_id,dealer_id,status,tap_count,created_at').order('created_at', { ascending: false }).limit(200); if (error) throw error; return ok({ tags: data }); }
    if (m === 'POST') { if (b.action === 'link') { if (!b.tag_id || !b.coin_id) return bad('tag_id and coin_id required'); const { data, error } = await sb.from('nfc_tags').update({ coin_id: b.coin_id, status: 'assigned' }).eq('id', b.tag_id).select().single(); if (error) throw error; return ok({ tag: data }); } if (b.action === 'unlink') { if (!b.tag_id) return bad('tag_id required'); const { data, error } = await sb.from('nfc_tags').update({ coin_id: null, status: 'unassigned' }).eq('id', b.tag_id).select().single(); if (error) throw error; return ok({ tag: data }); } if (b.action === 'deactivate') { if (!b.tag_id) return bad('tag_id required'); const { data, error } = await sb.from('nfc_tags').update({ status: 'revoked' }).eq('id', b.tag_id).select().single(); if (error) throw error; return ok({ tag: data }); } if (!b.uid) return bad('uid required'); const row = { uid: b.uid }; if (b.dealer_id) row.dealer_id = b.dealer_id; const { data, error } = await sb.from('nfc_tags').insert(row).select().single(); if (error) throw error; return ok({ tag: data }); }
  }
  if (resource === 'ops') {
    if (m === 'GET') { const [iss, cf, wd, dp, cv] = await Promise.all([
      sb.from('order_issues').select('id,order_id,reporter,reason,status,created_at').neq('status', 'resolved').order('created_at', { ascending: false }).limit(100),
      sb.from('counterfeit_reports').select('id,tag_uid,coin_id,reporter_email,reason,status,created_at').neq('status', 'resolved').order('created_at', { ascending: false }).limit(100),
      sb.from('withdrawal_requests').select('id,user_id,amount_eur,method,status,note,created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(100),
      sb.from('orders').select('id,label_code,status,dispute_reason,total_eur,buyer_id,seller_id,dealer_id,coin_id,created_at').eq('status', 'disputed').order('created_at', { ascending: false }).limit(100),
      sb.from('conversations').select('id,kind,order_id,dealer_id,last_message_at').order('last_message_at', { ascending: false }).limit(40)
    ]); return ok({ issues: iss.data || [], counterfeit: cf.data || [], withdrawals: wd.data || [], disputes: dp.data || [], conversations: cv.data || [] }); }
    if (m === 'POST') {
      if (b.action === 'resolve_issue') { const { data } = await sb.from('order_issues').update({ status: b.status || 'resolved' }).eq('id', b.id).select().single(); return ok({ row: data }); }
      if (b.action === 'resolve_counterfeit') { const { data } = await sb.from('counterfeit_reports').update({ status: b.status || 'resolved' }).eq('id', b.id).select().single(); return ok({ row: data }); }
      if (b.action === 'report_status') { const valid = ['open', 'reviewing', 'resolved', 'dismissed']; const st = valid.includes(b.status) ? b.status : 'reviewing'; const { data } = await sb.from('counterfeit_reports').update({ status: st }).eq('id', b.id).select().single(); return ok({ row: data }); }
      if (b.action === 'process_withdrawal') { const st = b.status === 'rejected' ? 'rejected' : 'paid'; const { data } = await sb.from('withdrawal_requests').update({ status: st, note: b.note || null, processed_at: new Date().toISOString() }).eq('id', b.id).select().single(); return ok({ row: data }); }
      if (b.action === 'order_status') { if (!ORDER_ST.includes(b.status)) return bad('bad status'); const patch = { status: b.status }; if (b.status === 'cancelled') patch.cancelled_at = new Date().toISOString(); if (b.status === 'completed') patch.completed_at = new Date().toISOString(); const { data } = await sb.from('orders').update(patch).eq('id', b.id).select().single(); return ok({ row: data }); }
      if (b.action === 'messages') { if (!b.conversation_id) return bad('conversation_id required'); const { data } = await sb.from('messages').select('id,sender_id,kind,body,created_at').eq('conversation_id', b.conversation_id).order('created_at', { ascending: true }).limit(200); return ok({ messages: data || [] }); }
      if (b.action === 'reply') { if (!b.conversation_id || !b.body) return bad('conversation_id and body required'); const { data } = await sb.from('messages').insert({ conversation_id: b.conversation_id, kind: 'text', body: b.body, sender_id: actor && actor.id ? actor.id : null }).select().single(); await sb.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', b.conversation_id); return ok({ row: data }); }
      return bad('unknown action');
    }
  }
  if (resource === 'accounting') {
    if (m === 'GET') { const [sales, wdq] = await Promise.all([ sb.from('sales').select('price_eur,platform_fee_eur,royalty_eur,rail,created_at').order('created_at', { ascending: false }).limit(5000), sb.from('withdrawal_requests').select('amount_eur,status').limit(5000) ]); const months = {}; let volume = 0, fees = 0, royalties = 0; (sales.data || []).forEach((s) => { const mo = (s.created_at || '').slice(0, 7); const row = months[mo] || (months[mo] = { month: mo, volume: 0, fees: 0, royalties: 0, count: 0 }); const p = Number(s.price_eur || 0), f = Number(s.platform_fee_eur || 0), r = Number(s.royalty_eur || 0); row.volume += p; row.fees += f; row.royalties += r; row.count++; volume += p; fees += f; royalties += r; }); let payouts = 0; (wdq.data || []).forEach((w) => { if (w.status === 'paid') payouts += Number(w.amount_eur || 0); }); const monthly = Object.values(months).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12); return ok({ totals: { volume, fees, royalties, payouts, sales: (sales.data || []).length }, monthly }); }
  }
  if (resource === 'sales-raw') {
    if (m === 'GET') {
      const period = url.searchParams.get('period');
      const dealer = url.searchParams.get('dealer_id');
      const buyer = url.searchParams.get('buyer_id');
      let q = sb.from('sales').select('id,price_eur,platform_fee_eur,royalty_eur,royalty_bps,dealer_id,buyer_id,seller_id,rail,tx_hash,created_at').order('created_at', { ascending: false }).limit(10000);
      if (dealer) q = q.eq('dealer_id', dealer);
      if (buyer) q = q.eq('buyer_id', buyer);
      if (period && /^\d{4}-\d{2}$/.test(period)) { const [yy, mm] = period.split('-').map(Number); const start = new Date(Date.UTC(yy, mm - 1, 1)).toISOString(); const end = new Date(Date.UTC(yy, mm, 1)).toISOString(); q = q.gte('created_at', start).lt('created_at', end); }
      const { data, error } = await q; if (error) throw error;
      return ok({ sales: data || [] });
    }
  }
  if (resource === 'sales') {
    if (m === 'GET') { const { data } = await sb.from('sales').select('id,price_eur,platform_fee_eur,royalty_eur,rail,buyer_id,seller_id,dealer_id,tx_hash,created_at').order('created_at', { ascending: false }).limit(120); return ok({ rows: data || [] }); }
  }
  if (resource === 'console') {
    if (m === 'GET') { const view = url.searchParams.get('view') || 'chain';
      if (view === 'chain') { const [jobs, snaps] = await Promise.all([ sb.from('chain_jobs').select('id,type,status,certificate_id,to_address,attempts,last_error,tx_hash,created_at,updated_at').order('created_at', { ascending: false }).limit(100), sb.from('wallet_snapshots').select('balance_wei,created_at').order('created_at', { ascending: false }).limit(1) ]); const counts = {}; (jobs.data || []).forEach((jb) => { counts[jb.status] = (counts[jb.status] || 0) + 1; }); const wei = snaps.data && snaps.data[0] ? Number(snaps.data[0].balance_wei || 0) : null; return ok({ jobs: jobs.data || [], counts, balance_eth: wei != null ? wei / 1e18 : null }); }
      if (view === 'audit') { const q = url.searchParams.get('q'); let qq = sb.from('audit_log').select('id,actor_id,action,target,meta,created_at').order('created_at', { ascending: false }).limit(200); if (q) qq = qq.ilike('action', likeSafe(q)); const { data } = await qq; return ok({ rows: data || [] }); }
      if (view === 'cards') { const [co, dl] = await Promise.all([ sb.from('card_orders').select('id,dealer_id,quantity,status,notes,amount_eur,design_url,conversation_id,created_at').order('created_at', { ascending: false }).limit(100), sb.from('dealers').select('id,name') ]); const dmap = {}; (dl.data || []).forEach((d) => dmap[d.id] = d.name); const rows = (co.data || []).map((r) => ({ ...r, dealer_name: dmap[r.dealer_id] || null })); return ok({ rows }); }
      return bad('bad view');
    }
    if (m === 'POST') { if (b.action === 'retry_chain') { const { data } = await sb.from('chain_jobs').update({ status: 'queued', last_error: null }).eq('id', b.id).select().single(); return ok({ row: data }); } if (b.action === 'mark_chain_job') { const patch = { status: b.failed ? 'failed' : 'done' }; if (b.tx) patch.tx_hash = b.tx; const { data } = await sb.from('chain_jobs').update(patch).eq('id', b.id).select().single(); return ok({ row: data }); } if (b.action === 'card_status') { if (!CARD_ST.includes(b.status)) return bad('valid status required'); const { data } = await sb.from('card_orders').update({ status: b.status }).eq('id', b.id).select().single(); return ok({ row: data }); } return bad('unknown action'); }
  }

  if (resource === 'provision') {
    if (m === 'GET') {
      const [cols, dls, coins, tags] = await Promise.all([
        sb.from('collections').select('id,name,slug,dealer_id,published,approved,verified,featured,royalty_bps,created_at').order('created_at', { ascending: false }),
        sb.from('dealers').select('id,name,custom_domain,custom_domain_verified'),
        sb.from('coins').select('id,collection_id'),
        sb.from('nfc_tags').select('coin_id').not('coin_id', 'is', null),
      ]);
      const dmap = {}; (dls.data || []).forEach((d) => dmap[d.id] = d);
      const total = {}, carded = new Set((tags.data || []).map((t) => t.coin_id));
      const cardedCnt = {};
      (coins.data || []).forEach((c) => { if (!c.collection_id) return; total[c.collection_id] = (total[c.collection_id] || 0) + 1; if (carded.has(c.id)) cardedCnt[c.collection_id] = (cardedCnt[c.collection_id] || 0) + 1; });
      const rows = (cols.data || []).map((c) => ({ ...c, dealer: dmap[c.dealer_id] || null, coins: total[c.id] || 0, cards_issued: cardedCnt[c.id] || 0 }));
      return ok({ rows });
    }
    if (m === 'POST') {
      if (!b.collection_id) return bad('collection_id required');
      const { data: col } = await sb.from('collections').select('dealer_id').eq('id', b.collection_id).maybeSingle();
      if (!col) return bad('collection not found', 404);
      const { data: coins } = await sb.from('coins').select('id,name,edition_no').eq('collection_id', b.collection_id).order('name');
      const { data: tagged } = await sb.from('nfc_tags').select('coin_id').not('coin_id', 'is', null);
      const has = new Set((tagged || []).map((t) => t.coin_id));
      const cards = [];
      for (const c of (coins || [])) {
        if (has.has(c.id)) continue;
        const uid = 'OPT-' + randHex(7), code = randHex(8), hash = await sha256hex(code);
        const { error } = await sb.from('nfc_tags').insert({ uid, dealer_id: col.dealer_id, coin_id: c.id, status: 'assigned', claim_code_hash: hash });
        if (error) { if (error.code === '23505') continue; throw error; }
        cards.push({ coin_name: c.name, edition_no: c.edition_no, uid, claim_code: fmtCode(code) });
      }
      return ok({ cards });
    }
  }

  if (resource === 'tags') {
    if (m === 'POST') {
      if (!b.dealer_id) return bad('dealer_id required');
      const count = Math.max(1, Math.min(1000, Number(b.count) || 0));
      const out = [];
      for (let i = 0; i < count; i++) {
        const uid = 'OPT-' + randHex(7), code = randHex(8), hash = await sha256hex(code);
        const { error } = await sb.from('nfc_tags').insert({ uid, dealer_id: b.dealer_id, status: 'unassigned', claim_code_hash: hash });
        if (error) throw error;
        out.push({ uid, claim_code: fmtCode(code) });
      }
      return ok({ tags: out });
    }
  }

  if (resource === 'orders') {
    if (m === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const { data: o } = await sb.from('orders').select('*').eq('id', id).maybeSingle();
        if (!o) return bad('not found', 404);
        const [events, coin] = await Promise.all([
          sb.from('order_events').select('id,type,note,actor_id,created_at').eq('order_id', id).order('created_at', { ascending: true }).limit(100),
          o.coin_id ? sb.from('coins').select('id,name,image_url').eq('id', o.coin_id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        return ok({ order: o, events: events.data || [], coin: coin.data || null });
      }
      const status = url.searchParams.get('status');
      let q = sb.from('orders').select('id,label_code,status,item_price_eur,total_eur,buyer_id,seller_id,dealer_id,coin_id,dispute_reason,created_at').order('created_at', { ascending: false }).limit(120);
      if (status) q = q.eq('status', status);
      const { data } = await q;
      const rows = data || [];
      const coinIds = [...new Set(rows.map((o) => o.coin_id).filter(Boolean))];
      const { data: coins } = coinIds.length ? await sb.from('coins').select('id,name').in('id', coinIds) : { data: [] };
      const cmap = {}; (coins || []).forEach((c) => cmap[c.id] = c.name);
      const ESCROW = ['awaiting_shipment', 'shipped', 'delivered', 'disputed'];
      let open = 0, flight = 0, disputes = 0;
      rows.forEach((o) => { if (ESCROW.includes(o.status)) open += Number(o.total_eur || 0); if (['awaiting_shipment', 'shipped', 'delivered'].includes(o.status)) flight++; if (o.status === 'disputed') disputes++; o.coin_name = cmap[o.coin_id] || null; });
      return ok({ rows, totals: { open_escrow: Math.round(open * 100) / 100, in_flight: flight, disputes } });
    }
    if (m === 'POST') {
      if (b.action === 'order_status') { if (!ORDER_ST.includes(b.status)) return bad('bad status'); const patch = { status: b.status }; if (b.status === 'cancelled') patch.cancelled_at = new Date().toISOString(); if (b.status === 'completed') patch.completed_at = new Date().toISOString(); const { data } = await sb.from('orders').update(patch).eq('id', b.id).select().single(); if (b.note) await sb.from('order_events').insert({ order_id: b.id, type: b.status, note: b.note, actor_id: actor && actor.id ? actor.id : null }); return ok({ row: data }); }
      return bad('unknown action');
    }
  }

  return bad('unknown resource', 404);
}
