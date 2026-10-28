// The daily limit on the paid AI features (db/021).
import test from 'node:test';
import assert from 'node:assert/strict';
import { refuse, dailyLimit, DAILY_LIMIT } from '../api/_lib/ai.js';

function setup(rpcAnswer) {
  process.env.ANTHROPIC_API_KEY = 'k';
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 's';
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push([String(url), init.body ? JSON.parse(init.body) : null]);
    if (String(url).endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }), { status: 200 });
    if (String(url).includes('/rpc/bb_ai_take')) {
      if (rpcAnswer === 'error') return new Response('boom', { status: 500 });
      return new Response(JSON.stringify(rpcAnswer), { status: 200 });
    }
    throw new Error('unexpected ' + url);
  };
  return calls;
}
const req = { headers: { authorization: 'Bearer t' } };

test('under the limit: allowed, and the use is counted for that agent', async () => {
  const calls = setup(3);
  assert.equal(await refuse(req), null);
  const rpc = calls.find(([u]) => u.includes('bb_ai_take'));
  assert.deepEqual(rpc[1], { who: 'u1', cap: DAILY_LIMIT });
});

test('at the limit: refused with 429 in plain words', async () => {
  setup(null);
  const r = await refuse(req);
  assert.equal(r.status, 429);
  assert.match(r.error, /daily limit/);
});

test('not signed in: refused before anything is counted', async () => {
  const calls = setup(1);
  const r = await refuse({ headers: {} });
  assert.equal(r.status, 401);
  assert.ok(!calls.some(([u]) => u.includes('bb_ai_take')));
});

test('a database hiccup lets the request through rather than breaking the feature', async () => {
  setup('error');
  assert.equal(await refuse(req), null);
});

test('AI_DAILY_LIMIT in Vercel changes the limit', () => {
  process.env.AI_DAILY_LIMIT = '20';
  assert.equal(dailyLimit(), 20);
  process.env.AI_DAILY_LIMIT = 'nonsense';
  assert.equal(dailyLimit(), DAILY_LIMIT);
  delete process.env.AI_DAILY_LIMIT;
});
