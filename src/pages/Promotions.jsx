import React, { useState, useEffect } from 'react';
import {
    Users, Search, ArrowRight, CheckCircle, XCircle, ChevronRight, AlertCircle
} from 'lucide-react';
import { db, auth } from '../firebase';
import {
    collection, getDocs, doc, writeBatch,
    query, orderBy, addDoc
} from 'firebase/firestore';

const Promotions = () => {
    const [schoolId, setSchoolId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [processing, setProcessing] = useState(false);
    const [promotionStatus, setPromotionStatus] = useState(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    // Helper: Class Sorting order
    const getClassOrder = (name) => {
        if (!name || typeof name !== 'string') return 0;
        const lower = name.toLowerCase();
        if (lower.includes('nursery')) return -2;
        if (lower.includes('prep')) return -1;
        return parseInt(name.replace(/\D/g, '')) || 0;
    };

    // 1. Init User & Global Safety Timeout
    useEffect(() => {
        // Global Safety Timeout - Force stop loading after 8 seconds no matter what
        const globalTimeout = setTimeout(() => {
            if (loading) {
                console.warn("Global timeout triggered - forcing render");
                setLoading(false);
            }
        }, 8000);

        const fetchUser = () => {
            try {
                const manualSession = localStorage.getItem('manual_session');
                if (manualSession) {
                    const userData = JSON.parse(manualSession);
                    if (userData.schoolId) {
                        setSchoolId(userData.schoolId);
                        // Don't stop loading yet, let fetchClasses define success
                    } else {
                        console.error("No schoolId in manual session");
                        setLoading(false);
                    }
                } else if (auth.currentUser) {
                    // Fallback: If auth exists but no manual session, we stop loading to show "No Data" or allow retry
                    console.warn("Auth exists but no manual session found");
                    setLoading(false);
                } else {
                    setLoading(false);
                }
            } catch (e) {
                console.error("Auth check failed", e);
                setLoading(false);
            }
        };
        fetchUser();

        return () => clearTimeout(globalTimeout);
    }, []);

    // 2. Fetch Classes
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

        // Safety Timeout
        const timeout = setTimeout(() => {
            if (loading) {
                console.warn("Loading classes timed out.");
                setLoading(false);
            }
        }, 5000);
        return () => clearTimeout(timeout);
    }, [schoolId]);

    // 3. Handle Class Selection
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

            const currentIndex = classes.findIndex(c => c.id === cls.id);
            const nextClass = classes[currentIndex + 1] || null;
            const previousClass = classes[currentIndex - 1] || null;

            const fetchedStudents = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                promotionStatus: 'promote',
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

    // 4. Process Promotions
    const processPromotions = async () => {
        setShowConfirmModal(false);
        setProcessing(true);
        try {
            const batch = writeBatch(db);
            let operationCount = 0;

            for (const student of students) {
                const status = student.promotionStatus || 'promote';

                // Logic simplifed for robustness
                if (status === 'promote') {
                    if (student.nextClassId === 'graduate') {
                        const alumniRef = doc(db, `schools/${schoolId}/alumni`, student.id);
                        batch.set(alumniRef, { ...student, graduatedAt: new Date(), previousClassId: selectedClass.id });
                        batch.delete(doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id));
                    } else if (student.nextClassId) {
                        const nextClassRef = doc(db, `schools/${schoolId}/classes/${student.nextClassId}/students`, student.id);
                        batch.set(nextClassRef, { ...student, promotedAt: new Date(), previousClassId: selectedClass.id });
                        batch.delete(doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id));
                    }
                } else if (status === 'demote' && student.previousClassId) {
                    const prevClassRef = doc(db, `schools/${schoolId}/classes/${student.previousClassId}/students`, student.id);
                    batch.set(prevClassRef, { ...student, demotedAt: new Date(), previousClassId: selectedClass.id });
                    batch.delete(doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id));
                } else {
                    // Retain
                    const currentStudentRef = doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id);
                    batch.update(currentStudentRef, { retained: true, retainedAt: new Date() });
                }
                operationCount++;
            }

            if (operationCount > 0) await batch.commit();
            setPromotionStatus('success');
            setSelectedClass(null);
            setStudents([]);
        } catch (error) {
            console.error("Promotion failed:", error);
            setPromotionStatus('error');
        } finally {
            setProcessing(false);
        }
    };

    // --- RENDER ---
    if (loading) {
        return (
            <div style={{ padding: '50px', textAlign: 'center' }}>
                <p>Loading Promotions...</p>
                <p style={{ fontSize: '12px', color: '#999', marginTop: '10px' }}>
                    If this takes too long,
                    <button
                        onClick={() => setLoading(false)}
                        style={{ marginLeft: '5px', textDecoration: 'underline', border: 'none', background: 'none', cursor: 'pointer', color: 'blue' }}
                    >
                        click here to stop waiting
                    </button>.
                </p>
            </div>
        );
    }

    return (
        <div style={{ padding: '20px' }}>
            {/* Header */}
            <div style={{ marginBottom: '20px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Annual Promotions</h1>
                <p style={{ color: '#666' }}>Promote students to the next class.</p>
            </div>

            {/* Success Msg */}
            {promotionStatus === 'success' && (
                <div style={{ padding: '15px', background: '#ecfdf5', color: '#065f46', marginBottom: '20px', borderRadius: '8px' }}>
                    Success! Student records updated.
                </div>
            )}

            {/* ERROR Msg */}
            {promotionStatus === 'error' && (
                <div style={{ padding: '15px', background: '#fef2f2', color: '#991b1b', marginBottom: '20px', borderRadius: '8px' }}>
                    Error processing promotions. Check console.
                </div>
            )}

            {/* Class List */}
            {classes.length > 0 ? (
                <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px' }}>
                    {classes.map(cls => (
                        <div
                            key={cls.id}
                            onClick={() => handleClassSelect(cls)}
                            style={{
                                minWidth: '120px', padding: '15px', borderRadius: '8px', cursor: 'pointer',
                                border: selectedClass?.id === cls.id ? '2px solid blue' : '1px solid #ddd',
                                backgroundColor: selectedClass?.id === cls.id ? '#eff6ff' : 'white'
                            }}
                        >
                            <div style={{ fontWeight: 'bold', textAlign: 'center' }}>{cls.name}</div>
                            <div style={{ textAlign: 'center', fontSize: '12px', color: '#666' }}>{cls.students || 0} Students</div>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ padding: '20px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', textAlign: 'center' }}>
                    <p style={{ color: '#64748b' }}>No classes found for this school.</p>
                </div>
            )}

            {/* Debug Footer */}
            <div style={{ marginTop: '50px', padding: '10px', fontSize: '10px', color: '#ccc', borderTop: '1px solid #eee' }}>
                <p>Debug School ID: {schoolId || 'Not Found'}</p>
                <p>Raw Session: {localStorage.getItem('manual_session') || 'NULL'}</p>
                <button onClick={() => window.location.reload()} style={{ marginTop: '10px', padding: '4px' }}>Reload</button>
            </div>

            {/* Student List */}
            {selectedClass && (
                <div style={{ marginTop: '20px' }}>
                    <h3 style={{ marginBottom: '10px' }}>Students: {selectedClass.name}</h3>

                    {loadingStudents ? (
                        <div>Loading students...</div>
                    ) : students.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No students found.</div>
                    ) : (
                        <div style={{ border: '1px solid #eee', borderRadius: '8px' }}>
                            {students.map(student => {
                                const status = student.promotionStatus || 'promote';
                                return (
                                    <div key={student.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #eee' }}>
                                        <div>
                                            <div style={{ fontWeight: 'bold' }}>{student.name}</div>
                                            <div style={{ fontSize: '12px', color: '#666' }}>Roll: {student.rollNo || '-'}</div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            <button
                                                onClick={() => handleStatusChange(student.id, 'retain')}
                                                style={{ padding: '5px 10px', background: status === 'retain' ? '#fee2e2' : '#f3f4f6', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                            >
                                                Retain
                                            </button>

                                            {student.previousClassId && (
                                                <button
                                                    onClick={() => handleStatusChange(student.id, 'demote')}
                                                    style={{ padding: '5px 10px', background: status === 'demote' ? '#fef3c7' : '#f3f4f6', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                >
                                                    Demote
                                                </button>
                                            )}

                                            <button
                                                onClick={() => handleStatusChange(student.id, 'promote')}
                                                style={{ padding: '5px 10px', background: status === 'promote' ? '#d1fae5' : '#f3f4f6', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                            >
                                                Promote ({student.nextClassName})
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}

                            <div style={{ padding: '20px', textAlign: 'right', background: '#f9fafb' }}>
                                <button
                                    onClick={() => setShowConfirmModal(true)}
                                    disabled={processing}
                                    style={{ padding: '10px 20px', background: 'blue', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                                >
                                    {processing ? 'Processing...' : 'Confirm All Promotions'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Modal */}
            {showConfirmModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'white', padding: '30px', borderRadius: '8px', minWidth: '300px' }}>
                        <h3>Confirm Action?</h3>
                        <p>This will update {students.length} students.</p>
                        <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowConfirmModal(false)} style={{ padding: '8px 16px', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={processPromotions} style={{ padding: '8px 16px', background: 'blue', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Promotions;
