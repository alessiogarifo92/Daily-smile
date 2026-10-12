/* Daily Smile service worker: offline shell + daily push notification. */
// Bump on every change to non-hashed files (icons, manifest, flower sprites) so old copies are dropped.
const CACHE = 'daily-smile-v4';

/** Same-origin build assets (/assets/…) the shell page loads: script, stylesheet, preloads. */
function shellAssets(html) {
  return [...new Set(html.match(/\/assets\/[^"'\s?#]+/g) || [])];
}

self.addEventListener('install', (event) => {
  // The first visit loads the page before this worker controls it, so its hashed assets would never
  // reach the cache and the app would open blank offline. On iPhone a Home Screen app has storage
  // apart from Safari, so its first launch is always such a visit: cache the shell's assets now.
  event.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/apple-touch-icon.png']);
      const shell = await c.match('/');
      const assets = shell ? shellAssets(await shell.text()) : [];
      await c.addAll(assets);
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    // Network first, so a new release shows up; the cached shell keeps the app usable offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }
  // Hashed build assets never change: cache first. ignoreVary: the server may send "Vary: Origin",
  // and a crossorigin module script carries an Origin header the precached copy was stored without.
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Il tuo bouquet di oggi è arrivato';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Apri Daily Smile: c’è un messaggio per te.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'daily-smile',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only ever open a page of this app, whatever the payload says.
  let target = '/';
  try {
    const u = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
    if (u.origin === self.location.origin) target = u.pathname + u.search + u.hash;
  } catch {
    target = '/';
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          // Focus first, while the click still counts as user activation. navigate() is missing on
          // older Safari and rejects for a window this worker doesn't control: neither may stop the focus.
          const focused = w.focus();
          if (typeof w.navigate === 'function') w.navigate(target).catch(() => {});
          return focused;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
