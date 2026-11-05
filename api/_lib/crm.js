// A team's CRM, both ways. Used by /api/crm-sync (a phone asking) and the
// daily cron. Writes with the service role, team by team.
//
// Every run SENDS first (changes the phones marked crm_dirty), then PULLS.
// Sending first means the pull already carries what the agent changed; a
// change the CRM did not accept stays dirty, is retried next run, and the
// pull leaves that row alone so it is never overwritten before it is sent.

import { db } from './server.js';
import { mapFeed, crmId, pushChanges, MAX_CONTACTS, AGENT_FIELDS, leftoverPlan, FINISHED_STATUSES } from './feed.js';
import { CONNECTORS, CONTACT_LISTS } from './crms.js';
import { CRM_CHOICES } from '../../js/crmlist.js';
import { contactsChoice } from '../../js/contacts.js';

const MAX_FEED_BYTES = 5 * 1024 * 1024;

export async function teamOf(userId) {
  const rows = await db(`team_members?user_id=eq.${encodeURIComponent(userId)}&select=team_id&limit=1`);
  return rows[0] ? rows[0].team_id : null;
}

export async function linkOf(teamId) {
  const rows = await db(`crm_links?team_id=eq.${teamId}&select=*`);
  return rows[0] || null;
}

// Rows are sent in groups that share the same keys: one bulk insert takes one
// set of columns, and a column a row leaves out (a listing's date when the CRM
// has none) must stay as the agent typed it, not be blanked.
async function upsert(table, rows) {
  const groups = new Map();
  for (const r of rows) { const k = Object.keys(r).sort().join(','); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i += 200) {
      await db(`${table}?on_conflict=id`, { method: 'POST', body: list.slice(i, i + 200).map((r) => ({ ...r, updated_at: new Date().toISOString() })), prefer: 'resolution=merge-duplicates,return=minimal' });
    }
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

// CRM contacts no longer in the CRM. Read in pages (the API returns 1,000 at
// most), delete in groups of 100 so the address stays short.
async function pruneContacts(teamId, keep) {
  const have = [];
  for (let from = 0; ; from += 1000) {
    const page = await db(`contacts?team_id=eq.${teamId}&source=eq.crm&select=id&order=id&offset=${from}&limit=1000`);
    have.push(...page.map((r) => r.id));
    if (page.length < 1000) break;
  }
  const gone = have.filter((id) => !keep.has(id));
  for (let i = 0; i < gone.length; i += 100) await db(`contacts?team_id=eq.${teamId}&id=in.(${encodeURIComponent(quoteList(gone.slice(i, i + 100)))})`, { method: 'DELETE' });
}

// Tick every open CRM date on these homes. Only ticks, never un-ticks (same
// rule as doneDates), and never a date still waiting to go to the CRM.
async function tickDatesOf(teamId, propertyIds) {
  for (let i = 0; i < propertyIds.length; i += 100) {
    const ids = propertyIds.slice(i, i + 100);
    await db(`dates?team_id=eq.${teamId}&source=eq.crm&done=is.false&crm_dirty=is.false&property_id=in.(${encodeURIComponent(quoteList(ids))})`, { method: 'PATCH', body: { done: true, updated_at: new Date().toISOString() } });
  }
}

// Homes the CRM no longer sends (another CRM was connected, or it dropped a
// deal): removed when nothing of the agent's is on them, kept otherwise with
// their CRM dates ticked. See leftoverPlan in feed.js. Returns the counts.
async function pruneProperties(teamId, sentIds) {
  const crmProps = await db(`properties?team_id=eq.${teamId}&source=eq.crm&select=id,${AGENT_FIELDS.join(',')}`);
  const leftovers = crmProps.filter((p) => !sentIds.has(p.id));
  if (!leftovers.length) return { removed: 0, kept: 0 };
  const used = new Set();
  const ids = leftovers.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 100) {
    const inList = `property_id=in.(${encodeURIComponent(quoteList(ids.slice(i, i + 100)))})`;
    const asks = [
      ...['access', 'notes', 'tasks', 'trips', 'expenses', 'visitors', 'oh_links', 'share_links'].map((t) => `${t}?${inList}&select=property_id`),
      // Rows the phone made (the CRM's own carry source = 'crm').
      ...['people', 'dates', 'events'].map((t) => `${t}?${inList}&or=(source.is.null,source.neq.crm)&select=property_id`)
    ];
    for (const rows of await Promise.all(asks.map((q) => db(q)))) for (const r of rows) used.add(r.property_id);
  }
  const tours = await db(`tours?team_id=eq.${teamId}&select=stops`);
  for (const t of tours) for (const st of (Array.isArray(t.stops) ? t.stops : [])) if (st && st.property_id) used.add(st.property_id);
  const plan = leftoverPlan(leftovers, used);
  // Their CRM dates first, so a kept home never nags; a removed one takes its
  // CRM people and dates with it (cascade).
  await tickDatesOf(teamId, plan.keep);
  for (let i = 0; i < plan.remove.length; i += 100) {
    await db(`properties?team_id=eq.${teamId}&source=eq.crm&id=in.(${encodeURIComponent(quoteList(plan.remove.slice(i, i + 100)))})`, { method: 'DELETE' });
  }
  return { removed: plan.remove.length, kept: plan.keep.length };
}

