// A team's CRM, both ways. Used by /api/crm-sync (a phone asking) and the
// daily cron. Writes with the service role, team by team.
//
// Every run SENDS first (changes the phones marked crm_dirty), then PULLS.
// Sending first means the pull already carries what the agent changed; a
// change the CRM did not accept stays dirty, is retried next run, and the
// pull leaves that row alone so it is never overwritten before it is sent.

import { db } from './server.js';
import { mapFeed, crmId, pushChanges } from './feed.js';
import { CONNECTORS } from './crms.js';
import { CRM_CHOICES } from '../../js/crmlist.js';

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

// Send what the phones changed. Returns { sent, failed, note }.
async function push(teamId, link) {
  const [dates, events] = await Promise.all([
    db(`dates?team_id=eq.${teamId}&crm_dirty=is.true&select=*`),
    db(`events?team_id=eq.${teamId}&crm_dirty=is.true&select=*`)
  ]);
  const changes = pushChanges({ dates, events });
  // Rows marked dirty that the CRM has no use for (not linked to it): clear.
  const linked = new Set(changes.map((c) => c._id));
  for (const r of [...dates.map((x) => ['dates', x]), ...events.map((x) => ['events', x])]) {
    if (!linked.has(r[1].id)) await db(`${r[0]}?id=eq.${encodeURIComponent(r[1].id)}`, { method: 'PATCH', body: { crm_dirty: false } });
  }
  if (!changes.length) return { sent: 0, failed: 0 };
  const r = await fetch(link.feed_url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${link.feed_key || ''}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ format: 'bestie-feed/1', changes: changes.map(({ _id, _table, _row, ...c }) => c) }),
    signal: AbortSignal.timeout(25000)
  });
  // A CRM that only offers a read-only feed answers 405: keep the changes, say so.
  if (r.status === 405 || r.status === 404) return { sent: 0, failed: changes.length, note: 'this CRM does not take changes back' };
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'The CRM refused the key' : `The CRM answered ${r.status} to the changes`);
  const { results = [] } = await r.json();
  let sent = 0, failed = 0;
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    const res = results[i] || {};
    if (!res.ok) { failed++; continue; }
    sent++;
    // Only clear the flag if the row has not changed again since it was read.
    const same = `id=eq.${encodeURIComponent(c._id)}&updated_at=eq.${encodeURIComponent(c._row.updated_at)}`;
    if (c._table === 'events' && c.cancelled) {
      await db(`events?${same}`, { method: 'DELETE' });
    } else if (c._table === 'events' && !c.ext_id && res.ext_id) {
      // A new appointment now has a CRM id: it becomes the CRM's row, so the
      // next pull updates it instead of adding a second copy.
      const { id, crm_dirty, ...rest } = c._row;
      await db('events?on_conflict=id', { method: 'POST', body: { ...rest, id: crmId(teamId, 'e', res.ext_id), source: 'crm', crm_dirty: false, updated_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=minimal' });
      await db(`events?id=eq.${encodeURIComponent(c._id)}`, { method: 'DELETE' });
    } else {
      await db(`${c._table}?${same}`, { method: 'PATCH', body: { crm_dirty: false } });
    }
  }
  return { sent, failed };
}

export async function runSync(teamId, today = new Date().toISOString().slice(0, 10)) {
  const link = await linkOf(teamId);
  if (!link || !link.feed_url) return { ok: false, error: 'No CRM connected' };
  let result;
  let pushed = { sent: 0, failed: 0 };
  const connector = CONNECTORS[link.provider];
  const label = (CRM_CHOICES.find((c) => c.id === link.provider) || {}).label || 'The CRM';
  let shape = null;
  try {
    let feed;
    if (connector) {
      // Key-connected CRMs are read only: a change made on the phone to one of
      // their appointments stays in Bestie (cleared so the pull can carry on).
      await db(`dates?team_id=eq.${teamId}&crm_dirty=is.true`, { method: 'PATCH', body: { crm_dirty: false } });
      await db(`events?team_id=eq.${teamId}&crm_dirty=is.true`, { method: 'PATCH', body: { crm_dirty: false } });
      feed = await connector(link.feed_key, { tz: link.tz || 'America/Los_Angeles', today });
      shape = feed.shape || null;
    } else {
      pushed = await push(teamId, link);
      const r = await fetch(link.feed_url, { headers: { Authorization: `Bearer ${link.feed_key || ''}`, Accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
      if (r.status === 401 || r.status === 403) throw new Error('The CRM refused the key');
      if (!r.ok) throw new Error(`The CRM answered ${r.status}`);
      const text = await r.text();
      if (text.length > MAX_FEED_BYTES) throw new Error('The CRM feed is too large');
      feed = JSON.parse(text);
    }
    const rows = mapFeed(feed, teamId);
    // Never pull over a change still waiting to go to the CRM.
    const [dirtyD, dirtyE] = await Promise.all([
      db(`dates?team_id=eq.${teamId}&crm_dirty=is.true&select=id`),
      db(`events?team_id=eq.${teamId}&crm_dirty=is.true&select=id`)
    ]);
    const waiting = new Set([...dirtyD, ...dirtyE].map((r) => r.id));
    rows.dates = rows.dates.filter((r) => !waiting.has(r.id));
    rows.events = rows.events.filter((r) => !waiting.has(r.id));
    // Properties first: people, dates and events point at them.
    for (const t of ['properties', 'people', 'dates', 'events']) await upsert(t, rows[t]);
    // CRM tasks were brought in for one day (2026-10-23) and taken out again:
    // clear any still here. The agent's own to-dos are never touched.
    await db(`tasks?team_id=eq.${teamId}&source=eq.crm`, { method: 'DELETE' });
    // Done in the CRM -> done here. Never the other way: a tick on the phone stays.
    for (const [table, done] of [['dates', rows.doneDates]]) {
      for (let i = 0; i < done.length; i += 100) {
        const ids = done.slice(i, i + 100);
        await db(`${table}?team_id=eq.${teamId}&done=is.false&crm_dirty=is.false&id=in.(${encodeURIComponent(quoteList(ids))})`, { method: 'PATCH', body: { done: true, updated_at: new Date().toISOString() } });
      }
    }
    // An appointment cancelled in the CRM leaves the calendar too (past ones stay).
    const keep = rows.events.map((e) => e.id);
    await db(`events?team_id=eq.${teamId}&source=eq.crm&crm_dirty=is.false&date=gte.${today}${keep.length ? `&id=not.in.(${encodeURIComponent(quoteList(keep))})` : ''}`, { method: 'DELETE' });
    const counts = Object.fromEntries(['properties', 'people', 'dates', 'events'].map((k) => [k, rows[k].length]));
    result = { ok: true, counts, pushed };
  } catch (e) {
    result = { ok: false, error: e.name === 'TimeoutError' ? `${label} did not answer in time` : e.message };
  }
  await db(`crm_links?team_id=eq.${teamId}`, { method: 'PATCH', body: { ...(shape ? { last_shape: shape.slice(0, 2000) } : {}), last_synced_at: new Date().toISOString(), last_result: result.ok ? `Synced ${result.counts.properties} properties, ${result.counts.events} appointments, ${result.counts.dates} dates, ${result.counts.people} people.${pushed.sent ? ` Sent ${pushed.sent} change${pushed.sent === 1 ? '' : 's'} to the CRM.` : ''}${pushed.failed ? ` ${pushed.failed} change${pushed.failed === 1 ? '' : 's'} not taken yet${pushed.note ? ' (' + pushed.note + ')' : ''}; will retry.` : ''}` : `Failed: ${result.error}` } });
  return result;
}
