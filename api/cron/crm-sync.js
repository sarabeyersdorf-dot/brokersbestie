// Daily (vercel.json): pull every connected team's CRM feed, so the calendar is
// filled even on a day no one opens the app. Phones also pull hourly on open.

import { env, send, db } from '../_lib/server.js';
import { runSync } from '../_lib/crm.js';

export default async function handler(req, res) {
  const secret = env('CRON_SECRET');
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return send(res, 401, { error: 'Not allowed' });
  const links = await db('crm_links?feed_url=not.is.null&select=team_id');
  const results = [];
  for (const l of links) results.push({ team: l.team_id, ...(await runSync(l.team_id)) });
  return send(res, 200, { teams: results.length, results });
}
