import { authorized, deny } from './_lib.js';

// Checks the parent code (PARENT_CODE). Used before parent-only actions.
export default function handler(req, res) {
  if (!authorized(req)) return deny(res);
  const pc = process.env.PARENT_CODE;
  const ok = !pc || String(req.headers['x-parent-code'] || '').trim() === pc;
  res.setHeader('cache-control', 'no-store');
  res.status(ok ? 200 : 403).json({ ok, required: Boolean(pc) });
}
