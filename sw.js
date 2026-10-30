const CACHE = 'clearstep-shell-v2';
const FILES = ['./', './index.html', './style.css', './app.js', './engine.js', './questions.json', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('clearstep-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try { return await fetch(event.request); }
    catch (error) {
      if (event.request.mode === 'navigate') return await cache.match('./index.html');
      throw error;
    }
  }));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'VERIFY_CACHE' && event.ports[0]) {
    event.waitUntil(caches.open(CACHE).then(async cache => {
      const entries = await Promise.all(FILES.map(file => cache.match(file)));
      event.ports[0].postMessage({ ready: entries.every(Boolean) });
    }));
  }
});
