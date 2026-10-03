import { getDocsFromCache, getDocs, getDocFromCache, getDoc } from 'firebase/firestore';

/**
 * Ultra-fast offline-first fetcher for Firestore collections.
 * Attempts to load from local device cache first. If the cache is empty,
 * it silently falls back to a standard internet request.
 * 
 * @param {Query} colRef - The Firestore query or collection reference
 * @returns {Promise<QuerySnapshot>} - The resulting snapshot
 */
export const getDocsFast = async (colRef) => {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    try {
        const snap = await getDocsFromCache(colRef);
        // When online, if cache is empty, we fall back to server to ensure freshness.
        // When offline, we must never try the server, return the local cache immediately.
        if (snap.empty && !isOffline) throw new Error("cache empty");
        return snap;
    } catch (e) {
        if (isOffline) {
            return { empty: true, size: 0, docs: [] };
        }
        return await getDocs(colRef);
    }
};

/**
 * Ultra-fast offline-first fetcher for single Firestore documents.
 * 
 * @param {DocumentReference} docRef - The Firestore document reference
 * @returns {Promise<DocumentSnapshot>} - The resulting document snapshot
 */
export const getDocFast = async (docRef) => {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    try {
        const snap = await getDocFromCache(docRef);
        // If document doesn't exist in cache and online, fallback to server
        if (!snap.exists() && !isOffline) throw new Error("cache miss");
        return snap;
    } catch (e) {
        if (isOffline) {
            return { exists: () => false, data: () => null, id: docRef?.id };
        }
        return await getDoc(docRef);
    }
};
