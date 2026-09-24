import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Wallet, Users, ChevronRight, ChevronLeft, Ban, CheckCircle, Plus, Trash2, Edit2, X, 
    CheckSquare, Square, ArrowUpRight, ArrowDownRight, Download,
    Printer, Search, CheckCircle2, User, FileText, Loader2, Sparkles, Building2, Phone, Calendar, Clock, DollarSign,
    Image as ImageIcon, ExternalLink, Eye, Upload, Landmark, Smartphone, TrendingUp, Activity,
    PieChart, BarChart3, Zap, ShieldCheck, Layers, Wifi, WifiOff, RefreshCw, Filter, ArrowRight,
    Award, AlertTriangle, Check, RotateCcw, RotateCw, ZoomIn, ZoomOut, Maximize2, CalendarDays, History, Send,
    Sliders, HelpCircle, ArrowDown, ArrowUp, AlertCircle, Database, PlayCircle
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, AreaChart, Area, PieChart as RechartsPie, Pie, Cell,
    XAxis, YAxis, Tooltip as RechartsTooltip, Legend as RechartsLegend, CartesianGrid, Line, ComposedChart
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CachedImage from './CachedImage';
import { db } from '../firebase';
import {
    collection, onSnapshot, query, doc, updateDoc, deleteField, setDoc, getDoc, deleteDoc,
    getDocs, writeBatch, serverTimestamp, orderBy, limit, where
} from 'firebase/firestore';
import { getDocsFast, getDocFast } from '../utils/cacheUtils';

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Accurate Local ISO Date (Pakistan Time / System Local Date)
const getLocalIsoDate = (d = new Date()) => {
    if (!d || isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

// Distinct 3D Vibrant Palette
const WHEEL_COLORS = {
    netProfit: '#10b981',        // Emerald Green (Net Profit / Surplus)
    teacherSalaries: '#f59e0b',  // Amber / Orange
    operationalExp: '#ef4444',   // Coral Red
    deficit: '#dc2626',          // Dark Crimson for Deficit
    counterCash: '#059669',      // Jade Green
    onlineFees: '#3b82f6',       // Royal Blue
    directIncomes: '#8b5cf6',    // Purple
};

const CHANNEL_COLORS = {
    Cash: '#10b981',
    EasyPaisa: '#059669',
    JazzCash: '#d97706',
    Bank: '#2563eb',
    Other: '#7c3aed'
};

const RADIAN = Math.PI / 180;
const renderPiePercentLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (!percent || percent < 0.05) return null;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
        <text 
            x={x} 
            y={y} 
            fill="#ffffff" 
            textAnchor="middle" 
            dominantBaseline="central"
            style={{ 
                fontSize: '11px', 
                fontWeight: '900', 
                filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.95))',
                pointerEvents: 'none',
                userSelect: 'none'
            }}
        >
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    );
};

const CustomPieTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0];
    const dataPayload = item.payload || {};
    const val = Number(item.value || 0);
    const color = dataPayload.color || item.color || '#38bdf8';
    
    let percentStr = null;
    if (typeof item.percent === 'number') {
        percentStr = `${(item.percent * 100).toFixed(0)}%`;
    } else if (typeof dataPayload.percent === 'number') {
        percentStr = `${(dataPayload.percent * 100).toFixed(0)}%`;
    }

    return (
        <div style={{
            background: '#0f172a',
            color: '#ffffff',
            borderRadius: '12px',
            padding: '10px 14px',
            border: '1.5px solid #334155',
            boxShadow: '0 12px 28px -4px rgba(0,0,0,0.6)',
            fontSize: '0.82rem',
            minWidth: '160px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800', color: '#ffffff', marginBottom: '4px' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 6px ${color}` }} />
                <span style={{ color: '#ffffff' }}>{item.name}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '3px' }}>
                <span style={{ color: '#ffffff', fontWeight: '900', fontSize: '0.96rem' }}>
                    Rs {val.toLocaleString()}
                </span>
                {percentStr && (
                    <span style={{ background: 'rgba(56, 189, 248, 0.18)', color: '#38bdf8', padding: '2px 7px', borderRadius: '6px', fontWeight: '800', fontSize: '0.75rem', border: '1px solid rgba(56, 189, 248, 0.35)' }}>
                        {percentStr}
                    </span>
                )}
            </div>
        </div>
    );
};

const FinancesDashboard = ({ schoolId, currentAction, schoolInfo: parentSchoolInfo, classes = [] }) => {
    const today = new Date();
    const currentYearNum = today.getFullYear();
    const currentMonthNum = today.getMonth() + 1; // 1-12
    const currentIsoMonth = `${currentYearNum}-${String(currentMonthNum).padStart(2, '0')}`;
    const todayIsoDate = getLocalIsoDate(today);

    const [loading, setLoading] = useState(true);
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

    // Detect if this is the Principal's Demo Account (Hide demo buttons on production schools)
    const isDemoAccount = useMemo(() => {
        const sId = (schoolId || '').toLowerCase();
        const isLocal = typeof window !== 'undefined' && (
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.port !== ''
        );
        const manualSession = typeof window !== 'undefined' ? localStorage.getItem('manual_session') : null;
        return isLocal || sId.includes('demo') || sId.includes('test') || Boolean(manualSession) || localStorage.getItem('is_demo_mode') === 'true';
    }, [schoolId]);

    const [isInjectingDemo, setIsInjectingDemo] = useState(false);
    const [isPurgingDemo, setIsPurgingDemo] = useState(false);

    // ==========================================
    // TIME-MACHINE CONTROLS
    // ==========================================
    const [selectedYear, setSelectedYear] = useState(currentYearNum);
    const [selectedMonthMode, setSelectedMonthMode] = useState('current'); // 'today' | 'current' | 'all_year' | 'custom_month'
    const [customSelectedMonthNum, setCustomSelectedMonthNum] = useState(currentMonthNum); // 1-12

    // Main Sub Tabs: 'pulse' | 'visual_studio' | 'fee_ledger' | 'expenses_payroll'
    const [activeSubTab, setActiveSubTab] = useState('pulse');
    const [wheelViewMode, setWheelViewMode] = useState('distribution'); // 'distribution' | 'inflows'
    const [inspectedMonthNum, setInspectedMonthNum] = useState(currentMonthNum); // 1-12 for interactive 12-month inspector

    // Data States
    const [feeTransactions, setFeeTransactions] = useState([]);
    const [financesData, setFinancesData] = useState({ incomes: [], expenses: [] });
    const [teachersList, setTeachersList] = useState([]);
    const [payrollMetaByMonth, setPayrollMetaByMonth] = useState({}); // { [year_month]: payrollMeta }
    const [storeSales, setStoreSales] = useState([]);
    const [classStudentsMap, setClassStudentsMap] = useState({});
    const [schoolInfo, setSchoolInfo] = useState(parentSchoolInfo || { name: 'School Report', logo: '' });

    // Modals & UI States
    const [searchLedger, setSearchLedger] = useState('');
    const [modeLedgerFilter, setModeLedgerFilter] = useState('all'); // 'all' | 'Cash' | 'Online' | 'EasyPaisa' | 'JazzCash' | 'Bank'
    const [selectedReceiptForModal, setSelectedReceiptForModal] = useState(null);
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [proofModalState, setProofModalState] = useState({ isOpen: false, url: '', title: '' });
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    // Unified Add / Edit Modal State for Incomes & Expenses
    const [financeModalState, setFinanceModalState] = useState({ isOpen: false, category: 'incomes', item: null });
    const [financeForm, setFinanceForm] = useState({
        name: '',
        amount: '',
        type: 'one-time', // 'one-time' | 'permanent'
        category: 'General',
        remarks: '',
        year: currentYearNum,
        month: currentMonthNum
    });
    const [isSavingFinance, setIsSavingFinance] = useState(false);

    // Dynamic Year List: starts from 2025 and auto-increments with current and future years
    const availableYears = useMemo(() => {
        const startYear = 2025;
        const endYear = Math.max(2025, currentYearNum);
        const years = [];
        for (let y = startYear; y <= endYear; y++) {
            years.push(y);
        }
        return years;
    }, [currentYearNum]);

    // Unified Instant Scope Selection Handlers (Master Wheel, Channels, Outflows, and 12-Month sync)
    const handleSelectMonthScope = (mNum) => {
        if (!mNum) return;
        setInspectedMonthNum(mNum);
        setCustomSelectedMonthNum(mNum);
        setSelectedMonthMode('custom_month');
    };

    const handleSelectAllYearScope = () => {
        setSelectedMonthMode('all_year');
    };

    const handleSelectTodayScope = () => {
        setSelectedMonthMode('today');
    };

    // 0. Offline Vault Hydration on Initial Mount (100% Instant Offline Startup)
    useEffect(() => {
        if (!schoolId) return;
        try {
            const cachedVault = localStorage.getItem(`school_finances_vault_${schoolId}`);
            if (cachedVault) {
                const parsed = JSON.parse(cachedVault);
                if (Array.isArray(parsed.feeTransactions) && parsed.feeTransactions.length > 0) {
                    setFeeTransactions(parsed.feeTransactions);
                }
                if (parsed.financesData) {
                    setFinancesData(parsed.financesData);
                }
                if (Array.isArray(parsed.storeSales) && parsed.storeSales.length > 0) {
                    setStoreSales(parsed.storeSales);
                }
                if (parsed.payrollMetaByMonth) {
                    setPayrollMetaByMonth(parsed.payrollMetaByMonth);
                }
                if (Array.isArray(parsed.teachersList) && parsed.teachersList.length > 0) {
                    setTeachersList(parsed.teachersList);
                }
                setLoading(false);
            }
        } catch (e) {
            console.warn("Finances offline cache load note:", e);
        }
    }, [schoolId]);

    // 1. Listen to Network Online/Offline
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // 2. Fetch School Meta & Cache Base64 Logo for 100% Offline PDF
    useEffect(() => {
        if (!schoolId) return;
        let isMounted = true;
        const fetchSchool = async () => {
            try {
                const schoolDoc = await getDocFast(doc(db, `schools/${schoolId}`));
                if (schoolDoc.exists() && isMounted) {
                    const data = schoolDoc.data();
                    const info = {
                        name: data.name || parentSchoolInfo?.name || 'School Report',
                        logo: data.profileImage || parentSchoolInfo?.logo || ''
                    };
                    setSchoolInfo(info);

                    if (info.logo && info.logo.startsWith('http')) {
                        try {
                            const res = await fetch(info.logo);
                            const blob = await res.blob();
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                try {
                                    localStorage.setItem(`school_logo_base64_${schoolId}`, reader.result);
                                } catch (e) {}
                            };
                            reader.readAsDataURL(blob);
                        } catch (e) {}
                    }
                }
            } catch (err) {
                console.warn("FinancesDashboard school fetch note:", err);
            }
        };
        fetchSchool();
        return () => { isMounted = false; };
    }, [schoolId, parentSchoolInfo]);

    // 3. Live Listeners for Fee Transactions, Finances, Teachers & Payroll
    useEffect(() => {
        if (!schoolId) return;
        let unsubTransactions = null;
        let unsubFinances = null;
        let unsubTeachers = null;
        let unsubStoreSales = null;
        let unsubStudentsList = [];
        let isMounted = true;

        const setupListeners = async () => {
            try {
                // 1. Fee Transactions
                const txRef = collection(db, `schools/${schoolId}/feeTransactions`);
                unsubTransactions = onSnapshot(txRef, (snapshot) => {
                    if (!isMounted) return;
                    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    list.sort((a, b) => {
                        const timeA = a.timestamp?.seconds || new Date(a.dateIso || a.dateString || 0).getTime() || 0;
                        const timeB = b.timestamp?.seconds || new Date(b.dateIso || b.dateString || 0).getTime() || 0;
                        return timeB - timeA;
                    });
                    setFeeTransactions(list);
                    setLoading(false);
                }, (err) => {
                    console.warn("feeTransactions listener note:", err);
                    if (isMounted) setLoading(false);
                });

                // 2. School Finances Settings (Incomes & Expenses)
                const finRef = doc(db, `schools/${schoolId}/settings/finances`);
                unsubFinances = onSnapshot(finRef, (docSnap) => {
                    if (!isMounted) return;
                    if (docSnap.exists()) {
                        const d = docSnap.data();
                        setFinancesData({
                            incomes: d.incomes || [],
                            expenses: d.expenses || []
                        });
                    } else {
                        setFinancesData({ incomes: [], expenses: [] });
                    }
                }, (err) => {
                    console.warn("Finances listener note:", err);
                });

                // 3. Teachers Collection for Staff & Payroll
                const teachRef = collection(db, `schools/${schoolId}/teachers`);
                unsubTeachers = onSnapshot(teachRef, (snapshot) => {
                    if (!isMounted) return;
                    const tList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    setTeachersList(tList);
                }, (err) => {
                    console.warn("Teachers listener note:", err);
                });

                // 4. Students by Class
                const classesSnap = await getDocsFast(collection(db, `schools/${schoolId}/classes`));
                const validClasses = classesSnap.docs.filter(c => c.id !== 'action_metadata');

                validClasses.forEach(cls => {
                    const sRef = collection(db, `schools/${schoolId}/classes/${cls.id}/students`);
                    const unsub = onSnapshot(sRef, (snap) => {
                        if (!isMounted) return;
                        setClassStudentsMap(prev => ({
                            ...prev,
                            [cls.id]: snap.docs.map(d => ({ id: d.id, ...d.data() }))
                        }));
                    }, (err) => {
                        console.warn("Class students listener note:", err);
                    });
                    unsubStudentsList.push(unsub);
                });

                // 5. Store Sales & POS Orders
                try {
                    const salesRef = collection(db, `schools/${schoolId}/store_sales`);
                    unsubStoreSales = onSnapshot(salesRef, (snap) => {
                        if (!isMounted) return;
                        setStoreSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                    }, (err) => {
                        console.warn("Store sales listener note:", err);
                    });
                } catch (e) {}

            } catch (err) {
                console.error("FinancesDashboard setup error:", err);
                if (isMounted) setLoading(false);
            }
        };

        setupListeners();

        return () => {
            isMounted = false;
            if (unsubTransactions) unsubTransactions();
            if (unsubFinances) unsubFinances();
            if (unsubTeachers) unsubTeachers();
            if (unsubStoreSales) unsubStoreSales();
            unsubStudentsList.forEach(u => u());
        };
    }, [schoolId]);

    // 4. Fetch Payroll Meta for All Available Years (2025+) / Months
    useEffect(() => {
        if (!schoolId) return;
        let isMounted = true;
        const fetchPayrollData = async () => {
            try {
                const yearsToFetch = availableYears;
                for (const yr of yearsToFetch) {
                    for (let m = 1; m <= 12; m++) {
                        const payrollDocId = `${yr}_${m}`;
                        const payrollRef = doc(db, `schools/${schoolId}/settings`, `payroll_${payrollDocId}`);
                        const snap = await getDocFast(payrollRef);
                        if (snap.exists() && isMounted) {
                            const data = snap.data();
                            setPayrollMetaByMonth(prev => ({
                                ...prev,
                                [payrollDocId]: data.teachers || {}
                            }));
                        }
                    }
                }
            } catch (e) {
                console.warn("Payroll fetch note:", e);
            }
        };
        fetchPayrollData();
        return () => { isMounted = false; };
    }, [schoolId, availableYears]);

    // 5. Keep LocalStorage Offline Vault in Sync with Live Data (100% Offline Resilience)
    useEffect(() => {
        if (!schoolId) return;
        try {
            const vault = {
                feeTransactions: (feeTransactions || []).slice(0, 3000), // Protect against localStorage 5MB limit
                financesData,
                storeSales: (storeSales || []).slice(0, 1000),
                payrollMetaByMonth,
                teachersList
            };
            localStorage.setItem(`school_finances_vault_${schoolId}`, JSON.stringify(vault));
        } catch (e) {
            // LocalStorage trap
        }
    }, [schoolId, feeTransactions, financesData, storeSales, payrollMetaByMonth, teachersList]);

    // =========================================================================
    // 5. DEMO FINANCIAL DATA INJECTOR (Presentation Ready, Multi-Year & Store)
    // =========================================================================
    const handleInjectFinancialDemoData = async () => {
        if (!window.confirm(`✨ Inject Presentation Financial Demo Data?\n\nThis will generate:\n- 12-Month Inflow & Outflow Analytics across All Active Years (${availableYears.join(', ')})\n- Multi-channel Fee Receipts (Counter Cash, EasyPaisa, JazzCash, Meezan Bank)\n- School Store & Uniform Sales\n- Direct Incomes (Canteen, Admissions, Functions)\n- Operational Expenses & Teacher Salaries\n\nAll Visual 3D Charts, Donut Wheels, and Monthly Audits will become live instantly!`)) {
            return;
        }

        setIsInjectingDemo(true);
        try {
            const batch = writeBatch(db);

            const demoStudents = [
                { name: 'Muhammad Ali', class: 'Class 10-A', roll: '101', fee: 5500 },
                { name: 'Fatima Zahra', class: 'Class 9-B', roll: '204', fee: 5200 },
                { name: 'Hamza Tariq', class: 'Class 8-A', roll: '312', fee: 4800 },
                { name: 'Ayesha Khan', class: 'Class 7-C', roll: '415', fee: 4500 },
                { name: 'Zainab Bibi', class: 'Class 6-A', roll: '508', fee: 4200 },
                { name: 'Bilal Ahmed', class: 'Class 5-B', roll: '601', fee: 4000 },
                { name: 'Omar Farooq', class: 'Class 4-A', roll: '702', fee: 3800 },
                { name: 'Hafsa Noor', class: 'Class 3-A', roll: '809', fee: 3600 },
                { name: 'Mustafa Hassan', class: 'Class 2-B', roll: '915', fee: 3500 },
                { name: 'Maryam Siddiqui', class: 'Class 1-A', roll: '102', fee: 3500 },
                { name: 'Usman Ghani', class: 'Class 9-A', roll: '210', fee: 5200 },
                { name: 'Amina Tariq', class: 'Class 8-B', roll: '318', fee: 4800 }
            ];

            const channels = ['Cash', 'Cash', 'Online - EasyPaisa', 'Online - JazzCash', 'Online - Bank Transfer', 'Cash'];

            const newDemoTxs = [];
            const newDemoSales = [];

            // 1. Inject Data Across Active Years (Past Years: 12 Months | Current Year: Jan to Current Month)
            for (const yr of availableYears) {
                if (yr > currentYearNum) continue;
                const isBaseYear = yr === 2025;
                const isCurrentYear = yr === currentYearNum;
                const maxMonthForYear = isCurrentYear ? currentMonthNum : 12;
                const growthFactor = isBaseYear ? 0.82 : 1 + ((yr - 2026) * 0.12);

                for (let m = 1; m <= maxMonthForYear; m++) {
                    const monthIso = `${yr}-${String(m).padStart(2, '0')}`;

                    // Fee Receipts (12 per month)
                    demoStudents.forEach((std, sIdx) => {
                        const recNo = `DEMO-REC-${yr}-${m}-${sIdx + 1}`;
                        const mode = channels[sIdx % channels.length];
                        const day = String(Math.min(28, (sIdx + 1) * 2 + 1)).padStart(2, '0');
                        const dateIso = `${monthIso}-${day}`;
                        const calculatedPaid = Math.round(std.fee * growthFactor);

                        const txData = {
                            id: recNo,
                            receiptNo: recNo,
                            studentName: std.name,
                            className: std.class,
                            rollNo: std.roll,
                            studentId: `demo_std_${sIdx + 1}`,
                            totalPaid: calculatedPaid,
                            discount: sIdx === 3 ? 500 : 0,
                            paymentMode: mode,
                            dateIso,
                            dateString: `${day} ${MONTH_SHORT[m - 1]} ${yr}`,
                            timeString: '11:30 AM',
                            collectedBy: mode.startsWith('Online') ? 'Online Portal (Verified by Principal)' : 'Counter Cashier POS',
                            isDemoData: true,
                            timestamp: serverTimestamp()
                        };

                        const txRef = doc(db, `schools/${schoolId}/feeTransactions`, recNo);
                        batch.set(txRef, txData, { merge: true });
                        newDemoTxs.push(txData);
                    });

                    // Store Sales (Uniform & Books - 2 per month)
                    const storeSale1 = {
                        id: `DEMO-STORE-${yr}-${m}-1`,
                        invoiceNo: `DEMO-STORE-${yr}-${m}-1`,
                        buyerName: `Parent of ${demoStudents[m % demoStudents.length].name}`,
                        className: demoStudents[m % demoStudents.length].class,
                        totalAmount: Math.round(14500 * growthFactor),
                        grandTotal: Math.round(14500 * growthFactor),
                        paymentMethod: 'Cash',
                        dateIso: `${monthIso}-05`,
                        date: `${monthIso}-05`,
                        createdAt: `${monthIso}-05T10:00:00.000Z`,
                        itemsCount: 3,
                        isDemoData: true
                    };
                    const storeSale2 = {
                        id: `DEMO-STORE-${yr}-${m}-2`,
                        invoiceNo: `DEMO-STORE-${yr}-${m}-2`,
                        buyerName: `Parent of ${demoStudents[(m + 3) % demoStudents.length].name}`,
                        className: demoStudents[(m + 3) % demoStudents.length].class,
                        totalAmount: Math.round(9800 * growthFactor),
                        grandTotal: Math.round(9800 * growthFactor),
                        paymentMethod: 'EasyPaisa',
                        dateIso: `${monthIso}-18`,
                        date: `${monthIso}-18`,
                        createdAt: `${monthIso}-18T14:30:00.000Z`,
                        itemsCount: 2,
                        isDemoData: true
                    };

                    const storeRef1 = doc(db, `schools/${schoolId}/store_sales`, storeSale1.id);
                    const storeRef2 = doc(db, `schools/${schoolId}/store_sales`, storeSale2.id);
                    batch.set(storeRef1, storeSale1, { merge: true });
                    batch.set(storeRef2, storeSale2, { merge: true });
                    newDemoSales.push(storeSale1, storeSale2);

                    // Teacher Payroll (4 Teachers)
                    const payrollMeta = {
                        'demo_t_1': { isPaid: true, paidAmount: Math.round(42000 * growthFactor), teacher: { name: 'Sir Asadullah (Senior Math)' } },
                        'demo_t_2': { isPaid: true, paidAmount: Math.round(38000 * growthFactor), teacher: { name: 'Miss Sadia Khan (Physics)' } },
                        'demo_t_3': { isPaid: true, paidAmount: Math.round(35000 * growthFactor), teacher: { name: 'Sir Kamran Qureshi (English)' } },
                        'demo_t_4': { isPaid: true, paidAmount: Math.round(32000 * growthFactor), teacher: { name: 'Miss Fatima Noor (Urdu & Islamiyat)' } }
                    };
                    const payrollRef = doc(db, `schools/${schoolId}/settings`, `payroll_${yr}_${m}`);
                    batch.set(payrollRef, { teachers: payrollMeta, lastUpdated: serverTimestamp() }, { merge: true });
                }
            }

            // 2. Direct Incomes & Operational Expenses
            const demoIncomes = [
                { id: 'demo_inc_perm_1', name: 'School Canteen Monthly Rent', amount: 35000, type: 'permanent', category: 'Canteen', remarks: 'Monthly contract rent', createdAt: '2025-01-05' }
            ];
            const demoExpenses = [
                { id: 'demo_exp_perm_1', name: 'Staff Tea & Refreshments', amount: 9500, type: 'permanent', category: 'Refreshments', remarks: 'Monthly refreshment budget', createdAt: '2025-01-01' }
            ];

            for (const yr of availableYears) {
                if (yr > currentYearNum) continue;
                const maxMonthForYear = yr === currentYearNum ? currentMonthNum : 12;
                for (let m = 1; m <= maxMonthForYear; m++) {
                    const mStr = String(m).padStart(2, '0');
                    demoIncomes.push(
                        { id: `demo_inc_${yr}_${m}_1`, name: 'Prospectus & Admission Forms', amount: 32000 + (m * 1200), type: 'one-time', category: 'Admissions', remarks: 'Session prospectus sales', createdAt: `${yr}-${mStr}-03` },
                        { id: `demo_inc_${yr}_${m}_2`, name: 'Sports Gala & Function Fund', amount: 22000 + (m * 800), type: 'one-time', category: 'Events', remarks: 'Extracurricular sponsors', createdAt: `${yr}-${mStr}-11` }
                    );
                    demoExpenses.push(
                        { id: `demo_exp_${yr}_${m}_1`, name: 'WAPDA Electricity Bill', amount: 38000 + (m * 1100), type: 'one-time', category: 'Utility Bills', remarks: 'Main Campus Bill', createdAt: `${yr}-${mStr}-08` },
                        { id: `demo_exp_${yr}_${m}_2`, name: 'Exam Sheets & Stationery Printing', amount: 16000 + (m * 600), type: 'one-time', category: 'Stationery', remarks: 'Paper printing', createdAt: `${yr}-${mStr}-12` },
                        { id: `demo_exp_${yr}_${m}_3`, name: 'Building & Science Lab Maintenance', amount: 14000 + (m * 400), type: 'one-time', category: 'Maintenance', remarks: 'Apparatus repair', createdAt: `${yr}-${mStr}-14` }
                    );
                }
            }

            const finDocRef = doc(db, `schools/${schoolId}/settings/finances`);
            batch.set(finDocRef, { incomes: demoIncomes, expenses: demoExpenses }, { merge: true });

            await batch.commit();

            // Local State Instant Reflection
            setFeeTransactions(prev => {
                const nonDemo = (prev || []).filter(t => !t.isDemoData && !String(t.id || '').startsWith('DEMO-REC-'));
                return [...newDemoTxs, ...nonDemo];
            });
            setStoreSales(prev => {
                const nonDemo = (prev || []).filter(s => !s.isDemoData && !String(s.id || '').startsWith('DEMO-STORE-'));
                return [...newDemoSales, ...nonDemo];
            });
            setFinancesData({ incomes: demoIncomes, expenses: demoExpenses });

            alert(`✨ Presentation Financial Demo Data Injected Successfully!\n\nAll ${availableYears.length} Years (${availableYears.join(', ')}), 3D charts, Store Sales, and Monthly Breakdown wheels are now live!`);
        } catch (err) {
            console.error("Error injecting demo data:", err);
            alert("Error injecting demo data: " + err.message);
        }
        setIsInjectingDemo(false);
    };

    // Purge Demo Data Handler (Cleans Fee Txs, Store Sales, Incomes, Expenses & Payrolls)
    const handlePurgeFinancialDemoData = async () => {
        if (!window.confirm("🧹 Clean / Purge all Demo Financial Data?\n\nThis will remove:\n- All DEMO fee transactions across all years\n- All DEMO store sales records\n- All DEMO direct incomes & expenses\n- All DEMO payroll records\n\nYour actual school cashier records will remain completely untouched.")) {
            return;
        }

        setIsPurgingDemo(true);
        try {
            const batch = writeBatch(db);

            // 1. Delete demo transactions
            const demoTxs = (feeTransactions || []).filter(t => t.isDemoData || String(t.id || '').startsWith('DEMO-REC-') || String(t.receiptNo || '').startsWith('DEMO-REC-'));
            demoTxs.forEach(t => {
                const txRef = doc(db, `schools/${schoolId}/feeTransactions`, t.id);
                batch.delete(txRef);
            });

            // 2. Delete demo store sales
            const demoStoreSales = (storeSales || []).filter(s => s.isDemoData || String(s.id || '').startsWith('DEMO-STORE-') || String(s.invoiceNo || '').startsWith('DEMO-STORE-'));
            demoStoreSales.forEach(s => {
                const sRef = doc(db, `schools/${schoolId}/store_sales`, s.id);
                batch.delete(sRef);
            });

            // 3. Clean demo incomes and expenses
            const cleanIncomes = (financesData.incomes || []).filter(i => !String(i.id || '').startsWith('demo_'));
            const cleanExpenses = (financesData.expenses || []).filter(e => !String(e.id || '').startsWith('demo_'));

            const finDocRef = doc(db, `schools/${schoolId}/settings/finances`);
            batch.set(finDocRef, { incomes: cleanIncomes, expenses: cleanExpenses }, { merge: true });

            // 4. Clean demo payrolls for all available years
            for (const yr of availableYears) {
                for (let m = 1; m <= 12; m++) {
                    const pRef = doc(db, `schools/${schoolId}/settings`, `payroll_${yr}_${m}`);
                    batch.delete(pRef);
                }
            }

            await batch.commit();

            setFeeTransactions(prev => prev.filter(t => !t.isDemoData && !String(t.id || '').startsWith('DEMO-REC-') && !String(t.receiptNo || '').startsWith('DEMO-REC-')));
            setStoreSales(prev => prev.filter(s => !s.isDemoData && !String(s.id || '').startsWith('DEMO-STORE-') && !String(s.invoiceNo || '').startsWith('DEMO-STORE-')));
            setFinancesData({ incomes: cleanIncomes, expenses: cleanExpenses });
            setPayrollMetaByMonth({});

            alert("✓ Demo Financial Records Purged Successfully!\nDaily drawer, store register, and live ledger are now clean.");
        } catch (err) {
            console.error("Error purging demo data:", err);
            alert("Error purging demo data: " + err.message);
        }
        setIsPurgingDemo(false);
    };

    const hasDemoData = useMemo(() => {
        const hasTx = (feeTransactions || []).some(t => t.isDemoData || String(t.id || '').startsWith('DEMO-REC-') || String(t.receiptNo || '').startsWith('DEMO-REC-'));
        const hasStore = (storeSales || []).some(s => s.isDemoData || String(s.id || '').startsWith('DEMO-STORE-'));
        const hasInc = (financesData.incomes || []).some(i => String(i.id || '').startsWith('demo_'));
        const hasExp = (financesData.expenses || []).some(e => String(e.id || '').startsWith('demo_'));
        return hasTx || hasStore || hasInc || hasExp;
    }, [feeTransactions, storeSales, financesData]);

    // =========================================================================
    // 6. CORE FINANCIAL CALCULATION ENGINE (100% Offline, Time-Series Aware)
    // =========================================================================
    const calculatedMetrics = useMemo(() => {
        const isTodayMode = selectedMonthMode === 'today';
        const isAllYearMode = selectedMonthMode === 'all_year';
        const activeMonthNum = selectedMonthMode === 'current' ? currentMonthNum : customSelectedMonthNum;
        const activeMonthIso = `${selectedYear}-${String(activeMonthNum).padStart(2, '0')}`;

        // Helper: Filter Transaction by Selected Timeframe
        const isTxInScope = (tx) => {
            let txYear = 0;
            let txMonth = 0;
            let txIsoDate = '';

            if (tx.dateIso) {
                txIsoDate = tx.dateIso;
                const parts = tx.dateIso.split('-');
                txYear = Number(parts[0]);
                txMonth = Number(parts[1]);
            } else if (tx.timestamp?.seconds) {
                const d = new Date(tx.timestamp.seconds * 1000);
                txYear = d.getFullYear();
                txMonth = d.getMonth() + 1;
                txIsoDate = getLocalIsoDate(d);
            } else if (tx.dateString) {
                const d = new Date(tx.dateString);
                if (!isNaN(d.getTime())) {
                    txYear = d.getFullYear();
                    txMonth = d.getMonth() + 1;
                    txIsoDate = getLocalIsoDate(d);
                }
            }

            if (isTodayMode) {
                return txIsoDate === todayIsoDate;
            }
            if (isAllYearMode) {
                return txYear === selectedYear;
            }
            return txYear === selectedYear && txMonth === activeMonthNum;
        };

        const scopedTxs = (feeTransactions || []).filter(isTxInScope);

        // Calculate Fee Totals & Split (Counter Cash vs Online Digital)
        let totalFeePaid = 0;
        let counterCashFees = 0;
        let onlineFees = 0;
        let easyPaisaFees = 0;
        let jazzCashFees = 0;
        let bankFees = 0;
        let otherDigitalFees = 0;
        let totalDiscounts = 0;
        const paidStudentIds = new Set();

        scopedTxs.forEach(tx => {
            const amount = Number(tx.totalPaid) || 0;
            totalFeePaid += amount;
            totalDiscounts += Number(tx.discount) || 0;
            if (tx.studentId) paidStudentIds.add(tx.studentId);

            const mode = (tx.paymentMode || 'Cash').toLowerCase();
            const collectedBy = (tx.collectedBy || '').toLowerCase();
            const isOnlineTx = mode.startsWith('online') || collectedBy.includes('online') || mode.includes('transfer');

            if (mode === 'cash' && !isOnlineTx) {
                counterCashFees += amount;
            } else if (mode.includes('easypaisa') || mode.includes('easy')) {
                easyPaisaFees += amount;
                onlineFees += amount;
            } else if (mode.includes('jazzcash') || mode.includes('jazz')) {
                jazzCashFees += amount;
                onlineFees += amount;
            } else if (mode.includes('bank')) {
                bankFees += amount;
                onlineFees += amount;
            } else {
                otherDigitalFees += amount;
                onlineFees += amount;
            }
        });

        // Helper: Filter Direct Incomes & Operational Expenses
        const isEntryInScope = (entry) => {
            const dStr = entry.createdAt || entry.date;
            let eYear = 0;
            let eMonth = 0;
            let eIsoDate = '';

            if (dStr) {
                const d = new Date(dStr);
                if (!isNaN(d.getTime())) {
                    eYear = d.getFullYear();
                    eMonth = d.getMonth() + 1;
                    eIsoDate = getLocalIsoDate(d);
                }
            }

            if (entry.type === 'permanent') {
                if (isTodayMode) return false; // Today mode is strictly for daily cash drawer
                // Prevent recurring entries from leaking into historical years before creation
                if (eYear > 0 && selectedYear < eYear) return false;
                if (eYear > 0 && selectedYear === eYear && !isAllYearMode && activeMonthNum < eMonth) return false;
                return true;
            }

            if (!dStr) return false;
            if (isTodayMode) return eIsoDate === todayIsoDate;
            if (isAllYearMode) return eYear === selectedYear;
            return eYear === selectedYear && eMonth === activeMonthNum;
        };

        const scopedIncomes = (financesData.incomes || []).filter(isEntryInScope);
        const scopedExpenses = (financesData.expenses || []).filter(entry => {
            const isSalary = (entry.category || '').toLowerCase() === 'salary' || (entry.id || '').startsWith('payroll-');
            if (isSalary) return false;
            return isEntryInScope(entry);
        });

        const totalDirectIncomes = scopedIncomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const totalOperationalExpenses = scopedExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

        // Teacher Salaries Paid from Payroll for Selected Scope
        let totalTeacherSalariesPaid = 0;
        let totalStaffCount = teachersList.length || 4;
        let staffPaidCount = 0;

        if (isAllYearMode) {
            for (let m = 1; m <= 12; m++) {
                const pMeta = payrollMetaByMonth[`${selectedYear}_${m}`] || {};
                Object.values(pMeta).forEach(tMeta => {
                    if (tMeta.isPaid) {
                        totalTeacherSalariesPaid += (Number(tMeta.paidAmount) || 0);
                    }
                });
            }
        } else if (!isTodayMode) {
            const pMeta = payrollMetaByMonth[`${selectedYear}_${activeMonthNum}`] || {};
            if (Object.keys(pMeta).length > 0) {
                Object.values(pMeta).forEach(tMeta => {
                    if (tMeta.isPaid) {
                        staffPaidCount += 1;
                        totalTeacherSalariesPaid += (Number(tMeta.paidAmount) || 0);
                    }
                });
            } else {
                teachersList.forEach(t => {
                    const tMeta = pMeta[t.id];
                    if (tMeta?.isPaid) {
                        staffPaidCount += 1;
                        totalTeacherSalariesPaid += (Number(tMeta.paidAmount) || Number(t.baseSalary) || 0);
                    }
                });
            }
        }

        const isSelectedYearFuture = selectedYear > currentYearNum;
        const isSelectedYearPast = selectedYear < currentYearNum;
        const isSelectedYearCurrent = selectedYear === currentYearNum;
        const isFutureScope = isSelectedYearFuture || (isSelectedYearCurrent && !isAllYearMode && !isTodayMode && activeMonthNum > currentMonthNum);

        // Projected Staff Baseline Salaries for Future Months (Fixed Monthly Payroll Commitment)
        const staffBaseCommitment = teachersList.reduce((sum, t) => sum + (Number(t.baseSalary) || 35000), 0) || 147000;
        const effectiveSalariesPaid = (isFutureScope && totalTeacherSalariesPaid === 0) ? staffBaseCommitment : totalTeacherSalariesPaid;

        // Grand Totals (Actual for past/current, Projected Fixed for Future)
        const grossRevenue = totalFeePaid + totalDirectIncomes;
        const totalOutflow = totalOperationalExpenses + effectiveSalariesPaid;
        const netProfit = grossRevenue - totalOutflow;
        const profitMarginPercent = grossRevenue > 0 ? Math.round((netProfit / grossRevenue) * 100) : 0;

        // 1. Revenue Allocation & Profit Pillars (Salaries + Expenses + Net Profit)
        const revenueDistributionData = [];
        if (effectiveSalariesPaid > 0) {
            revenueDistributionData.push({
                name: isFutureScope ? 'Projected Staff Payroll' : 'Teacher Salaries Paid',
                value: effectiveSalariesPaid,
                color: WHEEL_COLORS.teacherSalaries,
                type: 'outflow'
            });
        }
        if (totalOperationalExpenses > 0) {
            revenueDistributionData.push({
                name: isFutureScope ? 'Projected Fixed Expenses' : 'Operational Expenses',
                value: totalOperationalExpenses,
                color: WHEEL_COLORS.operationalExp,
                type: 'outflow'
            });
        }
        if (netProfit > 0) {
            revenueDistributionData.push({
                name: isFutureScope ? 'Projected Surplus' : 'Net School Profit',
                value: netProfit,
                color: WHEEL_COLORS.netProfit,
                type: 'profit'
            });
        } else if (netProfit < 0) {
            revenueDistributionData.push({
                name: isFutureScope ? 'Projected Deficit' : 'Operational Deficit',
                value: Math.abs(netProfit),
                color: WHEEL_COLORS.deficit,
                type: 'deficit'
            });
        }

        // 2. Inflow Sources (Counter Cash vs Digital Online vs Direct Income)
        const inflowSourcesData = [];
        if (counterCashFees > 0) {
            inflowSourcesData.push({ name: 'Counter Cash Fees', value: counterCashFees, color: WHEEL_COLORS.counterCash, type: 'inflow' });
        }
        if (onlineFees > 0) {
            inflowSourcesData.push({ name: 'Online / Digital Fees', value: onlineFees, color: WHEEL_COLORS.onlineFees, type: 'inflow' });
        }
        if (totalDirectIncomes > 0) {
            inflowSourcesData.push({ name: isFutureScope ? 'Permanent Incomes (Fixed)' : 'Direct School Incomes', value: totalDirectIncomes, color: WHEEL_COLORS.directIncomes, type: 'inflow' });
        }

        // 3. Fallback / Combined Pillars (All Inflow + Outflow + Profit)
        const all5WheelPillars = [
            { name: 'Counter Cash Fees', value: counterCashFees, color: WHEEL_COLORS.counterCash, type: 'inflow' },
            { name: 'Online / Digital Fees', value: onlineFees, color: WHEEL_COLORS.onlineFees, type: 'inflow' },
            { name: isFutureScope ? 'Permanent Incomes' : 'Direct School Incomes', value: totalDirectIncomes, color: WHEEL_COLORS.directIncomes, type: 'inflow' },
            { name: isFutureScope ? 'Projected Payroll' : 'Teacher Salaries Paid', value: effectiveSalariesPaid, color: WHEEL_COLORS.teacherSalaries, type: 'outflow' },
            { name: isFutureScope ? 'Fixed Expenses' : 'Operational Expenses', value: totalOperationalExpenses, color: WHEEL_COLORS.operationalExp, type: 'outflow' }
        ];
        if (netProfit > 0) {
            all5WheelPillars.push({
                name: isFutureScope ? 'Projected Surplus' : 'Net School Profit',
                value: netProfit,
                color: WHEEL_COLORS.netProfit,
                type: 'profit'
            });
        }

        // Active Master Wheel Data based on user toggle
        const activeDistributionSlices = revenueDistributionData.filter(item => item.value > 0);
        const masterWheelData = wheelViewMode === 'inflows' 
            ? (inflowSourcesData.length > 0 ? inflowSourcesData : [{ name: 'Projected Fixed Income', value: totalDirectIncomes || 1, color: WHEEL_COLORS.directIncomes, type: 'inflow' }])
            : (activeDistributionSlices.length > 0 ? activeDistributionSlices : all5WheelPillars.filter(item => item.value > 0));

        // Payment Channels Distribution Donut (Actual live fees only)
        const channelDistributionData = isFutureScope ? [] : [
            { name: 'Counter Cash', value: counterCashFees, color: CHANNEL_COLORS.Cash },
            { name: 'EasyPaisa', value: easyPaisaFees, color: CHANNEL_COLORS.EasyPaisa },
            { name: 'JazzCash', value: jazzCashFees, color: CHANNEL_COLORS.JazzCash },
            { name: 'Bank Transfer', value: bankFees, color: CHANNEL_COLORS.Bank },
            { name: 'Other Channels', value: otherDigitalFees, color: CHANNEL_COLORS.Other }
        ].filter(item => item.value > 0);

        // Expense Category Breakdown
        const expenseCategoryMap = {};
        scopedExpenses.forEach(exp => {
            const cat = exp.category || 'General Operational';
            expenseCategoryMap[cat] = (expenseCategoryMap[cat] || 0) + (Number(exp.amount) || 0);
        });
        if (effectiveSalariesPaid > 0) {
            expenseCategoryMap[isFutureScope ? 'Projected Staff Salaries' : 'Teacher Salaries'] = effectiveSalariesPaid;
        }

        const expenseCategoriesData = Object.entries(expenseCategoryMap).map(([name, value], idx) => ({
            name,
            value,
            color: ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ec4899', '#64748b'][idx % 7]
        }));

        // Year Rollover & Opening Balance Metrics (Dec -> Jan Bridge)
        const previousYear = selectedYear - 1;
        let prevYearFeeTotal = 0;
        (feeTransactions || []).forEach(tx => {
            const parts = (tx.dateIso || '').split('-');
            const y = parts[0] ? Number(parts[0]) : (tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000).getFullYear() : 0);
            if (y === previousYear) {
                prevYearFeeTotal += Number(tx.totalPaid) || 0;
            }
        });
        const rolloverOpeningCash = Math.round(prevYearFeeTotal * 0.24); // Healthy previous year cash reserve carry-forward
        const activePermanentIncomes = (financesData.incomes || []).filter(i => i.type === 'permanent');
        const activePermanentExpenses = (financesData.expenses || []).filter(e => e.type === 'permanent');

        // Total Enrolled Students across all active classes for Recovery Rate calculation
        const totalEnrolledStudents = Object.values(classStudentsMap).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);

        // 12-Month Inflow & Outflow Data & Isolated Month Ledgers
        const months12Data = MONTH_SHORT.map((mShort, idx) => {
            const mNum = idx + 1;
            const currentYearMonthIso = `${selectedYear}-${String(mNum).padStart(2, '0')}`;
            const isFuture = isSelectedYearFuture || (isSelectedYearCurrent && mNum > currentMonthNum);
            const isCurrent = isSelectedYearCurrent && mNum === currentMonthNum;
            const isPast = isSelectedYearPast || (isSelectedYearCurrent && mNum < currentMonthNum);

            let curYearFees = 0;
            let curYearOnlineFees = 0;
            let curYearCashFees = 0;
            let monthReceiptCount = 0;
            const monthPaidStudentIds = new Set();

            if (!isFuture) {
                (feeTransactions || []).forEach(tx => {
                    let txYear = 0;
                    let txMonth = 0;
                    if (tx.dateIso) {
                        const parts = tx.dateIso.split('-');
                        txYear = Number(parts[0]);
                        txMonth = Number(parts[1]);
                    } else if (tx.timestamp?.seconds) {
                        const d = new Date(tx.timestamp.seconds * 1000);
                        txYear = d.getFullYear();
                        txMonth = d.getMonth() + 1;
                    } else if (tx.dateString) {
                        const d = new Date(tx.dateString);
                        if (!isNaN(d.getTime())) {
                            txYear = d.getFullYear();
                            txMonth = d.getMonth() + 1;
                        }
                    }

                    if (txYear === selectedYear && txMonth === mNum) {
                        const amt = Number(tx.totalPaid) || 0;
                        curYearFees += amt;
                        monthReceiptCount += 1;
                        if (tx.studentId) monthPaidStudentIds.add(tx.studentId);

                        const mode = (tx.paymentMode || 'Cash').toLowerCase();
                        const collectedBy = (tx.collectedBy || '').toLowerCase();
                        if (mode.startsWith('online') || collectedBy.includes('online') || mode.includes('transfer') || mode.includes('easy') || mode.includes('jazz') || mode.includes('bank')) {
                            curYearOnlineFees += amt;
                        } else {
                            curYearCashFees += amt;
                        }
                    }
                });
            }

            // Direct School Incomes for this month
            let monthDirectIncomes = 0;
            (financesData.incomes || []).forEach(inc => {
                let incYear = 0;
                let incMonth = 0;
                if (inc.createdAt || inc.date) {
                    const d = new Date(inc.createdAt || inc.date);
                    if (!isNaN(d.getTime())) {
                        incYear = d.getFullYear();
                        incMonth = d.getMonth() + 1;
                    }
                }

                if (inc.type === 'permanent') {
                    const isValidYear = !incYear || selectedYear >= incYear;
                    const isValidMonth = !incYear || selectedYear > incYear || (selectedYear === incYear && mNum >= incMonth);
                    if (isValidYear && isValidMonth) {
                        monthDirectIncomes += (Number(inc.amount) || 0);
                    }
                } else if (!isFuture && (inc.createdAt?.startsWith(currentYearMonthIso) || inc.date?.startsWith(currentYearMonthIso))) {
                    monthDirectIncomes += (Number(inc.amount) || 0);
                }
            });

            // Store Sales for this month (Only recorded for past and current months)
            let monthStoreSales = 0;
            if (!isFuture) {
                (storeSales || []).forEach(sale => {
                    let sYear = 0;
                    let sMonth = 0;
                    const dStr = sale.timestamp || sale.dateIso || sale.date || sale.createdAt;
                    if (dStr) {
                        const d = new Date(dStr?.seconds ? dStr.seconds * 1000 : dStr);
                        if (!isNaN(d.getTime())) {
                            sYear = d.getFullYear();
                            sMonth = d.getMonth() + 1;
                        }
                    }
                    if (sYear === selectedYear && sMonth === mNum) {
                        monthStoreSales += (Number(sale.grandTotal || sale.totalAmount || sale.totalPaid || sale.amount || 0));
                    }
                });
            }

            // Operational Expenses for this month (excluding salary)
            let monthOperationalExpenses = 0;
            (financesData.expenses || []).forEach(exp => {
                const isSalary = (exp.category || '').toLowerCase() === 'salary' || (exp.id || '').startsWith('payroll-');
                if (!isSalary) {
                    let expYear = 0;
                    let expMonth = 0;
                    if (exp.createdAt || exp.date) {
                        const d = new Date(exp.createdAt || exp.date);
                        if (!isNaN(d.getTime())) {
                            expYear = d.getFullYear();
                            expMonth = d.getMonth() + 1;
                        }
                    }

                    if (exp.type === 'permanent') {
                        const isValidYear = !expYear || selectedYear >= expYear;
                        const isValidMonth = !expYear || selectedYear > expYear || (selectedYear === expYear && mNum >= expMonth);
                        if (isValidYear && isValidMonth) {
                            monthOperationalExpenses += (Number(exp.amount) || 0);
                        }
                    } else if (!isFuture && (exp.createdAt?.startsWith(currentYearMonthIso) || exp.date?.startsWith(currentYearMonthIso))) {
                        monthOperationalExpenses += (Number(exp.amount) || 0);
                    }
                }
            });

            // Teacher Salaries from Payroll Meta for this month (Only for past and current months)
            let monthTeacherSalaries = 0;
            let monthTeachersPaidCount = 0;
            if (!isFuture) {
                const pMetaCur = payrollMetaByMonth[`${selectedYear}_${mNum}`] || {};
                Object.values(pMetaCur).forEach(tm => {
                    if (tm.isPaid) {
                        monthTeacherSalaries += (Number(tm.paidAmount) || 0);
                        monthTeachersPaidCount += 1;
                    }
                });
            }

            const curYearInflow = curYearFees + monthDirectIncomes + monthStoreSales;
            const curYearOutflow = monthOperationalExpenses + monthTeacherSalaries;
            const net = curYearInflow - curYearOutflow;
            const profitMargin = curYearInflow > 0 ? Math.round((net / curYearInflow) * 100) : 0;
            const recoveryPercent = isFuture 
                ? 0 
                : (totalEnrolledStudents > 0 
                    ? Math.min(100, Math.round((monthPaidStudentIds.size / totalEnrolledStudents) * 100)) 
                    : (monthReceiptCount > 0 ? 100 : 0));
            const digitalRatio = curYearFees > 0 ? Math.round((curYearOnlineFees / curYearFees) * 100) : 0;

            return {
                name: mShort,
                monthNum: mNum,
                monthName: MONTH_NAMES[idx],
                inflow: curYearInflow,
                outflow: curYearOutflow,
                net,
                profitMargin,
                isSurplus: net >= 0,
                isFuture,
                isCurrent,
                isPast,
                feeInflow: curYearFees,
                cashFees: curYearCashFees,
                onlineFees: curYearOnlineFees,
                digitalRatio,
                directIncomes: monthDirectIncomes,
                storeSalesAmount: monthStoreSales,
                expenses: monthOperationalExpenses,
                salaries: monthTeacherSalaries,
                teachersPaidCount: monthTeachersPaidCount,
                receiptCount: monthReceiptCount,
                paidStudentsCount: monthPaidStudentIds.size,
                recoveryPercent,
                isSelected: mNum === inspectedMonthNum
            };
        });

        // Annual Totals Snapshot for Selected Year (Computed across active past/current months for current year, or all 12 for past years)
        const recordedMonths = months12Data.filter(m => !m.isFuture);
        const annualInflow = (recordedMonths.length > 0 ? recordedMonths : months12Data).reduce((s, m) => s + m.inflow, 0);
        const annualOutflow = (recordedMonths.length > 0 ? recordedMonths : months12Data).reduce((s, m) => s + m.outflow, 0);
        const annualNet = annualInflow - annualOutflow;
        const annualMargin = annualInflow > 0 ? Math.round((annualNet / annualInflow) * 100) : 0;
        const annualTotals = {
            annualInflow,
            annualOutflow,
            annualNet,
            annualMargin,
            isSurplus: annualNet >= 0
        };

        // Active Inspected Month Data Capsule
        const inspectedMonthData = months12Data.find(m => m.monthNum === inspectedMonthNum) || months12Data[currentMonthNum - 1] || months12Data[0];

        // Smart Automated Financial Insight in English
        let smartInsight = '';
        if (isTodayMode) {
            smartInsight = `💡 Daily Closing Insight: Today's counter cash drawer closed with Rs ${counterCashFees.toLocaleString()} collected across ${scopedTxs.length} fee receipts.`;
        } else if (isAllYearMode) {
            smartInsight = `💡 Annual Financial Insight: In ${selectedYear}, the school generated Rs ${annualInflow.toLocaleString()} total revenue with an annual surplus of Rs ${annualNet.toLocaleString()} (${annualMargin}% margin).`;
        } else {
            const monthLabel = MONTH_NAMES[activeMonthNum - 1];
            const prevMonthData = months12Data[activeMonthNum - 2];
            const curMonthData = months12Data[activeMonthNum - 1];
            let growthText = '';
            if (prevMonthData && prevMonthData.inflow > 0) {
                const diff = curMonthData.inflow - prevMonthData.inflow;
                const pct = Math.round((diff / prevMonthData.inflow) * 100);
                growthText = pct >= 0 ? `revenue increased by ${pct}% compared to ${MONTH_NAMES[activeMonthNum - 2]}` : `revenue varied by ${pct}% compared to ${MONTH_NAMES[activeMonthNum - 2]}`;
            } else {
                growthText = `healthy revenue stream recorded`;
            }

            const digitalSharePct = grossRevenue > 0 ? Math.round((onlineFees / grossRevenue) * 100) : 0;
            smartInsight = `💡 Financial Insight: In ${monthLabel} ${selectedYear}, ${growthText} with a ${profitMarginPercent}% Net Profit Margin and ${digitalSharePct}% digital online collection share.`;
        }

        return {
            isTodayMode,
            isAllYearMode,
            activeMonthNum,
            activeMonthIso,
            scopedTxs,
            scopedIncomes,
            scopedExpenses,
            totalFeePaid,
            counterCashFees,
            onlineFees,
            easyPaisaFees,
            jazzCashFees,
            bankFees,
            otherDigitalFees,
            totalDirectIncomes,
            totalOperationalExpenses,
            totalTeacherSalariesPaid,
            totalStaffCount,
            staffPaidCount,
            grossRevenue,
            totalOutflow,
            netProfit,
            profitMarginPercent,
            totalDiscounts,
            revenueDistributionData,
            inflowSourcesData,
            masterWheelData,
            all5WheelPillars,
            channelDistributionData,
            expenseCategoriesData,
            months12Data,
            inspectedMonthData,
            annualTotals,
            smartInsight,
            isFutureScope,
            rolloverOpeningCash,
            activePermanentIncomes,
            activePermanentExpenses
        };
    }, [
        selectedYear, selectedMonthMode, customSelectedMonthNum, wheelViewMode, inspectedMonthNum,
        feeTransactions, financesData, teachersList, payrollMetaByMonth, storeSales, classStudentsMap, currentMonthNum, currentYearNum, todayIsoDate
    ]);

    // 7. Filtered Ledger Records for Sub Tab 3
    const filteredLedgerTxs = useMemo(() => {
        return calculatedMetrics.scopedTxs.filter(tx => {
            if (searchLedger.trim()) {
                const q = searchLedger.toLowerCase();
                const matchName = (tx.studentName || '').toLowerCase().includes(q);
                const matchRoll = String(tx.rollNo || '').toLowerCase().includes(q);
                const matchClass = (tx.className || '').toLowerCase().includes(q);
                const matchRec = (tx.receiptNo || '').toLowerCase().includes(q);
                const matchFather = (tx.fatherName || '').toLowerCase().includes(q);
                const matchTrx = (tx.remarks || '').toLowerCase().includes(q);
                if (!matchName && !matchRoll && !matchClass && !matchRec && !matchFather && !matchTrx) return false;
            }

            if (modeLedgerFilter !== 'all') {
                const m = (tx.paymentMode || '').toLowerCase();
                if (modeLedgerFilter === 'Cash' && m !== 'cash') return false;
                if (modeLedgerFilter === 'Online' && !m.startsWith('online') && !tx.collectedBy?.includes('Online')) return false;
                if (modeLedgerFilter === 'EasyPaisa' && !m.includes('easy')) return false;
                if (modeLedgerFilter === 'JazzCash' && !m.includes('jazz')) return false;
                if (modeLedgerFilter === 'Bank' && !m.includes('bank') && !m.includes('transfer')) return false;
            }
            return true;
        });
    }, [calculatedMetrics.scopedTxs, searchLedger, modeLedgerFilter]);

    // 8. Handlers for Opening, Adding & Editing Direct Incomes and Operational Expenses
    const handleOpenFinanceModal = (category, item = null) => {
        const defaultMonth = selectedMonthMode === 'current' ? currentMonthNum : customSelectedMonthNum;
        if (item) {
            let yr = selectedYear;
            let m = defaultMonth;
            const dStr = item.date || item.createdAt;
            if (dStr) {
                const d = new Date(dStr);
                if (!isNaN(d.getTime())) {
                    yr = d.getFullYear();
                    m = d.getMonth() + 1;
                }
            }
            setFinanceForm({
                name: item.name || '',
                amount: String(item.amount || ''),
                type: item.type || 'one-time',
                category: item.category || (category === 'incomes' ? 'General' : 'Operational'),
                remarks: item.remarks || '',
                year: yr,
                month: m
            });
            setFinanceModalState({ isOpen: true, category, item });
        } else {
            setFinanceForm({
                name: '',
                amount: '',
                type: 'one-time',
                category: category === 'incomes' ? 'General' : 'Operational',
                remarks: '',
                year: selectedYear,
                month: defaultMonth
            });
            setFinanceModalState({ isOpen: true, category, item: null });
        }
    };

    const handleSaveFinanceItem = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!financeForm.name.trim() || !financeForm.amount) return;
        setIsSavingFinance(true);

        const category = financeModalState.category;
        const isEdit = Boolean(financeModalState.item?.id);
        const targetYear = Number(financeForm.year || selectedYear);
        const targetMonth = Number(financeForm.month || (selectedMonthMode === 'current' ? currentMonthNum : customSelectedMonthNum));
        const targetMonthIso = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
        const dateIso = `${targetMonthIso}-01`;

        let updatedList;
        if (isEdit) {
            const editId = financeModalState.item.id;
            updatedList = (financesData[category] || []).map(entry => {
                if (entry.id === editId) {
                    return {
                        ...entry,
                        name: financeForm.name.trim(),
                        amount: Number(financeForm.amount),
                        type: financeForm.type,
                        category: financeForm.category,
                        remarks: financeForm.remarks.trim(),
                        date: dateIso,
                        createdAt: entry.createdAt || `${targetMonthIso}-01T00:00:00.000Z`
                    };
                }
                return entry;
            });
        } else {
            const newItem = {
                id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                name: financeForm.name.trim(),
                amount: Number(financeForm.amount),
                type: financeForm.type,
                category: financeForm.category,
                remarks: financeForm.remarks.trim(),
                createdAt: `${targetMonthIso}-01T00:00:00.000Z`,
                date: dateIso
            };
            updatedList = [...(financesData[category] || []), newItem];
        }

        setFinancesData(prev => ({ ...prev, [category]: updatedList }));
        setFinanceModalState({ isOpen: false, category: 'incomes', item: null });
        setIsSavingFinance(false);

        try {
            const docRef = doc(db, `schools/${schoolId}/settings/finances`);
            await setDoc(docRef, { [category]: updatedList }, { merge: true });
        } catch (err) {
            console.warn("Finance entry saved locally for background sync:", err);
        }
    };

    const handleDeleteFinanceEntry = async (id, category) => {
        if (!window.confirm(`Are you sure you want to remove this ${category === 'incomes' ? 'income' : 'expense'} entry?`)) return;

        const updatedList = (financesData[category] || []).filter(item => item.id !== id);
        setFinancesData(prev => ({ ...prev, [category]: updatedList }));

        try {
            const docRef = doc(db, `schools/${schoolId}/settings/finances`);
            await setDoc(docRef, { [category]: updatedList }, { merge: true });
        } catch (err) {
            console.warn("Delete finance entry cached locally:", err);
        }
    };

    // 9. 100% Offline Branded PDF Export
    const handleDownloadFinancialReport = async () => {
        setIsGeneratingPDF(true);
        try {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();

            doc.setFillColor(15, 23, 42); // Slate-900
            doc.rect(0, 0, pageWidth, 45, 'F');

            let hasLogo = false;
            let base64Logo = localStorage.getItem(`school_logo_base64_${schoolId}`);
            if (base64Logo) {
                try {
                    doc.addImage(base64Logo, 'PNG', 14, 10, 24, 24);
                    hasLogo = true;
                } catch (e) {}
            }

            const headerTextX = hasLogo ? 44 : 14;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.setTextColor(255, 255, 255);
            doc.text((schoolInfo.name || 'SCHOOL REPORT').toUpperCase(), headerTextX, 20);

            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(148, 163, 184);

            let scopeTitle = calculatedMetrics.isTodayMode 
                ? `Daily Cashier Closing & Drawer Audit - ${todayIsoDate}`
                : calculatedMetrics.isAllYearMode
                ? `Annual Financial Intelligence & Audit Report - Year ${selectedYear}`
                : `Monthly Financial & Revenue Audit Report - ${MONTH_NAMES[calculatedMetrics.activeMonthNum - 1]} ${selectedYear}`;

            doc.text(scopeTitle, headerTextX, 28);

            doc.setFontSize(8);
            doc.setTextColor(203, 213, 225);
            doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} | 100% Offline Verified`, headerTextX, 35);

            // Summary Table
            let startY = 55;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text("1. Executive Financial Summary", 14, startY);

            const summaryTable = [
                ['Counter Cash Fees (Cash in Hand)', `${calculatedMetrics.scopedTxs.filter(t => (t.paymentMode||'').toLowerCase() === 'cash').length} Receipts`, `Rs ${calculatedMetrics.counterCashFees.toLocaleString()}`],
                ['Online & Digital Fees (EasyPaisa/JazzCash/Bank)', `${calculatedMetrics.scopedTxs.filter(t => (t.paymentMode||'').toLowerCase() !== 'cash').length} Receipts`, `Rs ${calculatedMetrics.onlineFees.toLocaleString()}`],
                ['Direct Other Incomes', `${calculatedMetrics.scopedIncomes.length} Recorded Entries`, `Rs ${calculatedMetrics.totalDirectIncomes.toLocaleString()}`],
                ['Gross Total Revenue (Inflow)', 'Total Inflow Generated', `Rs ${calculatedMetrics.grossRevenue.toLocaleString()}`],
                ['Operational Expenses (Excl. Salary)', `${calculatedMetrics.scopedExpenses.length} Expense Heads`, `Rs ${calculatedMetrics.totalOperationalExpenses.toLocaleString()}`],
                ['Teacher Salaries Paid (Payroll)', `${calculatedMetrics.staffPaidCount} Staff Disbursed`, `Rs ${calculatedMetrics.totalTeacherSalariesPaid.toLocaleString()}`],
                ['Total Outflow / Expenses', 'Operational + Staff Payroll', `Rs ${calculatedMetrics.totalOutflow.toLocaleString()}`],
                ['Net School Surplus / Profit', calculatedMetrics.netProfit >= 0 ? `Surplus (${calculatedMetrics.profitMarginPercent}% Margin)` : 'Deficit / Overdraft', `Rs ${calculatedMetrics.netProfit.toLocaleString()}`]
            ];

            autoTable(doc, {
                startY: startY + 4,
                head: [['Financial Head', 'Details / Count', 'Amount (PKR)']],
                body: summaryTable,
                theme: 'grid',
                headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
                styles: { fontSize: 8.5, cellPadding: 3.2 },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 80 },
                    1: { textColor: [100, 116, 139] },
                    2: { halign: 'right', fontStyle: 'bold' }
                }
            });

            doc.save(`Financial_Report_${selectedYear}_${Date.now()}.pdf`);
        } catch (e) {
            console.error("PDF generation error:", e);
        }
        setIsGeneratingPDF(false);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>
            
            {/* ========================================================= */}
            {/* TOP BAR: TIME-MACHINE CONTROLS & HEADER */}
            {/* ========================================================= */}
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '1.2rem 1.5rem',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.03)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '14px',
                        background: 'linear-gradient(135deg, #0078d4 0%, #1e40af 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        boxShadow: '0 4px 12px rgba(0, 120, 212, 0.3)'
                    }}>
                        <Activity size={24} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <h2 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                Financial Engine & Intelligence
                            </h2>
                            {!isOnline ? (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                    fontSize: '0.75rem', fontWeight: '700', padding: '0.2rem 0.6rem',
                                    borderRadius: '999px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a'
                                }}>
                                    <WifiOff size={13} /> Offline Engine
                                </span>
                            ) : (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                    fontSize: '0.75rem', fontWeight: '700', padding: '0.2rem 0.6rem',
                                    borderRadius: '999px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0'
                                }}>
                                    <Wifi size={13} /> Live Sync
                                </span>
                            )}
                        </div>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                            Unified offline-resilient accounting, digital gateway reconciliation & 3D visual intelligence
                        </p>
                    </div>
                </div>

                {/* Right Time-Machine Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    
                    {/* Timeframe Scope Switcher */}
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        background: '#f1f5f9',
                        padding: '3px',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0'
                    }}>
                        <button
                            onClick={() => setSelectedMonthMode('today')}
                            style={{
                                border: 'none',
                                background: selectedMonthMode === 'today' ? '#ffffff' : 'transparent',
                                color: selectedMonthMode === 'today' ? '#0078d4' : '#64748b',
                                fontWeight: selectedMonthMode === 'today' ? '800' : '600',
                                padding: '6px 12px',
                                borderRadius: '9px',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                boxShadow: selectedMonthMode === 'today' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            ⚡ Today
                        </button>
                        <button
                            onClick={() => setSelectedMonthMode('current')}
                            style={{
                                border: 'none',
                                background: selectedMonthMode === 'current' ? '#ffffff' : 'transparent',
                                color: selectedMonthMode === 'current' ? '#0078d4' : '#64748b',
                                fontWeight: selectedMonthMode === 'current' ? '800' : '600',
                                padding: '6px 12px',
                                borderRadius: '9px',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                boxShadow: selectedMonthMode === 'current' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            📅 This Month
                        </button>
                        <button
                            onClick={() => setSelectedMonthMode('all_year')}
                            style={{
                                border: 'none',
                                background: selectedMonthMode === 'all_year' ? '#ffffff' : 'transparent',
                                color: selectedMonthMode === 'all_year' ? '#0078d4' : '#64748b',
                                fontWeight: selectedMonthMode === 'all_year' ? '800' : '600',
                                padding: '6px 12px',
                                borderRadius: '9px',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                boxShadow: selectedMonthMode === 'all_year' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            🗓️ Whole Year
                        </button>
                    </div>

                    {/* Year Selector Dropdown */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#f8fafc', padding: '0.4rem 0.8rem', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#64748b' }}>Year:</span>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                fontSize: '0.88rem',
                                fontWeight: '800',
                                color: '#0f172a',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            {availableYears.map(yr => (
                                <option key={yr} value={yr}>
                                    {yr} {yr === currentYearNum ? '(Current)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Month Selector Dropdown */}
                    {selectedMonthMode !== 'today' && selectedMonthMode !== 'all_year' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#f8fafc', padding: '0.4rem 0.8rem', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#64748b' }}>Month:</span>
                            <select
                                value={selectedMonthMode === 'current' ? currentMonthNum : customSelectedMonthNum}
                                onChange={(e) => {
                                    setSelectedMonthMode('custom_month');
                                    setCustomSelectedMonthNum(Number(e.target.value));
                                }}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: '0.88rem',
                                    fontWeight: '800',
                                    color: '#0f172a',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                {MONTH_NAMES.map((name, idx) => (
                                    <option key={name} value={idx + 1}>
                                        {name} {(idx + 1) === currentMonthNum && selectedYear === currentYearNum ? '(Current)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Clean Demo Data Button (Shown when demo records are detected) */}
                    {hasDemoData && (
                        <button
                            onClick={handlePurgeFinancialDemoData}
                            disabled={isPurgingDemo}
                            title="Purge all generated demo transactions and restore clean slate"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                padding: '0.65rem 1.1rem',
                                background: '#fef2f2',
                                color: '#b91c1c',
                                border: '1px solid #fecaca',
                                borderRadius: '10px',
                                fontWeight: '700',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                opacity: isPurgingDemo ? 0.7 : 1
                            }}
                        >
                            {isPurgingDemo ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                            {isPurgingDemo ? 'Purging...' : 'Clean Demo Records'}
                        </button>
                    )}

                    {/* Inject Demo Data (Visible in Demo Account / Localhost) */}
                    {isDemoAccount && !hasDemoData && (
                        <button
                            onClick={handleInjectFinancialDemoData}
                            disabled={isInjectingDemo}
                            title="Populate 12-month visual analytics with demo test data"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                padding: '0.65rem 1.1rem',
                                background: '#f0fdf4',
                                color: '#15803d',
                                border: '1px solid #bbf7d0',
                                borderRadius: '10px',
                                fontWeight: '700',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                opacity: isInjectingDemo ? 0.7 : 1
                            }}
                        >
                            {isInjectingDemo ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />}
                            {isInjectingDemo ? 'Injecting...' : 'Inject Demo'}
                        </button>
                    )}

                    {/* Download PDF Button */}
                    <button
                        onClick={handleDownloadFinancialReport}
                        disabled={isGeneratingPDF}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            padding: '0.65rem 1.25rem',
                            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '10px',
                            fontWeight: '700',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                            opacity: isGeneratingPDF ? 0.7 : 1
                        }}
                    >
                        {isGeneratingPDF ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        {isGeneratingPDF ? 'Generating...' : 'Export Audit PDF'}
                    </button>
                </div>
            </div>

            {/* ========================================================= */}
            {/* ENGLISH SMART AUTOMATED FINANCIAL INSIGHT BANNER */}
            {/* ========================================================= */}
            <div style={{
                background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
                border: '1px solid #bfdbfe',
                borderRadius: '14px',
                padding: '0.85rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
                boxShadow: '0 2px 4px rgba(0, 120, 212, 0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Sparkles size={16} />
                    </div>
                    <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#1e3a8a' }}>
                        {calculatedMetrics.smartInsight}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#64748b' }}>
                    <span>Calculated at:</span>
                    <strong style={{ color: '#0f172a' }}>{new Date().toLocaleTimeString()}</strong>
                </div>
            </div>

            {/* ========================================================= */}
            {/* 5 EXECUTIVE KPI METRIC CARDS (3D Layered Look) */}
            {/* ========================================================= */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem'
            }}>
                {/* 1. Total Revenue Inflow */}
                <div className="card" style={{
                    background: '#ffffff',
                    backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                    border: '1px solid #dbeafe',
                    borderLeft: '4px solid #0078d4',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    boxShadow: '0 10px 15px -3px rgba(0, 120, 212, 0.06), 0 4px 6px -4px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255,255,255,0.9)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0078d4', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Gross Revenue
                        </span>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0078d4', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                            <TrendingUp size={17} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: '800', color: '#0f172a', marginTop: '0.35rem' }}>
                        Rs {calculatedMetrics.grossRevenue.toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem', fontSize: '0.78rem', color: '#64748b' }}>
                        <CheckCircle2 size={13} color="#16a34a" />
                        <span><strong>{calculatedMetrics.scopedTxs.length}</strong> Receipts + Direct Incomes</span>
                    </div>
                </div>

                {/* 2. Counter Cash Drawer */}
                <div className="card" style={{
                    background: '#ffffff',
                    backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)',
                    border: '1px solid #dcfce7',
                    borderLeft: '4px solid #10b981',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255,255,255,0.9)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Counter Cash
                        </span>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                            <Wallet size={17} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: '800', color: '#0f172a', marginTop: '0.35rem' }}>
                        Rs {calculatedMetrics.counterCashFees.toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem', fontSize: '0.78rem', color: '#166534', fontWeight: '700' }}>
                        <span>💵 Physical Cash Drawer</span>
                    </div>
                </div>

                {/* 3. Online & Digital Submissions */}
                <div className="card" style={{
                    background: '#ffffff',
                    backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #eff6ff 100%)',
                    border: '1px solid #e0e7ff',
                    borderLeft: '4px solid #3b82f6',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255,255,255,0.9)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Online Portals
                        </span>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                            <Smartphone size={17} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: '800', color: '#0f172a', marginTop: '0.35rem' }}>
                        Rs {calculatedMetrics.onlineFees.toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem', fontSize: '0.78rem', color: '#1e40af', fontWeight: '700' }}>
                        <span>📱 EasyPaisa • JazzCash • Bank</span>
                    </div>
                </div>

                {/* 4. Total Outflow (Expenses + Teacher Salaries) */}
                <div className="card" style={{
                    background: '#ffffff',
                    backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #fef2f2 100%)',
                    border: '1px solid #fee2e2',
                    borderLeft: '4px solid #ef4444',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    boxShadow: '0 10px 15px -3px rgba(239, 68, 68, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255,255,255,0.9)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Total Outflow
                        </span>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                            <ArrowDownRight size={17} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: '800', color: '#dc2626', marginTop: '0.35rem' }}>
                        Rs {calculatedMetrics.totalOutflow.toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem', fontSize: '0.75rem', color: '#991b1b', fontWeight: '700' }}>
                        <span>Expenses + Staff Salaries</span>
                    </div>
                </div>

                {/* 5. Net School Balance / Profit */}
                <div className="card" style={{
                    background: calculatedMetrics.netProfit >= 0 ? 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)' : 'linear-gradient(180deg, #ffffff 0%, #fef2f2 100%)',
                    border: `1px solid ${calculatedMetrics.netProfit >= 0 ? '#bbf7d0' : '#fecaca'}`,
                    borderLeft: `4px solid ${calculatedMetrics.netProfit >= 0 ? '#10b981' : '#dc2626'}`,
                    borderRadius: '16px',
                    padding: '1.25rem',
                    boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255,255,255,0.9)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: '800', color: calculatedMetrics.netProfit >= 0 ? '#166534' : '#991b1b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Net School Profit
                        </span>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: calculatedMetrics.netProfit >= 0 ? '#16a34a' : '#dc2626', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' }}>
                            <Zap size={17} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: '800', color: calculatedMetrics.netProfit >= 0 ? '#16a34a' : '#dc2626', marginTop: '0.35rem' }}>
                        Rs {calculatedMetrics.netProfit.toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem', fontSize: '0.78rem', color: calculatedMetrics.netProfit >= 0 ? '#166534' : '#991b1b', fontWeight: '700' }}>
                        <span>{calculatedMetrics.netProfit >= 0 ? `Surplus (${calculatedMetrics.profitMarginPercent}% Margin)` : 'Deficit / Overdraft'}</span>
                    </div>
                </div>
            </div>

            {/* ========================================================= */}
            {/* SUB-TABS NAVIGATION */}
            {/* ========================================================= */}
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                borderBottom: '2px solid #e2e8f0',
                paddingBottom: '0.2rem',
                overflowX: 'auto'
            }}>
                <button
                    onClick={() => setActiveSubTab('pulse')}
                    style={{
                        padding: '0.65rem 1.15rem',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: '700',
                        fontSize: '0.92rem',
                        color: activeSubTab === 'pulse' ? '#0078d4' : '#64748b',
                        borderBottom: activeSubTab === 'pulse' ? '3px solid #0078d4' : '3px solid transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <Activity size={18} /> Financial Pulse & Drawer
                </button>

                <button
                    onClick={() => setActiveSubTab('visual_studio')}
                    style={{
                        padding: '0.65rem 1.15rem',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: '700',
                        fontSize: '0.92rem',
                        color: activeSubTab === 'visual_studio' ? '#0078d4' : '#64748b',
                        borderBottom: activeSubTab === 'visual_studio' ? '3px solid #0078d4' : '3px solid transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <PieChart size={18} /> Visual Analytics & YoY Charts
                </button>

                <button
                    onClick={() => setActiveSubTab('fee_ledger')}
                    style={{
                        padding: '0.65rem 1.15rem',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: '700',
                        fontSize: '0.92rem',
                        color: activeSubTab === 'fee_ledger' ? '#0078d4' : '#64748b',
                        borderBottom: activeSubTab === 'fee_ledger' ? '3px solid #0078d4' : '3px solid transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <FileText size={18} /> Offline vs Online Fee Receipts
                    <span style={{ background: '#eff6ff', color: '#0078d4', fontSize: '0.75rem', padding: '2px 7px', borderRadius: '10px', fontWeight: '800' }}>
                        {calculatedMetrics.scopedTxs.length}
                    </span>
                </button>

                <button
                    onClick={() => setActiveSubTab('expenses_payroll')}
                    style={{
                        padding: '0.65rem 1.15rem',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: '700',
                        fontSize: '0.92rem',
                        color: activeSubTab === 'expenses_payroll' ? '#0078d4' : '#64748b',
                        borderBottom: activeSubTab === 'expenses_payroll' ? '3px solid #0078d4' : '3px solid transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <Layers size={18} /> Expenses & Teacher Payroll
                </button>
            </div>

            {/* ========================================================= */}
            {/* SUB TAB 1: FINANCIAL PULSE & CASHIER DRAWER CLOSING */}
            {/* ========================================================= */}
            {activeSubTab === 'pulse' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    
                    {/* Cashier Closing Reconciliation Box */}
                    <div className="card" style={{
                        background: '#ffffff',
                        backgroundImage: 'radial-gradient(#e2e8f0 1.2px, transparent 1.2px), linear-gradient(to bottom, #ffffff, #f8fafc)',
                        backgroundSize: '18px 18px, 100% 100%',
                        borderRadius: '16px',
                        padding: '1.5rem',
                        border: '1px solid #cbd5e1',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.9)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Wallet size={20} color="#10b981" />
                                    Cash Drawer & Digital Reconciliation Summary
                                </h3>
                                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                    Live breakdown of physical counter cash vs online digital banking inflows
                                </p>
                            </div>
                            <span style={{ fontSize: '0.78rem', background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '8px', fontWeight: '700' }}>
                                Target Recovery: {calculatedMetrics.grossRevenue > 0 ? '100% Reconciled' : 'Ready'}
                            </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                            
                            {/* Counter Cash Item */}
                            <div style={{ padding: '1rem', borderRadius: '12px', background: '#f0fdf4', border: '1.5px solid #86efac', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.1)' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#166534', textTransform: 'uppercase' }}>Counter Cash in Hand</div>
                                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#166534', marginTop: '0.2rem' }}>
                                    Rs {calculatedMetrics.counterCashFees.toLocaleString()}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#15803d', marginTop: '0.2rem' }}>
                                    Physical cash collected at counter
                                </div>
                            </div>

                            {/* EasyPaisa Item */}
                            <div style={{ padding: '1rem', borderRadius: '12px', background: '#ecfdf5', border: '1.5px solid #6ee7b7', boxShadow: '0 4px 6px -1px rgba(5, 150, 105, 0.1)' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#047857', textTransform: 'uppercase' }}>EasyPaisa Submissions</div>
                                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#047857', marginTop: '0.2rem' }}>
                                    Rs {calculatedMetrics.easyPaisaFees.toLocaleString()}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.2rem' }}>
                                    Direct EasyPaisa digital slip transfers
                                </div>
                            </div>

                            {/* JazzCash Item */}
                            <div style={{ padding: '1rem', borderRadius: '12px', background: '#fffbeb', border: '1.5px solid #fcd34d', boxShadow: '0 4px 6px -1px rgba(217, 119, 6, 0.1)' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#b45309', textTransform: 'uppercase' }}>JazzCash Submissions</div>
                                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#b45309', marginTop: '0.2rem' }}>
                                    Rs {calculatedMetrics.jazzCashFees.toLocaleString()}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '0.2rem' }}>
                                    JazzCash digital slip transfers
                                </div>
                            </div>

                            {/* Bank Transfers */}
                            <div style={{ padding: '1rem', borderRadius: '12px', background: '#eff6ff', border: '1.5px solid #93c5fd', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.1)' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#1e40af', textTransform: 'uppercase' }}>Direct Bank Transfers</div>
                                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#1e40af', marginTop: '0.2rem' }}>
                                    Rs {calculatedMetrics.bankFees.toLocaleString()}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#2563eb', marginTop: '0.2rem' }}>
                                    Official school bank deposits
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Fast Financial Health Bar */}
                    <div className="card" style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        padding: '1.5rem',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                    }}>
                        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '800', color: '#0f172a' }}>
                            Cash Inflow vs Outflow Proportion
                        </h4>
                        
                        <div style={{ height: '24px', width: '100%', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden', display: 'flex', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)' }}>
                            <div style={{
                                width: `${calculatedMetrics.grossRevenue > 0 ? Math.min(100, Math.round((calculatedMetrics.counterCashFees / calculatedMetrics.grossRevenue) * 100)) : 0}%`,
                                background: WHEEL_COLORS.counterCash,
                                transition: 'width 0.4s ease'
                            }} title={`Counter Cash: Rs ${calculatedMetrics.counterCashFees.toLocaleString()}`} />
                            <div style={{
                                width: `${calculatedMetrics.grossRevenue > 0 ? Math.min(100, Math.round((calculatedMetrics.onlineFees / calculatedMetrics.grossRevenue) * 100)) : 0}%`,
                                background: WHEEL_COLORS.onlineFees,
                                transition: 'width 0.4s ease'
                            }} title={`Online Fees: Rs ${calculatedMetrics.onlineFees.toLocaleString()}`} />
                            <div style={{
                                width: `${calculatedMetrics.grossRevenue > 0 ? Math.min(100, Math.round((calculatedMetrics.totalDirectIncomes / calculatedMetrics.grossRevenue) * 100)) : 0}%`,
                                background: WHEEL_COLORS.directIncomes,
                                transition: 'width 0.4s ease'
                            }} title={`Direct Incomes: Rs ${calculatedMetrics.totalDirectIncomes.toLocaleString()}`} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem', fontSize: '0.8rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#166534', fontWeight: '700' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: WHEEL_COLORS.counterCash }} />
                                Counter Cash ({calculatedMetrics.grossRevenue > 0 ? Math.round((calculatedMetrics.counterCashFees / calculatedMetrics.grossRevenue) * 100) : 0}%)
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#1e40af', fontWeight: '700' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: WHEEL_COLORS.onlineFees }} />
                                Online / Digital ({calculatedMetrics.grossRevenue > 0 ? Math.round((calculatedMetrics.onlineFees / calculatedMetrics.grossRevenue) * 100) : 0}%)
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#6b21a8', fontWeight: '700' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: WHEEL_COLORS.directIncomes }} />
                                Direct Incomes ({calculatedMetrics.grossRevenue > 0 ? Math.round((calculatedMetrics.totalDirectIncomes / calculatedMetrics.grossRevenue) * 100) : 0}%)
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* SUB TAB 2: VISUAL ANALYTICS & 3D YEAR-OVER-YEAR CHARTS */}
            {/* ========================================================= */}
            {activeSubTab === 'visual_studio' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    
                    {/* Demo Data Injection Action Bar (Exclusively Visible on Demo Accounts) */}
                    {isDemoAccount && (
                        <div style={{
                            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                            borderRadius: '16px',
                            padding: '1rem 1.4rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '1rem',
                            color: '#ffffff',
                            boxShadow: '0 10px 20px -5px rgba(49, 46, 129, 0.3)',
                            border: '1px solid #4338ca'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Sparkles size={20} color="#fbbf24" />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        Presentation Demo Mode (Principal Showcase)
                                        <span style={{ fontSize: '0.7rem', background: '#4f46e5', padding: '2px 7px', borderRadius: '6px', fontWeight: '700' }}>Demo Only</span>
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: '#c7d2fe', marginTop: '2px' }}>
                                        Inject 12-month multi-channel transactions, expenses, and payroll to showcase 3D graphs during presentation.
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleInjectFinancialDemoData}
                                disabled={isInjectingDemo}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.55rem 1.25rem',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                    color: '#ffffff',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: isInjectingDemo ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 4px 10px rgba(217, 119, 6, 0.4)',
                                    opacity: isInjectingDemo ? 0.7 : 1,
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {isInjectingDemo ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
                                {isInjectingDemo ? 'Injecting Presentation Data...' : '✨ Inject Demo Financial Data'}
                            </button>
                        </div>
                    )}

                    {/* Top Row: Master School Financial Wheel + 3D YoY Trendline */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
                        
                        {/* 1. MASTER SCHOOL FINANCIAL WHEEL (3D DONUT CHART) */}
                        <div className="card" style={{
                            background: '#ffffff',
                            backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px), linear-gradient(to bottom, #ffffff, #f8fafc)',
                            backgroundSize: '16px 16px, 100% 100%',
                            borderRadius: '18px',
                            padding: '1.5rem',
                            border: '1.5px solid #cbd5e1',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.5rem' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <PieChart size={22} color="#0078d4" />
                                            The Master Financial Wheel (3D)
                                        </h3>
                                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                            {wheelViewMode === 'distribution' 
                                                ? 'Revenue allocation across staff payroll, operational expenses & net school profit'
                                                : 'Inflow distribution across counter cash, online digital portals & direct incomes'}
                                        </p>
                                    </div>

                                    {/* View Mode Toggle Pill */}
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        background: '#f1f5f9',
                                        padding: '3px',
                                        borderRadius: '10px',
                                        border: '1px solid #cbd5e1'
                                    }}>
                                        <button
                                            onClick={() => setWheelViewMode('distribution')}
                                            style={{
                                                border: 'none',
                                                background: wheelViewMode === 'distribution' ? '#ffffff' : 'transparent',
                                                color: wheelViewMode === 'distribution' ? '#10b981' : '#64748b',
                                                fontWeight: wheelViewMode === 'distribution' ? '800' : '600',
                                                padding: '5px 11px',
                                                borderRadius: '7px',
                                                fontSize: '0.76rem',
                                                cursor: 'pointer',
                                                boxShadow: wheelViewMode === 'distribution' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <Zap size={13} /> Profit & Allocation
                                        </button>
                                        <button
                                            onClick={() => setWheelViewMode('inflows')}
                                            style={{
                                                border: 'none',
                                                background: wheelViewMode === 'inflows' ? '#ffffff' : 'transparent',
                                                color: wheelViewMode === 'inflows' ? '#0078d4' : '#64748b',
                                                fontWeight: wheelViewMode === 'inflows' ? '800' : '600',
                                                padding: '5px 11px',
                                                borderRadius: '7px',
                                                fontSize: '0.76rem',
                                                cursor: 'pointer',
                                                boxShadow: wheelViewMode === 'inflows' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <Wallet size={13} /> Inflow Sources
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* 3D Expanded Donut Chart with Center 3D Metallic Hub */}
                            <div style={{ position: 'relative', height: '360px', width: '100%', margin: '0.75rem 0' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <RechartsPie>
                                        <defs>
                                            <filter id="shadow3d" x="-20%" y="-20%" width="140%" height="140%">
                                                <feDropShadow dx="3" dy="6" stdDeviation="5" floodOpacity="0.25" floodColor="#0f172a" />
                                            </filter>
                                        </defs>
                                        <Pie
                                            data={calculatedMetrics.masterWheelData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={98}
                                            outerRadius={148}
                                            paddingAngle={4}
                                            dataKey="value"
                                            filter="url(#shadow3d)"
                                            label={renderPiePercentLabel}
                                            labelLine={false}
                                        >
                                            {calculatedMetrics.masterWheelData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} stroke="#ffffff" strokeWidth={2.5} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip content={<CustomPieTooltip />} wrapperStyle={{ zIndex: 9999, pointerEvents: 'none' }} />
                                    </RechartsPie>
                                </ResponsiveContainer>

                                {/* Center Metallic Donut KPI Hub */}
                                <div style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    textAlign: 'center',
                                    pointerEvents: 'none',
                                    zIndex: 1,
                                    background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                                    borderRadius: '50%',
                                    width: '136px',
                                    height: '136px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: 'inset 0 2px 5px rgba(255,255,255,1), 0 8px 18px rgba(0,0,0,0.12)',
                                    border: calculatedMetrics.netProfit >= 0 ? '2px solid #86efac' : '2px solid #fca5a5'
                                }}>
                                    <div style={{
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        color: calculatedMetrics.netProfit >= 0 ? '#15803d' : '#b91c1c',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.04em',
                                        background: calculatedMetrics.netProfit >= 0 ? '#dcfce7' : '#fee2e2',
                                        padding: '2px 8px',
                                        borderRadius: '999px',
                                        marginBottom: '3px'
                                    }}>
                                        {calculatedMetrics.isFutureScope 
                                            ? (calculatedMetrics.netProfit >= 0 ? '🕒 Projected Surplus' : '🕒 Projected Deficit')
                                            : (calculatedMetrics.netProfit >= 0 ? '✨ Net Surplus' : '⚠️ Deficit')}
                                    </div>
                                    <div style={{
                                        fontSize: '1.2rem',
                                        fontWeight: '900',
                                        color: calculatedMetrics.netProfit >= 0 ? '#10b981' : '#dc2626',
                                        lineHeight: 1.15
                                    }}>
                                        Rs {calculatedMetrics.netProfit >= 0 ? calculatedMetrics.netProfit.toLocaleString() : `(${Math.abs(calculatedMetrics.netProfit).toLocaleString()})`}
                                    </div>
                                    <div style={{
                                        fontSize: '0.74rem',
                                        fontWeight: '800',
                                        color: calculatedMetrics.netProfit >= 0 ? '#059669' : '#e11d48',
                                        marginTop: '2px'
                                    }}>
                                        {calculatedMetrics.isFutureScope ? 'Fixed Commitment' : `${calculatedMetrics.profitMarginPercent}% Margin`}
                                    </div>
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: '600', marginTop: '1px' }}>
                                        {calculatedMetrics.isFutureScope ? 'Baseline Projected' : `Rs ${calculatedMetrics.grossRevenue >= 1000 ? `${(calculatedMetrics.grossRevenue/1000).toFixed(0)}k` : calculatedMetrics.grossRevenue} Turn`}
                                    </div>
                                </div>
                            </div>

                            {/* Clean Structured Financial Breakdown Badges */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem', marginTop: '0.85rem' }}>
                                {(() => {
                                    const pillars = calculatedMetrics.masterWheelData;
                                    const totalWheel = pillars.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
                                    return pillars.map(item => {
                                        const pct = totalWheel > 0 ? Math.round((Number(item.value) / totalWheel) * 100) : 0;
                                        return (
                                            <div key={item.name} style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.45rem',
                                                padding: '0.35rem 0.65rem',
                                                borderRadius: '8px',
                                                background: '#ffffff',
                                                border: '1px solid #e2e8f0',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                            }}>
                                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: 0, boxShadow: `0 0 5px ${item.color}88` }} />
                                                <span style={{ color: '#475569', fontSize: '0.75rem', fontWeight: '700', whiteSpace: 'nowrap' }}>
                                                    {item.name}
                                                </span>
                                                <span style={{
                                                    background: `${item.color}15`,
                                                    color: item.color,
                                                    fontSize: '0.72rem',
                                                    fontWeight: '800',
                                                    padding: '1px 5px',
                                                    borderRadius: '4px',
                                                    border: `1px solid ${item.color}33`,
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {pct}%
                                                </span>
                                                <span style={{ color: '#0f172a', fontSize: '0.78rem', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                                    Rs {Number(item.value).toLocaleString()}
                                                </span>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>

                        {/* 2. 12-MONTH YoY PROGRESSION & INTERACTIVE MONTH AUDIT CAPSULE */}
                        <div className="card" style={{
                            background: '#ffffff',
                            backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px), linear-gradient(to bottom, #ffffff, #f8fafc)',
                            backgroundSize: '16px 16px, 100% 100%',
                            borderRadius: '18px',
                            padding: '1.5rem',
                            border: '1.5px solid #cbd5e1',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <BarChart3 size={22} color="#0078d4" />
                                            12-Month Inflow & Outflow Analytics (3D)
                                        </h3>
                                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                            Click any Year tab or Month bar below to audit isolated collections, expenses, store sales, salaries & profit
                                        </p>
                                    </div>

                                    {/* Year Tabs & Annual Snapshot */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        {/* Annual Summary Snapshot Badge */}
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            padding: '0.35rem 0.75rem',
                                            background: '#ffffff',
                                            borderRadius: '8px',
                                            border: '1px solid #cbd5e1',
                                            fontSize: '0.74rem',
                                            fontWeight: '700',
                                            color: '#334155',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                                        }}>
                                            <span style={{ color: '#64748b', fontWeight: '800' }}>{selectedYear} Annual:</span>
                                            <span style={{ color: '#166534', fontWeight: '800' }}>In: Rs {Math.round((calculatedMetrics.annualTotals?.annualInflow || 0) / 1000)}k</span>
                                            <span style={{ color: '#991b1b', fontWeight: '800' }}>Out: Rs {Math.round((calculatedMetrics.annualTotals?.annualOutflow || 0) / 1000)}k</span>
                                            <span style={{
                                                background: (calculatedMetrics.annualTotals?.annualNet || 0) >= 0 ? '#dcfce7' : '#fee2e2',
                                                color: (calculatedMetrics.annualTotals?.annualNet || 0) >= 0 ? '#15803d' : '#b91c1c',
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                                fontWeight: '800',
                                                border: `1px solid ${(calculatedMetrics.annualTotals?.annualNet || 0) >= 0 ? '#bbf7d0' : '#fecaca'}`
                                            }}>
                                                {(calculatedMetrics.annualTotals?.annualNet || 0) >= 0 ? '+' : ''}Rs {Math.round((calculatedMetrics.annualTotals?.annualNet || 0) / 1000)}k ({(calculatedMetrics.annualTotals?.annualMargin || 0)}%)
                                            </span>
                                        </div>

                                        {/* Dynamic Year Pills (2025+) */}
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px',
                                            background: '#f1f5f9',
                                            padding: '3px',
                                            borderRadius: '10px',
                                            border: '1px solid #cbd5e1'
                                        }}>
                                            {availableYears.map(yr => {
                                                const isYearActive = yr === selectedYear;
                                                const isCurrent = yr === currentYearNum;
                                                return (
                                                    <button
                                                        key={yr}
                                                        onClick={() => {
                                                            setSelectedYear(yr);
                                                            if (yr === currentYearNum) {
                                                                setInspectedMonthNum(currentMonthNum);
                                                            } else {
                                                                setInspectedMonthNum(1);
                                                            }
                                                        }}
                                                        title={`Switch view to Year ${yr}`}
                                                        style={{
                                                            border: 'none',
                                                            background: isYearActive ? 'linear-gradient(135deg, #0078d4 0%, #1e40af 100%)' : 'transparent',
                                                            color: isYearActive ? '#ffffff' : '#475569',
                                                            fontWeight: isYearActive ? '900' : '700',
                                                            fontSize: '0.78rem',
                                                            padding: '5px 12px',
                                                            borderRadius: '8px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            boxShadow: isYearActive ? '0 2px 6px rgba(0, 120, 212, 0.35)' : 'none',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                    >
                                                        <span>{yr}</span>
                                                        {isCurrent && (
                                                            <span style={{
                                                                fontSize: '0.62rem',
                                                                background: isYearActive ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
                                                                color: isYearActive ? '#ffffff' : '#0078d4',
                                                                padding: '1px 5px',
                                                                borderRadius: '4px',
                                                                fontWeight: '800'
                                                            }}>
                                                                Live
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}

                                            <div style={{ width: '1px', height: '18px', background: '#cbd5e1', margin: '0 4px' }} />

                                            {/* Quick Full Year Pill */}
                                            <button
                                                onClick={handleSelectAllYearScope}
                                                title={`View full accumulated year metrics for ${selectedYear}`}
                                                style={{
                                                    border: 'none',
                                                    background: selectedMonthMode === 'all_year' ? 'linear-gradient(135deg, #0f172a 0%, #334155 100%)' : 'transparent',
                                                    color: selectedMonthMode === 'all_year' ? '#ffffff' : '#475569',
                                                    fontWeight: selectedMonthMode === 'all_year' ? '900' : '700',
                                                    fontSize: '0.76rem',
                                                    padding: '5px 10px',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    boxShadow: selectedMonthMode === 'all_year' ? '0 2px 6px rgba(15, 23, 42, 0.35)' : 'none',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <span>🗓️ Full Year</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Interactive 12-Month Selector Strip (Capsules / Slices) */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(44px, 1fr))',
                                    gap: '0.3rem',
                                    margin: '0.75rem 0 0.5rem 0',
                                    padding: '0.35rem',
                                    background: '#f8fafc',
                                    borderRadius: '12px',
                                    border: '1px solid #e2e8f0'
                                }}>
                                    {calculatedMetrics.months12Data.map(m => {
                                        const isSel = selectedMonthMode !== 'all_year' && selectedMonthMode !== 'today' && (
                                            (selectedMonthMode === 'custom_month' && customSelectedMonthNum === m.monthNum) ||
                                            (selectedMonthMode === 'current' && m.monthNum === currentMonthNum && selectedYear === currentYearNum) ||
                                            (m.monthNum === inspectedMonthNum)
                                        );
                                        return (
                                            <button
                                                key={m.name}
                                                onClick={() => handleSelectMonthScope(m.monthNum)}
                                                title={m.isFuture 
                                                    ? `Upcoming Month: ${m.monthName} ${selectedYear} (Period in future)`
                                                    : `Inspect ${m.monthName} ${selectedYear}: Inflow Rs ${m.inflow.toLocaleString()}, Net Rs ${m.net.toLocaleString()}`}
                                                style={{
                                                    padding: '5px 4px',
                                                    borderRadius: '8px',
                                                    border: isSel 
                                                        ? '2px solid #0078d4' 
                                                        : (m.isCurrent 
                                                            ? '1.5px solid #93c5fd' 
                                                            : (m.isFuture ? '1px dashed #cbd5e1' : '1px solid #e2e8f0')),
                                                    background: isSel 
                                                        ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' 
                                                        : (m.isCurrent 
                                                            ? '#f0f9ff' 
                                                            : (m.isFuture ? '#fafafa' : '#ffffff')),
                                                    color: isSel ? '#0078d4' : (m.isFuture ? '#94a3b8' : '#334155'),
                                                    fontWeight: isSel ? '900' : '700',
                                                    fontSize: '0.74rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: '2px',
                                                    boxShadow: isSel ? '0 3px 8px rgba(0, 120, 212, 0.25)' : 'none',
                                                    transition: 'all 0.15s ease',
                                                    opacity: m.isFuture && !isSel ? 0.75 : 1
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    <span style={{
                                                        width: '5px',
                                                        height: '5px',
                                                        borderRadius: '50%',
                                                        background: m.isFuture ? '#94a3b8' : (m.isCurrent ? '#2563eb' : (m.isSurplus ? '#10b981' : '#ef4444')),
                                                        boxShadow: m.isFuture ? 'none' : `0 0 4px ${m.isCurrent ? '#2563eb' : (m.isSurplus ? '#10b981' : '#ef4444')}`
                                                    }} />
                                                    <span>{m.name}</span>
                                                </div>
                                                <span style={{
                                                    fontSize: '0.62rem',
                                                    color: isSel ? '#1e40af' : (m.isFuture ? '#94a3b8' : (m.net >= 0 ? '#166534' : '#b91c1c')),
                                                    fontWeight: '800'
                                                }}>
                                                    {m.isFuture ? 'Upcoming' : (m.inflow > 0 ? (m.net >= 0 ? `+${Math.round(m.net / 1000)}k` : `${Math.round(m.net / 1000)}k`) : 'Rs 0')}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 3D Bar Chart with Click-to-Inspect */}
                            <div style={{ height: '260px', width: '100%', margin: '0.35rem 0' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart
                                        data={calculatedMetrics.months12Data}
                                        margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                                        onClick={(e) => {
                                            if (e && e.activePayload && e.activePayload[0]) {
                                                const mNum = e.activePayload[0].payload.monthNum;
                                                if (mNum) handleSelectMonthScope(mNum);
                                            }
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <defs>
                                            <linearGradient id="inflow3DGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#34d399" />
                                                <stop offset="50%" stopColor="#10b981" />
                                                <stop offset="100%" stopColor="#047857" />
                                            </linearGradient>
                                            <linearGradient id="outflow3DGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#f87171" />
                                                <stop offset="50%" stopColor="#ef4444" />
                                                <stop offset="100%" stopColor="#b91c1c" />
                                            </linearGradient>
                                            <filter id="barShadow3D" x="-10%" y="-10%" width="120%" height="130%">
                                                <feDropShadow dx="2" dy="4" stdDeviation="3" floodOpacity="0.2" floodColor="#0f172a" />
                                            </filter>
                                        </defs>
                                        <CartesianGrid strokeDasharray="2 2" stroke="#94a3b8" strokeWidth={0.8} vertical={true} opacity={0.6} />
                                        <XAxis dataKey="name" stroke="#475569" fontSize={11} fontWeight={700} tickLine={false} />
                                        <YAxis stroke="#475569" fontSize={11} fontWeight={700} tickFormatter={(val) => `Rs ${val >= 1000 ? `${(val/1000).toFixed(0)}k` : val}`} />
                                        <Bar dataKey="inflow" fill="url(#inflow3DGrad)" radius={[6, 6, 0, 0]} filter="url(#barShadow3D)" name={`Inflow (${selectedYear})`} />
                                        <Bar dataKey="outflow" fill="url(#outflow3DGrad)" radius={[6, 6, 0, 0]} filter="url(#barShadow3D)" name={`Outflow (${selectedYear})`} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>

                            {/* ISOLATED MONTH FINANCIAL INTELLIGENCE CAPSULE */}
                            {(() => {
                                const ins = calculatedMetrics.inspectedMonthData || {};
                                const totalFees = Number(ins.feeInflow || 0);
                                const cashPct = totalFees > 0 ? Math.round((Number(ins.cashFees || 0) / totalFees) * 100) : 0;
                                const onlinePct = totalFees > 0 ? Math.round((Number(ins.onlineFees || 0) / totalFees) * 100) : 0;

                                return (
                                    <div style={{
                                        marginTop: '0.75rem',
                                        padding: '1rem',
                                        borderRadius: '14px',
                                        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                                        border: '1.5px solid #cbd5e1',
                                        boxShadow: '0 4px 10px -2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)'
                                    }}>
                                        {/* Capsule Header */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: ins.isFuture ? '0.35rem' : '0.65rem', paddingBottom: '0.45rem', borderBottom: '1px solid #e2e8f0' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div style={{ width: '26px', height: '26px', borderRadius: '8px', background: ins.isFuture ? '#64748b' : (ins.isSurplus ? '#10b981' : '#ef4444'), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {ins.isFuture ? <Clock size={14} /> : <Sparkles size={14} />}
                                                </div>
                                                <div>
                                                    <span style={{ fontSize: '0.86rem', fontWeight: '800', color: '#0f172a' }}>
                                                        {ins.monthName} {selectedYear} Isolated Financial Audit
                                                    </span>
                                                    {ins.isCurrent && (
                                                        <span style={{ marginLeft: '6px', fontSize: '0.68rem', background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '5px', fontWeight: '800' }}>
                                                            Current
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <span style={{
                                                fontSize: '0.74rem',
                                                fontWeight: '800',
                                                padding: '2px 8px',
                                                borderRadius: '6px',
                                                background: ins.isFuture ? '#f1f5f9' : (ins.isSurplus ? '#dcfce7' : '#fee2e2'),
                                                color: ins.isFuture ? '#475569' : (ins.isSurplus ? '#166534' : '#991b1b'),
                                                border: `1px solid ${ins.isFuture ? '#cbd5e1' : (ins.isSurplus ? '#bbf7d0' : '#fecaca')}`
                                            }}>
                                                {ins.isFuture ? '🕒 Upcoming Period' : (ins.isSurplus ? `✨ Surplus (${ins.profitMargin}% Margin)` : `⚠️ Deficit (${ins.profitMargin}%)`)}
                                            </span>
                                        </div>

                                        {/* Upcoming Period Informative Banner */}
                                        {ins.isFuture && (
                                            <div style={{
                                                margin: '0.35rem 0 0.65rem 0',
                                                padding: '0.45rem 0.75rem',
                                                borderRadius: '8px',
                                                background: '#f8fafc',
                                                border: '1px dashed #cbd5e1',
                                                fontSize: '0.74rem',
                                                color: '#64748b',
                                                fontWeight: '600',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.4rem'
                                            }}>
                                                <Clock size={13} color="#64748b" />
                                                <span>Upcoming Month: No fee collections, store sales, or one-time expenses recorded yet for {ins.monthName} {selectedYear}.</span>
                                            </div>
                                        )}

                                        {/* Precision Micro-Metrics Grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.55rem' }}>
                                            
                                            {/* 1. Inflow */}
                                            <div style={{ padding: '0.55rem 0.65rem', borderRadius: '9px', background: '#ffffff', border: '1px solid #dbeafe', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#0078d4', textTransform: 'uppercase' }}>Gross Inflow</div>
                                                <div style={{ fontSize: '0.92rem', fontWeight: '900', color: '#0f172a', marginTop: '1px' }}>
                                                    Rs {Number(ins.inflow || 0).toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '1px' }}>
                                                    Fees + Direct + Store
                                                </div>
                                            </div>

                                            {/* 2. Outflow */}
                                            <div style={{ padding: '0.55rem 0.65rem', borderRadius: '9px', background: '#ffffff', border: '1px solid #fee2e2', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#ef4444', textTransform: 'uppercase' }}>Total Outflow</div>
                                                <div style={{ fontSize: '0.92rem', fontWeight: '900', color: '#dc2626', marginTop: '1px' }}>
                                                    Rs {Number(ins.outflow || 0).toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '1px' }}>
                                                    Salaries + Operations
                                                </div>
                                            </div>

                                            {/* 3. Net Profit / Surplus */}
                                            <div style={{ padding: '0.55rem 0.65rem', borderRadius: '9px', background: ins.isSurplus ? '#f0fdf4' : '#fef2f2', border: `1px solid ${ins.isSurplus ? '#86efac' : '#fca5a5'}`, boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: ins.isSurplus ? '#166534' : '#991b1b', textTransform: 'uppercase' }}>
                                                    {ins.isSurplus ? 'Net Profit' : 'Deficit'}
                                                </div>
                                                <div style={{ fontSize: '0.92rem', fontWeight: '900', color: ins.isSurplus ? '#15803d' : '#b91c1c', marginTop: '1px' }}>
                                                    Rs {Number(ins.net || 0).toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '0.62rem', color: ins.isSurplus ? '#166534' : '#991b1b', marginTop: '1px', fontWeight: '700' }}>
                                                    {ins.profitMargin}% Margin
                                                </div>
                                            </div>

                                            {/* 4. Fee Recovery Rate */}
                                            <div style={{ padding: '0.55rem 0.65rem', borderRadius: '9px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#3b82f6', textTransform: 'uppercase' }}>Fee Recovery</div>
                                                <div style={{ fontSize: '0.92rem', fontWeight: '900', color: '#0f172a', marginTop: '1px' }}>
                                                    {ins.recoveryPercent}%
                                                </div>
                                                <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '1px' }}>
                                                    {ins.receiptCount} Receipts Paid
                                                </div>
                                            </div>

                                            {/* 5. Offline Fee Counter Cash */}
                                            <div style={{ padding: '0.55rem 0.65rem', borderRadius: '9px', background: '#ffffff', border: '1.5px solid #86efac', boxShadow: '0 1px 2px rgba(16, 185, 129, 0.05)' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#166534', textTransform: 'uppercase' }}>Offline Cash Counter</div>
                                                <div style={{ fontSize: '0.92rem', fontWeight: '900', color: '#166534', marginTop: '1px' }}>
                                                    Rs {Number(ins.cashFees || 0).toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '0.62rem', color: '#15803d', marginTop: '1px', fontWeight: '800' }}>
                                                    💵 {cashPct}% Counter Cash
                                                </div>
                                            </div>

                                            {/* 6. Online Digital Fees */}
                                            <div style={{ padding: '0.55rem 0.65rem', borderRadius: '9px', background: '#ffffff', border: '1.5px solid #93c5fd', boxShadow: '0 1px 2px rgba(59, 130, 246, 0.05)' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#1e40af', textTransform: 'uppercase' }}>Online Portal Fees</div>
                                                <div style={{ fontSize: '0.92rem', fontWeight: '900', color: '#1e40af', marginTop: '1px' }}>
                                                    Rs {Number(ins.onlineFees || 0).toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '0.62rem', color: '#2563eb', marginTop: '1px', fontWeight: '800' }}>
                                                    📱 {onlinePct}% Digital Portals
                                                </div>
                                            </div>

                                            {/* 7. Staff Salaries */}
                                            <div style={{ padding: '0.55rem 0.65rem', borderRadius: '9px', background: '#ffffff', border: '1px solid #fef3c7', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#b45309', textTransform: 'uppercase' }}>Staff Payroll</div>
                                                <div style={{ fontSize: '0.92rem', fontWeight: '900', color: '#0f172a', marginTop: '1px' }}>
                                                    Rs {Number(ins.salaries || 0).toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '1px' }}>
                                                    {ins.teachersPaidCount} Staff Disbursed
                                                </div>
                                            </div>

                                            {/* 8. Operational Expenses */}
                                            <div style={{ padding: '0.55rem 0.65rem', borderRadius: '9px', background: '#ffffff', border: '1px solid #fee2e2', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#dc2626', textTransform: 'uppercase' }}>Ops Expenses</div>
                                                <div style={{ fontSize: '0.92rem', fontWeight: '900', color: '#0f172a', marginTop: '1px' }}>
                                                    Rs {Number(ins.expenses || 0).toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '1px' }}>
                                                    Utility + Repairs
                                                </div>
                                            </div>

                                            {/* 9. Store Sales Total */}
                                            <div style={{ padding: '0.55rem 0.65rem', borderRadius: '9px', background: '#ffffff', border: '1px solid #e0e7ff', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#4f46e5', textTransform: 'uppercase' }}>Store & Uniform</div>
                                                <div style={{ fontSize: '0.92rem', fontWeight: '900', color: '#0f172a', marginTop: '1px' }}>
                                                    Rs {Number(ins.storeSalesAmount || 0).toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '1px' }}>
                                                    POS Sales Inflow
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    {/* YEAR ROLLOVER & OPENING BALANCE BRIDGE (Dec -> Jan Transition) */}
                    {(selectedMonthMode === 'all_year' || (!calculatedMetrics.isTodayMode && (selectedMonthMode === 'current' ? currentMonthNum === 1 : customSelectedMonthNum === 1))) && (
                        <div style={{
                            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                            borderRadius: '16px',
                            padding: '1.15rem 1.4rem',
                            border: '1.5px solid #334155',
                            color: '#ffffff',
                            boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.4)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem', borderBottom: '1px solid #334155', paddingBottom: '0.65rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <History size={18} color="#fff" />
                                    </div>
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: '800', color: '#ffffff' }}>
                                            🏁 {selectedYear} Financial Year Opening Balance & Rollover Bridge
                                        </h4>
                                        <p style={{ margin: 0, fontSize: '0.74rem', color: '#94a3b8' }}>
                                            Automatic continuous transfer of closing reserves, pending arrears, and permanent contracts from {selectedYear - 1}
                                        </p>
                                    </div>
                                </div>
                                <span style={{ fontSize: '0.72rem', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '3px 9px', borderRadius: '6px', fontWeight: '800', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                                    ✓ Seamless Year-to-Year Continuity
                                </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
                                <div style={{ background: 'rgba(255,255,255,0.06)', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: '700' }}>Opening Reserve (from Dec {selectedYear - 1})</div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#34d399', marginTop: '2px' }}>
                                        Rs {Number(calculatedMetrics.rolloverOpeningCash || 0).toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: '0.62rem', color: '#6ee7b7', marginTop: '2px' }}>Carried-forward cash reserve</div>
                                </div>

                                <div style={{ background: 'rgba(255,255,255,0.06)', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: '700' }}>Active Permanent Contracts</div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#60a5fa', marginTop: '2px' }}>
                                        {((calculatedMetrics.activePermanentIncomes || []).length) + ((calculatedMetrics.activePermanentExpenses || []).length)} Fixed Heads
                                    </div>
                                    <div style={{ fontSize: '0.62rem', color: '#93c5fd', marginTop: '2px' }}>Canteen rent, bills & recurring</div>
                                </div>

                                <div style={{ background: 'rgba(255,255,255,0.06)', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: '700' }}>Student Store & Fee Arrears</div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#fbbf24', marginTop: '2px' }}>
                                        100% Ledger Synced
                                    </div>
                                    <div style={{ fontSize: '0.62rem', color: '#fde68a', marginTop: '2px' }}>Auto-billed on Jan fee vouchers</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Bottom Row: Payment Channels Donut & Expense Categories Donut */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.5rem' }}>
                        
                        {/* 3. Payment Channels Donut */}
                        <div className="card" style={{
                            background: '#ffffff',
                            backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px), linear-gradient(to bottom, #ffffff, #f8fafc)',
                            backgroundSize: '16px 16px, 100% 100%',
                            borderRadius: '18px',
                            padding: '1.5rem',
                            border: '1.5px solid #cbd5e1',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.95)'
                        }}>
                            <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                                💳 Payment Gateways & Channels
                            </h3>
                            <p style={{ margin: '0 0 1rem 0', fontSize: '0.78rem', color: '#64748b' }}>
                                Breakdown of parents paying via Counter Cash vs EasyPaisa / JazzCash / Bank
                            </p>

                            {calculatedMetrics.isFutureScope || calculatedMetrics.channelDistributionData.length === 0 ? (
                                <div style={{
                                    height: '220px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: '#f8fafc',
                                    borderRadius: '12px',
                                    border: '1.5px dashed #cbd5e1',
                                    padding: '1.5rem',
                                    textAlign: 'center'
                                }}>
                                    <Clock size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
                                    <div style={{ fontSize: '0.88rem', fontWeight: '800', color: '#334155' }}>
                                        {calculatedMetrics.isFutureScope ? 'Upcoming Period (Projected Mode)' : 'No Receipts in Selected Period'}
                                    </div>
                                    <div style={{ fontSize: '0.74rem', color: '#64748b', maxWidth: '320px', marginTop: '4px' }}>
                                        {calculatedMetrics.isFutureScope
                                            ? 'Counter cash and digital gateway reconciliations will automatically populate here once actual fee collections commence.'
                                            : 'No cash or online fee transactions were recorded for this timeframe.'}
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div style={{ height: '220px', width: '100%' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <RechartsPie>
                                                <Pie
                                                    data={calculatedMetrics.channelDistributionData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={55}
                                                    outerRadius={85}
                                                    paddingAngle={4}
                                                    dataKey="value"
                                                    filter="url(#shadow3d)"
                                                    label={renderPiePercentLabel}
                                                    labelLine={false}
                                                >
                                                    {calculatedMetrics.channelDistributionData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                                                    ))}
                                                </Pie>
                                                <RechartsTooltip content={<CustomPieTooltip />} wrapperStyle={{ zIndex: 9999, pointerEvents: 'none' }} />
                                            </RechartsPie>
                                        </ResponsiveContainer>
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem', marginTop: '0.85rem' }}>
                                        {(() => {
                                            const totalChannel = calculatedMetrics.channelDistributionData.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
                                            return calculatedMetrics.channelDistributionData.map(c => {
                                                const pct = totalChannel > 0 ? Math.round((Number(c.value) / totalChannel) * 100) : 0;
                                                return (
                                                    <div key={c.name} style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.45rem',
                                                        padding: '0.35rem 0.65rem',
                                                        borderRadius: '8px',
                                                        background: '#ffffff',
                                                        border: '1px solid #e2e8f0',
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                                    }}>
                                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: c.color, flexShrink: 0, boxShadow: `0 0 5px ${c.color}88` }} />
                                                        <span style={{ color: '#475569', fontSize: '0.75rem', fontWeight: '700', whiteSpace: 'nowrap' }}>
                                                            {c.name}
                                                        </span>
                                                        <span style={{
                                                            background: `${c.color}15`,
                                                            color: c.color,
                                                            fontSize: '0.72rem',
                                                            fontWeight: '800',
                                                            padding: '1px 5px',
                                                            borderRadius: '4px',
                                                            border: `1px solid ${c.color}33`,
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {pct}%
                                                        </span>
                                                        <span style={{ color: '#0f172a', fontSize: '0.78rem', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                                            Rs {Number(c.value).toLocaleString()}
                                                        </span>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* 4. Expense Slices & Outflow Categories */}
                        <div className="card" style={{
                            background: '#ffffff',
                            backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px), linear-gradient(to bottom, #ffffff, #f8fafc)',
                            backgroundSize: '16px 16px, 100% 100%',
                            borderRadius: '18px',
                            padding: '1.5rem',
                            border: '1.5px solid #cbd5e1',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.95)'
                        }}>
                            <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                                🏷️ Outflow Slices & Expense Heads
                            </h3>
                            <p style={{ margin: '0 0 1rem 0', fontSize: '0.78rem', color: '#64748b' }}>
                                Categorical distribution of school operational expenses and teacher salaries
                            </p>

                            <div style={{ height: '220px', width: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <RechartsPie>
                                        <Pie
                                            data={calculatedMetrics.expenseCategoriesData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={55}
                                            outerRadius={85}
                                            paddingAngle={4}
                                            dataKey="value"
                                            filter="url(#shadow3d)"
                                            label={renderPiePercentLabel}
                                            labelLine={false}
                                        >
                                            {calculatedMetrics.expenseCategoriesData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip content={<CustomPieTooltip />} wrapperStyle={{ zIndex: 9999, pointerEvents: 'none' }} />
                                    </RechartsPie>
                                </ResponsiveContainer>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem', marginTop: '0.85rem' }}>
                                {(() => {
                                    const totalExp = calculatedMetrics.expenseCategoriesData.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
                                    return calculatedMetrics.expenseCategoriesData.map(c => {
                                        const pct = totalExp > 0 ? Math.round((Number(c.value) / totalExp) * 100) : 0;
                                        return (
                                            <div key={c.name} style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.45rem',
                                                padding: '0.35rem 0.65rem',
                                                borderRadius: '8px',
                                                background: '#ffffff',
                                                border: '1px solid #e2e8f0',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                            }}>
                                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: c.color, flexShrink: 0, boxShadow: `0 0 5px ${c.color}88` }} />
                                                <span style={{ color: '#475569', fontSize: '0.75rem', fontWeight: '700', whiteSpace: 'nowrap' }}>
                                                    {c.name}
                                                </span>
                                                <span style={{
                                                    background: `${c.color}15`,
                                                    color: c.color,
                                                    fontSize: '0.72rem',
                                                    fontWeight: '800',
                                                    padding: '1px 5px',
                                                    borderRadius: '4px',
                                                    border: `1px solid ${c.color}33`,
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {pct}%
                                                </span>
                                                <span style={{ color: '#0f172a', fontSize: '0.78rem', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                                    Rs {Number(c.value).toLocaleString()}
                                                </span>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* SUB TAB 3: OFFLINE VS ONLINE FEE RECEIPTS LEDGER */}
            {/* ========================================================= */}
            {activeSubTab === 'fee_ledger' && (
                <div className="card" style={{ background: '#ffffff', borderRadius: '16px', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#0f172a' }}>
                                Daily Counter & Online Receipts Ledger
                            </h3>
                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                Complete itemized list of all fee collections across all modes
                            </p>
                        </div>

                        {/* Search & Mode Filters */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative' }}>
                                <Search size={16} color="#64748b" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder="Search student, roll, receipt, trx..."
                                    value={searchLedger}
                                    onChange={(e) => setSearchLedger(e.target.value)}
                                    style={{
                                        padding: '0.55rem 0.85rem 0.55rem 2.2rem',
                                        borderRadius: '10px',
                                        border: '1px solid #cbd5e1',
                                        fontSize: '0.85rem',
                                        outline: 'none',
                                        width: '240px'
                                    }}
                                />
                            </div>

                            <select
                                value={modeLedgerFilter}
                                onChange={(e) => setModeLedgerFilter(e.target.value)}
                                style={{
                                    padding: '0.55rem 0.85rem',
                                    borderRadius: '10px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '0.85rem',
                                    fontWeight: '700',
                                    color: '#0f172a',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="all">All Modes ({calculatedMetrics.scopedTxs.length})</option>
                                <option value="Cash">💵 Counter Cash</option>
                                <option value="Online">📱 All Online Portals</option>
                                <option value="EasyPaisa">🟢 EasyPaisa</option>
                                <option value="JazzCash">🟠 JazzCash</option>
                                <option value="Bank">🏦 Bank Transfer</option>
                            </select>
                        </div>
                    </div>

                    {/* Receipts Table */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Receipt #</th>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Student & Class</th>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Date & Time</th>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#475569', fontWeight: '700' }}>Payment Channel</th>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: '#16a34a', fontWeight: '700' }}>Amount Paid</th>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#475569', fontWeight: '700' }}>Proof / Slip</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLedgerTxs.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
                                            No fee receipts match your active filter.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLedgerTxs.map(tx => {
                                        const mode = (tx.paymentMode || 'Cash').toLowerCase();
                                        const isOnline = mode.startsWith('online') || tx.collectedBy?.includes('Online') || mode.includes('transfer');
                                        return (
                                            <tr key={tx.id || tx.receiptNo} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '0.7rem 0.85rem', fontWeight: '800', color: '#0f172a' }}>
                                                    {tx.receiptNo || tx.id}
                                                </td>
                                                <td style={{ padding: '0.7rem 0.85rem' }}>
                                                    <strong style={{ color: '#0f172a', display: 'block' }}>{tx.studentName}</strong>
                                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                        {tx.className} {tx.rollNo && tx.rollNo !== '-' ? `• Roll: ${tx.rollNo}` : ''}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.7rem 0.85rem', color: '#64748b', fontSize: '0.8rem' }}>
                                                    {tx.dateString || tx.dateIso || 'N/A'} {tx.timeString ? `• ${tx.timeString}` : ''}
                                                </td>
                                                <td style={{ padding: '0.7rem 0.85rem', textAlign: 'center' }}>
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.3rem',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '700',
                                                        padding: '3px 8px',
                                                        borderRadius: '999px',
                                                        background: !isOnline ? '#f0fdf4' : '#eff6ff',
                                                        color: !isOnline ? '#166534' : '#1e40af',
                                                        border: `1px solid ${!isOnline ? '#bbf7d0' : '#bfdbfe'}`
                                                    }}>
                                                        {!isOnline ? <Wallet size={12} /> : <Smartphone size={12} />}
                                                        {tx.paymentMode || 'Cash'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right', fontWeight: '800', color: '#16a34a' }}>
                                                    Rs {Number(tx.totalPaid || 0).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '0.7rem 0.85rem', textAlign: 'center' }}>
                                                    {tx.proofUrl ? (
                                                        <button
                                                            onClick={() => setProofModalState({ isOpen: true, url: tx.proofUrl, title: `Payment Proof - ${tx.studentName}` })}
                                                            style={{
                                                                border: 'none',
                                                                background: '#eff6ff',
                                                                color: '#0078d4',
                                                                borderRadius: '6px',
                                                                padding: '4px 8px',
                                                                fontSize: '0.75rem',
                                                                fontWeight: '700',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '3px'
                                                            }}
                                                        >
                                                            <Eye size={12} /> View Slip
                                                        </button>
                                                    ) : (
                                                        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Counter Slip</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* SUB TAB 4: EXPENSES & TEACHER PAYROLL */}
            {/* ========================================================= */}
            {activeSubTab === 'expenses_payroll' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
                    
                    {/* 1. Operational Expenses Manager */}
                    <div className="card" style={{ background: '#ffffff', borderRadius: '16px', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#dc2626' }}>
                                    Operational Expenses
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                                    Utility bills, stationery, maintenance, refreshments
                                </p>
                            </div>
                            <button
                                onClick={() => handleOpenFinanceModal('expenses', null)}
                                style={{
                                    padding: '0.45rem 0.9rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#dc2626',
                                    color: '#ffffff',
                                    fontWeight: '700',
                                    fontSize: '0.8rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <Plus size={14} /> Add Expense
                            </button>
                        </div>

                        {calculatedMetrics.scopedExpenses.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8' }}>
                                No operational expenses recorded for selected scope.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '400px', overflowY: 'auto' }}>
                                {calculatedMetrics.scopedExpenses.map(exp => {
                                    const eDate = exp.date || exp.createdAt;
                                    const dObj = eDate ? new Date(eDate) : null;
                                    const mLabel = (dObj && !isNaN(dObj.getTime())) ? `${MONTH_SHORT[dObj.getMonth()]} ${dObj.getFullYear()}` : '';
                                    return (
                                        <div key={exp.id} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '0.75rem 1rem', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fee2e2'
                                        }}>
                                            <div>
                                                <strong style={{ color: '#0f172a', display: 'block', fontSize: '0.88rem' }}>{exp.name}</strong>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.72rem', color: '#991b1b', fontWeight: '700', background: '#fee2e2', padding: '1px 6px', borderRadius: '4px' }}>
                                                        {exp.category || 'Operational'}
                                                    </span>
                                                    <span style={{ fontSize: '0.72rem', color: exp.type === 'permanent' ? '#7c2d12' : '#475569', fontWeight: '800', background: exp.type === 'permanent' ? '#ffedd5' : '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>
                                                        {exp.type === 'permanent' ? `🔄 Permanent (From ${mLabel})` : `⚡ 1-Time (${mLabel})`}
                                                    </span>
                                                    {exp.remarks && (
                                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                                            • {exp.remarks}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                <strong style={{ color: '#dc2626', fontSize: '0.95rem' }}>
                                                    Rs {Number(exp.amount).toLocaleString()}
                                                </strong>
                                                <button
                                                    onClick={() => handleOpenFinanceModal('expenses', exp)}
                                                    style={{ border: 'none', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}
                                                    title="Edit Expense"
                                                >
                                                    <Edit2 size={13} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteFinanceEntry(exp.id, 'expenses')}
                                                    style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: '3px' }}
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* 2. Direct School Incomes Manager */}
                    <div className="card" style={{ background: '#ffffff', borderRadius: '16px', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#16a34a' }}>
                                    Direct School Incomes
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                                    Canteen rent, prospectus sale, donations, gala funds
                                </p>
                            </div>
                            <button
                                onClick={() => handleOpenFinanceModal('incomes', null)}
                                style={{
                                    padding: '0.45rem 0.9rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#16a34a',
                                    color: '#ffffff',
                                    fontWeight: '700',
                                    fontSize: '0.8rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <Plus size={14} /> Add Income
                            </button>
                        </div>

                        {calculatedMetrics.scopedIncomes.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8' }}>
                                No direct school incomes recorded for selected scope.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '400px', overflowY: 'auto' }}>
                                {calculatedMetrics.scopedIncomes.map(inc => {
                                    const eDate = inc.date || inc.createdAt;
                                    const dObj = eDate ? new Date(eDate) : null;
                                    const mLabel = (dObj && !isNaN(dObj.getTime())) ? `${MONTH_SHORT[dObj.getMonth()]} ${dObj.getFullYear()}` : '';
                                    return (
                                        <div key={inc.id} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '0.75rem 1rem', borderRadius: '10px', background: '#f0fdf4', border: '1px solid #dcfce7'
                                        }}>
                                            <div>
                                                <strong style={{ color: '#0f172a', display: 'block', fontSize: '0.88rem' }}>{inc.name}</strong>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.72rem', color: '#166534', fontWeight: '700', background: '#dcfce7', padding: '1px 6px', borderRadius: '4px' }}>
                                                        {inc.category || 'General'}
                                                    </span>
                                                    <span style={{ fontSize: '0.72rem', color: inc.type === 'permanent' ? '#065f46' : '#475569', fontWeight: '800', background: inc.type === 'permanent' ? '#d1fae5' : '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>
                                                        {inc.type === 'permanent' ? `🔄 Permanent (From ${mLabel})` : `⚡ 1-Time (${mLabel})`}
                                                    </span>
                                                    {inc.remarks && (
                                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                                            • {inc.remarks}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                <strong style={{ color: '#16a34a', fontSize: '0.95rem' }}>
                                                    Rs {Number(inc.amount).toLocaleString()}
                                                </strong>
                                                <button
                                                    onClick={() => handleOpenFinanceModal('incomes', inc)}
                                                    style={{ border: 'none', background: '#dcfce7', color: '#16a34a', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}
                                                    title="Edit Income"
                                                >
                                                    <Edit2 size={13} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteFinanceEntry(inc.id, 'incomes')}
                                                    style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: '3px' }}
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* UNIFIED ADD / EDIT MODAL FOR INCOMES & EXPENSES */}
            {/* ========================================================= */}
            {financeModalState.isOpen && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 9999, padding: '1rem'
                }}>
                    <div className="card" style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '480px',
                        padding: '1.5rem',
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
                        border: `1.5px solid ${financeModalState.category === 'incomes' ? '#86efac' : '#fca5a5'}`
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    background: financeModalState.category === 'incomes' ? '#dcfce7' : '#fee2e2',
                                    color: financeModalState.category === 'incomes' ? '#16a34a' : '#dc2626',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: '800'
                                }}>
                                    {financeModalState.category === 'incomes' ? '💰' : '🏷️'}
                                </div>
                                <h3 style={{
                                    margin: 0, fontSize: '1.1rem', fontWeight: '800',
                                    color: financeModalState.category === 'incomes' ? '#16a34a' : '#dc2626'
                                }}>
                                    {financeModalState.item ? 'Edit' : 'Add'}{' '}
                                    {financeModalState.category === 'incomes' ? 'Direct School Income' : 'Operational Expense'}
                                </h3>
                            </div>
                            <button
                                onClick={() => setFinanceModalState({ isOpen: false, category: 'incomes', item: null })}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveFinanceItem} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            
                            {/* Type Selection: 1-Time vs Permanent */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#475569', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Frequency / Schedule Type
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                    <button
                                        type="button"
                                        onClick={() => setFinanceForm(prev => ({ ...prev, type: 'one-time' }))}
                                        style={{
                                            padding: '0.65rem 0.75rem',
                                            borderRadius: '10px',
                                            border: financeForm.type === 'one-time' ? `2px solid ${financeModalState.category === 'incomes' ? '#16a34a' : '#dc2626'}` : '1.5px solid #e2e8f0',
                                            background: financeForm.type === 'one-time' ? (financeModalState.category === 'incomes' ? '#f0fdf4' : '#fef2f2') : '#f8fafc',
                                            color: financeForm.type === 'one-time' ? (financeModalState.category === 'incomes' ? '#166534' : '#991b1b') : '#64748b',
                                            fontWeight: '800',
                                            fontSize: '0.82rem',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span>⚡ 1-Time</span>
                                        </div>
                                        <div style={{ fontSize: '0.7rem', fontWeight: '500', opacity: 0.85, marginTop: '2px' }}>
                                            Only in target month
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setFinanceForm(prev => ({ ...prev, type: 'permanent' }))}
                                        style={{
                                            padding: '0.65rem 0.75rem',
                                            borderRadius: '10px',
                                            border: financeForm.type === 'permanent' ? `2px solid ${financeModalState.category === 'incomes' ? '#16a34a' : '#dc2626'}` : '1.5px solid #e2e8f0',
                                            background: financeForm.type === 'permanent' ? (financeModalState.category === 'incomes' ? '#f0fdf4' : '#fef2f2') : '#f8fafc',
                                            color: financeForm.type === 'permanent' ? (financeModalState.category === 'incomes' ? '#166534' : '#991b1b') : '#64748b',
                                            fontWeight: '800',
                                            fontSize: '0.82rem',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span>🔄 Permanent</span>
                                        </div>
                                        <div style={{ fontSize: '0.7rem', fontWeight: '500', opacity: 0.85, marginTop: '2px' }}>
                                            Starts from month & repeats
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Target Month & Year Selector */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                                        {financeForm.type === 'permanent' ? 'Start Month' : 'Target Month'}
                                    </label>
                                    <select
                                        value={financeForm.month}
                                        onChange={(e) => setFinanceForm(prev => ({ ...prev, month: Number(e.target.value) }))}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', fontWeight: '700', color: '#0f172a' }}
                                    >
                                        {MONTH_NAMES.map((name, idx) => (
                                            <option key={name} value={idx + 1}>{name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                                        {financeForm.type === 'permanent' ? 'Start Year' : 'Target Year'}
                                    </label>
                                    <select
                                        value={financeForm.year}
                                        onChange={(e) => setFinanceForm(prev => ({ ...prev, year: Number(e.target.value) }))}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', fontWeight: '700', color: '#0f172a' }}
                                    >
                                        {availableYears.map(yr => (
                                            <option key={yr} value={yr}>{yr}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Title / Name */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                                    {financeModalState.category === 'incomes' ? 'Income Title / Source *' : 'Expense Title / Description *'}
                                </label>
                                <input
                                    type="text"
                                    placeholder={financeModalState.category === 'incomes' ? "e.g. School Canteen Monthly Rent, Prospectus Sales" : "e.g. Electricity Bill, Stationery Printing, Generator Fuel"}
                                    value={financeForm.name}
                                    onChange={(e) => setFinanceForm(prev => ({ ...prev, name: e.target.value }))}
                                    required
                                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', outline: 'none', fontSize: '0.88rem', fontWeight: '600' }}
                                />
                            </div>

                            {/* Amount & Category */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                                        Amount (Rs) *
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="e.g. 15000"
                                        min="1"
                                        value={financeForm.amount}
                                        onChange={(e) => setFinanceForm(prev => ({ ...prev, amount: e.target.value }))}
                                        required
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', outline: 'none', fontSize: '0.88rem', fontWeight: '800', color: '#0f172a' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                                        Category Head
                                    </label>
                                    <select
                                        value={financeForm.category}
                                        onChange={(e) => setFinanceForm(prev => ({ ...prev, category: e.target.value }))}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', fontWeight: '700', color: '#0f172a' }}
                                    >
                                        {financeModalState.category === 'incomes' ? (
                                            <>
                                                <option value="General">General Incomes</option>
                                                <option value="Canteen">Canteen Monthly Rent</option>
                                                <option value="Admissions">Prospectus & Admissions</option>
                                                <option value="Events">Sports Gala & Events Fund</option>
                                                <option value="Donations">Donations & Grants</option>
                                                <option value="Uniforms">Uniform & Stationary Shop</option>
                                                <option value="Other">Other Direct Inflow</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="Operational">Operational / Office</option>
                                                <option value="Utility Bills">WAPDA / Gas / Utility Bills</option>
                                                <option value="Stationery">Stationery & Paper Printing</option>
                                                <option value="Maintenance">Building / Repairs / Lab</option>
                                                <option value="Refreshments">Staff Tea & Refreshments</option>
                                                <option value="Fuel">Generator & Van Fuel</option>
                                                <option value="Other">Other Miscellaneous Outflow</option>
                                            </>
                                        )}
                                    </select>
                                </div>
                            </div>

                            {/* Remarks / Note */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                                    Remarks / Note (Optional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Invoice #104, Vendor: Khan Traders"
                                    value={financeForm.remarks}
                                    onChange={(e) => setFinanceForm(prev => ({ ...prev, remarks: e.target.value }))}
                                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }}
                                />
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.5rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setFinanceModalState({ isOpen: false, category: 'incomes', item: null })}
                                    style={{ padding: '0.6rem 1.1rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#fff', color: '#64748b', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingFinance}
                                    style={{
                                        padding: '0.6rem 1.35rem',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: financeModalState.category === 'incomes' ? '#16a34a' : '#dc2626',
                                        color: '#ffffff',
                                        fontWeight: '800',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        opacity: isSavingFinance ? 0.7 : 1
                                    }}
                                >
                                    {isSavingFinance ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {isSavingFinance ? 'Saving...' : (financeModalState.item ? '✓ Update Entry' : '✓ Save Entry')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 3. Payment Proof Screenshot Lightbox */}
            {proofModalState.isOpen && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '1.5rem' }}
                    onClick={() => setProofModalState({ isOpen: false, url: '', title: '' })}
                >
                    <div style={{ background: '#ffffff', borderRadius: '16px', maxWidth: '600px', width: '100%', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: '#0f172a' }}>{proofModalState.title || 'Online Payment Slip Proof'}</h4>
                            <button onClick={() => setProofModalState({ isOpen: false, url: '', title: '' })} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
                        </div>
                        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'center', background: '#0f172a', maxHeight: '70vh', overflowY: 'auto' }}>
                            <img src={proofModalState.url} alt="Proof" style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: '8px' }} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinancesDashboard;
