import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    BookOpen, Calendar, Clock, User, Search, Filter,
    CheckCircle2, AlertCircle, FileText, Sparkles, Volume2,
    Check, X, AlertTriangle, Users, ChevronRight, Eye
} from 'lucide-react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

const SUBJECT_COLORS = {
    'english': { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', bar: '#3b82f6' },
    'mathematics': { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe', bar: '#8b5cf6' },
    'math': { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe', bar: '#8b5cf6' },
    'science': { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0', bar: '#10b981' },
    'urdu': { bg: '#fffbeb', text: '#b45309', border: '#fde68a', bar: '#f59e0b' },
    'computer': { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc', bar: '#06b6d4' },
    'islamiyat': { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0', bar: '#22c55e' },
    'social studies': { bg: '#fff7ed', text: '#c2410c', border: '#ffedd5', bar: '#f97316' },
    'general knowledge': { bg: '#fdf2f8', text: '#be185d', border: '#fbcfe8', bar: '#ec4899' }
};

const getSubjectStyle = (subject = '') => {
    const key = subject.trim().toLowerCase();
    return SUBJECT_COLORS[key] || {
        bg: '#f8fafc',
        text: '#475569',
        border: '#e2e8f0',
        bar: '#6366f1'
    };
};

const ClassHomeworkView = ({ schoolId, classId, classData, students = [] }) => {
    const [homeworkList, setHomeworkList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSubject, setSelectedSubject] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal for Student Breakdown (stores only ID to allow instant live reactive updates)
    const [selectedHwId, setSelectedHwId] = useState(null);
    const [modalStatusFilter, setModalStatusFilter] = useState('all'); // 'all', 'done', 'incomplete', 'not_done', 'pending'
    const [modalSearchTerm, setModalSearchTerm] = useState('');

    useEffect(() => {
        if (!schoolId || !classId) return;

        setLoading(true);
        const hwRef = collection(db, `schools/${schoolId}/classes/${classId}/homework`);

        const unsubscribe = onSnapshot(hwRef, (snapshot) => {
            const list = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data
                };
            });

            // Sort by createdAt / assignedDate descending
            list.sort((a, b) => {
                const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : (new Date(a.assignedDate || 0)).getTime();
                const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : (new Date(b.assignedDate || 0)).getTime();
                return bTime - aTime;
            });

            setHomeworkList(list);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching class homework:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [schoolId, classId]);

    // Helper: Determine a student's homework completion status
    const evaluateStudentStatus = (hwItem, student) => {
        // 1. Check direct submission in homework document
        if (hwItem.submissions && typeof hwItem.submissions === 'object') {
            const sub = hwItem.submissions[student.id];
            if (sub) {
                if (typeof sub === 'string') return sub;
                if (sub.status) return sub.status;
                if (sub.score !== undefined && sub.score !== null) {
                    const sc = Number(sub.score);
                    return sc >= 75 ? 'done' : (sc >= 25 ? 'incomplete' : 'not_done');
                }
            }
        }

        // 2. Check student's homeworkScores array
        if (student.homeworkScores && Array.isArray(student.homeworkScores)) {
            // By homeworkId
            const matchHw = student.homeworkScores.find(h => h.homeworkId && h.homeworkId === hwItem.id);
            if (matchHw) {
                if (matchHw.status) return matchHw.status;
                if (matchHw.score !== undefined && matchHw.score !== null) {
                    const sc = Number(matchHw.score);
                    return sc >= 75 ? 'done' : (sc >= 25 ? 'incomplete' : 'not_done');
                }
            }

            // By subject & assigned date
            const hwDateStr = (hwItem.assignedDate || '').slice(0, 10);
            const matchSubj = student.homeworkScores.find(h =>
                h.subject && hwItem.subject &&
                h.subject.toLowerCase() === hwItem.subject.toLowerCase() &&
                (hwDateStr ? h.date === hwDateStr : true)
            );
            if (matchSubj) {
                if (matchSubj.status) return matchSubj.status;
                if (matchSubj.score !== undefined && matchSubj.score !== null) {
                    const sc = Number(matchSubj.score);
                    return sc >= 75 ? 'done' : (sc >= 25 ? 'incomplete' : 'not_done');
                }
            }
        }

        return 'pending'; // Unmarked / Not Checked yet
    };

    // Enrich homework items with student submission analytics - STRICTLY LATEST PER SUBJECT
    const enrichedHomeworkList = useMemo(() => {
        const latestPerSubjectMap = {};

        // Since homeworkList is already sorted newest first, the first item per subject is the latest!
        homeworkList.forEach(item => {
            const subj = item.subject || 'General';
            if (!latestPerSubjectMap[subj]) {
                latestPerSubjectMap[subj] = item;
            }
        });

        const latestList = Object.values(latestPerSubjectMap);

        return latestList.map(item => {
            let doneCount = 0;
            let incompleteCount = 0;
            let notDoneCount = 0;
            let pendingCount = 0;

            const studentBreakdown = students.map(student => {
                const status = evaluateStudentStatus(item, student);
                if (status === 'done') doneCount++;
                else if (status === 'incomplete') incompleteCount++;
                else if (status === 'not_done') notDoneCount++;
                else pendingCount++;

                return {
                    id: student.id,
                    name: student.name || 'Unknown',
                    rollNo: student.rollNo || '-',
                    avatar: student.avatar,
                    status // 'done' | 'incomplete' | 'not_done' | 'pending'
                };
            });

            // Sort students: not_done & incomplete first, then done, then pending
            studentBreakdown.sort((a, b) => {
                const order = { 'not_done': 1, 'incomplete': 2, 'done': 3, 'pending': 4 };
                return (order[a.status] || 5) - (order[b.status] || 5);
            });

            const checkedCount = doneCount + incompleteCount + notDoneCount;
            const completionRate = checkedCount > 0 ? Math.round((doneCount / students.length) * 100) : 0;

            return {
                ...item,
                doneCount,
                incompleteCount,
                notDoneCount,
                pendingCount,
                totalStudents: students.length,
                completionRate,
                studentBreakdown
            };
        });
    }, [homeworkList, students]);

    // Dynamically derive open modal's live homework item from enrichedHomeworkList (reactive live sync)
    const activeHwModal = useMemo(() => {
        if (!selectedHwId) return null;
        return enrichedHomeworkList.find(item => item.id === selectedHwId) || null;
    }, [enrichedHomeworkList, selectedHwId]);

    // Available subjects from latest entries
    const subjects = useMemo(() => {
        const set = new Set();
        if (classData?.subjects && Array.isArray(classData.subjects)) {
            classData.subjects.forEach(s => set.add(s));
        }
        enrichedHomeworkList.forEach(hw => {
            if (hw.subject) set.add(hw.subject);
        });
        return Array.from(set);
    }, [classData, enrichedHomeworkList]);

    // Filtered Homework (Latest items by selected subject & search)
    const filteredHomework = useMemo(() => {
        return enrichedHomeworkList.filter(item => {
            // Subject Filter
            if (selectedSubject !== 'all' && item.subject !== selectedSubject) {
                return false;
            }

            // Search Term
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const subjectMatch = item.subject?.toLowerCase().includes(term);
                const chapterMatch = item.chapter?.toLowerCase().includes(term);
                const topicMatch = item.paragraphs?.toLowerCase().includes(term);
                const descMatch = item.description?.toLowerCase().includes(term) || item.title?.toLowerCase().includes(term);
                const teacherMatch = item.teacherName?.toLowerCase().includes(term);
                if (!subjectMatch && !chapterMatch && !topicMatch && !descMatch && !teacherMatch) {
                    return false;
                }
            }

            return true;
        });
    }, [enrichedHomeworkList, selectedSubject, searchTerm]);

    const formatDate = (val) => {
        if (!val) return 'N/A';
        if (val.toDate) {
            return val.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        }
        const d = new Date(val);
        if (isNaN(d.getTime())) return String(val);
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    // Filter students inside modal
    const modalFilteredStudents = useMemo(() => {
        if (!activeHwModal) return [];
        return activeHwModal.studentBreakdown.filter(st => {
            if (modalStatusFilter !== 'all' && st.status !== modalStatusFilter) {
                return false;
            }
            if (modalSearchTerm.trim()) {
                const term = modalSearchTerm.toLowerCase();
                const nameMatch = st.name.toLowerCase().includes(term);
                const rollMatch = st.rollNo.toString().includes(term);
                return nameMatch || rollMatch;
            }
            return true;
        });
    }, [activeHwModal, modalStatusFilter, modalSearchTerm]);

    if (loading) {
        return (
            <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div className="animate-spin" style={{ width: '36px', height: '36px', border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%' }} />
            </div>
        );
    }

    return (
        <div className="animate-fade-in-up" style={{ width: '100%' }}>
            {/* Top Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card" style={{ padding: '1.25rem', background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Active Subject Homeworks</p>
                    <h3 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-main)', marginTop: '0.25rem' }}>{enrichedHomeworkList.length}</h3>
                </div>

                <div className="card" style={{ padding: '1.25rem', background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Total Class Students</p>
                    <h3 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#6366f1', marginTop: '0.25rem' }}>{students.length}</h3>
                </div>

                <div className="card" style={{ padding: '1.25rem', background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Subjects Covered</p>
                    <h3 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#059669', marginTop: '0.25rem' }}>{subjects.length}</h3>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1rem 1.25rem', marginBottom: '1.5rem', boxShadow: '0 2px 5px rgba(0,0,0,0.04)' }}>
                {/* Search Input Bar */}
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f8fafc', padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        <Search size={18} color="#94a3b8" />
                        <input
                            type="text"
                            placeholder="Search topic, chapter, description..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.9rem', color: 'var(--text-main)' }}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Subject Filter Pills */}
                <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                    <button
                        onClick={() => setSelectedSubject('all')}
                        style={{
                            padding: '0.4rem 1rem',
                            borderRadius: '20px',
                            border: '1px solid',
                            borderColor: selectedSubject === 'all' ? '#6366f1' : '#e2e8f0',
                            background: selectedSubject === 'all' ? '#6366f1' : 'white',
                            color: selectedSubject === 'all' ? 'white' : 'var(--text-secondary)',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        All Subjects ({enrichedHomeworkList.length})
                    </button>
                    {subjects.map(s => {
                        const count = enrichedHomeworkList.filter(h => h.subject === s).length;
                        const isSelected = selectedSubject === s;
                        return (
                            <button
                                key={s}
                                onClick={() => setSelectedSubject(s)}
                                style={{
                                    padding: '0.4rem 1rem',
                                    borderRadius: '20px',
                                    border: '1px solid',
                                    borderColor: isSelected ? '#6366f1' : '#e2e8f0',
                                    background: isSelected ? '#6366f1' : 'white',
                                    color: isSelected ? 'white' : 'var(--text-secondary)',
                                    fontSize: '0.85rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {s} ({count})
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Homework List Feed */}
            {filteredHomework.length === 0 ? (
                <div style={{ padding: '3.5rem 1rem', textAlign: 'center', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <BookOpen size={48} color="#cbd5e1" style={{ margin: '0 auto 1rem' }} />
                    <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                        No Homework Found
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        {searchTerm || selectedSubject !== 'all'
                            ? 'No homework entries match your selected filters.'
                            : 'No homework has been assigned to this class yet.'}
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
                    {filteredHomework.map(item => {
                        const style = getSubjectStyle(item.subject);
                        const assignedDateStr = formatDate(item.assignedDate || item.createdAt);
                        const dueStr = item.dueDateTime ? formatDate(item.dueDateTime) : (item.dueDate ? formatDate(item.dueDate) : null);

                        return (
                            <div
                                key={item.id}
                                onClick={() => {
                                    setSelectedHwId(item.id);
                                    setModalStatusFilter('all');
                                    setModalSearchTerm('');
                                }}
                                className="card hover:border-indigo-300 hover:shadow-lg transition-all cursor-pointer"
                                style={{
                                    background: 'white',
                                    borderRadius: '16px',
                                    border: '1px solid #e2e8f0',
                                    padding: '1.25rem',
                                    boxShadow: '0 3px 6px -1px rgba(0,0,0,0.05)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    position: 'relative'
                                }}
                            >
                                <div>
                                    {/* Card Header: Subject Badge + Date */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                        <div style={{
                                            background: style.bg,
                                            color: style.text,
                                            border: `1px solid ${style.border}`,
                                            padding: '0.25rem 0.75rem',
                                            borderRadius: '8px',
                                            fontWeight: '700',
                                            fontSize: '0.85rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.35rem'
                                        }}>
                                            <BookOpen size={14} />
                                            {item.subject || 'General'}
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#64748b', fontSize: '0.8rem', fontWeight: '500' }}>
                                            <Calendar size={13} />
                                            {assignedDateStr}
                                        </div>
                                    </div>

                                    {/* Chapter & Topic */}
                                    {(item.chapter || item.paragraphs) && (
                                        <div style={{ marginBottom: '0.65rem' }}>
                                            {item.chapter && (
                                                <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                                    {item.chapter}
                                                </div>
                                            )}
                                            {item.paragraphs && (
                                                <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-main)', marginTop: '0.15rem' }}>
                                                    {item.paragraphs}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Description / Task text */}
                                    {(item.homeworkDetails || item.description || item.title) && (
                                        <div style={{
                                            background: '#f8fafc',
                                            padding: '0.75rem',
                                            borderRadius: '10px',
                                            border: '1px solid #f1f5f9',
                                            fontSize: '0.88rem',
                                            color: '#334155',
                                            lineHeight: '1.45',
                                            marginBottom: '0.85rem',
                                            whiteSpace: 'pre-line'
                                        }}>
                                            {item.homeworkDetails || item.description || item.title}
                                        </div>
                                    )}

                                    {/* Audio Note Chip if present */}
                                    {item.audioUrl && (
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.65rem', borderRadius: '8px', background: '#ede9fe', color: '#6d28d9', fontSize: '0.78rem', fontWeight: '600', marginBottom: '0.85rem' }}>
                                            <Volume2 size={14} />
                                            Voice Note Attached
                                        </div>
                                    )}

                                    {/* --- 🟢 STUDENT SUBMISSION SUMMARY SECTION --- */}
                                    <div style={{
                                        background: '#f8fafc',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '12px',
                                        padding: '0.75rem 0.85rem',
                                        marginBottom: '0.75rem'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>
                                                Class Homework Progress
                                            </span>
                                            <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#16a34a' }}>
                                                {item.doneCount} / {item.totalStudents} Done
                                            </span>
                                        </div>

                                        {/* Multi-color mini progress bar */}
                                        <div style={{ height: '7px', width: '100%', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', display: 'flex', marginBottom: '0.5rem' }}>
                                            <div title={`Done: ${item.doneCount}`} style={{ width: `${(item.doneCount / (item.totalStudents || 1)) * 100}%`, height: '100%', background: '#16a34a' }} />
                                            <div title={`Incomplete: ${item.incompleteCount}`} style={{ width: `${(item.incompleteCount / (item.totalStudents || 1)) * 100}%`, height: '100%', background: '#f59e0b' }} />
                                            <div title={`Not Done: ${item.notDoneCount}`} style={{ width: `${(item.notDoneCount / (item.totalStudents || 1)) * 100}%`, height: '100%', background: '#ef4444' }} />
                                        </div>

                                        {/* Status Count Badges */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem', textAlign: 'center' }}>
                                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '0.25rem 0.4rem' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '700', color: '#166534' }}>Done</div>
                                                <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#15803d' }}>{item.doneCount}</div>
                                            </div>

                                            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '0.25rem 0.4rem' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '700', color: '#92400e' }}>Incomplete</div>
                                                <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#b45309' }}>{item.incompleteCount}</div>
                                            </div>

                                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.25rem 0.4rem' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '700', color: '#991b1b' }}>Not Done</div>
                                                <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#dc2626' }}>{item.notDoneCount}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Card Footer: Teacher + Click Indicator */}
                                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <User size={13} color="#94a3b8" />
                                        <span>{item.teacherName || 'Subject Teacher'}</span>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#6366f1', fontWeight: '700', fontSize: '0.8rem' }}>
                                        <span>View Student List</span>
                                        <ChevronRight size={14} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* --- 🎯 STUDENT HOMEWORK STATUS MODAL (CLEAN & DIRECT) --- */}
            {activeHwModal && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        width: '100vw',
                        height: '100vh',
                        backgroundColor: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(3px)',
                        zIndex: 999999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1.25rem',
                        boxSizing: 'border-box'
                    }}
                    onClick={() => setSelectedHwId(null)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'white',
                            borderRadius: '20px',
                            width: '100%',
                            maxWidth: '720px',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                            overflow: 'hidden',
                            border: 'none',
                            outline: 'none'
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            background: '#4f46e5',
                            color: 'white',
                            padding: '1.25rem 1.75rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.85, fontWeight: '700' }}>
                                    Student Homework Checking Status
                                </span>
                                <h3 style={{ fontSize: '1.3rem', fontWeight: '800', marginTop: '0.15rem' }}>
                                    {activeHwModal.subject} — {activeHwModal.paragraphs || activeHwModal.chapter || 'Homework'}
                                </h3>
                                <p style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: '0.2rem' }}>
                                    Assigned: {formatDate(activeHwModal.assignedDate || activeHwModal.createdAt)} • Teacher: {activeHwModal.teacherName || 'Subject Teacher'}
                                </p>
                            </div>

                            <button
                                onClick={() => setSelectedHwId(null)}
                                style={{
                                    background: 'rgba(255,255,255,0.2)',
                                    border: 'none',
                                    color: 'white',
                                    cursor: 'pointer',
                                    padding: '0.45rem',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '1.25rem 1.75rem', overflowY: 'auto', flex: '1' }}>
                            {/* Summary Pills Bar */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.65rem', marginBottom: '1.25rem' }}>
                                <div
                                    onClick={() => setModalStatusFilter('all')}
                                    style={{
                                        cursor: 'pointer',
                                        background: modalStatusFilter === 'all' ? '#e0e7ff' : '#f8fafc',
                                        border: '1px solid',
                                        borderColor: modalStatusFilter === 'all' ? '#6366f1' : '#e2e8f0',
                                        padding: '0.65rem',
                                        borderRadius: '10px',
                                        textAlign: 'center'
                                    }}
                                >
                                    <div style={{ fontSize: '0.72rem', color: '#475569', fontWeight: '700' }}>All Students</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-main)' }}>{activeHwModal.totalStudents}</div>
                                </div>

                                <div
                                    onClick={() => setModalStatusFilter('done')}
                                    style={{
                                        cursor: 'pointer',
                                        background: modalStatusFilter === 'done' ? '#bbf7d0' : '#f0fdf4',
                                        border: '1px solid',
                                        borderColor: modalStatusFilter === 'done' ? '#16a34a' : '#bbf7d0',
                                        padding: '0.65rem',
                                        borderRadius: '10px',
                                        textAlign: 'center'
                                    }}
                                >
                                    <div style={{ fontSize: '0.72rem', color: '#166534', fontWeight: '700' }}>Done</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#15803d' }}>{activeHwModal.doneCount}</div>
                                </div>

                                <div
                                    onClick={() => setModalStatusFilter('incomplete')}
                                    style={{
                                        cursor: 'pointer',
                                        background: modalStatusFilter === 'incomplete' ? '#fde68a' : '#fffbeb',
                                        border: '1px solid',
                                        borderColor: modalStatusFilter === 'incomplete' ? '#d97706' : '#fde68a',
                                        padding: '0.65rem',
                                        borderRadius: '10px',
                                        textAlign: 'center'
                                    }}
                                >
                                    <div style={{ fontSize: '0.72rem', color: '#92400e', fontWeight: '700' }}>Incomplete</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#b45309' }}>{activeHwModal.incompleteCount}</div>
                                </div>

                                <div
                                    onClick={() => setModalStatusFilter('not_done')}
                                    style={{
                                        cursor: 'pointer',
                                        background: modalStatusFilter === 'not_done' ? '#fecaca' : '#fef2f2',
                                        border: '1px solid',
                                        borderColor: modalStatusFilter === 'not_done' ? '#dc2626' : '#fecaca',
                                        padding: '0.65rem',
                                        borderRadius: '10px',
                                        textAlign: 'center'
                                    }}
                                >
                                    <div style={{ fontSize: '0.72rem', color: '#991b1b', fontWeight: '700' }}>Not Done</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#dc2626' }}>{activeHwModal.notDoneCount}</div>
                                </div>
                            </div>

                            {/* Search inside Modal */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f8fafc', padding: '0.5rem 0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                                <Search size={16} color="#94a3b8" />
                                <input
                                    type="text"
                                    placeholder="Search student by name or roll number..."
                                    value={modalSearchTerm}
                                    onChange={(e) => setModalSearchTerm(e.target.value)}
                                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.85rem', color: 'var(--text-main)' }}
                                />
                                {modalSearchTerm && (
                                    <button onClick={() => setModalSearchTerm('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                        <X size={15} />
                                    </button>
                                )}
                            </div>

                            {/* Students Table */}
                            {modalFilteredStudents.length === 0 ? (
                                <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    <Users size={36} color="#cbd5e1" style={{ margin: '0 auto 0.5rem' }} />
                                    <p style={{ fontSize: '0.9rem', fontWeight: '600' }}>No students found matching this status.</p>
                                </div>
                            ) : (
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                                        <thead>
                                            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                                <th style={{ padding: '0.65rem 0.85rem', fontWeight: '700', color: '#475569', width: '80px' }}>Roll No</th>
                                                <th style={{ padding: '0.65rem 0.85rem', fontWeight: '700', color: '#475569' }}>Student Name</th>
                                                <th style={{ padding: '0.65rem 0.85rem', fontWeight: '700', color: '#475569', textAlign: 'center', width: '140px' }}>Homework Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {modalFilteredStudents.map((st, idx) => {
                                                return (
                                                    <tr
                                                        key={st.id || idx}
                                                        style={{
                                                            borderBottom: '1px solid #f1f5f9',
                                                            background: idx % 2 === 0 ? 'white' : '#fcfcfd'
                                                        }}
                                                    >
                                                        <td style={{ padding: '0.65rem 0.85rem', color: '#64748b', fontWeight: '700' }}>
                                                            {st.rollNo}
                                                        </td>

                                                        <td style={{ padding: '0.65rem 0.85rem', fontWeight: '700', color: 'var(--text-main)' }}>
                                                            {st.name}
                                                        </td>

                                                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                                                            {st.status === 'done' ? (
                                                                <span style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.25rem',
                                                                    background: '#dcfce7',
                                                                    color: '#166534',
                                                                    padding: '0.25rem 0.65rem',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.78rem',
                                                                    fontWeight: '700'
                                                                }}>
                                                                    <Check size={13} />
                                                                    Done
                                                                </span>
                                                            ) : st.status === 'incomplete' ? (
                                                                <span style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.25rem',
                                                                    background: '#fef3c7',
                                                                    color: '#92400e',
                                                                    padding: '0.25rem 0.65rem',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.78rem',
                                                                    fontWeight: '700'
                                                                }}>
                                                                    <AlertTriangle size={13} />
                                                                    Incomplete
                                                                </span>
                                                            ) : st.status === 'not_done' ? (
                                                                <span style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.25rem',
                                                                    background: '#fee2e2',
                                                                    color: '#991b1b',
                                                                    padding: '0.25rem 0.65rem',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.78rem',
                                                                    fontWeight: '700'
                                                                }}>
                                                                    <X size={13} />
                                                                    Not Done
                                                                </span>
                                                            ) : (
                                                                <span style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.25rem',
                                                                    background: '#f1f5f9',
                                                                    color: '#64748b',
                                                                    padding: '0.25rem 0.65rem',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.78rem',
                                                                    fontWeight: '700'
                                                                }}>
                                                                    Unmarked
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '0.85rem 1.75rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setSelectedHwId(null)}
                                style={{
                                    padding: '0.5rem 1.25rem',
                                    borderRadius: '10px',
                                    border: '1px solid #cbd5e1',
                                    background: 'white',
                                    color: '#475569',
                                    fontSize: '0.88rem',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default ClassHomeworkView;
