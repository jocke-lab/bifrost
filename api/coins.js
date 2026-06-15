// /api/coins — GET (?collection_id=) · POST create coin in a collection
const { json, readBody, supa, fail } = require('./_lib');
module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const u = new URL(req.url, 'http://x'); const col = u.searchParams.get('collection_id');
      const q = 'coins?select=id,name,collection_id,edition_no,edition_total,metal,year,image_url,created_at'
        + (col ? '&collection_id=eq.' + encodeURIComponent(col) : '') + '&order=created_at.desc&limit=200';
      const d = await supa('nft', q);
      return json(res, 200, { ok: true, configured: true, coins: d });
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (!b.name || !b.collection_id) return json(res, 400, { ok: false, error: 'name and collection_id required' });
      const row = {
        name: b.name, collection_id: b.collection_id,
        edition_no: b.edition_no != null ? Number(b.edition_no) : null,
        edition_total: b.edition_total != null ? Number(b.edition_total) : null,
        metal: b.metal || null, year: b.year != null ? Number(b.year) : null,
        image_url: b.image_url || null, description: b.description || null
      };
      const d = await supa('nft', 'coins', { method: 'POST', body: row });
      return json(res, 200, { ok: true, configured: true, coin: Array.isArray(d) ? d[0] : d });
    }
    return json(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) { return fail(res, e); }
};
