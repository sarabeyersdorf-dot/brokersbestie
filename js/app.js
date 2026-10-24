// Brokers Bestie: every screen. Hash routes (#/, #/p/<id>, #/tours …) so the
// back button, bookmarks and a home-screen launch all land where expected.

import * as store from './store.js';
import { html, raw, str, esc, icon, money, fullMoney, digits, prettyPhone, smsLink, mapLink, todayIso, daysFrom, niceDate, whenText, toast, copy } from './ui.js';
import { planRoute, routeInOrder, mapsUrl, formatClock, parseClock, haversineMiles, roadMiles, driveMinutes } from './route.js';
import { parseTourText, matchProperty, search, tripsCsv, mergeSpeech } from './parse.js';
import { sampleData } from './sample.js';
import { sheetChanges, sheetExtras, sheetNoteText, actionPlan, EVENT_KINDS } from './assist.js';
import { dayItems, agenda, briefing, briefingText, addDays, timeToMinutes, minutesToTime, COLOR_KINDS, itemKind, isLate, filterItems, PROP_SORTS, sortProps, isWhose, teamNames, firstName, bookedSummary, whenSaid } from './brief.js';

const $view = document.getElementById('view');
const $nav = document.getElementById('nav');
const $fab = document.getElementById('fab');

// ---------- vocabulary ----------

