import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressVariants, normalizeState, townOf } from '../api/_lib/geo.js';

test('lowercase state and a missing state are both handled', () => {
  assert.equal(normalizeState('433 E Hwy 4 Murphys, ca'), '433 E Hwy 4 Murphys, CA');
  assert.equal(normalizeState('1143 Echo St Angels Camp'), '1143 Echo St Angels Camp, CA');
  assert.equal(normalizeState("433 E Hwy 4 Murphy's, ca 95247"), '433 E Hwy 4 Murphys, CA 95247');
});

test('a highway address is tried the ways maps spell it', () => {
  const v = addressVariants('433 E Hwy 4 Murphys, ca');
  assert.ok(v.includes('433 East Highway 4 Murphys, CA'), v.join(' | '));
  assert.ok(v.includes('433 East State Route 4 Murphys, CA'), v.join(' | '));
  assert.ok(v.includes('433 East CA-4 Murphys, CA'), v.join(' | '));
  assert.ok(v.includes('433 Highway 4 Murphys, CA'), v.join(' | '));
});

test('the town is found for the approximate fallback', () => {
  assert.equal(townOf('433 E Hwy 4 Murphys, CA'), 'Murphys, CA');
  assert.equal(townOf('324 Augusta Ct, Valley Springs, CA'), 'Valley Springs, CA');
  assert.equal(townOf('1143 Echo St Angels Camp, CA'), 'Angels Camp, CA');
  assert.equal(townOf('999 Nowhere'), '');
});
