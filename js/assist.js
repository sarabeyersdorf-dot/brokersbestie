// What a read MLS sheet and a spoken command turn into. Pure functions, no DOM
// and no store, so they are tested in test/assist.test.mjs. The screens show
// what these return and save only what the agent ticks.

// A sheet fills in a property. A blank field is filled (ticked); a field that
// already holds something different is offered but left unticked, so a sheet
// never quietly overwrites what the agent typed.
const SHEET_FIELDS = [
  ['address', 'Address'], ['city', 'City'], ['price', 'Price'], ['mls', 'MLS #'], ['occupancy', 'Occupancy'],
  ['well', 'Well water'], ['septic', 'Septic'], ['hoa', 'HOA'], ['solar', 'Solar'],
  ['showing_notes', 'Showing instructions'], ['directions', 'Directions']
];

const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const blank = (v) => v == null || v === '' || v === false;

export function sheetChanges(sheet, property = {}) {
  const out = [];
  for (const [field, label] of SHEET_FIELDS) {
    const value = sheet[field];
    if (value == null || value === '') continue;
    if (typeof value === 'boolean' && !value && blank(property[field])) continue; // "no well" adds nothing to a blank card
    if (same(value, property[field])) continue;
    out.push({ field, label, value, current: blank(property[field]) ? null : property[field], checked: blank(property[field]) });
  }
  return out;
}

// Codes and people on the sheet that the property does not already have.
export function sheetExtras(sheet, { access = [], people = [] } = {}) {
  const codes = (sheet.codes || []).filter((c) => c.code || c.where)
    .filter((c) => !access.some((a) => (c.code && same(a.code, c.code)) || (!c.code && a.kind === c.kind && same(a.location_note, c.where))));
  const persons = (sheet.people || []).filter((m) => m.name)
    .filter((m) => !people.some((x) => same(x.name, m.name)));
  return { codes, people: persons };
}

// The field note kept with the sheet: the facts a property card has no box for.
export function sheetNoteText(sheet) {
  const n = (v) => Number(v).toLocaleString('en-US');
  const facts = [
    sheet.beds != null && `${sheet.beds} bd`,
    sheet.baths != null && `${sheet.baths} ba`,
    sheet.sqft != null && `${n(sheet.sqft)} sq ft`,
    sheet.lot && `${sheet.lot} lot`,
    sheet.year_built != null && `built ${sheet.year_built}`
  ].filter(Boolean).join(' · ');
  const lines = ['MLS sheet'];
  if (facts) lines.push(facts);
  for (const f of sheet.field_notes || []) if (f && f.trim()) lines.push(`• ${f.trim()}`);
  if (sheet.remarks) lines.push('', sheet.remarks.trim());
  return lines.join('\n');
}

// One spoken action -> what to save, or where to go. `today` is YYYY-MM-DD.
// Returns { table, row } | { go, plan? } | { error }.
export function actionPlan(a, { today }) {
  const pid = a.property_id || null;
  const needsProp = (msg) => (pid ? null : { error: msg });
  switch (a.type) {
    case 'task':
      if (!a.text) return { error: 'No to-do heard' };
      return { table: 'tasks', row: { text: a.text, due: a.due || today, property_id: pid, done: false } };
    case 'note':
      return needsProp('Which property is the note for?') || (a.text ? { table: 'notes', row: { property_id: pid, text: a.text } } : { error: 'No note heard' });
    case 'code': {
      const miss = needsProp('Which property is the code for?');
      if (miss) return miss;
      const kind = a.code_kind || 'lockbox';
      const label = { lockbox: 'Lockbox', gate: 'Gate code', alarm: 'Alarm', door: 'Door keypad', key: 'Hidden key' }[kind];
      return { table: 'access', row: { property_id: pid, kind, label, code: a.code || '', location_note: a.where || '', ...(kind === 'lockbox' ? { status: 'out' } : {}) } };
    }
    case 'date':
      return needsProp('Which property is the date for?') || (a.text && a.due ? { table: 'dates', row: { property_id: pid, label: a.text, due: a.due, done: false } } : { error: 'Say what and when' });
    case 'person':
      return needsProp('Which property is the contact for?') || (a.name ? { table: 'people', row: { property_id: pid, name: a.name, role: a.role || '', phone: a.phone || '', email: a.email || '' } } : { error: 'No name heard' });
    case 'expense':
      return a.amount != null ? { table: 'expenses', row: { property_id: pid, amount: a.amount, what: a.text || '', date: a.due || today } } : { error: 'No amount heard' };
    case 'trip':
      return a.miles != null ? { table: 'trips', row: { property_id: pid, miles: a.miles, purpose: a.text || '', date: a.due || today } } : { error: 'No miles heard' };
    case 'property':
      return a.address ? { table: 'properties', row: { address: a.address, city: a.city || '', status: 'listing' } } : { error: 'No address heard' };
    case 'tour':
      return (a.stops || []).length ? { go: '#/plan', plan: a.stops.join('\n') } : { error: 'No addresses heard' };
    case 'checkin':
      return { go: '#/safety', checkin: { minutes: a.minutes || null, meeting_name: a.name || '', place: a.where || '' } };
    default:
      return { error: a.summary || 'Not sure what to do with that' };
  }
}
