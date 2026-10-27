import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayItems, agenda, briefing, briefingText, addDays, timeToMinutes, minutesToTime } from '../js/brief.js';
import { actionPlan, eventKind } from '../js/assist.js';

const today = '2026-10-23';
const data = {
  properties: [{ id: 'p1', address: '433 E Highway 4', status: 'escrow', coe_date: '2026-10-27' }, { id: 'p2', address: '1143 Echo St', status: 'listing' }],
  events: [
    { id: 'e2', date: today, start_minutes: 840, title: 'Inspection', property_id: 'p2', kind: 'inspection' },
    { id: 'e1', date: today, start_minutes: 600, title: 'Walk-through', property_id: 'p1', kind: 'walkthrough' },
    { id: 'e3', date: '2026-10-24', start_minutes: null, title: 'Open house', kind: 'open' }
  ],
  dates: [{ id: 'd1', property_id: 'p1', label: 'Appraisal', due: '2026-10-25', done: false }, { id: 'd2', property_id: 'p2', label: 'Loan removal', due: '2026-10-20', done: false }],
  tasks: [{ id: 't1', text: 'Order warranty', due: today, done: false }, { id: 't2', text: 'Call lender', due: '2026-10-21', done: false }, { id: 't3', text: 'Old', due: '2026-10-21', done: true }],
  tours: [{ id: 'r1', date: today, start_minutes: 690, name: 'Smith tour', stops: [{}, {}] }]
};

test('a day lists timed things in order, then the all-day ones', () => {
  const items = dayItems(data, today);
  assert.deepEqual(items.map((i) => i.id), ['e1', 'r1', 'e2', 't1']);
  assert.equal(items[0].where, '433 E Highway 4');
});

test('the agenda skips empty days', () => {
  assert.deepEqual(agenda(data, today, 5).map((d) => d.day), [today, '2026-10-24', '2026-10-25']);
});

test('the briefing finds late work, closings and the week ahead', () => {
  const b = briefing(data, today, { pickups: 2 });
  assert.deepEqual(b.late.map((t) => t.id), ['t2']);
  assert.deepEqual(b.lateDates.map((d) => d.id), ['d2']);
  assert.deepEqual(b.closings.map((c) => c.property_id), ['p1']);
  assert.deepEqual(b.deadlines.map((d) => d.id), ['d1']);
  const text = briefingText(b, data);
  assert.match(text, /Today you have 1 showing and 2 appointments\./);
  assert.match(text, /At 10:00 AM, Walk-through at 433 E Highway 4\./);
  assert.match(text, /433 E Highway 4 closes Tuesday, Oct 27\./);
  assert.match(briefingText(briefing({ properties: [{ address: '1 Main', status: 'escrow', coe_date: today }] }, today), {}), /1 Main closes today/);
  assert.match(text, /2 signs or lockboxes to pick up/);
});

test('a quiet day says so', () => {
  assert.match(briefingText(briefing({}, today), {}), /Nothing is on the calendar today/);
});

test('dates and times', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(timeToMinutes('09:30'), 570);
  assert.equal(minutesToTime(570), '09:30');
  assert.equal(timeToMinutes(''), null);
});

test('"walk-through tomorrow at 10" becomes an appointment, not a to-do', () => {
  const p = actionPlan({ type: 'event', text: 'Walk-through', due: '2026-10-24', time: '10:00', minutes: null, property_id: 'p1' }, { today });
  assert.equal(p.table, 'events');
  assert.equal(p.row.start_minutes, 600);
  assert.equal(p.row.kind, 'walkthrough');
  assert.ok(actionPlan({ type: 'event', text: 'Meet', due: null }, { today }).error);
  assert.equal(eventKind('Final signing at title'), 'closing');
});

import { itemKind, filterItems, sortProps } from '../js/brief.js';

test('every thing on a day has one colour kind', () => {
  const items = dayItems({ ...data, events: [...data.events, { id: 'e9', date: today, title: 'Signing', kind: 'closing' }, { id: 'e8', date: today, title: 'Open', kind: 'open' }], dates: [...data.dates, { id: 'd9', label: 'Close of escrow', due: today }] }, today);
  const k = Object.fromEntries(items.map((i) => [i.id, itemKind(i)]));
  assert.equal(k.r1, 'showing');
  assert.equal(k.e8, 'showing');
  assert.equal(k.e1, 'appt');
  assert.equal(k.e9, 'closing');
  assert.equal(k.d9, 'closing');
  assert.equal(k.t1, 'todo');
  assert.equal(itemKind({ kind: 'date', title: 'Appraisal' }), 'deadline');
});

