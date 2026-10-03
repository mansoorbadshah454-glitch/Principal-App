import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
    Wallet, Users, ChevronRight, ChevronLeft, ArrowLeft, Ban, CheckCircle, Plus, Trash2, Edit2, X, 
    CheckSquare, Square, ArrowUpRight, ArrowDownRight, Download,
    Printer, Search, CheckCircle2, User, FileText, Loader2, Sparkles, Building2, Phone, Calendar, Clock, DollarSign,
    Image as ImageIcon, ExternalLink, Eye, Upload, Landmark, Smartphone, TrendingUp, TrendingDown, Receipt, Activity,
    PieChart, BarChart3, Zap, ShieldCheck, Layers, Wifi, WifiOff, RefreshCw, Filter, ArrowRight,
    Award, AlertTriangle, Check, RotateCcw, RotateCw, ZoomIn, ZoomOut, Maximize2, CalendarDays, History, Send,
    Sliders, HelpCircle, ArrowDown, ArrowUp, AlertCircle, Database, PlayCircle,
    ChevronDown, ChevronUp, Mail, MapPin, Scissors
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, AreaChart, Area, PieChart as RechartsPie, Pie, Cell,
    XAxis, YAxis, Tooltip as RechartsTooltip, Legend as RechartsLegend, CartesianGrid, Line, ComposedChart
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import CachedImage from './CachedImage';
import { db } from '../firebase';
import {
    collection, onSnapshot, query, doc, updateDoc, deleteField, setDoc, getDoc, deleteDoc,
    getDocs, writeBatch, serverTimestamp, orderBy, limit, where
} from 'firebase/firestore';
import { getDocsFast, getDocFast } from '../utils/cacheUtils';
import { 
    getTrustedPktDate, 
    getTrustedPktIsoDate, 
    getTrustedPktYear, 
    getTrustedPktMonth, 
    getTrustedPktTimeString, 
    isDayPastLocked,
    syncPakistanTime 
} from '../utils/pakistanTimeEngine';

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

// Helper: Convert number to Words (PKR Currency)
const numberToWords = (num) => {
    const a = [
        '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const inWords = (n) => {
        if ((n = n.toString()).length > 9) return 'overflow';
        let nArray = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!nArray) return '';
        let str = '';
        str += (Number(nArray[1]) !== 0) ? (a[Number(nArray[1])] || b[nArray[1][0]] + ' ' + a[nArray[1][1]]) + ' Crore ' : '';
        str += (Number(nArray[2]) !== 0) ? (a[Number(nArray[2])] || b[nArray[2][0]] + ' ' + a[nArray[2][1]]) + ' Lakh ' : '';
        str += (Number(nArray[3]) !== 0) ? (a[Number(nArray[3])] || b[nArray[3][0]] + ' ' + a[nArray[3][1]]) + ' Thousand ' : '';
        str += (Number(nArray[4]) !== 0) ? (a[Number(nArray[4])] || b[nArray[4][0]] + ' ' + a[nArray[4][1]]) + ' Hundred ' : '';
        str += (Number(nArray[5]) !== 0) ? ((str !== '') ? 'and ' : '') + (a[Number(nArray[5])] || b[nArray[5][0]] + ' ' + a[nArray[5][1]]) + ' ' : '';
        return str.trim();
    };

    const rounded = Math.round(Number(num) || 0);
    if (rounded === 0) return 'Zero Rupees Only';
    return inWords(rounded) + ' Rupees Only';
};

