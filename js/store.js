// The one place data is read and written.
//
// Every change is saved on the phone first (localStorage, photos in IndexedDB),
// so the app works with no signal: at a gate, on a dirt road, in a basement.
// When team mode is on and the phone is online, changes go up to Supabase and
// the team's rows come down. Newer `updated_at` wins.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const TABLES = ['properties', 'access', 'people', 'notes', 'tasks', 'dates', 'events', 'tours', 'trips', 'expenses', 'checkins'];
const KEY = (t) => `bb:${t}`;
const DELETED = 'bb:_deleted';
const SETTINGS = 'bb:settings';

const listeners = new Set();
const OWNED = ['properties', 'events', 'tasks', 'tours'];
const data = {};

function readJson(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Could not save on this phone', e);
  }
}

// A tick on a CRM deadline before 2026-10-23 saved a stray row with id 'crm'
// (the id was cut at its first colon). It never reached the team and would
// block every save, so it is dropped here.
for (const t of TABLES) data[t] = readJson(KEY(t), []).filter((r) => r && r.id !== 'crm');

export function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const fn of listeners) fn();
}

export function all(table) {
  return data[table] || [];
}
export function get(table, id) {
  return all(table).find((r) => r.id === id) || null;
}
export function where(table, field, value) {
  return all(table).filter((r) => r[field] === value);
}
export function snapshot() {
  const out = {};
  for (const t of TABLES) out[t] = all(t);
  return out;
}

export function settings() {
  return readJson(SETTINGS, { irsRate: '', homeBase: null, checkinContact: null });
}
export function saveSettings(patch) {
  writeJson(SETTINGS, { ...settings(), ...patch });
  emit();
}

// A deadline or appointment the team's CRM knows about: it came from the CRM,
// or it sits on a property that did.
const crmListeners = new Set();
export function onCrmChange(fn) {
  crmListeners.add(fn);
}

export function crmLinked(r) {
  return !!r && (r.source === 'crm' || String(r.property_id || '').startsWith('crm:'));
}

export function save(table, row) {
  const now = new Date().toISOString();
  const existing = row.id ? get(table, row.id) : null;
  const next = { ...(existing || {}), ...row, id: row.id || uid(), updated_at: now, _dirty: true };
  // Changed on this phone -> send it to the CRM at the next sync (two-way sync).
  if ((table === 'dates' || table === 'events') && crmLinked(next) && !next.sample) {
    next.crm_dirty = true;
    for (const fn of crmListeners) fn();
  }
  if (!existing) next.created_at = now;
  // Whose it is, for the Mine / <name> filter: whoever made it on this phone.
  if (!existing && OWNED.includes(table) && !next.owner && settings().myName) next.owner = settings().myName;
  data[table] = existing ? all(table).map((r) => (r.id === next.id ? next : r)) : [next, ...all(table)];
  writeJson(KEY(table), data[table]);
  emit();
  queueSync();
  return next;
}

export function remove(table, id) {
  data[table] = all(table).filter((r) => r.id !== id);
  writeJson(KEY(table), data[table]);
  const tomb = readJson(DELETED, []);
  tomb.push({ table, id });
  writeJson(DELETED, tomb);
  emit();
  queueSync();
}

// Deleting a property takes everything filed under it with it.
export function removeProperty(id) {
  for (const t of ['access', 'people', 'notes', 'tasks', 'dates', 'events', 'expenses']) {
    for (const r of where(t, 'property_id', id)) remove(t, r.id);
  }
  remove('properties', id);
}

// ---------- photos (kept on the phone; uploaded in team mode) ----------

