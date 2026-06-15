// GET /api/slack-hud           → team + public channels
// GET /api/slack-hud?channel=  → recent messages for a channel
const { json } = require('./_lib');

async function slack(method, token, params) {
  const qs = params ? ('?' + new URLSearchParams(params)) : '';
  const r = await fetch('https://slack.com/api/' + method + qs, { headers: { Authorization: 'Bearer ' + token } });
  return r.json();
}

module.exports = async (req, res) => {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return json(res, 200, { ok: false, configured: false, need: 'SLACK_BOT_TOKEN', message: 'Add SLACK_BOT_TOKEN to Vercel env to enable the Slack HUD.' });
  try {
    const u = new URL(req.url, 'http://x');
    const channel = u.searchParams.get('channel');
    if (channel) {
      const hist = await slack('conversations.history', token, { channel, limit: '25' });
      return json(res, 200, { ok: !!hist.ok, configured: true, messages: hist.messages || [], error: hist.ok ? undefined : hist.error });
    }
    const [list, auth, users] = await Promise.all([
      slack('conversations.list', token, { types: 'public_channel', limit: '200', exclude_archived: 'true' }),
      slack('auth.test', token),
      slack('users.list', token, { limit: '200' })
    ]);
    const userMap = {};
    (users.members || []).forEach(m => { userMap[m.id] = (m.profile && (m.profile.display_name || m.profile.real_name)) || m.name; });
    return json(res, 200, {
      ok: !!list.ok, configured: true, team: auth.team, url: auth.url,
      channels: (list.channels || []).map(c => ({ id: c.id, name: c.name, num_members: c.num_members, is_member: c.is_member, topic: (c.topic && c.topic.value) || '' })),
      users: userMap,
      error: list.ok ? undefined : list.error
    });
  } catch (e) { return json(res, 500, { ok: false, error: e.message }); }
};
