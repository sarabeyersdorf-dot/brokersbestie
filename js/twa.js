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

// What the Android app says about the account, with no price and no way to
// pay: active (paid, trial or complimentary) or not active yet.
export function appAccountWords(b) {
  if (!b) return { active: true, text: 'Checking your account…' };
  if (b.state === 'comped') return { active: true, text: 'Your team is on a complimentary plan.' };
  if (b.state === 'lapsed' && b.enforced) return { active: false, text: "Your account isn't active yet. Everything is still here to look at; changes are paused." };
  if (b.state === 'past_due') return { active: false, text: "Your account isn't active right now. Changes may pause soon." };
  return { active: true, text: 'Your account is active.' };
}
