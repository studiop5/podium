// Podium Service Worker
// Enables offline functionality and PWA installation

const CACHE_NAME = 'podium-v2.1.0-b'; // TEMP: replace with real podium-vX.X.X before deploying
const urlsToCache = [
  './podium.html',
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Podium: Cache opened');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Podium: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Only handle GET requests — never intercept POST/PUT/etc. (e.g. OAuth token exchanges)
  if (event.request.method !== 'GET') return;

  // Never cache the manifest - always fetch fresh
  if (event.request.url.endsWith('manifest.json') || event.request.url.endsWith('manifest.webmanifest')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response from cache
        if (response) {
          return response;
        }
        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          // Only cache same-origin requests (not external PDFs), and never a
          // request carrying a query string (e.g. the "?t=" cache-buster the
          // in-app restart button appends): caching those would accumulate a
          // new, never-reused entry in Cache Storage on every restart. Skipping
          // them keeps the canonical (no-query) entry set only at install time,
          // so it stays pinned until a real service worker update ships.
          if (event.request.url.startsWith(self.location.origin) && !new URL(event.request.url).search) {
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
          }

          return response;
        });
      })
  );
});
