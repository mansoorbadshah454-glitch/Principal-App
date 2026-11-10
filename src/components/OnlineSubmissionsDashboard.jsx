import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Clock, CheckCircle2, XCircle, Search, Eye, Filter, Download, ExternalLink, 
    Smartphone, Landmark, AlertCircle, ArrowUpRight, Check, X, Loader2,
    ZoomIn, ZoomOut, RotateCcw, RotateCw, Users, ShieldCheck, FileCheck, RefreshCw, 
    AlertTriangle, Copy, Calendar, CheckCheck, Sparkles, CreditCard, ArrowRight,
    Volume2, VolumeX, Bell, UserCheck, ChevronRight, ChevronLeft, ChevronDown, Hash, Tag, Receipt,
    Trash2, Zap
} from 'lucide-react';
import { db } from '../firebase';
import { 
    collection, onSnapshot, query, doc, updateDoc, setDoc, getDoc, getDocs, orderBy, serverTimestamp, writeBatch, arrayUnion
} from 'firebase/firestore';
import { calculateItemizedFeeBreakdown, MONTH_NAMES, MONTH_SHORT, formatPKR, isMonthKeySettled } from '../utils/feePipeline';
import { cacheStudentsOffline, getCachedStudentsOffline } from '../utils/offlineFeeEngine';
import { playShopifyChachingSound } from '../utils/audioAlerts';
import { triggerAiAuditAndSync } from '../utils/aiReceiptClient';

const ITEMS_PER_PAGE = 25;

