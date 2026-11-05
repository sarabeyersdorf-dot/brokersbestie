// Safety check-ins (2026-10-27). Supabase runs this every 5 minutes, so the
// text to the agent's contact goes out even when their phone is dead, off or
// out of signal. Pure parts here (tested); index.ts does the sending.
export const GRACE_MS = 2 * 60000; // the phone asks "Are you OK?" first

export function overdue(checkins, now = new Date()) {
  const cut = now.getTime() - GRACE_MS;
  return (checkins || []).filter((c) => c.status === 'active' && !c.alerted_at && c.due_at && new Date(c.due_at).getTime() < cut);
}

// Safety texts are capped (2026-10-31, before paying users): a check-in can be
// started and "helped" over and over, so without a cap any signed-in account
// could text any number on Sara's Twilio bill. SMS_DAILY_CAP per team per 24 h,
// SMS_PER_NUMBER_CAP to one number. A real emergency is one or two texts.
export const SMS_DAILY_CAP = 10;
export const SMS_PER_NUMBER_CAP = 4;

// What the agent typed goes into the text, so it is kept short and links are
// taken out: the text can only ever read as a safety alert.
export function cleanTyped(v, n) {
  return String(v ?? '').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
}

// The words the contact receives.
export function alertText(c, { overdue: late }) {
  const where = cleanTyped(c.place, 80) || 'a showing';
  const name = cleanTyped(c.meeting_name, 40);
  const phone = cleanTyped(c.meeting_phone, 20);
  const who = name ? ` meeting ${name}${phone ? ` (${phone})` : ''}` : '';
  const lat = Number(c.lat), lng = Number(c.lng);
  const map = c.lat != null && Number.isFinite(lat) && Number.isFinite(lng) ? ` Map: https://maps.google.com/?q=${lat},${lng}` : '';
  return late
    ? `Brokers Bestie safety alert: your teammate started a check-in at ${where}${who} and has not checked back in. Please call them now. If you can't reach them, call 911.${map}`
    : `Brokers Bestie: your teammate pressed SEND HELP at ${where}${who}. Call them now. If you can't reach them, call 911.${map}`;
}

// +1 area codes that are NOT the US or Canada (the Caribbean and Bermuda).
// They dial like US numbers but bill as international, the usual way texting
// is abused for money. US territories (PR, USVI, Guam...) stay allowed.
const NOT_US_CANADA = new Set(['242', '246', '264', '268', '284', '345', '441', '473', '649', '658', '664', '721', '758', '767', '784', '809', '829', '849', '868', '869', '876']);

// A US / Canada number in the form Twilio needs, or '' (never texted).
export function e164(p) {
  const raw = String(p || '').trim();
  let d = raw.replace(/\D/g, '');
  if (raw.startsWith('+') && !d.startsWith('1')) return '';
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length !== 10 || /^[01]/.test(d) || NOT_US_CANADA.has(d.slice(0, 3))) return '';
  return '+1' + d;
}

// One open-house visitor from the public sign-in page, cleaned. Returns null
// when it is not a real sign-in (no name, or neither phone nor email).
export function cleanVisit(b) {
  const s = (v, n = 120) => String(v ?? '').trim().slice(0, n);
  const yn = (v) => (v === true || v === 'yes' ? true : v === false || v === 'no' ? false : null);
  const row = {
    first_name: s(b.first_name, 60), last_name: s(b.last_name, 60), phone: s(b.phone, 30), email: s(b.email, 120).toLowerCase(),
    has_agent: yn(b.has_agent), agent_name: s(b.agent_name, 80), also_selling: yn(b.also_selling), timeframe: s(b.timeframe, 40),
    consent: b.consent === true
  };
  if (!row.first_name || !(row.phone.replace(/\D/g, '').length >= 7 || /.+@.+\..+/.test(row.email))) return null;
  if (!row.has_agent) row.agent_name = '';
  return row;
}
