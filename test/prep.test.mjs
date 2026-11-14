// Listing Prep, step 1 (2026-11-06): the room-by-room walk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { defaultAreas, sortAreas, addArea, canRemoveArea, areaStatus, prepSummary, waitingPhotos, waitingWords, addTap, takenAt, prepsFor, nextUnit, SECTIONS, EXTRA_AREAS, CATEGORIES, PHOTO_KINDS } from '../js/prep.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const sql = read('../db/031_listing_prep.sql');
const app = read('../js/app.js');
const store = read('../js/store.js');

test("the walk follows the AVID's own sections, in its order", () => {
  assert.deepEqual(SECTIONS.map((s) => s.label), ['Entry', 'Living Room', 'Dining Room', 'Kitchen', 'Other Room', 'Hall/Stairs', 'Bedrooms', 'Baths', 'Other', 'Garage/Parking', 'Exterior Building and Yard', 'Other Observed or Known Conditions']);
  const names = defaultAreas({ beds: 2, baths: 2 }).map((a) => a.name);
  assert.deepEqual(names, ['Entry', 'Living Room', 'Dining Room', 'Kitchen', 'Other Room', 'Hall/Stairs', 'Bedroom 1', 'Bedroom 2', 'Bath 1', 'Bath 2', 'Other', 'Garage/Parking', 'Exterior Building and Yard', 'Other Observed or Known Conditions']);
  assert.deepEqual(defaultAreas({ type: 'land' }).map((a) => a.name), ['Land / Acreage', 'Other Observed or Known Conditions']);
});

test('rooms can be added to match the house, and stay in the form order', () => {
  let a = defaultAreas({ beds: 3, baths: 2 });
  a = addArea(a, 'bedroom');
  a = addArea(a, 'Septic');
  a = addArea(a, 'other');
  const sorted = sortAreas(a).map((x) => x.name);
  assert.ok(sorted.indexOf('Bedroom 4') === sorted.indexOf('Bedroom 3') + 1, 'a new bedroom sits with the bedrooms');
  assert.ok(sorted.indexOf('Septic') > sorted.indexOf('Bath 2') && sorted.indexOf('Septic') < sorted.indexOf('Garage/Parking'), 'Septic files under Other');
  assert.ok(sorted.includes('Other 2'));
  assert.equal(new Set(a.map((x) => x.key)).size, a.length, 'keys never repeat');
  assert.equal(addArea(addArea([], 'Roof'), 'Roof')[1].name, 'Roof 2');
});

test('the rural areas foothill agents need are offered', () => {
  const n = EXTRA_AREAS.map((e) => e.name);
  for (const x of ['Well / Water', 'Septic', 'Propane', 'Solar', 'Outbuilding', 'Land / Acreage']) assert.ok(n.includes(x), x);
});

test('an area with notes or photos cannot be removed (nothing is lost)', () => {
  const area = { key: 'kitchen', name: 'Kitchen' };
  assert.equal(canRemoveArea(area, []), true);
  assert.equal(canRemoveArea(area, [{ area: 'kitchen', photo_id: 'x' }]), false);
  assert.equal(canRemoveArea(area, [{ area: 'kitchen', photo_id: 'x', deleted_at: '2026-11-06' }]), true);
  assert.equal(canRemoveArea({ ...area, notes: 'Cracked tile' }, []), false);
});

test('"Nothing observed" makes a blank area deliberate, not forgotten', () => {
  assert.equal(areaStatus({ key: 'k' }, []).done, false);
  assert.equal(areaStatus({ key: 'k', nothing: true }, []).done, true);
  const s = prepSummary({ id: 'p', areas: [{ key: 'a', nothing: true }, { key: 'b' }, { key: 'c' }] }, [{ prep_id: 'p', area: 'c', photo_id: '1', photo_kind: 'condition' }, { prep_id: 'p', area: 'c', photo_id: '2', photo_kind: 'listing', photo_path: 't/u/2.jpg' }]);
  assert.deepEqual([s.done, s.areas, s.photos, s.listing, s.condition, s.waiting], [2, 3, 2, 1, 1, 1]);
});

test('a photo is waiting until the team has it', () => {
  assert.equal(waitingPhotos([{ photo_id: 'a' }, { photo_id: 'b', photo_path: 'x' }, { photo_id: 'c', deleted_at: 'd' }, { note: 'no photo' }]).length, 1);
  assert.equal(waitingWords(1), '1 photo waiting to upload');
  assert.equal(waitingWords(3), '3 photos waiting to upload');
  assert.equal(waitingWords(0), '');
});

test('quick taps add their words once', () => {
  assert.equal(addTap('', 'Stains'), 'Stains.');
  assert.equal(addTap('Stains.', 'Cracks'), 'Stains. Cracks.');
  assert.equal(addTap('Stains. Cracks.', 'cracks'), 'Stains. Cracks.');
});

