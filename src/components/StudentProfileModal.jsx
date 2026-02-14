import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, BookOpen, Star, Activity, Heart, Calendar } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell
} from 'recharts';

const StudentProfileModal = ({ isOpen, onClose, student, rank, classSubjects, cardRect }) => {
    // Position Logic
    const [position, setPosition] = React.useState({ top: 0, left: 0, transformOrigin: 'center' });

    React.useEffect(() => {
        if (isOpen && cardRect) {
            const { top, left, width, height } = cardRect;
            const scrollY = window.scrollY; // Add scrollY for absolute positioning
            const modalWidth = 500; // Max width from styles
            const windowWidth = document.documentElement.clientWidth; // Use clientWidth to exclude scrollbar
            const gap = 20;

            // Try placing to the RIGHT of the card
            let finalLeft = left + width + gap;
            let transformOrigin = 'top left';

            // If it overflows right, try LEFT of the card
            if (finalLeft + modalWidth > windowWidth - 20) {
                finalLeft = left - modalWidth - gap;
                transformOrigin = 'top right';
            }

            // Clamp horizontal
            if (finalLeft < 10) finalLeft = 10;
            if (finalLeft + modalWidth > windowWidth) finalLeft = windowWidth - modalWidth - 10;

            // Align TOP of modal with TOP of card
            let finalTop = top + scrollY; // Absolute position on document
            const modalHeight = 600; // Estimated height
            const documentHeight = document.documentElement.scrollHeight;

            // Simple clamp to not go off document bottom (optional, but good)
            if (finalTop + modalHeight > documentHeight) {
                finalTop = documentHeight - modalHeight - 20;
            }
            if (finalTop < 20) finalTop = 20;

            setPosition({ top: finalTop, left: finalLeft, transformOrigin });
        }
    }, [isOpen, cardRect]);

    if (!isOpen || !student) return null;

    // --- Data Prep ---
    // 1. Subject Scores (Academic)
    const subjectData = student.academicScores && student.academicScores.length > 0
        ? student.academicScores
        : (classSubjects && classSubjects.length > 0 ? classSubjects : ['Math', 'Science', 'English', 'Urdu', 'Art']).slice(0, 6).map((sub) => {
            const seed = student.id ? student.id.charCodeAt(0) : 0;
            return {
                subject: sub,
                score: Math.min(100, Math.max(50, Math.floor(Math.random() * 40) + 60 + (seed % 10)))
            };
        });

    // 2. Homework Scores
    const homeworkData = student.homeworkScores && student.homeworkScores.length > 0
        ? student.homeworkScores
        : []; // If empty, we might show a "No Data" message or similar, or just hide the chart

    // 2. Behavior Metrics
    const rawWellness = student.wellness || {};
    const seed = student.id ? student.id.charCodeAt(0) : 0;

    const behaviorData = [
        { name: 'Behavior', score: rawWellness.behavior || (85 + (seed % 15)), color: '#8b5cf6' },
        { name: 'Health', score: rawWellness.health || (92 + (seed % 8)), color: '#ec4899' },
        { name: 'Hygiene', score: rawWellness.hygiene || (88 + (seed % 10)), color: '#10b981' },
    ];

    // 3. Attendance
    // Use attendanceScore if available (calculated in parent), else fallback
    const attendanceScore = student.attendanceScore !== undefined ? student.attendanceScore : (student.attendance?.percentage || student.attendance || 0);

    // Styles
    const styles = {
        overlay: {
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9998,
            backgroundColor: 'transparent',
            // Ensure it captures clicks but doesn't block underlying if transparent? 
            // Actually usually we want it to block so you can't click buttons *under* it.
        },
        card: {
            background: 'linear-gradient(to bottom right, #ffffff, #eef2ff)',
            width: '100%', maxWidth: '500px',
            borderRadius: '24px',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            position: 'absolute', // Absolute to document body
            top: `${position.top}px`,
            left: `${position.left}px`,
            zIndex: 9999,
        },
        blob1: {
            position: 'absolute', top: 0, right: 0, width: '250px', height: '250px',
            borderRadius: '50%', filter: 'blur(64px)',
            transform: 'translate(50%, -50%)', pointerEvents: 'none',
            background: 'rgba(99, 102, 241, 0.1)'
        },
        blob2: {
            position: 'absolute', bottom: 0, left: 0, width: '200px', height: '200px',
            borderRadius: '50%', filter: 'blur(64px)',
            transform: 'translate(-50%, 50%)', pointerEvents: 'none',
            background: 'rgba(236, 72, 153, 0.1)'
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

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Fixed Overlay for Dismissal */}
                    <div style={styles.overlay} onClick={onClose} />

                    {/* Absolute Positioned Card */}
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
                                        <span>Att: {attendanceScore}%</span>
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
                </>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default StudentProfileModal;
