// /api/crm-sync — connect a CRM feed, and pull it.
//   GET                          -> { connected, feed_url, last_synced_at, last_result }
//   POST { op: 'save', url, key } -> saves the link, then syncs
//   POST { op: 'save', provider: 'fub', key, tz } -> Follow Up Boss by API key
//   POST { op: 'run' }            -> syncs now
//   POST { op: 'auto' }           -> syncs only if the last sync is over an hour old
//   POST { op: 'contacts', contacts: 'all'|'deals' } -> which contacts come in, then syncs
//   (save takes `contacts` too: the agent is asked when connecting)
//   POST { op: 'disconnect' }
// Signed-in team members only. The key is stored server-side and never returned.

import { send, readBody, caller, db, env } from './_lib/server.js';
import { teamOf, linkOf, runSync } from './_lib/crm.js';
import { CRM_CHOICES, KEY_CRMS } from '../js/crmlist.js';

const HOUR = 3600e3;
const modeOf = (v) => (v === 'all' ? 'all' : v === 'deals' ? 'deals' : null);

function status(link) {
  return { connected: !!(link && link.feed_url), provider: link ? link.provider || 'feed' : null, feed_url: link ? link.feed_url : null, last_synced_at: link ? link.last_synced_at : null, last_result: link ? link.last_result : null, contacts_mode: link ? link.contacts_mode || 'deals' : null };
}

export default async function handler(req, res) {
  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY')) return send(res, 503, { error: 'Team mode is not set up on the server' });
  const user = await caller(req);
  if (!user) return send(res, 401, { error: 'Sign in first' });
  const teamId = await teamOf(user.id);
  if (!teamId) return send(res, 400, { error: 'Join or start a team first' });
  if (req.method === 'GET') return send(res, 200, status(await linkOf(teamId)));
  if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST' });
  const body = await readBody(req).catch(() => ({}));
  if (body.op === 'save' && KEY_CRMS.includes(body.provider)) {
    const crm = CRM_CHOICES.find((c) => c.id === body.provider);
    const key = String(body.key || '').trim();
    const existing = await linkOf(teamId);
    // A key from one CRM is never sent to another.
    if (!key && !(existing && existing.provider === crm.id && existing.feed_key)) return send(res, 400, { error: `Paste your ${crm.keyLabel}` });
    const tz = /^[A-Za-z_]+\/[A-Za-z_\/-]+$/.test(String(body.tz || '')) ? String(body.tz) : 'America/Los_Angeles';
    const row = { team_id: teamId, provider: crm.id, feed_url: `crm:${crm.id}`, tz, updated_at: new Date().toISOString(), ...(key ? { feed_key: key } : {}), ...(modeOf(body.contacts) ? { contacts_mode: modeOf(body.contacts) } : {}) };
    await db('crm_links?on_conflict=team_id', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=minimal' });
    const result = await runSync(teamId);
    return send(res, 200, { ...status(await linkOf(teamId)), result });
  }
  if (body.op === 'save') {
    const url = String(body.url || '').trim();
    if (!/^https:\/\/[^\s]+$/i.test(url)) return send(res, 400, { error: 'The feed link must start with https://' });
    const key = String(body.key || '').trim();
    const existing = await linkOf(teamId);
    const row = { team_id: teamId, provider: 'feed', feed_url: url, updated_at: new Date().toISOString(), ...(modeOf(body.contacts) ? { contacts_mode: modeOf(body.contacts) } : {}), ...(key || !existing || (existing.provider && existing.provider !== 'feed') ? { feed_key: key } : {}) }; // never send a Follow Up Boss key to a feed link
    await db('crm_links?on_conflict=team_id', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=minimal' });
    const result = await runSync(teamId);
    return send(res, 200, { ...status(await linkOf(teamId)), result });
  }
  if (body.op === 'contacts') {
    const mode = modeOf(body.contacts);
    if (!mode) return send(res, 400, { error: 'Pick which contacts' });
    const link = await linkOf(teamId);
    if (!link || !link.feed_url) return send(res, 400, { error: 'Connect your CRM first' });
    await db(`crm_links?team_id=eq.${teamId}`, { method: 'PATCH', body: { contacts_mode: mode } });
    const result = await runSync(teamId);
    return send(res, 200, { ...status(await linkOf(teamId)), result });
  }
  if (body.op === 'disconnect') {
    await db(`crm_links?team_id=eq.${teamId}`, { method: 'PATCH', body: { feed_url: null, feed_key: null, last_result: 'Disconnected' } });
    return send(res, 200, status(await linkOf(teamId)));
  }
  if (body.op === 'run' || body.op === 'auto') {
    const link = await linkOf(teamId);
    if (!link || !link.feed_url) return send(res, 200, { ...status(link), result: null });
    if (body.op === 'auto' && link.last_synced_at && Date.now() - new Date(link.last_synced_at) < HOUR) return send(res, 200, { ...status(link), result: null });
    const result = await runSync(teamId);
    return send(res, 200, { ...status(await linkOf(teamId)), result });
  }
  return send(res, 400, { error: 'Unknown op' });
}
