const CACHE_NAME = 'mygroceries-v4';
const RUNTIME_CACHE = 'mygroceries-runtime-v4';
const urlsToCache = [
  '/groceries/',
  '/groceries/manifest.json',
  '/groceries/icon-192x192.svg',
  '/groceries/icon-512x512.svg',
  '/groceries/offline'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
    })
  );
  // Activate worker immediately
  self.skipWaiting();
});

// Fetch event - stale-while-revalidate for API, cache first for assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // API GET routes - stale-while-revalidate
  if (url.pathname.startsWith('/groceries/api/') && event.request.method === 'GET') {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cachedResponse); // Return cached if network fails
          
          // Return cached immediately, update in background
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }
  
  // API mutation routes (POST/PATCH/PUT/DELETE) - network only
  if (url.pathname.startsWith('/groceries/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Offline - mutation queued' }),
          { 
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      })
    );
    return;
  }
  
  // Static assets and pages - cache first with network fallback
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        
        return fetch(event.request)
          .then((response) => {
            // Cache successful responses
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return response;
          })
          .catch((error) => {
            console.error('Fetch failed for', event.request.url, error);
            // Fallback to offline page for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/groceries/offline').then((offlinePage) => {
                if (offlinePage) {
                  return offlinePage;
                }
                // If offline page not cached, return a basic HTML response
                return new Response(
                  '<html><body><h1>Offline</h1><p>Please check your connection and try again.</p></body></html>',
                  { headers: { 'Content-Type': 'text/html' } }
                );
              });
            }
            // For other requests, throw error to let browser handle it
            throw error;
          });
      })
  );
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