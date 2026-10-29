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

import { taxYear, taxCsv } from '../js/brief.js';
test('tax year: totals, by month, deduction, and what a preparer will ask about', () => {
  const trips = [{ date: '2026-01-05', miles: 10.5, purpose: 'Showing' }, { date: '2026-03-02', miles: 20 }, { date: '2025-12-30', miles: 99 }];
  const exp = [{ date: '2026-03-10', amount: 12.5, what: 'Lockbox', photo_id: 'p' }, { date: '2026-03-11', amount: 7.5, what: 'Gas' }];
  const t = taxYear(trips, exp, 2026, 0.7);
  assert.equal(t.miles, 30.5);
  assert.equal(t.spent, 20);
  assert.equal(t.deduction, 21.35);
  assert.equal(t.months[2].spent, 20);
  assert.equal(t.noPurpose, 1);
  assert.equal(t.noReceipt, 1);
  const csv = taxCsv(trips, exp, 2026, () => '');
  assert.match(csv, /"Mileage log 2026"/);
  assert.doesNotMatch(csv, /99\.0/);
  assert.match(csv, /"2026-03-11","Gas","","7\.50","no"/);
});

import { todayMode, listenLength } from '../js/brief.js';
test('Today mode: plan, field around a tour or showing, wrap after', () => {
  const day = '2026-10-28';
  const tour = { id: 't', date: day, stops: [{ arrive: 600 }, { arrive: 660 }] };
  const data = { tours: [tour], events: [{ id: 'e', date: day, start_minutes: 900, minutes: 60, kind: 'meeting' }] };
  assert.equal(todayMode(data, day, 420).mode, 'plan');        // 7:00, tour at 10:00
  assert.equal(todayMode(data, day, 520).mode, 'field');       // 8:40, within 90 min
  assert.equal(todayMode(data, day, 520).focus.id, 't');
  const started = { ...data, tours: [{ ...tour, stops: [{ arrive: 600, shown: true }, { arrive: 660 }] }] };
  assert.equal(todayMode(started, day, 800).mode, 'field');   // still on tour, a stop left
  const done = { ...data, tours: [{ ...tour, finished: true }] };
  assert.equal(todayMode(done, day, 800).mode, 'plan');       // 1:20, meeting at 3:00 still ahead
  assert.equal(todayMode(done, day, 1000).mode, 'wrap');      // after the meeting
  assert.equal(todayMode({}, day, 800).mode, 'plan');         // nothing booked
  const showing = { events: [{ id: 's', date: day, start_minutes: 840, kind: 'showing' }] };
  assert.equal(todayMode(showing, day, 760).mode, 'field');   // 80 min before a showing
  assert.equal(todayMode(showing, day, 700).mode, 'plan');
});
test('briefing length in words people use', () => {
  assert.equal(listenLength('word '.repeat(100)), '0:40');
  assert.equal(listenLength('word '.repeat(400)), '2:35');
});

test('Today picks its screen by mode, and "Show everything" keeps the full page', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(all \|\| searchText \|\| !props\(\)\.length\) return viewTodayFull\(\)/);
  assert.match(app, /\[\/\^#\\\/all\$\/, \(\) => viewToday\(true\)/);
  for (const k of ['Up next', 'Leave by', 'Start tour', 'Due today', 'How did ${street(prev.address)} go?', 'Later today', 'Feedback still owed', 'To bring back', 'Miles to save', 'Show everything on Today']) assert.ok(app.includes(k), k);
});

test('tour done: the last stop opens the wrap-up, and the buddy keeps to its moments', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  for (const k of ['Nice work', 'homes shown', 'miles saved to mileage', 'What they thought', 'Wrap up', 'Send last', 'nothing left out', 'Not done yet?']) assert.ok(app.includes(k), k);
  assert.match(app, /setTimeout\(\(\) => maybeTourDone\(tourId\), 900\)/); // quick face on the last stop
  assert.match(app, /else if \(!maybeTourDone\(tourId\)\)/); // All 8 on the last stop
  // Never on the morning greeting or a "not found" result.
  assert.doesNotMatch(app, /buddy-hi">\$\{raw\(winkFace/);
  assert.doesNotMatch(app, /buddy\('No showings found/);
});

test('first run: the setup checklist is Today for a phone with no properties', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /!props\(\)\.length && !store\.settings\(\)\.setupDone\) return viewSetup\(\)/);
  for (const k of ['noreply@send.brokersbestie.app', 'Check your spam folder', 'Your name & license number', 'Add your first property', 'Or snap a photo of an MLS sheet', 'Reminders only work from the home screen app', 'Add to Home Screen', 'Later, when you\'re ready', 'Connect your CRM', 'Invite your team', 'I work alone']) assert.ok(app.includes(k), k);
  assert.doesNotMatch(app, /function showWelcome/);
});

