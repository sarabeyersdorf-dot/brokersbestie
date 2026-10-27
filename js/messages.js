// The texts Bestie writes for the agent (Sara, 2026-10-27: build "feedback to
// the listing agent", "request and confirm showings" and "send the buyer their
// tour recap"). Pure: words in, words out, tested in test/messages.test.mjs.
// The agent always sees and can edit the text before their own phone sends it.

import { formatClock } from './route.js';

const first = (name) => String(name || '').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || '';
const street = (a) => String(a || '').split(',')[0].trim();
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const dayWord = (iso) => (iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'today');
const sign = (me) => (me ? `\n${cap(me)}` : '');

// What a listing agent hears, by face. Professional, never the buyer's private
// words: those stay in Bestie unless the agent types them in.
export const FEEDBACK_LINES = {
  love: 'My buyers loved it. It is high on their list.',
  like: 'My buyers liked it and are still thinking it over.',
  maybe: 'My buyers are on the fence. It has a lot going for it but they are not sure yet.',
  nope: 'It was not the right fit for my buyers.',
  pricey: 'My buyers liked parts of it but felt the price was high for what it offers.',
  work: 'My buyers felt it needs more work than they want to take on.',
  again: 'My buyers would like to see it again. I will be in touch to set up a second showing.',
  offer: 'My buyers are very interested. Please let me know of any offers or updates, and I will be in touch shortly.'
};

export function feedbackText(stop, { me = '', date = '', today = '' } = {}) {
  const hi = first(stop.agent) ? `Hi ${first(stop.agent)}, ` : 'Hi, ';
  const line = FEEDBACK_LINES[stop.reaction] || 'Thank you for having us.';
  const when = !date || date === today ? 'today' : `on ${dayWord(date).split(',')[0]}`;
  return `${hi}thank you for letting us see ${street(stop.address)} ${when}. ${line}${sign(me)}`;
}

// One text per listing agent, covering every home of theirs on the tour.
export function requestGroups(stops) {
  const by = new Map();
  for (const s of stops || []) {
    const phone = String(s.agent_phone || '').replace(/\D/g, '');
    if (!phone) continue;
    if (!by.has(phone)) by.set(phone, { phone: s.agent_phone, agent: s.agent || '', stops: [] });
    by.get(phone).stops.push(s);
  }
  return [...by.values()];
}

export function requestText(group, { date, me = '' } = {}) {
  const hi = first(group.agent) ? `Hi ${first(group.agent)}, ` : 'Hi, ';
  const when = (s) => (s.arrive != null ? `around ${formatClock(s.arrive)}` : 'any time that works');
  const homes = group.stops.map((s) => `${street(s.address)} ${when(s)}`);
  const list = homes.length === 1 ? homes[0] : homes.length === 2 ? homes.join(' and ') : `${homes.slice(0, -1).join(', ')} and ${homes[homes.length - 1]}`;
  return `${hi}I would like to show ${list} on ${dayWord(date)} with my buyers. Could you please confirm${group.stops.some((s) => !s.code) ? ' and send the showing instructions' : ''}? Thank you!${sign(me)}`;
}

// The buyer's recap of one tour: every home, what they thought, the listing link.
const FACE_WORD = { love: 'Loved it', like: 'Liked it', maybe: 'On the fence', nope: 'Not for us', pricey: 'Too pricey', work: 'Needs work', again: 'See it again', offer: 'Writing an offer' };
export function recapText(homes, { buyer = '', date = '', me = '' } = {}) {
  const hi = first(buyer) ? `Hi ${first(buyer)}! ` : 'Hi! ';
  const lines = homes.map((h, i) => `${i + 1}. ${h.address}${h.reaction ? ` - ${FACE_WORD[h.reaction]}` : ''}${h.mls_url ? `\n   ${h.mls_url}` : ''}`);
  return `${hi}Here are the homes we saw${date ? ` on ${dayWord(date)}` : ''}:\n${lines.join('\n')}\nLet me know which ones you would like to talk about or see again.${sign(me)}`;
}

// ---------- open house (2026-10-27) ----------
// A license as the agent typed it; a bare number reads "Lic. #<n>".
export const licenseText = (v) => { const t = String(v || '').trim(); return !t ? '' : /^[#\d\s-]+$/.test(t) ? `Lic. #${t.replace(/^#/, '')}` : t; };

// The agent's sign-off from their profile: "Sara Cooper\nLegacy Properties ·
// DRE 02141987". Falls back to the first name.
export function signOff(profile, me = '') {
  if (!profile || !profile.full_name) return me ? cap(me) : '';
  const line2 = [profile.brokerage, licenseText(profile.license)].filter(Boolean).join(' · ');
  return [profile.full_name, line2, profile.phone].filter(Boolean).join('\n');
}

// Thank-you after an open house. Someone who already has an agent is thanked,
// not solicited: they are pointed back to their own agent.
export function ohThanksText(v, { address = '', profile = null, me = '', date = '', today = '' } = {}) {
  const hi = v.first_name ? `Hi ${cap(String(v.first_name).trim())}, ` : 'Hi, ';
  const when = !date || date === today ? 'today' : `on ${dayWord(date).split(',')[0]}`;
  const body = v.has_agent
    ? `thank you for stopping by the open house at ${street(address)} ${when}. If you or ${v.agent_name ? v.agent_name.split(' ')[0] : 'your agent'} have any questions about the home, I am happy to help.`
    : `thank you for stopping by the open house at ${street(address)} ${when}! I hope you enjoyed it. If you have questions, would like the disclosures, or want to see other homes${v.also_selling ? ' or talk about selling yours' : ''}, just reply here.`;
  const sig = signOff(profile, me);
  return `${hi}${body}${sig ? `\n${sig}` : ''}`;
}

const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function visitorsCsv(rows, addressOf = () => '') {
  const head = ['Date', 'First name', 'Last name', 'Phone', 'Email', 'Has an agent', 'Agent name', 'Timeframe', 'Also selling', 'OK to contact', 'Property', 'Followed up'];
  const lines = rows.map((v) => [v.oh_date, v.first_name, v.last_name, v.phone, v.email, v.has_agent ? 'Yes' : v.has_agent === false ? 'No' : '', v.agent_name, v.timeframe, v.also_selling ? 'Yes' : v.also_selling === false ? 'No' : '', v.consent ? 'Yes' : 'No', addressOf(v.property_id), v.followed_up_at ? v.followed_up_at.slice(0, 10) : ''].map(csvCell).join(','));
  return [head.join(','), ...lines].join('\n');
}
