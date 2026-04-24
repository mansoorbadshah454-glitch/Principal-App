import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function checkClasses() {
    try {
        const schoolsSnapshot = await getDocs(collection(db, 'schools'));
        for (const school of schoolsSnapshot.docs) {
            console.log(`School: ${school.id}`);
            const classesSnapshot = await getDocs(collection(db, `schools/${school.id}/classes`));
            for (const cls of classesSnapshot.docs) {
                console.log(`  Class: ${cls.id} -> name: "${cls.data().name}"`);
                console.log(`    Subjects:`, cls.data().subjects);
            }
            
            // let's fetch timetable master to see how it's stored
            const tt = await getDocs(collection(db, `schools/${school.id}/timetables`));
            for (const t of tt.docs) {
                if (t.id === 'weeklyMaster') {
                    console.log('Timetable:');
                    console.log(JSON.stringify(t.data().rows[0], null, 2));
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}
checkClasses();
