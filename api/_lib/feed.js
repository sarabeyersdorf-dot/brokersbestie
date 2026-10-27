// CRM feeds in, calendar feed out. Pure functions, tested in test/feed.test.mjs.
//
// Bestie Feed v1 is the one shape a CRM hands us (the Legacy CRM serves it at
// /api/crm/bestie-feed; any other CRM can too):
//   { format: 'bestie-feed/1', properties: [{ ext_id, address, city, status,
//     price, mls, coe_date, agent, and optionally list_date, portal_url,
//     marketing: { listtrac: { views, last30, shares, favorites, inquiries,
//     as_of }, homes: { views, favorites, as_of } } }], people: [{ ext_id, property_ext, name, role,
//     phone, email }], dates: [{ ext_id, property_ext, label, due, done }],
//     events: [{ ext_id, property_ext, title, kind, date, start, minutes,
//     location, with }] }
// Times are the agent's wall clock: date 'YYYY-MM-DD', start minutes after
// midnight (null = all day).

const STATUSES = ['listing', 'prep', 'escrow', 'tour', 'closed', 'cancelled'];
const s = (v, n = 300) => (v == null ? '' : String(v).slice(0, n));
const day = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null);
const int = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v)) : null);

// The id a CRM row gets in our tables: stable, so the next sync updates the
// same row, and scoped to the team, so two teams on one feed never collide.
// Only plain characters, so the id is safe inside a database filter.
// A CRM's agent field ("sara", "James Beyersdorf", "both") -> an owner key:
// the first name in lower case. Empty -> null (the whole team).
export const ownerKey = (v) => (String(v || '').trim().split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z'-]/g, '') || null;

export const crmId = (teamId, kind, ext) => `crm:${teamId}:${kind}:${s(ext, 200).replace(/[^A-Za-z0-9._:@-]/g, '_')}`;

// A listing's online numbers, by source (ListTrac, Homes.com). Numbers only.
function marketingOf(m) {
  if (!m || typeof m !== 'object') return null;
  const out = {};
  for (const [src, keys] of [['listtrac', ['views', 'last30', 'shares', 'favorites', 'inquiries']], ['homes', ['views', 'favorites']]]) {
    const x = m[src];
    if (!x || typeof x !== 'object') continue;
    const row = Object.fromEntries(keys.map((k) => [k, int(x[k])]));
    if (keys.every((k) => row[k] == null)) continue;
    out[src] = { ...row, as_of: day(x.as_of) };
  }
  return Object.keys(out).length ? out : null;
}

// The CRM owns what it sends (address, status, price, dates); codes, notes,
// photos, directions and map pins are the agent's and are never in these rows.
export function mapFeed(feed, teamId) {
  if (!feed || feed.format !== 'bestie-feed/1') throw new Error('That link is not a Bestie feed');
  const props = (feed.properties || []).filter((p) => p && p.ext_id && p.address);
  const pid = new Map(props.map((p) => [String(p.ext_id), crmId(teamId, 'p', p.ext_id)]));
  const at = (ext) => (ext != null && pid.has(String(ext)) ? pid.get(String(ext)) : null);
  const owners = new Map(props.map((p) => [String(p.ext_id), ownerKey(p.agent)]));
  const ownerOf = (ext) => (ext != null ? owners.get(String(ext)) || null : null);
  return {
    properties: props.map((p) => ({
      id: pid.get(String(p.ext_id)), team_id: teamId, source: 'crm',
      address: s(p.address, 200), city: s(p.city, 120),
      status: STATUSES.includes(p.status) ? p.status : 'listing',
      price: Number.isFinite(Number(p.price)) && p.price !== null ? Number(p.price) : null,
      mls: s(p.mls, 40), coe_date: day(p.coe_date), owner: ownerKey(p.agent),
      // Only when the CRM sends them, so a date the agent typed is kept.
      ...(day(p.list_date) ? { list_date: day(p.list_date) } : {}),
      ...(/^https:\/\//.test(String(p.portal_url || '')) ? { portal_url: s(p.portal_url, 300) } : {}),
      ...(marketingOf(p.marketing) ? { marketing: marketingOf(p.marketing) } : {})
    })),
    people: (feed.people || []).filter((m) => m && m.ext_id && m.name && at(m.property_ext)).map((m) => ({
      id: crmId(teamId, 'm', m.ext_id), team_id: teamId, source: 'crm', property_id: at(m.property_ext),
      name: s(m.name, 120), role: s(m.role, 60), phone: s(m.phone, 40), email: s(m.email, 120)
    })),
    // `done` is not in these rows: a deadline ticked off on the phone must stay
    // ticked. The CRM's own "done" is applied separately (doneDates) and only
    // ever ticks, never un-ticks.
    dates: (feed.dates || []).filter((d) => d && d.ext_id && day(d.due) && at(d.property_ext)).map((d) => ({
      id: crmId(teamId, 'd', d.ext_id), team_id: teamId, source: 'crm', property_id: at(d.property_ext),
      label: s(d.label, 120) || 'Deadline', due: day(d.due)
    })),
    // A CRM's own task list is NOT brought in (Sara, 2026-10-23: "this is
    // getting too much like a crm ... remove the CRM tasks"). Bestie is the
    // field companion: properties, codes, contacts, appointments, deadlines.
    doneDates: (feed.dates || []).filter((d) => d && d.ext_id && d.done && day(d.due) && at(d.property_ext)).map((d) => crmId(teamId, 'd', d.ext_id)),
    // `done` is left out on purpose: ticking an appointment off on the phone
    // must survive the next sync.
    events: (feed.events || []).filter((e) => e && e.ext_id && day(e.date)).map((e) => ({
      id: crmId(teamId, 'e', e.ext_id), team_id: teamId, source: 'crm', property_id: at(e.property_ext),
      title: s(e.title, 160) || 'Appointment', kind: s(e.kind, 30) || 'other', date: day(e.date),
      start_minutes: int(e.start), minutes: int(e.minutes), location: s(e.location, 200),
      notes: e.with ? `With ${s(e.with, 120)}` : '',
      owner: ownerKey(e.agent) || ownerOf(e.property_ext)
    }))
  };
}

// ---------- the way back: phone changes -> the CRM ----------
//
// POST { format: 'bestie-feed/1', changes } to the same feed link. Two kinds:
//   { type: 'date', ext_id, done }
//   { type: 'event', ext_id (null = new), property_ext, title, kind, date,
//     start, minutes, location, notes, cancelled }
// The CRM answers { results: [{ ok, ext_id?, error? }] } in the same order.

// "crm:<team>:<kind>:<ext>" -> "<ext>", or null for a row that is not the CRM's.
export function extOf(id, kind) {
  const p = String(id || '').split(':');
  return p[0] === 'crm' && p.length >= 4 && (!kind || p[2] === kind) ? p.slice(3).join(':') : null;
}

// Rows marked crm_dirty -> the changes to send. Each keeps _id/_table/_row so
// the result can be matched back; those are stripped before sending.
export function pushChanges({ dates = [], events = [] }) {
  const out = [];
  for (const d of dates) {
    const ext = d.source === 'crm' ? extOf(d.id, 'd') : null;
    if (ext) out.push({ type: 'date', ext_id: ext, done: !!d.done, _id: d.id, _table: 'dates', _row: d });
  }
  for (const e of events) {
    const ext = e.source === 'crm' ? extOf(e.id, 'e') : null;
    const prop = extOf(e.property_id, 'p');
    if (!ext && !prop) continue; // not about anything the CRM knows
    if (!ext && e.cancelled) { out.push({ type: 'event', ext_id: null, cancelled: true, _id: e.id, _table: 'events', _row: e }); continue; }
    out.push({
      type: 'event', ext_id: ext, property_ext: prop, title: e.title || '', kind: e.kind || 'other',
      date: e.date, start: e.start_minutes ?? null, minutes: e.minutes ?? null, location: e.location || '',
      notes: ext ? undefined : (e.notes || ''), cancelled: !!e.cancelled,
      _id: e.id, _table: 'events', _row: e
    });
  }
  return out;
}

// ---------- the calendar a phone subscribes to (.ics) ----------

const esc = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const ymd = (d) => d.replace(/-/g, '');
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}00`;
function nextDay(d) {
  const t = new Date(d + 'T12:00:00Z');
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
// Lines longer than 75 bytes are folded, as the format requires.
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74); }
  out.push(rest);
  return out.join('\r\n');
}

// items: [{ uid, title, date, start (minutes|null), minutes, location, notes }]
// Times are "floating": the phone shows them in its own time zone, which is
// the agent's, the same way they were typed.
export function icsCalendar(name, items, stamp = new Date()) {
  const now = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Brokers Bestie//Calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(name)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M'];
  for (const it of items) {
    if (!it.date) continue;
    lines.push('BEGIN:VEVENT', `UID:${esc(it.uid)}@brokersbestie.app`, `DTSTAMP:${now}`, `SUMMARY:${esc(it.title)}`);
    if (it.start == null) {
      lines.push(`DTSTART;VALUE=DATE:${ymd(it.date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(it.date))}`);
    } else {
      const end = Math.min(it.start + (it.minutes || 30), 23 * 60 + 59);
      lines.push(`DTSTART:${ymd(it.date)}T${hm(it.start)}`, `DTEND:${ymd(it.date)}T${hm(end)}`);
    }
    if (it.location) lines.push(`LOCATION:${esc(it.location)}`);
    if (it.notes) lines.push(`DESCRIPTION:${esc(it.notes)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
