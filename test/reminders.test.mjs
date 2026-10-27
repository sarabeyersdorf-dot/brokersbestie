import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { dueReminders, localNow, forOwner } from '../supabase/functions/reminders/due.js';
import { encryptPayload, makeVapidKeys, b64u } from '../supabase/functions/reminders/webpush.js';

// 2026-10-28 10:00 in Murphys (PDT, UTC-7)
const now = new Date('2026-10-28T17:00:00Z');
const sub = { tz: 'America/Los_Angeles', lead_minutes: 30, owner: 'sara', user_id: 'u1' };

test('local time follows the phone\'s time zone', () => {
  assert.deepEqual(localNow(now, 'America/Los_Angeles'), { day: '2026-10-28', min: 600 });
  assert.deepEqual(localNow(now, 'America/New_York'), { day: '2026-10-28', min: 780 });
});

test('an appointment 20 minutes away is due; one an hour away, past, cancelled or James\'s is not', () => {
  const data = {
    properties: [{ id: 'p1', address: '433 E Highway 4, Murphys', owner: 'sara' }, { id: 'p2', address: '9 Oak', owner: 'james' }],
    events: [
      { id: 'a', date: '2026-10-28', start_minutes: 620, title: 'Inspection', property_id: 'p1' },
      { id: 'b', date: '2026-10-28', start_minutes: 660, title: 'Later' },
      { id: 'c', date: '2026-10-28', start_minutes: 590, title: 'Past' },
      { id: 'd', date: '2026-10-28', start_minutes: 615, title: 'Gone', cancelled: true },
      { id: 'e', date: '2026-10-28', start_minutes: 615, title: 'His', property_id: 'p2' },
      { id: 'f', date: '2026-10-28', start_minutes: null, title: 'All day' }
    ],
    tours: [{ id: 't', date: '2026-10-28', start_minutes: 625, name: 'Smith tour', stops: [1, 2, 3] }]
  };
  const r = dueReminders(sub, data, now);
  assert.deepEqual(r.map((x) => x.key), ['ev:a:2026-10-28:620', 'tour:t:2026-10-28:625']);
  assert.equal(r[0].title, 'Inspection at 10:20 AM');
  assert.equal(r[0].body, '433 E Highway 4 · in 20 min');
  assert.equal(r[1].body, '3 stops · in 25 min');
});

test('the morning list comes after 7:30 with something due, and names a single item', () => {
  const data = { properties: [{ id: 'p1', address: '1143 Echo St' }], dates: [{ id: 'd', due: '2026-10-28', label: 'Appraisal contingency', property_id: 'p1' }], tasks: [{ id: 't', due: '2026-10-28', text: 'Order warranty' }, { id: 'u', due: '2026-10-28', text: 'Done', done: true }] };
  const [m] = dueReminders(sub, data, now);
  assert.equal(m.key, 'am:2026-10-28');
  assert.equal(m.body, 'Due today: Appraisal contingency · 1143 Echo St · To do: Order warranty');
  assert.deepEqual(dueReminders(sub, data, new Date('2026-10-28T14:00:00Z')), [], 'not before 7:30');
  assert.deepEqual(dueReminders(sub, { tasks: [] }, now), [], 'nothing due, nothing sent');
});

test('a safety check-in past its time goes to that agent only', () => {
  const data = { checkins: [{ id: 'k', status: 'active', due_at: '2026-10-28T16:55:00Z', user_id: 'u1', place: '9 Oak St, Arnold' }, { id: 'j', status: 'active', due_at: '2026-10-28T16:55:00Z', user_id: 'u2' }, { id: 'l', status: 'ok', due_at: '2026-10-28T16:00:00Z', user_id: 'u1' }] };
  const r = dueReminders(sub, data, now);
  assert.deepEqual(r.map((x) => x.key), ['ck:k:2026-10-28T16:55:00Z']);
  assert.match(r[0].body, /at 9 Oak St/);
});

test('whose: unowned and "both" items reach everyone', () => {
  assert.equal(forOwner(null, 'sara'), true);
  assert.equal(forOwner('both', 'sara'), true);
  assert.equal(forOwner('james', 'sara'), false);
  assert.equal(forOwner('james', null), true);
});

test('the push body decrypts with the phone\'s key (aes128gcm)', async () => {
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const body = await encryptPayload('hello', { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) });
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  const hm = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const ecdh = ua.computeSecret(Buffer.from(asPub));
  const ikm = hm(hm(auth, ecdh), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), Buffer.from(asPub), Buffer.from([1])]));
  const prk = hm(salt, ikm);
  const cek = hm(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hm(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(Buffer.from(ct.slice(-16)));
  const plain = Buffer.concat([d.update(Buffer.from(ct.slice(0, -16))), d.final()]);
  assert.equal(plain.subarray(0, -1).toString(), 'hello');
  assert.equal(plain.at(-1), 2);
  assert.equal((await makeVapidKeys()).publicKey.length, 87);
});

import { overdue, alertText, e164, cleanVisit } from '../supabase/functions/reminders/safety.js';

test('safety: only active, un-alerted check-ins past the 2-minute grace are overdue', () => {
  const now = new Date('2026-10-28T17:00:00Z');
  const list = overdue([
    { id: 'a', status: 'active', due_at: '2026-10-28T16:55:00Z' },
    { id: 'b', status: 'active', due_at: '2026-10-28T16:59:00Z' },
    { id: 'c', status: 'active', due_at: '2026-10-28T16:50:00Z', alerted_at: 'x' },
    { id: 'd', status: 'ok', due_at: '2026-10-28T16:50:00Z' }
  ], now);
  assert.deepEqual(list.map((c) => c.id), ['a']);
  assert.match(alertText({ place: '9 Oak St', meeting_name: 'Ann', lat: 38, lng: -120 }, { overdue: true }), /9 Oak St meeting Ann and has not checked back in.*maps\.google\.com\/\?q=38,-120/);
  assert.equal(e164('(209) 555-1212'), '+12095551212');
});

test('open house: a visit needs a name and a phone or email; agent name only with an agent', () => {
  assert.equal(cleanVisit({ first_name: 'Ann' }), null);
  assert.equal(cleanVisit({ phone: '2095551212' }), null);
  const v = cleanVisit({ first_name: ' Ann ', email: 'ANN@X.COM', has_agent: 'no', agent_name: 'Bob', consent: true });
  assert.equal(v.first_name, 'Ann');
  assert.equal(v.email, 'ann@x.com');
  assert.equal(v.has_agent, false);
  assert.equal(v.agent_name, '');
  assert.equal(v.consent, true);
  assert.equal(cleanVisit({ first_name: 'A', phone: '2095551212', consent: 'true' }).consent, false, 'only a real tick counts');
});
