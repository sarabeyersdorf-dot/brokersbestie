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
  assert.match(alertText({ place: '9 Oak St', meeting_name: 'Ann', agent_name: 'Jo Lee', lat: 38, lng: -120 }, { overdue: true }), /Jo Lee started a safety check-in at 9 Oak St and has not checked back in\. They were meeting Ann\..*maps\.google\.com\/\?q=38,-120.*Reply STOP to opt out\.$/);
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

import { driveMin, originOf } from '../supabase/functions/reminders/due.js';

test('leave by: with a fresh phone location and a pinned property, the reminder comes at the time to leave', () => {
  const home = { lat: 38.0682, lng: -120.5397 }; // Angels Camp
  const prop = { id: 'p', address: '433 E Highway 4, Murphys', lat: 38.1377, lng: -120.4599 }; // Murphys
  const d = driveMin(home, prop);
  assert.ok(d >= 10 && d <= 25, `drive ${d}`);
  const start = 600 + d + 5 + 30; // leave time is 30 min after "now" (10:00)
  const sub = { tz: 'America/Los_Angeles', lead_minutes: 30, from_lat: home.lat, from_lng: home.lng, from_at: '2026-10-28T16:30:00Z' };
  const ev = { id: 'e', date: '2026-10-28', start_minutes: start, title: 'Inspection', property_id: 'p' };
  assert.deepEqual(dueReminders(sub, { properties: [prop], events: [ev] }, now), [], 'not yet: 30 min before leaving');
  const later = new Date(now.getTime() + 30 * 60000);
  const [r] = dueReminders(sub, { properties: [prop], events: [ev] }, later);
  assert.match(r.title, /^Leave now: Inspection at/);
  assert.equal(r.body, `About ${d} min to 433 E Highway 4`);
});

test('leave by: an old phone location falls back to home base, and with neither the fixed reminder is used', () => {
  const sub = { from_lat: 1, from_lng: 1, from_at: '2026-10-27T00:00:00Z', base_lat: 2, base_lng: 2 };
  assert.deepEqual(originOf(sub, now), { lat: 2, lng: 2 });
  assert.equal(originOf({}, now), null);
  const r = dueReminders({ tz: 'America/Los_Angeles', lead_minutes: 30 }, { events: [{ id: 'x', date: '2026-10-28', start_minutes: 620, title: 'Walk-through' }] }, now);
  assert.equal(r[0].title, 'Walk-through at 10:20 AM');
});

import { cleanTyped, SMS_DAILY_CAP, SMS_PER_NUMBER_CAP } from '../supabase/functions/reminders/safety.js';
import { readFileSync as readSrc } from 'node:fs';

test('safety texts: US and Canada numbers only, never a +1 Caribbean or overseas number', () => {
  assert.equal(e164('209-555-1212'), '+12095551212');
  assert.equal(e164('+1 (416) 555-1212'), '+14165551212'); // Canada
  assert.equal(e164('787 555 1212'), '+17875551212'); // Puerto Rico is US
  for (const bad of ['876 555 1212', '+1 809 555 1212', '+44 20 7946 0958', '011 44 20 7946 0958', '555-1212', '', '1 055 555 1212']) assert.equal(e164(bad), '', bad);
});

test('safety texts: typed words are short and carry no links', () => {
  assert.equal(cleanTyped('Win $$$ at http://spam.example now www.x.co', 80), 'Win $$$ at now');
  const t = alertText({ place: 'x'.repeat(500), meeting_name: 'Visit https://bad.example' }, { overdue: false });
  assert.ok(!/bad\.example/.test(t));
  assert.ok(t.length < 320, 'two text segments at most');
  assert.ok(SMS_DAILY_CAP > 0 && SMS_PER_NUMBER_CAP > 0 && SMS_PER_NUMBER_CAP <= SMS_DAILY_CAP);
});

test('safety texts: the function sends only through the capped, logged path', () => {
  const src = readSrc(new URL('../supabase/functions/reminders/index.ts', import.meta.url), 'utf8');
  assert.equal((src.match(/sendSms\(/g) || []).length, 2, 'defined once, called once (inside safetyText)');
  assert.match(src, /SMS_DAILY_CAP/);
  assert.match(src, /from\('sms_log'\)\.insert/);
});

test('no second texting route on Vercel', () => {
  const src = readSrc(new URL('../api/_lib/server.js', import.meta.url), 'utf8');
  assert.ok(!/twilio/i.test(src));
});

import { inviteText, acceptedText, HELP_TEXT, smsKeyword, contactStatus, twilioSignature } from '../supabase/functions/reminders/safety.js';

test('safety contact opt-in: the invite says who, why, YES/STOP and rates', () => {
  const t = inviteText('Jane Smith');
  for (const k of ['Jane Smith', 'safety contact', 'Reply YES', 'STOP', 'Msg & data rates may apply']) assert.ok(t.includes(k), k);
  assert.ok(inviteText('').startsWith('Brokers Bestie: A real estate agent'));
  assert.match(acceptedText('Jane Smith'), /Jane Smith's safety contact.*STOP/);
  assert.match(HELP_TEXT, /support@brokersbestie\.app/);
  assert.match(HELP_TEXT, /STOP/);
  assert.ok(t.length <= 320 && HELP_TEXT.length <= 320);
});

test('safety alerts name the agent, never a gender, and end with STOP', () => {
  for (const late of [true, false]) {
    const t = alertText({ place: '1 A St', agent_name: 'Jane Smith', lat: 1, lng: 2 }, { overdue: late });
    assert.match(t, /^Brokers Bestie safety alert: Jane Smith /);
    assert.match(t, /Reply STOP to opt out\.$/);
    assert.doesNotMatch(t, /\b(she|her|he|him|his)\b/i);
  }
});

test('incoming words: YES / STOP / START / HELP, anything else ignored', () => {
  assert.equal(smsKeyword('yes'), 'yes'); assert.equal(smsKeyword(' Yes! '), 'yes'); assert.equal(smsKeyword('Y'), 'yes');
  assert.equal(smsKeyword('STOP'), 'stop'); assert.equal(smsKeyword('unsubscribe'), 'stop'); assert.equal(smsKeyword('Cancel'), 'stop');
  assert.equal(smsKeyword('start'), 'start'); assert.equal(smsKeyword('help'), 'help'); assert.equal(smsKeyword('info'), 'help');
  assert.equal(smsKeyword('who is this?'), null); assert.equal(smsKeyword(''), null);
});

test('contact status: a STOP anywhere wins; otherwise this team\'s row', () => {
  assert.equal(contactStatus([], 't1'), 'none');
  assert.equal(contactStatus([{ team_id: 't1', status: 'pending' }], 't1'), 'pending');
  assert.equal(contactStatus([{ team_id: 't1', status: 'accepted' }], 't1'), 'accepted');
  assert.equal(contactStatus([{ team_id: 't2', status: 'accepted' }], 't1'), 'none');
  assert.equal(contactStatus([{ team_id: 't1', status: 'accepted' }, { team_id: 't2', status: 'opted_out' }], 't1'), 'opted_out');
});

test('Twilio signature matches Twilio\'s published example', async () => {
  const sig = await twilioSignature('12345', 'https://mycompany.com/myapp.php?foo=1&bar=2', { CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' });
  assert.equal(sig, '0/KCTR6DLpKmkAf8muzZqo1nDgQ=');
});
