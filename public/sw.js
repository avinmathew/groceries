const BASE_PATH = '/groceries';
const CACHE_VERSION = 'v6';
const CACHE_NAME = `mygroceries-${CACHE_VERSION}`;
const RUNTIME_CACHE = `mygroceries-runtime-${CACHE_VERSION}`;

const OFFLINE_URL = `${BASE_PATH}/offline`;
const urlsToCache = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/icon-192x192.svg`,
  `${BASE_PATH}/icon-512x512.svg`,
  OFFLINE_URL,
];

async function cacheFirst(request, cacheName, matchOptions) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, matchOptions);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function navigationNetworkFirst(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const offlinePage = await caches.match(OFFLINE_URL);
    if (offlinePage) return offlinePage;

    return new Response(
      '<html><body><h1>Offline</h1><p>Please check your connection and try again.</p></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

function isApiPath(pathname) {
  return pathname.startsWith(`${BASE_PATH}/api/`);
}

function isStoreIconPath(pathname) {
  return pathname.includes('/store_icons/');
}

// Install event - cache core shell resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(urlsToCache);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Let the browser handle cross-origin requests.
  if (url.origin !== self.location.origin) {
    return;
  }

  // API routes
  if (isApiPath(url.pathname)) {
    if (request.method === 'GET') {
      event.respondWith(networkFirst(request, RUNTIME_CACHE));
      return;
    }

    // Mutations - network only, with an offline-friendly error payload.
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline - mutation queued' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Navigation (HTML) - network first; do not cache arbitrary pages to avoid stale soft-refresh.
  if (request.mode === 'navigate') {
    event.respondWith(navigationNetworkFirst(request));
    return;
  }

  // Images - cache first (ignore query params)
  if (request.destination === 'image' || isStoreIconPath(url.pathname)) {
    event.respondWith(cacheFirst(request, CACHE_NAME, { ignoreSearch: true }));
    return;
  }

  // Other GET assets (scripts, styles, fonts, etc.) - cache first
  if (request.method === 'GET') {
    event.respondWith(cacheFirst(request, CACHE_NAME));
  }
});

// Background Sync for queued mutations
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-mutations') {
    event.waitUntil(syncMutations());
  }
});

async function syncMutations() {
  // The client-side sync provider handles the actual sync
  // This just notifies clients to trigger their sync
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_REQUESTED' });
  });
}

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Claim clients immediately
  return self.clients.claim();
});