import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, BookOpen, Star, Activity, Heart, Calendar } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell
} from 'recharts';

const StudentProfileModal = ({ isOpen, onClose, student, rank, classSubjects }) => {
    if (!isOpen || !student) return null;

    // --- Data Prep ---
    const subjects = classSubjects && classSubjects.length > 0
        ? classSubjects
        : ['Math', 'Science', 'English', 'Urdu', 'Art'];

    const seed = student.id ? student.id.charCodeAt(0) : 0;

    // 1. Subject Scores
    const subjectData = subjects.slice(0, 6).map((sub) => ({
        subject: sub,
        score: Math.min(100, Math.max(50, Math.floor(Math.random() * 40) + 60 + (seed % 10)))
    }));

    // 2. Behavior Metrics
    const behaviorData = [
        { name: 'Behavior', score: 85 + (seed % 15), color: '#8b5cf6' },
        { name: 'Health', score: 92 + (seed % 8), color: '#ec4899' },
        { name: 'Hygiene', score: 88 + (seed % 10), color: '#10b981' },
    ];

    // Styles Objects for robustness against CSS issues
    const styles = {
        overlay: {
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
            backgroundColor: 'transparent', // Fully transparent as requested
        },
        card: {
            background: 'linear-gradient(to bottom right, #ffffff, #eef2ff)', // Theme related tint (Indigo-50)
            width: '100%', maxWidth: '500px',
            borderRadius: '24px',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            position: 'relative',
        },
        blob1: {
            position: 'absolute', top: 0, right: 0, width: '250px', height: '250px',
            borderRadius: '50%', filter: 'blur(64px)',
            transform: 'translate(50%, -50%)', pointerEvents: 'none',
            background: 'rgba(99, 102, 241, 0.1)' // Indigo
        },
        blob2: {
            position: 'absolute', bottom: 0, left: 0, width: '200px', height: '200px',
            borderRadius: '50%', filter: 'blur(64px)',
            transform: 'translate(-50%, 50%)', pointerEvents: 'none',
            background: 'rgba(236, 72, 153, 0.1)' // Pink
        },
        header: {
            position: 'relative', padding: '1.5rem', paddingBottom: '0.5rem',
            display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '1.25rem',
            alignItems: 'center'
        },
        avatarContainer: {
            width: '80px', height: '80px', borderRadius: '50%', padding: '4px',
            background: 'linear-gradient(to top right, #6366f1, #ec4899)',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
        },
        avatarInner: {
            width: '100%', height: '100%', borderRadius: '50%',
            overflow: 'hidden', border: '2px solid white', backgroundColor: 'white'
        },
        img: {
            width: '100%', height: '100%', objectFit: 'cover'
        },
        name: {
            fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', lineHeight: '1.2'
        },
        badge: {
            padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600',
            textTransform: 'uppercase', letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: '4px'
        },
        divider: {
            height: '1px', backgroundColor: '#f1f5f9', margin: '0.5rem 1.5rem'
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div style={styles.overlay} onClick={onClose}>
                    <motion.div
                        style={styles.card}
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Decorative Background Blobs */}
                        <div style={styles.blob1} />
                        <div style={styles.blob2} />

                        {/* --- Header --- */}
                        <div style={styles.header}>

                            {/* Avatar */}
                            <div style={styles.avatarContainer}>
                                <div style={styles.avatarInner}>
                                    <img
                                        src={student.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${student.id}`}
                                        alt={student.name}
                                        style={styles.img}
                                    />
                                </div>
                            </div>

                            {/* Info */}
                            <div>
                                <h2 style={styles.name}>{student.name}</h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '4px', marginBottom: '8px' }}>
                                    <span style={{ ...styles.badge, backgroundColor: '#f1f5f9', color: '#475569' }}>
                                        Roll No: {student.rollNo}
                                    </span>
                                    <span style={{
                                        ...styles.badge,
                                        backgroundColor: student.status === 'present' ? '#d1fae5' : '#ffe4e6',
                                        color: student.status === 'present' ? '#047857' : '#be123c'
                                    }}>
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: student.status === 'present' ? '#10b981' : '#f43f5e' }} />
                                        {student.status === 'present' ? 'Present' : 'Absent'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.875rem', fontWeight: '500', color: '#64748b' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: '#d97706' }}>
                                        <Trophy size={16} fill="currentColor" />
                                        <span>Rank #{rank || '-'}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: '#3b82f6' }}>
                                        <BookOpen size={16} />
                                        <span>HW: {student.homework}%</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: '#10b981' }}>
                                        <Calendar size={16} />
                                        <span>Att: {student.attendance || 85}%</span>
                                    </div>
                                </div>
                            </div>

                            {/* Close */}
                            <button
                                onClick={onClose}
                                style={{ alignSelf: 'flex-start', padding: '0.5rem', borderRadius: '9999px', backgroundColor: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* --- Divider --- */}
                        <div style={styles.divider} />

                        {/* --- Charts Area --- */}
                        <div style={{ padding: '1.5rem', paddingTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                            {/* Chart 1: Subject Radar */}
                            <div style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.5)', borderRadius: '16px', border: '1px solid #f1f5f9',
                                padding: '1rem', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', position: 'relative'
                            }}>
                                <h3 style={{ fontSize: '0.875rem', fontWeight: '700', color: '#334155', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Activity size={16} color="#6366f1" />
                                    Academic Performance
                                </h3>
                                <div style={{ height: '200px', width: '100%', display: 'flex', justifyContent: 'center' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={subjectData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                                            <XAxis
                                                dataKey="subject"
                                                tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                                                axisLine={false}
                                                tickLine={false}
                                                interval={0}
                                            />
                                            <YAxis
                                                domain={[0, 100]}
                                                tick={{ fill: '#94a3b8', fontSize: 10 }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <Tooltip
                                                cursor={{ fill: '#f8fafc' }}
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px', padding: '8px' }}
                                            />
                                            <Bar dataKey="score" radius={[4, 4, 0, 0]} barSize={24}>
                                                {subjectData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308'][index % 6]} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Chart 2: Behavior Bars */}
                            <div>
                                <h3 style={{ fontSize: '0.875rem', fontWeight: '700', color: '#334155', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '0.25rem' }}>
                                    <Heart size={16} color="#ec4899" />
                                    Wellness & Behavior
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {behaviorData.map((item, idx) => (
                                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: '600', color: '#475569', paddingLeft: '0.25rem' }}>
                                                <span>{item.name}</span>
                                                <span style={{ color: item.color }}>{item.score}%</span>
                                            </div>
                                            <div style={{ height: '10px', width: '100%', backgroundColor: '#f1f5f9', borderRadius: '9999px', overflow: 'hidden' }}>
                                                <motion.div
                                                    style={{ height: '100%', borderRadius: '9999px', backgroundColor: item.color }}
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${item.score}%` }}
                                                    transition={{ duration: 1, delay: 0.2 + (idx * 0.1) }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default StudentProfileModal;
