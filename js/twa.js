// Running inside the Google Play app (2026-11-11)? The Android app is the
// website wrapped as a Trusted Web Activity (package app.brokersbestie). Google
// requires its own billing for subscriptions bought inside an app, and Sara
// chose not to use it: agents subscribe on brokersbestie.app, then sign in.
// So inside the Android app there are no prices, plans, Subscribe buttons,
// Stripe checkout or payment links (Cowork, 20261111_CWtoCC_android-play-build).
//
// The app opens https://brokersbestie.app/?source=twa (its start URL), and
// Chrome sends the referrer android-app://app.brokersbestie on launch. Either
// one marks this phone's copy as the Android app, and it stays marked (the
// hash routes drop the query string after the first screen).
export const TWA_PACKAGE = 'app.brokersbestie';
const KEY = 'bb:twa';

export function detectTwa({ search = '', referrer = '', stored = null } = {}) {
  if (/[?&]source=twa\b/.test(search)) return true;
  if (String(referrer).startsWith(`android-app://${TWA_PACKAGE}`)) return true;
  return stored === '1';
}

let cached = null;
export function isAndroidApp() {
  if (cached !== null) return cached;
  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch { /* private window */ }
  cached = typeof location !== 'undefined' && detectTwa({ search: location.search, referrer: typeof document !== 'undefined' ? document.referrer : '', stored });
  if (cached) { try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } }
  return cached;
}

// The iPhone App Store app (2026-11-12, James's note
// 20261111_JamesToCC_bestie-iphone-app.md): a native app (bundle
// app.brokersbestie) that shows this site in a web view. It opens
// https://brokersbestie.app/?source=ios and adds "BrokersBestieiOS" to the
// browser's user agent, so it is still recognised after the hash routes drop
// the query string. Apple's rule 3.1.3(f) (a free companion app to a paid web
// service) needs the same thing as Google: no prices or ways to pay inside it.
const IOS_KEY = 'bb:ios';
export function detectIos({ search = '', ua = '', stored = null } = {}) {
  if (/[?&]source=ios\b/.test(search)) return true;
  if (/BrokersBestieiOS/.test(ua)) return true;
  return stored === '1';
}
let iosCached = null;
export function isIosApp() {
  if (iosCached !== null) return iosCached;
  let stored = null;
  try { stored = localStorage.getItem(IOS_KEY); } catch { /* private window */ }
  iosCached = typeof location !== 'undefined' && detectIos({ search: location.search, ua: typeof navigator !== 'undefined' ? navigator.userAgent : '', stored });
  if (iosCached) { try { localStorage.setItem(IOS_KEY, '1'); } catch { /* ignore */ } }
  return iosCached;
}

// Inside either store app (Google Play or the App Store): no prices, plans,
// Subscribe buttons, Stripe or payment links, and no "add to home screen" help.
export const isStoreApp = () => isAndroidApp() || isIosApp();

// What the Android app says about the account, with no price and no way to
// pay: active (paid, trial or complimentary) or not active yet.
export function appAccountWords(b) {
  if (!b) return { active: true, text: 'Checking your account…' };
  if (b.state === 'comped') return { active: true, text: 'Your team is on a complimentary plan.' };
  if (b.state === 'lapsed' && b.enforced) return { active: false, text: "Your account isn't active yet. Everything is still here to look at; changes are paused." };
  if (b.state === 'past_due') return { active: false, text: "Your account isn't active right now. Changes may pause soon." };
  return { active: true, text: 'Your account is active.' };
}
