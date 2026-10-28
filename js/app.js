// Brokers Bestie: every screen. Hash routes (#/, #/p/<id>, #/tours …) so the
// back button, bookmarks and a home-screen launch all land where expected.

import * as store from './store.js';
import { APP_VERSION, SUPPORT_EMAIL } from './config.js';
import { html, raw, str, esc, icon, money, fullMoney, digits, prettyPhone, smsLink, mapLink, todayIso, daysFrom, niceDate, whenText, toast, undoToast, copy } from './ui.js';
import { planRoute, routeInOrder, mapsUrl, formatClock, parseClock, haversineMiles, roadMiles, driveMinutes } from './route.js';
import { parseTourText, matchProperty, search, tripsCsv, mergeSpeech } from './parse.js';
import { sampleData } from './sample.js';
import { sheetChanges, sheetExtras, sheetNoteText, actionPlan, EVENT_KINDS } from './assist.js';
import { chooseFromDropbox, dropboxReady } from './dropbox.js';
import { planShowings, ACTION_WORDS } from './showings.js';
import { plansOffered, planSentence } from './billing.js';
import { CONTACT_KINDS, parseContacts, planImport, contactsChoice, contactsMode } from './contacts.js';
import { CRM_CHOICES } from './crmlist.js';
import { feedbackText, requestGroups, requestText, recapText, ohThanksText, visitorsCsv, signOff, licenseText, sellerUpdateText, feedbackRequestText, lateText, lateBuyerText } from './messages.js';
import { installCard, wireInstall, isInstalled, feedbackLink } from './install.js';
import { pushState, currentSub, turnOn, turnOff, sendTest, LEADS, serverStatus, safetyCall, openHouseLink, shareWhere, shareLink, stopShareLinks } from './push.js';
import { REACTIONS, reactionFace, reactionLabel, okFace, winkFace } from './faces.js';
import { dayItems, agenda, briefing, briefingText, addDays, timeToMinutes, minutesToTime, COLOR_KINDS, itemKind, isLate, filterItems, PROP_SORTS, sortProps, isWhose, teamNames, firstName, bookedSummary, whenSaid, buyers, buyerOf, buyerKey, sellerStats, sellerUpdatesDue, sellerUpdatesPastDue, doorCodes, headsUp, feedbackDue, taxYear, taxCsv } from './brief.js';

const $view = document.getElementById('view');
const $nav = document.getElementById('nav');
const $fab = document.getElementById('fab');

// ---------- vocabulary ----------

const STATUS = {
  listing: 'My listing', prep: 'Coming soon', escrow: 'In escrow', tour: "Other agent's", closed: 'Closed', cancelled: 'Canceled'
};
const LIVE = ['listing', 'prep', 'escrow', 'tour'];

// What can be added in one tap. `table` says where it is filed.
const KINDS = {
  lockbox: { label: 'Lockbox', icon: 'lockbox', table: 'access', code: 'Box # or combo', where: 'Hose bib by the porch', tracked: true, y: true },
  gate: { label: 'Gate code', icon: 'gate', table: 'access', code: 'Code', where: 'Keypad on the left post', y: true },
  alarm: { label: 'Alarm', icon: 'alarm', table: 'access', code: 'Code', where: 'Panel inside the garage door', y: true },
  door: { label: 'Door keypad', icon: 'door', table: 'access', code: 'Code', where: 'Side door by the garage', y: true },
  key: { label: 'Hidden key', icon: 'key', table: 'access', where: 'Under the planter by the steps', y: true },
  sign: { label: 'Sign', icon: 'sign', table: 'access', name: 'Sign + riders', where: 'Street corner, east side', tracked: true },
  utility: { label: 'Well / septic / shut-offs', short: 'Utilities', icon: 'water', table: 'access', name: 'What', where: 'Back lawn, 20 ft off the deck' },
  photo: { label: 'Photo', icon: 'photo', table: 'access', name: 'Caption', where: 'Where it is' },
  note: { label: 'Note', icon: 'mic', table: 'notes' },
  feedback: { label: 'Showing feedback', short: 'Feedback', icon: 'chat', table: 'notes' },
  receipt: { label: 'Receipt', icon: 'receipt', table: 'expenses' },
  contact: { label: 'Contact', icon: 'person', table: 'people' }
};
const CODE_KINDS = ['gate', 'alarm', 'door', 'lockbox', 'key'];
const TODAY_TILES = ['lockbox', 'gate', 'alarm', 'sign', 'photo', 'note', 'receipt'];

// ---------- small shared pieces ----------

const props = () => store.all('properties');
const prop = (id) => store.get('properties', id);
const addr = (id) => (prop(id) || {}).address || '';

function header({ back, kicker, title, sub, right, extra }) {
  return html`<header class="top">
    <div class="top-row">
      ${back ? html`<a class="back" href="${back}">${icon('back', 18)}Back</a>` : html`<div class="brand">${raw(winkFace({ size: 26, onDark: true, label: '' }))}<span class="brand-name">Brokers <span>Bestie</span></span></div>`}
      ${right || html`<span></span>`}
    </div>
    ${kicker ? html`<div class="kicker">${kicker}</div>` : ''}
    ${title ? html`<div class="title">${title}</div>` : ''}
    ${sub ? html`<div class="sub">${sub}</div>` : ''}
    ${extra || ''}
  </header><div class="bar"></div>`;
}

function modeBadge() {
  if (!store.cloud.enabled) return html`<a class="mode off" href="#/settings">ON THIS PHONE</a>`;
  if (!store.cloud.user) return html`<a class="mode off" href="#/settings">SIGN IN</a>`;
  const label = { syncing: 'SYNCING', error: 'WILL RETRY', synced: 'TEAM · SAVED' }[store.cloud.status] || 'TEAM';
  return html`<a class="mode" href="#/settings">${label}</a>`;
}

// The lockbox buddy in an empty spot (2026-10-27): friendlier than a bare line.
function buddy(text, mood = 'wink') {
  const face = mood === 'wink' ? winkFace({ size: 64, label: '' }) : mood === 'ok' ? okFace({ size: 64, label: '' }) : reactionFace(mood, { size: 64, label: '' });
  return html`<div class="buddy-empty">${raw(face)}<span>${text}</span></div>`;
}

// Occupied or vacant on every tour stop (2026-10-28): no color of its own.
// OCCUPIED is a solid badge with a small person; VACANT is an outline. Not
// known shows nothing (a lone "?" read like an error, 2026-10-27).
function occBadge(o, { big = false, extra = '' } = {}) {
  if (o !== 'O' && o !== 'V') return '';
  const word = o === 'O' ? 'Occupied' : 'Vacant';
  return html`<span class="occb ${o === 'O' ? 'solid' : ''} ${big ? 'big' : ''}" title="${word}">${o === 'O' ? icon('person', big ? 22 : 12) : ''}${word}${extra ? ` · ${extra}` : ''}</span>`;
}
const occWord = (o) => (o === 'O' ? 'Occupied' : o === 'V' ? 'Vacant' : '');

function badges(p, onDark) {
  const occ = occBadge(p.occupancy);
  return html`<span class="badges">${occ}${p.well ? html`<span class="dot w" title="Well">W</span>` : ''}${p.septic ? html`<span class="dot s" title="Septic">S</span>` : ''}${onDark ? '' : ''}</span>`;
}

function codesOf(pid) {
  return store.where('access', 'property_id', pid).filter((a) => CODE_KINDS.includes(a.kind) || a.code);
}

function codeBoxes(list) {
  if (!list.length) return '';
  return html`<div class="codes">${list.map((a) => html`<button class="code${a.code ? '' : ' none'}" data-copy="${a.code || a.label || ''}" type="button">
    <span class="k"><span>${a.code ? a.label || KINDS[a.kind]?.label || a.kind : KINDS[a.kind]?.label || a.kind}</span><span>Copy</span></span>
    <span class="v">${a.code || a.label || '—'}</span>
    ${a.location_note ? html`<span class="w">${a.location_note}</span>` : ''}
  </button>`)}</div>`;
}

function personRow(m) {
  return html`<div class="row">
    <button class="grow" type="button" data-edit-person="${m.id}" style="background:none;border:0;text-align:left;padding:0">
      <span class="t">${m.name}</span><span class="s">${[m.role, prettyPhone(m.phone)].filter(Boolean).join(' · ')}</span>
    </button>
    ${m.phone ? html`<a class="icon-btn" href="tel:${digits(m.phone)}" aria-label="Call ${m.name}">${icon('phone', 18)}</a>
    <a class="icon-btn" href="${smsLink(m.phone)}" aria-label="Text ${m.name}">${icon('text', 18)}</a>` : ''}
  </div>`;
}

// Wire up the bits every screen shares: copy buttons, data-go links.
function wire(root) {
  root.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const v = b.getAttribute('data-copy');
    if (!v) return;
    toast((await copy(v)) ? `Copied ${v}` : v);
  }));
}

// ---------- location ----------

let lastFix = null;
function locate({ quiet } = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    if (lastFix && Date.now() - lastFix.t < 60000) return resolve(lastFix);
    navigator.geolocation.getCurrentPosition(
      (pos) => { lastFix = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() }; shareWhere(lastFix); resolve(lastFix); },
      () => { if (!quiet) toast('Could not get your location'); resolve(null); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}
async function locationAllowed() {
  try {
    const s = await navigator.permissions.query({ name: 'geolocation' });
    return s.state === 'granted';
  } catch { return false; }
}
// Within a quarter mile counts as "at" the property.
function nearest(fix, maxMiles = 0.25) {
  if (!fix) return null;
  let best = null;
  for (const p of props()) {
    if (p.lat == null || !LIVE.includes(p.status)) continue;
    const d = haversineMiles(fix, p);
    if (d <= maxMiles && (!best || d < best.d)) best = { p, d };
  }
  return best;
}

// ---------- sheet (pop-up form) ----------

function openSheet(content, mount) {
  closeSheet();
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${str(content)}</div>`;
  back.addEventListener('click', (e) => { if (e.target === back) closeSheet(); });
  document.body.appendChild(back);
  const sheet = back.firstChild;
  wire(sheet);
  if (mount) mount(sheet);
  const first = sheet.querySelector('input,textarea,select');
  if (first && !('ontouchstart' in window)) first.focus();
  return sheet;
}
let pendingRender = false;
function closeSheet() {
  const open = document.querySelectorAll('.sheet-back');
  open.forEach((n) => n.remove());
  if (open.length && pendingRender && !(current && current.form)) {
    pendingRender = false;
    render();
  }
}

// fields: [{ name, label, type, options, placeholder, hint }]
function fieldHtml(f, v) {
  const val = v ?? '';
  if (f.type === 'select') {
    return html`<label class="field"><span>${f.label}</span><select name="${f.name}">${f.options.map(([k, l]) => html`<option value="${k}" ${String(val) === String(k) ? raw('selected') : ''}>${l}</option>`)}</select></label>`;
  }
  if (f.type === 'check') {
    return html`<label class="switch"><input type="checkbox" name="${f.name}" ${val ? raw('checked') : ''}>${f.label}</label>`;
  }
  if (f.type === 'textarea') {
    return html`<label class="field"><span>${f.label}</span><textarea name="${f.name}" placeholder="${f.placeholder || ''}">${val}</textarea>${f.mic ? html`<button class="btn" type="button" data-mic="${f.name}">${icon('mic', 18)}Talk instead of typing</button>` : ''}</label>`;
  }
  const type = f.type === 'code' ? 'text' : f.type || 'text';
  return html`<label class="field"><span>${f.label}</span><input name="${f.name}" type="${type}" ${f.type === 'code' ? raw('class="codein" autocomplete="off"') : ''} ${type === 'number' ? raw('inputmode="decimal" step="any"') : ''} ${type === 'tel' ? raw('inputmode="tel"') : ''} value="${val}" placeholder="${f.placeholder || ''}">${f.hint ? html`<span class="hint">${f.hint}</span>` : ''}</label>`;
}

function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    const el = form.elements[f.name];
    if (!el) continue;
    if (f.type === 'check') out[f.name] = el.checked;
    else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
    else out[f.name] = el.value.trim();
  }
  return out;
}

// Delete with an Undo toast (2026-10-27).
function del(table, id, what = 'Deleted') {
  const gone = store.remove(table, id);
  if (gone) undoToast(what, () => store.restore(gone));
}

function formSheet({ title, fields, values = {}, saveLabel = 'Save', onSave, onDelete, extra }) {
  const sheet = openSheet(html`<form class="sec" novalidate>
    <div class="title" style="font-family:var(--tall);text-transform:uppercase;font-weight:700;font-size:24px">${title}</div>
    ${fields.map((f) => fieldHtml(f, values[f.name]))}
    ${extra || ''}
    <button class="btn dark block" type="submit">${saveLabel}</button>
    ${onDelete ? html`<button class="btn ghost block" type="button" data-del>${icon('trash', 18)}Delete</button>` : ''}
    <button class="btn ghost block" type="button" data-cancel>Cancel</button>
  </form>`, (s) => {
    const form = s.querySelector('form');
    wireMics(s);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ok = await onSave(readForm(form, fields), form);
      if (ok !== false) closeSheet();
    });
    s.querySelector('[data-cancel]').addEventListener('click', closeSheet);
    const del = s.querySelector('[data-del]');
    // No "are you sure?": every delete here comes with Undo.
    if (del) del.addEventListener('click', () => { onDelete(); closeSheet(); });
  });
  return sheet;
}

// ---------- talking instead of typing ----------

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
// Listens one phrase at a time and starts again by itself until the agent taps
// stop. "Keep listening" mode is what made Android Chrome repeat every word;
// mergeSpeech() also drops Android's repeated pieces if they still come.
function dictate(target, button) {
  if (!Recognition) {
    toast('Use the microphone on your keyboard to dictate');
    target.focus();
    return;
  }
  const before = target.value ? target.value.replace(/\s*$/, ' ') : '';
  let chunks = [];
  let listening = true;
  let rec = null;
  let quickEnds = 0;
  let startedAt = 0;
  const show = (list) => {
    target.value = before + list.join(' ');
    target.dispatchEvent(new Event('input'));
  };
  // Runs once: tapping stop and the phone's own "ended" both arrive here, and a
  // second pass would rewrite the box. Nothing heard leaves typed words alone.
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    listening = false;
    if (chunks.length) show(chunks);
    if (button) {
      button.classList.remove('dark');
      button.innerHTML = button.dataset.label;
      button.onclick = () => dictate(target, button);
    }
  };
  const listenOnce = () => {
    rec = new Recognition();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const res = e.results[e.results.length - 1];
      const text = res[0].transcript;
      if (res.isFinal) { chunks = mergeSpeech(chunks, text); show(chunks); }
      else show(mergeSpeech(chunks, text)); // shown while speaking, not kept yet
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        listening = false;
        toast('Allow the microphone to talk to Bestie');
      }
    };
    rec.onend = () => {
      // A phone that keeps ending instantly is refusing to listen: stop
      // rather than spin.
      quickEnds = Date.now() - startedAt < 400 ? quickEnds + 1 : 0;
      if (listening && quickEnds < 5) {
        try { startedAt = Date.now(); rec = null; listenOnce(); return; } catch {}
      }
      finish();
    };
    startedAt = Date.now();
    rec.start();
  };
  if (button) {
    button.dataset.label = button.innerHTML;
    button.classList.add('dark');
    button.innerHTML = 'Listening… tap to stop';
    button.onclick = () => { listening = false; try { rec && rec.stop(); } catch {} finish(); };
  }
  listenOnce();
}
function wireMics(root) {
  root.querySelectorAll('[data-mic]').forEach((b) => {
    const target = root.querySelector(`[name="${b.getAttribute('data-mic')}"]`) || root.querySelector('#' + b.getAttribute('data-mic'));
    b.onclick = () => dictate(target, b);
  });
}

// ---------- server helpers ----------

async function api(path, opts = {}) {
  const token = await store.accessToken().catch(() => null);
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

async function geocode(address) {
  try {
    const state = (store.settings().state || 'CA').trim();
    const r = await api(`/api/geocode?q=${encodeURIComponent(address)}&state=${encodeURIComponent(state)}`);
    return r && r.lat != null ? r : null;
  } catch { return null; }
}

// ======================================================================
// TODAY
// ======================================================================

let searchText = '';
let here = null;

function pickups() {
  const dead = new Set(props().filter((p) => p.status === 'closed' || p.status === 'cancelled').map((p) => p.id));
  return store.all('access').filter((a) => KINDS[a.kind]?.tracked && a.status === 'out' && dead.has(a.property_id));
}

function todoItems() {
  const items = [];
  const t = todayIso();
  for (const x of store.all('tasks')) {
    if (x.done) continue;
    if (x.due && x.due > t) continue;
    items.push({ table: 'tasks', id: x.id, text: x.text, sub: [addr(x.property_id), x.due && x.due < t ? `Was due ${niceDate(x.due)}` : ''].filter(Boolean).join(' · '), pid: x.property_id, ck: 'todo', late: !!(x.due && x.due < t), owner: x.owner || prop(x.property_id)?.owner || null });
  }
  for (const d of store.all('dates')) {
    if (d.done) continue;
    const n = daysFrom(d.due);
    // Due today or overdue only: the week ahead is in the briefing card, and a
    // closing 6 days out is not something to do today.
    if (n == null || n > 0) continue;
    items.push({ table: 'dates', id: d.id, text: `${d.label} · ${addr(d.property_id)}`, sub: n < 0 ? `${-n} days past · confirm it happened` : whenText(d.due), pid: d.property_id, late: n < 0, ck: itemKind({ kind: 'date', title: d.label }), owner: prop(d.property_id)?.owner || null });
  }
  for (const a of pickups()) {
    items.push({ pickup: true, ck: 'todo', pid: a.property_id, owner: prop(a.property_id)?.owner || null, id: a.id, text: `Pick up ${a.label || KINDS[a.kind].label} at ${addr(a.property_id)}`, sub: `${STATUS[prop(a.property_id)?.status] || ''} · ${a.location_note || ''}` });
  }
  for (const tour of store.all('tours').filter((x) => x.date === t && !x.finished)) {
    for (const s of tour.stops || []) {
      if (s.code_pending) items.push({ tour: tour.id, ck: 'showing', owner: tour.owner || null, id: s.id, text: `Get the code for ${s.address}`, sub: s.agent ? `Ask ${s.agent}` : 'Before the tour' });
    }
  }
  return items;
}

// Feedback from the agents who showed my listings (2026-10-27): ask by text,
// then log their answer as a "Showing feedback" note (it goes into the weekly
// seller update).
function feedbackCard() {
  const now = new Date();
  const due = feedbackDue(store.snapshot(), todayIso(), now.getHours() * 60 + now.getMinutes(), firstName(store.settings().myName) || null);
  if (!due.length) return '';
  return html`<div class="card pad sec"><div class="label accent">Showing feedback · ${due.length}</div>
    <div class="small">Agents who showed your listings. Ask them, then log what they said: it goes into the seller update.</div>
    <div class="card list" style="margin-top:8px">${due.slice(0, 6).map(({ event: e, property: p, stage }) => html`<div class="row">
      <span class="grow"><span class="t">${e.showing_agent || 'Showing'} · ${p.address.split(',')[0]}</span><span class="s">${niceDate(e.date)}${stage === 'log' ? ' · asked, waiting to hear back' : ''}</span></span>
      ${stage === 'ask' ? html`<button class="btn dark" type="button" data-fbask="${e.id}" style="min-height:40px">Ask</button>` : html`<button class="btn" type="button" data-fblog="${e.id}" style="min-height:40px">Log it</button>`}
    </div>`)}</div></div>`;
}
function askFeedback(id) {
  const e = store.get('events', id);
  const p = e && prop(e.property_id);
  if (!e || !p) return;
  composeSheet({
    title: 'Ask for feedback',
    sub: `To ${e.showing_agent || 'the agent who showed it'}. When they answer, tap “Log it”.`,
    askContact: true, phone: e.showing_agent_phone || '',
    body: feedbackRequestText({ agent: e.showing_agent, address: p.address, date: e.date, today: todayIso(), profile: myProfile(), me: store.settings().myName }),
    onSent: ({ phone } = {}) => store.save('events', { id, feedback_asked_at: new Date().toISOString(), showing_agent_phone: phone || e.showing_agent_phone || '' })
  });
}
function logFeedback(id) {
  const e = store.get('events', id);
  if (!e) return;
  formSheet({
    title: 'What did they say?',
    fields: [{ name: 'text', label: `${e.showing_agent || 'Their'} feedback`, type: 'textarea', mic: true, placeholder: 'Loved the views, buyers worried about the road' }],
    saveLabel: 'Save feedback',
    onSave(v) {
      if (!v.text.trim()) { toast('Type or say what they said'); return false; }
      store.save('notes', { property_id: e.property_id, text: `Showing feedback: ${v.text.trim()}${e.showing_agent ? ` (${e.showing_agent})` : ''}` });
      store.save('events', { id, feedback_logged_at: new Date().toISOString() });
      toast('Saved. It goes into the next seller update.');
    }
  });
}

// Weekly seller updates waiting (2026-10-27). "Next week" hides the card for 7 days.
// Seller updates live on their own screen (Sara, 2026-10-27: "put seller
// updates on another screen"). Due first (none in 7 days), then the rest.
function viewSellerUpdates() {
  const me = firstName(store.settings().myName) || null;
  const mine = props().filter((p) => p.status === 'listing' && isWhose(p.owner, me));
  const due = sellerUpdatesDue(props(), todayIso(), me);
  const rest = mine.filter((p) => !due.includes(p));
  const row = (p) => html`<button class="row" type="button" data-sellerupd="${p.id}" style="width:100%;text-align:left;background:none;border:0"><span class="grow"><span class="t">${p.address}</span><span class="s">${p.seller_update_at ? 'Last sent ' + niceDate(p.seller_update_at) : 'Not sent yet'}</span></span><span class="btn" style="min-height:38px">${icon('text', 16)}Write it</span></button>`;
  return {
    html: html`${header({ back: '#/', kicker: 'Your listings', title: 'Seller updates' })}
    <main class="wrap">
      <div class="small">Bestie writes each one from your showings, feedback and open houses. You read it, change anything, and send it from your own phone.</div>
      ${due.length ? html`<section class="sec"><div class="label">Due this week · ${due.length}</div><div class="card list">${due.map(row)}</div></section>` : ''}
      ${rest.length ? html`<section class="sec"><div class="label">Sent in the last week · ${rest.length}</div><div class="card list">${rest.map(row)}</div></section>` : ''}
      ${!mine.length ? html`<div class="card">${buddy('No listings yet. A property marked “My listing” shows up here.')}</div>` : ''}
    </main>`,
    mount(root) {
      root.querySelectorAll('[data-sellerupd]').forEach((b) => b.addEventListener('click', () => sellerUpdateSheet(b.getAttribute('data-sellerupd'))));
    }
  };
}
const sellerDueCount = () => sellerUpdatesDue(props(), todayIso(), firstName(store.settings().myName) || null).length;
const sellerPastDueCount = () => sellerUpdatesPastDue(props(), todayIso(), firstName(store.settings().myName) || null).length;

// The weekly update for one listing, to its seller.
function sellerUpdateSheet(pid) {
  const p = prop(pid);
  if (!p) return;
  const seller = store.where('people', 'property_id', pid).find((m) => /seller|owner/i.test(m.role || '')) || null;
  composeSheet({
    title: 'Seller update',
    subject: `Weekly update: ${p.address.split(',')[0]}`,
    sub: `For ${seller ? seller.name : 'the seller'}. Counts only: no visitor names, and no notes from your own buyers.${p.portal_url ? '' : ' Add the seller portal link in Edit details to point them to more numbers.'}`,
    askContact: true, phone: seller?.phone || '', email: seller?.email || '',
    body: sellerUpdateText(p, sellerStats(store.snapshot(), pid, todayIso()), { seller: seller?.name || '', profile: myProfile(), me: store.settings().myName }),
    onSent: () => store.save('properties', { id: pid, seller_update_at: new Date().toISOString() })
  });
}

const profileNudgeHidden = () => { try { return localStorage.getItem('bb:profnudge') === '1'; } catch { return false; } };
const installHidden = () => { try { return localStorage.getItem('bb:installhide') === '1'; } catch { return false; } };
// "What are we doing today?" (Sara, 2026-10-27): the big choices first.
function doTiles(tours) {
  const tour = tours[0];
  const due = sellerDueCount();
  const late = due ? sellerPastDueCount() : 0;
  const tile = (attrs, ic, label, cls = '') => html`<${raw(attrs.href ? 'a' : 'button')} class="tile do" ${raw(attrs.href ? `href="${attrs.href}"` : `type="button" id="${attrs.id}"`)}><span class="ic ${cls}">${icon(ic, 26)}</span>${label}</${raw(attrs.href ? 'a' : 'button')}>`;
  return html`<section class="sec"><div class="tiles three do-tiles">
    ${tile({ href: tour ? `#/tour/${tour.id}` : '#/plan' }, 'route', tour ? "Today's tour" : 'Show homes', 't')}
    ${tile({ id: 'findme' }, 'pin', 'At a property', 'y')}
    ${tile({ id: 'ohpick' }, 'person', 'Open house')}
    ${tile({ href: '#/updates' }, 'text', html`Seller updates${due ? html` <span class="badge ${late ? 'late' : ''}" title="${late ? `${late} past due` : `${due} due this week`}">${due}</span>` : ''}`)}
    ${tile({ href: '#/p/new' }, 'plus', 'Add a property')}
    ${tile({ href: '#/miles' }, 'miles', 'Log a drive')}
  </div></section>`;
}
function openHousePicker() {
  const me = firstName(store.settings().myName) || null;
  const list = props().filter((p) => ['listing', 'prep'].includes(p.status) && isWhose(p.owner, me));
  if (list.length === 1) { location.hash = `#/openhouse/${list[0].id}`; return; }
  if (!list.length) { toast('Mark a property “My listing” first, then run its open house from here.'); return; }
  openSheet(html`<div class="sec">
    <div class="title" style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase">Which open house?</div>
    <div class="card list">${list.map((p) => html`<a class="row" href="#/openhouse/${p.id}"><span class="grow"><span class="t">${p.address}</span><span class="s">${p.city || ''}</span></span>${icon('chev', 18)}</a>`)}</div>
  </div>`, (sh) => sh.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => closeSheet())));
}

// Delete my account (2026-10-28). Says first whether the team's shared data
// goes too (alone on the team) or stays with the teammates.
async function deleteAccountSheet() {
  let mates = 0;
  try { mates = (await api('/api/account')).teammates || 0; } catch (e) { return toast(e.message); }
  openSheet(html`<div class="sec">
    <div class="title" style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase">Delete my account</div>
    ${mates ? html`<p>You share a team with ${mates} other ${mates === 1 ? 'person' : 'people'}. Your sign-in and your profile are deleted; the properties, codes and tours you shared <b>stay with your team</b>.</p>`
      : html`<p>Everything is deleted: every property, code, note, tour, contact, photo and MLS sheet, your CRM connection and your sign-in. <b>This cannot be undone.</b></p>`}
    <label class="field"><span>Type DELETE to confirm</span><input id="delok" autocomplete="off" autocapitalize="characters"></label>
    <button class="btn dark block" type="button" id="delgo" style="background:var(--alert);border-color:var(--alert)">Delete my account</button>
    <button class="btn ghost block" type="button" id="delno">Keep my account</button>
  </div>`, (sh) => {
    sh.querySelector('#delno').addEventListener('click', closeSheet);
    sh.querySelector('#delgo').addEventListener('click', async (e) => {
      if (sh.querySelector('#delok').value.trim().toUpperCase() !== 'DELETE') return toast('Type DELETE to confirm');
      e.currentTarget.disabled = true;
      e.currentTarget.textContent = 'Deleting…';
      try {
        await api('/api/account', { method: 'POST', body: JSON.stringify({ op: 'delete', confirm: 'DELETE', profile_id: store.settings().profileId || '' }) });
        await store.wipeLocal();
        alert('Your account is deleted.');
        location.replace('#/'); location.reload();
      } catch (err) { toast(err.message); e.currentTarget.disabled = false; e.currentTarget.textContent = 'Delete my account'; }
    });
  });
}

function viewToday() {
  const results = searchText ? search(searchText, store.snapshot()) : [];
  const tours = store.all('tours').filter((x) => x.date === todayIso() && !x.finished);
  const live = props().filter((p) => LIVE.includes(p.status)).sort((a, b) => (a.status === 'escrow' ? -1 : 0) - (b.status === 'escrow' ? -1 : 0));
  const todos = todoItems();
  const shownTodos = todos.filter((t) => (!viewFilter.kind || t.ck === viewFilter.kind) && isWhose(t.owner, viewFilter.who));
  const empty = !props().length;
  const s = store.settings();
  const hp = here && here.p;

  return {
    html: html`${header({
      right: html`<span style="display:flex;gap:10px;align-items:center">${modeBadge()}<a href="#/settings" aria-label="Settings" style="color:#fff;display:flex;padding:8px">${icon('gear', 22)}</a></span>`,
      kicker: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      title: myName() ? `Hello ${myName()[0].toUpperCase()}${myName().slice(1)}` : 'Hello!',
      sub: 'What are we doing today?',
      extra: html`<label class="search">${icon('search', 18)}<input id="q" type="search" placeholder="Search everything: address, code, name…" value="${searchText}" aria-label="Search everything" autocomplete="off"></label>`
    })}
    <main class="wrap">
      ${!searchText ? planBanner() : ''}
      ${searchText ? html`<section class="sec">
        <div class="sec-head"><div class="label accent">${results.length} found</div><button class="btn ghost" type="button" id="clearq" style="min-height:36px">Clear</button></div>
        <div class="card list">${results.length ? results.slice(0, 40).map((r) => html`<a class="row" href="${r.href || (r.propertyId ? '#/p/' + r.propertyId : '#/')}">
          <span class="tag" style="min-width:64px;text-align:center">${r.kind}</span>
          <span class="grow"><span class="t">${r.title}</span><span class="s">${r.sub}</span></span></a>`) : html`<div class="empty">Nothing matches “${searchText}”.</div>`}</div>
      </section>` : ''}

      ${empty && !searchText ? html`<section class="card pad sec">
        <div class="label accent">Welcome</div>
        <div style="font-size:18px;font-weight:600">Add your first listing, or look around with sample data.</div>
        <div class="btns"><a class="btn dark" href="#/p/new">Add a listing</a><button class="btn" type="button" id="sample">Show sample data</button></div>
      </section>` : ''}

      ${!empty && !searchText ? doTiles(tours) : ''}
      ${!empty && !searchText ? filterBar() : ''}
      ${!empty && !searchText ? briefingCard() : ''}

      ${hp ? html`<section class="sec">
        <div class="label accent">You're at · ${Math.round(here.d * 5280)} ft away</div>
        <a class="card pad sec" href="#/p/${hp.id}" style="color:var(--ink)">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
            <div><div style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase;line-height:1.05">${hp.address}</div><div class="small">${hp.city || ''}</div></div>
            ${badges(hp)}
          </div>
          ${codeBoxes(codesOf(hp.id).slice(0, 4))}
          ${hp.showing_notes ? html`<div class="small">${hp.showing_notes}</div>` : ''}
          <div class="label accent" style="letter-spacing:.04em;text-transform:none;font-size:14px">Open the full card →</div>
        </a>
      </section>` : ''}

      ${todos.length ? html`<section class="sec">
        <div class="sec-head"><div class="label">To do today · ${shownTodos.length}</div><button class="btn ghost" type="button" id="addtodo" style="min-height:36px">+ Add</button></div>
        <div class="card list">${shownTodos.length ? shownTodos.map((t) => t.pickup ? html`<a class="row ${colorClass(t.ck, t.late)}" href="#/signs"><span class="check" style="border-color:var(--pending)"></span><span class="grow"><span class="t">${t.text}</span><span class="s">${ktag(t.ck, t.late)}${t.sub}</span></span>${icon('chev', 18)}</a>`
          : t.tour ? html`<a class="row ${colorClass(t.ck, t.late)}" href="#/tour/${t.tour}"><span class="check" style="border-color:var(--pending)"></span><span class="grow"><span class="t">${t.text}</span><span class="s">${ktag(t.ck, t.late)}${t.sub}</span></span>${icon('chev', 18)}</a>`
          : html`<button class="row ${colorClass(t.ck, t.late)}" type="button" data-done="${t.table}:${t.id}"><span class="check"></span><span class="grow"><span class="t">${t.text}</span><span class="s ${t.late ? 'wait' : ''}">${ktag(t.ck, t.late)}${t.sub}</span></span></button>`) : html`<div class="empty">${todos.length ? 'Nothing of that kind today.' : 'Nothing due. Nice.'}</div>`}</div>
      </section>` : ''}

      ${!searchText ? feedbackCard() : ''}
      <section class="sec">
        <div class="sec-head"><div class="label">Quick add${hp ? ' · files to ' + hp.address : ''}</div><a href="#/quick" class="small" style="color:var(--teal-text);font-weight:600">All →</a></div>
        <div class="tiles">
          ${TODAY_TILES.map((k) => html`<a class="tile" href="#/quick/${k}${hp ? '/' + hp.id : ''}"><span class="ic ${KINDS[k].y ? 'y' : ''}">${icon(KINDS[k].icon, 22)}</span>${KINDS[k].short || KINDS[k].label}</a>`)}
          <a class="tile" href="#/safety"><span class="ic r">${icon('shield', 22)}</span>Check-in</a>
        </div>
      </section>

      ${tours.length ? html`<section class="sec">
        <div class="sec-head"><div class="label">Tours today · ${tours.length}</div><a class="small" style="color:var(--teal-text);font-weight:600" href="#/plan">Plan a tour →</a></div>
        <div class="card list">${tours.map((t) => html`<a class="row" href="#/tour/${t.id}">${(t.stops || []).length ? '' : html`<span class="num" style="font-size:20px;width:70px">${t.start_minutes != null ? formatClock(t.start_minutes) : ''}</span>`}<span class="grow"><span class="t">${t.name || 'Tour'}</span><span class="s">${(t.stops || []).length} stops · ${(t.stops || []).filter((x) => x.confirmed).length} confirmed</span>${(t.stops || []).length ? html`<span class="tour-stops">${t.stops.map((x) => html`<span class="tour-stop ${x.shown ? 'done' : ''}">${x.arrive != null ? html`<span class="num">${formatClock(x.arrive)}</span>` : ''}<span class="a">${String(x.address || '').split(',')[0]}</span>${occBadge(x.occ)}</span>`)}</span>` : ''}</span>${icon('chev', 18)}</a>`)}</div>
      </section>` : ''}
      ${!searchText && (!todos.length || !tours.length) ? html`<section class="sec"><div class="btns">${!tours.length ? html`<a class="btn" href="#/plan">${icon('mic', 18)}Plan a tour</a>` : ''}${!todos.length && !empty ? html`<button class="btn" type="button" id="addtodo">${icon('plus', 18)}Add a to-do</button>` : ''}</div></section>` : ''}

      ${live.length ? html`<section class="sec">
        <div class="sec-head"><div class="label">Active · ${live.length}</div><a class="small" style="color:var(--teal-text);font-weight:600" href="#/props">All properties →</a></div>
        <div class="card list">${live.slice(0, 8).map((p) => propRow(p))}</div>
      </section>` : ''}

      <section class="sec">
        <div class="btns"><a class="btn" href="#/contacts">${icon('person', 18)}Contacts</a><a class="btn" href="#/vendors">${icon('person', 18)}Vendors</a><a class="btn" href="#/miles">${icon('miles', 18)}Mileage</a><a class="btn" href="#/signs">${icon('sign', 18)}Signs</a><a class="btn" href="#/safety">${icon('shield', 18)}Safety check-in</a></div>
      </section>
      ${!searchText && !isInstalled() && !installHidden() ? installCard({ dismissable: true, slim: true }) : ''}
      ${!searchText && !myProfile() && !profileNudgeHidden() ? html`<div class="card pad sec" data-profnudge><div class="label accent">Make it yours</div><div class="small">Add your name, brokerage, license numbers and logo. They go on your open house sign-in sheet and the texts Bestie writes.</div><div class="btns"><a class="btn dark" href="#/profile">Set up my profile</a><button class="btn ghost" type="button" id="profnot">Later</button></div></div>` : ''}
      ${!store.cloud.enabled ? html`<div class="hint" style="text-align:center">Everything is saved on this phone.</div>` : ''}
    </main>`,
    mount(root) {
      wireInstall(root, { onHide: () => { try { localStorage.setItem('bb:installhide', '1'); } catch {} } });
      root.querySelector('#profnot')?.addEventListener('click', () => { try { localStorage.setItem('bb:profnudge', '1'); } catch {} root.querySelector('[data-profnudge]')?.remove(); });
      root.querySelectorAll('[data-fbask]').forEach((b) => b.addEventListener('click', () => askFeedback(b.getAttribute('data-fbask'))));
      root.querySelectorAll('[data-fblog]').forEach((b) => b.addEventListener('click', () => logFeedback(b.getAttribute('data-fblog'))));
      const q = root.querySelector('#q');
      q.addEventListener('input', () => {
        searchText = q.value;
        const pos = q.selectionStart;
        render();
        const again = document.getElementById('q');
        again.focus();
        try { again.setSelectionRange(pos, pos); } catch {}
      });
      root.querySelector('#clearq')?.addEventListener('click', () => { searchText = ''; render(); });
      root.querySelector('#sample')?.addEventListener('click', () => { store.loadSample(sampleData()); toast('Sample data added. Clear it any time in Settings.'); });
      root.querySelector('#findme')?.addEventListener('click', async () => {
        const fix = await locate();
        here = nearest(fix);
        if (!here && fix) toast('None of your properties are within a quarter mile');
        render();
      });
      root.querySelector('#ohpick')?.addEventListener('click', openHousePicker);
      root.querySelector('#addtodo')?.addEventListener('click', () => addTaskSheet());
      root.querySelector('#readbrief')?.addEventListener('click', (e) => readBriefing(e.currentTarget));
      wireFilter(root);
      wireDayRows(root.querySelector('.brief') || document.createElement('div'));
      autoCrmSync();
      refreshBilling();
      root.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', () => {
        // Split at the FIRST colon only: ids from a CRM contain colons themselves.
        const v = b.getAttribute('data-done');
        const table = v.slice(0, v.indexOf(':'));
        const id = v.slice(v.indexOf(':') + 1);
        if (!store.get(table, id)) return toast('That item is no longer here');
        // Deadlines have no done_at column; to-dos do.
        store.save(table, table === 'tasks' ? { id, done: true, done_at: new Date().toISOString() } : { id, done: true });
        undoToast('Done', () => store.save(table, table === 'tasks' ? { id, done: false, done_at: null } : { id, done: false }));
        toast('Done');
      }));
    }
  };
}

