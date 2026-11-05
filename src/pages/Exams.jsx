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
    ChevronLeft,
    ChevronRight,
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
    Scale,
    RefreshCw,
    Lock
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

export const DEFAULT_GRADING_SCALE = [
    { minPct: 90, grade: 'A++', remarks: 'Exceptional' },
    { minPct: 80, grade: 'A+', remarks: 'Outstanding' },
    { minPct: 70, grade: 'A', remarks: 'Excellent' },
    { minPct: 60, grade: 'B', remarks: 'Very Good' },
    { minPct: 50, grade: 'C', remarks: 'Good / Satisfactory' },
    { minPct: 40, grade: 'D', remarks: 'Fair / Pass' },
    { minPct: 33, grade: 'E', remarks: 'Marginal Pass' },
    { minPct: 0, grade: 'F', remarks: 'Needs Improvement / Fail' }
];

export function getGradeAndRemarksFromScale(pct, customScale, mode = 'default') {
    if (pct === null || pct === undefined || isNaN(pct)) return { grade: '—', remarks: '—' };
    const scale = (mode === 'custom' && Array.isArray(customScale) && customScale.length > 0)
        ? customScale
        : DEFAULT_GRADING_SCALE;
    
    const sorted = [...scale].sort((a, b) => Number(b.minPct) - Number(a.minPct));
    for (const tier of sorted) {
        if (pct >= Number(tier.minPct)) {
            return { grade: tier.grade, remarks: tier.remarks };
        }
    }
    const last = sorted[sorted.length - 1];
    return { grade: last?.grade || 'F', remarks: last?.remarks || 'Fail' };
}

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

// Safe attendance formatter (Handles strings, numbers, and Firestore raw objects like { percentage: 85 })
const formatAttendanceSafely = (att) => {
    if (!att && att !== 0) return '—';
    if (typeof att === 'string') return att;
    if (typeof att === 'number') return `${att}%`;
    if (typeof att === 'object') {
        if (typeof att.percentage === 'number' || typeof att.percentage === 'string') {
            return `${att.percentage}%`;
        }
        if (att.present !== undefined && att.total) {
            const pct = Math.round((Number(att.present) / Number(att.total)) * 100);
            return `${att.present} / ${att.total} Days (${pct}%)`;
        }
        return '—';
    }
    return String(att);
};

// Robust Subject Normalization & Synonyms Matcher (Unifies Teacher Mobile App & Principal WebApp)
const normalizeSubj = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isSameSubject = (subA, subB) => {
    if (!subA || !subB) return false;
    const cleanA = normalizeSubj(subA);
    const cleanB = normalizeSubj(subB);
    if (!cleanA || !cleanB) return false;
    if (cleanA === cleanB) return true;

    // Check if one has distinct paper/section markers that differ from the other (e.g. English-A vs English-B)
    const distinctSuffixes = ['a', 'b', 'c', '1', '2', 'paper1', 'paper2', 'oral', 'written', 'practical', 'theory', 'adv', 'advanced'];
    for (const suffix of distinctSuffixes) {
        const hasA = cleanA.endsWith(suffix) || cleanA.includes(`_${suffix}`) || cleanA.includes(`-${suffix}`);
        const hasB = cleanB.endsWith(suffix) || cleanB.includes(`_${suffix}`) || cleanB.includes(`-${suffix}`);
        if (hasA !== hasB) {
            // Distinct paper/sections must not collapse together
            if (suffix === 'b' || suffix === '2' || suffix === 'c' || suffix === 'paper2' || suffix === 'oral' || suffix === 'practical') {
                return false;
            }
        }
    }

    // Common Pakistan School Subject Aliases (Canonical & Normalized)
    const aliasGroups = [
        ['math', 'maths', 'mathematics', 'generalmath', 'riazi', 'mathcompulsory'],
        ['sci', 'science', 'generalscience', 'genscience', 'gscience', 'gensci'],
        ['isl', 'islamiyat', 'islamiat', 'islamicstudies', 'deeniyat', 'islamicstudy'],
        ['quran', 'mutaliaquran', 'tarjumatulquran', 'tarjuma', 'nazra', 'nazraquran', 'tajweed', 'hifz'],
        ['eng', 'english', 'englishcompulsory', 'englit', 'englishliterature'],
        ['urdu', 'urducompulsory', 'urduadab', 'urduinsha'],
        ['pst', 'pakstudies', 'pakistanstudies', 'mutalaepakistan', 'pakstudy'],
        ['comp', 'computer', 'computerscience', 'it', 'informationtechnology', 'ict', 'cs'],
        ['gk', 'generalknowledge', 'generalawareness', 'generalknow'],
        ['bio', 'biology'],
        ['chem', 'chemistry'],
        ['phy', 'physics'],
        ['art', 'arts', 'drawing', 'finearts'],
        ['soc', 'socialstudies', 'sstudies', 'socialstudy', 'historygeography', 'history', 'geography'],
        ['arabic', 'arbi'],
        ['sindhi'],
        ['pashto'],
        ['ethics', 'moralscience']
    ];

    if (aliasGroups.some(group => group.includes(cleanA) && group.includes(cleanB))) {
        return true;
    }

    // Safe prefix match: only if both words are long enough (> 4 chars) and don't end in different letters (like A vs B)
    if (cleanA.length >= 5 && cleanB.length >= 5) {
        if (cleanA.startsWith(cleanB) || cleanB.startsWith(cleanA)) {
            const lastA = cleanA.slice(-1);
            const lastB = cleanB.slice(-1);
            if ((lastA === 'a' && lastB === 'b') || (lastA === 'b' && lastB === 'a')) {
                return false;
            }
            return true;
        }
    }

    return false;
};

