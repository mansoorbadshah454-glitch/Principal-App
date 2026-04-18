import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeApp } from "firebase/app";

const firebaseConfig = {
    apiKey: "AIzaSyARAU5c_8nJd4KcVWsAVBDV529nObmW9Vs",
    authDomain: "mai-sms-a8dad.firebaseapp.com",
    projectId: "mai-sms-a8dad",
    storageBucket: "mai-sms-a8dad.firebasestorage.app",
    messagingSenderId: "550173587112",
    appId: "1:550173587112:web:d4bff4b8796cc8cb00349d"
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

async function test() {
    console.log("Calling createSchool...");
    try {
        const func = httpsCallable(functions, 'publishTimetable');
        const res = await func({
            schoolId: 'SCHOOL_1234',
            cols: ['08:00', '09:00'],
            rows: [
                {
                    id: '123', teacherId: 'abc', cells: [{class: 'Class 1', subject: 'Math'}, {class: 'Class 2', subject: 'English'}]
                }
            ],
            notificationType: 'standard'
        });
        console.log("Success:", res.data);
    } catch (err) {
        console.log("Error object fully:");
        console.log(err);
        console.log("Error code:", err.code);
        console.log("Error message:", err.message);
        console.log("Error details:", err.details);
    }
}
test();
