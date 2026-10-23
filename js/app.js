// Brokers Bestie: every screen. Hash routes (#/, #/p/<id>, #/tours …) so the
// back button, bookmarks and a home-screen launch all land where expected.

import * as store from './store.js';
import { html, raw, str, esc, icon, money, fullMoney, digits, prettyPhone, smsLink, mapLink, todayIso, daysFrom, niceDate, whenText, toast, copy } from './ui.js';
import { planRoute, mapsUrl, formatClock, parseClock, haversineMiles, roadMiles, driveMinutes } from './route.js';
import { parseTourText, matchProperty, search, tripsCsv } from './parse.js';
import { sampleData } from './sample.js';

const $view = document.getElementById('view');
const $nav = document.getElementById('nav');

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
function dictate(target, button) {
  if (!Recognition) {
    toast('Use the microphone on your keyboard to dictate');
    target.focus();
    return;
  }
  const r = new Recognition();
  r.lang = 'en-US';
  r.interimResults = true;
  r.continuous = true;
  const before = target.value ? target.value.replace(/\s*$/, ' ') : '';
  let finalText = '';
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
      else interim += e.results[i][0].transcript;
    }
    target.value = before + finalText + interim;
    target.dispatchEvent(new Event('input'));
  };
  const stop = () => { try { r.stop(); } catch {} };
  r.onend = () => { if (button) { button.classList.remove('dark'); button.innerHTML = button.dataset.label; } };
  r.onerror = (e) => { if (e.error === 'not-allowed') toast('Allow the microphone to talk to Bestie'); };
  if (button) {
    button.dataset.label = button.innerHTML;
    button.classList.add('dark');
    button.innerHTML = 'Listening… tap to stop';
    button.onclick = () => { stop(); button.onclick = () => dictate(target, button); };
  }
  r.start();
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
    const r = await api(`/api/geocode?q=${encodeURIComponent(address)}`);
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
    items.push({ table: 'tasks', id: x.id, text: x.text, sub: [addr(x.property_id), x.due && x.due < t ? `Was due ${niceDate(x.due)}` : ''].filter(Boolean).join(' · '), pid: x.property_id });
  }
  for (const d of store.all('dates')) {
    if (d.done) continue;
    const n = daysFrom(d.due);
    if (n == null || n > 7) continue;
    items.push({ table: 'dates', id: d.id, text: `${d.label} · ${addr(d.property_id)}`, sub: n < 0 ? `${-n} days past · confirm it happened` : whenText(d.due), pid: d.property_id, late: n < 0 });
  }
  for (const a of pickups()) {
    items.push({ pickup: true, id: a.id, text: `Pick up ${a.label || KINDS[a.kind].label} at ${addr(a.property_id)}`, sub: `${STATUS[prop(a.property_id)?.status] || ''} · ${a.location_note || ''}` });
  }
  for (const tour of store.all('tours').filter((x) => x.date === t && !x.finished)) {
    for (const s of tour.stops || []) {
      if (s.code_pending) items.push({ tour: tour.id, id: s.id, text: `Get the code for ${s.address}`, sub: s.agent ? `Ask ${s.agent}` : 'Before the tour' });
    }
  }
  return items;
}

function viewToday() {
  const results = searchText ? search(searchText, store.snapshot()) : [];
  const tours = store.all('tours').filter((x) => x.date === todayIso() && !x.finished);
  const live = props().filter((p) => LIVE.includes(p.status)).sort((a, b) => (a.status === 'escrow' ? -1 : 0) - (b.status === 'escrow' ? -1 : 0));
  const todos = todoItems();
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
        <div class="sec-head"><div class="label">To do today · ${todos.length}</div><button class="btn ghost" type="button" id="addtodo" style="min-height:36px">+ Add</button></div>
        <div class="card list">${todos.length ? todos.map((t) => t.pickup ? html`<a class="row" href="#/signs"><span class="check" style="border-color:var(--pending)"></span><span class="grow"><span class="t">${t.text}</span><span class="s">${t.sub}</span></span>${icon('chev', 18)}</a>`
          : t.tour ? html`<a class="row" href="#/tour/${t.tour}"><span class="check" style="border-color:var(--pending)"></span><span class="grow"><span class="t">${t.text}</span><span class="s">${t.sub}</span></span>${icon('chev', 18)}</a>`
          : html`<button class="row" type="button" data-done="${t.table}:${t.id}"><span class="check"></span><span class="grow"><span class="t">${t.text}</span><span class="s ${t.late ? 'wait' : ''}">${t.sub}</span></span></button>`) : html`<div class="empty">Nothing due. Nice.</div>`}</div>
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
        <div class="btns"><a class="btn" href="#/miles">${icon('miles', 18)}Mileage</a><a class="btn" href="#/safety">${icon('shield', 18)}Safety check-in</a></div>
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
      root.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', () => {
        const [table, id] = b.getAttribute('data-done').split(':');
        store.save(table, { id, done: true, done_at: new Date().toISOString() });
        toast('Done');
      }));
    }
  };
}

