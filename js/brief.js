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

// Everything on one day, timed items first in time order, then all-day ones.
// kind: event | tour | date | task. Each item carries what the screen needs.
export function dayItems(data, day) {
  const items = [];
  for (const e of data.events || []) {
    if (e.date !== day) continue;
    items.push({ kind: 'event', id: e.id, start: e.start_minutes ?? null, minutes: e.minutes || null, title: e.title || 'Appointment', where: e.location || where(data, e.property_id), property_id: e.property_id || null, done: !!e.done, sub: e.kind || '' });
  }
  for (const t of data.tours || []) {
    if (t.date !== day) continue;
    const stops = t.stops || [];
    items.push({ kind: 'tour', id: t.id, start: t.start_minutes ?? null, title: t.name || 'Showing tour', where: `${stops.length} stop${stops.length === 1 ? '' : 's'}`, done: !!t.finished });
  }
  for (const d of data.dates || []) {
    if (d.due !== day) continue;
    items.push({ kind: 'date', id: d.id, start: null, title: d.label, where: where(data, d.property_id), property_id: d.property_id || null, done: !!d.done });
  }
  for (const t of data.tasks || []) {
    if (t.due !== day || t.done) continue;
    items.push({ kind: 'task', id: t.id, start: null, title: t.text, where: where(data, t.property_id), property_id: t.property_id || null, done: false });
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
  const deadlines = (data.dates || []).filter((d) => !d.done && d.due > today && d.due <= week).sort((a, b) => a.due.localeCompare(b.due));
  const closings = (data.properties || []).filter((p) => p.status === 'escrow' && p.coe_date && p.coe_date >= today && p.coe_date <= week);
  const lateDates = (data.dates || []).filter((d) => !d.done && d.due && d.due < today && d.due >= addDays(today, -14));
  return { day: today, today: todayItems, late, deadlines, closings, lateDates, pickups, quiet: !todayItems.length && !late.length && !deadlines.length && !closings.length && !lateDates.length && !pickups };
}

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const weekday = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

// The same briefing in sentences, for reading aloud.
export function briefingText(b, data, { name, hello = 'Good morning' } = {}) {
  const lines = [`${hello}${name ? ', ' + name : ''}.`];
  if (b.quiet) return [...lines, 'Nothing is on the calendar today and nothing is late.'].join(' ');
  const timed = b.today.filter((i) => i.start != null && i.kind !== 'task');
  const allDay = b.today.filter((i) => i.start == null || i.kind === 'task');
  if (timed.length) {
    lines.push(`Today you have ${plural(timed.length, 'appointment')}.`);
    for (const i of timed) lines.push(`At ${formatClock(i.start)}, ${i.title}${i.where && i.kind !== 'tour' ? ' at ' + i.where : ''}.`);
  } else lines.push('No appointments today.');
  if (allDay.length) lines.push(`Also due today: ${allDay.map((i) => i.title).join('; ')}.`);
  if (b.late.length) lines.push(`${plural(b.late.length, 'to-do')} ${b.late.length === 1 ? 'is' : 'are'} overdue: ${b.late.slice(0, 3).map((t) => t.text).join('; ')}.`);
  if (b.lateDates.length) lines.push(`${plural(b.lateDates.length, 'deadline')} passed without being marked done: ${b.lateDates.slice(0, 3).map((d) => `${d.label} at ${where(data, d.property_id)}`).join('; ')}.`);
  for (const p of b.closings) lines.push(`${p.address} closes ${p.coe_date === b.day ? 'today' : p.coe_date === addDays(b.day, 1) ? 'tomorrow' : weekday(p.coe_date)}.`);
  if (b.deadlines.length) lines.push(`Coming up this week: ${b.deadlines.slice(0, 4).map((d) => `${d.label}${where(data, d.property_id) ? ' at ' + where(data, d.property_id) : ''} on ${weekday(d.due)}`).join('; ')}.`);
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
