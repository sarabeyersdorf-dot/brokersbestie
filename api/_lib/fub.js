// Follow Up Boss -> Bestie Feed v1. The agent pastes their own FUB API key in
// Settings; it is stored server-side (crm_links.feed_key) and never sent back
// to a phone. Pull only: nothing is written to Follow Up Boss.
//
// FUB's field names are read tolerantly (stageName or stage.name, etc.)
// because the official reference could not be checked when this was written.
// FUB only returns appointments CREATED IN Follow Up Boss by the key's owner
// (not ones synced in from Google Calendar) - documented FUB behaviour.

const API = 'https://api.followupboss.com/v1';
const DAY = 86400e3;
const str = (v) => (v == null ? '' : String(v)).trim();
const nameOf = (v) => (v && typeof v === 'object' ? str(v.name) : str(v));

// FUB stages are free text the broker named, so read the words.
export function fubStatus(deal) {
  const t = `${nameOf(deal.pipelineName || deal.pipeline)} ${nameOf(deal.stageName || deal.stage)}`.toLowerCase();
  if (/lost|dead|cancel|fell|withdrawn|expired|terminat/.test(t)) return 'cancelled';
  if (/closed|sold|won|funded|recorded/.test(t)) return 'closed';
  if (/contract|pending|escrow|accepted|under/.test(t)) return 'escrow';
  if (/coming soon|pre-?list|prep|listing appointment/.test(t)) return 'prep';
  if (/buy/.test(t)) return 'tour';
  return 'listing';
}

const roleFor = (deal) => {
  const p = nameOf(deal.pipelineName || deal.pipeline).toLowerCase();
  return /buy/.test(p) ? 'Buyer' : /sell|list/.test(p) ? 'Seller' : 'Client';
};

// A UTC instant -> the agent's wall-clock date and minutes after midnight.
export function localParts(iso, tz = 'America/Los_Angeles') {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  let parts;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  } catch { return localParts(iso, 'America/Los_Angeles'); }
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const kindOf = (title, type) => {
  const t = `${title} ${type}`.toLowerCase();
  if (/walk/.test(t)) return 'walkthrough';
  if (/inspect/.test(t)) return 'inspection';
  if (/apprais/.test(t)) return 'appraisal';
  if (/clos|sign/.test(t)) return 'closing';
  if (/open house/.test(t)) return 'open';
  if (/show|tour/.test(t)) return 'showing';
  return 'meeting';
};

// Pure: what came back from FUB -> a Bestie Feed v1 object for mapFeed().
export function fubToFeed({ deals = [], people = [], appointments = [] }, { tz = 'America/Los_Angeles', today = new Date().toISOString().slice(0, 10) } = {}) {
  const byPerson = new Map(people.map((p) => [String(p.id), p]));
  const old = new Date(Date.parse(today) - 120 * DAY).toISOString().slice(0, 10);
  const properties = [], peopleOut = [], dates = [];
  const dealOfPerson = new Map();
  for (const d of deals) {
    if (!d || d.id == null || /deleted/i.test(str(d.status))) continue;
    const address = str(d.name);
    if (!address) continue;
    const status = fubStatus(d);
    const coe = str(d.projectedCloseDate || d.closeDate || d.closingDate).slice(0, 10) || null;
    if ((status === 'closed' || status === 'cancelled') && (!coe || coe < old)) continue;
    const ext = String(d.id);
    const users = d.users || (d.assignedTo ? [{ name: d.assignedTo }] : []);
    properties.push({ ext_id: ext, address, city: '', status, price: d.price ?? null, mls: '', coe_date: coe, agent: nameOf(users[0]) || null });
    if (status === 'escrow' && coe) dates.push({ ext_id: `${ext}-coe`, property_ext: ext, label: 'Close of escrow', due: coe, done: false });
    for (const m of d.people || []) {
      const id = String(m.id ?? m.personId ?? '');
      if (!id) continue;
      if (!dealOfPerson.has(id)) dealOfPerson.set(id, ext);
      const full = byPerson.get(id) || m;
      const phones = full.phones || [];
      const emails = full.emails || [];
      const phone = (phones.find((p) => p.isPrimary) || phones[0] || {}).value || full.phone || '';
      const email = (emails.find((e) => e.isPrimary) || emails[0] || {}).value || full.email || '';
      const name = str(full.name) || [str(full.firstName), str(full.lastName)].filter(Boolean).join(' ') || str(m.name);
      if (name) peopleOut.push({ ext_id: `${ext}-${id}`, property_ext: ext, name, role: roleFor(d), phone, email });
    }
  }
  const events = [];
  for (const a of appointments) {
    if (!a || a.id == null || !a.start) continue;
    const s = localParts(a.start, tz);
    if (!s) continue;
    const allDay = !!a.allDay;
    const end = a.end ? Date.parse(a.end) : NaN;
    const mins = !allDay && Number.isFinite(end) ? Math.max(0, Math.round((end - Date.parse(a.start)) / 60000)) : null;
    const invitees = a.invitees || [];
    const withNames = invitees.filter((i) => i.personId != null).map((i) => str(i.name)).filter(Boolean);
    const linked = invitees.map((i) => dealOfPerson.get(String(i.personId))).find(Boolean) || null;
    const title = str(a.title) || 'Appointment';
    events.push({ ext_id: String(a.id), property_ext: linked, title, kind: kindOf(title, nameOf(a.type)), date: s.date, start: allDay ? null : s.minutes, minutes: mins, location: str(a.location), with: withNames.join(', ') });
  }
  return { format: 'bestie-feed/1', properties, people: peopleOut, dates, events };
}

