import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { 
    Wallet, Users, ChevronRight, ChevronLeft, Ban, CheckCircle, Plus, Trash2, X, 
    CheckSquare, Square, ArrowUpRight, ArrowDownRight, Download,
    Printer, Search, CheckCircle2, User, FileText, Loader2, Sparkles, Building2, Phone, Calendar, Clock, DollarSign,
    Image as ImageIcon, ExternalLink, Eye, Upload, Landmark, Smartphone, TrendingUp, Activity,
    PieChart, BarChart3, Zap, ShieldCheck, Layers, Wifi, WifiOff, RefreshCw, Filter, ArrowRight,
    Award, AlertTriangle, Check, RotateCcw, RotateCw, ZoomIn, ZoomOut, Maximize2, CalendarDays, History, Send
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, AreaChart, Area, PieChart as RechartsPie, Pie, Cell,
    XAxis, YAxis, Tooltip as RechartsTooltip, Legend as RechartsLegend, CartesianGrid
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CachedImage from '../components/CachedImage';
import PayrollDashboard from '../components/PayrollDashboard';
import OnlineSubmissionsDashboard from '../components/OnlineSubmissionsDashboard';
import FinancesDashboard from '../components/FinancesDashboard';
import FeeArrearsMatrix, { 
    downloadStudentFeeCardPDF, 
    MONTH_NAMES, 
    MONTH_SHORT, 
    formatPKR, 
    cleanFeeItemName, 
    calculateItemizedFeeBreakdown 
} from '../components/FeeArrearsMatrix';
import {
    getStudentMonthFinancialStatus
} from '../utils/feePipeline';
import {
    cacheStudentsOffline,
    getCachedStudentsOffline,
    updateCachedStudentOffline,
    enqueueOfflineFeeTransaction,
    getOfflineFeeQueue,
    syncOfflineFeeQueueInBatches
} from '../utils/offlineFeeEngine';
import { db, auth, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
    collection, onSnapshot, query, doc, updateDoc, deleteField, setDoc, getDoc, deleteDoc,
    getDocs, writeBatch, getDocsFromCache, addDoc, serverTimestamp, orderBy, limit, where, arrayUnion
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

const NewActionModal = ({ isOpen, onClose, onSave, isSaving, targetMonthName }) => {
    if (!isOpen) return null;

    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [remarks, setRemarks] = useState('');

    const presets = [
        { label: '📝 Exam Fee', title: 'Annual Exam Fee', amount: 500 },
        { label: '🪪 ID Card Duplicate', title: 'Student ID Card Replacement', amount: 200 },
        { label: '📚 Books & Syllabus', title: 'Syllabus & Notebooks Charges', amount: 1000 },
        { label: '⏳ Discipline Fine', title: 'Discipline / Late Attendance Fine', amount: 300 },
        { label: '🎨 Annual Gala / Day', title: 'Annual Sports & Gala Function', amount: 1500 },
        { label: '🚌 Tour & Picnic', title: 'School Educational Tour / Picnic', amount: 1200 },
        { label: '🔬 Lab Charges', title: 'Science Lab / Breakage Charges', amount: 400 },
    ];

    const handleSelectPreset = (p) => {
        setTitle(p.title);
        setAmount(String(p.amount));
    };

    const handleFormSubmit = async (e) => {
        e?.preventDefault();
        if (!title.trim() || Number(amount) <= 0) return;
        await onSave(title.trim(), Number(amount), remarks.trim());
        setTitle('');
        setAmount('');
        setRemarks('');
    };

    const handleClose = () => {
        setTitle('');
        setAmount('');
        setRemarks('');
        onClose();
    };

    return createPortal(
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem'
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '480px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                border: '1.5px solid #cbd5e1',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1rem 1.25rem',
                    background: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: '#eff6ff',
                            color: '#0078d4',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            fontSize: '1.1rem'
                        }}>
                            ➕
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '800', color: '#0f172a' }}>
                                Add New Action / Custom Fee
                            </h3>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                Target Month: <strong style={{ color: '#0078d4' }}>{targetMonthName || 'Current Month'}</strong> (Live sync to Parent App)
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '6px'
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleFormSubmit} style={{ padding: '1.25rem' }}>
                    {/* Quick 1-Tap Preset Palette */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#475569', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            ⚡ 1-Tap Quick Action Presets
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                            {presets.map((p, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleSelectPreset(p)}
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        border: title === p.title ? '1.5px solid #0078d4' : '1px solid #cbd5e1',
                                        background: title === p.title ? '#eff6ff' : '#f8fafc',
                                        color: title === p.title ? '#0078d4' : '#334155',
                                        fontSize: '0.72rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {p.label} <span style={{ opacity: 0.7 }}>Rs {p.amount}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Action Title Input */}
                    <div style={{ marginBottom: '0.85rem' }}>
                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.25rem' }}>
                            Action / Fee Title <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Annual Exam Fee, Sports Gala Dress, Lab Fee..."
                            required
                            style={{
                                width: '100%',
                                padding: '0.55rem 0.75rem',
                                borderRadius: '8px',
                                border: '1.5px solid #cbd5e1',
                                fontSize: '0.85rem',
                                outline: 'none',
                                boxSizing: 'border-box',
                                fontWeight: '600'
                            }}
                        />
                    </div>

                    {/* Amount Input */}
                    <div style={{ marginBottom: '0.85rem' }}>
                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.25rem' }}>
                            Amount (Rs) <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            min="1"
                            placeholder="e.g. 500"
                            required
                            style={{
                                width: '100%',
                                padding: '0.55rem 0.75rem',
                                borderRadius: '8px',
                                border: '1.5px solid #cbd5e1',
                                fontSize: '0.85rem',
                                outline: 'none',
                                boxSizing: 'border-box',
                                fontWeight: '700',
                                color: '#0f172a'
                            }}
                        />
                    </div>

                    {/* Optional Remarks */}
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>
                            Remarks / Note (Optional)
                        </label>
                        <input
                            type="text"
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="e.g. Approved by Vice Principal, Roll #02 slip..."
                            style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.8rem',
                                outline: 'none',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={handleClose}
                            style={{
                                padding: '0.55rem 1.1rem',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                background: '#f8fafc',
                                color: '#475569',
                                fontSize: '0.8rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!title.trim() || Number(amount) <= 0 || isSaving}
                            style={{
                                padding: '0.55rem 1.35rem',
                                borderRadius: '8px',
                                border: 'none',
                                background: '#0078d4',
                                color: '#ffffff',
                                fontSize: '0.8rem',
                                fontWeight: '800',
                                cursor: !title.trim() || Number(amount) <= 0 || isSaving ? 'not-allowed' : 'pointer',
                                opacity: !title.trim() || Number(amount) <= 0 || isSaving ? 0.6 : 1,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}
                        >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : '➕ Add to Live Bill'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
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
        }, (err) => {
            console.warn("Class student stats listener warning:", err);
            setMonthlyStats(prev => ({ ...prev, loading: false }));
            setActionStats(prev => ({ ...prev, loading: false }));
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

// --- Canvas-Style Interactive Payment Proof Lightbox Modal ---
const PaymentProofModal = ({ isOpen, onClose, proofUrl, title, meta }) => {
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isFullscreen, setIsFullscreen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setScale(1);
            setRotation(0);
            setPosition({ x: 0, y: 0 });
        }
    }, [isOpen, proofUrl]);

    if (!isOpen || !proofUrl) return null;

    const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 3.5));
    const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
    const handleRotate = () => setRotation(prev => (prev + 90) % 360);
    const handleReset = () => {
        setScale(1);
        setRotation(0);
        setPosition({ x: 0, y: 0 });
    };

    const handleMouseDown = (e) => {
        if (scale > 1) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
        }
    };

    const handleMouseMove = (e) => {
        if (isDragging && scale > 1) {
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            });
        }
    };

    const handleMouseUp = () => setIsDragging(false);

    const handleDownload = () => {
        try {
            const link = document.createElement('a');
            link.href = proofUrl;
            link.download = `Payment_Slip_${Date.now()}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            window.open(proofUrl, '_blank');
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: isFullscreen ? '0' : '1rem',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                background: '#0f172a',
                borderRadius: isFullscreen ? '0' : '16px',
                width: '100%',
                maxWidth: isFullscreen ? '100vw' : '880px',
                height: isFullscreen ? '100vh' : 'auto',
                maxHeight: isFullscreen ? '100vh' : '90vh',
                boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.6)',
                border: isFullscreen ? 'none' : '1.5px solid rgba(255, 255, 255, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* Modal Header Bar */}
                <div style={{
                    padding: '0.9rem 1.25rem',
                    background: 'rgba(30, 41, 59, 0.8)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: '#0284c7',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <ImageIcon size={18} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.01em' }}>
                                {title || 'Payment Proof Slip / Screenshot'}
                            </h3>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '1px' }}>
                                {meta ? meta : 'Verified transaction record • Zoom, rotate or drag to inspect details'}
                            </div>
                        </div>
                    </div>

                    {/* Toolbar Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {/* Zoom Out */}
                        <button
                            type="button"
                            onClick={handleZoomOut}
                            disabled={scale <= 0.5}
                            style={{
                                padding: '6px 9px',
                                borderRadius: '7px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                color: '#ffffff',
                                cursor: scale <= 0.5 ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '0.75rem',
                                fontWeight: '700'
                            }}
                            title="Zoom Out"
                        >
                            <ZoomOut size={14} />
                        </button>

                        {/* Zoom Indicator */}
                        <span style={{
                            fontSize: '0.72rem',
                            fontWeight: '800',
                            color: '#38bdf8',
                            background: 'rgba(2, 132, 199, 0.2)',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            minWidth: '42px',
                            textAlign: 'center'
                        }}>
                            {Math.round(scale * 100)}%
                        </span>

                        {/* Zoom In */}
                        <button
                            type="button"
                            onClick={handleZoomIn}
                            disabled={scale >= 3.5}
                            style={{
                                padding: '6px 9px',
                                borderRadius: '7px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                color: '#ffffff',
                                cursor: scale >= 3.5 ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '0.75rem',
                                fontWeight: '700'
                            }}
                            title="Zoom In"
                        >
                            <ZoomIn size={14} />
                        </button>

                        {/* Rotate 90 deg */}
                        <button
                            type="button"
                            onClick={handleRotate}
                            style={{
                                padding: '6px 9px',
                                borderRadius: '7px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                color: '#ffffff',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.75rem',
                                fontWeight: '700'
                            }}
                            title="Rotate 90°"
                        >
                            <RotateCw size={14} />
                            <span>{rotation}°</span>
                        </button>

                        {/* Reset */}
                        {(scale !== 1 || rotation !== 0 || position.x !== 0 || position.y !== 0) && (
                            <button
                                type="button"
                                onClick={handleReset}
                                style={{
                                    padding: '6px 9px',
                                    borderRadius: '7px',
                                    background: 'rgba(245, 158, 11, 0.2)',
                                    border: '1px solid rgba(245, 158, 11, 0.4)',
                                    color: '#fcd34d',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    fontSize: '0.75rem',
                                    fontWeight: '700'
                                }}
                                title="Reset View"
                            >
                                <RotateCcw size={14} />
                            </button>
                        )}

                        {/* Fullscreen Toggle */}
                        <button
                            type="button"
                            onClick={() => setIsFullscreen(prev => !prev)}
                            style={{
                                padding: '6px 9px',
                                borderRadius: '7px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                color: '#ffffff',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
                        >
                            <Maximize2 size={14} />
                        </button>

                        {/* Close Modal */}
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '50%',
                                background: 'rgba(239, 68, 68, 0.2)',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                color: '#fca5a5',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                marginLeft: '4px'
                            }}
                            title="Close"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Interactive Canvas Viewport */}
                <div
                    ref={containerRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    style={{
                        flex: 1,
                        background: '#020617',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        position: 'relative',
                        minHeight: isFullscreen ? 'calc(100vh - 120px)' : '480px',
                        maxHeight: isFullscreen ? 'calc(100vh - 120px)' : '65vh',
                        cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                        userSelect: 'none'
                    }}
                >
                    <div style={{
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
                        transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <img
                            src={proofUrl}
                            alt="Slip Proof"
                            draggable={false}
                            style={{
                                maxWidth: '100%',
                                maxHeight: isFullscreen ? '82vh' : '58vh',
                                objectFit: 'contain',
                                borderRadius: '6px',
                                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                                pointerEvents: 'none'
                            }}
                        />
                    </div>
                </div>

                {/* Modal Footer Controls */}
                <div style={{
                    padding: '0.75rem 1.25rem',
                    background: 'rgba(30, 41, 59, 0.8)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.6rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={handleDownload}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '7px',
                                background: '#10b981',
                                border: 'none',
                                color: '#ffffff',
                                fontSize: '0.78rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)'
                            }}
                        >
                            <Download size={14} /> Download Slip
                        </button>
                        <a
                            href={proofUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                                padding: '6px 12px',
                                borderRadius: '7px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                color: '#38bdf8',
                                fontSize: '0.78rem',
                                fontWeight: '700',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}
                        >
                            <ExternalLink size={14} /> Open Original Tab
                        </a>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '7px',
                            background: '#334155',
                            border: '1px solid #475569',
                            color: '#ffffff',
                            fontWeight: '700',
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                        }}
                    >
                        Close Preview
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Helper to convert image URL to base64 for PDF rendering ---
const fetchBase64ImageSafe = async (imageUrl) => {
    if (!imageUrl) return null;
    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn("PDF image load note:", e);
        return null;
    }
};

// --- Reusable 100% Offline Professional Fee Receipt PDF Generator ---
export const downloadOfficialReceiptPDF = async (receiptData, schoolInfo) => {
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
        const isMultiFamily = receiptData.isFamilyCombined || (receiptData.familyStudents && receiptData.familyStudents.length > 1);

        // Top Accent Bar
        doc.setFillColor(0, 120, 212);
        doc.rect(0, 0, 210, 5, 'F');

        // 1. School Header & Logo
        let hasLogo = false;
        const logoUrl = schoolInfo?.logo || schoolInfo?.logoUrl || '';
        if (logoUrl) {
            const base64Img = await fetchBase64ImageSafe(logoUrl);
            if (base64Img) {
                try {
                    doc.addImage(base64Img, 'PNG', 14, 9, 20, 20);
                    hasLogo = true;
                } catch (err) {
                    console.warn("Receipt logo addImage fallback:", err);
                }
            }
        }

        const headerTextX = hasLogo ? 38 : 14;
        const schoolTitle = (schoolInfo?.name && schoolInfo.name !== 'School Name' && schoolInfo.name !== 'School Report' 
            ? schoolInfo.name 
            : 'OFFICIAL SCHOOL RECEIPT').toUpperCase();

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.setTextColor(...darkColor);
        doc.text(schoolTitle, headerTextX, 15);

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        const schoolAddress = schoolInfo?.address || 'Main Campus, Pakistan';
        const schoolPhone = schoolInfo?.phone || schoolInfo?.contact || '+92 300 1234567';
        doc.text(`${schoolAddress} • Contact: ${schoolPhone}`, headerTextX, 20);

        // Receipt Type Tag
        doc.setFillColor(...primaryColor);
        doc.roundedRect(headerTextX, 23, isMultiFamily ? 64 : 52, 5.5, 1.2, 1.2, 'F');
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(isMultiFamily ? 'FAMILY FEE PAYMENT RECEIPT' : 'FEE PAYMENT RECEIPT', headerTextX + 2, 27);

        // Receipt Meta (Right Aligned)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...grayColor);
        doc.text('RECEIPT NO:', 196, 14, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...primaryColor);
        doc.text(receiptData.receiptNo || 'N/A', 196, 19, { align: 'right' });

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        doc.text(`Date: ${receiptData.dateString || ''} ${receiptData.timeString || ''}`, 196, 24, { align: 'right' });
        if (receiptData.dueDate) {
            doc.text(`Due Date: ${receiptData.dueDate}`, 196, 28, { align: 'right' });
        }

        // Horizontal Separator Line
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        doc.line(14, 32, 196, 32);

        // 2. Student / Household Information Card
        let infoBoxHeight = 28;
        let studentsListLines = [];

        if (isMultiFamily) {
            const namesSummary = (receiptData.familyStudents || []).map(s => `${s.studentName} (${s.className || 'Class'})`).join(', ');
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'bold');
            studentsListLines = doc.splitTextToSize(namesSummary, 142);
            const extraLines = Math.max(0, studentsListLines.length - 1);
            infoBoxHeight = 28 + (extraLines * 4);
        }

        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, 34, 182, infoBoxHeight, 2, 2, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(14, 34, 182, infoBoxHeight, 2, 2, 'S');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);

        const cashierName = receiptData.collectedBy || auth?.currentUser?.displayName || 'Principal Office';

        if (isMultiFamily) {
            doc.text('Father / Parent Name:', 18, 40);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkColor);
            doc.text(receiptData.fatherName || 'Parent / Guardian', 52, 40);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Household Children:', 120, 40);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text(`${receiptData.familyStudents?.length || 0} Students in Household`, 150, 40);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Children List:', 18, 46.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkColor);
            doc.setFontSize(7.5);
            doc.text(studentsListLines, 38, 46.5);

            const bottomRowY = 46.5 + (Math.max(1, studentsListLines.length) * 4) + 2.5;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Payment Mode:', 18, bottomRowY);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(22, 163, 74);
            doc.text(receiptData.paymentMode || 'Cash', 44, bottomRowY);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Cashier / Incharge:', 120, bottomRowY);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkColor);
            doc.text(cashierName, 150, bottomRowY);
        } else {
            doc.text('Student Name:', 18, 40);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkColor);
            doc.text(receiptData.studentName || 'N/A', 46, 40);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Roll No:', 120, 40);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkColor);
            doc.text(String(receiptData.rollNo || 'N/A'), 142, 40);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Class & Section:', 18, 48);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkColor);
            doc.text(receiptData.className || 'N/A', 46, 48);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Father Name:', 120, 48);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkColor);
            doc.text(receiptData.fatherName || 'N/A', 142, 48);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Payment Mode:', 18, 56);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(22, 163, 74);
            doc.text(receiptData.paymentMode || 'Cash', 46, 56);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Cashier / Incharge:', 120, 56);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...darkColor);
            doc.text(cashierName, 150, 56);
        }

        // 3. Fee Breakdown Table (Clean Multi-Child Sets Organization)
        let tableHead = [];
        let tableRows = [];

        if (isMultiFamily) {
            tableHead = [['#', 'Student Name', 'Class & Roll', 'Particulars / Fee Breakdown', 'Subtotal', 'Payment Status']];
            
            let householdGrandTotal = 0;
            let totalPaidInReceipt = Number(receiptData.totalPaid || 0);

            (receiptData.familyStudents || []).forEach((st, idx) => {
                const itemsList = Array.isArray(st.items) && st.items.length > 0 ? st.items : [];
                const calculatedItemsSum = itemsList.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
                const childSubtotal = Number(st.subtotal || st.totalDue || calculatedItemsSum || 0);
                householdGrandTotal += childSubtotal;

                const isChildPaying = st.isPaying !== false; // Default true unless explicitly excluded
                const isChildPaid = st.isPaid || isChildPaying;

                let itemsStr = itemsList.map(it => `${it.name || it.title || 'Fee'} (Rs ${Number(it.amount || 0).toLocaleString()})`).join(', ');
                if (!itemsStr) {
                    itemsStr = `Monthly Tuition Fee (Rs ${childSubtotal.toLocaleString()})`;
                }

                tableRows.push([
                    idx + 1,
                    st.studentName || 'Student',
                    `${st.className || 'Class'}\n(R# ${st.rollNo || 'N/A'})`,
                    itemsStr,
                    `Rs ${childSubtotal.toLocaleString()}`,
                    isChildPaying ? 'PAID ✓' : 'PENDING / DUE ⏳'
                ]);
            });

            if (Number(receiptData.fineAmount) > 0) {
                tableRows.push([
                    '-',
                    'Late Fine Surcharge',
                    '-',
                    'Late Payment Penalty',
                    `Rs ${Number(receiptData.fineAmount).toLocaleString()}`,
                    'PAID ✓'
                ]);
            }

            if (Number(receiptData.discount) > 0) {
                tableRows.push([
                    '-',
                    'Family Concession',
                    '-',
                    'Special Sibling / Concession Discount',
                    `- Rs ${Number(receiptData.discount).toLocaleString()}`,
                    'DISCOUNT'
                ]);
            }
        } else {
            tableHead = [['#', 'Fee Description / Particulars', 'Amount (PKR)', 'Status']];
            (receiptData.items || []).forEach((item, idx) => {
                tableRows.push([
                    idx + 1,
                    item.name,
                    `Rs ${Number(item.amount).toLocaleString()}`,
                    item.isWaived ? 'WAIVED' : 'PAID ✓'
                ]);
            });

            if (receiptData.discount > 0) {
                tableRows.push([
                    '-',
                    'Discount / Concession Granted',
                    `- Rs ${Number(receiptData.discount).toLocaleString()}`,
                    'DISCOUNT'
                ]);
            }
        }

        autoTable(doc, {
            startY: 34 + infoBoxHeight + 4,
            head: tableHead,
            body: tableRows,
            theme: 'grid',
            headStyles: {
                fillColor: [15, 23, 42],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 8,
                halign: 'left'
            },
            columnStyles: isMultiFamily ? {
                0: { halign: 'center', cellWidth: 8 },
                1: { halign: 'left', fontStyle: 'bold', cellWidth: 32 },
                2: { halign: 'left', cellWidth: 26 },
                3: { halign: 'left' },
                4: { halign: 'right', fontStyle: 'bold', cellWidth: 26 },
                5: { halign: 'center', fontStyle: 'bold', cellWidth: 26 }
            } : {
                0: { halign: 'center', cellWidth: 12 },
                1: { halign: 'left' },
                2: { halign: 'right', fontStyle: 'bold', cellWidth: 38 },
                3: { halign: 'center', fontStyle: 'bold', cellWidth: 26 }
            },
            styles: {
                font: 'helvetica',
                fontSize: 8,
                cellPadding: 3,
                lineColor: [226, 232, 240]
            },
            didParseCell: function(data) {
                if (data.section === 'body') {
                    const statusVal = isMultiFamily ? data.row.raw[5] : data.row.raw[3];
                    if (statusVal === 'PAID ✓') {
                        if ((isMultiFamily && data.column.index === 5) || (!isMultiFamily && data.column.index === 3)) {
                            data.cell.styles.textColor = [22, 163, 74];
                            data.cell.styles.fillColor = [240, 253, 244];
                        }
                    } else if (statusVal === 'PENDING / DUE ⏳') {
                        if (data.column.index === 5) {
                            data.cell.styles.textColor = [220, 38, 38];
                            data.cell.styles.fillColor = [254, 242, 242];
                        }
                    }
                }
            }
        });

        const finalY = doc.lastAutoTable?.finalY || 120;

        // 4. Financial Reconciliation Summary Box
        const reconY = finalY + 4;
        const totalPaidAmt = Number(receiptData.totalPaid || 0);
        const remainingBal = Number(receiptData.remainingBalance || 0);
        const totalBilled = totalPaidAmt + remainingBal;

        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, reconY, 182, 16, 2, 2, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(14, reconY, 182, 16, 2, 2, 'S');

        // Total Billed Block
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('TOTAL BILLED:', 20, reconY + 6);
        doc.setFontSize(9.5);
        doc.setTextColor(...darkColor);
        doc.text(`Rs ${totalBilled.toLocaleString()}`, 20, reconY + 12);

        // Total Paid Block
        doc.setFontSize(7);
        doc.setTextColor(22, 163, 74);
        doc.text('AMOUNT PAID NOW:', 85, reconY + 6);
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(22, 163, 74);
        doc.text(`Rs ${totalPaidAmt.toLocaleString()}`, 85, reconY + 12);

        // Remaining Balance Block
        doc.setFontSize(7);
        doc.setTextColor(remainingBal > 0 ? [220, 38, 38] : [100, 116, 139]);
        doc.text('REMAINING BALANCE DUE:', 145, reconY + 6);
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(remainingBal > 0 ? [220, 38, 38] : [22, 163, 74]);
        doc.text(remainingBal > 0 ? `Rs ${remainingBal.toLocaleString()}` : 'Rs 0 (Fully Cleared ✓)', 145, reconY + 12);

        if (receiptData.remarks) {
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text(`Remarks / Notes: ${receiptData.remarks}`, 14, reconY + 22);
        }

        // 5. Footer & Signature
        const footerY = Math.max(reconY + (receiptData.remarks ? 28 : 22), 150);
        doc.setDrawColor(203, 213, 225);
        doc.setLineDashPattern([2, 2], 0);
        doc.line(14, footerY, 196, footerY);
        doc.setLineDashPattern([], 0);

        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        doc.text(`* Official computer-generated fee receipt. Verified by Cashier: ${cashierName}`, 14, footerY + 6);
        doc.text('Valid without physical stamp. Retain this computerized voucher for your records.', 14, footerY + 10);

        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.5);
        doc.line(145, footerY + 14, 196, footerY + 14);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...darkColor);
        doc.text('Authorized Signature & Stamp', 170.5, footerY + 19, { align: 'center' });

        const safeName = (isMultiFamily ? (receiptData.fatherName || 'Family') : (receiptData.studentName || 'Student')).replace(/[^a-zA-Z0-9_-]/g, '_');
        doc.save(`Fee_Receipt_${receiptData.receiptNo}_${safeName}.pdf`);
        return true;
    } catch (err) {
        console.error("PDF generation failed:", err);
        return false;
    }
};

// --- 100% Offline Professional Family Fee Challan PDF Generator ---
export const downloadFamilyFeeChallanPDF = async ({
    schoolInfo,
    feeCalculation,
    targetMonthName,
    targetYear,
    fatherName,
    feeSettings,
    cashierName
}) => {
    try {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const darkColor = [15, 23, 42];     // #0f172a
        const grayColor = [100, 116, 139];  // #64748b
        const primaryColor = [2, 132, 199]; // Sky-600

        // Top decorative accent bar
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, 210, 5, 'F');

        // School Logo
        let hasLogo = false;
        const logoUrl = schoolInfo?.logo || schoolInfo?.logoUrl || '';
        if (logoUrl) {
            const base64Img = await fetchBase64ImageSafe(logoUrl);
            if (base64Img) {
                try {
                    doc.addImage(base64Img, 'PNG', 14, 9, 20, 20);
                    hasLogo = true;
                } catch (err) {
                    console.warn("Challan logo addImage fallback:", err);
                }
            }
        }

        // School Branding Header
        const textX = hasLogo ? 38 : 14;
        const schoolName = (schoolInfo?.name || schoolInfo?.schoolName || 'ACADEMIC EXCELLENCE MODEL SCHOOL').toUpperCase();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.setTextColor(...darkColor);
        doc.text(schoolName, textX, 15);

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        const schoolAddress = schoolInfo?.address || 'Main Campus, Pakistan';
        const schoolPhone = schoolInfo?.phone || schoolInfo?.contact || '+92 300 1234567';
        doc.text(`${schoolAddress} • Contact: ${schoolPhone}`, textX, 20);

        // Challan Title Badge
        doc.setFillColor(240, 249, 255);
        doc.setDrawColor(125, 211, 252);
        doc.setLineWidth(0.5);
        doc.roundedRect(14, 25, 182, 11, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(3, 105, 161);
        doc.text(`OFFICIAL FAMILY FEE CHALLAN & ASSESSMENT — ${targetMonthName.toUpperCase()} ${targetYear}`, 18, 32);

        const issueDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const dueDay = feeSettings?.dueDate || 10;
        const dueDate = `${dueDay} ${targetMonthName} ${targetYear}`;

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`Issue Date: ${issueDate}  |  Due Date: ${dueDate}`, 210 - 18, 32, { align: 'right' });

        // Family Info Box
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(14, 39, 182, 16, 2, 2, 'FD');

        const activeCashier = cashierName || auth?.currentUser?.displayName || 'Principal Office';

        doc.setFontSize(8);
        doc.setTextColor(...darkColor);
        doc.setFont('helvetica', 'bold');
        doc.text(`Household of: ${fatherName}`, 18, 45.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        doc.text(`Total Registered Sibling Students: ${feeCalculation?.activeSiblingsCount || feeCalculation?.studentsBreakdown?.length || 1} Children`, 18, 51);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`Operator: ${activeCashier}`, 210 - 18, 45.5, { align: 'right' });
        doc.setTextColor(2, 132, 199);
        doc.text(`Voucher Type: Combined Family Assessment`, 210 - 18, 51, { align: 'right' });

        // Table Rows per Student (Modular Categorized Sets: Tuition/Transport, Store, Actions, Arrears, Subtotal, Status)
        let totalHouseholdBilled = 0;
        let totalVoucherPaying = 0;
        let totalRemainingPending = 0;

        const rows = (feeCalculation?.studentsBreakdown || []).map((sib, idx) => {
            const tuitionTransport = (Number(sib.tuitionFee || sib.baseFee || 0));
            const storeAmt = Number(sib.storeFee || 0);
            const actionsAmt = Number(sib.actionsFee || 0);
            const arrearsAmt = Number(sib.previousMonthsArrears || 0);
            const childTotal = Number(sib.subtotal || (tuitionTransport + storeAmt + actionsAmt + arrearsAmt) || 0);
            
            totalHouseholdBilled += childTotal;

            const isPaying = sib.isPaying !== false;
            if (isPaying) {
                totalVoucherPaying += childTotal;
            } else {
                totalRemainingPending += childTotal;
            }

            const statusText = sib.isPaid ? 'PAID ✓' : isPaying ? 'PAYING NOW' : 'PENDING / DUE ⏳';

            return [
                idx + 1,
                sib.studentName,
                `${sib.className} (R# ${sib.rollNo})`,
                tuitionTransport > 0 ? `Rs ${tuitionTransport.toLocaleString()}` : '-',
                storeAmt > 0 ? `Rs ${storeAmt.toLocaleString()}` : '-',
                actionsAmt > 0 ? `Rs ${actionsAmt.toLocaleString()}` : '-',
                arrearsAmt > 0 ? `Rs ${arrearsAmt.toLocaleString()}` : '-',
                `Rs ${childTotal.toLocaleString()}`,
                statusText
            ];
        });

        autoTable(doc, {
            startY: 58,
            head: [[
                '#',
                'Student Name',
                'Class & Roll',
                'Tuition & Bus',
                'Store / Items',
                'Actions / Fees',
                'Arrears',
                'Total Due',
                'Status'
            ]],
            body: rows,
            theme: 'grid',
            headStyles: {
                fillColor: [15, 23, 42],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 7.5,
                halign: 'center'
            },
            bodyStyles: {
                fontSize: 7.5,
                textColor: [51, 65, 85],
                cellPadding: 2.8
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 8 },
                1: { halign: 'left', fontStyle: 'bold', textColor: [15, 23, 42], cellWidth: 36 },
                2: { halign: 'left', cellWidth: 26 },
                3: { halign: 'right', cellWidth: 22 },
                4: { halign: 'right', cellWidth: 20 },
                5: { halign: 'right', cellWidth: 20 },
                6: { halign: 'right', textColor: [220, 38, 38], cellWidth: 18 },
                7: { halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42], cellWidth: 20 },
                8: { halign: 'center', fontStyle: 'bold', cellWidth: 22 }
            },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 8) {
                    const val = data.row.raw[8];
                    if (val === 'PAID ✓' || val === 'PAYING NOW') {
                        data.cell.styles.textColor = [22, 163, 74];
                        data.cell.styles.fillColor = [240, 253, 244];
                    } else if (val === 'PENDING / DUE ⏳') {
                        data.cell.styles.textColor = [220, 38, 38];
                        data.cell.styles.fillColor = [254, 242, 242];
                    }
                }
            },
            margin: { left: 14, right: 14 }
        });

        const finalY = doc.lastAutoTable.finalY + 4;

        // Financial Reconciliation Summary Box
        doc.setFillColor(240, 249, 255);
        doc.setDrawColor(125, 211, 252);
        doc.roundedRect(14, finalY, 182, 16, 2, 2, 'FD');

        // Total Household Billing
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayColor);
        doc.text('TOTAL HOUSEHOLD DUE:', 20, finalY + 6);
        doc.setFontSize(9.5);
        doc.setTextColor(3, 105, 161);
        doc.text(`Rs ${totalHouseholdBilled.toLocaleString()}`, 20, finalY + 12);

        // Voucher Payable
        doc.setFontSize(7);
        doc.setTextColor(22, 163, 74);
        doc.text('PAYING IN THIS VOUCHER:', 85, finalY + 6);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(22, 163, 74);
        doc.text(`Rs ${totalVoucherPaying.toLocaleString()}`, 85, finalY + 12);

        // Remaining Household Balance
        doc.setFontSize(7);
        doc.setTextColor(totalRemainingPending > 0 ? [220, 38, 38] : [100, 116, 139]);
        doc.text('REMAINING HOUSEHOLD DUE:', 145, finalY + 6);
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(totalRemainingPending > 0 ? [220, 38, 38] : [22, 163, 74]);
        doc.text(totalRemainingPending > 0 ? `Rs ${totalRemainingPending.toLocaleString()}` : 'Rs 0 (All Paying ✓)', 145, finalY + 12);

        // Instructions and Signatures
        const instrY = finalY + 20;

        // Payment Bank Details / Channel Box
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(14, instrY, 110, 24, 2, 2, 'FD');

        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text("OFFICIAL PAYMENT INSTRUCTIONS & VERIFICATION:", 18, instrY + 5.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        doc.text("• Pay at School Cash Counter or via EasyPaisa / JazzCash / Bank.", 18, instrY + 10.5);
        doc.text("• Unpaid sibling balances will carry forward into the next month statement.", 18, instrY + 15);
        doc.text("• Keep this computerized slip as formal proof of fee assessment.", 18, instrY + 19.5);

        // Stamp / Signature
        doc.line(140, instrY + 15, 196, instrY + 15);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkColor);
        doc.text("Accounts Officer / Principal Stamp", 168, instrY + 19, { align: 'center' });
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);
        doc.text(`Cashier: ${activeCashier}`, 168, instrY + 23, { align: 'center' });

        // Save PDF
        const cleanName = (fatherName || 'Family').replace(/[^a-zA-Z0-9]/g, '_');
        doc.save(`Family_Fee_Challan_${cleanName}_${targetMonthName}_${targetYear}.pdf`);
        return true;
    } catch (err) {
        console.error("Error generating family challan PDF:", err);
        alert("Failed to generate Family Fee Challan PDF.");
        return false;
    }
};

// --- Beautiful Payment Success / Failure Popup Modal ---
const PaymentResultModal = ({ isOpen, onClose, isSuccess, receiptData, errorMessage, schoolInfo }) => {
    if (!isOpen) return null;

    const handleDownloadPDF = () => {
        if (receiptData) {
            downloadOfficialReceiptPDF(receiptData, schoolInfo);
        }
    };

    const handlePrint = () => {
        if (!receiptData) return;
        const printWindow = window.open('', '', 'width=800,height=900');
        if (!printWindow) return;
        printWindow.document.write(`
            <html>
                <head>
                    <title>Fee Receipt - ${receiptData.receiptNo}</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; color: #1e293b; }
                        .container { max-width: 600px; margin: 0 auto; border: 2px solid #0f172a; padding: 20px; border-radius: 8px; }
                        .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
                        .school { font-size: 20px; font-weight: 800; text-transform: uppercase; }
                        .table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
                        .table th, .table td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; }
                        .total { font-weight: 800; font-size: 15px; border-top: 2px solid #0f172a; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div class="school">${schoolInfo?.name || 'School Office'}</div>
                            <div style="font-size:12px;color:#64748b;margin-top:4px;">Official Fee Receipt • ${receiptData.receiptNo}</div>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:12px;">
                            <div><strong>Student/Family:</strong> ${receiptData.studentName}</div>
                            <div><strong>Date:</strong> ${receiptData.dateString}</div>
                        </div>
                        <table class="table">
                            <thead>
                                <tr><th>Particular</th><th style="text-align:right;">Amount (PKR)</th></tr>
                            </thead>
                            <tbody>
                                ${(receiptData.items || []).map(it => `<tr><td>${it.name}</td><td style="text-align:right;">Rs ${Number(it.amount || 0).toLocaleString()}</td></tr>`).join('')}
                                <tr class="total"><td>Total Paid</td><td style="text-align:right;">Rs ${Number(receiptData.totalPaid || 0).toLocaleString()}</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <script>
                        window.onload = () => { window.print(); window.close(); };
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const handleSendWhatsApp = () => {
        if (!receiptData?.fatherPhone) {
            alert("No phone number available for parent.");
            return;
        }
        let clean = receiptData.fatherPhone.toString().replace(/[^0-9]/g, '');
        if (clean.startsWith('0092')) clean = clean.slice(2);
        else if (clean.startsWith('03')) clean = '92' + clean.slice(1);
        
        const schoolTitle = schoolInfo?.name || 'School Office';
        const itemsSummary = (receiptData.items || []).map(it => `• ${it.name}: Rs ${Number(it.amount || 0).toLocaleString()}`).join('\n');
        const text = `*FEE PAYMENT RECEIPT - ${schoolTitle.toUpperCase()}*\n\n` +
            `*Receipt No:* ${receiptData.receiptNo}\n` +
            `*Name:* ${receiptData.studentName} (${receiptData.className || ''})\n` +
            `*Father:* ${receiptData.fatherName || 'Parent'}\n` +
            `*Month:* ${receiptData.targetMonthName || ''} ${receiptData.targetYear || ''}\n` +
            `*Date:* ${receiptData.dateString} ${receiptData.timeString}\n` +
            `*Payment Mode:* ${receiptData.paymentMode}\n\n` +
            `*Breakdown:*\n${itemsSummary}\n` +
            `--------------------------\n` +
            `*TOTAL PAID:* Rs ${Number(receiptData.totalPaid || 0).toLocaleString()}\n` +
            `*Status:* Cleared ✓\n\n` +
            `_Thank you for your prompt payment!_`;

        window.open(`https://wa.me/${clean}?text=${encodeURIComponent(text)}`, '_blank');
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: '20px',
                width: '100%',
                maxWidth: '480px',
                padding: '1.75rem',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: isSuccess ? '2px solid #86efac' : '2px solid #fca5a5',
                textAlign: 'center',
                position: 'relative'
            }}>
                {/* Close X */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: '16px', right: '16px',
                        background: '#f1f5f9', border: 'none', borderRadius: '50%',
                        width: '32px', height: '32px', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', cursor: 'pointer', color: '#64748b'
                    }}
                >
                    <X size={18} />
                </button>

                {isSuccess ? (
                    <>
                        {/* Success Icon */}
                        <div style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                            border: '3px solid #22c55e',
                            color: '#16a34a',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 1rem auto',
                            boxShadow: '0 10px 20px rgba(34, 197, 94, 0.2)'
                        }}>
                            <CheckCircle2 size={36} color="#16a34a" />
                        </div>

                        <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0f172a', margin: '0 0 0.35rem 0' }}>
                            Payment Recorded! 🎉
                        </h2>
                        <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '0 0 1.25rem 0' }}>
                            Fee has been registered in the system and synchronized in real-time.
                        </p>

                        {/* Summary Card */}
                        <div style={{
                            background: '#f8fafc',
                            border: '1.5px solid #e2e8f0',
                            borderRadius: '14px',
                            padding: '1rem',
                            marginBottom: '1.25rem',
                            textAlign: 'left'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.82rem' }}>
                                <span style={{ color: '#64748b', fontWeight: '600' }}>Receipt #:</span>
                                <strong style={{ color: '#0f172a' }}>{receiptData?.receiptNo}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.82rem' }}>
                                <span style={{ color: '#64748b', fontWeight: '600' }}>Student / Family:</span>
                                <strong style={{ color: '#0f172a' }}>{receiptData?.studentName}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.82rem' }}>
                                <span style={{ color: '#64748b', fontWeight: '600' }}>Payment Mode:</span>
                                <strong style={{ color: '#0f172a' }}>{receiptData?.paymentMode}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px dashed #cbd5e1', paddingTop: '8px', marginTop: '6px', fontSize: '1rem' }}>
                                <span style={{ color: '#166534', fontWeight: '800' }}>Total Paid:</span>
                                <strong style={{ color: '#16a34a', fontWeight: '900' }}>
                                    Rs {Number(receiptData?.totalPaid || 0).toLocaleString()}
                                </strong>
                            </div>
                        </div>

                        {/* Action Buttons Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.75rem' }}>
                            <button
                                type="button"
                                onClick={handleDownloadPDF}
                                style={{
                                    padding: '0.65rem',
                                    borderRadius: '10px',
                                    background: '#0f172a',
                                    color: '#ffffff',
                                    border: 'none',
                                    fontWeight: '800',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    boxShadow: '0 4px 10px rgba(15, 23, 42, 0.2)'
                                }}
                            >
                                <Download size={15} /> Download PDF
                            </button>
                            <button
                                type="button"
                                onClick={handlePrint}
                                style={{
                                    padding: '0.65rem',
                                    borderRadius: '10px',
                                    background: '#ffffff',
                                    color: '#0f172a',
                                    border: '1.5px solid #0f172a',
                                    fontWeight: '800',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                }}
                            >
                                <Printer size={15} /> Print Slip
                            </button>
                        </div>

                        {receiptData?.fatherPhone && (
                            <button
                                type="button"
                                onClick={handleSendWhatsApp}
                                style={{
                                    width: '100%',
                                    padding: '0.65rem',
                                    borderRadius: '10px',
                                    background: '#f0fdf4',
                                    color: '#15803d',
                                    border: '1.5px solid #86efac',
                                    fontWeight: '800',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    marginBottom: '0.75rem'
                                }}
                            >
                                <Send size={15} /> Send WhatsApp Receipt
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                width: '100%',
                                padding: '0.65rem',
                                borderRadius: '10px',
                                background: '#f1f5f9',
                                color: '#475569',
                                border: 'none',
                                fontWeight: '800',
                                fontSize: '0.84rem',
                                cursor: 'pointer'
                            }}
                        >
                            ✓ Done / Next Student
                        </button>
                    </>
                ) : (
                    <>
                        {/* Error Icon */}
                        <div style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: '#fee2e2',
                            border: '3px solid #ef4444',
                            color: '#dc2626',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 1rem auto'
                        }}>
                            <AlertTriangle size={36} color="#dc2626" />
                        </div>

                        <h2 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#b91c1c', margin: '0 0 0.35rem 0' }}>
                            Submission Failed
                        </h2>
                        <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '0 0 1.25rem 0' }}>
                            {errorMessage || 'Unable to record payment due to a network or verification error.'}
                        </p>

                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                width: '100%',
                                padding: '0.7rem',
                                borderRadius: '10px',
                                background: '#dc2626',
                                color: '#ffffff',
                                border: 'none',
                                fontWeight: '800',
                                fontSize: '0.85rem',
                                cursor: 'pointer'
                            }}
                        >
                            Close & Try Again
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};
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
                        {receiptData.isFamilyCombined || (receiptData.familyStudents && receiptData.familyStudents.length > 1) ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: '#f0f9ff', padding: '1rem', borderRadius: '8px', border: '1px solid #bae6fd', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                                <div>
                                    <span style={{ color: '#0369a1', fontWeight: '600' }}>Father / Parent: </span>
                                    <strong style={{ color: '#0f172a' }}>{receiptData.fatherName || 'Parent / Guardian'}</strong>
                                </div>
                                <div>
                                    <span style={{ color: '#0369a1', fontWeight: '600' }}>Family Children: </span>
                                    <strong style={{ color: '#0284c7' }}>{receiptData.familyStudents?.length || 0} Students Combined</strong>
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <span style={{ color: '#0369a1', fontWeight: '600' }}>Children: </span>
                                    <strong style={{ color: '#0f172a' }}>
                                        {(receiptData.familyStudents || []).map(s => `${s.studentName} (${s.className})`).join(', ')}
                                    </strong>
                                </div>
                                <div>
                                    <span style={{ color: '#0369a1', fontWeight: '600' }}>Date & Time: </span>
                                    <strong style={{ color: '#0f172a' }}>{receiptData.dateString} {receiptData.timeString}</strong>
                                </div>
                                <div>
                                    <span style={{ color: '#0369a1', fontWeight: '600' }}>Payment Mode: </span>
                                    <strong style={{ color: '#16a34a' }}>{receiptData.paymentMode}</strong>
                                </div>
                            </div>
                        ) : (
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
                        )}

                        {/* Fee Breakdown Table */}
                        {receiptData.isFamilyCombined || (receiptData.familyStudents && receiptData.familyStudents.length > 1) ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                                        <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', color: '#1e293b', fontWeight: '700' }}>Student</th>
                                        <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', color: '#1e293b', fontWeight: '700' }}>Class</th>
                                        <th style={{ padding: '0.5rem 0.65rem', textAlign: 'left', color: '#1e293b', fontWeight: '700' }}>Fee Particulars</th>
                                        <th style={{ padding: '0.5rem 0.65rem', textAlign: 'right', color: '#1e293b', fontWeight: '700' }}>Amount (Rs)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(receiptData.familyStudents || []).map((st, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.5rem 0.65rem', fontWeight: '700', color: '#0f172a' }}>{st.studentName}</td>
                                            <td style={{ padding: '0.5rem 0.65rem', color: '#475569' }}>{st.className || 'Class'}</td>
                                            <td style={{ padding: '0.5rem 0.65rem', color: '#334155' }}>
                                                {(st.items || []).map(it => `${it.name} (Rs ${Number(it.amount).toLocaleString()})`).join(', ') || 'Monthly Tuition'}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.65rem', textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>
                                                Rs {Number(st.subtotal || st.totalDue || st.amount || 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                    {Number(receiptData.fineAmount) > 0 && (
                                        <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#fffbeb' }}>
                                            <td colSpan={3} style={{ padding: '0.5rem 0.65rem', fontWeight: '700', color: '#b45309' }}>Late Fine / Penalty</td>
                                            <td style={{ padding: '0.5rem 0.65rem', textAlign: 'right', fontWeight: '700', color: '#b45309' }}>
                                                Rs {Number(receiptData.fineAmount).toLocaleString()}
                                            </td>
                                        </tr>
                                    )}
                                    {Number(receiptData.discount) > 0 && (
                                        <tr style={{ borderBottom: '1px solid #f1f5f9', color: '#16a34a' }}>
                                            <td colSpan={3} style={{ padding: '0.5rem 0.65rem', fontWeight: '600' }}>Family Discount / Concession</td>
                                            <td style={{ padding: '0.5rem 0.65rem', textAlign: 'right', fontWeight: '600' }}>
                                                - Rs {Number(receiptData.discount).toLocaleString()}
                                            </td>
                                        </tr>
                                    )}
                                    <tr style={{ borderTop: '2px solid #0f172a', background: '#f8fafc' }}>
                                        <td colSpan={3} style={{ padding: '0.75rem 0.65rem', fontWeight: '800', fontSize: '0.95rem', color: '#0f172a' }}>TOTAL FAMILY NET PAID</td>
                                        <td style={{ padding: '0.75rem 0.65rem', textAlign: 'right', fontWeight: '800', fontSize: '1.1rem', color: '#16a34a' }}>
                                            Rs {Number(receiptData.totalPaid).toLocaleString()}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        ) : (
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
                        )}

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
// --- DEPRECATED INLINE FINANCES DASHBOARD (Modularized to ../components/FinancesDashboard.jsx) ---
// ==========================================
const _DeprecatedOldFinances = ({ schoolId, currentAction, schoolInfo: parentSchoolInfo, classes = [] }) => {
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
                    }, (err) => {
                        console.warn("Performance students listener warning:", err);
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

    // Sync when props change from navigation
    useEffect(() => {
        if (preselectedClassId) setSelectedClassId(preselectedClassId);
        if (preselectedStudentId) setSelectedStudentId(preselectedStudentId);
    }, [preselectedClassId, preselectedStudentId]);

    // Global Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [allStudents, setAllStudents] = useState([]);
    const [allParents, setAllParents] = useState([]);
    const [loadingAllStudents, setLoadingAllStudents] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);

    // 2. Selected Student Fee Calculation & Payment Form
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [transactionRefId, setTransactionRefId] = useState('');
    const [proofFile, setProofFile] = useState(null);
    const [proofPreview, setProofPreview] = useState(null);
    const [receivedAmount, setReceivedAmount] = useState('');
    const [discountAmount, setDiscountAmount] = useState('');
    const [fineAmount, setFineAmount] = useState('0');
    const [remarks, setRemarks] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

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

    // Assessment Card View: 'assessment' | 'history' (Smooth swipe transition)
    const [assessmentViewMode, setAssessmentViewMode] = useState('assessment');
    const [studentHistoryTxs, setStudentHistoryTxs] = useState([]);
    const [loadingStudentHistory, setLoadingStudentHistory] = useState(false);

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

    // Payment Proof Screenshot Lightbox State
    const [proofModal, setProofModal] = useState({ isOpen: false, url: '', title: '' });

    // 3. Receipt State
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [receiptData, setReceiptData] = useState(null);
    const [paymentResultModal, setPaymentResultModal] = useState({ isOpen: false, isSuccess: true, receiptData: null, errorMessage: '' });

    // 4. Recent Transactions Log
    const [recentTransactions, setRecentTransactions] = useState([]);
    const [loadingTransactions, setLoadingTransactions] = useState(true);
    const [isGeneratingDailyPDF, setIsGeneratingDailyPDF] = useState(false);
    const [isGeneratingFinancesPDF, setIsGeneratingFinancesPDF] = useState(false);
    const [localSchoolInfo, setLocalSchoolInfo] = useState(schoolInfo || { name: 'School Report', logo: '' });

    // 4.1 Live Online Payment Submissions & Alert Engine
    const [onlineSubmissions, setOnlineSubmissions] = useState([]);
    const [loadingOnlineSubmissions, setLoadingOnlineSubmissions] = useState(true);
    const [reviewModalSub, setReviewModalSub] = useState(null);
    const [reuploadModalSub, setReuploadModalSub] = useState(null);
    const [reuploadReason, setReuploadReason] = useState('');
    const [rejectModalSubOnline, setRejectModalSubOnline] = useState(null);
    const [rejectReasonOnline, setRejectReasonOnline] = useState('');
    const [onlinePaymentAlert, setOnlinePaymentAlert] = useState(null);
    const [processingOnlineId, setProcessingOnlineId] = useState(null);
    const prevSubmissionsCountRef = useRef(null);

    const playOnlinePaymentChime = () => {
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

    // Live Submissions Listener
    useEffect(() => {
        if (!schoolId) return;
        const subsRef = collection(db, `schools/${schoolId}/paymentSubmissions`);
        const qSubs = query(subsRef);

        const unsub = onSnapshot(qSubs, (snapshot) => {
            const list = [];
            snapshot.forEach(d => {
                list.push({ id: d.id, ...d.data() });
            });
            list.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

            const pendingList = list.filter(s => (s.status || 'pending') === 'pending');

            // Trigger chime & alert if new pending submission arrived
            if (prevSubmissionsCountRef.current !== null && pendingList.length > prevSubmissionsCountRef.current) {
                playOnlinePaymentChime();
                const latest = pendingList[0];
                if (latest) {
                    setOnlinePaymentAlert(latest);
                }
            }
            prevSubmissionsCountRef.current = pendingList.length;

            setOnlineSubmissions(list);
            setLoadingOnlineSubmissions(false);

            // Auto-heal: Ensure all approved online submissions are synchronized into feeTransactions
            const approvedList = list.filter(s => s.status === 'approved');
            if (approvedList.length > 0) {
                approvedList.forEach(async (sub) => {
                    const receiptNo = sub.receiptNo || (sub.transactionId ? `ONL-${sub.transactionId}` : `ONL-${sub.id.slice(-6)}`);
                    try {
                        const txRef = doc(db, `schools/${schoolId}/feeTransactions`, receiptNo);
                        const txSnap = await getDoc(txRef);
                        if (!txSnap.exists()) {
                            const approvedDate = sub.approvedAt ? new Date(sub.approvedAt) : (sub.submittedAt ? new Date(sub.submittedAt) : new Date());
                            const dateString = approvedDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                            const timeString = approvedDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                            const finalAmount = Number(sub.amount) || 0;

                            const transactionRecord = {
                                receiptNo,
                                isFamilyCombined: false,
                                familyStudents: [],
                                studentId: sub.studentId || '',
                                studentName: sub.studentName || 'Student',
                                rollNo: sub.rollNo || 'N/A',
                                classId: sub.classId || '',
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
                                timestamp: approvedDate,
                                dateString,
                                timeString,
                                collectedBy: 'Online Portal'
                            };

                            await setDoc(txRef, {
                                ...transactionRecord,
                                id: receiptNo,
                                timestamp: serverTimestamp()
                            }, { merge: true });
                        }
                    } catch (e) {
                        console.warn("Backfill online transaction error:", e);
                    }
                });
            }
        }, (err) => {
            console.warn("Error fetching online submissions for DailyWorkflow:", err);
            setLoadingOnlineSubmissions(false);
        });

        return () => unsub();
    }, [schoolId]);

    // Handle Approve Online Payment Submission
    const handleApproveOnlineSubmission = async (sub) => {
        if (!window.confirm(`Approve fee payment of Rs. ${Number(sub.amount || 0).toLocaleString()} for ${sub.studentName} (${sub.className})?`)) {
            return;
        }

        setProcessingOnlineId(sub.id);
        try {
            const now = new Date();
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
                transactionId: sub.transactionId || null,
                remarks: sub.transactionId ? `TRX ID: ${sub.transactionId}` : 'Online Payment Approved',
                dueDate: null,
                targetMonthKey: monthKey,
                timestamp: new Date(),
                dateString,
                timeString,
                collectedBy: 'Online Portal'
            };

            // 1. Instant Optimistic State Update for Today's Recent Fee Collections Log
            setRecentTransactions(prev => [transactionRecord, ...prev.filter(t => t.receiptNo !== receiptNo)]);

            const studentHistoryEntry = {
                status: 'paid',
                paidAmount: finalAmount,
                remainingBalance: 0,
                paidAt: now.toISOString(),
                receiptNo,
                paymentMode: `Online - ${sub.paymentMethod || 'Transfer'}`,
                proofUrl: sub.proofUrl || null,
                transactionId: sub.transactionId || null,
                monthKey
            };

            // 2. Update Student Doc
            if (sub.classId && sub.studentId) {
                const classStudentRef = doc(db, `schools/${schoolId}/classes/${sub.classId}/students`, sub.studentId);
                await setDoc(classStudentRef, {
                    monthlyFeeStatus: 'paid',
                    monthlyFeeDate: now.toISOString(),
                    paidMonths: arrayUnion(monthKey),
                    [`monthlyFeeHistory.${monthKey}`]: studentHistoryEntry,
                    lastPaymentMode: sub.paymentMethod || 'Online Transfer',
                    lastPaymentAmount: finalAmount,
                    lastReceiptNo: receiptNo,
                    lastPaymentProofUrl: sub.proofUrl || null,
                    pendingPaymentSubmission: {
                        status: 'approved',
                        approvedAt: now.toISOString()
                    }
                }, { merge: true });
            }

            // 3. Update Master Student Doc
            if (sub.studentId) {
                try {
                    const masterStudentRef = doc(db, `schools/${schoolId}/students`, sub.studentId);
                    await setDoc(masterStudentRef, {
                        monthlyFeeStatus: 'paid',
                        monthlyFeeDate: now.toISOString(),
                        paidMonths: arrayUnion(monthKey),
                        [`monthlyFeeHistory.${monthKey}`]: studentHistoryEntry,
                        lastPaymentMode: sub.paymentMethod || 'Online Transfer',
                        lastPaymentAmount: finalAmount,
                        lastReceiptNo: receiptNo,
                        lastPaymentProofUrl: sub.proofUrl || null,
                        pendingPaymentSubmission: {
                            status: 'approved',
                            approvedAt: now.toISOString()
                        }
                    }, { merge: true });
                } catch (_) {}
            }

            // 4. Update Submission Doc Status
            const subRef = doc(db, `schools/${schoolId}/paymentSubmissions`, sub.id);
            await updateDoc(subRef, {
                status: 'approved',
                approvedAt: now.toISOString()
            });

            // 5. Add to feeTransactions collection
            const txDocRef = doc(db, `schools/${schoolId}/feeTransactions`, receiptNo);
            await setDoc(txDocRef, {
                ...transactionRecord,
                id: receiptNo,
                timestamp: serverTimestamp()
            }, { merge: true });

            // 6. Download receipt PDF or preview
            downloadOfficialReceiptPDF(transactionRecord, localSchoolInfo);
            setReceiptData(transactionRecord);
            setReceiptModalOpen(true);
            setReviewModalSub(null);

        } catch (err) {
            console.error("Error approving online submission:", err);
            alert("Failed to approve payment: " + err.message);
        } finally {
            setProcessingOnlineId(null);
        }
    };

    // Handle Request Re-upload
    const confirmRequestReupload = async () => {
        if (!reuploadModalSub) return;
        setProcessingOnlineId(reuploadModalSub.id);
        try {
            const nowIso = new Date().toISOString();
            const message = reuploadReason.trim() || 'Payment proof is unclear or incomplete. Please re-upload a clear screenshot.';

            const subRef = doc(db, `schools/${schoolId}/paymentSubmissions`, reuploadModalSub.id);
            await updateDoc(subRef, {
                status: 'needs_reupload',
                requestedAt: nowIso,
                reuploadNote: message
            });

            if (reuploadModalSub.classId && reuploadModalSub.studentId) {
                const classStudentRef = doc(db, `schools/${schoolId}/classes/${reuploadModalSub.classId}/students`, reuploadModalSub.studentId);
                await updateDoc(classStudentRef, {
                    'pendingPaymentSubmission.status': 'needs_reupload',
                    'pendingPaymentSubmission.message': message
                });
            }

            setReuploadModalSub(null);
            setReuploadReason('');
            setReviewModalSub(null);
        } catch (err) {
            console.error("Error requesting re-upload:", err);
            alert("Failed to request re-upload: " + err.message);
        } finally {
            setProcessingOnlineId(null);
        }
    };

    // Handle Reject Online Submission
    const confirmRejectOnlineSubmission = async () => {
        if (!rejectModalSubOnline) return;

        setProcessingOnlineId(rejectModalSubOnline.id);
        try {
            const nowIso = new Date().toISOString();
            const message = rejectReasonOnline.trim() || 'Payment proof could not be verified by administration.';
            const batch = writeBatch(db);

            // 1. Update submission doc
            const subRef = doc(db, `schools/${schoolId}/paymentSubmissions`, rejectModalSubOnline.id);
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
                submissionId: rejectModalSubOnline.id,
                paymentMethod: rejectModalSubOnline.paymentMethod || 'Online',
                amount: Number(rejectModalSubOnline.amount) || 0,
                transactionId: rejectModalSubOnline.transactionId || ''
            };

            if (rejectModalSubOnline.classId && rejectModalSubOnline.studentId) {
                const classStudentRef = doc(db, `schools/${schoolId}/classes/${rejectModalSubOnline.classId}/students`, rejectModalSubOnline.studentId);
                batch.set(classStudentRef, { pendingPaymentSubmission: rejectTag }, { merge: true });
            }
            if (rejectModalSubOnline.studentId) {
                const masterStudentRef = doc(db, `schools/${schoolId}/students`, rejectModalSubOnline.studentId);
                batch.set(masterStudentRef, { pendingPaymentSubmission: rejectTag }, { merge: true });
            }

            await batch.commit();
            setRejectModalSubOnline(null);
            setRejectReasonOnline('');
            setReviewModalSub(null);
        } catch (err) {
            console.error("Error rejecting submission:", err);
            alert("Failed to reject submission: " + err.message);
        } finally {
            setProcessingOnlineId(null);
        }
    };

    // 5. Daily Mode: 'fee_submission' (default) or 'income_expense'
    const [activeDailyMode, setActiveDailyMode] = useState('fee_submission');

    // 6. Offline Resilience & Auto-Sync Engine States
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ isSyncing: false, synced: 0, total: 0 });
    const isSyncingRef = useRef(false);
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
            localStorage.setItem(`offline_fee_queue_${schoolId}`, JSON.stringify(queue.slice(0, 200)));
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
        if (!navigator.onLine || isSyncingRef.current || !schoolId) return;
        isSyncingRef.current = true;
        setIsSyncing(true);
        setSyncProgress({ isSyncing: true, synced: 0, total: 0 });

        try {
            // 1. Sync Pending Fees via Chunked 50-Item Batch Offline Engine
            const syncResult = await syncOfflineFeeQueueInBatches(schoolId, db, (synced, total) => {
                setSyncProgress({ isSyncing: true, synced, total });
            });

            // Update local state queue
            const refreshedQ = await getOfflineFeeQueue(schoolId);
            setPendingOfflineTxs(refreshedQ);
            localStorage.setItem(`offline_fee_queue_${schoolId}`, JSON.stringify(refreshedQ.slice(0, 200)));

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
                    const curData = docSnap.exists() ? docSnap.data() : { incomes: [], expenses: [] };
                    const mergedIncomes = [...(curData.incomes || [])];
                    const mergedExpenses = [...(curData.expenses || [])];

                    currentFinancesQueue.forEach(item => {
                        if (item.category === 'incomes' && !mergedIncomes.some(i => i.id === item.id)) {
                            mergedIncomes.push(item);
                        } else if (item.category === 'expenses' && !mergedExpenses.some(e => e.id === item.id)) {
                            mergedExpenses.push(item);
                        }
                    });

                    await setDoc(docRef, { incomes: mergedIncomes, expenses: mergedExpenses }, { merge: true });
                    savePendingFinancesQueue([]);
                } catch (finSyncErr) {
                    console.warn("Finances sync error:", finSyncErr);
                }
            }
        } catch (err) {
            console.error("Auto-sync error in Collections:", err);
        } finally {
            isSyncingRef.current = false;
            setIsSyncing(false);
            setSyncProgress({ isSyncing: false, synced: 0, total: 0 });
        }
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
    const [newIncome, setNewIncome] = useState({ name: '', amount: '', remarks: '' });
    const [newExpense, setNewExpense] = useState({ name: '', amount: '', remarks: '' });
    const [incomeProofFile, setIncomeProofFile] = useState(null);
    const [incomeProofPreview, setIncomeProofPreview] = useState(null);
    const [expenseProofFile, setExpenseProofFile] = useState(null);
    const [expenseProofPreview, setExpenseProofPreview] = useState(null);
    const [isSavingIncome, setIsSavingIncome] = useState(false);
    const [isSavingExpense, setIsSavingExpense] = useState(false);
    const [rightCardTab, setRightCardTab] = useState('fee_slips'); // 'fee_slips' | 'finances_breakdown'

    const handleIncomeProofChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setIncomeProofFile(file);
            const previewUrl = URL.createObjectURL(file);
            setIncomeProofPreview(previewUrl);
        }
    };

    const handleRemoveIncomeProof = () => {
        setIncomeProofFile(null);
        if (incomeProofPreview) {
            URL.revokeObjectURL(incomeProofPreview);
        }
        setIncomeProofPreview(null);
    };

    const handleExpenseProofChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setExpenseProofFile(file);
            const previewUrl = URL.createObjectURL(file);
            setExpenseProofPreview(previewUrl);
        }
    };

    const handleRemoveExpenseProof = () => {
        setExpenseProofFile(null);
        if (expenseProofPreview) {
            URL.revokeObjectURL(expenseProofPreview);
        }
        setExpenseProofPreview(null);
    };

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

    // Dynamic Today's Incomes & Expenses (Strict 24-Hour Day Match - Auto Resets at 12 AM Midnight)
    const todayFinances = useMemo(() => {
        const now = new Date();
        const todayStr = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const endOfToday = startOfToday + 86400000;

        const isToday = (item) => {
            if (!item) return false;
            if (item.dateString && item.dateString === todayStr) return true;
            if (item.date && item.date === todayStr) return true;
            if (item.createdAt) {
                const itemDate = new Date(item.createdAt);
                if (!isNaN(itemDate.getTime())) {
                    const itemDateStr = itemDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                    if (itemDateStr === todayStr) return true;
                }
            }
            if (item.timestamp) {
                const itemDate = new Date(item.timestamp);
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

    const handleAddFinance = async (type, category, itemData, setSaving, setForm, proofFileToUpload, clearProofFn) => {
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

        let proofUrl = null;
        if (proofFileToUpload) {
            try {
                proofUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(proofFileToUpload);
                });
            } catch (e) {
                console.warn("Finance proof conversion fallback:", e);
            }
        }

        const now = new Date();
        const newItem = {
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: itemData.name.trim(),
            amount: Number(itemData.amount),
            remarks: itemData.remarks ? itemData.remarks.trim() : '',
            proofUrl: proofUrl || null,
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
        if (clearProofFn) clearProofFn();
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

    // Fetch all parent accounts to link multiple children from parent account
    useEffect(() => {
        if (!schoolId) return;
        const unsub = onSnapshot(collection(db, `schools/${schoolId}/parents`), (snapshot) => {
            const pList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setAllParents(pList);
        }, (err) => {
            console.warn("Parents listener error:", err);
        });
        return () => unsub();
    }, [schoolId]);

    // Fetch all students across classes for instant real-time search with IndexedDB Offline Support
    useEffect(() => {
        if (!schoolId) return;

        // 1. Instant 0ms offline hydration from IndexedDB
        getCachedStudentsOffline(schoolId).then(cached => {
            if (cached && cached.length > 0) {
                setAllStudents(prev => prev.length === 0 ? cached : prev);
            }
        }).catch(() => {});

        if (classes.length === 0) return;

        const loadAllStudents = async () => {
            setLoadingAllStudents(true);
            try {
                const studentsList = [];
                const promises = classes.map(async (cls) => {
                    try {
                        const snap = await getDocs(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
                        snap.docs.forEach(docSnap => {
                            studentsList.push({
                                id: docSnap.id,
                                classId: cls.id,
                                className: cls.name,
                                ...docSnap.data()
                            });
                        });
                    } catch (e) {
                        console.warn(`Class ${cls.name} fetch warning in offline mode:`, e);
                    }
                });
                await Promise.all(promises);
                if (studentsList.length > 0) {
                    setAllStudents(studentsList);
                    // Cache to IndexedDB (Supports 5,000+ students without 5MB limits)
                    cacheStudentsOffline(schoolId, studentsList);
                }
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
        }, (err) => {
            console.warn("Class students listener warning:", err);
            setLoadingClassStudents(false);
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
            const rawList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            // Defensive UI Deduplication by receiptNo
            const seenReceipts = new Set();
            const uniqueList = [];
            rawList.forEach(item => {
                const key = item.receiptNo || item.id;
                if (key && !seenReceipts.has(key)) {
                    seenReceipts.add(key);
                    uniqueList.push(item);
                } else if (!key) {
                    uniqueList.push(item);
                }
            });
            setRecentTransactions(uniqueList);
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
        const seen = new Set();
        return recentTransactions.filter(t => {
            const key = t.receiptNo || t.id;
            if (key) {
                if (seen.has(key)) return false;
                seen.add(key);
            }
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

    // Dynamic Today's Financial Overview (Income vs Expense Breakdown)
    const todayFinancialSummary = useMemo(() => {
        const totalIncomes = (todayFinances.incomes || []).reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        const totalExpenses = (todayFinances.expenses || []).reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        const netBalance = totalIncomes - totalExpenses;
        const incomeCount = (todayFinances.incomes || []).length;
        const expenseCount = (todayFinances.expenses || []).length;

        return {
            totalIncomes,
            totalExpenses,
            netBalance,
            incomeCount,
            expenseCount
        };
    }, [todayFinances]);

    // Real-time Fee Transactions Listener for Selected Student
    useEffect(() => {
        if (!schoolId || !selectedStudent?.id) {
            setStudentHistoryTxs([]);
            return;
        }

        setLoadingStudentHistory(true);
        const qStudentTxs = query(
            collection(db, `schools/${schoolId}/feeTransactions`),
            where('studentId', '==', selectedStudent.id),
            limit(40)
        );

        const unsub = onSnapshot(qStudentTxs, (snapshot) => {
            const rawList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            rawList.sort((a, b) => {
                const timeA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : (new Date(a.dateString || 0).getTime() || 0);
                const timeB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : (new Date(b.dateString || 0).getTime() || 0);
                return timeB - timeA;
            });
            // Deduplicate by receiptNo
            const seen = new Set();
            const unique = [];
            rawList.forEach(item => {
                const key = item.receiptNo || item.id;
                if (key && !seen.has(key)) {
                    seen.add(key);
                    unique.push(item);
                } else if (!key) {
                    unique.push(item);
                }
            });
            setStudentHistoryTxs(unique);
            setLoadingStudentHistory(false);
        }, (err) => {
            console.warn("Student history listener fallback:", err);
            setLoadingStudentHistory(false);
        });

        return () => unsub();
    }, [schoolId, selectedStudent?.id]);

    // Sibling / Family Detection Algorithm (Strictly Parent Account Linked Students)
    const detectedSiblings = useMemo(() => {
        if (!selectedStudent || allStudents.length === 0) return [];

        const studentParentId = selectedStudent.parentId || selectedStudent.parentDetails?.parentId || null;

        // 1. Find the official Parent Account (from schools/${schoolId}/parents) that links this student
        const parentLinkedStudentIds = new Set();
        parentLinkedStudentIds.add(selectedStudent.id); // Always include current student

        const matchingParent = allParents.find(p => {
            // Direct ID match
            if (studentParentId && p.id === studentParentId) return true;
            // Explicit linkedStudents list check
            if (p.linkedStudents && Array.isArray(p.linkedStudents) && p.linkedStudents.some(ls => ls.studentId === selectedStudent.id)) {
                return true;
            }
            return false;
        });

        // If parent account found, populate only students linked inside that parent account
        if (matchingParent && matchingParent.linkedStudents && Array.isArray(matchingParent.linkedStudents)) {
            matchingParent.linkedStudents.forEach(ls => {
                if (ls.studentId) parentLinkedStudentIds.add(ls.studentId);
            });
        }

        // Filter allStudents to ONLY include those in parentLinkedStudentIds
        const matched = allStudents.filter(s => {
            if (s.id === selectedStudent.id) return true;

            // Strict: Must be explicitly linked in the parent account
            if (parentLinkedStudentIds.has(s.id)) {
                return true;
            }

            // Direct parentId match if both point to the same registered parent
            if (studentParentId && (s.parentId === studentParentId || s.parentDetails?.parentId === studentParentId)) {
                return true;
            }

            return false;
        });

        // Defensive deduplication by student id
        const seen = new Set();
        const unique = [];
        matched.forEach(s => {
            if (!seen.has(s.id)) {
                seen.add(s.id);
                unique.push(s);
            }
        });

        // Selected student always first, then remaining siblings sorted by name
        return unique.sort((a, b) => (a.id === selectedStudent.id ? -1 : b.id === selectedStudent.id ? 1 : (a.name || '').localeCompare(b.name || '')));
    }, [selectedStudent, allStudents, allParents]);

    // Selected Siblings State for Combined Payment & Payment Scope ('family' | 'single')
    const [siblingPaymentScope, setSiblingPaymentScope] = useState('family');
    const [selectedSiblingIds, setSelectedSiblingIds] = useState([]);
    // Active Child Step Index (1 by 1 view)
    const [activeSiblingId, setActiveSiblingId] = useState(null);

    // Auto sync selected siblings & active sibling when student or family changes
    useEffect(() => {
        if (detectedSiblings.length > 1) {
            setSiblingPaymentScope('family');
            setSelectedSiblingIds(detectedSiblings.map(s => s.id));
            setActiveSiblingId(selectedStudent?.id || detectedSiblings[0].id);
        } else if (detectedSiblings.length === 1) {
            setSiblingPaymentScope('single');
            setSelectedSiblingIds([detectedSiblings[0].id]);
            setActiveSiblingId(detectedSiblings[0].id);
        } else {
            setSiblingPaymentScope('single');
            setSelectedSiblingIds([]);
            setActiveSiblingId(null);
        }
    }, [detectedSiblings, selectedStudent]);

    // Active Child being assessed in the 1-by-1 view
    const activeChild = useMemo(() => {
        if (!selectedStudent) return null;
        if (activeSiblingId) {
            return detectedSiblings.find(s => s.id === activeSiblingId) || selectedStudent;
        }
        return selectedStudent;
    }, [selectedStudent, activeSiblingId, detectedSiblings]);

    // Active Parent Account (Official registered parent in schools/${schoolId}/parents)
    const activeParentAccount = useMemo(() => {
        if (!selectedStudent || !allParents || allParents.length === 0) return null;
        const studentParentId = selectedStudent.parentId || selectedStudent.parentDetails?.parentId || null;
        return allParents.find(p => {
            if (studentParentId && p.id === studentParentId) return true;
            if (p.linkedStudents && Array.isArray(p.linkedStudents) && p.linkedStudents.some(ls => ls.studentId === selectedStudent.id)) {
                return true;
            }
            return false;
        }) || null;
    }, [selectedStudent, allParents]);

    // Consistent Family Father Name across all siblings
    const officialFamilyFatherName = useMemo(() => {
        return activeParentAccount?.fatherName || activeParentAccount?.name || activeChild?.parentDetails?.fatherName || activeChild?.fatherName || selectedStudent?.fatherName || 'Parent';
    }, [activeParentAccount, activeChild, selectedStudent]);

    const activeSiblingIndex = useMemo(() => {
        if (!detectedSiblings || detectedSiblings.length <= 1) return 0;
        const idx = detectedSiblings.findIndex(s => s.id === (activeChild?.id || selectedStudent?.id));
        return idx >= 0 ? idx : 0;
    }, [detectedSiblings, activeChild, selectedStudent]);

    const toggleSiblingSelection = (siblingId) => {
        setSelectedSiblingIds(prev => {
            if (prev.includes(siblingId)) {
                if (prev.length === 1) return prev; // Keep at least one child selected
                return prev.filter(id => id !== siblingId);
            } else {
                return [...prev, siblingId];
            }
        });
    };

    // Calculate 12-Month History & Payment Reliability Score for Active Child
    const studentReliabilityData = useMemo(() => {
        const studentToEvaluate = activeChild || selectedStudent;
        if (!studentToEvaluate) return null;

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // 1 = Jan, ..., 12 = Dec
        const currentDay = now.getDate();
        const dueDay = dueInfo.dueDay || 10;

        const isCurrentPaid = (studentToEvaluate.monthlyFeeStatus || '').toLowerCase() === 'paid';
        const currentPaidDate = studentToEvaluate.monthlyFeeDate ? new Date(studentToEvaluate.monthlyFeeDate) : null;

        let prevUnpaidCount = Number(studentToEvaluate.previousMonthsUnpaidCount) || Number(studentToEvaluate.unpaidMonthsCount) || 0;
        if (prevUnpaidCount === 0 && studentToEvaluate.unpaidMonths && studentToEvaluate.unpaidMonths > 1) {
            prevUnpaidCount = studentToEvaluate.unpaidMonths - 1;
        }

        const monthlyHistory = [];
        const pastPaymentDays = [];

        for (let i = 0; i < 12; i++) {
            const fin = getStudentMonthFinancialStatus(studentToEvaluate, i, currentYear, currentAction, feeSettingsData, studentHistoryTxs);
            let monthScore = 0;

            if (fin.paymentDate && !isNaN(fin.paymentDate.getTime())) {
                pastPaymentDays.push(fin.paymentDate.getDate());
            }

            // Calculate Monthly Score based on parent app formula
            if (fin.status === 'paid' && fin.paymentDate) {
                const d = fin.paymentDate.getDate();
                if (d >= 1 && d <= 3) monthScore = 110 - (10 * d);
                else if (d >= 4 && d <= 6) monthScore = 110 - (10 * d);
                else if (d >= 7 && d <= 10) monthScore = 80 - (5 * d);
                else if (d >= 11 && d <= 15) monthScore = Math.max(0, 90 - (6 * d));
                else monthScore = 0;
            }

            monthlyHistory.push({
                monthNum: fin.monthNum,
                monthName: fin.monthName,
                monthFullName: fin.monthFullName,
                targetMonthKey: fin.targetMonthKey,
                status: fin.status,
                amount: fin.expectedAmount,
                paidAmount: fin.paidAmount,
                remainingBalance: fin.remainingBalance,
                paymentDate: fin.paymentDate,
                paymentDateStr: fin.paymentDateStr,
                paymentMode: fin.paymentMode,
                receiptNo: fin.receiptNo,
                txData: fin.txData,
                score: monthScore
            });
        }

        const calculateMonthlyScore = (dayPaid) => {
            if (!dayPaid || dayPaid <= 0) return 0.0;
            if (dayPaid >= 1 && dayPaid <= 6) {
                return 110.0 - (10.0 * dayPaid);
            } else if (dayPaid >= 7 && dayPaid <= 10) {
                return 80.0 - (5.0 * dayPaid);
            } else if (dayPaid >= 11 && dayPaid <= 15) {
                const s = 90.0 - (6.0 * dayPaid);
                return s < 0 ? 0.0 : s;
            } else {
                return 0.0;
            }
        };

        const parentAppPaymentHistory = [1, 5, 2, 8, 4];
        if (isCurrentPaid && studentToEvaluate.monthlyFeeDate) {
            try {
                const d = new Date(studentToEvaluate.monthlyFeeDate);
                if (!isNaN(d.getTime())) {
                    parentAppPaymentHistory.push(d.getDate());
                }
            } catch (e) {}
        }

        const totalScoreSum = parentAppPaymentHistory.reduce((acc, d) => acc + calculateMonthlyScore(d), 0);
        const aggregateScore = Math.round(totalScoreSum / parentAppPaymentHistory.length);

        let badgeLabel = 'Good';
        let badgeColor = '#0284c7';
        let badgeBg = '#e0f2fe';
        let badgeBorder = '#7dd3fc';
        let message = 'Good standing. Thank you for your continued commitment to timely fee clearances.';

        if (aggregateScore >= 80) {
            badgeLabel = 'Excellent';
            badgeColor = '#16a34a';
            badgeBg = '#dcfce7';
            badgeBorder = '#86efac';
            message = 'Excellent consistency! Your prompt payments help us maintain high educational standards.';
        } else if (aggregateScore >= 60) {
            badgeLabel = 'Good';
            badgeColor = '#0284c7';
            badgeBg = '#e0f2fe';
            badgeBorder = '#7dd3fc';
            message = 'Good standing. Thank you for your continued commitment to timely fee clearances.';
        } else if (aggregateScore >= 40) {
            badgeLabel = 'Fair';
            badgeColor = '#d97706';
            badgeBg = '#fef3c7';
            badgeBorder = '#fcd34d';
            message = 'Fair standing. Clearing dues within the first week of the month will improve your reliability.';
        } else {
            badgeLabel = 'Bad';
            badgeColor = '#dc2626';
            badgeBg = '#fee2e2';
            badgeBorder = '#fca5a5';
            message = 'Attention needed. Please ensure timely payments to avoid late fees and maintain a healthy standing.';
        }

        const onTimeCount = monthlyHistory.filter(m => m.status === 'paid' && m.score >= 50).length;
        const totalPaidMonths = monthlyHistory.filter(m => m.status === 'paid').length;
        const onTimeRate = totalPaidMonths > 0 ? Math.round((onTimeCount / totalPaidMonths) * 100) : (isCurrentPaid ? 100 : 0);
        const avgDay = pastPaymentDays.length > 0 ? Math.round(pastPaymentDays.reduce((a, b) => a + b, 0) / pastPaymentDays.length) : (dueDay > 5 ? 5 : dueDay);

        return {
            score: aggregateScore,
            badgeLabel,
            badgeColor,
            badgeBg,
            badgeBorder,
            message,
            monthlyHistory,
            onTimeRate,
            avgDay,
            totalPaidMonths,
            prevUnpaidCount
        };
    }, [activeChild, selectedStudent, studentHistoryTxs, dueInfo, currentAction, feeSettingsData]);

    // Selected Target Month Index (0-11) for billing & 12-Month Matrix
    const [selectedTargetMonthIdx, setSelectedTargetMonthIdx] = useState(() => new Date().getMonth());
    // Right Card View Mode: 'matrix' (12-Month Grid) | 'detail' (In-Card Categorized Sets Detailed Fee View)
    const [rightCardSubView, setRightCardSubView] = useState('matrix');
    const [selectedDetailMonthData, setSelectedDetailMonthData] = useState(null);
    const [isFineWaived, setIsFineWaived] = useState(false);
    // Selective Fee Items for Payment (Modular: Tuition, Transport, Store, Action, Fine, Arrears)
    const [selectedFeeItemKeys, setSelectedFeeItemKeys] = useState(['tuition', 'transport', 'store', 'action', 'fine', 'arrears']);
    // Historical Paid Confirm Modal State
    const [confirmHistoricalModal, setConfirmHistoricalModal] = useState(null); // null | { monthData, student }

    // 2-Step Swipeable Cashier POS States
    const [cashierStep, setCashierStep] = useState(1); // 1 = Student & Parent Profile Card, 2 = Financial Breakdown POS
    const [recentPaidMonthIdx, setRecentPaidMonthIdx] = useState(null); // Highlighting recently paid month on right card
    const [sendWhatsAppOnSubmit, setSendWhatsAppOnSubmit] = useState(true);
    const [audioChimeEnabled, setAudioChimeEnabled] = useState(true);
    // 🔍 Class-Filtered Student Search Bar inside Student Dropdown
    const [studentDropdownSearch, setStudentDropdownSearch] = useState('');
    const [studentDropdownOpen, setStudentDropdownOpen] = useState(false);
    const studentDropdownRef = useRef(null);
    // ➕ New Action / Custom Fee State
    const [showNewActionModal, setShowNewActionModal] = useState(false);
    const [isSavingAction, setIsSavingAction] = useState(false);
    const [attachingProof, setAttachingProof] = useState(false);
    const fileInputProofRef = useRef(null);

    // Synthesize crisp digital cashier chime via standard Web Audio API (Offline & Zero-Dependency)
    const playCashierChime = () => {
        if (!audioChimeEnabled) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const now = ctx.currentTime;
            
            // First melodic bell chime
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now); // D5
            gain1.gain.setValueAtTime(0.18, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.35);

            // Second higher sparkling chime
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(880, now + 0.09); // A5
            gain2.gain.setValueAtTime(0.22, now + 0.09);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.09);
            osc2.stop(now + 0.55);
        } catch (err) {
            console.warn("Cashier chime note:", err);
        }
    };

    // Keyboard navigation helper (Enter to proceed to fee step, Esc to return to profile, Left/Right for siblings)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (activeDailyMode !== 'fee_submission' || !selectedStudent) return;
            // Ignore if active element is an input or textarea
            const tagName = document.activeElement?.tagName?.toLowerCase();
            if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
                if (e.key === 'Enter' && cashierStep === 1 && !feeCalculation?.isPaid) {
                    setCashierStep(2);
                }
                return;
            }
            if (e.key === 'Enter' && cashierStep === 1) {
                if (!feeCalculation?.isPaid) {
                    setCashierStep(2);
                }
            } else if (e.key === 'Escape' && cashierStep === 2) {
                setCashierStep(1);
            } else if (cashierStep === 1 && detectedSiblings.length > 1) {
                if (e.key === 'ArrowLeft') {
                    const currentIdx = detectedSiblings.findIndex(s => s.id === (activeChild?.id || selectedStudent?.id));
                    const newIdx = currentIdx > 0 ? currentIdx - 1 : detectedSiblings.length - 1;
                    setActiveSiblingId(detectedSiblings[newIdx].id);
                } else if (e.key === 'ArrowRight') {
                    const currentIdx = detectedSiblings.findIndex(s => s.id === (activeChild?.id || selectedStudent?.id));
                    const newIdx = currentIdx < detectedSiblings.length - 1 ? currentIdx + 1 : 0;
                    setActiveSiblingId(detectedSiblings[newIdx].id);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeDailyMode, selectedStudent, cashierStep, detectedSiblings, activeChild]);

    // Auto synchronize selectedDetailMonthData when student or target month changes
    useEffect(() => {
        const studentToAssess = activeChild || selectedStudent;
        if (!studentToAssess) {
            setSelectedDetailMonthData(null);
            setIsFineWaived(false);
            return;
        }
        const currentYear = new Date().getFullYear();
        const breakdown = calculateItemizedFeeBreakdown(
            studentToAssess,
            currentAction,
            { dueDate: dueInfo.dueDay || 10, penaltyAmount: dueInfo.autoFine || 0 },
            selectedTargetMonthIdx,
            currentYear
        );

        const targetMonthKey = `${currentYear}-${String(selectedTargetMonthIdx + 1).padStart(2, '0')}`;
        const targetMonthHist = studentReliabilityData?.monthlyHistory?.[selectedTargetMonthIdx] || null;
        const matchingMonthTx = targetMonthHist?.txData || studentHistoryTxs.find(tx => tx.targetMonthKey === targetMonthKey || tx.targetMonthIdx === selectedTargetMonthIdx);

        // Cumulative Prior Months Arrears: Sum remaining unpaid balances from months prior to selectedTargetMonthIdx
        let priorArrearsSum = 0;
        let priorArrearsCount = 0;
        (studentReliabilityData?.monthlyHistory || []).forEach(m => {
            if ((m.monthNum - 1) < selectedTargetMonthIdx) {
                if (m.status === 'partial') {
                    priorArrearsSum += Number(m.remainingBalance || 0);
                    priorArrearsCount++;
                } else if (m.status === 'overdue' || m.status === 'pending') {
                    const defaultTuition = breakdown.tuitionPayable || breakdown.baseTuition || Number(studentToAssess.tuitionFee || 0);
                    priorArrearsSum += Number(m.amount || defaultTuition);
                    priorArrearsCount++;
                }
            }
        });

        if (priorArrearsSum > 0 && !breakdown.is100PercentFree) {
            breakdown.arrears = priorArrearsSum;
            breakdown.arrearsMonthsCount = priorArrearsCount;
        } else {
            breakdown.arrears = 0;
            breakdown.arrearsMonthsCount = 0;
        }

        const isMonthFullyPaid = targetMonthHist?.status === 'paid';
        const isMonthPartialPaid = targetMonthHist?.status === 'partial';

        // Individual item paid status flags (Prevents double billing!)
        const isTuitionPaid = isMonthFullyPaid || breakdown.is100PercentFree || (Array.isArray(studentToAssess.paidMonths) && studentToAssess.paidMonths.includes(targetMonthKey)) || Boolean(matchingMonthTx?.paidCategories?.includes('tuition'));
        const isTransportPaid = isMonthFullyPaid || (breakdown.transportFee === 0) || Boolean(matchingMonthTx?.paidCategories?.includes('transport'));
        const isRecurringPaid = isMonthFullyPaid || breakdown.is100PercentFree || ((breakdown.otherRecurringTotal || 0) === 0) || (Array.isArray(studentToAssess.paidMonths) && studentToAssess.paidMonths.includes(targetMonthKey)) || Boolean(matchingMonthTx?.paidCategories?.includes('recurring'));
        const isStorePaid = isMonthFullyPaid || (breakdown.storeDues === 0) || Boolean(matchingMonthTx?.paidCategories?.includes('store'));
        const isActionPaid = isMonthFullyPaid || (breakdown.actionFee === 0) || Boolean(matchingMonthTx?.paidCategories?.includes('action'));
        const isFinePaid = isMonthFullyPaid || isFineWaived || (breakdown.penaltyFine === 0) || Boolean(matchingMonthTx?.paidCategories?.includes('fine'));
        const isArrearsPaid = isMonthFullyPaid || (breakdown.arrears === 0) || Boolean(matchingMonthTx?.paidCategories?.includes('arrears'));

        const calculatedNetPayable = (isTuitionPaid ? 0 : breakdown.tuitionPayable) +
            (isTransportPaid ? 0 : breakdown.transportFee) +
            (isRecurringPaid ? 0 : (breakdown.otherRecurringTotal || 0)) +
            (isStorePaid ? 0 : breakdown.storeDues) +
            (isActionPaid ? 0 : breakdown.actionFee) +
            (isFinePaid ? 0 : (isFineWaived ? 0 : breakdown.penaltyFine)) +
            (isArrearsPaid ? 0 : breakdown.arrears);

        breakdown.totalPayable = calculatedNetPayable;

        setSelectedDetailMonthData({
            student: studentToAssess,
            breakdown,
            isPaid: isMonthFullyPaid,
            isPartial: isMonthPartialPaid,
            paidAmount: targetMonthHist?.paidAmount || 0,
            remainingBalance: targetMonthHist?.remainingBalance || calculatedNetPayable,
            targetMonthName: MONTH_NAMES[selectedTargetMonthIdx],
            targetMonthIdx: selectedTargetMonthIdx,
            targetYear: currentYear,
            targetMonthKey,
            txData: matchingMonthTx || null,
            feeSettings: { dueDate: dueInfo.dueDay || 10, penaltyAmount: dueInfo.autoFine || 0 },
            isTuitionPaid,
            isTransportPaid,
            isRecurringPaid,
            isStorePaid,
            isActionPaid,
            isFinePaid,
            isArrearsPaid
        });

        // Auto select only UNPAID item categories so already paid items are never checked
        const autoSelectedKeys = [];
        if (!isArrearsPaid && breakdown.arrears > 0) autoSelectedKeys.push('arrears');
        if (!isTuitionPaid && breakdown.tuitionPayable > 0) autoSelectedKeys.push('tuition');
        if (!isTransportPaid && breakdown.transportFee > 0) autoSelectedKeys.push('transport');
        if (!isRecurringPaid && (breakdown.otherRecurringTotal || 0) > 0) {
            autoSelectedKeys.push('recurring');
            (breakdown.recurringItems || []).forEach((_, idx) => autoSelectedKeys.push(`recurring_${idx}`));
        }
        if (!isStorePaid && breakdown.storeDues > 0) autoSelectedKeys.push('store');
        if (!isActionPaid && breakdown.actionFee > 0) autoSelectedKeys.push('action');
        if (!isFinePaid && breakdown.penaltyFine > 0) autoSelectedKeys.push('fine');

        // Include any unpaid individual actions for this student (applicable to target month)
        const targetYearMonthKey = `${new Date().getFullYear()}-${String(selectedTargetMonthIdx + 1).padStart(2, '0')}`;
        (studentToAssess?.individualActions || []).forEach((act, idx) => {
            if (act.type === 'recurring_fee' || act.isRecurring) return;
            const actMonthKey = act.monthKey || (act.createdAt ? act.createdAt.slice(0, 7) : (act.date ? act.date.slice(0, 7) : targetYearMonthKey));
            if (targetYearMonthKey < actMonthKey) return;
            if (act.status !== 'paid' && act.type !== 'store_inventory') {
                autoSelectedKeys.push(`custom_action_${act.id || idx}`);
            }
        });

        setSelectedFeeItemKeys(autoSelectedKeys);

        if (!isMonthFullyPaid && calculatedNetPayable > 0) {
            setReceivedAmount(String(calculatedNetPayable));
            if (!isFinePaid && breakdown.penaltyFine > 0 && !isFineWaived) {
                setFineAmount(String(breakdown.penaltyFine));
            } else {
                setFineAmount('0');
            }
        } else {
            setReceivedAmount('0');
            setFineAmount('0');
        }
    }, [activeChild, selectedStudent, selectedTargetMonthIdx, currentAction, dueInfo, studentReliabilityData, isFineWaived, studentHistoryTxs]);

    // Selective Fee Items Handlers
    const toggleFeeItemKey = (key) => {
        setSelectedFeeItemKeys(prev => {
            if (prev.includes(key)) {
                if (prev.length === 1) return prev; // Keep at least one item selected
                return prev.filter(k => k !== key);
            } else {
                return [...prev, key];
            }
        });
    };

    const handleSelectOnlyCategory = (catKey) => {
        setSelectedFeeItemKeys([catKey]);
    };

    const handleSelectAllCategories = () => {
        const allKeys = ['tuition', 'transport', 'store', 'action', 'fine', 'arrears'];
        (activePayableItems || []).forEach(it => {
            if (it.isCustomAction && !allKeys.includes(it.key)) {
                allKeys.push(it.key);
            }
        });
        setSelectedFeeItemKeys(allKeys);
    };

    // Handler to Waive Late Fine (Maaf)
    const handleWaiveLateFine = () => {
        setIsFineWaived(true);
        setFineAmount('0');
        if (selectedDetailMonthData) {
            const updatedBreakdown = {
                ...selectedDetailMonthData.breakdown,
                penaltyFine: 0,
                isFineWaived: true,
                totalPayable: Math.max(0, 
                    (selectedDetailMonthData.breakdown.tuitionPayable || 0) + 
                    (selectedDetailMonthData.breakdown.transportFee || 0) + 
                    (selectedDetailMonthData.breakdown.otherRecurringTotal || 0) + 
                    (selectedDetailMonthData.breakdown.storeDues || 0) + 
                    (selectedDetailMonthData.breakdown.actionFee || 0) +
                    (selectedDetailMonthData.breakdown.arrears || 0)
                )
            };
            setSelectedDetailMonthData({
                ...selectedDetailMonthData,
                breakdown: updatedBreakdown
            });
            const finalTotal = Math.max(0, updatedBreakdown.totalPayable - Number(discountAmount || 0));
            setReceivedAmount(String(finalTotal));
        }
    };

    // Handler to set specific fine amount
    const handleSetCustomFine = (amountNum) => {
        const val = Math.max(0, Number(amountNum) || 0);
        setIsFineWaived(val === 0);
        setFineAmount(String(val));
        if (selectedDetailMonthData) {
            const updatedBreakdown = {
                ...selectedDetailMonthData.breakdown,
                penaltyFine: val,
                isFineWaived: val === 0,
                totalPayable: Math.max(0, 
                    (selectedDetailMonthData.breakdown.tuitionPayable || 0) + 
                    (selectedDetailMonthData.breakdown.transportFee || 0) + 
                    (selectedDetailMonthData.breakdown.otherRecurringTotal || 0) + 
                    (selectedDetailMonthData.breakdown.storeDues || 0) + 
                    (selectedDetailMonthData.breakdown.actionFee || 0) + 
                    (selectedDetailMonthData.breakdown.arrears || 0) + 
                    val
                )
            };
            setSelectedDetailMonthData({
                ...selectedDetailMonthData,
                breakdown: updatedBreakdown
            });
            const finalTotal = Math.max(0, updatedBreakdown.totalPayable - Number(discountAmount || 0));
            setReceivedAmount(String(finalTotal));
        }
    };

    // Handler to Add On-The-Spot Action / Custom Fee (Live Sync with Firestore & Parent App)
    const handleAddCustomAction = async (title, amount, remarksText = '') => {
        const studentToUpdate = activeChild || selectedStudent;
        if (!studentToUpdate || !schoolId) return;

        const numAmount = Number(amount) || 0;
        if (!title.trim() || numAmount <= 0) {
            alert('Please enter a valid title and amount greater than 0.');
            return;
        }

        setIsSavingAction(true);
        try {
            const actionId = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const targetMonthName = MONTH_NAMES[selectedTargetMonthIdx] || 'Current Month';
            const targetYear = new Date().getFullYear();
            const targetMonthKey = `${targetYear}-${String(selectedTargetMonthIdx + 1).padStart(2, '0')}`;

            const newActionItem = {
                id: actionId,
                name: title.trim(),
                title: title.trim(),
                amount: numAmount,
                remarks: remarksText.trim(),
                status: 'unpaid',
                month: targetMonthName,
                monthKey: targetMonthKey,
                date: new Date().toISOString(),
                createdAt: new Date().toISOString()
            };

            const existingActions = Array.isArray(studentToUpdate.individualActions) ? studentToUpdate.individualActions : [];
            const updatedActions = [...existingActions, newActionItem];

            // 1. Optimistic in-memory update
            const updateStudentInMemory = (st) => ({
                ...st,
                individualActions: updatedActions
            });

            setSelectedStudent(prev => prev && prev.id === studentToUpdate.id ? updateStudentInMemory(prev) : prev);
            setAllStudents(prev => prev.map(s => s.id === studentToUpdate.id ? updateStudentInMemory(s) : s));
            setClassStudents(prev => prev.map(s => s.id === studentToUpdate.id ? updateStudentInMemory(s) : s));

            // Auto-select this new action key
            setSelectedFeeItemKeys(prev => [...prev, `custom_action_${actionId}`]);

            // 2. Sync to Firestore (Both Class subcollection & Root students collection)
            const classId = studentToUpdate.classId || selectedClassId;
            const writeTasks = [];
            if (classId) {
                const classStudentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, studentToUpdate.id);
                writeTasks.push(setDoc(classStudentRef, { individualActions: updatedActions }, { merge: true }).catch(e => console.warn('Class student action write:', e)));
            }
            const masterStudentRef = doc(db, `schools/${schoolId}/students`, studentToUpdate.id);
            writeTasks.push(setDoc(masterStudentRef, { individualActions: updatedActions }, { merge: true }).catch(e => console.warn('Master student action write:', e)));
            await Promise.all(writeTasks);

            setShowNewActionModal(false);
        } catch (err) {
            console.error("Error adding custom action:", err);
            alert("Could not save custom action. Please try again.");
        } finally {
            setIsSavingAction(false);
        }
    };

    // Handler to Remove Unpaid Custom Action / Store Charge (Live Sync with Firestore & Parent App)
    const handleRemoveCustomAction = async (actionId) => {
        const studentToUpdate = activeChild || selectedStudent;
        if (!studentToUpdate || !schoolId) return;

        if (!window.confirm("Are you sure you want to remove this charge from the student's bill?")) return;

        try {
            const existingActions = Array.isArray(studentToUpdate.individualActions) ? studentToUpdate.individualActions : [];
            const updatedActions = existingActions.filter(a => a.id !== actionId && `custom_action_${a.id}` !== actionId && a.name !== actionId);

            const existingStoreCharges = Array.isArray(studentToUpdate.storeCharges) ? studentToUpdate.storeCharges : [];
            const updatedStoreCharges = existingStoreCharges.filter(a => a.id !== actionId && `store_${a.id}` !== actionId && a.name !== actionId);

            // 1. Optimistic in-memory update
            const updateStudentInMemory = (st) => ({
                ...st,
                individualActions: updatedActions,
                storeCharges: updatedStoreCharges
            });

            setSelectedStudent(prev => prev && prev.id === studentToUpdate.id ? updateStudentInMemory(prev) : prev);
            setAllStudents(prev => prev.map(s => s.id === studentToUpdate.id ? updateStudentInMemory(s) : s));
            setClassStudents(prev => prev.map(s => s.id === studentToUpdate.id ? updateStudentInMemory(s) : s));

            setSelectedFeeItemKeys(prev => prev.filter(k => k !== `custom_action_${actionId}` && k !== actionId && k !== `store_${actionId}`));

            // 2. Sync to Firestore
            const classId = studentToUpdate.classId || selectedClassId;
            const removeTasks = [];
            if (classId) {
                const classStudentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, studentToUpdate.id);
                removeTasks.push(setDoc(classStudentRef, { individualActions: updatedActions, storeCharges: updatedStoreCharges }, { merge: true }).catch(e => console.warn('Class student action remove write:', e)));
            }
            const masterStudentRef = doc(db, `schools/${schoolId}/students`, studentToUpdate.id);
            removeTasks.push(setDoc(masterStudentRef, { individualActions: updatedActions, storeCharges: updatedStoreCharges }, { merge: true }).catch(e => console.warn('Master student action remove write:', e)));
            await Promise.all(removeTasks);
        } catch (err) {
            console.error("Error removing charge:", err);
            alert("Could not remove charge. Please try again.");
        }
    };

    // Store Purchases Itemized Breakdown & Popover State
    const [storeSlipPopoverOpen, setStoreSlipPopoverOpen] = useState(false);

    // Print Quick 3-Inch POS Thermal Receipt (Offline)
    const printThermalReceipt = (txData, customSchoolInfo) => {
        try {
            const printWin = window.open('', '_blank', 'width=360,height=600');
            if (!printWin) {
                alert('Please allow popups in your browser to print the thermal receipt slip.');
                return;
            }
            const schoolName = customSchoolInfo?.name || localSchoolInfo?.name || schoolInfo?.name || 'School Management System';
            const itemsHtml = (txData.items || []).map(it => `
                <tr>
                    <td style="text-align:left; padding: 2px 0;">${it.name}</td>
                    <td style="text-align:right; font-weight:bold; padding: 2px 0;">Rs ${Number(it.amount || 0).toLocaleString()}</td>
                </tr>
            `).join('');

            printWin.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>POS Receipt - ${txData.receiptNo}</title>
                    <style>
                        body { font-family: 'Courier New', monospace; font-size: 11px; margin: 0; padding: 8px; color: #000; line-height: 1.3; }
                        .center { text-align: center; }
                        .bold { font-weight: bold; }
                        .line { border-bottom: 1px dashed #000; margin: 5px 0; }
                        table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
                    </style>
                </head>
                <body>
                    <div class="center bold" style="font-size: 12.5px;">${schoolName.toUpperCase()}</div>
                    <div class="center" style="font-size: 9px; margin-top: 1px;">OFFICIAL FEE RECEIPT (POS)</div>
                    <div class="line"></div>
                    <div><strong>Slip #:</strong> ${txData.receiptNo}</div>
                    <div><strong>Date:</strong> ${txData.dateString || new Date().toLocaleDateString('en-GB')} ${txData.timeString || ''}</div>
                    <div><strong>Student:</strong> ${txData.studentName}</div>
                    <div><strong>Class:</strong> ${txData.className} | <strong>Roll:</strong> ${txData.rollNo || 'N/A'}</div>
                    <div><strong>Father:</strong> ${txData.fatherName || 'Parent'}</div>
                    <div><strong>Payment Mode:</strong> ${txData.paymentMode || 'Cash'}</div>
                    ${txData.transactionId ? `<div><strong>TRX ID:</strong> ${txData.transactionId}</div>` : ''}
                    <div class="line"></div>
                    <table>
                        ${itemsHtml}
                    </table>
                    <div class="line"></div>
                    <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: bold;">
                        <span>TOTAL AMOUNT:</span>
                        <span>Rs ${Number(txData.totalPaid || 0).toLocaleString()}</span>
                    </div>
                    ${txData.remainingBalance > 0 ? `
                    <div style="display: flex; justify-content: space-between; color: #b91c1c; font-size: 10.5px; font-weight: bold; margin-top: 3px;">
                        <span>REMAINING BALANCE:</span>
                        <span>Rs ${Number(txData.remainingBalance).toLocaleString()}</span>
                    </div>` : ''}
                    <div class="line"></div>
                    <div class="center" style="font-size: 8.5px; margin-top: 6px;">
                        *** Thank you for your payment ***<br/>
                        Generated by Principal Office System
                    </div>
                    <script>
                        window.onload = function() { window.print(); }
                    </script>
                </body>
                </html>
            `);
            printWin.document.close();
        } catch (e) {
            console.error("Thermal print error:", e);
        }
    };

    // Handle Clicking a Month Card in the 2026 Monthly Status Matrix
    const handleMonthCardClick = (m) => {
        const studentToAssess = activeChild || selectedStudent;
        if (!studentToAssess) return;
        const monthIdx = m.monthNum - 1;
        setSelectedTargetMonthIdx(monthIdx);

        const currentYear = new Date().getFullYear();
        const breakdown = calculateItemizedFeeBreakdown(
            studentToAssess,
            currentAction,
            { dueDate: dueInfo.dueDay || 10, penaltyAmount: dueInfo.autoFine || 0 },
            monthIdx,
            currentYear
        );

        // Calculate Prior Unpaid Months Arrears before this clicked target month
        const unpaidPrevMonths = (studentReliabilityData?.monthlyHistory || []).filter(
            histMonth => (histMonth.monthNum - 1) < monthIdx && histMonth.status !== 'paid'
        );
        const arrearsCount = unpaidPrevMonths.length;
        if (arrearsCount > 0 && !breakdown.is100PercentFree) {
            const perMonthTuition = breakdown.tuitionPayable || breakdown.baseTuition || 0;
            breakdown.arrears = arrearsCount * perMonthTuition;
            breakdown.arrearsMonthsCount = arrearsCount;
            breakdown.totalPayable = (breakdown.totalPayable || 0) + breakdown.arrears;
        } else {
            breakdown.arrears = 0;
            breakdown.arrearsMonthsCount = 0;
        }

        setIsFineWaived(false);
        setSelectedDetailMonthData({
            student: studentToAssess,
            breakdown,
            isPaid: m.status === 'paid',
            targetMonthName: m.monthFullName || MONTH_NAMES[monthIdx],
            targetMonthIdx: monthIdx,
            targetYear: currentYear,
            feeSettings: { dueDate: dueInfo.dueDay || 10, penaltyAmount: dueInfo.autoFine || 0 }
        });

        // Keep 12-Month Matrix visible at all times
        setRightCardSubView('matrix');

        // Auto sync left payment form counter
        if (m.status !== 'paid' && !breakdown.is100PercentFree) {
            setReceivedAmount(String(breakdown.totalPayable || 0));
            if (breakdown.penaltyFine > 0) {
                setFineAmount(String(breakdown.penaltyFine));
            } else {
                setFineAmount('0');
            }
        }
    };

    // Download Fee Card / Challan PDF for any month
    const handleDownloadChallanForMonth = (m) => {
        const student = activeChild || selectedStudent;
        if (!student) return;
        const targetMonthIdx = m ? (m.monthNum - 1) : selectedTargetMonthIdx;
        const targetMonthName = MONTH_NAMES[targetMonthIdx];
        const targetYear = new Date().getFullYear();
        
        // Multi-Sibling Unified Family Challan
        if (feeCalculation?.isMultiFamily && !m) {
            downloadFamilyFeeChallanPDF({
                schoolInfo: localSchoolInfo || schoolInfo,
                feeCalculation,
                targetMonthName,
                targetYear,
                fatherName: officialFamilyFatherName || student.parentDetails?.fatherName || student.fatherName || 'Parent / Guardian',
                feeSettings: { dueDate: dueInfo.dueDay || 10, penaltyAmount: dueInfo.autoFine || 0 },
                cashierName: auth?.currentUser?.displayName || auth?.currentUser?.email?.split('@')[0] || 'Principal Office'
            });
            return;
        }

        const feeCalculationData = calculateItemizedFeeBreakdown(
            student,
            currentAction,
            { dueDate: dueInfo.dueDay || 10, penaltyAmount: dueInfo.autoFine || 0 },
            targetMonthIdx,
            targetYear
        );
        
        const unpaidPrevMonths = (studentReliabilityData?.monthlyHistory || []).filter(
            histMonth => (histMonth.monthNum - 1) < targetMonthIdx && histMonth.status !== 'paid'
        );
        if (unpaidPrevMonths.length > 0 && !feeCalculationData.is100PercentFree) {
            const perMonthTuition = feeCalculationData.tuitionPayable || feeCalculationData.baseTuition || 0;
            feeCalculationData.arrears = unpaidPrevMonths.length * perMonthTuition;
            feeCalculationData.arrearsMonthsCount = unpaidPrevMonths.length;
            feeCalculationData.totalPayable = (feeCalculationData.totalPayable || 0) + feeCalculationData.arrears;
        }

        downloadStudentFeeCardPDF({
            student,
            breakdown: feeCalculationData,
            isPaid: m ? (m.status === 'paid') : (selectedDetailMonthData?.isPaid || false),
            targetMonthName,
            targetYear,
            feeSettings: { dueDate: dueInfo.dueDay || 10, penaltyAmount: dueInfo.autoFine || 0 }
        }, localSchoolInfo || schoolInfo);
    };

    // Send WhatsApp Reminder with Fee Card Details
    const handleSendFeeCardWhatsApp = (st, breakdown, monthName, year) => {
        const phone = st.fatherPhone || st.phone || st.parentPhone || '';
        if (!phone) {
            alert("Parent phone number is not available for this student.");
            return;
        }
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const formattedPhone = cleanPhone.startsWith('0') ? '92' + cleanPhone.slice(1) : cleanPhone.startsWith('92') ? cleanPhone : '92' + cleanPhone;

        const schoolName = localSchoolInfo?.name || schoolInfo?.name || 'School';
        const msg = `*OFFICIAL FEE CARD - ${monthName} ${year}*\n*${schoolName}*\n\n` +
            `Student: *${st.name}* (Class: ${st.className || 'N/A'}, Roll: ${st.rollNo || 'N/A'})\n` +
            `Father: *${st.fatherName || 'Parent'}*\n` +
            `------------------------------------\n` +
            `• Monthly Tuition: Rs ${Number(breakdown.tuitionPayable || 0).toLocaleString()}\n` +
            (breakdown.transportFee > 0 ? `• Transport Charges: Rs ${Number(breakdown.transportFee).toLocaleString()}\n` : '') +
            (Array.isArray(breakdown.recurringItems) && breakdown.recurringItems.length > 0
                ? breakdown.recurringItems.map(r => `• ${r.name}: Rs ${Number(r.amount || 0).toLocaleString()}\n`).join('')
                : (breakdown.otherRecurringTotal > 0 ? `• Online & Other Services: Rs ${Number(breakdown.otherRecurringTotal).toLocaleString()}\n` : '')) +
            (breakdown.storeDues > 0 ? `• Uniform & Store Items: Rs ${Number(breakdown.storeDues).toLocaleString()}\n` : '') +
            (breakdown.actionFee > 0 ? `• Actions & Exam Charges: Rs ${Number(breakdown.actionFee).toLocaleString()}\n` : '') +
            (breakdown.penaltyFine > 0 ? `• Late Fine Surcharge: Rs ${Number(breakdown.penaltyFine).toLocaleString()}\n` : '') +
            `------------------------------------\n` +
            `*NET TOTAL: Rs ${Number(breakdown.totalPayable || 0).toLocaleString()}*\n` +
            `Status: *${breakdown.is100PercentFree ? '100% Scholarship (Free)' : (selectedDetailMonthData?.isPaid ? 'PAID / CLEARED ✓' : 'PENDING PAYMENT')}*\n\n` +
            `Thank you for your cooperation.\n*Principal Office*`;

        window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    // Smart Next Unpaid Month Index across current academic year
    const nextUnpaidMonthIdx = useMemo(() => {
        if (!studentReliabilityData?.monthlyHistory) return -1;
        const hist = studentReliabilityData.monthlyHistory;
        for (let i = selectedTargetMonthIdx + 1; i < 12; i++) {
            if (hist[i]?.status !== 'paid' && hist[i]?.status !== 'pre_admission') {
                return i;
            }
        }
        for (let i = 0; i < 12; i++) {
            if (hist[i]?.status !== 'paid' && hist[i]?.status !== 'pre_admission') {
                return i;
            }
        }
        return -1;
    }, [studentReliabilityData, selectedTargetMonthIdx]);

    // Universal Month Key Parser Helper (Handles "September 2026", "Sep 2026", "2026-09", etc.)
    const parseMonthStringToKey = (monthStr, fallbackYear = new Date().getFullYear()) => {
        if (!monthStr || typeof monthStr !== 'string') return null;
        const clean = monthStr.trim();
        if (/^\d{4}-\d{2}$/.test(clean)) return clean;
        
        const monthIndex = MONTH_NAMES.findIndex(m => clean.toLowerCase().includes(m.toLowerCase()));
        if (monthIndex !== -1) {
            const yearMatch = clean.match(/\d{4}/);
            const year = yearMatch ? yearMatch[0] : fallbackYear;
            return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
        }
        return null;
    };

    // Construct transaction record for currently selected paid month
    const getSelectedMonthPaidTxRecord = () => {
        const st = activeChild || selectedStudent;
        if (!st) return null;
        const currentYear = new Date().getFullYear();
        const targetYear = selectedDetailMonthData?.targetYear || currentYear;
        const targetMonthKey = `${targetYear}-${String(selectedTargetMonthIdx + 1).padStart(2, '0')}`;
        const targetMonthNameLower = (MONTH_NAMES[selectedTargetMonthIdx] || '').toLowerCase();
        
        // Match specific transaction from transaction history
        const tx = selectedDetailMonthData?.txData || (studentHistoryTxs || []).find(t => {
            if (t.targetMonthKey && t.targetMonthKey === targetMonthKey) return true;
            if (t.targetMonthIdx !== undefined && Number(t.targetMonthIdx) === selectedTargetMonthIdx && (Number(t.targetYear) === targetYear || !t.targetYear)) return true;
            if (t.targetMonthName && t.targetMonthName.toLowerCase().includes(targetMonthNameLower)) return true;
            return false;
        });

        const histData = st.monthlyFeeHistory?.[targetMonthKey];
        const recNo = tx?.receiptNo || histData?.receiptNo || `REC-${st.id?.slice(-4) || 'PAID'}-${targetMonthKey}`;
        
        // Universal Multi-Source Proof Resolver
        // 1. Exact student & target month match across online submissions
        let matchingOnlineSub = (onlineSubmissions || []).find(sub => {
            const isStudentMatch = sub.studentId === st.id || 
                (sub.rollNo && String(sub.rollNo) === String(st.rollNo)) ||
                (Array.isArray(sub.familyStudents) && sub.familyStudents.some(f => f.studentId === st.id));
            if (!isStudentMatch) return false;
            
            const subMonthKey = sub.targetMonthKey || sub.monthKey || parseMonthStringToKey(sub.month, targetYear);
            const subMonthStr = (sub.month || '').toLowerCase();
            return subMonthKey === targetMonthKey || subMonthStr.includes(targetMonthNameLower);
        });

        // 2. If not found by exact month, check if student has any submission with a valid proof
        if (!matchingOnlineSub) {
            matchingOnlineSub = (onlineSubmissions || []).find(sub => {
                const isStudentMatch = sub.studentId === st.id || 
                    (sub.rollNo && String(sub.rollNo) === String(st.rollNo)) ||
                    (Array.isArray(sub.familyStudents) && sub.familyStudents.some(f => f.studentId === st.id));
                return isStudentMatch && Boolean(sub.proofUrl || sub.slipUrl || sub.proofImage || sub.receiptUrl);
            });
        }

        const proofUrl = tx?.proofUrl || 
            tx?.slipUrl || 
            tx?.proofImage || 
            tx?.proofPreview || 
            histData?.proofUrl || 
            histData?.slipUrl || 
            matchingOnlineSub?.proofUrl || 
            matchingOnlineSub?.slipUrl || 
            matchingOnlineSub?.proofImage || 
            matchingOnlineSub?.receiptUrl || 
            st.pendingPaymentSubmission?.proofUrl || 
            st.pendingPaymentSubmission?.slipUrl || 
            st.lastPaymentProofUrl || 
            st.paymentProof || 
            st.proofUrl || 
            null;

        const transactionId = tx?.transactionId || 
            histData?.transactionId || 
            matchingOnlineSub?.transactionId || 
            st.pendingPaymentSubmission?.transactionId || 
            null;

        const paymentMode = tx?.paymentMode || 
            histData?.paymentMode || 
            (matchingOnlineSub?.paymentMethod ? `Online - ${matchingOnlineSub.paymentMethod}` : null) || 
            (st.pendingPaymentSubmission?.paymentMethod ? `Online - ${st.pendingPaymentSubmission.paymentMethod}` : null) ||
            st.lastPaymentMode || 
            'Bank Transfer';
        
        // Assemble comprehensive itemized list across all fee categories
        const b = selectedDetailMonthData?.breakdown;
        const items = [];
        
        const tuitionAmt = Number(b?.tuitionPayable ?? histData?.tuitionFee ?? st.tuitionFee ?? 0);
        if (tuitionAmt > 0) {
            items.push({ name: `Monthly Tuition (${MONTH_NAMES[selectedTargetMonthIdx]})`, amount: tuitionAmt, category: 'tuition' });
        }
        
        const transportAmt = Number(b?.transportFee ?? histData?.transportFee ?? st.transportFee ?? 0);
        if (transportAmt > 0) {
            items.push({ name: 'Transport / Van Fee', amount: transportAmt, category: 'transport' });
        }
        
        if (Array.isArray(b?.recurringItems) && b.recurringItems.length > 0) {
            b.recurringItems.forEach(r => {
                const amt = Number(r.amount || 0);
                if (amt > 0) items.push({ name: r.name || 'Recurring Fee', amount: amt, category: 'recurring' });
            });
        } else if (Number(b?.otherRecurringTotal || 0) > 0) {
            items.push({ name: 'Online & Other Services', amount: Number(b.otherRecurringTotal), category: 'recurring' });
        }
        
        const storeAmt = Number(b?.storeDues ?? histData?.storeDues ?? 0);
        if (storeAmt > 0) {
            items.push({ name: 'Uniform & Store Items', amount: storeAmt, category: 'store' });
        }
        
        const fineAmt = Number(b?.penaltyFine ?? histData?.fineAmount ?? 0);
        if (fineAmt > 0) {
            items.push({ name: 'Late Payment Fine', amount: fineAmt, category: 'fine' });
        }
        
        if (Array.isArray(histData?.customItems) && histData.customItems.length > 0) {
            histData.customItems.forEach(c => {
                items.push({ name: c.title || c.name || 'Custom Fee', amount: Number(c.amount) || 0, category: 'custom_action', date: c.date });
            });
        }

        // Calculate aggregate fallback amount if items exist
        const calculatedItemsSum = items.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
        const totalAmt = Number(tx?.totalPaid || histData?.paidAmount || calculatedItemsSum || st.tuitionFee || 0);

        if (items.length === 0) {
            items.push({ name: `Monthly Tuition Fee (${MONTH_NAMES[selectedTargetMonthIdx]})`, amount: totalAmt, category: 'tuition' });
        }

        if (tx && Array.isArray(tx.items) && tx.items.length > 0) {
            return {
                ...tx,
                items: tx.items.length > 0 ? tx.items : items,
                totalPaid: Number(tx.totalPaid || totalAmt),
                proofUrl: tx.proofUrl || proofUrl,
                transactionId: tx.transactionId || transactionId,
                paymentMode: tx.paymentMode || paymentMode
            };
        }

        return {
            receiptNo: recNo,
            studentName: st.name,
            rollNo: st.rollNo || 'N/A',
            className: st.className || 'Class',
            classId: st.classId,
            studentId: st.id,
            fatherName: st.parentDetails?.fatherName || st.fatherName || 'Parent',
            fatherPhone: st.parentDetails?.fatherPhone || st.fatherPhone || st.phone || '',
            items,
            totalPaid: totalAmt,
            remainingBalance: 0,
            paymentMode,
            proofUrl,
            transactionId,
            targetMonthName: MONTH_NAMES[selectedTargetMonthIdx],
            targetMonthKey,
            targetMonthIdx: selectedTargetMonthIdx,
            targetYear,
            dateString: histData?.paidAt ? new Date(histData.paidAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
            timeString: histData?.paidAt ? new Date(histData.paidAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '12:00 PM',
            collectedBy: histData?.markedBy || 'Principal Office'
        };
    };

    const handleTriggerAttachProof = () => {
        if (fileInputProofRef.current) {
            fileInputProofRef.current.value = '';
            fileInputProofRef.current.click();
        }
    };

    const handleFileChangeAttachProof = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const st = activeChild || selectedStudent;
        if (!st || !schoolId) return;

        setAttachingProof(true);
        try {
            const reader = new FileReader();
            const base64Url = await new Promise((resolve) => {
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(file);
            });

            if (!base64Url) {
                alert("Failed to read the selected slip image. Please try again.");
                setAttachingProof(false);
                return;
            }

            const currentYear = new Date().getFullYear();
            const targetYear = selectedDetailMonthData?.targetYear || currentYear;
            const targetMonthKey = `${targetYear}-${String(selectedTargetMonthIdx + 1).padStart(2, '0')}`;

            const updatedHistory = {
                ...(st.monthlyFeeHistory || {}),
                [targetMonthKey]: {
                    ...(st.monthlyFeeHistory?.[targetMonthKey] || {}),
                    proofUrl: base64Url,
                    updatedAt: new Date().toISOString()
                }
            };

            const updatedStudentObj = {
                ...st,
                monthlyFeeHistory: updatedHistory,
                lastPaymentProofUrl: base64Url
            };

            setSelectedStudent(prev => prev ? (prev.id === st.id ? updatedStudentObj : prev) : prev);
            setAllStudents(prev => prev.map(s => (s.id === st.id ? updatedStudentObj : s)));
            setClassStudents(prev => prev.map(s => (s.id === st.id ? updatedStudentObj : s)));

            if (st.classId) {
                const classStudentRef = doc(db, `schools/${schoolId}/classes/${st.classId}/students`, st.id);
                await setDoc(classStudentRef, {
                    [`monthlyFeeHistory.${targetMonthKey}.proofUrl`]: base64Url,
                    lastPaymentProofUrl: base64Url
                }, { merge: true });
            }

            const rootStudentRef = doc(db, `schools/${schoolId}/students`, st.id);
            await setDoc(rootStudentRef, {
                [`monthlyFeeHistory.${targetMonthKey}.proofUrl`]: base64Url,
                lastPaymentProofUrl: base64Url
            }, { merge: true });

            alert("✅ Payment slip / proof attached successfully to this month!");
        } catch (err) {
            console.error("Error attaching proof:", err);
            alert("Error saving attached slip: " + (err.message || 'Unknown error'));
        } finally {
            setAttachingProof(false);
        }
    };

    const handleReprintThermalPaidSlip = () => {
        const rec = getSelectedMonthPaidTxRecord();
        if (rec) printThermalReceipt(rec, localSchoolInfo);
    };

    const handleDownloadPaidPDFReceipt = () => {
        const rec = getSelectedMonthPaidTxRecord();
        if (rec) downloadOfficialReceiptPDF(rec, localSchoolInfo);
    };

    const handleResendPaidWhatsAppReceipt = () => {
        const rec = getSelectedMonthPaidTxRecord();
        if (!rec) return;
        const phone = rec.fatherPhone;
        if (!phone) {
            alert("Parent phone number is not available for this student.");
            return;
        }
        const schoolTitle = localSchoolInfo?.name || schoolInfo?.name || 'School Office';
        const itemsSummary = (rec.items || []).map(it => `• ${it.name}: Rs ${Number(it.amount || 0).toLocaleString()}`).join('\n');
        const msg = `*FEE PAYMENT RECEIPT - ${schoolTitle.toUpperCase()}*\n\n` +
            `*Receipt No:* ${rec.receiptNo}\n` +
            `*Student:* ${rec.studentName} (${rec.className})\n` +
            `*Father:* ${rec.fatherName}\n` +
            `*Month:* ${rec.targetMonthName} ${rec.targetYear}\n` +
            `*Date:* ${rec.dateString} ${rec.timeString}\n` +
            `*Payment Mode:* ${rec.paymentMode}\n\n` +
            `*Breakdown:*\n${itemsSummary}\n` +
            `--------------------------\n` +
            `*TOTAL PAID:* Rs ${Number(rec.totalPaid).toLocaleString()}\n` +
            `*Status:* 100% Cleared & Paid ✓\n\n` +
            `_Thank you for your prompt payment!_`;

        let cleanPhone = phone.toString().replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('0092')) cleanPhone = cleanPhone.slice(2);
        else if (cleanPhone.startsWith('03')) cleanPhone = '92' + cleanPhone.slice(1);
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    // Mark a past month as Historically Paid (Principal-level override for pre-system records)
    const handleMarkHistoricalPaid = async (monthData, studentOverride) => {
        const st = studentOverride || activeChild || selectedStudent;
        if (!st || !schoolId) return;

        const amount = Number(st.tuitionFee || st.monthlyFee || 2000);
        const targetKey = monthData.targetMonthKey;
        const nowISO = new Date().toISOString();

        // Optimistic UI — update in-memory student so card turns green instantly
        const updatedHistory = {
            ...(st.monthlyFeeHistory || {}),
            [targetKey]: {
                status: 'paid',
                paidAmount: amount,
                remainingBalance: 0,
                paidAt: nowISO,
                paymentMode: 'Historical',
                markedBy: 'Principal',
                isHistorical: true
            }
        };
        const updatedStudent = { ...st, monthlyFeeHistory: updatedHistory };
        setSelectedStudent(prev => prev?.id === st.id ? updatedStudent : prev);
        setAllStudents(prev => prev.map(s => s.id === st.id ? updatedStudent : s));
        setClassStudents(prev => (prev || []).map(s => s.id === st.id ? updatedStudent : s));
        setConfirmHistoricalModal(null);

        // Firestore write
        try {
            const { doc, updateDoc } = await import('firebase/firestore');
            const { db } = await import('../firebase');
            const classDocRef = doc(db, 'schools', schoolId, 'classes', st.classId, 'students', st.id);
            const masterDocRef = doc(db, 'schools', schoolId, 'students', st.id);
            const payload = {
                [`monthlyFeeHistory.${targetKey}`]: {
                    status: 'paid',
                    paidAmount: amount,
                    remainingBalance: 0,
                    paidAt: nowISO,
                    paymentMode: 'Historical',
                    markedBy: 'Principal',
                    isHistorical: true
                }
            };
            await Promise.all([
                updateDoc(classDocRef, payload).catch(() => {}),
                updateDoc(masterDocRef, payload).catch(() => {})
            ]);
        } catch (err) {
            console.warn('[MarkHistoricalPaid] Firestore write error:', err);
        }
    };

    // Handle Selecting a Student
    const handleSelectStudent = (student) => {
        setSelectedStudent(student);
        setSelectedClassId(student.classId);
        setSelectedStudentId(student.id);
        setActiveSiblingId(student.id);
        setSelectedTargetMonthIdx(new Date().getMonth());
        setRightCardSubView('matrix');
        setSelectedDetailMonthData(null);
        setSearchQuery('');
        setShowSearchDropdown(false);
        setAssessmentViewMode('assessment');
        setCashierStep(1); // Start on Student & Parent profile view
        // Auto apply late penalty if overdue
        if (dueInfo.autoFine > 0) {
            setFineAmount(dueInfo.autoFine.toString());
        } else {
            setFineAmount('0');
        }
    };

    // Auto-select student and trigger family grouping when selectedStudentId matches from navigation
    useEffect(() => {
        if (selectedStudentId) {
            if (allStudents.length > 0) {
                const found = allStudents.find(s => s.id === selectedStudentId);
                if (found && (!selectedStudent || selectedStudent.id !== selectedStudentId)) {
                    handleSelectStudent(found);
                }
            } else if (classStudents.length > 0) {
                const found = classStudents.find(s => s.id === selectedStudentId);
                if (found && (!selectedStudent || selectedStudent.id !== selectedStudentId)) {
                    handleSelectStudent(found);
                }
            }
        }
    }, [selectedStudentId, allStudents, classStudents, selectedStudent]);

    // Active Child's Individual Detailed Calculation with Safe Multi-Field Fallback
    const activeChildFeeCalculation = useMemo(() => {
        const st = activeChild || selectedStudent;
        if (!st) return null;

        const items = [];
        let baseFee = 0;
        let actionsFee = 0;
        let storeFee = 0;

        const is100PercentFree = (
            st.isScholarship === true || 
            st.isFreeShip === true || 
            st.concessionType === 'free' || 
            Number(st.feeDiscount) === 100
        );

        let baseTuition = Number(st.tuitionFee || st.monthlyFee || st.fee || st.monthlyTuition || st.baseFee || 0);
        if (baseTuition === 0 && Array.isArray(st.feeStructure) && st.feeStructure.length > 0) {
            const tuitionItem = st.feeStructure.find(f => (f.name || '').toLowerCase().includes('tuition'));
            if (tuitionItem) baseTuition = Number(tuitionItem.amount || 0);
            else baseTuition = st.feeStructure.reduce((sum, f) => sum + Number(f.amount || 0), 0);
        }
        if (baseTuition === 0 && !is100PercentFree) {
            baseTuition = 2000;
        }

        let tuition = is100PercentFree ? 0 : baseTuition;
        if (!is100PercentFree && st.feeDiscount && Number(st.feeDiscount) > 0) {
            const disc = Number(st.feeDiscount);
            if (disc <= 100) {
                tuition = Math.max(0, Math.round(baseTuition * (1 - disc / 100)));
            } else {
                tuition = Math.max(0, baseTuition - disc);
            }
        }

        let prevCount = Number(st.previousMonthsUnpaidCount) || Number(st.unpaidMonthsCount) || 0;
        if (prevCount === 0 && st.unpaidMonths && st.unpaidMonths > 1) {
            prevCount = st.unpaidMonths - 1;
        }
        const prevArrears = Number(st.previousMonthsArrears) || (prevCount * tuition);

        if (prevArrears > 0) {
            items.push({
                key: 'arrears',
                name: `Previous Overdue Tuition (${prevCount} Mos)`,
                amount: prevArrears,
                isArrears: true,
                category: 'arrears'
            });
        }

        if (st.feeStructure && st.feeStructure.length > 0) {
            st.feeStructure.forEach(item => {
                const amt = Number(item.amount) || 0;
                if (amt > 0) {
                    items.push({ key: 'tuition', name: item.name || 'Fee Item', amount: amt, isTuition: true, category: 'tuition' });
                    baseFee += amt;
                }
            });
        } else {
            const transport = Number(st.transportFee || st.monthlyTransportFee || 0);
            const other = Number(st.otherFees || 0);
            if (tuition > 0) items.push({ key: 'tuition', name: 'Monthly Tuition Fee', amount: tuition, isTuition: true, category: 'tuition' });
            if (transport > 0) items.push({ key: 'transport', name: 'Transport Fee', amount: transport, isTuition: true, category: 'transport' });
            if (other > 0) items.push({ key: 'other', name: 'Other Fees', amount: other, isTuition: true, category: 'tuition' });
            baseFee = tuition + transport + other;
        }

        // Store charges & Individual Actions (1-Time Count Rule with Target Month Filter & Carry-Forward)
        const currentYear = new Date().getFullYear();
        const targetMonthKey = `${currentYear}-${String(selectedTargetMonthIdx + 1).padStart(2, '0')}`;
        
        const rawActionsList = [
            ...(Array.isArray(st.individualActions) ? st.individualActions : []),
            ...(Array.isArray(st.storeCharges) ? st.storeCharges : [])
        ];
        const seenActionIds = new Set();
        const combinedActionsList = [];
        rawActionsList.forEach(act => {
            const actId = act.id || `${act.name}_${act.amount}_${act.date || act.createdAt}`;
            if (!seenActionIds.has(actId)) {
                seenActionIds.add(actId);
                combinedActionsList.push(act);
            }
        });

        const pendingActions = combinedActionsList.filter(action => {
            const actMonthKey = action.monthKey || (action.createdAt ? action.createdAt.slice(0, 7) : (action.date ? action.date.slice(0, 7) : targetMonthKey));
            if (targetMonthKey < actMonthKey) return false;
            if (action.status === 'paid') {
                const paidMonthKey = action.paidMonthKey || action.monthKey || (action.paidAt ? action.paidAt.slice(0, 7) : actMonthKey);
                return targetMonthKey === paidMonthKey;
            }
            return targetMonthKey >= actMonthKey;
        });
        // Dynamic status resolution based on currently selected target month
        const historyForMonth = studentReliabilityData?.monthlyHistory?.find(m => (m.monthNum - 1) === selectedTargetMonthIdx);
        const monthHistoryEntry = st.monthlyFeeHistory?.[targetMonthKey];
        const isTargetInPaidMonths = Array.isArray(st.paidMonths) && st.paidMonths.includes(targetMonthKey);

        let monthStatus = 'pending';
        if (historyForMonth?.status) {
            monthStatus = historyForMonth.status;
        } else if (monthHistoryEntry?.status === 'paid' || isTargetInPaidMonths) {
            monthStatus = 'paid';
        } else if (st.monthlyFeeStatus === 'paid' && selectedTargetMonthIdx === new Date().getMonth()) {
            monthStatus = 'paid';
        }

        const isBasePaid = monthStatus === 'paid';

        pendingActions.forEach(action => {
            const amt = Number(action.amount) || 0;
            if (amt > 0) {
                const isStore = action.type === 'store_inventory' || (action.id && String(action.id).startsWith('store_')) || /store|uniform|book|stationery/i.test(action.name || action.title || '');
                if (isStore) {
                    storeFee += amt;
                } else {
                    actionsFee += amt;
                }
                const isItemPaid = action.status === 'paid' || action.isPaid === true;
                items.push({ 
                    id: action.id,
                    key: isStore ? 'store' : `custom_action_${action.id}`,
                    name: action.name || action.title, 
                    amount: amt,
                    isStore,
                    isAction: !isStore,
                    category: isStore ? 'store' : 'action',
                    status: isItemPaid ? 'paid' : 'pending',
                    isPaid: isItemPaid,
                    actionObj: action
                });
            }
        });

        if (currentAction) {
            const isTargeted = currentAction.targetAll || (currentAction.targetClasses && currentAction.targetClasses.includes(st.classId));
            if (isTargeted) {
                const isPaid = st.customPayments?.[currentAction.name]?.status === 'paid';
                if (!isPaid) {
                    const amt = Number(currentAction.amount) || 0;
                    if (amt > 0) {
                        items.push({ key: 'action', name: `Global: ${currentAction.name}`, amount: amt, isAction: true, category: 'action', isPaid: false, status: 'pending' });
                        actionsFee += amt;
                    }
                }
            }
        }

        const totalDue = baseFee + actionsFee + storeFee + prevArrears;

        const permanentItems = items.filter(it => it.isTuition || it.category === 'tuition' || it.category === 'transport').map(it => ({ ...it, isPaid: isBasePaid, status: isBasePaid ? 'paid' : 'pending' }));
        const actionItems = items.filter(it => it.isAction || it.category === 'action');
        const storeItems = items.filter(it => it.isStore || it.category === 'store');
        const arrearsItems = items.filter(it => it.isArrears || it.category === 'arrears').map(it => ({ ...it, isPaid: isBasePaid, status: isBasePaid ? 'paid' : 'pending' }));

        const set1PermanentTotal = permanentItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
        const set2ActionsTotal = actionItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
        const set3StoreTotal = storeItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
        const set4ArrearsTotal = arrearsItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);

        const unpaidPermanentTotal = isBasePaid ? 0 : set1PermanentTotal;
        const unpaidActionsTotal = actionItems.filter(it => !it.isPaid).reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
        const unpaidStoreTotal = storeItems.filter(it => !it.isPaid).reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
        const unpaidArrearsTotal = isBasePaid ? 0 : set4ArrearsTotal;

        const pendingDue = unpaidPermanentTotal + unpaidActionsTotal + unpaidStoreTotal + unpaidArrearsTotal;
        const isFullyPaid = (pendingDue === 0 && (isBasePaid || totalDue === 0));
        const isPartiallyPaid = (isBasePaid && pendingDue > 0) || (pendingDue > 0 && pendingDue < totalDue);

        return {
            items,
            permanentItems,
            actionItems,
            storeItems,
            arrearsItems,
            set1PermanentTotal,
            set2ActionsTotal,
            set3StoreTotal,
            set4ArrearsTotal,
            unpaidPermanentTotal,
            unpaidActionsTotal,
            unpaidStoreTotal,
            unpaidArrearsTotal,
            baseFee,
            actionsFee,
            storeFee,
            previousMonthsCount: prevCount,
            previousMonthsArrears: prevArrears,
            totalDue,
            pendingDue,
            isPaid: isFullyPaid,
            isFullyPaid,
            isPartiallyPaid,
            monthStatus: isFullyPaid ? 'paid' : isPartiallyPaid ? 'partial' : monthStatus
        };
    }, [activeChild, selectedStudent, currentAction, selectedTargetMonthIdx, studentReliabilityData]);

    // Multi-Child & Family Combined Fees Calculation Engine (Multi-Field Fallback)
    const feeCalculation = useMemo(() => {
        if (!selectedStudent) return null;

        const isMultiFamily = siblingPaymentScope === 'family' && detectedSiblings.length > 1;
        const allFamilyList = isMultiFamily ? detectedSiblings : [activeChild || selectedStudent];

        let combinedTuitionFee = 0;
        let combinedTransportFee = 0;
        let combinedBaseFee = 0;
        let combinedActionsFee = 0;
        let combinedStoreFee = 0;
        let combinedPreviousArrears = 0;
        let combinedPendingDue = 0;
        let totalPreviousMonthsCount = 0;
        let householdGrandTotal = 0;
        let householdTotalPendingDue = 0;
        let payingSiblingsCount = 0;
        const studentsBreakdown = [];
        const allItems = [];

        allFamilyList.forEach(st => {
            const isPaying = isMultiFamily ? selectedSiblingIds.includes(st.id) : true;
            if (isPaying) payingSiblingsCount++;

            const items = [];
            let stTuitionFee = 0;
            let stTransportFee = 0;
            let stBaseFee = 0;
            let stActionsFee = 0;
            let stStoreFee = 0;

            const is100PercentFree = (
                st.isScholarship === true || 
                st.isFreeShip === true || 
                st.concessionType === 'free' || 
                Number(st.feeDiscount) === 100
            );

            let baseTuition = Number(st.tuitionFee || st.monthlyFee || st.fee || st.monthlyTuition || st.baseFee || 0);
            if (baseTuition === 0 && Array.isArray(st.feeStructure) && st.feeStructure.length > 0) {
                const tuitionItem = st.feeStructure.find(f => (f.name || '').toLowerCase().includes('tuition'));
                if (tuitionItem) baseTuition = Number(tuitionItem.amount || 0);
                else baseTuition = st.feeStructure.reduce((sum, f) => sum + Number(f.amount || 0), 0);
            }
            if (baseTuition === 0 && !is100PercentFree) {
                baseTuition = 2000;
            }

            let tuition = is100PercentFree ? 0 : baseTuition;
            if (!is100PercentFree && st.feeDiscount && Number(st.feeDiscount) > 0) {
                const disc = Number(st.feeDiscount);
                if (disc <= 100) {
                    tuition = Math.max(0, Math.round(baseTuition * (1 - disc / 100)));
                } else {
                    tuition = Math.max(0, baseTuition - disc);
                }
            }

            let prevCount = Number(st.previousMonthsUnpaidCount) || Number(st.unpaidMonthsCount) || 0;
            if (prevCount === 0 && st.unpaidMonths && st.unpaidMonths > 1) {
                prevCount = st.unpaidMonths - 1;
            }
            const prevArrears = Number(st.previousMonthsArrears) || (prevCount * tuition);

            if (prevArrears > 0) {
                items.push({
                    key: 'arrears',
                    name: `Previous Overdue Tuition (${prevCount} Mos)`,
                    amount: prevArrears,
                    isArrears: true,
                    category: 'arrears'
                });
            }

            if (st.feeStructure && st.feeStructure.length > 0) {
                st.feeStructure.forEach(item => {
                    const amt = Number(item.amount) || 0;
                    if (amt > 0) {
                        const nameLower = (item.name || '').toLowerCase();
                        if (nameLower.includes('transport') || nameLower.includes('van') || nameLower.includes('bus')) {
                            stTransportFee += amt;
                            items.push({ key: 'transport', name: item.name, amount: amt, isTransport: true, category: 'transport' });
                        } else if (nameLower.includes('store') || nameLower.includes('uniform') || nameLower.includes('book') || nameLower.includes('stationery')) {
                            stStoreFee += amt;
                            items.push({ key: 'store', name: item.name, amount: amt, isStore: true, category: 'store' });
                        } else {
                            stTuitionFee += amt;
                            items.push({ key: 'tuition', name: item.name || 'Fee Item', amount: amt, isTuition: true, category: 'tuition' });
                        }
                    }
                });
                stBaseFee = stTuitionFee + stTransportFee;
            } else {
                const transport = Number(st.transportFee || st.monthlyTransportFee || 0);
                const other = Number(st.otherFees || 0);
                if (tuition > 0) {
                    stTuitionFee += tuition;
                    items.push({ key: 'tuition', name: 'Monthly Tuition Fee', amount: tuition, isTuition: true, category: 'tuition' });
                }
                if (transport > 0) {
                    stTransportFee += transport;
                    items.push({ key: 'transport', name: 'Transport Fee', amount: transport, isTransport: true, category: 'transport' });
                }
                if (other > 0) {
                    stTuitionFee += other;
                    items.push({ key: 'other', name: 'Other Fees', amount: other, isTuition: true, category: 'tuition' });
                }
                stBaseFee = stTuitionFee + stTransportFee;
            }

            // Store purchases / Store items in student doc
            if (Array.isArray(st.storePurchases)) {
                const unpaidStore = st.storePurchases.filter(sp => sp.status === 'unpaid');
                unpaidStore.forEach(sp => {
                    const amt = Number(sp.amount || sp.totalAmount || 0);
                    if (amt > 0) {
                        stStoreFee += amt;
                        items.push({
                            key: 'store',
                            name: sp.itemName || sp.title || 'Store Purchase',
                            amount: amt,
                            isStore: true,
                            category: 'store'
                        });
                    }
                });
            } else if (Number(st.storeDues || 0) > 0) {
                stStoreFee += Number(st.storeDues);
                items.push({
                    key: 'store',
                    name: 'Store & Uniform Dues',
                    amount: Number(st.storeDues),
                    isStore: true,
                    category: 'store'
                });
            }

            // Individual Actions & Store items (1-Time Count Rule with Target Month Filter & Carry-Forward)
            const currentYear = new Date().getFullYear();
            const targetMonthKey = `${currentYear}-${String(selectedTargetMonthIdx + 1).padStart(2, '0')}`;
            
            const rawActionsList = [
                ...(Array.isArray(st.individualActions) ? st.individualActions : []),
                ...(Array.isArray(st.storeCharges) ? st.storeCharges : [])
            ];
            const seenActionIds = new Set();
            const combinedActionsList = [];
            rawActionsList.forEach(act => {
                const actId = act.id || `${act.name}_${act.amount}_${act.date || act.createdAt}`;
                if (!seenActionIds.has(actId)) {
                    seenActionIds.add(actId);
                    combinedActionsList.push(act);
                }
            });

            const pendingActions = combinedActionsList.filter(action => {
                const actMonthKey = action.monthKey || (action.createdAt ? action.createdAt.slice(0, 7) : (action.date ? action.date.slice(0, 7) : targetMonthKey));
                if (targetMonthKey < actMonthKey) return false;
                if (action.status === 'paid') {
                    const paidMonthKey = action.paidMonthKey || action.monthKey || (action.paidAt ? action.paidAt.slice(0, 7) : actMonthKey);
                    return targetMonthKey === paidMonthKey;
                }
                return targetMonthKey >= actMonthKey;
            });
            pendingActions.forEach(action => {
                const amt = Number(action.amount) || 0;
                if (amt > 0) {
                    const isStore = action.type === 'store_inventory' || (action.id && String(action.id).startsWith('store_')) || /store|uniform|book|stationery/i.test(action.name || action.title || '');
                    if (isStore) {
                        stStoreFee += amt;
                    } else {
                        stActionsFee += amt;
                    }
                    const isItemPaid = action.status === 'paid' || action.isPaid === true;
                    items.push({ 
                        id: action.id,
                        key: isStore ? 'store' : `custom_action_${action.id}`,
                        name: action.name || action.title, 
                        amount: amt,
                        isStore,
                        isAction: !isStore,
                        category: isStore ? 'store' : 'action',
                        status: isItemPaid ? 'paid' : 'pending',
                        isPaid: isItemPaid,
                        actionObj: action
                    });
                }
            });

            // Global Action
            if (currentAction) {
                const isTargeted = currentAction.targetAll || (currentAction.targetClasses && currentAction.targetClasses.includes(st.classId));
                if (isTargeted) {
                    const isPaid = st.customPayments?.[currentAction.name]?.status === 'paid';
                    if (!isPaid) {
                        const amt = Number(currentAction.amount) || 0;
                        if (amt > 0) {
                            items.push({ key: 'action', name: `Global: ${currentAction.name}`, amount: amt, isAction: true, category: 'action', isPaid: false, status: 'pending' });
                            stActionsFee += amt;
                        }
                    }
                }
            }

            const stHist = st.monthlyFeeHistory?.[targetMonthKey];
            const stBasePaid = stHist?.status === 'paid' ||
                               (Array.isArray(st.paidMonths) && st.paidMonths.includes(targetMonthKey)) ||
                               (st.monthlyFeeStatus === 'paid' && selectedTargetMonthIdx === new Date().getMonth());

            const stUnpaidBase = stBasePaid ? 0 : stBaseFee;
            const stUnpaidArrears = stBasePaid ? 0 : prevArrears;
            const stUnpaidActions = items.filter(it => it.isAction && !it.isPaid).reduce((acc, it) => acc + Number(it.amount || 0), 0);
            const stUnpaidStore = items.filter(it => it.isStore && !it.isPaid).reduce((acc, it) => acc + Number(it.amount || 0), 0);
            const stPendingDue = stUnpaidBase + stUnpaidArrears + stUnpaidActions + stUnpaidStore;
            const stTotal = stBaseFee + stActionsFee + stStoreFee + prevArrears;

            householdGrandTotal += stTotal;
            householdTotalPendingDue += stPendingDue;

            if (isPaying) {
                combinedTuitionFee += stTuitionFee;
                combinedTransportFee += stTransportFee;
                combinedBaseFee += stBaseFee;
                combinedActionsFee += stActionsFee;
                combinedStoreFee += stStoreFee;
                combinedPreviousArrears += prevArrears;
                combinedPendingDue += stPendingDue;
                totalPreviousMonthsCount += prevCount;
            }

            studentsBreakdown.push({
                studentId: st.id,
                studentName: st.name,
                rollNo: st.rollNo || 'N/A',
                className: st.className || classes.find(c => c.id === st.classId)?.name || 'Class',
                classId: st.classId,
                items,
                tuitionFee: stTuitionFee,
                transportFee: stTransportFee,
                baseFee: stBaseFee,
                actionsFee: stActionsFee,
                storeFee: stStoreFee,
                previousMonthsCount: prevCount,
                previousMonthsArrears: prevArrears,
                subtotal: stTotal,
                pendingDue: stPendingDue,
                isPaying,
                isPaid: stPendingDue === 0 && (stBasePaid || stTotal === 0)
            });

            if (isPaying) {
                items.forEach(it => {
                    allItems.push({
                        ...it,
                        studentName: st.name,
                        className: st.className || 'Class',
                        name: isMultiFamily ? `${st.name} (${st.className || 'Class'}): ${it.name}` : it.name
                    });
                });
            }
        });

        const calculatedTotal = combinedBaseFee + combinedActionsFee + combinedStoreFee + combinedPreviousArrears;
        const totalDueWithFine = calculatedTotal + Number(fineAmount || 0);
        
        const currentYear = new Date().getFullYear();
        const targetMonthKey = `${currentYear}-${String(selectedTargetMonthIdx + 1).padStart(2, '0')}`;
        const allPaid = allFamilyList.every(s => {
            const hist = s.monthlyFeeHistory?.[targetMonthKey];
            return hist?.status === 'paid' ||
                   (Array.isArray(s.paidMonths) && s.paidMonths.includes(targetMonthKey)) ||
                   (s.monthlyFeeStatus === 'paid' && selectedTargetMonthIdx === new Date().getMonth());
        });

        const totalPendingDue = combinedPendingDue + (combinedPendingDue > 0 ? Number(fineAmount || 0) : 0);
        const allFullyPaid = totalPendingDue === 0 && (allPaid || calculatedTotal === 0);
        const isPartiallyPaid = (allPaid && totalPendingDue > 0) || (totalPendingDue > 0 && totalPendingDue < totalDueWithFine);

        return {
            isMultiFamily,
            activeSiblingsCount: allFamilyList.length,
            payingSiblingsCount: payingSiblingsCount || allFamilyList.length,
            studentsBreakdown,
            items: allItems,
            tuitionFee: combinedTuitionFee,
            transportFee: combinedTransportFee,
            baseFee: combinedBaseFee,
            actionsFee: combinedActionsFee,
            storeFee: combinedStoreFee,
            previousMonthsCount: totalPreviousMonthsCount,
            previousMonthsArrears: combinedPreviousArrears,
            calculatedTotal,
            totalDue: totalDueWithFine,
            pendingDue: totalPendingDue,
            householdGrandTotal,
            householdTotalPendingDue,
            isPaid: allFullyPaid,
            isFullyPaid: allFullyPaid,
            isPartiallyPaid
        };
    }, [selectedStudent, detectedSiblings, selectedSiblingIds, siblingPaymentScope, activeChild, currentAction, fineAmount, classes, selectedTargetMonthIdx]);

    // Active selectable items for the currently active student / month
    const activePayableItems = useMemo(() => {
        if (selectedDetailMonthData?.breakdown) {
            const b = selectedDetailMonthData.breakdown;
            const list = [];
            if (b.arrears > 0) {
                list.push({ key: 'arrears', name: `Previous Overdue Arrears (${b.arrearsMonthsCount || 1} Mos)`, amount: b.arrears, category: 'arrears' });
            }
            if (b.tuitionPayable > 0) {
                list.push({ key: 'tuition', name: `Monthly Tuition (${selectedDetailMonthData.targetMonthName})`, amount: b.tuitionPayable, category: 'tuition' });
            }
            if (b.transportFee > 0) {
                list.push({ key: 'transport', name: 'Transport / Van Fee', amount: b.transportFee, category: 'transport' });
            }
            if (Array.isArray(b.recurringItems) && b.recurringItems.length > 0) {
                b.recurringItems.forEach((rec, rIdx) => {
                    const recAmt = Number(rec.amount || 0);
                    if (recAmt > 0) {
                        list.push({
                            key: `recurring_${rIdx}`,
                            name: rec.name || 'Recurring Fee',
                            amount: recAmt,
                            category: 'recurring',
                            isRecurring: true
                        });
                    }
                });
            } else if (b.otherRecurringTotal > 0) {
                list.push({
                    key: 'recurring',
                    name: 'Online & Other Services',
                    amount: b.otherRecurringTotal,
                    category: 'recurring',
                    isRecurring: true
                });
            }
            if (b.storeDues > 0) {
                list.push({ key: 'store', name: 'Uniform & Store Items', amount: b.storeDues, category: 'store' });
            }
            if (b.actionFee > 0) {
                list.push({ key: 'action', name: cleanFeeItemName(b.actionName) || 'Events & Actions', amount: b.actionFee, category: 'action' });
            }

            // Custom On-The-Spot Actions added for this student (1-Time Month Filter)
            const studentToAssess = activeChild || selectedStudent;
            const currentYear = new Date().getFullYear();
            const targetMonthKey = `${currentYear}-${String(selectedTargetMonthIdx + 1).padStart(2, '0')}`;
            if (studentToAssess && Array.isArray(studentToAssess.individualActions)) {
                studentToAssess.individualActions.forEach((act, idx) => {
                    if (act.type === 'recurring_fee' || act.isRecurring || (Array.isArray(b.recurringItems) && b.recurringItems.some(r => (r.name || '').toLowerCase() === (act.name || act.title || '').toLowerCase()))) {
                        return;
                    }
                    const actMonthKey = act.monthKey || (act.createdAt ? act.createdAt.slice(0, 7) : (act.date ? act.date.slice(0, 7) : targetMonthKey));
                    if (targetMonthKey < actMonthKey) return;
                    if (act.status === 'paid') {
                        const paidMonthKey = act.paidMonthKey || act.monthKey || (act.paidAt ? act.paidAt.slice(0, 7) : actMonthKey);
                        if (targetMonthKey !== paidMonthKey) return;
                    }
                    if (act.status !== 'paid' && act.type !== 'store_inventory') {
                        const actKey = `custom_action_${act.id || idx}`;
                        list.push({
                            key: actKey,
                            id: act.id || `act_${idx}`,
                            name: act.name || act.title || 'Custom Fee',
                            amount: Number(act.amount) || 0,
                            category: 'custom_action',
                            remarks: act.remarks || '',
                            isCustomAction: true,
                            actionObj: act
                        });
                    }
                });
            }

            const fineVal = isFineWaived ? 0 : Number(fineAmount || b.penaltyFine || 0);
            if (fineVal > 0) {
                list.push({ key: 'fine', name: dueInfo.isOverdue ? `Late Payment Penalty (${dueInfo.daysLate}d Overdue)` : 'Late Fine / Penalty', amount: fineVal, category: 'fine' });
            }
            return list;
        }
        return feeCalculation?.items || [];
    }, [selectedDetailMonthData, feeCalculation, fineAmount, isFineWaived, dueInfo, activeChild, selectedStudent]);

    // Items that are actively checked for payment
    const selectedPayableItems = useMemo(() => {
        return activePayableItems.filter(it => !it.key || selectedFeeItemKeys.includes(it.key));
    }, [activePayableItems, selectedFeeItemKeys]);

    // Net payable total derived from only checked items minus discount
    const payableNetTotal = useMemo(() => {
        if (feeCalculation?.isMultiFamily) {
            const due = feeCalculation.pendingDue !== undefined ? feeCalculation.pendingDue : (feeCalculation.totalDue || 0);
            return Math.max(0, Number(due) - Number(discountAmount || 0));
        }
        const unpaidSelected = selectedPayableItems.filter(it => !it.isPaid);
        const sum = unpaidSelected.length > 0
            ? unpaidSelected.reduce((acc, it) => acc + (Number(it.amount) || 0), 0)
            : selectedPayableItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
        return Math.max(0, sum - Number(discountAmount || 0));
    }, [feeCalculation, selectedPayableItems, discountAmount]);

    // Student Store Purchases Itemized Breakdown
    const studentStoreItems = useMemo(() => {
        const targetStudent = activeChild || selectedStudent;
        if (!targetStudent) return [];

        const itemsList = [];
        const targetMonthKey = selectedDetailMonthData ? `${selectedDetailMonthData.targetYear}-${String(selectedDetailMonthData.targetMonthIdx + 1).padStart(2, '0')}` : null;

        // 1. From storeCharges array
        if (Array.isArray(targetStudent.storeCharges)) {
            targetStudent.storeCharges.forEach(ch => {
                const chMonthKey = ch.date ? ch.date.slice(0, 7) : null;
                if (!targetMonthKey || chMonthKey === targetMonthKey || ch.status !== 'paid') {
                    if (Array.isArray(ch.items) && ch.items.length > 0) {
                        ch.items.forEach(it => {
                            itemsList.push({
                                name: it.name || 'Store Item',
                                quantity: Number(it.quantity) || 1,
                                price: Number(it.price) || 0,
                                size: it.size || '',
                                receiptNo: ch.receiptNo || 'STORE-KIT',
                                date: ch.date,
                                status: ch.status || 'unpaid',
                                total: (Number(it.price) || 0) * (Number(it.quantity) || 1)
                            });
                        });
                    } else {
                        itemsList.push({
                            name: ch.name || 'Uniform / Store Kit',
                            quantity: Number(ch.itemsCount) || 1,
                            price: Number(ch.amount) || 0,
                            size: '',
                            receiptNo: ch.receiptNo || 'STORE-KIT',
                            date: ch.date,
                            status: ch.status || 'unpaid',
                            total: Number(ch.amount) || 0
                        });
                    }
                }
            });
        }

        // 2. From storePurchases array
        if (Array.isArray(targetStudent.storePurchases)) {
            targetStudent.storePurchases.forEach(sp => {
                if (!targetMonthKey || sp.monthKey === targetMonthKey || sp.status !== 'paid') {
                    if (Array.isArray(sp.items) && sp.items.length > 0) {
                        sp.items.forEach(it => {
                            itemsList.push({
                                name: it.name || 'Store Item',
                                quantity: Number(it.quantity) || 1,
                                price: Number(it.price) || 0,
                                size: it.size || '',
                                receiptNo: sp.receiptNo || 'STORE-REC',
                                date: sp.date || sp.purchasedAt,
                                status: sp.status || 'unpaid',
                                total: (Number(it.price) || 0) * (Number(it.quantity) || 1)
                            });
                        });
                    } else {
                        itemsList.push({
                            name: sp.name || sp.itemName || 'Uniform / Books Kit',
                            quantity: Number(sp.quantity) || 1,
                            price: Number(sp.price || sp.amount) || 0,
                            size: sp.size || '',
                            receiptNo: sp.receiptNo || 'STORE-REC',
                            date: sp.date || sp.purchasedAt,
                            status: sp.status || 'unpaid',
                            total: Number(sp.price || sp.amount) || 0
                        });
                    }
                }
            });
        }

        // 3. From individualActions
        if (Array.isArray(targetStudent.individualActions)) {
            targetStudent.individualActions.forEach(act => {
                if (act.type === 'store_inventory' || (act.name && act.name.toLowerCase().includes('store'))) {
                    if (Array.isArray(act.items) && act.items.length > 0) {
                        act.items.forEach(it => {
                            if (!itemsList.some(existing => existing.receiptNo === act.receiptNo && existing.name === it.name)) {
                                itemsList.push({
                                    name: it.name || 'Store Item',
                                    quantity: Number(it.quantity) || 1,
                                    price: Number(it.price) || 0,
                                    size: it.size || '',
                                    receiptNo: act.receiptNo || 'STORE-ACTION',
                                    date: act.date,
                                    status: act.status || 'unpaid',
                                    total: (Number(it.price) || 0) * (Number(it.quantity) || 1)
                                });
                            }
                        });
                    } else if (!itemsList.some(existing => existing.receiptNo === act.receiptNo)) {
                        itemsList.push({
                            name: act.name,
                            quantity: Number(act.itemsCount) || 1,
                            price: Number(act.amount) || 0,
                            size: '',
                            receiptNo: act.receiptNo || 'STORE-ACTION',
                            date: act.date,
                            status: act.status || 'unpaid',
                            total: Number(act.amount) || 0
                        });
                    }
                }
            });
        }

        // 4. Fallback if lastStorePurchase exists and list is empty
        if (itemsList.length === 0 && targetStudent.lastStorePurchase) {
            itemsList.push({
                name: targetStudent.lastStorePurchase.itemsSummary || 'Store Purchase',
                quantity: 1,
                price: Number(targetStudent.lastStorePurchase.amount) || 0,
                size: '',
                receiptNo: targetStudent.lastStorePurchase.receiptNo || 'STORE-LAST',
                date: targetStudent.lastStorePurchase.date,
                status: 'unpaid',
                total: Number(targetStudent.lastStorePurchase.amount) || 0
            });
        }

        // 5. Fallback if flat storeDues is present but items list is empty
        const flatDues = Number(selectedDetailMonthData?.breakdown?.storeDues || feeCalculation?.storeFee || targetStudent.storeDues || 0);
        if (itemsList.length === 0 && flatDues > 0) {
            itemsList.push({
                name: 'Books, Uniform & Stationery Items',
                quantity: 1,
                price: flatDues,
                size: '',
                receiptNo: 'STORE-PENDING',
                date: new Date().toISOString(),
                status: 'unpaid',
                total: flatDues
            });
        }

        return itemsList;
    }, [activeChild, selectedStudent, selectedDetailMonthData, feeCalculation]);

    // Auto calculate final payable when selected items, discount, fine, or student fee changes
    useEffect(() => {
        setReceivedAmount(String(payableNetTotal));
    }, [payableNetTotal]);

    // Clear Selected Student & Reset Form
    const handleClearSelection = () => {
        setSelectedStudent(null);
        setSelectedStudentId('');
        setSelectedClassId('');
        setSelectedSiblingIds([]);
        setSiblingPaymentScope('family');
        setSelectedFeeItemKeys(['tuition', 'transport', 'store', 'action', 'fine']);
        setSearchQuery('');
        setReceivedAmount('0');
        setDiscountAmount('0');
        setFineAmount('0');
        setPaymentMode('Cash');
        setProofFile(null);
        setProofPreview(null);
        setRemarks('');
        setAssessmentViewMode('assessment');
        setCashierStep(1);
    };

    // Submit Fee Collection Transaction (Zero-Loss 100% Offline Instant Resilient)
    const handleSubmitFee = async (e) => {
        e.preventDefault();
        if (!selectedStudent || !schoolId || !feeCalculation) return;

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
            const isMultiFamily = feeCalculation.isMultiFamily;
            const receiptNo = isMultiFamily ? `REC-FAM-${Date.now().toString().slice(-6)}` : `REC-${Date.now().toString().slice(-6)}`;

            // Target Month metadata
            const targetYear = selectedDetailMonthData?.targetYear || new Date().getFullYear();
            const targetMonthIndex = selectedTargetMonthIdx !== undefined ? selectedTargetMonthIdx : new Date().getMonth();
            const targetMonthName = MONTH_NAMES[targetMonthIndex] || 'Current Month';
            const targetMonthKey = `${targetYear}-${String(targetMonthIndex + 1).padStart(2, '0')}`;

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

            const now = new Date();
            const dateString = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const fatherName = selectedStudent.parentDetails?.fatherName || selectedStudent.fatherName || 'Parent / Guardian';
            const fatherPhone = selectedStudent.parentDetails?.fatherPhone || selectedStudent.fatherPhone || selectedStudent.phone || '';

            // Build Itemized list for Receipt & Ledger (Only Selected Paid Items!)
            const receiptItems = selectedPayableItems.length > 0 ? [...selectedPayableItems] : [...(feeCalculation.items || [])];
            if (fine > 0 && selectedFeeItemKeys.includes('fine') && !receiptItems.some(it => it.key === 'fine')) {
                receiptItems.push({
                    name: dueInfo.isOverdue ? `Late Payment Penalty (${dueInfo.daysLate}d Overdue)` : 'Late Fine / Penalty',
                    amount: fine
                });
            } else if (isFineWaived && selectedFeeItemKeys.includes('fine')) {
                receiptItems.push({
                    name: 'Late Penalty (Waived / Maaf by Principal)',
                    amount: 0,
                    isWaived: true
                });
            }

            const isPayingTuition = selectedFeeItemKeys.includes('tuition');
            const isPayingStore = selectedFeeItemKeys.includes('store');
            const isPayingAction = selectedFeeItemKeys.includes('action');
            const isPayingFine = selectedFeeItemKeys.includes('fine');

            const isFullySettled = finalAmount >= payableNetTotal || (payableNetTotal === 0 && isPayingTuition);
            const activeCashierName = auth?.currentUser?.displayName || auth?.currentUser?.email?.split('@')[0] || 'Principal Office';

            const transactionRecord = {
                receiptNo,
                isFamilyCombined: isMultiFamily,
                familyStudents: feeCalculation.studentsBreakdown,
                studentId: selectedStudent.id,
                studentName: isMultiFamily ? `Family of ${fatherName} (${feeCalculation.activeSiblingsCount} Students)` : selectedStudent.name,
                rollNo: isMultiFamily ? '-' : (selectedStudent.rollNo || 'N/A'),
                classId: selectedStudent.classId,
                className: isMultiFamily ? `${feeCalculation.activeSiblingsCount} Classes Combined` : (selectedStudent.className || 'Class'),
                fatherName,
                fatherPhone,
                items: receiptItems,
                paidCategories: selectedFeeItemKeys,
                baseFee: isPayingTuition ? (feeCalculation.baseFee || 0) : 0,
                actionsFee: isPayingAction ? (feeCalculation.actionsFee || 0) : 0,
                fineAmount: isPayingFine ? fine : 0,
                isFineWaived: Boolean(isFineWaived),
                waivedFineAmount: isFineWaived ? Number(dueInfo.autoFine || 0) : 0,
                discount: discount,
                totalPaid: finalAmount,
                remainingBalance: Math.max(0, payableNetTotal - finalAmount),
                paymentMode,
                proofUrl: proofUrl || null,
                remarks: remarks.trim(),
                dueDate: dueInfo.dueDateStr || null,
                timestamp: new Date(),
                dateString,
                timeString,
                targetMonthKey,
                targetMonthIdx: targetMonthIndex,
                targetMonthName,
                targetYear,
                collectedBy: activeCashierName
            };

            // 1. Persistent Local Queue Item (IndexedDB + Zero-Loss Guarantee)
            const queuedItem = {
                ...transactionRecord,
                queueId,
                dateIso: new Date().toISOString()
            };

            const updatedQueue = [queuedItem, ...pendingOfflineTxs.filter(t => t.receiptNo !== receiptNo)];
            savePendingQueue(updatedQueue);
            // High-Capacity IndexedDB Enqueue (Supports 5,000+ without 5MB limits)
            enqueueOfflineFeeTransaction(schoolId, queuedItem);

            // 2. Optimistic UI Updates (<50ms)
            setRecentTransactions(prev => [transactionRecord, ...prev.filter(t => t.receiptNo !== receiptNo)]);
            setStudentHistoryTxs(prev => [transactionRecord, ...prev.filter(t => t.receiptNo !== receiptNo)]);

            // In-memory student update for all affected siblings (Ensures child-specific split accuracy)
            const updatedStudentsMap = new Map();
            const targetSiblingsToProcess = isMultiFamily 
                ? (feeCalculation.studentsBreakdown || []).filter(st => st.isPaying !== false)
                : (feeCalculation.studentsBreakdown || []).filter(st => st.studentId === selectedStudent.id);
            const finalSiblingsToProcess = targetSiblingsToProcess.length > 0 
                ? targetSiblingsToProcess 
                : [{ studentId: selectedStudent.id, classId: selectedClassId || selectedStudent.classId, subtotal: finalAmount, isPaying: true }];

            finalSiblingsToProcess.forEach(st => {
                const childSubtotal = Number(st.pendingDue !== undefined ? st.pendingDue : (st.subtotal || 0));
                const isThisChildPaying = st.isPaying !== false;
                const childPaidAmount = isMultiFamily
                    ? (isThisChildPaying ? (payableNetTotal > 0 ? Math.min(childSubtotal, Math.round((childSubtotal / payableNetTotal) * finalAmount)) : childSubtotal) : 0)
                    : finalAmount;
                const childRemaining = Math.max(0, childSubtotal - childPaidAmount);
                const isChildSettled = isThisChildPaying && (childPaidAmount >= childSubtotal || (childSubtotal === 0 && isPayingTuition));

                const targetStudentDoc = selectedStudent.id === st.studentId ? selectedStudent : (allStudents.find(s => s.id === st.studentId) || st);
                const oldPaidMonths = Array.isArray(targetStudentDoc.paidMonths) ? targetStudentDoc.paidMonths : [];
                const newPaidMonths = isChildSettled ? (oldPaidMonths.includes(targetMonthKey) ? oldPaidMonths : [...oldPaidMonths, targetMonthKey]) : oldPaidMonths;

                const existingIndActions = Array.isArray(targetStudentDoc.individualActions) ? targetStudentDoc.individualActions : [];
                const paidCustomItems = isThisChildPaying ? existingIndActions.filter(act => {
                    const actKey = `custom_action_${act.id}`;
                    const isStore = act.type === 'store_inventory' || (act.id && String(act.id).startsWith('store_')) || /store|uniform|book|stationery/i.test(act.name || act.title || '');
                    return selectedFeeItemKeys.includes(actKey) || (isPayingStore && isStore && act.status !== 'paid') || (isPayingAction && !isStore && act.status !== 'paid') || (act.status !== 'paid');
                }).map(act => ({
                    id: act.id || '',
                    title: act.title || act.name,
                    amount: Number(act.amount) || 0,
                    remarks: act.remarks || '',
                    status: 'PAID_LOCKED',
                    paidAt: now.toISOString(),
                    receiptNo
                })) : [];

                const updatedIndActions = existingIndActions.map(act => {
                    const actKey = `custom_action_${act.id}`;
                    const isStore = act.type === 'store_inventory' || (act.id && String(act.id).startsWith('store_')) || /store|uniform|book|stationery/i.test(act.name || act.title || '');
                    const isThisActPaying = isThisChildPaying && (selectedFeeItemKeys.includes(actKey) || (isPayingStore && isStore && act.status !== 'paid') || (isPayingAction && !isStore && act.status !== 'paid') || (act.status !== 'paid'));
                    if (isThisActPaying) {
                        return {
                            ...act,
                            status: 'paid',
                            paidAt: now.toISOString(),
                            receiptNo,
                            paymentMode,
                            month: targetMonthName,
                            monthKey: targetMonthKey
                        };
                    }
                    return act;
                });

                const newHistory = {
                    ...(targetStudentDoc.monthlyFeeHistory || {}),
                    [targetMonthKey]: {
                        status: isChildSettled ? 'paid' : 'partial',
                        paidAmount: ((targetStudentDoc.monthlyFeeHistory?.[targetMonthKey]?.paidAmount || 0) + childPaidAmount),
                        remainingBalance: childRemaining,
                        paidAt: now.toISOString(),
                        receiptNo,
                        isFamilyCombined: isMultiFamily,
                        familyReceiptNo: receiptNo,
                        paidItems: selectedFeeItemKeys,
                        paymentMode,
                        customItems: paidCustomItems
                    }
                };

                const updatedStudentObj = {
                    ...targetStudentDoc,
                    monthlyFeeStatus: isChildSettled ? 'paid' : (targetStudentDoc.monthlyFeeStatus || 'pending'),
                    monthlyFeeDate: now.toISOString(),
                    paidMonths: newPaidMonths,
                    monthlyFeeHistory: newHistory,
                    individualActions: updatedIndActions,
                    lastPaymentMode: paymentMode,
                    lastReceiptNo: receiptNo,
                    lastPaymentAmount: childPaidAmount,
                    lastPaymentProofUrl: proofUrl || null,
                    pendingPaymentSubmission: {
                        status: 'approved',
                        approvedAt: now.toISOString()
                    }
                };
                updatedStudentsMap.set(st.studentId, updatedStudentObj);
                // Update local IndexedDB Cache
                updateCachedStudentOffline(schoolId, st.studentId, updatedStudentObj);
            });

            setSelectedStudent(prev => prev ? (updatedStudentsMap.get(prev.id) || prev) : prev);
            setAllStudents(prev => prev.map(s => (updatedStudentsMap.has(s.id) ? updatedStudentsMap.get(s.id) : s)));
            setClassStudents(prev => prev.map(s => (updatedStudentsMap.has(s.id) ? updatedStudentsMap.get(s.id) : s)));

            // 3. Instant UI Receipt & Modal Preparation (Automatic download disabled, on-demand available via modal)
            setReceiptData(transactionRecord);

            // 4. Play Cashier Audio Chime & Trigger Right-Card Month Pulse
            playCashierChime();
            setRecentPaidMonthIdx(targetMonthIndex);
            setTimeout(() => {
                setRecentPaidMonthIdx(null);
            }, 3500);

            // 5. Automatic WhatsApp Receipt Dispatch (if parent phone exists and enabled)
            if (sendWhatsAppOnSubmit && fatherPhone) {
                try {
                    const schoolTitle = localSchoolInfo?.name || schoolInfo?.name || 'School Office';
                    const itemsSummary = isMultiFamily 
                        ? (feeCalculation.studentsBreakdown || []).map(st => `• *${st.studentName} (${st.className})*: Rs ${Number(st.subtotal || 0).toLocaleString()}`).join('\n')
                        : (transactionRecord.items || []).map(it => `• ${it.name}: Rs ${Number(it.amount || 0).toLocaleString()}`).join('\n');
                    const waText = `*FEE PAYMENT RECEIPT - ${schoolTitle.toUpperCase()}*\n\n` +
                        `*Receipt No:* ${receiptNo}\n` +
                        (isMultiFamily ? `*Family:* ${fatherName} (${feeCalculation.activeSiblingsCount} Children)\n` : `*Student:* ${transactionRecord.studentName} (${transactionRecord.className})\n`) +
                        `*Father:* ${fatherName}\n` +
                        `*Month:* ${targetMonthName} ${targetYear}\n` +
                        `*Date:* ${dateString} ${timeString}\n` +
                        `*Payment Mode:* ${paymentMode}\n\n` +
                        `*Itemized Breakdown:*\n${itemsSummary}\n` +
                        (Number(discount) > 0 ? `*Discount:* -Rs ${Number(discount).toLocaleString()}\n` : '') +
                        `--------------------------\n` +
                        `*TOTAL PAID:* Rs ${Number(finalAmount).toLocaleString()}\n` +
                        (transactionRecord.remainingBalance > 0 ? `*Remaining Due:* Rs ${Number(transactionRecord.remainingBalance).toLocaleString()}\n` : `*Status:* Fully Cleared ✓\n`) +
                        `\n_Thank you for your prompt payment!_`;

                    let cleanPhone = fatherPhone.toString().replace(/[^0-9]/g, '');
                    if (cleanPhone.startsWith('0092')) cleanPhone = cleanPhone.slice(2);
                    else if (cleanPhone.startsWith('03')) cleanPhone = '92' + cleanPhone.slice(1);
                    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`, '_blank');
                } catch (waErr) {
                    console.warn("WhatsApp receipt auto-dispatch note:", waErr);
                }
            }

            // 6. Open Beautiful Payment Result Success Popup Modal
            setPaymentResultModal({
                isOpen: true,
                isSuccess: true,
                receiptData: transactionRecord,
                errorMessage: ''
            });

            // 7. Reset Payment Input Form Fields (keep step intact so screen does not jump)
            setReceivedAmount('0');
            setRemarks('');
            setProofFile(null);
            setProofPreview(null);
            setDiscountAmount('0');
            setTransactionRefId('');
            setIsFineWaived(false);
            setIsSubmitting(false);

            // 8. Background Firestore Write (Zero-Latency UI, Multi-Sibling Batch Guarantee)
            (async () => {
                try {
                    const writePromises = [];
                    const nowD = new Date();

                    const targetSiblingsForDb = isMultiFamily 
                        ? (feeCalculation.studentsBreakdown || []).filter(st => st.isPaying !== false)
                        : (feeCalculation.studentsBreakdown || []).filter(st => st.studentId === selectedStudent.id);
                    const finalSiblingsForDb = targetSiblingsForDb.length > 0 
                        ? targetSiblingsForDb 
                        : [{ studentId: selectedStudent.id, classId: selectedClassId || selectedStudent.classId, subtotal: finalAmount, isPaying: true }];

                    finalSiblingsForDb.forEach(st => {
                        const childSubtotal = Number(st.pendingDue !== undefined ? st.pendingDue : (st.subtotal || 0));
                        const childPaidAmount = isMultiFamily
                            ? (payableNetTotal > 0 ? Math.min(childSubtotal, Math.round((childSubtotal / payableNetTotal) * finalAmount)) : childSubtotal)
                            : finalAmount;
                        const childRemaining = Math.max(0, childSubtotal - childPaidAmount);
                        const isChildSettled = childPaidAmount >= childSubtotal || (childSubtotal === 0 && isPayingTuition);

                        const stRef = doc(db, `schools/${schoolId}/classes/${st.classId}/students`, st.studentId);
                        const masterStRef = doc(db, `schools/${schoolId}/students`, st.studentId);

                        // Extract custom items paid in this batch
                        const targetStudentDoc = selectedStudent.id === st.studentId ? selectedStudent : st;
                        const existingIndActions = Array.isArray(targetStudentDoc.individualActions) ? targetStudentDoc.individualActions : [];
                        const paidCustomItems = [];

                        const updatedIndActions = existingIndActions.map(act => {
                            const actKey = `custom_action_${act.id}`;
                            const isStore = act.type === 'store_inventory' || (act.id && String(act.id).startsWith('store_')) || /store|uniform|book|stationery/i.test(act.name || act.title || '');
                            const isThisActPaying = selectedFeeItemKeys.includes(actKey) || (isPayingStore && isStore && act.status !== 'paid') || (isPayingAction && !isStore && act.status !== 'paid') || (act.status !== 'paid');
                            if (isThisActPaying) {
                                paidCustomItems.push({
                                    id: act.id || '',
                                    title: act.title || act.name,
                                    amount: Number(act.amount) || 0,
                                    remarks: act.remarks || '',
                                    status: 'PAID_LOCKED',
                                    paidAt: nowD.toISOString(),
                                    receiptNo
                                });
                                return {
                                    ...act,
                                    status: 'paid',
                                    paidAt: nowD.toISOString(),
                                    receiptNo,
                                    paymentMode,
                                    month: targetMonthName,
                                    monthKey: targetMonthKey
                                };
                            }
                            return act;
                        });

                        const stPayload = {
                            lastPaymentMode: paymentMode,
                            lastReceiptNo: receiptNo,
                            lastPaymentAmount: childPaidAmount,
                            lastPaymentProofUrl: proofUrl || null,
                            lastPaymentFineWaived: Boolean(isFineWaived),
                            lastPaidItems: selectedFeeItemKeys,
                            individualActions: updatedIndActions,
                            pendingPaymentSubmission: {
                                status: 'approved',
                                approvedAt: nowD.toISOString()
                            },
                            [`monthlyFeeHistory.${targetMonthKey}`]: {
                                status: isChildSettled ? 'paid' : 'partial',
                                paidAmount: childPaidAmount,
                                remainingBalance: childRemaining,
                                paidAt: nowD.toISOString(),
                                receiptNo,
                                isFamilyCombined: isMultiFamily,
                                familyReceiptNo: receiptNo,
                                paidItems: selectedFeeItemKeys,
                                paymentMode,
                                customItems: paidCustomItems
                            }
                        };

                        if (isChildSettled || isPayingTuition) {
                            stPayload.monthlyFeeStatus = 'paid';
                            stPayload.monthlyFeeDate = nowD.toISOString();
                            stPayload.paidMonths = arrayUnion(targetMonthKey);
                        }

                        if (isPayingStore && Array.isArray(st.storePurchases)) {
                            stPayload.storePurchases = st.storePurchases.map(sp => {
                                if (sp.monthKey === targetMonthKey || sp.status === 'unpaid') {
                                    return { ...sp, status: 'paid', paidAt: nowD.toISOString(), receiptNo };
                                }
                                return sp;
                            });
                            stPayload.storeDues = 0;
                        }

                        writePromises.push(setDoc(stRef, stPayload, { merge: true }));
                        writePromises.push(setDoc(masterStRef, stPayload, { merge: true }).catch(() => {}));
                    });

                    // Save transaction record to feeTransactions
                    const txDocRef = doc(db, `schools/${schoolId}/feeTransactions`, receiptNo);
                    writePromises.push(setDoc(txDocRef, {
                        ...transactionRecord,
                        id: receiptNo,
                        timestamp: serverTimestamp()
                    }, { merge: true }));

                    // Auto approve any matching pending online submissions
                    (onlineSubmissions || []).forEach(sub => {
                        const isMatch = sub.status === 'pending' && (
                            isMultiFamily
                                ? (finalSiblingsForDb.some(st => st.studentId === sub.studentId) ||
                                   (sub.isFamilyCombined && Array.isArray(sub.familyStudents) && sub.familyStudents.some(fs => finalSiblingsForDb.some(st => st.studentId === fs.studentId))))
                                : (sub.studentId === selectedStudent.id)
                        );
                        if (isMatch && sub.id) {
                            const subRef = doc(db, `schools/${schoolId}/paymentSubmissions`, sub.id);
                            writePromises.push(updateDoc(subRef, { status: 'approved', approvedAt: nowD.toISOString() }).catch(() => {}));
                        }
                    });

                    await Promise.all(writePromises);

                    // If currently online, clear this item from queue since direct write was committed
                    if (navigator.onLine) {
                        const currentQ = JSON.parse(localStorage.getItem(`offline_fee_queue_${schoolId}`) || '[]');
                        savePendingQueue(currentQ.filter(item => item.queueId !== queueId && item.receiptNo !== receiptNo));
                    }
                } catch (writeErr) {
                    console.warn("Offline cache buffered write:", writeErr);
                }
            })();
        } catch (err) {
            console.error("Error submitting fee payment:", err);
            setIsSubmitting(false);
            setPaymentResultModal({
                isOpen: true,
                isSuccess: false,
                receiptData: null,
                errorMessage: err.message || 'Payment could not be completed.'
            });
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {/* Real-time Online Payment Audio/Visual Alert Banner */}
            {onlinePaymentAlert && (
                <div style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    borderRadius: '14px',
                    padding: '1rem 1.35rem',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 10px 25px -5px rgba(2, 132, 199, 0.4)',
                    border: '1.5px solid #7dd3fc',
                    gap: '1rem',
                    flexWrap: 'wrap',
                    animation: 'fadeInDown 0.3s ease-out'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div style={{
                            width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(255,255,255,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                            <Smartphone size={22} color="#ffffff" />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', background: '#38bdf8', color: '#082f49', padding: '2px 8px', borderRadius: '10px' }}>
                                    NEW ONLINE PAYMENT RECEIVED
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#e0f2fe' }}>Just now</span>
                            </div>
                            <div style={{ fontSize: '0.95rem', fontWeight: '800', marginTop: '2px' }}>
                                {onlinePaymentAlert.studentName} ({onlinePaymentAlert.className}) paid Rs. {Number(onlinePaymentAlert.amount || 0).toLocaleString()} via {onlinePaymentAlert.paymentMethod || 'Online'}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <button
                            onClick={() => {
                                setReviewModalSub(onlinePaymentAlert);
                                setOnlinePaymentAlert(null);
                            }}
                            style={{
                                padding: '0.5rem 1.1rem', borderRadius: '8px', border: 'none',
                                background: '#ffffff', color: '#0369a1', fontWeight: '800', fontSize: '0.85rem',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                            }}
                        >
                            <Eye size={15} /> Review & Approve
                        </button>
                        <button
                            onClick={() => setOnlinePaymentAlert(null)}
                            style={{
                                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px',
                                color: '#ffffff', padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center'
                            }}
                            title="Dismiss alert"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* Top Full-Width Prominent Summary Card: LIVE TODAY'S SUMMARY Collections Overview */}
            <div className="card animate-fade-in-up" style={{
                background: '#f1f5f9',
                borderRadius: '16px',
                padding: '1.6rem 1.85rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 14px -2px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.03)',
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
                    borderBottom: '1px solid #e2e8f0',
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
                                <span>{syncProgress.total > 0 ? `Syncing ${syncProgress.synced}/${syncProgress.total}` : `Syncing (${pendingOfflineTxs.length})`}</span>
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
                            background: '#ffffff',
                            padding: '0.35rem 0.8rem',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0'
                        }}>
                            <Calendar size={15} color="#0078d4" />
                            {todayMetrics.todayStr}
                        </div>
                    </div>
                </div>

                {/* 3 Modern Dashboard Widgets (Paper Generator Style) */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '1rem',
                    marginBottom: '1.25rem'
                }}>
                    {/* Widget 1: Live Daily Cashflow & Surplus (Emerald Theme with Glass Shine) */}
                    <div style={{
                        background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                        borderRadius: '14px',
                        padding: '1.25rem 1.4rem',
                        color: '#ffffff',
                        border: '1.5px solid rgba(255, 255, 255, 0.38)',
                        boxShadow: '0 10px 22px -3px rgba(16, 185, 129, 0.45), inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.5), inset 0 -1px 2px 0 rgba(0, 0, 0, 0.15)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        {/* Top Edge Glass Sheen Reflection */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '42%',
                            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0) 100%)',
                            pointerEvents: 'none',
                            zIndex: 1,
                            borderTopLeftRadius: 'inherit',
                            borderTopRightRadius: 'inherit'
                        }} />

                        {/* 2D Geometric Pattern (Square) */}
                        <div style={{
                            position: 'absolute',
                            top: '-15%',
                            right: '-10%',
                            width: '95px',
                            height: '95px',
                            background: 'rgba(255, 255, 255, 0.14)',
                            borderRadius: '24px',
                            transform: 'rotate(20deg)',
                            zIndex: 1,
                            pointerEvents: 'none'
                        }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', position: 'relative', zIndex: 2 }}>
                            <span style={{ fontSize: '0.86rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#f0fdf4', textShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
                                Today's Total Collections
                            </span>
                            <span style={{ fontSize: '0.76rem', fontWeight: '800', background: 'rgba(255,255,255,0.25)', padding: '3px 10px', borderRadius: '10px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '5px', border: '1px solid rgba(255,255,255,0.35)', backdropFilter: 'blur(4px)', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#6ee7b7' }} className="animate-pulse" /> Live Pulse
                            </span>
                        </div>
                        <div style={{ position: 'relative', zIndex: 2 }}>
                            <h2 style={{ margin: 0, fontSize: '2.15rem', fontWeight: '900', letterSpacing: '-0.02em', lineHeight: 1.1, color: '#ffffff', textShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                                Rs {todayMetrics.totalAmount.toLocaleString()}
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.6rem', flexWrap: 'wrap', fontSize: '0.84rem', color: '#f0fdf4' }}>
                                <span>In: <strong style={{ fontWeight: '800', color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.12)' }}>Rs {todayFinancialSummary.totalIncomes.toLocaleString()}</strong></span>
                                <span style={{ opacity: 0.7 }}>&bull;</span>
                                <span>Out: <strong style={{ fontWeight: '800', color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.12)' }}>Rs {todayFinancialSummary.totalExpenses.toLocaleString()}</strong></span>
                                <span style={{
                                    marginLeft: 'auto',
                                    fontWeight: '800',
                                    fontSize: '0.8rem',
                                    background: todayFinancialSummary.netBalance >= 0 ? 'rgba(255,255,255,0.28)' : 'rgba(239, 68, 68, 0.45)',
                                    color: '#ffffff',
                                    padding: '2px 9px',
                                    borderRadius: '7px',
                                    border: '1px solid rgba(255,255,255,0.35)',
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                                }}>
                                    {todayFinancialSummary.netBalance >= 0 ? '+' : ''}Rs {todayFinancialSummary.netBalance.toLocaleString()} Net
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Widget 2: Payment Channels Breakdown (Dashboard Orange Theme with Glass Shine) */}
                    <div style={{
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)',
                        borderRadius: '14px',
                        padding: '1.25rem 1.4rem',
                        border: '1.5px solid rgba(255, 255, 255, 0.38)',
                        boxShadow: '0 10px 22px -3px rgba(245, 158, 11, 0.45), inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.5), inset 0 -1px 2px 0 rgba(0, 0, 0, 0.15)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.65rem',
                        position: 'relative',
                        overflow: 'hidden',
                        color: '#ffffff'
                    }}>
                        {/* Top Edge Glass Sheen Reflection */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '42%',
                            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0) 100%)',
                            pointerEvents: 'none',
                            zIndex: 1,
                            borderTopLeftRadius: 'inherit',
                            borderTopRightRadius: 'inherit'
                        }} />

                        {/* 2D Geometric Pattern (Square) */}
                        <div style={{
                            position: 'absolute',
                            top: '-15%',
                            right: '-10%',
                            width: '95px',
                            height: '95px',
                            background: 'rgba(255, 255, 255, 0.14)',
                            borderRadius: '24px',
                            transform: 'rotate(20deg)',
                            zIndex: 1,
                            pointerEvents: 'none'
                        }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 2 }}>
                            <span style={{ fontSize: '0.92rem', fontWeight: '800', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.45rem', textShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
                                <BarChart3 size={17} color="#fffbeb" /> Payment Channels Mix
                            </span>
                            <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#ffffff', background: 'rgba(255, 255, 255, 0.25)', padding: '3px 10px', borderRadius: '7px', border: '1px solid rgba(255, 255, 255, 0.35)', backdropFilter: 'blur(6px)', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                                {todayMetrics.totalCount} Slips Issued
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative', zIndex: 2 }}>
                            {/* Cash */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', fontWeight: '700', marginBottom: '3px' }}>
                                    <span style={{ color: '#ffffff', display: 'flex', alignItems: 'center', gap: '4px', textShadow: '0 1px 2px rgba(0,0,0,0.12)' }}>💵 Cash ({todayMetrics.cashCount})</span>
                                    <span style={{ color: '#ffffff', fontWeight: '800', textShadow: '0 1px 2px rgba(0,0,0,0.12)' }}>Rs {todayMetrics.cashAmount.toLocaleString()} ({todayMetrics.cashPct}%)</span>
                                </div>
                                <div style={{ height: '6px', width: '100%', background: 'rgba(255, 255, 255, 0.25)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${todayMetrics.cashPct}%`, background: '#4ade80', borderRadius: '4px', boxShadow: '0 0 8px rgba(74, 222, 128, 0.5)' }} />
                                </div>
                            </div>
                            {/* Bank */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', fontWeight: '700', marginBottom: '3px' }}>
                                    <span style={{ color: '#ffffff', display: 'flex', alignItems: 'center', gap: '4px', textShadow: '0 1px 2px rgba(0,0,0,0.12)' }}>🏛️ Bank ({todayMetrics.bankCount})</span>
                                    <span style={{ color: '#ffffff', fontWeight: '800', textShadow: '0 1px 2px rgba(0,0,0,0.12)' }}>Rs {todayMetrics.bankAmount.toLocaleString()} ({todayMetrics.bankPct}%)</span>
                                </div>
                                <div style={{ height: '6px', width: '100%', background: 'rgba(255, 255, 255, 0.25)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${todayMetrics.bankPct}%`, background: '#67e8f9', borderRadius: '4px', boxShadow: '0 0 8px rgba(103, 232, 249, 0.5)' }} />
                                </div>
                            </div>
                            {/* Online */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', fontWeight: '700', marginBottom: '3px' }}>
                                    <span style={{ color: '#ffffff', display: 'flex', alignItems: 'center', gap: '4px', textShadow: '0 1px 2px rgba(0,0,0,0.12)' }}>📱 Online / Wallets ({todayMetrics.onlineCount})</span>
                                    <span style={{ color: '#ffffff', fontWeight: '800', textShadow: '0 1px 2px rgba(0,0,0,0.12)' }}>Rs {todayMetrics.onlineAmount.toLocaleString()} ({todayMetrics.onlinePct}%)</span>
                                </div>
                                <div style={{ height: '6px', width: '100%', background: 'rgba(255, 255, 255, 0.25)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${todayMetrics.onlinePct}%`, background: '#fef08a', borderRadius: '4px', boxShadow: '0 0 8px rgba(254, 240, 138, 0.5)' }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Widget 3: Tactile Studio Mode Switcher (Dashboard Indigo Theme with Glass Shine) */}
                    <div style={{
                        background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                        borderRadius: '14px',
                        padding: '1.25rem 1.4rem',
                        border: '1.5px solid rgba(255, 255, 255, 0.38)',
                        boxShadow: '0 10px 22px -3px rgba(99, 102, 241, 0.45), inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.5), inset 0 -1px 2px 0 rgba(0, 0, 0, 0.15)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.65rem',
                        position: 'relative',
                        overflow: 'hidden',
                        color: '#ffffff'
                    }}>
                        {/* Top Edge Glass Sheen Reflection */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '42%',
                            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0) 100%)',
                            pointerEvents: 'none',
                            zIndex: 1,
                            borderTopLeftRadius: 'inherit',
                            borderTopRightRadius: 'inherit'
                        }} />

                        {/* 2D Geometric Pattern (Square) */}
                        <div style={{
                            position: 'absolute',
                            top: '-15%',
                            right: '-10%',
                            width: '95px',
                            height: '95px',
                            background: 'rgba(255, 255, 255, 0.14)',
                            borderRadius: '24px',
                            transform: 'rotate(20deg)',
                            zIndex: 1,
                            pointerEvents: 'none'
                        }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 2 }}>
                            <span style={{ fontSize: '0.92rem', fontWeight: '800', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.45rem', textShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
                                <Zap size={17} color="#e0e7ff" /> Workstation Mode
                            </span>
                            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#e0e7ff', opacity: 0.95 }}>
                                Click to toggle
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', position: 'relative', zIndex: 2 }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setActiveDailyMode('fee_submission');
                                    setRightCardTab('fee_slips');
                                }}
                                style={{
                                    padding: '0.65rem 0.85rem',
                                    borderRadius: '10px',
                                    border: activeDailyMode === 'fee_submission' ? 'none' : '1.5px solid rgba(255, 255, 255, 0.35)',
                                    background: activeDailyMode === 'fee_submission' ? '#ffffff' : 'rgba(255, 255, 255, 0.18)',
                                    color: activeDailyMode === 'fee_submission' ? '#4338ca' : '#ffffff',
                                    fontWeight: '800',
                                    fontSize: '0.86rem',
                                    cursor: 'pointer',
                                    boxShadow: activeDailyMode === 'fee_submission' ? '0 4px 14px rgba(0, 0, 0, 0.22)' : 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    transition: 'all 0.18s ease',
                                    backdropFilter: 'blur(4px)'
                                }}
                            >
                                <Wallet size={16} /> Fee Cashier
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setActiveDailyMode('income_expense');
                                    setRightCardTab('finances_breakdown');
                                }}
                                style={{
                                    padding: '0.65rem 0.85rem',
                                    borderRadius: '10px',
                                    border: activeDailyMode === 'income_expense' ? 'none' : '1.5px solid rgba(255, 255, 255, 0.35)',
                                    background: activeDailyMode === 'income_expense' ? '#ffffff' : 'rgba(255, 255, 255, 0.18)',
                                    color: activeDailyMode === 'income_expense' ? '#4338ca' : '#ffffff',
                                    fontWeight: '800',
                                    fontSize: '0.86rem',
                                    cursor: 'pointer',
                                    boxShadow: activeDailyMode === 'income_expense' ? '0 4px 14px rgba(0, 0, 0, 0.22)' : 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    transition: 'all 0.18s ease',
                                    backdropFilter: 'blur(4px)'
                                }}
                            >
                                <TrendingUp size={16} /> Daily Ledger
                            </button>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#e0e7ff', position: 'relative', zIndex: 2 }}>
                            <span style={{ fontWeight: '600' }}>Today's active session</span>
                            <span
                                style={{
                                    fontWeight: '800',
                                    fontSize: '0.8rem',
                                    color: '#ffffff',
                                    background: 'rgba(255,255,255,0.25)',
                                    padding: '3px 10px',
                                    borderRadius: '7px',
                                    border: '1px solid rgba(255,255,255,0.35)',
                                    cursor: 'pointer',
                                    backdropFilter: 'blur(4px)',
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                                }}
                                onClick={handleDownloadDailyReport}
                            >
                                📄 Daily PDF Report
                            </span>
                        </div>
                    </div>
                </div>

                {/* Side-by-Side 2 Cards Studio Layout */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                    gap: '1.25rem',
                    alignItems: 'start'
                }}>
                    {/* LEFT PANEL: Smart Cashier Counter */}
                    <div className="card" style={{
                        background: '#ffffff',
                        borderRadius: '14px',
                        padding: '1.4rem',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 8px -2px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: activeDailyMode === 'fee_submission' ? '#eff6ff' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: activeDailyMode === 'fee_submission' ? '#0078d4' : '#16a34a' }}>
                                    {activeDailyMode === 'fee_submission' ? <Wallet size={18} /> : <TrendingUp size={18} />}
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '900', color: '#0f172a', margin: 0, letterSpacing: '0.04em' }}>
                                        {activeDailyMode === 'fee_submission' ? 'FEE COUNTER' : 'Income & Expense Book'}
                                    </h3>
                                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                        {activeDailyMode === 'fee_submission' ? 'Quick student lookup & instant receipt' : 'Add manual daily income & bills'}
                                    </span>
                                </div>
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
                                    <X size={13} /> Reset
                                </button>
                            )}
                        </div>

                        {activeDailyMode === 'income_expense' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {/* Income Form */}
                                <div style={{ background: '#f0fdf4', padding: '1rem 1.15rem', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: '800', marginBottom: '0.75rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <ArrowUpRight size={16} color="#16a34a" /> Add Payment Received (Income)
                                    </h4>
                                    <div style={{ marginBottom: '0.65rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', marginBottom: '0.25rem', color: '#334155' }}>Income Description</label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. Canteen Rent, Prospectus Sale" 
                                            value={newIncome.name}
                                            onChange={e => setNewIncome({...newIncome, name: e.target.value})}
                                            style={{ width: '100%', padding: '0.5rem 0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div style={{ marginBottom: '0.65rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', marginBottom: '0.25rem', color: '#334155' }}>Amount (Rs)</label>
                                        <input 
                                            type="number" 
                                            placeholder="e.g. 5000" 
                                            value={newIncome.amount}
                                            onChange={e => setNewIncome({...newIncome, amount: e.target.value})}
                                            style={{ width: '100%', padding: '0.5rem 0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div style={{ marginBottom: '0.75rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', marginBottom: '0.25rem', color: '#334155' }}>Remarks (Optional)</label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. Cheque #1234, cash memo..." 
                                            value={newIncome.remarks || ''}
                                            onChange={e => setNewIncome({...newIncome, remarks: e.target.value})}
                                            style={{ width: '100%', padding: '0.5rem 0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => handleAddFinance('one-time', 'incomes', newIncome, setIsSavingIncome, setNewIncome, incomeProofFile, handleRemoveIncomeProof)}
                                        disabled={isSavingIncome || !newIncome.name || !newIncome.amount}
                                        style={{
                                            width: '100%',
                                            padding: '0.6rem 1rem',
                                            borderRadius: '8px',
                                            background: isSavingIncome || !newIncome.name || !newIncome.amount ? '#86efac' : '#16a34a',
                                            border: 'none',
                                            color: '#ffffff',
                                            fontWeight: '700',
                                            fontSize: '0.82rem',
                                            cursor: isSavingIncome || !newIncome.name || !newIncome.amount ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.4rem',
                                            boxShadow: '0 2px 6px rgba(22, 163, 74, 0.2)'
                                        }}
                                    >
                                        {isSavingIncome ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                                        <span>{isSavingIncome ? 'Saving...' : 'Record Income'}</span>
                                    </button>
                                </div>

                                {/* Expense Form */}
                                <div style={{ background: '#fef2f2', padding: '1rem 1.15rem', borderRadius: '12px', border: '1px solid #fecaca' }}>
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: '800', marginBottom: '0.75rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <ArrowDownRight size={16} color="#dc2626" /> Add Daily Expense
                                    </h4>
                                    <div style={{ marginBottom: '0.65rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', marginBottom: '0.25rem', color: '#334155' }}>Expense Title</label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. Electricity Bill, Stationery Purchase" 
                                            value={newExpense.name}
                                            onChange={e => setNewExpense({...newExpense, name: e.target.value})}
                                            style={{ width: '100%', padding: '0.5rem 0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div style={{ marginBottom: '0.65rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', marginBottom: '0.25rem', color: '#334155' }}>Amount (Rs)</label>
                                        <input 
                                            type="number" 
                                            placeholder="e.g. 15000" 
                                            value={newExpense.amount}
                                            onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                                            style={{ width: '100%', padding: '0.5rem 0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div style={{ marginBottom: '0.75rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', marginBottom: '0.25rem', color: '#334155' }}>Remarks (Optional)</label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. Bill #9872, Paid to Vendor..." 
                                            value={newExpense.remarks || ''}
                                            onChange={e => setNewExpense({...newExpense, remarks: e.target.value})}
                                            style={{ width: '100%', padding: '0.5rem 0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', background: '#ffffff', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => handleAddFinance('one-time', 'expenses', newExpense, setIsSavingExpense, setNewExpense, expenseProofFile, handleRemoveExpenseProof)}
                                        disabled={isSavingExpense || !newExpense.name || !newExpense.amount}
                                        style={{
                                            width: '100%',
                                            padding: '0.6rem 1rem',
                                            borderRadius: '8px',
                                            background: isSavingExpense || !newExpense.name || !newExpense.amount ? '#fca5a5' : '#dc2626',
                                            border: 'none',
                                            color: '#ffffff',
                                            fontWeight: '700',
                                            fontSize: '0.82rem',
                                            cursor: isSavingExpense || !newExpense.name || !newExpense.amount ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.4rem',
                                            boxShadow: '0 2px 6px rgba(220, 38, 38, 0.2)'
                                        }}
                                    >
                                        {isSavingExpense ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                                        <span>{isSavingExpense ? 'Saving...' : 'Record Expense'}</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Instant Search Bar */}
                                <div style={{ position: 'relative', width: '100%', marginBottom: '0.75rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '800', color: '#334155', marginBottom: '0.25rem' }}>
                                        🔍 Quick Student Search (Name, Roll No, Father)
                                    </label>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.5rem 0.75rem',
                                        borderRadius: '9px',
                                        background: '#f8fafc',
                                        border: '1.5px solid #cbd5e1',
                                        transition: 'all 0.2s'
                                    }}>
                                        <Search size={15} color="#64748b" />
                                        <input
                                            type="text"
                                            placeholder="Type Name, Roll #, or Father name..."
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
                                                fontSize: '0.84rem',
                                                color: '#0f172a',
                                                fontWeight: '600'
                                            }}
                                        />
                                        {searchQuery && (
                                            <button
                                                type="button"
                                                onClick={() => { setSearchQuery(''); setShowSearchDropdown(false); }}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Autocomplete Dropdown */}
                                    {showSearchDropdown && searchResults.length > 0 && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '105%',
                                            left: 0,
                                            right: 0,
                                            background: '#ffffff',
                                            borderRadius: '10px',
                                            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.18)',
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
                                                        padding: '0.6rem 0.8rem',
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
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                                                        <div style={{
                                                            width: '28px',
                                                            height: '28px',
                                                            borderRadius: '50%',
                                                            background: '#e0f2fe',
                                                            color: '#0369a1',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontWeight: '800',
                                                            fontSize: '0.72rem'
                                                        }}>
                                                            {st.name?.slice(0, 2).toUpperCase() || 'ST'}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.82rem' }}>{st.name}</div>
                                                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                                {st.className} | Roll: {st.rollNo || 'N/A'} • {st.parentDetails?.fatherName || st.fatherName || 'Parent'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span style={{
                                                        fontSize: '0.68rem',
                                                        fontWeight: '800',
                                                        padding: '2px 7px',
                                                        borderRadius: '6px',
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

                                {/* Class & Student Selectors */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.85rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>
                                            Class
                                        </label>
                                        <select
                                            value={selectedClassId}
                                            onChange={(e) => {
                                                setSelectedClassId(e.target.value);
                                                setSelectedStudentId('');
                                                setSelectedStudent(null);
                                                setStudentDropdownSearch('');
                                                setStudentDropdownOpen(false);
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '0.5rem 0.7rem',
                                                borderRadius: '8px',
                                                border: '1px solid #cbd5e1',
                                                outline: 'none',
                                                background: '#ffffff',
                                                fontWeight: '600',
                                                color: '#0f172a',
                                                fontSize: '0.82rem'
                                            }}
                                        >
                                            <option value="">-- Choose Class --</option>
                                            {classes.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div ref={studentDropdownRef} style={{ position: 'relative' }}>
                                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>
                                            Student
                                        </label>
                                        {/* Custom Searchable Student Dropdown */}
                                        <div
                                            style={{
                                                width: '100%',
                                                borderRadius: '8px',
                                                border: studentDropdownOpen ? '1.5px solid #0078d4' : '1px solid #cbd5e1',
                                                background: !selectedClassId ? '#f1f5f9' : '#ffffff',
                                                boxSizing: 'border-box',
                                                boxShadow: studentDropdownOpen ? '0 0 0 2px rgba(0,120,212,0.12)' : 'none',
                                                transition: 'border 0.15s, box-shadow 0.15s',
                                                opacity: !selectedClassId ? 0.65 : 1,
                                                cursor: !selectedClassId ? 'not-allowed' : 'default',
                                            }}
                                        >
                                            {/* Search Input Row */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.42rem 0.7rem' }}>
                                                <Search size={13} color={!selectedClassId ? '#94a3b8' : '#0078d4'} style={{ flexShrink: 0 }} />
                                                <input
                                                    type="text"
                                                    placeholder={
                                                        !selectedClassId
                                                            ? 'Select class first...'
                                                            : loadingClassStudents
                                                            ? 'Loading...'
                                                            : selectedStudent
                                                            ? selectedStudent.name
                                                            : 'Search name, roll no, father...'
                                                    }
                                                    value={studentDropdownSearch}
                                                    disabled={!selectedClassId || loadingClassStudents}
                                                    onChange={(e) => {
                                                        setStudentDropdownSearch(e.target.value);
                                                        setStudentDropdownOpen(true);
                                                    }}
                                                    onFocus={() => { if (selectedClassId && !loadingClassStudents) setStudentDropdownOpen(true); }}
                                                    onBlur={() => { setTimeout(() => setStudentDropdownOpen(false), 180); }}
                                                    style={{
                                                        border: 'none',
                                                        outline: 'none',
                                                        background: 'transparent',
                                                        width: '100%',
                                                        fontSize: '0.82rem',
                                                        fontWeight: '600',
                                                        color: !selectedClassId ? '#94a3b8' : '#0f172a',
                                                        cursor: !selectedClassId ? 'not-allowed' : 'text',
                                                    }}
                                                />
                                                {studentDropdownSearch && (
                                                    <button
                                                        type="button"
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            setStudentDropdownSearch('');
                                                            setSelectedStudentId('');
                                                            setSelectedStudent(null);
                                                            setStudentDropdownOpen(false);
                                                        }}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex', alignItems: 'center' }}
                                                    >
                                                        <X size={13} />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Filtered Dropdown List */}
                                            {studentDropdownOpen && selectedClassId && !loadingClassStudents && (() => {
                                                const q = studentDropdownSearch.trim().toLowerCase();
                                                const filtered = classStudents.filter(s => {
                                                    if (!q) return true;
                                                    const name = (s.name || '').toLowerCase();
                                                    const roll = String(s.rollNo || '').toLowerCase();
                                                    const father = (s.parentDetails?.fatherName || s.fatherName || '').toLowerCase();
                                                    return name.includes(q) || roll.includes(q) || father.includes(q);
                                                });
                                                return (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '100%',
                                                        left: 0,
                                                        right: 0,
                                                        background: '#ffffff',
                                                        border: '1.5px solid #0078d4',
                                                        borderTop: '1px solid #e2e8f0',
                                                        borderRadius: '0 0 10px 10px',
                                                        zIndex: 60,
                                                        maxHeight: '200px',
                                                        overflowY: 'auto',
                                                        boxShadow: '0 8px 20px -4px rgba(0,0,0,0.15)',
                                                    }}>
                                                        {filtered.length === 0 ? (
                                                            <div style={{ padding: '0.65rem 0.8rem', fontSize: '0.78rem', color: '#94a3b8', textAlign: 'center' }}>
                                                                No student found
                                                            </div>
                                                        ) : filtered.map(s => (
                                                            <div
                                                                key={s.id}
                                                                onMouseDown={() => {
                                                                    setSelectedStudentId(s.id);
                                                                    setSelectedStudent(s);
                                                                    setCashierStep(1);
                                                                    setStudentDropdownSearch('');
                                                                    setStudentDropdownOpen(false);
                                                                }}
                                                                style={{
                                                                    padding: '0.5rem 0.8rem',
                                                                    cursor: 'pointer',
                                                                    borderBottom: '1px solid #f1f5f9',
                                                                    background: selectedStudentId === s.id ? '#eff6ff' : 'transparent',
                                                                    transition: 'background 0.1s'
                                                                }}
                                                                onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                                onMouseLeave={e => e.currentTarget.style.background = selectedStudentId === s.id ? '#eff6ff' : 'transparent'}
                                                            >
                                                                <div style={{ fontWeight: '700', fontSize: '0.8rem', color: '#0f172a' }}>{s.name}</div>
                                                                <div style={{ fontSize: '0.69rem', color: '#64748b' }}>
                                                                    Roll: {s.rollNo || 'N/A'} &nbsp;·&nbsp; {s.parentDetails?.fatherName || s.fatherName || 'Parent'} &nbsp;
                                                                    <span style={{ fontWeight: '800', color: s.monthlyFeeStatus === 'paid' ? '#16a34a' : '#b91c1c' }}>
                                                                        {s.monthlyFeeStatus === 'paid' ? '✓ Paid' : '✗ Unpaid'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>

                                {!selectedStudent ? (
                                    /* Empty Cashier State Card */
                                    <div style={{
                                        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                                        border: '1.5px dashed #cbd5e1',
                                        borderRadius: '12px',
                                        padding: '2rem 1.5rem',
                                        textAlign: 'center',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '0.75rem'
                                    }}>
                                        <div style={{
                                            width: '48px',
                                            height: '48px',
                                            borderRadius: '50%',
                                            background: '#e0f2fe',
                                            color: '#0284c7',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <Wallet size={24} />
                                        </div>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#0f172a' }}>
                                                Smart Cashier Ready
                                            </h4>
                                            <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                                                Search student name, roll # or select class above to start fast fee collection with animated POS voucher.
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', fontSize: '0.7rem', color: '#0369a1', fontWeight: '700' }}>
                                            <span style={{ background: '#e0f2fe', padding: '2px 8px', borderRadius: '5px' }}>⚡ Fast Lookup</span>
                                            <span style={{ background: '#dcfce7', padding: '2px 8px', borderRadius: '5px', color: '#15803d' }}>📄 Instant PDF Slip</span>
                                            <span style={{ background: '#fef3c7', padding: '2px 8px', borderRadius: '5px', color: '#b45309' }}>💬 WhatsApp Slip</span>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Stepper Breadcrumbs Bar */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            marginBottom: '0.85rem',
                                            background: '#f8fafc',
                                            padding: '0.4rem 0.65rem',
                                            borderRadius: '10px',
                                            border: '1.5px solid #e2e8f0'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setCashierStep(1)}
                                                    style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        background: cashierStep === 1 ? '#0078d4' : '#e2e8f0',
                                                        color: cashierStep === 1 ? '#ffffff' : '#475569',
                                                        fontWeight: '800',
                                                        fontSize: '0.74rem',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        boxShadow: cashierStep === 1 ? '0 2px 6px rgba(0, 120, 212, 0.3)' : 'none',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <span>1.</span> Student & Parent
                                                </button>
                                                <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: '800' }}>➔</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setCashierStep(2)}
                                                    style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        background: cashierStep === 2 ? '#0078d4' : '#e2e8f0',
                                                        color: cashierStep === 2 ? '#ffffff' : '#475569',
                                                        fontWeight: '800',
                                                        fontSize: '0.74rem',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        boxShadow: cashierStep === 2 ? '0 2px 6px rgba(0, 120, 212, 0.3)' : 'none',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <span>2.</span> Financial POS
                                                </button>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setAudioChimeEnabled(prev => !prev)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', opacity: audioChimeEnabled ? 1 : 0.4 }}
                                                    title={audioChimeEnabled ? "Chime Sound ON" : "Chime Sound OFF"}
                                                >
                                                    {audioChimeEnabled ? '🔔' : '🔕'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* HORIZONTAL SWIPING VIEWPORT (Smooth Animated POS Container) */}
                                        <div style={{ overflow: 'hidden', width: '100%', position: 'relative' }}>
                                            <div style={{
                                                display: 'flex',
                                                width: '200%',
                                                transform: cashierStep === 1 ? 'translateX(0%)' : 'translateX(-50%)',
                                                transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
                                            }}>
                                                {/* ============================================================== */}
                                                {/* SLIDE 1 (STEP 1): STUDENT & PARENT PROFILE CARD / SIBLING DECK */}
                                                {/* ============================================================== */}
                                                <div style={{ width: '50%', paddingRight: '0.4rem', boxSizing: 'border-box' }}>
                                                    {detectedSiblings.length > 1 && siblingPaymentScope === 'family' ? (
                                                        /* MULTI-CHILD 1-BY-1 SIBLING SWIPER DECK */
                                                        <div style={{
                                                            background: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)',
                                                            border: '1.5px solid #7dd3fc',
                                                            borderRadius: '14px',
                                                            padding: '0.9rem',
                                                            marginBottom: '0.75rem',
                                                            boxShadow: '0 4px 14px -2px rgba(2, 132, 199, 0.12)',
                                                            position: 'relative'
                                                        }}>
                                                            {/* Deck Navigation Top Bar */}
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', borderBottom: '1.5px solid #bae6fd', paddingBottom: '0.55rem' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <span style={{ fontSize: '0.78rem', fontWeight: '900', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        👨‍👩‍👧‍👦 Child {activeSiblingIndex + 1} of {detectedSiblings.length}
                                                                    </span>
                                                                    <span style={{ fontSize: '0.65rem', background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                                                        Swipeable Card
                                                                    </span>
                                                                </div>

                                                            </div>

                                                            {/* Quick Sibling Selector Jump Tabs */}
                                                            <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '0.65rem' }}>
                                                                {detectedSiblings.map((sib, sIdx) => {
                                                                    const isCurrentActive = sib.id === (activeChild?.id || selectedStudent?.id);
                                                                    const isIncluded = selectedSiblingIds.includes(sib.id);
                                                                    return (
                                                                        <button
                                                                            key={sib.id}
                                                                            type="button"
                                                                            onClick={() => setActiveSiblingId(sib.id)}
                                                                            style={{
                                                                                padding: '3px 8px',
                                                                                borderRadius: '6px',
                                                                                border: isCurrentActive ? '1.5px solid #0284c7' : isIncluded ? '1px solid #bfdbfe' : '1px dashed #cbd5e1',
                                                                                background: isCurrentActive ? '#0284c7' : isIncluded ? '#eff6ff' : '#f8fafc',
                                                                                color: isCurrentActive ? '#ffffff' : isIncluded ? '#1e40af' : '#64748b',
                                                                                fontSize: '0.69rem',
                                                                                fontWeight: '800',
                                                                                cursor: 'pointer',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px',
                                                                                whiteSpace: 'nowrap',
                                                                                boxShadow: isCurrentActive ? '0 2px 6px rgba(2, 132, 199, 0.25)' : 'none',
                                                                                transition: 'all 0.15s ease'
                                                                            }}
                                                                        >
                                                                            <span>{isIncluded ? '✓' : '✗'}</span>
                                                                            <span>{sIdx + 1}. {sib.name.split(' ')[0]} ({sib.className || 'Class'})</span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>

                                                            {/* Active Child Student Identity Row */}
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem', background: '#ffffff', padding: '0.6rem 0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                                                    <div style={{
                                                                        width: '42px',
                                                                        height: '42px',
                                                                        borderRadius: '10px',
                                                                        background: 'linear-gradient(135deg, #0078d4 0%, #1d4ed8 100%)',
                                                                        color: '#ffffff',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        fontWeight: '800',
                                                                        fontSize: '0.95rem',
                                                                        boxShadow: '0 3px 8px rgba(0, 120, 212, 0.25)'
                                                                    }}>
                                                                        {activeChild?.name?.slice(0, 2).toUpperCase() || 'ST'}
                                                                    </div>
                                                                    <div>
                                                                        <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: '900', color: '#0f172a' }}>
                                                                            {activeChild?.name || selectedStudent.name}
                                                                        </h3>
                                                                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '1px' }}>
                                                                            {activeChild?.className || selectedStudent.className} &bull; Roll #{activeChild?.rollNo || selectedStudent.rollNo || 'N/A'}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Status Badge */}
                                                                {(() => {
                                                                    const monthLabel = MONTH_NAMES[selectedTargetMonthIdx] || 'Month';
                                                                    const shortMonth = monthLabel.slice(0, 3);
                                                                    if (activeChildFeeCalculation?.isFullyPaid) {
                                                                        return (
                                                                            <span style={{ fontSize: '0.72rem', fontWeight: '900', padding: '3px 9px', borderRadius: '6px', background: '#16a34a', color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: '3px', boxShadow: '0 2px 4px rgba(22, 163, 74, 0.3)' }}>
                                                                                <span style={{ fontWeight: '900' }}>✓</span> Paid ({shortMonth})
                                                                            </span>
                                                                        );
                                                                    } else if (activeChildFeeCalculation?.isPartiallyPaid) {
                                                                        return (
                                                                            <span style={{ fontSize: '0.72rem', fontWeight: '900', padding: '3px 9px', borderRadius: '6px', background: '#d97706', color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: '3px', boxShadow: '0 2px 4px rgba(217, 119, 6, 0.3)' }}>
                                                                                <span>⚠️</span> Partial (Pending: Rs {Number(activeChildFeeCalculation.pendingDue || 0).toLocaleString()})
                                                                            </span>
                                                                        );
                                                                    } else {
                                                                        return (
                                                                            <span style={{ fontSize: '0.72rem', fontWeight: '900', padding: '3px 9px', borderRadius: '6px', background: '#dc2626', color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: '3px', boxShadow: '0 2px 4px rgba(220, 38, 38, 0.3)' }}>
                                                                                <span style={{ fontWeight: '900' }}>✗</span> Unpaid ({shortMonth})
                                                                            </span>
                                                                        );
                                                                    }
                                                                })()}
                                                            </div>

                                                            {/* Included / Excluded in Family Bill Toggle Bar */}
                                                            <div style={{
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                marginBottom: '0.65rem',
                                                                background: selectedSiblingIds.includes(activeChild?.id || selectedStudent?.id) ? '#f0fdf4' : '#fff1f2',
                                                                padding: '0.4rem 0.65rem',
                                                                borderRadius: '8px',
                                                                border: selectedSiblingIds.includes(activeChild?.id || selectedStudent?.id) ? '1px solid #bbf7d0' : '1px solid #fecdd3'
                                                            }}>
                                                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: selectedSiblingIds.includes(activeChild?.id || selectedStudent?.id) ? '#166534' : '#9f1239' }}>
                                                                    {selectedSiblingIds.includes(activeChild?.id || selectedStudent?.id) ? '✓ Included in Current Bill' : '✗ Excluded from Current Bill'}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleSiblingSelection(activeChild?.id || selectedStudent?.id)}
                                                                    style={{
                                                                        padding: '2px 8px',
                                                                        borderRadius: '5px',
                                                                        border: selectedSiblingIds.includes(activeChild?.id || selectedStudent?.id) ? '1px solid #86efac' : '1px solid #f87171',
                                                                        background: '#ffffff',
                                                                        color: selectedSiblingIds.includes(activeChild?.id || selectedStudent?.id) ? '#15803d' : '#dc2626',
                                                                        fontSize: '0.68rem',
                                                                        fontWeight: '800',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    {selectedSiblingIds.includes(activeChild?.id || selectedStudent?.id) ? 'Exclude -' : 'Include +'}
                                                                </button>
                                                            </div>

                                                            {/* Categorized Fee Sets for This Child */}
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '0.65rem' }}>
                                                                {/* Set 1: Permanent Monthly Fees */}
                                                                <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0.5rem 0.7rem' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                                                        <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            <span>🎓</span> Permanent Monthly Fees
                                                                        </span>
                                                                        <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#0f172a' }}>
                                                                            Rs {Number(activeChildFeeCalculation?.set1PermanentTotal || 0).toLocaleString()}
                                                                        </span>
                                                                    </div>
                                                                    {(activeChildFeeCalculation?.permanentItems || []).length === 0 ? (
                                                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic', padding: '2px 0' }}>No permanent monthly fees set.</div>
                                                                    ) : (
                                                                        (activeChildFeeCalculation?.permanentItems || []).map((it, iIdx) => (
                                                                            <div key={iIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.73rem', padding: '2px 0', borderBottom: iIdx < (activeChildFeeCalculation.permanentItems.length - 1) ? '1px dashed #f1f5f9' : 'none' }}>
                                                                                <span style={{ color: '#475569', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                    <span>{it.category === 'transport' ? '🚌' : '•'}</span>
                                                                                    <span>{it.name}</span>
                                                                                </span>
                                                                                <span style={{ color: '#334155', fontWeight: '700' }}>
                                                                                    Rs {Number(it.amount || 0).toLocaleString()}
                                                                                </span>
                                                                            </div>
                                                                        ))
                                                                    )}
                                                                </div>

                                                                {/* Set 2: Individual Actions & Fines (One-Off) */}
                                                                <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0.5rem 0.7rem' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                                                        <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#b45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            <span>⚡</span> Individual Actions & Fines
                                                                        </span>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setShowNewActionModal(true)}
                                                                                style={{
                                                                                    padding: '1px 6px',
                                                                                    borderRadius: '4px',
                                                                                    background: '#fef3c7',
                                                                                    border: '1px solid #fde047',
                                                                                    color: '#92400e',
                                                                                    fontSize: '0.65rem',
                                                                                    fontWeight: '800',
                                                                                    cursor: 'pointer',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '2px'
                                                                                }}
                                                                                title="Add Fine, Exam Fee, Uniform, Tour, etc."
                                                                            >
                                                                                + Add Item / Fine
                                                                            </button>
                                                                            <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#b45309' }}>
                                                                                Rs {Number(activeChildFeeCalculation?.set2ActionsTotal || 0).toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    {(activeChildFeeCalculation?.actionItems || []).length === 0 ? (
                                                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic', padding: '2px 0' }}>No actions or fines for this month.</div>
                                                                    ) : (
                                                                        (activeChildFeeCalculation?.actionItems || []).map((it, iIdx) => (
                                                                            <div key={iIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.73rem', padding: '3px 0', borderBottom: iIdx < (activeChildFeeCalculation.actionItems.length - 1) ? '1px dashed #f1f5f9' : 'none' }}>
                                                                                <span style={{ color: '#475569', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                    <span>⚡</span>
                                                                                    <span>{it.name}</span>
                                                                                </span>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                    {it.isPaid ? (
                                                                                        <span style={{ fontSize: '0.62rem', fontWeight: '800', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '1px 5px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                                                            ✓ Paid
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span style={{ fontSize: '0.62rem', fontWeight: '800', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '1px 5px', borderRadius: '4px' }}>
                                                                                            Unpaid
                                                                                        </span>
                                                                                    )}
                                                                                    <span style={{ color: it.isPaid ? '#64748b' : '#334155', fontWeight: '700' }}>
                                                                                        Rs {Number(it.amount || 0).toLocaleString()}
                                                                                    </span>
                                                                                    {!it.isPaid && it.id && (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => handleRemoveCustomAction(it.id)}
                                                                                            title="Remove this charge"
                                                                                            style={{
                                                                                                border: 'none',
                                                                                                background: '#fee2e2',
                                                                                                color: '#ef4444',
                                                                                                borderRadius: '4px',
                                                                                                width: '16px',
                                                                                                height: '16px',
                                                                                                display: 'inline-flex',
                                                                                                alignItems: 'center',
                                                                                                justifyContent: 'center',
                                                                                                cursor: 'pointer',
                                                                                                fontSize: '0.62rem',
                                                                                                padding: 0
                                                                                            }}
                                                                                        >
                                                                                            ✕
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ))
                                                                    )}
                                                                </div>

                                                                {/* Set 3: Store & Inventory Items */}
                                                                <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0.5rem 0.7rem' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                                                        <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#047857', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            <span>🛍️</span> Store & Inventory Items
                                                                        </span>
                                                                        <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#047857' }}>
                                                                            Rs {Number(activeChildFeeCalculation?.set3StoreTotal || 0).toLocaleString()}
                                                                        </span>
                                                                    </div>
                                                                    {(activeChildFeeCalculation?.storeItems || []).length === 0 ? (
                                                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic', padding: '2px 0' }}>No store purchases recorded.</div>
                                                                    ) : (
                                                                        (activeChildFeeCalculation?.storeItems || []).map((it, iIdx) => (
                                                                            <div key={iIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.73rem', padding: '3px 0', borderBottom: iIdx < (activeChildFeeCalculation.storeItems.length - 1) ? '1px dashed #f1f5f9' : 'none' }}>
                                                                                <span style={{ color: '#475569', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                    <span>🛍️</span>
                                                                                    <span>{it.name}</span>
                                                                                </span>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                    {it.isPaid ? (
                                                                                        <span style={{ fontSize: '0.62rem', fontWeight: '800', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '1px 5px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                                                            ✓ Paid
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span style={{ fontSize: '0.62rem', fontWeight: '800', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '1px 5px', borderRadius: '4px' }}>
                                                                                            Unpaid
                                                                                        </span>
                                                                                    )}
                                                                                    <span style={{ color: it.isPaid ? '#64748b' : '#334155', fontWeight: '700' }}>
                                                                                        Rs {Number(it.amount || 0).toLocaleString()}
                                                                                    </span>
                                                                                    {!it.isPaid && it.id && (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => handleRemoveCustomAction(it.id)}
                                                                                            title="Remove this store charge"
                                                                                            style={{
                                                                                                border: 'none',
                                                                                                background: '#fee2e2',
                                                                                                color: '#ef4444',
                                                                                                borderRadius: '4px',
                                                                                                width: '16px',
                                                                                                height: '16px',
                                                                                                display: 'inline-flex',
                                                                                                alignItems: 'center',
                                                                                                justifyContent: 'center',
                                                                                                cursor: 'pointer',
                                                                                                fontSize: '0.62rem',
                                                                                                padding: 0
                                                                                            }}
                                                                                        >
                                                                                            ✕
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ))
                                                                    )}
                                                                </div>

                                                                {/* Set 4: Previous Dues & Arrears (Only if present) */}
                                                                {((activeChildFeeCalculation?.arrearsItems || []).length > 0 || (activeChildFeeCalculation?.set4ArrearsTotal || 0) > 0) && (
                                                                    <div style={{ background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca', padding: '0.5rem 0.7rem' }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                                                            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                <span>⏳</span> Previous Dues / Arrears
                                                                            </span>
                                                                            <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#b91c1c' }}>
                                                                                Rs {Number(activeChildFeeCalculation?.set4ArrearsTotal || 0).toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                        {(activeChildFeeCalculation?.arrearsItems || []).map((it, iIdx) => (
                                                                            <div key={iIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.73rem', padding: '2px 0' }}>
                                                                                <span style={{ color: '#991b1b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                    <span>⏳</span>
                                                                                    <span>{it.name}</span>
                                                                                </span>
                                                                                <span style={{ color: '#b91c1c', fontWeight: '800' }}>
                                                                                    Rs {Number(it.amount || 0).toLocaleString()}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {/* Child Subtotal Line */}
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1.5px solid #cbd5e1' }}>
                                                                    <span style={{ fontSize: '0.78rem', fontWeight: '900', color: '#0f172a' }}>Child Subtotal:</span>
                                                                    <div style={{ textAlign: 'right' }}>
                                                                        <strong style={{ fontSize: '0.96rem', fontWeight: '900', color: activeChildFeeCalculation?.isFullyPaid ? '#15803d' : activeChildFeeCalculation?.isPartiallyPaid ? '#d97706' : '#0284c7' }}>
                                                                            {activeChildFeeCalculation?.isFullyPaid
                                                                                ? '✓ Paid'
                                                                                : activeChildFeeCalculation?.isPartiallyPaid
                                                                                    ? `Rs ${Number(activeChildFeeCalculation?.pendingDue || 0).toLocaleString()} (Remaining)`
                                                                                    : `Rs ${Number(activeChildFeeCalculation?.totalDue || 0).toLocaleString()}`
                                                                            }
                                                                        </strong>
                                                                        {activeChildFeeCalculation?.isPartiallyPaid && (
                                                                            <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '600' }}>
                                                                                Total: Rs {Number(activeChildFeeCalculation?.totalDue || 0).toLocaleString()}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Parent Details & Direct WhatsApp */}
                                                            <div style={{ background: '#ffffff', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '0.65rem' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <div>
                                                                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700' }}>Parent / Guardian:</div>
                                                                        <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            {officialFamilyFatherName}
                                                                            {activeParentAccount && (
                                                                                <span style={{ fontSize: '0.6rem', background: '#e0f2fe', color: '#0369a1', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>
                                                                                    Verified
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {(activeChild?.parentDetails?.fatherPhone || activeChild?.fatherPhone || activeChild?.phone) && (
                                                                            <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '1px', fontWeight: '600' }}>
                                                                                📞 {activeChild?.parentDetails?.fatherPhone || activeChild?.fatherPhone || activeChild?.phone}
                                                                            </div>
                                                                        )}
                                                                        {/* Residential Address */}
                                                                        {(() => {
                                                                            const parentAddr = activeChild?.address || activeChild?.parentDetails?.address || activeChild?.parentAddress || activeChild?.residentialAddress || activeChild?.homeAddress || selectedStudent?.address || selectedStudent?.parentDetails?.address || activeParentAccount?.address;
                                                                            if (parentAddr) {
                                                                                return (
                                                                                    <div style={{ fontSize: '0.71rem', color: '#64748b', marginTop: '2px', fontWeight: '600', display: 'flex', alignItems: 'flex-start', gap: '3px' }}>
                                                                                        <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>📍</span>
                                                                                        <span style={{ wordBreak: 'break-word' }}>{parentAddr}</span>
                                                                                    </div>
                                                                                );
                                                                            }
                                                                            return null;
                                                                        })()}
                                                                    </div>

                                                                    {(activeChild?.parentDetails?.fatherPhone || activeChild?.fatherPhone || activeChild?.phone) && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const phone = activeChild?.parentDetails?.fatherPhone || activeChild?.fatherPhone || activeChild?.phone;
                                                                                const text = `Assalam-o-Alaikum, this is regarding ${activeChild.name}'s fee dues for ${schoolInfo.name || 'School'}. Current payable amount is Rs ${Number(activeChildFeeCalculation?.totalDue || 0).toLocaleString()}.`;
                                                                                let clean = phone.toString().replace(/[^0-9]/g, '');
                                                                                if (clean.startsWith('0092')) clean = clean.slice(2);
                                                                                else if (clean.startsWith('03')) clean = '92' + clean.slice(1);
                                                                                window.open(`https://wa.me/${clean}?text=${encodeURIComponent(text)}`, '_blank');
                                                                            }}
                                                                            style={{
                                                                                padding: '4px 9px',
                                                                                borderRadius: '6px',
                                                                                background: '#f0fdf4',
                                                                                border: '1px solid #86efac',
                                                                                color: '#15803d',
                                                                                fontWeight: '700',
                                                                                fontSize: '0.7rem',
                                                                                cursor: 'pointer',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '3px'
                                                                            }}
                                                                            title="Direct WhatsApp Reminder"
                                                                        >
                                                                            💬 WhatsApp
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Target Month Pill */}
                                                            <div style={{
                                                                background: '#eff6ff',
                                                                border: '1px solid #bfdbfe',
                                                                borderRadius: '8px',
                                                                padding: '0.4rem 0.65rem',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                fontSize: '0.74rem',
                                                                marginBottom: '0.65rem'
                                                            }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#1e3a8a', fontWeight: '700' }}>
                                                                    <CalendarDays size={14} color="#0078d4" />
                                                                    <span>Target Month: <strong style={{ color: '#0078d4' }}>{MONTH_NAMES[selectedTargetMonthIdx]} {new Date().getFullYear()}</strong></span>
                                                                </div>
                                                                <span style={{ fontSize: '0.66rem', color: '#0284c7', background: '#dbeafe', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                                                    Active Matrix Month
                                                                </span>
                                                            </div>

                                                            {/* Dual Mode Switcher: Single vs Full Family */}
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '0.55rem' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSiblingPaymentScope('single')}
                                                                    style={{
                                                                        padding: '0.45rem 0.5rem',
                                                                        borderRadius: '7px',
                                                                        border: siblingPaymentScope === 'single' ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                                                                        background: siblingPaymentScope === 'single' ? '#0284c7' : '#ffffff',
                                                                        color: siblingPaymentScope === 'single' ? '#ffffff' : '#334155',
                                                                        fontSize: '0.72rem',
                                                                        fontWeight: '800',
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        gap: '4px',
                                                                        transition: 'all 0.15s ease'
                                                                    }}
                                                                >
                                                                    <span>Single Student Only</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setSiblingPaymentScope('family');
                                                                        setSelectedSiblingIds(detectedSiblings.map(s => s.id));
                                                                    }}
                                                                    style={{
                                                                        padding: '0.45rem 0.5rem',
                                                                        borderRadius: '7px',
                                                                        border: siblingPaymentScope === 'family' ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                                                                        background: siblingPaymentScope === 'family' ? '#0284c7' : '#ffffff',
                                                                        color: siblingPaymentScope === 'family' ? '#ffffff' : '#334155',
                                                                        fontSize: '0.72rem',
                                                                        fontWeight: '800',
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        gap: '4px',
                                                                        transition: 'all 0.15s ease'
                                                                    }}
                                                                >
                                                                    <span>Complete Family ({detectedSiblings.length})</span>
                                                                </button>
                                                            </div>

                                                            {/* Sibling Selection Chips */}
                                                            <div>
                                                                <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '700', marginBottom: '0.3rem' }}>
                                                                    Click child to include / exclude from this bill:
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                                    {detectedSiblings.map(sib => {
                                                                        const isSelected = selectedSiblingIds.includes(sib.id);
                                                                        return (
                                                                            <span
                                                                                key={sib.id}
                                                                                onClick={() => toggleSiblingSelection(sib.id)}
                                                                                style={{
                                                                                    fontSize: '0.7rem',
                                                                                    padding: '3px 8px',
                                                                                    borderRadius: '6px',
                                                                                    background: isSelected ? '#0369a1' : '#e2e8f0',
                                                                                    color: isSelected ? '#ffffff' : '#475569',
                                                                                    fontWeight: '700',
                                                                                    cursor: 'pointer',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '4px',
                                                                                    border: isSelected ? '1px solid #0284c7' : '1px solid #cbd5e1',
                                                                                    transition: 'all 0.15s ease'
                                                                                }}
                                                                            >
                                                                                <span>{isSelected ? '✓' : '+'}</span>
                                                                                <span>{sib.name} ({sib.className || 'Class'})</span>
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* SINGLE STUDENT PROFILE CARD */
                                                        <div style={{
                                                            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                                                            border: '1.5px solid #cbd5e1',
                                                            borderRadius: '12px',
                                                            padding: '0.9rem',
                                                            marginBottom: '0.75rem',
                                                            boxShadow: '0 2px 8px -2px rgba(0,0,0,0.05)'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.65rem' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                                                    <div style={{
                                                                        width: '44px',
                                                                        height: '44px',
                                                                        borderRadius: '12px',
                                                                        background: 'linear-gradient(135deg, #0078d4 0%, #1d4ed8 100%)',
                                                                        color: '#ffffff',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        fontWeight: '800',
                                                                        fontSize: '1rem',
                                                                        boxShadow: '0 3px 8px rgba(0, 120, 212, 0.25)'
                                                                    }}>
                                                                        {activeChild?.name?.slice(0, 2).toUpperCase() || 'ST'}
                                                                    </div>
                                                                    <div>
                                                                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#0f172a' }}>
                                                                            {activeChild?.name || selectedStudent.name}
                                                                        </h3>
                                                                        <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px' }}>
                                                                            {activeChild?.className || selectedStudent.className} &bull; Roll #{activeChild?.rollNo || selectedStudent.rollNo || 'N/A'}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                {(() => {
                                                                    const mStatus = activeChildFeeCalculation?.monthStatus || (activeChildFeeCalculation?.isPaid ? 'paid' : 'pending');
                                                                    const monthLabel = MONTH_NAMES[selectedTargetMonthIdx] || 'Month';
                                                                    const shortMonth = monthLabel.slice(0, 3);
                                                                    if (mStatus === 'paid') {
                                                                        return (
                                                                            <span style={{
                                                                                fontSize: '0.72rem',
                                                                                fontWeight: '900',
                                                                                padding: '3px 9px',
                                                                                borderRadius: '6px',
                                                                                background: '#16a34a',
                                                                                color: '#ffffff',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '3px',
                                                                                boxShadow: '0 2px 4px rgba(22, 163, 74, 0.3)'
                                                                            }}>
                                                                                <span style={{ fontWeight: '900' }}>✓</span> Paid ({shortMonth})
                                                                            </span>
                                                                        );
                                                                    } else if (mStatus === 'overdue') {
                                                                        return (
                                                                            <span style={{
                                                                                fontSize: '0.72rem',
                                                                                fontWeight: '900',
                                                                                padding: '3px 9px',
                                                                                borderRadius: '6px',
                                                                                background: '#dc2626',
                                                                                color: '#ffffff',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '3px',
                                                                                boxShadow: '0 2px 4px rgba(220, 38, 38, 0.3)'
                                                                            }}>
                                                                                <span style={{ fontWeight: '900' }}>✗</span> Unpaid ({shortMonth})
                                                                            </span>
                                                                        );
                                                                    } else if (mStatus === 'partial') {
                                                                        return (
                                                                            <span style={{
                                                                                fontSize: '0.72rem',
                                                                                fontWeight: '900',
                                                                                padding: '3px 9px',
                                                                                borderRadius: '6px',
                                                                                background: '#d97706',
                                                                                color: '#ffffff',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '3px',
                                                                                boxShadow: '0 2px 4px rgba(217, 119, 6, 0.3)'
                                                                            }}>
                                                                                <span>⚠️</span> Partial ({shortMonth})
                                                                            </span>
                                                                        );
                                                                    } else {
                                                                        return (
                                                                            <span style={{
                                                                                fontSize: '0.72rem',
                                                                                fontWeight: '900',
                                                                                padding: '3px 9px',
                                                                                borderRadius: '6px',
                                                                                background: '#dc2626',
                                                                                color: '#ffffff',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '3px',
                                                                                boxShadow: '0 2px 4px rgba(220, 38, 38, 0.3)'
                                                                            }}>
                                                                                <span style={{ fontWeight: '900' }}>✗</span> Unpaid ({shortMonth})
                                                                            </span>
                                                                        );
                                                                    }
                                                                })()}
                                                            </div>

                                                            {/* Parent Contact Details */}
                                                            <div style={{ background: '#f8fafc', padding: '0.65rem 0.75rem', borderRadius: '9px', border: '1px solid #e2e8f0', marginBottom: '0.65rem' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <div>
                                                                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700' }}>Parent / Guardian:</div>
                                                                        <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            {officialFamilyFatherName}
                                                                            {activeParentAccount && (
                                                                                <span style={{ fontSize: '0.62rem', background: '#e0f2fe', color: '#0369a1', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>
                                                                                    Verified
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {(activeChild?.parentDetails?.fatherPhone || activeChild?.fatherPhone || activeChild?.phone) && (
                                                                            <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '2px', fontWeight: '600' }}>
                                                                                📞 {activeChild?.parentDetails?.fatherPhone || activeChild?.fatherPhone || activeChild?.phone}
                                                                            </div>
                                                                        )}
                                                                        {/* Residential Address */}
                                                                        {(() => {
                                                                            const parentAddr = activeChild?.address || activeChild?.parentDetails?.address || activeChild?.parentAddress || activeChild?.residentialAddress || activeChild?.homeAddress || selectedStudent?.address || selectedStudent?.parentDetails?.address || activeParentAccount?.address;
                                                                            if (parentAddr) {
                                                                                return (
                                                                                    <div style={{ fontSize: '0.71rem', color: '#64748b', marginTop: '2px', fontWeight: '600', display: 'flex', alignItems: 'flex-start', gap: '3px' }}>
                                                                                        <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>📍</span>
                                                                                        <span style={{ wordBreak: 'break-word' }}>{parentAddr}</span>
                                                                                    </div>
                                                                                );
                                                                            }
                                                                            return null;
                                                                        })()}
                                                                    </div>

                                                                    {(activeChild?.parentDetails?.fatherPhone || activeChild?.fatherPhone || activeChild?.phone) && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const phone = activeChild?.parentDetails?.fatherPhone || activeChild?.fatherPhone || activeChild?.phone;
                                                                                const text = `Assalam-o-Alaikum, this is regarding ${activeChild.name}'s fee dues for ${schoolInfo.name || 'School'}. Current payable amount is Rs ${Number(activeChildFeeCalculation?.totalDue || 0).toLocaleString()}.`;
                                                                                let clean = phone.toString().replace(/[^0-9]/g, '');
                                                                                if (clean.startsWith('0092')) clean = clean.slice(2);
                                                                                else if (clean.startsWith('03')) clean = '92' + clean.slice(1);
                                                                                window.open(`https://wa.me/${clean}?text=${encodeURIComponent(text)}`, '_blank');
                                                                            }}
                                                                            style={{
                                                                                padding: '5px 10px',
                                                                                borderRadius: '7px',
                                                                                background: '#f0fdf4',
                                                                                border: '1px solid #86efac',
                                                                                color: '#15803d',
                                                                                fontWeight: '700',
                                                                                fontSize: '0.72rem',
                                                                                cursor: 'pointer',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px'
                                                                            }}
                                                                            title="Direct WhatsApp Reminder"
                                                                        >
                                                                            💬 WhatsApp
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Categorized Fee Sets for Single Student */}
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '0.65rem' }}>
                                                                {/* Set 1: Permanent Monthly Fees */}
                                                                <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0.5rem 0.7rem' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                                                        <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            <span>🎓</span> Permanent Monthly Fees
                                                                        </span>
                                                                        <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#0f172a' }}>
                                                                            Rs {Number(activeChildFeeCalculation?.set1PermanentTotal || 0).toLocaleString()}
                                                                        </span>
                                                                    </div>
                                                                    {(activeChildFeeCalculation?.permanentItems || []).length === 0 ? (
                                                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic', padding: '2px 0' }}>No permanent monthly fees set.</div>
                                                                    ) : (
                                                                        (activeChildFeeCalculation?.permanentItems || []).map((it, iIdx) => (
                                                                            <div key={iIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.73rem', padding: '2px 0', borderBottom: iIdx < (activeChildFeeCalculation.permanentItems.length - 1) ? '1px dashed #f1f5f9' : 'none' }}>
                                                                                <span style={{ color: '#475569', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                    <span>{it.category === 'transport' ? '🚌' : '•'}</span>
                                                                                    <span>{it.name}</span>
                                                                                </span>
                                                                                <span style={{ color: '#334155', fontWeight: '700' }}>
                                                                                    Rs {Number(it.amount || 0).toLocaleString()}
                                                                                </span>
                                                                            </div>
                                                                        ))
                                                                    )}
                                                                </div>

                                                                {/* Set 2: Individual Actions & Fines (One-Off) */}
                                                                <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0.5rem 0.7rem' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                                                        <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#b45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            <span>⚡</span> Individual Actions & Fines
                                                                        </span>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setShowNewActionModal(true)}
                                                                                style={{
                                                                                    padding: '1px 6px',
                                                                                    borderRadius: '4px',
                                                                                    background: '#fef3c7',
                                                                                    border: '1px solid #fde047',
                                                                                    color: '#92400e',
                                                                                    fontSize: '0.65rem',
                                                                                    fontWeight: '800',
                                                                                    cursor: 'pointer',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '2px'
                                                                                }}
                                                                                title="Add Fine, Exam Fee, Uniform, Tour, etc."
                                                                            >
                                                                                + Add Item / Fine
                                                                            </button>
                                                                            <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#b45309' }}>
                                                                                Rs {Number(activeChildFeeCalculation?.set2ActionsTotal || 0).toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    {(activeChildFeeCalculation?.actionItems || []).length === 0 ? (
                                                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic', padding: '2px 0' }}>No actions or fines for this month.</div>
                                                                    ) : (
                                                                        (activeChildFeeCalculation?.actionItems || []).map((it, iIdx) => (
                                                                            <div key={iIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.73rem', padding: '3px 0', borderBottom: iIdx < (activeChildFeeCalculation.actionItems.length - 1) ? '1px dashed #f1f5f9' : 'none' }}>
                                                                                <span style={{ color: '#475569', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                    <span>⚡</span>
                                                                                    <span>{it.name}</span>
                                                                                </span>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                    {it.isPaid ? (
                                                                                        <span style={{ fontSize: '0.62rem', fontWeight: '800', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '1px 5px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                                                            ✓ Paid
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span style={{ fontSize: '0.62rem', fontWeight: '800', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '1px 5px', borderRadius: '4px' }}>
                                                                                            Unpaid
                                                                                        </span>
                                                                                    )}
                                                                                    <span style={{ color: it.isPaid ? '#64748b' : '#334155', fontWeight: '700' }}>
                                                                                        Rs {Number(it.amount || 0).toLocaleString()}
                                                                                    </span>
                                                                                    {!it.isPaid && it.id && (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => handleRemoveCustomAction(it.id)}
                                                                                            title="Remove this charge"
                                                                                            style={{
                                                                                                border: 'none',
                                                                                                background: '#fee2e2',
                                                                                                color: '#ef4444',
                                                                                                borderRadius: '4px',
                                                                                                width: '16px',
                                                                                                height: '16px',
                                                                                                display: 'inline-flex',
                                                                                                alignItems: 'center',
                                                                                                justifyContent: 'center',
                                                                                                cursor: 'pointer',
                                                                                                fontSize: '0.62rem',
                                                                                                padding: 0
                                                                                            }}
                                                                                        >
                                                                                            ✕
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ))
                                                                    )}
                                                                </div>

                                                                {/* Set 3: Store & Inventory Items */}
                                                                <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0.5rem 0.7rem' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                                                        <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#047857', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            <span>🛍️</span> Store & Inventory Items
                                                                        </span>
                                                                        <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#047857' }}>
                                                                            Rs {Number(activeChildFeeCalculation?.set3StoreTotal || 0).toLocaleString()}
                                                                        </span>
                                                                    </div>
                                                                    {(activeChildFeeCalculation?.storeItems || []).length === 0 ? (
                                                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic', padding: '2px 0' }}>No store purchases recorded.</div>
                                                                    ) : (
                                                                        (activeChildFeeCalculation?.storeItems || []).map((it, iIdx) => (
                                                                            <div key={iIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.73rem', padding: '3px 0', borderBottom: iIdx < (activeChildFeeCalculation.storeItems.length - 1) ? '1px dashed #f1f5f9' : 'none' }}>
                                                                                <span style={{ color: '#475569', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                    <span>🛍️</span>
                                                                                    <span>{it.name}</span>
                                                                                </span>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                    {it.isPaid ? (
                                                                                        <span style={{ fontSize: '0.62rem', fontWeight: '800', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '1px 5px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                                                            ✓ Paid
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span style={{ fontSize: '0.62rem', fontWeight: '800', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '1px 5px', borderRadius: '4px' }}>
                                                                                            Unpaid
                                                                                        </span>
                                                                                    )}
                                                                                    <span style={{ color: it.isPaid ? '#64748b' : '#334155', fontWeight: '700' }}>
                                                                                        Rs {Number(it.amount || 0).toLocaleString()}
                                                                                    </span>
                                                                                    {!it.isPaid && it.id && (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => handleRemoveCustomAction(it.id)}
                                                                                            title="Remove this store charge"
                                                                                            style={{
                                                                                                border: 'none',
                                                                                                background: '#fee2e2',
                                                                                                color: '#ef4444',
                                                                                                borderRadius: '4px',
                                                                                                width: '16px',
                                                                                                height: '16px',
                                                                                                display: 'inline-flex',
                                                                                                alignItems: 'center',
                                                                                                justifyContent: 'center',
                                                                                                cursor: 'pointer',
                                                                                                fontSize: '0.62rem',
                                                                                                padding: 0
                                                                                            }}
                                                                                        >
                                                                                            ✕
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ))
                                                                    )}
                                                                </div>

                                                                {/* Set 4: Previous Dues & Arrears (Only if present) */}
                                                                {((activeChildFeeCalculation?.arrearsItems || []).length > 0 || (activeChildFeeCalculation?.set4ArrearsTotal || 0) > 0) && (
                                                                    <div style={{ background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca', padding: '0.5rem 0.7rem' }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                                                            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                <span>⏳</span> Previous Dues / Arrears
                                                                            </span>
                                                                            <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#b91c1c' }}>
                                                                                Rs {Number(activeChildFeeCalculation?.set4ArrearsTotal || 0).toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                        {(activeChildFeeCalculation?.arrearsItems || []).map((it, iIdx) => (
                                                                            <div key={iIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.73rem', padding: '2px 0' }}>
                                                                                <span style={{ color: '#991b1b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                    <span>⏳</span>
                                                                                    <span>{it.name}</span>
                                                                                </span>
                                                                                <span style={{ color: '#b91c1c', fontWeight: '800' }}>
                                                                                    Rs {Number(it.amount || 0).toLocaleString()}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {/* Subtotal Line */}
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1.5px solid #cbd5e1' }}>
                                                                    <span style={{ fontSize: '0.78rem', fontWeight: '900', color: '#0f172a' }}>Total Due:</span>
                                                                    <div style={{ textAlign: 'right' }}>
                                                                        <strong style={{ fontSize: '0.96rem', fontWeight: '900', color: activeChildFeeCalculation?.isFullyPaid ? '#15803d' : activeChildFeeCalculation?.isPartiallyPaid ? '#d97706' : '#0284c7' }}>
                                                                            {activeChildFeeCalculation?.isFullyPaid
                                                                                ? '✓ Paid'
                                                                                : activeChildFeeCalculation?.isPartiallyPaid
                                                                                    ? `Rs ${Number(activeChildFeeCalculation?.pendingDue || 0).toLocaleString()} (Remaining)`
                                                                                    : `Rs ${Number(activeChildFeeCalculation?.totalDue || 0).toLocaleString()}`
                                                                            }
                                                                        </strong>
                                                                        {activeChildFeeCalculation?.isPartiallyPaid && (
                                                                            <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '600' }}>
                                                                                Total: Rs {Number(activeChildFeeCalculation?.totalDue || 0).toLocaleString()}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Target Month Pill */}
                                                            <div style={{
                                                                background: '#eff6ff',
                                                                border: '1px solid #bfdbfe',
                                                                borderRadius: '8px',
                                                                padding: '0.45rem 0.75rem',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                fontSize: '0.75rem',
                                                                marginBottom: detectedSiblings.length > 1 ? '0.75rem' : '0'
                                                            }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#1e3a8a', fontWeight: '700' }}>
                                                                    <CalendarDays size={14} color="#0078d4" />
                                                                    <span>Target Month: <strong style={{ color: '#0078d4' }}>{MONTH_NAMES[selectedTargetMonthIdx]} {new Date().getFullYear()}</strong></span>
                                                                </div>
                                                                <span style={{ fontSize: '0.68rem', color: '#0284c7', background: '#dbeafe', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                                                    Active Matrix Month
                                                                </span>
                                                            </div>

                                                            {/* Dual Mode Switcher if siblings exist */}
                                                            {detectedSiblings.length > 1 && (
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginTop: '0.65rem' }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setSiblingPaymentScope('single')}
                                                                        style={{
                                                                            padding: '0.45rem 0.5rem',
                                                                            borderRadius: '7px',
                                                                            border: siblingPaymentScope === 'single' ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                                                                            background: siblingPaymentScope === 'single' ? '#0284c7' : '#ffffff',
                                                                            color: siblingPaymentScope === 'single' ? '#ffffff' : '#334155',
                                                                            fontSize: '0.72rem',
                                                                            fontWeight: '800',
                                                                            cursor: 'pointer',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            gap: '4px',
                                                                            transition: 'all 0.15s ease'
                                                                        }}
                                                                    >
                                                                        <span>Single Student Only</span>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setSiblingPaymentScope('family');
                                                                            setSelectedSiblingIds(detectedSiblings.map(s => s.id));
                                                                        }}
                                                                        style={{
                                                                            padding: '0.45rem 0.5rem',
                                                                            borderRadius: '7px',
                                                                            border: siblingPaymentScope === 'family' ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                                                                            background: siblingPaymentScope === 'family' ? '#0284c7' : '#ffffff',
                                                                            color: siblingPaymentScope === 'family' ? '#ffffff' : '#334155',
                                                                            fontSize: '0.72rem',
                                                                            fontWeight: '800',
                                                                            cursor: 'pointer',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            gap: '4px',
                                                                            transition: 'all 0.15s ease'
                                                                        }}
                                                                    >
                                                                        <span>Complete Family ({detectedSiblings.length})</span>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* BIG STEP 1 CTA BUTTON TO SWIPE TO STEP 2 */}
                                                    {(() => {
                                                        const isLocked = feeCalculation?.isFullyPaid || (feeCalculation?.pendingDue <= 0 && feeCalculation?.isPaid);
                                                        const isPartial = feeCalculation?.isPartiallyPaid && (feeCalculation?.pendingDue > 0);
                                                        const pendingAmount = Number(feeCalculation?.pendingDue || 0);

                                                        return (
                                                            <button
                                                                type="button"
                                                                disabled={isLocked}
                                                                onClick={() => {
                                                                    if (!isLocked) setCashierStep(2);
                                                                }}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '0.85rem',
                                                                    borderRadius: '12px',
                                                                    background: isLocked
                                                                        ? 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)'
                                                                        : isPartial
                                                                            ? 'linear-gradient(135deg, #d97706 0%, #b45309 100%)'
                                                                            : 'linear-gradient(135deg, #0078d4 0%, #1d4ed8 100%)',
                                                                    border: 'none',
                                                                    color: '#ffffff',
                                                                    fontWeight: '900',
                                                                    fontSize: '0.92rem',
                                                                    cursor: isLocked ? 'not-allowed' : 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '0.5rem',
                                                                    boxShadow: isLocked ? 'none' : isPartial ? '0 4px 14px rgba(217, 119, 6, 0.4)' : '0 4px 14px rgba(0, 120, 212, 0.4)',
                                                                    opacity: isLocked ? 0.8 : 1,
                                                                    transition: 'all 0.18s ease'
                                                                }}
                                                            >
                                                                {isLocked ? (
                                                                    <>
                                                                        <CheckCircle2 size={18} />
                                                                        <span>✓ Fee Already Paid ({MONTH_NAMES[selectedTargetMonthIdx] || 'Month'})</span>
                                                                    </>
                                                                ) : isPartial ? (
                                                                    <>
                                                                        <Wallet size={18} />
                                                                        <span>Collect Remaining Balance (Rs {pendingAmount.toLocaleString()})</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Wallet size={18} />
                                                                        <span>
                                                                            {feeCalculation?.isMultiFamily
                                                                                ? `Record Fee for Family (${feeCalculation.activeSiblingsCount})`
                                                                                : `Record Fee / Collect Payment`
                                                                            }
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        );
                                                    })()}

                                                    {/* Download Pre-payment Challan PDF */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDownloadChallanForMonth(null)}
                                                        style={{
                                                            width: '100%',
                                                            marginTop: '0.5rem',
                                                            padding: '0.55rem',
                                                            borderRadius: '8px',
                                                            background: '#ffffff',
                                                            border: '1.5px solid #0f172a',
                                                            color: '#0f172a',
                                                            fontWeight: '800',
                                                            fontSize: '0.78rem',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '0.4rem',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                        title="Download fee voucher / challan for parents before payment"
                                                    >
                                                        <FileText size={14} /> Download Fee Challan / Bill ({MONTH_NAMES[selectedTargetMonthIdx]})
                                                    </button>
                                                </div>

                                                {/* ============================================================== */}
                                                {/* SLIDE 2 (STEP 2): FINANCIAL BILLING POS & SETTLEMENT          */}
                                                {/* ============================================================== */}
                                                <div style={{ width: '50%', paddingLeft: '0.4rem', boxSizing: 'border-box' }}>
                                                    {/* Clean Active Billing Month Header Banner */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                                Active Billing Month:
                                                            </span>
                                                            <span style={{ fontSize: '0.78rem', fontWeight: '900', color: '#0078d4', background: '#eff6ff', padding: '3px 10px', borderRadius: '6px', border: '1.5px solid #bfdbfe' }}>
                                                                {MONTH_NAMES[selectedTargetMonthIdx]} {new Date().getFullYear()}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {(() => {
                                                        const currentStudentToAssess = activeChild || selectedStudent;
                                                        const currentYear = new Date().getFullYear();
                                                        const targetYear = selectedDetailMonthData?.targetYear || currentYear;
                                                        const targetMonthKey = `${targetYear}-${String(selectedTargetMonthIdx + 1).padStart(2, '0')}`;
                                                        const targetMonthHist = studentReliabilityData?.monthlyHistory?.[selectedTargetMonthIdx] || null;
                                                        const isMonthInPaidMonths = Array.isArray(currentStudentToAssess?.paidMonths) && currentStudentToAssess.paidMonths.includes(targetMonthKey);
                                                        const isTargetMonthFullyPaid = Boolean(
                                                            selectedDetailMonthData?.isPaid || 
                                                            targetMonthHist?.status === 'paid' || 
                                                            isMonthInPaidMonths ||
                                                            (currentStudentToAssess?.monthlyFeeHistory?.[targetMonthKey]?.status === 'paid')
                                                        );

                                                        // Dynamic check: Check if there is any pending balance in active calculation (due to newly added permanent feeStructure items, individual actions, or arrears)
                                                        const pendingBalanceToClear = Number(activeChildFeeCalculation?.pendingDue ?? feeCalculation?.pendingDue ?? 0);
                                                        const hasUnsettledBalance = pendingBalanceToClear > 0;

                                                        const unpaidCustomActionsList = (activePayableItems || []).filter(it => it.isCustomAction);
                                                        const hasUnpaidCustomActions = unpaidCustomActionsList.length > 0;
                                                        const isFullyClearedAndLocked = isTargetMonthFullyPaid && !hasUnpaidCustomActions && !hasUnsettledBalance;
                                                        const selectedMonthPaidRecord = getSelectedMonthPaidTxRecord();
                                                        const hasProof = Boolean(selectedMonthPaidRecord?.proofUrl);

                                                        if (isFullyClearedAndLocked) {
                                                            const clearedGrandTotal = Number(selectedMonthPaidRecord?.totalPaid || selectedDetailMonthData?.paidAmount || currentStudentToAssess?.tuitionFee || 0);
                                                            const settledItemsList = Array.isArray(selectedMonthPaidRecord?.items) && selectedMonthPaidRecord.items.length > 0 
                                                                ? selectedMonthPaidRecord.items 
                                                                : [{ name: `Monthly Tuition Fee (${MONTH_NAMES[selectedTargetMonthIdx]})`, amount: clearedGrandTotal, category: 'tuition' }];

                                                            return (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                                                    {/* 1. Large Executive Emerald Audit Certificate Shield Banner */}
                                                                    <div style={{
                                                                        background: 'linear-gradient(135deg, #065f46 0%, #047857 50%, #059669 100%)',
                                                                        borderRadius: '14px',
                                                                        padding: '1.1rem 1.25rem',
                                                                        color: '#ffffff',
                                                                        boxShadow: '0 8px 24px rgba(4, 120, 87, 0.28), 0 2px 6px rgba(0, 0, 0, 0.1)',
                                                                        border: '2px solid #34d399'
                                                                    }}>
                                                                        {/* Banner Header */}
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                <ShieldCheck size={22} color="#6ee7b7" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }} />
                                                                                <span style={{ fontSize: '0.94rem', fontWeight: '900', letterSpacing: '0.04em', color: '#ffffff', textTransform: 'uppercase' }}>
                                                                                    100% Cleared & Audit Locked
                                                                                </span>
                                                                            </div>
                                                                            <span style={{ 
                                                                                fontSize: '0.78rem', 
                                                                                fontWeight: '900', 
                                                                                background: 'rgba(255,255,255,0.22)', 
                                                                                padding: '4px 10px', 
                                                                                borderRadius: '9px', 
                                                                                border: '1.5px solid rgba(255,255,255,0.45)',
                                                                                letterSpacing: '0.02em',
                                                                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                                                            }}>
                                                                                ✓ Rs 0 Pending
                                                                            </span>
                                                                        </div>

                                                                        {/* Hero Cleared Grand Total */}
                                                                        <div style={{
                                                                            background: 'rgba(0, 0, 0, 0.25)',
                                                                            borderRadius: '10px',
                                                                            padding: '0.75rem 1rem',
                                                                            margin: '0.5rem 0 0.75rem 0',
                                                                            border: '1px solid rgba(255, 255, 255, 0.15)',
                                                                            display: 'flex',
                                                                            justifyContent: 'space-between',
                                                                            alignItems: 'center'
                                                                        }}>
                                                                            <div>
                                                                                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#a7f3d0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                                                    Total Settled & Reconciled
                                                                                </div>
                                                                                <div style={{ fontSize: '1.85rem', fontWeight: '900', color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.1, marginTop: '2px', textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                                                                                    Rs {clearedGrandTotal.toLocaleString()}
                                                                                </div>
                                                                            </div>
                                                                            <div style={{ textAlign: 'right' }}>
                                                                                <span style={{
                                                                                    fontSize: '0.72rem',
                                                                                    fontWeight: '900',
                                                                                    background: '#10b981',
                                                                                    color: '#ffffff',
                                                                                    padding: '4px 9px',
                                                                                    borderRadius: '6px',
                                                                                    textTransform: 'uppercase',
                                                                                    letterSpacing: '0.04em',
                                                                                    boxShadow: '0 2px 5px rgba(0,0,0,0.15)'
                                                                                }}>
                                                                                    Fully Paid
                                                                                </span>
                                                                            </div>
                                                                        </div>

                                                                        {/* Audit Meta Grid */}
                                                                        <div style={{ 
                                                                            display: 'grid', 
                                                                            gridTemplateColumns: '1fr 1fr', 
                                                                            gap: '0.5rem', 
                                                                            fontSize: '0.78rem', 
                                                                            color: '#ecfdf5', 
                                                                            background: 'rgba(0,0,0,0.18)', 
                                                                            padding: '8px 12px', 
                                                                            borderRadius: '9px',
                                                                            border: '1px solid rgba(255,255,255,0.1)'
                                                                        }}>
                                                                            <div>
                                                                                <span style={{ opacity: 0.85, fontWeight: '600' }}>Receipt #: </span>
                                                                                <strong style={{ color: '#ffffff', fontWeight: '900', letterSpacing: '0.02em' }}>
                                                                                    {selectedMonthPaidRecord?.receiptNo || 'REC-CLEARED'}
                                                                                </strong>
                                                                            </div>
                                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                                                                <div>
                                                                                    <span style={{ opacity: 0.85, fontWeight: '600' }}>Channel: </span>
                                                                                    <strong style={{ color: '#ffffff', fontWeight: '900' }}>
                                                                                        {selectedMonthPaidRecord?.paymentMode || 'Cash'}
                                                                                    </strong>
                                                                                    {selectedMonthPaidRecord?.transactionId && (
                                                                                        <div style={{ fontSize: '0.66rem', color: '#93c5fd', fontWeight: '700', marginTop: '1px' }}>
                                                                                            TRX: {selectedMonthPaidRecord.transactionId}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                {hasProof ? (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setProofModal({
                                                                                            isOpen: true,
                                                                                            url: selectedMonthPaidRecord.proofUrl,
                                                                                            title: `Payment Proof - ${selectedMonthPaidRecord.studentName} (${selectedMonthPaidRecord.targetMonthName})`
                                                                                        })}
                                                                                        style={{
                                                                                            padding: '3px 7px',
                                                                                            borderRadius: '5px',
                                                                                            background: '#38bdf8',
                                                                                            color: '#082f49',
                                                                                            border: 'none',
                                                                                            fontSize: '0.68rem',
                                                                                            fontWeight: '900',
                                                                                            cursor: 'pointer',
                                                                                            display: 'inline-flex',
                                                                                            alignItems: 'center',
                                                                                            gap: '3px',
                                                                                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                                                                            flexShrink: 0
                                                                                        }}
                                                                                        title="View Attached Slip / Proof"
                                                                                    >
                                                                                        <Eye size={11} /> View Proof
                                                                                    </button>
                                                                                ) : (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={handleTriggerAttachProof}
                                                                                        disabled={attachingProof}
                                                                                        style={{
                                                                                            padding: '3px 7px',
                                                                                            borderRadius: '5px',
                                                                                            background: 'rgba(255,255,255,0.15)',
                                                                                            color: '#ffffff',
                                                                                            border: '1px dashed rgba(255,255,255,0.4)',
                                                                                            fontSize: '0.66rem',
                                                                                            fontWeight: '800',
                                                                                            cursor: 'pointer',
                                                                                            display: 'inline-flex',
                                                                                            alignItems: 'center',
                                                                                            gap: '3px',
                                                                                            flexShrink: 0
                                                                                        }}
                                                                                        title="Attach Bank / JazzCash / Online Slip Image"
                                                                                    >
                                                                                        {attachingProof ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
                                                                                        <span>Attach Slip</span>
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                            <div>
                                                                                <span style={{ opacity: 0.85, fontWeight: '600' }}>Paid Date: </span>
                                                                                <strong style={{ color: '#ffffff', fontWeight: '800' }}>
                                                                                    {selectedMonthPaidRecord?.dateString || 'Cleared'}
                                                                                </strong>
                                                                            </div>
                                                                            <div>
                                                                                <span style={{ opacity: 0.85, fontWeight: '600' }}>Audited By: </span>
                                                                                <strong style={{ color: '#ffffff', fontWeight: '800' }}>
                                                                                    {selectedMonthPaidRecord?.collectedBy || 'Principal Office'}
                                                                                </strong>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Hidden file input for attaching proof directly to paid month */}
                                                                    <input
                                                                        type="file"
                                                                        ref={fileInputProofRef}
                                                                        onChange={handleFileChangeAttachProof}
                                                                        accept="image/*"
                                                                        style={{ display: 'none' }}
                                                                    />

                                                                    {/* 2. All-Inclusive Settled Particulars Breakdown & Active ➕ New Action Trigger */}
                                                                    <div style={{
                                                                        background: '#f8fafc',
                                                                        borderRadius: '13px',
                                                                        border: '1.5px solid #cbd5e1',
                                                                        padding: '0.85rem 1rem',
                                                                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                                                                    }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                <span style={{ fontSize: '0.78rem', fontWeight: '900', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                                                    🔒 Settled Particulars ({settledItemsList.length} Items)
                                                                                </span>
                                                                            </div>

                                                                            {/* ➕ New Action / Custom Fee Trigger (Active in Paid Month!) */}
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setShowNewActionModal(true)}
                                                                                style={{
                                                                                    padding: '4px 11px',
                                                                                    borderRadius: '7px',
                                                                                    border: '1.5px dashed #0284c7',
                                                                                    background: '#eff6ff',
                                                                                    color: '#0284c7',
                                                                                    fontSize: '0.76rem',
                                                                                    fontWeight: '900',
                                                                                    cursor: 'pointer',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '4px',
                                                                                    boxShadow: '0 2px 4px rgba(2, 132, 199, 0.12)',
                                                                                    transition: 'all 0.15s ease'
                                                                                }}
                                                                                title="Add supplementary fee to this month (Exam Fee, Fine, ID Card, etc.)"
                                                                            >
                                                                                <Plus size={14} /> New Action
                                                                            </button>
                                                                        </div>

                                                                        {/* Itemized Breakdown List */}
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto', paddingRight: '2px' }}>
                                                                            {settledItemsList.map((item, idx) => {
                                                                                const isCustom = item.category === 'custom_action' || item.isCustomAction;
                                                                                const isTransport = item.category === 'transport' || item.name?.toLowerCase().includes('transport') || item.name?.toLowerCase().includes('van');
                                                                                const isStore = item.category === 'store' || item.name?.toLowerCase().includes('uniform') || item.name?.toLowerCase().includes('book') || item.name?.toLowerCase().includes('store');
                                                                                const isFine = item.category === 'fine' || item.name?.toLowerCase().includes('fine') || item.name?.toLowerCase().includes('penalty');
                                                                                
                                                                                const itemIcon = isCustom ? '⚡' : isTransport ? '🚌' : isStore ? '🛍️' : isFine ? '⏳' : '🎓';
                                                                                const bgStyle = isCustom ? '#f0fdf4' : '#ffffff';
                                                                                const borderStyle = isCustom ? '1px solid #bbf7d0' : '1px solid #e2e8f0';

                                                                                return (
                                                                                    <div 
                                                                                        key={idx} 
                                                                                        style={{ 
                                                                                            display: 'flex', 
                                                                                            justifyContent: 'space-between', 
                                                                                            alignItems: 'center', 
                                                                                            background: bgStyle, 
                                                                                            padding: '7px 10px', 
                                                                                            borderRadius: '8px', 
                                                                                            border: borderStyle, 
                                                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                                                                        }}
                                                                                    >
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                                                                            <span style={{ fontSize: '0.82rem' }}>{itemIcon}</span>
                                                                                            <div>
                                                                                                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: isCustom ? '#15803d' : '#0f172a' }}>
                                                                                                    {item.name}
                                                                                                </span>
                                                                                                {isCustom && item.date && (
                                                                                                    <span style={{ fontSize: '0.68rem', color: '#64748b', marginLeft: '6px' }}>
                                                                                                        ({new Date(item.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })})
                                                                                                    </span>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                            <span style={{ fontSize: '0.78rem', fontWeight: '900', color: isCustom ? '#15803d' : '#0f172a' }}>
                                                                                                Rs {Number(item.amount || 0).toLocaleString()}
                                                                                            </span>
                                                                                            <span style={{ 
                                                                                                fontSize: '0.68rem', 
                                                                                                fontWeight: '900', 
                                                                                                background: isCustom ? '#dcfce7' : '#dcfce7', 
                                                                                                color: '#166534', 
                                                                                                padding: '2px 6px', 
                                                                                                borderRadius: '5px', 
                                                                                                border: '1px solid #86efac'
                                                                                            }}>
                                                                                                PAID ✓
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>

                                                                        {/* Total Reconciled Line */}
                                                                        <div style={{
                                                                            display: 'flex',
                                                                            justifyContent: 'space-between',
                                                                            alignItems: 'center',
                                                                            marginTop: '0.55rem',
                                                                            paddingTop: '0.5rem',
                                                                            borderTop: '1.5px dashed #cbd5e1',
                                                                            fontSize: '0.76rem',
                                                                            fontWeight: '900',
                                                                            color: '#334155'
                                                                        }}>
                                                                            <span>Verified Items Total:</span>
                                                                            <span style={{ color: '#047857', fontSize: '0.84rem' }}>
                                                                                Rs {clearedGrandTotal.toLocaleString()}
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    {/* 3. Re-Issue Actions: Thermal Slip, PDF, WhatsApp & View/Attach Slip */}
                                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.45rem' }}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={handleReprintThermalPaidSlip}
                                                                            style={{
                                                                                padding: '0.65rem 0.4rem',
                                                                                borderRadius: '9px',
                                                                                border: '1.5px solid #0f172a',
                                                                                background: '#0f172a',
                                                                                color: '#ffffff',
                                                                                fontSize: '0.76rem',
                                                                                fontWeight: '900',
                                                                                cursor: 'pointer',
                                                                                display: 'flex',
                                                                                flexDirection: 'column',
                                                                                alignItems: 'center',
                                                                                gap: '3px',
                                                                                boxShadow: '0 2px 6px rgba(15, 23, 42, 0.18)',
                                                                                transition: 'all 0.15s ease'
                                                                            }}
                                                                        >
                                                                            <Printer size={16} />
                                                                            <span>Thermal Slip</span>
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={handleDownloadPaidPDFReceipt}
                                                                            style={{
                                                                                padding: '0.65rem 0.4rem',
                                                                                borderRadius: '9px',
                                                                                border: '1.5px solid #cbd5e1',
                                                                                background: '#ffffff',
                                                                                color: '#0f172a',
                                                                                fontSize: '0.76rem',
                                                                                fontWeight: '900',
                                                                                cursor: 'pointer',
                                                                                display: 'flex',
                                                                                flexDirection: 'column',
                                                                                alignItems: 'center',
                                                                                gap: '3px',
                                                                                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
                                                                                transition: 'all 0.15s ease'
                                                                            }}
                                                                        >
                                                                            <Download size={16} />
                                                                            <span>PDF Receipt</span>
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={handleResendPaidWhatsAppReceipt}
                                                                            style={{
                                                                                padding: '0.65rem 0.4rem',
                                                                                borderRadius: '9px',
                                                                                border: '1.5px solid #86efac',
                                                                                background: '#f0fdf4',
                                                                                color: '#15803d',
                                                                                fontSize: '0.76rem',
                                                                                fontWeight: '900',
                                                                                cursor: 'pointer',
                                                                                display: 'flex',
                                                                                flexDirection: 'column',
                                                                                alignItems: 'center',
                                                                                gap: '3px',
                                                                                boxShadow: '0 1px 3px rgba(22, 101, 52, 0.08)',
                                                                                transition: 'all 0.15s ease'
                                                                            }}
                                                                        >
                                                                            <Send size={16} />
                                                                            <span>WhatsApp</span>
                                                                        </button>
                                                                        {hasProof ? (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setProofModal({
                                                                                    isOpen: true,
                                                                                    url: selectedMonthPaidRecord.proofUrl,
                                                                                    title: `Payment Proof - ${selectedMonthPaidRecord.studentName} (${selectedMonthPaidRecord.targetMonthName})`
                                                                                })}
                                                                                style={{
                                                                                    padding: '0.65rem 0.4rem',
                                                                                    borderRadius: '9px',
                                                                                    border: '1.5px solid #38bdf8',
                                                                                    background: '#f0f9ff',
                                                                                    color: '#0284c7',
                                                                                    fontSize: '0.76rem',
                                                                                    fontWeight: '900',
                                                                                    cursor: 'pointer',
                                                                                    display: 'flex',
                                                                                    flexDirection: 'column',
                                                                                    alignItems: 'center',
                                                                                    gap: '3px',
                                                                                    boxShadow: '0 1px 3px rgba(2, 132, 199, 0.1)',
                                                                                    transition: 'all 0.15s ease'
                                                                                }}
                                                                            >
                                                                                <Eye size={16} />
                                                                                <span>View Slip</span>
                                                                            </button>
                                                                        ) : (
                                                                            <button
                                                                                type="button"
                                                                                onClick={handleTriggerAttachProof}
                                                                                disabled={attachingProof}
                                                                                style={{
                                                                                    padding: '0.65rem 0.4rem',
                                                                                    borderRadius: '9px',
                                                                                    border: '1.5px dashed #cbd5e1',
                                                                                    background: '#f8fafc',
                                                                                    color: '#475569',
                                                                                    fontSize: '0.76rem',
                                                                                    fontWeight: '800',
                                                                                    cursor: 'pointer',
                                                                                    display: 'flex',
                                                                                    flexDirection: 'column',
                                                                                    alignItems: 'center',
                                                                                    gap: '3px',
                                                                                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                                                                                    transition: 'all 0.15s ease'
                                                                                }}
                                                                                title="Attach bank transfer or online payment slip image"
                                                                            >
                                                                                {attachingProof ? <Loader2 size={16} className="animate-spin text-blue-600" /> : <Upload size={16} />}
                                                                                <span>Attach Slip</span>
                                                                            </button>
                                                                        )}
                                                                    </div>

                                                                    {/* 4. ⏩ Smart Advance to Next Due Month Navigator */}
                                                                    {nextUnpaidMonthIdx !== -1 && nextUnpaidMonthIdx !== selectedTargetMonthIdx && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setSelectedTargetMonthIdx(nextUnpaidMonthIdx)}
                                                                            style={{
                                                                                width: '100%',
                                                                                padding: '0.65rem 0.9rem',
                                                                                borderRadius: '10px',
                                                                                border: '1.5px solid #93c5fd',
                                                                                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                                                                                color: '#1d4ed8',
                                                                                fontSize: '0.8rem',
                                                                                fontWeight: '900',
                                                                                cursor: 'pointer',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                gap: '6px',
                                                                                boxShadow: '0 2px 6px rgba(29, 78, 216, 0.12)',
                                                                                transition: 'all 0.15s ease'
                                                                            }}
                                                                        >
                                                                            <span>👉 Advance to Next Due Month ({MONTH_NAMES[nextUnpaidMonthIdx]} {new Date().getFullYear()})</span>
                                                                            <ArrowRight size={15} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            );
                                                        }

                                                        return (
                                                            <>
                                                                {/* Supplementary Charge Mode Notice */}
                                                                {isTargetMonthFullyPaid && (hasUnpaidCustomActions || hasUnsettledBalance) && (
                                                                    <div style={{
                                                                        background: '#eff6ff',
                                                                        border: '1.5px solid #93c5fd',
                                                                        borderRadius: '9px',
                                                                        padding: '0.45rem 0.75rem',
                                                                        marginBottom: '0.55rem',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '6px',
                                                                        fontSize: '0.74rem',
                                                                        fontWeight: '800',
                                                                        color: '#1d4ed8'
                                                                    }}>
                                                                        <Sparkles size={14} color="#2563eb" />
                                                                        <span>Supplementary Fee Mode: Base month has recorded payments; collecting newly added charges / remaining balance of Rs {pendingBalanceToClear.toLocaleString()}.</span>
                                                                    </div>
                                                                )}

                                                                {/* Tactile Payment Method Chips */}
                                                                <div style={{ marginBottom: '0.65rem' }}>
                                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem' }}>
                                                                        {[
                                                                            { id: 'Cash', label: 'Cash', icon: '💵', color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
                                                                            { id: 'Bank Transfer', label: 'Bank', icon: '🏛️', color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
                                                                            { id: 'EasyPaisa', label: 'EasyPaisa', icon: '📱', color: '#059669', bg: '#ecfdf5', border: '#6ee7b7' },
                                                                            { id: 'JazzCash', label: 'JazzCash', icon: '💳', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' }
                                                                        ].map((m) => (
                                                                            <button
                                                                                key={m.id}
                                                                                type="button"
                                                                                onClick={() => setPaymentMode(m.id)}
                                                                                style={{
                                                                                    padding: '0.35rem 0.15rem',
                                                                                    borderRadius: '7px',
                                                                                    border: paymentMode === m.id ? `1.5px solid ${m.color}` : '1px solid #e2e8f0',
                                                                                    background: paymentMode === m.id ? m.bg : '#ffffff',
                                                                                    color: paymentMode === m.id ? m.color : '#475569',
                                                                                    fontWeight: '700',
                                                                                    fontSize: '0.68rem',
                                                                                    cursor: 'pointer',
                                                                                    display: 'flex',
                                                                                    flexDirection: 'column',
                                                                                    alignItems: 'center',
                                                                                    gap: '1px',
                                                                                    boxShadow: paymentMode === m.id ? `0 2px 6px ${m.color}22` : 'none',
                                                                                    transition: 'all 0.15s ease'
                                                                                }}
                                                                            >
                                                                                <span style={{ fontSize: '0.8rem' }}>{m.icon}</span>
                                                                                <span>{m.label}</span>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>

                                                                {/* Financial Breakdown Summary: Multi-Sibling Matrix or Single Student Breakdown */}
                                                                {feeCalculation?.isMultiFamily ? (
                                                                    <div style={{
                                                                        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                                                                        border: '1.5px solid #7dd3fc',
                                                                        borderRadius: '13px',
                                                                        padding: '0.85rem 0.95rem',
                                                                        marginBottom: '0.75rem',
                                                                        boxShadow: '0 2px 8px rgba(2, 132, 199, 0.08)'
                                                                    }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', borderBottom: '1.5px solid #bae6fd', paddingBottom: '0.45rem' }}>
                                                                            <span style={{ fontSize: '0.82rem', fontWeight: '900', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                👨‍👩‍👧‍👦 Family Sibling Bill ({feeCalculation.studentsBreakdown?.length || feeCalculation.activeSiblingsCount} Children)
                                                                            </span>
                                                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleDownloadChallanForMonth(null)}
                                                                                    style={{
                                                                                        padding: '2px 7px',
                                                                                        borderRadius: '5px',
                                                                                        border: '1px solid #0284c7',
                                                                                        background: '#ffffff',
                                                                                        color: '#0284c7',
                                                                                        fontSize: '0.66rem',
                                                                                        fontWeight: '800',
                                                                                        cursor: 'pointer',
                                                                                        display: 'inline-flex',
                                                                                        alignItems: 'center',
                                                                                        gap: '3px'
                                                                                    }}
                                                                                    title="Download combined family fee challan with all siblings"
                                                                                >
                                                                                    <FileText size={12} />
                                                                                    <span>Print Challan</span>
                                                                                </button>
                                                                                <span style={{ fontSize: '0.68rem', color: '#0369a1', background: '#ffffff', border: '1px solid #7dd3fc', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>
                                                                                    {feeCalculation.payingSiblingsCount} of {feeCalculation.studentsBreakdown?.length} Paying
                                                                                </span>
                                                                            </div>
                                                                        </div>

                                                                        {/* List of Categorized Sibling Cards with Live Inclusion Toggle */}
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '2px' }}>
                                                                            {(feeCalculation.studentsBreakdown || []).map((sib) => {
                                                                                const sibTuition = Number(sib.tuitionFee || (sib.baseFee - (sib.transportFee || 0)) || 0);
                                                                                const sibTransport = Number(sib.transportFee || 0);
                                                                                const sibStore = Number(sib.storeFee || 0);
                                                                                const sibActions = Number(sib.actionsFee || 0);
                                                                                const sibArrears = Number(sib.previousMonthsArrears || 0);
                                                                                const isPaying = sib.isPaying !== false;

                                                                                return (
                                                                                    <div 
                                                                                        key={sib.studentId} 
                                                                                        onClick={() => !sib.isPaid && toggleSiblingSelection(sib.studentId)}
                                                                                        style={{
                                                                                            background: sib.isPaid ? '#f8fafc' : isPaying ? '#ffffff' : '#fef2f2',
                                                                                            border: sib.isPaid ? '1px solid #cbd5e1' : isPaying ? '1.5px solid #0284c7' : '1.5px dashed #f87171',
                                                                                            borderRadius: '10px',
                                                                                            padding: '0.6rem 0.75rem',
                                                                                            display: 'flex',
                                                                                            justifyContent: 'space-between',
                                                                                            alignItems: 'center',
                                                                                            boxShadow: isPaying ? '0 2px 5px rgba(2, 132, 199, 0.08)' : 'none',
                                                                                            cursor: sib.isPaid ? 'default' : 'pointer',
                                                                                            transition: 'all 0.15s ease'
                                                                                        }}
                                                                                    >
                                                                                        <div style={{ flex: 1, marginRight: '8px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={isPaying}
                                                                                                disabled={sib.isPaid}
                                                                                                onChange={() => {}}
                                                                                                style={{
                                                                                                    marginTop: '2px',
                                                                                                    accentColor: '#0284c7',
                                                                                                    cursor: sib.isPaid ? 'not-allowed' : 'pointer',
                                                                                                    width: '14px',
                                                                                                    height: '14px'
                                                                                                }}
                                                                                            />
                                                                                            <div style={{ flex: 1 }}>
                                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                                    <strong style={{ fontSize: '0.84rem', fontWeight: '900', color: isPaying ? '#0f172a' : '#64748b' }}>
                                                                                                        {sib.studentName}
                                                                                                    </strong>
                                                                                                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                                                                                                        ({sib.className} &bull; Roll #{sib.rollNo})
                                                                                                    </span>
                                                                                                </div>

                                                                                                {/* Short Categorized Badges */}
                                                                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                                                                                                    {sibTuition > 0 && (
                                                                                                        <span style={{ fontSize: '0.64rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                                                                                            🎓 Tuition: Rs {sibTuition.toLocaleString()}
                                                                                                        </span>
                                                                                                    )}
                                                                                                    {sibTransport > 0 && (
                                                                                                        <span style={{ fontSize: '0.64rem', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                                                                                            🚌 Bus: Rs {sibTransport.toLocaleString()}
                                                                                                        </span>
                                                                                                    )}
                                                                                                    {sibStore > 0 && (
                                                                                                        <span style={{ fontSize: '0.64rem', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                                                                                            🛍️ Store: Rs {sibStore.toLocaleString()}
                                                                                                        </span>
                                                                                                    )}
                                                                                                    {sibActions > 0 && (
                                                                                                        <span style={{ fontSize: '0.64rem', background: '#faf5ff', color: '#6b21a8', border: '1px solid #e9d5ff', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                                                                                            ⚡ Actions: Rs {sibActions.toLocaleString()}
                                                                                                        </span>
                                                                                                    )}
                                                                                                    {sibArrears > 0 && (
                                                                                                        <span style={{ fontSize: '0.64rem', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                                                                                            ⏳ Arrears: Rs {sibArrears.toLocaleString()}
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>

                                                                                        {/* Subtotal & Status */}
                                                                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                                                            <div style={{ fontSize: '0.94rem', fontWeight: '900', color: isPaying ? '#0f172a' : '#94a3b8' }}>
                                                                                                Rs {Number(sib.subtotal || 0).toLocaleString()}
                                                                                            </div>
                                                                                            <span style={{
                                                                                                fontSize: '0.62rem',
                                                                                                color: sib.isPaid ? '#15803d' : isPaying ? '#0369a1' : '#b91c1c',
                                                                                                background: sib.isPaid ? '#dcfce7' : isPaying ? '#e0f2fe' : '#fee2e2',
                                                                                                border: `1px solid ${sib.isPaid ? '#86efac' : isPaying ? '#7dd3fc' : '#fca5a5'}`,
                                                                                                padding: '1px 6px',
                                                                                                borderRadius: '4px',
                                                                                                fontWeight: '800',
                                                                                                display: 'inline-block',
                                                                                                marginTop: '2px'
                                                                                            }}>
                                                                                                {sib.isPaid ? '✓ Paid' : isPaying ? '✓ Paying Now' : '⏳ Excluded / Pending'}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>

                                                                        {/* Aggregate Item Summary Chips */}
                                                                        <div style={{
                                                                            display: 'flex',
                                                                            gap: '4px',
                                                                            flexWrap: 'wrap',
                                                                            background: 'rgba(255, 255, 255, 0.7)',
                                                                            border: '1px solid #bae6fd',
                                                                            borderRadius: '8px',
                                                                            padding: '0.35rem 0.5rem',
                                                                            marginTop: '0.6rem'
                                                                        }}>
                                                                            {Number(feeCalculation?.tuitionFee || feeCalculation?.baseFee || 0) > 0 && (
                                                                                <span style={{ fontSize: '0.62rem', color: '#1e40af', fontWeight: '700' }}>
                                                                                    Tuition: <strong>Rs {Number(feeCalculation?.tuitionFee || feeCalculation?.baseFee || 0).toLocaleString()}</strong>
                                                                                </span>
                                                                            )}
                                                                            {Number(feeCalculation?.transportFee || 0) > 0 && (
                                                                                <span style={{ fontSize: '0.62rem', color: '#b45309', fontWeight: '700' }}>
                                                                                    &bull; Transport: <strong>Rs {Number(feeCalculation?.transportFee || 0).toLocaleString()}</strong>
                                                                                </span>
                                                                            )}
                                                                            {Number(feeCalculation?.storeFee || 0) > 0 && (
                                                                                <span style={{ fontSize: '0.62rem', color: '#047857', fontWeight: '700' }}>
                                                                                    &bull; Store: <strong>Rs {Number(feeCalculation?.storeFee || 0).toLocaleString()}</strong>
                                                                                </span>
                                                                            )}
                                                                            {Number(feeCalculation?.actionsFee || 0) > 0 && (
                                                                                <span style={{ fontSize: '0.62rem', color: '#6b21a8', fontWeight: '700' }}>
                                                                                    &bull; Actions: <strong>Rs {Number(feeCalculation?.actionsFee || 0).toLocaleString()}</strong>
                                                                                </span>
                                                                            )}
                                                                            {Number(feeCalculation?.previousMonthsArrears || 0) > 0 && (
                                                                                <span style={{ fontSize: '0.62rem', color: '#b91c1c', fontWeight: '700' }}>
                                                                                    &bull; Arrears: <strong>Rs {Number(feeCalculation?.previousMonthsArrears || 0).toLocaleString()}</strong>
                                                                                </span>
                                                                            )}
                                                                        </div>

                                                                        {/* 3-Way Financial Reconciliation Grid */}
                                                                        <div style={{
                                                                            display: 'grid',
                                                                            gridTemplateColumns: 'repeat(3, 1fr)',
                                                                            gap: '0.4rem',
                                                                            borderTop: '2px solid #0284c7',
                                                                            paddingTop: '0.55rem',
                                                                            marginTop: '0.55rem'
                                                                        }}>
                                                                            <div style={{ background: '#ffffff', borderRadius: '7px', padding: '4px 6px', border: '1px solid #bae6fd' }}>
                                                                                <span style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: '700', display: 'block' }}>Household Billed:</span>
                                                                                <strong style={{ color: '#0f172a', fontSize: '0.86rem', fontWeight: '900' }}>
                                                                                    Rs {Number(feeCalculation?.householdGrandTotal || 0).toLocaleString()}
                                                                                </strong>
                                                                            </div>
                                                                            <div style={{ background: '#f0fdf4', borderRadius: '7px', padding: '4px 6px', border: '1px solid #86efac' }}>
                                                                                <span style={{ fontSize: '0.6rem', color: '#166534', fontWeight: '700', display: 'block' }}>Paying in Voucher:</span>
                                                                                <strong style={{ color: '#15803d', fontSize: '0.94rem', fontWeight: '900' }}>
                                                                                    Rs {payableNetTotal.toLocaleString()}
                                                                                </strong>
                                                                            </div>
                                                                            <div style={{ background: (Number(feeCalculation?.householdTotalPendingDue || 0) - payableNetTotal) > 0 ? '#fef2f2' : '#f8fafc', borderRadius: '7px', padding: '4px 6px', border: (Number(feeCalculation?.householdTotalPendingDue || 0) - payableNetTotal) > 0 ? '1px solid #fca5a5' : '1px solid #cbd5e1' }}>
                                                                                <span style={{ fontSize: '0.6rem', color: (Number(feeCalculation?.householdTotalPendingDue || 0) - payableNetTotal) > 0 ? '#b91c1c' : '#64748b', fontWeight: '700', display: 'block' }}>Remaining Due:</span>
                                                                                <strong style={{ color: (Number(feeCalculation?.householdTotalPendingDue || 0) - payableNetTotal) > 0 ? '#b91c1c' : '#15803d', fontSize: '0.86rem', fontWeight: '900' }}>
                                                                                    Rs {Math.max(0, Number(feeCalculation?.householdTotalPendingDue || 0) - payableNetTotal).toLocaleString()}
                                                                                </strong>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div style={{
                                                                        background: '#f8fafc',
                                                                        border: '1.5px solid #cbd5e1',
                                                                        borderRadius: '12px',
                                                                        padding: '0.75rem 0.85rem',
                                                                        marginBottom: '0.65rem'
                                                                    }}>
                                                                        {/* Quick Preset Selector Chips & New Action Button */}
                                                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={handleSelectAllCategories}
                                                                                    style={{
                                                                                        padding: '2px 7px',
                                                                                        borderRadius: '5px',
                                                                                        border: selectedFeeItemKeys.length >= 4 ? '1.5px solid #0f172a' : '1px solid #cbd5e1',
                                                                                        background: selectedFeeItemKeys.length >= 4 ? '#0f172a' : '#ffffff',
                                                                                        color: selectedFeeItemKeys.length >= 4 ? '#ffffff' : '#0f172a',
                                                                                        fontSize: '0.7rem',
                                                                                        fontWeight: '800',
                                                                                        cursor: 'pointer'
                                                                                    }}
                                                                                >
                                                                                    ⚡ All
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleSelectOnlyCategory('tuition')}
                                                                                    style={{
                                                                                        padding: '2px 7px',
                                                                                        borderRadius: '5px',
                                                                                        border: selectedFeeItemKeys.length === 1 && selectedFeeItemKeys.includes('tuition') ? '1.5px solid #0f172a' : '1px solid #cbd5e1',
                                                                                        background: selectedFeeItemKeys.length === 1 && selectedFeeItemKeys.includes('tuition') ? '#0f172a' : '#ffffff',
                                                                                        color: selectedFeeItemKeys.length === 1 && selectedFeeItemKeys.includes('tuition') ? '#ffffff' : '#0f172a',
                                                                                        fontSize: '0.7rem',
                                                                                        fontWeight: '800',
                                                                                        cursor: 'pointer'
                                                                                    }}
                                                                                >
                                                                                    🎓 Tuition
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleSelectOnlyCategory('fine')}
                                                                                    style={{
                                                                                        padding: '2px 7px',
                                                                                        borderRadius: '5px',
                                                                                        border: selectedFeeItemKeys.length === 1 && selectedFeeItemKeys.includes('fine') ? '1.5px solid #0f172a' : '1px solid #cbd5e1',
                                                                                        background: selectedFeeItemKeys.length === 1 && selectedFeeItemKeys.includes('fine') ? '#0f172a' : '#ffffff',
                                                                                        color: selectedFeeItemKeys.length === 1 && selectedFeeItemKeys.includes('fine') ? '#ffffff' : '#0f172a',
                                                                                        fontSize: '0.7rem',
                                                                                        fontWeight: '800',
                                                                                        cursor: 'pointer'
                                                                                    }}
                                                                                >
                                                                                    ⏳ Fine
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleSelectOnlyCategory('store')}
                                                                                    style={{
                                                                                        padding: '2px 7px',
                                                                                        borderRadius: '5px',
                                                                                        border: selectedFeeItemKeys.length === 1 && selectedFeeItemKeys.includes('store') ? '1.5px solid #0f172a' : '1px solid #cbd5e1',
                                                                                        background: selectedFeeItemKeys.length === 1 && selectedFeeItemKeys.includes('store') ? '#0f172a' : '#ffffff',
                                                                                        color: selectedFeeItemKeys.length === 1 && selectedFeeItemKeys.includes('store') ? '#ffffff' : '#0f172a',
                                                                                        fontSize: '0.7rem',
                                                                                        fontWeight: '800',
                                                                                        cursor: 'pointer'
                                                                                    }}
                                                                                >
                                                                                    🛍️ Store
                                                                                </button>
                                                                            </div>

                                                                            {/* ➕ New Action / Custom Fee Trigger */}
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setShowNewActionModal(true)}
                                                                                style={{
                                                                                    padding: '2px 8px',
                                                                                    borderRadius: '6px',
                                                                                    border: '1.5px dashed #0078d4',
                                                                                    background: '#eff6ff',
                                                                                    color: '#0078d4',
                                                                                    fontSize: '0.7rem',
                                                                                    fontWeight: '800',
                                                                                    cursor: 'pointer',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '3px',
                                                                                    transition: 'all 0.15s ease'
                                                                                }}
                                                                                title="Add on-the-spot fee/charge (Exam Fee, ID Card, Fine, etc.)"
                                                                            >
                                                                                ➕ New Action
                                                                            </button>
                                                                        </div>

                                                                        {/* 2-Column Balanced Grid Layout */}
                                                                        <div style={{
                                                                            display: 'grid',
                                                                            gridTemplateColumns: '1fr 1fr',
                                                                            gap: '0.35rem',
                                                                            marginBottom: '0.4rem'
                                                                        }}>
                                                                            {/* COLUMN 1: Academic, Arrears & Store */}
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                                                {/* Prior Overdue Arrears */}
                                                                                {Number(selectedDetailMonthData?.breakdown?.arrears || 0) > 0 && (
                                                                                    <div 
                                                                                        onClick={() => !selectedDetailMonthData?.isArrearsPaid && toggleFeeItemKey('arrears')}
                                                                                        style={{ 
                                                                                            display: 'flex', 
                                                                                            justifyContent: 'space-between', 
                                                                                            alignItems: 'center',
                                                                                            cursor: selectedDetailMonthData?.isArrearsPaid ? 'default' : 'pointer',
                                                                                            padding: '5px 7px',
                                                                                            borderRadius: '7px',
                                                                                            background: selectedDetailMonthData?.isArrearsPaid ? '#f0fdf4' : selectedFeeItemKeys.includes('arrears') ? '#ffffff' : '#f8fafc',
                                                                                            border: selectedDetailMonthData?.isArrearsPaid ? '1.5px solid #86efac' : selectedFeeItemKeys.includes('arrears') ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
                                                                                            opacity: selectedDetailMonthData?.isArrearsPaid ? 1 : selectedFeeItemKeys.includes('arrears') ? 1 : 0.45
                                                                                        }}
                                                                                    >
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                            <input 
                                                                                                type="checkbox" 
                                                                                                checked={selectedDetailMonthData?.isArrearsPaid || selectedFeeItemKeys.includes('arrears')} 
                                                                                                disabled={selectedDetailMonthData?.isArrearsPaid}
                                                                                                onChange={() => {}} 
                                                                                                style={{ cursor: selectedDetailMonthData?.isArrearsPaid ? 'not-allowed' : 'pointer', accentColor: selectedDetailMonthData?.isArrearsPaid ? '#16a34a' : '#0f172a', width: '13px', height: '13px' }} 
                                                                                            />
                                                                                            <span style={{ color: '#0f172a', fontWeight: '800', fontSize: '0.74rem' }}>
                                                                                                📜 Arrears
                                                                                            </span>
                                                                                        </div>
                                                                                        <strong style={{ color: selectedDetailMonthData?.isArrearsPaid ? '#15803d' : '#0f172a', fontWeight: '900', fontSize: '0.82rem' }}>
                                                                                            +Rs {Number(selectedDetailMonthData.breakdown.arrears).toLocaleString()}
                                                                                        </strong>
                                                                                    </div>
                                                                                )}

                                                                                {/* Base Tuition */}
                                                                                <div 
                                                                                    onClick={() => !selectedDetailMonthData?.isTuitionPaid && toggleFeeItemKey('tuition')}
                                                                                    style={{ 
                                                                                        display: 'flex', 
                                                                                        justifyContent: 'space-between', 
                                                                                        alignItems: 'center',
                                                                                        cursor: selectedDetailMonthData?.isTuitionPaid ? 'default' : 'pointer',
                                                                                        padding: '5px 7px',
                                                                                        borderRadius: '7px',
                                                                                        background: selectedDetailMonthData?.isTuitionPaid ? '#f0fdf4' : selectedFeeItemKeys.includes('tuition') ? '#ffffff' : '#f8fafc',
                                                                                        border: selectedDetailMonthData?.isTuitionPaid ? '1.5px solid #86efac' : selectedFeeItemKeys.includes('tuition') ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
                                                                                        opacity: selectedDetailMonthData?.isTuitionPaid ? 1 : selectedFeeItemKeys.includes('tuition') ? 1 : 0.45
                                                                                    }}
                                                                                >
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                        <input 
                                                                                            type="checkbox" 
                                                                                            checked={selectedDetailMonthData?.isTuitionPaid || selectedFeeItemKeys.includes('tuition')} 
                                                                                            disabled={selectedDetailMonthData?.isTuitionPaid}
                                                                                            onChange={() => {}} 
                                                                                            style={{ cursor: selectedDetailMonthData?.isTuitionPaid ? 'not-allowed' : 'pointer', accentColor: selectedDetailMonthData?.isTuitionPaid ? '#16a34a' : '#0f172a', width: '13px', height: '13px' }} 
                                                                                        />
                                                                                        <span style={{ color: '#0f172a', fontWeight: '800', fontSize: '0.78rem' }}>
                                                                                            🎓 Tuition
                                                                                        </span>
                                                                                    </div>
                                                                                    <strong style={{ color: selectedDetailMonthData?.isTuitionPaid ? '#15803d' : '#0f172a', fontWeight: '900', fontSize: '0.84rem' }}>
                                                                                        Rs {Number(selectedDetailMonthData?.breakdown?.tuitionPayable ?? (activeChild?.tuitionFee || selectedStudent.tuitionFee || 0)).toLocaleString()}
                                                                                    </strong>
                                                                                </div>

                                                                                {/* Monthly Recurring Items (Online Services, Library, etc.) */}
                                                                                {(activePayableItems || []).filter(it => it.isRecurring || it.category === 'recurring').map((recItem, rIdx) => (
                                                                                    <div 
                                                                                        key={recItem.key || `recurring_${rIdx}`}
                                                                                        onClick={() => !selectedDetailMonthData?.isRecurringPaid && toggleFeeItemKey(recItem.key)}
                                                                                        style={{ 
                                                                                            display: 'flex', 
                                                                                            justifyContent: 'space-between', 
                                                                                            alignItems: 'center',
                                                                                            cursor: selectedDetailMonthData?.isRecurringPaid ? 'default' : 'pointer',
                                                                                            padding: '5px 7px',
                                                                                            borderRadius: '7px',
                                                                                            background: selectedDetailMonthData?.isRecurringPaid ? '#f0fdf4' : selectedFeeItemKeys.includes(recItem.key) ? '#ffffff' : '#f8fafc',
                                                                                            border: selectedDetailMonthData?.isRecurringPaid ? '1.5px solid #86efac' : selectedFeeItemKeys.includes(recItem.key) ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
                                                                                            opacity: selectedDetailMonthData?.isRecurringPaid ? 1 : selectedFeeItemKeys.includes(recItem.key) ? 1 : 0.45
                                                                                        }}
                                                                                    >
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                            <input 
                                                                                                type="checkbox" 
                                                                                                checked={selectedDetailMonthData?.isRecurringPaid || selectedFeeItemKeys.includes(recItem.key)} 
                                                                                                disabled={selectedDetailMonthData?.isRecurringPaid}
                                                                                                onChange={() => {}} 
                                                                                                style={{ cursor: selectedDetailMonthData?.isRecurringPaid ? 'not-allowed' : 'pointer', accentColor: selectedDetailMonthData?.isRecurringPaid ? '#16a34a' : '#0f172a', width: '13px', height: '13px' }} 
                                                                                            />
                                                                                            <span style={{ color: '#0f172a', fontWeight: '800', fontSize: '0.78rem' }}>
                                                                                                🌐 {recItem.name}
                                                                                            </span>
                                                                                        </div>
                                                                                        <strong style={{ color: selectedDetailMonthData?.isRecurringPaid ? '#15803d' : '#0f172a', fontWeight: '900', fontSize: '0.84rem' }}>
                                                                                            +Rs {Number(recItem.amount).toLocaleString()}
                                                                                        </strong>
                                                                                    </div>
                                                                                ))}

                                                                                {/* Store & Uniform Items */}
                                                                                {Number(selectedDetailMonthData?.breakdown?.storeDues || feeCalculation?.storeFee || 0) > 0 && (
                                                                                    <div style={{ position: 'relative' }}>
                                                                                        <div 
                                                                                            onClick={() => !selectedDetailMonthData?.isStorePaid && toggleFeeItemKey('store')}
                                                                                            style={{ 
                                                                                                display: 'flex', 
                                                                                                justifyContent: 'space-between', 
                                                                                                alignItems: 'center',
                                                                                                cursor: selectedDetailMonthData?.isStorePaid ? 'default' : 'pointer',
                                                                                                padding: '5px 7px',
                                                                                                borderRadius: '7px',
                                                                                                background: selectedDetailMonthData?.isStorePaid ? '#f0fdf4' : selectedFeeItemKeys.includes('store') ? '#ffffff' : '#f8fafc',
                                                                                                border: selectedDetailMonthData?.isStorePaid ? '1.5px solid #86efac' : selectedFeeItemKeys.includes('store') ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
                                                                                                opacity: selectedDetailMonthData?.isStorePaid ? 1 : selectedFeeItemKeys.includes('store') ? 1 : 0.45
                                                                                            }}
                                                                                        >
                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                                <input 
                                                                                                    type="checkbox" 
                                                                                                    checked={selectedDetailMonthData?.isStorePaid || selectedFeeItemKeys.includes('store')} 
                                                                                                    disabled={selectedDetailMonthData?.isStorePaid}
                                                                                                    onChange={() => {}} 
                                                                                                    style={{ cursor: selectedDetailMonthData?.isStorePaid ? 'not-allowed' : 'pointer', accentColor: selectedDetailMonthData?.isStorePaid ? '#16a34a' : '#0f172a', width: '13px', height: '13px' }} 
                                                                                                />
                                                                                                <span style={{ color: '#0f172a', fontWeight: '800', fontSize: '0.78rem' }}>
                                                                                                    🛍️ Store
                                                                                                </span>
                                                                                            </div>
                                                                                            <strong style={{ color: selectedDetailMonthData?.isStorePaid ? '#15803d' : '#0f172a', fontWeight: '900', fontSize: '0.84rem' }}>
                                                                                                +Rs {Number(selectedDetailMonthData?.breakdown?.storeDues || feeCalculation?.storeFee || 0).toLocaleString()}
                                                                                            </strong>
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                            {/* COLUMN 2: Transport, Events, Custom Actions & Fines */}
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                                                {/* Transport Fee */}
                                                                                {Number(selectedDetailMonthData?.breakdown?.transportFee ?? (activeChild?.transportFee || selectedStudent.transportFee || 0)) > 0 && (
                                                                                    <div 
                                                                                        onClick={() => !selectedDetailMonthData?.isTransportPaid && toggleFeeItemKey('transport')}
                                                                                        style={{ 
                                                                                            display: 'flex', 
                                                                                            justifyContent: 'space-between', 
                                                                                            alignItems: 'center',
                                                                                            cursor: selectedDetailMonthData?.isTransportPaid ? 'default' : 'pointer',
                                                                                            padding: '5px 7px',
                                                                                            borderRadius: '7px',
                                                                                            background: selectedDetailMonthData?.isTransportPaid ? '#f0fdf4' : selectedFeeItemKeys.includes('transport') ? '#ffffff' : '#f8fafc',
                                                                                            border: selectedDetailMonthData?.isTransportPaid ? '1.5px solid #86efac' : selectedFeeItemKeys.includes('transport') ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
                                                                                            opacity: selectedDetailMonthData?.isTransportPaid ? 1 : selectedFeeItemKeys.includes('transport') ? 1 : 0.45
                                                                                        }}
                                                                                    >
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                            <input 
                                                                                                type="checkbox" 
                                                                                                checked={selectedDetailMonthData?.isTransportPaid || selectedFeeItemKeys.includes('transport')} 
                                                                                                disabled={selectedDetailMonthData?.isTransportPaid}
                                                                                                onChange={() => {}} 
                                                                                                style={{ cursor: selectedDetailMonthData?.isTransportPaid ? 'not-allowed' : 'pointer', accentColor: selectedDetailMonthData?.isTransportPaid ? '#16a34a' : '#0f172a', width: '13px', height: '13px' }} 
                                                                                            />
                                                                                            <span style={{ color: '#0f172a', fontWeight: '800', fontSize: '0.78rem' }}>
                                                                                                🚌 Transport
                                                                                            </span>
                                                                                        </div>
                                                                                        <strong style={{ color: selectedDetailMonthData?.isTransportPaid ? '#15803d' : '#0f172a', fontWeight: '900', fontSize: '0.84rem' }}>
                                                                                            +Rs {Number(selectedDetailMonthData?.breakdown?.transportFee ?? (activeChild?.transportFee || selectedStudent.transportFee || 0)).toLocaleString()}
                                                                                        </strong>
                                                                                    </div>
                                                                                )}

                                                                                {/* Actions & Events */}
                                                                                {Number(selectedDetailMonthData?.breakdown?.actionFee || feeCalculation?.actionsFee || 0) > 0 && (
                                                                                    <div 
                                                                                        onClick={() => !selectedDetailMonthData?.isActionPaid && toggleFeeItemKey('action')}
                                                                                        style={{ 
                                                                                            display: 'flex', 
                                                                                            justifyContent: 'space-between', 
                                                                                            alignItems: 'center',
                                                                                            cursor: selectedDetailMonthData?.isActionPaid ? 'default' : 'pointer',
                                                                                            padding: '5px 7px',
                                                                                            borderRadius: '7px',
                                                                                            background: selectedDetailMonthData?.isActionPaid ? '#f0fdf4' : selectedFeeItemKeys.includes('action') ? '#ffffff' : '#f8fafc',
                                                                                            border: selectedDetailMonthData?.isActionPaid ? '1.5px solid #86efac' : selectedFeeItemKeys.includes('action') ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
                                                                                            opacity: selectedDetailMonthData?.isActionPaid ? 1 : selectedFeeItemKeys.includes('action') ? 1 : 0.45
                                                                                        }}
                                                                                    >
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                            <input 
                                                                                                type="checkbox" 
                                                                                                checked={selectedDetailMonthData?.isActionPaid || selectedFeeItemKeys.includes('action')} 
                                                                                                disabled={selectedDetailMonthData?.isActionPaid}
                                                                                                onChange={() => {}} 
                                                                                                style={{ cursor: selectedDetailMonthData?.isActionPaid ? 'not-allowed' : 'pointer', accentColor: selectedDetailMonthData?.isActionPaid ? '#16a34a' : '#0f172a', width: '13px', height: '13px' }} 
                                                                                            />
                                                                                            <span style={{ color: '#0f172a', fontWeight: '800', fontSize: '0.78rem' }}>
                                                                                                ⚡ Events
                                                                                            </span>
                                                                                        </div>
                                                                                        <strong style={{ color: selectedDetailMonthData?.isActionPaid ? '#15803d' : '#0f172a', fontWeight: '900', fontSize: '0.84rem' }}>
                                                                                            +Rs {Number(selectedDetailMonthData?.breakdown?.actionFee || feeCalculation?.actionsFee || 0).toLocaleString()}
                                                                                        </strong>
                                                                                    </div>
                                                                                )}

                                                                                {/* Custom Actions Added by Cashier (Live Synced with Parent App) */}
                                                                                {activePayableItems.filter(it => it.isCustomAction).map((actItem) => {
                                                                                    const isActSelected = selectedFeeItemKeys.includes(actItem.key);
                                                                                    return (
                                                                                        <div 
                                                                                            key={actItem.key}
                                                                                            onClick={() => toggleFeeItemKey(actItem.key)}
                                                                                            style={{ 
                                                                                                display: 'flex', 
                                                                                                justifyContent: 'space-between', 
                                                                                                alignItems: 'center',
                                                                                                cursor: 'pointer',
                                                                                                padding: '5px 7px',
                                                                                                borderRadius: '7px',
                                                                                                background: isActSelected ? '#eff6ff' : '#f8fafc',
                                                                                                border: isActSelected ? '1.5px solid #0078d4' : '1px solid #cbd5e1',
                                                                                                opacity: isActSelected ? 1 : 0.5,
                                                                                                transition: 'all 0.15s ease'
                                                                                            }}
                                                                                        >
                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                                                                                                <input 
                                                                                                    type="checkbox" 
                                                                                                    checked={isActSelected} 
                                                                                                    onChange={() => {}} 
                                                                                                    style={{ cursor: 'pointer', accentColor: '#0078d4', width: '13px', height: '13px', flexShrink: 0 }} 
                                                                                                />
                                                                                                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                                                                                    <span style={{ color: '#0078d4', fontWeight: '800', fontSize: '0.74rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                                                                        🏷️ {actItem.name}
                                                                                                    </span>
                                                                                                    {actItem.remarks && (
                                                                                                        <span style={{ fontSize: '0.62rem', color: '#64748b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                                                                            {actItem.remarks}
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>
                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                                                                                                <strong style={{ color: '#0078d4', fontWeight: '900', fontSize: '0.82rem' }}>
                                                                                                    +Rs {Number(actItem.amount).toLocaleString()}
                                                                                                </strong>
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        handleRemoveCustomAction(actItem.id);
                                                                                                    }}
                                                                                                    style={{
                                                                                                        background: '#fee2e2',
                                                                                                        border: 'none',
                                                                                                        color: '#ef4444',
                                                                                                        padding: '2px 4px',
                                                                                                        borderRadius: '4px',
                                                                                                        cursor: 'pointer',
                                                                                                        display: 'flex',
                                                                                                        alignItems: 'center',
                                                                                                        justifyContent: 'center'
                                                                                                    }}
                                                                                                    title="Remove unpaid action from student bill"
                                                                                                >
                                                                                                    <Trash2 size={11} />
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                })}

                                                                                {/* Late Fine / Penalty */}
                                                                                {Number(fineAmount) > 0 ? (
                                                                                    <div 
                                                                                        onClick={() => !selectedDetailMonthData?.isFinePaid && toggleFeeItemKey('fine')}
                                                                                        style={{ 
                                                                                            display: 'flex', 
                                                                                            justifyContent: 'space-between', 
                                                                                            alignItems: 'center',
                                                                                            cursor: selectedDetailMonthData?.isFinePaid ? 'default' : 'pointer',
                                                                                            padding: '5px 7px',
                                                                                            borderRadius: '7px',
                                                                                            background: selectedDetailMonthData?.isFinePaid ? '#f0fdf4' : selectedFeeItemKeys.includes('fine') ? '#ffffff' : '#f8fafc',
                                                                                            border: selectedDetailMonthData?.isFinePaid ? '1.5px solid #86efac' : selectedFeeItemKeys.includes('fine') ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
                                                                                            opacity: selectedDetailMonthData?.isFinePaid ? 1 : selectedFeeItemKeys.includes('fine') ? 1 : 0.45
                                                                                        }}
                                                                                    >
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                            <input 
                                                                                                type="checkbox" 
                                                                                                checked={selectedDetailMonthData?.isFinePaid || selectedFeeItemKeys.includes('fine')} 
                                                                                                disabled={selectedDetailMonthData?.isFinePaid}
                                                                                                onChange={() => {}} 
                                                                                                style={{ cursor: selectedDetailMonthData?.isFinePaid ? 'not-allowed' : 'pointer', accentColor: selectedDetailMonthData?.isFinePaid ? '#16a34a' : '#0f172a', width: '13px', height: '13px' }} 
                                                                                            />
                                                                                            <span style={{ color: '#0f172a', fontWeight: '800', fontSize: '0.78rem' }}>
                                                                                                ⏳ Late Fine
                                                                                            </span>
                                                                                        </div>
                                                                                        <strong style={{ color: selectedDetailMonthData?.isFinePaid ? '#15803d' : '#0f172a', fontWeight: '900', fontSize: '0.84rem' }}>
                                                                                            +Rs {Number(fineAmount).toLocaleString()}
                                                                                        </strong>
                                                                                    </div>
                                                                                ) : isFineWaived ? (
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1.5px solid #0f172a', padding: '4px 7px', borderRadius: '7px' }}>
                                                                                        <span style={{ color: '#0f172a', fontWeight: '800', fontSize: '0.74rem' }}>🎉 Waived</span>
                                                                                        <span style={{ color: '#0f172a', fontWeight: '900', fontSize: '0.78rem' }}>Rs 0</span>
                                                                                    </div>
                                                                                ) : null}
                                                                            </div>
                                                                        </div>

                                                                        {/* Net Payable Total */}
                                                                        <div style={{ borderTop: '2px solid #0f172a', paddingTop: '0.4rem', marginTop: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                            <strong style={{ color: '#0f172a', fontSize: '0.82rem', fontWeight: '900' }}>
                                                                                {isTargetMonthFullyPaid && hasUnpaidCustomActions ? 'Supplementary Action Total:' : 'Payable Total:'}
                                                                            </strong>
                                                                            <strong style={{ color: '#0f172a', fontSize: '1.15rem', fontWeight: '900' }}>
                                                                                Rs {payableNetTotal.toLocaleString()}
                                                                            </strong>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Concession / Discount Input */}
                                                                <div style={{ marginBottom: '0.65rem' }}>
                                                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.15rem' }}>
                                                                        Concession / Discount (Rs)
                                                                    </label>
                                                                    <input
                                                                        type="number"
                                                                        value={discountAmount}
                                                                        onChange={(e) => setDiscountAmount(e.target.value)}
                                                                        min="0"
                                                                        placeholder="0 (e.g. 500)"
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '0.45rem 0.65rem',
                                                                            borderRadius: '7px',
                                                                            border: '1px solid #cbd5e1',
                                                                            outline: 'none',
                                                                            background: '#ffffff',
                                                                            fontWeight: '700',
                                                                            color: '#0f172a',
                                                                            fontSize: '0.82rem',
                                                                            boxSizing: 'border-box'
                                                                        }}
                                                                    />
                                                                </div>

                                                                {/* Received Amount & Live Total with Reset */}
                                                                <div style={{
                                                                    background: '#f0fdf4',
                                                                    border: '1.5px solid #86efac',
                                                                    borderRadius: '9px',
                                                                    padding: '0.65rem 0.8rem',
                                                                    marginBottom: '0.65rem'
                                                                }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                                                        <label style={{ fontSize: '0.74rem', fontWeight: '800', color: '#166534' }}>
                                                                            Received Amount (Rs)
                                                                        </label>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setReceivedAmount(String(payableNetTotal))}
                                                                            style={{
                                                                                background: '#dcfce7',
                                                                                border: '1px solid #86efac',
                                                                                borderRadius: '5px',
                                                                                color: '#15803d',
                                                                                fontSize: '0.66rem',
                                                                                fontWeight: '800',
                                                                                padding: '1px 6px',
                                                                                cursor: 'pointer'
                                                                            }}
                                                                            title="Click to reset to exact calculated total"
                                                                        >
                                                                            ⚡ Exact: Rs {payableNetTotal.toLocaleString()}
                                                                        </button>
                                                                    </div>
                                                                    <input
                                                                        type="number"
                                                                        value={receivedAmount}
                                                                        onChange={(e) => setReceivedAmount(e.target.value)}
                                                                        min="0"
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '0.45rem 0.65rem',
                                                                            borderRadius: '7px',
                                                                            border: '1px solid #16a34a',
                                                                            outline: 'none',
                                                                            background: '#ffffff',
                                                                            fontWeight: '900',
                                                                            color: '#166534',
                                                                            fontSize: '1.15rem',
                                                                            boxSizing: 'border-box'
                                                                        }}
                                                                    />
                                                                    <div style={{ marginTop: '0.25rem', fontSize: '0.68rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        {Number(receivedAmount) === payableNetTotal ? (
                                                                            <span style={{ color: '#15803d', fontWeight: '700' }}>✓ Full Payment Settled</span>
                                                                        ) : Number(receivedAmount) < payableNetTotal ? (
                                                                            <span style={{ color: '#b45309', fontWeight: '700' }}>
                                                                                ⚠️ Partial: Rs {(payableNetTotal - Number(receivedAmount)).toLocaleString()} remaining
                                                                            </span>
                                                                        ) : (
                                                                            <span style={{ color: '#0284c7', fontWeight: '700' }}>
                                                                                ℹ️ Advance: +Rs {(Number(receivedAmount) - payableNetTotal).toLocaleString()}
                                                                            </span>
                                                                        )}
                                                                        <span style={{ color: '#64748b' }}>
                                                                            {selectedPayableItems.length} item{selectedPayableItems.length === 1 ? '' : 's'}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {/* Non-Cash TRX Reference & Proof */}
                                                                {paymentMode !== 'Cash' && (
                                                                    <div style={{
                                                                        padding: '0.6rem 0.75rem',
                                                                        borderRadius: '9px',
                                                                        background: '#eff6ff',
                                                                        border: '1.5px dashed #93c5fd',
                                                                        marginBottom: '0.65rem',
                                                                        display: 'flex',
                                                                        flexDirection: 'column',
                                                                        gap: '0.4rem'
                                                                    }}>
                                                                        <input
                                                                            type="text"
                                                                            value={transactionRefId}
                                                                            onChange={(e) => setTransactionRefId(e.target.value)}
                                                                            placeholder={`e.g. ${paymentMode} Ref / TRX ID`}
                                                                            style={{
                                                                                width: '100%',
                                                                                padding: '0.4rem 0.6rem',
                                                                                borderRadius: '6px',
                                                                                border: '1px solid #bfdbfe',
                                                                                outline: 'none',
                                                                                background: '#ffffff',
                                                                                fontSize: '0.78rem',
                                                                                boxSizing: 'border-box',
                                                                                fontWeight: '700'
                                                                            }}
                                                                        />
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                            <input
                                                                                type="file"
                                                                                accept="image/*"
                                                                                onChange={handleProofChange}
                                                                                style={{ fontSize: '0.72rem', color: '#475569' }}
                                                                            />
                                                                            {proofPreview && (
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                                                    <img src={proofPreview} alt="Proof" style={{ width: '26px', height: '26px', objectFit: 'cover', borderRadius: '4px' }} />
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={handleRemoveProof}
                                                                                        style={{ padding: '1px 5px', borderRadius: '3px', background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: '0.65rem', fontWeight: '700', cursor: 'pointer' }}
                                                                                    >
                                                                                        Remove
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Remarks Input */}
                                                                <div style={{ marginBottom: '0.65rem' }}>
                                                                    <input
                                                                        type="text"
                                                                        value={remarks}
                                                                        onChange={(e) => setRemarks(e.target.value)}
                                                                        placeholder="Remarks / Note (Optional, e.g. Paid by Father)..."
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '0.45rem 0.65rem',
                                                                            borderRadius: '7px',
                                                                            border: '1px solid #cbd5e1',
                                                                            outline: 'none',
                                                                            background: '#ffffff',
                                                                            fontSize: '0.78rem',
                                                                            boxSizing: 'border-box'
                                                                        }}
                                                                    />
                                                                </div>

                                                                {/* WhatsApp Receipt Automation Checkbox */}
                                                                <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        id="sendWhatsAppCheckbox"
                                                                        checked={sendWhatsAppOnSubmit}
                                                                        onChange={(e) => setSendWhatsAppOnSubmit(e.target.checked)}
                                                                        style={{ cursor: 'pointer', accentColor: '#16a34a', width: '14px', height: '14px' }}
                                                                    />
                                                                    <label htmlFor="sendWhatsAppCheckbox" style={{ fontSize: '0.74rem', fontWeight: '700', color: '#166534', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <span>💬 Send Instant WhatsApp Receipt to Parent</span>
                                                                    </label>
                                                                </div>

                                                                {/* Big Confirm & Print Button */}
                                                                <button
                                                                    type="button"
                                                                    onClick={handleSubmitFee}
                                                                    disabled={isSubmitting || !selectedStudent}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '0.75rem',
                                                                        borderRadius: '10px',
                                                                        background: isSubmitting ? '#94a3b8' : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                                                                        border: 'none',
                                                                        color: '#ffffff',
                                                                        fontWeight: '900',
                                                                        fontSize: '0.92rem',
                                                                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        gap: '0.5rem',
                                                                        boxShadow: '0 4px 12px rgba(22, 163, 74, 0.35)',
                                                                        transition: 'all 0.18s ease'
                                                                    }}
                                                                >
                                                                    {isSubmitting ? (
                                                                        <>
                                                                            <Loader2 size={16} className="animate-spin" /> Recording Payment...
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Printer size={16} />
                                                                            <span>
                                                                                {isTargetMonthFullyPaid && hasUnpaidCustomActions
                                                                                    ? `Submit Supplementary Action (Rs ${Number(receivedAmount).toLocaleString()})`
                                                                                    : feeCalculation?.isMultiFamily
                                                                                        ? `Submit Family Slip (Rs ${Number(receivedAmount).toLocaleString()})`
                                                                                        : `Submit Fee & Print Receipt (Rs ${Number(receivedAmount).toLocaleString()})`
                                                                                }
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                </button>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>

                    {/* RIGHT PANEL: Smart Student & Family Hub (Or Today's Transactions Ledger) */}
                    {selectedStudent && activeDailyMode === 'fee_submission' ? (
                        <div className="card" style={{
                            background: '#ffffff',
                            borderRadius: '14px',
                            padding: '1.4rem',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 4px 16px -2px rgba(0,0,0,0.06)'
                        }}>
                            {/* Student Profile Header */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderBottom: '1px solid #f1f5f9',
                                paddingBottom: '0.85rem',
                                marginBottom: '1rem',
                                flexWrap: 'wrap',
                                gap: '0.6rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                    <div style={{
                                        width: '42px',
                                        height: '42px',
                                        borderRadius: '12px',
                                        background: 'linear-gradient(135deg, #0078d4 0%, #0284c7 100%)',
                                        color: '#ffffff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: '800',
                                        fontSize: '0.95rem',
                                        boxShadow: '0 3px 8px rgba(0, 120, 212, 0.25)'
                                    }}>
                                        {activeChild?.name?.slice(0, 2).toUpperCase() || 'ST'}
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                                {activeChild?.name || selectedStudent.name}
                                            </h3>
                                            {(() => {
                                                const mStatus = activeChildFeeCalculation?.monthStatus || (activeChildFeeCalculation?.isPaid ? 'paid' : 'pending');
                                                const monthLabel = MONTH_NAMES[selectedTargetMonthIdx] || 'Month';
                                                if (mStatus === 'paid') {
                                                    return (
                                                        <span style={{
                                                            fontSize: '0.68rem',
                                                            fontWeight: '800',
                                                            padding: '2px 7px',
                                                            borderRadius: '6px',
                                                            background: '#dcfce7',
                                                            color: '#15803d',
                                                            border: '1px solid #86efac',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px'
                                                        }}>
                                                            ✓ Paid ({monthLabel.slice(0, 3)})
                                                        </span>
                                                    );
                                                } else if (mStatus === 'overdue') {
                                                    return (
                                                        <span style={{
                                                            fontSize: '0.68rem',
                                                            fontWeight: '800',
                                                            padding: '2px 7px',
                                                            borderRadius: '6px',
                                                            background: '#fee2e2',
                                                            color: '#b91c1c',
                                                            border: '1px solid #fca5a5',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px'
                                                        }}>
                                                            ⚠ Overdue
                                                        </span>
                                                    );
                                                } else if (mStatus === 'partial') {
                                                    return (
                                                        <span style={{
                                                            fontSize: '0.68rem',
                                                            fontWeight: '800',
                                                            padding: '2px 7px',
                                                            borderRadius: '6px',
                                                            background: '#fef3c7',
                                                            color: '#b45309',
                                                            border: '1px solid #fde68a',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px'
                                                        }}>
                                                            ⚠️ Partial
                                                        </span>
                                                    );
                                                } else {
                                                    return (
                                                        <span style={{
                                                            fontSize: '0.68rem',
                                                            fontWeight: '800',
                                                            padding: '2px 7px',
                                                            borderRadius: '6px',
                                                            background: '#fffbeb',
                                                            color: '#b45309',
                                                            border: '1px solid #fcd34d',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px'
                                                        }}>
                                                            ⏳ Pending
                                                        </span>
                                                    );
                                                }
                                            })()}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                            {activeChild?.className || selectedStudent.className} &bull; Roll #{activeChild?.rollNo || selectedStudent.rollNo || 'N/A'} &bull; Father: <strong>{officialFamilyFatherName}</strong>
                                            {activeParentAccount && (
                                                <span style={{ marginLeft: '6px', fontSize: '0.68rem', background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                                    Verified Family Account
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    {/* Direct WhatsApp Action */}
                                    {(activeChild?.parentDetails?.fatherPhone || activeChild?.fatherPhone || activeChild?.phone) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const phone = activeChild?.parentDetails?.fatherPhone || activeChild?.fatherPhone || activeChild?.phone;
                                                const text = `Assalam-o-Alaikum, this is regarding ${activeChild.name}'s fee dues for ${schoolInfo.name || 'School'}. Current payable amount is Rs ${Number(activeChildFeeCalculation?.totalDue || 0).toLocaleString()}.`;
                                                let clean = phone.toString().replace(/[^0-9]/g, '');
                                                if (clean.startsWith('0092')) clean = clean.slice(2);
                                                else if (clean.startsWith('03')) clean = '92' + clean.slice(1);
                                                window.open(`https://wa.me/${clean}?text=${encodeURIComponent(text)}`, '_blank');
                                            }}
                                            style={{
                                                padding: '5px 10px',
                                                borderRadius: '7px',
                                                background: '#f0fdf4',
                                                border: '1px solid #86efac',
                                                color: '#15803d',
                                                fontWeight: '700',
                                                fontSize: '0.73rem',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                            title="Message parent on WhatsApp"
                                        >
                                            💬 WhatsApp
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setAssessmentViewMode(assessmentViewMode === 'history' ? 'assessment' : 'history')}
                                        style={{
                                            padding: '5px 10px',
                                            borderRadius: '7px',
                                            background: '#eff6ff',
                                            border: '1px solid #93c5fd',
                                            color: '#0078d4',
                                            fontWeight: '700',
                                            fontSize: '0.73rem',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <Sparkles size={13} /> {assessmentViewMode === 'history' ? 'View Dues' : 'Reliability'}
                                    </button>
                                </div>
                            </div>

                            {/* SIBLING RADAR & MULTI-CHILD SELECTOR CHIPS */}
                            {detectedSiblings.length > 1 && (
                                <div style={{
                                    background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                                    borderRadius: '12px',
                                    padding: '0.75rem 0.9rem',
                                    border: '1.5px solid #7dd3fc',
                                    marginBottom: '1rem'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Users size={15} color="#0284c7" />
                                            <strong style={{ fontSize: '0.82rem', color: '#0369a1' }}>
                                                Family Sibling Hub ({detectedSiblings.length} Children) &bull; <span style={{ fontWeight: '600' }}>{officialFamilyFatherName}'s Household</span>
                                            </strong>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedSiblingIds(detectedSiblings.map(s => s.id))}
                                                style={{ fontSize: '0.7rem', fontWeight: '700', padding: '2px 7px', borderRadius: '5px', background: '#0284c7', color: '#ffffff', border: 'none', cursor: 'pointer' }}
                                            >
                                                Select All ({detectedSiblings.length})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedSiblingIds([activeChild.id])}
                                                style={{ fontSize: '0.7rem', fontWeight: '700', padding: '2px 7px', borderRadius: '5px', background: '#ffffff', color: '#0369a1', border: '1px solid #bae6fd', cursor: 'pointer' }}
                                            >
                                                Only {activeChild.name.split(' ')[0]}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Horizontal Interactive Sibling Cards */}
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                {detectedSiblings.map((sib, sIdx) => {
                                                    const isChecked = selectedSiblingIds.includes(sib.id);
                                                    const isActiveTab = (activeChild?.id || selectedStudent.id) === sib.id;
                                                    const curYear = new Date().getFullYear();
                                                    const tKey = `${curYear}-${String(selectedTargetMonthIdx + 1).padStart(2, '0')}`;
                                                    const isCurrentPaid = sib.monthlyFeeHistory?.[tKey]?.status === 'paid' || 
                                                        (Array.isArray(sib.paidMonths) && sib.paidMonths.includes(tKey)) ||
                                                        (sib.monthlyFeeStatus === 'paid' && selectedTargetMonthIdx === new Date().getMonth());
                                                    return (
                                                        <div
                                                            key={sib.id}
                                                            onClick={() => setActiveSiblingId(sib.id)}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.45rem',
                                                                padding: '0.45rem 0.75rem',
                                                                borderRadius: '9px',
                                                                background: isActiveTab ? '#ffffff' : isChecked ? '#f8fafc' : '#f1f5f9',
                                                                border: isActiveTab ? '2px solid #0284c7' : isChecked ? '1px solid #94a3b8' : '1px dashed #cbd5e1',
                                                                cursor: 'pointer',
                                                                boxShadow: isActiveTab ? '0 3px 8px rgba(2, 132, 199, 0.2)' : 'none',
                                                                transition: 'all 0.15s ease'
                                                            }}
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleSiblingSelection(sib.id);
                                                                }}
                                                                style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                                title={isChecked ? 'Included in combined family slip' : 'Excluded from family slip'}
                                                            >
                                                                {isChecked ? <CheckSquare size={16} color="#0284c7" /> : <Square size={16} color="#94a3b8" />}
                                                            </button>
                                                            <div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                                    <strong style={{ fontSize: '0.78rem', color: isActiveTab ? '#0284c7' : '#0f172a' }}>
                                                                        {sib.name}
                                                                    </strong>
                                                                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>({sib.className})</span>
                                                                </div>
                                                                <div style={{ fontSize: '0.68rem', fontWeight: '700', color: isCurrentPaid ? '#16a34a' : '#b91c1c' }}>
                                                                    {isCurrentPaid ? '✓ Paid' : `Due: Rs ${Number(sib.tuitionFee || 0).toLocaleString()}`}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                    </div>
                                </div>
                            )}

                            {/* ASSESSMENT VIEW: 12-MONTH MATRIX (ALWAYS VISIBLE & SYNCS WITH LEFT BREAKDOWN) */}
                            {assessmentViewMode === 'assessment' ? (
                                <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                            <CalendarDays size={18} color="#0f172a" />
                                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.01em' }}>
                                                2026 Monthly Status
                                            </h4>
                                            <span style={{ fontSize: '0.72rem', background: '#0f172a', color: '#ffffff', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>
                                                {activeChild?.name?.split(' ')[0] || selectedStudent?.name?.split(' ')[0] || 'Student'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', fontSize: '0.68rem', fontWeight: '900', flexWrap: 'wrap' }}>
                                            <span style={{ background: '#16a34a', color: '#ffffff', border: '1px solid #15803d', padding: '2px 8px', borderRadius: '6px', boxShadow: '0 2px 0 #15803d' }}>✓ Paid</span>
                                            <span style={{ background: '#f59e0b', color: '#ffffff', border: '1px solid #d97706', padding: '2px 8px', borderRadius: '6px', boxShadow: '0 2px 0 #b45309' }}>⏳ Due</span>
                                            <span style={{ background: '#dc2626', color: '#ffffff', border: '1px solid #b91c1c', padding: '2px 8px', borderRadius: '6px', boxShadow: '0 2px 0 #991b1b' }}>⚠ Overdue</span>
                                            <span style={{ background: '#94a3b8', color: '#ffffff', border: '1px solid #64748b', padding: '2px 8px', borderRadius: '6px', boxShadow: '0 2px 0 #475569' }}>⚪ Upcoming</span>
                                        </div>
                                    </div>

                                    {/* High-Contrast Status-Driven Solid 3D 12-Month Matrix Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.65rem', marginBottom: '0.85rem' }}>
                                        {studentReliabilityData?.monthlyHistory.map((m) => {
                                            const currentYear = new Date().getFullYear();
                                            const isSelected = selectedTargetMonthIdx === (m.monthNum - 1);
                                            const isRecentPaid = recentPaidMonthIdx === (m.monthNum - 1);
                                            
                                            // Status-Driven Solid 3D Color Themes
                                            let solidBg = '#e2e8f0';     // Upcoming Default (Light Grey)
                                            let darkBorder = '#cbd5e1';
                                            let shadowColor = '#94a3b8';
                                            let badgeBg = '#000000';
                                            let badgeColor = '#ffffff';
                                            let badgeBorder = '#000000';
                                            let badgeText = 'Upcoming';
                                            let badgeIcon = '⚪';

                                            if (m.status === 'paid') {
                                                solidBg = '#22c55e';      // Green for Fully Paid
                                                darkBorder = '#16a34a';
                                                shadowColor = '#15803d';
                                                badgeBg = '#14532d';
                                                badgeBorder = '#166534';
                                                badgeText = 'Paid';
                                                badgeIcon = '✓';
                                            } else if (m.status === 'pending') {
                                                solidBg = '#fb923c';      // Orange for Current Month Due / Pending
                                                darkBorder = '#ea580c';
                                                shadowColor = '#c2410c';
                                                badgeBg = '#7c2d12';
                                                badgeBorder = '#9a3412';
                                                badgeText = 'Due';
                                                badgeIcon = '⏳';
                                            } else if (m.status === 'overdue' || m.status === 'no_record') {
                                                solidBg = '#ef4444';      // Red for Previous Months Pending / Overdue
                                                darkBorder = '#dc2626';
                                                shadowColor = '#991b1b';
                                                badgeBg = '#7f1d1d';
                                                badgeBorder = '#991b1b';
                                                badgeText = m.status === 'no_record' ? 'Unpaid' : 'Overdue';
                                                badgeIcon = '⚠';
                                            } else if (m.status === 'partial') {
                                                solidBg = '#f97316';      // Warm Orange for Partial Paid
                                                darkBorder = '#ea580c';
                                                shadowColor = '#9a3412';
                                                badgeBg = '#7c2d12';
                                                badgeBorder = '#9a3412';
                                                badgeText = 'Partial';
                                                badgeIcon = '⚠️';
                                            } else if (m.status === 'pre_admission') {
                                                solidBg = '#cbd5e1';      // Muted Grey for Pre-Joining
                                                darkBorder = '#94a3b8';
                                                shadowColor = '#64748b';
                                                badgeBg = '#334155';
                                                badgeBorder = '#475569';
                                                badgeText = 'Pre-Join';
                                                badgeIcon = '🚫';
                                            }

                                            return (
                                                <div
                                                    key={m.monthNum}
                                                    onClick={() => m.status !== 'pre_admission' && handleMonthCardClick(m)}
                                                    style={{
                                                        background: solidBg,
                                                        border: isRecentPaid
                                                            ? '2.5px solid #14532d'
                                                            : isSelected
                                                            ? '2.5px solid #0078d4'
                                                            : `2px solid ${darkBorder}`,
                                                        borderBottom: isRecentPaid
                                                            ? '6px solid #14532d'
                                                            : isSelected
                                                            ? '6px solid #0055a0'
                                                            : `5px solid ${shadowColor}`,
                                                        borderRadius: '12px',
                                                        padding: '0.65rem 0.65rem',
                                                        cursor: m.status === 'pre_admission' ? 'default' : 'pointer',
                                                        transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                                                        boxShadow: isRecentPaid
                                                            ? '0 0 0 4px rgba(22, 163, 74, 0.5), 0 8px 0px #14532d, 0 14px 20px rgba(0,0,0,0.3)'
                                                            : isSelected
                                                            ? '0 0 0 3px rgba(0,120,212,0.45), 0 7px 0px #0055a0, 0 12px 18px rgba(0,78,152,0.28)'
                                                            : `0 4px 0px ${shadowColor}, 0 8px 14px rgba(0,0,0,0.15), inset 0 1.5px 0.5px rgba(255,255,255,0.6)`,
                                                        transform: isRecentPaid || isSelected ? 'translateY(-3px)' : 'none',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        justifyContent: 'space-between',
                                                        opacity: m.status === 'pre_admission' ? 0.68 : 1,
                                                        position: 'relative'
                                                    }}
                                                    title={m.status === 'pre_admission' ? `Student was not enrolled in ${m.monthFullName}` : `Click to switch cashier breakdown to ${m.monthFullName}`}
                                                >
                                                    <div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: '900', color: '#000000', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '4px', textShadow: '0 0.5px 0 rgba(255,255,255,0.4)' }}>
                                                                {m.monthName.toUpperCase()}
                                                                {isRecentPaid ? (
                                                                    <span style={{ fontSize: '0.58rem', background: '#14532d', color: '#ffffff', padding: '1px 5px', borderRadius: '4px', fontWeight: '900', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                                                                        PAID ✓
                                                                    </span>
                                                                ) : isSelected ? (
                                                                    <span style={{ fontSize: '0.58rem', background: '#0078d4', color: '#ffffff', padding: '1px 5px', borderRadius: '4px', fontWeight: '900', letterSpacing: '0.02em', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                                                                        ACTIVE
                                                                    </span>
                                                                ) : null}
                                                            </span>
                                                            <span style={{
                                                                fontSize: '0.64rem',
                                                                fontWeight: '900',
                                                                background: isRecentPaid ? '#14532d' : badgeBg,
                                                                color: '#ffffff',
                                                                border: `1px solid ${isRecentPaid ? '#166534' : badgeBorder}`,
                                                                padding: '1.5px 6px',
                                                                borderRadius: '6px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '2px',
                                                                boxShadow: '0 2px 0 rgba(0,0,0,0.3)'
                                                            }}>
                                                                {badgeIcon && <span style={{ color: '#ffffff' }}>{badgeIcon}</span>} {badgeText}
                                                            </span>
                                                        </div>

                                                        {/* Amount / Balance details in high-contrast solid 3D inset box with sharp black text */}
                                                        <div style={{
                                                            background: 'rgba(255, 255, 255, 0.90)',
                                                            backdropFilter: 'blur(2px)',
                                                            borderRadius: '8px',
                                                            padding: '0.35rem 0.5rem',
                                                            border: '1.5px solid rgba(0, 0, 0, 0.22)',
                                                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08), 0 2px 0 rgba(0,0,0,0.1)',
                                                            marginBottom: '0.45rem'
                                                        }}>
                                                            {m.status === 'partial' ? (
                                                                <div style={{ fontSize: '0.72rem', color: '#000000', fontWeight: '900' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <span style={{ color: '#000000' }}>Paid:</span>
                                                                        <strong style={{ color: '#047857', fontWeight: '900' }}>Rs {Number(m.paidAmount || 0).toLocaleString()}</strong>
                                                                    </div>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <span style={{ color: '#000000' }}>Due:</span>
                                                                        <strong style={{ color: '#b91c1c', fontWeight: '900' }}>Rs {Number(m.remainingBalance || 0).toLocaleString()}</strong>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem' }}>
                                                                    <span style={{ color: '#000000', fontWeight: '900', opacity: 0.85 }}>
                                                                        {m.status === 'paid' ? 'Cleared' : 'Fee Dues'}
                                                                    </span>
                                                                    <strong style={{ color: '#000000', fontWeight: '900', fontSize: '0.82rem' }}>
                                                                        Rs {Number(m.paidAmount || m.amount || activeChild?.tuitionFee || 0).toLocaleString()}
                                                                    </strong>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Direct Action 3D Buttons with White Icons & Sharp Typography */}
                                                    <div style={{ display: 'flex', gap: '4px', marginTop: '0.15rem' }}>
                                                        {(m.status === 'paid' || m.status === 'partial') && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const targetSt = activeChild || selectedStudent;
                                                                    const mKey = `${currentYear}-${String(m.monthNum).padStart(2, '0')}`;
                                                                    const mHist = targetSt?.monthlyFeeHistory?.[mKey];
                                                                    const mCustomItems = (mHist?.customItems || (targetSt?.individualActions || []).filter(a => a.status === 'paid' && (a.monthKey === mKey || a.month === m.monthFullName))).map(a => ({
                                                                        name: `🔒 ${a.title || a.name} (Custom Charge)`,
                                                                        amount: Number(a.amount || 0)
                                                                    }));

                                                                    const txToView = m.txData || {
                                                                        receiptNo: m.receiptNo || `REC-${m.monthNum}-${(activeChild?.rollNo || selectedStudent.rollNo || selectedStudent.id || '001')}`,
                                                                        studentId: selectedStudent.id,
                                                                        studentName: activeChild?.name || selectedStudent.name,
                                                                        rollNo: activeChild?.rollNo || selectedStudent.rollNo || '-',
                                                                        classId: activeChild?.classId || selectedStudent.classId,
                                                                        className: activeChild?.className || selectedStudent.className || 'Class',
                                                                        fatherName: officialFamilyFatherName || selectedStudent.fatherName || 'Parent / Guardian',
                                                                        fatherPhone: activeChild?.parentDetails?.fatherPhone || activeChild?.fatherPhone || selectedStudent.phone || '',
                                                                        items: [
                                                                            { name: `Monthly Tuition (${m.monthFullName} ${currentYear})`, amount: m.paidAmount || m.amount },
                                                                            ...mCustomItems
                                                                        ],
                                                                        totalPaid: m.paidAmount || m.amount,
                                                                        remainingBalance: m.remainingBalance || 0,
                                                                        paymentMode: m.paymentMode || 'Cash',
                                                                        targetMonthName: m.monthFullName,
                                                                        targetMonthIdx: m.monthNum - 1,
                                                                        targetYear: currentYear,
                                                                        dateString: m.paymentDateStr || new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
                                                                        timeString: '12:00 PM',
                                                                        collectedBy: 'Principal Office'
                                                                    };
                                                                    setReceiptData(txToView);
                                                                    setReceiptModalOpen(true);
                                                                }}
                                                                style={{
                                                                    flex: 1,
                                                                    padding: '3px 4px',
                                                                    borderRadius: '6px',
                                                                    background: '#000000',
                                                                    border: '1px solid #000000',
                                                                    borderBottom: '2.5px solid #000000',
                                                                    color: '#ffffff',
                                                                    fontSize: '0.65rem',
                                                                    fontWeight: '900',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '3px',
                                                                    boxShadow: '0 2px 0 rgba(0,0,0,0.35)',
                                                                    transition: 'all 0.1s ease'
                                                                }}
                                                                title="Print / View Payment Slip"
                                                            >
                                                                <Printer size={11} color="#ffffff" strokeWidth={2.5} /> <span style={{ color: '#ffffff' }}>Slip</span>
                                                            </button>
                                                        )}

                                                        {(() => {
                                                            const targetSt = activeChild || selectedStudent;
                                                            const mKey = `${currentYear}-${String(m.monthNum).padStart(2, '0')}`;
                                                            const mHist = targetSt?.monthlyFeeHistory?.[mKey];
                                                            const monthProofUrl = m.proofUrl || mHist?.proofUrl || m.txData?.proofUrl || null;
                                                            if (!monthProofUrl) return null;
                                                            return (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setProofModal({
                                                                            isOpen: true,
                                                                            url: monthProofUrl,
                                                                            title: `Payment Proof - ${targetSt?.name || 'Student'} (${m.monthFullName} ${currentYear})`
                                                                        });
                                                                    }}
                                                                    style={{
                                                                        padding: '3px 5px',
                                                                        borderRadius: '6px',
                                                                        background: '#0284c7',
                                                                        border: '1px solid #0369a1',
                                                                        borderBottom: '2.5px solid #075985',
                                                                        color: '#ffffff',
                                                                        fontSize: '0.65rem',
                                                                        fontWeight: '900',
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        gap: '2px',
                                                                        boxShadow: '0 2px 0 rgba(0,0,0,0.35)'
                                                                    }}
                                                                    title="View Online Payment Proof Slip"
                                                                >
                                                                    <span style={{ color: '#ffffff' }}>🖼️</span> <span style={{ color: '#ffffff' }}>Proof</span>
                                                                </button>
                                                            );
                                                        })()}

                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDownloadChallanForMonth(m);
                                                            }}
                                                            style={{
                                                                flex: 1,
                                                                padding: '3px 4px',
                                                                borderRadius: '6px',
                                                                background: '#000000',
                                                                border: '1px solid #000000',
                                                                borderBottom: '2.5px solid #000000',
                                                                color: '#ffffff',
                                                                fontSize: '0.65rem',
                                                                fontWeight: '900',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                gap: '3px',
                                                                boxShadow: '0 2px 0 rgba(0,0,0,0.35)',
                                                                transition: 'all 0.1s ease'
                                                            }}
                                                            title="Download Fee Bill / Challan PDF for Parents"
                                                        >
                                                            <FileText size={11} color="#ffffff" strokeWidth={2.5} /> <span style={{ color: '#ffffff' }}>{m.status === 'paid' ? 'Bill' : 'Challan'}</span>
                                                        </button>

                                                        {/* Mark as Historical Paid — visible on no_record and overdue cards */}
                                                        {(m.status === 'no_record' || m.status === 'overdue') && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setConfirmHistoricalModal({ monthData: m, student: activeChild || selectedStudent });
                                                                }}
                                                                style={{
                                                                    flex: 1,
                                                                    padding: '3px 4px',
                                                                    borderRadius: '6px',
                                                                    background: '#15803d',
                                                                    border: '1px solid #166534',
                                                                    borderBottom: '2.5px solid #14532d',
                                                                    color: '#ffffff',
                                                                    fontSize: '0.63rem',
                                                                    fontWeight: '900',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '3px',
                                                                    boxShadow: '0 2px 0 rgba(0,0,0,0.35)',
                                                                    transition: 'all 0.1s ease'
                                                                }}
                                                                title="Mark this month as Historically Paid (Principal override)"
                                                            >
                                                                <Check size={11} color="#ffffff" strokeWidth={3} /> <span style={{ color: '#ffffff' }}>Register</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Action Helper Prompt */}
                                    <div style={{
                                        background: '#f8fafc',
                                        border: '1.5px solid #cbd5e1',
                                        borderRadius: '10px',
                                        padding: '0.6rem 0.85rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        fontSize: '0.75rem'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#0f172a', fontWeight: '700' }}>
                                            <Sparkles size={14} color="#0f172a" />
                                            <span>Click any month to switch isolated data & sync cashier breakdown.</span>
                                        </div>
                                        <span style={{ fontSize: '0.72rem', fontWeight: '900', color: '#ffffff', background: '#0f172a', padding: '2px 8px', borderRadius: '6px' }}>
                                            Selected: {MONTH_NAMES[selectedTargetMonthIdx]}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                /* RELIABILITY SCORE & PAST RECEIPTS VIEW */
                                <div>
                                    <div style={{
                                        background: studentReliabilityData?.badgeBg || '#f0f9ff',
                                        border: `1.5px solid ${studentReliabilityData?.badgeBorder || '#93c5fd'}`,
                                        borderRadius: '10px',
                                        padding: '0.85rem 1rem',
                                        marginBottom: '1rem',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: studentReliabilityData?.badgeColor || '#0369a1', textTransform: 'uppercase' }}>
                                                Payment Reliability Score
                                            </span>
                                            <h4 style={{ margin: '2px 0 0', fontSize: '1.2rem', fontWeight: '900', color: studentReliabilityData?.badgeColor || '#0369a1' }}>
                                                {studentReliabilityData?.badgeLabel || 'Good Standing'}
                                            </h4>
                                            <span style={{ fontSize: '0.7rem', color: '#475569' }}>
                                                {studentReliabilityData?.onTimeRate}% On-Time Payment Record
                                            </span>
                                        </div>
                                        <div style={{
                                            fontSize: '1.6rem',
                                            fontWeight: '900',
                                            color: studentReliabilityData?.badgeColor || '#0078d4'
                                        }}>
                                            {studentReliabilityData?.score || 85}%
                                        </div>
                                    </div>

                                    <h5 style={{ fontSize: '0.78rem', fontWeight: '800', color: '#334155', margin: '0 0 0.4rem 0', textTransform: 'uppercase' }}>
                                        Recorded Receipts ({studentHistoryTxs.length})
                                    </h5>
                                    <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                        {studentHistoryTxs.length === 0 ? (
                                            <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>
                                                No receipts recorded yet for this student.
                                            </div>
                                        ) : (
                                            studentHistoryTxs.map((tx) => (
                                                <div key={tx.receiptNo || tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.75rem', borderBottom: '1px solid #f1f5f9' }}>
                                                    <div>
                                                        <strong style={{ fontSize: '0.75rem', color: '#0078d4' }}>{tx.receiptNo}</strong>
                                                        <span style={{ fontSize: '0.68rem', color: '#64748b', marginLeft: '6px' }}>{tx.dateString || 'Today'} &bull; {tx.paymentMode || 'Cash'}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <strong style={{ fontSize: '0.78rem', color: '#16a34a' }}>Rs {Number(tx.totalPaid || 0).toLocaleString()}</strong>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setReceiptData(tx);
                                                                setReceiptModalOpen(true);
                                                            }}
                                                            style={{ padding: '2px 6px', borderRadius: '4px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#0078d4', fontSize: '0.68rem', fontWeight: '700', cursor: 'pointer' }}
                                                        >
                                                            Slip
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* RIGHT PANEL WHEN NO STUDENT IS SELECTED OR IN INCOME/EXPENSE MODE: Today's Ledger */
                        <div className="card" style={{
                            background: '#ffffff',
                            borderRadius: '14px',
                            padding: '1.4rem',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {rightCardTab === 'fee_slips' ? (
                                        <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Clock size={16} color="#0078d4" /> Today's Fee Collections Log
                                        </h3>
                                    ) : (
                                        <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <TrendingUp size={16} color="#16a34a" /> Today's Income & Expenses
                                        </h3>
                                    )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '2px', borderRadius: '7px', border: '1px solid #e2e8f0' }}>
                                        <button
                                            type="button"
                                            onClick={() => setRightCardTab('fee_slips')}
                                            style={{
                                                padding: '3px 8px',
                                                borderRadius: '5px',
                                                border: 'none',
                                                background: rightCardTab === 'fee_slips' ? '#ffffff' : 'transparent',
                                                color: rightCardTab === 'fee_slips' ? '#0078d4' : '#64748b',
                                                fontWeight: '700',
                                                fontSize: '0.72rem',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Slips ({recentTransactions.length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRightCardTab('finances_breakdown')}
                                            style={{
                                                padding: '3px 8px',
                                                borderRadius: '5px',
                                                border: 'none',
                                                background: rightCardTab === 'finances_breakdown' ? '#ffffff' : 'transparent',
                                                color: rightCardTab === 'finances_breakdown' ? '#16a34a' : '#64748b',
                                                fontWeight: '700',
                                                fontSize: '0.72rem',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Ledger ({todayFinances.incomes.length + todayFinances.expenses.length})
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={rightCardTab === 'fee_slips' ? handleDownloadDailyReport : handleDownloadFinancesReport}
                                        style={{
                                            padding: '4px 9px',
                                            borderRadius: '6px',
                                            background: '#0078d4',
                                            color: '#ffffff',
                                            border: 'none',
                                            fontWeight: '700',
                                            fontSize: '0.72rem',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px'
                                        }}
                                    >
                                        <Download size={12} /> PDF
                                    </button>
                                </div>
                            </div>

                            {rightCardTab === 'fee_slips' ? (
                                loadingTransactions ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.82rem' }}>
                                        Loading today's receipts...
                                    </div>
                                ) : todayTransactions.length === 0 ? (
                                    <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem', background: '#f8fafc', borderRadius: '8px' }}>
                                        <p style={{ margin: 0, fontWeight: '700', color: '#64748b' }}>No fee collections recorded today yet.</p>
                                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Select a student on the left to collect fee and issue an instant receipt.</span>
                                    </div>
                                ) : (
                                    <div style={{ maxHeight: '340px', overflowY: 'auto' }} className="custom-scrollbar">
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                                                    <th style={{ padding: '0.45rem 0.65rem', color: '#475569', fontWeight: '700' }}>Slip #</th>
                                                    <th style={{ padding: '0.45rem 0.65rem', color: '#475569', fontWeight: '700' }}>Student</th>
                                                    <th style={{ padding: '0.45rem 0.65rem', color: '#475569', fontWeight: '700' }}>Class</th>
                                                    <th style={{ padding: '0.45rem 0.65rem', color: '#475569', fontWeight: '700' }}>Amount</th>
                                                    <th style={{ padding: '0.45rem 0.65rem', color: '#475569', fontWeight: '700' }}>Mode</th>
                                                    <th style={{ padding: '0.45rem 0.65rem', color: '#475569', fontWeight: '700', textAlign: 'right' }}>Slip</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {todayTransactions.map((tx) => (
                                                    <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '0.45rem 0.65rem', fontWeight: '700', color: '#0078d4' }}>{tx.receiptNo}</td>
                                                        <td style={{ padding: '0.45rem 0.65rem', fontWeight: '600', color: '#0f172a' }}>{tx.studentName}</td>
                                                        <td style={{ padding: '0.45rem 0.65rem', color: '#475569' }}>{tx.className}</td>
                                                        <td style={{ padding: '0.45rem 0.65rem', fontWeight: '700', color: '#16a34a' }}>Rs {Number(tx.totalPaid).toLocaleString()}</td>
                                                        <td style={{ padding: '0.45rem 0.65rem' }}>
                                                            <span style={{ color: '#0f172a', fontWeight: '600', fontSize: '0.72rem' }}>{tx.paymentMode || 'Cash'}</span>
                                                        </td>
                                                        <td style={{ padding: '0.45rem 0.65rem', textAlign: 'right' }}>
                                                            <div style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}>
                                                                {tx.proofUrl && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setProofModal({
                                                                            isOpen: true,
                                                                            url: tx.proofUrl,
                                                                            title: `${tx.studentName} (${tx.receiptNo}) - Proof Screenshot`
                                                                        })}
                                                                        style={{
                                                                            padding: '0.2rem 0.45rem',
                                                                            borderRadius: '5px',
                                                                            border: '1px solid #86efac',
                                                                            background: '#f0fdf4',
                                                                            color: '#15803d',
                                                                            fontWeight: '700',
                                                                            fontSize: '0.7rem',
                                                                            cursor: 'pointer'
                                                                        }}
                                                                        title="View Proof"
                                                                    >
                                                                        <Eye size={11} />
                                                                    </button>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setReceiptData(tx);
                                                                        setReceiptModalOpen(true);
                                                                    }}
                                                                    style={{
                                                                        padding: '0.2rem 0.45rem',
                                                                        borderRadius: '5px',
                                                                        border: '1px solid #cbd5e1',
                                                                        background: '#ffffff',
                                                                        color: '#0f172a',
                                                                        fontWeight: '700',
                                                                        fontSize: '0.7rem',
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '3px'
                                                                    }}
                                                                    title="Slip"
                                                                >
                                                                    <Printer size={11} /> Slip
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
                                /* Finances Breakdown (Incomes & Expenses) */
                                <div style={{ maxHeight: '340px', overflowY: 'auto' }} className="custom-scrollbar">
                                    {todayFinances.incomes.length === 0 && todayFinances.expenses.length === 0 ? (
                                        <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                                            No additional income or expense vouchers recorded today.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {todayFinances.incomes.map((inc) => (
                                                <div key={inc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '0.8rem' }}>
                                                    <div>
                                                        <div style={{ fontWeight: '700', color: '#166534' }}>{inc.category || inc.title || 'Income'}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{inc.remarks || inc.note || 'Direct Revenue'}</div>
                                                    </div>
                                                    <span style={{ fontWeight: '800', color: '#16a34a' }}>+Rs {Number(inc.amount || 0).toLocaleString()}</span>
                                                </div>
                                            ))}
                                            {todayFinances.expenses.map((exp) => (
                                                <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca', fontSize: '0.8rem' }}>
                                                    <div>
                                                        <div style={{ fontWeight: '700', color: '#991b1b' }}>{exp.category || exp.title || 'Expense'}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{exp.remarks || exp.note || 'School Outflow'}</div>
                                                    </div>
                                                    <span style={{ fontWeight: '800', color: '#dc2626' }}>-Rs {Number(exp.amount || 0).toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Proof Lightbox Modal */}
            <PaymentProofModal
                isOpen={proofModal.isOpen}
                onClose={() => setProofModal({ isOpen: false, url: '', title: '' })}
                proofUrl={proofModal.url}
                title={proofModal.title}
            />

            {/* Online Payment Detailed Review Modal */}
            {reviewModalSub && (
                <div 
                    onClick={() => setReviewModalSub(null)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)',
                        backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', zIndex: 10000, padding: '1rem'
                    }}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        className="card animate-fade-in-up"
                        style={{
                            background: '#ffffff', borderRadius: '16px', maxWidth: '720px', width: '100%',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', overflow: 'hidden',
                            border: '1px solid #cbd5e1', maxHeight: '90vh', display: 'flex', flexDirection: 'column'
                        }}
                    >
                        {/* Modal Header */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Smartphone size={20} color="#0078d4" />
                                    Review Online Payment Submission
                                </h3>
                                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                    Submitted {reviewModalSub.submittedAt ? new Date(reviewModalSub.submittedAt).toLocaleString() : 'Recently'}
                                </span>
                            </div>
                            <button
                                onClick={() => setReviewModalSub(null)}
                                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                            {/* Left: Student & Transaction Info */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {/* Student Info Box */}
                                <div style={{ background: '#f0f9ff', padding: '1rem', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
                                        Student Details
                                    </div>
                                    <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>
                                        {reviewModalSub.studentName}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#334155', marginTop: '2px' }}>
                                        {reviewModalSub.className} • Roll No: <strong>{reviewModalSub.rollNo || 'N/A'}</strong>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                                        Parent: {reviewModalSub.parentName || 'Parent'} ({reviewModalSub.parentPhone || '—'})
                                    </div>
                                </div>

                                {/* Payment Breakdown Box */}
                                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                        Payment Verification
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Amount Claimed:</span>
                                        <strong style={{ fontSize: '1.25rem', color: '#16a34a', fontWeight: '900' }}>
                                            Rs. {Number(reviewModalSub.amount || 0).toLocaleString()}
                                        </strong>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Payment Mode:</span>
                                        <span style={{
                                            fontSize: '0.75rem', fontWeight: '800', padding: '2px 8px', borderRadius: '6px',
                                            background: (reviewModalSub.paymentMethod || '').toLowerCase().includes('easypaisa') ? '#dcfce7' : (reviewModalSub.paymentMethod || '').toLowerCase().includes('jazzcash') ? '#fee2e2' : '#f3e8ff',
                                            color: (reviewModalSub.paymentMethod || '').toLowerCase().includes('easypaisa') ? '#15803d' : (reviewModalSub.paymentMethod || '').toLowerCase().includes('jazzcash') ? '#b91c1c' : '#7e22ce'
                                        }}>
                                            {reviewModalSub.paymentMethod || 'Online Transfer'}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Transaction ID:</span>
                                        <code style={{ fontSize: '0.82rem', fontWeight: '700', color: '#0f172a', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>
                                            {reviewModalSub.transactionId || 'Not Provided'}
                                        </code>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Target Month:</span>
                                        <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#0f172a' }}>
                                            {reviewModalSub.month || 'Current Month'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Payment Receipt Image Preview */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>Uploaded Receipt Slip</span>
                                    {reviewModalSub.proofUrl && (
                                        <a
                                            href={reviewModalSub.proofUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#0078d4', fontSize: '0.75rem', fontWeight: '700', textDecoration: 'none' }}
                                        >
                                            <ExternalLink size={13} /> Full Size
                                        </a>
                                    )}
                                </div>

                                <div style={{
                                    height: '240px', background: '#0f172a', borderRadius: '12px',
                                    overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: '1px solid #cbd5e1', position: 'relative'
                                }}>
                                    {reviewModalSub.proofUrl ? (
                                        <img
                                            src={reviewModalSub.proofUrl}
                                            alt="Proof Screenshot"
                                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                        />
                                    ) : (
                                        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                                            <ImageIcon size={32} style={{ margin: '0 auto 6px' }} />
                                            <p style={{ fontSize: '0.8rem', margin: 0 }}>No image uploaded</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer Actions: Approve / Re-upload / Reject */}
                        <div style={{
                            padding: '1.25rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem'
                        }}>
                            <button
                                onClick={() => setReviewModalSub(null)}
                                style={{
                                    padding: '0.65rem 1.25rem', borderRadius: '10px', border: '1px solid #cbd5e1',
                                    background: '#ffffff', color: '#475569', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer'
                                }}
                            >
                                Close
                            </button>

                            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRejectModalSubOnline(reviewModalSub);
                                        setRejectReasonOnline('');
                                    }}
                                    disabled={Boolean(processingOnlineId && processingOnlineId === reviewModalSub.id)}
                                    style={{
                                        padding: '0.65rem 1.1rem', borderRadius: '10px', border: '1px solid #fecaca',
                                        background: '#fef2f2', color: '#dc2626', fontWeight: '700', fontSize: '0.85rem',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem'
                                    }}
                                >
                                    <X size={15} /> Reject
                                </button>

                                <button
                                    onClick={() => {
                                        setReuploadModalSub(reviewModalSub);
                                        setReuploadReason('');
                                    }}
                                    disabled={processingOnlineId === reviewModalSub.id}
                                    style={{
                                        padding: '0.65rem 1.1rem', borderRadius: '10px', border: '1.5px solid #fde68a',
                                        background: '#fffbeb', color: '#b45309', fontWeight: '700', fontSize: '0.85rem',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem'
                                    }}
                                >
                                    <RotateCcw size={15} /> Request Re-upload
                                </button>

                                <button
                                    onClick={() => handleApproveOnlineSubmission(reviewModalSub)}
                                    disabled={processingOnlineId === reviewModalSub.id}
                                    style={{
                                        padding: '0.65rem 1.5rem', borderRadius: '10px', border: 'none',
                                        background: '#16a34a', color: '#ffffff', fontWeight: '800', fontSize: '0.85rem',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        boxShadow: '0 4px 12px rgba(22, 163, 74, 0.35)'
                                    }}
                                >
                                    {processingOnlineId === reviewModalSub.id ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <Check size={16} />
                                    )}
                                    <span>Approve & Mark Paid</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Re-upload Request Reason Modal */}
            {reuploadModalSub && (
                <div
                    onClick={() => setReuploadModalSub(null)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)',
                        backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', zIndex: 10001, padding: '1rem'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="card animate-fade-in-up"
                        style={{
                            background: '#ffffff', borderRadius: '16px', maxWidth: '480px', width: '100%',
                            padding: '1.5rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', border: '1px solid #cbd5e1'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <RotateCcw size={18} />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#92400e' }}>
                                Request Receipt Re-upload
                            </h3>
                        </div>

                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>
                            Notify the parent of <strong>{reuploadModalSub.studentName}</strong> to re-upload a clear receipt slip:
                        </p>

                        {/* Quick Reason Chips */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.85rem' }}>
                            {[
                                'Receipt slip screenshot is blurry / illegible',
                                'Transaction ID (TRX) is missing or cropped',
                                'Amount does not match the monthly tuition fee',
                                'Previous month receipt was uploaded by mistake'
                            ].map((preset, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setReuploadReason(preset)}
                                    style={{
                                        fontSize: '0.72rem', padding: '3px 8px', borderRadius: '6px',
                                        border: '1px solid #e2e8f0', background: '#f8fafc', color: '#334155',
                                        cursor: 'pointer', textAlign: 'left'
                                    }}
                                >
                                    + {preset}
                                </button>
                            ))}
                        </div>

                        <textarea
                            rows={3}
                            placeholder="Enter specific instructions or reason for parent..."
                            value={reuploadReason}
                            onChange={(e) => setReuploadReason(e.target.value)}
                            style={{
                                width: '100%', padding: '0.75rem', borderRadius: '10px',
                                border: '1.5px solid #cbd5e1', fontSize: '0.85rem', outline: 'none',
                                boxSizing: 'border-box', marginBottom: '1.25rem', fontFamily: 'inherit'
                            }}
                        />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                            <button
                                onClick={() => setReuploadModalSub(null)}
                                style={{
                                    padding: '0.55rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1',
                                    background: '#ffffff', color: '#475569', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmRequestReupload}
                                disabled={processingOnlineId === reuploadModalSub.id}
                                style={{
                                    padding: '0.55rem 1.25rem', borderRadius: '8px', border: 'none',
                                    background: '#d97706', color: '#ffffff', fontWeight: '800', fontSize: '0.85rem',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    boxShadow: '0 4px 10px rgba(217, 119, 6, 0.3)'
                                }}
                            >
                                {processingOnlineId === reuploadModalSub.id ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                                <span>Send Request</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
 
            {/* Reject Online Submission Reason Modal */}
            {rejectModalSubOnline && (
                <div
                    onClick={() => setRejectModalSubOnline(null)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)',
                        backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', zIndex: 10002, padding: '1rem'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="card animate-fade-in-up"
                        style={{
                            background: '#ffffff', borderRadius: '16px', maxWidth: '480px', width: '100%',
                            padding: '1.5rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', border: '1px solid #cbd5e1'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={18} />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#b91c1c' }}>
                                Reject Payment Submission
                            </h3>
                        </div>

                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.75rem' }}>
                            Rejecting payment of Rs. {Number(rejectModalSubOnline.amount || 0).toLocaleString()} for <strong>{rejectModalSubOnline.studentName}</strong>. Reason will be sent to parent:
                        </p>

                        {/* Quick Preset Chips */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.85rem' }}>
                            {[
                                'Transaction ID (TRX) not found in bank statement',
                                'Payment slip is blurry or unreadable',
                                'Paid amount is incorrect',
                                'Duplicate submission / already accounted for'
                            ].map((preset, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setRejectReasonOnline(preset)}
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
                            placeholder="Enter specific reason for rejecting this payment..."
                            value={rejectReasonOnline}
                            onChange={(e) => setRejectReasonOnline(e.target.value)}
                            style={{
                                width: '100%', padding: '0.75rem', borderRadius: '10px',
                                border: '1.5px solid #cbd5e1', fontSize: '0.85rem', outline: 'none',
                                boxSizing: 'border-box', marginBottom: '1.25rem', fontFamily: 'inherit'
                            }}
                        />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                            <button
                                type="button"
                                onClick={() => setRejectModalSubOnline(null)}
                                style={{
                                    padding: '0.55rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1',
                                    background: '#ffffff', color: '#475569', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmRejectOnlineSubmission}
                                disabled={Boolean(processingOnlineId && processingOnlineId === rejectModalSubOnline.id)}
                                style={{
                                    padding: '0.55rem 1.25rem', borderRadius: '8px', border: 'none',
                                    background: '#dc2626', color: '#ffffff', fontWeight: '800', fontSize: '0.85rem',
                                    cursor: processingOnlineId === rejectModalSubOnline.id ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    boxShadow: '0 4px 10px rgba(220, 38, 38, 0.3)',
                                    opacity: processingOnlineId === rejectModalSubOnline.id ? 0.6 : 1
                                }}
                            >
                                {processingOnlineId === rejectModalSubOnline.id ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                                <span>Confirm Reject</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ➕ New Action / Custom Fee Micro-Modal (Live Sync to Parent App) */}
            <NewActionModal
                isOpen={showNewActionModal}
                onClose={() => setShowNewActionModal(false)}
                onSave={handleAddCustomAction}
                isSaving={isSavingAction}
                targetMonthName={MONTH_NAMES[selectedTargetMonthIdx]}
            />

            {/* 🎯 Payment Success / Failure Result Popup Modal */}
            <PaymentResultModal
                isOpen={paymentResultModal.isOpen}
                onClose={() => {
                    const wasSuccess = paymentResultModal.isSuccess;
                    setPaymentResultModal({ isOpen: false, isSuccess: true, receiptData: null, errorMessage: '' });
                    if (wasSuccess) {
                        setCashierStep(1);
                    }
                }}
                isSuccess={paymentResultModal.isSuccess}
                receiptData={paymentResultModal.receiptData}
                errorMessage={paymentResultModal.errorMessage}
                schoolInfo={localSchoolInfo || schoolInfo}
            />

            {/* 📄 Fee Receipt Printable Voucher Modal */}
            {receiptModalOpen && receiptData && (
                <FeeReceiptModal
                    isOpen={receiptModalOpen}
                    onClose={() => {
                        setReceiptModalOpen(false);
                        setReceiptData(null);
                    }}
                    receiptData={receiptData}
                    schoolInfo={localSchoolInfo || schoolInfo}
                />
            )}
        </div>
    );
};

const Collections = () => {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const initialTab = searchParams.get('tab') || 'workflow';
    const [preselectedClassId, setPreselectedClassId] = useState(searchParams.get('classId') || '');
    const [preselectedStudentId, setPreselectedStudentId] = useState(searchParams.get('studentId') || '');
    const [activeTab, setActiveTab] = useState(initialTab);

    // Sync when URL query params change (e.g. from View Fee Card popup)
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const tab = params.get('tab');
        const cid = params.get('classId');
        const sid = params.get('studentId');
        if (tab) setActiveTab(tab);
        if (cid !== null) setPreselectedClassId(cid || '');
        if (sid !== null) setPreselectedStudentId(sid || '');
    }, [location.search]);

    const [classes, setClasses] = useState([]);
    const [schoolId, setSchoolId] = useState(() => {
        try {
            const manualSession = localStorage.getItem('manual_session');
            if (manualSession) {
                const userData = JSON.parse(manualSession);
                return userData?.schoolId || null;
            }
        } catch (e) {}
        return null;
    });
    const [loading, setLoading] = useState(false);
    const [currentAction, setCurrentAction] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [schoolInfo, setSchoolInfo] = useState({ name: 'School Report', logo: '' });
    
    // Fee Settings State
    const [feeSettings, setFeeSettings] = useState({ dueDate: '', penaltyAmount: '' });
    const [isSavingFeeSettings, setIsSavingFeeSettings] = useState(false);
    // Historical Paid Confirm Modal
    const [confirmHistoricalModal, setConfirmHistoricalModal] = useState(null); // null | { monthData, student }

    // Helper for Sort
    const getClassOrder = (name) => {
        if (!name || typeof name !== 'string') return 0;
        const lower = name.toLowerCase();
        if (lower.includes('nursery')) return -2;
        if (lower.includes('prep')) return -1;
        return parseInt(name.replace(/\D/g, '')) || 0;
    };

    // 1. Init School ID & Auth
    useEffect(() => {
        let isMounted = true;
        const resolveUser = async () => {
            // Priority 1: Manual Session (Instant synchronous / local)
            const manualSession = localStorage.getItem('manual_session');
            if (manualSession) {
                try {
                    const userData = JSON.parse(manualSession);
                    if (userData.schoolId && isMounted) {
                        setSchoolId(userData.schoolId);
                    }
                } catch (e) {
                    console.error("Manual session parse error", e);
                }
            }

            // Priority 2: Firebase Auth (Real source of truth for DB permissions)
            const unsubscribe = auth.onAuthStateChanged(async (user) => {
                if (!isMounted) return;

                if (user) {
                    try {
                        const token = await user.getIdTokenResult();
                        if (token.claims.schoolId) {
                            console.log("Resolved School ID from Auth:", token.claims.schoolId);
                            setSchoolId(token.claims.schoolId);
                        }
                    } catch (e) {
                        console.error("Claims error", e);
                    }
                }
            });
            return () => unsubscribe();
        };
        resolveUser();
        return () => { isMounted = false; };
    }, []);

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
        }, (err) => {
            console.warn("Classes listener warning:", err);
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
        }, (err) => {
            console.warn("FeeSettings listener warning:", err);
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
        }, (err) => {
            console.warn("Profile listener warning:", err);
        });

        return () => {
            unsubClasses();
            unsubAction();
            unsubFeeSettings();
            unsubProfile();
        };

    }, [schoolId]);

    // Mark a past month as Historically Paid (Principal-level override)
    const handleMarkHistoricalPaid = async (monthData, student) => {
        if (!student || !schoolId || !monthData) return;
        const amount = Number(student.tuitionFee || student.monthlyFee || 2000);
        const targetKey = monthData.targetMonthKey;
        setConfirmHistoricalModal(null);
        try {
            const { doc: fsDoc, updateDoc } = await import('firebase/firestore');
            const { db: fsDb } = await import('../firebase');
            const nowISO = new Date().toISOString();
            const payload = {
                [`monthlyFeeHistory.${targetKey}`]: {
                    status: 'paid',
                    paidAmount: amount,
                    remainingBalance: 0,
                    paidAt: nowISO,
                    paymentMode: 'Historical',
                    markedBy: 'Principal',
                    isHistorical: true
                }
            };
            const writes = [updateDoc(fsDoc(fsDb, 'schools', schoolId, 'students', student.id), payload).catch(() => {})];
            if (student.classId) {
                writes.push(updateDoc(fsDoc(fsDb, 'schools', schoolId, 'classes', student.classId, 'students', student.id), payload).catch(() => {}));
            }
            await Promise.all(writes);
        } catch (err) {
            console.warn('[MarkHistoricalPaid] Firestore error:', err);
        }
    };

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

    const [pendingOnlineCount, setPendingOnlineCount] = useState(0);

    useEffect(() => {
        if (!schoolId) return;
        const qSubs = query(collection(db, `schools/${schoolId}/paymentSubmissions`));
        const unsub = onSnapshot(qSubs, (snap) => {
            let pCount = 0;
            snap.forEach(d => {
                if ((d.data().status || 'pending') === 'pending') pCount++;
            });
            setPendingOnlineCount(pCount);
        }, (err) => console.error("Error listening to online submissions count:", err));
        return () => unsub();
    }, [schoolId]);

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
            }, (err) => {
                console.warn(`[Collections] Class ${cls.name} stats listener warning:`, err);
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
                    onClick={() => setActiveTab('onlineSubmissions')}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0.5rem 1rem', fontSize: '1.1rem', fontWeight: '700',
                        color: activeTab === 'onlineSubmissions' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: activeTab === 'onlineSubmissions' ? '3px solid var(--primary)' : '3px solid transparent',
                        transition: 'all 0.2s',
                        borderRadius: '0',
                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}
                >
                    <span>Online Submissions</span>
                    {pendingOnlineCount > 0 && (
                        <span style={{
                            background: '#f59e0b', color: 'white', fontSize: '0.75rem',
                            padding: '2px 8px', borderRadius: '12px', fontWeight: '800'
                        }}>
                            {pendingOnlineCount}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('monthlyMatrix')}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0.5rem 1rem', fontSize: '1.1rem', fontWeight: '700',
                        color: activeTab === 'monthlyMatrix' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: activeTab === 'monthlyMatrix' ? '3px solid var(--primary)' : '3px solid transparent',
                        transition: 'all 0.2s',
                        borderRadius: '0',
                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}
                >
                    <span>Monthly Fee Matrix</span>
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

            {activeTab === 'onlineSubmissions' && (
                <OnlineSubmissionsDashboard 
                    schoolId={schoolId} 
                    schoolInfo={schoolInfo} 
                    classes={classes}
                    feeSettings={feeSettings}
                />
            )}

            {activeTab === 'monthlyMatrix' && (
                <FeeArrearsMatrix
                    schoolId={schoolId}
                    classes={classes}
                    schoolInfo={schoolInfo}
                    feeSettings={feeSettings}
                    currentAction={currentAction}
                    onOpenNewActionModal={() => setShowModal(true)}
                    onDeleteAction={handleDeleteAction}
                    onSaveFeeSettings={handleSaveFeeSettings}
                    setFeeSettings={setFeeSettings}
                    isSavingFeeSettings={isSavingFeeSettings}
                />
            )}

            <ActionModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onSave={handleSaveAction}
                classes={classes}
            />

            {/* Historical Paid Confirm Modal */}
            {confirmHistoricalModal && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        background: 'rgba(15,23,42,0.55)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backdropFilter: 'blur(3px)'
                    }}
                    onClick={() => setConfirmHistoricalModal(null)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#ffffff',
                            borderRadius: '14px',
                            padding: '1.5rem',
                            width: '320px',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                            border: '1.5px solid #e2e8f0'
                        }}
                    >
                        <div style={{ marginBottom: '0.75rem' }}>
                            <span style={{ fontSize: '1.5rem' }}>🏛️</span>
                            <h3 style={{ margin: '0.4rem 0 0.25rem', fontSize: '1rem', fontWeight: '900', color: '#0f172a' }}>
                                Register as Historical Paid
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                                This month will be marked as <strong>"Paid"</strong> in the records. This is a manual historical entry — no transaction will be created.
                            </p>
                        </div>

                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.85rem', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: '800' }}>
                                <span style={{ color: '#64748b' }}>Month:</span>
                                <span style={{ color: '#0f172a' }}>{confirmHistoricalModal.monthData?.monthFullName} {new Date().getFullYear()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: '800', marginTop: '4px' }}>
                                <span style={{ color: '#64748b' }}>Amount:</span>
                                <span style={{ color: '#0f172a' }}>Rs {Number(confirmHistoricalModal.student?.tuitionFee || confirmHistoricalModal.student?.monthlyFee || 2000).toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: '800', marginTop: '4px' }}>
                                <span style={{ color: '#64748b' }}>Student:</span>
                                <span style={{ color: '#0f172a' }}>{confirmHistoricalModal.student?.name || '—'}</span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => setConfirmHistoricalModal(null)}
                                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: '800', fontSize: '0.85rem', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => handleMarkHistoricalPaid(confirmHistoricalModal.monthData, confirmHistoricalModal.student)}
                                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', background: '#0f172a', color: '#ffffff', fontWeight: '900', fontSize: '0.85rem', cursor: 'pointer' }}
                            >
                                ✓ Confirm & Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Collections;