const OnlineSubmissionsDashboard = ({ 
    schoolId: propSchoolId, 
    schoolInfo, 
    classes = [], 
    feeSettings = {}, 
    allStudents = [] 
}) => {
    const [submissions, setSubmissions] = useState([]);
    const [localStudents, setLocalStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Primary Sub-Tab Switch: 'counter' (⚡ Online Fee Counter Studio) vs 'history' (📜 Online Fee History)
    const [activeSubTab, setActiveSubTab] = useState('counter');
    
    // Active Selected Submission in Studio Cockpit
    const [selectedSubId, setSelectedSubId] = useState(null);
    
    // Per-sibling inclusion toggle map for multi-child settlements
    const [selectedSiblingsPayingMap, setSelectedSiblingsPayingMap] = useState({});

    // Filters
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'approved', 'rejected', 'needs_reupload'
    const [filterMethod, setFilterMethod] = useState('all'); // 'all', 'easypaisa', 'jazzcash', 'bank', 'family'
    const currentMonthIso = useMemo(() => new Date().toISOString().slice(0, 7), []);
    const [historySelectedMonth, setHistorySelectedMonth] = useState(currentMonthIso);
    const [searchQuery, setSearchQuery] = useState('');

    // Pagination States (25 items per page)
    const [pendingPage, setPendingPage] = useState(1);
    const [historyPage, setHistoryPage] = useState(1);
    
    // Canvas & Slip Viewer States
    const [selectedProofUrl, setSelectedProofUrl] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(1); // 1 = 100%, 1.5 = 150%, 2 = 200%, 2.5 = 250%
    const [slipRotation, setSlipRotation] = useState(0); // 0, 90, 180, 270
    const [rejectingSub, setRejectingSub] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [reuploadSub, setReuploadSub] = useState(null);
    const [reuploadNote, setReuploadNote] = useState('');
    const [processingId, setProcessingId] = useState(null);
    const [partialConfirmSub, setPartialConfirmSub] = useState(null);
    const [isInjectingDemo, setIsInjectingDemo] = useState(false);
    const [copiedTrx, setCopiedTrx] = useState('');
    const [aiScanningId, setAiScanningId] = useState(null);
    const [aiScanError, setAiScanError] = useState(null);
    const [expandedBreakdowns, setExpandedBreakdowns] = useState({});

    // 🔒 Robust School ID Resolver with Fallback
    const effectiveSchoolId = useMemo(() => {
        if (propSchoolId) return String(propSchoolId).trim();
        try {
            const manual = localStorage.getItem('manual_session');
            if (manual) {
                const parsed = JSON.parse(manual);
                if (parsed?.schoolId) return String(parsed.schoolId).trim();
            }
            const stored = localStorage.getItem('schoolId') || localStorage.getItem('currentSchoolId');
            if (stored) return String(stored).trim();
        } catch (_) {}
        return '';
    }, [propSchoolId]);

    const schoolId = propSchoolId || effectiveSchoolId;

    // 🔒 Strict Gatekeeper: Demo Injection & Mock Slips are active in Dev mode OR for Demo Presentation Account (School ID: 6257)
    const isDemoAccount = useMemo(() => {
        if (import.meta.env.DEV) return true;
        const sId = String(effectiveSchoolId || schoolId || '').trim();
        const pId = String(schoolInfo?.schoolId || schoolInfo?.id || '').trim();
        return sId === '6257' || pId === '6257' || sId.includes('6257') || pId.includes('6257') || sId.toLowerCase().includes('demo');
    }, [effectiveSchoolId, schoolId, schoolInfo]);

    // Audio & Real-time Live Alert States
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [realtimeToast, setRealtimeToast] = useState(null);
    const prevPendingCountRef = useRef(null);

    const playPaymentChime = () => {
        if (!audioEnabled) return;
        playShopifyChachingSound();
    };

    const handleZoomIn = () => {
        setZoomLevel(prev => Math.min(Number((prev + 0.5).toFixed(1)), 2.5));
    };

    const handleZoomOut = () => {
        setZoomLevel(prev => Math.max(Number((prev - 0.5).toFixed(1)), 1));
    };

    const handleResetZoom = () => {
        setZoomLevel(1);
        setSlipRotation(0);
    };

    const handleRotateSlip = () => {
        setSlipRotation(prev => (prev + 90) % 360);
    };

    const handleCopyTrx = (trx) => {
        if (!trx) return;
        navigator.clipboard.writeText(trx);
        setCopiedTrx(trx);
        setTimeout(() => setCopiedTrx(''), 2500);
    };

    // Real-time listener for payment submissions
    useEffect(() => {
        const currentSid = effectiveSchoolId || schoolId;
        if (!currentSid) {
            // Unblock spinner if schoolId is not yet loaded
            const timer = setTimeout(() => setLoading(false), 1200);
            return () => clearTimeout(timer);
        }

        const subsRef = collection(db, `schools/${currentSid}/paymentSubmissions`);
        const q = query(subsRef);

        const unsub = onSnapshot(q, (snapshot) => {
            const list = [];
            snapshot.forEach((d) => {
                list.push({ id: d.id, ...d.data() });
            });

            // Sort newest first
            list.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
            
            const pendingList = list.filter(s => (s.status || 'pending') === 'pending');
            
            // Trigger Chime & Floating Toast when new pending submission arrives
            if (prevPendingCountRef.current !== null && pendingList.length > prevPendingCountRef.current) {
                playPaymentChime();
                const latest = pendingList[0];
                if (latest) {
                    setRealtimeToast(latest);
                }
            }
            prevPendingCountRef.current = pendingList.length;

            setSubmissions(list);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching payment submissions:", err);
            setLoading(false);
        });

        return () => unsub();
    }, [effectiveSchoolId, schoolId, audioEnabled]);

    // ⚡ SUPER-FAST OFFLINE & MULTI-CLASS REALTIME STUDENT AGGREGATOR
    // 1. Instantly pull cached students from IndexedDB (0ms delay)
    // 2. Attach live real-time listeners to all class subcollections
    useEffect(() => {
        if (!schoolId) return;

        let isMounted = true;

        // Step 1: 0ms Instant Offline retrieval
        getCachedStudentsOffline(schoolId).then((cached) => {
            if (isMounted && Array.isArray(cached) && cached.length > 0) {
                setLocalStudents(prev => prev.length === 0 ? cached : prev);
            }
        }).catch(e => console.warn("Offline cache read notice:", e));

        const unsubs = [];
        const classStudentsMap = {};

        // If classes array is provided, listen to each class's students subcollection
        if (Array.isArray(classes) && classes.length > 0) {
            classes.forEach((cls) => {
                if (!cls || !cls.id) return;
                const classStRef = collection(db, `schools/${schoolId}/classes/${cls.id}/students`);
                const unsubClass = onSnapshot(classStRef, (snap) => {
                    const arr = [];
                    snap.forEach((d) => {
                        arr.push({ 
                            id: d.id, 
                            classId: cls.id, 
                            className: cls.name || cls.className || 'Class', 
                            ...d.data() 
                        });
                    });
                    classStudentsMap[cls.id] = arr;

                    // Flatten all classes
                    const allFlattened = Object.values(classStudentsMap).flat();
                    if (isMounted) {
                        setLocalStudents(allFlattened);
                        cacheStudentsOffline(schoolId, allFlattened);
                    }
                }, (err) => {
                    console.warn(`Error listening to class ${cls.id} students:`, err);
                });
                unsubs.push(unsubClass);
            });
        }

        // Also listen to master /students collection as fallback / sync
        const masterStRef = collection(db, `schools/${schoolId}/students`);
        const unsubMaster = onSnapshot(masterStRef, (snapshot) => {
            if (snapshot.size > 0) {
                const arr = [];
                snapshot.forEach(d => arr.push({ id: d.id, ...d.data() }));
                if (isMounted && (!classes || classes.length === 0)) {
                    setLocalStudents(arr);
                    cacheStudentsOffline(schoolId, arr);
                }
            }
        }, (err) => {
            console.warn("Error fetching students master in OnlineSubmissionsDashboard:", err);
        });
        unsubs.push(unsubMaster);

        return () => {
            isMounted = false;
            unsubs.forEach(fn => {
                if (typeof fn === 'function') fn();
            });
        };
    }, [schoolId, classes]);

    // Helper to extract normalized "YYYY-MM" monthKey and month index
    const parseMonthInfo = (monthStr) => {
        let yr = new Date().getFullYear();
        let mIdx = new Date().getMonth();

        if (monthStr) {
            const yearMatch = monthStr.match(/\b(20\d\d)\b/);
            if (yearMatch) yr = parseInt(yearMatch[1], 10);
            const s = monthStr.toLowerCase();
            for (let i = 0; i < MONTH_NAMES.length; i++) {
                if (s.includes(MONTH_NAMES[i].toLowerCase()) || s.includes(MONTH_SHORT[i].toLowerCase())) {
                    mIdx = i;
                    break;
                }
            }
        }
        const monthKey = `${yr}-${String(mIdx + 1).padStart(2, '0')}`;
        const monthName = MONTH_NAMES[mIdx];
        return { monthKey, monthName, mIdx, yr };
    };

    // Helper to resolve accurate monthKey (YYYY-MM) for any submission
    const getSubmissionMonthKey = (sub) => {
        if (!sub) return currentMonthIso;
        if (sub.month) {
            const info = parseMonthInfo(sub.month);
            if (info?.monthKey) return info.monthKey;
        }
        const dateStr = sub.approvedAt || sub.submittedAt || sub.createdAt || sub.rejectedAt || '';
        if (dateStr && dateStr.length >= 7) return dateStr.slice(0, 7);
        return currentMonthIso;
    };

    // Map of approved students & parents by monthKey to auto-resolve superseded rejections
    const approvedSettlementMap = useMemo(() => {
        const map = new Set();
        submissions.forEach(sub => {
            if (sub.status === 'approved') {
                const mKey = getSubmissionMonthKey(sub);
                if (sub.studentId) map.add(`${sub.studentId}_${mKey}`);
                if (sub.parentId) map.add(`${sub.parentId}_${mKey}`);
                if (Array.isArray(sub.familyStudents)) {
                    sub.familyStudents.forEach(fs => {
                        const sid = fs.studentId || fs.id;
                        if (sid) map.add(`${sid}_${mKey}`);
                    });
                }
                if (Array.isArray(sub.approvedSiblings)) {
                    sub.approvedSiblings.forEach(fs => {
                        const sid = fs.studentId || fs.id;
                        if (sid) map.add(`${sid}_${mKey}`);
                    });
                }
            }
        });
        return map;
    }, [submissions]);

    // Check if a rejected / re-upload submission has been superseded by a subsequent approved payment
    const isSubmissionSuperseded = (sub) => {
        if (sub.status !== 'rejected' && sub.status !== 'needs_reupload') return false;
        if (sub.superseded || sub.resolvedByApproved) return true;
        const mKey = getSubmissionMonthKey(sub);

        if (sub.studentId && approvedSettlementMap.has(`${sub.studentId}_${mKey}`)) return true;
        if (sub.parentId && approvedSettlementMap.has(`${sub.parentId}_${mKey}`)) return true;
        if (Array.isArray(sub.familyStudents) && sub.familyStudents.some(fs => approvedSettlementMap.has(`${(fs.studentId || fs.id)}_${mKey}`))) return true;

        return false;
    };

    // Pending vs History lists (with smart superseded-rejection filtering)
    const pendingSubs = useMemo(() => {
        return submissions.filter(s => (s.status || 'pending') === 'pending');
    }, [submissions]);

    const historySubs = useMemo(() => {
        return submissions.filter(s => {
            if ((s.status || 'pending') === 'pending') return false;
            if (isSubmissionSuperseded(s)) return false;
            return true;
        });
    }, [submissions, approvedSettlementMap]);

    // List of historical months ordered from January to December
    const historyMonthOptions = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const seenYears = new Set([currentYear]);

        // Detect any other years from past submissions
        submissions.forEach(s => {
            const mKey = getSubmissionMonthKey(s);
            if (mKey && mKey.length === 7) {
                const yr = parseInt(mKey.split('-')[0], 10);
                if (!isNaN(yr)) seenYears.add(yr);
            }
        });

        const sortedYears = Array.from(seenYears).sort((a, b) => b - a); // Newer year first (e.g. 2026, then 2025)
        const options = [];

        sortedYears.forEach(year => {
            for (let mIdx = 0; mIdx < 12; mIdx++) {
                const monthKey = `${year}-${String(mIdx + 1).padStart(2, '0')}`;
                const isCurrent = monthKey === currentMonthIso;
                options.push({
                    value: monthKey,
                    label: `${MONTH_NAMES[mIdx]} ${year}${isCurrent ? ' (Current)' : ''}`
                });
            }
        });

        options.push({ value: 'all', label: '🌐 All Months (Lifetime History)' });
        return options;
    }, [currentMonthIso, submissions]);

    // Auto-select first pending submission if none selected or if selected is no longer pending
    useEffect(() => {
        if (pendingSubs.length > 0) {
            if (!selectedSubId || !pendingSubs.some(s => s.id === selectedSubId)) {
                setSelectedSubId(pendingSubs[0].id);
                setZoomLevel(1);
                setSlipRotation(0);
            }
        } else {
            setSelectedSubId(null);
        }
    }, [pendingSubs, selectedSubId]);

    // Active Selected Submission Object
    const activeSub = useMemo(() => {
        return pendingSubs.find(s => s.id === selectedSubId) || pendingSubs[0] || null;
    }, [pendingSubs, selectedSubId]);

    // Duplicate TRX ID map across all submissions
    const trxCountMap = useMemo(() => {
        const counts = {};
        submissions.forEach(s => {
            const trx = (s.transactionId || '').trim();
            if (trx && trx.length >= 4) {
                counts[trx] = (counts[trx] || 0) + 1;
            }
        });
        return counts;
    }, [submissions]);

    // 🎯 RESOLVE SIBLING STUDENTS VIA DIRECT PARENT ACCOUNT (UID) + SMART FALLBACK
    const resolvedFamilyStudents = useMemo(() => {
        if (!activeSub) return [];

        const targetParentId = (activeSub.parentId || '').toString().trim();
        const targetStudentId = (activeSub.studentId || '').toString().trim();
        const targetPhone = (activeSub.parentPhone || activeSub.fatherPhone || '').toString().replace(/[^0-9]/g, '');
        const targetFatherName = (activeSub.parentName || activeSub.fatherName || '').toString().trim().toLowerCase();
        const subMonthInfo = parseMonthInfo(activeSub.month);

        const studentPool = (Array.isArray(allStudents) && allStudents.length > 0) ? allStudents : localStudents;
        let siblingCandidates = [];

        if (Array.isArray(studentPool) && studentPool.length > 0) {
            const map = new Map();

            // 1. PRIMARY & FASTEST: Match directly by Parent Account UID
            if (targetParentId) {
                studentPool.forEach(st => {
                    if (!st) return;
                    const pId = (st.parentDetails?.parentId || st.parentId || st.parentUid || st.guardianId || '').toString().trim();
                    if (pId && pId === targetParentId) {
                        map.set(st.id, st);
                    }
                });
            }

            // 2. SECONDARY: Add primary student if explicitly tagged in submission
            if (targetStudentId && !map.has(targetStudentId)) {
                const primarySt = studentPool.find(s => s.id === targetStudentId);
                if (primarySt) map.set(primarySt.id, primarySt);
            }

            // 3. TERTIARY FALLBACK: Match by normalized Phone Number (if no parent account matches found)
            if (map.size === 0 && targetPhone.length >= 7) {
                studentPool.forEach(st => {
                    if (!st) return;
                    const sPhones = [
                        st.fatherPhone, st.phone, st.emergencyPhone, 
                        st.parentDetails?.phone, st.guardianPhone, st.motherPhone
                    ].map(p => (p || '').toString().replace(/[^0-9]/g, '')).filter(p => p.length >= 7);

                    if (sPhones.some(p => p.includes(targetPhone) || targetPhone.includes(p))) {
                        map.set(st.id, st);
                    }
                });
            }

            // 4. QUATERNARY FALLBACK: Match by Father Name
            if (map.size === 0 && targetFatherName.length >= 3) {
                studentPool.forEach(st => {
                    if (!st) return;
                    const stFather = (st.fatherName || st.parentDetails?.fatherName || st.parentName || '').toString().trim().toLowerCase();
                    if (stFather && (stFather === targetFatherName || stFather.includes(targetFatherName) || targetFatherName.includes(stFather))) {
                        map.set(st.id, st);
                    }
                });
            }

            siblingCandidates = Array.from(map.values());
        }

        // 5. FINAL FALLBACK: If still not resolved from pool, extract from submission payload
        if (siblingCandidates.length === 0) {
            if (activeSub.isFamilyCombined && Array.isArray(activeSub.familyStudents) && activeSub.familyStudents.length > 0) {
                siblingCandidates = activeSub.familyStudents.map(fs => ({
                    id: fs.studentId || fs.id,
                    name: fs.studentName || fs.name,
                    className: fs.className || 'Class',
                    classId: fs.classId || '',
                    rollNo: fs.rollNo || '',
                    monthlyFee: Number(fs.monthlyFee || fs.tuitionFee || (fs.subtotal && !fs.transportFee && !fs.storeDues && !fs.actionFee ? fs.subtotal : 0)),
                    transportFee: Number(fs.transportFee || 0),
                    storeDues: Number(fs.storeDues || 0),
                    storePurchases: fs.storePurchases || [],
                    actionFee: Number(fs.actionFee || 0),
                    actions: fs.actions || [],
                    concessionType: fs.concessionType || '',
                    isScholarship: Boolean(fs.isScholarship),
                    subtotal: Number(fs.subtotal || 0)
                }));
            } else if (activeSub.studentId) {
                siblingCandidates = [{
                    id: activeSub.studentId,
                    name: activeSub.studentName || 'Student',
                    className: activeSub.className || 'Class',
                    classId: activeSub.classId || '',
                    rollNo: activeSub.rollNo || '',
                    monthlyFee: Number(activeSub.monthlyFee || activeSub.tuitionFee || (activeSub.amount && !activeSub.transportFee && !activeSub.storeDues && !activeSub.actionFee ? activeSub.amount : 0)),
                    transportFee: Number(activeSub.transportFee || 0),
                    storeDues: Number(activeSub.storeDues || 0),
                    storePurchases: activeSub.storePurchases || [],
                    actionFee: Number(activeSub.actionFee || 0),
                    actions: activeSub.actions || [],
                    concessionType: activeSub.concessionType || '',
                    isScholarship: Boolean(activeSub.isScholarship),
                    subtotal: Number(activeSub.amount || 0)
                }];
            }
        }

        // Calculate universal itemized fee breakdown for each sibling
        return siblingCandidates.map(st => {
            const breakdown = calculateItemizedFeeBreakdown(
                st, 
                null, 
                feeSettings, 
                subMonthInfo.mIdx, 
                subMonthInfo.yr
            );

            // Merge any specific heads passed in payload
            if (st.transportFee && !breakdown.transportFee) {
                breakdown.transportFee = st.transportFee;
            }
            if (st.storeDues && !breakdown.storeDues) {
                breakdown.storeDues = st.storeDues;
                breakdown.storePurchases = st.storePurchases || [];
            }
            if (st.actionFee && !breakdown.actionFee) {
                breakdown.actionFee = st.actionFee;
                breakdown.actions = st.actions || [];
            }
            if (st.concessionType && !breakdown.concessionType) {
                breakdown.concessionType = st.concessionType;
                breakdown.isScholarship = true;
            }

            // Calculate true total dues
            let calculatedDue = (Number(breakdown.tuitionPayable || breakdown.baseTuition || st.monthlyFee || 0))
                + (Number(breakdown.transportFee || st.transportFee || 0))
                + (Number(breakdown.storeDues || st.storeDues || 0))
                + (Number(breakdown.actionFee || st.actionFee || 0))
                + (Number(breakdown.penaltyFine || 0));

            if (calculatedDue === 0 && st.subtotal > 0) {
                calculatedDue = st.subtotal;
                breakdown.tuitionPayable = st.subtotal;
            }

            const isPrimary = (st.id === targetStudentId) || (activeSub.isFamilyCombined && activeSub.familyStudents?.some(fs => fs.studentId === st.id));
            const isSettled = isMonthKeySettled(st, subMonthInfo.monthKey, subMonthInfo.yr);

            return {
                ...st,
                breakdown,
                calculatedDue,
                isPrimary,
                isSettled
            };
        });
    }, [activeSub, allStudents, localStudents, feeSettings]);

    // Sibling Paying Selection state updater
    useEffect(() => {
        if (!activeSub) return;
        const initialMap = {};
        resolvedFamilyStudents.forEach(st => {
            // Default to checked if it's the primary student or listed in submission
            if (activeSub.isFamilyCombined && Array.isArray(activeSub.familyStudents)) {
                initialMap[st.id] = activeSub.familyStudents.some(fs => fs.studentId === st.id);
            } else {
                initialMap[st.id] = (st.id === activeSub.studentId) || (resolvedFamilyStudents.length === 1);
            }
        });
        setSelectedSiblingsPayingMap(initialMap);
    }, [activeSub?.id, resolvedFamilyStudents.length]);

    const toggleSiblingPaying = (studentId) => {
        setSelectedSiblingsPayingMap(prev => ({
            ...prev,
            [studentId]: !prev[studentId]
        }));
    };

    // Calculate Grand Total of checked siblings
    const totalCalculatedDue = useMemo(() => {
        return resolvedFamilyStudents
            .filter(st => selectedSiblingsPayingMap[st.id] !== false)
            .reduce((sum, st) => sum + (Number(st.calculatedDue) || 0), 0);
    }, [resolvedFamilyStudents, selectedSiblingsPayingMap]);

    const slipPaidAmount = Number(activeSub?.amount) || 0;
    const isExactMatch = totalCalculatedDue === slipPaidAmount;
    const discrepancy = slipPaidAmount - totalCalculatedDue;

    // Filtered lists for rendering
    const applyCommonSearch = (sub) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            (sub.studentName && sub.studentName.toLowerCase().includes(q)) ||
            (sub.className && sub.className.toLowerCase().includes(q)) ||
            (sub.rollNo && sub.rollNo.toString().toLowerCase().includes(q)) ||
            (sub.transactionId && sub.transactionId.toLowerCase().includes(q)) ||
            (sub.receiptNo && sub.receiptNo.toLowerCase().includes(q)) ||
            (sub.parentName && sub.parentName.toLowerCase().includes(q)) ||
            (sub.parentPhone && sub.parentPhone.includes(q)) ||
            (sub.paymentMethod && sub.paymentMethod.toLowerCase().includes(q))
        );
    };

    const applyMethodFilter = (sub) => {
        if (filterMethod === 'all') return true;
        if (filterMethod === 'family') return Boolean(sub.isFamilyCombined);
        const m = (sub.paymentMethod || '').toLowerCase();
        if (filterMethod === 'easypaisa') return m.includes('easypaisa');
        if (filterMethod === 'jazzcash') return m.includes('jazzcash');
        if (filterMethod === 'bank') return m.includes('bank') || m.includes('meezan') || m.includes('transfer') || m.includes('hbl') || m.includes('ubl') || m.includes('alfalah');
        return true;
    };

    const filteredCounterList = useMemo(() => {
        return pendingSubs.filter(s => applyCommonSearch(s) && applyMethodFilter(s));
    }, [pendingSubs, searchQuery, filterMethod]);

    // Monthly Scoped History list
    const monthHistorySubs = useMemo(() => {
        if (historySelectedMonth === 'all') return historySubs;
        return historySubs.filter(s => getSubmissionMonthKey(s) === historySelectedMonth);
    }, [historySubs, historySelectedMonth]);

    const filteredHistoryList = useMemo(() => {
        return monthHistorySubs.filter(s => {
            if (!applyCommonSearch(s) || !applyMethodFilter(s)) return false;
            if (filterStatus === 'all') return true;
            return s.status === filterStatus;
        });
    }, [monthHistorySubs, searchQuery, filterMethod, filterStatus]);

    // Reset pagination to page 1 whenever filters or search query change
    useEffect(() => {
        setPendingPage(1);
        setHistoryPage(1);
    }, [searchQuery, filterMethod, filterStatus, historySelectedMonth]);

    // Pagination calculations (25 records per page)
    const pendingTotalPages = Math.max(1, Math.ceil(filteredCounterList.length / ITEMS_PER_PAGE));
    const paginatedPendingList = useMemo(() => {
        const start = (pendingPage - 1) * ITEMS_PER_PAGE;
        return filteredCounterList.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredCounterList, pendingPage]);

    const historyTotalPages = Math.max(1, Math.ceil(filteredHistoryList.length / ITEMS_PER_PAGE));
    const paginatedHistoryList = useMemo(() => {
        const start = (historyPage - 1) * ITEMS_PER_PAGE;
        return filteredHistoryList.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredHistoryList, historyPage]);

    // Handle Approve (Executes Atomic Batch with Multi-Sibling Support)
    const handleApprove = async (subToApprove, allowPartial = false) => {
        const sub = subToApprove || activeSub;
        if (!sub) return;

        if (sub.status === 'approved') {
            alert("This payment submission has already been approved.");
            return;
        }

        const payingStudents = resolvedFamilyStudents.filter(st => selectedSiblingsPayingMap[st.id] !== false);
        if (payingStudents.length === 0) {
            alert("Please select at least one student from the family list to approve this fee payment.");
            return;
        }

        const isMulti = payingStudents.length > 1;
        const finalAmount = Number(sub.amount) || 0;
        const isUnderpaid = totalCalculatedDue > 0 && finalAmount < totalCalculatedDue;

        // 🛡️ Partial Payment Safeguard: Prompt cashier before proceeding with underpaid submission
        if (isUnderpaid && !allowPartial) {
            setPartialConfirmSub(sub);
            return;
        }

        if (!allowPartial) {
            const confirmMsg = isMulti
                ? `Approve combined family fee payment of Rs. ${finalAmount.toLocaleString()} for ${payingStudents.length} students (${payingStudents.map(s => s.name).join(', ')})?`
                : `Approve fee payment of Rs. ${finalAmount.toLocaleString()} for ${sub.studentName || payingStudents[0]?.name || 'Student'} (${sub.className || payingStudents[0]?.className || 'Class'})?`;

            if (!window.confirm(confirmMsg)) {
                return;
            }
        }

        setProcessingId(sub.id);
        try {
            const now = new Date();
            const nowIso = now.toISOString();
            const receiptNo = sub.transactionId ? `ONL-${sub.transactionId}` : `ONL-${Date.now().toString().slice(-6)}`;
            const { monthKey, monthName } = parseMonthInfo(sub.month);

            const batch = writeBatch(db);

            // 1. Process each paying sibling document
            for (const st of payingStudents) {
                const childSubtotal = Number(st.calculatedDue || st.subtotal || 0);
                const classId = st.classId || sub.classId || '';
                const childPaid = isMulti && totalCalculatedDue > 0 
                    ? Math.round((childSubtotal / totalCalculatedDue) * finalAmount) 
                    : finalAmount;
                const childRemaining = Math.max(0, childSubtotal - childPaid);
                const isChildPartial = childRemaining > 0;
                const childStatus = isChildPartial ? 'partial' : 'paid';

                const studentPayload = {
                    monthlyFeeStatus: childStatus,
                    monthlyFeeDate: nowIso,
                    lastPaymentMode: `Online - ${sub.paymentMethod || 'Transfer'}`,
                    lastReceiptNo: receiptNo,
                    lastPaymentAmount: childPaid,
                    lastPaymentProofUrl: sub.proofUrl || null,
                    pendingPaymentSubmission: {
                        status: 'approved',
                        approvedAt: nowIso,
                        receiptNo,
                        isPartial: isChildPartial,
                        remainingBalance: childRemaining
                    },
                    [`monthlyFeeHistory.${monthKey}`]: {
                        status: childStatus,
                        paidAmount: childPaid,
                        remainingBalance: childRemaining,
                        paidAt: nowIso,
                        receiptNo,
                        paymentMode: `Online - ${sub.paymentMethod || 'Transfer'}`,
                        proofUrl: sub.proofUrl || null,
                        transactionId: sub.transactionId || null,
                        monthKey,
                        monthName
                    }
                };

                // Only register full month settlement in paidMonths if 100% paid
                if (!isChildPartial) {
                    studentPayload.paidMonths = arrayUnion(monthKey);
                }

                // Clear store purchases for this month if any
                if (Array.isArray(st.storePurchases)) {
                    studentPayload.storePurchases = st.storePurchases.map(sp => {
                        if (sp.monthKey === monthKey || sp.status === 'unpaid') {
                            return { ...sp, status: 'paid', paidAt: nowIso, receiptNo };
                        }
                        return sp;
                    });
                    studentPayload.storeDues = 0;
                }

                if (classId && st.id) {
                    const classStRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, st.id);
                    batch.set(classStRef, studentPayload, { merge: true });
                }
                if (st.id) {
                    const masterStRef = doc(db, `schools/${schoolId}/students`, st.id);
                    batch.set(masterStRef, studentPayload, { merge: true });
                }
            }

            // 1b. Reset pendingPaymentSubmission for unselected / unapproved siblings in this family
            const unselectedStudents = resolvedFamilyStudents.filter(st => selectedSiblingsPayingMap[st.id] === false);
            for (const unst of unselectedStudents) {
                const classId = unst.classId || '';
                const unselectedPayload = {
                    pendingPaymentSubmission: {
                        status: 'unapproved',
                        reason: 'Not included in the approved online payment voucher',
                        unapprovedAt: nowIso,
                        approvedSubmissionId: sub.id
                    }
                };
                if (classId && unst.id) {
                    const classStRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, unst.id);
                    batch.set(classStRef, unselectedPayload, { merge: true });
                }
                if (unst.id) {
                    const masterStRef = doc(db, `schools/${schoolId}/students`, unst.id);
                    batch.set(masterStRef, unselectedPayload, { merge: true });
                }
            }

            // 2. Create Master Fee Transaction record
            const shortAmt = Math.max(0, totalCalculatedDue - finalAmount);
            const transactionRecord = {
                receiptNo,
                isFamilyCombined: isMulti,
                familyStudents: payingStudents.map(s => {
                    const cSub = Number(s.calculatedDue || s.subtotal || 0);
                    const cPaid = isMulti && totalCalculatedDue > 0 ? Math.round((cSub / totalCalculatedDue) * finalAmount) : finalAmount;
                    return {
                        studentId: s.id,
                        studentName: s.name,
                        className: s.className,
                        classId: s.classId || '',
                        rollNo: s.rollNo || '',
                        subtotal: cSub,
                        paidAmount: cPaid,
                        remainingBalance: Math.max(0, cSub - cPaid),
                        status: cSub > cPaid ? 'partial' : 'paid'
                    };
                }),
                studentId: payingStudents[0]?.id || sub.studentId || '',
                studentName: isMulti ? `Family of ${sub.parentName || payingStudents[0]?.fatherName || 'Parent'} (${payingStudents.length} Students)` : (sub.studentName || payingStudents[0]?.name || 'Student'),
                rollNo: isMulti ? '-' : (sub.rollNo || payingStudents[0]?.rollNo || 'N/A'),
                classId: payingStudents[0]?.classId || sub.classId || '',
                className: isMulti ? `${payingStudents.length} Classes Combined` : (sub.className || payingStudents[0]?.className || 'Class'),
                fatherName: sub.parentName || payingStudents[0]?.fatherName || 'Parent',
                fatherPhone: sub.parentPhone || payingStudents[0]?.fatherPhone || '',
                paidCategories: ['tuition', 'transport', 'action', 'store'],
                totalPaid: finalAmount,
                totalDue: totalCalculatedDue,
                remainingBalance: shortAmt,
                isPartial: isUnderpaid,
                targetMonth: monthName,
                targetMonthKey: monthKey,
                paymentMode: `Online - ${sub.paymentMethod || 'Transfer'}`,
                proofUrl: sub.proofUrl || null,
                transactionId: sub.transactionId || null,
                status: isUnderpaid ? 'partial' : 'paid',
                cashier: 'Online Verification Studio',
                schoolId,
                timestamp: serverTimestamp(),
                createdAt: nowIso
            };

            const txDocRef = doc(db, `schools/${schoolId}/feeTransactions`, receiptNo);
            batch.set(txDocRef, transactionRecord, { merge: true });

            // 3. Update Submission Status to Approved
            const subRef = doc(db, `schools/${schoolId}/paymentSubmissions`, sub.id);
            batch.update(subRef, {
                status: 'approved',
                approvedAt: nowIso,
                receiptNo,
                isPartial: isUnderpaid,
                paidAmount: finalAmount,
                remainingBalance: shortAmt,
                approvedSiblings: payingStudents.map(s => ({ studentId: s.id, studentName: s.name, className: s.className }))
            });

            // 3b. Mark any prior rejected / re-upload submissions for the same students & month as superseded
            submissions.forEach(prevSub => {
                if (prevSub.id !== sub.id && (prevSub.status === 'rejected' || prevSub.status === 'needs_reupload')) {
                    const prevMKey = getSubmissionMonthKey(prevSub);
                    if (prevMKey === monthKey) {
                        const matchesStudent = payingStudents.some(st => st.id === prevSub.studentId) || (sub.parentId && prevSub.parentId === sub.parentId);
                        if (matchesStudent) {
                            const prevSubRef = doc(db, `schools/${schoolId}/paymentSubmissions`, prevSub.id);
                            batch.update(prevSubRef, {
                                superseded: true,
                                supersededBy: sub.id,
                                resolvedByApproved: true,
                                resolvedAt: nowIso
                            });
                        }
                    }
                }
            });

            // 4. Send In-App Notification to Parent
            if (sub.parentId) {
                const notifRef = doc(collection(db, `schools/${schoolId}/notifications`));
                batch.set(notifRef, {
                    id: notifRef.id,
                    parentId: sub.parentId,
                    studentId: sub.studentId || null,
                    title: isUnderpaid ? 'Partial Fee Payment Approved ✓' : 'Fee Payment Approved ✓',
                    message: isUnderpaid
                        ? `Your partial fee payment of Rs. ${finalAmount.toLocaleString()} for ${monthName || sub.month || 'Fee'} has been recorded. Outstanding balance of Rs. ${shortAmt.toLocaleString()} remains due in your ledger. Receipt: ${receiptNo}`
                        : `Your fee payment of Rs. ${finalAmount.toLocaleString()} for ${monthName || sub.month || 'Fee'} has been approved and verified by the school administration. Receipt: ${receiptNo}`,
                    type: 'fee',
                    read: false,
                    createdAt: serverTimestamp()
                });
            }

            await batch.commit();

        } catch (err) {
            console.error("Error approving submission:", err);
            alert("Failed to approve submission: " + err.message);
        } finally {
            setProcessingId(null);
        }
    };

    // Handle Reject
    const confirmReject = async () => {
        if (!rejectingSub) return;
        if (rejectingSub.status === 'approved') {
            alert("Cannot reject an already approved submission.");
            setRejectingSub(null);
            return;
        }

        setProcessingId(rejectingSub.id);
        try {
            const nowIso = new Date().toISOString();
            const message = rejectReason.trim() || 'Payment proof could not be verified by administration.';
            const batch = writeBatch(db);

            const subRef = doc(db, `schools/${schoolId}/paymentSubmissions`, rejectingSub.id);
            batch.update(subRef, {
                status: 'rejected',
                rejectedAt: nowIso,
                rejectReason: message
            });

            const rejectTag = {
                status: 'rejected',
                rejectReason: message,
                rejectedAt: nowIso,
                submissionId: rejectingSub.id,
                paymentMethod: rejectingSub.paymentMethod || 'Online',
                amount: Number(rejectingSub.amount) || 0,
                transactionId: rejectingSub.transactionId || ''
            };

            if (rejectingSub.studentId) {
                let resolvedClassId = rejectingSub.classId;
                if (!resolvedClassId) {
                    try {
                        const mSnap = await getDoc(doc(db, `schools/${schoolId}/students`, rejectingSub.studentId));
                        if (mSnap.exists()) {
                            resolvedClassId = mSnap.data()?.classId;
                        }
                    } catch (_) {}
                }
                if (resolvedClassId) {
                    const classStudentRef = doc(db, `schools/${schoolId}/classes/${resolvedClassId}/students`, rejectingSub.studentId);
                    batch.set(classStudentRef, { pendingPaymentSubmission: rejectTag }, { merge: true });
                }
                const masterStudentRef = doc(db, `schools/${schoolId}/students`, rejectingSub.studentId);
                batch.set(masterStudentRef, { pendingPaymentSubmission: rejectTag }, { merge: true });
            }

            if (rejectingSub.parentId) {
                const notifRef = doc(collection(db, `schools/${schoolId}/notifications`));
                batch.set(notifRef, {
                    id: notifRef.id,
                    parentId: rejectingSub.parentId,
                    studentId: rejectingSub.studentId || null,
                    title: 'Payment Slip Rejected',
                    message: `Payment proof for ${rejectingSub.month || 'Fee'} was rejected: ${message}`,
                    type: 'alert',
                    read: false,
                    createdAt: serverTimestamp()
                });
            }

            await batch.commit();
            setRejectingSub(null);
            setRejectReason('');
        } catch (err) {
            console.error("Error rejecting submission:", err);
            alert("Failed to reject submission: " + err.message);
        } finally {
            setProcessingId(null);
        }
    };

    // Handle Request Re-upload
    const confirmRequestReupload = async () => {
        if (!reuploadSub) return;
        if (reuploadSub.status === 'approved') {
            alert("Cannot request re-upload for an already approved submission.");
            setReuploadSub(null);
            return;
        }

        setProcessingId(reuploadSub.id);
        try {
            const nowIso = new Date().toISOString();
            const message = reuploadNote.trim() || 'Payment proof screenshot is unclear or unreadable. Please upload a clear photo or screenshot.';
            const batch = writeBatch(db);

            const subRef = doc(db, `schools/${schoolId}/paymentSubmissions`, reuploadSub.id);
            batch.update(subRef, {
                status: 'needs_reupload',
                reuploadRequestedAt: nowIso,
                reuploadNote: message
            });

            const reuploadTag = {
                status: 'needs_reupload',
                message,
                requestedAt: nowIso
            };

            if (reuploadSub.classId && reuploadSub.studentId) {
                const classStudentRef = doc(db, `schools/${schoolId}/classes/${reuploadSub.classId}/students`, reuploadSub.studentId);
                batch.set(classStudentRef, { pendingPaymentSubmission: reuploadTag }, { merge: true });
            }
            if (reuploadSub.studentId) {
                const masterStudentRef = doc(db, `schools/${schoolId}/students`, reuploadSub.studentId);
                batch.set(masterStudentRef, { pendingPaymentSubmission: reuploadTag }, { merge: true });
            }

            if (reuploadSub.parentId) {
                const notifRef = doc(collection(db, `schools/${schoolId}/notifications`));
                batch.set(notifRef, {
                    id: notifRef.id,
                    parentId: reuploadSub.parentId,
                    studentId: reuploadSub.studentId || null,
                    title: 'Payment Slip Re-upload Requested',
                    message: `Please upload a clearer receipt for ${reuploadSub.month || 'Fee'}: ${message}`,
                    type: 'alert',
                    read: false,
                    createdAt: serverTimestamp()
                });
            }

            await batch.commit();
            setReuploadSub(null);
            setReuploadNote('');
        } catch (err) {
            console.error("Error requesting slip re-upload:", err);
            alert("Failed to request re-upload: " + err.message);
        } finally {
            setProcessingId(null);
        }
    };

    // =========================================================================
    // 🧠 AI SLIP AUDITOR & ANTI-FRAUD VERIFIER ACTIONS
    // =========================================================================
    const handleTriggerAiScan = async (subToScan) => {
        const sub = subToScan || activeSub;
        if (!sub || !sub.proofUrl) {
            alert("No payment slip image found to scan.");
            return;
        }
        setAiScanningId(sub.id);
        setAiScanError(null);
        try {
            await triggerAiAuditAndSync(schoolId, sub.id, sub.proofUrl, sub);
        } catch (err) {
            console.error("AI Slip Scan error:", err);
            setAiScanError(err.message || "Failed to scan slip with AI.");
            alert("AI Scan Notice: " + (err.message || "Failed to scan slip."));
        } finally {
            setAiScanningId(null);
        }
    };

    const handleAutoReuploadFromAi = (sub) => {
        if (!sub) return;
        const reason = sub.aiScan?.unmatchedReason || "AI Slip Auditor: The uploaded image is not a recognized bank deposit slip or transaction receipt. Please upload a clear original payment receipt screenshot/photo.";
        setReuploadNote(reason);
        setReuploadSub(sub);
    };

    const handleApplyAiTrx = async (sub, detectedTrx) => {
        if (!sub || !detectedTrx) return;
        try {
            const subDocRef = doc(db, `schools/${schoolId}/paymentSubmissions`, sub.id);
            await updateDoc(subDocRef, {
                transactionId: detectedTrx
            });
        } catch (err) {
            console.error("Error applying AI TRX ID:", err);
            alert("Failed to update TRX ID: " + err.message);
        }
    };

    // =========================================================================
    // 🧪 DEMO SLIPS INJECTOR & PURGE ENGINE (PREVIEW TESTING)
    // =========================================================================
    const MOCK_DEMO_SLIPS = [
        { 
            student: 'Muhammad Ali', father: 'Tariq Mehmood', class: 'Class 5', phone: '03001234567', method: 'EasyPaisa', amount: 4500,
            monthlyFee: 3000, transportFee: 1500
        },
        { 
            student: 'Fatima Zahra', father: 'Zahid Hussain', class: 'Class 8', phone: '03019876543', method: 'JazzCash', amount: 5200,
            monthlyFee: 4000, storeDues: 1200, storePurchases: [{ title: 'Uniform & Oxford Books Pack', amount: 1200 }]
        },
        { 
            student: 'Ayan Ahmed', father: 'Ahmed Bilal', class: 'Class 2', phone: '03124567890', method: 'Bank Transfer (Meezan)', amount: 6000,
            monthlyFee: 4000, transportFee: 1500, actionFee: 500, actions: [{ name: 'Midterm Assessment Charges', amount: 500 }]
        },
        { 
            student: 'Zainab Bibi', father: 'Muhammad Asif', class: 'Class 9', phone: '03215678901', method: 'EasyPaisa', amount: 7500,
            monthlyFee: 6000, transportFee: 1500
        },
        { 
            student: 'Usman Khan', father: 'Kamran Khan', class: 'Class 10', phone: '03337890123', method: 'JazzCash', amount: 8000,
            monthlyFee: 6500, actionFee: 1500, actions: [{ name: 'Science Lab & Board Reg Charges', amount: 1500 }]
        },
        { 
            student: 'Ayesha Tariq', father: 'Tariq Jameel', class: 'Class 4', phone: '03456789012', method: 'Bank Transfer (HBL)', amount: 4200,
            monthlyFee: 3500, storeDues: 700, storePurchases: [{ title: 'Annual Stationery & Workbooks', amount: 700 }]
        },
        { 
            student: 'Hamza Malik', father: 'Shahid Malik', class: 'Class 1', phone: '03023456789', method: 'EasyPaisa', amount: 3800,
            monthlyFee: 3800
        },
        { 
            student: 'Mahnoor Shah', father: 'Syed Imran Shah', class: 'Class 7', phone: '03158901234', method: 'JazzCash', amount: 5500,
            monthlyFee: 4000, transportFee: 1500
        },
        { 
            student: 'Ibrahim Riaz', father: 'Riaz Ahmed', class: 'Class 3', phone: '03229012345', method: 'Bank Transfer (UBL)', amount: 4600,
            monthlyFee: 3500, storeDues: 1100, storePurchases: [{ title: 'School Bag & Notebooks', amount: 1100 }]
        },
        { 
            student: 'Dua Fatima', father: 'Naveed Akhtar', class: 'Nursery', phone: '03340123456', method: 'EasyPaisa', amount: 3500,
            monthlyFee: 3500
        },
        { 
            student: 'Bilal Hassan', father: 'Hassan Raza', class: 'Class 6', phone: '03461234567', method: 'JazzCash', amount: 4800,
            monthlyFee: 3600, transportFee: 1200
        },
        { 
            student: 'Khadija Tul Kubra', father: 'Muhammad Waqas', class: 'Class 2', phone: '03032345678', method: 'Bank Transfer (Alfalah)', amount: 4000,
            monthlyFee: 3500, actionFee: 500, actions: [{ name: 'Sports Day & Activity Fee', amount: 500 }]
        },
        { 
            student: 'Abdul Hadi', father: 'Kashif Mehmood', class: 'Class 5', phone: '03133456789', method: 'EasyPaisa', amount: 4500,
            monthlyFee: 3000, transportFee: 1500
        },
        { 
            student: 'Hoorain Imran', father: 'Imran Ashraf', class: 'KG', phone: '03234567890', method: 'JazzCash', amount: 3500,
            monthlyFee: 3500
        },
        { 
            student: 'Huzaifa Siddiqui', father: 'Siddique Akbar', class: 'Class 9', phone: '03355678901', method: 'Bank Transfer (Meezan)', amount: 7200,
            monthlyFee: 5500, transportFee: 1700
        },
        { 
            student: 'Maryam Noor', father: 'Noor Muhammad', class: 'Class 1', phone: '03476789012', method: 'EasyPaisa', amount: 3800,
            monthlyFee: 3800
        },
        { 
            student: 'Affan Farooq', father: 'Farooq Azam', class: 'Class 3', phone: '03047890123', method: 'JazzCash', amount: 4200,
            monthlyFee: 3200, transportFee: 1000
        },
        { 
            student: 'Anaya Rehman', father: 'Abdul Rehman', class: 'Class 8', phone: '03148901234', method: 'Bank Transfer (Faysal)', amount: 5600,
            monthlyFee: 4500, storeDues: 1100, storePurchases: [{ title: 'Winter Jacket & Badge', amount: 1100 }]
        },
        { 
            student: 'Subhan Butt', father: 'Babar Butt', class: 'Class 4', phone: '03249012345', method: 'EasyPaisa', amount: 4400,
            monthlyFee: 3200, transportFee: 1200
        },
        { 
            student: 'Emaan Zahid', father: 'Zahid Mehmood', class: 'Class 7', phone: '03360123456', method: 'JazzCash', amount: 5300,
            monthlyFee: 4000, transportFee: 1300
        },
        { 
            student: 'Arham & Manahil (Family)', father: 'Dr. Shahzad Ali', class: 'Class 2 & Class 6', phone: '03009988776', method: 'Bank Transfer (Meezan)', amount: 11500,
            isFamilyCombined: true,
            familyStudents: [
                { studentName: 'Arham Shahzad', className: 'Class 2', rollNo: '12', monthlyFee: 3500, transportFee: 1500, subtotal: 5000 },
                { studentName: 'Manahil Shahzad', className: 'Class 6', rollNo: '08', monthlyFee: 4500, transportFee: 1500, storeDues: 500, storePurchases: [{ title: 'Science Kit', amount: 500 }], subtotal: 6500 }
            ]
        },
        { 
            student: 'Hashir, Rayan & Zoya (Family)', father: 'Muhammad Zubair', class: 'Class 1, 4 & 7', phone: '03112233445', method: 'JazzCash', amount: 15800,
            isFamilyCombined: true,
            familyStudents: [
                { studentName: 'Hashir Zubair', className: 'Class 1', rollNo: '05', monthlyFee: 3000, transportFee: 1500, subtotal: 4500 },
                { studentName: 'Rayan Zubair', className: 'Class 4', rollNo: '19', monthlyFee: 3500, transportFee: 1500, storeDues: 300, storePurchases: [{ title: 'Diary & Badge', amount: 300 }], subtotal: 5300 },
                { studentName: 'Zoya Zubair', className: 'Class 7', rollNo: '03', monthlyFee: 4000, transportFee: 1500, actionFee: 500, actions: [{ name: 'Annual Exam Fee', amount: 500 }], subtotal: 6000 }
            ]
        },
        { 
            student: 'Saad Ur Rehman', father: 'Attiq Ur Rehman', class: 'Class 10', phone: '03223344556', method: 'EasyPaisa', amount: 8500,
            monthlyFee: 6500, transportFee: 2000
        },
        { 
            student: 'Minahil Tariq', father: 'Tariq Bashir', class: 'Class 5', phone: '03334455667', method: 'Bank Transfer (HBL)', amount: 4900,
            monthlyFee: 3500, transportFee: 1400
        },
        { 
            student: 'Abdullah Qureshi', father: 'Tanveer Qureshi', class: 'Class 6', phone: '03445566778', method: 'JazzCash', amount: 5100,
            monthlyFee: 3800, transportFee: 1300
        }
    ];

    const createMockSlipDataUrl = (studentName, amount, trxId, method) => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 600;
            canvas.height = 850;
            const ctx = canvas.getContext('2d');

            // Background
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(0, 0, 600, 850);

            // Header Banner
            const isEasyPaisa = String(method).toLowerCase().includes('easypaisa');
            const isJazzCash = String(method).toLowerCase().includes('jazzcash');
            ctx.fillStyle = isEasyPaisa ? '#059669' : (isJazzCash ? '#b91c1c' : '#1e3a8a');
            ctx.fillRect(0, 0, 600, 150);

            // Header Title
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(isEasyPaisa ? 'EASYPAISA PAYMENT' : (isJazzCash ? 'JAZZCASH RECEIPT' : 'BANK TRANSFER SLIP'), 300, 60);

            ctx.fillStyle = '#e2e8f0';
            ctx.font = '15px Arial, sans-serif';
            ctx.fillText('Official School Fee Transfer Proof', 300, 95);

            // Success Circle
            ctx.beginPath();
            ctx.arc(300, 210, 42, 0, 2 * Math.PI);
            ctx.fillStyle = '#ecfdf5';
            ctx.fill();
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#10b981';
            ctx.stroke();

            ctx.fillStyle = '#059669';
            ctx.font = 'bold 36px Arial, sans-serif';
            ctx.fillText('✓', 300, 222);

            // Amount Label & Value
            ctx.fillStyle = '#64748b';
            ctx.font = '14px Arial, sans-serif';
            ctx.fillText('Amount Paid to School', 300, 285);

            ctx.fillStyle = '#0f172a';
            ctx.font = '900 34px Arial, sans-serif';
            ctx.fillText(`PKR ${Number(amount).toLocaleString()}`, 300, 330);

            // Receipt Details Card
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1.5;
            ctx.fillRect(40, 365, 520, 360);
            ctx.strokeRect(40, 365, 520, 360);

            const drawRow = (label, value, y, valColor = '#0f172a', isMono = false) => {
                ctx.textAlign = 'left';
                ctx.fillStyle = '#64748b';
                ctx.font = '14px Arial, sans-serif';
                ctx.fillText(label, 70, y);

                ctx.textAlign = 'right';
                ctx.fillStyle = valColor;
                ctx.font = isMono ? 'bold 15px monospace' : 'bold 15px Arial, sans-serif';
                ctx.fillText(value, 530, y);

                ctx.strokeStyle = '#f1f5f9';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(70, y + 20);
                ctx.lineTo(530, y + 20);
                ctx.stroke();
            };

            drawRow('Student Name:', studentName, 415);
            drawRow('Payment Channel:', method, 470, '#047857');
            drawRow('Transaction ID (TRX):', trxId, 525, '#0284c7', true);
            drawRow('Paid To Account:', 'The Smart School A/C', 580);
            drawRow('Fee Billing Month:', 'October 2026', 635, '#4f46e5');
            drawRow('Status:', 'TRANSACTION SUCCESSFUL', 690, '#16a34a');

            // Footer
            ctx.textAlign = 'center';
            ctx.fillStyle = '#94a3b8';
            ctx.font = '12px Arial, sans-serif';
            ctx.fillText('Official Electronic Payment Slip • MAI School System', 300, 785);

            return canvas.toDataURL('image/jpeg', 0.9);
        } catch (_) {
            return '';
        }
    };

    const handleInjectDemoData = async () => {
        const currentSid = effectiveSchoolId || schoolId;
        if (!currentSid) {
            alert("School ID is missing.");
            return;
        }
        if (!isDemoAccount) {
            alert("Restricted: Demo data injection is only available for Demo Presentation Account 6257 or Dev environment.");
            return;
        }
        setIsInjectingDemo(true);
        try {
            const batch = writeBatch(db);
            const now = Date.now();

            MOCK_DEMO_SLIPS.forEach((item, index) => {
                const subDocRef = doc(collection(db, `schools/${currentSid}/paymentSubmissions`));
                const trxId = item.method.includes('EasyPaisa') ? `EP-${Math.floor(1000000000 + Math.random() * 9000000000)}` : (item.method.includes('JazzCash') ? `JC-${Math.floor(1000000000 + Math.random() * 9000000000)}` : `BNK-${Math.floor(100000000 + Math.random() * 900000000)}`);
                const submittedAt = new Date(now - (index * 12 * 60 * 1000)).toISOString();

                let demoAiScan = null;
                if (index === 0) {
                    demoAiScan = {
                        status: 'completed',
                        isValidReceipt: true,
                        detectedAmount: item.amount,
                        detectedTrxId: trxId,
                        paymentChannel: 'EasyPaisa',
                        receiverTitle: 'The Smart School',
                        senderName: item.father,
                        detectedDate: '2026-10-15',
                        confidenceScore: 0.99
                    };
                } else if (index === 1) {
                    demoAiScan = {
                        status: 'completed',
                        isValidReceipt: true,
                        detectedAmount: item.amount,
                        detectedTrxId: trxId,
                        paymentChannel: 'JazzCash',
                        receiverTitle: 'Official School A/C',
                        senderName: item.father,
                        detectedDate: '2026-10-15',
                        confidenceScore: 0.97
                    };
                } else if (index === 2) {
                    // Demo of Wrong / Unmatched Image
                    demoAiScan = {
                        status: 'unmatched_image',
                        isValidReceipt: false,
                        unmatchedReason: 'The uploaded file is a personal photo/landscape, not an official bank deposit or transfer slip.',
                        confidenceScore: 0.12
                    };
                } else if (index === 3) {
                    // 100% Exact Match Demo for Zainab Bibi
                    demoAiScan = {
                        status: 'completed',
                        isValidReceipt: true,
                        detectedAmount: item.amount,
                        detectedTrxId: trxId,
                        paymentChannel: 'EasyPaisa',
                        receiverTitle: 'The Smart School',
                        senderName: item.father,
                        detectedDate: '2026-10-15',
                        confidenceScore: 0.99
                    };
                } else if (index === 4) {
                    // Demo of Real Tampering Discrepancy: Parent typed 8,000 in form, but uploaded a 5,000 slip!
                    demoAiScan = {
                        status: 'completed',
                        isValidReceipt: true,
                        detectedAmount: 5000,
                        detectedTrxId: trxId,
                        paymentChannel: 'JazzCash',
                        receiverTitle: 'The Smart School',
                        senderName: item.father,
                        detectedDate: '2026-10-14',
                        confidenceScore: 0.96
                    };
                }

                // Ensure the drawn slip image strictly matches the AI scan amount (e.g. 5,000 for tampering demo)
                const slipAmountToDraw = (demoAiScan && demoAiScan.detectedAmount !== null && demoAiScan.detectedAmount !== undefined) 
                    ? demoAiScan.detectedAmount 
                    : item.amount;

                const payload = {
                    id: subDocRef.id,
                    isDemo: true,
                    studentName: item.student,
                    studentId: `demo_st_${index + 1}`,
                    parentName: item.father,
                    parentPhone: item.phone,
                    parentId: `demo_parent_${index + 1}`,
                    className: item.class,
                    rollNo: `${10 + index}`,
                    amount: item.amount,
                    monthlyFee: item.monthlyFee || item.amount,
                    transportFee: item.transportFee || 0,
                    storeDues: item.storeDues || 0,
                    storePurchases: item.storePurchases || [],
                    actionFee: item.actionFee || 0,
                    actions: item.actions || [],
                    concessionType: item.concessionType || '',
                    paymentMethod: item.method,
                    transactionId: trxId,
                    month: 'October 2026',
                    status: 'pending',
                    submittedAt,
                    createdAt: submittedAt,
                    isFamilyCombined: Boolean(item.isFamilyCombined),
                    familyStudents: item.familyStudents || null,
                    proofUrl: createMockSlipDataUrl(item.student, slipAmountToDraw, trxId, item.method),
                    aiScan: demoAiScan,
                    notes: 'Demo slip generated for preview and layout inspection'
                };

                batch.set(subDocRef, payload);
            });

            await batch.commit();
        } catch (err) {
            console.error("Error injecting demo slips:", err);
            alert("Failed to inject demo data: " + err.message);
        } finally {
            setIsInjectingDemo(false);
        }
    };

    const handleClearDemoData = async () => {
        const currentSid = effectiveSchoolId || schoolId;
        if (!currentSid) return;
        if (!window.confirm("Are you sure you want to delete all injected demo slips?")) return;

        setIsInjectingDemo(true);
        try {
            const demoSubs = submissions.filter(s => s.isDemo);
            if (demoSubs.length === 0) {
                alert("No demo slips found to clear.");
                return;
            }

            const batch = writeBatch(db);
            demoSubs.forEach(s => {
                const ref = doc(db, `schools/${currentSid}/paymentSubmissions`, s.id);
                batch.delete(ref);
            });

            await batch.commit();
        } catch (err) {
            console.error("Error clearing demo slips:", err);
            alert("Failed to clear demo data: " + err.message);
        } finally {
            setIsInjectingDemo(false);
        }
    };

    const demoSlipsCount = useMemo(() => submissions.filter(s => s.isDemo).length, [submissions]);

    const getMethodBadge = (method) => {
        const m = (method || '').toLowerCase();
        if (m.includes('easypaisa')) {
            return { label: 'EasyPaisa', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', icon: Smartphone };
        }
        if (m.includes('jazzcash')) {
            return { label: 'JazzCash', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', icon: Smartphone };
        }
        if (m.includes('bank') || m.includes('transfer') || m.includes('meezan') || m.includes('hbl') || m.includes('ubl')) {
            return { label: method || 'Bank Transfer', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', icon: Landmark };
        }
        return { label: method || 'Online Transfer', bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff', icon: CreditCard };
    };

    const pendingCount = pendingSubs.length;
    const approvedCount = useMemo(() => monthHistorySubs.filter(s => s.status === 'approved').length, [monthHistorySubs]);
    const rejectedCount = useMemo(() => monthHistorySubs.filter(s => s.status === 'rejected').length, [monthHistorySubs]);
    const reuploadCount = useMemo(() => monthHistorySubs.filter(s => s.status === 'needs_reupload').length, [monthHistorySubs]);
    const totalMonthApprovedAmount = useMemo(() => {
        return monthHistorySubs
            .filter(s => s.status === 'approved')
            .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    }, [monthHistorySubs]);

    const selectedMonthLabel = useMemo(() => {
        const opt = historyMonthOptions.find(o => o.value === historySelectedMonth);
        return opt ? opt.label.replace(' (Current)', '').replace('🗓️ ', '') : historySelectedMonth;
    }, [historyMonthOptions, historySelectedMonth]);

    // Renders sleek pagination bar for tables
    const renderPagination = (currentPage, totalPages, totalItems, onPageChange, itemLabel = 'records') => {
        if (totalItems === 0) return null;
        
        const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
        const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);

        const getPageNumbers = () => {
            const pages = [];
            if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
            } else {
                if (currentPage <= 4) {
                    pages.push(1, 2, 3, 4, 5, '...', totalPages);
                } else if (currentPage >= totalPages - 3) {
                    pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
                } else {
                    pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
                }
            }
            return pages;
        };

        return (
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexWrap: 'wrap', gap: '0.85rem', padding: '0.9rem 1.25rem',
                background: '#f8fafc', borderTop: '1px solid #e2e8f0',
                borderBottomLeftRadius: '18px', borderBottomRightRadius: '18px'
            }}>
                <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: '600' }}>
                    Showing <strong style={{ color: '#0f172a' }}>{startItem}</strong> to <strong style={{ color: '#0f172a' }}>{endItem}</strong> of <strong style={{ color: '#0f172a' }}>{totalItems}</strong> {itemLabel}
                </div>

                {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <button
                            type="button"
                            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                padding: '0.4rem 0.75rem', borderRadius: '8px',
                                border: '1px solid #cbd5e1', background: currentPage === 1 ? '#f1f5f9' : '#ffffff',
                                color: currentPage === 1 ? '#94a3b8' : '#334155',
                                fontSize: '0.8rem', fontWeight: '700',
                                cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                            }}
                        >
                            <ChevronLeft size={15} /> Prev
                        </button>

                        {getPageNumbers().map((p, idx) => {
                            if (p === '...') {
                                return (
                                    <span key={`dots-${idx}`} style={{ padding: '0.4rem 0.5rem', color: '#94a3b8', fontSize: '0.82rem', fontWeight: '700' }}>
                                        ...
                                    </span>
                                );
                            }
                            const isSelected = p === currentPage;
                            return (
                                <button
                                    key={`page-${p}`}
                                    type="button"
                                    onClick={() => onPageChange(p)}
                                    style={{
                                        minWidth: '34px', height: '34px', padding: '0 0.5rem',
                                        borderRadius: '8px', border: isSelected ? 'none' : '1px solid #cbd5e1',
                                        background: isSelected ? 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)' : '#ffffff',
                                        color: isSelected ? '#ffffff' : '#334155',
                                        fontSize: '0.82rem', fontWeight: isSelected ? '900' : '700',
                                        cursor: 'pointer',
                                        boxShadow: isSelected ? '0 2px 6px rgba(79, 70, 229, 0.3)' : 'none',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    {p}
                                </button>
                            );
                        })}

                        <button
                            type="button"
                            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                padding: '0.4rem 0.75rem', borderRadius: '8px',
                                border: '1px solid #cbd5e1', background: currentPage === totalPages ? '#f1f5f9' : '#ffffff',
                                color: currentPage === totalPages ? '#94a3b8' : '#334155',
                                fontSize: '0.8rem', fontWeight: '700',
                                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                            }}
                        >
                            Next <ChevronRight size={15} />
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2.5rem' }}>
            
            {/* Realtime Floating Toast Notification */}
            {realtimeToast && (
                <div style={{
                    position: 'fixed', top: '24px', right: '24px', zIndex: 10000,
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    color: 'white', padding: '1rem 1.25rem', borderRadius: '16px',
                    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25), 0 8px 10px -6px rgba(0,0,0,0.25)',
                    display: 'flex', alignItems: 'center', gap: '1rem', maxWidth: '440px',
                    border: '1px solid rgba(255,255,255,0.25)', animation: 'slideInRight 0.3s ease'
                }}>
                    <div style={{ background: 'rgba(255,255,255,0.2)', padding: '0.6rem', borderRadius: '12px' }}>
                        <Bell size={24} className="animate-bounce" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '800', fontSize: '0.95rem' }}>⚡ New Online Payment Slip!</div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                            {realtimeToast.studentName} ({realtimeToast.className}) • Rs. {Number(realtimeToast.amount || 0).toLocaleString()}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedSubId(realtimeToast.id);
                                setActiveSubTab('counter');
                                setRealtimeToast(null);
                            }}
                            style={{
                                padding: '0.45rem 0.85rem', borderRadius: '9px', border: 'none',
                                background: '#ffffff', color: '#0369a1', fontWeight: '800', fontSize: '0.85rem',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                            }}
                        >
                            <ShieldCheck size={16} /> Open Cockpit
                        </button>
                        <button
                            type="button"
                            onClick={() => setRealtimeToast(null)}
                            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', color: '#ffffff', padding: '0.5rem', cursor: 'pointer' }}
                            title="Dismiss"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Top Sub-Nav Switch: 3-Tab Master Architecture */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexWrap: 'wrap', gap: '1rem', background: 'white', padding: '0.85rem 1.25rem',
                borderRadius: '18px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
            }}>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* TAB 1: Online Fee Counter Studio */}
                    <button
                        type="button"
                        onClick={() => setActiveSubTab('counter')}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.6rem 1.25rem', borderRadius: '12px', border: 'none',
                            fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer',
                            background: activeSubTab === 'counter' ? 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)' : '#f8fafc',
                            color: activeSubTab === 'counter' ? 'white' : '#64748b',
                            boxShadow: activeSubTab === 'counter' ? '0 4px 10px rgba(79, 70, 229, 0.3)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Sparkles size={17} />
                        <span>Online Fee Counter</span>
                        <span style={{
                            padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '900',
                            background: activeSubTab === 'counter' ? 'rgba(239, 68, 68, 0.95)' : (pendingCount > 0 ? '#ef4444' : '#94a3b8'),
                            color: 'white'
                        }}>
                            {pendingCount} Pending
                        </span>
                    </button>

                    {/* TAB 2: Dedicated Pending Queue List */}
                    <button
                        type="button"
                        onClick={() => setActiveSubTab('pending_queue')}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.6rem 1.25rem', borderRadius: '12px', border: 'none',
                            fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer',
                            background: activeSubTab === 'pending_queue' ? 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)' : '#f8fafc',
                            color: activeSubTab === 'pending_queue' ? 'white' : '#64748b',
                            boxShadow: activeSubTab === 'pending_queue' ? '0 4px 10px rgba(79, 70, 229, 0.3)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Clock size={17} />
                        <span>Pending Queue</span>
                        <span style={{
                            padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '800',
                            background: activeSubTab === 'pending_queue' ? 'rgba(255,255,255,0.25)' : (pendingCount > 0 ? '#fee2e2' : '#e2e8f0'),
                            color: activeSubTab === 'pending_queue' ? 'white' : (pendingCount > 0 ? '#b91c1c' : '#475569')
                        }}>
                            {pendingCount} Slips
                        </span>
                    </button>

                    {/* TAB 3: Online Fee History */}
                    <button
                        type="button"
                        onClick={() => setActiveSubTab('history')}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.6rem 1.25rem', borderRadius: '12px', border: 'none',
                            fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer',
                            background: activeSubTab === 'history' ? 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)' : '#f8fafc',
                            color: activeSubTab === 'history' ? 'white' : '#64748b',
                            boxShadow: activeSubTab === 'history' ? '0 4px 10px rgba(79, 70, 229, 0.3)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        <FileCheck size={17} />
                        <span>Online Fee History</span>
                        <span style={{
                            padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '800',
                            background: activeSubTab === 'history' ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
                            color: activeSubTab === 'history' ? 'white' : '#475569'
                        }}>
                            {monthHistorySubs.length} Records
                        </span>
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {isDemoAccount && demoSlipsCount > 0 && (
                        <button
                            type="button"
                            onClick={handleClearDemoData}
                            disabled={isInjectingDemo}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.5rem 0.85rem', borderRadius: '10px',
                                border: '1px solid #fecaca', background: '#fef2f2',
                                color: '#b91c1c', fontSize: '0.8rem', fontWeight: '800',
                                cursor: isInjectingDemo ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s'
                            }}
                            title="Remove all injected demo slips from the system (Presentation Demo Only)"
                        >
                            <Trash2 size={15} />
                            <span>Clear Demo ({demoSlipsCount})</span>
                        </button>
                    )}

                    {isDemoAccount && (
                        <button
                            type="button"
                            onClick={handleInjectDemoData}
                            disabled={isInjectingDemo}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.5rem 0.95rem', borderRadius: '10px', border: 'none',
                                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                color: '#ffffff', fontSize: '0.8rem', fontWeight: '800',
                                cursor: isInjectingDemo ? 'not-allowed' : 'pointer',
                                boxShadow: '0 2px 6px rgba(245, 158, 11, 0.3)',
                                transition: 'all 0.15s'
                            }}
                            title="Inject 25 realistic mock slips (JazzCash, EasyPaisa, Banks, Family Combined) for School ID 6257 presentation"
                        >
                            {isInjectingDemo ? (
                                <>
                                    <Loader2 size={15} className="animate-spin" />
                                    <span>Injecting...</span>
                                </>
                            ) : (
                                <>
                                    <Zap size={15} />
                                    <span>⚡ Inject 25 Demo Slips</span>
                                </>
                            )}
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => setAudioEnabled(!audioEnabled)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.5rem 0.85rem', borderRadius: '10px', border: '1px solid #cbd5e1',
                            background: '#f8fafc', color: audioEnabled ? '#16a34a' : '#94a3b8',
                            fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer'
                        }}
                        title={audioEnabled ? "Audio chimes active for incoming slips" : "Audio chimes muted"}
                    >
                        {audioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                        <span>{audioEnabled ? 'Chime ON' : 'Muted'}</span>
                    </button>
                </div>
            </div>

            {/* Sub-Header Channel Filters, Month Filter & Search */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexWrap: 'wrap', gap: '0.85rem', background: 'white', padding: '0.85rem 1.25rem',
                borderRadius: '16px', border: '1px solid #e2e8f0'
            }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Channel Selector */}
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Filter size={15} /> Channel:
                        </span>
                        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                            <select
                                value={filterMethod}
                                onChange={(e) => setFilterMethod(e.target.value)}
                                style={{
                                    padding: '0.45rem 2.25rem 0.45rem 0.85rem',
                                    borderRadius: '10px',
                                    fontSize: '0.82rem',
                                    fontWeight: '700',
                                    border: filterMethod !== 'all' ? '1.5px solid #4f46e5' : '1px solid #cbd5e1',
                                    background: filterMethod !== 'all' ? '#e0e7ff' : '#f8fafc',
                                    color: filterMethod !== 'all' ? '#3730a3' : '#334155',
                                    cursor: 'pointer',
                                    outline: 'none',
                                    appearance: 'none',
                                    WebkitAppearance: 'none',
                                    MozAppearance: 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <option value="all">All Channels</option>
                                <option value="easypaisa">🟢 EasyPaisa</option>
                                <option value="jazzcash">🔴 JazzCash</option>
                                <option value="bank">🔵 Bank Transfer</option>
                                <option value="family">🟣 Family Combined</option>
                            </select>
                            <ChevronDown size={14} style={{ position: 'absolute', right: '10px', pointerEvents: 'none', color: filterMethod !== 'all' ? '#3730a3' : '#64748b' }} />
                        </div>
                    </div>

                    {/* Month Selector in History Tab */}
                    {activeSubTab === 'history' && (
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Calendar size={15} /> Month:
                            </span>
                            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                                <select
                                    value={historySelectedMonth}
                                    onChange={(e) => setHistorySelectedMonth(e.target.value)}
                                    style={{
                                        padding: '0.45rem 2.25rem 0.45rem 0.85rem',
                                        borderRadius: '10px',
                                        fontSize: '0.82rem',
                                        fontWeight: '700',
                                        border: historySelectedMonth !== 'all' ? '1.5px solid #4f46e5' : '1px solid #cbd5e1',
                                        background: historySelectedMonth !== 'all' ? '#eef2ff' : '#f8fafc',
                                        color: historySelectedMonth !== 'all' ? '#3730a3' : '#334155',
                                        cursor: 'pointer',
                                        outline: 'none',
                                        appearance: 'none',
                                        WebkitAppearance: 'none',
                                        MozAppearance: 'none',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {historyMonthOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} style={{ position: 'absolute', right: '10px', pointerEvents: 'none', color: historySelectedMonth !== 'all' ? '#3730a3' : '#64748b' }} />
                            </div>
                        </div>
                    )}
                </div>

                {activeSubTab === 'history' && (
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        {[
                            { id: 'all', label: `All (${monthHistorySubs.length})` },
                            { id: 'approved', label: `Approved (${approvedCount})`, color: '#16a34a' },
                            { id: 'rejected', label: `Rejected (${rejectedCount})`, color: '#dc2626' },
                            { id: 'needs_reupload', label: `Re-upload (${reuploadCount})`, color: '#d97706' }
                        ].map(st => (
                            <button
                                key={st.id}
                                type="button"
                                onClick={() => setFilterStatus(st.id)}
                                style={{
                                    padding: '0.35rem 0.75rem', borderRadius: '10px', fontSize: '0.78rem', fontWeight: '700',
                                    border: 'none', cursor: 'pointer',
                                    background: filterStatus === st.id ? '#1e293b' : '#f1f5f9',
                                    color: filterStatus === st.id ? 'white' : (st.color || '#475569')
                                }}
                            >
                                {st.label}
                            </button>
                        ))}
                    </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', padding: '0.45rem 0.85rem', borderRadius: '10px', border: '1px solid #cbd5e1', minWidth: '260px' }}>
                    <Search size={16} color="#64748b" style={{ marginRight: '0.5rem' }} />
                    <input
                        type="text"
                        placeholder="Search student, TRX ID, roll #, phone..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', width: '100%', color: '#1e293b' }}
                    />
                    {searchQuery && (
                        <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* ========================================================================= */}
            {/* TAB 1: ⚡ ONLINE STUDIO FEE COUNTER COCKPIT                                */}
            {/* ========================================================================= */}
            {activeSubTab === 'counter' && (
                <div>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '4rem', background: 'white', borderRadius: '18px' }}>
                            <Loader2 size={36} className="animate-spin" color="#4f46e5" style={{ margin: '0 auto 1rem' }} />
                            <p style={{ color: '#64748b', fontWeight: '600' }}>Connecting to live Online Fee Counter Studio...</p>
                        </div>
                    ) : filteredCounterList.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '4.5rem 2rem', background: 'white',
                            borderRadius: '20px', border: '1.5px dashed #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)'
                        }}>
                            <div style={{
                                width: '68px', height: '68px', borderRadius: '50%', background: '#ecfdf5',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem',
                                border: '2px solid #a7f3d0'
                            }}>
                                <CheckCircle2 size={38} color="#059669" />
                            </div>
                            <h3 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.35rem' }}>
                                All Online Fee Slips Are Cleared!
                            </h3>
                            <p style={{ color: '#64748b', fontSize: '0.92rem', maxWidth: '480px', margin: '0 auto 1.5rem' }}>
                                There are no pending online submissions requiring verification right now. Any newly submitted slips from Parent Mobile App will pop-up here automatically in real time.
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                {isDemoAccount && (
                                    <button
                                        type="button"
                                        onClick={handleInjectDemoData}
                                        disabled={isInjectingDemo}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                                            padding: '0.65rem 1.35rem', borderRadius: '10px', border: 'none',
                                            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                            color: 'white', fontWeight: '800', cursor: isInjectingDemo ? 'not-allowed' : 'pointer',
                                            boxShadow: '0 4px 10px rgba(245, 158, 11, 0.35)',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        {isInjectingDemo ? <Loader2 size={17} className="animate-spin" /> : <Zap size={17} />}
                                        <span>⚡ Inject 25 Demo Slips (Preview Mode)</span>
                                    </button>
                                )}

                                {isDemoAccount && demoSlipsCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleClearDemoData}
                                        disabled={isInjectingDemo}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                                            padding: '0.65rem 1.25rem', borderRadius: '10px',
                                            border: '1px solid #fecaca', background: '#fef2f2',
                                            color: '#b91c1c', fontWeight: '800', cursor: isInjectingDemo ? 'not-allowed' : 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <Trash2 size={16} />
                                        <span>Clear Demo Slips ({demoSlipsCount})</span>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => setActiveSubTab('history')}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                                        padding: '0.65rem 1.35rem', borderRadius: '10px', border: 'none',
                                        background: '#4f46e5', color: 'white', fontWeight: '700', cursor: 'pointer',
                                        boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.3)'
                                    }}
                                >
                                    <span>Review Online Fee History</span>
                                    <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            
                            {/* Sleek Compact Studio Navigation Bar (Zero Duplication) */}
                            {filteredCounterList.length > 0 && activeSub && (() => {
                                const currentIndex = filteredCounterList.findIndex(s => s.id === activeSub.id);
                                const totalSlips = filteredCounterList.length;
                                const badge = getMethodBadge(activeSub.paymentMethod);

                                return (
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        flexWrap: 'wrap', gap: '0.75rem', background: '#f8fafc', padding: '0.75rem 1.25rem',
                                        borderRadius: '14px', border: '1px solid #e2e8f0'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <span style={{
                                                fontSize: '0.8rem', fontWeight: '900', color: '#4f46e5',
                                                background: '#e0e7ff', padding: '3px 10px', borderRadius: '8px'
                                            }}>
                                                Slip {currentIndex + 1} of {totalSlips}
                                            </span>
                                            <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#1e293b' }}>
                                                {activeSub.studentName}
                                            </div>
                                            <span style={{
                                                fontSize: '0.72rem', fontWeight: '800', padding: '2px 7px',
                                                borderRadius: '6px', background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`
                                            }}>
                                                {badge.label}
                                            </span>
                                            <strong style={{ fontSize: '0.92rem', color: '#0f172a', marginLeft: '0.25rem' }}>
                                                Rs. {Number(activeSub.amount || 0).toLocaleString()}
                                            </strong>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <button
                                                type="button"
                                                disabled={currentIndex <= 0}
                                                onClick={() => {
                                                    if (currentIndex > 0) {
                                                        setSelectedSubId(filteredCounterList[currentIndex - 1].id);
                                                        setZoomLevel(1);
                                                        setSlipRotation(0);
                                                    }
                                                }}
                                                style={{
                                                    padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1',
                                                    background: currentIndex <= 0 ? '#f1f5f9' : '#ffffff',
                                                    color: currentIndex <= 0 ? '#94a3b8' : '#334155',
                                                    fontSize: '0.78rem', fontWeight: '700', cursor: currentIndex <= 0 ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                ⬅️ Previous
                                            </button>

                                            <button
                                                type="button"
                                                disabled={currentIndex >= totalSlips - 1}
                                                onClick={() => {
                                                    if (currentIndex < totalSlips - 1) {
                                                        setSelectedSubId(filteredCounterList[currentIndex + 1].id);
                                                        setZoomLevel(1);
                                                        setSlipRotation(0);
                                                    }
                                                }}
                                                style={{
                                                    padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1',
                                                    background: currentIndex >= totalSlips - 1 ? '#f1f5f9' : '#ffffff',
                                                    color: currentIndex >= totalSlips - 1 ? '#94a3b8' : '#334155',
                                                    fontSize: '0.78rem', fontWeight: '700', cursor: currentIndex >= totalSlips - 1 ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                Next ➡️
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setActiveSubTab('pending_queue')}
                                                style={{
                                                    padding: '0.4rem 0.85rem', borderRadius: '8px', border: '1px solid #c7d2fe',
                                                    background: '#eef2ff', color: '#4338ca', fontSize: '0.78rem', fontWeight: '800',
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem'
                                                }}
                                            >
                                                <Clock size={14} /> View All in Queue
                                            </button>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Main 2-Column Canva Studio Cockpit */}
                            {activeSub && (() => {
                                const totalSiblings = resolvedFamilyStudents.length;
                                const settledSiblings = resolvedFamilyStudents.filter(s => s.isSettled).length;
                                const payingSiblings = resolvedFamilyStudents.filter(s => selectedSiblingsPayingMap[s.id] !== false).length;
                                const unpaidSiblings = resolvedFamilyStudents.filter(s => !s.isSettled && selectedSiblingsPayingMap[s.id] === false).length;

                                return (
                                <div style={{
                                    display: 'grid', gridTemplateColumns: 'minmax(420px, 1.15fr) minmax(380px, 0.85fr)',
                                    gap: '1.25rem', alignItems: 'start'
                                }}>
                                    
                                    {/* 👈 LEFT COLUMN: Student & Family Fee Cockpit (Offline Fee Counter Categorized Style) */}
                                    <div style={{
                                        background: 'white', borderRadius: '20px', border: '1.5px solid #e2e8f0',
                                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)', overflow: 'hidden',
                                        display: 'flex', flexDirection: 'column'
                                    }}>
                                        {/* Cockpit Header with Parent Account Intelligence */}
                                        <div style={{
                                            padding: '1.15rem 1.4rem', background: '#f8fafc',
                                            borderBottom: '1px solid #e2e8f0', display: 'flex',
                                            justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{
                                                    width: '44px', height: '44px', borderRadius: '12px',
                                                    background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)', display: 'flex', alignItems: 'center',
                                                    justifyContent: 'center', border: '1px solid #c4b5fd'
                                                }}>
                                                    <Users size={22} color="#7c3aed" />
                                                </div>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#1e293b' }}>
                                                            {activeSub.parentName || 'Parent / Guardian Account'}
                                                        </h3>
                                                        {activeSub.parentId && (
                                                            <span style={{
                                                                fontSize: '0.68rem', fontWeight: '800', background: '#eff6ff',
                                                                color: '#2563eb', padding: '2px 7px', borderRadius: '6px', border: '1px solid #bfdbfe'
                                                            }}>
                                                                Parent UID Linked ✓
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                                        Phone: <strong>{activeSub.parentPhone || '—'}</strong> • <strong>{totalSiblings}</strong> Registered Child(ren) in School
                                                    </p>
                                                </div>
                                            </div>

                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>Target Fee Month</div>
                                                <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#4f46e5' }}>
                                                    {activeSub.month || 'Current Month'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Household Intelligence Summary Bar */}
                                        <div style={{
                                            padding: '0.75rem 1.4rem', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0',
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem'
                                        }}>
                                            <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <ShieldCheck size={15} color="#7c3aed" /> Household Breakdown:
                                            </span>
                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                <span style={{
                                                    fontSize: '0.73rem', fontWeight: '800', padding: '2px 8px', borderRadius: '8px',
                                                    background: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe'
                                                }}>
                                                    ⚡ {payingSiblings} In this Slip
                                                </span>
                                                {settledSiblings > 0 && (
                                                    <span style={{
                                                        fontSize: '0.73rem', fontWeight: '800', padding: '2px 8px', borderRadius: '8px',
                                                        background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0'
                                                    }}>
                                                        🟢 {settledSiblings} Already Settled ✓
                                                    </span>
                                                )}
                                                {unpaidSiblings > 0 && (
                                                    <span style={{
                                                        fontSize: '0.73rem', fontWeight: '800', padding: '2px 8px', borderRadius: '8px',
                                                        background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca'
                                                    }}>
                                                        🔴 {unpaidSiblings} Unpaid (Excluded)
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Reconciliation Match Card (Moved to TOP for instant Cashier Glance) */}
                                        <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: isExactMatch ? '#f0fdf4' : (discrepancy < 0 ? '#fef2f2' : '#eff6ff') }}>
                                            <div style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    {isExactMatch ? (
                                                        <CheckCircle2 size={20} color="#059669" />
                                                    ) : (
                                                        <AlertCircle size={20} color={discrepancy < 0 ? '#dc2626' : '#2563eb'} />
                                                    )}
                                                    <div>
                                                        <div style={{
                                                            fontSize: '0.86rem', fontWeight: '900',
                                                            color: isExactMatch ? '#065f46' : (discrepancy < 0 ? '#991b1b' : '#1e40af')
                                                        }}>
                                                            {isExactMatch ? 'Exact 100% Match (Zero Discrepancy)' : (discrepancy < 0 ? `Short by Rs. ${Math.abs(discrepancy).toLocaleString()}` : `Excess Rs. ${discrepancy.toLocaleString()}`)}
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: isExactMatch ? '#047857' : (discrepancy < 0 ? '#b91c1c' : '#1d4ed8') }}>
                                                            {isExactMatch ? 'Calculated fee matches bank slip amount perfectly' : (discrepancy < 0 ? 'Slip amount is less than total dues' : 'Slip amount includes advance / credit balance')}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '800' }}>Calculated Dues</span>
                                                    <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0f172a' }}>
                                                        Rs. {Number(totalCalculatedDue || 0).toLocaleString()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Sibling Students List: High-Speed POS Compact Table */}
                                        <div style={{
                                            padding: '0.85rem 1.25rem',
                                            display: 'flex', flexDirection: 'column', gap: '0.65rem',
                                            maxHeight: '420px', overflowY: 'auto'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.15rem' }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                    <FileCheck size={14} color="#7c3aed" />
                                                    <span>Enrolled Children ({resolvedFamilyStudents.length})</span>
                                                </span>
                                                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                    Checkbox to include/exclude siblings
                                                </span>
                                            </div>

                                            {resolvedFamilyStudents.map((st) => {
                                                const isSubmittedInSlip = activeSub.isFamilyCombined
                                                    ? Boolean(activeSub.familyStudents?.some(fs => fs.studentId === st.id))
                                                    : (st.id === activeSub.studentId);
                                                
                                                const isLocked = isSubmittedInSlip || st.isSettled;
                                                const isPaying = isSubmittedInSlip ? true : (selectedSiblingsPayingMap[st.id] !== false);
                                                const bd = st.breakdown || {};
                                                const isExpanded = Boolean(expandedBreakdowns[st.id]);

                                                const tuitionAmt = Number(bd.tuitionPayable || bd.baseTuition || st.monthlyFee || (st.calculatedDue - (bd.transportFee || 0) - (bd.storeDues || 0) - (bd.actionFee || 0)) || 0);
                                                const transportAmt = Number(bd.transportFee || st.transportFee || 0);
                                                const storeAmt = Number(bd.storeDues || st.storeDues || 0);
                                                const actionAmt = Number(bd.actionFee || st.actionFee || 0);
                                                const recurringAmt = Array.isArray(bd.recurringItems) ? bd.recurringItems.reduce((s, i) => s + (Number(i.amount) || 0), 0) : 0;
                                                const fineAmt = Number(bd.penaltyFine || 0);

                                                const hasDetails = (Array.isArray(bd.storePurchases) && bd.storePurchases.length > 0) || (Array.isArray(bd.actions) && bd.actions.length > 0) || (Array.isArray(bd.recurringItems) && bd.recurringItems.length > 0);

                                                return (
                                                    <div
                                                        key={st.id}
                                                        style={{
                                                            background: isPaying ? '#ffffff' : (st.isSettled ? '#f8fafc' : '#f8fafc'),
                                                            borderRadius: '12px',
                                                            border: isPaying ? '1.5px solid #c084fc' : (st.isSettled ? '1px solid #bbf7d0' : '1px solid #e2e8f0'),
                                                            boxShadow: isPaying ? '0 2px 6px rgba(192, 132, 252, 0.08)' : 'none',
                                                            padding: '0.65rem 0.85rem',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                    >
                                                        {/* Top Row: Checkbox, Name, Class & Roll, Total Due */}
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isPaying}
                                                                    disabled={isLocked}
                                                                    onChange={() => {
                                                                        if (!isLocked) toggleSiblingPaying(st.id);
                                                                    }}
                                                                    style={{
                                                                        width: '16px', height: '16px',
                                                                        cursor: isLocked ? 'not-allowed' : 'pointer',
                                                                        accentColor: '#7c3aed'
                                                                    }}
                                                                />
                                                                <div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                                        <span style={{ fontSize: '0.92rem', fontWeight: '900', color: isPaying ? '#4c1d95' : '#334155' }}>
                                                                            {st.name}
                                                                        </span>
                                                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                                                            ({st.className} {st.rollNo ? `• #${st.rollNo}` : ''})
                                                                        </span>
                                                                        {isSubmittedInSlip ? (
                                                                            <span style={{ fontSize: '0.65rem', fontWeight: '800', background: '#f3e8ff', color: '#7e22ce', padding: '1px 6px', borderRadius: '4px', border: '1px solid #d8b4fe' }}>
                                                                                Target Child
                                                                            </span>
                                                                        ) : st.isSettled ? (
                                                                            <span style={{ fontSize: '0.65rem', fontWeight: '800', background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                                                                                Settled ✓
                                                                            </span>
                                                                        ) : null}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                                                <div style={{ textAlign: 'right' }}>
                                                                    <span style={{ fontSize: '0.98rem', fontWeight: '900', color: isPaying ? '#6b21a8' : '#94a3b8' }}>
                                                                        Rs. {Number(st.calculatedDue || 0).toLocaleString()}
                                                                    </span>
                                                                </div>
                                                                {hasDetails && isPaying && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setExpandedBreakdowns(prev => ({ ...prev, [st.id]: !prev[st.id] }))}
                                                                        style={{
                                                                            background: 'none', border: 'none', cursor: 'pointer',
                                                                            padding: '2px', color: '#7c3aed', display: 'flex', alignItems: 'center'
                                                                        }}
                                                                        title="Toggle itemized details"
                                                                    >
                                                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Sub-row: Inline Compact Chips (Tuition, Transport, Store, Exam, Fine) */}
                                                        {isPaying && (
                                                            <div style={{
                                                                display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                                                                gap: '0.35rem', marginTop: '0.45rem', paddingTop: '0.4rem',
                                                                borderTop: '1px dashed #f1f5f9'
                                                            }}>
                                                                <span style={{ fontSize: '0.72rem', fontWeight: '700', background: '#eff6ff', color: '#1e40af', padding: '2px 7px', borderRadius: '5px' }}>
                                                                    🎓 Tuition: Rs. {tuitionAmt.toLocaleString()}
                                                                </span>

                                                                {transportAmt > 0 && (
                                                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', background: '#fefce8', color: '#854d0e', padding: '2px 7px', borderRadius: '5px' }}>
                                                                        🚌 Van: Rs. {transportAmt.toLocaleString()}
                                                                    </span>
                                                                )}

                                                                {storeAmt > 0 && (
                                                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', background: '#faf5ff', color: '#6b21a8', padding: '2px 7px', borderRadius: '5px' }}>
                                                                        🛍️ Store: Rs. {storeAmt.toLocaleString()}
                                                                    </span>
                                                                )}

                                                                {actionAmt > 0 && (
                                                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', background: '#f0fdf4', color: '#166534', padding: '2px 7px', borderRadius: '5px' }}>
                                                                        📝 Exam: Rs. {actionAmt.toLocaleString()}
                                                                    </span>
                                                                )}

                                                                {recurringAmt > 0 && (
                                                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', background: '#f8fafc', color: '#334155', padding: '2px 7px', borderRadius: '5px' }}>
                                                                        💻 Misc: Rs. {recurringAmt.toLocaleString()}
                                                                    </span>
                                                                )}

                                                                {fineAmt > 0 && (
                                                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', background: '#fef2f2', color: '#dc2626', padding: '2px 7px', borderRadius: '5px' }}>
                                                                        ⏱️ Fine: Rs. {fineAmt.toLocaleString()}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Optional Collapsed Itemized Detail view */}
                                                        {isExpanded && isPaying && hasDetails && (
                                                            <div style={{
                                                                marginTop: '0.45rem', padding: '0.45rem 0.65rem', background: '#f8fafc',
                                                                borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.72rem', color: '#475569'
                                                            }}>
                                                                {Array.isArray(bd.storePurchases) && bd.storePurchases.map((sp, idx) => (
                                                                    <div key={`sp-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                                                                        <span>• {sp.title || sp.name || 'Store Item'}</span>
                                                                        <strong>Rs. {Number(sp.amount || 0).toLocaleString()}</strong>
                                                                    </div>
                                                                ))}
                                                                {Array.isArray(bd.actions) && bd.actions.map((act, idx) => (
                                                                    <div key={`act-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                                                                        <span>• {act.name || act.title || 'Exam/Charge'}</span>
                                                                        <strong>Rs. {Number(act.amount || 0).toLocaleString()}</strong>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Bottom Quick-Action Footer */}
                                        <div style={{
                                            padding: '0.75rem 1.25rem', background: '#f8fafc',
                                            borderTop: '1px solid #e2e8f0', display: 'flex',
                                            justifyContent: 'space-between', alignItems: 'center'
                                        }}>
                                            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '700' }}>
                                                Settling <strong>{payingSiblings}</strong> student{payingSiblings > 1 ? 's' : ''} in this invoice
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Total Due:</span>
                                                <span style={{ fontSize: '1.15rem', fontWeight: '900', color: '#4c1d95' }}>
                                                    Rs. {Number(totalCalculatedDue || 0).toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 👉 RIGHT COLUMN: Canva-Style HD Slip & Proof Studio */}
                                    <div style={{
                                        background: '#0f172a', borderRadius: '20px', border: '1.5px solid #334155',
                                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)', overflow: 'hidden',
                                        display: 'flex', flexDirection: 'column'
                                    }}>
                                        {/* Canva Toolbar Header */}
                                        <div style={{
                                            padding: '0.85rem 1.15rem', background: '#1e293b',
                                            borderBottom: '1px solid #334155', display: 'flex',
                                            justifyContent: 'space-between', alignItems: 'center'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <Landmark size={18} color="#818cf8" />
                                                <span style={{ color: '#f8fafc', fontWeight: '800', fontSize: '0.88rem' }}>
                                                    {activeSub.paymentMethod || 'Bank Deposit Slip'}
                                                </span>
                                            </div>

                                            {/* Zoom / Rotate Controls */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <button
                                                    type="button"
                                                    onClick={handleZoomOut}
                                                    disabled={zoomLevel <= 1}
                                                    title="Zoom Out"
                                                    style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: '#334155', color: 'white', cursor: zoomLevel <= 1 ? 'not-allowed' : 'pointer' }}
                                                >
                                                    <ZoomOut size={14} />
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={handleResetZoom}
                                                    title="Reset Zoom"
                                                    style={{ padding: '0 0.45rem', height: '28px', border: 'none', background: 'transparent', color: '#818cf8', fontSize: '0.75rem', fontWeight: '800', fontFamily: 'monospace' }}
                                                >
                                                    {Math.round(zoomLevel * 100)}%
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={handleZoomIn}
                                                    disabled={zoomLevel >= 2.5}
                                                    title="Zoom In"
                                                    style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: '#334155', color: 'white', cursor: zoomLevel >= 2.5 ? 'not-allowed' : 'pointer' }}
                                                >
                                                    <ZoomIn size={14} />
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={handleRotateSlip}
                                                    title="Rotate 90 degrees"
                                                    style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: '#334155', color: 'white', cursor: 'pointer', marginLeft: '2px' }}
                                                >
                                                    <RotateCw size={14} />
                                                </button>

                                                {activeSub.proofUrl && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedProofUrl(activeSub.proofUrl)}
                                                        title="Fullscreen Lightbox"
                                                        style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: '#4f46e5', color: 'white', cursor: 'pointer', marginLeft: '2px' }}
                                                    >
                                                        <ExternalLink size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* TRX ID & Account Verification Bar */}
                                        <div style={{
                                            padding: '0.65rem 1.15rem', background: '#090d16',
                                            borderBottom: '1px solid #1e293b', display: 'flex',
                                            justifyContent: 'space-between', alignItems: 'center'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase' }}>TRX ID:</span>
                                                <span style={{ color: '#38bdf8', fontFamily: 'monospace', fontWeight: '800', fontSize: '0.82rem' }}>
                                                    {activeSub.transactionId || 'None entered'}
                                                </span>
                                                {activeSub.transactionId && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopyTrx(activeSub.transactionId)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedTrx === activeSub.transactionId ? '#4ade80' : '#94a3b8' }}
                                                        title="Copy TRX ID"
                                                    >
                                                        {copiedTrx === activeSub.transactionId ? <CheckCheck size={14} /> : <Copy size={14} />}
                                                    </button>
                                                )}
                                            </div>

                                            <div style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>
                                                Deposit A/C: <strong>{activeSub.accountNumberPaidTo || 'Official School A/C'}</strong>
                                            </div>
                                        </div>

                                        {/* Duplicate TRX Alert if any */}
                                        {activeSub.transactionId && trxCountMap[(activeSub.transactionId || '').trim()] > 1 && (
                                            <div style={{
                                                padding: '0.5rem 1.15rem', background: '#450a0a', borderBottom: '1px solid #7f1d1d',
                                                color: '#fca5a5', fontSize: '0.75rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.4rem'
                                            }}>
                                                <AlertTriangle size={15} color="#ef4444" />
                                                <span>Warning: Duplicate TRX ID found in {trxCountMap[(activeSub.transactionId || '').trim()]} different submissions!</span>
                                            </div>
                                        )}

                                        {/* ========================================================================= */}
                                        {/* 🧠 AI SMART RECONCILIATION & SLIP AUDITOR COCKPIT                         */}
                                        {/* ========================================================================= */}
                                        {(() => {
                                            const isScanning = aiScanningId === activeSub.id || activeSub.aiScan?.status === 'scanning';
                                            const ai = activeSub.aiScan;
                                            
                                            if (isScanning) {
                                                return (
                                                    <div style={{
                                                        padding: '0.85rem 1.15rem',
                                                        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                                                        borderBottom: '1px solid #4338ca',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        gap: '0.75rem'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                                            <Loader2 size={18} className="animate-spin" color="#a5b4fc" />
                                                            <div>
                                                                <div style={{ color: '#ffffff', fontSize: '0.82rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                                    <Sparkles size={14} color="#facc15" /> 
                                                                    <span>AI Vision Slip Auditor Working...</span>
                                                                </div>
                                                                <div style={{ color: '#c7d2fe', fontSize: '0.72rem' }}>
                                                                    Scanning printed amount, TID/TRX & checking bank authenticity
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <span style={{ fontSize: '0.68rem', fontWeight: '800', background: '#3730a3', color: '#e0e7ff', padding: '2px 8px', borderRadius: '6px' }}>
                                                            Node 22 Flash Vision
                                                        </span>
                                                    </div>
                                                );
                                            }

                                            // 🚨 WRONG IMAGE / UNMATCHED STATE
                                            if (ai && (ai.isValidReceipt === false || ai.status === 'unmatched_image')) {
                                                return (
                                                    <div style={{
                                                        padding: '0.85rem 1.15rem', background: '#450a0a',
                                                        borderBottom: '1.5px solid #dc2626', display: 'flex', flexDirection: 'column', gap: '0.6rem'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                                                <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                                                                <div>
                                                                    <div style={{ fontSize: '0.84rem', fontWeight: '900', color: '#fecaca', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                        <span>🚨 WRONG IMAGE / UNMATCHED SLIP</span>
                                                                        <span style={{ fontSize: '0.68rem', background: '#7f1d1d', color: '#fca5a5', padding: '1px 6px', borderRadius: '4px' }}>
                                                                            No Slip Found
                                                                        </span>
                                                                    </div>
                                                                    <div style={{ fontSize: '0.74rem', color: '#fca5a5', marginTop: '0.2rem', lineHeight: '1.35' }}>
                                                                        {ai.unmatchedReason || "The uploaded image does not contain a recognized financial receipt or bank deposit slip."}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() => handleTriggerAiScan(activeSub)}
                                                                title="Re-scan with AI"
                                                                style={{
                                                                    padding: '0.35rem 0.65rem', borderRadius: '7px', border: '1px solid #7f1d1d',
                                                                    background: '#1e0505', color: '#fca5a5', fontSize: '0.72rem', fontWeight: '800', cursor: 'pointer',
                                                                    display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0
                                                                }}
                                                            >
                                                                <RefreshCw size={12} />
                                                                <span>Re-Scan</span>
                                                            </button>
                                                        </div>

                                                        {/* One-click Action to alert parent */}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAutoReuploadFromAi(activeSub)}
                                                            style={{
                                                                padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #f87171',
                                                                background: '#dc2626', color: '#ffffff', fontSize: '0.76rem', fontWeight: '800', cursor: 'pointer',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                                                boxShadow: '0 2px 4px rgba(220, 38, 38, 0.4)'
                                                            }}
                                                        >
                                                            <RefreshCw size={13} />
                                                            <span>1-Click: Send Re-Upload Notice to Parent</span>
                                                        </button>
                                                    </div>
                                                );
                                            }

                                            // 🟢 VALID RECEIPT DETECTED & PARSED
                                            if (ai && ai.isValidReceipt === true) {
                                                const detectedAmt = ai.detectedAmount !== null ? Number(ai.detectedAmount) : null;
                                                const parentAmt = Number(activeSub.amount || 0);
                                                const dueTotal = Number(totalCalculatedDue || 0);

                                                const isTampered = detectedAmt !== null && Math.abs(detectedAmt - parentAmt) > 1;
                                                const isExactFeeMatch = detectedAmt !== null && detectedAmt === dueTotal;
                                                const isUnderpaid = detectedAmt !== null && detectedAmt < dueTotal;
                                                const isOverpaid = detectedAmt !== null && detectedAmt > dueTotal;

                                                const detectedTrx = ai.detectedTrxId;
                                                const formTrx = activeSub.transactionId;
                                                const hasTrxDiff = detectedTrx && (!formTrx || detectedTrx.toLowerCase() !== formTrx.toLowerCase());

                                                return (
                                                    <div style={{
                                                        padding: '0.85rem 1.15rem',
                                                        background: isTampered ? '#2a0808' : (isExactFeeMatch ? '#062817' : (isUnderpaid ? '#2e1903' : '#082136')),
                                                        borderBottom: `1.5px solid ${isTampered ? '#dc2626' : (isExactFeeMatch ? '#059669' : (isUnderpaid ? '#d97706' : '#2563eb'))}`,
                                                        display: 'flex', flexDirection: 'column', gap: '0.65rem'
                                                    }}>
                                                        {/* Header Status Line */}
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                                {isTampered ? (
                                                                    <AlertTriangle size={17} color="#ef4444" />
                                                                ) : isExactFeeMatch ? (
                                                                    <CheckCircle2 size={17} color="#10b981" />
                                                                ) : isUnderpaid ? (
                                                                    <AlertCircle size={17} color="#f59e0b" />
                                                                ) : (
                                                                    <ShieldCheck size={17} color="#38bdf8" />
                                                                )}
                                                                <span style={{
                                                                    fontSize: '0.82rem', fontWeight: '900',
                                                                    color: isTampered ? '#fca5a5' : (isExactFeeMatch ? '#6ee7b7' : (isUnderpaid ? '#fde68a' : '#7dd3fc'))
                                                                }}>
                                                                    {isTampered
                                                                        ? '🚨 AMOUNT MISMATCH / TAMPERING ALERT'
                                                                        : isExactFeeMatch
                                                                            ? '🟢 AI VERIFIED: 100% EXACT FULL PAYMENT'
                                                                            : isUnderpaid
                                                                                ? `🟡 PARTIAL / HALF PAYMENT (SHORT BY Rs. ${(dueTotal - detectedAmt).toLocaleString()})`
                                                                                : `🔵 OVERPAID CREDIT (EXCESS Rs. ${(detectedAmt - dueTotal).toLocaleString()})`}
                                                                </span>
                                                            </div>

                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                                <span style={{
                                                                    fontSize: '0.68rem', fontWeight: '800',
                                                                    background: 'rgba(255,255,255,0.1)', color: '#cbd5e1',
                                                                    padding: '2px 7px', borderRadius: '5px'
                                                                }}>
                                                                    {ai.paymentChannel || 'Bank/Wallet'}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleTriggerAiScan(activeSub)}
                                                                    title="Re-scan slip"
                                                                    style={{
                                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                                        color: '#94a3b8', padding: '2px', display: 'flex', alignItems: 'center'
                                                                    }}
                                                                >
                                                                    <RefreshCw size={13} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Tampering Details Callout if Parent Entered Fake Amount */}
                                                        {isTampered && (
                                                            <div style={{
                                                                padding: '0.45rem 0.65rem', borderRadius: '6px',
                                                                background: 'rgba(220, 38, 38, 0.25)', border: '1px solid #ef4444',
                                                                color: '#fecaca', fontSize: '0.74rem', fontWeight: '700'
                                                            }}>
                                                                ⚠️ Parent claimed <strong>Rs. {parentAmt.toLocaleString()}</strong> in form, but AI slip scan reveals <strong>Rs. {detectedAmt ? detectedAmt.toLocaleString() : '0'}</strong>!
                                                            </div>
                                                        )}

                                                        {/* Extracted Intelligence Badges (4 Grid Cards) */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.4rem' }}>
                                                            {/* 1. Slip Detected Amount */}
                                                            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.4rem 0.55rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                                <div style={{ color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: '700' }}>AI Slip Amount</div>
                                                                <div style={{ color: '#38bdf8', fontSize: '0.88rem', fontWeight: '900' }}>
                                                                    Rs. {detectedAmt ? detectedAmt.toLocaleString() : '—'}
                                                                </div>
                                                            </div>

                                                            {/* 2. Detected TRX ID */}
                                                            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.4rem 0.55rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <span style={{ color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: '700' }}>AI TID / TRX</span>
                                                                    {hasTrxDiff && detectedTrx && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleApplyAiTrx(activeSub, detectedTrx)}
                                                                            title="Use AI extracted TRX"
                                                                            style={{
                                                                                border: 'none', background: '#38bdf8', color: '#0f172a',
                                                                                fontSize: '0.62rem', fontWeight: '800', padding: '1px 5px',
                                                                                borderRadius: '4px', cursor: 'pointer'
                                                                            }}
                                                                        >
                                                                            Apply ✓
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <div style={{ color: '#f8fafc', fontSize: '0.78rem', fontWeight: '800', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {detectedTrx || 'Not legible'}
                                                                </div>
                                                            </div>

                                                            {/* 3. Deposited Account Title */}
                                                            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.4rem 0.55rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                                <div style={{ color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: '700' }}>Paid To Title</div>
                                                                <div style={{ color: '#e2e8f0', fontSize: '0.76rem', fontWeight: '800', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {ai.receiverTitle || ai.receiverAccount || 'Official A/C'}
                                                                </div>
                                                            </div>

                                                            {/* 4. Sender / Date */}
                                                            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.4rem 0.55rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                                <div style={{ color: '#94a3b8', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: '700' }}>Payer & Date</div>
                                                                <div style={{ color: '#e2e8f0', fontSize: '0.75rem', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {ai.senderName || activeSub.parentName || 'Parent'} • {ai.detectedDate || 'Recent'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            // 🔘 DEFAULT READY TO SCAN STATE (NOT YET SCANNED)
                                            return (
                                                <div style={{
                                                    padding: '0.65rem 1.15rem', background: '#0b1329',
                                                    borderBottom: '1px solid #1e293b', display: 'flex',
                                                    justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <Sparkles size={16} color="#818cf8" />
                                                        <div>
                                                            <div style={{ color: '#e2e8f0', fontSize: '0.78rem', fontWeight: '800' }}>
                                                                AI Slip Auditor & Anti-Fraud Scanner
                                                            </div>
                                                            <div style={{ color: '#64748b', fontSize: '0.68rem' }}>
                                                                Reads amount, TRX, checks full/half paid & detects wrong images
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleTriggerAiScan(activeSub)}
                                                        disabled={!activeSub.proofUrl}
                                                        style={{
                                                            padding: '0.4rem 0.85rem', borderRadius: '8px', border: '1px solid #6366f1',
                                                            background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                                                            color: 'white', fontSize: '0.76rem', fontWeight: '800',
                                                            cursor: !activeSub.proofUrl ? 'not-allowed' : 'pointer',
                                                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                                                            boxShadow: '0 2px 4px rgba(79, 70, 229, 0.4)'
                                                        }}
                                                    >
                                                        <Zap size={13} color="#facc15" />
                                                        <span>⚡ Scan Slip with AI</span>
                                                    </button>
                                                </div>
                                            );
                                        })()}

                                        {/* HD Slip Canvas Viewport */}
                                        <div style={{
                                            flex: 1, minHeight: '380px', maxHeight: '480px', background: '#020617',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            overflow: 'hidden', padding: '1rem', position: 'relative'
                                        }}>
                                            {activeSub.proofUrl ? (
                                                <img
                                                    src={activeSub.proofUrl}
                                                    alt="Payment Slip"
                                                    style={{
                                                        transform: `scale(${zoomLevel}) rotate(${slipRotation}deg)`,
                                                        transformOrigin: 'center center',
                                                        transition: 'transform 0.2s ease',
                                                        maxWidth: '100%', maxHeight: '440px', objectFit: 'contain',
                                                        borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                                                    }}
                                                />
                                            ) : (
                                                <div style={{ color: '#64748b', fontSize: '0.9rem', textAlign: 'center' }}>
                                                    <Landmark size={36} color="#334155" style={{ margin: '0 auto 0.5rem' }} />
                                                    <p>No receipt slip image attached</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Amount Paid On Slip Footer Tag */}
                                        <div style={{
                                            padding: '0.85rem 1.25rem', background: '#1e293b',
                                            borderTop: '1px solid #334155', display: 'flex',
                                            justifyContent: 'space-between', alignItems: 'center'
                                        }}>
                                            <div>
                                                <span style={{ color: '#94a3b8', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '700' }}>Paid Amount on Slip</span>
                                                <div style={{ fontSize: '1.35rem', fontWeight: '900', color: '#38bdf8' }}>
                                                    Rs. {Number(activeSub.amount || 0).toLocaleString()}
                                                </div>
                                            </div>

                                            {/* Action Buttons inside Studio */}
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setReuploadSub(activeSub)}
                                                    disabled={processingId === activeSub.id}
                                                    style={{
                                                        padding: '0.55rem 0.85rem', borderRadius: '10px', border: '1px solid #fde68a',
                                                        background: '#fffbeb', color: '#b45309', fontWeight: '800', fontSize: '0.8rem',
                                                        cursor: processingId === activeSub.id ? 'not-allowed' : 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: '0.35rem'
                                                    }}
                                                >
                                                    <RefreshCw size={14} /> Re-upload
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setRejectReason(activeSub.rejectReason || '');
                                                        setRejectingSub(activeSub);
                                                    }}
                                                    disabled={processingId === activeSub.id}
                                                    style={{
                                                        padding: '0.55rem 0.85rem', borderRadius: '10px', border: '1px solid #fecaca',
                                                        background: '#fef2f2', color: '#dc2626', fontWeight: '800', fontSize: '0.8rem',
                                                        cursor: processingId === activeSub.id ? 'not-allowed' : 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: '0.35rem'
                                                    }}
                                                >
                                                    <X size={14} /> Reject
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleApprove(activeSub)}
                                                    disabled={processingId === activeSub.id}
                                                    style={{
                                                        padding: '0.55rem 1.35rem', borderRadius: '10px', border: 'none',
                                                        background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                                                        color: 'white', fontWeight: '900', fontSize: '0.88rem',
                                                        cursor: processingId === activeSub.id ? 'not-allowed' : 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: '0.45rem',
                                                        boxShadow: '0 4px 10px rgba(22, 163, 74, 0.4)',
                                                        opacity: processingId === activeSub.id ? 0.6 : 1
                                                    }}
                                                >
                                                    {processingId === activeSub.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                                    <span>Approve & Issue Receipt</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                );
                            })()}
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: 📋 DEDICATED PENDING SUBMISSIONS QUEUE                             */}
            {/* ========================================================================= */}
            {activeSubTab === 'pending_queue' && (
                <div style={{ background: 'white', borderRadius: '18px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3.5rem' }}>
                            <Loader2 size={32} className="animate-spin" color="#4f46e5" style={{ margin: '0 auto 1rem' }} />
                            <p style={{ color: '#64748b' }}>Loading pending queue...</p>
                        </div>
                    ) : filteredCounterList.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3.5rem 2rem', border: '1.5px dashed #cbd5e1', margin: '1.5rem', borderRadius: '16px' }}>
                            <CheckCircle2 size={38} color="#059669" style={{ margin: '0 auto 0.75rem' }} />
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#334155', marginBottom: '0.35rem' }}>Pending Queue is Empty!</h3>
                            <p style={{ color: '#94a3b8', fontSize: '0.88rem', marginBottom: '1.35rem' }}>All submitted slips have been verified and processed.</p>
                            
                            {isDemoAccount && (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={handleInjectDemoData}
                                        disabled={isInjectingDemo}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                                            padding: '0.6rem 1.25rem', borderRadius: '10px', border: 'none',
                                            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                            color: 'white', fontWeight: '800', fontSize: '0.88rem',
                                            cursor: isInjectingDemo ? 'not-allowed' : 'pointer',
                                            boxShadow: '0 3px 8px rgba(245, 158, 11, 0.3)',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        {isInjectingDemo ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                                        <span>⚡ Inject 25 Demo Slips (Preview Mode)</span>
                                    </button>

                                    {demoSlipsCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleClearDemoData}
                                            disabled={isInjectingDemo}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                                                padding: '0.6rem 1.15rem', borderRadius: '10px',
                                                border: '1px solid #fecaca', background: '#fef2f2',
                                                color: '#b91c1c', fontWeight: '800', fontSize: '0.88rem',
                                                cursor: isInjectingDemo ? 'not-allowed' : 'pointer',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            <Trash2 size={15} />
                                            <span>Clear Demo Slips ({demoSlipsCount})</span>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: '700', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        <th style={{ padding: '0.9rem 1.15rem' }}>Date / Time</th>
                                        <th style={{ padding: '0.9rem 1.15rem' }}>Parent & Account</th>
                                        <th style={{ padding: '0.9rem 1.15rem' }}>Target Student(s)</th>
                                        <th style={{ padding: '0.9rem 1.15rem' }}>Fee Month</th>
                                        <th style={{ padding: '0.9rem 1.15rem' }}>Channel</th>
                                        <th style={{ padding: '0.9rem 1.15rem' }}>Amount</th>
                                        <th style={{ padding: '0.9rem 1.15rem' }}>TRX ID</th>
                                        <th style={{ padding: '0.9rem 1.15rem', textAlign: 'right' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedPendingList.map((sub) => {
                                        const badge = getMethodBadge(sub.paymentMethod);
                                        const isFamily = Boolean(sub.isFamilyCombined && sub.familyStudents?.length > 0);
                                        const isDuplicateTrx = sub.transactionId && trxCountMap[(sub.transactionId || '').trim()] > 1;

                                        return (
                                            <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                                                <td style={{ padding: '0.9rem 1.15rem', color: '#64748b', fontSize: '0.8rem' }}>
                                                    {sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                </td>
                                                <td style={{ padding: '0.9rem 1.15rem' }}>
                                                    <div style={{ fontWeight: '800', color: '#0f172a' }}>{sub.parentName || 'Parent'}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{sub.parentPhone || '—'}</div>
                                                </td>
                                                <td style={{ padding: '0.9rem 1.15rem' }}>
                                                    <div style={{ fontWeight: '800', color: '#4338ca' }}>
                                                        {sub.studentName}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                        {isFamily ? `👨‍👩‍👧‍👦 Family Combined (${sub.familyStudents.length} Kids)` : `${sub.className} • Roll: ${sub.rollNo || 'N/A'}`}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.9rem 1.15rem', fontWeight: '700', color: '#334155' }}>
                                                    {sub.month || 'Current'}
                                                </td>
                                                <td style={{ padding: '0.9rem 1.15rem' }}>
                                                    <span style={{
                                                        fontSize: '0.74rem', fontWeight: '800', padding: '0.2rem 0.55rem',
                                                        borderRadius: '6px', background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`
                                                    }}>
                                                        {badge.label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.9rem 1.15rem', fontWeight: '900', color: '#0f172a', fontSize: '0.95rem' }}>
                                                    Rs. {Number(sub.amount || 0).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '0.9rem 1.15rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                    <div style={{ color: '#0369a1', fontWeight: '700' }}>{sub.transactionId || 'None'}</div>
                                                    {isDuplicateTrx && (
                                                        <span style={{ color: '#dc2626', fontSize: '0.68rem', fontWeight: '800' }}>⚠️ Duplicate TRX</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.9rem 1.15rem', textAlign: 'right' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedSubId(sub.id);
                                                            setActiveSubTab('counter');
                                                            setZoomLevel(1);
                                                            setSlipRotation(0);
                                                        }}
                                                        style={{
                                                            padding: '0.45rem 0.95rem', borderRadius: '9px', border: 'none',
                                                            background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
                                                            color: 'white', fontWeight: '800', fontSize: '0.8rem',
                                                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                                            boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)'
                                                        }}
                                                    >
                                                        <Sparkles size={14} /> Verify in Counter ⚡
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {renderPagination(pendingPage, pendingTotalPages, filteredCounterList.length, setPendingPage, 'pending slips')}
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: 📜 ONLINE FEE HISTORY & AUDIT LEDGER                               */}
            {/* ========================================================================= */}
            {activeSubTab === 'history' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Monthly Financial & Audit Summary Banner */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        flexWrap: 'wrap', gap: '1rem', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                        padding: '1.1rem 1.4rem', borderRadius: '16px', color: 'white',
                        boxShadow: '0 4px 14px rgba(49, 46, 129, 0.18)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                            <div style={{
                                width: '44px', height: '44px', borderRadius: '12px',
                                background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', border: '1px solid rgba(255,255,255,0.2)'
                            }}>
                                <Receipt size={22} color="#a5b4fc" />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#c7d2fe', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    {historySelectedMonth === 'all' ? 'Lifetime Online Fee History' : `Online Fee Ledger • ${selectedMonthLabel}`}
                                </div>
                                <div style={{ fontSize: '1.35rem', fontWeight: '900', color: 'white', marginTop: '0.1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    Rs. {totalMonthApprovedAmount.toLocaleString()}
                                    <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#86efac', background: 'rgba(34, 197, 94, 0.2)', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                                        ✓ Verified Collection
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.45rem 0.85rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '700', border: '1px solid rgba(255,255,255,0.15)' }}>
                                📊 Records: <span style={{ color: '#ffffff', fontWeight: '800' }}>{monthHistorySubs.length}</span>
                            </div>
                            <div style={{ background: 'rgba(34, 197, 94, 0.2)', padding: '0.45rem 0.85rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '700', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#86efac' }}>
                                ✓ Approved: {approvedCount}
                            </div>
                            {rejectedCount > 0 && (
                                <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '0.45rem 0.85rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '700', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5' }}>
                                    ✕ Active Rejected: {rejectedCount}
                                </div>
                            )}
                            {reuploadCount > 0 && (
                                <div style={{ background: 'rgba(245, 158, 11, 0.2)', padding: '0.45rem 0.85rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '700', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#fde68a' }}>
                                    ↻ Re-upload: {reuploadCount}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ background: 'white', borderRadius: '18px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3.5rem' }}>
                            <Loader2 size={32} className="animate-spin" color="#4f46e5" style={{ margin: '0 auto 1rem' }} />
                            <p style={{ color: '#64748b' }}>Loading history records...</p>
                        </div>
                    ) : filteredHistoryList.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3.5rem', border: '1px dashed #cbd5e1', margin: '1rem', borderRadius: '14px' }}>
                            <Clock size={36} color="#94a3b8" style={{ margin: '0 auto 0.75rem' }} />
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#334155' }}>No History Records Found</h3>
                            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Try adjusting your search query or status filter above.</p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: '700', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        <th style={{ padding: '0.9rem 1.15rem' }}>Receipt # / Status</th>
                                        <th style={{ padding: '0.9rem 1.15rem' }}>Student & Class</th>
                                        <th style={{ padding: '0.9rem 1.15rem' }}>Fee Month</th>
                                        <th style={{ padding: '0.9rem 1.15rem' }}>Parent & Phone</th>
                                        <th style={{ padding: '0.9rem 1.15rem' }}>Channel</th>
                                        <th style={{ padding: '0.9rem 1.15rem' }}>Amount</th>
                                        <th style={{ padding: '0.9rem 1.15rem' }}>Date Processed</th>
                                        <th style={{ padding: '0.9rem 1.15rem', textAlign: 'right' }}>Audit Slip</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedHistoryList.map((sub) => {
                                        const badge = getMethodBadge(sub.paymentMethod);
                                        const isApproved = sub.status === 'approved';
                                        const isRejected = sub.status === 'rejected';
                                        const isReupload = sub.status === 'needs_reupload';

                                        return (
                                            <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                                                <td style={{ padding: '0.9rem 1.15rem' }}>
                                                    <div style={{ fontFamily: 'monospace', fontWeight: '800', color: '#0f172a', fontSize: '0.82rem' }}>
                                                        {sub.receiptNo || (sub.transactionId ? `ONL-${sub.transactionId}` : '—')}
                                                    </div>
                                                    <div style={{ marginTop: '0.2rem' }}>
                                                        {isApproved && (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#16a34a', fontWeight: '800', fontSize: '0.75rem', background: '#dcfce7', padding: '0.15rem 0.45rem', borderRadius: '6px' }}>
                                                                <CheckCircle2 size={12} /> Approved
                                                            </span>
                                                        )}
                                                        {isRejected && (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#dc2626', fontWeight: '800', fontSize: '0.75rem', background: '#fee2e2', padding: '0.15rem 0.45rem', borderRadius: '6px' }}>
                                                                <XCircle size={12} /> Rejected
                                                            </span>
                                                        )}
                                                        {isReupload && (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#d97706', fontWeight: '800', fontSize: '0.75rem', background: '#fef3c7', padding: '0.15rem 0.45rem', borderRadius: '6px' }}>
                                                                <RefreshCw size={12} /> Re-upload Req
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                <td style={{ padding: '0.9rem 1.15rem' }}>
                                                    {sub.isFamilyCombined && sub.familyStudents?.length > 0 ? (
                                                        <div>
                                                            <div style={{ fontWeight: '700', color: '#6d28d9', fontSize: '0.82rem' }}>
                                                                Family ({sub.familyStudents.length} Students)
                                                            </div>
                                                            <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                                                                {sub.familyStudents.map(s => s.studentName).join(', ')}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <div style={{ fontWeight: '700', color: '#1e293b' }}>{sub.studentName}</div>
                                                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                                                {sub.className} (Roll: {sub.rollNo || 'N/A'})
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>

                                                <td style={{ padding: '0.9rem 1.15rem' }}>
                                                    <span style={{ fontWeight: '700', color: '#4f46e5', fontSize: '0.8rem' }}>
                                                        {sub.month || 'Current Month'}
                                                    </span>
                                                </td>

                                                <td style={{ padding: '0.9rem 1.15rem' }}>
                                                    <div style={{ fontWeight: '600', color: '#334155' }}>{sub.parentName || 'Parent'}</div>
                                                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{sub.parentPhone || '—'}</div>
                                                </td>

                                                <td style={{ padding: '0.9rem 1.15rem' }}>
                                                    <span style={{
                                                        padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem',
                                                        fontWeight: '700', background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`
                                                    }}>
                                                        {badge.label}
                                                    </span>
                                                </td>

                                                <td style={{ padding: '0.9rem 1.15rem' }}>
                                                    <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.95rem' }}>
                                                        Rs. {Number(sub.amount || 0).toLocaleString()}
                                                    </div>
                                                </td>

                                                <td style={{ padding: '0.9rem 1.15rem' }}>
                                                    <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: '600' }}>
                                                        {sub.approvedAt ? new Date(sub.approvedAt).toLocaleDateString() : (sub.rejectedAt ? new Date(sub.rejectedAt).toLocaleDateString() : (sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString() : '—'))}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                                        {sub.approvedAt ? new Date(sub.approvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                                    </div>
                                                </td>

                                                <td style={{ padding: '0.9rem 1.15rem', textAlign: 'right' }}>
                                                    {sub.proofUrl ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedProofUrl(sub.proofUrl);
                                                                setZoomLevel(1);
                                                                setSlipRotation(0);
                                                            }}
                                                            style={{
                                                                padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1',
                                                                background: '#f8fafc', color: '#334155', fontWeight: '700', fontSize: '0.78rem',
                                                                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem'
                                                            }}
                                                        >
                                                            <Eye size={13} color="#4f46e5" /> View Slip
                                                        </button>
                                                    ) : (
                                                        <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>No Slip</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {renderPagination(historyPage, historyTotalPages, filteredHistoryList.length, setHistoryPage, 'history records')}
                        </div>
                    )}
                </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* LIGHTBOX PROOF MODAL                                                      */}
            {/* ========================================================================= */}
            {selectedProofUrl && (
                <div 
                    onClick={() => {
                        setSelectedProofUrl(null);
                        setZoomLevel(1);
                        setSlipRotation(0);
                    }}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
                        padding: '1.5rem', backdropFilter: 'blur(4px)'
                    }}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'white', borderRadius: '16px', maxWidth: '820px', width: '95%',
                            overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', position: 'relative',
                            display: 'flex', flexDirection: 'column'
                        }}
                    >
                        <div style={{ 
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                            padding: '0.85rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
                            flexWrap: 'wrap', gap: '0.5rem'
                        }}>
                            <h4 style={{ margin: 0, fontWeight: '700', color: '#1e293b', fontSize: '0.95rem' }}>
                                Payment Slip Full Inspection
                            </h4>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', background: '#ffffff',
                                    border: '1px solid #cbd5e1', borderRadius: '8px', padding: '2px'
                                }}>
                                    <button 
                                        type="button"
                                        onClick={handleZoomOut}
                                        disabled={zoomLevel <= 1}
                                        title="Zoom Out"
                                        style={{ width: '28px', height: '28px', border: 'none', background: 'white', cursor: zoomLevel <= 1 ? 'not-allowed' : 'pointer', color: '#334155' }}
                                    >
                                        <ZoomOut size={15} />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleResetZoom}
                                        title="Reset Zoom"
                                        style={{ padding: '0 0.45rem', height: '28px', border: 'none', background: 'transparent', color: '#4f46e5', fontSize: '0.75rem', fontWeight: '700', fontFamily: 'monospace' }}
                                    >
                                        {Math.round(zoomLevel * 100)}%
                                    </button>

                                    <button 
                                        type="button"
                                        onClick={handleZoomIn}
                                        disabled={zoomLevel >= 2.5}
                                        title="Zoom In"
                                        style={{ width: '28px', height: '28px', border: 'none', background: 'white', cursor: zoomLevel >= 2.5 ? 'not-allowed' : 'pointer', color: '#334155' }}
                                    >
                                        <ZoomIn size={15} />
                                    </button>

                                    <button 
                                        type="button"
                                        onClick={handleRotateSlip}
                                        title="Rotate 90 degrees"
                                        style={{ width: '28px', height: '28px', border: 'none', background: '#f1f5f9', cursor: 'pointer', color: '#334155', borderRadius: '4px', marginLeft: '2px' }}
                                    >
                                        <RotateCw size={13} />
                                    </button>
                                </div>

                                <a 
                                    href={selectedProofUrl} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    style={{ 
                                        display: 'flex', alignItems: 'center', gap: '0.3rem', 
                                        color: '#4f46e5', fontSize: '0.8rem', fontWeight: '700', 
                                        textDecoration: 'none', padding: '0.4rem 0.65rem', borderRadius: '8px', 
                                        background: '#ffffff', border: '1px solid #cbd5e1' 
                                    }}
                                >
                                    <ExternalLink size={13} /> Open Raw
                                </a>

                                <button 
                                    type="button"
                                    onClick={() => {
                                        setSelectedProofUrl(null);
                                        setZoomLevel(1);
                                        setSlipRotation(0);
                                    }}
                                    style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        <div style={{
                            padding: '1.25rem', background: '#020617', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', overflow: 'auto', maxHeight: '72vh'
                        }}>
                            <img 
                                src={selectedProofUrl} 
                                alt="Payment Proof" 
                                style={{ 
                                    transform: `scale(${zoomLevel}) rotate(${slipRotation}deg)`, 
                                    transformOrigin: 'center center',
                                    transition: 'transform 0.2s ease', 
                                    maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain',
                                    borderRadius: '6px'
                                }} 
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* REJECTION REASON MODAL                                                    */}
            {/* ========================================================================= */}
            {rejectingSub && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
                    <div style={{ background: 'white', borderRadius: '16px', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <AlertCircle size={20} color="#dc2626" />
                            <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#991b1b', margin: 0 }}>Reject Payment Submission</h3>
                        </div>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
                            State the reason for rejecting payment of <strong>Rs. {Number(rejectingSub.amount || 0).toLocaleString()}</strong> by {rejectingSub.parentName || rejectingSub.studentName}:
                        </p>
                        <textarea
                            rows={3}
                            placeholder="e.g. Transaction ID not found in school bank account..."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.85rem', outline: 'none', marginBottom: '1.25rem' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                type="button"
                                onClick={() => setRejectingSub(null)}
                                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontWeight: '600', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmReject}
                                disabled={Boolean(processingId && processingId === rejectingSub.id)}
                                style={{ padding: '0.55rem 1.35rem', borderRadius: '8px', border: 'none', background: '#dc2626', color: 'white', fontWeight: '700', cursor: 'pointer' }}
                            >
                                {processingId === rejectingSub.id ? 'Rejecting...' : 'Confirm Reject'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* REQUEST RE-UPLOAD MODAL                                                   */}
            {/* ========================================================================= */}
            {reuploadSub && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
                    <div style={{ background: 'white', borderRadius: '16px', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <RefreshCw size={20} color="#d97706" />
                            <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#92400e', margin: 0 }}>Request Slip Re-upload</h3>
                        </div>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
                            Ask <strong>{reuploadSub.parentName || reuploadSub.studentName}</strong> to re-upload a clearer payment proof:
                        </p>
                        <textarea
                            rows={3}
                            placeholder="e.g. Bank TRX ID is cut off. Kindly re-upload the full screenshot..."
                            value={reuploadNote}
                            onChange={(e) => setReuploadNote(e.target.value)}
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.85rem', outline: 'none', marginBottom: '1.25rem' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setReuploadSub(null);
                                    setReuploadNote('');
                                }}
                                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontWeight: '600', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmRequestReupload}
                                disabled={processingId === reuploadSub.id}
                                style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', background: '#d97706', color: 'white', fontWeight: '700', cursor: 'pointer' }}
                            >
                                Send Request to Parent
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* 🛡️ PARTIAL PAYMENT CONFIRMATION SAFEGUARD MODAL (ENGLISH)                   */}
            {/* ========================================================================= */}
            {partialConfirmSub && (() => {
                const slipAmt = Number(partialConfirmSub.amount || 0);
                const shortAmt = Math.max(0, totalCalculatedDue - slipAmt);
                return (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
                        <div style={{ background: 'white', borderRadius: '20px', maxWidth: '520px', width: '100%', padding: '1.75rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #fed7aa' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
                                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#fff7ed', border: '1px solid #ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <AlertTriangle size={22} color="#ea580c" />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#9a3412', margin: 0 }}>Partial Payment Detected</h3>
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#c2410c' }}>Slip amount is less than total outstanding ledger dues</p>
                                </div>
                            </div>

                            <div style={{ background: '#fff7ed', borderRadius: '12px', border: '1px solid #ffedd5', padding: '1rem', marginBottom: '1.25rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
                                    <div style={{ padding: '0.5rem', background: 'white', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Slip Amount</span>
                                        <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#0284c7', marginTop: '2px' }}>Rs. {slipAmt.toLocaleString()}</div>
                                    </div>
                                    <div style={{ padding: '0.5rem', background: 'white', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Total Dues</span>
                                        <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#1e293b', marginTop: '2px' }}>Rs. {totalCalculatedDue.toLocaleString()}</div>
                                    </div>
                                    <div style={{ padding: '0.5rem', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                                        <span style={{ fontSize: '0.7rem', color: '#b91c1c', fontWeight: '700', textTransform: 'uppercase' }}>Short By</span>
                                        <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#dc2626', marginTop: '2px' }}>Rs. {shortAmt.toLocaleString()}</div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '0.85rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: '#475569', lineHeight: 1.5, border: '1px solid #e2e8f0' }}>
                                <strong style={{ color: '#0f172a' }}>Ledger Impact:</strong> Approving as partial will record <strong>Rs. {slipAmt.toLocaleString()}</strong> as paid, mark the month status as <span style={{ color: '#ea580c', fontWeight: '800' }}>Partial (Warm Orange)</span>, and carry forward <strong>Rs. {shortAmt.toLocaleString()}</strong> as outstanding arrears for subsequent billing.
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const subToProcess = partialConfirmSub;
                                        setPartialConfirmSub(null);
                                        handleApprove(subToProcess, true);
                                    }}
                                    disabled={processingId === partialConfirmSub.id}
                                    style={{
                                        padding: '0.75rem 1.25rem', borderRadius: '10px', border: 'none',
                                        background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                                        color: 'white', fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                        boxShadow: '0 4px 12px rgba(234, 88, 12, 0.35)'
                                    }}
                                >
                                    <Check size={18} />
                                    <span>Approve as Partial (Carry Forward Rs. {shortAmt.toLocaleString()} Arrears)</span>
                                </button>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const subToReupload = partialConfirmSub;
                                            setPartialConfirmSub(null);
                                            setReuploadNote(`The slip amount of Rs. ${slipAmt.toLocaleString()} is less than total dues of Rs. ${totalCalculatedDue.toLocaleString()} (Short by Rs. ${shortAmt.toLocaleString()}). Please upload the complete payment proof or remaining transfer slip.`);
                                            setReuploadSub(subToReupload);
                                        }}
                                        style={{
                                            padding: '0.65rem 1rem', borderRadius: '10px', border: '1px solid #fed7aa',
                                            background: '#fff7ed', color: '#c2410c', fontWeight: '700', fontSize: '0.82rem',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem'
                                        }}
                                    >
                                        <RefreshCw size={15} />
                                        <span>Request Re-upload</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setPartialConfirmSub(null)}
                                        style={{
                                            padding: '0.65rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1',
                                            background: 'white', color: '#64748b', fontWeight: '700', fontSize: '0.82rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default OnlineSubmissionsDashboard;
