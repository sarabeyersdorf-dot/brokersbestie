// The lockbox buddy (Sara picked the mascot, 2026-10-23; art from Cowork's
// spec). One drawing box, viewBox 0 0 120 140: a shackle, a yellow body, and a
// face per mood. Pure strings, no DOM, so the same art is used in the picker,
// on tour stops, in the safety check-in and in tests.

const INK = '#202428';
const SHACKLE_CLOSED = 'M38 52 V34 A22 22 0 0 1 82 34 V52';
const SHACKLE_OPEN = 'M38 40 V22 A22 22 0 0 1 82 22 V30';
const line = (d, w) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round"/>`;
const heart = (x, y) => `<g transform="translate(${x} ${y})"><path class="bb-heart" d="M12 23 C2 15 0 9 2 5 C4 0 10 0 12 6 C14 0 20 0 22 5 C24 9 22 15 12 23 Z" fill="#E5484D"/></g>`;
const star = (x, y) => `<path transform="translate(${x} ${y})" d="M0 -12 L3.5 -3.5 L12 -3.5 L5 2 L7.5 11 L0 5.5 L-7.5 11 L-5 2 L-12 -3.5 L-3.5 -3.5 Z" fill="${INK}"/>`;

// key, label, face, open shackle?
export const REACTIONS = [
  ['love', 'Loved it', heart(26, 64) + heart(72, 64) + `<path d="M38 98 H82 Q82 121 60 121 Q38 121 38 98 Z" fill="${INK}"/>`],
  ['like', 'Liked it', line('M30 80 Q40 69 50 80', 6) + line('M70 80 Q80 69 90 80', 6) + line('M40 101 Q60 118 80 101', 7)],
  ['maybe', 'On the fence', `<rect x="32" y="72" width="16" height="14" rx="5" fill="${INK}"/><rect x="72" y="74" width="16" height="10" rx="4" fill="${INK}"/>` + line('M70 64 L90 58', 5) + line('M44 109 L78 104', 7)],
  ['nope', 'Not for us', `<circle cx="40" cy="82" r="6" fill="${INK}"/><circle cx="80" cy="82" r="6" fill="${INK}"/>` + line('M30 72 L48 66', 5) + line('M72 66 L90 72', 5) + line('M42 115 Q60 101 78 115', 7)],
  ['pricey', 'Too pricey', `<text x="40" y="91" text-anchor="middle" font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-size="30" font-weight="800" fill="${INK}">$</text><text x="80" y="91" text-anchor="middle" font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-size="30" font-weight="800" fill="${INK}">$</text><rect x="38" y="100" width="44" height="18" rx="5" fill="${INK}"/><path d="M38 109 H82 M49 100 V118 M60 100 V118 M71 100 V118" stroke="#F5C93E" stroke-width="2.5"/>`],
  ['work', 'Needs work', line('M30 80 L48 80', 6) + line('M72 80 L90 80', 6) + line('M38 108 Q45 100 52 108 Q60 116 68 108 Q75 100 82 108', 6) + `<path d="M100 58 Q107 69 100 74 Q93 69 100 58 Z" fill="#7CC8F0"/>`],
  ['again', 'See it again', `<circle cx="40" cy="80" r="10" fill="${INK}"/><circle cx="80" cy="80" r="10" fill="${INK}"/><circle cx="44" cy="76" r="3.5" fill="#fff"/><circle cx="84" cy="76" r="3.5" fill="#fff"/><circle cx="60" cy="110" r="7" fill="none" stroke="${INK}" stroke-width="5"/><circle cx="102" cy="52" r="15" fill="#E5484D"/><text x="102" y="59" text-anchor="middle" font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-size="20" font-weight="800" fill="#fff">2</text>`],
  ['offer', 'Writing an offer', star(40, 79) + star(80, 79) + `<path d="M36 98 H84 Q84 122 60 122 Q36 122 36 98 Z" fill="${INK}"/><path class="bb-spark" d="M98 14 V26 M92 20 H104 M106 36 L112 32" stroke="#1FBFAE" stroke-width="4" stroke-linecap="round" fill="none"/>`, true]
];
export const REACTION_KEYS = REACTIONS.map(([k]) => k);
export const reactionLabel = (k) => (REACTIONS.find(([v]) => v === k) || [])[1] || '';

// The gentle "You OK?" face for the safety check-in: friendly, not worried.
const OK_FACE = line('M30 66 Q39 60 48 65', 4.5) + line('M72 65 Q81 60 90 66', 4.5)
  + `<circle cx="40" cy="80" r="8" fill="${INK}"/><circle cx="80" cy="80" r="8" fill="${INK}"/><circle cx="43" cy="77" r="2.6" fill="#fff"/><circle cx="83" cy="77" r="2.6" fill="#fff"/>`
  + line('M48 104 Q60 112 72 104', 6) + `<circle cx="24" cy="98" r="5" fill="#F29BA0"/><circle cx="96" cy="98" r="5" fill="#F29BA0"/>`;

// The winking "Hey bestie" face: the app icon.
const WINK_FACE = `<rect x="30" y="68" width="20" height="18" rx="5" fill="${INK}"/>` + line('M70 79 Q80 69 90 79', 6) + line('M38 102 Q60 120 82 102', 7) + `<circle cx="98" cy="96" r="5" fill="#E5484D"/>`;

function buddy(face, { size = 48, open = false, onDark = false, label = '' } = {}) {
  const shackle = onDark ? '#FFFFFF' : INK;
  const h = Math.round(size * 140 / 120);
  return `<svg viewBox="0 0 120 140" width="${size}" height="${h}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}><path d="${open ? SHACKLE_OPEN : SHACKLE_CLOSED}" fill="none" stroke="${shackle}" stroke-width="10" stroke-linecap="round"/><rect x="10" y="48" width="100" height="84" rx="18" fill="#F5C93E"/>${face}</svg>`;
}

export function reactionFace(kind, opts = {}) {
  const r = REACTIONS.find(([k]) => k === kind);
  return r ? buddy(r[2], { ...opts, open: !!r[3], label: opts.label ?? r[1] }) : '';
}
export const okFace = (opts = {}) => buddy(OK_FACE, opts);
export const winkFace = (opts = {}) => buddy(WINK_FACE, opts);

// The app icon, 512 square, art inside the centre 80% so it is maskable-safe.
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${INK}"/><g transform="translate(256 262) scale(2.3) translate(-60 -73)"><path d="${SHACKLE_CLOSED}" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round"/><rect x="10" y="48" width="100" height="84" rx="18" fill="#F5C93E"/>${WINK_FACE}</g></svg>`;
