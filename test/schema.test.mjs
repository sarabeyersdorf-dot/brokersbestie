// The phone writes rows; the team database must have a column for every field
// it writes, or the first sync after sign-in fails. This reads the columns out
// of db/001_schema.sql and checks every field the app is known to write.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sampleData } from '../js/sample.js';
import { alertText, e164 } from '../api/_lib/server.js';

import { readdirSync } from 'node:fs';
import { actionPlan } from '../js/assist.js';
import { ACTION_TYPES } from '../api/assist.js';

// Every migration, in order: a column added later counts too.
const dbDir = new URL('../db/', import.meta.url);
const sql = readdirSync(dbDir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(new URL(f, dbDir), 'utf8')).join('\n');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

function columns(table) {
  const m = sql.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
  assert.ok(m, `no table ${table}`);
  const cols = new Set();
  for (const line of m[1].split('\n')) {
    for (const part of line.split(',')) {
      const w = part.trim().match(/^([a-z_]+)\s+(text|uuid|numeric|boolean|date|timestamptz|integer|double|jsonb)/);
      if (w) cols.add(w[1]);
    }
  }
  for (const a of sql.matchAll(new RegExp(`alter table public\\.${table} add column if not exists ([a-z_]+)`, 'g'))) cols.add(a[1]);
  return cols;
}

const TABLES = ['properties', 'access', 'people', 'notes', 'tasks', 'dates', 'events', 'tours', 'trips', 'expenses', 'checkins'];

test('every table the phone syncs exists, with team_id, id and updated_at', () => {
  for (const t of TABLES) {
    const c = columns(t);
    for (const need of ['id', 'team_id', 'updated_at', 'created_at']) assert.ok(c.has(need), `${t}.${need}`);
  }
});

test('the sample data only uses columns the database has', () => {
  for (const [t, rows] of Object.entries(sampleData())) {
    const c = columns(t);
    for (const r of rows) for (const k of Object.keys(r)) assert.ok(c.has(k), `${t}.${k}`);
  }
});

test('every property field on the edit form has a column', () => {
  const block = app.match(/const PROP_FIELDS = \[([\s\S]*?)\n\];/)[1];
  const names = [...block.matchAll(/name: '([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(names.length > 10);
  const c = columns('properties');
  for (const n of names) assert.ok(c.has(n), `properties.${n}`);
});

test('every table has row-level security switched on', () => {
  assert.match(sql, /foreach t in array array\['properties','access','people','notes','tasks','dates','tours','trips','expenses','checkins'\]/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.%I from anon/);
});

test('safety texts say where, who, and what to do', () => {
  const c = { place: '433 E Hwy 4', meeting_name: 'New buyer', meeting_phone: '(209) 555-0142', lat: 38.1, lng: -120.4 };
  const late = alertText(c, { overdue: true });
  assert.match(late, /433 E Hwy 4/);
  assert.match(late, /New buyer/);
  assert.match(late, /911/);
  assert.match(late, /maps\.google\.com\/\?q=38\.1,-120\.4/);
  assert.match(alertText(c, { overdue: false }), /SEND HELP/);
});

test('phone numbers are put in the form Twilio needs', () => {
  assert.equal(e164('(209) 555-0142'), '+12095550142');
  assert.equal(e164('1-209-555-0142'), '+12095550142');
});

test('everything a spoken command saves has a column', () => {
  const a = { property_id: 'p1', text: 'Call the appraiser', due: '2026-10-24', code_kind: 'gate', code: '2580', where: 'Left post', name: 'Pat', role: 'Seller', phone: '209', email: 'a@b.c', amount: 12, miles: 40, address: '1 Main St', city: 'Murphys', stops: ['1 Main St'], minutes: 45 };
  let rows = 0;
  for (const type of ACTION_TYPES) {
    const p = actionPlan({ ...a, type }, { today: '2026-10-23' });
    if (!p.table) continue;
    rows++;
    const c = columns(p.table);
    for (const k of Object.keys(p.row)) assert.ok(c.has(k), `${p.table}.${k}`);
  }
  assert.ok(rows >= 8);
});

test('an MLS sheet note has its columns', () => {
  const c = columns('notes');
  for (const k of ['source', 'files']) assert.ok(c.has(k), `notes.${k}`);
});
