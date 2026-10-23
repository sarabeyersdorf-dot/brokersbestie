// Ways to spell one address for the map lookup. Rural highway addresses are
// where free geocoders fail ("433 E Hwy 4 Murphys" found nothing, Sara's test
// 2026-10-23), so try the forms people and maps actually use, then fall back
// to the town itself, marked approximate, which is enough to order a route.
// Pure, so test/geo.test.mjs can check it.

const EXPAND = [
  [/\bhwy\.?(?=\s*\d)/gi, 'Highway'], [/\bst\.?$/i, 'Street'], [/\brd\.?\b/gi, 'Road'], [/\bln\.?\b/gi, 'Lane'],
  [/\bdr\.?\b/gi, 'Drive'], [/\bct\.?\b/gi, 'Court'], [/\bave\.?\b/gi, 'Avenue'], [/\bcir\.?\b/gi, 'Circle']
];
const DIRS = { e: 'East', w: 'West', n: 'North', s: 'South' };

export function normalizeState(q, state = 'CA') {
  let s = String(q || '').trim().replace(/\s+/g, ' ').replace(/['’]s\b/g, 's');
  s = s.replace(/,\s*([a-z]{2})\s*(\d{5})?\s*$/i, (m, st, zip) => `, ${st.toUpperCase()}${zip ? ' ' + zip : ''}`);
  if (!/,\s*[A-Z]{2}\b|\b\d{5}\b/.test(s)) s = `${s}, ${state}`;
  return s;
}

// "433 E Hwy 4 Murphys, CA" -> "Murphys, CA": whatever follows the street.
export function townOf(q) {
  const s = String(q || '').trim();
  const street = s.match(/^\d+\s+(?:[NSEW]\.?\s+)?(?:(?:hwy|highway|sr|state route|route|ca-?)\s*\d+|.*?\b(?:st|street|rd|road|dr|drive|ln|lane|ave|avenue|ct|court|way|cir|circle|pl|place|blvd|boulevard|trl|trail|loop|grade|pkwy|parkway)\b\.?)\s*,?\s*(.+)$/i);
  const rest = street ? street[1] : (s.includes(',') ? s.slice(s.indexOf(',') + 1) : '');
  const town = rest.replace(/^[\s,]+/, '').trim();
  return town && !/^[A-Z]{2}$/.test(town) ? town : '';
}

export function addressVariants(q, state = 'CA') {
  const base = normalizeState(q, state);
  const out = [base];
  let long = base;
  for (const [re, to] of EXPAND) long = long.replace(re, to);
  long = long.replace(/^(\d+)\s+([NSEW])\.?\s+/i, (m, n, d) => `${n} ${DIRS[d.toLowerCase()]} `);
  out.push(long);
  const hwy = long.match(/\bHighway\s+(\d+)\b/i);
  if (hwy) {
    out.push(long.replace(/\bHighway\s+(\d+)\b/i, 'State Route $1'));
    out.push(long.replace(/\bHighway\s+(\d+)\b/i, `${state}-$1`));
    out.push(long.replace(/^(\d+)\s+(East|West|North|South)\s+/i, '$1 '));
  }
  return [...new Set(out)];
}
