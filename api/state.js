import { authorized, loadState, saveState, deny, profileOf } from './_lib.js';

export default async function handler(req, res) {
  if (!authorized(req)) return deny(res);
  try {
    if (req.method === 'GET') {
      const data = await loadState(profileOf(req));
      return res.status(200).json({ data });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || typeof body.S !== 'object') return res.status(400).json({ code: 'bad_request' });
      const size = JSON.stringify(body).length;
      if (size > 2_000_000) return res.status(413).json({ code: 'too_large' });
      await saveState({ S: body.S, E: Array.isArray(body.E) ? body.E.slice(-300) : [], updated: Date.now() }, profileOf(req));
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ code: 'method' });
  } catch (e) {
    console.error('state error', e);
    return res.status(500).json({ code: 'storage', message: String(e && e.message || e) });
  }
}
