import { initializeApp } from 'firebase/app';
import { getFirestore, collectionGroup, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "dummy",
    authDomain: "mai-sms-a8dad.firebaseapp.com",
    projectId: "mai-sms-a8dad",
    storageBucket: "mai-sms-a8dad.appspot.com",
    messagingSenderId: "367123616611",
    appId: "1:367123616611:web:caeb9f6bc2d44933a3cd9b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkData() {
    try {
        console.log("Searching for chapter 'great leader & my best friend'...");
        // Since we can't query collection group directly because of rules, let's just query the schools -> classes -> syllabus.
        // Wait, reading classes requires authentication!
        // Is there any way to authenticate?
    } catch (e) {
        console.error("Error:", e);
    }
}
checkData();
