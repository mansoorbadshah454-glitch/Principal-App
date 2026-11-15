/**
 * SampleFeeRegisterGenerator.js
 * Generates an ultra-realistic, simulated physical Pakistani school fee & dues register on HTML5 Canvas.
 * Used for 1-click zero-hassle testing, demo accounts (e.g. 6257), and offline testing.
 */

export const SAMPLE_FEE_DATA = [
    { rollNo: '1', studentName: 'Muhammad Hamza', fatherName: 'Tariq Mehmood', monthlyFee: 2500, arrears: 0, paidUpToMonth: 'August 2026', lowConfidence: false, isDemoMatched: true },
    { rollNo: '2', studentName: 'Ayesha Noor', fatherName: 'Muhammad Arshad', monthlyFee: 3000, arrears: 1500, paidUpToMonth: 'July 2026', lowConfidence: false, isDemoMatched: true },
    { rollNo: '3', studentName: 'Bilal Hassan', fatherName: 'Ghulam Mustafa', monthlyFee: 2500, arrears: 5000, paidUpToMonth: 'May 2026', lowConfidence: false, isDemoMatched: true },
    { rollNo: '4', studentName: 'Fatima Zahra', fatherName: 'Syed Ali Raza', monthlyFee: 3500, arrears: 0, paidUpToMonth: 'August 2026', lowConfidence: false, isDemoMatched: true },
    { rollNo: '5', studentName: 'Zainab Bibi', fatherName: 'Muhammad Siddique', monthlyFee: 2000, arrears: 2000, paidUpToMonth: 'July 2026', lowConfidence: false, isDemoMatched: true },
    { rollNo: '6', studentName: 'Usman Ghani', fatherName: 'Abdul Rehman', monthlyFee: 2500, arrears: 0, paidUpToMonth: 'August 2026', lowConfidence: false, isDemoMatched: true },
    { rollNo: '99', studentName: 'Rashid Minhas (Left / Unregistered)', fatherName: 'Saeed Khan', monthlyFee: 3000, arrears: 6000, paidUpToMonth: 'April 2026', lowConfidence: false, isDemoMatched: false },
    { rollNo: '100', studentName: 'Hamid Ali (External Candidate)', fatherName: 'Ali Nawaz', monthlyFee: 2800, arrears: 0, paidUpToMonth: 'None', lowConfidence: false, isDemoMatched: false }
];

/**
 * 🧪 Test dataset specifically designed to demonstrate the complete MIX:
 * 1. 🟢 Clean Verified students (Green)
 * 2. 🟡 Kat-pit / Cuttings / Overwritten fee amount (Amber / Yellow with alert reason)
 * 3. 🔴 Unmatched / Non-existent student in class (Red)
 */
export const SAMPLE_CUTTINGS_FEE_DATA = [
    { rollNo: '1', studentName: 'Muhammad Hamza', fatherName: 'Tariq Mehmood', monthlyFee: 2500, arrears: 0, paidUpToMonth: 'August 2026', lowConfidence: false, isDemoMatched: true },
    { rollNo: '2', studentName: 'Ayesha Noor', fatherName: 'Muhammad Arshad', monthlyFee: 3200, arrears: 1500, paidUpToMonth: 'July 2026', lowConfidence: true, katPitReason: 'Kat-pit / Fee amount overwritten over 3000', isDemoMatched: true },
    { rollNo: '3', studentName: 'Bilal Hassan', fatherName: 'Ghulam Mustafa', monthlyFee: 2500, arrears: 5000, paidUpToMonth: 'May 2026', lowConfidence: false, isDemoMatched: true },
    { rollNo: '4', studentName: 'Fatima Zahra', fatherName: 'Syed Ali Raza', monthlyFee: 3500, arrears: 0, paidUpToMonth: 'August 2026', lowConfidence: false, isDemoMatched: true },
    { rollNo: '5', studentName: 'Zainab Bibi', fatherName: 'Muhammad Siddique', monthlyFee: 2200, arrears: 4400, paidUpToMonth: 'June 2026', lowConfidence: true, katPitReason: 'Fluid / Whitener on Baqaya column', isDemoMatched: true },
    { rollNo: '6', studentName: 'Usman Ghani', fatherName: 'Abdul Rehman', monthlyFee: 2500, arrears: 0, paidUpToMonth: 'August 2026', lowConfidence: false, isDemoMatched: true },
    { rollNo: '99', studentName: 'Rashid Minhas (Left / Unregistered)', fatherName: 'Saeed Khan', monthlyFee: 3000, arrears: 6000, paidUpToMonth: 'April 2026', lowConfidence: false, isDemoMatched: false },
    { rollNo: '100', studentName: 'Hamid Ali (External Candidate)', fatherName: 'Ali Nawaz', monthlyFee: 2800, arrears: 0, paidUpToMonth: 'None', lowConfidence: false, isDemoMatched: false }
];

