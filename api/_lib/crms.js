// CRMs connected by the agent's own API key (2026-10-27, Sara: "add kvCORE,
// Cinc and Lofty too"). Each connector turns one CRM account into a Bestie
// Feed v1 object, so everything after it is the same mapFeed path as Legacy.
// All are READ ONLY: nothing is ever written to the CRM.
//
// kvCORE and Lofty were written without their full API reference (their docs
// sites could not be reached). Field names are read tolerantly, list endpoints
// are tried in order, and `shape` reports the field NAMES that came back so a
// mismatch can be fixed after a real sync. CINC needs Brokers Bestie approved
// as a CINC integrator (OAuth, client id + secret), so it is listed, not built.

import { fubFeed, fubContacts, fubStatus, localParts } from './fub.js';

const DAY = 86400e3;
const str = (v) => (v == null ? '' : String(v)).trim();
export const pick = (o, ...keys) => { for (const k of keys) { const v = k.split('.').reduce((x, p) => (x == null ? x : x[p]), o); if (v != null && v !== '') return v; } return null; };
// ISO date, 'YYYY-MM-DD', or Unix seconds/milliseconds -> 'YYYY-MM-DD'.
export function toDay(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' || /^\d{9,13}$/.test(String(v))) { const n = Number(v); const d = new Date(n < 1e12 ? n * 1000 : n); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); }
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
const toIso = (v) => { if (v == null || v === '') return null; if (typeof v === 'number' || /^\d{9,13}$/.test(String(v))) { const n = Number(v); return new Date(n < 1e12 ? n * 1000 : n).toISOString(); } const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
const ROW_KEYS = ['data', 'transactions', 'leads', 'contacts', 'results', 'list', 'items', 'records', 'appointments', 'tasks', 'data.list', 'data.items', 'data.data', 'data.transactions', 'result.list'];
// The first ARRAY in the usual places ({ data: [...] }, { data: { list: [...] } }...).
const rowsOf = (b) => {
  if (Array.isArray(b)) return b;
  for (const k of ROW_KEYS) { const v = k.split('.').reduce((x, p) => (x == null ? x : x[p]), b); if (Array.isArray(v)) return v; }
  return [];
};
export const keysOf = (rows) => (rows && rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]).slice(0, 40).join(',') : '');

const kindOf = (t) => (/walk/i.test(t) ? 'walkthrough' : /inspect/i.test(t) ? 'inspection' : /apprais/i.test(t) ? 'appraisal' : /clos|sign/i.test(t) ? 'closing' : /open house/i.test(t) ? 'open' : /show|tour/i.test(t) ? 'showing' : 'meeting');

// One deal-ish record -> a Bestie property (+ close-of-escrow date).
function propertyFrom(rec, f, out, today) {
  const id = pick(rec, ...f.id);
  const address = str(pick(rec, ...f.address));
  if (id == null || !address) return null;
  const words = [pick(rec, ...f.type), pick(rec, ...f.status)].map(str).join(' ');
  const status = fubStatus({ pipelineName: str(pick(rec, ...f.type)), stageName: str(pick(rec, ...f.status)) });
  const coe = toDay(pick(rec, ...f.close));
  const old = new Date(Date.parse(today) - 120 * DAY).toISOString().slice(0, 10);
  if ((status === 'closed' || status === 'cancelled') && (!coe || coe < old)) return null;
  const ext = String(id);
  out.properties.push({ ext_id: ext, address, city: str(pick(rec, ...f.city)), status, price: pick(rec, ...f.price), mls: str(pick(rec, ...f.mls)), coe_date: coe, agent: str(pick(rec, ...f.agent)) || null });
  if (status === 'escrow' && coe) out.dates.push({ ext_id: `${ext}-coe`, property_ext: ext, label: 'Close of escrow', due: coe, done: false });
  return { ext, buy: /buy|purchase/i.test(words) };
}

function personFrom(p, ext, role) {
  if (!p) return null;
  const phones = pick(p, 'phones') || [];
  const emails = pick(p, 'emails') || [];
  const first = (a) => (Array.isArray(a) ? (typeof a[0] === 'string' ? a[0] : pick(a.find((x) => x && (x.isPrimary || x.primary)) || a[0] || {}, 'value', 'phone', 'email', 'number')) : null);
  const name = str(pick(p, 'name', 'fullName', 'full_name')) || [str(pick(p, 'firstName', 'first_name')), str(pick(p, 'lastName', 'last_name'))].filter(Boolean).join(' ');
  if (!name) return null;
  return { ext_id: `${ext}-${pick(p, 'id', 'leadId', 'contact_id') ?? name}`, property_ext: ext, name, role, phone: str(first(phones) || pick(p, 'phone', 'cell_phone', 'mobile_phone', 'phone_number')), email: str(first(emails) || pick(p, 'email', 'primary_email')) };
}

