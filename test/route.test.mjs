import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineMiles, parseClock, formatClock, planRoute, schedule, mapsUrl, routeInOrder } from '../js/route.js';

// Rough real coordinates in Calaveras County.
const office = { address: 'Angels Camp office', lat: 38.0683, lng: -120.5396 };
const angels1 = { id: 'a1', address: '701 Mark Twain Rd, Angels Camp', lat: 38.075, lng: -120.548 };
const angels2 = { id: 'a2', address: '635 S Main St, Angels Camp', lat: 38.064, lng: -120.540 };
const murphys = { id: 'm', address: '433 E Hwy 4, Murphys', lat: 38.137, lng: -120.455 };
const copper = { id: 'c', address: 'Copperopolis stop', lat: 37.981, lng: -120.641 };

test('distance between Angels Camp and Murphys is about 7 miles straight-line', () => {
  const d = haversineMiles(office, murphys);
  assert.ok(d > 6 && d < 8, String(d));
});

test('clock parsing reads tour times the way agents say them', () => {
  assert.equal(parseClock('10:00'), 600);
  assert.equal(parseClock('11:30 am'), 690);
  assert.equal(parseClock('2pm'), 840);
  assert.equal(parseClock('1:30'), 810); // afternoon, not 1:30 at night
  assert.equal(parseClock('12 pm'), 720);
  assert.equal(parseClock('nonsense'), null);
  assert.equal(formatClock(690), '11:30 AM');
  assert.equal(formatClock(780), '1:00 PM');
});

test('an outlier goes first or last, never in the middle', () => {
  const r = planRoute({ start: office, startMinutes: 600, stops: [angels1, copper, murphys, angels2] });
  const ids = r.legs.map((l) => l.id);
  const at = ids.indexOf('c');
  assert.ok(at === 0 || at === ids.length - 1, ids.join(','));
  // The two Angels Camp stops sit next to each other.
  assert.equal(Math.abs(ids.indexOf('a1') - ids.indexOf('a2')), 1, ids.join(','));
});

test('the planned route is never longer than the order given', () => {
  const given = [murphys, copper, angels1, angels2];
  const r = planRoute({ start: office, startMinutes: 600, stops: given });
  const asGiven = schedule(office, 600, given);
  assert.ok(r.miles <= asGiven.miles + 1e-9);
  assert.ok(r.savedMiles >= 0);
});

test('a fixed window an agent gave is respected', () => {
  const fixed = { ...murphys, at: 600 + 25 }; // Murphys at 10:25
  const r = planRoute({ start: office, startMinutes: 600, stops: [angels1, angels2, fixed] });
  assert.equal(r.late, 0);
  const leg = r.legs.find((l) => l.id === 'm');
  assert.ok(leg.arrive >= 625);
});

test('stops it cannot place on a map stay on the tour, at the end', () => {
  const lost = { id: 'x', address: 'Somewhere it could not find' };
  const r = planRoute({ start: office, startMinutes: 600, stops: [lost, angels1] });
  assert.deepEqual(r.legs.map((l) => l.id), ['a1', 'x']);
  assert.equal(r.unplaced.length, 1);
});

test('nine or more stops still get a sensible order', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ id: 's' + i, address: 'S' + i, lat: 38 + i * 0.01, lng: -120.5 }));
  const shuffled = [many[5], many[0], many[9], many[2], many[7], many[1], many[8], many[3], many[6], many[4]];
  const r = planRoute({ start: { lat: 37.99, lng: -120.5 }, startMinutes: 600, stops: shuffled });
  assert.deepEqual(r.legs.map((l) => l.id), many.map((s) => s.id));
});

test('a dragged order is kept exactly, and says what the best order would save', () => {
  const mine = [murphys, copper, angels1]; // doubles back on purpose
  const r = routeInOrder({ start: office, startMinutes: 600, stops: mine });
  assert.deepEqual(r.legs.map((l) => l.id), ['m', 'c', 'a1']);
  assert.ok(r.bestSavesMinutes > 0);
});

test('an owner-occupied home pinned to 11:00 is shown at 11:00, early arrivals wait', () => {
  const pinned = { ...angels2, at: 660 };
  const r = routeInOrder({ start: office, startMinutes: 600, stops: [pinned, angels1] });
  assert.equal(r.legs[0].arrive, 660);
  assert.ok(r.legs[0].waitMinutes > 50);
  const late = routeInOrder({ start: office, startMinutes: 600, stops: [murphys, copper, { ...angels2, at: 610 }] });
  assert.ok(late.legs[2].lateMinutes > 0);
});

test('the maps link lists every stop in order', () => {
  const url = mapsUrl(office, [angels1, murphys]);
  assert.ok(url.startsWith('https://www.google.com/maps/dir/'));
  assert.ok(url.indexOf('Mark%20Twain') < url.indexOf('Murphys'));
});
