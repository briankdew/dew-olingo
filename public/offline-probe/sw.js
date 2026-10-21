// TEMPORARY offline probe service worker. Delete with public/offline-probe/.
// Scope is capped by this file's location (/dew-olingo/offline-probe/); it only
// answers requests for the probe's own files, never the real app.
const BUILD_ID = 'v1' // keep in sync with index.html; bump to refresh the cache
const CACHE = `offline-probe-${BUILD_ID}`
const BASE = new URL('./', self.location).pathname
const FILES = [BASE, `${BASE}index.html`, `${BASE}manifest.webmanifest`]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(FILES.map((path) => cache.add(new Request(path, { cache: 'reload' }))))) // bypass the HTTP cache
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('offline-probe-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !FILES.includes(url.pathname)) return // not ours: leave it to the network

  event.respondWith(
    caches.match(url.pathname).then((hit) => {
      if (!hit) return fetch(request)
      const headers = new Headers(hit.headers)
      headers.set('x-probe-source', 'cache')
      return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers })
    }),
  )
})
