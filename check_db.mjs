import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

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
        const schoolsSnap = await getDocs(collection(db, 'schools'));
        console.log("Found schools:", schoolsSnap.docs.map(d => d.id));
        
        for (const sDoc of schoolsSnap.docs) {
            const schoolId = sDoc.id;
            console.log("\n=== Checking school:", schoolId);
            
            const subsRef = collection(db, `schools/${schoolId}/paymentSubmissions`);
            const subsSnap = await getDocs(subsRef);
            console.log(`Submissions count: ${subsSnap.docs.length}`);
            subsSnap.docs.forEach(d => {
                const data = d.data();
                console.log(`\nSubmission ID: ${d.id}`);
                console.log(`  status: "${data.status}"`);
                console.log(`  studentName: "${data.studentName}"`);
                console.log(`  studentId: "${data.studentId}"`);
                console.log(`  classId: "${data.classId}"`);
                console.log(`  amount: ${data.amount}`);
                console.log(`  rejectReason: "${data.rejectReason}"`);
                console.log(`  rejectedAt: "${data.rejectedAt}"`);
                if (data.familyStudents) {
                    console.log(`  familyStudents:`, JSON.stringify(data.familyStudents.map(f => ({ studentId: f.studentId, classId: f.classId }))));
                }
            });

            console.log("\n--- Checking student records in classes ---");
            const classesSnap = await getDocs(collection(db, `schools/${schoolId}/classes`));
            for (const cDoc of classesSnap.docs) {
                const stdsSnap = await getDocs(collection(db, `schools/${schoolId}/classes/${cDoc.id}/students`));
                stdsSnap.docs.forEach(std => {
                    const data = std.data();
                    if (data.pendingPaymentSubmission) {
                        console.log(`Class ${cDoc.id} -> Student [${std.id} - ${data.name || data.firstName}]:`);
                        console.log(`  pendingPaymentSubmission =`, JSON.stringify(data.pendingPaymentSubmission, null, 2));
                    }
                });
            }
        }
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

check();
