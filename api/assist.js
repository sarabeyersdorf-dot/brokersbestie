// POST /api/assist  { text, today, focus, properties: [{ id, address, city }] }
//   -> { actions: [ … ] }
// Turns something the agent said ("remind me Friday to order the warranty for
// Echo") into app actions. Nothing is saved here: the phone shows each action
// and the agent confirms before anything is filed.

import { send, readBody } from './_lib/server.js';
import { askJson, refuse, S, AiError } from './_lib/ai.js';

export const ACTION_TYPES = ['task', 'note', 'code', 'date', 'person', 'expense', 'trip', 'property', 'tour', 'checkin', 'unclear'];

const ACTION = S.obj({
  type: { type: 'string', enum: ACTION_TYPES },
  summary: { type: 'string' },
  property_id: S.str,
  text: S.str,
  due: S.str,
  code_kind: S.oneOf(['lockbox', 'gate', 'alarm', 'door', 'key']),
  code: S.str,
  where: S.str,
  name: S.str,
  role: S.str,
  phone: S.str,
  email: S.str,
  amount: S.num,
  miles: S.num,
  address: S.str,
  city: S.str,
  stops: S.list({ type: 'string' }),
  minutes: S.num
});
export const ASSIST_SCHEMA = S.obj({ actions: S.list(ACTION) });

const SYSTEM = `You turn what a real estate agent says into actions in their phone app, Brokers Bestie.
Return one action per thing they asked for, in the order said. Action types:
- task: a to-do. text = what to do, due = date (YYYY-MM-DD) if they gave one. An appointment, walk-through, meeting or call at a set time is a task on that day with the time in the text, e.g. "10:00 AM walk-through". Set property_id when it names a property.
- note: a note filed on a property. text = the note.
- code: a lockbox, gate, alarm, door code or hidden key. code_kind, code, where (where it is).
- date: a key date on a deal (inspection, contingency removal, appraisal, close of escrow). text = the label, due = the date.
- person: a contact on a property. name, role, phone, email.
- expense: money spent. amount, text = what for, due = the date if not today.
- trip: miles driven for work. miles, text = the purpose, due = the date if not today.
- property: a new property. address (street), city.
- tour: plan a showing tour. stops = each address as said, with "at <time>" kept on a stop that has a set time.
- checkin: start a safety check-in. minutes, name = who they are meeting, where = the place.
- unclear: you cannot tell what they want. summary says what to ask.
Rules:
- property_id: the id from the property list that the action is about. Match loosely on street number and name ("Echo" matches "1143 Echo St"). If they did not name one and a focus property is given, use the focus property for note, code, date and person. Otherwise null.
- Dates are relative to today; "Friday" is the next Friday on or after today.
- summary: one short plain sentence a person reads to confirm, e.g. "To-do Friday: order the home warranty (1143 Echo St)".
- Copy codes, numbers and names exactly as said. Never invent a field; leave it null.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const stop = await refuse(req);
  if (stop) return send(res, stop.status, { error: stop.error });
  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Could not read that' }); }
  const text = String(body.text || '').trim().slice(0, 1500);
  if (!text) return send(res, 400, { error: 'Say what you need' });
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today || '') ? body.today : new Date().toISOString().slice(0, 10);
  const weekday = new Date(today + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const list = (Array.isArray(body.properties) ? body.properties : []).slice(0, 400)
    .map((p) => `${String(p.id).slice(0, 64)} | ${String(p.address || '').slice(0, 120)}${p.city ? ', ' + String(p.city).slice(0, 60) : ''}`);
  const focus = body.focus ? String(body.focus).slice(0, 64) : '';
  const context = [
    `Today is ${weekday}, ${today}.`,
    focus ? `Focus property (on screen or where they are standing): ${focus}` : 'No focus property.',
    `Properties (id | address):\n${list.join('\n') || '(none yet)'}`
  ].join('\n');
  try {
    const out = await askJson({
      system: SYSTEM,
      content: [{ type: 'text', text: `${context}\n\nThe agent said:\n"""${text}"""` }],
      schema: ASSIST_SCHEMA,
      effort: 'low',
      maxTokens: 3000
    });
    const ids = new Set((body.properties || []).map((p) => String(p.id)));
    const actions = (out.actions || []).map((a) => ({ ...a, property_id: a.property_id && ids.has(a.property_id) ? a.property_id : null }));
    return send(res, 200, { actions });
  } catch (e) {
    console.warn('assist failed', e && e.message);
    return send(res, 502, { error: e instanceof AiError ? e.message : 'Bestie could not work that out right now' });
  }
}
