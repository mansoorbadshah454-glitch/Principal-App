const endpoints = [
    'createSchoolUser', 'adminMigrateUsers', 'createSchool', 'createSuperAdmin', 
    'updateSchoolUserPassword', 'deleteSchoolUser', 'notifyOnNewPost', 
    'notifyOnNewMessage', 'deleteOldMessages', 'notifyOnNewAlert'
];

async function check() {
    for (const ep of endpoints) {
        const res = await fetch(`https://us-central1-mai-sms-a8dad.cloudfunctions.net/${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: {} }) });
        const text = await res.text();
        console.log(ep, res.status, text.includes('Forbidden') ? 'FORBIDDEN' : 'PUBLIC');
    }
}
check();