export async function runSync(teamId, today = new Date().toISOString().slice(0, 10)) {
  const link = await linkOf(teamId);
  if (!link || !link.feed_url) return { ok: false, error: 'No CRM connected' };
  let result;
  let pushed = { sent: 0, failed: 0 };
  let pruned = { removed: 0, kept: 0 };
  const connector = CONNECTORS[link.provider];
  const label = (CRM_CHOICES.find((c) => c.id === link.provider) || {}).label || 'The CRM';
  let shape = null;
  // "All my contacts" (chosen when connecting) brings the whole address book
  // into Contacts; "Just the people on my deals" brings none of it.
  const choice = contactsChoice(link.contacts_mode);
  const allContacts = choice.all;
  let contactsNote = '';
  try {
    let feed;
    if (connector) {
      // Key-connected CRMs are read only: a change made on the phone to one of
      // their appointments stays in Bestie (cleared so the pull can carry on).
      await db(`dates?team_id=eq.${teamId}&crm_dirty=is.true`, { method: 'PATCH', body: { crm_dirty: false } });
      await db(`events?team_id=eq.${teamId}&crm_dirty=is.true`, { method: 'PATCH', body: { crm_dirty: false } });
      feed = await connector(link.feed_key, { tz: link.tz || 'America/Los_Angeles', today });
      shape = feed.shape || null;
      if (allContacts) feed.contacts = await CONTACT_LISTS[link.provider](link.feed_key).catch((e) => { if (/refused/.test(e.message)) throw e; contactsNote = `contacts not brought in (${e.message})`; return null; });
    } else {
      pushed = await push(teamId, link);
      const url = allContacts ? `${link.feed_url}${link.feed_url.includes('?') ? '&' : '?'}contacts=all` : link.feed_url;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${link.feed_key || ''}`, Accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
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
    // Homes the CRM stopped sending. Only when it sent some: a CRM answering
    // with nothing at all is more likely a hiccup than an empty book.
    if (rows.properties.length) pruned = await pruneProperties(teamId, new Set(rows.properties.map((p) => p.id)));
    // A closed or cancelled CRM home has nothing left due: its CRM dates are
    // ticked, so a closing the CRM stopped dating never sits overdue.
    const finished = await db(`properties?team_id=eq.${teamId}&source=eq.crm&status=in.(${FINISHED_STATUSES.join(',')})&select=id`);
    await tickDatesOf(teamId, finished.map((p) => p.id));
    // An appointment cancelled in the CRM leaves the calendar too (past ones stay).
    const keep = rows.events.map((e) => e.id);
    await db(`events?team_id=eq.${teamId}&source=eq.crm&crm_dirty=is.false&date=gte.${today}${keep.length ? `&id=not.in.(${encodeURIComponent(quoteList(keep))})` : ''}`, { method: 'DELETE' });
    // Only the groups the agent ticked; the prune below then clears the rest.
    if (choice.kinds) rows.contacts = rows.contacts.filter((c) => choice.kinds.has(c.kind));
    if (allContacts && feed.contacts) {
      await upsert('contacts', rows.contacts);
      // Gone from the CRM -> gone here, unless the list was cut short.
      if (feed.contacts.length < MAX_CONTACTS) await pruneContacts(teamId, new Set(rows.contacts.map((c) => c.id)));
    } else if (!allContacts) {
      await db(`contacts?team_id=eq.${teamId}&source=eq.crm`, { method: 'DELETE' });
    }
    const counts = Object.fromEntries(['properties', 'people', 'dates', 'events', 'contacts'].map((k) => [k, rows[k].length]));
    if (!(allContacts && feed.contacts)) counts.contacts = null;
    result = { ok: true, counts, pushed, pruned };
  } catch (e) {
    result = { ok: false, error: e.name === 'TimeoutError' ? `${label} did not answer in time` : e.message };
  }
  await db(`crm_links?team_id=eq.${teamId}`, { method: 'PATCH', body: { ...(shape ? { last_shape: shape.slice(0, 2000) } : {}), last_synced_at: new Date().toISOString(), last_result: result.ok ? `Synced ${result.counts.properties} properties, ${result.counts.events} appointments, ${result.counts.dates} dates, ${result.counts.people} people on deals${result.counts.contacts != null ? `, ${result.counts.contacts} contacts` : ''}.${result.pruned && result.pruned.removed ? ` Removed ${result.pruned.removed} home${result.pruned.removed === 1 ? '' : 's'} the CRM no longer sends.` : ''}${contactsNote ? ' Note: ' + contactsNote + '.' : ''}${pushed.sent ? ` Sent ${pushed.sent} change${pushed.sent === 1 ? '' : 's'} to the CRM.` : ''}${pushed.failed ? ` ${pushed.failed} change${pushed.failed === 1 ? '' : 's'} not taken yet${pushed.note ? ' (' + pushed.note + ')' : ''}; will retry.` : ''}` : `Failed: ${result.error}` } });
  return result;
}
