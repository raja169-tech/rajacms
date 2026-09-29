// sw.js — Basic Service Worker for PWA installability
// NOTE: Offline caching is NOT required per user requirements,
// but a registered service worker is needed to satisfy PWA install criteria.

const CACHE_NAME = 'cms-pwa-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Do NOT intercept any requests. Let the browser handle all fetches natively.
  // This avoids "Failed to fetch" errors when the SW is registered on a different
  // origin/port than the one being fetched (common in dev with separate frontend/backend).
  // No event.respondWith() call = browser handles the request directly.
  return;
});
