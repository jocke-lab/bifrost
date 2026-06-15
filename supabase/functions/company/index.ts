// =====================================================================
// bifrost hub edge function: "company"
// The company's own books (Opulence Tech) + per-employee health tracker.
// Keyless: verify_jwt=false, custom hub-JWT allowlist auth, auto service-role.
// Double-entry Swedish accounting (BAS), SEK base, per-line moms, SIE/CSV.
// Incorporates the correctness-audit fixes (accrual-at-send, FX clearing,
// reverse-charge self-accounting, two-tier auth, idempotent vouchers).
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const HUB_URL = 'https://zgvqnaorhtafqffzagll.supabase.co';
const HUB_ANON = 'sb_publishable_lgI1O2aderasrvjazJZSPw_Oul6pHvx';
const NFT_FN = 'https://mumnyvmxyzsgducbbvxi.supabase.co/functions/v1/admin';
const NFT_ANON = 'sb_publishable__oUKNAdEnZrqxyxvkUadmQ_tjdg74my';
const ADMIN_EMAILS = (Deno.env.get('ADMIN_EMAILS') || 'arivd.arvidsson@gmail.com').toLowerCase().split(',').map((s) => s.trim());
const CRON_SECRET = Deno.env.get('RECONCILE_CRON_SECRET') || '';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'authorization,content-type,apikey,x-client-info', 'Content-Type': 'application/json' };
const j = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: cors });
const txt = (s: number, body: string, ct: string, filename?: string) => new Response(body, { status: s, headers: { ...cors, 'Content-Type': ct, ...(filename ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {}) } });

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
// period 'YYYY-MM' in Europe/Stockholm from an ISO date (or now)
function periodOf(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit' }).format(d).slice(0, 7);
}
function dayOf(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// moms account maps
const VAT_OUT: Record<string, string> = { '25': '2611', '12': '2621', '6': '2631' };
const SALES: Record<string, string> = { '25': '3001', '12': '3002', '6': '3003' };
function zeroRateAccount(vatCode?: string): string {
  switch ((vatCode || '').toUpperCase()) {
    case 'EXPORT': return '3108';        // export outside EU
    case 'EU_GOODS': return '3105';      // goods to other EU country
    case 'EU_SERVICE': case 'REVERSE': return '3308'; // services reverse-charge
    default: return '3004';              // domestic momsfri
  }
}

async function whoAmI(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (CRON_SECRET && token && token === CRON_SECRET) return { system: true, tier: 'ADMIN', uid: null as string | null, email: 'cron@system' };
  if (!token) return { code: 401 };
  const r = await fetch(HUB_URL + '/auth/v1/user', { headers: { apikey: HUB_ANON, Authorization: 'Bearer ' + token } });
  if (!r.ok) return { code: 401 };
  const u = await r.json();
  if (!u || !u.id) return { code: 401 };
  return { authToken: token, authUser: u };
}

function tierOf(email: string, role: string): 'ADMIN' | 'EMPLOYEE' {
  if (ADMIN_EMAILS.includes(String(email || '').toLowerCase())) return 'ADMIN';
  if (['owner', 'admin', 'finance'].includes(String(role || ''))) return 'ADMIN';
  return 'EMPLOYEE';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const ci = parts.indexOf('company');
  const resource = (ci >= 0 ? parts[ci + 1] : parts[parts.length - 1]) || '';
  const seg2 = ci >= 0 ? parts[ci + 2] : undefined; // :id
  const seg3 = ci >= 0 ? parts[ci + 3] : undefined; // action

  const who = await whoAmI(req);
  if ((who as any).code === 401) return j(401, { ok: false, unauthorized: true, error: 'sign in required' });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // resolve identity/tier
  let ctx: { system?: boolean; uid: string | null; email: string; tier: 'ADMIN' | 'EMPLOYEE'; authToken?: string };
  if ((who as any).system) {
    ctx = { system: true, uid: null, email: 'cron@system', tier: 'ADMIN' };
  } else {
    const au = (who as any).authUser;
    let role = '', status = 'active';
    const { data: prof } = await sb.from('profiles').select('id,role,status').eq('id', au.id).maybeSingle();
    if (prof) { role = prof.role || ''; status = prof.status || 'active'; }
    if (prof && status !== 'active') return j(403, { ok: false, forbidden: true, error: 'inactive profile' });
    ctx = { uid: au.id, email: au.email, tier: tierOf(au.email, role), authToken: (who as any).authToken };
  }

  let body: any = {};
  if (req.method !== 'GET') { try { body = await req.json(); } catch (_) { body = {}; } }

  // VITALS = employee scope; everything else = books (admin only)
  const isVitals = resource === 'vitals';
  if (!isVitals && ctx.tier !== 'ADMIN') return j(403, { ok: false, forbidden: true, error: 'admins only' });

  try {
    const out = await route(resource, seg2, seg3, sb, req, body, url, ctx);
    if (out.raw) return txt(out.status || 200, out.raw.content, out.raw.contentType, out.raw.filename);
    return j(out.status || 200, out.body);
  } catch (e) {
    return j(500, { ok: false, error: String((e && (e as any).message) || e) });
  }
});

// ---------------------------------------------------------------------
// posting engine
// ---------------------------------------------------------------------
async function postVoucher(sb: any, v: { series: string; vdate: string; vtext: string; vat_code?: string | null; period: string; source_ref: any; entries: any[]; confidence?: number; }) {
  let entries = (v.entries || []).map((e) => ({ account: String(e.account), debit: round2(e.debit || 0), credit: round2(e.credit || 0), text: e.text || v.vtext }))
    .filter((e) => e.debit > 0 || e.credit > 0);
  let dr = round2(entries.reduce((a, e) => a + e.debit, 0));
  let cr = round2(entries.reduce((a, e) => a + e.credit, 0));
  let diff = round2(cr - dr);
  if (Math.abs(diff) > 0.0001) {
    if (Math.abs(diff) <= 1.0) {
      if (diff > 0) entries.push({ account: '3740', debit: diff, credit: 0, text: 'Öresavrundning' });
      else entries.push({ account: '3740', debit: 0, credit: -diff, text: 'Öresavrundning' });
    } else {
      throw new Error('voucher unbalanced by ' + diff + ' SEK (dr=' + dr + ' cr=' + cr + ')');
    }
  }
  const row = { series: v.series, vdate: v.vdate, vtext: v.vtext, entries, vat_code: v.vat_code || null, period: v.period, source_ref: v.source_ref || null, posted: true, confidence: v.confidence ?? 1, source: 'edge' };
  const { data, error } = await sb.from('vouchers').insert(row).select('id').single();
  if (error) {
    if (error.code === '23505' && v.source_ref) {
      const { data: ex } = await sb.from('vouchers').select('id')
        .filter('source_ref->>type', 'eq', v.source_ref.type)
        .filter('source_ref->>id', 'eq', String(v.source_ref.id))
        .filter('source_ref->>period', 'eq', v.source_ref.period).maybeSingle();
      return { id: ex?.id || null, duplicate: true };
    }
    throw error;
  }
  return { id: data.id, duplicate: false };
}

