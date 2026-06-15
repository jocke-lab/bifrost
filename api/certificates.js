// /api/certificates — POST issue a certificate for a coin (optionally bind an NFC tag)
const { json, readBody, supa, fail, requireAdmin } = require('./_lib');
module.exports = async (req, res) => {
  try {
    await requireAdmin(req);
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (!b.coin_id) return json(res, 400, { ok: false, error: 'coin_id required' });
      const serial = b.serial || ('OPV-' + Date.now().toString(36).toUpperCase());
      const row = { coin_id: b.coin_id, serial, tag_id: b.tag_id || null };
      const d = await supa('nft', 'certificates', { method: 'POST', body: row });
      const cert = Array.isArray(d) ? d[0] : d;
      // binding an NFC tag → mark it assigned + linked to the coin (completes the circle)
      if (b.tag_id) {
        try { await supa('nft', 'nfc_tags?id=eq.' + encodeURIComponent(b.tag_id), { method: 'PATCH', body: { status: 'assigned', coin_id: b.coin_id } }); } catch (e) {}
      }
      return json(res, 200, { ok: true, configured: true, certificate: cert });
    }
    return json(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) { return fail(res, e); }
};
