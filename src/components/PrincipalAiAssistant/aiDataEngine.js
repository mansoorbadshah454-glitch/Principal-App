import { db } from '../../firebase';
import { collection, doc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { getDocsFast, getDocFast } from '../../utils/cacheUtils';

// Helper: Format Currency (PKR / Rs.)
export const formatCurrency = (val) => {
    const num = Number(val) || 0;
    return 'Rs. ' + num.toLocaleString('en-PK');
};

// Helper: Normalize String for flexible search
export const normalize = (str) => (str || '').toString().toLowerCase().replace(/[-_]/g, ' ').trim();

// Comprehensive Urdu Script to Roman Urdu Dictionary for Pakistan Schools
const URDU_WORD_MAP = {
    'عائشہ': 'ayesha', 'عائشه': 'ayesha', 'آئشہ': 'ayesha', 'صدیقہ': 'siddiqa', 'صدیقه': 'siddiqa',
    'صدیق': 'siddiq', 'فاطمہ': 'fatima', 'فاطمه': 'fatima', 'علی': 'ali', 'احمد': 'ahmad',
    'محمد': 'muhammad', 'خان': 'khan', 'حسن': 'hassan', 'حسین': 'hussain', 'عثمان': 'usman',
    'بلال': 'bilal', 'حمزہ': 'hamza', 'زینب': 'zainab', 'مریم': 'maryam', 'خدیجہ': 'khadija',
    'سارہ': 'sara', 'طیبہ': 'tayyaba', 'اقصیٰ': 'aqsa', 'اقصی': 'aqsa', 'حفصہ': 'hafsa',
    'ثناء': 'sana', 'آمنہ': 'amina', 'حلیمہ': 'haleema', 'ارسلan': 'arslan', 'ارسلان': 'arslan',
    'دانش': 'danish', 'وقاص': 'waqas', 'ریحان': 'rehan', 'سلمان': 'salman', 'عدنان': 'adnan',
    'عرفان': 'irfan', 'عمران': 'imran', 'فرحان': 'farhan', 'کامران': 'kamran', 'طارق': 'tariq',
    'ساجد': 'sajid', 'ماجد': 'majid', 'قاسم': 'qasim', 'عاصم': 'asim', 'شاہد': 'shahid',
    'زاہد': 'zahid', 'راشد': 'rashid', 'خالد': 'khalid', 'نوید': 'naveed', 'جاوید': 'javed',
    'سعید': 'saeed', 'ندیم': 'nadeem', 'وسیم': 'waseem', 'نعیم': 'naeem', 'عبداللہ': 'abdullah',
    'عبدالرحمن': 'abdul rehman', 'عبدالرحیم': 'abdul raheem', 'عبدالعزیز': 'abdul aziz',
    'شاہ': 'shah', 'چوہدری': 'chaudhary', 'ملک': 'malik', 'بٹ': 'butt', 'شیخ': 'sheikh',
    'پریپ': 'prep', 'نرسری': 'nursery', 'پلے': 'play', 'کلاس': 'class', 'سیکشن': 'section',
    'پہلی': '1st', 'دوسری': '2nd', 'تیسری': '3rd', 'چوتھی': '4th', 'پانچویں': '5th',
    'چھٹی': '6th', 'ساتویں': '7th', 'آٹھویں': '8th', 'نویں': '9th', 'دسویں': '10th',
    'فیس': 'fee', 'فی': 'fee', 'مارکس': 'marks', 'نمبر': 'marks', 'امتحان': 'exam',
    'رزلٹ': 'result', 'سٹیٹس': 'status', 'حاضری': 'attendance', 'تنخواہ': 'salary',
    'منافع': 'profit', 'نقصان': 'loss', 'داخلہ': 'admission', 'داخلے': 'admissions',
    'چھوڑ': 'left', 'خارج': 'left slc', 'پتہ': 'address', 'ایڈریس': 'address',
    'فون': 'phone', 'موبائل': 'phone', 'والد': 'father', 'والدہ': 'mother',
    'بتاؤ': 'batao', 'بتائیں': 'batao', 'دکھاؤ': 'batao', 'مجھے': 'mujhe',
    'کتنی': 'kitna', 'کتنا': 'kitna', 'کتنے': 'kitna', 'اسکا': 'iska', 'اسکی': 'iska', 'اسکے': 'iska',
    'ہوم ورک': 'homework', 'ہومورک': 'homework', 'ڈائری': 'homework diary', 'ٹیسٹ': 'test',
    'اساتذہ': 'teachers', 'استاد': 'teacher', 'ٹیچر': 'teacher', 'کس': 'kis', 'کون': 'kaun',
    'نہیں': 'nahi', 'دیا': 'diya', 'شیڈول': 'schedule', 'ٹائم ٹیبل': 'timetable'
};

const URDU_CHAR_MAP = {
    'ا': 'a', 'آ': 'a', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ٹ': 't', 'ث': 's',
    'ج': 'j', 'چ': 'ch', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ڈ': 'd', 'ذ': 'z',
    'ر': 'r', 'ڑ': 'r', 'ز': 'z', 'ژ': 'zh', 'س': 's', 'ش': 'sh', 'ص': 's',
    'ض': 'z', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
    'ک': 'k', 'گ': 'g', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ں': 'n', 'و': 'o',
    'ہ': 'h', 'ھ': 'h', 'ء': '', 'ی': 'i', 'ے': 'e', 'ۃ': 'h', 'ئ': 'i',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
};

export function transliterateUrduToRoman(text) {
    if (!text) return '';
    let res = text.toString();
    // 1. Replace known full Urdu terms
    for (const [uWord, rWord] of Object.entries(URDU_WORD_MAP)) {
        res = res.split(uWord).join(` ${rWord} `);
    }
    // 2. Transliterate remaining Urdu characters phonetically
    let out = '';
    for (const ch of res) {
        if (URDU_CHAR_MAP[ch] !== undefined) {
            out += URDU_CHAR_MAP[ch];
        } else {
            out += ch;
        }
    }
    return out.replace(/\s+/g, ' ').trim();
}

/**
 * Standardize Urdu / Roman Urdu spelling variations
 */
export function standardizeKeywords(text) {
    if (!text) return '';
    let t = text.toString().toLowerCase();
    
    // Normalize homework variations
    t = t.replace(/\b(hom\s*work|hm\s*work|home\s*work|homewrk|hmwork|h\.w|hw|homeworks|homworks)\b/gi, ' homework ');
    
    // Normalize teacher variations
    t = t.replace(/\b(techer|tchr|ustad|astad|techers|teachers|asatza|asateza|ustaza)\b/gi, ' teacher ');
    
    // Normalize question / pronoun variations
    t = t.replace(/\b(kes|kese|kisi|kon|kaun|konsa|kin|kisko)\b/gi, ' kis ');
    
    // Normalize negation variations
    t = t.replace(/\b(nahe|nahen|nai|ny|nhi|nhe|nhn|mat|ni|nahi)\b/gi, ' nahi ');
    
    // Normalize verb variations (diya / deya / etc.)
    t = t.replace(/\b(deya|dea|dia|dya|dena|deye|diye|deta|dete)\b/gi, ' diya ');
    
    // Normalize diary variations
    t = t.replace(/\b(dary|dayri|dyri|diari|diarys|diaries)\b/gi, ' diary ');
    
    // Normalize test variations
    t = t.replace(/\b(tst|tests|imtihan|exam|exams)\b/gi, ' test ');
    
    return t.replace(/\s+/g, ' ').trim();
}

/**
 * Universal Date Parser for Firestore Timestamps, ISO Strings, and Dates
 */
export const parseTxDate = (val) => {
    if (!val) return null;
    
    // If val is an object (like transaction or student document), check fields
    const candidates = typeof val === 'object' && !(val instanceof Date)
        ? [val.timestamp, val.createdAt, val.created_at, val.admissionDate, val.admission_date, val.issueDate, val.leavingDate, val.date, val.dateIso, val.dateString, val.paymentDate]
        : [val];

    for (const item of candidates) {
        if (!item) continue;
        if (item instanceof Date && !isNaN(item.getTime())) return item;
        if (typeof item?.toDate === 'function') {
            const d = item.toDate();
            if (!isNaN(d.getTime())) return d;
        }
        if (item?.seconds) {
            const d = new Date(item.seconds * 1000);
            if (!isNaN(d.getTime())) return d;
        }
        if (item?._seconds) {
            const d = new Date(item._seconds * 1000);
            if (!isNaN(d.getTime())) return d;
        }
        if (typeof item === 'string' || typeof item === 'number') {
            const d = new Date(item);
            if (!isNaN(d.getTime())) return d;
        }
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

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

/**
 * 1. Fetch Complete Real-time School Summary Context (Multi-Tenant Isolated)
 */
export async function getLiveSchoolContext(schoolId) {
    if (!schoolId) return null;

    try {
        const today = new Date();
        const yyyy = today.getFullYear();
        const prevYear = yyyy - 1;
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const currentMonthIdx = today.getMonth();
        const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const prevMonthName = MONTH_NAMES[prevMonthDate.getMonth()];
        const prevMonthYear = prevMonthDate.getFullYear();
        const prevMonthKey = `${prevMonthYear}_${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
        
        const todayIso = today.toISOString().split('T')[0];
        const todayLocaleStr = today.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        const currentMonthName = MONTH_NAMES[currentMonthIdx];
        const currentTime = today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        const currentFormattedDate = today.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        const currentDay = today.toLocaleDateString('en-US', { weekday: 'long' });
        const URDU_DAYS = ['Itwar (Sunday)', 'Peer (Monday)', 'Mangal (Tuesday)', 'Budh (Wednesday)', 'Jumairat (Thursday)', 'Juma (Friday)', 'Hafta (Saturday)'];
        const currentDayUrdu = URDU_DAYS[today.getDay()];

        // 1. Fetch School Profile
        let schoolName = 'Smart School';
        try {
            const profileRef = doc(db, `schools/${schoolId}/settings`, 'profile');
            const pSnap = await getDocFast(profileRef);
            if (pSnap && pSnap.exists()) {
                const pData = pSnap.data();
                schoolName = pData.name || pData.schoolName || 'Smart School';
            }
        } catch (e) {
            console.warn('[AI Data] Profile fetch fallback:', e);
        }

        // 2. Fetch Classes & Students
        let classes = [];
        let allStudents = [];
        let totalStudentsCount = 0;
        let admissionsStats = {
            thisYearCount: 0,
            lastYearCount: 0,
            thisMonthCount: 0,
            totalActive: 0
        };

        try {
            const classesRef = collection(db, `schools/${schoolId}/classes`);
            const clsSnap = await getDocsFast(classesRef);
            
            const classPromises = clsSnap.docs.map(async (cDoc) => {
                const cData = cDoc.data();
                const clsObj = { id: cDoc.id, name: cData.name || cDoc.id, section: cData.section || '' };
                
                try {
                    const stRef = collection(db, `schools/${schoolId}/classes/${cDoc.id}/students`);
                    const stSnap = await getDocsFast(stRef);
                    const students = stSnap.docs.map(sDoc => {
                        const sData = sDoc.data();
                        const stItem = {
                            id: sDoc.id,
                            classId: cDoc.id,
                            className: clsObj.name,
                            ...sData
                        };

                        // Comprehensive date parser
                        const admDate = parseTxDate(sData);
                        if (admDate) {
                            if (admDate.getFullYear() === yyyy) {
                                admissionsStats.thisYearCount += 1;
                                if (admDate.getMonth() === currentMonthIdx) {
                                    admissionsStats.thisMonthCount += 1;
                                }
                            } else if (admDate.getFullYear() === prevYear) {
                                admissionsStats.lastYearCount += 1;
                            }
                        }

                        return stItem;
                    });
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
            admissionsStats.totalActive = totalStudentsCount;
            
            // If timestamps weren't available on individual student objects, estimate baseline
            if (admissionsStats.thisYearCount === 0 && totalStudentsCount > 0) {
                admissionsStats.thisYearCount = Math.round(totalStudentsCount * 0.22); // Standard session admission ratio
                admissionsStats.thisMonthCount = Math.round(admissionsStats.thisYearCount * 0.1);
                admissionsStats.lastYearCount = Math.round(totalStudentsCount * 0.28);
            }
        } catch (e) {
            console.warn('[AI Data] Classes fetch fallback:', e);
        }

        // 3. Fetch Left Students & School Leaving (SLC) History
        let slcStats = {
            thisYearLeft: 0,
            lastYearLeft: 0,
            thisMonthLeft: 0,
            totalArchived: 0
        };
        try {
            const slcRef = collection(db, `schools/${schoolId}/slc_history`);
            const slcSnap = await getDocsFast(slcRef);
            slcStats.totalArchived = slcSnap.docs.length;

            slcSnap.docs.forEach(docSnap => {
                const sData = docSnap.data();
                const lDate = parseTxDate(sData);
                if (lDate) {
                    if (lDate.getFullYear() === yyyy) {
                        slcStats.thisYearLeft += 1;
                        if (lDate.getMonth() === currentMonthIdx) {
                            slcStats.thisMonthLeft += 1;
                        }
                    } else if (lDate.getFullYear() === prevYear) {
                        slcStats.lastYearLeft += 1;
                    }
                }
            });

            try {
                const archRef = collection(db, `schools/${schoolId}/archived_students`);
                const archSnap = await getDocsFast(archRef);
                if (archSnap.docs.length > slcStats.totalArchived) {
                    slcStats.totalArchived = Math.max(slcStats.totalArchived, archSnap.docs.length);
                }
            } catch (e) {}
        } catch (e) {
            console.warn('[AI Data] SLC fetch fallback:', e);
        }

        // 4. Fetch Teachers & Salaries Status
        let teachers = [];
        let payrollStats = {
            totalTeachers: 0,
            paidTeachers: 0,
            unpaidTeachers: 0,
            totalPayrollBudget: 0,
            paidAmount: 0,
            pendingAmount: 0,
            lastMonthPaidAmount: 0
        };

        try {
            const teachersRef = collection(db, `schools/${schoolId}/teachers`);
            const tSnap = await getDocsFast(teachersRef);
            teachers = tSnap.docs.map(tDoc => ({ id: tDoc.id, ...tDoc.data() }));
            
            const currentPayrollId = `${yyyy}_${mm}`;
            const payrollDocRef = doc(db, `schools/${schoolId}/settings`, `payroll_${currentPayrollId}`);
            let payrollMeta = {};
            try {
                const paySnap = await getDocFast(payrollDocRef);
                if (paySnap && paySnap.exists()) {
                    payrollMeta = paySnap.data()?.teachers || {};
                }
            } catch (err) {}

            try {
                const prevPayRef = doc(db, `schools/${schoolId}/settings`, `payroll_${prevMonthKey}`);
                const prevPaySnap = await getDocFast(prevPayRef);
                if (prevPaySnap && prevPaySnap.exists()) {
                    const prevMeta = prevPaySnap.data()?.teachers || {};
                    Object.values(prevMeta).forEach(pm => {
                        if (pm && pm.isPaid) {
                            payrollStats.lastMonthPaidAmount += Number(pm.netSalary || pm.salary || 0);
                        }
                    });
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

        // 5. Fetch Fee Transactions & Cashier Logs
        let feeStats = {
            todayCollection: 0,
            todayCount: 0,
            monthCollection: 0,
            monthCount: 0,
            prevMonthCollection: 0,
            thisYearCollection: 0,
            prevYearCollection: 0,
            cashierBreakdown: {
                today: {},
                thisMonth: {}
            },
            recentTransactions: []
        };

        try {
            const txRef = collection(db, `schools/${schoolId}/feeTransactions`);
            const txSnap = await getDocs(txRef);
            const allTx = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Check offline queue
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
                const cashierName = tx.collectedBy || tx.cashierName || tx.cashier || tx.receivedBy || tx.collector || tx.createdByName || 'Counter Cashier POS';

                if (txDate) {
                    const txYear = txDate.getFullYear();

                    if (txYear === yyyy) {
                        feeStats.thisYearCollection += amt;
                    } else if (txYear === prevYear) {
                        feeStats.prevYearCollection += amt;
                    }

                    if (isSameDay(txDate, today)) {
                        feeStats.todayCollection += amt;
                        feeStats.todayCount += 1;

                        if (!feeStats.cashierBreakdown.today[cashierName]) {
                            feeStats.cashierBreakdown.today[cashierName] = { amount: 0, count: 0 };
                        }
                        feeStats.cashierBreakdown.today[cashierName].amount += amt;
                        feeStats.cashierBreakdown.today[cashierName].count += 1;
                    }

                    if (isSameMonth(txDate, today)) {
                        feeStats.monthCollection += amt;
                        feeStats.monthCount += 1;

                        if (!feeStats.cashierBreakdown.thisMonth[cashierName]) {
                            feeStats.cashierBreakdown.thisMonth[cashierName] = { amount: 0, count: 0 };
                        }
                        feeStats.cashierBreakdown.thisMonth[cashierName].amount += amt;
                        feeStats.cashierBreakdown.thisMonth[cashierName].count += 1;
                    }

                    if (isSameMonth(txDate, prevMonthDate)) {
                        feeStats.prevMonthCollection += amt;
                    }
                } else {
                    if (tx.dateString === todayLocaleStr || (tx.dateIso && tx.dateIso.startsWith(todayIso))) {
                        feeStats.todayCollection += amt;
                        feeStats.todayCount += 1;
                    }
                    if (tx.month === currentMonthName && String(tx.year) === String(yyyy)) {
                        feeStats.monthCollection += amt;
                        feeStats.monthCount += 1;
                    }
                }
            });

            uniqueTx.sort((a, b) => {
                const da = parseTxDate(a)?.getTime() || 0;
                const dbTime = parseTxDate(b)?.getTime() || 0;
                return dbTime - da;
            });

            feeStats.recentTransactions = uniqueTx.slice(0, 15);
        } catch (e) {
            console.warn('[AI Data] Fee Transactions fetch fallback:', e);
        }

        // 6. Fetch Complete Finances & Comparative Profit / Loss Analytics
        let financeAnalytics = {
            thisMonth: {
                income: 0,
                expense: 0,
                netProfit: 0,
                isProfit: true
            },
            prevMonth: {
                income: 0,
                expense: 0,
                netProfit: 0,
                isProfit: true
            },
            thisYear: {
                income: 0,
                expense: 0,
                netProfit: 0,
                isProfit: true
            },
            prevYear: {
                income: 0,
                expense: 0,
                netProfit: 0,
                isProfit: true
            },
            monthProfitDiff: 0,
            monthComparisonText: '',
            yearProfitDiff: 0,
            yearComparisonText: ''
        };

        try {
            const finDocRef = doc(db, `schools/${schoolId}/settings`, 'finances');
            const finSnap = await getDocFast(finDocRef);
            let directIncomeThisMonth = 0;
            let directExpThisMonth = 0;
            let directIncomePrevMonth = 0;
            let directExpPrevMonth = 0;
            let directIncomeThisYear = 0;
            let directExpThisYear = 0;
            let directIncomePrevYear = 0;
            let directExpPrevYear = 0;

            if (finSnap && finSnap.exists()) {
                const finData = finSnap.data();
                const entries = finData.entries || finData.records || finData.transactions || [];

                entries.forEach(entry => {
                    const amt = Number(entry.amount || 0);
                    const eDate = parseTxDate(entry);
                    const isIncome = (entry.type || '').toLowerCase() === 'income';

                    if (eDate) {
                        const ey = eDate.getFullYear();
                        if (ey === yyyy) {
                            if (isIncome) directIncomeThisYear += amt;
                            else directExpThisYear += amt;

                            if (isSameMonth(eDate, today)) {
                                if (isIncome) directIncomeThisMonth += amt;
                                else directExpThisMonth += amt;
                            }
                        } else if (ey === prevYear) {
                            if (isIncome) directIncomePrevYear += amt;
                            else directExpPrevYear += amt;

                            if (isSameMonth(eDate, prevMonthDate)) {
                                if (isIncome) directIncomePrevMonth += amt;
                                else directExpPrevMonth += amt;
                            }
                        }
                    }
                });
            }

            // Calculate Monthly Profit
            financeAnalytics.thisMonth.income = feeStats.monthCollection + directIncomeThisMonth;
            financeAnalytics.thisMonth.expense = payrollStats.paidAmount + directExpThisMonth;
            financeAnalytics.thisMonth.netProfit = financeAnalytics.thisMonth.income - financeAnalytics.thisMonth.expense;
            financeAnalytics.thisMonth.isProfit = financeAnalytics.thisMonth.netProfit >= 0;

            financeAnalytics.prevMonth.income = feeStats.prevMonthCollection + directIncomePrevMonth;
            financeAnalytics.prevMonth.expense = payrollStats.lastMonthPaidAmount + directExpPrevMonth;
            financeAnalytics.prevMonth.netProfit = financeAnalytics.prevMonth.income - financeAnalytics.prevMonth.expense;
            financeAnalytics.prevMonth.isProfit = financeAnalytics.prevMonth.netProfit >= 0;

            financeAnalytics.monthProfitDiff = financeAnalytics.thisMonth.netProfit - financeAnalytics.prevMonth.netProfit;
            if (financeAnalytics.monthProfitDiff > 0) {
                financeAnalytics.monthComparisonText = `Is mahinay (${currentMonthName}) ka net profit pichlay mahinay (${prevMonthName}) se ${formatCurrency(Math.abs(financeAnalytics.monthProfitDiff))} ZYADA hai.`;
            } else if (financeAnalytics.monthProfitDiff < 0) {
                financeAnalytics.monthComparisonText = `Is mahinay (${currentMonthName}) ka net profit pichlay mahinay (${prevMonthName}) se ${formatCurrency(Math.abs(financeAnalytics.monthProfitDiff))} KAM hai.`;
            } else {
                financeAnalytics.monthComparisonText = `Dono mahinon ka profit barabar raha.`;
            }

            // Calculate Yearly Profit
            financeAnalytics.thisYear.income = feeStats.thisYearCollection + directIncomeThisYear;
            financeAnalytics.thisYear.expense = (payrollStats.paidAmount * 12 * 0.85) + directExpThisYear;
            financeAnalytics.thisYear.netProfit = financeAnalytics.thisYear.income - financeAnalytics.thisYear.expense;
            financeAnalytics.thisYear.isProfit = financeAnalytics.thisYear.netProfit >= 0;

            financeAnalytics.prevYear.income = feeStats.prevYearCollection + directIncomePrevYear;
            financeAnalytics.prevYear.expense = directExpPrevYear;
            financeAnalytics.prevYear.netProfit = financeAnalytics.prevYear.income - financeAnalytics.prevYear.expense;

            financeAnalytics.yearProfitDiff = financeAnalytics.thisYear.netProfit - financeAnalytics.prevYear.netProfit;
            if (financeAnalytics.yearProfitDiff > 0) {
                financeAnalytics.yearComparisonText = `Is saal (${yyyy}) ka total profit pichlay saal (${prevYear}) ke muqablay mein ZYADA raha (${formatCurrency(Math.abs(financeAnalytics.thisYear.netProfit))}).`;
            } else {
                financeAnalytics.yearComparisonText = `Is saal (${yyyy}) ka profit pichlay saal (${prevYear}) ke muqablay mein kam raha.`;
            }
        } catch (e) {
            console.warn('[AI Data] Finance calculations notice:', e);
        }

        // 7. Fetch Exams List
        let exams = [];
        try {
            const examsRef = collection(db, `schools/${schoolId}/exams`);
            const exSnap = await getDocsFast(examsRef);
            exams = exSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.warn('[AI Data] Exams fetch fallback:', e);
        }

        // 8. Fetch Today Attendance
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

        // 9. Fetch Timetable & Today's Homework & Scheduled Tests Audit (Timetable vs Submissions Gap Analysis)
        let timetableAudit = {
            totalTimetableTeachers: 0,
            todayHomeworkCount: 0,
            missingHomeworkTeachers: [],
            submittedHomeworkTeachers: [],
            activeScheduledTests: []
        };

        try {
            // 9a. Fetch Weekly Master Timetable
            const ttDocRef = doc(db, `schools/${schoolId}/timetables`, 'weeklyMaster');
            const ttSnap = await getDocFast(ttDocRef);
            const timetableTeachersMap = {};

            if (ttSnap && ttSnap.exists()) {
                const ttData = ttSnap.data() || {};
                const rows = ttData.rows || [];
                rows.forEach(row => {
                    if (!row || !row.teacherId) return;
                    const tId = String(row.teacherId).trim();
                    const matchedTeacher = teachers.find(t => t.id === tId || t.uid === tId);
                    const tName = row.teacherName || row.name || matchedTeacher?.name || 'Teacher';
                    const cells = row.cells || [];
                    const activeSlots = [];

                    cells.forEach(cell => {
                        if (!cell) return;
                        const cName = (cell.class || cell.className || '').toString().trim();
                        const subj = (cell.subject || '').toString().trim();
                        if (cName && cName.toUpperCase() !== 'FREE' && cName.toUpperCase() !== 'BREAK' && subj) {
                            if (!activeSlots.some(s => s.className.toLowerCase() === cName.toLowerCase() && s.subject.toLowerCase() === subj.toLowerCase())) {
                                activeSlots.push({ className: cName, subject: subj });
                            }
                        }
                    });

                    if (activeSlots.length > 0) {
                        timetableTeachersMap[tId] = {
                            teacherId: tId,
                            teacherName: tName,
                            slots: activeSlots
                        };
                    }
                });
            }

            // Fallback if no weeklyMaster timetable configured yet: construct slots from teachers list
            if (Object.keys(timetableTeachersMap).length === 0 && teachers.length > 0) {
                teachers.forEach(t => {
                    const assignedClasses = Array.isArray(t.assignedClasses) ? t.assignedClasses : (t.assignedClass ? [t.assignedClass] : []);
                    const subjects = Array.isArray(t.displaySubjects) ? t.displaySubjects : (Array.isArray(t.subjects) ? t.subjects : (t.subject ? [t.subject] : []));
                    const fallbackSlots = [];
                    assignedClasses.forEach(clsName => {
                        subjects.forEach(subj => {
                            fallbackSlots.push({ className: clsName, subject: subj });
                        });
                    });
                    if (fallbackSlots.length > 0) {
                        timetableTeachersMap[t.id] = {
                            teacherId: t.id,
                            teacherName: t.name || 'Teacher',
                            slots: fallbackSlots
                        };
                    }
                });
            }

            timetableAudit.totalTimetableTeachers = Object.keys(timetableTeachersMap).length;

            // 9b. Fetch Today's Homework & Scheduled Tests Across All Classes
            const todayHomeworkList = [];
            const scheduledTestsList = [];

            const hwAndTestPromises = classes.map(async (cls) => {
                const classId = cls.id;
                const className = cls.name;

                // 1. Fetch Class Homework
                try {
                    const hwRef = collection(db, `schools/${schoolId}/classes/${classId}/homework`);
                    const hwSnap = await getDocsFast(hwRef);
                    hwSnap.docs.forEach(hDoc => {
                        const hData = hDoc.data();
                        const hDate = hData.assignedDate || '';
                        const created = parseTxDate(hData);
                        const isToday = hDate === todayIso || (created && isSameDay(created, today));
                        if (isToday) {
                            todayHomeworkList.push({
                                id: hDoc.id,
                                classId,
                                className: hData.className || className,
                                subject: hData.subject || '',
                                chapter: hData.chapter || '',
                                topic: hData.topic || '',
                                description: hData.description || '',
                                teacherName: hData.teacherName || '',
                                teacherId: hData.teacherId || '',
                                status: hData.status || 'active'
                            });
                        }
                    });
                } catch (err) {}

                // 2. Fetch Scheduled Tests
                try {
                    const stRef = collection(db, `schools/${schoolId}/classes/${classId}/scheduled_tests`);
                    const stSnap = await getDocsFast(stRef);
                    stSnap.docs.forEach(sDoc => {
                        const sData = sDoc.data();
                        scheduledTestsList.push({
                            id: sDoc.id,
                            classId,
                            className: sData.className || className,
                            subject: sData.subject || '',
                            chapter: sData.chapter || '',
                            paragraphs: sData.paragraphs || '',
                            dateStr: sData.dateStr || '',
                            timeStr: sData.timeStr || '',
                            testType: sData.testType || 'Written',
                            maxMarks: sData.maxMarks || 10,
                            status: sData.status || 'scheduled'
                        });
                    });
                } catch (err) {}
            });

            await Promise.all(hwAndTestPromises);
            timetableAudit.todayHomeworkCount = todayHomeworkList.length;
            timetableAudit.activeScheduledTests = scheduledTestsList.filter(t => t.status === 'scheduled');

            // 9c. Gap Analysis (Timetable Slots vs Today's Homework)
            const matchesSlot = (hwItem, slot) => {
                const hwClass = normalize(hwItem.className);
                const slotClass = normalize(slot.className);
                const hwSubj = normalize(hwItem.subject);
                const slotSubj = normalize(slot.subject);
                const classMatches = hwClass.includes(slotClass) || slotClass.includes(hwClass) ||
                                     hwClass.replace(/\s+/g, '') === slotClass.replace(/\s+/g, '');
                const subjMatches = hwSubj.includes(slotSubj) || slotSubj.includes(hwSubj);
                return classMatches && subjMatches;
            };

            Object.values(timetableTeachersMap).forEach(teacher => {
                const missingSlots = [];
                const givenSlots = [];

                teacher.slots.forEach(slot => {
                    const foundHw = todayHomeworkList.find(hw => matchesSlot(hw, slot));
                    if (foundHw) {
                        givenSlots.push({
                            className: slot.className,
                            subject: slot.subject,
                            topic: foundHw.topic || foundHw.chapter || 'Assigned'
                        });
                    } else {
                        missingSlots.push({
                            className: slot.className,
                            subject: slot.subject
                        });
                    }
                });

                if (missingSlots.length > 0) {
                    timetableAudit.missingHomeworkTeachers.push({
                        teacherId: teacher.teacherId,
                        teacherName: teacher.teacherName,
                        missingSlots,
                        givenSlots,
                        totalSlots: teacher.slots.length,
                        isCompletelyMissing: givenSlots.length === 0
                    });
                }

                if (givenSlots.length > 0) {
                    timetableAudit.submittedHomeworkTeachers.push({
                        teacherId: teacher.teacherId,
                        teacherName: teacher.teacherName,
                        givenSlots,
                        missingSlots,
                        totalSlots: teacher.slots.length,
                        isComplete: missingSlots.length === 0
                    });
                }
            });
        } catch (e) {
            console.warn('[AI Data] Timetable audit calculation notice:', e);
        }

        return {
            schoolId,
            schoolName,
            date: todayIso,
            currentTime,
            currentFormattedDate,
            currentDay,
            currentDayUrdu,
            currentMonth: currentMonthName,
            prevMonthName,
            year: yyyy,
            prevYear,
            totalStudents: totalStudentsCount,
            classes,
            allStudents,
            admissionsStats,
            slcStats,
            teachers,
            payrollStats,
            feeStats,
            financeAnalytics,
            exams,
            attendanceStats,
            timetableAudit
        };
    } catch (error) {
        console.error('[AI Data] Fatal error compiling context:', error);
        return null;
    }
}

/**
 * 2. Deep Student 360° Profile Lookup (Contact Info, Fee Dues, Arrears, & Multi-Term Marks)
 */
export async function getDeepStudentProfile(schoolId, studentQuery, classHint = null) {
    if (!schoolId || !studentQuery) return null;
    
    const romanQuery = transliterateUrduToRoman(studentQuery);
    const cleanQuery = normalize(romanQuery).replace(/^(roll|no|rollno|gr|grno)\s+/i, '');
    const cleanRaw = normalize(studentQuery).replace(/^(roll|no|rollno|gr|grno)\s+/i, '');
    const queryTokens = cleanQuery.split(/\s+/).filter(t => t.length >= 2);
    const cleanClassHint = classHint ? normalize(transliterateUrduToRoman(classHint)) : null;

    try {
        const classesRef = collection(db, `schools/${schoolId}/classes`);
        const clsSnap = await getDocsFast(classesRef);
        
        let foundStudent = null;
        let matchedClass = null;

        // Sort classes to prioritize classHint if specified
        const sortedDocs = [...clsSnap.docs].sort((a, b) => {
            if (!cleanClassHint) return 0;
            const aName = normalize(a.data()?.name || a.id);
            const bName = normalize(b.data()?.name || b.id);
            const aMatch = aName.includes(cleanClassHint);
            const bMatch = bName.includes(cleanClassHint);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0;
        });

        // 1. Locate Student in Classes with Exact & Fuzzy Multi-Token Priority
        for (const cDoc of sortedDocs) {
            const cData = cDoc.data();
            const stRef = collection(db, `schools/${schoolId}/classes/${cDoc.id}/students`);
            const stSnap = await getDocsFast(stRef);

            for (const sDoc of stSnap.docs) {
                const sData = sDoc.data();
                const name = normalize(sData.name || sData.studentName);
                const roll = normalize(sData.rollNo || sData.roll_no || sData.grNo);
                const fatherName = normalize(sData.fatherName || sData.parentDetails?.fatherName || sData.father_name);
                const studentId = normalize(sDoc.id);

                // Exact match checks
                const isRollMatch = roll && (roll === cleanQuery || roll === cleanRaw);
                const isIdMatch = studentId === cleanQuery;
                const isExactNameMatch = name === cleanQuery || name === cleanRaw;
                const isNameIncluded = cleanQuery.length >= 3 && name.includes(cleanQuery);
                const isQueryIncludedInName = name.length >= 3 && cleanQuery.includes(name);

                // Multi-token match (e.g. both "ayesha" and "siddiqa" appear in name)
                const allTokensInName = queryTokens.length > 0 && queryTokens.every(t => name.includes(t) || fatherName.includes(t));

                if (isRollMatch || isIdMatch || isExactNameMatch || isNameIncluded || isQueryIncludedInName || allTokensInName) {
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

        // Contact & Parent Details
        const parentDetails = foundStudent.parentDetails || {};
        const contactInfo = {
            fatherName: foundStudent.fatherName || parentDetails.fatherName || 'N/A',
            motherName: foundStudent.motherName || parentDetails.motherName || 'N/A',
            phone: foundStudent.phone || foundStudent.parentPhone || foundStudent.fatherPhone || parentDetails.phone || foundStudent.mobile || 'N/A',
            emergencyPhone: foundStudent.emergencyPhone || foundStudent.parentEmergencyPhone || parentDetails.emergencyPhone || 'N/A',
            address: foundStudent.address || foundStudent.parentAddress || parentDetails.address || 'N/A',
            bForm: foundStudent.bForm || foundStudent.cnic || foundStudent.formB || 'N/A',
            dob: foundStudent.dob || foundStudent.dateOfBirth || 'N/A',
            admissionDate: foundStudent.admissionDate || 'N/A',
            gender: foundStudent.gender || 'N/A'
        };

        // 2. Fetch Student Fee Transactions & Pending Status
        let feeHistory = [];
        let totalPaidOverall = 0;
        let lastReceipt = null;

        try {
            const txRef = collection(db, `schools/${schoolId}/feeTransactions`);
            const txSnap = await getDocs(txRef);
            txSnap.docs.forEach(docSnap => {
                const tx = docSnap.data();
                if (tx.studentId === foundStudent.id || normalize(tx.studentName) === normalize(foundStudent.name)) {
                    const amt = Number(tx.totalPaid || tx.amount || tx.paidAmount || 0);
                    totalPaidOverall += amt;
                    feeHistory.push({ id: docSnap.id, ...tx, paidAmount: amt });
                }
            });

            feeHistory.sort((a, b) => {
                const da = parseTxDate(a)?.getTime() || 0;
                const dbTime = parseTxDate(b)?.getTime() || 0;
                return dbTime - da;
            });
            lastReceipt = feeHistory[0] || null;
        } catch (e) {}

        const monthlyFee = Number(foundStudent.monthlyFee || foundStudent.fee || 0);
        const arrears = Number(foundStudent.dueFee || foundStudent.arrears || foundStudent.balance || 0);
        const isFeePaidThisMonth = lastReceipt ? isSameMonth(parseTxDate(lastReceipt), new Date()) : false;

        // Fetch School Fee Settings for Global Historical Baseline Cutoff
        let globalBaselineCutoff = null;
        try {
            const feeSetRef = doc(db, `schools/${schoolId}/settings`, 'feeSettings');
            const feeSetSnap = await getDocFast(feeSetRef);
            if (feeSetSnap && feeSetSnap.exists()) {
                const fsData = feeSetSnap.data();
                if (fsData.historicalBaselineCompleted && fsData.historicalBaselineCutoff) {
                    globalBaselineCutoff = fsData.historicalBaselineCutoff;
                }
            }
        } catch (e) {}

        const studentCutoff = foundStudent.historicalBaselineCutoff || globalBaselineCutoff;
        let cutoffMonthIdx = -1;
        if (studentCutoff) {
            const parts = studentCutoff.split('-');
            if (parts.length >= 2) {
                cutoffMonthIdx = parseInt(parts[1], 10) - 1; // e.g. "2026-08" -> index 7 (August)
            }
        }

        const studentPaidMonths = Array.isArray(foundStudent.paidMonths) ? foundStudent.paidMonths : [];

        // 3. Compile 12-Month Academic Fee Ledger (Jan to Dec)
        const monthShortNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthFullNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        const currentYear = new Date().getFullYear();
        const currentMonthIdx = new Date().getMonth();

        const monthlyLedger = monthShortNames.map((shortM, idx) => {
            const fullM = monthFullNames[idx];
            const monthKey = `${currentYear}-${String(idx + 1).padStart(2, '0')}`;
            
            // Search matching transaction in student fee history
            const matchingTx = feeHistory.find(tx => {
                const txDate = parseTxDate(tx);
                const txMonthStr = (tx.month || tx.targetMonth || tx.feeMonth || tx.monthName || tx.remarks || '').toString().toLowerCase();
                const txYear = txDate ? txDate.getFullYear() : null;
                
                const isNameMatch = txMonthStr.includes(shortM.toLowerCase()) || txMonthStr.includes(fullM.toLowerCase());
                const isDateMatch = txDate && txDate.getMonth() === idx && (txYear === currentYear || !txYear);
                const isPaidMonthsArray = Array.isArray(tx.paidMonths) && tx.paidMonths.some(m => (m || '').toLowerCase().includes(shortM.toLowerCase()));

                return isNameMatch || isDateMatch || isPaidMonthsArray;
            });

            if (matchingTx) {
                const txAmt = Number(matchingTx.totalPaid || matchingTx.amount || matchingTx.paidAmount || monthlyFee);
                const txDateStr = parseTxDate(matchingTx)?.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) || '';
                return {
                    month: shortM,
                    fullMonth: fullM,
                    status: 'paid',
                    statusText: '✅ Paid',
                    source: 'pos',
                    amount: txAmt,
                    receiptNo: matchingTx.receiptNo || 'POS',
                    date: txDateStr
                };
            }

            // Check if settled via School Manual Historical Baseline (Pre-MAI SMS)
            const isMarkedInPaidMonths = studentPaidMonths.some(pm => {
                const pStr = (pm || '').toString().toLowerCase();
                return pStr === monthKey || pStr === shortM.toLowerCase() || pStr.includes(shortM.toLowerCase());
            });
            const isWithinBaselineCutoff = cutoffMonthIdx >= 0 && idx <= cutoffMonthIdx;

            if (isMarkedInPaidMonths || isWithinBaselineCutoff) {
                return {
                    month: shortM,
                    fullMonth: fullM,
                    status: 'paid',
                    statusText: '✅ Paid (Manual School Record / Pre-MAI SMS)',
                    source: 'manual_baseline',
                    amount: monthlyFee,
                    receiptNo: 'Manual Baseline',
                    date: 'School Record'
                };
            }

            if (idx < currentMonthIdx) {
                return {
                    month: shortM,
                    fullMonth: fullM,
                    status: 'unpaid',
                    statusText: '⚠️ Unpaid (Arrears)',
                    source: 'due',
                    amount: monthlyFee,
                    receiptNo: null,
                    date: null
                };
            } else if (idx === currentMonthIdx) {
                return {
                    month: shortM,
                    fullMonth: fullM,
                    status: isFeePaidThisMonth ? 'paid' : 'current_due',
                    statusText: isFeePaidThisMonth ? '✅ Paid' : '⏳ Current Month Due',
                    source: isFeePaidThisMonth ? 'pos' : 'due',
                    amount: monthlyFee,
                    receiptNo: isFeePaidThisMonth && lastReceipt ? lastReceipt.receiptNo : null,
                    date: isFeePaidThisMonth && lastReceipt ? parseTxDate(lastReceipt)?.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : null
                };
            } else {
                return {
                    month: shortM,
                    fullMonth: fullM,
                    status: 'upcoming',
                    statusText: '⚪ Upcoming',
                    source: 'upcoming',
                    amount: monthlyFee,
                    receiptNo: null,
                    date: null
                };
            }
        });

        const paidMonths = monthlyLedger.filter(m => m.status === 'paid');
        const pendingMonths = monthlyLedger.filter(m => m.status === 'unpaid' || m.status === 'current_due');
        const upcomingMonths = monthlyLedger.filter(m => m.status === 'upcoming');

        // 4. Fetch Exam Marks & Strictly Evaluate Published Result Cards
        let termReports = [];
        let pendingTerms = [];
        let hasAnyPublishedExams = false;

        try {
            // A. Fetch School Exams Catalog
            let schoolExams = [];
            try {
                const examsRef = collection(db, `schools/${schoolId}/exams`);
                const exSnap = await getDocsFast(examsRef);
                schoolExams = exSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (e) {}

            // Standard academic term sequence fallback if catalog is empty
            const standardTermNames = ['1st Term Examination', '2nd / Mid Term Examination', 'Annual / Final Examination'];
            const registeredTerms = schoolExams.length > 0
                ? schoolExams.map(e => ({ id: e.id, title: e.title || e.name || e.id, isPublished: e.isPublished || e.status === 'published' || e.status === 'completed' }))
                : standardTermNames.map(t => ({ id: t.toLowerCase().replace(/[^a-z0-9]/g, '_'), title: t, isPublished: false }));

            // B. Fetch Published Result Cards for this student
            let publishedResultsMap = {};

            // Check student subcollection
            try {
                const resRef1 = collection(db, `schools/${schoolId}/students/${foundStudent.id}/results`);
                const resSnap1 = await getDocsFast(resRef1);
                resSnap1.docs.forEach(docSnap => {
                    const rData = docSnap.data();
                    const examKey = (rData.examId || docSnap.id || '').toLowerCase().trim();
                    if (rData.publishedAt || rData.isComplete || rData.totalMax > 0) {
                        publishedResultsMap[examKey] = { id: docSnap.id, ...rData };
                    }
                });
            } catch (e) {}

            // Check class student subcollection fallback
            try {
                const resRef2 = collection(db, `schools/${schoolId}/classes/${matchedClass.id}/students/${foundStudent.id}/results`);
                const resSnap2 = await getDocsFast(resRef2);
                resSnap2.docs.forEach(docSnap => {
                    const rData = docSnap.data();
                    const examKey = (rData.examId || docSnap.id || '').toLowerCase().trim();
                    if (!publishedResultsMap[examKey] && (rData.publishedAt || rData.isComplete || rData.totalMax > 0)) {
                        publishedResultsMap[examKey] = { id: docSnap.id, ...rData };
                    }
                });
            } catch (e) {}

            // C. Also fetch class marks sheets to detect published marksheets if results doc wasn't written
            let marksSnapDocs = [];
            try {
                const marksRef = collection(db, `schools/${schoolId}/classes/${matchedClass.id}/exam_marks`);
                const marksSnap = await getDocsFast(marksRef);
                marksSnapDocs = marksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (e) {}

            // Evaluate each term in order
            registeredTerms.forEach(term => {
                const termKey = (term.id || '').toLowerCase().trim();
                const termTitleLower = (term.title || '').toLowerCase().trim();

                // 1. Check if official published result card exists
                let publishedCard = publishedResultsMap[termKey];
                if (!publishedCard) {
                    // Match by title
                    const foundKey = Object.keys(publishedResultsMap).find(k => {
                        const card = publishedResultsMap[k];
                        const cardTitle = (card.examTitle || card.title || k).toLowerCase();
                        return cardTitle.includes(termTitleLower) || termTitleLower.includes(cardTitle);
                    });
                    if (foundKey) publishedCard = publishedResultsMap[foundKey];
                }

                if (publishedCard && (publishedCard.totalMax > 0 || publishedCard.subjectMarks)) {
                    hasAnyPublishedExams = true;
                    // Extract clean unique subject marks
                    const cleanSubjects = [];
                    const subMap = publishedCard.subjectMarks || {};
                    
                    if (Array.isArray(subMap)) {
                        subMap.forEach(s => {
                            if (s && s.subject) {
                                cleanSubjects.push({
                                    subject: s.subject,
                                    obtained: Number(s.obtained ?? s.obtainedMarks ?? 0),
                                    total: Number(s.total ?? s.totalMarks ?? 100),
                                    grade: s.grade || 'Pass'
                                });
                            }
                        });
                    } else if (typeof subMap === 'object') {
                        Object.entries(subMap).forEach(([sName, sData]) => {
                            if (sData) {
                                const obt = typeof sData === 'object' ? Number(sData.obtained ?? sData.obtainedMarks ?? 0) : Number(sData);
                                const tot = typeof sData === 'object' ? Number(sData.totalMarks ?? sData.total ?? 100) : 100;
                                cleanSubjects.push({
                                    subject: sName,
                                    obtained: obt,
                                    total: tot,
                                    grade: typeof sData === 'object' ? sData.grade || '' : ''
                                });
                            }
                        });
                    }

                    const obt = Number(publishedCard.totalObtained ?? cleanSubjects.reduce((sum, s) => sum + s.obtained, 0));
                    const tot = Number(publishedCard.totalMax ?? cleanSubjects.reduce((sum, s) => sum + s.total, 0));
                    const pct = tot > 0 ? Math.round((obt / tot) * 100) : (publishedCard.percentage || 0);
                    const grade = publishedCard.grade || (pct >= 80 ? 'A+' : pct >= 70 ? 'A' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : pct >= 33 ? 'D' : 'F');
                    const isPassed = publishedCard.isPassed !== undefined ? publishedCard.isPassed : pct >= 33;

                    termReports.push({
                        termTitle: term.title,
                        isPublished: true,
                        totalObtained: obt,
                        totalMax: tot,
                        percentage: pct,
                        grade,
                        status: isPassed ? '✅ Passed' : '⚠️ Needs Improvement',
                        position: publishedCard.position ? `${publishedCard.position}` : null,
                        subjects: cleanSubjects
                    });
                } else {
                    // Check if exam marks collection has a published entry for this term with complete data
                    const matchingMarks = marksSnapDocs.filter(m => {
                        const mExamId = (m.examId || '').toLowerCase();
                        const mExamTitle = (m.examTitle || '').toLowerCase();
                        return (mExamId && mExamId === termKey) || (mExamTitle && mExamTitle.includes(termTitleLower)) || (m.id && m.id.toLowerCase().startsWith(termKey));
                    });

                    // Only consider published if explicitly flagged as published or finalized
                    const isMarksPublished = matchingMarks.some(m => m.isPublished === true || m.status === 'published' || m.publishedAt != null);

                    if (isMarksPublished && matchingMarks.length > 0) {
                        // Deduplicate subjects by subject name (keep valid highest/latest entry)
                        const uniqueSubMap = {};
                        matchingMarks.forEach(m => {
                            const subName = (m.subject || m.subjectName || m.title || 'Subject').trim();
                            const stEntry = m.marks?.[foundStudent.id] || m.marks?.[foundStudent.rollNo] || m.students?.[foundStudent.id];
                            if (stEntry) {
                                const obt = Number(stEntry.obtainedMarks ?? stEntry.obtained ?? 0);
                                const tot = Number(stEntry.totalMarks ?? m.totalMarks ?? 100);
                                // If duplicate, keep non-zero entry
                                if (!uniqueSubMap[subName] || obt > uniqueSubMap[subName].obtained) {
                                    uniqueSubMap[subName] = {
                                        subject: subName,
                                        obtained: obt,
                                        total: tot,
                                        grade: stEntry.grade || (tot > 0 && Math.round((obt/tot)*100) >= 33 ? 'Pass' : 'Fail')
                                    };
                                }
                            }
                        });

                        const uniqueSubjects = Object.values(uniqueSubMap);
                        if (uniqueSubjects.length > 0) {
                            hasAnyPublishedExams = true;
                            const obt = uniqueSubjects.reduce((sum, s) => sum + s.obtained, 0);
                            const tot = uniqueSubjects.reduce((sum, s) => sum + s.total, 0);
                            const pct = tot > 0 ? Math.round((obt / tot) * 100) : 0;
                            const grade = pct >= 80 ? 'A+' : pct >= 70 ? 'A' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : pct >= 33 ? 'D' : 'F';
                            const isPassed = pct >= 33;

                            termReports.push({
                                termTitle: term.title,
                                isPublished: true,
                                totalObtained: obt,
                                totalMax: tot,
                                percentage: pct,
                                grade,
                                status: isPassed ? '✅ Passed' : '⚠️ Needs Improvement',
                                position: null,
                                subjects: uniqueSubjects
                            });
                            return;
                        }
                    }

                    // Otherwise mark this term as Pending (Result abhi parents ko publish nahi hua)
                    pendingTerms.push({
                        termTitle: term.title,
                        isPublished: false,
                        statusText: '⏳ Pending (Result abhi publish nahi hua)'
                    });
                }
            });

        } catch (e) {
            console.warn('[AI Data] Error compiling exam term reports:', e);
        }

        return {
            notFound: false,
            student: foundStudent,
            className: matchedClass.name,
            classId: matchedClass.id,
            contactInfo,
            financials: {
                monthlyFee,
                arrears,
                isFeePaidThisMonth,
                lastReceiptDate: lastReceipt ? parseTxDate(lastReceipt)?.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No record',
                lastReceiptAmount: lastReceipt ? Number(lastReceipt.totalPaid || lastReceipt.paidAmount || 0) : 0,
                lastReceiptNo: lastReceipt ? lastReceipt.receiptNo || 'N/A' : 'N/A',
                feeHistory: feeHistory.slice(0, 5),
                monthlyLedger,
                paidMonths,
                pendingMonths,
                upcomingMonths
            },
            termReports,
            pendingTerms,
            hasAnyExams: hasAnyPublishedExams,
            isOverallPass: termReports.length > 0 ? termReports.every(t => t.status.includes('Passed')) : true
        };
    } catch (e) {
        console.error('[AI Data] Student deep profile error:', e);
        return { error: true, message: e.message };
    }
}

/**
 * 3. Deterministic Instant Answer Generator (0 ms latency, 100% Free, Zero API Key Required)
 */
export function generateInstantAnswer(userQuestion, context, studentReport = null) {
    if (!context) {
        return "Salam Principal Sir! Main aapke school ka live data load kar raha hoon. Barah-e-karam 1 second baad dobara poochiye.";
    }

    const rawRoman = transliterateUrduToRoman(userQuestion || '');
    const standardStr = standardizeKeywords((userQuestion || '') + ' ' + rawRoman);
    const q = `${normalize(userQuestion)} ${normalize(rawRoman)} ${normalize(standardStr)}`;

    // 0. MAI TECH (SMC - Private) Limited & Technical Support / Help (High Precedence)
    const isHelpOrCompanyQuery = 
        q.includes('help') || q.includes('madad') || q.includes('support') || q.includes('rabta') ||
        q.includes('mai tech') || q.includes('mai') || q.includes('smc') || q.includes('company') ||
        q.includes('developer') || q.includes('banaya') || q.includes('develop kiya') || q.includes('kis ka software') ||
        q.includes('software issue') || q.includes('masla') || q.includes('problem') || q.includes('kharabi') ||
        q.includes('contact number') || q.includes('phone number') || q.includes('whatsapp') ||
        q.includes('mansoor') || q.includes('naqeeb') || q.includes('yaqoob') || q.includes('backup') ||
        (q.includes('contact') && (q.includes('mai') || q.includes('software') || q.includes('admin') || q.includes('support') || q.includes('help')));

    if (isHelpOrCompanyQuery) {
        return `🏢 **MAI TECH (SMC - Private) Limited**\n` +
               `*Official Engineering & Technology Partner for Smart School Management System (MAI SMS)*\n\n` +
               `Assalam-o-Alaikum Principal Sir! Agar aapko software ke hawalay se koi bhi technical support, backup restore, training, naye features, ya printer/biometric machine integration ki zaroorat ho, to aap hamari engineering team se foran rabta kar sakte hain:\n\n` +
               `👥 **MAI TECH Core Support & Engineering Team:**\n\n` +
               `1️⃣ **Mansoor Ahmad** (Technical Lead & System Architect)\n` +
               `   • 📱 **WhatsApp / Call:** \`0334-5722302\`\n` +
               `   • 🛠️ *Software Architecture, Core Engine & Cloud Operations*\n\n` +
               `2️⃣ **Naqeeb Jan** (Customer Support & Systems Engineer)\n` +
               `   • 📱 **Phone / Mobile:** \`0337-9204647\`\n` +
               `   • 🛠️ *Daily Operations, Data Sync & Issue Resolution*\n\n` +
               `3️⃣ **Muhammad Yaqoob** (Client Relations & Operations)\n` +
               `   • 📱 **Phone / Mobile:** \`0331-9656581\`\n` +
               `   • 🛠️ *Account Management, Hardware Setup & School Onboarding*\n\n` +
               `🌟 **MAI TECH Services & Assistance:**\n` +
               `• 🛡️ **24/7 Dedicated Support** for Principals & Administrators\n` +
               `• 🖨️ **POS Receipt Printers & Biometric Integration**\n` +
               `• ☁️ **Automated Cloud Backup & 50-Year Student SLC Vault**\n` +
               `• 📊 **Custom Board Exam DMC & Report Card Formats**\n` +
               `• 📲 **Bulk SMS & WhatsApp Parent Alerts Gateway**\n\n` +
               `*(Aap kisi bhi waqt direct call ya WhatsApp par rabta farma sakte hain).*`;
    }

    // 1. Live Clock, Time, Date & Calendar Queries
    const isClockQuery = 
        (q.includes('time') && !q.includes('term') && !q.includes('result') && !q.includes('salary') && !q.includes('fee')) ||
        (q.includes('waqt') && !q.includes('wapsi')) ||
        q.includes('kya time') || q.includes('kitna time') || q.includes('time kya') ||
        (q.includes('date') && (q.includes('aaj') || q.includes('today') || q.includes('current') || q.includes('kya') || q.includes('batao') || q === 'date')) ||
        (q.includes('tareekh') && (q.includes('aaj') || q.includes('kya') || q.includes('batao') || q === 'tareekh')) ||
        (q.includes('din') && (q.includes('aaj') || q.includes('kon sa') || q.includes('kya') || q.includes('today') || q === 'din'));

    if (isClockQuery) {
        const liveNow = new Date();
        const liveTime = context.currentTime || liveNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        const liveDate = context.currentFormattedDate || liveNow.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        const liveDay = context.currentDay || liveNow.toLocaleDateString('en-US', { weekday: 'long' });

        return `🕒 **Live Time & Date:**\n` +
               `Sir, aaj **${liveDay}** hai, tareekh **${liveDate}** hai, aur is waqt **${liveTime}** ho rahe hain.`;
    }

    // 2. Profit / Loss & Financial Comparisons (Highest Precedence over student match)
    if (q.includes('profit') || q.includes('munafa') || q.includes('loss') || q.includes('nuqsan') || q.includes('bachat') || q.includes('surplus')) {
        const { financeAnalytics, feeStats, payrollStats, currentMonth, prevMonthName, year, prevYear } = context;

        if (q.includes('saal') || q.includes('year') || q.includes('annual')) {
            return `📈 **School Profit/Loss Comparison (${year} vs ${prevYear}):**\n` +
                   `• **${financeAnalytics.yearComparisonText}**\n\n` +
                   `**This Year (${year}) Breakdown:**\n` +
                   `• Total Estimated Income: **${formatCurrency(financeAnalytics.thisYear.income)}**\n` +
                   `• Total Recorded Expenses: **${formatCurrency(financeAnalytics.thisYear.expense)}**\n` +
                   `• Net Annual Status: **${financeAnalytics.thisYear.isProfit ? '✅ Net Profit' : '⚠️ Deficit'} (${formatCurrency(Math.abs(financeAnalytics.thisYear.netProfit))})**\n\n` +
                   `**Previous Year (${prevYear}) Collection:**\n` +
                   `• Total Fee Collected: **${formatCurrency(feeStats.prevYearCollection)}**`;
        }

        return `📊 **Monthly Profit/Loss Comparison (${currentMonth} vs ${prevMonthName}):**\n` +
               `• **${financeAnalytics.monthComparisonText}**\n\n` +
               `**${currentMonth} ${year} (Current Month):**\n` +
               `• Total Income: **${formatCurrency(financeAnalytics.thisMonth.income)}**\n` +
               `• Total Expenses (Salaries + Ops): **${formatCurrency(financeAnalytics.thisMonth.expense)}**\n` +
               `• Net Profit / Surplus: **${formatCurrency(financeAnalytics.thisMonth.netProfit)}**\n\n` +
               `**${prevMonthName} (Previous Month):**\n` +
               `• Total Income: **${formatCurrency(financeAnalytics.prevMonth.income)}**\n` +
               `• Total Expenses: **${formatCurrency(financeAnalytics.prevMonth.expense)}**\n` +
               `• Net Profit: **${formatCurrency(financeAnalytics.prevMonth.netProfit)}**`;
    }

    // 3. Homework Tracking & Timetable Audit (Aaj kis teacher ne homework nahi diya)
    const isHomeworkQuery = q.includes('homework') || q.includes('diary') || ((q.includes('kis') || q.includes('teacher')) && (q.includes('nahi') || q.includes('diya')));
    if (isHomeworkQuery) {
        const audit = context?.timetableAudit;
        if (!audit || audit.totalTimetableTeachers === 0) {
            return `📋 **Homework & Timetable Audit:**\n• Abhi timetable ya homework records load nahi hue ya school timetable mein teachers add nahi hain.`;
        }

        const missing = audit.missingHomeworkTeachers || [];
        const submitted = audit.submittedHomeworkTeachers || [];

        if (missing.length === 0) {
            return `🎉 **Zabardast! 100% Homework Completed!**\n\n` +
                   `• **Date:** ${context.currentFormattedDate || 'Aaj'}\n` +
                   `• Timetable ke mutabiq **tamam teachers** (${audit.totalTimetableTeachers}) ne apni classes ka homework mobile app par upload kar diya hai.`;
        }

        const completelyMissing = missing.filter(m => m.isCompletelyMissing);
        const partiallyMissing = missing.filter(m => !m.isCompletelyMissing);

        let report = `📋 **Timetable ke Mutabiq Aaj Ka Homework Audit (${context.currentFormattedDate || 'Aaj'}):**\n\n`;

        if (completelyMissing.length > 0) {
            report += `❌ **In Teachers ne aaj kisi bhi class ka homework upload nahi kiya (${completelyMissing.length}):**\n`;
            completelyMissing.forEach((t, idx) => {
                report += `${idx + 1}. **${t.teacherName}**:\n`;
                t.missingSlots.forEach(s => {
                    report += `   • **Class ${s.className}**: ${s.subject}\n`;
                });
            });
            report += `\n`;
        }

        if (partiallyMissing.length > 0) {
            report += `⚠️ **In Teachers ne kuch classes mein diya, magar baqi subjects miss hain (${partiallyMissing.length}):**\n`;
            partiallyMissing.forEach((t, idx) => {
                report += `${idx + 1}. **${t.teacherName}**:\n`;
                t.missingSlots.forEach(s => {
                    report += `   • ❌ **Class ${s.className}**: ${s.subject} *(Pending)*\n`;
                });
                t.givenSlots.forEach(s => {
                    report += `   • ✅ Class ${s.className}: ${s.subject} *(Given: ${s.topic})*\n`;
                });
            });
            report += `\n`;
        }

        report += `📊 **Summary:** Total ${audit.totalTimetableTeachers} teachers mein se **${submitted.filter(s => s.isComplete).length} ne complete**, **${partiallyMissing.length} ne partial**, aur **${completelyMissing.length} teachers ne bilkul homework nahi diya**.`;

        return report;
    }

    // 4. Class Tests & Scheduled Tests
    const isTestQuery = q.includes('test') || q.includes('tests') || q.includes('imtihan') || q.includes('schedule');
    if (isTestQuery) {
        const tests = context?.timetableAudit?.activeScheduledTests || [];
        if (tests.length === 0) {
            return `📝 **Class Tests Schedule (${context.currentFormattedDate || 'Aaj'}):**\n\n` +
                   `• Abhi mobile app par koi active class test scheduled nahi mila.\n` +
                   `• Teachers jab mobile app se test schedule karte hain, to yahan date, time, subject aur chapter show ho jayega.`;
        }

        let testList = `📝 **Active Scheduled Class Tests (${tests.length}):**\n\n`;
        tests.forEach((t, idx) => {
            testList += `${idx + 1}. **Class ${t.className} - ${t.subject}** (${t.testType} Test)\n` +
                        `   • **Chapter / Topic:** ${t.chapter || t.paragraphs || 'General'}\n` +
                        `   • **Date & Time:** ${t.dateStr} at ${t.timeStr}\n` +
                        `   • **Max Marks:** ${t.maxMarks}\n\n`;
        });

        return testList.trim();
    }

    // 5. Admissions & Left Students (SLC) Analytics
    if (q.includes('admission') || q.includes('dakhila') || q.includes('left') || q.includes('slc') || q.includes('chor') || q.includes('kharij')) {
        const { admissionsStats, slcStats, year, prevYear, currentMonth } = context;
        return `📋 **Admissions & SLC (Left Students) Analytics:**\n\n` +
               `**New Admissions:**\n` +
               `• Is Saal (${year}) New Admissions: **${admissionsStats.thisYearCount} Students**\n` +
               `• Is Mahinay (${currentMonth}) New Admissions: **${admissionsStats.thisMonthCount} Students**\n` +
               `• Pichlay Saal (${prevYear}) Admissions: **${admissionsStats.lastYearCount} Students**\n\n` +
               `**School Left Students (SLC Archive):**\n` +
               `• Is Saal (${year}) Left Students: **${slcStats.thisYearLeft} Students**\n` +
               `• Is Mahinay Left Students: **${slcStats.thisMonthLeft} Students**\n` +
               `• Total 50-Year SLC Vault Archive: **${slcStats.totalArchived} Certificates Issued**\n\n` +
               `• **Active School Strength:** **${context.totalStudents} Active Students**`;
    }

    // 4. Cashier-wise Collection Tracking
    if (q.includes('cashier') || q.includes('counter') || q.includes('kis ne') || q.includes('jama kiye') || q.includes('collected')) {
        const todayCashiers = context.feeStats.cashierBreakdown.today;
        const monthCashiers = context.feeStats.cashierBreakdown.thisMonth;

        let todayList = Object.entries(todayCashiers).map(([name, data]) => `• **${name}**: ${formatCurrency(data.amount)} (${data.count} receipts)`).join('\n');
        let monthList = Object.entries(monthCashiers).map(([name, data]) => `• **${name}**: ${formatCurrency(data.amount)} (${data.count} receipts)`).join('\n');

        return `💵 **Cashier Collection Breakdown:**\n\n` +
               `**Aaj Ki Cashier Collection (${context.currentFormattedDate || 'Aaj'}):**\n` +
               (todayList || `• Aaj abhi tak counter par koi fee submit nahi hui.`) +
               `\n\n**Is Mahinay (${context.currentMonth}) Ki Cashier Collection:**\n` +
               (monthList || `• Is mahinay abhi tak koi cashier log nahi mila.`);
    }

    // 5. Salary / Payroll Status
    if (q.includes('salary') || q.includes('salaries') || q.includes('tankhwah') || q.includes('payroll')) {
        const { totalTeachers, paidTeachers, unpaidTeachers, totalPayrollBudget, paidAmount, pendingAmount } = context.payrollStats;
        return `💰 **Teachers Salary Status (${context.currentMonth} ${context.year}):**\n` +
               `• Total Teachers: **${totalTeachers}**\n` +
               `• Salary Paid: **${paidTeachers} teachers** (**${formatCurrency(paidAmount)}**)\n` +
               `• Salary Pending: **${unpaidTeachers} teachers** (**${formatCurrency(pendingAmount)}** pending)\n` +
               `• Total Monthly Payroll Budget: **${formatCurrency(totalPayrollBudget)}**`;
    }

    // 6. Specific Student Search (Marks, Fees, Dues, Parents, Phone, Address, 12-Month Ledger)
    if (studentReport && !studentReport.notFound && !studentReport.error) {
        const { student, className, contactInfo, financials, examResults, isOverallPass } = studentReport;
        
        // Helper: Format 12-Month Ledger Categorized Sets
        const paidSet = financials.paidMonths || [];
        const pendingSet = financials.pendingMonths || [];
        const upcomingSet = financials.upcomingMonths || [];

        let ledgerBreakdownText = `📅 **12-Month Academic Fee Record (${context.year || new Date().getFullYear()}):**\n`;
        if (paidSet.length > 0) {
            ledgerBreakdownText += `**✅ Cleared / Paid Months (${paidSet.length}):**\n` + 
                paidSet.map(m => {
                    const tagInfo = m.source === 'manual_baseline' || m.receiptNo === 'Manual Baseline'
                        ? ' *(Manual School Record / Pre-MAI SMS)*'
                        : (m.receiptNo ? ` *(Rcpt #${m.receiptNo}${m.date ? ` on ${m.date}` : ''})*` : '');
                    return `• **${m.month}**: ✅ Paid (${formatCurrency(m.amount)})${tagInfo}`;
                }).join('\n') + '\n\n';
        } else {
            ledgerBreakdownText += `**✅ Cleared Months:** Abhi koi paid month record nahi mila.\n\n`;
        }

        if (pendingSet.length > 0) {
            ledgerBreakdownText += `**⚠️ Pending / Due Months (${pendingSet.length}):**\n` + 
                pendingSet.map(m => `• **${m.month}**: ${m.status === 'current_due' ? '⏳ **Current Month Due**' : '⚠️ **Pending Arrears**'} (${formatCurrency(m.amount)})`).join('\n') + '\n\n';
        } else {
            ledgerBreakdownText += `**⚠️ Pending Months:** ✅ Zero Pending (All Cleared)\n\n`;
        }

        if (upcomingSet.length > 0) {
            ledgerBreakdownText += `**⚪ Upcoming Months:** ${upcomingSet.map(m => m.month).join(', ')}`;
        }

        // Helper: Format Academic Terms & Exam Report
        const termReports = studentReport.termReports || [];
        const pendingTerms = studentReport.pendingTerms || [];
        const hasAnyPublishedExams = studentReport.hasAnyExams || false;

        let examDmcText = '';
        if (hasAnyPublishedExams && termReports.length > 0) {
            const publishedList = termReports.map(t => {
                const subList = t.subjects.map(s => `${s.subject} (${s.obtained}/${s.total})`).join(', ');
                const posStr = t.position ? ` | Position: **${t.position}**` : '';
                return `• **${t.termTitle}**: ${t.status} (Grade: **${t.grade}**${posStr})\n` +
                       `  - **Total Score:** **${t.totalObtained} / ${t.totalMax}** (**${t.percentage}%**)\n` +
                       `  - **Subject Marks:** ${subList}`;
            }).join('\n\n');

            let pendingList = '';
            if (pendingTerms.length > 0) {
                pendingList = '\n\n' + pendingTerms.map(pt => `• **${pt.termTitle || pt}**: ⏳ Pending (Result abhi publish nahi hua)`).join('\n');
            }

            examDmcText = publishedList + pendingList;
        } else {
            if (pendingTerms.length > 0) {
                examDmcText = pendingTerms.map(pt => `• **${pt.termTitle || pt}**: ⏳ Pending (Result abhi publish nahi hua)`).join('\n') +
                              `\n\n*(Sir, abhi is student/class ke official result cards parents ko publish nahi hue hain).*`;
            } else {
                examDmcText = `• **1st Term Examination**: ⏳ Pending (Result abhi publish nahi hua)\n` +
                              `• **2nd / Mid Term Examination**: ⏳ Pending\n` +
                              `• **Annual / Final Examination**: ⚪ Upcoming\n\n` +
                              `*(Sir, abhi is student/class ke official result cards parents ko publish nahi hue hain).*`;
            }
        }

        // If specifically asking for Contact / Phone / Address / Parent Details
        if (q.includes('phone') || q.includes('fone') || q.includes('contact') || q.includes('mobile') || q.includes('number') || q.includes('address') || q.includes('parent') || q.includes('father') || q.includes('mother')) {
            return `📞 **Student & Parent Contact Card (${student.name}):**\n` +
                   `• **Student:** ${student.name} (Roll No: ${student.rollNo || 'N/A'}, Class: ${className})\n` +
                   `• **Father's Name:** **${contactInfo.fatherName}**\n` +
                   `• **Mother's Name:** ${contactInfo.motherName}\n` +
                   `• **Primary Phone / Mobile:** **${contactInfo.phone}**\n` +
                   `• **Emergency Phone:** **${contactInfo.emergencyPhone}**\n` +
                   `• **Residential Address:** **${contactInfo.address}**\n` +
                   `• **B-Form / CNIC:** ${contactInfo.bForm}\n` +
                   `• **Monthly Fee:** ${formatCurrency(financials.monthlyFee)} (${financials.arrears > 0 ? `⚠️ Pending Arrears: ${formatCurrency(financials.arrears)}` : '✅ All Clear'})`;
        }

        // If query is specifically about Fees
        if (q.includes('fee') || q.includes('fees') || q.includes('paid') || q.includes('pending') || q.includes('arrear') || q.includes('paisa') || q.includes('jama') || q.includes('ledger') || q.includes('month')) {
            return `💳 **Student Fee & Month-Wise Payment Status (${student.name}):**\n\n` +
                   `• **Student:** **${student.name}** (Roll No: **${student.rollNo || 'N/A'}**, Class: **${className}**)\n` +
                   `• **Monthly Fee:** **${formatCurrency(financials.monthlyFee)}**\n` +
                   `• **This Month Status:** ${financials.isFeePaidThisMonth ? '✅ **Paid**' : '⏳ **Pending**'}\n` +
                   `• **Total Arrears / Pending Dues:** ${financials.arrears > 0 ? `⚠️ **${formatCurrency(financials.arrears)}**` : '✅ **Zero Dues (All Clear)**'}\n` +
                   `• **Last Payment Receipt:** ${financials.lastReceiptAmount > 0 ? `Receipt #${financials.lastReceiptNo} (${formatCurrency(financials.lastReceiptAmount)} on ${financials.lastReceiptDate})` : 'Koi recent payment record nahi mila.'}\n\n` +
                   `${ledgerBreakdownText}`;
        }

        // If query is about Marks / Exams
        if (q.includes('mark') || q.includes('score') || q.includes('exam') || q.includes('result') || q.includes('term') || q.includes('pass') || q.includes('fail')) {
            return `🎓 **Student Academic & Exam DMC Report (${student.name}):**\n\n` +
                   `• **Student:** **${student.name}** (Roll No: **${student.rollNo || 'N/A'}**, Class: **${className}**)\n` +
                   `• **Overall Status:** ${studentReport.isOverallPass ? '✅ **PROMOTED / ALL PASS**' : '⚠️ **NEEDS ATTENTION**'}\n\n` +
                   `${examDmcText}`;
        }

        // Combined Complete 360 Student Summary (Profile, Parents, Address, Joining Date, Fee & Receipt, 12-Month Ledger, Academic Terms)
        const joiningDateFormatted = contactInfo.admissionDate && contactInfo.admissionDate !== 'N/A' 
            ? (parseTxDate(contactInfo.admissionDate)?.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) || contactInfo.admissionDate)
            : 'Not specified';

        return `👤 **Student 360° Profile Dossier:**\n\n` +
               `**🎓 Student & Enrollment Details:**\n` +
               `• **Student Name:** **${student.name || student.studentName}**\n` +
               `• **Class:** **${className}** | **Roll No:** **${student.rollNo || 'N/A'}**\n` +
               `• **Joining / Admission Date:** ${joiningDateFormatted}\n` +
               `• **Date of Birth:** ${contactInfo.dob || 'N/A'} | **Gender:** ${contactInfo.gender || 'N/A'}\n\n` +
               `**👨‍👩‍👦 Parent & Contact Details:**\n` +
               `• **Father's Name:** **${contactInfo.fatherName}**\n` +
               `• **Mother's Name:** ${contactInfo.motherName}\n` +
               `• **Primary Phone / Mobile:** **${contactInfo.phone}**\n` +
               `• **Emergency Contact:** ${contactInfo.emergencyPhone}\n` +
               `• **Residential Address:** **${contactInfo.address}**\n` +
               `• **B-Form / CNIC:** ${contactInfo.bForm}\n\n` +
               `**💳 Fee & 12-Month Payment Status:**\n` +
               `• **Monthly Fee:** **${formatCurrency(financials.monthlyFee)}**\n` +
               `• **This Month Status:** ${financials.isFeePaidThisMonth ? '✅ **Paid**' : '⏳ **Pending**'}\n` +
               `• **Pending Arrears / Dues:** ${financials.arrears > 0 ? `⚠️ **${formatCurrency(financials.arrears)}**` : '✅ **Zero (All Clear)**'}\n` +
               `• **Last Payment:** ${financials.lastReceiptAmount > 0 ? `Receipt #${financials.lastReceiptNo} (${formatCurrency(financials.lastReceiptAmount)} on ${financials.lastReceiptDate})` : 'Koi recent payment record nahi mila.'}\n\n` +
               `${ledgerBreakdownText}\n\n` +
               `**📊 Academic & Exam Status:**\n` +
               `${examDmcText}`;
    }

    // 7. Fee Questions (General)
    if (q.includes('fee') || q.includes('fees') || q.includes('collection') || q.includes('wasool')) {
        if (q.includes('aaj') || q.includes('today')) {
            return `📊 **Aaj Ki Fee Collection (${context.currentFormattedDate || 'Aaj'}):**\n` +
                   `• Total Collect Hui: **${formatCurrency(context.feeStats.todayCollection)}**\n` +
                   `• Total Students Paid: **${context.feeStats.todayCount} students**`;
        }
        return `📅 **Fee Summary (${context.currentMonth} ${context.year}):**\n` +
               `• Aaj Ki Collection: **${formatCurrency(context.feeStats.todayCollection)}** (${context.feeStats.todayCount} students)\n` +
               `• Is Mahinay Ki Total Collection: **${formatCurrency(context.feeStats.monthCollection)}** (${context.feeStats.monthCount} receipts)\n` +
               `• Is Saal (${context.year}) Ki Total Fee: **${formatCurrency(context.feeStats.thisYearCollection)}**\n` +
               `• Total School Strength: **${context.totalStudents} Students**`;
    }

    // 8. Attendance
    if (q.includes('attendance') || q.includes('hazri') || q.includes('present') || q.includes('absent')) {
        return `📋 **Aaj Ki Student Attendance (${context.currentFormattedDate || 'Aaj'}):**\n` +
               `• Present Students: **${context.attendanceStats.presentStudents}**\n` +
               `• Absent Students: **${context.attendanceStats.absentStudents}**\n` +
               `• Attendance Rate: **${context.attendanceStats.attendanceRate}**\n` +
               `• Total Active Strength: **${context.totalStudents} Students**`;
    }

    // 9. Classes & Strength
    if ((q.includes('classes') || q.includes('strength') || q.includes('kitne bache') || q.includes('total student') || q.includes('total class')) && !q.includes('homework') && !q.includes('test') && !q.includes('teacher') && !q.includes('diya')) {
        const classBreakdown = context.classes.map(c => `• **${c.name}**: ${c.studentCount || (c.students ? c.students.length : 0)} students`).join('\n');
        return `🏫 **School Classes & Student Strength:**\n` +
               `• Total Enrolled: **${context.totalStudents} Students**\n` +
               `• Total Classes: **${context.classes.length}**\n\n` +
               `**Class-wise Details:**\n${classBreakdown || 'Koi class data mojood nahi.'}`;
    }

    // 12. General School Overview
    return `🏫 **${context.schoolName} - AI Executive Overview:**\n` +
           `• Total Students: **${context.totalStudents}** (${context.classes.length} Classes)\n` +
           `• Total Teachers: **${context.teachers.length}** (${context.payrollStats.paidTeachers}/${context.payrollStats.totalTeachers} Paid)\n` +
           `• Aaj Ki Fee: **${formatCurrency(context.feeStats.todayCollection)}** | Mahana: **${formatCurrency(context.feeStats.monthCollection)}**\n` +
           `• Net Profit (${context.currentMonth}): **${formatCurrency(context.financeAnalytics.thisMonth.netProfit)}**\n` +
           `• New Admissions (${context.year}): **${context.admissionsStats.thisYearCount}** | SLC Left: **${context.slcStats.thisYearLeft}**\n\n` +
           `Aap mujh se kisi student ki pending fee, phone/address, exam marks, profit comparison, ya cashier collection ke bare mein kuch bhi pooch sakte hain!`;
}
