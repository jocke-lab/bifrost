// /api/ops — operator Support & dispute control queue for the NFT platform.
// GET: aggregated queue (disputes, order issues, counterfeit reports, withdrawals, conversations)
// POST {action}: resolve_issue | resolve_counterfeit | process_withdrawal | order_status | reply | messages
const { json, readBody, supa, fail, requireAdmin } = require('./_lib');
const ORDER_STATUS = ['awaiting_shipment', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded', 'disputed'];

module.exports = async (req, res) => {
  try {
    await requireAdmin(req);
    if (req.method === 'GET') {
      const [issues, counterfeit, withdrawals, disputes, conversations] = await Promise.all([
        supa('nft', 'order_issues?select=id,order_id,reporter,reason,status,created_at&status=neq.resolved&order=created_at.desc&limit=100'),
        supa('nft', 'counterfeit_reports?select=id,tag_uid,coin_id,reporter_email,reason,status,created_at&status=neq.resolved&order=created_at.desc&limit=100'),
        supa('nft', 'withdrawal_requests?select=id,user_id,amount_eur,method,status,note,created_at&status=eq.pending&order=created_at.desc&limit=100'),
        supa('nft', 'orders?select=id,status,dispute_reason,total_eur,buyer_id,seller_id,dealer_id,created_at&status=eq.disputed&order=created_at.desc&limit=100'),
        supa('nft', 'conversations?select=id,kind,order_id,dealer_id,last_message_at&order=last_message_at.desc&limit=40')
      ]);
      return json(res, 200, { ok: true, configured: true, issues, counterfeit, withdrawals, disputes, conversations });
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      const one = d => Array.isArray(d) ? d[0] : d;
      if (b.action === 'resolve_issue') {
        const d = await supa('nft', 'order_issues?id=eq.' + encodeURIComponent(b.id), { method: 'PATCH', body: { status: b.status || 'resolved' } });
        return json(res, 200, { ok: true, configured: true, row: one(d) });
      }
      if (b.action === 'resolve_counterfeit') {
        const d = await supa('nft', 'counterfeit_reports?id=eq.' + encodeURIComponent(b.id), { method: 'PATCH', body: { status: b.status || 'resolved' } });
        return json(res, 200, { ok: true, configured: true, row: one(d) });
      }
      if (b.action === 'process_withdrawal') {
        const st = b.status === 'rejected' ? 'rejected' : 'paid';
        const d = await supa('nft', 'withdrawal_requests?id=eq.' + encodeURIComponent(b.id), { method: 'PATCH', body: { status: st, note: b.note || null, processed_at: new Date().toISOString() } });
        return json(res, 200, { ok: true, configured: true, row: one(d) });
      }
      if (b.action === 'order_status') {
        if (!ORDER_STATUS.includes(b.status)) return json(res, 400, { ok: false, error: 'bad status' });
        const patch = { status: b.status };
        if (b.status === 'cancelled') patch.cancelled_at = new Date().toISOString();
        if (b.status === 'completed') patch.completed_at = new Date().toISOString();
        const d = await supa('nft', 'orders?id=eq.' + encodeURIComponent(b.id), { method: 'PATCH', body: patch });
        return json(res, 200, { ok: true, configured: true, row: one(d) });
      }
      if (b.action === 'messages') {
        if (!b.conversation_id) return json(res, 400, { ok: false, error: 'conversation_id required' });
        const d = await supa('nft', 'messages?select=id,sender_id,kind,body,created_at&conversation_id=eq.' + encodeURIComponent(b.conversation_id) + '&order=created_at.asc&limit=200');
        return json(res, 200, { ok: true, configured: true, messages: d });
      }
      if (b.action === 'reply') {
        if (!b.conversation_id || !b.body) return json(res, 400, { ok: false, error: 'conversation_id and body required' });
        const d = await supa('nft', 'messages', { method: 'POST', body: { conversation_id: b.conversation_id, kind: 'text', body: b.body } });
        await supa('nft', 'conversations?id=eq.' + encodeURIComponent(b.conversation_id), { method: 'PATCH', prefer: 'return=minimal', body: { last_message_at: new Date().toISOString() } });
        return json(res, 200, { ok: true, configured: true, row: one(d) });
      }
      return json(res, 400, { ok: false, error: 'unknown action' });
    }
    return json(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) { return fail(res, e); }
};
