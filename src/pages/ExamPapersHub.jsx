import React, { useState, useEffect, useMemo } from 'react';
import { 
    FileCheck, Search, Printer, Eye, CheckCircle2, 
    Clock, RefreshCw, 
    FileText, Check, X, RotateCcw,
    LayoutGrid, List, ChevronDown, Sparkles, Trash2,
    AlertTriangle, CheckSquare, Square, Filter, Layers,
    Calendar, ShieldAlert, ZoomIn, ZoomOut, Maximize2, Minimize2
} from 'lucide-react';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { 
    collection, doc, onSnapshot, query, orderBy, 
    updateDoc, getDoc, serverTimestamp, addDoc, deleteDoc, getDocs, Timestamp 
} from 'firebase/firestore';

const ExamPapersHub = () => {
    // School session state
    const [schoolId, setSchoolId] = useState(null);
    const [schoolInfo, setSchoolInfo] = useState({
        name: 'School Examination Department',
        campus: 'Main Campus',
        logoUrl: null,
        board: 'BISE'
    });

    // Real-time Papers list from Firestore
    const [papers, setPapers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isInjecting, setIsInjecting] = useState(false);

    // Multi-select & Bulk Delete state
    const [selectedPaperIds, setSelectedPaperIds] = useState(new Set());

    // Single Delete Confirmation Modal state
    const [paperToDelete, setPaperToDelete] = useState(null);
    const [isDeletingSingle, setIsDeletingSingle] = useState(false);

    // Term Cleanup Modal state
    const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false);
    const [cleanupType, setCleanupType] = useState('printed'); // 'printed' | 'term' | 'all'
    const [selectedCleanupTerm, setSelectedCleanupTerm] = useState('all');
    const [isExecutingCleanup, setIsExecutingCleanup] = useState(false);

    // Filter & Search states
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'printed'
    const [selectedGrade, setSelectedGrade] = useState('all');
    const [selectedSubject, setSelectedSubject] = useState('all');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

    // Selected paper for WYSIWYG A4 Preview Modal
    const [activePaper, setActivePaper] = useState(null);
    const [previewTab, setPreviewTab] = useState('paper'); // 'paper' | 'answers'
    const [zoomLevel, setZoomLevel] = useState(1); // 0.5 to 1.8
    const [isFullscreenModal, setIsFullscreenModal] = useState(false);

    const [submittingAction, setSubmittingAction] = useState(false);

    // Toast notification state
    const [toast, setToast] = useState(null);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    // Helper: Normalize School ID
    const normalizeSchoolId = (id) => {
        if (!id) return null;
        let str = String(id).trim().toUpperCase();
        if (/^\d+$/.test(str)) {
            return `SCHOOL_${str}`;
        }
        return str;
    };

    // 1. Rock-Solid School ID & Profile Resolution
    useEffect(() => {
        const resolveSchoolFromUser = async (user) => {
            let sId = null;

            // 1. Try manual_session
            const manualSession = localStorage.getItem("manual_session");
            if (manualSession) {
                try {
                    sId = JSON.parse(manualSession)?.schoolId;
                } catch (e) {
                    console.error("Session parse error:", e);
                }
            }

            // 2. Try auth token claims
            if (!sId && user) {
                try {
                    const token = await user.getIdTokenResult();
                    sId = token.claims?.schoolId;
                } catch (e) {
                    console.error("Token error:", e);
                }
            }

            // 3. Fallback: check global_users document
            if (!sId && user) {
                try {
                    const uDoc = await getDoc(doc(db, 'global_users', user.uid));
                    if (uDoc.exists()) {
                        sId = uDoc.data().schoolId;
                    }
                } catch (e) {
                    console.warn("global_users fetch fallback:", e);
                }
            }

            // 4. Default fallback to SCHOOL_6257
            const finalSchoolId = normalizeSchoolId(sId) || 'SCHOOL_6257';
            setSchoolId(finalSchoolId);

            // Fetch school branding info
            try {
                const schoolDoc = await getDoc(doc(db, 'schools', finalSchoolId));
                if (schoolDoc.exists()) {
                    const sData = schoolDoc.data();
                    setSchoolInfo({
                        name: sData.name || sData.schoolName || 'The Superior Academy & High School',
                        campus: sData.campus || sData.address || 'Main Campus',
                        logoUrl: sData.logoUrl || sData.logo || sData.profileImage || null,
                        board: sData.board || localStorage.getItem('mai_selected_board') || 'BISE Kohat'
                    });
                }
            } catch (err) {
                console.warn("Could not load school profile:", err);
            }
        };

        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            resolveSchoolFromUser(user);
        });

        return () => unsubscribeAuth();
    }, []);

    // 2. Real-time Subscription to Teacher Submitted Papers with Instant Session Cache
    useEffect(() => {
        if (!schoolId) {
            setLoading(false);
            return;
        }

        const cacheKey = `mai_exam_papers_${schoolId}`;
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setPapers(parsed);
                    setLoading(false);
                }
            }
        } catch (e) {
            console.warn("Session cache read error:", e);
        }

        const papersRef = collection(db, 'schools', schoolId, 'exam_papers');
        const q = query(papersRef, orderBy('submittedAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            }));
            setPapers(list);
            setLoading(false);

            try {
                sessionStorage.setItem(cacheKey, JSON.stringify(list));
            } catch (e) {}

            setActivePaper(prev => {
                if (!prev) return null;
                const updated = list.find(p => p.id === prev.id);
                if (updated && (updated.status !== prev.status || updated.pdfUrl !== prev.pdfUrl || updated.answerPdfUrl !== prev.answerPdfUrl)) {
                    return updated;
                }
                return prev;
            });
        }, (err) => {
            console.error("Error subscribing to exam_papers:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [schoolId]);

    // 3. Computed Metrics for Top Overview Bar
    const stats = useMemo(() => {
        const pending = papers.filter(p => p.status === 'pending' || !p.status).length;
        const approved = papers.filter(p => p.status === 'approved').length;
        const printed = papers.filter(p => p.status === 'printed').length;
        return {
            total: papers.length,
            pending,
            approved,
            printed
        };
    }, [papers]);

    // Available Grades & Subjects for dropdown filters
    const availableGrades = useMemo(() => {
        const set = new Set();
        papers.forEach(p => {
            if (p.grade) set.add(p.grade.toString());
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }, [papers]);

    const availableSubjects = useMemo(() => {
        const set = new Set();
        papers.forEach(p => {
            if (p.subject) set.add(p.subject);
        });
        return Array.from(set).sort();
    }, [papers]);

    // Distinct Exam Titles / Terms for Term Cleanup
    const distinctTerms = useMemo(() => {
        const set = new Set();
        papers.forEach(p => {
            if (p.examTitle) set.add(p.examTitle.trim());
        });
        return Array.from(set).sort();
    }, [papers]);

    // Filtered Papers
    const filteredPapers = useMemo(() => {
        return papers.filter(paper => {
            // Status filter
            if (statusFilter === 'pending' && (paper.status && paper.status !== 'pending')) return false;
            if (statusFilter === 'approved' && paper.status !== 'approved') return false;
            if (statusFilter === 'printed' && paper.status !== 'printed') return false;

            // Grade filter
            if (selectedGrade !== 'all' && (paper.grade?.toString() !== selectedGrade)) return false;

            // Subject filter
            if (selectedSubject !== 'all' && (paper.subject !== selectedSubject)) return false;

            // Search filter
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const teacher = (paper.teacherName || '').toLowerCase();
                const title = (paper.examTitle || '').toLowerCase();
                const subj = (paper.subject || '').toLowerCase();
                const ch = (paper.chapterTitle || '').toLowerCase();
                const grade = (paper.grade || '').toString().toLowerCase();
                if (!teacher.includes(term) && !title.includes(term) && !subj.includes(term) && !ch.includes(term) && !grade.includes(term)) {
                    return false;
                }
            }

            return true;
        });
    }, [papers, statusFilter, selectedGrade, selectedSubject, searchTerm]);

    // Format Relative Time / Date
    const formatTimestamp = (ts) => {
        if (!ts) return 'Just now';
        try {
            const date = ts.toDate ? ts.toDate() : new Date(ts);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);

            if (diffMins < 2) return 'Just now';
            if (diffMins < 60) return `${diffMins} mins ago`;
            if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
            if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
            return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch {
            return 'Recent';
        }
    };

    // Selection Handlers
    const toggleSelectPaper = (paperId, e) => {
        if (e) e.stopPropagation();
        setSelectedPaperIds(prev => {
            const next = new Set(prev);
            if (next.has(paperId)) {
                next.delete(paperId);
            } else {
                next.add(paperId);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedPaperIds.size === filteredPapers.length) {
            setSelectedPaperIds(new Set());
        } else {
            const allIds = new Set(filteredPapers.map(p => p.id));
            setSelectedPaperIds(allIds);
        }
    };

    // Action: Delete Single Paper
    const confirmDeleteSingle = async () => {
        if (!schoolId || !paperToDelete?.id) return;
        setIsDeletingSingle(true);
        try {
            await deleteDoc(doc(db, 'schools', schoolId, 'exam_papers', paperToDelete.id));
            showToast(`Paper for Class ${paperToDelete.grade} ${paperToDelete.subject} permanently deleted.`);
            setPaperToDelete(null);
            if (activePaper?.id === paperToDelete.id) {
                setActivePaper(null);
            }
            // Remove from selected set if present
            setSelectedPaperIds(prev => {
                const next = new Set(prev);
                next.delete(paperToDelete.id);
                return next;
            });
        } catch (err) {
            console.error("Delete error:", err);
            showToast("Failed to delete paper: " + err.message, "error");
        } finally {
            setIsDeletingSingle(false);
        }
    };

    // Action: Delete Selected Papers (Bulk)
    const deleteSelectedPapers = async () => {
        if (!schoolId || selectedPaperIds.size === 0) return;
        const count = selectedPaperIds.size;
        if (!window.confirm(`Are you sure you want to permanently delete ${count} selected examination papers?`)) {
            return;
        }

        try {
            const promises = Array.from(selectedPaperIds).map(id => 
                deleteDoc(doc(db, 'schools', schoolId, 'exam_papers', id))
            );
            await Promise.all(promises);
            showToast(`Successfully deleted ${count} selected papers from database.`);
            setSelectedPaperIds(new Set());
            if (activePaper && selectedPaperIds.has(activePaper.id)) {
                setActivePaper(null);
            }
        } catch (err) {
            console.error("Bulk delete error:", err);
            showToast("Failed to delete selected papers.", "error");
        }
    };

    // Action: Term Cleanup Execution
    const executeTermCleanup = async () => {
        if (!schoolId) return;
        setIsExecutingCleanup(true);

        try {
            let papersToPurge = [];

            if (cleanupType === 'printed') {
                papersToPurge = papers.filter(p => p.status === 'printed');
            } else if (cleanupType === 'term') {
                if (selectedCleanupTerm === 'all') {
                    papersToPurge = papers;
                } else {
                    papersToPurge = papers.filter(p => (p.examTitle || '').trim() === selectedCleanupTerm);
                }
            } else if (cleanupType === 'all') {
                papersToPurge = papers;
            }

            if (papersToPurge.length === 0) {
                showToast("No matching papers found for this cleanup criteria.", "error");
                setIsExecutingCleanup(false);
                return;
            }

            const deletePromises = papersToPurge.map(p => 
                deleteDoc(doc(db, 'schools', schoolId, 'exam_papers', p.id))
            );
            await Promise.all(deletePromises);

            showToast(`Cleanup completed: ${papersToPurge.length} old examination papers removed.`);
            setIsCleanupModalOpen(false);
            setSelectedPaperIds(new Set());
            setActivePaper(null);
        } catch (err) {
            console.error("Cleanup error:", err);
            showToast("Failed to execute cleanup: " + err.message, "error");
        } finally {
            setIsExecutingCleanup(false);
        }
    };

    // Action: Inject Demo Papers (Temporary testing tool)
    const injectDemoPapers = async () => {
        if (!schoolId) {
            showToast("School ID not ready yet. Please wait a moment.", "error");
            return;
        }

        setIsInjecting(true);
        try {
            const papersCol = collection(db, 'schools', schoolId, 'exam_papers');
            const now = Date.now();

            const dummyPapers = [
                {
                    isDemo: true,
                    examTitle: '1st Term Examination 2026',
                    grade: '9',
                    subject: 'Biology',
                    chapterTitle: 'Ch 1: Introduction to Biology & Cell Structure',
                    teacherName: 'Sir Ahmad Bilal',
                    totalMarks: 50,
                    timeAllowed: '1.5 Hours',
                    status: 'pending',
                    submittedAt: Timestamp.fromMillis(now - 25 * 60 * 1000),
                    schoolBranding: {
                        name: schoolInfo.name || 'The Superior Academy & High School',
                        campus: schoolInfo.campus || 'Main Campus',
                        board: schoolInfo.board || 'BISE Kohat'
                    },
                    questions: [
                        {
                            id: 'b1',
                            questionText: 'Which organelle is universally known as the powerhouse of the cell?',
                            options: ['Golgi Apparatus', 'Mitochondria', 'Ribosome', 'Endoplasmic Reticulum'],
                            correctAnswer: 'B) Mitochondria',
                            marks: 1
                        },
                        {
                            id: 'b2',
                            questionText: 'The scientific study of tissues at microscopic level is known as:',
                            options: ['Histology', 'Morphology', 'Physiology', 'Taxonomy'],
                            correctAnswer: 'A) Histology',
                            marks: 1
                        },
                        {
                            id: 'b3',
                            questionText: 'Define organ system level with two suitable examples from human anatomy.',
                            options: [],
                            correctAnswer: 'Organ systems are groups of organs working cooperatively (e.g., Digestive System, Circulatory System).',
                            marks: 4
                        },
                        {
                            id: 'b4',
                            questionText: 'Differentiate between prokaryotic and eukaryotic cells with labeled diagrams.',
                            options: [],
                            correctAnswer: 'Prokaryotes lack membrane-bound nucleus; Eukaryotes possess well-defined nucleus.',
                            marks: 8
                        }
                    ]
                },
                {
                    isDemo: true,
                    examTitle: 'Mid-Term Assessment 2026',
                    grade: '10',
                    subject: 'Physics',
                    chapterTitle: 'Unit 10: Simple Harmonic Motion & Waves',
                    teacherName: 'Engr. Salman Farooq',
                    totalMarks: 50,
                    timeAllowed: '1.5 Hours',
                    status: 'pending',
                    submittedAt: Timestamp.fromMillis(now - 80 * 60 * 1000),
                    schoolBranding: {
                        name: schoolInfo.name || 'The Superior Academy & High School',
                        campus: schoolInfo.campus || 'Main Campus',
                        board: schoolInfo.board || 'BISE Kohat'
                    },
                    questions: [
                        {
                            id: 'p1',
                            questionText: 'What is the frequency of a wave having a time period of 0.02 seconds?',
                            options: ['25 Hz', '50 Hz', '100 Hz', '200 Hz'],
                            correctAnswer: 'B) 50 Hz (f = 1/T = 1/0.02 = 50Hz)',
                            marks: 1
                        },
                        {
                            id: 'p2',
                            questionText: 'Which of the following characteristics of a wave remains unchanged during refraction?',
                            options: ['Speed', 'Frequency', 'Wavelength', 'Direction'],
                            correctAnswer: 'B) Frequency',
                            marks: 1
                        },
                        {
                            id: 'p3',
                            questionText: 'State Hooke’s Law and write down its mathematical equation for a vibrating mass-spring system.',
                            options: [],
                            correctAnswer: 'F = -kx where k is spring constant and x is displacement.',
                            marks: 4
                        },
                        {
                            id: 'p4',
                            questionText: 'Prove that the motion of a simple pendulum is Simple Harmonic Motion (SHM).',
                            options: [],
                            correctAnswer: 'Restoring force is directly proportional to displacement: F = -mg sin(theta) ≈ -mg(x/L).',
                            marks: 8
                        }
                    ]
                },
                {
                    isDemo: true,
                    examTitle: 'ماہانہ امتحانی ٹیسٹ 2026',
                    grade: '7',
                    subject: 'Urdu',
                    chapterTitle: 'سبق نمبر 1: حمدِ باری تعالیٰ',
                    teacherName: 'Madam Tahira Yasmeen',
                    totalMarks: 25,
                    timeAllowed: '45 Minutes',
                    status: 'approved',
                    submittedAt: Timestamp.fromMillis(now - 180 * 60 * 1000),
                    schoolBranding: {
                        name: 'دی سپیریئر اکیڈمی اینڈ ہائی اسکول',
                        campus: 'مین کیمپس',
                        board: 'بورڈ آف انٹرمیڈیٹ اینڈ سیکنڈری ایجوکیشن'
                    },
                    questions: [
                        {
                            id: 'u1',
                            questionText: 'حمد کس نظم کو کہا جاتا ہے؟',
                            options: ['جس میں اللہ تعالیٰ کی تعریف ہو', 'جس میں نبی کریم ﷺ کی تعریف ہو', 'جس میں صحابہ کا ذکر ہو', 'جس میں وطن کی محبت ہو'],
                            correctAnswer: 'الف) جس میں اللہ تعالیٰ کی تعریف ہو',
                            marks: 1
                        },
                        {
                            id: 'u2',
                            questionText: 'لفظ فلک کے درست معنی کیا ہیں؟',
                            options: ['زمین', 'آسمان', 'چاند', 'ستارے'],
                            correctAnswer: 'ب) آسمان',
                            marks: 1
                        },
                        {
                            id: 'u3',
                            questionText: 'حمد کے پہلے شعر کی تشریح اپنے آسان الفاظ میں تحریر کریں۔',
                            options: [],
                            correctAnswer: 'اللہ تعالیٰ نے اس کائنات کو حسن بخشا اور ہر شے اس کی قدرت کا ثبوت ہے۔',
                            marks: 5
                        },
                        {
                            id: 'u4',
                            questionText: 'اللہ تعالیٰ کی کوئی سی پانچ ایسی نعمتوں کے نام لکھیں جو ہمیں روزمرہ زندگی میں میسر ہیں۔',
                            options: [],
                            correctAnswer: 'ہوا، پانی، سورج کی روشنی، عقل و بصیرت، صحت۔',
                            marks: 5
                        }
                    ]
                },
                {
                    isDemo: true,
                    examTitle: 'Annual Board Pattern Paper 2026',
                    grade: '8',
                    subject: 'Mathematics',
                    chapterTitle: 'Ch 2: Real Numbers & Sets',
                    teacherName: 'Sir Muhammad Ikram',
                    totalMarks: 75,
                    timeAllowed: '2 Hours',
                    status: 'printed',
                    submittedAt: Timestamp.fromMillis(now - 24 * 3600 * 1000),
                    schoolBranding: {
                        name: schoolInfo.name || 'The Superior Academy & High School',
                        campus: schoolInfo.campus || 'Main Campus',
                        board: schoolInfo.board || 'BISE Kohat'
                    },
                    questions: [
                        {
                            id: 'm1',
                            questionText: 'If A = {1, 2, 3} and B = {3, 4, 5}, then A ∩ B equals:',
                            options: ['{1, 2}', '{3}', '{4, 5}', '{1, 2, 3, 4, 5}'],
                            correctAnswer: 'B) {3}',
                            marks: 1
                        },
                        {
                            id: 'm2',
                            questionText: 'Find the square root of 529 using prime factorization method.',
                            options: [],
                            correctAnswer: '529 = 23 x 23, hence sqrt(529) = 23.',
                            marks: 4
                        },
                        {
                            id: 'm3',
                            questionText: 'Verify De Morgan’s Laws for universal set U = {1, 2, 3, ..., 10}.',
                            options: [],
                            correctAnswer: "(A U B)' = A' ∩ B' and (A ∩ B)' = A' U B'.",
                            marks: 8
                        }
                    ]
                },
                {
                    isDemo: true,
                    examTitle: 'Monthly Test - Chapters 1 & 2',
                    grade: '9',
                    subject: 'Chemistry',
                    chapterTitle: 'Fundamentals of Chemistry',
                    teacherName: 'Dr. Hamza Tariq',
                    totalMarks: 25,
                    timeAllowed: '45 Minutes',
                    status: 'needs_revision',
                    rejectionReason: 'Please add an application-level question for Section B Question 3 and rebalance the marks.',
                    submittedAt: Timestamp.fromMillis(now - 48 * 3600 * 1000),
                    schoolBranding: {
                        name: schoolInfo.name || 'The Superior Academy & High School',
                        campus: schoolInfo.campus || 'Main Campus',
                        board: schoolInfo.board || 'BISE Kohat'
                    },
                    questions: [
                        {
                            id: 'c1',
                            questionText: 'Empirical formula of hydrogen peroxide (H2O2) is:',
                            options: ['H2O', 'HO', 'H2O2', 'O2H'],
                            correctAnswer: 'B) HO',
                            marks: 1
                        },
                        {
                            id: 'c2',
                            questionText: 'Calculate the molecular mass of Nitric Acid (HNO3).',
                            options: [],
                            correctAnswer: 'H(1) + N(14) + O3(48) = 63 amu.',
                            marks: 3
                        }
                    ]
                }
            ];

            for (const p of dummyPapers) {
                await addDoc(papersCol, p);
            }

            showToast("5 Demo Exam Papers successfully injected!");
        } catch (err) {
            console.error("Inject error:", err);
            showToast("Failed to inject demo papers: " + err.message, "error");
        } finally {
            setIsInjecting(false);
        }
    };

    // Action: Approve Paper
    const handleApprove = async (paper, e) => {
        if (e) e.stopPropagation();
        if (!schoolId || !paper?.id) return;
        setSubmittingAction(true);
        try {
            const docRef = doc(db, 'schools', schoolId, 'exam_papers', paper.id);
            await updateDoc(docRef, {
                status: 'approved',
                approvedAt: serverTimestamp(),
                approvedBy: auth.currentUser?.email || 'Principal',
                rejectionReason: null
            });
            showToast(`Paper for Class ${paper.grade} ${paper.subject} has been approved!`);
        } catch (err) {
            console.error("Approve error:", err);
            showToast("Failed to approve paper. Please try again.", "error");
        } finally {
            setSubmittingAction(false);
        }
    };

    // Action: Mark as Printed & Trigger Print
    const handlePrint = (paper, e) => {
        if (e) e.stopPropagation();
        if (!paper) return;

        const isViewingThisModal = activePaper && activePaper.id === paper.id;
        const isAnswerTab = isViewingThisModal && previewTab === 'answers';
        const targetPdfUrl = isAnswerTab 
            ? (paper.answerPdfUrl || paper.pdfUrl) 
            : (paper.pdfUrl || paper.answerPdfUrl);

        if (targetPdfUrl) {
            const printWindow = window.open(targetPdfUrl, '_blank');
            if (printWindow) {
                printWindow.focus();
            }
        } else {
            setActivePaper(paper);
            setTimeout(() => {
                window.print();
            }, 500);
        }

        if (schoolId && paper.id && paper.status !== 'printed') {
            const docRef = doc(db, 'schools', schoolId, 'exam_papers', paper.id);
            updateDoc(docRef, {
                status: 'printed',
                printedAt: serverTimestamp()
            }).catch(console.warn);
        }
    };

    const handleOpenPaper = (paper) => {
        if (!paper) return;
        setActivePaper(paper);
        setPreviewTab('paper');
        setZoomLevel(1);
        setIsFullscreenModal(false);
    };

    const isUrduSubject = (subject = '') => {
        return /^(urdu|islamiat|islamiyat|tarjuma|arabic|pashto|sindhi)/i.test((subject || '').trim());
    };

    return (
        <div style={{
            width: '100%',
            minHeight: '100vh',
            background: '#f8fafc',
            color: '#0f172a',
            padding: '24px 32px',
            boxSizing: 'border-box',
            fontFamily: "'Outfit', sans-serif"
        }}>
            {/* Full-Bleed Overrides to remove padding wrapper and enforce Day Mode */}
            <style>{`
                .main-content {
                    padding: 0px !important;
                    background-color: #f8fafc !important;
                }
            `}</style>

            {/* Toast Notification */}
            {toast && (
                <div style={{
                    position: 'fixed',
                    top: '24px',
                    right: '24px',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 20px',
                    borderRadius: '14px',
                    color: '#ffffff',
                    fontWeight: '600',
                    fontSize: '14px',
                    background: toast.type === 'error' ? '#e11d48' : '#059669',
                    boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.25)'
                }}>
                    {toast.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
                    <span>{toast.message}</span>
                </div>
            )}

            {/* TOP HEADER HERO BANNER (DAY MODE) */}
            <div style={{
                position: 'relative',
                borderRadius: '24px',
                padding: '26px 32px',
                background: 'linear-gradient(135deg, #3730a3 0%, #4f46e5 50%, #6366f1 100%)',
                boxShadow: '0 20px 35px -10px rgba(79, 70, 229, 0.28)',
                marginBottom: '24px',
                overflow: 'hidden',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '16px',
                        background: 'rgba(255, 255, 255, 0.2)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 8px 16px rgba(0, 0, 0, 0.15)'
                    }}>
                        <FileCheck size={28} color="#ffffff" />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '800', letterSpacing: '-0.5px' }}>
                                Exam Papers Hub
                            </h1>
                            <span style={{
                                background: 'rgba(255, 255, 255, 0.2)',
                                border: '1px solid rgba(255, 255, 255, 0.3)',
                                padding: '3px 10px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: '700',
                                letterSpacing: '0.4px',
                                textTransform: 'uppercase'
                            }}>
                                Review, Approvals & Printing
                            </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '13px', color: '#e0e7ff', fontWeight: '500' }}>
                            Direct real-time stream of teacher-created SLO question papers across all classes
                        </p>
                    </div>
                </div>

                {/* Top Action Buttons (Term Cleanup, Inject Demo, View Switcher) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* TERM CLEANUP BUTTON */}
                    <button 
                        onClick={() => setIsCleanupModalOpen(true)}
                        style={{
                            padding: '9px 16px',
                            borderRadius: '12px',
                            background: 'rgba(255, 255, 255, 0.2)',
                            color: '#ffffff',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            fontWeight: '700',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '7px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        title="Purge old papers or reset database for a new term"
                    >
                        <Trash2 size={16} />
                        <span>Term Cleanup</span>
                    </button>


                    {/* VIEW SWITCHER */}
                    <button 
                        onClick={() => setViewMode(viewMode === 'grid' ? 'table' : 'grid')}
                        style={{
                            padding: '9px 16px',
                            borderRadius: '12px',
                            background: '#ffffff',
                            color: '#4f46e5',
                            border: 'none',
                            fontWeight: '700',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                        }}
                    >
                        {viewMode === 'grid' ? <List size={16} /> : <LayoutGrid size={16} />}
                        <span>{viewMode === 'grid' ? 'List View' : 'Grid Cards'}</span>
                    </button>
                </div>
            </div>

            {/* FLOATING BULK SELECTION ACTION BAR */}
            {selectedPaperIds.size > 0 && (
                <div style={{
                    position: 'sticky',
                    top: '20px',
                    zIndex: 40,
                    marginBottom: '20px',
                    padding: '12px 20px',
                    borderRadius: '16px',
                    background: '#1e293b',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                    animation: 'fadeIn 0.2s ease-in-out'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{
                            padding: '3px 10px',
                            borderRadius: '8px',
                            background: '#4f46e5',
                            fontSize: '12px',
                            fontWeight: '800'
                        }}>
                            {selectedPaperIds.size} Selected
                        </span>
                        <span style={{ fontSize: '13px', color: '#cbd5e1' }}>
                            Manage or delete selected examination papers
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button 
                            onClick={() => setSelectedPaperIds(new Set())}
                            style={{
                                padding: '7px 14px',
                                borderRadius: '8px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                color: '#ffffff',
                                border: 'none',
                                fontSize: '12px',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            Deselect All
                        </button>
                        <button 
                            onClick={deleteSelectedPapers}
                            style={{
                                padding: '7px 16px',
                                borderRadius: '8px',
                                background: '#ef4444',
                                color: '#ffffff',
                                border: 'none',
                                fontSize: '12px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 4px 10px rgba(239, 68, 68, 0.3)'
                            }}
                        >
                            <Trash2 size={14} />
                            <span>Delete Selected ({selectedPaperIds.size})</span>
                        </button>
                    </div>
                </div>
            )}

            {/* QUICK STATS METRIC BAR (DAY MODE) */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '14px',
                marginBottom: '24px'
            }}>
                <div 
                    onClick={() => setStatusFilter('all')}
                    style={{
                        padding: '16px 20px',
                        borderRadius: '18px',
                        background: statusFilter === 'all' ? '#eef2ff' : '#ffffff',
                        border: statusFilter === 'all' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                        transition: 'all 0.2s'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>All Papers</span>
                        <FileText size={16} color="#6366f1" />
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: '900', color: '#1e293b' }}>{stats.total}</div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Total submitted</span>
                </div>

                <div 
                    onClick={() => setStatusFilter('pending')}
                    style={{
                        padding: '16px 20px',
                        borderRadius: '18px',
                        background: statusFilter === 'pending' ? '#fffbeb' : '#ffffff',
                        border: statusFilter === 'pending' ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                        position: 'relative',
                        transition: 'all 0.2s'
                    }}
                >
                    {stats.pending > 0 && (
                        <span style={{
                            position: 'absolute',
                            top: '12px',
                            right: '12px',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: '#f59e0b'
                        }} />
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '800', color: '#d97706', textTransform: 'uppercase' }}>Pending Review</span>
                        <Clock size={16} color="#d97706" />
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: '900', color: '#b45309' }}>{stats.pending}</div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Awaiting approval</span>
                </div>

                <div 
                    onClick={() => setStatusFilter('approved')}
                    style={{
                        padding: '16px 20px',
                        borderRadius: '18px',
                        background: statusFilter === 'approved' ? '#ecfdf5' : '#ffffff',
                        border: statusFilter === 'approved' ? '2px solid #10b981' : '1px solid #e2e8f0',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                        transition: 'all 0.2s'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '800', color: '#059669', textTransform: 'uppercase' }}>Approved</span>
                        <CheckCircle2 size={16} color="#059669" />
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: '900', color: '#047857' }}>{stats.approved}</div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Ready to print</span>
                </div>

                <div 
                    onClick={() => setStatusFilter('printed')}
                    style={{
                        padding: '16px 20px',
                        borderRadius: '18px',
                        background: statusFilter === 'printed' ? '#eff6ff' : '#ffffff',
                        border: statusFilter === 'printed' ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                        transition: 'all 0.2s'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '800', color: '#2563eb', textTransform: 'uppercase' }}>Printed</span>
                        <Printer size={16} color="#2563eb" />
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: '900', color: '#1d4ed8' }}>{stats.printed}</div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Archived & printed</span>
                </div>


            </div>

            {/* SEARCH & FILTERS BAR (DAY MODE) */}
            <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '20px',
                padding: '16px 20px',
                marginBottom: '24px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
            }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '12px',
                    alignItems: 'center'
                }}>
                    {/* Search Field */}
                    <div style={{ position: 'relative' }}>
                        <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input 
                            type="text"
                            placeholder="Search by Teacher, Subject, Class..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 14px 10px 40px',
                                borderRadius: '12px',
                                border: '1px solid #cbd5e1',
                                background: '#f8fafc',
                                fontSize: '13px',
                                outline: 'none',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    {/* Class Filter */}
                    <div style={{ position: 'relative' }}>
                        <select 
                            value={selectedGrade}
                            onChange={(e) => setSelectedGrade(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                borderRadius: '12px',
                                border: '1px solid #cbd5e1',
                                background: '#f8fafc',
                                fontSize: '13px',
                                outline: 'none',
                                cursor: 'pointer',
                                boxSizing: 'border-box'
                            }}
                        >
                            <option value="all">All Classes & Grades</option>
                            {availableGrades.map(g => (
                                <option key={g} value={g}>Class {g}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} color="#94a3b8" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    </div>

                    {/* Subject Filter */}
                    <div style={{ position: 'relative' }}>
                        <select 
                            value={selectedSubject}
                            onChange={(e) => setSelectedSubject(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                borderRadius: '12px',
                                border: '1px solid #cbd5e1',
                                background: '#f8fafc',
                                fontSize: '13px',
                                outline: 'none',
                                cursor: 'pointer',
                                boxSizing: 'border-box'
                            }}
                        >
                            <option value="all">All Subjects</option>
                            {availableSubjects.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} color="#94a3b8" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    </div>

                    {/* Select All Toggle & Reset */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {filteredPapers.length > 0 && (
                            <button
                                onClick={toggleSelectAll}
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '12px',
                                    background: '#f8fafc',
                                    border: '1px solid #cbd5e1',
                                    color: '#475569',
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                {selectedPaperIds.size === filteredPapers.length ? (
                                    <>
                                        <CheckSquare size={14} color="#4f46e5" />
                                        <span>Deselect All</span>
                                    </>
                                ) : (
                                    <>
                                        <Square size={14} />
                                        <span>Select All ({filteredPapers.length})</span>
                                    </>
                                )}
                            </button>
                        )}

                        {(searchTerm || selectedGrade !== 'all' || selectedSubject !== 'all' || statusFilter !== 'all') && (
                            <button 
                                onClick={() => {
                                    setSearchTerm('');
                                    setSelectedGrade('all');
                                    setSelectedSubject('all');
                                    setStatusFilter('all');
                                }}
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '12px',
                                    background: '#f1f5f9',
                                    color: '#475569',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <X size={14} />
                                <span>Reset</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* PAPERS STREAM CONTAINER */}
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: '#94a3b8' }}>
                    <RefreshCw size={32} color="#4f46e5" className="animate-spin" style={{ marginBottom: '12px' }} />
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>Connecting to examination desk stream...</p>
                </div>
            ) : filteredPapers.length === 0 ? (
                <div style={{
                    background: '#ffffff',
                    border: '2px dashed #cbd5e1',
                    borderRadius: '24px',
                    padding: '48px 24px',
                    textAlign: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
                }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '20px',
                        background: '#eef2ff',
                        color: '#4f46e5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px'
                    }}>
                        <FileCheck size={32} />
                    </div>
                    <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: '800', color: '#1e293b' }}>
                        No Examination Papers in this View
                    </h3>
                    <p style={{ margin: '0 auto 20px', fontSize: '13px', color: '#64748b', maxWidth: '440px', lineHeight: '1.5' }}>
                        {statusFilter !== 'all' 
                            ? `There are currently no papers with status "${statusFilter}". Try resetting your filters.`
                            : "Waiting for teachers to submit question papers from the Teacher Mobile App. When submitted, they will appear here live in real-time."}
                    </p>
                    {statusFilter !== 'all' && (
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button 
                                onClick={() => setStatusFilter('all')}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '12px',
                                    background: '#4f46e5',
                                    color: '#ffffff',
                                    border: 'none',
                                    fontWeight: '700',
                                    fontSize: '13px',
                                    cursor: 'pointer'
                                }}
                            >
                                View All Papers
                            </button>
                        </div>
                    )}
                </div>
            ) : viewMode === 'grid' ? (
                /* GRID CARDS VIEW (DAY MODE) */
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '20px'
                }}>
                    {filteredPapers.map(paper => {
                        const isPending = !paper.status || paper.status === 'pending';
                        const isApproved = paper.status === 'approved';
                        const isPrinted = paper.status === 'printed';
                        const isSelected = selectedPaperIds.has(paper.id);

                        return (
                            <div 
                                key={paper.id}
                                onClick={() => handleOpenPaper(paper)}
                                style={{
                                    background: '#ffffff',
                                    borderRadius: '20px',
                                    border: isSelected 
                                        ? '2px solid #4f46e5' 
                                        : isPending ? '1.5px solid #fde68a' : isApproved ? '1.5px solid #a7f3d0' : isPrinted ? '1.5px solid #bfdbfe' : '1px solid #e2e8f0',
                                    boxShadow: isSelected 
                                        ? '0 8px 24px -4px rgba(79, 70, 229, 0.25)' 
                                        : '0 4px 15px rgba(0,0,0,0.04)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <div style={{ padding: '20px' }}>
                                    {/* Card Top Row: Checkbox, Badges & Status */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            {/* Selection Checkbox */}
                                            <div 
                                                onClick={(e) => toggleSelectPaper(paper.id, e)}
                                                style={{
                                                    width: '20px',
                                                    height: '20px',
                                                    borderRadius: '6px',
                                                    border: isSelected ? 'none' : '2px solid #cbd5e1',
                                                    background: isSelected ? '#4f46e5' : '#ffffff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: '#ffffff',
                                                    cursor: 'pointer'
                                                }}
                                                title="Select for bulk delete"
                                            >
                                                {isSelected && <Check size={14} />}
                                            </div>

                                            <span style={{
                                                padding: '4px 10px',
                                                borderRadius: '8px',
                                                fontSize: '11px',
                                                fontWeight: '800',
                                                background: '#e0e7ff',
                                                color: '#3730a3'
                                            }}>
                                                Class {paper.grade || 'N/A'}
                                            </span>
                                            <span style={{
                                                padding: '4px 10px',
                                                borderRadius: '8px',
                                                fontSize: '11px',
                                                fontWeight: '800',
                                                background: '#f1f5f9',
                                                color: '#475569'
                                            }}>
                                                {paper.subject || 'General'}
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {isPending && (
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '4px 10px',
                                                    borderRadius: '20px',
                                                    fontSize: '11px',
                                                    fontWeight: '800',
                                                    background: '#fef3c7',
                                                    color: '#92400e',
                                                    border: '1px solid #fde68a'
                                                }}>
                                                    <Clock size={12} /> Pending
                                                </span>
                                            )}
                                            {isApproved && (
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '4px 10px',
                                                    borderRadius: '20px',
                                                    fontSize: '11px',
                                                    fontWeight: '800',
                                                    background: '#d1fae5',
                                                    color: '#065f46',
                                                    border: '1px solid #a7f3d0'
                                                }}>
                                                    <CheckCircle2 size={12} /> Approved
                                                </span>
                                            )}
                                            {isPrinted && (
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '4px 10px',
                                                    borderRadius: '20px',
                                                    fontSize: '11px',
                                                    fontWeight: '800',
                                                    background: '#dbeafe',
                                                    color: '#1e40af',
                                                    border: '1px solid #bfdbfe'
                                                }}>
                                                    <Printer size={12} /> Printed
                                                </span>
                                            )}

                                            {/* Single Delete Quick Icon */}
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPaperToDelete(paper);
                                                }}
                                                style={{
                                                    padding: '4px',
                                                    borderRadius: '6px',
                                                    border: 'none',
                                                    background: 'transparent',
                                                    color: '#94a3b8',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                                                onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
                                                title="Delete this paper"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Paper Title */}
                                    <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '800', color: '#1e293b' }}>
                                        {paper.examTitle || 'Class Examination Paper'}
                                    </h4>
                                    <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#64748b' }}>
                                        {paper.chapterTitle ? `Chapter: ${paper.chapterTitle}` : `${paper.subject} Question Paper`}
                                    </p>

                                    {/* Metrics Grid */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(3, 1fr)',
                                        gap: '8px',
                                        padding: '10px',
                                        borderRadius: '12px',
                                        background: '#f8fafc',
                                        border: '1px solid #f1f5f9',
                                        textAlign: 'center',
                                        marginBottom: '14px'
                                    }}>
                                        <div>
                                            <span style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>Marks</span>
                                            <span style={{ fontSize: '14px', fontWeight: '900', color: '#1e293b' }}>{paper.totalMarks || 50}M</span>
                                        </div>
                                        <div>
                                            <span style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>Time</span>
                                            <span style={{ fontSize: '14px', fontWeight: '900', color: '#1e293b' }}>{paper.timeAllowed || '1.5h'}</span>
                                        </div>
                                        <div>
                                            <span style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>Questions</span>
                                            <span style={{ fontSize: '14px', fontWeight: '900', color: '#1e293b' }}>
                                                {Array.isArray(paper.questions) ? paper.questions.length : (paper.questionCount || 'SLO')}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Teacher Meta */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        fontSize: '12px',
                                        color: '#64748b',
                                        paddingTop: '8px',
                                        borderTop: '1px solid #f1f5f9'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '50%',
                                                background: '#e0e7ff',
                                                color: '#4338ca',
                                                fontWeight: '800',
                                                fontSize: '11px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                {(paper.teacherName || 'T')[0].toUpperCase()}
                                            </div>
                                            <span style={{ fontWeight: '600', color: '#334155' }}>{paper.teacherName || 'Teacher'}</span>
                                        </div>
                                        <span>{formatTimestamp(paper.submittedAt)}</span>
                                    </div>


                                </div>

                                {/* Footer Actions */}
                                <div style={{
                                    padding: '12px 18px',
                                    background: '#f8fafc',
                                    borderTop: '1px solid #f1f5f9',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleOpenPaper(paper); }}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '8px',
                                            background: '#ffffff',
                                            border: '1px solid #cbd5e1',
                                            color: '#334155',
                                            fontSize: '12px',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <Eye size={14} />
                                        <span>Preview</span>
                                    </button>

                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        {isPending && (
                                            <button 
                                                disabled={submittingAction}
                                                onClick={(e) => handleApprove(paper, e)}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '8px',
                                                    background: '#10b981',
                                                    color: '#ffffff',
                                                    border: 'none',
                                                    fontSize: '12px',
                                                    fontWeight: '700',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                            >
                                                <Check size={14} />
                                                <span>Approve</span>
                                            </button>
                                        )}

                                        <button 
                                            onClick={(e) => handlePrint(paper, e)}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '8px',
                                                background: '#4f46e5',
                                                color: '#ffffff',
                                                border: 'none',
                                                fontSize: '12px',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Printer size={14} />
                                            <span>Print</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* TABLE VIEW (DAY MODE) */
                <div style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '20px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                <th style={{ padding: '14px 20px', width: '40px' }}>
                                    <div 
                                        onClick={toggleSelectAll}
                                        style={{
                                            width: '18px',
                                            height: '18px',
                                            borderRadius: '5px',
                                            border: selectedPaperIds.size === filteredPapers.length && filteredPapers.length > 0 ? 'none' : '2px solid #cbd5e1',
                                            background: selectedPaperIds.size === filteredPapers.length && filteredPapers.length > 0 ? '#4f46e5' : '#ffffff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#ffffff',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {selectedPaperIds.size === filteredPapers.length && filteredPapers.length > 0 && <Check size={12} />}
                                    </div>
                                </th>
                                <th style={{ padding: '14px 20px' }}>Class & Subject</th>
                                <th style={{ padding: '14px 20px' }}>Exam Title</th>
                                <th style={{ padding: '14px 20px' }}>Teacher</th>
                                <th style={{ padding: '14px 20px' }}>Marks / Time</th>
                                <th style={{ padding: '14px 20px' }}>Status</th>
                                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPapers.map(paper => {
                                const isSelected = selectedPaperIds.has(paper.id);
                                return (
                                    <tr 
                                        key={paper.id}
                                        onClick={() => handleOpenPaper(paper)}
                                        style={{
                                            borderBottom: '1px solid #f1f5f9',
                                            cursor: 'pointer',
                                            background: isSelected ? '#f8fafc' : 'transparent',
                                            transition: 'background 0.15s'
                                        }}
                                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
                                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <td style={{ padding: '16px 20px' }} onClick={(e) => toggleSelectPaper(paper.id, e)}>
                                            <div 
                                                style={{
                                                    width: '18px',
                                                    height: '18px',
                                                    borderRadius: '5px',
                                                    border: isSelected ? 'none' : '2px solid #cbd5e1',
                                                    background: isSelected ? '#4f46e5' : '#ffffff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: '#ffffff',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {isSelected && <Check size={12} />}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ padding: '3px 8px', borderRadius: '6px', background: '#e0e7ff', color: '#4338ca', fontWeight: '800', fontSize: '11px' }}>
                                                    Class {paper.grade}
                                                </span>
                                                <span style={{ fontWeight: '700', color: '#1e293b' }}>{paper.subject}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ fontWeight: '700', color: '#1e293b' }}>{paper.examTitle}</div>
                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{paper.chapterTitle || 'SLO Syllabus'}</div>
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ fontWeight: '600', color: '#334155' }}>{paper.teacherName}</div>
                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{formatTimestamp(paper.submittedAt)}</div>
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ fontWeight: '800', color: '#1e293b' }}>{paper.totalMarks || 50} Marks</div>
                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{paper.timeAllowed || '1.5 Hours'}</div>
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            {(!paper.status || paper.status === 'pending') && (
                                                <span style={{ padding: '4px 10px', borderRadius: '20px', background: '#fef3c7', color: '#92400e', fontWeight: '800', fontSize: '11px' }}>
                                                    Pending Review
                                                </span>
                                            )}
                                            {paper.status === 'approved' && (
                                                <span style={{ padding: '4px 10px', borderRadius: '20px', background: '#d1fae5', color: '#065f46', fontWeight: '800', fontSize: '11px' }}>
                                                    Approved
                                                </span>
                                            )}
                                            {paper.status === 'printed' && (
                                                <span style={{ padding: '4px 10px', borderRadius: '20px', background: '#dbeafe', color: '#1e40af', fontWeight: '800', fontSize: '11px' }}>
                                                    Printed
                                                </span>
                                            )}

                                        </td>
                                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }} onClick={e => e.stopPropagation()}>
                                                <button 
                                                    onClick={() => handleOpenPaper(paper)}
                                                    style={{ padding: '6px 10px', borderRadius: '8px', background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#334155' }}
                                                    title="Preview Paper"
                                                >
                                                    <Eye size={15} />
                                                </button>
                                                {(!paper.status || paper.status === 'pending') && (
                                                    <button 
                                                        onClick={(e) => handleApprove(paper, e)}
                                                        style={{ padding: '6px 10px', borderRadius: '8px', background: '#d1fae5', border: 'none', cursor: 'pointer', color: '#065f46' }}
                                                        title="Approve Paper"
                                                    >
                                                        <Check size={15} />
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={(e) => handlePrint(paper, e)}
                                                    style={{ padding: '6px 10px', borderRadius: '8px', background: '#e0e7ff', border: 'none', cursor: 'pointer', color: '#3730a3' }}
                                                    title="Print Paper"
                                                >
                                                    <Printer size={15} />
                                                </button>
                                                <button 
                                                    onClick={() => setPaperToDelete(paper)}
                                                    style={{ padding: '6px 10px', borderRadius: '8px', background: '#fee2e2', border: 'none', cursor: 'pointer', color: '#dc2626' }}
                                                    title="Delete Paper"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ================= WYSIWYG A4 CANVA PREVIEW & APPROVAL MODAL (DAY MODE) ================= */}
            {activePaper && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: isFullscreenModal ? '0px' : '24px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(6px)'
                }}>
                    <div style={{
                        background: '#ffffff',
                        borderRadius: isFullscreenModal ? '0px' : '24px',
                        width: '100%',
                        maxWidth: isFullscreenModal ? '100vw' : '1100px',
                        height: isFullscreenModal ? '100vh' : '92vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                        overflow: 'hidden',
                        border: isFullscreenModal ? 'none' : '1px solid #e2e8f0',
                        transition: 'all 0.2s ease'
                    }}>
                        {/* Modal Top Action Bar */}
                        <div style={{
                            padding: '14px 20px',
                            background: '#f8fafc',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    padding: '8px',
                                    borderRadius: '12px',
                                    background: '#4f46e5',
                                    color: '#ffffff'
                                }}>
                                    <FileCheck size={20} />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#1e293b' }}>
                                            {activePaper.examTitle || 'Exam Question Paper'}
                                        </h3>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            background: '#e0e7ff',
                                            color: '#3730a3',
                                            fontSize: '11px',
                                            fontWeight: '800'
                                        }}>
                                            Class {activePaper.grade} • {activePaper.subject}
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                                        Prepared by: <strong style={{ color: '#1e293b' }}>{activePaper.teacherName}</strong> • Submitted: {formatTimestamp(activePaper.submittedAt)}
                                    </p>
                                </div>
                            </div>

                            {/* Center Controls: Paper/Answers Toggle & Zoom Controls */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <div style={{
                                    display: 'flex',
                                    background: '#e2e8f0',
                                    padding: '3px',
                                    borderRadius: '10px'
                                }}>
                                    <button 
                                        onClick={() => setPreviewTab('paper')}
                                        style={{
                                            padding: '5px 14px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            fontSize: '12px',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            background: previewTab === 'paper' ? '#4f46e5' : 'transparent',
                                            color: previewTab === 'paper' ? '#ffffff' : '#475569'
                                        }}
                                    >
                                        Question Paper
                                    </button>
                                    <button 
                                        onClick={() => setPreviewTab('answers')}
                                        style={{
                                            padding: '5px 14px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            fontSize: '12px',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            background: previewTab === 'answers' ? '#10b981' : 'transparent',
                                            color: previewTab === 'answers' ? '#ffffff' : '#475569'
                                        }}
                                    >
                                        Answer Key
                                    </button>
                                </div>

                                {/* Interactive Zoom & Screen Controls Bar */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    background: '#ffffff',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '10px',
                                    padding: '2px 6px',
                                    gap: '2px'
                                }}>
                                    <button 
                                        onClick={() => setZoomLevel(prev => Math.max(0.5, +(prev - 0.15).toFixed(2)))}
                                        disabled={zoomLevel <= 0.5}
                                        title="Zoom Out"
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            padding: '4px',
                                            borderRadius: '6px',
                                            cursor: zoomLevel <= 0.5 ? 'not-allowed' : 'pointer',
                                            color: '#475569',
                                            display: 'flex',
                                            alignItems: 'center',
                                            opacity: zoomLevel <= 0.5 ? 0.4 : 1
                                        }}
                                    >
                                        <ZoomOut size={15} />
                                    </button>

                                    <button 
                                        onClick={() => setZoomLevel(1)}
                                        title="Click to Reset Zoom (100%)"
                                        style={{
                                            background: '#f1f5f9',
                                            border: 'none',
                                            borderRadius: '5px',
                                            padding: '3px 7px',
                                            fontSize: '11px',
                                            fontWeight: '800',
                                            color: '#1e293b',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {Math.round(zoomLevel * 100)}%
                                    </button>

                                    <button 
                                        onClick={() => setZoomLevel(prev => Math.min(1.8, +(prev + 0.15).toFixed(2)))}
                                        disabled={zoomLevel >= 1.8}
                                        title="Zoom In"
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            padding: '4px',
                                            borderRadius: '6px',
                                            cursor: zoomLevel >= 1.8 ? 'not-allowed' : 'pointer',
                                            color: '#475569',
                                            display: 'flex',
                                            alignItems: 'center',
                                            opacity: zoomLevel >= 1.8 ? 0.4 : 1
                                        }}
                                    >
                                        <ZoomIn size={15} />
                                    </button>

                                    <div style={{ width: '1px', height: '14px', background: '#cbd5e1', margin: '0 2px' }} />

                                    <button 
                                        onClick={() => setZoomLevel(zoomLevel === 1.15 ? 1 : 1.15)}
                                        title={zoomLevel === 1.15 ? "Standard View (100%)" : "Fit to Width (115%)"}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            padding: '4px',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            color: zoomLevel === 1.15 ? '#4f46e5' : '#475569',
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <RotateCcw size={14} />
                                    </button>

                                    <button 
                                        onClick={() => setIsFullscreenModal(!isFullscreenModal)}
                                        title={isFullscreenModal ? "Exit Fullscreen" : "Fullscreen Preview"}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            padding: '4px',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            color: isFullscreenModal ? '#4f46e5' : '#475569',
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}
                                    >
                                        {isFullscreenModal ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                                    </button>
                                </div>
                            </div>

                            {/* Right Actions: Confirm & Approve, Print, Delete, Close */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {activePaper.status !== 'approved' && activePaper.status !== 'printed' && (
                                    <button 
                                        disabled={submittingAction}
                                        onClick={() => handleApprove(activePaper)}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: '10px',
                                            border: 'none',
                                            background: '#10b981',
                                            color: '#ffffff',
                                            fontSize: '12px',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                                        }}
                                    >
                                        <Check size={16} />
                                        <span>Confirm & Approve</span>
                                    </button>
                                )}

                                <button 
                                    onClick={() => handlePrint(activePaper)}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: previewTab === 'answers' ? '#10b981' : '#4f46e5',
                                        color: '#ffffff',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: previewTab === 'answers' ? '0 4px 12px rgba(16, 185, 129, 0.25)' : '0 4px 12px rgba(79, 70, 229, 0.25)'
                                    }}
                                >
                                    <Printer size={16} />
                                    <span>{previewTab === 'answers' ? 'Print Answer Key' : 'Print Paper'}</span>
                                </button>

                                {/* Delete from modal */}
                                <button 
                                    onClick={() => setPaperToDelete(activePaper)}
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '10px',
                                        border: '1px solid #fecdd3',
                                        background: '#fee2e2',
                                        color: '#dc2626',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        fontSize: '12px',
                                        fontWeight: '700'
                                    }}
                                    title="Delete paper"
                                >
                                    <Trash2 size={16} />
                                    <span>Delete</span>
                                </button>

                                <button 
                                    onClick={() => setActivePaper(null)}
                                    style={{
                                        padding: '8px',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: '#e2e8f0',
                                        color: '#475569',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body: High-Performance Zero-Reload Vector Dual-Engine */}
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            overflowX: 'auto',
                            padding: isFullscreenModal ? '0px' : '20px',
                            background: '#334155',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'flex-start'
                        }}>
                            {(() => {
                                // If either Question Paper PDF or Answer Key PDF exists, use persistent dual iframes
                                if (activePaper.pdfUrl || activePaper.answerPdfUrl) {
                                    const questions = activePaper.questions || [];
                                    const mcqs = questions.filter(q => q.type === 'MCQ');
                                    const shorts = questions.filter(q => q.type === 'SHORT');
                                    const longs = questions.filter(q => q.type === 'LONG');
                                    const isUrdu = isUrduSubject(activePaper.subject);

                                    return (
                                        <div style={{
                                            width: '100%',
                                            maxWidth: isFullscreenModal ? '100%' : '1000px',
                                            height: isFullscreenModal ? 'calc(100vh - 75px)' : 'calc(92vh - 75px)',
                                            background: '#ffffff',
                                            borderRadius: isFullscreenModal ? '0px' : '12px',
                                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                                            overflow: 'hidden',
                                            position: 'relative',
                                            zoom: zoomLevel
                                        }}>
                                            {/* 1. STABLE QUESTION PAPER IFRAME (Persistent in memory, zero-reload) */}
                                            {activePaper.pdfUrl && (
                                                <iframe 
                                                    key={`paper-frame-${activePaper.id}`}
                                                    src={`${activePaper.pdfUrl}#view=FitH&toolbar=1&navpanes=0`}
                                                    style={{ 
                                                        width: '100%', 
                                                        height: '100%', 
                                                        border: 'none',
                                                        display: previewTab === 'paper' ? 'block' : 'none'
                                                    }}
                                                    title="Exact Question Paper PDF"
                                                />
                                            )}

                                            {/* 2. STABLE ANSWER KEY IFRAME (Persistent in memory, zero-reload) */}
                                            {activePaper.answerPdfUrl ? (
                                                <iframe 
                                                    key={`answers-frame-${activePaper.id}`}
                                                    src={`${activePaper.answerPdfUrl}#view=FitH&toolbar=1&navpanes=0`}
                                                    style={{ 
                                                        width: '100%', 
                                                        height: '100%', 
                                                        border: 'none',
                                                        display: previewTab === 'answers' ? 'block' : 'none'
                                                    }}
                                                    title="Exact Answer Key PDF"
                                                />
                                            ) : (
                                                /* Fallback Canva A4 Answer Key when answerPdfUrl is not yet uploaded */
                                                <div style={{
                                                    display: previewTab === 'answers' ? 'block' : 'none',
                                                    height: '100%',
                                                    overflowY: 'auto',
                                                    padding: '36px 44px',
                                                    background: '#ffffff',
                                                    color: '#0f172a',
                                                    boxSizing: 'border-box',
                                                    fontFamily: isUrdu ? "'Jameel Noori Nastaleeq', 'Urdu Typesetting', serif" : "'Outfit', sans-serif"
                                                }}>
                                                    {/* Masthead */}
                                                    <div style={{
                                                        borderBottom: '2px solid #0f172a',
                                                        paddingBottom: '12px',
                                                        marginBottom: '18px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        gap: '12px'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            {(activePaper.schoolBranding?.logoUrl || schoolInfo.logoUrl) ? (
                                                                <img 
                                                                    src={activePaper.schoolBranding?.logoUrl || schoolInfo.logoUrl} 
                                                                    alt="Logo" 
                                                                    style={{ width: '48px', height: '48px', objectFit: 'contain' }}
                                                                />
                                                            ) : (
                                                                <div style={{ width: '44px', height: '44px', borderRadius: '50%', border: '2px solid #0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '12px' }}>
                                                                    LOGO
                                                                </div>
                                                            )}
                                                            <div>
                                                                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                    {activePaper.schoolBranding?.name || schoolInfo.name || 'SMART PUBLIC SCHOOL'}
                                                                </h2>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                                                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                        {(activePaper.examTitle || 'FIRST TERM EXAMINATION 2026').toUpperCase()} • TEACHER MARKING KEY (CONFIDENTIAL)
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: '800', color: '#1e293b' }}>
                                                            <span>Class: {activePaper.grade}th | {activePaper.subject}</span>
                                                        </div>
                                                    </div>

                                                    {/* SECTION A: MCQs */}
                                                    {mcqs.length > 0 && (
                                                        <div style={{ marginBottom: '22px' }}>
                                                            <div style={{
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                background: '#f8fafc',
                                                                borderLeft: '4px solid #4f46e5',
                                                                padding: '6px 12px',
                                                                borderRadius: '0 6px 6px 0',
                                                                marginBottom: '10px'
                                                            }}>
                                                                <div>
                                                                    <span style={{ fontWeight: '800', fontSize: '13px', color: '#1e293b' }}>
                                                                        SECTION 'A' ANSWER KEY (MCQs)
                                                                    </span>
                                                                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                                                                        Official scoring options for objective sheet evaluation.
                                                                    </span>
                                                                </div>
                                                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#4f46e5', background: '#e0e7ff', padding: '2px 8px', borderRadius: '10px' }}>
                                                                    {mcqs.length} Questions
                                                                </span>
                                                            </div>

                                                            <div style={{
                                                                display: 'grid',
                                                                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                                                                gap: '8px'
                                                            }}>
                                                                {mcqs.map((q, idx) => (
                                                                    <div key={q.id || idx} style={{
                                                                        background: '#f1f5f9',
                                                                        border: '1px solid #cbd5e1',
                                                                        borderRadius: '6px',
                                                                        padding: '6px 10px',
                                                                        fontSize: '11.5px',
                                                                        fontWeight: '700',
                                                                        color: '#0f172a',
                                                                        whiteSpace: 'nowrap',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis'
                                                                    }}>
                                                                        <strong style={{ color: '#4f46e5' }}>Q{idx + 1}:</strong> {q.correctAnswer || 'N/A'}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* SECTION B: SHORT QUESTIONS */}
                                                    {shorts.length > 0 && (
                                                        <div style={{ marginBottom: '22px' }}>
                                                            <div style={{
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                background: '#f8fafc',
                                                                borderLeft: '4px solid #059669',
                                                                padding: '6px 12px',
                                                                borderRadius: '0 6px 6px 0',
                                                                marginBottom: '10px'
                                                            }}>
                                                                <div>
                                                                    <span style={{ fontWeight: '800', fontSize: '13px', color: '#1e293b' }}>
                                                                        SECTION 'B' MARKING RUBRIC (Short Questions)
                                                                    </span>
                                                                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                                                                        Award marks based on core concepts and key terms.
                                                                    </span>
                                                                </div>
                                                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#059669', background: '#d1fae5', padding: '2px 8px', borderRadius: '10px' }}>
                                                                    {shorts.length} Questions
                                                                </span>
                                                            </div>

                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                {shorts.map((q, idx) => (
                                                                    <div key={q.id || idx} style={{
                                                                        border: '1px solid #e2e8f0',
                                                                        borderRadius: '8px',
                                                                        padding: '10px 14px',
                                                                        background: '#ffffff'
                                                                    }}>
                                                                        <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                                                                            <span>Q.2 ({idx + 1}): {q.questionText}</span>
                                                                            {q.cognitiveLevel && (
                                                                                <span style={{ fontSize: '10px', color: '#64748b', marginLeft: '6px', fontWeight: '600' }}>
                                                                                    [{q.cognitiveLevel}]
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {q.diagramBase64 && (
                                                                            <div style={{ margin: '6px 0' }}>
                                                                                <img
                                                                                    src={`data:image/png;base64,${q.diagramBase64}`}
                                                                                    alt="Question Diagram"
                                                                                    style={{ maxHeight: '110px', objectFit: 'contain', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px', background: '#fff' }}
                                                                                />
                                                                            </div>
                                                                        )}
                                                                        <div style={{ fontSize: '11.5px', color: '#312e81', background: '#eef2ff', padding: '6px 10px', borderRadius: '6px', lineHeight: 1.5 }}>
                                                                            <strong>Expected Answer / Rubric:</strong> {q.rubric || q.correctAnswer || 'Follow standard marking rubric.'}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* SECTION C: DETAILED QUESTIONS */}
                                                    {longs.length > 0 && (
                                                        <div style={{ marginBottom: '22px' }}>
                                                            <div style={{
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                background: '#f8fafc',
                                                                borderLeft: '4px solid #b45309',
                                                                padding: '6px 12px',
                                                                borderRadius: '0 6px 6px 0',
                                                                marginBottom: '10px'
                                                            }}>
                                                                <div>
                                                                    <span style={{ fontWeight: '800', fontSize: '13px', color: '#1e293b' }}>
                                                                        SECTION 'C' MARKING RUBRIC (Detailed Questions)
                                                                    </span>
                                                                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                                                                        Marking breakdown for comprehensive descriptive answers.
                                                                    </span>
                                                                </div>
                                                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: '10px' }}>
                                                                    {longs.length} Questions
                                                                </span>
                                                            </div>

                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                {longs.map((q, idx) => (
                                                                    <div key={q.id || idx} style={{
                                                                        border: '1px solid #e2e8f0',
                                                                        borderRadius: '8px',
                                                                        padding: '10px 14px',
                                                                        background: '#ffffff'
                                                                    }}>
                                                                        <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                                                                            <span>Q.{idx + 3}: {q.questionText}</span>
                                                                            {q.cognitiveLevel && (
                                                                                <span style={{ fontSize: '10px', color: '#64748b', marginLeft: '6px', fontWeight: '600' }}>
                                                                                    [{q.cognitiveLevel}]
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {q.diagramBase64 && (
                                                                            <div style={{ margin: '6px 0' }}>
                                                                                <img
                                                                                    src={`data:image/png;base64,${q.diagramBase64}`}
                                                                                    alt="Question Diagram"
                                                                                    style={{ maxHeight: '110px', objectFit: 'contain', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px', background: '#fff' }}
                                                                                />
                                                                            </div>
                                                                        )}
                                                                        <div style={{ fontSize: '11.5px', color: '#312e81', background: '#eef2ff', padding: '6px 10px', borderRadius: '6px', lineHeight: 1.5 }}>
                                                                            <strong>Model Solution / Rubric:</strong> {q.rubric || q.correctAnswer || 'Comprehensive model response.'}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                return (
                                    <div style={{
                                        zoom: zoomLevel,
                                        WebkitFontSmoothing: 'antialiased',
                                        MozOsxFontSmoothing: 'grayscale',
                                        textRendering: 'optimizeLegibility',
                                        width: '100%',
                                        maxWidth: '820px',
                                        background: '#ffffff',
                                        color: '#0f172a',
                                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
                                        borderRadius: '4px',
                                        padding: '48px',
                                        minHeight: '1100px',
                                        fontFamily: 'serif',
                                        border: '1px solid #cbd5e1',
                                        boxSizing: 'border-box',
                                        marginBottom: '40px'
                                    }}>
                                    {/* School Header */}
                                    <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '16px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            {/* Logo */}
                                            <div style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {activePaper.schoolBranding?.logoUrl || schoolInfo.logoUrl ? (
                                                    <img 
                                                        src={activePaper.schoolBranding?.logoUrl || schoolInfo.logoUrl} 
                                                        alt="School Logo" 
                                                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                                    />
                                                ) : (
                                                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', border: '2px solid #0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '11px', fontFamily: 'sans-serif' }}>
                                                        LOGO
                                                    </div>
                                                )}
                                            </div>

                                            {/* Titles */}
                                            <div style={{ flex: 1, padding: '0 16px', textAlign: 'center', fontFamily: 'sans-serif' }}>
                                                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    {activePaper.schoolBranding?.name || schoolInfo.name}
                                                </h2>
                                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#475569', fontWeight: '600' }}>
                                                    {activePaper.schoolBranding?.campus || schoolInfo.campus}
                                                </p>
                                                <p style={{ margin: '2px 0 0', fontSize: '11px', fontWeight: '800', color: '#4338ca' }}>
                                                    Affiliated with {activePaper.schoolBranding?.board || schoolInfo.board}
                                                </p>
                                            </div>

                                            {/* Meta Box */}
                                            <div style={{ width: '80px', textAlign: 'right', fontFamily: 'sans-serif', fontSize: '12px' }}>
                                                <span style={{ display: 'block', fontWeight: '800' }}>Class: {activePaper.grade}</span>
                                                <span style={{ display: 'block', color: '#475569' }}>Marks: {activePaper.totalMarks || 50}</span>
                                                <span style={{ display: 'block', color: '#475569' }}>{activePaper.timeAllowed || '1.5h'}</span>
                                            </div>
                                        </div>

                                        <div style={{
                                            marginTop: '12px',
                                            display: 'inline-block',
                                            background: '#0f172a',
                                            color: '#ffffff',
                                            fontFamily: 'sans-serif',
                                            fontWeight: '800',
                                            fontSize: '11px',
                                            textTransform: 'uppercase',
                                            padding: '4px 16px',
                                            borderRadius: '4px'
                                        }}>
                                            {activePaper.examTitle || 'Annual Examination 2026'} • Subject: {activePaper.subject}
                                        </div>
                                    </div>

                                    {/* Student Info Bar */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(3, 1fr)',
                                        gap: '8px',
                                        fontFamily: 'sans-serif',
                                        fontSize: '11px',
                                        border: '1px solid #94a3b8',
                                        padding: '8px',
                                        background: '#f8fafc',
                                        marginBottom: '24px'
                                    }}>
                                        <div><strong>Student Name:</strong> ______________________</div>
                                        <div><strong>Roll No:</strong> ____________</div>
                                        <div><strong>Section:</strong> ____________</div>
                                    </div>

                                    {/* Questions */}
                                    {Array.isArray(activePaper.questions) && activePaper.questions.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            {activePaper.questions.map((q, idx) => {
                                                const isUrdu = isUrduSubject(activePaper.subject) || /[\u0600-\u06FF]/.test(q.questionText || '');
                                                return (
                                                    <div key={q.id || idx} style={{ fontSize: '14px', fontFamily: 'sans-serif' }}>
                                                        <div style={{
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'baseline',
                                                            gap: '8px',
                                                            fontWeight: '600',
                                                            flexDirection: isUrdu ? 'row-reverse' : 'row',
                                                            textAlign: isUrdu ? 'right' : 'left'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                                                <span style={{ fontWeight: '900' }}>Q.{idx + 1}</span>
                                                                <span style={{ fontFamily: isUrdu ? "'Jameel Noori Nastaleeq', 'Urdu Typesetting', serif" : 'inherit', fontSize: isUrdu ? '17px' : 'inherit' }} dir={isUrdu ? 'rtl' : 'ltr'}>
                                                                    {q.questionText}
                                                                </span>
                                                            </div>
                                                            <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', whiteSpace: 'nowrap' }}>
                                                                [{q.marks || 1} Marks]
                                                            </span>
                                                        </div>

                                                        {q.diagramBase64 && (
                                                            <div style={{
                                                                marginTop: '8px',
                                                                paddingLeft: isUrdu ? '0' : '24px',
                                                                paddingRight: isUrdu ? '24px' : '0',
                                                                textAlign: isUrdu ? 'right' : 'left'
                                                            }}>
                                                                <img
                                                                    src={`data:image/png;base64,${q.diagramBase64}`}
                                                                    alt="Question Diagram"
                                                                    style={{
                                                                        maxHeight: '130px',
                                                                        objectFit: 'contain',
                                                                        border: '1px solid #cbd5e1',
                                                                        borderRadius: '6px',
                                                                        padding: '6px',
                                                                        background: '#ffffff'
                                                                    }}
                                                                />
                                                            </div>
                                                        )}

                                                        {Array.isArray(q.options) && q.options.length > 0 && (
                                                            <div style={{
                                                                display: 'grid',
                                                                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                                                gap: '8px',
                                                                marginTop: '8px',
                                                                paddingLeft: isUrdu ? '0' : '24px',
                                                                paddingRight: isUrdu ? '24px' : '0'
                                                            }}>
                                                                {q.options.map((opt, optIdx) => (
                                                                    <div key={optIdx} style={{ fontSize: '12px', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <span style={{
                                                                            width: '18px',
                                                                            height: '18px',
                                                                            borderRadius: '50%',
                                                                            border: '1px solid #94a3b8',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            fontSize: '10px',
                                                                            fontWeight: '800'
                                                                        }}>
                                                                            {String.fromCharCode(65 + optIdx)}
                                                                        </span>
                                                                        <span>{opt}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {previewTab === 'answers' && q.correctAnswer && (
                                                            <div style={{
                                                                marginTop: '6px',
                                                                marginLeft: '24px',
                                                                padding: '6px 10px',
                                                                background: '#ecfdf5',
                                                                border: '1px solid #a7f3d0',
                                                                borderRadius: '6px',
                                                                fontSize: '12px',
                                                                color: '#065f46',
                                                                fontWeight: '700'
                                                            }}>
                                                                Correct Answer: {q.correctAnswer}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8', fontFamily: 'sans-serif' }}>
                                            <p style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>Full question paper snapshot is available in direct vector format.</p>
                                            <button 
                                                onClick={() => handlePrint(activePaper)}
                                                style={{
                                                    padding: '10px 20px',
                                                    borderRadius: '10px',
                                                    background: '#4f46e5',
                                                    color: '#ffffff',
                                                    border: 'none',
                                                    fontSize: '13px',
                                                    fontWeight: '700',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Open High-Definition Print View
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>
        )}

            {/* ================= SINGLE DELETE CONFIRMATION MODAL ================= */}
            {paperToDelete && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(4px)'
                }}>
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '20px',
                        maxWidth: '460px',
                        width: '100%',
                        padding: '24px',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                        border: '1px solid #e2e8f0'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                            <div style={{
                                width: '44px',
                                height: '44px',
                                borderRadius: '12px',
                                background: '#fee2e2',
                                color: '#dc2626',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <Trash2 size={22} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#1e293b' }}>
                                    Delete Examination Paper
                                </h3>
                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                                    Permanent database removal
                                </p>
                            </div>
                        </div>

                        <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>
                            Are you sure you want to permanently delete the question paper for <strong>Class {paperToDelete.grade} {paperToDelete.subject}</strong> ({paperToDelete.examTitle})? This action cannot be undone.
                        </p>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button 
                                onClick={() => setPaperToDelete(null)}
                                disabled={isDeletingSingle}
                                style={{
                                    padding: '9px 16px',
                                    borderRadius: '10px',
                                    background: '#f1f5f9',
                                    color: '#475569',
                                    border: 'none',
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={confirmDeleteSingle}
                                disabled={isDeletingSingle}
                                style={{
                                    padding: '9px 20px',
                                    borderRadius: '10px',
                                    background: '#dc2626',
                                    color: '#ffffff',
                                    border: 'none',
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    cursor: isDeletingSingle ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)'
                                }}
                            >
                                <Trash2 size={15} />
                                <span>{isDeletingSingle ? 'Deleting...' : 'Delete Permanently'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ================= TERM CLEANUP MODAL ================= */}
            {isCleanupModalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(4px)'
                }}>
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '24px',
                        maxWidth: '520px',
                        width: '100%',
                        padding: '28px',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                        border: '1px solid #e2e8f0'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '46px',
                                    height: '46px',
                                    borderRadius: '14px',
                                    background: '#fee2e2',
                                    color: '#dc2626',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <ShieldAlert size={24} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e293b' }}>
                                        Term Cleanup & Reset
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                                        Safely remove completed term papers to prepare for new exams
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setIsCleanupModalOpen(false)}
                                style={{ padding: '6px', borderRadius: '8px', border: 'none', background: '#f1f5f9', color: '#64748b', cursor: 'pointer' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#334155', textTransform: 'uppercase', marginBottom: '10px' }}>
                                Select Cleanup Scope:
                            </label>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {/* Option 1: Clean Printed Only */}
                                <div 
                                    onClick={() => setCleanupType('printed')}
                                    style={{
                                        padding: '12px 16px',
                                        borderRadius: '12px',
                                        border: cleanupType === 'printed' ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                                        background: cleanupType === 'printed' ? '#eef2ff' : '#ffffff',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px'
                                    }}
                                >
                                    <div style={{
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '50%',
                                        border: cleanupType === 'printed' ? '5px solid #4f46e5' : '2px solid #cbd5e1',
                                        boxSizing: 'border-box'
                                    }} />
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                            Delete Printed Papers Only ({stats.printed})
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                                            Safely purges exams that have already been printed and held.
                                        </div>
                                    </div>
                                </div>

                                {/* Option 2: Clean by Term */}
                                <div 
                                    onClick={() => setCleanupType('term')}
                                    style={{
                                        padding: '12px 16px',
                                        borderRadius: '12px',
                                        border: cleanupType === 'term' ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                                        background: cleanupType === 'term' ? '#eef2ff' : '#ffffff',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px'
                                    }}
                                >
                                    <div style={{
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '50%',
                                        border: cleanupType === 'term' ? '5px solid #4f46e5' : '2px solid #cbd5e1',
                                        boxSizing: 'border-box'
                                    }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                            Purge by Examination Term
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                                            Delete all question papers belonging to a specific term.
                                        </div>
                                    </div>
                                </div>

                                {cleanupType === 'term' && (
                                    <div style={{ paddingLeft: '32px', marginBottom: '6px' }}>
                                        <select 
                                            value={selectedCleanupTerm}
                                            onChange={(e) => setSelectedCleanupTerm(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '8px 12px',
                                                borderRadius: '8px',
                                                border: '1px solid #cbd5e1',
                                                fontSize: '12px',
                                                background: '#f8fafc'
                                            }}
                                        >
                                            <option value="all">All Terms & Examinations</option>
                                            {distinctTerms.map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Option 3: Clean All Papers */}
                                <div 
                                    onClick={() => setCleanupType('all')}
                                    style={{
                                        padding: '12px 16px',
                                        borderRadius: '12px',
                                        border: cleanupType === 'all' ? '2px solid #dc2626' : '1px solid #e2e8f0',
                                        background: cleanupType === 'all' ? '#fef2f2' : '#ffffff',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px'
                                    }}
                                >
                                    <div style={{
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '50%',
                                        border: cleanupType === 'all' ? '5px solid #dc2626' : '2px solid #cbd5e1',
                                        boxSizing: 'border-box'
                                    }} />
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#991b1b' }}>
                                            Complete Database Reset ({stats.total} Papers)
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#b91c1c' }}>
                                            Wipes all examination papers to start completely fresh for the new year.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button 
                                onClick={() => setIsCleanupModalOpen(false)}
                                style={{
                                    padding: '10px 18px',
                                    borderRadius: '10px',
                                    background: '#f1f5f9',
                                    color: '#475569',
                                    border: 'none',
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={executeTermCleanup}
                                disabled={isExecutingCleanup}
                                style={{
                                    padding: '10px 22px',
                                    borderRadius: '10px',
                                    background: '#dc2626',
                                    color: '#ffffff',
                                    border: 'none',
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    cursor: isExecutingCleanup ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
                                }}
                            >
                                <Trash2 size={15} />
                                <span>{isExecutingCleanup ? 'Executing Cleanup...' : 'Execute Cleanup'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ExamPapersHub;
