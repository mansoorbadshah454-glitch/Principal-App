import { initializeApp } from "firebase/app";
import { getFirestore, collectionGroup, query, where, getDocs } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyARAU5c_8nJd4KcVWsAVBDV529nObmW9Vs",
    authDomain: "mai-sms-a8dad.firebaseapp.com",
    projectId: "mai-sms-a8dad",
    storageBucket: "mai-sms-a8dad.firebasestorage.app",
    messagingSenderId: "550173587112",
    appId: "1:550173587112:web:d4bff4b8796cc8cb00349d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkMahnoor() {
    console.log("Searching for Mahnoor Baloch...");
    
    // Search across all student subcollections
    const q = query(collectionGroup(db, 'students'), where('name', '>=', 'Mahnoor'), where('name', '<=', 'Mahnoor\uf8ff'));
    
    try {
        const snap = await getDocs(q);
        if (snap.empty) {
            console.log("No student found with name starting with 'Mahnoor'");
        } else {
            console.log(`Found ${snap.docs.length} occurrences:`);
            snap.docs.forEach(doc => {
                const data = doc.data();
                console.log("-------------------");
                console.log("Document Path:", doc.ref.path);
                console.log("ID:", doc.id);
                console.log("Name:", data.name);
                console.log("Class:", data.className, "(ID:", data.classId, ")");
                console.log("Parent ID:", data.parentDetails ? data.parentDetails.parentId : "No parentDetails object");
            });
        }
    } catch (error) {
        console.error("Error querying:", error);
    }
}

checkMahnoor();
