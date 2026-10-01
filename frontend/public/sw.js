/* MedRec service worker: offline-first app shell, network-first API.
   Static assets (JS/CSS/icon) work offline after first visit; API calls
   always hit the network so records are never stale. Versioned cache —
   bump V to force-refresh clients. */
const V = 'medrec-v1';
const SHELL = ['/', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API + auth: never cache.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/avatars/')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(
      (hit) => hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(V).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('/'))
    )
  );
});
