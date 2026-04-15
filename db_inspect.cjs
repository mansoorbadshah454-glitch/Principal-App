const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, collection, getDocs, query, where } = require('firebase/firestore');

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

async function check() {
    try {
        console.log("Fetching student by name...");
        const studentsRef = collection(db, 'schools/KqD6N446sH73tXmF2yG1/students');
        const q = query(studentsRef, where('name', '==', 'Anaya Atiq'));
        const snap = await getDocs(q);
        
        snap.docs.forEach(d => {
            console.log("Master Record Anaya:", d.id, JSON.stringify(d.data().parentDetails));
            console.log("ClassId:", d.data().classId);
        });

        const parentRef = collection(db, 'schools/KqD6N446sH73tXmF2yG1/parents');
        const pq = query(parentRef, where('name', '==', 'M.Atiq'));
        const psnap = await getDocs(pq);
        psnap.docs.forEach(p => {
             console.log("Parent Linked Students:", p.data().linkedStudents);
        });

        console.log("Done checking.");
    } catch(e) {
        console.log("Error:", e);
    }
}
check();