function propRow(p) {
  const codes = codesOf(p.id).filter((a) => a.code).length;
  return html`<a class="row st-${p.status || 'listing'}" href="#/p/${p.id}">
    <span class="grow"><span class="t">${p.address}</span><span class="s"><span class="pill sm ${p.status || 'listing'}">${STATUS[p.status] || 'Listing'}</span>${[p.city, p.status === 'escrow' && p.coe_date ? `Closes ${niceDate(p.coe_date)}` : '', codes ? `${codes} code${codes > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}</span></span>
    ${p.price ? html`<span class="num" style="font-size:16px">${money(p.price)}</span>` : ''}
  </a>`;
}

function addTaskSheet(pid) {
  formSheet({
    title: 'Add a to-do',
    fields: [
      { name: 'text', label: 'What', placeholder: 'Order the home warranty' },
      { name: 'due', label: 'When', type: 'date' },
      { name: 'property_id', label: 'Property', type: 'select', options: [['', '— none —'], ...props().map((p) => [p.id, p.address])] }
    ],
    values: { due: todayIso(), property_id: pid || '' },
    onSave(v) {
      if (!v.text) { toast('Say what needs doing'); return false; }
      store.save('tasks', { ...v, property_id: v.property_id || null, done: false });
    }
  });
}

// ======================================================================
// PROPERTIES
// ======================================================================

let propFilter = 'live';
function viewProps() {
  const groups = { live: (p) => LIVE.includes(p.status), escrow: (p) => p.status === 'escrow', tour: (p) => p.status === 'tour', done: (p) => p.status === 'closed' || p.status === 'cancelled' };
  const sortBy = (() => { try { return localStorage.getItem('bb:propsort') || 'az'; } catch { return 'az'; } })();
  const list = sortProps(props().filter(groups[propFilter]).filter((p) => isWhose(p.owner, viewFilter.who)), sortBy);
  const tab = (k, l) => html`<button class="tab ${propFilter === k ? 'on' : ''}" type="button" data-f="${k}">${l}</button>`;
  return {
    html: html`${header({ kicker: 'Properties', title: `${props().filter(groups.live).length} active`, right: html`<a class="btn teal" href="#/p/new" style="min-height:40px">+ Add</a>` })}
    <main class="wrap">
      <a class="card row" href="#/sheet"><span class="tile" style="border:0;padding:0"><span class="ic t">${icon('sheet', 22)}</span></span><span class="grow"><span class="t">Snap an MLS sheet</span><span class="s">Bestie reads it and fills in the property card</span></span>${icon('chev', 18)}</a>
      <div class="tabs">${tab('live', 'Active')}${tab('escrow', 'In escrow')}${tab('tour', "Other agent's")}${tab('done', 'Closed')}</div>
      ${whoChips()}
      <label class="sortby">Sort<select id="propsort">${PROP_SORTS.map(([k, l]) => html`<option value="${k}" ${k === sortBy ? raw('selected') : ''}>${l}</option>`)}</select></label>
      <div class="card list">${list.length ? list.map(propRow) : buddy('Nothing here yet. Add a listing or a home you are showing.')}</div>
    </main>`,
    mount(root) {
      root.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { propFilter = b.getAttribute('data-f'); render(); }));
      wireFilter(root);
      root.querySelector('#propsort').addEventListener('change', (e) => { try { localStorage.setItem('bb:propsort', e.target.value); } catch {} render(); });
    }
  };
}

const PROP_FIELDS = [
  { name: 'address', label: 'Street address', placeholder: '433 E Highway 4' },
  { name: 'city', label: 'City', placeholder: 'Murphys, CA' },
  { name: 'status', label: 'Status', type: 'select', options: Object.entries(STATUS) },
  { name: 'price', label: 'Price', type: 'number', placeholder: '799000' },
  { name: 'mls', label: 'MLS #' },
  { name: 'occupancy', label: 'Occupancy', type: 'select', options: [['', 'Not known'], ['O', 'Occupied (O): keep the booked time'], ['V', 'Vacant (V)']] },
  { name: 'well', label: 'Well water', type: 'check' },
  { name: 'septic', label: 'Septic', type: 'check' },
  { name: 'hoa', label: 'HOA', placeholder: 'None, or name + $/mo' },
  { name: 'solar', label: 'Solar', placeholder: 'Owned / Leased $210/mo' },
  { name: 'coe_date', label: 'Close of escrow', type: 'date' },
  { name: 'list_date', label: 'Date listed (for days on market)', type: 'date' },
  { name: 'showing_notes', label: 'Showing instructions', type: 'textarea', placeholder: 'Text the owner 2 hours ahead. Dog in the yard.', mic: true },
  { name: 'directions', label: 'Directions', type: 'textarea', placeholder: 'GPS is wrong: second drive past the mailboxes' },
  { name: 'disclosure_url', label: 'Disclosure package link', type: 'url', placeholder: 'https://' },
  { name: 'mls_url', label: 'MLS listing link', type: 'url', placeholder: 'https://' },
  { name: 'portal_url', label: 'Seller portal link (goes in the weekly update)', type: 'url', placeholder: 'https://' }
];

function viewPropEdit(id) {
  const p = id ? prop(id) : { status: 'listing' };
  if (id && !p) return notFound();
  return {
    form: true,
    html: html`${header({ back: id ? `#/p/${id}` : '#/props', kicker: id ? 'Edit' : 'Add a property', title: id ? p.address : 'New property' })}
    <main class="wrap"><form id="pf" class="sec" novalidate>
      ${PROP_FIELDS.slice(0, 3).map((f) => fieldHtml(f, p[f.name]))}
      <div class="card pad sec">
        <div class="label">On the map</div>
        <div class="small" id="geo">${p.lat != null ? `Pinned (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}). Used for “You're at” and tour routes.` : 'Not pinned yet. Pin it so the app knows when you are there and can route tours.'}</div>
        <div class="btns"><button class="btn" type="button" id="pinhere">${icon('pin', 18)}I'm here now</button><button class="btn" type="button" id="pinfind">Find the address</button></div>
      </div>
      ${PROP_FIELDS.slice(3).map((f) => fieldHtml(f, p[f.name]))}
      ${!id ? html`<div class="card pad sec">
        <div class="label accent">Getting in, notes & MLS sheet</div>
        <div class="grid2">
          <label class="field"><span>Code is for</span><select name="x_kind">${['lockbox', 'gate', 'alarm', 'keypad'].filter((k) => KINDS[k]).map((k) => html`<option value="${k}">${KINDS[k].label}</option>`)}</select></label>
          <label class="field"><span>Code</span><input name="x_code" class="codein" autocomplete="off" autocapitalize="characters" placeholder="Type the code"></label>
        </div>
        <label class="field"><span>Notes</span><textarea name="x_notes" rows="2" placeholder="Supra on the side door, dog in the yard"></textarea></label>
        <label class="field"><span>MLS link</span><input name="x_mls" type="url" inputmode="url" placeholder="Paste the listing link" autocomplete="off"></label>
        <div class="fitems" id="xthumbs"></div>
        <div class="btns">
          <label class="btn">${icon('photo', 18)}Snap MLS sheet<input type="file" accept="image/*" capture="environment" id="xsnap" hidden></label>
          <label class="btn">${icon('sheet', 18)}Photo or PDF<input type="file" accept="image/*,application/pdf" multiple id="xpick" hidden></label>
        </div>
        <div class="hint">Want Bestie to read the sheet and fill the card in? Save, then use “Snap an MLS sheet” on the property.</div>
      </div>` : ''}
      <button class="btn dark block big" type="submit">Save</button>
      ${id ? html`<button class="btn ghost block" type="button" id="delprop">${icon('trash', 18)}Delete this property and everything filed under it</button>` : ''}
    </form></main>`,
    mount(root) {
      const form = root.querySelector('#pf');
      const pin = { lat: p.lat ?? null, lng: p.lng ?? null };
      const sheetFiles = [];
      const addX = async (input) => {
        for (const file of [...input.files]) {
          const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
          const blob = pdf ? file : await store.shrinkPhoto(file, 2000).catch(() => file);
          const f = { id: store.uid(), type: pdf ? 'application/pdf' : 'image/jpeg', kind: 'mls' };
          await store.putPhoto(f.id, blob);
          sheetFiles.push(f);
          root.querySelector('#xthumbs').insertAdjacentHTML('beforeend', str(fileItem(f)));
        }
        input.value = '';
        loadPhotos(root);
      };
      root.querySelector('#xsnap')?.addEventListener('change', (e) => addX(e.target));
      root.querySelector('#xpick')?.addEventListener('change', (e) => addX(e.target));
      const say = (t) => (root.querySelector('#geo').textContent = t);
      wireMics(root);
      root.querySelector('#pinhere').addEventListener('click', async () => {
        const fix = await locate();
        if (fix) { pin.lat = fix.lat; pin.lng = fix.lng; say('Pinned to where you are standing.'); }
      });
      root.querySelector('#pinfind').addEventListener('click', async () => {
        const v = readForm(form, PROP_FIELDS);
        if (!v.address) return toast('Type the address first');
        say('Looking it up…');
        const g = await geocode([v.address, v.city].filter(Boolean).join(', '));
        if (g) { pin.lat = g.lat; pin.lng = g.lng; say(`Found: ${g.display || 'pinned'}`); }
        else say('Could not find it from here. Use “I’m here now” when you are at the property.');
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = readForm(form, PROP_FIELDS);
        if (!v.address) return toast('The street address is needed');
        const saved = store.save('properties', { ...(id ? { id } : {}), ...v, ...pin });
        if (!id) {
          const x = (n) => (form.querySelector(`[name=${n}]`)?.value || '').trim();
          if (x('x_code')) store.save('access', { property_id: saved.id, kind: x('x_kind') || 'lockbox', label: KINDS[x('x_kind')]?.label || 'Lockbox', code: x('x_code'), ...(KINDS[x('x_kind')]?.tracked ? { status: 'out' } : {}) });
          if (x('x_notes')) store.save('notes', { property_id: saved.id, text: x('x_notes') });
          const files = withFileNotes(sheetFiles, root);
          const said = files.map((f) => f.note).filter(Boolean);
          if (x('x_mls') || files.length) store.save('notes', { property_id: saved.id, text: [x('x_mls') ? `MLS listing: ${x('x_mls')}` : 'MLS sheet', ...said].join(' · '), source: 'mls_sheet', files });
        }
        location.hash = `#/p/${saved.id}`;
      });
      root.querySelector('#delprop')?.addEventListener('click', () => {
        if (confirm(`Delete ${p.address} and every code, person, note and date filed under it?`)) {
          const gone = store.removeProperty(id);
          location.hash = '#/props';
          undoToast(`${p.address} deleted`, () => { store.restore(gone); location.hash = `#/p/${id}`; });
        }
      });
    }
  };
}

let hubTab = 'people';
let hubFor = null;
function viewHub(id) {
  const p = prop(id);
  if (!p) return notFound();
  if (hubFor !== id) { hubFor = id; hubTab = 'people'; }
  if (!['people', 'where', 'notes'].includes(hubTab)) hubTab = 'people';
  const access = store.where('access', 'property_id', id);
  const codes = codesOf(id);
  const spots = access.filter((a) => !CODE_KINDS.includes(a.kind) || !a.code);
  const people = store.where('people', 'property_id', id);
  const notes = store.where('notes', 'property_id', id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const dates = store.where('dates', 'property_id', id).sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const tasks = store.where('tasks', 'property_id', id).filter((t) => !t.done);
  const nextDate = dates.find((d) => !d.done);
  const main = people.find((m) => /tenant|occupant|seller|owner|showing/i.test(m.role || '') && m.phone) || people.find((m) => m.phone);
  const coe = p.coe_date ? daysFrom(p.coe_date) : null;
  const heads = headsUp({}, p, codes);
  const tab = (k, l) => html`<button class="tab ${hubTab === k ? 'on' : ''}" type="button" data-tab="${k}">${l}</button>`;
  const crm = p.source === 'crm';
  const sellerUpd = p.status === 'listing' || p.status === 'escrow';

  // Phase 4 (2026-10-28): status chip in the header, four buttons, one
  // "Getting in" (codes, heads-up, how to get in, driving in), a one-line
  // "Next up", three tabs, and a bottom bar (seller update + More).
  return {
    html: html`${header({
      back: '#/props',
      right: crm ? html`<span class="stat-chip" title="Set by your CRM"><span class="pill ${p.status}">${STATUS[p.status] || p.status}</span></span>`
        : html`<button class="stat-chip" type="button" id="statchip" aria-label="Status: ${STATUS[p.status] || 'not set'}. Tap to change"><span class="pill ${p.status}">${STATUS[p.status] || 'Set status'}</span><span class="chg">▾</span></button>`,
      title: p.address,
      sub: html`${p.city || ''}${p.price ? html` · <b class="num" style="font-size:18px">${fullMoney(p.price)}</b>` : ''}${p.mls ? html` · MLS <b>${p.mls}</b>` : ''}`,
      extra: html`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${badges(p, true)}<span class="sub">${[p.hoa && `HOA ${p.hoa}`, p.solar && `Solar ${p.solar}`, coe != null && p.status === 'escrow' ? `Closes ${niceDate(p.coe_date)} (${coe >= 0 ? coe + ' days' : 'passed'})` : ''].filter(Boolean).join(' · ')}</span></div>`
    })}
    <main class="wrap">
      <div class="actions">
        <a class="action teal" href="${mapLink(p)}" target="_blank" rel="noopener">${icon('pin', 22)}Directions</a>
        ${main ? html`<a class="action" href="tel:${digits(main.phone)}">${icon('phone', 22)}Call ${main.role ? main.role.split(' ')[0].toLowerCase() : ''}</a>
        <a class="action" href="${smsLink(main.phone)}">${icon('text', 22)}Text</a>` : html`<a class="action" href="#/quick/contact/${id}">${icon('person', 22)}Add contact</a><a class="action" href="#/quick/note/${id}">${icon('mic', 22)}Note</a>`}
        <button class="action" type="button" id="share">${icon('share', 22)}Share</button>
      </div>

      <section class="sec getin">
        <div class="sec-head"><div class="label">Getting in</div><span class="saved-at">Saved on this phone · ${savedAtWords(p, access)}</span></div>
        ${codes.length ? codeBoxes(codes) : html`<a class="card row" href="#/quick/lockbox/${id}"><span class="tile" style="border:0;padding:0"><span class="ic y">${icon('lockbox', 22)}</span></span><span class="grow"><span class="t">Add the lockbox or a code</span><span class="s">Gate, alarm, door keypad, hidden key</span></span></a>`}
        ${p.occupancy === 'O' || p.occupancy === 'V' || heads.length ? html`<div class="heads">${occBadge(p.occupancy)}${heads.map((h) => html`<span class="head-tag">${h}</span>`)}</div>` : ''}
        ${p.showing_notes ? html`<div class="getin-txt"><div class="getin-k">How to get in</div><div style="white-space:pre-line">${p.showing_notes}</div></div>` : ''}
        ${p.directions ? html`<div class="getin-txt"><div class="getin-k">Driving in</div><div style="white-space:pre-line">${p.directions}</div></div>` : ''}
      </section>

      <button class="card row nextup" type="button" id="nextup">
        <span class="grow"><span class="t">${nextDate ? html`Next up: ${nextDate.label}` : 'No key dates yet'}</span>
        <span class="s">${[nextDate ? `${niceDate(nextDate.due)} · ${whenText(nextDate.due)}` : 'Add contingencies, inspections, close of escrow', `${tasks.length} to-do${tasks.length === 1 ? '' : 's'}`].join(' · ')}</span></span>
        <span class="small" style="color:var(--teal-text);font-weight:700">All dates ›</span>
      </button>

      <div class="tabs">${tab('people', `People · ${people.length}`)}${tab('where', `Gear & signs · ${spots.length}`)}${tab('notes', `Notes & files · ${notes.length}`)}</div>

      ${hubTab === 'where' ? html`<section class="sec">
        <div class="card list">${access.length ? access.map((a) => html`<button class="row" type="button" data-access="${a.id}">
          ${a.photo_id ? html`<img class="thumb" data-photo="${a.photo_id}" data-path="${a.photo_path || ''}" alt="">` : html`<span class="tile" style="border:0;padding:0"><span class="ic ${KINDS[a.kind]?.y ? 'y' : ''}" style="width:40px;height:40px">${icon(KINDS[a.kind]?.icon || 'pin', 20)}</span></span>`}
          <span class="grow"><span class="t">${a.label || KINDS[a.kind]?.label}${a.code ? html` · <span class="num">${a.code}</span>` : ''}</span><span class="s">${[a.location_note, KINDS[a.kind]?.tracked ? (a.status === 'office' ? 'Back in the office' : 'Out at the property') : ''].filter(Boolean).join(' · ')}</span></span>
        </button>`) : buddy('Nothing yet. Add the lockbox, sign, septic lids, shut-offs, with a photo.')}</div>
        <a class="btn dark block" href="#/quick/lockbox/${id}">+ Add something</a>
      </section>` : ''}

      ${hubTab === 'people' ? html`<section class="sec">
        <div class="card list">${people.length ? people.map(personRow) : buddy('No one yet. Add the seller, tenant, escrow officer, the other agent.')}</div>
        <div class="btns"><a class="btn dark" href="#/quick/contact/${id}">+ Add a person</a><button class="btn" type="button" id="fromcontacts">${icon('person', 18)}From my contacts</button><button class="btn" type="button" id="fromvendors">${icon('person', 18)}From my vendors</button></div>
      </section>` : ''}

      ${hubTab === 'notes' ? html`<section class="sec">
        <label class="field"><span>New note</span><textarea id="newnote" placeholder="Buyer wants the shed gone"></textarea></label>
        <div class="btns"><button class="btn" type="button" data-mic="newnote">${icon('mic', 18)}Talk</button><button class="btn dark" type="button" id="savenote">Save note</button><a class="btn" href="#/sheet/${id}">${icon('sheet', 18)}MLS sheet</a></div>
        ${p.mls_url || p.disclosure_url ? html`<div class="btns">${p.mls_url ? html`<a class="btn" href="${safeUrl(p.mls_url)}" target="_blank" rel="noopener">MLS listing</a>` : ''}${p.disclosure_url ? html`<a class="btn" href="${safeUrl(p.disclosure_url)}" target="_blank" rel="noopener">Disclosures</a>` : ''}</div>` : ''}
        <div class="card list">${notes.length ? notes.map((n) => html`<div class="row" style="align-items:flex-start"><span class="grow"><span class="s">${niceDate(n.created_at)}</span><span style="white-space:pre-line">${n.text}</span>${(n.files || []).length ? html`<span class="fitems" data-notefiles="${n.id}">${n.files.map(fileItem)}</span>` : ''}</span><button class="icon-btn" type="button" data-delnote="${n.id}" aria-label="Delete note">${icon('trash', 16)}</button></div>`) : html`<div class="empty">No notes yet.</div>`}</div>
      </section>` : ''}
    </main>
    <div class="pbar">
      ${sellerUpd ? html`<button class="btn dark" type="button" id="sellerupd">${icon('text', 18)}Send seller update</button>` : ''}
      <button class="btn ${sellerUpd ? '' : 'block'}" type="button" id="hubmore">More</button>
    </div>`,
    mount(root) {
      wireMics(root);
      root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { hubTab = b.getAttribute('data-tab'); render(); }));
      root.querySelector('#share').addEventListener('click', () => shareSheet(p));
      root.querySelector('#nextup').addEventListener('click', () => datesSheet(id));
      root.querySelector('#statchip')?.addEventListener('click', () => statusSheet(p));
      root.querySelector('#hubmore').addEventListener('click', () => hubMoreSheet(p));
      root.querySelectorAll('[data-access]').forEach((b) => b.addEventListener('click', () => accessSheet(store.get('access', b.getAttribute('data-access')))));
      root.querySelectorAll('[data-edit-person]').forEach((b) => b.addEventListener('click', () => personSheet(id, store.get('people', b.getAttribute('data-edit-person')))));
      root.querySelector('#sellerupd')?.addEventListener('click', () => sellerUpdateSheet(id));
      root.querySelector('#fromvendors')?.addEventListener('click', () => vendorPicker(id));
      root.querySelector('#fromcontacts')?.addEventListener('click', () => contactPicker(id));
      root.querySelector('#savenote')?.addEventListener('click', () => {
        const t = root.querySelector('#newnote').value.trim();
        if (!t) return;
        store.save('notes', { property_id: id, text: t });
        toast('Note saved');
      });
      root.querySelectorAll('[data-openf]').forEach((b) => b.addEventListener('click', () => openFile(b.getAttribute('data-openf'), b.getAttribute('data-path'))));
      // A picture's note is saved where it sits, without redrawing the page.
      root.querySelectorAll('[data-notefiles]').forEach((box) => box.addEventListener('change', (e) => {
        if (!e.target.matches('[data-fnote]')) return;
        const n = store.get('notes', box.getAttribute('data-notefiles'));
        if (!n) return;
        store.save('notes', { id: n.id, files: withFileNotes(n.files, box) }, { quiet: true });
        toast('Note saved');
      }));
      root.querySelectorAll('[data-delnote]').forEach((b) => b.addEventListener('click', () => { del('notes', b.getAttribute('data-delnote'), 'Note deleted'); }));
      loadPhotos(root);
    }
  };
}

// "Saved on this phone · 2:15 PM": the latest change to the property or its
// codes, as a time today or a date before that.
function savedAtWords(p, access) {
  const at = [p, ...access].map((r) => r.updated_at || r.created_at || '').sort().pop();
  if (!at) return 'just now';
  const d = new Date(at);
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : niceDate(at);
}

// Tap the status chip in the header: pick one, saved with Undo.
function statusSheet(p) {
  openSheet(html`<div class="sec">
    <div class="title" style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase">Status</div>
    <div class="stat-opts">${['prep', 'listing', 'escrow', 'tour', 'closed', 'cancelled'].map((k) => html`<button type="button" class="stat-opt st-${k} ${p.status === k ? 'on' : ''}" data-status="${k}">${STATUS[k]}</button>`)}</div>
  </div>`, (sh) => sh.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => {
    const next = b.getAttribute('data-status');
    closeSheet();
    if (next === p.status) return;
    const was = p.status;
    store.save('properties', { id: p.id, status: next });
    undoToast(`Now ${STATUS[next]}`, () => store.save('properties', { id: p.id, status: was }));
  })));
}

// Every key date and to-do for a property ("Next up" → All dates).
function datesSheet(id) {
  const dates = store.where('dates', 'property_id', id).sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const tasks = store.where('tasks', 'property_id', id).filter((t) => !t.done);
  openSheet(html`<div class="sec">
    <div class="sec-head"><div class="label">Key dates</div><button class="btn ghost" type="button" id="adddate" style="min-height:36px">+ Add</button></div>
    <div class="card list">${dates.length ? dates.map((d) => html`<button class="row" type="button" data-date="${d.id}">
      <span class="check ${d.done ? 'on' : ''}">${d.done ? '✓' : ''}</span>
      <span class="grow"><span class="t ${d.done ? 'done-text' : ''}">${d.label}</span><span class="s">${niceDate(d.due)} · ${whenText(d.due)}</span></span></button>`) : html`<div class="empty">No dates yet. Add contingencies, inspections, close of escrow.</div>`}</div>
    <div class="sec-head"><div class="label">To do · ${tasks.length}</div><button class="btn ghost" type="button" id="addtask" style="min-height:36px">+ Add</button></div>
    ${tasks.length ? html`<div class="card list">${tasks.map((t) => html`<button class="row" type="button" data-done="${t.id}"><span class="check"></span><span class="grow"><span class="t">${t.text}</span><span class="s">${t.due ? whenText(t.due) : ''}</span></span></button>`)}</div>` : html`<div class="empty">Nothing to do here.</div>`}
  </div>`, (sh) => {
    colorHeaders(sh);
    sh.querySelector('#adddate').addEventListener('click', () => { closeSheet(); dateSheet(id); });
    sh.querySelector('#addtask').addEventListener('click', () => { closeSheet(); addTaskSheet(id); });
    sh.querySelectorAll('[data-date]').forEach((b) => b.addEventListener('click', () => { closeSheet(); dateSheet(id, store.get('dates', b.getAttribute('data-date'))); }));
    sh.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', () => {
      const tid = b.getAttribute('data-done');
      store.save('tasks', { id: tid, done: true, done_at: new Date().toISOString() });
      b.remove();
      undoToast('Done', () => store.save('tasks', { id: tid, done: false, done_at: null }));
    }));
  });
}

// The property page's "More": everything that is not used every visit.
function hubMoreSheet(p) {
  const id = p.id;
  const sheetNote = store.where('notes', 'property_id', id).some((n) => n.source === 'mls_sheet');
  const visitors = store.all('visitors').filter((v) => v.property_id === id).length;
  openSheet(html`<div class="sec">
    <div class="title" style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase">More</div>
    <div class="card list">
      <a class="row" href="#/p/${id}/edit">${icon('edit', 20)}<span class="grow"><span class="t">Edit details</span></span>${icon('chev', 18)}</a>
      ${sheetNote ? html`<button class="row" type="button" id="moresheet">${icon('sheet', 20)}<span class="grow"><span class="t">MLS sheet</span><span class="s">In Notes & files</span></span>${icon('chev', 18)}</button>` : html`<a class="row" href="#/sheet/${id}">${icon('sheet', 20)}<span class="grow"><span class="t">Snap MLS sheet</span></span>${icon('chev', 18)}</a>`}
      <a class="row" href="#/quick">${icon('plus', 20)}<span class="grow"><span class="t">Quick add</span></span>${icon('chev', 18)}</a>
      <a class="row" href="#/openhouse/${id}">${icon('person', 20)}<span class="grow"><span class="t">Open house sign-in</span></span>${icon('chev', 18)}</a>
      ${visitors ? html`<a class="row" href="#/visitors/${id}">${icon('list', 20)}<span class="grow"><span class="t">Visitors · ${visitors}</span></span>${icon('chev', 18)}</a>` : ''}
    </div>
  </div>`, (sh) => {
    sh.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeSheet));
    sh.querySelector('#moresheet')?.addEventListener('click', () => { closeSheet(); hubTab = 'notes'; render(); });
  });
}

function safeUrl(u) {
  return /^https?:\/\//i.test(u || '') ? u : '#';
}

function loadPhotos(root) {
  root.querySelectorAll('img[data-photo]').forEach(async (img) => {
    const url = await store.photoUrl(img.getAttribute('data-photo'), img.getAttribute('data-path'));
    if (url) img.src = url;
  });
}

function dateSheet(pid, d) {
  formSheet({
    title: d ? 'Key date' : 'Add a key date',
    fields: [
      { name: 'label', label: 'What', placeholder: 'Appraisal contingency' },
      { name: 'due', label: 'Date', type: 'date' },
      { name: 'done', label: 'Done / removed', type: 'check' }
    ],
    values: d || {},
    onSave(v) {
      if (!v.label || !v.due) { toast('Add what and when'); return false; }
      store.save('dates', { ...(d ? { id: d.id } : {}), property_id: pid, ...v });
    },
    onDelete: d ? () => del('dates', d.id, 'Date deleted') : null
  });
}

