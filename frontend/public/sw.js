// Dev-safe service worker: never cache app shells / JS / API in a way that
// fights Vite HMR. Only cache map tiles and static media.
const CACHE_NAME = 'freightiq-cache-v2'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  )
})

function isTileOrMedia(url) {
  return (
    /\/(tiles?|styles?)\//i.test(url) ||
    /\.(pbf|glb|gltf|woff2?)$/i.test(url) ||
    /basemaps\.cartocdn\.com|tile\.openstreetmap|demotiles\.maplibre|tiles\.openfreemap\.org/i.test(url)
  )
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  // Never intercept Vite / app / API traffic — that causes freezes & stale bundles
  const url = request.url
  if (
    url.includes('/api/') ||
    url.includes('/@vite') ||
    url.includes('/node_modules/') ||
    url.includes('/src/') ||
    url.includes('localhost:517') ||
    url.includes('127.0.0.1:517')
  ) {
    return
  }

  if (!isTileOrMedia(url)) return

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) return cached
      try {
        const networkResponse = await fetch(request)
        if (networkResponse.ok) cache.put(request, networkResponse.clone())
        return networkResponse
      } catch {
        return cached || new Response('', { status: 504 })
      }
    })
  )
})
