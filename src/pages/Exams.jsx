import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    collection,
    doc,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    setDoc,
    query,
    where,
    getDocs,
    serverTimestamp,
    writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import {
    Award,
    Plus,
    Calendar,
    Search,
    Printer,
    Download,
    FileSpreadsheet,
    CheckCircle2,
    XCircle,
    Clock,
    AlertCircle,
    User,
    BookOpen,
    Edit2,
    Trash2,
    TrendingUp,
    ChevronDown,
    Filter,
    School,
    Check,
    FileText,
    Star,
    Layers,
    Upload,
    Palette,
    Settings2,
    ImageIcon,
    UploadCloud,
    Send,
    Sparkles,
    Scale
} from 'lucide-react';

const STANDARD_EXAM_PRESETS = [
    {
        id: 'first_term_2026',
        title: 'First Term Examination 2026',
        session: '2025-2026',
        status: 'active',
        description: 'First comprehensive academic term assessment.'
    },
    {
        id: 'mid_term_2026',
        title: 'Mid Term Examination 2026',
        session: '2025-2026',
        status: 'active',
        description: 'Mid-session evaluation test.'
    },
    {
        id: 'monthly_test',
        title: 'Monthly Class Test',
        session: '2025-2026',
        status: 'active',
        description: 'Monthly subject knowledge evaluation test.'
    },
    {
        id: 'final_term_2026',
        title: 'Annual / Final Examination 2026',
        session: '2025-2026',
        status: 'upcoming',
        description: 'Final annual comprehensive examination.'
    },
    {
        id: 'custom',
        title: '✨ Custom Examination (Create Your Own)',
        session: '2025-2026',
        status: 'active',
        description: 'Custom academic assessment / evaluation test.'
    }
];