// ---------- vendors (2026-10-27) ----------
// The agent's go-to people, saved once: inspector, title, lender, stager...
// "From my vendors" on a property's People tab adds one there in a tap.
const VENDOR_TRADES = ['Inspector', 'Title / escrow', 'Lender', 'Stager', 'Photographer', 'Handyman', 'Contractor', 'Septic', 'Well', 'Pest', 'Roofer', 'Cleaner', 'Landscaper', 'Mover', 'Attorney', 'Insurance', 'Other'];
const vendorSort = (a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || String(a.name || '').localeCompare(String(b.name || ''));
function vendorRow(v, { pick = false } = {}) {
  const sub = [v.trade, v.company].filter(Boolean).join(' · ');
  return html`<div class="row">
    <button type="button" class="grow" ${raw(pick ? `data-pickvendor="${esc(v.id)}"` : `data-vendor="${esc(v.id)}"`)} style="background:none;border:0;text-align:left;padding:0;color:inherit">
      <span class="t">${v.favorite ? '★ ' : ''}${v.name || v.company || 'Vendor'}</span><span class="s">${sub}</span></button>
    ${!pick && v.phone ? html`<a class="icon-btn" href="tel:${digits(v.phone)}" aria-label="Call ${v.name}">${icon('phone', 18)}</a><a class="icon-btn" href="${smsLink(v.phone)}" aria-label="Text ${v.name}">${icon('text', 18)}</a>` : ''}
  </div>`;
}
let vendorQuery = '';
function vendorMatches(v, q) {
  q = q.trim().toLowerCase();
  return !q || [v.name, v.company, v.trade, v.notes].some((x) => String(x || '').toLowerCase().includes(q));
}
function viewVendors() {
  const list = store.all('vendors').filter((v) => vendorMatches(v, vendorQuery)).sort(vendorSort);
  const groups = VENDOR_TRADES.map((t) => [t, list.filter((v) => (v.trade || 'Other') === t || (t === 'Other' && !VENDOR_TRADES.includes(v.trade)))]).filter(([, l]) => l.length);
  return {
    html: html`${header({ back: '#/', kicker: 'Your people', title: 'Vendors' })}
    <main class="wrap">
      <label class="field"><span>Search</span><input id="vq" type="search" value="${vendorQuery}" placeholder="Name, company or trade" autocomplete="off"></label>
      <button class="btn dark block" type="button" id="addvendor">+ Add a vendor</button>
      ${groups.length ? groups.map(([t, l]) => html`<section class="sec"><div class="label">${t} · ${l.length}</div><div class="card list">${l.map((v) => vendorRow(v))}</div></section>`)
        : html`<div class="card">${buddy(vendorQuery ? `No vendor matches “${vendorQuery}”.` : 'No vendors yet. Add your inspector, title rep, lender, stager, handyman: anyone you call on more than one deal.')}</div>`}
    </main>`,
    mount(root) {
      const q = root.querySelector('#vq');
      q.addEventListener('input', () => { vendorQuery = q.value; const pos = q.selectionStart; render(); const again = document.getElementById('vq'); again?.focus(); again?.setSelectionRange(pos, pos); });
      root.querySelector('#addvendor').addEventListener('click', () => vendorSheet(null));
      root.querySelectorAll('[data-vendor]').forEach((b) => b.addEventListener('click', () => vendorSheet(store.get('vendors', b.getAttribute('data-vendor')))));
    }
  };
}
function vendorSheet(v) {
  formSheet({
    title: v ? v.name || 'Vendor' : 'Add a vendor',
    fields: [
      { name: 'name', label: 'Name', placeholder: 'Pat Lee' },
      { name: 'company', label: 'Company', placeholder: 'Sierra Home Inspections' },
      { name: 'trade', label: 'What they do', type: 'select', options: VENDOR_TRADES.map((t) => [t, t]) },
      { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Books 3 days out. Great on older homes.' },
      { name: 'favorite', label: 'Favorite (shows first)', type: 'check' }
    ],
    values: v || { trade: 'Inspector' },
    onSave(val) {
      if (!val.name && !val.company) { toast('Add a name or company'); return false; }
      store.save('vendors', { ...(v ? { id: v.id } : {}), ...val, favorite: !!val.favorite });
    },
    onDelete: v ? () => del('vendors', v.id, 'Vendor deleted') : null
  });
}
function vendorPicker(pid) {
  const all = store.all('vendors').sort(vendorSort);
  if (!all.length) { toast('No vendors yet. Add them under Vendors on Today.'); location.hash = '#/vendors'; return; }
  openSheet(html`<div class="sec">
    <div class="title" style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase">Add from my vendors</div>
    <label class="field"><span>Search</span><input id="vpq" type="search" placeholder="Name, company or trade" autocomplete="off"></label>
    <div class="card list" id="vplist">${all.map((v) => vendorRow(v, { pick: true }))}</div>
  </div>`, (sh) => {
    const wire = () => sh.querySelectorAll('[data-pickvendor]').forEach((b) => b.addEventListener('click', () => {
      const v = store.get('vendors', b.getAttribute('data-pickvendor'));
      store.save('people', { property_id: pid, name: v.name || v.company, role: [v.trade, v.name && v.company].filter(Boolean).join(' · '), phone: v.phone || '', email: v.email || '' });
      closeSheet(); toast(`${v.name || v.company} added`);
    }));
    sh.querySelector('#vpq').addEventListener('input', (e) => { sh.querySelector('#vplist').innerHTML = str(html`${all.filter((v) => vendorMatches(v, e.target.value)).map((v) => vendorRow(v, { pick: true }))}`); wire(); });
    wire();
  });
}

// ---------- contacts (2026-10-27) ----------
// The agent's address book: from the CRM (if they chose "All my contacts" when
// connecting it) and/or imported from a phone's contacts or a CSV file. People
// on a property stay in `people`; "From my contacts" copies one there.

const KIND_LABEL = Object.fromEntries(CONTACT_KINDS.map((k) => [k.id, k.label]));
const KIND_MANY = Object.fromEntries(CONTACT_KINDS.map((k) => [k.id, k.many]));
const SHOW_MAX = 100;
let contactQuery = '';
let contactKind = null;
function contactMatches(c, q) {
  q = q.trim().toLowerCase();
  if (!q) return true;
  const d = q.replace(/\D/g, '');
  return [c.name, c.company, c.email, c.notes].some((x) => String(x || '').toLowerCase().includes(q)) || (d.length >= 3 && String(c.phone || '').replace(/\D/g, '').includes(d));
}
const contactSort = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
function contactRow(c, { pick = false } = {}) {
  const sub = [KIND_LABEL[c.kind], c.company, c.phone || c.email].filter(Boolean).join(' · ');
  return html`<div class="row">
    <button type="button" class="grow" ${raw(pick ? `data-pickcontact="${esc(c.id)}"` : `data-contact="${esc(c.id)}"`)} style="background:none;border:0;text-align:left;padding:0;color:inherit">
      <span class="t">${c.name || c.email || 'Contact'}</span><span class="s">${sub}</span></button>
    ${!pick && c.phone ? html`<a class="icon-btn" href="tel:${digits(c.phone)}" aria-label="Call ${c.name}">${icon('phone', 18)}</a><a class="icon-btn" href="${smsLink(c.phone)}" aria-label="Text ${c.name}">${icon('text', 18)}</a>` : ''}
  </div>`;
}
function viewContacts(openId) {
  const everyone = store.all('contacts');
  const list = everyone.filter((c) => (!contactKind || (c.kind || 'other') === contactKind) && contactMatches(c, contactQuery)).sort(contactSort);
  const chip = (k, label) => html`<button type="button" class="chip ${contactKind === k ? 'on' : ''}" data-ckind="${k || ''}">${label}</button>`;
  const fromCrm = everyone.filter((c) => c.source === 'crm').length;
  return {
    html: html`${header({ back: '#/', kicker: 'Your people', title: 'Contacts' })}
    <main class="wrap">
      <label class="field"><span>Search ${everyone.length ? `${everyone.length} contacts` : ''}</span><input id="cq" type="search" value="${contactQuery}" placeholder="Name, phone, email or company" autocomplete="off"></label>
      ${everyone.length ? html`<div class="chips">${chip(null, 'All')}${CONTACT_KINDS.map((k) => chip(k.id, k.many))}</div>` : ''}
      <div class="btns"><button class="btn dark" type="button" id="addcontact">+ Add a contact</button><button class="btn" type="button" id="importcontacts">${icon('plus', 18)}Import contacts</button></div>
      ${list.length ? html`<section class="sec"><div class="card list">${list.slice(0, SHOW_MAX).map((c) => contactRow(c))}</div>
        ${list.length > SHOW_MAX ? html`<p class="small muted">Showing ${SHOW_MAX} of ${list.length}. Search to find the rest.</p>` : ''}</section>`
        : html`<div class="card">${buddy(contactQuery || contactKind ? 'No contact matches that.' : 'No contacts yet. Import them from your phone or a spreadsheet, or connect your CRM in Settings and choose “All my contacts”.')}</div>`}
      ${fromCrm ? html`<p class="small muted">${fromCrm} came from your CRM and update with it. To stop bringing them in: Settings → Connect your CRM.</p>` : ''}
    </main>`,
    mount(root) {
      const q = root.querySelector('#cq');
      q.addEventListener('input', () => { contactQuery = q.value; const pos = q.selectionStart; render(); const again = document.getElementById('cq'); again?.focus(); again?.setSelectionRange(pos, pos); });
      root.querySelectorAll('[data-ckind]').forEach((b) => b.addEventListener('click', () => { contactKind = b.dataset.ckind || null; render(); }));
      root.querySelector('#addcontact').addEventListener('click', () => contactSheet(null));
      root.querySelector('#importcontacts').addEventListener('click', importContacts);
      root.querySelectorAll('[data-contact]').forEach((b) => b.addEventListener('click', () => contactSheet(store.get('contacts', b.getAttribute('data-contact')))));
      if (openId) { const c = store.get('contacts', openId); if (c) contactSheet(c); history.replaceState(null, '', '#/contacts'); }
    }
  };
}
function contactSheet(c) {
  formSheet({
    title: c ? c.name || 'Contact' : 'Add a contact',
    fields: [
      { name: 'name', label: 'Name', placeholder: 'Jordan Smith' },
      { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'company', label: 'Company' },
      { name: 'kind', label: 'Who they are', type: 'select', options: CONTACT_KINDS.map((k) => [k.id, k.label]) },
      { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Wants single story near Murphys.' }
    ],
    values: c || { kind: 'lead' },
    onSave(val) {
      if (!val.name && !val.phone && !val.email) { toast('Add a name, phone or email'); return false; }
      store.save('contacts', { ...(c ? { id: c.id } : {}), ...val });
    },
    onDelete: c ? () => del('contacts', c.id, 'Contact deleted') : null
  });
}

// Pick a CSV or vCard file, show what is in it, import on a tap.
function importContacts() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.vcf,.txt,text/csv,text/vcard,text/x-vcard,text/plain';
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast('That file is over 10 MB. Export fewer contacts at a time.'); return; }
    const found = parseContacts(await f.text(), f.name);
    if (!found.length) { toast('No contacts found in that file. Use a .csv with a Name column, or a .vcf from your phone.'); return; }
    const { add, same } = planImport(found, store.all('contacts'));
    const untyped = add.filter((x) => !x.kind).length;
    // The groups in the file (from a Type / Stage / Tags column), largest first.
    const groups = [...add.reduce((m, x) => m.set(x.kind || '', (m.get(x.kind || '') || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
    openSheet(html`<div class="sec">
      <div class="title" style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase">Import contacts</div>
      <p><b>${found.length}</b> in ${f.name}. <b>${add.length}</b> new${same.length ? html`, ${same.length} already in your contacts (skipped)` : ''}.</p>
      ${add.length ? html`<div class="card list">${add.slice(0, 5).map((x) => html`<div class="row"><span class="grow"><span class="t">${x.name}</span><span class="s">${[x.company, x.phone || x.email].filter(Boolean).join(' · ')}</span></span></div>`)}</div>
        ${add.length > 5 ? html`<p class="small muted">…and ${add.length - 5} more.</p>` : ''}
        ${groups.length > 1 ? html`<div class="field"><span>Which groups?</span>${groups.map(([k, n]) => html`<label class="switch"><input type="checkbox" name="impg" value="${k}" checked>${k ? KIND_MANY[k] : 'No type in the file'} · ${n}</label>`)}</div>` : ''}
        ${untyped ? html`<label class="field" id="impkindf"><span>File ${untyped === add.length ? 'them' : `the ${untyped} with no type`} as</span><select id="impkind">${CONTACT_KINDS.map((k) => html`<option value="${k.id}" ${k.id === 'sphere' ? 'selected' : ''}>${k.label}</option>`)}</select></label>` : ''}
        <button class="btn dark block" type="button" id="impgo">Import ${add.length} contact${add.length === 1 ? '' : 's'}</button>` : html`<p>Everyone in this file is already in your contacts.</p>`}
      <p class="small muted">On an iPhone: Contacts → pick a list → Export → Save to Files, then choose that file here. From a CRM: export contacts as CSV.</p>
    </div>`, (sh) => {
      const picked = () => {
        const boxes = [...sh.querySelectorAll('[name=impg]')];
        const on = new Set(boxes.filter((b) => b.checked).map((b) => b.value));
        return boxes.length ? add.filter((x) => on.has(x.kind || '')) : add;
      };
      const recount = () => {
        const n = picked().length;
        const go = sh.querySelector('#impgo');
        go.textContent = n ? `Import ${n} contact${n === 1 ? '' : 's'}` : 'Tick a group to import';
        go.disabled = !n;
        const f = sh.querySelector('#impkindf');
        if (f) f.hidden = !picked().some((x) => !x.kind);
      };
      sh.querySelectorAll('[name=impg]').forEach((b) => b.addEventListener('change', recount));
      sh.querySelector('#impgo')?.addEventListener('click', () => {
        const kind = sh.querySelector('#impkind')?.value || 'sphere';
        const list = picked();
        if (!list.length) return;
        store.saveMany('contacts', list.map((x) => ({ ...x, kind: x.kind || kind, source: 'import' })));
        closeSheet();
        toast(`${list.length} contact${list.length === 1 ? '' : 's'} imported`);
      });
    });
  });
  input.click();
}

function contactPicker(pid) {
  const everyone = store.all('contacts').sort(contactSort);
  if (!everyone.length) { toast('No contacts yet. Import them under Contacts on Today.'); location.hash = '#/contacts'; return; }
  const draw = (q) => html`${everyone.filter((c) => contactMatches(c, q)).slice(0, 50).map((c) => contactRow(c, { pick: true }))}`;
  openSheet(html`<div class="sec">
    <div class="title" style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase">Add from my contacts</div>
    <label class="field"><span>Search</span><input id="cpq" type="search" placeholder="Name, phone or email" autocomplete="off"></label>
    <div class="card list" id="cplist">${draw('')}</div>
  </div>`, (sh) => {
    const wire = () => sh.querySelectorAll('[data-pickcontact]').forEach((b) => b.addEventListener('click', () => {
      const c = store.get('contacts', b.getAttribute('data-pickcontact'));
      store.save('people', { property_id: pid, name: c.name, role: KIND_LABEL[c.kind] === 'Client' ? 'Client' : '', phone: c.phone || '', email: c.email || '' });
      closeSheet(); toast(`${c.name} added`);
    }));
    sh.querySelector('#cpq').addEventListener('input', (e) => { sh.querySelector('#cplist').innerHTML = str(draw(e.target.value)); wire(); });
    wire();
  });
}

function personSheet(pid, m) {
  formSheet({
    title: m ? m.name : 'Add a person',
    fields: [
      { name: 'name', label: 'Name' },
      { name: 'role', label: 'Role', placeholder: 'Seller, tenant, escrow officer…' },
      { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'email', label: 'Email', type: 'email' }
    ],
    values: m || {},
    onSave(v) {
      if (!v.name) { toast('Add a name'); return false; }
      store.save('people', { ...(m ? { id: m.id } : {}), property_id: pid, ...v });
    },
    onDelete: m ? () => del('people', m.id, 'Person removed') : null
  });
}

function accessSheet(a) {
  const k = KINDS[a.kind] || {};
  formSheet({
    title: a.label || k.label || 'Item',
    fields: [
      { name: 'label', label: 'Name', placeholder: k.label },
      ...(k.code || a.code ? [{ name: 'code', label: 'Code', type: 'code' }] : []),
      { name: 'location_note', label: 'Where', placeholder: k.where },
      ...(k.tracked ? [{ name: 'status', label: 'Status', type: 'select', options: [['out', 'Out at the property'], ['office', 'Back in the office']] }] : [])
    ],
    values: a,
    extra: a.photo_id ? html`<img data-photo="${a.photo_id}" data-path="${a.photo_path || ''}" alt="" style="border-radius:10px;max-height:320px;object-fit:cover">` : '',
    onSave(v) { store.save('access', { id: a.id, ...v }); },
    onDelete: () => del('access', a.id, 'Deleted')
  });
  loadPhotos(document.querySelector('.sheet'));
}

function shareSheet(p) {
  const codes = codesOf(p.id).filter((a) => a.code);
  const build = (withCodes) => [
    `${p.address}${p.city ? ', ' + p.city : ''}`,
    p.occupancy === 'O' ? 'Occupied.' : p.occupancy === 'V' ? 'Vacant.' : '',
    p.showing_notes || '',
    ...store.where('access', 'property_id', p.id).filter((a) => a.kind === 'lockbox').map((a) => `${a.label || 'Lockbox'}: ${a.location_note || ''}`),
    withCodes ? codes.map((a) => `${a.label || KINDS[a.kind]?.label}: ${a.code}`).join('. ') : (codes.length ? 'Codes: ask me.' : ''),
    p.directions ? `Directions: ${p.directions}` : ''
  ].filter(Boolean).join('\n');
  openSheet(html`<div class="sec">
    <div class="title" style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase">Send showing instructions</div>
    <label class="switch"><input type="checkbox" id="withcodes"> Include the codes</label>
    <label class="field"><span>Message</span><textarea id="msg" style="min-height:180px">${build(false)}</textarea></label>
    <div class="btns"><a class="btn dark" id="sendtext" href="#">Text it</a><button class="btn" type="button" id="sharenative">Share…</button></div>
    <button class="btn ghost block" type="button" id="copymsg">Copy</button>
    <div class="card pad"><div class="label accent">Safer: a 24-hour link</div>
      <div class="small">For an assistant, photographer or inspector: a link to this home's codes, directions and showing instructions that stops working tomorrow, so the codes don't sit in their texts forever.</div>
      <div class="btns"><button class="btn dark" type="button" id="daylink">Make a 24-hour link</button><button class="btn ghost" type="button" id="stoplinks">Stop links now</button></div></div>
  </div>`, (s) => {
    const msg = s.querySelector('#msg');
    s.querySelector('#daylink').addEventListener('click', async (ev) => {
      ev.target.disabled = true;
      try {
        const url = await shareLink(p.id);
        msg.value = `${p.address}: codes, directions and showing instructions (this link works for 24 hours): ${url}`;
        s.querySelector('#withcodes').checked = false; sync();
        toast('Link made. Text or share it.');
      } catch (e) { toast(e.message); }
      ev.target.disabled = false;
    });
    s.querySelector('#stoplinks').addEventListener('click', async () => { const n = await stopShareLinks(p.id); toast(n ? `${n} link${n === 1 ? '' : 's'} stopped` : 'No links were open'); });
    const sync = () => (s.querySelector('#sendtext').href = smsLink([], msg.value));
    s.querySelector('#withcodes').addEventListener('change', (e) => { msg.value = build(e.target.checked); sync(); });
    msg.addEventListener('input', sync);
    sync();
    s.querySelector('#sharenative').addEventListener('click', async () => {
      if (navigator.share) { try { await navigator.share({ text: msg.value }); } catch {} } else { await copy(msg.value); toast('Copied'); }
    });
    s.querySelector('#copymsg').addEventListener('click', async () => { await copy(msg.value); toast('Copied'); });
  });
}

// ======================================================================
// QUICK ADD
// ======================================================================

function viewQuick(kind, pid) {
  const k = KINDS[kind];
  if (!k) {
    return {
      html: html`${header({ kicker: 'Quick add', title: 'What are you adding?', sub: 'It files to the property you are at.' })}
      <main class="wrap">
        <div class="tiles three">${Object.entries(KINDS).map(([key, x]) => html`<a class="tile" href="#/quick/${key}${pid ? '/' + pid : ''}"><span class="ic ${x.y ? 'y' : ''}">${icon(x.icon, 24)}</span>${x.short || x.label}</a>`)}
          <a class="tile" href="#/sheet${pid ? '/' + pid : ''}"><span class="ic t">${icon('sheet', 24)}</span>MLS sheet</a>
          <a class="tile" href="#/miles/add"><span class="ic t">${icon('miles', 24)}</span>A drive</a>
          <a class="tile" href="#/safety"><span class="ic r">${icon('shield', 24)}</span>Check-in</a>
          <a class="tile" href="#/p/new"><span class="ic t">${icon('home', 24)}</span>Property</a>
        </div>
      </main>`
    };
  }
  const options = [['', props().length ? '— choose a property —' : '— add a property first —'], ...props().filter((p) => LIVE.includes(p.status) || p.id === pid).map((p) => [p.id, p.address])];
  return {
    form: true,
    html: html`${header({ back: pid ? `#/p/${pid}` : '#/quick', kicker: 'Quick add', title: k.label, sub: html`<span id="where">${pid ? html`Adding to <b>${addr(pid)}</b>` : 'Finding where you are…'}</span>` })}
    <main class="wrap"><form id="qf" class="sec" novalidate>
      ${kind !== 'receipt' || props().length ? fieldHtml({ name: 'property_id', label: 'Property', type: 'select', options }, pid || '') : ''}
      ${k.table === 'access' ? html`
        <div style="display:flex;gap:12px;align-items:flex-start">
          <label class="photo-pick" id="pp">${icon('photo', 24)}<span>Snap it</span><input type="file" accept="image/*" capture="environment" id="photo" hidden></label>
          <div class="sec" style="flex:1">
            ${k.code ? fieldHtml({ name: 'code', label: k.code, type: 'code', placeholder: kind === 'lockbox' ? 'Supra #18 or 2020' : '#2580' }) : fieldHtml({ name: 'label', label: k.name || 'Name', placeholder: k.label })}
            ${fieldHtml({ name: 'location_note', label: 'Where', placeholder: k.where })}
          </div>
        </div>
        <div class="hint">Your phone pins the spot too, so the next agent can walk straight to it.</div>` : ''}
      ${k.table === 'notes' ? html`${fieldHtml({ name: 'text', label: kind === 'feedback' ? 'How did it go?' : 'Note', type: 'textarea', placeholder: kind === 'feedback' ? 'Loved the yard, thought the price was high' : 'Buyer wants the shed gone' })}
        <button class="btn" type="button" data-mic="text">${icon('mic', 18)}Talk instead of typing</button>` : ''}
      ${k.table === 'people' ? html`${fieldHtml({ name: 'name', label: 'Name' })}${fieldHtml({ name: 'role', label: 'Role', placeholder: 'Tenant · showing contact' })}${fieldHtml({ name: 'phone', label: 'Phone', type: 'tel' })}${fieldHtml({ name: 'email', label: 'Email', type: 'email' })}` : ''}
      ${k.table === 'expenses' ? html`
        <div style="display:flex;gap:12px;align-items:flex-start">
          <label class="photo-pick" id="pp">${icon('photo', 24)}<span>Snap it</span><input type="file" accept="image/*" capture="environment" id="photo" hidden></label>
          <div class="sec" style="flex:1">${fieldHtml({ name: 'amount', label: 'Amount', type: 'number', placeholder: '45.00' })}${fieldHtml({ name: 'what', label: 'What for', placeholder: 'Staging flowers' })}</div>
        </div>${fieldHtml({ name: 'date', label: 'Date', type: 'date' }, todayIso())}` : ''}
      <button class="btn dark block big" type="submit">Save</button>
    </form></main>`,
    mount(root) {
      const form = root.querySelector('#qf');
      wireMics(root);
      let photo = null;
      let fix = null;
      const sel = form.elements.property_id;
      locate({ quiet: true }).then((f) => {
        fix = f;
        if (pid) return;
        const n = nearest(f);
        const where = root.querySelector('#where');
        if (n && sel) { sel.value = n.p.id; where.innerHTML = str(html`Adding to <b>${n.p.address}</b> (you're here)`); }
        else where.textContent = f ? 'Pick the property below.' : 'Pick the property below.';
      });
      const input = root.querySelector('#photo');
      input?.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        photo = await store.shrinkPhoto(file).catch(() => file);
        const pp = root.querySelector('#pp');
        pp.innerHTML = `<img alt="" src="${URL.createObjectURL(photo)}">`;
        pp.appendChild(input);
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(form).entries());
        const property_id = v.property_id || null;
        if (k.table !== 'expenses' && !property_id) return toast('Pick the property');
        let photo_id = null;
        if (photo) { photo_id = store.uid(); await store.putPhoto(photo_id, photo); }
        if (k.table === 'access') {
          if (!v.code && !v.label && !v.location_note && !photo) return toast('Add a code, where it is, or a photo');
          store.save('access', {
            property_id, kind, label: v.label || (kind === 'lockbox' && /^supra|#/i.test(v.code || '') ? v.code : k.label),
            code: kind === 'lockbox' && /^supra/i.test(v.code || '') ? '' : (v.code || ''),
            location_note: v.location_note || '', photo_id, lat: fix?.lat ?? null, lng: fix?.lng ?? null,
            ...(k.tracked ? { status: 'out' } : {})
          });
        } else if (k.table === 'notes') {
          if (!v.text) return toast('Say or type the note');
          store.save('notes', { property_id, text: kind === 'feedback' ? `Showing feedback: ${v.text}` : v.text });
        } else if (k.table === 'people') {
          if (!v.name) return toast('Add a name');
          store.save('people', { property_id, name: v.name, role: v.role, phone: v.phone, email: v.email });
        } else if (k.table === 'expenses') {
          if (!v.amount) return toast('Add the amount');
          store.save('expenses', { property_id, amount: Number(v.amount), what: v.what, date: v.date || todayIso(), photo_id });
        }
        toast(`Saved${property_id ? ' to ' + addr(property_id) : ''}`);
        location.hash = property_id ? `#/p/${property_id}` : '#/miles';
      });
    }
  };
}

// ======================================================================
// SIGNS & LOCKBOXES
// ======================================================================

let signTab = 'pickup';
function viewSigns() {
  const items = store.all('access').filter((a) => KINDS[a.kind]?.tracked);
  const pick = new Set(pickups().map((a) => a.id));
  const out = items.filter((a) => a.status === 'out' && !pick.has(a.id));
  const office = items.filter((a) => a.status === 'office');
  const list = signTab === 'pickup' ? items.filter((a) => pick.has(a.id)) : signTab === 'out' ? out : office;
  const tab = (k, l) => html`<button class="tab ${signTab === k ? 'on' : ''}" type="button" data-t="${k}">${l}</button>`;
  return {
    html: html`${header({
      back: '#/',
      kicker: 'Signs & lockboxes',
      extra: html`<div class="stats"><div class="stat"><span class="n">${items.filter((a) => a.status === 'out').length}</span><span class="l">Out</span></div><div class="stat"><span class="n">${office.length}</span><span class="l">In the office</span></div><div class="stat"><span class="n" style="color:var(--code)">${pick.size}</span><span class="l">To pick up</span></div></div>`
    })}
    <main class="wrap">
      <div class="tabs">${tab('pickup', `Pick up · ${pick.size}`)}${tab('out', `Out · ${out.length}`)}${tab('office', `In the office · ${office.length}`)}</div>
      <div class="sec">${list.length ? list.map((a) => html`<div class="card pad sec" style="${pick.has(a.id) ? 'border-left:4px solid var(--pending)' : ''}">
        <div style="display:flex;justify-content:space-between;gap:8px"><a href="#/p/${a.property_id}" style="color:var(--ink);font-weight:700;font-size:16px">${addr(a.property_id)}</a><span class="num">${a.label || KINDS[a.kind].label}</span></div>
        <div class="small">${a.location_note || ''}</div>
        ${pick.has(a.id) ? html`<div class="wait small">${STATUS[prop(a.property_id)?.status]}: time to pick it up</div>` : ''}
        <div class="btns">
          ${a.status === 'office' ? html`<button class="btn" type="button" data-out="${a.id}">Put it back out</button>` : html`<button class="btn dark" type="button" data-got="${a.id}">${icon('check', 18)}Got it, back in the office</button>`}
          <a class="btn" href="${mapLink(prop(a.property_id) || {})}" target="_blank" rel="noopener">${icon('pin', 18)}Directions</a>
        </div>
      </div>`) : html`<div class="card empty">${signTab === 'pickup' ? 'Nothing to pick up. When a listing closes or cancels, its sign and lockbox show up here.' : 'Nothing here.'}</div>`}</div>
      <a class="btn block" href="#/quick/sign">+ Log a sign or lockbox</a>
    </main>`,
    mount(root) {
      root.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { signTab = b.getAttribute('data-t'); render(); }));
      root.querySelectorAll('[data-got]').forEach((b) => b.addEventListener('click', () => { store.save('access', { id: b.getAttribute('data-got'), status: 'office' }); toast('Back in the office'); }));
      root.querySelectorAll('[data-out]').forEach((b) => b.addEventListener('click', () => store.save('access', { id: b.getAttribute('data-out'), status: 'out' })));
    }
  };
}

// ======================================================================
// PLAN A TOUR (talk or type) and TOUR MODE
// ======================================================================

// Planning a tour is three steps: say it, check the stops, see the route.
// Dictation gets things wrong, so the agent always sees and can fix each stop
// before the route is built, and can come back to fix one after (Sara,
// 2026-10-23: "add a correct route, not a start over").
const plan = { step: 'talk', text: '', stops: [], startText: '10:00', startMinutes: 600, start: null, result: null, busy: false, client: '', date: todayIso(), manual: false, order: [] };

// Work the route out again after a time is pinned or a stop is dragged.
// Bestie's order unless the agent has put the stops in their own order.
function replan() {
  const stops = plan.stops.filter((st) => st.address.trim()).map((st) => ({
    id: st.id, address: st.address, property_id: st.property_id, lat: st.lat, lng: st.lng, approximate: !!st.approximate,
    at: st.atText ? parseClock(st.atText.replace(/\s/g, '')) : null,
    occ: st.property_id ? prop(st.property_id)?.occupancy || '' : ''
  }));
  if (plan.manual) {
    const pos = new Map(plan.order.map((id, i) => [id, i]));
    stops.sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 999) - (pos.has(b.id) ? pos.get(b.id) : 999));
    plan.result = routeInOrder({ start: plan.start, startMinutes: plan.startMinutes, stops });
  } else {
    plan.result = planRoute({ start: plan.start, startMinutes: plan.startMinutes, stops });
  }
}

// Tap a home on the route: pin its showing time, move it, or take it off.
function stopSheet(id) {
  const st = plan.stops.find((x) => x.id === id);
  if (!st) return;
  const occ = st.property_id ? prop(st.property_id)?.occupancy : '';
  const ids = plan.result.legs.map((l) => l.id);
  const i = ids.indexOf(id);
  const reorder = (to) => {
    const next = ids.slice();
    next.splice(i, 1);
    next.splice(to, 0, id);
    plan.order = next; plan.manual = true;
  };
  openSheet(html`<div class="sec">
    <div class="title" style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase">${st.address}</div>
    ${occ === 'O' ? html`<div class="warn-box"><b>Owner-occupied.</b> Set the time the owner gave you and the rest of the tour moves around it.</div>` : ''}
    <label class="field"><span>Showing time</span><input id="sttime" value="${st.atText}" placeholder="Any time, or a set time like 11:00" autocomplete="off"></label>
    <div class="btns"><button class="btn dark" type="button" id="stsave">Set this time</button><button class="btn" type="button" id="stany">Any time</button></div>
    <div class="btns"><button class="btn" type="button" id="stup" ${i === 0 ? raw('disabled') : ''}>Show earlier</button><button class="btn" type="button" id="stdown" ${i === ids.length - 1 ? raw('disabled') : ''}>Show later</button></div>
    <button class="btn ghost block" type="button" id="strm">${icon('trash', 16)}Take off this tour</button>
    <button class="btn ghost block" type="button" id="stcancel">Cancel</button>
  </div>`, (sh) => {
    const done = () => { replan(); closeSheet(); render(); };
    sh.querySelector('#stsave').addEventListener('click', () => {
      const v = sh.querySelector('#sttime').value.trim();
      if (v && parseClock(v.replace(/\s/g, '')) == null) return toast('Try a time like 11:00 or 2:30 pm');
      st.atText = v; done();
    });
    sh.querySelector('#stany').addEventListener('click', () => { st.atText = ''; done(); });
    sh.querySelector('#stup').addEventListener('click', () => { reorder(i - 1); done(); });
    sh.querySelector('#stdown').addEventListener('click', () => { reorder(i + 1); done(); });
    sh.querySelector('#strm').addEventListener('click', () => {
      plan.stops = plan.stops.filter((x) => x.id !== id);
      plan.order = plan.order.filter((x) => x !== id);
      if (!plan.stops.length) { plan.step = 'check'; plan.stops = [planStop()]; closeSheet(); render(); return; }
      done();
    });
    sh.querySelector('#stcancel').addEventListener('click', closeSheet);
  });
}

// Drag a stop by its handle. Pointer events cover finger and mouse; the row
// moves live as it passes the middle of its neighbours.
function wireDrag(root) {
  root.querySelectorAll('[data-drag]').forEach((h) => h.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const row = h.closest('.rleg');
    const list = row.parentElement;
    row.classList.add('dragging');
    // Listen on the whole window: moving the row in the page drops a
    // handle's pointer capture, and the finger would be lost mid-drag.
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      const others = [...list.querySelectorAll('.rleg')].filter((r) => r !== row);
      const before = others.find((r) => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
      if (before) { if (row.nextElementSibling !== before) list.insertBefore(row, before); }
      else if (list.lastElementChild !== row) list.appendChild(row);
    };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      row.classList.remove('dragging');
      const ids = [...list.querySelectorAll('.rleg')].map((r) => r.dataset.id);
      if (ids.join() !== plan.result.legs.map((l) => l.id).join()) {
        plan.order = ids; plan.manual = true;
        replan();
        render();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }));
}

// ---------- a stop's own field notes: code, notes, MLS sheet, photos ----------
// The same fields in the planner (before the tour exists) and on every tour
// card, typed right on the card. Saving never redraws the page (Sara,
// 2026-10-25: "code and note field that dont open a new screen - user saves
// and it doesnt need to refresh").
function fileThumb(f) {
  const path = store.photoPath(f);
  return html`<button type="button" class="page" data-openf="${f.id}" data-path="${path}" aria-label="Open ${f.kind === 'mls' ? 'MLS sheet' : 'photo'}">${f.type === 'application/pdf' ? html`<span class="pdf">PDF</span>` : html`<img alt="" data-photo="${f.id}" data-path="${path}">`}${f.kind === 'mls' ? html`<span class="ftag">MLS</span>` : ''}</button>`;
}
// Every picture carries its own note (Sara, 2026-10-25: "each photo must have
// a note field"): what it shows, said once, beside it.
function fileItem(f) {
  return html`<div class="fitem" data-fid="${f.id}">${fileThumb(f)}<label class="fnote"><span class="sr">Note for this ${f.kind === 'mls' ? 'MLS sheet' : 'photo'}</span><textarea data-fnote rows="3" placeholder="${f.kind === 'mls' ? 'Note: which page, anything to watch for' : 'Note: what this shows (cracked tile, back deck view)'}">${f.note || ''}</textarea></label></div>`;
}
const withFileNotes = (files, box) => (files || []).map((f) => {
  const el = box.querySelector(`[data-fid="${f.id}"] [data-fnote]`);
  return el ? { ...f, note: el.value.trim() } : f;
});

function stopFieldsHtml(s, key, { live = false } = {}) {
  return html`<div class="stopf" data-stopf="${key}">
    <div class="grid2">
      <label class="field"><span>${s.code_label || 'Code'}</span><input class="codein" data-sf="code" value="${s.code || ''}" placeholder="Type the code" autocomplete="off" autocapitalize="characters"></label>
      <label class="field"><span>MLS link</span><input data-sf="mls_url" type="url" inputmode="url" value="${s.mls_url || ''}" placeholder="Paste the link" autocomplete="off"></label>
    </div>
    <label class="field"><span>Notes</span><textarea data-sf="notes" rows="2" placeholder="Gate sticks, dog in the yard, buyers loved the deck">${s.notes || ''}</textarea></label>
    <div class="fitems" data-sfthumbs>${(s.files || []).map(fileItem)}</div>
    <div class="btns">
      <label class="btn">${icon('sheet', 18)}MLS sheet<input type="file" accept="image/*,application/pdf" multiple data-sffile="mls" hidden></label>
      <label class="btn">${icon('photo', 18)}Photo note<input type="file" accept="image/*" capture="environment" data-sffile="photo" hidden></label>
    </div>
    ${s.mls_url ? html`<a class="small" data-sfopen href="${safeUrl(s.mls_url)}" target="_blank" rel="noopener">Open the MLS listing ↗</a>` : html`<a class="small" data-sfopen href="#" target="_blank" rel="noopener" hidden>Open the MLS listing ↗</a>`}
    ${live ? '' : html`<div class="sfsave"><button class="btn dark" type="button" data-sfsave>Save</button><span class="small ok" data-sfmsg aria-live="polite"></span></div>`}
  </div>`;
}

