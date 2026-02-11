import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { db, storage } from '../firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';

/**
 * StudentCircle Component
 * Displays student profile images in a circular layout
 * Shows: image, name, class, roll number
 * Fetches images from Firebase Storage
 */
const StudentCircle = ({ classId, schoolId, className, maxStudents = 20, size = 'medium' }) => {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedStudent, setSelectedStudent] = useState(null);

    // Size configurations
    const sizeConfig = {
        small: { container: 200, avatar: 40, radius: 80 },
        medium: { container: 300, avatar: 50, radius: 120 },
        large: { container: 400, avatar: 60, radius: 160 }
    };

    const config = sizeConfig[size] || sizeConfig.medium;

    // Fetch students in real-time
    useEffect(() => {
        if (!schoolId || !classId) return;

        setLoading(true);
        const q = query(collection(db, `schools/${schoolId}/classes/${classId}/students`));

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const studentsData = await Promise.all(
                snapshot.docs.map(async (doc) => {
                    const data = doc.data();
                    let imageUrl = null;

                    // Try to fetch from Firebase Storage
                    try {
                        const storageRef = ref(storage, `schools/${schoolId}/students/${doc.id}/profile.jpg`);
                        imageUrl = await getDownloadURL(storageRef);
                    } catch (error) {
                        // If no image in storage, check for base64 or use empty
                        if (data.profilePic && data.profilePic.startsWith('data:')) {
                            imageUrl = data.profilePic;
                        }
                        // Otherwise imageUrl stays null (will show empty state)
                    }

                    return {
                        id: doc.id,
                        name: data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
                        rollNo: data.rollNo || 'N/A',
                        className: className || data.className || 'N/A',
                        imageUrl,
                        ...data
                    };
                })
            );

            // Sort by roll number or name
            studentsData.sort((a, b) => {
                const rollA = parseInt(a.rollNo) || 999;
                const rollB = parseInt(b.rollNo) || 999;
                return rollA - rollB;
            });

            setStudents(studentsData.slice(0, maxStudents));
            setLoading(false);
        }, (error) => {
            console.error("Error fetching students:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [schoolId, classId, className, maxStudents]);

    // Calculate position for each student in the circle
    const getPosition = (index, total) => {
        const angle = (index * 360) / total;
        const radian = (angle - 90) * (Math.PI / 180); // Start from top
        const x = config.radius * Math.cos(radian);
        const y = config.radius * Math.sin(radian);
        return { x, y, angle };
    };

    if (loading) {
        return (
            <div style={{
                width: config.container,
                height: config.container,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto'
            }}>
                <div className="animate-spin" style={{
                    width: 40,
                    height: 40,
                    border: '4px solid #e2e8f0',
                    borderTopColor: 'var(--primary)',
                    borderRadius: '50%'
                }} />
            </div>
        );
    }

    if (students.length === 0) {
        return (
            <div style={{
                width: config.container,
                height: config.container,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
                textAlign: 'center',
                padding: '2rem'
            }}>
                No students enrolled in this class yet.
            </div>
        );
    }

    return (
        <div style={{ position: 'relative', margin: '2rem auto' }}>
            {/* Circle Container */}
            <div style={{
                width: config.container,
                height: config.container,
                position: 'relative',
                margin: '0 auto'
            }}>
                {/* Center Info */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    zIndex: 1
                }}>
                    <div style={{
                        fontSize: '2rem',
                        fontWeight: '800',
                        color: 'var(--primary)',
                        marginBottom: '0.25rem'
                    }}>
                        {students.length}
                    </div>
                    <div style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                        fontWeight: '600'
                    }}>
                        Students
                    </div>
                    {className && (
                        <div style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            marginTop: '0.25rem'
                        }}>
                            {className}
                        </div>
                    )}
                </div>

                {/* Student Avatars in Circle */}
                {students.map((student, index) => {
                    const { x, y } = getPosition(index, students.length);
                    const isSelected = selectedStudent?.id === student.id;

                    return (
                        <div
                            key={student.id}
                            onClick={() => setSelectedStudent(isSelected ? null : student)}
                            style={{
                                position: 'absolute',
                                left: '50%',
                                top: '50%',
                                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                zIndex: isSelected ? 10 : 2
                            }}
                        >
                            {/* Avatar */}
                            <div style={{
                                width: config.avatar,
                                height: config.avatar,
                                borderRadius: '50%',
                                overflow: 'hidden',
                                border: isSelected ? '3px solid var(--primary)' : '2px solid white',
                                boxShadow: isSelected
                                    ? '0 8px 16px rgba(99, 102, 241, 0.3)'
                                    : '0 4px 8px rgba(0, 0, 0, 0.1)',
                                background: '#f1f5f9',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transform: isSelected ? 'scale(1.2)' : 'scale(1)',
                                transition: 'all 0.3s ease'
                            }}>
                                {student.imageUrl ? (
                                    <img
                                        src={student.imageUrl}
                                        alt={student.name}
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover'
                                        }}
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                            e.target.parentElement.innerHTML = `<div style="width: 100%; height: 100%; background: #e2e8f0; display: flex; align-items: center; justify-content: center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>`;
                                        }}
                                    />
                                ) : (
                                    <User size={config.avatar * 0.5} color="#94a3b8" />
                                )}
                            </div>

                            {/* Tooltip on Hover */}
                            <div style={{
                                position: 'absolute',
                                bottom: '100%',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                marginBottom: '8px',
                                padding: '0.5rem 0.75rem',
                                background: 'rgba(0, 0, 0, 0.9)',
                                color: 'white',
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                                whiteSpace: 'nowrap',
                                opacity: 0,
                                pointerEvents: 'none',
                                transition: 'opacity 0.2s',
                                zIndex: 100
                            }}
                                className="student-tooltip">
                                <div style={{ fontWeight: '600', marginBottom: '2px' }}>{student.name}</div>
                                <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Roll: {student.rollNo}</div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Selected Student Info Card */}
            {selectedStudent && (
                <div className="animate-fade-in-up" style={{
                    marginTop: '2rem',
                    padding: '1.5rem',
                    background: 'white',
                    borderRadius: '16px',
                    border: '2px solid var(--primary)',
                    boxShadow: '0 8px 16px rgba(99, 102, 241, 0.1)',
                    maxWidth: '400px',
                    margin: '2rem auto 0'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: 60,
                            height: 60,
                            borderRadius: '12px',
                            overflow: 'hidden',
                            background: '#f1f5f9',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            {selectedStudent.imageUrl ? (
                                <img
                                    src={selectedStudent.imageUrl}
                                    alt={selectedStudent.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            ) : (
                                <User size={30} color="#94a3b8" />
                            )}
                        </div>
                        <div style={{ flex: 1 }}>
                            <h3 style={{
                                fontSize: '1.1rem',
                                fontWeight: '700',
                                color: 'var(--text-main)',
                                marginBottom: '0.25rem'
                            }}>
                                {selectedStudent.name}
                            </h3>
                            <div style={{
                                display: 'flex',
                                gap: '1rem',
                                fontSize: '0.85rem',
                                color: 'var(--text-secondary)'
                            }}>
                                <span><strong>Roll:</strong> {selectedStudent.rollNo}</span>
                                <span><strong>Class:</strong> {selectedStudent.className}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CSS for hover effect */}
            <style>{`
                .student-tooltip {
                    opacity: 0;
                }
                div:hover > .student-tooltip {
                    opacity: 1;
                }
            `}</style>
        </div>
    );
};

export default StudentCircle;
