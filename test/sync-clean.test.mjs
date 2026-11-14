// James's iPhone sync stuck on "WILL RETRY" (2026-11-12): the phone sent
// coe_date = "" and Postgres refused the row ("invalid input syntax for type
// date") 22 times, and that one row stopped the whole sync. A cleared box is
// now sent as null for every non-text column, a refused row is skipped (kept
// on the phone, still waiting) instead of blocking the rest, and Settings shows
// the table and Postgres's own words.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { cleanRow, NOT_TEXT, errorLine } from '../js/store.js';

const dbDir = new URL('../db/', import.meta.url);
const sql = readdirSync(dbDir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(new URL(f, dbDir), 'utf8')).join('\n');
const store = readFileSync(new URL('../js/store.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

test('a blank date, number or time goes up as null; blank text stays blank', () => {
  const r = cleanRow({ id: 'p1', address: '1 Main', city: '', coe_date: '', list_date: ' ', price: '', lat: '', shown_at: '', gate_lat: '', heads_up: '', _dirty: true, sample: false }, 'team1');
  assert.equal(r.coe_date, null);
  assert.equal(r.list_date, null);
  assert.equal(r.price, null);
  assert.equal(r.lat, null);
  assert.equal(r.shown_at, null);
  assert.equal(r.gate_lat, null);
  assert.equal(r.heads_up, null);
  assert.equal(r.city, '');
  assert.equal(r.address, '1 Main');
  assert.equal(r.team_id, 'team1');
  assert.ok(!('_dirty' in r) && !('sample' in r));
});

test('a real value is never touched', () => {
  const r = cleanRow({ coe_date: '2026-11-28', price: 750000, well: false, lat: 38.1 }, 't');
  assert.deepEqual(r, { coe_date: '2026-11-28', price: 750000, well: false, lat: 38.1, team_id: 't' });
});

test('a new column named like a date or place is covered without editing the list', () => {
  assert.equal(cleanRow({ inspection_date: '', pickup_at: '', door_lng: '' }, 't').inspection_date, null);
  assert.equal(cleanRow({ pickup_at: '' }, 't').pickup_at, null);
  assert.equal(cleanRow({ door_lng: '' }, 't').door_lng, null);
});

test('every non-text column in the migrations is in NOT_TEXT or named like one', () => {
  const missing = [];
  const re = /(?:^|[\s,(])([a-z_]+)\s+(date|timestamptz|numeric|double precision|integer|bigint|boolean|jsonb|text\[\])\b/g;
  for (const m of sql.matchAll(re)) {
    const col = m[1];
    if (['id', 'returns', 'add', 'column', 'exists', 'type'].includes(col)) continue;
    if (NOT_TEXT.has(col) || /(_at|_date|_lat|_lng|_minutes)$/.test(col)) continue;
    missing.push(col);
  }
  // Columns on server-only tables the phone never writes, and variables
  // declared inside SQL functions, are fine to miss.
  const serverOnly = new Set(['seats', 'comped', 'cancel_at_period_end', 'current_period_end', 'trial_ends_at', 'uses', 'returns', 'expires_at', 'last_synced_at', 'revoked', 'count', 'n', 'lead_minutes', 'enabled', 'contacts_mode', 'private_jwk', 'day', 'cap', 'sms_blocked', 'every', 'ord', 'rows', 'today', 'r', 'batch', 'shift']);
  const real = [...new Set(missing)].filter((c) => !serverOnly.has(c));
  assert.deepEqual(real, [], 'add these to NOT_TEXT in js/store.js: ' + real.join(', '));
});

test('one refused row is skipped and kept, never blocking the rest', () => {
  assert.doesNotMatch(store.slice(store.indexOf('export async function syncNow'), store.indexOf('// Photos, and the pages')), /upsert\([^)]*\)\);\s*if \(error\) throw error;/);
  assert.match(store, /stuck\.add\(r\.id\); failed\.push\(errorLine\(t, e1\)\)/);
  assert.match(store, /r\.sample \|\| stuck\.has\(r\.id\) \? r : \{ \.\.\.r, _dirty: false \}/);
});

test('Settings shows the table and the database\'s words', () => {
  assert.equal(errorLine('properties', { message: 'invalid input syntax for type date: ""' }), 'properties: invalid input syntax for type date: ""');
  assert.match(app, /c\.status === 'error' && c\.lastError/);
});