// get(key) -> the stop now; put(key, patch) stores it. live: every keystroke
// is kept (planner); otherwise Save, or leaving a box, stores it quietly.
function wireStopFields(root, { get, put, live = false }) {
  root.querySelectorAll('[data-stopf]').forEach((box) => {
    const key = box.getAttribute('data-stopf');
    const msg = box.querySelector('[data-sfmsg]');
    const say = (t) => { if (!msg) return; msg.textContent = t; clearTimeout(msg._t); msg._t = setTimeout(() => (msg.textContent = ''), 2500); };
    const read = () => ({ ...Object.fromEntries([...box.querySelectorAll('[data-sf]')].map((el) => [el.getAttribute('data-sf'), el.value.trim()])), files: withFileNotes((get(key) || {}).files, box) });
    const saveNote = (el) => {
      const fid = el.closest('[data-fid]').getAttribute('data-fid');
      put(key, { files: withFileNotes((get(key) || {}).files, box) }, { noteFor: fid });
      if (!live) say('Note saved ✓');
    };
    box.addEventListener(live ? 'input' : 'change', (e) => { if (e.target.matches('[data-fnote]')) saveNote(e.target); });
    const showLink = () => {
      const a = box.querySelector('[data-sfopen]');
      const u = box.querySelector('[data-sf=mls_url]').value.trim();
      a.hidden = !/^https?:\/\//i.test(u);
      a.href = safeUrl(u);
    };
    box.querySelectorAll('[data-sf]').forEach((el) => {
      el.addEventListener('input', () => { if (live) put(key, { [el.getAttribute('data-sf')]: el.value.trim() }); if (el.getAttribute('data-sf') === 'mls_url') showLink(); });
      if (!live) el.addEventListener('change', () => { put(key, read()); say('Saved ✓'); });
    });
    box.querySelector('[data-sfsave]')?.addEventListener('click', () => { put(key, read()); say('Saved ✓'); });
    box.querySelectorAll('[data-sffile]').forEach((input) => input.addEventListener('change', async () => {
      const kind = input.getAttribute('data-sffile');
      const added = [];
      for (const file of [...input.files]) {
        const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
        if (pdf && file.size > 20 * 1024 * 1024) { toast('That PDF is over 20 MB'); continue; }
        const blob = pdf ? file : await store.shrinkPhoto(file, kind === 'mls' ? 2000 : 1600).catch(() => file);
        const f = { id: store.uid(), type: pdf ? 'application/pdf' : 'image/jpeg', kind, at: new Date().toISOString() };
        await store.putPhoto(f.id, blob);
        added.push(f);
      }
      input.value = '';
      if (!added.length) return;
      const files = [...((get(key) || {}).files || []), ...added];
      put(key, { files }, { added });
      const thumbs = box.querySelector('[data-sfthumbs]');
      thumbs.insertAdjacentHTML('beforeend', added.map((f) => str(fileItem(f))).join(''));
      loadPhotos(thumbs);
      thumbs.querySelector(`[data-fid="${added[added.length - 1].id}"] [data-fnote]`)?.focus();
      say(kind === 'mls' ? 'MLS sheet saved ✓' : 'Photo saved ✓');
    }));
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-openf]');
      if (b) openFile(b.getAttribute('data-openf'), b.getAttribute('data-path'));
    });
  });
  loadPhotos(root);
}

function planStop(address = '', at = null) {
  return { id: store.uid(), address, atText: at != null ? formatClock(at) : '', lat: null, lng: null, property_id: null, tried: false };
}

function viewPlan() {
  const r = plan.result;
  const step = plan.step;
  const title = step === 'route' && r ? `${r.legs.length} home${r.legs.length === 1 ? '' : 's'}` : step === 'check' ? 'Check the stops' : 'Talk to build a route';
  const sub = step === 'route' && r ? `About ${Math.round(r.miles)} mi · ${driveMinutes(r.miles)} min driving · back by ${formatClock(r.end)}`
    : step === 'check' ? 'Fix anything dictation got wrong, then build the route.' : 'Read me the addresses in any order.';
  return {
    form: true,
    html: html`${header({ back: '#/tours', kicker: 'Plan a tour', title, sub })}
    <main class="wrap">
      ${step === 'talk' ? html`<section class="sec">
        <label class="field"><span>Addresses</span><textarea id="tt" style="min-height:150px" placeholder="Start at 10. 433 East Highway 4 Murphys, go to 324 Augusta Court Valley Springs, then 1143 Echo Street Angels Camp at 11:30">${plan.text}</textarea></label>
        <button class="btn big block" type="button" data-mic="tt">${icon('mic', 22)}Tap and talk</button>
        <div class="hint">Say “start at 10”, then each address with its town. “At 11:30” after an address keeps that time. You'll check every stop next.</div>
        <div class="grid2">${fieldHtml({ name: 'client', label: 'Who is it for?', placeholder: 'Buyer name' }, plan.client)}${fieldHtml({ name: 'date', label: 'Date', type: 'date' }, plan.date)}</div>
        <button class="btn dark big block" type="button" id="read">Next: check the stops</button>
        <button class="btn ghost block" type="button" id="typeit">Or type them one at a time</button>
      </section>` : ''}

      ${step === 'check' ? html`<section class="sec">
        <div class="grid2">
          ${fieldHtml({ name: 'starttime', label: 'Start time', placeholder: '10:00' }, plan.startText)}
          ${fieldHtml({ name: 'date', label: 'Date', type: 'date' }, plan.date)}
        </div>
        <div class="card list">${plan.stops.map((s, i) => html`<div class="row" style="align-items:flex-start;flex-wrap:wrap">
          <span class="dot" style="background:var(--ink);width:30px;height:30px;font-family:var(--tall);font-size:15px;margin-top:8px">${i + 1}</span>
          <div class="grow" style="gap:6px">
            <input class="stopaddr" data-i="${i}" value="${s.address}" placeholder="Street number, street, town" aria-label="Stop ${i + 1} address" style="min-height:44px;border:1px solid ${s.tried && s.lat == null ? 'var(--pending)' : '#b9c1be'};border-radius:8px;padding:8px 10px;font-size:16px;width:100%">
            ${s.tried && s.lat == null ? html`<span class="small wait">Couldn't find this on the map. Check the number and add the town.</span>` : ''}
            ${s.tried && s.approximate ? html`<span class="small wait">Street not found, so it's placed at the town center. Fine for the order; check the number if you can.</span>` : ''}
            <input class="stoptime" data-i="${i}" value="${s.atText}" placeholder="Any time (or a set time like 11:30)" aria-label="Stop ${i + 1} time" style="min-height:40px;border:1px solid #d5dad8;border-radius:8px;padding:6px 10px;font-size:15px;width:100%">
            <details class="stopf-more" ${s.code || s.notes || s.mls_url || (s.files || []).length ? raw('open') : ''}><summary>Code, notes, MLS sheet</summary>${stopFieldsHtml(s, s.id, { live: true })}</details>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <button class="icon-btn" type="button" data-up="${i}" aria-label="Move up" ${i === 0 ? raw('disabled') : ''}>${icon('back', 16, 'style="transform:rotate(90deg)"')}</button>
            <button class="icon-btn" type="button" data-rm="${i}" aria-label="Remove stop">${icon('trash', 16)}</button>
          </div>
        </div>`)}</div>
        <button class="btn block" type="button" id="addstop">+ Add a stop</button>
        <button class="btn dark big block" type="button" id="build" ${plan.busy ? raw('disabled') : ''}>${plan.busy ? 'Finding the addresses…' : 'Build the route'}</button>
        <button class="btn ghost block" type="button" id="totalk">${icon('mic', 18)}Back to talking</button>
      </section>` : ''}

      ${step === 'route' && r ? html`
        ${plan.manual ? html`<div class="${r.late > 0 ? 'warn-box' : 'note-box'}"><b>Your order.</b> ${r.late > 0 ? `It misses a set time (marked below). Bestie's order keeps every set time.` : r.bestSavesMinutes > 2 ? `Bestie's order would finish about ${r.bestSavesMinutes} minutes sooner.` : `About as quick as Bestie's order.`}
          <button class="btn" type="button" id="usebest" style="margin-top:8px;min-height:40px;width:100%">Use Bestie's order</button></div>`
          : r.savedMinutes > 2 ? html`<div class="note-box"><b>Saves about ${r.savedMinutes} minutes</b> over the order you said.</div>` : ''}
        ${r.late > 0 && !plan.manual ? html`<div class="warn-box">A set time can't be met (marked below). Ask to move that showing, or drag the order yourself.</div>` : ''}
        ${r.unplaced.length ? html`<div class="warn-box">I couldn't find ${r.unplaced.map((u) => u.address).join(', ')} on the map. Tap <b>Edit the stops</b> to fix ${r.unplaced.length > 1 ? 'them' : 'it'}.</div>` : ''}
        <div class="hint">Drag <b>≡</b> to change the order. Tap a home to set its showing time.</div>
        <div class="card list" id="routelist">${r.legs.map((l, i) => html`<div class="row rleg" data-id="${l.id}" style="padding-left:4px;gap:6px">
          <button class="drag" type="button" data-drag aria-label="Drag to move ${l.address}">${icon('grip', 22)}</button>
          <button type="button" data-leg="${l.id}" style="flex:1;min-width:0;display:flex;align-items:center;gap:10px;background:none;border:0;padding:0;text-align:left;color:var(--ink);cursor:pointer">
            <span class="dot" style="background:var(--ink);width:30px;height:30px;font-family:var(--tall);font-size:15px;flex-shrink:0">${i + 1}</span>
            <span class="grow"><span class="t">${l.address}${l.occ ? html` ${occBadge(l.occ)}` : ''}</span>
              <span class="s">${[l.at != null ? `Set time ${formatClock(l.at)}` : l.occ === 'O' ? 'Owner-occupied: tap to set the time' : '', l.property_id ? 'Codes on file' : '', l.lat != null ? (i === 0 ? `${Math.round(l.legMiles * 10) / 10} mi from the start` : `${Math.round(l.legMiles * 10) / 10} mi · ${l.legMinutes} min drive`) : 'Not found on the map: time unknown'].filter(Boolean).join(' · ')}</span>
              ${l.approximate ? html`<span class="s wait">Street not found: placed at the town center</span>` : ''}
              ${l.waitMinutes > 0 ? html`<span class="s ok">Early: wait ${l.waitMinutes} min</span>` : ''}${l.lateMinutes > 0 ? html`<span class="s wait">${l.lateMinutes} min late for the set time</span>` : ''}
            </span>
          </button>
          <span class="num" style="font-size:18px;${l.lateMinutes > 0 ? 'color:var(--pending)' : ''}">${l.arrive != null ? formatClock(l.arrive) : '—'}</span></div>`)}</div>
        <div class="hint">Drive times are estimates from distance. “Open in Maps” has the real ones.</div>
        <a class="btn block" href="${mapsUrl(plan.start, r.legs)}" target="_blank" rel="noopener">${icon('pin', 18)}Open in Maps</a>
        <button class="btn dark big block" type="button" id="savetour">Save as the tour</button>
        <button class="btn block" type="button" id="edit">${icon('edit', 18)}Edit the stops</button>
        <button class="btn ghost block" type="button" id="again">Start over</button>` : ''}
    </main>`,
    mount(root) {
      wireMics(root);
      const tt = root.querySelector('#tt');
      tt?.addEventListener('input', () => (plan.text = tt.value));
      root.querySelector('[name=client]')?.addEventListener('input', (e) => (plan.client = e.target.value));
      root.querySelectorAll('[name=date]').forEach((el) => el.addEventListener('input', (e) => (plan.date = e.target.value)));
      root.querySelector('[name=starttime]')?.addEventListener('input', (e) => (plan.startText = e.target.value));
      // Typing in a stop updates it in place; a changed address is looked up again.
      root.querySelectorAll('.stopaddr').forEach((el) => el.addEventListener('input', () => {
        const s = plan.stops[Number(el.dataset.i)];
        s.address = el.value; s.lat = null; s.lng = null; s.property_id = null; s.tried = false;
      }));
      root.querySelectorAll('.stoptime').forEach((el) => el.addEventListener('input', () => (plan.stops[Number(el.dataset.i)].atText = el.value)));
      wireStopFields(root, { live: true, get: (k) => plan.stops.find((x) => x.id === k), put: (k, patch) => Object.assign(plan.stops.find((x) => x.id === k) || {}, patch) });
      root.querySelector('#read')?.addEventListener('click', () => {
        const parsed = parseTourText(plan.text);
        if (parsed.startMinutes != null) plan.startText = formatClock(parsed.startMinutes);
        plan.stops = parsed.stops.map((s) => planStop(s.address, s.at));
        if (!plan.stops.length) plan.stops = [planStop()];
        plan.step = 'check';
        render();
      });
      root.querySelector('#typeit')?.addEventListener('click', () => { plan.stops = [planStop(), planStop(), planStop()]; plan.step = 'check'; render(); });
      root.querySelector('#addstop')?.addEventListener('click', () => { plan.stops.push(planStop()); render(); root.ownerDocument.querySelectorAll('.stopaddr')[plan.stops.length - 1]?.focus(); });
      root.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { plan.stops.splice(Number(b.dataset.rm), 1); render(); }));
      root.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => {
        const i = Number(b.dataset.up);
        if (i > 0) [plan.stops[i - 1], plan.stops[i]] = [plan.stops[i], plan.stops[i - 1]];
        render();
      }));
      root.querySelector('#totalk')?.addEventListener('click', () => { plan.step = 'talk'; render(); });
      root.querySelector('#build')?.addEventListener('click', buildPlan);
      root.querySelector('#edit')?.addEventListener('click', () => { plan.step = 'check'; render(); });
      root.querySelector('#again')?.addEventListener('click', () => {
        if (!confirm('Clear these stops and start again?')) return;
        Object.assign(plan, { step: 'talk', text: '', stops: [], result: null, manual: false, order: [] });
        render();
      });
      wireDrag(root);
      root.querySelectorAll('[data-leg]').forEach((b) => b.addEventListener('click', () => stopSheet(b.dataset.leg)));
      root.querySelector('#usebest')?.addEventListener('click', () => { plan.manual = false; plan.order = []; replan(); render(); });
      root.querySelector('#savetour')?.addEventListener('click', () => {
        const tour = store.save('tours', {
          name: plan.client ? `${plan.client} · home tour` : 'Home tour',
          buyer: (plan.client || '').trim(),
          date: plan.date || todayIso(),
          start_place: plan.start?.address || 'Start',
          start_lat: plan.start?.lat ?? null, start_lng: plan.start?.lng ?? null,
          start_minutes: plan.startMinutes,
          miles: Math.round(plan.result.miles * 10) / 10,
          stops: plan.result.legs.map((l) => tourStop(l))
        });
        Object.assign(plan, { step: 'talk', text: '', stops: [], result: null, manual: false, order: [] });
        location.hash = `#/tour/${tour.id}`;
      });
    }
  };
}

// A stop carries a copy of what the agent needs at the door, so tour mode works
// offline and for other agents' listings that are not saved properties.
function tourStop(l) {
  const typed = plan.stops.find((x) => x.id === l.id) || {};
  const p = l.property_id ? prop(l.property_id) : null;
  const code = p ? codesOf(p.id).find((a) => a.code) : null;
  const box = p ? store.where('access', 'property_id', p.id).find((a) => a.kind === 'lockbox') : null;
  const person = p ? store.where('people', 'property_id', p.id).find((m) => m.phone) : null;
  return {
    id: store.uid(), property_id: l.property_id || null, address: l.address, lat: l.lat ?? null, lng: l.lng ?? null,
    at: l.at ?? null, arrive: l.arrive ?? null, approximate: !!l.approximate, leg_miles: Math.round((l.legMiles || 0) * 10) / 10, leg_minutes: l.legMinutes || 0,
    occ: p?.occupancy || '', well: !!p?.well, septic: !!p?.septic,
    code_label: !typed.code && code ? code.label || KINDS[code.kind]?.label : 'Code', code: typed.code || (code ? code.code : ''), code_pending: false,
    mls_url: typed.mls_url || '', files: typed.files || [],
    access_note: [box && `${box.label}: ${box.location_note || ''}`, p?.showing_notes].filter(Boolean).join(' · '),
    // On our own listing the contact is the seller or tenant, not a listing agent.
    agent: person ? [person.name, person.role && `(${person.role})`].filter(Boolean).join(' ') : '', agent_phone: person ? person.phone : '', confirmed: false, shown: false, notes: typed.notes || ''
  };
}

async function buildPlan() {
  plan.stops = plan.stops.filter((s) => s.address.trim());
  if (!plan.stops.length) return toast('Add at least one address');
  const startMinutes = parseClock(plan.startText.replace(/\s/g, ''));
  if (startMinutes == null) return toast('Check the start time, for example 10:00');
  plan.busy = true;
  render();
  const s = store.settings();
  plan.start = s.homeBase || null;
  if (!plan.start) {
    const fix = await locate({ quiet: true });
    plan.start = fix ? { address: 'My location', lat: fix.lat, lng: fix.lng } : null;
  }
  for (const st of plan.stops) {
    if (st.lat != null) continue; // already found; only changed stops are looked up again
    const p = matchProperty(st.address, props());
    if (p && p.lat != null) Object.assign(st, { address: p.address, property_id: p.id, lat: p.lat, lng: p.lng });
    else {
      const g = await geocode(st.address); // the server adds the state and tries other spellings
      Object.assign(st, { property_id: p ? p.id : null, lat: g?.lat ?? null, lng: g?.lng ?? null, approximate: !!g?.approximate });
    }
    st.tried = true;
  }
  if (!plan.start) {
    const first = plan.stops.find((x) => x.lat != null);
    plan.start = first ? { address: first.address, lat: first.lat, lng: first.lng } : null;
  }
  // "Build the route" always means Bestie's best order around any set times.
  plan.startMinutes = startMinutes;
  plan.manual = false;
  plan.order = [];
  replan();
  const stops = plan.result.legs;
  plan.busy = false;
  // Nothing found at all: stay on the check screen with each problem marked.
  plan.step = stops.some((x) => x.lat != null) ? 'route' : 'check';
  if (plan.step === 'check') toast('None of these were found on the map. Check the numbers and towns.');
  render();
}

function viewTours() {
  const list = store.all('tours').slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return {
    html: html`${header({ kicker: 'Tours', title: 'Showing tours', right: html`<a class="btn teal" href="#/plan" style="min-height:40px">+ Plan</a>` })}
    <main class="wrap">
      <a class="card row" href="#/plan">${icon('mic', 22)}<span class="grow"><span class="t">Talk to plan a tour</span><span class="s">Addresses in any order; I'll route them</span></span>${icon('chev', 18)}</a>
      <a class="card row" href="#/buyers">${raw(reactionFace('like', { size: 26, label: '' }))}<span class="grow"><span class="t">Buyers</span><span class="s">Every home each buyer saw, and what they thought</span></span>${icon('chev', 18)}</a>
      <div class="card list">${list.length ? list.map((t) => html`<a class="row" href="#/tour/${t.id}"><span class="grow"><span class="t">${t.name}</span><span class="s">${niceDate(t.date)} · ${(t.stops || []).length} stops${t.finished ? ' · done' : ''}</span></span>${icon('chev', 18)}</a>`) : buddy('No tours yet. Tap Plan a tour and read me the addresses.')}</div>
    </main>`
  };
}

function viewTour(id) {
  const t = store.get('tours', id);
  if (!t) return notFound();
  const stops = t.stops || [];
  const phones = [...new Set(stops.map((s) => s.agent_phone).filter(Boolean))];
  const save = (patch, opts) => store.save('tours', { id, ...patch }, opts);
  // Always from the store: a code typed on a card is saved quietly, so the
  // stops this screen was drawn with may be older than what is stored.
  const fresh = () => store.get('tours', id)?.stops || [];
  const setStop = (sid, patch, opts) => save({ stops: fresh().map((s) => (s.id === sid ? { ...s, ...patch } : s)) }, opts);
  const quietSave = (patch) => store.save('tours', { id, ...patch }, { quiet: true });
  // Occupancy in words: a bare "?" meant nothing to anyone (Cowork, 2026-10-23).
  const occ = (o) => occBadge(o);
  return {
    html: html`${header({
      back: '#/tours', kicker: 'Tour mode', title: t.name,
      sub: `${niceDate(t.date)}${t.start_minutes != null ? ' · starts ' + formatClock(t.start_minutes) : ''} · ${stops.length} stops · about ${t.miles || 0} mi`,
      right: buyerOf(t) ? html`<a class="btn" href="#/buyer/${encodeURIComponent(buyerKey(buyerOf(t)))}" style="min-height:40px;background:transparent;color:#fff;border-color:var(--teal-on-dark)">${buyerOf(t)} ›</a>` : html`<button class="btn" type="button" id="setbuyer" style="min-height:40px;background:transparent;color:#fff;border-color:var(--teal-on-dark)">Who is it for?</button>`,
      extra: html`<div class="btns"><button class="btn" type="button" id="late" style="background:transparent;color:#fff;border-color:var(--teal-on-dark)">Running late</button><a class="btn teal" href="${mapsUrl(t.start_lat != null ? { address: t.start_place, lat: t.start_lat, lng: t.start_lng } : null, stops)}" target="_blank" rel="noopener">Route in Maps</a></div>`
    })}
    <main class="wrap">
      ${(() => {
        const withPhone = stops.filter((s) => String(s.agent_phone || '').replace(/\D/g, ''));
        if (!stops.length || t.finished) return '';
        const ok = stops.filter((s) => s.confirmed).length;
        const asked = stops.filter((s) => s.requested_at && !s.confirmed).length;
        return html`<div class="card pad sec">
          <div class="label accent">Showings · ${ok} of ${stops.length} confirmed${asked ? ` · ${asked} waiting` : ''}</div>
          <button class="btn ${ok === stops.length ? '' : 'dark'} block" type="button" id="reqall" ${withPhone.length ? '' : raw('disabled')}>${icon('text', 18)}${asked || ok ? 'Request or remind the listing agents' : 'Text the listing agents to request times'}</button>
          ${withPhone.length ? '' : html`<div class="small">Add the listing agents' phones (Edit stop) to request by text.</div>`}
        </div>`;
      })()}
      ${stops.map((s, i) => html`<div class="card stop ${s.shown ? 'shown' : ''}">
        <div class="stop-head">
          <div class="stop-time">${s.arrive != null ? html`<span class="num">${formatClock(s.arrive)}</span>` : html`<span class="occ-word">Time unknown</span>`}${occ(s.occ)}</div>
          <div class="grow" style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px">
            <div class="label accent">Stop ${i + 1}${s.at != null ? ' · fixed ' + formatClock(s.at) : ''}</div>
            ${s.property_id ? html`<a href="#/p/${s.property_id}" style="color:var(--ink);font-weight:700;font-size:18px">${s.address}</a>` : html`<div style="font-weight:700;font-size:18px">${s.address}</div>`}
            <div class="badges">${s.well ? html`<span class="dot w">W</span>` : ''}${s.septic ? html`<span class="dot s">S</span>` : ''}</div>
            ${s.approximate ? html`<div class="small wait">Street not found on the map: drive times use the town center.</div>` : ''}
            ${s.arrive == null ? html`<div class="small wait">Not on the map, so no time yet. Tap Edit stop to set one.</div>` : ''}
          </div>
        </div>
        ${s.access_note ? html`<div class="card pad small" style="background:var(--bg)">${s.access_note}</div>` : ''}
        ${s.code_pending && !s.code ? html`<div class="small wait">Code still coming</div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="min-width:0"><div style="font-weight:600">${s.agent || 'Listing agent'}</div><div class="small ${s.confirmed ? 'ok' : 'wait'}">${s.confirmed ? '✓ Confirmed' : '☐ Not confirmed yet'}</div></div>
          <div style="display:flex;gap:6px">${s.agent_phone ? html`<a class="icon-btn" href="tel:${digits(s.agent_phone)}" aria-label="Call">${icon('phone', 18)}</a><a class="icon-btn" href="${smsLink(s.agent_phone)}" aria-label="Text">${icon('text', 18)}</a>` : ''}</div>
        </div>
        ${stopFieldsHtml(s, s.id)}
        ${s.reaction ? html`<button class="stop-react" type="button" data-react="${s.id}" aria-label="Their reaction: ${reactionLabel(s.reaction)}. Tap to change">${raw(reactionFace(s.reaction, { size: 34 }))}<span><b>${reactionLabel(s.reaction)}</b>${s.reaction_note ? html`<span class="small"> · ${s.reaction_note}</span>` : ''}</span></button>`
          : s.shown ? html`<button class="btn ghost block" type="button" data-react="${s.id}">How did they like it?</button>` : ''}
        ${s.reaction && s.agent_phone ? html`<button class="btn ghost block" type="button" data-fb="${s.id}">${s.feedback_sent_at ? html`✓ Feedback sent to ${(s.agent || 'agent').split(' ')[0]} · send again` : html`${icon('text', 16)}Text feedback to ${(s.agent || 'the listing agent').split('(')[0].trim()}`}</button>` : ''}
        ${s.requested_at && !s.confirmed ? html`<div class="small wait">Showing requested ${niceDate(s.requested_at.slice(0, 10))} · waiting to hear back</div>` : ''}
        <a class="btn door-btn block" href="#/door/${id}/${i}">${icon('key', 18)}At the door</a>
        <div class="btns">
          <a class="btn" href="${mapLink(s)}" target="_blank" rel="noopener">Navigate</a>
          <button class="btn ${s.shown ? 'green' : 'dark'}" type="button" data-shown="${s.id}">${s.shown ? '✓ Shown' : 'Mark shown'}</button>
        </div>
        <div class="btns"><button class="btn ghost" type="button" data-editstop="${s.id}">${icon('edit', 16)}Edit stop</button><button class="btn ghost" type="button" data-confirm="${s.id}">${s.confirmed ? 'Undo confirmed' : 'Mark confirmed'}</button></div>
      </div>
      ${i < stops.length - 1 && stops[i + 1].leg_miles ? html`<div class="leg">↓ about ${stops[i + 1].leg_minutes} min · ${stops[i + 1].leg_miles} mi${occWord(stops[i + 1].occ) ? ` · next is ${occWord(stops[i + 1].occ).toLowerCase()}` : ''}</div>` : ''}`)}
      ${stops.some((s) => s.shown) ? html`<button class="btn big block" type="button" id="recap">${icon('text', 18)}${t.recap_sent_at ? 'Send the recap again' : `Send ${buyerOf(t) ? buyerOf(t).split(' ')[0] : 'your buyer'} the tour recap`}</button>` : ''}
      ${t.finished ? html`<div class="note-box">Tour finished. ${t.trip_id ? 'The miles are in your mileage log.' : ''}</div>` : html`<button class="btn dark big block" type="button" id="finish">Finish tour and log the miles</button>`}
      <button class="btn ghost block" type="button" id="deltour">${icon('trash', 16)}Delete this tour</button>
    </main>`,
    mount(root) {
      wireStopFields(root, {
        get: (k) => fresh().find((x) => x.id === k),
        put: (k, patch, { added, noteFor } = {}) => {
          const before = fresh().find((x) => x.id === k) || {};
          quietSave({ stops: fresh().map((x) => (x.id === k ? { ...x, ...patch } : x)) });
          if (!before.property_id) return;
          // The property's copy of a picture shows the same note.
          for (const f of patch.files || []) {
            if (noteFor && f.id !== noteFor) continue;
            const n = store.all('notes').find((x) => x.property_id === before.property_id && (x.files || []).some((y) => y.id === f.id));
            if (!n) continue;
            const files = n.files.map((y) => (y.id === f.id ? { ...y, note: f.note || '' } : y));
            const head = n.source === 'mls_sheet' ? 'MLS sheet (from a tour)' : 'Photo note from a showing';
            const said = files.map((y) => y.note).filter(Boolean);
            store.save('notes', { id: n.id, files, text: said.length ? `${head}: ${said.join(' · ')}` : head }, { quiet: true });
          }
          // On a saved property the code and pictures go on the property too.
          if (patch.code && patch.code !== before.code && !store.where('access', 'property_id', before.property_id).some((a) => a.code === patch.code)) {
            const label = before.code_label && before.code_label !== 'Code' ? before.code_label : 'Lockbox';
            store.save('access', { property_id: before.property_id, kind: 'lockbox', label, code: patch.code }, { quiet: true });
          }
          if (added && added.length) {
            const mls = added[0].kind === 'mls';
            store.save('notes', { property_id: before.property_id, text: mls ? 'MLS sheet (from a tour)' : 'Photo note from a showing', source: mls ? 'mls_sheet' : 'showing_photo', files: added }, { quiet: true });
          }
        }
      });
      root.querySelectorAll('[data-shown]').forEach((b) => b.addEventListener('click', () => {
        const s = fresh().find((x) => x.id === b.getAttribute('data-shown'));
        setStop(s.id, { shown: !s.shown });
        if (!s.shown) setTimeout(() => reactionPicker(s), 300);
      }));
      root.querySelectorAll('[data-react]').forEach((b) => b.addEventListener('click', () => {
        reactionPicker(fresh().find((x) => x.id === b.getAttribute('data-react')));
      }));
      root.querySelectorAll('[data-confirm]').forEach((b) => b.addEventListener('click', () => {
        const s = fresh().find((x) => x.id === b.getAttribute('data-confirm'));
        setStop(s.id, { confirmed: !s.confirmed });
      }));
      root.querySelectorAll('[data-editstop]').forEach((b) => b.addEventListener('click', () => {
        const s = fresh().find((x) => x.id === b.getAttribute('data-editstop'));
        formSheet({
          title: s.address,
          fields: [
            { name: 'code_label', label: 'Code is for', placeholder: 'Lockbox code / Gate code' },
            { name: 'code', label: 'Code', type: 'code' },
            { name: 'code_pending', label: 'Code still coming', type: 'check' },
            { name: 'access_note', label: 'Access', type: 'textarea', placeholder: 'Supra on the side door. Knock first.' },
            { name: 'occ', label: 'Occupancy', type: 'select', options: [['', 'Ask the agent (?)'], ['O', 'Occupied (O)'], ['V', 'Vacant (V)']] },
            { name: 'agent', label: 'Listing agent' },
            { name: 'agent_phone', label: 'Agent phone', type: 'tel' },
            { name: 'arrive_text', label: 'Time', placeholder: '10:30' },
            { name: 'notes', label: 'Private notes', type: 'textarea' }
          ],
          values: { ...s, arrive_text: s.arrive != null ? formatClock(s.arrive) : '' },
          onSave(v) {
            const { arrive_text, ...rest } = v;
            const m = parseClock(arrive_text.replace(/\s/g, ''));
            setStop(s.id, { ...rest, ...(m != null ? { arrive: m } : {}) });
          }
        });
      }));
      root.querySelector('#late').addEventListener('click', () => {
        if (!phones.length) return toast('Add the listing agents’ phone numbers to the stops first');
        openSheet(html`<div class="sec">
          <div class="title" style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase">Running late</div>
          <div class="tabs">${[10, 15, 30].map((m) => html`<button class="tab" type="button" data-m="${m}">${m} min</button>`)}</div>
          <div class="small">Opens one text to the ${phones.length} listing agent${phones.length > 1 ? 's' : ''} on this tour. You send it.</div>
        </div>`, (sh) => sh.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
          const m = Number(b.getAttribute('data-m'));
          location.href = smsLink(phones, `Hi, it's me with my buyers. We're running about ${m} minutes behind for our showing today. Thank you!`);
          closeSheet();
        })));
      });
      root.querySelector('#finish')?.addEventListener('click', () => {
        formSheet({
          title: 'Log the miles',
          fields: [{ name: 'miles', label: 'Miles driven', type: 'number', hint: 'Estimated from the route. Use your odometer if you have it.' }, { name: 'purpose', label: 'Purpose' }],
          values: { miles: t.miles || '', purpose: t.name },
          saveLabel: 'Finish tour',
          onSave(v) {
            const trip = v.miles ? store.save('trips', { date: t.date, purpose: v.purpose || t.name, from_place: t.start_place, to_place: stops.map((s) => s.address).join(' → '), miles: v.miles, tour_id: id }) : null;
            save({ finished: true, trip_id: trip?.id || null });
            const shown = stops.filter((x) => x.shown).length;
            setTimeout(() => openSheet(html`<div class="sec" style="text-align:center">
              <div class="buddy-empty">${raw(reactionFace('love', { size: 96, label: '' }))}</div>
              <div class="title" style="font-family:var(--tall);font-weight:800;font-size:30px;text-transform:uppercase">Tour done!</div>
              <div>${shown} of ${stops.length} home${stops.length === 1 ? '' : 's'} shown${trip ? ` · ${v.miles} miles logged` : ''}.</div>
              ${shown ? html`<button class="btn dark big block" type="button" id="donerecap">${icon('text', 18)}Send ${buyerOf(t) ? buyerOf(t).split(' ')[0] : 'your buyer'} the recap</button>` : ''}
              <button class="btn ghost block" type="button" id="doneclose">Close</button>
            </div>`, (sh) => {
              sh.querySelector('#doneclose').addEventListener('click', closeSheet);
              sh.querySelector('#donerecap')?.addEventListener('click', () => { closeSheet(); setTimeout(() => document.querySelector('#recap')?.click(), 150); });
            }), 200);
          }
        });
      });
      root.querySelector('#setbuyer')?.addEventListener('click', () => formSheet({
        title: 'Who is this tour for?',
        fields: [{ name: 'buyer', label: 'Buyer', placeholder: 'The Smiths', hint: 'Their faces from every tour collect on one buyer page.' }],
        values: { buyer: buyerOf(t) },
        onSave(v) { if (v.buyer.trim()) save({ buyer: v.buyer.trim() }); }
      }));
      root.querySelector('#reqall')?.addEventListener('click', () => requestSheet(store.get('tours', id)));
      root.querySelector('#recap')?.addEventListener('click', () => {
        const cur = store.get('tours', id);
        recapSheet(cur, (cur.stops || []).filter((x) => x.shown || x.reaction).map((x) => ({ address: x.address, reaction: x.reaction, mls_url: x.mls_url, date: cur.date })));
      });
      root.querySelectorAll('[data-fb]').forEach((b) => b.addEventListener('click', () => feedbackSheet(fresh().find((x) => x.id === b.getAttribute('data-fb')))));
      root.querySelector('#deltour').addEventListener('click', () => { if (confirm('Delete this tour?')) { del('tours', id, 'Tour deleted'); location.hash = '#/tours'; } });
    }
  };
}

// ======================================================================
// BUYERS: every home a buyer saw, with their face (Sara, 2026-10-24)
// ======================================================================

function viewBuyers() {
  const list = buyers(store.all('tours'));
  return {
    html: html`${header({ back: '#/tours', kicker: 'Tours', title: 'Buyers' })}
    <main class="wrap">
      <div class="card list">${list.length ? list.map((b) => {
        const faces = b.homes.filter((h) => h.reaction).slice(0, 5);
        return html`<a class="row" href="#/buyer/${encodeURIComponent(b.key)}"><span class="grow"><span class="t">${b.name}</span><span class="s">${b.homes.length} home${b.homes.length === 1 ? '' : 's'} seen · ${b.tours.length} tour${b.tours.length === 1 ? '' : 's'} · last ${niceDate(b.last)}</span></span><span class="face-row">${faces.map((h) => raw(reactionFace(h.reaction, { size: 22, label: '' })))}</span>${icon('chev', 18)}</a>`;
      }) : buddy('No buyers yet. When you plan a tour, put the buyer\'s name in “Who is it for?”.')}</div>
    </main>`
  };
}

function viewBuyer(key) {
  const b = buyers(store.all('tours')).find((x) => x.key === decodeURIComponent(key));
  if (!b) return notFound();
  const counts = REACTIONS.map(([k, label]) => [k, label, b.homes.filter((h) => h.reaction === k).length]).filter((r) => r[2]);
  return {
    html: html`${header({ back: '#/buyers', kicker: 'Buyer', title: b.name, sub: `${b.homes.length} home${b.homes.length === 1 ? '' : 's'} seen on ${b.tours.length} tour${b.tours.length === 1 ? '' : 's'}` })}
    <main class="wrap">
      ${counts.length ? html`<div class="face-tally">${counts.map(([k, label, n]) => html`<span class="tally">${raw(reactionFace(k, { size: 26, label: '' }))}<span>${label}</span><b class="num">${n}</b></span>`)}</div>` : ''}
      <section class="sec"><div class="label accent">Homes they saw</div>
      <div class="card list">${b.homes.length ? b.homes.map((h) => html`<div class="row buyer-home">
        <button class="face-btn" type="button" data-react="${h.tour_id}|${h.stop_id}" aria-label="${h.reaction ? reactionLabel(h.reaction) + '. Tap to change' : 'Add their reaction'}">${h.reaction ? raw(reactionFace(h.reaction, { size: 40, label: '' })) : html`<span class="face-empty">+</span>`}</button>
        <span class="grow">${h.property_id ? html`<a class="t" href="#/p/${h.property_id}">${h.address}</a>` : html`<span class="t">${h.address}</span>`}
          <span class="s">${h.reaction ? html`<b>${reactionLabel(h.reaction)}</b> · ` : 'No reaction yet · '}${niceDate(h.date)}</span>
          ${h.note ? html`<span class="s">“${h.note}”</span>` : ''}</span></div>`) : html`<div class="empty">No homes marked shown yet.</div>`}</div></section>
      ${b.homes.length ? html`<button class="btn dark big block" type="button" id="brecap">${icon('text', 18)}Send ${b.name.split(' ')[0]} every home they've seen</button>` : ''}
      <section class="sec"><div class="label">Tours</div>
      <div class="card list">${b.tours.map((t) => html`<a class="row" href="#/tour/${t.id}"><span class="grow"><span class="t">${t.name}</span><span class="s">${niceDate(t.date)} · ${(t.stops || []).length} stops</span></span>${icon('chev', 18)}</a>`)}</div></section>
    </main>`,
    mount(root) {
      // The recap goes to the newest tour's buyer contact, and is stamped there.
      root.querySelector('#brecap')?.addEventListener('click', () => recapSheet(b.tours[0], b.homes));
      root.querySelectorAll('[data-react]').forEach((el) => el.addEventListener('click', () => {
        const [tid, sid] = el.getAttribute('data-react').split('|');
        const stop = (store.get('tours', tid)?.stops || []).find((x) => x.id === sid);
        reactionPicker(stop);
      }));
    }
  };
}

// ======================================================================
// PROFILE & BRANDING, and OPEN HOUSE SIGN-IN (Sara, 2026-10-27)
// ======================================================================

// This phone's agent: the profile it saved, else the team profile with its
// first name.
function myProfile() {
  const s = store.settings();
  const all = store.all('profiles');
  return all.find((p) => p.id === s.profileId) || (s.myName ? all.find((p) => p.owner === s.myName) : null) || null;
}
// Light brand colours get dark text, dark ones white.
function onBrand(hex) {
  const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#202428' : '#ffffff';
}
const BRAND_DEFAULT = '#202428';

// The branded band: logo, agent, brokerage and license numbers.
function brandBand(prof, { big = false } = {}) {
  const p = prof || {};
  const bg = /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : BRAND_DEFAULT;
  const fg = onBrand(bg);
  return html`<div class="brandband ${big ? 'big' : ''}" style="background:${bg};color:${fg}">
    ${p.logo_id ? html`<img class="brandlogo" alt="${p.brokerage || 'Logo'}" data-photo="${p.logo_id}" data-path="${p.logo_path || store.photoPath({ id: p.logo_id })}">` : p.brokerage ? html`<div class="brandname">${p.brokerage}</div>` : ''}
    <div class="brandagent">
      ${p.headshot_id ? html`<img class="headshot" alt="" data-photo="${p.headshot_id}" data-path="${p.headshot_path || store.photoPath({ id: p.headshot_id })}">` : ''}
      <div><div class="bn">${p.full_name || 'Your name'}</div>
      <div class="bs">${[p.title, p.phone].filter(Boolean).join(' · ')}</div>
      <div class="bs">${[licenseText(p.license), p.brokerage && p.logo_id ? p.brokerage : '', p.brokerage_license ? `Brokerage ${licenseText(p.brokerage_license)}` : ''].filter(Boolean).join(' · ')}</div></div>
    </div>
  </div>`;
}

const PROFILE_FIELDS = [
  { name: 'full_name', label: 'Your full name', placeholder: 'Sara Cooper' },
  { name: 'title', label: 'Title', placeholder: 'Broker / Owner, REALTOR®' },
  { name: 'phone', label: 'Your phone', type: 'tel' },
  { name: 'email', label: 'Your email', type: 'email' },
  { name: 'license', label: 'Your license #', placeholder: 'DRE #01234567', hint: 'Type it the way it should print, e.g. “DRE #01234567”.' },
  { name: 'brokerage', label: 'Brokerage', placeholder: 'Legacy Properties' },
  { name: 'brokerage_license', label: 'Brokerage license #', placeholder: 'DRE #01234567' },
  { name: 'brokerage_phone', label: 'Brokerage phone', type: 'tel' },
  { name: 'website', label: 'Website', type: 'url', placeholder: 'https://' }
];

function viewProfile() {
  const p = myProfile() || {};
  const imgs = { logo_id: p.logo_id || null, headshot_id: p.headshot_id || null };
  return {
    form: true,
    html: html`${header({ back: '#/settings', kicker: 'Set up', title: 'Your profile & branding', sub: 'On your open house sign-in, your texts, and anything Bestie makes for you.' })}
    <main class="wrap"><form id="prof" class="sec" novalidate>
      <div id="bandprev">${brandBand(p, { big: true })}</div>
      ${PROFILE_FIELDS.map((f) => fieldHtml(f, p[f.name]))}
      <div class="card pad sec">
        <div class="label accent">Your look</div>
        <label class="field"><span>Brand color</span><input id="pcolor" type="color" value="${/^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : BRAND_DEFAULT}" style="height:48px;padding:4px"></label>
        <div class="btns">
          <label class="btn">${icon('photo', 18)}${p.logo_id ? 'Change logo' : 'Add your logo'}<input type="file" accept="image/*" data-img="logo_id" hidden></label>
          <label class="btn">${icon('person', 18)}${p.headshot_id ? 'Change headshot' : 'Add a headshot'}<input type="file" accept="image/*" data-img="headshot_id" hidden></label>
          <button class="btn" type="button" data-dbx="logo_id">Logo from Dropbox</button>
          <button class="btn" type="button" data-dbx="headshot_id">Headshot from Dropbox</button>
        </div>
        <div class="hint">A logo with a see-through or white background looks best.</div>
      </div>
      <button class="btn dark big block" type="submit">Save my profile</button>
    </form></main>`,
    mount(root) {
      const form = root.querySelector('#prof');
      const read = () => ({ ...readForm(form, PROFILE_FIELDS), color: root.querySelector('#pcolor').value, ...imgs });
      const preview = () => { root.querySelector('#bandprev').innerHTML = str(brandBand({ ...p, ...read() }, { big: true })); loadPhotos(root); };
      form.addEventListener('input', preview);
      root.querySelectorAll('[data-dbx]').forEach((b) => b.addEventListener('click', async () => {
        if (!dropboxReady()) return toast('Dropbox is not connected yet');
        try {
          const [f] = await chooseFromDropbox({ images: true, multi: false });
          if (!f) return;
          const id = store.uid();
          await store.putPhoto(id, await store.shrinkPhoto(f, 800).catch(() => f));
          imgs[b.getAttribute('data-dbx')] = id;
          preview();
          toast('Added. Tap Save to keep it.');
        } catch (e) { toast(e.message || 'Could not get that from Dropbox'); }
      }));
      root.querySelectorAll('[data-img]').forEach((inp) => inp.addEventListener('change', async () => {
        const f = inp.files[0];
        if (!f) return;
        const id = store.uid();
        await store.putPhoto(id, await store.shrinkPhoto(f, 800).catch(() => f));
        imgs[inp.getAttribute('data-img')] = id;
        preview();
      }));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = read();
        if (!v.full_name) return toast('Your name is needed');
        const me = firstName(v.full_name);
        const saved = store.save('profiles', { ...(p.id ? { id: p.id } : {}), ...v, logo_path: v.logo_id === p.logo_id ? p.logo_path || null : null, headshot_path: v.headshot_id === p.headshot_id ? p.headshot_path || null : null, owner: me });
        store.saveSettings({ profileId: saved.id, myName: me });
        toast('Profile saved');
        location.hash = '#/settings';
      });
      loadPhotos(root);
    }
  };
}

// ---------- open house ----------
// QR sign-in (2026-10-27): visitors scan and sign in on their own phones
// (oh.html). The link lasts 3 days and is made once per property per day.
async function qrSheet(pid) {
  const key = `bb:ohlink:${pid}:${todayIso()}`;
  let link = '';
  try { link = localStorage.getItem(key) || ''; } catch {}
  if (!link) {
    try { link = await openHouseLink(pid); try { localStorage.setItem(key, link); } catch {} }
    catch (e) { toast(e.message); return; }
  }
  let svg = '';
  try {
    const { default: qrcode } = await import('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm');
    const q = qrcode(0, 'M'); q.addData(link); q.make();
    svg = q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  } catch { svg = ''; }
  openSheet(html`<div class="sec" style="text-align:center">
    <div class="title" style="font-family:var(--tall);font-weight:800;font-size:28px;text-transform:uppercase">Scan to sign in</div>
    <div class="small">Visitors point their camera here and sign in on their own phone. It lands in your visitor list.</div>
    ${svg ? html`<div class="qr-box">${raw(svg)}</div>` : html`<div class="warn-box">Could not draw the QR code (no signal?). Share the link instead.</div>`}
    <div class="btns"><button class="btn" type="button" id="qrcopy">Copy link</button><button class="btn" type="button" id="qrshare">Share link</button></div>
    <button class="btn dark block" type="button" id="qrclose">Done</button>
  </div>`, (sh) => {
    sh.querySelector('#qrclose').addEventListener('click', closeSheet);
    sh.querySelector('#qrcopy').addEventListener('click', async () => toast((await copy(link)) ? 'Link copied' : link));
    sh.querySelector('#qrshare').addEventListener('click', () => { if (navigator.share) navigator.share({ title: 'Open house sign-in', url: link }).catch(() => {}); else copy(link).then(() => toast('Link copied')); });
  });
}

const TIMEFRAMES = [['', 'Pick one (optional)'], ['0-3 months', 'In the next 3 months'], ['3-6 months', '3 to 6 months'], ['6-12 months', '6 to 12 months'], ['Just looking', 'Just looking']];
let ohThanks = null;

function viewOpenHouse(pid) {
  const p = prop(pid);
  if (!p) return notFound();
  const prof = myProfile();
  const today = todayIso();
  const count = store.all('visitors').filter((v) => v.property_id === pid && v.oh_date === today).length;
  const who = prof && prof.full_name ? prof.full_name.split(' ')[0] : 'us';
  if (ohThanks) {
    const name = ohThanks;
    return {
      html: html`<div class="kiosk-wrap">${brandBand(prof, { big: true })}
        <main class="wrap kiosk-main"><div class="kiosk-thanks"><div class="title">Thank you, ${name}!</div><div>Enjoy the home. ${who === 'us' ? 'We' : who} will be right here if you have questions.</div></div></main></div>`,
      mount(root) { loadPhotos(root); setTimeout(() => { ohThanks = null; if (location.hash === `#/openhouse/${pid}`) render(); }, 3500); }
    };
  }
  return {
    form: true,
    html: html`<div class="kiosk-wrap">${brandBand(prof, { big: true })}
    <main class="wrap kiosk-main"><form id="oh" class="sec" novalidate autocomplete="off">
      <div class="kiosk-head"><div class="label accent">Welcome to the open house</div><div class="title">${p.address}</div>${p.city ? html`<div class="small">${p.city}</div>` : ''}</div>
      <div class="grid2">${fieldHtml({ name: 'first_name', label: 'First name' })}${fieldHtml({ name: 'last_name', label: 'Last name' })}</div>
      ${fieldHtml({ name: 'phone', label: 'Phone', type: 'tel' })}
      ${fieldHtml({ name: 'email', label: 'Email', type: 'email' })}
      <div class="field"><span>Are you working with a real estate agent?</span><div class="seg" data-seg="has_agent"><button type="button" data-v="no">No</button><button type="button" data-v="yes">Yes</button></div></div>
      <div id="agentrow" hidden>${fieldHtml({ name: 'agent_name', label: 'Your agent’s name' })}</div>
      <div class="field"><span>Do you have a home to sell?</span><div class="seg" data-seg="also_selling"><button type="button" data-v="no">No</button><button type="button" data-v="yes">Yes</button></div></div>
      ${fieldHtml({ name: 'timeframe', label: 'When are you hoping to move?', type: 'select', options: TIMEFRAMES })}
      <label class="switch"><input type="checkbox" name="consent">Yes, ${prof && prof.full_name ? prof.full_name : 'the listing agent'} may contact me about this home and others like it.</label>
      <button class="btn dark big block" type="submit">Sign in</button>
      <div class="kiosk-foot"><span class="small">${count} signed in today</span><span style="display:flex;gap:6px"><button class="btn ghost" type="button" id="ohqr" style="min-height:36px">QR code</button><button class="btn ghost" type="button" id="ohend" style="min-height:36px">Agent: end open house</button></span></div>
    </form></main></div>`,
    mount(root) {
      loadPhotos(root);
      const pick = {};
      root.querySelectorAll('[data-seg]').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        const k = seg.getAttribute('data-seg');
        pick[k] = b.getAttribute('data-v') === 'yes';
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        if (k === 'has_agent') root.querySelector('#agentrow').hidden = !pick[k];
      })));
      root.querySelector('#oh').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = e.target;
        const val = (n) => (f.querySelector(`[name=${n}]`)?.value || '').trim();
        if (!val('first_name')) return toast('Please add your first name');
        if (!val('phone') && !val('email')) return toast('Please add a phone or an email');
        store.save('visitors', { property_id: pid, oh_date: today, first_name: val('first_name'), last_name: val('last_name'), phone: val('phone'), email: val('email'), has_agent: pick.has_agent ?? null, agent_name: pick.has_agent ? val('agent_name') : '', also_selling: pick.also_selling ?? null, timeframe: val('timeframe'), consent: f.querySelector('[name=consent]').checked }, { quiet: true });
        ohThanks = val('first_name');
        render();
      });
      root.querySelector('#ohend').addEventListener('click', () => { if (confirm('End the open house and see who signed in?')) location.hash = `#/visitors/${pid}`; });
      root.querySelector('#ohqr').addEventListener('click', () => qrSheet(pid));
    }
  };
}

