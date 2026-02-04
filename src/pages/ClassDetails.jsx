import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Users, BookOpen, Calendar, Activity,
    CheckCircle2, XCircle, MoreVertical, Search, Filter
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const ClassDetails = () => {
    const { classId } = useParams();
    const navigate = useNavigate();
    const [classData, setClassData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'present', 'absent'

    // Mock Students Data (replace with real sub-collection later)
    const [students, setStudents] = useState([]);

    useEffect(() => {
        const fetchClassDetails = async () => {
            try {
                // 1. Fetch Class Info
                const docRef = doc(db, `schools/${JSON.parse(localStorage.getItem('manual_session')).schoolId}/classes`, classId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setClassData({ id: docSnap.id, ...data });

                    // 2. Generate Mock Students based on student count
                    const studentCount = data.students || 25;
                    const mockStudents = Array.from({ length: studentCount }, (_, i) => ({
                        id: `st-${i + 1}`,
                        name: `Student ${i + 1}`,
                        rollNo: `R-${100 + i}`,
                        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${i + 1}`,
                        status: Math.random() > 0.15 ? 'present' : 'absent', // 85% attendance
                        avgScore: 65 + Math.floor(Math.random() * 30), // 65-95
                        homework: 70 + Math.floor(Math.random() * 30) // 70-100
                    }));
                    setStudents(mockStudents);
                } else {
                    console.log("No such class!");
                }
            } catch (error) {
                console.error("Error fetching class:", error);
            } finally {
                setLoading(false);
            }
        };

        if (classId) fetchClassDetails();
    }, [classId]);

    const filteredStudents = students.filter(s => {
        if (filterStatus === 'all') return true;
        return s.status === filterStatus;
    });

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

            {/* Action Bar & Filters */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)' }}>Student Profiles</h2>

                <div style={{ display: 'flex', gap: '1rem', background: 'white', padding: '0.5rem', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
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
                {filteredStudents.map((student) => (
                    <div key={student.id} className="card" style={{
                        padding: '1.5rem', position: 'relative', border: 'none',
                        background: 'white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
                    }}>
                        <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
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
                ))}
            </div>
        </div>
    );
};

export default ClassDetails;
