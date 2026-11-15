import React, { useState, useMemo } from 'react';
import { Search, X, Trophy, CheckCircle2, XCircle, Award } from 'lucide-react';
import StudentExamModal from './StudentExamModal';
import CachedImage from './CachedImage';
import { getStudentAvatar } from '../utils/defaultAvatar';

const ClassExamsView = ({ schoolId, classId, classData, students = [] }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'present', 'absent'
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [selectedCardRect, setSelectedCardRect] = useState(null);
    const [showExamModal, setShowExamModal] = useState(false);

    // Filter students by search term and attendance status (preserves master Roll Number order)
    const filteredStudents = useMemo(() => {
        return (students || []).filter(student => {
            const matchesSearch =
                (student.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (student.rollNo || '').toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
                (student.classRank || '').toString().includes(searchTerm);

            if (filterStatus === 'all') return matchesSearch;
            return matchesSearch && student.status === filterStatus;
        });
    }, [students, searchTerm, filterStatus]);

    return (
        <div style={{ width: '100%' }}>
            {/* Search Bar */}
            <div style={{ marginBottom: '1.5rem' }}>
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
                        placeholder="Search student in Exams by name, roll no, or rank..."
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

            {/* Action Bar & Attendance Filters */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Award size={22} color="#6366f1" />
                    <div>
                        <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
                            Term Examinations
                        </h2>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                            Click on any student card to view their single-term exam report
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', background: 'white', padding: '0.4rem', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <button
                        onClick={() => setFilterStatus('all')}
                        style={{
                            padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600',
                            fontSize: '0.85rem',
                            background: filterStatus === 'all' ? 'var(--primary)' : 'transparent',
                            color: filterStatus === 'all' ? 'white' : 'var(--text-secondary)'
                        }}
                    >
                        All ({students.length})
                    </button>
                    <button
                        onClick={() => setFilterStatus('present')}
                        style={{
                            padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600',
                            fontSize: '0.85rem',
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            background: filterStatus === 'present' ? '#dcfce7' : 'transparent',
                            color: filterStatus === 'present' ? '#166534' : 'var(--text-secondary)'
                        }}
                    >
                        <CheckCircle2 size={15} /> Present
                    </button>
                    <button
                        onClick={() => setFilterStatus('absent')}
                        style={{
                            padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600',
                            fontSize: '0.85rem',
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            background: filterStatus === 'absent' ? '#fee2e2' : 'transparent',
                            color: filterStatus === 'absent' ? '#991b1b' : 'var(--text-secondary)'
                        }}
                    >
                        <XCircle size={15} /> Absent
                    </button>
                </div>
            </div>

            {/* Students Grid - Clean Option B Style */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                {filteredStudents.map((student) => (
                    <div
                        key={student.id}
                        className="card cursor-pointer transform hover:scale-105 transition-transform duration-200"
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setSelectedCardRect(rect);
                            setSelectedStudent({ ...student, rank: student.classRank });
                            setShowExamModal(true);
                        }}
                        style={{
                            padding: '1.5rem',
                            position: 'relative',
                            border: 'none',
                            background: 'white',
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                            borderRadius: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            textAlign: 'center'
                        }}
                    >
                        {/* Rank Badge - Top Left */}
                        <div style={{
                            position: 'absolute',
                            top: '1rem',
                            left: '1rem',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: '800',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            background: student.classRank === 1 ? '#fef08a' :
                                student.classRank === 2 ? '#f1f5f9' :
                                    student.classRank === 3 ? '#ffedd5' : '#f8fafc',
                            color: student.classRank === 1 ? '#a16207' :
                                student.classRank === 2 ? '#475569' :
                                    student.classRank === 3 ? '#9a3412' : '#64748b',
                            border: '1px solid',
                            borderColor: student.classRank === 1 ? '#fde047' :
                                student.classRank === 2 ? '#e2e8f0' :
                                    student.classRank === 3 ? '#fed7aa' : '#f1f5f9',
                        }}>
                            <Trophy size={12} />
                            #{student.classRank}
                        </div>

                        {/* Student Avatar */}
                        <div style={{
                            width: '80px', height: '80px', borderRadius: '50%', marginBottom: '1rem',
                            background: '#f3f4f6', overflow: 'hidden', border: '3px solid white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                        }}>
                            <CachedImage
                                src={getStudentAvatar(student)}
                                alt={student.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        </div>

                        {/* Name & Roll No */}
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                            {student.name}
                        </h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', fontWeight: '500' }}>
                            Roll No: {student.rollNo}
                        </p>

                        {/* Attendance Status */}
                        <div style={{
                            padding: '0.5rem 1rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '600', width: '100%',
                            background: student.status === 'present' ? '#dcfce7' : '#fee2e2',
                            color: student.status === 'present' ? '#166534' : '#991b1b',
                            marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                        }}>
                            {student.status === 'present' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                            {student.status === 'present' ? 'Present Today' : 'Absent Today'}
                        </div>

                        {/* Hint Pill */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            color: '#6366f1'
                        }}>
                            <Award size={13} />
                            <span>Click to view exam</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Dedicated Exam Result Modal */}
            <StudentExamModal
                key={selectedStudent?.id || 'exam-modal'}
                isOpen={showExamModal}
                onClose={() => setShowExamModal(false)}
                student={selectedStudent}
                rank={selectedStudent?.rank}
                classSubjects={classData?.subjects}
                cardRect={selectedCardRect}
                schoolId={schoolId}
                classId={classId}
            />
        </div>
    );
};

export default ClassExamsView;
