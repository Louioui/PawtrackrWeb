// ============================================================================
// PAWTRACKR WEB — OFFLINE-FIRST SERVICE WORKER FOR SALONS & MOBILE VANS
// Ensures Android, Windows, iOS, macOS, and ChromeOS devices retain access to
// the Command Center, Pet Safety Auras, and POS Queue in low-signal driveways.
// ============================================================================

const CACHE_NAME = 'pawtrackr-offline-v1';
const PRECACHE_ROUTES = [
  '/',
  '/dashboard',
  '/dashboard/fleet',
  '/dashboard/payroll',
  '/dashboard/settings',
  '/dashboard/retention',
  '/dashboard/import',
  '/dashboard/analytics',
  '/login',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ROUTES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
