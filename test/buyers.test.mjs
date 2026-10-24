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
