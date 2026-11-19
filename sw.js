// Minimal Service Worker for PWA installability and offline support
const CACHE_NAME = 'voice-app-v4.9';
const ASSETS = [
  './',
  './index.html',
  './voice_pt.html',
  './voice_g.html',
  './manifest.json',
  './manifest_pt.json',
  './manifest_g.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.ico',
  './favicon-32x32.png',
  './favicon-16x16.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ignore non-GET requests (e.g. POST sync to Google Apps Script)
  if (event.request.method !== 'GET') return;

  // Ignore cross-origin API requests (e.g. script.google.com) so live data is never stale-cached
  const reqUrl = new URL(event.request.url);
  if (reqUrl.origin !== self.location.origin) return;

  // Network first with cache fallback for local static assets
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const resClone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(event.request, resClone))
            .catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
