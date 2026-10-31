// Plans, the read-only rule and the Stripe plumbing (2026-10-28).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHmac } from 'node:crypto';
import { entitlement, plansOffered, planSentence, PLANS, TRIAL_DAYS } from '../js/billing.js';
import { formEncode, verifyStripeSignature, billingFromSubscription } from '../api/_lib/stripe.js';
import { subscriptionIdOf, applyEvent } from '../api/stripe-webhook.js';

const NOW = new Date('2026-11-10T18:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400e3).toISOString();

test('a new team is on a free trial for 14 days, then lapses', () => {
  const fresh = entitlement(null, daysAgo(3), { enforced: true, now: NOW });
  assert.equal(fresh.state, 'trial');
  assert.equal(fresh.daysLeft, TRIAL_DAYS - 3);
  assert.equal(fresh.canWrite, true);
  const old = entitlement(null, daysAgo(15), { enforced: true, now: NOW });
  assert.equal(old.state, 'lapsed');
  assert.equal(old.canWrite, false);
});

test('nothing locks while the switch is off', () => {
  assert.equal(entitlement(null, daysAgo(90), { enforced: false, now: NOW }).canWrite, true);
});

test('paying, past due and comped teams can write; cancelled cannot', () => {
  for (const status of ['active', 'trialing', 'past_due']) assert.equal(entitlement({ status, stripe_subscription_id: 's' }, daysAgo(90), { enforced: true, now: NOW }).canWrite, true, status);
  assert.equal(entitlement({ comped: true }, daysAgo(400), { enforced: true, now: NOW }).state, 'comped');
  assert.equal(entitlement({ status: 'canceled', stripe_subscription_id: 's' }, daysAgo(90), { enforced: true, now: NOW }).canWrite, false);
  assert.equal(entitlement({ status: 'unpaid' }, daysAgo(90), { enforced: true, now: NOW }).canWrite, false);
});

test('the SQL rule names the same paying statuses as the app', () => {
  const sql = fs.readFileSync(new URL('../db/022_billing.sql', import.meta.url), 'utf8');
  for (const s of ['trialing', 'active', 'past_due']) assert.match(sql, new RegExp(`'${s}'`));
  assert.match(sql, /interval '14 days'/);
  // Safety check-ins are never blocked by billing.
  assert.doesNotMatch(sql, /'checkins'/);
});

test('founding price is offered through Dec 31 2026 Pacific, then gone', () => {
  assert.ok(plansOffered(new Date('2027-01-01T07:59:00Z')).some((p) => p.id === 'founding')); // 11:59 pm Dec 31 PT
  assert.ok(!plansOffered(new Date('2027-01-01T08:01:00Z')).some((p) => p.id === 'founding'));
  assert.deepEqual(PLANS.map((p) => p.lookup), ['bestie_founding_annual', 'bestie_standard_annual', 'bestie_monthly']);
});

test('plain-words status', () => {
  assert.match(planSentence(entitlement(null, daysAgo(13), { now: NOW })), /1 day left/);
  assert.match(planSentence(entitlement(null, daysAgo(30), { enforced: true, now: NOW })), /still here to look at/);
  const sub = entitlement({ status: 'active', stripe_subscription_id: 's', plan: 'bestie_standard_annual', current_period_end: '2027-11-10T00:00:00Z' }, daysAgo(30), { now: NOW });
  assert.match(planSentence(sub), /Yearly plan \(\$99 per agent per year\)\. Renews/);
});

test('Stripe form encoding handles nested objects and arrays', () => {
  const s = formEncode({ mode: 'subscription', line_items: [{ price: 'p1', quantity: 2 }], subscription_data: { metadata: { team_id: 't' } }, lookup_keys: ['a'], skip: null }).toString();
  assert.equal(decodeURIComponent(s), 'mode=subscription&line_items[0][price]=p1&line_items[0][quantity]=2&subscription_data[metadata][team_id]=t&lookup_keys[0]=a');
});

test('webhook signature: good, forged, stale, missing', () => {
  const raw = '{"id":"evt_1"}';
  const t = Math.floor(NOW / 1000);
  const sig = createHmac('sha256', 'whsec_x').update(`${t}.${raw}`).digest('hex');
  assert.equal(verifyStripeSignature(raw, `t=${t},v1=${sig}`, 'whsec_x', { now: +NOW }), true);
  assert.equal(verifyStripeSignature(raw + ' ', `t=${t},v1=${sig}`, 'whsec_x', { now: +NOW }), false);
  assert.equal(verifyStripeSignature(raw, `t=${t},v1=${sig}`, 'whsec_other', { now: +NOW }), false);
  assert.equal(verifyStripeSignature(raw, `t=${t},v1=${sig}`, 'whsec_x', { now: +NOW + 600e3 }), false);
  assert.equal(verifyStripeSignature(raw, '', 'whsec_x', { now: +NOW }), false);
  assert.equal(verifyStripeSignature(raw, `t=${t},v1=${sig}`, '', { now: +NOW }), false);
});

const SUB = {
  id: 'sub_1', object: 'subscription', customer: 'cus_1', status: 'trialing', trial_end: 1794000000, cancel_at_period_end: false,
  metadata: { team_id: 'team-1' },
  items: { data: [{ id: 'si_1', quantity: 2, current_period_end: 1794000000, price: { lookup_key: 'bestie_monthly' } }] }
};

test('a subscription becomes one billing row', () => {
  const r = billingFromSubscription(SUB);
  assert.equal(r.stripe_item_id, 'si_1');
  assert.equal(r.plan, 'bestie_monthly');
  assert.equal(r.seats, 2);
  assert.equal(r.current_period_end, new Date(1794000000 * 1000).toISOString());
});

test('the subscription is found on every event shape', () => {
  assert.equal(subscriptionIdOf({ data: { object: SUB } }), 'sub_1');
  assert.equal(subscriptionIdOf({ data: { object: { object: 'checkout.session', subscription: 'sub_2' } } }), 'sub_2');
  assert.equal(subscriptionIdOf({ data: { object: { object: 'invoice', parent: { subscription_details: { subscription: 'sub_3' } } } } }), 'sub_3');
  assert.equal(subscriptionIdOf({ data: { object: { object: 'invoice' } } }), null);
});

test('an event re-reads the subscription and writes the team row', async () => {
  const writes = [];
  const out = await applyEvent({ type: 'invoice.payment_failed', data: { object: { object: 'invoice', subscription: 'sub_1' } } }, {
    stripeImpl: async (path) => { assert.equal(path, '/subscriptions/sub_1'); return { ...SUB, status: 'past_due' }; },
    dbImpl: async (path, init) => { writes.push([path, init]); return []; }
  });
  assert.deepEqual(out, { team_id: 'team-1', status: 'past_due' });
  assert.equal(writes[0][1].body.team_id, 'team-1');
  assert.equal(writes[0][1].body.status, 'past_due');
});

test('a subscription with no team metadata is matched by its customer', async () => {
  const out = await applyEvent({ type: 'customer.subscription.updated', data: { object: { ...SUB, metadata: {} } } }, {
    stripeImpl: async () => ({ ...SUB, metadata: {} }),
    dbImpl: async (path) => (path.startsWith('billing?stripe_customer_id') ? [{ team_id: 'team-9' }] : [])
  });
  assert.equal(out.team_id, 'team-9');
});

test('events we do not handle are ignored without calling Stripe', async () => {
  const out = await applyEvent({ type: 'charge.refunded', data: { object: {} } }, { stripeImpl: async () => { throw new Error('should not call'); } });
  assert.equal(out.ignored, true);
});

test('the billing screen is its own route, apart from the tour planner', () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /\[\/\^#\\\/billing\$\/, \(\) => viewBilling\(\)/);
  assert.equal((app.match(/^function viewPlan\(/gm) || []).length, 1);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /'\.\/js\/billing\.js'/);
});

test('occupied / vacant shows on every tour surface, with no color of its own', () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
  assert.match(app, /occBadge\(s\.occ, \{ extra: s\.occ === 'O' \? 'knock first'/); // at the door
  assert.match(app, /nextStopWords\(next\)/); // next stop button
  assert.match(app, /tour-stop[\s\S]{0,200}occBadge\(x\.occ\)/); // Today's tour list
  const occCss = css.slice(css.indexOf('Occupied / vacant (2026-10-28)')); assert.doesNotMatch(occCss.slice(0, occCss.indexOf('\n\n')), /--occ-o|--occ-v|--alert/);
});

test('at the door: four quick faces + All 8, late and call, next stop; buttons 56px+', () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
  assert.match(app, /const DOOR_FACES = \['love', 'maybe', 'nope', 'again'\]/);
  assert.match(app, /Tap a code to copy it/);
  assert.match(app, /id="dlate"[\s\S]{0,200}Call agent/);
  assert.match(app, /Done · \$\{next \? 'Next stop'/);
  assert.match(app, /Text feedback to/);
  assert.match(app, /Add to \$\{buyer\}'s buyer page/);
  for (const sel of ['.door-btn2', '.door-face', '.door-next']) {
    const m = css.match(new RegExp(sel.replace('.', '\\.') + ' \\{[^}]*min-height: (\\d+)px'));
    assert.ok(m && Number(m[1]) >= 56, sel);
  }
});

test('property page: status chip, four buttons, one Getting in, Next up, three tabs, bottom bar', () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const hub = app.slice(app.indexOf('function viewHub(id)'), app.indexOf('function savedAtWords'));
  const order = ['id="statchip"', 'class="action teal"', 'id="share"', '>Getting in<', 'Saved on this phone', 'How to get in', 'Driving in', 'id="nextup"', "tab('people'", "tab('where', `Gear & signs", "tab('notes', `Notes & files", 'class="pbar"', 'Send seller update', 'id="hubmore"'];
  let at = -1;
  for (const k of order) { const i = hub.indexOf(k); assert.ok(i > at, `${k} in order`); at = i; }
  assert.doesNotMatch(hub, /'overview'/);
  const more = app.slice(app.indexOf('function hubMoreSheet'), app.indexOf('function hubMoreSheet') + 2500);
  for (const k of ['Edit details', 'Snap MLS sheet', 'Quick add', 'Open house sign-in']) assert.match(more, new RegExp(k));
});

test('plan screen: monthly costs, founding first, one Choose button, trial-end placeholder', async () => {
  const b = await import('../js/billing.js');
  const byId = Object.fromEntries(b.PLANS.map((p) => [p.id, p]));
  assert.equal(byId.founding.monthly, '$5.75'); assert.equal(byId.founding.badge, 'Until Dec 31');
  assert.equal(byId.annual.monthly, '$8.25');
  assert.equal(b.defaultPlan(b.plansOffered(new Date('2026-11-01T12:00:00Z'))).id, 'founding');
  assert.equal(b.defaultPlan(b.plansOffered(new Date('2027-02-01T12:00:00Z'))).id, 'annual');
  assert.equal(b.TRIAL_END_DECIDED, true); // Sara chose the sentence 2026-10-31
  assert.match(b.TRIAL_END_TEXT, /still see everything/);
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const view = app.slice(app.indexOf('function viewBilling()'), app.indexOf('function viewBilling()') + 6000);
  for (const k of ['No card on file. Nothing is charged unless you pick a plan.', "'s'} left</b>", 'Works out to', 'Choose ${pick ? pick.label', 'anyone on the team can choose it here', 'SUPPORT_EMAIL']) assert.ok(view.includes(k), k);
  assert.doesNotMatch(view, /countdown|setInterval/);
});
