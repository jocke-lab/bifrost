// POST /api/slack-post  { channel, text }  → chat.postMessage
const { json, readBody } = require('./_lib');
module.exports = async (req, res) => {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return json(res, 200, { ok: false, configured: false, need: 'SLACK_BOT_TOKEN' });
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
  const b = await readBody(req);
  if (!b.channel || !b.text) return json(res, 400, { ok: false, error: 'channel and text required' });
  const r = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ channel: b.channel, text: b.text })
  });
  const data = await r.json();
  return json(res, 200, { ok: !!data.ok, configured: true, error: data.ok ? undefined : data.error, ts: data.ts });
};
