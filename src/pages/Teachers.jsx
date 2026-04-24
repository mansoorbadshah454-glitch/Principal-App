
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, X, Search, Filter, BookOpen, Users, User, Phone, Mail, Trash2, Loader2, Star, MoreVertical, ChevronRight, ChevronLeft, Edit, ShieldCheck, Calendar, DownloadCloud, Scan, QrCode } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as QRCodeLib from 'qrcode';
import { db, functions, auth } from '../firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, where, getDocs, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { getDocsFast } from '../utils/cacheUtils';
import { httpsCallable } from 'firebase/functions';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

// Internal Component for individual Teacher Card logic
const TeacherCard = ({ teacher, onDelete, onUpdate, schoolId, dbClasses, isHighlighted, todayStr }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editStep, setEditStep] = useState(1);
    const [isSaving, setIsSaving] = useState(false);
    const [isPressed, setIsPressed] = useState(false);
    const [editedTeacher, setEditedTeacher] = useState({
        ...teacher,
        salary: teacher.salary || '',
        subjects: Array.isArray(teacher.displaySubjects) ? teacher.displaySubjects : (Array.isArray(teacher.subjects) ? teacher.subjects : (teacher.subject ? [teacher.subject] : [])),
        assignedClasses: Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : (teacher.assignedClass ? [teacher.assignedClass] : [])
    });

    const cardRef = useRef(null);

    const purpleHeader = '#5b21b6'; // Darker purple
    const purpleBody = '#ede9fe';   // Light purple
    const purpleAccent = '#8b5cf6'; // Main purple
    const subjectOptions = [
        'English', 'Urdu', 'Mathematics', 'Islamiyat', 'QURAN',
        'Social Study', 'Art', 'Science', 'Biology', 'Chemistry', 'Physic'
    ];

    // Click outside logic
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (cardRef.current && !cardRef.current.contains(event.target)) {
                setIsEditing(false);
                setEditStep(1);
                setEditedTeacher({
                    ...teacher,
                    salary: teacher.salary || '',
                    subjects: Array.isArray(teacher.displaySubjects) ? teacher.displaySubjects : (Array.isArray(teacher.subjects) ? teacher.subjects : (teacher.subject ? [teacher.subject] : [])),
                    assignedClasses: Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : (teacher.assignedClass ? [teacher.assignedClass] : [])
                });
            }
        };

        if (isEditing) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isEditing, teacher]);

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        setIsSaving(true);
        try {
            await onUpdate(teacher.id, editedTeacher);
            setIsEditing(false);
            setEditStep(1);
            alert("Teacher updated successfully!");
        } catch (error) {
            console.error("Error updating teacher:", error);
            alert("Failed to update teacher.");
        } finally {
            setIsSaving(false);
        }
    };

    if (isEditing) {
        return (
            <div ref={cardRef} className="card animate-scale-in" style={{
                padding: '0',
                overflow: 'hidden',
                border: `2px solid ${purpleAccent}`,
                position: 'relative',
                background: purpleBody,
                boxShadow: '0 10px 25px -5px rgba(139, 92, 246, 0.3)',
                borderRadius: '16px',
                zIndex: 50
            }}>
                <div style={{
                    padding: '1.2rem 1.5rem',
                    background: purpleHeader,
                    color: 'white'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {editStep > 1 && (
                                <button
                                    onClick={() => setEditStep(prev => prev - 1)}
                                    style={{ background: 'rgba(255, 255, 255, 0.2)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}
                                >
                                    <ChevronLeft size={18} />
                                </button>
                            )}
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>
                                {editStep === 1 ? 'Teacher Info' : 'Update Credentials'}
                            </h3>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '700', padding: '0.2rem 0.5rem', background: 'rgba(255, 255, 255, 0.2)', borderRadius: '10px' }}>
                                {editStep}/2
                            </span>
                            <button onClick={() => setIsEditing(false)} style={{ background: 'rgba(255, 255, 255, 0.2)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}>
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                <div style={{
                    padding: '1.5rem',
                    maxHeight: '450px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.25rem'
                }} className="custom-scrollbar">
                    {editStep === 1 && (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: purpleHeader, display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Full Name</label>
                                    <input
                                        type="text"
                                        value={editedTeacher.name}
                                        onChange={(e) => setEditedTeacher({ ...editedTeacher, name: e.target.value })}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', border: '1px solid #ddd6fe', outline: 'none', fontSize: '0.9rem', background: 'white' }}
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: purpleHeader, display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Phone</label>
                                    <input
                                        type="tel"
                                        value={editedTeacher.phone}
                                        onChange={(e) => setEditedTeacher({ ...editedTeacher, phone: e.target.value })}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', border: '1px solid #ddd6fe', outline: 'none', fontSize: '0.9rem', background: 'white' }}
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: purpleHeader, display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Subjects</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', background: 'white', padding: '0.75rem', borderRadius: '12px', border: '1px solid #ddd6fe' }}>
                                    {subjectOptions.map((subj) => {
                                        const isSelected = editedTeacher.subjects.includes(subj);
                                        return (
                                            <div
                                                key={subj}
                                                onClick={() => {
                                                    setEditedTeacher(prev => ({
                                                        ...prev,
                                                        subjects: isSelected
                                                            ? prev.subjects.filter(s => s !== subj)
                                                            : [...prev.subjects, subj]
                                                    }));
                                                }}
                                                style={{
                                                    padding: '0.3rem 0.6rem',
                                                    borderRadius: '6px',
                                                    border: isSelected ? `1px solid ${purpleAccent}` : '1px solid #e2e8f0',
                                                    background: isSelected ? '#f5f3ff' : 'white',
                                                    cursor: 'pointer',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '600',
                                                    color: isSelected ? purpleAccent : '#64748b'
                                                }}
                                            >
                                                {subj}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: purpleHeader, display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Assign Classes</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', background: 'white', padding: '0.75rem', borderRadius: '12px', border: '1px solid #ddd6fe' }}>
                                    {dbClasses.map((clsName) => {
                                        const isSelected = editedTeacher.assignedClasses.includes(clsName);
                                        return (
                                            <div
                                                key={clsName}
                                                onClick={() => {
                                                    setEditedTeacher(prev => ({
                                                        ...prev,
                                                        assignedClasses: isSelected ? [] : [clsName]
                                                    }));
                                                }}
                                                style={{
                                                    padding: '0.3rem 0.6rem',
                                                    borderRadius: '6px',
                                                    border: isSelected ? `1px solid ${purpleAccent}` : '1px solid #e2e8f0',
                                                    background: isSelected ? '#f5f3ff' : 'white',
                                                    cursor: 'pointer',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '600',
                                                    color: isSelected ? purpleAccent : '#64748b'
                                                }}
                                            >
                                                {clsName}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: purpleHeader, display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Email</label>
                                    <input
                                        type="email"
                                        value={editedTeacher.email || ''}
                                        onChange={(e) => setEditedTeacher({ ...editedTeacher, email: e.target.value })}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', border: '1px solid #ddd6fe', outline: 'none', fontSize: '0.9rem', background: 'white' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: purpleHeader, display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Monthly Salary</label>
                                    <input
                                        type="number"
                                        value={editedTeacher.salary || ''}
                                        onChange={(e) => setEditedTeacher({ ...editedTeacher, salary: e.target.value })}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', border: '1px solid #ddd6fe', outline: 'none', fontSize: '0.9rem', background: 'white' }}
                                        placeholder="e.g. 50000"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {editStep === 2 && (
                        <>
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '16px', border: '1px solid #ddd6fe' }}>
                                <div style={{ marginBottom: '1.25rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: purpleHeader, display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Username</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#f5f3ff', padding: '0.5rem 0.75rem', borderRadius: '10px' }}>
                                        <User size={16} color={purpleAccent} />
                                        <input
                                            type="text"
                                            value={editedTeacher.username || ''}
                                            onChange={(e) => setEditedTeacher({ ...editedTeacher, username: e.target.value })}
                                            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.95rem', fontWeight: '600', width: '100%' }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: purpleHeader, display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Password</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#f5f3ff', padding: '0.5rem 0.75rem', borderRadius: '10px' }}>
                                        <ShieldCheck size={16} color={purpleAccent} />
                                        <input
                                            type="text"
                                            placeholder="Leave empty to keep same"
                                            value={editedTeacher.password || ''}
                                            onChange={(e) => setEditedTeacher({ ...editedTeacher, password: e.target.value })}
                                            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.95rem', fontWeight: '600', width: '100%' }}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div style={{ padding: '0.5rem', background: '#fff7ed', borderRadius: '12px', border: '1px dashed #fdba74', color: '#9a3412', fontSize: '0.8rem', fontWeight: '500' }}>
                                <p>Updating credentials will take effect immediately. Password is only updated if you type a new one.</p>
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
                                }
                            }}
                            style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', background: 'white', border: `1px solid ${purpleAccent}`, color: purpleAccent, fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem' }}
                        >
                            {editStep === 1 ? 'Cancel' : 'Back'}
                        </button>
                        <button
                            type="button"
                            onMouseDown={() => setIsPressed(true)}
                            onMouseUp={() => setIsPressed(false)}
                            onMouseLeave={() => setIsPressed(false)}
                            onClick={() => {
                                if (editStep < 2) {
                                    setEditStep(prev => prev + 1);
                                } else {
                                    handleSave();
                                }
                            }}
                            disabled={isSaving}
                            style={{ 
                                flex: 1.5, 
                                padding: '0.8rem', 
                                borderRadius: '12px', 
                                background: purpleAccent, 
                                border: 'none', 
                                color: 'white', 
                                fontWeight: '700', 
                                cursor: isSaving ? 'not-allowed' : 'pointer', 
                                fontSize: '0.9rem', 
                                boxShadow: `0 4px 12px rgba(139, 92, 246, 0.2)`,
                                transform: (isPressed && !isSaving) ? 'scale(0.95)' : 'scale(1)',
                                transition: 'transform 0.1s ease',
                                opacity: isSaving ? 0.7 : 1,
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="animate-spin" size={16} />
                                    Saving...
                                </>
                            ) : (
                                editStep < 2 ? 'Next Step' : 'Save Changes'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            id={`teacher-${teacher.id}`}
            className="card"
            style={{
                padding: '0',
                overflow: 'hidden',
                border: isHighlighted ? `2px solid ${purpleAccent}` : '1px solid #d8b4fe',
                position: 'relative',
                background: purpleBody,
                boxShadow: isHighlighted ? `0 0 0 4px rgba(139, 92, 246, 0.2)` : '0 4px 6px -1px rgba(139, 92, 246, 0.1), 0 2px 4px -1px rgba(139, 92, 246, 0.06)',
                borderRadius: '16px',
                transition: 'all 0.3s ease',
                transform: isHighlighted ? 'scale(1.02)' : 'scale(1)',
                zIndex: isHighlighted ? 10 : 1
            }}>
            {/* Header: Darker Purple */}
            <div style={{ padding: '1.5rem', background: purpleHeader, color: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{
                            width: '50px', height: '50px', borderRadius: '50%',
                            background: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: purpleHeader, fontWeight: '700', fontSize: '1.2rem'
                        }}>
                            {teacher.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'white', marginBottom: '0.2rem' }}>
                                {teacher.name}
                            </h3>
                            <span style={{
                                fontSize: '0.8rem', color: 'white',
                                background: 'rgba(255, 255, 255, 0.2)', padding: '0.2rem 0.6rem',
                                borderRadius: '12px', fontWeight: '600'
                            }}>
                                {teacher.subject || 'Teacher'}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={() => setIsEditing(true)}
                            style={{
                                background: 'rgba(255, 255, 255, 0.1)', border: 'none', padding: '0.5rem',
                                borderRadius: '8px', color: 'white', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >
                            <Edit size={16} />
                        </button>
                        <button
                            onClick={() => onDelete(teacher.id)}
                            style={{
                                background: 'rgba(239, 68, 68, 0.2)', border: 'none', padding: '0.5rem',
                                borderRadius: '8px', color: '#fecaca', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Body: Light Purple */}
            <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#5b21b6', fontSize: '0.9rem' }}>
                        <BookOpen size={16} color="#7c3aed" />
                        <span>Subjects: <strong style={{ color: '#4c1d95' }}>
                            {teacher.displaySubjects 
                                ? (Array.isArray(teacher.displaySubjects) ? teacher.displaySubjects.join(', ') : teacher.displaySubjects)
                                : (Array.isArray(teacher.subjects) ? teacher.subjects.join(', ') : teacher.subjects || teacher.subject || 'None')}
                        </strong></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#5b21b6', fontSize: '0.9rem' }}>
                        <Phone size={16} color="#7c3aed" />
                        <span>{teacher.phone || 'N/A'}</span>
                    </div>
                    {teacher.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#5b21b6', fontSize: '0.9rem' }}>
                            <Mail size={16} color="#7c3aed" />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teacher.email}</span>
                        </div>
                    )}
                    {teacher.salary && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#5b21b6', fontSize: '0.9rem' }}>
                            <span style={{ fontWeight: '800', color: '#7c3aed', width: '16px', textAlign: 'center' }}>Rs</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '600' }}>{Number(teacher.salary).toLocaleString()} / month</span>
                        </div>
                    )}
                </div>

                <div style={{
                    marginTop: '1.5rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid rgba(139, 92, 246, 0.1)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '80%' }}>
                        <span style={{ fontSize: '0.75rem', color: '#7c3aed', marginBottom: '0.2rem' }}>Assigned Classes</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#4c1d95', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {Array.isArray(teacher.assignedClasses)
                                ? teacher.assignedClasses.join(', ')
                                : teacher.assignedClasses || teacher.assignedClass || 'None'}
                        </span>
                    </div>
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        background: 'white', border: '1px solid #ddd6fe',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Star size={16} color="#f59e0b" fill="#f59e0b" />
                    </div>
                </div>
            </div>
        </div>
    );
};

const Teachers = () => {
    const getTodayStr = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const todayStr = getTodayStr();

    const [activeTab, setActiveTab] = useState('list');

    // Syllabus States
    const [selectedSyllabusClass, setSelectedSyllabusClass] = useState('');
    const [selectedSyllabusSubject, setSelectedSyllabusSubject] = useState('');
    const [syllabusChapters, setSyllabusChapters] = useState([]);
    const [newChapterTitle, setNewChapterTitle] = useState('');
    const [newChapterTime, setNewChapterTime] = useState('');
    const [loadingSyllabus, setLoadingSyllabus] = useState(false);

    const [selectedAttendanceTeacher, setSelectedAttendanceTeacher] = useState(null);
    const [attendanceMonth, setAttendanceMonth] = useState(new Date().getMonth());
    const [attendanceYear, setAttendanceYear] = useState(new Date().getFullYear());
    const [expandedHalfDayCell, setExpandedHalfDayCell] = useState(null);

    const [timeTableCols, setTimeTableCols] = useState(['08:00', '09:00', '10:00']);
    const [timeTableRows, setTimeTableRows] = useState([
        { id: Date.now().toString(), teacherId: '', cells: [{ class: '', subject: '' }, { class: '', subject: '' }, { class: '', subject: '' }] }
    ]);
    const [isPublishingTimeTable, setIsPublishingTimeTable] = useState(false);
    const [publishType, setPublishType] = useState('standard');

    const handleAddTimeCol = () => {
        setTimeTableCols([...timeTableCols, '']);
        setTimeTableRows(timeTableRows.map(row => ({
            ...row,
            cells: [...row.cells, { class: '', subject: '' }]
        })));
    };

    const handleRemoveTimeCol = (index) => {
        if (timeTableCols.length <= 1) return;
        const newCols = [...timeTableCols];
        newCols.splice(index, 1);
        setTimeTableCols(newCols);
        
        setTimeTableRows(timeTableRows.map(row => {
            const newCells = [...row.cells];
            newCells.splice(index, 1);
            return { ...row, cells: newCells };
        }));
    };

    const handleAddTimeRow = () => {
        setTimeTableRows([
            ...timeTableRows,
            { id: Date.now().toString(), teacherId: '', cells: timeTableCols.map(() => ({ class: '', subject: '' })) }
        ]);
    };

    const handleUpdateBreakTime = async (type, val) => {
        if (!schoolId) return;
        try {
            if (type === 'start') setGlobalBreakStartTime(val);
            if (type === 'end') setGlobalBreakEndTime(val);
            
            await updateDoc(doc(db, `schools/${schoolId}/settings`, 'profile'), {
                [type === 'start' ? 'breakStartTime' : 'breakEndTime']: val
            });
        } catch (e) {
            console.error("Failed to update break time globally", e);
        }
    };

    const handleTimeTableTimeChange = (colIndex, newTime) => {
        const newCols = [...timeTableCols];
        newCols[colIndex] = newTime;
        setTimeTableCols(newCols);
    };

    const handleTimeTableTeacherChange = (rowIndex, teacherId) => {
        const newRows = [...timeTableRows];
        newRows[rowIndex].teacherId = teacherId;
        setTimeTableRows(newRows);
    };

    const handleTimeTableCellChange = (rowIndex, colIndex, field, value) => {
        const newRows = [...timeTableRows];
        newRows[rowIndex].cells[colIndex][field] = value;
        setTimeTableRows(newRows);
    };

    const [showAddTeacher, setShowAddTeacher] = useState(false);
    const [step, setStep] = useState(1);
    const [newTeacher, setNewTeacher] = useState({
        name: '',
        email: '',
        phone: '',
        salary: '',
        subjects: [],
        address: '',
        assignedClasses: [],
        username: '',
        password: ''
    });
    const [teachers, setTeachers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [schoolId, setSchoolId] = useState(null);
    const [schoolName, setSchoolName] = useState('School Name');
    const [dbClasses, setDbClasses] = useState([]);
    const [dbClassesData, setDbClassesData] = useState([]);
    const [globalBreakStartTime, setGlobalBreakStartTime] = useState('10:30');
    const [globalBreakEndTime, setGlobalBreakEndTime] = useState('11:00');

    useEffect(() => {
        if (!schoolId) return;
        const fetchMasterTimetable = async () => {
            try {
                const docRef = doc(db, 'schools', schoolId, 'timetables', 'weeklyMaster');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.cols && data.cols.length > 0) setTimeTableCols(data.cols);
                    if (data.rows && data.rows.length > 0) setTimeTableRows(data.rows);
                }
            } catch (err) {
                console.error("Failed to fetch timetable:", err);
            }
        };
        fetchMasterTimetable();
    }, [schoolId]);

    const handleSaveTimeTable = async () => {
        if (!schoolId) return;
        setIsPublishingTimeTable(true);
        try {
            const enforcedRows = timeTableRows.map(row => ({
                ...row,
                cells: row.cells.map((cell, colIndex) => {
                    const isGlobalBreak = timeTableCols[colIndex] === globalBreakStartTime;
                    return {
                        class: isGlobalBreak ? 'BREAK' : cell.class,
                        subject: isGlobalBreak ? '' : cell.subject
                    };
                })
            }));

            const publishTimetable = httpsCallable(functions, 'publishTimetable');
            const result = await publishTimetable({
                schoolId: schoolId,
                cols: timeTableCols,
                rows: enforcedRows,
                notificationType: publishType
            });
            alert(result.data.message || 'Timetable published successfully!');
        } catch (error) {
            console.error("Publish failed:", error);
            alert("Failed to publish timetable: " + error.message);
        } finally {
            setIsPublishingTimeTable(false);
        }
    };

    const subjectOptions = [
        'English', 'Urdu', 'Mathematics', 'Islamiyat', 'QURAN',
        'Social Study', 'Art', 'Science', 'Biology', 'Chemistry', 'Physic'
    ];

    // Helper function to check if it's a new day (same as Teacher App)
    const isNewDay = (lastUpdateTimestamp) => {
        if (!lastUpdateTimestamp) return false;
        const lastUpdate = lastUpdateTimestamp.toDate ? lastUpdateTimestamp.toDate() : new Date(lastUpdateTimestamp);
        const now = new Date();
        const lastDate = new Date(lastUpdate.getFullYear(), lastUpdate.getMonth(), lastUpdate.getDate());
        const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return currentDate > lastDate;
    };

    // --- REAL ATTENDANCE DATA LOGIC ---
    const [teacherLogs, setTeacherLogs] = useState({});
    
    useEffect(() => {
        if (!selectedAttendanceTeacher || !schoolId) {
            setTeacherLogs({});
            return;
        }

        const startDate = `${attendanceYear}-${String(attendanceMonth + 1).padStart(2, '0')}-01`;
        const endDate = `${attendanceYear}-${String(attendanceMonth + 1).padStart(2, '0')}-31`;

        const q = query(
            collection(db, 'schools', schoolId, 'teachers', selectedAttendanceTeacher.id, 'attendance_logs'),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const logsMap = {};
            snapshot.forEach((doc) => {
                logsMap[doc.id] = doc.data();
            });
            setTeacherLogs(logsMap);
        }, (error) => {
            console.error('Error fetching teacher attendance logs:', error);
        });

        return () => unsubscribe();
    }, [schoolId, selectedAttendanceTeacher, attendanceMonth, attendanceYear]);

    const handleDownloadReport = (teacher) => {
        const doc = new jsPDF();
        const monthName = new Date(attendanceYear, attendanceMonth).toLocaleString('default', { month: 'long' });
        
        // Header
        doc.setFontSize(22);
        doc.setTextColor('#5b21b6');
        doc.text(schoolName, 14, 22);
        
        doc.setFontSize(14);
        doc.setTextColor('#1e293b');
        doc.text(`Monthly Attendance Report - ${monthName} ${attendanceYear}`, 14, 34);
        
        doc.setFontSize(11);
        doc.setTextColor('#475569');
        doc.text(`Teacher: ${teacher.name}`, 14, 44);
        doc.text(`Subject/Class: ${teacher.subject || (teacher.subjects && teacher.subjects[0]) || 'N/A'}`, 14, 52);

        // Generate data for table
        const daysInMonth = new Date(attendanceYear, attendanceMonth + 1, 0).getDate();
        
        let presentCount = 0;
        let absentCount = 0;
        let halfCount = 0;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tableBody = [];
        for(let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${attendanceYear}-${String(attendanceMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dateObj = new Date(attendanceYear, attendanceMonth, i);
            
            let status = teacherLogs[dateStr]?.status;
            
            if (!status) {
                if (dateObj >= today) status = 'Upcoming';
                else if (dateObj.getDay() === 0) status = 'Holiday';
                else status = 'Blank';
            }

            if(status === 'Present') presentCount++;
            else if(status === 'Absent') absentCount++;
            else if(status === 'Half Day') halfCount++;

            const dayOfWeek = dateObj.toLocaleString('default', { weekday: 'short' });

            tableBody.push([dateStr, dayOfWeek, status]);
        }

        // Summary
        doc.setFontSize(11);
        doc.setTextColor('#10b981'); // Green
        doc.text(`Total Present: ${presentCount}`, 14, 64);
        doc.setTextColor('#ef4444'); // Red
        doc.text(`Total Absent: ${absentCount}`, 60, 64);
        doc.setTextColor('#f59e0b'); // Yellow/Orange
        doc.text(`Total Half Leaves: ${halfCount}`, 106, 64);

        // Table
        autoTable(doc, {
            startY: 72,
            head: [['Date', 'Day', 'Status']],
            body: tableBody,
            headStyles: { fillColor: '#8b5cf6', textColor: '#ffffff', fontStyle: 'bold' },
            styles: { fontSize: 10, cellPadding: 4 },
            alternateRowStyles: { fillColor: '#f8fafc' },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 2) {
                    const status = data.cell.raw;
                    if (status === 'Present') { data.cell.styles.textColor = '#10b981'; data.cell.styles.fontStyle = 'bold'; }
                    else if (status === 'Absent') { data.cell.styles.textColor = '#ef4444'; data.cell.styles.fontStyle = 'bold'; }
                    else if (status === 'Half Day') { data.cell.styles.textColor = '#f59e0b'; data.cell.styles.fontStyle = 'bold'; }
                    else if (status === 'Holiday') { data.cell.styles.textColor = '#3b82f6'; data.cell.styles.fontStyle = 'bold'; }
                    else if (status === 'Upcoming') { data.cell.styles.textColor = '#94a3b8'; data.cell.styles.fontStyle = 'bold'; }
                }
            }
        });

        doc.save(`${teacher.name.replace(/\s+/g, '_')}_Attendance_${monthName}_${attendanceYear}.pdf`);
    };

    const [isGeneratingBarcode, setIsGeneratingBarcode] = useState(false);

    const handleGenerateBarcodePDF = async () => {
        if (!schoolId) {
            alert("School ID is missing. Please reload the page.");
            return;
        }

        setIsGeneratingBarcode(true);
        try {
            const uniqueId = `checkin_${schoolId}_${Date.now()}`;
            
            // 1. Save this new unique ID to the school's settings to invalidate old codes
            // The mobile app will check this field to verify the scanned code is active
            await setDoc(doc(db, `schools/${schoolId}/settings`, 'profile'), {
                currentCheckinCode: uniqueId,
                checkinCodeGeneratedAt: new Date().toISOString()
            }, { merge: true });

            // 2. Generate QR code data URL using qrcode library
            const qrDataUrl = await QRCodeLib.toDataURL(uniqueId, { 
                width: 400,
                margin: 2,
                color: {
                    dark: '#1e293b',
                    light: '#ffffff'
                }
            });

            const pdfDoc = new jsPDF();
            
            // Header styling
            pdfDoc.setFontSize(26);
            pdfDoc.setTextColor('#5b21b6');
            pdfDoc.text(schoolName || 'School Name', 105, 40, { align: 'center' });
            
            pdfDoc.setFontSize(18);
            pdfDoc.setTextColor('#1e293b');
            pdfDoc.setFont(undefined, 'bold');
            pdfDoc.text('Daily Attendance Check-in', 105, 55, { align: 'center' });

            // Information text
            pdfDoc.setFontSize(12);
            pdfDoc.setTextColor('#475569');
            pdfDoc.setFont(undefined, 'normal');
            pdfDoc.text('Scan this code using the Teacher App to log your', 105, 70, { align: 'center' });
            pdfDoc.text('arrival and departure times.', 105, 78, { align: 'center' });
            
            // Add QR code image
            pdfDoc.addImage(qrDataUrl, 'PNG', 55, 95, 100, 100);

            // Print hint
            pdfDoc.setFontSize(11);
            pdfDoc.setTextColor('#10b981');
            pdfDoc.setFont(undefined, 'bold');
            pdfDoc.text('Scan for Check in and Check out', 105, 205, { align: 'center' });

            // Footer
            pdfDoc.setFontSize(9);
            pdfDoc.setTextColor('#94a3b8');
            pdfDoc.setFont(undefined, 'normal');
            pdfDoc.text(`Tracking ID: ${uniqueId}`, 105, 230, { align: 'center' });
            pdfDoc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 236, { align: 'center' });
            pdfDoc.text('Please print and place this code securely near the entrance.', 105, 246, { align: 'center' });
            
            // Save PDF
            pdfDoc.save(`Attendance_Scanner_${(schoolName || 'School').replace(/\s+/g, '_')}.pdf`);
            
        } catch (err) {
            console.error("Error generating Barcode PDF", err);
            alert("Failed to generate Barcode PDF: " + (err.message || "Unknown error"));
        } finally {
            setIsGeneratingBarcode(false);
        }
    };

    const renderCalendar = (year, month) => {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        
        const calendarCells = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Empty cells for days before the 1st
        for (let i = 0; i < firstDayOfMonth; i++) {
            calendarCells.push(<div key={`empty-${i}`} style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}></div>);
        }
        
        // Days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dateObj = new Date(year, month, i);
            
            let status = teacherLogs[dateStr]?.status;
            
            if (!status) {
                if (dateObj >= today) status = 'Upcoming';
                else if (dateObj.getDay() === 0) status = 'Holiday';
                else status = 'Blank';
            }
            
            let bg = '#ffffff';
            let color = '#334155';
            let border = '#e2e8f0';
            
            if (status === 'Present') { bg = '#10b981'; color = '#ffffff'; border = '#059669'; }
            else if (status === 'Absent') { bg = '#ef4444'; color = '#ffffff'; border = '#dc2626'; }
            else if (status === 'Half Day') { bg = '#f59e0b'; color = '#ffffff'; border = '#d97706'; }
            else if (status === 'Holiday') { bg = '#3b82f6'; color = '#ffffff'; border = '#2563eb'; }
            else if (status === 'Upcoming' || status === 'Blank') { bg = '#f1f5f9'; color = '#94a3b8'; border = '#e2e8f0'; }

            // Allow expanding Present or Half Day cells to see timestamps
            const isExpanded = expandedHalfDayCell === dateStr && (status === 'Half Day' || status === 'Present');
            
            let checkInStr = '--:--';
            let checkOutStr = '--:--';
            if (teacherLogs[dateStr]?.checkIn) {
                checkInStr = new Date(teacherLogs[dateStr].checkIn.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }
            if (teacherLogs[dateStr]?.checkOut) {
                checkOutStr = new Date(teacherLogs[dateStr].checkOut.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }

            calendarCells.push(
                <div key={i} 
                    onClick={() => {
                        if (status === 'Half Day' || status === 'Present') {
                            setExpandedHalfDayCell(isExpanded ? null : dateStr);
                        }
                    }}
                    style={{ 
                    padding: '0.75rem', background: bg, borderRadius: '12px', border: `1px solid ${border}`, 
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
                    cursor: (status === 'Half Day' || status === 'Present') ? 'pointer' : 'default',
                    minHeight: '80px',
                    position: 'relative', overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                    if(status !== 'Upcoming' && status !== 'Blank') e.currentTarget.style.transform = 'scale(1.03)';
                    if(status === 'Half Day' || status === 'Present') e.currentTarget.style.borderColor = status === 'Half Day' ? '#f59e0b' : '#10b981';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    if(status === 'Half Day') e.currentTarget.style.borderColor = '#d97706';
                    if(status === 'Present') e.currentTarget.style.borderColor = '#059669';
                }}
                >
                    <span style={{ fontSize: '1.2rem', fontWeight: '800', color: color, zIndex: 2 }}>{i}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: '600', color: color, textTransform: 'uppercase', zIndex: 2 }}>
                        {status === 'Blank' ? '' : status}
                    </span>
                    
                    {/* Animated Details (check in / out) */}
                    <div style={{
                        maxHeight: isExpanded ? '50px' : '0px',
                        opacity: isExpanded ? 1 : 0,
                        transition: 'all 0.3s ease-in-out',
                        overflow: 'hidden',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        fontSize: '0.65rem', fontWeight: '600', color: status === 'Half Day' ? '#92400e' : '#ecfdf5',
                        marginTop: isExpanded ? '0.2rem' : '0'
                    }}>
                        <span>In: {checkInStr}</span>
                        <span>Out: {checkOutStr}</span>
                    </div>
                </div>
            );
        }
        
        return calendarCells;
    };

    // Initialize User & School ID
    useEffect(() => {
        let unsubscribeAuth = null;

        const fetchUser = async () => {
            // Priority 1: Check Manual Session (Legacy/Bypass)
            const manualSession = localStorage.getItem('manual_session');
            if (manualSession) {
                try {
                    const userData = JSON.parse(manualSession);
                    if (userData.schoolId) {
                        setSchoolId(userData.schoolId);
                        setLoading(false);
                        return;
                    }
                } catch (e) {
                    console.error("Session parse error", e);
                }
            }

            // Priority 2: Check Standard Firebase Auth
            unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
                if (user) {
                    try {
                        const tokenResult = await user.getIdTokenResult();
                        const claims = tokenResult.claims;
                        if (claims.schoolId) {
                            setSchoolId(claims.schoolId);
                        } else {
                            console.error("No School ID claim found on user");
                            // Fallback: Check if user doc has schoolId check might be redundant if claims are set correctly, 
                            // but good for safety if we want to add it later. 
                            // For now, relying on claims is standard.
                        }
                    } catch (e) {
                        console.error("Error fetching claims", e);
                    }
                } else {
                    console.log("No authenticated user found");
                }
                setLoading(false);
            });
        };

        fetchUser();

        return () => {
            if (unsubscribeAuth) unsubscribeAuth();
        };
    }, []);

    // Fetch Teachers & Classes
    useEffect(() => {
        if (!schoolId) return;

        // Fetch School Name for Reports
        const fetchSchoolInfo = async () => {
            try {
                const schoolDoc = await getDoc(doc(db, 'schools', schoolId));
                if (schoolDoc.exists()) {
                    setSchoolName(schoolDoc.data().name || 'School Name');
                }

                const profileDoc = await getDoc(doc(db, `schools/${schoolId}/settings`, 'profile'));
                if (profileDoc.exists()) {
                    const d = profileDoc.data();
                    if (d.breakStartTime) setGlobalBreakStartTime(d.breakStartTime);
                    if (d.breakEndTime) setGlobalBreakEndTime(d.breakEndTime);
                }
            } catch (err) {
                console.error("Error fetching school info", err);
            }
        };
        fetchSchoolInfo();

        // Fetch Classes for dropdown
        const fetchClasses = async () => {
            try {
                const q = query(collection(db, `schools/${schoolId}/classes`));
                const snapshot = await getDocsFast(q);
                
                const fullClasses = snapshot.docs.map(doc => doc.data());
                setDbClassesData(fullClasses);
                
                const classesList = fullClasses.map(c => c.name);
                // Sort roughly
                classesList.sort();
                setDbClasses(classesList);
            } catch (err) {
                console.error("Error fetching classes for dropdown", err);
            }
        };

        fetchClasses();

        // Listen for Teachers
        const q = query(collection(db, `schools/${schoolId}/teachers`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const teachersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setTeachers(teachersData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching teachers:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [schoolId]);

    // Handle Scroll to Teacher from Dashboard
    const location = useLocation();
    const [highlightedTeacherId, setHighlightedTeacherId] = useState(null);

    useEffect(() => {
        if (location.state?.selectedTeacherId && !loading && teachers.length > 0) {
            const teacherId = location.state.selectedTeacherId;
            const element = document.getElementById(`teacher-${teacherId}`);
            if (element) {
                setTimeout(() => {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setHighlightedTeacherId(teacherId);
                    setTimeout(() => setHighlightedTeacherId(null), 3000);
                }, 500);
            }
        }
    }, [location.state, loading, teachers]);

    // Fetch Syllabus
    useEffect(() => {
        if (!schoolId || !selectedSyllabusClass || !selectedSyllabusSubject) {
            setSyllabusChapters([]);
            return;
        }
        setLoadingSyllabus(true);
        const classObj = dbClassesData.find(c => c.name === selectedSyllabusClass);
        if (!classObj) {
            setSyllabusChapters([]);
            setLoadingSyllabus(false);
            return;
        }

        const docRef = doc(db, `schools/${schoolId}/classes/${classObj.id}/syllabus`, selectedSyllabusSubject);
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                setSyllabusChapters(docSnap.data().chapters || []);
            } else {
                setSyllabusChapters([]);
            }
            setLoadingSyllabus(false);
        }, (error) => {
            console.error("Error fetching syllabus:", error);
            setLoadingSyllabus(false);
        });

        return () => unsubscribe();
    }, [schoolId, selectedSyllabusClass, selectedSyllabusSubject, dbClassesData]);

    const handleAddChapter = async (e) => {
        e.preventDefault();
        if (!schoolId || !selectedSyllabusClass || !selectedSyllabusSubject || !newChapterTitle.trim()) return;

        const classObj = dbClassesData.find(c => c.name === selectedSyllabusClass);
        if (!classObj) return;

        const docRef = doc(db, `schools/${schoolId}/classes/${classObj.id}/syllabus`, selectedSyllabusSubject);
        try {
            const docSnap = await getDoc(docRef);
            const newChapter = {
                id: Date.now().toString(),
                title: newChapterTitle.trim(),
                time: newChapterTime.trim() || 'Not specified',
                status: 'Pending'
            };

            if (docSnap.exists()) {
                await updateDoc(docRef, {
                    chapters: [...(docSnap.data().chapters || []), newChapter]
                });
            } else {
                await setDoc(docRef, {
                    chapters: [newChapter]
                });
            }
            setNewChapterTitle('');
            setNewChapterTime('');
        } catch (err) {
            console.error("Error adding chapter:", err);
            alert("Failed to add chapter.");
        }
    };

    const handleDeleteChapter = async (chapterId) => {
        if (!schoolId || !selectedSyllabusClass || !selectedSyllabusSubject) return;
        const classObj = dbClassesData.find(c => c.name === selectedSyllabusClass);
        if (!classObj) return;

        const docRef = doc(db, `schools/${schoolId}/classes/${classObj.id}/syllabus`, selectedSyllabusSubject);
        try {
            const updatedChapters = syllabusChapters.filter(c => c.id !== chapterId);
            await updateDoc(docRef, { chapters: updatedChapters });
        } catch (err) {
            console.error("Error deleting chapter:", err);
            alert("Failed to delete chapter.");
        }
    };

    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const handleUpdateTeacher = async (id, updatedTeacher) => {
        try {
            const teacherRef = doc(db, `schools/${schoolId}/teachers`, id);
            const updateData = { ...updatedTeacher };
            
            // Strip out functional subjects to prevent timetable powers but keep them for display
            updateData.displaySubjects = updatedTeacher.subjects;
            updateData.subjects = [];

            const oldTeacher = teachers.find(t => t.id === id);

            const isPasswordChanged = updateData.password && updateData.password.trim() !== '';
            const newAuthEmail = (updateData.username && updateData.username.trim()) || (updateData.email && updateData.email.trim());
            const oldAuthEmail = oldTeacher?.username || oldTeacher?.email;
            const isEmailChanged = newAuthEmail !== oldAuthEmail;

            // 1. If password or email changed, update Firebase Auth via Cloud Function
            if (isPasswordChanged || (newAuthEmail && isEmailChanged)) {
                console.log("Updating credentials for teacher:", id);
                const updatePasswordFn = httpsCallable(functions, 'updateSchoolUserPassword');
                const authPayload = { targetUid: id, schoolId: schoolId };
                if (isPasswordChanged) authPayload.newPassword = updateData.password.trim();
                if (isEmailChanged) authPayload.newEmail = newAuthEmail;
                
                await updatePasswordFn(authPayload);
                console.log("Auth credentials updated successfully");
            }

            if (!updateData.password) delete updateData.password; // Don't overwrite in FS if empty
            if (!updateData.username) delete updateData.username;

            await updateDoc(teacherRef, updateData);

            // ... (rest of the class re-assignment logic)
            // Handle Class Re-assignments
            const oldClasses = oldTeacher?.assignedClasses || (oldTeacher?.assignedClass ? [oldTeacher.assignedClass] : []);
            const newClasses = updatedTeacher.assignedClasses || [];

            // Removed classes: set teacher to 'Unassigned'
            const removedMessages = oldClasses.filter(c => !newClasses.includes(c));
            const removedPromises = removedMessages.map(async (cls) => {
                const q = query(collection(db, `schools/${schoolId}/classes`), where("name", "==", cls));
                const snap = await getDocsFast(q);
                return Promise.all(snap.docs.map(d => updateDoc(doc(db, `schools/${schoolId}/classes`, d.id), {
                    teacher: 'Unassigned',
                    teacherId: null
                })));
            });

            // Added classes: set teacher to New Name AND teacherId
            const addedClasses = newClasses.filter(c => !oldClasses.includes(c));
            const addedPromises = addedClasses.map(async (cls) => {
                const q = query(collection(db, `schools/${schoolId}/classes`), where("name", "==", cls));
                const snap = await getDocsFast(q);
                return Promise.all(snap.docs.map(d => updateDoc(doc(db, `schools/${schoolId}/classes`, d.id), {
                    teacher: updatedTeacher.name,
                    teacherId: id
                })));
            });

            // Also update Name in KEPT classes if name changed
            let keptPromises = [];
            if (oldTeacher.name !== updatedTeacher.name) {
                const keptClasses = newClasses.filter(c => oldClasses.includes(c));
                keptPromises = keptClasses.map(async (cls) => {
                    const q = query(collection(db, `schools/${schoolId}/classes`), where("name", "==", cls));
                    const snap = await getDocsFast(q);
                    return Promise.all(snap.docs.map(d => updateDoc(doc(db, `schools/${schoolId}/classes`, d.id), {
                        teacher: updatedTeacher.name,
                        teacherId: id
                    })));
                });
            }

            await Promise.all([...removedPromises, ...addedPromises, ...keptPromises]);
        } catch (error) {
            console.error("Error updating teacher in Teachers component:", error);
            throw error;
        }
    };

    const handleEditClick = (teacher) => {
        // Fallback for global modal if needed, but TeacherCard handles its own isEditing now
        setNewTeacher({
            ...teacher,
            salary: teacher.salary || '',
            password: '', // Clear password field for security/edit mode
            subjects: Array.isArray(teacher.displaySubjects) ? teacher.displaySubjects : (Array.isArray(teacher.subjects) ? teacher.subjects : (teacher.subject ? [teacher.subject] : [])),
            assignedClasses: Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : (teacher.assignedClass ? [teacher.assignedClass] : [])
        });
        setEditingId(teacher.id);
        setIsEditing(true);
        setStep(1);
        setShowAddTeacher(true);
    };

    const handleAddTeacher = async (e) => {
        e.preventDefault();
        console.log("handleAddTeacher called. School ID:", schoolId);

        if (!schoolId) {
            alert("Error: School ID is missing. Please reload the page or log in again.");
            console.error("School ID is missing in handleAddTeacher");
            return;
        }

        try {
            if (isEditing) {
                // Update Logic
                const teacherRef = doc(db, `schools/${schoolId}/teachers`, editingId);
                const updateData = { ...newTeacher };
                
                // Strip out functional subjects to prevent timetable powers but keep them for display
                updateData.displaySubjects = newTeacher.subjects;
                updateData.subjects = [];

                const oldTeacher = teachers.find(t => t.id === editingId);

                const isPasswordChanged = updateData.password && updateData.password.trim() !== '';
                const newAuthEmail = (updateData.username && updateData.username.trim()) || (updateData.email && updateData.email.trim());
                const oldAuthEmail = oldTeacher?.username || oldTeacher?.email;
                const isEmailChanged = newAuthEmail !== oldAuthEmail;

                // 1. If password or email changed, update Firebase Auth via Cloud Function
                if (isPasswordChanged || (newAuthEmail && isEmailChanged)) {
                    console.log("Updating credentials for teacher during edit:", editingId);
                    const updatePasswordFn = httpsCallable(functions, 'updateSchoolUserPassword');
                    const authPayload = { targetUid: editingId, schoolId: schoolId };
                    if (isPasswordChanged) authPayload.newPassword = updateData.password.trim();
                    if (isEmailChanged) authPayload.newEmail = newAuthEmail;

                    await updatePasswordFn(authPayload);
                    console.log("Auth credentials updated successfully");
                }

                if (!updateData.password) delete updateData.password; // Don't overwrite if empty
                if (!updateData.username) delete updateData.username;

                await updateDoc(teacherRef, updateData);

                // ... (rest of class assignment logic)
                // Handle Class Re-assignments
                const oldClasses = oldTeacher?.assignedClasses || (oldTeacher?.assignedClass ? [oldTeacher.assignedClass] : []);
                const newClasses = newTeacher.assignedClasses || [];

                // Removed classes: set teacher to 'Unassigned'
                const removedMessages = oldClasses.filter(c => !newClasses.includes(c));
                const removedPromises = removedMessages.map(async (cls) => {
                    const q = query(collection(db, `schools/${schoolId}/classes`), where("name", "==", cls));
                    const snap = await getDocsFast(q);
                    return Promise.all(snap.docs.map(d => updateDoc(doc(db, `schools/${schoolId}/classes`, d.id), {
                        teacher: 'Unassigned',
                        teacherId: null
                    })));
                });

                // Added classes: set teacher to New Name AND teacherId
                const addedClasses = newClasses.filter(c => !oldClasses.includes(c));
                const addedPromises = addedClasses.map(async (cls) => {
                    const q = query(collection(db, `schools/${schoolId}/classes`), where("name", "==", cls));
                    const snap = await getDocsFast(q);
                    return Promise.all(snap.docs.map(d => updateDoc(doc(db, `schools/${schoolId}/classes`, d.id), {
                        teacher: newTeacher.name,
                        teacherId: editingId
                    })));
                });

                // Also update Name in KEPT classes if name changed
                let keptPromises = [];
                if (oldTeacher.name !== newTeacher.name) {
                    const keptClasses = newClasses.filter(c => oldClasses.includes(c));
                    keptPromises = keptClasses.map(async (cls) => {
                        const q = query(collection(db, `schools/${schoolId}/classes`), where("name", "==", cls));
                        const snap = await getDocsFast(q);
                        return Promise.all(snap.docs.map(d => updateDoc(doc(db, `schools/${schoolId}/classes`, d.id), {
                            teacher: newTeacher.name,
                            teacherId: editingId
                        })));
                    });
                }

                await Promise.all([...removedPromises, ...addedPromises, ...keptPromises]);

                // Clean up state after successful update
                setShowAddTeacher(false);
                setNewTeacher({ name: '', email: '', phone: '', salary: '', subjects: [], address: '', assignedClasses: [], username: '', password: '' });
                setStep(1);
                setIsEditing(false);
                setEditingId(null);

            } else {
                // Add Logic - VIA CLOUD FUNCTION (Secure)
                console.log("Creating new teacher account...");
                setLoading(true);

                try {
                    const createSchoolUserFn = httpsCallable(functions, 'createSchoolUser');
                    console.log("Calling Cloud Function: createSchoolUser");

                    const result = await createSchoolUserFn({
                        email: newTeacher.username.trim() || newTeacher.email.trim(),
                        password: newTeacher.password,
                        name: newTeacher.name.trim(),
                        role: 'teacher',
                        schoolId: schoolId,
                        // Pass extra fields directly to backend
                        phone: newTeacher.phone.trim(),
                        salary: Number(newTeacher.salary) || 0,
                        subjects: [], // Force empty array so no timetable powers are given
                        address: newTeacher.address,
                        assignedClasses: newTeacher.assignedClasses,
                        username: newTeacher.username.trim()
                    });

                    console.log("Cloud Function Result:", result);
                    const newTeacherUid = result.data.uid;

                    // Immediately update the newly created document with the displaySubjects
                    await updateDoc(doc(db, `schools/${schoolId}/teachers`, newTeacherUid), {
                        displaySubjects: newTeacher.subjects
                    });

                    // Note: Doc creation is now handled entirely by the Cloud Function.
                    // We only need to handle Class assignments in other collections if needed.

                    // 3. Handle Class Assignments
                    if (newTeacher.assignedClasses && newTeacher.assignedClasses.length > 0) {
                        const updatePromises = newTeacher.assignedClasses.map(async (className) => {
                            const q = query(
                                collection(db, `schools/${schoolId}/classes`),
                                where("name", "==", className)
                            );
                            const querySnapshot = await getDocsFast(q);
                            if (!querySnapshot.empty) {
                                const classDoc = querySnapshot.docs[0];
                                await updateDoc(doc(db, `schools/${schoolId}/classes`, classDoc.id), {
                                    teacher: newTeacher.name,
                                    teacherId: newTeacherUid // Also link ID upon creation
                                });
                            }
                        });
                        await Promise.all(updatePromises);
                    }
                    setLoading(false);

                    setShowAddTeacher(false);
                    setNewTeacher({ name: '', email: '', phone: '', salary: '', subjects: [], address: '', assignedClasses: [], username: '', password: '' });
                    setStep(1);
                    setIsEditing(false);
                    setEditingId(null);

                } catch (error) {
                    console.error("Error creating teacher:", error);
                    alert("Failed to create teacher account. " + error.message);
                    setLoading(false);
                }
            }
        } catch (error) {
            console.error("Error saving teacher:", error);
            alert("Failed to save teacher. " + error.message);
            setLoading(false); // Ensure loading is turned off on error
        }
    };

    // Delete Logic
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [teacherToDelete, setTeacherToDelete] = useState(null);
    const [confirmPassword, setConfirmPassword] = useState('');
    const [deleteError, setDeleteError] = useState('');

    const handleDeleteClick = (id) => {
        setTeacherToDelete(id);
        setShowDeleteConfirm(true);
        setConfirmPassword('');
        setDeleteError('');
    };

    const confirmDelete = async (e) => {
        e.preventDefault();
        setDeleteError('');

        // Basic Manual Auth Check (same as Classes.jsx)
        let isVerified = false;
        const manualSession = localStorage.getItem('manual_session');

        if (auth.currentUser) {
            // Standard Auth Re-authentication
            try {
                const credential = EmailAuthProvider.credential(auth.currentUser.email, confirmPassword);
                await reauthenticateWithCredential(auth.currentUser, credential);
                isVerified = true;
            } catch (err) {
                console.error("Re-auth failed", err);
                if (err.code === 'auth/wrong-password') {
                    setDeleteError("Incorrect password.");
                    return;
                }
            }
        } else if (manualSession) {
            // Legacy Manual Auth Check
            try {
                const userData = JSON.parse(manualSession);
                const userDocRef = doc(db, `schools/${schoolId}/users`, userData.uid);
                const snapshot = await getDoc(userDocRef);
                if (snapshot.exists() && snapshot.data().manualPassword === confirmPassword) {
                    isVerified = true;
                }
            } catch (err) {
                console.error("Verification failed", err);
            }
        }

        if (isVerified) {
            try {
                await deleteDoc(doc(db, `schools/${schoolId}/teachers`, teacherToDelete));
                setShowDeleteConfirm(false);
                setTeacherToDelete(null);
            } catch (error) {
                console.error("Error deleting teacher:", error);
                setDeleteError("Failed to delete. Try again.");
            }
        } else {
            setDeleteError("Incorrect password.");
        }
    };

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
                        Teachers & Staff
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Manage your faculty members and assignments</p>
                </div>
                <button
                    onClick={() => setShowAddTeacher(true)}
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
                    <span>Add New Teacher</span>
                </button>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                {[
                    {
                        label: 'Total Teachers',
                        value: teachers.length,
                        icon: Users,
                        bg: 'linear-gradient(135deg, #ffffff 0%, #f5f7ff 100%)',
                        border: '#e0e7ff',
                        iconBg: '#e0e7ff',
                        iconColor: '#4f46e5'
                    },
                    {
                        label: 'Active Today',
                        value: teachers.filter(t => t.lastAttendanceDate === todayStr).length,
                        icon: User,
                        bg: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
                        border: '#dcfce7',
                        iconBg: '#dcfce7',
                        iconColor: '#10b981'
                    },
                    {
                        label: 'Staff On Leave',
                        value: teachers.filter(t => t.lastAttendanceDate !== todayStr).length,
                        icon: User,
                        bg: 'linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)',
                        border: '#fef3c7',
                        iconBg: '#fef3c7',
                        iconColor: '#f59e0b'
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

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                <button
                    onClick={() => { setActiveTab('list'); setSelectedAttendanceTeacher(null); }}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0.5rem 1rem', fontSize: '1.1rem', fontWeight: '700',
                        color: activeTab === 'list' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: activeTab === 'list' ? '3px solid var(--primary)' : '3px solid transparent',
                        transition: 'all 0.2s',
                        borderRadius: '0'
                    }}
                >
                    Teachers List
                </button>
                <button
                    onClick={() => setActiveTab('attendance')}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0.5rem 1rem', fontSize: '1.1rem', fontWeight: '700',
                        color: activeTab === 'attendance' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: activeTab === 'attendance' ? '3px solid var(--primary)' : '3px solid transparent',
                        transition: 'all 0.2s',
                        borderRadius: '0'
                    }}
                >
                    Attendance
                </button>
                <button
                    onClick={() => setActiveTab('timetable')}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0.5rem 1rem', fontSize: '1.1rem', fontWeight: '700',
                        color: activeTab === 'timetable' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: activeTab === 'timetable' ? '3px solid var(--primary)' : '3px solid transparent',
                        transition: 'all 0.2s',
                        borderRadius: '0'
                    }}
                >
                    Time table
                </button>
                <button
                    onClick={() => setActiveTab('syllabus')}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0.5rem 1rem', fontSize: '1.1rem', fontWeight: '700',
                        color: activeTab === 'syllabus' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: activeTab === 'syllabus' ? '3px solid var(--primary)' : '3px solid transparent',
                        transition: 'all 0.2s',
                        borderRadius: '0'
                    }}
                >
                    Syllabus
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'list' && (
                <>
                    {/* Teacher Grid */}
                    {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                    <Loader2 className="animate-spin" size={32} color="var(--primary)" />
                </div>
            ) : teachers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                    <Users size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p>No teachers added yet. Click 'Add New Teacher' to start.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                    {teachers.map((t) => (
                        <TeacherCard
                            key={t.id}
                            teacher={t}
                            onDelete={handleDeleteClick}
                            onUpdate={handleUpdateTeacher}
                            schoolId={schoolId}
                            dbClasses={dbClasses}
                            isHighlighted={highlightedTeacherId === t.id}
                            todayStr={todayStr}
                        />
                    ))}
                </div>
            )}
                </>
            )}

            {activeTab === 'attendance' && (
                <div className="animate-fade-in-up">
                    {selectedAttendanceTeacher ? (
                        <div className="card" style={{ padding: '2rem', background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <button 
                                        onClick={() => setSelectedAttendanceTeacher(null)}
                                        style={{ background: '#f1f5f9', border: 'none', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#e2e8f0'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                    >
                                        <ChevronLeft size={20} color="#475569" />
                                    </button>
                                    <div>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.2rem' }}>{selectedAttendanceTeacher.name}'s Attendance</h2>
                                        <p style={{ color: '#64748b', fontSize: '0.95rem', fontWeight: '500' }}>{selectedAttendanceTeacher.subject || (selectedAttendanceTeacher.subjects && selectedAttendanceTeacher.subjects[0]) || 'Teacher'}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleDownloadReport(selectedAttendanceTeacher)}
                                    className="btn-primary" 
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', borderRadius: '12px', background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', border: 'none', color: 'white', fontWeight: '600', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)', cursor: 'pointer', transition: 'all 0.2s' }}
                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                                >
                                    <DownloadCloud size={18} />
                                    Download Report
                                </button>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem 1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <Calendar size={22} color="#64748b" />
                                    <select 
                                        value={attendanceMonth} 
                                        onChange={(e) => setAttendanceMonth(parseInt(e.target.value))}
                                        style={{ padding: '0.5rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: '600', color: '#334155', background: 'white', cursor: 'pointer' }}
                                    >
                                        {Array.from({length: 12}).map((_, i) => (
                                            <option key={i} value={i}>{new Date(0, i + 1, 0).toLocaleString('default', { month: 'long' })}</option>
                                        ))}
                                    </select>
                                    <select 
                                        value={attendanceYear} 
                                        onChange={(e) => setAttendanceYear(parseInt(e.target.value))}
                                        style={{ padding: '0.5rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: '600', color: '#334155', background: 'white', cursor: 'pointer' }}
                                    >
                                        <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>
                                        <option value={new Date().getFullYear() - 1}>{new Date().getFullYear() - 1}</option>
                                    </select>
                                </div>

                                <div style={{ display: 'flex', gap: '1.25rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div style={{ width: '12px', height: '12px', borderRadius: '4px', background: '#10b981' }}></div><span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569' }}>Present</span></div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div style={{ width: '12px', height: '12px', borderRadius: '4px', background: '#f59e0b' }}></div><span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569' }}>Half Day</span></div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div style={{ width: '12px', height: '12px', borderRadius: '4px', background: '#ef4444' }}></div><span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569' }}>Absent</span></div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div style={{ width: '12px', height: '12px', borderRadius: '4px', background: '#3b82f6' }}></div><span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569' }}>Holiday</span></div>
                                </div>
                            </div>

                            {/* Calendar Grid Container */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                    <div key={day} style={{ textAlign: 'center', fontWeight: '700', color: '#64748b', padding: '0.5rem 0', fontSize: '0.9rem' }}>{day}</div>
                                ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem' }}>
                                {renderCalendar(attendanceYear, attendanceMonth)}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Check-in Barcode Section (PDF Generator) */}
                            <div className="card" style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem 2rem', background: 'linear-gradient(to right, #f8fafc, #ffffff)', border: '1px solid #e2e8f0', borderRadius: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', maxWidth: '70%' }}>
                                    <div style={{ background: '#ecfdf5', padding: '1rem', borderRadius: '16px' }}>
                                        <QrCode size={32} color="#10b981" />
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <ShieldCheck size={20} color="#10b981" />
                                            Daily Attendance Scanner
                                        </h3>
                                        <p style={{ color: '#475569', fontSize: '0.95rem', margin: '0 0 0.5rem 0', lineHeight: '1.4' }}>
                                            Generate a printable Barcode PDF for teachers to scan for Check-in & Check-out.
                                        </p>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#fef2f2', border: '1px solid #fecaca', padding: '0.4rem 0.8rem', borderRadius: '8px', color: '#dc2626', fontSize: '0.85rem', fontWeight: '600' }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }}></div>
                                            Security Notice: Generating a new barcode immediately invalidates all previously generated ones.
                                        </div>
                                    </div>
                                </div>
                                
                                <button 
                                    onClick={handleGenerateBarcodePDF}
                                    disabled={isGeneratingBarcode}
                                    className="btn-primary"
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                                        padding: '0.75rem 1.5rem', borderRadius: '12px',
                                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                        color: 'white', fontWeight: '700', border: 'none',
                                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                                        cursor: isGeneratingBarcode ? 'wait' : 'pointer', 
                                        transition: 'all 0.2s',
                                        whiteSpace: 'nowrap',
                                        opacity: isGeneratingBarcode ? 0.8 : 1
                                    }}
                                    onMouseEnter={(e) => !isGeneratingBarcode && (e.currentTarget.style.transform = 'translateY(-2px)')}
                                    onMouseLeave={(e) => !isGeneratingBarcode && (e.currentTarget.style.transform = 'translateY(0)')}
                                >
                                    {isGeneratingBarcode ? <Loader2 size={20} className="animate-spin" /> : <DownloadCloud size={20} />}
                                    {isGeneratingBarcode ? 'Generating & Refreshing...' : 'Generate New Barcode PDF'}
                                </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                            {teachers.map((t) => (
                                <div 
                                    key={t.id} 
                                    onClick={() => setSelectedAttendanceTeacher(t)}
                                    style={{
                                        background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem',
                                        cursor: 'pointer', transition: 'all 0.3s ease', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                                        display: 'flex', alignItems: 'center', gap: '1rem'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(139, 92, 246, 0.2)'; e.currentTarget.style.borderColor = '#c4b5fd'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                >
                                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', fontSize: '1.4rem', boxShadow: '0 4px 10px rgba(124, 58, 237, 0.3)' }}>
                                        {t.name && t.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.2rem' }}>{t.name}</h3>
                                        <span style={{ fontSize: '0.85rem', color: '#64748b', background: '#f1f5f9', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: '600' }}>
                                            {t.subject || (t.subjects && t.subjects.length > 0 ? t.subjects[0] : 'Teacher')}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {activeTab === 'timetable' && (
                <div className="animate-fade-in-up">
                    <div className="card" style={{ padding: '2rem', background: '#e0f2fe', borderRadius: '24px', border: '1px solid #bae6fd', boxShadow: '0 10px 25px -5px rgba(14, 165, 233, 0.1)', overflowX: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#1e293b', margin: 0 }}>Weekly Time Table</h2>
                                <div style={{ background: '#fef3c7', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#d97706', letterSpacing: '0.5px' }}>Official Break Config:</label>
                                    <input type="time" value={globalBreakStartTime} onChange={(e) => handleUpdateBreakTime('start', e.target.value)} style={{ padding: '0.2rem', borderRadius: '4px', border: '1px solid #fcd34d', outline: 'none', background: 'white', color: '#92400e', fontWeight: 'bold' }} />
                                    <span style={{ color: '#d97706', fontWeight: 'bold' }}>-</span>
                                    <input type="time" value={globalBreakEndTime} onChange={(e) => handleUpdateBreakTime('end', e.target.value)} style={{ padding: '0.2rem', borderRadius: '4px', border: '1px solid #fcd34d', outline: 'none', background: 'white', color: '#92400e', fontWeight: 'bold' }} />
                                </div>
                            </div>
                            <button
                                onClick={handleAddTimeRow}
                                className="btn-primary"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '8px',
                                    background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', border: 'none', color: 'white', fontWeight: '600', cursor: 'pointer'
                                }}
                            >
                                <Plus size={16} /> Add Row
                            </button>
                        </div>

                        <div style={{ minWidth: '600px' }}>
                            {/* Header Row */}
                            <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(${timeTableCols.length}, minmax(110px, 1fr)) 80px`, gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center', background: '#f8fafc', padding: '0.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontWeight: '700', color: '#475569', fontSize: '0.85rem' }}>Teacher</div>
                                {timeTableCols.map((col, idx) => (
                                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <input
                                            type="time"
                                            value={col}
                                            onChange={(e) => handleTimeTableTimeChange(idx, e.target.value)}
                                            style={{ padding: '0.3rem', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: '600', color: '#334155', background: 'white', width: '100%', textAlign: 'center', fontSize: '0.85rem', cursor: 'pointer' }}
                                        />
                                    </div>
                                ))}
                                <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                                    <button onClick={handleAddTimeCol} style={{ background: '#10b981', border: 'none', color: 'white', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)' }}>
                                        <Plus size={14} />
                                    </button>
                                    <button onClick={() => handleRemoveTimeCol(timeTableCols.length - 1)} style={{ background: '#ef4444', border: 'none', color: 'white', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)' }} disabled={timeTableCols.length <= 1}>
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Data Rows */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {timeTableRows.map((row, rowIndex) => (
                                    <div key={row.id} style={{ display: 'grid', gridTemplateColumns: `140px repeat(${timeTableCols.length}, minmax(110px, 1fr)) 80px`, gap: '0.5rem', alignItems: 'start', padding: '0.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', transition: 'box-shadow 0.2s' }}>
                                        
                                        {/* Teacher Selector */}
                                        <div>
                                            <select
                                                value={row.teacherId}
                                                onChange={(e) => handleTimeTableTeacherChange(rowIndex, e.target.value)}
                                                style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.8rem', fontWeight: '600', color: '#1e293b', background: '#f8fafc', cursor: 'pointer' }}
                                            >
                                                <option value="">Select Teacher</option>
                                                {teachers.map(t => (
                                                    <option key={t.id} value={t.id}>{t.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Time Cells */}
                                        {row.cells.map((cell, colIndex) => {
                                            const isGlobalBreak = timeTableCols[colIndex] === globalBreakStartTime;
                                            const effectiveClass = isGlobalBreak ? 'BREAK' : cell.class;
                                            
                                            return (
                                            <div key={colIndex} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', background: '#f1f5f9', padding: '0.4rem', borderRadius: '6px', border: (effectiveClass === 'FREE' || effectiveClass === 'BREAK') ? '1px dashed #94a3b8' : '1px solid #e2e8f0' }}>
                                                
                                                <select
                                                    value={effectiveClass}
                                                    disabled={isGlobalBreak}
                                                    onChange={(e) => handleTimeTableCellChange(rowIndex, colIndex, 'class', e.target.value)}
                                                    style={{ width: '100%', padding: '0.25rem', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.75rem', fontWeight: '600', color: '#1e293b', background: isGlobalBreak ? '#dbeafe' : 'white', cursor: isGlobalBreak ? 'not-allowed' : 'pointer' }}
                                                >
                                                    <option value="">Select Class</option>
                                                    <option value="FREE" style={{ fontWeight: 'bold', color: '#10b981' }}>-- FREE --</option>
                                                    <option value="BREAK" style={{ fontWeight: 'bold', color: '#3b82f6' }}>-- BREAK --</option>
                                                    {dbClasses.map(c => (
                                                        <option key={c} value={c}>{c}</option>
                                                    ))}
                                                </select>

                                                {(effectiveClass !== 'FREE' && effectiveClass !== 'BREAK') && (() => {
                                                    const selectedClassData = dbClassesData.find(c => c.name === effectiveClass);
                                                    const allowedSubjects = (selectedClassData && Array.isArray(selectedClassData.subjects) && selectedClassData.subjects.length > 0) 
                                                        ? selectedClassData.subjects 
                                                        : subjectOptions;

                                                    return (
                                                        <select
                                                            value={cell.subject}
                                                            onChange={(e) => handleTimeTableCellChange(rowIndex, colIndex, 'subject', e.target.value)}
                                                            style={{ width: '100%', padding: '0.25rem', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.75rem', fontWeight: '500', color: '#475569', background: 'white', cursor: 'pointer' }}
                                                        >
                                                            <option value="">Select Subject</option>
                                                            {allowedSubjects.map(s => (
                                                                <option key={s} value={s}>{s}</option>
                                                            ))}
                                                        </select>
                                                    );
                                                })()}
                                                
                                                {effectiveClass === 'FREE' && (
                                                    <div style={{ textAlign: 'center', padding: '0.1rem', color: '#10b981', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.5px' }}>
                                                        IDLE SLOT
                                                    </div>
                                                )}
                                                {effectiveClass === 'BREAK' && (
                                                    <div style={{ textAlign: 'center', padding: '0.1rem', color: '#3b82f6', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.5px' }}>
                                                        BREAK TIME
                                                    </div>
                                                )}
                                            </div>
                                        )})}

                                        {/* Remove Row Button */}
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                            <button 
                                                onClick={() => {
                                                    const newRows = [...timeTableRows];
                                                    newRows.splice(rowIndex, 1);
                                                    setTimeTableRows(newRows);
                                                }}
                                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.4rem', borderRadius: '6px', transition: 'background 0.2s' }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>

                                    </div>
                                ))}
                            </div>

                        </div>
                    </div>
                    
                    {/* Save Button & Options Below Card */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', marginTop: '1.5rem', marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569' }}>Notification Output</label>
                            <select 
                                value={publishType}
                                onChange={(e) => setPublishType(e.target.value)}
                                style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontWeight: '600', color: publishType === 'emergency' ? '#ef4444' : '#1e293b', background: 'white', cursor: 'pointer' }}
                            >
                                <option value="standard">Publish Normal Plan (Standard Alerts)</option>
                                <option value="emergency">Emergency Substitute (Urgent Alerts)</option>
                            </select>
                        </div>
                        <button
                            className="btn-primary"
                            disabled={isPublishingTimeTable}
                            style={{
                                padding: '0.75rem 2.5rem', borderRadius: '12px',
                                background: publishType === 'emergency' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                color: 'white', fontWeight: '700', border: 'none', fontSize: '1.1rem',
                                boxShadow: publishType === 'emergency' ? '0 4px 12px rgba(239, 68, 68, 0.3)' : '0 4px 12px rgba(16, 185, 129, 0.3)',
                                cursor: isPublishingTimeTable ? 'wait' : 'pointer', transition: 'all 0.2s',
                                display: 'flex', alignItems: 'center', gap: '0.5rem', height: 'fit-content',
                                opacity: isPublishingTimeTable ? 0.7 : 1
                            }}
                            onClick={handleSaveTimeTable}
                            onMouseEnter={(e) => !isPublishingTimeTable && (e.currentTarget.style.transform = 'translateY(-2px)')}
                            onMouseLeave={(e) => !isPublishingTimeTable && (e.currentTarget.style.transform = 'translateY(0)')}
                        >
                            {isPublishingTimeTable ? <Loader2 size={20} className="animate-spin" /> : null}
                            {isPublishingTimeTable ? 'Publishing...' : 'Save & Publish'}
                        </button>
                    </div>
                </div>
            )}
            {activeTab === 'syllabus' && (
                <div className="animate-fade-in-up">
                    <div className="card" style={{ 
                        padding: '2rem', 
                        background: 'rgba(255, 255, 255, 0.7)', 
                        backdropFilter: 'blur(20px)',
                        borderRadius: '24px', 
                        border: '1px solid rgba(255, 255, 255, 0.6)', 
                        boxShadow: '0 10px 30px -5px rgba(14, 165, 233, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.9)',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ marginBottom: '2rem', position: 'relative', zIndex: 1 }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.2rem' }}>Syllabus Management</h2>
                            <p style={{ color: '#64748b', fontSize: '0.95rem', fontWeight: '500' }}>Define chapters and topics for each class and subject.</p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Select Class</label>
                                <select 
                                    value={selectedSyllabusClass} 
                                    onChange={(e) => {
                                        setSelectedSyllabusClass(e.target.value);
                                        setSelectedSyllabusSubject('');
                                    }}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                >
                                    <option value="">-- Choose Class --</option>
                                    {dbClassesData.map(c => (
                                        <option key={c.id} value={c.name}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Select Subject</label>
                                <select 
                                    value={selectedSyllabusSubject} 
                                    onChange={(e) => setSelectedSyllabusSubject(e.target.value)}
                                    disabled={!selectedSyllabusClass}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', background: !selectedSyllabusClass ? '#f8fafc' : 'white' }}
                                >
                                    <option value="">-- Choose Subject --</option>
                                    {selectedSyllabusClass && dbClassesData.find(c => c.name === selectedSyllabusClass)?.subjects?.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {selectedSyllabusClass && selectedSyllabusSubject && (
                            <>
                                <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '2rem' }}>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1e293b', marginBottom: '1rem' }}>Add New Chapter</h3>
                                    <form onSubmit={handleAddChapter} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                                        <div style={{ flex: 2 }}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>Chapter Title</label>
                                            <input 
                                                type="text" 
                                                value={newChapterTitle}
                                                onChange={(e) => setNewChapterTitle(e.target.value)}
                                                placeholder="e.g. Chapter 1: Basic Algebra"
                                                required
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                                            />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>Estimated Time</label>
                                            <input 
                                                type="text" 
                                                value={newChapterTime}
                                                onChange={(e) => setNewChapterTime(e.target.value)}
                                                placeholder="e.g. 2 Weeks"
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                                            />
                                        </div>
                                        <button 
                                            type="submit"
                                            className="btn-primary"
                                            style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', height: '46px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600' }}
                                        >
                                            <Plus size={18} />
                                            Add
                                        </button>
                                    </form>
                                </div>

                                <div>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1e293b', marginBottom: '1rem' }}>Chapters List</h3>
                                    {loadingSyllabus ? (
                                        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                            <Loader2 className="animate-spin" size={24} color="var(--primary)" />
                                        </div>
                                    ) : syllabusChapters.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '2rem', background: '#f8fafc', borderRadius: '12px', color: '#64748b' }}>
                                            No chapters added yet for this subject.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '0.5rem' }} className="custom-scrollbar">
                                            {syllabusChapters.map((chapter, index) => (
                                                <div key={chapter.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.9rem' }}>
                                                            {index + 1}
                                                        </div>
                                                        <div>
                                                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: '#1e293b' }}>{chapter.title}</h4>
                                                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.2rem' }}>
                                                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Time: {chapter.time}</span>
                                                                <span style={{ fontSize: '0.8rem', color: chapter.status === 'Completed' ? '#10b981' : chapter.status === 'In Progress' ? '#f59e0b' : '#64748b' }}>Status: {chapter.status}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button 
                                                        onClick={() => handleDeleteChapter(chapter.id)}
                                                        style={{ background: '#fef2f2', border: 'none', width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#ef4444' }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Add Teacher Modal */}
            {showAddTeacher && (
                <div
                    onClick={(e) => {
                        // Close if clicked outside the modal content
                        if (e.target === e.currentTarget) {
                            setShowAddTeacher(false);
                            setStep(1);
                        }
                    }}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 1000,
                        background: 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(2px)',
                        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem',
                        paddingTop: '6rem', // Push modal down
                        cursor: 'pointer' // Indicate clickable background
                    }}
                >
                    <div
                        className="card custom-scrollbar"
                        onClick={(e) => e.stopPropagation()} // Prevent close when clicking inside modal
                        style={{
                            width: '100%', maxWidth: '600px', maxHeight: 'calc(100vh - 8rem)',
                            overflowY: 'auto', padding: '2rem', animation: 'slideUp 0.3s ease-out',
                            position: 'relative', background: 'white', borderRadius: '24px',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            cursor: 'default' // Reset cursor inside modal
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
                                    {isEditing ? (step === 1 ? 'Edit Teacher' : 'Update Credentials') : (step === 1 ? 'Add New Teacher' : 'Account Setup')}
                                </h2>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                {step === 1 && (
                                    <button
                                        onClick={() => setStep(2)}
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
                                <button onClick={() => { setShowAddTeacher(false); setStep(1); setIsEditing(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                    <X size={24} color="var(--text-secondary)" />
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleAddTeacher}>
                            {step === 1 ? (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                Full Name
                                            </label>
                                            <input
                                                type="text" placeholder="e.g. Sarah Connor"
                                                value={newTeacher.name}
                                                onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })}
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
                                                value={newTeacher.phone}
                                                onChange={(e) => setNewTeacher({ ...newTeacher, phone: e.target.value })}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                Subject Specialist
                                            </label>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                {subjectOptions.map((subj) => {
                                                    const isSelected = newTeacher.subjects.includes(subj);
                                                    return (
                                                        <div
                                                            key={subj}
                                                            onClick={() => {
                                                                setNewTeacher(prev => ({
                                                                    ...prev,
                                                                    subjects: isSelected
                                                                        ? prev.subjects.filter(s => s !== subj)
                                                                        : [...prev.subjects, subj]
                                                                }));
                                                            }}
                                                            style={{
                                                                padding: '0.4rem 0.8rem',
                                                                borderRadius: '8px',
                                                                border: isSelected ? '1px solid var(--primary)' : '1px solid #e2e8f0',
                                                                background: isSelected ? '#eff6ff' : 'white',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.4rem',
                                                                transition: 'all 0.2s',
                                                                fontSize: '0.85rem'
                                                            }}
                                                        >
                                                            <div style={{
                                                                width: '14px', height: '14px', borderRadius: '4px',
                                                                border: isSelected ? 'none' : '2px solid #cbd5e1',
                                                                background: isSelected ? 'var(--primary)' : 'transparent',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                            }}>
                                                                {isSelected && <span style={{ color: 'white', fontSize: '10px' }}>✓</span>}
                                                            </div>
                                                            <span style={{ color: isSelected ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: '500' }}>
                                                                {subj}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                Monthly Salary
                                            </label>
                                            <input
                                                type="number" placeholder="e.g. 45000"
                                                value={newTeacher.salary}
                                                onChange={(e) => setNewTeacher({ ...newTeacher, salary: e.target.value })}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                            />
                                        </div>
                                    </div>
                                    
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                            Email Address (Optional)
                                        </label>
                                        <input
                                            type="email" placeholder="teacher@school.com"
                                            value={newTeacher.email}
                                            onChange={(e) => setNewTeacher({ ...newTeacher, email: e.target.value })}
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
                                            value={newTeacher.address}
                                            onChange={(e) => setNewTeacher({ ...newTeacher, address: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', resize: 'none' }}
                                            required
                                        />
                                    </div>

                                    <div style={{ marginBottom: '2rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                                            Assign Classes
                                        </label>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                            {dbClasses.map((clsName) => {
                                                const isSelected = newTeacher.assignedClasses.includes(clsName);
                                                return (
                                                    <div
                                                        key={clsName}
                                                        onClick={() => {
                                                            setNewTeacher(prev => ({
                                                                ...prev,
                                                                assignedClasses: isSelected ? [] : [clsName]
                                                            }));
                                                        }}
                                                        style={{
                                                            padding: '0.5rem 1rem',
                                                            borderRadius: '8px',
                                                            border: isSelected ? '1px solid var(--primary)' : '1px solid #e2e8f0',
                                                            background: isSelected ? '#eff6ff' : 'white',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.5rem',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        <div style={{
                                                            width: '18px', height: '18px', borderRadius: '4px',
                                                            border: isSelected ? 'none' : '2px solid #cbd5e1',
                                                            background: isSelected ? 'var(--primary)' : 'transparent',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                        }}>
                                                            {isSelected && <span style={{ color: 'white', fontSize: '12px' }}>✓</span>}
                                                        </div>
                                                        <span style={{ fontSize: '0.9rem', color: isSelected ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: '500' }}>
                                                            {clsName}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
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
                                            <User size={32} />
                                        </div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-main)' }}>Create Teacher Login</h3>
                                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                            {isEditing ? 'Update login credentials or leave blank to keep current' : 'Set up credentials for the Teacher App'}
                                        </p>                        </div>

                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                            Email Address
                                        </label>
                                        <input
                                            type="email" placeholder="e.g. sarah.connor@school.com"
                                            value={newTeacher.username}
                                            onChange={(e) => setNewTeacher({ ...newTeacher, username: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                            required
                                        />
                                    </div>

                                    <div style={{ marginBottom: '2rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                            Password
                                        </label>
                                        <input
                                            type="text" placeholder={isEditing ? "Leave blank to keep current password" : "Set a strong password"}
                                            value={newTeacher.password}
                                            onChange={(e) => setNewTeacher({ ...newTeacher, password: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}
                                            required={!isEditing}
                                        />                                    </div>

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
                                            {isEditing ? 'Update Teacher' : 'Save Teacher & Create Account'}
                                        </button>                        </div>
                                </div>
                            )
                            }
                        </form >
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
                                    Are you sure you want to remove this teacher? This action cannot be undone.
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
                                        Remove
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

export default Teachers;
