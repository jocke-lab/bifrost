// /api/nfc — GET tags · POST register a tag · POST {action:'link'} bind tag → coin
const { json, readBody, supa, fail } = require('./_lib');
module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const d = await supa('nft', 'nfc_tags?select=id,uid,coin_id,dealer_id,status,tap_count,created_at&order=created_at.desc&limit=200');
      return json(res, 200, { ok: true, configured: true, tags: d });
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (b.action === 'link') {
        if (!b.tag_id || !b.coin_id) return json(res, 400, { ok: false, error: 'tag_id and coin_id required' });
        const d = await supa('nft', 'nfc_tags?id=eq.' + encodeURIComponent(b.tag_id), { method: 'PATCH', body: { coin_id: b.coin_id, status: 'assigned' } });
        return json(res, 200, { ok: true, configured: true, tag: Array.isArray(d) ? d[0] : d });
      }
      if (!b.uid) return json(res, 400, { ok: false, error: 'uid required' });
      const row = { uid: b.uid };
      if (b.dealer_id) row.dealer_id = b.dealer_id;
      const d = await supa('nft', 'nfc_tags', { method: 'POST', body: row });
      return json(res, 200, { ok: true, configured: true, tag: Array.isArray(d) ? d[0] : d });
    }
    return json(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) { return fail(res, e); }
};
