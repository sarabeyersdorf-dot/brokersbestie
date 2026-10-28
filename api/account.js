// /api/account — the agent's own account.
//   GET                                  -> { teammates } (how many others share the team)
//   POST { op: 'delete', confirm: 'DELETE', profile_id? }
//
// Delete my account (2026-10-28, before launch): people must be able to remove
// their data, and the App Store requires it later.
//   - Alone on the team: the whole team goes. Every table hangs off the team
//     with ON DELETE CASCADE (properties, codes, notes, tours, contacts, CRM
//     link, calendar feed...), and its photos and MLS sheets are removed from
//     storage first, so no file is left that nothing points at.
//   - Others on the team: what was shared stays with them. Only this person
//     leaves: their membership, their own profile, their reminders.
// Then the sign-in itself is deleted. Signed-in agents only, for themselves.

import { send, readBody, caller, db, env } from './_lib/server.js';
import { teamOf } from './_lib/crm.js';

const STORAGE = () => `${env('SUPABASE_URL')}/storage/v1`;
const admin = () => ({ apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' });

// Every file under <team>/ in the photos bucket.
export async function removeTeamFiles(teamId, fetchImpl = fetch) {
  let gone = 0;
  for (let round = 0; round < 50; round++) {
    const r = await fetchImpl(`${STORAGE()}/object/list/photos`, { method: 'POST', headers: admin(), body: JSON.stringify({ prefix: teamId, limit: 1000, offset: 0 }) });
    if (!r.ok) throw new Error(`storage list ${r.status}`);
    const names = (await r.json()).map((o) => o.name).filter(Boolean);
    if (!names.length) break;
    const d = await fetchImpl(`${STORAGE()}/object/photos`, { method: 'DELETE', headers: admin(), body: JSON.stringify({ prefixes: names.map((n) => `${teamId}/${n}`) }) });
    if (!d.ok) throw new Error(`storage delete ${d.status}`);
    gone += names.length;
    if (names.length < 1000) break;
  }
  return gone;
}

export default async function handler(req, res) {
  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY')) return send(res, 503, { error: 'Accounts are not set up on the server' });
  const user = await caller(req);
  if (!user) return send(res, 401, { error: 'Sign in first' });
  const teamId = await teamOf(user.id);
  const members = teamId ? await db(`team_members?team_id=eq.${teamId}&select=user_id`) : [];
  const teammates = members.filter((m) => m.user_id !== user.id).length;
  if (req.method === 'GET') return send(res, 200, { teammates });
  if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST' });
  const body = await readBody(req).catch(() => ({}));
  if (body.op !== 'delete' || body.confirm !== 'DELETE') return send(res, 400, { error: 'Type DELETE to confirm' });
  const uid = encodeURIComponent(user.id);
  try {
    // Rows that point at the person without cascading would block the delete.
    await db(`checkins?user_id=eq.${uid}`, { method: 'PATCH', body: { user_id: null } });
    await db(`team_invites?created_by=eq.${uid}`, { method: 'PATCH', body: { created_by: null } });
    let files = 0;
    if (teamId && !teammates) {
      files = await removeTeamFiles(teamId);
      await db(`teams?id=eq.${teamId}`, { method: 'DELETE' });
    } else if (teamId) {
      await db(`team_members?team_id=eq.${teamId}&user_id=eq.${uid}`, { method: 'DELETE' });
      const pid = String(body.profile_id || '');
      if (pid) await db(`profiles?team_id=eq.${teamId}&id=eq.${encodeURIComponent(pid)}`, { method: 'DELETE' });
    }
    const r = await fetch(`${env('SUPABASE_URL')}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: admin() });
    if (!r.ok && r.status !== 404) throw new Error(`auth ${r.status}`);
    return send(res, 200, { ok: true, team_deleted: !!teamId && !teammates, files });
  } catch (e) {
    console.error('account delete', e);
    return send(res, 500, { error: 'It stopped part way. Press Delete again: it carries on from where it stopped.' });
  }
}
