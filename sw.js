// Offline: the app's own files are cached on install, so it opens with no
// signal. Data lives in localStorage/IndexedDB, not here. /api is never cached.
// Bump VERSION whenever an app file changes, or phones keep the old copy.
const VERSION = 'bb-v45';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/store.js', './js/ui.js', './js/route.js', './js/parse.js', './js/assist.js', './js/brief.js', './js/faces.js', './js/install.js', './js/dropbox.js', './js/crmlist.js', './js/messages.js', './js/sample.js', './js/config.js', './js/push.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  const ownFile = url.origin === location.origin;
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!ownFile && !font) return;
  // Network first for our own files (so an update shows up), cache when offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});

// Pop-up reminders (2026-10-27): the Supabase `reminders` function sends them.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Brokers Bestie', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Brokers Bestie', {
    body: d.body || '', tag: d.tag || undefined, data: { url: d.url || '#/' },
    icon: './icons/icon-192.png', badge: './icons/favicon-32.png'
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL('./' + (e.notification.data && e.notification.data.url || '#/'), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) { open.navigate(target).catch(() => {}); return open.focus(); }
    return self.clients.openWindow(target);
  }));
});