test('filters by kind and by property; sorts properties', () => {
  const items = dayItems(data, today);
  assert.deepEqual(filterItems(items, { kind: 'appt' }).map((i) => i.id), ['e1', 'e2']);
  assert.deepEqual(filterItems(items, { property: 'p2' }).map((i) => i.id), ['e2']);
  const props = [{ address: 'B', coe_date: '2026-11-01', price: 5 }, { address: 'A', price: 9 }, { address: 'C', coe_date: '2026-10-30', price: 1 }];
  assert.deepEqual(sortProps(props, 'closing').map((p) => p.address), ['C', 'B', 'A']);
  assert.deepEqual(sortProps(props, 'price').map((p) => p.address), ['A', 'B', 'C']);
  assert.deepEqual(sortProps(props, 'az').map((p) => p.address), ['A', 'B', 'C']);
});

import { isWhose, teamNames, firstName } from '../js/brief.js';

test('Mine / James: shared things show for everyone', () => {
  assert.ok(isWhose('sara', 'sara'));
  assert.ok(!isWhose('james', 'sara'));
  assert.ok(isWhose('both', 'james'));
  assert.ok(isWhose(null, 'james'));
  assert.ok(isWhose('james', null));
  const d = { properties: [{ id: 'p1', owner: 'james' }, { id: 'p2', owner: 'both' }], events: [{ id: 'e1', owner: 'sara', date: today, title: 'x' }, { id: 'e2', date: today, property_id: 'p1', title: 'y' }] };
  assert.deepEqual(teamNames(d, 'sara'), ['james']);
  assert.deepEqual(filterItems(dayItems(d, today), { who: 'sara' }).map((i) => i.id), ['e1']);
  assert.deepEqual(filterItems(dayItems(d, today), { who: 'james' }).map((i) => i.id), ['e2'], 'an appointment takes its property\'s owner');
  assert.equal(firstName(' Sara Cooper '), 'sara');
});

import { whenSaid, bookedSummary } from '../js/brief.js';

test('a closing is said by its day and counted once, never also as a deadline', () => {
  const fri = '2026-10-23';
  const d = { properties: [{ id: 'echo', address: '1143 Echo St', status: 'escrow', coe_date: '2026-10-29' }], dates: [
    { id: 'w', property_id: 'echo', label: "Buyer's final walk-through", due: '2026-10-24' },
    { id: 'c', property_id: 'echo', label: 'Close of escrow', due: '2026-10-29' }] };
  const b = briefing(d, fri);
  assert.deepEqual(b.closings, [{ property_id: 'echo', address: '1143 Echo St', date: '2026-10-29' }]);
  assert.deepEqual(b.deadlines.map((x) => x.id), ['w'], 'Close of escrow is a closing, not a second deadline');
  assert.equal(whenSaid('2026-10-29', fri), 'Thursday, Oct 29');
  assert.equal(whenSaid('2026-10-24', fri), 'tomorrow');
  const t = briefingText(b, d);
  assert.match(t, /1143 Echo St closes Thursday, Oct 29\./);
  assert.doesNotMatch(t, /this week/);
});

test('what is booked is counted by kind', () => {
  assert.equal(bookedSummary([{ kind: 'tour' }, { kind: 'event', sub: 'showing' }]), '2 showings');
  assert.equal(bookedSummary([{ kind: 'tour' }, { kind: 'event', sub: 'inspection' }]), '1 showing and 1 appointment');
});

import { doorCodes } from '../js/brief.js';
test('at the door: the stop code first, then saved codes, each value once', () => {
  const c = doorCodes({ code: '1234', code_label: 'Lockbox' }, [
    { kind: 'lockbox', code: '1234' }, { kind: 'gate', code: '#5580', location_note: 'Keypad on the left post' }, { kind: 'alarm', code: '' }
  ], (k) => k[0].toUpperCase() + k.slice(1));
  assert.deepEqual(c, [{ label: 'Lockbox', code: '1234', where: '' }, { label: 'Gate', code: '#5580', where: 'Keypad on the left post' }]);
  assert.deepEqual(doorCodes({ code: '' }, []), []);
});
