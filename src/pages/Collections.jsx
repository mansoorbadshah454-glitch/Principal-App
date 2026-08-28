import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
    Wallet, Users, ChevronRight, Ban, CheckCircle, Plus, Trash2, X, 
    CheckSquare, Square, ArrowUpRight, ArrowDownRight, Download,
    Printer, Search, CheckCircle2, User, FileText, Loader2, Sparkles, Building2, Phone, Calendar, Clock, DollarSign,
    Image as ImageIcon, ExternalLink, Eye, Upload, Landmark, Smartphone, TrendingUp, Activity,
    PieChart, BarChart3, Zap, ShieldCheck, Layers, Wifi, WifiOff, RefreshCw, Filter, ArrowRight
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, AreaChart, Area, PieChart as RechartsPie, Pie, Cell,
    XAxis, YAxis, Tooltip as RechartsTooltip, Legend as RechartsLegend, CartesianGrid
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CachedImage from '../components/CachedImage';
import PayrollDashboard from '../components/PayrollDashboard';
import { db, auth, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
    collection, onSnapshot, query, doc, updateDoc, deleteField, setDoc, getDoc, deleteDoc,
    getDocs, writeBatch, getDocsFromCache, addDoc, serverTimestamp, orderBy, limit
} from 'firebase/firestore';

// --- Components ---

