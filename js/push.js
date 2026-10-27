// Pop-up reminders on this phone (2026-10-27). The phone subscribes; the
// Supabase `reminders` function decides what is due and sends it (every 5
// minutes): before an appointment or tour, a 7:30 morning list, and when a
// safety check-in runs out. On an iPhone this only works from the home-screen
// app (Apple's rule), so the screen says so instead of offering a dead switch.
import * as store from './store.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { platform, isInstalled } from './install.js';

const FN = `${SUPABASE_URL}/functions/v1/reminders`;
export const LEADS = [[15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']];

export function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return platform().os === 'ios' && !isInstalled() ? 'install' : 'unsupported';
  }
  if (platform().os === 'ios' && !isInstalled()) return 'install';
  if (Notification.permission === 'denied') return 'blocked';
  return 'ready';
}

export async function currentSub() {
  try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch { return null; }
}

const fromB64u = (s) => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(t + '==='.slice((t.length + 3) % 4)), (c) => c.charCodeAt(0)); };
async function idFor(endpoint) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));
  return [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function turnOn(lead = 30) {
  const c = store.cloud;
  if (!c.user || !c.teamId) throw new Error('Sign in first (Team mode, above).');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are off for Bestie. Turn them on in your phone\'s Settings, then try again.');
  const res = await fetch(`${FN}?op=key`, { headers: { apikey: SUPABASE_ANON_KEY } });
  const { publicKey } = await res.json();
  if (!publicKey) throw new Error('Could not reach the reminder service. Try again in a minute.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(publicKey) }));
  const j = sub.toJSON();
  const row = { id: await idFor(j.endpoint), team_id: c.teamId, owner: (store.settings().myName || '').toLowerCase() || null, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lead_minutes: lead, updated_at: new Date().toISOString() };
  const { error } = await c.client.from('push_subs').upsert(row);
  if (error) throw new Error(error.message);
  store.saveSettings({ pushLead: lead, pushOn: true });
  return row;
}

export async function turnOff() {
  const sub = await currentSub();
  if (sub) {
    const id = await idFor(sub.endpoint);
    try { await store.cloud.client?.from('push_subs').delete().eq('id', id); } catch {}
    await sub.unsubscribe().catch(() => {});
  }
  store.saveSettings({ pushOn: false });
}

export async function sendTest() {
  const token = await store.accessToken();
  const res = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }, body: JSON.stringify({ op: 'test' }) });
  return res.json();
}
