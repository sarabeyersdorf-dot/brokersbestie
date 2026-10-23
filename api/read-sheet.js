// POST /api/read-sheet  { files: [{ type: 'image/jpeg' | 'application/pdf', data: <base64> }] }
//   -> { sheet: { address, price, mls, …, codes: [], people: [], field_notes } }
// Reads a photographed or downloaded MLS sheet. Nothing is saved here: the
// phone shows what was found and the agent ticks what to keep.

import { send, readBody } from './_lib/server.js';
import { askJson, refuse, S } from './_lib/ai.js';

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILES = 4;

const CODE = S.obj({
  kind: S.oneOf(['lockbox', 'gate', 'alarm', 'door', 'key']),
  label: S.str,
  code: S.str,
  where: S.str
});
const PERSON = S.obj({ name: S.str, role: S.str, phone: S.str, email: S.str });

export const SHEET_SCHEMA = S.obj({
  address: S.str,
  city: S.str,
  price: S.num,
  mls: S.str,
  occupancy: S.oneOf(['O', 'V']),
  beds: S.num,
  baths: S.num,
  sqft: S.num,
  lot: S.str,
  year_built: S.num,
  well: S.bool,
  septic: S.bool,
  hoa: S.str,
  solar: S.str,
  showing_notes: S.str,
  directions: S.str,
  remarks: S.str,
  codes: S.list(CODE),
  people: S.list(PERSON),
  field_notes: S.list({ type: 'string' })
});

const SYSTEM = `You read MLS listing sheets for a real estate agent who is about to show or list the home.
Copy facts exactly as printed. Never guess: a field the sheet does not show is null.
- address: street address only (number and street). city: the town, with the state if shown, e.g. "Murphys, CA".
- price: list price as a plain number. sqft: living area. lot: as printed, e.g. "2.3 acres".
- occupancy: "O" if owner or tenant occupied, "V" if vacant.
- well / septic: true or false only when the sheet says (water source, sewer).
- hoa: "None" or the name and fee as printed. solar: owned or leased, with the payment if shown.
- showing_notes: the showing instructions as written (appointment, notice, pets, alarm, who to call).
- directions: driving directions if printed.
- remarks: the public remarks, shortened to two or three sentences.
- codes: any lockbox, gate, alarm, door or key information printed on the sheet, with where it is.
- people: the listing agent, co-listing agent and showing contact with phone and email as printed.
- field_notes: up to eight short notes an agent would want standing at the property (pool, shop, detached garage, generator, pets, propane, private road, items that do not convey). Plain words, no repeats of fields above.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const stop = await refuse(req);
  if (stop) return send(res, stop.status, { error: stop.error });
  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Could not read that' }); }
  const files = Array.isArray(body.files) ? body.files.slice(0, MAX_FILES) : [];
  if (!files.length) return send(res, 400, { error: 'Send a photo or PDF of the sheet' });
  for (const f of files) {
    if (!TYPES.includes(f.type) || typeof f.data !== 'string' || !f.data) return send(res, 400, { error: 'Photos (JPEG, PNG) or a PDF only' });
  }
  const content = files.map((f) => f.type === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: f.type, data: f.data } }
    : { type: 'image', source: { type: 'base64', media_type: f.type, data: f.data } });
  content.push({ type: 'text', text: files.length > 1 ? 'These are the pages of one MLS sheet. Read them together.' : 'Read this MLS sheet.' });
  try {
    const sheet = await askJson({ system: SYSTEM, content, schema: SHEET_SCHEMA, effort: 'low', maxTokens: 4000 });
    return send(res, 200, { sheet });
  } catch (e) {
    console.warn('read-sheet failed', e && e.message);
    return send(res, 502, { error: 'Could not read the sheet right now. It is still saved on the property.' });
  }
}