async function eurSek(sb: any): Promise<number> {
  const { data } = await sb.from('orgs').select('settings').limit(1).maybeSingle();
  const r = data?.settings?.eur_sek;
  return (r && Number(r) > 0) ? Number(r) : 11.30;
}

async function nftAdmin(path: string, authToken?: string) {
  if (!authToken) return { ok: false, error: 'no_user_token' };
  const r = await fetch(NFT_FN + path, { headers: { apikey: NFT_ANON, Authorization: 'Bearer ' + authToken } });
  const t = await r.text();
  try { return JSON.parse(t); } catch (_) { return { ok: false, raw: t }; }
}

// invoice/bill line math → {net, vatByRate, vat, gross, lines}
function computeLines(lines: any[]) {
  const out: any[] = [], vatByRate: Record<string, { net: number; vat: number }> = {};
  let net = 0, vat = 0;
  for (const l of (lines || [])) {
    const qty = Number(l.qty ?? 1), price = Number(l.unit_price ?? l.amount_net ?? 0);
    const amount = round2(qty * price);
    const rate = Number(l.vat_rate ?? 25);
    const vamt = round2(amount * rate / 100);
    const acct = rate > 0 ? SALES[String(rate)] : zeroRateAccount(l.vat_code);
    out.push({ description: l.description || '', qty, unit_price: price, amount, vat_rate: rate, vat_amount: vamt, vat_code: l.vat_code || null, account: l.account || acct });
    const k = String(rate); vatByRate[k] = vatByRate[k] || { net: 0, vat: 0 };
    vatByRate[k].net = round2(vatByRate[k].net + amount); vatByRate[k].vat = round2(vatByRate[k].vat + vamt);
    net = round2(net + amount); vat = round2(vat + vamt);
  }
  return { lines: out, net, vat, gross: round2(net + vat), vatByRate };
}

// storage helpers
async function uploadDoc(sb: any, bucket: string, path: string, bytes: Uint8Array, contentType: string, docType: string, meta: any) {
  const up = await sb.storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
  if (up.error) throw up.error;
  const { data: doc, error } = await sb.from('documents').insert({ title: meta.title || path.split('/').pop(), doc_type: docType, file_meta: { bucket, path, size: bytes.length, mime: contentType, original: meta.original || null }, data: meta.data || {} }).select('id').single();
  if (error) throw error;
  return doc.id;
}
async function signedUrl(sb: any, bucket: string, path: string, expires = 3600) {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, expires);
  if (error) throw error;
  return data.signedUrl;
}
function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64;
  const bin = atob(clean); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// =====================================================================
