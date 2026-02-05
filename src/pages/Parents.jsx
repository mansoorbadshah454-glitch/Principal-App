import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Search, Filter, BookOpen, Users, User, Phone, Mail, Trash2, Loader2, Star, MoreVertical, ChevronRight, Edit, ShieldCheck, Baby } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { auth } from '../firebase';

// Internal Component for individual Parent Card logic
const ParentCard = ({ parent, onDelete, onEdit }) => {
    // Dynamic Theme Color based on name char code for variety
    const seed = parent.name.charCodeAt(0) || 123;
    const isEven = seed % 2 === 0;
    const themeColor = isEven ? 'var(--primary)' : 'var(--secondary)';
    const themeLight = isEven ? '#e0e7ff' : '#ecfeff';

    return (
        <div className="card" style={{
            padding: '0',
            overflow: 'hidden',
            border: '1px solid #dbeafe',
            position: 'relative',
            background: 'white',
            boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.1), 0 2px 4px -1px rgba(59, 130, 246, 0.06)',
            borderRadius: '16px',
            transition: 'all 0.3s ease'
        }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{
                            width: '50px', height: '50px', borderRadius: '50%',
                            background: `linear-gradient(135deg, ${themeColor}, ${isEven ? '#4338ca' : '#0891b2'})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white', fontWeight: '700', fontSize: '1.2rem'
                        }}>
                            {parent.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                                {parent.name}
                            </h3>
                            <span style={{
                                fontSize: '0.8rem', color: themeColor,
                                background: themeLight, padding: '0.2rem 0.6rem',
                                borderRadius: '12px', fontWeight: '600'
                            }}>
                                {parent.username || 'No Username'}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={() => onEdit(parent)}
                            style={{
                                background: '#f0f9ff', border: 'none', padding: '0.5rem',
                                borderRadius: '8px', color: '#0ea5e9', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >
                            <Edit size={16} />
                        </button>
                        <button
                            onClick={() => onDelete(parent.id)}
                            style={{
                                background: '#fef2f2', border: 'none', padding: '0.5rem',
                                borderRadius: '8px', color: '#ef4444', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        <Phone size={16} color="#64748b" />
                        <span>{parent.phone || 'N/A'}</span>
                    </div>
                    {parent.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <Mail size={16} color="#64748b" />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parent.email}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        <ShieldCheck size={16} color="#64748b" />
                        <span>Password: <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{parent.password}</span></span>
                    </div>
                </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '100%' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Linked Children</span>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {parent.linkedStudents && parent.linkedStudents.length > 0 ? (
                            parent.linkedStudents.map((child, idx) => (
                                <span key={idx} style={{
                                    fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-main)',
                                    background: 'white', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: '12px'
                                }}>
                                    {child.studentName} <span style={{ opacity: 0.5, fontSize: '0.7em' }}>({child.className})</span>
                                </span>
                            ))
                        ) : (
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>None</span>
                        )}
                    </div>
                </div>
                <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: 'white', border: '1px solid #e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <Baby size={16} color="#fbbf24" fill="#fbbf24" />
                </div>
            </div>
        </div>
    );
};

const Parents = () => {
    const [showAddParent, setShowAddParent] = useState(false);
    const [step, setStep] = useState(1);
    const [newParent, setNewParent] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        username: '',
        password: '',
        linkedStudents: [] // Array of { studentId, studentName, classId, className }
    });

    // For linking students
    const [selectedClassId, setSelectedClassId] = useState('');
    const [availableStudents, setAvailableStudents] = useState([]);
    const [selectedStudentId, setSelectedStudentId] = useState('');

    const [parents, setParents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [schoolId, setSchoolId] = useState(null);
    const [dbClasses, setDbClasses] = useState([]);

    // Initialize User & School ID
    useEffect(() => {
        const fetchUser = () => {
            const manualSession = localStorage.getItem('manual_session');
            if (manualSession) {
                const userData = JSON.parse(manualSession);
                setSchoolId(userData.schoolId);
            }
        };
        fetchUser();
    }, []);

    // Fetch Parents & Classes
    useEffect(() => {
        if (!schoolId) return;

        // Fetch Classes for dropdown
        const fetchClasses = async () => {
            try {
                const q = query(collection(db, `schools/${schoolId}/classes`));
                const snapshot = await getDocs(q);
                const classesList = snapshot.docs.map(doc => ({
                    id: doc.id,
                    name: doc.data().name
                }));
                // Sort roughly
                classesList.sort((a, b) => a.name.localeCompare(b.name));
                setDbClasses(classesList);
            } catch (err) {
                console.error("Error fetching classes for dropdown", err);
            }
        };

        fetchClasses();

        // Listen for Parents
        const q = query(collection(db, `schools/${schoolId}/parents`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const parentsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setParents(parentsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching parents:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [schoolId]);

    // Fetch students when a class is selected
    useEffect(() => {
        if (!schoolId || !selectedClassId) {
            setAvailableStudents([]);
            return;
        }

        const fetchStudents = async () => {
            try {
                const q = query(collection(db, `schools/${schoolId}/classes/${selectedClassId}/students`));
                const snapshot = await getDocs(q);
                const studentsList = snapshot.docs.map(doc => ({
                    id: doc.id,
                    name: doc.data().name || `${doc.data().firstName} ${doc.data().lastName}`,
                    rollNo: doc.data().rollNo
                }));
                setAvailableStudents(studentsList);
            } catch (err) {
                console.error("Error fetching students:", err);
            }
        };
        fetchStudents();
    }, [schoolId, selectedClassId]);

    const handleAddStudentLink = () => {
        if (!selectedClassId || !selectedStudentId) return;

        const classObj = dbClasses.find(c => c.id === selectedClassId);
        const studentObj = availableStudents.find(s => s.id === selectedStudentId);

        if (classObj && studentObj) {
            // Check if already added
            const exists = newParent.linkedStudents.some(s => s.studentId === studentObj.id);
            if (!exists) {
                setNewParent(prev => ({
                    ...prev,
                    linkedStudents: [...prev.linkedStudents, {
                        studentId: studentObj.id,
                        studentName: studentObj.name,
                        classId: classObj.id,
                        className: classObj.name
                    }]
                }));
            }
        }
        // Reset selection
        setSelectedStudentId('');
    };

    const handleRemoveStudentLink = (studentId) => {
        setNewParent(prev => ({
            ...prev,
            linkedStudents: prev.linkedStudents.filter(s => s.studentId !== studentId)
        }));
    };

    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const handleEditClick = (parent) => {
        setNewParent({
            ...parent,
            password: parent.password || '', // Keep password visible for edit or empty
            linkedStudents: parent.linkedStudents || []
        });
        setEditingId(parent.id);
        setIsEditing(true);
        setStep(1);
        setShowAddParent(true);
    };

    const handleAddParent = async (e) => {
        e.preventDefault();
        if (!schoolId) return;

        try {
            if (isEditing) {
                const parentRef = doc(db, `schools/${schoolId}/parents`, editingId);
                const updateData = { ...newParent };
                // Optionally handle password logic if needed, but for now we update everything

                await updateDoc(parentRef, updateData);
            } else {
                await addDoc(collection(db, `schools/${schoolId}/parents`), {
                    ...newParent,
                    createdAt: new Date()
                });
            }

            setShowAddParent(false);
            setNewParent({ name: '', email: '', phone: '', address: '', username: '', password: '', linkedStudents: [] });
            setStep(1);
            setIsEditing(false);
            setEditingId(null);
            setSelectedClassId('');
            setAvailableStudents([]);
            setSelectedStudentId('');
        } catch (error) {
            console.error("Error saving parent:", error);
            alert("Failed to save parent. Please try again.");
        }
    };

    // Delete Logic
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [parentToDelete, setParentToDelete] = useState(null);
    const [confirmPassword, setConfirmPassword] = useState('');
    const [deleteError, setDeleteError] = useState('');

    const handleDeleteClick = (id) => {
        setParentToDelete(id);
        setShowDeleteConfirm(true);
        setConfirmPassword('');
        setDeleteError('');
    };

    const confirmDelete = async (e) => {
        e.preventDefault();
        setDeleteError('');

        // Basic Manual Auth Check
        let isVerified = false;
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            try {
                const userData = JSON.parse(manualSession);
                const userDocRef = doc(db, `schools/${schoolId}/users`, userData.uid);
                const snapshot = await import('firebase/firestore').then(mod => mod.getDoc(userDocRef));
                if (snapshot.exists() && snapshot.data().manualPassword === confirmPassword) {
                    isVerified = true;
                }
            } catch (err) {
                console.error("Verification failed", err);
            }
        }

        if (isVerified) {
            try {
                await deleteDoc(doc(db, `schools/${schoolId}/parents`, parentToDelete));
                setShowDeleteConfirm(false);
                setParentToDelete(null);
            } catch (error) {
                console.error("Error deleting parent:", error);
                setDeleteError("Failed to delete. Try again.");
            }
        } else {
            setDeleteError("Incorrect password.");
        }
    };

    return (
        <div className="animate-fade-in-up">
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '2rem'
            }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                        Parents & Guardians
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Manage parent accounts and student linkages</p>
                </div>
                <button
                    onClick={() => setShowAddParent(true)}
                    className="btn-primary"
                    style={{
                        padding: '0.75rem 1.5rem',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
                    }}
                >
                    <Plus size={20} />
                    <span>Add New Parent</span>
                </button>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                {[
                    {
                        label: 'Total Parents',
                        value: parents.length,
                        icon: Users,
                        gradient: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                        shadow: 'rgba(99, 102, 241, 0.4)'
                    },
                    {
                        label: 'Linked Students',
                        value: parents.reduce((acc, p) => acc + (p.linkedStudents?.length || 0), 0),
                        icon: Baby,
                        gradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                        shadow: 'rgba(16, 185, 129, 0.4)'
                    },
                    {
                        label: 'App Users',
                        value: parents.filter(p => p.username && p.password).length,
                        icon: User,
                        gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
                        shadow: 'rgba(14, 165, 233, 0.4)'
                    },
                    {
                        label: 'New This Month',
                        value: parents.filter(p => {
                            if (!p.createdAt) return false;
                            const date = p.createdAt.seconds ? new Date(p.createdAt.seconds * 1000) : new Date(p.createdAt);
                            const now = new Date();
                            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                        }).length,
                        icon: Star,
                        gradient: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
                        shadow: 'rgba(245, 158, 11, 0.4)'
                    },
                ].map((stat, idx) => (
                    <div key={idx} className="card" style={{
                        padding: '1.5rem',
                        position: 'relative',
                        overflow: 'hidden',
                        border: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                        background: stat.gradient,
                        color: 'white',
                        boxShadow: `0 10px 20px -5px ${stat.shadow}`,
                        transition: 'all 0.3s ease'
                    }}>
                        <div style={{
                            position: 'absolute', top: '-15%', right: '-10%',
                            width: '100px', height: '100px',
                            background: 'rgba(255, 255, 255, 0.12)',
                            borderRadius: '20px', transform: 'rotate(20deg)', zIndex: 1
                        }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 2 }}>
                            <div>
                                <p style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.25rem', fontWeight: '500' }}>{stat.label}</p>
                                <h3 style={{ fontSize: '1.75rem', fontWeight: '700' }}>{stat.value}</h3>
                            </div>
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '10px',
                                background: 'rgba(255, 255, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                backdropFilter: 'blur(4px)'
                            }}>
                                <stat.icon size={22} color="white" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Parents Grid */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                    <Loader2 className="animate-spin" size={32} color="var(--primary)" />
                </div>
            ) : parents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                    <Users size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p>No parents added yet. Click 'Add New Parent' to start.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                    {parents.map((p) => (
                        <ParentCard key={p.id} parent={p} onDelete={handleDeleteClick} onEdit={handleEditClick} />
                    ))}
                </div>
            )}

            {/* Add Parent Modal */}
            {showAddParent && (
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setShowAddParent(false);
                            setStep(1);
                        }
                    }}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 1000,
                        background: 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(2px)',
                        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem',
                        paddingTop: '6rem',
                        cursor: 'pointer'
                    }}
                >
                    <div
                        className="card custom-scrollbar"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%', maxWidth: '600px', maxHeight: 'calc(100vh - 8rem)',
                            overflowY: 'auto', padding: '2rem', animation: 'slideUp 0.3s ease-out',
                            position: 'relative', background: 'white', borderRadius: '24px',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            cursor: 'default'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                {step === 2 && (
                                    <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                                        <MoreVertical size={24} color="var(--text-secondary)" style={{ transform: 'rotate(90deg)' }} />
                                    </button>
                                )}
                                <h2 style={{ fontSize: '1.5rem', fontWeight: '700' }}>
                                    {isEditing ? (step === 1 ? 'Edit Parent' : 'Update & Link') : (step === 1 ? 'Add New Parent' : 'Account & Links')}
                                </h2>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                {step === 1 && (
                                    <button
                                        onClick={() => setStep(2)}
                                        style={{
                                            background: 'var(--primary)', border: 'none',
                                            width: '40px', height: '40px', borderRadius: '50%',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
                                        }}
                                    >
                                        <ChevronRight size={24} color="white" />
                                    </button>
                                )}
                                <button onClick={() => { setShowAddParent(false); setStep(1); setIsEditing(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                    <X size={24} color="var(--text-secondary)" />
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleAddParent}>
                            {step === 1 ? (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                Parent Name
                                            </label>
                                            <input
                                                type="text" placeholder="e.g. John Doe"
                                                value={newParent.name}
                                                onChange={(e) => setNewParent({ ...newParent, name: e.target.value })}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                Mobile Number
                                            </label>
                                            <input
                                                type="tel" placeholder="0300 1234567"
                                                value={newParent.phone}
                                                onChange={(e) => setNewParent({ ...newParent, phone: e.target.value })}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                            Email Address (Optional)
                                        </label>
                                        <input
                                            type="email" placeholder="parent@example.com"
                                            value={newParent.email}
                                            onChange={(e) => setNewParent({ ...newParent, email: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                        />
                                    </div>

                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                            Residential Address
                                        </label>
                                        <textarea
                                            placeholder="Enter full address"
                                            rows="2"
                                            value={newParent.address}
                                            onChange={(e) => setNewParent({ ...newParent, address: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', resize: 'none' }}
                                            required
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="animate-fade-in-up">
                                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                                        <div style={{
                                            width: '60px', height: '60px', background: '#e0e7ff', borderRadius: '50%',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem',
                                            color: '#4f46e5'
                                        }}>
                                            <ShieldCheck size={32} />
                                        </div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-main)' }}>Account & Student Linking</h3>
                                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                            Create login and link children profiles
                                        </p>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                Username
                                            </label>
                                            <input
                                                type="text" placeholder="e.g. johndoe123"
                                                value={newParent.username}
                                                onChange={(e) => setNewParent({ ...newParent, username: e.target.value })}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                Password
                                            </label>
                                            <input
                                                type="text" placeholder="Set password"
                                                value={newParent.password}
                                                onChange={(e) => setNewParent({ ...newParent, password: e.target.value })}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Link Students Section */}
                                    <div style={{ marginBottom: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px' }}>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '800', marginBottom: '1rem', color: 'var(--text-main)' }}>
                                            Link Children
                                        </label>

                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                            <select
                                                value={selectedClassId}
                                                onChange={(e) => setSelectedClassId(e.target.value)}
                                                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                                            >
                                                <option value="">Select Class</option>
                                                {dbClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>

                                            <select
                                                value={selectedStudentId}
                                                onChange={(e) => setSelectedStudentId(e.target.value)}
                                                disabled={!selectedClassId}
                                                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                                            >
                                                <option value="">Select Student</option>
                                                {availableStudents.map(s => <option key={s.id} value={s.id}>{s.name} ({s.rollNo})</option>)}
                                            </select>

                                            <button
                                                type="button"
                                                onClick={handleAddStudentLink}
                                                disabled={!selectedStudentId}
                                                style={{
                                                    padding: '0.6rem', borderRadius: '8px', background: 'var(--primary)',
                                                    color: 'white', border: 'none', cursor: 'pointer'
                                                }}
                                            >
                                                <Plus size={20} />
                                            </button>
                                        </div>

                                        {/* Linked Students List */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {newParent.linkedStudents.map((child, idx) => (
                                                <div key={idx} style={{
                                                    background: 'white', padding: '0.4rem 0.8rem', borderRadius: '20px',
                                                    border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                    fontSize: '0.85rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                }}>
                                                    <span style={{ fontWeight: '600', color: 'var(--primary)' }}>{child.studentName}</span>
                                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75em' }}>{child.className}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveStudentLink(child.studentId)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#ef4444' }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                            {newParent.linkedStudents.length === 0 && (
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                                    No children linked yet.
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                        <button
                                            type="button"
                                            onClick={() => setStep(1)}
                                            style={{
                                                padding: '0.75rem 1.5rem', borderRadius: '8px',
                                                background: 'transparent', border: '1px solid #e2e8f0',
                                                cursor: 'pointer', fontWeight: '600', color: 'var(--text-secondary)'
                                            }}
                                        >
                                            Back
                                        </button>
                                        <button
                                            type="submit"
                                            className="btn-primary"
                                            style={{
                                                padding: '0.75rem 2rem', borderRadius: '8px',
                                                cursor: 'pointer', fontWeight: '600',
                                                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
                                            }}
                                        >
                                            {isEditing ? 'Save Changes' : 'Create Parent Account'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)'
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '2rem', animation: 'slideUp 0.3s ease-out' }}>
                        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                            <div style={{
                                width: '60px', height: '60px', background: '#fef2f2', borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem',
                                color: '#ef4444'
                            }}>
                                <Trash2 size={32} />
                            </div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-main)' }}>Confirm Removal</h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                Are you sure you want to remove this parent account? This action cannot be undone.
                            </p>
                        </div>

                        <form onSubmit={confirmDelete}>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                    Enter Password to Confirm
                                </label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Your Password"
                                    style={{
                                        width: '100%', padding: '0.75rem', borderRadius: '8px',
                                        border: deleteError ? '1px solid #ef4444' : '1px solid #e2e8f0',
                                        outline: 'none', fontSize: '0.95rem'
                                    }}
                                    autoFocus
                                    required
                                />
                                {deleteError && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.5rem' }}>{deleteError}</p>}
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => { setShowDeleteConfirm(false); setConfirmPassword(''); }}
                                    style={{
                                        flex: 1, padding: '0.75rem', borderRadius: '8px',
                                        background: 'transparent', border: '1px solid #e2e8f0',
                                        cursor: 'pointer', fontWeight: '600', color: 'var(--text-secondary)'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    style={{
                                        flex: 1, padding: '0.75rem', borderRadius: '8px',
                                        background: '#ef4444', border: 'none',
                                        cursor: 'pointer', fontWeight: '600', color: 'white'
                                    }}
                                >
                                    Delete
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Parents;
