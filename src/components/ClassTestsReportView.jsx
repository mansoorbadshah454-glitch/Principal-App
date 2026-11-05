import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    GraduationCap, Trophy, Award, CheckCircle2, XCircle, AlertTriangle,
    Search, Filter, Calendar, BookOpen, User, Users, Eye, Printer, ChevronRight,
    TrendingUp, TrendingDown, X, Sparkles
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

const getSubjectTheme = (subject = '') => {
    const key = subject.trim().toLowerCase();
    return SUBJECT_COLORS[key] || {
        bg: '#f8fafc',
        text: '#475569',
        border: '#e2e8f0',
        bar: '#6366f1'
    };
};

const ClassTestsReportView = ({ schoolId, classId, classData, students = [] }) => {
    const [testsList, setTestsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const passThreshold = 40; // Standard 40% passing marks
    const [selectedTestId, setSelectedTestId] = useState(null);
    const [modalStatusFilter, setModalStatusFilter] = useState('all'); // 'all' | 'pass' | 'fail' | 'absent'
    const [modalSearchTerm, setModalSearchTerm] = useState('');

    // Map students for quick lookup by ID
    const studentMap = useMemo(() => {
        const map = {};
        students.forEach(s => {
            map[s.id] = s;
        });
        return map;
    }, [students]);

    // Realtime Listener for Tests
    useEffect(() => {
        if (!schoolId || !classId) return;

        setLoading(true);
        const testsRef = collection(db, `schools/${schoolId}/classes/${classId}/scheduled_tests`);

        const unsubscribe = onSnapshot(testsRef, (snapshot) => {
            const list = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data
                };
            });

            // Sort: completed first, newest to oldest
            list.sort((a, b) => {
                const aTime = a.completedAt?.toMillis ? a.completedAt.toMillis() : (a.createdAt?.toMillis ? a.createdAt.toMillis() : (new Date(a.dateStr || 0)).getTime());
                const bTime = b.completedAt?.toMillis ? b.completedAt.toMillis() : (b.createdAt?.toMillis ? b.createdAt.toMillis() : (new Date(b.dateStr || 0)).getTime());
                return bTime - aTime;
            });

            setTestsList(list);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching class tests:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [schoolId, classId]);

    // Completed tests only for analytical reports
    const completedTests = useMemo(() => {
        return testsList.filter(t => t.status === 'completed' || (t.scores && Object.keys(t.scores).length > 0));
    }, [testsList]);

    // Compute detailed analytics for each test
    const enrichedTests = useMemo(() => {
        return completedTests.map(test => {
            const maxMarks = Number(test.maxMarks) || 10;
            const passMarksRequired = Math.ceil(maxMarks * (passThreshold / 100));
            const scoresObj = test.scores || {};
            const absentArr = Array.isArray(test.absentStudents) ? test.absentStudents : [];

            let passedCount = 0;
            let failedCount = 0;
            let totalScoreEarned = 0;
            let totalScoredStudents = 0;

            const studentResults = [];

            // 1. Process scored students
            Object.entries(scoresObj).forEach(([sId, scoreVal]) => {
                const score = Number(scoreVal) || 0;
                const isPass = score >= passMarksRequired;
                if (isPass) passedCount++;
                else failedCount++;

                totalScoreEarned += score;
                totalScoredStudents++;

                const stObj = studentMap[sId] || { id: sId, name: `Student (${sId.slice(0, 5)})`, rollNo: '-' };
                studentResults.push({
                    id: sId,
                    name: stObj.name || 'Unknown',
                    rollNo: stObj.rollNo || '-',
                    score,
                    maxMarks,
                    percentage: Math.round((score / maxMarks) * 100),
                    isPass,
                    isAbsent: false
                });
            });

            // 2. Process absent students
            absentArr.forEach(sId => {
                const stObj = studentMap[sId] || { id: sId, name: `Student (${sId.slice(0, 5)})`, rollNo: '-' };
                studentResults.push({
                    id: sId,
                    name: stObj.name || 'Unknown',
                    rollNo: stObj.rollNo || '-',
                    score: 0,
                    maxMarks,
                    percentage: 0,
                    isPass: false,
                    isAbsent: true
                });
            });

            // Sort by score descending to rank
            studentResults.sort((a, b) => {
                if (a.isAbsent && !b.isAbsent) return 1;
                if (!a.isAbsent && b.isAbsent) return -1;
                return b.score - a.score;
            });

            // Assign ranks (shared rank for same score)
            let currentRank = 1;
            let prevScore = -1;
            studentResults.forEach((s, idx) => {
                if (s.isAbsent) {
                    s.rank = '-';
                } else {
                    if (s.score !== prevScore) {
                        s.rank = currentRank;
                    } else {
                        s.rank = currentRank;
                    }
                    prevScore = s.score;
                    currentRank++;
                }
            });

            const totalAttempted = passedCount + failedCount;
            const passRate = totalAttempted > 0 ? Math.round((passedCount / totalAttempted) * 100) : 0;
            const avgScore = totalScoredStudents > 0 ? Number((totalScoreEarned / totalScoredStudents).toFixed(1)) : 0;

            return {
                ...test,
                maxMarks,
                passMarksRequired,
                passedCount,
                failedCount,
                absentCount: absentArr.length,
                totalAttempted,
                passRate,
                avgScore,
                studentResults
            };
        });
    }, [completedTests, passThreshold, studentMap]);

    // Dynamically derive active report modal from enrichedTests to allow instant live reactive updates
    const activeReportModal = useMemo(() => {
        if (!selectedTestId) return null;
        return enrichedTests.find(t => t.id === selectedTestId) || null;
    }, [enrichedTests, selectedTestId]);

    // Subject-level grouped performance - STRICTLY LATEST TEST PER SUBJECT to avoid confusion
    const subjectStats = useMemo(() => {
        const stats = {};

        // Since enrichedTests is already sorted newest first, first test encountered per subject is the latest!
        enrichedTests.forEach(test => {
            const subj = test.subject || 'General';
            if (!stats[subj]) {
                // Record latest test as the authoritative scorecard
                stats[subj] = {
                    subject: subj,
                    latestTest: test,
                    testId: test.id,
                    testCount: 1,
                    totalPassed: test.passedCount,
                    totalFailed: test.failedCount,
                    totalAbsent: test.absentCount,
                    passRate: test.passRate,
                    avgPercentage: test.maxMarks > 0 ? Math.round((test.avgScore / test.maxMarks) * 100) : 0,
                    chapter: test.chapter,
                    paragraphs: test.paragraphs,
                    dateStr: test.dateStr,
                    testType: test.testType
                };
            }
        });

        return Object.values(stats);
    }, [enrichedTests]);

    // Filter students inside popup modal
    const modalFilteredStudents = useMemo(() => {
        if (!activeReportModal || !activeReportModal.studentResults) return [];
        return activeReportModal.studentResults.filter(sr => {
            if (modalStatusFilter === 'pass' && (sr.isAbsent || !sr.isPass)) return false;
            if (modalStatusFilter === 'fail' && (sr.isAbsent || sr.isPass)) return false;
            if (modalStatusFilter === 'absent' && !sr.isAbsent) return false;

            if (modalSearchTerm.trim()) {
                const term = modalSearchTerm.toLowerCase();
                const nameMatch = sr.name.toLowerCase().includes(term);
                const rollMatch = sr.rollNo.toString().includes(term);
                return nameMatch || rollMatch;
            }
            return true;
        });
    }, [activeReportModal, modalStatusFilter, modalSearchTerm]);

    // Overall KPI Summary
    const overallMetrics = useMemo(() => {
        if (enrichedTests.length === 0) {
            return { totalTests: 0, overallPassRate: 0, bestSubject: 'N/A', attentionSubject: 'N/A' };
        }

        let totalPassed = 0;
        let totalFailed = 0;

        enrichedTests.forEach(t => {
            totalPassed += t.passedCount;
            totalFailed += t.failedCount;
        });

        const totalAttempts = totalPassed + totalFailed;
        const overallPassRate = totalAttempts > 0 ? Math.round((totalPassed / totalAttempts) * 100) : 0;

        // Find best & attention subjects
        const sortedSubjs = [...subjectStats].sort((a, b) => b.passRate - a.passRate);
        const bestSubject = sortedSubjs.length > 0 ? `${sortedSubjs[0].subject} (${sortedSubjs[0].passRate}%)` : 'N/A';
        const lowestSubj = sortedSubjs.length > 0 ? sortedSubjs[sortedSubjs.length - 1] : null;
        const attentionSubject = lowestSubj && lowestSubj.passRate < 70 ? `${lowestSubj.subject} (${lowestSubj.passRate}%)` : 'None (All Healthy)';

        return {
            totalTests: enrichedTests.length,
            overallPassRate,
            bestSubject,
            attentionSubject
        };
    }, [enrichedTests, subjectStats]);

    // Weak Students Alert: students failing 2 or more tests across subjects
    const weakStudents = useMemo(() => {
        const failureCounts = {};

        enrichedTests.forEach(test => {
            test.studentResults.forEach(sr => {
                if (!sr.isAbsent && !sr.isPass) {
                    if (!failureCounts[sr.id]) {
                        failureCounts[sr.id] = {
                            student: sr,
                            failedTests: []
                        };
                    }
                    failureCounts[sr.id].failedTests.push({
                        subject: test.subject,
                        dateStr: test.dateStr || 'Recent',
                        score: sr.score,
                        maxMarks: sr.maxMarks
                    });
                }
            });
        });

        return Object.values(failureCounts)
            .filter(item => item.failedTests.length >= 2)
            .sort((a, b) => b.failedTests.length - a.failedTests.length);
    }, [enrichedTests]);

    const handlePrintReport = () => {
        window.print();
    };

    if (loading) {
        return (
            <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div className="animate-spin" style={{ width: '36px', height: '36px', border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%' }} />
            </div>
        );
    }

    return (
        <div className="animate-fade-in-up" style={{ width: '100%' }}>
            {/* 1. TOP EXECUTIVE KPI CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                <div className="card" style={{ padding: '1.25rem', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 2px 5px rgba(0,0,0,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Total Tests Taken</span>
                        <div style={{ background: '#e0e7ff', padding: '0.4rem', borderRadius: '10px', color: '#6366f1' }}>
                            <GraduationCap size={18} />
                        </div>
                    </div>
                    <h3 style={{ fontSize: '1.85rem', fontWeight: '800', color: 'var(--text-main)' }}>{overallMetrics.totalTests}</h3>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.25rem' }}>Across all subjects</p>
                </div>

                <div className="card" style={{ padding: '1.25rem', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 2px 5px rgba(0,0,0,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Overall Pass Rate</span>
                        <div style={{ background: '#dcfce7', padding: '0.4rem', borderRadius: '10px', color: '#16a34a' }}>
                            <CheckCircle2 size={18} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        <h3 style={{ fontSize: '1.85rem', fontWeight: '800', color: overallMetrics.overallPassRate >= 75 ? '#16a34a' : '#ea580c' }}>
                            {overallMetrics.overallPassRate}%
                        </h3>
                        <span style={{ fontSize: '0.78rem', fontWeight: '600', color: '#64748b' }}>passing criteria (≥{passThreshold}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden', marginTop: '0.5rem' }}>
                        <div style={{ width: `${overallMetrics.overallPassRate}%`, height: '100%', background: overallMetrics.overallPassRate >= 75 ? '#16a34a' : '#ea580c', borderRadius: '4px' }} />
                    </div>
                </div>

                <div className="card" style={{ padding: '1.25rem', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 2px 5px rgba(0,0,0,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Top Performing</span>
                        <div style={{ background: '#fef08a', padding: '0.4rem', borderRadius: '10px', color: '#a16207' }}>
                            <Trophy size={18} />
                        </div>
                    </div>
                    <h3 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#a16207', marginTop: '0.25rem' }}>{overallMetrics.bestSubject}</h3>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.25rem' }}>Highest pass consistency</p>
                </div>

                <div className="card" style={{ padding: '1.25rem', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 2px 5px rgba(0,0,0,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Needs Attention</span>
                        <div style={{ background: '#fee2e2', padding: '0.4rem', borderRadius: '10px', color: '#dc2626' }}>
                            <AlertTriangle size={18} />
                        </div>
                    </div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#dc2626', marginTop: '0.25rem' }}>{overallMetrics.attentionSubject}</h3>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.25rem' }}>Target for revision</p>
                </div>
            </div>

            {/* 2. WEAK STUDENTS ALERT BOX (If any student failed in 2+ tests) */}
            {weakStudents.length > 0 && (
                <div style={{
                    background: '#fff1f2',
                    border: '1px solid #fecdd3',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    marginBottom: '2rem',
                    boxShadow: '0 2px 4px rgba(225, 29, 72, 0.05)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem' }}>
                        <AlertTriangle size={20} color="#e11d48" />
                        <div>
                            <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#9f1239' }}>
                                Academic Attention Alert: {weakStudents.length} Students Need Support
                            </h4>
                            <p style={{ fontSize: '0.8rem', color: '#be123c' }}>
                                These students have failed in 2 or more tests across subjects. Recommendation: Schedule quick revision or parent counseling.
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                        {weakStudents.map(({ student, failedTests }) => (
                            <div
                                key={student.id}
                                style={{
                                    background: 'white',
                                    borderRadius: '12px',
                                    padding: '0.75rem 1rem',
                                    border: '1px solid #fda4af',
                                    minWidth: '220px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                    <span style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-main)' }}>{student.name}</span>
                                    <span style={{ fontSize: '0.75rem', background: '#fee2e2', color: '#991b1b', padding: '0.15rem 0.5rem', borderRadius: '10px', fontWeight: '700' }}>
                                        {failedTests.length} Fails
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Roll No: {student.rollNo}</p>
                                <div style={{ marginTop: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                    {failedTests.map((ft, i) => (
                                        <span key={i} style={{ fontSize: '0.7rem', background: '#f1f5f9', color: '#475569', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: '600' }}>
                                            {ft.subject}: {ft.score}/{ft.maxMarks}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 3. SUBJECT-WISE PASS/FAIL CARDS SECTION */}
            <div style={{ marginBottom: '2.5rem' }}>
                <div style={{ marginBottom: '1.25rem' }}>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--text-main)' }}>Subject-wise Test Scores & Pass/Fail</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Live breakdown of pass, fail, and attendance rates for each subject</p>
                </div>

                {subjectStats.length === 0 ? (
                    <div style={{ background: 'white', padding: '2.5rem', borderRadius: '16px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>No completed test reports found for this class.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1.25rem' }}>
                        {subjectStats.map(stat => {
                            const theme = getSubjectTheme(stat.subject);
                            const totalAttempts = stat.totalPassed + stat.totalFailed;

                            return (
                                <div
                                    key={stat.subject}
                                    className="card"
                                    style={{
                                        background: 'white',
                                        borderRadius: '16px',
                                        border: '1px solid #e2e8f0',
                                        padding: '1.25rem',
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between'
                                    }}
                                >
                                    <div>
                                        {/* Card Header */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                            <div style={{
                                                background: theme.bg,
                                                color: theme.text,
                                                border: `1px solid ${theme.border}`,
                                                padding: '0.35rem 0.85rem',
                                                borderRadius: '10px',
                                                fontWeight: '800',
                                                fontSize: '0.95rem'
                                            }}>
                                                {stat.subject}
                                            </div>

                                            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600' }}>
                                                {stat.testCount} {stat.testCount === 1 ? 'Test' : 'Tests'}
                                            </span>
                                        </div>

                                        {/* Pass / Fail Visual Progress Bar */}
                                        <div style={{ marginBottom: '1rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-main)' }}>Pass Ratio</span>
                                                <span style={{ fontSize: '1.15rem', fontWeight: '800', color: stat.passRate >= 75 ? '#16a34a' : '#ea580c' }}>
                                                    {stat.passRate}%
                                                </span>
                                            </div>

                                            {/* Stacked Progress Bar */}
                                            <div style={{ height: '10px', width: '100%', background: '#fee2e2', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
                                                <div
                                                    title={`Passed: ${stat.passRate}%`}
                                                    style={{
                                                        width: `${stat.passRate}%`,
                                                        height: '100%',
                                                        background: '#16a34a',
                                                        transition: 'width 0.4s ease'
                                                    }}
                                                />
                                                <div
                                                    title={`Failed: ${100 - stat.passRate}%`}
                                                    style={{
                                                        width: `${100 - stat.passRate}%`,
                                                        height: '100%',
                                                        background: '#ef4444',
                                                        transition: 'width 0.4s ease'
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Numerical Stats Pills */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
                                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.5rem', borderRadius: '8px', textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.72rem', color: '#166534', fontWeight: '700' }}>Passed</div>
                                                <div style={{ fontSize: '1.15rem', color: '#15803d', fontWeight: '800' }}>{stat.totalPassed}</div>
                                            </div>

                                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '0.5rem', borderRadius: '8px', textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.72rem', color: '#991b1b', fontWeight: '700' }}>Failed</div>
                                                <div style={{ fontSize: '1.15rem', color: '#dc2626', fontWeight: '800' }}>{stat.totalFailed}</div>
                                            </div>

                                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.5rem', borderRadius: '8px', textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700' }}>Absent</div>
                                                <div style={{ fontSize: '1.15rem', color: '#475569', fontWeight: '800' }}>{stat.totalAbsent}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action to View Scorecard Modal */}
                                    <button
                                        onClick={() => {
                                            setSelectedTestId(stat.testId);
                                            setModalStatusFilter('all');
                                            setModalSearchTerm('');
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '0.65rem',
                                            borderRadius: '10px',
                                            border: '1px solid #c7d2fe',
                                            background: '#eef2ff',
                                            color: '#4f46e5',
                                            fontSize: '0.88rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.45rem',
                                            transition: 'all 0.15s ease'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#e0e7ff'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = '#eef2ff'}
                                    >
                                        <Eye size={16} />
                                        <span>View {stat.subject} Scorecard</span>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 5. FULL TEST REPORT MODAL (Matching Homework Modal UX & Clean Design) */}
            {activeReportModal && createPortal(
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
                    onClick={() => setSelectedTestId(null)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'white',
                            borderRadius: '20px',
                            width: '100%',
                            maxWidth: '740px',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                            overflow: 'hidden',
                            border: 'none',
                            outline: 'none'
                        }}
                    >
                        {/* Modal Header */}
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
                                    Latest Test Scorecard (Live Report)
                                </span>
                                <h3 style={{ fontSize: '1.3rem', fontWeight: '800', marginTop: '0.15rem' }}>
                                    {activeReportModal.subject} — {activeReportModal.paragraphs || activeReportModal.chapter || activeReportModal.testType || 'Class Test'}
                                </h3>
                                <p style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: '0.2rem' }}>
                                    Conducted: {activeReportModal.dateStr || 'Recent'} • Max Marks: {activeReportModal.maxMarks} (Pass ≥ {activeReportModal.passMarksRequired})
                                </p>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <button
                                    onClick={handlePrintReport}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        background: 'rgba(255,255,255,0.2)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '0.45rem 0.85rem',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontSize: '0.82rem',
                                        fontWeight: '700'
                                    }}
                                    title="Print or Save PDF"
                                >
                                    <Printer size={15} />
                                    <span>Print</span>
                                </button>

                                <button
                                    onClick={() => setSelectedTestId(null)}
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
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '1.25rem 1.75rem', overflowY: 'auto', flex: '1' }}>
                            {/* Summary Pills Filter Bar */}
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
                                    <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-main)' }}>
                                        {activeReportModal.studentResults.length}
                                    </div>
                                </div>

                                <div
                                    onClick={() => setModalStatusFilter('pass')}
                                    style={{
                                        cursor: 'pointer',
                                        background: modalStatusFilter === 'pass' ? '#bbf7d0' : '#f0fdf4',
                                        border: '1px solid',
                                        borderColor: modalStatusFilter === 'pass' ? '#16a34a' : '#bbf7d0',
                                        padding: '0.65rem',
                                        borderRadius: '10px',
                                        textAlign: 'center'
                                    }}
                                >
                                    <div style={{ fontSize: '0.72rem', color: '#166534', fontWeight: '700' }}>Passed</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#15803d' }}>
                                        {activeReportModal.passedCount}
                                    </div>
                                </div>

                                <div
                                    onClick={() => setModalStatusFilter('fail')}
                                    style={{
                                        cursor: 'pointer',
                                        background: modalStatusFilter === 'fail' ? '#fecaca' : '#fef2f2',
                                        border: '1px solid',
                                        borderColor: modalStatusFilter === 'fail' ? '#dc2626' : '#fecaca',
                                        padding: '0.65rem',
                                        borderRadius: '10px',
                                        textAlign: 'center'
                                    }}
                                >
                                    <div style={{ fontSize: '0.72rem', color: '#991b1b', fontWeight: '700' }}>Failed</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#dc2626' }}>
                                        {activeReportModal.failedCount}
                                    </div>
                                </div>

                                <div
                                    onClick={() => setModalStatusFilter('absent')}
                                    style={{
                                        cursor: 'pointer',
                                        background: modalStatusFilter === 'absent' ? '#e2e8f0' : '#f8fafc',
                                        border: '1px solid',
                                        borderColor: modalStatusFilter === 'absent' ? '#64748b' : '#e2e8f0',
                                        padding: '0.65rem',
                                        borderRadius: '10px',
                                        textAlign: 'center'
                                    }}
                                >
                                    <div style={{ fontSize: '0.72rem', color: '#475569', fontWeight: '700' }}>Absent</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#475569' }}>
                                        {activeReportModal.absentCount}
                                    </div>
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
                                    <p style={{ fontSize: '0.9rem', fontWeight: '600' }}>No students found matching this filter.</p>
                                </div>
                            ) : (
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                                        <thead>
                                            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                                <th style={{ padding: '0.65rem 0.85rem', fontWeight: '700', color: '#475569', width: '65px' }}>Rank</th>
                                                <th style={{ padding: '0.65rem 0.85rem', fontWeight: '700', color: '#475569', width: '80px' }}>Roll No</th>
                                                <th style={{ padding: '0.65rem 0.85rem', fontWeight: '700', color: '#475569' }}>Student Name</th>
                                                <th style={{ padding: '0.65rem 0.85rem', fontWeight: '700', color: '#475569', textAlign: 'right', width: '90px' }}>Score</th>
                                                <th style={{ padding: '0.65rem 0.85rem', fontWeight: '700', color: '#475569', textAlign: 'right', width: '60px' }}>%</th>
                                                <th style={{ padding: '0.65rem 0.85rem', fontWeight: '700', color: '#475569', textAlign: 'center', width: '95px' }}>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {modalFilteredStudents.map((sr, index) => {
                                                const isTop3 = sr.rank === 1 || sr.rank === 2 || sr.rank === 3;
                                                const medalColor = sr.rank === 1 ? '#eab308' : (sr.rank === 2 ? '#94a3b8' : '#d97706');

                                                return (
                                                    <tr
                                                        key={sr.id || index}
                                                        style={{
                                                            borderBottom: '1px solid #f1f5f9',
                                                            background: sr.isAbsent ? '#fafafa' : (index % 2 === 0 ? 'white' : '#fcfcfd')
                                                        }}
                                                    >
                                                        {/* Rank */}
                                                        <td style={{ padding: '0.65rem 0.85rem', fontWeight: '800' }}>
                                                            {sr.isAbsent ? (
                                                                <span style={{ color: '#94a3b8' }}>-</span>
                                                            ) : isTop3 ? (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: medalColor }}>
                                                                    <Trophy size={14} />
                                                                    <span>#{sr.rank}</span>
                                                                </div>
                                                            ) : (
                                                                <span style={{ color: '#64748b' }}>#{sr.rank}</span>
                                                            )}
                                                        </td>

                                                        {/* Roll No */}
                                                        <td style={{ padding: '0.65rem 0.85rem', color: '#64748b', fontWeight: '600' }}>
                                                            {sr.rollNo}
                                                        </td>

                                                        {/* Name */}
                                                        <td style={{ padding: '0.65rem 0.85rem', fontWeight: '700', color: 'var(--text-main)' }}>
                                                            {sr.name}
                                                        </td>

                                                        {/* Score */}
                                                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: '800' }}>
                                                            {sr.isAbsent ? (
                                                                <span style={{ color: '#94a3b8' }}>-</span>
                                                            ) : (
                                                                <span style={{ color: sr.isPass ? '#15803d' : '#b91c1c' }}>
                                                                    {sr.score} / {sr.maxMarks}
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* Percentage */}
                                                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: '600', color: '#475569' }}>
                                                            {sr.isAbsent ? '-' : `${sr.percentage}%`}
                                                        </td>

                                                        {/* Status Badge */}
                                                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                                                            {sr.isAbsent ? (
                                                                <span style={{ background: '#f1f5f9', color: '#64748b', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700' }}>
                                                                    ABSENT
                                                                </span>
                                                            ) : sr.isPass ? (
                                                                <span style={{ background: '#dcfce7', color: '#166534', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700' }}>
                                                                    PASS
                                                                </span>
                                                            ) : (
                                                                <span style={{ background: '#fee2e2', color: '#991b1b', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700' }}>
                                                                    FAIL
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

                        {/* Modal Footer */}
                        <div style={{ padding: '0.9rem 1.5rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                onClick={() => setSelectedTestId(null)}
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

export default ClassTestsReportView;
