// Plans and "can this team still make changes?" (2026-10-28). Pure: shared by
// the phone (Settings → Your plan, the read-only banner) and the server
// (api/billing.js). Prices live in Stripe; the app only knows the lookup keys.
//
// Sara's decisions (2026-10-28): $99/year, founding members $69/year for
// sign-ups through Dec 31 2026 (kept while subscribed), $12/month, 14-day free
// trial with no card. Billed PER AGENT, one bill for the team (quantity =
// people on the team). When a trial ends or payment stops, the team is
// READ-ONLY: everything stays visible, nothing new can be saved, and syncing,
// reading and Tell Bestie stop. Safety check-ins are never blocked.

export const TRIAL_DAYS = 14;
export const FOUNDING_UNTIL = '2026-12-31'; // last Pacific day a NEW founding sign-up is offered

export const PLANS = [
  { id: 'founding', lookup: 'bestie_founding_annual', label: 'Founding yearly', price: '$69', per: 'year', monthly: '$5.75', badge: 'Until Dec 31', note: 'Locked in for as long as you stay subscribed.' },
  { id: 'annual', lookup: 'bestie_standard_annual', label: 'Yearly', price: '$99', per: 'year', monthly: '$8.25', note: '' },
  { id: 'monthly', lookup: 'bestie_monthly', label: 'Monthly', price: '$12', per: 'month', monthly: '', note: '' }
];

// What happens when the free trial ends: ONE sentence, shown on the plan
// screen. Sara has not decided the wording yet (2026-10-28, phase 8), so it is
// a clearly marked placeholder. (What the app does today: read-only, see
// entitlement() and bb_can_write in db/022.) Replace the text and set
// TRIAL_END_DECIDED to true once she has.
export const TRIAL_END_DECIDED = false;
export const TRIAL_END_TEXT = 'What happens when the trial ends: to be decided.';

// The plan picked first on the screen: founding while it is offered.
export const defaultPlan = (offered) => (offered.find((p) => p.id === 'founding') || offered.find((p) => p.id === 'annual') || offered[0] || null);

// 'YYYY-MM-DD' in Pacific time.
export function pacificDay(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// The plans a team may pick today. Founding disappears after Dec 31, 2026.
export function plansOffered(now = new Date()) {
  const day = pacificDay(now);
  return PLANS.filter((p) => p.id !== 'founding' || day <= FOUNDING_UNTIL);
}
export const planByLookup = (lookup) => PLANS.find((p) => p.lookup === lookup) || null;

// Statuses that keep a team writable. past_due: Stripe is still retrying the
// card, so the agent keeps working while they fix it.
export const PAYING = ['trialing', 'active', 'past_due'];

// billing: the team's row (or null), teamCreated: the team's created_at.
// enforced: the server-wide switch (bb_config billing_enforced). The SAME rule
// is written in SQL as bb_can_write() (db/022), which is what actually blocks
// writes; keep the two in step.
export function entitlement(billing, teamCreated, { enforced = false, now = new Date() } = {}) {
  const b = billing || {};
  const trialEnd = b.trial_ends_at ? new Date(b.trial_ends_at) : (teamCreated ? new Date(new Date(teamCreated).getTime() + TRIAL_DAYS * 86400e3) : null);
  const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd - now) / 86400e3)) : 0;
  let state;
  if (b.comped) state = 'comped';
  else if (b.status === 'active' || b.status === 'trialing') state = b.status === 'trialing' ? 'trial' : 'active';
  else if (b.status === 'past_due') state = 'past_due';
  else if (trialEnd && trialEnd > now) state = 'trial';
  else state = 'lapsed';
  const canWrite = !enforced || state !== 'lapsed';
  return { state, canWrite, enforced, trialEnd: trialEnd ? trialEnd.toISOString() : null, daysLeft, plan: planByLookup(b.plan), subscribed: !!b.stripe_subscription_id && PAYING.includes(b.status), cancelAtPeriodEnd: !!b.cancel_at_period_end, periodEnd: b.current_period_end || null, seats: b.seats || null };
}

// One plain sentence for Settings and the banner.
export function planSentence(e) {
  const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  if (e.state === 'comped') return 'Your team is on a complimentary plan.';
  if (e.state === 'past_due') return 'Your last payment did not go through. Update your card to keep making changes.';
  if (e.state === 'lapsed') return e.enforced ? 'Your trial or plan has ended. Everything is still here to look at; choose a plan to make changes again.' : 'No plan yet.';
  if (e.subscribed) {
    const what = e.plan ? `${e.plan.label} plan (${e.plan.price} per agent per ${e.plan.per})` : 'Paid plan';
    if (e.cancelAtPeriodEnd) return `${what}, ending ${day(e.periodEnd)}.`;
    if (e.state === 'trial') return `${what}. Free until ${day(e.trialEnd)}.`;
    return `${what}. Renews ${day(e.periodEnd)}.`;
  }
  return `Free trial: ${e.daysLeft} day${e.daysLeft === 1 ? '' : 's'} left (until ${day(e.trialEnd)}).`;
}
