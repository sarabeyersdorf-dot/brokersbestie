// The Google Play reviewer account (2026-11-11): password sign-in exists for
// it, the normal sign-in stays the emailed code, and its team can never text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const store = readFileSync(new URL('../js/store.js', import.meta.url), 'utf8');
const fn = readFileSync(new URL('../supabase/functions/reminders/index.ts', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../db/032_review_account.sql', import.meta.url), 'utf8');

test('password sign-in is offered on both sign-in screens, folded away', () => {
  assert.match(store, /export async function signInPassword/);
  assert.match(store, /signInWithPassword/);
  assert.match(app, /Sign in with a password/);
  assert.equal((app.match(/\$\{pwSignInHtml\('/g) || []).length, 2);
  assert.equal((app.match(/wirePwSignIn\(root, '/g) || []).length, 2);
  // the emailed code is still the main way in
  assert.match(store, /signInWithOtp/);
});

test('every text checks the team switch before it is sent', () => {
  const body = fn.slice(fn.indexOf('async function cappedText'), fn.indexOf('async function contactRows'));
  const check = body.indexOf('sms_blocked');
  assert.ok(check > 0, 'cappedText must read teams.sms_blocked');
  assert.ok(check < body.indexOf('sendSms('), 'the check comes before the send');
  assert.equal((fn.match(/await sendSms\(/g) || []).length, 1, 'only one place sends a text');
});

test('the daily reset never touches a team with other people in it', () => {
  assert.match(sql, /review team has other members; not reset/);
  assert.match(sql, /sms_blocked = true/);
  assert.doesNotMatch(sql, /encrypted_password|crypt\(/, 'no password in the repo');
});
