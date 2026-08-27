// sw.js - Service Worker for offline caching of static assets, map tiles, and 3D models

const CACHE_NAME = 'freightiq-cache-v1';
// List of core assets to pre-cache during install (adjust paths if needed)
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/src/main.jsx',
  '/src/index.css',
  // Add any other static assets like fonts, icons, etc.
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

function isCacheableAsset(request) {
  const url = request.url;
  return /\/(tiles|tile)\/.+\.(png|jpg|jpeg|pbf|json)$/i.test(url) || /\.(glb|gltf|json|png|jpg|jpeg)$/i.test(url);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  if (isCacheableAsset(request)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return networkResponse;
        }).catch(() => new Response(''));
      })
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, networkResponse.clone());
        });
        return networkResponse;
      }).catch(() => cached || new Response(''));
      return cached || fetchPromise;
    })
  );
});
