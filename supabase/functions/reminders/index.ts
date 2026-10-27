// Pop-up reminders for Brokers Bestie (2026-10-27).
//   GET  ?op=key         the public VAPID key a phone subscribes with
//   POST {op:'run'}      every 5 minutes from pg_cron (x-cron-token header)
//   POST {op:'test'}     a signed-in agent: "Reminders are on" to their phones
//   POST {op:'safety'}   a signed-in agent's check-in: start | extend | ok | help
//                        (help texts their contact now)
//   GET  ?op=oh&t=       an open house sign-in link: the address and branding
//   POST {op:'visit'}    a visitor signing in on their own phone (no account)
// Safety texts go through Twilio when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
// TWILIO_FROM are set as this function's secrets; until then nothing is texted
// and the phone keeps saying "phone-only".
// The VAPID keys are made here on first use and kept in push_config (server
// only). What is due is decided by due.js; each reminder goes once per phone.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { makeVapidKeys, sendPush } from './webpush.js';
import { dueReminders } from './due.js';
import { overdue, alertText, e164, cleanVisit } from './safety.js';

const TW = { sid: Deno.env.get('TWILIO_ACCOUNT_SID'), tok: Deno.env.get('TWILIO_AUTH_TOKEN'), from: Deno.env.get('TWILIO_FROM') };
const texting = () => !!(TW.sid && TW.tok && TW.from);
async function sendSms(to: string, body: string) {
  if (!texting()) throw new Error('texting is not set up');
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW.sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${TW.sid}:${TW.tok}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: e164(to), From: TW.from!, Body: body })
  });
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// Overdue check-ins: claim first (alerted_at), so two runs can never text twice;
// un-claim on a failed send so the next run tries again.
async function safetyRun() {
  if (!texting()) return { texted: 0, skipped: 'texting not set up' };
  const { data } = await db.from('checkins').select('*').eq('status', 'active').is('alerted_at', null);
  let texted = 0;
  for (const c of overdue(data || [])) {
    const { data: claimed } = await db.from('checkins').update({ alerted_at: new Date().toISOString() }).eq('id', c.id).is('alerted_at', null).select('id');
    if (!claimed || !claimed.length || !c.contact_phone) continue;
    try { await sendSms(c.contact_phone, alertText(c, { overdue: true })); texted++; }
    catch (_) { await db.from('checkins').update({ alerted_at: null }).eq('id', c.id); }
  }
  return { texted };
}

async function signedIn(req: Request) {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data } = await db.auth.getUser(jwt);
  return data?.user || null;
}

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
      db.from('properties').select('id, address, owner, lat, lng').eq('team_id', team),
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
  const safety = await safetyRun();
  return { subs: (subs || []).length, sent, safety };
}

async function ohLink(t: unknown) {
  if (!t || !/^[a-f0-9]{16,64}$/.test(String(t))) return null;
  const { data } = await db.from('oh_links').select('*').eq('token', String(t)).maybeSingle();
  return data && new Date(data.expires_at) > new Date() ? data : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const cfg = await config();
  if (!cfg) return json({ error: 'not set up' }, 500);
  const url = new URL(req.url);
  if (req.method === 'GET' && url.searchParams.get('op') === 'key') return json({ publicKey: cfg.public_key, safetySms: texting() });
  if (req.method === 'GET' && url.searchParams.get('op') === 'oh') {
    const link = await ohLink(url.searchParams.get('t'));
    if (!link) return json({ error: 'This sign-in link has ended. Please ask the agent.' }, 404);
    const [{ data: prop }, { data: prof }] = await Promise.all([
      db.from('properties').select('address, city').eq('id', link.property_id).maybeSingle(),
      db.from('profiles').select('full_name, title, brokerage, license, phone, brand_color').eq('team_id', link.team_id).eq('owner', link.owner || '').maybeSingle()
    ]);
    return json({ address: prop?.address || '', city: prop?.city || '', agent: prof || null });
  }
  const body = await req.json().catch(() => ({}));
  if (body.op === 'run') {
    if (req.headers.get('x-cron-token') !== cfg.cron_token) return json({ error: 'no' }, 401);
    return json(await run(cfg));
  }
  if (body.op === 'visit') {
    if (body.website) return json({ ok: true }); // a hidden field only robots fill in
    const link = await ohLink(body.t);
    if (!link) return json({ error: 'This sign-in link has ended. Please ask the agent.' }, 404);
    const v = cleanVisit(body);
    if (!v) return json({ error: 'Please add your first name and a phone number or email.' }, 400);
    const today = new Date().toISOString().slice(0, 10);
    const ohDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.oh_date)) ? body.oh_date : today;
    const { count } = await db.from('visitors').select('id', { count: 'exact', head: true }).eq('property_id', link.property_id).eq('oh_date', ohDate);
    if ((count || 0) >= 300) return json({ error: 'Sign-in is full for today.' }, 429);
    const { error } = await db.from('visitors').insert({ id: 'web-' + crypto.randomUUID(), team_id: link.team_id, property_id: link.property_id, owner: link.owner, oh_date: ohDate, notes: 'Signed in on their own phone', ...v });
    if (error) return json({ error: 'Could not save. Please try again.' }, 500);
    return json({ ok: true });
  }
  if (body.op === 'safety') {
    const user = await signedIn(req);
    if (!user) return json({ error: 'sign in first' }, 401);
    const { data: c } = await db.from('checkins').select('*').eq('id', String(body.id || '')).maybeSingle();
    if (!c) return json({ error: 'Check-in not saved yet; try again in a moment' }, 404);
    const { data: member } = await db.from('team_members').select('user_id').eq('team_id', c.team_id).eq('user_id', user.id);
    if (!member || !member.length) return json({ error: 'Not your team' }, 403);
    const now = new Date().toISOString();
    if (body.action === 'start') await db.from('checkins').update({ status: 'active', alerted_at: null }).eq('id', c.id);
    else if (body.action === 'extend') {
      const due = body.due_at && !isNaN(Date.parse(body.due_at)) ? body.due_at : new Date(Date.now() + 15 * 60000).toISOString();
      await db.from('checkins').update({ due_at: due, alerted_at: null, status: 'active' }).eq('id', c.id);
    } else if (body.action === 'ok') await db.from('checkins').update({ status: 'ok', ended_at: now }).eq('id', c.id);
    else if (body.action === 'help') {
      await db.from('checkins').update({ status: 'help', ended_at: now, alerted_at: now }).eq('id', c.id);
      if (c.contact_phone && texting()) {
        try { await sendSms(c.contact_phone, alertText(c, { overdue: false })); } catch (e) { return json({ error: String(e) }, 502); }
      }
    } else return json({ error: 'unknown action' }, 400);
    return json({ ok: true, texting: texting() });
  }
  if (body.op === 'test') {
    const u = { user: await signedIn(req) };
    if (!u.user) return json({ error: 'sign in first' }, 401);
    const { data: subs } = await db.from('push_subs').select('*').eq('user_id', u.user.id);
    const vapid = { publicKey: cfg.public_key, privateJwk: cfg.private_jwk, subject: SUBJECT };
    const results = [];
    for (const s of subs || []) results.push(await deliver(s, { key: 'test', title: 'Reminders are on', body: 'Bestie will tap you before showings, at 7:30 with what is due, and when a safety check-in runs out.', url: '#/settings' }, vapid));
    return json({ phones: (subs || []).length, results });
  }
  return json({ error: 'unknown op' }, 400);
});