const STATUS = {
  listing: 'My listing', prep: 'Coming soon', escrow: 'In escrow', tour: 'Showing / other agent', closed: 'Closed', cancelled: 'Cancelled'
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
      ${back ? html`<a class="back" href="${back}">${icon('back', 18)}Back</a>` : html`<div class="brand">Brokers <span>Bestie</span></div>`}
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

function badges(p, onDark) {
  const occ = p.occupancy === 'O' ? html`<span class="occ O" title="Occupied: keep the booked time">O</span>`
    : p.occupancy === 'V' ? html`<span class="occ V" title="Vacant">V</span>`
    : html`<span class="occ q" title="Occupancy not known">?</span>`;
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
      (pos) => { lastFix = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() }; resolve(lastFix); },
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
    if (del) del.addEventListener('click', () => { if (confirm('Delete this?')) { onDelete(); closeSheet(); } });
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
      extra: html`<label class="search">${icon('search', 18)}<input id="q" type="search" placeholder="Search everything: address, code, name…" value="${searchText}" aria-label="Search everything" autocomplete="off"></label>`
    })}
    <main class="wrap">
      ${searchText ? html`<section class="sec">
        <div class="sec-head"><div class="label accent">${results.length} found</div><button class="btn ghost" type="button" id="clearq" style="min-height:36px">Clear</button></div>
        <div class="card list">${results.length ? results.slice(0, 40).map((r) => html`<a class="row" href="${r.propertyId ? '#/p/' + r.propertyId : '#/'}">
          <span class="pill tour" style="min-width:64px;text-align:center">${r.kind}</span>
          <span class="grow"><span class="t">${r.title}</span><span class="s">${r.sub}</span></span></a>`) : html`<div class="empty">Nothing matches “${searchText}”.</div>`}</div>
      </section>` : ''}

      ${empty && !searchText ? html`<section class="card pad sec">
        <div class="label accent">Welcome</div>
        <div style="font-size:18px;font-weight:600">Add your first listing, or look around with sample data.</div>
        <div class="btns"><a class="btn dark" href="#/p/new">Add a listing</a><button class="btn" type="button" id="sample">Show sample data</button></div>
      </section>` : ''}

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
      </section>` : !empty ? html`<button class="btn block" type="button" id="findme">${icon('pin', 18)}Where am I? Show this property's codes</button>` : ''}

      ${todos.length || !empty ? html`<section class="sec">
        <div class="sec-head"><div class="label">To do today · ${shownTodos.length}</div><button class="btn ghost" type="button" id="addtodo" style="min-height:36px">+ Add</button></div>
        <div class="card list">${shownTodos.length ? shownTodos.map((t) => t.pickup ? html`<a class="row ${colorClass(t.ck, t.late)}" href="#/signs"><span class="check" style="border-color:var(--pending)"></span><span class="grow"><span class="t">${t.text}</span><span class="s">${ktag(t.ck, t.late)}${t.sub}</span></span>${icon('chev', 18)}</a>`
          : t.tour ? html`<a class="row ${colorClass(t.ck, t.late)}" href="#/tour/${t.tour}"><span class="check" style="border-color:var(--pending)"></span><span class="grow"><span class="t">${t.text}</span><span class="s">${ktag(t.ck, t.late)}${t.sub}</span></span>${icon('chev', 18)}</a>`
          : html`<button class="row ${colorClass(t.ck, t.late)}" type="button" data-done="${t.table}:${t.id}"><span class="check"></span><span class="grow"><span class="t">${t.text}</span><span class="s ${t.late ? 'wait' : ''}">${ktag(t.ck, t.late)}${t.sub}</span></span></button>`) : html`<div class="empty">${todos.length ? 'Nothing of that kind today.' : 'Nothing due. Nice.'}</div>`}</div>
      </section>` : ''}

      <section class="sec">
        <div class="sec-head"><div class="label">Quick add${hp ? ' · files to ' + hp.address : ''}</div><a href="#/quick" class="small" style="color:var(--teal-text);font-weight:600">All →</a></div>
        <div class="tiles">
          ${TODAY_TILES.map((k) => html`<a class="tile" href="#/quick/${k}${hp ? '/' + hp.id : ''}"><span class="ic ${KINDS[k].y ? 'y' : ''}">${icon(KINDS[k].icon, 22)}</span>${KINDS[k].short || KINDS[k].label}</a>`)}
          <a class="tile" href="#/safety"><span class="ic r">${icon('shield', 22)}</span>Check-in</a>
        </div>
      </section>

      <section class="sec">
        <div class="sec-head"><div class="label">Tours today · ${tours.length}</div><a class="small" style="color:var(--teal-text);font-weight:600" href="#/plan">Plan a tour →</a></div>
        ${tours.length ? html`<div class="card list">${tours.map((t) => html`<a class="row" href="#/tour/${t.id}"><span class="num" style="font-size:20px;width:70px">${t.start_minutes != null ? formatClock(t.start_minutes) : ''}</span><span class="grow"><span class="t">${t.name || 'Tour'}</span><span class="s">${(t.stops || []).length} stops · ${(t.stops || []).filter((x) => x.confirmed).length} confirmed</span></span>${icon('chev', 18)}</a>`)}</div>`
          : html`<a class="card row" href="#/plan">${icon('mic', 20)}<span class="grow"><span class="t">Talk to plan a tour</span><span class="s">Read me the addresses; I'll put them in order</span></span></a>`}
      </section>

      ${live.length ? html`<section class="sec">
        <div class="sec-head"><div class="label">Active · ${live.length}</div><a class="small" style="color:var(--teal-text);font-weight:600" href="#/props">All properties →</a></div>
        <div class="card list">${live.slice(0, 8).map((p) => propRow(p))}</div>
      </section>` : ''}

      <section class="sec">
        <div class="btns"><a class="btn" href="#/miles">${icon('miles', 18)}Mileage</a><a class="btn" href="#/signs">${icon('sign', 18)}Signs</a><a class="btn" href="#/safety">${icon('shield', 18)}Safety check-in</a></div>
      </section>
      ${!store.cloud.enabled ? html`<div class="hint" style="text-align:center">Everything is saved on this phone.</div>` : ''}
    </main>`,
    mount(root) {
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
      root.querySelector('#addtodo')?.addEventListener('click', () => addTaskSheet());
      root.querySelector('#readbrief')?.addEventListener('click', (e) => readBriefing(e.currentTarget));
      wireFilter(root);
      wireDayRows(root.querySelector('.brief') || document.createElement('div'));
      autoCrmSync();
      root.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', () => {
        // Split at the FIRST colon only: ids from a CRM contain colons themselves.
        const v = b.getAttribute('data-done');
        const table = v.slice(0, v.indexOf(':'));
        const id = v.slice(v.indexOf(':') + 1);
        if (!store.get(table, id)) return toast('That item is no longer here');
        // Deadlines have no done_at column; to-dos do.
        store.save(table, table === 'tasks' ? { id, done: true, done_at: new Date().toISOString() } : { id, done: true });
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
      <div class="tabs">${tab('live', 'Active')}${tab('escrow', 'In escrow')}${tab('tour', 'Showing')}${tab('done', 'Closed')}</div>
      ${whoChips()}
      <label class="sortby">Sort<select id="propsort">${PROP_SORTS.map(([k, l]) => html`<option value="${k}" ${k === sortBy ? raw('selected') : ''}>${l}</option>`)}</select></label>
      <div class="card list">${list.length ? list.map(propRow) : html`<div class="empty">Nothing here yet.</div>`}</div>
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
  { name: 'showing_notes', label: 'Showing instructions', type: 'textarea', placeholder: 'Text the owner 2 hours ahead. Dog in the yard.', mic: true },
  { name: 'directions', label: 'Directions', type: 'textarea', placeholder: 'GPS is wrong: second drive past the mailboxes' },
  { name: 'disclosure_url', label: 'Disclosure package link', type: 'url', placeholder: 'https://' },
  { name: 'mls_url', label: 'MLS listing link', type: 'url', placeholder: 'https://' }
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
      <button class="btn dark block big" type="submit">Save</button>
      ${id ? html`<button class="btn ghost block" type="button" id="delprop">${icon('trash', 18)}Delete this property and everything filed under it</button>` : ''}
    </form></main>`,
    mount(root) {
      const form = root.querySelector('#pf');
      const pin = { lat: p.lat ?? null, lng: p.lng ?? null };
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
        location.hash = `#/p/${saved.id}`;
      });
      root.querySelector('#delprop')?.addEventListener('click', () => {
        if (confirm(`Delete ${p.address} and every code, person, note and date filed under it?`)) {
          store.removeProperty(id);
          location.hash = '#/props';
        }
      });
    }
  };
}

