import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Ban, Search, Filter } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

const ClassCollection = () => {
    const { classId } = useParams();
    const navigate = useNavigate();
    const [students, setStudents] = useState([]);
    const [className, setClassName] = useState('');
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('paid'); // 'paid' or 'unpaid'
    const [schoolId, setSchoolId] = useState(null);

    useEffect(() => {
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            setSchoolId(JSON.parse(manualSession).schoolId);
        }
    }, []);

    useEffect(() => {
        if (!schoolId || !classId) return;

        const fetchData = async () => {
            try {
                // Get Class Info
                const classSnap = await getDoc(doc(db, `schools/${schoolId}/classes`, classId));
                if (classSnap.exists()) {
                    setClassName(classSnap.data().name);
                }

                // Get Students
                const studentsRef = collection(db, `schools/${schoolId}/classes/${classId}/students`);
                const snap = await getDocs(studentsRef);

                const list = snap.docs.map(d => {
                    const data = d.data();
                    // Simulate Payment Status Deterministically
                    // We use the ID chars to decide. 
                    // To match the previous page logic loosely:
                    // Previous logic: count = total * (0.7 + (seed % 20)/100)
                    // Here we need individual status. We can hash the student ID.

                    const seed = d.id.charCodeAt(0) + d.id.charCodeAt(d.id.length - 1);
                    const isPaid = (seed % 10) > 2; // ~70% chance true (0,1,2 = false; 3..9 = true) ? No, >2 is 3,4,5,6,7,8,9 (7 numbers) -> 70%

                    return {
                        id: d.id,
                        ...data,
                        paymentStatus: isPaid ? 'paid' : 'unpaid'
                    };
                });

                setStudents(list);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [schoolId, classId]);

    const filteredStudents = students.filter(s => s.paymentStatus === activeTab);

    return (
        <div className="animate-fade-in-up">
            <button
                onClick={() => navigate('/collections')}
                style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    background: 'none', border: 'none', color: 'var(--text-secondary)',
                    cursor: 'pointer', marginBottom: '1.5rem', fontSize: '0.9rem', fontWeight: '600'
                }}
            >
                <ArrowLeft size={18} /> Back to Collections
            </button>

            <header style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)' }}>
                    {className} <span style={{ fontWeight: '400', color: 'var(--text-secondary)' }}>Collections</span>
                </h1>
            </header>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                <button
                    onClick={() => setActiveTab('paid')}
                    style={{
                        flex: 1, padding: '1rem', borderRadius: '12px', border: 'none', cursor: 'pointer',
                        background: activeTab === 'paid' ? '#dcfce7' : 'white',
                        color: activeTab === 'paid' ? '#166534' : 'var(--text-secondary)',
                        boxShadow: activeTab === 'paid' ? '0 4px 6px -1px rgba(16, 185, 129, 0.2)' : '0 1px 2px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem'
                    }}
                >
                    <CheckCircle size={20} />
                    <span style={{ fontWeight: '700', fontSize: '1.1rem' }}>Total Paid Students</span>
                    <span style={{ background: activeTab === 'paid' ? 'white' : '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontSize: '0.85rem' }}>
                        {students.filter(s => s.paymentStatus === 'paid').length}
                    </span>
                </button>

                <button
                    onClick={() => setActiveTab('unpaid')}
                    style={{
                        flex: 1, padding: '1rem', borderRadius: '12px', border: 'none', cursor: 'pointer',
                        background: activeTab === 'unpaid' ? '#fee2e2' : 'white',
                        color: activeTab === 'unpaid' ? '#991b1b' : 'var(--text-secondary)',
                        boxShadow: activeTab === 'unpaid' ? '0 4px 6px -1px rgba(239, 68, 68, 0.2)' : '0 1px 2px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem'
                    }}
                >
                    <Ban size={20} />
                    <span style={{ fontWeight: '700', fontSize: '1.1rem' }}>Total Unpaid Students</span>
                    <span style={{ background: activeTab === 'unpaid' ? 'white' : '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontSize: '0.85rem' }}>
                        {students.filter(s => s.paymentStatus === 'unpaid').length}
                    </span>
                </button>
            </div>

            {/* Student List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem' }}>Loading Student Data...</div>
            ) : filteredStudents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', background: '#f8fafc', borderRadius: '16px', color: 'var(--text-secondary)' }}>
                    No students found in this category.
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                    {filteredStudents.map(student => (
                        <div key={student.id} className="card" style={{
                            padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem',
                            borderLeft: `4px solid ${activeTab === 'paid' ? '#10b981' : '#ef4444'}`
                        }}>
                            <img
                                src={student.profilePic || `https://ui-avatars.com/api/?name=${student.name}&background=random`}
                                alt={student.name}
                                style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' }}
                            />
                            <div>
                                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)' }}>{student.name}</h4>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                    Roll No: {student.rollNo || 'N/A'}
                                </p>
                                <div style={{
                                    marginTop: '0.5rem', display: 'inline-block',
                                    fontSize: '0.75rem', fontWeight: '600', padding: '2px 8px', borderRadius: '4px',
                                    background: activeTab === 'paid' ? '#dcfce7' : '#fee2e2',
                                    color: activeTab === 'paid' ? '#166534' : '#991b1b'
                                }}>
                                    {activeTab === 'paid' ? 'Fees Cleared' : 'Pending Dues'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ClassCollection;