async function getJson(url, headers, fetchImpl, label) {
  const r = await fetchImpl(url, { headers: { ...headers, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error(`${label} refused the API key. Check it and paste it again.`), { auth: true });
  if (r.status === 404) return null;
  if (r.status === 429) throw new Error(`${label} asked us to slow down. Try again in a minute.`);
  if (!r.ok) throw new Error(`${label} answered ${r.status}`);
  return r.json();
}

// Try each list endpoint until one exists; page through it.
async function listFrom(base, paths, headers, fetchImpl, label, max = 500) {
  for (const path of paths) {
    const out = [];
    let found = false;
    for (let page = 1; out.length < max; page++) {
      const sep = path.includes('?') ? '&' : '?';
      const body = await getJson(`${base}${path}${sep}page=${page}&limit=100&per_page=100&pageSize=100`, headers, fetchImpl, label);
      if (body == null) break;
      found = true;
      const rows = rowsOf(body);
      out.push(...rows);
      const last = pick(body, 'last_page', 'meta.last_page', 'totalPages', 'data.totalPages');
      if (rows.length < 100 || (last != null && page >= Number(last))) break;
    }
    if (found) return { rows: out, path };
  }
  return { rows: [], path: null };
}

// ---------- Lofty ----------
// Key: Lofty Settings > Integrations > API. Header "Authorization: token <key>".
// Transaction fields per Lofty's docs: transactionId, leadId, transactionName,
// transactionType, transactionStatus, homePrice, expectedCloseDate/closeDate (ms).
const LOFTY = 'https://api.lofty.com';
export async function loftyFeed(key, { tz = 'America/Los_Angeles', today = new Date().toISOString().slice(0, 10), fetchImpl = fetch } = {}) {
  if (!key) throw new Error('Add your Lofty API key');
  const h = { Authorization: `token ${key}` };
  const tx = await listFrom(LOFTY, ['/v1.0/transactions', '/v2.0/transactions', '/v1.0/transaction'], h, fetchImpl, 'Lofty');
  if (!tx.path) throw new Error('Lofty did not show Bestie your transactions. Tell Sara: the transactions list was not found.');
  const out = { format: 'bestie-feed/1', properties: [], people: [], dates: [], events: [] };
  const F = { id: ['transactionId', 'id'], address: ['transactionName', 'address', 'propertyAddress', 'property.address'], city: ['city', 'property.city'], type: ['transactionType', 'type'], status: ['transactionStatus', 'status', 'stage'], price: ['homePrice', 'price', 'salePrice'], close: ['closeDate', 'expectedCloseDate', 'closingDate'], mls: ['mlsNumber', 'mls'], agent: ['agentName', 'assignedAgent.name', 'agent.name'] };
  const leads = new Map();
  for (const t of tx.rows) {
    const p = propertyFrom(t, F, out, today);
    if (!p) continue;
    const leadId = pick(t, 'leadId', 'lead.id');
    if (leadId != null && leads.size < 120 && !leads.has(String(leadId))) leads.set(String(leadId), { ext: p.ext, role: p.buy ? 'Buyer' : 'Seller' });
  }
  const leadOf = new Map();
  const ids = [...leads.keys()];
  for (let i = 0; i < ids.length; i += 8) {
    await Promise.all(ids.slice(i, i + 8).map(async (id) => {
      const body = await getJson(`${LOFTY}/v1.0/leads/${encodeURIComponent(id)}`, h, fetchImpl, 'Lofty').catch((e) => { if (e.auth) throw e; return null; });
      const lead = body && (pick(body, 'data', 'lead') || body);
      const m = personFrom(lead, leads.get(id).ext, leads.get(id).role);
      if (m) { out.people.push(m); leadOf.set(id, leads.get(id).ext); }
    }));
  }
  const from = Date.parse(today) - 7 * DAY, to = Date.parse(today) + 60 * DAY;
  const ap = await listFrom(LOFTY, [`/v2.0/appointments?startTime=${from}&endTime=${to}`, '/v2.0/tasks?type=APPOINTMENT'], h, fetchImpl, 'Lofty', 300).catch((e) => { if (e.auth) throw e; return { rows: [] }; });
  for (const a of ap.rows) {
    const startIso = toIso(pick(a, 'startTime', 'start', 'startDate', 'dueDate'));
    if (!startIso || Date.parse(startIso) < from || Date.parse(startIso) > to) continue;
    const s = localParts(startIso, tz);
    const endIso = toIso(pick(a, 'endTime', 'end', 'endDate'));
    const title = str(pick(a, 'title', 'content', 'name', 'subject')) || 'Appointment';
    out.events.push({ ext_id: String(pick(a, 'id', 'taskId', 'appointmentId')), property_ext: leadOf.get(String(pick(a, 'leadId', 'lead.id'))) || null, title, kind: kindOf(title), date: s.date, start: pick(a, 'allDay') ? null : s.minutes, minutes: endIso ? Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000)) : null, location: str(pick(a, 'location', 'address')), with: str(pick(a, 'leadName', 'lead.name')) });
  }
  out.events = out.events.filter((e) => e.ext_id && e.ext_id !== 'null');
  out.shape = `transactions(${tx.path}): ${keysOf(tx.rows)}${ap.rows && ap.rows.length ? ` | appointments: ${keysOf(ap.rows)}` : ''}`;
  return out;
}

