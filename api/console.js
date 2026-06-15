// /api/console — chain/gas, audit log, and card-production views for the control center.
// GET ?view=chain|audit|cards ; POST {action: retry_chain | card_status}
const { json, readBody, supa, fail } = require('./_lib');
const CARD_STATUS = ['requested', 'approved', 'shipped', 'delivered', 'rejected'];

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const u = new URL(req.url, 'http://x');
      const view = u.searchParams.get('view') || 'chain';
      if (view === 'chain') {
        const [jobs, snaps] = await Promise.all([
          supa('nft', 'chain_jobs?select=id,type,status,certificate_id,to_address,attempts,last_error,tx_hash,created_at,updated_at&order=created_at.desc&limit=100'),
          supa('nft', 'wallet_snapshots?select=balance_wei,created_at&order=created_at.desc&limit=1')
        ]);
        const counts = {};
        (jobs || []).forEach(j => { counts[j.status] = (counts[j.status] || 0) + 1; });
        const wei = (snaps && snaps[0]) ? Number(snaps[0].balance_wei || 0) : null;
        return json(res, 200, { ok: true, configured: true, jobs, counts, balance_eth: wei != null ? wei / 1e18 : null, snapshot_at: (snaps && snaps[0]) ? snaps[0].created_at : null });
      }
      if (view === 'audit') {
        const q = u.searchParams.get('q');
        let path = 'audit_log?select=id,actor_id,action,target,meta,created_at&order=created_at.desc&limit=200';
        if (q) path += '&action=ilike.*' + encodeURIComponent(q) + '*';
        const rows = await supa('nft', path);
        return json(res, 200, { ok: true, configured: true, rows });
      }
      if (view === 'cards') {
        const rows = await supa('nft', 'card_orders?select=id,dealer_id,quantity,status,notes,amount_eur,created_at&order=created_at.desc&limit=100');
        return json(res, 200, { ok: true, configured: true, rows });
      }
      return json(res, 400, { ok: false, error: 'bad view' });
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      const one = d => Array.isArray(d) ? d[0] : d;
      if (b.action === 'retry_chain') {
        if (!b.id) return json(res, 400, { ok: false, error: 'id required' });
        const d = await supa('nft', 'chain_jobs?id=eq.' + encodeURIComponent(b.id), { method: 'PATCH', body: { status: 'queued', last_error: null } });
        return json(res, 200, { ok: true, configured: true, row: one(d) });
      }
      if (b.action === 'card_status') {
        if (!b.id || !CARD_STATUS.includes(b.status)) return json(res, 400, { ok: false, error: 'id + valid status required' });
        const d = await supa('nft', 'card_orders?id=eq.' + encodeURIComponent(b.id), { method: 'PATCH', body: { status: b.status } });
        return json(res, 200, { ok: true, configured: true, row: one(d) });
      }
      return json(res, 400, { ok: false, error: 'unknown action' });
    }
    return json(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) { return fail(res, e); }
};
