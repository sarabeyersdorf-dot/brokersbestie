// What one phone should be reminded of right now. Pure, so it is tested in
// Node (test/reminders.test.mjs) and run by the Edge Function every 5 minutes.
//
//  - an appointment or a tour with a start time: `lead` minutes before it, or,
//    when Bestie knows where the agent is (last location from the phone, else
//    their home base) and where the appointment is, at the time to LEAVE:
//    drive time (straight line x 1.35 road factor at 40 mph, as route.js) + 5
//    minutes to park (2026-10-27, "Leave now: 22 min to 433 E Hwy 4")
//  - the morning list (7:30 their time): today's deadlines, to-dos and the
//    count of appointments, once a day, only when there is something
//  - a safety check-in whose time is up: "Are you OK?", to that agent only
// Each reminder has a key; the function sends a key once, ever.

export function localNow(now, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, min: Number(parts.hour) * 60 + Number(parts.minute) };
}

const clock = (m) => { const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0'); return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'AM' : 'PM'}`; };
const street = (a) => String(a || '').split(',')[0].trim();
// Whose: an item with no owner (or "both") is the whole team's.
export const forOwner = (itemOwner, subOwner) => !itemOwner || itemOwner === 'both' || !subOwner || itemOwner === subOwner;

export const MORNING_MIN = 7 * 60 + 30;
export const PARK_MIN = 5;
const FRESH_MS = 3 * 3600e3; // a phone location older than this is not used

function miles(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}
export const driveMin = (a, b) => Math.round(((miles(a, b) * 1.35) / 40) * 60);
// Where the agent is starting from: the phone's last location when fresh,
// else their home base, else unknown.
export function originOf(sub, now = new Date()) {
  if (sub.from_lat != null && sub.from_lng != null && sub.from_at && now - new Date(sub.from_at) < FRESH_MS) return { lat: sub.from_lat, lng: sub.from_lng };
  if (sub.base_lat != null && sub.base_lng != null) return { lat: sub.base_lat, lng: sub.base_lng };
  return null;
}

export function dueReminders(sub, data, now = new Date()) {
  const { day, min } = localNow(now, sub.tz);
  const lead = Number(sub.lead_minutes) || 30;
  const props = new Map((data.properties || []).map((p) => [p.id, p]));
  const ownerOf = (own, pid) => own || (props.get(pid) || {}).owner || null;
  const out = [];
  const soon = (start) => start != null && start > min && start - min <= lead;

  const origin = originOf(sub, now);
  for (const e of data.events || []) {
    if (e.date !== day || e.cancelled || e.done || e.start_minutes == null || e.start_minutes <= min) continue;
    if (!forOwner(ownerOf(e.owner, e.property_id), sub.owner)) continue;
    const p = props.get(e.property_id) || {};
    const where = e.location || street(p.address);
    const url = e.property_id ? `#/p/${e.property_id}` : '#/calendar';
    const key = `ev:${e.id}:${e.date}:${e.start_minutes}`;
    const drive = origin && p.lat != null && p.lng != null ? driveMin(origin, p) : null;
    if (drive != null && drive >= 3) {
      const leave = e.start_minutes - drive - PARK_MIN;
      if (min >= leave) out.push({ key, title: `Leave now: ${e.title || 'Appointment'} at ${clock(e.start_minutes)}`, body: `About ${drive} min to ${street(p.address) || where}`, url });
    } else if (soon(e.start_minutes)) {
      out.push({ key, title: `${e.title || 'Appointment'} at ${clock(e.start_minutes)}`, body: [where, `in ${e.start_minutes - min} min`].filter(Boolean).join(' · '), url });
    }
  }
  for (const t of data.tours || []) {
    if (t.date !== day || t.finished || !soon(t.start_minutes)) continue;
    if (!forOwner(t.owner, sub.owner)) continue;
    const n = (t.stops || []).length;
    out.push({ key: `tour:${t.id}:${t.date}:${t.start_minutes}`, title: `${t.name || 'Showing tour'} at ${clock(t.start_minutes)}`, body: `${n} stop${n === 1 ? '' : 's'} · in ${t.start_minutes - min} min`, url: `#/tour/${t.id}` });
  }
  if (min >= MORNING_MIN && min < 12 * 60) {
    const dl = (data.dates || []).filter((d) => d.due === day && !d.done && forOwner(ownerOf(null, d.property_id), sub.owner));
    const todo = (data.tasks || []).filter((t) => t.due === day && !t.done && forOwner(ownerOf(t.owner, t.property_id), sub.owner));
    const appts = (data.events || []).filter((e) => e.date === day && !e.cancelled && forOwner(ownerOf(e.owner, e.property_id), sub.owner)).length
      + (data.tours || []).filter((t) => t.date === day && forOwner(t.owner, sub.owner)).length;
    if (dl.length || todo.length) {
      const bits = [];
      if (dl.length) bits.push(dl.length === 1 ? `Due today: ${dl[0].label}${props.get(dl[0].property_id) ? ' · ' + street(props.get(dl[0].property_id).address) : ''}` : `${dl.length} deadlines due today`);
      if (todo.length) bits.push(todo.length === 1 ? `To do: ${todo[0].text}` : `${todo.length} to-dos`);
      if (appts) bits.push(`${appts} on the calendar`);
      out.push({ key: `am:${day}`, title: 'Today in Bestie', body: bits.join(' · '), url: '#/' });
    }
  }
  for (const c of data.checkins || []) {
    if (c.status !== 'active' || !c.due_at || !sub.user_id || c.user_id !== sub.user_id) continue;
    if (new Date(c.due_at) > now) continue;
    out.push({ key: `ck:${c.id}:${c.due_at}`, title: 'Safety check-in: are you OK?', body: `Your time is up${c.place ? ' at ' + street(c.place) : ''}. Open Bestie and tap I'm OK.`, url: '#/safety' });
  }
  return out;
}
