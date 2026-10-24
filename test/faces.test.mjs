import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { REACTIONS, REACTION_KEYS, reactionLabel, reactionFace, okFace, winkFace, ICON_SVG } from '../js/faces.js';

test('the eight showing reactions, in Cowork\'s order and words', () => {
  assert.deepEqual(REACTION_KEYS, ['love', 'like', 'maybe', 'nope', 'pricey', 'work', 'again', 'offer']);
  assert.deepEqual(REACTIONS.map((r) => r[1]), ['Loved it', 'Liked it', 'On the fence', 'Not for us', 'Too pricey', 'Needs work', 'See it again', 'Writing an offer']);
  assert.equal(reactionLabel('offer'), 'Writing an offer');
  assert.equal(reactionLabel('nonsense'), '');
});

test('every face is one svg, labelled unless asked not to be', () => {
  for (const k of REACTION_KEYS) {
    const svg = reactionFace(k, { size: 48 });
    assert.match(svg, /^<svg viewBox="0 0 120 140" width="48" height="56" role="img" aria-label="[^"]+">/);
    assert.equal((svg.match(/<svg/g) || []).length, 1);
    assert.match(reactionFace(k, { label: '' }), /aria-hidden="true"/);
  }
  assert.equal(reactionFace('nope-not-a-key'), '');
  assert.match(okFace({ size: 96, label: 'You OK?' }), /aria-label="You OK\?"/);
  assert.match(winkFace(), /<svg/);
});

test('the app icon is a square svg on the charcoal, and the manifest matches', () => {
  assert.match(ICON_SVG, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 512 512">/);
  assert.equal(fs.readFileSync(new URL('../icons/icon.svg', import.meta.url), 'utf8').trim(), ICON_SVG);
  const m = JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(m.background_color, '#202428');
  assert.equal(m.theme_color, '#202428');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
});

test('the service worker caches faces.js', () => {
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /'\.\/js\/faces\.js'/);
});
