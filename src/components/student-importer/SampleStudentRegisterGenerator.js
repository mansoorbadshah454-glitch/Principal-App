/**
 * SampleStudentRegisterGenerator.js
 * Generates an ultra-realistic, simulated physical Pakistani school admission register on HTML5 Canvas.
 * Used for 1-click zero-hassle testing, demo accounts (e.g. 6257), and offline testing.
 */

export const SAMPLE_STUDENT_DATA = [
    { rollNo: '1', fullName: 'Muhammad Hamza', fatherName: 'Tariq Mehmood', phone: '0301-7654321', cnic: '35201-8765432-1', gender: 'Male', dob: '2013-04-12' },
    { rollNo: '2', fullName: 'Ayesha Noor', fatherName: 'Muhammad Arshad', phone: '0321-4567890', cnic: '35201-1234567-2', gender: 'Female', dob: '2013-08-25' },
    { rollNo: '3', fullName: 'Bilal Hassan', fatherName: 'Ghulam Mustafa', phone: '0345-9876543', cnic: '35202-3456789-3', gender: 'Male', dob: '2012-11-03' },
    { rollNo: '4', fullName: 'Fatima Zahra', fatherName: 'Syed Ali Raza', phone: '0300-1122334', cnic: '35201-9876543-4', gender: 'Female', dob: '2013-01-19' },
    { rollNo: '5', fullName: 'Zainab Bibi', fatherName: 'Muhammad Siddique', phone: '0313-5566778', cnic: '35201-5678901-5', gender: 'Female', dob: '2013-06-30' },
    { rollNo: '6', fullName: 'Usman Ghani', fatherName: 'Abdul Rehman', phone: '0333-4455667', cnic: '35202-6789012-6', gender: 'Male', dob: '2012-09-15' },
    { rollNo: '7', fullName: 'Hafsa Tariq', fatherName: 'Tariq Jamil', phone: '0302-8899001', cnic: '35201-2345678-7', gender: 'Female', dob: '2013-03-22' },
    { rollNo: '8', fullName: 'Ahmed Raza', fatherName: 'Muhammad Farooq', phone: '0322-6677889', cnic: '35202-7890123-8', gender: 'Male', dob: '2012-12-08' },
    { rollNo: '9', fullName: 'Mariam Bibi', fatherName: 'Javed Iqbal', phone: '0346-2233445', cnic: '35201-3456789-9', gender: 'Female', dob: '2013-07-14' },
    { rollNo: '10', fullName: 'Abdullah Khan', fatherName: 'Sher Muhammad', phone: '0307-3344556', cnic: '35202-4567890-0', gender: 'Male', dob: '2012-05-18' }
];

/**
 * 🧪 Test dataset specifically designed to demonstrate:
 * 1. Clean Verified students (Green)
 * 2. Kat-pit / Cuttings / Overwritten students (Orange / Amber box)
 * 3. Missing Name / Roll (Red Box)
 * 4. Duplicate entries (Red Box + Duplicate shield)
 * 5. Partial details (Only Name & Roll with missing phone/B-form - cleanly verified without errors)
 */
export const SAMPLE_CUTTINGS_STUDENT_DATA = [
    { rollNo: '1', fullName: 'Muhammad Hamza', fatherName: 'Tariq Mehmood', phone: '0301-7654321', cnic: '35201-8765432-1', gender: 'Male', dob: '2013-04-12', lowConfidence: false },
    { rollNo: '2', fullName: 'Ayesha Noor (Cuttings / Kat-pit)', fatherName: 'Muhammad Arshad', phone: '0321-4567890', cnic: '35201-1234567-2', gender: 'Female', dob: '2013-08-25', lowConfidence: true },
    { rollNo: '3', fullName: '', fatherName: 'Ghulam Mustafa', phone: '0345-9876543', cnic: '35202-3456789-3', gender: 'Male', dob: '2012-11-03', lowConfidence: false },
    { rollNo: '4', fullName: 'Fatima Zahra', fatherName: 'Syed Ali Raza', phone: '0300-1122334', cnic: '', gender: 'Female', dob: '2013-01-19', lowConfidence: false },
    { rollNo: '4', fullName: 'Zainab Bibi', fatherName: 'Muhammad Siddique', phone: '0313-5566778', cnic: '35201-5678901-5', gender: 'Female', dob: '2013-06-30', lowConfidence: false },
    { rollNo: '6', fullName: 'Usman Ghani', fatherName: 'Abdul Rehman', phone: '', cnic: '', gender: 'Male', dob: '', lowConfidence: false },
    { rollNo: '7', fullName: 'Hafsa Tariq (Overwriting)', fatherName: 'Tariq Jamil', phone: '0302-8899001', cnic: '35201-2345678-7', gender: 'Female', dob: '2013-03-22', lowConfidence: true },
    { rollNo: '8', fullName: 'Ahmed Raza', fatherName: 'Muhammad Farooq', phone: '0322-6677889', cnic: '35202-7890123-8', gender: 'Male', dob: '2012-12-08', lowConfidence: false }
];

