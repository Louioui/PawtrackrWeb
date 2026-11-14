// ============================================================================
// PAWTRACKR WEB — DEMO APP SHELL CACHE
// API and client-specific responses must never enter this cache.
// ============================================================================

const CACHE_NAME = 'pawtrackr-offline-v4';
const PRECACHE_ROUTES = [
  '/',
  '/privacy',
  '/dashboard',
  '/dashboard/fleet',
  '/dashboard/payroll',
  '/dashboard/settings',
  '/dashboard/retention',
  '/dashboard/import',
  '/dashboard/analytics',
  '/manifest.json',
  '/icon.svg',
];

async function precacheDemoShell() {
  const cache = await caches.open(CACHE_NAME);
  const assets = new Set();
  await Promise.all(PRECACHE_ROUTES.map(async (route) => {
    const response = await fetch(route, { cache: 'no-store' });
    if (!response.ok || /no-store|private/i.test(response.headers.get('Cache-Control') || '')) {
      throw new Error(`Demo shell route cannot be cached: ${route}`);
    }
    await cache.put(route, response.clone());
    if (response.headers.get('Content-Type')?.includes('text/html')) {
      const html = await response.text();
      for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^\"]+)"/g)) {
        assets.add(match[1].replaceAll('&amp;', '&'));
      }
    }
  }));
  await Promise.all([...assets].map(async (asset) => {
    const response = await fetch(asset);
    if (!response.ok) throw new Error(`Demo shell asset cannot be cached: ${asset}`);
    await cache.put(asset, response);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheDemoShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('pawtrackr-offline-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  const appShellPage = request.mode === 'navigate' && PRECACHE_ROUTES.includes(url.pathname);
  const staticAsset = url.pathname.startsWith('/_next/static/') || url.pathname === '/manifest.json';
  if (!appShellPage && !staticAsset) return;

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (staticAsset && networkResponse.ok && networkResponse.type === 'basic' &&
            !/no-store|private/i.test(networkResponse.headers.get('Cache-Control') || '')) {
          const clone = networkResponse.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)));
        }
        return networkResponse;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (appShellPage ? await cache.match(url.pathname) : await cache.match(request)) || Response.error();
      })
  );
});
