// Rendering helpers. Everything the agent typed goes through esc() before it
// reaches innerHTML: an address, a note or a contact name is never markup.

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const RAW = Symbol('raw');
export function raw(s) {
  return { [RAW]: true, s: String(s) };
}

// html`<p>${name}</p>` escapes `name`; nested html`` and raw() pass through.
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += piece(vals[i]);
  });
  return raw(out);
}
function piece(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(piece).join('');
  if (typeof v === 'object' && v[RAW]) return v.s;
  return esc(v);
}
export function str(h) {
  return h && h[RAW] ? h.s : esc(h);
}

export function money(n) {
  if (n == null || n === '' || isNaN(n)) return '';
  const v = Number(n);
  if (v >= 1e6) return `$${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 2).replace(/\.?0+$/, '')}M`;
  if (v >= 1e4) return `$${Math.round(v / 1e3)}K`;
  return `$${v.toLocaleString()}`;
}
export function fullMoney(n) {
  if (n == null || n === '' || isNaN(n)) return '';
  return `$${Number(n).toLocaleString()}`;
}

export function digits(phone) {
  return String(phone || '').replace(/[^\d+]/g, '');
}
export function prettyPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : phone || '';
}
// iOS wants "sms:+1209...&body=", Android "sms:+1209...?body=". Both accept "?".
export function smsLink(phones, body) {
  const to = [].concat(phones).filter(Boolean).map(digits).join(',');
  return `sms:${to}${body ? `?&body=${encodeURIComponent(body)}` : ''}`;
}
export function mapLink(p) {
  const q = p.lat != null ? `${p.lat},${p.lng}` : [p.address, p.city].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}

export function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function daysFrom(iso) {
  if (!iso) return null;
  const a = new Date(todayIso() + 'T00:00:00');
  const b = new Date(iso + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}
export function niceDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export function whenText(iso) {
  const n = daysFrom(iso);
  if (n == null) return '';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n < 0) return `${-n} days ago`;
  if (n < 7) return `In ${n} days`;
  return niceDate(iso);
}

let toastTimer;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

// A toast with an Undo button (2026-10-27): for deletes and one-tap changes.
// Stays 6 seconds; Undo runs `undo` once and says so.
export function undoToast(msg, undo, ms = 6000) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg + ' ';
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'toast-undo';
  b.textContent = 'Undo';
  b.addEventListener('click', () => { clearTimeout(toastTimer); undo(); toast('Undone'); }, { once: true });
  el.appendChild(b);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Stroke icons, one definition each.
const P = {
  home: 'M3 11l9-7 9 7v9H3z',
  list: 'M4 3h16v18H4zM8 8h8M8 12h8M8 16h5',
  route: 'M5 19c4 0 4-6 7-6s3 6 7 6M5 17a2 2 0 110 4 2 2 0 010-4zM19 3a2 2 0 110 4 2 2 0 010-4zM19 7v4',
  sign: 'M6 21V4h12l-3 4 3 4H6',
  plus: 'M12 3a9 9 0 110 18 9 9 0 010-18zM12 8v8M8 12h8',
  lockbox: 'M7 11V8a5 5 0 0110 0v3M5 11h14v10H5zM12 15v2',
  gate: 'M4 21V6M20 21V6M4 9h16M4 15h16M9 9v6M14 9v6',
  alarm: 'M5 4h14v16H5zM9 8h.01M12 8h.01M15 8h.01M9 12h.01M12 12h.01M15 12h.01M9 16h6',
  door: 'M6 3h12v18H6zM14 12h.01',
  key: 'M14 7a4 4 0 11-3.9 4.9L4 18v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0114 7z',
  photo: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 110 7 3.5 3.5 0 010-7',
  mic: 'M9 3h6v11H9zM5 11a7 7 0 0014 0M12 18v3',
  water: 'M12 3s6 7 6 11a6 6 0 01-12 0c0-4 6-11 6-11z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  person: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  chat: 'M4 5h16v11H8l-4 4zM8 10h8',
  miles: 'M4 19l4-14h8l4 14M12 7v2M12 12v2M12 17v2',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2',
  text: 'M4 5h16v11H8l-4 4z',
  pin: 'M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12zM12 6.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  back: 'M15 6l-6 6 6 6',
  chev: 'M9 6l6 6-6 6',
  search: 'M11 4a7 7 0 110 14 7 7 0 010-14zM20 20l-3.5-3.5',
  gear: 'M12 9a3 3 0 110 6 3 3 0 010-6zM19 12l2-1-1-3-2 .2-1.2-1.6.6-2-2.6-1.6-1.4 1.5h-2L9 2l-2.6 1.6.6 2L5.8 7.2 4 7 3 10l2 1v2l-2 1 1 3 2-.2 1.2 1.6-.6 2L9 22l1.4-1.5h2L14 22l2.6-1.6-.6-2 1.2-1.6 2 .2 1-3-2-1z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  check: 'M5 12l5 5 9-10',
  grip: 'M5 8h14M5 12h14M5 16h14',
  filter: 'M4 5h16l-6 7v6l-4 2v-8z',
  sheet: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7',
  cal: 'M4 6h16v15H4zM4 10h16M8 3v5M16 3v5',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3 2',
  speak: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11'
};
export function icon(name, size = 22, extra = '') {
  return raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}><path d="${P[name] || P.plus}"></path></svg>`);
}
