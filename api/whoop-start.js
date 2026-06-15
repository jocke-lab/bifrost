// GET /api/whoop-start — begin Whoop OAuth for the SIGNED-IN employee.
// Requires a valid hub session; mints a single-use nonce in oauth_states keyed
// to this person, then redirects to Whoop with state=nonce. redirect_uri is
// computed from PUBLIC_ORIGIN (must match the Whoop console + the callback).
const { json, supa, requireUser, PUBLIC_ORIGIN, fail } = require('./_lib');
const crypto = require('crypto');

module.exports = async (req, res) => {
  const id = process.env.WHOOP_CLIENT_ID;
  if (!id) return json(res, 200, { ok: false, configured: false, need: 'WHOOP_CLIENT_ID' });
  try {
    const { uid } = await requireUser(req);
    const nonce = crypto.randomBytes(24).toString('hex');
    // INSERT the single-use state row (service role). created_at/consumed default.
    await supa('hub', 'oauth_states', { method: 'POST', prefer: 'return=minimal', body: { nonce, person_id: uid, provider: 'whoop' } });
    const u = 'https://api.prod.whoop.com/oauth/oauth2/auth?' + new URLSearchParams({
      client_id: id,
      redirect_uri: PUBLIC_ORIGIN + '/api/whoop-callback',
      response_type: 'code',
      scope: 'offline read:recovery read:sleep read:cycles read:workout read:profile read:body_measurement',
      state: nonce
    });
    res.statusCode = 302; res.setHeader('Location', u); res.end();
  } catch (e) { return fail(res, e); }
};
