
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, X, Search, Filter, BookOpen, Users, User, Phone, Mail, Trash2, Loader2, Star, MoreVertical, ChevronRight, Edit } from 'lucide-react';
import { db, functions, auth } from '../firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, where, getDocs, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

// Internal Component for individual Teacher Card logic
// Internal Component for individual Teacher Card logic
const TeacherCard = ({ teacher, onDelete, onEdit, isHighlighted }) => {
    // Dynamic Theme Color based on name char code for variety
    const seed = teacher.name.charCodeAt(0) || 123;
    const isEven = seed % 2 === 0;
    const themeColor = isEven ? 'var(--primary)' : 'var(--secondary)';
    const themeLight = isEven ? '#e0e7ff' : '#ecfeff';

    return (
        <div
            id={`teacher-${teacher.id}`}
            className="card"
            style={{
                padding: '0',
                overflow: 'hidden',
                border: isHighlighted ? '2px solid var(--primary)' : '1px solid #dbeafe',
                position: 'relative',
                background: 'white',
                boxShadow: isHighlighted ? '0 0 0 4px rgba(99, 102, 241, 0.2)' : '0 4px 6px -1px rgba(59, 130, 246, 0.1), 0 2px 4px -1px rgba(59, 130, 246, 0.06)',
                borderRadius: '16px',
                transition: 'all 0.3s ease',
                transform: isHighlighted ? 'scale(1.02)' : 'scale(1)',
                zIndex: isHighlighted ? 10 : 1
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
                            {teacher.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                                {teacher.name}
                            </h3>
                            <span style={{
                                fontSize: '0.8rem', color: themeColor,
                                background: themeLight, padding: '0.2rem 0.6rem',
                                borderRadius: '12px', fontWeight: '600'
                            }}>
                                {teacher.subject || 'Teacher'}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={() => onEdit(teacher)}
                            style={{
                                background: '#f0f9ff', border: 'none', padding: '0.5rem',
                                borderRadius: '8px', color: '#0ea5e9', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >
                            <Edit size={16} />
                        </button>
                        <button
                            onClick={() => onDelete(teacher.id)}
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
                        <BookOpen size={16} color="#64748b" />
                        <span>Subjects: <strong style={{ color: 'var(--text-main)' }}>
                            {Array.isArray(teacher.subjects) ? teacher.subjects.join(', ') : teacher.subjects || teacher.subject || 'None'}
                        </strong></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        <Phone size={16} color="#64748b" />
                        <span>{teacher.phone || 'N/A'}</span>
                    </div>
                    {teacher.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <Mail size={16} color="#64748b" />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teacher.email}</span>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '100%' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Assigned Classes</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {Array.isArray(teacher.assignedClasses)
                            ? teacher.assignedClasses.join(', ')
                            : teacher.assignedClasses || teacher.assignedClass || 'None'}
                    </span>
                </div>
                <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: 'white', border: '1px solid #e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <Star size={16} color="#fbbf24" fill="#fbbf24" />
                </div>
            </div>
        </div>
    );
};

const Teachers = () => {
    const [showAddTeacher, setShowAddTeacher] = useState(false);
    const [step, setStep] = useState(1);
    const [newTeacher, setNewTeacher] = useState({
        name: '',
        email: '',
        phone: '',
        subjects: [],
        address: '',
        assignedClasses: [],
        username: '',
        password: ''
    });
    const [teachers, setTeachers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [schoolId, setSchoolId] = useState(null);
    const [dbClasses, setDbClasses] = useState([]);

    const subjectOptions = [
        'English', 'Urdu', 'Mathematics', 'Islamiyat', 'QURAN',
        'Social Study', 'Art', 'Science', 'Biology', 'Chemistry', 'Physic'
    ];

    // Initialize User & School ID
    useEffect(() => {
        let unsubscribeAuth = null;

        const fetchUser = async () => {
            // Priority 1: Check Manual Session (Legacy/Bypass)
            const manualSession = localStorage.getItem('manual_session');
            if (manualSession) {
                try {
                    const userData = JSON.parse(manualSession);
                    if (userData.schoolId) {
                        setSchoolId(userData.schoolId);
                        setLoading(false);
                        return;
                    }
                } catch (e) {
                    console.error("Session parse error", e);
                }
            }

            // Priority 2: Check Standard Firebase Auth
            unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
                if (user) {
                    try {
                        const tokenResult = await user.getIdTokenResult();
                        const claims = tokenResult.claims;
                        if (claims.schoolId) {
                            setSchoolId(claims.schoolId);
                        } else {
                            console.error("No School ID claim found on user");
                            // Fallback: Check if user doc has schoolId check might be redundant if claims are set correctly, 
                            // but good for safety if we want to add it later. 
                            // For now, relying on claims is standard.
                        }
                    } catch (e) {
                        console.error("Error fetching claims", e);
                    }
                } else {
                    console.log("No authenticated user found");
                }
                setLoading(false);
            });
        };

        fetchUser();

        return () => {
            if (unsubscribeAuth) unsubscribeAuth();
        };
    }, []);

    // Fetch Teachers & Classes
    useEffect(() => {
        if (!schoolId) return;

        // Fetch Classes for dropdown
        const fetchClasses = async () => {
            try {
                const q = query(collection(db, `schools/${schoolId}/classes`));
                const snapshot = await getDocs(q);
                const classesList = snapshot.docs.map(doc => doc.data().name);
                // Sort roughly
                classesList.sort();
                setDbClasses(classesList);
            } catch (err) {
                console.error("Error fetching classes for dropdown", err);
            }
        };

        fetchClasses();

        // Listen for Teachers
        const q = query(collection(db, `schools/${schoolId}/teachers`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const teachersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setTeachers(teachersData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching teachers:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [schoolId]);

    // Handle Scroll to Teacher from Dashboard
    const location = useLocation();
    const [highlightedTeacherId, setHighlightedTeacherId] = useState(null);

    useEffect(() => {
        if (location.state?.selectedTeacherId && !loading && teachers.length > 0) {
            const teacherId = location.state.selectedTeacherId;
            const element = document.getElementById(`teacher-${teacherId}`);
            if (element) {
                setTimeout(() => {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setHighlightedTeacherId(teacherId);
                    // Remove highlight after 3 seconds
                    setTimeout(() => setHighlightedTeacherId(null), 3000);
                }, 500); // Small delay to ensure rendering
            }
        }
    }, [location.state, loading, teachers]);

    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const handleEditClick = (teacher) => {
        setNewTeacher({
            ...teacher,
            password: '', // Clear password field for security/edit mode
            subjects: Array.isArray(teacher.subjects) ? teacher.subjects : (teacher.subject ? [teacher.subject] : []),
            assignedClasses: Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : (teacher.assignedClass ? [teacher.assignedClass] : [])
        });
        setEditingId(teacher.id);
        setIsEditing(true);
        setStep(1);
        setShowAddTeacher(true);
    };

    const handleAddTeacher = async (e) => {
        e.preventDefault();
        console.log("handleAddTeacher called. School ID:", schoolId);

        if (!schoolId) {
            alert("Error: School ID is missing. Please reload the page or log in again.");
            console.error("School ID is missing in handleAddTeacher");
            return;
        }

        try {
            if (isEditing) {
                // Update Logic
                const teacherRef = doc(db, `schools/${schoolId}/teachers`, editingId);
                const updateData = { ...newTeacher };
                if (!updateData.password) delete updateData.password; // Don't overwrite if empty
                if (!updateData.username) delete updateData.username;

                await updateDoc(teacherRef, updateData);

                // Handle Class Re-assignments
                const oldTeacher = teachers.find(t => t.id === editingId);
                const oldClasses = oldTeacher?.assignedClasses || (oldTeacher?.assignedClass ? [oldTeacher.assignedClass] : []);
                const newClasses = newTeacher.assignedClasses || [];

                // Removed classes: set teacher to 'Unassigned'
                const removedMessages = oldClasses.filter(c => !newClasses.includes(c));
                for (const cls of removedMessages) {
                    const q = query(collection(db, `schools/${schoolId}/classes`), where("name", "==", cls));
                    const snap = await getDocs(q);
                    snap.forEach(async (d) => {
                        await updateDoc(doc(db, `schools/${schoolId}/classes`, d.id), { teacher: 'Unassigned' });
                    });
                }

                // Added classes: set teacher to New Name
                const addedClasses = newClasses.filter(c => !oldClasses.includes(c));
                for (const cls of addedClasses) {
                    const q = query(collection(db, `schools/${schoolId}/classes`), where("name", "==", cls));
                    const snap = await getDocs(q);
                    snap.forEach(async (d) => {
                        await updateDoc(doc(db, `schools/${schoolId}/classes`, d.id), { teacher: newTeacher.name });
                    });
                }

                // Also update Name in KEPT classes if name changed
                if (oldTeacher.name !== newTeacher.name) {
                    const keptClasses = newClasses.filter(c => oldClasses.includes(c));
                    for (const cls of keptClasses) {
                        const q = query(collection(db, `schools/${schoolId}/classes`), where("name", "==", cls));
                        const snap = await getDocs(q);
                        snap.forEach(async (d) => {
                            await updateDoc(doc(db, `schools/${schoolId}/classes`, d.id), { teacher: newTeacher.name });
                        });
                    }
                }


            } else {
                // Add Logic - VIA CLOUD FUNCTION (Secure)
                console.log("Creating new teacher account...");
                setLoading(true);

                try {
                    const createSchoolUserFn = httpsCallable(functions, 'createSchoolUser');
                    console.log("Calling Cloud Function: createSchoolUser");

                    const result = await createSchoolUserFn({
                        email: newTeacher.email.trim(),
                        password: newTeacher.password,
                        name: newTeacher.name.trim(),
                        role: 'teacher',
                        schoolId: schoolId,
                        // Pass extra fields directly to backend
                        phone: newTeacher.phone.trim(),
                        subjects: newTeacher.subjects,
                        address: newTeacher.address,
                        assignedClasses: newTeacher.assignedClasses,
                        username: newTeacher.username.trim()
                    });

                    console.log("Cloud Function Result:", result);
                    const newTeacherUid = result.data.uid;

                    // Note: Doc creation is now handled entirely by the Cloud Function.
                    // We only need to handle Class assignments in other collections if needed.

                    // 3. Handle Class Assignments
                    if (newTeacher.assignedClasses && newTeacher.assignedClasses.length > 0) {
                        const updatePromises = newTeacher.assignedClasses.map(async (className) => {
                            const q = query(
                                collection(db, `schools/${schoolId}/classes`),
                                where("name", "==", className)
                            );
                            const querySnapshot = await getDocs(q);
                            if (!querySnapshot.empty) {
                                const classDoc = querySnapshot.docs[0];
                                await updateDoc(doc(db, `schools/${schoolId}/classes`, classDoc.id), {
                                    teacher: newTeacher.name,
                                    teacherId: newTeacherUid // Also link ID upon creation
                                });
                            }
                        });
                        await Promise.all(updatePromises);
                    }
                    setLoading(false);

                    setShowAddTeacher(false);
                    setNewTeacher({ name: '', email: '', phone: '', subjects: [], address: '', assignedClasses: [], username: '', password: '' });
                    setStep(1);
                    setIsEditing(false);
                    setEditingId(null);

                } catch (error) {
                    console.error("Error creating teacher:", error);
                    alert("Failed to create teacher account. " + error.message);
                    setLoading(false);
                }
            }
        } catch (error) {
            console.error("Error saving teacher:", error);
            alert("Failed to save teacher. " + error.message);
            setLoading(false); // Ensure loading is turned off on error
        }
    };

    // Delete Logic
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [teacherToDelete, setTeacherToDelete] = useState(null);
    const [confirmPassword, setConfirmPassword] = useState('');
    const [deleteError, setDeleteError] = useState('');

    const handleDeleteClick = (id) => {
        setTeacherToDelete(id);
        setShowDeleteConfirm(true);
        setConfirmPassword('');
        setDeleteError('');
    };

    const confirmDelete = async (e) => {
        e.preventDefault();
        setDeleteError('');

        // Basic Manual Auth Check (same as Classes.jsx)
        let isVerified = false;
        const manualSession = localStorage.getItem('manual_session');

        if (auth.currentUser) {
            // Standard Auth Re-authentication
            try {
                const credential = EmailAuthProvider.credential(auth.currentUser.email, confirmPassword);
                await reauthenticateWithCredential(auth.currentUser, credential);
                isVerified = true;
            } catch (err) {
                console.error("Re-auth failed", err);
                if (err.code === 'auth/wrong-password') {
                    setDeleteError("Incorrect password.");
                    return;
                }
            }
        } else if (manualSession) {
            // Legacy Manual Auth Check
            try {
                const userData = JSON.parse(manualSession);
                const userDocRef = doc(db, `schools/${schoolId}/users`, userData.uid);
                const snapshot = await getDoc(userDocRef);
                if (snapshot.exists() && snapshot.data().manualPassword === confirmPassword) {
                    isVerified = true;
                }
            } catch (err) {
                console.error("Verification failed", err);
            }
        }

        if (isVerified) {
            try {
                await deleteDoc(doc(db, `schools/${schoolId}/teachers`, teacherToDelete));
                setShowDeleteConfirm(false);
                setTeacherToDelete(null);
            } catch (error) {
                console.error("Error deleting teacher:", error);
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
                        Teachers & Staff
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Manage your faculty members and assignments</p>
                </div>
                <button
                    onClick={() => setShowAddTeacher(true)}
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
                    <span>Add New Teacher</span>
                </button>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                {[
                    {
                        label: 'Total Teachers',
                        value: teachers.length,
                        icon: Users,
                        gradient: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                        shadow: 'rgba(99, 102, 241, 0.4)'
                    },
                    {
                        label: 'Active Today',
                        value: Math.round(teachers.length * 0.9), // Simulated
                        icon: User,
                        gradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                        shadow: 'rgba(16, 185, 129, 0.4)'
                    },
                    {
                        label: 'Subjects Covered',
                        value: new Set(teachers.map(t => t.subject)).size || 0,
                        icon: BookOpen,
                        gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
                        shadow: 'rgba(14, 165, 233, 0.4)'
                    },
                    {
                        label: 'Staff On Leave',
                        value: Math.max(0, teachers.length - Math.round(teachers.length * 0.9)), // Simulated
                        icon: Phone, // Placeholder icon
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

            {/* Teacher Grid */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                    <Loader2 className="animate-spin" size={32} color="var(--primary)" />
                </div>
            ) : teachers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                    <Users size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p>No teachers added yet. Click 'Add New Teacher' to start.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                    {teachers.map((t) => (
                        <TeacherCard
                            key={t.id}
                            teacher={t}
                            onDelete={handleDeleteClick}
                            onEdit={handleEditClick}
                            isHighlighted={highlightedTeacherId === t.id}
                        />
                    ))}
                </div>
            )}

            {/* Add Teacher Modal */}
            {showAddTeacher && (
                <div
                    onClick={(e) => {
                        // Close if clicked outside the modal content
                        if (e.target === e.currentTarget) {
                            setShowAddTeacher(false);
                            setStep(1);
                        }
                    }}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 1000,
                        background: 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(2px)',
                        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem',
                        paddingTop: '6rem', // Push modal down
                        cursor: 'pointer' // Indicate clickable background
                    }}
                >
                    <div
                        className="card custom-scrollbar"
                        onClick={(e) => e.stopPropagation()} // Prevent close when clicking inside modal
                        style={{
                            width: '100%', maxWidth: '600px', maxHeight: 'calc(100vh - 8rem)',
                            overflowY: 'auto', padding: '2rem', animation: 'slideUp 0.3s ease-out',
                            position: 'relative', background: 'white', borderRadius: '24px',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            cursor: 'default' // Reset cursor inside modal
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
                                    {isEditing ? (step === 1 ? 'Edit Teacher' : 'Update Credentials') : (step === 1 ? 'Add New Teacher' : 'Account Setup')}
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
                                <button onClick={() => { setShowAddTeacher(false); setStep(1); setIsEditing(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                    <X size={24} color="var(--text-secondary)" />
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleAddTeacher}>
                            {step === 1 ? (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                Full Name
                                            </label>
                                            <input
                                                type="text" placeholder="e.g. Sarah Connor"
                                                value={newTeacher.name}
                                                onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })}
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
                                                value={newTeacher.phone}
                                                onChange={(e) => setNewTeacher({ ...newTeacher, phone: e.target.value })}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                Subject Specialist
                                            </label>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                {subjectOptions.map((subj) => {
                                                    const isSelected = newTeacher.subjects.includes(subj);
                                                    return (
                                                        <div
                                                            key={subj}
                                                            onClick={() => {
                                                                setNewTeacher(prev => ({
                                                                    ...prev,
                                                                    subjects: isSelected
                                                                        ? prev.subjects.filter(s => s !== subj)
                                                                        : [...prev.subjects, subj]
                                                                }));
                                                            }}
                                                            style={{
                                                                padding: '0.4rem 0.8rem',
                                                                borderRadius: '8px',
                                                                border: isSelected ? '1px solid var(--primary)' : '1px solid #e2e8f0',
                                                                background: isSelected ? '#eff6ff' : 'white',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.4rem',
                                                                transition: 'all 0.2s',
                                                                fontSize: '0.85rem'
                                                            }}
                                                        >
                                                            <div style={{
                                                                width: '14px', height: '14px', borderRadius: '4px',
                                                                border: isSelected ? 'none' : '2px solid #cbd5e1',
                                                                background: isSelected ? 'var(--primary)' : 'transparent',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                            }}>
                                                                {isSelected && <span style={{ color: 'white', fontSize: '10px' }}>✓</span>}
                                                            </div>
                                                            <span style={{ color: isSelected ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: '500' }}>
                                                                {subj}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                Email Address (Optional)
                                            </label>
                                            <input
                                                type="email" placeholder="teacher@school.com"
                                                value={newTeacher.email}
                                                onChange={(e) => setNewTeacher({ ...newTeacher, email: e.target.value })}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                            Residential Address
                                        </label>
                                        <textarea
                                            placeholder="Enter full address"
                                            rows="2"
                                            value={newTeacher.address}
                                            onChange={(e) => setNewTeacher({ ...newTeacher, address: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', resize: 'none' }}
                                            required
                                        />
                                    </div>

                                    <div style={{ marginBottom: '2rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                                            Assign Classes (Optional)
                                        </label>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                            {dbClasses.map((clsName) => {
                                                const isSelected = newTeacher.assignedClasses.includes(clsName);
                                                return (
                                                    <div
                                                        key={clsName}
                                                        onClick={() => {
                                                            setNewTeacher(prev => ({
                                                                ...prev,
                                                                assignedClasses: isSelected
                                                                    ? prev.assignedClasses.filter(c => c !== clsName)
                                                                    : [...prev.assignedClasses, clsName]
                                                            }));
                                                        }}
                                                        style={{
                                                            padding: '0.5rem 1rem',
                                                            borderRadius: '8px',
                                                            border: isSelected ? '1px solid var(--primary)' : '1px solid #e2e8f0',
                                                            background: isSelected ? '#eff6ff' : 'white',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.5rem',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        <div style={{
                                                            width: '18px', height: '18px', borderRadius: '4px',
                                                            border: isSelected ? 'none' : '2px solid #cbd5e1',
                                                            background: isSelected ? 'var(--primary)' : 'transparent',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                        }}>
                                                            {isSelected && <span style={{ color: 'white', fontSize: '12px' }}>✓</span>}
                                                        </div>
                                                        <span style={{ fontSize: '0.9rem', color: isSelected ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: '500' }}>
                                                            {clsName}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
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
                                            <User size={32} />
                                        </div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-main)' }}>Create Teacher Login</h3>
                                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                            {isEditing ? 'Update login credentials or leave blank to keep current' : 'Set up credentials for the Teacher App'}
                                        </p>                        </div>

                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                            Username
                                        </label>
                                        <input
                                            type="text" placeholder="e.g. sarah.connor"
                                            value={newTeacher.username}
                                            onChange={(e) => setNewTeacher({ ...newTeacher, username: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                            required
                                        />
                                    </div>

                                    <div style={{ marginBottom: '2rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                            Password
                                        </label>
                                        <input
                                            type="text" placeholder={isEditing ? "Leave blank to keep current password" : "Set a strong password"}
                                            value={newTeacher.password}
                                            onChange={(e) => setNewTeacher({ ...newTeacher, password: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                            required={!isEditing}
                                        />                                    </div>

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
                                            {isEditing ? 'Update Teacher' : 'Save Teacher & Create Account'}
                                        </button>                        </div>
                                </div>
                            )
                            }
                        </form >
                    </div >
                </div >
            )}

            {/* Delete Confirmation Modal */}
            {
                showDeleteConfirm && (
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
                                    Are you sure you want to remove this teacher? This action cannot be undone.
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
                                        Remove
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Teachers;
