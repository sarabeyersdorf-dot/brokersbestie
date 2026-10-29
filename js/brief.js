// What is on a day, and the morning briefing. Pure functions over the store's
// snapshot, so they are tested in test/brief.test.mjs and shared by the
// calendar, the Today card and "Read it to me".

import { formatClock } from './route.js';

export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const where = (data, pid) => ((data.properties || []).find((p) => p.id === pid) || {}).address || '';
// Whose: the item's own owner, else its property's. null = the whole team.
const ownerFor = (data, own, pid) => own || ((data.properties || []).find((p) => p.id === pid) || {}).owner || null;

// Everything on one day, timed items first in time order, then all-day ones.
// kind: event | tour | date | task. Each item carries what the screen needs.
export function dayItems(data, day) {
  const items = [];
  for (const e of data.events || []) {
    if (e.date !== day || e.cancelled) continue;
    items.push({ kind: 'event', id: e.id, start: e.start_minutes ?? null, minutes: e.minutes || null, title: e.title || 'Appointment', where: e.location || where(data, e.property_id), property_id: e.property_id || null, done: !!e.done, sub: e.kind || '', owner: ownerFor(data, e.owner, e.property_id) });
  }
  for (const t of data.tours || []) {
    if (t.date !== day) continue;
    const stops = t.stops || [];
    items.push({ kind: 'tour', id: t.id, start: t.start_minutes ?? null, title: t.name || 'Showing tour', where: `${stops.length} stop${stops.length === 1 ? '' : 's'}`, done: !!t.finished, owner: t.owner || null });
  }
  for (const d of data.dates || []) {
    if (d.due !== day) continue;
    items.push({ kind: 'date', id: d.id, start: null, title: d.label, where: where(data, d.property_id), property_id: d.property_id || null, done: !!d.done, owner: ownerFor(data, null, d.property_id) });
  }
  for (const t of data.tasks || []) {
    if (t.due !== day || t.done) continue;
    items.push({ kind: 'task', id: t.id, start: null, title: t.text, where: where(data, t.property_id), property_id: t.property_id || null, done: false, owner: ownerFor(data, t.owner, t.property_id) });
  }
  const order = { event: 0, tour: 0, date: 1, task: 2 };
  return items.sort((a, b) => (a.start == null) - (b.start == null) || (a.start ?? 0) - (b.start ?? 0) || order[a.kind] - order[b.kind]);
}

// The days from `from` for `span` days that have anything on them.
export function agenda(data, from, span = 45) {
  const out = [];
  for (let i = 0; i < span; i++) {
    const day = addDays(from, i);
    const items = dayItems(data, day);
    if (items.length) out.push({ day, items });
  }
  return out;
}