export function generateSampleFeeRegisterImage(withCuttings = false) {
    const data = withCuttings ? SAMPLE_CUTTINGS_FEE_DATA : SAMPLE_FEE_DATA;
    const width = 1400;
    const headerHeight = 160;
    const rowHeight = 52;
    const height = headerHeight + (data.length * rowHeight) + 90;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 1. Paper Texture Background (Pale ivory ledger paper)
    ctx.fillStyle = '#fdfbf7';
    ctx.fillRect(0, 0, width, height);

    // Subtle ledger paper faint blue horizontal guidelines
    ctx.strokeStyle = '#e6edf5';
    ctx.lineWidth = 1;
    for (let y = headerHeight; y < height - 40; y += 13) {
        ctx.beginPath();
        ctx.moveTo(30, y);
        ctx.lineTo(width - 30, y);
        ctx.stroke();
    }

    // Left register red double guideline
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(100, 30);
    ctx.lineTo(100, height - 30);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(105, 30);
    ctx.lineTo(105, height - 30);
    ctx.stroke();

    // 2. School Title & Register Header
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 24px serif';
    ctx.textAlign = 'center';
    ctx.fillText('MODEL GRAMMAR SCHOOL & INTER COLLEGE', width / 2, 55);

    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('STUDENTS MONTHLY TUITION FEE & ARREARS REGISTER (کچا فیس و بقایا رجسٹر)', width / 2, 85);

    ctx.font = '13px monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText('SESSION: 2026-2027  |  CLASS: CLASS 5 (SECTION A)  |  BASELINE MIGRATION SHEET', width / 2, 115);

    // 3. Table Column Layout
    const cols = [
        { key: 'rollNo', label: 'Roll No\n(رول نمبر)', width: 85, align: 'center' },
        { key: 'studentName', label: 'Student Name\n(نام طالب علم)', width: 250, align: 'left' },
        { key: 'fatherName', label: "Father's Name\n(ولدیت)", width: 230, align: 'left' },
        { key: 'monthlyFee', label: 'Monthly Fee (PKR)\n(ماہانہ فیس)', width: 170, align: 'center' },
        { key: 'arrears', label: 'Previous Arrears\n(سابقہ بقایا جات)', width: 170, align: 'center' },
        { key: 'paidUpToMonth', label: 'Paid Up To Month\n(ادا شدہ تا ماہ)', width: 180, align: 'center' },
        // Dummy columns to test that AI properly ignores them:
        { key: 'attendanceDummy', label: 'Daily Hazri\n(1-31)', width: 110, align: 'center' },
        { key: 'signatureDummy', label: 'Sign / Dastakhat\n(دستخط)', width: 120, align: 'center' }
    ];

    const startX = 40;
    const tableTop = 135;

    // Draw Header Row
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(startX, tableTop, width - 80, 50);

    let curX = startX;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#ffffff';

    cols.forEach(col => {
        const lines = col.label.split('\n');
        const textX = col.align === 'center' ? curX + col.width / 2 : curX + 12;
        ctx.textAlign = col.align;
        if (lines.length > 1) {
            ctx.fillText(lines[0], textX, tableTop + 20);
            ctx.font = 'normal 10px sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(lines[1], textX, tableTop + 36);
            ctx.font = 'bold 12px sans-serif';
            ctx.fillStyle = '#ffffff';
        } else {
            ctx.fillText(col.label, textX, tableTop + 30);
        }

        // Vertical divider
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(curX + col.width, tableTop);
        ctx.lineTo(curX + col.width, tableTop + 50);
        ctx.stroke();

        curX += col.width;
    });

    // Draw Student Rows
    let curY = tableTop + 50;

    data.forEach((row, idx) => {
        // Zebra striping
        ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        ctx.fillRect(startX, curY, width - 80, rowHeight);

        // Bottom border
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(startX, curY + rowHeight);
        ctx.lineTo(width - 40, curY + rowHeight);
        ctx.stroke();

        let rowX = startX;
        cols.forEach(col => {
            ctx.strokeStyle = '#e2e8f0';
            ctx.beginPath();
            ctx.moveTo(rowX + col.width, curY);
            ctx.lineTo(rowX + col.width, curY + rowHeight);
            ctx.stroke();

            const textX = col.align === 'center' ? rowX + col.width / 2 : rowX + 12;
            const textY = curY + 32;
            ctx.textAlign = col.align;

            if (col.key === 'rollNo') {
                ctx.font = 'bold 14px monospace';
                ctx.fillStyle = '#0f172a';
                ctx.fillText(row.rollNo, textX, textY);
            } else if (col.key === 'studentName') {
                ctx.font = 'bold 13px sans-serif';
                ctx.fillStyle = '#1e293b';
                ctx.fillText(row.studentName, textX, textY);
            } else if (col.key === 'fatherName') {
                ctx.font = '12px sans-serif';
                ctx.fillStyle = '#475569';
                ctx.fillText(row.fatherName, textX, textY);
            } else if (col.key === 'monthlyFee') {
                ctx.font = 'bold 14px monospace';
                ctx.fillStyle = '#1e40af';

                if (row.lowConfidence && row.rollNo === '2') {
                    // Simulate Kat-Pit / Overwriting
                    ctx.save();
                    ctx.fillStyle = '#94a3b8';
                    ctx.fillText('3000', textX - 10, textY);
                    ctx.strokeStyle = '#ef4444';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(textX - 30, textY - 4);
                    ctx.lineTo(textX + 10, textY - 4);
                    ctx.stroke();
                    ctx.fillStyle = '#047857';
                    ctx.font = 'bold 14px cursive';
                    ctx.fillText('3200', textX + 25, textY - 6);
                    ctx.restore();
                } else {
                    ctx.fillText(`Rs. ${row.monthlyFee.toLocaleString()}`, textX, textY);
                }
            } else if (col.key === 'arrears') {
                ctx.font = 'bold 13px monospace';
                if (row.arrears > 0) {
                    ctx.fillStyle = '#b91c1c';
                    if (row.lowConfidence && row.rollNo === '5') {
                        // Fluid whitener simulation
                        ctx.save();
                        ctx.fillStyle = '#e2e8f0';
                        ctx.fillRect(textX - 40, textY - 18, 80, 22);
                        ctx.fillStyle = '#991b1b';
                        ctx.font = 'bold 13px cursive';
                        ctx.fillText(`Rs. ${row.arrears.toLocaleString()}`, textX, textY);
                        ctx.restore();
                    } else {
                        ctx.fillText(`Rs. ${row.arrears.toLocaleString()}`, textX, textY);
                    }
                } else {
                    ctx.fillStyle = '#059669';
                    ctx.fillText('NIL (0)', textX, textY);
                }
            } else if (col.key === 'paidUpToMonth') {
                ctx.font = '12px sans-serif';
                ctx.fillStyle = '#334155';
                ctx.fillText(row.paidUpToMonth, textX, textY);
            } else if (col.key === 'attendanceDummy') {
                ctx.font = '10px monospace';
                ctx.fillStyle = '#94a3b8';
                ctx.fillText('P P P A P', textX, textY);
            } else if (col.key === 'signatureDummy') {
                ctx.strokeStyle = '#64748b';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(textX - 25, textY - 2);
                ctx.bezierCurveTo(textX - 10, textY - 15, textX + 5, textY + 8, textX + 25, textY - 4);
                ctx.stroke();
            }

            rowX += col.width;
        });

        curY += rowHeight;
    });

    // 4. Register Stamp & Verification Footer
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2;
    ctx.strokeRect(width - 290, curY + 15, 240, 50);

    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#0369a1';
    ctx.textAlign = 'center';
    ctx.fillText('FEE CLERK VERIFIED STAMP', width - 170, curY + 33);
    ctx.font = '10px sans-serif';
    ctx.fillText('DATE: 15-AUG-2026', width - 170, curY + 48);

    return {
        base64: canvas.toDataURL('image/jpeg', 0.9),
        width,
        height
    };
}