function viewVisitors(pid) {
  const p = prop(pid);
  if (!p) return notFound();
  const list = store.all('visitors').filter((v) => v.property_id === pid).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const days = [...new Set(list.map((v) => v.oh_date))];
  return {
    html: html`${header({ back: `#/p/${pid}`, kicker: 'Open house', title: p.address, sub: `${list.length} visitor${list.length === 1 ? '' : 's'}${days.length > 1 ? ` over ${days.length} open houses` : ''}` })}
    <main class="wrap">
      <a class="btn dark big block" href="#/openhouse/${pid}">${icon('person', 18)}Open the sign-in sheet</a>
      ${days.map((d) => html`<section class="sec"><div class="label accent">${niceDate(d)}</div>
        <div class="card list">${list.filter((v) => v.oh_date === d).map((v) => html`<div class="row" style="align-items:flex-start">
          <span class="grow"><span class="t">${[v.first_name, v.last_name].filter(Boolean).join(' ')}${v.has_agent ? html` <span class="tag">Has an agent</span>` : ''}${v.also_selling ? html` <span class="tag">Selling too</span>` : ''}</span>
            <span class="s">${[v.phone ? prettyPhone(v.phone) : '', v.email, v.timeframe].filter(Boolean).join(' · ')}</span>
            <span class="s ${v.followed_up_at ? 'ok' : v.consent ? '' : 'wait'}">${v.followed_up_at ? `✓ Followed up ${niceDate(v.followed_up_at.slice(0, 10))}` : v.consent ? 'OK to contact' : 'Did not tick “OK to contact”'}</span></span>
          <div style="display:flex;gap:6px;flex-shrink:0">${v.phone ? html`<a class="icon-btn" href="tel:${digits(v.phone)}" aria-label="Call">${icon('phone', 18)}</a>` : ''}<button class="icon-btn" type="button" data-fu="${v.id}" aria-label="Thank-you text">${icon('text', 18)}</button></div>
        </div>`)}</div></section>`)}
      ${!list.length ? html`<div class="card empty">No one has signed in yet. Open the sign-in sheet and hand your phone or tablet to visitors, or show them the QR code.</div>` : html`<button class="btn block" type="button" id="vcsv">Download visitors (spreadsheet for your CRM)</button>`}
    </main>`,
    mount(root) {
      // Visitors who signed in on their own phones arrive through the team sync.
      if (store.cloud.user && !viewVisitors.synced) { viewVisitors.synced = true; store.syncNow().finally(() => setTimeout(() => { viewVisitors.synced = false; }, 30000)); }
      root.querySelectorAll('[data-fu]').forEach((b) => b.addEventListener('click', () => {
        const v = store.get('visitors', b.getAttribute('data-fu'));
        composeSheet({
          title: 'Thanks for visiting', sub: `${v.first_name}${v.has_agent ? ' has an agent, so this only thanks them.' : ''}${v.consent ? '' : ' They did not tick “OK to contact”.'}`,
          phone: v.phone || '', email: v.email || '',
          body: ohThanksText(v, { address: p.address, profile: myProfile(), me: store.settings().myName, date: v.oh_date, today: todayIso() }),
          onSent: () => store.save('visitors', { id: v.id, followed_up_at: new Date().toISOString() })
        });
      }));
      root.querySelector('#vcsv')?.addEventListener('click', () => {
        const blob = new Blob([visitorsCsv(list, (id) => prop(id)?.address || '')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `open-house-${p.address.replace(/[^a-z0-9]+/gi, '-')}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
      });
    }
  };
}

// ---------- texts Bestie writes, the agent sends ----------
// Shows the words, lets the agent change them, then opens THEIR text or email
// app. Nothing is sent by Bestie. onSent runs when they tap a send button.
function composeSheet({ title, subject = '', sub = '', phone = '', email = '', body, askContact = false, onSent }) {
  openSheet(html`<div class="sec">
    <div class="title" style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase">${title}</div>
    ${sub ? html`<div class="small">${sub}</div>` : ''}
    ${askContact ? html`<div class="grid2"><label class="field"><span>Their phone</span><input id="cphone" type="tel" inputmode="tel" value="${phone}" autocomplete="off"></label><label class="field"><span>Or email</span><input id="cemail" type="email" value="${email}" autocomplete="off"></label></div>` : ''}
    <label class="field"><span>The message (change anything)</span><textarea id="cbody" rows="8">${body}</textarea></label>
    <div class="btns">
      <button class="btn dark" type="button" id="ctext">${icon('text', 18)}Text it</button>
      ${askContact || email ? html`<button class="btn" type="button" id="cmail">Email it</button>` : html`<button class="btn" type="button" id="ccopy">Copy</button>`}
    </div>
    <div class="hint">Opens your own ${askContact || email ? 'text or email app' : 'text app'}. You press send.</div>
  </div>`, (sh) => {
    const val = (id) => (sh.querySelector(id)?.value || '').trim();
    const done = (how, to) => { onSent && onSent({ how, phone: val('#cphone') || phone, email: val('#cemail') || email }); closeSheet(); };
    sh.querySelector('#ctext').addEventListener('click', () => {
      const to = askContact ? val('#cphone') : phone;
      location.href = smsLink(to ? [to] : [], val('#cbody'));
      done('text');
    });
    sh.querySelector('#cmail')?.addEventListener('click', () => {
      const to = askContact ? val('#cemail') : email;
      if (!to) return toast('Add their email first');
      location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject || title)}&body=${encodeURIComponent(val('#cbody'))}`;
      done('email');
    });
    sh.querySelector('#ccopy')?.addEventListener('click', async () => { await copy(val('#cbody')); toast('Copied'); });
  });
}

// Feedback to the listing agent for one stop (from the face picked).
function feedbackSheet(stop) {
  const tour = store.all('tours').find((t) => (t.stops || []).some((x) => x.id === stop.id));
  composeSheet({
    title: 'Feedback for the listing agent',
    sub: `${stop.agent || 'Listing agent'} · ${stop.address}. Your private notes are not included.`,
    phone: stop.agent_phone,
    body: feedbackText(stop, { me: store.settings().myName, date: tour && tour.date, today: todayIso() }),
    onSent: () => { if (tour) store.save('tours', { id: tour.id, stops: tour.stops.map((x) => (x.id === stop.id ? { ...x, feedback_sent_at: new Date().toISOString() } : x)) }); }
  });
}

// The buyer's recap of a tour (or of every home they have seen).
function recapSheet(tour, homes) {
  composeSheet({
    title: 'Tour recap',
    sub: `For ${buyerOf(tour) || 'your buyer'}. Only the homes and how they felt about them; your notes stay in Bestie.`,
    askContact: true, phone: tour.buyer_phone || '', email: tour.buyer_email || '',
    body: recapText(homes, { buyer: buyerOf(tour), date: homes.length && homes.every((h) => !h.date || h.date === tour.date) ? tour.date : '', me: store.settings().myName }),
    onSent: ({ phone, email }) => store.save('tours', { id: tour.id, buyer_phone: phone || tour.buyer_phone || '', buyer_email: email || tour.buyer_email || '', recap_sent_at: new Date().toISOString() })
  });
}

// One request per listing agent for the whole tour.
function requestSheet(tour) {
  const groups = requestGroups(tour.stops || []);
  const missing = (tour.stops || []).filter((s) => !String(s.agent_phone || '').replace(/\D/g, ''));
  openSheet(html`<div class="sec">
    <div class="title" style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase">Request showings</div>
    <div class="small">One text per listing agent, with every home of theirs on this tour. Tap to review and send.</div>
    <div class="card list">${groups.map((g, i) => {
      const asked = g.stops.every((s) => s.requested_at);
      const ok = g.stops.every((s) => s.confirmed);
      return html`<button class="row" type="button" data-req="${i}" style="width:100%;text-align:left;background:none;border:0">
        <span class="grow"><span class="t">${g.agent || 'Listing agent'}</span><span class="s">${g.stops.map((s) => s.address.split(',')[0]).join(' · ')}</span>
        <span class="s ${ok ? 'ok' : asked ? 'wait' : ''}">${ok ? '✓ Confirmed' : asked ? 'Asked, waiting to hear back' : 'Not asked yet'}</span></span>${icon('text', 18)}</button>`;
    })}</div>
    ${missing.length ? html`<div class="warn-box">No listing agent phone for ${missing.map((s) => s.address.split(',')[0]).join(', ')}. Add it with Edit stop.</div>` : ''}
    <div class="hint">When an agent confirms, tap “Mark confirmed” on that stop.</div>
  </div>`, (sh) => sh.querySelectorAll('[data-req]').forEach((b) => b.addEventListener('click', () => {
    const g = groups[Number(b.getAttribute('data-req'))];
    composeSheet({
      title: 'Showing request', sub: `${g.agent || 'Listing agent'} · ${g.stops.length} home${g.stops.length === 1 ? '' : 's'}`,
      phone: g.phone, body: requestText(g, { date: tour.date, me: store.settings().myName }),
      onSent: () => {
        const ids = new Set(g.stops.map((s) => s.id));
        const cur = store.get('tours', tour.id);
        store.save('tours', { id: tour.id, stops: cur.stops.map((x) => (ids.has(x.id) ? { ...x, requested_at: new Date().toISOString() } : x)) });
      }
    });
  })));
}

// After a showing: one tap on a face (Cowork's spec, 2026-10-23), an optional
// note, saved on the stop and filed to the property as showing feedback.
// ---------- at the door (Sara's review, 2026-10-27) ----------
// One stop, big and high-contrast for reading in the sun with a buyer beside
// you: every code huge (tap to copy), how to get in, occupied or vacant, the
// listing agent's call button, Mark shown, and the next stop. The screen is
// kept awake while it is open, where the phone allows it.
let doorLock = null;
async function keepAwake(on) {
  try {
    if (on && !doorLock && navigator.wakeLock) { doorLock = await navigator.wakeLock.request('screen'); doorLock.addEventListener('release', () => { doorLock = null; }); }
    if (!on && doorLock) { await doorLock.release(); doorLock = null; }
  } catch { doorLock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && /^#\/door\//.test(location.hash)) keepAwake(true); });
addEventListener('hashchange', () => { if (!/^#\/door\//.test(location.hash)) keepAwake(false); });

// "305 Cedar Hollow Ln · 9 min · Vacant": the next stop in one line.
function nextStopWords(n) {
  return [String(n.address || '').split(',')[0], n.leg_minutes ? `${n.leg_minutes} min` : '', occWord(n.occ)].filter(Boolean).join(' · ');
}

function viewDoor(tourId, i) {
  const t = store.get('tours', tourId);
  const stops = (t && t.stops) || [];
  const s = stops[i];
  if (!s) return notFound();
  const p = s.property_id ? prop(s.property_id) : null;
  const codes = doorCodes(s, p ? codesOf(p.id) : [], (k) => KINDS[k]?.label || k);
  const how = [s.access_note, s.notes, p && p.showing_notes].map((x) => String(x || '').trim()).filter(Boolean).filter((x, j, a) => a.indexOf(x) === j);
  const heads = headsUp(s, p, codes);
  const next = stops[i + 1];
  // Phase 3 (2026-10-28): codes huge at the top, everything you press in the
  // bottom third: four quick faces + All 8, Running late and Call agent, then
  // the next stop. Swipe left for the next stop, right for the one before.
  return {
    html: html`<main class="door">
      <div class="door-top">
        <a class="door-x" href="#/tour/${tourId}" aria-label="Back to the tour">${icon('back', 22)}Tour</a>
        <span class="door-n">Stop ${i + 1} of ${stops.length}</span>
      </div>
      <div class="door-addr">${String(s.address || '').split(',')[0]}</div>
      ${s.occ ? html`<div class="door-occ">${occBadge(s.occ, { big: true, extra: s.occ === 'O' ? 'knock first' : '' })}</div>` : ''}
      ${heads.length ? html`<div class="door-heads">${heads.map((h) => html`<span class="door-head">${h}</span>`)}</div>` : ''}
      <div class="door-meta">${s.arrive != null ? html`<b>${formatClock(s.arrive)}</b> · ` : ''}${s.confirmed ? html`<span class="ok-on-dark">✓ Confirmed</span>` : 'Not confirmed yet'}</div>
      ${codes.length ? html`<div class="door-codes">${codes.map((c) => html`<button class="door-code" type="button" data-copy="${c.code}"><span class="k">${c.label}</span><span class="v">${c.code}</span>${c.where ? html`<span class="w">${c.where}</span>` : ''}</button>`)}</div>
        <div class="door-copyhint">Tap a code to copy it</div>`
        : html`<div class="door-none">${s.code_pending ? 'Code still coming. Text the listing agent.' : 'No code saved for this stop.'}</div>`}
      ${how.length ? html`<div class="door-how">${how.map((x) => html`<p>${x}</p>`)}</div>` : ''}
      <div class="door-act">
        <div class="door-faces" role="group" aria-label="How did they like it?">
          ${DOOR_FACES.map((k) => html`<button class="door-face ${s.reaction === k ? 'on' : ''}" type="button" data-quick="${k}" aria-pressed="${String(s.reaction === k)}">${raw(reactionFace(k, { size: 40, label: '' }))}<span>${reactionLabel(k)}</span></button>`)}
          <button class="door-face all ${s.reaction && !DOOR_FACES.includes(s.reaction) ? 'on' : ''}" type="button" id="dall">${s.reaction && !DOOR_FACES.includes(s.reaction) ? raw(reactionFace(s.reaction, { size: 40, label: '' })) : html`<span class="n">8</span>`}<span>${s.reaction && !DOOR_FACES.includes(s.reaction) ? reactionLabel(s.reaction) : 'All 8'}</span></button>
        </div>
        ${s.shown ? html`<div class="door-shownline">✓ Shown${s.reaction ? ` · ${reactionLabel(s.reaction)}` : ''}${s.feedback_sent_at ? ' · feedback sent' : ''}</div>` : ''}
        <div class="door-two">
          <button class="door-btn2" type="button" id="dlate">${icon('clock', 20)}Running late</button>
          ${s.agent_phone ? html`<a class="door-btn2" href="tel:${digits(s.agent_phone)}">${icon('phone', 20)}Call agent</a>` : html`<button class="door-btn2" type="button" disabled>No agent phone</button>`}
        </div>
        ${next ? html`<a class="door-next" href="#/door/${tourId}/${i + 1}"><span class="l">Next stop${next.arrive != null ? ` · ${formatClock(next.arrive)}` : ''}</span><span class="a">${nextStopWords(next)} ›</span></a>
          <a class="door-drive" href="${mapLink(next)}" target="_blank" rel="noopener">Directions to the next stop</a>`
          : html`<a class="door-next" href="#/tour/${tourId}"><span class="l">Last stop</span><span class="a">Finish the tour ›</span></a>`}
      </div>
    </main>`,
    mount(root) {
      keepAwake(true);
      root.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => {
        const k = b.getAttribute('data-quick');
        const before = s;
        const r = saveReaction(s.id, k, s.reaction_note || '');
        undoToast(`Shown · ${reactionLabel(k)}`, () => undoReaction(before, r));
      }));
      root.querySelector('#dall').addEventListener('click', () => allFacesSheet(tourId, i));
      root.querySelector('#dlate').addEventListener('click', () => lateSheet(t, s));
      // Swipe left: next stop. Swipe right: the stop before.
      const door = root.querySelector('.door');
      let x0 = null, y0 = null;
      door.addEventListener('touchstart', (e) => { const p0 = e.touches[0]; x0 = p0.clientX; y0 = p0.clientY; }, { passive: true });
      door.addEventListener('touchend', (e) => {
        if (x0 == null) return;
        const p1 = e.changedTouches[0];
        const dx = p1.clientX - x0, dy = p1.clientY - y0;
        x0 = null;
        if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
        if (dx < 0 && next) location.hash = `#/door/${tourId}/${i + 1}`;
        if (dx > 0 && i > 0) location.hash = `#/door/${tourId}/${i - 1}`;
      }, { passive: true });
    }
  };
}

// The four faces on the door; the other four are under "All 8".
const DOOR_FACES = ['love', 'maybe', 'nope', 'again'];

// One face on one stop: marks it shown and files "Showing feedback" on the
// property. Returns what Undo needs.
function saveReaction(stopId, pick, note = '', extra = {}) {
  const tour = store.all('tours').find((t) => (t.stops || []).some((x) => x.id === stopId));
  if (!tour) return null;
  const was = tour.stops.find((x) => x.id === stopId);
  store.save('tours', { id: tour.id, stops: tour.stops.map((x) => (x.id === stopId ? { ...x, shown: true, reaction: pick, reaction_note: note, reaction_at: new Date().toISOString(), ...extra } : x)) });
  const n = was.property_id && (pick !== was.reaction || note !== (was.reaction_note || '')) ? store.save('notes', { property_id: was.property_id, text: `Showing feedback: ${reactionLabel(pick)}${note ? ' · ' + note : ''}` }) : null;
  return { tourId: tour.id, stop: store.get('tours', tour.id).stops.find((x) => x.id === stopId), noteId: n ? n.id : null };
}
function undoReaction(before, r) {
  if (!r) return;
  const tour = store.get('tours', r.tourId);
  if (tour) store.save('tours', { id: tour.id, stops: tour.stops.map((x) => (x.id === before.id ? before : x)) });
  if (r.noteId) store.remove('notes', r.noteId);
}

// All 8 faces, a note you can say, and two boxes that start ticked: text the
// listing agent, add it to the buyer's page. "Done · next stop" does it all
// and moves on: two taps (face, Done). The text opens in Messages; you send.
function allFacesSheet(tourId, i) {
  const tour = store.get('tours', tourId);
  const s = tour.stops[i];
  const next = tour.stops[i + 1];
  const buyer = buyerOf(tour);
  let pick = s.reaction || null;
  openSheet(html`<div class="sec">
    <div class="title" style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase">How did they like it?</div>
    <div class="small">${s.address}</div>
    <div class="react-grid" role="group" aria-label="Their reaction">${REACTIONS.map(([k, label]) => html`<button class="react" type="button" data-k="${k}" aria-pressed="${String(pick === k)}">${raw(reactionFace(k, { size: 48, label: '' }))}<span>${label}</span></button>`)}</div>
    ${fieldHtml({ name: 'rnote', label: 'Note (optional, private)', type: 'textarea', placeholder: 'Loved the yard, kitchen too small', mic: true }, s.reaction_note)}
    ${s.agent_phone ? html`<label class="switch"><input type="checkbox" id="fbtext" ${s.feedback_sent_at ? '' : raw('checked')}>Text feedback to ${s.agent || 'the listing agent'}</label>` : ''}
    ${buyer ? html`<label class="switch"><input type="checkbox" id="fbbuyer" ${s.hide_from_buyer ? '' : raw('checked')}>Add to ${buyer.split(' ')[0]}'s buyer page</label>` : ''}
    <button class="btn dark big block" type="button" id="fdone" ${pick ? '' : raw('disabled')}>${pick ? `Done · ${next ? 'next stop' : 'finish the tour'}` : 'Pick a face'}</button>
  </div>`, (sh) => {
    const btn = sh.querySelector('#fdone');
    sh.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
      pick = b.getAttribute('data-k');
      sh.querySelectorAll('[data-k]').forEach((x) => { x.setAttribute('aria-pressed', String(x === b)); x.classList.remove('bb-on'); });
      void b.offsetWidth;
      b.classList.add('bb-on');
      btn.disabled = false;
      btn.textContent = `Done · ${next ? 'next stop' : 'finish the tour'}`;
    }));
    btn.addEventListener('click', () => {
      if (!pick) return;
      const note = sh.querySelector('[name=rnote]').value.trim();
      const toBuyer = sh.querySelector('#fbbuyer');
      const r = saveReaction(s.id, pick, note, toBuyer ? { hide_from_buyer: !toBuyer.checked } : {});
      const textIt = sh.querySelector('#fbtext')?.checked;
      closeSheet();
      location.hash = next ? `#/door/${tourId}/${i + 1}` : `#/tour/${tourId}`;
      if (textIt && r && r.stop.agent_phone) {
        const body = feedbackText(r.stop, { me: store.settings().myName, date: tour.date, today: todayIso() });
        const fresh = store.get('tours', tourId);
        store.save('tours', { id: tourId, stops: fresh.stops.map((x) => (x.id === s.id ? { ...x, feedback_sent_at: new Date().toISOString() } : x)) });
        setTimeout(() => { location.href = smsLink(r.stop.agent_phone, body); }, 350);
      }
    });
  });
}