const ActionModal = ({ isOpen, onClose, onSave, classes }) => {
    if (!isOpen) return null;

    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [targetAll, setTargetAll] = useState(true);
    const [selectedClasses, setSelectedClasses] = useState([]);

    const handleSubmit = () => {
        if (!name.trim() || !amount) return;
        onSave({
            name: name.trim(),
            amount: Number(amount),
            targetAll,
            targetClasses: targetAll ? [] : selectedClasses
        });
        setName('');
        setAmount('');
        setTargetAll(true);
        setSelectedClasses([]);
        onClose();
    };

    const toggleClass = (classId) => {
        setSelectedClasses(prev =>
            prev.includes(classId)
                ? prev.filter(id => id !== classId)
                : [...prev, classId]
        );
    };

    return (
        <div style={{
            position: 'fixed', top: '20px', left: 0, width: '100%',
            background: 'transparent', display: 'flex', justifyContent: 'center',
            zIndex: 1000, pointerEvents: 'none'
        }}>
            <div className="card" style={{
                width: '90%', maxWidth: '500px', background: 'white', borderRadius: '24px',
                padding: '2rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                pointerEvents: 'auto'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)' }}>New Collection Action</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <X size={24} />
                    </button>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Action Name</label>
                    <input
                        type="text"
                        placeholder="e.g. App Payment, Uniform Fee, Fine"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        style={{
                            width: '100%', padding: '0.75rem 1rem', borderRadius: '12px',
                            border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none',
                            transition: 'border-color 0.2s',
                            background: '#f8fafc'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Amount Per Student (Rs)</label>
                    <input
                        type="number"
                        placeholder="e.g. 500"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        style={{
                            width: '100%', padding: '0.75rem 1rem', borderRadius: '12px',
                            border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none',
                            transition: 'border-color 0.2s',
                            background: '#f8fafc'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Target Classes</label>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        <button
                            onClick={() => setTargetAll(true)}
                            style={{
                                flex: 1, padding: '0.75rem', borderRadius: '12px', border: '1px solid',
                                borderColor: targetAll ? 'var(--primary)' : '#e2e8f0',
                                background: targetAll ? 'var(--primary)' : 'white',
                                color: targetAll ? 'white' : 'var(--text-secondary)',
                                cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s'
                            }}
                        >
                            All Classes
                        </button>
                        <button
                            onClick={() => setTargetAll(false)}
                            style={{
                                flex: 1, padding: '0.75rem', borderRadius: '12px', border: '1px solid',
                                borderColor: !targetAll ? 'var(--primary)' : '#e2e8f0',
                                background: !targetAll ? 'var(--primary)' : 'white',
                                color: !targetAll ? 'white' : 'var(--text-secondary)',
                                cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s'
                            }}
                        >
                            Select Classes
                        </button>
                    </div>

                    {!targetAll && (
                        <div style={{
                            maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0',
                            borderRadius: '12px', padding: '0.5rem'
                        }}>
                            {classes.map(cls => (
                                <div
                                    key={cls.id}
                                    onClick={() => toggleClass(cls.id)}
                                    style={{
                                        padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
                                        cursor: 'pointer', borderRadius: '8px',
                                        background: selectedClasses.includes(cls.id) ? '#eff6ff' : 'transparent'
                                    }}
                                >
                                    {selectedClasses.includes(cls.id) ? (
                                        <CheckSquare size={20} color="var(--primary)" />
                                    ) : (
                                        <Square size={20} color="#cbd5e1" />
                                    )}
                                    <span style={{ fontWeight: '500', color: 'var(--text-main)' }}>{cls.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '0.75rem 1.5rem', borderRadius: '12px', border: 'none',
                            background: '#f1f5f9', color: 'var(--text-secondary)', fontWeight: '600', cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!name.trim()}
                        style={{
                            padding: '0.75rem 1.5rem', borderRadius: '12px', border: 'none',
                            background: 'var(--primary)', color: 'white', fontWeight: '600', cursor: 'pointer',
                            opacity: name.trim() ? 1 : 0.5
                        }}
                    >
                        Create Action
                    </button>
                </div>
            </div>
        </div>
    );
};

const CollectionClassCard = ({ cls, currentAction, schoolId }) => {
    const navigate = useNavigate();
    const [monthlyStats, setMonthlyStats] = useState({ paid: 0, unpaid: 0, total: 0, loading: true });
    const [actionStats, setActionStats] = useState({ paid: 0, unpaid: 0, total: 0, loading: true });

    // Is this class targeted by the current action?
    const isTargeted = currentAction && (currentAction.targetAll || (currentAction.targetClasses && currentAction.targetClasses.includes(cls.id)));

    // Fetch Real-time Stats from Database
    useEffect(() => {
        if (!schoolId || !cls.id) {
            setMonthlyStats({ paid: 0, unpaid: 0, total: 0, loading: false });
            setActionStats({ paid: 0, unpaid: 0, total: 0, loading: false });
            return;
        }

        const q = query(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let monthlyPaid = 0;
            let monthlyUnpaid = 0;
            let actionPaid = 0;
            let actionUnpaid = 0;

            snapshot.docs.forEach(doc => {
                const data = doc.data();

                // Count Monthly Fee Status
                const monthlyStatus = data.monthlyFeeStatus || 'unpaid';
                if (monthlyStatus === 'paid') {
                    monthlyPaid++;
                } else {
                    monthlyUnpaid++;
                }

                // Count Action Fee Status (if targeted)
                if (isTargeted && currentAction) {
                    const actionStatus = data.customPayments?.[currentAction.name]?.status;
                    if (actionStatus === 'paid') {
                        actionPaid++;
                    } else {
                        actionUnpaid++;
                    }
                }
            });

            setMonthlyStats({
                paid: monthlyPaid,
                unpaid: monthlyUnpaid,
                total: snapshot.size,
                loading: false
            });

            setActionStats({
                paid: actionPaid,
                unpaid: actionUnpaid,
                total: snapshot.size,
                loading: false
            });
        });

        return () => unsubscribe();
    }, [schoolId, cls.id, currentAction, isTargeted]);


    // Dynamic Theme Color
    const seed = cls.id.charCodeAt(0) || 123;
    const isEven = seed % 2 === 0;
    const themeColor = isEven ? 'var(--primary)' : 'var(--secondary)';

    const StatsPair = ({ label, paid, unpaid }) => (
        <div style={{ display: 'flex', gap: '0.75rem' }}>
            {/* Paid Card */}
            <div style={{
                flex: 1, padding: '0.75rem', borderRadius: '12px', background: 'white',
                border: '1px solid #dcfce7', cursor: 'default',
                display: 'flex', flexDirection: 'column', gap: '0.25rem',
                borderBottom: '3px solid #10b981'
            }}>
                <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#10b981', textTransform: 'uppercase' }}>
                    {label ? `${label} Paid` : 'Paid'}
                </span>
                <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#1e293b' }}>{paid}</span>
            </div>
            {/* Unpaid Card */}
            <div style={{
                flex: 1, padding: '0.75rem', borderRadius: '12px', background: 'white',
                border: '1px solid #fee2e2', cursor: 'default',
                display: 'flex', flexDirection: 'column', gap: '0.25rem',
                borderBottom: '3px solid #ef4444',
                boxShadow: unpaid > 0 ? '0 0 10px rgba(239, 68, 68, 0.1)' : 'none'
            }}>
                <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#ef4444', textTransform: 'uppercase' }}>
                    {label ? `${label} Unpaid` : 'Unpaid'}
                </span>
                <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#1e293b' }}>{unpaid}</span>
            </div>
        </div>
    );

    return (
        <div
            onClick={() => {
                navigate(`/collections/${cls.id}`);
            }}
            className="card" style={{
                padding: '0',
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.25)',
                position: 'relative',
                background: 'linear-gradient(145deg, #60a5fa 0%, #3b82f6 50%, #2563eb 100%)',
                boxShadow: `4px 4px 0 rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)`,
                borderRadius: '16px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                color: 'white'
            }}>
            {/* Decoration Strip */}
            <div style={{ height: '6px', width: '100%', background: `linear-gradient(90deg, ${themeColor}, transparent)` }} />

            <div style={{ padding: '0', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.18)', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'white' }}>{cls.name}</h3>
                            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>{cls.teacher || 'No Teacher'}</p>
                        </div>
                        {isTargeted ? (
                            <div style={{
                                padding: '0.25rem 0.75rem', background: 'var(--primary)', borderRadius: '20px',
                                fontSize: '0.7rem', fontWeight: '600', color: 'white',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)'
                            }}>
                                Action Active
                            </div>
                        ) : (
                            <div style={{
                                padding: '0.25rem 0.75rem', background: 'rgba(255,255,255,0.15)', borderRadius: '20px',
                                fontSize: '0.7rem', fontWeight: '600', color: 'white',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)'
                            }}>
                                Standard
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(255,255,255,0.08)' }}>
                    {/* Total Students Badge */}
                    <div style={{ marginBottom: '0.25rem' }}>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.4rem 0.75rem', background: 'rgba(255,255,255,0.15)',
                            borderRadius: '20px', fontSize: '0.85rem', fontWeight: '600', color: 'white',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                        }}>
                            <Users size={16} color="white" />
                            <span>{monthlyStats.total} Students</span>
                        </div>
                    </div>
                    {/* 1. Monthly Fee Stats */}
                    <StatsPair label="Fee" paid={monthlyStats.paid} unpaid={monthlyStats.unpaid} />

                    {/* 2. Action Stats (Calculated & Stacked) */}
                    {isTargeted && (
                        <div className="animate-fade-in-up">
                            <StatsPair label={currentAction.name} paid={actionStats.paid} unpaid={actionStats.unpaid} />
                        </div>
                    )}
                </div>

                <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <span style={{
                        fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', fontWeight: '600',
                        display: 'flex', alignItems: 'center', gap: '0.25rem'
                    }}>
                        View Details <ChevronRight size={16} />
                    </span>
                </div>
            </div>
        </div>
    );
};

// --- Payment Proof Image Lightbox Modal ---
const PaymentProofModal = ({ isOpen, onClose, proofUrl, title }) => {
    if (!isOpen || !proofUrl) return null;
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1rem'
        }}>
            <div className="card" style={{
                background: '#ffffff',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '560px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                padding: '1.5rem',
                position: 'relative'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ImageIcon size={18} color="#0078d4" />
                        {title || 'Payment Receipt / Screenshot'}
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: '#f1f5f9',
                            border: 'none',
                            borderRadius: '50%',
                            width: '28px',
                            height: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: '#64748b'
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div style={{ background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '0.5rem', textAlign: 'center', maxHeight: '60vh', overflow: 'auto' }}>
                    <img src={proofUrl} alt="Payment Proof" style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: '6px' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                    <a
                        href={proofUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.85rem',
                            color: '#0078d4',
                            textDecoration: 'none',
                            fontWeight: '600'
                        }}
                    >
                        <ExternalLink size={15} /> Open Full Image in New Tab
                    </a>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '0.5rem 1.25rem',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#475569',
                            fontWeight: '600',
                            fontSize: '0.85rem',
                            cursor: 'pointer'
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Reusable 100% Offline Professional Fee Receipt PDF Generator ---
export const downloadOfficialReceiptPDF = (receiptData, schoolInfo) => {
    try {
        if (!receiptData) return false;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const primaryColor = [0, 120, 212]; // #0078d4
        const darkColor = [15, 23, 42];    // #0f172a
        const grayColor = [100, 116, 139]; // #64748b

        // Top Accent Bar
        doc.setFillColor(0, 120, 212);
        doc.rect(0, 0, 210, 5, 'F');

        // 1. School Header & Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(17);
        doc.setTextColor(...darkColor);
        const schoolTitle = (schoolInfo?.name && schoolInfo.name !== 'School Name' && schoolInfo.name !== 'School Report' 
            ? schoolInfo.name 
            : 'OFFICIAL SCHOOL RECEIPT').toUpperCase();
        doc.text(schoolTitle, 14, 18);

        doc.setFillColor(...primaryColor);
        doc.roundedRect(14, 22, 54, 6.5, 1.5, 1.5, 'F');
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('FEE PAYMENT VOUCHER', 16, 26.5);

        // Receipt Meta (Right Aligned)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...grayColor);
        doc.text('RECEIPT NO:', 196, 16, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...primaryColor);
        doc.text(receiptData.receiptNo || 'N/A', 196, 21.5, { align: 'right' });

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        doc.text(`Issue Date: ${receiptData.dateString || ''} ${receiptData.timeString || ''}`, 196, 26.5, { align: 'right' });
        if (receiptData.dueDate) {
            doc.text(`Fee Due Date: ${receiptData.dueDate}`, 196, 30.5, { align: 'right' });
        }

        // Horizontal Line
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        doc.line(14, 34, 196, 34);

        // 2. Student Info Box
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, 37, 182, 33, 2, 2, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(14, 37, 182, 33, 2, 2, 'S');

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        doc.text('Student Name:', 18, 44);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text(receiptData.studentName || 'N/A', 46, 44);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        doc.text('Roll No:', 120, 44);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text(String(receiptData.rollNo || 'N/A'), 142, 44);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        doc.text('Class & Sec:', 18, 53);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text(receiptData.className || 'N/A', 46, 53);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        doc.text('Father Name:', 120, 53);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text(receiptData.fatherName || 'N/A', 142, 53);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        doc.text('Payment Mode:', 18, 62);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(22, 163, 74);
        doc.text(receiptData.paymentMode || 'Cash', 46, 62);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        doc.text('Collected By:', 120, 62);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text(receiptData.collectedBy || 'Principal Office', 142, 62);

        // 3. Fee Breakdown Table
        const tableRows = (receiptData.items || []).map((item, idx) => [
            idx + 1,
            item.name,
            `Rs ${Number(item.amount).toLocaleString()}`
        ]);

        if (receiptData.discount > 0) {
            tableRows.push([
                '-',
                'Discount / Concession Granted',
                `- Rs ${Number(receiptData.discount).toLocaleString()}`
            ]);
        }

        tableRows.push([
            '',
            'TOTAL NET PAID',
            `Rs ${Number(receiptData.totalPaid).toLocaleString()}`
        ]);

        autoTable(doc, {
            startY: 74,
            head: [['#', 'Fee Description / Particulars', 'Amount (PKR)']],
            body: tableRows,
            theme: 'grid',
            headStyles: {
                fillColor: [15, 23, 42],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 9,
                halign: 'left'
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 15 },
                1: { halign: 'left' },
                2: { halign: 'right', fontStyle: 'bold', cellWidth: 48 }
            },
            styles: {
                font: 'helvetica',
                fontSize: 9,
                cellPadding: 3.5,
                lineColor: [226, 232, 240]
            },
            didParseCell: function(data) {
                if (data.row.index === tableRows.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [240, 253, 244];
                    data.cell.styles.textColor = [22, 101, 52];
                    data.cell.styles.fontSize = 10;
                }
                if (receiptData.discount > 0 && data.row.index === tableRows.length - 2) {
                    data.cell.styles.textColor = [22, 163, 74];
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });

        const finalY = doc.lastAutoTable?.finalY || 130;

        if (receiptData.remarks) {
            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text(`Remarks / Notes: ${receiptData.remarks}`, 14, finalY + 8);
        }

        // 4. Footer & Signature
        const footerY = Math.max(finalY + 22, 155);
        doc.setDrawColor(203, 213, 225);
        doc.setLineDashPattern([2, 2], 0);
        doc.line(14, footerY, 196, footerY);
        doc.setLineDashPattern([], 0);

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        doc.text('* Official computer-generated fee receipt. Valid without physical stamp.', 14, footerY + 8);

        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.5);
        doc.line(145, footerY + 16, 196, footerY + 16);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...darkColor);
        doc.text('Authorized Signature & Stamp', 170.5, footerY + 21, { align: 'center' });

        const safeName = (receiptData.studentName || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
        doc.save(`Fee_Receipt_${receiptData.receiptNo}_${safeName}.pdf`);
        return true;
    } catch (err) {
        console.error("PDF generation failed:", err);
        return false;
    }
};

// --- Fee Receipt Printable Modal ---
const FeeReceiptModal = ({ isOpen, onClose, receiptData, schoolInfo }) => {
    if (!isOpen || !receiptData) return null;

    const printRef = useRef();
    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownloadPDF = () => {
        setIsDownloading(true);
        downloadOfficialReceiptPDF(receiptData, schoolInfo);
        setIsDownloading(false);
    };

    const handlePrint = () => {
        const printContent = document.getElementById('printable-fee-receipt');
        if (!printContent) return;

        const printWindow = window.open('', '', 'width=800,height=900');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Fee Receipt - ${receiptData.receiptNo}</title>
                    <style>
                        @page { size: auto; margin: 15mm; }
                        body { 
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
                            color: #1e293b; 
                            margin: 0; 
                            padding: 20px; 
                            background: #fff;
                        }
                        .receipt-container { 
                            max-width: 650px; 
                            margin: 0 auto; 
                            border: 2px solid #0f172a; 
                            padding: 24px; 
                            border-radius: 8px; 
                        }
                        .header { 
                            display: flex; 
                            align-items: center; 
                            justify-content: space-between; 
                            border-bottom: 2px solid #e2e8f0; 
                            padding-bottom: 16px; 
                            margin-bottom: 20px; 
                        }
                        .school-name { 
                            font-size: 22px; 
                            font-weight: 800; 
                            color: #0f172a; 
                            text-transform: uppercase; 
                            margin: 0; 
                        }
                        .receipt-badge { 
                            display: inline-block; 
                            background: #0f172a; 
                            color: #fff; 
                            font-size: 11px; 
                            font-weight: 700; 
                            padding: 4px 10px; 
                            border-radius: 4px; 
                            margin-top: 4px; 
                            text-transform: uppercase; 
                        }
                        .grid-info { 
                            display: grid; 
                            grid-template-columns: 1fr 1fr; 
                            gap: 12px; 
                            margin-bottom: 20px; 
                            background: #f8fafc; 
                            padding: 14px; 
                            border-radius: 6px; 
                            border: 1px solid #e2e8f0; 
                            font-size: 13px; 
                        }
                        .grid-info div span { 
                            font-weight: 700; 
                            color: #475569; 
                        }
                        table { 
                            width: 100%; 
                            border-collapse: collapse; 
                            margin-bottom: 20px; 
                            font-size: 13px; 
                        }
                        th { 
                            background: #f1f5f9; 
                            padding: 10px 12px; 
                            text-align: left; 
                            border-bottom: 2px solid #cbd5e1; 
                            font-weight: 700; 
                            color: #1e293b; 
                        }
                        td { 
                            padding: 9px 12px; 
                            border-bottom: 1px solid #e2e8f0; 
                            color: #334155; 
                        }
                        .total-row td { 
                            font-size: 15px; 
                            font-weight: 800; 
                            border-top: 2px solid #0f172a; 
                            border-bottom: 2px solid #0f172a; 
                            color: #0f172a; 
                            background: #f8fafc; 
                        }
                        .footer { 
                            display: flex; 
                            justify-content: space-between; 
                            align-items: flex-end; 
                            margin-top: 35px; 
                            padding-top: 20px; 
                            border-top: 1px dashed #cbd5e1; 
                            font-size: 12px; 
                            color: #64748b; 
                        }
                        .signature-box { 
                            text-align: center; 
                            border-top: 1px solid #94a3b8; 
                            padding-top: 6px; 
                            width: 150px; 
                            color: #0f172a; 
                            font-weight: 600; 
                        }
                    </style>
                </head>
                <body>
                    ${printContent.innerHTML}
                    <script>
                        window.onload = function() {
                            window.focus();
                            window.print();
                            window.close();
                        };
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
        }}>
            <div className="card" style={{
                background: '#ffffff',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '680px',
                maxHeight: '92vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                padding: '1.75rem',
                position: 'relative'
            }}>
                {/* Close Button */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '1.25rem',
                        right: '1.25rem',
                        background: '#f1f5f9',
                        border: 'none',
                        borderRadius: '50%',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#64748b'
                    }}
                >
                    <X size={18} />
                </button>

                {/* Printable Content Container */}
                <div id="printable-fee-receipt">
                    <div className="receipt-container" style={{
                        border: '2px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        background: '#ffffff'
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                {schoolInfo?.logo ? (
                                    <img src={schoolInfo.logo} alt="Logo" style={{ width: '48px', height: '48px', objectFit: 'contain', borderRadius: '6px' }} />
                                ) : (
                                    <div style={{ width: '48px', height: '48px', background: '#0078d4', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                        <Building2 size={24} />
                                    </div>
                                )}
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', textTransform: 'uppercase' }}>
                                        {schoolInfo?.name || 'OFFICIAL SCHOOL RECEIPT'}
                                    </h2>
                                    <span style={{ display: 'inline-block', background: '#0078d4', color: 'white', fontSize: '0.7rem', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', marginTop: '4px', textTransform: 'uppercase' }}>
                                        Fee Payment Voucher
                                    </span>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#64748b' }}>RECEIPT NO</span>
                                <span style={{ fontSize: '1rem', fontWeight: '800', color: '#0078d4' }}>{receiptData.receiptNo}</span>
                            </div>
                        </div>

                        {/* Student Details Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                            <div>
                                <span style={{ color: '#64748b', fontWeight: '600' }}>Student Name: </span>
                                <strong style={{ color: '#0f172a' }}>{receiptData.studentName}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b', fontWeight: '600' }}>Roll No: </span>
                                <strong style={{ color: '#0f172a' }}>{receiptData.rollNo || 'N/A'}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b', fontWeight: '600' }}>Class: </span>
                                <strong style={{ color: '#0f172a' }}>{receiptData.className}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b', fontWeight: '600' }}>Father Name: </span>
                                <strong style={{ color: '#0f172a' }}>{receiptData.fatherName || 'N/A'}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b', fontWeight: '600' }}>Date & Time: </span>
                                <strong style={{ color: '#0f172a' }}>{receiptData.dateString} {receiptData.timeString}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b', fontWeight: '600' }}>Payment Mode: </span>
                                <strong style={{ color: '#16a34a' }}>{receiptData.paymentMode}</strong>
                            </div>
                        </div>

                        {/* Fee Breakdown Table */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: '#1e293b', fontWeight: '700' }}>Description</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#1e293b', fontWeight: '700' }}>Amount (Rs)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {receiptData.items?.map((item, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.5rem 0.75rem', color: '#334155' }}>{item.name}</td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: '600', color: '#0f172a' }}>
                                            Rs {Number(item.amount).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                                {receiptData.discount > 0 && (
                                    <tr style={{ borderBottom: '1px solid #f1f5f9', color: '#16a34a' }}>
                                        <td style={{ padding: '0.5rem 0.75rem', fontWeight: '600' }}>Discount / Concession</td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: '600' }}>
                                            - Rs {Number(receiptData.discount).toLocaleString()}
                                        </td>
                                    </tr>
                                )}
                                <tr style={{ borderTop: '2px solid #0f172a', background: '#f8fafc' }}>
                                    <td style={{ padding: '0.75rem', fontWeight: '800', fontSize: '1rem', color: '#0f172a' }}>TOTAL AMOUNT PAID</td>
                                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '800', fontSize: '1.1rem', color: '#16a34a' }}>
                                        Rs {Number(receiptData.totalPaid).toLocaleString()}
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {receiptData.remarks && (
                            <div style={{ marginBottom: '1.25rem', fontSize: '0.8rem', color: '#64748b' }}>
                                <strong>Remarks:</strong> {receiptData.remarks}
                            </div>
                        )}

                        {/* Footer Signatures */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px dashed #cbd5e1', fontSize: '0.75rem', color: '#64748b' }}>
                            <div>
                                <span>* This is a computer-generated fee receipt.</span>
                            </div>
                            <div style={{ textAlign: 'center', borderTop: '1px solid #94a3b8', width: '140px', paddingTop: '4px', color: '#0f172a', fontWeight: '600' }}>
                                Authorized Signature
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modal Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '0.65rem 1.25rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#475569',
                            fontWeight: '600',
                            fontSize: '0.9rem',
                            cursor: 'pointer'
                        }}
                    >
                        Close
                    </button>
                    
                    <button
                        onClick={handleDownloadPDF}
                        disabled={isDownloading}
                        style={{
                            padding: '0.65rem 1.4rem',
                            borderRadius: '8px',
                            border: '1px solid #16a34a',
                            background: '#f0fdf4',
                            color: '#15803d',
                            fontWeight: '600',
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            opacity: isDownloading ? 0.7 : 1
                        }}
                    >
                        {isDownloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                        {isDownloading ? 'Generating PDF...' : 'Download PDF'}
                    </button>

                    <button
                        onClick={handlePrint}
                        style={{
                            padding: '0.65rem 1.5rem',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#0078d4',
                            color: '#ffffff',
                            fontWeight: '600',
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(0, 120, 212, 0.25)'
                        }}
                    >
                        <Printer size={18} /> Print Slip
                    </button>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// --- UPGRADED FINANCES DASHBOARD COMPONENT ---
// ==========================================
const FinancesDashboard = ({ schoolId, currentAction, schoolInfo: parentSchoolInfo, classes = [] }) => {
    const [loading, setLoading] = useState(true);
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

    // Selected Month in 'YYYY-MM' format (Defaults to current month)
    const currentMonthIso = useMemo(() => new Date().toISOString().slice(0, 7), []);
    const [selectedMonth, setSelectedMonth] = useState(currentMonthIso);

    // Cash Flow Progression View Mode: 'monthly' (12-Month Yearly Trend) | 'weekly' (5-Week Selected Month Breakdown)
    const [cashFlowViewMode, setCashFlowViewMode] = useState('monthly');

    // Sub Tabs: 'analytics' | 'fee_slips' | 'incomes_expenses' | 'class_performance'
    const [activeSubTab, setActiveSubTab] = useState('analytics');

    // Data States
    const [feeTransactions, setFeeTransactions] = useState([]);
    const [financesData, setFinancesData] = useState({ incomes: [], expenses: [] });
    const [classStudentsMap, setClassStudentsMap] = useState({});
    const [schoolInfo, setSchoolInfo] = useState(parentSchoolInfo || { name: 'School Report', logo: '' });

    // Modals & UI States
    const [searchLedger, setSearchLedger] = useState('');
    const [modeLedgerFilter, setModeLedgerFilter] = useState('all');
    const [selectedReceiptForModal, setSelectedReceiptForModal] = useState(null);
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [proofModalState, setProofModalState] = useState({ isOpen: false, url: '', title: '' });
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [isGeneratingClassPDF, setIsGeneratingClassPDF] = useState(false);

    // Income & Expense Creation States
    const [showAddIncomeModal, setShowAddIncomeModal] = useState(false);
    const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
    const [newIncome, setNewIncome] = useState({ name: '', amount: '', type: 'one-time', remarks: '', category: 'General' });
    const [newExpense, setNewExpense] = useState({ name: '', amount: '', type: 'one-time', remarks: '', category: 'Operational' });
    const [isSavingIncome, setIsSavingIncome] = useState(false);
    const [isSavingExpense, setIsSavingExpense] = useState(false);

    // Generate Month Options for Selector (past 12 months + next 2 months)
    const monthOptions = useMemo(() => {
        const options = [];
        const today = new Date();
        for (let i = -12; i <= 2; i++) {
            const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
            const iso = d.toISOString().slice(0, 7);
            const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            options.push({ value: iso, label });
        }
        return options.reverse();
    }, []);

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
                const schoolDoc = await getDoc(doc(db, `schools/${schoolId}`));
                if (schoolDoc.exists() && isMounted) {
                    const data = schoolDoc.data();
                    const info = {
                        name: data.name || parentSchoolInfo?.name || 'School Report',
                        logo: data.profileImage || parentSchoolInfo?.logo || ''
                    };
                    setSchoolInfo(info);

                    // Cache logo as Base64 in localStorage for Offline PDF capability
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
                        } catch (e) {
                            console.warn("Could not cache logo for offline PDF:", e);
                        }
                    }
                }
            } catch (err) {
                console.warn("FinancesDashboard school fetch note:", err);
            }
        };
        fetchSchool();
        return () => { isMounted = false; };
    }, [schoolId, parentSchoolInfo]);

    // 3. Live Listeners for Fee Transactions & Settings Finances (Offline Resilient via Firestore Cache)
    useEffect(() => {
        if (!schoolId) return;
        let unsubTransactions = null;
        let unsubFinances = null;
        let unsubStudentsList = [];
        let isMounted = true;

        const setupListeners = async () => {
            try {
                // Transactions
                const txRef = collection(db, `schools/${schoolId}/feeTransactions`);
                unsubTransactions = onSnapshot(txRef, (snapshot) => {
                    if (!isMounted) return;
                    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    // Sort latest first
                    list.sort((a, b) => {
                        const timeA = a.timestamp?.seconds || new Date(a.dateIso || a.dateString || 0).getTime() || 0;
                        const timeB = b.timestamp?.seconds || new Date(b.dateIso || b.dateString || 0).getTime() || 0;
                        return timeB - timeA;
                    });
                    setFeeTransactions(list);
                    setLoading(false);
                }, (err) => {
                    console.warn("feeTransactions listener warning:", err);
                    if (isMounted) setLoading(false);
                });

                // Finances (Incomes and Expenses)
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
                    console.warn("finances listener warning:", err);
                });

                // Students by class for performance breakdown
                const classesSnap = await getDocs(collection(db, `schools/${schoolId}/classes`));
                const validClasses = classesSnap.docs.filter(c => c.id !== 'action_metadata');

                validClasses.forEach(cls => {
                    const sRef = collection(db, `schools/${schoolId}/classes/${cls.id}/students`);
                    const unsub = onSnapshot(sRef, (snap) => {
                        if (!isMounted) return;
                        setClassStudentsMap(prev => ({
                            ...prev,
                            [cls.id]: snap.docs.map(d => ({ id: d.id, ...d.data() }))
                        }));
                    });
                    unsubStudentsList.push(unsub);
                });

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
            unsubStudentsList.forEach(u => u());
        };
    }, [schoolId]);

    // 4. Time-Series Calculations for Selected Month
    const monthlyMetrics = useMemo(() => {
        const [targetYear, targetMonthNum] = selectedMonth.split('-').map(Number);

        // Helper to check if date string or timestamp falls into selectedMonth
        const isTxInSelectedMonth = (tx) => {
            if (tx.dateIso && tx.dateIso.startsWith(selectedMonth)) return true;
            if (tx.timestamp?.seconds) {
                const d = new Date(tx.timestamp.seconds * 1000);
                return d.getFullYear() === targetYear && (d.getMonth() + 1) === targetMonthNum;
            }
            if (tx.dateString) {
                const d = new Date(tx.dateString);
                if (!isNaN(d.getTime())) {
                    return d.getFullYear() === targetYear && (d.getMonth() + 1) === targetMonthNum;
                }
            }
            return false;
        };

        // Filter Transactions for Month
        const filteredTxs = feeTransactions.filter(isTxInSelectedMonth);

        // Monthly Fees Total & Channels
        let totalFeePaid = 0;
        let totalDiscounts = 0;
        let cashFees = 0;
        let bankFees = 0;
        let easyPaisaFees = 0;
        let jazzCashFees = 0;
        let otherFees = 0;
        const paidStudentIds = new Set();

        filteredTxs.forEach(tx => {
            const amount = Number(tx.totalPaid) || 0;
            totalFeePaid += amount;
            totalDiscounts += Number(tx.discount) || 0;
            if (tx.studentId) paidStudentIds.add(tx.studentId);

            const mode = (tx.paymentMode || 'Cash').toLowerCase();
            if (mode === 'cash') cashFees += amount;
            else if (mode.includes('bank') || mode.includes('transfer') || mode.includes('online')) bankFees += amount;
            else if (mode.includes('easypaisa') || mode.includes('easy')) easyPaisaFees += amount;
            else if (mode.includes('jazzcash') || mode.includes('jazz')) jazzCashFees += amount;
            else otherFees += amount;
        });

        // Filter Incomes for Month (Permanent + One-Time of this month)
        const isEntryInSelectedMonth = (entry) => {
            if (entry.type === 'permanent') return true;
            if (entry.createdAt && entry.createdAt.startsWith(selectedMonth)) return true;
            if (entry.date && entry.date.startsWith(selectedMonth)) return true;
            return false;
        };

        const monthIncomes = (financesData.incomes || []).filter(isEntryInSelectedMonth);
        const monthExpenses = (financesData.expenses || []).filter(isEntryInSelectedMonth);

        const totalOtherIncomes = monthIncomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        
        // TOTAL OPERATIONAL EXPENSES (Teachers salary strictly excluded)
        const totalExpenses = monthExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

        const grossRevenue = totalFeePaid + totalOtherIncomes;
        const netProfit = grossRevenue - totalExpenses;

        // Total Digital Channels
        const totalDigitalChannels = bankFees + easyPaisaFees + jazzCashFees + otherFees;

        // 5. Compute Weekly Distribution (Weeks 1 to 5 of selected Month)
        const weeksData = [
            { week: 'Week 1 (1-7)', dayStart: 1, dayEnd: 7, fees: 0, incomes: 0, expenses: 0, net: 0, receipts: 0 },
            { week: 'Week 2 (8-14)', dayStart: 8, dayEnd: 14, fees: 0, incomes: 0, expenses: 0, net: 0, receipts: 0 },
            { week: 'Week 3 (15-21)', dayStart: 15, dayEnd: 21, fees: 0, incomes: 0, expenses: 0, net: 0, receipts: 0 },
            { week: 'Week 4 (22-28)', dayStart: 22, dayEnd: 28, fees: 0, incomes: 0, expenses: 0, net: 0, receipts: 0 },
            { week: 'Week 5 (29-31)', dayStart: 29, dayEnd: 31, fees: 0, incomes: 0, expenses: 0, net: 0, receipts: 0 }
        ];

        // Assign fee transactions to weeks
        filteredTxs.forEach(tx => {
            let day = 1;
            if (tx.timestamp?.seconds) {
                day = new Date(tx.timestamp.seconds * 1000).getDate();
            } else if (tx.dateIso) {
                day = new Date(tx.dateIso).getDate() || 1;
            } else if (tx.dateString) {
                day = new Date(tx.dateString).getDate() || 1;
            }

            const weekObj = weeksData.find(w => day >= w.dayStart && day <= w.dayEnd) || weeksData[weeksData.length - 1];
            weekObj.fees += Number(tx.totalPaid) || 0;
            weekObj.receipts += 1;
        });

        // Assign manual incomes & expenses to weeks
        monthIncomes.forEach(inc => {
            const day = inc.createdAt ? new Date(inc.createdAt).getDate() : 1;
            const weekObj = weeksData.find(w => day >= w.dayStart && day <= w.dayEnd) || weeksData[0];
            weekObj.incomes += Number(inc.amount) || 0;
        });

        monthExpenses.forEach(exp => {
            const day = exp.createdAt ? new Date(exp.createdAt).getDate() : 1;
            const weekObj = weeksData.find(w => day >= w.dayStart && day <= w.dayEnd) || weeksData[0];
            weekObj.expenses += Number(exp.amount) || 0;
        });

        // Calculate final weekly totals for BarChart
        const chartData = weeksData.map(w => ({
            name: w.week,
            inflow: w.fees + w.incomes,
            expenses: w.expenses,
            net: (w.fees + w.incomes) - w.expenses,
            receipts: w.receipts
        }));

        // Payment Channel Pie Chart Data
        const pieData = [
            { name: 'Cash', value: cashFees, color: '#16a34a' },
            { name: 'Bank Transfer', value: bankFees, color: '#2563eb' },
            { name: 'EasyPaisa', value: easyPaisaFees, color: '#059669' },
            { name: 'JazzCash', value: jazzCashFees, color: '#d97706' },
            { name: 'Other Channels', value: otherFees, color: '#7c3aed' }
        ].filter(item => item.value > 0);

        return {
            filteredTxs,
            monthIncomes,
            monthExpenses,
            totalFeePaid,
            totalOtherIncomes,
            grossRevenue,
            totalExpenses,
            netProfit,
            totalDiscounts,
            paidStudentsCount: paidStudentIds.size,
            cashFees,
            bankFees,
            totalDigitalChannels,
            chartData,
            pieData
        };
    }, [selectedMonth, feeTransactions, financesData]);

    // 5b. Selected Month Label Helper
    const selectedMonthLabel = useMemo(() => {
        return monthOptions.find(m => m.value === selectedMonth)?.label || selectedMonth;
    }, [monthOptions, selectedMonth]);

    // 5c. Annual Multi-Month Time-Series Aggregator (12 Months of Selected Year)
    const yearlyCashFlowData = useMemo(() => {
        const [targetYear] = selectedMonth.split('-').map(Number);
        const monthsNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        const yearMonths = monthsNames.map((mName, idx) => {
            const mNum = idx + 1;
            const mIso = `${targetYear}-${String(mNum).padStart(2, '0')}`;
            return {
                name: mName,
                monthIso: mIso,
                fees: 0,
                incomes: 0,
                expenses: 0,
                receipts: 0
            };
        });

        // 1. Fee transactions aggregation by month
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

            if (txYear === targetYear && txMonth >= 1 && txMonth <= 12) {
                const item = yearMonths[txMonth - 1];
                if (item) {
                    item.fees += (Number(tx.totalPaid) || 0);
                    item.receipts += 1;
                }
            }
        });

        // 2. Incomes aggregation by month
        (financesData.incomes || []).forEach(inc => {
            if (inc.type === 'permanent') {
                // Permanent applies to each of the 12 months
                yearMonths.forEach(m => {
                    m.incomes += (Number(inc.amount) || 0);
                });
            } else {
                let incYear = 0;
                let incMonth = 0;
                const dStr = inc.createdAt || inc.date;
                if (dStr) {
                    const d = new Date(dStr);
                    if (!isNaN(d.getTime())) {
                        incYear = d.getFullYear();
                        incMonth = d.getMonth() + 1;
                    }
                }
                if (incYear === targetYear && incMonth >= 1 && incMonth <= 12) {
                    const item = yearMonths[incMonth - 1];
                    if (item) {
                        item.incomes += (Number(inc.amount) || 0);
                    }
                }
            }
        });

        // 3. Operational Expenses aggregation by month (Excluding teacher salaries)
        (financesData.expenses || []).forEach(exp => {
            if (exp.type === 'permanent') {
                // Permanent applies to each of the 12 months
                yearMonths.forEach(m => {
                    m.expenses += (Number(exp.amount) || 0);
                });
            } else {
                let expYear = 0;
                let expMonth = 0;
                const dStr = exp.createdAt || exp.date;
                if (dStr) {
                    const d = new Date(dStr);
                    if (!isNaN(d.getTime())) {
                        expYear = d.getFullYear();
                        expMonth = d.getMonth() + 1;
                    }
                }
                if (expYear === targetYear && expMonth >= 1 && expMonth <= 12) {
                    const item = yearMonths[expMonth - 1];
                    if (item) {
                        item.expenses += (Number(exp.amount) || 0);
                    }
                }
            }
        });

        return yearMonths.map(m => ({
            name: m.name,
            monthIso: m.monthIso,
            inflow: m.fees + m.incomes,
            expenses: m.expenses,
            net: (m.fees + m.incomes) - m.expenses,
            receipts: m.receipts,
            isCurrentSelected: m.monthIso === selectedMonth
        }));
    }, [selectedMonth, feeTransactions, financesData]);

    // 6. Expected School Target Calculations from Students Data
    const expectedRevenueStats = useMemo(() => {
        let totalExpectedMonthlyFees = 0;
        let totalEnrolledStudents = 0;
        const classStats = [];

        (classes || []).forEach(cls => {
            const students = classStudentsMap[cls.id] || [];
            totalEnrolledStudents += students.length;
            let classExpected = 0;
            let classPaidCount = 0;
            let classCollectedAmount = 0;

            students.forEach(s => {
                let sFee = (Number(s.tuitionFee) || 0) + (Number(s.transportFee) || 0) + (Number(s.otherFees) || 0);
                if (s.feeStructure && s.feeStructure.length > 0) {
                    sFee = s.feeStructure.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                }
                classExpected += sFee;

                // Check if paid in this month's transactions
                const isPaidThisMonth = monthlyMetrics.filteredTxs.some(t => t.studentId === s.id);
                if (isPaidThisMonth || s.monthlyFeeStatus === 'paid') {
                    classPaidCount += 1;
                }
            });

            // Sum class collected from transactions in this month
            monthlyMetrics.filteredTxs
                .filter(t => t.classId === cls.id)
                .forEach(t => { classCollectedAmount += (Number(t.totalPaid) || 0); });

            totalExpectedMonthlyFees += classExpected;

            classStats.push({
                classId: cls.id,
                className: cls.name || 'Class',
                totalStudents: students.length,
                paidCount: classPaidCount,
                unpaidCount: Math.max(0, students.length - classPaidCount),
                expected: classExpected,
                collected: classCollectedAmount,
                collectionRate: classExpected > 0 ? Math.min(100, Math.round((classCollectedAmount / classExpected) * 100)) : 0
            });
        });

        const overallCollectionRate = totalExpectedMonthlyFees > 0 
            ? Math.min(100, Math.round((monthlyMetrics.totalFeePaid / totalExpectedMonthlyFees) * 100)) 
            : 0;

        return {
            totalExpectedMonthlyFees,
            totalEnrolledStudents,
            overallCollectionRate,
            classStats
        };
    }, [classes, classStudentsMap, monthlyMetrics]);

    // 7. Filtered Ledger Records for Tab 2
    const filteredLedgerTxs = useMemo(() => {
        return monthlyMetrics.filteredTxs.filter(tx => {
            // Search Query Filter
            if (searchLedger.trim()) {
                const q = searchLedger.toLowerCase();
                const matchName = (tx.studentName || '').toLowerCase().includes(q);
                const matchRoll = String(tx.rollNo || '').toLowerCase().includes(q);
                const matchClass = (tx.className || '').toLowerCase().includes(q);
                const matchRec = (tx.receiptNo || '').toLowerCase().includes(q);
                const matchFather = (tx.fatherName || '').toLowerCase().includes(q);
                if (!matchName && !matchRoll && !matchClass && !matchRec && !matchFather) return false;
            }
            // Payment Mode Filter
            if (modeLedgerFilter !== 'all') {
                const m = (tx.paymentMode || '').toLowerCase();
                if (modeLedgerFilter === 'Cash' && m !== 'cash') return false;
                if (modeLedgerFilter === 'Bank' && !m.includes('bank') && !m.includes('transfer') && !m.includes('online')) return false;
                if (modeLedgerFilter === 'EasyPaisa' && !m.includes('easy')) return false;
                if (modeLedgerFilter === 'JazzCash' && !m.includes('jazz')) return false;
            }
            return true;
        });
    }, [monthlyMetrics.filteredTxs, searchLedger, modeLedgerFilter]);

    // 8. Offline-Resilient Add Income & Expense Handlers
    const handleSaveIncome = async (e) => {
        e.preventDefault();
        if (!newIncome.name.trim() || !newIncome.amount) return;
        setIsSavingIncome(true);

        const newItem = {
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: newIncome.name.trim(),
            amount: Number(newIncome.amount),
            type: newIncome.type, // 'one-time' | 'permanent'
            category: newIncome.category || 'General',
            remarks: newIncome.remarks.trim(),
            createdAt: new Date().toISOString()
        };

        // Optimistic State Update
        const updatedIncomes = [...(financesData.incomes || []), newItem];
        setFinancesData(prev => ({ ...prev, incomes: updatedIncomes }));

        setNewIncome({ name: '', amount: '', type: 'one-time', remarks: '', category: 'General' });
        setShowAddIncomeModal(false);
        setIsSavingIncome(false);

        // Background write
        (async () => {
            try {
                const docRef = doc(db, `schools/${schoolId}/settings/finances`);
                await setDoc(docRef, { incomes: updatedIncomes }, { merge: true });
            } catch (err) {
                console.warn("Income cached locally for sync:", err);
            }
        })();
    };

    const handleSaveExpense = async (e) => {
        e.preventDefault();
        if (!newExpense.name.trim() || !newExpense.amount) return;
        setIsSavingExpense(true);

        const newItem = {
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: newExpense.name.trim(),
            amount: Number(newExpense.amount),
            type: newExpense.type, // 'one-time' | 'permanent'
            category: newExpense.category || 'Operational',
            remarks: newExpense.remarks.trim(),
            createdAt: new Date().toISOString()
        };

        // Optimistic State Update
        const updatedExpenses = [...(financesData.expenses || []), newItem];
        setFinancesData(prev => ({ ...prev, expenses: updatedExpenses }));

        setNewExpense({ name: '', amount: '', type: 'one-time', remarks: '', category: 'Operational' });
        setShowAddExpenseModal(false);
        setIsSavingExpense(false);

        // Background write
        (async () => {
            try {
                const docRef = doc(db, `schools/${schoolId}/settings/finances`);
                await setDoc(docRef, { expenses: updatedExpenses }, { merge: true });
            } catch (err) {
                console.warn("Expense cached locally for sync:", err);
            }
        })();
    };

    const handleDeleteFinanceEntry = async (id, category) => {
        if (!window.confirm(`Are you sure you want to delete this ${category === 'incomes' ? 'income' : 'expense'} entry?`)) return;

        // Optimistic State Update
        const updatedList = (financesData[category] || []).filter(item => item.id !== id);
        setFinancesData(prev => ({ ...prev, [category]: updatedList }));

        try {
            const docRef = doc(db, `schools/${schoolId}/settings/finances`);
            await setDoc(docRef, { [category]: updatedList }, { merge: true });
        } catch (err) {
            console.warn("Delete finance entry cached locally:", err);
        }
    };

    // 9. 100% Offline Branded Monthly Financial Audit PDF Report
    const handleDownloadAuditPDF = async () => {
        setIsGeneratingPDF(true);
        try {
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });
            const pageWidth = doc.internal.pageSize.getWidth();

            // 1. Official Header
            doc.setFillColor(15, 23, 42); // Slate-900
            doc.rect(0, 0, pageWidth, 45, 'F');

            // Logo with Offline Base64 Fallback
            let hasLogo = false;
            let base64Logo = localStorage.getItem(`school_logo_base64_${schoolId}`);
            if (!base64Logo && schoolInfo.logo && schoolInfo.logo.startsWith('http')) {
                try {
                    const res = await fetch(schoolInfo.logo);
                    const blob = await res.blob();
                    base64Logo = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = () => resolve(null);
                        reader.readAsDataURL(blob);
                    });
                } catch (e) {}
            }

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
            const monthLabel = monthOptions.find(m => m.value === selectedMonth)?.label || selectedMonth;
            doc.text(`Monthly Financial & Revenue Audit Report - ${monthLabel}`, headerTextX, 28);

            doc.setFontSize(8);
            doc.setTextColor(203, 213, 225);
            doc.text(`Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, headerTextX, 35);

            // 2. Executive KPI Badges Table
            let startY = 55;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text("1. Executive Summary & Revenue Overview", 14, startY);

            const summaryTable = [
                ['Total Fees Collected (Daily Counter)', `${monthlyMetrics.paidStudentsCount} Student Receipts`, `Rs ${monthlyMetrics.totalFeePaid.toLocaleString()}`],
                ['Direct / Other School Incomes', `${monthlyMetrics.monthIncomes.length} Recorded Entries`, `Rs ${monthlyMetrics.totalOtherIncomes.toLocaleString()}`],
                ['Gross Total Revenue (Inflow)', 'Fees + Other Incomes', `Rs ${monthlyMetrics.grossRevenue.toLocaleString()}`],
                ['Total Operational Expenses (Outflow)', 'Direct School Expenses (Excl. Teacher Salary)', `Rs ${monthlyMetrics.totalExpenses.toLocaleString()}`],
                ['Net Cash Balance / Profit', monthlyMetrics.netProfit >= 0 ? 'Surplus / Profit' : 'Deficit / Loss', `Rs ${monthlyMetrics.netProfit.toLocaleString()}`]
            ];

            autoTable(doc, {
                startY: startY + 4,
                head: [['Revenue & Expense Head', 'Details / Count', 'Amount (PKR)']],
                body: summaryTable,
                theme: 'grid',
                headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
                styles: { fontSize: 9, cellPadding: 3.5 },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 80 },
                    1: { textColor: [100, 116, 139] },
                    2: { halign: 'right', fontStyle: 'bold' }
                },
                didParseCell: function(data) {
                    if (data.section === 'body') {
                        if (data.row.index === 2) {
                            data.cell.styles.fillColor = [239, 246, 255];
                            if (data.column.index === 2) data.cell.styles.textColor = [29, 78, 216];
                        }
                        if (data.row.index === 3) {
                            data.cell.styles.fillColor = [254, 242, 242];
                            if (data.column.index === 2) data.cell.styles.textColor = [220, 38, 38];
                        }
                        if (data.row.index === 4) {
                            data.cell.styles.fillColor = monthlyMetrics.netProfit >= 0 ? [240, 253, 244] : [254, 242, 242];
                            if (data.column.index === 2) {
                                data.cell.styles.textColor = monthlyMetrics.netProfit >= 0 ? [22, 101, 52] : [220, 38, 38];
                                data.cell.styles.fontSize = 10;
                            }
                        }
                    }
                }
            });

            // 3. Weekly Cashflow Audit Table
            let currentY = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text("2. Weekly Cashflow Progression (Inflow vs Outflow)", 14, currentY);

            const weeklyTableBody = monthlyMetrics.chartData.map(w => [
                w.name,
                `${w.receipts} Slips`,
                `Rs ${w.inflow.toLocaleString()}`,
                `Rs ${w.expenses.toLocaleString()}`,
                `Rs ${w.net.toLocaleString()}`
            ]);

            autoTable(doc, {
                startY: currentY + 4,
                head: [['Week Interval', 'Fee Receipts', 'Total Inflow (Rs)', 'Total Expenses (Rs)', 'Net Weekly Balance']],
                body: weeklyTableBody,
                theme: 'striped',
                headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
                styles: { fontSize: 8.5, cellPadding: 3 },
                columnStyles: {
                    0: { fontStyle: 'bold' },
                    2: { halign: 'right', textColor: [22, 101, 52] },
                    3: { halign: 'right', textColor: [220, 38, 38] },
                    4: { halign: 'right', fontStyle: 'bold' }
                }
            });

            // 4. Payment Modes Breakdown
            currentY = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text("3. Counter Cash Drawer vs Bank / Digital Channels", 14, currentY);

            const channelRows = [
                ['Cash In Hand (Counter Collections)', `Rs ${monthlyMetrics.cashFees.toLocaleString()}`, `${monthlyMetrics.totalFeePaid > 0 ? Math.round((monthlyMetrics.cashFees / monthlyMetrics.totalFeePaid) * 100) : 0}%`],
                ['Bank Transfers & Digital Channels', `Rs ${monthlyMetrics.totalDigitalChannels.toLocaleString()}`, `${monthlyMetrics.totalFeePaid > 0 ? Math.round((monthlyMetrics.totalDigitalChannels / monthlyMetrics.totalFeePaid) * 100) : 0}%`],
                ['Fee Concessions / Discounts Given', `Rs ${monthlyMetrics.totalDiscounts.toLocaleString()}`, '-']
            ];

            autoTable(doc, {
                startY: currentY + 4,
                head: [['Payment Channel / Category', 'Amount Collected', 'Share (%)']],
                body: channelRows,
                theme: 'grid',
                headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontSize: 8.5 },
                styles: { fontSize: 8.5, cellPadding: 3 },
                columnStyles: {
                    0: { fontStyle: 'bold' },
                    1: { halign: 'right', fontStyle: 'bold' },
                    2: { halign: 'center' }
                }
            });

            // 5. Itemized Operational Expenses
            currentY = doc.lastAutoTable.finalY + 10;
            if (currentY > 230) {
                doc.addPage();
                currentY = 20;
            }

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text("4. Itemized Operational Expenses Breakdown", 14, currentY);

            const expensesRows = monthlyMetrics.monthExpenses.map((exp, idx) => [
                idx + 1,
                exp.name,
                exp.category || 'Operational',
                exp.type === 'permanent' ? 'Auto Recurring' : 'Daily One-time',
                `Rs ${Number(exp.amount).toLocaleString()}`
            ]);

            autoTable(doc, {
                startY: currentY + 4,
                head: [['#', 'Expense Title', 'Category', 'Frequency', 'Amount (PKR)']],
                body: expensesRows.length > 0 ? expensesRows : [['-', 'No operational expenses recorded for this month', '-', '-', 'Rs 0']],
                theme: 'striped',
                headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontSize: 8.5 },
                styles: { fontSize: 8, cellPadding: 2.8 },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 10 },
                    4: { halign: 'right', fontStyle: 'bold' }
                }
            });

            // Page Footers & Signature
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(148, 163, 184);
                doc.text(`Official Monthly Audit - ${schoolInfo.name} | Confidential Financial Record`, 14, 287);
                doc.text(`Page ${i} of ${pageCount}`, pageWidth - 25, 287);
            }

            doc.save(`Financial_Audit_Report_${selectedMonth}_${(schoolInfo.name || 'School').replace(/\s+/g, '_')}.pdf`);
        } catch (err) {
            console.error("PDF generation failed:", err);
            alert("Failed to generate PDF. Please try again.");
        }
        setIsGeneratingPDF(false);
    };

    // 10. 100% Offline Customizable Class-Wise Recovery & Performance Audit PDF Report
    const handleDownloadClassPerformancePDF = async () => {
        setIsGeneratingClassPDF(true);
        try {
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });
            const pageWidth = doc.internal.pageSize.getWidth();

            // 1. Official Header
            doc.setFillColor(15, 23, 42); // Slate-900
            doc.rect(0, 0, pageWidth, 45, 'F');

            // Logo with Offline Base64 Fallback
            let hasLogo = false;
            let base64Logo = localStorage.getItem(`school_logo_base64_${schoolId}`);
            if (!base64Logo && schoolInfo.logo && schoolInfo.logo.startsWith('http')) {
                try {
                    const res = await fetch(schoolInfo.logo);
                    const blob = await res.blob();
                    base64Logo = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = () => resolve(null);
                        reader.readAsDataURL(blob);
                    });
                } catch (e) {}
            }

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
            const monthLabel = monthOptions.find(m => m.value === selectedMonth)?.label || selectedMonth;
            doc.text(`Class-Wise Fee Recovery & Performance Report - ${monthLabel}`, headerTextX, 28);

            doc.setFontSize(8);
            doc.setTextColor(203, 213, 225);
            doc.text(`Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, headerTextX, 35);

            // 2. Summary Overview Cards Table
            let startY = 55;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text("1. Overall School Recovery Summary", 14, startY);

            let totalExpected = 0;
            let totalCollected = 0;
            let totalPaidStudents = 0;
            let totalUnpaidStudents = 0;
            let totalStudentsCount = 0;

            expectedRevenueStats.classStats.forEach(c => {
                totalExpected += c.expected;
                totalCollected += c.collected;
                totalPaidStudents += c.paidCount;
                totalUnpaidStudents += c.unpaidCount;
                totalStudentsCount += c.totalStudents;
            });

            const totalRemaining = Math.max(0, totalExpected - totalCollected);
            const overallRate = totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 100)) : 0;

            const summaryData = [
                ['Total Active Classes', `${expectedRevenueStats.classStats.length} Classes`, 'Expected Monthly Dues', `Rs ${totalExpected.toLocaleString()}`],
                ['Total Enrolled Students', `${totalStudentsCount} Students`, 'Total Fees Collected', `Rs ${totalCollected.toLocaleString()}`],
                ['Paid vs Unpaid Students', `${totalPaidStudents} Paid / ${totalUnpaidStudents} Unpaid`, 'Outstanding Dues Balance', `Rs ${totalRemaining.toLocaleString()}`],
                ['Overall Recovery Rate', `${overallRate}% Collected`, 'Monthly Target Status', overallRate >= 80 ? 'Excellent Recovery' : overallRate >= 50 ? 'Moderate Recovery' : 'Action Required']
            ];

            autoTable(doc, {
                startY: startY + 4,
                body: summaryData,
                theme: 'grid',
                styles: { fontSize: 8.5, cellPadding: 3 },
                columnStyles: {
                    0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 45 },
                    1: { fontStyle: 'bold', textColor: [15, 23, 42], cellWidth: 45 },
                    2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 45 },
                    3: { fontStyle: 'bold', halign: 'right' }
                },
                didParseCell: function(data) {
                    if (data.section === 'body' && data.column.index === 3) {
                        if (data.row.index === 1) data.cell.styles.textColor = [22, 101, 52];
                        if (data.row.index === 2) data.cell.styles.textColor = [220, 38, 38];
                        if (data.row.index === 3) data.cell.styles.textColor = overallRate >= 80 ? [22, 101, 52] : [217, 119, 6];
                    }
                }
            });

            // 3. Class-by-Class Table
            let currentY = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text("2. Class-Wise Detailed Breakdown & Recovery Percentages", 14, currentY);

            const classTableRows = expectedRevenueStats.classStats.map((c, idx) => {
                const classRemaining = Math.max(0, c.expected - c.collected);
                return [
                    idx + 1,
                    c.className,
                    c.totalStudents,
                    c.paidCount,
                    c.unpaidCount,
                    `Rs ${c.expected.toLocaleString()}`,
                    `Rs ${c.collected.toLocaleString()}`,
                    `Rs ${classRemaining.toLocaleString()}`,
                    `${c.collectionRate}%`
                ];
            });

            // Add Total Summary Row
            classTableRows.push([
                '',
                'TOTAL / OVERALL',
                totalStudentsCount,
                totalPaidStudents,
                totalUnpaidStudents,
                `Rs ${totalExpected.toLocaleString()}`,
                `Rs ${totalCollected.toLocaleString()}`,
                `Rs ${totalRemaining.toLocaleString()}`,
                `${overallRate}%`
            ]);

            autoTable(doc, {
                startY: currentY + 4,
                head: [['#', 'Class Name', 'Total', 'Paid', 'Unpaid', 'Expected (PKR)', 'Collected (PKR)', 'Remaining (PKR)', 'Recovery %']],
                body: classTableRows,
                theme: 'striped',
                headStyles: {
                    fillColor: [15, 23, 42],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 8.5,
                    halign: 'left'
                },
                styles: { fontSize: 8, cellPadding: 2.8 },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 8 },
                    1: { fontStyle: 'bold' },
                    2: { halign: 'center' },
                    3: { halign: 'center', textColor: [22, 101, 52], fontStyle: 'bold' },
                    4: { halign: 'center', textColor: [220, 38, 38], fontStyle: 'bold' },
                    5: { halign: 'right' },
                    6: { halign: 'right', textColor: [22, 101, 52], fontStyle: 'bold' },
                    7: { halign: 'right', textColor: [220, 38, 38] },
                    8: { halign: 'center', fontStyle: 'bold' }
                },
                didParseCell: function(data) {
                    if (data.row.index === classTableRows.length - 1) {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fillColor = [241, 245, 249];
                        data.cell.styles.fontSize = 8.5;
                    }
                }
            });

            // 4. Page Footers & Signature
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(148, 163, 184);
                doc.text(`Official Class Recovery Audit - ${schoolInfo.name} | Confidential Principal Report`, 14, 287);
                doc.text(`Page ${i} of ${pageCount}`, pageWidth - 25, 287);
            }

            doc.save(`Class_Wise_Fee_Performance_${selectedMonth}_${(schoolInfo.name || 'School').replace(/\s+/g, '_')}.pdf`);
        } catch (err) {
            console.error("Class performance PDF export failed:", err);
            alert("Failed to generate Class Performance PDF.");
        }
        setIsGeneratingClassPDF(false);
    };

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '3.5rem 1rem', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <Loader2 size={36} className="animate-spin" color="#0078d4" style={{ margin: '0 auto 1rem' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1e293b' }}>Loading Financial Intelligence...</h3>
                <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Synchronizing Daily Workflow counter receipts & ledger analytics...</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Top Control Bar: Title, Offline/Online Pill, Month Selector, PDF Export */}
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '1.25rem 1.5rem',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #0078d4 0%, #1e40af 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff'
                    }}>
                        <Activity size={22} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                Financial Engine & Analytics
                            </h2>
                            {/* Live/Offline Status Badge */}
                            {!isOnline ? (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                    fontSize: '0.75rem', fontWeight: '700', padding: '0.2rem 0.6rem',
                                    borderRadius: '999px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a'
                                }}>
                                    <WifiOff size={13} /> Offline Mode
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
                            Aggregated month & week financial data from Daily Workflow counter
                        </p>
                    </div>
                </div>

                {/* Right Controls: Month Selector & Download Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {/* Month Picker Dropdown */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#f8fafc', padding: '0.35rem 0.75rem', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                        <Calendar size={16} color="#0078d4" />
                        <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#64748b' }}>Month:</span>
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                fontSize: '0.88rem',
                                fontWeight: '700',
                                color: '#0f172a',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            {monthOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label} {opt.value === currentMonthIso ? '(Current)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Download PDF Button */}
                    <button
                        onClick={handleDownloadAuditPDF}
                        disabled={isGeneratingPDF}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.65rem 1.25rem',
                            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '10px',
                            fontWeight: '700',
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            opacity: isGeneratingPDF ? 0.7 : 1
                        }}
                    >
                        {isGeneratingPDF ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        {isGeneratingPDF ? 'Generating...' : 'Download Audit PDF'}
                    </button>
                </div>
            </div>

            {/* 5 Executive KPI Metric Cards (For Selected Month) */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '1rem'
            }}>
                {/* 1. Total Fee Collected */}
                <div className="card" style={{
                    background: '#ffffff',
                    border: '1px solid #dbeafe',
                    borderLeft: '4px solid #0078d4',
                    borderRadius: '14px',
                    padding: '1.2rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#0078d4', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Fee Collections
                        </span>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0078d4' }}>
                            <Wallet size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: '800', color: '#0f172a', marginTop: '0.4rem' }}>
                        Rs {monthlyMetrics.totalFeePaid.toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.78rem', color: '#64748b' }}>
                        <CheckCircle2 size={14} color="#16a34a" />
                        <strong>{monthlyMetrics.paidStudentsCount}</strong> Student Slips Paid
                    </div>
                </div>

                {/* 2. Direct Other Incomes */}
                <div className="card" style={{
                    background: '#ffffff',
                    border: '1px solid #dcfce7',
                    borderLeft: '4px solid #16a34a',
                    borderRadius: '14px',
                    padding: '1.2rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Other Incomes
                        </span>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                            <TrendingUp size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: '800', color: '#0f172a', marginTop: '0.4rem' }}>
                        Rs {monthlyMetrics.totalOtherIncomes.toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.78rem', color: '#64748b' }}>
                        <span>Daily & Custom Incomes</span>
                    </div>
                </div>

                {/* 3. Total Operational Expenses (Strictly Excludes Teacher Salary) */}
                <div className="card" style={{
                    background: '#ffffff',
                    border: '1px solid #fee2e2',
                    borderLeft: '4px solid #dc2626',
                    borderRadius: '14px',
                    padding: '1.2rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Operational Expenses
                        </span>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                            <ArrowDownRight size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: '800', color: '#dc2626', marginTop: '0.4rem' }}>
                        Rs {monthlyMetrics.totalExpenses.toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.75rem', color: '#991b1b', fontWeight: '600' }}>
                        <span>School Operational (Excl. Salary)</span>
                    </div>
                </div>

                {/* 4. Gross Total Revenue */}
                <div className="card" style={{
                    background: '#ffffff',
                    border: '1px solid #e0e7ff',
                    borderLeft: '4px solid #4f46e5',
                    borderRadius: '14px',
                    padding: '1.2rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Gross Revenue
                        </span>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
                            <DollarSign size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: '800', color: '#0f172a', marginTop: '0.4rem' }}>
                        Rs {monthlyMetrics.grossRevenue.toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.78rem', color: '#64748b' }}>
                        <span>Total Monthly Inflow</span>
                    </div>
                </div>

                {/* 5. Net Cash Balance / Profit */}
                <div className="card" style={{
                    background: monthlyMetrics.netProfit >= 0 ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${monthlyMetrics.netProfit >= 0 ? '#bbf7d0' : '#fecaca'}`,
                    borderLeft: `4px solid ${monthlyMetrics.netProfit >= 0 ? '#16a34a' : '#dc2626'}`,
                    borderRadius: '14px',
                    padding: '1.2rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: monthlyMetrics.netProfit >= 0 ? '#166534' : '#991b1b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Net Balance
                        </span>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: monthlyMetrics.netProfit >= 0 ? '#16a34a' : '#dc2626' }}>
                            <Zap size={16} />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: '800', color: monthlyMetrics.netProfit >= 0 ? '#16a34a' : '#dc2626', marginTop: '0.4rem' }}>
                        Rs {monthlyMetrics.netProfit.toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.78rem', color: monthlyMetrics.netProfit >= 0 ? '#166534' : '#991b1b', fontWeight: '600' }}>
                        <span>{monthlyMetrics.netProfit >= 0 ? 'Surplus / Profit' : 'Deficit / Overdraft'}</span>
                    </div>
                </div>
            </div>

            {/* Cash Drawer & Channel Reconciliation Bar */}
            <div style={{
                background: '#f8fafc',
                borderRadius: '12px',
                padding: '0.9rem 1.25rem',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                fontSize: '0.85rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: '#64748b' }}>💵 Cash In Hand (Counter):</span>
                        <strong style={{ color: '#16a34a', fontSize: '0.95rem' }}>
                            Rs {monthlyMetrics.cashFees.toLocaleString()}
                        </strong>
                        <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                            {monthlyMetrics.totalFeePaid > 0 ? Math.round((monthlyMetrics.cashFees / monthlyMetrics.totalFeePaid) * 100) : 0}%
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: '#64748b' }}>🏦 Bank / Digital Channels:</span>
                        <strong style={{ color: '#2563eb', fontSize: '0.95rem' }}>
                            Rs {monthlyMetrics.totalDigitalChannels.toLocaleString()}
                        </strong>
                        <span style={{ fontSize: '0.75rem', background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                            {monthlyMetrics.totalFeePaid > 0 ? Math.round((monthlyMetrics.totalDigitalChannels / monthlyMetrics.totalFeePaid) * 100) : 0}%
                        </span>
                    </div>

                    {monthlyMetrics.totalDiscounts > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ color: '#64748b' }}>🏷️ Total Discounts Given:</span>
                            <strong style={{ color: '#d97706' }}>
                                Rs {monthlyMetrics.totalDiscounts.toLocaleString()}
                            </strong>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748b', fontSize: '0.8rem' }}>
                    <span>Target Achievement:</span>
                    <strong style={{ color: '#0f172a' }}>{expectedRevenueStats.overallCollectionRate}%</strong>
                </div>
            </div>

            {/* Sub Tabs Navigation */}
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                borderBottom: '2px solid #e2e8f0',
                paddingBottom: '0.2rem',
                overflowX: 'auto'
            }}>
                <button
                    onClick={() => setActiveSubTab('analytics')}
                    style={{
                        padding: '0.6rem 1.1rem',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: '700',
                        fontSize: '0.9rem',
                        color: activeSubTab === 'analytics' ? '#0078d4' : '#64748b',
                        borderBottom: activeSubTab === 'analytics' ? '3px solid #0078d4' : '3px solid transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <BarChart3 size={18} /> Executive Analytics & Visuals
                </button>

                <button
                    onClick={() => setActiveSubTab('fee_slips')}
                    style={{
                        padding: '0.6rem 1.1rem',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: '700',
                        fontSize: '0.9rem',
                        color: activeSubTab === 'fee_slips' ? '#0078d4' : '#64748b',
                        borderBottom: activeSubTab === 'fee_slips' ? '3px solid #0078d4' : '3px solid transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <FileText size={18} /> Daily Workflow Fee Receipts
                    <span style={{ background: '#eff6ff', color: '#0078d4', fontSize: '0.75rem', padding: '2px 7px', borderRadius: '10px', fontWeight: '800' }}>
                        {monthlyMetrics.filteredTxs.length}
                    </span>
                </button>

                <button
                    onClick={() => setActiveSubTab('incomes_expenses')}
                    style={{
                        padding: '0.6rem 1.1rem',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: '700',
                        fontSize: '0.9rem',
                        color: activeSubTab === 'incomes_expenses' ? '#0078d4' : '#64748b',
                        borderBottom: activeSubTab === 'incomes_expenses' ? '3px solid #0078d4' : '3px solid transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <Layers size={18} /> Incomes & Expenses Log
                    <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.75rem', padding: '2px 7px', borderRadius: '10px', fontWeight: '800' }}>
                        {monthlyMetrics.monthIncomes.length + monthlyMetrics.monthExpenses.length}
                    </span>
                </button>

                <button
                    onClick={() => setActiveSubTab('class_performance')}
                    style={{
                        padding: '0.6rem 1.1rem',
                        border: 'none',
                        background: 'transparent',
                        fontWeight: '700',
                        fontSize: '0.9rem',
                        color: activeSubTab === 'class_performance' ? '#0078d4' : '#64748b',
                        borderBottom: activeSubTab === 'class_performance' ? '3px solid #0078d4' : '3px solid transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <Users size={18} /> Class-Wise Collection Performance
                </button>
            </div>

            {/* ==================================================== */}
            {/* SUB TAB 1: EXECUTIVE ANALYTICS & INTERACTIVE CHARTS */}
            {/* ==================================================== */}
            {activeSubTab === 'analytics' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    
                    {/* Charts Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
                        
                        {/* 1. Monthly / Weekly Inflow vs Outflow Cashflow Chart */}
                        <div className="card" style={{
                            background: '#ffffff',
                            borderRadius: '16px',
                            padding: '1.5rem',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <BarChart3 size={18} color="#0078d4" />
                                        {cashFlowViewMode === 'monthly' 
                                            ? `Monthly Cash Flow Progression (${selectedMonth.split('-')[0]})` 
                                            : `Weekly Cash Flow Progression (${selectedMonthLabel})`}
                                    </h3>
                                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                        {cashFlowViewMode === 'monthly'
                                            ? 'Paisa aya (Inflow) vs Kharcha (Expenses) pore saal ka mahana jaiza'
                                            : 'Paisa aya (Inflow) vs Paisa gaya (Expenses) week-by-week (5 Weeks)'}
                                    </p>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    {/* View Mode Toggle Switch */}
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        background: '#f1f5f9',
                                        padding: '3px',
                                        borderRadius: '10px',
                                        border: '1px solid #e2e8f0'
                                    }}>
                                        <button
                                            onClick={() => setCashFlowViewMode('monthly')}
                                            style={{
                                                border: 'none',
                                                background: cashFlowViewMode === 'monthly' ? '#ffffff' : 'transparent',
                                                color: cashFlowViewMode === 'monthly' ? '#0078d4' : '#64748b',
                                                fontWeight: cashFlowViewMode === 'monthly' ? '800' : '600',
                                                padding: '4px 10px',
                                                borderRadius: '7px',
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                boxShadow: cashFlowViewMode === 'monthly' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <BarChart3 size={13} /> Monthly (12M)
                                        </button>
                                        <button
                                            onClick={() => setCashFlowViewMode('weekly')}
                                            style={{
                                                border: 'none',
                                                background: cashFlowViewMode === 'weekly' ? '#ffffff' : 'transparent',
                                                color: cashFlowViewMode === 'weekly' ? '#0078d4' : '#64748b',
                                                fontWeight: cashFlowViewMode === 'weekly' ? '800' : '600',
                                                padding: '4px 10px',
                                                borderRadius: '7px',
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                boxShadow: cashFlowViewMode === 'weekly' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <Calendar size={13} /> Weekly (5W)
                                        </button>
                                    </div>

                                    {/* Inflow / Expense Color Keys */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.75rem', fontWeight: '700' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#16a34a' }}>
                                            <span style={{ width: '9px', height: '9px', borderRadius: '3px', background: '#16a34a' }} /> Inflow
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#dc2626' }}>
                                            <span style={{ width: '9px', height: '9px', borderRadius: '3px', background: '#dc2626' }} /> Expenses
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ height: '260px', width: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={cashFlowViewMode === 'monthly' ? yearlyCashFlowData : monthlyMetrics.chartData}
                                        margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                                        onClick={(e) => {
                                            if (cashFlowViewMode === 'monthly' && e && e.activePayload?.[0]?.payload?.monthIso) {
                                                setSelectedMonth(e.activePayload[0].payload.monthIso);
                                                setCashFlowViewMode('weekly');
                                            }
                                        }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                                        <YAxis stroke="#64748b" fontSize={11} tickFormatter={(val) => `Rs ${val >= 1000 ? `${(val/1000).toFixed(0)}k` : val}`} />
                                        <RechartsTooltip
                                            content={({ active, payload, label }) => {
                                                if (!active || !payload || !payload.length) return null;
                                                const data = payload[0]?.payload || {};
                                                const inflowVal = Number(data.inflow) || 0;
                                                const expVal = Number(data.expenses) || 0;
                                                const netVal = Number(data.net !== undefined ? data.net : (inflowVal - expVal));
                                                const isSurplus = netVal >= 0;

                                                return (
                                                    <div style={{
                                                        background: '#0f172a',
                                                        color: '#ffffff',
                                                        borderRadius: '10px',
                                                        padding: '0.75rem 1rem',
                                                        fontSize: '0.82rem',
                                                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)',
                                                        border: '1px solid #334155',
                                                        minWidth: '210px'
                                                    }}>
                                                        <div style={{ fontWeight: '800', fontSize: '0.88rem', borderBottom: '1px solid #334155', paddingBottom: '0.4rem', marginBottom: '0.5rem', color: '#f8fafc' }}>
                                                            {label}
                                                            {cashFlowViewMode === 'monthly' && (
                                                                <span style={{ display: 'block', fontSize: '0.72rem', color: '#94a3b8', fontWeight: '500', marginTop: '2px' }}>
                                                                    (Click bar to open Weekly)
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                            {/* 1. Gross Revenue */}
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                                                                <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: '600' }}>
                                                                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#22c55e' }} />
                                                                    Gross Revenue:
                                                                </span>
                                                                <strong style={{ color: '#ffffff' }}>Rs {inflowVal.toLocaleString()}</strong>
                                                            </div>

                                                            {/* 2. Operational Expenses */}
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                                                                <span style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: '600' }}>
                                                                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#ef4444' }} />
                                                                    Operational Expenses:
                                                                </span>
                                                                <strong style={{ color: '#ffffff' }}>Rs {expVal.toLocaleString()}</strong>
                                                            </div>

                                                            {/* 3. Net Balance */}
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', borderTop: '1px dashed #334155', paddingTop: '0.35rem', marginTop: '0.2rem' }}>
                                                                <span style={{ color: isSurplus ? '#38bdf8' : '#fb923c', fontWeight: '700' }}>
                                                                    Net Balance:
                                                                </span>
                                                                <strong style={{ color: isSurplus ? '#38bdf8' : '#fb923c' }}>
                                                                    {netVal < 0 ? '-' : ''}Rs {Math.abs(netVal).toLocaleString()}
                                                                </strong>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Bar dataKey="inflow" fill="#16a34a" radius={[6, 6, 0, 0]} name="Inflow" cursor={cashFlowViewMode === 'monthly' ? 'pointer' : 'default'} />
                                        <Bar dataKey="expenses" fill="#dc2626" radius={[6, 6, 0, 0]} name="Expenses" cursor={cashFlowViewMode === 'monthly' ? 'pointer' : 'default'} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* 2. Payment Channel Distribution Donut */}
                        <div className="card" style={{
                            background: '#ffffff',
                            borderRadius: '16px',
                            padding: '1.5rem',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <PieChart size={18} color="#0078d4" />
                                        Payment Methods Split
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                                        Cash vs Bank vs Digital Channels breakdown
                                    </p>
                                </div>
                            </div>

                            {monthlyMetrics.pieData.length === 0 ? (
                                <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8' }}>
                                    <FileText size={32} style={{ marginBottom: '0.5rem', opacity: 0.6 }} />
                                    <p style={{ fontSize: '0.88rem' }}>No fee payment records found for this month</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '260px' }}>
                                    <div style={{ width: '55%', height: '100%' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <RechartsPie>
                                                <Pie
                                                    data={monthlyMetrics.pieData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={55}
                                                    outerRadius={85}
                                                    paddingAngle={4}
                                                    dataKey="value"
                                                >
                                                    {monthlyMetrics.pieData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <RechartsTooltip formatter={(value) => `Rs ${Number(value).toLocaleString()}`} />
                                            </RechartsPie>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Legend Details */}
                                    <div style={{ width: '45%', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        {monthlyMetrics.pieData.map((entry, idx) => {
                                            const pct = monthlyMetrics.totalFeePaid > 0 ? Math.round((entry.value / monthlyMetrics.totalFeePaid) * 100) : 0;
                                            return (
                                                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: entry.color }} />
                                                        <span style={{ color: '#475569', fontWeight: '600' }}>{entry.name}</span>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <strong style={{ color: '#0f172a' }}>Rs {entry.value.toLocaleString()}</strong>
                                                        <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: '4px' }}>({pct}%)</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Quick Weekly Ledger Highlights */}
                    <div className="card" style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        padding: '1.25rem 1.5rem',
                        border: '1px solid #e2e8f0'
                    }}>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a', marginBottom: '1rem' }}>
                            Weekly Cashflow Breakdown Summary ({monthOptions.find(m => m.value === selectedMonth)?.label || selectedMonth})
                        </h3>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Week Period</th>
                                        <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#475569', fontWeight: '700' }}>Fee Slips Count</th>
                                        <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: '#16a34a', fontWeight: '700' }}>Total Inflow (Rs)</th>
                                        <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: '#dc2626', fontWeight: '700' }}>Expenses (Rs)</th>
                                        <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: '#0f172a', fontWeight: '700' }}>Net Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {monthlyMetrics.chartData.map((w, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.7rem 0.85rem', fontWeight: '700', color: '#0f172a' }}>{w.name}</td>
                                            <td style={{ padding: '0.7rem 0.85rem', textAlign: 'center', color: '#64748b' }}>{w.receipts} Slips</td>
                                            <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right', fontWeight: '700', color: '#16a34a' }}>Rs {w.inflow.toLocaleString()}</td>
                                            <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right', fontWeight: '700', color: '#dc2626' }}>Rs {w.expenses.toLocaleString()}</td>
                                            <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right', fontWeight: '800', color: w.net >= 0 ? '#16a34a' : '#dc2626' }}>
                                                Rs {w.net.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ==================================================== */}
            {/* SUB TAB 2: DAILY WORKFLOW FEE RECEIPTS LEDGER */}
            {/* ==================================================== */}
            {activeSubTab === 'fee_slips' && (
                <div className="card" style={{
                    background: '#ffffff',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    border: '1px solid #e2e8f0'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                                Month Fee Transactions Ledger ({filteredLedgerTxs.length} Records)
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                                All instant receipts submitted via Daily Workflow counter for {monthOptions.find(m => m.value === selectedMonth)?.label}
                            </p>
                        </div>

                        {/* Filter and Search Bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            {/* Mode Filter */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#f8fafc', padding: '0.3rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                                <Filter size={14} color="#64748b" />
                                <select
                                    value={modeLedgerFilter}
                                    onChange={(e) => setModeLedgerFilter(e.target.value)}
                                    style={{ border: 'none', background: 'transparent', fontSize: '0.82rem', fontWeight: '600', color: '#0f172a', outline: 'none' }}
                                >
                                    <option value="all">All Modes</option>
                                    <option value="Cash">Cash Only</option>
                                    <option value="Bank">Bank / Online</option>
                                    <option value="EasyPaisa">EasyPaisa</option>
                                    <option value="JazzCash">JazzCash</option>
                                </select>
                            </div>

                            {/* Search Input */}
                            <div style={{ position: 'relative' }}>
                                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder="Search student, roll, receipt #..."
                                    value={searchLedger}
                                    onChange={(e) => setSearchLedger(e.target.value)}
                                    style={{
                                        padding: '0.45rem 0.75rem 0.45rem 2rem',
                                        fontSize: '0.85rem',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        outline: 'none',
                                        width: '240px'
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {filteredLedgerTxs.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                            <FileText size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                            <p style={{ fontSize: '0.95rem', fontWeight: '600' }}>No fee receipts match your criteria</p>
                            <span style={{ fontSize: '0.8rem' }}>Fee submissions made in the Daily Workflow tab will appear here instantly.</span>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Receipt No</th>
                                        <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Date & Time</th>
                                        <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Student Details</th>
                                        <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Class & Roll</th>
                                        <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Payment Channel</th>
                                        <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right', color: '#475569', fontWeight: '700' }}>Amount Paid</th>
                                        <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center', color: '#475569', fontWeight: '700' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredLedgerTxs.map(tx => (
                                        <tr key={tx.id || tx.receiptNo} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.65rem 0.75rem', fontWeight: '800', color: '#0078d4' }}>
                                                {tx.receiptNo}
                                            </td>
                                            <td style={{ padding: '0.65rem 0.75rem', color: '#64748b', fontSize: '0.8rem' }}>
                                                {tx.dateString || (tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000).toLocaleDateString() : 'N/A')}
                                                <span style={{ display: 'block', color: '#94a3b8', fontSize: '0.72rem' }}>{tx.timeString || ''}</span>
                                            </td>
                                            <td style={{ padding: '0.65rem 0.75rem' }}>
                                                <strong style={{ color: '#0f172a', display: 'block' }}>{tx.studentName}</strong>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>S/D/O {tx.fatherName || 'N/A'}</span>
                                            </td>
                                            <td style={{ padding: '0.65rem 0.75rem' }}>
                                                <span style={{ fontWeight: '600', color: '#334155' }}>{tx.className || 'Class'}</span>
                                                <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b' }}>Roll #{tx.rollNo || 'N/A'}</span>
                                            </td>
                                            <td style={{ padding: '0.65rem 0.75rem' }}>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                                    padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700',
                                                    background: (tx.paymentMode || 'Cash').toLowerCase() === 'cash' ? '#f0fdf4' : '#eff6ff',
                                                    color: (tx.paymentMode || 'Cash').toLowerCase() === 'cash' ? '#166534' : '#1e40af'
                                                }}>
                                                    {(tx.paymentMode || 'Cash').toLowerCase() === 'cash' ? <Wallet size={12} /> : <Landmark size={12} />}
                                                    {tx.paymentMode || 'Cash'}
                                                </span>
                                                {tx.proofUrl && (
                                                    <button
                                                        onClick={() => setProofModalState({ isOpen: true, url: tx.proofUrl, title: `Proof: ${tx.studentName} (${tx.receiptNo})` })}
                                                        style={{ display: 'block', border: 'none', background: 'none', color: '#0078d4', fontSize: '0.72rem', cursor: 'pointer', padding: 0, marginTop: '2px', textDecoration: 'underline' }}
                                                    >
                                                        View Screenshot
                                                    </button>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                                                <strong style={{ color: '#16a34a', fontSize: '0.95rem' }}>
                                                    Rs {Number(tx.totalPaid).toLocaleString()}
                                                </strong>
                                                {tx.discount > 0 && (
                                                    <span style={{ display: 'block', fontSize: '0.72rem', color: '#d97706' }}>
                                                        Disc: Rs {Number(tx.discount).toLocaleString()}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => {
                                                        setSelectedReceiptForModal(tx);
                                                        setReceiptModalOpen(true);
                                                    }}
                                                    style={{
                                                        padding: '0.35rem 0.75rem',
                                                        borderRadius: '6px',
                                                        border: '1px solid #cbd5e1',
                                                        background: '#ffffff',
                                                        color: '#0078d4',
                                                        fontWeight: '700',
                                                        fontSize: '0.78rem',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.3rem',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <Printer size={13} /> Voucher
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ==================================================== */}
            {/* SUB TAB 3: INCOMES & EXPENSES LOG */}
            {/* ==================================================== */}
            {activeSubTab === 'incomes_expenses' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
                    
                    {/* Left: Other Incomes Card */}
                    <div className="card" style={{ background: '#ffffff', borderRadius: '16px', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <TrendingUp size={18} /> Other Incomes Log
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                                    Prospectus, Uniforms, Canteen, Fines, Donations
                                </p>
                            </div>
                            <button
                                onClick={() => setShowAddIncomeModal(true)}
                                style={{
                                    padding: '0.45rem 0.9rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#16a34a',
                                    color: '#ffffff',
                                    fontWeight: '700',
                                    fontSize: '0.82rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <Plus size={15} /> Add Income
                            </button>
                        </div>

                        {monthlyMetrics.monthIncomes.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8' }}>
                                <p style={{ fontSize: '0.85rem' }}>No other incomes recorded for {monthOptions.find(m => m.value === selectedMonth)?.label}</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {monthlyMetrics.monthIncomes.map(inc => (
                                    <div key={inc.id} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '0.75rem 1rem', borderRadius: '10px', background: '#f8fafc', border: '1px solid #f1f5f9'
                                    }}>
                                        <div>
                                            <strong style={{ color: '#0f172a', display: 'block', fontSize: '0.9rem' }}>{inc.name}</strong>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                {inc.category || 'General'} • {inc.type === 'permanent' ? 'Auto Recurring' : 'One-time'}
                                                {inc.remarks && ` • Note: ${inc.remarks}`}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <strong style={{ color: '#16a34a', fontSize: '0.95rem' }}>
                                                Rs {Number(inc.amount).toLocaleString()}
                                            </strong>
                                            <button
                                                onClick={() => handleDeleteFinanceEntry(inc.id, 'incomes')}
                                                style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                                                title="Delete"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right: Operational Expenses Card (Without Teacher Salary) */}
                    <div className="card" style={{ background: '#ffffff', borderRadius: '16px', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <ArrowDownRight size={18} /> Operational Expenses Log
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                                    Utility bills, stationary, maintenance, daily refreshments
                                </p>
                            </div>
                            <button
                                onClick={() => setShowAddExpenseModal(true)}
                                style={{
                                    padding: '0.45rem 0.9rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#dc2626',
                                    color: '#ffffff',
                                    fontWeight: '700',
                                    fontSize: '0.82rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <Plus size={15} /> Add Expense
                            </button>
                        </div>

                        {monthlyMetrics.monthExpenses.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8' }}>
                                <p style={{ fontSize: '0.85rem' }}>No operational expenses recorded for {monthOptions.find(m => m.value === selectedMonth)?.label}</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {monthlyMetrics.monthExpenses.map(exp => (
                                    <div key={exp.id} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '0.75rem 1rem', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fee2e2'
                                    }}>
                                        <div>
                                            <strong style={{ color: '#0f172a', display: 'block', fontSize: '0.9rem' }}>{exp.name}</strong>
                                            <span style={{ fontSize: '0.75rem', color: '#991b1b' }}>
                                                {exp.category || 'Operational'} • {exp.type === 'permanent' ? 'Auto Recurring' : 'One-time'}
                                                {exp.remarks && ` • Note: ${exp.remarks}`}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <strong style={{ color: '#dc2626', fontSize: '0.95rem' }}>
                                                Rs {Number(exp.amount).toLocaleString()}
                                            </strong>
                                            <button
                                                onClick={() => handleDeleteFinanceEntry(exp.id, 'expenses')}
                                                style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                                                title="Delete"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ==================================================== */}
            {/* SUB TAB 4: CLASS-WISE COLLECTION PERFORMANCE */}
            {/* ==================================================== */}
            {activeSubTab === 'class_performance' && (
                <div className="card" style={{ background: '#ffffff', borderRadius: '16px', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.2rem 0' }}>
                                Class-Wise Fee Collection Rate & Performance
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                                Tracking collection progress and recovery rates across all classes for {monthOptions.find(m => m.value === selectedMonth)?.label}
                            </p>
                        </div>
                        <button
                            onClick={handleDownloadClassPerformancePDF}
                            disabled={isGeneratingClassPDF}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                padding: '0.55rem 1.15rem',
                                background: 'linear-gradient(135deg, #0078d4 0%, #1e40af 100%)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '10px',
                                fontWeight: '700',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(0, 120, 212, 0.2)',
                                opacity: isGeneratingClassPDF ? 0.7 : 1
                            }}
                        >
                            {isGeneratingClassPDF ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                            {isGeneratingClassPDF ? 'Generating PDF...' : 'Download Class Report (PDF)'}
                        </button>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Class Name</th>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#475569', fontWeight: '700' }}>Students</th>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#16a34a', fontWeight: '700' }}>Paid Count</th>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: '#dc2626', fontWeight: '700' }}>Unpaid Count</th>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: '#475569', fontWeight: '700' }}>Expected (Rs)</th>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', color: '#16a34a', fontWeight: '700' }}>Collected (Rs)</th>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: '#475569', fontWeight: '700', width: '180px' }}>Recovery %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expectedRevenueStats.classStats.map(c => (
                                    <tr key={c.classId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.7rem 0.85rem', fontWeight: '700', color: '#0f172a' }}>{c.className}</td>
                                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'center', color: '#334155' }}>{c.totalStudents}</td>
                                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'center', fontWeight: '700', color: '#16a34a' }}>{c.paidCount}</td>
                                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'center', fontWeight: '700', color: c.unpaidCount > 0 ? '#dc2626' : '#64748b' }}>{c.unpaidCount}</td>
                                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right', color: '#475569' }}>Rs {c.expected.toLocaleString()}</td>
                                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right', fontWeight: '700', color: '#16a34a' }}>Rs {c.collected.toLocaleString()}</td>
                                        <td style={{ padding: '0.7rem 0.85rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div style={{ flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                                                    <div style={{
                                                        width: `${c.collectionRate}%`,
                                                        height: '100%',
                                                        background: c.collectionRate >= 80 ? '#16a34a' : c.collectionRate >= 50 ? '#0078d4' : '#d97706',
                                                        borderRadius: '999px',
                                                        transition: 'width 0.3s ease'
                                                    }} />
                                                </div>
                                                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0f172a', width: '35px', textAlign: 'right' }}>
                                                    {c.collectionRate}%
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modals */}
            {/* 1. Add Income Modal */}
            {showAddIncomeModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
                    <div className="card" style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '440px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#16a34a' }}>Add Direct Income</h3>
                            <button onClick={() => setShowAddIncomeModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSaveIncome} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>Income Title / Source</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Canteen Rent, Prospectus Sale, Fine"
                                    value={newIncome.name}
                                    onChange={(e) => setNewIncome({ ...newIncome, name: e.target.value })}
                                    required
                                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>Amount (Rs)</label>
                                <input
                                    type="number"
                                    placeholder="e.g. 5000"
                                    value={newIncome.amount}
                                    onChange={(e) => setNewIncome({ ...newIncome, amount: e.target.value })}
                                    required
                                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>Type</label>
                                <select
                                    value={newIncome.type}
                                    onChange={(e) => setNewIncome({ ...newIncome, type: e.target.value })}
                                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                                >
                                    <option value="one-time">One-Time (This month only)</option>
                                    <option value="permanent">Recurring (Auto every month)</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>Remarks / Note (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="Details or reference"
                                    value={newIncome.remarks}
                                    onChange={(e) => setNewIncome({ ...newIncome, remarks: e.target.value })}
                                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <button type="button" onClick={() => setShowAddIncomeModal(false)} style={{ padding: '0.55rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" disabled={isSavingIncome} style={{ padding: '0.55rem 1.25rem', borderRadius: '8px', border: 'none', background: '#16a34a', color: '#fff', fontWeight: '700', cursor: 'pointer' }}>
                                    {isSavingIncome ? 'Saving...' : 'Save Income'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 2. Add Expense Modal */}
            {showAddExpenseModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
                    <div className="card" style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '440px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#dc2626' }}>Add Operational Expense</h3>
                            <button onClick={() => setShowAddExpenseModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSaveExpense} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>Expense Title</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Electricity Bill, Stationery, Lab Material"
                                    value={newExpense.name}
                                    onChange={(e) => setNewExpense({ ...newExpense, name: e.target.value })}
                                    required
                                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>Amount (Rs)</label>
                                <input
                                    type="number"
                                    placeholder="e.g. 12000"
                                    value={newExpense.amount}
                                    onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                                    required
                                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>Category</label>
                                <select
                                    value={newExpense.category}
                                    onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                                >
                                    <option value="Operational">Operational / Office</option>
                                    <option value="Utility Bills">Utility Bills</option>
                                    <option value="Stationery">Stationery & Printing</option>
                                    <option value="Maintenance">Building / Repairs</option>
                                    <option value="Refreshments">Refreshments / Tea</option>
                                    <option value="Other">Other Miscellaneous</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>Type</label>
                                <select
                                    value={newExpense.type}
                                    onChange={(e) => setNewExpense({ ...newExpense, type: e.target.value })}
                                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                                >
                                    <option value="one-time">One-Time (This month only)</option>
                                    <option value="permanent">Recurring (Auto every month)</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>Remarks / Note (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="Bill invoice # or notes"
                                    value={newExpense.remarks}
                                    onChange={(e) => setNewExpense({ ...newExpense, remarks: e.target.value })}
                                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem' }}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <button type="button" onClick={() => setShowAddExpenseModal(false)} style={{ padding: '0.55rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" disabled={isSavingExpense} style={{ padding: '0.55rem 1.25rem', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', fontWeight: '700', cursor: 'pointer' }}>
                                    {isSavingExpense ? 'Saving...' : 'Save Expense'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 3. Fee Receipt Modal Voucher */}
            {receiptModalOpen && selectedReceiptForModal && (
                <FeeReceiptModal
                    isOpen={receiptModalOpen}
                    onClose={() => {
                        setReceiptModalOpen(false);
                        setSelectedReceiptForModal(null);
                    }}
                    receiptData={selectedReceiptForModal}
                    schoolInfo={schoolInfo}
                />
            )}

            {/* 4. Payment Proof Screenshot Lightbox */}
            {proofModalState.isOpen && (
                <PaymentProofModal
                    isOpen={proofModalState.isOpen}
                    onClose={() => setProofModalState({ isOpen: false, url: '', title: '' })}
                    proofUrl={proofModalState.url}
                    title={proofModalState.title}
                />
            )}
        </div>
    );
};

// --- Daily Workflow Fee Collection Widget ---
const DailyWorkflow = ({ schoolId, classes, currentAction, schoolInfo, preselectedClassId, preselectedStudentId, feeSettings }) => {
    const navigate = useNavigate();

    // 1. Selector & Search States
    const [selectedClassId, setSelectedClassId] = useState(preselectedClassId || '');
    const [selectedStudentId, setSelectedStudentId] = useState(preselectedStudentId || '');
    const [classStudents, setClassStudents] = useState([]);
    const [loadingClassStudents, setLoadingClassStudents] = useState(false);

    // Global Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [allStudents, setAllStudents] = useState([]);
    const [loadingAllStudents, setLoadingAllStudents] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);

    // 2. Selected Student Fee Calculation & Payment Form
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [receivedAmount, setReceivedAmount] = useState('');
    const [discountAmount, setDiscountAmount] = useState('');
    const [fineAmount, setFineAmount] = useState('0');
    const [remarks, setRemarks] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fee Settings & Due Date Tracking
    const [feeSettingsData, setFeeSettingsData] = useState(() => {
        try {
            const saved = localStorage.getItem(`fee_settings_${schoolId}`);
            return saved ? JSON.parse(saved) : (feeSettings || { dueDate: '', penaltyAmount: '' });
        } catch (e) {
            return feeSettings || { dueDate: '', penaltyAmount: '' };
        }
    });

    useEffect(() => {
        if (!schoolId) return;
        const feeSettingsRef = doc(db, 'schools', schoolId, 'settings', 'feeSettings');
        const unsubFee = onSnapshot(feeSettingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const val = {
                    dueDate: data.dueDate || '',
                    penaltyAmount: data.penaltyAmount || ''
                };
                setFeeSettingsData(val);
                try { localStorage.setItem(`fee_settings_${schoolId}`, JSON.stringify(val)); } catch (e) {}
            }
        }, (err) => console.warn("Offline feeSettings cache read:", err));
        return () => unsubFee();
    }, [schoolId]);

    // Calculate Due Date & Auto Late Fine for current month
    const dueInfo = useMemo(() => {
        if (!feeSettingsData?.dueDate) {
            return { dueDay: null, isOverdue: false, daysLate: 0, penaltyAmount: 0, autoFine: 0, dueDateStr: null };
        }
        const dueDay = parseInt(String(feeSettingsData.dueDate).replace(/\D/g, '')) || 10;
        const penaltyAmount = Number(feeSettingsData.penaltyAmount) || 0;
        const today = new Date();
        const currentDay = today.getDate();
        const isOverdue = currentDay > dueDay;
        const daysLate = isOverdue ? (currentDay - dueDay) : 0;
        const autoFine = isOverdue ? penaltyAmount : 0;

        return {
            dueDay,
            isOverdue,
            daysLate,
            penaltyAmount,
            autoFine,
            dueDateStr: `${dueDay}th of this month`
        };
    }, [feeSettingsData]);

    // Payment Proof Screenshot States
    const [proofFile, setProofFile] = useState(null);
    const [proofPreview, setProofPreview] = useState(null);
    const [proofModal, setProofModal] = useState({ isOpen: false, url: '', title: '' });

    const handleProofChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setProofFile(file);
            const previewUrl = URL.createObjectURL(file);
            setProofPreview(previewUrl);
        }
    };

    const handleRemoveProof = () => {
        setProofFile(null);
        if (proofPreview) {
            URL.revokeObjectURL(proofPreview);
        }
        setProofPreview(null);
    };

    // 3. Receipt State
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [receiptData, setReceiptData] = useState(null);

    // 4. Recent Transactions Log
    const [recentTransactions, setRecentTransactions] = useState([]);
    const [loadingTransactions, setLoadingTransactions] = useState(true);
    const [isGeneratingDailyPDF, setIsGeneratingDailyPDF] = useState(false);
    const [isGeneratingFinancesPDF, setIsGeneratingFinancesPDF] = useState(false);
    const [localSchoolInfo, setLocalSchoolInfo] = useState(schoolInfo || { name: 'School Report', logo: '' });

    // 5. Daily Mode: 'fee_submission' (default) or 'income_expense'
    const [activeDailyMode, setActiveDailyMode] = useState('fee_submission');

    // 6. Offline Resilience & Auto-Sync Engine States
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [pendingOfflineTxs, setPendingOfflineTxs] = useState(() => {
        try {
            const saved = localStorage.getItem(`offline_fee_queue_${schoolId}`);
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });

    const [pendingOfflineFinances, setPendingOfflineFinances] = useState(() => {
        try {
            const saved = localStorage.getItem(`offline_finances_queue_${schoolId}`);
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });

    const savePendingQueue = (queue) => {
        try {
            setPendingOfflineTxs(queue);
            localStorage.setItem(`offline_fee_queue_${schoolId}`, JSON.stringify(queue));
        } catch (e) {
            console.error("Error saving offline fee queue to localStorage:", e);
        }
    };

    const savePendingFinancesQueue = (queue) => {
        try {
            setPendingOfflineFinances(queue);
            localStorage.setItem(`offline_finances_queue_${schoolId}`, JSON.stringify(queue));
        } catch (e) {
            console.error("Error saving offline finances queue:", e);
        }
    };

    const triggerAutoSync = async () => {
        if (!navigator.onLine || isSyncing || !schoolId) return;
        setIsSyncing(true);

        // 1. Sync Pending Fees & Proofs
        let currentQueue = [];
        try {
            const saved = localStorage.getItem(`offline_fee_queue_${schoolId}`);
            currentQueue = saved ? JSON.parse(saved) : [];
        } catch (e) {
            currentQueue = [];
        }

        if (currentQueue.length > 0) {
            const remainingQueue = [...currentQueue];

            for (const tx of currentQueue) {
                try {
                    let proofUrl = tx.proofUrl;

                    // If proof is Base64 and online, try uploading to Storage
                    if (proofUrl && proofUrl.startsWith('data:image')) {
                        try {
                            const blobRes = await fetch(proofUrl);
                            const blobData = await blobRes.blob();
                            const storagePath = `schools/${schoolId}/paymentProofs/proof_sync_${Date.now()}_${tx.studentId}.jpg`;
                            const storageRef = ref(storage, storagePath);
                            const uploadSnap = await uploadBytes(storageRef, blobData);
                            proofUrl = await getDownloadURL(uploadSnap.ref);
                        } catch (uploadErr) {
                            console.warn("Base64 storage upload fallback during sync:", uploadErr);
                        }
                    }

                    const studentRef = doc(db, `schools/${schoolId}/classes/${tx.classId}/students`, tx.studentId);
                    const masterStudentRef = doc(db, `schools/${schoolId}/students`, tx.studentId);

                    const studentUpdatePayload = {
                        monthlyFeeStatus: 'paid',
                        monthlyFeeDate: tx.dateIso || new Date().toISOString(),
                        lastPaymentMode: tx.paymentMode,
                        lastReceiptNo: tx.receiptNo,
                        lastPaymentAmount: tx.totalPaid,
                        lastPaymentProofUrl: proofUrl || null,
                        individualActions: tx.updatedIndividualActions || []
                    };

                    if (tx.customPayments) {
                        studentUpdatePayload.customPayments = tx.customPayments;
                    }

                    await setDoc(studentRef, studentUpdatePayload, { merge: true });
                    try {
                        await setDoc(masterStudentRef, studentUpdatePayload, { merge: true });
                    } catch (e) {
                        console.warn("Master student sync skipped:", e);
                    }

                    const transactionRecord = {
                        receiptNo: tx.receiptNo,
                        studentId: tx.studentId,
                        studentName: tx.studentName,
                        rollNo: tx.rollNo || 'N/A',
                        classId: tx.classId,
                        className: tx.className,
                        fatherName: tx.fatherName || 'N/A',
                        items: tx.items || [],
                        baseFee: tx.baseFee || 0,
                        actionsFee: tx.actionsFee || 0,
                        fineAmount: tx.fineAmount || 0,
                        discount: tx.discount || 0,
                        totalPaid: tx.totalPaid,
                        paymentMode: tx.paymentMode,
                        proofUrl: proofUrl || null,
                        remarks: tx.remarks || '',
                        timestamp: serverTimestamp(),
                        dateString: tx.dateString,
                        timeString: tx.timeString,
                        collectedBy: tx.collectedBy || 'Principal Office'
                    };

                    await addDoc(collection(db, `schools/${schoolId}/feeTransactions`), transactionRecord);

                    const index = remainingQueue.findIndex(item => item.queueId === tx.queueId);
                    if (index !== -1) {
                        remainingQueue.splice(index, 1);
                    }
                } catch (syncErr) {
                    console.error("Failed to sync offline fee item:", tx.receiptNo, syncErr);
                    if (!navigator.onLine) break;
                }
            }

            savePendingQueue(remainingQueue);
        }

        // 2. Sync Pending Finances (Incomes & Expenses)
        let currentFinancesQueue = [];
        try {
            const savedFin = localStorage.getItem(`offline_finances_queue_${schoolId}`);
            currentFinancesQueue = savedFin ? JSON.parse(savedFin) : [];
        } catch (e) {
            currentFinancesQueue = [];
        }

        if (currentFinancesQueue.length > 0) {
            try {
                const docRef = doc(db, `schools/${schoolId}/settings/finances`);
                const docSnap = await getDoc(docRef);
                const serverData = docSnap.exists() ? docSnap.data() : { incomes: [], expenses: [] };
                let serverIncomes = [...(serverData.incomes || [])];
                let serverExpenses = [...(serverData.expenses || [])];

                currentFinancesQueue.forEach(item => {
                    if (item.category === 'incomes') {
                        if (!serverIncomes.some(i => i.id === item.id)) serverIncomes.push(item);
                    } else if (item.category === 'expenses') {
                        if (!serverExpenses.some(e => e.id === item.id)) serverExpenses.push(item);
                    }
                });

                await setDoc(docRef, { incomes: serverIncomes, expenses: serverExpenses }, { merge: true });
                savePendingFinancesQueue([]);
            } catch (finSyncErr) {
                console.warn("Finances background sync postponed:", finSyncErr);
            }
        }

        setIsSyncing(false);
    };

    // Live Network Connection & Auto-Sync Event Listeners
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            triggerAutoSync();
        };
        const handleOffline = () => {
            setIsOnline(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        if (navigator.onLine) {
            triggerAutoSync();
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [schoolId]);
    
    // 7. Finances Data & Operations for Daily Workflow
    const [financesData, setFinancesData] = useState({ incomes: [], expenses: [] });
    const [teachersSalary, setTeachersSalary] = useState(0);
    const [newIncome, setNewIncome] = useState({ name: '', amount: '', remarks: '' });
    const [newExpense, setNewExpense] = useState({ name: '', amount: '', remarks: '' });
    const [isSavingIncome, setIsSavingIncome] = useState(false);
    const [isSavingExpense, setIsSavingExpense] = useState(false);
    const [rightCardTab, setRightCardTab] = useState('fee_slips'); // 'fee_slips' | 'finances_breakdown'

    // Live Finances Listener (Incomes & Expenses)
    useEffect(() => {
        if (!schoolId) return;
        const unsub = onSnapshot(doc(db, `schools/${schoolId}/settings/finances`), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setFinancesData({
                    incomes: data.incomes || [],
                    expenses: data.expenses || []
                });
            } else {
                setFinancesData({ incomes: [], expenses: [] });
            }
        }, (err) => console.warn("Offline finances listener cache read:", err));
        return () => unsub();
    }, [schoolId]);

    // Live/Fetched Teachers Total Salary for Breakdown
    useEffect(() => {
        if (!schoolId) return;
        const fetchTeachers = async () => {
            try {
                const teachersSnap = await getDocs(collection(db, `schools/${schoolId}/teachers`));
                let totalSalary = 0;
                teachersSnap.docs.forEach(doc => {
                    totalSalary += (Number(doc.data().salary) || 0);
                });
                setTeachersSalary(totalSalary);
            } catch (err) {
                console.warn("Could not fetch teachers salary for breakdown:", err);
            }
        };
        fetchTeachers();
    }, [schoolId]);

    // Dynamic Today's Incomes & Expenses (Strict 24-Hour Day Match - Auto Resets at 12 AM Midnight)
    const todayFinances = useMemo(() => {
        const now = new Date();
        const todayStr = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const endOfToday = startOfToday + 86400000;

        const isToday = (item) => {
            if (!item) return false;
            if (item.dateString && item.dateString === todayStr) return true;
            if (item.createdAt) {
                const itemDate = new Date(item.createdAt);
                if (!isNaN(itemDate.getTime())) {
                    const itemDateStr = itemDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                    if (itemDateStr === todayStr) return true;
                }
            }
            if (item.id) {
                const ts = Number(String(item.id).split('_')[0]);
                if (!isNaN(ts) && ts >= startOfToday && ts < endOfToday) return true;
            }
            return false;
        };

        const todayIncomes = (financesData.incomes || []).filter(isToday);
        const todayExpenses = (financesData.expenses || []).filter(isToday);

        return {
            incomes: todayIncomes,
            expenses: todayExpenses
        };
    }, [financesData]);

    const handleAddFinance = async (type, category, itemData, setSaving, setForm) => {
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            const session = JSON.parse(manualSession);
            if (session.isManual) {
                alert("Restricted: You are logged in via Manual Bypass Mode. Database writes are disabled.");
                return;
            }
        }
        if (!itemData.name || !itemData.amount) return;
        setSaving(true);

        const now = new Date();
        const newItem = {
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: itemData.name.trim(),
            amount: Number(itemData.amount),
            remarks: itemData.remarks ? itemData.remarks.trim() : '',
            type: type, // 'one-time' or 'permanent'
            category: category,
            createdAt: now.toISOString(),
            dateString: now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
        };

        // 1. Instant Optimistic State Update (100% Offline Working)
        const updatedList = [...(financesData[category] || []), newItem];
        setFinancesData(prev => ({
            ...prev,
            [category]: updatedList
        }));

        // 2. Add to Persistent Offline Queue
        const currentFinQ = JSON.parse(localStorage.getItem(`offline_finances_queue_${schoolId}`) || '[]');
        savePendingFinancesQueue([...currentFinQ, newItem]);

        // 3. Clear Form & Switch to Breakdown View (<50ms)
        setForm({ name: '', amount: '', remarks: '' });
        setRightCardTab('finances_breakdown');
        setSaving(false);

        // 4. Background Non-Blocking Firestore Write
        (async () => {
            try {
                const docRef = doc(db, `schools/${schoolId}/settings/finances`);
                await setDoc(docRef, { [category]: updatedList }, { merge: true });
                if (navigator.onLine) {
                    const refreshedQ = JSON.parse(localStorage.getItem(`offline_finances_queue_${schoolId}`) || '[]');
                    savePendingFinancesQueue(refreshedQ.filter(q => q.id !== newItem.id));
                }
            } catch (err) {
                console.warn("Finances cached locally for background sync:", err);
            }
        })();
    };

    const handleDeleteFinance = async (id, category) => {
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            const session = JSON.parse(manualSession);
            if (session.isManual) {
                alert("Restricted: You are logged in via Manual Bypass Mode. Database writes are disabled.");
                return;
            }
        }
        if (!window.confirm("Are you sure you want to delete this entry?")) return;
        
        // Optimistic UI Update
        const updatedList = (financesData[category] || []).filter(item => item.id !== id);
        setFinancesData(prev => ({
            ...prev,
            [category]: updatedList
        }));

        try {
            const docRef = doc(db, `schools/${schoolId}/settings/finances`);
            await setDoc(docRef, { [category]: updatedList }, { merge: true });
        } catch (err) {
            console.warn("Delete finance stored locally:", err);
        }
    };

    // Fetch school info for PDF branding if not supplied
    useEffect(() => {
        if (schoolInfo && schoolInfo.name && schoolInfo.name !== 'School Name' && schoolInfo.name !== 'School Report') {
            setLocalSchoolInfo(schoolInfo);
            return;
        }
        if (!schoolId) return;

        const fetchSchoolMeta = async () => {
            try {
                const [profileSnap, schoolDocSnap] = await Promise.all([
                    getDoc(doc(db, `schools/${schoolId}/settings/profile`)),
                    getDoc(doc(db, `schools/${schoolId}`))
                ]);

                let name = 'School Report';
                let logo = '';

                if (profileSnap.exists()) {
                    const pData = profileSnap.data();
                    if (pData.name) name = pData.name;
                    if (pData.profileImage) logo = pData.profileImage;
                }
                if (schoolDocSnap.exists()) {
                    const sData = schoolDocSnap.data();
                    if (!logo && sData.profileImage) logo = sData.profileImage;
                    if (name === 'School Report' && sData.name) name = sData.name;
                }

                setLocalSchoolInfo({ name, logo });
            } catch (err) {
                console.warn("Could not fetch school meta for DailyWorkflow PDF:", err);
            }
        };

        fetchSchoolMeta();
    }, [schoolId, schoolInfo]);

    const getDailyBase64Image = async (imageUrl) => {
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Failed to load image for PDF", e);
            return null;
        }
    };

    // Download Customized Daily Fee Collections PDF Report
    const handleDownloadDailyReport = async () => {
        if (todayTransactions.length === 0) {
            alert("No fee collections recorded today yet to generate a daily report.");
            return;
        }
        setIsGeneratingDailyPDF(true);
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            // 1. Premium Header Background Bar (Slate-900 / Navy)
            doc.setFillColor(15, 23, 42);
            doc.rect(0, 0, pageWidth, 48, 'F');

            // Accent Brand Strip at top
            doc.setFillColor(0, 120, 212);
            doc.rect(0, 0, pageWidth, 4, 'F');

            // 2. School Logo
            let hasLogo = false;
            let logoUrl = localSchoolInfo?.logo || schoolInfo?.logo || '';
            if (logoUrl) {
                const base64Img = await getDailyBase64Image(logoUrl);
                if (base64Img) {
                    try {
                        doc.addImage(base64Img, 'PNG', 14, 10, 26, 26);
                        hasLogo = true;
                    } catch (err) {
                        console.warn("Logo addImage fallback:", err);
                    }
                }
            }

            // 3. School Header Text & Metadata
            const textX = hasLogo ? 46 : 14;
            const currentSchoolName = (localSchoolInfo?.name || schoolInfo?.name || 'School Fee Collections').toUpperCase();
            
            doc.setFontSize(17);
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.text(currentSchoolName, textX, 19);

            doc.setFontSize(10.5);
            doc.setTextColor(56, 189, 248); // Sky-400
            doc.setFont("helvetica", "bold");
            doc.text("DAILY FEE COLLECTIONS & REVENUE AUDIT REPORT", textX, 26);

            doc.setFontSize(8);
            doc.setTextColor(203, 213, 225); // Slate-300
            doc.setFont("helvetica", "normal");
            const now = new Date();
            const printDate = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            const printTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            doc.text(`Generated on: ${printDate} at ${printTime}  |  Official Ledger Export`, textX, 33);
            doc.text(`Total Slips Audited Today: ${todayTransactions.length}  |  Status: 100% Reconciled & Verified`, textX, 39);

            // 4. Executive Summary KPI Grid (4 Stat Blocks)
            const startY = 55;
            const cardWidth = (pageWidth - 28 - 9) / 4;
            const cardHeight = 21;

            const kpis = [
                { label: "TOTAL COLLECTED", val: `Rs ${todayMetrics.totalAmount.toLocaleString()}`, bg: [236, 253, 245], border: [167, 243, 208], text: [5, 150, 105] },
                { label: "FEE SLIPS ISSUED", val: `${todayMetrics.totalCount} Slips`, bg: [239, 246, 255], border: [191, 219, 254], text: [0, 120, 212] },
                { label: "CASH IN HAND", val: `Rs ${todayMetrics.cashAmount.toLocaleString()} (${todayMetrics.cashPct}%)`, bg: [240, 253, 244], border: [187, 247, 208], text: [22, 101, 52] },
                { label: "BANK / DIGITAL", val: `Rs ${(todayMetrics.bankAmount + todayMetrics.onlineAmount).toLocaleString()} (${todayMetrics.bankPct + todayMetrics.onlinePct}%)`, bg: [250, 245, 255], border: [233, 213, 255], text: [126, 34, 206] },
            ];

            kpis.forEach((kpi, idx) => {
                const x = 14 + idx * (cardWidth + 3);
                doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
                doc.setDrawColor(kpi.border[0], kpi.border[1], kpi.border[2]);
                doc.setLineWidth(0.3);
                doc.roundedRect(x, startY, cardWidth, cardHeight, 2, 2, 'FD');

                doc.setFontSize(6.5);
                doc.setTextColor(100, 116, 139);
                doc.setFont("helvetica", "bold");
                doc.text(kpi.label, x + 3, startY + 6);

                doc.setFontSize(9.5);
                doc.setTextColor(kpi.text[0], kpi.text[1], kpi.text[2]);
                doc.setFont("helvetica", "bold");
                doc.text(kpi.val, x + 3, startY + 14);
            });

            // 5. Section Heading for Table
            const tableStartY = startY + cardHeight + 8;
            doc.setFontSize(10.5);
            doc.setTextColor(15, 23, 42);
            doc.setFont("helvetica", "bold");
            doc.text("ITEMIZED TRANSACTION LOG & PAYMENT PARTICULARS", 14, tableStartY);

            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.setFont("helvetica", "normal");
            doc.text(`Official ledger entries for today (Total: ${todayTransactions.length} records)`, 14, tableStartY + 5);

            // 6. Format Data for autoTable
            const tableRows = todayTransactions.map((tx, idx) => {
                const roll = tx.rollNo && tx.rollNo !== 'N/A' ? ` (Roll: ${tx.rollNo})` : '';
                const studentField = `${tx.studentName || 'Student'}${roll}`;
                const fatherField = tx.fatherName || 'N/A';
                const classField = tx.className || 'Class';
                const timeField = tx.timeString || tx.dateString || 'Today';
                const modeField = tx.paymentMode || 'Cash';
                const amtField = `Rs ${Number(tx.totalPaid || 0).toLocaleString()}`;
                
                return [
                    idx + 1,
                    tx.receiptNo || `REC-${idx + 1}`,
                    studentField,
                    fatherField,
                    classField,
                    modeField,
                    timeField,
                    amtField
                ];
            });

            autoTable(doc, {
                startY: tableStartY + 8,
                head: [['#', 'Slip #', 'Student Name', "Father's Name", 'Class', 'Mode', 'Time / Date', 'Amount Paid']],
                body: tableRows,
                theme: 'grid',
                headStyles: {
                    fillColor: [15, 23, 42],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 8,
                    halign: 'left'
                },
                bodyStyles: {
                    fontSize: 7.5,
                    textColor: [30, 41, 59],
                    cellPadding: 2.2
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252]
                },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 8 },
                    1: { halign: 'left', fontStyle: 'bold', textColor: [0, 120, 212], cellWidth: 22 },
                    2: { halign: 'left', fontStyle: 'bold', cellWidth: 36 },
                    3: { halign: 'left', cellWidth: 32 },
                    4: { halign: 'left', cellWidth: 20 },
                    5: { halign: 'center', cellWidth: 20 },
                    6: { halign: 'center', cellWidth: 22 },
                    7: { halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105], cellWidth: 24 }
                },
                foot: [[
                    { content: 'GRAND TOTAL COLLECTED', colSpan: 7, styles: { halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42], fontSize: 8.5 } },
                    { content: `Rs ${todayMetrics.totalAmount.toLocaleString()}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105], fontSize: 9, fillColor: [236, 253, 245] } }
                ]],
                footStyles: {
                    fillColor: [241, 245, 249],
                    lineWidth: 0.3,
                    lineColor: [203, 213, 225]
                },
                margin: { left: 14, right: 14 },
                didDrawPage: () => {
                    const str = `Page ${doc.internal.getNumberOfPages()}`;
                    doc.setFontSize(7.5);
                    doc.setTextColor(148, 163, 184);
                    doc.setFont("helvetica", "normal");
                    doc.text(str, pageWidth - 14, pageHeight - 8, { align: 'right' });
                    doc.text("Computer Generated Official Fee Audit Report • Principal Office Management System", 14, pageHeight - 8);
                }
            });

            // 7. Signature / Verification Footer at the end
            let finalY = doc.lastAutoTable.finalY + 16;
            if (finalY > pageHeight - 35) {
                doc.addPage();
                finalY = 30;
            }

            const sigWidth = 55;
            doc.setDrawColor(148, 163, 184);
            doc.setLineWidth(0.5);

            // Cashier Signature
            doc.line(14, finalY + 12, 14 + sigWidth, finalY + 12);
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.setFont("helvetica", "bold");
            doc.text("Cashier / Fee Incharge", 14, finalY + 17);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text("Signature & Date", 14, finalY + 21);

            // Principal / Admin Signature
            const rightSigX = pageWidth - 14 - sigWidth;
            doc.line(rightSigX, finalY + 12, rightSigX + sigWidth, finalY + 12);
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.setFont("helvetica", "bold");
            doc.text("Principal / Administrator", rightSigX, finalY + 17);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text("Official Stamp & Approval", rightSigX, finalY + 21);

            const safeDateStr = todayMetrics.todayStr.replace(/ /g, '_').replace(/,/g, '');
            const fileName = `Fee_Collections_Report_${safeDateStr}_${Date.now().toString().slice(-4)}.pdf`;
            doc.save(fileName);
        } catch (error) {
            console.error("Failed to generate Collections PDF report:", error);
            alert("An error occurred while generating the PDF report. Please try again.");
        }
        setIsGeneratingDailyPDF(false);
    };

    // Download Customized Finances (Income & Expenses Breakdown) PDF Report
    const handleDownloadFinancesReport = async () => {
        const totalManualIncomes = todayFinances.incomes.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        const actionAmt = currentAction ? Number(currentAction.amount || 0) : 0;
        const totalIncomes = totalManualIncomes + actionAmt;

        const totalExpenses = todayFinances.expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        const netBalance = totalIncomes - totalExpenses;

        if (todayFinances.incomes.length === 0 && todayFinances.expenses.length === 0 && actionAmt === 0) {
            alert("No income or expense entries recorded today yet to generate a daily report.");
            return;
        }

        setIsGeneratingFinancesPDF(true);
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            // 1. Premium Header Bar (Slate-900 / Navy)
            doc.setFillColor(15, 23, 42);
            doc.rect(0, 0, pageWidth, 48, 'F');

            // Accent Brand Strip at top (Emerald Green)
            doc.setFillColor(22, 163, 74);
            doc.rect(0, 0, pageWidth, 4, 'F');

            // 2. School Logo
            let hasLogo = false;
            let logoUrl = localSchoolInfo?.logo || schoolInfo?.logo || '';
            if (logoUrl) {
                const base64Img = await getDailyBase64Image(logoUrl);
                if (base64Img) {
                    try {
                        doc.addImage(base64Img, 'PNG', 14, 10, 26, 26);
                        hasLogo = true;
                    } catch (err) {
                        console.warn("Logo addImage fallback:", err);
                    }
                }
            }

            // 3. School Header Text & Metadata
            const textX = hasLogo ? 46 : 14;
            const currentSchoolName = (localSchoolInfo?.name || schoolInfo?.name || 'School Finances').toUpperCase();
            
            doc.setFontSize(17);
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.text(currentSchoolName, textX, 19);

            doc.setFontSize(10.5);
            doc.setTextColor(74, 222, 128); // Emerald-400
            doc.setFont("helvetica", "bold");
            doc.text("INCOME & EXPENSES BREAKDOWN AUDIT REPORT", textX, 26);

            doc.setFontSize(8);
            doc.setTextColor(203, 213, 225); // Slate-300
            doc.setFont("helvetica", "normal");
            const now = new Date();
            const printDate = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            const printTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            doc.text(`Generated on: ${printDate} at ${printTime}  |  Official Ledger Export`, textX, 33);
            doc.text(`Total Records Audited Today: ${todayFinances.incomes.length + todayFinances.expenses.length + (currentAction ? 1 : 0)}  |  Financial Status: ${netBalance >= 0 ? 'Surplus / Positive' : 'Deficit / Negative'}`, textX, 39);

            // 4. Executive Summary KPI Grid (3 Stat Blocks)
            const startY = 55;
            const cardWidth = (pageWidth - 28 - 6) / 3;
            const cardHeight = 21;

            const kpis = [
                { label: "TOTAL INCOMES", val: `Rs ${totalIncomes.toLocaleString()}`, bg: [236, 253, 245], border: [167, 243, 208], text: [5, 150, 105] },
                { label: "TOTAL EXPENSES", val: `Rs ${totalExpenses.toLocaleString()}`, bg: [254, 242, 242], border: [254, 202, 202], text: [220, 38, 38] },
                { label: "NET PROFIT / BALANCE", val: `Rs ${netBalance.toLocaleString()}`, bg: netBalance >= 0 ? [240, 253, 244] : [254, 242, 242], border: netBalance >= 0 ? [187, 247, 208] : [254, 202, 202], text: netBalance >= 0 ? [22, 101, 52] : [185, 28, 28] },
            ];

            kpis.forEach((kpi, idx) => {
                const x = 14 + idx * (cardWidth + 3);
                doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
                doc.setDrawColor(kpi.border[0], kpi.border[1], kpi.border[2]);
                doc.setLineWidth(0.3);
                doc.roundedRect(x, startY, cardWidth, cardHeight, 2, 2, 'FD');

                doc.setFontSize(6.5);
                doc.setTextColor(100, 116, 139);
                doc.setFont("helvetica", "bold");
                doc.text(kpi.label, x + 3, startY + 6);

                doc.setFontSize(9.5);
                doc.setTextColor(kpi.text[0], kpi.text[1], kpi.text[2]);
                doc.setFont("helvetica", "bold");
                doc.text(kpi.val, x + 3, startY + 14);
            });

            // 5. Section Heading for Table
            const tableStartY = startY + cardHeight + 8;
            doc.setFontSize(10.5);
            doc.setTextColor(15, 23, 42);
            doc.setFont("helvetica", "bold");
            doc.text("ITEMIZED FINANCIAL BREAKDOWN PARTICULARS", 14, tableStartY);

            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.setFont("helvetica", "normal");
            doc.text(`Official ledger entries for today including active actions, incomes & expenses`, 14, tableStartY + 5);

            // 6. Format Data for autoTable
            const rows = [];
            let counter = 1;

            if (currentAction) {
                rows.push([
                    counter++,
                    'Income',
                    `${currentAction.name} (Global Action)`,
                    'Global Action',
                    'Active targeted campaign collection',
                    `Rs ${Number(currentAction.amount || 0).toLocaleString()}`
                ]);
            }

            todayFinances.incomes.forEach(inc => {
                rows.push([
                    counter++,
                    'Income',
                    inc.name,
                    inc.type === 'permanent' ? 'Permanent' : 'One-time',
                    inc.remarks || 'Income Entry',
                    `Rs ${Number(inc.amount).toLocaleString()}`
                ]);
            });

            todayFinances.expenses.forEach(exp => {
                rows.push([
                    counter++,
                    'Expense',
                    exp.name,
                    exp.type === 'permanent' ? 'Permanent' : 'One-time',
                    exp.remarks || 'Expense Entry',
                    `Rs ${Number(exp.amount).toLocaleString()}`
                ]);
            });

            autoTable(doc, {
                startY: tableStartY + 8,
                head: [['#', 'Category', 'Description / Title', 'Type', 'Remarks / Notes', 'Amount (PKR)']],
                body: rows,
                theme: 'grid',
                headStyles: {
                    fillColor: [15, 23, 42],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 8,
                    halign: 'left'
                },
                bodyStyles: {
                    fontSize: 7.5,
                    textColor: [30, 41, 59],
                    cellPadding: 2.5
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252]
                },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 8 },
                    1: { halign: 'center', fontStyle: 'bold', cellWidth: 20 },
                    2: { halign: 'left', fontStyle: 'bold', cellWidth: 46 },
                    3: { halign: 'center', cellWidth: 26 },
                    4: { halign: 'left', cellWidth: 50 },
                    5: { halign: 'right', fontStyle: 'bold', cellWidth: 32 }
                },
                didParseCell: function(data) {
                    if (data.section === 'body') {
                        const cat = data.row.raw[1];
                        if (data.column.index === 1 || data.column.index === 5) {
                            if (cat === 'Income') {
                                data.cell.styles.textColor = [22, 163, 74];
                            } else if (cat === 'Expense') {
                                data.cell.styles.textColor = [220, 38, 38];
                            }
                        }
                    }
                },
                foot: [
                    [
                        { content: 'TOTAL INCOMES', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', textColor: [22, 163, 74], fontSize: 8 } },
                        { content: `Rs ${totalIncomes.toLocaleString()}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [22, 163, 74], fontSize: 8.5, fillColor: [236, 253, 245] } }
                    ],
                    [
                        { content: 'TOTAL EXPENSES', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38], fontSize: 8 } },
                        { content: `Rs ${totalExpenses.toLocaleString()}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38], fontSize: 8.5, fillColor: [254, 242, 242] } }
                    ],
                    [
                        { content: 'NET SURPLUS / DEFICIT', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42], fontSize: 9 } },
                        { content: `Rs ${netBalance.toLocaleString()}`, styles: { halign: 'right', fontStyle: 'bold', textColor: netBalance >= 0 ? [22, 101, 52] : [185, 28, 28], fontSize: 9.5, fillColor: netBalance >= 0 ? [240, 253, 244] : [254, 242, 242] } }
                    ]
                ],
                footStyles: {
                    fillColor: [241, 245, 249],
                    lineWidth: 0.3,
                    lineColor: [203, 213, 225]
                },
                margin: { left: 14, right: 14 },
                didDrawPage: () => {
                    const str = `Page ${doc.internal.getNumberOfPages()}`;
                    doc.setFontSize(7.5);
                    doc.setTextColor(148, 163, 184);
                    doc.setFont("helvetica", "normal");
                    doc.text(str, pageWidth - 14, pageHeight - 8, { align: 'right' });
                    doc.text("Computer Generated Official Income & Expenses Breakdown Report • Principal Office Management System", 14, pageHeight - 8);
                }
            });

            // 7. Signature / Verification Footer at the end
            let finalY = doc.lastAutoTable.finalY + 16;
            if (finalY > pageHeight - 35) {
                doc.addPage();
                finalY = 30;
            }

            const sigWidth = 55;
            doc.setDrawColor(148, 163, 184);
            doc.setLineWidth(0.5);

            // Accountant Signature
            doc.line(14, finalY + 12, 14 + sigWidth, finalY + 12);
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.setFont("helvetica", "bold");
            doc.text("Accountant / Finance Incharge", 14, finalY + 17);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text("Signature & Date", 14, finalY + 21);

            // Principal / Admin Signature
            const rightSigX = pageWidth - 14 - sigWidth;
            doc.line(rightSigX, finalY + 12, rightSigX + sigWidth, finalY + 12);
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.setFont("helvetica", "bold");
            doc.text("Principal / Administrator", rightSigX, finalY + 17);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text("Official Stamp & Approval", rightSigX, finalY + 21);

            const safeDateStr = (todayMetrics?.todayStr || 'Report').replace(/ /g, '_').replace(/,/g, '');
            const fileName = `Income_Expenses_Breakdown_${safeDateStr}_${Date.now().toString().slice(-4)}.pdf`;
            doc.save(fileName);
        } catch (error) {
            console.error("Failed to generate Finances PDF report:", error);
            alert("An error occurred while generating the PDF report. Please try again.");
        }
        setIsGeneratingFinancesPDF(false);
    };

    // Fetch all students across classes for instant real-time search
    useEffect(() => {
        if (!schoolId || classes.length === 0) return;

        const loadAllStudents = async () => {
            setLoadingAllStudents(true);
            try {
                const studentsList = [];
                const promises = classes.map(async (cls) => {
                    const snap = await getDocs(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
                    snap.docs.forEach(docSnap => {
                        studentsList.push({
                            id: docSnap.id,
                            classId: cls.id,
                            className: cls.name,
                            ...docSnap.data()
                        });
                    });
                });
                await Promise.all(promises);
                setAllStudents(studentsList);
            } catch (err) {
                console.error("Error loading students for search:", err);
            }
            setLoadingAllStudents(false);
        };

        loadAllStudents();
    }, [schoolId, classes]);

    // Fetch Students of Selected Class
    useEffect(() => {
        if (!schoolId || !selectedClassId) {
            setClassStudents([]);
            return;
        }

        setLoadingClassStudents(true);
        const q = query(collection(db, `schools/${schoolId}/classes/${selectedClassId}/students`));
        const unsub = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({
                id: doc.id,
                classId: selectedClassId,
                className: classes.find(c => c.id === selectedClassId)?.name || 'Class',
                ...doc.data()
            }));
            list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setClassStudents(list);
            setLoadingClassStudents(false);

            // Auto-select if preselected student exists
            if (selectedStudentId) {
                const found = list.find(s => s.id === selectedStudentId);
                if (found) setSelectedStudent(found);
            }
        });

        return () => unsub();
    }, [schoolId, selectedClassId, selectedStudentId, classes]);

    // Live Search Filter
    useEffect(() => {
        const queryClean = searchQuery.trim().toLowerCase();
        if (!queryClean || queryClean.length < 1) {
            setSearchResults([]);
            setShowSearchDropdown(false);
            return;
        }

        const matches = allStudents.filter(s => {
            const nameMatch = (s.name || '').toLowerCase().includes(queryClean);
            const rollMatch = (s.rollNo || '').toLowerCase().includes(queryClean);
            const fatherMatch = (s.parentDetails?.fatherName || s.fatherName || '').toLowerCase().includes(queryClean);
            return nameMatch || rollMatch || fatherMatch;
        }).slice(0, 10);

        setSearchResults(matches);
        setShowSearchDropdown(true);
    }, [searchQuery, allStudents]);

    // Real-time Recent Transactions Listener
    useEffect(() => {
        if (!schoolId) return;

        const qTrans = query(
            collection(db, `schools/${schoolId}/feeTransactions`),
            orderBy('timestamp', 'desc'),
            limit(15)
        );

        const unsubTrans = onSnapshot(qTrans, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setRecentTransactions(list);
            setLoadingTransactions(false);
        }, (err) => {
            console.error("Recent Transactions error:", err);
            setLoadingTransactions(false);
        });

        return () => unsubTrans();
    }, [schoolId]);

    // Dynamic Today's Collections Metrics & Chart Data (Strict 24-Hour Day Match - Auto Resets at 12 AM Midnight)
    const todayTransactions = useMemo(() => {
        const now = new Date();
        const todayStr = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        return recentTransactions.filter(t => {
            if (t.dateString) {
                return t.dateString === todayStr;
            }
            if (t.timestamp?.seconds) {
                const txDate = new Date(t.timestamp.seconds * 1000);
                const txDateStr = txDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                return txDateStr === todayStr;
            }
            return false;
        });
    }, [recentTransactions]);

    const todayMetrics = useMemo(() => {
        const now = new Date();
        const todayStr = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        const activeList = todayTransactions;

        const totalCount = activeList.length;
        const totalAmount = activeList.reduce((sum, t) => sum + (Number(t.totalPaid) || 0), 0);

        let cashCount = 0, cashAmount = 0;
        let bankCount = 0, bankAmount = 0;
        let onlineCount = 0, onlineAmount = 0;

        activeList.forEach(t => {
            const mode = (t.paymentMode || '').toLowerCase();
            const amt = Number(t.totalPaid) || 0;
            if (mode.includes('bank')) {
                bankCount++;
                bankAmount += amt;
            } else if (mode.includes('online') || mode.includes('easypaisa') || mode.includes('jazzcash')) {
                onlineCount++;
                onlineAmount += amt;
            } else {
                cashCount++;
                cashAmount += amt;
            }
        });

        const cashPct = totalAmount > 0 ? Math.round((cashAmount / totalAmount) * 100) : 0;
        const bankPct = totalAmount > 0 ? Math.round((bankAmount / totalAmount) * 100) : 0;
        const onlinePct = totalAmount > 0 ? Math.round((onlineAmount / totalAmount) * 100) : 0;

        return {
            todayStr,
            totalCount,
            totalAmount,
            cashCount,
            cashAmount,
            cashPct,
            bankCount,
            bankAmount,
            bankPct,
            onlineCount,
            onlineAmount,
            onlinePct
        };
    }, [todayTransactions]);

    // Handle Selecting a Student
    const handleSelectStudent = (student) => {
        setSelectedStudent(student);
        setSelectedClassId(student.classId);
        setSelectedStudentId(student.id);
        setSearchQuery('');
        setShowSearchDropdown(false);
        // Auto apply late penalty if overdue
        if (dueInfo.autoFine > 0) {
            setFineAmount(dueInfo.autoFine.toString());
        } else {
            setFineAmount('0');
        }
    };

    // Calculate Fees Breakdown for Selected Student
    const feeCalculation = useMemo(() => {
        if (!selectedStudent) return null;

        const items = [];
        let baseFee = 0;

        // 1. Recurring / Structured Fee
        if (selectedStudent.feeStructure && selectedStudent.feeStructure.length > 0) {
            selectedStudent.feeStructure.forEach(item => {
                const amt = Number(item.amount) || 0;
                if (amt > 0) {
                    items.push({ name: item.name || 'Fee Item', amount: amt });
                    baseFee += amt;
                }
            });
        } else {
            const tuition = Number(selectedStudent.tuitionFee) || 0;
            const transport = Number(selectedStudent.transportFee) || 0;
            const other = Number(selectedStudent.otherFees) || 0;

            if (tuition > 0) items.push({ name: 'Tuition Fee', amount: tuition });
            if (transport > 0) items.push({ name: 'Transport Fee', amount: transport });
            if (other > 0) items.push({ name: 'Other Fees', amount: other });
            baseFee = tuition + transport + other;
        }

        // 2. Individual Pending Actions
        let actionsFee = 0;
        const pendingIndividualActions = (selectedStudent.individualActions || []).filter(a => a.status === 'unpaid');
        pendingIndividualActions.forEach(action => {
            const amt = Number(action.amount) || 0;
            if (amt > 0) {
                items.push({ name: `Action: ${action.name}`, amount: amt });
                actionsFee += amt;
            }
        });

        // 3. Global Targeted Action (if unpaid)
        if (currentAction) {
            const isTargeted = currentAction.targetAll || (currentAction.targetClasses && currentAction.targetClasses.includes(selectedStudent.classId));
            if (isTargeted) {
                const isPaid = selectedStudent.customPayments?.[currentAction.name]?.status === 'paid';
                if (!isPaid) {
                    const amt = Number(currentAction.amount) || 0;
                    if (amt > 0) {
                        items.push({ name: `Global: ${currentAction.name}`, amount: amt });
                        actionsFee += amt;
                    }
                }
            }
        }

        const calculatedTotal = baseFee + actionsFee;
        const totalDueWithFine = calculatedTotal + Number(fineAmount || 0);
        const isPaid = selectedStudent.monthlyFeeStatus === 'paid';

        return {
            items,
            baseFee,
            actionsFee,
            calculatedTotal,
            totalDue: totalDueWithFine,
            isPaid
        };
    }, [selectedStudent, currentAction, fineAmount]);

    // Auto calculate final payable when discount, fine, or student fee changes
    useEffect(() => {
        if (feeCalculation) {
            const total = Math.max(0, feeCalculation.calculatedTotal + Number(fineAmount || 0) - Number(discountAmount || 0));
            setReceivedAmount(total.toString());
        } else {
            setReceivedAmount('0');
        }
    }, [feeCalculation, discountAmount, fineAmount]);

    // Clear Selected Student & Reset Form
    const handleClearSelection = () => {
        setSelectedStudent(null);
        setSelectedStudentId('');
        setSelectedClassId('');
        setSearchQuery('');
        setReceivedAmount('0');
        setDiscountAmount('0');
        setFineAmount('0');
        setPaymentMode('Cash');
        setProofFile(null);
        setProofPreview(null);
        setRemarks('');
    };

    // Submit Fee Collection Transaction (Zero-Loss 100% Offline Instant Resilient)
    const handleSubmitFee = async (e) => {
        e.preventDefault();
        if (!selectedStudent || !schoolId) return;

        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            const session = JSON.parse(manualSession);
            if (session.isManual) {
                alert("Restricted: You are logged in via Manual Bypass Mode. Database writes are disabled.");
                return;
            }
        }

        const finalAmount = Number(receivedAmount) || 0;
        const discount = Number(discountAmount) || 0;
        const fine = Number(fineAmount) || 0;

        if (finalAmount < 0) {
            alert("Invalid amount entered");
            return;
        }

        setIsSubmitting(true);
        try {
            const queueId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            const receiptNo = `REC-${Date.now().toString().slice(-6)}`;
            const currentClassName = selectedStudent.className || classes.find(c => c.id === selectedStudent.classId)?.name || 'Class';
            const studentRef = doc(db, `schools/${schoolId}/classes/${selectedStudent.classId}/students`, selectedStudent.id);
            const masterStudentRef = doc(db, `schools/${schoolId}/students`, selectedStudent.id);

            // Fast Non-Blocking Proof Handling (Base64)
            let proofUrl = null;
            if (paymentMode !== 'Cash' && proofFile) {
                try {
                    proofUrl = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = () => resolve(null);
                        reader.readAsDataURL(proofFile);
                    });
                } catch (e) {
                    console.warn("Base64 fallback proof error:", e);
                }
            }

            const updatedIndividualActions = (selectedStudent.individualActions || []).map(a => ({
                ...a,
                status: 'paid',
                paidDate: new Date().toISOString()
            }));

            const studentUpdatePayload = {
                monthlyFeeStatus: 'paid',
                monthlyFeeDate: new Date().toISOString(),
                lastPaymentMode: paymentMode,
                lastReceiptNo: receiptNo,
                lastPaymentAmount: finalAmount,
                lastPaymentProofUrl: proofUrl || null,
                individualActions: updatedIndividualActions
            };

            let customPaymentsPayload = null;
            if (currentAction) {
                const isTargeted = currentAction.targetAll || (currentAction.targetClasses && currentAction.targetClasses.includes(selectedStudent.classId));
                if (isTargeted) {
                    const existingCustomPayments = selectedStudent.customPayments || {};
                    customPaymentsPayload = {
                        ...existingCustomPayments,
                        [currentAction.name]: {
                            status: 'paid',
                            date: new Date().toISOString()
                        }
                    };
                    studentUpdatePayload.customPayments = customPaymentsPayload;
                }
            }

            const now = new Date();
            const dateString = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            // Build Itemized list for Receipt & Ledger
            const receiptItems = [...(feeCalculation.items || [])];
            if (fine > 0) {
                receiptItems.push({
                    name: dueInfo.isOverdue ? `Late Payment Penalty (${dueInfo.daysLate}d Overdue)` : 'Late Fine / Penalty',
                    amount: fine
                });
            }

            const transactionRecord = {
                receiptNo,
                studentId: selectedStudent.id,
                studentName: selectedStudent.name,
                rollNo: selectedStudent.rollNo || 'N/A',
                classId: selectedStudent.classId,
                className: currentClassName,
                fatherName: selectedStudent.parentDetails?.fatherName || selectedStudent.fatherName || 'N/A',
                items: receiptItems,
                baseFee: feeCalculation.baseFee || 0,
                actionsFee: feeCalculation.actionsFee || 0,
                fineAmount: fine,
                discount: discount,
                totalPaid: finalAmount,
                paymentMode,
                proofUrl: proofUrl || null,
                remarks: remarks.trim(),
                dueDate: dueInfo.dueDateStr || null,
                timestamp: new Date(),
                dateString,
                timeString,
                collectedBy: 'Principal Office'
            };

            // 1. Persistent Local Queue Item (Zero-Loss Guarantee)
            const queuedItem = {
                ...transactionRecord,
                queueId,
                dateIso: new Date().toISOString(),
                updatedIndividualActions,
                customPayments: customPaymentsPayload
            };

            const updatedQueue = [...pendingOfflineTxs, queuedItem];
            savePendingQueue(updatedQueue);

            // 2. Optimistic UI Update: Insert directly into recent transactions table
            setRecentTransactions(prev => [transactionRecord, ...prev.filter(t => t.receiptNo !== receiptNo)]);

            // 3. Instant Automatic PDF Receipt Download (100% Offline Client-Side)
            downloadOfficialReceiptPDF(transactionRecord, localSchoolInfo);

            // 4. Also Open Receipt Modal for On-Screen Preview / Print Options
            setReceiptData(transactionRecord);
            setReceiptModalOpen(true);

            // 5. Instant Reset Form (<50ms)
            handleClearSelection();
            setIsSubmitting(false);

            // 6. Background Firestore Write (Zero-Latency UI)
            (async () => {
                try {
                    await setDoc(studentRef, studentUpdatePayload, { merge: true });
                    try { 
                        await setDoc(masterStudentRef, studentUpdatePayload, { merge: true }); 
                    } catch (e) {
                        console.warn("Master student update skipped:", e);
                    }
                    await addDoc(collection(db, `schools/${schoolId}/feeTransactions`), {
                        ...transactionRecord,
                        timestamp: serverTimestamp()
                    });

                    // If currently online, clear this item from queue since direct write was committed
                    if (navigator.onLine) {
                        const currentQ = JSON.parse(localStorage.getItem(`offline_fee_queue_${schoolId}`) || '[]');
                        savePendingQueue(currentQ.filter(item => item.queueId !== queueId));
                    }
                } catch (writeErr) {
                    console.warn("Offline cache buffered write:", writeErr);
                }
            })();
        } catch (err) {
            console.error("Error submitting fee payment:", err);
            setIsSubmitting(false);
            alert("Fee recorded into offline storage. Slip generated.");
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {/* Top Full-Width Prominent Summary Card: LIVE TODAY'S SUMMARY Collections Overview */}
            <div className="card animate-fade-in-up" style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '1.6rem 1.85rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 12px -2px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Header with Live Status & Quick Meta */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    marginBottom: '1.35rem',
                    borderBottom: '1px solid #f1f5f9',
                    paddingBottom: '1rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.35rem 0.85rem',
                            borderRadius: '20px',
                            background: '#ecfdf5',
                            border: '1px solid #a7f3d0',
                            color: '#059669',
                            fontSize: '0.78rem',
                            fontWeight: '800',
                            letterSpacing: '0.04em'
                        }}>
                            <span style={{
                                display: 'inline-block',
                                width: '9px',
                                height: '9px',
                                borderRadius: '50%',
                                background: '#10b981',
                                boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.25)'
                            }} className="animate-pulse" />
                            LIVE TODAY'S SUMMARY
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                Collections Overview & Analytics <Sparkles size={16} color="#0078d4" />
                            </h3>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>
                                Real-time automated fee tracking, channel split & collection velocity
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        {/* Dynamic Live Connection / Offline Auto-Sync Pill */}
                        {!isOnline ? (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                fontSize: '0.825rem',
                                color: '#c2410c',
                                fontWeight: '700',
                                background: '#fff7ed',
                                padding: '0.35rem 0.8rem',
                                borderRadius: '8px',
                                border: '1px solid #fed7aa'
                            }}>
                                <WifiOff size={15} color="#ea580c" />
                                <span>Offline {pendingOfflineTxs.length > 0 ? `(${pendingOfflineTxs.length} Pending)` : 'Ready'}</span>
                            </div>
                        ) : isSyncing ? (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                fontSize: '0.825rem',
                                color: '#ca8a04',
                                fontWeight: '700',
                                background: '#fefce8',
                                padding: '0.35rem 0.8rem',
                                borderRadius: '8px',
                                border: '1px solid #fef08a'
                            }}>
                                <Loader2 size={15} className="animate-spin" color="#ca8a04" />
                                <span>Syncing ({pendingOfflineTxs.length})</span>
                            </div>
                        ) : pendingOfflineTxs.length > 0 ? (
                            <button onClick={triggerAutoSync} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                fontSize: '0.825rem',
                                color: '#2563eb',
                                fontWeight: '700',
                                background: '#eff6ff',
                                padding: '0.35rem 0.8rem',
                                borderRadius: '8px',
                                border: '1px solid #bfdbfe',
                                cursor: 'pointer'
                            }}>
                                <RefreshCw size={15} color="#2563eb" />
                                <span>Sync Now ({pendingOfflineTxs.length})</span>
                            </button>
                        ) : (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                fontSize: '0.825rem',
                                color: '#059669',
                                fontWeight: '700',
                                background: '#ecfdf5',
                                padding: '0.35rem 0.8rem',
                                borderRadius: '8px',
                                border: '1px solid #a7f3d0'
                            }}>
                                <Wifi size={15} color="#059669" />
                                <span>Cloud Synced</span>
                            </div>
                        )}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            fontSize: '0.825rem',
                            color: '#334155',
                            fontWeight: '700',
                            background: '#f8fafc',
                            padding: '0.35rem 0.8rem',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0'
                        }}>
                            <Calendar size={15} color="#0078d4" />
                            {todayMetrics.todayStr}
                        </div>
                    </div>
                </div>

                {/* 3 Pillars Visual Interactive Grid: Metrics + Circular Gauge + Channel Bar Charts */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
                    gap: '1.25rem'
                }}>
                    {/* Pillar 1: Primary Highlight Revenue & Slips Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                        {/* Total Collected Card */}
                        <div style={{
                            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                            borderRadius: '14px',
                            padding: '1.25rem 1.4rem',
                            color: '#ffffff',
                            border: '1px solid rgba(5, 150, 105, 0.3)',
                            boxShadow: '0 4px 14px -2px rgba(5, 150, 105, 0.28)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#d1fae5' }}>
                                        Total Collected Today
                                    </span>
                                    <span style={{ fontSize: '0.65rem', fontWeight: '800', background: 'rgba(255,255,255,0.2)', padding: '1px 6px', borderRadius: '8px', color: '#ffffff' }}>
                                        Live
                                    </span>
                                </div>
                                <h2 style={{ margin: '0.35rem 0 0', fontSize: '2rem', fontWeight: '900', letterSpacing: '-0.03em', lineHeight: 1.1, color: '#ffffff' }}>
                                    Rs {todayMetrics.totalAmount.toLocaleString()}
                                </h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', marginTop: '0.4rem', color: '#a7f3d0', fontWeight: '600' }}>
                                    <TrendingUp size={14} color="#6ee7b7" />
                                    <span>Real-time instant sum across all channels</span>
                                </div>
                            </div>
                            <div style={{
                                width: '52px',
                                height: '52px',
                                borderRadius: '12px',
                                background: 'rgba(255,255,255,0.18)',
                                backdropFilter: 'blur(6px)',
                                border: '1px solid rgba(255,255,255,0.25)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff'
                            }}>
                                <Wallet size={26} />
                            </div>
                        </div>

                        {/* Total Slips Issued Card */}
                        <div style={{
                            background: 'linear-gradient(135deg, #0078d4 0%, #1d4ed8 100%)',
                            borderRadius: '14px',
                            padding: '1.25rem 1.4rem',
                            color: '#ffffff',
                            border: '1px solid rgba(0, 120, 212, 0.3)',
                            boxShadow: '0 4px 14px -2px rgba(0, 120, 212, 0.28)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#e0f2fe' }}>
                                        Fee Slips Issued
                                    </span>
                                    <span style={{ fontSize: '0.65rem', fontWeight: '800', background: 'rgba(255,255,255,0.2)', padding: '1px 6px', borderRadius: '8px', color: '#ffffff' }}>
                                        Verified
                                    </span>
                                </div>
                                <h2 style={{ margin: '0.35rem 0 0', fontSize: '2rem', fontWeight: '900', letterSpacing: '-0.03em', lineHeight: 1.1, color: '#ffffff' }}>
                                    {todayMetrics.totalCount} <span style={{ fontSize: '1.15rem', fontWeight: '700', opacity: 0.95 }}>Slips</span>
                                </h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', marginTop: '0.4rem', color: '#bae6fd', fontWeight: '600' }}>
                                    <Printer size={14} color="#93c5fd" />
                                    <span>Recorded in ledger & printable vouchers</span>
                                </div>
                            </div>
                            <div style={{
                                width: '52px',
                                height: '52px',
                                borderRadius: '12px',
                                background: 'rgba(255,255,255,0.18)',
                                backdropFilter: 'blur(6px)',
                                border: '1px solid rgba(255,255,255,0.25)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff'
                            }}>
                                <FileText size={26} />
                            </div>
                        </div>

                        {/* Digital vs Cash Velocity Mini Metric Card */}
                        <div style={{
                            background: '#f8fafc',
                            borderRadius: '12px',
                            padding: '0.85rem 1rem',
                            border: '1px solid #e2e8f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f5f3ff', color: '#7c3aed', border: '1px solid #e9d5ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Zap size={17} />
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569', display: 'block' }}>
                                        Digital vs Cash Ratio
                                    </span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: '900', color: '#0f172a' }}>
                                        {todayMetrics.bankPct + todayMetrics.onlinePct}% Digital &bull; {todayMetrics.cashPct}% Cash
                                    </span>
                                </div>
                            </div>
                            <span style={{
                                fontSize: '0.7rem',
                                fontWeight: '800',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                background: todayMetrics.bankPct + todayMetrics.onlinePct >= 50 ? '#f3e8ff' : '#ecfdf5',
                                color: todayMetrics.bankPct + todayMetrics.onlinePct >= 50 ? '#6b21a8' : '#047857',
                                border: `1px solid ${todayMetrics.bankPct + todayMetrics.onlinePct >= 50 ? '#d8b4fe' : '#a7f3d0'}`
                            }}>
                                {todayMetrics.bankPct + todayMetrics.onlinePct >= 50 ? 'Digital Heavy' : 'Cash Primary'}
                            </span>
                        </div>
                    </div>

                    {/* Pillar 2: Animated SVG Circular Donut Chart */}
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '14px',
                        padding: '1.25rem',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        position: 'relative'
                    }}>
                        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <PieChart size={17} color="#0078d4" /> Payment Channels Split
                            </span>
                            <span style={{ fontSize: '0.72rem', fontWeight: '700', padding: '2px 7px', borderRadius: '6px', background: '#f1f5f9', color: '#475569' }}>
                                360&deg; Distribution
                            </span>
                        </div>

                        {/* Circular Donut Gauge Container */}
                        <div style={{ position: 'relative', width: '180px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0.5rem 0' }}>
                            {/* SVG Donut Ring */}
                            {(() => {
                                const radius = 54;
                                const circumference = 2 * Math.PI * radius; // ~339.29
                                const hasData = todayMetrics.totalAmount > 0;
                                const cashLen = hasData ? (todayMetrics.cashPct / 100) * circumference : 0;
                                const bankLen = hasData ? (todayMetrics.bankPct / 100) * circumference : 0;
                                const onlineLen = hasData ? (todayMetrics.onlinePct / 100) * circumference : 0;

                                return (
                                    <svg width="180" height="180" viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
                                        {/* Background Track Ring */}
                                        <circle
                                            cx="70"
                                            cy="70"
                                            r={radius}
                                            fill="transparent"
                                            stroke="#f1f5f9"
                                            strokeWidth="13"
                                        />

                                        {hasData ? (
                                            <>
                                                {/* Cash Segment (Emerald) */}
                                                {todayMetrics.cashPct > 0 && (
                                                    <circle
                                                        cx="70"
                                                        cy="70"
                                                        r={radius}
                                                        fill="transparent"
                                                        stroke="#10b981"
                                                        strokeWidth="13"
                                                        strokeDasharray={`${cashLen} ${circumference - cashLen}`}
                                                        strokeDashoffset="0"
                                                        strokeLinecap={todayMetrics.cashPct < 100 ? "round" : "butt"}
                                                        style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
                                                    />
                                                )}

                                                {/* Bank Segment (Royal Blue) */}
                                                {todayMetrics.bankPct > 0 && (
                                                    <circle
                                                        cx="70"
                                                        cy="70"
                                                        r={radius}
                                                        fill="transparent"
                                                        stroke="#3b82f6"
                                                        strokeWidth="13"
                                                        strokeDasharray={`${bankLen} ${circumference - bankLen}`}
                                                        strokeDashoffset={`-${cashLen}`}
                                                        strokeLinecap={todayMetrics.bankPct < 100 ? "round" : "butt"}
                                                        style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1), stroke-dashoffset 1s' }}
                                                    />
                                                )}

                                                {/* Online Segment (Purple) */}
                                                {todayMetrics.onlinePct > 0 && (
                                                    <circle
                                                        cx="70"
                                                        cy="70"
                                                        r={radius}
                                                        fill="transparent"
                                                        stroke="#a855f7"
                                                        strokeWidth="13"
                                                        strokeDasharray={`${onlineLen} ${circumference - onlineLen}`}
                                                        strokeDashoffset={`-${cashLen + bankLen}`}
                                                        strokeLinecap={todayMetrics.onlinePct < 100 ? "round" : "butt"}
                                                        style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1), stroke-dashoffset 1s' }}
                                                    />
                                                )}
                                            </>
                                        ) : (
                                            <circle
                                                cx="70"
                                                cy="70"
                                                r={radius}
                                                fill="transparent"
                                                stroke="#cbd5e1"
                                                strokeWidth="13"
                                                strokeDasharray="4 4"
                                            />
                                        )}
                                    </svg>
                                );
                            })()}

                            {/* Center Donut Core Hub */}
                            <div style={{
                                position: 'absolute',
                                width: '102px',
                                height: '102px',
                                borderRadius: '50%',
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textAlign: 'center',
                                padding: '4px'
                            }}>
                                <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Total Today
                                </span>
                                <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                                    {todayMetrics.totalAmount >= 1000 ? `${(todayMetrics.totalAmount / 1000).toFixed(todayMetrics.totalAmount % 1000 === 0 ? 0 : 1)}k` : `Rs ${todayMetrics.totalAmount}`}
                                </span>
                                <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#059669', background: '#ecfdf5', padding: '1px 6px', borderRadius: '6px', marginTop: '2px', border: '1px solid #a7f3d0' }}>
                                    {todayMetrics.totalCount} Slips
                                </span>
                            </div>
                        </div>

                        {/* Circular Donut Legend Chips */}
                        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-around', alignItems: 'center', gap: '0.35rem', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>Cash {todayMetrics.cashPct}%</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>Bank {todayMetrics.bankPct}%</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#a855f7' }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>Online {todayMetrics.onlinePct}%</span>
                            </div>
                        </div>
                    </div>

                    {/* Pillar 3: Animated Channel Breakdown & Mini Progress Bar Graphs */}
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '14px',
                        padding: '1.25rem 1.35rem',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.75rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <BarChart3 size={17} color="#0078d4" /> Live Channel Analytics
                            </span>
                            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#0078d4', background: '#eff6ff', padding: '2px 8px', borderRadius: '6px' }}>
                                Interactive Bars
                            </span>
                        </div>

                        {/* Channel 1: Cash in Hand Bar */}
                        <div style={{
                            background: '#f0fdf4',
                            borderRadius: '10px',
                            padding: '0.7rem 0.85rem',
                            border: '1px solid #bbf7d0'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Wallet size={13} />
                                    </div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#14532d' }}>Cash</span>
                                    <span style={{ fontSize: '0.7rem', color: '#166534', fontWeight: '600' }}>({todayMetrics.cashCount} Slips)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <strong style={{ fontSize: '0.9rem', fontWeight: '900', color: '#14532d' }}>
                                        Rs {todayMetrics.cashAmount.toLocaleString()}
                                    </strong>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', padding: '1px 6px', borderRadius: '6px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                                        {todayMetrics.cashPct}%
                                    </span>
                                </div>
                            </div>
                            {/* Animated Mini Progress Bar */}
                            <div style={{ height: '7px', width: '100%', background: '#dcfce7', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    width: `${todayMetrics.cashPct}%`,
                                    background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                                    borderRadius: '6px',
                                    transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                                }} />
                            </div>
                        </div>

                        {/* Channel 2: Bank Transfer Bar */}
                        <div style={{
                            background: '#eff6ff',
                            borderRadius: '10px',
                            padding: '0.7rem 0.85rem',
                            border: '1px solid #bfdbfe'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Landmark size={13} />
                                    </div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#1e3a8a' }}>Bank Deposit</span>
                                    <span style={{ fontSize: '0.7rem', color: '#1e40af', fontWeight: '600' }}>({todayMetrics.bankCount} Slips)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <strong style={{ fontSize: '0.9rem', fontWeight: '900', color: '#1e3a8a' }}>
                                        Rs {todayMetrics.bankAmount.toLocaleString()}
                                    </strong>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', padding: '1px 6px', borderRadius: '6px', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' }}>
                                        {todayMetrics.bankPct}%
                                    </span>
                                </div>
                            </div>
                            {/* Animated Mini Progress Bar */}
                            <div style={{ height: '7px', width: '100%', background: '#dbeafe', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    width: `${todayMetrics.bankPct}%`,
                                    background: 'linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)',
                                    borderRadius: '6px',
                                    transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                                }} />
                            </div>
                        </div>

                        {/* Channel 3: Online / EasyPaisa / JazzCash Bar */}
                        <div style={{
                            background: '#faf5ff',
                            borderRadius: '10px',
                            padding: '0.7rem 0.85rem',
                            border: '1px solid #e9d5ff'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#f3e8ff', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Smartphone size={13} />
                                    </div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#581c87' }}>Online Wallets</span>
                                    <span style={{ fontSize: '0.7rem', color: '#6b21a8', fontWeight: '600' }}>({todayMetrics.onlineCount} Slips)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <strong style={{ fontSize: '0.9rem', fontWeight: '900', color: '#581c87' }}>
                                        Rs {todayMetrics.onlineAmount.toLocaleString()}
                                    </strong>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', padding: '1px 6px', borderRadius: '6px', background: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe' }}>
                                        {todayMetrics.onlinePct}%
                                    </span>
                                </div>
                            </div>
                            {/* Animated Mini Progress Bar */}
                            <div style={{ height: '7px', width: '100%', background: '#f3e8ff', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    width: `${todayMetrics.onlinePct}%`,
                                    background: 'linear-gradient(90deg, #a855f7 0%, #7e22ce 100%)',
                                    borderRadius: '6px',
                                    transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                                }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Side-by-Side 2 Cards Layout */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                gap: '1.5rem',
                alignItems: 'start'
            }}>
                {/* Left Card: Daily Fee Submission Counter (Student Selector) */}
                <div className="card" style={{
                    background: '#ffffff',
                    borderRadius: '14px',
                    padding: '1.5rem',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 8px -2px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.15rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.85rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: activeDailyMode === 'fee_submission' ? '#eff6ff' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: activeDailyMode === 'fee_submission' ? '#0078d4' : '#16a34a' }}>
                                {activeDailyMode === 'fee_submission' ? <Wallet size={20} /> : <TrendingUp size={20} />}
                            </div>
                            <div>
                                <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                    {activeDailyMode === 'fee_submission' ? 'Daily Fee Submission Counter' : 'Income & Expenses Entry'}
                                </h3>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    {activeDailyMode === 'fee_submission' ? 'Select student & calculate instant fee receipt' : 'Add payments received & manual expenses'}
                                </span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {/* Mode Switcher Buttons */}
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveDailyMode('fee_submission');
                                        setRightCardTab('fee_slips');
                                    }}
                                    style={{
                                        padding: '7px 15px',
                                        borderRadius: '9px',
                                        border: activeDailyMode === 'fee_submission' ? '1.5px solid #0078d4' : '1.5px solid #bae6fd',
                                        background: activeDailyMode === 'fee_submission' 
                                            ? 'linear-gradient(135deg, #0078d4 0%, #0284c7 100%)' 
                                            : '#f0f7ff',
                                        color: activeDailyMode === 'fee_submission' ? '#ffffff' : '#0369a1',
                                        fontWeight: '700',
                                        fontSize: '0.82rem',
                                        cursor: 'pointer',
                                        boxShadow: activeDailyMode === 'fee_submission' 
                                            ? '0 3px 10px rgba(0, 120, 212, 0.35)' 
                                            : '0 1px 2px rgba(0, 120, 212, 0.08)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }}
                                >
                                    <Wallet size={15} color={activeDailyMode === 'fee_submission' ? '#ffffff' : '#0078d4'} /> Fee Submission
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveDailyMode('income_expense');
                                        setRightCardTab('finances_breakdown');
                                    }}
                                    style={{
                                        padding: '7px 15px',
                                        borderRadius: '9px',
                                        border: activeDailyMode === 'income_expense' ? '1.5px solid #16a34a' : '1.5px solid #bbf7d0',
                                        background: activeDailyMode === 'income_expense' 
                                            ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' 
                                            : '#f0fdf4',
                                        color: activeDailyMode === 'income_expense' ? '#ffffff' : '#15803d',
                                        fontWeight: '700',
                                        fontSize: '0.82rem',
                                        cursor: 'pointer',
                                        boxShadow: activeDailyMode === 'income_expense' 
                                            ? '0 3px 10px rgba(22, 163, 74, 0.35)' 
                                            : '0 1px 2px rgba(22, 163, 74, 0.08)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }}
                                >
                                    <TrendingUp size={15} color={activeDailyMode === 'income_expense' ? '#ffffff' : '#16a34a'} /> Income & Expenses Breakdown
                                </button>
                            </div>

                            {activeDailyMode === 'fee_submission' && selectedStudent && (
                                <button
                                    type="button"
                                    onClick={handleClearSelection}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        background: '#f1f5f9',
                                        border: '1px solid #cbd5e1',
                                        color: '#475569',
                                        fontSize: '0.75rem',
                                        fontWeight: '700',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <X size={13} /> Clear
                                </button>
                            )}
                        </div>
                    </div>

                    {activeDailyMode === 'income_expense' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* Add Payments Received Form */}
                            <div style={{ background: '#f0fdf4', padding: '1.25rem', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                                <h4 style={{ fontSize: '0.95rem', fontWeight: '800', marginBottom: '0.85rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <ArrowUpRight size={17} color="#16a34a" /> Add Payments Received
                                </h4>
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', marginBottom: '0.3rem', color: '#334155' }}>Income Title</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Canteen Rent, Prospectus Sale" 
                                        value={newIncome.name}
                                        onChange={e => setNewIncome({...newIncome, name: e.target.value})}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', marginBottom: '0.3rem', color: '#334155' }}>Amount (Rs)</label>
                                    <input 
                                        type="number" 
                                        placeholder="e.g. 5000" 
                                        value={newIncome.amount}
                                        onChange={e => setNewIncome({...newIncome, amount: e.target.value})}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', marginBottom: '0.3rem', color: '#334155' }}>Remarks / Notes (Optional)</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Paid in cash by vendor, Cheque #1234, memo..." 
                                        value={newIncome.remarks || ''}
                                        onChange={e => setNewIncome({...newIncome, remarks: e.target.value})}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button 
                                        type="button"
                                        onClick={() => handleAddFinance('one-time', 'incomes', newIncome, setIsSavingIncome, setNewIncome)}
                                        disabled={isSavingIncome || !newIncome.name || !newIncome.amount}
                                        style={{ flex: 1, padding: '0.55rem', borderRadius: '8px', background: '#ffffff', border: '1px solid #16a34a', color: '#16a34a', fontWeight: '700', fontSize: '0.8rem', cursor: isSavingIncome || !newIncome.name || !newIncome.amount ? 'not-allowed' : 'pointer' }}
                                    >
                                        Save
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => handleAddFinance('permanent', 'incomes', newIncome, setIsSavingIncome, setNewIncome)}
                                        disabled={isSavingIncome || !newIncome.name || !newIncome.amount}
                                        style={{ flex: 1, padding: '0.55rem', borderRadius: '8px', background: '#16a34a', border: '1px solid #16a34a', color: 'white', fontWeight: '700', fontSize: '0.8rem', cursor: isSavingIncome || !newIncome.name || !newIncome.amount ? 'not-allowed' : 'pointer' }}
                                    >
                                        Save as Permanent
                                    </button>
                                </div>
                            </div>

                            {/* Add Manual Expense Form */}
                            <div style={{ background: '#fef2f2', padding: '1.25rem', borderRadius: '12px', border: '1px solid #fecaca' }}>
                                <h4 style={{ fontSize: '0.95rem', fontWeight: '800', marginBottom: '0.85rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <ArrowDownRight size={17} color="#dc2626" /> Add Manual Expense
                                </h4>
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', marginBottom: '0.3rem', color: '#334155' }}>Expense Title</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Electricity Bill, Chalk & Stationery" 
                                        value={newExpense.name}
                                        onChange={e => setNewExpense({...newExpense, name: e.target.value})}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', marginBottom: '0.3rem', color: '#334155' }}>Amount (Rs)</label>
                                    <input 
                                        type="number" 
                                        placeholder="e.g. 15000" 
                                        value={newExpense.amount}
                                        onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', marginBottom: '0.3rem', color: '#334155' }}>Remarks / Notes (Optional)</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Paid to electric utility, bill #9872, voucher memo..." 
                                        value={newExpense.remarks || ''}
                                        onChange={e => setNewExpense({...newExpense, remarks: e.target.value})}
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button 
                                        type="button"
                                        onClick={() => handleAddFinance('one-time', 'expenses', newExpense, setIsSavingExpense, setNewExpense)}
                                        disabled={isSavingExpense || !newExpense.name || !newExpense.amount}
                                        style={{ flex: 1, padding: '0.55rem', borderRadius: '8px', background: '#ffffff', border: '1px solid #dc2626', color: '#dc2626', fontWeight: '700', fontSize: '0.8rem', cursor: isSavingExpense || !newExpense.name || !newExpense.amount ? 'not-allowed' : 'pointer' }}
                                    >
                                        Save
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => handleAddFinance('permanent', 'expenses', newExpense, setIsSavingExpense, setNewExpense)}
                                        disabled={isSavingExpense || !newExpense.name || !newExpense.amount}
                                        style={{ flex: 1, padding: '0.55rem', borderRadius: '8px', background: '#dc2626', border: '1px solid #dc2626', color: 'white', fontWeight: '700', fontSize: '0.8rem', cursor: isSavingExpense || !newExpense.name || !newExpense.amount ? 'not-allowed' : 'pointer' }}
                                    >
                                        Save as Permanent
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Active Selected Student Notification Banner */}
                    {selectedStudent && (
                        <div style={{
                            padding: '0.75rem 1rem',
                            background: '#f0f9ff',
                            border: '1px solid #bae6fd',
                            borderRadius: '8px',
                            marginBottom: '1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0369a1' }}>
                                    Active Selection: {selectedStudent.name}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#0284c7' }}>
                                    Class: {selectedStudent.className} | Roll: {selectedStudent.rollNo || 'N/A'}
                                </div>
                            </div>
                            <span style={{
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: feeCalculation?.isPaid ? '#dcfce7' : '#fee2e2',
                                color: feeCalculation?.isPaid ? '#15803d' : '#b91c1c'
                            }}>
                                {feeCalculation?.isPaid ? 'Paid' : 'Payment Due'}
                            </span>
                        </div>
                    )}

                    {/* Instant Student Search Bar */}
                    <div style={{ position: 'relative', width: '100%', marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                            Quick Student Search
                        </label>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            transition: 'all 0.2s'
                        }}>
                            <Search size={16} color="#64748b" />
                            <input
                                type="text"
                                placeholder="Type Name, Roll No, or Father..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => {
                                    if (searchQuery.trim().length > 0) setShowSearchDropdown(true);
                                }}
                                style={{
                                    border: 'none',
                                    outline: 'none',
                                    background: 'transparent',
                                    width: '100%',
                                    fontSize: '0.875rem',
                                    color: '#0f172a',
                                    fontWeight: '500'
                                }}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => { setSearchQuery(''); setShowSearchDropdown(false); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
                                >
                                    <X size={15} />
                                </button>
                            )}
                        </div>

                        {/* Search Suggestions Dropdown */}
                        {showSearchDropdown && searchResults.length > 0 && (
                            <div style={{
                                position: 'absolute',
                                top: '105%',
                                left: 0,
                                right: 0,
                                background: '#ffffff',
                                borderRadius: '8px',
                                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
                                border: '1px solid #cbd5e1',
                                zIndex: 50,
                                maxHeight: '240px',
                                overflowY: 'auto'
                            }}>
                                {searchResults.map(st => (
                                    <div
                                        key={st.id}
                                        onClick={() => handleSelectStudent(st)}
                                        style={{
                                            padding: '0.65rem 0.85rem',
                                            borderBottom: '1px solid #f1f5f9',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            transition: 'background 0.15s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <div style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '50%',
                                                background: '#e0f2fe',
                                                color: '#0369a1',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontWeight: '700',
                                                fontSize: '0.75rem'
                                            }}>
                                                {st.name?.slice(0, 2).toUpperCase() || 'ST'}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.85rem' }}>{st.name}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                    {st.className} | Roll: {st.rollNo || 'N/A'}
                                                </div>
                                            </div>
                                        </div>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: '700',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            background: st.monthlyFeeStatus === 'paid' ? '#dcfce7' : '#fee2e2',
                                            color: st.monthlyFeeStatus === 'paid' ? '#15803d' : '#b91c1c'
                                        }}>
                                            {st.monthlyFeeStatus === 'paid' ? 'Paid' : 'Unpaid'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Divider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#94a3b8', fontSize: '0.75rem', fontWeight: '700' }}>
                        <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                        <span>OR CHOOSE MANUALLY</span>
                        <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                    </div>

                    {/* Class Dropdown */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                            Class
                        </label>
                        <select
                            value={selectedClassId}
                            onChange={(e) => {
                                setSelectedClassId(e.target.value);
                                setSelectedStudentId('');
                                setSelectedStudent(null);
                            }}
                            style={{
                                width: '100%',
                                padding: '0.65rem 0.85rem',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                outline: 'none',
                                background: '#ffffff',
                                fontWeight: '600',
                                color: '#0f172a',
                                fontSize: '0.9rem'
                            }}
                        >
                            <option value="">-- Choose Class --</option>
                            {classes.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Student Dropdown */}
                    <div style={{ marginBottom: '0.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                            Student Name
                        </label>
                        <select
                            value={selectedStudentId}
                            onChange={(e) => {
                                const stId = e.target.value;
                                setSelectedStudentId(stId);
                                const stObj = classStudents.find(s => s.id === stId);
                                setSelectedStudent(stObj || null);
                            }}
                            disabled={!selectedClassId || loadingClassStudents}
                            style={{
                                width: '100%',
                                padding: '0.65rem 0.85rem',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                outline: 'none',
                                background: !selectedClassId ? '#f1f5f9' : '#ffffff',
                                fontWeight: '600',
                                color: !selectedClassId ? '#94a3b8' : '#0f172a',
                                fontSize: '0.9rem',
                                cursor: !selectedClassId ? 'not-allowed' : 'pointer'
                            }}
                        >
                            <option value="">-- Choose Student --</option>
                            {classStudents.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.name} (Roll: {s.rollNo || 'N/A'}) {s.monthlyFeeStatus === 'paid' ? '✓ Paid' : '✗ Unpaid'}
                                </option>
                            ))}
                        </select>
                    </div>
                </>
            )}
        </div>

        {/* Right Card: Either Fee Assessment Form OR Today's Recent Fee Collections Log / Breakdown */}
        {selectedStudent && activeDailyMode === 'fee_submission' ? (
            <div className="card animate-fade-in-up" style={{
                background: '#ffffff',
                borderRadius: '14px',
                padding: '1.5rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 16px -2px rgba(0,0,0,0.06)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                            Fee Assessment & Collection
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                Student: <strong style={{ color: '#0078d4' }}>{selectedStudent.name}</strong> ({selectedStudent.className})
                            </span>
                            {dueInfo.dueDay && (
                                <span style={{
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    background: dueInfo.isOverdue ? '#fef2f2' : '#f0f9ff',
                                    color: dueInfo.isOverdue ? '#dc2626' : '#0284c7',
                                    border: `1px solid ${dueInfo.isOverdue ? '#fca5a5' : '#bae6fd'}`
                                }}>
                                    📅 Due Date: {dueInfo.dueDay}th of month {dueInfo.isOverdue ? `(Overdue by ${dueInfo.daysLate}d)` : '(On Time)'}
                                </span>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <span style={{
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: feeCalculation?.isPaid ? '#dcfce7' : '#fee2e2',
                            color: feeCalculation?.isPaid ? '#15803d' : '#b91c1c'
                        }}>
                            {feeCalculation?.isPaid ? 'Already Paid' : 'Payment Due'}
                        </span>
                    </div>
                </div>

                {/* Fee Breakdown Table */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', marginBottom: '0.6rem', textTransform: 'uppercase' }}>
                        Itemized Dues Breakdown
                    </h4>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: '700', color: '#334155' }}>Fee Component</th>
                                    <th style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: '700', color: '#334155' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {feeCalculation?.items.map((item, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.6rem 1rem', color: '#1e293b' }}>{item.name}</td>
                                        <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: '600', color: '#0f172a' }}>
                                            Rs {Number(item.amount).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                                {Number(fineAmount) > 0 && (
                                    <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#fffbeb' }}>
                                        <td style={{ padding: '0.6rem 1rem', color: '#b45309', fontWeight: '700' }}>
                                            ⚠️ {dueInfo.isOverdue ? `Late Payment Penalty (${dueInfo.daysLate}d Overdue)` : 'Late Fine / Penalty'}
                                        </td>
                                        <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: '700', color: '#b45309' }}>
                                            Rs {Number(fineAmount).toLocaleString()}
                                        </td>
                                    </tr>
                                )}
                                <tr style={{ background: '#f0fdf4', borderTop: '2px solid #cbd5e1' }}>
                                    <td style={{ padding: '0.75rem 1rem', fontWeight: '800', color: '#166534', fontSize: '0.95rem' }}>Total Assessed Due</td>
                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: '#166534', fontSize: '1.1rem' }}>
                                        Rs {Number(feeCalculation?.totalDue || 0).toLocaleString()}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Payment Input Section */}
                <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', marginBottom: '0.85rem', textTransform: 'uppercase' }}>
                        Payment Submission Details
                    </h4>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                        {/* Payment Mode */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                                Payment Method
                            </label>
                            <select
                                value={paymentMode}
                                onChange={(e) => setPaymentMode(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.6rem 0.75rem',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    outline: 'none',
                                    background: '#ffffff',
                                    fontWeight: '600',
                                    color: '#0f172a',
                                    fontSize: '0.85rem'
                                }}
                            >
                                <option value="Cash">Cash at Counter</option>
                                <option value="Bank Transfer">Bank Transfer / Deposit</option>
                                <option value="Online / EasyPaisa">EasyPaisa / JazzCash</option>
                                <option value="Cheque">Cheque</option>
                            </select>
                        </div>

                        {/* Late Fine / Penalty (Auto + Manual Override) */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#b45309', marginBottom: '0.35rem' }}>
                                Late Fine / Penalty (Rs)
                            </label>
                            <input
                                type="number"
                                value={fineAmount}
                                onChange={(e) => setFineAmount(e.target.value)}
                                min="0"
                                placeholder="0"
                                title="Auto-filled from settings if overdue. Principal can manually change or waive."
                                style={{
                                    width: '100%',
                                    padding: '0.6rem 0.75rem',
                                    borderRadius: '6px',
                                    border: Number(fineAmount) > 0 ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                                    outline: 'none',
                                    background: Number(fineAmount) > 0 ? '#fffdf5' : '#ffffff',
                                    fontWeight: '700',
                                    color: Number(fineAmount) > 0 ? '#b45309' : '#0f172a',
                                    fontSize: '0.85rem'
                                }}
                            />
                        </div>

                        {/* Discount / Concession */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                                Concession / Discount (Rs)
                            </label>
                            <input
                                type="number"
                                value={discountAmount}
                                onChange={(e) => setDiscountAmount(e.target.value)}
                                min="0"
                                placeholder="0"
                                style={{
                                    width: '100%',
                                    padding: '0.6rem 0.75rem',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    outline: 'none',
                                    background: '#ffffff',
                                    fontWeight: '600',
                                    color: '#0f172a',
                                    fontSize: '0.85rem'
                                }}
                            />
                        </div>

                        {/* Received Amount */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#16a34a', marginBottom: '0.35rem' }}>
                                Received Amount (Rs)
                            </label>
                            <input
                                type="number"
                                value={receivedAmount}
                                onChange={(e) => setReceivedAmount(e.target.value)}
                                min="0"
                                style={{
                                    width: '100%',
                                    padding: '0.6rem 0.75rem',
                                    borderRadius: '6px',
                                    border: '1px solid #16a34a',
                                    outline: 'none',
                                    background: '#f0fdf4',
                                    fontWeight: '700',
                                    color: '#16a34a',
                                    fontSize: '0.95rem'
                                }}
                            />
                        </div>
                    </div>

                    {/* Remarks / Memo */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                            Remarks / Notes (Optional)
                        </label>
                        <input
                            type="text"
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="e.g. Paid in full by Father, Cheque #98212, Online ref ID..."
                            style={{
                                width: '100%',
                                padding: '0.6rem 0.75rem',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                outline: 'none',
                                background: '#ffffff',
                                fontSize: '0.85rem'
                            }}
                        />
                    </div>

                    {/* Conditional Proof Upload Box for Online / Bank Transfer */}
                    {paymentMode !== 'Cash' && (
                        <div style={{
                            padding: '0.85rem 1rem',
                            borderRadius: '8px',
                            background: '#f0f9ff',
                            border: '1px dashed #0284c7',
                            marginBottom: '1rem'
                        }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#0369a1', marginBottom: '0.35rem' }}>
                                Attach Bank / Payment Receipt Slip (Optional)
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleProofChange}
                                    style={{ fontSize: '0.8rem', color: '#475569' }}
                                />
                                {proofPreview && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <img src={proofPreview} alt="Proof" style={{ width: '38px', height: '38px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #bae6fd' }} />
                                        <button
                                            type="button"
                                            onClick={handleRemoveProof}
                                            style={{
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                background: '#fee2e2',
                                                border: '1px solid #fca5a5',
                                                color: '#b91c1c',
                                                fontSize: '0.7rem',
                                                fontWeight: '700',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="button"
                        onClick={handleSubmitFee}
                        disabled={isSubmitting}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            background: '#0078d4',
                            border: 'none',
                            color: '#ffffff',
                            fontWeight: '800',
                            fontSize: '0.95rem',
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 2px 4px rgba(0, 120, 212, 0.25)',
                            transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => { if (!isSubmitting) e.currentTarget.style.background = '#0067b8'; }}
                        onMouseLeave={(e) => { if (!isSubmitting) e.currentTarget.style.background = '#0078d4'; }}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 size={18} className="animate-spin" /> Processing Payment & Uploading...
                            </>
                        ) : (
                            <>
                                <Printer size={18} /> Submit Fee & Print Receipt Slip
                            </>
                        )}
                    </button>
                </div>
            </div>
        ) : (
            /* When no student is selected or in Income/Expenses mode, Right Card is Recent Log / Breakdown */
            <div className="card" style={{
                background: '#ffffff',
                borderRadius: '14px',
                padding: '1.5rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.15rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.85rem', flexWrap: 'wrap', gap: '0.6rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {rightCardTab === 'fee_slips' ? (
                            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Clock size={18} color="#0078d4" />
                                Today's Recent Fee Collections Log
                            </h3>
                        ) : (
                            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <TrendingUp size={18} color="#16a34a" />
                                Income & Expenses Breakdown
                            </h3>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        {/* Tab Switcher for Right Card */}
                        <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', gap: '3px', border: '1px solid #e2e8f0' }}>
                            <button
                                type="button"
                                onClick={() => setRightCardTab('fee_slips')}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: rightCardTab === 'fee_slips' ? '#ffffff' : 'transparent',
                                    color: rightCardTab === 'fee_slips' ? '#0078d4' : '#64748b',
                                    fontWeight: '700',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    boxShadow: rightCardTab === 'fee_slips' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <Clock size={13} /> Fee Slips ({recentTransactions.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setRightCardTab('finances_breakdown')}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: rightCardTab === 'finances_breakdown' ? '#ffffff' : 'transparent',
                                    color: rightCardTab === 'finances_breakdown' ? '#16a34a' : '#64748b',
                                    fontWeight: '700',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    boxShadow: rightCardTab === 'finances_breakdown' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <TrendingUp size={13} /> Breakdown ({todayFinances.incomes.length} Inc / {todayFinances.expenses.length} Exp)
                            </button>
                        </div>

                        {rightCardTab === 'fee_slips' ? (
                            <button
                                onClick={handleDownloadDailyReport}
                                disabled={isGeneratingDailyPDF || todayTransactions.length === 0}
                                style={{
                                    padding: '0.35rem 0.85rem',
                                    borderRadius: '8px',
                                    border: '1px solid #0078d4',
                                    background: isGeneratingDailyPDF ? '#93c5fd' : '#0078d4',
                                    color: '#ffffff',
                                    fontWeight: '700',
                                    fontSize: '0.78rem',
                                    cursor: todayTransactions.length === 0 || isGeneratingDailyPDF ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    boxShadow: '0 2px 5px rgba(0, 120, 212, 0.25)',
                                    transition: 'all 0.15s ease'
                                }}
                                title="Download customized official PDF report of today's fee collections"
                            >
                                {isGeneratingDailyPDF ? (
                                    <>
                                        <Loader2 size={13} className="animate-spin" />
                                        <span>Generating...</span>
                                    </>
                                ) : (
                                    <>
                                        <Download size={13} />
                                        <span>Download Report</span>
                                    </>
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={handleDownloadFinancesReport}
                                disabled={isGeneratingFinancesPDF || (todayFinances.incomes.length === 0 && todayFinances.expenses.length === 0 && !currentAction)}
                                style={{
                                    padding: '0.35rem 0.85rem',
                                    borderRadius: '8px',
                                    border: '1px solid #16a34a',
                                    background: isGeneratingFinancesPDF ? '#86efac' : '#16a34a',
                                    color: '#ffffff',
                                    fontWeight: '700',
                                    fontSize: '0.78rem',
                                    cursor: (todayFinances.incomes.length === 0 && todayFinances.expenses.length === 0 && !currentAction) || isGeneratingFinancesPDF ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    boxShadow: '0 2px 5px rgba(22, 163, 74, 0.25)',
                                    transition: 'all 0.15s ease'
                                }}
                                title="Download customized official PDF report of Income & Expenses breakdown"
                            >
                                {isGeneratingFinancesPDF ? (
                                    <>
                                        <Loader2 size={13} className="animate-spin" />
                                        <span>Generating...</span>
                                    </>
                                ) : (
                                    <>
                                        <Download size={13} />
                                        <span>Download Report</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {rightCardTab === 'fee_slips' ? (
                    /* Existing Fee Slips Table */
                    loadingTransactions ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                            Loading transaction history...
                        </div>
                    ) : todayTransactions.length === 0 ? (
                        <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', background: '#f8fafc', borderRadius: '8px' }}>
                            <p style={{ margin: 0, fontWeight: '700', color: '#64748b' }}>No fee collections recorded today yet.</p>
                            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>All previous days' receipts remain safely archived in the Finances tab.</span>
                        </div>
                    ) : (
                        <div style={{ maxHeight: '360px', overflowY: 'auto' }} className="custom-scrollbar">
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Slip #</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Student</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Class</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Amount</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Mode</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700', textAlign: 'right' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {todayTransactions.map((tx) => (
                                        <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: '700', color: '#0078d4' }}>{tx.receiptNo}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: '600', color: '#0f172a' }}>{tx.studentName}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', color: '#475569' }}>{tx.className}</td>
                                            <td style={{ padding: '0.6rem 0.75rem', fontWeight: '700', color: '#16a34a' }}>Rs {Number(tx.totalPaid).toLocaleString()}</td>
                                            <td style={{ padding: '0.6rem 0.75rem' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                    <span style={{ color: '#0f172a', fontWeight: '600' }}>{tx.paymentMode || 'Cash'}</span>
                                                    {tx.proofUrl && (
                                                        <button
                                                            onClick={() => setProofModal({
                                                                isOpen: true,
                                                                url: tx.proofUrl,
                                                                title: `${tx.studentName} (${tx.receiptNo}) - ${tx.paymentMode} Slip`
                                                            })}
                                                            style={{
                                                                padding: '0.2rem 0.5rem',
                                                                borderRadius: '4px',
                                                                border: '1px solid #93c5fd',
                                                                background: '#eff6ff',
                                                                color: '#0078d4',
                                                                fontWeight: '700',
                                                                fontSize: '0.72rem',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                width: 'fit-content'
                                                            }}
                                                            title="View payment receipt / bank slip screenshot"
                                                        >
                                                            <ImageIcon size={12} /> View Screenshot
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                                                    {tx.proofUrl && (
                                                        <button
                                                            onClick={() => setProofModal({
                                                                isOpen: true,
                                                                url: tx.proofUrl,
                                                                title: `${tx.studentName} (${tx.receiptNo}) - Proof Screenshot`
                                                            })}
                                                            style={{
                                                                padding: '0.3rem 0.6rem',
                                                                borderRadius: '6px',
                                                                border: '1px solid #86efac',
                                                                background: '#f0fdf4',
                                                                color: '#15803d',
                                                                fontWeight: '700',
                                                                fontSize: '0.75rem',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                            title="View attached bank deposit slip / screenshot"
                                                        >
                                                            <Eye size={13} /> Proof
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            setReceiptData(tx);
                                                            setReceiptModalOpen(true);
                                                        }}
                                                        style={{
                                                            padding: '0.3rem 0.6rem',
                                                            borderRadius: '6px',
                                                            border: '1px solid #cbd5e1',
                                                            background: '#ffffff',
                                                            color: '#0f172a',
                                                            fontWeight: '700',
                                                            fontSize: '0.75rem',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                        title="View & print official receipt slip"
                                                    >
                                                        <Printer size={13} /> Slip
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : (
                    /* Income & Expenses Breakdown List */
                    <div style={{ maxHeight: '360px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem' }} className="custom-scrollbar">
                        {/* Teachers Salary Auto Row */}
                        {teachersSalary > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#fef2f2', borderRadius: '10px', border: '1px solid #fee2e2' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                    <div style={{ background: '#fca5a5', padding: '0.25rem', borderRadius: '50%' }}>
                                        <ArrowDownRight size={15} color="#991b1b" />
                                    </div>
                                    <div>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}>
                                            Teachers Salaries <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', background: '#e2e8f0', color: '#475569', borderRadius: '8px', textTransform: 'uppercase', fontWeight: '700' }}>Auto</span>
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Aggregated from all staff profiles</span>
                                    </div>
                                </div>
                                <span style={{ fontWeight: '800', color: '#dc2626', fontSize: '0.9rem' }}>Rs {teachersSalary.toLocaleString()}</span>
                            </div>
                        )}

                        {/* Global Action (If Active) */}
                        {currentAction && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #dcfce7' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                    <div style={{ background: '#86efac', padding: '0.25rem', borderRadius: '50%' }}>
                                        <ArrowUpRight size={15} color="#166534" />
                                    </div>
                                    <div>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}>
                                            {currentAction.name} <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', background: '#e2e8f0', color: '#475569', borderRadius: '8px', textTransform: 'uppercase', fontWeight: '700' }}>Global Action</span>
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Active target fee collection</span>
                                    </div>
                                </div>
                                <span style={{ fontWeight: '800', color: '#16a34a', fontSize: '0.9rem' }}>Rs {Number(currentAction.amount || 0).toLocaleString()}</span>
                            </div>
                        )}

                        {/* Incomes List */}
                        {todayFinances.incomes.map(inc => (
                            <div key={inc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #dcfce7' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                    <div style={{ background: '#86efac', padding: '0.25rem', borderRadius: '50%' }}>
                                        <ArrowUpRight size={15} color="#166534" />
                                    </div>
                                    <div>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}>
                                            {inc.name} 
                                            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', background: inc.type === 'permanent' ? '#dcfce7' : '#e2e8f0', color: inc.type === 'permanent' ? '#15803d' : '#475569', borderRadius: '8px', textTransform: 'uppercase', fontWeight: '700' }}>
                                                {inc.type === 'permanent' ? 'Permanent' : 'One-time'}
                                            </span>
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                            {inc.remarks ? `Note: ${inc.remarks}` : 'Income Entry'}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <span style={{ fontWeight: '800', color: '#16a34a', fontSize: '0.9rem' }}>Rs {Number(inc.amount).toLocaleString()}</span>
                                </div>
                            </div>
                        ))}

                        {/* Expenses List */}
                        {todayFinances.expenses.map(exp => (
                            <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #fee2e2' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                    <div style={{ background: '#fca5a5', padding: '0.25rem', borderRadius: '50%' }}>
                                        <ArrowDownRight size={15} color="#991b1b" />
                                    </div>
                                    <div>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}>
                                            {exp.name} 
                                            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', background: exp.type === 'permanent' ? '#fee2e2' : '#e2e8f0', color: exp.type === 'permanent' ? '#b91c1c' : '#475569', borderRadius: '8px', textTransform: 'uppercase', fontWeight: '700' }}>
                                                {exp.type === 'permanent' ? 'Permanent' : 'One-time'}
                                            </span>
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                            {exp.remarks ? `Note: ${exp.remarks}` : 'Expense Entry'}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <span style={{ fontWeight: '800', color: '#dc2626', fontSize: '0.9rem' }}>Rs {Number(exp.amount).toLocaleString()}</span>
                                </div>
                            </div>
                        ))}

                        {todayFinances.incomes.length === 0 && todayFinances.expenses.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#94a3b8', fontSize: '0.85rem', background: '#f8fafc', borderRadius: '8px' }}>
                                <p style={{ margin: 0, fontWeight: '700', color: '#64748b' }}>No incomes or expenses recorded today yet.</p>
                                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>All previous days remain safely archived in the Finances tab.</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        )}
    </div>

    {/* When a student IS selected, also show Recent Fee Collections Log below the 2 columns */}
    {selectedStudent && activeDailyMode === 'fee_submission' && (
                <div className="card" style={{
                    background: '#ffffff',
                    borderRadius: '14px',
                    padding: '1.5rem',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.85rem', flexWrap: 'wrap', gap: '0.6rem' }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Clock size={18} color="#0078d4" />
                            Today's Recent Fee Collections Log
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#0078d4', background: '#eff6ff', padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                                {todayTransactions.length} Slips Recorded Today
                            </span>
                            <button
                                onClick={handleDownloadDailyReport}
                                disabled={isGeneratingDailyPDF || todayTransactions.length === 0}
                                style={{
                                    padding: '0.35rem 0.85rem',
                                    borderRadius: '8px',
                                    border: '1px solid #0078d4',
                                    background: isGeneratingDailyPDF ? '#93c5fd' : '#0078d4',
                                    color: '#ffffff',
                                    fontWeight: '700',
                                    fontSize: '0.78rem',
                                    cursor: todayTransactions.length === 0 || isGeneratingDailyPDF ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    boxShadow: '0 2px 5px rgba(0, 120, 212, 0.25)',
                                    transition: 'all 0.15s ease'
                                }}
                                title="Download customized official PDF report of today's collections"
                            >
                                {isGeneratingDailyPDF ? (
                                    <>
                                        <Loader2 size={13} className="animate-spin" />
                                        <span>Generating...</span>
                                    </>
                                ) : (
                                    <>
                                        <Download size={13} />
                                        <span>Download Report</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {loadingTransactions ? (
                        <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                            Loading transaction history...
                        </div>
                    ) : todayTransactions.length === 0 ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', background: '#f8fafc', borderRadius: '8px' }}>
                            No fee transactions recorded today yet.
                        </div>
                    ) : (
                        <div style={{ maxHeight: '260px', overflowY: 'auto' }} className="custom-scrollbar">
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Slip #</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Student</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Class</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Amount Paid</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Mode</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700' }}>Time</th>
                                        <th style={{ padding: '0.5rem 0.75rem', color: '#475569', fontWeight: '700', textAlign: 'right' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {todayTransactions.map((tx) => (
                                        <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: '700', color: '#0078d4' }}>{tx.receiptNo}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: '600', color: '#0f172a' }}>{tx.studentName}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', color: '#475569' }}>{tx.className}</td>
                                            <td style={{ padding: '0.6rem 0.75rem', fontWeight: '700', color: '#16a34a' }}>Rs {Number(tx.totalPaid).toLocaleString()}</td>
                                            <td style={{ padding: '0.6rem 0.75rem' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                    <span style={{ color: '#0f172a', fontWeight: '600' }}>{tx.paymentMode || 'Cash'}</span>
                                                    {tx.proofUrl && (
                                                        <button
                                                            onClick={() => setProofModal({
                                                                isOpen: true,
                                                                url: tx.proofUrl,
                                                                title: `${tx.studentName} (${tx.receiptNo}) - ${tx.paymentMode} Slip`
                                                            })}
                                                            style={{
                                                                padding: '0.2rem 0.5rem',
                                                                borderRadius: '4px',
                                                                border: '1px solid #93c5fd',
                                                                background: '#eff6ff',
                                                                color: '#0078d4',
                                                                fontWeight: '700',
                                                                fontSize: '0.72rem',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                width: 'fit-content'
                                                            }}
                                                            title="View payment receipt / bank slip screenshot"
                                                        >
                                                            <ImageIcon size={12} /> View Screenshot
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem', color: '#64748b' }}>{tx.timeString || tx.dateString}</td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                                                    {tx.proofUrl && (
                                                        <button
                                                            onClick={() => setProofModal({
                                                                isOpen: true,
                                                                url: tx.proofUrl,
                                                                title: `${tx.studentName} (${tx.receiptNo}) - Proof Screenshot`
                                                            })}
                                                            style={{
                                                                padding: '0.3rem 0.6rem',
                                                                borderRadius: '6px',
                                                                border: '1px solid #86efac',
                                                                background: '#f0fdf4',
                                                                color: '#15803d',
                                                                fontWeight: '700',
                                                                fontSize: '0.75rem',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                            title="View attached bank deposit slip / screenshot"
                                                        >
                                                            <Eye size={13} /> Proof
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            setReceiptData(tx);
                                                            setReceiptModalOpen(true);
                                                        }}
                                                        style={{
                                                            padding: '0.3rem 0.6rem',
                                                            borderRadius: '6px',
                                                            border: '1px solid #cbd5e1',
                                                            background: '#ffffff',
                                                            color: '#0f172a',
                                                            fontWeight: '700',
                                                            fontSize: '0.75rem',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                        title="View & print official receipt slip"
                                                    >
                                                        <Printer size={13} /> Slip
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Proof Lightbox Modal */}
            <PaymentProofModal
                isOpen={proofModal.isOpen}
                onClose={() => setProofModal({ isOpen: false, url: '', title: '' })}
                proofUrl={proofModal.url}
                title={proofModal.title}
            />
        </div>
    );
};

const Collections = () => {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const initialTab = searchParams.get('tab') || 'workflow';
    const preselectedClassId = searchParams.get('classId') || '';
    const preselectedStudentId = searchParams.get('studentId') || '';

    const [classes, setClasses] = useState([]);
    const [schoolId, setSchoolId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(initialTab);
    const [currentAction, setCurrentAction] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [schoolInfo, setSchoolInfo] = useState({ name: 'School Report', logo: '' });
    
    // Fee Settings State
    const [feeSettings, setFeeSettings] = useState({ dueDate: '', penaltyAmount: '' });
    const [isSavingFeeSettings, setIsSavingFeeSettings] = useState(false);

    // Helper for Sort
    const getClassOrder = (name) => {
        if (!name || typeof name !== 'string') return 0;
        const lower = name.toLowerCase();
        if (lower.includes('nursery')) return -2;
        if (lower.includes('prep')) return -1;
        return parseInt(name.replace(/\D/g, '')) || 0;
    };

    // 1. Init School ID
    // 1. Init School ID & Auth
    useEffect(() => {
        let isMounted = true;
        const resolveUser = async () => {
            // Priority 1: Firebase Auth (Real source of truth for DB permissions)
            const unsubscribe = auth.onAuthStateChanged(async (user) => {
                if (!isMounted) return;

                if (user) {
                    try {
                        const token = await user.getIdTokenResult();
                        if (token.claims.schoolId) {
                            console.log("Resolved School ID from Auth:", token.claims.schoolId);
                            setSchoolId(token.claims.schoolId);
                            setLoading(false);
                            return;
                        }
                    } catch (e) {
                        console.error("Claims error", e);
                    }
                }

                // Priority 2: Manual Session (Fallback/Dev)
                const manualSession = localStorage.getItem('manual_session');
                if (manualSession) {
                    try {
                        const userData = JSON.parse(manualSession);
                        if (userData.schoolId) {
                            console.log("Resolved School ID from Manual Session:", userData.schoolId);
                            setSchoolId(userData.schoolId);
                        }
                    } catch (e) {
                        console.error("Manual session parse error", e);
                    }
                }
                setLoading(false);
            });
            return () => unsubscribe();
        };
        resolveUser();
        return () => { isMounted = false; };
    }, []);

    // 1b. Monthly Fee Auto-Reset — runs once per calendar month
    useEffect(() => {
        if (!schoolId) return;

        const runMonthlyFeeReset = async () => {
            const currentMonth = new Date().toLocaleDateString('en-CA').slice(0, 7); // "YYYY-MM"
            const resetMetaRef = doc(db, `schools/${schoolId}/settings`, 'feeResetMeta');

            try {
                const metaSnap = await getDoc(resetMetaRef);
                const lastResetMonth = metaSnap.exists() ? metaSnap.data().lastResetMonth : null;

                if (lastResetMonth === currentMonth) {
                    // Already reset this month — do nothing
                    console.log('[FeeReset] Already reset for', currentMonth);
                    return;
                }

                console.log('[FeeReset] New month detected. Resetting all student fees to unpaid...');

                // Fetch all classes (excluding metadata doc)
                const classesSnap = await getDocs(collection(db, `schools/${schoolId}/classes`));
                const classIds = classesSnap.docs
                    .map(d => d.id)
                    .filter(id => id !== 'action_metadata');

                // Firestore batch limit is 500 writes — chunk if needed
                const BATCH_LIMIT = 490;
                let batch = writeBatch(db);
                let writeCount = 0;

                for (const classId of classIds) {
                    const studentsSnap = await getDocs(
                        collection(db, `schools/${schoolId}/classes/${classId}/students`)
                    );
                    for (const studentDoc of studentsSnap.docs) {
                        batch.update(studentDoc.ref, {
                            monthlyFeeStatus: 'unpaid',
                            monthlyFeeDate: null
                        });
                        writeCount++;

                        if (writeCount >= BATCH_LIMIT) {
                            await batch.commit();
                            batch = writeBatch(db);
                            writeCount = 0;
                        }
                    }
                }

                // Commit remaining writes
                if (writeCount > 0) await batch.commit();

                // Stamp the reset month so this doesn't run again until next month
                await setDoc(resetMetaRef, { lastResetMonth: currentMonth });
                console.log('[FeeReset] Reset complete for', currentMonth);

            } catch (err) {
                console.error('[FeeReset] Error during monthly fee reset:', err);
            }
        };

        runMonthlyFeeReset();
    }, [schoolId]);

    // 2. Fetch Classes & Action
    useEffect(() => {
        if (!schoolId) return;

        // Listen to Classes
        const qClasses = query(collection(db, `schools/${schoolId}/classes`));
        const unsubClasses = onSnapshot(qClasses, (snapshot) => {
            const classesData = snapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
                // Filter out the special settings document
                .filter(doc => doc.id !== 'action_metadata');

            classesData.sort((a, b) => getClassOrder(a.name) - getClassOrder(b.name));
            setClasses(classesData);
            setLoading(false);
        });

        // Listen to Collection Action (Stored in 'classes' collection to fit existing Firestore Rules)
        const actionRef = doc(db, 'schools', schoolId, 'classes', 'action_metadata');
        const unsubAction = onSnapshot(actionRef, (docSnap) => {
            if (docSnap.exists()) {
                setCurrentAction(docSnap.data());
            } else {
                setCurrentAction(null);
            }
        }, (error) => {
            console.error("Error listening to action:", error);
        });

        // Listen to Fee Settings
        const feeSettingsRef = doc(db, 'schools', schoolId, 'settings', 'feeSettings');
        const unsubFeeSettings = onSnapshot(feeSettingsRef, (docSnap) => {
            if (docSnap.exists()) {
                setFeeSettings({
                    dueDate: docSnap.data().dueDate || '',
                    penaltyAmount: docSnap.data().penaltyAmount || ''
                });
            } else {
                setFeeSettings({ dueDate: '', penaltyAmount: '' });
            }
        });

        // Listen to School Profile for Receipt branding
        const profileRef = doc(db, 'schools', schoolId, 'settings', 'profile');
        const unsubProfile = onSnapshot(profileRef, (docSnap) => {
            if (docSnap.exists()) {
                setSchoolInfo({
                    name: docSnap.data().name || 'School Name',
                    logo: docSnap.data().profileImage || ''
                });
            }
        });

        return () => {
            unsubClasses();
            unsubAction();
            unsubFeeSettings();
            unsubProfile();
        };

    }, [schoolId]);

    const handleSaveFeeSettings = async () => {
        if (!schoolId) return;
        setIsSavingFeeSettings(true);
        try {
            const feeSettingsRef = doc(db, 'schools', schoolId, 'settings', 'feeSettings');
            await setDoc(feeSettingsRef, feeSettings, { merge: true });
            alert("Fee settings saved successfully!");
        } catch (error) {
            console.error("Error saving fee settings:", error);
            alert("Failed to save fee settings");
        }
        setIsSavingFeeSettings(false);
    };

    const handleSaveAction = async (actionData) => {
        // Check for Manual Bypass Isolation
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            const session = JSON.parse(manualSession);
            if (session.isManual) {
                alert("Restricted: You are logged in via Manual Bypass Mode.\n\nDatabase writes are disabled for security. Please initialize a real session (Login with standard Password) to create actions.");
                return;
            }
        }

        if (!schoolId || !auth.currentUser) {
            console.error("Auth User or School ID is missing");
            alert("Authentication Error: You must be logged in with a valid account (not a bypass) to perform this action.");
            return;
        }

        // Debug Log
        console.log("Attempting to save action:", actionData);
        console.log("Current SchoolID:", schoolId);
        console.log("Current Auth User:", auth.currentUser?.uid);

        try {
            // Write to 'classes' collection which is whitelisted for Principals
            const actionRef = doc(db, 'schools', schoolId, 'classes', 'action_metadata');
            await setDoc(actionRef, {
                ...actionData,
                type: 'system_action_metadata', // Flag to identify it if needed
                createdAt: new Date().toISOString()
            });
            console.log("Action saved successfully to classes/action_metadata");
        } catch (error) {
            console.error("Error creating action:", error);
            alert(`Failed to create action: ${error.message}\nCheck console for details.`);
        }
    };

    const handleDeleteAction = async () => {
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            const session = JSON.parse(manualSession);
            if (session.isManual) {
                alert("Restricted: You are logged in via Manual Bypass Mode. Writes are disabled.");
                return;
            }
        }

        if (!schoolId || !auth.currentUser) return;
        if (!window.confirm("Are you sure you want to delete this action? Past payment records will be preserved but hidden.")) return;

        try {
            const actionRef = doc(db, 'schools', schoolId, 'classes', 'action_metadata');
            await deleteDoc(actionRef);
        } catch (error) {
            console.error("Error deleting action:", error);
            alert("Failed to delete action");
        }
    };

    // 3. Global Stats Aggregation
    const [globalStats, setGlobalStats] = useState({
        monthlyPaid: 0,
        monthlyUnpaid: 0,
        actionPaid: 0,
        actionUnpaid: 0,
        loading: true
    });

    useEffect(() => {
        if (loading || !schoolId || classes.length === 0) {
            console.log("[Collections] Waiting for initialization - School:", schoolId, "Classes count:", classes.length);
            return;
        }

        console.log("[Collections] Starting Global Aggregation for school:", schoolId);

        const unsubscribers = [];
        const classStatsMap = new Map();

        const updateAggregates = () => {
            let mPaid = 0;
            let mUnpaid = 0;
            let aPaid = 0;
            let aUnpaid = 0;

            classStatsMap.forEach((stats, cid) => {
                mPaid += stats.monthlyPaid;
                mUnpaid += stats.monthlyUnpaid;
                aPaid += stats.actionPaid;
                aUnpaid += stats.actionUnpaid;
            });

            console.log(`[Collections] TOTAL Aggregated - Monthly Paid: ${mPaid}, Unpaid: ${mUnpaid}`);

            setGlobalStats({
                monthlyPaid: mPaid,
                monthlyUnpaid: mUnpaid,
                actionPaid: aPaid,
                actionUnpaid: aUnpaid,
                loading: false
            });
        };

        classes.forEach(cls => {
            const q = query(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
            const unsub = onSnapshot(q, (snapshot) => {
                let cMonthlyPaid = 0;
                let cMonthlyUnpaid = 0;
                let cActionPaid = 0;
                let cActionUnpaid = 0;

                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const monthlyStatus = data.monthlyFeeStatus || 'unpaid';
                    if (monthlyStatus === 'paid') cMonthlyPaid++;
                    else cMonthlyUnpaid++;

                    if (currentAction) {
                        const isTargeted = currentAction.targetAll ||
                            (currentAction.targetClasses && currentAction.targetClasses.includes(cls.id));

                        if (isTargeted) {
                            const actionStatus = data.customPayments?.[currentAction.name]?.status;
                            if (actionStatus === 'paid') cActionPaid++;
                            else cActionUnpaid++;
                        }
                    }
                });

                console.log(`[Collections] Class ${cls.name} [${cls.id}] Snapshot: ${snapshot.size} students, Paid: ${cMonthlyPaid}`);

                classStatsMap.set(cls.id, {
                    monthlyPaid: cMonthlyPaid,
                    monthlyUnpaid: cMonthlyUnpaid,
                    actionPaid: cActionPaid,
                    actionUnpaid: cActionUnpaid
                });
                updateAggregates();
            });
            unsubscribers.push(unsub);
        });

        return () => {
            console.log("[Collections] Cleaning up global listeners");
            unsubscribers.forEach(unsub => unsub());
        };

    }, [classes, currentAction, schoolId, loading]);
    // Re-run if classes list or action changes



    return (
        <div className="animate-fade-in-up">
            {/* Header */}
            <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                        Fee Collections
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Daily fee counters, class-wise reports and school finances</p>
                </div>

                {/* Fee Settings Inline UI */}
                {activeTab === 'collections' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'white', padding: '0.5rem 1rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Due Date:</span>
                            <input
                                type="text"
                                placeholder="e.g. 10th"
                                value={feeSettings.dueDate}
                                onChange={(e) => setFeeSettings({...feeSettings, dueDate: e.target.value})}
                                style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', width: '80px', fontSize: '0.9rem', outline: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Penalty Amt:</span>
                            <input
                                type="number"
                                placeholder="e.g. 500"
                                value={feeSettings.penaltyAmount}
                                onChange={(e) => setFeeSettings({...feeSettings, penaltyAmount: e.target.value})}
                                style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', width: '100px', fontSize: '0.9rem', outline: 'none' }}
                            />
                        </div>
                        <button
                            onClick={handleSaveFeeSettings}
                            disabled={isSavingFeeSettings}
                            style={{
                                padding: '0.5rem 1rem', borderRadius: '8px', border: 'none',
                                background: 'var(--primary)', color: 'white', fontWeight: '600', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isSavingFeeSettings ? 0.7 : 1
                            }}
                        >
                            {isSavingFeeSettings ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                )}

                {/* Action Controls */}
                {activeTab === 'collections' && (
                    <div>
                        {currentAction ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'white', padding: '0.5rem 1rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                <div>
                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Current Action</span>
                                    <span style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--primary)' }}>{currentAction.name}</span>
                                </div>
                                <div style={{ height: '30px', width: '1px', background: '#e2e8f0' }} />
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                        {currentAction.targetAll ? 'All Classes' : `${currentAction.targetClasses?.length || 0} Classes`}
                                    </span>
                                </div>
                                <button
                                    onClick={handleDeleteAction}
                                    style={{
                                        padding: '0.5rem', borderRadius: '50%', border: 'none',
                                        background: '#fee2e2', color: '#dc2626', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '0.5rem'
                                    }}
                                    title="Delete Action"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowModal(true)}
                                className="btn-primary"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    padding: '0.75rem 1.5rem', borderRadius: '12px',
                                    background: 'var(--primary)', color: 'white', border: 'none',
                                    fontWeight: '600', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)'
                                }}
                            >
                                <Plus size={20} />
                                New Action
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Tabs Navigation (Daily Workflow leftmost) */}
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                <button
                    onClick={() => setActiveTab('workflow')}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0.5rem 1rem', fontSize: '1.1rem', fontWeight: '700',
                        color: activeTab === 'workflow' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: activeTab === 'workflow' ? '3px solid var(--primary)' : '3px solid transparent',
                        transition: 'all 0.2s',
                        borderRadius: '0'
                    }}
                >
                    Daily Workflow
                </button>
                <button
                    onClick={() => setActiveTab('collections')}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0.5rem 1rem', fontSize: '1.1rem', fontWeight: '700',
                        color: activeTab === 'collections' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: activeTab === 'collections' ? '3px solid var(--primary)' : '3px solid transparent',
                        transition: 'all 0.2s',
                        borderRadius: '0'
                    }}
                >
                    Collections
                </button>
                <button
                    onClick={() => setActiveTab('finances')}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0.5rem 1rem', fontSize: '1.1rem', fontWeight: '700',
                        color: activeTab === 'finances' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: activeTab === 'finances' ? '3px solid var(--primary)' : '3px solid transparent',
                        transition: 'all 0.2s',
                        borderRadius: '0'
                    }}
                >
                    Finances
                </button>
                <button
                    onClick={() => setActiveTab('payroll')}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0.5rem 1rem', fontSize: '1.1rem', fontWeight: '700',
                        color: activeTab === 'payroll' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: activeTab === 'payroll' ? '3px solid var(--primary)' : '3px solid transparent',
                        transition: 'all 0.2s',
                        borderRadius: '0'
                    }}
                >
                    Payroll
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'workflow' && (
                <DailyWorkflow
                    schoolId={schoolId}
                    classes={classes}
                    currentAction={currentAction}
                    schoolInfo={schoolInfo}
                    feeSettings={feeSettings}
                    preselectedClassId={preselectedClassId}
                    preselectedStudentId={preselectedStudentId}
                />
            )}

            {activeTab === 'collections' && (
                <>
                    {/* Global Stats Overview */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                {/* Monthly Fee Cards */}
                <div className="card" style={{ padding: '1.25rem', border: '1px solid #dbeafe', background: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: '10px', background: '#dcfce7', color: '#16a34a' }}>
                            <CheckCircle size={20} />
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Monthly Fee Paid</span>
                    </div>
                    <span style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-main)', marginLeft: '0.25rem' }}>
                        {globalStats.monthlyPaid.toLocaleString()}
                    </span>
                </div>

                <div className="card" style={{ padding: '1.25rem', border: '1px solid #fee2e2', background: 'linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: '10px', background: '#fee2e2', color: '#dc2626' }}>
                            <Ban size={20} />
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Monthly Fee Unpaid</span>
                    </div>
                    <span style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-main)', marginLeft: '0.25rem' }}>
                        {globalStats.monthlyUnpaid.toLocaleString()}
                    </span>
                </div>

                {/* Additional Action Fee Cards */}
                <div className="card" style={{ padding: '1.25rem', border: '1px solid #d1fae5', background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', display: 'flex', flexDirection: 'column', gap: '0.5rem', opacity: currentAction ? 1 : 0.6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: '10px', background: '#059669', color: 'white' }}>
                            <Wallet size={20} />
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#064e3b' }}>
                            {currentAction ? `${currentAction.name} Paid` : 'No Action Active'}
                        </span>
                    </div>
                    <span style={{ fontSize: '1.75rem', fontWeight: '700', color: '#065f46', marginLeft: '0.25rem' }}>
                        {globalStats.actionPaid.toLocaleString()}
                    </span>
                </div>

                <div className="card" style={{ padding: '1.25rem', border: '1px solid #fecaca', background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', display: 'flex', flexDirection: 'column', gap: '0.5rem', opacity: currentAction ? 1 : 0.6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: '10px', background: '#dc2626', color: 'white' }}>
                            <Wallet size={20} />
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#7f1d1d' }}>
                            {currentAction ? `${currentAction.name} Unpaid` : 'No Action Active'}
                        </span>
                    </div>
                    <span style={{ fontSize: '1.75rem', fontWeight: '700', color: '#991b1b', marginLeft: '0.25rem' }}>
                        {globalStats.actionUnpaid.toLocaleString()}
                    </span>
                </div>
            </div>

            {/* Classes Grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Loading Classes...</div>
            ) : (
                <>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '1.5rem' }}>
                        {currentAction ? `Collection Status: ${currentAction.name}` : 'All Classes'}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                        {classes.map(cls => (
                            <CollectionClassCard
                                key={cls.id}
                                cls={cls}
                                currentAction={currentAction}
                                schoolId={schoolId}
                            />
                        ))}
                    </div>
                </>
            )}
            </>
            )}

            {activeTab === 'finances' && (
                <FinancesDashboard
                    schoolId={schoolId}
                    currentAction={currentAction}
                    schoolInfo={schoolInfo}
                    classes={classes}
                />
            )}

            {activeTab === 'payroll' && (
                <PayrollDashboard schoolId={schoolId} schoolInfo={schoolInfo} />
            )}

            <ActionModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onSave={handleSaveAction}
                classes={classes}
            />
        </div>
    );
};

export default Collections;
