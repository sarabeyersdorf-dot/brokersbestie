// Safety check-ins (2026-10-27). Supabase runs this every 5 minutes, so the
// text to the agent's contact goes out even when their phone is dead, off or
// out of signal. Pure parts here (tested); index.ts does the sending.
export const GRACE_MS = 2 * 60000; // the phone asks "Are you OK?" first

export function overdue(checkins, now = new Date()) {
  const cut = now.getTime() - GRACE_MS;
  return (checkins || []).filter((c) => c.status === 'active' && !c.alerted_at && c.due_at && new Date(c.due_at).getTime() < cut);
}

// The words the contact receives (same as api/_lib/server.js alertText).
export function alertText(c, { overdue: late }) {
  const where = c.place || 'a showing';
  const who = c.meeting_name ? ` meeting ${c.meeting_name}${c.meeting_phone ? ` (${c.meeting_phone})` : ''}` : '';
  const map = c.lat != null ? ` Map: https://maps.google.com/?q=${c.lat},${c.lng}` : '';
  return late
    ? `Brokers Bestie safety alert: your teammate started a check-in at ${where}${who} and has not checked back in. Please call them now. If you can't reach them, call 911.${map}`
    : `Brokers Bestie: your teammate pressed SEND HELP at ${where}${who}. Call them now. If you can't reach them, call 911.${map}`;
}

export function e164(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return d ? '+' + d : '';
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
