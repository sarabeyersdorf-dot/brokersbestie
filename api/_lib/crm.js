// Pulling a team's CRM feed into its tables. Used by /api/crm-sync (a phone
// asking) and the daily cron. Writes with the service role, team by team.

import { db } from './server.js';
import { mapFeed } from './feed.js';

const MAX_FEED_BYTES = 5 * 1024 * 1024;

export async function teamOf(userId) {
  const rows = await db(`team_members?user_id=eq.${encodeURIComponent(userId)}&select=team_id&limit=1`);
  return rows[0] ? rows[0].team_id : null;
}

export async function linkOf(teamId) {
  const rows = await db(`crm_links?team_id=eq.${teamId}&select=*`);
  return rows[0] || null;
}

async function upsert(table, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    await db(`${table}?on_conflict=id`, { method: 'POST', body: rows.slice(i, i + 200).map((r) => ({ ...r, updated_at: new Date().toISOString() })), prefer: 'resolution=merge-duplicates,return=minimal' });
  }
}

const quoteList = (ids) => ids.map((id) => `"${id.replace(/"/g, '')}"`).join(',');

export async function runSync(teamId, today = new Date().toISOString().slice(0, 10)) {
  const link = await linkOf(teamId);
  if (!link || !link.feed_url) return { ok: false, error: 'No CRM connected' };
  let result;
  try {
    const r = await fetch(link.feed_url, { headers: { Authorization: `Bearer ${link.feed_key || ''}`, Accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
    if (r.status === 401 || r.status === 403) throw new Error('The CRM refused the key');
    if (!r.ok) throw new Error(`The CRM answered ${r.status}`);
    const text = await r.text();
    if (text.length > MAX_FEED_BYTES) throw new Error('The CRM feed is too large');
    const rows = mapFeed(JSON.parse(text), teamId);
    // Properties first: people, dates and events point at them.
    for (const t of ['properties', 'people', 'dates', 'events']) await upsert(t, rows[t]);
    // An appointment cancelled in the CRM leaves the calendar too (past ones stay).
    const keep = rows.events.map((e) => e.id);
    await db(`events?team_id=eq.${teamId}&source=eq.crm&date=gte.${today}${keep.length ? `&id=not.in.(${encodeURIComponent(quoteList(keep))})` : ''}`, { method: 'DELETE' });
    const counts = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length]));
    result = { ok: true, counts };
  } catch (e) {
    result = { ok: false, error: e.name === 'TimeoutError' ? 'The CRM did not answer in time' : e.message };
  }
  await db(`crm_links?team_id=eq.${teamId}`, { method: 'PATCH', body: { last_synced_at: new Date().toISOString(), last_result: result.ok ? `Synced ${result.counts.properties} properties, ${result.counts.events} appointments, ${result.counts.dates} dates, ${result.counts.people} people` : `Failed: ${result.error}` } });
  return result;
}
