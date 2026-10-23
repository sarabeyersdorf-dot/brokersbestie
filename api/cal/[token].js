// GET /api/cal/<token>.ics — the team calendar, for a phone to subscribe to.
// The token is the whole credential (made by bb_cal_token, 64 random hex
// characters); the server reads with the service role and sends only what a
// calendar shows: appointments, tours and open deadlines.

import { db, env } from '../_lib/server.js';
import { icsCalendar } from '../_lib/feed.js';
import { formatClock } from '../../js/route.js';

export default async function handler(req, res) {
  const token = String((req.query && req.query.token) || '').replace(/\.ics$/i, '');
  if (!/^[0-9a-f]{32,64}$/.test(token) || !env('SUPABASE_SERVICE_ROLE_KEY')) { res.statusCode = 404; return res.end('Not found'); }
  const feeds = await db(`cal_feeds?token=eq.${token}&select=team_id`);
  if (!feeds.length) { res.statusCode = 404; return res.end('Not found'); }
  const team = feeds[0].team_id;
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [props, events, dates, tours] = await Promise.all([
    db(`properties?team_id=eq.${team}&select=id,address,city`),
    db(`events?team_id=eq.${team}&date=gte.${since}&cancelled=is.not.true&select=*`),
    db(`dates?team_id=eq.${team}&done=is.false&due=gte.${since}&select=*`),
    db(`tours?team_id=eq.${team}&date=gte.${since}&select=*`)
  ]);
  const where = new Map(props.map((p) => [p.id, [p.address, p.city].filter(Boolean).join(', ')]));
  const items = [
    ...events.map((e) => ({ uid: e.id, title: e.title, date: e.date, start: e.start_minutes, minutes: e.minutes, location: e.location || where.get(e.property_id) || '', notes: e.notes })),
    ...dates.map((d) => ({ uid: d.id, title: `${d.label}${where.get(d.property_id) ? ' · ' + where.get(d.property_id) : ''}`, date: d.due, start: null })),
    ...tours.map((t) => ({ uid: t.id, title: t.name || 'Showing tour', date: t.date, start: t.start_minutes, minutes: Math.max(60, (t.stops || []).length * 30), notes: (t.stops || []).map((s) => `${s.arrive != null ? formatClock(s.arrive) + ' ' : ''}${s.address}`).join('\n') }))
  ];
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(icsCalendar('Brokers Bestie', items));
}
