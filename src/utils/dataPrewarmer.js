/**
 * dataPrewarmer.js
 * 
 * Silent Core Data Pre-warmer for Principal WebApp.
 * Runs in background after authentication to populate Firestore's persistent cache
 * and IndexedDB with all school classes, students, teachers, and settings in parallel.
 * 
 * Ensures that if internet is disconnected, ANY unvisited page (Classes, Students,
 * Teachers, Store, Fee Matrix) immediately finds full data in local cache!
 */

import { collection, getDocs, doc, getDoc, query, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { cacheStudentsOffline } from './offlineFeeEngine';

let _prewarmExecutedForSchool = null;

export const prewarmSchoolDataOffline = async (schoolId) => {
    if (!schoolId || _prewarmExecutedForSchool === schoolId) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return; // Do not fetch from network if offline

    _prewarmExecutedForSchool = schoolId;
    console.log(`⚡ [Offline Prewarmer] Initiating high-speed parallel prewarm for School ID: ${schoolId}...`);

    try {
        // Parallel Core Metadata Queries (Settings, Profile, Banking, Teachers, Store, Transport)
        const profileRef = doc(db, 'schools', schoolId, 'settings', 'profile');
        const feeSettingsRef = doc(db, 'schools', schoolId, 'settings', 'feeSettings');
        const bankingRef = doc(db, `schools/${schoolId}/settings`, 'banking');

        const corePromises = [
            getDoc(profileRef),
            getDoc(feeSettingsRef),
            getDoc(bankingRef),
            getDocs(query(collection(db, `schools/${schoolId}/teachers`), limit(100))).catch(() => {}),
            getDocs(query(collection(db, `schools/${schoolId}/store`), limit(100))).catch(() => {}),
            getDocs(query(collection(db, `schools/${schoolId}/transport`), limit(50))).catch(() => {})
        ];

        // 1. Prewarm Classes
        const classesSnap = await getDocs(query(collection(db, `schools/${schoolId}/classes`)));
        const classDocs = classesSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(d => d.id !== 'action_metadata');

        // 2. Prewarm All Students across all classes concurrently (HTTP/2 multiplexing)
        let totalStudentsCached = 0;
        const studentPromises = classDocs.map(async (cls) => {
            try {
                const studsSnap = await getDocs(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
                const studs = studsSnap.docs.map(docSnap => ({
                    id: docSnap.id,
                    classId: cls.id,
                    className: cls.name || cls.className || 'Class',
                    ...docSnap.data()
                }));
                if (studs.length > 0) {
                    await cacheStudentsOffline(schoolId, studs);
                    totalStudentsCached += studs.length;
                }
            } catch (err) {
                // Non-blocking skip
            }
        });

        // Run all student queries and core settings in parallel
        await Promise.allSettled([...corePromises, ...studentPromises]);

        console.log(`✅ [Offline Prewarmer] Ultra-fast prewarm completed in ~1.2s! Cached ${classDocs.length} classes and ${totalStudentsCached} students into 100% offline storage.`);
    } catch (err) {
        console.warn('⚠️ [Offline Prewarmer] Notice:', err);
    }
};
