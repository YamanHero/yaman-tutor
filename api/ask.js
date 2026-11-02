import { authorized, deny, readUsage, bumpUsage, dailyLimit } from './_lib.js';

const clean_ = v => String(v || '').trim().replace(/^["'`]+|["'`]+$/g, '').trim().toLowerCase();
const MODEL = clean_(process.env.ANTHROPIC_MODEL) || 'claude-sonnet-5-5';
const TEACHER_MODEL = clean_(process.env.TEACHER_MODEL) || MODEL;
const FALLBACKS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'];

export default async function handler(req, res) {
  if (!authorized(req)) return deny(res);
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === 'GET') { const u = await readUsage(); return res.status(200).json({ ai: Boolean(key), used: u.n || 0, limit: dailyLimit() }); }
  if (req.method !== 'POST') return res.status(405).json({ code: 'method' });
  if (!key) return res.status(503).json({ code: 'not_granted', message: 'ANTHROPIC_API_KEY is not set' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const clean = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && (typeof m.content === 'string' || Array.isArray(m.content)))
    .slice(-12)
    .map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content.slice(0, 30000) : m.content.slice(0, 6).map(c =>
        c && c.type === 'image' && c.source?.type === 'base64' && /^image\/(jpeg|png|webp)$/.test(c.source.media_type)
          ? { type: 'image', source: { type: 'base64', media_type: c.source.media_type, data: String(c.source.data).slice(0, 3_000_000) } }
          : { type: 'text', text: String(c?.text || '').slice(0, 30000) }),
    }));
  if (!clean.length || clean[clean.length - 1].role !== 'user') return res.status(400).json({ code: 'bad_request' });
  const max = Math.min(Math.max(Number(body.max) || 900, 100), 8000);
  const system = typeof body.system === 'string' ? body.system.slice(0, 20000) : undefined;
  const model = body.role === 'teacher' ? TEACHER_MODEL : MODEL;
  const stream = body.stream === true;

  const usage = await readUsage();
  if ((usage.n || 0) >= dailyLimit()) return res.status(429).json({ code: 'daily_limit', message: 'daily limit reached' });
  bumpUsage(usage);
  const chain = [...new Set([model, ...FALLBACKS])];
  try {
    let r, j, used;
    for (const m of chain) {
      used = m;
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: m, max_tokens: max, messages: clean, ...(stream ? { stream: true } : {}), ...(system ? { system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] } : {}) }),
      });
      if (stream && r.ok) break;
      j = await r.json();
      if (r.status === 404 || (r.status === 400 && /model/i.test(j?.error?.message || ''))) {
        console.error('anthropic model unavailable:', JSON.stringify(m), '-', j?.error?.message);
        continue;
      }
      break;
    }
    if (stream && r.ok) {
      res.status(200);
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.setHeader('cache-control', 'no-cache, no-transform');
      res.setHeader('x-accel-buffering', 'no');
      const dec = new TextDecoder();
      let buf = '';
      try {
        for await (const chunk of r.body) {
          buf += dec.decode(chunk, { stream: true });
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (!line.startsWith('data:')) continue;
            try {
              const ev = JSON.parse(line.slice(5));
              if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') res.write(ev.delta.text);
            } catch {}
          }
        }
      } catch (e) { console.error('stream error', e); }
      return res.end();
    }
    if (!r.ok) {
      console.error('anthropic error', r.status, j?.error?.type, used, j?.error?.message);
      return res.status(r.status === 429 ? 429 : 502).json({ code: r.status === 429 ? 'rate_limited' : 'upstream', message: j?.error?.message || 'error' });
    }
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    return res.status(200).json({ text, truncated: j.stop_reason === 'max_tokens' });
  } catch (e) {
    console.error('ask error', e);
    return res.status(502).json({ code: 'upstream' });
  }
}
