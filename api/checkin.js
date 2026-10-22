// POST /api/checkin { op: 'start' | 'extend' | 'ok' | 'help', id, due_at? }
// The phone saves the check-in row itself (it syncs like everything else);
// this endpoint makes sure the server has it, and sends the HELP text now.
// The overdue text is sent by api/cron/checkins.js, so it goes out even if the
// agent's phone is dead or out of signal.

import { send, readBody, caller, db, sendText, alertText } from './_lib/server.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const user = await caller(req);
  if (!user) return send(res, 401, { error: 'Sign in first' });
  const { op, id, due_at } = await readBody(req);
  if (!id) return send(res, 400, { error: 'Missing check-in id' });

  const rows = await db(`checkins?id=eq.${encodeURIComponent(id)}&select=*`);
  const c = rows && rows[0];
  if (!c) return send(res, 404, { error: 'Check-in not saved yet; try again in a moment' });
  // Only the agent who started it, or someone on their team, may change it.
  const member = await db(`team_members?team_id=eq.${c.team_id}&user_id=eq.${user.id}&select=user_id`);
  if (!member.length) return send(res, 403, { error: 'Not your team' });

  const now = new Date().toISOString();
  if (op === 'start') {
    await db(`checkins?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { status: 'active', alerted_at: null } });
  } else if (op === 'extend') {
    const due = due_at && !isNaN(Date.parse(due_at)) ? due_at : new Date(Date.now() + 15 * 60000).toISOString();
    await db(`checkins?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { due_at: due, alerted_at: null, status: 'active' } });
  } else if (op === 'ok') {
    await db(`checkins?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { status: 'ok', ended_at: now } });
  } else if (op === 'help') {
    await db(`checkins?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { status: 'help', ended_at: now, alerted_at: now } });
    if (c.contact_phone) {
      try { await sendText(c.contact_phone, alertText(c, { overdue: false })); }
      catch (e) { return send(res, 502, { error: e.message }); }
    }
  } else {
    return send(res, 400, { error: 'Unknown op' });
  }
  return send(res, 200, { ok: true });
}
