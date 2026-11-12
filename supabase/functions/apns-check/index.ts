// One-off check that Apple accepts the APNs key (2026-11-12). Sends a push to
// a made-up token: Apple answers 400 BadDeviceToken when the key is good and
// 403 InvalidProviderToken when it is not. Nobody receives anything. Only a
// caller holding the reminders cron token may run it; it never returns a key.
// Deployed separately (verify_jwt off) so the live reminders function is untouched.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { apnsReady, sendApns } from './apns.js';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const APNS = { APNS_KEY_P8: Deno.env.get('APNS_KEY_P8'), APNS_KEY_ID: Deno.env.get('APNS_KEY_ID'), APNS_TEAM_ID: Deno.env.get('APNS_TEAM_ID') };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
Deno.serve(async (req) => {
  const { data: cfg } = await db.from('push_config').select('cron_token').eq('id', 1).maybeSingle();
  if (!cfg || req.headers.get('x-cron-token') !== cfg.cron_token) return json({ error: 'no' }, 401);
  if (!apnsReady(APNS)) return json({ ready: false });
  const p8 = String(APNS.APNS_KEY_P8 || '');
  const out: any = { ready: true, keyIdLength: String(APNS.APNS_KEY_ID).trim().length, teamIdLength: String(APNS.APNS_TEAM_ID).trim().length, p8HasBegin: /BEGIN PRIVATE KEY/.test(p8), p8Length: p8.length };
  for (const env of ['sandbox', 'production']) {
    try { const r = await sendApns({ apns_env: env, apns_token: '0'.repeat(64) }, { title: 'check', body: 'check' }, APNS); out[env] = { status: r.status, reason: r.reason, keyOk: r.status === 400 && r.reason === 'BadDeviceToken' }; }
    catch (e) { out[env] = { error: String((e as Error).message || e).slice(0, 200) }; }
  }
  return json(out);
});
