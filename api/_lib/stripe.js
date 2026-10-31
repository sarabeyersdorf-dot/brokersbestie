// Stripe, by plain fetch (no package), the same way server.js talks to
// Supabase and Twilio. The secret key lives only in Vercel (STRIPE_SECRET_KEY);
// test and live keys are separate per Vercel environment.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './server.js';

// { a: { b: 1 }, c: [x, y] } -> a[b]=1&c[0]=x&c[1]=y  (Stripe's form encoding)
export function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (item && typeof item === 'object' ? formEncode(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === 'object') formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe(path, { method = 'GET', params, fetchImpl = fetch } = {}) {
  const key = env('STRIPE_SECRET_KEY');
  if (!key) throw Object.assign(new Error('Payments are not switched on yet (STRIPE_SECRET_KEY).'), { status: 503 });
  const body = params ? formEncode(params).toString() : '';
  const url = `https://api.stripe.com/v1${path}${method === 'GET' && body ? `?${body}` : ''}`;
  const r = await fetchImpl(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(method !== 'GET' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: method !== 'GET' && body ? body : undefined,
    signal: AbortSignal.timeout(20000)
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((json.error && json.error.message) || `Stripe answered ${r.status}`), { status: r.status });
  return json;
}

// Stripe-Signature: t=<unix>,v1=<hex>[,v1=...]. HMAC-SHA256 of "<t>.<raw body>"
// with the endpoint's signing secret. Refused if stale (default 5 minutes).
export function verifyStripeSignature(raw, header, secret, { tolerance = 300, now = Date.now() } = {}) {
  if (!secret || !header) return false;
  const parts = String(header).split(',').map((s) => s.split('='));
  const t = Number((parts.find(([k]) => k === 't') || [])[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length) return false;
  if (Math.abs(now / 1000 - t) > tolerance) return false;
  const want = createHmac('sha256', secret).update(`${t}.${raw}`, 'utf8').digest('hex');
  return sigs.some((s) => s.length === want.length && timingSafeEqual(Buffer.from(s), Buffer.from(want)));
}

// A Stripe subscription -> our billing row. Newer API versions moved the
// period end onto the subscription item; read both.
export function billingFromSubscription(sub) {
  const item = (sub.items && sub.items.data && sub.items.data[0]) || {};
  const unix = (n) => (n ? new Date(n * 1000).toISOString() : null);
  return {
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer && sub.customer.id,
    stripe_subscription_id: sub.id,
    stripe_item_id: item.id || null,
    plan: (item.price && item.price.lookup_key) || null,
    status: sub.status,
    seats: item.quantity || null,
    trial_ends_at: unix(sub.trial_end),
    // Newer Stripe API versions (2026-09-30) record "cancel at the end of the
    // period" from the Customer Portal as cancel_at = that date, with
    // cancel_at_period_end false (seen in the sandbox, 2026-10-31). Read both.
    current_period_end: unix(sub.cancel_at || sub.current_period_end || item.current_period_end),
    cancel_at_period_end: !!(sub.cancel_at_period_end || sub.cancel_at)
  };
}
