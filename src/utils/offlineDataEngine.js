/**
 * offlineDataEngine.js
 * 
 * Enterprise-Grade Universal Local-First Offline Storage Engine for Principal WebApp.
 * Powered by native IndexedDB.
 * Provides 0ms instant loading, persistent caching across restarts/offline refreshes,
 * and zero database read costs for NewsFeed, Classes, Dashboard Stats, and Settings.
 */

const DB_NAME = 'SchoolV5_DataEngine';
const DB_VERSION = 1;
const STORES = {
    NEWSFEED: 'newsfeed_posts',
    CLASSES: 'classes_cache',
    TEACHERS: 'teachers_cache',
    DASHBOARD: 'dashboard_cache',
    SETTINGS: 'settings_cache'
};

const openDataDB = () => {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            return reject(new Error('IndexedDB not supported'));
        }

        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORES.NEWSFEED)) {
                const nfStore = db.createObjectStore(STORES.NEWSFEED, { keyPath: 'id' });
                nfStore.createIndex('schoolId', 'schoolId', { unique: false });
            }
            if (!db.objectStoreNames.contains(STORES.CLASSES)) {
                db.createObjectStore(STORES.CLASSES, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORES.TEACHERS)) {
                db.createObjectStore(STORES.TEACHERS, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORES.DASHBOARD)) {
                db.createObjectStore(STORES.DASHBOARD, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

/* ==========================================================================
   1. NEWSFEED POSTS CACHE
   ========================================================================== */

export const cacheNewsFeedPosts = async (schoolId, posts = []) => {
    if (!schoolId || !Array.isArray(posts) || posts.length === 0) return;
    try {
        const db = await openDataDB();
        const tx = db.transaction(STORES.NEWSFEED, 'readwrite');
        const store = tx.objectStore(STORES.NEWSFEED);

        posts.forEach(post => {
            if (post && post.id) {
                store.put({
                    ...post,
                    schoolId,
                    _cachedAt: Date.now()
                });
            }
        });

        // Also save last 30 posts in localStorage for immediate 0ms synchronous render
        try {
            localStorage.setItem(`cached_posts_${schoolId}`, JSON.stringify(posts.slice(0, 30)));
        } catch (_) {}

        return new Promise((resolve) => {
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    } catch (err) {
        console.warn('Error caching newsfeed posts:', err);
    }
};

export const getCachedNewsFeedPosts = async (schoolId) => {
    if (!schoolId) return [];
    
    // Fast synchronous first pass from localStorage
    try {
        const local = localStorage.getItem(`cached_posts_${schoolId}`);
        if (local) {
            const parsed = JSON.parse(local);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch (_) {}

    // Fallback to IndexedDB
    try {
        const db = await openDataDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORES.NEWSFEED, 'readonly');
            const store = tx.objectStore(STORES.NEWSFEED);
            const req = store.getAll();

            req.onsuccess = () => {
                const list = (req.result || []).filter(p => p.schoolId === schoolId);
                // Sort newest first
                list.sort((a, b) => {
                    const timeA = a.timestamp?.seconds || a.timestamp || 0;
                    const timeB = b.timestamp?.seconds || b.timestamp || 0;
                    return timeB - timeA;
                });
                resolve(list);
            };
            req.onerror = () => resolve([]);
        });
    } catch (err) {
        console.warn('Error reading cached newsfeed posts:', err);
        return [];
    }
};

/* ==========================================================================
   2. DASHBOARD STATS CACHE
   ========================================================================== */

export const cacheDashboardStats = async (schoolId, statsPayload = {}) => {
    if (!schoolId || !statsPayload) return;
    try {
        const db = await openDataDB();
        const tx = db.transaction(STORES.DASHBOARD, 'readwrite');
        const store = tx.objectStore(STORES.DASHBOARD);

        store.put({
            key: `stats_${schoolId}`,
            schoolId,
            ...statsPayload,
            _cachedAt: Date.now()
        });

        // Fast mirror
        try {
            localStorage.setItem(`cached_dash_stats_${schoolId}`, JSON.stringify(statsPayload));
        } catch (_) {}

        return new Promise((resolve) => {
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    } catch (err) {
        console.warn('Error caching dashboard stats:', err);
    }
};

export const getCachedDashboardStats = (schoolId) => {
    if (!schoolId) return null;
    try {
        const raw = localStorage.getItem(`cached_dash_stats_${schoolId}`);
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
};
