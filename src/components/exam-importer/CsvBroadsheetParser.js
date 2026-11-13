/**
 * CsvBroadsheetParser.js
 * High-performance client-side CSV parsing & template generation for exam marks broadsheets.
 * Zero external libraries. 100% offline resilient.
 */

/**
 * Robust CSV line parser handling quotes, escaped quotes, and commas inside quotes.
 */
export function parseCsvLine(text) {
    const result = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (inQuotes && text[i + 1] === '"') {
                cur += '"';
                i++; // skip next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(cur.trim());
            cur = '';
        } else {
            cur += char;
        }
    }
    result.push(cur.trim());
    return result;
}

/**
 * Downloads a pre-formatted sample CSV broadsheet template matching the selected class & subjects.
 */
export function downloadExamCsvTemplate(className, subjects = [], sampleStudents = []) {
    const cleanClassName = (className || 'Class').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const headers = ['Roll No', 'Student Name', ...subjects.map(s => `${s.name} (Max ${s.maxMarks})`), 'Total Marks'];

    const rows = [];
    const dummyStudents = sampleStudents.length > 0 ? sampleStudents : [
        { rollNo: '1', name: 'Muhammad Ali' },
        { rollNo: '2', name: 'Fatima Zahra' },
        { rollNo: '3', name: 'Ahmed Bilal' },
        { rollNo: '4', name: 'Ayesha Khan' },
        { rollNo: '5', name: 'Hamza Tariq' }
    ];

    dummyStudents.forEach((st, idx) => {
        const rNo = st.rollNo || st.rollNumber || (idx + 1);
        const name = st.name || st.studentName || `Student ${rNo}`;
        let sum = 0;
        const marks = subjects.map((sub, sIdx) => {
            const m = Math.min(sub.maxMarks, Math.floor(sub.maxMarks * (0.65 + ((idx * 5 + sIdx * 7) % 30) / 100)));
            sum += m;
            return m;
        });
        rows.push([rNo, name, ...marks, sum]);
    });

    const csvContent = "\uFEFF" + headers.map(h => `"${h}"`).join(',') + '\n' +
        rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${cleanClassName}_Exam_Broadsheet_Template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Parses raw CSV text into the standard Math-Lock roster format.
 */
export function parseExamCsv({
    csvText,
    students = [], // database students list [{ id, rollNo, name }]
    subjects = []  // active mapped subjects [{ subjectId, name, maxMarks }]
}) {
    if (!csvText || typeof csvText !== 'string') {
        throw new Error("Invalid or empty CSV content.");
    }

    // Split lines and filter empty ones
    const rawLines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const lines = rawLines.map(l => l.trim()).filter(l => l.length > 0);

    if (lines.length < 2) {
        throw new Error("CSV file must contain a header row and at least 1 student row.");
    }

    // Header matching dictionary
    const rawHeaders = parseCsvLine(lines[0]);
    const cleanHeaders = rawHeaders.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

    // Detect Roll No column
    const rollIndex = cleanHeaders.findIndex(h =>
        h.includes('roll') || h === 'rno' || h === 'rollno' || h === 'rollnumber' || h === 'id' || h === 'regno'
    );

    // Detect Name column
    const nameIndex = cleanHeaders.findIndex(h =>
        h.includes('name') || h.includes('student') || h === 'childname'
    );

    // Detect Total / Grand Total column
    const totalIndex = cleanHeaders.findIndex(h =>
        h.includes('total') || h.includes('meezan') || h.includes('grandtotal') || h === 'sum'
    );

    // Map subject columns
    const subjectColumnMap = {}; // subjectId -> colIndex
    subjects.forEach(sub => {
        const subClean = sub.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const matchedIdx = cleanHeaders.findIndex((h, cIdx) => {
            if (cIdx === rollIndex || cIdx === nameIndex || cIdx === totalIndex) return false;
            return h.includes(subClean) || subClean.includes(h);
        });
        if (matchedIdx !== -1) {
            subjectColumnMap[sub.subjectId] = matchedIdx;
        }
    });

    // Parse data rows
    const parsedCsvRows = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = parseCsvLine(lines[i]);
        if (cells.length < 2) continue;

        const rollVal = rollIndex !== -1 ? (cells[rollIndex] || '') : String(i);
        const nameVal = nameIndex !== -1 ? (cells[nameIndex] || '') : `Student ${rollVal}`;
        const totalVal = totalIndex !== -1 ? parseFloat(cells[totalIndex]) : null;

        const marks = {};
        let rowSum = 0;
        const lowConf = [];

        subjects.forEach((sub, sIdx) => {
            const colIdx = subjectColumnMap[sub.subjectId] !== undefined
                ? subjectColumnMap[sub.subjectId]
                : (2 + sIdx < cells.length ? 2 + sIdx : -1);

            let rawNum = colIdx !== -1 ? cells[colIdx] : '';
            let parsedNum = 0;

            if (rawNum === undefined || rawNum === '' || rawNum === null) {
                parsedNum = 0;
            } else if (String(rawNum).trim().toUpperCase() === 'ABS' || String(rawNum).trim().toUpperCase() === 'A') {
                parsedNum = -1; // Absent
            } else {
                parsedNum = parseFloat(rawNum);
                if (isNaN(parsedNum)) parsedNum = 0;
            }

            if (parsedNum > sub.maxMarks) {
                lowConf.push(sub.subjectId);
            }

            marks[sub.subjectId] = parsedNum;
            if (parsedNum > 0) rowSum += parsedNum;
        });

        parsedCsvRows.push({
            rollNo: String(rollVal).trim(),
            name: String(nameVal).trim(),
            marks,
            systemTotal: rowSum,
            registerGrandTotal: totalVal !== null && !isNaN(totalVal) ? totalVal : rowSum,
            lowConfidenceSubjects: lowConf
        });
    }

    // Match against database students list
    let matchedCount = 0;
    const finalRoster = (students.length > 0 ? students : parsedCsvRows).map((st, idx) => {
        const stId = st.studentId || st.id || `csv_std_${idx + 1}`;
        const stRoll = String(st.rollNo || st.rollNumber || (idx + 1)).trim();
        const cleanStRoll = stRoll.replace(/^0+/, '');

        // Match by Roll No first, then by name substring
        const found = parsedCsvRows.find(r => {
            const cleanCsvRoll = String(r.rollNo || '').trim().replace(/^0+/, '');
            return (cleanCsvRoll && cleanCsvRoll === cleanStRoll) ||
                (st.name && r.name && st.name.toLowerCase().trim() === r.name.toLowerCase().trim());
        });

        if (found) {
            matchedCount++;
            return {
                studentId: stId,
                rollNo: stRoll,
                name: st.name || found.name,
                fatherName: st.fatherName || '',
                marks: found.marks,
                systemTotal: found.systemTotal,
                registerGrandTotal: found.registerGrandTotal,
                lowConfidenceSubjects: found.lowConfidenceSubjects,
                sourceImageIndex: 0,
                hasAiData: false,
                isFromCsv: true
            };
        } else {
            // Student in DB but missing from CSV
            const defaultMarks = {};
            subjects.forEach(sub => { defaultMarks[sub.subjectId] = 0; });
            return {
                studentId: stId,
                rollNo: stRoll,
                name: st.name || `Student #${stRoll}`,
                fatherName: st.fatherName || '',
                marks: defaultMarks,
                systemTotal: 0,
                registerGrandTotal: 0,
                lowConfidenceSubjects: [],
                sourceImageIndex: 0,
                hasAiData: false,
                isFromCsv: false
            };
        }
    });

    return {
        roster: finalRoster,
        matchedCount,
        totalParsed: parsedCsvRows.length,
        totalClassStudents: students.length
    };
}
