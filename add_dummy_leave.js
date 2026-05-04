import { initializeApp } from "firebase/app";
import { getFirestore, collectionGroup, query, where, getDocs, updateDoc } from "firebase/firestore";

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

async function addDummyLeave() {
    console.log("Searching for Mahnoor Baloch...");
    
    const q = query(collectionGroup(db, 'students'), where('name', '>=', 'Mahnoor'), where('name', '<=', 'Mahnoor\uf8ff'));
    
    try {
        const snap = await getDocs(q);
        if (snap.empty) {
            console.log("No student found with name starting with 'Mahnoor'");
        } else {
            console.log(`Found ${snap.docs.length} occurrences. Adding leave to the first one...`);
            const doc = snap.docs[0];
            const data = doc.data();
            console.log("ID:", doc.id);
            console.log("Name:", data.name);
            console.log("Document Path:", doc.ref.path);

            const today = new Date();
            const todayStr = today.toISOString().split('T')[0] + "T00:00:00.000Z";

            await updateDoc(doc.ref, {
                activeLeave: {
                    reason: "Sick Leave - High Fever",
                    status: "pending",
                    startDate: todayStr,
                    endDate: todayStr,
                    appliedAt: today.toISOString()
                }
            });
            console.log("Successfully added dummy sick leave (pending) for today.");
            process.exit(0);
        }
    } catch (error) {
        console.error("Error querying:", error);
        process.exit(1);
    }
}

addDummyLeave();
