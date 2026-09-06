import { db } from '../../firebase';
import { collection, doc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { getDocsFast, getDocFast } from '../../utils/cacheUtils';

// Helper: Format Currency (PKR / Rs.)
export const formatCurrency = (val) => {
    const num = Number(val) || 0;
    return 'Rs. ' + num.toLocaleString('en-PK');
};

// Helper: Normalize String for search
export const normalize = (str) => (str || '').toLowerCase().trim();

/**
 * Universal Date Parser for Firestore Transactions
 */
export const parseTxDate = (tx) => {
    if (!tx) return null;
    if (tx.timestamp?.seconds) {
        return new Date(tx.timestamp.seconds * 1000);
    }
    if (tx.timestamp?.toDate && typeof tx.timestamp.toDate === 'function') {
        return tx.timestamp.toDate();
    }
    if (tx._seconds) {
        return new Date(tx._seconds * 1000);
    }
    if (tx.dateIso) {
        const d = new Date(tx.dateIso);
        if (!isNaN(d.getTime())) return d;
    }
    if (tx.dateString) {
        const d = new Date(tx.dateString);
        if (!isNaN(d.getTime())) return d;
    }
    if (tx.date) {
        const d = new Date(tx.date);
        if (!isNaN(d.getTime())) return d;
    }
    if (tx.createdAt) {
        const d = new Date(tx.createdAt);
        if (!isNaN(d.getTime())) return d;
    }
    if (tx.paymentDate) {
        const d = new Date(tx.paymentDate);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
};

const isSameDay = (d1, d2) => {
    if (!d1 || !d2) return false;
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};

const isSameMonth = (d1, d2) => {
    if (!d1 || !d2) return false;
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth();
};

/**
 * 1. Fetch Complete Real-time School Summary Context
 */
export async function getLiveSchoolContext(schoolId) {
    if (!schoolId) return null;

    try {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const todayIso = today.toISOString().split('T')[0];
        const todayLocaleStr = today.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        const currentMonthName = today.toLocaleString('default', { month: 'long' });

        // 1. Fetch School Profile
        let schoolName = 'School';
        try {
            const profileRef = doc(db, `schools/${schoolId}/settings`, 'profile');
            const pSnap = await getDocFast(profileRef);
            if (pSnap && pSnap.exists()) {
                const pData = pSnap.data();
                schoolName = pData.name || pData.schoolName || 'School';
            }
        } catch (e) {
            console.warn('[AI Data] Profile fetch fallback:', e);
        }

        // 2. Fetch Classes & Students
        let classes = [];
        let allStudents = [];
        let totalStudentsCount = 0;
        try {
            const classesRef = collection(db, `schools/${schoolId}/classes`);
            const clsSnap = await getDocsFast(classesRef);
            
            const classPromises = clsSnap.docs.map(async (cDoc) => {
                const cData = cDoc.data();
                const clsObj = { id: cDoc.id, name: cData.name || cDoc.id, section: cData.section || '' };
                
                try {
                    const stRef = collection(db, `schools/${schoolId}/classes/${cDoc.id}/students`);
                    const stSnap = await getDocsFast(stRef);
                    const students = stSnap.docs.map(sDoc => ({
                        id: sDoc.id,
                        classId: cDoc.id,
                        className: clsObj.name,
                        ...sDoc.data()
                    }));
                    clsObj.students = students;
                    clsObj.studentCount = students.length;
                    allStudents.push(...students);
                } catch (err) {
                    clsObj.students = [];
                    clsObj.studentCount = Number(cData.students) || 0;
                }
                return clsObj;
            });

            classes = await Promise.all(classPromises);
            totalStudentsCount = allStudents.length || classes.reduce((sum, c) => sum + (c.studentCount || 0), 0);
        } catch (e) {
            console.warn('[AI Data] Classes fetch fallback:', e);
        }

        // 3. Fetch Teachers & Salaries Status
        let teachers = [];
        let payrollStats = {
            totalTeachers: 0,
            paidTeachers: 0,
            unpaidTeachers: 0,
            totalPayrollBudget: 0,
            paidAmount: 0,
            pendingAmount: 0
        };

        try {
            const teachersRef = collection(db, `schools/${schoolId}/teachers`);
            const tSnap = await getDocsFast(teachersRef);
            teachers = tSnap.docs.map(tDoc => ({ id: tDoc.id, ...tDoc.data() }));
            
            const payrollDocId = `${yyyy}_${mm}`;
            const payrollDocRef = doc(db, `schools/${schoolId}/settings`, `payroll_${payrollDocId}`);
            let payrollMeta = {};
            try {
                const paySnap = await getDocFast(payrollDocRef);
                if (paySnap && paySnap.exists()) {
                    payrollMeta = paySnap.data()?.teachers || {};
                }
            } catch (err) {}

            payrollStats.totalTeachers = teachers.length;
            teachers.forEach(t => {
                const baseSal = Number(t.salary || t.baseSalary || 0);
                payrollStats.totalPayrollBudget += baseSal;

                const meta = payrollMeta[t.id];
                if (meta && meta.isPaid) {
                    payrollStats.paidTeachers += 1;
                    payrollStats.paidAmount += Number(meta.netSalary || baseSal);
                } else {
                    payrollStats.unpaidTeachers += 1;
                    payrollStats.pendingAmount += baseSal;
                }
            });
        } catch (e) {
            console.warn('[AI Data] Teachers fetch fallback:', e);
        }

        // 4. Fetch Fee Transactions (Today & Current Month - Multi-Field Date & Offline Resilient)
        let feeStats = {
            todayCollection: 0,
            todayCount: 0,
            monthCollection: 0,
            monthCount: 0,
            recentTransactions: []
        };

        try {
            const txRef = collection(db, `schools/${schoolId}/feeTransactions`);
            const txSnap = await getDocs(txRef); // Fresh direct fetch
            const allTx = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Also check offline queue
            try {
                const offlineQueue = JSON.parse(localStorage.getItem(`offline_fee_queue_${schoolId}`) || '[]');
                if (Array.isArray(offlineQueue)) {
                    offlineQueue.forEach(qItem => {
                        if (!allTx.some(t => (t.receiptNo && t.receiptNo === qItem.receiptNo) || t.id === qItem.id)) {
                            allTx.push(qItem);
                        }
                    });
                }
            } catch (e) {}

            // Deduplicate by receiptNo or id
            const seenReceipts = new Set();
            const uniqueTx = [];
            allTx.forEach(t => {
                const key = t.receiptNo || t.id;
                if (key && !seenReceipts.has(key)) {
                    seenReceipts.add(key);
                    uniqueTx.push(t);
                } else if (!key) {
                    uniqueTx.push(t);
                }
            });

            uniqueTx.forEach(tx => {
                const amt = Number(tx.totalPaid || tx.amount || tx.paidAmount || tx.netPaid || tx.feeAmount || 0);
                const txDate = parseTxDate(tx);
                
                // Match today
                const isMatchToday = isSameDay(txDate, today) || 
                                     (tx.dateString && tx.dateString === todayLocaleStr) ||
                                     (tx.dateIso && tx.dateIso.startsWith(todayIso));

                if (isMatchToday) {
                    feeStats.todayCollection += amt;
                    feeStats.todayCount += 1;
                }

                // Match month
                const isMatchMonth = isSameMonth(txDate, today) ||
                                     (tx.month === currentMonthName && String(tx.year) === String(yyyy)) ||
                                     (tx.dateIso && tx.dateIso.startsWith(`${yyyy}-${mm}`));

                if (isMatchMonth) {
                    feeStats.monthCollection += amt;
                    feeStats.monthCount += 1;
                }
            });

            // Sort latest first
            uniqueTx.sort((a, b) => {
                const da = parseTxDate(a)?.getTime() || 0;
                const dbTime = parseTxDate(b)?.getTime() || 0;
                return dbTime - da;
            });

            feeStats.recentTransactions = uniqueTx.slice(0, 10);
        } catch (e) {
            console.warn('[AI Data] Fee Transactions fetch fallback:', e);
        }

        // 5. Fetch Exams List & Results Overview
        let exams = [];
        try {
            const examsRef = collection(db, `schools/${schoolId}/exams`);
            const exSnap = await getDocsFast(examsRef);
            exams = exSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.warn('[AI Data] Exams fetch fallback:', e);
        }

        // 6. Fetch Today Attendance
        let attendanceStats = {
            presentStudents: 0,
            absentStudents: 0,
            totalMarked: 0,
            attendanceRate: 'N/A'
        };
        try {
            const attDocRef = doc(db, `schools/${schoolId}/attendance`, todayIso);
            const attSnap = await getDocFast(attDocRef);
            if (attSnap && attSnap.exists()) {
                const attData = attSnap.data();
                const records = attData.records || attData.students || {};
                let p = 0, a = 0;
                Object.values(records).forEach(st => {
                    const s = (typeof st === 'string' ? st : st.status || '').toLowerCase();
                    if (s === 'present' || s === 'p') p++;
                    else if (s === 'absent' || s === 'a') a++;
                });
                attendanceStats.presentStudents = p;
                attendanceStats.absentStudents = a;
                attendanceStats.totalMarked = p + a;
                if (p + a > 0) {
                    attendanceStats.attendanceRate = Math.round((p / (p + a)) * 100) + '%';
                }
            }
        } catch (e) {
            console.warn('[AI Data] Attendance fetch fallback:', e);
        }

        return {
            schoolId,
            schoolName,
            date: todayIso,
            currentMonth: currentMonthName,
            year: yyyy,
            totalStudents: totalStudentsCount,
            classes,
            allStudents,
            teachers,
            payrollStats,
            feeStats,
            exams,
            attendanceStats
        };
    } catch (error) {
        console.error('[AI Data] Fatal error compiling context:', error);
        return null;
    }
}

/**
 * 2. Search specific student marks across all terms (1st, 2nd, Mid, Final)
 */
export async function getStudentMarksReport(schoolId, studentQuery) {
    if (!schoolId || !studentQuery) return null;
    const cleanQuery = normalize(studentQuery);

    try {
        const classesRef = collection(db, `schools/${schoolId}/classes`);
        const clsSnap = await getDocsFast(classesRef);
        
        let foundStudent = null;
        let matchedClass = null;

        // Find Student in classes
        for (const cDoc of clsSnap.docs) {
            const cData = cDoc.data();
            const stRef = collection(db, `schools/${schoolId}/classes/${cDoc.id}/students`);
            const stSnap = await getDocsFast(stRef);

            for (const sDoc of stSnap.docs) {
                const sData = sDoc.data();
                const name = normalize(sData.name || sData.studentName);
                const roll = normalize(sData.rollNo || sData.roll_no || sData.grNo);
                
                if (name.includes(cleanQuery) || roll === cleanQuery || sDoc.id === cleanQuery) {
                    foundStudent = { id: sDoc.id, ...sData };
                    matchedClass = { id: cDoc.id, name: cData.name || cDoc.id };
                    break;
                }
            }
            if (foundStudent) break;
        }

        if (!foundStudent || !matchedClass) {
            return { notFound: true, query: studentQuery };
        }

        // Fetch Exam Marks for this class
        const marksRef = collection(db, `schools/${schoolId}/classes/${matchedClass.id}/exam_marks`);
        const marksSnap = await getDocsFast(marksRef);

        const examResults = [];
        marksSnap.docs.forEach(mDoc => {
            const mData = mDoc.data();
            const studentsMap = mData.students || mData.records || {};
            const studentEntry = studentsMap[foundStudent.id];

            if (studentEntry) {
                const obt = Number(studentEntry.obtainedMarks || studentEntry.obtained || 0);
                const tot = Number(studentEntry.totalMarks || studentEntry.total || mData.totalMarks || 100);
                const pct = tot > 0 ? Math.round((obt / tot) * 100) : 0;
                const isPassed = pct >= 40;

                examResults.push({
                    examId: mData.examId || mDoc.id,
                    examTitle: mData.examTitle || mData.title || mData.subject || 'Term Exam',
                    subject: mData.subject || mData.subjectName || '',
                    obtainedMarks: obt,
                    totalMarks: tot,
                    percentage: pct,
                    grade: studentEntry.grade || (pct >= 80 ? 'A+' : pct >= 70 ? 'A' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : pct >= 40 ? 'D' : 'F'),
                    status: isPassed ? 'Pass' : 'Fail',
                    remarks: studentEntry.remarks || studentEntry.examinerRemarks || ''
                });
            }
        });

        return {
            notFound: false,
            student: foundStudent,
            className: matchedClass.name,
            examResults,
            isOverallPass: examResults.length > 0 ? examResults.filter(r => r.status === 'Fail').length === 0 : true
        };
    } catch (e) {
        console.error('[AI Data] Student report error:', e);
        return { error: true, message: e.message };
    }
}

/**
 * 3. Deterministic Instant Answer Generator (0 ms latency, 100% Free & Accurate)
 */
export function generateInstantAnswer(userQuestion, context, studentReport = null) {
    if (!context) {
        return "Salam Sir! Main aapke school ka live data load kar raha hoon. Barah-e-karam 1 second baad dobara poochiye.";
    }

    const q = normalize(userQuestion);

    // 1. Fee Questions
    if (q.includes('fee') || q.includes('fees') || q.includes('paisa') || q.includes('collection') || q.includes('jama')) {
        if (q.includes('aaj') || q.includes('today')) {
            return `📊 **Aaj Ki Fee Collection:**\n` +
                   `• Total Collect Hui: **${formatCurrency(context.feeStats.todayCollection)}**\n` +
                   `• Total Transactions: **${context.feeStats.todayCount} students** ne aaj fee jama karwai hai.`;
        }
        if (q.includes('mahina') || q.includes('month') || q.includes('is month') || q.includes('current month')) {
            return `📅 **${context.currentMonth} ${context.year} Fee Summary:**\n` +
                   `• Total Mahana Collection: **${formatCurrency(context.feeStats.monthCollection)}**\n` +
                   `• Total Receipts Issued: **${context.feeStats.monthCount}**\n` +
                   `• Total School Strength: **${context.totalStudents} Students** across ${context.classes.length} classes.`;
        }
        return `💳 **School Fee Overview:**\n` +
               `• Aaj Ki Collection: **${formatCurrency(context.feeStats.todayCollection)}** (${context.feeStats.todayCount} students)\n` +
               `• Is Mahinay (${context.currentMonth}) Ki Total Collection: **${formatCurrency(context.feeStats.monthCollection)}**\n` +
               `• Total Enrolled Students: **${context.totalStudents}**`;
    }

    // 2. Salary / Payroll Questions
    if (q.includes('salary') || q.includes('salaries') || q.includes('tankhwah') || q.includes('payroll') || q.includes('teacher salary')) {
        const { totalTeachers, paidTeachers, unpaidTeachers, totalPayrollBudget, paidAmount, pendingAmount } = context.payrollStats;
        return `💰 **Teachers Salary Status (${context.currentMonth} ${context.year}):**\n` +
               `• Total Teachers: **${totalTeachers}**\n` +
               `• Salary Paid: **${paidTeachers} teachers** (**${formatCurrency(paidAmount)}**)\n` +
               `• Salary Pending: **${unpaidTeachers} teachers** (**${formatCurrency(pendingAmount)}** baki hai)\n` +
               `• Total Monthly Payroll Budget: **${formatCurrency(totalPayrollBudget)}**`;
    }

    // 3. Teachers & Staff Count
    if (q.includes('teacher') || q.includes('staff') || q.includes('ustad')) {
        const listPreview = context.teachers.slice(0, 8).map((t, idx) => `${idx + 1}. ${t.name || 'Teacher'} (${t.designation || 'Faculty'})`).join('\n');
        return `👨‍🏫 **School Teachers & Staff:**\n` +
               `• Total Teachers: **${context.teachers.length}**\n` +
               (listPreview ? `\n**Kuch Teachers ki list:**\n${listPreview}` : '');
    }

    // 4. Attendance
    if (q.includes('attendance') || q.includes('hazri') || q.includes('present') || q.includes('absent')) {
        return `📋 **Aaj Ki Student Attendance (${context.date}):**\n` +
               `• Present Students: **${context.attendanceStats.presentStudents}**\n` +
               `• Absent Students: **${context.attendanceStats.absentStudents}**\n` +
               `• Overall Attendance Rate: **${context.attendanceStats.attendanceRate}**\n` +
               `• Total School Strength: **${context.totalStudents} Students**`;
    }

    // 5. Classes & Strength
    if (q.includes('class') || q.includes('strength') || q.includes('kitne bache') || q.includes('student')) {
        const classBreakdown = context.classes.map(c => `• **${c.name}**: ${c.studentCount || (c.students ? c.students.length : 0)} students`).join('\n');
        return `🏫 **School Classes & Student Strength:**\n` +
               `• Total Students: **${context.totalStudents}**\n` +
               `• Total Classes: **${context.classes.length}**\n\n` +
               `**Class-wise Details:**\n${classBreakdown || 'Koi class data mojood nahi.'}`;
    }

    // 6. Student Result / Promotion Lookup
    if (studentReport && !studentReport.notFound) {
        const { student, className, examResults, isOverallPass } = studentReport;
        const resultsText = examResults.length > 0 
            ? examResults.map(r => `• **${r.examTitle} (${r.subject || 'All Subjects'})**: ${r.obtainedMarks}/${r.totalMarks} (${r.percentage}%) - **${r.status}** (Grade: ${r.grade})`).join('\n')
            : '• Is student ke liye abhi koi term exam record nahi mila.';

        return `🎓 **Student Report Card:**\n` +
               `• **Naam:** ${student.name || student.studentName}\n` +
               `• **Roll No:** ${student.rollNo || student.grNo || 'N/A'}\n` +
               `• **Class:** ${className}\n` +
               `• **Overall Promotion Status:** ${isOverallPass ? '✅ **PROMOTED / PASS**' : '⚠️ **NEEDS IMPROVEMENT / FAILED IN SOME TERMS**'}\n\n` +
               `**Exam & Term Breakdown:**\n${resultsText}`;
    }

    // 7. General School Overview
    return `🏫 **${context.schoolName} - Quick Overview:**\n` +
           `• Total Students: **${context.totalStudents}** (${context.classes.length} Classes)\n` +
           `• Total Teachers: **${context.teachers.length}**\n` +
           `• Aaj Ki Fee Collection: **${formatCurrency(context.feeStats.todayCollection)}**\n` +
           `• Is Mahinay Ki Fee: **${formatCurrency(context.feeStats.monthCollection)}**\n` +
           `• Salary Status: **${context.payrollStats.paidTeachers}/${context.payrollStats.totalTeachers} Paid**\n\n` +
           `Aap mujh se fees, teachers ki salary, students ke exam marks, ya class strength ke bare mein kuch bhi pooch sakte hain!`;
}