let hubTab = 'overview';
let hubFor = null;
function viewHub(id) {
  const p = prop(id);
  if (!p) return notFound();
  if (hubFor !== id) { hubFor = id; hubTab = 'overview'; }
  const access = store.where('access', 'property_id', id);
  const codes = codesOf(id);
  const spots = access.filter((a) => !CODE_KINDS.includes(a.kind) || !a.code);
  const people = store.where('people', 'property_id', id);
  const notes = store.where('notes', 'property_id', id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const dates = store.where('dates', 'property_id', id).sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const tasks = store.where('tasks', 'property_id', id).filter((t) => !t.done);
  const sheetNote = notes.find((n) => n.source === 'mls_sheet');
  const main = people.find((m) => /tenant|occupant|seller|owner|showing/i.test(m.role || '') && m.phone) || people.find((m) => m.phone);
  const coe = p.coe_date ? daysFrom(p.coe_date) : null;
  const tab = (k, l) => html`<button class="tab ${hubTab === k ? 'on' : ''}" type="button" data-tab="${k}">${l}</button>`;

  return {
    html: html`${header({
      back: '#/props',
      right: html`<span class="pill ${p.status}">${STATUS[p.status] || p.status}</span>`,
      title: p.address,
      sub: html`${p.city || ''}${p.price ? html` · <b class="num" style="font-size:18px">${fullMoney(p.price)}</b>` : ''}${p.mls ? html` · MLS <b>${p.mls}</b>` : ''}`,
      extra: html`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${badges(p, true)}<span class="sub">${[p.hoa && `HOA ${p.hoa}`, p.solar && `Solar ${p.solar}`, coe != null && p.status === 'escrow' ? `Closes ${niceDate(p.coe_date)} (${coe >= 0 ? coe + ' days' : 'passed'})` : ''].filter(Boolean).join(' · ')}</span></div>`
    })}
    <main class="wrap">
      <div class="actions">
        <a class="action" href="${mapLink(p)}" target="_blank" rel="noopener">${icon('pin', 22)}Directions</a>
        ${main ? html`<a class="action" href="tel:${digits(main.phone)}">${icon('phone', 22)}Call ${main.role ? main.role.split(' ')[0].toLowerCase() : ''}</a>
        <a class="action" href="${smsLink(main.phone)}">${icon('text', 22)}Text</a>` : html`<a class="action" href="#/quick/contact/${id}">${icon('person', 22)}Add contact</a><a class="action" href="#/quick/note/${id}">${icon('mic', 22)}Note</a>`}
        <button class="action dark" type="button" id="share">${icon('share', 22)}Share</button>
      </div>

      ${codes.length ? html`<section class="sec"><div class="label accent">Getting in</div>${codeBoxes(codes)}</section>` : html`<a class="card row" href="#/quick/lockbox/${id}"><span class="tile" style="border:0;padding:0"><span class="ic y">${icon('lockbox', 22)}</span></span><span class="grow"><span class="t">Add the lockbox or a code</span><span class="s">Gate, alarm, door keypad, hidden key</span></span></a>`}
      ${p.showing_notes ? html`<div class="card pad"><div class="label" style="margin-bottom:6px">Showing instructions</div><div style="white-space:pre-line">${p.showing_notes}</div></div>` : ''}

      <div class="tabs">${tab('overview', 'Overview')}${tab('where', `Where things are · ${spots.length}`)}${tab('people', `People · ${people.length}`)}${tab('notes', `Notes · ${notes.length}`)}</div>

      ${hubTab === 'overview' ? html`
        <section class="sec">
          <div class="sec-head"><div class="label">Key dates</div><button class="btn ghost" type="button" id="adddate" style="min-height:36px">+ Add</button></div>
          <div class="card list">${dates.length ? dates.map((d) => html`<button class="row" type="button" data-date="${d.id}">
            <span class="check ${d.done ? 'on' : ''}">${d.done ? '✓' : ''}</span>
            <span class="grow"><span class="t ${d.done ? 'done-text' : ''}">${d.label}</span><span class="s">${niceDate(d.due)} · ${whenText(d.due)}</span></span></button>`) : html`<div class="empty">No dates yet. Add contingencies, inspections, close of escrow.</div>`}</div>
        </section>
        <section class="sec">
          <div class="sec-head"><div class="label">To do · ${tasks.length}</div><button class="btn ghost" type="button" id="addtask" style="min-height:36px">+ Add</button></div>
          ${tasks.length ? html`<div class="card list">${tasks.map((t) => html`<button class="row" type="button" data-done="${t.id}"><span class="check"></span><span class="grow"><span class="t">${t.text}</span><span class="s">${t.due ? whenText(t.due) : ''}</span></span></button>`)}</div>` : ''}
        </section>
        ${p.directions ? html`<div class="card pad"><div class="label" style="margin-bottom:6px">Driving in</div><div style="white-space:pre-line">${p.directions}</div></div>` : ''}
        <div class="btns">
          ${p.disclosure_url ? html`<a class="btn" href="${safeUrl(p.disclosure_url)}" target="_blank" rel="noopener">Disclosures</a>` : ''}
          ${p.mls_url ? html`<a class="btn" href="${safeUrl(p.mls_url)}" target="_blank" rel="noopener">MLS listing</a>` : ''}
          <a class="btn" href="#/p/${id}/edit">${icon('edit', 18)}Edit details</a>
          ${sheetNote ? html`<button class="btn" type="button" data-tab="notes">${icon('sheet', 18)}MLS sheet</button>` : html`<a class="btn" href="#/sheet/${id}">${icon('sheet', 18)}Snap MLS sheet</a>`}
          <a class="btn" href="#/quick">${icon('plus', 18)}Quick add</a>
        </div>` : ''}

      ${hubTab === 'where' ? html`<section class="sec">
        <div class="card list">${access.length ? access.map((a) => html`<button class="row" type="button" data-access="${a.id}">
          ${a.photo_id ? html`<img class="thumb" data-photo="${a.photo_id}" data-path="${a.photo_path || ''}" alt="">` : html`<span class="tile" style="border:0;padding:0"><span class="ic ${KINDS[a.kind]?.y ? 'y' : ''}" style="width:40px;height:40px">${icon(KINDS[a.kind]?.icon || 'pin', 20)}</span></span>`}
          <span class="grow"><span class="t">${a.label || KINDS[a.kind]?.label}${a.code ? html` · <span class="num">${a.code}</span>` : ''}</span><span class="s">${[a.location_note, KINDS[a.kind]?.tracked ? (a.status === 'office' ? 'Back in the office' : 'Out at the property') : ''].filter(Boolean).join(' · ')}</span></span>
        </button>`) : html`<div class="empty">Nothing yet. Add the lockbox, sign, septic lids, shut-offs, with a photo.</div>`}</div>
        <a class="btn dark block" href="#/quick/lockbox/${id}">+ Add something</a>
      </section>` : ''}

      ${hubTab === 'people' ? html`<section class="sec">
        <div class="card list">${people.length ? people.map(personRow) : html`<div class="empty">No one yet. Add the seller, tenant, escrow officer, the other agent.</div>`}</div>
        <a class="btn dark block" href="#/quick/contact/${id}">+ Add a person</a>
      </section>` : ''}

      ${hubTab === 'notes' ? html`<section class="sec">
        <label class="field"><span>New note</span><textarea id="newnote" placeholder="Buyer wants the shed gone"></textarea></label>
        <div class="btns"><button class="btn" type="button" data-mic="newnote">${icon('mic', 18)}Talk</button><button class="btn dark" type="button" id="savenote">Save note</button><a class="btn" href="#/sheet/${id}">${icon('sheet', 18)}MLS sheet</a></div>
        <div class="card list">${notes.length ? notes.map((n) => html`<div class="row" style="align-items:flex-start"><span class="grow"><span class="s">${niceDate(n.created_at)}</span><span style="white-space:pre-line">${n.text}</span>${(n.files || []).length ? html`<span class="pages">${n.files.map((f) => html`<button type="button" class="page" data-file="${f.id}" data-path="${f.path || ''}" aria-label="Open page">${f.type === 'application/pdf' ? html`<span class="pdf">PDF</span>` : html`<img alt="" data-photo="${f.id}" data-path="${f.path || ''}">`}</button>`)}</span>` : ''}</span><button class="icon-btn" type="button" data-delnote="${n.id}" aria-label="Delete note">${icon('trash', 16)}</button></div>`) : html`<div class="empty">No notes yet.</div>`}</div>
      </section>` : ''}
    </main>`,
    mount(root) {
      wireMics(root);
      root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { hubTab = b.getAttribute('data-tab'); render(); }));
      root.querySelector('#share').addEventListener('click', () => shareSheet(p));
      root.querySelector('#adddate')?.addEventListener('click', () => dateSheet(id));
      root.querySelector('#addtask')?.addEventListener('click', () => addTaskSheet(id));
      root.querySelectorAll('[data-date]').forEach((b) => b.addEventListener('click', () => dateSheet(id, store.get('dates', b.getAttribute('data-date')))));
      root.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', () => store.save('tasks', { id: b.getAttribute('data-done'), done: true, done_at: new Date().toISOString() })));
      root.querySelectorAll('[data-access]').forEach((b) => b.addEventListener('click', () => accessSheet(store.get('access', b.getAttribute('data-access')))));
      root.querySelectorAll('[data-edit-person]').forEach((b) => b.addEventListener('click', () => personSheet(id, store.get('people', b.getAttribute('data-edit-person')))));
      root.querySelector('#savenote')?.addEventListener('click', () => {
        const t = root.querySelector('#newnote').value.trim();
        if (!t) return;
        store.save('notes', { property_id: id, text: t });
        toast('Note saved');
      });
      root.querySelectorAll('[data-file]').forEach((b) => b.addEventListener('click', () => openFile(b.getAttribute('data-file'), b.getAttribute('data-path'))));
      root.querySelectorAll('[data-delnote]').forEach((b) => b.addEventListener('click', () => { if (confirm('Delete this note?')) store.remove('notes', b.getAttribute('data-delnote')); }));
      loadPhotos(root);
    }
  };
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
    onDelete: d ? () => store.remove('dates', d.id) : null
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
    onDelete: m ? () => store.remove('people', m.id) : null
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
    onDelete: () => store.remove('access', a.id)
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
  </div>`, (s) => {
    const msg = s.querySelector('#msg');
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
        <div class="grid2">${fieldHtml({ name: 'client', label: 'Client', placeholder: 'Buyer name' }, plan.client)}${fieldHtml({ name: 'date', label: 'Date', type: 'date' }, plan.date)}</div>
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
            <span class="grow"><span class="t">${l.address}${l.occ === 'O' ? html` <span class="occ O" style="font-size:16px" title="Owner-occupied">O</span>` : ''}</span>
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
  const p = l.property_id ? prop(l.property_id) : null;
  const code = p ? codesOf(p.id).find((a) => a.code) : null;
  const box = p ? store.where('access', 'property_id', p.id).find((a) => a.kind === 'lockbox') : null;
  const person = p ? store.where('people', 'property_id', p.id).find((m) => m.phone) : null;
  return {
    id: store.uid(), property_id: l.property_id || null, address: l.address, lat: l.lat ?? null, lng: l.lng ?? null,
    at: l.at ?? null, arrive: l.arrive ?? null, approximate: !!l.approximate, leg_miles: Math.round((l.legMiles || 0) * 10) / 10, leg_minutes: l.legMinutes || 0,
    occ: p?.occupancy || '', well: !!p?.well, septic: !!p?.septic,
    code_label: code ? code.label || KINDS[code.kind]?.label : '', code: code ? code.code : '', code_pending: false,
    access_note: [box && `${box.label}: ${box.location_note || ''}`, p?.showing_notes].filter(Boolean).join(' · '),
    // On our own listing the contact is the seller or tenant, not a listing agent.
    agent: person ? [person.name, person.role && `(${person.role})`].filter(Boolean).join(' ') : '', agent_phone: person ? person.phone : '', confirmed: false, shown: false, notes: ''
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
      <div class="card list">${list.length ? list.map((t) => html`<a class="row" href="#/tour/${t.id}"><span class="grow"><span class="t">${t.name}</span><span class="s">${niceDate(t.date)} · ${(t.stops || []).length} stops${t.finished ? ' · done' : ''}</span></span>${icon('chev', 18)}</a>`) : html`<div class="empty">No tours yet.</div>`}</div>
    </main>`
  };
}

