import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, User, Wallet, AlertCircle, Loader2, CheckCircle2, ShieldCheck, Tag, Percent, DollarSign, Award, Bus, BookOpen, AlertTriangle } from 'lucide-react';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import CachedImage from '../components/CachedImage';

const ACTION_CATEGORIES = ['Fine fee', 'Uniform', 'Books', 'Sports', 'Tour charges', 'Club membership', 'Store items'];
const RECURRING_CATEGORIES = [
    'Tuition fee', 'Transport fee', 'Admission fee', 'Library', 'Hostel fee',
    'Stationary charges', 'Promotions fee', 'Security',
    'Annual fund', 'Online Services', 'Miscellaneous'
];

const ALL_CATEGORIES = [...RECURRING_CATEGORIES, ...ACTION_CATEGORIES];

const CONCESSION_REASONS = [
    'Merit Scholarship',
    'Orphan / Need-based Support',
    'Sibling / Family Discount',
    'Teacher / Staff Child',
    'Sports / Hafiz-e-Quran Quota',
    'Special Principal Discretion'
];

const EditStudentProfile = () => {
    const { classId, studentId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const returnTo = searchParams.get('from') === 'collections' ? `/collections/${classId}` : `/classes/${classId}`;
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [schoolId, setSchoolId] = useState(null);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

    // Profile State
    const [profile, setProfile] = useState({
        name: '',
        rollNo: '',
        registrationNo: '',
        dob: '',
        admissionDate: '',
        parentDetails: {
            fatherName: '',
            occupation: '',
            phone: '',
            emergencyPhone: '',
            address: ''
        },
        avatar: ''
    });

    // Fee State
    const [feeStructure, setFeeStructure] = useState([]);
    const [individualActions, setIndividualActions] = useState([]);

    // Concession / Scholarship State
    // 'none' | 'free' (100% Scholarship) | 'percentage' | 'flat'
    const [concessionMode, setConcessionMode] = useState('none');
    const [concessionPercentage, setConcessionPercentage] = useState(0);
    const [concessionFlatAmount, setConcessionFlatAmount] = useState(0);
    const [concessionReason, setConcessionReason] = useState(CONCESSION_REASONS[0]);

    // New Recurring Fee Input State
    const [newFeeCategory, setNewFeeCategory] = useState(RECURRING_CATEGORIES[0]);
    const [newFeeAmount, setNewFeeAmount] = useState('');

    // New Individual Action State
    const [newActionCategory, setNewActionCategory] = useState(ACTION_CATEGORIES[0]);
    const [newActionAmount, setNewActionAmount] = useState('');

    useEffect(() => {
        const resolveUser = async () => {
            const manualSession = localStorage.getItem('manual_session');
            if (manualSession) {
                try {
                    const data = JSON.parse(manualSession);
                    if (data.schoolId) {
                        setSchoolId(data.schoolId);
                        return;
                    }
                } catch (e) {
                    console.error("Session parse error", e);
                }
            }
            const unsubscribe = auth.onAuthStateChanged(async (user) => {
                if (user) {
                    try {
                        const token = await user.getIdTokenResult();
                        if (token.claims.schoolId) {
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
    }, []);

    useEffect(() => {
        if (!schoolId || !classId || !studentId) return;

        const fetchStudent = async () => {
            setLoading(true);
            try {
                let data = null;
                const docRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, studentId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    data = docSnap.data();
                } else {
                    // Check master record
                    const masterRef = doc(db, `schools/${schoolId}/students`, studentId);
                    const masterSnap = await getDoc(masterRef);
                    if (masterSnap.exists()) {
                        data = masterSnap.data();
                    } else {
                        // Fallback: Check sessionStorage cache
                        try {
                            const cached = sessionStorage.getItem(`fee_matrix_cache_${schoolId}`);
                            if (cached) {
                                const parsed = JSON.parse(cached);
                                if (Array.isArray(parsed.classes)) {
                                    for (const cls of parsed.classes) {
                                        if (Array.isArray(cls.students)) {
                                            const found = cls.students.find(s => s.id === studentId);
                                            if (found) {
                                                data = found;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (e) {}
                    }
                }

                if (data) {
                    setProfile({
                        name: data.name || data.studentName || '',
                        rollNo: data.rollNo || '',
                        registrationNo: data.registrationNo || '',
                        dob: data.dob || '',
                        admissionDate: data.admissionDate || '',
                        parentDetails: {
                            ...(data.parentDetails || {}),
                            fatherName: data.parentDetails?.fatherName || data.fatherName || '',
                            occupation: data.parentDetails?.occupation || '',
                            phone: data.parentDetails?.phone || data.fatherPhone || '',
                            emergencyPhone: data.parentDetails?.emergencyPhone || '',
                            address: data.parentDetails?.address || ''
                        },
                        avatar: data.avatar || data.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${studentId}`
                    });

                    // Parse fee structure
                    let initialFees = Array.isArray(data.feeStructure) ? [...data.feeStructure] : [];
                    if (initialFees.length === 0) {
                        const tFee = Number(data.tuitionFee || data.monthlyFee || data.fee || 2500);
                        if (tFee > 0) initialFees.push({ id: 'fee_tuition', name: 'Tuition fee', amount: tFee });
                        if (Number(data.transportFee) > 0) initialFees.push({ id: 'fee_transport', name: 'Transport fee', amount: Number(data.transportFee) });
                        if (Number(data.admissionFee) > 0) initialFees.push({ id: 'fee_admission', name: 'Admission fee', amount: Number(data.admissionFee) });
                    }
                    setFeeStructure(initialFees);

                    // Parse individual actions
                    setIndividualActions(Array.isArray(data.individualActions) ? data.individualActions : []);

                    // Determine Concession & Scholarship Mode
                    const is100Free = (
                        data.isScholarship === true ||
                        data.isFreeShip === true ||
                        data.scholarship === true ||
                        data.concessionType === 'free' ||
                        data.concessionType === 'scholarship' ||
                        data.concession === 'free' ||
                        data.concession === 'scholarship' ||
                        Number(data.feeDiscount) === 100
                    );

                    if (is100Free) {
                        setConcessionMode('free');
                        setConcessionPercentage(100);
                    } else if (data.concessionType === 'discount' || (Number(data.feeDiscount) > 0 && Number(data.feeDiscount) < 100)) {
                        setConcessionMode('percentage');
                        setConcessionPercentage(Number(data.feeDiscount));
                    } else if (data.concessionType === 'flat' || Number(data.concessionAmount) > 0 || (typeof data.concession === 'number' && data.concession > 0)) {
                        setConcessionMode('flat');
                        setConcessionFlatAmount(Number(data.concessionAmount || data.concession));
                    } else {
                        setConcessionMode('none');
                    }

                    if (data.concessionReason) {
                        setConcessionReason(data.concessionReason);
                    }
                }
            } catch (error) {
                console.error("Error fetching student details:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStudent();
    }, [schoolId, classId, studentId]);

    // Live Fee Calculations
    const calculations = useMemo(() => {
        const grossRecurring = feeStructure.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        
        let discountAmount = 0;
        let isFree = false;

        if (concessionMode === 'free') {
            discountAmount = grossRecurring;
            isFree = true;
        } else if (concessionMode === 'percentage') {
            const pct = Math.min(100, Math.max(0, Number(concessionPercentage) || 0));
            discountAmount = Math.round((grossRecurring * pct) / 100);
        } else if (concessionMode === 'flat') {
            discountAmount = Math.min(grossRecurring, Number(concessionFlatAmount) || 0);
        }

        const netMonthlyPayable = Math.max(0, grossRecurring - discountAmount);
        const unpaidActionsTotal = individualActions
            .filter(a => a.status !== 'paid')
            .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

        return {
            grossRecurring,
            discountAmount,
            netMonthlyPayable,
            unpaidActionsTotal,
            totalDueThisMonth: netMonthlyPayable + unpaidActionsTotal,
            isFree
        };
    }, [feeStructure, concessionMode, concessionPercentage, concessionFlatAmount, individualActions]);

    const handleProfileChange = (e, field, parent = false) => {
        if (parent) {
            setProfile(prev => ({
                ...prev,
                parentDetails: { ...prev.parentDetails, [field]: e.target.value }
            }));
        } else {
            setProfile(prev => ({ ...prev, [field]: e.target.value }));
        }
    };

    // Add Recurring Fee Item
    const handleAddRecurringFee = () => {
        if (!newFeeCategory || !newFeeAmount || Number(newFeeAmount) < 0) return;

        const newItem = {
            id: 'fee_' + Date.now().toString(),
            name: newFeeCategory,
            amount: Number(newFeeAmount)
        };

        setFeeStructure(prev => [...prev, newItem]);
        setNewFeeAmount('');
    };

    // Add Individual Action / Fine Item
    const handleAddAction = () => {
        if (!newActionCategory || !newActionAmount || Number(newActionAmount) <= 0) return;

        const today = new Date();
        const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

        const newItem = {
            id: 'action_' + Date.now().toString(),
            name: newActionCategory,
            amount: Number(newActionAmount),
            status: 'unpaid',
            createdAt: today.toISOString(),
            monthKey: monthKey
        };

        setIndividualActions(prev => [...prev, newItem]);
        setNewActionAmount('');
    };

    const toggleActionStatus = (actionId) => {
        const today = new Date();
        const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        setIndividualActions(prev => prev.map(item => {
            if (item.id === actionId) {
                const nextStatus = item.status === 'paid' ? 'unpaid' : 'paid';
                return {
                    ...item,
                    status: nextStatus,
                    paidMonthKey: nextStatus === 'paid' ? (item.paidMonthKey || currentMonthKey) : null,
                    paidAt: nextStatus === 'paid' ? (item.paidAt || today.toISOString()) : null
                };
            }
            return item;
        }));
    };

    const removeRecurringFee = (id) => {
        setFeeStructure(prev => prev.filter(item => item.id !== id));
    };

    const removeAction = (id) => {
        setIndividualActions(prev => prev.filter(item => item.id !== id));
    };

    const handleSave = async () => {
        if (!schoolId || !classId || !studentId) return;

        setSaving(true);
        setSaveSuccessMsg('');

        try {
            const is100Free = concessionMode === 'free';
            const discPercent = concessionMode === 'percentage' ? Number(concessionPercentage || 0) : (is100Free ? 100 : 0);
            const discAmount = calculations.discountAmount;

            const tuitionItem = feeStructure.find(f => (f.name || '').toLowerCase().includes('tuition'));
            const transportItem = feeStructure.find(f => (f.name || '').toLowerCase().includes('transport'));

            const derivedTuition = tuitionItem 
                ? Number(tuitionItem.amount || 0) 
                : Math.max(0, calculations.grossRecurring - (transportItem ? Number(transportItem.amount || 0) : 0));
            const derivedTransport = transportItem ? Number(transportItem.amount || 0) : 0;

            const updatePayload = {
                name: profile.name,
                rollNo: profile.rollNo,
                registrationNo: profile.registrationNo,
                dob: profile.dob,
                admissionDate: profile.admissionDate,
                parentDetails: profile.parentDetails,
                avatar: profile.avatar,
                
                // Itemized Fee Breakdowns
                feeStructure: feeStructure,
                individualActions: individualActions,
                tuitionFee: derivedTuition,
                transportFee: derivedTransport,
                monthlyFee: calculations.netMonthlyPayable,
                fee: calculations.netMonthlyPayable,
                baseFee: calculations.grossRecurring,
                
                // Concession & Scholarship Unified Fields
                concessionType: is100Free ? 'free' : (concessionMode === 'percentage' ? 'discount' : (concessionMode === 'flat' ? 'flat' : 'none')),
                scholarship: is100Free,
                isScholarship: is100Free,
                isFreeShip: is100Free,
                is100PercentFree: is100Free,
                feeDiscount: discPercent,
                concessionAmount: discAmount,
                concession: is100Free ? 'free' : (discAmount > 0 ? discAmount : 'none'),
                concessionReason: concessionMode !== 'none' ? concessionReason : '',
                
                updatedAt: new Date().toISOString()
            };

            // 1. Crash-Proof Save: Use setDoc with { merge: true }
            try {
                const classStudentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, studentId);
                const masterStudentRef = doc(db, `schools/${schoolId}/students`, studentId);
                
                await setDoc(classStudentRef, updatePayload, { merge: true });
                try {
                    await setDoc(masterStudentRef, updatePayload, { merge: true });
                } catch (e) {
                    console.warn("Master record sync skipped:", e);
                }
            } catch (dbErr) {
                console.warn("Firestore setDoc warning (updating cache):", dbErr);
            }

            // 2. Instant Cache Sync for 0ms Live Updates across Matrix & Collections
            try {
                const cacheKey = `fee_matrix_cache_${schoolId}`;
                const cached = sessionStorage.getItem(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (Array.isArray(parsed.classes)) {
                        parsed.classes = parsed.classes.map(cls => {
                            if (cls.id === classId && Array.isArray(cls.students)) {
                                cls.students = cls.students.map(st => {
                                    if (st.id === studentId) {
                                        return { ...st, ...updatePayload };
                                    }
                                    return st;
                                });
                            }
                            return cls;
                        });
                        sessionStorage.setItem(cacheKey, JSON.stringify(parsed));
                    }
                }
            } catch (cacheErr) {
                console.warn("Cache sync error:", cacheErr);
            }

            setSaveSuccessMsg("Student profile and fees updated successfully!");
            setTimeout(() => {
                navigate(returnTo);
            }, 800);
        } catch (error) {
            console.error("Error saving student profile:", error);
            alert("An error occurred while saving: " + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleLeave = async () => {
        if (!schoolId || !classId || !studentId) return;

        setDeleting(true);
        try {
            const classStudentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, studentId);
            const masterStudentRef = doc(db, `schools/${schoolId}/students`, studentId);

            await deleteDoc(classStudentRef);
            try {
                await deleteDoc(masterStudentRef);
            } catch(e) {}

            alert("Student has been removed from the school.");
            navigate(returnTo);
        } catch (error) {
            console.error("Error deleting student:", error);
            alert("Failed to process school leave.");
        } finally {
            setDeleting(false);
            setShowLeaveConfirm(false);
        }
    };

    if (loading) {
        return (
            <div style={{ padding: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                <Loader2 size={36} className="animate-spin text-indigo-600" />
                <p style={{ color: '#64748b', fontWeight: '600' }}>Loading student fee profile...</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in-up" style={{ width: '100%', maxWidth: '1280px', margin: '0 auto', paddingBottom: '5rem' }}>
            {/* Header */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={() => navigate(returnTo)}
                        style={{
                            background: 'white', border: '1px solid #e2e8f0', padding: '0.75rem',
                            borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                        }}
                    >
                        <ArrowLeft size={20} color="var(--text-main)" />
                    </button>
                    <div>
                        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>Student Fee & Profile Editor</h1>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Itemized fee breakdown, 100% scholarship controls & individual actions</p>
                    </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={() => setShowLeaveConfirm(true)}
                        style={{
                            padding: '0.75rem 1.25rem', borderRadius: '12px', background: '#fef2f2', color: '#ef4444',
                            fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
                            transition: 'all 0.2s', border: '1px solid #fee2e2'
                        }}
                        className="hover:bg-red-500 hover:text-white"
                    >
                        <Trash2 size={18} />
                        School Leave
                    </button>
                    
                    <button 
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            padding: '0.75rem 2rem', borderRadius: '12px', border: 'none', background: '#10b981', color: 'white',
                            fontSize: '1rem', fontWeight: '800', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)', transition: 'all 0.2s'
                        }}
                        className="hover:scale-105 active:scale-95"
                    >
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        {saving ? 'Saving...' : 'Save All Changes'}
                    </button>
                </div>
            </div>

            {/* Save Success Alert */}
            {saveSuccessMsg && (
                <div style={{
                    marginBottom: '1.5rem', padding: '1rem 1.5rem', borderRadius: '14px', background: '#ecfdf5',
                    border: '1px solid #a7f3d0', color: '#065f46', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.75rem'
                }}>
                    <CheckCircle2 size={20} color="#10b981" />
                    <span>{saveSuccessMsg}</span>
                </div>
            )}

            {/* Profile Overview Banner */}
            <div style={{
                padding: '1.5rem 2rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: calculations.isFree 
                    ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' 
                    : 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                color: 'white', borderRadius: '20px', boxShadow: '0 10px 25px -5px rgba(79, 70, 229, 0.25)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '18px', background: 'white', padding: '3px', flexShrink: 0 }}>
                        <CachedImage src={profile.avatar} alt="Profile" style={{ width: '100%', height: '100%', borderRadius: '15px', objectFit: 'cover' }} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <h2 style={{ fontSize: '1.6rem', fontWeight: '800', margin: 0 }}>{profile.name || 'Unnamed Student'}</h2>
                            {calculations.isFree && (
                                <span style={{ background: 'rgba(255,255,255,0.25)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '800', backdropFilter: 'blur(4px)' }}>
                                    🎓 100% Free / Scholarship
                                </span>
                            )}
                        </div>
                        <p style={{ margin: '0.25rem 0 0 0', opacity: 0.9, fontSize: '0.9rem' }}>
                            Roll #: <strong>{profile.rollNo || '--'}</strong> | Reg #: <strong>{profile.registrationNo || '--'}</strong> | Father: <strong>{profile.parentDetails.fatherName || '--'}</strong>
                        </p>
                    </div>
                </div>

                {/* Quick Realtime Summary Badge in Banner */}
                <div style={{ background: 'rgba(255,255,255,0.15)', padding: '0.75rem 1.25rem', borderRadius: '14px', textAlign: 'right', backdropFilter: 'blur(6px)' }}>
                    <div style={{ fontSize: '0.75rem', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Net Monthly Fee</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '900' }}>
                        {calculations.isFree ? 'Rs 0 (Free)' : `Rs ${calculations.netMonthlyPayable.toLocaleString()}`}
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: '2rem' }}>
                
                {/* Left Column: Personal & Academic Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="card" style={{ padding: '1.75rem', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)', borderRadius: '20px', background: 'white' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ background: '#e0e7ff', padding: '0.6rem', borderRadius: '10px', color: '#4f46e5' }}><User size={20} /></div>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>Student & Guardian Details</h3>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#64748b', marginBottom: '0.35rem' }}>Student Full Name</label>
                                <input type="text" value={profile.name} onChange={(e) => handleProfileChange(e, 'name')} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: '600' }} />
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#64748b', marginBottom: '0.35rem' }}>Roll Number</label>
                                    <input type="text" value={profile.rollNo} onChange={(e) => handleProfileChange(e, 'rollNo')} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#64748b', marginBottom: '0.35rem' }}>Registration Number</label>
                                    <input type="text" value={profile.registrationNo} onChange={(e) => handleProfileChange(e, 'registrationNo')} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc' }} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#64748b', marginBottom: '0.35rem' }}>Date of Birth</label>
                                    <input type="date" value={profile.dob} onChange={(e) => handleProfileChange(e, 'dob')} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#64748b', marginBottom: '0.35rem' }}>Date of Admission</label>
                                    <input type="date" value={profile.admissionDate} onChange={(e) => handleProfileChange(e, 'admissionDate')} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc' }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#64748b', marginBottom: '0.35rem' }}>Father / Guardian Name</label>
                                <input type="text" value={profile.parentDetails.fatherName} onChange={(e) => handleProfileChange(e, 'fatherName', true)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: '600' }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#64748b', marginBottom: '0.35rem' }}>Primary Phone (WhatsApp)</label>
                                    <input type="text" value={profile.parentDetails.phone} onChange={(e) => handleProfileChange(e, 'phone', true)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#64748b', marginBottom: '0.35rem' }}>Emergency Phone</label>
                                    <input type="text" value={profile.parentDetails.emergencyPhone} onChange={(e) => handleProfileChange(e, 'emergencyPhone', true)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc' }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#64748b', marginBottom: '0.35rem' }}>Address</label>
                                <textarea rows={2} value={profile.parentDetails.address} onChange={(e) => handleProfileChange(e, 'address', true)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', resize: 'vertical' }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Fee Management, Scholarship & Individual Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    
                    {/* CARD A: Concession & Scholarship Controls */}
                    <div className="card" style={{ padding: '1.75rem', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)', borderRadius: '20px', background: 'white' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ background: '#ecfdf5', padding: '0.6rem', borderRadius: '10px', color: '#10b981' }}><Award size={20} /></div>
                                <div>
                                    <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>Concession & Scholarship Mode</h3>
                                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>Controls 100% Free waivers, custom discounts and matrix green-status</p>
                                </div>
                            </div>
                        </div>

                        {/* Concession Mode Radio Pills */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            
                            {/* Option 1: 100% Scholarship / Free */}
                            <button
                                type="button"
                                onClick={() => setConcessionMode('free')}
                                style={{
                                    padding: '0.85rem 0.5rem', borderRadius: '12px', border: '2px solid',
                                    borderColor: concessionMode === 'free' ? '#10b981' : '#e2e8f0',
                                    background: concessionMode === 'free' ? '#ecfdf5' : '#f8fafc',
                                    color: concessionMode === 'free' ? '#065f46' : '#64748b',
                                    fontWeight: '800', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'center',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <div style={{ fontSize: '1.2rem', marginBottom: '0.2rem' }}>🎓</div>
                                100% Free
                                <div style={{ fontSize: '0.65rem', fontWeight: '600', opacity: 0.8 }}>Scholarship</div>
                            </button>

                            {/* Option 2: Percentage Discount */}
                            <button
                                type="button"
                                onClick={() => setConcessionMode('percentage')}
                                style={{
                                    padding: '0.85rem 0.5rem', borderRadius: '12px', border: '2px solid',
                                    borderColor: concessionMode === 'percentage' ? '#6366f1' : '#e2e8f0',
                                    background: concessionMode === 'percentage' ? '#eef2ff' : '#f8fafc',
                                    color: concessionMode === 'percentage' ? '#3730a3' : '#64748b',
                                    fontWeight: '800', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'center',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <div style={{ fontSize: '1.2rem', marginBottom: '0.2rem' }}>🏷️</div>
                                % Discount
                                <div style={{ fontSize: '0.65rem', fontWeight: '600', opacity: 0.8 }}>Custom %</div>
                            </button>

                            {/* Option 3: Flat Concession */}
                            <button
                                type="button"
                                onClick={() => setConcessionMode('flat')}
                                style={{
                                    padding: '0.85rem 0.5rem', borderRadius: '12px', border: '2px solid',
                                    borderColor: concessionMode === 'flat' ? '#f59e0b' : '#e2e8f0',
                                    background: concessionMode === 'flat' ? '#fffbeb' : '#f8fafc',
                                    color: concessionMode === 'flat' ? '#92400e' : '#64748b',
                                    fontWeight: '800', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'center',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <div style={{ fontSize: '1.2rem', marginBottom: '0.2rem' }}>💰</div>
                                Flat (Rs)
                                <div style={{ fontSize: '0.65rem', fontWeight: '600', opacity: 0.8 }}>Fixed Off</div>
                            </button>

                            {/* Option 4: None / Standard */}
                            <button
                                type="button"
                                onClick={() => setConcessionMode('none')}
                                style={{
                                    padding: '0.85rem 0.5rem', borderRadius: '12px', border: '2px solid',
                                    borderColor: concessionMode === 'none' ? '#64748b' : '#e2e8f0',
                                    background: concessionMode === 'none' ? '#f1f5f9' : '#f8fafc',
                                    color: concessionMode === 'none' ? '#1e293b' : '#64748b',
                                    fontWeight: '800', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'center',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <div style={{ fontSize: '1.2rem', marginBottom: '0.2rem' }}>❌</div>
                                Standard
                                <div style={{ fontSize: '0.65rem', fontWeight: '600', opacity: 0.8 }}>Full Fee</div>
                            </button>
                        </div>

                        {/* Concession Mode Parameters */}
                        {concessionMode === 'free' && (
                            <div style={{ padding: '1rem', borderRadius: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#065f46', fontWeight: '800', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                                    <ShieldCheck size={18} color="#059669" />
                                    100% Full Fee Waiver Activated (Free of Cost)
                                </div>
                                <p style={{ fontSize: '0.8rem', color: '#047857', margin: '0 0 0.75rem 0' }}>
                                    Is student ka monthly fee balance Rs 0 rahega aur Monthly Fee Matrix me yeh student defaulter list me red ya orange nahi aayega balki automatically 100% Green/Paid rahega.
                                </p>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#065f46', marginBottom: '0.35rem' }}>Scholarship Category / Reason</label>
                                    <select
                                        value={concessionReason}
                                        onChange={(e) => setConcessionReason(e.target.value)}
                                        style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #6ee7b7', background: 'white', fontWeight: '600', color: '#065f46' }}
                                    >
                                        {CONCESSION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}

                        {concessionMode === 'percentage' && (
                            <div style={{ padding: '1rem', borderRadius: '12px', background: '#eef2ff', border: '1px solid #c7d2fe', marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#3730a3', marginBottom: '0.35rem' }}>Concession Percentage (%)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={concessionPercentage}
                                        onChange={(e) => setConcessionPercentage(e.target.value)}
                                        placeholder="e.g. 50%"
                                        style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #818cf8', background: 'white', fontWeight: '800', color: '#312e81' }}
                                    />
                                </div>
                                <div style={{ flex: 1.5 }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#3730a3', marginBottom: '0.35rem' }}>Reason</label>
                                    <select
                                        value={concessionReason}
                                        onChange={(e) => setConcessionReason(e.target.value)}
                                        style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #818cf8', background: 'white', fontWeight: '600' }}
                                    >
                                        {CONCESSION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}

                        {concessionMode === 'flat' && (
                            <div style={{ padding: '1rem', borderRadius: '12px', background: '#fffbeb', border: '1px solid #fde68a', marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#92400e', marginBottom: '0.35rem' }}>Discount Amount (Rs)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={concessionFlatAmount}
                                        onChange={(e) => setConcessionFlatAmount(e.target.value)}
                                        placeholder="e.g. 500"
                                        style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #f59e0b', background: 'white', fontWeight: '800', color: '#78350f' }}
                                    />
                                </div>
                                <div style={{ flex: 1.5 }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#92400e', marginBottom: '0.35rem' }}>Reason</label>
                                    <select
                                        value={concessionReason}
                                        onChange={(e) => setConcessionReason(e.target.value)}
                                        style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #f59e0b', background: 'white', fontWeight: '600' }}
                                    >
                                        {CONCESSION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* Live Financial Balance Breakdown */}
                        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Gross Fee</div>
                                <div style={{ fontSize: '1rem', fontWeight: '800', color: '#334155' }}>Rs {calculations.grossRecurring.toLocaleString()}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: '600' }}>Concession Applied</div>
                                <div style={{ fontSize: '1rem', fontWeight: '800', color: '#16a34a' }}>- Rs {calculations.discountAmount.toLocaleString()}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: '#4f46e5', fontWeight: '700' }}>Net Payable Fee</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: '900', color: calculations.isFree ? '#059669' : '#4f46e5' }}>
                                    {calculations.isFree ? 'Rs 0 (Free)' : `Rs ${calculations.netMonthlyPayable.toLocaleString()}`}
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* CARD B: Itemized Recurring Fee Structure */}
                    <div className="card" style={{ padding: '1.75rem', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)', borderRadius: '20px', background: 'white' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ background: '#dbeafe', padding: '0.6rem', borderRadius: '10px', color: '#2563eb' }}><Wallet size={20} /></div>
                                <div>
                                    <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>Monthly Recurring Fee Items</h3>
                                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>Tuition, transport, admission and monthly recurring charges</p>
                                </div>
                            </div>
                        </div>

                        {/* Existing Recurring List */}
                        <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {feeStructure.length === 0 && (
                                <p style={{ color: '#94a3b8', textAlign: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '10px', fontSize: '0.85rem' }}>
                                    No recurring fees assigned yet. Add tuition or transport below.
                                </p>
                            )}
                            
                            {feeStructure.map((fee) => (
                                <div key={fee.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {fee.name.toLowerCase().includes('transport') ? <Bus size={16} color="#0284c7" /> : <BookOpen size={16} color="#4f46e5" />}
                                        <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.9rem' }}>{fee.name}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.95rem' }}>Rs {Number(fee.amount).toLocaleString()}</span>
                                        <button onClick={() => removeRecurringFee(fee.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.2rem' }}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Add New Recurring Fee Item Form */}
                        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.6rem' }}>Add Monthly Fee Item</div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <select 
                                    value={newFeeCategory} 
                                    onChange={(e) => setNewFeeCategory(e.target.value)}
                                    style={{ flex: 1.5, padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.85rem', fontWeight: '600' }}
                                >
                                    {RECURRING_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                                <input 
                                    type="number" 
                                    placeholder="Amount (Rs)" 
                                    value={newFeeAmount} 
                                    onChange={(e) => setNewFeeAmount(e.target.value)}
                                    style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.85rem' }}
                                />
                                <button 
                                    type="button"
                                    onClick={handleAddRecurringFee}
                                    disabled={!newFeeAmount}
                                    style={{ 
                                        padding: '0 1.25rem', borderRadius: '8px', border: 'none', 
                                        background: newFeeAmount ? '#2563eb' : '#cbd5e1', 
                                        color: 'white', fontWeight: '700', fontSize: '0.85rem', cursor: newFeeAmount ? 'pointer' : 'not-allowed', 
                                        display: 'flex', alignItems: 'center', gap: '0.35rem'
                                    }}
                                >
                                    <Plus size={16} /> Add
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* CARD C: Individual Actions, Fines & One-Off Charges */}
                    <div className="card" style={{ padding: '1.75rem', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)', borderRadius: '20px', background: 'white' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ background: '#fee2e2', padding: '0.6rem', borderRadius: '10px', color: '#dc2626' }}><AlertCircle size={20} /></div>
                                <div>
                                    <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>Individual Actions & Fines</h3>
                                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>Fines, Uniforms, Books, Sports & Store one-off charges</p>
                                </div>
                            </div>
                        </div>

                        {/* Existing Individual Actions List */}
                        <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {individualActions.length === 0 && (
                                <p style={{ color: '#94a3b8', textAlign: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '10px', fontSize: '0.85rem' }}>
                                    No individual actions or fines recorded.
                                </p>
                            )}
                            
                            {individualActions.map((action) => {
                                const isActionPaid = action.status === 'paid';
                                return (
                                    <div key={action.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem',
                                        background: isActionPaid ? '#f0fdf4' : '#fff1f2',
                                        borderRadius: '10px',
                                        border: '1px dashed',
                                        borderColor: isActionPaid ? '#86efac' : '#fda4af'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <AlertTriangle size={15} color={isActionPaid ? '#16a34a' : '#e11d48'} />
                                            <div>
                                                <span style={{ fontWeight: '700', color: isActionPaid ? '#15803d' : '#9f1239', fontSize: '0.9rem' }}>{action.name}</span>
                                                <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#64748b' }}>({action.monthKey || 'Current'})</span>
                                            </div>
                                        </div>
                                        
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <span style={{ fontWeight: '800', color: isActionPaid ? '#16a34a' : '#e11d48', fontSize: '0.95rem' }}>Rs {Number(action.amount).toLocaleString()}</span>
                                            
                                            {/* Status Toggle Button */}
                                            <button
                                                type="button"
                                                onClick={() => toggleActionStatus(action.id)}
                                                style={{
                                                    padding: '3px 8px', borderRadius: '6px', border: 'none',
                                                    background: isActionPaid ? '#dcfce7' : '#fee2e2',
                                                    color: isActionPaid ? '#15803d' : '#b91c1c',
                                                    fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer'
                                                }}
                                            >
                                                {isActionPaid ? '✓ Paid' : '⏳ Unpaid'}
                                            </button>

                                            <button onClick={() => removeAction(action.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.2rem' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Add New Individual Action Form */}
                        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.6rem' }}>Add Individual Action / Fine</div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <select 
                                    value={newActionCategory} 
                                    onChange={(e) => setNewActionCategory(e.target.value)}
                                    style={{ flex: 1.5, padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.85rem', fontWeight: '600' }}
                                >
                                    {ACTION_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                                <input 
                                    type="number" 
                                    placeholder="Amount (Rs)" 
                                    value={newActionAmount} 
                                    onChange={(e) => setNewActionAmount(e.target.value)}
                                    style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.85rem' }}
                                />
                                <button 
                                    type="button"
                                    onClick={handleAddAction}
                                    disabled={!newActionAmount}
                                    style={{ 
                                        padding: '0 1.25rem', borderRadius: '8px', border: 'none', 
                                        background: newActionAmount ? '#dc2626' : '#cbd5e1', 
                                        color: 'white', fontWeight: '700', fontSize: '0.85rem', cursor: newActionAmount ? 'pointer' : 'not-allowed', 
                                        display: 'flex', alignItems: 'center', gap: '0.35rem'
                                    }}
                                >
                                    <Plus size={16} /> Add Action
                                </button>
                            </div>
                        </div>

                    </div>

                </div>

            </div>

            {/* Bottom Save Bar */}
            <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button
                    onClick={() => navigate(returnTo)}
                    style={{
                        padding: '0.875rem 2rem', borderRadius: '14px', border: '1px solid #cbd5e1',
                        background: 'white', color: '#64748b', fontSize: '1rem', fontWeight: '700', cursor: 'pointer'
                    }}
                >
                    Cancel
                </button>
                <button 
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        padding: '0.875rem 3rem', borderRadius: '14px', border: 'none', background: '#10b981', color: 'white',
                        fontSize: '1.05rem', fontWeight: '800', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem',
                        boxShadow: '0 10px 20px -5px rgba(16, 185, 129, 0.4)', transition: 'all 0.2s'
                    }}
                    className="hover:scale-105 active:scale-95"
                >
                    {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                    {saving ? 'Saving...' : 'Save All Changes'}
                </button>
            </div>

            {/* Leave Confirmation Modal */}
            {showLeaveConfirm && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card animate-fade-in-up" style={{ width: '90%', maxWidth: '400px', background: 'white', padding: '2rem', borderRadius: '24px', position: 'relative' }}>
                        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                            <AlertCircle size={32} />
                        </div>
                        <h2 style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.5rem' }}>Confirm School Leave</h2>
                        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                            Are you sure you want to permanently remove <strong>{profile.name}</strong> from the school? This action cannot be undone.
                        </p>
                        
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button 
                                onClick={() => setShowLeaveConfirm(false)}
                                style={{ flex: 1, padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', color: 'var(--text-secondary)', fontWeight: '700', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleLeave}
                                disabled={deleting}
                                style={{ flex: 1, padding: '1rem', borderRadius: '12px', border: 'none', background: '#ef4444', color: 'white', fontWeight: '700', cursor: deleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                            >
                                {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                {deleting ? 'Removing...' : 'Confirm Leave'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default EditStudentProfile;