function propRow(p) {
  const codes = codesOf(p.id).filter((a) => a.code).length;
  return html`<a class="row" href="#/p/${p.id}">
    <span class="grow"><span class="t">${p.address}</span><span class="s">${[p.city, STATUS[p.status], codes ? `${codes} code${codes > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}</span></span>
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
  const list = props().filter(groups[propFilter]).sort((a, b) => a.address.localeCompare(b.address));
  const tab = (k, l) => html`<button class="tab ${propFilter === k ? 'on' : ''}" type="button" data-f="${k}">${l}</button>`;
  return {
    html: html`${header({ kicker: 'Properties', title: `${props().filter(groups.live).length} active`, right: html`<a class="btn teal" href="#/p/new" style="min-height:40px">+ Add</a>` })}
    <main class="wrap">
      <div class="tabs">${tab('live', 'Active')}${tab('escrow', 'In escrow')}${tab('tour', 'Showing')}${tab('done', 'Closed')}</div>
      <div class="card list">${list.length ? list.map(propRow) : html`<div class="empty">Nothing here yet.</div>`}</div>
    </main>`,
    mount(root) {
      root.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { propFilter = b.getAttribute('data-f'); render(); }));
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
        <div class="btns"><button class="btn" type="button" data-mic="newnote">${icon('mic', 18)}Talk</button><button class="btn dark" type="button" id="savenote">Save note</button></div>
        <div class="card list">${notes.length ? notes.map((n) => html`<div class="row" style="align-items:flex-start"><span class="grow"><span class="s">${niceDate(n.created_at)}</span><span style="white-space:pre-line">${n.text}</span></span><button class="icon-btn" type="button" data-delnote="${n.id}" aria-label="Delete note">${icon('trash', 16)}</button></div>`) : html`<div class="empty">No notes yet.</div>`}</div>
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
const plan = { step: 'talk', text: '', stops: [], startText: '10:00', start: null, result: null, busy: false, client: '', date: todayIso() };

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
        ${r.savedMinutes > 2 ? html`<div class="note-box"><b>Saves about ${r.savedMinutes} minutes</b> over the order you said.</div>` : ''}
        ${r.late > 0 ? html`<div class="warn-box">A time an agent gave can't be met in this order. Change the time in Edit the stops, or ask the agent to move it.</div>` : ''}
        ${r.unplaced.length ? html`<div class="warn-box">I couldn't find ${r.unplaced.map((u) => u.address).join(', ')} on the map, so ${r.unplaced.length > 1 ? 'they are' : 'it is'} at the end. Tap <b>Edit the stops</b> to fix ${r.unplaced.length > 1 ? 'them' : 'it'}.</div>` : ''}
        <div class="card list">${r.legs.map((l, i) => html`<div class="row">
          <span class="dot" style="background:var(--ink);width:30px;height:30px;font-family:var(--tall);font-size:15px">${i + 1}</span>
          <span class="grow"><span class="t">${l.address}</span><span class="s">${[l.at != null ? `Set time ${formatClock(l.at)}` : '', l.property_id ? 'Saved property · codes on file' : '', l.lat != null ? (i === 0 ? `${Math.round(l.legMiles * 10) / 10} mi from the start` : `${Math.round(l.legMiles * 10) / 10} mi · ${l.legMinutes} min from the last stop`) : 'Not found on the map'].filter(Boolean).join(' · ')}</span></span>
          <span class="num" style="font-size:18px">${formatClock(l.arrive)}</span></div>`)}</div>
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
        Object.assign(plan, { step: 'talk', text: '', stops: [], result: null });
        render();
      });
      root.querySelector('#savetour')?.addEventListener('click', () => {
        const tour = store.save('tours', {
          name: plan.client ? `${plan.client} · home tour` : 'Home tour',
          date: plan.date || todayIso(),
          start_place: plan.start?.address || 'Start',
          start_lat: plan.start?.lat ?? null, start_lng: plan.start?.lng ?? null,
          start_minutes: parseClock(plan.startText) ?? 600,
          miles: Math.round(plan.result.miles * 10) / 10,
          stops: plan.result.legs.map((l) => tourStop(l))
        });
        Object.assign(plan, { step: 'talk', text: '', stops: [], result: null });
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
    at: l.at ?? null, arrive: l.arrive, leg_miles: Math.round((l.legMiles || 0) * 10) / 10, leg_minutes: l.legMinutes || 0,
    occ: p?.occupancy || '', well: !!p?.well, septic: !!p?.septic,
    code_label: code ? code.label || KINDS[code.kind]?.label : '', code: code ? code.code : '', code_pending: false,
    access_note: [box && `${box.label}: ${box.location_note || ''}`, p?.showing_notes].filter(Boolean).join(' · '),
    // On our own listing the contact is the seller or tenant, not a listing agent.
    agent: person ? [person.name, person.role && `(${person.role})`].filter(Boolean).join(' ') : '', agent_phone: person ? person.phone : '', confirmed: false, shown: false, notes: ''
  };
}

