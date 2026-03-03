import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { getMessaging } from "firebase/messaging";

const firebaseConfig = {
    apiKey: "AIzaSyARAU5c_8nJd4KcVWsAVBDV529nObmW9Vs",
    authDomain: "mai-sms-a8dad.firebaseapp.com",
    projectId: "mai-sms-a8dad",
    storageBucket: "mai-sms-a8dad.firebasestorage.app",
    messagingSenderId: "550173587112",
    appId: "1:550173587112:web:d4bff4b8796cc8cb00349d"
};

const app = initializeApp(firebaseConfig);

// Initialize Firestore with settings to avoid "Unexpected state" errors
// Using memory cache to avoid corrupted IndexedDB state causing crashes
export const db = initializeFirestore(app, {
    localCache: memoryLocalCache()
});

export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Messaging may not be supported in all environments (e.g., Safari private mode)
let messagingInstance = null;
try {
    messagingInstance = getMessaging(app);
} catch (e) {
    console.warn("Firebase Messaging not supported in this environment", e);
}
export const messaging = messagingInstance;
