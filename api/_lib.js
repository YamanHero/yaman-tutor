import { put, get } from '@vercel/blob';

const PATH = 'state/yaman.json';
const PROFILES = ['judy'];
export function profileOf(req) {
  const p = String((req.headers && req.headers['x-profile']) || '').trim().toLowerCase();
  return PROFILES.includes(p) ? p : '';
}
const pathFor = (profile) => (profile ? `state/${profile}.json` : PATH);

export function authorized(req) {
  const expected = process.env.FAMILY_CODE;
  if (!expected) return false;
  const url = new URL(req.url, 'http://local');
  const given = req.headers['x-family-code'] || url.searchParams.get('code') || '';
  return String(given).trim() === expected;
}

export async function loadState(profile = '') {
  const r = await get(pathFor(profile), { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return null;
  const text = await new Response(r.stream).text();
  return JSON.parse(text);
}

export async function saveState(data, profile = '') {
  await put(pathFor(profile), JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export function deny(res) {
  res.status(401).json({ code: 'auth', message: 'رمز العائلة غير صحيح' });
}

const ilDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
export const dailyLimit = () => Math.max(1, Number(process.env.DAILY_AI_LIMIT) || 150);
export async function readUsage() {
  try {
    const r = await get(`usage/${ilDay()}.json`, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200) return { n: 0 };
    return JSON.parse(await new Response(r.stream).text());
  } catch (e) { return { n: 0 }; }
}
export async function bumpUsage(u) {
  try {
    await put(`usage/${ilDay()}.json`, JSON.stringify({ n: (u.n || 0) + 1 }), {
      access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true,
    });
  } catch (e) { /* best effort */ }
}
