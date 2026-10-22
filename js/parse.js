// Turning what an agent says or pastes into data, and searching it. Pure
// functions, tested in test/parse.test.mjs.

import { parseClock } from './route.js';

const SMALL = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

// Speech engines usually write "11:30", but "eleven thirty" and "ten" happen.
export function wordsToClock(text) {
  const t = String(text || '').toLowerCase().trim();
  const direct = parseClock(t.replace(/\s+/g, ' ').replace(/\b(o'?clock)\b/, '').trim());
  if (direct != null) return direct;
  const m = t.match(/^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s+(fifteen|thirty|forty[- ]five|o'?clock))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  const mins = { fifteen: 15, thirty: 30, 'forty-five': 45, 'forty five': 45 }[m[2]] || 0;
  return parseClock(`${SMALL[m[1]]}:${String(mins).padStart(2, '0')}${m[3] ? ' ' + m[3] : ''}`);
}

const TIME_WORD = '(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)?|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\\s+(?:fifteen|thirty|forty[- ]five))?\\s*(?:am|pm)?)';

// "Start at the office at ten. 433 East Highway 4 Murphys, 701 Mark Twain at
// 11:30 and 635 South Main" -> start time, start place, and one stop per address.
// A new stop begins wherever a street number begins.
export function parseTourText(text) {
  let rest = ` ${String(text || '').replace(/[ \t]+/g, ' ')} `;
  let startMinutes = null;
  let startPlace = null;
  const startRe = new RegExp(`\\bstart(?:ing)?\\s+(?:(?:at|from)\\s+(?:the\\s+)?([a-z][a-z' ]{1,30}?)\\s+)?at\\s+${TIME_WORD}`, 'i');
  const sm = rest.match(startRe);
  if (sm) {
    startPlace = sm[1] ? sm[1].trim() : null;
    startMinutes = wordsToClock(sm[2]);
    rest = rest.replace(sm[0], ' ');
  }
  // Break at commas, line ends, sentence ends and "and/then/next". A piece that
  // starts with a street number is a new stop; one that doesn't ("Valley
  // Springs" after a comma) belongs to the stop before it.
  const pieces = rest.split(/[,;\n]|\.\s|\s(?:and|then|next)\s/i).map((c) => c.trim()).filter(Boolean);
  const stops = [];
  for (const raw of pieces) {
    let c = raw.replace(/[.]+$/, '');
    let at = null;
    const tm = c.match(new RegExp(`(?:^|\\s+)(?:at|for)\\s+${TIME_WORD}\\s*$`, 'i'));
    if (tm) {
      at = wordsToClock(tm[1]);
      c = c.slice(0, tm.index).trim();
    }
    if (/^\d{1,6}\s+[A-Za-z]/.test(c)) {
      stops.push({ address: tidyAddress(c), at });
    } else if (stops.length) {
      const last = stops[stops.length - 1];
      if (c) last.address = tidyAddress(`${last.address}, ${c}`);
      if (at != null) last.at = at;
    }
  }
  return { startMinutes, startPlace, stops };
}

const ABBR = [
  [/\beast\b/gi, 'E'], [/\bwest\b/gi, 'W'], [/\bnorth\b/gi, 'N'], [/\bsouth\b/gi, 'S'],
  [/\bstreet\b/gi, 'St'], [/\broad\b/gi, 'Rd'], [/\bdrive\b/gi, 'Dr'], [/\blane\b/gi, 'Ln'],
  [/\bavenue\b/gi, 'Ave'], [/\bcourt\b/gi, 'Ct'], [/\bhighway\b/gi, 'Hwy'], [/\bcircle\b/gi, 'Cir']
];

export function tidyAddress(s) {
  let out = String(s).trim();
  for (const [re, to] of ABBR) out = out.replace(re, to);
  return out.replace(/\s{2,}/g, ' ');
}

// The street part ("433 E Hwy 4") for matching a spoken address to a saved one.
function streetKey(s) {
  return tidyAddress(String(s || '')).toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 3).join(' ');
}

export function matchProperty(address, properties) {
  const k = streetKey(address);
  if (!k) return null;
  const hits = properties.filter((p) => streetKey(p.address) === k);
  return hits.length === 1 ? hits[0] : null; // two possible matches: ask, don't guess
}

// Search everything the agent has saved. Every word must match somewhere.
export function search(query, data) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const propById = new Map((data.properties || []).map((p) => [p.id, p]));
  const where = (pid) => (propById.get(pid) || {}).address || '';
  const rows = [];
  for (const p of data.properties || []) rows.push({ kind: 'Property', title: p.address, sub: [p.city, p.mls && `MLS ${p.mls}`].filter(Boolean).join(' · '), propertyId: p.id, text: [p.address, p.city, p.mls, p.showing_notes, p.directions].join(' ') });
  for (const a of data.access || []) rows.push({ kind: 'Access', title: `${a.label || a.kind}${a.code ? ' · ' + a.code : ''}`, sub: [where(a.property_id), a.location_note].filter(Boolean).join(' · '), propertyId: a.property_id, text: [a.kind, a.label, a.code, a.location_note, where(a.property_id)].join(' ') });
  for (const m of data.people || []) rows.push({ kind: 'Person', title: m.name, sub: [m.role, where(m.property_id)].filter(Boolean).join(' · '), propertyId: m.property_id, text: [m.name, m.role, m.phone, m.email, where(m.property_id)].join(' ') });
  for (const n of data.notes || []) rows.push({ kind: 'Note', title: n.text.length > 70 ? n.text.slice(0, 70) + '…' : n.text, sub: where(n.property_id), propertyId: n.property_id, text: [n.text, where(n.property_id)].join(' ') });
  for (const t of data.tasks || []) rows.push({ kind: 'To do', title: t.text, sub: [where(t.property_id), t.due].filter(Boolean).join(' · '), propertyId: t.property_id, text: [t.text, where(t.property_id)].join(' ') });
  for (const d of data.dates || []) rows.push({ kind: 'Date', title: d.label, sub: [where(d.property_id), d.due].filter(Boolean).join(' · '), propertyId: d.property_id, text: [d.label, where(d.property_id)].join(' ') });
  return rows.filter((r) => {
    const hay = r.text.toLowerCase();
    return words.every((w) => hay.includes(w));
  }).map(({ text, ...r }) => r);
}

// Trips -> a CSV a tax preparer can open.
export function tripsCsv(trips, properties = []) {
  const byId = new Map(properties.map((p) => [p.id, p.address]));
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Date', 'Purpose', 'From', 'To', 'Property', 'Miles'].map(q).join(',')];
  for (const t of trips.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    lines.push([t.date, t.purpose, t.from_place, t.to_place, byId.get(t.property_id) || '', Number(t.miles || 0).toFixed(1)].map(q).join(','));
  }
  return lines.join('\n');
}
