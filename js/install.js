import { SUPPORT_EMAIL } from './config.js';
// "Put it on your home screen" (Sara, 2026-10-24: "the add to homescreen
// doesn't work"). Android Chrome can install with one button once the browser
// offers it (beforeinstallprompt); iPhone has no button an app can press, so
// it gets the steps for the browser it is actually in. The usual reason it
// "doesn't work" on iPhone: the link opened inside Gmail, Messages' preview or
// another app, whose share sheet has no Add to Home Screen.
import { html, raw, icon } from './ui.js';

let deferred = null;
const listeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });
}
export const onInstallChange = (f) => listeners.add(f);

export function isInstalled() {
  try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch { return false; }
}

// What kind of phone and browser this is, from the user agent.
export function platform(ua = navigator.userAgent, touch = navigator.maxTouchPoints || 0) {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1);
  const android = /Android/.test(ua);
  const inApp = /FBAN|FBAV|Instagram|Line\/|GSA\/|LinkedInApp|Snapchat|Twitter|; wv\)/.test(ua);
  let browser = 'other';
  if (ios) browser = /CriOS/.test(ua) ? 'chrome' : /FxiOS/.test(ua) ? 'firefox' : /EdgiOS/.test(ua) ? 'edge' : /Safari\//.test(ua) && !inApp ? 'safari' : 'inapp';
  else if (android) browser = /SamsungBrowser/.test(ua) ? 'samsung' : /Firefox/.test(ua) ? 'firefox' : inApp ? 'inapp' : /Chrome\//.test(ua) ? 'chrome' : 'other';
  return { os: ios ? 'ios' : android ? 'android' : 'desktop', browser: inApp ? 'inapp' : browser };
}

export function installSteps(p) {
  if (p.os === 'ios') {
    if (p.browser === 'inapp') return ['This page opened inside another app, which cannot add it to your home screen.', 'Tap ••• or the compass and choose “Open in Safari”, or copy the link and paste it into Safari.', 'Then follow the iPhone steps here again.'];
    return [
      p.browser === 'safari' ? 'Tap the Share button (the square with an arrow). On newer iPhones tap ••• at the bottom first, then Share.' : 'Tap the Share button (the square with an arrow, at the top right).',
      'Scroll down and tap “Add to Home Screen”. If it is not there, tap “View More” or “Edit Actions”.',
      'Leave “Open as Web App” on, then tap Add.',
      'If it still is not offered, open brokersbestie.app in Safari and try there.'
    ];
  }
  if (p.os === 'android') {
    if (p.browser === 'inapp') return ['This page opened inside another app. Tap ⋮ and choose “Open in Chrome”.', 'Then come back here and tap Install.'];
    if (p.browser === 'samsung') return ['Tap the ≡ menu at the bottom.', 'Tap “Add page to”, then “Home screen”.'];
    return ['Tap the ⋮ menu at the top right of Chrome.', 'Tap “Add to home screen” or “Install app”, then Install.'];
  }
  return ['Open this page on your phone: brokersbestie.app', 'iPhone: Safari → Share → Add to Home Screen. Android: Chrome ⋮ → Install app.'];
}

export function installCard({ dismissable = false, slim = false } = {}) {
  if (slim && !isInstalled()) {
    // One line on Today; the steps open on a tap (Today cleanup, 2026-10-27).
    const p = platform();
    return html`<details class="card sec install-slim" data-install>
      <summary>${icon('share', 20)}<span class="grow">Put Bestie on your home screen</span><span class="small">How</span></summary>
      <div class="pad" style="padding-top:0">
        <button class="btn dark block" type="button" data-install-go ${deferred ? '' : raw('hidden')}>Install Bestie</button>
        <ol class="install-steps" ${deferred ? raw('hidden') : ''}>${installSteps(p).map((s) => html`<li>${s}</li>`)}</ol>
        ${dismissable ? html`<button class="btn ghost" type="button" data-install-hide style="min-height:36px">Not now</button>` : ''}
      </div>
    </details>`;
  }
  if (isInstalled()) return html`<section class="card pad sec"><div class="label">On your home screen</div><div class="small">✓ Bestie is installed on this phone.</div></section>`;
  const p = platform();
  return html`<section class="card pad sec install-card" data-install>
    <div class="install-head"><div><div class="label">Put Bestie on your home screen</div><div class="small">It opens like an app and works with no signal.</div></div></div>
    <button class="btn dark big block" type="button" data-install-go ${deferred ? '' : raw('hidden')}>Install Bestie</button>
    <ol class="install-steps" ${deferred ? raw('hidden') : ''}>${installSteps(p).map((s) => html`<li>${s}</li>`)}</ol>
    ${dismissable ? html`<button class="btn ghost" type="button" data-install-hide style="min-height:36px">Not now</button>` : ''}
  </section>`;
}

export function wireInstall(root, { onHide } = {}) {
  const card = root.querySelector('[data-install]');
  if (!card) return;
  const go = card.querySelector('[data-install-go]');
  const steps = card.querySelector('.install-steps');
  const refresh = () => { if (go) go.hidden = !deferred; if (steps) steps.hidden = !!deferred; };
  onInstallChange(refresh);
  go?.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch {}
    deferred = null;
    refresh();
  });
  card.querySelector('[data-install-hide]')?.addEventListener('click', () => { card.remove(); onHide?.(); });
}

// "Send feedback" (Sara, 2026-10-24, for the first outside testers): opens the
// tester's own mail app addressed to Sara, with what kind of phone and browser
// they are on filled in, so a bug report says where it happened.
// Sent to the support address, which forwards to Sara's Gmail (ImprovMX,
// confirmed by Cowork 2026-10-28). FEEDBACK_CC copied her Gmail until then.
export const FEEDBACK_TO = SUPPORT_EMAIL;
export const FEEDBACK_CC = '';
export function feedbackLink({ where = '', signedIn = false, version = '' } = {}, p = platform(), ua = navigator.userAgent) {
  const os = (ua.match(/(?:iPhone OS|CPU OS|Android) ([\d_.]+)/) || [])[1];
  const lines = [
    'What happened (or what would make Bestie better):', '', '',
    'What did you expect?', '', '',
    '--- please leave this part, it helps fix things ---',
    `Phone: ${p.os === 'ios' ? 'iPhone' : p.os === 'android' ? 'Android' : 'Computer'}${os ? ' ' + os.replace(/_/g, '.') : ''} · ${p.browser}${isInstalled() ? ' · home screen app' : ''}`,
    `Signed in: ${signedIn ? 'yes' : 'no'} · Screen: ${where || '-'}${version ? ' · Version ' + version : ''}`,
    `Sent: ${new Date().toLocaleString()}`
  ];
  return `mailto:${FEEDBACK_TO}?${FEEDBACK_CC ? `cc=${encodeURIComponent(FEEDBACK_CC)}&` : ''}subject=${encodeURIComponent('Brokers Bestie feedback')}&body=${encodeURIComponent(lines.join('\n'))}`;
}