// The morning briefing: today, what is late, the week ahead.
export function briefing(data, today, { pickups = 0 } = {}) {
  const week = addDays(today, 7);
  const todayItems = dayItems(data, today).filter((i) => !i.done);
  const late = (data.tasks || []).filter((t) => !t.done && t.due && t.due < today);
  // A closing is counted once: from the deal's "Close of escrow" deadline when
  // there is one, else the property's closing date. It is never also counted
  // as a deadline (it was, so "1 closing" and "2 deadlines" shared an item).
  const open = (data.dates || []).filter((d) => !d.done && d.due > today && d.due <= week);
  const deadlines = open.filter((d) => !CLOSING.test(d.label || '')).sort((a, b) => a.due.localeCompare(b.due));
  const byProp = new Map();
  for (const d of open.filter((x) => CLOSING.test(x.label || ''))) byProp.set(d.property_id || d.id, { property_id: d.property_id, address: where(data, d.property_id) || d.label, date: d.due });
  for (const p of data.properties || []) {
    if (p.status === 'escrow' && p.coe_date && p.coe_date >= today && p.coe_date <= week && !byProp.has(p.id)) byProp.set(p.id, { property_id: p.id, address: p.address, date: p.coe_date });
  }
  const closings = [...byProp.values()].sort((a, b) => a.date.localeCompare(b.date));
  const lateDates = (data.dates || []).filter((d) => !d.done && d.due && d.due < today && d.due >= addDays(today, -14));
  return { day: today, today: todayItems, late, deadlines, closings, lateDates, pickups, quiet: !todayItems.length && !late.length && !deadlines.length && !closings.length && !lateDates.length && !pickups };
}

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const weekday = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
// "today", "tomorrow", "Thursday, Oct 29": never "this week" for something
// that may be next week.
export function whenSaid(iso, today) {
  if (iso === today) return 'today';
  if (iso === addDays(today, 1)) return 'tomorrow';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
// What is booked today, by kind: "2 showings", "1 showing and 1 appointment".
export function bookedSummary(items) {
  const n = { showing: 0, appt: 0, closing: 0 };
  for (const i of items) { const k = itemKind(i); if (k in n) n[k]++; }
  const parts = [n.showing && plural(n.showing, 'showing'), n.appt && plural(n.appt, 'appointment'), n.closing && plural(n.closing, 'closing')].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || '';
}

// The same briefing in sentences, for reading aloud.
export function briefingText(b, data, { name, hello = 'Good morning' } = {}) {
  const lines = [`${hello}${name ? ', ' + name : ''}.`];
  if (b.quiet) return [...lines, 'Nothing is on the calendar today and nothing is late.'].join(' ');
  const timed = b.today.filter((i) => i.start != null && i.kind !== 'task');
  const allDay = b.today.filter((i) => i.start == null || i.kind === 'task');
  if (timed.length) {
    lines.push(`Today you have ${bookedSummary(timed)}.`);
    for (const i of timed) lines.push(`At ${formatClock(i.start)}, ${i.title}${i.where && i.kind !== 'tour' ? ' at ' + i.where : ''}.`);
  } else lines.push('Nothing booked today.');
  if (allDay.length) lines.push(`Also due today: ${allDay.map((i) => i.title).join('; ')}.`);
  if (b.late.length) lines.push(`${plural(b.late.length, 'to-do')} ${b.late.length === 1 ? 'is' : 'are'} overdue: ${b.late.slice(0, 3).map((t) => t.text).join('; ')}.`);
  if (b.lateDates.length) lines.push(`${plural(b.lateDates.length, 'deadline')} passed without being marked done: ${b.lateDates.slice(0, 3).map((d) => `${d.label} at ${where(data, d.property_id)}`).join('; ')}.`);
  for (const c of b.closings) lines.push(`${c.address} closes ${whenSaid(c.date, b.day)}.`);
  if (b.deadlines.length) lines.push(`Deadlines in the next 7 days: ${b.deadlines.slice(0, 4).map((d) => `${d.label}${where(data, d.property_id) ? ' at ' + where(data, d.property_id) : ''}, ${whenSaid(d.due, b.day)}`).join('; ')}.`);
  if (b.pickups) lines.push(`${plural(b.pickups, 'sign or lockbox', 'signs or lockboxes')} to pick up.`);
  return lines.join(' ');
}

// "10:30" or "10:30 AM" -> minutes after midnight, as typed in a time box.
export function timeToMinutes(v) {
  const m = String(v || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export function minutesToTime(m) {
  return m == null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ---------- colour kinds: one definition for every screen ----------
// Each thing on a day is one of these, and each has one colour (css: .c-<key>)
// and a word, so it is never told apart by colour alone.
export const COLOR_KINDS = [
  ['showing', 'Showing'],
  ['appt', 'Appointment'],
  ['deadline', 'Deadline'],
  ['closing', 'Closing'],
  ['todo', 'To-do']
];
const CLOSING = /close of escrow|\bcoe\b|closing|recording/i;

// A dayItems() item -> its colour kind. `late` is a deadline past its day.
export function itemKind(i, today) {
  if (i.kind === 'tour') return 'showing';
  if (i.kind === 'task') return 'todo';
  if (i.kind === 'event') {
    if (i.sub === 'showing' || i.sub === 'open') return 'showing';
    if (i.sub === 'closing') return 'closing';
    return 'appt';
  }
  if (i.kind === 'date') return CLOSING.test(i.title || '') ? 'closing' : 'deadline';
  return 'todo';
}
export function isLate(i, day, today) {
  return (i.kind === 'date' || i.kind === 'task') && !i.done && day < today;
}

// Keep only the chosen kind (null = all) and property (null = all).
export function filterItems(items, { kind = null, property = null, who = null } = {}) {
  return items.filter((i) => (!kind || itemKind(i) === kind) && (!property || i.property_id === property) && isWhose(i.owner, who));
}

// Mine / <name>: a thing with no owner, or "both", belongs to everyone.
export function isWhose(owner, who) {
  return !who || !owner || owner === 'both' || owner === who;
}
// The people on a team, from who owns what, without "both" and without me.
export function teamNames(data, me) {
  const names = new Set();
  for (const t of ['properties', 'events', 'tasks', 'tours']) for (const r of data[t] || []) if (r.owner && r.owner !== 'both' && r.owner !== me) names.add(r.owner);
  return [...names].sort();
}
export const firstName = (v) => (String(v || '').trim().split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z'-]/g, '');

// Properties list order.
export const PROP_SORTS = [['az', 'A–Z'], ['closing', 'Closing soonest'], ['newest', 'Newest'], ['price', 'Price, high to low']];
export function sortProps(list, how) {
  const by = {
    az: (a, b) => String(a.address).localeCompare(String(b.address)),
    closing: (a, b) => (a.coe_date || '9999').localeCompare(b.coe_date || '9999') || String(a.address).localeCompare(String(b.address)),
    newest: (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')),
    price: (a, b) => (Number(b.price) || 0) - (Number(a.price) || 0)
  }[how] || null;
  return by ? list.slice().sort(by) : list;
}

// ---------- buyers: who a tour was for, and what they thought ----------
// A tour's buyer is its `buyer` field; tours saved before 2026-10-24 carry it
// only in the name ("Smiths · home tour").
export function buyerOf(t) {
  const b = String(t.buyer || '').trim();
  if (b) return b;
  const m = String(t.name || '').match(/^(.+?)\s*·\s*home tour$/i);
  return m ? m[1].trim() : '';
}
export const buyerKey = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Every buyer, newest tour first, each with the homes they saw (newest first).
// A home seen twice shows once, with its latest reaction.
export function buyers(tours) {
  const by = new Map();
  for (const t of tours || []) {
    const name = buyerOf(t);
    if (!name) continue;
    const k = buyerKey(name);
    if (!by.has(k)) by.set(k, { key: k, name, tours: [], homes: new Map(), last: '' });
    const b = by.get(k);
    b.tours.push(t);
    if (String(t.date) > b.last) { b.last = String(t.date); b.name = name; }
    for (const s of t.stops || []) {
      if (s.pickup) continue; // gear picked up on the way is not a home they saw
      if (!s.shown && !s.reaction) continue;
      if (s.hide_from_buyer) continue; // unticked "Add to <buyer>'s buyer page"
      const hk = s.property_id || buyerKey(s.address);
      const seen = { address: s.address, property_id: s.property_id || null, date: t.date, tour_id: t.id, stop_id: s.id, reaction: s.reaction || null, note: s.reaction_note || '', at: s.reaction_at || '', mls_url: s.mls_url || '' };
      const prev = b.homes.get(hk);
      if (!prev || `${seen.date}${seen.at}` >= `${prev.date}${prev.at}`) b.homes.set(hk, seen);
    }
  }
  return [...by.values()]
    .map((b) => ({ ...b, tours: b.tours.sort((x, y) => String(y.date).localeCompare(String(x.date))), homes: [...b.homes.values()].sort((x, y) => `${y.date}${y.at}`.localeCompare(`${x.date}${x.at}`)) }))
    .sort((a, b) => b.last.localeCompare(a.last) || a.name.localeCompare(b.name));
}

// ---------- the weekly seller update (2026-10-27) ----------
// Sara: "build it as described". What happened at a listing in the last 7
// days, and what is next, from what is already in Bestie: showings (our own
// tour stops marked shown, and showing appointments), "Showing feedback"
// notes, open house sign-ins (counts only, never names), the next 14 days.
const dayOf = (v) => String(v || '').slice(0, 10);
export function sellerStats(data, pid, today) {
  const p = (data.properties || []).find((x) => x.id === pid) || {};
  const from = addDays(today, -6);
  const inWeek = (d) => d && d >= from && d <= today;
  const showings = [];
  for (const e of data.events || []) if (e.property_id === pid && !e.cancelled && e.kind === 'showing' && e.date && e.date <= today) showings.push(e.date);
  for (const t of data.tours || []) for (const s of t.stops || []) if (s.property_id === pid && s.shown && t.date && t.date <= today) showings.push(t.date);
  const since = p.list_date || null;
  const visitors = (data.visitors || []).filter((v) => v.property_id === pid && inWeek(v.oh_date));
  const feedback = (data.notes || [])
    .filter((n) => n.property_id === pid && /^showing feedback:/i.test(n.text || '') && inWeek(dayOf(n.created_at)))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((n) => n.text.replace(/^showing feedback:\s*/i, '').trim()).filter(Boolean);
  const end = addDays(today, 14);
  const next = [];
  for (const e of data.events || []) if (e.property_id === pid && !e.cancelled && e.date > today && e.date <= end) next.push({ date: e.date, label: e.kind === 'open' ? 'Open house' : e.title || 'Appointment', kind: e.kind || '' });
  for (const d of data.dates || []) if (d.property_id === pid && !d.done && d.due > today && d.due <= end) next.push({ date: d.due, label: d.label, kind: 'date' });
  next.sort((a, b) => a.date.localeCompare(b.date));
  const dom = since && since <= today ? Math.round((new Date(today + 'T12:00:00Z') - new Date(since + 'T12:00:00Z')) / 864e5) : null;
  return {
    showingsWeek: showings.filter(inWeek).length,
    showingsTotal: showings.filter((d) => !since || d >= since).length,
    feedback,
    openHouse: {
      visitors: visitors.length,
      unrepresented: visitors.filter((v) => v.has_agent === false).length,
      selling: visitors.filter((v) => v.also_selling === true).length,
      held: (data.events || []).some((e) => e.property_id === pid && !e.cancelled && e.kind === 'open' && inWeek(e.date)) || visitors.length > 0
    },
    next: next.slice(0, 4),
    dom
  };
}

// My listings whose seller has not had an update in 7 days.
export function sellerUpdatesDue(props, today, who = null) {
  const cut = addDays(today, -6);
  return (props || []).filter((p) => p.status === 'listing' && isWhose(p.owner, who) && (!p.seller_update_at || dayOf(p.seller_update_at) < cut));
}

// Past due (2026-10-28): due for a full extra week, i.e. the last update was
// 14+ days ago, or none was ever sent and the listing went live 14+ days ago.
// A new listing with no update yet is due, never past due.
export function sellerUpdatesPastDue(props, today, who = null) {
  const cut = addDays(today, -13);
  return sellerUpdatesDue(props, today, who).filter((p) => (p.seller_update_at ? dayOf(p.seller_update_at) < cut : !!p.list_date && dayOf(p.list_date) < cut));
}

// ---------- at the door (2026-10-27) ----------
// Every code for one tour stop, biggest first: the code typed on the stop,
// then the property's saved codes (gate, lockbox, alarm...), each once.
export function doorCodes(stop, saved = [], kindLabel = (k) => k) {
  const out = [];
  const seen = new Set();
  const add = (label, code, where = '') => {
    const v = String(code || '').trim();
    if (!v || seen.has(v.toUpperCase())) return;
    seen.add(v.toUpperCase());
    out.push({ label: label || 'Code', code: v, where });
  };
  if (stop) add(stop.code_label && stop.code_label !== 'Code' ? stop.code_label : 'Code', stop.code);
  for (const a of saved) {
    // The same code saved on the property: the stop's copy takes its id, so
    // "worked / didn't work" lands on the saved code.
    const same = out.find((o) => o.code.toUpperCase() === String(a.code || '').trim().toUpperCase());
    if (same) { if (!same.id && a.id) Object.assign(same, { id: a.id, where: same.where || a.location_note || '' }); continue; }
    add(a.label || kindLabel(a.kind), a.code, a.location_note || '');
    if (a.id && out.length && out[out.length - 1].code === String(a.code || '').trim()) out[out.length - 1].id = a.id;
  }
  return out;
}

// Code last worked (2026-10-29): the newer of "worked" and "didn't work",
// in plain words. `me` is my first name, so my own reads "you".
export function codeTrust(a, { now = Date.now(), me = '' } = {}) {
  if (!a) return null;
  const w = a.worked_at ? Date.parse(a.worked_at) : 0;
  const f = a.failed_at ? Date.parse(a.failed_at) : 0;
  if (!w && !f) return null;
  const bad = f > w;
  const at = bad ? f : w;
  const by = String((bad ? a.failed_by : a.worked_by) || '').trim().toLowerCase();
  const who = !by ? '' : by === String(me || '').toLowerCase() ? 'you' : by[0].toUpperCase() + by.slice(1);
  const days = Math.floor((now - at) / 86400000);
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 60 ? `${days} days ago` : `on ${new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  return bad
    ? { bad: true, words: `Reported not working${who ? ` by ${who}` : ''} ${when}` }
    : { bad: false, words: `Worked${who ? ` for ${who}` : ''} ${when}` };
}

// Heads-up words for the door (2026-10-28): plain words under the address.
// Occupied is shown by its own badge, so it is not repeated here. Read from
// what is already saved: a dog or an alarm named in the notes, an alarm code.
// Phase 9c adds one-tap tags on the property; they join this list.
// Phase 9c: the one-tap tags saved on the property (`heads_up`), in this
// order. "Occupied" is the occupancy field and shows as its own badge.
export const HEADS_UP = ['Dog', 'Cattle guard', 'Livestock', 'Low branches', 'Steep drive', 'No turnaround', 'Well head', 'Septic lid', 'Occupied', 'Alarm'];
export function headsUp(stop, prop, codes = []) {
  const text = [stop && stop.access_note, stop && stop.notes, prop && prop.showing_notes, prop && prop.directions].join(' ');
  const set = new Set(((prop && prop.heads_up) || []).filter((t) => HEADS_UP.includes(t) && t !== 'Occupied'));
  if (/\bdogs?\b|\bpuppy\b/i.test(text)) set.add('Dog');
  if (codes.some((c) => /alarm/i.test(c.label)) || /\balarm\b/i.test(text)) set.add('Alarm');
  return HEADS_UP.filter((t) => set.has(t));
}

// ---------- feedback from agents who showed MY listing (2026-10-27) ----------
// A showing on one of my listings that has happened in the last 7 days:
// 'ask' when the showing agent has not been asked yet, 'log' once asked and
// their answer is not in yet. Drops off when logged or after 7 days.
export function feedbackDue(data, today, nowMin, who = null) {
  const props = new Map((data.properties || []).map((p) => [p.id, p]));
  const from = addDays(today, -7);
  const out = [];
  for (const e of data.events || []) {
    const p = props.get(e.property_id);
    if (!p || p.status !== 'listing' || e.kind !== 'showing' || e.cancelled || e.feedback_logged_at) continue;
    if (!isWhose(p.owner, who) || !e.date || e.date < from || e.date > today) continue;
    const over = e.date < today || (e.start_minutes != null && nowMin >= e.start_minutes + (e.minutes || 30));
    if (!over) continue;
    out.push({ event: e, property: p, stage: e.feedback_asked_at ? 'log' : 'ask' });
  }
  return out.sort((a, b) => String(b.event.date).localeCompare(String(a.event.date)));
}

// ---------- the tax year (2026-10-27) ----------
// One year of drives and expenses: totals, by month, and what a preparer will
// ask about (a drive with no purpose, an expense with no receipt photo).
export function taxYear(trips, expenses, year, rate = 0) {
  const y = String(year);
  const ts = (trips || []).filter((t) => String(t.date || '').startsWith(y));
  const es = (expenses || []).filter((e) => String(e.date || '').startsWith(y));
  const months = Array.from({ length: 12 }, (_, i) => ({ month: `${y}-${String(i + 1).padStart(2, '0')}`, miles: 0, spent: 0, drives: 0 }));
  for (const t of ts) { const m = months[Number(String(t.date).slice(5, 7)) - 1]; if (m) { m.miles += Number(t.miles || 0); m.drives++; } }
  for (const e of es) { const m = months[Number(String(e.date).slice(5, 7)) - 1]; if (m) m.spent += Number(e.amount || 0); }
  const miles = months.reduce((s, m) => s + m.miles, 0);
  const spent = months.reduce((s, m) => s + m.spent, 0);
  return {
    year: y, months, miles, spent, drives: ts.length, expenses: es.length,
    deduction: rate ? Math.round(miles * rate * 100) / 100 : null,
    noPurpose: ts.filter((t) => !String(t.purpose || '').trim()).length,
    noReceipt: es.filter((e) => !e.photo_id).length
  };
}

export function taxCsv(trips, expenses, year, addressOf = () => '') {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const y = String(year);
  const lines = [[`Mileage log ${y}`].map(q).join(','), ['Date', 'Purpose', 'From', 'To', 'Property', 'Miles'].map(q).join(',')];
  for (const t of (trips || []).filter((x) => String(x.date || '').startsWith(y)).sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    lines.push([t.date, t.purpose, t.from_place, t.to_place, addressOf(t.property_id), Number(t.miles || 0).toFixed(1)].map(q).join(','));
  }
  lines.push('', [`Expenses ${y}`].map(q).join(','), ['Date', 'What', 'Property', 'Amount', 'Receipt photo'].map(q).join(','));
  for (const e of (expenses || []).filter((x) => String(x.date || '').startsWith(y)).sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    lines.push([e.date, e.what, addressOf(e.property_id), Number(e.amount || 0).toFixed(2), e.photo_id ? 'yes' : 'no'].map(q).join(','));
  }
  return lines.join('\n');
}

// ---------- Today changes with the time of day (2026-10-28, phase 5) ----------
// 'plan' before the first event (and between events with no showing near),
// 'field' during a tour or from 90 minutes before a showing to its end, 'wrap'
// once everything booked today is over. Nothing booked: 'plan'.
export const FIELD_LEAD = 90;
export function todayMode(data, today, nowMin) {
  const spans = [];
  for (const e of data.events || []) {
    if (e.date !== today || e.cancelled || e.start_minutes == null) continue;
    spans.push({ type: 'event', id: e.id, showing: e.kind === 'showing', start: e.start_minutes, end: e.start_minutes + (e.minutes || 30), done: !!e.done });
  }
  for (const t of data.tours || []) {
    if (t.date !== today) continue;
    const stops = t.stops || [];
    const times = stops.map((s) => s.arrive).filter((x) => x != null);
    const start = times.length ? Math.min(...times) : t.start_minutes;
    if (start == null) continue;
    const end = (times.length ? Math.max(...times) : start) + 30;
    const done = !!t.finished || (stops.length > 0 && stops.every((s) => s.shown));
    spans.push({ type: 'tour', id: t.id, showing: true, start, end, done, started: stops.some((s) => s.shown) });
  }
  if (!spans.length) return { mode: 'plan', spans };
  // A tour that has begun stays in the field until it is done (or long past).
  const live = spans.find((s) => s.type === 'tour' && !s.done && (s.started || nowMin >= s.start - FIELD_LEAD) && nowMin <= s.end + 120);
  if (live) return { mode: 'field', focus: live, spans };
  const near = spans.find((s) => s.showing && !s.done && nowMin >= s.start - FIELD_LEAD && nowMin <= s.end);
  if (near) return { mode: 'field', focus: near, spans };
  const open = spans.filter((s) => !s.done && s.end >= nowMin);
  if (!open.length) return { mode: 'wrap', spans };
  return { mode: 'plan', spans };
}

// About how long the spoken briefing runs ("about 40 sec", "about 2 min").
export function listenLength(text) {
  const words = String(text || '').split(/\s+/).filter(Boolean).length;
  const secs = Math.max(10, Math.round(words / 2.6 / 5) * 5);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}
