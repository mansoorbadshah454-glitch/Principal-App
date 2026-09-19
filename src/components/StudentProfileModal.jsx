import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Trophy, BookOpen, Star, Activity, Heart, Calendar,
    GraduationCap, Award, CheckCircle2, Clock, AlertCircle, Sparkles
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell
} from 'recharts';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import CachedImage from './CachedImage';

const StudentProfileModal = ({ isOpen, onClose, student, rank, classSubjects, cardRect, schoolId, classId }) => {
    // Position Logic
    const [position, setPosition] = useState({ top: 0, left: 0, transformOrigin: 'center' });

    useEffect(() => {
        if (isOpen && cardRect) {
            const { top, left, width, height } = cardRect;
            const scrollY = window.scrollY; // Add scrollY for absolute positioning
            const modalWidth = 660; // Increased width for spacious view without scrolling
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
            const modalHeight = 620; // Estimated height
            const documentHeight = document.documentElement.scrollHeight;

            // Simple clamp to not go off document bottom (optional, but good)
            if (finalTop + modalHeight > documentHeight) {
                finalTop = documentHeight - modalHeight - 20;
            }
            if (finalTop < 20) finalTop = 20;

            setPosition({ top: finalTop, left: finalLeft, transformOrigin });
        }
    }, [isOpen, cardRect]);

    // --- Exam Performance View State ---
    const [activeView, setActiveView] = useState('overview'); // 'overview' | 'exams'
    const [examsList, setExamsList] = useState([]);
    const [marksDocs, setMarksDocs] = useState([]);
    const [selectedExamId, setSelectedExamId] = useState('');
    const [loadingExams, setLoadingExams] = useState(false);
    const [injectingDemo, setInjectingDemo] = useState(false);
    const [demoDataInjected, setDemoDataInjected] = useState(() => {
        try {
            return localStorage.getItem('demo_principal_exam_injected') === 'true';
        } catch (e) {
            return false;
        }
    });

    // Detect if this is the Principal's Demo Account
    const isDemoAccount = React.useMemo(() => {
        const sId = (schoolId || '').toLowerCase();
        const isLocal = typeof window !== 'undefined' && (
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.port !== ''
        );
        const manualSession = typeof window !== 'undefined' ? localStorage.getItem('manual_session') : null;
        return isLocal || sId.includes('demo') || sId.includes('test') || Boolean(manualSession);
    }, [schoolId]);

    // Reset to overview whenever modal opens or student changes
    useEffect(() => {
        if (isOpen) {
            setActiveView('overview');
        }
    }, [isOpen, student?.id]);

    // Fetch School Exams and Class Marks
    useEffect(() => {
        if (!isOpen || !schoolId) return;

        setLoadingExams(true);
        const examsRef = collection(db, `schools/${schoolId}/exams`);
        const unsubExams = onSnapshot(examsRef, (snap) => {
            let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (list.length === 0) {
                list = [
                    { id: 'first_term_2026', title: 'First Term Examination 2026', session: '2025-2026', status: 'active' },
                    { id: 'mid_term_2026', title: 'Mid Term Examination 2026', session: '2025-2026', status: 'upcoming' },
                    { id: 'final_term_2026', title: 'Annual / Final Examination 2026', session: '2025-2026', status: 'upcoming' },
                ];
            } else {
                list.sort((a, b) => (a.status === 'active' ? -1 : 1));
            }
            setExamsList(list);
            if (!selectedExamId && list.length > 0) {
                setSelectedExamId(list[0].id);
            }
            setLoadingExams(false);
        }, (err) => {
            console.error("Error fetching exams in modal:", err);
            setLoadingExams(false);
        });

        let unsubMarks = () => {};
        if (classId) {
            const marksRef = collection(db, `schools/${schoolId}/classes/${classId}/exam_marks`);
            unsubMarks = onSnapshot(marksRef, (snap) => {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setMarksDocs(list);
            }, (err) => {
                console.error("Error fetching exam marks in modal:", err);
            });
        }

        return () => {
            unsubExams();
            unsubMarks();
        };
    }, [isOpen, schoolId, classId]);

    const calculateGrade = (obtained, total) => {
        if (obtained === null || obtained === undefined || total <= 0) return '-';
        const pct = (obtained / total) * 100;
        if (pct >= 80) return 'A+';
        if (pct >= 70) return 'A';
        if (pct >= 60) return 'B';
        if (pct >= 50) return 'C';
        if (pct >= 40) return 'D';
        if (pct >= 33) return 'E';
        return 'F';
    };

    // Consolidated Exam Performance for this Student
    const studentExamDataMap = React.useMemo(() => {
        if (!student || examsList.length === 0) return {};

        const dataMap = {};

        examsList.forEach(exam => {
            const examIdLower = (exam.id || '').toLowerCase();
            const examTitleLower = (exam.title || '').toLowerCase().trim();
            const cleanExamId = examIdLower.replace(/[^a-z0-9]/g, '');

            const matchingDocs = marksDocs.filter(d => {
                const docExamId = (d.examId || '').toString().toLowerCase();
                const docExamTitle = (d.examTitle || '').toString().toLowerCase().trim();
                const cleanDocId = d.id.toLowerCase().replace(/[^a-z0-9]/g, '');

                if (docExamId === examIdLower || d.id.startsWith(exam.id + '_')) return true;
                if (examTitleLower && docExamTitle && (examTitleLower === docExamTitle || examTitleLower.includes(docExamTitle) || docExamTitle.includes(examTitleLower))) return true;
                if (cleanExamId && cleanDocId.startsWith(cleanExamId)) return true;
                return false;
            });

            const subjects = [];
            let totalObtained = 0;
            let totalMax = 0;
            let hasAnyMarks = false;
            let failedCount = 0;

            matchingDocs.forEach(doc => {
                const subj = (doc.subject || '').trim();
                if (!subj) return;
                const entry = doc.marks?.[student.id];
                const totalMarks = typeof doc.totalMarks === 'number' && doc.totalMarks > 0 ? doc.totalMarks : 100;
                const passMarks = typeof doc.passingMarks === 'number' && doc.passingMarks > 0 ? doc.passingMarks : 33;

                if (entry) {
                    hasAnyMarks = true;
                    const isAbsent = entry.isAbsent === true;
                    const obtained = typeof entry.obtainedMarks === 'number' ? entry.obtainedMarks : null;
                    const grade = entry.grade || (isAbsent ? 'ABS' : obtained !== null ? calculateGrade(obtained, totalMarks) : '-');

                    subjects.push({
                        subject: subj,
                        obtained,
                        totalMarks,
                        passingMarks: passMarks,
                        isAbsent,
                        grade,
                        remarks: entry.remarks || ''
                    });

                    totalMax += totalMarks;
                    if (!isAbsent && obtained !== null) {
                        totalObtained += obtained;
                        if (obtained < passMarks) failedCount++;
                    } else if (isAbsent) {
                        failedCount++;
                    }
                }
            });

            // If demo data was injected for this demo account and no real marks found:
            if (!hasAnyMarks && demoDataInjected) {
                const isFinal = exam.id.includes('final') || exam.id.includes('annual');
                if (!isFinal) {
                    hasAnyMarks = true;
                    const sampleSubs = (classSubjects && classSubjects.length > 0)
                        ? classSubjects
                        : ['English', 'Mathematics', 'General Science', 'Urdu', 'Islamiyat'];
                    const seed = student.id ? student.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 12;
                    const isMid = exam.id.includes('mid');

                    sampleSubs.forEach((sub, idx) => {
                        const cleanSub = typeof sub === 'string' ? sub : (sub?.name || 'Subject');
                        const baseScore = isMid ? 76 : 84;
                        const score = Math.min(98, Math.max(68, baseScore + ((seed + idx * 7) % 16)));
                        const grade = calculateGrade(score, 100);
                        subjects.push({
                            subject: cleanSub,
                            obtained: score,
                            totalMarks: 100,
                            passingMarks: 33,
                            isAbsent: false,
                            grade: grade,
                            remarks: score >= 90 ? 'Outstanding' : 'Very Good'
                        });
                        totalMax += 100;
                        totalObtained += score;
                    });
                }
            }

            const percentage = totalMax > 0 && hasAnyMarks ? parseFloat(((totalObtained / totalMax) * 100).toFixed(1)) : null;
            const overallGrade = percentage !== null ? calculateGrade(totalObtained, totalMax) : null;
            const isPassed = percentage !== null && failedCount === 0 && percentage >= 33;

            let status = 'pending';
            if (hasAnyMarks) {
                status = 'available';
            } else if (exam.status === 'upcoming') {
                status = 'upcoming';
            } else {
                status = 'pending';
            }

            dataMap[exam.id] = {
                exam,
                status,
                subjects,
                totalObtained,
                totalMax,
                percentage,
                overallGrade,
                isPassed,
                failedCount
            };
        });

        return dataMap;
    }, [student, examsList, marksDocs, demoDataInjected, classSubjects]);

    const currentSelectedExamData = React.useMemo(() => {
        const id = selectedExamId || (examsList[0]?.id || '');
        return studentExamDataMap[id] || (examsList[0] ? studentExamDataMap[examsList[0].id] : null);
    }, [selectedExamId, studentExamDataMap, examsList]);

    // Demo Data Injection Handler for Demo Account
    const handleInjectDemoExamMarks = async () => {
        if (!student) return;
        setInjectingDemo(true);

        const sampleSubjects = (classSubjects && classSubjects.length > 0)
            ? classSubjects
            : ['English', 'Mathematics', 'General Science', 'Urdu', 'Islamiyat'];

        const targetExamId = selectedExamId || examsList[0]?.id || 'first_term_2026';
        const targetExam = examsList.find(e => e.id === targetExamId) || examsList[0] || {
            id: 'first_term_2026',
            title: 'First Term Examination 2026'
        };

        const seed = student.id ? student.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 12;

        if (schoolId && classId) {
            try {
                for (let idx = 0; idx < sampleSubjects.length; idx++) {
                    const subj = sampleSubjects[idx];
                    const cleanSub = typeof subj === 'string' ? subj : (subj?.name || 'Subject');
                    const slug = cleanSub.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    const docId = `${targetExam.id}_${slug}`;
                    const marksRef = doc(db, `schools/${schoolId}/classes/${classId}/exam_marks`, docId);
                    const score = Math.min(98, Math.max(68, 80 + ((seed + idx * 7) % 19)));
                    const grade = calculateGrade(score, 100);

                    await setDoc(marksRef, {
                        examId: targetExam.id,
                        examTitle: targetExam.title,
                        subject: cleanSub,
                        totalMarks: 100,
                        passingMarks: 33,
                        marks: {
                            [student.id]: {
                                obtainedMarks: score,
                                isAbsent: false,
                                grade: grade,
                                remarks: score >= 90 ? 'Outstanding' : 'Very Good'
                            }
                        }
                    }, { merge: true });
                }
            } catch (err) {
                console.warn("Firestore demo injection notice:", err);
            }
        }

        try {
            localStorage.setItem('demo_principal_exam_injected', 'true');
        } catch (e) {}
        setDemoDataInjected(true);
        setInjectingDemo(false);
    };

    const handleClearDemoExamMarks = async () => {
        try {
            localStorage.removeItem('demo_principal_exam_injected');
        } catch (e) {}
        setDemoDataInjected(false);

        if (schoolId && classId) {
            try {
                const sampleSubjects = (classSubjects && classSubjects.length > 0)
                    ? classSubjects
                    : ['English', 'Mathematics', 'General Science', 'Urdu', 'Islamiyat'];
                const targetExamId = selectedExamId || examsList[0]?.id || 'first_term_2026';
                for (const subj of sampleSubjects) {
                    const cleanSub = typeof subj === 'string' ? subj : (subj?.name || 'Subject');
                    const slug = cleanSub.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    const docId = `${targetExamId}_${slug}`;
                    const marksRef = doc(db, `schools/${schoolId}/classes/${classId}/exam_marks`, docId);
                    await setDoc(marksRef, {
                        marks: {
                            [student.id]: null
                        }
                    }, { merge: true });
                }
            } catch (e) {}
        }
    };

    // --- Data Prep ---
    // 1. Subject Scores (Academic)
    const subjectData = React.useMemo(() => {
        if (!student) return [];
        return student.academicScores && student.academicScores.length > 0
            ? student.academicScores.map(item => ({
                ...item,
                score: parseInt(item.score, 10) || 0
            }))
            : (classSubjects && classSubjects.length > 0 ? classSubjects : ['Math', 'Science', 'English', 'Urdu', 'Art']).slice(0, 6).map((sub, index) => {
                const seed = student.id ? student.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
                // Pseudo-random but consistent based on student ID and subject index
                const pseudoRandom = Math.abs(Math.sin(seed + index)) * 40;
                return {
                    subject: sub,
                    score: Math.min(100, Math.max(50, Math.floor(pseudoRandom) + 60))
                };
            });
    }, [student?.academicScores, classSubjects, student?.id]);

    console.log("[StudentProfileModal] Derived subjectData:", subjectData);

    // 2. Homework Scores
    const homeworkData = React.useMemo(() => {
        if (!student) return [];
        return student.homeworkScores && student.homeworkScores.length > 0
            ? student.homeworkScores
            : []; // If empty, we might show a "No Data" message or similar, or just hide the chart
    }, [student?.homeworkScores]);

    // 3. Behavior Metrics
    const behaviorData = React.useMemo(() => {
        if (!student) return [];
        const rawWellness = student.wellness || {};
        const seed = student.id ? student.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;

        return [
            { name: 'Behavior', score: rawWellness.behavior || (85 + (seed % 15)), color: '#8b5cf6' },
            { name: 'Health', score: rawWellness.health || (92 + ((seed + 1) % 8)), color: '#ec4899' },
            { name: 'Hygiene', score: rawWellness.hygiene || (88 + ((seed + 2) % 10)), color: '#10b981' },
        ];
    }, [student?.wellness, student?.id]);

    if (!isOpen || !student) return null;

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
            background: 'linear-gradient(to bottom right, #ffffff, #f8fafc)',
            width: '95vw', maxWidth: '660px',
            borderRadius: '24px',
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
                                    <CachedImage
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
                                        <span>Rank no: {rank || '-'}</span>
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

                            {/* Actions: Exam Toggle & Close */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', alignSelf: 'flex-start' }}>
                                <button
                                    onClick={() => setActiveView(activeView === 'exams' ? 'overview' : 'exams')}
                                    style={{
                                        padding: '0.42rem 0.85rem',
                                        borderRadius: '9999px',
                                        border: activeView === 'exams' ? '1px solid #818cf8' : '1px solid #e0e7ff',
                                        background: activeView === 'exams'
                                            ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                                            : '#eef2ff',
                                        color: activeView === 'exams' ? '#ffffff' : '#4f46e5',
                                        fontSize: '0.78rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        boxShadow: activeView === 'exams' ? '0 4px 10px rgba(99, 102, 241, 0.25)' : 'none',
                                        transition: 'all 0.2s ease',
                                        whiteSpace: 'nowrap'
                                    }}
                                    title={activeView === 'exams' ? "Switch to Overview" : "View Term Exams"}
                                >
                                    <GraduationCap size={15} />
                                    <span>{activeView === 'exams' ? 'Overview' : 'Exam'}</span>
                                </button>
                                <button
                                    onClick={onClose}
                                    style={{ padding: '0.5rem', borderRadius: '9999px', backgroundColor: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* --- Divider --- */}
                        <div style={styles.divider} />

                        {/* --- Dynamic Content Area (Overview vs Exams) --- */}
                        {activeView === 'exams' ? (
                            <div style={{ padding: '1.25rem', paddingTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {/* Header / Subtitle with Demo Data Button */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Award size={18} color="#6366f1" />
                                        <h3 style={{ fontSize: '0.92rem', fontWeight: '800', color: '#1e293b', margin: 0 }}>
                                            Term Examinations
                                        </h3>
                                        <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '9999px' }}>
                                            {examsList.length} Exam{examsList.length !== 1 ? 's' : ''}
                                        </span>
                                    </div>

                                    {/* Demo Account: Quick Inject Demo Marks */}
                                    {isDemoAccount && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <button
                                                onClick={handleInjectDemoExamMarks}
                                                disabled={injectingDemo}
                                                style={{
                                                    padding: '0.35rem 0.75rem',
                                                    borderRadius: '9999px',
                                                    border: '1px solid #c7d2fe',
                                                    background: 'linear-gradient(135deg, #e0e7ff, #ede9fe)',
                                                    color: '#4338ca',
                                                    fontSize: '0.73rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.35rem',
                                                    boxShadow: '0 1px 3px rgba(99, 102, 241, 0.15)',
                                                    transition: 'all 0.2s ease'
                                                }}
                                                title="Inject realistic exam marks for this demo student"
                                            >
                                                <Sparkles size={13} color="#6366f1" />
                                                <span>{injectingDemo ? 'Injecting...' : '✨ Inject Demo Data'}</span>
                                            </button>
                                            {demoDataInjected && (
                                                <button
                                                    onClick={handleClearDemoExamMarks}
                                                    style={{
                                                        padding: '0.35rem 0.6rem',
                                                        borderRadius: '9999px',
                                                        border: '1px solid #fee2e2',
                                                        background: '#fff1f2',
                                                        color: '#b91c1c',
                                                        fontSize: '0.7rem',
                                                        fontWeight: '700',
                                                        cursor: 'pointer'
                                                    }}
                                                    title="Clear demo data"
                                                >
                                                    Reset
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Exam Pills Selection (Clean Grid - No Swipe / Scrollbar) */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${Math.max(1, examsList.length)}, 1fr)`,
                                    gap: '0.55rem',
                                    width: '100%'
                                }}>
                                    {examsList.map((exam) => {
                                        const exData = studentExamDataMap[exam.id];
                                        const isSelected = (selectedExamId || examsList[0]?.id) === exam.id;
                                        const status = exData?.status || 'pending';

                                        return (
                                            <button
                                                key={exam.id}
                                                onClick={() => setSelectedExamId(exam.id)}
                                                style={{
                                                    padding: '0.55rem 0.75rem',
                                                    borderRadius: '14px',
                                                    border: isSelected ? '1.5px solid #6366f1' : '1px solid #e2e8f0',
                                                    background: isSelected ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'white',
                                                    color: isSelected ? 'white' : '#334155',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'flex-start',
                                                    gap: '0.2rem',
                                                    width: '100%',
                                                    boxShadow: isSelected ? '0 4px 12px rgba(99, 102, 241, 0.25)' : '0 1px 2px rgba(0,0,0,0.04)',
                                                    transition: 'all 0.2s ease',
                                                    textAlign: 'left'
                                                }}
                                            >
                                                <span style={{ fontSize: '0.78rem', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                                                    {exam.title?.replace('Examination', 'Exam') || exam.title || 'Term Exam'}
                                                </span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.68rem', fontWeight: '700' }}>
                                                    {status === 'available' ? (
                                                        <span style={{ color: isSelected ? '#a7f3d0' : '#059669', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                            <CheckCircle2 size={11} /> {exData.percentage}% • {exData.overallGrade}
                                                        </span>
                                                    ) : status === 'upcoming' ? (
                                                        <span style={{ color: isSelected ? '#fed7aa' : '#d97706', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                            <Clock size={11} /> Upcoming
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: isSelected ? '#fecdd3' : '#e11d48', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                            <AlertCircle size={11} /> Pending
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Selected Exam Body */}
                                {currentSelectedExamData?.status === 'available' ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                        {/* Result Overview Banner */}
                                        <div style={{
                                            background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '16px',
                                            padding: '0.85rem 1rem',
                                            display: 'grid',
                                            gridTemplateColumns: '1fr 1fr 1fr',
                                            gap: '0.5rem',
                                            textAlign: 'center'
                                        }}>
                                            <div>
                                                <p style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', margin: 0 }}>Total Marks</p>
                                                <h4 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#1e293b', margin: '2px 0 0' }}>
                                                    {currentSelectedExamData.totalObtained}
                                                    <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: '600' }}> / {currentSelectedExamData.totalMax}</span>
                                                </h4>
                                            </div>
                                            <div>
                                                <p style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', margin: 0 }}>Percentage</p>
                                                <h4 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#6366f1', margin: '2px 0 0' }}>
                                                    {currentSelectedExamData.percentage}%
                                                </h4>
                                            </div>
                                            <div>
                                                <p style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', margin: 0 }}>Grade & Result</p>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', marginTop: '2px' }}>
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '800',
                                                        background: currentSelectedExamData.isPassed ? '#dcfce7' : '#fee2e2',
                                                        color: currentSelectedExamData.isPassed ? '#166534' : '#991b1b'
                                                    }}>
                                                        {currentSelectedExamData.overallGrade}
                                                    </span>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: currentSelectedExamData.isPassed ? '#16a34a' : '#dc2626' }}>
                                                        {currentSelectedExamData.isPassed ? 'PASS' : 'FAIL'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Subject-Wise Marks Breakdown (2-Column Grid - No Scrollbar) */}
                                        <div>
                                            <h4 style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <BookOpen size={14} color="#6366f1" />
                                                Subject-Wise Performance
                                            </h4>
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(2, 1fr)',
                                                gap: '0.5rem',
                                                width: '100%'
                                            }}>
                                                {currentSelectedExamData.subjects.map((subj, idx) => {
                                                    const pct = subj.isAbsent ? 0 : (subj.obtained !== null && subj.totalMarks > 0 ? (subj.obtained / subj.totalMarks) * 100 : 0);
                                                    return (
                                                        <div
                                                            key={idx}
                                                            style={{
                                                                background: 'white',
                                                                border: '1px solid #f1f5f9',
                                                                borderRadius: '12px',
                                                                padding: '0.6rem 0.75rem',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '0.3rem',
                                                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1e293b' }}>
                                                                    {subj.subject}
                                                                </span>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                    <span style={{ fontSize: '0.8rem', fontWeight: '800', color: subj.isAbsent ? '#dc2626' : '#334155' }}>
                                                                        {subj.isAbsent ? 'ABSENT' : `${subj.obtained}/${subj.totalMarks}`}
                                                                    </span>
                                                                    <span style={{
                                                                        padding: '1px 5px',
                                                                        borderRadius: '4px',
                                                                        fontSize: '0.7rem',
                                                                        fontWeight: '800',
                                                                        background: subj.isAbsent ? '#fee2e2' : pct >= 50 ? '#dcfce7' : '#fef3c7',
                                                                        color: subj.isAbsent ? '#dc2626' : pct >= 50 ? '#166534' : '#b45309'
                                                                    }}>
                                                                        {subj.grade}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            {/* Mini Progress Bar */}
                                                            <div style={{ height: '5px', width: '100%', backgroundColor: '#f1f5f9', borderRadius: '9999px', overflow: 'hidden' }}>
                                                                <div
                                                                    style={{
                                                                        height: '100%',
                                                                        width: `${Math.min(100, pct)}%`,
                                                                        borderRadius: '9999px',
                                                                        backgroundColor: subj.isAbsent ? '#ef4444' : pct >= 80 ? '#10b981' : pct >= 50 ? '#6366f1' : '#f59e0b',
                                                                        transition: 'width 0.4s ease'
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* Pending / Upcoming State */
                                    <div style={{
                                        background: 'rgba(255, 255, 255, 0.75)',
                                        border: '1.5px dashed #cbd5e1',
                                        borderRadius: '16px',
                                        padding: '1.75rem 1.25rem',
                                        textAlign: 'center',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.75rem'
                                    }}>
                                        <div style={{
                                            width: '46px', height: '46px', borderRadius: '50%',
                                            background: currentSelectedExamData?.status === 'upcoming' ? '#ffedd5' : '#fee2e2',
                                            color: currentSelectedExamData?.status === 'upcoming' ? '#ea580c' : '#dc2626',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {currentSelectedExamData?.status === 'upcoming' ? <Clock size={22} /> : <AlertCircle size={22} />}
                                        </div>
                                        <div>
                                            <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.25rem' }}>
                                                {currentSelectedExamData?.status === 'upcoming' ? 'Upcoming Examination' : 'Result Pending Evaluation'}
                                            </h4>
                                            <p style={{ fontSize: '0.78rem', color: '#64748b', maxWidth: '300px', margin: '0 auto', lineHeight: '1.4' }}>
                                                {currentSelectedExamData?.status === 'upcoming'
                                                    ? `This examination is scheduled for upcoming assessment. Marks have not been entered yet.`
                                                    : `Evaluation data has not been entered for this term yet. Results will update automatically once uploaded in Exams module.`}
                                            </p>
                                        </div>
                                        <div style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                            padding: '0.3rem 0.8rem', borderRadius: '9999px',
                                            fontSize: '0.72rem', fontWeight: '700',
                                            background: currentSelectedExamData?.status === 'upcoming' ? '#fff7ed' : '#fef2f2',
                                            color: currentSelectedExamData?.status === 'upcoming' ? '#c2410c' : '#991b1b',
                                            border: '1px solid',
                                            borderColor: currentSelectedExamData?.status === 'upcoming' ? '#fed7aa' : '#fecaca'
                                        }}>
                                            {currentSelectedExamData?.status === 'upcoming' ? <Clock size={12} /> : <AlertCircle size={12} />}
                                            <span>Status: {currentSelectedExamData?.status === 'upcoming' ? 'Upcoming Term' : 'Pending / Not Entered'}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Existing Charts Area (Overview) */
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
                                                <Bar dataKey="score" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={24} />
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
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default StudentProfileModal;
