importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyARAU5c_8nJd4KcVWsAVBDV529nObmW9Vs",
    authDomain: "mai-sms-a8dad.firebaseapp.com",
    projectId: "mai-sms-a8dad",
    storageBucket: "mai-sms-a8dad.firebasestorage.app",
    messagingSenderId: "550173587112",
    appId: "1:550173587112:web:d4bff4b8796cc8cb00349d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notificationTitle = payload.notification?.title || 'School Notification';
    const notificationOptions = {
        body: payload.notification?.body || '',
        icon: '/favicon.png'
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});

// --- ENTERPRISE OFFLINE APP SHELL & STORAGE CACHES ---
const APP_SHELL_CACHE = 'school-v5-shell-v1';
const STORAGE_CACHE = 'firebase-storage-cache-v1';

const STATIC_PRECACHE_URLS = [
    '/',
    '/index.html',
    '/favicon.png',
    '/favicon.svg',
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;600;700&display=swap'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(APP_SHELL_CACHE).then((cache) => {
            return Promise.allSettled(
                STATIC_PRECACHE_URLS.map((url) =>
                    fetch(url, { mode: 'no-cors' })
                        .then((response) => {
                            if (response) return cache.put(url, response);
                        })
                        .catch((err) => console.warn('[SW] Precache skip:', url, err))
                )
            );
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== APP_SHELL_CACHE && key !== STORAGE_CACHE) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. Only handle GET requests
    if (request.method !== 'GET') return;

    // 2. Navigation requests (HTML page loads / refreshes) -> Network first, fallback to cached index.html
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const copy = networkResponse.clone();
                        caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, copy));
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    const cached = await caches.match(request);
                    if (cached) return cached;
                    const indexCached = await caches.match('/index.html');
                    if (indexCached) return indexCached;
                    return caches.match('/');
                })
        );
        return;
    }

    // 3. Firebase Storage Images
    if (url.hostname.includes('firebasestorage.googleapis.com')) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                const fetchPromise = fetch(request)
                    .then((networkResponse) => {
                        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                            const clone = networkResponse.clone();
                            caches.open(STORAGE_CACHE).then((cache) => cache.put(request, clone));
                        }
                        return networkResponse;
                    })
                    .catch((err) => {
                        console.warn('[SW] Storage fetch offline:', err);
                        return cachedResponse;
                    });
                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // 4. Static JS, CSS, CDN, and local assets (Stale-While-Revalidate / Cache-First)
    const isStaticAsset = (
        url.origin === self.location.origin ||
        url.hostname.includes('cdn.tailwindcss.com') ||
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com') ||
        url.pathname.match(/\.(js|jsx|css|png|jpg|jpeg|svg|webp|woff2|woff|ttf|ico|json)$/)
    );

    if (isStaticAsset) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                const networkFetch = fetch(request)
                    .then((networkResponse) => {
                        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                            const clone = networkResponse.clone();
                            caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, clone));
                        }
                        return networkResponse;
                    })
                    .catch((err) => {
                        return cachedResponse;
                    });

                // If cached, return immediately in 0ms, else wait for network
                return cachedResponse || networkFetch;
            })
        );
    }
});
