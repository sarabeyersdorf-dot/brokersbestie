// Pop-up reminders for Brokers Bestie (2026-10-27).
//   GET  ?op=key         the public VAPID key a phone subscribes with
//   POST {op:'run'}      every 5 minutes from pg_cron (x-cron-token header)
//   POST {op:'test'}     a signed-in agent: "Reminders are on" to their phones
// The VAPID keys are made here on first use and kept in push_config (server
// only). What is due is decided by due.js; each reminder goes once per phone.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { makeVapidKeys, sendPush } from './webpush.js';
import { dueReminders } from './due.js';

const SUBJECT = 'https://brokersbestie.vercel.app';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function config() {
  let { data } = await db.from('push_config').select('*').eq('id', 1).maybeSingle();
  if (data && !data.public_key) {
    const k = await makeVapidKeys();
    await db.from('push_config').update({ public_key: k.publicKey, private_jwk: k.privateJwk }).eq('id', 1).is('public_key', null);
    ({ data } = await db.from('push_config').select('*').eq('id', 1).maybeSingle());
  }
  return data;
}

async function deliver(sub: any, msg: any, vapid: any) {
  try {
    const status = await sendPush(sub, { title: msg.title, body: msg.body, url: msg.url, tag: msg.key }, vapid);
    if (status === 404 || status === 410) await db.from('push_subs').delete().eq('id', sub.id);
    return status;
  } catch (e) { return String(e); }
}

async function run(cfg: any) {
  const vapid = { publicKey: cfg.public_key, privateJwk: cfg.private_jwk, subject: SUBJECT };
  const { data: subs } = await db.from('push_subs').select('*');
  const now = new Date();
  const lo = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
  const hi = new Date(now.getTime() + 864e5).toISOString().slice(0, 10);
  const byTeam = new Map<string, any[]>();
  for (const s of subs || []) byTeam.set(s.team_id, [...(byTeam.get(s.team_id) || []), s]);
  let sent = 0;
  for (const [team, list] of byTeam) {
    const [props, events, tours, dates, tasks, checkins] = await Promise.all([
      db.from('properties').select('id, address, owner').eq('team_id', team),
      db.from('events').select('*').eq('team_id', team).gte('date', lo).lte('date', hi),
      db.from('tours').select('id, name, date, start_minutes, finished, owner, stops').eq('team_id', team).gte('date', lo).lte('date', hi),
      db.from('dates').select('id, label, due, done, property_id').eq('team_id', team).gte('due', lo).lte('due', hi),
      db.from('tasks').select('id, text, due, done, property_id, owner').eq('team_id', team).gte('due', lo).lte('due', hi),
      db.from('checkins').select('id, status, due_at, user_id, place').eq('team_id', team).eq('status', 'active')
    ]);
    const data = { properties: props.data, events: events.data, tours: tours.data, dates: dates.data, tasks: tasks.data, checkins: checkins.data };
    for (const sub of list) {
      for (const msg of dueReminders(sub, data, now)) {
        const { data: claimed } = await db.from('push_sent').upsert({ key: `${msg.key}:${sub.id}` }, { onConflict: 'key', ignoreDuplicates: true }).select('key');
        if (!claimed || !claimed.length) continue;
        if ((await deliver(sub, msg, vapid)) === 201) sent++;
      }
    }
  }
  await db.from('push_sent').delete().lt('sent_at', new Date(now.getTime() - 4 * 864e5).toISOString());
  return { subs: (subs || []).length, sent };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const cfg = await config();
  if (!cfg) return json({ error: 'not set up' }, 500);
  const url = new URL(req.url);
  if (req.method === 'GET' && url.searchParams.get('op') === 'key') return json({ publicKey: cfg.public_key });
  const body = await req.json().catch(() => ({}));
  if (body.op === 'run') {
    if (req.headers.get('x-cron-token') !== cfg.cron_token) return json({ error: 'no' }, 401);
    return json(await run(cfg));
  }
  if (body.op === 'test') {
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await db.auth.getUser(jwt);
    if (!u?.user) return json({ error: 'sign in first' }, 401);
    const { data: subs } = await db.from('push_subs').select('*').eq('user_id', u.user.id);
    const vapid = { publicKey: cfg.public_key, privateJwk: cfg.private_jwk, subject: SUBJECT };
    const results = [];
    for (const s of subs || []) results.push(await deliver(s, { key: 'test', title: 'Reminders are on', body: 'Bestie will tap you before showings, at 7:30 with what is due, and when a safety check-in runs out.', url: '#/settings' }, vapid));
    return json({ phones: (subs || []).length, results });
  }
  return json({ error: 'unknown op' }, 400);
});
