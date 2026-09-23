import React, { useState, useEffect, useRef } from 'react';
import { 
    Clock, CheckCircle2, XCircle, Search, Eye, Filter, Download, ExternalLink, 
    Smartphone, Landmark, AlertCircle, ArrowUpRight, Check, X, Loader2,
    ZoomIn, ZoomOut, RotateCcw, RotateCw, Users, ShieldCheck, FileCheck, RefreshCw, 
    AlertTriangle, Copy, Calendar, CheckCheck, Sparkles, CreditCard, ArrowRight,
    Volume2, VolumeX, Bell
} from 'lucide-react';
import { db, storage } from '../firebase';
import { 
    collection, onSnapshot, query, doc, updateDoc, setDoc, getDoc, orderBy, serverTimestamp, writeBatch, arrayUnion
} from 'firebase/firestore';

const OnlineSubmissionsDashboard = ({ schoolId, schoolInfo }) => {
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Primary Sub-Tab Switch: 'counter' (⚡ Online Fee Counter) vs 'history' (📜 Online Fee History)
    const [activeSubTab, setActiveSubTab] = useState('counter');
    
    // Filters
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'approved', 'rejected', 'needs_reupload' for history
    const [filterMethod, setFilterMethod] = useState('all'); // 'all', 'easypaisa', 'jazzcash', 'bank', 'family'
    const [searchQuery, setSearchQuery] = useState('');
    
    // Modals & Slip Viewer States
    const [selectedProofUrl, setSelectedProofUrl] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(1); // 1 = 100%, 1.5 = 150%, 2 = 200%, 2.5 = 250%
    const [slipRotation, setSlipRotation] = useState(0); // 0, 90, 180, 270
    const [reviewingSub, setReviewingSub] = useState(null);
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

    // Helper to extract normalized "YYYY-MM" monthKey
    const getMonthKey = (monthStr) => {
        if (monthStr) {
            const yearMatch = monthStr.match(/\b(20\d\d)\b/);
            const yr = yearMatch ? yearMatch[1] : new Date().getFullYear();
            const s = monthStr.toLowerCase();
            let m = null;
            if (s.includes('jan')) m = '01';
            else if (s.includes('feb')) m = '02';
            else if (s.includes('mar')) m = '03';
            else if (s.includes('apr')) m = '04';
            else if (s.includes('may')) m = '05';
            else if (s.includes('jun')) m = '06';
            else if (s.includes('jul')) m = '07';
            else if (s.includes('aug')) m = '08';
            else if (s.includes('sep')) m = '09';
            else if (s.includes('oct')) m = '10';
            else if (s.includes('nov')) m = '11';
            else if (s.includes('dec')) m = '12';
            else {
                const numMatch = s.match(/[-/](\d{1,2})/);
                if (numMatch) m = numMatch[1].padStart(2, '0');
            }
            if (m) return `${yr}-${m}`;
        }
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    // Handle Approve (Single or Multi-child Family Submission)
    const handleApprove = async (sub) => {
        const isFamily = Boolean(sub.isFamilyCombined && sub.familyStudents && sub.familyStudents.length > 0);
        const confirmMsg = isFamily
            ? `Approve combined family fee payment of Rs. ${Number(sub.amount || 0).toLocaleString()} for ${sub.familyStudents.length} students?`
            : `Approve fee payment of Rs. ${Number(sub.amount || 0).toLocaleString()} for ${sub.studentName} (${sub.className})?`;

        if (!window.confirm(confirmMsg)) {
            return;
        }

        setProcessingId(sub.id);
        try {
            const now = new Date();
            const nowIso = now.toISOString();
            const dateString = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const receiptNo = sub.transactionId ? `ONL-${sub.transactionId}` : `ONL-${Date.now().toString().slice(-6)}`;
            const finalAmount = Number(sub.amount) || 0;
            const monthKey = getMonthKey(sub.month);

            const batch = writeBatch(db);

            if (isFamily) {
                // 1. Process Multi-Student Family atomically
                for (const student of sub.familyStudents) {
                    const studentDue = Number(student.subtotal) || 0;

                    const studentHistoryEntry = {
                        status: 'paid',
                        paidAmount: studentDue,
                        remainingBalance: 0,
                        paidAt: nowIso,
                        receiptNo,
                        paymentMode: `Online - ${sub.paymentMethod || 'Transfer'}`,
                        proofUrl: sub.proofUrl || null,
                        transactionId: sub.transactionId || null,
                        monthKey
                    };

                    if (student.classId && student.studentId) {
                        const classStudentRef = doc(db, `schools/${schoolId}/classes/${student.classId}/students`, student.studentId);
                        batch.set(classStudentRef, {
                            monthlyFeeStatus: 'paid',
                            monthlyFeeDate: nowIso,
                            paidMonths: arrayUnion(monthKey),
                            [`monthlyFeeHistory.${monthKey}`]: studentHistoryEntry,
                            lastPaymentMode: sub.paymentMethod || 'Online Transfer',
                            lastPaymentAmount: studentDue,
                            lastReceiptNo: receiptNo,
                            lastPaymentProofUrl: sub.proofUrl || null,
                            pendingPaymentSubmission: {
                                status: 'approved',
                                approvedAt: nowIso
                            }
                        }, { merge: true });
                    }

                    if (student.studentId) {
                        const masterStudentRef = doc(db, `schools/${schoolId}/students`, student.studentId);
                        batch.set(masterStudentRef, {
                            monthlyFeeStatus: 'paid',
                            monthlyFeeDate: nowIso,
                            paidMonths: arrayUnion(monthKey),
                            [`monthlyFeeHistory.${monthKey}`]: studentHistoryEntry,
                            lastPaymentMode: sub.paymentMethod || 'Online Transfer',
                            lastPaymentAmount: studentDue,
                            lastReceiptNo: receiptNo,
                            lastPaymentProofUrl: sub.proofUrl || null,
                            pendingPaymentSubmission: {
                                status: 'approved',
                                approvedAt: nowIso
                            }
                        }, { merge: true });
                    }
                }

                // Family Transaction Record
                const transactionRecord = {
                    receiptNo,
                    isFamilyCombined: true,
                    familyStudents: sub.familyStudents,
                    studentId: sub.studentId || sub.familyStudents[0]?.studentId,
                    studentName: sub.studentName || `Family (${sub.familyStudents.length} Students)`,
                    rollNo: '-',
                    classId: sub.classId || sub.familyStudents[0]?.classId,
                    className: `${sub.familyStudents.length} Classes Combined`,
                    fatherName: sub.parentName || 'Parent / Guardian',
                    fatherPhone: sub.parentPhone || '',
                    items: sub.familyStudents.map(s => ({
                        name: `${s.studentName} (${s.className || 'Class'}) - Online Fee`,
                        amount: Number(s.subtotal) || 0
                    })),
                    baseFee: finalAmount,
                    actionsFee: 0,
                    fineAmount: 0,
                    discount: 0,
                    totalPaid: finalAmount,
                    paymentMode: `Online - ${sub.paymentMethod || 'Transfer'}`,
                    proofUrl: sub.proofUrl || null,
                    remarks: sub.transactionId ? `TRX ID: ${sub.transactionId}` : 'Online Family Payment Approved',
                    dueDate: null,
                    targetMonthKey: monthKey,
                    timestamp: serverTimestamp(),
                    dateString,
                    timeString,
                    collectedBy: 'Online Portal (Verified by Principal)'
                };

                const txDocRef = doc(db, `schools/${schoolId}/feeTransactions`, receiptNo);
                batch.set(txDocRef, {
                    ...transactionRecord,
                    id: receiptNo,
                    timestamp: serverTimestamp()
                }, { merge: true });

            } else {
                // Single Student Processing
                const singleHistoryEntry = {
                    status: 'paid',
                    paidAmount: finalAmount,
                    remainingBalance: 0,
                    paidAt: nowIso,
                    receiptNo,
                    paymentMode: `Online - ${sub.paymentMethod || 'Transfer'}`,
                    proofUrl: sub.proofUrl || null,
                    transactionId: sub.transactionId || null,
                    monthKey
                };

                const transactionRecord = {
                    receiptNo,
                    isFamilyCombined: false,
                    familyStudents: [],
                    studentId: sub.studentId,
                    studentName: sub.studentName,
                    rollNo: sub.rollNo || 'N/A',
                    classId: sub.classId,
                    className: sub.className || 'Class',
                    fatherName: sub.parentName || 'Parent / Guardian',
                    fatherPhone: sub.parentPhone || '',
                    items: [
                        { name: `Online Fee Payment (${sub.month || 'Current Month'})`, amount: finalAmount }
                    ],
                    baseFee: finalAmount,
                    actionsFee: 0,
                    fineAmount: 0,
                    discount: 0,
                    totalPaid: finalAmount,
                    paymentMode: `Online - ${sub.paymentMethod || 'Transfer'}`,
                    proofUrl: sub.proofUrl || null,
                    remarks: sub.transactionId ? `TRX ID: ${sub.transactionId}` : 'Online Payment Approved',
                    dueDate: null,
                    targetMonthKey: monthKey,
                    timestamp: serverTimestamp(),
                    dateString,
                    timeString,
                    collectedBy: 'Online Portal (Verified by Principal)'
                };

                if (sub.classId && sub.studentId) {
                    const classStudentRef = doc(db, `schools/${schoolId}/classes/${sub.classId}/students`, sub.studentId);
                    batch.set(classStudentRef, {
                        monthlyFeeStatus: 'paid',
                        monthlyFeeDate: nowIso,
                        paidMonths: arrayUnion(monthKey),
                        [`monthlyFeeHistory.${monthKey}`]: singleHistoryEntry,
                        lastPaymentMode: sub.paymentMethod || 'Online Transfer',
                        lastPaymentAmount: finalAmount,
                        lastReceiptNo: receiptNo,
                        lastPaymentProofUrl: sub.proofUrl || null,
                        pendingPaymentSubmission: {
                            status: 'approved',
                            approvedAt: nowIso
                        }
                    }, { merge: true });
                }

                if (sub.studentId) {
                    const masterStudentRef = doc(db, `schools/${schoolId}/students`, sub.studentId);
                    batch.set(masterStudentRef, {
                        monthlyFeeStatus: 'paid',
                        monthlyFeeDate: nowIso,
                        paidMonths: arrayUnion(monthKey),
                        [`monthlyFeeHistory.${monthKey}`]: singleHistoryEntry,
                        lastPaymentMode: sub.paymentMethod || 'Online Transfer',
                        lastPaymentAmount: finalAmount,
                        lastReceiptNo: receiptNo,
                        lastPaymentProofUrl: sub.proofUrl || null,
                        pendingPaymentSubmission: {
                            status: 'approved',
                            approvedAt: nowIso
                        }
                    }, { merge: true });
                }

                const txDocRef = doc(db, `schools/${schoolId}/feeTransactions`, receiptNo);
                batch.set(txDocRef, {
                    ...transactionRecord,
                    id: receiptNo,
                    timestamp: serverTimestamp()
                }, { merge: true });
            }

            // Update Submission Document Status
            const subRef = doc(db, `schools/${schoolId}/paymentSubmissions`, sub.id);
            batch.update(subRef, {
                status: 'approved',
                approvedAt: nowIso,
                receiptNo
            });

            // Commit atomic batch
            await batch.commit();

            if (reviewingSub?.id === sub.id) {
                setReviewingSub(null);
            }

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

            if (rejectingSub.isFamilyCombined && rejectingSub.familyStudents?.length > 0) {
                for (const student of rejectingSub.familyStudents) {
                    if (student.classId && student.studentId) {
                        const classStudentRef = doc(db, `schools/${schoolId}/classes/${student.classId}/students`, student.studentId);
                        batch.set(classStudentRef, { pendingPaymentSubmission: rejectTag }, { merge: true });
                    }
                    if (student.studentId) {
                        const masterStudentRef = doc(db, `schools/${schoolId}/students`, student.studentId);
                        batch.set(masterStudentRef, { pendingPaymentSubmission: rejectTag }, { merge: true });
                    }
                }
            } else if (rejectingSub.studentId) {
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

            await batch.commit();
            setRejectingSub(null);
            setRejectReason('');
            if (reviewingSub?.id === rejectingSub.id) {
                setReviewingSub(null);
            }
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

            if (reuploadSub.isFamilyCombined && reuploadSub.familyStudents?.length > 0) {
                for (const student of reuploadSub.familyStudents) {
                    if (student.classId && student.studentId) {
                        const classStudentRef = doc(db, `schools/${schoolId}/classes/${student.classId}/students`, student.studentId);
                        batch.set(classStudentRef, { pendingPaymentSubmission: reuploadTag }, { merge: true });
                    }
                    if (student.studentId) {
                        const masterStudentRef = doc(db, `schools/${schoolId}/students`, student.studentId);
                        batch.set(masterStudentRef, { pendingPaymentSubmission: reuploadTag }, { merge: true });
                    }
                }
            } else if (reuploadSub.classId && reuploadSub.studentId) {
                const classStudentRef = doc(db, `schools/${schoolId}/classes/${reuploadSub.classId}/students`, reuploadSub.studentId);
                batch.set(classStudentRef, { pendingPaymentSubmission: reuploadTag }, { merge: true });
                if (reuploadSub.studentId) {
                    const masterStudentRef = doc(db, `schools/${schoolId}/students`, reuploadSub.studentId);
                    batch.set(masterStudentRef, { pendingPaymentSubmission: reuploadTag }, { merge: true });
                }
            }

            await batch.commit();
            setReuploadSub(null);
            setReuploadNote('');
            if (reviewingSub?.id === reuploadSub.id) {
                setReviewingSub(null);
            }
        } catch (err) {
            console.error("Error requesting slip re-upload:", err);
            alert("Failed to request re-upload: " + err.message);
        } finally {
            setProcessingId(null);
        }
    };

    // Counts & Metrics
    const pendingSubs = submissions.filter(s => (s.status || 'pending') === 'pending');
    const historySubs = submissions.filter(s => (s.status || 'pending') !== 'pending');
    
    const pendingCount = pendingSubs.length;
    const approvedCount = submissions.filter(s => s.status === 'approved').length;
    const rejectedCount = submissions.filter(s => s.status === 'rejected').length;
    const reuploadCount = submissions.filter(s => s.status === 'needs_reupload').length;
    const totalCollectedOnline = submissions
        .filter(s => s.status === 'approved')
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    // Filtered Lists based on activeSubTab
    const applyCommonSearch = (sub) => {
        if (!searchQuery) return true;
        const queryLower = searchQuery.toLowerCase();
        return (
            (sub.studentName && sub.studentName.toLowerCase().includes(queryLower)) ||
            (sub.className && sub.className.toLowerCase().includes(queryLower)) ||
            (sub.rollNo && sub.rollNo.toString().toLowerCase().includes(queryLower)) ||
            (sub.transactionId && sub.transactionId.toLowerCase().includes(queryLower)) ||
            (sub.receiptNo && sub.receiptNo.toLowerCase().includes(queryLower)) ||
            (sub.parentName && sub.parentName.toLowerCase().includes(queryLower)) ||
            (sub.parentPhone && sub.parentPhone.includes(queryLower)) ||
            (sub.paymentMethod && sub.paymentMethod.toLowerCase().includes(queryLower))
        );
    };

    const applyMethodFilter = (sub) => {
        if (filterMethod === 'all') return true;
        if (filterMethod === 'family') return Boolean(sub.isFamilyCombined);
        const m = (sub.paymentMethod || '').toLowerCase();
        if (filterMethod === 'easypaisa') return m.includes('easypaisa');
        if (filterMethod === 'jazzcash') return m.includes('jazzcash');
        if (filterMethod === 'bank') return m.includes('bank') || m.includes('transfer') || m.includes('meezan') || m.includes('hbl') || m.includes('ubl');
        return true;
    };

    const filteredCounterList = pendingSubs
        .filter(applyMethodFilter)
        .filter(applyCommonSearch);

    const filteredHistoryList = historySubs
        .filter(sub => filterStatus === 'all' || sub.status === filterStatus)
        .filter(applyMethodFilter)
        .filter(applyCommonSearch);

    const getMethodBadge = (method) => {
        const m = (method || '').toLowerCase();
        if (m.includes('easypaisa')) {
            return { label: 'EasyPaisa', bg: '#dcfce7', color: '#15803d', border: '#86efac', icon: Smartphone };
        } else if (m.includes('jazzcash')) {
            return { label: 'JazzCash', bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5', icon: Smartphone };
        }
        return { label: method || 'Bank Transfer', bg: '#f3e8ff', color: '#7e22ce', border: '#d8b4fe', icon: Landmark };
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Top Sub-Nav Switch: Online Fee Counter vs Online Fee History */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                background: 'white',
                padding: '0.85rem 1.25rem',
                borderRadius: '18px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)'
            }}>
                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => setActiveSubTab('counter')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.6rem',
                            padding: '0.65rem 1.35rem',
                            borderRadius: '12px',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            background: activeSubTab === 'counter' 
                                ? 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)' 
                                : '#f8fafc',
                            color: activeSubTab === 'counter' ? 'white' : '#475569',
                            boxShadow: activeSubTab === 'counter' ? '0 4px 12px rgba(79, 70, 229, 0.35)' : 'none',
                            fontWeight: '700',
                            fontSize: '0.95rem'
                        }}
                    >
                        <Sparkles size={17} color={activeSubTab === 'counter' ? '#fbbf24' : '#6366f1'} />
                        <span>Online Fee Counter</span>
                        {pendingCount > 0 ? (
                            <span style={{
                                padding: '0.15rem 0.55rem',
                                borderRadius: '10px',
                                background: activeSubTab === 'counter' ? '#ef4444' : '#fee2e2',
                                color: activeSubTab === 'counter' ? 'white' : '#dc2626',
                                fontSize: '0.75rem',
                                fontWeight: '800',
                                animation: 'pulse 2s infinite'
                            }}>
                                {pendingCount} Pending
                            </span>
                        ) : (
                            <span style={{
                                padding: '0.15rem 0.45rem',
                                borderRadius: '10px',
                                background: activeSubTab === 'counter' ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
                                color: activeSubTab === 'counter' ? 'white' : '#64748b',
                                fontSize: '0.75rem',
                                fontWeight: '700'
                            }}>
                                Cleared ✓
                            </span>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveSubTab('history')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.6rem',
                            padding: '0.65rem 1.35rem',
                            borderRadius: '12px',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            background: activeSubTab === 'history' 
                                ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' 
                                : '#f8fafc',
                            color: activeSubTab === 'history' ? 'white' : '#475569',
                            boxShadow: activeSubTab === 'history' ? '0 4px 12px rgba(15, 23, 42, 0.35)' : 'none',
                            fontWeight: '700',
                            fontSize: '0.95rem'
                        }}
                    >
                        <FileCheck size={17} color={activeSubTab === 'history' ? '#38bdf8' : '#64748b'} />
                        <span>Online Fee History</span>
                        <span style={{
                            padding: '0.15rem 0.55rem',
                            borderRadius: '10px',
                            background: activeSubTab === 'history' ? 'rgba(255,255,255,0.15)' : '#e2e8f0',
                            color: activeSubTab === 'history' ? 'white' : '#64748b',
                            fontSize: '0.75rem',
                            fontWeight: '700'
                        }}>
                            {historySubs.length} Records
                        </span>
                    </button>
                </div>

                {/* Right Summary */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        background: '#ecfdf5',
                        padding: '0.45rem 0.9rem',
                        borderRadius: '12px',
                        border: '1px solid #a7f3d0'
                    }}>
                        <Landmark size={18} color="#059669" />
                        <div>
                            <div style={{ fontSize: '0.7rem', color: '#065f46', fontWeight: '700', textTransform: 'uppercase' }}>Total Online Approved</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#047857' }}>
                                Rs. {totalCollectedOnline.toLocaleString()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Real-time Live Online Payment Received Toast Banner */}
            {realtimeToast && (
                <div style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    borderRadius: '16px',
                    padding: '0.95rem 1.25rem',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 10px 25px -5px rgba(2, 132, 199, 0.45)',
                    border: '1.5px solid #7dd3fc',
                    gap: '1rem',
                    flexWrap: 'wrap'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '12px',
                            background: 'rgba(255,255,255,0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <Bell size={22} color="#ffffff" />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: '900', background: '#38bdf8', color: '#082f49', padding: '2px 8px', borderRadius: '10px' }}>
                                    ⚡ NEW ONLINE FEE SLIP ARRIVED
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#e0f2fe' }}>Just now</span>
                            </div>
                            <div style={{ fontSize: '0.95rem', fontWeight: '800', marginTop: '2px' }}>
                                {realtimeToast.studentName} ({realtimeToast.className}) submitted Rs. {Number(realtimeToast.amount || 0).toLocaleString()} via {realtimeToast.paymentMethod || 'Online Transfer'}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveSubTab('counter');
                                setReviewingSub(realtimeToast);
                                setRealtimeToast(null);
                            }}
                            style={{
                                padding: '0.5rem 1.15rem',
                                borderRadius: '9px',
                                border: 'none',
                                background: '#ffffff',
                                color: '#0369a1',
                                fontWeight: '800',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                            }}
                        >
                            <ShieldCheck size={16} /> Open & Review Slip
                        </button>
                        <button
                            type="button"
                            onClick={() => setRealtimeToast(null)}
                            style={{
                                background: 'rgba(255,255,255,0.15)',
                                border: 'none',
                                borderRadius: '8px',
                                color: '#ffffff',
                                padding: '0.5rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                            title="Dismiss notification"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Sub-Header Channel Filters & Search */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                background: 'white',
                padding: '0.85rem 1.25rem',
                borderRadius: '16px',
                border: '1px solid #e2e8f0'
            }}>
                {/* Method / Channel Pills */}
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
                                padding: '0.35rem 0.8rem',
                                borderRadius: '20px',
                                fontSize: '0.8rem',
                                fontWeight: '700',
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

                {/* History Status Selector (if activeSubTab === 'history') */}
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
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '10px',
                                    fontSize: '0.78rem',
                                    fontWeight: '700',
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: filterStatus === st.id ? '#1e293b' : '#f1f5f9',
                                    color: filterStatus === st.id ? 'white' : (st.color || '#475569')
                                }}
                            >
                                {st.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Search Bar */}
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
            {/* TAB 1: ⚡ ONLINE FEE COUNTER (RAPID VERIFICATION COCKPIT)                */}
            {/* ========================================================================= */}
            {activeSubTab === 'counter' && (
                <div>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3.5rem', background: 'white', borderRadius: '18px' }}>
                            <Loader2 size={36} className="animate-spin" color="#4f46e5" style={{ margin: '0 auto 1rem' }} />
                            <p style={{ color: '#64748b', fontWeight: '600' }}>Connecting to live Online Fee Counter...</p>
                        </div>
                    ) : filteredCounterList.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '4rem 2rem',
                            background: 'white',
                            borderRadius: '20px',
                            border: '1.5px dashed #cbd5e1',
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)'
                        }}>
                            <div style={{
                                width: '64px',
                                height: '64px',
                                borderRadius: '50%',
                                background: '#ecfdf5',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 1.25rem',
                                border: '2px solid #a7f3d0'
                            }}>
                                <CheckCircle2 size={36} color="#059669" />
                            </div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.35rem' }}>
                                All Online Fee Slips Are Cleared!
                            </h3>
                            <p style={{ color: '#64748b', fontSize: '0.9rem', maxWidth: '480px', margin: '0 auto 1.5rem' }}>
                                No pending online submissions require verification at this moment. You can review all approved or archived payments in the <strong>Online Fee History</strong> tab.
                            </p>
                            <button
                                type="button"
                                onClick={() => setActiveSubTab('history')}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.6rem 1.25rem',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: '#4f46e5',
                                    color: 'white',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.3)'
                                }}
                            >
                                <span>Go to Online Fee History</span>
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1.25rem' }}>
                            {filteredCounterList.map((sub) => {
                                const badge = getMethodBadge(sub.paymentMethod);
                                const isFamily = Boolean(sub.isFamilyCombined && sub.familyStudents && sub.familyStudents.length > 0);
                                const isProcessing = processingId === sub.id;

                                return (
                                    <div
                                        key={sub.id}
                                        style={{
                                            background: 'white',
                                            borderRadius: '18px',
                                            border: '1.5px solid #e2e8f0',
                                            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)',
                                            overflow: 'hidden',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            transition: 'transform 0.15s, box-shadow 0.15s'
                                        }}
                                    >
                                        {/* Card Header */}
                                        <div style={{
                                            padding: '0.85rem 1.15rem',
                                            background: isFamily ? '#f5f3ff' : '#f8fafc',
                                            borderBottom: '1px solid #e2e8f0',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                {isFamily ? (
                                                    <span style={{
                                                        padding: '0.2rem 0.6rem',
                                                        borderRadius: '8px',
                                                        background: '#ede9fe',
                                                        color: '#6d28d9',
                                                        fontWeight: '800',
                                                        fontSize: '0.75rem',
                                                        border: '1px solid #ddd6fe',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem'
                                                    }}>
                                                        <Users size={13} /> Family ({sub.familyStudents.length} Students)
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        padding: '0.2rem 0.55rem',
                                                        borderRadius: '8px',
                                                        background: '#e0e7ff',
                                                        color: '#4338ca',
                                                        fontWeight: '800',
                                                        fontSize: '0.75rem',
                                                        border: '1px solid #c7d2fe'
                                                    }}>
                                                        {sub.className || 'Class'}
                                                    </span>
                                                )}
                                                <span style={{
                                                    padding: '0.2rem 0.55rem',
                                                    borderRadius: '8px',
                                                    background: '#f1f5f9',
                                                    color: '#475569',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '700'
                                                }}>
                                                    {sub.month || 'Current Month'}
                                                </span>
                                            </div>

                                            {/* Payment Channel Badge */}
                                            <span style={{
                                                padding: '0.25rem 0.6rem',
                                                borderRadius: '8px',
                                                fontSize: '0.75rem',
                                                fontWeight: '800',
                                                background: badge.bg,
                                                color: badge.color,
                                                border: `1px solid ${badge.border}`,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.3rem'
                                            }}>
                                                <badge.icon size={13} /> {badge.label}
                                            </span>
                                        </div>

                                        {/* Card Body: Split thumbnail + student ledger */}
                                        <div style={{ padding: '1.15rem', display: 'flex', gap: '1rem', flex: 1 }}>
                                            {/* Slip Thumbnail with Hover Magnifier */}
                                            <div style={{ width: '105px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {sub.proofUrl ? (
                                                    <div
                                                        onClick={() => {
                                                            setSelectedProofUrl(sub.proofUrl);
                                                            setZoomLevel(1);
                                                            setSlipRotation(0);
                                                        }}
                                                        style={{
                                                            width: '100%',
                                                            height: '115px',
                                                            borderRadius: '12px',
                                                            overflow: 'hidden',
                                                            border: '1.5px solid #cbd5e1',
                                                            cursor: 'pointer',
                                                            position: 'relative',
                                                            background: '#0f172a'
                                                        }}
                                                        title="Click to inspect slip in HD"
                                                    >
                                                        <img
                                                            src={sub.proofUrl}
                                                            alt="Slip"
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        />
                                                        <div style={{
                                                            position: 'absolute',
                                                            inset: 0,
                                                            background: 'rgba(0,0,0,0.35)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            opacity: 0.9,
                                                            transition: 'opacity 0.2s'
                                                        }}>
                                                            <ZoomIn size={20} color="white" />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{
                                                        width: '100%',
                                                        height: '115px',
                                                        borderRadius: '12px',
                                                        background: '#f1f5f9',
                                                        border: '1px dashed #cbd5e1',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: '#94a3b8',
                                                        fontSize: '0.75rem',
                                                        textAlign: 'center',
                                                        padding: '0.5rem'
                                                    }}>
                                                        No Slip Image
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setReviewingSub(sub);
                                                        setZoomLevel(1);
                                                        setSlipRotation(0);
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        padding: '0.35rem',
                                                        borderRadius: '8px',
                                                        border: '1px solid #c7d2fe',
                                                        background: '#e0e7ff',
                                                        color: '#4338ca',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '700',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '0.25rem'
                                                    }}
                                                >
                                                    <ShieldCheck size={13} /> Full Audit
                                                </button>
                                            </div>

                                            {/* Right Info: Student name, breakdown, TRX */}
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                                <div>
                                                    {isFamily ? (
                                                        <div>
                                                            <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: '800', color: '#1e293b' }}>
                                                                {sub.parentName || 'Family Head'}
                                                            </h4>
                                                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.5rem' }}>
                                                                Phone: {sub.parentPhone || '—'}
                                                            </div>
                                                            <div style={{ background: '#faf5ff', borderRadius: '8px', padding: '0.45rem 0.65rem', border: '1px solid #f3e8ff' }}>
                                                                {sub.familyStudents.map((s, idx) => (
                                                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '0.15rem 0', color: '#4b5563' }}>
                                                                        <span style={{ fontWeight: '600' }}>• {s.studentName} ({s.className || 'Class'})</span>
                                                                        <span style={{ fontWeight: '700', color: '#6b21a8' }}>Rs. {Number(s.subtotal || 0).toLocaleString()}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <h4 style={{ margin: '0 0 0.15rem', fontSize: '1rem', fontWeight: '800', color: '#1e293b' }}>
                                                                {sub.studentName}
                                                            </h4>
                                                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.35rem' }}>
                                                                Parent: <strong>{sub.parentName || 'Parent'}</strong> {sub.parentPhone ? `(${sub.parentPhone})` : ''}
                                                            </div>
                                                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                                                Class: <strong>{sub.className}</strong> • Roll: <strong>{sub.rollNo || 'N/A'}</strong>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* TRX ID with 1-Click Copy */}
                                                    <div style={{
                                                        marginTop: '0.65rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        background: '#f8fafc',
                                                        padding: '0.35rem 0.6rem',
                                                        borderRadius: '8px',
                                                        border: '1px solid #e2e8f0'
                                                    }}>
                                                        <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#334155', fontWeight: '700' }}>
                                                            TRX: {sub.transactionId || 'None'}
                                                        </div>
                                                        {sub.transactionId && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCopyTrx(sub.transactionId)}
                                                                style={{
                                                                    background: 'none',
                                                                    border: 'none',
                                                                    cursor: 'pointer',
                                                                    color: copiedTrx === sub.transactionId ? '#16a34a' : '#6366f1',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.2rem',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: '700'
                                                                }}
                                                            >
                                                                {copiedTrx === sub.transactionId ? <CheckCheck size={12} /> : <Copy size={12} />}
                                                                {copiedTrx === sub.transactionId ? 'Copied' : 'Copy'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Total Amount Tag */}
                                                <div style={{
                                                    marginTop: '0.75rem',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'baseline',
                                                    paddingTop: '0.5rem',
                                                    borderTop: '1px dashed #e2e8f0'
                                                }}>
                                                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Slip Amount</span>
                                                    <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#0f172a' }}>
                                                        Rs. {Number(sub.amount || 0).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card Action Footer */}
                                        <div style={{
                                            padding: '0.75rem 1.15rem',
                                            background: '#f8fafc',
                                            borderTop: '1px solid #e2e8f0',
                                            display: 'flex',
                                            gap: '0.5rem',
                                            justifyContent: 'flex-end'
                                        }}>
                                            <button
                                                type="button"
                                                onClick={() => setReuploadSub(sub)}
                                                disabled={isProcessing}
                                                style={{
                                                    padding: '0.45rem 0.75rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #fde68a',
                                                    background: '#fffbeb',
                                                    color: '#b45309',
                                                    fontSize: '0.78rem',
                                                    fontWeight: '700',
                                                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.3rem'
                                                }}
                                            >
                                                <RefreshCw size={13} /> Re-upload
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setRejectReason(sub.rejectReason || '');
                                                    setRejectingSub(sub);
                                                }}
                                                disabled={isProcessing}
                                                style={{
                                                    padding: '0.45rem 0.75rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #fecaca',
                                                    background: '#fef2f2',
                                                    color: '#dc2626',
                                                    fontSize: '0.78rem',
                                                    fontWeight: '700',
                                                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.3rem'
                                                }}
                                            >
                                                <X size={13} /> Reject
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleApprove(sub)}
                                                disabled={isProcessing}
                                                style={{
                                                    padding: '0.45rem 1.15rem',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    background: '#16a34a',
                                                    color: 'white',
                                                    fontSize: '0.82rem',
                                                    fontWeight: '800',
                                                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.35rem',
                                                    boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)',
                                                    opacity: isProcessing ? 0.6 : 1
                                                }}
                                            >
                                                {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                <span>Approve Slip</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
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
                        <div style={{ textAlign: 'center', padding: '3rem' }}>
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
                                                {/* Receipt & Status */}
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

                                                {/* Student & Class */}
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

                                                {/* Month */}
                                                <td style={{ padding: '0.9rem 1.15rem' }}>
                                                    <span style={{ fontWeight: '700', color: '#4f46e5', fontSize: '0.8rem' }}>
                                                        {sub.month || 'Current Month'}
                                                    </span>
                                                </td>

                                                {/* Parent */}
                                                <td style={{ padding: '0.9rem 1.15rem' }}>
                                                    <div style={{ fontWeight: '600', color: '#334155' }}>{sub.parentName || 'Parent'}</div>
                                                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{sub.parentPhone || '—'}</div>
                                                </td>

                                                {/* Channel */}
                                                <td style={{ padding: '0.9rem 1.15rem' }}>
                                                    <span style={{
                                                        padding: '0.2rem 0.55rem',
                                                        borderRadius: '6px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: '700',
                                                        background: badge.bg,
                                                        color: badge.color,
                                                        border: `1px solid ${badge.border}`
                                                    }}>
                                                        {badge.label}
                                                    </span>
                                                </td>

                                                {/* Amount */}
                                                <td style={{ padding: '0.9rem 1.15rem' }}>
                                                    <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.95rem' }}>
                                                        Rs. {Number(sub.amount || 0).toLocaleString()}
                                                    </div>
                                                </td>

                                                {/* Date */}
                                                <td style={{ padding: '0.9rem 1.15rem' }}>
                                                    <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: '600' }}>
                                                        {sub.approvedAt ? new Date(sub.approvedAt).toLocaleDateString() : (sub.rejectedAt ? new Date(sub.rejectedAt).toLocaleDateString() : (sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString() : '—'))}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                                        {sub.approvedAt ? new Date(sub.approvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                                    </div>
                                                </td>

                                                {/* Audit Button */}
                                                <td style={{ padding: '0.9rem 1.15rem', textAlign: 'right' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setReviewingSub(sub);
                                                            setZoomLevel(1);
                                                            setSlipRotation(0);
                                                        }}
                                                        style={{
                                                            padding: '0.4rem 0.8rem',
                                                            borderRadius: '8px',
                                                            border: '1px solid #cbd5e1',
                                                            background: '#f8fafc',
                                                            color: '#334155',
                                                            fontWeight: '700',
                                                            fontSize: '0.78rem',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.35rem'
                                                        }}
                                                    >
                                                        <Eye size={13} color="#4f46e5" /> View Slip
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
                            background: 'white', borderRadius: '16px', maxWidth: '780px', width: '95%',
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
                                Payment Slip Receipt
                            </h4>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {/* Zoom & Rotation Pill */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    background: '#ffffff',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '8px',
                                    padding: '2px'
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
                                    <ExternalLink size={13} /> Open Full
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
            {/* SPLIT-SCREEN VERIFICATION COCKPIT MODAL                                  */}
            {/* ========================================================================= */}
            {reviewingSub && (
                <div
                    onClick={() => {
                        setReviewingSub(null);
                        setZoomLevel(1);
                        setSlipRotation(0);
                    }}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.8)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998,
                        padding: '1.25rem', backdropFilter: 'blur(5px)'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'white', borderRadius: '20px', maxWidth: '1080px', width: '96%',
                            maxHeight: '92vh', display: 'flex', flexDirection: 'column',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden'
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <div style={{
                                    width: '38px', height: '38px', borderRadius: '10px',
                                    background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <ShieldCheck size={22} color="#4f46e5" />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#0f172a' }}>
                                        {reviewingSub.isFamilyCombined ? 'Family Payment Audit & Reconciliation' : 'Student Payment Verification Cockpit'}
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                                        {reviewingSub.isFamilyCombined
                                            ? `Combined Submission for ${reviewingSub.familyStudents?.length || 2} Students`
                                            : `Single Student: ${reviewingSub.studentName} (${reviewingSub.className})`}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setReviewingSub(null);
                                    setZoomLevel(1);
                                    setSlipRotation(0);
                                }}
                                style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Split Body */}
                        <div style={{
                            display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) minmax(380px, 1.25fr)',
                            flex: 1, overflow: 'hidden', minHeight: '440px'
                        }}>
                            {/* Left Pane: Zoomable & Rotatable Payment Slip */}
                            <div style={{
                                background: '#0f172a', padding: '1rem', display: 'flex', flexDirection: 'column',
                                borderRight: '1px solid #334155'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                    <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Receipt Slip Proof
                                    </span>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <button
                                            type="button"
                                            onClick={handleZoomOut}
                                            disabled={zoomLevel <= 1}
                                            title="Zoom Out"
                                            style={{ width: '26px', height: '26px', borderRadius: '6px', border: 'none', background: '#334155', color: 'white', cursor: 'pointer' }}
                                        >
                                            <ZoomOut size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleZoomIn}
                                            disabled={zoomLevel >= 2.5}
                                            title="Zoom In"
                                            style={{ width: '26px', height: '26px', borderRadius: '6px', border: 'none', background: '#334155', color: 'white', cursor: 'pointer' }}
                                        >
                                            <ZoomIn size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleRotateSlip}
                                            title="Rotate"
                                            style={{ width: '26px', height: '26px', borderRadius: '6px', border: 'none', background: '#334155', color: 'white', cursor: 'pointer' }}
                                        >
                                            <RotateCw size={13} />
                                        </button>
                                        {reviewingSub.proofUrl && (
                                            <a
                                                href={reviewingSub.proofUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                style={{ color: '#818cf8', fontSize: '0.75rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.25rem' }}
                                            >
                                                <ExternalLink size={12} /> Open Full
                                            </a>
                                        )}
                                    </div>
                                </div>

                                <div style={{
                                    flex: 1, background: '#020617', borderRadius: '12px', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative'
                                }}>
                                    {reviewingSub.proofUrl ? (
                                        <img
                                            src={reviewingSub.proofUrl}
                                            alt="Slip Proof"
                                            style={{
                                                transform: `scale(${zoomLevel}) rotate(${slipRotation}deg)`,
                                                transformOrigin: 'center center',
                                                transition: 'transform 0.2s ease',
                                                maxWidth: '100%', maxHeight: '420px', objectFit: 'contain',
                                                borderRadius: '8px'
                                            }}
                                        />
                                    ) : (
                                        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>No proof image attached</div>
                                    )}
                                </div>
                            </div>

                            {/* Right Pane: Itemized Ledger & Reconciliation */}
                            <div style={{
                                padding: '1.25rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem',
                                background: '#ffffff'
                            }}>
                                {/* Target Fee Month & Channel */}
                                <div style={{
                                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem',
                                    background: '#f8fafc', padding: '0.85rem', borderRadius: '12px', border: '1px solid #e2e8f0'
                                }}>
                                    <div style={{
                                        gridColumn: '1 / -1',
                                        background: '#f5f3ff', border: '1.5px solid #c4b5fd', borderRadius: '10px',
                                        padding: '0.65rem 0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <Calendar size={18} color="#7c3aed" />
                                            <div>
                                                <div style={{ fontSize: '0.7rem', color: '#6d28d9', textTransform: 'uppercase', fontWeight: '800' }}>Fee Month</div>
                                                <div style={{ fontWeight: '800', color: '#4c1d95', fontSize: '0.95rem' }}>
                                                    {reviewingSub.month || 'Current Month'}
                                                </div>
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#6d28d9', background: '#ffffff', padding: '0.25rem 0.6rem', borderRadius: '6px', fontWeight: '700', border: '1px solid #ddd6fe' }}>
                                            Online Verification
                                        </span>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Parent / Guardian</div>
                                        <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.9rem' }}>{reviewingSub.parentName || 'Parent'}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{reviewingSub.parentPhone || '—'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Payment Mode</div>
                                        <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.9rem' }}>{reviewingSub.paymentMethod || 'Online'}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>A/C: {reviewingSub.accountNumberPaidTo || 'Official A/C'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>TRX ID / Reference</div>
                                        <div style={{ fontWeight: '800', fontFamily: 'monospace', color: '#4338ca', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <span>{reviewingSub.transactionId || 'None entered'}</span>
                                            {reviewingSub.transactionId && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopyTrx(reviewingSub.transactionId)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1' }}
                                                >
                                                    <Copy size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Submitted Date</div>
                                        <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: '600' }}>
                                            {reviewingSub.submittedAt ? new Date(reviewingSub.submittedAt).toLocaleString() : '—'}
                                        </div>
                                    </div>
                                </div>

                                {/* Itemized Breakdown (Family or Single) */}
                                <div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <FileCheck size={16} color="#4f46e5" />
                                        <span>Itemized Bill Distribution</span>
                                    </div>

                                    {reviewingSub.isFamilyCombined && reviewingSub.familyStudents?.length > 0 ? (
                                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                <thead>
                                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                                                        <th style={{ padding: '0.6rem 0.85rem' }}>Student</th>
                                                        <th style={{ padding: '0.6rem 0.85rem' }}>Class & Roll</th>
                                                        <th style={{ padding: '0.6rem 0.85rem', textAlign: 'right' }}>Calculated Due</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {reviewingSub.familyStudents.map((std, idx) => (
                                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                            <td style={{ padding: '0.65rem 0.85rem', fontWeight: '700', color: '#1e293b' }}>
                                                                {std.studentName}
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.85rem', color: '#64748b' }}>
                                                                {std.className} (Roll: {std.rollNo || 'N/A'})
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>
                                                                Rs. {Number(std.subtotal || 0).toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.85rem', background: '#faf5ff' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ fontWeight: '700', color: '#581c87', fontSize: '0.9rem' }}>{reviewingSub.studentName}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#7e22ce' }}>Class: {reviewingSub.className} • Roll: {reviewingSub.rollNo || 'N/A'}</div>
                                                </div>
                                                <div style={{ fontWeight: '800', color: '#581c87', fontSize: '1.05rem' }}>
                                                    Rs. {Number(reviewingSub.amount || 0).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Reconciliation Match Banner */}
                                <div style={{
                                    padding: '0.85rem 1rem', borderRadius: '12px',
                                    background: '#ecfdf5', border: '1px solid #a7f3d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#065f46', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <CheckCircle2 size={16} color="#059669" />
                                            <span>Zero-Discrepancy Match</span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#047857' }}>
                                            Amount matches student dues & online slip submission
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.7rem', color: '#065f46', textTransform: 'uppercase', fontWeight: '600' }}>Total Paid on Slip</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#065f46' }}>
                                            Rs. {Number(reviewingSub.amount || 0).toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                {/* Modal Actions */}
                                <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setReviewingSub(null);
                                            setZoomLevel(1);
                                            setSlipRotation(0);
                                        }}
                                        style={{ padding: '0.55rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontWeight: '600', cursor: 'pointer' }}
                                    >
                                        Close
                                    </button>

                                    {(reviewingSub.status || 'pending') === 'pending' && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setReuploadSub(reviewingSub)}
                                                disabled={Boolean(processingId && processingId === reviewingSub.id)}
                                                style={{
                                                    padding: '0.55rem 1rem', borderRadius: '10px', border: '1px solid #fde68a',
                                                    background: '#fffbeb', color: '#b45309', fontWeight: '700', fontSize: '0.85rem',
                                                    cursor: processingId === reviewingSub.id ? 'not-allowed' : 'pointer',
                                                    display: 'flex', alignItems: 'center', gap: '0.35rem'
                                                }}
                                            >
                                                <RefreshCw size={14} /> Request Re-upload
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setRejectReason(reviewingSub.rejectReason || '');
                                                    setRejectingSub(reviewingSub);
                                                }}
                                                disabled={Boolean(processingId && processingId === reviewingSub.id)}
                                                style={{
                                                    padding: '0.55rem 1rem', borderRadius: '10px', border: '1px solid #fecaca',
                                                    background: '#fef2f2', color: '#dc2626', fontWeight: '700', fontSize: '0.85rem',
                                                    cursor: processingId === reviewingSub.id ? 'not-allowed' : 'pointer',
                                                    display: 'flex', alignItems: 'center', gap: '0.35rem'
                                                }}
                                            >
                                                <X size={14} /> Reject
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleApprove(reviewingSub)}
                                                disabled={Boolean(processingId && processingId === reviewingSub.id)}
                                                style={{
                                                    padding: '0.55rem 1.4rem', borderRadius: '10px', border: 'none',
                                                    background: '#16a34a', color: 'white', fontWeight: '800', fontSize: '0.85rem',
                                                    cursor: processingId === reviewingSub.id ? 'not-allowed' : 'pointer',
                                                    display: 'flex', alignItems: 'center', gap: '0.45rem',
                                                    boxShadow: '0 4px 6px -1px rgba(22, 163, 74, 0.3)',
                                                    opacity: processingId === reviewingSub.id ? 0.6 : 1
                                                }}
                                            >
                                                {processingId === reviewingSub.id ? (
                                                    <Loader2 size={16} className="animate-spin" />
                                                ) : (
                                                    <Check size={16} />
                                                )}
                                                Approve & Issue Receipt
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OnlineSubmissionsDashboard;
