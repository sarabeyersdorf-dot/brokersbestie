import test from 'node:test';
import assert from 'node:assert/strict';
import { buyers, buyerOf, buyerKey } from '../js/brief.js';

test('buyerOf reads the field, else an old tour name', () => {
  assert.equal(buyerOf({ buyer: ' The Smiths ' }), 'The Smiths');
  assert.equal(buyerOf({ name: 'Austin · home tour' }), 'Austin');
  assert.equal(buyerOf({ name: 'Home tour' }), '');
  assert.equal(buyerKey('  The   Smiths'), 'the smiths');
});

test('buyers gathers every home seen across tours, latest face wins', () => {
  const tours = [
    { id: 't1', buyer: 'Austin', date: '2026-10-20', stops: [
      { id: 'a', address: '1 Main St', property_id: 'p1', shown: true, reaction: 'maybe', reaction_at: '2026-10-20T18:00:00Z' },
      { id: 'b', address: '2 Oak Ave', shown: true },
      { id: 'c', address: '3 Pine Rd', shown: false }
    ] },
    { id: 't2', name: 'austin · home tour', date: '2026-10-24', stops: [
      { id: 'd', address: '1 Main St', property_id: 'p1', shown: true, reaction: 'offer', reaction_note: 'Writing tonight', reaction_at: '2026-10-24T18:00:00Z' }
    ] },
    { id: 't3', buyer: 'Kim', date: '2026-10-22', stops: [] },
    { id: 't4', name: 'Home tour', date: '2026-10-23', stops: [{ id: 'e', address: 'x', shown: true }] }
  ];
  const list = buyers(tours);
  assert.deepEqual(list.map((b) => b.name), ['austin', 'Kim']);
  const a = list[0];
  assert.equal(a.tours.length, 2);
  assert.equal(a.homes.length, 2, 'unshown homes and repeats are not listed twice');
  assert.equal(a.homes[0].reaction, 'offer');
  assert.equal(a.homes[0].note, 'Writing tonight');
  assert.equal(a.homes[1].address, '2 Oak Ave');
});

// "Done with this home" (James, 2026-10-31): another agent's home shown without
// a Bestie tour still reaches the buyer's page.
import { buyers as buyersFn } from '../js/brief.js';
test('a home finished from its own page appears on that buyer\'s page', () => {
  const props = [{ id: 'rr', address: '19955 Rough And Ready Trl', status: 'shown', shown_buyer: 'Brian Duarte', shown_reaction: 'nope', shown_note: 'Too far out', shown_at: '2026-10-31T18:00:00Z' }];
  const list = buyersFn([], props);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Brian Duarte');
  assert.equal(list[0].tours.length, 0);
  assert.equal(list[0].homes[0].reaction, 'nope');
  assert.equal(list[0].homes[0].from_property, true);
  assert.equal(list[0].last, '2026-10-31');
});
test('no buyer name or no face: nothing is added', () => {
  assert.equal(buyersFn([], [{ id: 'a', address: 'x', shown_buyer: 'Brian', shown_reaction: null }]).length, 0);
  assert.equal(buyersFn([], [{ id: 'a', address: 'x', shown_buyer: '', shown_reaction: 'nope' }]).length, 0);
});
test('the newer of a tour stop and the property record wins for the same home', () => {
  const tours = [{ id: 't', buyer: 'Brian Duarte', date: '2026-10-24', stops: [{ id: 's', property_id: 'rr', address: '19955 Rough And Ready Trl', shown: true, reaction: 'maybe', reaction_at: '2026-10-24T20:00:00Z' }] }];
  const props = [{ id: 'rr', address: '19955 Rough And Ready Trl', shown_buyer: 'brian duarte', shown_reaction: 'nope', shown_at: '2026-10-31T18:00:00Z' }];
  const b = buyersFn(tours, props)[0];
  assert.equal(b.homes.length, 1);
  assert.equal(b.homes[0].reaction, 'nope');
  assert.equal(b.tours.length, 1);
});
