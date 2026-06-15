// /api/collections — GET list · POST create · POST {action:'approve'} (dealer collection requests)
const { json, readBody, supa, fail, requireAdmin } = require('./_lib');
// DB enforces slug ~ ^[a-z0-9-]{2,60}$
const slugify = s => { const v = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60); return v.length >= 2 ? v : ('c-' + Date.now().toString(36)); };
const clampRoy = n => Math.max(0, Math.min(2000, Number(n) || 0));

module.exports = async (req, res) => {
  try {
    await requireAdmin(req);
    if (req.method === 'GET') {
      const d = await supa('nft', 'collections?select=id,name,slug,dealer_id,published,approved,verified,featured,royalty_bps,chain,created_at&order=created_at.desc');
      return json(res, 200, { ok: true, configured: true, collections: d });
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (b.action === 'approve') {
        if (!b.id) return json(res, 400, { ok: false, error: 'id required' });
        const patch = { approved: true };
        if (b.publish !== false) patch.published = true;
        if (b.verified !== undefined) patch.verified = !!b.verified;
        const d = await supa('nft', 'collections?id=eq.' + encodeURIComponent(b.id), { method: 'PATCH', body: patch });
        return json(res, 200, { ok: true, configured: true, collection: Array.isArray(d) ? d[0] : d });
      }
      if (!b.name || !b.dealer_id) return json(res, 400, { ok: false, error: 'name and dealer_id required' });
      const row = {
        name: b.name, slug: b.slug ? slugify(b.slug) : slugify(b.name), dealer_id: b.dealer_id,
        description: b.description || null, royalty_bps: b.royalty_bps != null ? clampRoy(b.royalty_bps) : 500,
        chain: b.chain || 'base', approved: !!b.approved, published: !!b.published, verified: !!b.verified
      };
      const d = await supa('nft', 'collections', { method: 'POST', body: row });
      return json(res, 200, { ok: true, configured: true, collection: Array.isArray(d) ? d[0] : d });
    }
    return json(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) { return fail(res, e); }
};
