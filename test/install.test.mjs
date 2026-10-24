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