// ---------- talking to FUB ----------

async function get(key, path, fetchImpl = fetch) {
  const r = await fetchImpl(`${API}${path}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  if (r.status === 401 || r.status === 403) throw new Error('Follow Up Boss refused the API key. Check it in Follow Up Boss: Admin > API.');
  if (r.status === 429) throw new Error('Follow Up Boss asked us to slow down. Try again in a minute.');
  if (!r.ok) throw new Error(`Follow Up Boss answered ${r.status}`);
  return r.json();
}

async function list(key, path, field, max, fetchImpl) {
  const out = [];
  for (let offset = 0; offset < max; offset += 100) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await get(key, `${path}${sep}limit=100&offset=${offset}`, fetchImpl);
    const rows = page[field] || [];
    out.push(...rows);
    const total = page._metadata && Number(page._metadata.total);
    if (rows.length < 100 || (Number.isFinite(total) && out.length >= total)) break;
  }
  return out;
}

// Everything Bestie needs from one FUB account, as a Bestie Feed v1 object.
export async function fubFeed(key, { tz, today, fetchImpl = fetch } = {}) {
  if (!key) throw new Error('Add your Follow Up Boss API key');
  const deals = await list(key, '/deals', 'deals', 500, fetchImpl);
  // Contact details for the people on deals (phones, emails), 8 at a time.
  const ids = [...new Set(deals.flatMap((d) => (d.people || []).map((m) => String(m.id ?? m.personId ?? ''))).filter(Boolean))].slice(0, 120);
  const people = [];
  for (let i = 0; i < ids.length; i += 8) {
    const got = await Promise.all(ids.slice(i, i + 8).map((id) => get(key, `/people/${encodeURIComponent(id)}`, fetchImpl).catch(() => null)));
    people.push(...got.filter(Boolean));
  }
  const day = today || new Date().toISOString().slice(0, 10);
  const from = new Date(Date.parse(day) - 7 * DAY).toISOString();
  const to = new Date(Date.parse(day) + 60 * DAY).toISOString();
  let appointments = [];
  try {
    appointments = (await list(key, `/appointments?start=${encodeURIComponent(from)}&end=${encodeURIComponent(to)}`, 'appointments', 500, fetchImpl))
      .filter((a) => a.start && a.start >= from.slice(0, 10) && a.start <= to);
  } catch (e) {
    if (/refused/.test(e.message)) throw e; // a bad key is a bad key; anything else: deals still come in
  }
  return fubToFeed({ deals, people, appointments }, { tz, today: day });
}