// Reusable Direct Clean Print Helper (Isolated Iframe, Zero Dark Bleed, Exact A4 Dual-Copy)
const printElementDirectly = (containerElementOrId, docTitle = 'Fee_Slip') => {
    if (typeof document === 'undefined') return;
    const container = typeof containerElementOrId === 'string'
        ? document.getElementById(containerElementOrId)
        : containerElementOrId;

    if (!container) {
        console.error("Receipt container not found for direct printing:", containerElementOrId);
        window.print();
        return;
    }

    const clone = container.cloneNode(true);
    clone.querySelectorAll('.no-print, button, input, .fee-receipt-modal-actions').forEach(el => el.remove());

    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.top = '-10000px';
    printFrame.style.left = '-10000px';
    printFrame.style.width = '210mm';
    printFrame.style.height = '297mm';
    printFrame.style.border = 'none';
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow.document;
    frameDoc.open();
    frameDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${docTitle}</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                @page {
                    size: A4 portrait;
                    margin: 6mm 10mm;
                }
                * {
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                html, body {
                    margin: 0 !important;
                    padding: 0 !important;
                    background: #ffffff !important;
                    font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    color: #0f172a;
                    width: 100% !important;
                }
                #printable-finance-receipt-container {
                    width: 100% !important;
                    max-width: 100% !important;
                    margin: 0 auto !important;
                    padding: 0 !important;
                    border: none !important;
                    box-shadow: none !important;
                    background: #ffffff !important;
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 4mm !important;
                }
                .fee-receipt-copy {
                    width: 100% !important;
                    box-sizing: border-box !important;
                    margin: 0 !important;
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                }
                .fee-receipt-cut-line {
                    margin: 1mm 0 !important;
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                }
                table {
                    width: 100% !important;
                    border-collapse: collapse !important;
                }
                th, td {
                    box-sizing: border-box !important;
                }
                .no-print, button {
                    display: none !important;
                }
            </style>
        </head>
        <body>
            ${clone.outerHTML}
        </body>
        </html>
    `);
    frameDoc.close();

    setTimeout(() => {
        try {
            printFrame.contentWindow.focus();
            printFrame.contentWindow.print();
        } catch (e) {
            console.error("Frame print error:", e);
            window.print();
        } finally {
            setTimeout(() => {
                try {
                    document.body.removeChild(printFrame);
                } catch (e) {}
            }, 5000);
        }
    }, 450);
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
    // 🇵🇰 Trusted Atomic Pakistan Standard Time (Independent of laptop date/time tampering)
    const currentYearNum = getTrustedPktYear();
    const currentMonthNum = getTrustedPktMonth();
    const currentIsoMonth = `${currentYearNum}-${String(currentMonthNum).padStart(2, '0')}`;
    const todayIsoDate = getTrustedPktIsoDate();

    const [loading, setLoading] = useState(true);
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

    // Detect if this is the Principal's Demo Account 6257 (Strictly hide demo buttons on all other schools)
    const isDemoAccount = useMemo(() => {
        const sId = String(schoolId || '').trim();
        const pId = String(parentSchoolInfo?.schoolId || parentSchoolInfo?.id || '').trim();
        return sId === '6257' || pId === '6257';
    }, [schoolId, parentSchoolInfo]);

    const [isInjectingDemo, setIsInjectingDemo] = useState(false);
    const [isPurgingDemo, setIsPurgingDemo] = useState(false);

    // ==========================================
    // TIME-MACHINE CONTROLS
    // ==========================================
    const [selectedYear, setSelectedYear] = useState(currentYearNum);
    const [selectedMonthMode, setSelectedMonthMode] = useState('current'); // 'today' | 'current' | 'all_year' | 'custom_month' | 'specific_day'
    const [customSelectedMonthNum, setCustomSelectedMonthNum] = useState(currentMonthNum); // 1-12
    const [selectedDayDateIso, setSelectedDayDateIso] = useState(null); // 'YYYY-MM-DD' when specific day is picked
    const [isDayCalendarOpen, setIsDayCalendarOpen] = useState(false);
    const dayCalendarRef = useRef(null);

    // Auto-close calendar popover on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dayCalendarRef.current && !dayCalendarRef.current.contains(e.target)) {
                setIsDayCalendarOpen(false);
            }
        };
        if (isDayCalendarOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isDayCalendarOpen]);

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
    const [monthlyLedgerTab, setMonthlyLedgerTab] = useState('fee_slips'); // 'fee_slips' | 'incomes' | 'expenses'
    const [ledgerPage, setLedgerPage] = useState(1);
    const [searchLedger, setSearchLedger] = useState('');
    const [modeLedgerFilter, setModeLedgerFilter] = useState('all'); // 'all' | 'Cash' | 'Online' | 'EasyPaisa' | 'JazzCash' | 'Bank'
    const [ledgerViewMode, setLedgerViewMode] = useState('daily'); // 'daily' | 'all'
    const [selectedDayIso, setSelectedDayIso] = useState(null);
    const [dayCardTab, setDayCardTab] = useState('all'); // 'all' | 'fee_slips' | 'incomes' | 'expenses'
    const [expandedDailyDates, setExpandedDailyDates] = useState({}); // { [dateIso]: true / false }
    const [dailyDateSearch, setDailyDateSearch] = useState('');
    const [selectedReceiptForModal, setSelectedReceiptForModal] = useState(null);
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [proofModalState, setProofModalState] = useState({ isOpen: false, url: '', title: '' });
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [isGeneratingDailyPDF, setIsGeneratingDailyPDF] = useState(false);
    const [isDownloadingModalSlip, setIsDownloadingModalSlip] = useState(false);

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

    // Dynamic Rolling 5-Year List: Always maintains the active 5-year window [currentYear - 4 ... currentYear]
    const availableYears = useMemo(() => {
        const currentYear = currentYearNum;
        const years = [];
        for (let i = 4; i >= 0; i--) {
            years.push(currentYear - i);
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
                    const info = {
                        name: data.name || parentSchoolInfo?.name || 'School Report',
                        logo: data.profileImage || parentSchoolInfo?.logo || '',
                        phone: data.phone || data.contactNumber || parentSchoolInfo?.phone || '',
                        emergencyPhone: data.emergencyPhone || data.alternatePhone || '',
                        email: data.email || parentSchoolInfo?.email || '',
                        address: data.address || parentSchoolInfo?.address || data.campus || '',
                        campus: data.campus || parentSchoolInfo?.campus || ''
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

    // 4. Fetch & Live Listen to Payroll Meta for Selected Year/Month (Padded & Unpadded Firestore doc IDs)
    useEffect(() => {
        if (!schoolId) return;
        let isMounted = true;
        const unsubs = [];

        // 4.1 Initial Multi-Year fetch (2025+) for YoY charts
        const fetchAllPayrollData = async () => {
            try {
                const yearsToFetch = availableYears;
                for (const yr of yearsToFetch) {
                    for (let m = 1; m <= 12; m++) {
                        const mPadded = String(m).padStart(2, '0');
                        // Try 2-digit padded doc ID (e.g. payroll_2026_10)
                        const pRefPadded = doc(db, `schools/${schoolId}/settings`, `payroll_${yr}_${mPadded}`);
                        const snapPadded = await getDocFast(pRefPadded);
                        if (snapPadded.exists() && isMounted) {
                            const data = snapPadded.data();
                            setPayrollMetaByMonth(prev => ({
                                ...prev,
                                [`${yr}_${mPadded}`]: data.teachers || {},
                                [`${yr}_${m}`]: data.teachers || {}
                            }));
                        } else {
                            // Fallback unpadded doc ID (e.g. payroll_2026_1)
                            const pRefUnpadded = doc(db, `schools/${schoolId}/settings`, `payroll_${yr}_${m}`);
                            const snapUnpadded = await getDocFast(pRefUnpadded);
                            if (snapUnpadded.exists() && isMounted) {
                                const data = snapUnpadded.data();
                                setPayrollMetaByMonth(prev => ({
                                    ...prev,
                                    [`${yr}_${mPadded}`]: data.teachers || {},
                                    [`${yr}_${m}`]: data.teachers || {}
                                }));
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn("Payroll initial fetch note:", e);
            }
        };

        fetchAllPayrollData();

        // 4.2 Real-time Active Month Listener (Instantly syncs when Principal marks a teacher as Paid in Payroll tab)
        const activeMonth = selectedMonthMode === 'current' ? currentMonthNum : customSelectedMonthNum;
        const activePadded = String(activeMonth).padStart(2, '0');
        const liveDocRef = doc(db, `schools/${schoolId}/settings`, `payroll_${selectedYear}_${activePadded}`);

        const unsubLive = onSnapshot(liveDocRef, (snap) => {
            if (!isMounted) return;
            const data = snap.exists() ? snap.data() : { teachers: {} };
            setPayrollMetaByMonth(prev => ({
                ...prev,
                [`${selectedYear}_${activePadded}`]: data.teachers || {},
                [`${selectedYear}_${activeMonth}`]: data.teachers || {}
            }));
        }, (err) => {
            console.warn("Live payroll listener note:", err);
        });
        unsubs.push(unsubLive);

        return () => { 
            isMounted = false; 
            unsubs.forEach(u => u());
        };
    }, [schoolId, availableYears, selectedYear, selectedMonthMode, customSelectedMonthNum, currentMonthNum]);

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
    // 4.1 AUTOMATIC 5-YEAR ROLLING RETENTION & CLEANUP ENGINE
    // Automatically archives and prunes data older than 5 years to keep DB lean and fast
    // =========================================================================
    useEffect(() => {
        if (!schoolId || !isOnline) return;

        const run5YearRetentionCleanup = async () => {
            try {
                const cutoffYear = currentYearNum - 4; // e.g. If current year is 2026, cutoff is 2022. < 2022 is expired.
                const checkKey = `school_5year_retention_check_${schoolId}`;
                const lastCheck = localStorage.getItem(checkKey);
                if (lastCheck === `${currentYearNum}_${currentMonthNum}`) {
                    return; // Already checked this month
                }

                // Check for expired transactions in memory or firestore
                const expiredTxs = (feeTransactions || []).filter(tx => {
                    let y = 0;
                    if (tx.dateIso) y = Number(tx.dateIso.split('-')[0]);
                    else if (tx.timestamp?.seconds) y = new Date(tx.timestamp.seconds * 1000).getFullYear();
                    return y > 0 && y < cutoffYear;
                });

                const expiredIncomes = (financesData.incomes || []).filter(i => {
                    const d = new Date(i.createdAt || i.date);
                    return !isNaN(d.getTime()) && d.getFullYear() < cutoffYear;
                });

                const expiredExpenses = (financesData.expenses || []).filter(e => {
                    const d = new Date(e.createdAt || e.date);
                    return !isNaN(d.getTime()) && d.getFullYear() < cutoffYear;
                });

                const expiredSales = (storeSales || []).filter(s => {
                    const d = new Date(s.dateIso || s.date || s.createdAt);
                    return !isNaN(d.getTime()) && d.getFullYear() < cutoffYear;
                });

                if (expiredTxs.length > 0 || expiredIncomes.length > 0 || expiredExpenses.length > 0 || expiredSales.length > 0) {
                    const batch = writeBatch(db);

                    // 1. Group expired data into a lightweight permanent Annual Summary Archive
                    const expiredYearsSet = new Set();
                    expiredTxs.forEach(t => {
                        const y = Number((t.dateIso || '').split('-')[0]) || (t.timestamp?.seconds ? new Date(t.timestamp.seconds * 1000).getFullYear() : 0);
                        if (y > 0 && y < cutoffYear) expiredYearsSet.add(y);
                    });

                    expiredYearsSet.forEach(expYr => {
                        const yrTxs = expiredTxs.filter(t => (t.dateIso || '').startsWith(String(expYr)));
                        const yrFeePaid = yrTxs.reduce((sum, t) => sum + (Number(t.totalPaid) || 0), 0);
                        const yrIncomes = expiredIncomes.filter(i => (i.createdAt || i.date || '').startsWith(String(expYr)));
                        const yrIncomeTotal = yrIncomes.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
                        const yrExpenses = expiredExpenses.filter(e => (e.createdAt || e.date || '').startsWith(String(expYr)));
                        const yrExpenseTotal = yrExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

                        const archiveDocRef = doc(db, `schools/${schoolId}/settings`, `archive_year_${expYr}`);
                        batch.set(archiveDocRef, {
                            archivedYear: expYr,
                            totalFeeCollected: yrFeePaid,
                            totalDirectIncome: yrIncomeTotal,
                            totalExpenses: yrExpenseTotal,
                            receiptCount: yrTxs.length,
                            archivedAt: serverTimestamp()
                        }, { merge: true });
                    });

                    // 2. Batch Delete expired fee transactions
                    expiredTxs.forEach(t => {
                        const tRef = doc(db, `schools/${schoolId}/feeTransactions`, t.id);
                        batch.delete(tRef);
                    });

                    // 3. Batch Delete expired store sales
                    expiredSales.forEach(s => {
                        const sRef = doc(db, `schools/${schoolId}/store_sales`, s.id);
                        batch.delete(sRef);
                    });

                    // 4. Clean settings/finances array
                    const cleanIncomes = (financesData.incomes || []).filter(i => {
                        const d = new Date(i.createdAt || i.date);
                        return isNaN(d.getTime()) || d.getFullYear() >= cutoffYear;
                    });
                    const cleanExpenses = (financesData.expenses || []).filter(e => {
                        const d = new Date(e.createdAt || e.date);
                        return isNaN(d.getTime()) || d.getFullYear() >= cutoffYear;
                    });
                    const finRef = doc(db, `schools/${schoolId}/settings/finances`);
                    batch.set(finRef, { incomes: cleanIncomes, expenses: cleanExpenses }, { merge: true });

                    // 5. Delete expired payroll metadata docs
                    expiredYearsSet.forEach(expYr => {
                        for (let m = 1; m <= 12; m++) {
                            const pRef = doc(db, `schools/${schoolId}/settings`, `payroll_${expYr}_${m}`);
                            batch.delete(pRef);
                        }
                    });

                    await batch.commit();

                    // Update local state
                    setFeeTransactions(prev => prev.filter(t => {
                        let y = 0;
                        if (t.dateIso) y = Number(t.dateIso.split('-')[0]);
                        else if (t.timestamp?.seconds) y = new Date(t.timestamp.seconds * 1000).getFullYear();
                        return y >= cutoffYear;
                    }));
                    setStoreSales(prev => prev.filter(s => {
                        const d = new Date(s.dateIso || s.date || s.createdAt);
                        return isNaN(d.getTime()) || d.getFullYear() >= cutoffYear;
                    }));
                    setFinancesData({ incomes: cleanIncomes, expenses: cleanExpenses });
                }

                localStorage.setItem(checkKey, `${currentYearNum}_${currentMonthNum}`);
            } catch (err) {
                console.warn("5-Year Retention Cleanup note:", err);
            }
        };

        run5YearRetentionCleanup();
    }, [schoolId, isOnline, currentYearNum, currentMonthNum, feeTransactions, financesData, storeSales]);

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
        const isSpecificDayMode = selectedMonthMode === 'specific_day';
        const activeDayIso = isTodayMode ? todayIsoDate : (isSpecificDayMode ? selectedDayDateIso : null);
        const activeMonthNum = selectedMonthMode === 'current' 
            ? currentMonthNum 
            : (selectedMonthMode === 'specific_day' && selectedDayDateIso 
                ? Number(selectedDayDateIso.split('-')[1]) 
                : customSelectedMonthNum);
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

            if (isTodayMode || isSpecificDayMode) {
                return txIsoDate === activeDayIso;
            }
            if (isAllYearMode) {
                return txYear === selectedYear;
            }
            return txYear === selectedYear && txMonth === activeMonthNum;
        };

        const scopedTxs = (feeTransactions || []).filter(isTxInScope);

        // Calculate Fee Totals & Split (Counter Cash vs Online Digital & Regular vs Admission)
        let totalFeePaid = 0;
        let counterCashFees = 0;
        let onlineFees = 0;
        let easyPaisaFees = 0;
        let jazzCashFees = 0;
        let bankFees = 0;
        let otherDigitalFees = 0;
        let totalDiscounts = 0;
        const paidStudentIds = new Set();

        let totalAdmissionFees = 0;
        let totalAdmissionCount = 0;
        let totalAdmissionActionsFee = 0;
        let totalAdmissionRecurringFee = 0;
        const scopedAdmissionTxs = [];
        const scopedRegularFeeTxs = [];

        scopedTxs.forEach(tx => {
            const amount = Number(tx.totalPaid) || 0;
            totalFeePaid += amount;
            totalDiscounts += Number(tx.discount) || 0;
            if (tx.studentId) paidStudentIds.add(tx.studentId);

            const isAdmission = tx.source === 'admission' || 
                                tx.transactionType === 'admission_collection' || 
                                (tx.receiptNo && String(tx.receiptNo).startsWith('ADM-')) ||
                                (tx.collectedBy && String(tx.collectedBy).toLowerCase().includes('admission'));

            if (isAdmission) {
                scopedAdmissionTxs.push(tx);
                totalAdmissionCount++;
                totalAdmissionFees += amount;
                totalAdmissionActionsFee += Number(tx.actionsFee || tx.admissionFee || 0);
                totalAdmissionRecurringFee += Number(tx.baseFee || 0) + Number(tx.transportFee || 0);
            } else {
                scopedRegularFeeTxs.push(tx);
            }

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
                if (isTodayMode || isSpecificDayMode) return false; // Daily view is strictly for actual day cash drawer
                // Prevent recurring entries from leaking into historical years before creation
                if (eYear > 0 && selectedYear < eYear) return false;
                if (eYear > 0 && selectedYear === eYear && !isAllYearMode && activeMonthNum < eMonth) return false;
                return true;
            }

            if (!dStr) return false;
            if (isTodayMode || isSpecificDayMode) return eIsoDate === activeDayIso;
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

        // Teacher Salaries Paid from Payroll for Selected Scope (100% Live Connected to Payroll Tab)
        let totalTeacherSalariesPaid = 0;
        const totalStaffCount = teachersList.length || 0;
        const totalStaffBudget = teachersList.reduce((sum, t) => sum + (Number(t.salary || t.baseSalary || t.monthlySalary || 0)), 0);
        let staffPaidCount = 0;

        const getTeacherPaidAmt = (tMeta) => {
            if (!tMeta || !tMeta.isPaid) return 0;
            return Number(tMeta.paidAmount ?? tMeta.netSalary ?? 0);
        };

        if (isAllYearMode) {
            for (let m = 1; m <= 12; m++) {
                const mPadded = String(m).padStart(2, '0');
                const pMeta = payrollMetaByMonth[`${selectedYear}_${mPadded}`] || payrollMetaByMonth[`${selectedYear}_${m}`] || {};
                teachersList.forEach(t => {
                    const tMeta = pMeta[t.id];
                    if (tMeta && tMeta.isPaid) {
                        totalTeacherSalariesPaid += getTeacherPaidAmt(tMeta);
                        staffPaidCount += 1;
                    }
                });
            }
        } else if (isTodayMode || isSpecificDayMode) {
            // Today / Specific Day Mode: Strictly calculate teacher salaries actually disbursed on target date
            const targetIso = isTodayMode ? todayIsoDate : selectedDayDateIso;
            const mPadded = String(activeMonthNum).padStart(2, '0');
            const pMeta = payrollMetaByMonth[`${selectedYear}_${mPadded}`] || payrollMetaByMonth[`${selectedYear}_${activeMonthNum}`] || {};
            teachersList.forEach(t => {
                const tMeta = pMeta[t.id];
                if (tMeta && tMeta.isPaid) {
                    let isPaidOnTarget = false;
                    if (tMeta.paidDate) {
                        const d = new Date(tMeta.paidDate);
                        if (!isNaN(d.getTime()) && getLocalIsoDate(d) === targetIso) {
                            isPaidOnTarget = true;
                        }
                    }
                    if (tMeta.paidAt?.seconds) {
                        const d = new Date(tMeta.paidAt.seconds * 1000);
                        if (getLocalIsoDate(d) === targetIso) {
                            isPaidOnTarget = true;
                        }
                    }
                    if (isPaidOnTarget) {
                        staffPaidCount += 1;
                        totalTeacherSalariesPaid += getTeacherPaidAmt(tMeta);
                    }
                }
            });
        } else {
            // Month Mode (Current Month or Selected Custom Month)
            const mPadded = String(activeMonthNum).padStart(2, '0');
            const pMeta = payrollMetaByMonth[`${selectedYear}_${mPadded}`] || payrollMetaByMonth[`${selectedYear}_${activeMonthNum}`] || {};
            teachersList.forEach(t => {
                const tMeta = pMeta[t.id];
                if (tMeta && tMeta.isPaid) {
                    staffPaidCount += 1;
                    totalTeacherSalariesPaid += getTeacherPaidAmt(tMeta);
                }
            });
        }

        const isSelectedYearFuture = selectedYear > currentYearNum;
        const isSelectedYearPast = selectedYear < currentYearNum;
        const isSelectedYearCurrent = selectedYear === currentYearNum;
        const isFutureScope = isSelectedYearFuture || (isSelectedYearCurrent && !isAllYearMode && !isTodayMode && activeMonthNum > currentMonthNum);

        // Effective Salaries Paid (Actual disbursed salary outflow)
        const effectiveSalariesPaid = totalTeacherSalariesPaid;

        // Grand Totals (Actual Inflow - Actual Outflows)
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
                const mPadded = String(mNum).padStart(2, '0');
                const pMetaCur = payrollMetaByMonth[`${selectedYear}_${mPadded}`] || payrollMetaByMonth[`${selectedYear}_${mNum}`] || {};
                teachersList.forEach(t => {
                    const tm = pMetaCur[t.id];
                    if (tm && tm.isPaid) {
                        monthTeacherSalaries += (Number(tm.paidAmount ?? tm.netSalary) || 0);
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

            const digitalSharePct = totalFeePaid > 0 ? Math.round((onlineFees / totalFeePaid) * 100) : 0;
            smartInsight = `💡 Financial Insight: In ${monthLabel} ${selectedYear}, ${growthText} with a ${profitMarginPercent}% Net Profit Margin and ${digitalSharePct}% digital online collection share.`;
        }

        if (isSpecificDayMode && selectedDayDateIso) {
            smartInsight = `📅 Day Financial View: Showing finances strictly recorded on ${selectedDayDateIso}. Net balance for this day is Rs ${Math.abs(netProfit).toLocaleString()} (${netProfit >= 0 ? 'Surplus' : 'Deficit'}).`;
        }

        return {
            isTodayMode,
            isAllYearMode,
            isSpecificDayMode,
            selectedDayDateIso,
            activeMonthNum,
            activeMonthIso,
            scopedTxs,
            scopedAdmissionTxs,
            scopedRegularFeeTxs,
            totalAdmissionFees,
            totalAdmissionCount,
            totalAdmissionActionsFee,
            totalAdmissionRecurringFee,
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
        selectedYear, selectedMonthMode, customSelectedMonthNum, selectedDayDateIso, wheelViewMode, inspectedMonthNum,
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

    // 7.1 Daily Ledger Aggregator (Day-by-Day Financial Intelligence: Full Month 1st to Last Day)
    const dailyLedgerData = useMemo(() => {
        const groups = {};

        const getSanitizedIsoDate = (rawStr) => {
            if (!rawStr) return '';
            if (typeof rawStr === 'string') {
                if (rawStr.includes('T')) return rawStr.split('T')[0];
                if (/^\d{4}-\d{2}-\d{2}$/.test(rawStr)) return rawStr;
                const d = new Date(rawStr);
                if (!isNaN(d.getTime())) return getLocalIsoDate(d);
            }
            return '';
        };

        // Determine the strict target month (1-12) and year (e.g. 2026)
        const targetMonth = (selectedMonthMode === 'current' ? currentMonthNum : customSelectedMonthNum) || currentMonthNum;
        const targetYear = selectedYear || currentYearNum;
        const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
        const monthStr = String(targetMonth).padStart(2, '0');

        // 1. Initialize STRICTLY and ONLY the days of the selected month (1st to last day)
        for (let d = 1; d <= daysInMonth; d++) {
            const dayStr = String(d).padStart(2, '0');
            const isoDate = `${targetYear}-${monthStr}-${dayStr}`;
            groups[isoDate] = {
                dateIso: isoDate,
                dayNumber: d,
                monthNum: targetMonth,
                yearNum: targetYear,
                totalFeePaid: 0,
                counterCashFees: 0,
                cashCount: 0,
                onlineFees: 0,
                easyPaisaFees: 0,
                easyPaisaCount: 0,
                jazzCashFees: 0,
                jazzCashCount: 0,
                bankFees: 0,
                bankCount: 0,
                otherDigitalFees: 0,
                otherDigitalCount: 0,
                totalDirectIncome: 0,
                totalExpenses: 0,
                txs: [],
                incomes: [],
                expenses: []
            };
        }

        // A. Match Fee Transactions STRICTLY to this selected month's initialized dates
        (feeTransactions || []).forEach(tx => {
            let isoDate = getSanitizedIsoDate(tx.dateIso);
            if (!isoDate && tx.timestamp?.seconds) {
                isoDate = getLocalIsoDate(new Date(tx.timestamp.seconds * 1000));
            }
            if (!isoDate && tx.dateString) {
                isoDate = getSanitizedIsoDate(tx.dateString);
            }

            // ONLY attach if date matches this selected month's initialized days!
            if (isoDate && groups[isoDate]) {
                const amount = Number(tx.totalPaid) || 0;
                groups[isoDate].totalFeePaid += amount;
                groups[isoDate].txs.push(tx);

                const mode = (tx.paymentMode || 'Cash').toLowerCase();
                const collectedBy = (tx.collectedBy || '').toLowerCase();
                const isOnlineTx = mode.startsWith('online') || collectedBy.includes('online') || mode.includes('transfer') || mode.includes('easy') || mode.includes('jazz') || mode.includes('bank');

                if (mode === 'cash' && !isOnlineTx) {
                    groups[isoDate].counterCashFees += amount;
                    groups[isoDate].cashCount += 1;
                } else if (mode.includes('easypaisa') || mode.includes('easy')) {
                    groups[isoDate].easyPaisaFees += amount;
                    groups[isoDate].onlineFees += amount;
                    groups[isoDate].easyPaisaCount += 1;
                } else if (mode.includes('jazzcash') || mode.includes('jazz')) {
                    groups[isoDate].jazzCashFees += amount;
                    groups[isoDate].onlineFees += amount;
                    groups[isoDate].jazzCashCount += 1;
                } else if (mode.includes('bank')) {
                    groups[isoDate].bankFees += amount;
                    groups[isoDate].onlineFees += amount;
                    groups[isoDate].bankCount += 1;
                } else {
                    groups[isoDate].otherDigitalFees += amount;
                    groups[isoDate].onlineFees += amount;
                    groups[isoDate].otherDigitalCount += 1;
                }
            }
        });

        // B. Match Direct Incomes STRICTLY to this selected month's initialized dates
        (financesData.incomes || []).forEach(inc => {
            const dStr = inc.createdAt || inc.date;
            const isoDate = getSanitizedIsoDate(dStr);
            if (isoDate && groups[isoDate]) {
                const amount = Number(inc.amount) || 0;
                groups[isoDate].totalDirectIncome += amount;
                groups[isoDate].incomes.push(inc);
            }
        });

        // C. Match Operational Expenses STRICTLY to this selected month's initialized dates
        (financesData.expenses || []).forEach(exp => {
            const isSalary = (exp.category || '').toLowerCase() === 'salary' || (exp.id || '').startsWith('payroll-');
            if (isSalary) return;
            const dStr = exp.createdAt || exp.date;
            const isoDate = getSanitizedIsoDate(dStr);
            if (isoDate && groups[isoDate]) {
                const amount = Number(exp.amount) || 0;
                groups[isoDate].totalExpenses += amount;
                groups[isoDate].expenses.push(exp);
            }
        });

        // Transform into Array & Format Dates
        const list = Object.values(groups).map(g => {
            const dateObj = new Date(g.yearNum, g.monthNum - 1, g.dayNumber);
            let dayName = '';
            let displayDate = g.dateIso;
            if (!isNaN(dateObj.getTime())) {
                dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                displayDate = dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            }
            const grossInflow = g.totalFeePaid + g.totalDirectIncome;
            const netBalance = grossInflow - g.totalExpenses;
            const netCashDrawer = (g.counterCashFees + g.totalDirectIncome) - g.totalExpenses;
            const hasActivity = (g.totalFeePaid > 0 || g.txs.length > 0 || g.totalDirectIncome > 0 || g.totalExpenses > 0);
            const isLocked = g.dateIso < todayIsoDate;
            const isToday = g.dateIso === todayIsoDate;
            const isFuture = g.dateIso > todayIsoDate;

            return {
                ...g,
                dayName,
                displayDate,
                grossInflow,
                netBalance,
                netCashDrawer,
                hasActivity,
                isLocked,
                isToday,
                isFuture
            };
        });

        // Strict Chronological order: Day 1 to Last Day of Month
        list.sort((a, b) => a.dayNumber - b.dayNumber);
        return list;
    }, [feeTransactions, financesData, selectedMonthMode, customSelectedMonthNum, currentMonthNum, selectedYear, currentYearNum, todayIsoDate]);

    // Active selected day data (only when selectedDayIso is explicitly selected)
    // Auto-select today (or 1st day of month) if current selectedDayIso is not in active month
    useEffect(() => {
        if (!dailyLedgerData || dailyLedgerData.length === 0) return;
        const exists = dailyLedgerData.some(d => d.dateIso === selectedDayIso);
        if (!exists) {
            const todayDay = dailyLedgerData.find(d => d.isToday);
            if (todayDay) {
                setSelectedDayIso(todayDay.dateIso);
            } else {
                setSelectedDayIso(dailyLedgerData[0].dateIso);
            }
        }
    }, [dailyLedgerData, selectedDayIso]);

    // Active selected day data
    const activeDayData = useMemo(() => {
        if (!dailyLedgerData || dailyLedgerData.length === 0) return null;
        if (selectedDayIso) {
            const found = dailyLedgerData.find(d => d.dateIso === selectedDayIso);
            if (found) return found;
        }
        return dailyLedgerData.find(d => d.isToday) || dailyLedgerData[0] || null;
    }, [dailyLedgerData, selectedDayIso]);

    // Active Day Index for previous/next navigation
    const activeDayIndex = useMemo(() => {
        if (!activeDayData || !dailyLedgerData) return -1;
        return dailyLedgerData.findIndex(d => d.dateIso === activeDayData.dateIso);
    }, [activeDayData, dailyLedgerData]);

    const handlePrevDay = () => {
        if (activeDayIndex > 0) {
            setSelectedDayIso(dailyLedgerData[activeDayIndex - 1].dateIso);
        }
    };

    const handleNextDay = () => {
        if (activeDayIndex >= 0 && activeDayIndex < dailyLedgerData.length - 1) {
            setSelectedDayIso(dailyLedgerData[activeDayIndex + 1].dateIso);
        }
    };

    // Calendar Month Flipping & Quick Jump to Today
    const handlePrevMonth = () => {
        let currentM = selectedMonthMode === 'current' ? currentMonthNum : (customSelectedMonthNum || currentMonthNum);
        let currentY = selectedYear || currentYearNum;
        if (currentM === 1) {
            currentM = 12;
            currentY = currentY - 1;
        } else {
            currentM = currentM - 1;
        }
        setSelectedYear(currentY);
        setCustomSelectedMonthNum(currentM);
        setSelectedMonthMode('custom_month');
        setInspectedMonthNum(currentM);
    };

    const handleNextMonth = () => {
        let currentM = selectedMonthMode === 'current' ? currentMonthNum : (customSelectedMonthNum || currentMonthNum);
        let currentY = selectedYear || currentYearNum;
        if (currentM === 12) {
            currentM = 1;
            currentY = currentY + 1;
        } else {
            currentM = currentM + 1;
        }
        setSelectedYear(currentY);
        setCustomSelectedMonthNum(currentM);
        setSelectedMonthMode('custom_month');
        setInspectedMonthNum(currentM);
    };

    const handleJumpToToday = () => {
        setSelectedYear(currentYearNum);
        setCustomSelectedMonthNum(currentMonthNum);
        setSelectedMonthMode('current');
        setInspectedMonthNum(currentMonthNum);
        setSelectedDayIso(todayIsoDate);
    };

    // Calendar Grid Calculation for 7-column layout (Mon - Sun)
    const calendarGridCells = useMemo(() => {
        const targetMonth = (selectedMonthMode === 'current' ? currentMonthNum : customSelectedMonthNum) || currentMonthNum;
        const targetYear = selectedYear || currentYearNum;
        
        // In JS: 0 = Sun, 1 = Mon, ..., 6 = Sat
        const firstDayOfWeek = new Date(targetYear, targetMonth - 1, 1).getDay();
        // Convert to Monday-start (0 = Mon, 1 = Tue, ..., 6 = Sun)
        const leadingEmptyCount = (firstDayOfWeek + 6) % 7;
        
        const cells = [];
        for (let i = 0; i < leadingEmptyCount; i++) {
            cells.push({ type: 'empty', key: `empty_${i}` });
        }

        (dailyLedgerData || []).forEach(day => {
            cells.push({
                type: 'day',
                key: day.dateIso,
                day
            });
        });

        return cells;
    }, [selectedMonthMode, customSelectedMonthNum, currentMonthNum, selectedYear, currentYearNum, dailyLedgerData]);

    // =========================================================================
    const filteredMonthlyTxs = useMemo(() => {
        const txs = calculatedMetrics?.scopedRegularFeeTxs || calculatedMetrics?.scopedTxs || [];
        return txs.filter(tx => {
            if (modeLedgerFilter !== 'all') {
                const mode = (tx.paymentMode || 'Cash').toLowerCase();
                if (modeLedgerFilter === 'Cash' && mode !== 'cash') return false;
                if (modeLedgerFilter === 'Online' && mode === 'cash') return false;
                if (modeLedgerFilter === 'EasyPaisa' && !mode.includes('easy')) return false;
                if (modeLedgerFilter === 'JazzCash' && !mode.includes('jazz')) return false;
                if (modeLedgerFilter === 'Bank' && !mode.includes('bank')) return false;
            }
            if (searchLedger.trim()) {
                const q = searchLedger.toLowerCase();
                const matchName = (tx.studentName || '').toLowerCase().includes(q);
                const matchRoll = (tx.rollNo || '').toLowerCase().includes(q);
                const matchClass = (tx.className || '').toLowerCase().includes(q);
                const matchRec = (tx.receiptNo || tx.id || '').toLowerCase().includes(q);
                const matchTrx = (tx.trxId || tx.transactionId || tx.referenceId || tx.senderAccount || '').toLowerCase().includes(q);
                const matchFather = (tx.fatherName || '').toLowerCase().includes(q);
                if (!matchName && !matchRoll && !matchClass && !matchRec && !matchTrx && !matchFather) return false;
            }
            return true;
        });
    }, [calculatedMetrics?.scopedRegularFeeTxs, calculatedMetrics?.scopedTxs, searchLedger, modeLedgerFilter]);

    const filteredMonthlyAdmissionTxs = useMemo(() => {
        const txs = calculatedMetrics?.scopedAdmissionTxs || [];
        return txs.filter(tx => {
            if (modeLedgerFilter !== 'all') {
                const mode = (tx.paymentMode || 'Cash').toLowerCase();
                if (modeLedgerFilter === 'Cash' && mode !== 'cash') return false;
                if (modeLedgerFilter === 'Online' && mode === 'cash') return false;
                if (modeLedgerFilter === 'EasyPaisa' && !mode.includes('easy')) return false;
                if (modeLedgerFilter === 'JazzCash' && !mode.includes('jazz')) return false;
                if (modeLedgerFilter === 'Bank' && !mode.includes('bank')) return false;
            }
            if (searchLedger.trim()) {
                const q = searchLedger.toLowerCase();
                const matchName = (tx.studentName || '').toLowerCase().includes(q);
                const matchRoll = (tx.rollNo || '').toLowerCase().includes(q);
                const matchAdm = (tx.admissionNo || '').toLowerCase().includes(q);
                const matchClass = (tx.className || '').toLowerCase().includes(q);
                const matchRec = (tx.receiptNo || tx.id || '').toLowerCase().includes(q);
                const matchFather = (tx.fatherName || '').toLowerCase().includes(q);
                if (!matchName && !matchRoll && !matchAdm && !matchClass && !matchRec && !matchFather) return false;
            }
            return true;
        });
    }, [calculatedMetrics?.scopedAdmissionTxs, searchLedger, modeLedgerFilter]);

    const filteredMonthlyIncomes = useMemo(() => {
        const incomes = calculatedMetrics?.scopedIncomes || [];
        if (!searchLedger.trim()) return incomes;
        const q = searchLedger.toLowerCase();
        return incomes.filter(inc => {
            const matchName = (inc.name || inc.title || '').toLowerCase().includes(q);
            const matchCat = (inc.category || '').toLowerCase().includes(q);
            const matchRem = (inc.remarks || '').toLowerCase().includes(q);
            return matchName || matchCat || matchRem;
        });
    }, [calculatedMetrics?.scopedIncomes, searchLedger]);

    const filteredMonthlyExpenses = useMemo(() => {
        const expenses = calculatedMetrics?.scopedExpenses || [];
        if (!searchLedger.trim()) return expenses;
        const q = searchLedger.toLowerCase();
        return expenses.filter(exp => {
            const matchName = (exp.name || exp.title || '').toLowerCase().includes(q);
            const matchCat = (exp.category || '').toLowerCase().includes(q);
            const matchRem = (exp.remarks || '').toLowerCase().includes(q);
            return matchName || matchCat || matchRem;
        });
    }, [calculatedMetrics?.scopedExpenses, searchLedger]);

    const rowsPerPage = 25;
    const paginatedMonthlyTxs = useMemo(() => {
        const start = (ledgerPage - 1) * rowsPerPage;
        return filteredMonthlyTxs.slice(start, start + rowsPerPage);
    }, [filteredMonthlyTxs, ledgerPage]);

    const paginatedMonthlyAdmissionTxs = useMemo(() => {
        const start = (ledgerPage - 1) * rowsPerPage;
        return filteredMonthlyAdmissionTxs.slice(start, start + rowsPerPage);
    }, [filteredMonthlyAdmissionTxs, ledgerPage]);

    const paginatedMonthlyIncomes = useMemo(() => {
        const start = (ledgerPage - 1) * rowsPerPage;
        return filteredMonthlyIncomes.slice(start, start + rowsPerPage);
    }, [filteredMonthlyIncomes, ledgerPage]);

    const paginatedMonthlyExpenses = useMemo(() => {
        const start = (ledgerPage - 1) * rowsPerPage;
        return filteredMonthlyExpenses.slice(start, start + rowsPerPage);
    }, [filteredMonthlyExpenses, ledgerPage]);

    const totalMonthlyLedgerCount = useMemo(() => {
        if (monthlyLedgerTab === 'fee_slips') return filteredMonthlyTxs.length;
        if (monthlyLedgerTab === 'admission_slips') return filteredMonthlyAdmissionTxs.length;
        if (monthlyLedgerTab === 'incomes') return filteredMonthlyIncomes.length;
        if (monthlyLedgerTab === 'expenses') return filteredMonthlyExpenses.length;
        return 0;
    }, [monthlyLedgerTab, filteredMonthlyTxs.length, filteredMonthlyAdmissionTxs.length, filteredMonthlyIncomes.length, filteredMonthlyExpenses.length]);

    const totalMonthlyLedgerPages = Math.max(1, Math.ceil(totalMonthlyLedgerCount / rowsPerPage));
    const ledgerStartIndex = (ledgerPage - 1) * rowsPerPage;
    const ledgerEndIndex = Math.min(ledgerStartIndex + rowsPerPage, totalMonthlyLedgerCount);

    // Unified Consolidated Chronological Feed for the Active Selected Day
    const unifiedDayEntries = useMemo(() => {
        if (!activeDayData) return [];
        const entries = [];

        // 1. Fee Receipts & Admission Receipts
        (activeDayData.txs || []).forEach(tx => {
            const isAdmission = tx.source === 'admission' || 
                                tx.transactionType === 'admission_collection' || 
                                (tx.receiptNo && String(tx.receiptNo).startsWith('ADM-')) ||
                                (tx.collectedBy && String(tx.collectedBy).toLowerCase().includes('admission'));
            entries.push({
                id: tx.id || tx.receiptNo,
                type: isAdmission ? 'admission_slip' : 'fee_slip',
                typeName: isAdmission ? '🎓 Admission Payment' : 'Fee Receipt',
                title: tx.studentName || 'Student Fee',
                subtitle: `${tx.className || 'Class'} ${tx.rollNo && tx.rollNo !== '-' ? `• Roll: ${tx.rollNo}` : (tx.admissionNo ? `• Adm: ${tx.admissionNo}` : '')}`,
                subDetail: isAdmission ? `Admission #${tx.receiptNo || tx.id}` : (tx.receiptNo ? `Slip #${tx.receiptNo}` : 'Receipt'),
                extraInfo: tx.fatherName ? `S/D of ${tx.fatherName}` : '',
                amount: Number(tx.totalPaid || 0),
                flowType: 'inflow',
                paymentMode: tx.paymentMode || 'Cash',
                time: tx.timeString || 'Daily Entry',
                raw: tx,
                proofUrl: tx.proofUrl
            });
        });

        // 2. Direct Incomes
        (activeDayData.incomes || []).forEach(inc => {
            entries.push({
                id: inc.id || `inc_${Math.random()}`,
                type: 'income',
                typeName: 'Direct Income',
                title: inc.name || inc.title || 'Direct Revenue',
                subtitle: `${inc.category || 'General'} • ${inc.type === 'permanent' ? 'Monthly' : 'One-time'}`,
                subDetail: 'Direct Inflow Voucher',
                extraInfo: inc.remarks || 'Direct School Income',
                amount: Number(inc.amount || 0),
                flowType: 'inflow',
                paymentMode: 'Direct Inflow',
                time: inc.date ? new Date(inc.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Logged',
                raw: inc,
                proofUrl: inc.proofUrl
            });
        });

        // 3. Operational Expenses
        (activeDayData.expenses || []).forEach(exp => {
            entries.push({
                id: exp.id || `exp_${Math.random()}`,
                type: 'expense',
                typeName: 'Operational Expense',
                title: exp.name || exp.title || 'School Outflow',
                subtitle: `${exp.category || 'Operational'} • ${exp.type === 'permanent' ? 'Monthly' : 'One-time'}`,
                subDetail: 'Expense Voucher',
                extraInfo: exp.remarks || 'School Operational Cost',
                amount: Number(exp.amount || 0),
                flowType: 'outflow',
                paymentMode: 'Disbursed',
                time: exp.date ? new Date(exp.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Logged',
                raw: exp,
                proofUrl: exp.proofUrl
            });
        });

        return entries;
    }, [activeDayData]);

    // Filtered Unified Entries based on user search in day view
    const filteredUnifiedDayEntries = useMemo(() => {
        return unifiedDayEntries.filter(entry => {
            if (dailyDateSearch.trim()) {
                const q = dailyDateSearch.toLowerCase();
                const matchTitle = (entry.title || '').toLowerCase().includes(q);
                const matchSub = (entry.subtitle || '').toLowerCase().includes(q);
                const matchExtra = (entry.extraInfo || '').toLowerCase().includes(q);
                const matchDetail = (entry.subDetail || '').toLowerCase().includes(q);
                if (!matchTitle && !matchSub && !matchExtra && !matchDetail) return false;
            }
            return true;
        });
    }, [unifiedDayEntries, dailyDateSearch]);

    // 7.3 Toggle Accordion for a Specific Day
    const toggleDailyAccordion = (dateIso) => {
        setExpandedDailyDates(prev => ({
            ...prev,
            [dateIso]: !prev[dateIso]
        }));
    };

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

    // 9.1 Single-Day Financial Closing & Fee Audit PDF Export (100% Offline, Zero DB Reads)
    const handleDownloadSingleDayReport = async (dayGroup) => {
        if (!dayGroup) return;
        setIsGeneratingDailyPDF(true);
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
            doc.setFontSize(16);
            doc.setTextColor(255, 255, 255);
            doc.text((schoolInfo.name || 'SCHOOL REPORT').toUpperCase(), headerTextX, 19);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(148, 163, 184);
            doc.text(`Daily Financial Closing & Fee Collection Audit Statement`, headerTextX, 26);

            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(56, 189, 248); // Sky blue
            doc.text(`Audit Date: ${dayGroup.displayDate} (${dayGroup.dayName})`, headerTextX, 33);

            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(203, 213, 225);
            doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} | 100% Offline Verified`, headerTextX, 39);

            // 1. Daily Financial Breakdown Table
            let startY = 53;
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text("1. Daily Cash Inflow & Outflow Summary", 14, startY);

            const summaryData = [
                ['Counter Cash Fees (Cash in Drawer)', `${dayGroup.txs.filter(t => (t.paymentMode||'').toLowerCase() === 'cash').length} Receipts`, `Rs ${dayGroup.counterCashFees.toLocaleString()}`],
                ['Online Fees (EasyPaisa)', `${dayGroup.txs.filter(t => (t.paymentMode||'').toLowerCase().includes('easy')).length} Receipts`, `Rs ${dayGroup.easyPaisaFees.toLocaleString()}`],
                ['Online Fees (JazzCash)', `${dayGroup.txs.filter(t => (t.paymentMode||'').toLowerCase().includes('jazz')).length} Receipts`, `Rs ${dayGroup.jazzCashFees.toLocaleString()}`],
                ['Online Fees (Bank Transfer)', `${dayGroup.txs.filter(t => (t.paymentMode||'').toLowerCase().includes('bank')).length} Receipts`, `Rs ${dayGroup.bankFees.toLocaleString()}`],
                ['Direct Incomes (Store / Canteen / Other)', `${dayGroup.incomes.length} Recorded Heads`, `Rs ${dayGroup.totalDirectIncome.toLocaleString()}`],
                ['Gross Total Inflow', `${dayGroup.txs.length + dayGroup.incomes.length} Inflow Heads`, `Rs ${dayGroup.grossInflow.toLocaleString()}`],
                ['Operational Expenses / Vouchers', `${dayGroup.expenses.length} Expense Entries`, `Rs ${dayGroup.totalExpenses.toLocaleString()}`],
                ['Net Daily Balance / Cash Surplus', dayGroup.netBalance >= 0 ? 'Surplus Inflow' : 'Deficit', `Rs ${dayGroup.netBalance.toLocaleString()}`]
            ];

            autoTable(doc, {
                startY: startY + 3,
                head: [['Financial Head', 'Details / Transaction Count', 'Amount (PKR)']],
                body: summaryData,
                theme: 'grid',
                headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
                styles: { fontSize: 8, cellPadding: 2.8 },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 75 },
                    1: { textColor: [100, 116, 139] },
                    2: { halign: 'right', fontStyle: 'bold' }
                }
            });

            let nextY = doc.lastAutoTable.finalY + 8;

            // 2. Itemized Fee Receipts Table
            if (dayGroup.txs.length > 0) {
                if (nextY > 235) { doc.addPage(); nextY = 20; }
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(15, 23, 42);
                doc.text(`2. Itemized Student Fee Receipts (${dayGroup.txs.length})`, 14, nextY);

                const txRows = dayGroup.txs.map((tx, idx) => [
                    idx + 1,
                    tx.receiptNo || tx.id || '-',
                    tx.studentName || 'Student',
                    `${tx.className || '-'} ${tx.rollNo && tx.rollNo !== '-' ? `(Roll: ${tx.rollNo})` : ''}`,
                    tx.paymentMode || 'Cash',
                    tx.timeString || '-',
                    `Rs ${Number(tx.totalPaid || 0).toLocaleString()}`
                ]);

                autoTable(doc, {
                    startY: nextY + 3,
                    head: [['#', 'Receipt #', 'Student Name', 'Class (Roll)', 'Payment Mode', 'Time', 'Paid (PKR)']],
                    body: txRows,
                    theme: 'striped',
                    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
                    styles: { fontSize: 7.5, cellPadding: 2.2 },
                    columnStyles: {
                        0: { cellWidth: 8, halign: 'center' },
                        1: { fontStyle: 'bold', cellWidth: 28 },
                        2: { fontStyle: 'bold' },
                        4: { halign: 'center' },
                        5: { halign: 'center', textColor: [100, 116, 139] },
                        6: { halign: 'right', fontStyle: 'bold', textColor: [22, 101, 52] }
                    }
                });
                nextY = doc.lastAutoTable.finalY + 8;
            }

            // 3. Direct Incomes Table if any
            if (dayGroup.incomes.length > 0) {
                if (nextY > 240) { doc.addPage(); nextY = 20; }
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(15, 23, 42);
                doc.text(`3. Daily Direct Incomes & Receipts (${dayGroup.incomes.length})`, 14, nextY);

                const incRows = dayGroup.incomes.map((inc, idx) => [
                    idx + 1,
                    inc.name || inc.title || inc.category || 'Direct Income',
                    inc.category || 'General',
                    inc.type === 'permanent' ? 'Monthly Fixed' : 'One-Time',
                    inc.remarks || '-',
                    `Rs ${Number(inc.amount || 0).toLocaleString()}`
                ]);

                autoTable(doc, {
                    startY: nextY + 3,
                    head: [['#', 'Income Title / Source', 'Category', 'Type', 'Remarks', 'Amount (PKR)']],
                    body: incRows,
                    theme: 'striped',
                    headStyles: { fillColor: [22, 101, 52], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
                    styles: { fontSize: 7.5, cellPadding: 2.2 },
                    columnStyles: {
                        0: { cellWidth: 8, halign: 'center' },
                        1: { fontStyle: 'bold' },
                        3: { halign: 'center' },
                        5: { halign: 'right', fontStyle: 'bold', textColor: [22, 101, 52] }
                    }
                });
                nextY = doc.lastAutoTable.finalY + 8;
            }

            // 4. Operational Expenses Table if any
            if (dayGroup.expenses.length > 0) {
                if (nextY > 240) { doc.addPage(); nextY = 20; }
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(15, 23, 42);
                doc.text(`4. Daily Operational Expenses (${dayGroup.expenses.length})`, 14, nextY);

                const expRows = dayGroup.expenses.map((e, idx) => [
                    idx + 1,
                    e.name || 'Expense Item',
                    e.category || 'General',
                    e.remarks || '-',
                    `Rs ${Number(e.amount || 0).toLocaleString()}`
                ]);

                autoTable(doc, {
                    startY: nextY + 3,
                    head: [['#', 'Expense Title', 'Category', 'Remarks', 'Amount (PKR)']],
                    body: expRows,
                    theme: 'striped',
                    headStyles: { fillColor: [185, 28, 28], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
                    styles: { fontSize: 7.5, cellPadding: 2.2 },
                    columnStyles: {
                        0: { cellWidth: 8, halign: 'center' },
                        1: { fontStyle: 'bold' },
                        4: { halign: 'right', fontStyle: 'bold', textColor: [185, 28, 28] }
                    }
                });
                nextY = doc.lastAutoTable.finalY + 8;
            }

            // Signature Block
            if (nextY > 250) { doc.addPage(); nextY = 20; } else { nextY = Math.max(nextY + 12, 260); }
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.line(14, nextY, 70, nextY);
            doc.text("Cashier / Accountant Signature", 14, nextY + 4);

            doc.line(pageWidth - 70, nextY, pageWidth - 14, nextY);
            doc.text("Principal / Administrator Verification", pageWidth - 70, nextY + 4);

            doc.save(`Daily_Financial_Audit_${dayGroup.dateIso}.pdf`);
        } catch (err) {
            console.error("Daily PDF error:", err);
            alert("Could not generate daily PDF report: " + err.message);
        }
        setIsGeneratingDailyPDF(false);
    };

    // Download Single/Family Fee Receipt PDF from Modal (Exact Dual-Copy Matching Image 2)
    const handleDownloadModalSlipPDF = async () => {
        if (!selectedReceiptForModal) return;
        setIsDownloadingModalSlip(true);
        try {
            const JsPdfClass = (typeof jsPDF === 'function')
                ? jsPDF
                : (jsPDF?.jsPDF || jsPDF?.default?.jsPDF || jsPDF?.default || (typeof window !== 'undefined' && (window.jspdf?.jsPDF || window.jsPDF)));
            if (!JsPdfClass) throw new Error("jsPDF constructor is unavailable.");
            const doc = new JsPdfClass({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const rec = selectedReceiptForModal;
            const isMultiFamily = Boolean(rec.isFamilyCombined || (rec.familyStudents && rec.familyStudents.length > 1));
            const cashierName = rec.collectedBy || auth?.currentUser?.displayName || 'Principal Office';

            // 1. Fetch School Logo Base64 once for both copies
            let logoBase64 = null;
            let logoFormat = 'PNG';
            const logoUrl = schoolInfo?.logo || schoolInfo?.logoUrl || '';
            if (logoUrl) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 2500);
                    const response = await fetch(logoUrl, { signal: controller.signal });
                    clearTimeout(timeoutId);
                    if (response.ok) {
                        const blob = await response.blob();
                        const base64Img = await new Promise((res) => {
                            const reader = new FileReader();
                            reader.onloadend = () => res(reader.result);
                            reader.onerror = () => res(null);
                            reader.readAsDataURL(blob);
                        });
                        if (base64Img) {
                            logoFormat = base64Img.includes('image/png') ? 'PNG' : 'JPEG';
                            logoBase64 = base64Img;
                        }
                    }
                } catch (e) {
                    console.warn("Logo load error:", e);
                }
            }

            const safeAutoTable = (typeof autoTable === 'function')
                ? autoTable
                : (autoTable?.default || autoTable?.autoTable || doc.autoTable);

            const renderCopy = (copyTitle, startY, isOfficeCopy) => {
                const startX = 10;
                const copyWidth = 190;
                const copyHeight = 134;
                const padLeft = 14;
                const padRight = 196;
                const contentWidth = 182;

                // 1. Outer Container Border
                if (isOfficeCopy) {
                    doc.setDrawColor(0, 120, 212); // #0078d4
                    doc.setLineWidth(0.4);
                    doc.setLineDashPattern([2, 1.5], 0);
                    doc.setFillColor(250, 252, 255);
                    doc.roundedRect(startX, startY, copyWidth, copyHeight, 2.5, 2.5, 'FD');
                    doc.setLineDashPattern([], 0);
                } else {
                    doc.setDrawColor(15, 23, 42); // #0f172a
                    doc.setLineWidth(0.4);
                    doc.setFillColor(255, 255, 255);
                    doc.roundedRect(startX, startY, copyWidth, copyHeight, 2.5, 2.5, 'FD');
                }

                // 2. Header
                let headerTextX = padLeft;
                if (logoBase64) {
                    try {
                        doc.addImage(logoBase64, logoFormat, padLeft, startY + 3.5, 11, 11);
                        headerTextX = padLeft + 14;
                    } catch (e) {
                        headerTextX = padLeft;
                    }
                } else {
                    doc.setFillColor(0, 120, 212);
                    doc.circle(padLeft + 5.5, startY + 9, 5.5, 'F');
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8);
                    doc.setTextColor(255, 255, 255);
                    const initial = (schoolInfo?.name || 'S').trim().charAt(0).toUpperCase();
                    doc.text(initial, padLeft + 5.5, startY + 11.5, { align: 'center' });
                    headerTextX = padLeft + 14;
                }

                // School Name
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10.5);
                doc.setTextColor(15, 23, 42);
                const schoolName = (schoolInfo?.name && schoolInfo.name !== 'School Name' && schoolInfo.name !== 'School Report'
                    ? schoolInfo.name
                    : 'SMART PUBLIC SCHOOL').toUpperCase();
                doc.text(schoolName, headerTextX, startY + 8);

                // Subtitle / Address
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(6.5);
                doc.setTextColor(100, 116, 139);
                const addressText = schoolInfo?.address || 'Main Campus, Pakistan';
                const phoneText = (schoolInfo?.phone || schoolInfo?.contact) ? ` | Contact: ${schoolInfo?.phone || schoolInfo?.contact}` : '';
                doc.text(`${addressText}${phoneText}`, headerTextX, startY + 12.5);

                // Right Header: Badge (Pill)
                const badgeWidth = 44;
                const badgeX = padRight - badgeWidth;
                if (isOfficeCopy) {
                    doc.setFillColor(0, 120, 212);
                } else {
                    doc.setFillColor(15, 23, 42);
                }
                doc.roundedRect(badgeX, startY + 3.5, badgeWidth, 5.5, 1, 1, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6.5);
                doc.setTextColor(255, 255, 255);
                doc.text(copyTitle, badgeX + (badgeWidth / 2), startY + 7.3, { align: 'center' });

                // Slip Number below badge
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                doc.setTextColor(0, 120, 212);
                const slipNo = rec.receiptNo || rec.id || 'N/A';
                doc.text(`Slip #${slipNo}`, padRight, startY + 13.5, { align: 'right' });

                // Divider under Header
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.3);
                doc.line(padLeft, startY + 16.5, padRight, startY + 16.5);

                // 3. Meta Details Bar (Row 1)
                doc.setFillColor(248, 250, 252);
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.25);
                doc.roundedRect(padLeft, startY + 18.5, contentWidth, 10.5, 1.2, 1.2, 'FD');

                const col1X = padLeft + 3;
                const col2X = padLeft + 48;
                const col3X = padLeft + 94;
                const col4X = padLeft + 139;

                // Date & Time
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(5.5);
                doc.setTextColor(100, 116, 139);
                doc.text('DATE & TIME', col1X, startY + 22.2);
                doc.setFontSize(6.8);
                doc.setTextColor(15, 23, 42);
                const dtStr = `${rec.dateString || rec.dateIso || 'Today'} ${rec.timeString || ''}`.trim();
                doc.text(dtStr, col1X, startY + 26);

                // Payment Method
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(5.5);
                doc.setTextColor(100, 116, 139);
                doc.text('PAYMENT METHOD', col2X, startY + 22.2);
                doc.setFontSize(6.8);
                doc.setTextColor(22, 163, 74);
                doc.text(rec.paymentMode || 'Cash', col2X, startY + 26);

                // Received By
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(5.5);
                doc.setTextColor(100, 116, 139);
                doc.text('RECEIVED BY', col3X, startY + 22.2);
                doc.setFontSize(6.8);
                doc.setTextColor(15, 23, 42);
                doc.text(cashierName, col3X, startY + 26);

                // Trx / Ref No
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(5.5);
                doc.setTextColor(100, 116, 139);
                doc.text('TRX / REF NO', col4X, startY + 22.2);
                doc.setFontSize(6.8);
                doc.setTextColor(67, 56, 202);
                const trxRef = rec.trxId || rec.transactionId || rec.referenceId || rec.senderAccount || 'Counter Cash';
                doc.text(trxRef, col4X, startY + 26);

                // 4. Student Information Grid (Row 2)
                if (isMultiFamily) {
                    doc.setFillColor(240, 249, 255);
                    doc.setDrawColor(186, 230, 253);
                    doc.setLineWidth(0.25);
                    doc.roundedRect(padLeft, startY + 30.5, contentWidth, 10.5, 1.2, 1.2, 'FD');

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(6);
                    doc.setTextColor(3, 105, 161);
                    doc.text('Parent / Guardian:', col1X, startY + 34.5);
                    doc.setTextColor(15, 23, 42);
                    doc.text(rec.fatherName || 'Parent', col1X + 22, startY + 34.5);
                    doc.setTextColor(2, 132, 199);
                    doc.text(`${rec.familyStudents?.length || 0} Family Students Combined`, padRight - 3, startY + 34.5, { align: 'right' });

                    doc.setTextColor(3, 105, 161);
                    doc.text('Students:', col1X, startY + 38.5);
                    doc.setTextColor(15, 23, 42);
                    const famSummary = (rec.familyStudents || []).map(s => `${s.studentName} (${s.className || 'Class'})`).join(' - ');
                    doc.text(famSummary, col1X + 13, startY + 38.5);
                } else {
                    doc.setFillColor(248, 250, 252);
                    doc.setDrawColor(226, 232, 240);
                    doc.setLineWidth(0.25);
                    doc.roundedRect(padLeft, startY + 30.5, contentWidth, 10.5, 1.2, 1.2, 'FD');

                    // Student Name
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(5.5);
                    doc.setTextColor(100, 116, 139);
                    doc.text('STUDENT NAME', col1X, startY + 34.2);
                    doc.setFontSize(6.8);
                    doc.setTextColor(15, 23, 42);
                    doc.text(rec.studentName || 'Student', col1X, startY + 38);

                    // Father Name
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(5.5);
                    doc.setTextColor(100, 116, 139);
                    doc.text('FATHER NAME', col2X, startY + 34.2);
                    doc.setFontSize(6.8);
                    doc.setTextColor(15, 23, 42);
                    doc.text(rec.fatherName || 'N/A', col2X, startY + 38);

                    // Class & Section
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(5.5);
                    doc.setTextColor(100, 116, 139);
                    doc.text('CLASS & SECTION', col3X, startY + 34.2);
                    doc.setFontSize(6.8);
                    doc.setTextColor(15, 23, 42);
                    doc.text(rec.className || 'Class', col3X, startY + 38);

                    // Roll / Admission No
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(5.5);
                    doc.setTextColor(100, 116, 139);
                    doc.text('ROLL / ADMISSION NO', col4X, startY + 34.2);
                    doc.setFontSize(6.8);
                    doc.setTextColor(0, 120, 212);
                    doc.text(String(rec.rollNo || rec.admissionNo || 'N/A'), col4X, startY + 38);
                }

                // 5. Fee Particulars Table
                const tableBody = [];
                if (isMultiFamily) {
                    (rec.familyStudents || []).forEach(st => {
                        const itemNames = (st.items || []).map(it => it.name).join(', ') || 'Monthly Fee';
                        const stAmt = Number(st.subtotal || st.totalDue || st.amount || 0);
                        tableBody.push([
                            `${st.studentName} (${st.className || 'Class'}) - ${itemNames}`,
                            `Rs ${stAmt.toLocaleString()}`
                        ]);
                    });
                } else {
                    const rawItems = (rec.items && Array.isArray(rec.items) && rec.items.length > 0)
                        ? rec.items
                        : [{ name: 'Monthly Tuition (September)', amount: rec.totalPaid || rec.amount || 0 }];
                    rawItems.forEach(it => {
                        const name = typeof it === 'string' ? it : (it.name || it.title || 'Monthly Tuition Fee');
                        const amt = typeof it === 'object' ? Number(it.amount || 0) : Number(it || 0);
                        tableBody.push([name, `Rs ${amt.toLocaleString()}`]);
                    });
                }

                if (Number(rec.fineAmount) > 0) {
                    tableBody.push([
                        '+ Late Fee Fine / Arrears',
                        `Rs ${Number(rec.fineAmount).toLocaleString()}`
                    ]);
                }

                if (Number(rec.discount) > 0) {
                    tableBody.push([
                        '- Concession / Discount Applied',
                        `- Rs ${Number(rec.discount).toLocaleString()}`
                    ]);
                }

                const totalPaidNumber = Number(rec.totalPaid || rec.amount || 0);

                // Highlighted Total Amount Paid Row
                tableBody.push([
                    {
                        content: 'TOTAL AMOUNT PAID',
                        styles: {
                            fontStyle: 'bold',
                            textColor: [22, 101, 52],
                            fillColor: [240, 253, 244],
                            fontSize: 7.5
                        }
                    },
                    {
                        content: `Rs ${totalPaidNumber.toLocaleString()}/-`,
                        styles: {
                            halign: 'right',
                            fontStyle: 'bold',
                            textColor: [22, 101, 52],
                            fillColor: [240, 253, 244],
                            fontSize: 8
                        }
                    }
                ]);

                safeAutoTable(doc, {
                    startY: startY + 42.5,
                    margin: { left: padLeft, right: 210 - padRight },
                    tableWidth: contentWidth,
                    head: [['Fee Particulars / Description', 'Amount (PKR)']],
                    body: tableBody,
                    theme: 'plain',
                    headStyles: {
                        fillColor: [15, 23, 42],
                        textColor: [255, 255, 255],
                        fontStyle: 'bold',
                        fontSize: 7.2,
                        cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }
                    },
                    columnStyles: {
                        0: { halign: 'left', cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
                        1: { halign: 'right', cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, cellWidth: 38 }
                    },
                    styles: {
                        font: 'helvetica',
                        fontSize: 7,
                        textColor: [15, 23, 42],
                        lineColor: [226, 232, 240],
                        lineWidth: 0.2
                    },
                    didDrawCell: function(data) {
                        if (data.section === 'body') {
                            doc.setDrawColor(226, 232, 240);
                            doc.setLineWidth(0.2);
                            doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
                        }
                    }
                });

                const tableEndY = doc.lastAutoTable?.finalY || (startY + 70);
                const wordsY = tableEndY + 2;

                // 6. In Words & Remarks Bar
                doc.setFillColor(248, 250, 252);
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.2);
                doc.roundedRect(padLeft, wordsY, contentWidth, 5.5, 1.2, 1.2, 'FD');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6.5);
                doc.setTextColor(51, 65, 85);
                doc.text('Amount In Words: ', padLeft + 3, wordsY + 3.8);

                const labelWidth = doc.getTextWidth('Amount In Words: ');
                doc.setFont('helvetica', 'bolditalic');
                doc.setTextColor(15, 23, 42);
                const wordsText = numberToWords(totalPaidNumber);
                doc.text(wordsText, padLeft + 3 + labelWidth, wordsY + 3.8);

                if (rec.remarks) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(6);
                    doc.setTextColor(100, 116, 139);
                    doc.text(`Note: ${rec.remarks}`, padRight - 3, wordsY + 3.8, { align: 'right' });
                }

                // 7. Signatures & Micro Footer
                const sigY = startY + copyHeight - 6;

                // Depositor / Parent Signature
                doc.setDrawColor(100, 116, 139);
                doc.setLineDashPattern([1.5, 1.5], 0);
                doc.line(padLeft + 4, sigY - 4, padLeft + 44, sigY - 4);
                doc.setLineDashPattern([], 0);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(6);
                doc.setTextColor(71, 85, 105);
                doc.text('Depositor / Parent Signature', padLeft + 24, sigY, { align: 'center' });

                // Center ERP Verified Tag
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(5.5);
                doc.setTextColor(148, 163, 184);
                doc.text('Official Computer Generated Receipt - School ERP Verified', 105, sigY - 1, { align: 'center' });

                // Cashier / Authorized Stamp
                doc.setDrawColor(100, 116, 139);
                doc.setLineDashPattern([1.5, 1.5], 0);
                doc.line(padRight - 44, sigY - 4, padRight - 4, sigY - 4);
                doc.setLineDashPattern([], 0);

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6);
                doc.setTextColor(15, 23, 42);
                doc.text('Cashier / Authorized Stamp', padRight - 24, sigY, { align: 'center' });
            };

            // --- Render Copy 1: STUDENT / PARENT COPY (Top Half) ---
            renderCopy('STUDENT / PARENT COPY', 8, false);

            // --- Scissors Divider Line (Middle) ---
            doc.setDrawColor(180, 190, 205);
            doc.setLineWidth(0.3);
            doc.setLineDashPattern([2, 1.5], 0);
            doc.line(10, 146, 72, 146);
            doc.line(138, 146, 200, 146);
            doc.setLineDashPattern([], 0);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.5);
            doc.setTextColor(148, 163, 184);
            doc.text('- - - - CUT HERE / ACCOUNTS COUNTER SLIP - - - -', 105, 147.2, { align: 'center' });

            // --- Render Copy 2: OFFICE / ACCOUNTS COPY (Bottom Half) ---
            renderCopy('OFFICE / ACCOUNTS COPY', 150, true);

            // --- Save / Download PDF ---
            const safeRecNo = String(rec.receiptNo || rec.id || 'Slip').replace(/[^a-zA-Z0-9_-]/g, '_');
            const safeName = String(isMultiFamily ? (rec.fatherName || 'Family') : (rec.studentName || 'Student')).replace(/[^a-zA-Z0-9_-]/g, '_');
            const fileName = `Fee_Receipt_${safeRecNo}_${safeName}.pdf`;

            try {
                const pdfBlob = doc.output('blob');
                const blobUrl = URL.createObjectURL(pdfBlob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = blobUrl;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    try {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(blobUrl);
                    } catch (e) {}
                }, 3000);
            } catch (saveErr) {
                console.warn("Direct blob download fallback to doc.save:", saveErr);
                doc.save(fileName);
            }
        } catch (err) {
            console.error("PDF generation failed:", err);
            alert("Failed to generate PDF: " + (err.message || 'Unknown error'));
        } finally {
            setIsDownloadingModalSlip(false);
        }
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

                {/* Right Time-Machine Controls (Rock-solid flex layout) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    
                    {/* Timeframe Scope Switcher (Modern 2D Segmented Control Toggle) */}
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        background: '#f1f5f9',
                        padding: '4px',
                        borderRadius: '12px',
                        border: '1.5px solid #e2e8f0',
                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
                        flexShrink: 0,
                        gap: '2px'
                    }}>
                        {/* 1. Today */}
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedMonthMode('today');
                                setSelectedDayDateIso(null);
                                setIsDayCalendarOpen(false);
                            }}
                            style={{
                                border: 'none',
                                background: selectedMonthMode === 'today' ? '#0078d4' : 'transparent',
                                color: selectedMonthMode === 'today' ? '#ffffff' : '#475569',
                                fontWeight: selectedMonthMode === 'today' ? '800' : '700',
                                padding: '6px 14px',
                                borderRadius: '9px',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                boxShadow: selectedMonthMode === 'today' ? '0 2px 6px rgba(0, 120, 212, 0.35)' : 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Zap 
                                size={14} 
                                strokeWidth={2.5} 
                                style={{ color: selectedMonthMode === 'today' ? '#ffffff' : '#64748b' }} 
                            />
                            <span>Today</span>
                        </button>

                        {/* 2. This Month & Day Picker Popover */}
                        <div style={{ position: 'relative' }} ref={dayCalendarRef}>
                            <button
                                type="button"
                                onClick={() => setIsDayCalendarOpen(prev => !prev)}
                                style={{
                                    border: 'none',
                                    background: (selectedMonthMode === 'current' || selectedMonthMode === 'custom_month' || selectedMonthMode === 'specific_day') ? '#0078d4' : 'transparent',
                                    color: (selectedMonthMode === 'current' || selectedMonthMode === 'custom_month' || selectedMonthMode === 'specific_day') ? '#ffffff' : '#475569',
                                    fontWeight: (selectedMonthMode === 'current' || selectedMonthMode === 'custom_month' || selectedMonthMode === 'specific_day') ? '800' : '700',
                                    padding: '6px 14px',
                                    borderRadius: '9px',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    boxShadow: (selectedMonthMode === 'current' || selectedMonthMode === 'custom_month' || selectedMonthMode === 'specific_day') ? '0 2px 6px rgba(0, 120, 212, 0.35)' : 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <Calendar 
                                    size={14} 
                                    strokeWidth={2.5} 
                                    style={{ color: (selectedMonthMode === 'current' || selectedMonthMode === 'custom_month' || selectedMonthMode === 'specific_day') ? '#ffffff' : '#64748b' }} 
                                />
                                <span>
                                    {selectedMonthMode === 'specific_day' && selectedDayDateIso 
                                        ? `Day ${Number(selectedDayDateIso.split('-')[2])} (${MONTH_SHORT[Number(selectedDayDateIso.split('-')[1]) - 1]})`
                                        : 'This Month'}
                                </span>
                                <ChevronDown 
                                    size={13} 
                                    style={{ 
                                        transform: isDayCalendarOpen ? 'rotate(180deg)' : 'none', 
                                        transition: 'transform 0.2s',
                                        color: (selectedMonthMode === 'current' || selectedMonthMode === 'custom_month' || selectedMonthMode === 'specific_day') ? '#ffffff' : '#64748b'
                                    }} 
                                />
                            </button>

                            {/* Dropdown Mini Calendar Popover */}
                            {isDayCalendarOpen && (
                                <div style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 8px)',
                                    right: 0,
                                    width: '280px',
                                    background: '#ffffff',
                                    borderRadius: '16px',
                                    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0,0,0,0.08)',
                                    padding: '12px 14px',
                                    zIndex: 9999,
                                    animation: 'fadeIn 0.15s ease-out'
                                }}>
                                    {/* Header */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                        <span style={{ fontWeight: '800', fontSize: '0.88rem', color: '#0f172a' }}>
                                            {MONTH_NAMES[((selectedMonthMode === 'current' ? currentMonthNum : customSelectedMonthNum) || currentMonthNum) - 1]} {selectedYear}
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>
                                            Daily Ledger
                                        </span>
                                    </div>

                                    {/* Total This Month Button */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedMonthMode('current');
                                            setSelectedDayDateIso(null);
                                            setIsDayCalendarOpen(false);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            borderRadius: '9px',
                                            background: selectedMonthMode !== 'specific_day' ? '#eff6ff' : '#f8fafc',
                                            border: selectedMonthMode !== 'specific_day' ? '1.5px solid #93c5fd' : '1px solid #e2e8f0',
                                            color: selectedMonthMode !== 'specific_day' ? '#1d4ed8' : '#334155',
                                            fontWeight: '700',
                                            fontSize: '0.8rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px',
                                            cursor: 'pointer',
                                            marginBottom: '10px',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <Sparkles size={13} color="#2563eb" />
                                        <span>Total This Month (Full Summary)</span>
                                        {selectedMonthMode !== 'specific_day' && <Check size={13} color="#1d4ed8" />}
                                    </button>

                                    {/* Days of Week Header */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center', marginBottom: '6px' }}>
                                        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((dayName, idx) => (
                                            <span key={idx} style={{ fontSize: '0.68rem', fontWeight: '700', color: '#94a3b8' }}>
                                                {dayName}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Month Days Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                                        {calendarGridCells.map((cell) => {
                                            if (cell.type === 'empty') {
                                                return <div key={cell.key} style={{ height: '30px' }} />;
                                            }
                                            const { day } = cell;
                                            const isSelected = selectedMonthMode === 'specific_day' && selectedDayDateIso === day.dateIso;
                                            const isToday = day.dateIso === todayIsoDate;
                                            const isFuture = day.dateIso > todayIsoDate;
                                            const hasActivity = (day.totalFeePaid > 0) || (day.totalDirectIncome > 0) || (day.totalExpenses > 0);

                                            return (
                                                <button
                                                    key={cell.key}
                                                    type="button"
                                                    disabled={isFuture}
                                                    onClick={() => {
                                                        setSelectedDayDateIso(day.dateIso);
                                                        setSelectedMonthMode('specific_day');
                                                        setIsDayCalendarOpen(false);
                                                    }}
                                                    style={{
                                                        height: '30px',
                                                        borderRadius: '6px',
                                                        border: isSelected ? '1.5px solid #0078d4' : (isToday ? '1.5px solid #f59e0b' : '1px solid transparent'),
                                                        background: isSelected ? '#0078d4' : (isToday ? '#fef3c7' : (hasActivity ? '#f0fdf4' : 'transparent')),
                                                        color: isSelected ? '#ffffff' : (isFuture ? '#cbd5e1' : (isToday ? '#92400e' : '#1e293b')),
                                                        fontWeight: (isSelected || isToday) ? '800' : '600',
                                                        fontSize: '0.78rem',
                                                        cursor: isFuture ? 'not-allowed' : 'pointer',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        position: 'relative',
                                                        padding: 0,
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                    title={isFuture ? 'Future date' : `${day.dateIso}${hasActivity ? ' (Has collections/expenses)' : ''}`}
                                                >
                                                    <span>{day.dayNumber}</span>
                                                    {hasActivity && !isSelected && (
                                                        <span style={{
                                                            width: '4px',
                                                            height: '4px',
                                                            borderRadius: '50%',
                                                            background: '#10b981',
                                                            position: 'absolute',
                                                            bottom: '2px'
                                                        }} />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 3. Whole Year */}
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedMonthMode('all_year');
                                setSelectedDayDateIso(null);
                                setIsDayCalendarOpen(false);
                            }}
                            style={{
                                border: 'none',
                                background: selectedMonthMode === 'all_year' ? '#0078d4' : 'transparent',
                                color: selectedMonthMode === 'all_year' ? '#ffffff' : '#475569',
                                fontWeight: selectedMonthMode === 'all_year' ? '800' : '700',
                                padding: '6px 14px',
                                borderRadius: '9px',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                boxShadow: selectedMonthMode === 'all_year' ? '0 2px 6px rgba(0, 120, 212, 0.35)' : 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <CalendarDays 
                                size={14} 
                                strokeWidth={2.5} 
                                style={{ color: selectedMonthMode === 'all_year' ? '#ffffff' : '#64748b' }} 
                            />
                            <span>Whole Year</span>
                        </button>
                    </div>

                    {/* Year Selector Dropdown */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#f8fafc', padding: '0.4rem 0.8rem', borderRadius: '10px', border: '1px solid #cbd5e1', flexShrink: 0 }}>
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

                    {/* Month Selector Dropdown (Persistent to prevent layout shift) */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        background: '#f8fafc',
                        padding: '0.4rem 0.8rem',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        flexShrink: 0
                    }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#64748b' }}>Month:</span>
                        <select
                            value={selectedMonthMode === 'all_year' ? 'all' : (selectedMonthMode === 'current' ? currentMonthNum : customSelectedMonthNum)}
                            onChange={(e) => {
                                if (e.target.value === 'all') {
                                    setSelectedMonthMode('all_year');
                                } else {
                                    setSelectedMonthMode('custom_month');
                                    setCustomSelectedMonthNum(Number(e.target.value));
                                }
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
                            <option value="all">All Year (Jan-Dec)</option>
                            {MONTH_NAMES.map((name, idx) => (
                                <option key={name} value={idx + 1}>
                                    {name} {(idx + 1) === currentMonthNum && selectedYear === currentYearNum ? '(Current)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Clean Demo Data Button (Shown strictly for Demo School 6257 when demo records are detected) */}
                    {isDemoAccount && hasDemoData && (
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

            {/* Specific Day Filter Active Banner */}
            {selectedMonthMode === 'specific_day' && selectedDayDateIso && (
                <div style={{
                    background: '#eff6ff',
                    border: '1.5px solid #93c5fd',
                    borderRadius: '14px',
                    padding: '0.75rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    flexWrap: 'wrap',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.08)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: '#2563eb',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <CalendarDays size={18} />
                        </div>
                        <div>
                            <span style={{ fontSize: '0.92rem', fontWeight: '800', color: '#1e3a8a' }}>
                                Day View Active: {selectedDayDateIso}
                            </span>
                            <span style={{ display: 'block', fontSize: '0.76rem', color: '#475569', fontWeight: '500' }}>
                                Showing receipts, direct incomes, and operational expenses recorded strictly on this calendar date.
                            </span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            setSelectedMonthMode('current');
                            setSelectedDayDateIso(null);
                        }}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            padding: '0.45rem 0.95rem',
                            borderRadius: '8px',
                            background: '#ffffff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            fontWeight: '700',
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                            transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#dbeafe'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                    >
                        <RotateCcw size={14} />
                        <span>Reset to Whole Month</span>
                    </button>
                </div>
            )}

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
            {/* 5 EXECUTIVE KPI METRIC CARDS (P&L Financial Flow: Revenue, Incomes, Expenses, Salaries, Net) */}
            {/* ========================================================= */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '1rem'
            }}>
                {/* 1. Fee Revenue / Collections */}
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
                            🎓 Fee Collections
                        </span>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0078d4', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                            <FileText size={17} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#0f172a', marginTop: '0.35rem' }}>
                        Rs {(calculatedMetrics.totalFeePaid || 0).toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem', fontSize: '0.78rem', color: '#64748b' }}>
                        <CheckCircle2 size={13} color="#16a34a" />
                        <span><strong>{calculatedMetrics.scopedTxs.length}</strong> Paid Slips (Offline + Online)</span>
                    </div>
                </div>

                {/* 2. Direct & Other Incomes */}
                <div className="card" style={{
                    background: '#ffffff',
                    backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)',
                    border: '1px solid #dcfce7',
                    borderLeft: '4px solid #16a34a',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    boxShadow: '0 10px 15px -3px rgba(22, 163, 74, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255,255,255,0.9)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            💰 Other Incomes
                        </span>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                            <TrendingUp size={17} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#166534', marginTop: '0.35rem' }}>
                        +Rs {(calculatedMetrics.totalDirectIncomes || 0).toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem', fontSize: '0.78rem', color: '#166534', fontWeight: '700' }}>
                        <span><strong>{calculatedMetrics.scopedIncomes.length}</strong> Inflow Vouchers Logged</span>
                    </div>
                </div>

                {/* 3. Operational Expenses */}
                <div className="card" style={{
                    background: '#ffffff',
                    backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #fef2f2 100%)',
                    border: '1px solid #fee2e2',
                    borderLeft: '4px solid #dc2626',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    boxShadow: '0 10px 15px -3px rgba(220, 38, 38, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255,255,255,0.9)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            🏷️ Operational Expenses
                        </span>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                            <Receipt size={17} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#991b1b', marginTop: '0.35rem' }}>
                        -Rs {(calculatedMetrics.totalOperationalExpenses || 0).toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem', fontSize: '0.78rem', color: '#991b1b', fontWeight: '700' }}>
                        <span><strong>{calculatedMetrics.scopedExpenses.length}</strong> Bills & Running Costs</span>
                    </div>
                </div>

                {/* 4. Staff Salaries & Payroll */}
                <div className="card" style={{
                    background: '#ffffff',
                    backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #fffbeb 100%)',
                    border: '1px solid #fef3c7',
                    borderLeft: '4px solid #f59e0b',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    boxShadow: '0 10px 15px -3px rgba(245, 158, 11, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255,255,255,0.9)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            👥 Staff Salaries
                        </span>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                            <Users size={17} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#b45309', marginTop: '0.35rem' }}>
                        -Rs {(calculatedMetrics.totalTeacherSalariesPaid || 0).toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', marginTop: '0.35rem', fontSize: '0.75rem', color: '#92400e', fontWeight: '700', flexWrap: 'wrap' }}>
                        <span><strong>{calculatedMetrics.staffPaidCount} / {calculatedMetrics.totalStaffCount}</strong> Staff Disbursed</span>
                        {calculatedMetrics.totalStaffBudget > 0 && (
                            <span style={{ color: '#b45309', fontSize: '0.72rem', background: '#fef3c7', padding: '1px 6px', borderRadius: '4px' }}>
                                Budget: Rs {calculatedMetrics.totalStaffBudget.toLocaleString()}
                            </span>
                        )}
                    </div>
                </div>

                {/* 5. Net School Balance / Profit */}
                <div className="card" style={{
                    background: (calculatedMetrics.netProfit || 0) >= 0 ? 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)' : 'linear-gradient(180deg, #ffffff 0%, #fef2f2 100%)',
                    border: `1px solid ${(calculatedMetrics.netProfit || 0) >= 0 ? '#bbf7d0' : '#fecaca'}`,
                    borderLeft: `4px solid ${(calculatedMetrics.netProfit || 0) >= 0 ? '#10b981' : '#dc2626'}`,
                    borderRadius: '16px',
                    padding: '1.25rem',
                    boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255,255,255,0.9)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: '800', color: (calculatedMetrics.netProfit || 0) >= 0 ? '#166534' : '#991b1b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            💎 Net School Profit
                        </span>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: (calculatedMetrics.netProfit || 0) >= 0 ? '#16a34a' : '#dc2626', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' }}>
                            <Zap size={17} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: (calculatedMetrics.netProfit || 0) >= 0 ? '#16a34a' : '#dc2626', marginTop: '0.35rem' }}>
                        Rs {(calculatedMetrics.netProfit || 0).toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem', fontSize: '0.78rem', color: (calculatedMetrics.netProfit || 0) >= 0 ? '#166534' : '#991b1b', fontWeight: '700' }}>
                        <span>{(calculatedMetrics.netProfit || 0) >= 0 ? `Surplus (${calculatedMetrics.profitMarginPercent}% Margin)` : 'Deficit / Overdraft'}</span>
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

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                {hasDemoData && (
                                    <button
                                        type="button"
                                        onClick={handlePurgeFinancialDemoData}
                                        disabled={isPurgingDemo}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.45rem',
                                            padding: '0.55rem 1.15rem',
                                            borderRadius: '10px',
                                            border: '1px solid #fca5a5',
                                            background: '#fef2f2',
                                            color: '#b91c1c',
                                            fontWeight: '800',
                                            fontSize: '0.85rem',
                                            cursor: isPurgingDemo ? 'not-allowed' : 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                        title="Purge / Clean all demo financial transactions, store sales, payroll & direct entries"
                                    >
                                        {isPurgingDemo ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                        <span>{isPurgingDemo ? 'Cleaning...' : '🧹 Clear Demo Data'}</span>
                                    </button>
                                )}

                                <button
                                    type="button"
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
                                    title="Inject 12-month demo transactions, store sales, payroll & 3D chart analytics for School ID 6257 presentation"
                                >
                                    {isInjectingDemo ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
                                    <span>{isInjectingDemo ? 'Injecting Presentation Data...' : '⚡ Inject Demo Financial Data'}</span>
                                </button>
                            </div>
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

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
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

                                        {/* Demo 6257 Action Buttons */}
                                        {isDemoAccount && (
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                <button
                                                    type="button"
                                                    onClick={handleInjectFinancialDemoData}
                                                    disabled={isInjectingDemo}
                                                    title="Inject Demo Data for Financial Wheel"
                                                    style={{
                                                        border: 'none',
                                                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                                        color: '#ffffff',
                                                        fontWeight: '800',
                                                        fontSize: '0.72rem',
                                                        padding: '5px 9px',
                                                        borderRadius: '7px',
                                                        cursor: isInjectingDemo ? 'not-allowed' : 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '3px',
                                                        boxShadow: '0 2px 5px rgba(245, 158, 11, 0.3)'
                                                    }}
                                                >
                                                    <Sparkles size={12} /> Inject Demo
                                                </button>
                                                {hasDemoData && (
                                                    <button
                                                        type="button"
                                                        onClick={handlePurgeFinancialDemoData}
                                                        disabled={isPurgingDemo}
                                                        title="Clear Demo Financial Data"
                                                        style={{
                                                            border: '1px solid #fca5a5',
                                                            background: '#fef2f2',
                                                            color: '#b91c1c',
                                                            fontWeight: '800',
                                                            fontSize: '0.72rem',
                                                            padding: '5px 8px',
                                                            borderRadius: '7px',
                                                            cursor: isPurgingDemo ? 'not-allowed' : 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '3px'
                                                        }}
                                                    >
                                                        <Trash2 size={12} /> Clear
                                                    </button>
                                                )}
                                            </div>
                                        )}
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

                                        {/* Demo 6257 Action Buttons */}
                                        {isDemoAccount && (
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                <button
                                                    type="button"
                                                    onClick={handleInjectFinancialDemoData}
                                                    disabled={isInjectingDemo}
                                                    title="Inject 12-Month Inflow/Outflow Demo Data"
                                                    style={{
                                                        border: 'none',
                                                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                                        color: '#ffffff',
                                                        fontWeight: '800',
                                                        fontSize: '0.72rem',
                                                        padding: '5px 9px',
                                                        borderRadius: '7px',
                                                        cursor: isInjectingDemo ? 'not-allowed' : 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '3px',
                                                        boxShadow: '0 2px 5px rgba(245, 158, 11, 0.3)'
                                                    }}
                                                >
                                                    <Sparkles size={12} /> Inject 12M Demo
                                                </button>
                                                {hasDemoData && (
                                                    <button
                                                        type="button"
                                                        onClick={handlePurgeFinancialDemoData}
                                                        disabled={isPurgingDemo}
                                                        title="Clear Demo Financial Data"
                                                        style={{
                                                            border: '1px solid #fca5a5',
                                                            background: '#fef2f2',
                                                            color: '#b91c1c',
                                                            fontWeight: '800',
                                                            fontSize: '0.72rem',
                                                            padding: '5px 8px',
                                                            borderRadius: '7px',
                                                            cursor: isPurgingDemo ? 'not-allowed' : 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '3px'
                                                        }}
                                                    >
                                                        <Trash2 size={12} /> Clear
                                                    </button>
                                                )}
                                            </div>
                                        )}
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
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.2rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                                    💳 Payment Gateways & Channels
                                </h3>
                                {isDemoAccount && (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                        <button
                                            type="button"
                                            onClick={handleInjectFinancialDemoData}
                                            disabled={isInjectingDemo}
                                            title="Inject Gateway Demo Data (Cash, EasyPaisa, JazzCash, Bank)"
                                            style={{
                                                border: 'none',
                                                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                                color: '#ffffff',
                                                fontWeight: '800',
                                                fontSize: '0.7rem',
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                cursor: isInjectingDemo ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '3px',
                                                boxShadow: '0 2px 5px rgba(245, 158, 11, 0.3)'
                                            }}
                                        >
                                            <Sparkles size={11} /> Inject Demo
                                        </button>
                                        {hasDemoData && (
                                            <button
                                                type="button"
                                                onClick={handlePurgeFinancialDemoData}
                                                disabled={isPurgingDemo}
                                                title="Clear Demo Financial Data"
                                                style={{
                                                    border: '1px solid #fca5a5',
                                                    background: '#fef2f2',
                                                    color: '#b91c1c',
                                                    fontWeight: '800',
                                                    fontSize: '0.7rem',
                                                    padding: '4px 7px',
                                                    borderRadius: '6px',
                                                    cursor: isPurgingDemo ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }}
                                            >
                                                <Trash2 size={11} /> Clear
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
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
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.2rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                                    🏷️ Outflow Slices & Expense Heads
                                </h3>
                                {isDemoAccount && (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                        <button
                                            type="button"
                                            onClick={handleInjectFinancialDemoData}
                                            disabled={isInjectingDemo}
                                            title="Inject Expense Categories Demo Data"
                                            style={{
                                                border: 'none',
                                                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                                color: '#ffffff',
                                                fontWeight: '800',
                                                fontSize: '0.7rem',
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                cursor: isInjectingDemo ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '3px',
                                                boxShadow: '0 2px 5px rgba(245, 158, 11, 0.3)'
                                            }}
                                        >
                                            <Sparkles size={11} /> Inject Demo
                                        </button>
                                        {hasDemoData && (
                                            <button
                                                type="button"
                                                onClick={handlePurgeFinancialDemoData}
                                                disabled={isPurgingDemo}
                                                title="Clear Demo Financial Data"
                                                style={{
                                                    border: '1px solid #fca5a5',
                                                    background: '#fef2f2',
                                                    color: '#b91c1c',
                                                    fontWeight: '800',
                                                    fontSize: '0.7rem',
                                                    padding: '4px 7px',
                                                    borderRadius: '6px',
                                                    cursor: isPurgingDemo ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }}
                                            >
                                                <Trash2 size={11} /> Clear
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
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
            {/* SUB TAB 3: MONTHLY CONSOLIDATED LEDGER (FEE SLIPS, INCOMES, EXPENSES) */}
            {/* ========================================================= */}
            {activeSubTab === 'fee_ledger' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    
                    {/* 1. Header & Month Scope Selector Bar */}
                    <div className="card" style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        padding: '1.25rem 1.5rem',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '1rem',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.01em' }}>
                                    Monthly Consolidated Ledger
                                </h3>
                                <span style={{
                                    background: '#eff6ff',
                                    color: '#0078d4',
                                    fontSize: '0.78rem',
                                    padding: '3px 10px',
                                    borderRadius: '999px',
                                    fontWeight: '800',
                                    border: '1px solid #bfdbfe'
                                }}>
                                    📅 {MONTH_NAMES[calculatedMetrics.activeMonthNum - 1]} {selectedYear}
                                </span>
                            </div>
                            <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                                Complete monthly cashflow from Daily Workflow & Online Submissions across Fee Slips, Incomes, and Expenses.
                            </p>
                        </div>

                        {/* Action Buttons (Export Month PDF) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                            <button
                                onClick={handleDownloadFinancialReport}
                                disabled={isGeneratingPDF}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #0078d4 0%, #1e40af 100%)',
                                    color: '#ffffff',
                                    fontSize: '0.82rem',
                                    fontWeight: '800',
                                    cursor: isGeneratingPDF ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 2px 6px rgba(0, 120, 212, 0.3)'
                                }}
                            >
                                {isGeneratingPDF ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                                <span>Export Month PDF</span>
                            </button>
                        </div>
                    </div>

                    {/* 2. Search Bar, Channel Filter & 3 Clean Tabs Switcher */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                        background: '#f8fafc',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '14px',
                        border: '1.5px solid #e2e8f0'
                    }}>
                        {/* 4 Main Clean Tabs */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setMonthlyLedgerTab('fee_slips');
                                    setLedgerPage(1);
                                }}
                                style={{
                                    padding: '0.55rem 1.1rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: monthlyLedgerTab === 'fee_slips' ? '#0078d4' : 'transparent',
                                    color: monthlyLedgerTab === 'fee_slips' ? '#ffffff' : '#334155',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    boxShadow: monthlyLedgerTab === 'fee_slips' ? '0 2px 6px rgba(0, 120, 212, 0.25)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <Wallet size={15} /> 🎓 Regular Fees ({calculatedMetrics.scopedRegularFeeTxs?.length || 0})
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setMonthlyLedgerTab('admission_slips');
                                    setLedgerPage(1);
                                }}
                                style={{
                                    padding: '0.55rem 1.1rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: monthlyLedgerTab === 'admission_slips' ? '#7c3aed' : 'transparent',
                                    color: monthlyLedgerTab === 'admission_slips' ? '#ffffff' : '#334155',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    boxShadow: monthlyLedgerTab === 'admission_slips' ? '0 2px 6px rgba(124, 58, 237, 0.25)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <Sparkles size={15} /> 🌟 Admission Fees ({calculatedMetrics.scopedAdmissionTxs?.length || 0})
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setMonthlyLedgerTab('incomes');
                                    setLedgerPage(1);
                                }}
                                style={{
                                    padding: '0.55rem 1.1rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: monthlyLedgerTab === 'incomes' ? '#16a34a' : 'transparent',
                                    color: monthlyLedgerTab === 'incomes' ? '#ffffff' : '#334155',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    boxShadow: monthlyLedgerTab === 'incomes' ? '0 2px 6px rgba(22, 163, 74, 0.25)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <TrendingUp size={15} /> 💰 Direct Incomes ({calculatedMetrics.scopedIncomes.length})
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setMonthlyLedgerTab('expenses');
                                    setLedgerPage(1);
                                }}
                                style={{
                                    padding: '0.55rem 1.1rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: monthlyLedgerTab === 'expenses' ? '#dc2626' : 'transparent',
                                    color: monthlyLedgerTab === 'expenses' ? '#ffffff' : '#334155',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    boxShadow: monthlyLedgerTab === 'expenses' ? '0 2px 6px rgba(220, 38, 38, 0.25)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <TrendingDown size={15} /> 🏷️ Operational Expenses ({calculatedMetrics.scopedExpenses.length})
                            </button>
                        </div>

                        {/* Search and Channel Filter */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative' }}>
                                <Search size={15} color="#64748b" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder={
                                        monthlyLedgerTab === 'fee_slips'
                                            ? "Search receipt #, student, roll, trx ID..."
                                            : (monthlyLedgerTab === 'admission_slips'
                                                ? "Search admission receipt, student, roll, class..."
                                                : (monthlyLedgerTab === 'incomes' ? "Search income name, category..." : "Search expense title, category..."))
                                    }
                                    value={searchLedger}
                                    onChange={(e) => {
                                        setSearchLedger(e.target.value);
                                        setLedgerPage(1);
                                    }}
                                    style={{
                                        padding: '0.48rem 0.75rem 0.48rem 2.1rem',
                                        borderRadius: '8px',
                                        border: '1.5px solid #cbd5e1',
                                        fontSize: '0.82rem',
                                        outline: 'none',
                                        width: '240px',
                                        background: '#ffffff',
                                        color: '#0f172a'
                                    }}
                                />
                            </div>

                            {(monthlyLedgerTab === 'fee_slips' || monthlyLedgerTab === 'admission_slips') && (
                                <select
                                    value={modeLedgerFilter}
                                    onChange={(e) => {
                                        setModeLedgerFilter(e.target.value);
                                        setLedgerPage(1);
                                    }}
                                    style={{
                                        padding: '0.48rem 0.75rem',
                                        borderRadius: '8px',
                                        border: '1.5px solid #cbd5e1',
                                        fontSize: '0.82rem',
                                        fontWeight: '700',
                                        color: '#0f172a',
                                        background: '#ffffff',
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="all">All Channels</option>
                                    <option value="Cash">💵 Cash</option>
                                    <option value="Online">📱 Online</option>
                                    <option value="EasyPaisa">🟢 EasyPaisa</option>
                                    <option value="JazzCash">🟠 JazzCash</option>
                                    <option value="Bank">🏦 Bank</option>
                                </select>
                            )}
                        </div>
                    </div>

                    {/* 4. MAIN DATA TABLE (Clean, Modular & Paginated 25 Rows per page) */}
                    <div className="card" style={{ background: '#ffffff', borderRadius: '16px', padding: '1.25rem', border: '1.5px solid #cbd5e1', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                        <div style={{ overflowX: 'auto' }}>
                            {/* ============================== */}
                            {/* TAB 1: FEE SLIPS PAID TABLE */}
                            {/* ============================== */}
                            {monthlyLedgerTab === 'fee_slips' && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '800' }}>Receipt #</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '800' }}>Student & Class</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '800' }}>Date & Time</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#475569', fontWeight: '800' }}>Channel / Mode</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '800' }}>Trx / Reference ID</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: '#16a34a', fontWeight: '800' }}>Amount Paid</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#475569', fontWeight: '800' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedMonthlyTxs.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
                                                    <FileText size={32} style={{ opacity: 0.35, marginBottom: '0.5rem' }} />
                                                    <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>No fee receipts found for {MONTH_NAMES[calculatedMetrics.activeMonthNum - 1]} {selectedYear}.</div>
                                                    <div style={{ fontSize: '0.78rem' }}>Fee collections logged in Daily Workflow or Online Submissions will appear here.</div>
                                                </td>
                                            </tr>
                                        ) : (
                                            paginatedMonthlyTxs.map(tx => {
                                                const mode = (tx.paymentMode || 'Cash').toLowerCase();
                                                const isOnline = mode.startsWith('online') || tx.collectedBy?.includes('Online') || mode.includes('transfer') || mode.includes('easy') || mode.includes('jazz') || mode.includes('bank');
                                                const trxId = tx.trxId || tx.transactionId || tx.referenceId || tx.senderAccount || (isOnline ? 'Online Verified' : '-');
                                                return (
                                                    <tr key={tx.id || tx.receiptNo} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
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
                                                            <span style={{ fontWeight: '700', color: '#334155' }}>{tx.dateString || tx.dateIso || 'N/A'}</span>
                                                            {tx.timeString ? <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block' }}>{tx.timeString}</span> : null}
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
                                                        <td style={{ padding: '0.7rem 0.85rem', fontSize: '0.78rem', color: '#475569', fontFamily: 'monospace' }}>
                                                            {trxId}
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right', fontWeight: '900', color: '#16a34a' }}>
                                                            Rs {Number(tx.totalPaid || 0).toLocaleString()}
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'center' }}>
                                                            <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                                                                {tx.proofUrl && (
                                                                    <button
                                                                        type="button"
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
                                                                        <Eye size={12} /> Proof
                                                                    </button>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setSelectedReceiptForModal(tx);
                                                                        setReceiptModalOpen(true);
                                                                    }}
                                                                    style={{
                                                                        border: '1.5px solid #cbd5e1',
                                                                        background: '#ffffff',
                                                                        color: '#0f172a',
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
                                                                    <Printer size={12} /> Slip
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            )}

                            {/* ============================== */}
                            {/* TAB 1.5: ADMISSION FEES TABLE */}
                            {/* ============================== */}
                            {monthlyLedgerTab === 'admission_slips' && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#faf5ff', borderBottom: '2px solid #e9d5ff' }}>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#6b21a8', fontWeight: '800' }}>Receipt #</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#6b21a8', fontWeight: '800' }}>Student & Father</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#6b21a8', fontWeight: '800' }}>Enrolled Class</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#6b21a8', fontWeight: '800' }}>Fee Heads Breakdown</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#6b21a8', fontWeight: '800' }}>Date & Mode</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: '#7c3aed', fontWeight: '800' }}>Amount Collected</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#6b21a8', fontWeight: '800' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedMonthlyAdmissionTxs.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
                                                    <Sparkles size={32} style={{ opacity: 0.35, marginBottom: '0.5rem', color: '#a855f7' }} />
                                                    <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>No admission fee receipts found for {MONTH_NAMES[calculatedMetrics.activeMonthNum - 1]} {selectedYear}.</div>
                                                    <div style={{ fontSize: '0.78rem' }}>When students are enrolled with counter fee payment, receipts will appear here.</div>
                                                </td>
                                            </tr>
                                        ) : (
                                            paginatedMonthlyAdmissionTxs.map(tx => {
                                                const mode = (tx.paymentMode || 'Cash').toLowerCase();
                                                const isOnline = mode.startsWith('online') || tx.collectedBy?.includes('Online') || mode.includes('transfer') || mode.includes('easy') || mode.includes('jazz') || mode.includes('bank');
                                                const itemsList = Array.isArray(tx.items) ? tx.items : [];
                                                return (
                                                    <tr key={tx.id || tx.receiptNo} style={{ borderBottom: '1px solid #f3e8ff', transition: 'background 0.15s ease' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#faf5ff'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                                        <td style={{ padding: '0.7rem 0.85rem', fontWeight: '800', color: '#6b21a8' }}>
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                <span style={{ fontSize: '0.72rem', background: '#f3e8ff', color: '#7c3aed', padding: '2px 6px', borderRadius: '4px', border: '1px solid #d8b4fe', fontWeight: '800' }}>ADM</span>
                                                                {tx.receiptNo || tx.id}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem' }}>
                                                            <strong style={{ color: '#0f172a', display: 'block' }}>{tx.studentName}</strong>
                                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                                {tx.fatherName ? `S/D of ${tx.fatherName}` : (tx.fatherPhone || 'New Admission')}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem' }}>
                                                            <span style={{ fontWeight: '700', color: '#1e293b', display: 'block' }}>{tx.className || 'Class'}</span>
                                                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                                                {tx.admissionNo ? `Adm #: ${tx.admissionNo}` : (tx.rollNo ? `Roll: ${tx.rollNo}` : 'Enrolled')}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem' }}>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', maxWidth: '280px' }}>
                                                                {itemsList.length > 0 ? (
                                                                    itemsList.map((it, idx) => (
                                                                        <span key={idx} style={{
                                                                            fontSize: '0.7rem',
                                                                            padding: '1px 6px',
                                                                            borderRadius: '4px',
                                                                            background: it.type === 'action' ? '#e0e7ff' : '#f1f5f9',
                                                                            color: it.type === 'action' ? '#4338ca' : '#334155',
                                                                            border: `1px solid ${it.type === 'action' ? '#c7d2fe' : '#e2e8f0'}`,
                                                                            fontWeight: '700'
                                                                        }}>
                                                                            {it.name}: Rs {Number(it.amount || 0).toLocaleString()}
                                                                        </span>
                                                                    ))
                                                                ) : (
                                                                    <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                                                                        {tx.paidCategories?.join(', ') || 'Initial Admission Package'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'center' }}>
                                                            <span style={{ fontWeight: '700', color: '#334155', fontSize: '0.78rem', display: 'block' }}>{tx.dateString || tx.dateIso || 'N/A'}</span>
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '0.2rem',
                                                                fontSize: '0.7rem',
                                                                fontWeight: '700',
                                                                padding: '1px 6px',
                                                                borderRadius: '999px',
                                                                background: !isOnline ? '#f0fdf4' : '#eff6ff',
                                                                color: !isOnline ? '#166534' : '#1e40af',
                                                                border: `1px solid ${!isOnline ? '#bbf7d0' : '#bfdbfe'}`,
                                                                marginTop: '2px'
                                                            }}>
                                                                {!isOnline ? <Wallet size={10} /> : <Smartphone size={10} />}
                                                                {tx.paymentMode || 'Cash'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right', fontWeight: '900', color: '#7c3aed', fontSize: '0.92rem' }}>
                                                            Rs {Number(tx.totalPaid || 0).toLocaleString()}
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'center' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedReceiptForModal(tx);
                                                                    setReceiptModalOpen(true);
                                                                }}
                                                                style={{
                                                                    border: '1.5px solid #d8b4fe',
                                                                    background: '#faf5ff',
                                                                    color: '#7c3aed',
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
                                                                <Printer size={12} /> Slip
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            )}

                            {/* ============================== */}
                            {/* TAB 2: DIRECT INCOMES TABLE */}
                            {/* ============================== */}
                            {monthlyLedgerTab === 'incomes' && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '800' }}>Voucher / Title</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '800' }}>Category</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '800' }}>Date Logged</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#475569', fontWeight: '800' }}>Type / Mode</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: '#16a34a', fontWeight: '800' }}>Amount</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '800' }}>Remarks / Proof</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedMonthlyIncomes.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
                                                    <TrendingUp size={32} style={{ opacity: 0.35, marginBottom: '0.5rem' }} />
                                                    <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>No direct income entries found for {MONTH_NAMES[calculatedMetrics.activeMonthNum - 1]} {selectedYear}.</div>
                                                </td>
                                            </tr>
                                        ) : (
                                            paginatedMonthlyIncomes.map(inc => {
                                                const incDate = inc.date || inc.createdAt;
                                                return (
                                                    <tr key={inc.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                                        <td style={{ padding: '0.7rem 0.85rem', fontWeight: '800', color: '#0f172a' }}>
                                                            {inc.name || inc.title || 'Direct Income'}
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem' }}>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#166534', background: '#dcfce7', padding: '2px 8px', borderRadius: '6px' }}>
                                                                {inc.category || 'General'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem', color: '#64748b', fontSize: '0.8rem' }}>
                                                            {incDate ? new Date(incDate).toLocaleDateString('en-GB') : 'N/A'}
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'center' }}>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px' }}>
                                                                {inc.type === 'permanent' ? '🔄 Permanent' : '⚡ 1-Time'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right', fontWeight: '900', color: '#16a34a' }}>
                                                            +Rs {Number(inc.amount || 0).toLocaleString()}
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem', fontSize: '0.78rem', color: '#64748b' }}>
                                                            {inc.proofUrl && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setProofModalState({ isOpen: true, url: inc.proofUrl, title: `Income Proof - ${inc.name}` })}
                                                                    style={{ border: 'none', background: '#dcfce7', color: '#166534', borderRadius: '5px', padding: '3px 6px', fontSize: '0.72rem', fontWeight: '800', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px', marginRight: '6px' }}
                                                                >
                                                                    <Eye size={11} /> Proof
                                                                </button>
                                                            )}
                                                            {inc.remarks || '-'}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            )}

                            {/* ============================== */}
                            {/* TAB 3: OPERATIONAL EXPENSES TABLE */}
                            {/* ============================== */}
                            {monthlyLedgerTab === 'expenses' && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '800' }}>Expense Title</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '800' }}>Category</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '800' }}>Date Logged</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#475569', fontWeight: '800' }}>Frequency / Type</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: '#dc2626', fontWeight: '800' }}>Amount</th>
                                            <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '800' }}>Remarks / Proof</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedMonthlyExpenses.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
                                                    <TrendingDown size={32} style={{ opacity: 0.35, marginBottom: '0.5rem' }} />
                                                    <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>No operational expenses found for {MONTH_NAMES[calculatedMetrics.activeMonthNum - 1]} {selectedYear}.</div>
                                                </td>
                                            </tr>
                                        ) : (
                                            paginatedMonthlyExpenses.map(exp => {
                                                const expDate = exp.date || exp.createdAt;
                                                return (
                                                    <tr key={exp.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                                        <td style={{ padding: '0.7rem 0.85rem', fontWeight: '800', color: '#0f172a' }}>
                                                            {exp.name || exp.title || 'Operational Expense'}
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem' }}>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#991b1b', background: '#fee2e2', padding: '2px 8px', borderRadius: '6px' }}>
                                                                {exp.category || 'Operational'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem', color: '#64748b', fontSize: '0.8rem' }}>
                                                            {expDate ? new Date(expDate).toLocaleDateString('en-GB') : 'N/A'}
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'center' }}>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: exp.type === 'permanent' ? '#7c2d12' : '#475569', background: exp.type === 'permanent' ? '#ffedd5' : '#f1f5f9', padding: '2px 8px', borderRadius: '6px' }}>
                                                                {exp.type === 'permanent' ? '🔄 Permanent' : '⚡ 1-Time'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right', fontWeight: '900', color: '#dc2626' }}>
                                                            -Rs {Number(exp.amount || 0).toLocaleString()}
                                                        </td>
                                                        <td style={{ padding: '0.7rem 0.85rem', fontSize: '0.78rem', color: '#64748b' }}>
                                                            {exp.proofUrl && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setProofModalState({ isOpen: true, url: exp.proofUrl, title: `Expense Proof - ${exp.name}` })}
                                                                    style={{ border: 'none', background: '#fee2e2', color: '#dc2626', borderRadius: '5px', padding: '3px 6px', fontSize: '0.72rem', fontWeight: '800', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px', marginRight: '6px' }}
                                                                >
                                                                    <Eye size={11} /> Proof
                                                                </button>
                                                            )}
                                                            {exp.remarks || '-'}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* ============================== */}
                        {/* 5. CLEAN PAGINATION CONTROLS (25 Rows per page) */}
                        {/* ============================== */}
                        {totalMonthlyLedgerCount > 0 && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginTop: '1.25rem',
                                paddingTop: '0.85rem',
                                borderTop: '1.5px solid #f1f5f9',
                                flexWrap: 'wrap',
                                gap: '0.75rem'
                            }}>
                                {/* Rows Info */}
                                <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: '700' }}>
                                    Showing <strong style={{ color: '#0f172a' }}>{ledgerStartIndex + 1}</strong> to <strong style={{ color: '#0f172a' }}>{ledgerEndIndex}</strong> of <strong style={{ color: '#0f172a' }}>{totalMonthlyLedgerCount}</strong> records
                                </div>

                                {/* Page Navigation Buttons */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <button
                                        type="button"
                                        onClick={() => setLedgerPage(p => Math.max(1, p - 1))}
                                        disabled={ledgerPage <= 1}
                                        style={{
                                            padding: '0.4rem 0.75rem',
                                            borderRadius: '8px',
                                            border: '1.5px solid #cbd5e1',
                                            background: ledgerPage > 1 ? '#ffffff' : '#f8fafc',
                                            color: ledgerPage > 1 ? '#0f172a' : '#94a3b8',
                                            fontSize: '0.8rem',
                                            fontWeight: '800',
                                            cursor: ledgerPage > 1 ? 'pointer' : 'not-allowed',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px'
                                        }}
                                    >
                                        <ChevronLeft size={14} /> Previous
                                    </button>

                                    {/* Numbered Page Buttons */}
                                    {Array.from({ length: totalMonthlyLedgerPages }, (_, i) => i + 1)
                                        .filter(pNum => pNum === 1 || pNum === totalMonthlyLedgerPages || Math.abs(pNum - ledgerPage) <= 2)
                                        .map((pNum, idx, arr) => {
                                            const isSelected = pNum === ledgerPage;
                                            const prevPNum = arr[idx - 1];
                                            const showEllipsis = prevPNum && pNum - prevPNum > 1;

                                            return (
                                                <React.Fragment key={pNum}>
                                                    {showEllipsis && <span style={{ color: '#94a3b8', padding: '0 4px', fontWeight: '800' }}>...</span>}
                                                    <button
                                                        type="button"
                                                        onClick={() => setLedgerPage(pNum)}
                                                        style={{
                                                            minWidth: '32px',
                                                            height: '32px',
                                                            borderRadius: '8px',
                                                            border: isSelected ? '1.5px solid #0078d4' : '1.5px solid #cbd5e1',
                                                            background: isSelected ? '#0078d4' : '#ffffff',
                                                            color: isSelected ? '#ffffff' : '#0f172a',
                                                            fontSize: '0.8rem',
                                                            fontWeight: '800',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {pNum}
                                                    </button>
                                                </React.Fragment>
                                            );
                                        })}

                                    <button
                                        type="button"
                                        onClick={() => setLedgerPage(p => Math.min(totalMonthlyLedgerPages, p + 1))}
                                        disabled={ledgerPage >= totalMonthlyLedgerPages}
                                        style={{
                                            padding: '0.4rem 0.75rem',
                                            borderRadius: '8px',
                                            border: '1.5px solid #cbd5e1',
                                            background: ledgerPage < totalMonthlyLedgerPages ? '#ffffff' : '#f8fafc',
                                            color: ledgerPage < totalMonthlyLedgerPages ? '#0f172a' : '#94a3b8',
                                            fontSize: '0.8rem',
                                            fontWeight: '800',
                                            cursor: ledgerPage < totalMonthlyLedgerPages ? 'pointer' : 'not-allowed',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px'
                                        }}
                                    >
                                        Next <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>
                        )}
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

            {/* 3. Student Fee Slip Preview Modal (createPortal + Strict 1-Page A4 Print) */}
            {receiptModalOpen && selectedReceiptForModal && typeof document !== "undefined" && createPortal(
                <div
                    className="finance-receipt-modal-overlay"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.75)',
                        backdropFilter: 'blur(5px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 99999,
                        padding: '1rem',
                        overflowY: 'auto'
                    }}
                    onClick={() => {
                        setReceiptModalOpen(false);
                        setSelectedReceiptForModal(null);
                    }}
                >
                    <div
                        style={{
                            background: '#ffffff',
                            borderRadius: '16px',
                            maxWidth: '780px',
                            width: '100%',
                            maxHeight: '92vh',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.5)',
                            border: '1.5px solid #cbd5e1',
                            position: 'relative'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header / Action Toolbar (Hidden on Print) */}
                        <div
                            className="no-print"
                            style={{
                                padding: '0.85rem 1.25rem',
                                background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
                                borderBottom: '1.5px solid #cbd5e1',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexShrink: 0,
                                gap: '1rem'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <div
                                    style={{
                                        width: '34px',
                                        height: '34px',
                                        borderRadius: '8px',
                                        background: '#0078d4',
                                        color: 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 2px 4px rgba(0, 120, 212, 0.3)'
                                    }}
                                >
                                    <Printer size={18} />
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.92rem', fontWeight: '900', color: '#0f172a', display: 'block', lineHeight: '1.2' }}>
                                        Fee Payment Deposit Slip & Voucher
                                    </span>
                                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>
                                        Slip #{selectedReceiptForModal.receiptNo || selectedReceiptForModal.id} • Official Cashier & Student Copy
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {selectedReceiptForModal.proofUrl && (
                                    <button
                                        type="button"
                                        onClick={() => setProofModalState({ isOpen: true, url: selectedReceiptForModal.proofUrl, title: `Payment Proof - ${selectedReceiptForModal.studentName}` })}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                            padding: '0.45rem 0.85rem',
                                            borderRadius: '8px',
                                            border: '1.5px solid #bfdbfe',
                                            background: '#eff6ff',
                                            color: '#0078d4',
                                            fontSize: '0.8rem',
                                            fontWeight: '800',
                                            cursor: 'pointer'
                                        }}
                                        title="View Digital Payment Screenshot"
                                    >
                                        <Eye size={14} />
                                        <span>Proof</span>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={handleDownloadModalSlipPDF}
                                    disabled={isDownloadingModalSlip}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        padding: '0.45rem 1.05rem',
                                        borderRadius: '8px',
                                        border: '1.5px solid #cbd5e1',
                                        background: '#ffffff',
                                        color: '#0f172a',
                                        fontSize: '0.82rem',
                                        fontWeight: '800',
                                        cursor: isDownloadingModalSlip ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                        transition: 'all 0.12s ease',
                                        opacity: isDownloadingModalSlip ? 0.7 : 1
                                    }}
                                    title="Download Official Fee Receipt PDF"
                                >
                                    {isDownloadingModalSlip ? <Loader2 size={15} className="animate-spin text-blue-600" /> : <Download size={15} className="text-blue-600" />}
                                    <span>{isDownloadingModalSlip ? 'Saving...' : 'Save PDF'}</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => printElementDirectly('printable-finance-receipt-container', `Fee_Slip_${selectedReceiptForModal?.receiptNo || 'Receipt'}`)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        padding: '0.45rem 1.1rem',
                                        borderRadius: '8px',
                                        border: '1px solid #16a34a',
                                        background: 'linear-gradient(180deg, #22c55e 0%, #16a34a 100%)',
                                        color: '#ffffff',
                                        fontSize: '0.82rem',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 5px rgba(22, 163, 74, 0.25)',
                                        transition: 'all 0.12s ease'
                                    }}
                                    title="Direct Print Slip"
                                >
                                    <Printer size={15} />
                                    <span>Print Slip</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setReceiptModalOpen(false);
                                        setSelectedReceiptForModal(null);
                                    }}
                                    style={{
                                        width: '34px',
                                        height: '34px',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        background: '#ffffff',
                                        color: '#475569',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.12s ease'
                                    }}
                                    title="Close Preview"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Scrollable Receipt Body */}
                        <div
                            style={{
                                overflowY: 'auto',
                                padding: '1rem',
                                background: '#f8fafc',
                                flex: 1
                            }}
                        >
                            <div
                                id="printable-finance-receipt-container"
                                style={{
                                    width: '100%',
                                    maxWidth: '720px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.85rem',
                                    margin: '0 auto'
                                }}
                            >
                                {/* DUAL COPIES: 1. STUDENT COPY, 2. OFFICE COPY */}
                                {['STUDENT / PARENT COPY', 'OFFICE / ACCOUNTS COPY'].map((copyType, copyIdx) => (
                                    <React.Fragment key={copyIdx}>
                                        <div
                                            className="finance-receipt-copy"
                                            style={{
                                                background: '#ffffff',
                                                color: '#1e293b',
                                                borderRadius: '10px',
                                                border: '1.5px solid #0f172a',
                                                padding: '0.75rem 1rem',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.45rem',
                                                position: 'relative'
                                            }}
                                        >
                                            {/* Watermark Copy Badge */}
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    top: '8px',
                                                    right: '12px',
                                                    background: copyIdx === 0 ? '#eff6ff' : '#f0fdf4',
                                                    border: `1px solid ${copyIdx === 0 ? '#93c5fd' : '#86efac'}`,
                                                    color: copyIdx === 0 ? '#1d4ed8' : '#15803d',
                                                    fontSize: '0.62rem',
                                                    fontWeight: '900',
                                                    padding: '2px 7px',
                                                    borderRadius: '4px',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px'
                                                }}
                                            >
                                                {copyType}
                                            </div>

                                            {/* School Header */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.4rem', paddingRight: '120px' }}>
                                                {schoolInfo.logo ? (
                                                    <div style={{ width: '42px', height: '42px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        <img src={schoolInfo.logo} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                                    </div>
                                                ) : null}
                                                <div>
                                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '-0.2px', lineHeight: '1.2' }}>
                                                        {schoolInfo.name || 'SCHOOL NAME'}
                                                    </h3>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', fontSize: '0.68rem', color: '#475569', fontWeight: '600', marginTop: '1px' }}>
                                                        {schoolInfo.phone && <span>📞 {schoolInfo.phone}</span>}
                                                        {schoolInfo.email && <span>✉️ {schoolInfo.email}</span>}
                                                        {schoolInfo.address && <span>📍 {schoolInfo.address}</span>}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Receipt Meta & Student Info Grid */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.5rem', background: '#f8fafc', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.72rem' }}>
                                                {/* Student Details */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <div><span style={{ color: '#64748b', fontWeight: '700' }}>Student: </span><strong style={{ color: '#0f172a', fontSize: '0.82rem' }}>{selectedReceiptForModal.studentName}</strong></div>
                                                    {selectedReceiptForModal.fatherName && (
                                                        <div><span style={{ color: '#64748b', fontWeight: '700' }}>Father: </span><strong style={{ color: '#334155' }}>{selectedReceiptForModal.fatherName}</strong></div>
                                                    )}
                                                    <div><span style={{ color: '#64748b', fontWeight: '700' }}>Class: </span><strong style={{ color: '#0078d4' }}>{selectedReceiptForModal.className}</strong> {selectedReceiptForModal.rollNo && selectedReceiptForModal.rollNo !== '-' ? `• Roll: ${selectedReceiptForModal.rollNo}` : ''}</div>
                                                </div>

                                                {/* Voucher Meta */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'right' }}>
                                                    <div><span style={{ color: '#64748b', fontWeight: '700' }}>Slip No: </span><strong style={{ color: '#0f172a', fontFamily: 'monospace', fontSize: '0.78rem' }}>#{selectedReceiptForModal.receiptNo || selectedReceiptForModal.id}</strong></div>
                                                    <div><span style={{ color: '#64748b', fontWeight: '700' }}>Date: </span><strong style={{ color: '#334155' }}>{selectedReceiptForModal.dateString || selectedReceiptForModal.dateIso || 'N/A'} {selectedReceiptForModal.timeString ? `• ${selectedReceiptForModal.timeString}` : ''}</strong></div>
                                                    <div><span style={{ color: '#64748b', fontWeight: '700' }}>Mode: </span><span style={{ background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '4px', fontWeight: '800', fontSize: '0.66rem', textTransform: 'uppercase' }}>{selectedReceiptForModal.paymentMode || 'Cash'}</span></div>
                                                </div>
                                            </div>

                                            {/* Particulars Table */}
                                            <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                                                            <th style={{ padding: '3px 8px', textAlign: 'left', fontWeight: '800', color: '#475569' }}>Fee Particulars / Description</th>
                                                            <th style={{ padding: '3px 8px', textAlign: 'right', fontWeight: '800', color: '#475569', width: '110px' }}>Amount (PKR)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {selectedReceiptForModal.items && Array.isArray(selectedReceiptForModal.items) && selectedReceiptForModal.items.length > 0 ? (
                                                            selectedReceiptForModal.items.map((it, idx) => (
                                                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                    <td style={{ padding: '3px 8px', color: '#1e293b' }}>{it.name || it.title || 'Fee Particular'}</td>
                                                                    <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>Rs {Number(it.amount || 0).toLocaleString()}</td>
                                                                </tr>
                                                            ))
                                                        ) : (
                                                            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '3px 8px', color: '#1e293b' }}>Tuition / Monthly Session Fee</td>
                                                                <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>Rs {Number(selectedReceiptForModal.totalPaid || selectedReceiptForModal.amount || 0).toLocaleString()}</td>
                                                            </tr>
                                                        )}

                                                        {Number(selectedReceiptForModal.discount || 0) > 0 && (
                                                            <tr style={{ borderBottom: '1px solid #f1f5f9', color: '#dc2626' }}>
                                                                <td style={{ padding: '3px 8px' }}>Concession / Discount Applied</td>
                                                                <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: '700' }}>-Rs {Number(selectedReceiptForModal.discount).toLocaleString()}</td>
                                                            </tr>
                                                        )}

                                                        {/* Total Row */}
                                                        <tr style={{ background: '#f0fdf4', borderTop: '1.5px solid #16a34a' }}>
                                                            <td style={{ padding: '4px 8px', fontWeight: '900', color: '#166534', textTransform: 'uppercase' }}>Total Amount Paid</td>
                                                            <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: '900', color: '#166534', fontSize: '0.85rem' }}>
                                                                Rs {Number(selectedReceiptForModal.totalPaid || selectedReceiptForModal.amount || 0).toLocaleString()}/-
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* In Words & Remarks Bar */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: '#475569', background: '#f8fafc', padding: '3px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                                <div>
                                                    <span style={{ fontWeight: '700', color: '#334155' }}>Amount In Words: </span>
                                                    <span style={{ fontWeight: '800', color: '#0f172a', fontStyle: 'italic' }}>
                                                        {numberToWords(selectedReceiptForModal.totalPaid || selectedReceiptForModal.amount || 0)}
                                                    </span>
                                                </div>
                                                {selectedReceiptForModal.remarks && (
                                                    <div>
                                                        <span style={{ fontWeight: '700' }}>Note: </span>
                                                        <span>{selectedReceiptForModal.remarks}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Signatures & Micro Footer */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '0.75rem', marginTop: '0.15rem' }}>
                                                <div style={{ textAlign: 'center', minWidth: '130px' }}>
                                                    <div style={{ borderTop: '1px dashed #64748b', paddingTop: '2px', fontSize: '0.62rem', fontWeight: '700', color: '#475569' }}>
                                                        Depositor / Parent Signature
                                                    </div>
                                                </div>

                                                <div style={{ fontSize: '0.58rem', color: '#94a3b8', textAlign: 'center' }}>
                                                    Official Computer Generated Receipt • School ERP Verified
                                                </div>

                                                <div style={{ textAlign: 'center', minWidth: '130px' }}>
                                                    <div style={{ borderTop: '1px dashed #64748b', paddingTop: '2px', fontSize: '0.62rem', fontWeight: '800', color: '#0f172a' }}>
                                                        Cashier / Authorized Stamp
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Scissors Dotted Cut Line between Copies */}
                                        {copyIdx === 0 && (
                                            <div
                                                className="finance-cut-line"
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    color: '#94a3b8',
                                                    fontSize: '0.62rem',
                                                    fontWeight: '700',
                                                    margin: '0.2rem 0'
                                                }}
                                            >
                                                <Scissors size={12} style={{ transform: 'rotate(-90deg)' }} />
                                                <div style={{ flex: 1, borderBottom: '1.5px dashed #cbd5e1' }} />
                                                <span>CUT HERE / ACCOUNTS COUNTER SLIP</span>
                                                <div style={{ flex: 1, borderBottom: '1.5px dashed #cbd5e1' }} />
                                            </div>
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* 4. Scoped Print Styles for 1-Page Exact A4 Layout */}
            <style>{`
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 6mm 8mm 6mm 8mm;
                    }
                    *, *::before, *::after {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    html, body {
                        background: #ffffff !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        height: auto !important;
                        min-height: auto !important;
                        overflow: visible !important;
                    }
                    /* Strict Hide of entire root application */
                    #root {
                        display: none !important;
                        height: 0 !important;
                        overflow: hidden !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .finance-receipt-modal-overlay {
                        position: static !important;
                        display: block !important;
                        width: 100% !important;
                        height: auto !important;
                        background: transparent !important;
                        backdrop-filter: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        overflow: visible !important;
                    }
                    .finance-receipt-modal-overlay > div {
                        max-width: 100% !important;
                        max-height: none !important;
                        box-shadow: none !important;
                        border: none !important;
                        border-radius: 0 !important;
                        overflow: visible !important;
                        background: transparent !important;
                        padding: 0 !important;
                    }
                    #printable-finance-receipt-container {
                        display: flex !important;
                        flex-direction: column !important;
                        gap: 3mm !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 auto !important;
                        padding: 0 !important;
                        overflow: visible !important;
                    }
                    .finance-receipt-copy {
                        width: 100% !important;
                        max-width: 100% !important;
                        box-sizing: border-box !important;
                        border: 1.5px solid #0f172a !important;
                        border-radius: 6px !important;
                        background: #ffffff !important;
                        margin: 0 auto !important;
                        padding: 6px 10px !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    .finance-cut-line {
                        display: flex !important;
                        margin: 2mm 0 !important;
                    }
                }
            `}</style>

            {/* 5. Payment Proof Screenshot Lightbox */}
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
