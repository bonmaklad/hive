/* PWA service worker scoped to /platform */

const CACHE_VERSION = 'platform-v1';
const CORE_ASSETS = [
    '/platform',
    '/platform/chat',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_VERSION);
            await Promise.allSettled(
                CORE_ASSETS.map(async path => {
                    try {
                        await cache.add(path);
                    } catch (_) {}
                })
            );
            await self.skipWaiting();
        })()
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
            await self.clients.claim();
        })()
    );
});

function isNavigationRequest(request) {
    return request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (!request || request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // Never cache API calls.
    if (url.pathname.startsWith('/api/')) return;

    // Only handle within platform scope.
    if (!url.pathname.startsWith('/platform')) return;

    if (isNavigationRequest(request)) {
        event.respondWith(
            (async () => {
                const cache = await caches.open(CACHE_VERSION);
                try {
                    const res = await fetch(request);
                    if (res && res.ok) cache.put(request, res.clone());
                    return res;
                } catch (_) {
                    const cached = await cache.match(request);
                    if (cached) return cached;
                    return (await cache.match('/platform')) || Response.error();
                }
            })()
        );
        return;
    }

    event.respondWith(
        (async () => {
            const cache = await caches.open(CACHE_VERSION);
            const cached = await cache.match(request);
            if (cached) return cached;
            const res = await fetch(request);
            if (res && res.ok) cache.put(request, res.clone());
            return res;
        })()
    );
});