async function route(resource: string, id: string | undefined, action: string | undefined, sb: any, req: Request, b: any, url: URL, ctx: any) {
  const m = req.method;
  const ok = (o: any) => ({ status: 200, body: Object.assign({ ok: true, configured: true }, o) });
  const bad = (e: string, s = 400) => ({ status: s, body: { ok: false, error: e } });
  const q = (k: string) => url.searchParams.get(k);

  // ---------------- BILLING PROFILE ----------------
  if (resource === 'billing-profile') {
    if (m === 'GET') {
      let { data: org } = await sb.from('orgs').select('*').limit(1).maybeSingle();
      if (!org) { const ins = await sb.from('orgs').insert({ name: 'Opulence Tech', country: 'SE', fiscal_currency: 'SEK', settings: {} }).select('*').single(); org = ins.data; }
      return ok({ org });
    }
    if (m === 'PUT') {
      let { data: org } = await sb.from('orgs').select('id,settings').limit(1).maybeSingle();
      const patch: any = {};
      ['name', 'logo_url', 'org_no', 'vat_no', 'city', 'country', 'fiscal_currency'].forEach((k) => { if (b[k] !== undefined) patch[k] = b[k]; });
      if (b.settings) patch.settings = Object.assign({}, org?.settings || {}, b.settings);
      if (!org) { const ins = await sb.from('orgs').insert(Object.assign({ name: b.name || 'Opulence Tech', country: 'SE', fiscal_currency: 'SEK' }, patch)).select('*').single(); return ok({ org: ins.data }); }
      patch.updated_at = new Date().toISOString();
      const { data, error } = await sb.from('orgs').update(patch).eq('id', org.id).select('*').single(); if (error) throw error;
      return ok({ org: data });
    }
  }

  // ---------------- CUSTOMERS ----------------
  if (resource === 'customers') {
    if (m === 'GET' && !id) { const { data } = await sb.from('customers').select('*').order('created_at', { ascending: false }).limit(500); return ok({ rows: data || [] }); }
    if (m === 'GET' && id) { const { data: c } = await sb.from('customers').select('*').eq('id', id).maybeSingle(); const { data: inv } = await sb.from('invoices').select('id,number,gross,currency,due_date,status').eq('customer_id', id).neq('status', 'paid').neq('status', 'void'); return ok({ customer: c, open_invoices: inv || [] }); }
    if (m === 'POST') { if (!b.name) return bad('name required'); const row = { name: b.name, data: Object.assign({ org_no: b.org_no || null, vat_no: b.vat_no || null, email: b.email || null, address: b.address || null, currency: b.currency || 'SEK' }, b.data || {}), segment: b.segment || null, status: 'active', source: 'manual' }; const { data, error } = await sb.from('customers').insert(row).select('*').single(); if (error) throw error; return ok({ customer: data }); }
    if (m === 'PUT' && id) { const patch: any = { updated_at: new Date().toISOString() }; if (b.name) patch.name = b.name; if (b.segment !== undefined) patch.segment = b.segment; if (b.data || b.org_no || b.vat_no || b.email || b.address) { const { data: cur } = await sb.from('customers').select('data').eq('id', id).maybeSingle(); patch.data = Object.assign({}, cur?.data || {}, b.data || {}, b.org_no !== undefined ? { org_no: b.org_no } : {}, b.vat_no !== undefined ? { vat_no: b.vat_no } : {}, b.email !== undefined ? { email: b.email } : {}, b.address !== undefined ? { address: b.address } : {}); } const { data, error } = await sb.from('customers').update(patch).eq('id', id).select('*').single(); if (error) throw error; return ok({ customer: data }); }
    if (m === 'DELETE' && id) { const { data: inv } = await sb.from('invoices').select('id').eq('customer_id', id).neq('status', 'draft').limit(1); if (inv && inv.length) return bad('has_invoices', 409); await sb.from('customers').update({ status: 'archived' }).eq('id', id); return ok({}); }
  }

  // ---------------- PARTNERS (suppliers) ----------------
  if (resource === 'partners') {
    if (m === 'GET' && !id) { const { data } = await sb.from('partners').select('*').order('created_at', { ascending: false }).limit(500); return ok({ rows: data || [] }); }
    if (m === 'POST') { if (!b.name) return bad('name required'); const row = { name: b.name, kind: b.kind || 'supplier', org_no: b.org_no || null, vat_no: b.vat_no || null, country: b.country || 'SE', address: b.address || null, primary_contact: b.primary_contact || null, tags: b.tags || [], data: b.data || {}, source: 'manual' }; const { data, error } = await sb.from('partners').insert(row).select('*').single(); if (error) throw error; return ok({ partner: data }); }
    if (m === 'PUT' && id) { const patch: any = { updated_at: new Date().toISOString() }; ['name', 'kind', 'org_no', 'vat_no', 'country', 'address', 'primary_contact'].forEach((k) => { if (b[k] !== undefined) patch[k] = b[k]; }); const { data, error } = await sb.from('partners').update(patch).eq('id', id).select('*').single(); if (error) throw error; return ok({ partner: data }); }
    if (m === 'DELETE' && id) { const { data: bl } = await sb.from('bills').select('id').eq('partner_id', id).neq('status', 'paid').limit(1); if (bl && bl.length) return bad('has_open_bills', 409); await sb.from('partners').delete().eq('id', id); return ok({}); }
  }

  // ---------------- INVOICES ----------------
  if (resource === 'invoices') {
    if (m === 'GET' && !id) {
      let qq = sb.from('invoices').select('*').order('created_at', { ascending: false }).limit(500);
      if (q('status')) qq = qq.eq('status', q('status')); if (q('customer_id')) qq = qq.eq('customer_id', q('customer_id')); if (q('period')) qq = qq.like('issue_date', q('period') + '%');
      const { data } = await qq; const { data: custs } = await sb.from('customers').select('id,name');
      const cmap: any = {}; (custs || []).forEach((c: any) => cmap[c.id] = c.name);
      const rows = (data || []).map((r: any) => ({ ...r, customer_name: cmap[r.customer_id] || '—' }));
      const totals = rows.reduce((a: any, r: any) => { a.net = round2(a.net + (r.net || 0)); a.vat = round2(a.vat + (r.vat || 0)); a.gross = round2(a.gross + (r.gross || 0)); a.by_status[r.status] = (a.by_status[r.status] || 0) + 1; return a; }, { net: 0, vat: 0, gross: 0, by_status: {} });
      return ok({ rows, totals });
    }
    if (m === 'GET' && id && !action) { const { data: inv } = await sb.from('invoices').select('*').eq('id', id).maybeSingle(); const { data: lines } = await sb.from('invoice_lines').select('*').eq('invoice_id', id).order('created_at', { ascending: true }); const { data: cust } = inv ? await sb.from('customers').select('*').eq('id', inv.customer_id).maybeSingle() : { data: null } as any; const { data: pays } = await sb.from('payments').select('*').eq('invoice_id', id); return ok({ invoice: inv, lines: lines || [], customer: cust, payments: pays || [] }); }
    if (m === 'POST' && !id) {
      if (!b.customer_id) return bad('customer_id required');
      const cur = b.currency || 'SEK'; const fx = cur === 'SEK' ? 1 : Number(b.fx_rate || await eurSek(sb));
      const c = computeLines(b.lines || []);
      const issue = b.issue_date || dayOf(); const terms = Number(b.payment_terms_days || 30);
      const due = b.due_date || dayOf(new Date(Date.now() + terms * 864e5).toISOString());
      const row = { customer_id: b.customer_id, currency: cur, net: c.net, vat: c.vat, gross: c.gross, fx_rate: fx, net_sek: round2(c.net * fx), vat_sek: round2(c.vat * fx), gross_sek: round2(c.gross * fx), status: 'draft', issue_date: issue, due_date: due, data: { vat_breakdown: c.vatByRate, our_reference: b.our_reference || null, your_reference: b.your_reference || null, notes: b.notes || null }, source: 'manual' };
      const { data: inv, error } = await sb.from('invoices').insert(row).select('*').single(); if (error) throw error;
      if (c.lines.length) await sb.from('invoice_lines').insert(c.lines.map((l: any) => ({ ...l, invoice_id: inv.id })));
      return ok({ invoice: inv, lines: c.lines });
    }
    if (m === 'PUT' && id && !action) {
      const { data: inv } = await sb.from('invoices').select('status,currency,fx_rate').eq('id', id).maybeSingle();
      if (!inv) return bad('not found', 404); if (inv.status !== 'draft') return bad('only drafts editable', 409);
      const cur = b.currency || inv.currency || 'SEK'; const fx = cur === 'SEK' ? 1 : Number(b.fx_rate || inv.fx_rate || await eurSek(sb));
      const patch: any = { updated_at: new Date().toISOString() };
      if (b.customer_id) patch.customer_id = b.customer_id; if (b.issue_date) patch.issue_date = b.issue_date; if (b.due_date) patch.due_date = b.due_date; patch.currency = cur; patch.fx_rate = fx;
      if (b.lines) { const c = computeLines(b.lines); patch.net = c.net; patch.vat = c.vat; patch.gross = c.gross; patch.net_sek = round2(c.net * fx); patch.vat_sek = round2(c.vat * fx); patch.gross_sek = round2(c.gross * fx); const { data: cur2 } = await sb.from('invoices').select('data').eq('id', id).maybeSingle(); patch.data = Object.assign({}, cur2?.data || {}, { vat_breakdown: c.vatByRate }, b.notes !== undefined ? { notes: b.notes } : {}); await sb.from('invoice_lines').delete().eq('invoice_id', id); if (c.lines.length) await sb.from('invoice_lines').insert(c.lines.map((l: any) => ({ ...l, invoice_id: id }))); }
      const { data, error } = await sb.from('invoices').update(patch).eq('id', id).select('*').single(); if (error) throw error;
      const { data: lines } = await sb.from('invoice_lines').select('*').eq('invoice_id', id);
      return ok({ invoice: data, lines: lines || [] });
    }
    if (m === 'DELETE' && id) { const { data: inv } = await sb.from('invoices').select('status').eq('id', id).maybeSingle(); if (inv && inv.status !== 'draft') return bad('only drafts deletable', 409); await sb.from('invoice_lines').delete().eq('invoice_id', id); await sb.from('invoices').delete().eq('id', id); return ok({}); }

    // actions on /invoices/:id/<action>
    if (m === 'POST' && id && action === 'send') {
      const { data: inv } = await sb.from('invoices').select('*').eq('id', id).maybeSingle(); if (!inv) return bad('not found', 404);
      let number = inv.number;
      if (!number) { const { data: n, error: ne } = await sb.rpc('next_invoice_number', { p_series: 'AR' }); if (ne) throw ne; number = n; }
      // accrual voucher at issue (DR 1510 / CR sales / CR moms)
      const { data: lines } = await sb.from('invoice_lines').select('*').eq('invoice_id', id);
      const fx = inv.fx_rate || 1; const entries: any[] = [];
      for (const l of (lines || [])) { entries.push({ account: l.account || (l.vat_rate > 0 ? SALES[String(l.vat_rate)] : zeroRateAccount(l.vat_code)), debit: 0, credit: round2(l.amount * fx), text: l.description }); if (l.vat_rate > 0) entries.push({ account: VAT_OUT[String(l.vat_rate)], debit: 0, credit: round2(l.vat_amount * fx), text: 'Moms ' + l.vat_rate + '%' }); }
      entries.push({ account: '1510', debit: round2(inv.gross * fx), credit: 0, text: 'Kundfordran ' + number });
      const per = periodOf(inv.issue_date); const vd = inv.issue_date || dayOf();
      const v = await postVoucher(sb, { series: 'K', vdate: vd, vtext: 'Faktura ' + number, vat_code: dominantVat(lines), period: per, source_ref: { type: 'invoice_issue', id: inv.id, period: per }, entries });
      const patch: any = { number, status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      if (v.id) patch.booked_voucher_id = v.id;
      const { data: updated, error } = await sb.from('invoices').update(patch).eq('id', id).select('*').single(); if (error) throw error;
      return ok({ invoice: updated, voucher_id: v.id });
    }
    if (m === 'POST' && id && action === 'mark-paid') {
      const { data: inv } = await sb.from('invoices').select('*').eq('id', id).maybeSingle(); if (!inv) return bad('not found', 404);
      const { data: prevPays } = await sb.from('payments').select('amount').eq('invoice_id', id).eq('direction', 'in');
      const paidSoFar = (prevPays || []).reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
      const remaining = round2((inv.gross || 0) - paidSoFar);
      const amount = round2(b.amount != null ? Number(b.amount) : remaining);
      if (amount <= 0) return bad('nothing to pay');
      const payFx = inv.currency === 'SEK' ? 1 : Number(b.fx_rate || inv.fx_rate || 1);
      const amountSek = round2(amount * payFx);
      const carryingSek = round2((amount / (inv.gross || amount)) * (inv.gross_sek || inv.gross || amount));
      const occurred = b.paid_at || new Date().toISOString();
      const { data: pay } = await sb.from('payments').insert({ direction: 'in', amount, currency: inv.currency || 'SEK', party_id: inv.customer_id, party_type: 'customer', method: b.method || 'bankgiro', reference: b.reference || inv.number, invoice_id: id, occurred_at: occurred, data: { fx_rate: payFx, amount_sek: amountSek }, source: 'manual' }).select('*').single();
      const entries: any[] = [{ account: '1930', debit: amountSek, credit: 0, text: 'Inbetalning ' + (inv.number || '') }, { account: '1510', debit: 0, credit: carryingSek, text: 'Kundfordran kvittas' }];
      const fxDiff = round2(amountSek - carryingSek);
      if (fxDiff > 0) entries.push({ account: '3960', debit: 0, credit: fxDiff, text: 'Valutakursvinst' });
      else if (fxDiff < 0) entries.push({ account: '7960', debit: -fxDiff, credit: 0, text: 'Valutakursförlust' });
      const per = periodOf(occurred);
      const v = await postVoucher(sb, { series: 'B', vdate: dayOf(occurred), vtext: 'Betalning faktura ' + (inv.number || ''), period: per, source_ref: { type: 'invoice_payment', id: pay.id, period: per }, entries });
      if (v.id) await sb.from('payments').update({ booked_voucher_id: v.id }).eq('id', pay.id);
      const newPaid = round2(paidSoFar + amount);
      const patch: any = { updated_at: new Date().toISOString() };
      if (newPaid >= (inv.gross || 0) - 0.005) { patch.status = 'paid'; patch.paid_at = occurred; }
      await sb.from('invoices').update(patch).eq('id', id);
      const { data: updated } = await sb.from('invoices').select('*').eq('id', id).maybeSingle();
      return ok({ invoice: updated, payment: pay, voucher_id: v.id });
    }
    if (m === 'POST' && id && action === 'void') {
      const { data: inv } = await sb.from('invoices').select('*').eq('id', id).maybeSingle(); if (!inv) return bad('not found', 404);
      if (inv.booked_voucher_id) { const { data: orig } = await sb.from('vouchers').select('*').eq('id', inv.booked_voucher_id).maybeSingle(); if (orig) { const rev = (orig.entries || []).map((e: any) => ({ account: e.account, debit: e.credit, credit: e.debit, text: 'Makulering: ' + (e.text || '') })); const per = periodOf(); await postVoucher(sb, { series: 'K', vdate: dayOf(), vtext: 'Makulering faktura ' + (inv.number || ''), period: per, source_ref: { type: 'invoice_void', id: inv.id, period: per }, entries: rev }); } }
      await sb.from('invoices').update({ status: 'void', data: Object.assign({}, inv.data, { void_reason: b.reason || null }) }).eq('id', id);
      return ok({});
    }
    // PDF: client sends base64 of the pdf-lib bytes; server validates + stores
    if (m === 'POST' && id && action === 'pdf') {
      if (!b.base64) return bad('base64 required');
      const bytes = b64ToBytes(b.base64);
      if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return bad('not a PDF'); // %PDF
      const { data: inv } = await sb.from('invoices').select('number,issue_date').eq('id', id).maybeSingle();
      const year = (inv?.issue_date || dayOf()).slice(0, 4);
      const path = `${year}/${id}/${crypto.randomUUID()}.pdf`;
      const docId = await uploadDoc(sb, 'invoices', path, bytes, 'application/pdf', 'invoice', { title: 'Faktura ' + (inv?.number || ''), data: { invoice_id: id } });
      await sb.from('invoices').update({ pdf_doc_id: docId }).eq('id', id);
      const signed = await signedUrl(sb, 'invoices', path);
      return ok({ pdf_doc_id: docId, pdf_url: signed });
    }
    if (m === 'GET' && id && action === 'pdf') {
      const { data: inv } = await sb.from('invoices').select('pdf_doc_id').eq('id', id).maybeSingle();
      if (!inv?.pdf_doc_id) return bad('no pdf', 404);
      const { data: doc } = await sb.from('documents').select('file_meta').eq('id', inv.pdf_doc_id).maybeSingle();
      const fm = doc?.file_meta; if (!fm) return bad('no pdf', 404);
      return ok({ pdf_url: await signedUrl(sb, fm.bucket, fm.path) });
    }
  }

  // ---------------- BILLS (incoming supplier invoices) ----------------
  if (resource === 'bills') {
    if (m === 'GET' && !id) { let qq = sb.from('bills').select('*').order('created_at', { ascending: false }).limit(500); if (q('status')) qq = qq.eq('status', q('status')); if (q('partner_id')) qq = qq.eq('partner_id', q('partner_id')); const { data } = await qq; const { data: ps } = await sb.from('partners').select('id,name'); const pmap: any = {}; (ps || []).forEach((p: any) => pmap[p.id] = p.name); const rows = (data || []).map((r: any) => ({ ...r, partner_name: pmap[r.partner_id] || '—' })); const totals = rows.reduce((a: any, r: any) => { a.net = round2(a.net + (r.net || 0)); a.vat = round2(a.vat + (r.vat || 0)); a.gross = round2(a.gross + (r.gross || 0)); a.by_status[r.status] = (a.by_status[r.status] || 0) + 1; return a; }, { net: 0, vat: 0, gross: 0, by_status: {} }); return ok({ rows, totals }); }
    if (m === 'GET' && id && !action) { const { data: bill } = await sb.from('bills').select('*').eq('id', id).maybeSingle(); let attachment_url = null; if (bill?.attachment_doc_id) { const { data: doc } = await sb.from('documents').select('file_meta').eq('id', bill.attachment_doc_id).maybeSingle(); if (doc?.file_meta) attachment_url = await signedUrl(sb, doc.file_meta.bucket, doc.file_meta.path); } return ok({ bill, attachment_url }); }
    if (m === 'POST' && !id) {
      const cur = b.currency || 'SEK'; const fx = cur === 'SEK' ? 1 : Number(b.fx_rate || await eurSek(sb));
      const rc = !!b.reverse_charge;
      const c = computeLines((b.lines || []).map((l: any) => ({ ...l, vat_rate: rc ? 0 : (l.vat_rate ?? 25) })));
      // for reverse charge gross == net (no supplier VAT); store computed self-VAT in data
      const selfVat = rc ? round2(c.net * 0.25) : 0;
      const net = c.net, vat = rc ? 0 : c.vat, gross = rc ? c.net : c.gross;
      const issue = b.issue_date || dayOf();
      const row = { partner_id: b.partner_id || null, number: b.supplier_number || b.number || null, issue_date: issue, due_date: b.due_date || null, net, vat, gross, currency: cur, fx_rate: fx, net_sek: round2(net * fx), vat_sek: round2(vat * fx), gross_sek: round2(gross * fx), status: 'unpaid', reverse_charge: rc, category: b.category || null, expense_account: b.expense_account || null, data: { lines: c.lines, self_vat: selfVat, notes: b.notes || null }, source: 'manual' };
      const { data: bill, error } = await sb.from('bills').insert(row).select('*').single(); if (error) throw error;
      // register voucher (accrual)
      const expAcc = b.expense_account || expenseAccountFor(b.category);
      const entries: any[] = [];
      for (const l of c.lines) entries.push({ account: l.account && l.account.startsWith('3') ? expAcc : (b.expense_account || expAcc), debit: round2(l.amount * fx), credit: 0, text: l.description });
      // collapse: simpler — one expense debit for net
      const entries2: any[] = [{ account: expAcc, debit: round2(net * fx), credit: 0, text: bill.number || 'Leverantörsfaktura' }];
      if (rc) { entries2.push({ account: '2645', debit: round2(selfVat * fx), credit: 0, text: 'Beräknad ingående moms' }); entries2.push({ account: '2614', debit: 0, credit: round2(selfVat * fx), text: 'Utgående moms omvänd' }); entries2.push({ account: '2440', debit: 0, credit: round2(net * fx), text: 'Leverantörsskuld' }); }
      else { if (vat > 0) entries2.push({ account: '2641', debit: round2(vat * fx), credit: 0, text: 'Ingående moms' }); entries2.push({ account: '2440', debit: 0, credit: round2(gross * fx), text: 'Leverantörsskuld' }); }
      const per = periodOf(issue);
      const v = await postVoucher(sb, { series: 'L', vdate: issue, vtext: 'Leverantörsfaktura ' + (bill.number || ''), period: per, source_ref: { type: 'bill_receive', id: bill.id, period: per }, entries: entries2 });
      if (v.id) await sb.from('bills').update({ booked_voucher_id: v.id }).eq('id', bill.id);
      return ok({ bill, voucher_id: v.id });
    }
    if (m === 'PUT' && id && !action) { const { data: bl } = await sb.from('bills').select('status').eq('id', id).maybeSingle(); if (bl?.status === 'paid') return bad('paid bills locked', 409); const patch: any = { updated_at: new Date().toISOString() }; ['number', 'due_date', 'category', 'expense_account'].forEach((k) => { if (b[k] !== undefined) patch[k] = b[k]; }); const { data, error } = await sb.from('bills').update(patch).eq('id', id).select('*').single(); if (error) throw error; return ok({ bill: data }); }
    if (m === 'DELETE' && id) { const { data: bl } = await sb.from('bills').select('status').eq('id', id).maybeSingle(); if (bl?.status === 'paid') return bad('paid bills locked', 409); await sb.from('bills').delete().eq('id', id); return ok({}); }
    if (m === 'POST' && id && action === 'attachment') {
      if (!b.base64) return bad('base64 required');
      const bytes = b64ToBytes(b.base64); const ct = b.content_type || 'application/pdf';
      if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(ct)) return bad('unsupported type');
      const { data: bill } = await sb.from('bills').select('issue_date').eq('id', id).maybeSingle();
      const year = (bill?.issue_date || dayOf()).slice(0, 4); const ext = ct === 'application/pdf' ? 'pdf' : ct.split('/')[1];
      const path = `${year}/${id}/${crypto.randomUUID()}.${ext}`;
      const docId = await uploadDoc(sb, 'bills', path, bytes, ct, 'bill', { title: b.filename || 'Bilaga', original: b.filename || null, data: { bill_id: id } });
      await sb.from('bills').update({ attachment_doc_id: docId }).eq('id', id);
      return ok({ document_id: docId, url: await signedUrl(sb, 'bills', path) });
    }
    if (m === 'POST' && id && action === 'mark-paid') {
      const { data: bill } = await sb.from('bills').select('*').eq('id', id).maybeSingle(); if (!bill) return bad('not found', 404);
      const amount = round2(b.amount != null ? Number(b.amount) : bill.gross);
      const payFx = bill.currency === 'SEK' ? 1 : Number(b.fx_rate || bill.fx_rate || 1);
      const amountSek = round2(amount * payFx); const carryingSek = round2((amount / (bill.gross || amount)) * (bill.gross_sek || bill.gross || amount));
      const occurred = b.paid_at || new Date().toISOString();
      const { data: pay } = await sb.from('payments').insert({ direction: 'out', amount, currency: bill.currency || 'SEK', party_id: bill.partner_id, party_type: 'partner', method: b.method || 'bankgiro', reference: b.reference || bill.number, bill_id: id, occurred_at: occurred, data: { fx_rate: payFx, amount_sek: amountSek }, source: 'manual' }).select('*').single();
      const entries: any[] = [{ account: '2440', debit: carryingSek, credit: 0, text: 'Leverantörsskuld kvittas' }, { account: '1930', debit: 0, credit: amountSek, text: 'Utbetalning ' + (bill.number || '') }];
      const fxDiff = round2(carryingSek - amountSek);
      if (fxDiff > 0) entries.push({ account: '3960', debit: 0, credit: fxDiff, text: 'Valutakursvinst' });
      else if (fxDiff < 0) entries.push({ account: '7960', debit: -fxDiff, credit: 0, text: 'Valutakursförlust' });
      const per = periodOf(occurred);
      const v = await postVoucher(sb, { series: 'B', vdate: dayOf(occurred), vtext: 'Betalning leverantör ' + (bill.number || ''), period: per, source_ref: { type: 'bill_payment', id: pay.id, period: per }, entries });
      if (v.id) await sb.from('payments').update({ booked_voucher_id: v.id }).eq('id', pay.id);
      await sb.from('bills').update({ status: 'paid', paid_at: occurred }).eq('id', id);
      const { data: updated } = await sb.from('bills').select('*').eq('id', id).maybeSingle();
      return ok({ bill: updated, payment: pay, voucher_id: v.id });
    }
  }

  // ---------------- EXPENSES (costs) ----------------
  if (resource === 'expenses') {
    if (m === 'GET') { const { data } = await sb.from('costs').select('*').order('occurred_at', { ascending: false, nullsFirst: false }).limit(500); const rows = data || []; const recurring = rows.filter((r: any) => r.recurrence && r.recurrence !== 'once'); return ok({ rows, recurring }); }
    if (m === 'POST' && !id) {
      const cur = b.currency || 'SEK'; const fx = cur === 'SEK' ? 1 : Number(b.fx_rate || await eurSek(sb));
      const amount = round2(Number(b.amount || 0)); const rate = Number(b.vat_rate ?? 25); const vat = round2(amount * rate / 100);
      const occurred = b.occurred_at || dayOf(); const recurrence = b.recurrence || 'once';
      const acct = b.account || expenseAccountFor(b.category);
      const row = { description: b.description || '', amount: round2(amount + vat), currency: cur, category: b.category || null, cost_type: 'expense', recurrence, interval: String(b.interval || 1), vendor_partner_id: b.vendor_partner_id || null, vat_rate: rate, next_charge_at: recurrence !== 'once' ? (b.next_charge_at || occurred) : null, occurred_at: occurred, data: { net: amount, vat, account: acct, fx_rate: fx, paid: b.paid !== false }, source: 'manual' };
      const { data: cost, error } = await sb.from('costs').insert(row).select('*').single(); if (error) throw error;
      const per = periodOf(occurred); const paid = b.paid !== false;
      const entries: any[] = [{ account: acct, debit: round2(amount * fx), credit: 0, text: cost.description || 'Kostnad' }];
      if (vat > 0) entries.push({ account: '2641', debit: round2(vat * fx), credit: 0, text: 'Ingående moms' });
      entries.push({ account: paid ? '1930' : '2440', debit: 0, credit: round2((amount + vat) * fx), text: paid ? 'Betalt' : 'Leverantörsskuld' });
      const v = await postVoucher(sb, { series: 'M', vdate: occurred, vtext: cost.description || 'Kostnad', period: per, source_ref: { type: 'cost', id: cost.id, period: per }, entries });
      if (v.id) await sb.from('costs').update({ booked_voucher_id: v.id }).eq('id', cost.id);
      return ok({ cost, voucher_id: v.id });
    }
    if (m === 'PUT' && id) { const patch: any = { updated_at: new Date().toISOString() }; ['description', 'category', 'recurrence', 'interval', 'next_charge_at', 'vat_rate'].forEach((k) => { if (b[k] !== undefined) patch[k] = b[k]; }); const { data, error } = await sb.from('costs').update(patch).eq('id', id).select('*').single(); if (error) throw error; return ok({ cost: data }); }
    if (m === 'DELETE' && id) { await sb.from('costs').delete().eq('id', id); return ok({}); }
  }

  // ---------------- PAYMENTS (read) ----------------
  if (resource === 'payments' && m === 'GET') {
    let qq = sb.from('payments').select('*').order('occurred_at', { ascending: false }).limit(500);
    if (q('direction')) qq = qq.eq('direction', q('direction'));
    const { data } = await qq; const rows = data || [];
    const totals = rows.reduce((a: any, p: any) => { const s = Number(p.data?.amount_sek || p.amount || 0); if (p.direction === 'in') a.in = round2(a.in + s); else a.out = round2(a.out + s); return a; }, { in: 0, out: 0 });
    totals.net = round2(totals.in - totals.out);
    return ok({ rows, totals });
  }

  // ---------------- VOUCHERS / LEDGER ----------------
  if (resource === 'vouchers') {
    if (m === 'GET' && id !== 'trial') { let qq = sb.from('vouchers').select('*').order('vdate', { ascending: false }).limit(500); if (q('period')) qq = qq.eq('period', q('period')); if (q('series')) qq = qq.eq('series', q('series')); const { data } = await qq; const rows = data || []; const totals = rows.reduce((a: any, v: any) => { (v.entries || []).forEach((e: any) => { a.debit = round2(a.debit + (e.debit || 0)); a.credit = round2(a.credit + (e.credit || 0)); }); return a; }, { debit: 0, credit: 0 }); return ok({ rows, totals }); }
    if (m === 'POST' && !id) { if (!Array.isArray(b.entries)) return bad('entries required'); const dr = round2(b.entries.reduce((a: number, e: any) => a + (e.debit || 0), 0)); const cr = round2(b.entries.reduce((a: number, e: any) => a + (e.credit || 0), 0)); if (Math.abs(dr - cr) > 0.005) return bad('unbalanced: debit ' + dr + ' != credit ' + cr); const per = b.period || periodOf(b.date); const v = await postVoucher(sb, { series: b.series || 'M', vdate: b.date || dayOf(), vtext: b.text || 'Manuell verifikation', period: per, source_ref: b.source_ref || { type: 'manual', id: crypto.randomUUID(), period: per }, entries: b.entries }); return ok({ voucher_id: v.id }); }
  }
  if (resource === 'ledger' && m === 'GET') {
    const period = q('period'); const year = q('year');
    let qq = sb.from('vouchers').select('entries,period'); if (period) qq = qq.eq('period', period); else if (year) qq = qq.like('period', year + '%');
    const { data } = await qq; const { data: accs } = await sb.from('accounts').select('number,name,type');
    const amap: any = {}; (accs || []).forEach((a: any) => amap[a.number] = a);
    const acc: any = {};
    (data || []).forEach((v: any) => (v.entries || []).forEach((e: any) => { const a = acc[e.account] || (acc[e.account] = { account: e.account, name: amap[e.account]?.name || '', type: amap[e.account]?.type || '', debit: 0, credit: 0 }); a.debit = round2(a.debit + (e.debit || 0)); a.credit = round2(a.credit + (e.credit || 0)); }));
    const accounts = Object.values(acc).map((a: any) => ({ ...a, balance: round2(a.debit - a.credit) })).sort((x: any, y: any) => x.account.localeCompare(y.account));
    let revenue = 0, costs = 0;
    accounts.forEach((a: any) => { if (a.type === 'income') revenue = round2(revenue + (a.credit - a.debit)); if (a.type === 'expense') costs = round2(costs + (a.debit - a.credit)); });
    return ok({ accounts, result: { revenue, costs, profit: round2(revenue - costs) } });
  }

  // ---------------- EXPORT ----------------
  if (resource === 'export' && m === 'GET') {
    const type = q('type') || 'csv';
    if (type === 'party') return exportParty(sb, q('party_type') || 'dealer', q('party_id') || '', q('period') || '', ctx);
    const period = q('period'); const year = q('year') || (period ? period.slice(0, 4) : String(new Date().getFullYear()));
    let qq = sb.from('vouchers').select('*').order('vdate', { ascending: true }); if (period) qq = qq.eq('period', period); else qq = qq.like('period', year + '%');
    const { data: vouchers } = await qq; const { data: accs } = await sb.from('accounts').select('number,name'); const { data: org } = await sb.from('orgs').select('name,org_no').limit(1).maybeSingle();
    const amap: any = {}; (accs || []).forEach((a: any) => amap[a.number] = a.name);
    if (type === 'sie') return { raw: { content: buildSIE(vouchers || [], amap, org, year), contentType: 'text/plain; charset=utf-8', filename: 'bifrost-' + year + '.se' } } as any;
    return { raw: { content: buildCSV(vouchers || [], amap), contentType: 'text/csv; charset=utf-8', filename: 'bifrost-' + (period || year) + '.csv' } } as any;
  }

  // ---------------- RECONCILE (automation) ----------------
  if (resource === 'reconcile' && m === 'POST') {
    const period = b.period || periodOf();
    const result: any = { period, materialized_expenses: [], platform_revenue: null, overdue_flagged: [] };
    // 1) recurring expenses due
    const endOfPeriod = period + '-28';
    const { data: recurs } = await sb.from('costs').select('*').neq('recurrence', 'once').not('next_charge_at', 'is', null).lte('next_charge_at', endOfPeriod);
    for (const cost of (recurs || [])) {
      const per = periodOf(cost.next_charge_at); const net = Number(cost.data?.net ?? (cost.amount / (1 + (cost.vat_rate || 0) / 100))); const vat = round2(cost.amount - net); const acct = cost.data?.account || expenseAccountFor(cost.category);
      const entries: any[] = [{ account: acct, debit: round2(net), credit: 0, text: cost.description }];
      if (vat > 0) entries.push({ account: '2641', debit: vat, credit: 0, text: 'Ingående moms' });
      entries.push({ account: '1930', debit: 0, credit: round2(cost.amount), text: 'Betalt (' + cost.recurrence + ')' });
      const v = await postVoucher(sb, { series: 'M', vdate: cost.next_charge_at, vtext: cost.description + ' (' + cost.recurrence + ')', period: per, source_ref: { type: 'cost', id: cost.id, period: per }, entries });
      if (!v.duplicate) result.materialized_expenses.push({ cost_id: cost.id, voucher_id: v.id, amount: cost.amount });
      // advance next_charge_at by interval
      const next = advanceDate(cost.next_charge_at, cost.recurrence, Number(cost.interval || 1));
      await sb.from('costs').update({ next_charge_at: next }).eq('id', cost.id);
    }
    // 2) import platform revenue (money to us) — needs the owner's NFT token
    if (ctx.authToken) {
      const sales = await nftAdmin('/sales-raw?period=' + period, ctx.authToken);
      if (sales && sales.ok && Array.isArray(sales.sales)) {
        const rate = await eurSek(sb); let imported = 0, fees = 0, vids: string[] = [];
        for (const s of sales.sales) {
          const feeEur = Number(s.platform_fee_eur || 0); if (feeEur <= 0) continue;
          const feeSek = round2(feeEur * rate); const per = periodOf(s.created_at);
          const v = await postVoucher(sb, { series: 'P', vdate: dayOf(s.created_at), vtext: 'Plattformsavgift (NFT) ' + (s.id || ''), vat_code: 'NONE', period: per, source_ref: { type: 'platform_import', id: s.id, period: per, fx: rate, eur: feeEur }, entries: [{ account: '1930', debit: feeSek, credit: 0, text: 'Plattformsavgift' }, { account: '3990', debit: 0, credit: feeSek, text: 'Plattformsavgift (NFT)' }] });
          if (!v.duplicate && v.id) { imported++; fees = round2(fees + feeSek); vids.push(v.id); }
        }
        result.platform_revenue = { imported, fees_sek: fees, fx_rate: rate, sales_count: sales.sales.length };
      } else { result.platform_revenue = { skipped: true, reason: sales?.error || 'nft_unavailable' }; }
    } else { result.platform_revenue = { skipped: true, reason: 'no_user_token' }; }
    // 3) overdue flag
    const today = dayOf();
    const { data: overdue } = await sb.from('invoices').select('id,data').eq('status', 'sent').lt('due_date', today);
    for (const inv of (overdue || [])) { await sb.from('invoices').update({ data: Object.assign({}, inv.data, { overdue: true }) }).eq('id', inv.id); result.overdue_flagged.push(inv.id); }
    return ok(result);
  }

  // ---------------- VITALS (employee scope) ----------------
  if (resource === 'vitals') {
    const target = (ctx.tier === 'ADMIN' && (b.person_id || q('person_id'))) ? (b.person_id || q('person_id')) : ctx.uid;
    if (!target) return bad('no person');
    if (ctx.tier !== 'ADMIN' && target !== ctx.uid) return bad('forbidden', 403);

    if (id === 'body' && m === 'GET') { const { data: p } = await sb.from('profiles').select('body').eq('id', target).maybeSingle(); return ok({ body: p?.body || {} }); }
    if (id === 'body' && m === 'PUT') { const { data: p } = await sb.from('profiles').select('body').eq('id', target).maybeSingle(); const body = Object.assign({}, p?.body || {}); ['weight_kg', 'height_cm', 'age', 'sex', 'goal', 'activity'].forEach((k) => { if (b[k] !== undefined) body[k] = b[k]; }); if (body.weight_kg && body.height_cm && body.age) body.bmr = Math.round(10 * body.weight_kg + 6.25 * body.height_cm - 5 * body.age + (body.sex === 'female' ? -161 : 5)); await sb.from('profiles').update({ body, updated_at: new Date().toISOString() }).eq('id', target); return ok({ body }); }
    if (id === 'samples' && m === 'GET') { let qq = sb.from('vitals_samples').select('*').eq('person_id', target).order('taken_at', { ascending: false }).limit(2000); if (q('kind')) qq = qq.eq('kind', q('kind')); if (q('from')) qq = qq.gte('taken_at', q('from')); const { data } = await qq; return ok({ samples: data || [] }); }
    if (id === 'samples' && m === 'POST') { const rows = (b.samples || []).map((s: any) => ({ person_id: target, kind: s.kind, value: s.value, unit: s.unit || null, taken_at: s.taken_at || new Date().toISOString(), device_source: s.device_source || 'manual', data: s.data || {} })); if (!rows.length) return bad('no samples'); const { data, error } = await sb.from('vitals_samples').insert(rows).select('id'); if (error) throw error; return ok({ inserted: data?.length || 0 }); }
    if (id === 'today' && m === 'GET') {
      const startUTC = new Date(dayOf() + 'T00:00:00+02:00').toISOString();
      const { data: samples } = await sb.from('vitals_samples').select('kind,value').eq('person_id', target).gte('taken_at', startUTC);
      const { data: prof } = await sb.from('profiles').select('body').eq('id', target).maybeSingle();
      const { data: wos } = await sb.from('workouts').select('calories,performed_at').eq('person_id', target).gte('performed_at', startUTC);
      const body = prof?.body || {}; const sum = (k: string) => (samples || []).filter((s: any) => s.kind === k).reduce((a: number, s: any) => a + Number(s.value || 0), 0);
      const latest = (k: string) => { const f = (samples || []).filter((s: any) => s.kind === k); return f.length ? Number(f[f.length - 1].value) : null; };
      const steps = sum('steps'); const activeFromSamples = sum('calories_active'); const workoutKcal = (wos || []).reduce((a: number, w: any) => a + Number(w.calories || 0), 0);
      const bmr = body.bmr || (body.weight_kg && body.height_cm && body.age ? Math.round(10 * body.weight_kg + 6.25 * body.height_cm - 5 * body.age + (body.sex === 'female' ? -161 : 5)) : null);
      const baseMult = 1.2; // sedentary baseline; movement added explicitly below
      const stepKcal = round2(steps * (body.weight_kg ? body.weight_kg * 0.0005 : 0.04)); // ~0.04 kcal/step
      const activeKcal = Math.max(activeFromSamples, round2(stepKcal + workoutKcal));
      const burned = bmr ? Math.round(bmr * baseMult + activeKcal) : null;
      const goal = body.goal || 'maintain'; const adj = goal === 'cut' ? -500 : goal === 'gain' ? 350 : 0;
      const budget = burned != null ? burned + adj : null;
      return ok({ steps, calories_active: round2(activeKcal), bmr, calories_burned: burned, calorie_budget: budget, goal, recovery: latest('recovery'), hrv: latest('hrv'), resting_hr: latest('resting_hr'), sleep_score: latest('sleep_score'), workouts: (wos || []).length });
    }
    if (id === 'workouts' && m === 'GET') { const { data } = await sb.from('workouts').select('*').eq('person_id', target).order('performed_at', { ascending: false }).limit(200); return ok({ workouts: data || [] }); }
    if (id === 'workouts' && m === 'POST') { const row = { person_id: target, type: b.type || 'workout', performed_at: b.performed_at || new Date().toISOString(), duration_min: b.duration_min || null, calories: b.calories || null, distance_m: b.distance_m || null, note: b.note || null, source: 'manual', data: b.data || {} }; const { data, error } = await sb.from('workouts').insert(row).select('*').single(); if (error) throw error; return ok({ workout: data }); }
    if (id === 'workouts' && m === 'DELETE' && action) { await sb.from('workouts').delete().eq('id', action).eq('person_id', target); return ok({}); }
    if (id === 'connections' && m === 'GET') { const { data } = await sb.from('wearable_connections').select('provider,status,expires_at,created_at').eq('person_id', target); return ok({ connections: data || [] }); }
  }

  return { status: 404, body: { ok: false, error: 'unknown route: ' + resource } };
}

