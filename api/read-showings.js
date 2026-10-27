// POST /api/read-showings { text?: string, files?: [{ type, data }], today: 'YYYY-MM-DD' }
//   -> { showings: [{ address, city, date, start, end, status, listing_agent,
//        listing_agent_phone, access: [{ kind, code, where }], instructions }] }
// Reads showing confirmations (ShowingTime, BrokerBay, ShowingDesk, an agent's
// text...) pasted in or as a screenshot. Nothing is saved here: the phone
// shows what was found and the agent ticks what to add (2026-10-27).

import { send, readBody } from './_lib/server.js';
import { askJson, refuse, S, AiError } from './_lib/ai.js';

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export const SHOWINGS_SCHEMA = S.obj({
  showings: S.list(S.obj({
    address: S.str,
    city: S.str,
    date: S.str,
    start: S.str,
    end: S.str,
    status: S.oneOf(['confirmed', 'requested', 'changed', 'cancelled', 'declined']),
    listing_agent: S.str,
    listing_agent_phone: S.str,
    access: S.list(S.obj({ kind: S.oneOf(['lockbox', 'gate', 'alarm', 'door', 'key']), code: S.str, where: S.str })),
    instructions: S.str
  }))
});

const SYSTEM = `You read showing confirmations for a real estate agent: emails or texts from ShowingTime, BrokerBay, ShowingDesk, Aligned Showings or a listing agent, pasted or as screenshots. There may be several in one paste.
One entry per showing appointment. Copy facts exactly; never guess. A field the message does not give is null.
- address: number and street only. city: the town, with state if shown.
- date: YYYY-MM-DD. Use the "today" date given to place a date with no year (the next such date on or after today).
- start / end: 24-hour HH:MM, local time as written.
- status: confirmed, requested (pending), changed (rescheduled: give the NEW time), cancelled, or declined.
- listing_agent / listing_agent_phone: the listing agent or showing contact named in the message.
- access: lockbox type and code / CBS code / gate or alarm codes, with where the box is, exactly as written.
- instructions: the showing instructions in one or two short sentences (pets, alarm, call first, remove shoes, leave lights off...).
Ignore marketing text, footers and links.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const stop = await refuse(req);
  if (stop) return send(res, stop.status, { error: stop.error });
  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Could not read that' }); }
  const text = String(body.text || '').slice(0, 40000).trim();
  const files = Array.isArray(body.files) ? body.files.slice(0, 4) : [];
  if (!text && !files.length) return send(res, 400, { error: 'Paste the confirmation, or add a screenshot' });
  for (const f of files) if (!TYPES.includes(f.type) || typeof f.data !== 'string' || !f.data) return send(res, 400, { error: 'Screenshots (JPEG, PNG) or a PDF only' });
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(body.today)) ? body.today : new Date().toISOString().slice(0, 10);
  const content = files.map((f) => f.type === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: f.type, data: f.data } }
    : { type: 'image', source: { type: 'base64', media_type: f.type, data: f.data } });
  content.push({ type: 'text', text: `Today is ${today}.${text ? `\n\nThe confirmation(s):\n${text}` : ' Read the confirmation(s) in the screenshot(s).'}` });
  try {
    const out = await askJson({ system: SYSTEM, content, schema: SHOWINGS_SCHEMA, effort: 'low', maxTokens: 4000 });
    return send(res, 200, { showings: (out && out.showings) || [] });
  } catch (e) {
    console.warn('read-showings failed', e && e.message);
    return send(res, 502, { error: e instanceof AiError ? e.message : 'Could not read that right now. Try again in a minute.' });
  }
}
