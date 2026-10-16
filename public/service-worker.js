const CACHE_NAME = 'mylinks-offline-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.add(OFFLINE_URL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('mylinks-offline-') && key !== CACHE_NAME).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]))
})

self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  event.respondWith(fetch(event.request).catch(async () => {
    const cache = await caches.open(CACHE_NAME)
    return await cache.match(OFFLINE_URL) || Response.error()
  }))
})
