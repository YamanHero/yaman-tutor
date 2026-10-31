import { put, get } from '@vercel/blob';

const PATH = 'state/yaman.json';

export function authorized(req) {
  const expected = process.env.FAMILY_CODE;
  if (!expected) return false;
  const url = new URL(req.url, 'http://local');
  const given = req.headers['x-family-code'] || url.searchParams.get('code') || '';
  return String(given).trim() === expected;
}

export async function loadState() {
  const r = await get(PATH, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return null;
  const text = await new Response(r.stream).text();
  return JSON.parse(text);
}

export async function saveState(data) {
  await put(PATH, JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export function deny(res) {
  res.status(401).json({ code: 'auth', message: 'رمز العائلة غير صحيح' });
}
