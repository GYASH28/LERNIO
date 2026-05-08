/* Lernio AI - Service Worker
   Strategy:
   - Network-first for /api/* (always fresh, fall back to nothing if offline)
   - Cache-first for static assets (HTML, CSS, JS, images, data)
   - Bumping CACHE_VERSION invalidates all old caches.
*/
const CACHE_VERSION = 'lernio-v2-2026-01';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/design-system.css',
    '/css/layout.css',
    '/css/components.css',
    '/css/dashboard.css',
    '/css/notes.css',
    '/css/quiz.css',
    '/css/analytics.css',
    '/css/ai.css',
    '/css/auth.css',
    '/css/interactions.css',
    '/css/upload-notes.css',
    '/css/semester.css',
    '/js/utils.js',
    '/js/store.js',
    '/js/subjects.js',
    '/js/firebase-config.js',
    '/js/auth.js',
    '/js/dashboard.js',
    '/js/quiz.js',
    '/js/ai.js',
    '/js/analytics.js',
    '/js/app.js',
    '/assets/logo.png'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(STATIC_CACHE).then(cache =>
            // Cache one-by-one so a single failure does not abort install
            Promise.all(
                STATIC_ASSETS.map(asset =>
                    cache.add(asset).catch(err => console.warn('SW pre-cache skipped:', asset, err.message))
                )
            )
        )
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(names =>
            Promise.all(
                names
                    .filter(name => name !== STATIC_CACHE && name !== RUNTIME_CACHE)
                    .map(name => caches.delete(name))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Same-origin only
    if (url.origin !== self.location.origin) return;

    // Never cache API calls — always network.
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(() =>
                new Response(JSON.stringify({ error: 'You are offline. Please reconnect to use this feature.' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                })
            )
        );
        return;
    }

    // Navigation: network-first, fall back to cached index.html.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    const copy = response.clone();
                    caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
                    return response;
                })
                .catch(() => caches.match('/index.html'))
        );
        return;
    }

    // Static: cache-first, then update in background.
    event.respondWith(
        caches.match(request).then(cached => {
            const fetchPromise = fetch(request)
                .then(response => {
                    if (response && response.status === 200 && response.type === 'basic') {
                        const copy = response.clone();
                        caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => cached);
            return cached || fetchPromise;
        })
    );
});

self.addEventListener('message', event => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
