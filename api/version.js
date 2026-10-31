// Current deployed version, used by the app to show "new version" notice.
export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const v = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || 'dev').slice(0, 12);
  res.status(200).json({ v });
}
