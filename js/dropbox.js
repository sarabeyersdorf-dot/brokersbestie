// "From Dropbox" on the MLS sheet screen (Sara, 2026-10-24). Uses Dropbox's own
// Chooser: the agent signs in to THEIR Dropbox in Dropbox's window, picks a
// PDF or photo, and Bestie gets a short-lived direct link to download it. We
// never see their Dropbox password or keep a token. Needs one public app key
// (DROPBOX_APP_KEY in config.js); without it the button explains the Files
// route, which works with no setup at all.
import { DROPBOX_APP_KEY } from './config.js';

const TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp' };
export const typeFromName = (name) => TYPES[(String(name).split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
export const dropboxReady = () => !!DROPBOX_APP_KEY;

let loading = null;
function loadChooser() {
  if (window.Dropbox && window.Dropbox.choose) return Promise.resolve(window.Dropbox);
  if (loading) return loading;
  loading = new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = 'https://www.dropbox.com/static/api/2/dropins.js';
    s.id = 'dropboxjs';
    s.setAttribute('data-app-key', DROPBOX_APP_KEY);
    s.onload = () => (window.Dropbox ? ok(window.Dropbox) : fail(new Error('Dropbox did not load')));
    s.onerror = () => { loading = null; fail(new Error('Could not reach Dropbox. Check your signal.')); };
    document.head.appendChild(s);
  });
  return loading;
}

// Resolves with File objects (empty if they cancel).
// { images: true } limits it to pictures, { multi: false } to one (a logo).
export async function chooseFromDropbox({ images = false, multi = true } = {}) {
  const Dbx = await loadChooser();
  const picked = await new Promise((ok) => Dbx.choose({
    linkType: 'direct', multiselect: multi, extensions: images ? ['images'] : ['.pdf', 'images'],
    success: (files) => ok(files || []), cancel: () => ok([])
  }));
  const out = [];
  for (const f of picked) {
    const res = await fetch(f.link);
    if (!res.ok) throw new Error(`Could not download ${f.name} from Dropbox`);
    const blob = await res.blob();
    out.push(new File([blob], f.name, { type: blob.type && blob.type !== 'application/octet-stream' ? blob.type : typeFromName(f.name) }));
  }
  return out;
}