// ---------- kvCORE / BoldTrail ----------
// Token: kvCORE Lead Engine > Lead Dropbox > My API Tokens (lasts a year).
// Base https://api.kvcore.com/v2/public, "Authorization: Bearer <token>".
// kvCORE's public API has no appointments, so none come in.
const KV = 'https://api.kvcore.com/v2/public';
export async function kvcoreFeed(key, { today = new Date().toISOString().slice(0, 10), fetchImpl = fetch } = {}) {
  if (!key) throw new Error('Add your kvCORE API token');
  const h = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const tx = await listFrom(KV, ['/transactions', '/transaction', '/deals'], h, fetchImpl, 'kvCORE');
  if (!tx.path) throw new Error('kvCORE did not show Bestie your transactions. Make a "User" API token (not "Contacts"), or tell Sara the transactions list was not found.');
  const out = { format: 'bestie-feed/1', properties: [], people: [], dates: [], events: [] };
  const F = { id: ['id', 'transaction_id'], address: ['address', 'property_address', 'street_address', 'full_address', 'property.address', 'name'], city: ['city', 'property_city', 'property.city'], type: ['type', 'transaction_type', 'side', 'representation'], status: ['status', 'stage', 'transaction_status'], price: ['price', 'sale_price', 'list_price', 'sales_price'], close: ['closing_date', 'close_date', 'estimated_close_date', 'expected_close_date', 'closed_at'], mls: ['mls_number', 'mls_id', 'mls'], agent: ['agent_name', 'agent.name', 'user.name'] };
  const contacts = new Map();
  for (const t of tx.rows) {
    const p = propertyFrom(t, F, out, today);
    if (!p) continue;
    const embedded = pick(t, 'contacts', 'clients', 'parties') || [];
    for (const c of Array.isArray(embedded) ? embedded : []) { const m = personFrom(c, p.ext, p.buy ? 'Buyer' : 'Seller'); if (m) out.people.push(m); }
    const cid = pick(t, 'contact_id', 'contact.id', 'client_id');
    if (cid != null && !embedded.length && contacts.size < 120) contacts.set(String(cid), { ext: p.ext, role: p.buy ? 'Buyer' : 'Seller' });
  }
  const ids = [...contacts.keys()];
  for (let i = 0; i < ids.length; i += 8) {
    await Promise.all(ids.slice(i, i + 8).map(async (id) => {
      let body = null;
      for (const path of [`/contact/${encodeURIComponent(id)}`, `/contacts/${encodeURIComponent(id)}`]) {
        body = await getJson(`${KV}${path}`, h, fetchImpl, 'kvCORE').catch((e) => { if (e.auth) throw e; return null; });
        if (body) break;
      }
      const m = personFrom(body && (pick(body, 'data') || body), contacts.get(id).ext, contacts.get(id).role);
      if (m) out.people.push(m);
    }));
  }
  out.shape = `transactions(${tx.path}): ${keysOf(tx.rows)}`;
  return out;
}

// ---------- the whole address book ----------
// Only when the agent chose "All my contacts" on connecting.

// One CRM contact record -> a Bestie Feed contact.
export function contactFrom(p) {
  const m = personFrom(p, 'x', '');
  if (!m) return null;
  const id = pick(p, 'id', 'leadId', 'contact_id', 'contactId');
  if (id == null) return null;
  const kind = [pick(p, 'stage', 'leadType', 'lead_type', 'type', 'status', 'contact_type', 'stageName'), ...[].concat(pick(p, 'tags', 'tagList') || [])].map((x) => (x && typeof x === 'object' ? str(x.name) : str(x))).join(' ');
  return { ext_id: String(id), name: m.name, phone: m.phone, email: m.email, company: str(pick(p, 'company', 'companyName', 'company_name')), kind, agent: str(pick(p, 'agentName', 'assignedAgent.name', 'assigned_agent', 'agent.name')) || null };
}

async function loftyContacts(key, { fetchImpl = fetch, max = 3000 } = {}) {
  const r = await listFrom(LOFTY, ['/v1.0/leads', '/v2.0/leads'], { Authorization: `token ${key}` }, fetchImpl, 'Lofty', max);
  return r.rows.map(contactFrom).filter(Boolean);
}
async function kvcoreContacts(key, { fetchImpl = fetch, max = 3000 } = {}) {
  const r = await listFrom(KV, ['/contacts'], { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, fetchImpl, 'kvCORE', max);
  return r.rows.map(contactFrom).filter(Boolean);
}

// ---------- which connector a provider uses ----------
// Labels and help live in js/crmlist.js (shared with Settings).
export const CONNECTORS = { fub: fubFeed, kvcore: kvcoreFeed, lofty: loftyFeed };
export const CONTACT_LISTS = { fub: fubContacts, kvcore: kvcoreContacts, lofty: loftyContacts };