function viewTour(id) {
  const t = store.get('tours', id);
  if (!t) return notFound();
  const stops = t.stops || [];
  const phones = [...new Set(stops.map((s) => s.agent_phone).filter(Boolean))];
  const save = (patch) => store.save('tours', { id, ...patch });
  const setStop = (sid, patch) => save({ stops: stops.map((s) => (s.id === sid ? { ...s, ...patch } : s)) });
  // Occupancy in words: a bare "?" meant nothing to anyone (Cowork, 2026-10-23).
  const occ = (o) => (o === 'O' ? html`<span class="occ O">O</span><span class="occ-word">Occupied</span>` : o === 'V' ? html`<span class="occ V">V</span><span class="occ-word">Vacant</span>` : '');
  return {
    html: html`${header({
      back: '#/tours', kicker: 'Tour mode', title: t.name,
      sub: `${niceDate(t.date)}${t.start_minutes != null ? ' · starts ' + formatClock(t.start_minutes) : ''} · ${stops.length} stops · about ${t.miles || 0} mi`,
      extra: html`<div class="btns"><button class="btn" type="button" id="late" style="background:transparent;color:#fff;border-color:var(--teal-on-dark)">Running late</button><a class="btn teal" href="${mapsUrl(t.start_lat != null ? { address: t.start_place, lat: t.start_lat, lng: t.start_lng } : null, stops)}" target="_blank" rel="noopener">Route in Maps</a></div>`
    })}
    <main class="wrap">
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
        ${s.code || s.code_pending ? html`<div class="access-box"><span class="code-pill"><span class="k">${(s.code_label || 'Code').toUpperCase()}</span><span class="v">${s.code || 'Coming'}</span></span>${s.access_note ? html`<span>${s.access_note}</span>` : ''}</div>`
          : s.access_note ? html`<div class="card pad small" style="background:var(--bg)">${s.access_note}</div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="min-width:0"><div style="font-weight:600">${s.agent || 'Listing agent'}</div><div class="small ${s.confirmed ? 'ok' : 'wait'}">${s.confirmed ? '✓ Confirmed' : '☐ Not confirmed yet'}</div></div>
          <div style="display:flex;gap:6px">${s.agent_phone ? html`<a class="icon-btn" href="tel:${digits(s.agent_phone)}" aria-label="Call">${icon('phone', 18)}</a><a class="icon-btn" href="${smsLink(s.agent_phone)}" aria-label="Text">${icon('text', 18)}</a>` : ''}</div>
        </div>
        ${s.notes ? html`<div class="small" style="border-top:1px solid var(--line-soft);padding-top:8px"><b>Notes:</b> ${s.notes}</div>` : ''}
        <div class="btns">
          <a class="btn" href="${mapLink(s)}" target="_blank" rel="noopener">Navigate</a>
          <button class="btn ${s.shown ? 'green' : 'dark'}" type="button" data-shown="${s.id}">${s.shown ? '✓ Shown' : 'Mark shown'}</button>
        </div>
        <div class="btns"><button class="btn ghost" type="button" data-editstop="${s.id}">${icon('edit', 16)}Edit stop</button><button class="btn ghost" type="button" data-confirm="${s.id}">${s.confirmed ? 'Undo confirmed' : 'Mark confirmed'}</button></div>
      </div>
      ${i < stops.length - 1 && stops[i + 1].leg_miles ? html`<div class="leg">↓ about ${stops[i + 1].leg_minutes} min · ${stops[i + 1].leg_miles} mi</div>` : ''}`)}
      ${t.finished ? html`<div class="note-box">Tour finished. ${t.trip_id ? 'The miles are in your mileage log.' : ''}</div>` : html`<button class="btn dark big block" type="button" id="finish">Finish tour and log the miles</button>`}
      <button class="btn ghost block" type="button" id="deltour">${icon('trash', 16)}Delete this tour</button>
    </main>`,
    mount(root) {
      root.querySelectorAll('[data-shown]').forEach((b) => b.addEventListener('click', () => {
        const s = stops.find((x) => x.id === b.getAttribute('data-shown'));
        setStop(s.id, { shown: !s.shown });
        if (!s.shown) setTimeout(() => feedbackPrompt(s), 300);
      }));
      root.querySelectorAll('[data-confirm]').forEach((b) => b.addEventListener('click', () => {
        const s = stops.find((x) => x.id === b.getAttribute('data-confirm'));
        setStop(s.id, { confirmed: !s.confirmed });
      }));
      root.querySelectorAll('[data-editstop]').forEach((b) => b.addEventListener('click', () => {
        const s = stops.find((x) => x.id === b.getAttribute('data-editstop'));
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
            toast(trip ? 'Tour done. Miles logged.' : 'Tour done');
          }
        });
      });
      root.querySelector('#deltour').addEventListener('click', () => { if (confirm('Delete this tour?')) { store.remove('tours', id); location.hash = '#/tours'; } });
    }
  };
}