export function generateSampleRegisterImage(rowCount = 10) {
    const width = 1400;
    const headerHeight = 160;
    const rowHeight = 48;
    const height = headerHeight + (rowCount * rowHeight) + 80;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 1. Paper Texture Background (Off-white / pale ivory register page)
    ctx.fillStyle = '#fdfbf7';
    ctx.fillRect(0, 0, width, height);

    // Subtle ledger paper faint blue horizontal guidelines
    ctx.strokeStyle = '#e6edf5';
    ctx.lineWidth = 1;
    for (let y = headerHeight; y < height - 40; y += 12) {
        ctx.beginPath();
        ctx.moveTo(30, y);
        ctx.lineTo(width - 30, y);
        ctx.stroke();
    }

    // Left register margin red line (like physical ledger notebooks)
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(110, 30);
    ctx.lineTo(110, height - 30);
    ctx.stroke();

    // 2. School Title & Register Header
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 24px serif';
    ctx.textAlign = 'center';
    ctx.fillText('GOVT. / PRIVATE MODEL HIGH SCHOOL & COLLEGE', width / 2, 55);

    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('STUDENTS ADMISSION & GENERAL ROLL REGISTER', width / 2, 85);

    ctx.font = '13px monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText('SESSION: 2026-2027  |  CLASS: CLASS 5 (GENERAL)  |  MEDIUM: URDU / ENGLISH', width / 2, 115);

    // 3. Table Column Layout
    const cols = [
        { key: 'rollNo', label: 'Roll No', width: 90, align: 'center' },
        { key: 'fullName', label: 'Student Full Name', width: 280, align: 'left' },
        { key: 'fatherName', label: "Father's Name", width: 260, align: 'left' },
        { key: 'phone', label: 'Mobile / WhatsApp', width: 190, align: 'center' },
        { key: 'cnic', label: 'B-Form / CNIC', width: 210, align: 'center' },
        { key: 'gender', label: 'Gender', width: 120, align: 'center' },
        { key: 'dob', label: 'Date of Birth', width: 150, align: 'center' }
    ];

    const startX = 50;
    const tableTop = 135;

    // Draw Header Row
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(startX, tableTop, width - 100, 36);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(startX, tableTop, width - 100, 36);

    let currentX = startX;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#0f172a';

    cols.forEach(col => {
        // Vertical divider
        ctx.beginPath();
        ctx.moveTo(currentX, tableTop);
        ctx.lineTo(currentX, tableTop + 36 + (rowCount * rowHeight));
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillText(col.label, currentX + (col.width / 2), tableTop + 23);
        currentX += col.width;
    });

    // Close right table border
    ctx.beginPath();
    ctx.moveTo(currentX, tableTop);
    ctx.lineTo(currentX, tableTop + 36 + (rowCount * rowHeight));
    ctx.stroke();

    // 4. Draw Rows with Realistic Handwritten-Style Ink
    const demoStudents = SAMPLE_STUDENT_DATA.slice(0, rowCount);

    demoStudents.forEach((st, idx) => {
        const rowY = tableTop + 36 + (idx * rowHeight);

        // Subtle alternating row tint
        if (idx % 2 === 1) {
            ctx.fillStyle = 'rgba(241, 245, 249, 0.5)';
            ctx.fillRect(startX, rowY, width - 100, rowHeight);
        }

        // Horizontal row border
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(startX, rowY + rowHeight);
        ctx.lineTo(width - 50, rowY + rowHeight);
        ctx.stroke();

        // Ink color (fountain pen royal blue or dark ballpoint)
        ctx.fillStyle = idx % 3 === 0 ? '#1e3a8a' : '#0f172a';
        ctx.font = '500 15px "Segoe UI", Tahoma, sans-serif';

        let cellX = startX;
        cols.forEach(col => {
            const val = String(st[col.key] || '');
            if (col.align === 'center') {
                ctx.textAlign = 'center';
                ctx.fillText(val, cellX + (col.width / 2), rowY + 30);
            } else {
                ctx.textAlign = 'left';
                ctx.fillText(val, cellX + 14, rowY + 30);
            }
            cellX += col.width;
        });
    });

    // Outer table border
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, tableTop, width - 100, 36 + (rowCount * rowHeight));

    // Footer signature stamps
    ctx.font = 'italic 12px serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.fillText('Verified by Admission In-Charge: ____________________', startX + 20, height - 25);
    ctx.textAlign = 'right';
    ctx.fillText("Principal's Signature & School Seal: ____________________", width - 70, height - 25);

    const base64 = canvas.toDataURL('image/jpeg', 0.88);

    return {
        base64,
        previewUrl: base64,
        demoStudents: demoStudents.map((s, i) => ({
            ...s,
            tempId: `demo_st_${i + 1}`,
            admissionNo: `ADM-${String(100 + i + 1).padStart(3, '0')}`,
            section: 'A',
            lowConfidence: false
        }))
    };
}
