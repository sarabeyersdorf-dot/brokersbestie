// The Google Play app (2026-11-11): inside it there are no prices, plans or
// ways to pay; agents subscribe on the website. And the public delete page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectTwa, appAccountWords } from '../js/twa.js';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

test('the Android app is recognised by its start URL, its referrer, or a stored mark', () => {
  assert.equal(detectTwa({ search: '?source=twa' }), true);
  assert.equal(detectTwa({ referrer: 'android-app://app.brokersbestie/' }), true);
  assert.equal(detectTwa({ stored: '1' }), true);
  assert.equal(detectTwa({ search: '?demo=1', referrer: 'https://google.com/' }), false);
  assert.equal(detectTwa({ referrer: 'android-app://com.other.app' }), false);
});

test('the account words never carry a price or a way to pay', () => {
  for (const b of [null, { state: 'comped' }, { state: 'trial', daysLeft: 5 }, { state: 'lapsed', enforced: true }, { state: 'past_due' }, { state: 'trial', subscribed: true, plan: { price: '$99' } }]) {
    const w = appAccountWords(b);
    assert.doesNotMatch(w.text, /\$|plan to|choose|subscribe|price|trial/i, w.text);
  }
  assert.equal(appAccountWords({ state: 'lapsed', enforced: true }).active, false);
  assert.match(appAccountWords({ state: 'lapsed', enforced: true }).text, /isn't active yet/);
});

test('every way to the plan screen checks for the Android app first', () => {
  assert.match(app, /function viewBilling\(\) \{\n  if \(isStoreApp\(\)\) return viewAccountApp\(\);/);
  const at = app.indexOf('function planBanner()');
  const banner = app.slice(at, app.indexOf('\nfunction ', at + 10));
  assert.ok(banner.includes('href="#/billing"'));
  assert.ok(banner.indexOf('isStoreApp()') < banner.indexOf('href="#/billing"'));
  assert.match(app, /c\.user && !isStoreApp\(\) \? html`<a class="card row sec" href="#\/billing">/);
  const acct = app.slice(app.indexOf('function viewAccountApp'), app.indexOf('// Your plan (2026-10-28'));
  assert.doesNotMatch(acct, /checkout|portal|\$\d|Choose/);
});

test('the public delete-account page is served and says how', () => {
  const page = readFileSync(new URL('../delete-account.html', import.meta.url), 'utf8');
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.ok(vercel.rewrites.some((r) => r.source === '/delete-account' && r.destination === '/delete-account.html'));
  assert.match(page, /Delete my account/);
  assert.match(page, /support@brokersbestie\.app/);
  assert.match(page, /30 days/);
});

test('assetlinks.json lets app.brokersbestie open full screen, with both keys', () => {
  const links = JSON.parse(readFileSync(new URL('../.well-known/assetlinks.json', import.meta.url), 'utf8'));
  const t = links[0].target;
  assert.deepEqual(links[0].relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(t.namespace, 'android_app');
  assert.equal(t.package_name, 'app.brokersbestie');
  assert.equal(t.sha256_cert_fingerprints.length, 2, 'Play app signing key + upload key');
  for (const f of t.sha256_cert_fingerprints) assert.match(f, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
});