let dbPromise;
function photoDb() {
  dbPromise = dbPromise || new Promise((resolve, reject) => {
    const req = indexedDB.open('bb-photos', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function putPhoto(id, blob) {
  const db = await photoDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').put(blob, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  uploadPhoto(id, blob);
}

const urlCache = new Map();
export async function photoUrl(id, remotePath) {
  if (urlCache.has(id)) return urlCache.get(id);
  try {
    const db = await photoDb();
    const blob = await new Promise((resolve) => {
      const req = db.transaction('photos').objectStore('photos').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    if (blob) {
      const url = URL.createObjectURL(blob);
      urlCache.set(id, url);
      return url;
    }
  } catch {}
  if (remotePath && cloud.client) {
    const { data: signed } = await cloud.client.storage.from('photos').createSignedUrl(remotePath, 3600);
    if (signed) {
      urlCache.set(id, signed.signedUrl);
      return signed.signedUrl;
    }
  }
  return null;
}

// Phone cameras make 4MB photos. 1600px JPEG is plenty to find a lockbox.
export async function shrinkPhoto(file, max = 1600) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
}

// ---------- team mode (Supabase) ----------

export const cloud = { enabled: !!(SUPABASE_URL && SUPABASE_ANON_KEY), client: null, user: null, teamId: null, status: 'off' };

async function client() {
  if (!cloud.enabled) return null;
  if (!cloud.client) {
    // With no signal the sign-in library can't load. The app keeps working on
    // the phone and tries again when the signal comes back.
    try {
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
      cloud.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });
    } catch {
      cloud.status = 'error';
      throw new Error('No connection right now. Everything is still saved on this phone.');
    }
  }
  return cloud.client;
}

export async function startCloud() {
  const c = await client().catch(() => null);
  if (!c) return;
  const { data: s } = await c.auth.getSession();
  cloud.user = s.session ? s.session.user : null;
  c.auth.onAuthStateChange((_e, session) => {
    cloud.user = session ? session.user : null;
    if (cloud.user) syncNow();
    emit();
  });
  if (cloud.user) syncNow();
  emit();
}

// Sign-in emails carry a code to type into the app AND a link. The code is the
// way that works from the home screen: on iPhone a link opens Safari or the
// mail app's browser, which signs THAT browser in, not the installed app
// (James, 2026-10-24). The built-in email service sends only a few an hour,
// so a refusal is said in plain words.
export async function signIn(email) {
  const c = await client();
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw new Error(authMessage(error));
}

export async function verifyCode(email, code) {
  const c = await client();
  const { data, error } = await c.auth.verifyOtp({ email, token: String(code).replace(/\D/g, ''), type: 'email' });
  if (error) throw new Error(authMessage(error));
  cloud.user = data.user || data.session?.user || null;
  emit();
  return cloud.user;
}

export function authMessage(e) {
  const m = `${e?.code || ''} ${e?.message || e || ''}`;
  if (/rate|429|over_email/i.test(m)) return 'Too many sign-in emails in the last hour. Use the code in the last email you got, or try again in an hour.';
  if (/expired|invalid|otp/i.test(m)) return 'That code did not work. It may have expired: use the newest email, or send a new code.';
  return e?.message || 'Could not sign in right now.';
}

export async function signOut() {
  const c = await client();
  // 'local' forgets this phone's session even with no signal; a server call
  // that hangs must never leave someone stuck signed in.
  await c.auth.signOut({ scope: 'local' }).catch(() => {});
  cloud.user = null;
  cloud.teamId = null;
  emit();
}

export async function accessToken() {
  const c = await client();
  if (!c) return null;
  const { data: s } = await c.auth.getSession();
  return s.session ? s.session.access_token : null;
}

async function ensureTeam() {
  const c = cloud.client;
  const { data: rows, error } = await c.from('team_members').select('team_id').eq('user_id', cloud.user.id).limit(1);
  if (error) throw error;
  // An invite code typed before signing in: join that team instead of
  // starting an empty one of your own.
  const code = settings().pendingInvite;
  if (code) {
    const { data: joined, error: ej } = await c.rpc('bb_join_team', { invite_code: code });
    saveSettings({ pendingInvite: '' });
    if (!ej && joined) return joined;
  }
  if (rows && rows.length) return rows[0].team_id;
  const { data: id, error: e2 } = await c.rpc('bb_create_team', { team_name: 'My team' });
  if (e2) throw e2;
  return id;
}

export async function joinTeam(code) {
  const c = await client();
  const { data: id, error } = await c.rpc('bb_join_team', { invite_code: code.trim() });
  if (error) throw error;
  cloud.teamId = id;
  await syncNow();
  return id;
}

// The secret link a phone calendar subscribes to (one per team).
export async function calToken() {
  const c = await client();
  if (!cloud.teamId) await syncNow();
  const { data: token, error } = await c.rpc('bb_cal_token', { team: cloud.teamId });
  if (error) throw error;
  return token;
}

export async function inviteCode() {
  const c = await client();
  const { data: code, error } = await c.rpc('bb_invite_code', { team: cloud.teamId });
  if (error) throw error;
  return code;
}

function strip(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) if (!k.startsWith('_') && k !== 'sample') out[k] = v;
  out.team_id = cloud.teamId;
  return out;
}

let syncTimer = null;
function queueSync() {
  if (!cloud.user) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 800);
}

let syncing = false;
export async function syncNow() {
  if (!cloud.user || syncing || !navigator.onLine) return;
  syncing = true;
  cloud.status = 'syncing';
  emit();
  try {
    const c = cloud.client;
    cloud.teamId = cloud.teamId || (await ensureTeam());
    // Deletes first, so a row removed here is not pulled straight back.
    const tomb = readJson(DELETED, []);
    for (const d of tomb) await c.from(d.table).delete().eq('id', d.id);
    writeJson(DELETED, []);
    // Anything filed under a sample property stays on the phone with it; sending
    // it up would point at a property the team database has never seen.
    const sampleProps = new Set(all('properties').filter((p) => p.sample).map((p) => p.id));
    for (const t of TABLES) {
      const dirty = all(t).filter((r) => r._dirty && !r.sample && !sampleProps.has(r.property_id));
      if (dirty.length) {
        const { error } = await c.from(t).upsert(dirty.map(strip));
        if (error) throw error;
      }
      const { data: remote, error } = await c.from(t).select('*').eq('team_id', cloud.teamId);
      if (error) throw error;
      const local = new Map(all(t).map((r) => [r.id, r]));
      const merged = new Map();
      for (const r of remote) {
        const mine = local.get(r.id);
        merged.set(r.id, mine && mine._dirty && mine.updated_at > r.updated_at ? mine : r);
      }
      // Sample rows stay on this phone and never go up.
      for (const r of all(t)) if (r.sample && !merged.has(r.id)) merged.set(r.id, r);
      data[t] = [...merged.values()].map((r) => (r.sample ? r : { ...r, _dirty: false }));
      writeJson(KEY(t), data[t]);
    }
    cloud.status = 'synced';
  } catch (e) {
    console.warn('Sync failed; will retry', e);
    cloud.status = 'error';
  } finally {
    syncing = false;
    emit();
  }
}

// Photos, and the pages of an MLS sheet (a photo or a PDF).
async function uploadPhoto(id, blob) {
  if (!cloud.user || !cloud.teamId) return;
  const pdf = blob.type === 'application/pdf';
  const path = `${cloud.teamId}/${id}.${pdf ? 'pdf' : 'jpg'}`;
  const { error } = await cloud.client.storage.from('photos').upload(path, blob, { contentType: pdf ? 'application/pdf' : 'image/jpeg', upsert: true });
  if (error) return console.warn('Photo upload failed; it is still on this phone', error);
  for (const t of ['access', 'expenses']) {
    const row = all(t).find((r) => r.photo_id === id);
    if (row) save(t, { id: row.id, photo_path: path });
  }
  const note = all('notes').find((n) => (n.files || []).some((f) => f.id === id));
  if (note) save('notes', { id: note.id, files: note.files.map((f) => (f.id === id ? { ...f, path } : f)) });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (cloud.client ? syncNow() : startCloud()));
}

// ---------- sample data ----------

export function hasSample() {
  return TABLES.some((t) => all(t).some((r) => r.sample));
}

export function clearSample() {
  for (const t of TABLES) {
    data[t] = all(t).filter((r) => !r.sample);
    writeJson(KEY(t), data[t]);
  }
  emit();
}

export function loadSample(rows) {
  for (const [t, list] of Object.entries(rows)) {
    data[t] = [...list.map((r) => ({ ...r, sample: true })), ...all(t)];
    writeJson(KEY(t), data[t]);
  }
  emit();
}
