// Listing Prep (2026-11-06, step 1 of 5): the one definition of a walk-through.
// Sara's Listing Walk-Through and James's Walkthrough spec, combined into one
// feature (Sara: "combine them into one feature, call it Listing Prep"). One
// walk, room by room, with photos and notes; later steps turn it into the
// seller's Listing Prep Report, the agent's notes for the AVID, and the MLS
// sheet. Pure: no DOM, no store, so it is tested on its own.
//
// Never call any of this a "disclosure" or an "AVID" on screen (James's legal
// guardrail, kept on purpose): it is the agent's own notes.

// The AVID's own sections, in its order. Every area files under one of them,
// so the notes for the AVID (step 3) come out in the form's order.
export const SECTIONS = [
  { id: 'entry', label: 'Entry' },
  { id: 'living', label: 'Living Room' },
  { id: 'dining', label: 'Dining Room' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'other_room', label: 'Other Room' },
  { id: 'hall', label: 'Hall/Stairs' },
  { id: 'bedroom', label: 'Bedrooms' },
  { id: 'bath', label: 'Baths' },
  { id: 'other', label: 'Other' },
  { id: 'garage', label: 'Garage/Parking' },
  { id: 'exterior', label: 'Exterior Building and Yard' },
  { id: 'conditions', label: 'Other Observed or Known Conditions' }
];
const SECTION_ORDER = Object.fromEntries(SECTIONS.map((s, i) => [s.id, i]));

// Areas a walk can add beyond the starting list (James's PPN chips, rural ones
// included: they are what foothill agents need), each filed under its section.
export const EXTRA_AREAS = [
  ['Family Room', 'other_room'], ['Office', 'other_room'], ['Bonus Room', 'other_room'], ['Laundry', 'other_room'],
  ['Attic', 'other'], ['Basement', 'other'], ['Crawlspace', 'other'],
  ['Electrical Panel', 'other'], ['Water Heater', 'other'], ['HVAC', 'other'],
  ['Roof', 'exterior'], ['Deck / Patio', 'exterior'], ['Yard', 'exterior'], ['Driveway', 'exterior'], ['Fence', 'exterior'],
  ['Well / Water', 'other'], ['Septic', 'other'], ['Propane', 'other'], ['Solar', 'other'],
  ['Outbuilding', 'other'], ['Land / Acreage', 'exterior']
].map(([name, section]) => ({ name, section }));

// Things seen in nearly every house: one tap adds the words to the area's notes.
export const QUICK_TAPS = ['Stains', 'Cracks', 'Wear on carpet', 'Broken window', 'Water damage', 'Missing trim'];

// What a photo or note is about (James's PPN categories).
export const CATEGORIES = [
  { id: 'listing_prep', label: 'Listing prep' },
  { id: 'question', label: 'Question' },
  { id: 'showing', label: 'Showing note' },
  { id: 'repair', label: 'Repair / issue' },
  { id: 'feature', label: 'Feature' },
  { id: 'other', label: 'Other' }
];
export const categoryLabel = (id) => (CATEGORIES.find((c) => c.id === id) || {}).label || '';

// A listing photo can go to the MLS; a condition photo (a defect) never does.
export const PHOTO_KINDS = [
  { id: 'listing', label: 'Listing photo' },
  { id: 'condition', label: 'Condition photo' }
];

export const OCCUPANTS = [['owner', 'Owner'], ['tenant', 'Tenant'], ['vacant', 'Vacant']];
export const PROPERTY_TYPES = [
  ['sfr', 'Single family'], ['condo', 'Condo'], ['mh_land', 'Manufactured home on land'],
  ['mh_park', 'Manufactured home in park'], ['multi', 'Multi-unit (2 to 4)'], ['land', 'Land']
];

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// The starting list for a house: the AVID's sections with one area each, and
// one per bedroom and bath. Land starts with the outside only.
export function defaultAreas({ beds = 3, baths = 2, type = 'sfr' } = {}) {
  const b = Math.max(0, Math.min(12, Math.round(Number(beds) || 0)));
  const ba = Math.max(0, Math.min(10, Math.round(Number(baths) || 0)));
  const list = [];
  const add = (name, section) => list.push({ key: slug(name), name, section, nothing: false });
  if (type === 'land') {
    add('Land / Acreage', 'exterior');
    add('Other Observed or Known Conditions', 'conditions');
    return list;
  }
  add('Entry', 'entry');
  add('Living Room', 'living');
  add('Dining Room', 'dining');
  add('Kitchen', 'kitchen');
  add('Other Room', 'other_room');
  add('Hall/Stairs', 'hall');
  for (let i = 1; i <= b; i++) add(`Bedroom ${i}`, 'bedroom');
  for (let i = 1; i <= ba; i++) add(`Bath ${i}`, 'bath');
  add('Other', 'other');
  add('Garage/Parking', 'garage');
  add('Exterior Building and Yard', 'exterior');
  add('Other Observed or Known Conditions', 'conditions');
  return list;
}

