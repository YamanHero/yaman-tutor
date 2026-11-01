import { authorized, loadState, deny } from './_lib.js';

// Short daily summary for other family apps (for example Hero Family).
// GET /api/summary?code=FAMILY_CODE
export default async function handler(req, res) {
  if (!authorized(req)) return deny(res);
  try {
    const data = await loadState();
    const S = data?.S || {}, E = data?.E || [];
    const tz = 'Asia/Jerusalem';
    const day = d => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(d));
    const today = day(Date.now());
    const lessonsToday = Object.entries(S.lessons || {}).filter(([, v]) => v.ts && day(v.ts) === today).map(([id, v]) => ({ id, score: v.last ?? v.score }));
    const examsToday = E.filter(x => day(x.ts) === today).map(x => ({ score: x.score, n: x.n, review: !!x.review }));
    const reviewDue = Object.values(S.review || {}).filter(r => r.due <= Date.now()).length;
    res.status(200).json({
      date: today,
      minutesToday: (S.minutes || {})[today] || 0,
      lessonsToday,
      examsToday,
      reviewDue,
      starsTotal: S.stars || 0,
      upcomingTests: (S.tests || []).filter(x => x.date >= today).map(x => ({ date: x.date, subject: x.sub, title: x.title || '' })),
      reviewDoneToday: E.some(x => x.review && day(x.ts) === today),
      recall: {
        doneToday: !!(S.recallDays || {})[today],
        due: Object.entries(S.recall || {}).filter(([, r]) => !r.done && r.due <= today).map(([id, r]) => ({ id, stage: r.stage || 0 })),
        learnedToday: Object.entries(S.recall || {}).filter(([, r]) => r.learned === today).map(([id]) => id),
        lastLevels: Object.fromEntries(Object.entries(S.recall || {}).map(([id, r]) => [id, (r.log || []).slice(-1)[0]?.lv || null])),
        whatILearned: (S.recallNotes || []).filter(n => n.d === today).map(n => n.t),
      },
      lastActivity: data?.updated || null,
    });
  } catch (e) {
    console.error('summary error', e);
    res.status(500).json({ code: 'storage' });
  }
}
