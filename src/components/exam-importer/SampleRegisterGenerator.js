/**
 * SampleRegisterGenerator.js
 * Generates an instant high-resolution sample broadsheet register image
 * directly on an HTML5 canvas for 100% zero-friction testing without a physical camera or paper.
 */

export function generateSampleRegisterImage(subjectsList = [], studentsCount = 10) {
    const defaultSubs = [
        { subjectId: 'english', name: 'English', maxMarks: 100 },
        { subjectId: 'urdu', name: 'Urdu', maxMarks: 100 },
        { subjectId: 'mathematics', name: 'Mathematics', maxMarks: 100 },
        { subjectId: 'general_science', name: 'Science', maxMarks: 100 },
        { subjectId: 'islamiyat', name: 'Islamiyat', maxMarks: 100 }
    ];
    const safeSubjects = subjectsList && subjectsList.length > 0 ? subjectsList : defaultSubs;

    const canvas = document.createElement('canvas');
    const width = 1600;
    const rowHeight = 45;
    const headerHeight = 90;
    const height = headerHeight + (studentsCount * rowHeight) + 60;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 1. Paper Background (Slightly warm broadsheet paper color)
    ctx.fillStyle = '#fdfbf7';
    ctx.fillRect(0, 0, width, height);

    // Subtle ledger paper faint blue horizontal lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let y = headerHeight; y < height; y += rowHeight) {
        ctx.beginPath();
        ctx.moveTo(30, y);
        ctx.lineTo(width - 30, y);
        ctx.stroke();
    }

    // Outer double border
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 20, width - 60, height - 40);

    // 2. Title Header
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px serif';
    ctx.textAlign = 'center';
    ctx.fillText('MODEL HIGH SCHOOL — 1ST TERM EXAMINATION BROADSHEET REGISTER', width / 2, 45);

    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('Academic Session: 2025-2026  |  Class: 8th (Grade VIII)  |  Official Ledger Broadsheet', width / 2, 68);

    // 3. Column Positions Calculation
    const startX = 40;
    const rollWidth = 70;
    const nameWidth = 220;
    const totalCols = safeSubjects.length;
    const availWidth = width - 80 - rollWidth - nameWidth - 110; // 110 for Grand Total
    const colWidth = Math.max(80, Math.floor(availWidth / totalCols));

    const cols = [
        { label: 'Roll #', x: startX, w: rollWidth, align: 'center' },
        { label: 'Student Name', x: startX + rollWidth, w: nameWidth, align: 'left' }
    ];

    let curX = startX + rollWidth + nameWidth;
    safeSubjects.forEach((sub) => {
        cols.push({
            label: sub.name,
            subLabel: `(${sub.maxMarks})`,
            x: curX,
            w: colWidth,
            align: 'center',
            id: sub.subjectId
        });
        curX += colWidth;
    });

    cols.push({ label: 'Grand Total', subLabel: 'Meezan', x: curX, w: 120, align: 'center', isTotal: true });

    // Draw Column Headers
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(30, 75, width - 60, 40);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    cols.forEach(c => {
        const textX = c.align === 'center' ? c.x + c.w / 2 : c.x + 10;
        ctx.textAlign = c.align;
        ctx.fillText(c.label, textX, 95);
        if (c.subLabel) {
            ctx.font = 'normal 10px monospace';
            ctx.fillText(c.subLabel, textX, 108);
            ctx.font = 'bold 12px sans-serif';
        }
    });

    // Vertical Divider lines for header
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    cols.forEach(c => {
        ctx.beginPath();
        ctx.moveTo(c.x, 75);
        ctx.lineTo(c.x, height - 20);
        ctx.stroke();
    });

    // 4. Sample Students Rows
    const sampleNames = [
        'Muhammad Ali', 'Fatima Zahra', 'Ahmed Bilal', 'Ayesha Khan',
        'Zainab Bibi', 'Hamza Tariq', 'Usman Ghani', 'Hafsa Noor',
        'Bilal Hassan', 'Mariam Siddiqui'
    ];

    const demoRoster = [];

    for (let i = 0; i < studentsCount; i++) {
        const y = 115 + (i * rowHeight) + 26;
        const rollStr = String(i + 1);
        const nameStr = sampleNames[i % sampleNames.length];
        const studentId = `demo_std_${i + 1}`;

        // Alternating row background for clean ledger look
        if (i % 2 === 1) {
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(31, 115 + (i * rowHeight), width - 62, rowHeight);
        }

        // Draw Roll No
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(rollStr, cols[0].x + cols[0].w / 2, y);

        // Draw Name
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(nameStr, cols[1].x + 10, y);

        let rowSum = 0;
        const marks = {};
        const lowConf = [];

        // Subject marks
        safeSubjects.forEach((sub, sIdx) => {
            const col = cols[2 + sIdx];
            // Base mark around 65-95
            let mark = Math.min(sub.maxMarks, Math.floor(sub.maxMarks * (0.60 + ((i * 7 + sIdx * 11) % 35) / 100)));

            // Let Roll #3 have a low-confidence overwritten kat-pit
            if (i === 2 && sIdx === 1) {
                lowConf.push(sub.subjectId);
            }

            marks[sub.subjectId] = mark;
            rowSum += mark;

            // Render handwritten ink look (dark blue ink)
            ctx.fillStyle = (i === 2 && sIdx === 1) ? '#b91c1c' : '#1e3a8a';
            ctx.font = 'bold 14px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(String(mark), col.x + col.w / 2, y);

            if (i === 2 && sIdx === 1) {
                // Draw a small ink kat-pit cross strike
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(col.x + col.w / 2 - 12, y - 4);
                ctx.lineTo(col.x + col.w / 2 + 12, y - 4);
                ctx.stroke();
            }
        });

        // Intentional Teacher Calculation Error on Row #5 to test Math-Lock Red Diff & Ctrl+M override!
        let teacherWrittenTotal = rowSum;
        if (i === 4) {
            teacherWrittenTotal = rowSum - 10; // Teacher made a -10 math mistake on paper!
        }

        // Draw Grand Total Column
        const totalCol = cols[cols.length - 1];
        ctx.fillStyle = (i === 4) ? '#991b1b' : '#047857';
        ctx.font = 'bold 15px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(teacherWrittenTotal), totalCol.x + totalCol.w / 2, y);

        demoRoster.push({
            studentId,
            rollNo: rollStr,
            name: nameStr,
            fatherName: 'Guardian',
            marks,
            systemTotal: rowSum,
            registerGrandTotal: teacherWrittenTotal,
            lowConfidenceSubjects: lowConf,
            sourceImageIndex: 0,
            hasAiData: true
        });
    }

    return {
        base64: canvas.toDataURL('image/jpeg', 0.88),
        previewUrl: canvas.toDataURL('image/jpeg', 0.88),
        demoRoster
    };
}