// Robust Multi-Strategy Base64 Image Loader (Bypasses Firebase Storage & Canvas CORS)
async function fetchImageAsBase64(url) {
    if (!url || typeof url !== 'string') return null;
    const cleanUrl = url.trim();
    if (!cleanUrl) return null;

    // If already Base64 Data URL
    if (cleanUrl.startsWith('data:image/')) return cleanUrl;

    // Strategy 1: Direct Fetch as Blob
    try {
        const res = await fetch(cleanUrl, { mode: 'cors' });
        if (res.ok) {
            const blob = await res.blob();
            const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
            if (base64 && base64.startsWith('data:image/')) return base64;
        }
    } catch (e) {
        // Fall through to Strategy 2
    }

    // Strategy 2: Image Canvas with Anonymous crossOrigin
    try {
        const canvasBase64 = await new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || img.width || 200;
                    canvas.height = img.naturalHeight || img.height || 200;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg', 0.9));
                } catch (err) {
                    resolve(null);
                }
            };
            img.onerror = () => resolve(null);
            img.src = cleanUrl;
        });
        if (canvasBase64 && canvasBase64.startsWith('data:image/')) return canvasBase64;
    } catch (e) {
        // Fall through to Strategy 3
    }

    // Strategy 3: Fast Public CORS Image Proxy (Bypasses Firebase bucket restrictions)
    const proxies = [
        `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrl)}&output=jpg&q=85`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(cleanUrl)}`
    ];

    for (const proxyUrl of proxies) {
        try {
            const res = await fetch(proxyUrl);
            if (res.ok) {
                const blob = await res.blob();
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(blob);
                });
                if (base64 && base64.startsWith('data:image/')) return base64;
            }
        } catch (err) {
            // Try next proxy
        }
    }

    return null;
}

export default function Exams() {
    // --- State Management ---
    const [activeTab, setActiveTab] = useState(() => localStorage.getItem('exams_active_tab') || 'setup'); // 'setup' | 'gazette' | 'dmc'
    const [schoolId, setSchoolId] = useState('');
    const [schoolProfile, setSchoolProfile] = useState({
        name: 'School Name',
        profileImage: '',
        address: '',
        phone: '',
        email: ''
    });

    // Core Data
    const [exams, setExams] = useState([]);
    const [classes, setClasses] = useState([]);
    const [selectedExamId, setSelectedExamId] = useState(() => localStorage.getItem('exams_selected_exam_id') || '');
    const [selectedClassId, setSelectedClassId] = useState(() => localStorage.getItem('exams_selected_class_id') || '');
    
    // Tab 2 & 3 Data
    const [students, setStudents] = useState([]);
    const [classMarksDocs, setClassMarksDocs] = useState([]);
    const [loadingData, setLoadingData] = useState(false);
    
    // Filters & Sorting
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'pass' | 'fail' | 'top10'
    const [sortBy, setSortBy] = useState('position'); // 'position' | 'roll' | 'name' | 'percentage' | 'obtained'
    const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'
    const [selectedStudentForDmc, setSelectedStudentForDmc] = useState(null);
    const [selectedStudentIdsForBatch, setSelectedStudentIdsForBatch] = useState(new Set());
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
    const [logoBase64, setLogoBase64] = useState(null);
    const [showUploadToParentsModal, setShowUploadToParentsModal] = useState(false);
    const [isUploadingToParents, setIsUploadingToParents] = useState(false);
    const [uploadSuccessMessage, setUploadSuccessMessage] = useState(null);
    const isDemoAccount = useMemo(() => {
        const sId = String(schoolId || '').trim();
        const pId = String(schoolProfile?.schoolId || schoolProfile?.id || '').trim();
        return sId === '6257' || pId === '6257' || sId.includes('6257') || pId.includes('6257');
    }, [schoolId, schoolProfile]);

    const [isDemoMode, setIsDemoMode] = useState(() => {
        try {
            return (String(schoolId || '').trim() === '6257' || String(schoolId || '').includes('6257')) && localStorage.getItem('exams_demo_mode_active') === 'true';
        } catch (_) {
            return false;
        }
    });

    useEffect(() => {
        if (!isDemoAccount && isDemoMode) {
            setIsDemoMode(false);
            try { localStorage.removeItem('exams_demo_mode_active'); } catch (_) {}
        }
    }, [isDemoAccount, isDemoMode]);
    const [selectedStudentForModerate, setSelectedStudentForModerate] = useState(null);
    const [moderateSubjectMarks, setModerateSubjectMarks] = useState({});
    const [moderateStatusOverride, setModerateStatusOverride] = useState('auto'); // 'auto' | 'pass' | 'conditional_pass' | 'fail'
    const [moderateRemarks, setModerateRemarks] = useState('');
    const [isSavingModeration, setIsSavingModeration] = useState(false);
    const [isEditingMarksInDmc, setIsEditingMarksInDmc] = useState(false);
    const [demoDataOverride, setDemoDataOverride] = useState(() => {
        try { return JSON.parse(localStorage.getItem('exams_demo_data_override') || '{}'); }
        catch (e) { return {}; }
    });
    const [liveModerationOverrides, setLiveModerationOverrides] = useState({});
    const [classAttendanceDocs, setClassAttendanceDocs] = useState([]);
    const [dmcSearchQuery, setDmcSearchQuery] = useState('');
    const [dmcStatusFilter, setDmcStatusFilter] = useState('all'); // 'all' | 'pass' | 'fail' | 'pending'

    // Pre-convert school logo for sharp jsPDF rendering
    // Pre-convert school logo for sharp jsPDF rendering (Multi-Strategy with Proxy Fallback)
    useEffect(() => {
        let isMounted = true;
        if (schoolProfile.profileImage) {
            fetchImageAsBase64(schoolProfile.profileImage).then(dataUrl => {
                if (isMounted && dataUrl) {
                    setLogoBase64(dataUrl);
                }
            });
        } else {
            setLogoBase64(null);
        }
        return () => { isMounted = false; };
    }, [schoolProfile.profileImage]);

    // Modal States
    const [showExamModal, setShowExamModal] = useState(false);
    const [editingExam, setEditingExam] = useState(null);
    const [examForm, setExamForm] = useState({
        presetId: 'first_term_2026',
        title: 'First Term Examination 2026',
        session: '2025-2026',
        status: 'active',
        startDate: '',
        endDate: '',
        defaultTotalMarks: 100,
        passingMarks: 33,
        description: 'First comprehensive academic term assessment.'
    });

    // --- Persistence Effects for Navigation Memory ---
    useEffect(() => {
        if (activeTab) localStorage.setItem('exams_active_tab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        if (selectedExamId) localStorage.setItem('exams_selected_exam_id', selectedExamId);
    }, [selectedExamId]);

    useEffect(() => {
        if (selectedClassId) localStorage.setItem('exams_selected_class_id', selectedClassId);
    }, [selectedClassId]);

    // --- 1. Fetch School Session & Profile ---
    useEffect(() => {
        const session = localStorage.getItem('manual_session');
        if (session) {
            try {
                const { schoolId: id } = JSON.parse(session);
                setSchoolId(id);

                // Listen to School Profile Settings
                const profileRef = doc(db, `schools/${id}/settings`, 'profile');
                const unsubProfile = onSnapshot(profileRef, (snap) => {
                    if (snap.exists()) {
                        const d = snap.data();
                        setSchoolProfile({
                            name: d.name || d.schoolName || 'School Name',
                            profileImage: d.profileImage || d.logo || d.schoolLogo || d.photoUrl || d.image || d.logoUrl || '',
                            address: d.address || d.schoolAddress || '',
                            phone: d.phone || d.landline || d.contact || '',
                            email: d.email || ''
                        });
                    }
                });

                // Listen to Exams List
                const examsRef = collection(db, `schools/${id}/exams`);
                const unsubExams = onSnapshot(examsRef, (snap) => {
                    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    // Sort active first, then by date
                    list.sort((a, b) => (a.status === 'active' ? -1 : 1));
                    setExams(list);

                    const savedExamId = localStorage.getItem('exams_selected_exam_id');
                    if (savedExamId && list.some(e => e.id === savedExamId)) {
                        setSelectedExamId(savedExamId);
                    } else if (list.length > 0 && !selectedExamId) {
                        setSelectedExamId(list[0].id);
                    }
                });

                // Listen to Classes List
                const classesRef = collection(db, `schools/${id}/classes`);
                const unsubClasses = onSnapshot(classesRef, (snap) => {
                    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                    setClasses(list);

                    const savedClassId = localStorage.getItem('exams_selected_class_id');
                    if (savedClassId && list.some(c => c.id === savedClassId)) {
                        setSelectedClassId(savedClassId);
                    } else if (list.length > 0 && !selectedClassId) {
                        setSelectedClassId(list[0].id);
                    }
                });

                return () => {
                    unsubProfile();
                    unsubExams();
                    unsubClasses();
                };
            } catch (err) {
                console.error("Session parse error:", err);
            }
        }
    }, []);

    // --- 2. Real-time Listeners for Class Students & Exam Marks ---
    useEffect(() => {
        if (!schoolId || !selectedClassId) {
            setStudents([]);
            setClassMarksDocs([]);
            return;
        }

        setLoadingData(true);

        // Fetch students of this class
        const studentsRef = collection(db, `schools/${schoolId}/classes/${selectedClassId}/students`);
        const unsubStudents = onSnapshot(studentsRef, (snap) => {
            const list = snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    name: data.fullName || data.name || ((data.firstName || '') + ' ' + (data.lastName || '')).trim() || 'Student',
                    rollNumber: data.rollNumber || data.rollNo || '',
                    fatherName: data.fatherName || data.guardianName || '',
                    photoUrl: data.photoUrl || data.photo || data.profileImage || data.studentPhoto || data.profilePic || data.avatar || data.image || data.imageUrl || '',
                    ...data
                };
            });
            // Sort students by Roll Number numerically / alphabetically
            list.sort((a, b) => {
                const rollA = parseInt(a.rollNumber) || 999999;
                const rollB = parseInt(b.rollNumber) || 999999;
                if (rollA !== rollB) return rollA - rollB;
                return a.name.localeCompare(b.name);
            });
            setStudents(list);
            // Default: All deselected for batch actions
            setSelectedStudentIdsForBatch(new Set());
            setLoadingData(false);
        }, (err) => {
            console.error("Students stream error:", err);
            setLoadingData(false);
        });

        // Fetch exam_marks of this class
        const marksRef = collection(db, `schools/${schoolId}/classes/${selectedClassId}/exam_marks`);
        const unsubMarks = onSnapshot(marksRef, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setClassMarksDocs(list);
        }, (err) => {
            console.error("Marks stream error:", err);
        });

        // Fetch daily attendance of this class
        const attendanceRef = collection(db, `schools/${schoolId}/classes/${selectedClassId}/attendance`);
        const unsubAttendance = onSnapshot(attendanceRef, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setClassAttendanceDocs(list);
        }, (err) => {
            console.warn("Attendance stream notice:", err);
        });

        return () => {
            unsubStudents();
            unsubMarks();
            unsubAttendance();
        };
    }, [schoolId, selectedClassId]);

    // Current Exam Object
    const currentExam = useMemo(() => {
        return exams.find(e => e.id === selectedExamId) || {
            id: selectedExamId || 'default',
            title: 'Term Examination',
            session: '2025-2026',
            defaultTotalMarks: 100,
            passingMarks: 33
        };
    }, [exams, selectedExamId]);

    // Current Class Object
    const currentClass = useMemo(() => {
        return classes.find(c => c.id === selectedClassId) || {
            id: selectedClassId,
            name: 'Selected Class',
            subjects: []
        };
    }, [classes, selectedClassId]);

    // --- 3. Compute Consolidated Tabulation Matrix ---
    const tabulationData = useMemo(() => {
        if (isDemoMode) {
            const demoSubjects = ['English', 'Mathematics', 'General Science', 'Urdu', 'Islamiyat'];
            const demoRows = [
                {
                    studentId: 'demo_1',
                    name: 'Muhammad Ali Raza',
                    rollNumber: '01',
                    fatherName: 'Tariq Mehmood',
                    photoUrl: null,
                    attendance: '88 / 90 Days (97.8%)',
                    subjectMarks: {
                        'English': { obtained: 92, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A+', remarks: 'Outstanding' },
                        'Mathematics': { obtained: 98, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A+', remarks: 'Brilliant' },
                        'General Science': { obtained: 94, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A+', remarks: 'Excellent' },
                        'Urdu': { obtained: 90, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A+', remarks: 'Outstanding' },
                        'Islamiyat': { obtained: 96, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A+', remarks: 'Outstanding' },
                    },
                    totalObtained: 470,
                    totalMax: 500,
                    percentage: 94.0,
                    grade: 'A+',
                    isComplete: true,
                    isPassed: true,
                    statusLabel: 'PASSED',
                    failedSubjectsCount: 0,
                    subjectsEvaluatedCount: 5,
                    totalSubjectsCount: 5,
                    hasAnyAbsent: false,
                    position: 1
                },
                {
                    studentId: 'demo_2',
                    name: 'Fatima Zahra',
                    rollNumber: '02',
                    fatherName: 'Kamran Ali',
                    photoUrl: null,
                    attendance: '87 / 90 Days (96.7%)',
                    subjectMarks: {
                        'English': { obtained: 89, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A+', remarks: 'Outstanding' },
                        'Mathematics': { obtained: 94, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A+', remarks: 'Excellent' },
                        'General Science': { obtained: 91, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A+', remarks: 'Excellent' },
                        'Urdu': { obtained: 88, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A+', remarks: 'Very Good' },
                        'Islamiyat': { obtained: 94, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A+', remarks: 'Outstanding' },
                    },
                    totalObtained: 456,
                    totalMax: 500,
                    percentage: 91.2,
                    grade: 'A+',
                    isComplete: true,
                    isPassed: true,
                    statusLabel: 'PASSED',
                    failedSubjectsCount: 0,
                    subjectsEvaluatedCount: 5,
                    totalSubjectsCount: 5,
                    hasAnyAbsent: false,
                    position: 2
                },
                {
                    studentId: 'demo_3',
                    name: 'Hamza Tariq',
                    rollNumber: '03',
                    fatherName: 'Tariq Javed',
                    photoUrl: null,
                    attendance: '85 / 90 Days (94.4%)',
                    subjectMarks: {
                        'English': { obtained: 85, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A', remarks: 'Very Good' },
                        'Mathematics': { obtained: 92, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A+', remarks: 'Excellent' },
                        'General Science': { obtained: 88, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A', remarks: 'Very Good' },
                        'Urdu': { obtained: 84, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A', remarks: 'Very Good' },
                        'Islamiyat': { obtained: 89, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A', remarks: 'Very Good' },
                    },
                    totalObtained: 438,
                    totalMax: 500,
                    percentage: 87.6,
                    grade: 'A',
                    isComplete: true,
                    isPassed: true,
                    statusLabel: 'PASSED',
                    failedSubjectsCount: 0,
                    subjectsEvaluatedCount: 5,
                    totalSubjectsCount: 5,
                    hasAnyAbsent: false,
                    position: 3
                },
                {
                    studentId: 'demo_4',
                    name: 'Maryam Siddiqui',
                    rollNumber: '04',
                    fatherName: 'Siddiq Ahmed',
                    photoUrl: null,
                    attendance: '84 / 90 Days (93.3%)',
                    subjectMarks: {
                        'English': { obtained: 82, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A', remarks: 'Very Good' },
                        'Mathematics': { obtained: 88, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A', remarks: 'Very Good' },
                        'General Science': { obtained: 85, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A', remarks: 'Very Good' },
                        'Urdu': { obtained: 81, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A', remarks: 'Very Good' },
                        'Islamiyat': { obtained: 86, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A', remarks: 'Very Good' },
                    },
                    totalObtained: 422,
                    totalMax: 500,
                    percentage: 84.4,
                    grade: 'A',
                    isComplete: true,
                    isPassed: true,
                    statusLabel: 'PASSED',
                    failedSubjectsCount: 0,
                    subjectsEvaluatedCount: 5,
                    totalSubjectsCount: 5,
                    hasAnyAbsent: false,
                    position: 4
                },
                {
                    studentId: 'demo_5',
                    name: 'Mustafa Hassan',
                    rollNumber: '05',
                    fatherName: 'Hassan Raza',
                    photoUrl: null,
                    attendance: '82 / 90 Days (91.1%)',
                    subjectMarks: {
                        'English': { obtained: 78, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Mathematics': { obtained: 86, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A', remarks: 'Very Good' },
                        'General Science': { obtained: 80, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A', remarks: 'Very Good' },
                        'Urdu': { obtained: 77, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Islamiyat': { obtained: 84, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A', remarks: 'Very Good' },
                    },
                    totalObtained: 405,
                    totalMax: 500,
                    percentage: 81.0,
                    grade: 'A',
                    isComplete: true,
                    isPassed: true,
                    statusLabel: 'PASSED',
                    failedSubjectsCount: 0,
                    subjectsEvaluatedCount: 5,
                    totalSubjectsCount: 5,
                    hasAnyAbsent: false,
                    position: 5
                },
                {
                    studentId: 'demo_6',
                    name: 'Hafsa Noor',
                    rollNumber: '06',
                    fatherName: 'Noor Muhammad',
                    photoUrl: null,
                    attendance: '80 / 90 Days (88.9%)',
                    subjectMarks: {
                        'English': { obtained: 75, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Mathematics': { obtained: 82, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'A', remarks: 'Very Good' },
                        'General Science': { obtained: 79, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Urdu': { obtained: 76, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Islamiyat': { obtained: 79, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                    },
                    totalObtained: 391,
                    totalMax: 500,
                    percentage: 78.2,
                    grade: 'B',
                    isComplete: true,
                    isPassed: true,
                    statusLabel: 'PASSED',
                    failedSubjectsCount: 0,
                    subjectsEvaluatedCount: 5,
                    totalSubjectsCount: 5,
                    hasAnyAbsent: false,
                    position: 6
                },
                {
                    studentId: 'demo_7',
                    name: 'Omar Farooq',
                    rollNumber: '07',
                    fatherName: 'Farooq Azam',
                    photoUrl: null,
                    attendance: '79 / 90 Days (87.8%)',
                    subjectMarks: {
                        'English': { obtained: 72, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Mathematics': { obtained: 78, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'General Science': { obtained: 75, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Urdu': { obtained: 74, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Islamiyat': { obtained: 79, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                    },
                    totalObtained: 378,
                    totalMax: 500,
                    percentage: 75.6,
                    grade: 'B',
                    isComplete: true,
                    isPassed: true,
                    statusLabel: 'PASSED',
                    failedSubjectsCount: 0,
                    subjectsEvaluatedCount: 5,
                    totalSubjectsCount: 5,
                    hasAnyAbsent: false,
                    position: 7
                },
                {
                    studentId: 'demo_8',
                    name: 'Usman Ghani',
                    rollNumber: '08',
                    fatherName: 'Ghani Ur Rehman',
                    photoUrl: null,
                    attendance: '77 / 90 Days (85.6%)',
                    subjectMarks: {
                        'English': { obtained: 68, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Mathematics': { obtained: 74, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'General Science': { obtained: 70, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Urdu': { obtained: 72, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Islamiyat': { obtained: 73, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                    },
                    totalObtained: 357,
                    totalMax: 500,
                    percentage: 71.4,
                    grade: 'B',
                    isComplete: true,
                    isPassed: true,
                    statusLabel: 'PASSED',
                    failedSubjectsCount: 0,
                    subjectsEvaluatedCount: 5,
                    totalSubjectsCount: 5,
                    hasAnyAbsent: false,
                    position: 8
                },
                {
                    studentId: 'demo_9',
                    name: 'Amina Tariq',
                    rollNumber: '09',
                    fatherName: 'Tariq Mehmood',
                    photoUrl: null,
                    attendance: '75 / 90 Days (83.3%)',
                    subjectMarks: {
                        'English': { obtained: 65, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Mathematics': { obtained: 70, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'General Science': { obtained: 66, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Urdu': { obtained: 68, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Islamiyat': { obtained: 70, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                    },
                    totalObtained: 339,
                    totalMax: 500,
                    percentage: 67.8,
                    grade: 'B',
                    isComplete: true,
                    isPassed: true,
                    statusLabel: 'PASSED',
                    failedSubjectsCount: 0,
                    subjectsEvaluatedCount: 5,
                    totalSubjectsCount: 5,
                    hasAnyAbsent: false,
                    position: 9
                },
                {
                    studentId: 'demo_10',
                    name: 'Zubair Ahmed',
                    rollNumber: '10',
                    fatherName: 'Ahmed Ali',
                    photoUrl: null,
                    attendance: '73 / 90 Days (81.1%)',
                    subjectMarks: {
                        'English': { obtained: 60, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Mathematics': { obtained: 65, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'General Science': { obtained: 62, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Urdu': { obtained: 64, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'Islamiyat': { obtained: 65, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                    },
                    totalObtained: 316,
                    totalMax: 500,
                    percentage: 63.2,
                    grade: 'C',
                    isComplete: true,
                    isPassed: true,
                    statusLabel: 'PASSED',
                    failedSubjectsCount: 0,
                    subjectsEvaluatedCount: 5,
                    totalSubjectsCount: 5,
                    hasAnyAbsent: false,
                    position: 10
                },
                {
                    studentId: 'demo_11',
                    name: 'Khadija Bibi',
                    rollNumber: '11',
                    fatherName: 'Muhammad Rashid',
                    photoUrl: null,
                    attendance: '70 / 90 Days (77.8%)',
                    subjectMarks: {
                        'English': { obtained: 56, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'C', remarks: 'Satisfactory' },
                        'Mathematics': { obtained: 62, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                        'General Science': { obtained: 58, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'C', remarks: 'Satisfactory' },
                        'Urdu': { obtained: 57, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'C', remarks: 'Satisfactory' },
                        'Islamiyat': { obtained: 60, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'B', remarks: 'Good' },
                    },
                    totalObtained: 293,
                    totalMax: 500,
                    percentage: 58.6,
                    grade: 'C',
                    isComplete: true,
                    isPassed: true,
                    statusLabel: 'PASSED',
                    failedSubjectsCount: 0,
                    subjectsEvaluatedCount: 5,
                    totalSubjectsCount: 5,
                    hasAnyAbsent: false,
                    position: 11
                },
                {
                    studentId: 'demo_12',
                    name: 'Saad Abdullah',
                    rollNumber: '12',
                    fatherName: 'Abdullah Khan',
                    photoUrl: null,
                    attendance: '68 / 90 Days (75.6%)',
                    subjectMarks: {
                        'English': { obtained: 50, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'C', remarks: 'Satisfactory' },
                        'Mathematics': { obtained: 54, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'C', remarks: 'Satisfactory' },
                        'General Science': { obtained: 52, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'C', remarks: 'Satisfactory' },
                        'Urdu': { obtained: 51, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'C', remarks: 'Satisfactory' },
                        'Islamiyat': { obtained: 55, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'C', remarks: 'Satisfactory' },
                    },
                    totalObtained: 262,
                    totalMax: 500,
                    percentage: 52.4,
                    grade: 'D',
                    isComplete: true,
                    isPassed: true,
                    statusLabel: 'PASSED',
                    failedSubjectsCount: 0,
                    subjectsEvaluatedCount: 5,
                    totalSubjectsCount: 5,
                    hasAnyAbsent: false,
                    position: 12
                },
                {
                    studentId: 'demo_13',
                    name: 'Bilal Ahmed',
                    rollNumber: '13',
                    fatherName: 'Farooq Ahmed',
                    photoUrl: null,
                    attendance: '55 / 90 Days (61.1%)',
                    subjectMarks: {
                        'English': { obtained: 42, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'D', remarks: 'Pass' },
                        'Mathematics': { obtained: 20, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'F', remarks: 'Fail' },
                        'General Science': { obtained: 28, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'F', remarks: 'Fail' },
                        'Urdu': { obtained: 25, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'F', remarks: 'Fail' },
                        'Islamiyat': { obtained: 25, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'F', remarks: 'Fail' },
                    },
                    totalObtained: 140,
                    totalMax: 500,
                    percentage: 28.0,
                    grade: 'F',
                    isComplete: true,
                    isPassed: false,
                    statusLabel: 'FAILED',
                    failedSubjectsCount: 4,
                    subjectsEvaluatedCount: 5,
                    totalSubjectsCount: 5,
                    hasAnyAbsent: false,
                    position: 13
                },
                {
                    studentId: 'demo_14',
                    name: 'Ayesha Khan',
                    rollNumber: '14',
                    fatherName: 'Sardar Khan',
                    photoUrl: null,
                    attendance: '50 / 90 Days (55.6%)',
                    subjectMarks: {
                        'English': { obtained: 40, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'D', remarks: 'Pass' },
                        'Mathematics': { obtained: 22, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'F', remarks: 'Fail' },
                        'General Science': { obtained: 24, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'F', remarks: 'Fail' },
                        'Urdu': { obtained: 35, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'E', remarks: 'Pass' },
                        'Islamiyat': { obtained: null, isAbsent: true, totalMarks: 100, passingMarks: 33, grade: 'ABS', remarks: 'Absent' },
                    },
                    totalObtained: 121,
                    totalMax: 500,
                    percentage: 24.2,
                    grade: 'F',
                    isComplete: true,
                    isPassed: false,
                    statusLabel: 'FAILED',
                    failedSubjectsCount: 3,
                    subjectsEvaluatedCount: 4,
                    totalSubjectsCount: 5,
                    hasAnyAbsent: true,
                    position: 14
                },
                {
                    studentId: 'demo_15',
                    name: 'Zainab Bibi',
                    rollNumber: '15',
                    fatherName: 'Muhammad Rashid',
                    photoUrl: null,
                    attendance: '62 / 90 Days (68.9%)',
                    subjectMarks: {
                        'English': { obtained: 28, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'F', remarks: 'Fail' },
                        'Mathematics': { obtained: 25, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'F', remarks: 'Fail' },
                        'General Science': { obtained: 36, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'E', remarks: 'Pass' },
                        'Urdu': { obtained: 34, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'E', remarks: 'Pass' },
                        'Islamiyat': { obtained: 32, isAbsent: false, totalMarks: 100, passingMarks: 33, grade: 'F', remarks: 'Fail' },
                    },
                    totalObtained: 155,
                    totalMax: 500,
                    percentage: 31.0,
                    grade: 'F',
                    isComplete: true,
                    isPassed: false,
                    statusLabel: 'FAILED',
                    failedSubjectsCount: 3,
                    subjectsEvaluatedCount: 5,
                    totalSubjectsCount: 5,
                    hasAnyAbsent: false,
                    position: 15
                }
            ];

            // Apply runtime moderation overrides if present
            const finalizedDemoRows = demoRows.map(row => {
                const override = demoDataOverride[row.studentId];
                if (!override) return row;

                const updatedSubjectMarks = { ...(row.subjectMarks || {}) };
                let totalObtained = 0;
                let totalMax = 0;
                let subjectsEvaluatedCount = 0;
                let failedSubjectsCount = 0;
                let hasAnyAbsent = false;

                demoSubjects.forEach(subj => {
                    const ov = override.subjectMarks?.[subj];
                    if (ov) {
                        const totalMarks = ov.totalMarks || 100;
                        const passMarks = ov.passingMarks || 33;
                        const isAbsent = ov.isAbsent === true;
                        const base = ov.obtained !== '' && ov.obtained !== null ? parseFloat(ov.obtained) : null;
                        const grace = parseFloat(ov.graceMarks) || 0;
                        const effective = base !== null ? base + grace : null;

                        updatedSubjectMarks[subj] = {
                            obtained: effective,
                            baseMarks: base,
                            graceMarks: grace,
                            isAbsent: isAbsent,
                            totalMarks: totalMarks,
                            passingMarks: passMarks,
                            grade: isAbsent ? 'ABS' : effective !== null ? calculateGrade(effective, totalMarks) : '-',
                            remarks: ov.remarks || (grace > 0 ? `+${grace} Grace Marks` : '')
                        };

                        totalMax += totalMarks;
                        if (isAbsent) {
                            hasAnyAbsent = true;
                            failedSubjectsCount++;
                        } else if (effective !== null) {
                            totalObtained += effective;
                            subjectsEvaluatedCount++;
                            if (effective < passMarks) {
                                failedSubjectsCount++;
                            }
                        }
                    } else {
                        const existing = updatedSubjectMarks[subj];
                        if (existing) {
                            totalMax += existing.totalMarks || 100;
                            if (existing.isAbsent) {
                                hasAnyAbsent = true;
                                failedSubjectsCount++;
                            } else if (existing.obtained !== null && existing.obtained !== undefined) {
                                totalObtained += existing.obtained;
                                subjectsEvaluatedCount++;
                                if (existing.obtained < (existing.passingMarks || 33)) {
                                    failedSubjectsCount++;
                                }
                            }
                        }
                    }
                });

                const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
                const isComplete = demoSubjects.length > 0 && subjectsEvaluatedCount === demoSubjects.length;
                let isPassed = isComplete && failedSubjectsCount === 0 && percentage >= 33 && !hasAnyAbsent;

                if (override.moderationOverride === 'pass' || override.moderationOverride === 'conditional_pass') {
                    isPassed = true;
                } else if (override.moderationOverride === 'fail') {
                    isPassed = false;
                }

                let statusLabel = 'PENDING';
                if (override.moderationOverride === 'pass') statusLabel = 'FORCE PASSED';
                else if (override.moderationOverride === 'conditional_pass') statusLabel = 'CONDITIONAL PASS';
                else if (override.moderationOverride === 'fail') statusLabel = 'FAILED';
                else if (subjectsEvaluatedCount === 0) statusLabel = 'NOT_STARTED';
                else if (!isComplete) statusLabel = `INCOMPLETE (${subjectsEvaluatedCount}/${demoSubjects.length})`;
                else if (isPassed) statusLabel = 'PASSED';
                else statusLabel = 'FAILED';

                return {
                    ...row,
                    subjectMarks: updatedSubjectMarks,
                    totalObtained,
                    totalMax,
                    percentage: parseFloat(percentage.toFixed(1)),
                    grade: calculateGrade(totalObtained, totalMax),
                    isComplete,
                    isPassed,
                    statusLabel,
                    failedSubjectsCount,
                    subjectsEvaluatedCount,
                    hasAnyAbsent,
                    moderationOverride: override.moderationOverride,
                    examinerRemarks: override.examinerRemarks
                };
            });

            // Recalculate rank positions
            const ranked = [...finalizedDemoRows].sort((a, b) => b.totalObtained - a.totalObtained);
            const posMap = {};
            ranked.forEach((r, idx) => { posMap[r.studentId] = idx + 1; });
            const finalWithPositions = finalizedDemoRows.map(r => ({ ...r, position: posMap[r.studentId] }));

            const evaluated = finalWithPositions.filter(r => r.subjectsEvaluatedCount > 0);
            const passedCount = evaluated.filter(r => r.isPassed).length;
            const failedCount = evaluated.filter(r => !r.isPassed).length;

            const demoSubjectConfigs = {};
            demoSubjects.forEach(s => {
                demoSubjectConfigs[s] = { totalMarks: 100, passingMarks: 33 };
            });

            return {
                subjects: demoSubjects,
                subjectConfigs: demoSubjectConfigs,
                rows: finalWithPositions,
                stats: {
                    total: finalWithPositions.length,
                    passed: passedCount,
                    failed: failedCount,
                    pending: finalWithPositions.length - evaluated.length,
                    highestPct: evaluated.length > 0 ? Math.max(...evaluated.map(r => r.percentage)) : 0,
                    avgPct: evaluated.length > 0 ? parseFloat((evaluated.reduce((acc, curr) => acc + curr.percentage, 0) / evaluated.length).toFixed(1)) : 0
                }
            };
        }

        if (!selectedExamId || students.length === 0) return { subjects: [], subjectConfigs: {}, rows: [], stats: {} };

        const selectedExamObj = exams.find(e => e.id === selectedExamId);
        const selectedExamTitle = (selectedExamObj?.title || currentExam?.title || '').toLowerCase().trim();
        const cleanSelectedId = (selectedExamId || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        // 1. Filter marks documents for the selected exam (resilient to ID & Title variations)
        const relevantMarksDocs = classMarksDocs.filter(d => {
            const docExamId = (d.examId || '').toString().toLowerCase();
            const docExamTitle = (d.examTitle || '').toString().toLowerCase().trim();
            const cleanDocId = d.id.toLowerCase().replace(/[^a-z0-9]/g, '');

            // Exact match
            if (docExamId === selectedExamId.toLowerCase() || d.id.startsWith(selectedExamId + '_')) return true;

            // Title match
            if (selectedExamTitle && docExamTitle && (selectedExamTitle === docExamTitle || selectedExamTitle.includes(docExamTitle) || docExamTitle.includes(selectedExamTitle))) return true;

            // Normalized slug match (e.g. first_term_2026 vs firsttermexamination2026)
            const cleanDocExamId = docExamId.replace(/[^a-z0-9]/g, '');
            if (cleanDocExamId && cleanSelectedId && (cleanDocExamId === cleanSelectedId || cleanSelectedId.includes(cleanDocExamId) || cleanDocExamId.includes(cleanSelectedId))) return true;

            // Prefix match on document id
            if (cleanSelectedId && cleanDocId.startsWith(cleanSelectedId)) return true;

            // Single exam fallback
            if (exams.length <= 1) return true;

            return false;
        });

        // 2. Discover all subjects for this class (teacher entered + class registered)
        const subjectsSet = new Set();
        const subjectConfigs = {}; // subject -> { totalMarks, passingMarks }

        relevantMarksDocs.forEach(doc => {
            const subjName = (doc.subject || '').trim();
            if (subjName) {
                subjectsSet.add(subjName);
                const teacherTotal = typeof doc.totalMarks === 'number' && doc.totalMarks > 0 ? doc.totalMarks : 100;
                const teacherPass = typeof doc.passingMarks === 'number' && doc.passingMarks > 0 ? doc.passingMarks : 33;
                subjectConfigs[subjName] = {
                    totalMarks: teacherTotal,
                    passingMarks: teacherPass,
                };
            }
        });

        // Also include registered class subjects
        const classSubjs = Array.isArray(currentClass.subjects) ? currentClass.subjects : [];
        classSubjs.forEach(s => {
            const clean = typeof s === 'string' ? s.trim() : (s?.name || '').trim();
            if (clean) {
                subjectsSet.add(clean);
                if (!subjectConfigs[clean]) {
                    subjectConfigs[clean] = {
                        totalMarks: 100,
                        passingMarks: 33
                    };
                }
            }
        });

        const subjectList = Array.from(subjectsSet).sort();

        // 3. Build Student Rows
        const studentRows = students.map(student => {
            const subjectMarks = {};
            let totalObtained = 0;
            let totalMax = 0;
            let subjectsEvaluatedCount = 0;
            let failedSubjectsCount = 0;
            let hasAnyAbsent = false;

            subjectList.forEach(subject => {
                const sConf = subjectConfigs[subject] || { totalMarks: 100, passingMarks: 33 };
                const marksDoc = relevantMarksDocs.find(d => (d.subject || '').trim().toLowerCase() === subject.toLowerCase());
                
                let entryData = null;
                if (marksDoc && marksDoc.marks && marksDoc.marks[student.id]) {
                    entryData = marksDoc.marks[student.id];
                }

                if (entryData) {
                    const isAbsent = entryData.isAbsent === true;
                    const obtained = typeof entryData.obtainedMarks === 'number' ? entryData.obtainedMarks : null;

                    subjectMarks[subject] = {
                        obtained: obtained,
                        isAbsent: isAbsent,
                        totalMarks: sConf.totalMarks,
                        passingMarks: sConf.passingMarks,
                        grade: entryData.grade || (isAbsent ? 'ABS' : obtained !== null ? calculateGrade(obtained, sConf.totalMarks) : '-'),
                        remarks: entryData.remarks || ''
                    };

                    totalMax += sConf.totalMarks;

                    if (isAbsent) {
                        hasAnyAbsent = true;
                        failedSubjectsCount++;
                    } else if (obtained !== null) {
                        totalObtained += obtained;
                        subjectsEvaluatedCount++;
                        if (obtained < sConf.passingMarks) {
                            failedSubjectsCount++;
                        }
                    }
                } else {
                    subjectMarks[subject] = {
                        obtained: null,
                        isAbsent: false,
                        totalMarks: sConf.totalMarks,
                        passingMarks: sConf.passingMarks,
                        grade: '-',
                        remarks: ''
                    };
                    totalMax += sConf.totalMarks;
                }
            });

            // Check for moderation override from live state or Firestore marks docs
            let studentModerationOverride = liveModerationOverrides[student.id]?.moderationOverride || null;
            let studentExaminerRemarks = liveModerationOverrides[student.id]?.examinerRemarks || '';

            if (!studentModerationOverride) {
                relevantMarksDocs.forEach(d => {
                    const entry = d.marks?.[student.id];
                    if (entry?.moderationOverride) {
                        studentModerationOverride = entry.moderationOverride;
                    }
                    if (entry?.examinerRemarks) {
                        studentExaminerRemarks = entry.examinerRemarks;
                    }
                });
            }

            const isForcePass = studentModerationOverride === 'pass' || studentModerationOverride === 'conditional_pass';
            const isForceFail = studentModerationOverride === 'fail';

            const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
            const isComplete = subjectList.length > 0 && subjectsEvaluatedCount === subjectList.length;
            let isPassed = isForcePass || (isComplete && failedSubjectsCount === 0 && percentage >= 33 && !hasAnyAbsent && !isForceFail);
            const overallGrade = calculateGrade(totalObtained, totalMax);

            let statusLabel = 'PENDING';
            if (studentModerationOverride === 'pass') {
                statusLabel = 'FORCE PASSED';
            } else if (studentModerationOverride === 'conditional_pass') {
                statusLabel = 'CONDITIONAL PASS';
            } else if (studentModerationOverride === 'fail') {
                statusLabel = 'FAILED';
            } else if (subjectsEvaluatedCount === 0) {
                statusLabel = 'NOT_STARTED';
            } else if (!isComplete) {
                statusLabel = `INCOMPLETE (${subjectsEvaluatedCount}/${subjectList.length})`;
            } else if (isPassed) {
                statusLabel = 'PASSED';
            } else {
                statusLabel = 'FAILED';
            }

            // Compute dynamic daily attendance from classAttendanceDocs (Daily Teacher Logs)
            let presentDaysCount = 0;
            let absentDaysCount = 0;
            let totalRecordedDays = classAttendanceDocs.length;

            if (totalRecordedDays > 0) {
                classAttendanceDocs.forEach(attDoc => {
                    const rec = attDoc.records?.[student.id] || attDoc.students?.[student.id] || attDoc[student.id];
                    const status = typeof rec === 'string' ? rec.toLowerCase() : rec?.status ? rec.status.toLowerCase() : null;
                    if (status === 'present' || status === 'p') {
                        presentDaysCount++;
                    } else if (status === 'absent' || status === 'a') {
                        absentDaysCount++;
                    }
                });
            }

            let attendanceFormatted = '—';
            let attendancePctValue = 100;

            if (totalRecordedDays > 0) {
                attendancePctValue = Math.round((presentDaysCount / totalRecordedDays) * 100);
                attendanceFormatted = `${presentDaysCount} / ${totalRecordedDays} Days (${attendancePctValue}%)`;
            } else {
                // Fallback to student document fields if daily logs not yet created
                if (typeof student.attendance === 'number') {
                    attendancePctValue = student.attendance;
                    attendanceFormatted = `${student.attendance}%`;
                } else if (typeof student.attendancePercentage === 'number') {
                    attendancePctValue = student.attendancePercentage;
                    attendanceFormatted = `${student.attendancePercentage}%`;
                } else if (typeof student.attendanceScore === 'number') {
                    attendancePctValue = student.attendanceScore;
                    attendanceFormatted = `${student.attendanceScore}%`;
                } else if (student.attendance && typeof student.attendance === 'object') {
                    if (typeof student.attendance.percentage === 'number') {
                        attendancePctValue = student.attendance.percentage;
                        attendanceFormatted = `${student.attendance.percentage}%`;
                    } else if (student.attendance.present !== undefined && student.attendance.total) {
                        attendancePctValue = Math.round((student.attendance.present / student.attendance.total) * 100);
                        attendanceFormatted = `${student.attendance.present} / ${student.attendance.total} Days (${attendancePctValue}%)`;
                    }
                } else if (typeof student.attendance === 'string' && student.attendance.trim()) {
                    attendanceFormatted = student.attendance.includes('%') ? student.attendance : `${student.attendance}%`;
                } else {
                    attendanceFormatted = '0 / 0 Days (100%)';
                }
            }

            return {
                studentId: student.id,
                name: student.name,
                rollNumber: student.rollNumber || 'N/A',
                fatherName: student.fatherName || 'N/A',
                photoUrl: student.photoUrl,
                attendance: attendanceFormatted,
                subjectMarks,
                totalObtained,
                totalMax,
                percentage: parseFloat(percentage.toFixed(1)),
                grade: overallGrade,
                isComplete,
                isPassed,
                statusLabel,
                moderationOverride: studentModerationOverride,
                examinerRemarks: studentExaminerRemarks,
                failedSubjectsCount,
                subjectsEvaluatedCount,
                totalSubjectsCount: subjectList.length,
                hasAnyAbsent,
                position: 0 // calculated in next step
            };
        });

        // 4. Calculate Class Positions (Rank by Total Obtained / Percentage)
        const rankedRows = [...studentRows].sort((a, b) => {
            if (b.totalObtained !== a.totalObtained) return b.totalObtained - a.totalObtained;
            return b.percentage - a.percentage;
        });

        const positionMap = {};
        rankedRows.forEach((row, idx) => {
            positionMap[row.studentId] = idx + 1;
        });

        const finalizedRows = studentRows.map(row => ({
            ...row,
            position: positionMap[row.studentId]
        }));

        // 5. Summary Statistics
        const evaluatedStudents = finalizedRows.filter(r => r.subjectsEvaluatedCount > 0);
        const passedCount = evaluatedStudents.filter(r => r.isPassed).length;
        const failedCount = evaluatedStudents.filter(r => !r.isPassed).length;
        const highestPct = evaluatedStudents.length > 0 ? Math.max(...evaluatedStudents.map(r => r.percentage)) : 0;
        const avgPct = evaluatedStudents.length > 0
            ? evaluatedStudents.reduce((acc, r) => acc + r.percentage, 0) / evaluatedStudents.length
            : 0;

        return {
            subjects: subjectList,
            subjectConfigs,
            rows: finalizedRows,
            stats: {
                totalStudents: students.length,
                evaluatedCount: evaluatedStudents.length,
                passedCount,
                failedCount,
                passingRate: evaluatedStudents.length > 0 ? ((passedCount / evaluatedStudents.length) * 100).toFixed(1) : '0',
                highestPercentage: highestPct.toFixed(1),
                averagePercentage: avgPct.toFixed(1)
            }
        };
    }, [students, classMarksDocs, classAttendanceDocs, selectedExamId, currentExam, currentClass, isDemoMode, demoDataOverride, liveModerationOverrides]);

    // Helper: Grade Calculator
    function calculateGrade(obtained, total) {
        if (obtained === null || total <= 0) return '-';
        const pct = (obtained / total) * 100;
        if (pct >= 80) return 'A+';
        if (pct >= 70) return 'A';
        if (pct >= 60) return 'B';
        if (pct >= 50) return 'C';
        if (pct >= 40) return 'D';
        if (pct >= 33) return 'E';
        return 'F';
    }

    // Helper: Ordinal Suffix (1st, 2nd, 3rd)
    function getOrdinal(n) {
        if (typeof n !== 'number' || isNaN(n)) return n;
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    // --- Filtered Rows for Tabulation Sheet ---
    const filteredRows = useMemo(() => {
        let list = tabulationData.rows || [];

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(r =>
                r.name.toLowerCase().includes(q) ||
                r.rollNumber.toLowerCase().includes(q) ||
                r.fatherName.toLowerCase().includes(q)
            );
        }

        if (filterStatus === 'pass') {
            list = list.filter(r => r.isPassed);
        } else if (filterStatus === 'fail') {
            list = list.filter(r => !r.isPassed && r.subjectsEvaluatedCount > 0);
        } else if (filterStatus === 'top10') {
            list = [...list].filter(r => typeof r.position === 'number').sort((a, b) => a.position - b.position).slice(0, 10);
        }

        // Apply dynamic sorting (Default: Position 1st, 2nd, 3rd on top)
        list = [...list].sort((a, b) => {
            if (sortBy === 'position') {
                const posA = typeof a.position === 'number' ? a.position : 999999;
                const posB = typeof b.position === 'number' ? b.position : 999999;
                if (posA !== posB) return sortOrder === 'asc' ? posA - posB : posB - posA;
                return b.percentage - a.percentage;
            }
            if (sortBy === 'roll') {
                const rollA = parseInt(a.rollNumber) || 999999;
                const rollB = parseInt(b.rollNumber) || 999999;
                if (rollA !== rollB) return sortOrder === 'asc' ? rollA - rollB : rollB - rollA;
                return a.name.localeCompare(b.name);
            }
            if (sortBy === 'obtained') {
                return sortOrder === 'asc' ? a.totalObtained - b.totalObtained : b.totalObtained - a.totalObtained;
            }
            if (sortBy === 'percentage') {
                return sortOrder === 'asc' ? a.percentage - b.percentage : b.percentage - a.percentage;
            }
            if (sortBy === 'name') {
                return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
            }
            return 0;
        });

        return list;
    }, [tabulationData.rows, searchQuery, filterStatus, sortBy, sortOrder]);

    const handleToggleSort = (key) => {
        if (sortBy === key) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(key);
            if (key === 'percentage' || key === 'obtained') {
                setSortOrder('desc');
            } else {
                setSortOrder('asc');
            }
        }
    };

    // --- Actions: Create/Edit Exam ---
    const handleOpenCreateExam = (initialPresetId = 'first_term_2026') => {
        setEditingExam(null);
        const preset = STANDARD_EXAM_PRESETS.find(p => p.id === initialPresetId) || STANDARD_EXAM_PRESETS[0];
        setExamForm({
            presetId: preset.id,
            title: preset.id === 'custom' ? '' : preset.title,
            session: '2025-2026',
            status: preset.status || 'active',
            startDate: new Date().toISOString().split('T')[0],
            endDate: '',
            defaultTotalMarks: 100,
            passingMarks: 33,
            description: preset.id === 'custom' ? 'Custom academic assessment / evaluation test.' : preset.description
        });
        setShowExamModal(true);
    };

    const handlePresetChange = (selectedId) => {
        const preset = STANDARD_EXAM_PRESETS.find(p => p.id === selectedId);
        if (preset) {
            setExamForm(prev => ({
                ...prev,
                presetId: preset.id,
                title: preset.id === 'custom' ? (prev.presetId === 'custom' ? prev.title : '') : preset.title,
                status: preset.status,
                description: preset.description
            }));
        }
    };

    const handleOpenEditExam = (exam) => {
        setEditingExam(exam);
        const matchedPreset = STANDARD_EXAM_PRESETS.find(p => p.id === exam.id || (p.id !== 'custom' && p.title === exam.title));
        setExamForm({
            presetId: matchedPreset ? matchedPreset.id : 'custom',
            title: exam.title || '',
            session: exam.session || '2025-2026',
            status: exam.status || 'active',
            startDate: exam.startDate || '',
            endDate: exam.endDate || '',
            defaultTotalMarks: exam.defaultTotalMarks || 100,
            passingMarks: exam.passingMarks || 33,
            description: exam.description || ''
        });
        setShowExamModal(true);
    };

    const handleSaveExam = async (e) => {
        e.preventDefault();
        const cleanTitle = (examForm.title || '').trim();
        if (!cleanTitle || !schoolId) {
            alert("Please enter a valid examination title.");
            return;
        }

        try {
            const dataToSave = {
                title: cleanTitle,
                session: (examForm.session || '2025-2026').trim(),
                status: examForm.status || 'active',
                startDate: examForm.startDate || null,
                endDate: examForm.endDate || null,
                defaultTotalMarks: parseInt(examForm.defaultTotalMarks) || 100,
                passingMarks: parseInt(examForm.passingMarks) || 33,
                description: (examForm.description || '').trim(),
                updatedAt: serverTimestamp()
            };

            let targetDocId = editingExam ? editingExam.id : '';
            if (!targetDocId) {
                if (examForm.presetId && examForm.presetId !== 'custom') {
                    targetDocId = examForm.presetId;
                } else {
                    const cleanSlug = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').substring(0, 30);
                    targetDocId = cleanSlug ? `exam_${cleanSlug}_${Date.now().toString(36)}` : `exam_${Date.now()}`;
                }
                dataToSave.createdAt = serverTimestamp();
            }

            await setDoc(doc(db, `schools/${schoolId}/exams`, targetDocId), dataToSave, { merge: true });
            setSelectedExamId(targetDocId);
            setShowExamModal(false);
        } catch (err) {
            console.error("Save exam error:", err);
            alert("Failed to save exam: " + err.message);
        }
    };

    const handleDeleteExam = async (examId, title) => {
        if (!window.confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) return;
        try {
            await deleteDoc(doc(db, `schools/${schoolId}/exams`, examId));
            if (selectedExamId === examId) {
                const remaining = exams.filter(e => e.id !== examId);
                setSelectedExamId(remaining.length > 0 ? remaining[0].id : '');
            }
        } catch (err) {
            console.error("Delete exam error:", err);
            alert("Failed to delete: " + err.message);
        }
    };

    // --- Actions: Export CSV ---
    const handleExportCSV = () => {
        if (tabulationData.rows.length === 0) return;

        const headers = ['Roll No', 'Student Name', 'Father Name', ...tabulationData.subjects, 'Total Obtained', 'Max Marks', 'Percentage', 'Grade', 'Position', 'Status'];
        const csvRows = [headers.join(',')];

        tabulationData.rows.forEach(r => {
            const subjectScores = tabulationData.subjects.map(s => {
                const m = r?.subjectMarks?.[s];
                if (!m) return '-';
                if (m.isAbsent) return 'ABS';
                return m.obtained !== null && m.obtained !== undefined ? m.obtained : '-';
            });

            const rowData = [
                `"${r.rollNumber}"`,
                `"${r.name}"`,
                `"${r.fatherName}"`,
                ...subjectScores,
                r.totalObtained,
                r.totalMax,
                `"${r.percentage}%"`,
                `"${r.grade}"`,
                `"${r.position}"`,
                `"${r.isPassed ? 'PASSED' : 'FAILED'}"`
            ];
            csvRows.push(rowData.join(','));
        });

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${currentClass.name}_${currentExam.title}_Gazette.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // =========================================================================
    // ISOLATED IFRAME PRINT ENGINE FOR EXAMS (GAZETTE & RESULT CARDS)
    // =========================================================================
    const printHtmlInIframe = (htmlContent, pageTitle, isLandscape = false) => {
        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'fixed';
        printFrame.style.top = '-10000px';
        printFrame.style.left = '-10000px';
        printFrame.style.width = isLandscape ? '297mm' : '210mm';
        printFrame.style.height = isLandscape ? '210mm' : '297mm';
        printFrame.style.border = 'none';
        document.body.appendChild(printFrame);

        const frameDoc = printFrame.contentWindow.document;
        frameDoc.open();
        frameDoc.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${pageTitle}</title>
                <style>
                    @page {
                        size: A4 ${isLandscape ? 'landscape' : 'portrait'};
                        margin: ${isLandscape ? '8mm' : '10mm'};
                    }
                    * {
                        box-sizing: border-box;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        background: #ffffff !important;
                        color: #0f172a !important;
                        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        width: 100% !important;
                        line-height: 1.4;
                    }
                    .dmc-sheet {
                        width: 100%;
                        min-height: 275mm;
                        box-sizing: border-box;
                        page-break-after: always;
                        break-after: page;
                        display: flex;
                        flex-direction: column;
                        justifyContent: space-between;
                        padding: 2px;
                    }
                    .dmc-sheet:last-child {
                        page-break-after: auto;
                        break-after: auto;
                    }
                    img {
                        max-width: 100%;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                </style>
            </head>
            <body>
                ${htmlContent}
            </body>
            </html>
        `);
        frameDoc.close();

        const triggerPrint = () => {
            try {
                printFrame.contentWindow.focus();
                printFrame.contentWindow.print();
            } catch (e) {
                console.error("Frame print error:", e);
                window.print();
            } finally {
                setTimeout(() => {
                    try { document.body.removeChild(printFrame); } catch(err){}
                }, 5000);
            }
        };

        const checkImagesAndPrint = () => {
            const imgs = frameDoc.images;
            if (!imgs || imgs.length === 0) {
                setTimeout(triggerPrint, 150);
                return;
            }

            let loaded = 0;
            let finished = false;
            const finish = () => {
                if (finished) return;
                finished = true;
                setTimeout(triggerPrint, 150);
            };

            for (let i = 0; i < imgs.length; i++) {
                if (imgs[i].complete) {
                    loaded++;
                } else {
                    imgs[i].onload = () => {
                        loaded++;
                        if (loaded >= imgs.length) finish();
                    };
                    imgs[i].onerror = () => {
                        loaded++;
                        if (loaded >= imgs.length) finish();
                    };
                }
            }

            if (loaded >= imgs.length) {
                finish();
            } else {
                setTimeout(finish, 1500);
            }
        };

        setTimeout(checkImagesAndPrint, 100);
    };

    const renderDmcHtml = (studentRow) => {
        const schoolLogo = logoBase64 || schoolProfile.profileImage || '';
        const isForcePass = studentRow.moderationOverride === 'pass' || studentRow.moderationOverride === 'conditional_pass';
        const isForceFail = studentRow.moderationOverride === 'fail';
        const isPassed = isForcePass || (studentRow.isComplete && studentRow.isPassed && !isForceFail);
        const isPending = !studentRow.isComplete && !isForcePass && !isForceFail;
        const studentPhoto = studentRow.photoUrl || studentRow.photo || studentRow.profileImage || studentRow.studentPhoto || studentRow.profilePic || studentRow.avatar || studentRow.image || '';

        return `
            <div class="dmc-sheet">
                <div style="border: 2.5px double #0f172a; padding: 14px 16px; display: flex; flex-direction: column; justify-content: space-between; min-height: 270mm; box-sizing: border-box;">
                    
                    <!-- Top School Header -->
                    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                        <div style="width: 70px; height: 70px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            ${schoolLogo ? `<img src="${schoolLogo}" alt="Logo" style="max-width: 68px; max-height: 68px; object-fit: contain;" />` : `<div style="width: 60px; height: 60px; border-radius: 50%; border: 2px solid #0f172a; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 18px; color: #0f172a;">${(schoolProfile.name || 'SC').substring(0, 2).toUpperCase()}</div>`}
                        </div>
                        <div style="flex: 1; text-align: center;">
                            <h1 style="margin: 0; font-size: 19px; font-weight: 900; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px;">${schoolProfile.name || 'SMART PUBLIC SCHOOL'}</h1>
                            <p style="margin: 2px 0 0 0; font-size: 10px; color: #475569; font-weight: 600;">${schoolProfile.address || 'Campus Address'} ${schoolProfile.phone ? '• Phone: ' + schoolProfile.phone : ''}</p>
                            <div style="display: inline-block; margin-top: 6px; background: #0f172a; color: #ffffff; padding: 3px 14px; border-radius: 12px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
                                ${currentExam.title || 'Term Examination'} — Detailed Marks Certificate (DMC)
                            </div>
                        </div>
                        <div style="width: 70px; display: flex; justify-content: flex-end; flex-shrink: 0;">
                            ${studentPhoto ? `<img src="${studentPhoto}" alt="Photo" style="width: 60px; height: 70px; object-fit: cover; border: 1px solid #cbd5e1; border-radius: 4px;" />` : `<div style="width: 60px; height: 70px; border: 1px dashed #cbd5e1; border-radius: 4px; background: #f8fafc; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #94a3b8; font-weight: 700; text-align: center;">PHOTO</div>`}
                        </div>
                    </div>

                    <!-- Student Details Strip -->
                    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px;">
                        <div><span style="color: #64748b; font-weight: 700;">Student Name:</span> <strong style="color: #0f172a; text-transform: uppercase;">${studentRow.name || ''}</strong></div>
                        <div><span style="color: #64748b; font-weight: 700;">Class / Section:</span> <strong style="color: #0f172a; text-transform: uppercase;">${currentClass.name || ''}</strong></div>
                        <div><span style="color: #64748b; font-weight: 700;">Father's Name:</span> <strong style="color: #0f172a;">${studentRow.fatherName || 'N/A'}</strong></div>
                        <div><span style="color: #64748b; font-weight: 700;">Roll Number:</span> <strong style="color: #4f46e5;">${studentRow.rollNumber || 'N/A'}</strong></div>
                        <div><span style="color: #64748b; font-weight: 700;">Academic Session:</span> <strong style="color: #0f172a;">${currentExam.session || '2025-2026'}</strong></div>
                        <div><span style="color: #64748b; font-weight: 700;">Date of Issue:</span> <strong style="color: #0f172a;">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>
                    </div>

                    <!-- Subject Marks Table -->
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 12px;">
                        <thead>
                            <tr style="background: #f1f5f9; color: #0f172a; font-weight: 800; border-bottom: 1.5px solid #0f172a;">
                                <th style="border: 1px solid #cbd5e1; padding: 6px; width: 35px; text-align: center;">Sr.</th>
                                <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: left;">Subject Name</th>
                                <th style="border: 1px solid #cbd5e1; padding: 6px; width: 65px; text-align: center;">Total</th>
                                <th style="border: 1px solid #cbd5e1; padding: 6px; width: 65px; text-align: center;">Pass Marks</th>
                                <th style="border: 1px solid #cbd5e1; padding: 6px; width: 75px; text-align: center;">Obtained</th>
                                <th style="border: 1px solid #cbd5e1; padding: 6px; width: 55px; text-align: center;">Grade</th>
                                <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: left;">Remarks</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tabulationData.subjects.map((subj, idx) => {
                                const m = studentRow?.subjectMarks?.[subj];
                                const total = m?.totalMarks || 100;
                                const pass = m?.passingMarks || 33;
                                const obtained = m ? (m.isAbsent ? 'ABS' : (m.obtained !== null && m.obtained !== undefined) ? m.obtained : '-') : '-';
                                const grade = m ? m.grade : '-';
                                const remarks = m?.remarks || (grade === 'A+' ? 'Outstanding' : grade === 'A' ? 'Excellent' : grade === 'B' ? 'Good' : grade === 'F' ? 'Needs Improvement' : 'Satisfactory');
                                return `
                                    <tr>
                                        <td style="border: 1px solid #cbd5e1; padding: 5px; text-align: center; color: #64748b;">${idx + 1}</td>
                                        <td style="border: 1px solid #cbd5e1; padding: 5px; font-weight: 700; color: #0f172a;">${subj}</td>
                                        <td style="border: 1px solid #cbd5e1; padding: 5px; text-align: center;">${total}</td>
                                        <td style="border: 1px solid #cbd5e1; padding: 5px; text-align: center;">${pass}</td>
                                        <td style="border: 1px solid #cbd5e1; padding: 5px; text-align: center; font-weight: 900; color: #0f172a;">${obtained}</td>
                                        <td style="border: 1px solid #cbd5e1; padding: 5px; text-align: center; font-weight: 800;">${grade}</td>
                                        <td style="border: 1px solid #cbd5e1; padding: 5px; font-style: italic; color: #475569; font-size: 10px;">${remarks}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="background: #f8fafc; font-weight: 900; border-top: 1.5px solid #0f172a;">
                                <td colspan="2" style="border: 1px solid #cbd5e1; padding: 6px; text-align: left; text-transform: uppercase;">Grand Total</td>
                                <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${studentRow.totalMax}</td>
                                <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">—</td>
                                <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; color: #4f46e5; font-size: 13px;">${studentRow.totalObtained}</td>
                                <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; color: #4f46e5; font-size: 13px;">${studentRow.grade}</td>
                                <td style="border: 1px solid #cbd5e1; padding: 6px; font-size: 10px; font-weight: 800; color: ${isPending ? '#d97706' : isPassed ? '#059669' : '#e11d48'};">
                                    ${isPending ? 'RESULT PENDING' : (isPassed ? 'PROMOTED / PASSED' : 'FAILED / DETAINED')}
                                </td>
                            </tr>
                        </tfoot>
                    </table>

                    <!-- Summary Metrics Box -->
                    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; display: grid; grid-template-columns: repeat(5, 1fr); text-align: center;">
                        <div style="border-right: 1px solid #e2e8f0; padding: 0 4px;">
                            <div style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase;">Percentage</div>
                            <div style="font-size: 14px; font-weight: 900; color: #0f172a; margin-top: 2px;">${studentRow.percentage}%</div>
                        </div>
                        <div style="border-right: 1px solid #e2e8f0; padding: 0 4px;">
                            <div style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase;">Grade</div>
                            <div style="font-size: 14px; font-weight: 900; color: #4f46e5; margin-top: 2px;">${studentRow.grade}</div>
                        </div>
                        <div style="border-right: 1px solid #e2e8f0; padding: 0 4px;">
                            <div style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase;">Class Position</div>
                            <div style="font-size: 14px; font-weight: 900; color: #059669; margin-top: 2px;">${getOrdinal(studentRow.position)}</div>
                        </div>
                        <div style="border-right: 1px solid #e2e8f0; padding: 0 4px;">
                            <div style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase;">Attendance</div>
                            <div style="font-size: 14px; font-weight: 900; color: #0284c7; margin-top: 2px;">${studentRow.attendance || '95%'}</div>
                        </div>
                        <div style="padding: 0 4px;">
                            <div style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase;">Final Status</div>
                            <div style="font-size: 13px; font-weight: 900; margin-top: 2px; color: ${isPending ? '#d97706' : isPassed ? '#059669' : '#e11d48'};">
                                ${isPending ? 'PENDING' : (isPassed ? 'PASSED' : 'FAILED')}
                            </div>
                        </div>
                    </div>

                    <!-- Grading Scale Legend -->
                    <div style="font-size: 8.5px; color: #64748b; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px 8px; margin-bottom: 25px; text-align: center; background: #ffffff;">
                        <strong>Grading System:</strong> A+ (80% & Above) • A (70% - 79%) • B (60% - 69%) • C (50% - 59%) • D (40% - 49%) • F (Below 40% / Fail)
                    </div>

                    <!-- Official Signatures -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; padding: 0 20px; margin-top: auto; margin-bottom: 8px;">
                        <div style="text-align: center; width: 140px;">
                            <div style="border-top: 1.5px solid #0f172a; padding-top: 4px; font-size: 10px; font-weight: 800; color: #0f172a;">Class Teacher</div>
                        </div>
                        <div style="text-align: center; width: 160px;">
                            <div style="border-top: 1.5px solid #0f172a; padding-top: 4px; font-size: 10px; font-weight: 800; color: #0f172a;">Controller of Exams</div>
                        </div>
                        <div style="text-align: center; width: 160px;">
                            <div style="border-top: 1.5px solid #0f172a; padding-top: 4px; font-size: 10px; font-weight: 800; color: #0f172a;">Principal Stamp & Sign</div>
                        </div>
                    </div>

                    <!-- Footer Note -->
                    <div style="text-align: center; font-size: 7.5px; color: #94a3b8; margin-top: 8px;">
                        Official Academic Record • Valid without alterations • Generated on ${new Date().toLocaleDateString()}
                    </div>
                </div>
            </div>
        `;
    };

    const handlePrintSingleDmc = (studentRow) => {
        if (!studentRow) return;
        const html = renderDmcHtml(studentRow);
        const title = `${(studentRow.name || 'Student').replace(/[^a-zA-Z0-9]/g, '_')}_Roll_${studentRow.rollNumber}_DMC`;
        printHtmlInIframe(html, title, false);
    };

    const handleBatchPrintDmc = () => {
        const selectedRows = selectedStudentIdsForBatch.size > 0 
            ? tabulationData.rows.filter(r => selectedStudentIdsForBatch.has(r.studentId))
            : tabulationData.rows;

        if (selectedRows.length === 0) {
            alert('No student records to print!');
            return;
        }

        const html = selectedRows.map(r => renderDmcHtml(r)).join('');
        const title = `${(currentClass.name || 'Class').replace(/[^a-zA-Z0-9]/g, '_')}_Result_Cards_Batch`;
        printHtmlInIframe(html, title, false);
    };

    const handlePrintTabulation = () => {
        if (!tabulationData.rows || tabulationData.rows.length === 0) {
            alert('No student records to print in Gazette!');
            return;
        }

        const schoolLogo = logoBase64 || schoolProfile.profileImage || '';
        const gazetteTitle = `${(schoolProfile.name || 'School').replace(/[^a-zA-Z0-9]/g, '_')}_${(currentClass.name || 'Class').replace(/[^a-zA-Z0-9]/g, '_')}_Gazette`;

        const html = `
            <div style="padding: 10px; width: 100%;">
                <!-- Header -->
                <div style="border-bottom: 2.5px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between;">
                    <div style="width: 70px; height: 70px; display: flex; align-items: center; justify-content: center;">
                        ${schoolLogo ? `<img src="${schoolLogo}" alt="Logo" style="max-width: 65px; max-height: 65px; object-fit: contain;" />` : `<div style="width: 55px; height: 55px; border-radius: 50%; border: 2px solid #0f172a; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 16px;">${(schoolProfile.name || 'SC').substring(0, 2).toUpperCase()}</div>`}
                    </div>
                    <div style="text-align: center; flex: 1;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: 900; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px;">${schoolProfile.name || 'SMART PUBLIC SCHOOL'}</h1>
                        <p style="margin: 2px 0; font-size: 10px; color: #475569; font-weight: 600;">${schoolProfile.address || 'Campus Address'} ${schoolProfile.phone ? '• Phone: ' + schoolProfile.phone : ''}</p>
                        <h2 style="margin: 6px 0 0 0; font-size: 13px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${currentExam.title || 'Examination'} — OFFICIAL CLASS GAZETTE & TABULATION SHEET
                        </h2>
                        <div style="margin-top: 4px; font-size: 10px; color: #64748b; font-weight: 700;">
                            <span>Class: <strong style="color: #0f172a;">${currentClass.name || 'Class'}</strong></span> • 
                            <span>Session: <strong style="color: #0f172a;">${currentExam.session || '2025-2026'}</strong></span> • 
                            <span>Date of Result: <strong style="color: #0f172a;">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></span>
                        </div>
                    </div>
                    <div style="width: 70px; text-align: right; font-size: 9px; color: #64748b; font-weight: 700;">
                        CONFIDENTIAL
                    </div>
                </div>

                <!-- Gazette Table -->
                <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; margin-bottom: 15px;">
                    <thead>
                        <tr style="background: #f1f5f9; color: #0f172a; font-weight: 800; border-top: 1.5px solid #0f172a; border-bottom: 1.5px solid #0f172a;">
                            <th style="border: 1px solid #cbd5e1; padding: 4px; width: 30px; text-align: center;">Sr.</th>
                            <th style="border: 1px solid #cbd5e1; padding: 4px; width: 45px; text-align: center;">Roll #</th>
                            <th style="border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; min-width: 120px;">Student Name</th>
                            <th style="border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; min-width: 110px;">Father's Name</th>
                            ${tabulationData.subjects.map(s => `<th style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; min-width: 50px;">${s}</th>`).join('')}
                            <th style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; width: 55px; background: #e2e8f0;">Total</th>
                            <th style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; width: 45px;">%</th>
                            <th style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; width: 40px;">Grade</th>
                            <th style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; width: 45px;">Position</th>
                            <th style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; width: 60px;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tabulationData.rows.map((row, idx) => {
                            const isForcePass = row.moderationOverride === 'pass' || row.moderationOverride === 'conditional_pass';
                            const isForceFail = row.moderationOverride === 'fail';
                            const isPassed = isForcePass || (row.isComplete && row.isPassed && !isForceFail);
                            const isPending = !row.isComplete && !isForcePass && !isForceFail;
                            return `
                                <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                                    <td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; color: #64748b;">${idx + 1}</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; font-weight: 800; color: #4f46e5;">${row.rollNumber}</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 4px 6px; font-weight: 700; color: #0f172a; text-transform: uppercase;">${row.name}</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 4px 6px; color: #334155;">${row.fatherName || '—'}</td>
                                    ${tabulationData.subjects.map(s => {
                                        const m = row?.subjectMarks?.[s];
                                        const val = m ? (m.isAbsent ? 'ABS' : (m.obtained !== null && m.obtained !== undefined) ? m.obtained : '—') : '—';
                                        return `<td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; font-weight: 700;">${val}</td>`;
                                    }).join('')}
                                    <td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; font-weight: 900; background: #f1f5f9; color: #0f172a;">${row.totalObtained}/${row.totalMax}</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; font-weight: 800;">${row.percentage}%</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; font-weight: 900; color: #4f46e5;">${row.grade}</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; font-weight: 800; color: #059669;">${getOrdinal(row.position)}</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; font-weight: 900; font-size: 8.5px; color: ${isPending ? '#d97706' : isPassed ? '#059669' : '#e11d48'};">
                                        ${isPending ? 'PENDING' : isPassed ? 'PASSED' : 'FAILED'}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>

                <!-- Summary Statistics Strip -->
                <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 6px 12px; margin-bottom: 25px; display: flex; justify-content: space-around; text-align: center; font-size: 10px;">
                    <div><span style="color: #64748b; font-weight: 700;">Total Students:</span> <strong style="color: #0f172a; font-size: 12px;">${tabulationData.stats.totalStudents || 0}</strong></div>
                    <div><span style="color: #64748b; font-weight: 700;">Total Passed:</span> <strong style="color: #059669; font-size: 12px;">${tabulationData.stats.passedCount || 0}</strong></div>
                    <div><span style="color: #64748b; font-weight: 700;">Total Failed:</span> <strong style="color: #e11d48; font-size: 12px;">${tabulationData.stats.failedCount || 0}</strong></div>
                    <div><span style="color: #64748b; font-weight: 700;">Overall Pass Rate:</span> <strong style="color: #4f46e5; font-size: 12px;">${tabulationData.stats.passingRate || 0}%</strong></div>
                    <div><span style="color: #64748b; font-weight: 700;">Class Highest:</span> <strong style="color: #d97706; font-size: 12px;">${tabulationData.stats.highestPercentage || 0}%</strong></div>
                </div>

                <!-- Signatures -->
                <div style="display: flex; justify-content: space-between; align-items: flex-end; padding: 0 40px; margin-top: 15px;">
                    <div style="text-align: center; width: 180px;">
                        <div style="border-top: 1px solid #334155; padding-top: 4px; font-size: 10px; font-weight: 800; color: #334155;">Tabulator / Exam Incharge</div>
                    </div>
                    <div style="text-align: center; width: 180px;">
                        <div style="border-top: 1px solid #334155; padding-top: 4px; font-size: 10px; font-weight: 800; color: #334155;">Class Incharge</div>
                    </div>
                    <div style="text-align: center; width: 180px;">
                        <div style="border-top: 1px solid #334155; padding-top: 4px; font-size: 10px; font-weight: 800; color: #334155;">Principal Stamp & Sign</div>
                    </div>
                </div>
            </div>
        `;

        printHtmlInIframe(html, gazetteTitle, true);
    };

    // --- Actions: Vector PDF Generation ---
    const generateStudentDmcPdf = async (studentRow, autoSave = true) => {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // 1. Double Border Frame
        doc.setDrawColor(30, 41, 59); // slate-800
        doc.setLineWidth(1.2);
        doc.rect(8, 8, pageWidth - 16, pageHeight - 16);
        doc.setLineWidth(0.4);
        doc.rect(10, 10, pageWidth - 20, pageHeight - 20);

        // 2. School Logo (Top-Left) & Student Photo (Top-Right)
        let activeLogo = logoBase64;
        if (!activeLogo && schoolProfile.profileImage) {
            activeLogo = await fetchImageAsBase64(schoolProfile.profileImage);
        }

        // Student Photo Base64 (Multi-strategy with proxy fallback)
        const photoCandidate = studentRow.photoUrl || studentRow.photo || studentRow.profileImage || studentRow.studentPhoto || studentRow.profilePic || studentRow.avatar || studentRow.image;
        let studentPhotoBase64 = null;
        if (photoCandidate) {
            studentPhotoBase64 = await fetchImageAsBase64(photoCandidate);
        }

        // Render Left: School Logo
        if (activeLogo) {
            try {
                doc.addImage(activeLogo, 'PNG', 14, 13, 22, 22);
            } catch (err) {
                console.warn("Could not render logo in PDF:", err);
            }
        }

        // Render Right: Student Photo
        const photoX = pageWidth - 14 - 20; // 176mm
        const photoY = 13;
        const photoW = 20;
        const photoH = 24;

        if (studentPhotoBase64) {
            try {
                doc.addImage(studentPhotoBase64, 'JPEG', photoX, photoY, photoW, photoH);
                doc.setDrawColor(203, 213, 225);
                doc.setLineWidth(0.3);
                doc.rect(photoX, photoY, photoW, photoH);
            } catch (err) {
                console.warn("Could not render student photo in PDF:", err);
            }
        } else {
            // Elegant Photo Placeholder
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.3);
            doc.roundedRect(photoX, photoY, photoW, photoH, 1, 1, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text('PHOTO', photoX + photoW / 2, photoY + 13, { align: 'center' });
        }

        // Render Center: School Name, Contact & DMC Badge
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(17);
        doc.setTextColor(15, 23, 42);
        doc.text((schoolProfile.name || 'SMART PUBLIC SCHOOL').toUpperCase(), pageWidth / 2, 21, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        const contactInfo = `${schoolProfile.address || 'Campus Address'} ${schoolProfile.phone ? '• Phone: ' + schoolProfile.phone : ''}`;
        doc.text(contactInfo, pageWidth / 2, 27, { align: 'center' });

        // Title Badge
        doc.setFillColor(30, 41, 59);
        doc.roundedRect(pageWidth / 2 - 45, 33, 90, 7, 3, 3, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(255, 255, 255);
        doc.text('DETAILED MARKS CERTIFICATE (DMC)', pageWidth / 2, 38, { align: 'center' });

        // 3. Student Details Box
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.roundedRect(14, 44, pageWidth - 28, 24, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);

        // Row 1
        doc.text('STUDENT NAME:', 18, 51);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text((studentRow.name || '').toUpperCase(), 45, 51);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text('CLASS / SECTION:', 115, 51);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text((currentClass.name || '').toUpperCase(), 148, 51);

        // Row 2
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text("FATHER'S NAME:", 18, 58);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text(studentRow.fatherName || 'N/A', 45, 58);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text('EXAMINATION:', 115, 58);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text(currentExam.title || 'Term Exam', 148, 58);

        // Row 3
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text('ROLL NUMBER:', 18, 65);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(79, 70, 229);
        doc.text(studentRow.rollNumber || 'N/A', 45, 65);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text('ACADEMIC SESSION:', 115, 65);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text(currentExam.session || '2025-2026', 148, 65);

        // 4. Subject-wise Marks Table (autoTable)
        const tableBody = tabulationData.subjects.map((subj, idx) => {
            const m = studentRow?.subjectMarks?.[subj];
            const totalMarks = m?.totalMarks || 100;
            const passMarks = m?.passingMarks || 33;
            const obtained = m ? (m.isAbsent ? 'ABS' : (m.obtained !== null && m.obtained !== undefined) ? m.obtained : '-') : '-';
            const grade = m ? m.grade : '-';
            const remarks = m?.remarks || (grade === 'A+' ? 'Excellent' : grade === 'A' ? 'Very Good' : grade === 'B' ? 'Good' : grade === 'F' ? 'Needs Improvement' : 'Satisfactory');

            return [
                idx + 1,
                subj,
                totalMarks,
                passMarks,
                obtained,
                grade,
                remarks
            ];
        });

        autoTable(doc, {
            startY: 72,
            margin: { left: 14, right: 14 },
            head: [['Sr.', 'Subject Name', 'Total Marks', 'Pass Marks', 'Marks Obtained', 'Grade', 'Remarks']],
            body: tableBody,
            foot: [[
                '—',
                'GRAND TOTAL',
                studentRow.totalMax,
                '—',
                studentRow.totalObtained,
                studentRow.grade,
                !studentRow.isComplete ? 'RESULT PENDING' : (studentRow.isPassed ? 'PROMOTED / PASSED' : 'FAILED / DETAINED')
            ]],
            theme: 'grid',
            styles: {
                fontSize: 8.5,
                cellPadding: 3,
                textColor: [15, 23, 42],
                lineColor: [203, 213, 225],
                lineWidth: 0.2
            },
            headStyles: {
                fillColor: [241, 245, 249],
                textColor: [15, 23, 42],
                fontStyle: 'bold',
                halign: 'center'
            },
            footStyles: {
                fillColor: [241, 245, 249],
                textColor: [15, 23, 42],
                fontStyle: 'bold',
                halign: 'center'
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 10 },
                1: { halign: 'left', fontStyle: 'bold', cellWidth: 42 },
                2: { halign: 'center', cellWidth: 24 },
                3: { halign: 'center', cellWidth: 24 },
                4: { halign: 'center', fontStyle: 'bold', cellWidth: 28 },
                5: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
                6: { halign: 'left', fontStyle: 'italic', cellWidth: 'auto' }
            }
        });

        const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 160;

        // 5. Summary Strip Box
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(14, finalY + 5, pageWidth - 28, 16, 2, 2, 'FD');

        const colWidth = (pageWidth - 28) / 5;
        
        // 1. Percentage
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('PERCENTAGE', 14 + colWidth * 0.5, finalY + 10, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(`${studentRow.percentage}%`, 14 + colWidth * 0.5, finalY + 17, { align: 'center' });

        // 2. Overall Grade
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('OVERALL GRADE', 14 + colWidth * 1.5, finalY + 10, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(79, 70, 229);
        doc.text(`${studentRow.grade}`, 14 + colWidth * 1.5, finalY + 17, { align: 'center' });

        // 3. Class Position
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('CLASS POSITION', 14 + colWidth * 2.5, finalY + 10, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(16, 185, 129);
        doc.text(`${getOrdinal(studentRow.position)}`, 14 + colWidth * 2.5, finalY + 17, { align: 'center' });

        // 4. Attendance Percentage
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('ATTENDANCE', 14 + colWidth * 3.5, finalY + 10, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(`${studentRow.attendance || '95%'}`, 14 + colWidth * 3.5, finalY + 17, { align: 'center' });

        // 5. Final Status
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('RESULT STATUS', 14 + colWidth * 4.5, finalY + 10, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        if (!studentRow.isComplete) {
            doc.setTextColor(217, 119, 6); // amber-600
            doc.text('PENDING', 14 + colWidth * 4.5, finalY + 17, { align: 'center' });
        } else if (studentRow.isPassed) {
            doc.setTextColor(16, 185, 129);
            doc.text('PASSED', 14 + colWidth * 4.5, finalY + 17, { align: 'center' });
        } else {
            doc.setTextColor(225, 29, 72);
            doc.text('FAILED', 14 + colWidth * 4.5, finalY + 17, { align: 'center' });
        }

        // 6. Signatures
        const sigY = pageHeight - 35;
        doc.setDrawColor(71, 85, 105);
        doc.setLineWidth(0.4);

        // Signature line 1: Class Teacher
        doc.line(22, sigY, 65, sigY);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        doc.text('CLASS TEACHER', 43.5, sigY + 5, { align: 'center' });

        // Signature line 2: Controller of Exams
        doc.line(pageWidth / 2 - 22, sigY, pageWidth / 2 + 22, sigY);
        doc.text('CONTROLLER OF EXAMS', pageWidth / 2, sigY + 5, { align: 'center' });

        // Signature line 3: Principal
        doc.line(pageWidth - 65, sigY, pageWidth - 22, sigY);
        doc.text('PRINCIPAL STAMP & SIGN', pageWidth - 43.5, sigY + 5, { align: 'center' });

        // Security Footer
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`Generated securely via School Management System • Date: ${new Date().toLocaleDateString()}`, pageWidth / 2, pageHeight - 14, { align: 'center' });

        if (autoSave) {
            const cleanName = (studentRow.name || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
            doc.save(`${cleanName}_Roll_${studentRow.rollNumber}_DMC.pdf`);
        }
        return doc;
    };

    const handleBatchDownloadPdf = async () => {
        const selectedRows = tabulationData.rows.filter(r => selectedStudentIdsForBatch.has(r.studentId));
        if (selectedRows.length === 0) return;

        setIsDownloadingPdf(true);
        try {
            for (let i = 0; i < selectedRows.length; i++) {
                const student = selectedRows[i];
                generateStudentDmcPdf(student, true);
                if (selectedRows.length > 1) {
                    await new Promise(res => setTimeout(res, 500));
                }
            }
        } catch (err) {
            console.error("Batch download PDF error:", err);
            alert("PDF Download failed: " + err.message);
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    const handleConfirmUploadToParents = async () => {
        const selectedRows = tabulationData.rows.filter(r => selectedStudentIdsForBatch.has(r.studentId));
        if (selectedRows.length === 0 || !schoolId || !selectedExamId || !selectedClassId) return;

        setIsUploadingToParents(true);
        try {
            const batch = writeBatch(db);
            const now = new Date();

            for (const student of selectedRows) {
                const parentId = student.parentDetails?.parentId || student.parentId || student.guardianPhone || '';

                // Result card record payload
                const resultPayload = {
                    examId: selectedExamId,
                    examTitle: currentExam.title,
                    classId: selectedClassId,
                    className: currentClass.name,
                    studentId: student.studentId,
                    studentName: student.name,
                    rollNumber: student.rollNumber,
                    fatherName: student.fatherName,
                    totalObtained: student.totalObtained,
                    totalMax: student.totalMax,
                    percentage: student.percentage,
                    grade: student.grade,
                    position: student.position,
                    attendance: student.attendance,
                    isComplete: student.isComplete,
                    isPassed: student.isPassed,
                    statusLabel: student.statusLabel,
                    subjectMarks: student.subjectMarks,
                    publishedAt: now,
                    updatedAt: now
                };

                // 1. Save to student's results subcollection
                const resultDocRef = doc(db, `schools/${schoolId}/students/${student.studentId}/results`, selectedExamId);
                batch.set(resultDocRef, resultPayload, { merge: true });

                // 2. Also save to class student doc subcollection
                const classStudentResultRef = doc(db, `schools/${schoolId}/classes/${selectedClassId}/students/${student.studentId}/results`, selectedExamId);
                batch.set(classStudentResultRef, resultPayload, { merge: true });

                // 3. Add notification for parent if parentId exists
                if (parentId) {
                    const notifRef = doc(collection(db, `schools/${schoolId}/notifications`));
                    batch.set(notifRef, {
                        parentId: parentId,
                        studentId: student.studentId,
                        studentName: student.name,
                        title: `📄 ${currentExam.title} Result Card`,
                        message: `Result card for ${student.name} (${currentExam.title}) has been published. Total Score: ${student.totalObtained}/${student.totalMax} (${student.percentage}% - Grade ${student.grade}).`,
                        type: 'exam_result',
                        examId: selectedExamId,
                        read: false,
                        createdAt: now
                    });
                }
            }

            await batch.commit();
            setShowUploadToParentsModal(false);
            setUploadSuccessMessage(`Successfully published Result Cards to ${selectedRows.length} parents!`);
            setTimeout(() => setUploadSuccessMessage(null), 5000);
        } catch (err) {
            console.error("Upload to parents error:", err);
            alert("Failed to upload results to parents: " + err.message);
        } finally {
            setIsUploadingToParents(false);
        }
    };

    const handleOpenModerateModal = (studentRow) => {
        if (selectedStudentForModerate?.studentId === studentRow?.studentId) {
            setSelectedStudentForModerate(null);
            return;
        }
        setSelectedStudentForModerate(studentRow);
        const initialMarks = {};
        tabulationData.subjects.forEach(subj => {
            const m = studentRow?.subjectMarks?.[subj];
            initialMarks[subj] = {
                obtained: m && m.obtained !== null && m.obtained !== undefined ? m.obtained : '',
                graceMarks: m?.graceMarks || 0,
                isAbsent: m?.isAbsent === true,
                totalMarks: m?.totalMarks || 100,
                passingMarks: m?.passingMarks || 33,
                remarks: m?.remarks || ''
            };
        });
        setModerateSubjectMarks(initialMarks);
        setModerateStatusOverride(studentRow?.moderationOverride || 'auto');
        setModerateRemarks(studentRow?.examinerRemarks || '');
    };

    const handleSaveModeration = async () => {
        if (!selectedStudentForModerate || !selectedExamId || !selectedClassId) return;

        setIsSavingModeration(true);
        try {
            const studentId = selectedStudentForModerate.studentId;

            if (isDemoMode) {
                // Update in-memory & shared demo override
                const newOverride = {
                    ...demoDataOverride,
                    [studentId]: {
                        subjectMarks: moderateSubjectMarks,
                        moderationOverride: moderateStatusOverride,
                        examinerRemarks: moderateRemarks
                    }
                };
                setDemoDataOverride(newOverride);
                localStorage.setItem('exams_demo_data_override', JSON.stringify(newOverride));
                localStorage.setItem('exams_demo_mode_active', 'true');
                setSelectedStudentForModerate(null);
                setIsEditingMarksInDmc(false);
                setUploadSuccessMessage(`✅ Moderation and Grace Marks saved for ${selectedStudentForModerate.name}!`);
                setTimeout(() => setUploadSuccessMessage(null), 4000);
                setIsSavingModeration(false);
                return;
            }

            // Immediately update live in-memory override for real live students so UI turns Green with 0ms delay!
            setLiveModerationOverrides(prev => ({
                ...prev,
                [studentId]: {
                    moderationOverride: moderateStatusOverride,
                    examinerRemarks: moderateRemarks
                }
            }));

            const batch = writeBatch(db);

            // Update marks in Firestore for each subject
            for (const [subj, data] of Object.entries(moderateSubjectMarks)) {
                const cleanSubj = subj.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const marksDocId = `${selectedExamId}_${selectedClassId}_${cleanSubj}`;
                const marksDocRef = doc(db, `schools/${schoolId}/classes/${selectedClassId}/exam_marks`, marksDocId);

                const numericObtained = data.obtained === '' || data.obtained === null ? null : parseFloat(data.obtained);
                const numericGrace = parseFloat(data.graceMarks) || 0;
                const effectiveMarks = numericObtained !== null ? numericObtained + numericGrace : null;

                const studentEntry = {
                    obtainedMarks: effectiveMarks,
                    baseMarks: numericObtained,
                    graceMarks: numericGrace,
                    isAbsent: data.isAbsent === true,
                    grade: calculateGrade(effectiveMarks || 0, data.totalMarks || 100),
                    remarks: data.remarks || (numericGrace > 0 ? `+${numericGrace} Grace Marks` : ''),
                    moderationOverride: moderateStatusOverride,
                    examinerRemarks: moderateRemarks,
                    moderatedAt: new Date()
                };

                batch.set(marksDocRef, {
                    examId: selectedExamId,
                    examTitle: currentExam?.title || 'Examination',
                    classId: selectedClassId,
                    className: currentClass?.name || 'Class',
                    subject: subj,
                    totalMarks: data.totalMarks || 100,
                    passingMarks: data.passingMarks || 33,
                    marks: {
                        [studentId]: studentEntry
                    },
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }

            await batch.commit();
            setSelectedStudentForModerate(null);
            setIsEditingMarksInDmc(false);
            setUploadSuccessMessage(`✅ Moderation & Grace Marks successfully saved for ${selectedStudentForModerate.name}!`);
            setTimeout(() => setUploadSuccessMessage(null), 5000);
        } catch (err) {
            console.error("Save moderation error:", err);
            alert("Failed to save moderation: " + err.message);
        } finally {
            setIsSavingModeration(false);
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 w-full space-y-6">
            {/* Scoped Print Styles for Clean Page-Breaks */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    /* Hide sidebar, navigation, headers, and UI controls */
                    .sidebar, nav, .no-print, button, input, select, .tab-navigation, header {
                        display: none !important;
                    }
                    body {
                        background: white !important;
                        color: black !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .print-only {
                        display: block !important;
                    }
                    .dmc-card-page {
                        page-break-after: always !important;
                        break-after: page !important;
                        margin: 0 !important;
                        padding: 20px !important;
                        height: 100vh !important;
                        box-sizing: border-box !important;
                    }
                    .gazette-print-table {
                        width: 100% !important;
                        border-collapse: collapse !important;
                        font-size: 10pt !important;
                    }
                    .gazette-print-table th, .gazette-print-table td {
                        border: 1px solid #333 !important;
                        padding: 4px 6px !important;
                    }
                    .gazette-print-table th {
                        background: #f1f5f9 !important;
                        color: #000 !important;
                    }
                }
            `}} />

            {/* --- Top Header & Breadcrumbs --- */}
            <div className="no-print flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                        <Award className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Exams & Result Center</h1>
                            <span className="px-2.5 py-0.5 text-xs font-bold bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
                                {schoolProfile.name}
                            </span>
                        </div>
                        <p className="text-sm font-medium text-slate-500">
                            Schedule terms, examine class gazettes, and generate 1-click printable student report cards
                        </p>
                    </div>
                </div>

                {/* Modern Animated Gradient Tab Switcher */}
                <div className="flex flex-wrap items-center p-1.5 bg-slate-900/5 backdrop-blur-md rounded-2xl border-2 border-slate-200/90 shadow-inner gap-1.5">
                    <button
                        onClick={() => setActiveTab('setup')}
                        className={`flex items-center gap-2.5 px-5 py-2.5 text-xs font-black rounded-xl transition-all duration-300 ${
                            activeTab === 'setup'
                                ? 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-600 text-white shadow-xl shadow-indigo-300/60 scale-[1.03] ring-2 ring-indigo-500/20'
                                : 'text-slate-600 hover:text-indigo-700 hover:bg-white/80'
                        }`}
                    >
                        <div className={`p-1.5 rounded-lg transition-colors ${activeTab === 'setup' ? 'bg-white/20 text-white shadow-inner' : 'bg-slate-200/70 text-slate-500'}`}>
                            <Layers className="w-4 h-4" />
                        </div>
                        <span>Exam Terms</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('gazette')}
                        className={`flex items-center gap-2.5 px-5 py-2.5 text-xs font-black rounded-xl transition-all duration-300 ${
                            activeTab === 'gazette'
                                ? 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-600 text-white shadow-xl shadow-indigo-300/60 scale-[1.03] ring-2 ring-indigo-500/20'
                                : 'text-slate-600 hover:text-indigo-700 hover:bg-white/80'
                        }`}
                    >
                        <div className={`p-1.5 rounded-lg transition-colors ${activeTab === 'gazette' ? 'bg-white/20 text-white shadow-inner' : 'bg-slate-200/70 text-slate-500'}`}>
                            <FileSpreadsheet className="w-4 h-4" />
                        </div>
                        <span>Class Gazette</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('dmc')}
                        className={`flex items-center gap-2.5 px-5 py-2.5 text-xs font-black rounded-xl transition-all duration-300 ${
                            activeTab === 'dmc'
                                ? 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-600 text-white shadow-xl shadow-indigo-300/60 scale-[1.03] ring-2 ring-indigo-500/20'
                                : 'text-slate-600 hover:text-indigo-700 hover:bg-white/80'
                        }`}
                    >
                        <div className={`p-1.5 rounded-lg transition-colors ${activeTab === 'dmc' ? 'bg-white/20 text-white shadow-inner' : 'bg-slate-200/70 text-slate-500'}`}>
                            <Printer className="w-4 h-4" />
                        </div>
                        <span>Result Cards (DMC)</span>
                    </button>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* TAB 1: EXAMS SETUP & SCHEDULING                                          */}
            {/* ========================================================================= */}
            {activeTab === 'setup' && (
                <div className="no-print space-y-6">
                    {/* Action Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Examination Terms & Sessions</h2>
                            <p className="text-xs text-slate-500">Configure academic terms available for marks entry across Teacher Mobile Apps</p>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <button
                                onClick={() => handleOpenCreateExam('custom')}
                                className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-violet-50 hover:bg-violet-100 text-violet-700 font-bold text-xs rounded-xl border border-violet-200 transition-colors shadow-sm"
                                title="Quickly create a custom examination with your own title"
                            >
                                <Sparkles className="w-4 h-4 text-violet-600" />
                                Create Custom Exam
                            </button>
                            <button
                                onClick={() => handleOpenCreateExam()}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-100 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Create New Exam Term
                            </button>
                        </div>
                    </div>

                    {/* Exams Cards Grid */}
                    {exams.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
                            <Award className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                            <h3 className="text-base font-bold text-slate-800">No Exam Terms Created Yet</h3>
                            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                                Create your first examination term (e.g., First Term Examination 2026) so teachers can begin submitting subject marks.
                            </p>
                            <button
                                onClick={handleOpenCreateExam}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-sm"
                            >
                                <Plus className="w-4 h-4" />
                                Add First Exam
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {exams.map(exam => {
                                const isActive = exam.status === 'active';
                                const isUpcoming = exam.status === 'upcoming';
                                return (
                                    <div
                                        key={exam.id}
                                        className={`bg-white rounded-2xl p-6 border transition-all hover:shadow-md ${
                                            isActive ? 'border-indigo-200 ring-2 ring-indigo-500/10' : 'border-slate-200'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-3">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md ${
                                                        isActive
                                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                            : isUpcoming
                                                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                                                    }`}>
                                                        {exam.status || 'Active'}
                                                    </span>
                                                    <span className="text-xs font-semibold text-slate-400">
                                                        Session: {exam.session || 'N/A'}
                                                    </span>
                                                </div>
                                                <h3 className="text-lg font-bold text-slate-800">{exam.title}</h3>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleOpenEditExam(exam)}
                                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    title="Edit Exam"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteExam(exam.id, exam.title)}
                                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                    title="Delete Exam"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {exam.description && (
                                            <p className="text-xs text-slate-500 line-clamp-2 mb-4">
                                                {exam.description}
                                            </p>
                                        )}

                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 mb-4 text-xs">
                                            <div className="flex items-center justify-between text-slate-600">
                                                <span className="text-slate-400 text-[10px] font-bold uppercase">Schedule</span>
                                                <span className="font-semibold">{exam.startDate ? `${exam.startDate} ${exam.endDate ? `to ${exam.endDate}` : ''}` : 'Active Term'}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    setSelectedExamId(exam.id);
                                                    setActiveTab('gazette');
                                                }}
                                                className="flex-1 py-2 text-center text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                                            >
                                                View Class Gazette
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedExamId(exam.id);
                                                    setActiveTab('dmc');
                                                }}
                                                className="flex-1 py-2 text-center text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                            >
                                                Print Result Cards
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: CLASS GAZETTE / TABULATION SHEET                                  */}
            {/* ========================================================================= */}
            {activeTab === 'gazette' && (
                <div className="space-y-6">
                    {/* Control Panel: Class & Exam Selectors */}
                    <div className="no-print bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Exam Term Selector */}
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Select Exam Term</label>
                                    <select
                                        value={selectedExamId}
                                        onChange={(e) => setSelectedExamId(e.target.value)}
                                        className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    >
                                        {exams.map(e => (
                                            <option key={e.id} value={e.id}>{e.title} ({e.session || 'Term'})</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Class Selector */}
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Select Class</label>
                                    <select
                                        value={selectedClassId}
                                        onChange={(e) => setSelectedClassId(e.target.value)}
                                        className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    >
                                        {classes.map(c => (
                                            <option key={c.id} value={c.id}>{c.name || 'Class'}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Export & Print Action Buttons */}
                            <div className="flex items-center gap-2">
                                {isDemoAccount && (
                                    <div className="inline-flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsDemoMode(true);
                                                try { localStorage.setItem('exams_demo_mode_active', 'true'); } catch (_) {}
                                                setSelectedStudentIdsForBatch(new Set());
                                            }}
                                            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer ${
                                                isDemoMode 
                                                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200 ring-2 ring-amber-400/40' 
                                                    : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-md shadow-amber-200'
                                            }`}
                                            title="Inject 15 Comprehensive Demo Students (Top 10, Passed, Failed)"
                                        >
                                            <Sparkles className="w-3.5 h-3.5" />
                                            <span>⚡ Inject Demo Gazette (15 Students)</span>
                                        </button>
                                        {isDemoMode && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsDemoMode(false);
                                                    try { localStorage.removeItem('exams_demo_mode_active'); } catch (_) {}
                                                    setSelectedStudentIdsForBatch(new Set());
                                                }}
                                                className="inline-flex items-center gap-1 px-3 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                                title="Clear Demo Gazette Data"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                <span>Clear Demo</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                                <button
                                    onClick={handleExportCSV}
                                    disabled={tabulationData.rows.length === 0}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
                                >
                                    <Download className="w-4 h-4" />
                                    Export CSV
                                </button>
                                <button
                                    onClick={handlePrintTabulation}
                                    disabled={tabulationData.rows.length === 0}
                                    className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-100 transition-colors disabled:opacity-50"
                                >
                                    <Printer className="w-4 h-4" />
                                    Print Gazette
                                </button>
                            </div>
                        </div>

                        {/* Search & Filter Bar */}
                        <div className="flex flex-col sm:flex-row items-center gap-3 pt-3 border-t border-slate-100">
                            <div className="relative flex-1 w-full">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Search student by name or roll number..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="flex items-center gap-1.5 w-full sm:w-auto">
                                {[
                                    { id: 'all', label: 'All' },
                                    { id: 'pass', label: 'Passed' },
                                    { id: 'fail', label: 'Failed' },
                                    { id: 'top10', label: 'Top 10' }
                                ].map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => setFilterStatus(f.id)}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                                            filterStatus === f.id
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Summary Metric Stats */}
                    <div className="no-print grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Students</span>
                            <span className="text-xl font-black text-slate-800">{tabulationData.stats.totalStudents || 0}</span>
                        </div>
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Evaluated</span>
                            <span className="text-xl font-black text-indigo-600">{tabulationData.stats.evaluatedCount || 0}</span>
                        </div>
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Passed</span>
                            <span className="text-xl font-black text-emerald-600">{tabulationData.stats.passedCount || 0}</span>
                        </div>
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Failed</span>
                            <span className="text-xl font-black text-rose-600">{tabulationData.stats.failedCount || 0}</span>
                        </div>
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Pass Rate</span>
                            <span className="text-xl font-black text-slate-800">{tabulationData.stats.passingRate || 0}%</span>
                        </div>
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Highest Score</span>
                            <span className="text-xl font-black text-amber-500">{tabulationData.stats.highestPercentage || 0}%</span>
                        </div>
                    </div>

                    {/* Print Header for Tabulation Gazette */}
                    <div className="hidden print:block text-center mb-6 pb-4 border-b-2 border-slate-800">
                        <h1 className="text-xl font-black uppercase tracking-wider">{schoolProfile.name}</h1>
                        <p className="text-xs font-semibold">{schoolProfile.address} • Phone: {schoolProfile.phone}</p>
                        <div className="mt-2 inline-block px-4 py-1 bg-slate-100 border border-slate-800 rounded">
                            <h2 className="text-sm font-black uppercase">
                                TABULATION SHEET / GAZETTE • {currentClass.name} • {currentExam.title} ({currentExam.session})
                            </h2>
                        </div>
                    </div>

                    {/* Tabulation Table */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        {loadingData ? (
                            <div className="p-12 text-center text-slate-400">
                                <div className="inline-block animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mb-2" />
                                <p className="text-xs font-bold">Loading examination records...</p>
                            </div>
                        ) : filteredRows.length === 0 ? (
                            <div className="p-12 text-center text-slate-400">
                                <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                <p className="text-sm font-bold text-slate-700">No student records found</p>
                                <p className="text-xs text-slate-400 mt-0.5 mb-4">
                                    Ensure students are enrolled in this class and teachers have submitted marks via their mobile apps.
                                </p>
                                {isDemoAccount && (
                                    <div className="flex justify-center items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsDemoMode(true);
                                                try { localStorage.setItem('exams_demo_mode_active', 'true'); } catch (_) {}
                                                setSelectedStudentIdsForBatch(new Set());
                                            }}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-black rounded-xl shadow-md shadow-amber-200 transition-all cursor-pointer"
                                        >
                                            <Sparkles className="w-4 h-4" />
                                            <span>⚡ Inject Demo Gazette Data (15 Students • Top 10 / Pass / Fail)</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="overflow-x-auto max-h-[calc(100vh-270px)] overflow-y-auto print:max-h-none print:overflow-visible custom-scrollbar relative">
                                <table className="w-full text-left text-xs border-collapse gazette-print-table">
                                    <thead className="sticky top-0 z-20 bg-slate-900 text-white shadow-md border-b-2 border-slate-700 text-[11px] font-extrabold uppercase tracking-wider print:static print:bg-white print:text-black">
                                        <tr className="bg-slate-900 text-white print:bg-white print:text-black">
                                            <th 
                                                onClick={() => handleToggleSort('roll')} 
                                                className="sticky top-0 z-20 bg-slate-900 text-white p-3.5 text-center w-14 cursor-pointer hover:bg-slate-800 transition-colors select-none border-r border-slate-800/80 print:static print:bg-white print:text-black"
                                            >
                                                <div className="flex items-center justify-center gap-1">
                                                    <span>Roll</span>
                                                    {sortBy === 'roll' && (<span className="text-sky-400">{sortOrder === 'asc' ? '▲' : '▼'}</span>)}
                                                </div>
                                            </th>
                                            <th 
                                                onClick={() => handleToggleSort('name')} 
                                                className="sticky top-0 z-20 bg-slate-900 text-white p-3.5 min-w-[140px] cursor-pointer hover:bg-slate-800 transition-colors select-none border-r border-slate-800/80 print:static print:bg-white print:text-black"
                                            >
                                                <div className="flex items-center gap-1">
                                                    <span>Student Name</span>
                                                    {sortBy === 'name' && (<span className="text-sky-400">{sortOrder === 'asc' ? '▲' : '▼'}</span>)}
                                                </div>
                                            </th>
                                            {tabulationData.subjects.map(subj => (
                                                <th key={subj} className="sticky top-0 z-20 bg-slate-900 text-white p-3.5 text-center min-w-[70px] border-r border-slate-800/80 print:static print:bg-white print:text-black">
                                                    <div className="font-extrabold text-white">{subj}</div>
                                                    <div className="text-[9px] font-medium text-slate-400">
                                                        Max: {tabulationData.subjectConfigs?.[subj]?.totalMarks || 100}
                                                    </div>
                                                </th>
                                            ))}
                                            <th 
                                                onClick={() => handleToggleSort('obtained')} 
                                                className="sticky top-0 z-20 bg-slate-900 text-white p-3.5 text-center font-black cursor-pointer hover:bg-slate-800 transition-colors select-none border-r border-slate-800/80 print:static print:bg-white print:text-black"
                                            >
                                                <div className="flex items-center justify-center gap-1">
                                                    <span>Obtained</span>
                                                    {sortBy === 'obtained' && (<span className="text-sky-400">{sortOrder === 'asc' ? '▲' : '▼'}</span>)}
                                                </div>
                                            </th>
                                            <th 
                                                onClick={() => handleToggleSort('percentage')} 
                                                className="sticky top-0 z-20 bg-slate-900 text-white p-3.5 text-center font-black cursor-pointer hover:bg-slate-800 transition-colors select-none border-r border-slate-800/80 print:static print:bg-white print:text-black"
                                            >
                                                <div className="flex items-center justify-center gap-1">
                                                    <span>%</span>
                                                    {sortBy === 'percentage' && (<span className="text-sky-400">{sortOrder === 'asc' ? '▲' : '▼'}</span>)}
                                                </div>
                                            </th>
                                            <th className="sticky top-0 z-20 bg-slate-900 text-white p-3.5 text-center font-black border-r border-slate-800/80 print:static print:bg-white print:text-black">Grade</th>
                                            <th 
                                                onClick={() => handleToggleSort('position')} 
                                                className="sticky top-0 z-20 bg-slate-800 text-sky-300 p-3.5 text-center font-black cursor-pointer hover:bg-slate-700 transition-colors select-none border-r border-slate-700 print:static print:bg-white print:text-black"
                                                title="Click to toggle 1st, 2nd, 3rd positions ascending / descending"
                                            >
                                                <div className="flex items-center justify-center gap-1">
                                                    <span>Pos</span>
                                                    {sortBy === 'position' && (<span className="text-sky-400">{sortOrder === 'asc' ? '▲ (1st)' : '▼'}</span>)}
                                                </div>
                                            </th>
                                            <th className="sticky top-0 z-20 bg-slate-900 text-white p-3.5 text-center font-black print:static print:bg-white print:text-black">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                                        {filteredRows.map((row, idx) => (
                                            <tr key={row.studentId} className="group hover:bg-indigo-100 transition-all duration-150">
                                                <td className="p-3.5 text-center font-bold text-indigo-700 bg-indigo-50/40 group-hover:bg-indigo-200/80 border-l-4 border-transparent group-hover:border-indigo-600 transition-all">
                                                    {row.rollNumber}
                                                </td>
                                                <td className="p-3.5">
                                                    <div className="font-bold text-slate-900 group-hover:text-indigo-950 transition-colors">{row.name}</div>
                                                    <div className="text-[10px] text-slate-400 font-normal">S/O: {row.fatherName}</div>
                                                </td>

                                                {tabulationData.subjects.map(subj => {
                                                    const m = row?.subjectMarks?.[subj];
                                                    if (!m || m.obtained === null || m.obtained === undefined) {
                                                        return (
                                                            <td key={subj} className="p-3.5 text-center text-slate-300">
                                                                {m?.isAbsent ? <span className="text-rose-500 font-bold">ABS</span> : '-'}
                                                            </td>
                                                        );
                                                    }
                                                    const isFail = m.obtained < (m.passingMarks || 33);
                                                    return (
                                                        <td key={subj} className="p-3.5 text-center font-bold">
                                                            <span className={isFail ? 'text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded' : 'text-slate-800'}>
                                                                {m.obtained}
                                                            </span>
                                                        </td>
                                                    );
                                                })}

                                                <td className="p-3.5 text-center font-black text-slate-900 bg-slate-50/50 group-hover:bg-indigo-200/70 transition-colors">
                                                    {row.totalObtained} <span className="text-[10px] font-normal text-slate-400">/ {row.totalMax}</span>
                                                </td>
                                                <td className="p-3.5 text-center font-black text-slate-800">
                                                    {row.percentage}%
                                                </td>
                                                <td className="p-3.5 text-center">
                                                    <span className={`px-2 py-0.5 rounded font-black text-[11px] ${
                                                        row.grade === 'A+' ? 'bg-emerald-100 text-emerald-800' :
                                                        row.grade === 'A' ? 'bg-emerald-50 text-emerald-700' :
                                                        row.grade === 'B' ? 'bg-blue-50 text-blue-700' :
                                                        row.grade === 'C' ? 'bg-amber-50 text-amber-700' :
                                                        row.grade === 'F' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                                                    }`}>
                                                        {row.grade}
                                                    </span>
                                                </td>
                                                <td className="p-3.5 text-center font-black text-indigo-700">
                                                    {getOrdinal(row.position)}
                                                </td>
                                                <td className="p-3.5 text-center">
                                                    {row.subjectsEvaluatedCount === 0 ? (
                                                        <span className="text-slate-400 font-semibold text-[10px]">Pending</span>
                                                    ) : !row.isComplete ? (
                                                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-black text-[10px]" title={`${row.subjectsEvaluatedCount}/${tabulationData.subjects.length} Subjects entered`}>
                                                            PENDING ({row.subjectsEvaluatedCount}/{tabulationData.subjects.length})
                                                        </span>
                                                    ) : row.isPassed ? (
                                                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">PASS</span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-black text-[10px]">FAIL</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: 1-CLICK PRINTABLE RESULT CARDS (DMC)                               */}
            {/* ========================================================================= */}
            {activeTab === 'dmc' && (
                <div className="space-y-6">
                    {/* Control Panel */}
                    <div className="no-print bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Exam Term</label>
                                <select
                                    value={selectedExamId}
                                    onChange={(e) => setSelectedExamId(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:outline-none"
                                >
                                    {exams.map(e => (
                                        <option key={e.id} value={e.id}>{e.title}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Class</label>
                                <select
                                    value={selectedClassId}
                                    onChange={(e) => setSelectedClassId(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:outline-none"
                                >
                                    {classes.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            {isDemoAccount && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const next = !isDemoMode;
                                        setIsDemoMode(next);
                                        try { localStorage.setItem('exams_demo_mode_active', String(next)); } catch (_) {}
                                        setSelectedStudentIdsForBatch(new Set());
                                    }}
                                    className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer ${
                                        isDemoMode 
                                            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200 ring-2 ring-amber-400/40' 
                                            : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-md shadow-amber-200'
                                    }`}
                                    title="Toggle 15 Demo Students for Result Card Printing"
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>{isDemoMode ? 'Exit Demo Data' : '⚡ Try Demo Data (15 Students)'}</span>
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    const allIds = isDemoMode 
                                        ? ['demo_1', 'demo_2', 'demo_3', 'demo_4', 'demo_5', 'demo_6', 'demo_7', 'demo_8', 'demo_9', 'demo_10', 'demo_11', 'demo_12', 'demo_13', 'demo_14', 'demo_15'] 
                                        : students.map(s => s.id);
                                    if (selectedStudentIdsForBatch.size > 0) {
                                        setSelectedStudentIdsForBatch(new Set());
                                    } else {
                                        setSelectedStudentIdsForBatch(new Set(allIds));
                                    }
                                }}
                                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black rounded-xl transition-colors border border-slate-200"
                            >
                                {selectedStudentIdsForBatch.size > 0 ? `Deselect All (${selectedStudentIdsForBatch.size})` : `Select All (${isDemoMode ? 15 : students.length})`}
                            </button>
                            <button
                                onClick={() => setShowUploadToParentsModal(true)}
                                disabled={selectedStudentIdsForBatch.size === 0 || isUploadingToParents}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-black rounded-xl shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transition-all disabled:opacity-50"
                            >
                                <UploadCloud className="w-4 h-4 text-indigo-200" />
                                Upload to Parents ({selectedStudentIdsForBatch.size})
                            </button>
                            <button
                                onClick={handleBatchPrintDmc}
                                disabled={tabulationData.rows.length === 0}
                                className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50"
                                title="Print all selected student DMC cards on A4 portrait"
                            >
                                <Printer className="w-4 h-4" />
                                {selectedStudentIdsForBatch.size > 0 ? `Print Cards (${selectedStudentIdsForBatch.size})` : `Print All Cards (${tabulationData.rows.length})`}
                            </button>
                            <button
                                onClick={handleBatchDownloadPdf}
                                disabled={selectedStudentIdsForBatch.size === 0 || isDownloadingPdf}
                                className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200 transition-colors disabled:opacity-50"
                            >
                                <Download className="w-4 h-4 text-emerald-600" />
                                {isDownloadingPdf ? 'Generating...' : `PDF (${selectedStudentIdsForBatch.size})`}
                            </button>
                        </div>
                    </div>

                    {/* Real-Time Search & Status Filter Bar */}
                    <div className="no-print bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        {/* Search Input */}
                        <div className="relative flex-1 max-w-md">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={dmcSearchQuery}
                                onChange={(e) => setDmcSearchQuery(e.target.value)}
                                placeholder="Search by student name, roll number, or father..."
                                className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all placeholder:text-slate-400"
                            />
                            {dmcSearchQuery && (
                                <button
                                    onClick={() => setDmcSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-black text-xs"
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {/* Status Filter Buttons */}
                        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200">
                            <button
                                onClick={() => setDmcStatusFilter('all')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                                    dmcStatusFilter === 'all'
                                        ? 'bg-white text-slate-800 shadow-sm border border-slate-200/60'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                All ({tabulationData.rows.length})
                            </button>
                            <button
                                onClick={() => setDmcStatusFilter('pass')}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                                    dmcStatusFilter === 'pass'
                                        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
                                        : 'text-emerald-700 hover:bg-emerald-50'
                                }`}
                            >
                                <span>🟢</span> Pass ({tabulationData.rows.filter(r => (r.moderationOverride === 'pass' || r.moderationOverride === 'conditional_pass') || (r.isComplete && r.isPassed && r.moderationOverride !== 'fail')).length})
                            </button>
                            <button
                                onClick={() => setDmcStatusFilter('fail')}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                                    dmcStatusFilter === 'fail'
                                        ? 'bg-rose-600 text-white shadow-sm shadow-rose-200'
                                        : 'text-rose-700 hover:bg-rose-50'
                                }`}
                            >
                                <span>🔴</span> Fail ({tabulationData.rows.filter(r => r.moderationOverride === 'fail' || (r.isComplete && !r.isPassed && r.moderationOverride !== 'pass' && r.moderationOverride !== 'conditional_pass')).length})
                            </button>
                            <button
                                onClick={() => setDmcStatusFilter('pending')}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                                    dmcStatusFilter === 'pending'
                                        ? 'bg-amber-500 text-white shadow-sm shadow-amber-200'
                                        : 'text-amber-700 hover:bg-amber-50'
                                }`}
                            >
                                <span>🟡</span> Pending ({tabulationData.rows.filter(r => !r.isComplete && !r.moderationOverride).length})
                            </button>
                        </div>
                    </div>

                    {isDemoMode && (
                        <div className="no-print p-4 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-2xl text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-amber-200/50 animate-fadeIn">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                                    <Sparkles className="w-5 h-5 text-amber-100" />
                                </div>
                                <div>
                                    <div className="font-black text-sm">💡 Sample Demo Mode Active</div>
                                    <p className="text-xs text-amber-100 font-medium">
                                        Showing 6 realistic sample students: <strong>3 Passed (🟢 Green Cards)</strong>, <strong>2 Failed (🔴 Red Cards)</strong>, and <strong>1 Incomplete (🟡 Orange Card)</strong>. Click "Preview Card", "PDF", or "Upload to Parents" to test!
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsDemoMode(false)}
                                className="px-4 py-2 bg-white text-amber-900 font-black text-xs rounded-xl shadow-sm hover:bg-amber-50 transition-colors flex-shrink-0"
                            >
                                Switch to Live Data
                            </button>
                        </div>
                    )}

                    {uploadSuccessMessage && (
                        <div className="no-print p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-800 text-xs font-bold animate-fadeIn">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>{uploadSuccessMessage}</span>
                            </div>
                            <button onClick={() => setUploadSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-900 font-black">✕</button>
                        </div>
                    )}

                    {/* Interactive Student Card Grid (Screen Preview) */}
                    {(() => {
                        const filteredRows = tabulationData.rows.filter(studentRow => {
                            const isForcePass = studentRow.moderationOverride === 'pass' || studentRow.moderationOverride === 'conditional_pass';
                            const isForceFail = studentRow.moderationOverride === 'fail';
                            const isPass = isForcePass || (studentRow.isComplete && studentRow.isPassed && !isForceFail);
                            const isPending = !studentRow.isComplete && !isForcePass && !isForceFail;
                            const isFail = !isPass && !isPending;

                            if (dmcStatusFilter === 'pass' && !isPass) return false;
                            if (dmcStatusFilter === 'fail' && !isFail) return false;
                            if (dmcStatusFilter === 'pending' && !isPending) return false;

                            if (dmcSearchQuery.trim()) {
                                const q = dmcSearchQuery.trim().toLowerCase();
                                const nameMatch = (studentRow.name || '').toLowerCase().includes(q);
                                const rollMatch = String(studentRow.rollNumber || '').toLowerCase().includes(q);
                                const fatherMatch = (studentRow.fatherName || '').toLowerCase().includes(q);
                                if (!nameMatch && !rollMatch && !fatherMatch) return false;
                            }

                            return true;
                        });

                        if (filteredRows.length === 0) {
                            return (
                                <div className="no-print bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3 shadow-sm">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                                        <Search className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-base font-black text-slate-800">No Students Found</h3>
                                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                                        {dmcSearchQuery ? `No student matched "${dmcSearchQuery}" in selected filter.` : 'No students match the current filter.'}
                                    </p>
                                    <button
                                        onClick={() => {
                                            setDmcSearchQuery('');
                                            setDmcStatusFilter('all');
                                        }}
                                        className="px-4 py-2 bg-indigo-50 text-indigo-700 text-xs font-black rounded-xl hover:bg-indigo-100 transition-colors"
                                    >
                                        Clear Filter & Show All
                                    </button>
                                </div>
                            );
                        }

                        return (
                            <div className="no-print grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredRows.map(studentRow => {
                                    const isSelected = selectedStudentIdsForBatch.has(studentRow.studentId);
                                    const isPreviewing = selectedStudentForDmc?.studentId === studentRow.studentId;
                                    const isEditingThisStudent = isPreviewing && isEditingMarksInDmc;
                                    const isForcePass = studentRow.moderationOverride === 'pass' || studentRow.moderationOverride === 'conditional_pass';
                                    const isForceFail = studentRow.moderationOverride === 'fail';

                                    // Force Pass makes the card solid 🟢 Green!
                                    const isPass = isForcePass || (studentRow.isComplete && studentRow.isPassed && !isForceFail);
                                    const isPending = !studentRow.isComplete && !isForcePass && !isForceFail;
                                    const isFail = !isPass && !isPending;

                                    const card3dContainer = isPending
                                        ? 'bg-gradient-to-b from-amber-50 via-amber-100/50 to-amber-100/90 border-t-2 border-t-amber-200 border-x border-x-amber-300 border-b-4 border-b-amber-400 text-slate-900 shadow-[0_12px_24px_-6px_rgba(217,119,6,0.25)] hover:shadow-[0_18px_32px_-6px_rgba(217,119,6,0.35)]'
                                        : isPass
                                            ? 'bg-gradient-to-b from-emerald-600 via-emerald-700 to-emerald-800 border-t-2 border-t-emerald-400 border-x border-x-emerald-500 border-b-4 border-b-emerald-950 text-white shadow-[0_12px_28px_-6px_rgba(6,78,59,0.5),0_6px_10px_-4px_rgba(6,78,59,0.3)] hover:shadow-[0_20px_36px_-8px_rgba(6,78,59,0.65)]'
                                            : 'bg-gradient-to-b from-rose-600 via-rose-700 to-rose-800 border-t-2 border-t-rose-400 border-x border-x-rose-500 border-b-4 border-b-rose-950 text-white shadow-[0_12px_28px_-6px_rgba(159,18,57,0.5),0_6px_10px_-4px_rgba(159,18,57,0.3)] hover:shadow-[0_20px_36px_-8px_rgba(159,18,57,0.65)]';

                                    const roll3dBg = isPending
                                        ? 'bg-amber-200/90 text-amber-950 border-t border-t-white border-b-2 border-b-amber-400 shadow-inner'
                                        : 'bg-black/30 text-white border-t border-t-white/30 border-b-2 border-b-black/50 shadow-inner';

                                    const status3dPill = isPending
                                        ? 'bg-amber-200 text-amber-950 font-black border border-amber-300 shadow-sm'
                                        : isPass
                                            ? 'bg-white text-emerald-900 font-black border border-white shadow-md'
                                            : 'bg-white text-rose-900 font-black border border-white shadow-md';

                                    const statsGrid3dBg = isPending
                                        ? 'bg-white/90 border border-amber-200/90 shadow-inner text-slate-900'
                                        : isPass
                                            ? 'bg-emerald-950/50 border-t border-t-white/20 border-b border-b-black/40 text-white shadow-inner'
                                            : 'bg-rose-950/50 border-t border-t-white/20 border-b border-b-black/40 text-white shadow-inner';

                                    const labelColor = isPending
                                        ? 'text-slate-500 font-bold'
                                        : isPass
                                            ? 'text-emerald-200 font-bold'
                                            : 'text-rose-200 font-bold';

                                    const subTextColor = isPending ? 'text-slate-600 font-semibold' : isPass ? 'text-emerald-100 font-semibold' : 'text-rose-100 font-semibold';

                                    return (
                                        <div
                                            key={studentRow.studentId}
                                            className={`rounded-3xl p-5.5 transition-all duration-300 hover:-translate-y-1.5 cursor-pointer select-none ${card3dContainer} ${
                                                isSelected ? 'ring-4 ring-indigo-400/80 scale-[1.02]' : isEditingThisStudent ? 'ring-4 ring-amber-400 shadow-2xl scale-[1.01]' : isPreviewing ? 'ring-4 ring-slate-800 shadow-2xl scale-[1.01]' : 'opacity-100'
                                            }`}
                                            onClick={() => {
                                                const next = new Set(selectedStudentIdsForBatch);
                                                if (next.has(studentRow.studentId)) next.delete(studentRow.studentId);
                                                else next.add(studentRow.studentId);
                                                setSelectedStudentIdsForBatch(next);
                                            }}
                                        >
                                            {/* Card Top Row: Roll Badge, Student Name, Status */}
                                            <div className="flex items-start justify-between gap-3 mb-4">
                                                <div className="flex items-center gap-3.5">
                                                    <div className={`w-12 h-12 rounded-2xl font-black flex items-center justify-center text-base sm:text-lg shrink-0 ${roll3dBg}`}>
                                                        {studentRow.rollNumber}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h4 className="font-black text-base sm:text-[17px] tracking-tight drop-shadow-sm leading-snug">
                                                                {studentRow.name}
                                                            </h4>
                                                            <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-xl ${status3dPill}`}>
                                                                {isForcePass ? (studentRow.moderationOverride === 'conditional_pass' ? 'Conditional Pass' : 'Trial Pass') : isPending ? 'Pending' : isPass ? 'Pass' : 'Fail'}
                                                            </span>
                                                        </div>
                                                        <p className={`text-xs sm:text-[13px] mt-0.5 ${subTextColor}`}>
                                                            S/O {studentRow.fatherName}
                                                        </p>
                                                    </div>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {}} // Handled by card container click
                                                    className="w-5 h-5 rounded-lg text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0 mt-1"
                                                />
                                            </div>

                                            {/* Embossed 3D Stats Grid: Obtained, Grade, Position, Attendance */}
                                            <div className={`grid grid-cols-4 gap-2 p-3 rounded-2xl text-center mb-4 ${statsGrid3dBg}`}>
                                                <div>
                                                    <span className={`text-[10px] sm:text-[11px] block uppercase tracking-wider mb-0.5 ${labelColor}`}>Obtained</span>
                                                    <span className={`font-black text-sm sm:text-base tracking-tight block ${isPending ? 'text-slate-900' : 'text-white'}`}>
                                                        {studentRow.totalObtained} / {studentRow.totalMax}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className={`text-[10px] sm:text-[11px] block uppercase tracking-wider mb-0.5 ${labelColor}`}>Grade</span>
                                                    <span className={`font-black text-sm sm:text-base block ${isPending ? 'text-indigo-700 font-black' : 'text-white'}`}>
                                                        {studentRow.grade}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className={`text-[10px] sm:text-[11px] block uppercase tracking-wider mb-0.5 ${labelColor}`}>Position</span>
                                                    <span className={`font-black text-sm sm:text-base block ${isPending ? 'text-emerald-700 font-black' : 'text-amber-300'}`}>
                                                        {getOrdinal(studentRow.position)}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className={`text-[10px] sm:text-[11px] block uppercase tracking-wider mb-0.5 ${labelColor}`}>Attendance</span>
                                                    <span className={`font-black text-xs sm:text-[13px] block truncate ${isPending ? 'text-blue-700 font-black' : 'text-sky-200'}`} title={studentRow.attendance}>
                                                        {studentRow.attendance || '—'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* 3D Beveled Action Buttons: Unified Preview + PDF */}
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (isPreviewing) {
                                                            setSelectedStudentForDmc(null);
                                                            setIsEditingMarksInDmc(false);
                                                            setSelectedStudentForModerate(null);
                                                        } else {
                                                            setSelectedStudentForDmc(studentRow);
                                                            setIsEditingMarksInDmc(false);
                                                        }
                                                    }}
                                                    className={`flex-1 py-2.5 px-3 text-center text-xs sm:text-sm font-black rounded-xl transition-all border-b-3 active:translate-y-0.5 shadow-md ${
                                                        isPreviewing
                                                            ? 'text-white bg-slate-800 hover:bg-slate-900 border-b-black ring-2 ring-slate-400'
                                                            : isPending
                                                                ? 'text-indigo-700 bg-white hover:bg-indigo-50 border-b-slate-300 border-x border-t border-slate-200'
                                                                : isPass
                                                                    ? 'bg-white text-emerald-950 hover:bg-emerald-50 border-b-emerald-900 border-x border-t border-white'
                                                                    : 'bg-white text-rose-950 hover:bg-rose-50 border-b-rose-900 border-x border-t border-white'
                                                    }`}
                                                >
                                                    {isPreviewing ? 'Close Preview' : 'Preview'}
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        generateStudentDmcPdf(studentRow, true);
                                                    }}
                                                    className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-black rounded-xl transition-all border-b-3 active:translate-y-0.5 shadow-md ${
                                                        isPending
                                                            ? 'text-emerald-900 bg-emerald-100 hover:bg-emerald-200 border-b-emerald-400'
                                                            : isPass
                                                                ? 'bg-emerald-900 hover:bg-emerald-950 text-white border-b-black/60 border-t border-t-emerald-700'
                                                                : 'bg-rose-900 hover:bg-rose-950 text-white border-b-black/60 border-t border-t-rose-700'
                                                    }`}
                                                    title="Download PDF Result Card"
                                                >
                                                    <Download className="w-4 h-4" />
                                                    PDF
                                                </button>
                                            </div>

                                            {/* ================================================================= */}
                                            {/* UNIFIED INLINE DMC RESULT CERTIFICATE (VIEW & EDIT MODE)          */}
                                            {/* ================================================================= */}
                                            {isPreviewing && (() => {
                                                // Live calculations when in Editing mode
                                                let liveTotalObtained = 0;
                                                let liveTotalMax = 0;
                                                let subjectsCount = tabulationData.subjects.length;
                                                let evaluatedCount = 0;
                                                let failedCount = 0;
                                                let hasAbsent = false;
                                                let totalGraceApplied = 0;

                                                if (isEditingThisStudent) {
                                                    tabulationData.subjects.forEach(subj => {
                                                        const data = moderateSubjectMarks?.[subj] || {};
                                                        const max = data.totalMarks || 100;
                                                        const pass = data.passingMarks || 33;
                                                        liveTotalMax += max;

                                                        if (data.isAbsent) {
                                                            hasAbsent = true;
                                                            failedCount++;
                                                        } else {
                                                            const base = data.obtained === '' || data.obtained === null || data.obtained === undefined ? null : parseFloat(data.obtained);
                                                            const grace = parseFloat(data.graceMarks) || 0;
                                                            totalGraceApplied += grace;

                                                            if (base !== null && !isNaN(base)) {
                                                                const effective = base + grace;
                                                                liveTotalObtained += effective;
                                                                evaluatedCount++;
                                                                if (effective < pass) {
                                                                    failedCount++;
                                                                }
                                                            }
                                                        }
                                                    });
                                                }

                                                const livePercentage = liveTotalMax > 0 ? (liveTotalObtained / liveTotalMax) * 100 : 0;
                                                const isComplete = subjectsCount > 0 && evaluatedCount === subjectsCount;
                                                let isPassCalc = isComplete && failedCount === 0 && livePercentage >= 33 && !hasAbsent;

                                                if (moderateStatusOverride === 'pass' || moderateStatusOverride === 'conditional_pass') {
                                                    isPassCalc = true;
                                                } else if (moderateStatusOverride === 'fail') {
                                                    isPassCalc = false;
                                                }

                                                 const liveGrade = calculateGrade(liveTotalObtained, liveTotalMax);
                                                const activeSchoolLogo = logoBase64 || schoolProfile?.profileImage || schoolProfile?.logo || schoolProfile?.logoUrl || schoolProfile?.schoolLogo || schoolProfile?.photoUrl || schoolProfile?.image || '';
                                                const activeStudentPhoto = studentRow?.photoUrl || studentRow?.photo || studentRow?.profileImage || studentRow?.studentPhoto || studentRow?.profilePic || studentRow?.avatar || studentRow?.image || '';

                                                return (
                                                    <div
                                                        onClick={(e) => e.stopPropagation()}
                                                        className={`mt-4 bg-white text-slate-800 rounded-2xl shadow-2xl border-4 border-double ${
                                                            isEditingThisStudent ? 'border-amber-500 ring-2 ring-amber-300' : 'border-slate-800'
                                                        } overflow-hidden cursor-default select-text animate-fadeIn`}
                                                    >
                                                        {/* Top Control Bar with Quick Actions */}
                                                        <div className={`p-3 text-white flex flex-wrap items-center justify-between gap-2 border-b-2 ${
                                                            isEditingThisStudent ? 'bg-gradient-to-r from-amber-700 via-amber-800 to-amber-900 border-amber-950' : 'bg-slate-900 border-slate-800'
                                                        }`}>
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                {isEditingThisStudent ? (
                                                                    <>
                                                                        <Scale className="w-4 h-4 text-amber-300 shrink-0" />
                                                                        <span className="font-black text-xs text-amber-100 truncate">
                                                                            Editing Marks & Grace — {studentRow.name} (#{studentRow.rollNumber})
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Award className="w-4 h-4 text-indigo-400 shrink-0" />
                                                                        <span className="font-bold text-xs truncate">
                                                                            Preview: {studentRow.name} (#{studentRow.rollNumber})
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>

                                                            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                                                                {isEditingThisStudent ? (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setIsEditingMarksInDmc(false);
                                                                                setSelectedStudentForModerate(null);
                                                                            }}
                                                                            disabled={isSavingModeration}
                                                                            className="px-2.5 py-1 text-slate-200 hover:text-white hover:bg-white/10 rounded-lg font-bold transition-colors text-xs"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={handleSaveModeration}
                                                                            disabled={isSavingModeration}
                                                                            className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-lg font-black text-xs shadow-md transition-all disabled:opacity-50"
                                                                        >
                                                                            {isSavingModeration ? (
                                                                                <>Saving...</>
                                                                            ) : (
                                                                                <>
                                                                                    <Check className="w-3.5 h-3.5" />
                                                                                    Save & Update
                                                                                </>
                                                                            )}
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => generateStudentDmcPdf(studentRow, true)}
                                                                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg shadow-sm transition-colors"
                                                                            title="Download PDF Result Card"
                                                                        >
                                                                            <Download className="w-3.5 h-3.5" />
                                                                            PDF
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handlePrintSingleDmc(studentRow)}
                                                                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg shadow-sm transition-colors"
                                                                            title="Print Single DMC Card"
                                                                        >
                                                                            <Printer className="w-3.5 h-3.5" />
                                                                            Print
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                handleOpenModerateModal(studentRow);
                                                                                setIsEditingMarksInDmc(true);
                                                                            }}
                                                                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-amber-950 text-[11px] font-black rounded-lg shadow-sm transition-all border border-amber-600/30"
                                                                            title="Edit Marks, Grace & Promotion Status"
                                                                        >
                                                                            <Scale className="w-3.5 h-3.5" />
                                                                            Edit Marks / Grace
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setSelectedStudentForDmc(null);
                                                                                setIsEditingMarksInDmc(false);
                                                                                setSelectedStudentForModerate(null);
                                                                            }}
                                                                            className="w-6 h-6 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center font-bold text-xs transition-colors ml-1"
                                                                            title="Close Preview"
                                                                        >
                                                                            ✕
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Certificate Content */}
                                                        <div className="p-4 sm:p-5 bg-white">
                                                            {/* School Header */}
                                                            <div className="flex items-center justify-between border-b-2 border-slate-800 pb-3 mb-4">
                                                                <div className="w-14 shrink-0 flex items-center justify-start">
                                                                    {activeSchoolLogo ? (
                                                                        <img
                                                                            src={activeSchoolLogo}
                                                                            alt="School Logo"
                                                                            className="w-12 h-12 object-contain drop-shadow-sm"
                                                                            onError={(e) => {
                                                                                if (schoolProfile?.profileImage && e.target.src !== schoolProfile.profileImage) {
                                                                                    e.target.src = schoolProfile.profileImage;
                                                                                }
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <div className="w-12 h-12 rounded-full border border-slate-800 flex items-center justify-center font-black text-xs text-slate-800">
                                                                            {(schoolProfile?.name || 'SC').substring(0, 2).toUpperCase()}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="text-center flex-1 px-2 min-w-0">
                                                                    <h2 className="text-sm sm:text-base font-black uppercase text-slate-900 tracking-tight truncate leading-tight">
                                                                        {schoolProfile?.name || 'School Name'}
                                                                    </h2>
                                                                    <p className="text-[10px] text-slate-500 font-semibold truncate leading-tight mt-0.5">
                                                                        {schoolProfile?.address || ''}
                                                                    </p>
                                                                    <span className="inline-block mt-1 px-2.5 py-0.5 bg-slate-900 text-white text-[9px] sm:text-[10px] font-black uppercase rounded-full">
                                                                        {currentExam?.title || 'Exam'} Result Certificate
                                                                    </span>
                                                                </div>
                                                                <div className="w-14 text-right shrink-0">
                                                                    {activeStudentPhoto ? (
                                                                        <img src={activeStudentPhoto} alt="Student" className="w-11 h-13 object-cover border border-slate-300 rounded shadow-sm ml-auto" />
                                                                    ) : (
                                                                        <div className="w-11 h-13 border border-slate-300 rounded bg-slate-50 flex items-center justify-center text-[8px] text-slate-400 text-center ml-auto font-bold uppercase">
                                                                            Photo
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Student Meta Details */}
                                                            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl mb-3 border border-slate-200">
                                                                <div><span className="font-bold text-slate-500">Student:</span> <span className="font-black text-slate-900">{studentRow.name}</span></div>
                                                                <div><span className="font-bold text-slate-500">Class:</span> <span className="font-bold text-slate-800">{currentClass?.name}</span></div>
                                                                <div><span className="font-bold text-slate-500">Father:</span> <span className="font-bold text-slate-800">{studentRow.fatherName}</span></div>
                                                                <div><span className="font-bold text-slate-500">Roll No:</span> <span className="font-black text-slate-900">{studentRow.rollNumber}</span></div>
                                                            </div>

                                                            {/* Marks Table: Dynamic Edit or Static View */}
                                                            <div className="overflow-x-auto mb-3">
                                                                <table className="w-full text-xs border-collapse border border-slate-300 text-center min-w-[340px]">
                                                                    <thead>
                                                                        <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                                                                            <th className="border border-slate-300 p-1.5 text-left">Subject</th>
                                                                            <th className="border border-slate-300 p-1.5 w-12 sm:w-14">Total</th>
                                                                            {isEditingThisStudent ? (
                                                                                <>
                                                                                    <th className="border border-slate-300 p-1.5 w-16">Obtained</th>
                                                                                    <th className="border border-slate-300 p-1.5 w-14">Grace (+)</th>
                                                                                    <th className="border border-slate-300 p-1.5 w-12">Abs</th>
                                                                                    <th className="border border-slate-300 p-1.5 w-14">Effective</th>
                                                                                    <th className="border border-slate-300 p-1.5 text-left">Remarks</th>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <th className="border border-slate-300 p-1.5 w-14">Obt</th>
                                                                                    <th className="border border-slate-300 p-1.5 w-12">Grade</th>
                                                                                    <th className="border border-slate-300 p-1.5 text-left">Remarks</th>
                                                                                </>
                                                                            )}
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {tabulationData.subjects.map(subj => {
                                                                            if (isEditingThisStudent) {
                                                                                const entry = moderateSubjectMarks?.[subj] || { obtained: '', graceMarks: 0, isAbsent: false, totalMarks: 100, passingMarks: 33, remarks: '' };
                                                                                const baseVal = entry.obtained === '' || entry.obtained === null ? null : parseFloat(entry.obtained);
                                                                                const graceVal = parseFloat(entry.graceMarks) || 0;
                                                                                const effective = baseVal !== null && !isNaN(baseVal) ? baseVal + graceVal : null;
                                                                                const isSubjFail = entry.isAbsent || (effective !== null && effective < (entry.passingMarks || 33));

                                                                                return (
                                                                                    <tr key={subj} className="hover:bg-amber-50/50">
                                                                                        <td className="border border-slate-300 p-1.5 text-left font-bold">
                                                                                            <span>{subj}</span>
                                                                                            <span className="text-[9px] text-slate-400 font-normal block">Pass: {entry.passingMarks || 33}</span>
                                                                                        </td>
                                                                                        <td className="border border-slate-300 p-1.5 text-slate-600 font-semibold">{entry.totalMarks || 100}</td>
                                                                                        <td className="border border-slate-300 p-1">
                                                                                            <input
                                                                                                type="number"
                                                                                                disabled={entry.isAbsent}
                                                                                                value={entry.obtained}
                                                                                                placeholder="—"
                                                                                                onChange={(e) => {
                                                                                                    const val = e.target.value;
                                                                                                    setModerateSubjectMarks(prev => ({
                                                                                                        ...prev,
                                                                                                        [subj]: { ...(prev?.[subj] || {}), obtained: val }
                                                                                                    }));
                                                                                                }}
                                                                                                className="w-14 p-1 text-center font-bold text-xs bg-white border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:opacity-40"
                                                                                            />
                                                                                        </td>
                                                                                        <td className="border border-slate-300 p-1">
                                                                                            <input
                                                                                                type="number"
                                                                                                disabled={entry.isAbsent || entry.obtained === ''}
                                                                                                value={entry.graceMarks || ''}
                                                                                                placeholder="+0"
                                                                                                onChange={(e) => {
                                                                                                    const val = e.target.value;
                                                                                                    setModerateSubjectMarks(prev => ({
                                                                                                        ...prev,
                                                                                                        [subj]: { ...(prev?.[subj] || {}), graceMarks: val }
                                                                                                    }));
                                                                                                }}
                                                                                                className="w-12 p-1 text-center font-bold text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded focus:ring-1 focus:ring-amber-500 focus:outline-none disabled:opacity-40"
                                                                                            />
                                                                                        </td>
                                                                                        <td className="border border-slate-300 p-1">
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={entry.isAbsent === true}
                                                                                                onChange={(e) => {
                                                                                                    setModerateSubjectMarks(prev => ({
                                                                                                        ...prev,
                                                                                                        [subj]: { ...(prev?.[subj] || {}), isAbsent: e.target.checked }
                                                                                                    }));
                                                                                                }}
                                                                                                className="w-3.5 h-3.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                                                                                                title="Mark Absent"
                                                                                            />
                                                                                        </td>
                                                                                        <td className="border border-slate-300 p-1.5 font-black">
                                                                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-black ${
                                                                                                entry.isAbsent ? 'bg-slate-200 text-slate-600' :
                                                                                                effective === null ? 'bg-slate-100 text-slate-400' :
                                                                                                isSubjFail ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                                                                                            }`}>
                                                                                                {entry.isAbsent ? 'ABS' : effective !== null ? `${effective}${graceVal > 0 ? '*' : ''}` : '—'}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="border border-slate-300 p-1 text-left">
                                                                                            <input
                                                                                                type="text"
                                                                                                value={entry.remarks || ''}
                                                                                                placeholder="Remarks"
                                                                                                onChange={(e) => {
                                                                                                    const val = e.target.value;
                                                                                                    setModerateSubjectMarks(prev => ({
                                                                                                        ...prev,
                                                                                                        [subj]: { ...(prev?.[subj] || {}), remarks: val }
                                                                                                    }));
                                                                                                }}
                                                                                                className="w-full p-1 text-xs text-slate-700 bg-white border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                                                                            />
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            } else {
                                                                                const m = studentRow?.subjectMarks?.[subj];
                                                                                const obtained = m ? (m.isAbsent ? 'ABS' : (m.obtained !== null && m.obtained !== undefined) ? m.obtained : '-') : '-';
                                                                                return (
                                                                                    <tr key={subj} className="hover:bg-slate-50">
                                                                                        <td className="border border-slate-300 p-1.5 text-left font-bold">{subj}</td>
                                                                                        <td className="border border-slate-300 p-1.5 text-slate-600">{m?.totalMarks || 100}</td>
                                                                                        <td className="border border-slate-300 p-1.5 font-black">{obtained}</td>
                                                                                        <td className="border border-slate-300 p-1.5 font-black">{m?.grade || '-'}</td>
                                                                                        <td className="border border-slate-300 p-1.5 text-left text-[10px] text-slate-500 italic">{m?.remarks || 'Satisfactory'}</td>
                                                                                    </tr>
                                                                                );
                                                                            }
                                                                        })}
                                                                    </tbody>
                                                                    <tfoot>
                                                                        <tr className="bg-slate-100 font-black border-t border-slate-300">
                                                                            <td className="border border-slate-300 p-1.5 text-left">Total Marks</td>
                                                                            <td className="border border-slate-300 p-1.5">
                                                                                {isEditingThisStudent ? liveTotalMax : studentRow.totalMax}
                                                                            </td>
                                                                            {isEditingThisStudent ? (
                                                                                <>
                                                                                    <td colSpan={3} className="border border-slate-300 p-1.5 text-indigo-700">
                                                                                        {liveTotalObtained} {totalGraceApplied > 0 && <span className="text-amber-600 text-[10px] font-bold">(+{totalGraceApplied} Grace)</span>}
                                                                                    </td>
                                                                                    <td className="border border-slate-300 p-1.5 text-indigo-700">{liveGrade}</td>
                                                                                    <td className="border border-slate-300 p-1.5 text-left text-[10px]">
                                                                                        {!isComplete ? 'PENDING' : isPassCalc ? 'PASSED / PROMOTED' : 'FAILED / DETAINED'}
                                                                                    </td>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <td className="border border-slate-300 p-1.5 text-indigo-700">{studentRow.totalObtained}</td>
                                                                                    <td className="border border-slate-300 p-1.5 text-indigo-700">{studentRow.grade}</td>
                                                                                    <td className="border border-slate-300 p-1.5 text-left text-[10px]">
                                                                                        {!studentRow.isComplete ? 'RESULT PENDING' : (studentRow.isPassed ? 'PROMOTED / PASSED' : 'FAILED / DETAINED')}
                                                                                    </td>
                                                                                </>
                                                                            )}
                                                                        </tr>
                                                                    </tfoot>
                                                                </table>
                                                            </div>

                                                            {/* If in edit mode, show Promotion Override Selector & Examiner Remarks */}
                                                            {isEditingThisStudent && (
                                                                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl mb-3 space-y-2">
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                        <div>
                                                                            <label className="block text-[10px] font-black text-slate-700 uppercase mb-1">
                                                                                Promotion Decision Override
                                                                            </label>
                                                                            <select
                                                                                value={moderateStatusOverride}
                                                                                onChange={(e) => setModerateStatusOverride(e.target.value)}
                                                                                className="w-full p-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                                                                            >
                                                                                <option value="auto">⚡ Automatic (Formula Decision)</option>
                                                                                <option value="pass">🟢 Force Pass / Promoted on Trial</option>
                                                                                <option value="conditional_pass">🟡 Conditional Pass / Re-appear</option>
                                                                                <option value="fail">🔴 Force Retain / Fail</option>
                                                                            </select>
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] font-black text-slate-700 uppercase mb-1">
                                                                                Official DMC Note / Remark
                                                                            </label>
                                                                            <input
                                                                                type="text"
                                                                                placeholder="e.g. Awarded grace marks in Math. Promoted on trial."
                                                                                value={moderateRemarks}
                                                                                onChange={(e) => setModerateRemarks(e.target.value)}
                                                                                className="w-full p-1.5 bg-white border border-amber-300 rounded-lg text-xs font-medium text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    {/* Bottom Action Footer for convenience */}
                                                                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-200/60">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setIsEditingMarksInDmc(false);
                                                                                setSelectedStudentForModerate(null);
                                                                            }}
                                                                            disabled={isSavingModeration}
                                                                            className="px-3 py-1.5 text-slate-600 hover:bg-white rounded-lg font-bold text-xs transition-colors"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={handleSaveModeration}
                                                                            disabled={isSavingModeration}
                                                                            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black text-xs shadow-md transition-all disabled:opacity-50"
                                                                        >
                                                                            {isSavingModeration ? (
                                                                                <>Saving...</>
                                                                            ) : (
                                                                                <>
                                                                                    <Check className="w-3.5 h-3.5" />
                                                                                    Save & Update
                                                                                </>
                                                                            )}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Performance Summary Grid */}
                                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs bg-slate-50 p-2 rounded-xl border border-slate-200">
                                                                <div className="p-1">
                                                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Percentage</span>
                                                                    <span className="font-black text-xs sm:text-sm text-slate-800">
                                                                        {isEditingThisStudent ? `${livePercentage.toFixed(1)}%` : `${studentRow.percentage}%`}
                                                                    </span>
                                                                </div>
                                                                <div className="p-1">
                                                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Position</span>
                                                                    <span className="font-black text-xs sm:text-sm text-emerald-600">{getOrdinal(studentRow.position)}</span>
                                                                </div>
                                                                <div className="p-1">
                                                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Attendance</span>
                                                                    <span className="font-black text-xs sm:text-sm text-blue-600 truncate">{studentRow.attendance || '95%'}</span>
                                                                </div>
                                                                <div className="p-1">
                                                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Result</span>
                                                                    {isEditingThisStudent ? (
                                                                        <span className={`font-black text-xs sm:text-sm ${!isComplete ? 'text-amber-600' : (isPassCalc ? 'text-emerald-700' : 'text-rose-700')}`}>
                                                                            {!isComplete ? 'PENDING' : (isPassCalc ? 'PASSED' : 'FAILED')}
                                                                        </span>
                                                                    ) : (
                                                                        <span className={`font-black text-xs sm:text-sm ${!studentRow.isComplete ? 'text-amber-600' : (studentRow.isPassed ? 'text-emerald-700' : 'text-rose-700')}`}>
                                                                            {!studentRow.isComplete ? 'PENDING' : (studentRow.isPassed ? 'PASSED' : 'FAILED')}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}

                    {/* ========================================================================= */}
                    {/* BATCH PRINT CONTAINER (Visible only in Print Mode or Preview)             */}
                    {/* ========================================================================= */}
                    <div className="hidden print:block">
                        {tabulationData.rows
                            .filter(r => selectedStudentIdsForBatch.has(r.studentId))
                            .map((studentRow, idx) => (
                                <div key={studentRow.studentId} className="dmc-card-page">
                                    <div className="p-8 rounded-2xl h-full flex flex-col justify-between relative bg-white border-4 border-double border-slate-800">
                                        {/* Corner Decorative Badges */}
                                        <div className="absolute top-2 left-2 text-[10px] font-bold text-slate-400 tracking-widest uppercase">
                                            Official Student Assessment Report
                                        </div>
                                        <div className="absolute top-2 right-2 text-[10px] font-bold text-slate-400">
                                            Roll: #{studentRow.rollNumber}
                                        </div>

                                        {/* 1. School Header */}
                                        <div>
                                            <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4 mb-4">
                                                    <div className="w-20 h-20 flex items-center justify-center">
                                                        {schoolProfile.profileImage ? (
                                                            <img src={schoolProfile.profileImage} alt="Logo" className="max-h-20 max-w-20 object-contain" />
                                                        ) : (
                                                            <div className="w-16 h-16 rounded-full border-2 border-slate-800 flex items-center justify-center font-black text-xl text-slate-800">
                                                                {schoolProfile.name.substring(0, 2).toUpperCase()}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex-1 text-center px-4">
                                                        <h1 className="text-2xl font-black tracking-wider uppercase text-slate-900">
                                                            {schoolProfile.name}
                                                        </h1>
                                                        <p className="text-xs font-semibold text-slate-600">
                                                            {schoolProfile.address || 'Campus Address'} • Contact: {schoolProfile.phone || 'Phone'}
                                                        </p>
                                                        <div className="mt-2 inline-block px-5 py-1 bg-slate-900 text-white rounded-full">
                                                            <h2 className="text-xs font-black uppercase tracking-widest">
                                                                DETAILED MARKS CERTIFICATE (DMC)
                                                            </h2>
                                                        </div>
                                                    </div>

                                                    <div className="w-20 text-right">
                                                        {studentRow.photoUrl ? (
                                                            <img src={studentRow.photoUrl} alt="Student" className="w-16 h-20 object-cover border border-slate-300 rounded shadow-sm ml-auto" />
                                                        ) : (
                                                            <div className="w-16 h-20 border border-slate-300 rounded bg-slate-50 flex items-center justify-center text-[10px] text-slate-400 text-center ml-auto font-bold uppercase">
                                                                Student Photo
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                        {/* 2. Student Information Table */}
                                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200 mb-5">
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Student Name:</span> <span className="font-black text-slate-900 text-sm ml-1">{studentRow.name}</span></div>
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Class / Section:</span> <span className="font-black text-slate-900 ml-1">{currentClass.name}</span></div>
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Father's Name:</span> <span className="font-semibold text-slate-800 ml-1">{studentRow.fatherName}</span></div>
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Examination:</span> <span className="font-bold text-slate-800 ml-1">{currentExam.title}</span></div>
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Roll Number:</span> <span className="font-black text-slate-900 ml-1">{studentRow.rollNumber}</span></div>
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Academic Session:</span> <span className="font-bold text-slate-800 ml-1">{currentExam.session || '2025-2026'}</span></div>
                                        </div>

                                            {/* 3. Subject-wise Marks Table */}
                                            <table className="w-full text-xs border-collapse border border-slate-400 mb-6">
                                                <thead>
                                                    <tr className="bg-slate-100 text-slate-800 text-[11px] font-black uppercase text-center border-b border-slate-400">
                                                        <th className="border border-slate-400 p-2 w-12">Sr.</th>
                                                        <th className="border border-slate-400 p-2 text-left">Subject</th>
                                                        <th className="border border-slate-400 p-2 w-20">Total Marks</th>
                                                        <th className="border border-slate-400 p-2 w-20">Pass Marks</th>
                                                        <th className="border border-slate-400 p-2 w-24">Marks Obtained</th>
                                                        <th className="border border-slate-400 p-2 w-16">Grade</th>
                                                        <th className="border border-slate-400 p-2 text-left">Remarks</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {tabulationData.subjects.map((subj, sIdx) => {
                                                        const m = studentRow?.subjectMarks?.[subj];
                                                        const obtained = m ? (m.isAbsent ? 'ABS' : (m.obtained !== null && m.obtained !== undefined) ? m.obtained : '-') : '-';
                                                        const grade = m ? m.grade : '-';
                                                        const isFail = m && m.obtained !== null && m.obtained !== undefined && m.obtained < (m.passingMarks || 33);

                                                        return (
                                                            <tr key={subj} className="text-center font-medium">
                                                                <td className="border border-slate-400 p-2 text-slate-500">{sIdx + 1}</td>
                                                                <td className="border border-slate-400 p-2 text-left font-bold text-slate-900">{subj}</td>
                                                                <td className="border border-slate-400 p-2 font-semibold">{m?.totalMarks || 100}</td>
                                                                <td className="border border-slate-400 p-2 font-semibold">{m?.passingMarks || 33}</td>
                                                                <td className={`border border-slate-400 p-2 font-black text-sm ${isFail ? 'text-rose-600' : 'text-slate-900'}`}>
                                                                    {obtained}
                                                                </td>
                                                                <td className="border border-slate-400 p-2 font-black">{grade}</td>
                                                                <td className="border border-slate-400 p-2 text-left text-[11px] text-slate-600 italic">
                                                                    {m?.remarks || (grade === 'A+' ? 'Excellent' : grade === 'A' ? 'Very Good' : grade === 'B' ? 'Good' : grade === 'F' ? 'Needs Improvement' : 'Satisfactory')}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="bg-slate-100 font-black text-sm text-center border-t-2 border-slate-800">
                                                        <td colSpan={2} className="border border-slate-400 p-2 text-left uppercase">Grand Total</td>
                                                        <td className="border border-slate-400 p-2">{studentRow.totalMax}</td>
                                                        <td className="border border-slate-400 p-2">-</td>
                                                        <td className="border border-slate-400 p-2 text-indigo-900 text-base">{studentRow.totalObtained}</td>
                                                        <td className="border border-slate-400 p-2 text-indigo-900">{studentRow.grade}</td>
                                                        <td className="border border-slate-400 p-2 text-left text-xs font-bold">
                                                            {!studentRow.isComplete ? 'RESULT PENDING' : (studentRow.isPassed ? 'PROMOTED / PASSED' : 'FAILED / DETAINED')}
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            </table>

                                            {/* 4. Performance Summary Strip */}
                                            <div className="grid grid-cols-5 gap-3 p-3 bg-slate-50 border border-slate-300 rounded-lg text-center text-xs mb-6">
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Percentage</span>
                                                    <span className="text-base font-black text-slate-900">{studentRow.percentage}%</span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Overall Grade</span>
                                                    <span className="text-base font-black text-indigo-700">{studentRow.grade}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Class Position</span>
                                                    <span className="text-base font-black text-emerald-700">{getOrdinal(studentRow.position)}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Attendance</span>
                                                    <span className="text-base font-black text-blue-700">{studentRow.attendance || '95%'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Result Status</span>
                                                    <span className={`text-sm font-black uppercase ${
                                                        !studentRow.isComplete ? 'text-amber-600' :
                                                        studentRow.isPassed ? 'text-emerald-700' : 'text-rose-700'
                                                    }`}>
                                                        {!studentRow.isComplete ? 'PENDING' : (studentRow.isPassed ? 'PASSED' : 'FAILED')}
                                                    </span>
                                                </div>
                                            </div>

                                        {/* 5. Signatures and Stamp */}
                                        <div className="pt-8 border-t border-slate-300 mt-auto">
                                            <div className="grid grid-cols-3 gap-8 text-center text-xs">
                                                <div>
                                                    <div className="border-b border-slate-800 pb-1 mb-1.5 mx-4 font-bold text-slate-800">
                                                        {currentClass.classTeacherName || 'Class Incharge'}
                                                    </div>
                                                    <span className="text-[10px] font-bold uppercase text-slate-500">Class Teacher</span>
                                                </div>
                                                <div>
                                                    <div className="border-b border-slate-800 pb-1 mb-1.5 mx-4 font-bold text-slate-800">
                                                        Examination Dept.
                                                    </div>
                                                    <span className="text-[10px] font-bold uppercase text-slate-500">Controller of Exams</span>
                                                </div>
                                                <div>
                                                    <div className="border-b border-slate-800 pb-1 mb-1.5 mx-4 font-bold text-slate-800">
                                                        Principal Stamp & Sign
                                                    </div>
                                                    <span className="text-[10px] font-bold uppercase text-slate-500">School Principal</span>
                                                </div>
                                            </div>
                                            <div className="text-center text-[9px] text-slate-400 mt-6">
                                                Generated securely via School Management Cloud System • Date: {new Date().toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL: CREATE / EDIT EXAM TERM                                            */}
            {/* ========================================================================= */}
            {/* ========================================================================= */}
            {/* MODAL: CREATE / EDIT EXAM TERM                                            */}
            {/* ========================================================================= */}
            {showExamModal && typeof document !== 'undefined' && createPortal(
                <div className="no-print fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
                        <div className="p-6 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <Award className="w-6 h-6" />
                                <h3 className="font-bold text-lg">{editingExam ? 'Edit Examination Term' : 'Create New Examination Term'}</h3>
                            </div>
                            <button onClick={() => setShowExamModal(false)} className="text-white/80 hover:text-white text-lg font-bold">✕</button>
                        </div>

                        <form onSubmit={handleSaveExam} className="p-6 space-y-4 text-xs font-semibold text-slate-700 overflow-y-auto flex-1">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Select Examination Preset / Mode *</label>
                                <select
                                    value={examForm.presetId}
                                    onChange={(e) => handlePresetChange(e.target.value)}
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800"
                                >
                                    {STANDARD_EXAM_PRESETS.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.title}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Custom Exam Title Input */}
                            {examForm.presetId === 'custom' && (
                                <div className="space-y-1.5 animate-fadeIn">
                                    <label className="block text-[11px] font-bold text-indigo-700 uppercase">
                                        Custom Examination Title *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g., Pre-Board Examination 2026, Weekly Test 1, Send-Up Test..."
                                        value={examForm.title}
                                        onChange={(e) => setExamForm({ ...examForm, title: e.target.value })}
                                        className="w-full p-2.5 bg-indigo-50/40 border border-indigo-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800"
                                        autoFocus
                                    />
                                    <p className="text-[10px] text-indigo-600 font-medium">
                                        ⚡ This title will automatically appear in Teacher Mobile App & Parent Mobile App.
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Academic Session</label>
                                    <input
                                        type="text"
                                        placeholder="e.g., 2025-2026"
                                        value={examForm.session}
                                        onChange={(e) => setExamForm({ ...examForm, session: e.target.value })}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Status</label>
                                    <select
                                        value={examForm.status}
                                        onChange={(e) => setExamForm({ ...examForm, status: e.target.value })}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                                    >
                                        <option value="active">Active</option>
                                        <option value="upcoming">Upcoming</option>
                                        <option value="completed">Completed</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Default Total Marks</label>
                                    <input
                                        type="number"
                                        min="1"
                                        placeholder="e.g., 100"
                                        value={examForm.defaultTotalMarks}
                                        onChange={(e) => setExamForm({ ...examForm, defaultTotalMarks: e.target.value })}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Passing Marks</label>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="e.g., 33"
                                        value={examForm.passingMarks}
                                        onChange={(e) => setExamForm({ ...examForm, passingMarks: e.target.value })}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Start Date</label>
                                    <input
                                        type="date"
                                        value={examForm.startDate}
                                        onChange={(e) => setExamForm({ ...examForm, startDate: e.target.value })}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">End Date</label>
                                    <input
                                        type="date"
                                        value={examForm.endDate}
                                        onChange={(e) => setExamForm({ ...examForm, endDate: e.target.value })}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Description / Guidelines</label>
                                <textarea
                                    rows="2"
                                    placeholder="Optional notes for teachers..."
                                    value={examForm.description}
                                    onChange={(e) => setExamForm({ ...examForm, description: e.target.value })}
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setShowExamModal(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-100 transition-colors"
                                >
                                    {editingExam ? 'Update Exam' : 'Save Exam Term'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}



            {/* ========================================================================= */}
            {/* MODAL: CONFIRM UPLOAD RESULT CARDS TO PARENTS                             */}
            {/* ========================================================================= */}
            {showUploadToParentsModal && typeof document !== 'undefined' && createPortal(
                <div className="no-print fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
                        <div className="p-6 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur-md">
                                    <UploadCloud className="w-6 h-6 text-indigo-100" />
                                </div>
                                <div>
                                    <h3 className="font-black text-lg">Upload to Parents</h3>
                                    <p className="text-xs text-indigo-200">{currentExam?.title || 'Exam'} • {currentClass?.name || 'Class'}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowUploadToParentsModal(false)}
                                className="p-1.5 text-white/80 hover:text-white text-lg font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 space-y-4 overflow-y-auto flex-1">
                            <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 text-xs text-slate-700 space-y-2">
                                <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-indigo-600" />
                                    Review Batch Upload Summary
                                </div>
                                <p className="text-slate-600 leading-relaxed">
                                    Aap <strong>{currentClass?.name}</strong> ke <strong>{selectedStudentIdsForBatch.size}</strong> muntakhib students ke Result Cards direct Parents Portal par deliver karne lage hain.
                                </p>
                            </div>

                            <div className="grid grid-cols-3 gap-3 text-center">
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Selected</span>
                                    <span className="text-lg font-black text-slate-800">{selectedStudentIdsForBatch.size}</span>
                                </div>
                                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                                    <span className="text-[10px] font-bold text-emerald-600 uppercase block">Passed</span>
                                    <span className="text-lg font-black text-emerald-700">
                                        {tabulationData.rows.filter(r => selectedStudentIdsForBatch.has(r.studentId) && r.isPassed).length}
                                    </span>
                                </div>
                                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                                    <span className="text-[10px] font-bold text-rose-600 uppercase block">Failed / Pending</span>
                                    <span className="text-lg font-black text-rose-700">
                                        {tabulationData.rows.filter(r => selectedStudentIdsForBatch.has(r.studentId) && !r.isPassed).length}
                                    </span>
                                </div>
                            </div>

                            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
                                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                <p>
                                    Confirm karne ke baad har parent ke account me Result Card aur Live Notification chali jayegi.
                                </p>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setShowUploadToParentsModal(false)}
                                    disabled={isUploadingToParents}
                                    className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-colors text-xs"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmUploadToParents}
                                    disabled={isUploadingToParents}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl font-black text-xs shadow-md shadow-indigo-200 transition-all disabled:opacity-50"
                                >
                                    {isUploadingToParents ? (
                                        <>Publishing Cards...</>
                                    ) : (
                                        <>
                                            <Send className="w-3.5 h-3.5" />
                                            Confirm & Upload to Parents ({selectedStudentIdsForBatch.size})
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}


        </div>
    );
}
