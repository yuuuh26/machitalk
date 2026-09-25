const CACHE = 'machitalk-v1.6.0';
const SHELL = ['./', './index.html', './css/app.css?v=1.6.0', './js/app.js?v=1.6.0', './js/scene-engine.js', './js/speech.js', './js/evaluator.js', './js/attempts.js', './js/effects.js', './js/avatar.js', './js/storage.js', './data/scene-registry.json', './data/avatar-registry.json', './assets/avatar/aiko/neutral.webp', './assets/avatar/aiko/speaking.webp', './assets/avatar/aiko/listening.webp', './assets/avatar/aiko/encouraging.webp', './assets/avatar/aiko/pleased.webp', './assets/avatar/aiko/delighted.webp', './assets/avatar/aiko/celebrating.webp', './assets/avatar/aiko/thrilled.webp', './manifest.json', './assets/icons/icon-192.png', './assets/icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('machitalk-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
    return response;
  }).catch(() => caches.match(event.request)));
});
