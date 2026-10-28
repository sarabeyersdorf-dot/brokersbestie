import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTourText, wordsToClock, matchProperty, search, tripsCsv, tidyAddress, fixDictation } from '../js/parse.js';

test('a spoken tour becomes a start time and one stop per address', () => {
  const r = parseTourText('Saturday for the Smiths, start at the office at ten. 433 East Highway 4 Murphys, 701 Mark Twain Road Angels Camp and 635 South Main Street at 11:30');
  assert.equal(r.startMinutes, 600);
  assert.equal(r.startPlace, 'office');
  assert.deepEqual(r.stops.map((s) => s.address), ['433 E Hwy 4 Murphys', '701 Mark Twain Rd Angels Camp', '635 S Main St']);
  assert.equal(r.stops[2].at, 690);
  assert.equal(r.stops[0].at, null);
});

test('Sara’s first dictated tour: clock-style house numbers and "go to / followed by"', () => {
  // What iPhone dictation produced on 2026-10-23.
  const r = parseTourText("Start at 10 433 East Highway 4 Murphy's, go to 324 Augusta Valley Springs followed by 11:43 Echo Street Angels Camp");
  assert.equal(r.startMinutes, 600);
  assert.deepEqual(r.stops.map((s) => s.address), ['433 E Hwy 4 Murphys', '324 Augusta Valley Springs', '1143 Echo St Angels Camp']);
});

test('no commas at all still splits at each new street number', () => {
  const r = parseTourText('433 East Highway 4 Murphys 324 Augusta Court Valley Springs 2841 Fowler Road Space 144 Copperopolis');
  assert.deepEqual(r.stops.map((s) => s.address), ['433 E Hwy 4 Murphys', '324 Augusta Ct Valley Springs', '2841 Fowler Rd Space 144 Copperopolis']);
});

test('a real showing time is kept as a time, not turned into a house number', () => {
  const r = parseTourText('635 South Main Street at 11:30, 701 Mark Twain Road at 2 pm and 1143 Echo Street');
  assert.deepEqual(r.stops.map((s) => [s.address, s.at]), [['635 S Main St', 690], ['701 Mark Twain Rd', 840], ['1143 Echo St', null]]);
  assert.equal(fixDictation('at 11:30 and 4:33 East Highway 4'), 'at 11:30 and 433 East Highway 4');
});

test('one address per line works too', () => {
  const r = parseTourText('1143 Echo St\n324 Augusta Ct, Valley Springs\n');
  assert.equal(r.stops.length, 2);
  assert.equal(r.stops[1].address, '324 Augusta Ct, Valley Springs');
  assert.equal(r.startMinutes, null);
});

test('spoken times', () => {
  assert.equal(wordsToClock('ten'), 600);
  assert.equal(wordsToClock('eleven thirty'), 690);
  assert.equal(wordsToClock('two pm'), 840);
  assert.equal(wordsToClock('9:45'), 585);
});

test('a spoken address matches the saved listing only when exactly one fits', () => {
  const props = [{ id: '1', address: '433 E Hwy 4' }, { id: '2', address: '701 Mark Twain Rd' }];
  assert.equal(matchProperty('433 East Highway 4 Murphys', props).id, '1');
  assert.equal(matchProperty('999 Nowhere Ln', props), null);
  const twins = [{ id: 'a', address: '100 Main St' }, { id: 'b', address: '100 Main St' }];
  assert.equal(matchProperty('100 Main Street', twins), null);
});

test('search finds a code by the property and every word must match', () => {
  const data = {
    properties: [{ id: 'p', address: '1143 Echo St', city: 'Angels Camp' }],
    access: [{ property_id: 'p', kind: 'lockbox', label: 'Supra', code: '31', location_note: 'on the meter' }],
    people: [{ property_id: 'p', name: 'Jordan Escrow', role: 'Escrow officer' }],
    notes: [{ property_id: 'p', text: 'Seller leaving the fridge' }],
    tasks: [], dates: []
  };
  const hits = search('echo supra', data);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, 'Access');
  assert.equal(search('echo', data).length, 4);
  assert.equal(search('', data).length, 0);
});

test('mileage export is a spreadsheet a tax preparer can open', () => {
  const csv = tripsCsv([{ date: '2026-10-18', purpose: 'Buyer tour, "4 homes"', from_place: 'Office', to_place: 'Murphys', miles: 24 }]);
  const lines = csv.split('\n');
  assert.equal(lines[0], '"Date","Purpose","From","To","Property","Miles"');
  assert.ok(lines[1].includes('"Buyer tour, ""4 homes"""'));
  assert.ok(lines[1].endsWith('"24.0"'));
});

test('addresses are tidied the way the MLS writes them', () => {
  assert.equal(tidyAddress('433 East Highway 4'), '433 E Hwy 4');
});

test('Android repeating speech pieces add up to one phrase, not a stack', async () => {
  const { mergeSpeech } = await import('../js/parse.js');
  // The pattern Sara's Android phone produced (Cowork, 2026-10-23).
  let chunks = [];
  for (const piece of ['start', 'start at', 'start at 10:00 a.m.', 'start at 10:00 a.m.', 'Start at 10:00 a.m. 433 East Highway 4']) chunks = mergeSpeech(chunks, piece);
  assert.deepEqual(chunks, ['Start at 10:00 a.m. 433 East Highway 4']);
  // A genuinely new phrase is added; a shorter echo of the last is ignored.
  chunks = mergeSpeech(chunks, 'go to 324 Augusta Court Valley Springs');
  chunks = mergeSpeech(chunks, 'go to 324 Augusta');
  assert.deepEqual(chunks, ['Start at 10:00 a.m. 433 East Highway 4', 'go to 324 Augusta Court Valley Springs']);
  // iPhone style (each phrase once) is unchanged.
  assert.deepEqual(mergeSpeech(mergeSpeech([], '433 East Highway 4'), 'then 1143 Echo Street'), ['433 East Highway 4', 'then 1143 Echo Street']);
});

test('search finds a vendor by trade and links to the vendor list', () => {
  const r = search('inspector', { vendors: [{ id: 'v', name: 'Pat Lee', company: 'Sierra Home', trade: 'Inspector', phone: '209' }] });
  assert.equal(r.length, 1);
  assert.equal(r[0].href, '#/vendors');
  assert.equal(r[0].kind, 'Vendor');
});

import { quickProperty } from '../js/parse.js';
test('first property: one box gives the address and the code', () => {
  assert.deepEqual(quickProperty('100 Ridge Rd Murphys gate code pound 2580'), { address: '100 Ridge Rd Murphys', code: '#2580', kind: 'gate' });
  assert.deepEqual(quickProperty('12 Oak Knoll Ct, lockbox 4417'), { address: '12 Oak Knoll Ct', code: '4417', kind: 'lockbox' });
  assert.deepEqual(quickProperty('55 Main St, alarm code is 7 3 1 9'), { address: '55 Main St', code: '7319', kind: 'alarm' });
  assert.deepEqual(quickProperty('305 Cedar Hollow Ln'), { address: '305 Cedar Hollow Ln', code: '', kind: '' });
});
