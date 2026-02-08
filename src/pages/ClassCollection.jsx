import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Ban, Search, Filter } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';

const ClassCollection = () => {
    const { classId } = useParams();
    const navigate = useNavigate();
    const [students, setStudents] = useState([]);
    const [className, setClassName] = useState('');
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('all'); // 'all', 'paid', 'unpaid'
    const [schoolId, setSchoolId] = useState(null);
    const [currentAction, setCurrentAction] = useState(null);

    // 1. Resolve School ID
    useEffect(() => {
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            setSchoolId(JSON.parse(manualSession).schoolId);
        } else {
            // Fallback to auth if needed, but sticking to pattern
            const unsubscribe = auth.onAuthStateChanged(user => {
                if (user) user.getIdTokenResult().then(token => setSchoolId(token.claims.schoolId));
            });
            return () => unsubscribe();
        }
    }, []);

    // 2. Fetch Data (Real-time)
    useEffect(() => {
        if (!schoolId || !classId) return;

        setLoading(true);

        // A. Class Info
        const classRef = doc(db, `schools/${schoolId}/classes`, classId);
        getDoc(classRef).then(snap => {
            if (snap.exists()) setClassName(snap.data().name);
        });

        // B. Students (Real-time)
        const studentsRef = collection(db, `schools/${schoolId}/classes/${classId}/students`);
        const unsubStudents = onSnapshot(studentsRef, (snapshot) => {
            const list = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            // Sort by name
            list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setStudents(list);
            setLoading(false);
        });

        // C. Action Metadata (Real-time)
        const actionRef = doc(db, 'schools', schoolId, 'classes', 'action_metadata');
        const unsubAction = onSnapshot(actionRef, (docSnap) => {
            if (docSnap.exists()) {
                setCurrentAction(docSnap.data());
            } else {
                setCurrentAction(null);
            }
        });

        return () => {
            unsubStudents();
            unsubAction();
        };
    }, [schoolId, classId]);

    // Check if targeted
    const isTargeted = currentAction && (currentAction.targetAll || (currentAction.targetClasses && currentAction.targetClasses.includes(classId)));

    // Toggle Functions
    const toggleMonthlyFee = async (studentId, currentStatus) => {
        if (!schoolId) return;
        const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
        const studentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, studentId);
        try {
            await updateDoc(studentRef, {
                monthlyFeeStatus: newStatus
            });
        } catch (error) {
            console.error("Error updating monthly fee:", error);
            alert("Failed to update status");
        }
    };

    const toggleActionFee = async (studentId, currentStatus) => {
        if (!schoolId || !currentAction) return;
        const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
        const studentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, studentId);
        try {
            await updateDoc(studentRef, {
                [`customPayments.${currentAction.name}`]: {
                    status: newStatus,
                    date: new Date().toISOString()
                }
            });
        } catch (error) {
            console.error("Error updating action fee:", error);
            alert("Failed to update status");
        }
    };

    const filteredStudents = students.filter(s => {
        if (activeTab === 'all') return true;
        // simplistic filter: if tab is 'paid', show if EITHER is paid? Or just Monthly? 
        // User asked for specific buttons. Let's keep logic simple: Filter by Monthly Fee for now or just show all.
        // Let's filter by Monthly Fee status as primary, or just show list.
        // Actually, listing ALL students is better for management.
        return activeTab === 'all' || (s.monthlyFeeStatus || 'unpaid') === activeTab;
    });

    return (
        <div className="animate-fade-in-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <button
                    onClick={() => navigate('/collections')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        background: 'none', border: 'none', color: 'var(--text-secondary)',
                        cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600'
                    }}
                >
                    <ArrowLeft size={18} /> Back to Collections
                </button>
            </div>

            <header style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)' }}>
                    {className} <span style={{ fontWeight: '400', color: 'var(--text-secondary)' }}>Collections</span>
                </h1>
                {isTargeted && (
                    <div style={{
                        marginTop: '0.5rem', display: 'inline-block', padding: '0.5rem 1rem',
                        background: 'var(--primary)', color: 'white', borderRadius: '20px',
                        fontSize: '0.85rem', fontWeight: '600', boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.3)'
                    }}>
                        Active Action: {currentAction.name}
                    </div>
                )}
            </header>

            {/* Simple Filter */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                <button
                    onClick={() => setActiveTab('all')}
                    style={{
                        padding: '0.5rem 1.5rem', borderRadius: '10px', border: '1px solid #e2e8f0',
                        background: activeTab === 'all' ? 'var(--text-main)' : 'white',
                        color: activeTab === 'all' ? 'white' : 'var(--text-secondary)',
                        cursor: 'pointer', fontWeight: '600'
                    }}
                >
                    All Students
                </button>
                <button
                    onClick={() => setActiveTab('paid')}
                    style={{
                        padding: '0.5rem 1.5rem', borderRadius: '10px', border: '1px solid #e2e8f0',
                        background: activeTab === 'paid' ? '#dcfce7' : 'white',
                        color: activeTab === 'paid' ? '#166534' : 'var(--text-secondary)',
                        cursor: 'pointer', fontWeight: '600'
                    }}
                >
                    Monthly Paid
                </button>
                <button
                    onClick={() => setActiveTab('unpaid')}
                    style={{
                        padding: '0.5rem 1.5rem', borderRadius: '10px', border: '1px solid #e2e8f0',
                        background: activeTab === 'unpaid' ? '#fee2e2' : 'white',
                        color: activeTab === 'unpaid' ? '#991b1b' : 'var(--text-secondary)',
                        cursor: 'pointer', fontWeight: '600'
                    }}
                >
                    Monthly Unpaid
                </button>
            </div>

            {/* Student List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem' }}>Loading Student Data...</div>
            ) : filteredStudents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', background: '#f8fafc', borderRadius: '16px', color: 'var(--text-secondary)' }}>
                    No students found.
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
                    {filteredStudents.map(student => {
                        const monthlyStatus = student.monthlyFeeStatus || 'unpaid';
                        const actionStatus = isTargeted
                            ? (student.customPayments?.[currentAction.name]?.status || 'unpaid')
                            : null;

                        return (
                            <div key={student.id} className="card" style={{
                                padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
                                borderTop: `4px solid ${monthlyStatus === 'paid' ? '#10b981' : '#f43f5e'}`
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <img
                                        src={student.profilePic || `https://ui-avatars.com/api/?name=${student.name}&background=random`}
                                        alt={student.name}
                                        style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' }}
                                    />
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)' }}>{student.name}</h4>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                            Roll No: {student.rollNo || 'N/A'}
                                        </p>
                                    </div>
                                </div>

                                <div style={{ height: '1px', background: '#f1f5f9', margin: '0.25rem 0' }} />

                                {/* 1. Monthly Fee Control */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Monthly Fee</span>
                                    {monthlyStatus === 'paid' ? (
                                        <button
                                            onClick={() => toggleMonthlyFee(student.id, 'paid')}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                padding: '0.4rem 1rem', borderRadius: '8px', border: 'none',
                                                background: '#dcfce7', color: '#166534', fontWeight: '600', cursor: 'pointer'
                                            }}
                                        >
                                            <CheckCircle size={16} /> Paid
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => toggleMonthlyFee(student.id, 'unpaid')}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                padding: '0.4rem 1rem', borderRadius: '8px', border: '1px solid #fee2e2',
                                                background: '#fff', color: '#dc2626', fontWeight: '600', cursor: 'pointer'
                                            }}
                                        >
                                            <Ban size={16} /> Unpaid
                                        </button>
                                    )}
                                </div>

                                {/* 2. Action Fee Control (If Targeted) */}
                                {isTargeted && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.75rem', borderRadius: '8px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--primary)' }}>{currentAction.name}</span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Special Collection</span>
                                        </div>

                                        {actionStatus === 'paid' ? (
                                            <button
                                                onClick={() => toggleActionFee(student.id, 'paid')}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                    padding: '0.4rem 0.75rem', borderRadius: '8px', border: 'none',
                                                    background: '#dcfce7', color: '#166534', fontWeight: '600', cursor: 'pointer', fontSize: '0.85rem'
                                                }}
                                            >
                                                <CheckCircle size={14} /> Paid
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => toggleActionFee(student.id, 'unpaid')}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                    padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #fee2e2',
                                                    background: 'white', color: '#dc2626', fontWeight: '600', cursor: 'pointer', fontSize: '0.85rem'
                                                }}
                                            >
                                                <Ban size={14} /> Unpaid
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ClassCollection;
