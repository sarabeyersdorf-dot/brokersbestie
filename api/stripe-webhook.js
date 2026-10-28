// /api/stripe-webhook — Stripe tells us what happened to a team's plan
// (2026-10-28). Signature-checked with STRIPE_WEBHOOK_SECRET (Stripe Dashboard
// → Developers → Webhooks → this endpoint → Signing secret), on the RAW body:
// a parsed-and-re-stringified body would never match the signature.
//
// Every event re-reads the subscription from Stripe and writes its current
// state, so events arriving twice or out of order cannot leave a wrong row.
// Handled: checkout.session.completed, customer.subscription.created /
// updated / deleted / trial_will_end, invoice.paid, invoice.payment_failed.

import { send, db, env } from './_lib/server.js';
import { stripe, verifyStripeSignature, billingFromSubscription } from './_lib/stripe.js';

async function rawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

// The subscription an event is about, whatever its shape.
export function subscriptionIdOf(event) {
  const o = (event.data && event.data.object) || {};
  if (o.object === 'subscription') return o.id;
  if (typeof o.subscription === 'string') return o.subscription;                     // checkout session, older invoices
  const parent = o.parent && o.parent.subscription_details;                           // newer invoices
  if (parent && parent.subscription) return typeof parent.subscription === 'string' ? parent.subscription : parent.subscription.id;
  return null;
}

export const HANDLED = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.trial_will_end', 'invoice.paid', 'invoice.payment_failed'];

export async function applyEvent(event, { stripeImpl = stripe, dbImpl = db } = {}) {
  if (!HANDLED.includes(event.type)) return { ignored: true };
  const subId = subscriptionIdOf(event);
  if (!subId) return { ignored: true };
  const sub = await stripeImpl(`/subscriptions/${subId}`);
  const o = event.data.object || {};
  let teamId = (sub.metadata && sub.metadata.team_id) || o.client_reference_id || (o.metadata && o.metadata.team_id) || null;
  const row = billingFromSubscription(sub);
  if (!teamId && row.stripe_customer_id) {
    const found = await dbImpl(`billing?stripe_customer_id=eq.${encodeURIComponent(row.stripe_customer_id)}&select=team_id`);
    teamId = found[0] && found[0].team_id;
  }
  if (!teamId) return { ignored: true, reason: 'no team' };
  await dbImpl('billing?on_conflict=team_id', { method: 'POST', body: { team_id: teamId, ...row, updated_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=minimal' });
  return { team_id: teamId, status: row.status };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const raw = await rawBody(req);
  if (!verifyStripeSignature(raw, req.headers['stripe-signature'], env('STRIPE_WEBHOOK_SECRET'))) return send(res, 400, { error: 'bad signature' });
  let event;
  try { event = JSON.parse(raw); } catch { return send(res, 400, { error: 'bad body' }); }
  try {
    return send(res, 200, { received: true, ...(await applyEvent(event)) });
  } catch (e) {
    console.error('stripe-webhook', event.type, e);
    return send(res, 500, { error: 'not recorded; Stripe will retry' });
  }
}

// Vercel: hand us the request untouched so the signature can be checked.
export const config = { api: { bodyParser: false } };
