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

// The iPhone App Store app (2026-11-12): web push does not work inside an
// app's web view, so the native app delivers reminders through Apple (APNs).
// The bridge (agreed with James's Claude, who builds the native half):
//   page -> app:  window.webkit.messageHandlers.bestie.postMessage({ op: 'push-register' | 'push-unregister' })
//   app -> page:  window.bestieNative.onPushToken({ token, env })   env = 'sandbox' | 'production'
//                 window.bestieNative.onPushError({ message })
// The token is saved in push_subs as kind 'apns' (db/033); the reminders
// function sends to Apple for those rows and to web push for the rest.
export const nativeBridge = () => (typeof window !== 'undefined' && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bestie) || null;
let tokenWait = null;
if (typeof window !== 'undefined') {
  window.bestieNative = window.bestieNative || {};
  window.bestieNative.onPushToken = (r) => { const w = tokenWait; tokenWait = null; if (w) (r && r.token ? w.ok(r) : w.no(new Error('The phone did not give a reminder address.'))); };
  window.bestieNative.onPushError = (r) => { const w = tokenWait; tokenWait = null; if (w) w.no(new Error((r && r.message) || 'Notifications are off for Bestie. Turn them on in your iPhone Settings → Bestie → Notifications, then try again.')); };
}
function nativeToken() {
  return new Promise((ok, no) => {
    tokenWait = { ok, no };
    setTimeout(() => { if (tokenWait) { tokenWait = null; no(new Error('The phone did not answer. Try again.')); } }, 60000);
    nativeBridge().postMessage({ op: 'push-register' });
  });
}

export function pushState() {
  if (nativeBridge()) return 'ready';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return platform().os === 'ios' && !isInstalled() ? 'install' : 'unsupported';
  }
  if (platform().os === 'ios' && !isInstalled()) return 'install';
  if (Notification.permission === 'denied') return 'blocked';
  return 'ready';
}

export async function currentSub() {
  if (nativeBridge()) { const s = store.settings(); return s.pushOn && s.pushSubId ? { native: true, id: s.pushSubId } : null; }
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
  if (nativeBridge()) {
    const t = await nativeToken();
    const row = { id: await idFor(`apns:${t.token}`), kind: 'apns', apns_token: t.token, apns_env: t.env === 'sandbox' ? 'sandbox' : 'production', endpoint: null, p256dh: null, auth: null,
      team_id: c.teamId, owner: (store.settings().myName || '').toLowerCase() || null, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lead_minutes: lead, updated_at: new Date().toISOString(),
      base_lat: store.settings().homeBase?.lat ?? null, base_lng: store.settings().homeBase?.lng ?? null };
    const { error } = await c.client.from('push_subs').upsert(row);
    if (error) throw new Error(error.message);
    store.saveSettings({ pushLead: lead, pushOn: true, pushSubId: row.id });
    return row;
  }
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are off for Bestie. Turn them on in your phone\'s Settings, then try again.');
  const res = await fetch(`${FN}?op=key`, { headers: { apikey: SUPABASE_ANON_KEY } });
  const { publicKey } = await res.json();
  if (!publicKey) throw new Error('Could not reach the reminder service. Try again in a minute.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(publicKey) }));
  const j = sub.toJSON();
  const row = { id: await idFor(j.endpoint), team_id: c.teamId, owner: (store.settings().myName || '').toLowerCase() || null, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lead_minutes: lead, updated_at: new Date().toISOString(),
    base_lat: store.settings().homeBase?.lat ?? null, base_lng: store.settings().homeBase?.lng ?? null };
  const { error } = await c.client.from('push_subs').upsert(row);
  if (error) throw new Error(error.message);
  store.saveSettings({ pushLead: lead, pushOn: true, pushSubId: row.id });
  return row;
}

