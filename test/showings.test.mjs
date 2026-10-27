import test from 'node:test';
import assert from 'node:assert/strict';
import { planShowings, toMin } from '../js/showings.js';

const data = {
  properties: [{ id: 'p1', address: '433 E Highway 4' }],
  events: [{ id: 'e1', property_id: 'p1', kind: 'showing', date: '2026-10-29', start_minutes: 600 }],
  access: [{ property_id: 'p1', kind: 'lockbox', code: '1234' }]
};

test('a confirmation for a home already on the calendar is "same"; a new time is a move', () => {
  const [a] = planShowings([{ address: '433 E Hwy 4', date: '2026-10-29', start: '10:00', end: '10:30', status: 'confirmed', access: [{ kind: 'lockbox', code: '1234' }] }], data);
  assert.equal(a.property.id, 'p1');
  assert.equal(a.action, 'same');
  assert.equal(a.checked, false);
  assert.deepEqual(a.newCodes, []);
  const [b] = planShowings([{ address: '433 E Highway 4', date: '2026-10-29', start: '11:15', end: '11:45', status: 'changed', access: [{ kind: 'gate', code: '#5580' }] }], data);
  assert.equal(b.action, 'move');
  assert.equal(b.existing.id, 'e1');
  assert.equal(b.minutes, 30);
  assert.deepEqual(b.newCodes.map((c) => c.code), ['#5580']);
});

test('a new address is added; a cancellation cancels the one on the calendar', () => {
  const [n] = planShowings([{ address: '9 Oak St', date: '2026-10-30', start: '14:00', end: null, status: 'confirmed' }], data);
  assert.equal(n.property, null);
  assert.equal(n.action, 'add');
  assert.equal(n.start, 840);
  assert.equal(n.minutes, 30);
  const [c] = planShowings([{ address: '433 E Highway 4', date: '2026-10-29', start: '10:00', status: 'cancelled' }], data);
  assert.equal(c.action, 'cancel');
  const [s] = planShowings([{ address: '9 Oak St', date: '2026-10-30', status: 'cancelled' }], data);
  assert.equal(s.action, 'skip');
  assert.equal(toMin('7:05'), 425);
  assert.deepEqual(planShowings([{ address: null, date: '2026-10-30' }], data), []);
});
