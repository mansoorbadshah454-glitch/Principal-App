import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Users, BookOpen, Calendar, Activity,
    CheckCircle2, XCircle, MoreVertical, Search, Filter,
    CheckCircle, Ban, Wallet, X
} from 'lucide-react';
import { auth, db } from '../firebase';
import { doc, getDoc, collection, onSnapshot, query, updateDoc } from 'firebase/firestore';
import StudentProfileModal from '../components/StudentProfileModal';
import StudentActionPopup from '../components/StudentActionPopup';


const ClassDetails = () => {
    const { classId } = useParams();
    const navigate = useNavigate();
    const [classData, setClassData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'present', 'absent'
    const [students, setStudents] = useState([]);
    const [schoolId, setSchoolId] = useState(null);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showSelectionPopup, setShowSelectionPopup] = useState(false);
    const [actionStudent, setActionStudent] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');


    // Custom Collection Action State
    const [currentAction, setCurrentAction] = useState(null);

    // Popup Positioning State
    const [actionButtonRect, setActionButtonRect] = useState(null);
    const [selectedCardRect, setSelectedCardRect] = useState(null);

    // 1. Resolve School ID
    useEffect(() => {
        const resolveUser = async () => {
            // Priority 1: Manual Session
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

            // Priority 2: Firebase Auth
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

    // 2. Fetch Class Data, Students & Current Action
    useEffect(() => {
        if (!schoolId || !classId) return;

        setLoading(true);

        // We need to handle the cleanup of the async setup
        let unsubClass = () => { };
        let unsubStudents = () => { };
        let unsubSchool = () => { };

        const startListeners = async () => {
            // Class Metadata
            const classRef = doc(db, `schools/${schoolId}/classes`, classId);
            unsubClass = onSnapshot(classRef, (docSnap) => {
                if (docSnap.exists()) {
                    setClassData({ id: docSnap.id, ...docSnap.data() });
                } else {
                    console.log("Class document not found");
                    setLoading(false); // Stop loading if class doesn't exist
                }
            }, (err) => {
                console.error("Error fetching class:", err);
                setLoading(false);
            });

            // Students
            const studentsRef = collection(db, `schools/${schoolId}/classes/${classId}/students`);
            const q = query(studentsRef);
            unsubStudents = onSnapshot(q, (snapshot) => {
                const realStudents = snapshot.docs.map(doc => {
                    const data = doc.data();

                    // Helper to calculate average from score arrays
                    const calculateAverage = (scores) => {
                        if (!scores || !Array.isArray(scores) || scores.length === 0) return 0;
                        const validScores = scores.filter(s => s.score !== undefined && s.score !== null);
                        if (validScores.length === 0) return 0;
                        const total = validScores.reduce((sum, item) => sum + (parseInt(item.score) || 0), 0);
                        return Math.round(total / validScores.length);
                    };

                    const avgScore = calculateAverage(data.academicScores) || data.avgScore || 0;
                    const homework = calculateAverage(data.homeworkScores) || data.homework || 0;
                    // Attendance is stored as a direct percentage (0-100) in 'attendance' field by Teacher App
                    const attendanceScore = typeof data.attendance === 'object' ? (data.attendance.percentage || 0) : (parseInt(data.attendance) || 0);

                    return {
                        id: doc.id,
                        ...data,
                        rollNo: data.rollNo || 'N/A',
                        status: data.status || 'absent',
                        avgScore: avgScore,
                        homework: homework,
                        attendanceScore: attendanceScore, // Passed to modal
                        avatar: data.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${doc.id}`
                    };
                });

                // Calculate Rank based on avgScore (Descending)
                // We sort a copy to determine rank, then assign it back
                const sortedByScore = [...realStudents].sort((a, b) => b.avgScore - a.avgScore);
                sortedByScore.forEach((student, index) => {
                    student.classRank = index + 1;
                });

                // Sort by Name for display
                realStudents.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                setStudents(realStudents);
                setLoading(false);
            }, (err) => {
                console.error("Error fetching students:", err);
                setLoading(false);
            });

            // Action (Listen to 'classes/action_metadata' to comply with rules)
            const actionRef = doc(db, 'schools', schoolId, 'classes', 'action_metadata');
            unsubSchool = onSnapshot(actionRef, (docSnap) => {
                if (docSnap.exists()) {
                    setCurrentAction(docSnap.data());
                } else {
                    setCurrentAction(null);
                }
            }, (error) => {
                console.error("Error listening to action:", error);
                // Don't necessarily stop loading here as this is secondary data
            });
        };

        startListeners();

        return () => {
            unsubClass();
            unsubStudents();
            unsubSchool();
        };

    }, [schoolId, classId]);

    const filteredStudents = useMemo(() => {
        return students.filter(student => {
            const matchesStatus = filterStatus === 'all' ||
                (filterStatus === 'present' ? student.status === 'present' : student.status !== 'present');

            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = student.name?.toLowerCase().includes(searchLower) ||
                student.rollNo?.toString().includes(searchTerm);

            return matchesStatus && matchesSearch;
        });
    }, [students, filterStatus, searchTerm]);

    // Check if this class is targeted by the current action
    const isTargeted = currentAction && (currentAction.targetAll || (currentAction.targetClasses && currentAction.targetClasses.includes(classId)));

    // Calculate Action Stats
    const actionStats = React.useMemo(() => {
        if (!isTargeted || !currentAction) return { paid: 0, unpaid: 0 };
        let paid = 0;
        let unpaid = 0;
        students.forEach(s => {
            if (s.customPayments?.[currentAction.name]?.status === 'paid') {
                paid++;
            } else {
                unpaid++;
            }
        });
        return { paid, unpaid };
    }, [students, isTargeted, currentAction]);


    const togglePaymentStatus = async (studentId, newStatus) => {
        // Check for Manual Bypass
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            const session = JSON.parse(manualSession);
            if (session.isManual) {
                alert("Restricted: Manual Bypass Mode is Read-Only. Cannot update payments.");
                return;
            }
        }

        if (!schoolId || !classId || !currentAction || !auth.currentUser) return;

        try {
            const studentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, studentId);
            await updateDoc(studentRef, {
                [`customPayments.${currentAction.name}`]: {
                    status: newStatus,
                    date: new Date().toISOString()
                }
            });
        } catch (error) {
            console.error("Error updating payment:", error);
            alert("Failed to update payment status");
        }
    };


    const stats = [
        { label: 'Class Score %', value: '82%', icon: Activity, color: '#6366f1', bg: '#e0e7ff' },
        { label: 'Avg Subject Score', value: '78%', icon: BookOpen, color: '#ec4899', bg: '#fce7f3' },
        { label: 'Homework', value: '94%', icon: Calendar, color: '#f59e0b', bg: '#fef3c7' }, // Using Calendar as placeholder or CheckCircle
        { label: 'Attendance', value: '85%', icon: Users, color: '#10b981', bg: '#d1fae5' },
    ];

    if (loading) {
        return (
            <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
                <div className="animate-spin" style={{ width: '32px', height: '32px', border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%' }} />
            </div>
        );
    }

    if (!classData) return <div style={{ padding: '2rem' }}>Class not found</div>;

    return (
        <div className="animate-fade-in-up" style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                    onClick={() => navigate('/classes')}
                    style={{
                        background: 'white', border: '1px solid #e2e8f0', padding: '0.75rem',
                        borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    <ArrowLeft size={20} color="var(--text-main)" />
                </button>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)' }}>{classData.name}</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Class Teacher: {classData.teacher || 'Unassigned'}</p>
                </div>
            </div>

            {/* Top Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
                {stats.map((stat, idx) => (
                    <div key={idx} className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                        <div style={{
                            width: '50px', height: '50px', borderRadius: '14px',
                            background: stat.bg, color: stat.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <stat.icon size={24} />
                        </div>
                        <div>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '500' }}>{stat.label}</p>
                            <h3 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-main)' }}>{stat.value}</h3>
                        </div>
                    </div>
                ))}
            </div>

            {/* ACTION STATS (Only if Targeted) */}
            {isTargeted && (
                <div style={{ marginBottom: '2.5rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Wallet size={20} color="var(--primary)" />
                        {currentAction.name} Collection
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
                        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.3)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                                <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.2)', borderRadius: '10px' }}>
                                    <CheckCircle size={24} />
                                </div>
                                <span style={{ fontSize: '1rem', fontWeight: '600', opacity: 0.9 }}>{currentAction.name} Paid</span>
                            </div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '800' }}>
                                {actionStats.paid} <span style={{ fontSize: '1rem', fontWeight: '500', opacity: 0.8 }}>Students</span>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)', color: 'white', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(244, 63, 94, 0.3)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                                <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.2)', borderRadius: '10px' }}>
                                    <Ban size={24} />
                                </div>
                                <span style={{ fontSize: '1rem', fontWeight: '600', opacity: 0.9 }}>{currentAction.name} Unpaid</span>
                            </div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '800' }}>
                                {actionStats.unpaid} <span style={{ fontSize: '1rem', fontWeight: '500', opacity: 0.8 }}>Students</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Search Bar */}
            <div style={{ marginBottom: '2rem' }}>
                <div style={{
                    position: 'relative',
                    maxWidth: '100%',
                    background: 'white',
                    borderRadius: '16px',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 1rem'
                }}>
                    <Search size={20} color="#94a3b8" />
                    <input
                        type="text"
                        placeholder="Search student by name, roll no, or rank..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '1rem',
                            border: 'none',
                            outline: 'none',
                            fontSize: '1rem',
                            color: 'var(--text-main)',
                            background: 'transparent'
                        }}
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>
            </div>

            {/* Action Bar & Filters */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)' }}>Student Profiles</h2>

                <div style={{ display: 'flex', gap: '1rem', background: 'white', padding: '0.4rem', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <button
                        onClick={() => setFilterStatus('all')}
                        style={{
                            padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600',
                            background: filterStatus === 'all' ? 'var(--primary)' : 'transparent',
                            color: filterStatus === 'all' ? 'white' : 'var(--text-secondary)'
                        }}
                    >
                        All Students
                    </button>
                    <button
                        onClick={() => setFilterStatus('present')}
                        style={{
                            padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600',
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            background: filterStatus === 'present' ? '#dcfce7' : 'transparent',
                            color: filterStatus === 'present' ? '#166534' : 'var(--text-secondary)'
                        }}
                    >
                        <CheckCircle2 size={16} /> Present
                    </button>
                    <button
                        onClick={() => setFilterStatus('absent')}
                        style={{
                            padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600',
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            background: filterStatus === 'absent' ? '#fee2e2' : 'transparent',
                            color: filterStatus === 'absent' ? '#991b1b' : 'var(--text-secondary)'
                        }}
                    >
                        <XCircle size={16} /> Absent
                    </button>
                </div>
            </div>



            {/* Students Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                {filteredStudents.map((student, index) => {
                    // Check payment status for this student
                    const isPaid = isTargeted && student.customPayments?.[currentAction.name]?.status === 'paid';

                    return (
                        <div
                            key={student.id}
                            className="card cursor-pointer transform hover:scale-105 transition-transform duration-200"
                            onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setSelectedCardRect(rect);
                                setSelectedStudent({ ...student, rank: student.classRank }); // Use pre-calculated rank
                                setShowProfileModal(true);
                            }}
                            style={{
                                padding: '1.5rem', position: 'relative', border: 'none',
                                background: 'white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
                            }}
                        >
                            <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setActionButtonRect(rect);
                                        setActionStudent(student);
                                        setShowSelectionPopup(true);
                                    }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                                >
                                    <MoreVertical size={20} />
                                </button>
                            </div>

                            <div style={{
                                width: '80px', height: '80px', borderRadius: '50%', marginBottom: '1rem',
                                background: '#f3f4f6', overflow: 'hidden', border: '3px solid white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                            }}>
                                {/* Use generic initials or icon if image fails, but svg api is reliable */}
                                <img src={student.avatar} alt={student.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>

                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '0.25rem' }}>{student.name}</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', fontWeight: '500' }}>Roll No: {student.rollNo}</p>

                            <div style={{
                                padding: '0.5rem 1rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '600', width: '100%',
                                background: student.status === 'present' ? '#dcfce7' : '#fee2e2',
                                color: student.status === 'present' ? '#166534' : '#991b1b',
                                marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                            }}>
                                {student.status === 'present' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                                {student.status === 'present' ? 'Present Today' : 'Absent Today'}
                            </div>

                            {/* ACTION BUTTONS (If Targeted) */}
                            {isTargeted && (
                                <div style={{ width: '100%', marginBottom: '1rem' }} onClick={(e) => e.stopPropagation()}>
                                    {isPaid ? (
                                        <button
                                            onClick={() => togglePaymentStatus(student.id, 'unpaid')}
                                            style={{
                                                width: '100%', padding: '0.5rem', borderRadius: '8px', border: 'none',
                                                background: '#dcfce7', color: '#166534', fontWeight: '600', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                                            }}
                                        >
                                            <CheckCircle size={16} /> Paid: {currentAction.name}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => togglePaymentStatus(student.id, 'paid')}
                                            style={{
                                                width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #fee2e2',
                                                background: 'white', color: '#dc2626', fontWeight: '600', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                                            }}
                                        >
                                            <Ban size={16} /> Mark {currentAction.name} Paid
                                        </button>
                                    )}
                                </div>
                            )}

                            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '1rem 0 0', borderTop: '1px solid #f3f4f6' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <p style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Avg Score</p>
                                    <p style={{ fontWeight: '700', color: 'var(--text-main)' }}>{student.avgScore}%</p>
                                </div>
                                <div style={{ width: '1px', background: '#f3f4f6' }} />
                                <div style={{ textAlign: 'center' }}>
                                    <p style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Homework</p>
                                    <p style={{ fontWeight: '700', color: 'var(--text-main)' }}>{student.homework}%</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Student Profile Modal */}
            <StudentProfileModal
                isOpen={showProfileModal}
                onClose={() => setShowProfileModal(false)}
                student={selectedStudent}
                rank={selectedStudent?.rank}
                classSubjects={classData?.subjects}
                cardRect={selectedCardRect}
            />

            {/* Student Action Popup */}
            <StudentActionPopup
                isOpen={showSelectionPopup}
                onClose={() => setShowSelectionPopup(false)}
                student={actionStudent}
                schoolId={schoolId}
                classId={classId}
                buttonRect={actionButtonRect}
            />
        </div>
    );
};

export default ClassDetails;