export async function turnOff() {
  if (nativeBridge()) {
    const id = store.settings().pushSubId;
    if (id) { try { await store.cloud.client?.from('push_subs').delete().eq('id', id); } catch {} }
    try { nativeBridge().postMessage({ op: 'push-unregister' }); } catch {}
    store.saveSettings({ pushOn: false, pushSubId: null });
    return;
  }
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

// Is the server texting safety alerts yet? (true once Twilio is set up in the
// Supabase function.) Asked on start-up and kept in settings, so the safety
// screen tells the truth offline too.
export async function serverStatus() {
  try {
    const r = await fetch(`${FN}?op=key`, { headers: { apikey: SUPABASE_ANON_KEY } });
    const j = await r.json();
    if (typeof j.safetySms === 'boolean' && j.safetySms !== store.settings().safetySms) { store.saveSettings({ safetySms: j.safetySms }); return true; }
  } catch {}
  return false;
}

// A safety check-in action on the server: start | extend | ok | help.
export async function safetyCall(action, row) {
  const token = await store.accessToken();
  const res = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }, body: JSON.stringify({ op: 'safety', action, id: row.id, due_at: row.due_at }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'Could not reach the server');
  return j;
}

// Safety contacts (2026-11-05): carriers require the contact to agree before
// any alert. 'status' asks where each phone stands (none | pending | accepted
// | opted_out); 'invite' texts the contact once to reply YES (the server skips
// it if they already answered or were asked in the last hour).
export async function contactCall(action, payload) {
  const token = await store.accessToken();
  const res = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }, body: JSON.stringify({ op: 'contact', action, ...payload }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'Could not reach the server');
  return j;
}

// A link (and QR code) for visitors to sign in at an open house on their own
// phones. Lasts 3 days. Needs team mode: the visitor is saved to the team.
export async function openHouseLink(propertyId) {
  const c = store.cloud;
  if (!c.user || !c.teamId) throw new Error('Sign in first (Settings → Team mode) to use the QR sign-in.');
  await store.syncNow();
  const { data, error } = await c.client.from('oh_links').insert({ team_id: c.teamId, property_id: propertyId, owner: (store.settings().myName || '').toLowerCase() || null }).select('token').single();
  if (error) throw new Error(error.message);
  return `${location.origin}/oh.html?t=${data.token}`;
}

// "Leave by" reminders: tell the reminder service where this phone last was.
// Only when reminders are on, only a location Bestie already had (no extra
// GPS), at most every 10 minutes.
let lastWhere = 0;
export async function shareWhere(fix) {
  if (!fix || !store.settings().pushOn || !store.cloud.user || Date.now() - lastWhere < 600000) return;
  lastWhere = Date.now();
  try {
    const sub = await currentSub();
    if (!sub) return;
    await store.cloud.client.from('push_subs').update({ from_lat: fix.lat, from_lng: fix.lng, from_at: new Date().toISOString(), base_lat: store.settings().homeBase?.lat ?? null, base_lng: store.settings().homeBase?.lng ?? null }).eq('id', sub.native ? sub.id : await idFor(sub.endpoint));
  } catch {}
}

// A link to one property's codes and directions that ends in 24 hours.
export async function shareLink(propertyId) {
  const c = store.cloud;
  if (!c.user || !c.teamId) throw new Error('Sign in first (Settings → Team mode) to send a 24-hour link.');
  await store.syncNow();
  const { data, error } = await c.client.from('share_links').insert({ team_id: c.teamId, property_id: propertyId, owner: (store.settings().myName || '').toLowerCase() || null }).select('token').single();
  if (error) throw new Error(error.message);
  return `${location.origin}/share.html?t=${data.token}`;
}
export async function stopShareLinks(propertyId) {
  const c = store.cloud;
  if (!c.user) return 0;
  const { data } = await c.client.from('share_links').update({ revoked: true }).eq('property_id', propertyId).eq('revoked', false).select('token');
  return (data || []).length;
}

// Buyer taps their own faces (2026-10-29): a 3-day link to this tour, and
// the faces the buyer has picked so far (tour_faces, written by the function).
export async function tourLink(tourId) {
  const c = store.cloud;
  if (!c.user || !c.teamId) throw new Error('Sign in first (Settings) to send the buyer a link.');
  await store.syncNow();
  const { data, error } = await c.client.from('tour_links').insert({ team_id: c.teamId, tour_id: tourId, owner: (store.settings().myName || '').toLowerCase() || null }).select('token').single();
  if (error) throw new Error(/foreign key/i.test(error.message) ? 'This tour has not reached the server yet. Try again in a moment.' : error.message);
  return `${location.origin}/faces.html?t=${data.token}`;
}
export async function buyerFaces(tourId) {
  const c = store.cloud;
  if (!c.user || !navigator.onLine) return null;
  const { data, error } = await c.client.from('tour_faces').select('stop_id, reaction, note, updated_at').eq('tour_id', tourId);
  return error ? null : data || [];
}
