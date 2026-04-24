const admin = require('../functions/node_modules/firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('../functions/serviceAccountKey.json', 'utf8').replace(/^\uFEFF/, ''));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
    try {
        console.log("Fetching schools...");
        const schools = await db.collection('schools').get();
        for (const school of schools.docs) {
            console.log(`School: ${school.id}`);
            const classes = await db.collection(`schools/${school.id}/classes`).get();
            for (const cls of classes.docs) {
                if (cls.data().name.toLowerCase() !== 'prep') continue;
                console.log(`  Class: ${cls.id} (${cls.data().name})`);
                const subjects = cls.data().subjects || [];
                for (const subject of subjects) {
                    if (subject.toLowerCase() !== 'english') continue;
                    
                    const chapters = await db.collection(`schools/${school.id}/classes/${cls.id}/syllabus/${subject}/chapters`).get();
                    if (!chapters.empty) {
                        console.log(`    [NEW SCHEMA] Found ${chapters.size} chapters in subcollection for ${subject}:`);
                        chapters.forEach(c => console.log(`      - ${c.data().title}`));
                    } else {
                        console.log(`    [NEW SCHEMA] 0 chapters found for ${subject}`);
                    }
                }
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