// ---------------- helpers ----------------
function dominantVat(lines: any[]): string {
  const rates = (lines || []).map((l) => Number(l.vat_rate)); if (rates.includes(25)) return 'SE25'; if (rates.includes(12)) return 'SE12'; if (rates.includes(6)) return 'SE06'; return 'SE00';
}
function expenseAccountFor(category?: string): string {
  const map: Record<string, string> = { hosting: '6230', saas: '6230', software: '6230', it: '6540', rent: '5010', lokal: '5010', supplies: '5460', material: '5460', inventory: '5410', insurance: '6310', bank: '6570', phone: '6200', tele: '6200', marketing: '6090', license: '6910', royalty: '6910', goods: '4000' };
  return map[String(category || '').toLowerCase()] || '6990';
}
function advanceDate(date: string, recurrence: string, interval: number): string {
  const d = new Date(date + 'T12:00:00Z');
  if (recurrence === 'monthly') d.setUTCMonth(d.getUTCMonth() + interval);
  else if (recurrence === 'quarterly') d.setUTCMonth(d.getUTCMonth() + 3 * interval);
  else if (recurrence === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + interval);
  return d.toISOString().slice(0, 10);
}
function csvCell(v: any): string { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function buildCSV(vouchers: any[], amap: any): string {
  const head = ['period', 'voucher_series', 'voucher_date', 'text', 'vat_code', 'account', 'account_name', 'debit_sek', 'credit_sek', 'source_type', 'source_id'];
  const lines = [head.join(',')];
  vouchers.forEach((v) => (v.entries || []).forEach((e: any) => {
    lines.push([v.period, v.series, v.vdate, v.vtext, v.vat_code || '', e.account, amap[e.account] || '', (e.debit || 0).toFixed(2), (e.credit || 0).toFixed(2), v.source_ref?.type || '', v.source_ref?.id || ''].map(csvCell).join(','));
  }));
  let dr = 0, cr = 0; vouchers.forEach((v) => (v.entries || []).forEach((e: any) => { dr += e.debit || 0; cr += e.credit || 0; }));
  lines.push(['', '', '', 'SUMMA', '', '', '', dr.toFixed(2), cr.toFixed(2), '', ''].map(csvCell).join(','));
  return lines.join('\n');
}
function buildSIE(vouchers: any[], amap: any, org: any, year: string): string {
  const used = new Set<string>(); vouchers.forEach((v) => (v.entries || []).forEach((e: any) => used.add(e.account)));
  const L: string[] = [];
  L.push('#FLAGGA 0'); L.push('#PROGRAM "bifrost" 1.0'); L.push('#FORMAT PC8'); L.push('#GEN ' + year + '0101'); L.push('#SIETYP 4');
  L.push('#FNAMN "' + (org?.name || 'Opulence Tech') + '"'); if (org?.org_no) L.push('#ORGNR ' + org.org_no);
  L.push('#KPTYP BAS2014'); L.push('#VALUTA SEK'); L.push('#RAR 0 ' + year + '0101 ' + year + '1231');
  Array.from(used).sort().forEach((a) => L.push('#KONTO ' + a + ' "' + (amap[a] || a) + '"'));
  let n = 0;
  vouchers.forEach((v) => { n++; const d = (v.vdate || (v.period + '-01')).replace(/-/g, ''); L.push('#VER ' + v.series + ' ' + n + ' ' + d + ' "' + String(v.vtext || '').replace(/"/g, "'") + '"'); L.push('{'); (v.entries || []).forEach((e: any) => { const amt = round2((e.debit || 0) - (e.credit || 0)); L.push('   #TRANS ' + e.account + ' {} ' + amt.toFixed(2)); }); L.push('}'); });
  return L.join('\r\n');
}
async function exportParty(sb: any, partyType: string, partyId: string, period: string, ctx: any) {
  if (!partyId) return { status: 400, body: { ok: false, error: 'party_id required' } };
  if (!ctx.authToken) return { status: 400, body: { ok: false, error: 'no_user_token' } };
  const qs = '?' + (partyType === 'dealer' ? 'dealer_id=' : 'buyer_id=') + encodeURIComponent(partyId) + (period ? '&period=' + period : '');
  const res = await nftAdmin('/sales-raw' + qs, ctx.authToken);
  if (!res || !res.ok) return { status: 502, body: { ok: false, error: res?.error || 'nft_unavailable' } };
  const head = ['sale_id', 'date', 'coin', 'gross_eur', 'platform_fee_eur', 'royalty_eur', 'net_to_party_eur', 'rail', 'tx_hash'];
  const lines = [head.join(',')];
  (res.sales || []).forEach((s: any) => { const gross = Number(s.price_eur || 0), fee = Number(s.platform_fee_eur || 0), roy = Number(s.royalty_eur || 0); const net = partyType === 'dealer' ? round2(gross - fee - roy) : round2(-gross); lines.push([s.id, (s.created_at || '').slice(0, 10), s.coin_name || '', gross.toFixed(2), fee.toFixed(2), roy.toFixed(2), net.toFixed(2), s.rail || '', s.tx_hash || ''].map(csvCell).join(',')); });
  return { raw: { content: lines.join('\n'), contentType: 'text/csv; charset=utf-8', filename: partyType + '-' + partyId.slice(0, 8) + (period ? '-' + period : '') + '.csv' } };
}
