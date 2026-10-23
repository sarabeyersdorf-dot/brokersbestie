// GET /api/geocode?q=<address>&state=CA  ->  { lat, lng, display, approximate }
// Turns a typed or spoken address into a map point for tour routing.
// Google's geocoder when GOOGLE_MAPS_API_KEY is set (best for rural roads),
// otherwise OpenStreetMap's free one. With a Google key it costs money per
// lookup, so then only a signed-in team member may use it.
//
// Rural highway addresses fail on the free lookup, so each spelling in
// addressVariants() is tried in turn, and if the street is never found the
// town is returned with approximate: true — good enough to order a route,
// and the app says so on the stop.

import { env, send, caller } from './_lib/server.js';
import { addressVariants, townOf } from './_lib/geo.js';

async function google(q, key) {
  const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=us&key=${key}`);
  const j = await r.json();
  const hit = j.results && j.results[0];
  return hit ? { lat: hit.geometry.location.lat, lng: hit.geometry.location.lng, display: hit.formatted_address, approximate: !!hit.partial_match } : null;
}

const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function osm(q) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': 'BrokersBestie/0.1 (https://brokersbestie.app)' }
  });
  const j = await r.json();
  return j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon), display: j[0].display_name, approximate: false } : null;
}

export default async function handler(req, res) {
  const params = new URL(req.url, 'http://x').searchParams;
  const q = String((req.query && req.query.q) || params.get('q') || '').trim().slice(0, 200);
  const state = String((req.query && req.query.state) || params.get('state') || 'CA').trim().slice(0, 2).toUpperCase() || 'CA';
  if (!q) return send(res, 400, { error: 'Missing address' });
  const key = env('GOOGLE_MAPS_API_KEY');
  try {
    if (key && env('SUPABASE_URL') && !(await caller(req))) return send(res, 401, { error: 'Sign in to look up addresses' });
    const look = key ? (x) => google(x, key) : osm;
    const tries = addressVariants(q, state);
    for (let i = 0; i < tries.length; i++) {
      if (!key && i > 0) await pause(1100); // OpenStreetMap asks for one lookup a second
      const hit = await look(tries[i]);
      if (hit) return send(res, 200, hit);
    }
    const town = townOf(tries[0]);
    if (town) {
      if (!key) await pause(1100);
      const hit = await look(town);
      if (hit) return send(res, 200, { ...hit, approximate: true, display: `${town} (town center: street not found)` });
    }
    return send(res, 404, { error: 'Address not found' });
  } catch (e) {
    return send(res, 502, { error: 'Address lookup is not answering' });
  }
}
