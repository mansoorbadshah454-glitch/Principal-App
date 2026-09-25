import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Clock, CheckCircle2, XCircle, Search, Eye, Filter, Download, ExternalLink, 
    Smartphone, Landmark, AlertCircle, ArrowUpRight, Check, X, Loader2,
    ZoomIn, ZoomOut, RotateCcw, RotateCw, Users, ShieldCheck, FileCheck, RefreshCw, 
    AlertTriangle, Copy, Calendar, CheckCheck, Sparkles, CreditCard, ArrowRight,
    Volume2, VolumeX, Bell, UserCheck, ChevronRight, Hash, Tag, Receipt
} from 'lucide-react';
import { db } from '../firebase';
import { 
    collection, onSnapshot, query, doc, updateDoc, setDoc, getDoc, getDocs, orderBy, serverTimestamp, writeBatch, arrayUnion
} from 'firebase/firestore';
import { calculateItemizedFeeBreakdown, MONTH_NAMES, MONTH_SHORT, formatPKR, isMonthKeySettled } from '../utils/feePipeline';
import { cacheStudentsOffline, getCachedStudentsOffline } from '../utils/offlineFeeEngine';

const OnlineSubmissionsDashboard = ({ 
    schoolId, 
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
    const [searchQuery, setSearchQuery] = useState('');
    
    // Canvas & Slip Viewer States
    const [selectedProofUrl, setSelectedProofUrl] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(1); // 1 = 100%, 1.5 = 150%, 2 = 200%, 2.5 = 250%
    const [slipRotation, setSlipRotation] = useState(0); // 0, 90, 180, 270
    const [rejectingSub, setRejectingSub] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [reuploadSub, setReuploadSub] = useState(null);
    const [reuploadNote, setReuploadNote] = useState('');
    const [processingId, setProcessingId] = useState(null);
    const [copiedTrx, setCopiedTrx] = useState('');

    // Audio & Real-time Live Alert States
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [realtimeToast, setRealtimeToast] = useState(null);
    const prevPendingCountRef = useRef(null);

    const playPaymentChime = () => {
        if (!audioEnabled) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
            osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.12); // E5
            osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.25); // G5
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.45);
        } catch (e) {
            console.warn("Audio chime error:", e);
        }
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
        if (!schoolId) return;

        const subsRef = collection(db, `schools/${schoolId}/paymentSubmissions`);
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
    }, [schoolId, audioEnabled]);

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

    // Pending vs History lists
    const pendingSubs = useMemo(() => {
        return submissions.filter(s => (s.status || 'pending') === 'pending');
    }, [submissions]);

    const historySubs = useMemo(() => {
        return submissions.filter(s => (s.status || 'pending') !== 'pending');
    }, [submissions]);

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
                    subtotal: Number(fs.subtotal || 0)
                }));
            } else if (activeSub.studentId) {
                siblingCandidates = [{
                    id: activeSub.studentId,
                    name: activeSub.studentName || 'Student',
                    className: activeSub.className || 'Class',
                    classId: activeSub.classId || '',
                    rollNo: activeSub.rollNo || '',
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

            const isPrimary = (st.id === targetStudentId) || (activeSub.isFamilyCombined && activeSub.familyStudents?.some(fs => fs.studentId === st.id));
            const isSettled = isMonthKeySettled(st, subMonthInfo.monthKey, subMonthInfo.yr);

            return {
                ...st,
                breakdown,
                calculatedDue: breakdown.totalPayable,
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

    const filteredHistoryList = useMemo(() => {
        return historySubs.filter(s => {
            if (!applyCommonSearch(s) || !applyMethodFilter(s)) return false;
            if (filterStatus === 'all') return true;
            return s.status === filterStatus;
        });
    }, [historySubs, searchQuery, filterMethod, filterStatus]);

    // Handle Approve (Executes Atomic Batch with Multi-Sibling Support)
    const handleApprove = async (subToApprove) => {
        const sub = subToApprove || activeSub;
        if (!sub) return;

        const payingStudents = resolvedFamilyStudents.filter(st => selectedSiblingsPayingMap[st.id] !== false);
        const isMulti = payingStudents.length > 1;

        const confirmMsg = isMulti
            ? `Approve combined family fee payment of Rs. ${Number(sub.amount || 0).toLocaleString()} for ${payingStudents.length} students (${payingStudents.map(s => s.name).join(', ')})?`
            : `Approve fee payment of Rs. ${Number(sub.amount || 0).toLocaleString()} for ${sub.studentName || payingStudents[0]?.name || 'Student'} (${sub.className || payingStudents[0]?.className || 'Class'})?`;

        if (!window.confirm(confirmMsg)) {
            return;
        }

        setProcessingId(sub.id);
        try {
            const now = new Date();
            const nowIso = now.toISOString();
            const receiptNo = sub.transactionId ? `ONL-${sub.transactionId}` : `ONL-${Date.now().toString().slice(-6)}`;
            const finalAmount = Number(sub.amount) || 0;
            const { monthKey, monthName } = parseMonthInfo(sub.month);

            const batch = writeBatch(db);

            // 1. Process each paying sibling document
            for (const st of payingStudents) {
                const childSubtotal = Number(st.calculatedDue || st.subtotal || 0);
                const classId = st.classId || sub.classId || '';

                const studentPayload = {
                    monthlyFeeStatus: 'paid',
                    monthlyFeeDate: nowIso,
                    paidMonths: arrayUnion(monthKey),
                    lastPaymentMode: `Online - ${sub.paymentMethod || 'Transfer'}`,
                    lastReceiptNo: receiptNo,
                    lastPaymentAmount: isMulti && totalCalculatedDue > 0 ? Math.round((childSubtotal / totalCalculatedDue) * finalAmount) : finalAmount,
                    lastPaymentProofUrl: sub.proofUrl || null,
                    pendingPaymentSubmission: {
                        status: 'approved',
                        approvedAt: nowIso,
                        receiptNo
                    },
                    [`monthlyFeeHistory.${monthKey}`]: {
                        status: 'paid',
                        paidAmount: isMulti && totalCalculatedDue > 0 ? Math.round((childSubtotal / totalCalculatedDue) * finalAmount) : finalAmount,
                        remainingBalance: 0,
                        paidAt: nowIso,
                        receiptNo,
                        paymentMode: `Online - ${sub.paymentMethod || 'Transfer'}`,
                        proofUrl: sub.proofUrl || null,
                        transactionId: sub.transactionId || null,
                        monthKey,
                        monthName
                    }
                };

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
            const transactionRecord = {
                receiptNo,
                isFamilyCombined: isMulti,
                familyStudents: payingStudents.map(s => ({
                    studentId: s.id,
                    studentName: s.name,
                    className: s.className,
                    classId: s.classId || '',
                    rollNo: s.rollNo || '',
                    subtotal: s.calculatedDue || 0
                })),
                studentId: payingStudents[0]?.id || sub.studentId || '',
                studentName: isMulti ? `Family of ${sub.parentName || payingStudents[0]?.fatherName || 'Parent'} (${payingStudents.length} Students)` : (sub.studentName || payingStudents[0]?.name || 'Student'),
                rollNo: isMulti ? '-' : (sub.rollNo || payingStudents[0]?.rollNo || 'N/A'),
                classId: payingStudents[0]?.classId || sub.classId || '',
                className: isMulti ? `${payingStudents.length} Classes Combined` : (sub.className || payingStudents[0]?.className || 'Class'),
                fatherName: sub.parentName || payingStudents[0]?.fatherName || 'Parent',
                fatherPhone: sub.parentPhone || payingStudents[0]?.fatherPhone || '',
                paidCategories: ['tuition', 'transport', 'action', 'store'],
                totalPaid: finalAmount,
                targetMonth: monthName,
                targetMonthKey: monthKey,
                paymentMode: `Online - ${sub.paymentMethod || 'Transfer'}`,
                proofUrl: sub.proofUrl || null,
                transactionId: sub.transactionId || null,
                status: 'paid',
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
                approvedSiblings: payingStudents.map(s => ({ studentId: s.id, studentName: s.name, className: s.className }))
            });

            // 4. Send In-App Notification to Parent
            if (sub.parentId) {
                const notifRef = doc(collection(db, `schools/${schoolId}/notifications`));
                batch.set(notifRef, {
                    id: notifRef.id,
                    parentId: sub.parentId,
                    studentId: sub.studentId || null,
                    title: 'Fee Payment Approved ✓',
                    message: `Your fee payment of Rs. ${Number(sub.amount || 0).toLocaleString()} for ${monthName || sub.month || 'Fee'} has been approved and verified by the school administration. Receipt: ${receiptNo}`,
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
    const approvedCount = submissions.filter(s => s.status === 'approved').length;
    const rejectedCount = submissions.filter(s => s.status === 'rejected').length;
    const reuploadCount = submissions.filter(s => s.status === 'needs_reupload').length;

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
                            {historySubs.length} Records
                        </span>
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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

            {/* Sub-Header Channel Filters & Search */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexWrap: 'wrap', gap: '1rem', background: 'white', padding: '0.85rem 1.25rem',
                borderRadius: '16px', border: '1px solid #e2e8f0'
            }}>
                <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', marginRight: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Filter size={15} /> Channel:
                    </span>
                    {[
                        { id: 'all', label: 'All Channels' },
                        { id: 'easypaisa', label: '🟢 EasyPaisa' },
                        { id: 'jazzcash', label: '🔴 JazzCash' },
                        { id: 'bank', label: '🔵 Bank Transfer' },
                        { id: 'family', label: '🟣 Family Combined' }
                    ].map(pill => (
                        <button
                            key={pill.id}
                            type="button"
                            onClick={() => setFilterMethod(pill.id)}
                            style={{
                                padding: '0.35rem 0.8rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '700',
                                border: filterMethod === pill.id ? '1px solid #4f46e5' : '1px solid #e2e8f0',
                                cursor: 'pointer',
                                background: filterMethod === pill.id ? '#e0e7ff' : '#f8fafc',
                                color: filterMethod === pill.id ? '#3730a3' : '#475569',
                                transition: 'all 0.15s'
                            }}
                        >
                            {pill.label}
                        </button>
                    ))}
                </div>

                {activeSubTab === 'history' && (
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                        {[
                            { id: 'all', label: 'All Statuses' },
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

                                        {/* Sibling Students List with Offline Fee Counter Style Categorized Breakdown */}
                                        <div style={{ padding: '1.25rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <FileCheck size={16} color="#7c3aed" />
                                                    <span>Enrolled Children & Itemized Calculations</span>
                                                </span>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                    Target children are locked • Siblings can be added
                                                </span>
                                            </div>

                                            {resolvedFamilyStudents.map((st) => {
                                                // 🔒 SMART LOCKING LOGIC:
                                                // If Family combined: All students submitted in family are LOCKED
                                                // If Single payment: Target student is LOCKED
                                                const isSubmittedInSlip = activeSub.isFamilyCombined
                                                    ? Boolean(activeSub.familyStudents?.some(fs => fs.studentId === st.id))
                                                    : (st.id === activeSub.studentId);
                                                
                                                const isLocked = isSubmittedInSlip || st.isSettled;
                                                const isPaying = isSubmittedInSlip ? true : (selectedSiblingsPayingMap[st.id] !== false);
                                                const bd = st.breakdown || {};

                                                return (
                                                    <div
                                                        key={st.id}
                                                        style={{
                                                            background: isPaying ? '#ffffff' : (st.isSettled ? '#f0fdf4' : '#f8fafc'),
                                                            borderRadius: '16px',
                                                            border: isPaying ? '1.5px solid #a855f7' : (st.isSettled ? '1px solid #bbf7d0' : '1px solid #e2e8f0'),
                                                            boxShadow: isPaying ? '0 4px 12px rgba(168, 85, 247, 0.08)' : 'none',
                                                            padding: '1.1rem',
                                                            transition: 'all 0.15s'
                                                        }}
                                                    >
                                                        {/* Student Card Top Bar */}
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isPaying}
                                                                    disabled={isLocked}
                                                                    onChange={() => {
                                                                        if (!isLocked) {
                                                                            toggleSiblingPaying(st.id);
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        width: '18px', height: '18px',
                                                                        cursor: isLocked ? 'not-allowed' : 'pointer',
                                                                        accentColor: '#7c3aed', opacity: isLocked ? 0.85 : 1
                                                                    }}
                                                                />
                                                                <div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                                                        <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '900', color: isPaying ? '#4c1d95' : '#334155' }}>
                                                                            {st.name}
                                                                        </h4>
                                                                        {isSubmittedInSlip ? (
                                                                            <span style={{
                                                                                background: '#f3e8ff', color: '#7e22ce', padding: '2px 8px',
                                                                                borderRadius: '6px', fontSize: '0.7rem', fontWeight: '900', border: '1px solid #d8b4fe'
                                                                            }}>
                                                                                🔒 Submitted in Slip (Locked)
                                                                            </span>
                                                                        ) : st.isSettled ? (
                                                                            <span style={{
                                                                                background: '#dcfce7', color: '#15803d', padding: '2px 8px',
                                                                                borderRadius: '6px', fontSize: '0.7rem', fontWeight: '800', border: '1px solid #bbf7d0'
                                                                            }}>
                                                                                🟢 Already Settled ✓
                                                                            </span>
                                                                        ) : isPaying ? (
                                                                            <span style={{
                                                                                background: '#eff6ff', color: '#2563eb', padding: '2px 8px',
                                                                                borderRadius: '6px', fontSize: '0.7rem', fontWeight: '800', border: '1px solid #bfdbfe'
                                                                            }}>
                                                                                ⚡ Added by Cashier
                                                                            </span>
                                                                        ) : (
                                                                            <span style={{
                                                                                background: '#fee2e2', color: '#b91c1c', padding: '2px 8px',
                                                                                borderRadius: '6px', fontSize: '0.7rem', fontWeight: '800', border: '1px solid #fecaca'
                                                                            }}>
                                                                                🔴 Unpaid (Excluded)
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem' }}>
                                                                        Class: <strong style={{ color: '#1e293b' }}>{st.className}</strong> • Roll: <strong style={{ color: '#1e293b' }}>{st.rollNo || 'N/A'}</strong>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div style={{ textAlign: 'right' }}>
                                                                <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>Calculated Due</span>
                                                                <div style={{ fontSize: '1.15rem', fontWeight: '900', color: isPaying ? '#6b21a8' : '#64748b' }}>
                                                                    Rs. {Number(st.calculatedDue || 0).toLocaleString()}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* 📊 Offline Fee Counter Style Itemized Categorized Breakdown */}
                                                        {isPaying && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.65rem' }}>
                                                                
                                                                {/* 1. Tuition & Base Fee */}
                                                                <div style={{
                                                                    background: '#eff6ff', borderRadius: '10px',
                                                                    border: '1px solid #bfdbfe', padding: '0.65rem 0.85rem',
                                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem'
                                                                }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                                        <span style={{ fontSize: '1rem' }}>🎓</span>
                                                                        <div>
                                                                            <strong style={{ color: '#1e40af' }}>Monthly Tuition Fee</strong>
                                                                            {bd.isScholarship && (
                                                                                <span style={{ marginLeft: '0.4rem', background: '#dcfce7', color: '#166534', padding: '1px 5px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '800' }}>
                                                                                    {bd.concessionType || 'Scholarship'} Applied
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <strong style={{ color: '#1e3a8a', fontSize: '0.9rem' }}>
                                                                        Rs. {Number(bd.tuitionPayable || bd.baseTuition || 0).toLocaleString()}
                                                                    </strong>
                                                                </div>

                                                                {/* 2. Transport Fee if any */}
                                                                {Number(bd.transportFee || 0) > 0 && (
                                                                    <div style={{
                                                                        background: '#fefce8', borderRadius: '10px',
                                                                        border: '1px solid #fef08a', padding: '0.65rem 0.85rem',
                                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem'
                                                                    }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                                            <span style={{ fontSize: '1rem' }}>🚌</span>
                                                                            <strong style={{ color: '#854d0e' }}>Transport Charges</strong>
                                                                        </div>
                                                                        <strong style={{ color: '#713f12', fontSize: '0.9rem' }}>
                                                                            Rs. {Number(bd.transportFee).toLocaleString()}
                                                                        </strong>
                                                                    </div>
                                                                )}

                                                                {/* 3. Store Purchases / Uniform / Books if any */}
                                                                {Number(bd.storeDues || 0) > 0 && (
                                                                    <div style={{
                                                                        background: '#faf5ff', borderRadius: '10px',
                                                                        border: '1px solid #e9d5ff', padding: '0.65rem 0.85rem',
                                                                        fontSize: '0.8rem'
                                                                    }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                                                <span style={{ fontSize: '1rem' }}>🛍️</span>
                                                                                <strong style={{ color: '#6b21a8' }}>Store / Uniform & Books</strong>
                                                                            </div>
                                                                            <strong style={{ color: '#581c87', fontSize: '0.9rem' }}>
                                                                                Rs. {Number(bd.storeDues).toLocaleString()}
                                                                            </strong>
                                                                        </div>
                                                                        {Array.isArray(bd.storePurchases) && bd.storePurchases.length > 0 && (
                                                                            <div style={{ fontSize: '0.74rem', color: '#7e22ce', paddingLeft: '1.4rem' }}>
                                                                                {bd.storePurchases.map((sp, idx) => (
                                                                                    <span key={idx} style={{ marginRight: '0.6rem' }}>
                                                                                        • {sp.title || sp.name || sp.item || 'Item'} (Rs. {Number(sp.amount || 0).toLocaleString()})
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* 4. Exams & Action Charges if any */}
                                                                {Number(bd.actionFee || 0) > 0 && (
                                                                    <div style={{
                                                                        background: '#f0fdf4', borderRadius: '10px',
                                                                        border: '1px solid #bbf7d0', padding: '0.65rem 0.85rem',
                                                                        fontSize: '0.8rem'
                                                                    }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                                                <span style={{ fontSize: '1rem' }}>📝</span>
                                                                                <strong style={{ color: '#166534' }}>Exams & Special Charges</strong>
                                                                            </div>
                                                                            <strong style={{ color: '#14532d', fontSize: '0.9rem' }}>
                                                                                Rs. {Number(bd.actionFee).toLocaleString()}
                                                                            </strong>
                                                                        </div>
                                                                        {Array.isArray(bd.actions) && bd.actions.length > 0 && (
                                                                            <div style={{ fontSize: '0.74rem', color: '#15803d', paddingLeft: '1.4rem' }}>
                                                                                {bd.actions.map((act, idx) => (
                                                                                    <span key={idx} style={{ marginRight: '0.6rem' }}>
                                                                                        • {act.name || act.title || 'Charge'} (Rs. {Number(act.amount || 0).toLocaleString()})
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* 5. Late Fine if any */}
                                                                {Number(bd.penaltyFine || 0) > 0 && (
                                                                    <div style={{
                                                                        background: '#fef2f2', borderRadius: '10px',
                                                                        border: '1px solid #fecaca', padding: '0.55rem 0.85rem',
                                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem'
                                                                    }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                                            <span style={{ fontSize: '1rem' }}>⏱️</span>
                                                                            <strong style={{ color: '#991b1b' }}>Late Fine Charges</strong>
                                                                        </div>
                                                                        <strong style={{ color: '#dc2626', fontSize: '0.88rem' }}>
                                                                            Rs. {Number(bd.penaltyFine).toLocaleString()}
                                                                        </strong>
                                                                    </div>
                                                                )}

                                                                {/* Child Subtotal Footer Pill */}
                                                                <div style={{
                                                                    padding: '0.5rem 0.75rem', background: '#f8fafc',
                                                                    borderRadius: '8px', border: '1px solid #e2e8f0',
                                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem'
                                                                }}>
                                                                    <span style={{ color: '#64748b', fontWeight: '700' }}>Child Subtotal Due:</span>
                                                                    <span style={{ color: '#4c1d95', fontWeight: '900', fontSize: '0.92rem' }}>
                                                                        Rs. {Number(st.calculatedDue || 0).toLocaleString()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Reconciliation Match Card */}
                                        <div style={{ padding: '0 1.4rem 1.4rem' }}>
                                            <div style={{
                                                padding: '1rem 1.25rem', borderRadius: '14px',
                                                background: isExactMatch ? '#ecfdf5' : (discrepancy < 0 ? '#fef2f2' : '#eff6ff'),
                                                border: `1.5px solid ${isExactMatch ? '#a7f3d0' : (discrepancy < 0 ? '#fecaca' : '#bfdbfe')}`,
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                            }}>
                                                <div>
                                                    <div style={{
                                                        fontSize: '0.85rem', fontWeight: '800',
                                                        color: isExactMatch ? '#065f46' : (discrepancy < 0 ? '#991b1b' : '#1e40af'),
                                                        display: 'flex', alignItems: 'center', gap: '0.4rem'
                                                    }}>
                                                        {isExactMatch ? <CheckCircle2 size={18} color="#059669" /> : <AlertCircle size={18} color={discrepancy < 0 ? '#dc2626' : '#2563eb'} />}
                                                        <span>{isExactMatch ? 'Exact 100% Match (Zero Discrepancy)' : (discrepancy < 0 ? 'Underpaid Slip Amount' : 'Overpaid / Advance Credit')}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.78rem', color: isExactMatch ? '#047857' : (discrepancy < 0 ? '#b91c1c' : '#1d4ed8'), marginTop: '0.15rem' }}>
                                                        {isExactMatch ? 'Calculated fee matches bank slip amount perfectly' : (discrepancy < 0 ? `Slip is short by Rs. ${Math.abs(discrepancy).toLocaleString()}` : `Slip has Rs. ${discrepancy.toLocaleString()} excess`)}
                                                    </div>
                                                </div>

                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>Calculated Dues Total</div>
                                                    <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0f172a' }}>
                                                        Rs. {Number(totalCalculatedDue || 0).toLocaleString()}
                                                    </div>
                                                </div>
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
                        <div style={{ textAlign: 'center', padding: '3.5rem', border: '1px dashed #cbd5e1', margin: '1rem', borderRadius: '14px' }}>
                            <CheckCircle2 size={38} color="#059669" style={{ margin: '0 auto 0.75rem' }} />
                            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#334155' }}>Pending Queue is Empty!</h3>
                            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>All submitted slips have been verified and processed.</p>
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
                                    {filteredCounterList.map((sub) => {
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
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: 📜 ONLINE FEE HISTORY & AUDIT LEDGER                               */}
            {/* ========================================================================= */}
            {activeSubTab === 'history' && (
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
                                    {filteredHistoryList.map((sub) => {
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
                        </div>
                    )}
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
        </div>
    );
};

export default OnlineSubmissionsDashboard;
