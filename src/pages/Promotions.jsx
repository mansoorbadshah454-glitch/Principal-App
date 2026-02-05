import React, { useState, useEffect } from 'react';
import {
    TrendingUp, ArrowRight, CheckCircle2, XCircle,
    AlertCircle, GraduationCap, ChevronRight, Loader2,
    Users, ArrowUpRight, UserPlus, Search, ArrowDown
} from 'lucide-react';

import { db, auth } from '../firebase';
import {
    collection, getDocs, doc, writeBatch,
    query, orderBy, getDoc, setDoc, deleteDoc, addDoc
} from 'firebase/firestore';

const Promotions = () => {
    const [schoolId, setSchoolId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Processing States
    const [processing, setProcessing] = useState(false);
    const [promotionStatus, setPromotionStatus] = useState(null); // 'success' | 'error'

    // Helper: Determine class order for sorting and splitting
    const getClassOrder = (name) => {
        if (!name || typeof name !== 'string') return 0;
        const lower = name.toLowerCase();
        if (lower.includes('nursery')) return -2;
        if (lower.includes('prep')) return -1;
        return parseInt(name.replace(/\D/g, '')) || 0;
    };

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
        setSearchQuery('');
        setLoadingStudents(true);
        setPromotionStatus(null);

        try {
            const studentsRef = collection(db, `schools/${schoolId}/classes/${cls.id}/students`);
            const snapshot = await getDocs(studentsRef);

            // Identify Next & Previous Class
            const currentIndex = classes.findIndex(c => c.id === cls.id);
            const nextClass = classes[currentIndex + 1] || null;
            const previousClass = classes[currentIndex - 1] || null;

            const fetchedStudents = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                promotionStatus: 'promote', // 'promote' | 'retain' | 'demote'
                nextClassId: nextClass ? nextClass.id : 'graduate',
                nextClassName: nextClass ? nextClass.name : 'Graduated',
                previousClassId: previousClass ? previousClass.id : null,
                previousClassName: previousClass ? previousClass.name : 'None'
            }));

            setStudents(fetchedStudents);

        } catch (error) {
            console.error("Error fetching students:", error);
        } finally {
            setLoadingStudents(false);
        }
    };

    const handleStatusChange = (studentId, status) => {
        setStudents(prev => prev.map(s =>
            s.id === studentId ? { ...s, promotionStatus: status } : s
        ));
    };

    // Helper: Generate Dummy Students
    const handleGenerateDummy = async () => {
        if (!selectedClass || !schoolId) return;
        setProcessing(true);
        try {
            const dummyNames = [
                "Ali Khan", "Sara Ahmed", "Bilal Hassan", "Zainab Bibi", "Usman Gondal",
                "Ayesha Malik", "Omar Farooq", "Fatima Noor", "Ahmed Raza", "Hina Shah"
            ];

            // Create 5 random students
            const promises = Array.from({ length: 5 }).map((_, i) => {
                const name = dummyNames[Math.floor(Math.random() * dummyNames.length)];
                return addDoc(collection(db, `schools/${schoolId}/classes/${selectedClass.id}/students`), {
                    name: name,
                    fatherName: `Father of ${name.split(' ')[0]}`,
                    rollNo: `R-${Math.floor(1000 + Math.random() * 9000)}`,
                    admissionDate: new Date(),
                    feeStatus: Math.random() > 0.3 ? 'paid' : 'unpaid'
                });
            });

            await Promise.all(promises);

            // Refresh list
            handleClassSelect(selectedClass);

        } catch (error) {
            console.error("Error generating dummy data:", error);
            alert("Failed to generate demo students.");
        } finally {
            setProcessing(false);
        }
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
            // Limit check not strictly needed for UI batch unless > 500, but kept simple

            for (const student of students) {
                const status = student.promotionStatus || (student.promote ? 'promote' : 'retain');

                if (status === 'promote') {
                    // 1. If Graduating
                    if (student.nextClassId === 'graduate') {
                        // Move to alumni collection
                        const alumniRef = doc(db, `schools/${schoolId}/alumni`, student.id);
                        batch.set(alumniRef, {
                            ...student,
                            graduatedAt: new Date(),
                            previousClassId: selectedClass.id
                        });
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
                        });
                        const currentStudentRef = doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id);
                        batch.delete(currentStudentRef);
                    }
                } else if (status === 'demote' && student.previousClassId) {
                    // 3. Demote to Previous Class
                    const prevClassRef = doc(db, `schools/${schoolId}/classes/${student.previousClassId}/students`, student.id);
                    batch.set(prevClassRef, {
                        ...student,
                        demotedAt: new Date(),
                        previousClassId: selectedClass.id
                    });
                    const currentStudentRef = doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id);
                    batch.delete(currentStudentRef);

                } else {
                    // 4. Retain in Current Class (Default or 'retain')
                    const currentStudentRef = doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id);
                    batch.update(currentStudentRef, {
                        retained: true,
                        retainedAt: new Date()
                    });
                }

                operationCount++;
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

                {/* Row 1: Primary (Nursery to Class 6) - Order <= 6 */}
                <div className="custom-scrollbar" style={{
                    display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem', marginBottom: '0.75rem',
                    scrollSnapType: 'x mandatory'
                }}>
                    {classes.filter(c => getClassOrder(c.name) <= 6).map((cls) => {
                        const isSelected = selectedClass?.id === cls.id;
                        return (
                            <div
                                key={cls.id}
                                onClick={() => handleClassSelect(cls)}
                                className={isSelected ? 'card' : ''}
                                style={{
                                    minWidth: '110px',
                                    padding: '0.75rem',
                                    borderRadius: '12px',
                                    border: isSelected ? '2px solid var(--primary)' : '1px solid #e2e8f0',
                                    background: isSelected ? '#eef2ff' : 'white',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    scrollSnapAlign: 'start',
                                    position: 'relative',
                                    boxShadow: isSelected ? '0 4px 12px -2px rgba(79, 70, 229, 0.15)' : 'none',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center'
                                }}
                            >
                                {isSelected && (
                                    <div style={{
                                        position: 'absolute', top: '4px', right: '4px',
                                        background: 'var(--primary)', borderRadius: '50%',
                                        width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <CheckCircle2 size={10} color="white" />
                                    </div>
                                )}
                                <h4 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '0.25rem', color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>
                                    {cls.name}
                                </h4>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    <Users size={12} />
                                    <span>{cls.students || 0}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Row 2: Secondary (Class 7+) - Order > 6 */}
                {classes.some(c => getClassOrder(c.name) > 6) && (
                    <div className="custom-scrollbar" style={{
                        display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem',
                        scrollSnapType: 'x mandatory'
                    }}>
                        {classes.filter(c => getClassOrder(c.name) > 6).map((cls) => {
                            const isSelected = selectedClass?.id === cls.id;
                            return (
                                <div
                                    key={cls.id}
                                    onClick={() => handleClassSelect(cls)}
                                    className={isSelected ? 'card' : ''}
                                    style={{
                                        minWidth: '110px',
                                        padding: '0.75rem',
                                        borderRadius: '12px',
                                        border: isSelected ? '2px solid var(--primary)' : '1px solid #e2e8f0',
                                        background: isSelected ? '#eef2ff' : 'white',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        scrollSnapAlign: 'start',
                                        position: 'relative',
                                        boxShadow: isSelected ? '0 4px 12px -2px rgba(79, 70, 229, 0.15)' : 'none',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        textAlign: 'center'
                                    }}
                                >
                                    {isSelected && (
                                        <div style={{
                                            position: 'absolute', top: '4px', right: '4px',
                                            background: 'var(--primary)', borderRadius: '50%',
                                            width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <CheckCircle2 size={10} color="white" />
                                        </div>
                                    )}
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '0.25rem', color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>
                                        {cls.name}
                                    </h4>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        <Users size={12} />
                                        <span>{cls.students || 0}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 2. Student List & Action Area */}
            {selectedClass && (
                <div className="animate-fade-in-up">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)' }}>
                                2. Review Candidates
                            </h3>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                Promoting from <b>{selectedClass.name}</b>
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            {/* Search Bar */}
                            <div style={{
                                position: 'relative',
                                display: 'flex', alignItems: 'center'
                            }}>
                                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px' }} />
                                <input
                                    type="text"
                                    placeholder="Search by name or roll no..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{
                                        padding: '0.5rem 1rem 0.5rem 2.25rem',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        outline: 'none',
                                        fontSize: '0.9rem',
                                        width: '240px',
                                        color: 'var(--text-main)'
                                    }}
                                />
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
                    </div>

                    {loadingStudents ? (
                        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                            <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
                            <p style={{ color: 'var(--text-secondary)' }}>Loading students...</p>
                        </div>
                    ) : students.length === 0 ? (
                        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                            <AlertCircle size={32} style={{ margin: '0 auto 1rem', color: '#fbbf24' }} />
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>No students found in this class.</p>

                            {/* Demo Helper */}
                            <button
                                onClick={handleGenerateDummy}
                                disabled={processing}
                                style={{
                                    padding: '0.75rem 1.5rem', borderRadius: '8px',
                                    background: '#eff6ff', border: '1px solid #dbeafe',
                                    color: 'var(--primary)', fontWeight: '600',
                                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                                    fontSize: '0.9rem'
                                }}
                            >
                                {processing ? <Loader2 className="animate-spin" size={16} /> : <UserPlus size={16} />}
                                Generate Demo Students
                            </button>
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
                                    {students.filter(s =>
                                        searchQuery === '' ||
                                        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        (s.rollNo && s.rollNo.toString().toLowerCase().includes(searchQuery.toLowerCase()))
                                    ).map((student, idx) => {
                                        const status = student.promotionStatus || 'promote';
                                        return (
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
                                                    <span style={{
                                                        padding: '0.25rem 0.75rem', borderRadius: '99px', fontSize: '0.75rem', fontWeight: '600',
                                                        background: '#f1f5f9', color: '#475569'
                                                    }}>
                                                        Pending Review
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                                                        {/* Retain Button */}
                                                        <button
                                                            onClick={() => handleStatusChange(student.id, 'retain')}
                                                            title="Retain in same class"
                                                            style={{
                                                                padding: '0.5rem', borderRadius: '8px', cursor: 'pointer',
                                                                background: status === 'retain' ? '#fef2f2' : 'transparent',
                                                                border: status === 'retain' ? '1px solid #fecaca' : '1px solid #e2e8f0',
                                                                color: status === 'retain' ? '#dc2626' : '#94a3b8',
                                                                transition: 'all 0.2s'
                                                            }}
                                                        >
                                                            <XCircle size={18} />
                                                        </button>

                                                        {/* Demote Button (Only if previous class exists) */}
                                                        {student.previousClassId && (
                                                            <button
                                                                onClick={() => handleStatusChange(student.id, 'demote')}
                                                                title={`Send to ${student.previousClassName}`}
                                                                style={{
                                                                    padding: '0.5rem', borderRadius: '8px', cursor: 'pointer',
                                                                    background: status === 'demote' ? '#fffbeb' : 'transparent',
                                                                    border: status === 'demote' ? '1px solid #fcd34d' : '1px solid #e2e8f0',
                                                                    color: status === 'demote' ? '#d97706' : '#94a3b8',
                                                                    transition: 'all 0.2s'
                                                                }}
                                                            >
                                                                <ArrowDown size={18} />
                                                            </button>
                                                        )}

                                                        {/* Promote Button */}
                                                        <button
                                                            onClick={() => handleStatusChange(student.id, 'promote')}
                                                            title={`Promote to ${student.nextClassName}`}
                                                            style={{
                                                                padding: '0.5rem', borderRadius: '8px', cursor: 'pointer',
                                                                background: status === 'promote' ? '#ecfdf5' : 'transparent',
                                                                border: status === 'promote' ? '1px solid #6ee7b7' : '1px solid #e2e8f0',
                                                                color: status === 'promote' ? '#059669' : '#94a3b8',
                                                                transition: 'all 0.2s'
                                                            }}
                                                        >
                                                            <CheckCircle2 size={18} />
                                                        </button>

                                                        {/* Destination Indicator */}
                                                        <div style={{
                                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                            marginLeft: '0.5rem', fontSize: '0.85rem', fontWeight: '600',
                                                            color: status === 'promote' ? 'var(--primary)' :
                                                                status === 'retain' ? '#dc2626' : '#d97706'
                                                        }}>
                                                            <ArrowRight size={14} color="#cbd5e1" />
                                                            <span>
                                                                {status === 'promote' ? student.nextClassName :
                                                                    status === 'retain' ? selectedClass.name :
                                                                        student.previousClassName}
                                                            </span>
                                                            {status === 'promote' && student.nextClassId === 'graduate' && <GraduationCap size={14} />}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
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
                                    <span>Process Actions ({students.length})</span>
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
                                You are about to process decisions for <b>{students.length}</b> students.
                                <br />
                                Promoted/Demoted students will be moved. Retained students will remain.
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
