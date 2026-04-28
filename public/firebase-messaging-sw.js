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
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/vite.svg'
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});

// --- OFFLINE CACHE FOR FIREBASE STORAGE ---
const CACHE_NAME = 'firebase-storage-cache-v1';

self.addEventListener('fetch', (event) => {
    // Only intercept GET requests to Firebase Storage
    if (event.request.method === 'GET' && event.request.url.includes('firebasestorage.googleapis.com')) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached image, but also fetch an update in the background (stale-while-revalidate)
                    event.waitUntil(
                        fetch(event.request).then((networkResponse) => {
                            if (networkResponse && networkResponse.status === 200) {
                                caches.open(CACHE_NAME).then((cache) => {
                                    cache.put(event.request, networkResponse);
                                });
                            }
                        }).catch(() => { /* Ignore background fetch errors */ })
                    );
                    return cachedResponse;
                }

                // If not in cache, fetch from network and cache it
                return fetch(event.request).then((networkResponse) => {
                    // Cache only valid responses or opaque responses (type === 'opaque')
                    if (!networkResponse || (networkResponse.status !== 200 && networkResponse.type !== 'opaque')) {
                        return networkResponse;
                    }
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                    return networkResponse;
                }).catch((error) => {
                    console.error('[SW] Fetch failed for storage:', error);
                    // You could optionally return a fallback placeholder image here
                });
            })
        );
    }
});
