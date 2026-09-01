import React, { useState, useEffect, useMemo } from 'react';
import { Users, Search, BookOpen, ChevronRight, X, Sparkles } from 'lucide-react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebase';
import CachedImage from './CachedImage';

const TeachersFeedSidebar = ({ schoolId, posts = [], selectedTeacherFilter, onSelectTeacherFilter }) => {
    const [teachers, setTeachers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    // Fetch Teachers
    useEffect(() => {
        if (!schoolId) return;

        const q = query(collection(db, `schools/${schoolId}/teachers`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            // Sort by name
            list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setTeachers(list);
            setLoading(false);
        }, (err) => {
            console.error("TeachersFeedSidebar: Error fetching teachers", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [schoolId]);

    // Calculate post count per teacher from current loaded posts
    const teacherPostCounts = useMemo(() => {
        const counts = {};
        posts.forEach(post => {
            if (post.role === 'Teacher' || post.authorRole === 'Teacher' || post.teacherId || post.authorId) {
                const identifier = post.authorId || post.teacherId || post.authorName;
                if (identifier) {
                    counts[identifier] = (counts[identifier] || 0) + 1;
                }
                if (post.authorName) {
                    const normName = post.authorName.toLowerCase().trim();
                    counts[normName] = (counts[normName] || 0) + 1;
                }
            }
        });
        return counts;
    }, [posts]);

    // Filter teachers by search
    const filteredTeachers = useMemo(() => {
        if (!searchTerm.trim()) return teachers;
        const term = searchTerm.toLowerCase();
        return teachers.filter(t => 
            (t.name && t.name.toLowerCase().includes(term)) ||
            (t.subject && t.subject.toLowerCase().includes(term)) ||
            (Array.isArray(t.subjects) && t.subjects.some(s => s.toLowerCase().includes(term))) ||
            (t.assignedClass && t.assignedClass.toLowerCase().includes(term))
        );
    }, [teachers, searchTerm]);

    const getTeacherPostCount = (teacher) => {
        return teacherPostCounts[teacher.id] || 
               teacherPostCounts[teacher.name?.toLowerCase()?.trim()] || 
               0;
    };

    return (
        <div style={{
            background: 'var(--bg-surface, #ffffff)',
            borderRadius: '16px',
            border: '1px solid var(--border-color, #e2e8f0)',
            boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            height: '100%',
            maxHeight: '100%'
        }}>
            {/* Header */}
            <div style={{
                padding: '1.25rem 1.25rem 1rem',
                borderBottom: '1px solid var(--border-color, #f1f5f9)',
                background: 'linear-gradient(180deg, rgba(79, 70, 229, 0.04) 0%, rgba(255, 255, 255, 0) 100%)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: '#e0e7ff',
                            color: '#4338ca',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Users size={18} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-main, #0f172a)' }}>
                                Teacher Posts
                            </h3>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
                                {teachers.length} Faculty Members
                            </span>
                        </div>
                    </div>

                    {selectedTeacherFilter && (
                        <button
                            onClick={() => onSelectTeacherFilter(null)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.75rem',
                                color: '#ef4444',
                                background: '#fee2e2',
                                border: 'none',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600'
                            }}
                            title="Clear Filter"
                        >
                            <X size={12} /> Clear
                        </button>
                    )}
                </div>

                {/* Search Bar */}
                <div style={{ position: 'relative', marginTop: '0.5rem' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search teacher or subject..."
                        style={{
                            width: '100%',
                            padding: '0.45rem 0.75rem 0.45rem 2rem',
                            fontSize: '0.82rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color, #e2e8f0)',
                            background: '#f8fafc',
                            outline: 'none',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>
            </div>

            {/* "All Feed" Filter Pill */}
            <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                <button
                    onClick={() => onSelectTeacherFilter(null)}
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        border: !selectedTeacherFilter ? '1.5px solid #6366f1' : '1px solid transparent',
                        background: !selectedTeacherFilter ? '#eff6ff' : 'transparent',
                        color: !selectedTeacherFilter ? '#1e40af' : 'var(--text-main, #334155)',
                        fontWeight: !selectedTeacherFilter ? '700' : '500',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Sparkles size={15} color={!selectedTeacherFilter ? '#3b82f6' : '#64748b'} />
                        <span>All Feed (Entire School)</span>
                    </div>
                    <span style={{
                        fontSize: '0.72rem',
                        padding: '2px 6px',
                        borderRadius: '12px',
                        background: !selectedTeacherFilter ? '#3b82f6' : '#e2e8f0',
                        color: !selectedTeacherFilter ? '#ffffff' : '#64748b',
                        fontWeight: '700'
                    }}>
                        {posts.length}
                    </span>
                </button>
            </div>

            {/* Teachers List */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem'
            }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8', fontSize: '0.85rem' }}>
                        Loading faculty...
                    </div>
                ) : filteredTeachers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8', fontSize: '0.85rem' }}>
                        No teachers found
                    </div>
                ) : (
                    filteredTeachers.map(teacher => {
                        const count = getTeacherPostCount(teacher);
                        const isSelected = selectedTeacherFilter && (
                            selectedTeacherFilter.id === teacher.id || 
                            selectedTeacherFilter.name?.toLowerCase() === teacher.name?.toLowerCase()
                        );

                        const primarySubject = Array.isArray(teacher.subjects) && teacher.subjects.length > 0 
                            ? teacher.subjects[0] 
                            : (teacher.subject || teacher.assignedClass || 'Faculty');

                        return (
                            <div
                                key={teacher.id}
                                onClick={() => onSelectTeacherFilter(isSelected ? null : teacher)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.55rem 0.65rem',
                                    borderRadius: '10px',
                                    cursor: 'pointer',
                                    background: isSelected ? '#f5f3ff' : 'transparent',
                                    border: isSelected ? '1.5px solid #8b5cf6' : '1px solid transparent',
                                    transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                    if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                                }}
                                onMouseLeave={(e) => {
                                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', overflow: 'hidden' }}>
                                    {/* Avatar */}
                                    <div style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '50%',
                                        background: '#ede9fe',
                                        overflow: 'hidden',
                                        flexShrink: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '1.5px solid #ddd6fe'
                                    }}>
                                        {teacher.image || teacher.profileImage || teacher.photoUrl ? (
                                            <CachedImage
                                                src={teacher.image || teacher.profileImage || teacher.photoUrl}
                                                alt={teacher.name}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                        ) : (
                                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#6d28d9' }}>
                                                {(teacher.name || 'T')[0].toUpperCase()}
                                            </span>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div style={{ overflow: 'hidden' }}>
                                        <div style={{
                                            fontSize: '0.85rem',
                                            fontWeight: isSelected ? '700' : '600',
                                            color: isSelected ? '#5b21b6' : 'var(--text-main, #1e293b)',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {teacher.name}
                                        </div>
                                        <div style={{
                                            fontSize: '0.72rem',
                                            color: 'var(--text-secondary, #64748b)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '3px'
                                        }}>
                                            <BookOpen size={10} />
                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '110px' }}>
                                                {primarySubject}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Post Count Badge */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                    <span style={{
                                        fontSize: '0.7rem',
                                        fontWeight: '700',
                                        padding: '2px 7px',
                                        borderRadius: '12px',
                                        background: count > 0 ? (isSelected ? '#7c3aed' : '#ede9fe') : '#f1f5f9',
                                        color: count > 0 ? (isSelected ? '#ffffff' : '#6d28d9') : '#94a3b8',
                                        transition: 'all 0.2s ease'
                                    }}>
                                        {count} {count === 1 ? 'Post' : 'Posts'}
                                    </span>
                                    <ChevronRight size={14} color={isSelected ? '#7c3aed' : '#cbd5e1'} />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default TeachersFeedSidebar;
