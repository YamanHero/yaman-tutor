import { put, get } from '@vercel/blob';
import { authorized, deny } from './_lib.js';

// Rewards the parent sets (name + star cost), and which requests were already given.
const PATH = 'state/rewards.json';

async function load() {
  const r = await get(PATH, { access: 'private', useCache: false }).catch(() => null);
  if (!r || r.statusCode !== 200) return { rewards: [], given: [] };
  return JSON.parse(await new Response(r.stream).text());
}

function parentOk(req) {
  const pc = process.env.PARENT_CODE;
  if (!pc) return authorized(req);
  return String(req.headers['x-parent-code'] || '').trim() === pc;
}

export default async function handler(req, res) {
  if (!authorized(req)) return deny(res);
  try {
    if (req.method === 'GET') return res.status(200).json(await load());
    if (req.method === 'POST') {
      if (!parentOk(req)) return res.status(403).json({ code: 'parent_only' });
      const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const rewards = (Array.isArray(b?.rewards) ? b.rewards : []).slice(0, 30).map(x => ({
        id: String(x.id || '').slice(0, 40) || 'r' + Math.random().toString(36).slice(2, 8),
        name: String(x.name || '').slice(0, 80),
        cost: Math.max(1, Math.min(100000, Math.round(Number(x.cost) || 0))),
      })).filter(x => x.name);
      const given = (Array.isArray(b?.given) ? b.given : []).map(String).slice(-500);
      await put(PATH, JSON.stringify({ rewards, given, updated: Date.now() }), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ code: 'method' });
  } catch (e) {
    console.error('rewards error', e);
    return res.status(500).json({ code: 'storage' });
  }
}
