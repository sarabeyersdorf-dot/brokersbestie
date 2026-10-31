// Homes the CRM stopped sending, and closed homes' dates (Sara, 2026-10-31).
// She connected Follow Up Boss for a morning, went back to the Legacy feed,
// and 26 FUB homes stayed behind — two of them July closings still "in
// escrow", nagging as 100+ days overdue. runSync now removes a home the CRM
// no longer sends when nothing of the agent's is on it, keeps it (dates
// ticked) when something is, and ticks the CRM dates of closed/cancelled homes.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 's';
const { leftoverPlan, hasAgentFields, crmId } = await import('../api/_lib/feed.js');
const { runSync } = await import('../api/_lib/crm.js');

const T = 't1';
const pid = (x) => crmId(T, 'p', x);

// ---- the rule ---------------------------------------------------------------
test('an empty leftover is removed; one with anything of the agent\'s is kept', () => {
  const plan = leftoverPlan([
    { id: 'a', heads_up: [] },                 // nothing
    { id: 'b', showing_notes: 'Dog in back' }, // typed field
    { id: 'c', heads_up: ['Dog'] },            // a tag
    { id: 'd' },                               // has a code under it (used)
    { id: 'e', gate_lat: 38.1 }                // gate pin
  ], new Set(['d']));
  assert.deepEqual(plan.remove, ['a']);
  assert.deepEqual(plan.keep.sort(), ['b', 'c', 'd', 'e']);
});
test('map coordinates Bestie filled in by itself do not count', () => {
  assert.equal(hasAgentFields({ id: 'x', lat: 38.1, lng: -120.5, heads_up: [], well: null }), false);
  assert.equal(hasAgentFields({ id: 'x', well: false }), true, 'a no on well is still something typed');
});

// ---- runSync against a fake database ------------------------------------------
function fakeDb({ feedProps, dbProps, used = {}, tours = [], finished = [] }) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)), m = init.method || 'GET';
    calls.push({ m, u: u.replace('https://x.supabase.co/rest/v1/', ''), body: init.body ? JSON.parse(init.body) : null });
    const json = (v) => new Response(JSON.stringify(v), { status: 200 });
    if (u.startsWith('https://legacy.test/feed')) {
      if (m === 'POST') return json({ results: [] });
      return json({ format: 'bestie-feed/1', properties: feedProps.map((x) => ({ ext_id: x, address: `${x} Main St`, status: 'escrow' })) });
    }
    if (u.includes('crm_links?') && m === 'GET') return json([{ team_id: T, provider: 'feed', feed_url: 'https://legacy.test/feed', feed_key: 'k', contacts_mode: 'deals' }]);
    if (u.includes('properties?') && u.includes('status=in.(closed,cancelled)')) return json(finished.map((x) => ({ id: pid(x) })));
    if (u.includes('properties?') && u.includes('source=eq.crm&select=id,')) return json(dbProps.map((p) => ({ ...p, id: pid(p.id) })));
    if (u.includes('tours?')) return json(tours);
    for (const [table, ids] of Object.entries(used)) {
      if (u.startsWith(`https://x.supabase.co/rest/v1/${table}?`) && u.includes('property_id=in.') && m === 'GET') return json(ids.map((x) => ({ property_id: pid(x) })));
    }
    if (m === 'GET') return json([]);
    return new Response('', { status: 200 });
  };
  return calls;
}
const deletes = (calls) => calls.filter((c) => c.m === 'DELETE' && c.u.startsWith('properties?'));
const ticks = (calls) => calls.filter((c) => c.m === 'PATCH' && c.u.startsWith('dates?') && c.u.includes('property_id=in.'));

test('a home the CRM stopped sending, with nothing of the agent\'s on it, is removed', async () => {
  const calls = fakeDb({ feedProps: ['echo'], dbProps: [{ id: 'echo', heads_up: [] }, { id: '127', heads_up: [] }, { id: '130', heads_up: [] }] });
  const r = await runSync(T);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.pruned, { removed: 2, kept: 0 });
  const d = deletes(calls);
  assert.equal(d.length, 1);
  assert.ok(d[0].u.includes(pid('127')) && d[0].u.includes(pid('130')));
  assert.ok(!d[0].u.includes(pid('echo')), 'a home still in the feed is never removed');
  assert.ok(d[0].u.includes('source=eq.crm'), 'only CRM homes, never one the agent added');
});

test('a leftover with a code, a tour stop or a phone-typed date is kept, its CRM dates ticked', async () => {
  const calls = fakeDb({
    feedProps: ['echo'],
    dbProps: [{ id: 'coded', heads_up: [] }, { id: 'toured', heads_up: [] }, { id: 'dated', heads_up: [] }, { id: 'empty', heads_up: [] }],
    used: { access: ['coded'], dates: ['dated'] },
    tours: [{ stops: [{ property_id: pid('toured') }, { property_id: null }] }]
  });
  const r = await runSync(T);
  assert.deepEqual(r.pruned, { removed: 1, kept: 3 });
  assert.ok(deletes(calls)[0].u.includes(pid('empty')));
  const t = ticks(calls)[0];
  for (const x of ['coded', 'toured', 'dated']) assert.ok(t.u.includes(pid(x)), x);
  assert.deepEqual(t.body.done, true);
});

test('the phone-made rows are asked for by source, so the CRM\'s own rows do not keep a home', async () => {
  const calls = fakeDb({ feedProps: ['echo'], dbProps: [{ id: 'old', heads_up: [] }] });
  await runSync(T);
  for (const t of ['people', 'dates', 'events']) {
    const ask = calls.find((c) => c.m === 'GET' && c.u.startsWith(`${t}?`) && c.u.includes('property_id=in.'));
    assert.ok(ask && ask.u.includes('or=(source.is.null,source.neq.crm)'), t);
  }
});

test('a CRM that sends no homes at all removes nothing (more likely a hiccup)', async () => {
  const calls = fakeDb({ feedProps: [], dbProps: [{ id: '127', heads_up: [] }] });
  const r = await runSync(T);
  assert.deepEqual(r.pruned, { removed: 0, kept: 0 });
  assert.equal(deletes(calls).length, 0);
});

test('a closed or cancelled CRM home has its open CRM dates ticked — never a phone tick undone, never a waiting change', async () => {
  const calls = fakeDb({ feedProps: ['echo', 'latigo'], dbProps: [{ id: 'echo', heads_up: [] }, { id: 'latigo', heads_up: [] }], finished: ['latigo'] });
  await runSync(T);
  const t = ticks(calls);
  assert.equal(t.length, 1);
  assert.ok(t[0].u.includes(pid('latigo')) && !t[0].u.includes(pid('echo')), 'an escrow home is left alone');
  assert.ok(t[0].u.includes('source=eq.crm'), 'only CRM dates');
  assert.ok(t[0].u.includes('done=is.false'), 'only ticks; a date already done is not touched');
  assert.ok(t[0].u.includes('crm_dirty=is.false'), 'a change still waiting to go to the CRM is not touched');
  assert.deepEqual(Object.keys(t[0].body).sort(), ['done', 'updated_at']);
});
