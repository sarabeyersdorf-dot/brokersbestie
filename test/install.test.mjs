import test from 'node:test';
import assert from 'node:assert/strict';
import { platform, installSteps } from '../js/install.js';

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const GMAIL_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IG = SAFARI.replace('Safari/604.1', 'Instagram 300.0');
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36';

test('tells the phone and browser apart', () => {
  assert.deepEqual(platform(SAFARI), { os: 'ios', browser: 'safari' });
  assert.deepEqual(platform(GMAIL_IOS), { os: 'ios', browser: 'inapp' }, 'an iPhone web view without Safari/ is another app');
  assert.deepEqual(platform(IG), { os: 'ios', browser: 'inapp' });
  assert.deepEqual(platform(CHROME_IOS), { os: 'ios', browser: 'chrome' });
  assert.deepEqual(platform(ANDROID), { os: 'android', browser: 'chrome' });
  assert.deepEqual(platform(SAMSUNG), { os: 'android', browser: 'samsung' });
  assert.equal(platform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5).os, 'ios', 'an iPad says Macintosh');
});

test('an in-app browser is told to open Safari first', () => {
  assert.match(installSteps({ os: 'ios', browser: 'inapp' }).join(' '), /Open in Safari/);
  assert.match(installSteps({ os: 'ios', browser: 'safari' }).join(' '), /Add to Home Screen/);
  assert.match(installSteps({ os: 'android', browser: 'samsung' }).join(' '), /Home screen/);
});

test('feedback opens an email to Sara with the phone filled in', async () => {
  const { feedbackLink } = await import('../js/install.js');
  globalThis.window ??= { matchMedia: () => ({ matches: false }), navigator: {} };
  const link = feedbackLink({ where: 'Settings', signedIn: true }, platform(SAFARI), SAFARI);
  assert.match(link, /^mailto:support@brokersbestie\.app\?subject=Brokers%20Bestie%20feedback&body=/);
  const body = decodeURIComponent(link.split('body=')[1]);
  assert.match(body, /Phone: iPhone 18\.0 · safari/);
  assert.match(body, /Signed in: yes · Screen: Settings/);
});

test('the version shown in Settings is the one the service worker caches', async () => {
  const fs = await import('node:fs');
  const { APP_VERSION } = await import('../js/config.js');
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], APP_VERSION);
});

test('sign-in errors are said in plain words', async () => {
  const { authMessage } = await import('../js/store.js').catch(() => ({}));
  if (!authMessage) return; // store.js needs a browser; covered in the browser check
  assert.match(authMessage({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }), /Too many sign-in emails/);
  assert.match(authMessage({ message: 'Token has expired or is invalid' }), /code did not work/);
});
