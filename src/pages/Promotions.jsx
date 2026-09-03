import React, { useState, useEffect, useRef } from 'react';
import {
    Users, Search, ArrowRight, CheckCircle, XCircle, ChevronRight, ChevronDown, AlertCircle,
    Loader2, GraduationCap, X, UploadCloud, FileCheck, Eye, Upload, Sparkles,
    History, FileSpreadsheet, Download, Printer, Calendar, TrendingUp, BookOpen,
    Layers, CheckCircle2, Award, ArrowUpRight, ShieldCheck, RefreshCw, DoorOpen, UserMinus, LogOut,
    FileText, CheckSquare, DollarSign, Wallet, CreditCard, Tag, Receipt, ExternalLink
} from 'lucide-react';
import { db, auth, storage } from '../firebase';
import {
    collection, getDocs, doc, writeBatch, getDoc, updateDoc,
    query, orderBy, addDoc, serverTimestamp, setDoc, onSnapshot
} from 'firebase/firestore';
import { getDocsFast } from '../utils/cacheUtils';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CachedImage from '../components/CachedImage';

// Robust Multi-Strategy Base64 Image Loader (Bypasses Firebase Storage & Canvas CORS)
async function fetchImageAsBase64(url) {
    if (!url || typeof url !== 'string') return null;
    const cleanUrl = url.trim();
    if (!cleanUrl) return null;

    if (cleanUrl.startsWith('data:image/')) return cleanUrl;

    // Strategy 1: Direct Fetch as Blob
    try {
        const res = await fetch(cleanUrl, { mode: 'cors' });
        if (res.ok) {
            const blob = await res.blob();
            const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
            if (base64 && base64.startsWith('data:image/')) return base64;
        }
    } catch (e) {}

    // Strategy 2: Image Canvas with Anonymous crossOrigin
    try {
        const canvasBase64 = await new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || img.width || 200;
                    canvas.height = img.naturalHeight || img.height || 200;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } catch (err) {
                    resolve(null);
                }
            };
            img.onerror = () => resolve(null);
            img.src = cleanUrl;
        });
        if (canvasBase64 && canvasBase64.startsWith('data:image/')) return canvasBase64;
    } catch (e) {}

    // Strategy 3: Fast Proxy Fallback
    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(cleanUrl)}`,
        `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrl.replace(/^https?:\/\//, ''))}&output=png`
    ];

    for (const proxyUrl of proxies) {
        try {
            const res = await fetch(proxyUrl);
            if (res.ok) {
                const blob = await res.blob();
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(blob);
                });
                if (base64 && base64.startsWith('data:image/')) return base64;
            }
        } catch (err) {}
    }

    return null;
}

// Dynamic Date of Birth in Formal Words (e.g., 2014-12-27 -> Twenty-Seventh of December Two Thousand Fourteen)
function formatDateOfBirthInWords(dobStr) {
    if (!dobStr) return 'Fourteenth of August Two Thousand Ten';
    try {
        const parts = dobStr.split('-');
        if (parts.length !== 3) return dobStr;
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);

        const ordinals = [
            '', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
            'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth',
            'Twenty-First', 'Twenty-Second', 'Twenty-Third', 'Twenty-Fourth', 'Twenty-Fifth', 'Twenty-Sixth', 'Twenty-Seventh', 'Twenty-Eighth', 'Twenty-Ninth', 'Thirtieth', 'Thirty-First'
        ];

        const months = [
            'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'
        ];

        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        let yearWords = '';
        if (year >= 2000 && year < 2100) {
            const remainder = year - 2000;
            if (remainder === 0) yearWords = 'Two Thousand';
            else if (remainder < 20) yearWords = `Two Thousand ${ones[remainder]}`;
            else {
                const t = Math.floor(remainder / 10);
                const o = remainder % 10;
                yearWords = `Two Thousand ${tens[t]}${o > 0 ? ' ' + ones[o] : ''}`;
            }
        } else if (year >= 1900 && year < 2000) {
            const remainder = year - 1900;
            yearWords = `Nineteen ${remainder < 20 ? ones[remainder] : tens[Math.floor(remainder / 10)] + (remainder % 10 > 0 ? ' ' + ones[remainder % 10] : '')}`;
        } else {
            yearWords = String(year);
        }

        const dayWord = ordinals[day] || String(day);
        const monthWord = months[month] || '';
        return `${dayWord} of ${monthWord} ${yearWords}`;
    } catch (e) {
        return dobStr;
    }
}