// Running late (2026-10-28): pick the minutes, Bestie writes the text to the
// listing agent; Open in Messages, and Also text buyer.
function lateSheet(tour, s) {
  const prof = myProfile();
  const me = (prof && prof.name) || store.settings().myName || '';
  const now = new Date();
  const base = s.arrive != null ? s.arrive : now.getHours() * 60 + now.getMinutes();
  let mins = 10;
  const words = () => lateText({ agent: s.agent, me, brokerage: prof && prof.brokerage, address: s.address, minutes: mins, arriveAt: base + mins });
  openSheet(html`<div class="sec">
    <div class="title" style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase">Running late</div>
    <div class="small">${String(s.address || '').split(',')[0]}${s.agent ? ` · ${s.agent}` : ''}</div>
    <div class="late-mins" role="group" aria-label="How late">${[5, 10, 15, 20].map((m) => html`<button class="chip ${m === mins ? 'on' : ''}" type="button" data-m="${m}">${m === 20 ? '20+' : m} min</button>`)}</div>
    <label class="field"><span>The text (you can change it)</span><textarea id="latetext" rows="4"></textarea></label>
    ${s.agent_phone ? html`<button class="btn dark big block" type="button" id="latego">${icon('text', 18)}Open in Messages</button>` : html`<div class="warn-box">No phone saved for the listing agent. Add it with Edit stop on the tour.</div>`}
    <label class="field"><span>Buyer's phone</span><input id="latebuyer" type="tel" inputmode="tel" value="${tour.buyer_phone || ''}" placeholder="For the buyer's text"></label>
    <button class="btn block" type="button" id="latebuy">${icon('text', 18)}Also text ${buyerOf(tour) ? buyerOf(tour).split(' ')[0] : 'buyer'}</button>
  </div>`, (sh) => {
    const box = sh.querySelector('#latetext');
    box.value = words();
    sh.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
      mins = Number(b.getAttribute('data-m'));
      sh.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x === b));
      box.value = words();
    }));
    sh.querySelector('#latego')?.addEventListener('click', () => { location.href = smsLink(s.agent_phone, box.value); });
    sh.querySelector('#latebuy').addEventListener('click', () => {
      const ph = sh.querySelector('#latebuyer').value.trim();
      if (!ph.replace(/\D/g, '')) return toast("Add the buyer's phone first");
      if (ph !== (tour.buyer_phone || '')) store.save('tours', { id: tour.id, buyer_phone: ph }, { quiet: true });
      location.href = smsLink(ph, lateBuyerText({ buyer: buyerOf(tour), address: s.address, minutes: mins, arriveAt: base + mins, me: store.settings().myName }));
    });
  });
}

function reactionPicker(s) {
  if (!s) return;
  let pick = s.reaction || null;
  openSheet(html`<div class="sec">
    <div class="title" style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase">How did they like it?</div>
    <div class="small">${s.address}</div>
    <div class="react-grid" role="group" aria-label="Their reaction">${REACTIONS.map(([k, label]) => html`<button class="react" type="button" data-k="${k}" aria-pressed="${String(pick === k)}">${raw(reactionFace(k, { size: 48, label: '' }))}<span>${label}</span></button>`)}</div>
    ${fieldHtml({ name: 'rnote', label: 'Add a note (optional)', type: 'textarea', placeholder: 'Loved the yard, kitchen too small', mic: true }, s.reaction_note)}
    <button class="btn dark big block" type="button" id="rsave" ${pick ? '' : raw('disabled')}>${pick ? 'Save: ' + reactionLabel(pick) : 'Pick a face'}</button>
  </div>`, (sh) => {
    const btn = sh.querySelector('#rsave');
    sh.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
      pick = b.getAttribute('data-k');
      sh.querySelectorAll('[data-k]').forEach((x) => { x.setAttribute('aria-pressed', String(x === b)); x.classList.remove('bb-on'); });
      void b.offsetWidth; // restart the animation on every tap
      b.classList.add('bb-on');
      btn.disabled = false;
      btn.textContent = 'Save: ' + reactionLabel(pick);
    }));
    btn.addEventListener('click', () => {
      if (!pick) return;
      const r = saveReaction(s.id, pick, sh.querySelector('[name=rnote]').value.trim());
      closeSheet();
      toast(`Saved: ${reactionLabel(pick)}`);
      render();
      // Listing agents always ask: offer the text straight away.
      const saved = r && r.stop;
      if (saved && saved.agent_phone && !saved.feedback_sent_at) setTimeout(() => feedbackSheet(saved), 350);
    });
  });
}

// ======================================================================
// MILEAGE & EXPENSES
// ======================================================================

let milesTab = 'miles';
function viewMiles(sub) {
  const trips = store.all('trips');
  const exp = store.all('expenses');
  const y = todayIso().slice(0, 4);
  const m = todayIso().slice(0, 7);
  const sum = (list) => list.reduce((s, t) => s + Number(t.miles || 0), 0);
  const yearMiles = sum(trips.filter((t) => String(t.date).startsWith(y)));
  const monthMiles = sum(trips.filter((t) => String(t.date).startsWith(m)));
  const rate = Number(store.settings().irsRate) || 0;
  const yearExp = exp.filter((e) => String(e.date).startsWith(y)).reduce((s, e) => s + Number(e.amount || 0), 0);
  const tab = (k, l) => html`<button class="tab ${milesTab === k ? 'on' : ''}" type="button" data-t="${k}">${l}</button>`;
  setTimeout(() => { if (sub === 'add') tripSheet(); }, 0);
  return {
    html: html`${header({
      back: '#/', kicker: 'Mileage & expenses',
      extra: html`<div class="stats"><div class="stat"><span class="n">${Math.round(monthMiles)}</span><span class="l">Mi this month</span></div><div class="stat"><span class="n">${Math.round(yearMiles).toLocaleString()}</span><span class="l">Mi this year</span></div><div class="stat"><span class="n">${rate ? '$' + Math.round(yearMiles * rate).toLocaleString() : '$' + Math.round(yearExp).toLocaleString()}</span><span class="l">${rate ? 'Mileage deduction' : 'Expenses this year'}</span></div></div>
      <div class="sub">${rate ? `At $${rate}/mile. ` : 'Set the IRS standard mileage rate in Settings to see the deduction. '}</div>`
    })}
    <main class="wrap">
      <div class="tabs">${tab('miles', `Drives · ${trips.length}`)}${tab('exp', `Expenses · ${exp.length}`)}</div>
      ${milesTab === 'miles' ? html`
        <div class="btns"><button class="btn dark" type="button" id="addtrip">+ Add a drive</button><button class="btn" type="button" id="csv">Export for taxes</button></div>
        <a class="btn block" href="#/taxes/${y}">${icon('receipt', 18)}Tax year ${y} summary</a>
        <div class="card list">${trips.length ? trips.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map((t) => html`<button class="row" type="button" data-trip="${t.id}"><span class="grow"><span class="t">${t.purpose || 'Drive'}</span><span class="s">${niceDate(t.date)}${t.property_id ? ' · ' + addr(t.property_id) : ''}${t.to_place ? ' · ' + t.to_place : ''}</span></span><span class="num" style="font-size:18px">${Number(t.miles || 0).toFixed(1)}</span></button>`) : html`<div class="empty">No drives yet. Finishing a tour logs its miles here.</div>`}</div>
        <div class="hint">Each drive keeps the date, purpose, where to, miles and the property: what a tax preparer asks for.</div>`
      : html`
        <a class="btn dark block" href="#/quick/receipt">+ Snap a receipt</a>
        <div class="card list">${exp.length ? exp.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map((e) => html`<button class="row" type="button" data-exp="${e.id}">${e.photo_id ? html`<img class="thumb" data-photo="${e.photo_id}" data-path="${e.photo_path || ''}" alt="">` : ''}<span class="grow"><span class="t">${e.what || 'Expense'}</span><span class="s">${niceDate(e.date)}${e.property_id ? ' · ' + addr(e.property_id) : ''}</span></span><span class="num" style="font-size:18px">$${Number(e.amount || 0).toFixed(2)}</span></button>`) : html`<div class="empty">No expenses yet.</div>`}</div>
        <button class="btn block" type="button" id="expcsv">Export expenses</button>`}
    </main>`,
    mount(root) {
      root.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { milesTab = b.getAttribute('data-t'); render(); }));
      root.querySelector('#addtrip')?.addEventListener('click', () => tripSheet());
      root.querySelectorAll('[data-trip]').forEach((b) => b.addEventListener('click', () => tripSheet(store.get('trips', b.getAttribute('data-trip')))));
      root.querySelector('#csv')?.addEventListener('click', () => download(`mileage-${y}.csv`, tripsCsv(trips, props())));
      root.querySelector('#expcsv')?.addEventListener('click', () => {
        const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        download(`expenses-${y}.csv`, [['Date', 'What', 'Property', 'Amount'].map(q).join(','), ...exp.map((e) => [e.date, e.what, addr(e.property_id), Number(e.amount || 0).toFixed(2)].map(q).join(','))].join('\n'));
      });
      root.querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', () => {
        const e = store.get('expenses', b.getAttribute('data-exp'));
        formSheet({
          title: e.what || 'Expense',
          fields: [{ name: 'amount', label: 'Amount', type: 'number' }, { name: 'what', label: 'What for' }, { name: 'date', label: 'Date', type: 'date' }],
          values: e,
          extra: e.photo_id ? html`<img data-photo="${e.photo_id}" data-path="${e.photo_path || ''}" alt="" style="border-radius:10px;max-height:360px;object-fit:contain">` : '',
          onSave(v) { store.save('expenses', { id: e.id, ...v }); },
          onDelete: () => del('expenses', e.id, 'Receipt deleted')
        });
        loadPhotos(document.querySelector('.sheet'));
      }));
      loadPhotos(root);
    }
  };
}

function tripSheet(t) {
  formSheet({
    title: t ? 'Drive' : 'Add a drive',
    fields: [
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'purpose', label: 'Purpose', placeholder: 'Listing appointment' },
      { name: 'from_place', label: 'From', placeholder: 'Office' },
      { name: 'to_place', label: 'To', placeholder: 'Murphys' },
      { name: 'miles', label: 'Miles', type: 'number' },
      { name: 'property_id', label: 'Property', type: 'select', options: [['', '— none —'], ...props().map((p) => [p.id, p.address])] }
    ],
    values: t || { date: todayIso() },
    onSave(v) {
      if (!v.miles) { toast('Add the miles'); return false; }
      store.save('trips', { ...(t ? { id: t.id } : {}), ...v, property_id: v.property_id || null });
      if (location.hash === '#/miles/add') location.hash = '#/miles';
    },
    onDelete: t ? () => del('trips', t.id, 'Trip deleted') : null
  });
}

// The tax year (2026-10-27): miles and receipts in one page, by month, with
// what a preparer will ask about, and one file for the accountant.
function viewTaxes(year) {
  const rate = Number(store.settings().irsRate) || 0;
  const t = taxYear(store.all('trips'), store.all('expenses'), year, rate);
  const thisYear = Number(todayIso().slice(0, 4));
  const fmt = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const monthName = (m) => new Date(m + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return {
    form: true,
    html: html`${header({ back: '#/miles', kicker: 'For your taxes', title: `Tax year ${year}`,
      extra: html`<div class="stats"><div class="stat"><span class="n">${Math.round(t.miles).toLocaleString()}</span><span class="l">Business miles</span></div><div class="stat"><span class="n">${t.deduction != null ? fmt(t.deduction) : '—'}</span><span class="l">Mileage deduction</span></div><div class="stat"><span class="n">${fmt(t.spent)}</span><span class="l">Expenses</span></div></div>` })}
    <main class="wrap">
      <div class="tabs">${[thisYear, thisYear - 1, thisYear - 2].map((yy) => html`<a class="tab ${String(yy) === String(year) ? 'on' : ''}" href="#/taxes/${yy}" style="display:inline-flex;align-items:center">${yy}</a>`)}</div>
      <label class="field"><span>IRS standard mileage rate for ${year} ($ per mile)</span><input id="taxrate" type="number" step="0.001" inputmode="decimal" value="${store.settings().irsRate || ''}" placeholder="Look it up on irs.gov"></label>
      ${t.noPurpose || t.noReceipt ? html`<div class="warn-box"><b>Before you send it:</b> ${[t.noPurpose ? `${t.noPurpose} drive${t.noPurpose === 1 ? ' has' : 's have'} no purpose` : '', t.noReceipt ? `${t.noReceipt} expense${t.noReceipt === 1 ? ' has' : 's have'} no receipt photo` : ''].filter(Boolean).join(' and ')}. A preparer will ask.</div>` : t.drives || t.expenses ? html`<div class="note-box">Every drive has a purpose and every expense has its receipt.</div>` : ''}
      <section class="sec"><div class="card list">
        <div class="row" style="font-weight:700"><span class="grow">Month</span><span style="width:80px;text-align:right">Miles</span><span style="width:100px;text-align:right">Spent</span></div>
        ${t.months.map((m) => html`<div class="row"><span class="grow">${monthName(m.month)}</span><span class="num" style="width:80px;text-align:right">${m.miles ? m.miles.toFixed(1) : '—'}</span><span class="num" style="width:100px;text-align:right">${m.spent ? fmt(m.spent) : '—'}</span></div>`)}
        <div class="row" style="font-weight:800"><span class="grow">Total</span><span class="num" style="width:80px;text-align:right">${t.miles.toFixed(1)}</span><span class="num" style="width:100px;text-align:right">${fmt(t.spent)}</span></div>
      </div></section>
      <button class="btn dark big block" type="button" id="taxcsv">Download for my accountant</button>
      <div class="hint">One spreadsheet: every drive (date, purpose, from, to, property, miles) and every expense (date, what, property, amount, receipt). Receipt photos stay on each expense in Mileage & expenses.</div>
    </main>`,
    mount(root) {
      root.querySelector('#taxrate').addEventListener('change', (e) => { store.saveSettings({ irsRate: e.target.value }); render(); });
      root.querySelector('#taxcsv').addEventListener('click', () => download(`taxes-${year}.csv`, taxCsv(store.all('trips'), store.all('expenses'), year, (id) => addr(id))));
    }
  };
}

// ---------- showing confirmations (2026-10-27) ----------
// Paste ShowingTime / BrokerBay / an agent's text, or add a screenshot; Bestie
// reads it (api/read-showings.js), shows what it found, and adds the ticked
// ones: the showing on the calendar, the home (new ones as "Other agent's"
// ), the lockbox or gate code, and the listing agent.
const showState = { text: '', files: [], step: 'paste', plan: [], error: '' };
function viewShowingsImport() {
  const st = showState;
  const row = (x, i) => {
    const s = x.showing;
    return html`<label class="row pick">
      <input type="checkbox" data-sh="${i}" ${x.checked ? raw('checked') : ''} ${x.action === 'same' || x.action === 'skip' ? raw('disabled') : ''}>
      <span class="grow"><span class="t">${s.address}${s.city ? ', ' + s.city.split(',')[0] : ''}</span>
      <span class="s"><b>${ACTION_WORDS[x.action]}</b> · ${niceDate(s.date)}${x.start != null ? ' · ' + formatClock(x.start) : ''}${x.property ? '' : ' · new home'}</span>
      ${x.newCodes.length ? html`<span class="s">Code${x.newCodes.length > 1 ? 's' : ''}: ${x.newCodes.map((c) => c.code).join(', ')}</span>` : ''}
      ${s.instructions ? html`<span class="s">${s.instructions}</span>` : ''}</span></label>`;
  };
  return {
    form: true,
    html: html`${header({ back: '#/calendar', kicker: 'Add showings', title: 'From a confirmation' })}
    <main class="wrap">
      ${st.step === 'review' ? html`
        ${st.plan.length ? html`<div class="card list">${st.plan.map(row)}</div>
          <button class="btn dark big block" type="button" id="shadd">Add the ticked ones</button>` : buddy('No showings found in that. Check it is the confirmation itself, or add a screenshot.', 'maybe')}
        <button class="btn ghost block" type="button" id="shagain">Read another</button>`
      : html`
        <div class="small">Copy a showing confirmation (ShowingTime, BrokerBay, ShowingDesk, or a listing agent's text) and paste it here. Several at once is fine. Or add a screenshot.</div>
        <label class="field"><span>The confirmation</span><textarea id="shtext" rows="8" placeholder="Paste the email or text here">${st.text}</textarea></label>
        <div class="btns"><label class="btn">${icon('photo', 18)}Screenshot${st.files.length ? ` · ${st.files.length}` : ''}<input type="file" accept="image/*,application/pdf" multiple id="shfile" hidden></label></div>
        ${st.error ? html`<div class="warn-box">${st.error}</div>` : ''}
        <button class="btn dark big block" type="button" id="shread" ${st.step === 'reading' ? raw('disabled') : ''}>${st.step === 'reading' ? 'Reading…' : 'Read it'}</button>
        <div class="hint">Nothing is added until you tick it. Bestie never changes a showing it isn't sure about: a home it can't match is added as a new one.</div>`}
    </main>`,
    mount(root) {
      root.querySelector('#shtext')?.addEventListener('input', (e) => { st.text = e.target.value; });
      root.querySelector('#shfile')?.addEventListener('change', (e) => { st.files = [...e.target.files].slice(0, 4); render(); });
      root.querySelector('#shread')?.addEventListener('click', async () => {
        if (!st.text.trim() && !st.files.length) { toast('Paste the confirmation or add a screenshot'); return; }
        st.step = 'reading'; st.error = ''; render();
        try {
          const files = await Promise.all(st.files.map(async (f) => ({ type: f.type || 'image/jpeg', data: await toBase64(f) })));
          const r = await api('/api/read-showings', { method: 'POST', body: JSON.stringify({ text: st.text, files, today: todayIso() }) });
          st.plan = planShowings(r.showings, store.snapshot());
          st.step = 'review';
        } catch (e) { st.step = 'paste'; st.error = navigator.onLine ? e.message : 'No signal right now. Try again when you have one.'; }
        render();
      });
      root.querySelectorAll('[data-sh]').forEach((b) => b.addEventListener('change', () => { st.plan[Number(b.getAttribute('data-sh'))].checked = b.checked; }));
      root.querySelector('#shagain')?.addEventListener('click', () => { Object.assign(st, { text: '', files: [], step: 'paste', plan: [], error: '' }); render(); });
      root.querySelector('#shadd')?.addEventListener('click', () => {
        let n = 0;
        for (const x of st.plan.filter((y) => y.checked)) {
          const s = x.showing;
          let pid = x.property?.id;
          if (!pid) {
            const p = store.save('properties', { address: s.address, city: s.city || '', status: 'tour', showing_notes: s.instructions || '' });
            pid = p.id;
            geocode([s.address, s.city].filter(Boolean).join(', ')).then((g) => g && store.save('properties', { id: pid, lat: g.lat, lng: g.lng }, { quiet: true }));
          }
          for (const c of x.newCodes) store.save('access', { property_id: pid, kind: c.kind || 'lockbox', label: KINDS[c.kind || 'lockbox']?.label || 'Lockbox', code: c.code, location_note: c.where || '' });
          if (s.listing_agent && !store.where('people', 'property_id', pid).some((m) => m.name === s.listing_agent)) store.save('people', { property_id: pid, name: s.listing_agent, role: 'Listing agent', phone: s.listing_agent_phone || '' });
          if (x.action === 'cancel') store.save('events', { id: x.existing.id, cancelled: true });
          else if (x.action === 'move') store.save('events', { id: x.existing.id, start_minutes: x.start, minutes: x.minutes });
          else store.save('events', { title: `Showing · ${s.address}`, kind: 'showing', date: s.date, start_minutes: x.start, minutes: x.minutes, property_id: pid, notes: s.instructions || '', done: false });
          n++;
        }
        Object.assign(st, { text: '', files: [], step: 'paste', plan: [], error: '' });
        toast(n ? `${n} showing${n === 1 ? '' : 's'} updated on your calendar` : 'Nothing ticked');
        location.hash = '#/calendar';
      });
    }
  };
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ======================================================================
// SAFETY CHECK-IN
// ======================================================================

function activeCheckin() {
  return store.all('checkins').find((c) => c.status === 'active') || null;
}

let tick = null;
function viewSafety() {
  const c = activeCheckin();
  const s = store.settings();
  const contact = s.checkinContact || {};
  const serverOn = safetyAuto();
  if (c) {
    const left = Math.max(0, Math.round((new Date(c.due_at) - Date.now()) / 1000));
    const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
    return {
      html: html`${header({ back: '#/', kicker: 'Safety check-in', title: 'Check-in is on' })}
      <main class="wrap">
        <div class="card pad sec" style="align-items:center">
          <div class="ok-face">${raw(okFace({ size: 96, label: 'You OK?' }))}</div>
          <div class="label">I'll check on you in</div>
          <div class="timer" id="timer">${mm}:${ss}</div>
          <div class="small" style="text-align:center">${c.place || 'Showing'} · ${c.contact_name || 'your contact'} is on standby</div>
        </div>
        <button class="btn green big block" type="button" id="ok">I'm OK · end check-in</button>
        <button class="btn block" type="button" id="extend">Add 15 minutes</button>
        <button class="btn red big block" type="button" id="help">Send help now</button>
        <div class="${serverOn ? 'note-box' : 'warn-box'}">${serverOn ? html`<b>Automatic alert is on.</b> If the timer runs out and you don't answer, ${c.contact_name || 'your contact'} gets a text from Brokers Bestie with where you are and who you're with, even if your phone is off.` : html`<b>Phone-only mode.</b> If the timer runs out, this phone will buzz and open a text to ${c.contact_name || 'your contact'} for you to send. Keep this phone with you and the sound on.`}</div>
      </main>`,
      mount(root) {
        clearInterval(tick);
        tick = setInterval(() => {
          const el = document.getElementById('timer');
          if (!el) return clearInterval(tick);
          const l = Math.max(0, Math.round((new Date(c.due_at) - Date.now()) / 1000));
          el.textContent = `${Math.floor(l / 60)}:${String(l % 60).padStart(2, '0')}`;
        }, 1000);
        root.querySelector('#ok').addEventListener('click', () => endCheckin(c, 'ok'));
        root.querySelector('#extend').addEventListener('click', () => {
          const due = new Date(new Date(c.due_at).getTime() + 15 * 60000).toISOString();
          store.save('checkins', { id: c.id, due_at: due, alerted_at: null });
          serverCheckin('extend', { id: c.id, due_at: due });
        });
        root.querySelector('#help').addEventListener('click', () => sendHelp(c));
      }
    };
  }
  const n = here && here.p;
  const pre = checkinPrefill || {};
  const startMins = [30, 45, 60, 90].reduce((best, m) => (pre.minutes && Math.abs(m - pre.minutes) < Math.abs(best - pre.minutes) ? m : best), 45);
  return {
    form: true,
    html: html`${header({ back: '#/', kicker: 'Safety check-in', title: 'Meeting someone new?' })}
    <main class="wrap"><form id="sf" class="sec" novalidate>
      ${fieldHtml({ name: 'place', label: 'Where', placeholder: '433 E Highway 4, Murphys' }, pre.place || (n ? n.address : ''))}
      <div class="grid2">${fieldHtml({ name: 'meeting_name', label: 'Meeting', placeholder: 'New buyer' }, pre.meeting_name)}${fieldHtml({ name: 'meeting_phone', label: 'Their phone', type: 'tel' })}</div>
      <div class="label">Check on me in</div>
      <div class="tabs" id="mins">${[30, 45, 60, 90].map((m) => html`<button class="tab ${m === startMins ? 'on' : ''}" type="button" data-m="${m}">${m} min</button>`)}</div>
      <div class="label" style="margin-top:6px">If I don't answer, text</div>
      <div class="grid2">${fieldHtml({ name: 'contact_name', label: 'Name', placeholder: 'James' }, contact.name)}${fieldHtml({ name: 'contact_phone', label: 'Phone', type: 'tel' }, contact.phone)}</div>
      <div class="hint">They get where you are, who you're meeting and that person's phone number.</div>
      <button class="btn dark big block" type="submit">${icon('shield', 20)}Start check-in</button>
      ${!serverOn ? html`<div class="warn-box"><b>Phone-only mode:</b> when time is up this phone buzzes and opens the text for you. Keep it with you with the sound on.</div>` : ''}
    </form></main>`,
    mount(root) {
      let minutes = startMins;
      checkinPrefill = null;
      root.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
        minutes = Number(b.getAttribute('data-m'));
        root.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x === b));
      }));
      if (!n) locate({ quiet: true }).then((f) => { const near = nearest(f); const el = root.querySelector('[name=place]'); if (near && el && !el.value) el.value = near.p.address; });
      root.querySelector('#sf').addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(e.target).entries());
        if (!v.contact_phone) return toast('Add who to text if you don’t answer');
        store.saveSettings({ checkinContact: { name: v.contact_name, phone: v.contact_phone } });
        const fix = await locate({ quiet: true });
        const now = Date.now();
        const row = store.save('checkins', { ...v, minutes, status: 'active', started_at: new Date(now).toISOString(), due_at: new Date(now + minutes * 60000).toISOString(), lat: fix?.lat ?? null, lng: fix?.lng ?? null });
        serverCheckin('start', row);
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
        render();
      });
    }
  };
}

// Automatic texts are on when signed in to a team AND the server says texting
// is set up (Twilio in the Supabase function). Otherwise: phone-only, said plainly.
function safetyAuto() { return !!(store.cloud.enabled && store.cloud.user && store.settings().safetySms === true); }
async function serverCheckin(op, row) {
  if (!(store.cloud.enabled && store.cloud.user)) return;
  try { await store.syncNow(); await safetyCall(op, row); }
  catch (e) { if (safetyAuto()) toast('Could not reach the server; the phone timer is still on'); }
}

function endCheckin(c, how) {
  store.save('checkins', { id: c.id, status: how, ended_at: new Date().toISOString() });
  serverCheckin(how === 'ok' ? 'ok' : 'help', c);
  closeSheet();
  toast(how === 'ok' ? 'Glad you’re safe. Check-in ended.' : 'Help is on the way');
  if (location.hash.startsWith('#/safety')) render();
}

async function sendHelp(c) {
  const fix = await locate({ quiet: true });
  const loc = fix ? `https://maps.google.com/?q=${fix.lat},${fix.lng}` : (c.lat != null ? `https://maps.google.com/?q=${c.lat},${c.lng}` : '');
  const body = `I need help. I'm at ${c.place || 'a showing'}${c.meeting_name ? ` meeting ${c.meeting_name}` : ''}${c.meeting_phone ? ` (${prettyPhone(c.meeting_phone)})` : ''}. ${loc} Please call me now. If I don't answer, call 911.`;
  endCheckin(c, 'help');
  location.href = smsLink(c.contact_phone, body);
}

// Checked every 20 seconds wherever the agent is in the app.
function watchCheckin() {
  const c = activeCheckin();
  if (!c || document.querySelector('[data-due-prompt]')) return;
  if (Date.now() < new Date(c.due_at).getTime()) return;
  if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
  try { if (Notification.permission === 'granted') new Notification('Brokers Bestie: are you OK?', { body: 'Your check-in time is up.', requireInteraction: true }); } catch {}
  openSheet(html`<div class="sec" data-due-prompt>
    <div class="ok-face">${raw(okFace({ size: 96, label: 'You OK?' }))}</div>
    <div class="title" style="font-family:var(--tall);font-weight:800;font-size:30px;text-transform:uppercase">Are you OK?</div>
    <div class="muted">Your check-in at ${c.place || 'the showing'} is up.</div>
    <button class="btn green big block" type="button" id="dok">I'm OK</button>
    <button class="btn block" type="button" id="dext">Add 15 minutes</button>
    <button class="btn red big block" type="button" id="dhelp">Send help now</button>
  </div>`, (s) => {
    s.querySelector('#dok').addEventListener('click', () => endCheckin(c, 'ok'));
    s.querySelector('#dext').addEventListener('click', () => {
      const due = new Date(Date.now() + 15 * 60000).toISOString();
      store.save('checkins', { id: c.id, due_at: due });
      serverCheckin('extend', { id: c.id, due_at: due });
      closeSheet();
    });
    s.querySelector('#dhelp').addEventListener('click', () => sendHelp(c));
  });
}

// ======================================================================
// SETTINGS
// ======================================================================

// Settings → Reminders on this phone (2026-10-27).
function pushCardBody(c, s) {
  const st = pushState();
  if (st === 'install') return html`<div class="note-box">On an iPhone, reminders work from the home-screen app only (Apple's rule). Add Bestie to your home screen, open it from there, and come back here.</div>`;
  if (st === 'unsupported') return html`<div class="note-box">This browser can't show reminders. Open Bestie in Safari (iPhone) or Chrome (Android).</div>`;
  if (st === 'blocked') return html`<div class="note-box">Notifications are blocked for Bestie. Turn them on in your phone's Settings → Notifications, then come back.</div>`;
  if (!c.user) return html`<div class="note-box">Sign in first (Team mode, above): reminders are sent from your team's data.</div>`;
  return html`<label class="field"><span>Remind me before an appointment</span><select id="pushlead">${LEADS.map(([v, l]) => html`<option value="${v}" ${Number(s.pushLead || 30) === v ? raw('selected') : ''}>${l}</option>`)}</select></label>
    <div id="pushbtns" class="btns"><button class="btn dark" type="button" id="pushon">Turn on reminders</button></div>
    <div class="hint" id="pushmsg"></div>`;
}
function wirePushCard(root) {
  const box = root.querySelector('#pushbtns');
  if (!box) return;
  const msg = (t) => { root.querySelector('#pushmsg').textContent = t; };
  const paint = async () => {
    const on = !!(await currentSub()) && store.settings().pushOn;
    box.innerHTML = str(on ? html`<button class="btn green" type="button" id="pushtest">✓ On · send a test</button><button class="btn ghost" type="button" id="pushoff">Turn off</button>` : html`<button class="btn dark" type="button" id="pushon">Turn on reminders</button>`);
    box.querySelector('#pushon')?.addEventListener('click', async () => {
      msg('Turning on…');
      try { await turnOn(Number(root.querySelector('#pushlead').value)); msg('On. Sending a test so you can see one…'); const r = await sendTest(); msg(r.phones ? 'Test sent. It should pop up in a few seconds.' : 'On.'); }
      catch (e) { msg(e.message || 'Could not turn reminders on.'); }
      paint();
    });
    box.querySelector('#pushtest')?.addEventListener('click', async () => { msg('Sending…'); try { const r = await sendTest(); msg(r.phones ? 'Test sent.' : (r.error || 'No phone is signed up yet.')); } catch { msg('Could not reach the reminder service.'); } });
    box.querySelector('#pushoff')?.addEventListener('click', async () => { await turnOff(); msg('Reminders are off on this phone.'); paint(); });
  };
  root.querySelector('#pushlead')?.addEventListener('change', async (e) => {
    if (store.settings().pushOn && (await currentSub())) { try { await turnOn(Number(e.target.value)); msg('Saved.'); } catch (err) { msg(err.message); } }
    else store.saveSettings({ pushLead: Number(e.target.value) });
  });
  paint();
}

