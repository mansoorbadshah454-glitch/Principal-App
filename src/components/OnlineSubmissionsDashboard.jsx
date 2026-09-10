import React, { useState, useEffect } from 'react';
import { 
    Clock, CheckCircle2, XCircle, Search, Eye, Filter, Download, ExternalLink, 
    Smartphone, Landmark, AlertCircle, ArrowUpRight, Check, X, Loader2 
} from 'lucide-react';
import { db, storage } from '../firebase';
import { 
    collection, onSnapshot, query, doc, updateDoc, setDoc, orderBy, serverTimestamp 
} from 'firebase/firestore';

const OnlineSubmissionsDashboard = ({ schoolId, schoolInfo }) => {
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('pending'); // 'all', 'pending', 'approved', 'rejected'
    const [searchQuery, setSearchQuery] = useState('');
    
    // Modal states
    const [selectedProofUrl, setSelectedProofUrl] = useState(null);
    const [rejectingSub, setRejectingSub] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [processingId, setProcessingId] = useState(null);

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

    // Handle Approve
    const handleApprove = async (sub) => {
        if (!window.confirm(`Approve fee payment of Rs. ${Number(sub.amount || 0).toLocaleString()} for ${sub.studentName} (${sub.className})?`)) {
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
                timestamp: serverTimestamp(),
                dateString,
                timeString,
                collectedBy: 'Online Portal'
            };

            // 1. Update Student in Class Subcollection
            if (sub.classId && sub.studentId) {
                const classStudentRef = doc(db, `schools/${schoolId}/classes/${sub.classId}/students`, sub.studentId);
                await setDoc(classStudentRef, {
                    monthlyFeeStatus: 'paid',
                    monthlyFeeDate: nowIso,
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

            // 2. Update Master Student Collection
            if (sub.studentId) {
                try {
                    const masterStudentRef = doc(db, `schools/${schoolId}/students`, sub.studentId);
                    await setDoc(masterStudentRef, {
                        monthlyFeeStatus: 'paid',
                        monthlyFeeDate: nowIso,
                        lastPaymentMode: sub.paymentMethod || 'Online Transfer',
                        lastPaymentAmount: finalAmount,
                        lastReceiptNo: receiptNo,
                        lastPaymentProofUrl: sub.proofUrl || null,
                        pendingPaymentSubmission: {
                            status: 'approved',
                            approvedAt: nowIso
                        }
                    }, { merge: true });
                } catch (_) {}
            }

            // 3. Update Submission Document
            const subRef = doc(db, `schools/${schoolId}/paymentSubmissions`, sub.id);
            await updateDoc(subRef, {
                status: 'approved',
                approvedAt: nowIso,
                receiptNo
            });

            // 4. Create Transaction Record in feeTransactions (Essential for Today's Collections Log & Metrics)
            const txDocRef = doc(db, `schools/${schoolId}/feeTransactions`, receiptNo);
            await setDoc(txDocRef, {
                ...transactionRecord,
                id: receiptNo,
                timestamp: serverTimestamp()
            }, { merge: true });

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

            // 1. Update submission doc
            const subRef = doc(db, `schools/${schoolId}/paymentSubmissions`, rejectingSub.id);
            await updateDoc(subRef, {
                status: 'rejected',
                rejectedAt: nowIso,
                rejectReason: rejectReason.trim() || 'Payment proof could not be verified.'
            });

            // 2. Remove pending tag from student doc
            if (rejectingSub.classId && rejectingSub.studentId) {
                const classStudentRef = doc(db, `schools/${schoolId}/classes/${rejectingSub.classId}/students`, rejectingSub.studentId);
                await updateDoc(classStudentRef, {
                    pendingPaymentSubmission: null
                });
            }

            setRejectingSub(null);
            setRejectReason('');
        } catch (err) {
            console.error("Error rejecting submission:", err);
            alert("Failed to reject submission: " + err.message);
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
                                            {/* Student */}
                                            <td style={{ padding: '1rem 1.25rem' }}>
                                                <div style={{ fontWeight: '700', color: '#1e293b' }}>{sub.studentName}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                    {sub.className} • Roll: {sub.rollNo || 'N/A'}
                                                </div>
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
                                                        onClick={() => setSelectedProofUrl(sub.proofUrl)}
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
                                                {isPending ? (
                                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                        <button
                                                            onClick={() => handleApprove(sub)}
                                                            disabled={processingId === sub.id}
                                                            style={{
                                                                padding: '0.45rem 0.9rem', borderRadius: '8px', border: 'none',
                                                                background: '#16a34a', color: 'white', fontWeight: '700', fontSize: '0.8rem',
                                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                                                                boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)'
                                                            }}
                                                        >
                                                            <Check size={14} /> Approve
                                                        </button>
                                                        <button
                                                            onClick={() => setRejectingSub(sub)}
                                                            disabled={processingId === sub.id}
                                                            style={{
                                                                padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #fecaca',
                                                                background: '#fef2f2', color: '#dc2626', fontWeight: '600', fontSize: '0.8rem',
                                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem'
                                                            }}
                                                        >
                                                            <X size={14} /> Reject
                                                        </button>
                                                    </div>
                                                ) : isApproved ? (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#16a34a', fontWeight: '700', fontSize: '0.85rem' }}>
                                                        <CheckCircle2 size={16} /> Approved
                                                    </span>
                                                ) : (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#dc2626', fontWeight: '700', fontSize: '0.85rem' }}>
                                                        <XCircle size={16} /> Rejected
                                                    </span>
                                                )}
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
                    onClick={() => setSelectedProofUrl(null)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
                        padding: '2rem'
                    }}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'white', borderRadius: '16px', maxWidth: '650px', width: '100%',
                            overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', position: 'relative'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
                            <h4 style={{ margin: 0, fontWeight: '700', color: '#1e293b' }}>Payment Slip Receipt</h4>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <a 
                                    href={selectedProofUrl} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--primary)', fontSize: '0.85rem', fontWeight: '600', textDecoration: 'none', padding: '0.3rem 0.6rem', borderRadius: '6px', background: '#f1f5f9' }}
                                >
                                    <ExternalLink size={14} /> Open Full
                                </a>
                                <button 
                                    onClick={() => setSelectedProofUrl(null)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                        <div style={{ padding: '1rem', maxHeight: '75vh', overflowY: 'auto', display: 'flex', justifyContent: 'center', background: '#0f172a' }}>
                            <img 
                                src={selectedProofUrl} 
                                alt="Payment Proof Full" 
                                style={{ maxWidth: '100%', maxHeight: '68vh', objectFit: 'contain', borderRadius: '8px' }} 
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Reject Reason Modal */}
            {rejectingSub && (
                <div 
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
                        padding: '1rem'
                    }}
                >
                    <div style={{ background: 'white', borderRadius: '16px', maxWidth: '450px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#dc2626', marginBottom: '0.5rem' }}>Reject Payment Submission</h3>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
                            Rejecting payment for <strong>{rejectingSub.studentName}</strong> (Rs. {rejectingSub.amount}). Please state reason:
                        </p>
                        <textarea
                            rows={3}
                            placeholder="e.g. Transaction ID not found, Slip screenshot unreadable, Incorrect amount..."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            style={{
                                width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #cbd5e1',
                                fontSize: '0.85rem', outline: 'none', marginBottom: '1.25rem', fontFamily: 'inherit'
                            }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                onClick={() => setRejectingSub(null)}
                                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontWeight: '600', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmReject}
                                disabled={processingId === rejectingSub.id}
                                style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', background: '#dc2626', color: 'white', fontWeight: '700', cursor: 'pointer' }}
                            >
                                Confirm Reject
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OnlineSubmissionsDashboard;
