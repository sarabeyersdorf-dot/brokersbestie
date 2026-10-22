// Runs every 5 minutes (vercel.json). Any check-in still active two minutes
// after its time is up gets the safety text sent to the agent's contact, once.
// The two minutes are the grace period the phone uses to ask "Are you OK?".

import { env, send, db, sendText, alertText } from '../_lib/server.js';

const GRACE_MS = 2 * 60000;

export default async function handler(req, res) {
  const secret = env('CRON_SECRET');
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return send(res, 401, { error: 'Not allowed' });
  const cutoff = new Date(Date.now() - GRACE_MS).toISOString();
  const due = await db(`checkins?status=eq.active&alerted_at=is.null&due_at=lt.${encodeURIComponent(cutoff)}&select=*`);
  const sent = [];
  const failed = [];
  for (const c of due) {
    // Claim it first, so two overlapping runs can never text twice.
    const claimed = await db(`checkins?id=eq.${encodeURIComponent(c.id)}&alerted_at=is.null`, {
      method: 'PATCH', body: { alerted_at: new Date().toISOString() }, prefer: 'return=representation'
    });
    if (!claimed.length) continue;
    if (!c.contact_phone) { failed.push({ id: c.id, why: 'no contact phone' }); continue; }
    try {
      await sendText(c.contact_phone, alertText(c, { overdue: true }));
      sent.push(c.id);
    } catch (e) {
      // Un-claim so the next run tries again.
      await db(`checkins?id=eq.${encodeURIComponent(c.id)}`, { method: 'PATCH', body: { alerted_at: null } });
      failed.push({ id: c.id, why: e.message });
    }
  }
  return send(res, failed.length ? 207 : 200, { checked: due.length, sent, failed });
}