function viewSettings() {
  const s = store.settings();
  const c = store.cloud;
  return {
    form: true, // typed links and keys must not be wiped by a sync repaint
    html: html`${header({ back: '#/', kicker: 'Settings', title: 'Brokers Bestie' })}
    <main class="wrap">
      <section class="card pad sec">
        <div class="label">Tell Sara what you think</div>
        <div class="small">Something broken, confusing or missing? It opens an email with your phone type already filled in. Screenshots help.</div>
        <a class="btn dark block" id="feedback" href="${feedbackLink({ where: 'Settings', signedIn: !!store.cloud.user, version: APP_VERSION })}">Send feedback</a>
      </section>
      <section class="card pad sec">
        <div class="label accent">Team mode</div>
        ${!c.enabled ? html`<div>Everything is saved on this phone only. Team mode (sign-in, sharing with your team, automatic safety alerts) turns on once the server is set up.</div>`
          : !c.user ? html`<div>Sign in to save to your team and use it on every phone.</div>
            <label class="field"><span>Email</span><input id="email" type="email" autocomplete="email" placeholder="you@brokerage.com" value="${s.pendingEmail || ''}"></label>
            <label class="field"><span>Invite code from your team (if you have one)</span><input id="precode" autocomplete="off" autocapitalize="characters" placeholder="ABC123" value="${s.pendingInvite || ''}"></label>
            <button class="btn dark block" type="button" id="signin">Email me a sign-in code</button>
            <div class="hint">By signing in you agree to the <a href="terms.html">terms</a> and <a href="privacy.html">privacy policy</a>.</div>
            <div id="codebox" ${s.pendingEmail ? '' : raw('hidden')} class="sec">
              <label class="field"><span>Code from the email</span><input id="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456" class="codein"></label>
              <button class="btn teal big block" type="button" id="verify">Sign in</button>
              <div class="hint">Type the code here, in Bestie. Don't tap the link in the email on an iPhone: it signs in Safari, not this app.</div>
            </div>
            <div class="hint">With an invite code, you join that team as soon as you sign in.</div>`
          : html`<div>Signed in as <b>${c.user.email}</b>. ${c.status === 'synced' ? 'Everything is saved to your team.' : c.status === 'error' ? 'Last save did not go through; it will retry.' : ''}</div>
            <div class="btns"><button class="btn" type="button" id="syncnow">Save now</button><button class="btn" type="button" id="invite">Invite a teammate</button></div>
            <label class="field"><span>Join a team with a code</span><input id="joincode" autocomplete="off" placeholder="ABC123"></label>
            <button class="btn block" type="button" id="join">Join team</button>
            <button class="btn ghost block" type="button" id="signout">Sign out</button>`}
      </section>

      ${c.user ? html`<a class="card row sec" href="#/billing"><span class="grow"><span class="t">Your plan</span><span class="s">${s.billing ? planSentence(s.billing) : 'Plans and billing'}</span></span>${icon('chev', 18)}</a>` : ''}

      <section class="card pad sec" id="pushcard">
        <div class="label accent">Reminders on this phone</div>
        <div class="small">A tap on the shoulder when it is time to leave for each showing and appointment (from where you last were, else your home base, using the drive time), a 7:30 list of what is due today, and an “Are you OK?” when a safety check-in runs out.</div>
        ${pushCardBody(c, s)}
      </section>

      ${c.user ? html`<section class="card pad sec">
        <div class="label accent">Your phone's calendar</div>
        <div class="small">Shows Bestie's appointments, tours and deadlines in the calendar app you already use. It updates by itself (iPhone about every 15 minutes, Google a few times a day).</div>
        <div id="calbox"><button class="btn block" type="button" id="callink">${icon('cal', 18)}Get my calendar link</button></div>
      </section>

      <section class="card pad sec">
        <div class="label accent">Connect your CRM</div>
        <div class="small" id="crmstate">Checking…</div>
        <label class="field"><span>Your CRM</span><select id="crmkind">${CRM_CHOICES.map((c) => html`<option value="${c.id}">${c.label}${c.beta ? ' (new)' : ''}</option>`)}</select></label>
        <div id="crmkey1" class="sec">
          <label class="field"><span id="apikeylabel">API key</span><input id="apikey" autocomplete="off" spellcheck="false" placeholder="Leave empty to keep the saved key"></label>
          <div class="hint" id="apikeyhelp"></div>
        </div>
        <div id="crmsoon" class="note-box" hidden></div>
        <div id="crmfeed" class="sec" hidden>
          <label class="field"><span>Feed link (from your CRM)</span><input id="crmurl" type="url" autocomplete="off" placeholder="https://yourcrm.com/api/crm/bestie-feed"></label>
          <label class="field"><span>Feed key</span><input id="crmkey" autocomplete="off" spellcheck="false" placeholder="Leave empty to keep the saved key"></label>
          <button class="btn block" type="button" id="crmmake">Make a new key (copies it)</button>
        </div>
        <fieldset class="field" id="crmcontacts" style="border:0;padding:0;margin:0"><span>Which contacts should come in?</span>
          <label class="switch"><input type="radio" name="crmc" value="deals">Just the people on my deals</label>
          <label class="switch"><input type="radio" name="crmc" value="all">My contacts too (under Contacts)</label>
          <div id="crmgroups" class="sec" hidden style="padding-left:28px"><span class="small muted">Which groups?</span>
            ${CONTACT_KINDS.map((k) => html`<label class="switch"><input type="checkbox" name="crmg" value="${k.id}" checked>${k.many} <span class="small muted">(${k.hint})</span></label>`)}
          </div>
        </fieldset>
        <div class="hint">Your listings, deal dates, contacts and appointments come in from the CRM and update each time you open Bestie. Codes, photos and notes stay Bestie's: the CRM never changes them.</div>
        <div class="btns"><button class="btn dark" type="button" id="crmsave">Save and sync</button><button class="btn" type="button" id="crmrun">Sync now</button></div>
        <button class="btn ghost block" type="button" id="crmoff" hidden>Disconnect</button>
      </section>` : ''}

      <section class="card pad sec">
        <div class="label accent">Bright sun mode</div>
        <div class="small">Black on white, bigger words and solid lines, for reading your screen outdoors.</div>
        <label class="switch"><input type="checkbox" id="hcmode" ${s.highContrast ? raw('checked') : ''}>Turn on bright sun mode</label>
      </section>
      <button class="btn ghost block" type="button" id="rewelcome">Show the welcome again</button>

      <section class="card pad sec">
        <div class="label accent">Your profile & branding</div>
        ${myProfile() ? html`${brandBand(myProfile())}<a class="btn block" href="#/profile">${icon('edit', 18)}Edit profile, logo & license #s</a>
          <div class="btns"><button class="btn" type="button" data-setdbx="logo_id">${icon('photo', 18)}Logo from Dropbox</button><button class="btn" type="button" data-setdbx="headshot_id">${icon('person', 18)}Headshot from Dropbox</button></div>
          <div class="hint">Opens your own Dropbox: pick the file and it goes on your sign-in sheet and branding.</div>`
          : html`<div class="small">Add your name, brokerage, license numbers, logo and color. They go on your open house sign-in and the texts Bestie writes for you.</div><a class="btn dark block" href="#/profile">Set up my profile</a>`}
        <label class="field"><span>First name for “Mine” and your morning greeting</span><input id="myname" autocomplete="given-name" placeholder="Sara" value="${s.myName ? s.myName[0].toUpperCase() + s.myName.slice(1) : ''}"></label>
      </section>

      <section class="card pad sec">
        <div class="label">Home base (where tours start)</div>
        <div class="small">${s.homeBase ? `${s.homeBase.address} · pinned` : 'Not set. Tours start from where you are.'}</div>
        <label class="field"><span>Address</span><input id="hb" value="${s.homeBase?.address || ''}" placeholder="Office address"></label>
        <div class="btns"><button class="btn" type="button" id="hbhere">${icon('pin', 18)}I'm here now</button><button class="btn" type="button" id="hbfind">Find it</button></div>
        <label class="field"><span>Your state (helps find addresses)</span><input id="st" maxlength="2" autocapitalize="characters" value="${s.state || 'CA'}"></label>
      </section>

      <section class="card pad sec">
        <div class="label">Mileage</div>
        <label class="field"><span>IRS standard mileage rate ($ per mile)</span><input id="rate" type="number" step="0.001" inputmode="decimal" value="${s.irsRate || ''}" placeholder="Look up this year's rate on irs.gov"></label>
        <button class="btn block" type="button" id="saverate">Save rate</button>
      </section>

      <section class="card pad sec">
        <div class="label">Sample data</div>
        ${store.hasSample() ? html`<button class="btn block" type="button" id="clearsample">Clear the sample listings</button>` : html`<button class="btn block" type="button" id="loadsample">Show sample listings</button>`}
        <div class="small">Sample listings stay on this phone and never go to a team.</div>
      </section>

      <section class="card pad sec">
        <div class="label">Your data</div>
        <button class="btn block" type="button" id="export">Download everything (backup file)</button>
        <div class="small">Your data is yours: this file has every property, code, person, note, tour, drive and expense.</div>
      </section>

      <section class="card pad sec">
        <div class="label">Delete my account</div>
        ${c.user ? html`<div class="small" id="delwho">Removes your sign-in and your data from Brokers Bestie. This cannot be undone, so download the backup above first if you might want it.</div>
          <button class="btn ghost block" type="button" id="delacct" style="color:var(--alert)">Delete my account</button>`
          : html`<div class="small">You're not signed in, so everything is only on this phone.</div>
          <button class="btn ghost block" type="button" id="wipephone" style="color:var(--alert)">Erase everything on this phone</button>`}
      </section>

      ${installCard()}
      <div class="small" style="text-align:center;color:var(--muted, #7a8582)"><a href="privacy.html" style="color:inherit">Privacy</a> · <a href="terms.html" style="color:inherit">Terms</a> · <a href="mailto:${SUPPORT_EMAIL}" style="color:inherit">${SUPPORT_EMAIL}</a></div>
      <div class="small" style="text-align:center;color:var(--muted, #7a8582)">Version ${APP_VERSION}</div>
    </main>`,
    mount(root) {
      wireInstall(root);
      loadPhotos(root);
      root.querySelector('#signin')?.addEventListener('click', async () => {
        const email = root.querySelector('#email').value.trim();
        if (!email) return toast('Type your email');
        const code = root.querySelector('#precode').value.trim().toUpperCase();
        store.saveSettings({ pendingInvite: code });
        try {
          await store.signIn(email);
          store.saveSettings({ pendingEmail: email });
          root.querySelector('#codebox').hidden = false;
          root.querySelector('#otp').focus();
          toast('Check your email for the code');
        } catch (e) {
          // Rate-limited: a code from an earlier email still works.
          if (/Too many/.test(e.message)) { store.saveSettings({ pendingEmail: email }); root.querySelector('#codebox').hidden = false; }
          toast(e.message);
        }
      });
      root.querySelector('#verify')?.addEventListener('click', async () => {
        const email = root.querySelector('#email').value.trim() || store.settings().pendingEmail;
        const code = root.querySelector('#otp').value.trim();
        if (!email) return toast('Type your email');
        if (code.replace(/\D/g, '').length < 6) return toast('Type the code from the email');
        try {
          await store.verifyCode(email, code);
          store.saveSettings({ pendingEmail: '' });
          toast('Signed in');
          render();
        } catch (e) { toast(e.message); }
      });
      root.querySelector('#syncnow')?.addEventListener('click', () => store.syncNow());
      root.querySelector('#signout')?.addEventListener('click', async (e) => {
        e.target.disabled = true;
        try { await store.signOut(); toast('Signed out. Everything stays saved on this phone.'); } catch (err) { toast(err.message || 'Could not sign out'); }
        render(); // Settings never repaints by itself (it would wipe typing)
      });
      root.querySelector('#invite')?.addEventListener('click', async () => {
        try { const code = await store.inviteCode(); await copy(code); openSheet(html`<div class="sec"><div class="label">Invite code</div><div class="num" style="font-size:44px;text-align:center">${code}</div><div class="small">Copied. Your teammate signs in, then enters this code under Settings → Join a team. It works for 7 days.</div><button class="btn block" type="button" onclick="this.closest('.sheet-back').remove()">Done</button></div>`); } catch (e) { toast(e.message); }
      });
      root.querySelector('#join')?.addEventListener('click', async () => {
        const code = root.querySelector('#joincode').value.trim();
        if (!code) return;
        try { await store.joinTeam(code); toast('You joined the team'); location.reload(); } catch (e) { toast(e.message); }
      });
      wirePushCard(root);
      root.querySelector('#callink')?.addEventListener('click', async () => {
        try {
          const token = await store.calToken();
          const https = `${location.origin}/api/cal/${token}.ics`;
          const webcal = https.replace(/^https?:/, 'webcal:');
          root.querySelector('#calbox').innerHTML = str(html`<div class="btns">
            <a class="btn dark" href="${webcal}">iPhone / Mac calendar</a>
            <a class="btn" href="${'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal)}" target="_blank" rel="noopener">Google Calendar</a>
          </div><button class="btn ghost block" type="button" id="calcopy">Copy the link</button>
          <div class="hint">Anyone with this link can see the team calendar, so keep it to yourselves.</div>`);
          root.querySelector('#calcopy').addEventListener('click', async () => { await copy(https); toast('Copied'); });
        } catch (e) { toast(e.message || 'Could not make the link'); }
      });
      if (store.cloud.user) {
        const st = root.querySelector('#crmstate');
        const kind = root.querySelector('#crmkind');
        const pickKind = () => {
          const c = CRM_CHOICES.find((x) => x.id === kind.value) || {};
          const keyed = !c.soon && c.id !== 'feed';
          root.querySelector('#crmkey1').hidden = !keyed;
          root.querySelector('#crmfeed').hidden = c.id !== 'feed';
          root.querySelector('#crmsoon').hidden = !c.soon;
          root.querySelector('#crmsoon').textContent = c.soon ? c.help : '';
          root.querySelector('#crmsave').disabled = !!c.soon;
          if (keyed) {
            root.querySelector('#apikeylabel').textContent = c.keyLabel;
            root.querySelector('#apikeyhelp').textContent = `${c.help} Paste it here. Bestie only reads: ${c.brings}. Nothing is ever changed in ${c.label}.${c.beta ? ' New connection: if something looks off after syncing, use Send feedback.' : ''}`;
          }
        };
        pickKind();
        kind.addEventListener('change', pickKind);
        const show = (r) => {
          const known = CRM_CHOICES.find((c) => c.id === r.provider && c.id !== 'feed');
          const who = known ? known.label : r.feed_url && /^https?:/.test(r.feed_url) ? new URL(r.feed_url).host : 'your CRM';
          st.textContent = r.connected ? `Connected to ${who}. ${r.last_result || ''}${r.last_synced_at ? ` (${new Date(r.last_synced_at).toLocaleString()})` : ''}` : 'Not connected.';
          if (r.connected) { kind.value = known ? known.id : 'feed'; pickKind(); }
          if (r.connected && r.contacts_mode) {
            const ch = contactsChoice(r.contacts_mode);
            root.querySelectorAll('[name=crmc]').forEach((x) => { x.checked = x.value === (ch.all ? 'all' : 'deals'); });
            root.querySelectorAll('[name=crmg]').forEach((x) => { x.checked = !ch.kinds || ch.kinds.has(x.value); });
            root.querySelector('#crmgroups').hidden = !ch.all;
          }
          connected = r.connected;
          if (r.connected && !known && !root.querySelector('#crmurl').value) root.querySelector('#crmurl').value = r.feed_url;
          root.querySelector('#crmoff').hidden = !r.connected;
        };
        api('/api/crm-sync').then(show).catch((e) => { st.textContent = e.message; });
        const call = async (body, btn) => {
          btn.disabled = true;
          st.textContent = 'Syncing…';
          try {
            const r = await api('/api/crm-sync', { method: 'POST', body: JSON.stringify(body) });
            show(r);
            if (r.result && r.result.ok) { await store.syncNow(); toast('Synced from your CRM'); pinCrmProperties(); }
            else if (r.result) toast(r.result.error);
          } catch (e) { st.textContent = e.message; }
          btn.disabled = false;
        };
        root.querySelector('#crmmake').addEventListener('click', async () => {
          const bytes = crypto.getRandomValues(new Uint8Array(24));
          const key = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
          root.querySelector('#crmkey').value = key;
          await copy(key);
          toast('New key copied. Paste it into your CRM too, then Save and sync.');
        });
        // Asked on connecting (Sara, 2026-10-27): the whole address book, or
        // only the people on deals. Changing it later syncs straight away.
        let connected = false;
        // 'deals', 'all', or only the ticked groups ('some:client,vendor').
        const chosenMode = () => {
          const r = (root.querySelector('[name=crmc]:checked') || {}).value || '';
          if (r !== 'all') return r;
          return contactsMode([...root.querySelectorAll('[name=crmg]:checked')].map((x) => x.value));
        };
        let groupTimer = null;
        const contactsChanged = () => {
          root.querySelector('#crmgroups').hidden = (root.querySelector('[name=crmc]:checked') || {}).value !== 'all';
          if (!connected) return;
          // Wait a moment so ticking three boxes is one sync, not three.
          clearTimeout(groupTimer);
          groupTimer = setTimeout(() => call({ op: 'contacts', contacts: chosenMode() }, root.querySelector('#crmrun')), 1500);
        };
        root.querySelectorAll('[name=crmc], [name=crmg]').forEach((x) => x.addEventListener('change', contactsChanged));
        root.querySelector('#crmsave').addEventListener('click', (e) => {
          const contacts = chosenMode();
          if (!contacts) { toast('Pick which contacts to bring in'); root.querySelector('#crmcontacts').scrollIntoView({ block: 'center' }); return; }
          call(kind.value !== 'feed'
            ? { op: 'save', provider: kind.value, key: root.querySelector('#apikey').value.trim(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, contacts }
            : { op: 'save', url: root.querySelector('#crmurl').value.trim(), key: root.querySelector('#crmkey').value.trim(), contacts }, e.currentTarget);
        });
        root.querySelector('#crmrun').addEventListener('click', (e) => call({ op: 'run' }, e.currentTarget));
        root.querySelector('#crmoff').addEventListener('click', (e) => { if (confirm('Stop syncing from this CRM? What already came in stays.')) call({ op: 'disconnect' }, e.currentTarget); });
      }
      root.querySelector('#rewelcome')?.addEventListener('click', () => showWelcome());
      root.querySelector('#delacct')?.addEventListener('click', () => deleteAccountSheet());
      root.querySelector('#wipephone')?.addEventListener('click', async () => {
        if (!confirm('Erase every property, code, note, tour and photo on this phone? This cannot be undone.')) return;
        await store.wipeLocal();
        location.replace('#/'); location.reload();
      });
      root.querySelectorAll('[data-setdbx]').forEach((b) => b.addEventListener('click', async () => {
        const prof = myProfile();
        if (!prof) { location.hash = '#/profile'; return; }
        if (!dropboxReady()) return toast('Dropbox is not connected yet');
        try {
          const [f] = await chooseFromDropbox({ images: true, multi: false });
          if (!f) return;
          const id = store.uid();
          await store.putPhoto(id, await store.shrinkPhoto(f, 800).catch(() => f));
          const field = b.getAttribute('data-setdbx');
          store.save('profiles', { id: prof.id, [field]: id, [field.replace('_id', '_path')]: null });
          toast(field === 'logo_id' ? 'Logo saved' : 'Headshot saved');
        } catch (e) { toast(e.message || 'Could not get that from Dropbox'); }
      }));
      root.querySelector('#hcmode')?.addEventListener('change', (e) => { store.saveSettings({ highContrast: e.target.checked }); applyContrast(); });
      root.querySelector('#myname')?.addEventListener('change', (e) => { store.saveSettings({ myName: firstName(e.target.value) }); toast('Saved'); });
      const hb = root.querySelector('#hb');
      root.querySelector('#hbhere').addEventListener('click', async () => {
        const fix = await locate();
        if (fix) { store.saveSettings({ homeBase: { address: hb.value || 'Home base', lat: fix.lat, lng: fix.lng } }); toast('Home base saved'); }
      });
      root.querySelector('#hbfind').addEventListener('click', async () => {
        if (!hb.value) return toast('Type the address');
        const g = await geocode(hb.value);
        if (g) { store.saveSettings({ homeBase: { address: hb.value, lat: g.lat, lng: g.lng } }); toast('Home base saved'); }
        else toast('Could not find it. Use “I’m here now” at the office.');
      });
      root.querySelector('#st').addEventListener('change', (e) => { store.saveSettings({ state: e.target.value.trim().toUpperCase() || 'CA' }); toast('Saved'); });
      root.querySelector('#saverate').addEventListener('click', () => { store.saveSettings({ irsRate: root.querySelector('#rate').value }); toast('Saved'); });
      root.querySelector('#clearsample')?.addEventListener('click', () => { store.clearSample(); toast('Sample data cleared'); });
      root.querySelector('#loadsample')?.addEventListener('click', () => { store.loadSample(sampleData()); toast('Sample data added'); });
      root.querySelector('#export').addEventListener('click', () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ...store.snapshot() }, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url; a.download = `brokers-bestie-backup-${todayIso()}.json`;
        document.body.appendChild(a); a.click(); a.remove();
      });
    }
  };
}

function notFound() {
  return { html: html`${header({ back: '#/', title: 'Not found' })}<main class="wrap"><div class="card empty">That item isn't here any more.</div></main>` };
}

// ======================================================================
// CALENDAR
// ======================================================================

const kindLabel = (k) => (EVENT_KINDS.find(([v]) => v === k) || [k, ''])[1] || '';
const dayHeading = (iso) => {
  const today = todayIso();
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

// ---------- colours and the filter ----------
// One colour per kind of thing (js/brief.js COLOR_KINDS), always with its word
// beside it, so nothing is told apart by colour alone.
const kindWord = (k) => (COLOR_KINDS.find(([v]) => v === k) || [k, ''])[1];
const colorClass = (ck, late) => `c-${late ? 'late' : ck}`;
const ktag = (ck, late) => html`<span class="ktag ${colorClass(ck, late)}">${late ? 'Overdue' : kindWord(ck)}</span>`;

const FILTER_KEY = 'bb:filter';
let viewFilter = (() => { try { return JSON.parse(localStorage.getItem(FILTER_KEY)) || {}; } catch { return {}; } })();
function setFilter(patch) {
  viewFilter = { ...viewFilter, ...patch };
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(viewFilter)); } catch {}
  render();
}
// The chip row: All, then one chip per colour kind. withProperty adds the
// one-house picker (Calendar).
function filterBar({ withProperty = false } = {}) {
  const chip = (k, label) => html`<button type="button" class="chip ${(viewFilter.kind || null) === k ? 'on' : ''}" data-kind="${k || ''}">${k ? html`<span class="dot ${colorClass(k)}"></span>` : ''}${label}</button>`;
  // Folded to one line until it is needed (Sara, 2026-10-27, Today cleanup).
  // Open while a filter is on, so what is hidden is never a mystery.
  const kindName = viewFilter.kind ? ((COLOR_KINDS.find(([k]) => k === viewFilter.kind) || [, ''])[1] + 's') : '';
  const whoName = viewFilter.who ? viewFilter.who[0].toUpperCase() + viewFilter.who.slice(1) : '';
  const on = [whoName, kindName, withProperty && viewFilter.property ? (prop(viewFilter.property)?.address || '') : ''].filter(Boolean);
  return html`<details class="filters" ${on.length ? raw('open') : ''}>
    <summary class="filters-sum">${icon('filter', 16)}<span>${on.length ? html`Showing: <b>${on.join(' · ')}</b>` : 'Filter'}</span>${on.length ? html`<button type="button" class="chip-clear" data-clearfilter aria-label="Show everything">✕</button>` : ''}</summary>
    ${whoChips()}
    <div class="chips">${chip(null, 'All')}${COLOR_KINDS.map(([k, l]) => chip(k, l + 's'))}</div>
    ${withProperty ? html`<select class="prop-filter" id="propfilter" aria-label="Show one property"><option value="">All properties</option>${props().slice().sort((a, b) => a.address.localeCompare(b.address)).map((p) => html`<option value="${p.id}" ${viewFilter.property === p.id ? raw('selected') : ''}>${p.address}</option>`)}</select>` : ''}
  </details>`;
}
// Everyone · Mine · <each other person>. Shown once a team has two people.
function whoChips() {
  const me = myName();
  const others = teamNames(store.snapshot(), me);
  if (!others.length) return '';
  const who = viewFilter.who || null;
  const c = (v, label) => html`<button type="button" class="chip who ${who === v ? 'on' : ''}" data-who="${v || ''}">${label}</button>`;
  return html`<div class="chips">${c(null, 'Everyone')}${c(me || '__me', 'Mine')}${others.map((n) => c(n, n[0].toUpperCase() + n.slice(1)))}</div>`;
}
const myName = () => firstName(store.settings().myName);

function askMyName(then) {
  formSheet({
    title: 'What is your first name?',
    fields: [{ name: 'name', label: 'First name', placeholder: 'Sara', hint: 'Use the name your CRM gives you, so your listings and appointments show as Mine.' }],
    values: { name: store.settings().myName || '' },
    onSave(v) {
      const n = firstName(v.name);
      if (!n) { toast('Type your first name'); return false; }
      store.saveSettings({ myName: n });
      if (then) then(n);
    }
  });
}

function wireFilter(root) {
  root.querySelectorAll('[data-who]').forEach((b) => b.addEventListener('click', () => {
    const v = b.getAttribute('data-who');
    if (v === '__me') return askMyName((n) => setFilter({ who: n }));
    setFilter({ who: v || null });
  }));
  root.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => setFilter({ kind: b.getAttribute('data-kind') || null })));
  root.querySelector('#propfilter')?.addEventListener('change', (e) => setFilter({ property: e.target.value || null }));
  root.querySelector('[data-clearfilter]')?.addEventListener('click', (e) => { e.preventDefault(); setFilter({ kind: null, who: null, property: null }); });
}

// One row of the calendar or the Today schedule. Tapping opens what it is.
function dayItemRow(i, day = todayIso()) {
  const ck = itemKind(i);
  const late = isLate(i, day, todayIso());
  const time = i.start != null && i.kind !== 'task' ? html`<span class="num cal-time">${formatClock(i.start).replace(':00 ', ' ')}</span>` : html`<span class="cal-time allday">${{ date: 'Due', task: 'To do', event: 'All day', tour: '' }[i.kind]}</span>`;
  const kl = i.kind === 'event' ? kindLabel(i.sub) : '';
  const sub = [i.kind === 'event' ? (kl && !i.title.toLowerCase().includes(kl.toLowerCase().split(' ')[0]) ? kl : '') : '', i.where].filter(Boolean).join(' · ');
  const attrs = i.kind === 'tour' ? raw(`href="#/tour/${esc(i.id)}"`) : i.kind === 'event' ? raw(`data-event="${esc(i.id)}"`) : i.kind === 'date' ? raw(`data-cal-date="${esc(i.id)}"`) : raw(`data-cal-task="${esc(i.id)}"`);
  const tag = i.kind === 'tour' ? 'a' : 'button';
  return html`${raw(`<${tag} class="row cal-row k-${i.kind} ${colorClass(ck, late)}${i.done ? ' done-row' : ''}" ${tag === 'button' ? 'type="button"' : ''} `)}${attrs}${raw('>')}
    ${time}<span class="grow"><span class="t ${i.done ? 'done-text' : ''}">${i.title}</span><span class="s">${ktag(ck, late)}${sub}</span></span>${raw(`</${tag}>`)}`;
}

function wireDayRows(root) {
  root.querySelectorAll('[data-event]').forEach((b) => b.addEventListener('click', () => eventSheet(store.get('events', b.getAttribute('data-event')))));
  root.querySelectorAll('[data-cal-date]').forEach((b) => b.addEventListener('click', () => { const d = store.get('dates', b.getAttribute('data-cal-date')); if (d) dateSheet(d.property_id, d); }));
  root.querySelectorAll('[data-cal-task]').forEach((b) => b.addEventListener('click', () => {
    if (confirm('Mark this to-do done?')) store.save('tasks', { id: b.getAttribute('data-cal-task'), done: true, done_at: new Date().toISOString() });
  }));
}

function eventSheet(e, prefill = {}) {
  const v = e ? { ...e, time: minutesToTime(e.start_minutes) } : { kind: 'showing', date: todayIso(), minutes: 30, ...prefill };
  formSheet({
    title: e ? e.title || 'Appointment' : 'New appointment',
    fields: [
      { name: 'title', label: 'What', placeholder: 'Walk-through with the buyers' },
      { name: 'kind', label: 'Kind', type: 'select', options: EVENT_KINDS },
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'time', label: 'Start (leave empty for all day)', type: 'time' },
      { name: 'minutes', label: 'How long', type: 'select', options: [['15', '15 min'], ['30', '30 min'], ['45', '45 min'], ['60', '1 hour'], ['90', '1½ hours'], ['120', '2 hours'], ['180', '3 hours']] },
      { name: 'property_id', label: 'Property', type: 'select', options: [['', '— none —'], ...props().map((p) => [p.id, p.address])] },
      { name: 'location', label: 'Where (if not the property)', placeholder: 'Title office, 125 Main St' },
      { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'With the Smiths. Bring the CMA.' },
      { name: 'showing_agent', label: 'Showing agent (on your listing, for feedback)', placeholder: 'Pat Lee' },
      { name: 'showing_agent_phone', label: 'Their phone', type: 'tel' }
    ],
    values: { ...v, minutes: String(v.minutes || 30), property_id: v.property_id || '' },
    extra: e && store.crmLinked(e) ? html`<div class="note-box">On your CRM's calendar too. A change or delete here goes to the CRM at the next sync.</div>` : '',
    onSave(f) {
      if (!f.title && !f.property_id) { toast('Say what it is'); return false; }
      if (!f.date) { toast('Pick the date'); return false; }
      store.save('events', { ...(e ? { id: e.id } : {}), title: f.title || `${kindLabel(f.kind)} · ${addr(f.property_id)}`, kind: f.kind, date: f.date, start_minutes: timeToMinutes(f.time), minutes: Number(f.minutes) || null, property_id: f.property_id || null, location: f.location, notes: f.notes, showing_agent: f.showing_agent || '', showing_agent_phone: f.showing_agent_phone || '', done: e ? !!e.done : false });
      toast(e ? 'Saved' : `Added to ${dayHeading(f.date).toLowerCase() === 'today' ? 'today' : niceDate(f.date)}`);
    },
    // A CRM appointment is cancelled, not removed: the CRM is told at the next
    // sync and deletes it there too. Bestie-only ones just go.
    onDelete: e ? () => (store.crmLinked(e) ? (store.save('events', { id: e.id, cancelled: true }), undoToast('Appointment removed', () => store.save('events', { id: e.id, cancelled: false }))) : del('events', e.id, 'Appointment deleted')) : null
  });
}

