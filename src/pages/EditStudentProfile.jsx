import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, User, Wallet, AlertCircle, Loader2, X } from 'lucide-react';
import { db, auth } from '../firebase';
import { doc, getDoc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import CachedImage from '../components/CachedImage';

const ACTION_CATEGORIES = ['Fine fee', 'Uniform', 'Books', 'Sports', 'Tour charges', 'Club membership'];
const RECURRING_CATEGORIES = [
    'Admission fee', 'Tuition fee', 'Transport fee', 'Library', 'Hostel fee',
    'Stationary charges', 'Promotions fee', 'Concession', 'Security',
    'Miscellaneous', 'Annual fund'
];

const ALL_CATEGORIES = [...RECURRING_CATEGORIES, ...ACTION_CATEGORIES].sort();

const EditStudentProfile = () => {
    const { classId, studentId } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [schoolId, setSchoolId] = useState(null);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);

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

    // New Fee Input State
    const [newFeeCategory, setNewFeeCategory] = useState(ALL_CATEGORIES[0]);
    const [newFeeAmount, setNewFeeAmount] = useState('');

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
                const docRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, studentId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();

                    setProfile({
                        name: data.name || '',
                        rollNo: data.rollNo || '',
                        registrationNo: data.registrationNo || '',
                        dob: data.dob || '',
                        admissionDate: data.admissionDate || '',
                        parentDetails: {
                            fatherName: data.parentDetails?.fatherName || '',
                            occupation: data.parentDetails?.occupation || '',
                            phone: data.parentDetails?.phone || '',
                            emergencyPhone: data.parentDetails?.emergencyPhone || '',
                            address: data.parentDetails?.address || ''
                        },
                        avatar: data.avatar || data.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${studentId}`
                    });

                    // Parse legacy root fees into feeStructure if they exist but feeStructure doesn't
                    let initialFees = data.feeStructure || [];
                    if (initialFees.length === 0) {
                        if (data.tuitionFee) initialFees.push({ id: Date.now().toString() + '1', name: 'Tuition fee', amount: data.tuitionFee });
                        if (data.transportFee) initialFees.push({ id: Date.now().toString() + '2', name: 'Transport fee', amount: data.transportFee });
                        if (data.admissionFee) initialFees.push({ id: Date.now().toString() + '3', name: 'Admission fee', amount: data.admissionFee });
                    }
                    setFeeStructure(initialFees);

                    setIndividualActions(data.individualActions || []);
                }
            } catch (error) {
                console.error("Error fetching student details:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStudent();
    }, [schoolId, classId, studentId]);

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

    const handleAddFee = () => {
        if (!newFeeCategory || !newFeeAmount) return;

        const isAction = ACTION_CATEGORIES.includes(newFeeCategory);
        const newItem = {
            id: Date.now().toString(),
            name: newFeeCategory,
            amount: Number(newFeeAmount),
            ...(isAction ? { status: 'unpaid' } : {}) // Actions have a status
        };

        if (isAction) {
            setIndividualActions([...individualActions, newItem]);
        } else {
            setFeeStructure([...feeStructure, newItem]);
        }

        setNewFeeAmount('');
    };

    const removeFee = (id, isAction) => {
        if (isAction) {
            setIndividualActions(individualActions.filter(item => item.id !== id));
        } else {
            setFeeStructure(feeStructure.filter(item => item.id !== id));
        }
    };

    const handleSave = async () => {
        if (!schoolId || !classId || !studentId) return;

        // Check for Manual Bypass Read-Only
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            const session = JSON.parse(manualSession);
            if (session.isManual) {
                alert("Restricted: Manual Bypass Mode is Read-Only. Cannot save changes.");
                return;
            }
        }

        setSaving(true);
        try {
            const classStudentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, studentId);
            const masterStudentRef = doc(db, `schools/${schoolId}/students`, studentId);

            const updatePayload = {
                name: profile.name,
                rollNo: profile.rollNo,
                registrationNo: profile.registrationNo,
                dob: profile.dob,
                admissionDate: profile.admissionDate,
                parentDetails: profile.parentDetails,
                feeStructure: feeStructure,
                individualActions: individualActions
            };

            await updateDoc(classStudentRef, updatePayload);
            
            // Also attempt to update master record if it exists
            try {
                await updateDoc(masterStudentRef, updatePayload);
            } catch (err) {
                // If master doc doesn't exist, ignore
            }

            alert("Student profile updated successfully!");
            navigate(`/classes/${classId}`);
        } catch (error) {
            console.error("Error saving student profile:", error);
            alert("Failed to save changes.");
        } finally {
            setSaving(false);
        }
    };

    const handleLeave = async () => {
        if (!schoolId || !classId || !studentId) return;

        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            const session = JSON.parse(manualSession);
            if (session.isManual) {
                alert("Restricted: Manual Bypass Mode is Read-Only. Cannot delete students.");
                return;
            }
        }

        setDeleting(true);
        try {
            const classStudentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, studentId);
            const masterStudentRef = doc(db, `schools/${schoolId}/students`, studentId);

            await deleteDoc(classStudentRef);
            try {
                await deleteDoc(masterStudentRef);
            } catch(e) {}

            alert("Student has been removed from the school.");
            navigate(`/classes/${classId}`);
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
            <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
                <Loader2 size={32} className="animate-spin text-indigo-500" />
            </div>
        );
    }

    return (
        <div className="animate-fade-in-up" style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', paddingBottom: '4rem' }}>
            {/* Header */}
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={() => navigate(`/classes/${classId}`)}
                        style={{
                            background: 'white', border: '1px solid #e2e8f0', padding: '0.75rem',
                            borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        <ArrowLeft size={20} color="var(--text-main)" />
                    </button>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-main)' }}>Edit Student</h1>
                </div>
                <button
                    onClick={() => setShowLeaveConfirm(true)}
                    style={{
                        padding: '0.75rem 1.25rem', borderRadius: '12px', border: 'none', background: '#fef2f2', color: '#ef4444',
                        fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
                        transition: 'all 0.2s', border: '1px solid #fee2e2'
                    }}
                    className="hover:bg-red-500 hover:text-white"
                >
                    <Trash2 size={18} />
                    School Leave
                </button>
            </div>

            {/* Profile Overview Banner */}
            <div className="card" style={{ padding: '2rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1.5rem', background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)', color: 'white', borderRadius: '24px' }}>
                <div style={{ width: '100px', height: '100px', borderRadius: '20px', background: 'white', padding: '4px', flexShrink: 0 }}>
                    <CachedImage src={profile.avatar} alt="Profile" style={{ width: '100%', height: '100%', borderRadius: '16px', objectFit: 'cover' }} />
                </div>
                <div>
                    <h2 style={{ fontSize: '2rem', fontWeight: '800', margin: 0 }}>{profile.name || 'Unnamed Student'}</h2>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Card 1: Personal Details */}
                <div className="card" style={{ padding: '2rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', borderRadius: '24px', background: 'white' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid #f1f5f9' }}>
                        <div style={{ background: '#e0e7ff', padding: '0.75rem', borderRadius: '12px', color: '#4f46e5' }}><User size={24} /></div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>Personal Details</h3>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        {/* Left Column: Academic & Basic Info */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Student Name</label>
                                <input type="text" value={profile.name} onChange={(e) => handleProfileChange(e, 'name')} className="input-field" style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Roll No</label>
                                <input type="text" value={profile.rollNo} onChange={(e) => handleProfileChange(e, 'rollNo')} className="input-field" style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Registration No</label>
                                <input type="text" value={profile.registrationNo} onChange={(e) => handleProfileChange(e, 'registrationNo')} className="input-field" style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Date of Birth</label>
                                <input type="date" value={profile.dob} onChange={(e) => handleProfileChange(e, 'dob')} className="input-field" style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Date of Admission</label>
                                <input type="date" value={profile.admissionDate} onChange={(e) => handleProfileChange(e, 'admissionDate')} className="input-field" style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc' }} />
                            </div>
                        </div>

                        {/* Right Column: Parent & Contact Info */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Father Name</label>
                                <input type="text" value={profile.parentDetails.fatherName} onChange={(e) => handleProfileChange(e, 'fatherName', true)} className="input-field" style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Occupation</label>
                                <input type="text" value={profile.parentDetails.occupation} onChange={(e) => handleProfileChange(e, 'occupation', true)} className="input-field" style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Contact Number</label>
                                <input type="text" value={profile.parentDetails.phone} onChange={(e) => handleProfileChange(e, 'phone', true)} className="input-field" style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Emergency Phone</label>
                                <input type="text" value={profile.parentDetails.emergencyPhone} onChange={(e) => handleProfileChange(e, 'emergencyPhone', true)} className="input-field" style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc' }} placeholder="Optional" />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Address</label>
                                <textarea value={profile.parentDetails.address} onChange={(e) => handleProfileChange(e, 'address', true)} className="input-field" style={{ flex: 1, width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc', resize: 'vertical', minHeight: '110px' }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Card 2: Fee Structure */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div className="card" style={{ padding: '2rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', borderRadius: '24px', background: 'white' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid #f1f5f9' }}>
                            <div style={{ background: '#dcfce7', padding: '0.75rem', borderRadius: '12px', color: '#16a34a' }}><Wallet size={24} /></div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>Fee Management</h3>
                        </div>

                        {/* Existing Fees List */}
                        <div style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {feeStructure.length === 0 && individualActions.length === 0 && (
                                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '12px', fontSize: '0.9rem' }}>No fees assigned.</p>
                            )}
                            
                            {feeStructure.map((fee) => (
                                <div key={fee.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{fee.name}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <span style={{ fontWeight: '800', color: '#16a34a' }}>Rs {fee.amount}</span>
                                        <button onClick={() => removeFee(fee.id, false)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }}>
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {individualActions.map((action) => (
                                <div key={action.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#fff1f2', borderRadius: '12px', border: '1px dashed #fda4af' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <AlertCircle size={16} color="#e11d48" />
                                        <span style={{ fontWeight: '600', color: '#e11d48' }}>{action.name} (Action)</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <span style={{ fontWeight: '800', color: '#e11d48' }}>Rs {action.amount}</span>
                                        <button onClick={() => removeFee(action.id, true)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }}>
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Add New Fee Form */}
                        <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                            <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Add New Fee / Action</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <select 
                                    value={newFeeCategory} 
                                    onChange={(e) => setNewFeeCategory(e.target.value)}
                                    style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', fontSize: '0.95rem', fontWeight: '500' }}
                                >
                                    <optgroup label="Recurring Fees">
                                        {RECURRING_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </optgroup>
                                    <optgroup label="Individual Actions (Fines, Uniforms, etc.)">
                                        {ACTION_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </optgroup>
                                </select>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <input 
                                        type="number" 
                                        placeholder="Amount" 
                                        value={newFeeAmount} 
                                        onChange={(e) => setNewFeeAmount(e.target.value)}
                                        style={{ flex: 1, padding: '0.875rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white' }}
                                    />
                                    <button 
                                        onClick={handleAddFee}
                                        disabled={!newFeeAmount}
                                        style={{ 
                                            padding: '0 1.5rem', borderRadius: '12px', border: 'none', background: newFeeAmount ? 'var(--primary)' : '#cbd5e1', 
                                            color: 'white', fontWeight: '700', cursor: newFeeAmount ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '0.5rem'
                                        }}
                                    >
                                        <Plus size={18} /> Add
                                    </button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div style={{ marginTop: '3rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        padding: '1rem 3rem', borderRadius: '16px', border: 'none', background: '#10b981', color: 'white',
                        fontSize: '1.1rem', fontWeight: '800', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem',
                        boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.3)', transition: 'all 0.2s'
                    }}
                    className="hover:scale-105 active:scale-95"
                >
                    {saving ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}
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
