import test from 'node:test';
import assert from 'node:assert/strict';
import { loftyFeed, kvcoreFeed, CONNECTORS, toDay } from '../api/_lib/crms.js';
import { CRM_CHOICES, KEY_CRMS } from '../js/crmlist.js';
import { mapFeed } from '../api/_lib/feed.js';

const fakeFetch = (routes, seen = []) => async (url, opts) => {
  seen.push([url, opts.headers.Authorization]);
  for (const [re, body, status = 200] of routes) if (re.test(url)) return { ok: status < 400, status, json: async () => body };
  return { ok: false, status: 404, json: async () => ({}) };
};

test('every connectable CRM in Settings has a connector, and CINC is not connectable', () => {
  for (const id of KEY_CRMS) assert.equal(typeof CONNECTORS[id], 'function', id);
  assert.ok(CRM_CHOICES.find((c) => c.id === 'cinc').soon);
  assert.ok(!KEY_CRMS.includes('cinc'));
});

test('dates come in as ISO, plain days, or Unix seconds/milliseconds', () => {
  assert.equal(toDay('2026-11-20T00:00:00Z'), '2026-11-20');
  assert.equal(toDay(Date.UTC(2026, 10, 20)), '2026-11-20');
  assert.equal(toDay(Date.UTC(2026, 10, 20) / 1000), '2026-11-20');
  assert.equal(toDay(''), null);
});

test('Lofty: transactions, leads and appointments, with the key as "token"', async () => {
  const seen = [];
  const ms = (d) => Date.parse(d);
  const f = fakeFetch([
    [/\/v1\.0\/transactions/, { transactions: [
      { transactionId: 7, leadId: 70, transactionName: '433 E Highway 4, Murphys', transactionType: 'Sell', transactionStatus: 'Active Listing', homePrice: 489000 },
      { transactionId: 8, leadId: 80, transactionName: '12 Main St, Arnold', transactionType: 'Buy', transactionStatus: 'Under Contract', homePrice: 350000, expectedCloseDate: ms('2026-11-20T12:00:00Z') }
    ] }],
    [/\/v1\.0\/leads\/70/, { firstName: 'Sean', lastName: 'Moffatt', phones: ['2095550101'], emails: ['sean@example.com'] }],
    [/\/v1\.0\/leads\/80/, { firstName: 'Austin', lastName: 'L' }],
    [/\/v2\.0\/appointments/, { data: { list: [{ id: 5, title: 'Showing', startTime: ms('2026-10-28T17:30:00Z'), endTime: ms('2026-10-28T18:00:00Z'), leadId: 80 }] } }]
  ], seen);
  const feed = await loftyFeed('LK', { tz: 'America/Los_Angeles', today: '2026-10-27', fetchImpl: f });
  assert.equal(seen[0][1], 'token LK');
  assert.deepEqual(feed.properties.map((p) => p.status), ['listing', 'escrow']);
  assert.equal(feed.dates[0].due, '2026-11-20');
  assert.equal(feed.people.find((m) => m.name === 'Sean Moffatt').phone, '2095550101');
  assert.equal(feed.events[0].start, 630);
  assert.equal(feed.events[0].property_ext, '8');
  assert.match(feed.shape, /transactionId/);
  const rows = mapFeed(feed, 't1');
  assert.equal(rows.properties.length, 2);
});

test('kvCORE: transactions and their contacts, Bearer token, tries the next endpoint on 404', async () => {
  const seen = [];
  const f = fakeFetch([
    [/\/v2\/public\/transactions/, null, 404],
    [/\/v2\/public\/transaction\?/, { data: [{ id: 3, address: '9 Oak Ct', city: 'Murphys', type: 'Listing', status: 'Pending', sale_price: 600000, closing_date: '2026-12-01', contact_id: 30 }], last_page: 1 }],
    [/\/v2\/public\/contact\/30/, { data: { first_name: 'Kim', last_name: 'H', email: 'kim@example.com', cell_phone: '2095550199' } }]
  ], seen);
  const feed = await kvcoreFeed('KV', { today: '2026-10-27', fetchImpl: f });
  assert.equal(seen[0][1], 'Bearer KV');
  assert.equal(feed.properties[0].status, 'escrow');
  assert.equal(feed.properties[0].city, 'Murphys');
  assert.deepEqual(feed.people.map((m) => [m.name, m.phone, m.role]), [['Kim H', '2095550199', 'Seller']]);
  assert.deepEqual(feed.events, []);
});

test('a refused key is said in words, and a missing transactions list says what to do', async () => {
  await assert.rejects(loftyFeed('X', { fetchImpl: fakeFetch([[/./, {}, 401]]) }), /Lofty refused the API key/);
  await assert.rejects(kvcoreFeed('X', { fetchImpl: fakeFetch([]) }), /User/);
});

test('contactFrom: a Lofty/kvCORE record -> a feed contact', async () => {
  const { contactFrom } = await import('../api/_lib/crms.js');
  const c = contactFrom({ leadId: 42, firstName: 'Ann', lastName: 'Lee', emails: ['ann@x.com'], phones: [{ value: '209-555-0101', isPrimary: true }], stage: 'Past Client', tags: [{ name: 'Murphys' }] });
  assert.deepEqual({ ...c }, { ext_id: '42', name: 'Ann Lee', phone: '209-555-0101', email: 'ann@x.com', company: '', kind: 'Past Client Murphys', agent: null });
  assert.equal(contactFrom({ name: 'No id' }), null);
});

test('every key-connected CRM can also bring its whole contact list', async () => {
  const { CONTACT_LISTS } = await import('../api/_lib/crms.js');
  for (const id of KEY_CRMS) assert.equal(typeof CONTACT_LISTS[id], 'function', id);
});