let calFrom = null;
function viewCalendar() {
  const today = todayIso();
  calFrom = calFrom || today;
  if (viewFilter.property && !prop(viewFilter.property)) viewFilter.property = null;
  const days = agenda(store.snapshot(), calFrom, 45).map((d) => ({ ...d, items: filterItems(d.items, viewFilter) })).filter((d) => d.items.length);
  const filtered = !!(viewFilter.kind || viewFilter.property);
  const link = store.cloud.user ? null : 'Sign in (Settings) to see it in your phone calendar too.';
  return {
    html: html`${header({ kicker: 'Calendar', title: calFrom === today ? 'Coming up' : `From ${niceDate(calFrom)}`, sub: 'Appointments, tours, deadlines and to-dos in one list.', right: html`<button class="btn teal" type="button" id="addevent" style="min-height:40px">+ Add</button>` })}
    <main class="wrap">
      <div class="tabs">
        <button class="tab ${calFrom === today ? 'on' : ''}" type="button" data-from="${today}">From today</button>
        <button class="tab" type="button" data-from="${addDays(calFrom, -7)}">‹ Week before</button>
        <label class="tab cal-pick">Jump to…<input type="date" id="jump" value="${calFrom}"></label>
      </div>
      ${filterBar({ withProperty: true })}
      <a class="btn block" href="#/showings">${icon('sheet', 18)}Add showings from a confirmation</a>
      ${days.length ? days.map(({ day, items }) => html`<section class="sec">
        <div class="sec-head"><div class="label ${day === today ? 'accent' : ''}">${dayHeading(day)}${day !== today && day !== addDays(today, 1) ? '' : html` · ${niceDate(day)}`}</div><button class="btn ghost" type="button" data-addon="${day}" style="min-height:32px">+</button></div>
        <div class="card list">${items.map((i) => dayItemRow(i, day))}</div>
      </section>`) : html`<div class="card empty">${filtered ? 'Nothing of that kind in the next 45 days. Tap All to see everything.' : 'Nothing in the next 45 days. Tap + Add, or tell Bestie: “Walk-through tomorrow at 10 at 433 Highway 4.”'}</div>`}
      ${link ? html`<div class="hint" style="text-align:center">${link}</div>` : html`<a class="hint" href="#/settings" style="text-align:center;display:block">Put this calendar on your phone's own calendar →</a>`}
    </main>`,
    mount(root) {
      root.querySelector('#addevent').addEventListener('click', () => eventSheet(null));
      root.querySelectorAll('[data-addon]').forEach((b) => b.addEventListener('click', () => eventSheet(null, { date: b.getAttribute('data-addon') })));
      root.querySelectorAll('[data-from]').forEach((b) => b.addEventListener('click', () => { calFrom = b.getAttribute('data-from'); render(); }));
      root.querySelector('#jump').addEventListener('change', (ev) => { if (ev.target.value) { calFrom = ev.target.value; render(); } });
      wireDayRows(root);
      wireFilter(root);
    }
  };
}

// ---------- the morning briefing ----------

function briefingCard() {
  const data = store.snapshot();
  const b = briefing(data, todayIso(), { pickups: pickups().length });
  const hour = new Date().getHours();
  const hello = (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening') + (myName() ? `, ${myName()[0].toUpperCase()}${myName().slice(1)}` : '');
  const timed = b.today.filter((i) => i.kind !== 'task' && i.kind !== 'date');
  const shownTimed = filterItems(timed, { kind: viewFilter.kind, who: viewFilter.who });
  const facts = [
    timed.length ? `${bookedSummary(timed)} today${timed[0].start != null ? `, first at ${formatClock(timed[0].start)}` : ''}` : 'Nothing booked today',
    ...b.closings.map((c) => `${c.address} closes ${whenSaid(c.date, b.day)}`),
    b.deadlines.length ? `${b.deadlines.length} deadline${b.deadlines.length === 1 ? '' : 's'} in the next 7 days` : '',
    b.late.length ? `${b.late.length} overdue to-do${b.late.length === 1 ? '' : 's'}` : '',
    b.lateDates.length ? `${b.lateDates.length} deadline${b.lateDates.length === 1 ? '' : 's'} passed, not marked done` : ''
  ].filter(Boolean);
  return html`<section class="card pad sec brief">
    <div class="sec-head"><div class="hi-wrap"><span class="buddy-hi">${raw(winkFace({ size: 36, label: '' }))}</span><div><div class="label accent">Your day</div><div class="brief-date">${hello.split(',')[0]}</div></div></div>
      <button class="btn" type="button" id="readbrief" style="min-height:40px;white-space:nowrap" aria-label="Read it to me">${icon('speak', 18)}Listen</button></div>
    <ul class="brief-facts">${facts.map((f) => html`<li>${f}</li>`)}</ul>
    ${shownTimed.length ? html`<div class="card list">${shownTimed.map((i) => dayItemRow(i))}</div>` : ''}
    ${b.deadlines.length ? html`<div class="small">${b.deadlines.slice(0, 4).map((d) => `${d.label} · ${addr(d.property_id)} · ${whenSaid(d.due, b.day)}`).join(' — ')}</div>` : ''}
    <a class="small" href="#/calendar" style="color:var(--teal-text);font-weight:600">Open the calendar →</a>
  </section>`;
}

function readBriefing(button) {
  if (!('speechSynthesis' in window)) return toast('This phone cannot read aloud');
  if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
  const data = store.snapshot();
  const hour = new Date().getHours();
  const text = briefingText(briefing(data, todayIso(), { pickups: pickups().length }), data, { hello: hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening', name: myName() ? myName()[0].toUpperCase() + myName().slice(1) : '' });
  const say = new SpeechSynthesisUtterance(text);
  say.lang = 'en-US';
  say.rate = 1;
  if (button) { button.textContent = 'Stop'; say.onend = say.onerror = () => { button.innerHTML = str(html`${icon('speak', 18)}Listen`); }; }
  speechSynthesis.speak(say);
}

// ---------- CRM sync from the phone ----------

// ---------- your plan (2026-10-28) ----------
// The team's plan from /api/billing, cached in settings (billing, readOnly) so
// the banner and the read-only guard work offline. Fetched once a session and
// again after Stripe sends someone back (?billing=done).
let billingChecked = false;
async function refreshBilling(force = false) {
  if ((billingChecked && !force) || !store.cloud.user || !navigator.onLine) return store.settings().billing || null;
  billingChecked = true;
  try {
    const b = await api('/api/billing');
    const was = store.settings().readOnly;
    store.saveSettings({ billing: b, readOnly: !b.canWrite });
    if (was !== !b.canWrite) render();
    return b;
  } catch { return store.settings().billing || null; }
}
let roToastAt = 0;
store.onReadOnlyBlock(() => {
  if (Date.now() - roToastAt < 4000) return;
  roToastAt = Date.now();
  toast('Your plan has ended, so changes are paused. Choose a plan under Settings → Your plan.');
});

// The banner at the top of Today: only when there is something to do.
function planBanner() {
  const b = store.settings().billing;
  if (!b || !store.cloud.user) return '';
  const urgent = b.state === 'lapsed' && b.enforced;
  const soon = b.state === 'trial' && !b.subscribed && b.daysLeft <= 3;
  if (!urgent && !soon && b.state !== 'past_due') return '';
  return html`<a class="card pad sec plan-banner ${urgent || b.state === 'past_due' ? 'bad' : ''}" href="#/billing">
    <div class="label">${urgent ? 'Read-only' : b.state === 'past_due' ? 'Payment problem' : 'Free trial'}</div>
    <div>${planSentence(b)}</div><div class="small" style="font-weight:700">See plans →</div></a>`;
}

function viewBilling() {
  const b = store.settings().billing;
  const signedIn = !!store.cloud.user;
  const done = /[?&]billing=done/.test(location.search);
  const offer = (b && b.plans) || plansOffered();
  return {
    html: html`${header({ back: '#/settings', kicker: 'Brokers Bestie', title: 'Your plan' })}
    <main class="wrap">
      ${done ? html`<div class="card pad sec" style="border-color:var(--done)"><b>Thank you!</b> Your plan is being set up. It can take a minute to show here.</div>` : ''}
      ${!signedIn ? html`<div class="card pad sec">Sign in first (Settings), then choose a plan for your team.</div>`
        : html`<section class="card pad sec">
          <div class="label accent">Right now</div>
          <div id="plannow" style="font-size:18px;font-weight:600">${b ? planSentence(b) : 'Checking…'}</div>
          ${b && b.seats ? html`<div class="small">${b.seats} agent${b.seats === 1 ? '' : 's'} on your team. You pay per agent; the count follows your team.</div>` : ''}
          ${b && b.subscribed ? html`<button class="btn dark block" type="button" id="portal">Manage billing (card, plan, cancel)</button>` : ''}
        </section>
        ${b && (b.subscribed || b.state === 'comped') ? '' : html`<section class="sec">
          <div class="label">Choose a plan</div>
          <div class="small">Your first 14 days are free and need no card. Pick a plan now or any time before then: you are not charged until the trial ends.</div>
          ${offer.map((p) => html`<button class="card pad plan-pick" type="button" data-plan="${p.id}" style="width:100%;text-align:left">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><b style="font-size:19px">${p.label}</b><span class="num" style="font-size:26px">${p.price}<span class="small"> / agent / ${p.per}</span></span></div>
            ${p.note ? html`<div class="small">${p.note}</div>` : ''}</button>`)}
          ${b && !b.payments ? html`<div class="small">Payments are not switched on yet.</div>` : ''}
        </section>`}`}
      <p class="small muted">Payments are handled by Stripe. Nothing is ever deleted if a plan ends: everything stays readable, and changes pause until a plan is active again. <a href="terms.html">Terms</a></p>
    </main>`,
    async mount(root) {
      if (signedIn) {
        const fresh = await refreshBilling(true);
        if (done) history.replaceState(null, '', location.pathname + '#/billing');
        if (fresh && JSON.stringify(fresh) !== JSON.stringify(b)) return render();
      }
      root.querySelectorAll('[data-plan]').forEach((el) => el.addEventListener('click', async () => {
        el.disabled = true;
        try { const r = await api('/api/billing', { method: 'POST', body: JSON.stringify({ op: 'checkout', plan: el.dataset.plan }) }); location.href = r.url; }
        catch (e) { toast(e.message); el.disabled = false; }
      }));
      root.querySelector('#portal')?.addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        try { const r = await api('/api/billing', { method: 'POST', body: JSON.stringify({ op: 'portal' }) }); location.href = r.url; }
        catch (err) { toast(err.message); e.currentTarget.disabled = false; }
      });
    }
  };
}

let crmChecked = false;
// Once a session, when signed in: ask the server to pull the CRM if it has not
// in the last hour, then fetch what it wrote.
async function autoCrmSync() {
  if (crmChecked || !store.cloud.user || !navigator.onLine) return;
  crmChecked = true;
  try {
    const r = await api('/api/crm-sync', { method: 'POST', body: JSON.stringify({ op: 'auto' }) });
    if (r.result && r.result.ok) { await store.syncNow(); pinCrmProperties(); }
  } catch {}
}

// A deadline ticked or an appointment changed on a CRM property goes to the
// CRM a few seconds later (save to the team first, then ask the server to send).
let crmPushTimer = null;
store.onCrmChange(() => {
  if (!store.cloud.user) return;
  clearTimeout(crmPushTimer);
  crmPushTimer = setTimeout(async () => {
    try {
      await store.syncNow();
      const r = await api('/api/crm-sync', { method: 'POST', body: JSON.stringify({ op: 'run' }) });
      if (r.result && !r.result.ok) toast(`Saved here. The CRM did not take it yet: ${r.result.error}`);
      else await store.syncNow();
    } catch { /* stays marked; the next sync sends it */ }
  }, 5000);
});

// Properties that came from the CRM have no map pin; find a few each time.
const pinTried = new Set();
async function pinCrmProperties() {
  const todo = props().filter((p) => p.source === 'crm' && p.lat == null && !pinTried.has(p.id)).slice(0, 5);
  for (const p of todo) {
    pinTried.add(p.id);
    const g = await geocode([p.address, p.city].filter(Boolean).join(', '));
    if (g && !g.approximate) store.save('properties', { id: p.id, lat: g.lat, lng: g.lng });
  }
}

// ======================================================================
// MLS SHEETS
// ======================================================================

// A photographed or downloaded MLS sheet. The pages stay on the property as a
// field note; Bestie reads them and offers to fill in the card. Nothing it
// read is saved until the agent ticks it.
const MAX_PAGES = 4;
const MAX_SEND_BYTES = 3.2 * 1024 * 1024; // a request can carry 4.5 MB, and sending adds a third
const sheetState = { pid: null, files: [], step: 'pick', result: null, error: '' };

function resetSheet(pid) {
  Object.assign(sheetState, { pid: pid || null, files: [], step: 'pick', result: null, error: '' });
}

async function addSheetFiles(list) {
  for (const file of list) {
    if (sheetState.files.length >= MAX_PAGES) { toast(`Up to ${MAX_PAGES} pages per sheet`); break; }
    const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (pdf && file.size > 20 * 1024 * 1024) { toast('That PDF is over 20 MB'); continue; }
    // 2000px keeps the small print on a sheet readable.
    const blob = pdf ? file : await store.shrinkPhoto(file, 2000).catch(() => file);
    sheetState.files.push({ blob, type: pdf ? 'application/pdf' : blob.type || 'image/jpeg', url: URL.createObjectURL(blob) });
  }
}

function toBase64(blob) {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] || '');
    r.onerror = () => fail(r.error);
    r.readAsDataURL(blob);
  });
}

async function readSheet() {
  const size = sheetState.files.reduce((n, f) => n + f.blob.size, 0);
  if (size > MAX_SEND_BYTES) {
    Object.assign(sheetState, { step: 'error', error: 'This file is too big for Bestie to read. Save it to the property, or snap photos of the pages instead.' });
    return render();
  }
  sheetState.step = 'reading';
  render();
  try {
    const files = await Promise.all(sheetState.files.map(async (f) => ({ type: f.type, data: await toBase64(f.blob) })));
    const r = await api('/api/read-sheet', { method: 'POST', body: JSON.stringify({ files }) });
    sheetState.result = r.sheet;
    sheetState.step = 'review';
    if (!sheetState.pid && r.sheet.address) {
      const m = matchProperty(r.sheet.address, props());
      if (m) sheetState.pid = m.id;
    }
  } catch (e) {
    Object.assign(sheetState, { step: 'error', error: navigator.onLine ? e.message : 'No signal right now. Save the sheet to the property and read it later.' });
  }
  render();
}

// The pages go on the property as one note, whether or not they were read.
async function fileSheet(pid, text) {
  const files = [];
  for (const f of sheetState.files) {
    const id = store.uid();
    await store.putPhoto(id, f.blob);
    files.push({ id, type: f.type });
  }
  store.save('notes', { property_id: pid, text: text || 'MLS sheet', source: 'mls_sheet', files });
}

function sheetValue(field, v) {
  if (field === 'price') return fullMoney(v);
  if (field === 'occupancy') return v === 'O' ? 'Occupied' : v === 'V' ? 'Vacant' : v;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

const DBX_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#0061FE" d="M7 3 2 6.2l5 3.2 5-3.2zm10 0-5 3.2 5 3.2 5-3.2zM2 12.6l5 3.2 5-3.2-5-3.2zm15-3.2-5 3.2 5 3.2 5-3.2zM7 17l5 3.2 5-3.2-5-3.2z"/></svg>';

// Until a Dropbox app key is set, the phone's own file picker reaches Dropbox.
function dropboxHelp() {
  openSheet(html`<div class="sec">
    <div class="title" style="font-family:var(--tall);font-weight:700;font-size:24px;text-transform:uppercase">From Dropbox</div>
    <div class="small">Use <b>Photo or PDF</b>, then:</div>
    <ol class="install-steps">
      <li><b>iPhone:</b> tap <b>Choose File</b>, then <b>Browse</b>, then <b>Dropbox</b> under Locations. Not there? Tap <b>•••</b> → <b>Edit</b> and turn Dropbox on. You need the Dropbox app installed.</li>
      <li><b>Android:</b> tap the <b>☰</b> menu in the picker and choose <b>Dropbox</b>.</li>
    </ol>
    <button class="btn dark block" type="button" id="dbxok">Got it</button>
  </div>`, (sh) => sh.querySelector('#dbxok').addEventListener('click', closeSheet));
}

function viewSheet(pid) {
  if (pid && !prop(pid)) return notFound();
  // A different property starts a fresh sheet; one being read or reviewed is kept.
  if ((pid || null) !== sheetState.pid && !['review', 'reading'].includes(sheetState.step)) resetSheet(pid);
  const s = sheetState;
  const target = s.pid ? prop(s.pid) : null;
  const pages = s.files.length ? html`<div class="pages">${s.files.map((f, i) => html`<span class="page">${f.type === 'application/pdf' ? html`<span class="pdf">PDF</span>` : html`<img alt="" src="${f.url}">`}${s.step === 'pick' ? html`<button type="button" class="x" data-rm="${i}" aria-label="Remove page">×</button>` : ''}</span>`)}</div>` : '';
  const fileUnder = (value) => fieldHtml({ name: 'target', label: 'File under', type: 'select', options: [...(s.result && s.result.address && !target ? [['__new', `New property: ${s.result.address}`]] : [['', '— choose a property —']]), ...props().map((p) => [p.id, p.address])] }, value);
  let body;

  if (s.step === 'review') {
    const sheet = s.result;
    const base = target || {};
    const changes = sheetChanges(sheet, base);
    const extras = sheetExtras(sheet, { access: target ? store.where('access', 'property_id', target.id) : [], people: target ? store.where('people', 'property_id', target.id) : [] });
    body = html`
      ${fileUnder(target ? target.id : '__new')}
      ${!target ? fieldHtml({ name: 'status', label: 'Status', type: 'select', options: Object.entries(STATUS) }, 'tour') : ''}
      <section class="sec">
        <div class="label accent">${target ? 'Update the card' : 'Fill in the card'} · ${changes.length}</div>
        <div class="card list">${changes.length ? changes.map((c) => html`<label class="row pick"><input type="checkbox" data-pick="f:${c.field}" ${c.checked ? raw('checked') : ''}><span class="grow"><span class="t">${c.label}: ${sheetValue(c.field, c.value)}</span>${c.current != null ? html`<span class="s wait">Card now says ${sheetValue(c.field, c.current)}</span>` : ''}</span></label>`) : html`<div class="empty">Nothing new for the card.</div>`}</div>
      </section>
      ${extras.codes.length ? html`<section class="sec"><div class="label accent">Getting in</div><div class="card list">${extras.codes.map((c, i) => html`<label class="row pick"><input type="checkbox" data-pick="c:${i}" checked><span class="grow"><span class="t">${c.label || KINDS[c.kind || 'lockbox']?.label}${c.code ? html` · <span class="num">${c.code}</span>` : ''}</span><span class="s">${c.where || ''}</span></span></label>`)}</div></section>` : ''}
      ${extras.people.length ? html`<section class="sec"><div class="label accent">People</div><div class="card list">${extras.people.map((m, i) => html`<label class="row pick"><input type="checkbox" data-pick="p:${i}" checked><span class="grow"><span class="t">${m.name}</span><span class="s">${[m.role, m.phone, m.email].filter(Boolean).join(' · ')}</span></span></label>`)}</div></section>` : ''}
      <label class="field"><span>Field notes (kept with the sheet)</span><textarea name="note" style="min-height:160px">${sheetNoteText(sheet)}</textarea></label>
      ${pages}
      <button class="btn dark big block" type="button" id="savesheet">Save to the property</button>
      <button class="btn ghost block" type="button" id="startover">Start over</button>`;
  } else if (s.step === 'reading') {
    body = html`${pages}<div class="note-box"><b>Reading the sheet…</b> This takes about half a minute.</div>`;
  } else {
    body = html`
      ${s.step === 'error' ? html`<div class="warn-box">${s.error}</div>` : ''}
      ${pages}
      ${s.step === 'pick' ? html`<div class="btns">
        <label class="btn big">${icon('photo', 20)}${s.files.length ? 'Snap another page' : 'Snap the sheet'}<input type="file" accept="image/*" capture="environment" id="snap" hidden></label>
        <label class="btn big">${icon('sheet', 20)}Photo or PDF<input type="file" accept="image/*,application/pdf" multiple id="pick" hidden></label>
      </div>
      <button class="btn big block" type="button" id="dbx">${raw(DBX_ICON)}From Dropbox</button>` : ''}
      ${s.files.length ? html`
        <button class="btn dark big block" type="button" id="readit">${s.step === 'error' ? 'Try reading it again' : 'Read it'}</button>
        <div class="sec">${fileUnder(s.pid || '')}<button class="btn block" type="button" id="justsave">Just save it to the property</button></div>` : html`<div class="hint">Snap each page, or choose a PDF from your phone. Bestie reads the price, MLS #, showing instructions, lockbox and contacts, and you tick what to keep.</div>`}`;
  }

  return {
    form: true,
    html: html`${header({ back: pid ? `#/p/${pid}` : '#/props', kicker: 'MLS sheet', title: target ? target.address : 'Snap an MLS sheet', sub: s.step === 'review' ? 'Tick what to keep. Nothing is saved until you press Save.' : 'The pages stay with the property as field notes.' })}
    <main class="wrap"><div class="sec">${body}</div></main>`,
    mount(root) {
      const add = async (input) => { await addSheetFiles([...input.files]); render(); };
      root.querySelector('#snap')?.addEventListener('change', (e) => add(e.target));
      root.querySelector('#pick')?.addEventListener('change', (e) => add(e.target));
      root.querySelector('#dbx')?.addEventListener('click', async (e) => {
        if (!dropboxReady()) return dropboxHelp();
        const b = e.currentTarget; b.disabled = true;
        try {
          const files = await chooseFromDropbox();
          if (files.length) { await addSheetFiles(files); toast(`Added ${files.length} from Dropbox`); render(); }
        } catch (err) { toast(err.message || 'Could not get it from Dropbox'); }
        finally { b.disabled = false; }
      });
      root.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { s.files.splice(Number(b.getAttribute('data-rm')), 1); render(); }));
      root.querySelector('#readit')?.addEventListener('click', readSheet);
      root.querySelector('#startover')?.addEventListener('click', () => { resetSheet(pid); render(); });
      const sel = root.querySelector('[name=target]');
      if (s.step === 'review') sel.addEventListener('change', () => { s.pid = sel.value && sel.value !== '__new' ? sel.value : null; render(); });
      root.querySelector('#justsave')?.addEventListener('click', async () => {
        const to = sel.value;
        if (!to) return toast('Pick the property first');
        await fileSheet(to, 'MLS sheet');
        resetSheet();
        hubFor = to; hubTab = 'notes';
        toast(`Saved to ${addr(to)}`);
        location.hash = `#/p/${to}`;
      });
      root.querySelector('#savesheet')?.addEventListener('click', async () => {
        const sheet = s.result;
        const picked = new Set([...root.querySelectorAll('[data-pick]:checked')].map((x) => x.getAttribute('data-pick')));
        let to = sel.value === '__new' ? null : sel.value;
        if (sel.value === '') return toast('Pick the property first');
        const base = to ? prop(to) : {};
        const patch = Object.fromEntries(sheetChanges(sheet, base).filter((c) => picked.has('f:' + c.field)).map((c) => [c.field, c.value]));
        const extras = sheetExtras(sheet, { access: to ? store.where('access', 'property_id', to) : [], people: to ? store.where('people', 'property_id', to) : [] });
        if (!to) {
          const address = patch.address || sheet.address;
          if (!address) return toast('The sheet has no address: pick the property');
          to = store.save('properties', { status: root.querySelector('[name=status]').value, ...patch, address }).id;
          const fresh = prop(to);
          geocode([fresh.address, fresh.city].filter(Boolean).join(', ')).then((g) => { if (g && !g.approximate) store.save('properties', { id: to, lat: g.lat, lng: g.lng }); });
        } else if (Object.keys(patch).length) {
          store.save('properties', { id: to, ...patch });
        }
        extras.codes.forEach((c, i) => {
          if (!picked.has('c:' + i)) return;
          const kind = c.kind || 'lockbox';
          store.save('access', { property_id: to, kind, label: c.label || KINDS[kind].label, code: c.code || '', location_note: c.where || '', ...(KINDS[kind].tracked ? { status: 'out' } : {}) });
        });
        extras.people.forEach((m, i) => { if (picked.has('p:' + i)) store.save('people', { property_id: to, name: m.name, role: m.role || '', phone: m.phone || '', email: m.email || '' }); });
        await fileSheet(to, root.querySelector('[name=note]').value.trim());
        resetSheet();
        hubFor = to; hubTab = 'people';
        toast(`Saved to ${addr(to)}`);
        location.hash = `#/p/${to}`;
      });
    }
  };
}

async function openFile(id, path) {
  const url = await store.photoUrl(id, path);
  if (url) window.open(url, '_blank', 'noopener');
  else toast('That page is on another phone and has not uploaded yet');
}

// ======================================================================
// TELL BESTIE (voice commands)
// ======================================================================

let checkinPrefill = null;

// The property a command is about when the agent names none: the one on
// screen, else the one they are standing at.
function focusProperty() {
  const m = (location.hash || '').match(/^#\/(?:p|sheet)\/([^/]+)/);
  if (m && prop(m[1])) return m[1];
  return here && here.p ? here.p.id : null;
}

const NEEDS_PROPERTY = ['note', 'code', 'date', 'person'];

function tellBestie() {
  const focus = focusProperty();
  openSheet(html`<div class="sec">
    <div class="title" style="font-family:var(--tall);text-transform:uppercase;font-weight:700;font-size:24px">Tell Bestie</div>
    <div class="small">${focus ? html`Files to <b>${addr(focus)}</b> unless you name another property.` : 'Say the property and what to add.'}</div>
    <label class="field"><span>What you said</span><textarea id="say" placeholder="Gate code at Echo is 2580. Remind me Friday to order the home warranty."></textarea></label>
    <button class="btn big block" type="button" data-mic="say">${icon('mic', 22)}Tap and talk</button>
    <button class="btn dark big block" type="button" id="doit">Do it</button>
    <div id="tbout" class="sec"></div>
    <div class="hint">Try: “Lockbox at 433 Highway 4 is on the hose bib, code 1234.” · “To-do tomorrow: call the appraiser.” · “Drove 42 miles for showings.” · “Plan a tour: 1143 Echo Street Angels Camp, then 324 Augusta Court Valley Springs at 11.”</div>
    <button class="btn ghost block" type="button" data-cancel>Close</button>
  </div>`, (s) => {
    wireMics(s);
    s.querySelector('[data-cancel]').addEventListener('click', closeSheet);
    s.querySelector('#doit').addEventListener('click', () => runCommand(s, focus));
    if (Recognition) s.querySelector('[data-mic]').click(); // start listening straight away
  });
}

async function runCommand(s, focus) {
  const say = s.querySelector('#say');
  const mic = s.querySelector('[data-mic]');
  // Stop listening first, keeping what is in the box: stopping rewrites the box
  // from what was heard, which would wipe anything typed meanwhile.
  const typed = say.value;
  if (mic.classList.contains('dark')) { mic.click(); say.value = typed; }
  const text = typed.trim();
  const out = s.querySelector('#tbout');
  if (!text) return toast('Say or type what you need');
  out.innerHTML = str(html`<div class="note-box">Working it out…</div>`);
  let actions;
  try {
    const r = await api('/api/assist', { method: 'POST', body: JSON.stringify({ text, today: todayIso(), focus, properties: props().map((p) => ({ id: p.id, address: p.address, city: p.city || '' })) }) });
    actions = r.actions || [];
  } catch (e) {
    // Bestie can't be reached: what they said is still worth keeping.
    out.innerHTML = str(html`<div class="warn-box">${navigator.onLine ? e.message : 'No signal right now.'}<br>You can still keep what you said:</div>
      <div class="btns"><button class="btn" type="button" data-keep="task">Save as a to-do</button>${focus ? html`<button class="btn" type="button" data-keep="note">Save as a note</button>` : ''}</div>`);
    out.querySelectorAll('[data-keep]').forEach((b) => b.addEventListener('click', () => {
      if (b.getAttribute('data-keep') === 'note') store.save('notes', { property_id: focus, text });
      else store.save('tasks', { text, due: todayIso(), property_id: focus, done: false });
      closeSheet();
      toast('Saved');
    }));
    return;
  }
  const items = actions.map((a) => ({ a, p: actionPlan(a, { today: todayIso() }) }));
  const paint = () => {
    out.innerHTML = str(html`${items.length ? html`<div class="label accent">Bestie will</div>
      <div class="card list">${items.map(({ a, p }, i) => p.error ? html`<div class="row pick">
        <input type="checkbox" data-act="${i}" disabled aria-label="Can't save yet">
        <span class="grow"><span class="t">${a.summary}</span><span class="s wait">${p.error}</span>
          ${NEEDS_PROPERTY.includes(a.type) ? html`<select data-fix="${i}" aria-label="Property"><option value="">— choose the property —</option>${props().map((x) => html`<option value="${x.id}">${x.address}</option>`)}</select>` : ''}
        </span></div>` : html`<label class="row pick">
        <input type="checkbox" data-act="${i}" checked>
        <span class="grow"><span class="t">${a.summary}</span>${p.row && p.row.property_id ? html`<span class="s">${addr(p.row.property_id)}</span>` : ''}</span></label>`)}</div>
      <button class="btn dark big block" type="button" id="apply">Save</button>` : html`<div class="warn-box">Bestie didn't find anything to do. Try saying it another way.</div>`}`);
    out.querySelectorAll('[data-fix]').forEach((sel) => sel.addEventListener('change', () => {
      const it = items[Number(sel.getAttribute('data-fix'))];
      it.a = { ...it.a, property_id: sel.value || null };
      it.p = actionPlan(it.a, { today: todayIso() });
      paint();
    }));
    out.querySelector('#apply')?.addEventListener('click', () => {
      let saved = 0;
      let go = null;
      out.querySelectorAll('[data-act]:checked').forEach((box) => {
        const { p } = items[Number(box.getAttribute('data-act'))];
        if (p.table) {
          const row = store.save(p.table, p.row);
          saved++;
          if (p.table === 'properties') geocode([row.address, row.city].filter(Boolean).join(', ')).then((g) => { if (g && !g.approximate) store.save('properties', { id: row.id, lat: g.lat, lng: g.lng }); });
        } else if (p.go && !go) go = p;
      });
      closeSheet();
      if (saved) toast(`Saved ${saved} thing${saved === 1 ? '' : 's'}`);
      if (go) {
        if (go.plan) Object.assign(plan, { step: 'talk', text: go.plan, stops: [], result: null, manual: false, order: [] });
        if (go.checkin) checkinPrefill = go.checkin;
        location.hash = go.go;
      }
    });
  };
  paint();
}

// ======================================================================
// ROUTER
// ======================================================================

const ROUTES = [
  [/^#?\/?$/, () => viewToday(), 'today'],
  [/^#\/props$/, () => viewProps(), 'props'],
  [/^#\/p\/new$/, () => viewPropEdit(null), 'props'],
  [/^#\/p\/([^/]+)\/edit$/, (m) => viewPropEdit(m[1]), 'props'],
  [/^#\/p\/([^/]+)$/, (m) => viewHub(m[1]), 'props'],
  [/^#\/quick(?:\/([a-z]+))?(?:\/([^/]+))?$/, (m) => viewQuick(m[1], m[2]), 'quick'],
  [/^#\/sheet(?:\/([^/]+))?$/, (m) => viewSheet(m[1]), 'props'],
  [/^#\/calendar$/, () => viewCalendar(), 'calendar'],
  [/^#\/signs$/, () => viewSigns(), 'today'],
  [/^#\/plan$/, () => viewPlan(), 'tours'],
  [/^#\/tours$/, () => viewTours(), 'tours'],
  [/^#\/tour\/([^/]+)$/, (m) => viewTour(m[1]), 'tours'],
  [/^#\/vendors$/, () => viewVendors(), 'today'],
  [/^#\/updates$/, () => viewSellerUpdates(), 'today'],
  [/^#\/billing$/, () => viewBilling(), 'today'],
  [/^#\/contacts(?:\/(.+))?$/, (m) => viewContacts(m[1] ? decodeURIComponent(m[1]) : null), 'today'],
  [/^#\/showings$/, () => viewShowingsImport(), 'calendar'],
  [/^#\/taxes\/(\d{4})$/, (m) => viewTaxes(m[1]), 'today'],
  [/^#\/door\/([^/]+)\/(\d+)$/, (m) => viewDoor(m[1], Number(m[2])), 'kiosk'],
  [/^#\/buyers$/, () => viewBuyers(), 'tours'],
  [/^#\/buyer\/([^/]+)$/, (m) => viewBuyer(m[1]), 'tours'],
  [/^#\/miles(?:\/(add))?$/, (m) => viewMiles(m[1]), 'today'],
  [/^#\/safety$/, () => viewSafety(), 'today'],
  [/^#\/settings$/, () => viewSettings(), 'today'],
  [/^#\/profile$/, () => viewProfile(), 'today'],
  [/^#\/openhouse\/([^/]+)$/, (m) => viewOpenHouse(m[1]), 'kiosk'],
  [/^#\/visitors\/([^/]+)$/, (m) => viewVisitors(m[1]), 'props']
];

let current = null;
// Bright sun mode lives on <html> so every screen, sheet and toast gets it.
// Ask once per start whether the server texts safety alerts yet.
setTimeout(() => serverStatus().then((changed) => { if (changed && /^#\/safety/.test(location.hash)) render(); }), 1500);

function applyContrast() { document.documentElement.classList.toggle('hc', !!store.settings().highContrast); }
applyContrast();

// Each section header in its own colour (Sara, 2026-10-27: "highlight each
// header ... with unique colors"). One place decides: a header whose words
// name a kind of thing takes that thing's colour (Tours purple, Key dates
// orange, Seller updates rose...); any other header gets a colour from the
// header palette by its words, so the same header is always the same colour.
const HEADER_HUES = [
  [/getting in|codes?\b|lockbox/i, 'code'], [/tour|showing/i, 'showing'], [/key date|deadline|due/i, 'deadline'],
  [/clos/i, 'closing'], [/to ?do/i, 'todo'], [/seller|listing/i, 'listing'], [/escrow/i, 'escrow'],
  [/appoint|calendar|today|coming up/i, 'appt'], [/safety|check-in/i, 'safety'], [/people|vendor|contact|buyer/i, 'people'],
  [/note|feedback/i, 'notes'], [/remind/i, 'remind'], [/status/i, 'status']
];
const HEADER_PALETTE = ['indigo', 'plum', 'ocean', 'forest', 'rust', 'teal', 'berry', 'olive'];
function headerHue(text) {
  const t = String(text || '').trim();
  for (const [re, hue] of HEADER_HUES) if (re.test(t)) return hue;
  let h = 0; for (const c of t.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HEADER_PALETTE[h % HEADER_PALETTE.length];
}
function colorHeaders(root) {
  root.querySelectorAll('.sec-head > .label, section > .label:first-child, .card > .label:first-child, .sec > .label:first-child, .status-pick .label').forEach((el) => {
    if (el.closest('.brief')) return; // the greeting keeps its own look
    el.classList.add('hd');
    const hue = headerHue(el.textContent);
    el.dataset.hue = hue;
    // A short tab the width of the words, on a thin line of the same color
    // (2026-10-28). The line runs under the whole header row.
    if (!el.querySelector(':scope > .hd-t')) { const t = document.createElement('span'); t.className = 'hd-t'; t.append(...el.childNodes); el.append(t); }
    const row = el.parentElement;
    if (row && row.classList.contains('sec-head')) { row.classList.add('hd-row'); row.dataset.hue = hue; }
  });
  // Only the most urgent thing on a screen is filled in: the first late item.
  root.querySelector('.ktag.c-late')?.classList.add('urgent');
}

function render() {
  const hash = location.hash || '#/';
  let view = notFound();
  let tab = 'today';
  for (const [re, fn, t] of ROUTES) {
    const m = hash.match(re);
    if (m) { view = fn(m); tab = t; break; }
  }
  current = view;
  $view.innerHTML = str(view.html);
  wire($view);
  colorHeaders($view);
  if (view.mount) view.mount($view);
  $nav.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  // The open house sheet is a kiosk: no nav, no mic, nothing to wander into.
  document.body.classList.toggle('kiosk', tab === 'kiosk');
  $fab.hidden = !!view.form; // a screen with its own form has its own mic
  document.getElementById('offline').hidden = navigator.onLine;
}

let lastHash = location.hash;
window.addEventListener('hashchange', () => {
  closeSheet();
  clearInterval(tick);
  if (location.hash !== lastHash) window.scrollTo(0, 0);
  lastHash = location.hash;
  render();
});
// A change made elsewhere (a sync, a save from a pop-up) repaints the screen.
// Never while a pop-up is open or on a screen with a form: repainting there
// would wipe what the agent is typing. The pop-up repaints when it closes.
store.onChange(() => {
  if (document.querySelector('.sheet-back') || (current && current.form)) { pendingRender = true; return; }
  render();
});
window.addEventListener('online', render);
window.addEventListener('offline', render);

$fab.addEventListener('click', tellBestie);
$fab.setAttribute('aria-label', 'Tell Bestie');
addEventListener('scroll', () => $fab.classList.toggle('mini', scrollY > 40), { passive: true });
render();
store.startCloud();
// First open: a short welcome (2026-10-27). Once per phone, never on the
// visitor or kiosk pages; Settings → "Show the welcome again".
const WELCOME = [
  { face: 'wink', title: 'Hi, I’m Bestie', body: 'Your codes, showings, tours and deadlines in one place, built for the car and the front door.' },
  { face: 'love', title: 'Every code, one tap', body: 'Save the lockbox, gate and alarm codes with a photo of where they are. At the door, they show up huge.' },
  { face: 'again', title: 'Tours that plan themselves', body: 'Read Bestie the addresses and it puts them in order, texts the listing agents, and logs your miles.' },
  { face: 'ok', title: 'Make it yours', body: 'Add your name and brokerage, put Bestie on your home screen, and turn on reminders in Settings.' }
];
function showWelcome() {
  let i = 0;
  const face = (k) => (k === 'wink' ? winkFace({ size: 110, label: '' }) : k === 'ok' ? okFace({ size: 110, label: '' }) : reactionFace(k, { size: 110, label: '' }));
  const paint = (sh) => {
    const w = WELCOME[i];
    sh.querySelector('[data-wface]').innerHTML = face(w.face);
    sh.querySelector('[data-wtitle]').textContent = w.title;
    sh.querySelector('[data-wbody]').textContent = w.body;
    sh.querySelector('[data-wdots]').innerHTML = WELCOME.map((_, j) => `<span class="wdot${j === i ? ' on' : ''}"></span>`).join('');
    sh.querySelector('#wnext').textContent = i < WELCOME.length - 1 ? 'Next' : 'Show me around';
    sh.querySelector('#wsample').hidden = i < WELCOME.length - 1 || props().length > 0;
  };
  openSheet(html`<div class="sec welcome" style="text-align:center">
    <div data-wface></div>
    <div class="title" data-wtitle style="font-family:var(--tall);font-weight:800;font-size:30px;text-transform:uppercase"></div>
    <div data-wbody style="font-size:18px"></div>
    <div class="wdots" data-wdots></div>
    <button class="btn dark big block" type="button" id="wnext">Next</button>
    <button class="btn block" type="button" id="wsample" hidden>Look around with sample data</button>
    <button class="btn ghost block" type="button" id="wskip">Skip</button>
  </div>`, (sh) => {
    const done = () => { store.saveSettings({ welcomed: true }); closeSheet(); };
    sh.querySelector('#wnext').addEventListener('click', () => { if (i < WELCOME.length - 1) { i++; paint(sh); } else done(); });
    sh.querySelector('#wskip').addEventListener('click', done);
    sh.querySelector('#wsample').addEventListener('click', () => { done(); document.querySelector('#sample')?.click(); });
    paint(sh);
  });
}
setTimeout(() => {
  if (store.settings().welcomed || props().length || /^#\/(door|openhouse)/.test(location.hash)) { if (!store.settings().welcomed && props().length) store.saveSettings({ welcomed: true }); return; }
  showWelcome();
}, 600);
setInterval(watchCheckin, 20000);
watchCheckin();
locationAllowed().then(async (yes) => {
  if (!yes) return;
  here = nearest(await locate({ quiet: true }));
  if (here && (location.hash === '' || location.hash === '#/')) render();
});

// Updates: a phone that reopens Bestie from the home screen resumes the old
// copy, so ask for a new one each time it comes back, and reload once the new
// one takes over (unless something is being typed: then offer a button).
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    const busy = document.querySelector('.sheet-back') || (current && current.form && document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
    if (!busy) { reloading = true; location.reload(); return; }
    if (document.querySelector('[data-update]')) return;
    const bar = document.createElement('button');
    bar.type = 'button'; bar.className = 'update-bar'; bar.setAttribute('data-update', '');
    bar.textContent = 'A new version of Bestie is ready. Tap to update.';
    bar.addEventListener('click', () => location.reload());
    document.body.appendChild(bar);
  });
}
