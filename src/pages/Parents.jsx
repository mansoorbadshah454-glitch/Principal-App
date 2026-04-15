import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Search, Filter, BookOpen, Users, User, Phone, Mail, Trash2, Loader2, Star, MoreVertical, ChevronRight, ChevronLeft, Edit, ShieldCheck, Baby } from 'lucide-react';
import { db, functions } from '../firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, where, getDocs, updateDoc, writeBatch, getDoc } from 'firebase/firestore';
import { auth } from '../firebase';
import { httpsCallable } from 'firebase/functions';

// Internal Component for individual Parent Card logic
const ParentCard = ({ parent, onDelete, onUpdate, onMessage, onSendMessage, dbClasses, schoolId }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isMessaging, setIsMessaging] = useState(false);
    const [editStep, setEditStep] = useState(1);
    const [editedParent, setEditedParent] = useState({ ...parent });
    const [localMessageText, setLocalMessageText] = useState('');

    // Step 3 Student Linking State
    const [selectedStepClassId, setSelectedStepClassId] = useState('');
    const [selectedStepStudentId, setSelectedStepStudentId] = useState('');
    const [availableStepStudents, setAvailableStepStudents] = useState([]);

    const cardRef = React.useRef(null);

    // Click outside logic
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (cardRef.current && !cardRef.current.contains(event.target)) {
                setIsEditing(false);
                setIsMessaging(false);
                setEditStep(1);
                setEditedParent({ ...parent }); // Reset on cancel
            }
        };

        if (isEditing || isMessaging) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isEditing, parent]);

    // Fetch students for Step 3 within Card
    useEffect(() => {
        if (!schoolId || !selectedStepClassId) {
            setAvailableStepStudents([]);
            return;
        }

        const fetchStudents = async () => {
            try {
                const q = query(collection(db, `schools/${schoolId}/classes/${selectedStepClassId}/students`));
                const snapshot = await getDocs(q);
                // Automatically vaporize any ghost clones that were created by the earlier bug!
                const validStudents = [];
                snapshot.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    if (!data.name && !data.firstName) {
                        // This is a ghost clone! Destroy it natively.
                        deleteDoc(docSnap.ref).catch(e => console.error("Ghost Buster Error:", e));
                    } else {
                        validStudents.push({
                            id: docSnap.id,
                            name: data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
                            rollNo: data.rollNo
                        });
                    }
                });
                
                setAvailableStepStudents(validStudents);
            } catch (err) {
                console.error("Error fetching students in card:", err);
            }
        };
        fetchStudents();
    }, [schoolId, selectedStepClassId]);

    const handleLinkStudent = () => {
        if (!selectedStepClassId || !selectedStepStudentId) return;

        const classObj = dbClasses.find(c => c.id === selectedStepClassId);
        const studentObj = availableStepStudents.find(s => s.id === selectedStepStudentId);

        if (classObj && studentObj) {
            const exists = editedParent.linkedStudents?.some(s => s.studentId === studentObj.id);
            if (!exists) {
                setEditedParent(prev => ({
                    ...prev,
                    linkedStudents: [...(prev.linkedStudents || []), {
                        studentId: studentObj.id,
                        studentName: studentObj.name,
                        classId: classObj.id,
                        className: classObj.name,
                        rollNo: studentObj.rollNo || ''
                    }]
                }));
            }
        }
        setSelectedStepStudentId('');
    };

    const handleUnlinkStudent = (studentId) => {
        setEditedParent(prev => ({
            ...prev,
            linkedStudents: prev.linkedStudents.filter(s => s.studentId !== studentId)
        }));
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        try {
            await onUpdate(parent.id, editedParent);
            setIsEditing(false);
            setEditStep(1);
        } catch (error) {
            console.error("Error updating parent:", error);
            alert("Failed to update parent.");
        }
    };

    // Dynamic Theme Color based on name char code for variety
    const seed = parent.name.charCodeAt(0) || 123;
    const isEven = seed % 2 === 0;
    const themeColor = isEven ? '#bc1888' : '#e6683c'; // Use IG palette colors

    const handleInlineSendMessage = async () => {
        if (!localMessageText.trim()) return;
        try {
            await onSendMessage(parent.id, localMessageText.trim());
            setIsMessaging(false);
            setLocalMessageText('');
        } catch (error) {
            console.error("Error sending message:", error);
            alert("Failed to send message.");
        }
    };

    if (isMessaging) {
        return (
            <div ref={cardRef} className="card animate-scale-in" style={{
                padding: '0',
                overflow: 'hidden',
                border: 'none',
                position: 'relative',
                background: '#fffaff',
                boxShadow: '12px 12px 0px 0px rgba(188, 24, 136, 0.2)',
                borderRadius: '24px',
                zIndex: 50
            }}>
                <div style={{
                    padding: '1.2rem 1.5rem',
                    background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                    color: 'white'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '800' }}>Message Parent</h3>
                        </div>
                        <button onClick={() => setIsMessaging(false)} style={{ background: 'rgba(255, 255, 255, 0.2)', border: 'none', borderRadius: '10px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: 'white', borderRadius: '16px', border: '1px solid #fdf2ff' }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '50%',
                            background: '#bc1888', color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '1.1rem'
                        }}>
                            {parent.name.charAt(0)}
                        </div>
                        <div>
                            <h4 style={{ fontWeight: '700', margin: 0, fontSize: '0.95rem' }}>{parent.name}</h4>
                            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>Write your private message below</p>
                        </div>
                    </div>

                    <textarea
                        placeholder="Type your message here..."
                        rows="5"
                        value={localMessageText}
                        onChange={(e) => setLocalMessageText(e.target.value)}
                        style={{
                            width: '100%', padding: '1rem', borderRadius: '16px',
                            border: '1px solid #fdf2ff', resize: 'none', outline: 'none',
                            fontSize: '0.9rem', background: 'white', fontFamily: 'inherit'
                        }}
                    />

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                            type="button"
                            onClick={() => setIsMessaging(false)}
                            style={{ flex: 1, padding: '0.85rem', borderRadius: '14px', background: 'white', border: '2px solid #fdf2ff', color: '#64748b', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem' }}
                        >
                            Back
                        </button>
                        <button
                            type="button"
                            onClick={handleInlineSendMessage}
                            disabled={!localMessageText.trim()}
                            style={{
                                flex: 1.5, padding: '0.85rem', borderRadius: '14px',
                                background: '#bc1888', border: 'none', color: 'white',
                                fontWeight: '700', cursor: localMessageText.trim() ? 'pointer' : 'not-allowed',
                                fontSize: '0.9rem', boxShadow: '0 4px 15px rgba(188, 24, 136, 0.25)',
                                opacity: localMessageText.trim() ? 1 : 0.6
                            }}
                        >
                            Send Message
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (isEditing) {
        return (
            <div ref={cardRef} className="card animate-scale-in" style={{
                padding: '0',
                overflow: 'hidden',
                border: 'none',
                position: 'relative',
                background: '#fffaff',
                boxShadow: '12px 12px 0px 0px rgba(188, 24, 136, 0.2)',
                borderRadius: '24px',
                zIndex: 50
            }}>
                <div style={{
                    padding: '1.2rem 1.5rem',
                    background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                    color: 'white'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {editStep > 1 && (
                                <button
                                    onClick={() => setEditStep(prev => prev - 1)}
                                    style={{ background: 'rgba(255, 255, 255, 0.2)', border: 'none', borderRadius: '10px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}
                                >
                                    <ChevronLeft size={18} />
                                </button>
                            )}
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '800' }}>
                                {editStep === 1 ? 'Personal Info' : editStep === 2 ? 'Account Login' : 'Manage Students'}
                            </h3>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '700', padding: '0.2rem 0.5rem', background: 'rgba(255, 255, 255, 0.2)', borderRadius: '10px' }}>
                                {editStep}/3
                            </span>
                            {editStep < 3 && (
                                <button
                                    onClick={() => setEditStep(prev => prev + 1)}
                                    style={{ background: 'white', border: 'none', borderRadius: '10px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#bc1888' }}
                                >
                                    <ChevronRight size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div style={{
                    padding: '1.5rem',
                    maxHeight: '420px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.25rem'
                }}>
                    {editStep === 1 && (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#bc1888', display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Name</label>
                                    <input
                                        type="text"
                                        value={editedParent.name}
                                        onChange={(e) => setEditedParent({ ...editedParent, name: e.target.value })}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #fdf2ff', outline: 'none', fontSize: '0.9rem', background: 'white' }}
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#bc1888', display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Phone</label>
                                    <input
                                        type="tel"
                                        value={editedParent.phone}
                                        onChange={(e) => setEditedParent({ ...editedParent, phone: e.target.value })}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #fdf2ff', outline: 'none', fontSize: '0.9rem', background: 'white' }}
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#bc1888', display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Occupation</label>
                                <input
                                    type="text"
                                    value={editedParent.occupation || ''}
                                    onChange={(e) => setEditedParent({ ...editedParent, occupation: e.target.value })}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #fdf2ff', outline: 'none', fontSize: '0.9rem', background: 'white' }}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#bc1888', display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Address</label>
                                <textarea
                                    value={editedParent.address}
                                    onChange={(e) => setEditedParent({ ...editedParent, address: e.target.value })}
                                    rows="3"
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #fdf2ff', outline: 'none', fontSize: '0.9rem', resize: 'none', background: 'white' }}
                                    required
                                />
                            </div>
                        </>
                    )}

                    {editStep === 2 && (
                        <>
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '16px', border: '1px solid #fdf2ff' }}>
                                <div style={{ marginBottom: '1.25rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#bc1888', display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Username</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#fffaff', padding: '0.5rem 0.75rem', borderRadius: '10px' }}>
                                        <User size={16} color="#bc1888" />
                                        <input
                                            type="text"
                                            value={editedParent.username || ''}
                                            onChange={(e) => setEditedParent({ ...editedParent, username: e.target.value })}
                                            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.95rem', fontWeight: '600', width: '100%' }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#bc1888', display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Password</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#fffaff', padding: '0.5rem 0.75rem', borderRadius: '10px' }}>
                                        <ShieldCheck size={16} color="#bc1888" />
                                        <input
                                            type="text"
                                            value={editedParent.password || ''}
                                            onChange={(e) => setEditedParent({ ...editedParent, password: e.target.value })}
                                            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.95rem', fontWeight: '600', width: '100%' }}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div style={{ padding: '0.5rem', background: '#fff7ed', borderRadius: '12px', border: '1px dashed #fdba74', color: '#9a3412', fontSize: '0.8rem', fontWeight: '500' }}>
                                <p>Provide these credentials to the parent to log in to the Parent App.</p>
                            </div>
                        </>
                    )}

                    {editStep === 3 && (
                        <>
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '16px', border: '1px solid #fdf2ff' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <select
                                            value={selectedStepClassId}
                                            onChange={(e) => setSelectedStepClassId(e.target.value)}
                                            style={{ flex: 1, padding: '0.6rem', borderRadius: '10px', border: '1px solid #f1f5f9', fontSize: '0.85rem', outline: 'none' }}
                                        >
                                            <option value="">Class</option>
                                            {dbClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                        <select
                                            value={selectedStepStudentId}
                                            onChange={(e) => setSelectedStepStudentId(e.target.value)}
                                            disabled={!selectedStepClassId}
                                            style={{ flex: 1.5, padding: '0.6rem', borderRadius: '10px', border: '1px solid #f1f5f9', fontSize: '0.85rem', outline: 'none' }}
                                        >
                                            <option value="">Student</option>
                                            {availableStepStudents.map(s => <option key={s.id} value={s.id}>{s.name} ({s.rollNo})</option>)}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={handleLinkStudent}
                                            disabled={!selectedStepStudentId}
                                            style={{ background: '#bc1888', color: 'white', border: 'none', borderRadius: '10px', padding: '0.5rem', cursor: selectedStepStudentId ? 'pointer' : 'not-allowed', opacity: selectedStepStudentId ? 1 : 0.5 }}
                                        >
                                            <Plus size={18} />
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748b' }}>LINKED STUDENTS</label>
                                        {editedParent.linkedStudents?.map((child, idx) => (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fffaff', padding: '0.5rem 0.75rem', borderRadius: '10px', border: '1px solid #fdf2ff' }}>
                                                <div>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b' }}>{child.studentName}</span>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: '0.5rem', background: 'white', padding: '1px 6px', borderRadius: '6px' }}>{child.className}</span>
                                                </div>
                                                <button onClick={() => handleUnlinkStudent(child.studentId)} type="button" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={() => {
                                if (editStep > 1) {
                                    setEditStep(prev => prev - 1);
                                } else {
                                    setIsEditing(false);
                                    setEditedParent({ ...parent });
                                }
                            }}
                            style={{ flex: 1, padding: '0.85rem', borderRadius: '14px', background: 'white', border: '2px solid #fdf2ff', color: '#64748b', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem' }}
                        >
                            {editStep === 1 ? 'Back' : 'Back Step'}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (editStep < 3) {
                                    setEditStep(prev => prev + 1);
                                } else {
                                    handleSave();
                                }
                            }}
                            style={{ flex: 1.5, padding: '0.85rem', borderRadius: '14px', background: '#bc1888', border: 'none', color: 'white', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem', boxShadow: '0 4px 15px rgba(188, 24, 136, 0.25)' }}
                        >
                            {editStep < 3 ? 'Next Step' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="card" style={{
            padding: '0',
            overflow: 'hidden',
            border: 'none',
            position: 'relative',
            background: '#fffaff', // Light Neon Background
            boxShadow: '8px 8px 0px 0px rgba(188, 24, 136, 0.15)', // Sharp 2D Shadow
            borderRadius: '24px',
            transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}>
            {/* Header with Instagram Gradient */}
            <div style={{
                padding: '1.5rem',
                background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                color: 'white'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{
                            width: '56px', height: '56px', borderRadius: '50%',
                            background: 'white',
                            border: '3px solid rgba(255, 255, 255, 0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#dc2743', fontWeight: '800', fontSize: '1.4rem',
                            boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                        }}>
                            {parent.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'white', marginBottom: '0.1rem' }}>
                                {parent.name}
                            </h3>
                            <span style={{
                                fontSize: '0.75rem', color: 'white',
                                background: 'rgba(255, 255, 255, 0.2)', padding: '0.2rem 0.6rem',
                                borderRadius: '12px', fontWeight: '600',
                                backdropFilter: 'blur(4px)',
                                border: '1px solid rgba(255, 255, 255, 0.3)'
                            }}>
                                @{parent.username || 'parent'}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={() => setIsEditing(true)}
                            style={{
                                background: 'rgba(255, 255, 255, 0.2)', border: '1px solid rgba(255, 255, 255, 0.3)',
                                padding: '0.5rem', borderRadius: '12px', color: 'white', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.2s',
                                backdropFilter: 'blur(4px)'
                            }}
                            className="hover:scale-110"
                        >
                            <Edit size={16} />
                        </button>
                        <button
                            onClick={() => onDelete(parent.id)}
                            style={{
                                background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.3)',
                                padding: '0.5rem', borderRadius: '12px', color: 'white', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.2s',
                                backdropFilter: 'blur(4px)'
                            }}
                            className="hover:scale-110"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Body with Light Neon Background */}
            <div style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.6)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div style={{
                        fontSize: '0.7rem',
                        fontWeight: '900',
                        color: '#bc1888',
                        letterSpacing: '0.1em',
                        marginBottom: '0.25rem',
                        textTransform: 'uppercase'
                    }}>
                        Contact Information
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#1e293b', fontSize: '0.95rem', fontWeight: '500' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Phone size={16} color="#e11d48" />
                        </div>
                        <span>{parent.phone || 'N/A'}</span>
                    </div>
                    {parent.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#1e293b', fontSize: '0.95rem', fontWeight: '500' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Mail size={16} color="#7c3aed" />
                            </div>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parent.email}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#1e293b', fontSize: '0.95rem', fontWeight: '500' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ShieldCheck size={16} color="#16a34a" />
                        </div>
                        <span>Pass: <span style={{ fontFamily: 'monospace', color: '#bc1888', background: 'white', padding: '2px 8px', borderRadius: '6px', border: '1px solid #fdf2ff' }}>{parent.password}</span></span>
                    </div>
                </div>

                <div style={{ marginTop: '1.5rem', borderTop: '1px dashed #e2e8f0', paddingTop: '1rem' }}>
                    <div
                        onClick={() => setIsExpanded(!isExpanded)}
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer',
                            padding: '0.5rem 0.75rem',
                            background: '#f8fafc',
                            borderRadius: '12px',
                            border: '1px solid #f1f5f9'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Baby size={16} color="#f59e0b" />
                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#64748b' }}>Linked Children</span>
                        </div>
                        <ChevronRight
                            size={16}
                            color="#94a3b8"
                            style={{
                                transition: 'transform 0.3s',
                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
                            }}
                        />
                    </div>

                    {isExpanded && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem', paddingLeft: '0.5rem' }}>
                            {parent.linkedStudents && parent.linkedStudents.length > 0 ? (
                                parent.linkedStudents.map((child, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        padding: '0.4rem 0.8rem', background: 'white', borderRadius: '10px',
                                        border: '1px solid #f1f5f9', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}>
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#bc1888' }} />
                                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#1e293b' }}>
                                            {child.studentName}
                                        </span>
                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', background: '#f8fafc', padding: '1px 6px', borderRadius: '6px' }}>
                                            {child.className}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <span style={{ fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center', padding: '0.5rem' }}>No children linked</span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Action Bar */}
            <div style={{
                padding: '0.75rem 1.5rem',
                background: '#fffaff',
                borderTop: '1px solid #fdf2ff',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '0.75rem'
            }}>
                <button
                    onClick={() => setIsMessaging(true)}
                    style={{
                        padding: '0.5rem 1rem', borderRadius: '12px',
                        background: 'white', border: '2px solid #fdf2ff',
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        cursor: 'pointer', color: '#bc1888', fontWeight: '700',
                        fontSize: '0.85rem',
                        boxShadow: '0 2px 4px rgba(188, 24, 136, 0.05)'
                    }}
                >
                    <Mail size={16} />
                    Message
                </button>
            </div>
        </div>
    );
};

const Parents = () => {
    const [showAddParent, setShowAddParent] = useState(false);
    const [step, setStep] = useState(1);
    const [newParent, setNewParent] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        username: '',
        password: '',
        linkedStudents: [] // Array of { studentId, studentName, classId, className }
    });

    // For linking students
    const [selectedClassId, setSelectedClassId] = useState('');
    const [availableStudents, setAvailableStudents] = useState([]);
    const [selectedStudentId, setSelectedStudentId] = useState('');

    // Student Search Logic
    const [studentSearchTerm, setStudentSearchTerm] = useState('');
    const [showStudentList, setShowStudentList] = useState(false);

    // Derived: Filtered Students for Link Dropdown
    const filteredAvailableStudents = availableStudents.filter(s =>
        s.name.toLowerCase().includes(studentSearchTerm.toLowerCase()) ||
        (s.rollNo && s.rollNo.toString().includes(studentSearchTerm))
    );

    const handleSelectStudent = (student) => {
        setSelectedStudentId(student.id);
        setStudentSearchTerm(`${student.name} (${student.rollNo || 'N/A'})`);
        setShowStudentList(false);
    };

    const [parents, setParents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [schoolId, setSchoolId] = useState(null);
    const [dbClasses, setDbClasses] = useState([]);

    // Filter & Search State
    const [filterClassId, setFilterClassId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Derived State: Filtered Parents
    const filteredParents = parents.filter(parent => {
        // 1. Class Filter
        if (filterClassId) {
            const hasChildInClass = parent.linkedStudents?.some(s => s.classId === filterClassId);
            if (!hasChildInClass) return false;
        }

        // 2. Search Query (Name, Phone, Child Name, Child RollNo)
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const matchesParent =
                parent.name?.toLowerCase().includes(q) ||
                parent.phone?.includes(q) ||
                parent.username?.toLowerCase().includes(q);

            const matchesChild = parent.linkedStudents?.some(s =>
                s.studentName?.toLowerCase().includes(q) ||
                s.rollNo?.toString().includes(q)
            );

            return matchesParent || matchesChild;
        }

        return true;
    });

    // Initialize User & School ID with Robust Auth Check
    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    // 1. Try to get claims
                    const tokenResult = await user.getIdTokenResult();
                    const claims = tokenResult.claims;

                    if (claims.schoolId) {
                        setSchoolId(claims.schoolId);
                        // Heal localStorage if missing
                        localStorage.setItem('manual_session', JSON.stringify({
                            uid: user.uid,
                            schoolId: claims.schoolId,
                            role: claims.role,
                            email: user.email,
                            isManual: false
                        }));
                        return; // Success!
                    }
                } catch (e) {
                    console.error("Error fetching claims:", e);
                }
            }

            // 2. Fallback: Check localStorage if Auth didn't have claims or user is null (maybe manual bypass?)
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
        });

        return () => unsubscribe();
    }, []);

    // Fetch Parents & Classes
    useEffect(() => {
        if (!schoolId) return;

        // Fetch Classes for dropdown
        const fetchClasses = async () => {
            try {
                const q = query(collection(db, `schools/${schoolId}/classes`));
                const snapshot = await getDocs(q);
                const classesList = snapshot.docs.map(doc => ({
                    id: doc.id,
                    name: doc.data().name
                }));
                // Sort roughly
                classesList.sort((a, b) => a.name.localeCompare(b.name));
                setDbClasses(classesList);
            } catch (err) {
                console.error("Error fetching classes for dropdown", err);
            }
        };

        fetchClasses();

        // Listen for Parents
        const q = query(collection(db, `schools/${schoolId}/parents`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const parentsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setParents(parentsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching parents:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [schoolId]);

    // Fetch students when a class is selected
    useEffect(() => {
        if (!schoolId || !selectedClassId) {
            setAvailableStudents([]);
            return;
        }

        const fetchStudents = async () => {
            try {
                const q = query(collection(db, `schools/${schoolId}/classes/${selectedClassId}/students`));
                const snapshot = await getDocs(q);
                const studentsList = snapshot.docs.map(doc => ({
                    id: doc.id,
                    name: doc.data().name || `${doc.data().firstName} ${doc.data().lastName}`,
                    rollNo: doc.data().rollNo
                }));
                setAvailableStudents(studentsList);
            } catch (err) {
                console.error("Error fetching students:", err);
            }
        };
        fetchStudents();
    }, [schoolId, selectedClassId]);

    const handleAddStudentLink = () => {
        if (!selectedClassId || !selectedStudentId) return;

        const classObj = dbClasses.find(c => c.id === selectedClassId);
        const studentObj = availableStudents.find(s => s.id === selectedStudentId);

        if (classObj && studentObj) {
            // Check if already added
            const exists = newParent.linkedStudents.some(s => s.studentId === studentObj.id);
            if (!exists) {
                setNewParent(prev => ({
                    ...prev,
                    linkedStudents: [...prev.linkedStudents, {
                        studentId: studentObj.id,
                        studentName: studentObj.name,
                        classId: classObj.id,
                        className: classObj.name,
                        rollNo: studentObj.rollNo || '' // Save Roll No for search
                    }]
                }));
            }
        }
        // Reset selection
        setSelectedStudentId('');
    };

    const handleRemoveStudentLink = (studentId) => {
        setNewParent(prev => ({
            ...prev,
            linkedStudents: prev.linkedStudents.filter(s => s.studentId !== studentId)
        }));
    };

    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const handleUpdateParent = async (id, updatedData) => {
        try {
            const oldParent = parents.find(p => p.id === id);
            const parentRef = doc(db, `schools/${schoolId}/parents`, id);

            const oldLinks = oldParent?.linkedStudents || [];
            const newLinks = updatedData.linkedStudents || [];

            const unlinkedStudents = oldLinks.filter(oldLink => !newLinks.some(newLink => newLink.studentId === oldLink.studentId));
            const freshlyLinkedStudents = newLinks.filter(newLink => !oldLinks.some(oldLink => oldLink.studentId === newLink.studentId));

            const batch = writeBatch(db);

            // 1. Sync Parent Doc
            batch.update(parentRef, updatedData);

            const allClasses = dbClasses || [];

            const getPossibleRefs = (studentId) => {
                const refs = [doc(db, `schools/${schoolId}/students`, studentId)]; // master
                allClasses.forEach(cls => {
                    refs.push(doc(db, `schools/${schoolId}/classes/${cls.id}/students`, studentId));
                });
                return refs;
            };

            // 2. Remove access from unlinked students (sweeps all classes to clear ghosts)
            for (const child of unlinkedStudents) {
                if (child.studentId) {
                    const refs = getPossibleRefs(child.studentId);
                    const snaps = await Promise.all(refs.map(r => getDoc(r)));
                    snaps.forEach(snap => {
                        if (snap.exists()) {
                            batch.update(snap.ref, { "parentDetails.parentId": null });
                        }
                    });
                }
            }

            // 3. Grant access to newly linked students (finds true location safely)
            for (const child of freshlyLinkedStudents) {
                if (child.studentId) {
                    const refs = getPossibleRefs(child.studentId);
                    const snaps = await Promise.all(refs.map(r => getDoc(r)));
                    snaps.forEach(snap => {
                        if (snap.exists()) {
                            batch.update(snap.ref, { "parentDetails.parentId": id });
                        }
                    });
                }
            }

            await batch.commit();
        } catch (error) {
            console.error("Error updating parent:", error);
            alert("DB ERROR: " + error.message);
            throw error;
        }
    };

    const handleEditClick = (parent) => {
        // This is now legacy/unused for cards but kept for external triggers if any
        setNewParent({
            ...parent,
            password: parent.password || '', // Keep password visible for edit or empty
            linkedStudents: parent.linkedStudents || []
        });
        setEditingId(parent.id);
        setIsEditing(true);
        setStep(1);
        setShowAddParent(true);
    };

    const handleAddParent = async (e) => {
        e.preventDefault();

        // 1. Try State
        let activeSchoolId = schoolId;

        // 2. Try LocalStorage Fallback
        if (!activeSchoolId) {
            try {
                const session = localStorage.getItem('manual_session');
                if (session) {
                    const parsed = JSON.parse(session);
                    if (parsed.schoolId) {
                        activeSchoolId = parsed.schoolId;
                        console.log("Restored School ID from storage:", activeSchoolId);
                        setSchoolId(activeSchoolId); // Sync state back
                    }
                }
            } catch (err) {
                console.error("Storage parse error:", err);
            }
        }

        // 3. Final Check
        if (!activeSchoolId) {
            alert("Session Error: Could not find School ID in State or Storage. Please logout and login again.");
            return;
        }

        try {
            console.log("Submitting Parent Data:", newParent, "SchoolID:", activeSchoolId);
            if (isEditing) {
                const updateData = { ...newParent };
                // Optionally handle password logic if needed, but for now we update everything
                await handleUpdateParent(editingId, updateData);
            } else {
                // Use Cloud Function for Safe Creation (Auth + Firestore)
                // Use imported 'functions' instance
                const createSchoolUserFn = httpsCallable(functions, 'createSchoolUser');

                const result = await createSchoolUserFn({
                    email: newParent.email ? newParent.email.trim() : '',
                    password: newParent.password,
                    name: newParent.name.trim(),
                    role: 'parent',
                    schoolId: activeSchoolId, // Use the resolved ID
                    phone: newParent.phone.trim(),
                    address: newParent.address,
                    username: newParent.username.trim(),
                    occupation: newParent.occupation || '',
                    linkedStudents: newParent.linkedStudents
                });

                // Sync freshly linked students directly to their document subcollections
                if (newParent.linkedStudents && newParent.linkedStudents.length > 0 && result?.data?.uid) {
                    const batch = writeBatch(db);
                    for (const child of newParent.linkedStudents) {
                        if (child.studentId) {
                            const refs = getPossibleRefs(child.studentId);
                            const snaps = await Promise.all(refs.map(r => getDoc(r)));
                            snaps.forEach(snap => {
                                if (snap.exists()) {
                                    batch.update(snap.ref, { "parentDetails.parentId": result.data.uid });
                                }
                            });
                        }
                    }
                    await batch.commit();
                }
            }

            setShowAddParent(false);
            setNewParent({ name: '', email: '', phone: '', address: '', username: '', password: '', linkedStudents: [] });
            setStep(1);
            setIsEditing(false);
            setEditingId(null);
            setSelectedClassId('');
            setAvailableStudents([]);
            setSelectedStudentId('');
        } catch (error) {
            console.error("Error saving parent:", error);
            alert(`Failed to save parent: ${error.message || "Unknown error"}`);
        }
    };

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [parentToDelete, setParentToDelete] = useState(null);
    const [confirmPassword, setConfirmPassword] = useState('');
    const [deleteError, setDeleteError] = useState('');


    const handleDeleteClick = (id) => {
        setParentToDelete(id);
        setShowDeleteConfirm(true);
        setConfirmPassword('');
        setDeleteError('');
    };

    const handleSendMessage = async (parentId, text) => {
        if (!text.trim()) return;

        try {
            const notifRef = collection(db, `schools/${schoolId}/parents/${parentId}/notifications`);
            await addDoc(notifRef, {
                title: "Message from Principal",
                message: text.trim(),
                timestamp: new Date(),
                read: false,
                type: 'private_message',
                sender: 'Principal'
            });

            alert("Message sent successfully!");
        } catch (error) {
            console.error("Error sending message:", error);
            throw error;
        }
    };

    const confirmDelete = async (e) => {
        e.preventDefault();
        setDeleteError('');

        // Basic Manual Auth Check
        let isVerified = false;
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            try {
                const userData = JSON.parse(manualSession);
                const userDocRef = doc(db, `schools/${schoolId}/users`, userData.uid);
                const snapshot = await import('firebase/firestore').then(mod => mod.getDoc(userDocRef));
                if (snapshot.exists() && snapshot.data().manualPassword === confirmPassword) {
                    isVerified = true;
                }
            } catch (err) {
                console.error("Verification failed", err);
            }
        }

        if (isVerified) {
            try {
                // Call Cloud Function for Secure Full Delete (Auth + DB)
                const deleteUserFn = httpsCallable(functions, 'deleteSchoolUser');
                await deleteUserFn({
                    targetUid: parentToDelete,
                    role: 'parent',
                    schoolId: schoolId
                });

                setShowDeleteConfirm(false);
                setParentToDelete(null);
            } catch (error) {
                console.error("Error deleting parent:", error);
                setDeleteError(`Failed to delete: ${error.message}`);
            }
        } else {
            setDeleteError("Incorrect password.");
        }
    };

    // Display Login Required if School ID missing (Zombie state)
    if (!loading && !schoolId) {
        return (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#dc2626' }}>Session Expired</h2>
                <p>Please log out and log back in to access this page.</p>
                <button
                    onClick={() => {
                        localStorage.removeItem('manual_session');
                        window.location.href = '/login'; // Redirect to login to fix session
                    }}
                    style={{
                        marginTop: '1rem',
                        padding: '0.75rem 1.5rem',
                        background: 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                    }}
                >
                    Refresh Session
                </button>
            </div>
        );
    }

    return (
        <div className="animate-fade-in-up">
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '2rem'
            }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                        Parents & Guardians
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Manage parent accounts and student linkages</p>
                </div>
                <button
                    onClick={() => setShowAddParent(true)}
                    className="btn-primary"
                    style={{
                        padding: '0.75rem 1.5rem',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
                    }}
                >
                    <Plus size={20} />
                    <span>Add New Parent</span>
                </button>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                {[
                    {
                        label: 'Total Parents',
                        value: parents.length,
                        icon: Users,
                        bg: 'linear-gradient(135deg, #ffffff 0%, #f5f7ff 100%)',
                        border: '#e0e7ff',
                        iconBg: '#e0e7ff',
                        iconColor: '#4f46e5'
                    },
                    {
                        label: 'Linked Students',
                        value: parents.reduce((acc, p) => acc + (p.linkedStudents?.length || 0), 0),
                        icon: Baby,
                        bg: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
                        border: '#dcfce7',
                        iconBg: '#dcfce7',
                        iconColor: '#10b981'
                    },
                    {
                        label: 'App Users',
                        value: parents.filter(p => p.username && p.password).length,
                        icon: User,
                        bg: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)',
                        border: '#e0f2fe',
                        iconBg: '#e0f2fe',
                        iconColor: '#0ea5e9'
                    },
                ].map((stat, idx) => (
                    <div key={idx} className="card" style={{
                        padding: '1.25rem',
                        border: `1px solid ${stat.border}`,
                        background: stat.bg,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                        transition: 'all 0.3s ease'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{
                                padding: '0.5rem', borderRadius: '10px',
                                background: stat.iconBg, color: stat.iconColor,
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <stat.icon size={20} />
                            </div>
                            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                                {stat.label}
                            </span>
                        </div>
                        <span style={{
                            fontSize: '1.75rem',
                            fontWeight: '700',
                            color: 'var(--text-main)',
                            marginLeft: '0.25rem'
                        }}>
                            {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                        </span>
                    </div>
                ))}
            </div>

            {/* Search & Filter Toolbar */}
            <div style={{
                display: 'flex', gap: '1rem', marginBottom: '1.5rem',
                background: 'white', padding: '1rem', borderRadius: '12px',
                border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                flexWrap: 'wrap'
            }}>
                <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                    <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={20} />
                    <input
                        type="text"
                        placeholder="Search by Parent Name, Student Name, or Roll No..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%', padding: '0.75rem 1rem 0.75rem 3rem',
                            borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none',
                            fontSize: '0.95rem'
                        }}
                    />
                </div>

                <div style={{ minWidth: '200px', position: 'relative' }}>
                    <Filter style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={20} />
                    <select
                        value={filterClassId}
                        onChange={(e) => setFilterClassId(e.target.value)}
                        style={{
                            width: '100%', padding: '0.75rem 1rem 0.75rem 3rem',
                            borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none',
                            fontSize: '0.95rem', appearance: 'none', background: 'white'
                        }}
                    >
                        <option value="">All Classes</option>
                        {dbClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <ChevronRight
                        size={16}
                        color="#94a3b8"
                        style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%) rotate(90deg)', pointerEvents: 'none' }}
                    />
                </div>

                {(filterClassId || searchQuery) && (
                    <button
                        onClick={() => { setFilterClassId(''); setSearchQuery(''); }}
                        style={{
                            padding: '0 1rem', background: '#f1f5f9', border: 'none',
                            borderRadius: '8px', cursor: 'pointer', color: '#64748b',
                            fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}
                    >
                        <X size={16} /> Clear
                    </button>
                )}
            </div>

            {/* Parents Grid */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                    <Loader2 className="animate-spin" size={32} color="var(--primary)" />
                </div>
            ) : filteredParents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                    <Users size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p>No parents found matching your search.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                    {filteredParents.map((p) => (
                        <ParentCard
                            key={p.id}
                            parent={p}
                            onDelete={handleDeleteClick}
                            onUpdate={handleUpdateParent}
                            onSendMessage={handleSendMessage}
                            dbClasses={dbClasses}
                            schoolId={schoolId}
                        />
                    ))}
                </div>
            )}

            {/* Removed legacy Message Modal */}


            {/* Add Parent Modal */}
            {showAddParent && (
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setShowAddParent(false);
                            setStep(1);
                        }
                    }}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 1000,
                        background: 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(2px)',
                        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem',
                        paddingTop: '6rem',
                        cursor: 'pointer'
                    }}
                >
                    <div
                        className="card custom-scrollbar"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%', maxWidth: '600px', maxHeight: 'calc(100vh - 8rem)',
                            overflowY: 'auto', padding: '2rem', animation: 'slideUp 0.3s ease-out',
                            position: 'relative', background: 'white', borderRadius: '24px',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            cursor: 'default'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                {step === 2 && (
                                    <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                                        <MoreVertical size={24} color="var(--text-secondary)" style={{ transform: 'rotate(90deg)' }} />
                                    </button>
                                )}
                                <h2 style={{ fontSize: '1.5rem', fontWeight: '700' }}>
                                    {isEditing ? (step === 1 ? 'Edit Parent' : 'Update & Link') : (step === 1 ? 'Add New Parent' : 'Account & Links')}
                                </h2>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                {step === 1 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!newParent.name || !newParent.phone || !newParent.address) {
                                                alert("Please fill in all required fields (Name, Phone, Address)");
                                                return;
                                            }
                                            setStep(2);
                                        }}
                                        style={{
                                            background: 'var(--primary)', border: 'none',
                                            width: '40px', height: '40px', borderRadius: '50%',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
                                        }}
                                    >
                                        <ChevronRight size={24} color="white" />
                                    </button>
                                )}
                                <button type="button" onClick={() => { setShowAddParent(false); setStep(1); setIsEditing(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                    <X size={24} color="var(--text-secondary)" />
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleAddParent}>
                            {step === 1 ? (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                Parent Name
                                            </label>
                                            <input
                                                type="text" placeholder="e.g. John Doe"
                                                value={newParent.name}
                                                onChange={(e) => setNewParent({ ...newParent, name: e.target.value })}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                Mobile Number
                                            </label>
                                            <input
                                                type="tel" placeholder="0300 1234567"
                                                value={newParent.phone}
                                                onChange={(e) => setNewParent({ ...newParent, phone: e.target.value })}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                            Occupation
                                        </label>
                                        <input
                                            type="text" placeholder="e.g. Engineer, Business Owner"
                                            value={newParent.occupation || ''}
                                            onChange={(e) => setNewParent({ ...newParent, occupation: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                        />
                                    </div>

                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                            Email Address (Optional)
                                        </label>
                                        <input
                                            type="email" placeholder="parent@example.com"
                                            value={newParent.email}
                                            onChange={(e) => setNewParent({ ...newParent, email: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                        />
                                    </div>

                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                            Residential Address
                                        </label>
                                        <textarea
                                            placeholder="Enter full address"
                                            rows="2"
                                            value={newParent.address}
                                            onChange={(e) => setNewParent({ ...newParent, address: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', resize: 'none' }}
                                            required
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="animate-fade-in-up">
                                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                                        <div style={{
                                            width: '60px', height: '60px', background: '#e0e7ff', borderRadius: '50%',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem',
                                            color: '#4f46e5'
                                        }}>
                                            <ShieldCheck size={32} />
                                        </div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-main)' }}>Account & Student Linking</h3>
                                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                            Create login and link children profiles
                                        </p>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                Username
                                            </label>
                                            <input
                                                type="text" placeholder="e.g. johndoe123"
                                                value={newParent.username}
                                                onChange={(e) => setNewParent({ ...newParent, username: e.target.value })}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                Password
                                            </label>
                                            <input
                                                type="text" placeholder="Set password"
                                                value={newParent.password}
                                                onChange={(e) => setNewParent({ ...newParent, password: e.target.value })}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Link Students Section */}
                                    <div style={{ marginBottom: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px' }}>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '800', marginBottom: '1rem', color: 'var(--text-main)' }}>
                                            Link Children
                                        </label>

                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'flex-start' }}>
                                            <select
                                                value={selectedClassId}
                                                onChange={(e) => {
                                                    setSelectedClassId(e.target.value);
                                                    setSelectedStudentId('');
                                                    setStudentSearchTerm('');
                                                }}
                                                style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white' }}
                                            >
                                                <option value="">Select Class</option>
                                                {dbClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>

                                            <div style={{ flex: 1, position: 'relative' }}>
                                                <input
                                                    type="text"
                                                    placeholder={selectedClassId ? "Search Name or Roll No..." : "Select Class First"}
                                                    value={studentSearchTerm}
                                                    onChange={(e) => {
                                                        setStudentSearchTerm(e.target.value);
                                                        setShowStudentList(true);
                                                        setSelectedStudentId(''); // Reset selection on type
                                                    }}
                                                    onFocus={() => setShowStudentList(true)}
                                                    disabled={!selectedClassId}
                                                    style={{
                                                        width: '100%', padding: '0.75rem', borderRadius: '8px',
                                                        border: '1px solid #e2e8f0', outline: 'none', background: !selectedClassId ? '#f1f5f9' : 'white'
                                                    }}
                                                />

                                                {/* Start: Dropdown Results List */}
                                                {showStudentList && selectedClassId && (
                                                    <div style={{
                                                        position: 'absolute', top: '100%', left: 0, right: 0,
                                                        background: 'white', border: '1px solid #e2e8f0',
                                                        borderRadius: '8px', marginTop: '4px', maxHeight: '200px',
                                                        overflowY: 'auto', zIndex: 10, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                                                    }}>
                                                        {filteredAvailableStudents.length > 0 ? (
                                                            filteredAvailableStudents.map(s => (
                                                                <div
                                                                    key={s.id}
                                                                    onClick={() => handleSelectStudent(s)}
                                                                    style={{
                                                                        padding: '0.75rem', cursor: 'pointer',
                                                                        borderBottom: '1px solid #f1f5f9',
                                                                        fontSize: '0.9rem', color: 'var(--text-main)',
                                                                        background: 'white', transition: 'background 0.2s'
                                                                    }}
                                                                    onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                                                                    onMouseLeave={(e) => e.target.style.background = 'white'}
                                                                >
                                                                    <span style={{ fontWeight: '600' }}>{s.name}</span>
                                                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8em', marginLeft: '0.5rem' }}>
                                                                        (Roll: {s.rollNo || 'N/A'})
                                                                    </span>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                                                No matches found
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {/* End: Dropdown Results List */}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleAddStudentLink();
                                                    setStudentSearchTerm(''); // Clear after add
                                                    setSelectedStudentId('');
                                                }}
                                                disabled={!selectedStudentId}
                                                style={{
                                                    padding: '0.75rem', borderRadius: '8px',
                                                    background: selectedStudentId ? 'var(--primary)' : '#cbd5e1',
                                                    color: 'white', border: 'none', cursor: selectedStudentId ? 'pointer' : 'not-allowed',
                                                    transition: 'all 0.3s ease', display: 'flex', alignItems: 'center'
                                                }}
                                            >
                                                <Plus size={20} />
                                            </button>
                                        </div>

                                        {/* Linked Students List */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {newParent.linkedStudents.map((child, idx) => (
                                                <div key={idx} style={{
                                                    background: 'white', padding: '0.4rem 0.8rem', borderRadius: '20px',
                                                    border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                    fontSize: '0.85rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                }}>
                                                    <span style={{ fontWeight: '600', color: 'var(--primary)' }}>{child.studentName}</span>
                                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75em' }}>{child.className}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveStudentLink(child.studentId)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#ef4444' }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                            {newParent.linkedStudents.length === 0 && (
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                                    No children linked yet.
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                        <button
                                            type="button"
                                            onClick={() => setStep(1)}
                                            style={{
                                                padding: '0.75rem 1.5rem', borderRadius: '8px',
                                                background: 'transparent', border: '1px solid #e2e8f0',
                                                cursor: 'pointer', fontWeight: '600', color: 'var(--text-secondary)'
                                            }}
                                        >
                                            Back
                                        </button>
                                        <button
                                            type="submit"
                                            className="btn-primary"
                                            style={{
                                                padding: '0.75rem 2rem', borderRadius: '8px',
                                                cursor: 'pointer', fontWeight: '600',
                                                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
                                            }}
                                        >
                                            {isEditing ? 'Save Changes' : 'Create Parent Account'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </form>
                    </div >
                </div >
            )}

            {/* Delete Confirmation Modal */}
            {
                showDeleteConfirm && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', zIndex: 1100,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backdropFilter: 'blur(4px)'
                    }}>
                        <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '2rem', animation: 'slideUp 0.3s ease-out' }}>
                            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                                <div style={{
                                    width: '60px', height: '60px', background: '#fef2f2', borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem',
                                    color: '#ef4444'
                                }}>
                                    <Trash2 size={32} />
                                </div>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-main)' }}>Confirm Removal</h2>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                    Are you sure you want to remove this parent account? This action cannot be undone.
                                </p>
                            </div>

                            <form onSubmit={confirmDelete}>
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                        Enter Password to Confirm
                                    </label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Your Password"
                                        style={{
                                            width: '100%', padding: '0.75rem', borderRadius: '8px',
                                            border: deleteError ? '1px solid #ef4444' : '1px solid #e2e8f0',
                                            outline: 'none', fontSize: '0.95rem'
                                        }}
                                        autoFocus
                                        required
                                    />
                                    {deleteError && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.5rem' }}>{deleteError}</p>}
                                </div>

                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button
                                        type="button"
                                        onClick={() => { setShowDeleteConfirm(false); setConfirmPassword(''); }}
                                        style={{
                                            flex: 1, padding: '0.75rem', borderRadius: '8px',
                                            background: 'transparent', border: '1px solid #e2e8f0',
                                            cursor: 'pointer', fontWeight: '600', color: 'var(--text-secondary)'
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        style={{
                                            flex: 1, padding: '0.75rem', borderRadius: '8px',
                                            background: '#ef4444', border: 'none',
                                            cursor: 'pointer', fontWeight: '600', color: 'white'
                                        }}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Parents;
