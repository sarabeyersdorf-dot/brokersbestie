import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapFeed, crmId, icsCalendar } from '../api/_lib/feed.js';

const team = '11111111-2222-3333-4444-555555555555';
const feed = {
  format: 'bestie-feed/1',
  properties: [{ ext_id: '433-hwy4', address: '433 E Highway 4', city: 'Murphys', status: 'escrow', price: 780000, mls: '2026', coe_date: '2026-11-15' }, { ext_id: 'x', address: '' }],
  people: [{ ext_id: '433-hwy4:a', property_ext: '433-hwy4', name: 'Jim Smith', role: 'seller', phone: '209', email: 'j@x' }, { ext_id: 'orphan', property_ext: 'nope', name: 'Lost' }],
  dates: [{ ext_id: 9, property_ext: '433-hwy4', label: 'Appraisal', due: '2026-10-30', done: false }],
  events: [{ ext_id: 'a1', property_ext: '433-hwy4', title: 'Walk-through', kind: 'meeting', date: '2026-10-24', start: 600, minutes: 30, location: '', with: 'Jim Smith' }, { ext_id: 'a2', property_ext: null, title: 'Office meeting', date: '2026-10-25', start: null }]
};

test('a CRM feed maps to rows with stable, team-scoped ids', () => {
  const r = mapFeed(feed, team);
  assert.equal(r.properties.length, 1);
  assert.equal(r.properties[0].id, crmId(team, 'p', '433-hwy4'));
  assert.equal(r.properties[0].status, 'escrow');
  assert.equal(r.people.length, 1, 'a person on no property is dropped');
  assert.equal(r.people[0].property_id, r.properties[0].id);
  assert.equal(r.dates[0].id, crmId(team, 'd', 9));
  assert.deepEqual(mapFeed({ ...feed, dates: [{ ext_id: 7, property_ext: '433-hwy4', label: 'Loan', due: '2026-10-01', done: true }] }, team).doneDates, [crmId(team, 'd', 7)]);
  assert.equal(r.events[0].start_minutes, 600);
  assert.equal(r.events[0].notes, 'With Jim Smith');
  assert.equal(r.events[1].property_id, null);
  assert.equal(mapFeed(feed, team).events[0].id, r.events[0].id, 'the next sync updates the same row');
});

test('a CRM id with odd characters is made safe', () => {
  assert.equal(crmId(team, 'e', 'a"b, c'), `crm:${team}:e:a_b__c`);
});

test('the CRM never writes the agent\'s own fields', () => {
  const r = mapFeed(feed, team);
  for (const k of ['lat', 'lng', 'showing_notes', 'directions', 'occupancy']) assert.ok(!(k in r.properties[0]), k);
  assert.ok(!('done' in r.events[0]), 'ticking an appointment off survives a sync');
  assert.ok(!('done' in r.dates[0]), 'ticking a deadline off survives a sync');
});

test('anything that is not a Bestie feed is refused', () => {
  assert.throws(() => mapFeed({ deals: [] }, team), /not a Bestie feed/);
});

test('the phone calendar file is valid and escapes text', () => {
  const ics = icsCalendar('Brokers Bestie', [
    { uid: 'e1', title: 'Walk-through, 433; Hwy 4', date: '2026-10-24', start: 600, minutes: 30, location: '433 E Highway 4, Murphys' },
    { uid: 'd1', title: 'Appraisal', date: '2026-10-30', start: null }
  ], new Date('2026-10-23T12:00:00Z'));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261024T100000\r\nDTEND:20261024T103000/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261030\r\nDTEND;VALUE=DATE:20261031/);
  assert.ok(ics.includes('SUMMARY:Walk-through\\, 433\\; Hwy 4'));
  assert.match(ics, /END:VCALENDAR\r\n$/);
  for (const line of ics.split('\r\n')) assert.ok(line.length <= 75, line);
});

import { pushChanges, extOf } from '../api/_lib/feed.js';

test('a CRM id is read whole, and only for its own kind', () => {
  assert.equal(extOf(`crm:${team}:d:abc-1`, 'd'), 'abc-1');
  assert.equal(extOf(`crm:${team}:d:abc-1`, 'e'), null);
  assert.equal(extOf('plain-uuid'), null);
});

test('only CRM-linked changes are sent, in the shape the CRM takes', () => {
  const p = `crm:${team}:p:433-hwy4`;
  const changes = pushChanges({
    dates: [{ id: `crm:${team}:d:it-1`, source: 'crm', done: true }, { id: 'mine', done: true }],
    events: [
      { id: `crm:${team}:e:ap-1`, source: 'crm', property_id: p, title: 'Walk-through', kind: 'walkthrough', date: '2026-10-24', start_minutes: 600, minutes: 30, notes: 'With Jim' },
      { id: 'new-1', property_id: p, title: 'Inspection', kind: 'inspection', date: '2026-10-25', start_minutes: 540, notes: 'Bring the ladder' },
      { id: 'new-2', property_id: 'mine-prop', title: 'Lunch' },
      { id: 'new-3', property_id: p, cancelled: true }
    ]
  });
  assert.deepEqual(changes.map((c) => [c.type, c.ext_id, c.cancelled ?? null]), [['date', 'it-1', null], ['event', 'ap-1', false], ['event', null, false], ['event', null, true]]);
  assert.equal(changes[1].notes, undefined, 'a CRM appointment\'s notes are not sent back');
  assert.equal(changes[2].property_ext, '433-hwy4');
  assert.equal(changes[2].notes, 'Bring the ladder');
  const t = pushChanges({ tasks: [{ id: `crm:${team}:t:task-1`, source: 'crm', done: true }, { id: 'mine', done: true }] });
  assert.deepEqual(t.map((c) => [c.type, c.ext_id, c.done]), [['task', 'task-1', true]]);
});

test('CRM tasks come in as to-dos; a done one only ever ticks', () => {
  const r = mapFeed({ ...feed, tasks: [{ ext_id: 'k1', property_ext: '433-hwy4', text: 'Order the warranty', due: '2026-10-25', done: false }, { ext_id: 'k2', property_ext: '433-hwy4', text: 'Send TDS', due: null, done: true }, { ext_id: 'k3', property_ext: 'nope', text: 'Lost' }] }, team);
  assert.deepEqual(r.tasks.map((t) => [t.id, t.text, t.due]), [[crmId(team, 't', 'k1'), 'Order the warranty', '2026-10-25'], [crmId(team, 't', 'k2'), 'Send TDS', null]]);
  assert.ok(!('done' in r.tasks[0]));
  assert.deepEqual(r.doneTasks, [crmId(team, 't', 'k2')]);
});
