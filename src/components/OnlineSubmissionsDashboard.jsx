import React, { useState, useEffect } from 'react';
import { 
    Clock, CheckCircle2, XCircle, Search, Eye, Filter, Download, ExternalLink, 
    Smartphone, Landmark, AlertCircle, ArrowUpRight, Check, X, Loader2,
    ZoomIn, ZoomOut, RotateCcw, Users, ShieldCheck, FileCheck, RefreshCw, AlertTriangle, Copy,
    Calendar
} from 'lucide-react';
import { db, storage } from '../firebase';
import { 
    collection, onSnapshot, query, doc, updateDoc, setDoc, getDoc, orderBy, serverTimestamp, writeBatch, arrayUnion
} from 'firebase/firestore';

const OnlineSubmissionsDashboard = ({ schoolId, schoolInfo }) => {
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('pending'); // 'all', 'pending', 'approved', 'rejected'
    const [searchQuery, setSearchQuery] = useState('');
    
    // Modal states
    const [selectedProofUrl, setSelectedProofUrl] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(1); // 1 = 100%, 1.5 = 150%, 2 = 200%, 2.5 = 250%
    const [reviewingSub, setReviewingSub] = useState(null);
    const [rejectingSub, setRejectingSub] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [reuploadSub, setReuploadSub] = useState(null);
    const [reuploadNote, setReuploadNote] = useState('');
    const [processingId, setProcessingId] = useState(null);

    const handleZoomIn = () => {
        setZoomLevel(prev => Math.min(Number((prev + 0.5).toFixed(1)), 2.5));
    };

    const handleZoomOut = () => {
        setZoomLevel(prev => Math.max(Number((prev - 0.5).toFixed(1)), 1));
    };

    const handleResetZoom = () => {
        setZoomLevel(1);
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
            setSubmissions(list);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching payment submissions:", err);
            setLoading(false);
        });

        return () => unsub();
    }, [schoolId]);

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

    // Handle Reject (Cleanly release all students with explicit rejection reason)
    const confirmReject = async () => {
        if (!rejectingSub) return;

        setProcessingId(rejectingSub.id);
        try {
            const nowIso = new Date().toISOString();
            const message = rejectReason.trim() || 'Payment proof could not be verified by administration.';
            const batch = writeBatch(db);

            // 1. Update submission doc
            const subRef = doc(db, `schools/${schoolId}/paymentSubmissions`, rejectingSub.id);
            batch.update(subRef, {
                status: 'rejected',
                rejectedAt: nowIso,
                rejectReason: message
            });

            // 2. Explicit Rejection Tag for real-time synchronization with Parent Mobile App
            const rejectTag = {
                status: 'rejected',
                rejectReason: message,
                rejectedAt: nowIso,
                submissionId: rejectingSub.id,
                paymentMethod: rejectingSub.paymentMethod || 'Online',
                amount: Number(rejectingSub.amount) || 0,
                transactionId: rejectingSub.transactionId || ''
            };

            // 3. Atomically update all associated student records (Class subcollection + Master)
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

    // Handle Request Re-upload (Proof unclear or incomplete)
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

    // Metrics
    const pendingCount = submissions.filter(s => (s.status || 'pending') === 'pending').length;
    const approvedCount = submissions.filter(s => s.status === 'approved').length;
    const rejectedCount = submissions.filter(s => s.status === 'rejected').length;
    const totalCollectedOnline = submissions
        .filter(s => s.status === 'approved')
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    // Filtered List
    const filteredList = submissions.filter(sub => {
        const matchesStatus = filterStatus === 'all' || (sub.status || 'pending') === filterStatus;
        const queryLower = searchQuery.toLowerCase();
        const matchesQuery = !searchQuery || 
            (sub.studentName && sub.studentName.toLowerCase().includes(queryLower)) ||
            (sub.className && sub.className.toLowerCase().includes(queryLower)) ||
            (sub.rollNo && sub.rollNo.toString().toLowerCase().includes(queryLower)) ||
            (sub.transactionId && sub.transactionId.toLowerCase().includes(queryLower)) ||
            (sub.parentName && sub.parentName.toLowerCase().includes(queryLower)) ||
            (sub.paymentMethod && sub.paymentMethod.toLowerCase().includes(queryLower));

        return matchesStatus && matchesQuery;
    });

    const getMethodBadge = (method) => {
        const m = (method || '').toLowerCase();
        if (m.includes('easypaisa')) {
            return { label: 'EasyPaisa', bg: '#dcfce7', color: '#15803d', border: '#86efac' };
        } else if (m.includes('jazzcash')) {
            return { label: 'JazzCash', bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' };
        }
        return { label: method || 'Bank Transfer', bg: '#f3e8ff', color: '#7e22ce', border: '#d8b4fe' };
    };

    // Overview Cards Stats (Matching Main Dashboard Theme)
    const overviewCards = [
        {
            label: 'Pending Verifications',
            value: pendingCount.toLocaleString(),
            icon: Clock,
            gradient: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
            shadow: 'rgba(245, 158, 11, 0.4)',
            showTag: pendingCount > 0,
            tagText: 'Needs Review',
            onClick: () => setFilterStatus('pending')
        },
        {
            label: 'Approved Submissions',
            value: approvedCount.toLocaleString(),
            icon: CheckCircle2,
            gradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
            shadow: 'rgba(16, 185, 129, 0.4)',
            showTag: false,
            onClick: () => setFilterStatus('approved')
        },
        {
            label: 'Rejected Submissions',
            value: rejectedCount.toLocaleString(),
            icon: XCircle,
            gradient: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
            shadow: 'rgba(239, 68, 68, 0.4)',
            showTag: false,
            onClick: () => setFilterStatus('rejected')
        },
        {
            label: 'Online Fee Collected',
            value: `Rs. ${totalCollectedOnline.toLocaleString()}`,
            icon: Landmark,
            gradient: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
            shadow: 'rgba(99, 102, 241, 0.4)',
            showTag: false,
            onClick: () => setFilterStatus('all')
        }
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Top Metric Overview Cards (Compact Design) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
                {overviewCards.map((stat, i) => (
                    <div
                        key={i}
                        className="card"
                        onClick={stat.onClick}
                        style={{
                            padding: '1rem 1.15rem',
                            position: 'relative',
                            overflow: 'hidden',
                            border: 'none',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.65rem',
                            background: stat.gradient,
                            color: 'white',
                            boxShadow: `0 10px 15px -3px ${stat.shadow}`,
                            transition: 'all 0.2s ease',
                            cursor: 'pointer'
                        }}
                    >
                        {/* 2D Geometric Pattern (Square) */}
                        <div style={{
                            position: 'absolute',
                            top: '-20%',
                            right: '-10%',
                            width: '85px',
                            height: '85px',
                            background: 'rgba(255, 255, 255, 0.12)',
                            borderRadius: '24px',
                            transform: 'rotate(20deg)',
                            zIndex: 1
                        }} />

                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            position: 'relative',
                            zIndex: 2
                        }}>
                            <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                background: 'rgba(255, 255, 255, 0.2)',
                                backdropFilter: 'blur(8px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid rgba(255, 255, 255, 0.3)'
                            }}>
                                <stat.icon size={20} color="white" />
                            </div>
                            {stat.showTag && (
                                <div style={{
                                    padding: '0.2rem 0.55rem',
                                    borderRadius: '8px',
                                    background: 'rgba(255, 255, 255, 0.2)',
                                    color: 'white',
                                    fontSize: '0.7rem',
                                    fontWeight: '700',
                                    border: '1px solid rgba(255, 255, 255, 0.25)',
                                    backdropFilter: 'blur(4px)'
                                }}>
                                    {stat.tagText || 'Live'}
                                </div>
                            )}
                        </div>

                        <div style={{ position: 'relative', zIndex: 2 }}>
                            <p style={{ fontSize: '0.8rem', fontWeight: '600', opacity: 0.9, marginBottom: '0.15rem', letterSpacing: '0.01em', color: 'white' }}>
                                {stat.label}
                            </p>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                                <h3 style={{ fontSize: '1.45rem', fontWeight: '800', letterSpacing: '-0.02em', color: 'white' }}>
                                    {stat.value}
                                </h3>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filter and Search Bar */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem',
                background: 'white', padding: '1rem 1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0'
            }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Filter size={18} color="var(--text-secondary)" />
                    {[
                        { id: 'pending', label: `Pending (${pendingCount})` },
                        { id: 'approved', label: `Approved (${approvedCount})` },
                        { id: 'rejected', label: `Rejected (${rejectedCount})` },
                        { id: 'all', label: `All (${submissions.length})` }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setFilterStatus(tab.id)}
                            style={{
                                padding: '0.4rem 0.9rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '600',
                                border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                                background: filterStatus === tab.id ? 'var(--primary)' : '#f1f5f9',
                                color: filterStatus === tab.id ? 'white' : '#475569'
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', padding: '0.4rem 0.8rem', borderRadius: '10px', border: '1px solid #e2e8f0', minWidth: '260px' }}>
                    <Search size={16} color="#94a3b8" style={{ marginRight: '0.5rem' }} />
                    <input
                        type="text"
                        placeholder="Search student, TRX ID, roll #..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', width: '100%' }}
                    />
                </div>
            </div>

            {/* Submissions List / Table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', background: 'white', borderRadius: '16px' }}>
                    <Loader2 size={32} className="animate-spin" color="var(--primary)" style={{ margin: '0 auto 1rem' }} />
                    <p style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>Loading payment submissions...</p>
                </div>
            ) : filteredList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem', background: 'white', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                    <Clock size={40} color="#94a3b8" style={{ margin: '0 auto 1rem' }} />
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#334155', marginBottom: '0.25rem' }}>No Submissions Found</h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>There are no {filterStatus} fee submissions to display at this moment.</p>
                </div>
            ) : (
                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: '700', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    <th style={{ padding: '1rem 1.25rem' }}>Student & Class</th>
                                    <th style={{ padding: '1rem 1.25rem' }}>Fee Month</th>
                                    <th style={{ padding: '1rem 1.25rem' }}>Parent & Contact</th>
                                    <th style={{ padding: '1rem 1.25rem' }}>Payment Method</th>
                                    <th style={{ padding: '1rem 1.25rem' }}>Amount</th>
                                    <th style={{ padding: '1rem 1.25rem' }}>TRX / Date</th>
                                    <th style={{ padding: '1rem 1.25rem' }}>Proof / Slip</th>
                                    <th style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredList.map((sub) => {
                                    const badge = getMethodBadge(sub.paymentMethod);
                                    const isPending = (sub.status || 'pending') === 'pending';
                                    const isApproved = sub.status === 'approved';
                                    const isRejected = sub.status === 'rejected';

                                    return (
                                        <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                                            {/* Student & Class */}
                                            <td style={{ padding: '1rem 1.25rem' }}>
                                                {sub.isFamilyCombined && sub.familyStudents?.length > 0 ? (
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                                                            <span style={{
                                                                padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '800',
                                                                background: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe', display: 'inline-flex', alignItems: 'center', gap: '0.25rem'
                                                            }}>
                                                                <Users size={12} /> Family ({sub.familyStudents.length} Students)
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '0.85rem', color: '#1e293b', fontWeight: '700' }}>
                                                            {sub.familyStudents.map(s => s.studentName).join(', ')}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                            {sub.familyStudents.map(s => s.className).filter(Boolean).join(' • ')}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div style={{ fontWeight: '700', color: '#1e293b' }}>{sub.studentName}</div>
                                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                            {sub.className} • Roll: {sub.rollNo || 'N/A'}
                                                        </div>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Fee Month */}
                                            <td style={{ padding: '1rem 1.25rem' }}>
                                                <span style={{
                                                    padding: '0.35rem 0.75rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '800',
                                                    background: '#f5f3ff', color: '#6d28d9', border: '1.5px solid #ddd6fe',
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                                    boxShadow: '0 1px 2px rgba(109, 40, 217, 0.05)'
                                                }}>
                                                    <Calendar size={13} color="#7c3aed" /> {sub.month || 'Current Month'}
                                                </span>
                                            </td>

                                            {/* Parent */}
                                            <td style={{ padding: '1rem 1.25rem' }}>
                                                <div style={{ fontWeight: '600', color: '#334155' }}>{sub.parentName || 'Parent'}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{sub.parentPhone || '—'}</div>
                                            </td>

                                            {/* Method */}
                                            <td style={{ padding: '1rem 1.25rem' }}>
                                                <span style={{
                                                    padding: '0.25rem 0.6rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '700',
                                                    background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`
                                                }}>
                                                    {badge.label}
                                                </span>
                                            </td>

                                            {/* Amount */}
                                            <td style={{ padding: '1rem 1.25rem' }}>
                                                <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.95rem' }}>
                                                    Rs. {Number(sub.amount || 0).toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{sub.month || 'Current Month'}</div>
                                            </td>

                                            {/* TRX / Date */}
                                            <td style={{ padding: '1rem 1.25rem' }}>
                                                <div style={{ fontFamily: 'monospace', fontWeight: '600', color: '#475569', fontSize: '0.8rem' }}>
                                                    {sub.transactionId || 'No TRX ID'}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                    {sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                </div>
                                            </td>

                                            {/* Proof Slip Preview */}
                                            <td style={{ padding: '1rem 1.25rem' }}>
                                                {sub.proofUrl ? (
                                                    <div 
                                                        onClick={() => {
                                                            setSelectedProofUrl(sub.proofUrl);
                                                            setZoomLevel(1);
                                                        }}
                                                        style={{
                                                            width: '48px', height: '48px', borderRadius: '8px', overflow: 'hidden',
                                                            border: '1px solid #cbd5e1', cursor: 'pointer', position: 'relative'
                                                        }}
                                                        title="Click to view slip full screen"
                                                    >
                                                        <img 
                                                            src={sub.proofUrl} 
                                                            alt="Payment Slip" 
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                        />
                                                        <div style={{
                                                            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0,
                                                            transition: 'opacity 0.2s'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                                                        >
                                                            <Eye size={16} color="white" />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No image</span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                    <button
                                                        onClick={() => {
                                                            setReviewingSub(sub);
                                                            setZoomLevel(1);
                                                        }}
                                                        title="Audit & Reconcile Details"
                                                        style={{
                                                            padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1',
                                                            background: '#f8fafc', color: '#334155', fontWeight: '700', fontSize: '0.8rem',
                                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem'
                                                        }}
                                                    >
                                                        <ShieldCheck size={14} color="#6366f1" /> Review
                                                    </button>
                                                    {isPending ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleApprove(sub)}
                                                                disabled={Boolean(processingId && processingId === sub.id)}
                                                                style={{
                                                                    padding: '0.45rem 0.8rem', borderRadius: '8px', border: 'none',
                                                                    background: '#16a34a', color: 'white', fontWeight: '700', fontSize: '0.8rem',
                                                                    cursor: processingId === sub.id ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem',
                                                                    boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)',
                                                                    opacity: processingId === sub.id ? 0.6 : 1
                                                                }}
                                                            >
                                                                <Check size={14} /> Approve
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setRejectReason(sub.rejectReason || '');
                                                                    setRejectingSub(sub);
                                                                }}
                                                                disabled={Boolean(processingId && processingId === sub.id)}
                                                                style={{
                                                                    padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #fecaca',
                                                                    background: '#fef2f2', color: '#dc2626', fontWeight: '700', fontSize: '0.8rem',
                                                                    cursor: processingId === sub.id ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem',
                                                                    opacity: processingId === sub.id ? 0.6 : 1
                                                                }}
                                                            >
                                                                <X size={14} /> Reject
                                                            </button>
                                                        </>
                                                    ) : isApproved ? (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#16a34a', fontWeight: '700', fontSize: '0.85rem' }}>
                                                            <CheckCircle2 size={16} /> Approved
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setRejectReason(sub.rejectReason || '');
                                                                setRejectingSub(sub);
                                                            }}
                                                            title="Click to view or re-apply rejection reason"
                                                            style={{
                                                                padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid #fecaca',
                                                                background: '#fef2f2', color: '#dc2626', fontWeight: '700', fontSize: '0.8rem',
                                                                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem'
                                                            }}
                                                        >
                                                            <XCircle size={15} /> Rejected (Update)
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Proof Lightbox Modal */}
            {selectedProofUrl && (
                <div 
                    onClick={() => {
                        setSelectedProofUrl(null);
                        setZoomLevel(1);
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
                            background: 'white', borderRadius: '16px', maxWidth: '750px', width: '95%',
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
                                {/* Zoom Controls Pill */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    background: '#ffffff',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '8px',
                                    padding: '2px',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                }}>
                                    <button 
                                        type="button"
                                        onClick={handleZoomOut}
                                        disabled={zoomLevel <= 1}
                                        title="Zoom Out"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '28px',
                                            height: '28px',
                                            border: 'none',
                                            background: zoomLevel <= 1 ? '#f8fafc' : 'white',
                                            color: zoomLevel <= 1 ? '#cbd5e1' : '#334155',
                                            cursor: zoomLevel <= 1 ? 'not-allowed' : 'pointer',
                                            borderRadius: '6px',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <ZoomOut size={15} />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleResetZoom}
                                        title="Click to reset zoom (100%)"
                                        style={{
                                            padding: '0 0.45rem',
                                            height: '28px',
                                            border: 'none',
                                            background: 'transparent',
                                            color: zoomLevel > 1 ? '#4f46e5' : '#64748b',
                                            fontSize: '0.75rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            fontFamily: 'monospace',
                                            minWidth: '50px',
                                            textAlign: 'center'
                                        }}
                                    >
                                        {Math.round(zoomLevel * 100)}%
                                    </button>

                                    <button 
                                        type="button"
                                        onClick={handleZoomIn}
                                        disabled={zoomLevel >= 2.5}
                                        title="Zoom In (150%, 200%)"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '28px',
                                            height: '28px',
                                            border: 'none',
                                            background: zoomLevel >= 2.5 ? '#f8fafc' : 'white',
                                            color: zoomLevel >= 2.5 ? '#cbd5e1' : '#334155',
                                            cursor: zoomLevel >= 2.5 ? 'not-allowed' : 'pointer',
                                            borderRadius: '6px',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <ZoomIn size={15} />
                                    </button>

                                    {zoomLevel > 1 && (
                                        <button
                                            type="button"
                                            onClick={handleResetZoom}
                                            title="Reset to 100%"
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: '26px',
                                                height: '28px',
                                                border: 'none',
                                                background: '#f1f5f9',
                                                color: '#64748b',
                                                cursor: 'pointer',
                                                borderRadius: '6px',
                                                marginLeft: '2px'
                                            }}
                                        >
                                            <RotateCcw size={13} />
                                        </button>
                                    )}
                                </div>

                                <a 
                                    href={selectedProofUrl} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '0.3rem', 
                                        color: 'var(--primary, #4f46e5)', 
                                        fontSize: '0.8rem', 
                                        fontWeight: '600', 
                                        textDecoration: 'none', 
                                        padding: '0.4rem 0.65rem', 
                                        borderRadius: '8px', 
                                        background: '#ffffff',
                                        border: '1px solid #cbd5e1' 
                                    }}
                                >
                                    <ExternalLink size={13} /> Open Full
                                </a>

                                <button 
                                    type="button"
                                    onClick={() => {
                                        setSelectedProofUrl(null);
                                        setZoomLevel(1);
                                    }}
                                    style={{ 
                                        background: '#ffffff', 
                                        border: '1px solid #cbd5e1', 
                                        borderRadius: '8px',
                                        width: '32px',
                                        height: '32px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer', 
                                        color: '#64748b' 
                                    }}
                                    title="Close"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Image Viewer Container */}
                        <div 
                            style={{ 
                                padding: '1rem', 
                                maxHeight: '72vh', 
                                overflow: 'auto', 
                                display: 'flex', 
                                justifyContent: 'center', 
                                alignItems: zoomLevel > 1 ? 'flex-start' : 'center', 
                                background: '#0f172a',
                                minHeight: '350px'
                            }}
                        >
                            <div
                                style={{
                                    transform: `scale(${zoomLevel})`,
                                    transformOrigin: zoomLevel > 1 ? 'top center' : 'center center',
                                    transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
                                    display: 'inline-block',
                                    cursor: zoomLevel > 1 ? 'zoom-out' : 'zoom-in',
                                    padding: zoomLevel > 1 ? `${(zoomLevel - 1) * 12}rem ${(zoomLevel - 1) * 10}rem` : '0',
                                    margin: 'auto'
                                }}
                                onClick={() => {
                                    if (zoomLevel >= 2) setZoomLevel(1);
                                    else handleZoomIn();
                                }}
                                title={zoomLevel >= 2 ? "Click to reset zoom (100%)" : "Click to zoom in (150%, 200%)"}
                            >
                                <img 
                                    src={selectedProofUrl} 
                                    alt="Payment Proof Full" 
                                    style={{ 
                                        maxWidth: '100%', 
                                        maxHeight: '66vh', 
                                        display: 'block',
                                        objectFit: 'contain', 
                                        borderRadius: '8px',
                                        boxShadow: zoomLevel > 1 ? '0 25px 50px -12px rgba(0,0,0,0.8)' : 'none'
                                    }} 
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject Reason Modal */}
            {rejectingSub && (
                <div 
                    onClick={() => setRejectingSub(null)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10005,
                        padding: '1rem', backdropFilter: 'blur(4px)'
                    }}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{ background: 'white', borderRadius: '16px', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', border: '1px solid #e2e8f0' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={18} />
                            </div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#dc2626', margin: 0 }}>Reject Payment Submission</h3>
                        </div>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                            Rejecting payment for <strong>{rejectingSub.studentName}</strong> (Rs. {Number(rejectingSub.amount || 0).toLocaleString()}). Reason will be shown to parent:
                        </p>

                        {/* Quick Preset Reason Chips */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
                            {[
                                'Transaction ID (TRX) not found in bank statement',
                                'Payment slip is blurry or unreadable',
                                'Paid amount is incorrect',
                                'Duplicate submission / already accounted for'
                            ].map((preset, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setRejectReason(preset)}
                                    style={{
                                        fontSize: '0.72rem', padding: '3px 8px', borderRadius: '6px',
                                        border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c',
                                        cursor: 'pointer', textAlign: 'left', fontWeight: '500'
                                    }}
                                >
                                    + {preset}
                                </button>
                            ))}
                        </div>

                        <textarea
                            rows={3}
                            placeholder="State rejection reason (e.g. Transaction not found in school account)..."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            style={{
                                width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #cbd5e1',
                                fontSize: '0.85rem', outline: 'none', marginBottom: '1.25rem', fontFamily: 'inherit'
                            }}
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
                                style={{
                                    padding: '0.55rem 1.35rem', borderRadius: '8px', border: 'none',
                                    background: '#dc2626', color: 'white', fontWeight: '700',
                                    cursor: processingId === rejectingSub.id ? 'not-allowed' : 'pointer',
                                    opacity: processingId === rejectingSub.id ? 0.6 : 1,
                                    boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.3)'
                                }}
                            >
                                {processingId === rejectingSub.id ? 'Rejecting...' : 'Confirm Reject'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Request Re-upload Modal */}
            {reuploadSub && (
                <div 
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
                        padding: '1rem'
                    }}
                >
                    <div style={{ background: 'white', borderRadius: '16px', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <RefreshCw size={20} color="#d97706" />
                            <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#92400e', margin: 0 }}>Request Slip Re-upload</h3>
                        </div>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
                            Ask <strong>{reuploadSub.parentName || reuploadSub.studentName}</strong> to re-upload a clearer screenshot or payment proof slip:
                        </p>
                        <textarea
                            rows={3}
                            placeholder="e.g. The bank reference or amount is cropped. Please re-upload full screenshot..."
                            value={reuploadNote}
                            onChange={(e) => setReuploadNote(e.target.value)}
                            style={{
                                width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #cbd5e1',
                                fontSize: '0.85rem', outline: 'none', marginBottom: '1.25rem', fontFamily: 'inherit'
                            }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                onClick={() => {
                                    setReuploadSub(null);
                                    setReuploadNote('');
                                }}
                                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontWeight: '600', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
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

            {/* Comprehensive Split-Screen Audit & Verification Modal */}
            {reviewingSub && (
                <div
                    onClick={() => setReviewingSub(null)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998,
                        padding: '1.25rem', backdropFilter: 'blur(5px)'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'white', borderRadius: '20px', maxWidth: '1050px', width: '96%',
                            maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)', overflow: 'hidden'
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '10px',
                                    background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <ShieldCheck size={20} color="#4f46e5" />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                                        {reviewingSub.isFamilyCombined ? 'Family Payment Audit & Reconciliation' : 'Student Payment Verification'}
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                                        {reviewingSub.isFamilyCombined
                                            ? `Combined Submission for ${reviewingSub.familyStudents?.length || 2} Students`
                                            : `Single Student: ${reviewingSub.studentName} (${reviewingSub.className})`}
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => setReviewingSub(null)}
                                style={{
                                    background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px',
                                    width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', color: '#64748b'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Split Body */}
                        <div style={{
                            display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1.2fr)',
                            flex: 1, overflow: 'hidden', minHeight: '420px'
                        }}>
                            {/* Left Pane: Zoomable Payment Slip */}
                            <div style={{
                                background: '#0f172a', padding: '1rem', display: 'flex', flexDirection: 'column',
                                borderRight: '1px solid #334155'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                    <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Receipt Slip Proof
                                    </span>
                                    {reviewingSub.proofUrl && (
                                        <a
                                            href={reviewingSub.proofUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ color: '#818cf8', fontSize: '0.75rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                        >
                                            <ExternalLink size={12} /> Open Full
                                        </a>
                                    )}
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
                                                maxWidth: '100%', maxHeight: '420px', objectFit: 'contain',
                                                borderRadius: '8px'
                                            }}
                                        />
                                    ) : (
                                        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>No proof image attached</div>
                                    )}
                                </div>
                            </div>

                            {/* Right Pane: Itemized Audit & Verification Ledger */}
                            <div style={{
                                padding: '1.25rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem',
                                background: '#ffffff'
                            }}>
                                {/* Parent & Payment Details Cards */}
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
                                            <div style={{
                                                width: '32px', height: '32px', borderRadius: '8px', background: '#ede9fe',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                <Calendar size={18} color="#7c3aed" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', color: '#6d28d9', textTransform: 'uppercase', fontWeight: '800' }}>Target Fee Month</div>
                                                <div style={{ fontWeight: '800', color: '#4c1d95', fontSize: '0.95rem' }}>
                                                    {reviewingSub.month || 'Current Month'}
                                                </div>
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#6d28d9', background: '#ffffff', padding: '0.25rem 0.6rem', borderRadius: '6px', fontWeight: '700', border: '1px solid #ddd6fe' }}>
                                            Monthly Fee
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
                                        <div style={{ fontWeight: '800', fontFamily: 'monospace', color: '#4338ca', fontSize: '0.85rem' }}>
                                            {reviewingSub.transactionId || 'None entered'}
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
                                        <div style={{
                                            border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.85rem', background: '#faf5ff'
                                        }}>
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

                                {/* Mathematical Reconciliation Box */}
                                <div style={{
                                    padding: '0.85rem 1rem', borderRadius: '12px',
                                    background: '#ecfdf5', border: '1px solid #a7f3d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#065f46', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <CheckCircle2 size={16} color="#059669" />
                                            <span>Zero-Discrepancy Audit Match</span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#047857' }}>
                                            Verified against student dues & online slip submission
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.7rem', color: '#065f46', textTransform: 'uppercase', fontWeight: '600' }}>Total Paid on Slip</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#065f46' }}>
                                            Rs. {Number(reviewingSub.amount || 0).toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                 {/* Rejection Details Banner if already rejected */}
                                 {reviewingSub.status === 'rejected' && (
                                     <div style={{
                                         width: '100%', padding: '0.75rem 1rem', borderRadius: '10px',
                                         background: '#fef2f2', border: '1px solid #fecaca',
                                         display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                         gap: '0.75rem'
                                     }}>
                                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                             <XCircle size={18} color="#dc2626" />
                                             <div>
                                                 <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#991b1b' }}>Payment Submission is Rejected</div>
                                                 <div style={{ fontSize: '0.75rem', color: '#b91c1c' }}>{reviewingSub.rejectReason || 'Payment proof could not be verified by administration.'}</div>
                                             </div>
                                         </div>
                                         <button
                                             type="button"
                                             onClick={() => {
                                                 setRejectReason(reviewingSub.rejectReason || '');
                                                 setRejectingSub(reviewingSub);
                                             }}
                                             disabled={Boolean(processingId && processingId === reviewingSub.id)}
                                             style={{
                                                 padding: '0.45rem 0.85rem', borderRadius: '8px', border: '1px solid #f87171',
                                                 background: '#ffffff', color: '#b91c1c', fontWeight: '700', fontSize: '0.8rem',
                                                 cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem'
                                             }}
                                         >
                                             <X size={13} /> Update Rejection
                                         </button>
                                     </div>
                                 )}

                                 {/* Modal Actions */}
                                 <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                     <button
                                         type="button"
                                         onClick={() => setReviewingSub(null)}
                                         style={{
                                             padding: '0.55rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1',
                                             background: 'white', color: '#475569', fontWeight: '600', cursor: 'pointer'
                                         }}
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
                                                     display: 'flex', alignItems: 'center', gap: '0.35rem',
                                                     opacity: processingId === reviewingSub.id ? 0.6 : 1
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
                                                     display: 'flex', alignItems: 'center', gap: '0.35rem',
                                                     opacity: processingId === reviewingSub.id ? 0.6 : 1
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
                                                 Approve Payment
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
