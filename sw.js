// Dinamo Blackjack PWA Service Worker
const CACHE_NAME = 'dinamo-blackjack-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests, pass through WebSocket and API requests cleanly
    if (event.request.method !== 'GET' || event.request.url.includes('/ws') || event.request.url.includes('/api/')) {
        return;
    }
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