test("a library photo keeps the time it was taken; a fresh one uses now", () => {
  const now = new Date('2026-11-06T18:00:00Z');
  assert.equal(takenAt({ lastModified: Date.parse('2026-11-01T15:30:00Z') }, now), '2026-11-01T15:30:00.000Z');
  assert.equal(takenAt({}, now), now.toISOString());
  assert.equal(takenAt({ lastModified: Date.parse('2030-01-01T00:00:00Z') }, now), now.toISOString(), 'a clock in the future is not trusted');
});

test('one walk per unit on a multi-unit property', () => {
  const list = prepsFor([{ id: 'a', property_id: 'p', created_at: '2026-11-01' }, { id: 'b', property_id: 'p', created_at: '2026-11-02' }, { id: 'c', property_id: 'q' }], 'p');
  assert.deepEqual(list.map((x) => x.id), ['b', 'a']);
  assert.equal(nextUnit(list), 'Unit 3');
});

test("James's note categories and the two photo kinds", () => {
  assert.deepEqual(CATEGORIES.map((c) => c.label), ['Listing prep', 'Question', 'Showing note', 'Repair / issue', 'Feature', 'Other']);
  assert.deepEqual(PHOTO_KINDS.map((k) => k.id), ['listing', 'condition']);
  assert.match(sql, /photo_kind in \('listing', 'condition'\)/);
});

test('only the agent who made a walk, and the broker, can see it (db/031)', () => {
  assert.match(sql, /m\.role = 'owner'/, 'the broker is the team owner');
  assert.match(sql, /maker = auth\.uid\(\) or public\.bb_is_broker\(team\)/);
  for (const t of ['preps', 'prep_items']) assert.match(sql, new RegExp(`array\\['preps', 'prep_items'\\]`), t);
  assert.match(sql, /create policy prep_read on public\.%I for select to authenticated using \(public\.bb_prep_visible\(team_id, user_id\)\)/);
  assert.doesNotMatch(sql, /using \(public\.bb_is_member\(team_id\)\)/, 'never the team-wide rule the other tables use');
  assert.match(sql, /references auth\.users\(id\) on delete set null/, 'an agent leaving does not take the brokerage file with them');
});

test('walk photos are in their own private bucket, never the team-shared one', () => {
  assert.match(sql, /\('prep-photos', 'prep-photos', false\)/);
  assert.match(sql, /\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/, 'uploads only into your own folder');
  assert.match(store, /storage\.from\('prep-photos'\)\.upload\(path/);
  assert.match(store, /`\$\{cloud\.teamId\}\/\$\{cloud\.user\.id\}\/\$\{item\.photo_id\}\.jpg`/);
  assert.doesNotMatch(store.match(/export async function uploadPrepPhotos[\s\S]*?\n}\n/)[0], /from\('photos'\)/);
});

test('a photo is kept on the phone before its row is saved, and retried until it is uploaded', () => {
  const add = app.match(/async function addPrepPhotos[\s\S]*?\n}\n/)[0];
  assert.ok(add.indexOf('putPrepPhoto') < add.indexOf("store.save('prep_items'"), 'stored first, then filed');
  assert.match(add, /shrinkPhoto\(file, 2048/, 'sharp enough for the MLS');
  assert.match(store, /cloud\.status = failed\.length \? 'error' : 'synced';[^\n]*\n[^\n]*\n\s*setTimeout\(uploadPrepPhotos, 0\)/, 'every sync tries the waiting photos again');
  const up = store.match(/export async function uploadPrepPhotos[\s\S]*?\n}\n/)[0];
  assert.match(up, /if \(error\) \{ prepUpload\.failed\+\+;[^\n]*continue; \}/, 'a failed upload leaves the photo waiting, not dropped');
  assert.match(up, /photo_path: path/);
});

test('an HEIC photo that createImageBitmap cannot read is decoded another way', () => {
  assert.match(store, /createImageBitmap\(file\)\.catch\(\(\) => new Promise/);
  assert.match(store, /canvas\.toBlob\(resolve, 'image\/jpeg', quality\)/);
});

test('the walk warns before photos are taken in a browser tab', () => {
  assert.match(app, /isInstalled\(\) \? '' : html`<div class="warn-box"><b>Put Bestie on your home screen before a walk/);
  assert.match(store, /navigator\.storage\.persist/);
});

test('no screen calls it a disclosure or an AVID', () => {
  const block = app.slice(app.indexOf('// LISTING PREP (2026-11-06'), app.indexOf('// ROUTER'));
  const shown = [...block.matchAll(/html`([\s\S]*?)`/g)].map((m) => m[1]).join('\n');
  assert.doesNotMatch(shown, /disclosure|\bAVID\b/i);
});

test('the phone syncs both tables and the app caches the new file', () => {
  assert.match(store, /'contacts', 'preps', 'prep_items'\]/);
  assert.match(read('../sw.js'), /'\.\/js\/prep\.js'/);
  const dir = readdirSync(new URL('../db/', import.meta.url));
  assert.ok(dir.includes('031_listing_prep.sql'));
});
