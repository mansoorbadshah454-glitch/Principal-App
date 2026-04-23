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
    try {
        const snap = await getDocsFromCache(colRef);
        // If cache is empty, we throw to force fallback to server
        // (A collection might be legitimately empty, but falling back to server ensures accuracy)
        if (snap.empty) throw new Error("cache empty");
        return snap;
    } catch (e) {
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
    try {
        const snap = await getDocFromCache(docRef);
        // If document doesn't exist in cache, fallback to server
        if (!snap.exists()) throw new Error("cache miss");
        return snap;
    } catch (e) {
        return await getDoc(docRef);
    }
};