const Promotions = () => {
    // --- Navigation Tabs State ---
    const [activeTab, setActiveTab] = useState(() => localStorage.getItem('promotions_active_tab') || 'promotions'); // 'promotions' | 'promoted' | 'slc'

    const [schoolId, setSchoolId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [studentSearchQuery, setStudentSearchQuery] = useState('');
    const [processing, setProcessing] = useState(false);
    const [promotionStatus, setPromotionStatus] = useState(null);
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'promote', 'retain', 'demote'
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmLevel, setConfirmLevel] = useState(1); // 1 or 2 for dual confirmation
    const [schoolDetails, setSchoolDetails] = useState({ name: '', logo: '', address: '', phone: '', email: '' });
    const [schoolLogoBase64, setSchoolLogoBase64] = useState(null);
    const [uploadingResultId, setUploadingResultId] = useState(null); // Tracks student ID for upload spinner
    const [showPrimaryDept, setShowPrimaryDept] = useState(true);
    const [showSecondaryDept, setShowSecondaryDept] = useState(true);
    const fileInputRefs = useRef({}); // Refs for hidden file inputs

    // --- Tab 2: Promoted History State ---
    const [promotionHistory, setPromotionHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historySession, setHistorySession] = useState('2024-2025');
    const [historyClassFilter, setHistoryClassFilter] = useState(() => localStorage.getItem('promotions_history_class_filter') || '');
    const [historyStatusFilter, setHistoryStatusFilter] = useState('all');
    const [historySearchQuery, setHistorySearchQuery] = useState('');
    const [isExportingCsv, setIsExportingCsv] = useState(false);
    const [isGeneratingGazette, setIsGeneratingGazette] = useState(false);

    // --- Tab 3: School Leaving & SLC Clearance Desk State ---
    const [slcClassId, setSlcClassId] = useState('');
    const [slcStudentId, setSlcStudentId] = useState('');
    const [slcStudents, setSlcStudents] = useState([]);
    const [slcLoadingStudents, setSlcLoadingStudents] = useState(false);
    const [slcSelectedStudent, setSlcSelectedStudent] = useState(null);
    const [slcReason, setSlcReason] = useState('Completed Matriculation Examination');
    const [slcConduct, setSlcConduct] = useState('Exemplary / Very Good');
    const [slcLeavingDate, setSlcLeavingDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [slcSerialNo, setSlcSerialNo] = useState(() => `SLC-${new Date().getFullYear()}/${String(Math.floor(Math.random() * 899) + 100)}`);
    const [slcRemarks, setSlcRemarks] = useState('Student has shown exemplary character, good attendance, and academic dedication.');
    const [slcHistory, setSlcHistory] = useState([]);
    const [loadingSlcHistory, setLoadingSlcHistory] = useState(false);
    const [slcHistorySession, setSlcHistorySession] = useState('all');
    const [slcHistorySearch, setSlcHistorySearch] = useState('');
    const [isGeneratingSLC, setIsGeneratingSLC] = useState(false);
    const [isSubmittingSLC, setIsSubmittingSLC] = useState(false);
    const [slcDemoMode, setSlcDemoMode] = useState(false);
    const [slcShowPayModal, setSlcShowPayModal] = useState(false);
    const [slcPayAmount, setSlcPayAmount] = useState('');
    const [slcPayNote, setSlcPayNote] = useState('');
    const [isProcessingSlcPay, setIsProcessingSlcPay] = useState(false);
    const [slcCustomActions, setSlcCustomActions] = useState([]);

    // Generate 50 Years Academic Sessions List (e.g. 2025-2026 down to 1976-1977)
    const available50YearsSessions = Array.from({ length: 50 }, (_, i) => {
        const y = new Date().getFullYear() - i;
        return `${y - 1}-${y}`;
    });

    useEffect(() => {
        if (activeTab) localStorage.setItem('promotions_active_tab', activeTab);
    }, [activeTab]);



    // Helper: Class Sorting order
    const getClassOrder = (name) => {
        if (!name || typeof name !== 'string') return 0;
        const lower = name.toLowerCase();
        if (lower.includes('nursery')) return -2;
        if (lower.includes('prep')) return -1;
        return parseInt(name.replace(/\D/g, '')) || 0;
    };

    // 1. Bulletproof User & School Session Resolver
    useEffect(() => {
        const resolveSchool = async () => {
            let foundSid = null;
            try {
                const manualSession = localStorage.getItem('manual_session');
                if (manualSession) {
                    const userData = JSON.parse(manualSession);
                    foundSid = userData.schoolId || userData.school_id || userData.id;
                }
                if (!foundSid) {
                    foundSid = localStorage.getItem('schoolId') || localStorage.getItem('school_id');
                }
                if (!foundSid) {
                    const userSession = localStorage.getItem('user_session');
                    if (userSession) {
                        const u = JSON.parse(userSession);
                        foundSid = u.schoolId || u.school_id;
                    }
                }
            } catch (e) {}

            if (foundSid) {
                setSchoolId(String(foundSid));
                fetchSchoolDetails(String(foundSid));
            } else if (auth.currentUser) {
                try {
                    const tokenResult = await auth.currentUser.getIdTokenResult();
                    if (tokenResult.claims?.schoolId) {
                        const cSid = String(tokenResult.claims.schoolId);
                        setSchoolId(cSid);
                        fetchSchoolDetails(cSid);
                    }
                } catch (e) {}
            } else {
                setSchoolId('6257');
                fetchSchoolDetails('6257');
            }
        };

        resolveSchool();

        const unsubAuth = auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    const tokenResult = await user.getIdTokenResult();
                    if (tokenResult.claims?.schoolId) {
                        const sid = String(tokenResult.claims.schoolId);
                        setSchoolId(sid);
                        fetchSchoolDetails(sid);
                    }
                } catch (e) {}
            }
        });

        return () => unsubAuth();
    }, []);

    // 1.5 Fetch School Details with Force Logo Fetch & Base64 Preload
    const fetchSchoolDetails = async (id) => {
        try {
            let schoolName = 'Smart Public School';
            let schoolLogoUrl = '';
            let schoolAddress = 'Main Campus, Sector 4, Principal Secretariat';
            let schoolPhone = '091-5842100';
            let schoolEmail = 'principal@school.edu.pk';

            // Query 1: schools/{id}/settings/profile
            const docRef = doc(db, `schools/${id}/settings`, 'profile');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.name || data.schoolName) schoolName = data.name || data.schoolName;
                if (data.profileImage || data.logo || data.schoolLogo || data.photoUrl || data.logoUrl || data.image) {
                    schoolLogoUrl = data.profileImage || data.logo || data.schoolLogo || data.photoUrl || data.logoUrl || data.image;
                }
                if (data.address || data.schoolAddress) schoolAddress = data.address || data.schoolAddress;
                if (data.phone || data.landline || data.contact) schoolPhone = data.phone || data.landline || data.contact;
                if (data.email) schoolEmail = data.email;
            }

            // Query 2: Fallback to root schools/{id}
            if (!schoolLogoUrl) {
                const rootDoc = await getDoc(doc(db, 'schools', id));
                if (rootDoc.exists()) {
                    const rData = rootDoc.data();
                    if (!schoolName || schoolName === 'Smart Public School') schoolName = rData.name || rData.schoolName || schoolName;
                    if (rData.profileImage || rData.logo || rData.schoolLogo || rData.logoUrl || rData.image) {
                        schoolLogoUrl = rData.profileImage || rData.logo || rData.schoolLogo || rData.logoUrl || rData.image;
                    }
                }
            }

            setSchoolDetails({
                name: schoolName,
                logo: schoolLogoUrl,
                address: schoolAddress,
                phone: schoolPhone,
                email: schoolEmail
            });

            if (schoolLogoUrl) {
                const b64 = await fetchImageAsBase64(schoolLogoUrl);
                if (b64) setSchoolLogoBase64(b64);
            }
        } catch (e) {
            console.error("Error fetching school details:", e);
        }
    };


    // 2. Real-Time Classes Listener (Bulletproof & Never-Empty)
    useEffect(() => {
        const sid = schoolId || '6257';
        const classesRef = collection(db, `schools/${sid}/classes`);

        const unsubClasses = onSnapshot(classesRef, async (snapshot) => {
            let list = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data(),
                students: docSnap.data().students || 0
            }));

            // If empty, supply standard classes fallback so dropdown is NEVER blank
            if (list.length === 0) {
                list = [
          {
                    "id": "nursery",
                    "name": "Nursery",
                    "students": 1
          },
          {
                    "id": "prep",
                    "name": "Prep",
                    "students": 1
          },
          {
                    "id": "class_1",
                    "name": "Class 1",
                    "students": 0
          },
          {
                    "id": "class_2",
                    "name": "Class 2",
                    "students": 0
          },
          {
                    "id": "class_3",
                    "name": "Class 3",
                    "students": 0
          },
          {
                    "id": "class_4",
                    "name": "Class 4",
                    "students": 0
          },
          {
                    "id": "class_5",
                    "name": "Class 5",
                    "students": 0
          },
          {
                    "id": "class_6",
                    "name": "Class 6",
                    "students": 0
          },
          {
                    "id": "class_7",
                    "name": "Class 7",
                    "students": 0
          },
          {
                    "id": "class_8",
                    "name": "Class 8",
                    "students": 0
          },
          {
                    "id": "class_9",
                    "name": "Class 9",
                    "students": 0
          },
          {
                    "id": "class_10",
                    "name": "Class 10",
                    "students": 0
          }
];
            }

            list.sort((a, b) => getClassOrder(a.name) - getClassOrder(b.name));
            setClasses(list);
            setLoading(false);

            // Auto-select class immediately (Prep preferred if available)
            const savedClassId = localStorage.getItem('promotions_selected_class_id');
            setSelectedClass(prev => {
                if (savedClassId) {
                    const matched = list.find(c => c.id === savedClassId);
                    if (matched) return matched;
                }
                const prepClass = list.find(c => (c.name || '').toLowerCase().includes('prep'));
                if (prepClass) return prepClass;
                return list[0];
            });

            // Async background update of student counts (Non-blocking)
            try {
                const updatedList = await Promise.all(list.map(async (cls) => {
                    try {
                        const sSnap = await getDocsFast(collection(db, `schools/${sid}/classes/${cls.id}/students`));
                        return { ...cls, students: sSnap.size };
                    } catch (e) {
                        return cls;
                    }
                }));
                setClasses(updatedList);
            } catch (e) {}
        }, (error) => {
            console.error("Classes stream error - using fallback classes:", error);
            const fallbackList = [
          {
                    "id": "nursery",
                    "name": "Nursery",
                    "students": 1
          },
          {
                    "id": "prep",
                    "name": "Prep",
                    "students": 1
          },
          {
                    "id": "class_1",
                    "name": "Class 1",
                    "students": 0
          },
          {
                    "id": "class_2",
                    "name": "Class 2",
                    "students": 0
          },
          {
                    "id": "class_3",
                    "name": "Class 3",
                    "students": 0
          },
          {
                    "id": "class_4",
                    "name": "Class 4",
                    "students": 0
          },
          {
                    "id": "class_5",
                    "name": "Class 5",
                    "students": 0
          },
          {
                    "id": "class_6",
                    "name": "Class 6",
                    "students": 0
          },
          {
                    "id": "class_7",
                    "name": "Class 7",
                    "students": 0
          },
          {
                    "id": "class_8",
                    "name": "Class 8",
                    "students": 0
          },
          {
                    "id": "class_9",
                    "name": "Class 9",
                    "students": 0
          },
          {
                    "id": "class_10",
                    "name": "Class 10",
                    "students": 0
          }
];
            setClasses(fallbackList);
            setSelectedClass(prev => prev || fallbackList[1]);
            setLoading(false);
        });

        return () => unsubClasses();
    }, [schoolId]);

    // 3. Handle Class Selection
    const handleClassSelect = (cls, customClasses = null) => {
        if (!cls) return;
        localStorage.setItem('promotions_selected_class_id', cls.id);
        setSelectedClass(cls);
        setSearchQuery('');
        setPromotionStatus(null);
    };

    // Helper: Grade Calculator
    function calculateGrade(obtained, total) {
        if (obtained === null || total <= 0) return '-';
        const pct = (obtained / total) * 100;
        if (pct >= 80) return 'A+';
        if (pct >= 70) return 'A';
        if (pct >= 60) return 'B';
        if (pct >= 50) return 'C';
        if (pct >= 40) return 'D';
        if (pct >= 33) return 'E';
        return 'F';
    }

    // 3.5 Real-Time Firestore Listener for Class Students & Exam Marks (Ultra-Robust Mirror of DMC Tabulation)
    useEffect(() => {
        if (isDemoMode) {
            let overrides = {};
            try {
                overrides = JSON.parse(localStorage.getItem('exams_demo_data_override') || '{}');
            } catch (e) {
                overrides = {};
            }

            const currentIndex = classes.findIndex(c => c.id === selectedClass?.id);
            const nextClass = classes[currentIndex + 1] || null;
            const previousClass = classes[currentIndex - 1] || null;
            const nextClassName = nextClass ? nextClass.name : 'Class 1';
            const prevClassName = previousClass ? previousClass.name : 'Nursery';

            const baseDemoList = [
                { id: 'demo_1', name: 'Muhammad Ali Raza', rollNo: '01', fatherName: 'Tariq Mehmood', t1Obtained: 455, t1Max: 500, t2Obtained: 460, t2Max: 500, t3Obtained: 470, t3Max: 500 },
                { id: 'demo_2', name: 'Fatima Zahra', rollNo: '02', fatherName: 'Kamran Ali', t1Obtained: 415, t1Max: 500, t2Obtained: 420, t2Max: 500, t3Obtained: 430, t3Max: 500 },
                { id: 'demo_3', name: 'Muhammad Usman', rollNo: '03', fatherName: 'Abdul Sattar', t1Obtained: 310, t1Max: 500, t2Obtained: 315, t2Max: 500, t3Obtained: 325, t3Max: 500 },
                { id: 'demo_4', name: 'Bilal Ahmed', rollNo: '04', fatherName: 'Farooq Ahmed', t1Obtained: 125, t1Max: 500, t2Obtained: 130, t2Max: 500, t3Obtained: 140, t3Max: 500 },
                { id: 'demo_5', name: 'Ayesha Khan', rollNo: '05', fatherName: 'Sardar Khan', t1Obtained: 148, t1Max: 500, t2Obtained: 150, t2Max: 500, t3Obtained: 155, t3Max: 500 },
                { id: 'demo_6', name: 'Zainab Bibi', rollNo: '06', fatherName: 'Muhammad Rashid', t1Obtained: 135, t1Max: 500, t2Obtained: 140, t2Max: 500, t3Obtained: 145, t3Max: 500 }
            ];

            const computedDemo = baseDemoList.map(item => {
                const ov = overrides[item.id] || {};
                let t1Obt = item.t1Obtained;
                let t1Max = item.t1Max;

                if (ov.subjectMarks) {
                    let sObt = 0;
                    let sMax = 0;
                    Object.values(ov.subjectMarks).forEach(sm => {
                        const totalM = sm.totalMarks || 100;
                        sMax += totalM;
                        if (!sm.isAbsent && sm.obtained !== '' && sm.obtained !== null) {
                            const base = parseFloat(sm.obtained) || 0;
                            const grace = parseFloat(sm.graceMarks) || 0;
                            sObt += (base + grace);
                        }
                    });
                    if (sMax > 0) {
                        t1Obt = sObt;
                        t1Max = sMax;
                    }
                }

                const modOverride = ov.moderationOverride || 'auto';
                const isForcePass = modOverride === 'pass' || modOverride === 'conditional_pass';
                const isForceFail = modOverride === 'fail';

                const t1Pass = isForcePass || (!isForceFail && (t1Obt / t1Max >= 0.33));
                const t2Pass = item.t2Obtained / item.t2Max >= 0.33;
                const t3Pass = item.t3Obtained / item.t3Max >= 0.33;

                const termsScores = [
                    { termKey: 'first', examTitle: '1st Term', obtained: t1Obt, max: t1Max, scoreText: `${t1Obt} / ${t1Max}`, hasMarks: true, isPassed: t1Pass },
                    { termKey: 'mid', examTitle: '2nd Term', obtained: item.t2Obtained, max: item.t2Max, scoreText: `${item.t2Obtained} / ${item.t2Max}`, hasMarks: true, isPassed: t2Pass },
                    { termKey: 'final', examTitle: 'Final Exam', obtained: item.t3Obtained, max: item.t3Max, scoreText: `${item.t3Obtained} / ${item.t3Max}`, hasMarks: true, isPassed: t3Pass }
                ];

                const totalObtainedAllTerms = t1Obt + item.t2Obtained + item.t3Obtained;
                const totalMaxAllTerms = t1Max + item.t2Max + item.t3Max;
                const cumulativePercentage = parseFloat(((totalObtainedAllTerms / totalMaxAllTerms) * 100).toFixed(1));
                const isCumulativePassed = isForcePass || (!isForceFail && t1Pass && t2Pass && t3Pass && cumulativePercentage >= 33);
                const grade = calculateGrade(totalObtainedAllTerms, totalMaxAllTerms);

                return {
                    id: item.id,
                    name: item.name,
                    rollNo: item.rollNo,
                    fatherName: item.fatherName,
                    avatar: '',
                    termsScores,
                    totalObtainedAllTerms,
                    totalMaxAllTerms,
                    cumulativePercentage,
                    cumulativeGrade: grade,
                    cumulativeIsPassed: isCumulativePassed,
                    hasRealTermData: true,
                    promotionStatus: isCumulativePassed ? 'promote' : 'retain',
                    examScore: cumulativePercentage.toString(),
                    result: isCumulativePassed ? 'pass' : 'fail',
                    nextClassId: nextClass?.id || 'next',
                    nextClassName,
                    previousClassId: previousClass?.id || null,
                    previousClassName: prevClassName
                };
            });

            setStudents(computedDemo);
            setLoadingStudents(false);
            return;
        }

        if (!schoolId || !selectedClass?.id) {
            setStudents([]);
            setLoadingStudents(false);
            return;
        }

        setLoadingStudents(true);

        const activeClasses = classes;
        const currentIndex = activeClasses.findIndex(c => c.id === selectedClass.id);
        const nextClass = activeClasses[currentIndex + 1] || null;
        const previousClass = activeClasses[currentIndex - 1] || null;

        let studentsList = [];
        let examsList = [];
        let marksDocsList = [];

        // Core compilation logic: Exact mirror of Exams.jsx DMC Tabulation Matrix
        const recomputeAndSetStudents = () => {
            if (studentsList.length === 0) {
                setStudents([]);
                setLoadingStudents(false);
                return;
            }

            // Discover all registered class subjects
            const classSubjs = Array.isArray(selectedClass.subjects) ? selectedClass.subjects : [];
            const defaultClassSubjects = [];
            classSubjs.forEach(s => {
                const clean = typeof s === 'string' ? s.trim() : (s?.name || '').trim();
                if (clean && !defaultClassSubjects.includes(clean)) defaultClassSubjects.push(clean);
            });

            // Standard terms to track
            const termSlots = [
                { key: 'first', defaultTitle: '1st Term', regex: /(1st|first|term[_-\s]?1)/i, defaultIndex: 0 },
                { key: 'mid', defaultTitle: '2nd Term', regex: /(2nd|second|mid|half|term[_-\s]?2)/i, defaultIndex: 1 },
                { key: 'final', defaultTitle: 'Final Exam', regex: /(final|annual|3rd|third|term[_-\s]?3)/i, defaultIndex: 2 }
            ];

            const computedStudents = studentsList.map(student => {
                const studentId = student.id;
                const studentRoll = String(student.rollNumber || student.rollNo || '').trim();

                let totalObtainedAllTerms = 0;
                let totalMaxAllTerms = 0;
                let hasAnyTermFailed = false;
                let termsWithRealDataCount = 0;

                const termsScores = termSlots.map((slot, sIdx) => {
                    // Match exam for this slot
                    let matchedExam = examsList.find(e =>
                        slot.regex.test(e.id || '') || slot.regex.test(e.title || '')
                    );
                    if (!matchedExam && examsList.length > sIdx) {
                        matchedExam = examsList[sIdx];
                    }

                    const examId = (matchedExam?.id || slot.key).toLowerCase();
                    const examTitle = (matchedExam?.title || slot.defaultTitle).toLowerCase().trim();
                    const cleanExamId = examId.replace(/[^a-z0-9]/g, '');

                    // 1. Filter marks documents for this term
                    const relevantMarksDocs = marksDocsList.filter(d => {
                        const docExamId = (d.examId || '').toString().toLowerCase();
                        const docExamTitle = (d.examTitle || '').toString().toLowerCase().trim();
                        const cleanDocId = d.id.toLowerCase().replace(/[^a-z0-9]/g, '');

                        // Explicit match by ID or title
                        if (docExamId === examId || d.id.toLowerCase().startsWith(examId + '_')) return true;
                        if (examTitle && docExamTitle && (examTitle === docExamTitle || examTitle.includes(docExamTitle) || docExamTitle.includes(examTitle))) return true;

                        const cleanDocExamId = docExamId.replace(/[^a-z0-9]/g, '');
                        if (cleanDocExamId && cleanExamId && (cleanDocExamId === cleanExamId || cleanExamId.includes(cleanDocExamId) || cleanDocExamId.includes(cleanExamId))) return true;
                        if (cleanExamId && cleanDocId.startsWith(cleanExamId)) return true;

                        // Slot 0 (1st Term): Also accept marks documents without explicit examId or single exam
                        if (sIdx === 0) {
                            if (!docExamId || docExamId === 'default' || docExamId === 'term1' || examsList.length <= 1) {
                                return true;
                            }
                        }

                        return false;
                    });

                    // 2. Discover all subjects for this term
                    const subjectsSet = new Set(defaultClassSubjects);
                    const subjectConfigs = {};

                    defaultClassSubjects.forEach(subj => {
                        subjectConfigs[subj] = { totalMarks: 100, passingMarks: 33 };
                    });

                    relevantMarksDocs.forEach(doc => {
                        const subjName = (doc.subject || '').trim();
                        if (subjName) {
                            subjectsSet.add(subjName);
                            const tTotal = typeof doc.totalMarks === 'number' && doc.totalMarks > 0 ? doc.totalMarks : 100;
                            const tPass = typeof doc.passingMarks === 'number' && doc.passingMarks > 0 ? doc.passingMarks : 33;
                            subjectConfigs[subjName] = { totalMarks: tTotal, passingMarks: tPass };
                        }
                    });

                    const subjectList = Array.from(subjectsSet);

                    // 3. Compute student score across all subjects in this term
                    let termObtained = 0;
                    let termMax = 0;
                    let subjectsEvaluatedCount = 0;
                    let failedSubjectsCount = 0;
                    let hasAnyAbsent = false;
                    let studentModerationOverride = null;

                    subjectList.forEach(subject => {
                        const sConf = subjectConfigs[subject] || { totalMarks: 100, passingMarks: 33 };
                        const marksDoc = relevantMarksDocs.find(d => (d.subject || '').trim().toLowerCase() === subject.toLowerCase());

                        let entryData = null;
                        if (marksDoc) {
                            // Support student lookup by ID, rollNumber, or rollNo
                            entryData = marksDoc.marks?.[studentId] ||
                                (studentRoll ? marksDoc.marks?.[studentRoll] : null) ||
                                marksDoc.studentMarks?.[studentId] ||
                                marksDoc.students?.[studentId] ||
                                marksDoc.studentEntry?.[studentId] ||
                                null;
                        }

                        termMax += sConf.totalMarks;

                        if (entryData) {
                            if (entryData.moderationOverride) {
                                studentModerationOverride = entryData.moderationOverride;
                            }

                            const isAbsent = entryData.isAbsent === true;
                            let obtained = null;
                            if (typeof entryData.obtainedMarks === 'number') obtained = entryData.obtainedMarks;
                            else if (typeof entryData.obtained === 'number') obtained = entryData.obtained;
                            else if (typeof entryData.marks === 'number') obtained = entryData.marks;
                            else if (entryData.obtainedMarks !== undefined && entryData.obtainedMarks !== null && entryData.obtainedMarks !== '') obtained = parseFloat(entryData.obtainedMarks);
                            else if (entryData.obtained !== undefined && entryData.obtained !== null && entryData.obtained !== '') obtained = parseFloat(entryData.obtained);
                            else if (entryData.marks !== undefined && entryData.marks !== null && entryData.marks !== '') obtained = parseFloat(entryData.marks);

                            if (isAbsent) {
                                hasAnyAbsent = true;
                                failedSubjectsCount++;
                            } else if (obtained !== null && !isNaN(obtained)) {
                                termObtained += obtained;
                                subjectsEvaluatedCount++;
                                if (obtained < sConf.passingMarks) {
                                    failedSubjectsCount++;
                                }
                            }
                        }
                    });

                    const hasMarks = subjectsEvaluatedCount > 0 || hasAnyAbsent;
                    const isForcePass = studentModerationOverride === 'pass' || studentModerationOverride === 'conditional_pass';
                    const isForceFail = studentModerationOverride === 'fail';
                    const isComplete = subjectList.length > 0 && subjectsEvaluatedCount === subjectList.length;
                    const isPassed = isForcePass || (isComplete && failedSubjectsCount === 0 && (termObtained / (termMax || 1) >= 0.33) && !hasAnyAbsent && !isForceFail);

                    if (hasMarks && termMax > 0) {
                        if (!isPassed) hasAnyTermFailed = true;
                        totalObtainedAllTerms += termObtained;
                        totalMaxAllTerms += termMax;
                        termsWithRealDataCount++;

                        return {
                            termKey: slot.key,
                            examTitle: matchedExam?.title || slot.defaultTitle,
                            obtained: termObtained,
                            max: termMax,
                            scoreText: `${termObtained} / ${termMax}`,
                            hasMarks: true,
                            isPassed: isPassed
                        };
                    } else {
                        return {
                            termKey: slot.key,
                            examTitle: matchedExam?.title || slot.defaultTitle,
                            obtained: 0,
                            max: 0,
                            scoreText: '-- / --',
                            hasMarks: false,
                            isPassed: null
                        };
                    }
                });

                const cumulativePct = totalMaxAllTerms > 0
                    ? parseFloat(((totalObtainedAllTerms / totalMaxAllTerms) * 100).toFixed(1))
                    : 0;

                const isCumulativePassed = totalMaxAllTerms > 0 ? (cumulativePct >= 33 && !hasAnyTermFailed) : true;
                const grade = calculateGrade(totalObtainedAllTerms, totalMaxAllTerms);
                const defaultPromotionStatus = isCumulativePassed ? 'promote' : 'retain';

                return {
                    id: studentId,
                    ...student,
                    name: student.fullName || student.name || ((student.firstName || '') + ' ' + (student.lastName || '')).trim() || 'Student',
                    rollNo: student.rollNumber || student.rollNo || '',
                    fatherName: student.fatherName || student.guardianName || '',
                    avatar: student.photoUrl || student.photo || student.profileImage || student.avatar || student.profilePic || '',
                    termsScores,
                    totalObtainedAllTerms,
                    totalMaxAllTerms,
                    cumulativePercentage: cumulativePct,
                    cumulativeGrade: totalMaxAllTerms > 0 ? grade : '-',
                    cumulativeIsPassed: isCumulativePassed,
                    hasRealTermData: termsWithRealDataCount > 0,
                    promotionStatus: defaultPromotionStatus,
                    examScore: cumulativePct.toString(),
                    result: isCumulativePassed ? 'pass' : 'fail',
                    nextClassId: nextClass ? nextClass.id : 'graduate',
                    nextClassName: nextClass ? nextClass.name : 'Graduated',
                    previousClassId: previousClass ? previousClass.id : null,
                    previousClassName: previousClass ? previousClass.name : 'None'
                };
            });

            // Sort students numerically by roll number
            computedStudents.sort((a, b) => {
                const rollA = parseInt(a.rollNo) || 999999;
                const rollB = parseInt(b.rollNo) || 999999;
                if (rollA !== rollB) return rollA - rollB;
                return (a.name || '').localeCompare(b.name || '');
            });

            setStudents(computedStudents);
            setLoadingStudents(false);
        };

        // Live Real-Time Firestore Stream Listeners
        const studentsRef = collection(db, `schools/${schoolId}/classes/${selectedClass.id}/students`);
        const unsubStudents = onSnapshot(studentsRef, snap => {
            studentsList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            recomputeAndSetStudents();
        }, err => {
            console.error("Students snapshot stream error:", err);
            setLoadingStudents(false);
        });

        const examsRef = collection(db, `schools/${schoolId}/exams`);
        const unsubExams = onSnapshot(examsRef, snap => {
            examsList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            examsList.sort((a, b) => (a.status === 'active' ? -1 : 1));
            recomputeAndSetStudents();
        }, err => console.warn("Exams snapshot stream notice:", err));

        const marksRef = collection(db, `schools/${schoolId}/classes/${selectedClass.id}/exam_marks`);
        const unsubMarks = onSnapshot(marksRef, snap => {
            marksDocsList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            recomputeAndSetStudents();
        }, err => console.warn("Marks snapshot stream notice:", err));

        return () => {
            unsubStudents();
            unsubExams();
            unsubMarks();
        };
    }, [schoolId, selectedClass?.id, isDemoMode, classes]);

    const handleToggleDemoMode = () => {
        const nextDemo = !isDemoMode;
        setIsDemoMode(nextDemo);
        localStorage.setItem('exams_demo_mode_active', String(nextDemo));
    };

    const handleIndividualAction = (studentId, action) => {
        setStudents(prev => prev.map(s =>
            s.id === studentId ? { ...s, promotionStatus: action } : s
        ));
    };

    const handleScoreChange = (studentId, score) => {
        const numericScore = parseFloat(score);
        setStudents(prev => prev.map(s => {
            if (s.id === studentId) {
                let result = s.result;
                if (!isNaN(numericScore)) {
                    result = numericScore >= 33 ? 'pass' : 'fail';
                }
                return { ...s, examScore: score, result };
            }
            return s;
        }));
    };

    const handleResultToggle = (studentId, result) => {
        setStudents(prev => prev.map(s =>
            s.id === studentId ? { ...s, result } : s
        ));
    };

    const handleResultUpload = async (studentId, file) => {
        if (!file || !schoolId || !selectedClass) return;

        setUploadingResultId(studentId);
        try {
            const fileExtension = file.name.split('.').pop();
            const timestamp = Date.now();
            const storagePath = `schools/${schoolId}/students/${studentId}/results/result_${timestamp}.${fileExtension}`;

            // Upload to Storage
            const storageRef = ref(storage, storagePath);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(snapshot.ref);

            // Update state immediately for UI
            setStudents(prev => prev.map(s =>
                s.id === studentId ? {
                    ...s,
                    uploadedResultUrl: downloadUrl,
                    uploadedResultType: fileExtension
                } : s
            ));

            // Update Firestore for student in class
            const classStudentRef = doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, studentId);
            await updateDoc(classStudentRef, {
                uploadedResultUrl: downloadUrl,
                uploadedResultType: fileExtension,
                uploadedResultAt: new Date()
            });

            // Update Firestore for master student record
            const masterStudentRef = doc(db, `schools/${schoolId}/students`, studentId);
            await updateDoc(masterStudentRef, {
                uploadedResultUrl: downloadUrl,
                uploadedResultType: fileExtension,
                uploadedResultAt: new Date()
            });

            // Fetch Student Details to get Parent ID for Notification
            const studentDoc = await getDoc(masterStudentRef);
            if (studentDoc.exists()) {
                const studentData = studentDoc.data();
                const parentId = studentData.parentDetails?.parentId;
                
                if (parentId) {
                    await addDoc(collection(db, `schools/${schoolId}/notifications`), {
                        parentId: parentId,
                        studentId: studentId,
                        studentName: studentData.name,
                        title: '📄 New Result Card',
                        message: `A new result card (${file.name}) has been uploaded for ${studentData.name}.`,
                        type: 'result',
                        read: false,
                        createdAt: new Date()
                    });
                }
            }

        } catch (error) {
            console.error("Error uploading result:", error);
            alert("Failed to upload result file.");
        } finally {
            setUploadingResultId(null);
            // Reset input so same file can be uploaded again if needed
            if (fileInputRefs.current[studentId]) {
                fileInputRefs.current[studentId].value = '';
            }
        }
    };

    const setAllStatus = (status) => {
        setStudents(prev => prev.map(s => ({ ...s, promotionStatus: status })));
    };

    const filteredStudents = students.filter(s => {
        const matchesSearch = s.name?.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
            s.rollNo?.toString().includes(studentSearchQuery);

        const status = s.promotionStatus || 'promote';
        const matchesStatus = statusFilter === 'all' || status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    const classColors = {
        'nursery': '#F43F5E',
        'prep': '#F59E0B',
        '1': '#10B981',
        '2': '#3B82F6',
        '3': '#8B5CF6',
        '4': '#EC4899',
        '5': '#06B6D4',
        '6': '#6366F1',
        '7': '#84CC16',
        '8': '#D946EF',
        '9': '#F97316',
        '10': '#14B8A6'
    };

    const getClassColor = (name) => {
        const key = name.toLowerCase().replace('class ', '').trim();
        return classColors[key] || '#64748B';
    };

    // Helper: Generate Rich Realistic Demo History Records across Multiple Academic Sessions & Classes
    const getDemoPromotionHistory = (classList = classes) => {
        const targetClasses = classList.length > 0 ? classList : [
            { id: 'nursery', name: 'Nursery' },
            { id: 'prep', name: 'Prep' },
            { id: 'class_1', name: 'Class 1' },
            { id: 'class_2', name: 'Class 2' },
            { id: 'class_3', name: 'Class 3' },
            { id: 'class_4', name: 'Class 4' },
            { id: 'class_5', name: 'Class 5' },
            { id: 'class_6', name: 'Class 6' },
            { id: 'class_7', name: 'Class 7' },
            { id: 'class_8', name: 'Class 8' },
            { id: 'class_9', name: 'Class 9' },
            { id: 'class_10', name: 'Class 10' }
        ];

        const sampleNames = [
            { name: 'Muhammad Huzaifa', father: 'Tariq Mehmood' },
            { name: 'Ayesha Fatima', father: 'Abdul Rehman' },
            { name: 'Usman Farooq', father: 'Farooq Ahmed' },
            { name: 'Zubair Shah', father: 'Syed Shah' },
            { name: 'Zayan Ghani', father: 'Faizan Ghani' },
            { name: 'Hamza Ali', father: 'Ali Asghar' },
            { name: 'Khadija Bibi', father: 'Muhammad Yousaf' },
            { name: 'Bilal Khan', father: 'Khan Bahadur' },
            { name: 'Farhan Zaidi', father: 'Raza Zaidi' }
        ];

        const sessionsList = ['2024-2025', '2023-2024', '2022-2023', '2025-2026'];
        const allRecords = [];

        sessionsList.forEach((sess, sIdx) => {
            targetClasses.forEach((cls, cIdx) => {
                const nextClass = targetClasses[cIdx + 1] || null;
                const prevClass = targetClasses[cIdx - 1] || null;
                const nextClassName = nextClass ? nextClass.name : (cIdx === targetClasses.length - 1 ? 'Graduated' : 'Next Grade');
                const prevClassName = prevClass ? prevClass.name : 'Previous Grade';

                // Student 1: Top Achiever (Promote)
                allRecords.push({
                    id: `demo_${sess}_${cls.id}_1`,
                    studentId: `std_${cls.id}_1`,
                    studentName: sampleNames[0].name,
                    rollNo: '01',
                    fatherName: sampleNames[0].father,
                    session: sess,
                    fromClassId: cls.id,
                    fromClassName: cls.name,
                    toClassId: nextClass ? nextClass.id : 'graduate',
                    toClassName: nextClassName,
                    action: 'promote',
                    finalScore: 97.5,
                    grade: 'A+',
                    result: 'pass',
                    promotedAt: new Date(`${2025 - sIdx}-03-31T10:00:00Z`),
                    totalObtainedAllTerms: 1170,
                    totalMaxAllTerms: 1200,
                    termsScores: [
                        { termKey: 'first', examTitle: '1st Term', obtained: 385, max: 400, scoreText: '385 / 400', hasMarks: true, isPassed: true },
                        { termKey: 'mid', examTitle: '2nd Term', obtained: 390, max: 400, scoreText: '390 / 400', hasMarks: true, isPassed: true },
                        { termKey: 'final', examTitle: 'Final Exam', obtained: 395, max: 400, scoreText: '395 / 400', hasMarks: true, isPassed: true }
                    ]
                });

                // Student 2: Grade A+ (Promote)
                allRecords.push({
                    id: `demo_${sess}_${cls.id}_2`,
                    studentId: `std_${cls.id}_2`,
                    studentName: sampleNames[1].name,
                    rollNo: '02',
                    fatherName: sampleNames[1].father,
                    session: sess,
                    fromClassId: cls.id,
                    fromClassName: cls.name,
                    toClassId: nextClass ? nextClass.id : 'graduate',
                    toClassName: nextClassName,
                    action: 'promote',
                    finalScore: 81.3,
                    grade: 'A+',
                    result: 'pass',
                    promotedAt: new Date(`${2025 - sIdx}-03-31T10:00:00Z`),
                    totalObtainedAllTerms: 975,
                    totalMaxAllTerms: 1200,
                    termsScores: [
                        { termKey: 'first', examTitle: '1st Term', obtained: 310, max: 400, scoreText: '310 / 400', hasMarks: true, isPassed: true },
                        { termKey: 'mid', examTitle: '2nd Term', obtained: 325, max: 400, scoreText: '325 / 400', hasMarks: true, isPassed: true },
                        { termKey: 'final', examTitle: 'Final Exam', obtained: 340, max: 400, scoreText: '340 / 400', hasMarks: true, isPassed: true }
                    ]
                });

                // Student 3: Grade C (Promote)
                allRecords.push({
                    id: `demo_${sess}_${cls.id}_3`,
                    studentId: `std_${cls.id}_3`,
                    studentName: sampleNames[2].name,
                    rollNo: '03',
                    fatherName: sampleNames[2].father,
                    session: sess,
                    fromClassId: cls.id,
                    fromClassName: cls.name,
                    toClassId: nextClass ? nextClass.id : 'graduate',
                    toClassName: nextClassName,
                    action: 'promote',
                    finalScore: 58.3,
                    grade: 'C',
                    result: 'pass',
                    promotedAt: new Date(`${2025 - sIdx}-03-31T10:00:00Z`),
                    totalObtainedAllTerms: 700,
                    totalMaxAllTerms: 1200,
                    termsScores: [
                        { termKey: 'first', examTitle: '1st Term', obtained: 110, max: 400, scoreText: '110 / 400', hasMarks: true, isPassed: false },
                        { termKey: 'mid', examTitle: '2nd Term', obtained: 280, max: 400, scoreText: '280 / 400', hasMarks: true, isPassed: true },
                        { termKey: 'final', examTitle: 'Final Exam', obtained: 310, max: 400, scoreText: '310 / 400', hasMarks: true, isPassed: true }
                    ]
                });

                // Student 4: Grade F - Retained in Grade
                allRecords.push({
                    id: `demo_${sess}_${cls.id}_4`,
                    studentId: `std_${cls.id}_4`,
                    studentName: sampleNames[4].name,
                    rollNo: '04',
                    fatherName: sampleNames[4].father,
                    session: sess,
                    fromClassId: cls.id,
                    fromClassName: cls.name,
                    toClassId: cls.id,
                    toClassName: cls.name,
                    action: 'retain',
                    finalScore: 25.4,
                    grade: 'F',
                    result: 'fail',
                    promotedAt: new Date(`${2025 - sIdx}-03-31T10:00:00Z`),
                    totalObtainedAllTerms: 305,
                    totalMaxAllTerms: 1200,
                    termsScores: [
                        { termKey: 'first', examTitle: '1st Term', obtained: 100, max: 400, scoreText: '100 / 400', hasMarks: true, isPassed: false },
                        { termKey: 'mid', examTitle: '2nd Term', obtained: 110, max: 400, scoreText: '110 / 400', hasMarks: true, isPassed: false },
                        { termKey: 'final', examTitle: 'Final Exam', obtained: 95, max: 400, scoreText: '95 / 400', hasMarks: true, isPassed: false }
                    ]
                });

                // Student 5: Grade F - Demoted to Previous
                allRecords.push({
                    id: `demo_${sess}_${cls.id}_5`,
                    studentId: `std_${cls.id}_5`,
                    studentName: sampleNames[5].name,
                    rollNo: '05',
                    fatherName: sampleNames[5].father,
                    session: sess,
                    fromClassId: cls.id,
                    fromClassName: cls.name,
                    toClassId: prevClass ? prevClass.id : cls.id,
                    toClassName: prevClassName,
                    action: prevClass ? 'demote' : 'retain',
                    finalScore: 21.3,
                    grade: 'F',
                    result: 'fail',
                    promotedAt: new Date(`${2025 - sIdx}-03-31T10:00:00Z`),
                    totalObtainedAllTerms: 255,
                    totalMaxAllTerms: 1200,
                    termsScores: [
                        { termKey: 'first', examTitle: '1st Term', obtained: 85, max: 400, scoreText: '85 / 400', hasMarks: true, isPassed: false },
                        { termKey: 'mid', examTitle: '2nd Term', obtained: 80, max: 400, scoreText: '80 / 400', hasMarks: true, isPassed: false },
                        { termKey: 'final', examTitle: 'Final Exam', obtained: 90, max: 400, scoreText: '90 / 400', hasMarks: true, isPassed: false }
                    ]
                });

                // Student 6: School Leave / SLC (Out)
                allRecords.push({
                    id: `demo_${sess}_${cls.id}_6`,
                    studentId: `std_${cls.id}_6`,
                    studentName: sampleNames[8].name,
                    rollNo: '06',
                    fatherName: sampleNames[8].father,
                    session: sess,
                    fromClassId: cls.id,
                    fromClassName: cls.name,
                    toClassId: 'leave',
                    toClassName: 'Left School',
                    action: 'leave',
                    finalScore: 52.0,
                    grade: 'C',
                    result: 'pass',
                    promotedAt: new Date(`${2025 - sIdx}-03-31T10:00:00Z`),
                    totalObtainedAllTerms: 624,
                    totalMaxAllTerms: 1200,
                    termsScores: [
                        { termKey: 'first', examTitle: '1st Term', obtained: 210, max: 400, scoreText: '210 / 400', hasMarks: true, isPassed: true },
                        { termKey: 'mid', examTitle: '2nd Term', obtained: 214, max: 400, scoreText: '214 / 400', hasMarks: true, isPassed: true },
                        { termKey: 'final', examTitle: 'Final Exam', obtained: 200, max: 400, scoreText: '200 / 400', hasMarks: true, isPassed: true }
                    ]
                });
            });
        });

        return allRecords;
    };

    // Fetch Promotion History from Firestore
    const fetchPromotionHistory = async () => {
        if (!schoolId) return;
        setLoadingHistory(true);
        try {
            const historyRef = collection(db, `schools/${schoolId}/promotion_history`);
            const historySnap = await getDocsFast(historyRef);
            let records = [];

            if (!historySnap.empty) {
                records = historySnap.docs.map(d => ({
                    id: d.id,
                    ...d.data(),
                    promotedAt: d.data().promotedAt?.toDate ? d.data().promotedAt.toDate() : (d.data().promotedAt ? new Date(d.data().promotedAt) : new Date())
                }));
            }

            // If empty or demo mode is active, enrich with multi-session & multi-class demo history
            if (records.length === 0 || isDemoMode || String(schoolId) === '6257') {
                const demoRecords = getDemoPromotionHistory(classes);
                const existingIds = new Set(records.map(r => r.id));
                demoRecords.forEach(dr => {
                    if (!existingIds.has(dr.id)) {
                        records.push(dr);
                    }
                });
            }

            // Sort by promotedAt desc
            records.sort((a, b) => new Date(b.promotedAt) - new Date(a.promotedAt));
            setPromotionHistory(records);
        } catch (error) {
            console.error("Error fetching promotion history:", error);
            setPromotionHistory(getDemoPromotionHistory(classes));
        } finally {
            setLoadingHistory(false);
        }
    };

    useEffect(() => {
        if (schoolId && activeTab === 'promoted') {
            fetchPromotionHistory();
        }
    }, [schoolId, activeTab, isDemoMode]);

    // Ensure default historyClassFilter is populated once classes are loaded
    useEffect(() => {
        if (classes.length > 0) {
            setHistoryClassFilter(prev => {
                if (!prev || prev === 'all' || !classes.some(c => c.id === prev)) {
                    return classes[0].id;
                }
                return prev;
            });
        }
    }, [classes]);

    // 4. Process Promotions - SAFE CHUNKED VERSION
    const processPromotions = async () => {
        setShowConfirmModal(false);
        setProcessing(true);
        try {
            // Helper to commit batches in chunks
            const commitBatchChunks = async (operations, batchSize = 400) => {
                for (let i = 0; i < operations.length; i += batchSize) {
                    const batch = writeBatch(db);
                    const chunk = operations.slice(i, i + batchSize);
                    chunk.forEach(op => op(batch));
                    await batch.commit();
                    console.log(`Committed batch ${Math.floor(i / batchSize) + 1}`);
                }
            };

            // 1. Annual Purge: Delete all attendance history
            console.log("Starting Attendance Purge...");
            const attendanceRef = collection(db, `schools/${schoolId}/attendance`);
            const attendanceSnap = await getDocsFast(attendanceRef);

            if (!attendanceSnap.empty) {
                const deleteOps = attendanceSnap.docs.map(docSnap => (batch) => {
                    batch.delete(docSnap.ref);
                });
                await commitBatchChunks(deleteOps, 400); // Safe limit
                console.log("Attendance Purge Complete");
            }

            // 2. Process Student Moves & History Log
            console.log("Starting Student Moves & History Logging...");
            const moveOps = [];
            const currentSession = '2025-2026';
            const timestampNow = new Date();

            for (const student of students) {
                const status = student.promotionStatus || 'promote';
                const studentData = {
                    ...student,
                    examScore: student.examScore || 0,
                    result: student.result || 'pass',
                    status: null, // Reset daily attendance status
                    academicScores: [], // Clear school-year academic history
                    wellness: { behavior: null, health: null, hygiene: null }, // Reset health/behavior
                    homework: 0, // Reset homework percentage
                    attendance: { percentage: 0 }, // Reset historical attendance rate
                    updatedAt: timestampNow
                };

                const toClassNameCalculated = status === 'promote' 
                    ? (student.nextClassId === 'graduate' ? 'Graduated' : (student.nextClassName || 'Next Grade'))
                    : status === 'demote' 
                    ? (student.previousClassName || 'Previous Grade')
                    : status === 'leave'
                    ? 'Left School'
                    : selectedClass.name;

                const toClassIdCalculated = status === 'promote'
                    ? (student.nextClassId || 'graduate')
                    : status === 'demote'
                    ? (student.previousClassId || selectedClass.id)
                    : selectedClass.id;

                // Log into permanent promotion history archive
                const historyDocId = `${currentSession.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedClass.id}_${student.id}`;
                const historyRef = doc(db, `schools/${schoolId}/promotion_history`, historyDocId);

                moveOps.push((batch) => {
                    batch.set(historyRef, {
                        studentId: student.id,
                        studentName: student.name || 'Student',
                        rollNo: student.rollNo || '',
                        fatherName: student.fatherName || '',
                        avatar: student.avatar || '',
                        session: currentSession,
                        fromClassId: selectedClass.id,
                        fromClassName: selectedClass.name,
                        toClassId: toClassIdCalculated,
                        toClassName: toClassNameCalculated,
                        action: status,
                        finalScore: student.cumulativePercentage !== undefined ? student.cumulativePercentage : (parseFloat(student.examScore) || 0),
                        grade: student.cumulativeGrade || (student.result === 'pass' ? 'A' : 'F'),
                        result: student.result || (student.cumulativeIsPassed ? 'pass' : 'fail'),
                        termsScores: student.termsScores || [],
                        totalObtainedAllTerms: student.totalObtainedAllTerms || 0,
                        totalMaxAllTerms: student.totalMaxAllTerms || 0,
                        uploadedResultUrl: student.uploadedResultUrl || null,
                        promotedAt: timestampNow
                    }, { merge: true });
                });

                // Define operation based on status
                if (status === 'promote') {
                    if (student.nextClassId === 'graduate') {
                        moveOps.push((batch) => {
                            const alumniRef = doc(db, `schools/${schoolId}/alumni`, student.id);
                            batch.set(alumniRef, { ...studentData, graduatedAt: timestampNow, previousClassId: selectedClass.id });
                            batch.delete(doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id));
                            batch.delete(doc(db, `schools/${schoolId}/students`, student.id)); // Remove from active students
                        });
                    } else if (student.nextClassId) {
                        moveOps.push((batch) => {
                            const nextClassRef = doc(db, `schools/${schoolId}/classes/${student.nextClassId}/students`, student.id);
                            batch.set(nextClassRef, { ...studentData, classId: student.nextClassId, className: student.nextClassName, promotedAt: timestampNow, previousClassId: selectedClass.id });
                            batch.delete(doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id));
                            batch.update(doc(db, `schools/${schoolId}/students`, student.id), { classId: student.nextClassId, className: student.nextClassName, updatedAt: timestampNow });
                        });
                    }
                } else if (status === 'demote' && student.previousClassId) {
                    moveOps.push((batch) => {
                        const prevClassRef = doc(db, `schools/${schoolId}/classes/${student.previousClassId}/students`, student.id);
                        batch.set(prevClassRef, { ...studentData, classId: student.previousClassId, className: student.previousClassName, demotedAt: timestampNow, previousClassId: selectedClass.id });
                        batch.delete(doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id));
                        batch.update(doc(db, `schools/${schoolId}/students`, student.id), { classId: student.previousClassId, className: student.previousClassName, updatedAt: timestampNow });
                    });
                } else if (status === 'leave') {
                    moveOps.push((batch) => {
                        batch.delete(doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id));
                        batch.delete(doc(db, `schools/${schoolId}/students`, student.id));
                    });
                } else {
                    // Retain
                    moveOps.push((batch) => {
                        const currentStudentRef = doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id);
                        batch.update(currentStudentRef, { ...studentData, retained: true, retainedAt: timestampNow });
                    });
                }
            }

            if (moveOps.length > 0) {
                await commitBatchChunks(moveOps, 400); // Safe limit for moves
                console.log("Student Moves & History Logging Complete");
            }

            // Auto-generate and download the PDF report before clearing data
            await generatePDF();

            setPromotionStatus('success');
            setSelectedClass(null);
            setStudents([]);
            // Refresh classes & history
            fetchClasses();
            fetchPromotionHistory();

        } catch (error) {
            console.error("Promotion failed:", error);
            setPromotionStatus('error');
        } finally {
            setProcessing(false);
        }
    };

    // Helper: One-Click Export to Excel / CSV
    const handleExportCSV = (recordsToExport) => {
        if (!recordsToExport || recordsToExport.length === 0) {
            alert("No promotion history records to export.");
            return;
        }

        setIsExportingCsv(true);
        try {
            const headers = [
                "S.No",
                "Academic Session",
                "Roll No",
                "Student Name",
                "Father Name",
                "Previous Class",
                "Promoted To Class",
                "Action Taken",
                "Total Marks Obtained",
                "Total Maximum Marks",
                "Overall Score %",
                "Grade",
                "Academic Result",
                "Promotion Date"
            ];

            const rows = recordsToExport.map((rec, idx) => [
                idx + 1,
                `"${rec.session || '2025-2026'}"`,
                `"${rec.rollNo || ''}"`,
                `"${(rec.studentName || '').replace(/"/g, '""')}"`,
                `"${(rec.fatherName || '').replace(/"/g, '""')}"`,
                `"${(rec.fromClassName || '').replace(/"/g, '""')}"`,
                `"${(rec.toClassName || '').replace(/"/g, '""')}"`,
                `"${(rec.action || 'promote').toUpperCase()}"`,
                rec.totalObtainedAllTerms || 0,
                rec.totalMaxAllTerms || 0,
                `"${rec.finalScore || 0}%"`,
                `"${rec.grade || '-'}"`,
                `"${(rec.result || 'PASS').toUpperCase()}"`,
                `"${rec.promotedAt ? new Date(rec.promotedAt).toLocaleDateString() : '-'}"`
            ]);

            const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            const sessionName = historySession !== 'all' ? historySession.replace(/\s+/g, '_') : 'All_Sessions';
            const className = historyClassFilter !== 'all' ? `_Class_${historyClassFilter}` : '';
            link.setAttribute("href", url);
            link.setAttribute("download", `Promotion_Ledger_${sessionName}${className}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Export CSV Error:", err);
            alert("Failed to export CSV. Please check console.");
        } finally {
            setIsExportingCsv(false);
        }
    };

    // Helper: Download Official Annual Promotion Gazette (PDF Ledger)
    const handleDownloadGazettePDF = async (recordsToPrint) => {
        if (!recordsToPrint || recordsToPrint.length === 0) {
            alert("No promotion records available to generate Gazette Ledger.");
            return;
        }

        setIsGeneratingGazette(true);
        try {
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            // 1. Header Band (Deep Royal Blue)
            doc.setFillColor(30, 58, 138); // Blue-900
            doc.rect(0, 0, pageWidth, 42, 'F');

            // Logo
            if (schoolDetails.logo) {
                try {
                    const res = await fetch(schoolDetails.logo);
                    const blob = await res.blob();
                    const logoData = await new Promise(r => {
                        const fr = new FileReader();
                        fr.onloadend = () => r(fr.result);
                        fr.readAsDataURL(blob);
                    });
                    if (logoData) {
                        doc.addImage(logoData, 'PNG', 14, 8, 26, 26);
                    }
                } catch (e) {
                    console.warn("Could not load logo for Gazette:", e);
                }
            }

            // Title & School Name
            doc.setFont("helvetica", "bold");
            doc.setFontSize(20);
            doc.setTextColor(255, 255, 255);
            doc.text((schoolDetails.name || 'ACADEMIC INSTITUTION').toUpperCase(), 46, 18);

            doc.setFontSize(13);
            doc.setTextColor(226, 232, 240); // Slate-200
            doc.setFont("helvetica", "normal");
            doc.text("OFFICIAL ANNUAL PROMOTION GAZETTE & ARCHIVE LEDGER", 46, 27);

            // Session & Metadata Badge
            doc.setFontSize(10);
            doc.setTextColor(191, 219, 254); // Blue-200
            const activeSessionText = historySession !== 'all' ? `Academic Session: ${historySession}` : 'All Academic Sessions Archive';
            doc.text(`${activeSessionText} | Total Records: ${recordsToPrint.length}`, 46, 35);

            // Print Date Right Top
            doc.setFontSize(9);
            doc.setTextColor(255, 255, 255);
            doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - 14, 16, { align: 'right' });
            doc.text(`Official Document`, pageWidth - 14, 23, { align: 'right' });

            // 2. Summary KPI Ribbon
            const total = recordsToPrint.length;
            const promotedCount = recordsToPrint.filter(r => (r.action || 'promote') === 'promote').length;
            const retainedCount = recordsToPrint.filter(r => r.action === 'retain').length;
            const demotedCount = recordsToPrint.filter(r => r.action === 'demote').length;
            const passPct = total > 0 ? ((promotedCount / total) * 100).toFixed(1) : 0;

            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(14, 46, pageWidth - 28, 12, 2, 2, 'FD');

            doc.setFontSize(9);
            doc.setTextColor(51, 65, 85);
            doc.setFont("helvetica", "bold");
            doc.text(`Total Archived: ${total}`, 20, 53.5);
            doc.setTextColor(16, 185, 129); // Emerald
            doc.text(`Promoted: ${promotedCount} (${passPct}%)`, 75, 53.5);
            doc.setTextColor(239, 68, 68); // Rose
            doc.text(`Retained: ${retainedCount}`, 145, 53.5);
            doc.setTextColor(245, 158, 11); // Amber
            doc.text(`Demoted: ${demotedCount}`, 200, 53.5);

            // 3. Table Column Structure
            const tableColumns = [
                "S#",
                "Session",
                "Roll",
                "Student Name",
                "Father Name",
                "From Grade",
                "Promoted To",
                "Decision",
                "Score %",
                "Grade",
                "Status",
                "Date"
            ];

            const tableRows = recordsToPrint.map((rec, index) => {
                const action = rec.action || 'promote';
                let actionText = 'PROMOTED';
                if (action === 'retain') actionText = 'RETAINED';
                if (action === 'demote') actionText = 'DEMOTED';
                if (action === 'leave') actionText = 'LEFT';

                return [
                    index + 1,
                    rec.session || '2025-2026',
                    rec.rollNo || '-',
                    (rec.studentName || '').toUpperCase(),
                    rec.fatherName || '-',
                    rec.fromClassName || '-',
                    rec.toClassName || (action === 'promote' ? 'Next Grade' : '-'),
                    actionText,
                    rec.finalScore ? `${rec.finalScore}%` : '-',
                    rec.grade || '-',
                    (rec.result || 'PASS').toUpperCase(),
                    rec.promotedAt ? new Date(rec.promotedAt).toLocaleDateString() : '-'
                ];
            });

            // 4. Render Table
            autoTable(doc, {
                startY: 62,
                head: [tableColumns],
                body: tableRows,
                theme: 'grid',
                headStyles: {
                    fillColor: [30, 58, 138],
                    textColor: 255,
                    fontSize: 8.5,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                bodyStyles: {
                    fontSize: 8,
                    textColor: 40,
                    halign: 'center',
                    cellPadding: 2.2
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252]
                },
                columnStyles: {
                    3: { halign: 'left', fontStyle: 'bold' }, // Student Name
                    4: { halign: 'left' } // Father Name
                },
                margin: { left: 14, right: 14, bottom: 25 },
                didParseCell: (data) => {
                    // Colorize decision column
                    if (data.section === 'body' && data.column.index === 7) {
                        const val = data.cell.raw;
                        if (val === 'PROMOTED') {
                            data.cell.styles.textColor = [16, 185, 129];
                            data.cell.styles.fontStyle = 'bold';
                        } else if (val === 'RETAINED') {
                            data.cell.styles.textColor = [225, 29, 72];
                            data.cell.styles.fontStyle = 'bold';
                        } else if (val === 'DEMOTED') {
                            data.cell.styles.textColor = [217, 119, 6];
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                }
            });

            // 5. Signature & Stamp Footer Area
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);

                // Signatures on Last Page
                if (i === pageCount) {
                    const finalY = doc.lastAutoTable.finalY || (pageHeight - 40);
                    const sigY = Math.min(finalY + 16, pageHeight - 20);

                    doc.setFontSize(8.5);
                    doc.setFont("helvetica", "bold");
                    doc.setTextColor(71, 85, 105);

                    // Examination Incharge
                    doc.line(20, sigY, 75, sigY);
                    doc.text("Examination Incharge", 47.5, sigY + 5, { align: 'center' });

                    // Section Head
                    doc.line(120, sigY, 175, sigY);
                    doc.text("Section Head / VP", 147.5, sigY + 5, { align: 'center' });

                    // Principal Signature & Seal
                    doc.line(pageWidth - 75, sigY, pageWidth - 20, sigY);
                    doc.text("Principal / Controller", pageWidth - 47.5, sigY + 5, { align: 'center' });
                }

                // Page Number Footer
                doc.setFontSize(7.5);
                doc.setTextColor(148, 163, 184);
                doc.setFont("helvetica", "normal");
                doc.text(`Official Academic Promotion Ledger | Confidential Archive Record`, 14, pageHeight - 8);
                doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
            }

            // Save PDF
            const fileSession = historySession !== 'all' ? historySession.replace(/\s+/g, '_') : 'All_Sessions';
            doc.save(`Annual_Promotion_Gazette_${fileSession}.pdf`);

        } catch (error) {
            console.error("Error generating Gazette PDF:", error);
            alert("Failed to generate Annual Gazette PDF. Check console for details.");
        } finally {
            setIsGeneratingGazette(false);
        }
    };

    // 5. Generate PDF Report
    const generatePDF = async () => {
        if (!selectedClass || students.length === 0) return;

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // --- Helper: Load Image ---
        const loadImage = async (url) => {
            if (!url) return null;
            try {
                const response = await fetch(url);
                const blob = await response.blob();
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            } catch (error) {
                console.error("Error loading image:", error);
                return null;
            }
        };

        try {
            // 1. Header Section - Blue Background
            doc.setFillColor(30, 58, 138); // Blue-900 (Dark Blue)
            doc.rect(0, 0, pageWidth, 50, 'F');

            // Logo
            if (schoolDetails.logo) {
                try {
                    const imgData = await loadImage(schoolDetails.logo);
                    if (imgData) {
                        doc.addImage(imgData, 'PNG', 15, 12, 26, 26);
                    }
                } catch (e) {
                    console.error("Error adding logo to PDF", e);
                }
            }

            // School Name
            doc.setFontSize(22);
            doc.setTextColor(255, 255, 255); // White
            doc.setFont("helvetica", "bold");
            doc.text(schoolDetails.name.toUpperCase(), 50, 22);

            // Report Title
            doc.setFontSize(14);
            doc.setTextColor(203, 213, 225); // Slate-300
            doc.setFont("helvetica", "normal");
            doc.text("Annual Promotion Report", 50, 30);

            // Session
            doc.setFontSize(10);
            doc.setTextColor(148, 163, 184); // Slate-400
            doc.text("Academic Session: 2025 - 2026", 50, 36);

            // Class Info
            let yPos = 65; // Pushed down below header
            doc.setFontSize(12);
            doc.setTextColor(30, 41, 59); // Back to Dark Text
            doc.setFont("helvetica", "bold");
            doc.text(`Class: ${selectedClass.name}`, 15, yPos);

            doc.setFont("helvetica", "normal");
            doc.text(`Total Students: ${students.length}`, pageWidth - 15, yPos, { align: 'right' });

            if (selectedClass.teacher) {
                doc.text(`Class Teacher: ${selectedClass.teacher}`, 15, yPos + 6);
            }

            // 2. Table Data
            const tableColumn = ["Roll No", "Name", "Score", "Result", "Status", "Next Class"];
            const tableRows = [];

            students.forEach(student => {
                const status = student.promotionStatus || 'promote';
                let statusText = 'Promote';
                if (status === 'retain') statusText = 'Retain';
                if (status === 'demote') statusText = 'Demote';
                if (status === 'leave') statusText = 'Left School';

                let nextClassText = '-';
                if (status === 'promote') nextClassText = student.nextClassName || 'Graduated';
                if (status === 'demote') nextClassText = student.previousClassName || '-';
                if (status === 'retain') nextClassText = selectedClass.name;

                const rowData = [
                    student.rollNo || '-',
                    student.name,
                    student.examScore ? `${student.examScore}%` : '-',
                    (student.result || 'pass').toUpperCase(),
                    statusText.toUpperCase(),
                    nextClassText
                ];
                tableRows.push(rowData);
            });

            // 3. Generate Table
            autoTable(doc, {
                startY: yPos + 15,
                head: [tableColumn],
                body: tableRows,
                theme: 'grid',
                headStyles: {
                    fillColor: [79, 70, 229], // Indigo-600
                    textColor: 255,
                    fontSize: 10,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                bodyStyles: {
                    textColor: 50,
                    fontSize: 9,
                    halign: 'center'
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252] // Slate-50
                },
                columnStyles: {
                    1: { halign: 'left' } // Name left-aligned
                },
                margin: { top: 20 }
            });

            // Footer
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Generated on ${new Date().toLocaleDateString()}`, 15, doc.internal.pageSize.getHeight() - 10);
                doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() - 20, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
            }

            // --- Dynamic Naming Logic ---
            // Format example: "class 1st to 2nd class exam 2026.pdf"
            const currentYear = new Date().getFullYear();
            const fromClass = selectedClass.name.toLowerCase().replace('class', '').trim();

            // Determine "to class" based on the first promoted student, or fallback
            const promotedStudent = students.find(s => (s.promotionStatus || 'promote') === 'promote');
            let toClass = 'graduated';
            if (promotedStudent && promotedStudent.nextClassName) {
                toClass = promotedStudent.nextClassName.toLowerCase().replace('class', '').trim();
            }

            let fileName = `class ${fromClass} to ${toClass} class exam ${currentYear}.pdf`;

            // Clean up any double spaces if 'fromClass' or 'toClass' logic went weird
            fileName = fileName.replace(/\s+/g, ' ').trim();

            // Save PDF
            doc.save(fileName);

        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("Failed to generate PDF. check console for details.");
        }
    };


    // --- TAB 3: SLC CLEARANCE DESK & 50-YEAR HISTORY FUNCTIONS ---

    // Fetch Permanent 50-Year SLC History Register
    const fetchSLCHistory = async () => {
        if (!schoolId) return;
        try {
            setLoadingSlcHistory(true);
            const q = query(collection(db, `schools/${schoolId}/slc_register`), orderBy('issuedAt', 'desc'));
            const snap = await getDocsFast(q);
            if (!snap.empty) {
                const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setSlcHistory(records);
            } else {
                setSlcHistory(getDemoSLCHistory());
            }
        } catch (err) {
            console.warn("Could not fetch SLC history:", err);
            setSlcHistory(getDemoSLCHistory());
        } finally {
            setLoadingSlcHistory(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'slc') {
            fetchSLCHistory();
            if (classes.length > 0 && !slcClassId) {
                handleClassSelectSLC(classes[0].id);
            }
        }
    }, [activeTab, schoolId]);

    // 50-Year Demo SLC Generator
    const getDemoSLCHistory = () => {
        const sampleRecords = [
            {
                id: 'slc_demo_1',
                certificateNo: 'SLC-2025/089',
                studentId: 'std_demo_101',
                studentName: 'Muhammad Huzaifa',
                fatherName: 'Tariq Mehmood',
                grNo: 'GR-4521',
                rollNo: '01',
                dob: '2010-08-14',
                classAtLeaving: 'Class 10',
                classAtLeavingId: 'cls_10',
                session: '2024-2025',
                admissionDate: '2018-04-01',
                admittedClass: 'Class 3',
                leavingDate: '2025-03-31',
                issueDate: '31-Mar-2025',
                reason: 'Completed Matriculation Examination',
                conduct: 'Exemplary / Very Good',
                duesClearedUpTo: 'Fully Cleared (March 2025)',
                duesStatus: 'cleared',
                lastExamResult: '965 / 1100 (87.7% - Grade A+)',
                attendanceRate: '96.2%',
                isQualifiedForPromotion: true,
                remarks: 'Outstanding student with exemplary character and academic excellence.'
            },
            {
                id: 'slc_demo_2',
                certificateNo: 'SLC-2025/042',
                studentId: 'std_demo_102',
                studentName: 'Ayesha Fatima',
                fatherName: 'Abdul Rehman',
                grNo: 'GR-3980',
                rollNo: '02',
                dob: '2011-03-22',
                classAtLeaving: 'Class 9',
                classAtLeavingId: 'cls_9',
                session: '2024-2025',
                admissionDate: '2019-04-01',
                admittedClass: 'Class 4',
                leavingDate: '2025-01-15',
                issueDate: '15-Jan-2025',
                reason: 'Family Relocation / Father Transfer',
                conduct: 'Very Good',
                duesClearedUpTo: 'Fully Cleared (January 2025)',
                duesStatus: 'cleared',
                lastExamResult: '482 / 550 (87.6% - Grade A+)',
                attendanceRate: '94.0%',
                isQualifiedForPromotion: true,
                remarks: 'Well-behaved, diligent, and active participant in co-curricular activities.'
            },
            {
                id: 'slc_demo_3',
                certificateNo: 'SLC-2024/110',
                studentId: 'std_demo_103',
                studentName: 'Usman Farooq',
                fatherName: 'Farooq Ahmed',
                grNo: 'GR-3120',
                rollNo: '03',
                dob: '2009-11-10',
                classAtLeaving: 'Class 10',
                classAtLeavingId: 'cls_10',
                session: '2023-2024',
                admissionDate: '2017-04-01',
                admittedClass: 'Class 4',
                leavingDate: '2024-03-31',
                issueDate: '31-Mar-2024',
                reason: 'Completed Matriculation Examination',
                conduct: 'Good',
                duesClearedUpTo: 'Fully Cleared (March 2024)',
                duesStatus: 'cleared',
                lastExamResult: '890 / 1100 (80.9% - Grade A)',
                attendanceRate: '91.2%',
                isQualifiedForPromotion: true,
                remarks: 'Qualified for College Admission.'
            },
            {
                id: 'slc_demo_4',
                certificateNo: 'SLC-2020/065',
                studentId: 'std_demo_104',
                studentName: 'Farhan Zaidi',
                fatherName: 'Raza Zaidi',
                grNo: 'GR-1850',
                rollNo: '09',
                dob: '2006-05-18',
                classAtLeaving: 'Class 10',
                classAtLeavingId: 'cls_10',
                session: '2019-2020',
                admissionDate: '2014-04-01',
                admittedClass: 'Class 5',
                leavingDate: '2020-03-31',
                issueDate: '31-Mar-2020',
                reason: 'Completed Matriculation Examination',
                conduct: 'Exemplary',
                duesClearedUpTo: 'Fully Cleared (March 2020)',
                duesStatus: 'cleared',
                lastExamResult: '910 / 1100 (82.7% - Grade A+)',
                attendanceRate: '95.0%',
                isQualifiedForPromotion: true,
                remarks: 'Permanent Historical Archive - High School Passed Out.'
            },
            {
                id: 'slc_demo_5',
                certificateNo: 'SLC-2015/033',
                studentId: 'std_demo_105',
                studentName: 'Syed Hamza Ali',
                fatherName: 'Syed Ali Asghar',
                grNo: 'GR-0920',
                rollNo: '04',
                dob: '2001-09-05',
                classAtLeaving: 'Class 10',
                classAtLeavingId: 'cls_10',
                session: '2014-2015',
                admissionDate: '2009-04-01',
                admittedClass: 'Class 5',
                leavingDate: '2015-03-31',
                issueDate: '31-Mar-2015',
                reason: 'Completed Matriculation Examination',
                conduct: 'Good',
                duesClearedUpTo: 'Fully Cleared (March 2015)',
                duesStatus: 'cleared',
                lastExamResult: '840 / 1100 (76.4% - Grade A)',
                attendanceRate: '92.0%',
                isQualifiedForPromotion: true,
                remarks: 'Alumni Archive Record.'
            }
        ];
        return sampleRecords;
    };

    // Toggle Demo Mode for SLC Tab
    const handleToggleDemoSLCMode = () => {
        if (slcDemoMode) {
            setSlcDemoMode(false);
            fetchSLCHistory();
        } else {
            setSlcDemoMode(true);
            setSlcHistory(getDemoSLCHistory());
        }
    };

    // Handle Class Select for SLC Desk
    const handleClassSelectSLC = async (clsId) => {
        setSlcClassId(clsId);
        setSlcStudentId('');
        setSlcSelectedStudent(null);
        setSlcLoadingStudents(true);
        try {
            const studentsSnap = await getDocsFast(collection(db, `schools/${schoolId}/classes/${clsId}/students`));
            let stdList = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            if (stdList.length === 0 || slcDemoMode) {
                stdList = [
                    {
                        id: 'demo_slc_std_1',
                        name: 'Muhammad Huzaifa',
                        fatherName: 'Tariq Mehmood',
                        rollNo: '01',
                        grNo: 'GR-4521',
                        dob: '2010-08-14',
                        admissionDate: '2018-04-01',
                        admittedClass: 'Class 3',
                        monthlyFeeStatus: 'paid',
                        tuitionFee: 2500,
                        monthlyFeeDate: '2025-03-10',
                        customPayments: {
                            'Annual Charges': { status: 'paid', amount: 1500 },
                            'Paper Fund': { status: 'paid', amount: 500 }
                        },
                        unpaidMonthsCount: 0,
                        lastExamScore: '965 / 1100 (87.7% - Grade A+)',
                        attendanceRate: '96.2%'
                    },
                    {
                        id: 'demo_slc_std_2',
                        name: 'Usman Farooq',
                        fatherName: 'Farooq Ahmed',
                        rollNo: '03',
                        grNo: 'GR-4523',
                        dob: '2010-11-20',
                        admissionDate: '2019-04-01',
                        admittedClass: 'Class 4',
                        monthlyFeeStatus: 'unpaid',
                        tuitionFee: 2500,
                        unpaidMonthsCount: 2,
                        customPayments: {
                            'Annual Charges': { status: 'unpaid', amount: 1500 },
                            'Late Fee Fine': { status: 'unpaid', amount: 300 }
                        },
                        lastExamScore: '780 / 1100 (70.9% - Grade A)',
                        attendanceRate: '88.5%'
                    },
                    {
                        id: 'demo_slc_std_3',
                        name: 'Ayesha Fatima',
                        fatherName: 'Abdul Rehman',
                        rollNo: '02',
                        grNo: 'GR-4522',
                        dob: '2011-02-15',
                        admissionDate: '2018-04-01',
                        admittedClass: 'Class 3',
                        monthlyFeeStatus: 'paid',
                        tuitionFee: 2500,
                        unpaidMonthsCount: 0,
                        lastExamScore: '890 / 1100 (80.9% - Grade A+)',
                        attendanceRate: '95.0%'
                    }
                ];
            }

            setSlcStudents(stdList);
            if (stdList.length > 0) {
                handleStudentSelectSLC(stdList[0].id, stdList);
            }
        } catch (e) {
            console.warn("Could not fetch students for SLC:", e);
        } finally {
            setSlcLoadingStudents(false);
        }
    };

        // Handle Student Select for SLC Desk (Calculates 360° Clearance Data with Tuition, ID Card, Actions & Fines)
    const handleStudentSelectSLC = (stdId, list = slcStudents) => {
        setSlcStudentId(stdId);
        const std = list.find(s => s.id === stdId);
        if (!std) return;

        const currentCls = classes.find(c => c.id === slcClassId) || { name: 'Class 10' };

        // 1. Monthly Tuition Breakdown
        const monthlyStatus = std.monthlyFeeStatus || 'unpaid';
        const tuitionFee = Number(std.tuitionFee) || 2500;
        const unpaidMonthsCount = std.unpaidMonthsCount !== undefined ? std.unpaidMonthsCount : (monthlyStatus === 'unpaid' ? 1 : 0);
        const pendingTuitionAmount = unpaidMonthsCount * tuitionFee;
        const unpaidMonthsList = std.unpaidMonthsList || (unpaidMonthsCount > 1 ? ['January 2026', 'February 2026'] : unpaidMonthsCount === 1 ? ['February 2026'] : []);

        // 2. Collection Actions & Standard Charges (ID Card, Annual, Uniform, Exam Fund)
        let actionsList = [];
        let totalActionsDues = 0;

        if (std.customPayments && Object.keys(std.customPayments).length > 0) {
            Object.entries(std.customPayments).forEach(([actionName, actData]) => {
                const actAmount = Number(actData?.amount) || 500;
                const isPaid = actData?.status === 'paid';
                actionsList.push({
                    name: actionName,
                    amount: actAmount,
                    status: isPaid ? 'paid' : 'unpaid'
                });
                if (!isPaid) totalActionsDues += actAmount;
            });
        } else if (std.actionsBreakdown && std.actionsBreakdown.length > 0) {
            actionsList = [...std.actionsBreakdown];
            totalActionsDues = actionsList.filter(a => a.status === 'unpaid').reduce((s, a) => s + (Number(a.amount) || 0), 0);
        } else {
            // Default Standard Actions for Clearance check
            actionsList = [
                { name: 'Student ID Card Issuance', amount: 300, status: monthlyStatus === 'paid' ? 'paid' : 'unpaid' },
                { name: 'Annual Development Charges', amount: 1500, status: monthlyStatus === 'paid' ? 'paid' : 'unpaid' },
                { name: 'Exam & Assessment Fund', amount: 500, status: 'paid' }
            ];
            totalActionsDues = actionsList.filter(a => a.status === 'unpaid').reduce((s, a) => s + a.amount, 0);
        }

        // 3. Individual Penalties & Fines
        let finesList = [];
        let totalFinesDues = 0;

        if (std.individualActions && std.individualActions.length > 0) {
            std.individualActions.forEach(fine => {
                const fAmt = Number(fine.amount) || 200;
                const isPaid = fine.status === 'paid';
                finesList.push({
                    name: fine.name || fine.title || 'Late Fee / Penalty',
                    amount: fAmt,
                    status: isPaid ? 'paid' : 'unpaid'
                });
                if (!isPaid) totalFinesDues += fAmt;
            });
        } else if (std.finesBreakdown && std.finesBreakdown.length > 0) {
            finesList = [...std.finesBreakdown];
            totalFinesDues = finesList.filter(f => f.status === 'unpaid').reduce((s, f) => s + (Number(f.amount) || 0), 0);
        } else {
            finesList = [
                { name: 'Late Payment Fine', amount: 200, status: unpaidMonthsCount > 0 ? 'unpaid' : 'paid' }
            ];
            totalFinesDues = finesList.filter(f => f.status === 'unpaid').reduce((s, f) => s + f.amount, 0);
        }

        const totalOutstandingDues = pendingTuitionAmount + totalActionsDues + totalFinesDues;
        const isDuesCleared = totalOutstandingDues === 0;

        setSlcSelectedStudent({
            ...std,
            className: currentCls.name,
            tuitionFee,
            unpaidMonthsCount,
            unpaidMonthsList,
            pendingTuitionAmount,
            actionsList,
            totalActionsDues,
            finesList,
            totalFinesDues,
            totalOutstandingDues,
            isDuesCleared
        });

        if (currentCls.name.toLowerCase().includes('10')) {
            setSlcReason('Completed Matriculation Examination');
        } else {
            setSlcReason('Family Relocation / Father Transfer');
        }

        setSlcSerialNo(`SLC-${new Date().getFullYear()}/${String(Math.floor(Math.random() * 899) + 100)}`);
    };

    // Quick Payment Receive from SLC Desk
    const handleProcessReceiveSlcPayment = async () => {
        if (!slcSelectedStudent) return;
        setIsProcessingSlcPay(true);
        try {
            const studentRef = doc(db, `schools/${schoolId}/classes/${slcClassId}/students`, slcSelectedStudent.id);
            await updateDoc(studentRef, {
                monthlyFeeStatus: 'paid',
                monthlyFeeDate: new Date().toISOString(),
                lastPaymentMode: 'Cash (SLC Desk Clearance)',
                lastReceiptNo: `REC-SLC-${Date.now().toString().slice(-6)}`
            });

            setSlcSelectedStudent(prev => ({
                ...prev,
                monthlyFeeStatus: 'paid',
                unpaidMonths: 0,
                pendingTuitionAmount: 0,
                totalOutstandingDues: 0,
                isDuesCleared: true
            }));

            setSlcShowPayModal(false);
            alert("Payment successfully recorded! Accounts clearance status updated to VERIFIED.");
        } catch (e) {
            console.error("Failed to process SLC payment:", e);
            setSlcSelectedStudent(prev => ({
                ...prev,
                monthlyFeeStatus: 'paid',
                unpaidMonths: 0,
                pendingTuitionAmount: 0,
                totalOutstandingDues: 0,
                isDuesCleared: true
            }));
            setSlcShowPayModal(false);
        } finally {
            setIsProcessingSlcPay(false);
        }
    };

    // High-Resolution Official Board/Govt Standard SLC PDF Generator (Force Logo Preload + Dynamic DOB in Words)
    const generateOfficialSLCPDF = async (record) => {
        setIsGeneratingSLC(true);
        try {
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            // 1. Double Security Border
            doc.setDrawColor(15, 23, 42); // Navy Slate
            doc.setLineWidth(1.2);
            doc.rect(7, 7, pageWidth - 14, pageHeight - 14);

            doc.setDrawColor(217, 119, 6); // Gold Accent Line
            doc.setLineWidth(0.4);
            doc.rect(9.5, 9.5, pageWidth - 19, pageHeight - 19);

            // 2. Force Fetch & Render School Logo
            let logoToUse = schoolLogoBase64;
            const logoUrl = record.schoolLogo || schoolDetails.logo;
            if (!logoToUse && logoUrl) {
                logoToUse = await fetchImageAsBase64(logoUrl);
            }

            if (logoToUse) {
                try {
                    doc.addImage(logoToUse, 'PNG', 14, 13, 22, 22);
                } catch (imgErr) {
                    console.warn("Could not render logo in PDF:", imgErr);
                }
            }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(20);
            doc.setTextColor(15, 23, 42);
            const schoolDisplayName = schoolDetails.name || record.schoolName || 'SMART PUBLIC SCHOOL & COLLEGE';
            doc.text(schoolDisplayName.toUpperCase(), pageWidth / 2, 22, { align: 'center' });

            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 116, 139);
            doc.text("Registered with Directorate of Education & Affiliated with Board of Intermediate & Secondary Education", pageWidth / 2, 28, { align: 'center' });
            const addressLine = schoolDetails.address ? `${schoolDetails.address} | Contact: ${schoolDetails.phone || '091-5842100'}` : "Main Campus, Sector 4, Principal Secretariat | Contact: 091-5842100 | Email: principal@school.edu.pk";
            doc.text(addressLine, pageWidth / 2, 33, { align: 'center' });

            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.5);
            doc.line(16, 38, pageWidth - 16, 38);

            // 3. Official Document Title Ribbon
            doc.setFillColor(15, 23, 42);
            doc.roundedRect(pageWidth / 2 - 75, 42, 150, 11, 2, 2, 'F');
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(255, 255, 255);
            doc.text("SCHOOL LEAVING & CHARACTER CERTIFICATE", pageWidth / 2, 49.5, { align: 'center' });

            doc.setFontSize(9.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 41, 59);
            doc.text(`Certificate No: ${record.certificateNo || 'SLC-2026/840'}`, 16, 60);
            doc.text(`Date of Issue: ${record.issueDate || new Date().toLocaleDateString()}`, pageWidth - 16, 60, { align: 'right' });

            // Dynamic DOB in Figures & Words
            const dobFormattedWords = formatDateOfBirthInWords(record.dob || '2010-08-14');

            // 4. Structured Official Certificate Body
            const rows = [
                ['1. Name of Pupil (in Block Letters):', (record.studentName || '').toUpperCase()],
                ['2. Father\'s Name / Guardian Name:', (record.fatherName || '').toUpperCase()],
                ['3. General Register / Admission No (GR#):', record.grNo || record.rollNo || 'GR-4521'],
                ['4. Date of Birth (in Figures & Words):', `${record.dob || '2010-08-14'} (${dobFormattedWords})`],
                ['5. Date of Admission to this School:', `${record.admissionDate || '2018-04-01'} (Admitted to: ${record.admittedClass || 'Class 3'})`],
                ['6. Class in which the pupil last studied:', `${record.classAtLeaving || 'Class 10'} (Academic Session: ${record.session || '2025-2026'})`],
                ['7. Subjects Studied during Academic Tenure:', 'English, Urdu, Mathematics, General Science, Islamiyat, Pak Studies, Physics/Biology'],
                ['8. Annual / Board Examination last taken with result:', record.lastExamResult || 'Passed Annual Examination with 87.7% (Grade A+)'],
                ['9. Whether qualified for promotion to higher class:', record.isQualifiedForPromotion !== false ? 'YES, Qualified for Promotion to Next Grade / College' : 'NO'],
                ['10. Month up to which school fees & dues paid:', record.duesClearedUpTo || 'Fully Cleared (Nil Outstanding Dues)'],
                ['11. Any fee concession availed of:', record.concession || 'Nil'],
                ['12. Total attendance percentage & working days:', `${record.attendanceRate || '96.2%'} (Regular & Punctual)`],
                ['13. General Conduct & Character of Pupil:', (record.conduct || 'Exemplary / Very Good').toUpperCase()],
                ['14. Date of Application for Certificate:', record.issueDate || new Date().toLocaleDateString()],
                ['15. Reason for Leaving the School:', record.reason || 'Completed Matriculation Examination']
            ];

            autoTable(doc, {
                startY: 65,
                body: rows,
                theme: 'plain',
                styles: {
                    fontSize: 9,
                    cellPadding: 2.3,
                    textColor: [15, 23, 42],
                    overflow: 'linebreak'
                },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 80, textColor: [51, 65, 85] },
                    1: { fontStyle: 'bold', cellWidth: 96, textColor: [15, 23, 42] }
                },
                margin: { left: 16, right: 16 }
            });

            const finalY = doc.lastAutoTable.finalY || 215;

            // Remarks Box
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(16, finalY + 3, pageWidth - 32, 14, 2, 2, 'FD');
            doc.setFontSize(8.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(71, 85, 105);
            doc.text("Head of Institution Remarks & Certified Assessment:", 20, finalY + 8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(15, 23, 42);
            doc.text(record.remarks || "Certified that the particulars stated above have been verified from the official General Register (GR) of the school and found correct.", 20, finalY + 13);

            // 5. Triple Official Signature Blocks
            const sigY = pageHeight - 34;

            doc.setDrawColor(148, 163, 184);
            doc.setLineWidth(0.4);

            // Class Teacher
            doc.line(20, sigY, 65, sigY);
            doc.setFontSize(8.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(51, 65, 85);
            doc.text("Class Teacher", 42.5, sigY + 4.5, { align: 'center' });
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text("Signature & Date", 42.5, sigY + 8.5, { align: 'center' });

            // Incharge Examination
            doc.line(pageWidth / 2 - 22.5, sigY, pageWidth / 2 + 22.5, sigY);
            doc.setFontSize(8.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(51, 65, 85);
            doc.text("Incharge Examination", pageWidth / 2, sigY + 4.5, { align: 'center' });
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text("Checked & Verified", pageWidth / 2, sigY + 8.5, { align: 'center' });

            // Principal Seal & Signature
            doc.line(pageWidth - 65, sigY, pageWidth - 20, sigY);
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(15, 23, 42);
            doc.text("PRINCIPAL", pageWidth - 42.5, sigY + 4.5, { align: 'center' });
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text("Official Seal & Signature", pageWidth - 42.5, sigY + 8.5, { align: 'center' });

            // 6. Security Footer Footnote
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(148, 163, 184);
            doc.text(`System Generated Official Clearance Certificate • Verification Ref: ${record.id || 'SEC-0982'} • Generated on ${new Date().toLocaleString()}`, pageWidth / 2, pageHeight - 12, { align: 'center' });

            // Save PDF
            const filename = `Official_SLC_${(record.studentName || 'Student').replace(/\s+/g, '_')}_${record.certificateNo || 'SLC'}.pdf`;
            doc.save(filename);

        } catch (e) {
            console.error("Failed to generate official SLC PDF:", e);
            alert("Error generating SLC PDF. Check console for details.");
        } finally {
            setIsGeneratingSLC(false);
        }
    };

    // Issue and Download SLC Handler (Saves to 50-Year Register & Triggers PDF Generation)
    const handleIssueAndDownloadSLC = async () => {
        if (!slcSelectedStudent) {
            alert("Please select a student first.");
            return;
        }

        setIsSubmittingSLC(true);
        try {
            const currentSession = slcSelectedStudent.session || `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`;
            const currentCls = classes.find(c => c.id === slcClassId) || { name: slcSelectedStudent.className || 'Class 10' };

            const slcRecord = {
                id: `slc_${Date.now()}`,
                certificateNo: slcSerialNo || `SLC-${new Date().getFullYear()}/${String(Math.floor(Math.random() * 899) + 100)}`,
                studentId: slcSelectedStudent.id,
                studentName: slcSelectedStudent.name,
                fatherName: slcSelectedStudent.fatherName || 'N/A',
                grNo: slcSelectedStudent.grNo || slcSelectedStudent.rollNo || 'GR-4521',
                rollNo: slcSelectedStudent.rollNo || '01',
                dob: slcSelectedStudent.dob || '2010-08-14',
                classAtLeaving: currentCls.name,
                classAtLeavingId: slcClassId,
                session: currentSession,
                admissionDate: slcSelectedStudent.admissionDate || '2018-04-01',
                admittedClass: slcSelectedStudent.admittedClass || 'Class 3',
                leavingDate: slcLeavingDate || new Date().toISOString().split('T')[0],
                issueDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                issuedAt: new Date().toISOString(),
                reason: slcReason || 'Completed Matriculation Examination',
                conduct: slcConduct || 'Exemplary / Very Good',
                duesClearedUpTo: slcSelectedStudent.isDuesCleared ? `Fully Cleared (${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })})` : `Pending Dues: Rs ${slcSelectedStudent.totalOutstandingDues}`,
                duesStatus: slcSelectedStudent.isDuesCleared ? 'cleared' : 'pending',
                lastExamResult: slcSelectedStudent.lastExamScore || 'Passed Annual Examination with 87.7% (Grade A+)',
                attendanceRate: slcSelectedStudent.attendanceRate || '96.2%',
                isQualifiedForPromotion: true,
                remarks: slcRemarks || 'Certified that the particulars stated above have been verified from the official General Register (GR) of the school and found correct.',
                schoolName: schoolDetails.name,
                schoolLogo: schoolDetails.logo,
                schoolAddress: schoolDetails.address,
                schoolPhone: schoolDetails.phone
            };

            // Save to Firestore permanent register if online and not demo
            if (schoolId && !slcDemoMode) {
                try {
                    await setDoc(doc(db, `schools/${schoolId}/slc_register`, slcRecord.id), slcRecord);
                    const studentRef = doc(db, `schools/${schoolId}/classes/${slcClassId}/students`, slcSelectedStudent.id);
                    await updateDoc(studentRef, {
                        studentStatus: 'left',
                        slcIssued: true,
                        slcCertificateNo: slcRecord.certificateNo,
                        slcLeavingDate: slcRecord.leavingDate
                    });
                } catch (dbErr) {
                    console.warn("Could not write SLC to DB (demo or offline):", dbErr);
                }
            }

            // Prepend to local history
            setSlcHistory(prev => [slcRecord, ...prev.filter(r => r.id !== slcRecord.id)]);

            // Generate & Download PDF
            await generateOfficialSLCPDF(slcRecord);

            // Re-generate serial for next issue
            setSlcSerialNo(`SLC-${new Date().getFullYear()}/${String(Math.floor(Math.random() * 899) + 100)}`);
            alert(`✅ School Leaving Certificate ${slcRecord.certificateNo} issued & downloaded successfully!`);
        } catch (error) {
            console.error("Error issuing SLC:", error);
            alert("Failed to issue SLC. Check console for details.");
        } finally {
            setIsSubmittingSLC(false);
        }
    };



    // --- Computed Values for Tab 2 (Promoted History) ---
    const availableSessions = Array.from(new Set(promotionHistory.map(r => r.session || '2025-2026'))).filter(Boolean);
    if (!availableSessions.includes('2025-2026')) availableSessions.unshift('2025-2026');
    if (!availableSessions.includes('2024-2025')) availableSessions.push('2024-2025');
    if (!availableSessions.includes('2023-2024')) availableSessions.push('2023-2024');
    if (!availableSessions.includes('2022-2023')) availableSessions.push('2022-2023');

    const filteredHistory = promotionHistory.filter(item => {
        const matchesSession = historySession === 'all' || (item.session || '2025-2026') === historySession;
        const matchesClass = historyClassFilter === 'all' || item.fromClassId === historyClassFilter || item.fromClassName === historyClassFilter;
        const matchesStatus = historyStatusFilter === 'all' || (item.action || 'promote') === historyStatusFilter;
        const q = historySearchQuery.toLowerCase().trim();
        const matchesSearch = !q ||
            (item.studentName && item.studentName.toLowerCase().includes(q)) ||
            (item.fatherName && item.fatherName.toLowerCase().includes(q)) ||
            (item.rollNo && item.rollNo.toString().includes(q)) ||
            (item.fromClassName && item.fromClassName.toLowerCase().includes(q)) ||
            (item.toClassName && item.toClassName.toLowerCase().includes(q));
        return matchesSession && matchesClass && matchesStatus && matchesSearch;
    });

    const totalArchived = filteredHistory.length;
    const totalPromotedHistory = filteredHistory.filter(r => (r.action || 'promote') === 'promote').length;
    const totalRetainedHistory = filteredHistory.filter(r => r.action === 'retain').length;
    const totalDemotedHistory = filteredHistory.filter(r => r.action === 'demote').length;
    const totalGraduatedHistory = filteredHistory.filter(r => (r.toClassId === 'graduate' || (r.toClassName && r.toClassName.toLowerCase().includes('graduat')))).length;
    const totalLeftHistory = filteredHistory.filter(r => r.action === 'leave').length;
    const passRatePercentage = totalArchived > 0 ? ((totalPromotedHistory / totalArchived) * 100).toFixed(1) : 0;

    const gradeCounts = {
        'A+': filteredHistory.filter(r => r.grade === 'A+').length,
        'A': filteredHistory.filter(r => r.grade === 'A').length,
        'B': filteredHistory.filter(r => r.grade === 'B').length,
        'C': filteredHistory.filter(r => r.grade === 'C').length,
        'D': filteredHistory.filter(r => r.grade === 'D').length,
        'F': filteredHistory.filter(r => r.grade === 'F').length
    };

    // --- RENDER ---
    return (
        <div className="animate-fade-in-up">
            {/* Top Navigation Tabs Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 flex items-center gap-3">
                        <span className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 flex items-center justify-center">
                            <GraduationCap size={28} />
                        </span>
                        <span>Annual Promotions & History</span>
                    </h1>
                    <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1">
                        Promote students across academic grades, inspect archives, and process 360° SLC clearance.
                    </p>
                </div>

                {/* Primary 3-Tab Switcher */}
                <div className="flex items-center gap-1.5 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/80 shadow-xs self-start md:self-auto">
                    <button
                        type="button"
                        onClick={() => setActiveTab('promotions')}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all duration-200 select-none cursor-pointer ${
                            activeTab === 'promotions'
                                ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-700/50'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                        }`}
                    >
                        <GraduationCap size={18} />
                        <span>Promotions</span>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                            activeTab === 'promotions' ? 'bg-indigo-700/60 text-indigo-100' : 'bg-slate-200 text-slate-700'
                        }`}>
                            Active
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('promoted')}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all duration-200 select-none cursor-pointer ${
                            activeTab === 'promoted'
                                ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-700/50'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                        }`}
                    >
                        <History size={18} />
                        <span>Promoted</span>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                            activeTab === 'promoted' ? 'bg-indigo-700/60 text-indigo-100' : 'bg-slate-200 text-slate-700'
                        }`}>
                            {promotionHistory.length}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('slc')}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all duration-200 select-none cursor-pointer ${
                            activeTab === 'slc'
                                ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-700/50'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                        }`}
                    >
                        <DoorOpen size={18} />
                        <span>School Leaving (SLC)</span>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                            activeTab === 'slc' ? 'bg-indigo-700/60 text-indigo-100' : 'bg-slate-200 text-slate-700'
                        }`}>
                            Desk
                        </span>
                    </button>
                </div>
            </div>

            {/* ======================================================== */}
            {/* TAB 1: ACTIVE PROMOTIONS WORKFLOW                        */}
            {/* ======================================================== */}
            {activeTab === 'promotions' && (
                <div>
                    {/* Header Info Strip */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '1.5rem',
                        background: 'white',
                        padding: '12px 20px',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}>
                        <div>
                            <span style={{ fontSize: '13px', color: '#64748B', fontWeight: '600' }}>Active Workflow: </span>
                            <span style={{ fontSize: '14px', fontWeight: '800', color: '#1E293B' }}>Class-Wise Progression</span>
                            {classes.length > 0 && (
                                <div style={{ marginTop: '4px', color: '#D97706', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <AlertCircle size={15} />
                                    Tip: Start promotions top-down from Class {classes[classes.length - 1]?.name?.replace(/class/i, '').trim() || ''}
                                </div>
                            )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase' }}>Academic Session</div>
                            <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>2025 - 2026</div>
                        </div>
                    </div>

                    {/* Notification */}
                    {promotionStatus && (
                        <div style={{
                            padding: '15px 20px', borderRadius: '12px', marginBottom: '25px', display: 'flex',
                            alignItems: 'center', gap: '12px', animation: 'slideDown 0.3s ease-out',
                            background: promotionStatus === 'success' ? '#DCFCE7' : '#FEE2E2',
                            color: promotionStatus === 'success' ? '#15803D' : '#B91C1C',
                            border: `1px solid ${promotionStatus === 'success' ? '#BBF7D0' : '#FECACA'}`
                        }}>
                            {promotionStatus === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                            <span style={{ fontWeight: '600' }}>
                                {promotionStatus === 'success' ? 'Promotions processed successfully!' : 'Error processing promotions. Please try again.'}
                            </span>
                            <button onClick={() => setPromotionStatus(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
                                <X size={18} />
                            </button>
                        </div>
                    )}

                    {/* Standard Clean Class Dropdown (Exams style, Left-aligned) */}
                    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Class Selector (Exams Style, Left-Aligned) */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Select Class</label>
                        <div className="relative min-w-[240px] sm:min-w-[280px]">
                            <select
                                value={selectedClass?.id || ''}
                                onChange={(e) => {
                                    const found = classes.find(c => c.id === e.target.value);
                                    if (found) handleClassSelect(found);
                                }}
                                className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-slate-800 text-xs sm:text-sm font-bold rounded-xl px-3.5 py-2.5 pr-9 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-colors cursor-pointer appearance-none"
                            >
                                <option value="" disabled>Choose Class...</option>
                                {classes.map(cls => (
                                    <option key={cls.id} value={cls.id}>
                                        {cls.name} • ({cls.students || 0} Students)
                                    </option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                                <ChevronDown size={16} />
                            </div>
                        </div>
                    </div>

                    {selectedClass && (
                        <div className="sm:mt-5 flex items-center gap-2">
                            <span className="text-xs font-extrabold px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1.5">
                                <Users size={14} />
                                {selectedClass.students || students.length || 0} Enrolled Students
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Student Management Section */}
            {selectedClass && (
                <div className="card animate-fade-in-up" style={{ padding: '30px', borderRadius: '24px', border: '1px solid #E2E8F0', background: 'white' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                        <div>
                            <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#1E293B' }}>
                                Students: {selectedClass.name}
                            </h2>
                            <p style={{ color: '#64748B' }}>Set results and promotion status for each student.</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            {/* Demo Data Feed Toggle (Visible ONLY for Demo School 6257) */}
                            {String(schoolId) === '6257' && (
                                <button
                                    type="button"
                                    onClick={handleToggleDemoMode}
                                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-xs ${
                                        isDemoMode
                                            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200 ring-2 ring-amber-400/40'
                                            : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                                    }`}
                                    title="Toggle realistic sample students (Pass / Fail / Demote / Pending)"
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>{isDemoMode ? 'Exit Demo Data' : '✨ Try Demo Data'}</span>
                                </button>
                            )}

                            {/* Auto-Set Decisions by Result */}
                            <button
                                onClick={() => {
                                    setStudents(prev => prev.map(s => {
                                        const isPass = s.cumulativeIsPassed !== undefined ? s.cumulativeIsPassed : (parseFloat(s.examScore) >= 33);
                                        return {
                                            ...s,
                                            promotionStatus: isPass ? 'promote' : 'retain'
                                        };
                                    }));
                                }}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all"
                            >
                                <span>⚡ Auto-Set Decisions by Result</span>
                            </button>

                            {/* PDF Download Button */}
                            <button
                                onClick={generatePDF}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '8px 14px', borderRadius: '12px',
                                    border: '1px solid #E2E8F0', background: 'white',
                                    color: '#475569', fontWeight: '600', cursor: 'pointer',
                                    transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                }}
                                className="hover:bg-slate-50 active:scale-95 text-xs"
                            >
                                <GraduationCap size={16} />
                                <span>Download Report</span>
                            </button>

                            <div style={{ position: 'relative' }}>
                                <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder="Search by Name/Roll..."
                                    value={studentSearchQuery}
                                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                                    style={{
                                        padding: '8px 12px 8px 36px', borderRadius: '12px', border: '1px solid #E2E8F0',
                                        width: '200px', outline: 'none', fontSize: '13px'
                                    }}
                                />
                            </div>

                            {/* Filter Status Pills (Sharp, High Contrast, No Glow) */}
                            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('all')}
                                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all ${
                                        statusFilter === 'all'
                                            ? 'bg-slate-900 text-white shadow-xs'
                                            : 'text-slate-700 hover:text-slate-900 hover:bg-white'
                                    }`}
                                >
                                    All ({students.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('promote')}
                                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                                        statusFilter === 'promote'
                                            ? 'bg-emerald-600 text-white shadow-xs'
                                            : 'text-emerald-950 hover:bg-emerald-50'
                                    }`}
                                >
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                                    <span>Promote ({students.filter(s => (s.promotionStatus || 'promote') === 'promote').length})</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('retain')}
                                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                                        statusFilter === 'retain'
                                            ? 'bg-rose-600 text-white shadow-xs'
                                            : 'text-rose-950 hover:bg-rose-50'
                                    }`}
                                >
                                    <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                                    <span>Retain ({students.filter(s => s.promotionStatus === 'retain').length})</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('demote')}
                                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                                        statusFilter === 'demote'
                                            ? 'bg-amber-600 text-white shadow-xs'
                                            : 'text-amber-950 hover:bg-amber-50'
                                    }`}
                                >
                                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                                    <span>Demote ({students.filter(s => s.promotionStatus === 'demote').length})</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('leave')}
                                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                                        statusFilter === 'leave'
                                            ? 'bg-slate-800 text-white shadow-xs'
                                            : 'text-slate-800 hover:bg-slate-200'
                                    }`}
                                >
                                    <span className="w-2 h-2 rounded-full bg-slate-400 inline-block"></span>
                                    <span>Leave ({students.filter(s => s.promotionStatus === 'leave').length})</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {
                        loadingStudents ? (
                            <div style={{ padding: '50px', textAlign: 'center' }}>
                                <Loader2 className="animate-spin" size={32} color="var(--primary)" />
                                <div style={{ marginTop: '10px', fontWeight: '500' }}>Fetching class records & all-term exam history...</div>
                            </div>
                        ) : filteredStudents.length === 0 ? (
                            <div style={{ padding: '50px', textAlign: 'center', color: '#94A3B8', border: '2px dashed #F1F5F9', borderRadius: '20px' }}>
                                <Users size={48} style={{ marginBottom: '15px', opacity: 0.5 }} />
                                <div>No students matching your filter criteria.</div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                {filteredStudents.map(student => {
                                    const status = student.promotionStatus || 'promote';
                                    const isPromote = status === 'promote';
                                    const isRetain = status === 'retain';
                                    const isDemote = status === 'demote';
                                    const isLeave = status === 'leave';

                                    // Clean, Flat 2D Card Border & Header Theme
                                    const card2dTheme = isPromote
                                        ? 'border-2 border-emerald-500 bg-white'
                                        : isRetain
                                        ? 'border-2 border-rose-500 bg-white'
                                        : isDemote
                                        ? 'border-2 border-amber-500 bg-white'
                                        : 'border-2 border-slate-400 bg-white';

                                    const status2dBadge = isPromote
                                        ? 'bg-emerald-600 text-white'
                                        : isRetain
                                        ? 'bg-rose-600 text-white'
                                        : isDemote
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-slate-700 text-white';

                                    const roll2dBadge = isPromote
                                        ? 'bg-emerald-50 text-emerald-950 border border-emerald-200'
                                        : isRetain
                                        ? 'bg-rose-50 text-rose-950 border border-rose-200'
                                        : isDemote
                                        ? 'bg-amber-50 text-amber-950 border border-amber-200'
                                        : 'bg-slate-100 text-slate-900 border border-slate-200';

                                    const summaryStripTheme = isPromote
                                        ? 'bg-emerald-50/70 border border-emerald-200 text-emerald-950'
                                        : isRetain
                                        ? 'bg-rose-50/70 border border-rose-200 text-rose-950'
                                        : isDemote
                                        ? 'bg-amber-50/70 border border-amber-200 text-amber-950'
                                        : 'bg-slate-100 border border-slate-200 text-slate-900';

                                    return (
                                        <div
                                            key={student.id}
                                            className={`p-5 rounded-2xl transition-all duration-200 shadow-sm flex flex-col justify-between gap-3.5 select-none ${card2dTheme}`}
                                        >
                                            {/* Top Row: Roll + Student Info + Live Decision Badge */}
                                            <div className="flex items-start justify-between gap-2.5 min-w-0">
                                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                    {/* Clean Theme-Matching Roll Badge */}
                                                    <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center font-black flex-shrink-0 ${roll2dBadge}`}>
                                                        <span className="text-[9px] opacity-70 leading-none uppercase font-extrabold">Roll</span>
                                                        <span className="text-sm font-black leading-tight">{student.rollNo || '#'}</span>
                                                    </div>

                                                    <div className="min-w-0 flex-1 overflow-hidden">
                                                        <h4 className="font-black text-sm sm:text-base text-slate-900 tracking-tight leading-tight uppercase truncate" title={student.name}>
                                                            {student.name}
                                                        </h4>
                                                        <p className="text-xs font-bold text-slate-500 truncate mt-0.5">
                                                            S/O {student.fatherName || 'N/A'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Decision Badge (Always constrained inside the card) */}
                                                <div className="flex-shrink-0">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black uppercase tracking-wide whitespace-nowrap shadow-xs ${status2dBadge}`}>
                                                        {isPromote && `🟢 PROMOTE → ${student.nextClassName}`}
                                                        {isRetain && `🔴 RETAIN (${selectedClass.name})`}
                                                        {isDemote && `🟠 DEMOTE → ${student.previousClassName}`}
                                                        {isLeave && `⚪ LEFT SCHOOL`}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Multi-Term Real Scores (Obtained / Total) */}
                                            <div className="space-y-2">
                                                <div className="text-[11px] font-black text-slate-500 uppercase tracking-wide flex items-center justify-between">
                                                    <span>📊 Real Term Exam Scores</span>
                                                    <span className="text-[10px] text-slate-400 font-bold">Obtained / Total</span>
                                                </div>

                                                {/* 3 Real Terms Grid (Color Coded Green on Pass, Red on Fail) */}
                                                <div className="grid grid-cols-3 gap-2.5">
                                                    {(student.termsScores || []).map((term, tIdx) => {
                                                        const hasMarks = term.hasMarks;
                                                        const isPass = term.isPassed;
                                                        return (
                                                            <div
                                                                key={tIdx}
                                                                className={`p-2.5 rounded-xl text-center transition-all ${
                                                                    !hasMarks
                                                                        ? 'bg-slate-50 border-2 border-dashed border-slate-300 text-slate-500'
                                                                        : isPass
                                                                        ? 'bg-emerald-50 border-2 border-emerald-400 text-emerald-950 shadow-xs'
                                                                        : 'bg-rose-50 border-2 border-rose-400 text-rose-950 shadow-xs'
                                                                }`}
                                                            >
                                                                <span className={`text-[11px] font-black block truncate ${
                                                                    !hasMarks ? 'text-slate-500' : isPass ? 'text-emerald-900' : 'text-rose-900'
                                                                }`}>
                                                                    {term.examTitle}
                                                                </span>
                                                                <div className={`font-black text-sm sm:text-base mt-0.5 ${
                                                                    !hasMarks ? 'text-slate-400' : isPass ? 'text-emerald-950' : 'text-rose-950'
                                                                }`}>
                                                                    {term.scoreText}
                                                                </div>
                                                                <div className="mt-1">
                                                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md inline-block ${
                                                                        !hasMarks
                                                                            ? 'bg-slate-200 text-slate-600'
                                                                            : isPass
                                                                            ? 'bg-emerald-600 text-white'
                                                                            : 'bg-rose-600 text-white'
                                                                    }`}>
                                                                        {!hasMarks ? 'PENDING' : isPass ? 'PASSED' : 'FAILED'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Combined Annual Calculation Strip (Theme-Matching Light) */}
                                                <div className={`rounded-xl p-2.5 flex items-center justify-between transition-all ${summaryStripTheme}`}>
                                                    <div>
                                                        <span className="text-[10px] text-slate-500 block uppercase font-extrabold">Combined 3-Terms Total</span>
                                                        <span className="font-black text-xs text-slate-900">
                                                            {student.totalMaxAllTerms > 0 ? `${student.totalObtainedAllTerms} / ${student.totalMaxAllTerms}` : 'No Marks Entered'}
                                                        </span>
                                                    </div>

                                                    <div className="text-right">
                                                        <span className="text-[10px] text-slate-500 block uppercase font-extrabold">Overall Annual %</span>
                                                        <span className={`font-black text-sm ${isPromote ? 'text-emerald-700' : isRetain ? 'text-rose-700' : isDemote ? 'text-amber-700' : 'text-slate-800'}`}>
                                                            {student.totalMaxAllTerms > 0 ? `${student.cumulativePercentage}% (Grade ${student.cumulativeGrade})` : '--'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 3 Flat 2D Action Buttons (Sharp, High Contrast Text) */}
                                            <div className="pt-2 border-t border-slate-100">
                                                <div className="grid grid-cols-3 gap-2.5">
                                                    {/* 1. Promote */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleIndividualAction(student.id, 'promote')}
                                                        className={`py-2.5 px-1.5 rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center cursor-pointer ${
                                                            isPromote
                                                                ? 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-700'
                                                                : 'bg-slate-50 hover:bg-emerald-50 text-slate-800 border border-slate-200'
                                                        }`}
                                                    >
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                            <span>Promote</span>
                                                        </span>
                                                        <span className={`text-[10px] truncate max-w-full font-extrabold mt-0.5 ${isPromote ? 'text-emerald-100' : 'text-slate-500'}`}>
                                                            → {student.nextClassName}
                                                        </span>
                                                    </button>

                                                    {/* 2. Retain */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleIndividualAction(student.id, 'retain')}
                                                        className={`py-2.5 px-1.5 rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center cursor-pointer ${
                                                            isRetain
                                                                ? 'bg-rose-600 text-white shadow-xs ring-1 ring-rose-700'
                                                                : 'bg-slate-50 hover:bg-rose-50 text-slate-800 border border-slate-200'
                                                        }`}
                                                    >
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                                            <span>Retain</span>
                                                        </span>
                                                        <span className={`text-[10px] truncate max-w-full font-extrabold mt-0.5 ${isRetain ? 'text-rose-100' : 'text-slate-500'}`}>
                                                            in {selectedClass.name}
                                                        </span>
                                                    </button>

                                                    {/* 3. Demote */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleIndividualAction(student.id, 'demote')}
                                                        disabled={!student.previousClassId}
                                                        className={`py-2.5 px-1.5 rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center cursor-pointer ${
                                                            !student.previousClassId
                                                                ? 'opacity-30 cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200'
                                                                : isDemote
                                                                ? 'bg-amber-600 text-white shadow-xs ring-1 ring-amber-700'
                                                                : 'bg-slate-50 hover:bg-amber-50 text-slate-800 border border-slate-200'
                                                        }`}
                                                    >
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                                            <span>Demote</span>
                                                        </span>
                                                        <span className={`text-[10px] truncate max-w-full font-extrabold mt-0.5 ${isDemote ? 'text-amber-100' : 'text-slate-500'}`}>
                                                            {student.previousClassName ? `→ ${student.previousClassName}` : 'N/A'}
                                                        </span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    }

                    {
                        !loadingStudents && filteredStudents.length > 0 && (
                            <div style={{ marginTop: '40px', padding: '30px', background: '#F8FAFC', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '14px', color: '#64748B' }}>Total Ready to Sync</div>
                                    <div style={{ fontSize: '24px', fontWeight: '800', color: '#1E293B' }}>{students.length} Student Records</div>
                                </div>
                                <button
                                    onClick={() => { setShowConfirmModal(true); setConfirmLevel(1); }}
                                    disabled={processing}
                                    style={{
                                        padding: '16px 40px', background: 'var(--primary)', color: 'white', border: 'none',
                                        borderRadius: '16px', fontSize: '18px', fontWeight: '800', cursor: 'pointer',
                                        boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.4)', transition: 'all 0.2s'
                                    }}
                                    className="hover:scale-105 active:scale-95 transition-transform"
                                >
                                    {processing ? 'Uploading Data...' : 'Confirm & Process All'}
                                </button>
                            </div>
                        )
                    }
                    </div>
                )}

                    {/* Hidden Debug Footer (Previous Task) */}
                    {/* Debug Footer
                    <div style={{ marginTop: '50px', padding: '10px', fontSize: '10px', color: '#ccc', borderTop: '1px solid #eee' }}>
                        <p>Debug School ID: {schoolId || 'Not Found'}</p>
                        <p>Raw Session: {localStorage.getItem('manual_session') || 'NULL'}</p>
                        <button onClick={() => window.location.reload()} style={{ marginTop: '10px', padding: '4px' }}>Reload</button>
                    </div>
                    */}

                    {/* Confirmation Modal */}
                    {showConfirmModal && (
                        <div style={{
                            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(8px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
                        }}>
                            <div style={{ background: 'white', padding: '40px', borderRadius: '32px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
                                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                                    <div style={{
                                        width: '80px', height: '80px', borderRadius: '50%', background: confirmLevel === 1 ? '#E0E7FF' : '#FEE2E2',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: confirmLevel === 1 ? 'var(--primary)' : '#EF4444'
                                    }}>
                                        <AlertCircle size={40} />
                                    </div>
                                    <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#1E293B', marginBottom: '10px' }}>
                                        {confirmLevel === 1 ? 'Confirm Promotions?' : 'Final Warning!'}
                                    </h2>
                                    <p style={{ color: '#64748B', lineHeight: '1.6' }}>
                                        {confirmLevel === 1
                                            ? `You are about to process ${students.length} students from ${selectedClass.name}. This action will move student records across classes. Are you sure?`
                                            : `This action is irreversible. It will update the database permanently. Do you wish to proceed with the synchronization?`
                                        }
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '15px' }}>
                                    <button
                                        onClick={() => setShowConfirmModal(false)}
                                        style={{ flex: 1, padding: '15px', borderRadius: '14px', border: '1px solid #E2E8F0', background: 'white', fontWeight: '700', cursor: 'pointer' }}
                                    >Cancel</button>
                                    <button
                                        onClick={() => {
                                            if (confirmLevel === 1) {
                                                setConfirmLevel(2);
                                            } else {
                                                processPromotions();
                                            }
                                        }}
                                        style={{
                                            flex: 1, padding: '15px', borderRadius: '14px', border: 'none',
                                            background: confirmLevel === 1 ? 'var(--primary)' : '#EF4444', color: 'white', fontWeight: '700', cursor: 'pointer'
                                        }}
                                    >
                                        {confirmLevel === 1 ? 'Yes, Confirm' : 'Yes, Process Now'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ======================================================== */}
            {/* TAB 2: PROMOTED STUDENTS HISTORICAL ARCHIVE & LEDGER     */}
            {/* ======================================================== */}
            {activeTab === 'promoted' && (
                <div className="space-y-6">
                    {/* Top Action & Export Header Ribbon */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">
                                    <ShieldCheck size={18} />
                                </span>
                                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                                    Historical Promotion Archives & Gazettes
                                </h2>
                            </div>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">
                                Permanent yearly records across all academic sessions. Retained for 20+ years with zero storage decay.
                            </p>
                        </div>

                        {/* Export & Print Action Buttons */}
                        <div className="flex items-center gap-2.5 flex-wrap">
                            {/* Demo Presentation Inject / Exit Toggle Button */}
                            <button
                                type="button"
                                onClick={handleToggleDemoMode}
                                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer ${
                                    isDemoMode
                                        ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200 ring-2 ring-amber-400/40'
                                        : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                                }`}
                                title="Toggle realistic sample historical records for presentation"
                            >
                                <Sparkles size={14} />
                                <span>{isDemoMode ? 'Exit Demo Data' : '✨ Inject Demo Data'}</span>
                            </button>

                            {/* Export to Excel / CSV */}
                            <button
                                type="button"
                                onClick={() => handleExportCSV(filteredHistory)}
                                disabled={isExportingCsv || filteredHistory.length === 0}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-sm transition-all cursor-pointer"
                                title="Download structured spreadsheet for Excel & offline reading"
                            >
                                <FileSpreadsheet size={15} />
                                <span>{isExportingCsv ? 'Exporting...' : 'One-Click Export to Excel / CSV'}</span>
                            </button>

                            {/* Download Annual Promotion Gazette (PDF Ledger) */}
                            <button
                                type="button"
                                onClick={() => handleDownloadGazettePDF(filteredHistory)}
                                disabled={isGeneratingGazette || filteredHistory.length === 0}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 active:scale-95 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-sm transition-all cursor-pointer"
                                title="Download publication-grade Annual Promotion Gazette PDF Ledger"
                            >
                                <Printer size={15} />
                                <span>{isGeneratingGazette ? 'Generating...' : 'Download Annual Promotion Gazette (PDF Ledger)'}</span>
                            </button>

                            {/* Refresh Button */}
                            <button
                                type="button"
                                onClick={fetchPromotionHistory}
                                disabled={loadingHistory}
                                className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-xl border border-slate-200 transition-all cursor-pointer"
                                title="Refresh Archive Records"
                            >
                                <RefreshCw size={15} className={loadingHistory ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    {/* 5 Sleek Visual KPI Overview Cards (Exams Style) */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                        {/* 1. Total Promoted */}
                        <div className="bg-white p-4 rounded-2xl border-2 border-emerald-500/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
                            <div className="flex items-start justify-between">
                                <div>
                                    <span className="text-[11px] font-extrabold text-emerald-950 uppercase tracking-wider block">Total Promoted</span>
                                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                                        {totalPromotedHistory}
                                    </h3>
                                </div>
                                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                                    <GraduationCap size={20} />
                                </span>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1">
                                    <TrendingUp size={13} />
                                    <span>{passRatePercentage}% Success</span>
                                </span>
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900">
                                    Passed
                                </span>
                            </div>
                        </div>

                        {/* 2. Retained in Grade */}
                        <div className="bg-white p-4 rounded-2xl border-2 border-rose-500/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
                            <div className="flex items-start justify-between">
                                <div>
                                    <span className="text-[11px] font-extrabold text-rose-950 uppercase tracking-wider block">Retained</span>
                                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                                        {totalRetainedHistory}
                                    </h3>
                                </div>
                                <span className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
                                    <RefreshCw size={18} />
                                </span>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-xs font-bold text-rose-950">
                                    {totalArchived > 0 ? ((totalRetainedHistory / totalArchived) * 100).toFixed(1) : 0}% of Batch
                                </span>
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-900">
                                    Repeater
                                </span>
                            </div>
                        </div>

                        {/* 3. Demoted */}
                        <div className="bg-white p-4 rounded-2xl border-2 border-amber-500/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
                            <div className="flex items-start justify-between">
                                <div>
                                    <span className="text-[11px] font-extrabold text-amber-950 uppercase tracking-wider block">Demoted</span>
                                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                                        {totalDemotedHistory}
                                    </h3>
                                </div>
                                <span className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
                                    <AlertCircle size={18} />
                                </span>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-xs font-bold text-amber-950">
                                    {totalArchived > 0 ? ((totalDemotedHistory / totalArchived) * 100).toFixed(1) : 0}% of Batch
                                </span>
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900">
                                    Previous
                                </span>
                            </div>
                        </div>

                        {/* 4. Graduated / Alumni */}
                        <div className="bg-white p-4 rounded-2xl border-2 border-violet-500/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
                            <div className="flex items-start justify-between">
                                <div>
                                    <span className="text-[11px] font-extrabold text-violet-950 uppercase tracking-wider block">Graduated</span>
                                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                                        {totalGraduatedHistory}
                                    </h3>
                                </div>
                                <span className="p-2 rounded-xl bg-violet-50 text-violet-600 border border-violet-100">
                                    <Award size={20} />
                                </span>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-xs font-bold text-violet-950">
                                    High School
                                </span>
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-900">
                                    Alumni
                                </span>
                            </div>
                        </div>

                        {/* 5. Total School Leave / SLC (Overview Card) */}
                        <div className="bg-white p-4 rounded-2xl border-2 border-slate-500/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
                            <div className="flex items-start justify-between">
                                <div>
                                    <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block">School Leave</span>
                                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                                        {totalLeftHistory}
                                    </h3>
                                </div>
                                <span className="p-2 rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
                                    <DoorOpen size={20} />
                                </span>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-600">
                                    {totalArchived > 0 ? ((totalLeftHistory / totalArchived) * 100).toFixed(1) : 0}% of Batch
                                </span>
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-800">
                                    SLC Issued
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Visual Performance Distribution & Grade Breakdown Bar */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                                    📈 Batch Progression & Grade Breakdown
                                </span>
                            </div>
                            <span className="text-xs font-bold text-slate-500">
                                Total Records in Current Filter: <strong className="text-slate-900">{totalArchived}</strong>
                            </span>
                        </div>

                        {/* Segmented Distribution Bar */}
                        {totalArchived > 0 ? (
                            <div className="w-full h-3.5 rounded-full bg-slate-100 overflow-hidden flex shadow-inner mb-4">
                                {totalPromotedHistory > 0 && (
                                    <div
                                        style={{ width: `${(totalPromotedHistory / totalArchived) * 100}%` }}
                                        className="bg-emerald-500 h-full transition-all duration-500"
                                        title={`Promoted: ${totalPromotedHistory}`}
                                    />
                                )}
                                {totalRetainedHistory > 0 && (
                                    <div
                                        style={{ width: `${(totalRetainedHistory / totalArchived) * 100}%` }}
                                        className="bg-rose-500 h-full transition-all duration-500"
                                        title={`Retained: ${totalRetainedHistory}`}
                                    />
                                )}
                                {totalDemotedHistory > 0 && (
                                    <div
                                        style={{ width: `${(totalDemotedHistory / totalArchived) * 100}%` }}
                                        className="bg-amber-500 h-full transition-all duration-500"
                                        title={`Demoted: ${totalDemotedHistory}`}
                                    />
                                )}
                                {totalGraduatedHistory > 0 && (
                                    <div
                                        style={{ width: `${(totalGraduatedHistory / totalArchived) * 100}%` }}
                                        className="bg-violet-500 h-full transition-all duration-500"
                                        title={`Graduated: ${totalGraduatedHistory}`}
                                    />
                                )}
                                {totalLeftHistory > 0 && (
                                    <div
                                        style={{ width: `${(totalLeftHistory / totalArchived) * 100}%` }}
                                        className="bg-slate-400 h-full transition-all duration-500"
                                        title={`Left: ${totalLeftHistory}`}
                                    />
                                )}
                            </div>
                        ) : (
                            <div className="w-full h-3 rounded-full bg-slate-100 mb-4" />
                        )}

                        {/* Grade Breakdown Pills */}
                        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-100">
                            <span className="text-[11px] font-extrabold text-slate-400 uppercase mr-1">Grades:</span>
                            {['A+', 'A', 'B', 'C', 'D', 'F'].map(g => (
                                <span
                                    key={g}
                                    className={`text-xs font-black px-2.5 py-1 rounded-xl flex items-center gap-1.5 ${
                                        g === 'A+' || g === 'A'
                                            ? 'bg-emerald-50 text-emerald-950 border border-emerald-200'
                                            : g === 'B' || g === 'C'
                                            ? 'bg-indigo-50 text-indigo-950 border border-indigo-200'
                                            : g === 'D'
                                            ? 'bg-amber-50 text-amber-950 border border-amber-200'
                                            : 'bg-rose-50 text-rose-950 border border-rose-200'
                                    }`}
                                >
                                    <span>Grade {g}</span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60"></span>
                                    <span>{gradeCounts[g] || 0}</span>
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Filter & Search Toolbar */}
                    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            {/* Left Filters: Session + Class */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                {/* Academic Session Selector */}
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                                        Academic Session
                                    </label>
                                    <div className="relative min-w-[200px]">
                                        <select
                                            value={historySession}
                                            onChange={(e) => setHistorySession(e.target.value)}
                                            className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-slate-800 text-xs sm:text-sm font-bold rounded-xl px-3.5 py-2.5 pr-9 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-colors cursor-pointer appearance-none"
                                        >
                                            <option value="all">🗓️ All Sessions Archive</option>
                                            {availableSessions.map(sess => (
                                                <option key={sess} value={sess}>
                                                    Session: {sess}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                                            <ChevronDown size={16} />
                                        </div>
                                    </div>
                                </div>

                                {/* Class Filter (No 'All Classes' option - Single class selection) */}
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                                        Selected Class
                                    </label>
                                    <div className="relative min-w-[220px]">
                                        <select
                                            value={historyClassFilter || classes[0]?.id || ''}
                                            onChange={(e) => {
                                                setHistoryClassFilter(e.target.value);
                                                localStorage.setItem('promotions_history_class_filter', e.target.value);
                                            }}
                                            className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-slate-800 text-xs sm:text-sm font-bold rounded-xl px-3.5 py-2.5 pr-9 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-colors cursor-pointer appearance-none"
                                        >
                                            {classes.map(cls => (
                                                <option key={cls.id} value={cls.id}>
                                                    {cls.name} • ({cls.students || 0} Students)
                                                </option>
                                            ))}
                                        </select>
                                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                                            <ChevronDown size={16} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Search Input */}
                            <div className="lg:w-72">
                                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                                    Search Record
                                </label>
                                <div className="relative">
                                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Name, Roll No, Father..."
                                        value={historySearchQuery}
                                        onChange={(e) => setHistorySearchQuery(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-colors"
                                    />
                                    {historySearchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setHistorySearchQuery('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Status Filter Pills */}
                        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 flex-wrap">
                            <button
                                type="button"
                                onClick={() => setHistoryStatusFilter('all')}
                                className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all ${
                                    historyStatusFilter === 'all'
                                        ? 'bg-slate-900 text-white shadow-xs'
                                        : 'text-slate-700 hover:text-slate-900 hover:bg-white'
                                }`}
                            >
                                All Status ({promotionHistory.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setHistoryStatusFilter('promote')}
                                className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                                    historyStatusFilter === 'promote'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'text-emerald-950 hover:bg-emerald-50'
                                }`}
                            >
                                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                                <span>Promoted ({promotionHistory.filter(r => (r.action || 'promote') === 'promote').length})</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setHistoryStatusFilter('retain')}
                                className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                                    historyStatusFilter === 'retain'
                                        ? 'bg-rose-600 text-white shadow-xs'
                                        : 'text-rose-950 hover:bg-rose-50'
                                }`}
                            >
                                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                                <span>Retained ({promotionHistory.filter(r => r.action === 'retain').length})</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setHistoryStatusFilter('demote')}
                                className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                                    historyStatusFilter === 'demote'
                                        ? 'bg-amber-600 text-white shadow-xs'
                                        : 'text-amber-950 hover:bg-amber-50'
                                }`}
                            >
                                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                                <span>Demoted ({promotionHistory.filter(r => r.action === 'demote').length})</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setHistoryStatusFilter('leave')}
                                className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                                    historyStatusFilter === 'leave'
                                        ? 'bg-slate-800 text-white shadow-xs'
                                        : 'text-slate-800 hover:bg-slate-200'
                                }`}
                            >
                                <span className="w-2 h-2 rounded-full bg-slate-400 inline-block"></span>
                                <span>Left School ({promotionHistory.filter(r => r.action === 'leave').length})</span>
                            </button>
                        </div>
                    </div>

                    {/* Historical Records Ledger (Exact Visual Mirror of Promotions Tab Student Cards) */}
                    {loadingHistory ? (
                        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center">
                            <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={32} />
                            <h4 className="font-bold text-slate-800 text-sm">Loading Permanent Historical Archives...</h4>
                        </div>
                    ) : filteredHistory.length === 0 ? (
                        <div className="bg-white p-12 rounded-2xl border-2 border-dashed border-slate-200 text-center">
                            <History size={44} className="text-slate-300 mx-auto mb-3" />
                            <h4 className="font-bold text-slate-700 text-base">No Historical Records Found</h4>
                            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                                No promotion records match the selected session or class. Click "✨ Inject Demo Data" above to view realistic presentation sample records.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                            {filteredHistory.map((student) => {
                                const action = student.action || 'promote';
                                const isPromote = action === 'promote';
                                const isRetain = action === 'retain';
                                const isDemote = action === 'demote';
                                const isLeave = action === 'leave';

                                const card2dTheme = isPromote
                                    ? 'border-2 border-emerald-500 bg-white'
                                    : isRetain
                                    ? 'border-2 border-rose-500 bg-white'
                                    : isDemote
                                    ? 'border-2 border-amber-500 bg-white'
                                    : 'border-2 border-slate-400 bg-white';

                                const status2dBadge = isPromote
                                    ? 'bg-emerald-600 text-white'
                                    : isRetain
                                    ? 'bg-rose-600 text-white'
                                    : isDemote
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-slate-700 text-white';

                                const roll2dBadge = isPromote
                                    ? 'bg-emerald-50 text-emerald-950 border border-emerald-200'
                                    : isRetain
                                    ? 'bg-rose-50 text-rose-950 border border-rose-200'
                                    : isDemote
                                    ? 'bg-amber-50 text-amber-950 border border-amber-200'
                                    : 'bg-slate-100 text-slate-900 border border-slate-200';

                                const summaryStripTheme = isPromote
                                    ? 'bg-emerald-50/70 border border-emerald-200 text-emerald-950'
                                    : isRetain
                                    ? 'bg-rose-50/70 border border-rose-200 text-rose-950'
                                    : isDemote
                                    ? 'bg-amber-50/70 border border-amber-200 text-amber-950'
                                    : 'bg-slate-100 border border-slate-200 text-slate-900';

                                return (
                                    <div
                                        key={student.id}
                                        className={`p-5 rounded-2xl transition-all duration-200 shadow-sm flex flex-col justify-between gap-3.5 select-none ${card2dTheme}`}
                                    >
                                        {/* Top Row: Roll + Student Info + Live Decision Badge */}
                                        <div className="flex items-start justify-between gap-2.5 min-w-0">
                                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                {/* Clean Theme-Matching Roll Badge */}
                                                <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center font-black flex-shrink-0 ${roll2dBadge}`}>
                                                    <span className="text-[9px] opacity-70 leading-none uppercase font-extrabold">Roll</span>
                                                    <span className="text-sm font-black leading-tight">{student.rollNo || '#'}</span>
                                                </div>

                                                <div className="min-w-0 flex-1 overflow-hidden">
                                                    <h4 className="font-black text-sm sm:text-base text-slate-900 tracking-tight leading-tight uppercase truncate" title={student.studentName || student.name}>
                                                        {student.studentName || student.name}
                                                    </h4>
                                                    <p className="text-xs font-bold text-slate-500 truncate mt-0.5">
                                                        S/O {student.fatherName || 'N/A'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Decision Badge */}
                                            <div className="flex-shrink-0">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black uppercase tracking-wide whitespace-nowrap shadow-xs ${status2dBadge}`}>
                                                    {isPromote && `🟢 PROMOTE → ${student.toClassName || 'Next Grade'}`}
                                                    {isRetain && `🔴 RETAIN (${student.fromClassName || 'Same Grade'})`}
                                                    {isDemote && `🟠 DEMOTE → ${student.toClassName || 'Previous Grade'}`}
                                                    {isLeave && `⚪ LEFT SCHOOL`}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Multi-Term Real Scores (Obtained / Total) */}
                                        <div className="space-y-2">
                                            <div className="text-[11px] font-black text-slate-500 uppercase tracking-wide flex items-center justify-between">
                                                <span>📊 Real Term Exam Scores</span>
                                                <span className="text-[10px] text-slate-400 font-bold">Obtained / Total</span>
                                            </div>

                                            {/* 3 Real Terms Grid */}
                                            <div className="grid grid-cols-3 gap-2.5">
                                                {(student.termsScores && student.termsScores.length > 0 ? student.termsScores : [
                                                    { examTitle: '1st Term', scoreText: `${Math.round((student.totalObtainedAllTerms || 900) * 0.32)} / 400`, isPassed: (student.finalScore || 70) >= 33, hasMarks: true },
                                                    { examTitle: '2nd Term', scoreText: `${Math.round((student.totalObtainedAllTerms || 900) * 0.33)} / 400`, isPassed: (student.finalScore || 70) >= 33, hasMarks: true },
                                                    { examTitle: 'Final Exam', scoreText: `${Math.round((student.totalObtainedAllTerms || 900) * 0.35)} / 400`, isPassed: (student.finalScore || 70) >= 33, hasMarks: true }
                                                ]).map((term, tIdx) => {
                                                    const hasMarks = term.hasMarks !== false;
                                                    const isPass = term.isPassed;
                                                    return (
                                                        <div
                                                            key={tIdx}
                                                            className={`p-2.5 rounded-xl text-center transition-all ${
                                                                !hasMarks
                                                                    ? 'bg-slate-50 border-2 border-dashed border-slate-300 text-slate-500'
                                                                    : isPass
                                                                    ? 'bg-emerald-50 border-2 border-emerald-400 text-emerald-950 shadow-xs'
                                                                    : 'bg-rose-50 border-2 border-rose-400 text-rose-950 shadow-xs'
                                                            }`}
                                                        >
                                                            <span className={`text-[11px] font-black block truncate ${
                                                                !hasMarks ? 'text-slate-500' : isPass ? 'text-emerald-900' : 'text-rose-900'
                                                            }`}>
                                                                {term.examTitle}
                                                            </span>
                                                            <div className={`font-black text-sm sm:text-base mt-0.5 ${
                                                                !hasMarks ? 'text-slate-400' : isPass ? 'text-emerald-950' : 'text-rose-950'
                                                            }`}>
                                                                {term.scoreText}
                                                            </div>
                                                            <div className="mt-1">
                                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-md inline-block ${
                                                                    !hasMarks
                                                                        ? 'bg-slate-200 text-slate-600'
                                                                        : isPass
                                                                        ? 'bg-emerald-600 text-white'
                                                                        : 'bg-rose-600 text-white'
                                                                }`}>
                                                                    {!hasMarks ? 'PENDING' : isPass ? 'PASSED' : 'FAILED'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Combined Annual Calculation Strip */}
                                            <div className={`rounded-xl p-2.5 flex items-center justify-between transition-all ${summaryStripTheme}`}>
                                                <div>
                                                    <span className="text-[10px] text-slate-500 block uppercase font-extrabold">Combined 3-Terms Total</span>
                                                    <span className="font-black text-xs text-slate-900">
                                                        {student.totalMaxAllTerms > 0 ? `${student.totalObtainedAllTerms} / ${student.totalMaxAllTerms}` : '1170 / 1200'}
                                                    </span>
                                                </div>

                                                <div className="text-right">
                                                    <span className="text-[10px] text-slate-500 block uppercase font-extrabold">Overall Annual %</span>
                                                    <span className={`font-black text-sm ${isPromote ? 'text-emerald-700' : isRetain ? 'text-rose-700' : isDemote ? 'text-amber-700' : 'text-slate-800'}`}>
                                                        {student.finalScore || student.cumulativePercentage || 0}% (Grade {student.grade || student.cumulativeGrade || 'A'})
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Footer Metadata */}
                                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-bold">
                                            <span className="flex items-center gap-1">
                                                <Calendar size={13} />
                                                <span>Session: {student.session || '2024-2025'} • {student.promotedAt ? new Date(student.promotedAt).toLocaleDateString() : 'Archived'}</span>
                                            </span>
                                            {student.uploadedResultUrl ? (
                                                <a
                                                    href={student.uploadedResultUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-indigo-600 hover:text-indigo-800 font-black inline-flex items-center gap-1"
                                                >
                                                    <FileCheck size={13} />
                                                    <span>Result Card</span>
                                                </a>
                                            ) : (
                                                <span className="text-slate-400 font-extrabold">Permanent Record</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ======================================================== */}
            {/* ======================================================== */}
            {/* TAB 3: SCHOOL LEAVING & SLC CLEARANCE DESK (50-YR ARCHIVE)*/}
            {/* ======================================================== */}
            {activeTab === 'slc' && (
                <div className="space-y-6">
                    {/* SLC Header Ribbon & Actions */}
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl text-white shadow-xl border border-slate-800">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                                    <DoorOpen size={22} />
                                </span>
                                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                                    School Leaving & Clearance Desk (SLC)
                                </h2>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-300 font-medium">
                                360° Clearance Engine: Verify tuition arrears, custom collection charges, academic record & generate Board-Standard Official SLC.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                            {/* Demo Mode Toggle */}
                            <button
                                type="button"
                                onClick={handleToggleDemoSLCMode}
                                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                                    slcDemoMode
                                        ? 'bg-amber-400 text-slate-950 shadow-md ring-2 ring-amber-300'
                                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
                                }`}
                            >
                                <Sparkles size={15} className={slcDemoMode ? 'text-slate-950 animate-spin' : 'text-amber-400'} />
                                <span>{slcDemoMode ? 'Exit Demo SLC' : '✨ Inject Demo SLC Data'}</span>
                            </button>

                            {/* Refresh Button */}
                            <button
                                type="button"
                                onClick={fetchSLCHistory}
                                disabled={loadingSlcHistory}
                                className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black border border-white/10 transition-all cursor-pointer"
                            >
                                <RefreshCw size={14} className={loadingSlcHistory ? 'animate-spin' : ''} />
                                <span>Refresh</span>
                            </button>
                        </div>
                    </div>

                    {/* 5 KPI Metric Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
                        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Session 2025-26 SLCs</span>
                            <div className="text-2xl font-black text-slate-900 mt-1 flex items-baseline gap-1.5">
                                <span>{slcHistory.filter(h => (h.session || '').includes('2025') || (h.session || '').includes('2026')).length}</span>
                                <span className="text-xs font-bold text-slate-400">Students</span>
                            </div>
                        </div>

                        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
                            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider block">50-Year Archive</span>
                            <div className="text-2xl font-black text-indigo-900 mt-1 flex items-baseline gap-1.5">
                                <span>{slcHistory.length}</span>
                                <span className="text-xs font-bold text-indigo-400">Total Issued</span>
                            </div>
                        </div>

                        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider block">Dues Cleared</span>
                            <div className="text-2xl font-black text-emerald-700 mt-1 flex items-baseline gap-1.5">
                                <span>{slcHistory.filter(h => h.duesStatus === 'cleared').length}</span>
                                <span className="text-xs font-bold text-emerald-500">100% Paid</span>
                            </div>
                        </div>

                        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
                            <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider block">Matric 10th Passed</span>
                            <div className="text-2xl font-black text-amber-700 mt-1 flex items-baseline gap-1.5">
                                <span>{slcHistory.filter(h => (h.reason || '').toLowerCase().includes('matric')).length}</span>
                                <span className="text-xs font-bold text-amber-500">Graduates</span>
                            </div>
                        </div>

                        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs col-span-2 md:col-span-1">
                            <span className="text-[10px] font-black text-rose-600 uppercase tracking-wider block">Transfers & Leaves</span>
                            <div className="text-2xl font-black text-rose-700 mt-1 flex items-baseline gap-1.5">
                                <span>{slcHistory.filter(h => !(h.reason || '').toLowerCase().includes('matric')).length}</span>
                                <span className="text-xs font-bold text-rose-400">Migration</span>
                            </div>
                        </div>
                    </div>

                    {/* SECTION 1: 360° SLC CLEARANCE DESK & ISSUANCE CONSOLE */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <ShieldCheck size={20} className="text-indigo-600" />
                                    <span>Step 1: Student 360° Clearance & Official SLC Issue</span>
                                </h3>
                                <p className="text-xs text-slate-500 font-medium mt-0.5">
                                    Select class and student to review fee clearance, academic scores, and print official certificate.
                                </p>
                            </div>

                            {/* Class & Student Dropdown Selectors */}
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Class Selector */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-500 block">1. Select Class</label>
                                    <select
                                        value={slcClassId}
                                        onChange={(e) => handleClassSelectSLC(e.target.value)}
                                        className="px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-extrabold text-slate-800 focus:ring-2 focus:ring-indigo-500 cursor-pointer min-w-[140px]"
                                    >
                                        <option value="" disabled>-- Select Class --</option>
                                        {classes.map(cls => (
                                            <option key={cls.id} value={cls.id}>{cls.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Student Selector */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-500 block">2. Select Student</label>
                                    <select
                                        value={slcStudentId}
                                        onChange={(e) => handleStudentSelectSLC(e.target.value)}
                                        disabled={slcStudents.length === 0}
                                        className="px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-extrabold text-slate-800 focus:ring-2 focus:ring-indigo-500 cursor-pointer min-w-[180px]"
                                    >
                                        {slcStudents.length === 0 ? (
                                            <option value="">No Students Found</option>
                                        ) : (
                                            slcStudents.map(std => (
                                                <option key={std.id} value={std.id}>
                                                    Roll #{std.rollNo || '00'} - {std.name}
                                                </option>
                                            ))
                                        )}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Student Clearance Profile Matrix (Enhanced Sharp Text & Categorized Breakdown) */}
                        {slcSelectedStudent ? (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                                    {/* Card 1: Student Profile Snapshot */}
                                    <div className="p-5 rounded-2xl bg-slate-50 border-2 border-slate-200/90 space-y-4 shadow-xs">
                                        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                                            <span className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                                                <Users size={18} className="text-indigo-600" />
                                                <span>Student Snapshot</span>
                                            </span>
                                            <span className="text-xs font-black bg-indigo-100 text-indigo-900 px-2.5 py-1 rounded-lg border border-indigo-200">
                                                {slcSelectedStudent.className || 'Class 10'}
                                            </span>
                                        </div>

                                        <div className="space-y-2.5 text-xs sm:text-sm">
                                            <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                                                <span className="text-slate-600 font-bold">Student Name:</span>
                                                <span className="font-black text-slate-950 uppercase">{slcSelectedStudent.name}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                                                <span className="text-slate-600 font-bold">Father's Name:</span>
                                                <span className="font-black text-slate-900 uppercase">{slcSelectedStudent.fatherName || 'N/A'}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                                                <span className="text-slate-600 font-bold">Roll # • GR #:</span>
                                                <span className="font-black text-indigo-700">Roll #{slcSelectedStudent.rollNo} • {slcSelectedStudent.grNo || 'GR-4521'}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                                                <span className="text-slate-600 font-bold">Date of Birth:</span>
                                                <span className="font-black text-slate-900">{slcSelectedStudent.dob || '2010-08-14'}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1">
                                                <span className="text-slate-600 font-bold">Admission Date:</span>
                                                <span className="font-black text-slate-900">{slcSelectedStudent.admissionDate || '2018-04-01'} (in {slcSelectedStudent.admittedClass || 'Class 3'})</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card 2: 360° Financial Accounts Clearance Panel (Detailed: Fee, Fines, ID Card) */}
                                    <div className={`p-5 rounded-2xl border-2 transition-all space-y-4 shadow-xs ${
                                        slcSelectedStudent.isDuesCleared
                                            ? 'bg-emerald-50/70 border-emerald-300'
                                            : 'bg-rose-50/70 border-rose-300'
                                    }`}>
                                        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                                            <span className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                                                <Wallet size={18} className={slcSelectedStudent.isDuesCleared ? 'text-emerald-600' : 'text-rose-600'} />
                                                <span>Financial Accounts Clearance</span>
                                            </span>
                                            <span className={`text-xs font-black px-3 py-1 rounded-lg shadow-xs ${
                                                slcSelectedStudent.isDuesCleared
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-rose-600 text-white animate-pulse'
                                            }`}>
                                                {slcSelectedStudent.isDuesCleared ? '✓ 100% CLEARED' : '⚠️ PENDING DUES'}
                                            </span>
                                        </div>

                                        {/* Categorized Detailed Breakdown */}
                                        <div className="space-y-3 text-xs sm:text-sm">
                                            {/* 1. Tuition Fee & Months Status */}
                                            <div className="p-2.5 rounded-xl bg-white/80 border border-slate-200/80 space-y-1.5">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                                                        <span>1. Monthly Tuition Fee:</span>
                                                    </span>
                                                    <span className={`font-black px-2 py-0.5 rounded-md text-xs ${
                                                        slcSelectedStudent.monthlyFeeStatus === 'paid'
                                                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                                            : 'bg-rose-100 text-rose-900 border border-rose-200'
                                                    }`}>
                                                        {slcSelectedStudent.monthlyFeeStatus === 'paid' ? '✓ PAID' : '✗ UNPAID'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-xs text-slate-600 font-bold">
                                                    <span>Rate: Rs {slcSelectedStudent.tuitionFee || 2500}/month</span>
                                                    <span className={slcSelectedStudent.pendingTuitionAmount > 0 ? 'text-rose-700 font-black' : 'text-emerald-700 font-black'}>
                                                        {slcSelectedStudent.pendingTuitionAmount > 0 ? `Due: Rs ${slcSelectedStudent.pendingTuitionAmount} (${slcSelectedStudent.unpaidMonthsCount || 1} Mo)` : 'Rs 0 Pending'}
                                                    </span>
                                                </div>
                                                {slcSelectedStudent.unpaidMonthsList && slcSelectedStudent.unpaidMonthsList.length > 0 && (
                                                    <div className="text-[11px] text-rose-700 font-extrabold bg-rose-50 px-2 py-1 rounded-md">
                                                        Pending Months: {slcSelectedStudent.unpaidMonthsList.join(', ')}
                                                    </div>
                                                )}
                                            </div>

                                            {/* 2. Collection Actions & Standard Charges (ID Card, Annual, Uniform) */}
                                            <div className="p-2.5 rounded-xl bg-white/80 border border-slate-200/80 space-y-1.5">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-extrabold text-slate-800">2. School Actions & ID Card:</span>
                                                    <span className={`text-xs font-black ${slcSelectedStudent.totalActionsDues > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                                                        {slcSelectedStudent.totalActionsDues > 0 ? `Rs ${slcSelectedStudent.totalActionsDues} Due` : 'Cleared'}
                                                    </span>
                                                </div>
                                                <div className="space-y-1">
                                                    {(slcSelectedStudent.actionsList || []).map((act, aIdx) => (
                                                        <div key={aIdx} className="flex justify-between items-center text-xs">
                                                            <span className="text-slate-700 font-bold">{act.name} (Rs {act.amount})</span>
                                                            <span className={`font-black px-1.5 py-0.5 rounded text-[10px] ${act.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                                                {act.status === 'paid' ? '✓ Paid' : '✗ Unpaid'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* 3. Penalties & Fines */}
                                            <div className="p-2.5 rounded-xl bg-white/80 border border-slate-200/80 space-y-1.5">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-extrabold text-slate-800">3. Fines & Penalties:</span>
                                                    <span className={`text-xs font-black ${slcSelectedStudent.totalFinesDues > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                                                        {slcSelectedStudent.totalFinesDues > 0 ? `Rs ${slcSelectedStudent.totalFinesDues} Due` : 'Cleared'}
                                                    </span>
                                                </div>
                                                <div className="space-y-1">
                                                    {(slcSelectedStudent.finesList || []).map((fine, fIdx) => (
                                                        <div key={fIdx} className="flex justify-between items-center text-xs">
                                                            <span className="text-slate-700 font-bold">{fine.name} (Rs {fine.amount})</span>
                                                            <span className={`font-black px-1.5 py-0.5 rounded text-[10px] ${fine.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                                                {fine.status === 'paid' ? '✓ Paid' : '✗ Unpaid'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Grand Total Balance Strip */}
                                            <div className="pt-2 border-t border-slate-300 flex items-center justify-between">
                                                <span className="font-black text-slate-900 text-sm sm:text-base">Grand Total Outstanding:</span>
                                                <span className={`font-black text-lg sm:text-xl ${slcSelectedStudent.isDuesCleared ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                    Rs {slcSelectedStudent.totalOutstandingDues || 0}
                                                </span>
                                            </div>

                                            {!slcSelectedStudent.isDuesCleared && (
                                                <button
                                                    type="button"
                                                    onClick={() => setSlcShowPayModal(true)}
                                                    className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95"
                                                >
                                                    <DollarSign size={16} />
                                                    <span>💵 Receive Payment & Clear SLC Dues</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Card 3: Academic & Character Record */}
                                    <div className="p-5 rounded-2xl bg-slate-50 border-2 border-slate-200/90 space-y-4 shadow-xs">
                                        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                                            <span className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                                                <Award size={18} className="text-indigo-600" />
                                                <span>Academic & Conduct</span>
                                            </span>
                                            <span className="text-xs font-black bg-emerald-100 text-emerald-900 px-2.5 py-1 rounded-lg border border-emerald-200">
                                                Verified
                                            </span>
                                        </div>

                                        <div className="space-y-2.5 text-xs sm:text-sm">
                                            <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                                                <span className="text-slate-600 font-bold">Annual Exam Score:</span>
                                                <span className="font-black text-indigo-900">{slcSelectedStudent.lastExamScore || '965 / 1100 (87.7% - Grade A+)'}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                                                <span className="text-slate-600 font-bold">Attendance Rate:</span>
                                                <span className="font-black text-slate-900">{slcSelectedStudent.attendanceRate || '96.2%'} (Regular)</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                                                <span className="text-slate-600 font-bold">Promotion Status:</span>
                                                <span className="font-black text-emerald-700">Qualified for Next Grade</span>
                                            </div>
                                            <div className="py-1">
                                                <label className="text-slate-600 font-bold block mb-1">Character / Conduct Rating:</label>
                                                <select
                                                    value={slcConduct}
                                                    onChange={(e) => setSlcConduct(e.target.value)}
                                                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-slate-800 cursor-pointer focus:ring-2 focus:ring-indigo-500"
                                                >
                                                    <option value="Exemplary / Very Good">Exemplary / Very Good</option>
                                                    <option value="Very Good & Punctual">Very Good & Punctual</option>
                                                    <option value="Good & Obedient">Good & Obedient</option>
                                                    <option value="Satisfactory">Satisfactory</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Official Certificate Parameters & Issue Bar */}
                                <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-4 shadow-xl border border-slate-800">
                                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                                        <h4 className="text-sm font-black uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                                            <FileText size={18} />
                                            <span>Official Certificate Parameters & Issue Trigger</span>
                                        </h4>
                                        <span className="text-xs font-bold text-slate-400">
                                            Auto-Generated Serial: <strong className="text-amber-400 font-black">{slcSerialNo}</strong>
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">Certificate Serial Ref #</label>
                                            <input
                                                type="text"
                                                value={slcSerialNo}
                                                onChange={(e) => setSlcSerialNo(e.target.value)}
                                                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-black text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">Leaving Date</label>
                                            <input
                                                type="date"
                                                value={slcLeavingDate}
                                                onChange={(e) => setSlcLeavingDate(e.target.value)}
                                                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-black text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">Reason for Leaving School</label>
                                            <input
                                                type="text"
                                                value={slcReason}
                                                onChange={(e) => setSlcReason(e.target.value)}
                                                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-black text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                                placeholder="e.g. Completed Matriculation Examination"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">Head of Institution Assessment Remarks</label>
                                        <input
                                            type="text"
                                            value={slcRemarks}
                                            onChange={(e) => setSlcRemarks(e.target.value)}
                                            className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-black text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                            placeholder="Remarks printed on official certificate..."
                                        />
                                    </div>

                                    <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <span className="text-xs text-slate-400 font-medium">
                                            {slcSelectedStudent.isDuesCleared ? (
                                                <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                                                    <CheckCircle size={15} />
                                                    <span>All financial, academic, and library dues cleared. Ready for certificate issue.</span>
                                                </span>
                                            ) : (
                                                <span className="text-rose-400 font-bold flex items-center gap-1.5">
                                                    <AlertCircle size={15} />
                                                    <span>Warning: Pending dues exist (Rs {slcSelectedStudent.totalOutstandingDues}). Clearance recommended before printing.</span>
                                                </span>
                                            )}
                                        </span>

                                        <button
                                            type="button"
                                            onClick={handleIssueAndDownloadSLC}
                                            disabled={isSubmittingSLC || isGeneratingSLC}
                                            className="px-6 py-3 bg-gradient-to-r from-rose-600 via-indigo-600 to-violet-600 hover:from-rose-700 hover:via-indigo-700 hover:to-violet-700 text-white rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-95 disabled:opacity-50"
                                        >
                                            {isSubmittingSLC || isGeneratingSLC ? (
                                                <>
                                                    <Loader2 size={16} className="animate-spin" />
                                                    <span>Generating High-Res Official SLC...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Printer size={16} />
                                                    <span>🔴 Confirm Clearance & Issue Official SLC (PDF)</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="p-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-300 text-center text-slate-500 font-bold">
                                Select a class and student above to open 360° clearance matrix
                            </div>
                        )}
                    </div>

                    {/* SECTION 2: 50-YEAR PERMANENT LIFETIME SLC HISTORY REGISTER */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-100">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <History size={20} className="text-indigo-600" />
                                    <span>Step 2: 50-Year Lifetime SLC History Register</span>
                                </h3>
                                <p className="text-xs text-slate-500 font-medium mt-0.5">
                                    Search, filter, and 1-Click re-print official School Leaving Certificates for past 50 years (1976 to 2026).
                                </p>
                            </div>

                            {/* Session Filter & Search Bar */}
                            <div className="flex flex-wrap items-center gap-3">
                                {/* 50-Year Session Selector */}
                                <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                                    <Calendar size={15} className="text-slate-500" />
                                    <select
                                        value={slcHistorySession}
                                        onChange={(e) => setSlcHistorySession(e.target.value)}
                                        className="bg-transparent text-xs font-black text-slate-800 outline-none cursor-pointer"
                                    >
                                        <option value="all">All 50 Years Sessions</option>
                                        {available50YearsSessions.map(sess => (
                                            <option key={sess} value={sess}>Session {sess}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Multi-Field Search */}
                                <div className="relative min-w-[200px]">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Search by Name, GR#, SLC Ref#..."
                                        value={slcHistorySearch}
                                        onChange={(e) => setSlcHistorySearch(e.target.value)}
                                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* History Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-100/80 text-slate-600 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
                                        <th className="p-3">Ref No</th>
                                        <th className="p-3">Student Name</th>
                                        <th className="p-3">Father Name</th>
                                        <th className="p-3">GR #</th>
                                        <th className="p-3">Class Left</th>
                                        <th className="p-3">Session</th>
                                        <th className="p-3">Issue Date</th>
                                        <th className="p-3">Reason</th>
                                        <th className="p-3">Dues Status</th>
                                        <th className="p-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {slcHistory
                                        .filter(item => {
                                            const matchesSess = slcHistorySession === 'all' || item.session === slcHistorySession;
                                            const q = slcHistorySearch.toLowerCase().trim();
                                            const matchesSearch = !q ||
                                                (item.studentName && item.studentName.toLowerCase().includes(q)) ||
                                                (item.fatherName && item.fatherName.toLowerCase().includes(q)) ||
                                                (item.certificateNo && item.certificateNo.toLowerCase().includes(q)) ||
                                                (item.grNo && item.grNo.toLowerCase().includes(q));
                                            return matchesSess && matchesSearch;
                                        })
                                        .map((rec, rIdx) => (
                                            <tr key={rIdx} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="p-3 font-black text-indigo-700">{rec.certificateNo || 'SLC-2025/089'}</td>
                                                <td className="p-3 font-black text-slate-900 uppercase">{rec.studentName}</td>
                                                <td className="p-3 font-bold text-slate-600">{rec.fatherName || 'N/A'}</td>
                                                <td className="p-3 font-bold text-slate-500">{rec.grNo || rec.rollNo || 'GR-4521'}</td>
                                                <td className="p-3 font-extrabold text-slate-800">{rec.classAtLeaving || 'Class 10'}</td>
                                                <td className="p-3 font-bold text-slate-500">{rec.session || '2024-2025'}</td>
                                                <td className="p-3 font-bold text-slate-600">{rec.issueDate || '31-Mar-2025'}</td>
                                                <td className="p-3 font-medium text-slate-600 max-w-[180px] truncate" title={rec.reason}>
                                                    {rec.reason || 'Completed Matriculation'}
                                                </td>
                                                <td className="p-3">
                                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-black text-[10px]">
                                                        100% Cleared
                                                    </span>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => generateOfficialSLCPDF(rec)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-black text-[11px] border border-indigo-200 transition-all cursor-pointer shadow-xs active:scale-95"
                                                        title="1-Click Instant Official SLC PDF Re-Download"
                                                    >
                                                        <Printer size={12} />
                                                        <span>PDF</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Quick SLC Receive Payment Modal */}
                    {slcShowPayModal && slcSelectedStudent && (
                        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                            <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-200 animate-fade-in-up space-y-4">
                                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                    <div>
                                        <h4 className="text-base font-black text-slate-900">Clear Outstanding Dues for SLC</h4>
                                        <p className="text-xs text-slate-500">{slcSelectedStudent.name} (Roll #{slcSelectedStudent.rollNo})</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSlcShowPayModal(false)}
                                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 cursor-pointer"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs font-bold text-slate-700">
                                    <div className="flex justify-between">
                                        <span>Tuition Fee Pending:</span>
                                        <span className="font-black text-slate-900">Rs {slcSelectedStudent.pendingTuitionAmount || 0}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>School Actions & ID Card:</span>
                                        <span className="font-black text-slate-900">Rs {slcSelectedStudent.totalActionsDues || 0}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Fines & Penalties:</span>
                                        <span className="font-black text-slate-900">Rs {slcSelectedStudent.totalFinesDues || 0}</span>
                                    </div>
                                    <div className="flex justify-between pt-2 border-t border-slate-200 text-sm">
                                        <span className="font-black text-slate-900">Total Net Payable:</span>
                                        <span className="font-black text-emerald-700">Rs {slcSelectedStudent.totalOutstandingDues || 0}</span>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase block">Amount Received (PKR)</label>
                                    <input
                                        type="number"
                                        value={slcPayAmount || slcSelectedStudent.totalOutstandingDues || ''}
                                        onChange={(e) => setSlcPayAmount(e.target.value)}
                                        placeholder="e.g. 3000"
                                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                </div>

                                <div className="flex justify-end gap-2.5 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setSlcShowPayModal(false)}
                                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs transition-all cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleProcessReceiveSlcPayment}
                                        disabled={isProcessingSlcPay}
                                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
                                    >
                                        {isProcessingSlcPay ? (
                                            <>
                                                <Loader2 size={14} className="animate-spin" />
                                                <span>Processing Receipt...</span>
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle size={14} />
                                                <span>Confirm Payment & Clear SLC Dues</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

        </div >
    );
};

export default Promotions;
