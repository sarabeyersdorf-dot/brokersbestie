// GET /api/geocode?q=<address>  ->  { lat, lng, display }
// Turns a typed or spoken address into a map point for tour routing.
// Google's geocoder when GOOGLE_MAPS_API_KEY is set (best for rural roads),
// otherwise OpenStreetMap's free one. With a Google key it costs money per
// lookup, so then only a signed-in team member may use it.

import { env, send, caller } from './_lib/server.js';

export default async function handler(req, res) {
  const q = String((req.query && req.query.q) || new URL(req.url, 'http://x').searchParams.get('q') || '').trim().slice(0, 200);
  if (!q) return send(res, 400, { error: 'Missing address' });
  const key = env('GOOGLE_MAPS_API_KEY');
  try {
    if (key) {
      if (env('SUPABASE_URL') && !(await caller(req))) return send(res, 401, { error: 'Sign in to look up addresses' });
      const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=us&key=${key}`);
      const j = await r.json();
      const hit = j.results && j.results[0];
      if (!hit) return send(res, 404, { error: 'Address not found' });
      return send(res, 200, { lat: hit.geometry.location.lat, lng: hit.geometry.location.lng, display: hit.formatted_address });
    }
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'BrokersBestie/0.1 (https://brokersbestie.app)' }
    });
    const j = await r.json();
    if (!j[0]) return send(res, 404, { error: 'Address not found' });
    return send(res, 200, { lat: Number(j[0].lat), lng: Number(j[0].lon), display: j[0].display_name });
  } catch (e) {
    return send(res, 502, { error: 'Address lookup is not answering' });
  }
}