// Areas in the AVID's order; within a section, the order they were added.
export function sortAreas(areas) {
  return (areas || []).map((a, i) => [a, i])
    .sort((x, y) => (SECTION_ORDER[x[0].section] ?? 99) - (SECTION_ORDER[y[0].section] ?? 99) || x[1] - y[1])
    .map(([a]) => a);
}

// Add an area. "bedroom" / "bath" / "other" number themselves ("Bedroom 4");
// anything else is a named area (an extra chip, or typed). A name already on
// the list gets a number rather than a duplicate key.
export function addArea(areas, what, section) {
  const list = [...(areas || [])];
  const keys = new Set(list.map((a) => a.key));
  let name;
  let sec = section;
  if (what === 'bedroom' || what === 'bath') {
    const word = what === 'bedroom' ? 'Bedroom' : 'Bath';
    const n = list.filter((a) => a.section === what).length + 1;
    name = `${word} ${n}`;
    sec = what;
  } else if (what === 'other') {
    const n = list.filter((a) => a.section === 'other' && /^Other( \d+)?$/.test(a.name)).length + 1;
    name = n === 1 ? 'Other' : `Other ${n}`;
    sec = 'other';
  } else {
    name = String(what || '').trim().slice(0, 40);
    if (!name) return list;
    const extra = EXTRA_AREAS.find((e) => e.name.toLowerCase() === name.toLowerCase());
    sec = sec || (extra ? extra.section : 'other');
  }
  const base = name;
  for (let i = 2; keys.has(slug(name) || 'area'); i++) name = `${base} ${i}`;
  const key = slug(name) || 'area';
  list.push({ key, name, section: SECTIONS.some((s) => s.id === sec) ? sec : 'other', nothing: false });
  return list;
}

// Remove an area only when nothing is filed under it (no lost notes or photos).
export function canRemoveArea(area, items) {
  return !(items || []).some((i) => i.area === area.key && !i.deleted_at) && !String(area.notes || '').trim();
}

// Where an area stands: photos, notes, "nothing observed", done.
export function areaStatus(area, items) {
  const mine = (items || []).filter((i) => i.area === area.key && !i.deleted_at);
  const photos = mine.filter((i) => i.photo_id).length;
  const notes = mine.filter((i) => String(i.note || '').trim()).length + (String(area.notes || '').trim() ? 1 : 0);
  const done = !!area.nothing || photos > 0 || notes > 0;
  return { photos, notes, nothing: !!area.nothing, done };
}

// The walk as a whole: how many areas are done, and how many photos are still
// waiting to reach the team (taken with no signal, kept on the phone).
export function prepSummary(prep, items) {
  const areas = (prep && prep.areas) || [];
  const live = (items || []).filter((i) => i.prep_id === (prep && prep.id) && !i.deleted_at);
  const done = areas.filter((a) => areaStatus(a, live).done).length;
  return {
    areas: areas.length,
    done,
    left: areas.length - done,
    photos: live.filter((i) => i.photo_id).length,
    listing: live.filter((i) => i.photo_id && i.photo_kind === 'listing').length,
    condition: live.filter((i) => i.photo_id && i.photo_kind === 'condition').length,
    followUps: live.filter((i) => i.follow_up).length,
    waiting: waitingPhotos(live).length
  };
}

// Photos taken but not yet stored with the team. They stay on this phone until
// the upload is confirmed, so a dropped signal never loses one.
export const waitingPhotos = (items) => (items || []).filter((i) => i.photo_id && !i.photo_path && !i.deleted_at && !i.sample);

export function waitingWords(n) {
  if (!n) return '';
  return `${n} photo${n === 1 ? '' : 's'} waiting to upload`;
}

// Tap a quick item: add its words to the notes once (never twice).
export function addTap(notes, tap) {
  const text = String(notes || '').trim();
  if (new RegExp(`(^|[.;,]\\s*)${tap.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([.;,]|$)`, 'i').test(text)) return text;
  return text ? `${text.replace(/[.;,]?$/, '.')} ${tap}.` : `${tap}.`;
}

// When a photo was taken: the camera's time when the phone gives one (a photo
// picked from the library keeps its own time), else now.
export function takenAt(file, now = new Date()) {
  const t = Number(file && file.lastModified);
  if (t && t < now.getTime() + 60000 && t > Date.UTC(2000, 0, 1)) return new Date(t).toISOString();
  return now.toISOString();
}

// The agent's walks for a property, newest first. A duplex to fourplex can
// have one per unit.
export function prepsFor(preps, propertyId) {
  return (preps || []).filter((p) => p.property_id === propertyId).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

// The next unit label for a multi-unit property ("Unit 2").
export function nextUnit(preps) {
  return `Unit ${(preps || []).length + 1}`;
}