// Chronological / Sequential Term Sorter (1st Term ➔ 2nd/Mid Term ➔ 3rd Term ➔ Final Term)
const getTermSortOrder = (exam) => {
    if (!exam) return 99;
    const text = `${exam.presetId || ''} ${exam.id || ''} ${exam.title || ''}`.toLowerCase();
    if (text.includes('first') || text.includes('1st') || text.includes('term 1') || text.includes('term1')) return 1;
    if (text.includes('mid') || text.includes('second') || text.includes('2nd') || text.includes('term 2') || text.includes('term2') || text.includes('half')) return 2;
    if (text.includes('third') || text.includes('3rd') || text.includes('term 3') || text.includes('term3')) return 3;
    if (text.includes('final') || text.includes('annual') || text.includes('end term')) return 4;
    if (exam.startDate) {
        const time = new Date(exam.startDate).getTime();
        if (!isNaN(time)) return 10 + (time / 10000000000);
    }
    return 5;
};

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
    const [isSyncingMarks, setIsSyncingMarks] = useState(false);
    
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
    const [singleStudentToPublish, setSingleStudentToPublish] = useState(null);
    const [isUploadingToParents, setIsUploadingToParents] = useState(false);
    const [uploadSuccessMessage, setUploadSuccessMessage] = useState(null);
    const isDemoAccount = useMemo(() => {
        const sId = String(schoolId || '').trim();
        const pId = String(schoolProfile?.schoolId || schoolProfile?.id || '').trim();
        return sId === '6257' || pId === '6257' || sId.includes('6257') || pId.includes('6257');
    }, [schoolId, schoolProfile]);

    // Live database is ALWAYS default. Demo mode is an optional visual presentation toggle for School 6257.
    const [isDemoMode, setIsDemoMode] = useState(false);

    useEffect(() => {
        if (!isDemoAccount && isDemoMode) {
            setIsDemoMode(false);
            try { localStorage.removeItem('exams_demo_mode_active'); } catch (_) {}
        }
    }, [isDemoAccount, isDemoMode]);
    const [selectedStudentForModerate, setSelectedStudentForModerate] = useState(null);
    const [moderateSubjectMarks, setModerateSubjectMarks] = useState({});
    const [moderateMultiTermMarks, setModerateMultiTermMarks] = useState({});
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

    // Academic Sessions & Filtering State
    const availableSessions = useMemo(() => {
        const set = new Set();
        exams.forEach(e => {
            if (e.session && typeof e.session === 'string' && e.session.trim()) {
                set.add(e.session.trim());
            }
        });
        if (set.size === 0) {
            set.add('2025-2026');
            set.add('2024-2025');
        }
        return Array.from(set).sort((a, b) => b.localeCompare(a));
    }, [exams]);

    const [selectedSession, setSelectedSession] = useState(() => {
        return localStorage.getItem('exams_selected_session') || '2025-2026';
    });

    useEffect(() => {
        if (selectedSession) localStorage.setItem('exams_selected_session', selectedSession);
    }, [selectedSession]);

    useEffect(() => {
        if (availableSessions.length > 0 && !availableSessions.includes(selectedSession)) {
            setSelectedSession(availableSessions[0]);
        }
    }, [availableSessions, selectedSession]);

    const [setupStatusFilter, setSetupStatusFilter] = useState('all'); // 'all' | 'active' | 'concluded'

    // Current Exam Object
    const currentExam = useMemo(() => {
        if (selectedExamId === 'annual_aggregate') {
            return {
                id: 'annual_aggregate',
                title: `Annual Consolidated Aggregate (${selectedSession || 'Academic Session'})`,
                session: selectedSession || '2025-2026',
                defaultTotalMarks: 100,
                passingMarks: 33,
                isAggregate: true
            };
        }
        return exams.find(e => e.id === selectedExamId) || {
            id: selectedExamId || 'default',
            title: 'Term Examination',
            session: selectedSession || '2025-2026',
            defaultTotalMarks: 100,
            passingMarks: 33
        };
    }, [exams, selectedExamId, selectedSession]);

    // Filtered exams belonging to the currently selected academic session (Sorted Chronologically)
    const sessionExams = useMemo(() => {
        const filtered = exams.filter(e => {
            if (e.id === 'annual_aggregate') return false;
            const matchSession = !selectedSession || (e.session || '').trim() === selectedSession;
            if (!matchSession) return false;
            if (setupStatusFilter === 'active') return e.status === 'active';
            if (setupStatusFilter === 'concluded') return e.status === 'completed' || e.status === 'archived';
            return true;
        });
        return [...filtered].sort((a, b) => getTermSortOrder(a) - getTermSortOrder(b));
    }, [exams, selectedSession, setupStatusFilter]);

    // View-Only Lock Status: Locked if explicitly locked exam OR previous academic session (e.g. 2024-2025) OR all 3 terms published
    const isDmcViewOnly = useMemo(() => {
        // 1. If current exam explicitly has isLocked (e.g. past demo locked exam 2024-2025 or promoted exam)
        if (currentExam?.isLocked) return true;

        // 2. If viewing a previous academic year / archived session
        if (selectedSession && (selectedSession === '2024-2025' || selectedSession.includes('2024') || currentExam?.isArchive)) return true;

        // 3. Strictly only if ALL 3 terms of this session are confirmed published
        const sessionAllExams = exams.filter(e => (e.session || '').trim() === selectedSession && e.id !== 'annual_aggregate');
        const hasAll3Terms = sessionAllExams.length >= 3;
        const allPublished = hasAll3Terms && sessionAllExams.every(e => e.isPublished === true || e.status === 'published');
        if (allPublished) {
            return true;
        }

        return false;
    }, [currentExam, selectedSession, exams]);

    // Aggregate Weightage & Annual Calculation Settings
    const [aggregateConfig, setAggregateConfig] = useState({
        mode: 'auto', // 'auto' | 'custom'
        weights: {}, // { [examId]: percentageNumber }
        includedExamIds: [],
        gradingScaleMode: 'default', // 'default' | 'custom'
        customGradingScale: DEFAULT_GRADING_SCALE
    });
    const [showAggregateModal, setShowAggregateModal] = useState(false);
    const [isSavingAggregateConfig, setIsSavingAggregateConfig] = useState(false);
    const [modalAggregateMode, setModalAggregateMode] = useState('auto');
    const [modalAggregateWeights, setModalAggregateWeights] = useState({});
    const [modalIncludedExamIds, setModalIncludedExamIds] = useState([]);
    const [modalGradingScaleMode, setModalGradingScaleMode] = useState('default');
    const [modalCustomGradingScale, setModalCustomGradingScale] = useState(DEFAULT_GRADING_SCALE);

    useEffect(() => {
        if (showAggregateModal) {
            setModalAggregateMode(aggregateConfig.mode || 'auto');
            setModalAggregateWeights(aggregateConfig.weights || {});
            const defaultIncluded = (aggregateConfig.includedExamIds && aggregateConfig.includedExamIds.length > 0)
                ? aggregateConfig.includedExamIds
                : sessionExams.filter(e => e.presetId !== 'monthly_test' && !e.id.includes('monthly')).map(e => e.id);
            setModalIncludedExamIds(defaultIncluded.length > 0 ? defaultIncluded : sessionExams.map(e => e.id));
            setModalGradingScaleMode(aggregateConfig.gradingScaleMode || 'default');
            setModalCustomGradingScale(Array.isArray(aggregateConfig.customGradingScale) && aggregateConfig.customGradingScale.length > 0 ? aggregateConfig.customGradingScale : DEFAULT_GRADING_SCALE);
        }
    }, [showAggregateModal, aggregateConfig, sessionExams]);

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

                // Listen to Exam Settings (Aggregate weights & formulas)
                const examSettingsRef = doc(db, `schools/${id}/settings`, 'exam_settings');
                const unsubExamSettings = onSnapshot(examSettingsRef, (snap) => {
                    if (snap.exists()) {
                        const d = snap.data();
                        setAggregateConfig({
                            mode: d.mode || 'auto',
                            weights: d.weights || {},
                            includedExamIds: Array.isArray(d.includedExamIds) ? d.includedExamIds : [],
                            gradingScaleMode: d.gradingScaleMode || 'default',
                            customGradingScale: Array.isArray(d.customGradingScale) ? d.customGradingScale : DEFAULT_GRADING_SCALE
                        });
                    }
                }, (err) => {
                    console.warn("Exam settings stream notice:", err);
                });

                // Listen to Exams List
                const examsRef = collection(db, `schools/${id}/exams`);
                const unsubExams = onSnapshot(examsRef, (snap) => {
                    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    // Sort active first, then by date
                    list.sort((a, b) => (a.status === 'active' ? -1 : 1));
                    setExams(list);

                    const savedExamId = localStorage.getItem('exams_selected_exam_id');
                    if (savedExamId && (savedExamId === 'annual_aggregate' || list.some(e => e.id === savedExamId))) {
                        setSelectedExamId(savedExamId);
                    } else if (list.length > 0 && !selectedExamId) {
                        setSelectedExamId(list[0].id);
                    }
                });

                // Listen to Classes List
                const classesRef = collection(db, `schools/${id}/classes`);
                const unsubClasses = onSnapshot(classesRef, (snap) => {
                    const list = snap.docs
                        .filter(d => d.id !== 'action_metadata')
                        .map(d => ({ id: d.id, ...d.data() }));
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
                    unsubExamSettings();
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
            const list = snap.docs
                .filter(d => {
                    const data = d.data();
                    if (data.isDeleted === true || data.deleted === true) return false;
                    const st = (data.status || '').toLowerCase().trim();
                    if (st === 'withdrawn' || st === 'left' || st === 'inactive' || st === 'struck_off' || st === 'slc_issued') return false;
                    return true;
                })
                .map(d => {
                const data = d.data();
                const studentRoll = (data.rollNo !== undefined && data.rollNo !== null && String(data.rollNo).trim() !== '')
                    ? String(data.rollNo).trim()
                    : (data.rollNumber !== undefined && data.rollNumber !== null && String(data.rollNumber).trim() !== '')
                        ? String(data.rollNumber).trim()
                        : '';
                const studentName = data.fullName || data.name || ((data.firstName || '') + ' ' + (data.lastName || '')).trim() || 'Student';
                return {
                    id: d.id,
                    name: studentName,
                    rollNo: studentRoll,
                    rollNumber: studentRoll,
                    fatherName: data.fatherName || data.guardianName || data.parentDetails?.fatherName || '',
                    photoUrl: data.photoUrl || data.photo || data.profileImage || data.studentPhoto || data.profilePic || data.avatar || data.image || data.imageUrl || '',
                    ...data
                };
            });
            // Sort students by Roll Number numerically / naturally (e.g. 1, 2, 10 or TPP-1, TPP-2)
            list.sort((a, b) => {
                const numA = parseInt(String(a.rollNumber).replace(/\D/g, '')) || 999999;
                const numB = parseInt(String(b.rollNumber).replace(/\D/g, '')) || 999999;
                if (numA !== numB) return numA - numB;
                return (a.rollNumber || '').localeCompare(b.rollNumber || '', undefined, { numeric: true }) || a.name.localeCompare(b.name);
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
    // Current Class Object
    const currentClass = useMemo(() => {
        return classes.find(c => c.id === selectedClassId) || {
            id: selectedClassId,
            name: 'Selected Class',
            subjects: []
        };
    }, [classes, selectedClassId]);

    // Manual Force Real-time Pull for Exam Marks directly from cloud
    const handleManualSyncMarks = async () => {
        if (!schoolId || !selectedClassId) return;
        setIsSyncingMarks(true);
        try {
            const marksRef = collection(db, `schools/${schoolId}/classes/${selectedClassId}/exam_marks`);
            const snap = await getDocs(marksRef);
            let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Also check if any duplicate class doc shares the exact clean name
            if (currentClass?.name) {
                const targetClean = currentClass.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                const alternateClasses = classes.filter(c => c.id !== selectedClassId && (c.name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === targetClean);
                for (const altCls of alternateClasses) {
                    try {
                        const altSnap = await getDocs(collection(db, `schools/${schoolId}/classes/${altCls.id}/exam_marks`));
                        if (!altSnap.empty) {
                            const altDocs = altSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                            list = [...list, ...altDocs];
                        }
                    } catch (_) {}
                }
            }

            setClassMarksDocs(list);
            setUploadSuccessMessage(`✅ Synchronized ${list.length} subject marksheet(s) live from cloud!`);
            setTimeout(() => setUploadSuccessMessage(null), 4000);
        } catch (err) {
            console.error("Manual marks sync error:", err);
            alert("Marks sync notice: " + (err.message || err));
        } finally {
            setIsSyncingMarks(false);
        }
    };

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

            const isAggregateDemo = selectedExamId === 'annual_aggregate';
            const demoAggregateTerms = [
                { id: 'first_term', title: 'First Term 2026', weight: 33, attendance: '48/50 (96%)' },
                { id: 'mid_term', title: 'Mid Term 2026', weight: 33, attendance: '45/50 (90%)' },
                { id: 'final_term', title: 'Annual / Final 2026', weight: 34, attendance: 'Pending' }
            ];

            const processedDemoRows = finalWithPositions.map((r, rIdx) => {
                if (!isAggregateDemo) return r;
                const isDemoPendingStudent = r.studentId === 'demo_6' || rIdx === 5;
                const subjMulti = {};
                const demoMultiOverride = demoDataOverride[r.studentId]?.multiTermMarks;

                demoSubjects.forEach(s => {
                    const baseObt = r.subjectMarks?.[s]?.obtained || 75;
                    const isAbs = r.subjectMarks?.[s]?.isAbsent || false;
                    let t1 = isAbs ? 0 : Math.max(0, Math.min(100, Math.round(baseObt * 0.92)));
                    let t2 = isDemoPendingStudent ? null : (isAbs ? 0 : Math.max(0, Math.min(100, Math.round(baseObt * 0.96))));
                    let t3 = isDemoPendingStudent ? null : (isAbs ? 0 : baseObt);
                    
                    if (demoMultiOverride?.[s]) {
                        if (demoMultiOverride[s].first_term) {
                            const o1 = demoMultiOverride[s].first_term;
                            t1 = o1.isAbsent ? 0 : (o1.obtained !== '' && o1.obtained !== null && !isNaN(o1.obtained) ? parseFloat(o1.obtained) : 0);
                        }
                        if (demoMultiOverride[s].mid_term) {
                            const o2 = demoMultiOverride[s].mid_term;
                            t2 = o2.isAbsent ? 0 : (o2.obtained !== '' && o2.obtained !== null && !isNaN(o2.obtained) ? parseFloat(o2.obtained) : null);
                        }
                        if (demoMultiOverride[s].final_term) {
                            const o3 = demoMultiOverride[s].final_term;
                            t3 = o3.isAbsent ? 0 : (o3.obtained !== '' && o3.obtained !== null && !isNaN(o3.obtained) ? parseFloat(o3.obtained) : null);
                        }
                    }

                    const sObt = (t1 || 0) + (t2 !== null ? t2 : 0) + (t3 !== null ? t3 : 0);
                    const sMax = isDemoPendingStudent ? 100 : 300;
                    const sPct = parseFloat(((sObt / sMax) * 100).toFixed(1));
                    subjMulti[s] = {
                        terms: {
                            first_term: { obtained: t1, max: 100, percentage: t1, weightedPercentage: parseFloat((t1 * 0.33).toFixed(1)), grade: calculateGrade(t1, 100), remarks: calculateRemarks(t1, 100) },
                            mid_term: { obtained: t2, max: 100, percentage: t2, weightedPercentage: t2 !== null ? parseFloat((t2 * 0.33).toFixed(1)) : null, grade: t2 !== null ? calculateGrade(t2, 100) : '—', remarks: t2 !== null ? calculateRemarks(t2, 100) : '—', isPending: isDemoPendingStudent },
                            final_term: { obtained: t3, max: 100, percentage: t3, weightedPercentage: t3 !== null ? parseFloat((t3 * 0.34).toFixed(1)) : null, grade: t3 !== null ? calculateGrade(t3, 100) : '—', remarks: t3 !== null ? calculateRemarks(t3, 100) : '—', isPending: isDemoPendingStudent }
                        },
                        totalObtained: sObt,
                        totalMax: sMax,
                        percentage: sPct,
                        grade: isDemoPendingStudent ? 'Pending' : calculateGrade(sObt, sMax),
                        remarks: isDemoPendingStudent ? 'Pending' : calculateRemarks(sObt, sMax),
                        isPending: isDemoPendingStudent
                    };
                });

                const t1Total = Object.values(subjMulti).reduce((acc, sm) => acc + (sm.terms.first_term.obtained || 0), 0);
                const t2Total = isDemoPendingStudent ? null : Object.values(subjMulti).reduce((acc, sm) => acc + (sm.terms.mid_term.obtained || 0), 0);
                const t3Total = isDemoPendingStudent ? null : Object.values(subjMulti).reduce((acc, sm) => acc + (sm.terms.final_term.obtained || 0), 0);
                const grandObt = t1Total + (t2Total || 0) + (t3Total || 0);
                const grandMax = isDemoPendingStudent ? 500 : 1500;
                const grandPct = parseFloat(((grandObt / grandMax) * 100).toFixed(1));

                const t1Pct = parseFloat(((t1Total / 500) * 100).toFixed(1));
                const t2Pct = t2Total !== null ? parseFloat(((t2Total / 500) * 100).toFixed(1)) : 0;
                const t3Pct = t3Total !== null ? parseFloat(((t3Total / 500) * 100).toFixed(1)) : 0;

                const t1WPct = parseFloat(((t1Pct * 0.33)).toFixed(1));
                const t2WPct = t2Total !== null ? parseFloat(((t2Pct * 0.33)).toFixed(1)) : null;
                const t3WPct = t3Total !== null ? parseFloat(((t3Pct * 0.34)).toFixed(1)) : null;

                return {
                    ...r,
                    attendance: isDemoPendingStudent ? '48 / 50 Days (96%)' : '93 / 100 Days (93%)',
                    totalObtained: grandObt,
                    totalMax: grandMax,
                    percentage: grandPct,
                    grade: calculateGrade(grandObt, grandMax),
                    remarks: isDemoPendingStudent ? 'Pending' : calculateRemarks(grandObt, grandMax),
                    isComplete: !isDemoPendingStudent,
                    isPassed: !isDemoPendingStudent && grandPct >= 33,
                    statusLabel: isDemoPendingStudent ? 'PENDING' : (grandPct >= 33 ? 'PASSED' : 'FAILED'),
                    subjectMultiTerm: subjMulti,
                    termBreakdown: {
                        first_term: {
                            termId: 'first_term',
                            termTitle: 'First Term 2026',
                            obtained: t1Total,
                            max: 500,
                            percentage: t1Pct,
                            weightedPercentage: t1WPct,
                            grade: calculateGrade(t1Total, 500),
                            remarks: calculateRemarks(t1Total, 500),
                            hasMarks: true,
                            attendance: '48 / 50 Days (96%)'
                        },
                        mid_term: {
                            termId: 'mid_term',
                            termTitle: 'Mid Term 2026',
                            obtained: t2Total,
                            max: 500,
                            percentage: t2Pct,
                            weightedPercentage: t2WPct,
                            grade: t2Total !== null ? calculateGrade(t2Total, 500) : '—',
                            remarks: t2Total !== null ? calculateRemarks(t2Total, 500) : '—',
                            hasMarks: !isDemoPendingStudent,
                            attendance: isDemoPendingStudent ? 'Pending' : '45 / 50 Days (90%)'
                        },
                        final_term: {
                            termId: 'final_term',
                            termTitle: 'Annual / Final 2026',
                            obtained: t3Total,
                            max: 500,
                            percentage: t3Pct,
                            weightedPercentage: t3WPct,
                            grade: t3Total !== null ? calculateGrade(t3Total, 500) : '—',
                            remarks: t3Total !== null ? calculateRemarks(t3Total, 500) : '—',
                            hasMarks: !isDemoPendingStudent,
                            attendance: 'Pending'
                        }
                    }
                };
            });

            return {
                isAggregate: isAggregateDemo,
                aggregateTerms: isAggregateDemo ? demoAggregateTerms : [],
                subjects: demoSubjects,
                subjectConfigs: demoSubjectConfigs,
                rows: processedDemoRows,
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

        if (!selectedExamId || (students.length === 0 && !isDemoMode)) return { subjects: [], subjectConfigs: {}, rows: [], stats: {} };

        // =====================================================================
        // CONSOLIDATED ANNUAL AGGREGATE CALCULATION ACROSS SESSION TERMS
        // =====================================================================
        if (selectedExamId === 'annual_aggregate') {
            const sessionAllExams = exams.filter(e => (!selectedSession || e.session === selectedSession) && e.id !== 'annual_aggregate');
            const includedExamIds = (aggregateConfig.includedExamIds && aggregateConfig.includedExamIds.length > 0)
                ? aggregateConfig.includedExamIds
                : sessionAllExams.filter(e => e.presetId !== 'monthly_test' && !e.id.includes('monthly')).map(e => e.id);
            
            const candidateExams = sessionAllExams.filter(e => includedExamIds.includes(e.id));
            const rawActiveTerms = candidateExams.length > 0 ? candidateExams : sessionAllExams;
            const activeTerms = [...rawActiveTerms].sort((a, b) => getTermSortOrder(a) - getTermSortOrder(b));

            const aggregateTerms = activeTerms.map(t => ({
                id: t.id,
                title: t.title,
                weight: typeof aggregateConfig.weights?.[t.id] === 'number' ? aggregateConfig.weights[t.id] : (aggregateConfig.mode === 'custom' ? 0 : Math.round(100 / (activeTerms.length || 1)))
            }));

            // Deduplicate students
            const studentGroupMap = new Map();
            students.forEach(student => {
                const roll = String(student.rollNumber || student.rollNo || '').trim().toLowerCase();
                const adm = String(student.admissionNo || student.admissionNumber || '').trim().toLowerCase();
                const name = String(student.name || student.studentName || '').trim().toLowerCase();
                const father = String(student.fatherName || '').trim().toLowerCase();

                let dedupKey = '';
                if (roll && name) dedupKey = `roll_${roll}_name_${name}`;
                else if (roll) dedupKey = `roll_${roll}`;
                else if (adm) dedupKey = `adm_${adm}`;
                else if (name && father) dedupKey = `name_${name}_father_${father}`;
                else dedupKey = `id_${student.id}`;

                if (!studentGroupMap.has(dedupKey)) studentGroupMap.set(dedupKey, []);
                studentGroupMap.get(dedupKey).push(student);
            });

            const deduplicatedStudents = [];
            studentGroupMap.forEach((group) => {
                deduplicatedStudents.push({ ...group[0], _allIds: group.map(s => s.id) });
            });

            const totalConfigWeight = aggregateTerms.reduce((sum, t) => sum + (t.weight || 0), 0) || 100;
            const allDistinctSubjectsSet = new Set();

            const studentRows = deduplicatedStudents.map(student => {
                const targetIds = student._allIds || [student.id];
                const targetRoll = String(student.rollNumber || student.rollNo || '').trim();

                const termBreakdown = {};
                const studentSubjectTerms = {};
                let overallObtained = 0;
                let overallMax = 0;
                let weightedPercentageSum = 0;
                let termsWithMarksCount = 0;

                activeTerms.forEach(term => {
                    const cleanTermId = term.id.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const cleanTermTitle = (term.title || '').toLowerCase().trim();

                    const termMarksDocs = classMarksDocs.filter(d => {
                        const docExamId = (d.examId || '').toString().toLowerCase();
                        const docExamTitle = (d.examTitle || '').toString().toLowerCase().trim();
                        const cleanDocId = d.id.toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (docExamId === term.id.toLowerCase() || d.id.startsWith(term.id + '_')) return true;
                        if (cleanTermTitle && docExamTitle && (cleanTermTitle === docExamTitle || cleanTermTitle.includes(docExamTitle))) return true;
                        if (cleanDocId.startsWith(cleanTermId)) return true;
                        return false;
                    });

                    let termObt = 0;
                    let termMax = 0;
                    let termHasMarks = false;

                    termMarksDocs.forEach(d => {
                        let entry = null;
                        for (const sId of targetIds) {
                            if (d.marks && d.marks[sId]) {
                                entry = d.marks[sId];
                                break;
                            }
                        }
                        if (!entry && d.marks) {
                            const match = Object.entries(d.marks).find(([k, v]) => {
                                if (targetIds.includes(k)) return true;
                                if (v && typeof v === 'object') {
                                    const sId = String(v.studentId || '').trim();
                                    const rNum = String(v.rollNumber || v.rollNo || '').trim();
                                    if (sId && (targetIds.includes(sId) || (targetRoll && sId === targetRoll))) return true;
                                    if (rNum && targetRoll && rNum === targetRoll) return true;
                                }
                                return false;
                            });
                            if (match) entry = match[1];
                        }

                        if (entry) {
                            const sTotal = typeof d.totalMarks === 'number' && d.totalMarks > 0 ? d.totalMarks : 100;
                            termMax += sTotal;
                            if (entry.obtainedMarks !== undefined && entry.obtainedMarks !== null) {
                                termObt += Number(entry.obtainedMarks) || 0;
                                termHasMarks = true;
                            }
                            const subjName = (d.subject || 'General').trim();
                            allDistinctSubjectsSet.add(subjName);
                            if (!studentSubjectTerms[subjName]) studentSubjectTerms[subjName] = {};
                            const tWeight = aggregateConfig.weights?.[term.id] || (100 / (activeTerms.length || 1));
                            const sObtVal = (entry.obtainedMarks !== undefined && entry.obtainedMarks !== null) ? Number(entry.obtainedMarks) : null;
                            const sPctVal = (sObtVal !== null && sTotal > 0) ? parseFloat(((sObtVal / sTotal) * 100).toFixed(1)) : null;
                            const sWeightedVal = sPctVal !== null ? parseFloat(((sPctVal * tWeight) / 100).toFixed(1)) : null;

                            studentSubjectTerms[subjName][term.id] = {
                                obtained: sObtVal,
                                max: sTotal,
                                percentage: sPctVal,
                                weightedPercentage: sWeightedVal,
                                isAbsent: entry.isAbsent === true,
                                grade: calculateGrade(entry.obtainedMarks, sTotal),
                                remarks: entry.remarks || ''
                            };
                        }
                    });

                    const termPct = termMax > 0 ? parseFloat(((termObt / termMax) * 100).toFixed(1)) : 0;
                    const termGrade = calculateGrade(termObt, termMax);
                    const tWeight = aggregateConfig.weights?.[term.id] || (100 / (activeTerms.length || 1));
                    const termWeightedPct = termHasMarks ? parseFloat(((termPct * tWeight) / 100).toFixed(1)) : null;

                    if (termHasMarks) {
                        termsWithMarksCount++;
                        overallObtained += termObt;
                        overallMax += termMax;
                        weightedPercentageSum += (termPct * tWeight) / totalConfigWeight;
                    }

                    // Calculate Attendance for this term
                    let termPresent = 0;
                    let termTotal = 0;
                    if (classAttendanceDocs && classAttendanceDocs.length > 0) {
                        classAttendanceDocs.forEach(attDoc => {
                            const rec = attDoc.records?.[student.id] || attDoc.students?.[student.id] || attDoc[student.id];
                            const status = typeof rec === 'string' ? rec.toLowerCase() : rec?.status ? rec.status.toLowerCase() : null;
                            if (status === 'present' || status === 'p') {
                                termPresent++;
                                termTotal++;
                            } else if (status === 'absent' || status === 'a') {
                                termTotal++;
                            }
                        });
                    }
                    const rawStudentAtt = formatAttendanceSafely(student.attendance);
                    const termAttendanceFormatted = termHasMarks 
                        ? (termTotal > 0 ? `${termPresent}/${termTotal} (${Math.round((termPresent / termTotal) * 100)}%)` : (rawStudentAtt !== '—' ? rawStudentAtt : '48/50 (96%)'))
                        : 'Pending';

                    termBreakdown[term.id] = {
                        termId: term.id,
                        termTitle: term.title,
                        obtained: termHasMarks ? termObt : null,
                        max: termMax > 0 ? termMax : 100,
                        percentage: termPct,
                        weightedPercentage: termWeightedPct,
                        grade: termHasMarks ? termGrade : '—',
                        remarks: termHasMarks ? calculateRemarks(termObt, termMax) : '—',
                        hasMarks: termHasMarks,
                        attendance: termAttendanceFormatted
                    };
                });

                const finalPercentage = aggregateConfig.mode === 'custom' && totalConfigWeight > 0
                    ? parseFloat(weightedPercentageSum.toFixed(1))
                    : (overallMax > 0 ? parseFloat(((overallObtained / overallMax) * 100).toFixed(1)) : 0);

                const finalGrade = calculateGrade(finalPercentage, 100);
                const finalRemarks = calculateRemarks(finalPercentage, 100);
                const isComplete = activeTerms.length > 0 && termsWithMarksCount === activeTerms.length;
                const isPassed = isComplete && finalPercentage >= 33;
                const statusLabel = isComplete
                    ? (isPassed ? 'PASSED' : 'FAILED')
                    : (termsWithMarksCount > 0 ? 'PENDING' : 'NOT_STARTED');

                // Build Subject Multi-Term Aggregations
                const subjectMultiTerm = {};
                Object.entries(studentSubjectTerms).forEach(([subj, termsData]) => {
                    let subObt = 0;
                    let subMax = 0;
                    let evaluatedMax = 0;
                    let hasMarks = false;
                    let subTermsEvaluated = 0;
                    Object.values(termsData).forEach(td => {
                        if (td.obtained !== null && !isNaN(td.obtained)) {
                            subObt += td.obtained;
                            evaluatedMax += td.max || 100;
                            hasMarks = true;
                            subTermsEvaluated++;
                        }
                        subMax += td.max || 100;
                    });
                    const isSubPending = subTermsEvaluated < activeTerms.length;
                    const effectiveMax = isSubPending ? (evaluatedMax > 0 ? evaluatedMax : subMax) : subMax;
                    const sPct = effectiveMax > 0 ? parseFloat(((subObt / effectiveMax) * 100).toFixed(1)) : 0;
                    subjectMultiTerm[subj] = {
                        terms: termsData,
                        totalObtained: hasMarks ? subObt : null,
                        totalMax: subMax,
                        evaluatedMax: evaluatedMax,
                        percentage: sPct,
                        grade: hasMarks ? (isSubPending ? 'Pending' : calculateGrade(subObt, subMax)) : '—',
                        remarks: hasMarks ? (isSubPending ? 'Pending' : calculateRemarks(subObt, effectiveMax)) : '—',
                        isPending: isSubPending
                    };
                });

                return {
                    studentId: student.id,
                    name: student.name,
                    rollNumber: student.rollNumber || 'N/A',
                    fatherName: student.fatherName || 'N/A',
                    photoUrl: student.photoUrl,
                    attendance: '—',
                    termBreakdown,
                    subjectMultiTerm,
                    totalObtained: overallObtained,
                    totalMax: overallMax,
                    percentage: finalPercentage,
                    grade: finalGrade,
                    isComplete,
                    isPassed,
                    statusLabel,
                    moderationOverride: null,
                    examinerRemarks: '',
                    failedSubjectsCount: isPassed ? 0 : 1,
                    subjectsEvaluatedCount: termsWithMarksCount,
                    totalSubjectsCount: activeTerms.length,
                    hasAnyAbsent: false,
                    position: 0
                };
            });

            // Calculate Positions
            const rankedRows = [...studentRows].sort((a, b) => {
                if (b.percentage !== a.percentage) return b.percentage - a.percentage;
                return b.totalObtained - a.totalObtained;
            });

            const positionMap = {};
            rankedRows.forEach((row, idx) => {
                positionMap[row.studentId] = idx + 1;
            });

            const finalRowsWithPositions = studentRows.map(row => ({
                ...row,
                position: positionMap[row.studentId] || 1
            }));

            const passedStudents = finalRowsWithPositions.filter(r => r.isPassed);
            const evaluatedStudents = finalRowsWithPositions.filter(r => r.subjectsEvaluatedCount > 0);

            return {
                isAggregate: true,
                aggregateTerms,
                subjects: Array.from(allDistinctSubjectsSet),
                subjectConfigs: {},
                rows: finalRowsWithPositions,
                stats: {
                    totalStudents: finalRowsWithPositions.length,
                    passedCount: passedStudents.length,
                    failedCount: finalRowsWithPositions.length - passedStudents.length,
                    passingRate: finalRowsWithPositions.length > 0 ? Math.round((passedStudents.length / finalRowsWithPositions.length) * 100) : 0,
                    evaluatedCount: evaluatedStudents.length,
                    pending: finalRowsWithPositions.length - evaluatedStudents.length,
                    highestPct: evaluatedStudents.length > 0 ? Math.max(...evaluatedStudents.map(r => r.percentage)) : 0,
                    avgPct: evaluatedStudents.length > 0 ? parseFloat((evaluatedStudents.reduce((acc, curr) => acc + curr.percentage, 0) / evaluatedStudents.length).toFixed(1)) : 0
                }
            };
        }

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

        // CRITICAL: Sort relevantMarksDocs by updatedAt descending (NEWEST FIRST)
        // Ensures teacher's latest updates from mobile app always take precedence over older documents!
        relevantMarksDocs.sort((a, b) => {
            const getDocTime = (doc) => {
                if (!doc) return 0;
                if (doc.updatedAt?.toMillis) return doc.updatedAt.toMillis();
                if (doc.updatedAt?.seconds) return doc.updatedAt.seconds * 1000;
                if (doc.updatedAt instanceof Date) return doc.updatedAt.getTime();
                if (typeof doc.updatedAt === 'number') return doc.updatedAt;
                if (typeof doc.updatedAt === 'string') {
                    const parsed = Date.parse(doc.updatedAt);
                    if (!isNaN(parsed)) return parsed;
                }
                return 0;
            };
            return getDocTime(b) - getDocTime(a);
        });

        // 2. Discover all subjects for this class (teacher entered + class registered)
        // Harmonize subjects to avoid duplicates (e.g. Maths vs Mathematics) using isSameSubject
        const subjectConfigs = {}; // canonicalSubject -> { totalMarks, passingMarks }
        const canonicalSubjects = [];

        const addCanonicalSubject = (name, total, pass) => {
            const clean = (name || '').trim();
            if (!clean) return;
            const existing = canonicalSubjects.find(s => isSameSubject(s, clean));
            if (existing) {
                if (typeof total === 'number' && total > 0) subjectConfigs[existing].totalMarks = total;
                if (typeof pass === 'number' && pass > 0) subjectConfigs[existing].passingMarks = pass;
            } else {
                canonicalSubjects.push(clean);
                subjectConfigs[clean] = {
                    totalMarks: typeof total === 'number' && total > 0 ? total : 100,
                    passingMarks: typeof pass === 'number' && pass > 0 ? pass : 33
                };
            }
        };

        // First register class predefined subjects
        const classSubjs = Array.isArray(currentClass.subjects) ? currentClass.subjects : [];
        classSubjs.forEach(s => {
            const clean = typeof s === 'string' ? s.trim() : (s?.name || '').trim();
            if (clean) {
                addCanonicalSubject(clean, 100, 33);
            }
        });

        // Next register subjects from marks submitted by teachers (newest first)
        relevantMarksDocs.forEach(doc => {
            const subjName = (doc.subject || '').trim();
            if (subjName) {
                const teacherTotal = typeof doc.totalMarks === 'number' && doc.totalMarks > 0 ? doc.totalMarks : 100;
                const teacherPass = typeof doc.passingMarks === 'number' && doc.passingMarks > 0 ? doc.passingMarks : 33;
                addCanonicalSubject(subjName, teacherTotal, teacherPass);
            }
        });

        const subjectList = [...canonicalSubjects].sort((a, b) => a.localeCompare(b));

        // 2b. Deduplicate students if duplicate documents exist in database for the same student
        const studentGroupMap = new Map();
        students.forEach(student => {
            const roll = String(student.rollNumber || student.rollNo || '').trim().toLowerCase();
            const adm = String(student.admissionNo || student.admissionNumber || '').trim().toLowerCase();
            const name = String(student.name || student.studentName || '').trim().toLowerCase();
            const father = String(student.fatherName || '').trim().toLowerCase();

            // Build a deduplication key (prioritizing roll+name or roll)
            let dedupKey = '';
            if (roll && name) {
                dedupKey = `roll_${roll}_name_${name}`;
            } else if (roll) {
                dedupKey = `roll_${roll}`;
            } else if (adm) {
                dedupKey = `adm_${adm}`;
            } else if (name && father) {
                dedupKey = `name_${name}_father_${father}`;
            } else {
                dedupKey = `id_${student.id}`;
            }

            if (!studentGroupMap.has(dedupKey)) {
                studentGroupMap.set(dedupKey, []);
            }
            studentGroupMap.get(dedupKey).push(student);
        });

        const deduplicatedStudents = [];
        studentGroupMap.forEach((group) => {
            if (group.length === 1) {
                deduplicatedStudents.push({ ...group[0], _allIds: [group[0].id] });
            } else {
                // If multiple records exist for this student (e.g. duplicate created by accidental re-admission/import):
                // Find if any record has marks entered in relevantMarksDocs
                const allIds = group.map(s => s.id);
                let bestStudent = group[0];
                let maxMarksFound = -1;

                group.forEach(cand => {
                    let marksCount = 0;
                    relevantMarksDocs.forEach(d => {
                        if (d && d.marks && d.marks[cand.id]) {
                            const entry = d.marks[cand.id];
                            if (typeof entry.obtainedMarks === 'number' || entry.isAbsent) {
                                marksCount++;
                            }
                        }
                    });
                    if (marksCount > maxMarksFound) {
                        maxMarksFound = marksCount;
                        bestStudent = cand;
                    }
                });

                deduplicatedStudents.push({
                    ...bestStudent,
                    _allIds: allIds
                });
            }
        });

        // 3. Build Student Rows
        const studentRows = deduplicatedStudents.map(student => {
            const subjectMarks = {};
            let totalObtained = 0;
            let totalMax = 0;
            let subjectsEvaluatedCount = 0;
            let failedSubjectsCount = 0;
            let hasAnyAbsent = false;

            const targetIds = student._allIds || [student.id];
            const targetRoll = String(student.rollNumber || student.rollNo || '').trim();

            subjectList.forEach(subject => {
                const sConf = subjectConfigs[subject] || { totalMarks: 100, passingMarks: 33 };
                
                // Find all docs matching this subject (already sorted newest first)
                const matchingDocs = relevantMarksDocs.filter(d => 
                    isSameSubject(d.subject, subject) || 
                    (d.subject || '').trim().toLowerCase() === subject.toLowerCase()
                );
                
                let entryData = null;
                // Check newest document first so teacher's latest update wins
                for (const marksDoc of matchingDocs) {
                    if (marksDoc && marksDoc.marks && typeof marksDoc.marks === 'object') {
                        // Check direct match across any alias ID
                        for (const sId of targetIds) {
                            if (marksDoc.marks[sId]) {
                                entryData = marksDoc.marks[sId];
                                break;
                            }
                        }
                        if (entryData) break;

                        // Fallback lookup: match by studentId, rollNumber, or rollNo
                        const entries = Object.entries(marksDoc.marks);
                        const match = entries.find(([k, v]) => {
                            if (targetIds.includes(k)) return true;
                            if (v && typeof v === 'object') {
                                const sId = String(v.studentId || '').trim();
                                const rNum = String(v.rollNumber || v.rollNo || '').trim();
                                if (sId && (targetIds.includes(sId) || (targetRoll && sId === targetRoll))) return true;
                                if (rNum && targetRoll && rNum === targetRoll) return true;
                            }
                            return false;
                        });
                        if (match) {
                            entryData = match[1];
                            break;
                        }
                    }
                }

                if (entryData) {
                    const isAbsent = entryData.isAbsent === true;
                    const rawObt = entryData.obtainedMarks !== undefined ? entryData.obtainedMarks : entryData.marks;
                    const obtained = typeof rawObt === 'number' ? rawObt : (rawObt !== null && rawObt !== '' && !isNaN(Number(rawObt))) ? Number(rawObt) : null;

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
                    const targetRoll = String(student.rollNumber || student.rollNo || '').trim();
                    const entry = d.marks?.[student.id] || Object.values(d.marks || {}).find(v => {
                        if (!v || typeof v !== 'object') return false;
                        if (v.studentId && (v.studentId === student.id || (targetRoll && v.studentId === targetRoll))) return true;
                        if (targetRoll && (v.rollNumber === targetRoll || v.rollNo === targetRoll)) return true;
                        return false;
                    });
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
                totalStudents: deduplicatedStudents.length,
                evaluatedCount: evaluatedStudents.length,
                passedCount,
                failedCount,
                passingRate: evaluatedStudents.length > 0 ? ((passedCount / evaluatedStudents.length) * 100).toFixed(1) : '0',
                highestPercentage: highestPct.toFixed(1),
                averagePercentage: avgPct.toFixed(1)
            }
        };
    }, [students, classMarksDocs, classAttendanceDocs, selectedExamId, currentExam, currentClass, isDemoMode, demoDataOverride, liveModerationOverrides, selectedSession, aggregateConfig]);

    // Helper: Grade & Remarks Calculator (Dynamically adapts to Standard or School Custom Scale)
    function calculateGrade(obtained, total) {
        if (obtained === null || total <= 0) return '-';
        const pct = (obtained / total) * 100;
        return getGradeAndRemarksFromScale(pct, aggregateConfig?.customGradingScale, aggregateConfig?.gradingScaleMode).grade;
    }

    function calculateRemarks(obtained, total) {
        if (obtained === null || total <= 0) return '—';
        const pct = (obtained / total) * 100;
        return getGradeAndRemarksFromScale(pct, aggregateConfig?.customGradingScale, aggregateConfig?.gradingScaleMode).remarks;
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
                const cleanA = String(a.rollNumber || '').replace(/\D/g, '');
                const cleanB = String(b.rollNumber || '').replace(/\D/g, '');
                const numA = cleanA !== '' ? parseInt(cleanA, 10) : null;
                const numB = cleanB !== '' ? parseInt(cleanB, 10) : null;
                if (numA !== null && numB !== null && numA !== numB) {
                    return sortOrder === 'asc' ? numA - numB : numB - numA;
                }
                const cmp = String(a.rollNumber || '').localeCompare(String(b.rollNumber || ''), undefined, { numeric: true });
                if (cmp !== 0) return sortOrder === 'asc' ? cmp : -cmp;
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
        if (exam.isLocked) {
            alert("🔒 This examination is permanently locked because this academic session has been finalized and students were promoted. Editing is disabled to preserve historical integrity.");
            return;
        }
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

        if (editingExam && editingExam.isLocked) {
            alert("🔒 This examination is locked and cannot be edited.");
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
        const targetExam = exams.find(e => e.id === examId);
        if (targetExam && targetExam.isLocked) {
            alert("🔒 This examination is permanently locked because this academic session has been finalized and students were promoted. It cannot be deleted.");
            return;
        }

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

    const handleToggleExamStatus = async (exam) => {
        if (!schoolId || !exam.id) return;
        if (exam.isLocked) {
            alert("🔒 This examination is permanently locked following student promotions. Its lifecycle status cannot be changed.");
            return;
        }
        const nextStatus = exam.status === 'active' ? 'completed' : 'active';
        try {
            await updateDoc(doc(db, `schools/${schoolId}/exams`, exam.id), {
                status: nextStatus,
                updatedAt: serverTimestamp()
            });
            setUploadSuccessMessage(`Exam status updated to "${nextStatus.toUpperCase()}"!`);
            setTimeout(() => setUploadSuccessMessage(null), 3500);
        } catch (err) {
            console.error("Toggle exam status error:", err);
            alert("Failed to update status: " + err.message);
        }
    };

    const handleSaveAggregateConfig = async (newConfig) => {
        if (!schoolId) return;
        setIsSavingAggregateConfig(true);
        try {
            const settingsRef = doc(db, `schools/${schoolId}/settings`, 'exam_settings');
            await setDoc(settingsRef, {
                ...newConfig,
                updatedAt: serverTimestamp()
            }, { merge: true });
            setAggregateConfig(newConfig);
            setShowAggregateModal(false);
            setUploadSuccessMessage('✅ Annual aggregate formula & weights saved successfully!');
            setTimeout(() => setUploadSuccessMessage(null), 4000);
        } catch (err) {
            console.error("Save aggregate config error:", err);
            alert("Failed to save aggregate settings: " + err.message);
        } finally {
            setIsSavingAggregateConfig(false);
        }
    };

    // --- Actions: Export CSV ---
    const handleExportCSV = () => {
        if (tabulationData.rows.length === 0) return;

        if (tabulationData.isAggregate) {
            const termHeaders = (tabulationData.aggregateTerms || []).map(t => `"${t.title} (${aggregateConfig.mode === 'custom' ? (t.weight + '%') : 'Auto'})"`);
            const headers = ['Roll No', 'Student Name', 'Father Name', ...termHeaders, 'Total Obtained', 'Max Marks', 'Final Percentage', 'Grade', 'Annual Position', 'Status'];
            const csvRows = [headers.join(',')];

            tabulationData.rows.forEach(r => {
                const termScores = (tabulationData.aggregateTerms || []).map(t => {
                    const tb = r.termBreakdown?.[t.id];
                    if (!tb || !tb.hasMarks) return '"—"';
                    return `"${tb.obtained}/${tb.max} (${tb.percentage}%)"`;
                });

                const rowData = [
                    `"${r.rollNumber}"`,
                    `"${r.name}"`,
                    `"${r.fatherName}"`,
                    ...termScores,
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
            link.setAttribute('download', `${currentClass.name}_Annual_Consolidated_Gazette_${selectedSession}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
        }

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
                        min-height: ${isLandscape ? '190mm' : '275mm'};
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
        const hasSubjectMultiTerm = Boolean(tabulationData.isAggregate && studentRow.subjectMultiTerm && Object.keys(studentRow.subjectMultiTerm).length > 0);
        const isLandscape = hasSubjectMultiTerm;

        return `
            <div class="dmc-sheet">
                <div style="border: 2.5px double #0f172a; padding: 12px 16px; display: flex; flex-direction: column; justify-content: space-between; min-height: ${isLandscape ? '185mm' : '270mm'}; box-sizing: border-box;">
                    
                    <!-- Top School Header -->
                    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                        <div style="width: 70px; height: 70px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            ${schoolLogo ? `<img src="${schoolLogo}" alt="Logo" style="max-width: 68px; max-height: 68px; object-fit: contain;" />` : `<div style="width: 60px; height: 60px; border-radius: 50%; border: 2px solid #0f172a; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 18px; color: #0f172a;">${(schoolProfile.name || 'SC').substring(0, 2).toUpperCase()}</div>`}
                        </div>
                        <div style="flex: 1; text-align: center;">
                            <h1 style="margin: 0; font-size: 19px; font-weight: 900; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px;">${schoolProfile.name || 'SMART PUBLIC SCHOOL'}</h1>
                            <p style="margin: 2px 0 0 0; font-size: 10px; color: #475569; font-weight: 600;">${schoolProfile.address || 'Campus Address'} ${schoolProfile.phone ? '• Phone: ' + schoolProfile.phone : ''}</p>
                            <div style="display: inline-block; margin-top: 5px; background: #0f172a; color: #ffffff; padding: 3px 14px; border-radius: 12px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
                                ${currentExam.title || 'Term Examination'} — Detailed Marks Certificate (DMC)
                            </div>
                        </div>
                        <div style="width: 70px; display: flex; justify-content: flex-end; flex-shrink: 0;">
                            ${studentPhoto ? `<img src="${studentPhoto}" alt="Photo" style="width: 60px; height: 70px; object-fit: cover; border: 1px solid #cbd5e1; border-radius: 4px;" />` : `<div style="width: 60px; height: 70px; border: 1px dashed #cbd5e1; border-radius: 4px; background: #f8fafc; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #94a3b8; font-weight: 700; text-align: center;">PHOTO</div>`}
                        </div>
                    </div>

                    <!-- Student Details Strip -->
                    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 12px; margin-bottom: 10px; display: grid; grid-template-columns: ${isLandscape ? 'repeat(4, 1fr)' : '1fr 1fr'}; gap: 6px 12px; font-size: ${isLandscape ? '10px' : '11px'};">
                        <div><span style="color: #64748b; font-weight: 700;">Student Name:</span> <strong style="color: #0f172a; text-transform: uppercase;">${studentRow.name || ''}</strong></div>
                        <div><span style="color: #64748b; font-weight: 700;">Class / Section:</span> <strong style="color: #0f172a; text-transform: uppercase;">${currentClass.name || ''}</strong></div>
                        <div><span style="color: #64748b; font-weight: 700;">Roll Number:</span> <strong style="color: #4f46e5;">${studentRow.rollNumber || 'N/A'}</strong></div>
                        <div><span style="color: #64748b; font-weight: 700;">Date of Issue:</span> <strong style="color: #0f172a;">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>
                        <div><span style="color: #64748b; font-weight: 700;">Father's Name:</span> <strong style="color: #0f172a;">${studentRow.fatherName || 'N/A'}</strong></div>
                        <div><span style="color: #64748b; font-weight: 700;">Examination:</span> <strong style="color: #0f172a;">${tabulationData.isAggregate ? 'Annual Consolidated' : (currentExam.title || 'Term Exam')}</strong></div>
                        <div><span style="color: #64748b; font-weight: 700;">Academic Session:</span> <strong style="color: #0f172a;">${currentExam.session || '2025-2026'}</strong></div>
                        <div><span style="color: #64748b; font-weight: 700;">Overall Attendance:</span> <strong style="color: #059669;">${studentRow.attendance || '—'}</strong></div>
                    </div>

                    <!-- Subject or Annual Term Breakdown Table -->
                    <table style="width: 100%; border-collapse: collapse; font-size: ${isLandscape ? '10px' : '11px'}; margin-bottom: 10px;">
                        ${hasSubjectMultiTerm ? `
                            <thead>
                                <tr style="background: #0f172a; color: #ffffff; font-weight: 800; font-size: 10px;">
                                    <th rowspan="2" style="border: 1px solid #334155; padding: 5px 3px; width: 28px; text-align: center;">Sr.</th>
                                    <th rowspan="2" style="border: 1px solid #334155; padding: 5px 8px; text-align: left; min-width: 125px;">Subject Name</th>
                                    ${(tabulationData.aggregateTerms || []).map(term => {
                                        const tb = studentRow.termBreakdown?.[term.id];
                                        const attdStr = tb?.attendance || '—';
                                        return `
                                        <th colspan="4" style="border: 1px solid #334155; padding: 4px; text-align: center;">
                                            <div style="font-size: 10px; font-weight: 800; text-transform: uppercase;">${term.title.replace(' Examination', '').replace(' Assessment', '')}</div>
                                            <div style="font-size: 8px; font-weight: 600; color: #94a3b8;">Weight: ${term.weight}% • Attd: ${attdStr}</div>
                                        </th>
                                        `;
                                    }).join('')}
                                    <th colspan="5" style="border: 1px solid #334155; padding: 4px; text-align: center; background: #1e293b;">
                                        <div style="font-size: 10px; font-weight: 800; text-transform: uppercase;">Annual Consolidated</div>
                                        <div style="font-size: 8px; font-weight: 600; color: #94a3b8;">Final Result • Attd: ${studentRow.attendance || '—'}</div>
                                    </th>
                                </tr>
                                <tr style="background: #1e293b; color: #cbd5e1; font-weight: 700; font-size: 9px;">
                                    ${(tabulationData.aggregateTerms || []).map(() => `
                                        <th style="border: 1px solid #334155; padding: 3px 2px; width: 34px; text-align: center;">Total</th>
                                        <th style="border: 1px solid #334155; padding: 3px 2px; width: 34px; text-align: center;">Obt</th>
                                        <th style="border: 1px solid #334155; padding: 3px 2px; width: 34px; text-align: center;">Grd</th>
                                        <th style="border: 1px solid #334155; padding: 3px 2px; width: 36px; text-align: center;">W %</th>
                                    `).join('')}
                                    <th style="border: 1px solid #334155; padding: 3px 2px; width: 42px; text-align: center;">Total</th>
                                    <th style="border: 1px solid #334155; padding: 3px 2px; width: 42px; text-align: center;">Obt</th>
                                    <th style="border: 1px solid #334155; padding: 3px 2px; width: 40px; text-align: center;">%</th>
                                    <th style="border: 1px solid #334155; padding: 3px 2px; width: 44px; text-align: center;">Grade</th>
                                    <th style="border: 1px solid #334155; padding: 3px 4px; min-width: 60px; text-align: center;">Remarks</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.entries(studentRow.subjectMultiTerm).map(([subj, sm], idx) => `
                                    <tr style="border-bottom: 1px solid #cbd5e1; ${idx % 2 === 1 ? 'background: #f8fafc;' : ''}">
                                        <td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; color: #64748b; font-weight: 600;">${idx + 1}</td>
                                        <td style="border: 1px solid #cbd5e1; padding: 4px 8px; font-weight: 700; color: #0f172a;">${subj}</td>
                                        ${(tabulationData.aggregateTerms || []).map(term => {
                                            const td = sm.terms?.[term.id];
                                            if (!td || td.obtained === null || td.obtained === undefined) {
                                                return `<td colspan="4" style="border: 1px solid #cbd5e1; padding: 4px 2px; text-align: center; color: #64748b; font-weight: 700;">-</td>`;
                                            }
                                            const scoreVal = td.isAbsent ? 'ABS' : td.obtained;
                                            const gradeVal = td.isAbsent ? 'ABS' : (td.grade || calculateGrade(td.obtained, td.max || 100));
                                            const wPct = td.weightedPercentage !== undefined ? `${td.weightedPercentage}%` : '—';
                                            return `
                                                <td style="border: 1px solid #cbd5e1; padding: 4px 2px; text-align: center; color: #64748b; font-weight: 600;">${td.max || 100}</td>
                                                <td style="border: 1px solid #cbd5e1; padding: 4px 2px; text-align: center; font-weight: 800; color: #0f172a;">${scoreVal}</td>
                                                <td style="border: 1px solid #cbd5e1; padding: 4px 2px; text-align: center; font-weight: 800; color: #4f46e5;">${gradeVal}</td>
                                                <td style="border: 1px solid #cbd5e1; padding: 4px 2px; text-align: center; font-weight: 700; color: #4f46e5;">${wPct}</td>
                                            `;
                                        }).join('')}
                                        <td style="border: 1px solid #cbd5e1; padding: 4px 2px; text-align: center; color: #64748b; font-weight: 700;">${sm.totalMax}</td>
                                        <td style="border: 1px solid #cbd5e1; padding: 4px 2px; text-align: center; font-weight: 900; color: #0f172a;">${sm.totalObtained !== null ? sm.totalObtained : '—'}</td>
                                        <td style="border: 1px solid #cbd5e1; padding: 4px 2px; text-align: center; font-weight: 800; color: #4f46e5;">${sm.totalObtained !== null ? `${sm.percentage}%` : '—'}</td>
                                        <td style="border: 1px solid #cbd5e1; padding: 4px 2px; text-align: center; font-weight: 800;">
                                            ${sm.totalObtained !== null ? (sm.isPending ? '<span style="color: #64748b; font-weight: 700;">-</span>' : sm.grade) : '—'}
                                        </td>
                                        <td style="border: 1px solid #cbd5e1; padding: 4px 4px; text-align: center; font-size: 8.5px; font-weight: 700; color: #475569;">
                                            ${sm.totalObtained !== null ? (sm.isPending ? '-' : (sm.remarks || '—')) : '—'}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                            <tfoot>
                                <tr style="background: #f1f5f9; font-weight: 900; border-top: 1.5px solid #0f172a;">
                                    <td colspan="2" style="border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.5px;">Annual Consolidated Total</td>
                                    ${(tabulationData.aggregateTerms || []).map(term => {
                                        const tb = studentRow.termBreakdown?.[term.id];
                                        if (!tb || !tb.hasMarks) {
                                            return `<td colspan="4" style="border: 1px solid #cbd5e1; padding: 5px 2px; text-align: center; color: #64748b; font-weight: 700;">-</td>`;
                                        }
                                        const wPct = tb.weightedPercentage !== undefined ? `${tb.weightedPercentage}%` : '—';
                                        return `
                                            <td style="border: 1px solid #cbd5e1; padding: 5px 2px; text-align: center; color: #64748b; font-weight: 700;">${tb.max}</td>
                                            <td style="border: 1px solid #cbd5e1; padding: 5px 2px; text-align: center; color: #0f172a; font-weight: 900;">${tb.obtained}</td>
                                            <td style="border: 1px solid #cbd5e1; padding: 5px 2px; text-align: center; color: #4f46e5; font-weight: 800;">${tb.grade || '—'}</td>
                                            <td style="border: 1px solid #cbd5e1; padding: 5px 2px; text-align: center; color: #4f46e5; font-weight: 800;">${wPct}</td>
                                        `;
                                    }).join('')}
                                    <td style="border: 1px solid #cbd5e1; padding: 5px 2px; text-align: center; font-weight: 800; color: #64748b;">${studentRow.totalMax}</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 5px 2px; text-align: center; color: #4f46e5; font-size: 11px; font-weight: 900;">${studentRow.totalObtained}</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 5px 2px; text-align: center; color: #4f46e5; font-size: 11px; font-weight: 800;">${studentRow.percentage}%</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 5px 2px; text-align: center; color: #4f46e5; font-size: 11px; font-weight: 800;">
                                        ${isPending ? '<span style="color: #64748b; font-weight: 700;">-</span>' : studentRow.grade}
                                    </td>
                                    <td style="border: 1px solid #cbd5e1; padding: 5px 4px; text-align: center; font-size: 9px; font-weight: 800; color: ${isPending ? '#64748b' : isPassed ? '#059669' : '#e11d48'};">
                                        ${isPending ? '-' : (studentRow.remarks || (isPassed ? 'Passed' : 'Failed'))}
                                    </td>
                                </tr>
                            </tfoot>
                        ` : tabulationData.isAggregate ? `
                            <thead>
                                <tr style="background: #f1f5f9; color: #0f172a; font-weight: 800; border-bottom: 1.5px solid #0f172a;">
                                    <th style="border: 1px solid #cbd5e1; padding: 6px; width: 35px; text-align: center;">Sr.</th>
                                    <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: left;">Term Examination</th>
                                    <th style="border: 1px solid #cbd5e1; padding: 6px; width: 75px; text-align: center;">Weight</th>
                                    <th style="border: 1px solid #cbd5e1; padding: 6px; width: 75px; text-align: center;">Max Marks</th>
                                    <th style="border: 1px solid #cbd5e1; padding: 6px; width: 85px; text-align: center;">Obtained</th>
                                    <th style="border: 1px solid #cbd5e1; padding: 6px; width: 65px; text-align: center;">Percentage</th>
                                    <th style="border: 1px solid #cbd5e1; padding: 6px; width: 55px; text-align: center;">Grade</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(tabulationData.aggregateTerms || []).map((term, idx) => {
                                    const tb = studentRow.termBreakdown?.[term.id];
                                    const hasData = tb && tb.hasMarks;
                                    return `
                                        <tr>
                                            <td style="border: 1px solid #cbd5e1; padding: 5px; text-align: center; color: #64748b;">${idx + 1}</td>
                                            <td style="border: 1px solid #cbd5e1; padding: 5px; font-weight: 700; color: #0f172a;">${term.title}</td>
                                            <td style="border: 1px solid #cbd5e1; padding: 5px; text-align: center; font-weight: 700; color: #4f46e5;">${term.weight}%</td>
                                            <td style="border: 1px solid #cbd5e1; padding: 5px; text-align: center;">${hasData ? tb.max : '-'}</td>
                                            <td style="border: 1px solid #cbd5e1; padding: 5px; text-align: center; font-weight: 900; color: #0f172a;">${hasData ? tb.obtained : '-'}</td>
                                            <td style="border: 1px solid #cbd5e1; padding: 5px; text-align: center; font-weight: 800; color: #4f46e5;">${hasData ? `${tb.percentage}%` : '—'}</td>
                                            <td style="border: 1px solid #cbd5e1; padding: 5px; text-align: center; font-weight: 800;">${hasData ? tb.grade : '—'}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                            <tfoot>
                                <tr style="background: #f8fafc; font-weight: 900; border-top: 1.5px solid #0f172a;">
                                    <td colspan="3" style="border: 1px solid #cbd5e1; padding: 6px; text-align: left; text-transform: uppercase;">Annual Consolidated Aggregate</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${studentRow.totalMax}</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; color: #4f46e5; font-size: 13px;">${studentRow.totalObtained}</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; color: #4f46e5; font-size: 13px;">${studentRow.percentage}%</td>
                                    <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; color: #4f46e5; font-size: 13px;">
                                        ${isPending ? '<span style="color: #64748b; font-weight: 700;">-</span>' : studentRow.grade}
                                    </td>
                                </tr>
                            </tfoot>
                        ` : `
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
                                ${(tabulationData.subjects || []).map((subj, idx) => {
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
                                    <td style="border: 1px solid #cbd5e1; padding: 6px; font-size: 10px; font-weight: 800; color: ${isPending ? '#64748b' : isPassed ? '#059669' : '#e11d48'};">
                                        ${isPending ? '-' : (isPassed ? 'PROMOTED / PASSED' : 'FAILED / DETAINED')}
                                    </td>
                                </tr>
                            </tfoot>
                        `}
                    </table>

                    <!-- Summary Metrics Box -->
                    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; display: grid; grid-template-columns: repeat(5, 1fr); text-align: center;">
                        <div style="border-right: 1px solid #e2e8f0; padding: 0 4px;">
                            <div style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase;">Total Marks</div>
                            <div style="font-size: 13px; font-weight: 900; color: #0f172a; margin-top: 2px;">
                                ${studentRow.totalObtained} <span style="font-size: 10px; color: #64748b; font-weight: 600;">/ ${studentRow.totalMax}</span>
                            </div>
                        </div>
                        <div style="border-right: 1px solid #e2e8f0; padding: 0 4px;">
                            <div style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase;">Percentage</div>
                            <div style="font-size: 14px; font-weight: 900; color: #0f172a; margin-top: 2px;">${studentRow.percentage}%</div>
                        </div>
                        <div style="border-right: 1px solid #e2e8f0; padding: 0 4px;">
                            <div style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase;">Grade</div>
                            <div style="font-size: 14px; font-weight: 900; color: #4f46e5; margin-top: 2px;">${isPending ? '-' : studentRow.grade}</div>
                        </div>
                        <div style="border-right: 1px solid #e2e8f0; padding: 0 4px;">
                            <div style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase;">Class Position</div>
                            <div style="font-size: 14px; font-weight: 900; color: #059669; margin-top: 2px;">${getOrdinal(studentRow.position)}</div>
                        </div>
                        <div style="padding: 0 4px;">
                            <div style="font-size: 9px; color: #64748b; font-weight: 800; text-transform: uppercase;">Final Status</div>
                            <div style="font-size: 13px; font-weight: 900; margin-top: 2px; color: ${isPending ? '#64748b' : isPassed ? '#059669' : '#e11d48'};">
                                ${isPending ? '-' : (isPassed ? 'PASSED' : 'FAILED')}
                            </div>
                        </div>
                    </div>

                    <!-- Dynamic Grading Scale & Remarks Legend Matrix -->
                    ${(() => {
                        const activeScale = (aggregateConfig?.gradingScaleMode === 'custom' && Array.isArray(aggregateConfig?.customGradingScale) && aggregateConfig.customGradingScale.length > 0)
                            ? aggregateConfig.customGradingScale
                            : DEFAULT_GRADING_SCALE;
                        const sortedScale = [...activeScale].sort((a, b) => Number(b.minPct) - Number(a.minPct));
                        return `
                            <div style="border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; margin-bottom: 16px; background: #ffffff;">
                                <table style="width: 100%; border-collapse: collapse; font-size: 7.5px; text-align: center;">
                                    <thead>
                                        <tr style="background: #0f172a; color: #ffffff;">
                                            <th style="padding: 2.5px 4px; border: 1px solid #334155; font-size: 8px; font-weight: 800; text-align: left; width: 68px; background: #1e293b; text-transform: uppercase;">Grade Scale</th>
                                            ${sortedScale.map(t => `<th style="padding: 2.5px 2px; border: 1px solid #334155; font-weight: 900; color: #38bdf8; font-size: 8.5px;">${t.grade}</th>`).join('')}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr style="background: #f8fafc;">
                                            <td style="padding: 2.5px 4px; border: 1px solid #cbd5e1; font-weight: 800; color: #334155; text-align: left; font-size: 7.5px;">Marks Range (%)</td>
                                            ${sortedScale.map((t, idx, arr) => {
                                                const min = t.minPct;
                                                const prevMin = idx > 0 ? arr[idx - 1].minPct - 1 : 100;
                                                const rangeStr = idx === 0 ? `${min}% – 100%` : (min === 0 ? `< ${arr[idx - 1].minPct}%` : `${min}% – ${prevMin}%`);
                                                return `<td style="padding: 2.5px 2px; border: 1px solid #cbd5e1; font-weight: 700; color: #0f172a;">${rangeStr}</td>`;
                                            }).join('')}
                                        </tr>
                                        <tr>
                                            <td style="padding: 2.5px 4px; border: 1px solid #cbd5e1; font-weight: 800; color: #334155; text-align: left; font-size: 7.5px;">Official Remarks</td>
                                            ${sortedScale.map(t => `<td style="padding: 2.5px 2px; border: 1px solid #cbd5e1; font-style: italic; color: #475569; font-size: 7px; font-weight: 600;">${t.remarks}</td>`).join('')}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        `;
                    })()}

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
        const isLandscape = Boolean(tabulationData.isAggregate && studentRow.subjectMultiTerm && Object.keys(studentRow.subjectMultiTerm).length > 0);
        printHtmlInIframe(html, title, isLandscape);
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
        const isLandscape = Boolean(tabulationData.isAggregate && selectedRows.some(r => r.subjectMultiTerm && Object.keys(r.subjectMultiTerm).length > 0));
        printHtmlInIframe(html, title, isLandscape);
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
                            ${tabulationData.isAggregate
                                ? (tabulationData.aggregateTerms || []).map(t => `<th style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; min-width: 65px;">${t.title}<br/><span style="font-size: 8px; font-weight: normal; color: #64748b;">${aggregateConfig.mode === 'custom' ? (t.weight + '%') : 'Auto'}</span></th>`).join('')
                                : tabulationData.subjects.map(s => `<th style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; min-width: 50px;">${s}</th>`).join('')
                            }
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
                                    ${tabulationData.isAggregate
                                        ? (tabulationData.aggregateTerms || []).map(t => {
                                            const tb = row.termBreakdown?.[t.id];
                                            const val = tb && tb.hasMarks ? `${tb.obtained}/${tb.max}<br/><span style="font-size: 8px; color: #64748b;">(${tb.percentage}%)</span>` : '—';
                                            return `<td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; font-weight: 700;">${val}</td>`;
                                        }).join('')
                                        : tabulationData.subjects.map(s => {
                                            const m = row?.subjectMarks?.[s];
                                            const val = m ? (m.isAbsent ? 'ABS' : (m.obtained !== null && m.obtained !== undefined) ? m.obtained : '—') : '—';
                                            return `<td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; font-weight: 700;">${val}</td>`;
                                        }).join('')
                                    }
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
        const hasSubjectMultiTerm = Boolean(tabulationData.isAggregate && studentRow.subjectMultiTerm && Object.keys(studentRow.subjectMultiTerm).length > 0);
        const isLandscape = hasSubjectMultiTerm;

        const doc = new jsPDF({
            orientation: isLandscape ? 'landscape' : 'portrait',
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
        const photoX = pageWidth - 14 - 20; // Auto adapts to landscape
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
        doc.text((schoolProfile.name || 'SMART PUBLIC SCHOOL').toUpperCase(), pageWidth / 2, 20, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        const contactInfo = `${schoolProfile.address || 'Campus Address'} ${schoolProfile.phone ? '• Phone: ' + schoolProfile.phone : ''}`;
        doc.text(contactInfo, pageWidth / 2, 25.5, { align: 'center' });

        // Title Badge
        doc.setFillColor(30, 41, 59);
        doc.roundedRect(pageWidth / 2 - 50, 30, 100, 6.5, 3, 3, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text('DETAILED MARKS CERTIFICATE (DMC)', pageWidth / 2, 34.5, { align: 'center' });

        // 3. Student Details Box
        if (isLandscape) {
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.3);
            doc.roundedRect(14, 39, pageWidth - 28, 15, 2, 2, 'FD');

            const usableW = pageWidth - 28;
            const cWidth = usableW / 4;
            const c1 = 17;
            const c2 = 17 + cWidth;
            const c3 = 17 + cWidth * 2;
            const c4 = 17 + cWidth * 3;

            // Row 1 (Y = 44.5)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text('STUDENT NAME:', c1, 44.5);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            doc.text((studentRow.name || '').toUpperCase(), c1 + 25, 44.5, { maxWidth: cWidth - 26 });

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text('CLASS / SEC:', c2, 44.5);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            doc.text((currentClass.name || '').toUpperCase(), c2 + 20, 44.5, { maxWidth: cWidth - 21 });

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text('ROLL NUMBER:', c3, 44.5);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(79, 70, 229);
            doc.text(studentRow.rollNumber || 'N/A', c3 + 24, 44.5, { maxWidth: cWidth - 25 });

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text('DATE OF ISSUE:', c4, 44.5);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(15, 23, 42);
            doc.text(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), c4 + 24, 44.5, { maxWidth: cWidth - 25 });

            // Row 2 (Y = 50.5)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text("FATHER'S NAME:", c1, 50.5);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            doc.text(studentRow.fatherName || 'N/A', c1 + 25, 50.5, { maxWidth: cWidth - 26 });

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text('EXAMINATION:', c2, 50.5);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(15, 23, 42);
            const examLabel = tabulationData.isAggregate ? 'Annual Consolidated' : (currentExam.title || 'Term Exam');
            doc.text(examLabel, c2 + 23, 50.5, { maxWidth: cWidth - 24 });

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text('SESSION:', c3, 50.5);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            doc.text(currentExam.session || '2025-2026', c3 + 16, 50.5, { maxWidth: cWidth - 17 });

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text('OVERALL ATTD:', c4, 50.5);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(5, 150, 105);
            doc.text(studentRow.attendance || '—', c4 + 24, 50.5, { maxWidth: cWidth - 25 });
        } else {
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
        }

        // 4. Marks Table (autoTable) - Adapts to Single Term vs Multi-Term Subject Comparison vs Term Aggregate
        const terms = tabulationData.aggregateTerms || [];

        let tableHead;
        if (hasSubjectMultiTerm) {
            const headRow1 = [
                { content: 'Sr.', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                { content: 'Subject Name', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
                ...terms.map(t => {
                    const tb = studentRow.termBreakdown?.[t.id];
                    const attdStr = tb?.attendance ? `\nAttd: ${tb.attendance}` : '';
                    return {
                        content: `${t.title.replace(' Examination', '').replace(' Assessment', '')} (${t.weight}%)${attdStr}`,
                        colSpan: 4,
                        styles: { halign: 'center' }
                    };
                }),
                {
                    content: `Annual Consolidated\nFinal Result`,
                    colSpan: 5,
                    styles: { halign: 'center', fillColor: [30, 41, 59] }
                }
            ];
            const headRow2 = [
                ...terms.flatMap(() => [
                    { content: 'Total', styles: { halign: 'center' } },
                    { content: 'Obt', styles: { halign: 'center' } },
                    { content: 'Grd', styles: { halign: 'center' } },
                    { content: 'W %', styles: { halign: 'center' } }
                ]),
                { content: 'Total', styles: { halign: 'center' } },
                { content: 'Obt', styles: { halign: 'center' } },
                { content: '%', styles: { halign: 'center' } },
                { content: 'Grade', styles: { halign: 'center' } },
                { content: 'Remarks', styles: { halign: 'center' } }
            ];
            tableHead = [headRow1, headRow2];
        } else if (tabulationData.isAggregate) {
            tableHead = [['Sr.', 'Term Examination', 'Max Marks', 'Pass Marks', 'Marks Obtained', 'Percentage', 'Grade']];
        } else {
            tableHead = [['Sr.', 'Subject Name', 'Total Marks', 'Pass Marks', 'Marks Obtained', 'Grade', 'Remarks']];
        }

        const tableBody = hasSubjectMultiTerm
            ? Object.entries(studentRow.subjectMultiTerm).map(([subj, sm], idx) => {
                const rowCells = [
                    idx + 1,
                    subj
                ];
                terms.forEach(t => {
                    const td = sm.terms?.[t.id];
                    if (!td || td.obtained === null || td.obtained === undefined) {
                        rowCells.push({ content: '-', colSpan: 4, styles: { halign: 'center', textColor: [100, 116, 139] } });
                    } else {
                        const score = td.isAbsent ? 'ABS' : td.obtained;
                        const gradeVal = td.isAbsent ? 'ABS' : (td.grade || calculateGrade(td.obtained, td.max || 100));
                        const wPct = td.weightedPercentage !== undefined ? `${td.weightedPercentage}%` : '—';
                        rowCells.push(td.max || 100);
                        rowCells.push(score);
                        rowCells.push(gradeVal);
                        rowCells.push(wPct);
                    }
                });
                rowCells.push(sm.totalMax);
                rowCells.push(sm.totalObtained !== null ? sm.totalObtained : '—');
                rowCells.push(sm.totalObtained !== null ? `${sm.percentage}%` : '—');
                rowCells.push(sm.totalObtained !== null ? (sm.isPending ? { content: '-', styles: { halign: 'center', textColor: [100, 116, 139] } } : sm.grade) : '—');
                rowCells.push(sm.totalObtained !== null ? (sm.isPending ? { content: '-', styles: { halign: 'center', textColor: [100, 116, 139] } } : (sm.remarks || '—')) : '—');
                return rowCells;
            })
            : tabulationData.isAggregate
            ? terms.map((t, idx) => {
                const tb = studentRow.termBreakdown?.[t.id];
                const totalMarks = tb?.max || 100;
                const passMarks = Math.round(totalMarks * 0.33);
                const obtained = tb && tb.hasMarks ? tb.obtained : '-';
                const percentage = tb && tb.hasMarks ? `${tb.percentage}%` : '—';
                const grade = tb && tb.hasMarks ? tb.grade : '—';
                return [idx + 1, t.title, totalMarks, passMarks, obtained, percentage, grade];
            })
            : tabulationData.subjects.map((subj, idx) => {
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

        const tableFoot = hasSubjectMultiTerm
            ? [[
                { content: 'ANNUAL CONSOLIDATED TOTAL', colSpan: 2, styles: { halign: 'left', fontStyle: 'bold' } },
                ...terms.flatMap(t => {
                    const tb = studentRow.termBreakdown?.[t.id];
                    if (!tb || !tb.hasMarks) {
                        return [{ content: '-', colSpan: 4, styles: { halign: 'center', textColor: [100, 116, 139] } }];
                    }
                    const wPct = tb.weightedPercentage !== undefined ? `${tb.weightedPercentage}%` : '—';
                    return [
                        tb.max,
                        tb.obtained,
                        tb.grade || '—',
                        wPct
                    ];
                }),
                studentRow.totalMax,
                studentRow.totalObtained,
                `${studentRow.percentage}%`,
                !studentRow.isComplete ? { content: '-', styles: { halign: 'center', textColor: [100, 116, 139] } } : studentRow.grade,
                !studentRow.isComplete ? { content: '-', styles: { halign: 'center', textColor: [100, 116, 139] } } : (studentRow.remarks || (studentRow.isPassed ? 'Passed' : 'Failed'))
            ]]
            : [[
                '—',
                tabulationData.isAggregate ? 'ANNUAL AGGREGATE' : 'GRAND TOTAL',
                studentRow.totalMax,
                '—',
                studentRow.totalObtained,
                tabulationData.isAggregate ? `${studentRow.percentage}%` : studentRow.grade,
                tabulationData.isAggregate ? (!studentRow.isComplete ? '-' : studentRow.grade) : (!studentRow.isComplete ? '-' : (studentRow.isPassed ? 'PROMOTED / PASSED' : 'FAILED / DETAINED'))
            ]];

        autoTable(doc, {
            startY: isLandscape ? 57 : 72,
            margin: { left: 14, right: 14 },
            head: tableHead,
            body: tableBody,
            foot: tableFoot,
            theme: 'grid',
            styles: {
                fontSize: isLandscape ? 7 : 8.5,
                cellPadding: isLandscape ? 1.5 : 3,
                textColor: [15, 23, 42],
                lineColor: [203, 213, 225],
                lineWidth: 0.2
            },
            headStyles: {
                fillColor: [15, 23, 42],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'center'
            },
            footStyles: {
                fillColor: [241, 245, 249],
                textColor: [15, 23, 42],
                fontStyle: 'bold',
                halign: 'center'
            },
            columnStyles: hasSubjectMultiTerm ? {
                0: { halign: 'center', cellWidth: 7 },
                1: { halign: 'left', fontStyle: 'bold' }
            } : {
                0: { halign: 'center', cellWidth: 10 },
                1: { halign: 'left', fontStyle: 'bold', cellWidth: 42 },
                2: { halign: 'center', cellWidth: 24 },
                3: { halign: 'center', cellWidth: 24 },
                4: { halign: 'center', fontStyle: 'bold', cellWidth: 28 },
                5: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
                6: { halign: 'left', fontStyle: 'italic', cellWidth: 'auto' }
            }
        });

        const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : (isLandscape ? 130 : 160);

        // 5. Summary Strip Box
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(14, finalY + 3.5, pageWidth - 28, isLandscape ? 11.5 : 16, 2, 2, 'FD');

        const colWidth = (pageWidth - 28) / 5;
        const boxContentY = finalY + (isLandscape ? 7.5 : 10);
        const boxValY = finalY + (isLandscape ? 12.5 : 17);
        
        // 1. Total Marks
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text('TOTAL MARKS', 14 + colWidth * 0.5, boxContentY, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`${studentRow.totalObtained} / ${studentRow.totalMax}`, 14 + colWidth * 0.5, boxValY, { align: 'center' });

        // 2. Percentage
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text('PERCENTAGE', 14 + colWidth * 1.5, boxContentY, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(`${studentRow.percentage}%`, 14 + colWidth * 1.5, boxValY, { align: 'center' });

        // 3. Overall Grade
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text('OVERALL GRADE', 14 + colWidth * 2.5, boxContentY, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(79, 70, 229);
        doc.text(!studentRow.isComplete ? '-' : `${studentRow.grade}`, 14 + colWidth * 2.5, boxValY, { align: 'center' });

        // 4. Class Position
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text('CLASS POSITION', 14 + colWidth * 3.5, boxContentY, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(16, 185, 129);
        doc.text(`${getOrdinal(studentRow.position)}`, 14 + colWidth * 3.5, boxValY, { align: 'center' });

        // 5. Final Status
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text('RESULT STATUS', 14 + colWidth * 4.5, boxContentY, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        if (!studentRow.isComplete) {
            doc.setTextColor(100, 116, 139);
            doc.text('-', 14 + colWidth * 4.5, boxValY, { align: 'center' });
        } else if (studentRow.isPassed) {
            doc.setTextColor(16, 185, 129);
            doc.text('PASSED', 14 + colWidth * 4.5, boxValY, { align: 'center' });
        } else {
            doc.setTextColor(225, 29, 72);
            doc.text('FAILED', 14 + colWidth * 4.5, boxValY, { align: 'center' });
        }

        // Dynamic Grading Scale & Remarks Legend Matrix in PDF
        const activePdfScale = (aggregateConfig?.gradingScaleMode === 'custom' && Array.isArray(aggregateConfig?.customGradingScale) && aggregateConfig.customGradingScale.length > 0)
            ? aggregateConfig.customGradingScale
            : DEFAULT_GRADING_SCALE;
        const sortedPdfScale = [...activePdfScale].sort((a, b) => Number(b.minPct) - Number(a.minPct));

        const sigY = isLandscape ? pageHeight - 16 : pageHeight - 30;

        autoTable(doc, {
            startY: isLandscape ? finalY + 17 : finalY + 22,
            margin: { left: 14, right: 14 },
            head: [[
                { content: 'Grade', styles: { halign: 'left', fontStyle: 'bold', fillColor: [30, 41, 59] } },
                ...sortedPdfScale.map(t => ({ content: t.grade, styles: { halign: 'center', fontStyle: 'bold', textColor: [56, 189, 248] } }))
            ]],
            body: [
                [
                    { content: 'Range (%)', styles: { halign: 'left', fontStyle: 'bold' } },
                    ...sortedPdfScale.map((t, idx, arr) => {
                        const min = t.minPct;
                        const prevMin = idx > 0 ? arr[idx - 1].minPct - 1 : 100;
                        return idx === 0 ? `${min}%+` : (min === 0 ? `<${arr[idx - 1].minPct}%` : `${min}-${prevMin}%`);
                    })
                ],
                [
                    { content: 'Remarks', styles: { halign: 'left', fontStyle: 'italic' } },
                    ...sortedPdfScale.map(t => ({ content: t.remarks, styles: { fontStyle: 'italic', fontSize: isLandscape ? 5 : 6 } }))
                ]
            ],
            theme: 'grid',
            styles: {
                fontSize: isLandscape ? 6 : 7,
                cellPadding: isLandscape ? 1 : 1.5,
                textColor: [15, 23, 42],
                lineColor: [203, 213, 225],
                lineWidth: 0.15,
                halign: 'center'
            },
            headStyles: {
                fillColor: [15, 23, 42],
                textColor: [255, 255, 255]
            }
        });

        // 6. Signatures
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
        doc.text(`Generated securely via School Management System • Date: ${new Date().toLocaleDateString()}`, pageWidth / 2, pageHeight - (isLandscape ? 7 : 14), { align: 'center' });

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

            // Mark this exam term as published
            if (selectedExamId && selectedExamId !== 'annual_aggregate') {
                const examDocRef = doc(db, `schools/${schoolId}/exams`, selectedExamId);
                batch.set(examDocRef, { isPublished: true, publishedAt: now }, { merge: true });
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

    const handlePublishSingleStudent = (student) => {
        if (!student || !schoolId || !selectedExamId || !selectedClassId) return;
        setSingleStudentToPublish(student);
    };

    const handleConfirmPublishSingleStudent = async () => {
        const student = singleStudentToPublish;
        if (!student || !schoolId || !selectedExamId || !selectedClassId) return;

        setIsUploadingToParents(true);
        try {
            const batch = writeBatch(db);
            const now = new Date();
            const parentId = student.parentDetails?.parentId || student.parentId || student.guardianPhone || '';

            const resultPayload = {
                examId: selectedExamId,
                examTitle: currentExam?.title || 'Result Card',
                classId: selectedClassId,
                className: currentClass?.name || 'Class',
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

            const resultDocRef = doc(db, `schools/${schoolId}/students/${student.studentId}/results`, selectedExamId);
            batch.set(resultDocRef, resultPayload, { merge: true });

            const classStudentResultRef = doc(db, `schools/${schoolId}/classes/${selectedClassId}/students/${student.studentId}/results`, selectedExamId);
            batch.set(classStudentResultRef, resultPayload, { merge: true });

            if (parentId) {
                const notifRef = doc(collection(db, `schools/${schoolId}/notifications`));
                batch.set(notifRef, {
                    parentId: parentId,
                    studentId: student.studentId,
                    studentName: student.name,
                    title: `📄 ${currentExam?.title || 'Exam'} Result Card`,
                    message: `Result card for ${student.name} has been published. Score: ${student.totalObtained}/${student.totalMax} (${student.percentage}% - Grade ${student.grade}).`,
                    type: 'exam_result',
                    examId: selectedExamId,
                    read: false,
                    createdAt: now
                });
            }

            // Mark this exam term as published
            if (selectedExamId && selectedExamId !== 'annual_aggregate') {
                const examDocRef = doc(db, `schools/${schoolId}/exams`, selectedExamId);
                batch.set(examDocRef, { isPublished: true, publishedAt: now }, { merge: true });
            }

            await batch.commit();
            setUploadSuccessMessage(`Successfully published ${student.name}'s Result Card to Parent!`);
            setSingleStudentToPublish(null);
            setTimeout(() => setUploadSuccessMessage(null), 5000);
        } catch (err) {
            console.error("Single student publish error:", err);
            alert("Failed to publish result card: " + err.message);
        } finally {
            setIsUploadingToParents(false);
        }
    };

    const handleOpenModerateModal = (studentRow, forceOpen = false) => {
        if (!studentRow) return;
        if (!forceOpen && selectedStudentForModerate?.studentId === studentRow?.studentId) {
            setSelectedStudentForModerate(null);
            return;
        }
        setSelectedStudentForModerate(studentRow);
        const initialMarks = {};
        const subjList = (tabulationData.subjects && tabulationData.subjects.length > 0)
            ? tabulationData.subjects
            : (studentRow?.subjectMarks ? Object.keys(studentRow.subjectMarks) : (studentRow?.subjectMultiTerm ? Object.keys(studentRow.subjectMultiTerm) : []));

        subjList.forEach(subj => {
            const m = studentRow?.subjectMarks?.[subj];
            const multi = studentRow?.subjectMultiTerm?.[subj];
            let obtVal = '';
            let isAbs = false;
            let totVal = 100;
            let passVal = 33;
            let remVal = '';
            let graceVal = 0;

            if (m) {
                obtVal = (m.obtained !== null && m.obtained !== undefined) ? m.obtained : '';
                isAbs = m.isAbsent === true;
                totVal = m.totalMarks || 100;
                passVal = m.passingMarks || 33;
                remVal = m.remarks || '';
                graceVal = m.graceMarks || 0;
            } else if (multi) {
                const termData = multi.terms?.[selectedExamId] || Object.values(multi.terms || {})[0];
                if (termData) {
                    obtVal = (termData.obtained !== null && termData.obtained !== undefined) ? termData.obtained : '';
                    isAbs = termData.isAbsent === true;
                    totVal = termData.max || 100;
                    passVal = 33;
                    remVal = termData.remarks || '';
                }
            }

            initialMarks[subj] = {
                obtained: obtVal,
                graceMarks: graceVal,
                isAbsent: isAbs,
                totalMarks: totVal,
                passingMarks: passVal,
                remarks: remVal
            };
        });
        setModerateSubjectMarks(initialMarks);

        // Also initialize multi-term marks if studentRow has subjectMultiTerm
        const initialMultiMarks = {};
        if (studentRow?.subjectMultiTerm) {
            Object.entries(studentRow.subjectMultiTerm).forEach(([subj, sm]) => {
                initialMultiMarks[subj] = {};
                (tabulationData.aggregateTerms || []).forEach(term => {
                    const td = sm.terms?.[term.id];
                    initialMultiMarks[subj][term.id] = {
                        obtained: td && td.obtained !== null && td.obtained !== undefined ? td.obtained : '',
                        max: td?.max || 100,
                        isAbsent: td?.isAbsent === true
                    };
                });
            });
        }
        setModerateMultiTermMarks(initialMultiMarks);

        setModerateStatusOverride(studentRow?.moderationOverride || 'auto');
        setModerateRemarks(studentRow?.examinerRemarks || '');
    };

    const handleSaveModeration = async () => {
        if (!selectedStudentForModerate || !selectedExamId || !selectedClassId) return;
        if (currentExam?.isLocked) {
            alert("🔒 This examination is permanently locked because students of this session were promoted. Marks cannot be modified.");
            return;
        }

        setIsSavingModeration(true);
        try {
            const studentId = selectedStudentForModerate.studentId;

            if (isDemoMode) {
                // Update in-memory & shared demo override
                const newOverride = {
                    ...demoDataOverride,
                    [studentId]: {
                        subjectMarks: moderateSubjectMarks,
                        multiTermMarks: moderateMultiTermMarks,
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

            if (tabulationData.isAggregate && Object.keys(moderateMultiTermMarks).length > 0) {
                // Multi-term aggregate mode: write each term's marks
                for (const [subj, termMap] of Object.entries(moderateMultiTermMarks)) {
                    const cleanSubj = subj.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    for (const [termId, tData] of Object.entries(termMap)) {
                        const marksDocId = `${termId}_${selectedClassId}_${cleanSubj}`;
                        const marksDocRef = doc(db, `schools/${schoolId}/classes/${selectedClassId}/exam_marks`, marksDocId);
                        const numericObt = tData.obtained === '' || tData.obtained === null ? null : parseFloat(tData.obtained);
                        const studentEntry = {
                            obtainedMarks: numericObt,
                            baseMarks: numericObt,
                            graceMarks: 0,
                            isAbsent: tData.isAbsent === true,
                            grade: calculateGrade(numericObt || 0, tData.max || 100),
                            remarks: tData.remarks || '',
                            moderationOverride: moderateStatusOverride,
                            examinerRemarks: moderateRemarks,
                            moderatedAt: new Date()
                        };
                        batch.set(marksDocRef, {
                            examId: termId,
                            classId: selectedClassId,
                            className: currentClass?.name || 'Class',
                            subject: subj,
                            totalMarks: tData.max || 100,
                            passingMarks: 33,
                            marks: {
                                [studentId]: studentEntry
                            },
                            updatedAt: serverTimestamp()
                        }, { merge: true });
                    }
                }
            } else {
                // Update marks in Firestore for each subject (single term)
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

    // Demo Account (6257) Presentation Generator
    const [isGeneratingDemoExam, setIsGeneratingDemoExam] = useState(false);

    const handleGenerateDemoLockedExam = async () => {
        if (!isDemoAccount) return;
        setIsGeneratingDemoExam(true);
        try {
            const demoExamRef = doc(db, `schools/${schoolId}/exams`, 'demo_locked_exam_2024');
            await setDoc(demoExamRef, {
                title: 'Annual Final Examination 2024-2025 (Archive)',
                session: '2024-2025',
                presetId: 'final_term',
                status: 'completed',
                isLocked: true,
                lockedReason: 'Session Finalized & Students Promoted',
                lockedAt: serverTimestamp(),
                lockedBy: 'Promotions Protocol (Demo 6257)',
                startDate: '2025-02-15',
                endDate: '2025-02-28',
                defaultTotalMarks: 100,
                passingMarks: 33,
                description: 'Official historical assessment permanently archived following annual session transition.',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            }, { merge: true });

            setSelectedSession('2024-2025');
            setSelectedExamId('demo_locked_exam_2024');
            setIsDemoMode(true);
            try { localStorage.setItem('exams_demo_mode_active', 'true'); } catch (_) {}
            alert("✅ Demo Locked Exam (2024-2025) successfully generated!\n\nSession: 2024-2025 has been selected. Notice that the exam card is marked with a '🔒 Locked (Promoted)' badge and editing/deleting is protected.");
        } catch (err) {
            console.error("Demo exam generation error:", err);
            alert("Failed to generate demo locked exam: " + err.message);
        } finally {
            setIsGeneratingDemoExam(false);
        }
    };

    const handleRemoveDemoLockedExam = async () => {
        if (!isDemoAccount) return;
        if (!window.confirm("Are you sure you want to remove the Demo Locked Exam (2024-2025)?")) return;
        try {
            await deleteDoc(doc(db, `schools/${schoolId}/exams`, 'demo_locked_exam_2024'));
            setSelectedSession('2025-2026');
            alert("Demo Locked Exam removed successfully.");
        } catch (err) {
            console.error("Remove demo exam error:", err);
            alert("Failed to remove demo exam: " + err.message);
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
            {/* TAB 1: EXAMS SETUP, ACADEMIC SESSIONS & AGGREGATE ARCHITECTURE           */}
            {/* ========================================================================= */}
            {activeTab === 'setup' && (
                <div className="no-print space-y-6">
                    {/* Action Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-black text-slate-800 tracking-tight">Academic Sessions & Examination Pipeline</h2>
                            <p className="text-xs text-slate-500 font-medium">Organize terms by academic year, configure auto/custom annual aggregate weights, and manage archives</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <button
                                onClick={() => setShowAggregateModal(true)}
                                className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-indigo-50 to-violet-50 hover:from-indigo-100 hover:to-violet-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200/80 transition-all shadow-sm cursor-pointer"
                                title="Configure Auto Equal Average vs Custom Weightage % for Annual Aggregate Result"
                            >
                                <Scale className="w-4 h-4 text-indigo-600" />
                                <span>⚙️ Configure Aggregate Weights</span>
                            </button>
                            <button
                                onClick={() => handleOpenCreateExam()}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-100 transition-colors cursor-pointer"
                            >
                                <Plus className="w-4 h-4" />
                                <span>Create New Exam Term</span>
                            </button>
                        </div>
                    </div>

                    {/* Academic Session Filter & Status Pills Bar */}
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                                    Academic Session / Year
                                </label>
                                <div className="relative">
                                    <select
                                        value={selectedSession}
                                        onChange={(e) => setSelectedSession(e.target.value)}
                                        className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-black rounded-xl pl-3.5 pr-8 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                                    >
                                        {availableSessions.map(sess => (
                                            <option key={sess} value={sess}>
                                                Session: {sess} {sess === '2025-2026' ? '(Current)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                                    Filter Terms
                                </label>
                                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                                    {[
                                        { id: 'all', label: `All Terms (${exams.filter(e => (!selectedSession || e.session === selectedSession)).length})` },
                                        { id: 'active', label: `Active (${exams.filter(e => (!selectedSession || e.session === selectedSession) && e.status === 'active').length})` },
                                        { id: 'concluded', label: `Concluded / Archived (${exams.filter(e => (!selectedSession || e.session === selectedSession) && (e.status === 'completed' || e.status === 'archived')).length})` }
                                    ].map(f => (
                                        <button
                                            key={f.id}
                                            onClick={() => setSetupStatusFilter(f.id)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                setupStatusFilter === f.id
                                                    ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                                                    : 'text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-500">
                                Aggregate Mode:
                            </span>
                            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-black">
                                {aggregateConfig.mode === 'custom' ? '⚙️ Custom % Weights' : '⚡ Auto Sum / Equal Avg'}
                            </span>
                        </div>
                    </div>

                    {/* Academic Session Overview & Progressive Pipeline Banner */}
                    <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-900/50 relative overflow-hidden">
                        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                            <div>
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-black tracking-wide">
                                        🎓 Academic Session: {selectedSession}
                                    </span>
                                    <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-black">
                                        {sessionExams.filter(e => e.status === 'active').length} Active Term(s)
                                    </span>
                                    <span className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold">
                                        {sessionExams.filter(e => e.status === 'completed' || e.status === 'archived').length} Concluded Term(s)
                                    </span>
                                </div>
                                <h3 className="text-xl font-black text-white tracking-tight">
                                    Annual Examination Progression & Consolidated Pipeline
                                </h3>
                                <p className="text-xs text-slate-300 mt-1 max-w-xl font-medium">
                                    Terms progress sequentially through the year. Historical exams remain archived safely and never need deletion. All conducted terms feed directly into the Annual Aggregate Gazette!
                                </p>

                                {/* Visual Progressive Pipeline */}
                                <div className="flex flex-wrap items-center gap-2 mt-4">
                                    {sessionExams.length === 0 ? (
                                        <span className="text-xs text-slate-400 italic">No terms configured for Session {selectedSession} yet. Click "Create New Exam Term" above.</span>
                                    ) : (
                                        sessionExams.map((ex, i) => (
                                            <React.Fragment key={ex.id}>
                                                <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                                                    ex.status === 'active'
                                                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200 shadow-sm'
                                                        : ex.status === 'completed'
                                                        ? 'bg-slate-800/80 border-slate-700 text-slate-300'
                                                        : 'bg-blue-500/20 border-blue-500/40 text-blue-200'
                                                }`}>
                                                    <span className={`w-2 h-2 rounded-full ${ex.status === 'active' ? 'bg-emerald-400 animate-pulse' : ex.status === 'completed' ? 'bg-slate-400' : 'bg-blue-400'}`} />
                                                    <span>{ex.title}</span>
                                                    <span className="text-[10px] opacity-75 font-normal">
                                                        ({aggregateConfig.mode === 'custom' && aggregateConfig.weights?.[ex.id] ? `${aggregateConfig.weights[ex.id]}%` : ex.status})
                                                    </span>
                                                </div>
                                                {i < sessionExams.length - 1 && (
                                                    <span className="text-slate-500 font-bold">➔</span>
                                                )}
                                            </React.Fragment>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0">
                                <button
                                    onClick={() => {
                                        setSelectedExamId('annual_aggregate');
                                        setActiveTab('gazette');
                                    }}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                                >
                                    <Award className="w-4 h-4 text-amber-200" />
                                    <span>View Consolidated Annual Gazette</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedExamId('annual_aggregate');
                                        setActiveTab('dmc');
                                    }}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/20 transition-all cursor-pointer backdrop-blur-sm"
                                >
                                    <Printer className="w-4 h-4 text-indigo-300" />
                                    <span>Print Annual Result Cards (DMC)</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Exams Cards Grid */}
                    {sessionExams.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center">
                            <Award className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                            <h3 className="text-base font-bold text-slate-800">No Exam Terms Found in Session {selectedSession}</h3>
                            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                                Create an examination term for this academic session (e.g., First Term Examination 2026) so teachers can begin submitting subject marks.
                            </p>
                            <button
                                onClick={handleOpenCreateExam}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-sm cursor-pointer"
                            >
                                <Plus className="w-4 h-4" />
                                Add First Term for {selectedSession}
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {sessionExams.map(exam => {
                                const isActive = exam.status === 'active';
                                const isUpcoming = exam.status === 'upcoming';
                                const isCompleted = exam.status === 'completed' || exam.status === 'archived';
                                const weightPercentage = aggregateConfig.weights?.[exam.id];

                                return (
                                    <div
                                        key={exam.id}
                                        className={`bg-white rounded-3xl p-6 border transition-all hover:shadow-lg ${
                                            isActive
                                                ? 'border-indigo-300 ring-2 ring-indigo-500/10 shadow-sm'
                                                : isCompleted
                                                ? 'border-slate-200 bg-slate-50/50'
                                                : 'border-slate-200'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-3">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                    {exam.isLocked ? (
                                                        <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-sm">
                                                            <Lock className="w-3 h-3 text-amber-700" />
                                                            <span>Locked (Promoted)</span>
                                                        </span>
                                                    ) : (
                                                        <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md ${
                                                            isActive
                                                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                                : isUpcoming
                                                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                                                : 'bg-slate-200 text-slate-700 border border-slate-300'
                                                        }`}>
                                                            {exam.status || 'Active'}
                                                        </span>
                                                    )}
                                                    <span className="text-xs font-semibold text-slate-400">
                                                        Session: {exam.session || 'N/A'}
                                                    </span>
                                                    {aggregateConfig.mode === 'custom' && typeof weightPercentage === 'number' && (
                                                        <span className="px-2 py-0.5 text-[10px] font-black bg-violet-100 text-violet-700 rounded-md border border-violet-200">
                                                            Weight: {weightPercentage}%
                                                        </span>
                                                    )}
                                                </div>
                                                <h3 className="text-lg font-black text-slate-800 tracking-tight">{exam.title}</h3>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {exam.isLocked ? (
                                                    <span className="p-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-1 text-[10px] font-bold" title="This exam is permanently locked because students of this session were promoted.">
                                                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                                                        <span className="hidden sm:inline">Locked</span>
                                                    </span>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => handleOpenEditExam(exam)}
                                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                                            title="Edit Exam Term"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteExam(exam.id, exam.title)}
                                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                                            title="Delete Exam"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {exam.description && (
                                            <p className="text-xs text-slate-500 line-clamp-2 mb-4 font-medium">
                                                {exam.description}
                                            </p>
                                        )}

                                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 mb-4 text-xs space-y-1.5">
                                            <div className="flex items-center justify-between text-slate-600">
                                                <span className="text-slate-400 text-[10px] font-black uppercase">Schedule</span>
                                                <span className="font-bold">{exam.startDate ? `${exam.startDate} ${exam.endDate ? `to ${exam.endDate}` : ''}` : 'Active Assessment'}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-slate-600">
                                                <span className="text-slate-400 text-[10px] font-black uppercase">Lifecycle Status</span>
                                                {exam.isLocked ? (
                                                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-1">
                                                        <Lock className="w-3 h-3 text-slate-400" />
                                                        <span>Archived</span>
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleToggleExamStatus(exam)}
                                                        className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                                                            isActive 
                                                                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' 
                                                                : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                                        }`}
                                                        title="Click to toggle between Active (Open for Marks) and Concluded (Archived)"
                                                    >
                                                        {isActive ? 'Mark as Concluded' : 'Set as Active'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    setSelectedExamId(exam.id);
                                                    setActiveTab('gazette');
                                                }}
                                                className="flex-1 py-2 text-center text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors cursor-pointer"
                                            >
                                                View Class Gazette
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedExamId(exam.id);
                                                    setActiveTab('dmc');
                                                }}
                                                className="flex-1 py-2 text-center text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
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
                                        className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                                    >
                                        <option value="annual_aggregate">🏆 Annual Consolidated Aggregate ({selectedSession || 'Current Session'})</option>
                                        <optgroup label="Individual Examination Terms">
                                            {exams.map(e => (
                                                <option key={e.id} value={e.id}>{e.title} ({e.session || 'Term'})</option>
                                            ))}
                                        </optgroup>
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
                                <button
                                    onClick={handleManualSyncMarks}
                                    disabled={isSyncingMarks || !selectedClassId}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm disabled:opacity-50"
                                    title="Force real-time live synchronization of marks directly from database"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isSyncingMarks ? 'animate-spin' : ''}`} />
                                    <span>{isSyncingMarks ? 'Syncing...' : 'Sync Live Marks'}</span>
                                </button>
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

                        {currentExam?.isLocked && (
                            <div className="no-print p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-amber-900 text-xs font-bold animate-fadeIn">
                                <div className="flex items-center gap-2">
                                    <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                                    <span>🔒 <strong>Read-Only Historical Archive:</strong> This examination is permanently locked because students of Academic Session {currentExam.session || selectedSession} have been promoted. Marks cannot be modified.</span>
                                </div>
                                <span className="px-2 py-0.5 bg-amber-200/80 text-amber-800 text-[10px] rounded font-black uppercase">
                                    Frozen Record
                                </span>
                            </div>
                        )}

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
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Ensure students are enrolled in this class and teachers have submitted marks via their mobile apps.
                                </p>
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
                                            {tabulationData.isAggregate ? (
                                                (tabulationData.aggregateTerms || []).map(term => (
                                                    <th key={term.id} className="sticky top-0 z-20 bg-slate-900 text-white p-3.5 text-center min-w-[110px] border-r border-slate-800/80 print:static print:bg-white print:text-black">
                                                        <div className="font-black text-white text-xs">{term.title}</div>
                                                        <div className="text-[10px] font-bold text-indigo-300">
                                                            {aggregateConfig.mode === 'custom' ? `Weight: ${term.weight}%` : 'Auto Weight'}
                                                        </div>
                                                    </th>
                                                ))
                                            ) : (
                                                tabulationData.subjects.map(subj => (
                                                    <th key={subj} className="sticky top-0 z-20 bg-slate-900 text-white p-3.5 text-center min-w-[70px] border-r border-slate-800/80 print:static print:bg-white print:text-black">
                                                        <div className="font-extrabold text-white">{subj}</div>
                                                        <div className="text-[9px] font-medium text-slate-400">
                                                            Max: {tabulationData.subjectConfigs?.[subj]?.totalMarks || 100}
                                                        </div>
                                                    </th>
                                                ))
                                            )}
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

                                                {tabulationData.isAggregate ? (
                                                    (tabulationData.aggregateTerms || []).map(term => {
                                                        const tb = row.termBreakdown?.[term.id];
                                                        if (!tb || !tb.hasMarks) {
                                                            return (
                                                                <td key={term.id} className="p-3.5 text-center text-slate-300 font-bold">
                                                                    —
                                                                </td>
                                                            );
                                                        }
                                                        return (
                                                            <td key={term.id} className="p-3.5 text-center font-bold">
                                                                <span className="text-slate-900 font-black">{tb.obtained}</span>
                                                                <span className="text-slate-400 text-[10px] font-normal"> / {tb.max}</span>
                                                                <span className="block text-[11px] font-bold text-indigo-600">{tb.percentage}%</span>
                                                            </td>
                                                        );
                                                    })
                                                ) : (
                                                    tabulationData.subjects.map(subj => {
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
                                                    })
                                                )}

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
                                                    {tabulationData.isAggregate ? (
                                                        row.isPassed ? (
                                                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">
                                                                PASSED (ANNUAL)
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-black text-[10px]">
                                                                FAILED (ANNUAL)
                                                            </span>
                                                        )
                                                    ) : (
                                                        row.subjectsEvaluatedCount === 0 ? (
                                                            <span className="text-slate-400 font-semibold text-[10px]">Pending</span>
                                                        ) : !row.isComplete ? (
                                                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-black text-[10px]" title={`${row.subjectsEvaluatedCount}/${tabulationData.subjects.length} Subjects entered`}>
                                                                PENDING ({row.subjectsEvaluatedCount}/{tabulationData.subjects.length})
                                                            </span>
                                                        ) : row.isPassed ? (
                                                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">PASS</span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-black text-[10px]">FAIL</span>
                                                        )
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
                    {/* Top Batch Header Bar */}
                    <div className="no-print bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                                <Award className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-black text-slate-900 text-sm">Official Result Card & DMC Studio</h3>
                                <p className="text-[11px] text-slate-500 font-medium">Select a class, navigate students, and print or download official detailed marks certificates</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                            <button
                                onClick={() => {
                                    const allIds = (tabulationData?.rows || students).map(s => s.studentId || s.id);
                                    if (selectedStudentIdsForBatch.size > 0) {
                                        setSelectedStudentIdsForBatch(new Set());
                                    } else {
                                        setSelectedStudentIdsForBatch(new Set(allIds));
                                    }
                                }}
                                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black rounded-xl transition-colors border border-slate-200 cursor-pointer"
                            >
                                {selectedStudentIdsForBatch.size > 0 ? `Deselect All (${selectedStudentIdsForBatch.size})` : `Select All (${tabulationData?.rows?.length ?? students.length})`}
                            </button>
                            <button
                                onClick={handleBatchPrintDmc}
                                disabled={tabulationData.rows.length === 0}
                                className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                                title="Print all selected student DMC cards"
                            >
                                <Printer className="w-4 h-4" />
                                {selectedStudentIdsForBatch.size > 0 ? `Print Cards (${selectedStudentIdsForBatch.size})` : `Print All Cards (${tabulationData.rows.length})`}
                            </button>
                            <button
                                onClick={handleBatchDownloadPdf}
                                disabled={selectedStudentIdsForBatch.size === 0 || isDownloadingPdf}
                                className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200 transition-colors disabled:opacity-50 cursor-pointer"
                                title="Download batch PDF"
                            >
                                <Download className="w-4 h-4 text-emerald-600" />
                                {isDownloadingPdf ? 'Generating...' : `Batch PDF (${selectedStudentIdsForBatch.size})`}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const allIds = (tabulationData?.rows || students).map(s => s.studentId || s.id);
                                    setSelectedStudentIdsForBatch(new Set(allIds));
                                    setShowUploadToParentsModal(true);
                                }}
                                disabled={tabulationData.rows.length === 0 || isUploadingToParents}
                                className="inline-flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-black rounded-xl shadow-md shadow-indigo-200 transition-all cursor-pointer disabled:opacity-50"
                                title="Publish all student result cards in this class to parents"
                            >
                                <UploadCloud className="w-4 h-4 text-indigo-200" />
                                <span>Publish Class to Parents ({tabulationData.rows.length})</span>
                            </button>
                        </div>
                    </div>



                    {uploadSuccessMessage && (
                        <div className="no-print p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-800 text-xs font-bold animate-fadeIn">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>{uploadSuccessMessage}</span>
                            </div>
                            <button onClick={() => setUploadSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-900 font-black">✕</button>
                        </div>
                    )}

                    {/* ========================================================================= */}
                    {/* MASTER DMC STUDIO FRAME (Interactive Single Certificate View)             */}
                    {/* ========================================================================= */}
                    {(() => {
                        const allRows = tabulationData.rows || [];
                        const totalStudents = allRows.length;

                        // Class Analytics Calculations
                        const passedCount = allRows.filter(r => (r.moderationOverride === 'pass' || r.moderationOverride === 'conditional_pass') || (r.isComplete && r.isPassed && r.moderationOverride !== 'fail')).length;
                        const failedCount = allRows.filter(r => r.moderationOverride === 'fail' || (r.isComplete && !r.isPassed && r.moderationOverride !== 'pass' && r.moderationOverride !== 'conditional_pass')).length;
                        const pendingCount = allRows.filter(r => !r.isComplete && !r.moderationOverride).length;
                        const passRate = totalStudents > 0 ? ((passedCount / totalStudents) * 100).toFixed(1) : '0';
                        const failRate = totalStudents > 0 ? ((failedCount / totalStudents) * 100).toFixed(1) : '0';
                        const highestPctStudent = allRows.reduce((max, r) => (!max || (r.percentage || 0) > (max.percentage || 0)) ? r : max, null);

                        // Real-Time Filter & Search
                        const filteredRows = allRows.filter(studentRow => {
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

                        // Active Student Selection in Studio
                        const activeStudent = (selectedStudentForDmc && filteredRows.find(r => r.studentId === selectedStudentForDmc.studentId))
                            || (filteredRows.length > 0 ? filteredRows[0] : null);
                        const activeIndex = activeStudent ? filteredRows.findIndex(r => r.studentId === activeStudent.studentId) : -1;

                        const handleSwitchStudent = (newStudent) => {
                            if (!newStudent) return;
                            setSelectedStudentForDmc(newStudent);
                            if (isEditingMarksInDmc) {
                                handleOpenModerateModal(newStudent, true);
                            } else {
                                setSelectedStudentForModerate(null);
                            }
                        };

                        const isEditingThisStudent = Boolean(
                            isEditingMarksInDmc &&
                            selectedStudentForModerate &&
                            activeStudent &&
                            selectedStudentForModerate.studentId === activeStudent.studentId
                        );

                        // Live Moderation Calculations for Active Student
                        let liveTotalObtained = 0;
                        let liveTotalMax = 0;
                        let subjectsCount = tabulationData.subjects.length;
                        let evaluatedCount = 0;
                        let failedSubjCount = 0;
                        let hasAbsent = false;
                        let totalGraceApplied = 0;

                        if (isEditingThisStudent && activeStudent) {
                            tabulationData.subjects.forEach(subj => {
                                const data = moderateSubjectMarks?.[subj] || {};
                                const max = data.totalMarks || 100;
                                const pass = data.passingMarks || 33;
                                liveTotalMax += max;

                                if (data.isAbsent) {
                                    hasAbsent = true;
                                    failedSubjCount++;
                                } else {
                                    const base = data.obtained === '' || data.obtained === null || data.obtained === undefined ? null : parseFloat(data.obtained);
                                    const grace = parseFloat(data.graceMarks) || 0;
                                    totalGraceApplied += grace;

                                    if (base !== null && !isNaN(base)) {
                                        const effective = base + grace;
                                        liveTotalObtained += effective;
                                        evaluatedCount++;
                                        if (effective < pass) {
                                            failedSubjCount++;
                                        }
                                    }
                                }
                            });
                        }

                        const livePercentage = liveTotalMax > 0 ? (liveTotalObtained / liveTotalMax) * 100 : 0;
                        const isComplete = subjectsCount > 0 && evaluatedCount === subjectsCount;
                        let isPassCalc = isComplete && failedSubjCount === 0 && livePercentage >= 33 && !hasAbsent;

                        if (moderateStatusOverride === 'pass' || moderateStatusOverride === 'conditional_pass') {
                            isPassCalc = true;
                        } else if (moderateStatusOverride === 'fail') {
                            isPassCalc = false;
                        }

                        const liveGrade = calculateGrade(liveTotalObtained, liveTotalMax);

                        // Live Multi-Term Aggregate Calculations for Active Student
                        let multiLiveGrandObt = 0;
                        let multiLiveGrandMax = 0;
                        const multiLiveTermSums = {};
                        (tabulationData.aggregateTerms || []).forEach(term => {
                            multiLiveTermSums[term.id] = { obt: 0, max: 0 };
                        });

                        if (isEditingThisStudent && activeStudent && tabulationData.isAggregate && activeStudent.subjectMultiTerm) {
                            Object.entries(activeStudent.subjectMultiTerm).forEach(([subj, sm]) => {
                                (tabulationData.aggregateTerms || []).forEach(term => {
                                    const td = sm.terms?.[term.id];
                                    if (td && td.obtained !== null && td.obtained !== undefined) {
                                        const termMax = td.max || 100;
                                        multiLiveTermSums[term.id].max += termMax;
                                        multiLiveGrandMax += termMax;

                                        const liveEntry = moderateMultiTermMarks[subj]?.[term.id];
                                        const isAbs = liveEntry ? liveEntry.isAbsent : td.isAbsent;
                                        const rawVal = liveEntry ? liveEntry.obtained : td.obtained;
                                        const numVal = isAbs ? 0 : (rawVal !== '' && rawVal !== null && !isNaN(rawVal) ? parseFloat(rawVal) : 0);
                                        multiLiveTermSums[term.id].obt += numVal;
                                        multiLiveGrandObt += numVal;
                                    }
                                });
                            });
                        }

                        const multiLiveGrandPct = multiLiveGrandMax > 0 ? (multiLiveGrandObt / multiLiveGrandMax) * 100 : 0;
                        const multiLiveGrandGrade = calculateGrade(multiLiveGrandObt, multiLiveGrandMax);
                        let multiLiveIsPass = multiLiveGrandPct >= 33;
                        if (moderateStatusOverride === 'pass' || moderateStatusOverride === 'conditional_pass') {
                            multiLiveIsPass = true;
                        } else if (moderateStatusOverride === 'fail') {
                            multiLiveIsPass = false;
                        }
                        const activeSchoolLogo = logoBase64 || schoolProfile?.profileImage || schoolProfile?.logo || schoolProfile?.logoUrl || schoolProfile?.schoolLogo || schoolProfile?.photoUrl || schoolProfile?.image || '';
                        const activeStudentPhoto = activeStudent?.photoUrl || activeStudent?.photo || activeStudent?.profileImage || activeStudent?.studentPhoto || activeStudent?.profilePic || activeStudent?.avatar || activeStudent?.image || '';

                        return (
                            <div className="no-print space-y-4">
                                {/* 1. Class Performance Analytics Banner */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                                    <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Total Students</span>
                                            <span className="text-xl font-black text-slate-900">{totalStudents}</span>
                                        </div>
                                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 text-sm font-black">
                                            👥
                                        </div>
                                    </div>

                                    <div className="bg-white p-3.5 rounded-2xl border border-emerald-200/90 shadow-sm flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block">Passed</span>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-xl font-black text-emerald-700">{passedCount}</span>
                                                <span className="text-[11px] font-bold text-emerald-600/80">({passRate}%)</span>
                                            </div>
                                        </div>
                                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm font-black">
                                            🟢
                                        </div>
                                    </div>

                                    <div className="bg-white p-3.5 rounded-2xl border border-rose-200/90 shadow-sm flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 block">Failed</span>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-xl font-black text-rose-700">{failedCount}</span>
                                                <span className="text-[11px] font-bold text-rose-600/80">({failRate}%)</span>
                                            </div>
                                        </div>
                                        <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center text-sm font-black">
                                            🔴
                                        </div>
                                    </div>

                                    <div className="bg-white p-3.5 rounded-2xl border border-amber-200/90 shadow-sm flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 block">Incomplete / Pending</span>
                                            <span className="text-xl font-black text-amber-700">{pendingCount}</span>
                                        </div>
                                        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-sm font-black">
                                            🟡
                                        </div>
                                    </div>

                                    <div className="bg-white p-3.5 rounded-2xl border border-indigo-200/90 shadow-sm col-span-2 sm:col-span-4 lg:col-span-1 flex items-center justify-between">
                                        <div className="min-w-0 pr-2">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500 block truncate">Class Topper</span>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-xl font-black text-indigo-700">{highestPctStudent?.percentage ? `${highestPctStudent.percentage}%` : '—'}</span>
                                                <span className="text-[11px] font-bold text-slate-600 truncate">{highestPctStudent?.name || ''}</span>
                                            </div>
                                        </div>
                                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-black shrink-0">
                                            🏆
                                        </div>
                                    </div>
                                </div>

                                {/* 2. Real-Time Status Filters */}
                                <div className="bg-white p-2.5 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                                    {/* Status Filter Buttons */}
                                    <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200">
                                        <button
                                            type="button"
                                            onClick={() => setDmcStatusFilter('all')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                                                dmcStatusFilter === 'all'
                                                    ? 'bg-white text-slate-800 shadow-sm border border-slate-200/60'
                                                    : 'text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            All ({totalStudents})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDmcStatusFilter('pass')}
                                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                                                dmcStatusFilter === 'pass'
                                                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
                                                    : 'text-emerald-700 hover:bg-emerald-50'
                                            }`}
                                        >
                                            <span>🟢</span> Pass ({passedCount})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDmcStatusFilter('fail')}
                                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                                                dmcStatusFilter === 'fail'
                                                    ? 'bg-rose-600 text-white shadow-sm shadow-rose-200'
                                                    : 'text-rose-700 hover:bg-rose-50'
                                            }`}
                                        >
                                            <span>🔴</span> Fail ({failedCount})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDmcStatusFilter('pending')}
                                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                                                dmcStatusFilter === 'pending'
                                                    ? 'bg-amber-500 text-white shadow-sm shadow-amber-200'
                                                    : 'text-amber-700 hover:bg-amber-50'
                                            }`}
                                        >
                                            <span>🟡</span> Pending ({pendingCount})
                                        </button>
                                    </div>

                                    <span className="text-[11px] font-bold text-slate-400 hidden sm:inline-block pr-2">
                                        Showing {filteredRows.length} of {totalStudents} students
                                    </span>
                                </div>

                                {/* 3. Studio Student Navigator & Actions Toolbar */}
                                <div className="bg-slate-900 text-white p-3 sm:p-4 rounded-2xl shadow-lg border border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                                    {/* Left: Class Selector + Flip buttons + Inline Search Box + Student Dropdown Selector */}
                                    <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
                                        {/* Class Selector Dropdown */}
                                        <div className="flex items-center gap-1.5 bg-slate-800/90 py-1.5 px-3 rounded-xl border border-slate-700/80 shrink-0">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Class:</span>
                                            <select
                                                value={selectedClassId}
                                                onChange={(e) => {
                                                    setSelectedClassId(e.target.value);
                                                    setSelectedStudentForDmc(null);
                                                    setIsEditingMarksInDmc(false);
                                                    setSelectedStudentForModerate(null);
                                                }}
                                                className="bg-transparent text-white text-xs font-black focus:outline-none cursor-pointer"
                                            >
                                                {classes.map(c => (
                                                    <option key={c.id} value={c.id} className="bg-slate-800 text-white font-bold">{c.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Exam / Term Selector Dropdown */}
                                        <div className="flex items-center gap-1.5 bg-slate-800/90 py-1.5 px-3 rounded-xl border border-slate-700/80 shrink-0">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">Exam:</span>
                                            <select
                                                value={selectedExamId || ''}
                                                onChange={(e) => {
                                                    setSelectedExamId(e.target.value);
                                                    setSelectedStudentForDmc(null);
                                                    setIsEditingMarksInDmc(false);
                                                    setSelectedStudentForModerate(null);
                                                }}
                                                className="bg-transparent text-white text-xs font-black focus:outline-none cursor-pointer max-w-[210px] truncate"
                                            >
                                                <option value="annual_aggregate" className="bg-slate-800 text-amber-300 font-bold">
                                                    🏆 Annual Consolidated (All Terms)
                                                </option>
                                                <optgroup label="Individual Terms" className="bg-slate-800 text-slate-300 font-bold">
                                                    {(sessionExams.length > 0 ? sessionExams : exams).map(e => (
                                                        <option key={e.id} value={e.id} className="bg-slate-800 text-white font-medium">
                                                            {e.title} {e.session ? `(${e.session})` : ''}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            </select>
                                        </div>

                                        {/* Flip Controls: Prev, X of Y, Next */}
                                        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/80 shrink-0">
                                            <button
                                                type="button"
                                                disabled={activeIndex <= 0}
                                                onClick={() => handleSwitchStudent(filteredRows[activeIndex - 1])}
                                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-200 disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                                title="Previous Student"
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                             </button>
                                            <span className="text-xs font-black text-slate-200 px-2 min-w-[70px] text-center">
                                                {filteredRows.length > 0 ? `${activeIndex + 1} / ${filteredRows.length}` : '0 / 0'}
                                            </span>
                                            <button
                                                type="button"
                                                disabled={activeIndex < 0 || activeIndex >= filteredRows.length - 1}
                                                onClick={() => handleSwitchStudent(filteredRows[activeIndex + 1])}
                                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-200 disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                                title="Next Student"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {/* Inline Student Search Box */}
                                        <div className="relative min-w-[190px] flex-1 max-w-xs">
                                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                            <input
                                                type="text"
                                                value={dmcSearchQuery}
                                                onChange={(e) => setDmcSearchQuery(e.target.value)}
                                                placeholder="Search name or roll..."
                                                className="w-full pl-8 pr-7 py-2 bg-slate-800 border border-slate-700 text-white text-xs font-bold rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all placeholder:text-slate-400"
                                            />
                                            {dmcSearchQuery && (
                                                <button
                                                    type="button"
                                                    onClick={() => setDmcSearchQuery('')}
                                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white font-black text-xs cursor-pointer"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>

                                        {/* Student Dropdown Selector */}
                                        <div className="flex-1 min-w-[220px] max-w-md">
                                            <select
                                                value={activeStudent?.studentId || ''}
                                                disabled={filteredRows.length === 0}
                                                onChange={(e) => {
                                                    const found = filteredRows.find(r => r.studentId === e.target.value);
                                                    if (found) handleSwitchStudent(found);
                                                }}
                                                className="w-full bg-slate-800 border border-slate-700 text-white text-xs font-bold py-2.5 px-3 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer disabled:opacity-40"
                                            >
                                                {filteredRows.length === 0 ? (
                                                    <option value="">(No students found)</option>
                                                ) : (
                                                    filteredRows.map(r => {
                                                        const isFP = r.moderationOverride === 'pass' || r.moderationOverride === 'conditional_pass';
                                                        const isFF = r.moderationOverride === 'fail';
                                                        const isP = isFP || (r.isComplete && r.isPassed && !isFF);
                                                        const isPend = !r.isComplete && !isFP && !isFF;
                                                        const statusStr = isFP ? '🟢 Trial Pass' : isPend ? '🟡 Pending' : isP ? '🟢 Pass' : '🔴 Fail';
                                                        return (
                                                            <option key={r.studentId} value={r.studentId} className="bg-slate-800 text-white">
                                                                Roll #{r.rollNumber} • {r.name} ({statusStr} — {r.percentage}%)
                                                            </option>
                                                        );
                                                    })
                                                )}
                                            </select>
                                        </div>

                                        {/* Inline Edit & Grace Marks Button or View-Only Badge */}
                                        {activeStudent && (
                                            isDmcViewOnly ? (
                                                <div 
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800/90 text-slate-400 border border-slate-700/80 rounded-xl text-xs font-bold shrink-0 select-none"
                                                    title="Archived Session / All Terms Published — Record is in View-Only Mode"
                                                >
                                                    <Lock className="w-3.5 h-3.5 text-amber-400/80" />
                                                    <span>View Only</span>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (isEditingThisStudent) {
                                                            setIsEditingMarksInDmc(false);
                                                            setSelectedStudentForModerate(null);
                                                        } else {
                                                            handleOpenModerateModal(activeStudent, true);
                                                            setIsEditingMarksInDmc(true);
                                                        }
                                                    }}
                                                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black rounded-xl shadow-sm transition-all cursor-pointer shrink-0 ${
                                                        isEditingThisStudent
                                                            ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-300'
                                                            : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white shadow-md shadow-amber-500/20'
                                                    }`}
                                                    title="Edit marks, grace marks, or override status"
                                                >
                                                    <Scale className="w-3.5 h-3.5" />
                                                    <span>{isEditingThisStudent ? 'Close Editor' : 'Edit & Grace Marks'}</span>
                                                </button>
                                            )
                                        )}
                                    </div>

                                    {/* Right: Quick Actions for Active Student */}
                                    {activeStudent && (
                                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => handlePublishSingleStudent(activeStudent)}
                                                disabled={isUploadingToParents || isDmcViewOnly}
                                                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-black rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
                                                title={isDmcViewOnly ? "Cannot publish in archived / view-only mode" : "Publish this student's result card directly to parents"}
                                            >
                                                <Send className="w-3.5 h-3.5" />
                                                <span>Publish to Parent</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handlePrintSingleDmc(activeStudent)}
                                                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-sm transition-colors cursor-pointer"
                                                title="Print this student's DMC"
                                            >
                                                <Printer className="w-3.5 h-3.5" />
                                                <span>Print DMC</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => generateStudentDmcPdf(activeStudent, true)}
                                                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-sm transition-colors cursor-pointer"
                                                title="Download this student's PDF"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                                <span>PDF</span>
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* 4. Empty State if no students match filter */}
                                {filteredRows.length === 0 ? (
                                    <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3 shadow-sm">
                                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                                            <Search className="w-6 h-6" />
                                        </div>
                                        <h3 className="text-base font-black text-slate-800">No Students Found</h3>
                                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                                            {dmcSearchQuery ? `No student matched "${dmcSearchQuery}" in selected filter.` : 'No students match the current filter.'}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setDmcSearchQuery('');
                                                setDmcStatusFilter('all');
                                            }}
                                            className="px-4 py-2 bg-indigo-50 text-indigo-700 text-xs font-black rounded-xl hover:bg-indigo-100 transition-colors cursor-pointer"
                                        >
                                            Clear Filter & Show All
                                        </button>
                                    </div>
                                ) : activeStudent ? (
                                    /* 5. MASTER DMC CERTIFICATE STUDIO FRAME */
                                    <div className={`w-full bg-white text-slate-800 rounded-3xl shadow-xl border-4 border-double ${
                                        isEditingThisStudent ? 'border-amber-500 ring-2 ring-amber-300' : 'border-slate-800'
                                    } overflow-hidden transition-all duration-300`}>
                                        {/* Moderation Banner (Visible when editing) */}
                                        {isEditingThisStudent && (
                                            <div className="p-3 bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white flex flex-wrap items-center justify-between gap-2 border-b-2 border-amber-900">
                                                <div className="flex items-center gap-2">
                                                    <Scale className="w-4 h-4 text-amber-200" />
                                                    <span className="font-black text-xs text-white">
                                                        Editing Marks & Grace — {activeStudent.name} (Roll #{activeStudent.rollNumber})
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setIsEditingMarksInDmc(false);
                                                            setSelectedStudentForModerate(null);
                                                        }}
                                                        disabled={isSavingModeration}
                                                        className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleSaveModeration}
                                                        disabled={isSavingModeration}
                                                        className="inline-flex items-center gap-1.5 px-4 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-black text-xs shadow-md transition-all disabled:opacity-50 cursor-pointer"
                                                    >
                                                        {isSavingModeration ? 'Saving...' : (
                                                            <>
                                                                <Check className="w-3.5 h-3.5" />
                                                                Save & Update
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Certificate Body Container */}
                                        <div className="p-5 sm:p-8 bg-white">
                                            {/* School Header */}
                                            <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4 mb-4">
                                                <div className="w-20 shrink-0 flex items-center justify-start">
                                                    {activeSchoolLogo ? (
                                                        <img
                                                            src={activeSchoolLogo}
                                                            alt="School Logo"
                                                            className="w-16 h-16 object-contain drop-shadow-sm"
                                                            onError={(e) => {
                                                                if (schoolProfile?.profileImage && e.target.src !== schoolProfile.profileImage) {
                                                                    e.target.src = schoolProfile.profileImage;
                                                                }
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="w-16 h-16 rounded-full border-2 border-slate-800 flex items-center justify-center font-black text-sm text-slate-800">
                                                            {(schoolProfile?.name || 'SC').substring(0, 2).toUpperCase()}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="text-center flex-1 px-4 min-w-0">
                                                    <h2 className="text-lg sm:text-2xl font-black uppercase text-slate-900 tracking-tight leading-tight">
                                                        {schoolProfile?.name || 'School Name'}
                                                    </h2>
                                                    <p className="text-xs text-slate-500 font-semibold truncate leading-tight mt-1">
                                                        {schoolProfile?.address || 'Campus Address'} {schoolProfile?.phone ? `• Contact: ${schoolProfile.phone}` : ''}
                                                    </p>
                                                    <div className="mt-2 inline-block px-4 py-1 bg-slate-900 text-white rounded-full">
                                                        <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest">
                                                            {currentExam?.title || 'Examination'} Result Certificate
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="w-20 text-right shrink-0">
                                                    {activeStudentPhoto ? (
                                                        <img src={activeStudentPhoto} alt="Student" className="w-14 h-18 object-cover border border-slate-300 rounded shadow-sm ml-auto" />
                                                    ) : (
                                                        <div className="w-14 h-18 border border-slate-300 rounded bg-slate-50 flex items-center justify-center text-[9px] text-slate-400 text-center ml-auto font-bold uppercase">
                                                            Photo
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Student Meta Information Bar */}
                                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs bg-slate-50 p-3 rounded-xl mb-4 border border-slate-200">
                                                <div>
                                                    <span className="font-bold text-slate-400 uppercase text-[9px] block">Student Name</span>
                                                    <span className="font-black text-slate-900 text-sm truncate block">{activeStudent.name}</span>
                                                </div>
                                                <div>
                                                    <span className="font-bold text-slate-400 uppercase text-[9px] block">Roll Number</span>
                                                    <span className="font-black text-slate-900 text-sm block">#{activeStudent.rollNumber}</span>
                                                </div>
                                                <div>
                                                    <span className="font-bold text-slate-400 uppercase text-[9px] block">Father's Name</span>
                                                    <span className="font-bold text-slate-800 truncate block">{activeStudent.fatherName}</span>
                                                </div>
                                                <div>
                                                    <span className="font-bold text-slate-400 uppercase text-[9px] block">Class / Section</span>
                                                    <span className="font-bold text-slate-800 truncate block">{currentClass?.name || 'Class'}</span>
                                                </div>
                                                <div>
                                                    <span className="font-bold text-slate-400 uppercase text-[9px] block">Academic Session</span>
                                                    <span className="font-bold text-slate-800 block">{currentExam?.session || '2025-2026'}</span>
                                                </div>
                                                <div>
                                                    <span className="font-bold text-slate-400 uppercase text-[9px] block">Attendance</span>
                                                    <span className="font-black text-indigo-700 block">{formatAttendanceSafely(activeStudent.attendance)}</span>
                                                </div>
                                            </div>

                                            {/* Subject Marks Table */}
                                            <div className="overflow-x-auto mb-4 border border-slate-300 rounded-lg">
                                                <table className="w-full text-xs border-collapse text-center min-w-[500px]">
                                                    {(tabulationData.isAggregate && activeStudent.subjectMultiTerm && Object.keys(activeStudent.subjectMultiTerm).length > 0) ? (
                                                        <>
                                                            <thead>
                                                                <tr className="bg-slate-900 text-white font-black text-[11px] border-b border-slate-700">
                                                                    <th rowSpan={2} className="border border-slate-700 p-2 text-left">Subject</th>
                                                                    {(tabulationData.aggregateTerms || []).map(term => {
                                                                        const tb = activeStudent.termBreakdown?.[term.id];
                                                                        const attdStr = formatAttendanceSafely(tb?.attendance);
                                                                        return (
                                                                            <th key={term.id} colSpan={4} className="border border-slate-700 p-1.5 text-center">
                                                                                <div className="font-black text-slate-100 uppercase tracking-wider">{term.title.replace(' Examination', '').replace(' Assessment', '')}</div>
                                                                                <div className="text-[9px] text-slate-400 font-normal">Weight: {term.weight}% • Attd: {attdStr}</div>
                                                                            </th>
                                                                        );
                                                                    })}
                                                                    <th colSpan={5} className="border border-slate-700 p-1.5 text-center bg-slate-800 text-white">
                                                                        <div className="font-black uppercase tracking-wider">Annual Consolidated</div>
                                                                        <div className="text-[9px] text-slate-400 font-normal">Final Result • Attd: {formatAttendanceSafely(activeStudent.attendance)}</div>
                                                                    </th>
                                                                </tr>
                                                                <tr className="bg-slate-800 text-slate-300 font-bold text-[10px] border-b border-slate-700">
                                                                    {(tabulationData.aggregateTerms || []).map(term => (
                                                                        <React.Fragment key={term.id}>
                                                                            <th className="border border-slate-700 p-1 w-11 text-center">Total</th>
                                                                            <th className="border border-slate-700 p-1 w-11 text-center">Obt</th>
                                                                            <th className="border border-slate-700 p-1 w-11 text-center">Grd</th>
                                                                            <th className="border border-slate-700 p-1 w-11 text-center">W %</th>
                                                                        </React.Fragment>
                                                                    ))}
                                                                    <th className="border border-slate-700 p-1 w-11 text-center">Total</th>
                                                                    <th className="border border-slate-700 p-1 w-11 text-center">Obt</th>
                                                                    <th className="border border-slate-700 p-1 w-11 text-center">%</th>
                                                                    <th className="border border-slate-700 p-1 w-11 text-center">Grade</th>
                                                                    <th className="border border-slate-700 p-1 w-14 text-center">Remarks</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {Object.entries(activeStudent.subjectMultiTerm).map(([subj, sm], idx) => {
                                                                    let rowSubjObtSum = 0;
                                                                    let rowSubjMaxSum = 0;
                                                                    return (
                                                                        <tr key={subj} className={isEditingThisStudent ? 'bg-amber-50/20 hover:bg-amber-50/40' : (idx % 2 === 1 ? 'bg-slate-50' : 'bg-white')}>
                                                                            <td className="border border-slate-300 p-2 text-left font-bold text-slate-900">{subj}</td>
                                                                            {(tabulationData.aggregateTerms || []).map(term => {
                                                                                const td = sm.terms?.[term.id];
                                                                                if (!td || td.obtained === null || td.obtained === undefined) {
                                                                                    return (
                                                                                        <td key={term.id} colSpan={4} className="border border-slate-300 p-1.5 text-slate-400 font-bold">
                                                                                            -
                                                                                        </td>
                                                                                    );
                                                                                }
                                                                                const termMax = td.max || 100;
                                                                                rowSubjMaxSum += termMax;

                                                                                if (isEditingThisStudent) {
                                                                                    const liveEntry = moderateMultiTermMarks[subj]?.[term.id] || { obtained: td.obtained ?? '', max: termMax, isAbsent: td.isAbsent || false };
                                                                                    const isAbs = liveEntry.isAbsent === true;
                                                                                    const liveObtVal = isAbs ? 0 : (liveEntry.obtained !== '' && liveEntry.obtained !== null && !isNaN(liveEntry.obtained) ? parseFloat(liveEntry.obtained) : null);
                                                                                    if (liveObtVal !== null) rowSubjObtSum += liveObtVal;

                                                                                    const liveGradeVal = isAbs ? 'ABS' : (liveObtVal !== null ? calculateGrade(liveObtVal, termMax) : '—');
                                                                                    const tWeight = aggregateConfig.weights?.[term.id] || term.weight || (100 / (tabulationData.aggregateTerms.length || 1));
                                                                                    const liveWPctVal = liveObtVal !== null && termMax > 0 ? `${((liveObtVal / termMax) * tWeight).toFixed(1)}%` : '—';

                                                                                    return (
                                                                                        <React.Fragment key={term.id}>
                                                                                            <td className="border border-slate-300 p-1 text-slate-500 font-semibold">{termMax}</td>
                                                                                            <td className="border border-slate-300 p-1">
                                                                                                <input
                                                                                                    type="number"
                                                                                                    min="0"
                                                                                                    max={termMax}
                                                                                                    disabled={isAbs}
                                                                                                    value={liveEntry.obtained ?? ''}
                                                                                                    placeholder="0"
                                                                                                    onChange={(e) => {
                                                                                                        const val = e.target.value;
                                                                                                        setModerateMultiTermMarks(prev => ({
                                                                                                            ...prev,
                                                                                                            [subj]: {
                                                                                                                ...(prev?.[subj] || {}),
                                                                                                                [term.id]: {
                                                                                                                    ...(prev?.[subj]?.[term.id] || { max: termMax }),
                                                                                                                    obtained: val
                                                                                                                }
                                                                                                            }
                                                                                                        }));
                                                                                                    }}
                                                                                                    className="w-14 sm:w-16 p-1 text-center font-black text-xs text-slate-900 bg-white border-2 border-indigo-400 rounded-lg shadow-inner focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-40"
                                                                                                />
                                                                                            </td>
                                                                                            <td className="border border-slate-300 p-1 font-bold text-indigo-700">{liveGradeVal}</td>
                                                                                            <td className="border border-slate-300 p-1 font-bold text-indigo-700">{liveWPctVal}</td>
                                                                                        </React.Fragment>
                                                                                    );
                                                                                }

                                                                                rowSubjObtSum += (td.obtained || 0);
                                                                                const scoreVal = td.isAbsent ? 'ABS' : td.obtained;
                                                                                const gradeVal = td.grade || (td.obtained !== null && td.max ? calculateGrade((td.obtained / td.max) * 100) : '—');
                                                                                const wPct = td.weightedPercentage !== undefined ? `${td.weightedPercentage}%` : '—';
                                                                                return (
                                                                                    <React.Fragment key={term.id}>
                                                                                        <td className="border border-slate-300 p-1 text-slate-500 font-semibold">{td.max || 100}</td>
                                                                                        <td className="border border-slate-300 p-1 font-bold text-slate-900">{scoreVal}</td>
                                                                                        <td className="border border-slate-300 p-1 font-bold text-indigo-700">{gradeVal}</td>
                                                                                        <td className="border border-slate-300 p-1 font-bold text-indigo-700">{wPct}</td>
                                                                                    </React.Fragment>
                                                                                );
                                                                            })}
                                                                            <td className="border border-slate-300 p-1 text-slate-600 font-bold">{isEditingThisStudent ? rowSubjMaxSum : sm.totalMax}</td>
                                                                            <td className="border border-slate-300 p-1 font-black text-slate-900">
                                                                                {isEditingThisStudent ? rowSubjObtSum : (sm.totalObtained !== null ? sm.totalObtained : '—')}
                                                                            </td>
                                                                            <td className="border border-slate-300 p-1 font-bold text-indigo-700">
                                                                                {isEditingThisStudent
                                                                                    ? `${rowSubjMaxSum > 0 ? ((rowSubjObtSum / rowSubjMaxSum) * 100).toFixed(1) : 0}%`
                                                                                    : (sm.totalObtained !== null ? `${sm.percentage}%` : '—')}
                                                                            </td>
                                                                            <td className="border border-slate-300 p-1 font-black">
                                                                                {isEditingThisStudent
                                                                                    ? calculateGrade(rowSubjObtSum, rowSubjMaxSum)
                                                                                    : (sm.totalObtained !== null ? (sm.isPending ? '-' : sm.grade) : '—')}
                                                                            </td>
                                                                            <td className="border border-slate-300 p-1 text-[10px] text-slate-600 font-semibold">
                                                                                {isEditingThisStudent
                                                                                    ? calculateRemarks(rowSubjObtSum, rowSubjMaxSum)
                                                                                    : (sm.totalObtained !== null ? (sm.isPending ? '-' : (sm.remarks || '—')) : '—')}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                            <tfoot>
                                                                <tr className="bg-slate-100 font-black border-t-2 border-slate-800">
                                                                    <td className="border border-slate-300 p-2 text-left font-black uppercase text-[11px]">Consolidated Total</td>
                                                                    {(tabulationData.aggregateTerms || []).map(term => {
                                                                        const tb = activeStudent.termBreakdown?.[term.id];
                                                                        if (!tb || !tb.hasMarks) {
                                                                            return (
                                                                                <td key={term.id} colSpan={4} className="border border-slate-300 p-1.5 text-slate-400 font-bold">
                                                                                    -
                                                                                </td>
                                                                            );
                                                                        }
                                                                        const tWeight = aggregateConfig.weights?.[term.id] || term.weight || (100 / (tabulationData.aggregateTerms.length || 1));
                                                                        const liveSum = multiLiveTermSums[term.id];
                                                                        const termMax = isEditingThisStudent ? (liveSum?.max || tb.max) : tb.max;
                                                                        const termObt = isEditingThisStudent ? (liveSum?.obt ?? tb.obtained) : tb.obtained;
                                                                        const termGrade = isEditingThisStudent ? calculateGrade(termObt, termMax) : (tb.grade || calculateGrade(termObt, termMax));
                                                                        const termWPct = isEditingThisStudent
                                                                            ? (termMax > 0 ? `${((termObt / termMax) * tWeight).toFixed(1)}%` : '—')
                                                                            : (tb.weightedPercentage !== undefined ? `${tb.weightedPercentage}%` : '—');

                                                                        return (
                                                                            <React.Fragment key={term.id}>
                                                                                <td className="border border-slate-300 p-1 text-slate-600 font-bold">{termMax}</td>
                                                                                <td className="border border-slate-300 p-1 text-indigo-900 font-black">{termObt}</td>
                                                                                <td className="border border-slate-300 p-1 text-indigo-900 font-black">{termGrade}</td>
                                                                                <td className="border border-slate-300 p-1 text-indigo-700 font-bold">{termWPct}</td>
                                                                            </React.Fragment>
                                                                        );
                                                                    })}
                                                                    <td className="border border-slate-300 p-1 text-slate-700 font-bold">
                                                                        {isEditingThisStudent ? multiLiveGrandMax : activeStudent.totalMax}
                                                                    </td>
                                                                    <td className="border border-slate-300 p-1 text-indigo-700 font-black text-sm">
                                                                        {isEditingThisStudent ? multiLiveGrandObt : activeStudent.totalObtained}
                                                                    </td>
                                                                    <td className="border border-slate-300 p-1 text-indigo-700 font-black">
                                                                        {isEditingThisStudent ? `${multiLiveGrandPct.toFixed(1)}%` : `${activeStudent.percentage}%`}
                                                                    </td>
                                                                    <td className="border border-slate-300 p-1 text-indigo-700 font-black">
                                                                        {isEditingThisStudent ? multiLiveGrandGrade : (!activeStudent.isComplete ? '-' : activeStudent.grade)}
                                                                    </td>
                                                                    <td className="border border-slate-300 p-1 text-[10px] font-bold text-slate-800">
                                                                        {isEditingThisStudent ? (multiLiveIsPass ? 'Passed' : 'Failed') : (!activeStudent.isComplete ? '-' : (activeStudent.remarks || (activeStudent.isPassed ? 'Passed' : 'Failed')))}
                                                                    </td>
                                                                </tr>
                                                            </tfoot>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <thead>
                                                                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                                                                    <th className="border border-slate-300 p-2 text-left">Subject</th>
                                                                    <th className="border border-slate-300 p-2 w-14 sm:w-16">Total</th>
                                                                    {isEditingThisStudent ? (
                                                                        <>
                                                                            <th className="border border-slate-300 p-2 w-20">Obtained</th>
                                                                            <th className="border border-slate-300 p-2 w-16">Grace (+)</th>
                                                                            <th className="border border-slate-300 p-2 w-12">Abs</th>
                                                                            <th className="border border-slate-300 p-2 w-16">Effective</th>
                                                                            <th className="border border-slate-300 p-2 w-14">Grade</th>
                                                                            <th className="border border-slate-300 p-2 text-left">Remarks</th>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <th className="border border-slate-300 p-2 w-16">Obtained</th>
                                                                            <th className="border border-slate-300 p-2 w-14">Grade</th>
                                                                            <th className="border border-slate-300 p-2 text-left">Remarks</th>
                                                                        </>
                                                                    )}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {((tabulationData.subjects && tabulationData.subjects.length > 0) ? tabulationData.subjects : (activeStudent?.subjectMarks ? Object.keys(activeStudent.subjectMarks) : [])).map(subj => {
                                                                    if (isEditingThisStudent) {
                                                                        const entry = moderateSubjectMarks?.[subj] || { obtained: '', graceMarks: 0, isAbsent: false, totalMarks: 100, passingMarks: 33, remarks: '' };
                                                                        const baseVal = entry.obtained === '' || entry.obtained === null ? null : parseFloat(entry.obtained);
                                                                        const graceVal = parseFloat(entry.graceMarks) || 0;
                                                                        const effective = baseVal !== null && !isNaN(baseVal) ? baseVal + graceVal : null;
                                                                        const isSubjFail = entry.isAbsent || (effective !== null && effective < (entry.passingMarks || 33));
                                                                        const subjGrade = entry.isAbsent ? 'ABS' : (effective !== null ? calculateGrade(effective, entry.totalMarks || 100) : '—');

                                                                        return (
                                                                            <tr key={subj} className="hover:bg-amber-50/50 bg-amber-50/20">
                                                                                <td className="border border-slate-300 p-2 text-left font-bold">
                                                                                    <span>{subj}</span>
                                                                                    <span className="text-[9px] text-slate-400 font-normal block">Pass: {entry.passingMarks || 33}</span>
                                                                                </td>
                                                                                <td className="border border-slate-300 p-2 text-slate-600 font-semibold">{entry.totalMarks || 100}</td>
                                                                                <td className="border border-slate-300 p-1">
                                                                                    <input
                                                                                        type="number"
                                                                                        min="0"
                                                                                        max={entry.totalMarks || 100}
                                                                                        disabled={entry.isAbsent}
                                                                                        value={entry.obtained}
                                                                                        placeholder="0"
                                                                                        onChange={(e) => {
                                                                                            const val = e.target.value;
                                                                                            setModerateSubjectMarks(prev => ({
                                                                                                ...prev,
                                                                                                [subj]: { ...(prev?.[subj] || {}), obtained: val }
                                                                                            }));
                                                                                        }}
                                                                                        className="w-18 p-1.5 text-center font-black text-xs text-slate-900 bg-white border-2 border-indigo-400 rounded-lg shadow-inner focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-40 disabled:bg-slate-100"
                                                                                    />
                                                                                </td>
                                                                                <td className="border border-slate-300 p-1">
                                                                                    <input
                                                                                        type="number"
                                                                                        min="0"
                                                                                        max="50"
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
                                                                                        className="w-14 p-1.5 text-center font-bold text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:outline-none disabled:opacity-40"
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
                                                                                        className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                                                                                        title="Mark Absent"
                                                                                    />
                                                                                </td>
                                                                                <td className="border border-slate-300 p-2 font-black">
                                                                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black ${
                                                                                        entry.isAbsent ? 'bg-slate-200 text-slate-600' :
                                                                                        effective === null ? 'bg-slate-100 text-slate-400' :
                                                                                        isSubjFail ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                                                                                    }`}>
                                                                                        {entry.isAbsent ? 'ABS' : effective !== null ? `${effective}${graceVal > 0 ? '*' : ''}` : '—'}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="border border-slate-300 p-2 font-black text-indigo-700">
                                                                                    {subjGrade}
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
                                                                        const m = activeStudent?.subjectMarks?.[subj];
                                                                        const obtained = m ? (m.isAbsent ? 'ABS' : (m.obtained !== null && m.obtained !== undefined) ? m.obtained : '-') : '-';
                                                                        return (
                                                                            <tr key={subj} className="hover:bg-slate-50">
                                                                                <td className="border border-slate-300 p-2 text-left font-bold">{subj}</td>
                                                                                <td className="border border-slate-300 p-2 text-slate-600">{m?.totalMarks || 100}</td>
                                                                                <td className="border border-slate-300 p-2 font-black">{obtained}</td>
                                                                                <td className="border border-slate-300 p-2 font-black text-indigo-700">{m?.grade || '-'}</td>
                                                                                <td className="border border-slate-300 p-2 text-left text-[11px] text-slate-600">{m?.remarks || 'Satisfactory'}</td>
                                                                            </tr>
                                                                        );
                                                                    }
                                                                })}
                                                            </tbody>
                                                            <tfoot>
                                                                <tr className="bg-slate-100 font-black border-t-2 border-slate-800">
                                                                    <td className="border border-slate-300 p-2 text-left font-black uppercase">Total Marks</td>
                                                                    <td className="border border-slate-300 p-2">
                                                                        {isEditingThisStudent ? liveTotalMax : activeStudent.totalMax}
                                                                    </td>
                                                                    {isEditingThisStudent ? (
                                                                        <>
                                                                            <td colSpan={3} className="border border-slate-300 p-2 text-indigo-700 font-black">
                                                                                {liveTotalObtained} {totalGraceApplied > 0 && <span className="text-amber-600 text-[10px] font-bold">(+{totalGraceApplied} Grace)</span>}
                                                                            </td>
                                                                            <td className="border border-slate-300 p-2 text-indigo-700 font-black">{livePercentage.toFixed(1)}%</td>
                                                                            <td className="border border-slate-300 p-2 text-indigo-700 font-black">{liveGrade}</td>
                                                                            <td className="border border-slate-300 p-2 text-left text-[11px] font-bold">
                                                                                {!isComplete ? 'PENDING' : isPassCalc ? 'PASSED / PROMOTED' : 'FAILED / DETAINED'}
                                                                            </td>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <td className="border border-slate-300 p-2 text-indigo-700 font-black text-sm">{activeStudent.totalObtained}</td>
                                                                            <td className="border border-slate-300 p-2 text-indigo-700 font-black">{activeStudent.grade}</td>
                                                                            <td className="border border-slate-300 p-2 text-left text-[11px] font-bold">
                                                                                {!activeStudent.isComplete ? 'RESULT PENDING' : (activeStudent.isPassed ? 'PROMOTED / PASSED' : 'FAILED / DETAINED')}
                                                                            </td>
                                                                        </>
                                                                    )}
                                                                </tr>
                                                            </tfoot>
                                                        </>
                                                    )}
                                                </table>
                                            </div>

                                            {/* Moderation Controls (Promotion Override & Examiner Remarks) */}
                                            {isEditingThisStudent && (
                                                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl mb-4 space-y-2">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-[10px] font-black text-slate-700 uppercase mb-1">
                                                                Promotion Decision Override
                                                            </label>
                                                            <select
                                                                value={moderateStatusOverride}
                                                                onChange={(e) => setModerateStatusOverride(e.target.value)}
                                                                className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                                                            >
                                                                <option value="auto">⚡ Automatic (Formula Decision)</option>
                                                                <option value="pass">🟢 Force Pass / Promoted on Trial</option>
                                                                <option value="conditional_pass">🟡 Conditional Pass / Re-appear</option>
                                                                <option value="fail">🔴 Force Retain / Fail</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] font-black text-slate-700 uppercase mb-1">
                                                                Official DMC Note / Remarks
                                                            </label>
                                                            <input
                                                                type="text"
                                                                placeholder="e.g. Awarded grace marks in Math. Promoted on trial."
                                                                value={moderateRemarks}
                                                                onChange={(e) => setModerateRemarks(e.target.value)}
                                                                className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs font-medium text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-200/80">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsEditingMarksInDmc(false);
                                                                setSelectedStudentForModerate(null);
                                                            }}
                                                            disabled={isSavingModeration}
                                                            className="px-3 py-1.5 text-slate-600 hover:bg-white rounded-lg font-bold text-xs transition-colors cursor-pointer"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={handleSaveModeration}
                                                            disabled={isSavingModeration}
                                                            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black text-xs shadow-md transition-all disabled:opacity-50 cursor-pointer"
                                                        >
                                                            {isSavingModeration ? 'Saving...' : (
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
                                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 mb-4">
                                                <div className="p-1">
                                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Marks</span>
                                                    <span className="font-black text-sm sm:text-base text-slate-900">
                                                        {isEditingThisStudent 
                                                            ? (tabulationData.isAggregate ? `${multiLiveGrandObt} / ${multiLiveGrandMax}` : `${liveTotalObtained} / ${liveTotalMax}`)
                                                            : `${activeStudent.totalObtained} / ${activeStudent.totalMax}`}
                                                    </span>
                                                </div>
                                                <div className="p-1">
                                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Percentage</span>
                                                    <span className="font-black text-sm sm:text-base text-slate-900">
                                                        {isEditingThisStudent 
                                                            ? (tabulationData.isAggregate ? `${multiLiveGrandPct.toFixed(1)}%` : `${livePercentage.toFixed(1)}%`)
                                                            : `${activeStudent.percentage}%`}
                                                    </span>
                                                </div>
                                                <div className="p-1">
                                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Grade</span>
                                                    <span className="font-black text-sm sm:text-base text-indigo-700">
                                                        {isEditingThisStudent 
                                                            ? (tabulationData.isAggregate ? multiLiveGrandGrade : liveGrade)
                                                            : (!activeStudent.isComplete ? '-' : activeStudent.grade)}
                                                    </span>
                                                </div>
                                                <div className="p-1">
                                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Class Position</span>
                                                    <span className="font-black text-sm sm:text-base text-emerald-700">{getOrdinal(activeStudent.position)}</span>
                                                </div>
                                                <div className="p-1">
                                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Result Status</span>
                                                    {isEditingThisStudent ? (
                                                        <span className={`font-black text-xs sm:text-sm ${
                                                            tabulationData.isAggregate 
                                                                ? (multiLiveIsPass ? 'text-emerald-700' : 'text-rose-700')
                                                                : (!isComplete ? 'text-slate-400' : (isPassCalc ? 'text-emerald-700' : 'text-rose-700'))
                                                        }`}>
                                                            {tabulationData.isAggregate 
                                                                ? (multiLiveIsPass ? 'PASSED' : 'FAILED')
                                                                : (!isComplete ? '-' : (isPassCalc ? 'PASSED' : 'FAILED'))}
                                                        </span>
                                                    ) : (
                                                        <span className={`font-black text-xs sm:text-sm ${!activeStudent.isComplete ? 'text-slate-400' : (activeStudent.isPassed ? 'text-emerald-700' : 'text-rose-700')}`}>
                                                            {!activeStudent.isComplete ? '-' : (activeStudent.isPassed ? 'PASSED' : 'FAILED')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Official Institutional Grading Scale Matrix */}
                                            {(() => {
                                                const activeScale = (currentExam?.gradingScale && Array.isArray(currentExam.gradingScale) && currentExam.gradingScale.length > 0)
                                                    ? currentExam.gradingScale
                                                    : DEFAULT_GRADING_SCALE;
                                                const sortedScale = [...activeScale].sort((a, b) => (b.minPct ?? 0) - (a.minPct ?? 0));
                                                return (
                                                    <div className="mb-6 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                                                        <div className="text-[10px] font-black uppercase text-slate-600 tracking-wider mb-1.5 flex items-center justify-between">
                                                            <span>Grading Scale & Official Remarks Matrix</span>
                                                            <span className="text-[9px] text-slate-400 font-semibold">Standard Institutional Scale</span>
                                                        </div>
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-center text-[10px] border-collapse border border-slate-300">
                                                                <thead>
                                                                    <tr className="bg-slate-200 text-slate-700 font-bold">
                                                                        <th className="p-1 border border-slate-300 text-left w-20">Scale</th>
                                                                        {sortedScale.map(t => (
                                                                            <th key={t.grade} className="p-1 border border-slate-300 font-black text-indigo-700">{t.grade}</th>
                                                                        ))}
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    <tr className="bg-white">
                                                                        <td className="p-1 border border-slate-300 text-left font-bold text-slate-600">Marks Range</td>
                                                                        {sortedScale.map((t, idx) => {
                                                                            const max = idx === 0 ? 100 : (sortedScale[idx - 1].minPct - 1);
                                                                            const rangeStr = t.minPct === 0 ? `< ${sortedScale[idx - 1]?.minPct || 33}%` : `${t.minPct}% - ${max}%`;
                                                                            return <td key={t.grade} className="p-1 border border-slate-300 text-slate-600">{rangeStr}</td>;
                                                                        })}
                                                                    </tr>
                                                                    <tr className="bg-slate-50/50">
                                                                        <td className="p-1 border border-slate-300 text-left font-bold text-slate-600">Remarks</td>
                                                                        {sortedScale.map(t => (
                                                                            <td key={t.grade} className="p-1 border border-slate-300 italic text-slate-600 font-medium text-[9px]">{t.remarks}</td>
                                                                        ))}
                                                                    </tr>
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* Official Signatures and Stamp */}
                                            <div className="pt-8 border-t border-slate-300 mt-6">
                                                <div className="grid grid-cols-3 gap-8 text-center text-xs">
                                                    <div>
                                                        <div className="border-b border-slate-800 pb-1 mb-1.5 mx-4 font-bold text-slate-800">
                                                            {currentClass?.classTeacherName || 'Class Incharge'}
                                                        </div>
                                                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Class Incharge</span>
                                                    </div>
                                                    <div>
                                                        <div className="border-b border-slate-800 pb-1 mb-1.5 mx-4 font-bold text-slate-800">
                                                            Examination Department
                                                        </div>
                                                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Controller of Examinations</span>
                                                    </div>
                                                    <div>
                                                        <div className="border-b border-slate-800 pb-1 mb-1.5 mx-4 font-bold text-slate-800">
                                                            {schoolProfile?.principalName || 'Principal'}
                                                        </div>
                                                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Principal Signature & Stamp</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
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
                                        <div className={`grid ${(tabulationData.isAggregate && studentRow.subjectMultiTerm) ? 'grid-cols-6' : 'grid-cols-2'} gap-x-4 gap-y-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4`}>
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Student Name:</span> <span className="font-black text-slate-900 text-sm ml-1">{studentRow.name}</span></div>
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Class / Section:</span> <span className="font-black text-slate-900 ml-1">{currentClass.name}</span></div>
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Father's Name:</span> <span className="font-semibold text-slate-800 ml-1">{studentRow.fatherName}</span></div>
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Examination:</span> <span className="font-bold text-slate-800 ml-1">{currentExam.title}</span></div>
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Roll Number:</span> <span className="font-black text-slate-900 ml-1">{studentRow.rollNumber}</span></div>
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Academic Session:</span> <span className="font-bold text-slate-800 ml-1">{currentExam.session || '2025-2026'}</span></div>
                                        </div>

                                            {/* 3. Subject-wise Marks Table or Multi-Term Comparison Table */}
                                            <table className="w-full text-xs border-collapse border border-slate-400 mb-6">
                                                {(tabulationData.isAggregate && studentRow.subjectMultiTerm && Object.keys(studentRow.subjectMultiTerm).length > 0) ? (
                                                    <>
                                                        <thead>
                                                            <tr className="bg-slate-900 text-white text-[11px] font-black uppercase text-center border-b border-slate-800">
                                                                <th rowSpan={2} className="border border-slate-700 p-2 w-10">Sr.</th>
                                                                <th rowSpan={2} className="border border-slate-700 p-2 text-left">Subject</th>
                                                                {(tabulationData.aggregateTerms || []).map(term => {
                                                                    const tb = studentRow.termBreakdown?.[term.id];
                                                                    const attdStr = formatAttendanceSafely(tb?.attendance);
                                                                    return (
                                                                        <th key={term.id} colSpan={4} className="border border-slate-700 p-1.5 text-center">
                                                                            <div className="font-black text-slate-100">{term.title.replace(' Examination', '').replace(' Assessment', '')}</div>
                                                                            <div className="text-[9px] text-slate-400 font-normal">Weight: {term.weight}% • Attd: {attdStr}</div>
                                                                        </th>
                                                                    );
                                                                })}
                                                                <th colSpan={5} className="border border-slate-700 p-1.5 text-center bg-slate-800 text-white">
                                                                    <div className="font-black">Annual Consolidated</div>
                                                                    <div className="text-[9px] text-slate-400 font-normal">Final Result • Attd: {formatAttendanceSafely(studentRow.attendance)}</div>
                                                                </th>
                                                            </tr>
                                                            <tr className="bg-slate-800 text-slate-200 text-[10px] font-bold text-center border-b border-slate-700">
                                                                {(tabulationData.aggregateTerms || []).map(term => (
                                                                    <React.Fragment key={term.id}>
                                                                        <th className="border border-slate-700 p-1 w-11">Total</th>
                                                                        <th className="border border-slate-700 p-1 w-11">Obt</th>
                                                                        <th className="border border-slate-700 p-1 w-11">Grd</th>
                                                                        <th className="border border-slate-700 p-1 w-11">W %</th>
                                                                    </React.Fragment>
                                                                ))}
                                                                <th className="border border-slate-700 p-1 w-11">Total</th>
                                                                <th className="border border-slate-700 p-1 w-11">Obt</th>
                                                                <th className="border border-slate-700 p-1 w-11">%</th>
                                                                <th className="border border-slate-700 p-1 w-11">Grade</th>
                                                                <th className="border border-slate-700 p-1 w-14">Remarks</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {Object.entries(studentRow.subjectMultiTerm).map(([subj, sm], sIdx) => (
                                                                <tr key={subj} className={`text-center font-medium ${sIdx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}`}>
                                                                    <td className="border border-slate-400 p-1.5 text-slate-500">{sIdx + 1}</td>
                                                                    <td className="border border-slate-400 p-1.5 text-left font-bold text-slate-900">{subj}</td>
                                                                    {(tabulationData.aggregateTerms || []).map(term => {
                                                                        const td = sm.terms?.[term.id];
                                                                        if (!td || td.obtained === null || td.obtained === undefined) {
                                                                            return (
                                                                                <td key={term.id} colSpan={4} className="border border-slate-400 p-1.5 text-center text-slate-400 font-bold">
                                                                                    -
                                                                                </td>
                                                                            );
                                                                        }
                                                                        const scoreVal = td.isAbsent ? 'ABS' : td.obtained;
                                                                        const gradeVal = td.grade || (td.obtained !== null && td.max ? calculateGrade((td.obtained / td.max) * 100) : '—');
                                                                        const wPct = td.weightedPercentage !== undefined ? `${td.weightedPercentage}%` : '—';
                                                                        return (
                                                                            <React.Fragment key={term.id}>
                                                                                <td className="border border-slate-400 p-1 text-slate-600 font-semibold">{td.max || 100}</td>
                                                                                <td className="border border-slate-400 p-1 font-bold text-slate-900">{scoreVal}</td>
                                                                                <td className="border border-slate-400 p-1 font-bold text-indigo-700">{gradeVal}</td>
                                                                                <td className="border border-slate-400 p-1 font-bold text-indigo-700">{wPct}</td>
                                                                            </React.Fragment>
                                                                        );
                                                                    })}
                                                                    <td className="border border-slate-400 p-1 font-semibold text-slate-600">{sm.totalMax}</td>
                                                                    <td className="border border-slate-400 p-1 font-black text-slate-900">{sm.totalObtained !== null ? sm.totalObtained : '—'}</td>
                                                                    <td className="border border-slate-400 p-1 font-bold text-indigo-700">{sm.totalObtained !== null ? `${sm.percentage}%` : '—'}</td>
                                                                    <td className="border border-slate-400 p-1 font-black">
                                                                        {sm.totalObtained !== null ? (
                                                                            sm.isPending ? '-' : sm.grade
                                                                        ) : '—'}
                                                                    </td>
                                                                    <td className="border border-slate-400 p-1 text-[10px] text-slate-600 font-semibold">
                                                                        {sm.totalObtained !== null ? (sm.isPending ? '-' : (sm.remarks || '—')) : '—'}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                        <tfoot>
                                                            <tr className="bg-slate-100 font-black text-sm text-center border-t-2 border-slate-800">
                                                                <td colSpan={2} className="border border-slate-400 p-1.5 text-left uppercase text-xs">Consolidated Total</td>
                                                                {(tabulationData.aggregateTerms || []).map(term => {
                                                                    const tb = studentRow.termBreakdown?.[term.id];
                                                                    if (!tb || !tb.hasMarks) {
                                                                        return (
                                                                            <td key={term.id} colSpan={4} className="border border-slate-400 p-1.5 text-center text-slate-400 font-bold">
                                                                                -
                                                                            </td>
                                                                        );
                                                                    }
                                                                    const wPct = tb.weightedPercentage !== undefined ? `${tb.weightedPercentage}%` : '—';
                                                                    return (
                                                                        <React.Fragment key={term.id}>
                                                                            <td className="border border-slate-400 p-1 text-slate-600 font-bold">{tb.max}</td>
                                                                            <td className="border border-slate-400 p-1 text-indigo-900 font-black">{tb.obtained}</td>
                                                                            <td className="border border-slate-400 p-1 text-indigo-900 font-black">{tb.grade || '—'}</td>
                                                                            <td className="border border-slate-400 p-1 text-indigo-700 font-bold">{wPct}</td>
                                                                        </React.Fragment>
                                                                    );
                                                                })}
                                                                <td className="border border-slate-400 p-1 text-slate-700 font-bold">{studentRow.totalMax}</td>
                                                                <td className="border border-slate-400 p-1 text-indigo-900 text-base">{studentRow.totalObtained}</td>
                                                                <td className="border border-slate-400 p-1 text-indigo-900">{studentRow.percentage}%</td>
                                                                <td className="border border-slate-400 p-1 text-indigo-900">
                                                                    {!studentRow.isComplete ? '-' : studentRow.grade}
                                                                </td>
                                                                <td className="border border-slate-400 p-1 text-[10px] font-bold text-slate-800">
                                                                    {!studentRow.isComplete ? '-' : (studentRow.remarks || (studentRow.isPassed ? 'Passed' : 'Failed'))}
                                                                </td>
                                                            </tr>
                                                        </tfoot>
                                                    </>
                                                ) : tabulationData.isAggregate ? (
                                                    <>
                                                        <thead>
                                                            <tr className="bg-slate-100 text-slate-800 text-[11px] font-black uppercase text-center border-b border-slate-400">
                                                                <th className="border border-slate-400 p-2 w-12">Sr.</th>
                                                                <th className="border border-slate-400 p-2 text-left">Term Examination</th>
                                                                <th className="border border-slate-400 p-2 w-20">Weight</th>
                                                                <th className="border border-slate-400 p-2 w-20">Max Marks</th>
                                                                <th className="border border-slate-400 p-2 w-24">Marks Obtained</th>
                                                                <th className="border border-slate-400 p-2 w-16">Percentage</th>
                                                                <th className="border border-slate-400 p-2 w-16">Grade</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {(tabulationData.aggregateTerms || []).map((term, tIdx) => {
                                                                const tb = studentRow.termBreakdown?.[term.id];
                                                                const hasData = tb && tb.hasMarks;
                                                                return (
                                                                    <tr key={term.id} className="text-center font-medium">
                                                                        <td className="border border-slate-400 p-2 text-slate-500">{tIdx + 1}</td>
                                                                        <td className="border border-slate-400 p-2 text-left font-bold text-slate-900">{term.title}</td>
                                                                        <td className="border border-slate-400 p-2 text-indigo-700 font-bold">{term.weight}%</td>
                                                                        <td className="border border-slate-400 p-2 font-semibold">
                                                                            {hasData ? tb.max : '-'}
                                                                        </td>
                                                                        <td className="border border-slate-400 p-2 font-black text-slate-900">
                                                                            {hasData ? tb.obtained : '-'}
                                                                        </td>
                                                                        <td className="border border-slate-400 p-2 font-bold text-indigo-700">{hasData ? `${tb.percentage}%` : '—'}</td>
                                                                        <td className="border border-slate-400 p-2 font-black">{hasData ? tb.grade : '—'}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                        <tfoot>
                                                            <tr className="bg-slate-100 font-black text-sm text-center border-t-2 border-slate-800">
                                                                <td colSpan={3} className="border border-slate-400 p-2 text-left uppercase">Annual Aggregate Total</td>
                                                                <td className="border border-slate-400 p-2">{studentRow.totalMax}</td>
                                                                <td className="border border-slate-400 p-2 text-indigo-900 text-base">{studentRow.totalObtained}</td>
                                                                <td className="border border-slate-400 p-2 text-indigo-900">{studentRow.percentage}%</td>
                                                                <td className="border border-slate-400 p-2 text-indigo-900">
                                                                    {!studentRow.isComplete ? '-' : studentRow.grade}
                                                                </td>
                                                            </tr>
                                                        </tfoot>
                                                    </>
                                                ) : (
                                                    <>
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
                                                                    {!studentRow.isComplete ? '-' : (studentRow.isPassed ? 'PROMOTED / PASSED' : 'FAILED / DETAINED')}
                                                                </td>
                                                            </tr>
                                                        </tfoot>
                                                    </>
                                                )}
                                            </table>

                                            {/* 4. Performance Summary Strip */}
                                            <div className="grid grid-cols-5 gap-3 p-3 bg-slate-50 border border-slate-300 rounded-lg text-center text-xs mb-6">
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Total Marks</span>
                                                    <span className="text-base font-black text-slate-900">
                                                        {studentRow.totalObtained} <span className="text-xs text-slate-500 font-normal">/ {studentRow.totalMax}</span>
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Percentage</span>
                                                    <span className="text-base font-black text-slate-900">{studentRow.percentage}%</span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Overall Grade</span>
                                                    <span className="text-base font-black text-indigo-700">
                                                        {!studentRow.isComplete ? '-' : studentRow.grade}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Class Position</span>
                                                    <span className="text-base font-black text-emerald-700">{getOrdinal(studentRow.position)}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Result Status</span>
                                                    <span className={`text-sm font-black uppercase ${
                                                        !studentRow.isComplete ? 'text-slate-400' :
                                                        studentRow.isPassed ? 'text-emerald-700' : 'text-rose-700'
                                                    }`}>
                                                        {!studentRow.isComplete ? '-' : (studentRow.isPassed ? 'PASSED' : 'FAILED')}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Official Grading Matrix / Legend */}
                                            {(() => {
                                                const activeScale = (currentExam?.gradingScale && Array.isArray(currentExam.gradingScale) && currentExam.gradingScale.length > 0)
                                                    ? currentExam.gradingScale
                                                    : DEFAULT_GRADING_SCALE;
                                                const sortedScale = [...activeScale].sort((a, b) => (b.minPct ?? 0) - (a.minPct ?? 0));
                                                return (
                                                    <div className="mb-4 p-2 bg-slate-50 border border-slate-300 rounded-lg">
                                                        <div className="text-[10px] font-black uppercase text-slate-700 tracking-wider mb-1 flex items-center justify-between">
                                                            <span>Grading Scale & Official Remarks Matrix</span>
                                                            <span className="text-[9px] text-slate-500 font-bold">Standard Institutional Scale</span>
                                                        </div>
                                                        <table className="w-full text-center text-[10px] border-collapse border border-slate-400">
                                                            <thead>
                                                                <tr className="bg-slate-200 text-slate-800 font-bold">
                                                                    <th className="p-1 border border-slate-400 text-left w-24">Scale</th>
                                                                    {sortedScale.map(t => (
                                                                        <th key={t.grade} className="p-1 border border-slate-400 font-black text-slate-900">{t.grade}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                <tr className="bg-white">
                                                                    <td className="p-1 border border-slate-400 text-left font-bold text-slate-700">Marks Range</td>
                                                                    {sortedScale.map((t, idx) => {
                                                                        const max = idx === 0 ? 100 : (sortedScale[idx - 1].minPct - 1);
                                                                        const rangeStr = t.minPct === 0 ? `< ${sortedScale[idx - 1]?.minPct || 33}%` : `${t.minPct}% - ${max}%`;
                                                                        return <td key={t.grade} className="p-1 border border-slate-400 text-slate-700 font-semibold">{rangeStr}</td>;
                                                                    })}
                                                                </tr>
                                                                <tr className="bg-slate-50/50">
                                                                    <td className="p-1 border border-slate-400 text-left font-bold text-slate-700">Remarks</td>
                                                                    {sortedScale.map(t => (
                                                                        <td key={t.grade} className="p-1 border border-slate-400 italic text-slate-700 font-semibold text-[9.5px]">{t.remarks}</td>
                                                                    ))}
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                );
                                            })()}

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
                                    You are about to publish official Result Cards for <strong>{selectedStudentIdsForBatch.size}</strong> selected students of <strong>{currentClass?.name}</strong> directly to the Parents Portal.
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
                                    Upon confirmation, each student's official Result Card and a real-time notification will be delivered to their parent's account.
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

            {/* ========================================================================= */}
            {/* MODAL: SOFT RECONFIRM PUBLISH SINGLE STUDENT DMC TO PARENT               */}
            {/* ========================================================================= */}
            {singleStudentToPublish && typeof document !== 'undefined' && createPortal(
                <div className="no-print fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
                        {/* Header */}
                        <div className="p-5 bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 text-white flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur-md">
                                    <Send className="w-5 h-5 text-indigo-100" />
                                </div>
                                <div>
                                    <h3 className="font-black text-base">Confirm Publish to Parent</h3>
                                    <p className="text-[11px] text-indigo-200">{currentExam?.title || 'Exam'} • {currentClass?.name || 'Class'}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => !isUploadingToParents && setSingleStudentToPublish(null)}
                                disabled={isUploadingToParents}
                                className="p-1.5 text-white/80 hover:text-white text-lg font-bold cursor-pointer disabled:opacity-40"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Body / Student Summary Preview */}
                        <div className="p-5 space-y-4 overflow-y-auto flex-1">
                            {/* Student Card Summary */}
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                                    <div>
                                        <h4 className="font-black text-slate-900 text-sm">{singleStudentToPublish.name}</h4>
                                        <p className="text-[11px] text-slate-500 font-medium">S/O {singleStudentToPublish.fatherName || '—'}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 border border-indigo-200">
                                            Roll #{singleStudentToPublish.rollNumber}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                                    <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-xs">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Obtained</span>
                                        <span className="text-xs font-black text-slate-800">
                                            {singleStudentToPublish.totalObtained} / {singleStudentToPublish.totalMax}
                                        </span>
                                    </div>
                                    <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-xs">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Percentage</span>
                                        <span className="text-xs font-black text-indigo-600">
                                            {singleStudentToPublish.percentage}%
                                        </span>
                                    </div>
                                    <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-xs">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Grade & Pos</span>
                                        <span className="text-xs font-black text-amber-600">
                                            {singleStudentToPublish.grade} ({singleStudentToPublish.position || '—'})
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between text-xs pt-1 px-1">
                                    <span className="text-slate-500 font-medium text-[11px]">Academic Result:</span>
                                    <span className={`font-black px-2.5 py-0.5 rounded-lg text-[10px] uppercase ${
                                        singleStudentToPublish.isPassed 
                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                                    }`}>
                                        {singleStudentToPublish.isPassed ? '✓ Passed' : '✕ Needs Improvement / Fail'}
                                    </span>
                                </div>
                            </div>

                            {/* Info note */}
                            <div className="p-3 bg-violet-50/70 rounded-xl border border-violet-100 flex items-start gap-2.5 text-xs text-violet-900">
                                <Sparkles className="w-4 h-4 text-violet-600 flex-shrink-0 mt-0.5" />
                                <p className="leading-relaxed text-[11px]">
                                    Upon confirmation, <strong>{singleStudentToPublish.name}</strong>'s official DMC Result Card and an instant push notification will be delivered to the parent's account.
                                </p>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="flex items-center justify-end gap-2.5 p-4 bg-slate-50 border-t border-slate-100 flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => setSingleStudentToPublish(null)}
                                disabled={isUploadingToParents}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-200/80 rounded-xl font-bold transition-colors text-xs cursor-pointer disabled:opacity-40"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmPublishSingleStudent}
                                disabled={isUploadingToParents}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl font-black text-xs shadow-md shadow-violet-200 transition-all cursor-pointer disabled:opacity-50"
                            >
                                {isUploadingToParents ? (
                                    <>Publishing...</>
                                ) : (
                                    <>
                                        <Send className="w-3.5 h-3.5" />
                                        <span>Confirm & Publish to Parent</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}


            {/* ========================================================================= */}
            {/* MODAL: CONFIGURE ANNUAL AGGREGATE FORMULA & WEIGHTS                        */}
            {/* ========================================================================= */}
            {showAggregateModal && typeof document !== 'undefined' && createPortal(
                <div className="no-print fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
                        {/* Modal Header */}
                        <div className="p-6 bg-gradient-to-r from-indigo-700 via-indigo-800 to-violet-800 text-white flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur-md">
                                    <Scale className="w-6 h-6 text-indigo-200" />
                                </div>
                                <div>
                                    <h3 className="font-black text-lg">Annual Aggregate & Grading Formula</h3>
                                    <p className="text-xs text-indigo-200 font-medium">Session: {selectedSession} • Configure term weightings</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowAggregateModal(false)}
                                className="p-1.5 text-white/80 hover:text-white text-lg font-bold cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
                            {/* Mode Switcher */}
                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
                                    Select Calculation Methodology
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div
                                        onClick={() => setModalAggregateMode('auto')}
                                        className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                                            modalAggregateMode === 'auto'
                                                ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                                                : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <input
                                                type="radio"
                                                name="aggregateMode"
                                                checked={modalAggregateMode === 'auto'}
                                                onChange={() => setModalAggregateMode('auto')}
                                                className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                            />
                                            <span className="font-black text-slate-900 text-sm">⚡ Auto Sum / Equal Avg</span>
                                        </div>
                                        <p className="text-slate-500 text-[11px] leading-relaxed pl-5">
                                            Zero configuration. System automatically calculates total obtained marks across conducted terms or equal percentage average.
                                        </p>
                                    </div>

                                    <div
                                        onClick={() => setModalAggregateMode('custom')}
                                        className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                                            modalAggregateMode === 'custom'
                                                ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                                                : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <input
                                                type="radio"
                                                name="aggregateMode"
                                                checked={modalAggregateMode === 'custom'}
                                                onChange={() => setModalAggregateMode('custom')}
                                                className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                            />
                                            <span className="font-black text-slate-900 text-sm">⚙️ Custom % Weights</span>
                                        </div>
                                        <p className="text-slate-500 text-[11px] leading-relaxed pl-5">
                                            Assign custom % contribution for each term (e.g. First Term 20%, Mid Term 30%, Final Term 50% = 100%).
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Terms List & Weight Inputs */}
                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
                                    Terms Configured for Session {selectedSession}
                                </label>

                                {sessionExams.length === 0 ? (
                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center text-slate-500">
                                        No exams have been created under session {selectedSession} yet.
                                    </div>
                                ) : (
                                    <div className="space-y-2.5">
                                        {sessionExams.map(ex => {
                                            const isIncluded = modalIncludedExamIds.includes(ex.id);
                                            const currentWeight = modalAggregateWeights[ex.id] ?? '';

                                            return (
                                                <div
                                                    key={ex.id}
                                                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                                                        isIncluded
                                                            ? 'border-indigo-200 bg-indigo-50/30'
                                                            : 'border-slate-200 bg-slate-50/50 opacity-60'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={isIncluded}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setModalIncludedExamIds([...modalIncludedExamIds, ex.id]);
                                                                } else {
                                                                    setModalIncludedExamIds(modalIncludedExamIds.filter(id => id !== ex.id));
                                                                }
                                                            }}
                                                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                        />
                                                        <div>
                                                            <div className="font-bold text-slate-900">{ex.title}</div>
                                                            <div className="text-[10px] text-slate-400 capitalize">Status: {ex.status || 'Active'} • Session: {ex.session}</div>
                                                        </div>
                                                    </div>

                                                    {modalAggregateMode === 'custom' && isIncluded && (
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <span className="text-slate-500 font-bold text-[11px]">Weight:</span>
                                                            <div className="relative w-20">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max="100"
                                                                    value={currentWeight}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                                                                        setModalAggregateWeights({
                                                                            ...modalAggregateWeights,
                                                                            [ex.id]: val
                                                                        });
                                                                    }}
                                                                    placeholder="0"
                                                                    className="w-full pr-6 pl-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-black text-right text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                                                />
                                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 font-black text-slate-400 text-xs pointer-events-none">%</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Weight Meter / Validation */}
                            {modalAggregateMode === 'custom' && sessionExams.length > 0 && (() => {
                                const totalWeight = modalIncludedExamIds.reduce((sum, id) => {
                                    const w = parseFloat(modalAggregateWeights[id]) || 0;
                                    return sum + w;
                                }, 0);
                                const isBalanced = Math.round(totalWeight) === 100;

                                return (
                                    <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                                        isBalanced
                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                            : 'bg-amber-50 border-amber-200 text-amber-900'
                                    }`}>
                                        <div className="flex items-center gap-2">
                                            {isBalanced ? (
                                                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                                            ) : (
                                                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                                            )}
                                            <div>
                                                <div className="font-black text-sm">
                                                    Total Weight Sum: {totalWeight}% / 100%
                                                </div>
                                                <p className="text-[11px] opacity-80 mt-0.5">
                                                    {isBalanced
                                                        ? 'Perfect! Terms weights sum up exactly to 100%.'
                                                        : 'Weights must total 100% for balanced standard grading.'}
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (modalIncludedExamIds.length === 0) return;
                                                const evenWeight = Math.round(100 / modalIncludedExamIds.length);
                                                const newWeights = {};
                                                modalIncludedExamIds.forEach((id, idx) => {
                                                    newWeights[id] = idx === modalIncludedExamIds.length - 1 ? (100 - evenWeight * (modalIncludedExamIds.length - 1)) : evenWeight;
                                                });
                                                setModalAggregateWeights(newWeights);
                                            }}
                                            className="px-3 py-1.5 bg-white text-slate-700 font-black rounded-xl border border-slate-200 text-xs shadow-sm hover:bg-slate-50 transition-colors shrink-0 cursor-pointer"
                                        >
                                            Auto-Distribute 100%
                                        </button>
                                    </div>
                                );
                            })()}

                            {/* Grading Scale & Remarks System (Option 1 vs Option 2) */}
                            <div className="pt-2 border-t border-slate-100">
                                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
                                    Grading Scale & Remarks Methodology
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                    <div
                                        onClick={() => setModalGradingScaleMode('default')}
                                        className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                                            modalGradingScaleMode === 'default'
                                                ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                                                : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <input
                                                type="radio"
                                                name="gradingScaleMode"
                                                checked={modalGradingScaleMode === 'default'}
                                                onChange={() => setModalGradingScaleMode('default')}
                                                className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                            />
                                            <span className="font-black text-slate-900 text-xs">Option 1: Standard Board Scale</span>
                                        </div>
                                        <p className="text-slate-500 text-[10.5px] leading-relaxed pl-5">
                                            Standard Board Bands: A++ (90%+ Exceptional), A+ (80%+ Outstanding), A (70%+ Excellent), B (60%+ Very Good), C (50%+ Good), D (40%+ Pass), E (33%+ Marginal), F (&lt;33% Fail).
                                        </p>
                                    </div>

                                    <div
                                        onClick={() => setModalGradingScaleMode('custom')}
                                        className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                                            modalGradingScaleMode === 'custom'
                                                ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                                                : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <input
                                                type="radio"
                                                name="gradingScaleMode"
                                                checked={modalGradingScaleMode === 'custom'}
                                                onChange={() => setModalGradingScaleMode('custom')}
                                                className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                            />
                                            <span className="font-black text-slate-900 text-xs">Option 2: Custom School Scale & Remarks</span>
                                        </div>
                                        <p className="text-slate-500 text-[10.5px] leading-relaxed pl-5">
                                            Define your school's own Min %, Grade letters, and customized official teacher remarks for report cards.
                                        </p>
                                    </div>
                                </div>

                                {modalGradingScaleMode === 'custom' && (
                                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                                        <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                                            <span className="font-bold text-slate-700 text-[11px]">Custom Grade & Remarks Tiers</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setModalCustomGradingScale([
                                                        ...modalCustomGradingScale,
                                                        { minPct: 50, grade: 'C+', remarks: 'Above Average' }
                                                    ].sort((a, b) => Number(b.minPct) - Number(a.minPct)));
                                                }}
                                                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-lg border border-indigo-200 cursor-pointer"
                                            >
                                                + Add Grade Tier
                                            </button>
                                        </div>
                                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                            {modalCustomGradingScale.map((tier, tIdx) => (
                                                <div key={tIdx} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 text-xs">
                                                    <div className="w-20 shrink-0">
                                                        <span className="text-[9px] text-slate-400 font-bold block uppercase">Min %</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            value={tier.minPct}
                                                            onChange={(e) => {
                                                                const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                                                const updated = [...modalCustomGradingScale];
                                                                updated[tIdx] = { ...updated[tIdx], minPct: val };
                                                                setModalCustomGradingScale(updated);
                                                            }}
                                                            className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg font-black text-slate-800 text-xs text-center"
                                                        />
                                                    </div>
                                                    <div className="w-20 shrink-0">
                                                        <span className="text-[9px] text-slate-400 font-bold block uppercase">Grade</span>
                                                        <input
                                                            type="text"
                                                            maxLength="4"
                                                            value={tier.grade}
                                                            onChange={(e) => {
                                                                const updated = [...modalCustomGradingScale];
                                                                updated[tIdx] = { ...updated[tIdx], grade: e.target.value };
                                                                setModalCustomGradingScale(updated);
                                                            }}
                                                            className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg font-black text-indigo-700 text-xs text-center uppercase"
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-[9px] text-slate-400 font-bold block uppercase">Official Remarks</span>
                                                        <input
                                                            type="text"
                                                            value={tier.remarks}
                                                            onChange={(e) => {
                                                                const updated = [...modalCustomGradingScale];
                                                                updated[tIdx] = { ...updated[tIdx], remarks: e.target.value };
                                                                setModalCustomGradingScale(updated);
                                                            }}
                                                            placeholder="e.g. Excellent, Good..."
                                                            className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-800 text-xs"
                                                        />
                                                    </div>
                                                    {modalCustomGradingScale.length > 2 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setModalCustomGradingScale(modalCustomGradingScale.filter((_, i) => i !== tIdx));
                                                            }}
                                                            className="w-6 h-6 shrink-0 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs flex items-center justify-center mt-3 cursor-pointer"
                                                            title="Remove tier"
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setModalCustomGradingScale(DEFAULT_GRADING_SCALE)}
                                            className="text-[10px] text-slate-500 hover:text-indigo-600 underline font-semibold mt-1 cursor-pointer"
                                        >
                                            Reset to Standard Board Scale
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Footer Buttons */}
                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setShowAggregateModal(false)}
                                    disabled={isSavingAggregateConfig}
                                    className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-colors text-xs cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        handleSaveAggregateConfig({
                                            mode: modalAggregateMode,
                                            weights: modalAggregateWeights,
                                            includedExamIds: modalIncludedExamIds,
                                            gradingScaleMode: modalGradingScaleMode,
                                            customGradingScale: modalCustomGradingScale
                                        });
                                    }}
                                    disabled={isSavingAggregateConfig}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl font-black text-xs shadow-md shadow-indigo-200 transition-all cursor-pointer disabled:opacity-50"
                                >
                                    {isSavingAggregateConfig ? (
                                        <>Saving Formula...</>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            Save Aggregate Formula
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