test('saved for no signal: a quiet line where codes show, a calm card offline', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /changes will send when you have signal|change\$\{n === 1 \? '' : 's'\} will send when you have signal/);
  assert.match(app, /No signal\. You're fine\. All \$\{codes\}/);
  assert.match(app, /class="door-saved"/);
  assert.match(app, /Saved on this phone · updated \$\{savedAtWords\(p, access\)\}\$\{pendingWords\(\)\}/);
  const store = fs.readFileSync(new URL('../js/store.js', import.meta.url), 'utf8');
  assert.match(store, /export function pendingCount\(\)/);
});

import { HEADS_UP, headsUp as hu } from '../js/brief.js';
test('heads-up tags: saved tags in a fixed order, Occupied left to its badge, notes still count', async () => {
  assert.deepEqual(HEADS_UP, ['Dog', 'Cattle guard', 'Livestock', 'Low branches', 'Steep drive', 'No turnaround', 'Well head', 'Septic lid', 'Occupied', 'Alarm']);
  assert.deepEqual(hu({}, { heads_up: ['Steep drive', 'Occupied', 'Cattle guard'], showing_notes: 'Big dog' }, []), ['Dog', 'Cattle guard', 'Steep drive']);
  const fs = await import('node:fs');
  assert.match(fs.readFileSync(new URL('../db/023_heads_up.sql', import.meta.url), 'utf8'), /add column if not exists heads_up text\[\]/);
});

test('gate pin: directions go to the gate when one is pinned', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /function dirLink\(x\)/);
  assert.match(app, /Pin the gate here/);
  assert.match(app, /<b>Gate pinned<\/b> · Directions go to the gate/);
  assert.equal((app.match(/mapLink\(/g) || []).length, 2); // only inside dirLink: every Directions button goes through it
  assert.match(fs.readFileSync(new URL('../db/024_gate_pin.sql', import.meta.url), 'utf8'), /gate_lat double precision/);
});

test('the 24-hour share page goes to the gate too', async () => {
  const fs = await import('node:fs');
  const share = fs.readFileSync(new URL('../share.html', import.meta.url), 'utf8');
  const fn = fs.readFileSync(new URL('../supabase/functions/reminders/index.ts', import.meta.url), 'utf8');
  assert.match(fn, /select\('address, city, occupancy, showing_notes, directions, lat, lng, gate_lat, gate_lng, heads_up'\)/);
  assert.match(share, /Directions to the gate/);
  assert.match(share, /destination=\$\{p\.gate_lat\},\$\{p\.gate_lng\}/);
});

test('demo link: /demo loads the sample story on a fresh phone only, with a banner', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.ok(vercel.redirects.some((r) => r.source === '/demo' && r.destination === '/?demo=1'));
  assert.match(app, /if \(ownProps\(\)\.length\) \{ setTimeout\(\(\) => toast\('This phone already has your own properties/);
  assert.match(app, /sample data, nothing here is real/);
  const { sampleData } = await import('../js/sample.js');
  const d = sampleData({ now: new Date(2026, 9, 29, 9, 0) });
  assert.equal(d.tours[0].date, '2026-10-29');
  assert.ok(d.tours[0].stops.every((x) => !x.shown)); // morning: the tour is still ahead
  const eve = sampleData({ now: new Date(2026, 9, 29, 21, 0) });
  assert.ok(eve.tours[0].stops.every((x) => x.shown)); // evening: already shown, Today wraps up
});

test('code last worked: the newer report wins, in plain words', async () => {
  const { codeTrust, doorCodes } = await import('../js/brief.js');
  const now = Date.parse('2026-10-29T18:00:00Z');
  assert.equal(codeTrust({}), null);
  assert.deepEqual(codeTrust({ worked_at: '2026-10-26T17:00:00Z', worked_by: 'james' }, { now, me: 'sara' }), { bad: false, words: 'Worked for James 3 days ago' });
  assert.deepEqual(codeTrust({ worked_at: '2026-10-26T17:00:00Z', worked_by: 'james', failed_at: '2026-10-29T15:00:00Z', failed_by: 'sara' }, { now, me: 'sara' }), { bad: true, words: 'Reported not working by you today' });
  // The stop's copy of a saved code carries the saved code's id.
  const c = doorCodes({ code: '#2580' }, [{ id: 'a1', label: 'Gate', code: '#2580', location_note: 'Left post' }, { id: 'a2', label: 'Alarm', code: '7319' }]);
  assert.deepEqual(c.map((x) => [x.code, x.id]), [['#2580', 'a1'], ['7319', 'a2']]);
});
