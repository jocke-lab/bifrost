// /api/dealers — GET list · POST create · PATCH update/approve  (NFT platform)
const { json, readBody, supa, fail } = require('./_lib');
const STATUS = ['pending', 'approved', 'suspended'];
const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const d = await supa('nft', 'dealers?select=id,name,slug,verified,status,default_royalty_bps,contact_email,website,created_at&order=created_at.desc');
      return json(res, 200, { ok: true, configured: true, dealers: d });
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (!b.name) return json(res, 400, { ok: false, error: 'name required' });
      const row = {
        name: b.name, slug: b.slug ? slugify(b.slug) : slugify(b.name),
        default_royalty_bps: b.royalty_bps != null ? Number(b.royalty_bps) : 500,
        contact_email: b.contact_email || null, website: b.website || null, bio: b.bio || null
      };
      if (b.status && STATUS.includes(b.status)) row.status = b.status;
      if (b.verified != null) row.verified = !!b.verified;
      const d = await supa('nft', 'dealers', { method: 'POST', body: row });
      return json(res, 200, { ok: true, configured: true, dealer: Array.isArray(d) ? d[0] : d });
    }
    if (req.method === 'PATCH') {
      const b = await readBody(req);
      if (!b.id) return json(res, 400, { ok: false, error: 'id required' });
      const patch = {};
      if (b.action === 'approve') { patch.status = 'approved'; patch.verified = true; }
      if (b.status && STATUS.includes(b.status)) patch.status = b.status;
      ['verified', 'default_royalty_bps', 'name', 'contact_email', 'website', 'bio'].forEach(k => { if (b[k] !== undefined) patch[k] = b[k]; });
      if (!Object.keys(patch).length) return json(res, 400, { ok: false, error: 'nothing to update' });
      const d = await supa('nft', 'dealers?id=eq.' + encodeURIComponent(b.id), { method: 'PATCH', body: patch });
      return json(res, 200, { ok: true, configured: true, dealer: Array.isArray(d) ? d[0] : d });
    }
    return json(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) { return fail(res, e); }
};
