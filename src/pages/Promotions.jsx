import React, { useState, useEffect } from 'react';
import {
    TrendingUp, ArrowRight, CheckCircle2, XCircle,
    AlertCircle, GraduationCap, ChevronRight, Loader2,
    Users, ArrowUpRight
} from 'lucide-react';
import { db, auth } from '../firebase';
import {
    collection, getDocs, doc, writeBatch,
    query, orderBy, getDoc, setDoc, deleteDoc
} from 'firebase/firestore';

const Promotions = () => {
    const [schoolId, setSchoolId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);

    // Processing States
    const [processing, setProcessing] = useState(false);
    const [promotionStatus, setPromotionStatus] = useState(null); // 'success' | 'error'

    // Initialize User & School ID
    useEffect(() => {
        const fetchUser = () => {
            const manualSession = localStorage.getItem('manual_session');
            if (manualSession) {
                const userData = JSON.parse(manualSession);
                setSchoolId(userData.schoolId);
            } else if (auth.currentUser) {
                // Fallback for standard auth if needed
            }
        };
        fetchUser();
    }, []);

    // Fetch Classes
    useEffect(() => {
        if (!schoolId) return;

        const fetchClasses = async () => {
            try {
                const q = query(collection(db, `schools/${schoolId}/classes`));
                const snapshot = await getDocs(q);
                const classesData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                // Sort logic reused from Classes.jsx
                const getClassOrder = (name) => {
                    if (!name || typeof name !== 'string') return 0;
                    const lower = name.toLowerCase();
                    if (lower.includes('nursery')) return -2;
                    if (lower.includes('prep')) return -1;
                    return parseInt(name.replace(/\D/g, '')) || 0;
                };

                classesData.sort((a, b) => getClassOrder(a.name) - getClassOrder(b.name));
                setClasses(classesData);
                setLoading(false);
            } catch (error) {
                console.error("Error fetching classes:", error);
                setLoading(false);
            }
        };
        fetchClasses();
    }, [schoolId]);

    // Handle Class Selection
    const handleClassSelect = async (cls) => {
        if (selectedClass?.id === cls.id) return;

        setSelectedClass(cls);
        setStudents([]);
        setLoadingStudents(true);
        setPromotionStatus(null);

        try {
            const studentsRef = collection(db, `schools/${schoolId}/classes/${cls.id}/students`);
            const snapshot = await getDocs(studentsRef);

            const fetchedStudents = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                promote: true // Default to promote
            }));

            // Identify Next Class
            const currentIndex = classes.findIndex(c => c.id === cls.id);
            const nextClass = classes[currentIndex + 1] || null;

            setStudents(fetchedStudents.map(s => ({
                ...s,
                nextClassId: nextClass ? nextClass.id : 'graduate',
                nextClassName: nextClass ? nextClass.name : 'Graduated'
            })));

        } catch (error) {
            console.error("Error fetching students:", error);
        } finally {
            setLoadingStudents(false);
        }
    };

    const toggleStudentPromotion = (studentId) => {
        setStudents(prev => prev.map(s =>
            s.id === studentId ? { ...s, promote: !s.promote } : s
        ));
    };

    const [showConfirmModal, setShowConfirmModal] = useState(false);

    const handleBulkPromote = async () => {
        // Trigger modal instead of window.confirm
        setShowConfirmModal(true);
    };

    const processPromotions = async () => {
        setShowConfirmModal(false);
        setProcessing(true);

        try {
            const batch = writeBatch(db);
            let operationCount = 0;
            const BATCH_LIMIT = 450; // Firestore batch limit safety

            for (const student of students) {
                if (student.promote) {
                    // 1. If Graduating
                    if (student.nextClassId === 'graduate') {
                        // Move to alumni collection (optional, creating structure)
                        const alumniRef = doc(db, `schools/${schoolId}/alumni`, student.id);
                        batch.set(alumniRef, {
                            ...student,
                            graduatedAt: new Date(),
                            previousClassId: selectedClass.id
                        });

                        // Delete from current class
                        const currentStudentRef = doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id);
                        batch.delete(currentStudentRef);
                    }
                    // 2. If Moving to Next Class
                    else if (student.nextClassId) {
                        const nextClassRef = doc(db, `schools/${schoolId}/classes/${student.nextClassId}/students`, student.id);
                        batch.set(nextClassRef, {
                            ...student,
                            promotedAt: new Date(),
                            previousClassId: selectedClass.id
                            // Keep stats or reset? Usually reset for new year, but keeping history is good.
                            // For simplicity, we just move the doc.
                        });

                        // Delete from current class
                        const currentStudentRef = doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id);
                        batch.delete(currentStudentRef);

                        // Increment/Decrement counts (optional, better with cloud functions but we do basic here)
                        // Note: We can't easily do atomic counters for multiple docs in one batch mixed with deletes/sets efficiently without knowing current counts
                        // For now we rely on the UI fetching counts dynamically
                    }
                } else {
                    // Logic for retained students?
                    // Maybe just update a field "retainedYear: 202X"
                    const currentStudentRef = doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id);
                    batch.update(currentStudentRef, {
                        retained: true,
                        retainedAt: new Date()
                    });
                }

                operationCount++;
                // If batch limit reached, commit and start new (simplified, assuming < 500 students usually)
            }

            if (operationCount > 0) {
                await batch.commit();
            }

            setPromotionStatus('success');
            // Refresh logic - maybe clear selection or refetch
            setSelectedClass(null);
            setStudents([]);
            // Optional: Reload classes to update counts if we were tracking them in local state
        } catch (error) {
            console.error("Promotion failed:", error);
            setPromotionStatus('error');
        } finally {
            setProcessing(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                <Loader2 className="animate-spin" size={32} color="var(--primary)" />
            </div>
        );
    }

    return (
        <div className="animate-fade-in-up">
            {/* Header */}
            <div style={{ marginBottom: '2.5rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                    Annual Promotions
                </h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Manage end-of-year student promotions and graduations.
                </p>
            </div>

            {/* Success Message */}
            {promotionStatus === 'success' && (
                <div className="card" style={{
                    marginBottom: '2rem', padding: '1.5rem',
                    background: '#ecfdf5', border: '1px solid #a7f3d0',
                    display: 'flex', alignItems: 'center', gap: '1rem'
                }}>
                    <CheckCircle2 color="#059669" size={24} />
                    <div>
                        <h3 style={{ fontWeight: '700', color: '#065f46' }}>Promotions Completed Successfully</h3>
                        <p style={{ color: '#047857', fontSize: '0.9rem' }}>Student records have been updated.</p>
                    </div>
                </div>
            )}

            {/* 1. Class Selector */}
            <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '1rem' }}>
                    1. Select Current Class
                </h3>
                <div className="custom-scrollbar" style={{
                    display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem',
                    scrollSnapType: 'x mandatory'
                }}>
                    {classes.map((cls) => {
                        const isSelected = selectedClass?.id === cls.id;
                        return (
                            <div
                                key={cls.id}
                                onClick={() => handleClassSelect(cls)}
                                className={isSelected ? 'card' : ''}
                                style={{
                                    minWidth: '200px',
                                    padding: '1.25rem',
                                    borderRadius: '16px',
                                    border: isSelected ? '2px solid var(--primary)' : '1px solid #e2e8f0',
                                    background: isSelected ? '#eef2ff' : 'white',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    scrollSnapAlign: 'start',
                                    position: 'relative',
                                    boxShadow: isSelected ? '0 10px 25px -5px rgba(79, 70, 229, 0.15)' : 'none'
                                }}
                            >
                                {isSelected && (
                                    <div style={{
                                        position: 'absolute', top: '10px', right: '10px',
                                        background: 'var(--primary)', borderRadius: '50%',
                                        width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <CheckCircle2 size={14} color="white" />
                                    </div>
                                )}
                                <h4 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.5rem', color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>
                                    {cls.name}
                                </h4>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    <Users size={14} />
                                    <span>{cls.students || 0} Students</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 2. Student List & Action Area */}
            {selectedClass && (
                <div className="animate-fade-in-up">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '1rem' }}>
                        <div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)' }}>
                                2. Review Candidates
                            </h3>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                Promoting from <b>{selectedClass.name}</b>
                            </p>
                        </div>

                        {students.length > 0 && (
                            <div style={{
                                padding: '0.5rem 1rem', background: 'white', borderRadius: '8px',
                                border: '1px solid #e2e8f0', fontSize: '0.9rem', fontWeight: '600'
                            }}>
                                Total Candidates: {students.length}
                            </div>
                        )}
                    </div>

                    {loadingStudents ? (
                        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                            <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
                            <p style={{ color: 'var(--text-secondary)' }}>Loading students...</p>
                        </div>
                    ) : students.length === 0 ? (
                        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                            <AlertCircle size={32} style={{ margin: '0 auto 1rem', color: '#fbbf24' }} />
                            <p style={{ color: 'var(--text-secondary)' }}>No students found in this class.</p>
                        </div>
                    ) : (
                        <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <tr>
                                        <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>Student Name</th>
                                        <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>Roll No</th>
                                        <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>Current Status</th>
                                        <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>Action Data</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {students.map((student, idx) => (
                                        <tr key={student.id} className="list-item-hover" style={{ borderBottom: idx !== students.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                            <td style={{ padding: '1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <div style={{
                                                        width: '36px', height: '36px', borderRadius: '50%', background: '#e0e7ff',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', color: 'var(--primary)'
                                                    }}>
                                                        {student.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p style={{ fontWeight: '600', color: 'var(--text-main)' }}>{student.name}</p>
                                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{student.fatherName}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: '500' }}>{student.rollNo || '-'}</td>
                                            <td style={{ padding: '1rem' }}>
                                                {/* Use mock performance or real if available */}
                                                <span style={{
                                                    padding: '0.25rem 0.75rem', borderRadius: '99px', fontSize: '0.75rem', fontWeight: '600',
                                                    background: '#f1f5f9', color: '#475569'
                                                }}>
                                                    Pending Review
                                                </span>
                                            </td>
                                            <td style={{ padding: '1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                                                    <div
                                                        onClick={() => toggleStudentPromotion(student.id)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer',
                                                            padding: '0.5rem 1rem', borderRadius: '8px',
                                                            background: student.promote ? '#ecfdf5' : '#fef2f2',
                                                            border: student.promote ? '1px solid #6ee7b7' : '1px solid #fecaca',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        {student.promote ? (
                                                            <>
                                                                <CheckCircle2 size={16} color="#059669" />
                                                                <span style={{ color: '#047857', fontWeight: '600', fontSize: '0.9rem' }}>Promote</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <XCircle size={16} color="#dc2626" />
                                                                <span style={{ color: '#991b1b', fontWeight: '600', fontSize: '0.9rem' }}>Retain</span>
                                                            </>
                                                        )}
                                                    </div>

                                                    <ArrowRight size={16} color="#cbd5e1" />

                                                    <div style={{
                                                        padding: '0.5rem 1rem', borderRadius: '8px',
                                                        background: student.promote ? '#eef2ff' : '#f1f5f9',
                                                        color: student.promote ? 'var(--primary)' : '#94a3b8',
                                                        fontWeight: '600', fontSize: '0.9rem', border: '1px solid transparent',
                                                        borderColor: student.promote ? '#c7d2fe' : 'transparent'
                                                    }}>
                                                        {student.promote ? student.nextClassName : selectedClass.name}
                                                        {student.promote && student.nextClassId === 'graduate' && <GraduationCap size={14} style={{ marginLeft: '6px', verticalAlign: 'middle' }} />}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Footer Actions */}
                            <div style={{ padding: '1.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginRight: 'auto' }}>
                                    <AlertCircle size={16} />
                                    <span style={{ fontSize: '0.85rem' }}>Review all actions before confirming. Can't be undone easily.</span>
                                </div>
                                <button
                                    onClick={() => setSelectedClass(null)}
                                    style={{
                                        padding: '0.75rem 1.5rem', borderRadius: '8px',
                                        background: 'transparent', border: '1px solid #cbd5e1',
                                        cursor: 'pointer', fontWeight: '600', color: 'var(--text-secondary)'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleBulkPromote}
                                    disabled={processing}
                                    className="btn-primary"
                                    style={{
                                        padding: '0.75rem 2rem', borderRadius: '8px',
                                        cursor: processing ? 'not-allowed' : 'pointer', fontWeight: '600',
                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        opacity: processing ? 0.7 : 1
                                    }}
                                >
                                    {processing ? <Loader2 className="animate-spin" size={18} /> : <TrendingUp size={18} />}
                                    <span>Process {students.filter(s => s.promote).length} Promotions</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
            {/* Confirmation Modal */}
            {showConfirmModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1100,
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="card" style={{ maxWidth: '450px', width: '100%', padding: '2rem', animation: 'fadeInUp 0.3s ease-out' }}>
                        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                            <div style={{
                                width: '60px', height: '60px', borderRadius: '50%', background: '#eef2ff',
                                color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem'
                            }}>
                                <AlertCircle size={32} />
                            </div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-main)' }}>Confirm Promotions</h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                                You are about to promote <b>{students.filter(s => s.promote).length}</b> students.
                                <br />
                                This will move them to their next classes and remove them from the current class. This action cannot be easily undone.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                onClick={() => setShowConfirmModal(false)}
                                style={{
                                    flex: 1, padding: '0.75rem', borderRadius: '8px',
                                    background: 'transparent', border: '1px solid #e2e8f0',
                                    cursor: 'pointer', fontWeight: '600', color: 'var(--text-secondary)'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={processPromotions}
                                className="btn-primary"
                                style={{
                                    flex: 1, padding: '0.75rem', borderRadius: '8px',
                                    cursor: 'pointer', fontWeight: '600',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                                }}
                            >
                                <CheckCircle2 size={18} />
                                Confirm & Process
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Promotions;