// The geocoder does far better with a state. Agents say "Murphys", not
// "Murphys, CA"; add the agent's state when the address has none.
function withState(address) {
  const st = (store.settings().state || 'CA').trim();
  return /,\s*[A-Z]{2}\b|\b\d{5}\b/.test(address) ? address : `${address}, ${st}`;
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
      const g = await geocode(withState(st.address));
      Object.assign(st, { property_id: p ? p.id : null, lat: g?.lat ?? null, lng: g?.lng ?? null });
    }
    st.tried = true;
  }
  if (!plan.start) {
    const first = plan.stops.find((x) => x.lat != null);
    plan.start = first ? { address: first.address, lat: first.lat, lng: first.lng } : null;
  }
  const stops = plan.stops.map((st) => ({ id: st.id, address: st.address, property_id: st.property_id, lat: st.lat, lng: st.lng, at: st.atText ? parseClock(st.atText.replace(/\s/g, '')) : null }));
  plan.result = planRoute({ start: plan.start, startMinutes, stops });
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
  const occ = (o) => (o === 'O' ? html`<span class="occ O" title="Occupied">O</span>` : o === 'V' ? html`<span class="occ V" title="Vacant">V</span>` : html`<span class="occ q" title="Ask the agent">?</span>`);
  return {
    html: html`${header({
      back: '#/tours', kicker: 'Tour mode', title: t.name,
      sub: `${niceDate(t.date)}${t.start_minutes != null ? ' · starts ' + formatClock(t.start_minutes) : ''} · ${stops.length} stops · about ${t.miles || 0} mi`,
      extra: html`<div class="btns"><button class="btn" type="button" id="late" style="background:transparent;color:#fff;border-color:var(--teal-on-dark)">Running late</button><a class="btn teal" href="${mapsUrl(t.start_lat != null ? { address: t.start_place, lat: t.start_lat, lng: t.start_lng } : null, stops)}" target="_blank" rel="noopener">Route in Maps</a></div>`
    })}
    <main class="wrap">
      ${stops.map((s, i) => html`<div class="card stop ${s.shown ? 'shown' : ''}">
        <div class="stop-head">
          <div class="stop-time"><span class="num">${s.arrive != null ? formatClock(s.arrive).replace(' ', ' ') : '—'}</span>${occ(s.occ)}</div>
          <div class="grow" style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px">
            <div class="label accent">Stop ${i + 1}${s.at != null ? ' · fixed ' + formatClock(s.at) : ''}</div>
            ${s.property_id ? html`<a href="#/p/${s.property_id}" style="color:var(--ink);font-weight:700;font-size:18px">${s.address}</a>` : html`<div style="font-weight:700;font-size:18px">${s.address}</div>`}
            <div class="badges">${s.well ? html`<span class="dot w">W</span>` : ''}${s.septic ? html`<span class="dot s">S</span>` : ''}</div>
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
  return {
    form: true,
    html: html`${header({ back: '#/', kicker: 'Safety check-in', title: 'Meeting someone new?' })}
    <main class="wrap"><form id="sf" class="sec" novalidate>
      ${fieldHtml({ name: 'place', label: 'Where', placeholder: '433 E Highway 4, Murphys' }, n ? n.address : '')}
      <div class="grid2">${fieldHtml({ name: 'meeting_name', label: 'Meeting', placeholder: 'New buyer' })}${fieldHtml({ name: 'meeting_phone', label: 'Their phone', type: 'tel' })}</div>
      <div class="label">Check on me in</div>
      <div class="tabs" id="mins">${[30, 45, 60, 90].map((m) => html`<button class="tab ${m === 45 ? 'on' : ''}" type="button" data-m="${m}">${m} min</button>`)}</div>
      <div class="label" style="margin-top:6px">If I don't answer, text</div>
      <div class="grid2">${fieldHtml({ name: 'contact_name', label: 'Name', placeholder: 'James' }, contact.name)}${fieldHtml({ name: 'contact_phone', label: 'Phone', type: 'tel' }, contact.phone)}</div>
      <div class="hint">They get where you are, who you're meeting and that person's phone number.</div>
      <button class="btn dark big block" type="submit">${icon('shield', 20)}Start check-in</button>
      ${!serverOn ? html`<div class="warn-box"><b>Phone-only mode:</b> when time is up this phone buzzes and opens the text for you. Automatic alerts need team mode (Settings).</div>` : ''}
    </form></main>`,
    mount(root) {
      let minutes = 45;
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
    html: html`${header({ back: '#/', kicker: 'Settings', title: 'Brokers Bestie' })}
    <main class="wrap">
      <section class="card pad sec">
        <div class="label accent">Team mode</div>
        ${!c.enabled ? html`<div>Everything is saved on this phone only. Team mode (sign-in, sharing with your team, automatic safety alerts) turns on once the server is set up.</div>`
          : !c.user ? html`<div>Sign in to save to your team and use it on every phone.</div>
            <label class="field"><span>Email</span><input id="email" type="email" autocomplete="email" placeholder="you@brokerage.com"></label>
            <button class="btn dark block" type="button" id="signin">Email me a sign-in link</button>`
          : html`<div>Signed in as <b>${c.user.email}</b>. ${c.status === 'synced' ? 'Everything is saved to your team.' : c.status === 'error' ? 'Last save did not go through; it will retry.' : ''}</div>
            <div class="btns"><button class="btn" type="button" id="syncnow">Save now</button><button class="btn" type="button" id="invite">Invite a teammate</button></div>
            <label class="field"><span>Join a team with a code</span><input id="joincode" autocomplete="off" placeholder="ABC123"></label>
            <button class="btn block" type="button" id="join">Join team</button>
            <button class="btn ghost block" type="button" id="signout">Sign out</button>`}
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
        try { await store.joinTeam(code); toast('You joined the team'); } catch (e) { toast(e.message); }
      });
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
// ROUTER
// ======================================================================

const ROUTES = [
  [/^#?\/?$/, () => viewToday(), 'today'],
  [/^#\/props$/, () => viewProps(), 'props'],
  [/^#\/p\/new$/, () => viewPropEdit(null), 'props'],
  [/^#\/p\/([^/]+)\/edit$/, (m) => viewPropEdit(m[1]), 'props'],
  [/^#\/p\/([^/]+)$/, (m) => viewHub(m[1]), 'props'],
  [/^#\/quick(?:\/([a-z]+))?(?:\/([^/]+))?$/, (m) => viewQuick(m[1], m[2]), 'quick'],
  [/^#\/signs$/, () => viewSigns(), 'signs'],
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
