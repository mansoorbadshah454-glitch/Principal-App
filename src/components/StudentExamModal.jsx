import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Trophy, BookOpen, Award, CheckCircle2, Clock, AlertCircle, Sparkles
} from 'lucide-react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import CachedImage from './CachedImage';
import { getStudentAvatar } from '../utils/defaultAvatar';

const StudentExamModal = ({ isOpen, onClose, student, rank, classSubjects, cardRect, schoolId, classId }) => {
    // Positioning Logic - Exact placement next to the clicked student card
    const [position, setPosition] = useState({ top: 0, left: 0, transformOrigin: 'center' });

    useEffect(() => {
        if (isOpen && cardRect) {
            const { top, left, width, height } = cardRect;
            const scrollY = window.scrollY;
            const modalWidth = 660;
            const windowWidth = document.documentElement.clientWidth;
            const gap = 20;

            // Try placing to the RIGHT of the card
            let finalLeft = left + width + gap;
            let transformOrigin = 'top left';

            // If it overflows right, place to LEFT of the card
            if (finalLeft + modalWidth > windowWidth - 20) {
                finalLeft = left - modalWidth - gap;
                transformOrigin = 'top right';
            }

            // Clamp horizontal
            if (finalLeft < 10) finalLeft = 10;
            if (finalLeft + modalWidth > windowWidth) finalLeft = windowWidth - modalWidth - 10;

            // Align TOP of modal with TOP of card
            let finalTop = top + scrollY;
            const modalHeight = 620;
            const documentHeight = document.documentElement.scrollHeight;

            if (finalTop + modalHeight > documentHeight) {
                finalTop = documentHeight - modalHeight - 20;
            }
            if (finalTop < 20) finalTop = 20;

            setPosition({ top: finalTop, left: finalLeft, transformOrigin });
        }
    }, [isOpen, cardRect]);

    // Exam State
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

    const isDemoAccount = useMemo(() => {
        return String(schoolId || '').trim() === '6257';
    }, [schoolId]);

    // Canonical 4 Terms order and label definitions requested by user:
    // "Monthly Test", "1st Term", "Mid Term", "Final Term"
    const CANONICAL_TERMS_CONFIG = [
        { key: 'monthly', fallbackId: 'monthly_test', defaultTitle: 'Monthly Class Test', displayTitle: 'Monthly Test', order: 1 },
        { key: 'first', fallbackId: 'first_term_2026', defaultTitle: 'First Term Examination 2026', displayTitle: '1st Term', order: 2 },
        { key: 'mid', fallbackId: 'mid_term_2026', defaultTitle: 'Mid Term Examination 2026', displayTitle: 'Mid Term', order: 3 },
        { key: 'final', fallbackId: 'final_term_2026', defaultTitle: 'Annual / Final Examination 2026', displayTitle: 'Final Term', order: 4 },
    ];

    // Fetch Exams & Marks in Real-Time
    useEffect(() => {
        if (!isOpen || !schoolId) return;

        setLoadingExams(true);
        const examsRef = collection(db, `schools/${schoolId}/exams`);
        const unsubExams = onSnapshot(examsRef, (snap) => {
            const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            const assignedExams = [];
            const usedDocIds = new Set();

            CANONICAL_TERMS_CONFIG.forEach(cTerm => {
                const matched = fetched.find(d => {
                    if (usedDocIds.has(d.id)) return false;
                    const raw = `${d.id} ${d.title || ''}`.toLowerCase();
                    if (cTerm.key === 'monthly' && (raw.includes('month') || raw.includes('monthly'))) return true;
                    if (cTerm.key === 'first' && (raw.includes('first') || raw.includes('1st') || raw.includes('term 1') || raw.includes('term1'))) return true;
                    if (cTerm.key === 'mid' && (raw.includes('mid') || raw.includes('middle') || raw.includes('term 2') || raw.includes('2nd'))) return true;
                    if (cTerm.key === 'final' && (raw.includes('final') || raw.includes('annual') || raw.includes('term 3') || raw.includes('3rd'))) return true;
                    return false;
                });

                if (matched) {
                    usedDocIds.add(matched.id);
                    assignedExams.push({
                        ...matched,
                        displayTitle: cTerm.displayTitle,
                        order: cTerm.order
                    });
                } else {
                    // Provide preset so all 4 terms are consistently present in the exact order
                    assignedExams.push({
                        id: cTerm.fallbackId,
                        title: cTerm.defaultTitle,
                        displayTitle: cTerm.displayTitle,
                        session: '2025-2026',
                        status: cTerm.order <= 2 ? 'active' : 'upcoming',
                        order: cTerm.order
                    });
                }
            });

            // Extra custom exams (if any) placed after canonical terms
            fetched.forEach(d => {
                if (!usedDocIds.has(d.id)) {
                    assignedExams.push({
                        ...d,
                        displayTitle: d.title || 'Term Exam',
                        order: 10
                    });
                }
            });

            assignedExams.sort((a, b) => a.order - b.order);
            setExamsList(assignedExams);

            if (!selectedExamId && assignedExams.length > 0) {
                // Default to 1st Term (or first active)
                const defaultTerm = assignedExams.find(e => e.displayTitle === '1st Term') || assignedExams[0];
                setSelectedExamId(defaultTerm.id);
            }
            setLoadingExams(false);
        }, (err) => {
            console.error("Error fetching exams:", err);
            setLoadingExams(false);
        });

        let unsubMarks = () => {};
        if (classId) {
            const marksRef = collection(db, `schools/${schoolId}/classes/${classId}/exam_marks`);
            unsubMarks = onSnapshot(marksRef, (snap) => {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setMarksDocs(list);
            }, (err) => {
                console.error("Error fetching exam marks:", err);
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

    // Master Canonical Subject List and Sequence across ALL Terms
    const masterSubjects = useMemo(() => {
        const list = [];
        const seen = new Set();

        // 1. Predefined subjects from class (highest priority for curriculum sequence)
        const predefined = Array.isArray(classSubjects) ? classSubjects : [];
        predefined.forEach(s => {
            const name = (typeof s === 'string' ? s : (s?.name || '')).trim();
            if (name) {
                const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (!seen.has(key)) {
                    seen.add(key);
                    list.push(name);
                }
            }
        });

        // 2. Any additional subjects found in marksDocs (sorted predictably)
        const additional = [];
        marksDocs.forEach(d => {
            const name = (d.subject || '').trim();
            if (name) {
                const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (!seen.has(key)) {
                    seen.add(key);
                    additional.push(name);
                }
            }
        });
        additional.sort((a, b) => a.localeCompare(b));
        list.push(...additional);

        // 3. Fallback standard subjects if class has none assigned
        if (list.length === 0) {
            return ['English', 'Mathematics', 'General Science', 'Urdu', 'Islamiyat'];
        }
        return list;
    }, [classSubjects, marksDocs]);

    // Consolidated Exam Data Map for this Student
    const studentExamDataMap = useMemo(() => {
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

            // Sort matching docs by updatedAt descending (newest first)
            matchingDocs.sort((a, b) => {
                const getDocTime = (d) => {
                    if (!d) return 0;
                    if (d.updatedAt?.toMillis) return d.updatedAt.toMillis();
                    if (d.updatedAt?.seconds) return d.updatedAt.seconds * 1000;
                    if (d.updatedAt instanceof Date) return d.updatedAt.getTime();
                    return 0;
                };
                return getDocTime(b) - getDocTime(a);
            });

            // Index marks by normalized subject key
            const subjectMarksMap = new Map();
            matchingDocs.forEach(doc => {
                const subj = (doc.subject || '').trim();
                if (!subj) return;

                const normKey = subj.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (subjectMarksMap.has(normKey)) return; // Keep newest submission only

                let entry = doc.marks?.[student.id];
                if (!entry && doc.marks) {
                    const sRoll = String(student.rollNo || student.rollNumber || '').trim();
                    const match = Object.entries(doc.marks).find(([k, v]) => {
                        if (k === student.id) return true;
                        if (v && typeof v === 'object') {
                            const vId = String(v.studentId || '').trim();
                            const vRoll = String(v.rollNumber || v.rollNo || '').trim();
                            if (vId && vId === student.id) return true;
                            if (sRoll && vRoll && vRoll === sRoll) return true;
                        }
                        return false;
                    });
                    if (match) entry = match[1];
                }

                if (entry) {
                    const totalMarks = typeof doc.totalMarks === 'number' && doc.totalMarks > 0 ? doc.totalMarks : 100;
                    const passMarks = typeof doc.passingMarks === 'number' && doc.passingMarks > 0 ? doc.passingMarks : 33;
                    const isAbsent = entry.isAbsent === true;
                    const obtained = typeof entry.obtainedMarks === 'number' ? entry.obtainedMarks : null;
                    const grade = entry.grade || (isAbsent ? 'ABS' : obtained !== null ? calculateGrade(obtained, totalMarks) : '-');

                    subjectMarksMap.set(normKey, {
                        obtained,
                        totalMarks,
                        passingMarks: passMarks,
                        isAbsent,
                        grade,
                        remarks: entry.remarks || ''
                    });
                }
            });

            // Build subjects adhering strictly to masterSubjects order (subjects never jump positions!)
            const subjects = [];
            let totalObtained = 0;
            let totalMax = 0;
            let hasAnyMarks = false;
            let failedCount = 0;

            masterSubjects.forEach(masterSubj => {
                const normKey = masterSubj.toLowerCase().replace(/[^a-z0-9]/g, '');
                const entry = subjectMarksMap.get(normKey);

                if (entry) {
                    hasAnyMarks = true;
                    subjects.push({
                        subject: masterSubj,
                        obtained: entry.obtained,
                        totalMarks: entry.totalMarks,
                        passingMarks: entry.passingMarks,
                        isAbsent: entry.isAbsent,
                        grade: entry.grade,
                        remarks: entry.remarks,
                        hasRecord: true
                    });

                    totalMax += entry.totalMarks;
                    if (!entry.isAbsent && entry.obtained !== null) {
                        totalObtained += entry.obtained;
                        if (entry.obtained < entry.passingMarks) failedCount++;
                    } else if (entry.isAbsent) {
                        failedCount++;
                    }
                } else {
                    // Keeps identical slot across all terms
                    subjects.push({
                        subject: masterSubj,
                        obtained: null,
                        totalMarks: 100,
                        passingMarks: 33,
                        isAbsent: false,
                        grade: '—',
                        remarks: 'Not evaluated',
                        hasRecord: false
                    });
                }
            });

            // Demo Account realistic mock data fallback (consistent subject ordering)
            if (!hasAnyMarks && demoDataInjected) {
                const isMonthly = exam.id.includes('month');
                const isFirst = exam.id.includes('first') || exam.id.includes('1st');
                const isMid = exam.id.includes('mid');
                const isFinal = exam.id.includes('final') || exam.id.includes('annual');

                if (!isFinal) {
                    hasAnyMarks = true;
                    const seed = student.id ? student.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 12;
                    const baseScore = isMonthly ? 86 : isFirst ? 82 : 75;

                    subjects.length = 0;
                    totalMax = 0;
                    totalObtained = 0;
                    failedCount = 0;

                    masterSubjects.forEach((sub, idx) => {
                        const score = Math.min(98, Math.max(68, baseScore + ((seed + idx * 7) % 17)));
                        const grade = calculateGrade(score, 100);
                        subjects.push({
                            subject: sub,
                            obtained: score,
                            totalMarks: 100,
                            passingMarks: 33,
                            isAbsent: false,
                            grade: grade,
                            remarks: score >= 90 ? 'Outstanding' : 'Very Good',
                            hasRecord: true
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
    }, [student, examsList, marksDocs, masterSubjects, demoDataInjected]);

    // Active Selected Exam Data
    const activeExamId = selectedExamId || examsList[0]?.id;
    const currentSelectedExamData = studentExamDataMap[activeExamId] || null;

    // Demo Account Data Injection Helper
    const handleInjectDemoExamMarks = async () => {
        setInjectingDemo(true);
        const sampleSubjects = masterSubjects;

        const targetExamId = activeExamId || 'first_term_2026';
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
                const targetExamId = activeExamId || 'first_term_2026';
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

    if (!isOpen || !student) return null;

    const styles = {
        overlay: {
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9998,
            backgroundColor: 'transparent',
        },
        card: {
            background: 'linear-gradient(to bottom right, #ffffff, #f8fafc)',
            width: '95vw', maxWidth: '660px',
            borderRadius: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            position: 'absolute',
            top: `${position.top}px`,
            left: `${position.left}px`,
            zIndex: 9999,
            overflow: 'hidden'
        },
        blob1: {
            position: 'absolute', top: 0, right: 0, width: '250px', height: '250px',
            borderRadius: '50%', filter: 'blur(64px)',
            transform: 'translate(50%, -50%)', pointerEvents: 'none',
            background: 'rgba(99, 102, 241, 0.12)'
        },
        blob2: {
            position: 'absolute', bottom: 0, left: 0, width: '200px', height: '200px',
            borderRadius: '50%', filter: 'blur(64px)',
            transform: 'translate(-50%, 50%)', pointerEvents: 'none',
            background: 'rgba(236, 72, 153, 0.1)'
        },
        header: {
            position: 'relative', padding: '1.25rem 1.5rem 0.75rem',
            display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '1.25rem',
            alignItems: 'center'
        },
        avatarContainer: {
            width: '74px', height: '74px', borderRadius: '50%', padding: '3px',
            background: 'linear-gradient(to top right, #6366f1, #8b5cf6)',
            boxShadow: '0 8px 16px -2px rgba(99, 102, 241, 0.25)'
        },
        avatarInner: {
            width: '100%', height: '100%', borderRadius: '50%',
            overflow: 'hidden', border: '2px solid white', backgroundColor: 'white'
        },
        img: {
            width: '100%', height: '100%', objectFit: 'cover'
        },
        name: {
            fontSize: '1.35rem', fontWeight: '800', color: '#1e293b', lineHeight: '1.2'
        },
        badge: {
            padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700',
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
                    {/* Fixed Dismissal Overlay */}
                    <div style={styles.overlay} onClick={onClose} />

                    {/* Pop-up Card */}
                    <motion.div
                        style={styles.card}
                        initial={{ opacity: 0, scale: 0.92, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 15 }}
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={styles.blob1} />
                        <div style={styles.blob2} />

                        {/* --- Student Header --- */}
                        <div style={styles.header}>
                            <div style={styles.avatarContainer}>
                                <div style={styles.avatarInner}>
                                    <CachedImage
                                        src={getStudentAvatar(student)}
                                        alt={student.name}
                                        style={styles.img}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    <h2 style={styles.name}>{student.name}</h2>
                                    <span style={{
                                        ...styles.badge,
                                        backgroundColor: student.status === 'present' ? '#dcfce7' : '#fee2e2',
                                        color: student.status === 'present' ? '#15803d' : '#b91c1c'
                                    }}>
                                        <span style={{
                                            width: '6px', height: '6px', borderRadius: '50%',
                                            backgroundColor: student.status === 'present' ? '#22c55e' : '#ef4444'
                                        }} />
                                        {student.status || 'Active'}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>
                                    <span style={{ backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '6px' }}>
                                        ROLL NO: {student.rollNo}
                                    </span>
                                    {rank && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#d97706', fontWeight: '700' }}>
                                            <Trophy size={14} /> Rank: #{rank}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Close Button Only (Clean header) */}
                            <div style={{ alignSelf: 'flex-start' }}>
                                <button
                                    onClick={onClose}
                                    style={{
                                        padding: '0.5rem',
                                        borderRadius: '9999px',
                                        backgroundColor: '#f1f5f9',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: '#64748b',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'background 0.2s'
                                    }}
                                    title="Close Modal"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div style={styles.divider} />

                        {/* --- Modal Content: Terms Tabs & Single Term Breakdown --- */}
                        <div style={{ padding: '0.85rem 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            
                            {/* Header with Term Badge and Demo Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Award size={18} color="#6366f1" />
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#1e293b', margin: 0 }}>
                                        Examination Performance
                                    </h3>
                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#6366f1', backgroundColor: '#e0e7ff', padding: '2px 8px', borderRadius: '9999px' }}>
                                        Single-Term View
                                    </span>
                                </div>

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

                            {/* Terms Tabs Row (Clean Pill Grid) */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${Math.max(1, examsList.length)}, 1fr)`,
                                gap: '0.55rem',
                                width: '100%'
                            }}>
                                {examsList.map((exam) => {
                                    const exData = studentExamDataMap[exam.id];
                                    const isSelected = activeExamId === exam.id;
                                    const status = exData?.status || 'pending';

                                    return (
                                        <button
                                            key={exam.id}
                                            onClick={() => setSelectedExamId(exam.id)}
                                            style={{
                                                padding: '0.65rem 0.85rem',
                                                borderRadius: '14px',
                                                border: isSelected ? '1.5px solid #6366f1' : '1px solid #e2e8f0',
                                                background: isSelected ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'white',
                                                color: isSelected ? 'white' : '#334155',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'flex-start',
                                                gap: '0.25rem',
                                                width: '100%',
                                                boxShadow: isSelected ? '0 4px 14px rgba(99, 102, 241, 0.25)' : '0 1px 3px rgba(0,0,0,0.04)',
                                                transition: 'all 0.2s ease',
                                                textAlign: 'left'
                                            }}
                                        >
                                            <span style={{ fontSize: '0.82rem', fontWeight: '800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                                                {exam.displayTitle || exam.title?.replace('Examination', 'Exam') || exam.title || 'Term Exam'}
                                            </span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.68rem', fontWeight: '700' }}>
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

                            {/* --- Selected Term Exam Content --- */}
                            {currentSelectedExamData?.status === 'available' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    
                                    {/* Score Summary Banner */}
                                    <div style={{
                                        background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '16px',
                                        padding: '0.9rem 1.25rem',
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr 1fr',
                                        gap: '0.5rem',
                                        textAlign: 'center'
                                    }}>
                                        <div>
                                            <p style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', margin: 0 }}>Total Marks</p>
                                            <h4 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#1e293b', margin: '2px 0 0' }}>
                                                {currentSelectedExamData.totalObtained}
                                                <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: '600' }}> / {currentSelectedExamData.totalMax}</span>
                                            </h4>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', margin: 0 }}>Overall Percentage</p>
                                            <h4 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#6366f1', margin: '2px 0 0' }}>
                                                {currentSelectedExamData.percentage}%
                                            </h4>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', margin: 0 }}>Grade & Result</p>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginTop: '2px' }}>
                                                <span style={{
                                                    padding: '2px 9px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '800',
                                                    background: currentSelectedExamData.isPassed ? '#dcfce7' : '#fee2e2',
                                                    color: currentSelectedExamData.isPassed ? '#166534' : '#991b1b'
                                                }}>
                                                    {currentSelectedExamData.overallGrade}
                                                </span>
                                                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: currentSelectedExamData.isPassed ? '#16a34a' : '#dc2626' }}>
                                                    {currentSelectedExamData.isPassed ? 'PASSED' : 'FAILED'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Subject Breakdown Title */}
                                    <div>
                                        <h4 style={{ fontSize: '0.85rem', fontWeight: '800', color: '#334155', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <BookOpen size={15} color="#6366f1" />
                                            Subject-Wise Marks Breakdown
                                        </h4>
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(2, 1fr)',
                                            gap: '0.6rem',
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
                                                            padding: '0.65rem 0.85rem',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '0.35rem',
                                                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#1e293b' }}>
                                                                {subj.subject}
                                                            </span>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                <span style={{ fontSize: '0.82rem', fontWeight: '800', color: subj.isAbsent ? '#dc2626' : subj.obtained !== null ? '#334155' : '#94a3b8' }}>
                                                                    {subj.isAbsent ? 'ABSENT' : subj.obtained !== null ? `${subj.obtained}/${subj.totalMarks}` : `—/${subj.totalMarks}`}
                                                                </span>
                                                                <span style={{
                                                                    padding: '1px 6px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: '800',
                                                                    background: subj.isAbsent ? '#fee2e2' : subj.obtained === null ? '#f1f5f9' : pct >= 50 ? '#dcfce7' : '#fef3c7',
                                                                    color: subj.isAbsent ? '#dc2626' : subj.obtained === null ? '#64748b' : pct >= 50 ? '#166534' : '#b45309'
                                                                }}>
                                                                    {subj.grade}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {/* Progress bar */}
                                                        <div style={{ height: '6px', width: '100%', backgroundColor: '#f1f5f9', borderRadius: '9999px', overflow: 'hidden' }}>
                                                            <div
                                                                style={{
                                                                    height: '100%',
                                                                    width: subj.obtained !== null && !subj.isAbsent ? `${Math.min(100, pct)}%` : '0%',
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
                                /* Upcoming / Pending Evaluation State */
                                <div style={{
                                    background: 'rgba(255, 255, 255, 0.75)',
                                    border: '1.5px dashed #cbd5e1',
                                    borderRadius: '16px',
                                    padding: '2rem 1.25rem',
                                    textAlign: 'center',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.75rem'
                                }}>
                                    <div style={{
                                        width: '48px', height: '48px', borderRadius: '50%',
                                        background: currentSelectedExamData?.status === 'upcoming' ? '#ffedd5' : '#fee2e2',
                                        color: currentSelectedExamData?.status === 'upcoming' ? '#ea580c' : '#dc2626',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {currentSelectedExamData?.status === 'upcoming' ? <Clock size={24} /> : <AlertCircle size={24} />}
                                    </div>
                                    <div>
                                        <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.25rem' }}>
                                            {currentSelectedExamData?.status === 'upcoming' ? 'Upcoming Examination' : 'Result Pending Evaluation'}
                                        </h4>
                                        <p style={{ fontSize: '0.8rem', color: '#64748b', maxWidth: '340px', margin: '0 auto', lineHeight: '1.4' }}>
                                            {currentSelectedExamData?.status === 'upcoming'
                                                ? `This term examination is upcoming on the academic calendar. Marks have not been recorded yet.`
                                                : `Marks have not been uploaded for this term yet. Once entered in the Exams portal, results will update here automatically.`}
                                        </p>
                                    </div>
                                    <div style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                        padding: '0.35rem 0.85rem', borderRadius: '9999px',
                                        fontSize: '0.75rem', fontWeight: '700',
                                        background: currentSelectedExamData?.status === 'upcoming' ? '#fff7ed' : '#fef2f2',
                                        color: currentSelectedExamData?.status === 'upcoming' ? '#c2410c' : '#991b1b',
                                        border: '1px solid',
                                        borderColor: currentSelectedExamData?.status === 'upcoming' ? '#fed7aa' : '#fecaca'
                                    }}>
                                        {currentSelectedExamData?.status === 'upcoming' ? <Clock size={13} /> : <AlertCircle size={13} />}
                                        <span>Status: {currentSelectedExamData?.status === 'upcoming' ? 'Upcoming Term' : 'Pending Evaluation'}</span>
                                    </div>
                                </div>
                            )}

                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default StudentExamModal;
