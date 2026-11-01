import { put, get } from '@vercel/blob';
import { createHash } from 'node:crypto';
import { authorized, deny } from './_lib.js';

// Natural voice. Uses ElevenLabs if ELEVENLABS_API_KEY is set, otherwise OpenAI if OPENAI_API_KEY is set.
// Generated audio is cached in the private Blob store, so each sentence is paid for only once.
function provider() {
  if (process.env.ELEVENLABS_API_KEY) return 'elevenlabs';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}

const CARTOON = 'تكلّم بالعربية الفصحى بأسلوب راوٍ في دبلجة رسوم متحركة عربية كلاسيكية (مثل قناة سبيس تون): صوت دافئ وحيوي ومشجّع، نطق واضح جدًا وتشكيل سليم، إيقاع معتدل غير سريع، مع حماس لطيف غير صاخب ووقفات قصيرة بين الجمل. أنت تشرح لطالب في الصف العاشر.';
const STYLE = {
  ar: 'تكلّم بالعربية بصوت معلّم هادئ ولطيف ودافئ، بلهجة شامية فلسطينية خفيفة وواضحة. تكلّم ببطء قليلًا وبوضوح، مع وقفات قصيرة بين الجمل، كأنك تشرح لطالب في الصف العاشر.',
  he: 'Speak Hebrew clearly and slowly, like a friendly teacher pronouncing words for a learner.',
  en: 'Speak English clearly and slowly, like a friendly teacher pronouncing words for a learner.',
};

async function synthElevenLabs(text) {
  const voice = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
      voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true, speed: 0.92 },
    }),
  });
  if (!r.ok) throw new Error('elevenlabs ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return Buffer.from(await r.arrayBuffer());
}

async function synthOpenAI(text, lang, style) {
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      voice: process.env.OPENAI_TTS_VOICE || 'ash',
      input: text,
      instructions: lang === 'ar' && style === 'cartoon' ? CARTOON : (STYLE[lang] || STYLE.ar),
      response_format: 'mp3',
    }),
  });
  if (!r.ok) throw new Error('openai ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return Buffer.from(await r.arrayBuffer());
}

export default async function handler(req, res) {
  if (!authorized(req)) return deny(res);
  const p = provider();
  if (req.method === 'GET') return res.status(200).json({ provider: p });
  if (req.method !== 'POST') return res.status(405).json({ code: 'method' });
  if (!p) return res.status(503).json({ code: 'no_voice' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const text = String(body?.text || '').trim().slice(0, 1200);
  const lang = ['ar', 'he', 'en'].includes(body?.lang) ? body.lang : 'ar';
  const style = body?.style === 'cartoon' ? 'cartoon' : 'teacher';
  if (!text) return res.status(400).json({ code: 'bad_request' });

  const voiceTag = p === 'elevenlabs' ? (process.env.ELEVENLABS_VOICE_ID || 'default') : (process.env.OPENAI_TTS_VOICE || 'ash');
  const key = createHash('sha1').update([p, voiceTag, lang, p === 'openai' ? style : '', text].join('|')).digest('hex');
  const path = `tts/${key}.mp3`;

  try {
    const cached = await get(path, { access: 'private' }).catch(() => null);
    if (cached && cached.statusCode === 200) {
      const buf = Buffer.from(await new Response(cached.stream).arrayBuffer());
      res.setHeader('content-type', 'audio/mpeg');
      res.setHeader('cache-control', 'private, max-age=604800');
      return res.status(200).send(buf);
    }
    const audio = p === 'elevenlabs' ? await synthElevenLabs(text) : await synthOpenAI(text, lang, style);
    put(path, audio, { access: 'private', contentType: 'audio/mpeg', addRandomSuffix: false, allowOverwrite: true }).catch(e => console.error('tts cache', e));
    res.setHeader('content-type', 'audio/mpeg');
    res.setHeader('cache-control', 'private, max-age=604800');
    return res.status(200).send(audio);
  } catch (e) {
    console.error('tts error', e);
    return res.status(502).json({ code: 'upstream' });
  }
}
