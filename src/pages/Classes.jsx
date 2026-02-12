import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Search, Filter, BookOpen, Users, User, ChevronRight, ChevronDown, Trash2, Loader2, Edit, Save } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, query, orderBy, writeBatch } from 'firebase/firestore';
import { auth } from '../firebase';
import StudentCircle from '../components/StudentCircle';

// Internal Component for individual Class Card logic
const ClassCard = ({ cls, onDelete, onEdit, schoolId }) => {
    const navigate = useNavigate();
    const [showSubjects, setShowSubjects] = useState(false);
    const [showStudents, setShowStudents] = useState(false);
    const [studentsList, setStudentsList] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [filter, setFilter] = useState('all'); // 'all', 'present', 'absent'

    // State for Attendance Stats
    const [realStats, setRealStats] = useState({ present: 0, absent: 0, total: 0 });
    const [isSaving, setIsSaving] = useState(false);

    // Always fetch students for real-time attendance calculation
    useEffect(() => {
        if (!schoolId) return;

        const q = query(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const students = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Calculate real attendance stats
            const present = students.filter(s => s.status === 'present').length;
            const absent = students.filter(s => s.status === 'absent').length;
            const total = students.length;
            setRealStats({ present, absent, total });

            // If student list is expanded, also update the detailed list
            if (showStudents) {
                students.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                setStudentsList(students);
                setLoadingStudents(false);
            }
        }, (error) => {
            console.error("Error fetching students:", error);
            setLoadingStudents(false);
        });

        return () => unsubscribe();
    }, [schoolId, cls.id, showStudents]);

    const handleSaveAttendance = async (e) => {
        e.stopPropagation();
        if (!schoolId) return;
        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            const today = new Date().toISOString().split('T')[0];

            // 1. Create historical record
            const historyRef = doc(collection(db, `schools/${schoolId}/attendance`));
            batch.set(historyRef, {
                classId: cls.id,
                className: cls.name,
                date: today,
                timestamp: new Date(),
                presentCount: realStats.present,
                absentCount: realStats.absent,
                totalStudents: realStats.total,
                records: studentsList.map(s => ({
                    id: s.id,
                    name: s.name,
                    status: s.status || 'absent'
                }))
            });

            // 2. Sync individual student status to class sub-collection
            // (Note: Teachers usually mark them individually, but Principal App's "Save" acts as a snapshot confirmer)
            studentsList.forEach(student => {
                const sRef = doc(db, `schools/${schoolId}/classes/${cls.id}/students`, student.id);
                // We ensure 'status' is at least defined as 'absent' if null
                batch.update(sRef, { status: student.status || 'absent' });
            });

            await batch.commit();
            alert(`Attendance for ${cls.name} saved successfully for ${today}`);
        } catch (error) {
            console.error("Error saving attendance:", error);
            alert("Failed to save attendance.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleMarkStatus = async (studentId, status) => {
        try {
            const sRef = doc(db, `schools/${schoolId}/classes/${cls.id}/students`, studentId);
            await updateDoc(sRef, { status });
        } catch (error) {
            console.error("Error updating student status:", error);
        }
    };

    const filteredStudents = studentsList.filter(student => {
        if (filter === 'all') return true;
        return (student.status || 'absent') === filter;
    });

    const totalStudents = realStats.total;
    const { present: presentCount, absent: absentCount } = realStats;

    // Dynamic Theme Color based on odd/even id
    const seed = cls.id.charCodeAt(0) || 123;
    const isEven = seed % 2 === 0;
    const themeColor = isEven ? 'var(--primary)' : 'var(--secondary)';
    const themeLight = isEven ? '#e0e7ff' : '#ecfeff';


    return (
        <div
            onClick={() => navigate(`/classes/${cls.id}`)}
            className="card" style={{
                padding: '0',
                overflow: 'hidden',
                border: '1px solid #dbeafe',
                position: 'relative',
                background: '#eff6ff',
                boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.1), 0 2px 4px -1px rgba(59, 130, 246, 0.06)',
                borderRadius: '16px',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
            }}>
            {/* Theme Decoration Strip */}
            <div style={{ height: '6px', width: '100%', background: `linear-gradient(90deg, ${themeColor}, transparent)` }} />

            <div style={{ padding: '1.5rem', borderBottom: '1px solid #dbeafe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)' }}>{cls.name}</h3>
                    <div style={{
                        padding: '0.25rem 0.75rem', background: 'white', borderRadius: '20px',
                        fontSize: '0.85rem', fontWeight: '600', color: themeColor,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}>
                        {totalStudents} Students
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            color: 'var(--text-secondary)', fontSize: '0.9rem',
                            cursor: 'default'
                        }}
                    >
                        <User size={16} color={themeColor} />
                        <span style={{ fontWeight: '500' }}>{cls.teacher || 'No Teacher Assigned'}</span>
                    </div>

                    {/* Attendance Stats Cards - Interactive */}
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowStudents(true);
                                setFilter('present');
                            }}
                            style={{
                                flex: 1, padding: '0.75rem', borderRadius: '12px', background: 'white',
                                border: '1px solid #dcfce7', cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', gap: '0.25rem',
                                transition: 'transform 0.2s',
                                borderBottom: filter === 'present' ? '3px solid #10b981' : '1px solid #dcfce7'
                            }}
                        >
                            <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#10b981', textTransform: 'uppercase' }}>Present</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{presentCount}</span>
                        </div>
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowStudents(true);
                                setFilter('absent');
                            }}
                            style={{
                                flex: 1, padding: '0.75rem', borderRadius: '12px', background: 'white',
                                border: '1px solid #fee2e2', cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', gap: '0.25rem',
                                transition: 'transform 0.2s',
                                borderBottom: filter === 'absent' ? '3px solid #ef4444' : '1px solid #fee2e2',
                                boxShadow: absentCount > 0 ? '0 0 10px rgba(239, 68, 68, 0.1)' : 'none'
                            }}
                        >
                            <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#ef4444', textTransform: 'uppercase' }}>Absent</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{absentCount}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ padding: '1.5rem', background: 'transparent' }}>
                <div
                    onClick={(e) => { e.stopPropagation(); setShowSubjects(!showSubjects); }}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        cursor: 'pointer', marginBottom: showSubjects ? '0.75rem' : '0.75rem',
                        userSelect: 'none'
                    }}
                >
                    <p style={{ fontSize: '0.85rem', fontWeight: '600', color: '#64748b' }}>
                        Subjects ({cls.subjects?.length || 0})
                    </p>
                    {showSubjects ? <ChevronDown size={16} color="#64748b" /> : <ChevronRight size={16} color="#64748b" />}
                </div>

                {showSubjects && (
                    <div className="animate-fade-in-up" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        {cls.subjects?.slice(0, 5).map((subj, idx) => (
                            <span key={idx} style={{
                                fontSize: '0.75rem', padding: '0.25rem 0.75rem', borderRadius: '6px',
                                background: 'white', border: '1px solid #dbeafe', color: 'var(--text-secondary)',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}>
                                {subj}
                            </span>
                        ))}
                        {cls.subjects?.length > 5 && (
                            <span style={{
                                fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '6px',
                                background: 'white', border: '1px solid #dbeafe', color: 'var(--text-secondary)'
                            }}>
                                +{cls.subjects.length - 5}
                            </span>
                        )}
                    </div>
                )}

                {/* View Options Toggle */}
                <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: showStudents ? '0.75rem' : '1.5rem' }}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowStudents(!showStudents); }}
                            style={{
                                flex: 1, padding: '0.5rem', borderRadius: '8px',
                                border: showStudents ? '2px solid var(--primary)' : '1px solid #e2e8f0',
                                background: showStudents ? '#eff6ff' : 'white',
                                color: showStudents ? 'var(--primary)' : 'var(--text-secondary)',
                                fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            📋 List View
                        </button>
                    </div>
                </div>

                {showStudents && (
                    <div className="animate-fade-in-up" style={{ marginBottom: '1.5rem' }}>
                        {/* Filter Tabs */}
                        <div style={{ display: 'flex', background: 'white', padding: '4px', borderRadius: '10px', marginBottom: '1rem', border: '1px solid #e2e8f0' }}>
                            <button
                                onClick={(e) => { e.stopPropagation(); setFilter('all'); }}
                                style={{
                                    flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer',
                                    background: filter === 'all' ? '#f1f5f9' : 'transparent',
                                    color: filter === 'all' ? 'var(--text-main)' : 'var(--text-muted)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                All
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setFilter('present'); }}
                                style={{
                                    flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer',
                                    background: filter === 'present' ? '#dcfce7' : 'transparent',
                                    color: filter === 'present' ? '#166534' : 'var(--text-muted)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Present
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setFilter('absent'); }}
                                style={{
                                    flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer',
                                    background: filter === 'absent' ? '#fee2e2' : 'transparent',
                                    color: filter === 'absent' ? '#991b1b' : 'var(--text-muted)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Absent
                            </button>
                        </div>


                        {loadingStudents ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                                <Loader2 className="animate-spin" size={20} color="var(--primary)" />
                            </div>
                        ) : filteredStudents.length === 0 ? (
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem', background: 'white', borderRadius: '12px' }}>
                                No students marked as {filter === 'all' ? 'enrolled' : filter}.
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '0.25rem' }} className="custom-scrollbar">
                                {filteredStudents.map(student => (
                                    <div key={student.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                                        background: 'white', padding: '0.6rem', borderRadius: '10px',
                                        border: '1px solid #e2e8f0', transition: 'all 0.2s'
                                    }}>
                                        <div style={{
                                            width: '36px', height: '36px', borderRadius: '10px',
                                            background: '#f8fafc', overflow: 'hidden', flexShrink: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            border: '1px solid #f1f5f9'
                                        }}>
                                            {student.profilePic ? (
                                                <img src={student.profilePic} alt={student.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <User size={18} color="#94a3b8" />
                                            )}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {student.name}
                                            </p>
                                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                                                Roll No: {student.rollNo || 'N/A'}
                                            </p>
                                        </div>

                                        {/* Status Toggle (Principal can also mark if needed) */}
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const nextStatus = student.status === 'present' ? 'absent' : 'present';
                                                handleMarkStatus(student.id, nextStatus);
                                            }}
                                            style={{
                                                padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: '800',
                                                background: student.status === 'present' ? '#dcfce7' : '#fee2e2',
                                                color: student.status === 'present' ? '#10b981' : '#ef4444',
                                                cursor: 'pointer', border: '1px solid transparent',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {student.status === 'present' ? 'PRESENT' : 'ABSENT'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Save Button for Principal */}
                        <button
                            onClick={handleSaveAttendance}
                            disabled={isSaving || studentsList.length === 0}
                            style={{
                                width: '100%', marginTop: '1rem', padding: '0.85rem',
                                borderRadius: '12px', background: 'var(--primary)', color: 'white',
                                border: 'none', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
                                opacity: (isSaving || studentsList.length === 0) ? 0.6 : 1
                            }}
                        >
                            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                            {isSaving ? 'Saving Attendance...' : "Save Today's Attendance"}
                        </button>
                    </div>
                )}



                <div style={{ display: 'flex', gap: '0.75rem' }}>

                    <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/classes/${cls.id}`); }}
                        style={{
                            flex: 1, padding: '0.75rem',
                            background: 'white', border: `1px solid ${themeLight}`, borderRadius: '8px',
                            color: themeColor, fontWeight: '600', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                        }}>
                        Details <ChevronRight size={16} />
                    </button>

                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit(cls); }}
                        style={{
                            padding: '0.75rem',
                            background: 'white', border: `1px solid ${themeLight}`, borderRadius: '8px',
                            color: themeColor, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                        title="Edit Class (Teacher/Subjects)"
                    >
                        <Edit size={16} />
                    </button>

                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(cls.id); }}
                        style={{
                            padding: '0.75rem',
                            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
                            color: '#ef4444', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                        title="Delete Class"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

const Classes = () => {
    const [showAddClass, setShowAddClass] = useState(false);
    const [newClass, setNewClass] = useState({
        name: '',
        teacher: '',
        subjects: []
    });
    const [classes, setClasses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [schoolId, setSchoolId] = useState(null);

    const subjectOptions = [
        'English', 'Urdu', 'Mathematics', 'Islamiyat', 'QURAN',
        'Social Study', 'Art', 'Science', 'Biology', 'Chemistry', 'Physic'
    ];

    // Initialize User & School ID
    // Initialize User & School ID
    useEffect(() => {
        const fetchUser = async () => {
            // Priority 1: Check Manual Session (Legacy/Bypass)
            const manualSession = localStorage.getItem('manual_session');
            if (manualSession) {
                try {
                    const userData = JSON.parse(manualSession);
                    if (userData.schoolId) {
                        setSchoolId(userData.schoolId);
                        return;
                    }
                } catch (e) {
                    console.error("Session parse error", e);
                }
            }

            // Priority 2: Check Standard Firebase Auth
            // We need to wait for auth to initialize
            const unsubscribe = auth.onAuthStateChanged(async (user) => {
                if (user) {
                    try {
                        const tokenResult = await user.getIdTokenResult();
                        const claims = tokenResult.claims;
                        if (claims.schoolId) {
                            setSchoolId(claims.schoolId);
                        } else {
                            console.error("No School ID claim found on user");
                        }
                    } catch (e) {
                        console.error("Error fetching claims", e);
                    }
                } else {
                    console.log("No authenticated user found");
                }
                setLoading(false);
            });

            return unsubscribe; // Cleanup listener
        };

        const cleanup = fetchUser();
        return () => {
            if (cleanup && typeof cleanup === 'function') cleanup();
        };
    }, []);

    // Customize sort order: Nursery triggers -2, Prep triggers -1, others parse number
    const getClassOrder = (name) => {
        if (!name || typeof name !== 'string') return 0;
        const lower = name.toLowerCase();
        if (lower.includes('nursery')) return -2;
        if (lower.includes('prep')) return -1;
        return parseInt(name.replace(/\D/g, '')) || 0;
    };

    // Fetch Classes
    useEffect(() => {
        if (!schoolId) return;

        const q = query(collection(db, `schools/${schoolId}/classes`));
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const classesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Seed default classes if none exist
            if (classesData.length === 0) {
                // Backend now handles auto-provisioning of classes on school creation.
                // We do nothing here to avoid conflicts or client-side spam.
            }

            // Enhanced Sort
            classesData.sort((a, b) => {
                return getClassOrder(a.name) - getClassOrder(b.name);
            });

            setClasses(classesData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching classes:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [schoolId]);

    const handleSubjectToggle = (subject) => {
        setNewClass(prev => {
            const subjects = prev.subjects.includes(subject)
                ? prev.subjects.filter(s => s !== subject)
                : [...prev.subjects, subject];
            return { ...prev, subjects };
        });
    };

    const handleAddClass = async (e) => {
        e.preventDefault();
        if (!schoolId) return;

        try {
            await addDoc(collection(db, `schools/${schoolId}/classes`), {
                name: newClass.name,
                teacher: newClass.teacher,
                teacherId: newClass.teacherId || null,
                students: 0, // Default 0 for new class
                subjects: newClass.subjects,
                createdAt: new Date()
            });
            setShowAddClass(false);
            setNewClass({ name: '', teacher: '', teacherId: null, subjects: [] });
        } catch (error) {
            console.error("Error adding class:", error);
            alert("Failed to add class. Please try again.");
        }
    };

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [classToDelete, setClassToDelete] = useState(null);
    const [confirmPassword, setConfirmPassword] = useState('');
    const [deleteError, setDeleteError] = useState('');

    const handleDeleteClick = (classId) => {
        setClassToDelete(classId);
        setShowDeleteConfirm(true);
        setConfirmPassword('');
        setDeleteError('');
    };

    const confirmDelete = async (e) => {
        e.preventDefault();
        setDeleteError('');

        // Verify Password Logic
        let isVerified = false;

        // Check Manual Session First
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            // In a real app we would check against the DB, but since we don't have the password stored in plaintext locally
            // except potentially in a very insecure way if we did that (which we shouldn't),
            // We need to re-verify against the firestore record.

            try {
                const userData = JSON.parse(manualSession);
                const userDocRef = doc(db, `schools/${schoolId}/users`, userData.uid);
                // We have to fetch the doc again to compare password
                // Note: Storing plaintext passwords is NOT secure. This is following the existing pattern of the app provided.
                const snapshot = await import('firebase/firestore').then(mod => mod.getDoc(userDocRef));

                if (snapshot.exists() && snapshot.data().manualPassword === confirmPassword) {
                    isVerified = true;
                }
            } catch (err) {
                console.error("Verification failed", err);
            }
        } else if (auth.currentUser) {
            // For standard auth, we'd normally re-authenticate
            // For this quick implementation/demo, we might skip or require a re-login
            // Let's assume manual password check for now as requested by user context typically
            setDeleteError("Standard Auth re-login not implemented in this demo step.");
            return;
        }

        if (isVerified) {
            try {
                await deleteDoc(doc(db, `schools/${schoolId}/classes`, classToDelete));
                setShowDeleteConfirm(false);
                setClassToDelete(null);
            } catch (error) {
                console.error("Error deleting class:", error);
                setDeleteError("Failed to delete. Try again.");
            }
        } else {
            setDeleteError("Incorrect password.");
        }
    };

    const [showEditClass, setShowEditClass] = useState(false);
    const [editingClass, setEditingClass] = useState(null);

    const handleEditClick = (cls) => {
        setEditingClass({ ...cls });
        setShowEditClass(true);
    };

    const [teachers, setTeachers] = useState([]);

    // Fetch Teachers for Dropdown
    useEffect(() => {
        if (!schoolId) return;
        const q = query(collection(db, `schools/${schoolId}/teachers`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const teachersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            teachersData.sort((a, b) => a.name.localeCompare(b.name));
            setTeachers(teachersData);
        }, (error) => {
            console.error("Error fetching teachers:", error);
        });
        return () => unsubscribe();
    }, [schoolId]);

    const handleUpdateClass = async (e) => {
        e.preventDefault();
        if (!schoolId || !editingClass) return;

        try {
            const classRef = doc(db, `schools/${schoolId}/classes`, editingClass.id);
            await updateDoc(classRef, {
                teacher: editingClass.teacher, // Name (Legacy/UI)
                teacherId: editingClass.teacherId || null, // ID (Safe/Backend)
                subjects: editingClass.subjects
            });
            setShowEditClass(false);
            setEditingClass(null);
        } catch (error) {
            console.error("Error updating class:", error);
            alert("Failed to update class.");
        }
    };

    const handleTeacherChange = (e) => {
        const selectedId = e.target.value;
        if (!selectedId) {
            setEditingClass({ ...editingClass, teacher: '', teacherId: null });
            return;
        }
        const selectedTeacher = teachers.find(t => t.id === selectedId);
        if (selectedTeacher) {
            setEditingClass({ ...editingClass, teacher: selectedTeacher.name, teacherId: selectedTeacher.id });
        }
    };

    const handleEditSubjectToggle = (subject) => {
        setEditingClass(prev => {
            const subjects = prev.subjects.includes(subject)
                ? prev.subjects.filter(s => s !== subject)
                : [...prev.subjects, subject];
            return { ...prev, subjects };
        });
    };

    // 3. Stats Aggregation
    const [totalStudentsCount, setTotalStudentsCount] = useState(0);

    useEffect(() => {
        if (!schoolId || classes.length === 0) return;

        const unsubscribers = [];
        const classStudentCounts = new Map();

        const updateGrandTotal = () => {
            let grandTotal = 0;
            classStudentCounts.forEach(count => grandTotal += count);
            setTotalStudentsCount(grandTotal);
        };

        classes.forEach(cls => {
            const q = query(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
            const unsub = onSnapshot(q, (snapshot) => {
                classStudentCounts.set(cls.id, snapshot.size);
                updateGrandTotal();
            });
            unsubscribers.push(unsub);
        });

        return () => unsubscribers.forEach(u => u());
    }, [schoolId, classes]);

    return (
        <div className="animate-fade-in-up">
            {/* ... existing header ... */}

            {/* Edit Class Modal */}
            {showEditClass && editingClass && (
                <div style={{
                    position: 'fixed', inset: 0,
                    zIndex: 1000,
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem'
                }}>
                    <div className="card custom-scrollbar" style={{
                        width: '100%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto',
                        padding: '2rem', background: 'white', borderRadius: '24px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Edit Class: {editingClass.name}</h2>
                            <button onClick={() => setShowEditClass(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={24} color="var(--text-secondary)" />
                            </button>
                        </div>

                        <form onSubmit={handleUpdateClass}>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                    Assign Teacher
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <select
                                        value={editingClass.teacherId || ''}
                                        onChange={handleTeacherChange}
                                        style={{
                                            width: '100%', padding: '0.75rem', borderRadius: '8px',
                                            border: '1px solid #e2e8f0', outline: 'none',
                                            fontSize: '0.95rem', appearance: 'none',
                                            backgroundColor: 'white', cursor: 'pointer'
                                        }}
                                    >
                                        <option value="">Select a Teacher</option>
                                        {teachers.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={16} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }} />
                                </div>
                                {(!teachers || teachers.length === 0) && (
                                    <p style={{ fontSize: '0.8rem', color: '#f59e0b', marginTop: '0.5rem' }}>
                                        No teachers found. Please add teachers in the Teachers section first.
                                    </p>
                                )}
                            </div>

                            <div style={{ marginBottom: '2rem' }}>
                                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                                    Manage Subjects
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                                    {subjectOptions.map((subj) => (
                                        <div
                                            key={subj}
                                            onClick={() => handleEditSubjectToggle(subj)}
                                            style={{
                                                padding: '0.75rem',
                                                borderRadius: '8px',
                                                border: editingClass.subjects.includes(subj) ? '1px solid var(--primary)' : '1px solid #e2e8f0',
                                                background: editingClass.subjects.includes(subj) ? '#eff6ff' : 'white',
                                                cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{
                                                width: '20px', height: '20px', borderRadius: '4px',
                                                border: editingClass.subjects.includes(subj) ? 'none' : '2px solid #cbd5e1',
                                                background: editingClass.subjects.includes(subj) ? 'var(--primary)' : 'transparent',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                {editingClass.subjects.includes(subj) && <span style={{ color: 'white', fontSize: '14px' }}>✓</span>}
                                            </div>
                                            <span style={{ fontSize: '0.9rem', color: editingClass.subjects.includes(subj) ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: '500' }}>
                                                {subj}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowEditClass(false)}
                                    style={{
                                        padding: '0.75rem 1.5rem', borderRadius: '8px',
                                        background: 'transparent', border: '1px solid #e2e8f0',
                                        cursor: 'pointer', fontWeight: '600', color: 'var(--text-secondary)'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-primary"
                                    style={{
                                        padding: '0.75rem 1.5rem', borderRadius: '8px',
                                        background: 'var(--primary)', border: 'none',
                                        cursor: 'pointer', fontWeight: '600', color: 'white',
                                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
                                    }}
                                >
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '2rem'
            }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                        Classes & Sections
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Manage class structures, subjects, and teacher assignments</p>
                </div>
                <button
                    onClick={() => setShowAddClass(true)}
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
                    <span>Add New Class</span>
                </button>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                {[
                    {
                        label: 'Total Classes',
                        value: classes.length,
                        icon: BookOpen,
                        gradient: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                        shadow: 'rgba(99, 102, 241, 0.4)'
                    },
                    {
                        label: 'Total Students',
                        value: totalStudentsCount,
                        icon: Users,
                        gradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                        shadow: 'rgba(16, 185, 129, 0.4)'
                    },
                    {
                        label: 'Avg Class Size',
                        value: Math.round(totalStudentsCount / (classes.length || 1)),
                        icon: Users,
                        gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
                        shadow: 'rgba(14, 165, 233, 0.4)'
                    },
                    {
                        label: 'Total Subjects',
                        value: subjectOptions.length,
                        icon: BookOpen,
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
                        {/* 2D Geometric Pattern */}
                        <div style={{
                            position: 'absolute',
                            top: '-15%',
                            right: '-10%',
                            width: '100px',
                            height: '100px',
                            background: 'rgba(255, 255, 255, 0.12)',
                            borderRadius: '20px',
                            transform: 'rotate(20deg)',
                            zIndex: 1
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

            {/* Classes Grid */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                    <Loader2 className="animate-spin" size={32} color="var(--primary)" />
                </div>
            ) : classes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <BookOpen size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p style={{ marginBottom: '1.5rem' }}>No classes found. You can set up the default structure instantly.</p>
                    <button
                        onClick={async () => {
                            console.log("Setup button clicked. School ID:", schoolId);
                            if (!schoolId) {
                                // Try to get from localStorage one more time as a fallback
                                const manualSession = localStorage.getItem('manual_session');
                                if (manualSession) {
                                    const userData = JSON.parse(manualSession);
                                    if (userData.schoolId) {
                                        setSchoolId(userData.schoolId);
                                        // But we can't proceed immediately with setSchoolId (async), so alert user to refresh
                                        alert("School ID found in storage but not loaded. Reloading...");
                                        window.location.reload();
                                        return;
                                    }
                                }
                                alert("Error: School ID is missing. Please log out and log in again.");
                                return;
                            }

                            setLoading(true);
                            try {
                                const DEFAULT_CLASSES = [
                                    'Nursery', 'Prep',
                                    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
                                    'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'
                                ];

                                const batch = writeBatch(db);
                                DEFAULT_CLASSES.forEach(name => {
                                    const docRef = doc(collection(db, `schools/${schoolId}/classes`));
                                    batch.set(docRef, {
                                        name,
                                        teacher: '',
                                        students: 0,
                                        subjects: ['English', 'Urdu', 'Mathematics', 'Islamiyat'],
                                        createdAt: new Date()
                                    });
                                });

                                await batch.commit();
                                // No manual reload needed, onSnapshot will pick it up
                            } catch (error) {
                                console.error("Error seeding classes:", error);
                                alert("Failed to create default classes.");
                                setLoading(false);
                            }
                        }}
                        className="btn-primary"
                        style={{
                            padding: '0.75rem 1.5rem',
                            borderRadius: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            background: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
                        }}
                    >
                        Setup Default Classes
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                    {classes.map((cls) => (
                        <ClassCard key={cls.id} cls={cls} onDelete={handleDeleteClick} onEdit={handleEditClick} schoolId={schoolId} />
                    ))}
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
                            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-main)' }}>Confirm Deletion</h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                Are you sure you want to delete this class? This action cannot be undone.
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
                                    Delete Class
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Class Modal */}
            {showAddClass && (
                <div style={{
                    position: 'fixed', inset: 0,
                    zIndex: 1000,
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem'
                }}>
                    <div className="card custom-scrollbar" style={{
                        width: '100%',
                        maxWidth: '600px',
                        maxHeight: '80vh',
                        marginTop: '4rem',
                        overflowY: 'auto',
                        padding: '2rem',
                        animation: 'slideUp 0.3s ease-out',
                        position: 'relative',
                        background: 'white',
                        borderRadius: '24px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Add New Class</h2>
                            <button onClick={() => setShowAddClass(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={24} color="var(--text-secondary)" />
                            </button>
                        </div>

                        <form onSubmit={handleAddClass}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                        Class Name
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Class 1A"
                                        value={newClass.name}
                                        onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                                        style={{
                                            width: '100%', padding: '0.75rem', borderRadius: '8px',
                                            border: '1px solid #e2e8f0', outline: 'none',
                                            fontSize: '0.95rem'
                                        }}
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                        Class Assigned to
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <select
                                            value={newClass.teacherId || ''}
                                            onChange={(e) => {
                                                const selectedId = e.target.value;
                                                if (!selectedId) {
                                                    setNewClass({ ...newClass, teacher: '', teacherId: null });
                                                } else {
                                                    const selectedTeacher = teachers.find(t => t.id === selectedId);
                                                    setNewClass({ ...newClass, teacher: selectedTeacher?.name || '', teacherId: selectedId });
                                                }
                                            }}
                                            style={{
                                                width: '100%', padding: '0.75rem', borderRadius: '8px',
                                                border: '1px solid #e2e8f0', outline: 'none',
                                                fontSize: '0.95rem', appearance: 'none',
                                                backgroundColor: 'white', cursor: 'pointer'
                                            }}
                                            required
                                        >
                                            <option value="">Select a Teacher</option>
                                            {teachers.map(t => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={16} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }} />
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginBottom: '2rem' }}>
                                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                                    Subjects to add to class
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                                    {subjectOptions.map((subj) => (
                                        <div
                                            key={subj}
                                            onClick={() => handleSubjectToggle(subj)}
                                            style={{
                                                padding: '0.75rem',
                                                borderRadius: '8px',
                                                border: newClass.subjects.includes(subj) ? '1px solid var(--primary)' : '1px solid #e2e8f0',
                                                background: newClass.subjects.includes(subj) ? '#eff6ff' : 'white',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.75rem',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{
                                                width: '20px', height: '20px', borderRadius: '4px',
                                                border: newClass.subjects.includes(subj) ? 'none' : '2px solid #cbd5e1',
                                                background: newClass.subjects.includes(subj) ? 'var(--primary)' : 'transparent',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                {newClass.subjects.includes(subj) && <span style={{ color: 'white', fontSize: '14px' }}>✓</span>}
                                            </div>
                                            <span style={{ fontSize: '0.9rem', color: newClass.subjects.includes(subj) ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: '500' }}>
                                                {subj}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowAddClass(false)}
                                    style={{
                                        padding: '0.75rem 1.5rem', borderRadius: '8px',
                                        background: 'transparent', border: '1px solid #e2e8f0',
                                        cursor: 'pointer', fontWeight: '600', color: 'var(--text-secondary)'
                                    }}
                                >
                                    Cancel
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
                                    Add Class
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}


        </div>
    );
};

export default Classes;

// Verified Clean
