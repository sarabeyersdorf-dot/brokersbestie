// /api/billing — the team's plan (2026-10-28).
//   GET                              -> entitlement + plans on offer (also keeps
//                                       the Stripe seat count = team size)
//   POST { op: 'checkout', plan }    -> { url } a Stripe Checkout page
//   POST { op: 'portal' }            -> { url } Stripe's Customer Portal (card,
//                                       switch plan, cancel)
// Signed-in team members only. Payments themselves are recorded by the Stripe
// webhook (api/stripe-webhook.js), never by this endpoint.

import { send, readBody, caller, db, env } from './_lib/server.js';
import { teamOf } from './_lib/crm.js';
import { stripe } from './_lib/stripe.js';
import { billingEnforced, teamBilling } from './_lib/billing-server.js';
import { entitlement, plansOffered, PLANS, pacificDay } from '../js/billing.js';

// Keep the Stripe quantity equal to the people on the team (per-agent
// pricing). Stripe prorates a change; nothing is charged during a trial.
async function syncSeats(teamId, billing, seats) {
  if (!billing || !billing.stripe_item_id || !['trialing', 'active', 'past_due'].includes(billing.status) || billing.seats === seats) return billing;
  await stripe(`/subscription_items/${billing.stripe_item_id}`, { method: 'POST', params: { quantity: seats } });
  await db(`billing?team_id=eq.${teamId}`, { method: 'PATCH', body: { seats, updated_at: new Date().toISOString() } });
  return { ...billing, seats };
}

function origin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'brokersbestie.app';
  return `${/^localhost|^127\./.test(host) ? 'http' : 'https'}://${host}`;
}

export default async function handler(req, res) {
  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY')) return send(res, 503, { error: 'Accounts are not set up on the server' });
  const user = await caller(req);
  if (!user) return send(res, 401, { error: 'Sign in first' });
  const teamId = await teamOf(user.id);
  if (!teamId) return send(res, 400, { error: 'Join or start a team first' });
  try {
    let { billing, created, seats } = await teamBilling(teamId);
    if (req.method === 'GET') {
      if (env('STRIPE_SECRET_KEY')) billing = await syncSeats(teamId, billing, seats).catch(() => billing);
      const enforced = await billingEnforced();
      return send(res, 200, { ...entitlement(billing, created, { enforced }), seats, plans: plansOffered(), payments: !!env('STRIPE_SECRET_KEY') });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST' });
    const body = await readBody(req).catch(() => ({}));

    if (body.op === 'portal') {
      if (!billing || !billing.stripe_customer_id) return send(res, 400, { error: 'Choose a plan first' });
      const s = await stripe('/billing_portal/sessions', { method: 'POST', params: { customer: billing.stripe_customer_id, return_url: `${origin(req)}/#/billing` } });
      return send(res, 200, { url: s.url });
    }

    if (body.op === 'checkout') {
      const plan = plansOffered().find((p) => p.id === body.plan);
      if (!plan) return send(res, 400, { error: PLANS.some((p) => p.id === body.plan) ? 'The founding price closed on Dec 31, 2026.' : 'Pick a plan' });
      if (billing && billing.stripe_subscription_id && ['trialing', 'active', 'past_due'].includes(billing.status)) return send(res, 400, { error: 'Your team already has a plan. Use Manage billing to change it.' });
      const prices = await stripe('/prices', { params: { lookup_keys: [plan.lookup], active: true } });
      const price = prices.data && prices.data[0];
      if (!price) return send(res, 500, { error: 'That plan is not set up in Stripe yet.' });
      // The free trial runs from the day the team started (no card needed to
      // begin). Choosing a plan during it keeps the same end date, so nothing
      // is charged before then; a team that never adds a card is cancelled.
      const ent = entitlement(billing, created, { enforced: true });
      const trialEnd = ent.trialEnd && new Date(ent.trialEnd) - Date.now() > 48 * 3600e3 ? Math.floor(new Date(ent.trialEnd) / 1000) : null;
      const params = {
        mode: 'subscription',
        line_items: [{ price: price.id, quantity: seats }],
        client_reference_id: teamId,
        metadata: { team_id: teamId },
        subscription_data: { metadata: { team_id: teamId }, ...(trialEnd ? { trial_end: trialEnd, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } } : {}) },
        ...(trialEnd ? { payment_method_collection: 'if_required' } : {}),
        ...(billing && billing.stripe_customer_id ? { customer: billing.stripe_customer_id } : { customer_email: user.email }),
        allow_promotion_codes: true,
        success_url: `${origin(req)}/?billing=done#/billing`,
        cancel_url: `${origin(req)}/#/billing`
      };
      const s = await stripe('/checkout/sessions', { method: 'POST', params });
      return send(res, 200, { url: s.url, day: pacificDay() });
    }
    return send(res, 400, { error: 'Unknown op' });
  } catch (e) {
    console.error('billing', e);
    return send(res, e.status === 503 ? 503 : 500, { error: e.status === 503 ? e.message : 'Could not reach Stripe. Try again in a minute.' });
  }
}
