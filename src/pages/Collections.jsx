import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Users, ChevronRight, Ban, CheckCircle } from 'lucide-react';
import { db } from '../firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { auth } from '../firebase';

// Collections Class Card
const CollectionClassCard = ({ cls }) => {
    const navigate = useNavigate();

    // Simulate Payment Stats (Deterministic based on Class ID)
    const totalStudents = cls.students || 0;
    const seed = cls.id.charCodeAt(0) || 123;
    // Simulate ~70-90% paid
    const paidCount = Math.max(0, Math.round(totalStudents * (0.7 + (seed % 20) / 100)));
    const unpaidCount = totalStudents - paidCount;

    // Dynamic Theme Color
    const isEven = seed % 2 === 0;
    const themeColor = isEven ? 'var(--primary)' : 'var(--secondary)';

    return (
        <div
            onClick={() => navigate(`/collections/${cls.id}`)}
            className="card" style={{
                padding: '0',
                overflow: 'hidden',
                border: '1px solid #dbeafe',
                position: 'relative',
                background: '#eff6ff',
                boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.1)',
                borderRadius: '16px',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
            }}>
            {/* Decoration Strip */}
            <div style={{ height: '6px', width: '100%', background: `linear-gradient(90deg, ${themeColor}, transparent)` }} />

            <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                    <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)' }}>{cls.name}</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{cls.teacher || 'No Teacher'}</p>
                    </div>
                    <div style={{
                        padding: '0.25rem 0.75rem', background: 'white', borderRadius: '20px',
                        fontSize: '0.85rem', fontWeight: '600', color: themeColor,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}>
                        {totalStudents} Students
                    </div>
                </div>

                {/* Payment Stats */}
                <div style={{
                    display: 'flex', gap: '0', padding: '0',
                    background: 'white', borderRadius: '12px', border: '1px solid #dbeafe',
                    overflow: 'hidden'
                }}>
                    <div style={{ flex: 1, padding: '1rem', borderRight: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                            <CheckCircle size={18} />
                        </div>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Paid</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)' }}>{paidCount}</span>
                        </div>
                    </div>
                    <div style={{ flex: 1, padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                            <Ban size={18} />
                        </div>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Unpaid</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)' }}>{unpaidCount}</span>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <span style={{
                        fontSize: '0.85rem', color: themeColor, fontWeight: '600',
                        display: 'flex', alignItems: 'center', gap: '0.25rem'
                    }}>
                        View Details <ChevronRight size={16} />
                    </span>
                </div>
            </div>
        </div>
    );
};

const Collections = () => {
    const [classes, setClasses] = useState([]);
    const [stats, setStats] = useState({ paid: 0, unpaid: 0 });
    const [schoolId, setSchoolId] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            try {
                const userData = JSON.parse(manualSession);
                if (userData.schoolId) {
                    setSchoolId(userData.schoolId);
                } else {
                    setLoading(false);
                }
            } catch (e) {
                setLoading(false);
            }
        } else {
            setLoading(false);
        }
    }, []);

    // Helper for Sort
    const getClassOrder = (name) => {
        if (!name || typeof name !== 'string') return 0;
        const lower = name.toLowerCase();
        if (lower.includes('nursery')) return -2;
        if (lower.includes('prep')) return -1;
        return parseInt(name.replace(/\D/g, '')) || 0;
    };

    useEffect(() => {
        if (!schoolId) return;

        const q = query(collection(db, `schools/${schoolId}/classes`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const classesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            classesData.sort((a, b) => getClassOrder(a.name) - getClassOrder(b.name));
            setClasses(classesData);

            // Calculate Total Paid/Unpaid (Simulated)
            let totalPaid = 0;
            let totalUnpaid = 0;
            classesData.forEach(c => {
                const total = c.students || 0;
                const seed = c.id.charCodeAt(0) || 123;
                const p = Math.max(0, Math.round(total * (0.7 + (seed % 20) / 100)));
                const u = total - p;
                totalPaid += p;
                totalUnpaid += u;
            });
            setStats({ paid: totalPaid, unpaid: totalUnpaid });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [schoolId]);

    return (
        <div className="animate-fade-in-up">
            {/* Header */}
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                    Fee Collections
                </h1>
                <p style={{ color: 'var(--text-secondary)' }}>Overview of student fee payments across all classes</p>
            </div>

            {/* Top Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                <div className="card" style={{
                    padding: '1.5rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white',
                    borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.3)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.2)', borderRadius: '10px' }}>
                            <CheckCircle size={24} />
                        </div>
                        <span style={{ fontSize: '1rem', fontWeight: '600', opacity: 0.9 }}>Total Paid</span>
                    </div>
                    <div style={{ fontSize: '2.5rem', fontWeight: '800' }}>
                        {stats.paid} <span style={{ fontSize: '1rem', fontWeight: '500', opacity: 0.8 }}>Students</span>
                    </div>
                </div>

                <div className="card" style={{
                    padding: '1.5rem', background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)', color: 'white',
                    borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(244, 63, 94, 0.3)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.2)', borderRadius: '10px' }}>
                            <Ban size={24} />
                        </div>
                        <span style={{ fontSize: '1rem', fontWeight: '600', opacity: 0.9 }}>Total Unpaid</span>
                    </div>
                    <div style={{ fontSize: '2.5rem', fontWeight: '800' }}>
                        {stats.unpaid} <span style={{ fontSize: '1rem', fontWeight: '500', opacity: 0.8 }}>Students</span>
                    </div>
                </div>
            </div>

            {/* Classes Grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Loading Classes...</div>
            ) : (
                <>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '1.5rem' }}>All Classes Collection Status</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                        {classes.map(cls => (
                            <CollectionClassCard key={cls.id} cls={cls} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default Collections;
