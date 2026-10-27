// Contacts: reading an import file, and telling who is already here.
// Pure (no DOM, no store) so it is tested on its own.
//
// Two kinds of file come in (Sara, 2026-10-27: "also need an import option"):
//   - CSV, from any CRM's export, Google Contacts or a spreadsheet. Columns are
//     found by their header words, whatever order they are in.
//   - vCard (.vcf), what an iPhone or Android shares from Contacts.

export const CONTACT_KINDS = [
  { id: 'client', label: 'Client', many: 'Clients' },
  { id: 'lead', label: 'Lead', many: 'Leads' },
  { id: 'sphere', label: 'Sphere', many: 'Sphere' },
  { id: 'vendor', label: 'Vendor', many: 'Vendors' },
  { id: 'other', label: 'Other', many: 'Other' }
];
const KIND_IDS = CONTACT_KINDS.map((k) => k.id);

// Free words from a CRM (a stage, a tag, a type) -> one of the kinds.
export function kindFrom(words) {
  const t = String(words || '').toLowerCase();
  if (!t.trim()) return 'lead';
  if (KIND_IDS.includes(t.trim())) return t.trim();
  if (/vendor|lender|title|escrow|inspector|contractor|attorney|stager|photograph/.test(t)) return 'vendor';
  if (/sphere|friend|family|neighbo|referral|soi\b/.test(t)) return 'sphere';
  if (/client|closed|past|customer|under contract|escrow|active buyer|active seller/.test(t)) return 'client';
  if (/lead|prospect|new|nurture|cold|warm|hot|buyer|seller/.test(t)) return 'lead';
  return 'other';
}

export const phoneDigits = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  return d.length === 11 && d[0] === '1' ? d.slice(1) : d;
};
const clean = (v, n = 200) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

// ---------- CSV ----------

// RFC 4180-ish: quotes, doubled quotes, commas and line breaks inside quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = String(text || '').replace(/^\uFEFF/, '');
  const sep = sepOf(s);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
// The separator the header line uses: comma unless it has none.
function sepOf(s) {
  const first = s.split(/\r?\n/, 1)[0] || '';
  if (first.includes(',')) return ',';
  if (first.includes('\t')) return '\t';
  if (first.includes(';')) return ';';
  return ',';
}

// Which column holds what, from the header words. First match wins.
const COLS = {
  first: [/^first ?name$/, /^given ?name$/, /^first$/],
  last: [/^last ?name$/, /^family ?name$/, /^surname$/, /^last$/],
  name: [/^(full ?)?name$/, /^display ?name$/, /^contact( name)?$/, /^client( name)?$/, /^lead( name)?$/],
  phone: [/mobile|cell/, /^phone( ?1)?( - value)?$/, /phone.*value/, /^phone/, /phone|tel/],
  email: [/^e-?mail( ?1)?( - value)?$/, /e-?mail.*value/, /^e-?mail/, /e-?mail/],
  company: [/^company$/, /organi[sz]ation( 1)?( - name)?$/, /company|brokerage|business/],
  kind: [/^(contact )?type$/, /^stage$/, /^status$/, /^category$/, /^tags?$/, /group|label/],
  notes: [/^notes?$/, /^description$/, /^comments?$/, /^background$/]
};
export function columnsOf(header) {
  const h = header.map((x) => String(x || '').toLowerCase().trim());
  const out = {};
  for (const [k, pats] of Object.entries(COLS)) {
    for (const p of pats) {
      const i = h.findIndex((x, j) => p.test(x) && !Object.values(out).includes(j));
      if (i >= 0) { out[k] = i; break; }
    }
  }
  return out;
}

function fromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const col = columnsOf(rows[0]);
  const at = (r, k) => (col[k] != null ? r[col[k]] : '');
  return rows.slice(1).map((r) => ({
    name: clean(at(r, 'name')) || clean([at(r, 'first'), at(r, 'last')].map((x) => clean(x)).filter(Boolean).join(' ')),
    phone: clean(at(r, 'phone'), 40),
    email: clean(at(r, 'email'), 120).toLowerCase(),
    company: clean(at(r, 'company'), 120),
    kind: String(at(r, 'kind') || '').trim() ? kindFrom(at(r, 'kind')) : '',
    notes: clean(at(r, 'notes'), 1000)
  }));
}

// ---------- vCard ----------

const unescapeV = (v) => String(v || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
function fromVcf(text) {
  // Unfold continued lines (a line starting with a space belongs to the last).
  const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (/^BEGIN:VCARD/i.test(line)) { cur = { name: '', phone: '', email: '', company: '', kind: '', notes: '', _n: '' }; continue; }
    if (/^END:VCARD/i.test(line)) { if (cur) { cur.name = cur.name || cur._n; delete cur._n; out.push(cur); } cur = null; continue; }
    if (!cur) continue;
    const m = line.match(/^(?:item\d+\.)?([A-Z-]+)((?:;[^:]*)?):(.*)$/i);
    if (!m) continue;
    const [, key, params, value] = m;
    const k = key.toUpperCase();
    if (k === 'FN') cur.name = clean(unescapeV(value));
    else if (k === 'N' && !cur._n) { const [last, first] = value.split(';'); cur._n = clean([unescapeV(first), unescapeV(last)].filter((x) => x && x.trim()).join(' ')); }
    else if (k === 'TEL') { const pref = /cell|mobile|iphone|pref/i.test(params); if (!cur.phone || pref) cur.phone = clean(value.replace(/^tel:/i, ''), 40); }
    else if (k === 'EMAIL') { if (!cur.email || /pref/i.test(params)) cur.email = clean(value, 120).toLowerCase(); }
    else if (k === 'ORG') cur.company = clean(unescapeV(value.split(';')[0]), 120);
    else if (k === 'NOTE') cur.notes = clean(unescapeV(value), 1000);
  }
  return out;
}

// A file's text -> contacts. Rows with no name and no way to reach them are dropped.
export function parseContacts(text, filename = '') {
  const isVcf = /\.vcf$/i.test(filename) || /^\s*BEGIN:VCARD/i.test(String(text || ''));
  const list = isVcf ? fromVcf(text) : fromCsv(text);
  return list
    .map((c) => ({ ...c, name: c.name || c.email || c.phone }))
    .filter((c) => c.name && (c.phone || c.email || c.company || c.name));
}

// Who is already here: the same phone number or the same email.
export function matchKeys(c) {
  const k = [];
  const d = phoneDigits(c.phone);
  if (d.length >= 7) k.push('p:' + d);
  if (c.email) k.push('e:' + String(c.email).toLowerCase().trim());
  if (!k.length && c.name) k.push('n:' + String(c.name).toLowerCase().replace(/\s+/g, ' ').trim());
  return k;
}

// incoming (parsed) against existing (saved) -> { add, same } where `same` are
// skipped (already in Contacts, or twice in the file).
export function planImport(incoming, existing = []) {
  const seen = new Set(existing.flatMap(matchKeys));
  const add = [], same = [];
  for (const c of incoming) {
    const keys = matchKeys(c);
    if (keys.some((k) => seen.has(k))) { same.push(c); continue; }
    keys.forEach((k) => seen.add(k));
    add.push(c);
  }
  return { add, same };
}
