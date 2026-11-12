// Reminders to the iPhone App Store app through Apple Push Notification
// service (APNs), 2026-11-12. Web push does not reach an app's web view, so
// the native app (James's, bundle app.brokersbestie) gives the page an Apple
// push token, saved in push_subs as kind 'apns' (db/033).
//
// Token-based auth: an ES256 JWT signed with the APNs key from James's Apple
// developer account. The key lives ONLY in this function's secrets, never in
// the repo: APNS_KEY_P8 (the .p8 file's text), APNS_KEY_ID, APNS_TEAM_ID.
// WebCrypto only, like webpush.js, so the same file runs in Deno and Node tests.
export const APNS_TOPIC = 'app.brokersbestie';
const enc = new TextEncoder();
const b64u = (bytes) => {
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// The .p8 text however it was pasted: with or without the BEGIN/END lines,
// real line breaks or literal "\n".
export function p8Body(text) {
  return String(text || '').replace(/\\n/g, '\n').replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
}

export function apnsReady(env) {
  return !!(env && env.APNS_KEY_P8 && env.APNS_KEY_ID && env.APNS_TEAM_ID);
}

let cached = null; // Apple wants the same token reused, refreshed every 20 to 60 minutes
export async function apnsJwt({ keyP8, keyId, teamId }, now = Date.now()) {
  if (cached && cached.keyId === keyId && now - cached.at < 45 * 60000) return cached.jwt;
  const der = Uint8Array.from(atob(p8Body(keyP8)), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ alg: 'ES256', kid: keyId })));
  const body = b64u(enc.encode(JSON.stringify({ iss: teamId, iat: Math.floor(now / 1000) })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`)));
  const jwt = `${head}.${body}.${b64u(sig)}`;
  cached = { jwt, keyId, at: now };
  return jwt;
}

// What the iPhone shows. `url` is opened inside the app when the reminder is tapped.
export function apnsPayload(msg) {
  return { aps: { alert: { title: msg.title, body: msg.body }, sound: 'default', 'thread-id': msg.tag || msg.key || 'bestie' }, url: msg.url || '#/' };
}

// Send one reminder. Returns { status, reason, gone }: gone = Apple says the
// token is dead (app deleted, notifications reset), so the row is dropped,
// like an expired web subscription.
export async function sendApns(sub, msg, env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const host = sub.apns_env === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  const jwt = await apnsJwt({ keyP8: env.APNS_KEY_P8, keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID }, now);
  const res = await fetchImpl(`${host}/3/device/${encodeURIComponent(sub.apns_token)}`, {
    method: 'POST',
    headers: { authorization: `bearer ${jwt}`, 'apns-topic': APNS_TOPIC, 'apns-push-type': 'alert', 'apns-priority': '10', 'apns-expiration': String(Math.floor(now / 1000) + 3600), 'content-type': 'application/json' },
    body: JSON.stringify(apnsPayload(msg))
  });
  let reason = '';
  if (res.status !== 200) { try { reason = (await res.json()).reason || ''; } catch { /* no body */ } }
  const gone = res.status === 410 || (res.status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(reason)) || reason === 'Unregistered';
  return { status: res.status, reason, gone };
}
