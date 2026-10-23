// Route planning: order the stops of a tour so the drive is short and every
// fixed showing window is met. Pure functions, no DOM, so they are tested in
// test/route.test.mjs.

const EARTH_MILES = 3958.8;
// Straight-line distance understates a foothills drive. These turn it into an
// estimate; Google Maps (opened from the tour) gives the real figure.
export const ROAD_FACTOR = 1.35;
export const AVG_MPH = 40;
export const MINUTES_PER_STOP = 20;
const MAX_EXACT = 8; // 8! = 40,320 orders, still instant on a phone

export function haversineMiles(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.sqrt(h));
}

export function roadMiles(a, b) {
  return haversineMiles(a, b) * ROAD_FACTOR;
}

export function driveMinutes(miles) {
  return Math.round((miles / AVG_MPH) * 60);
}

// "11:30", "11:30 am", "2pm", "14:05" -> minutes after midnight, or null.
export function parseClock(text) {
  if (text == null) return null;
  const m = String(text).trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3] ? m[3][0] : null;
  if (h > 23 || min > 59) return null;
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  // A bare "1:30" on a showing tour means the afternoon, not 1:30 in the morning.
  if (!ap && h >= 1 && h <= 6) h += 12;
  return h * 60 + min;
}

export function formatClock(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${h24 < 12 ? 'AM' : 'PM'}`;
}

// Walk an order from the start, filling in arrival times and drive legs.
// A stop with `at` (minutes) is a fixed window: arriving early means waiting,
// arriving late costs lateness. Returns the schedule and its cost parts.
export function schedule(start, startMinutes, stops, perStop = MINUTES_PER_STOP) {
  let clock = startMinutes;
  let prev = start;
  let miles = 0;
  let late = 0;
  const legs = stops.map((s) => {
    const legMiles = prev && s.lat != null && prev.lat != null ? roadMiles(prev, s) : 0;
    const legMin = driveMinutes(legMiles);
    clock += legMin;
    // Per stop, so the screen can say "early: wait 15 min" or "15 min late".
    let waitMinutes = 0;
    let lateMinutes = 0;
    if (s.at != null) {
      if (clock < s.at) { waitMinutes = s.at - clock; clock = s.at; }
      else { lateMinutes = clock - s.at; late += lateMinutes; }
    }
    const arrive = clock;
    clock += s.minutes || perStop;
    miles += legMiles;
    prev = s;
    return { ...s, arrive, legMiles, legMinutes: legMin, waitMinutes, lateMinutes };
  });
  return { legs, miles, late, end: clock };
}

// The agent's own order, kept exactly as given (dragged on the screen), with
// times worked out along it. Stops the map could not place stay where put.
export function routeInOrder({ start, startMinutes, stops }) {
  const result = schedule(start, startMinutes, stops);
  const best = planRoute({ start, startMinutes, stops });
  return {
    ...result,
    unplaced: stops.filter((s) => s.lat == null || s.lng == null),
    // How much Bestie's order would save, so the screen can offer it back.
    bestSavesMinutes: Math.max(0, (result.end - best.end)),
    savedMiles: 0,
    savedMinutes: 0
  };
}

function permutations(items) {
  if (items.length <= 1) return [items.slice()];
  const out = [];
  items.forEach((x, i) => {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const p of permutations(rest)) out.push([x, ...p]);
  });
  return out;
}

// Sara's rule from the route-sheet template: one continuous path, no driving
// out and coming back. A stop that returns to an area already visited (and
// left) costs extra, so a town's stops stay together even when doubling back
// would save a mile.
const SAME_AREA_MILES = 2;
const BACKTRACK_PENALTY = 5;

function backtracks(legs) {
  let n = 0;
  for (let i = 2; i < legs.length; i++) {
    if (legs[i].lat == null || legs[i - 1].lat == null) continue;
    if (haversineMiles(legs[i - 1], legs[i]) <= SAME_AREA_MILES) continue;
    for (let j = 0; j < i - 1; j++) {
      if (legs[j].lat != null && haversineMiles(legs[j], legs[i]) <= SAME_AREA_MILES) { n++; break; }
    }
  }
  return n;
}

// Cost: missing a window an agent gave you is far worse than a few miles.
function cost(result) {
  return result.miles + result.late * 2 + backtracks(result.legs) * BACKTRACK_PENALTY;
}

function nearestNeighbour(start, stops) {
  const left = stops.slice();
  const out = [];
  let at = start;
  while (left.length) {
    let best = 0;
    left.forEach((s, i) => {
      if (roadMiles(at, s) < roadMiles(at, left[best])) best = i;
    });
    at = left.splice(best, 1)[0];
    out.push(at);
  }
  return out;
}

// Improve an order by reversing stretches of it while that helps.
function twoOpt(start, startMinutes, order) {
  let best = order;
  let bestCost = cost(schedule(start, startMinutes, best));
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const next = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
        const c = cost(schedule(start, startMinutes, next));
        if (c + 1e-9 < bestCost) {
          best = next;
          bestCost = c;
          improved = true;
        }
      }
    }
  }
  return best;
}

// Stops without coordinates cannot be placed; they are kept, at the end, and
// reported so the screen can say which addresses it could not find.
export function planRoute({ start, startMinutes, stops }) {
  const placed = stops.filter((s) => s.lat != null && s.lng != null);
  const unplaced = stops.filter((s) => s.lat == null || s.lng == null);
  let order;
  if (!start || placed.length <= 1) {
    order = placed.slice();
  } else if (placed.length <= MAX_EXACT) {
    let best = null;
    for (const p of permutations(placed)) {
      const c = cost(schedule(start, startMinutes, p));
      if (!best || c < best.c) best = { p, c };
    }
    order = best.p;
  } else {
    order = twoOpt(start, startMinutes, nearestNeighbour(start, placed));
  }
  const result = schedule(start, startMinutes, order.concat(unplaced));
  const asGiven = schedule(start, startMinutes, placed.concat(unplaced));
  return {
    ...result,
    unplaced,
    savedMiles: Math.max(0, asGiven.miles - result.miles),
    savedMinutes: Math.max(0, driveMinutes(asGiven.miles) - driveMinutes(result.miles))
  };
}

// One link that opens the whole route in Google Maps, stops in order.
export function mapsUrl(start, stops) {
  const enc = (p) => encodeURIComponent(p.address || `${p.lat},${p.lng}`);
  const parts = [start, ...stops].filter(Boolean).map(enc);
  return `https://www.google.com/maps/dir/${parts.join('/')}`;
}
