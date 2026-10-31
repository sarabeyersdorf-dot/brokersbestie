// Delete my account (api/account.js).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 's';
const { default: handler } = await import('../api/account.js');

function run(members, body) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), m = init.method || 'GET';
    calls.push(`${m} ${u.replace('https://x.supabase.co', '')}`);
    const json = (v) => new Response(JSON.stringify(v), { status: 200 });
    if (u.endsWith('/auth/v1/user')) return json({ id: 'me' });
    if (u.includes('team_members?user_id=')) return json([{ team_id: 't1' }]);
    if (u.includes('team_members?team_id=') && m === 'GET') return json(members.map((id) => ({ user_id: id })));
    if (u.includes('/object/list/photos')) return json(calls.filter((c) => c.includes('/object/list')).length === 1 ? [{ name: 'a.jpg' }, { name: 'b.pdf' }] : []);
    return new Response('', { status: 200 });
  };
  const res = { statusCode: 0, headers: {}, setHeader() {}, end(b) { this.body = JSON.parse(b); } };
  return handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body }, res).then(() => ({ res, calls }));
}

test('alone on the team: files, then the whole team, then the sign-in', async () => {
  const { res, calls } = await run(['me'], { op: 'delete', confirm: 'DELETE' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.team_deleted, true);
  assert.equal(res.body.files, 2);
  const i = (s) => calls.findIndex((c) => c.startsWith(s));
  assert.ok(i('DELETE /storage/v1/object/photos') > -1);
  assert.ok(i('DELETE /storage/v1/object/photos') < i('DELETE /rest/v1/teams?id=eq.t1'), 'files before the rows that point at them');
  assert.ok(i('DELETE /rest/v1/teams?id=eq.t1') < i('DELETE /auth/v1/admin/users/me'));
});

test('with a teammate: only this person leaves; the team and its files stay', async () => {
  const { res, calls } = await run(['me', 'james'], { op: 'delete', confirm: 'DELETE', profile_id: 'p1' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.team_deleted, false);
  assert.ok(calls.some((c) => c.startsWith('DELETE /rest/v1/team_members?team_id=eq.t1&user_id=eq.me')));
  assert.ok(calls.some((c) => c.startsWith('DELETE /rest/v1/profiles?team_id=eq.t1&id=eq.p1')));
  assert.ok(!calls.some((c) => c.includes('/teams?') || c.includes('/storage/')));
  assert.ok(calls.some((c) => c.startsWith('DELETE /auth/v1/admin/users/me')));
});

test('nothing happens without typing DELETE', async () => {
  const { res, calls } = await run(['me'], { op: 'delete', confirm: 'delete' });
  assert.equal(res.statusCode, 400);
  assert.ok(!calls.some((c) => c.startsWith('DELETE') || c.startsWith('PATCH')));
});

test('joining a team moves every table, and keeps merged files reachable (db/028)', async () => {
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../db/028_join_moves_everything_sms_log.sql', import.meta.url), 'utf8');
  assert.match(sql, /information_schema\.columns/, 'tables found at run time, not a hand-kept list');
  assert.match(sql, /merged_into = t/);
  assert.match(sql, /bb_can_files/);
  const acct = readFileSync(new URL('../api/account.js', import.meta.url), 'utf8');
  assert.match(acct, /merged_into=eq\./, 'deleting the team also removes merged teams and their files');
});

test('one team per new person (db/029), and delete clears any duplicate team', async () => {
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../db/029_one_team_per_new_user.sql', import.meta.url), 'utf8');
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /if t is not null then return t/);
  const acct = readFileSync(new URL('../api/account.js', import.meta.url), 'utf8');
  assert.match(acct, /team_members\?user_id=eq\.\$\{uid\}&select=team_id/);
});