// After a showing: twenty seconds of "how did it go", filed to the property.
function feedbackPrompt(s) {
  formSheet({
    title: 'How did it go?',
    fields: [{ name: 'text', label: s.address, type: 'textarea', placeholder: 'Loved the yard, kitchen too small', mic: true }],
    saveLabel: 'Save feedback',
    onSave(v) {
      if (!v.text) return;
      if (s.property_id) store.save('notes', { property_id: s.property_id, text: `Showing feedback: ${v.text}` });
      const tour = store.all('tours').find((t) => (t.stops || []).some((x) => x.id === s.id));
      if (tour) store.save('tours', { id: tour.id, stops: tour.stops.map((x) => (x.id === s.id ? { ...x, notes: [x.notes, v.text].filter(Boolean).join(' · ') } : x)) });
    }
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
          onDelete: () => store.remove('expenses', e.id)
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
    onDelete: t ? () => store.remove('trips', t.id) : null
  });
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
  const serverOn = store.cloud.enabled && store.cloud.user;
  if (c) {
    const left = Math.max(0, Math.round((new Date(c.due_at) - Date.now()) / 1000));
    const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
    return {
      html: html`${header({ back: '#/', kicker: 'Safety check-in', title: 'Check-in is on' })}
      <main class="wrap">
        <div class="card pad sec" style="align-items:center">
          <div class="label">I'll check on you in</div>
          <div class="timer" id="timer">${mm}:${ss}</div>
          <div class="small" style="text-align:center">${c.place || 'Showing'} · ${c.contact_name || 'your contact'} is on standby</div>
        </div>
        <button class="btn green big block" type="button" id="ok">I'm OK · end check-in</button>
        <button class="btn block" type="button" id="extend">Add 15 minutes</button>
        <button class="btn red big block" type="button" id="help">Send help now</button>
        <div class="${serverOn ? 'note-box' : 'warn-box'}">${serverOn ? html`<b>Automatic alert is on.</b> If the timer runs out and you don't answer, ${c.contact_name || 'your contact'} gets a text from Brokers Bestie with where you are and who you're with, even if your phone is off.` : html`<b>Phone-only mode.</b> If the timer runs out, this phone will buzz and open a text to ${c.contact_name || 'your contact'} for you to send. Turn on team mode for alerts that go out on their own.`}</div>
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
      ${!serverOn ? html`<div class="warn-box"><b>Phone-only mode:</b> when time is up this phone buzzes and opens the text for you. Automatic alerts need team mode (Settings).</div>` : ''}
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

async function serverCheckin(op, row) {
  if (!(store.cloud.enabled && store.cloud.user)) return;
  try { await store.syncNow(); await api('/api/checkin', { method: 'POST', body: JSON.stringify({ op, id: row.id, due_at: row.due_at }) }); }
  catch (e) { toast('Could not reach the server; the phone timer is still on'); }
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

function viewSettings() {
  const s = store.settings();
  const c = store.cloud;
  return {
    form: true, // typed links and keys must not be wiped by a sync repaint
    html: html`${header({ back: '#/', kicker: 'Settings', title: 'Brokers Bestie' })}
    <main class="wrap">
      <section class="card pad sec">
        <div class="label accent">Team mode</div>
        ${!c.enabled ? html`<div>Everything is saved on this phone only. Team mode (sign-in, sharing with your team, automatic safety alerts) turns on once the server is set up.</div>`
          : !c.user ? html`<div>Sign in to save to your team and use it on every phone.</div>
            <label class="field"><span>Email</span><input id="email" type="email" autocomplete="email" placeholder="you@brokerage.com"></label>
            <label class="field"><span>Invite code from your team (if you have one)</span><input id="precode" autocomplete="off" autocapitalize="characters" placeholder="ABC123" value="${s.pendingInvite || ''}"></label>
            <button class="btn dark block" type="button" id="signin">Email me a sign-in link</button>
            <div class="hint">With a code, you join that team as soon as you sign in.</div>`
          : html`<div>Signed in as <b>${c.user.email}</b>. ${c.status === 'synced' ? 'Everything is saved to your team.' : c.status === 'error' ? 'Last save did not go through; it will retry.' : ''}</div>
            <div class="btns"><button class="btn" type="button" id="syncnow">Save now</button><button class="btn" type="button" id="invite">Invite a teammate</button></div>
            <label class="field"><span>Join a team with a code</span><input id="joincode" autocomplete="off" placeholder="ABC123"></label>
            <button class="btn block" type="button" id="join">Join team</button>
            <button class="btn ghost block" type="button" id="signout">Sign out</button>`}
      </section>

      ${c.user ? html`<section class="card pad sec">
        <div class="label accent">Your phone's calendar</div>
        <div class="small">Shows Bestie's appointments, tours and deadlines in the calendar app you already use. It updates by itself (iPhone about every 15 minutes, Google a few times a day).</div>
        <div id="calbox"><button class="btn block" type="button" id="callink">${icon('cal', 18)}Get my calendar link</button></div>
      </section>

      <section class="card pad sec">
        <div class="label accent">Connect your CRM</div>
        <div class="small" id="crmstate">Checking…</div>
        <label class="field"><span>Feed link (from your CRM)</span><input id="crmurl" type="url" autocomplete="off" placeholder="https://yourcrm.com/api/crm/bestie-feed"></label>
        <label class="field"><span>Feed key</span><input id="crmkey" autocomplete="off" spellcheck="false" placeholder="Leave empty to keep the saved key"></label>
        <button class="btn block" type="button" id="crmmake">Make a new key (copies it)</button>
        <div class="hint">Your listings, deal dates, contacts and appointments come in from the CRM and update each time you open Bestie. Codes, photos and notes stay Bestie's: the CRM never changes them.</div>
        <div class="btns"><button class="btn dark" type="button" id="crmsave">Save and sync</button><button class="btn" type="button" id="crmrun">Sync now</button></div>
        <button class="btn ghost block" type="button" id="crmoff" hidden>Disconnect</button>
      </section>` : ''}

      <section class="card pad sec">
        <div class="label">Your first name</div>
        <label class="field"><span>Used for “Mine” and your morning greeting</span><input id="myname" autocomplete="given-name" placeholder="Sara" value="${s.myName ? s.myName[0].toUpperCase() + s.myName.slice(1) : ''}"></label>
        <div class="hint">Use the name your CRM gives you, so your listings and appointments show as yours.</div>
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
        <div class="label">Put it on your home screen</div>
        <div class="small">iPhone: tap Share, then “Add to Home Screen”. Android: tap the ⋮ menu, then “Install app”. It then opens like an app and works with no signal.</div>
      </section>
    </main>`,
    mount(root) {
      root.querySelector('#signin')?.addEventListener('click', async () => {
        const email = root.querySelector('#email').value.trim();
        if (!email) return toast('Type your email');
        const code = root.querySelector('#precode').value.trim().toUpperCase();
        store.saveSettings({ pendingInvite: code });
        try { await store.signIn(email); toast('Check your email for the sign-in link'); } catch (e) { toast(e.message); }
      });
      root.querySelector('#syncnow')?.addEventListener('click', () => store.syncNow());
      root.querySelector('#signout')?.addEventListener('click', () => store.signOut());
      root.querySelector('#invite')?.addEventListener('click', async () => {
        try { const code = await store.inviteCode(); await copy(code); openSheet(html`<div class="sec"><div class="label">Invite code</div><div class="num" style="font-size:44px;text-align:center">${code}</div><div class="small">Copied. Your teammate signs in, then enters this code under Settings → Join a team. It works for 7 days.</div><button class="btn block" type="button" onclick="this.closest('.sheet-back').remove()">Done</button></div>`); } catch (e) { toast(e.message); }
      });
      root.querySelector('#join')?.addEventListener('click', async () => {
        const code = root.querySelector('#joincode').value.trim();
        if (!code) return;
        try { await store.joinTeam(code); toast('You joined the team'); location.reload(); } catch (e) { toast(e.message); }
      });
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
        const show = (r) => {
          st.textContent = r.connected ? `Connected to ${new URL(r.feed_url).host}. ${r.last_result || ''}${r.last_synced_at ? ` (${new Date(r.last_synced_at).toLocaleString()})` : ''}` : 'Not connected.';
          if (r.connected && !root.querySelector('#crmurl').value) root.querySelector('#crmurl').value = r.feed_url;
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
        root.querySelector('#crmsave').addEventListener('click', (e) => call({ op: 'save', url: root.querySelector('#crmurl').value.trim(), key: root.querySelector('#crmkey').value.trim() }, e.currentTarget));
        root.querySelector('#crmrun').addEventListener('click', (e) => call({ op: 'run' }, e.currentTarget));
        root.querySelector('#crmoff').addEventListener('click', (e) => { if (confirm('Stop syncing from this CRM? What already came in stays.')) call({ op: 'disconnect' }, e.currentTarget); });
      }
      root.querySelector('#myname').addEventListener('change', (e) => { store.saveSettings({ myName: firstName(e.target.value) }); toast('Saved'); });
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
  return html`<div class="filters">
    ${whoChips()}
    <div class="chips">${chip(null, 'All')}${COLOR_KINDS.map(([k, l]) => chip(k, l + 's'))}</div>
    ${withProperty ? html`<select class="prop-filter" id="propfilter" aria-label="Show one property"><option value="">All properties</option>${props().slice().sort((a, b) => a.address.localeCompare(b.address)).map((p) => html`<option value="${p.id}" ${viewFilter.property === p.id ? raw('selected') : ''}>${p.address}</option>`)}</select>` : ''}
  </div>`;
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
      { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'With the Smiths. Bring the CMA.' }
    ],
    values: { ...v, minutes: String(v.minutes || 30), property_id: v.property_id || '' },
    extra: e && store.crmLinked(e) ? html`<div class="note-box">On your CRM's calendar too. A change or delete here goes to the CRM at the next sync.</div>` : '',
    onSave(f) {
      if (!f.title && !f.property_id) { toast('Say what it is'); return false; }
      if (!f.date) { toast('Pick the date'); return false; }
      store.save('events', { ...(e ? { id: e.id } : {}), title: f.title || `${kindLabel(f.kind)} · ${addr(f.property_id)}`, kind: f.kind, date: f.date, start_minutes: timeToMinutes(f.time), minutes: Number(f.minutes) || null, property_id: f.property_id || null, location: f.location, notes: f.notes, done: e ? !!e.done : false });
      toast(e ? 'Saved' : `Added to ${dayHeading(f.date).toLowerCase() === 'today' ? 'today' : niceDate(f.date)}`);
    },
    // A CRM appointment is cancelled, not removed: the CRM is told at the next
    // sync and deletes it there too. Bestie-only ones just go.
    onDelete: e ? () => (store.crmLinked(e) ? store.save('events', { id: e.id, cancelled: true }) : store.remove('events', e.id)) : null
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
    <div class="sec-head"><div><div class="label accent">${hello}</div><div class="brief-date">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div></div>
      <button class="btn" type="button" id="readbrief" style="min-height:40px;white-space:nowrap">${icon('speak', 18)}Read it to me</button></div>
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
  if (button) { button.textContent = 'Stop reading'; say.onend = say.onerror = () => { button.innerHTML = str(html`${icon('speak', 18)}Read it to me`); }; }
  speechSynthesis.speak(say);
}

// ---------- CRM sync from the phone ----------

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
      </div>` : ''}
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
        hubFor = to; hubTab = 'overview';
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
  [/^#\/miles(?:\/(add))?$/, (m) => viewMiles(m[1]), 'today'],
  [/^#\/safety$/, () => viewSafety(), 'today'],
  [/^#\/settings$/, () => viewSettings(), 'today']
];

let current = null;
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
  if (view.mount) view.mount($view);
  $nav.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
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
render();
store.startCloud();
setInterval(watchCheckin, 20000);
watchCheckin();
locationAllowed().then(async (yes) => {
  if (!yes) return;
  here = nearest(await locate({ quiet: true }));
  if (here && (location.hash === '' || location.hash === '#/')) render();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
