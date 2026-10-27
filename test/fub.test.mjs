import test from 'node:test';
import assert from 'node:assert/strict';
import { fubToFeed, fubStatus, localParts, fubFeed } from '../api/_lib/fub.js';
import { mapFeed } from '../api/_lib/feed.js';

const deals = [
  { id: 11, name: '433 E Highway 4, Murphys', pipelineName: 'Sellers', stageName: 'Active Listing', price: 489000, users: [{ id: 1, name: 'Sara Cooper' }], people: [{ id: 501, name: 'Sean Moffatt' }] },
  { id: 12, name: '12 Main St, Arnold', pipeline: { name: 'Buyers' }, stage: { name: 'Under Contract' }, price: 350000, projectedCloseDate: '2026-11-20', users: [{ name: 'James Beyersdorf' }], people: [{ id: 502, name: 'Austin L' }] },
  { id: 13, name: '9 Old Rd', pipelineName: 'Sellers', stageName: 'Closed', projectedCloseDate: '2025-01-01', people: [] },
  { id: 14, name: '1 Gone Ln', pipelineName: 'Sellers', stageName: 'Listing', status: 'Deleted' }
];
const people = [{ id: 501, firstName: 'Sean', lastName: 'Moffatt', phones: [{ value: '209-555-0101', isPrimary: true }], emails: [{ value: 'sean@example.com' }] }];
const appointments = [{ id: 900, title: 'Showing with Austin', start: '2026-10-28T17:30:00Z', end: '2026-10-28T18:30:00Z', location: '12 Main St', invitees: [{ personId: 502, name: 'Austin L' }] }];

test('stage words become Bestie statuses', () => {
  assert.equal(fubStatus(deals[0]), 'listing');
  assert.equal(fubStatus(deals[1]), 'escrow');
  assert.equal(fubStatus({ pipelineName: 'Buyers', stageName: 'Showing homes' }), 'tour');
  assert.equal(fubStatus({ stageName: 'Lost' }), 'cancelled');
  assert.equal(fubStatus({ stageName: 'Coming Soon' }), 'prep');
});

test('UTC appointment times land on the agent\'s own day and hour', () => {
  assert.deepEqual(localParts('2026-10-28T17:30:00Z', 'America/Los_Angeles'), { date: '2026-10-28', minutes: 10 * 60 + 30 });
  assert.deepEqual(localParts('2026-10-29T04:00:00Z', 'America/Los_Angeles'), { date: '2026-10-28', minutes: 21 * 60 });
});

test('a Follow Up Boss account becomes a Bestie feed mapFeed accepts', () => {
  const feed = fubToFeed({ deals, people, appointments }, { tz: 'America/Los_Angeles', today: '2026-10-27' });
  assert.deepEqual(feed.properties.map((p) => p.address), ['433 E Highway 4, Murphys', '12 Main St, Arnold'], 'old closed and deleted deals are left out');
  assert.equal(feed.properties[1].agent, 'James Beyersdorf');
  assert.deepEqual(feed.dates, [{ ext_id: '12-coe', property_ext: '12', label: 'Close of escrow', due: '2026-11-20', done: false }]);
  const sean = feed.people.find((m) => m.name === 'Sean Moffatt');
  assert.equal(sean.phone, '209-555-0101'); assert.equal(sean.role, 'Seller');
  assert.equal(feed.events[0].property_ext, '12', 'the showing is tied to Austin\'s deal');
  assert.equal(feed.events[0].start, 630); assert.equal(feed.events[0].minutes, 60); assert.equal(feed.events[0].kind, 'showing');
  const rows = mapFeed(feed, 'team-1');
  assert.equal(rows.properties[1].owner, 'james');
  assert.equal(rows.events[0].property_id, rows.properties[1].id);
});

test('fubFeed pages through the API with the key as Basic auth, and a bad key says so', async () => {
  const seen = [];
  const fake = async (url, opts) => {
    seen.push([url, opts.headers.Authorization]);
    const path = url.replace('https://api.followupboss.com/v1', '');
    const body = path.startsWith('/deals') ? { deals, _metadata: { total: 4 } } : path.startsWith('/people/') ? people.find((p) => path.endsWith('/' + p.id)) || {} : { appointments, _metadata: { total: 1 } };
    return { ok: true, status: 200, json: async () => body };
  };
  const feed = await fubFeed('KEY123', { tz: 'America/Los_Angeles', today: '2026-10-27', fetchImpl: fake });
  assert.equal(seen[0][1], 'Basic ' + Buffer.from('KEY123:').toString('base64'));
  assert.equal(feed.properties.length, 2);
  assert.equal(feed.events.length, 1);
  await assert.rejects(fubFeed('BAD', { fetchImpl: async () => ({ ok: false, status: 401 }) }), /refused the API key/);
});
