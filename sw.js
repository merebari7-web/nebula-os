/* Nebula OS service worker — offline-first shell */
const CACHE = 'nebula-os-v12';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/fs.js', 'js/i18n.js', 'js/os.js', 'js/apps.js', 'js/apps-extra.js', 'js/android.js', 'manifest.webmanifest', 'docs/icon-192.png', 'docs/icon-512.png', 'docs/og.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
