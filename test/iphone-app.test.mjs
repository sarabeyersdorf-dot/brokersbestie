// The iPhone App Store app (2026-11-12, James's note): the same no-prices
// rule as Android, no "add to home screen" help, terms without prices, and
// reminders through Apple (APNs) instead of web push.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectIos } from '../js/twa.js';
import { apnsJwt, apnsPayload, sendApns, p8Body, apnsReady, APNS_TOPIC } from '../supabase/functions/reminders/apns.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const app = read('../js/app.js');

test('the iPhone app is recognised by its start URL, its user agent, or a stored mark', () => {
  assert.equal(detectIos({ search: '?source=ios' }), true);
  assert.equal(detectIos({ ua: 'Mozilla/5.0 (iPhone) AppleWebKit/605 BrokersBestieiOS/1.0' }), true);
  assert.equal(detectIos({ stored: '1' }), true);
  assert.equal(detectIos({ search: '?source=twa', ua: 'Mozilla/5.0 (iPhone) Safari' }), false);
});

test('every no-prices place uses the store-app check (Android OR iPhone)', () => {
  assert.doesNotMatch(app, /isAndroidApp\(\)/, 'app.js must use isStoreApp(), not the Android-only check');
  assert.ok((app.match(/isStoreApp\(\)/g) || []).length >= 6);
  assert.match(read('../js/twa.js'), /export const isStoreApp = \(\) => isAndroidApp\(\) \|\| isIosApp\(\);/);
});

test('no "add to home screen" help inside a store app', () => {
  const install = read('../js/install.js');
  assert.match(install, /export function isInstalled\(\) \{\n  \/\/[^\n]*\n  if \(isStoreApp\(\)\) return true;/);
  assert.match(install, /export function installCard\([^)]*\) \{\n  if \(isStoreApp\(\)\) return '';/);
});

test('the terms page drops the price paragraph inside a store app, and the app links to that version', () => {
  const terms = read('../terms.html');
  assert.match(terms, /<section data-prices>\s*<h2>Paid plans<\/h2>/);
  assert.match(terms, /app=1/);
  assert.match(terms, /BrokersBestieiOS/);
  assert.match(terms, /bb:twa/);
  assert.match(terms, /bb:ios/);
  assert.doesNotMatch(app, /href="terms\.html"/, 'every in-app terms link goes through termsHref()');
  assert.match(app, /function termsHref\(\) \{ return isStoreApp\(\) \? 'terms\.html\?app=1' : 'terms\.html'; \}/);
});

test('the reminder bridge uses the names agreed with James', () => {
  const push = read('../js/push.js');
  assert.match(push, /window\.webkit\.messageHandlers\.bestie/);
  assert.match(push, /op: 'push-register'/);
  assert.match(push, /op: 'push-unregister'/);
  assert.match(push, /window\.bestieNative\.onPushToken = /);
  assert.match(push, /window\.bestieNative\.onPushError = /);
  assert.match(push, /kind: 'apns', apns_token: t\.token/);
  assert.match(push, /if \(nativeBridge\(\)\) return 'ready';/);
  const sql = read('../db/033_apns_push.sql');
  for (const c of ['kind', 'apns_token', 'apns_env']) assert.match(sql, new RegExp(`add column if not exists ${c}`));
  assert.match(sql, /alter column endpoint drop not null/);
});

test('the reminder service sends Apple rows to Apple and nothing else changes', () => {
  const fn = read('../supabase/functions/reminders/index.ts');
  assert.match(fn, /if \(sub\.kind === 'apns'\)/);
  assert.match(fn, /if \(r\.gone\) await db\.from\('push_subs'\)\.delete\(\)/);
  assert.doesNotMatch(read('../supabase/functions/reminders/apns.js'), /BEGIN PRIVATE KEY-----[A-Za-z0-9+/]/, 'no key in the repo');
});

async function testKey() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  const b64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n');
  return { kp, pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n` };
}
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

test('the Apple sign-in token is a valid ES256 JWT however the key was pasted', async () => {
  const { kp, pem } = await testKey();
  assert.equal(p8Body(pem), p8Body(pem.replace(/\n/g, '\\n')));
  const jwt = await apnsJwt({ keyP8: pem.replace(/\n/g, '\\n'), keyId: 'KEY123', teamId: 'TEAM456' }, 1_800_000_000_000);
  const [h, b, sig] = jwt.split('.');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(unb64u(h))), { alg: 'ES256', kid: 'KEY123' });
  assert.deepEqual(JSON.parse(new TextDecoder().decode(unb64u(b))), { iss: 'TEAM456', iat: 1_800_000_000 });
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, unb64u(sig), new TextEncoder().encode(`${h}.${b}`));
  assert.equal(ok, true);
  assert.equal(apnsReady({ APNS_KEY_P8: pem, APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T' }), true);
  assert.equal(apnsReady({ APNS_KEY_P8: pem }), false);
});

test('sendApns: right host per build, right headers, payload with the url, dead tokens dropped', async () => {
  const { pem } = await testKey();
  const env = { APNS_KEY_P8: pem, APNS_KEY_ID: 'KEY999', APNS_TEAM_ID: 'TEAM999' };
  const calls = [];
  const fake = (status, body) => async (url, init) => { calls.push({ url, init }); return { status, json: async () => body }; };
  const msg = { key: 'ev:1', title: 'Showing at 10:00 AM', body: 'In 30 min', url: '#/p/abc' };
  let r = await sendApns({ apns_token: 'abc123', apns_env: 'sandbox' }, msg, env, { fetchImpl: fake(200, {}), now: 1_900_000_000_000 });
  assert.deepEqual(r, { status: 200, reason: '', gone: false });
  assert.equal(calls[0].url, 'https://api.sandbox.push.apple.com/3/device/abc123');
  assert.equal(calls[0].init.headers['apns-topic'], APNS_TOPIC);
  assert.equal(calls[0].init.headers['apns-push-type'], 'alert');
  assert.match(calls[0].init.headers.authorization, /^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  assert.deepEqual(JSON.parse(calls[0].init.body), apnsPayload(msg));
  assert.equal(JSON.parse(calls[0].init.body).url, '#/p/abc');
  await sendApns({ apns_token: 'abc123', apns_env: 'production' }, msg, env, { fetchImpl: fake(200, {}), now: 1_900_000_000_000 });
  assert.equal(calls[1].url, 'https://api.push.apple.com/3/device/abc123');
  r = await sendApns({ apns_token: 'x', apns_env: 'production' }, msg, env, { fetchImpl: fake(410, { reason: 'Unregistered' }), now: 1_900_000_000_000 });
  assert.equal(r.gone, true);
  r = await sendApns({ apns_token: 'x', apns_env: 'production' }, msg, env, { fetchImpl: fake(400, { reason: 'BadDeviceToken' }), now: 1_900_000_000_000 });
  assert.equal(r.gone, true);
  r = await sendApns({ apns_token: 'x', apns_env: 'production' }, msg, env, { fetchImpl: fake(429, { reason: 'TooManyRequests' }), now: 1_900_000_000_000 });
  assert.equal(r.gone, false);
});
