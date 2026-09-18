import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    BookOpen, Compass, FileText, Download, Eye, ExternalLink, 
    Sparkles, CheckCircle2, ArrowRight, Layers, Award, Clock, 
    Zap, Wifi, WifiOff, HardDrive, Check, ChevronDown, Building2,
    Search, X, MapPin
} from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { 
    PAKISTAN_BOARD_DATA, 
    PAKISTAN_BOARD_GROUPS, 
    ALL_BOARD_NAMES, 
    BoardCrestLogo, 
    getBoardData 
} from '../data/pakistanBoardsData';

// 9th & 10th Standard BISE Subjects
const SUBJECT_LIST = [
    { name: 'English', icon: '📖', color: '#8b5cf6', defaultMarks: '75' },
    { name: 'Urdu', icon: '✍️', color: '#14b8a6', defaultMarks: '75' },
    { name: 'Biology', icon: '🧬', color: '#ec4899', defaultMarks: '60' },
    { name: 'Physics', icon: '⚛️', color: '#6366f1', defaultMarks: '60' },
    { name: 'Chemistry', icon: '🧪', color: '#10b981', defaultMarks: '60' },
    { name: 'Mathematics', icon: '📐', color: '#f59e0b', defaultMarks: '75' },
    { name: 'Computer Science', icon: '💻', color: '#06b6d4', defaultMarks: '50' },
    { name: 'Pakistan Studies', icon: '🇵🇰', color: '#10b981', defaultMarks: '50' },
    { name: 'Islamiat', icon: '🕌', color: '#d97706', defaultMarks: '50' }
];

// Offline fallback seed data ensuring 100% offline functionality from day 1
const DEFAULT_FALLBACK_BLUEPRINTS = [
    {
        id: '2025-2026_9th_English',
        classGrade: '9th Class',
        session: '2025-2026',
        board: 'All BISE Boards (National)',
        subject: 'English',
        totalMarks: '75',
        duration: '3 Hours',
        cognitiveLevels: { knowledge: 30, understanding: 50, application: 20 },
        tos: {
            title: 'English Compulsory SSC-I Table of Specifications (TOS)',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Objective (19 Marks) + Subjective (56 Marks): Comprehension, Short Questions, Translation, Summary, Letters, Idioms & Grammar.'
        },
        rubrics: {
            title: 'English Compulsory SSC-I Assessment Rubrics & Marking Key',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Rubrics: Letter/Application format (2M), Body content (2M), Grammar & Spelling (1M). Translation word-for-word accuracy.'
        },
        modelPaper: {
            title: 'Official BISE English Model Question Paper (SLO Based)',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Section A: 19 MCQs (20 Mins). Section B: Textual & Grammar Qs (36 Marks). Section C: Creative Writing & Translation (20 Marks).'
        }
    },
    {
        id: '2025-2026_9th_Urdu',
        classGrade: '9th Class',
        session: '2025-2026',
        board: 'All BISE Boards (National)',
        subject: 'Urdu',
        totalMarks: '75',
        duration: '3 Hours',
        cognitiveLevels: { knowledge: 30, understanding: 50, application: 20 },
        tos: {
            title: 'Urdu Compulsory SSC-I Table of Specifications',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Hissa Nasar, Hissa Nazam, Hissa Ghazal, Khulasa, Siasaq-o-Sabaq, Mukalma/Kahani, Darkhast/Khat aur Qawaid.'
        },
        rubrics: {
            title: 'Urdu Compulsory Marking Scheme & Tashreeh Rubrics',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Nazam/Ghazal Tashreeh (Hawaala Shair 1M, Mafhoom 1M, Tashreeh 2M). Khulasa: Asbaaq ke markazi khayal ke mutabiq 5 marks.'
        },
        modelPaper: {
            title: 'Official BISE Urdu Model Question Paper',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Hissa Awal: 15 Marozi Swalat. Hissa Doem: Mukhtasir Swalat. Hissa Soem: Khulasa, Tashreeh aur Mazmoon.'
        }
    },
    {
        id: '2025-2026_9th_Biology',
        classGrade: '9th Class',
        session: '2025-2026',
        board: 'All BISE Boards (National)',
        subject: 'Biology',
        totalMarks: '60',
        duration: '3 Hours',
        cognitiveLevels: { knowledge: 30, understanding: 50, application: 20 },
        tos: {
            title: 'Biology SSC-I Table of Specifications (TOS)',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Introduction to Biology, Biodiversity, Cell Biology, Cell Cycle, Enzymes, Bioenergetics, Nutrition, Transport.'
        },
        rubrics: {
            title: 'Biology SSC-I Diagram & Description Rubrics',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Neat labelled diagrams carry 50% of the question marks. Biological terms must be spelled accurately.'
        },
        modelPaper: {
            title: 'Official BISE Biology Model Paper (SLO Based)',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Section A: 12 MCQs. Section B: 8/11 Short Qs. Section C: 2/3 Descriptive Qs with subparts (a & b).'
        }
    },
    {
        id: '2025-2026_9th_Physics',
        classGrade: '9th Class',
        session: '2025-2026',
        board: 'All BISE Boards (National)',
        subject: 'Physics',
        totalMarks: '60',
        duration: '3 Hours',
        cognitiveLevels: { knowledge: 30, understanding: 50, application: 20 },
        tos: {
            title: 'Physics SSC-I Table of Specifications (TOS)',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: '9 Chapters: Physical Quantities, Kinematics, Dynamics, Turning Effects, Gravitation, Work & Energy, Matter, Thermal Properties, Heat Transfer.'
        },
        rubrics: {
            title: 'Physics SSC-I Assessment Rubrics & Marking Key',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Mark allocation: 1 Mark for formula, 1 Mark for working steps, 1 Mark for final answer with SI units, 1 Mark for diagrams.'
        },
        modelPaper: {
            title: 'Official BISE Physics Model Question Paper (SLO Based)',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Section A: 12 MCQs. Section B: 11 Short Qs (attempt 8). Section C: 3 Long Qs (attempt 2).'
        }
    },
    {
        id: '2025-2026_9th_Chemistry',
        classGrade: '9th Class',
        session: '2025-2026',
        board: 'All BISE Boards (National)',
        subject: 'Chemistry',
        totalMarks: '60',
        duration: '3 Hours',
        cognitiveLevels: { knowledge: 25, understanding: 55, application: 20 },
        tos: {
            title: 'Chemistry SSC-I Table of Specifications (TOS)',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Fundamentals, Atomic Structure, Periodic Table, Chemical Bonding, States of Matter, Solutions, Electrochemistry, Reactivity.'
        },
        rubrics: {
            title: 'Chemistry SSC-I Marking Scheme & SLO Rubrics',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Balanced chemical equations required for full marks. Electron dot structures carry dedicated marks.'
        },
        modelPaper: {
            title: 'Official BISE Chemistry Model Question Paper',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Section A: 12 MCQs. Section B: 8/11 Short Qs. Section C: 2/3 Long Questions.'
        }
    },
    {
        id: '2025-2026_9th_Mathematics',
        classGrade: '9th Class',
        session: '2025-2026',
        board: 'All BISE Boards (National)',
        subject: 'Mathematics',
        totalMarks: '75',
        duration: '3 Hours',
        cognitiveLevels: { knowledge: 20, understanding: 50, application: 30 },
        tos: {
            title: 'Mathematics SSC-I Table of Specifications',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Matrices, Real & Complex Numbers, Logarithms, Algebraic Expressions, Factorization, Linear Equations, Geometry & Theorems.'
        },
        rubrics: {
            title: 'Mathematics SSC-I Marking Rubrics & Theorem Scoring',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Compulsory Q9 Theorem: 1M Given, 1M To Prove, 1M Construction, 5M Statements & Reasons. Matrix inversion requires det step.'
        },
        modelPaper: {
            title: 'Official BISE Mathematics Model Question Paper',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Section A: 15 MCQs. Section B: 9/12 Short Qs. Section C: 3/4 Long Qs with Compulsory Theorem.'
        }
    },
    {
        id: '2025-2026_10th_English',
        classGrade: '10th Class',
        session: '2025-2026',
        board: 'All BISE Boards (National)',
        subject: 'English',
        totalMarks: '75',
        duration: '3 Hours',
        cognitiveLevels: { knowledge: 30, understanding: 50, application: 20 },
        tos: {
            title: 'English Compulsory SSC-II Table of Specifications',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Essays/Paragraphs, Direct & Indirect Speech, Pair of Words, Urdu to English Translation, Text Comprehension.'
        },
        rubrics: {
            title: 'English SSC-II Marking Scheme & Essay Rubrics',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Essay Rubrics (15 Marks): Introduction (3M), Thematic Arguments (8M), Grammar & Coherence (2M), Conclusion (2M).'
        },
        modelPaper: {
            title: 'Official BISE 10th English Model Question Paper',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Section A: 19 MCQs. Section B: Short Qs & Grammar. Section C: 15-Mark Essay & Direct/Indirect.'
        }
    },
    {
        id: '2025-2026_10th_Physics',
        classGrade: '10th Class',
        session: '2025-2026',
        board: 'All BISE Boards (National)',
        subject: 'Physics',
        totalMarks: '60',
        duration: '3 Hours',
        cognitiveLevels: { knowledge: 30, understanding: 50, application: 20 },
        tos: {
            title: 'Physics SSC-II Table of Specifications (TOS)',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'SHM & Waves, Sound, Geometrical Optics, Electrostatics, Current Electricity, Electromagnetism, Basic Electronics, ICT, Nuclear Physics.'
        },
        rubrics: {
            title: 'Physics SSC-II Marking Rubrics & Step Guide',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Step marks: 1M Ray diagram accuracy, 1M Snell Law derivation, 1M Correct formula with SI units.'
        },
        modelPaper: {
            title: 'Official BISE 10th Physics Model Paper',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Section A (12 MCQs), Section B (Attempt 8/11 Short Qs), Section C (Attempt 2/3 Long Qs).'
        }
    },
    {
        id: '2025-2026_10th_Mathematics',
        classGrade: '10th Class',
        session: '2025-2026',
        board: 'All BISE Boards (National)',
        subject: 'Mathematics',
        totalMarks: '75',
        duration: '3 Hours',
        cognitiveLevels: { knowledge: 20, understanding: 50, application: 30 },
        tos: {
            title: 'Mathematics SSC-II Table of Specifications',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Quadratic Equations, Variations, Partial Fractions, Sets & Functions, Statistics, Trigonometry, Circle Theorems.'
        },
        rubrics: {
            title: 'Mathematics SSC-II Theorem & Marking Key',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Compulsory Q9 Theorem: 1M Given, 1M To Prove, 1M Figure, 5M Statements & Reasons.'
        },
        modelPaper: {
            title: 'Official BISE 10th Mathematics Model Question Paper',
            url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            notes: 'Section A: 15 MCQs. Section B: 9 Short Qs. Section C: 3 Long Qs with Compulsory Circle Theorem.'
        }
    }
];

const DEFAULT_UNIVERSAL_GUIDE = {
    title: 'Universal BISE Blueprint & SLO Decoding Guide',
    version: 'Session 2025–2026 SLO Master Edition',
    pdfUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    instructions: 'This universal pedagogical compass outlines how teachers and exam controllers must decode Table of Specifications (TOS), Bloom\'s Taxonomy Cognitive Domains (Knowledge 30%, Understanding 50%, Application 20%), and Marking Rubrics across all Secondary School (SSC) subjects.'
};

const CACHE_KEY_BLUEPRINTS = 'mai_board_blueprints_cache_v2';
const CACHE_KEY_UNIVERSAL = 'mai_board_universal_guide_v2';
const CACHE_KEY_VERSION = 'mai_board_version_v2';

const BoardTOSStudio = () => {
    const navigate = useNavigate();

    // Online/Offline status
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [cacheStatus, setCacheStatus] = useState('Cached Offline');

    // Data states (Initialized instantly from local storage cache)
    const [blueprints, setBlueprints] = useState(() => {
        try {
            const cached = localStorage.getItem(CACHE_KEY_BLUEPRINTS);
            return cached ? JSON.parse(cached) : DEFAULT_FALLBACK_BLUEPRINTS;
        } catch (e) {
            return DEFAULT_FALLBACK_BLUEPRINTS;
        }
    });

    const [universalGuide, setUniversalGuide] = useState(() => {
        try {
            const cached = localStorage.getItem(CACHE_KEY_UNIVERSAL);
            return cached ? JSON.parse(cached) : DEFAULT_UNIVERSAL_GUIDE;
        } catch (e) {
            return DEFAULT_UNIVERSAL_GUIDE;
        }
    });

    // Workflow Filter States
    const [selectedClass, setSelectedClass] = useState('9th Class');
    const [selectedSession, setSelectedSession] = useState('2025-2026');
    const [selectedBoard, setSelectedBoard] = useState(() => {
        return localStorage.getItem('mai_selected_board') || 'BISE Kohat';
    });
    const [selectedSubject, setSelectedSubject] = useState('English');

    // Rich Board Picker Modal State
    const [isBoardModalOpen, setIsBoardModalOpen] = useState(false);
    const [boardSearchQuery, setBoardSearchQuery] = useState('');
    const [activeProvinceFilter, setActiveProvinceFilter] = useState('All');

    // Canva Preview Modal State
    const [previewModal, setPreviewModal] = useState({
        isOpen: false,
        title: '',
        subtitle: '',
        url: '',
        type: ''
    });

    // 1. Online / Offline Event Listeners
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Ensure full-bleed zero padding and clean day mode background on .main-content while on Board TOS Studio
    useEffect(() => {
        const mainEl = document.querySelector('.main-content');
        if (mainEl) {
            const prevPadding = mainEl.style.padding;
            const prevBg = mainEl.style.backgroundColor;
            mainEl.style.padding = '0px';
            mainEl.style.backgroundColor = '#f8fafc';
            return () => {
                mainEl.style.padding = prevPadding;
                mainEl.style.backgroundColor = prevBg;
            };
        }
    }, []);

    // 2. Zero-Cost Smart Cache-First Sync:
    // Only reads ONE single document (board_settings/version) to check if Super Admin published updates.
    // If version is the same, 0 additional document reads occur!
    useEffect(() => {
        if (!navigator.onLine) {
            setCacheStatus('100% Offline Mode (Local Storage)');
            return;
        }

        const syncWithZeroCost = async () => {
            try {
                // Read single version heartbeat document from permitted curriculums collection
                const versionSnap = await getDoc(doc(db, 'curriculums', 'board_blueprint_version'));
                const serverVersion = versionSnap.exists() ? String(versionSnap.data().version) : 'initial';
                const localVersion = localStorage.getItem(CACHE_KEY_VERSION);

                if (serverVersion !== localVersion) {
                    // Only if super-admin published a new version, perform fetch
                    const q = query(collection(db, 'curriculums'), where('type', '==', 'board_blueprint'));
                    const bpSnapshot = await getDocs(q);
                    if (!bpSnapshot.empty) {
                        const fetched = [];
                        bpSnapshot.forEach(d => fetched.push({ id: d.id, ...d.data() }));

                        // Merge fetched with default fallbacks
                        const merged = [...DEFAULT_FALLBACK_BLUEPRINTS];
                        fetched.forEach(item => {
                            const idx = merged.findIndex(m => 
                                m.classGrade === item.classGrade && 
                                m.subject?.toLowerCase() === item.subject?.toLowerCase() &&
                                (m.board === item.board || (!m.board && item.board === 'All BISE Boards (National)'))
                            );
                            if (idx >= 0) merged[idx] = item;
                            else merged.push(item);
                        });

                        setBlueprints(merged);
                        localStorage.setItem(CACHE_KEY_BLUEPRINTS, JSON.stringify(merged));
                    }

                    // Fetch universal guide
                    const guideSnap = await getDoc(doc(db, 'curriculums', 'board_universal_guide'));
                    if (guideSnap.exists()) {
                        const guideData = guideSnap.data();
                        setUniversalGuide(guideData);
                        localStorage.setItem(CACHE_KEY_UNIVERSAL, JSON.stringify(guideData));
                    }

                    localStorage.setItem(CACHE_KEY_VERSION, serverVersion);
                    setCacheStatus('Live Synced & Cached Offline');
                } else {
                    setCacheStatus('Verified Up-to-Date');
                }
            } catch (err) {
                console.log('Serving from zero-cost offline storage:', err.message);
                setCacheStatus('Offline Local Cache Active');
            }
        };

        syncWithZeroCost();
    }, [isOnline]);

    // Active subject blueprint resolution strictly matched to selectedBoard
    const activeBlueprint = blueprints.find(bp => 
        (bp.classGrade === selectedClass || bp.classGrade?.toLowerCase() === selectedClass.toLowerCase()) &&
        (bp.subject?.toLowerCase() === selectedSubject.toLowerCase()) &&
        (bp.board === selectedBoard || (!bp.board && selectedBoard === 'All BISE Boards (National)'))
    ) || {
        classGrade: selectedClass,
        session: selectedSession,
        board: selectedBoard,
        subject: selectedSubject,
        totalMarks: SUBJECT_LIST.find(s => s.name.toLowerCase() === selectedSubject.toLowerCase())?.defaultMarks || '60',
        duration: '3 Hours',
        cognitiveLevels: { knowledge: 30, understanding: 50, application: 20 },
        tos: {
            title: `${selectedSubject} Table of Specifications (TOS)`,
            url: '',
            notes: `Table of Specifications for ${selectedClass} ${selectedSubject} has not been published for ${selectedBoard} yet.`
        },
        rubrics: {
            title: `${selectedSubject} Examiner Marking Scheme & Rubrics`,
            url: '',
            notes: `Official marking criteria for ${selectedClass} ${selectedSubject} has not been published for ${selectedBoard} yet.`
        },
        modelPaper: {
            title: `${selectedSubject} Official BISE Model Question Paper`,
            url: '',
            notes: `Official Model Question Paper for ${selectedClass} ${selectedSubject} has not been published for ${selectedBoard} yet.`
        },
        isPending: true
    };

    // Quick preview modal opener
    const openPreview = (title, subtitle, url, type) => {
        setPreviewModal({
            isOpen: true,
            title,
            subtitle,
            url: url || universalGuide.pdfUrl,
            type
        });
    };

    // Direct download helper
    const handleDownload = (url, fileName) => {
        if (!url) {
            alert('File document is initializing. Opening preview mode.');
            return;
        }
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.download = fileName || 'Board_Document.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Download complete subject pack (All 3 papers)
    const handleDownloadCompleteKit = () => {
        const docs = [
            { url: activeBlueprint.tos?.url, name: `${selectedClass}_${selectedSubject}_TOS.pdf` },
            { url: activeBlueprint.rubrics?.url, name: `${selectedClass}_${selectedSubject}_Rubrics.pdf` },
            { url: activeBlueprint.modelPaper?.url, name: `${selectedClass}_${selectedSubject}_ModelPaper.pdf` }
        ];

        docs.forEach((d, idx) => {
            if (d.url) {
                setTimeout(() => {
                    handleDownload(d.url, d.name);
                }, idx * 400);
            }
        });
    };

    // Active Board Data including SVG Logo, Slogan & Region
    const currentBoard = getBoardData(selectedBoard);

    // Filtered boards for interactive board selection modal
    const filteredBoards = PAKISTAN_BOARD_DATA.filter(b => {
        const matchesProvince = activeProvinceFilter === 'All' || b.province === activeProvinceFilter;
        const query = boardSearchQuery.toLowerCase().trim();
        if (!query) return matchesProvince;
        return matchesProvince && (
            b.name.toLowerCase().includes(query) || 
            b.districts.toLowerCase().includes(query) ||
            b.slogan.toLowerCase().includes(query) ||
            b.sloganEn.toLowerCase().includes(query) ||
            b.province.toLowerCase().includes(query)
        );
    });

    return (
        <div style={{
            width: '100%',
            minHeight: '100vh',
            background: '#f8fafc',
            color: '#0f172a',
            padding: '24px 32px',
            boxSizing: 'border-box',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
        }}>
            {/* Scoped Full-bleed Overrides for .main-content to eliminate white wrapper */}
            <style>{`
                .main-content {
                    padding: 0px !important;
                    background-color: #f8fafc !important;
                }
            `}</style>

            {/* STUDIO HEADER WITH ZERO-COST & OFFLINE STATUS BADGES */}
            <div style={{
                position: 'relative',
                borderRadius: '24px',
                padding: '26px 32px',
                background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #4338ca 100%)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                boxShadow: '0 20px 35px -10px rgba(37, 99, 235, 0.25)',
                marginBottom: '24px',
                overflow: 'hidden',
                color: '#ffffff'
            }}>
                {/* Decorative background glow circles */}
                <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '220px', height: '220px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '50%', filter: 'blur(40px)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: '-60px', left: '-60px', width: '220px', height: '220px', background: 'rgba(147, 197, 253, 0.2)', borderRadius: '50%', filter: 'blur(40px)', pointerEvents: 'none' }} />

                <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                            <span style={{
                                background: 'rgba(255, 255, 255, 0.18)',
                                color: '#ffffff',
                                border: '1px solid rgba(255, 255, 255, 0.25)',
                                padding: '4px 12px',
                                borderRadius: '20px',
                                fontSize: '11px',
                                fontWeight: '800',
                                letterSpacing: '0.5px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <Sparkles size={13} color="#fde047" /> BISE BOARD BLUEPRINT STUDIO
                            </span>

                            {/* Offline / Online Status Badge */}
                            <span style={{
                                background: isOnline ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)',
                                color: isOnline ? '#a7f3d0' : '#fde68a',
                                border: isOnline ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)',
                                padding: '3px 10px',
                                borderRadius: '20px',
                                fontSize: '11px',
                                fontWeight: '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}>
                                {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
                                {isOnline ? 'Online' : 'Offline Mode'}
                            </span>

                            {/* Local Cache Badge */}
                            <span style={{
                                background: 'rgba(255, 255, 255, 0.15)',
                                color: '#dbeafe',
                                padding: '3px 10px',
                                borderRadius: '20px',
                                fontSize: '11px',
                                fontWeight: '600',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}>
                                <HardDrive size={12} /> {cacheStatus}
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <h1 style={{
                                fontSize: '26px',
                                fontWeight: '900',
                                margin: 0,
                                letterSpacing: '-0.5px',
                                color: '#ffffff'
                            }}>
                                SLO Table of Specifications, Rubrics & Model Papers
                            </h1>

                            {/* Prominent Header Board Jurisdiction Picker Button with Official Logo & Slogan */}
                            <button
                                onClick={() => setIsBoardModalOpen(true)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    background: '#ffffff',
                                    borderRadius: '14px',
                                    padding: '6px 14px 6px 10px',
                                    boxShadow: '0 8px 22px rgba(0, 0, 0, 0.2)',
                                    border: '2px solid #fde047',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    textAlign: 'left'
                                }}
                                title="Click to choose from all Pakistan Boards"
                            >
                                <BoardCrestLogo 
                                    boardId={currentBoard.id} 
                                    size={36} 
                                    primaryColor={currentBoard.primaryColor} 
                                    accentColor={currentBoard.accentColor} 
                                    symbol={currentBoard.symbol} 
                                />
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: '900', color: '#0f172a' }}>
                                            {currentBoard.name}
                                        </span>
                                        {currentBoard.slogan && (
                                            <span style={{
                                                background: '#fef3c7',
                                                color: '#92400e',
                                                fontSize: '10px',
                                                fontWeight: '800',
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                                fontFamily: 'system-ui'
                                            }}>
                                                {currentBoard.slogan}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>
                                        {currentBoard.districts.split(',')[0]} Division • Tap to Change
                                    </div>
                                </div>
                                <ChevronDown size={16} color="#2563eb" style={{ marginLeft: '4px' }} />
                            </button>
                        </div>
                        <p style={{
                            margin: '6px 0 0 0',
                            color: '#dbeafe',
                            fontSize: '13px',
                            maxWidth: '720px',
                            lineHeight: '1.5'
                        }}>
                            Viewing official blueprints for <strong>{selectedBoard}</strong>. Choose Class (9th or 10th) and select any Subject to access its 3 core papers and scoring rubrics.
                        </p>
                    </div>

                    {/* Launch Paper Generator Button */}
                    <button
                        onClick={() => navigate('/paper-generator')}
                        style={{
                            background: '#ffffff',
                            color: '#1e3a8a',
                            border: 'none',
                            padding: '11px 20px',
                            borderRadius: '12px',
                            fontWeight: '800',
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 8px 20px -4px rgba(0, 0, 0, 0.15)'
                        }}
                    >
                        <Zap size={16} color="#4f46e5" />
                        Paper Generator
                        <ArrowRight size={15} color="#4f46e5" />
                    </button>
                </div>
            </div>

            {/* UNIVERSAL MASTER DECODER SPOTLIGHT BANNER */}
            <div style={{
                background: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 50%, #fef3c7 100%)',
                border: '1px solid #fde68a',
                borderRadius: '16px',
                padding: '18px 22px',
                marginBottom: '22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                boxShadow: '0 4px 15px rgba(245, 158, 11, 0.08)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                        flexShrink: 0
                    }}>
                        <Compass size={24} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#b45309', letterSpacing: '0.5px' }}>
                                UNIVERSAL MASTER COMPASS (APPLIES TO ALL SUBJECTS)
                            </span>
                            <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontSize: '10px', padding: '1px 8px', borderRadius: '12px', fontWeight: '700' }}>
                                {universalGuide.version || 'Master Framework'}
                            </span>
                        </div>
                        <h2 style={{ fontSize: '16px', fontWeight: '800', margin: 0, color: '#78350f' }}>
                            {universalGuide.title || 'Universal BISE Blueprint & SLO Decoding Guide'}
                        </h2>
                        <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#92400e', maxWidth: '680px', lineHeight: '1.4' }}>
                            {universalGuide.instructions || 'Essential master guidelines explaining how to read TOS cognitive weightages, section divisions, and examiner marking rubrics.'}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                        onClick={() => openPreview('Universal Blueprint & SLO Decoding Guide', 'Master Pedagogical Framework', universalGuide.pdfUrl, 'universal')}
                        style={{
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            color: '#334155',
                            padding: '9px 16px',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                        }}
                    >
                        <Eye size={15} /> Quick Preview Guide
                    </button>
                    <button
                        onClick={() => handleDownload(universalGuide.pdfUrl, 'Universal_BISE_Decoder_Guide.pdf')}
                        style={{
                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                            border: 'none',
                            color: '#ffffff',
                            padding: '9px 16px',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)'
                        }}
                    >
                        <Download size={15} /> Download Universal Guide
                    </button>
                </div>
            </div>

            {/* STUDIO CONTROLS: CLASS SELECTION & SUBJECT DROPDOWN */}
            <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '18px 24px',
                marginBottom: '22px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '14px' }}>
                    {/* Step 1: Select Class */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '800', color: '#475569', marginRight: '4px' }}>
                            Step 1: Select Class:
                        </span>
                        {['9th Class', '10th Class'].map(cls => (
                            <button
                                key={cls}
                                onClick={() => setSelectedClass(cls)}
                                style={{
                                    padding: '8px 18px',
                                    borderRadius: '10px',
                                    border: selectedClass === cls ? 'none' : '1px solid #cbd5e1',
                                    fontWeight: '800',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    background: selectedClass === cls ? 'linear-gradient(135deg, #4f46e5, #4338ca)' : '#f8fafc',
                                    color: selectedClass === cls ? '#ffffff' : '#475569',
                                    boxShadow: selectedClass === cls ? '0 4px 12px rgba(79, 70, 229, 0.3)' : 'none',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {cls}
                            </button>
                        ))}
                    </div>

                    {/* Step 2: Subject Dropdown */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '800', color: '#475569' }}>
                            Step 2: Choose Subject:
                        </span>
                        <div style={{ position: 'relative' }}>
                            <select
                                value={selectedSubject}
                                onChange={(e) => setSelectedSubject(e.target.value)}
                                style={{
                                    appearance: 'none',
                                    WebkitAppearance: 'none',
                                    background: '#f8fafc',
                                    border: '2px solid #4f46e5',
                                    color: '#1e293b',
                                    padding: '9px 36px 9px 16px',
                                    borderRadius: '10px',
                                    fontSize: '14px',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(79, 70, 229, 0.15)'
                                }}
                            >
                                {SUBJECT_LIST.map(s => (
                                    <option key={s.name} value={s.name} style={{ background: '#ffffff', color: '#1e293b' }}>
                                        {s.icon} {s.name}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={16} color="#4f46e5" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        </div>
                    </div>
                </div>

                {/* Quick Subject Tabs / Pills */}
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                    {SUBJECT_LIST.map(subj => {
                        const isSelected = selectedSubject.toLowerCase() === subj.name.toLowerCase();
                        return (
                            <button
                                key={subj.name}
                                onClick={() => setSelectedSubject(subj.name)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 14px',
                                    borderRadius: '10px',
                                    border: isSelected ? '1px solid #c7d2fe' : '1px solid #e2e8f0',
                                    background: isSelected ? '#e0e7ff' : '#f8fafc',
                                    color: isSelected ? '#3730a3' : '#475569',
                                    cursor: 'pointer',
                                    fontWeight: '700',
                                    fontSize: '12px',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.2s',
                                    boxShadow: isSelected ? '0 2px 8px rgba(79, 70, 229, 0.15)' : 'none'
                                }}
                            >
                                <span>{subj.icon}</span>
                                <span>{subj.name}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* SELECTED SUBJECT HERO STRIP WITH COGNITIVE DOMAINS */}
            <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '18px 24px',
                marginBottom: '22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #4f46e5, #3b82f6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px',
                        color: '#ffffff',
                        boxShadow: '0 6px 16px rgba(79, 70, 229, 0.2)'
                    }}>
                        {SUBJECT_LIST.find(s => s.name.toLowerCase() === selectedSubject.toLowerCase())?.icon || '📚'}
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0, color: '#0f172a' }}>
                                {selectedClass} • {selectedSubject} Papers ({selectedBoard})
                            </h2>
                            <span style={{ 
                                background: activeBlueprint?.tos?.url ? '#dcfce7' : '#fef3c7', 
                                color: activeBlueprint?.tos?.url ? '#15803d' : '#b45309', 
                                border: activeBlueprint?.tos?.url ? '1px solid #bbf7d0' : '1px solid #fde68a',
                                padding: '2px 8px', 
                                borderRadius: '6px', 
                                fontSize: '11px', 
                                fontWeight: '700' 
                            }}>
                                {activeBlueprint?.tos?.url ? `✓ Official ${selectedBoard} Kit` : `⏳ Pending for ${selectedBoard}`}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '14px', marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Clock size={13} color="#2563eb" /> Time: <strong style={{ color: '#0f172a' }}>{activeBlueprint.duration || '3 Hours'}</strong>
                            </span>
                            <span>•</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Award size={13} color="#d97706" /> Total Marks: <strong style={{ color: '#0f172a' }}>{activeBlueprint.totalMarks || '75'}</strong>
                            </span>
                        </div>
                    </div>
                </div>

                {/* Cognitive Distribution Bar */}
                <div style={{ minWidth: '300px', flex: 1, maxWidth: '420px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '700', marginBottom: '6px' }}>
                        <span style={{ color: '#4f46e5' }}>Knowledge: {activeBlueprint.cognitiveLevels?.knowledge || 30}%</span>
                        <span style={{ color: '#059669' }}>Understanding: {activeBlueprint.cognitiveLevels?.understanding || 50}%</span>
                        <span style={{ color: '#d97706' }}>Application: {activeBlueprint.cognitiveLevels?.application || 20}%</span>
                    </div>
                    <div style={{ height: '8px', borderRadius: '6px', overflow: 'hidden', display: 'flex', background: '#e2e8f0' }}>
                        <div style={{ width: `${activeBlueprint.cognitiveLevels?.knowledge || 30}%`, background: '#4f46e5' }} title="Definitions & Recall" />
                        <div style={{ width: `${activeBlueprint.cognitiveLevels?.understanding || 50}%`, background: '#059669' }} title="Conceptual Understanding" />
                        <div style={{ width: `${activeBlueprint.cognitiveLevels?.application || 20}%`, background: '#d97706' }} title="Numericals & Problem Solving" />
                    </div>
                </div>
            </div>

            {/* TRIPLE STUDIO DECK: THE 3 PAPERS FOR SELECTED SUBJECT */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '20px',
                marginBottom: '26px'
            }}>
                {/* PAPER 1: TABLE OF SPECIFICATIONS (TOS) */}
                <div style={{
                    background: 'linear-gradient(135deg, rgba(239, 246, 255, 0.9) 0%, #ffffff 60%, rgba(239, 246, 255, 0.4) 100%)',
                    border: '1px solid #bfdbfe',
                    borderRadius: '16px',
                    padding: '22px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 16px rgba(59, 130, 246, 0.08)'
                }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{
                                background: '#dbeafe',
                                color: '#1e40af',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '800'
                            }}>
                                PAPER 1 • BLUEPRINT
                            </span>
                            <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: '700' }}>
                                Weightage Matrix
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                            <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff'
                            }}>
                                <Layers size={20} />
                            </div>
                            <div>
                                <h3 style={{ fontSize: '17px', fontWeight: '800', margin: 0, color: '#1e3a8a' }}>
                                    Table of Specification (TOS)
                                </h3>
                                <p style={{ fontSize: '11px', color: '#2563eb', margin: '2px 0 0 0' }}>
                                    {selectedSubject} Chapter & SLO Matrix
                                </p>
                            </div>
                        </div>

                        <div style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '12px',
                            marginBottom: '16px',
                            fontSize: '12px',
                            color: '#334155',
                            lineHeight: '1.4'
                        }}>
                            {activeBlueprint.tos?.notes || 'Outlines chapter-wise marks distribution, cognitive levels (recall vs reasoning), and compulsory questions.'}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        {activeBlueprint.tos?.url ? (
                            <>
                                <button
                                    onClick={() => openPreview(activeBlueprint.tos?.title || `${selectedSubject} TOS`, 'Table of Specification', activeBlueprint.tos?.url, 'tos')}
                                    style={{
                                        flex: 1,
                                        background: '#ffffff',
                                        border: '1px solid #cbd5e1',
                                        color: '#1e3a8a',
                                        padding: '9px 12px',
                                        borderRadius: '8px',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                    }}
                                >
                                    <Eye size={14} /> Preview TOS
                                </button>
                                <button
                                    onClick={() => handleDownload(activeBlueprint.tos?.url, `${selectedSubject}_TOS.pdf`)}
                                    style={{
                                        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                                        border: 'none',
                                        color: '#ffffff',
                                        padding: '9px 14px',
                                        borderRadius: '8px',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)'
                                    }}
                                    title="Download PDF"
                                >
                                    <Download size={15} />
                                </button>
                            </>
                        ) : (
                            <div style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                background: '#f8fafc',
                                color: '#64748b',
                                fontSize: '12px',
                                fontWeight: '700',
                                textAlign: 'center',
                                border: '1px dashed #cbd5e1'
                            }}>
                                ⏳ TOS Pending Upload for {selectedBoard}
                            </div>
                        )}
                    </div>
                </div>

                {/* PAPER 2: MARKING RUBRICS */}
                <div style={{
                    background: 'linear-gradient(135deg, rgba(236, 253, 245, 0.9) 0%, #ffffff 60%, rgba(236, 253, 245, 0.4) 100%)',
                    border: '1px solid #a7f3d0',
                    borderRadius: '16px',
                    padding: '22px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.08)'
                }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{
                                background: '#d1fae5',
                                color: '#065f46',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '800'
                            }}>
                                PAPER 2 • MARKING SCHEME
                            </span>
                            <span style={{ fontSize: '11px', color: '#059669', fontWeight: '700' }}>
                                Examiner Rubrics
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                            <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff'
                            }}>
                                <CheckCircle2 size={20} />
                            </div>
                            <div>
                                <h3 style={{ fontSize: '17px', fontWeight: '800', margin: 0, color: '#065f46' }}>
                                    Marking Rubrics
                                </h3>
                                <p style={{ fontSize: '11px', color: '#059669', margin: '2px 0 0 0' }}>
                                    {selectedSubject} Step-by-Step Scoring
                                </p>
                            </div>
                        </div>

                        <div style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '12px',
                            marginBottom: '16px',
                            fontSize: '12px',
                            color: '#334155',
                            lineHeight: '1.4'
                        }}>
                            {activeBlueprint.rubrics?.notes || 'Provides precise mark allocation: Formula, step working, units, derivations and diagram marking criteria.'}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        {activeBlueprint.rubrics?.url ? (
                            <>
                                <button
                                    onClick={() => openPreview(activeBlueprint.rubrics?.title || `${selectedSubject} Rubrics`, 'Marking Rubrics & Assessment Scheme', activeBlueprint.rubrics?.url, 'rubrics')}
                                    style={{
                                        flex: 1,
                                        background: '#ffffff',
                                        border: '1px solid #cbd5e1',
                                        color: '#065f46',
                                        padding: '9px 12px',
                                        borderRadius: '8px',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                    }}
                                >
                                    <Eye size={14} /> Preview Rubrics
                                </button>
                                <button
                                    onClick={() => handleDownload(activeBlueprint.rubrics?.url, `${selectedSubject}_Rubrics.pdf`)}
                                    style={{
                                        background: 'linear-gradient(135deg, #059669, #047857)',
                                        border: 'none',
                                        color: '#ffffff',
                                        padding: '9px 14px',
                                        borderRadius: '8px',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)'
                                    }}
                                    title="Download PDF"
                                >
                                    <Download size={15} />
                                </button>
                            </>
                        ) : (
                            <div style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                background: '#f8fafc',
                                color: '#64748b',
                                fontSize: '12px',
                                fontWeight: '700',
                                textAlign: 'center',
                                border: '1px dashed #cbd5e1'
                            }}>
                                ⏳ Rubrics Pending Upload for {selectedBoard}
                            </div>
                        )}
                    </div>
                </div>

                {/* PAPER 3: MODEL QUESTION PAPER */}
                <div style={{
                    background: 'linear-gradient(135deg, rgba(253, 242, 248, 0.9) 0%, #ffffff 60%, rgba(253, 242, 248, 0.4) 100%)',
                    border: '1px solid #fbcfe8',
                    borderRadius: '16px',
                    padding: '22px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 16px rgba(236, 72, 153, 0.08)'
                }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{
                                background: '#fce7f3',
                                color: '#9d174d',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '800'
                            }}>
                                PAPER 3 • OFFICIAL MODEL
                            </span>
                            <span style={{ fontSize: '11px', color: '#db2777', fontWeight: '700' }}>
                                Question Paper
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                            <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                background: 'linear-gradient(135deg, #ec4899, #db2777)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff'
                            }}>
                                <FileText size={20} />
                            </div>
                            <div>
                                <h3 style={{ fontSize: '17px', fontWeight: '800', margin: 0, color: '#9d174d' }}>
                                    Official Model Paper
                                </h3>
                                <p style={{ fontSize: '11px', color: '#db2777', margin: '2px 0 0 0' }}>
                                    {selectedSubject} Exam Paper Format
                                </p>
                            </div>
                        </div>

                        <div style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '12px',
                            marginBottom: '16px',
                            fontSize: '12px',
                            color: '#334155',
                            lineHeight: '1.4'
                        }}>
                            {activeBlueprint.modelPaper?.notes || 'Complete sample question paper: Section A (MCQs with bubble sheet rules), Section B (Short Questions), and Section C (Long Questions).'}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        {activeBlueprint.modelPaper?.url ? (
                            <>
                                <button
                                    onClick={() => openPreview(activeBlueprint.modelPaper?.title || `${selectedSubject} Model Paper`, 'Official Model Question Paper', activeBlueprint.modelPaper?.url, 'model')}
                                    style={{
                                        flex: 1,
                                        background: '#ffffff',
                                        border: '1px solid #cbd5e1',
                                        color: '#9d174d',
                                        padding: '9px 12px',
                                        borderRadius: '8px',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                    }}
                                >
                                    <Eye size={14} /> Preview Model
                                </button>
                                <button
                                    onClick={() => handleDownload(activeBlueprint.modelPaper?.url, `${selectedSubject}_ModelPaper.pdf`)}
                                    style={{
                                        background: 'linear-gradient(135deg, #db2777, #be185d)',
                                        border: 'none',
                                        color: '#ffffff',
                                        padding: '9px 14px',
                                        borderRadius: '8px',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        boxShadow: '0 2px 8px rgba(219, 39, 119, 0.25)'
                                    }}
                                    title="Download PDF"
                                >
                                    <Download size={15} />
                                </button>
                            </>
                        ) : (
                            <div style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                background: '#f8fafc',
                                color: '#64748b',
                                fontSize: '12px',
                                fontWeight: '700',
                                textAlign: 'center',
                                border: '1px dashed #cbd5e1'
                            }}>
                                ⏳ Model Paper Pending Upload for {selectedBoard}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* BOTTOM POWER ACTION BAR */}
            <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '18px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
            }}>
                <div>
                    <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: '#0f172a' }}>
                        Download Complete {selectedSubject} 3-Paper Pack
                    </h3>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>
                        Save all 3 papers (TOS, Rubrics & Model Paper) for your teachers, available offline.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => {
                            if (activeBlueprint?.tos?.url) window.open(activeBlueprint.tos.url, '_blank');
                            if (activeBlueprint?.rubrics?.url) window.open(activeBlueprint.rubrics.url, '_blank');
                            if (activeBlueprint?.modelPaper?.url) window.open(activeBlueprint.modelPaper.url, '_blank');
                        }}
                        disabled={!activeBlueprint?.tos?.url && !activeBlueprint?.rubrics?.url && !activeBlueprint?.modelPaper?.url}
                        style={{
                            background: (activeBlueprint?.tos?.url || activeBlueprint?.rubrics?.url || activeBlueprint?.modelPaper?.url) 
                                ? 'linear-gradient(135deg, #4f46e5, #4338ca)' 
                                : '#94a3b8',
                            border: 'none',
                            color: '#ffffff',
                            padding: '10px 20px',
                            borderRadius: '10px',
                            fontSize: '13px',
                            fontWeight: '700',
                            cursor: (activeBlueprint?.tos?.url || activeBlueprint?.rubrics?.url || activeBlueprint?.modelPaper?.url) ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: (activeBlueprint?.tos?.url || activeBlueprint?.rubrics?.url || activeBlueprint?.modelPaper?.url) ? '0 4px 12px rgba(79, 70, 229, 0.25)' : 'none'
                        }}
                    >
                        <Download size={15} /> Download All 3 {selectedSubject} Papers ({selectedBoard})
                    </button>
                </div>
            </div>

            {/* CANVA-STYLE INTERACTIVE PREVIEW MODAL */}
            {previewModal.isOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 99999,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '24px'
                }}>
                    {/* Modal Header */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px 16px 0 0',
                        padding: '16px 24px',
                        color: '#0f172a',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.06)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                background: previewModal.type === 'universal' ? '#f59e0b' : previewModal.type === 'tos' ? '#3b82f6' : previewModal.type === 'rubrics' ? '#10b981' : '#ec4899',
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <FileText size={18} />
                            </div>
                            <div>
                                <h3 style={{ fontSize: '16px', fontWeight: '800', margin: 0, color: '#0f172a' }}>
                                    {previewModal.title}
                                </h3>
                                <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0', fontWeight: '500' }}>
                                    {previewModal.subtitle} • {selectedClass} • Session {selectedSession}
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <a
                                href={previewModal.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                    background: '#f1f5f9',
                                    color: '#334155',
                                    border: '1px solid #cbd5e1',
                                    padding: '8px 14px',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    textDecoration: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <ExternalLink size={13} /> Full Screen Tab
                            </a>
                            <button
                                onClick={() => handleDownload(previewModal.url, `${previewModal.title}.pdf`)}
                                style={{
                                    background: '#2563eb',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '8px 14px',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <Download size={13} /> Download
                            </button>
                            <button
                                onClick={() => setPreviewModal(prev => ({ ...prev, isOpen: false }))}
                                style={{
                                    background: '#fee2e2',
                                    color: '#dc2626',
                                    border: '1px solid #fecaca',
                                    padding: '8px 14px',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                    fontWeight: '800',
                                    cursor: 'pointer'
                                }}
                            >
                                ✕ Close
                            </button>
                        </div>
                    </div>

                    {/* Modal Content */}
                    <div style={{
                        flex: 1,
                        background: '#ffffff',
                        borderRadius: '0 0 16px 16px',
                        overflow: 'hidden',
                        border: '1px solid #e2e8f0',
                        borderTop: 'none',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
                    }}>
                        <iframe
                            src={previewModal.url}
                            style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                            title={previewModal.title}
                        />
                    </div>
                </div>
            )}

            {/* INTERACTIVE BOARD SELECTION MODAL WITH OFFICIAL LOGOS & SLOGANS */}
            {isBoardModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.7)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 99999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '20px',
                        width: '100%',
                        maxWidth: '900px',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        border: '1px solid #e2e8f0',
                        overflow: 'hidden'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '18px 24px',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #1d4ed8, #4338ca)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#ffffff',
                                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
                                }}>
                                    <Building2 size={22} />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '18px', fontWeight: '900', margin: 0, color: '#0f172a' }}>
                                        Select Board of Intermediate & Secondary Education
                                    </h2>
                                    <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>
                                        All Pakistan Examination Boards with Official Crests & Slogans (100% Offline)
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    setIsBoardModalOpen(false);
                                    setBoardSearchQuery('');
                                }}
                                style={{
                                    background: '#f1f5f9',
                                    border: 'none',
                                    color: '#64748b',
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Search & Province Filter Bar */}
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                            <div style={{ position: 'relative', marginBottom: '12px' }}>
                                <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder="Search board, city or district (e.g. Kohat, Karak, Peshawar, Lahore, Rawalpindi)..."
                                    value={boardSearchQuery}
                                    onChange={(e) => setBoardSearchQuery(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '11px 16px 11px 42px',
                                        borderRadius: '12px',
                                        border: '1.5px solid #cbd5e1',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        color: '#0f172a',
                                        outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                    autoFocus
                                />
                            </div>

                            {/* Province Pills */}
                            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                                {['All', 'Khyber Pakhtunkhwa (KPK)', 'Federal Capital', 'Punjab', 'Sindh', 'Balochistan', 'Azad Jammu & Kashmir (AJK)', 'Gilgit-Baltistan'].map(prov => {
                                    const isTabActive = activeProvinceFilter === prov;
                                    const label = prov === 'All' ? 'All Boards (28)' : prov.replace('Khyber Pakhtunkhwa (KPK)', 'KPK').replace('Azad Jammu & Kashmir (AJK)', 'AJK');
                                    return (
                                        <button
                                            key={prov}
                                            onClick={() => setActiveProvinceFilter(prov)}
                                            style={{
                                                padding: '6px 14px',
                                                borderRadius: '20px',
                                                border: isTabActive ? 'none' : '1px solid #e2e8f0',
                                                background: isTabActive ? '#2563eb' : '#f8fafc',
                                                color: isTabActive ? '#ffffff' : '#64748b',
                                                fontSize: '12px',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Board Cards Grid (Scrollable) */}
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '20px 24px',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
                            gap: '12px',
                            background: '#f8fafc'
                        }}>
                            {filteredBoards.length === 0 ? (
                                <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                    No boards found matching "{boardSearchQuery}". Try another city or district.
                                </div>
                            ) : (
                                filteredBoards.map(board => {
                                    const isSelected = selectedBoard.toLowerCase() === board.name.toLowerCase();
                                    return (
                                        <div
                                            key={board.id}
                                            onClick={() => {
                                                setSelectedBoard(board.name);
                                                localStorage.setItem('mai_selected_board', board.name);
                                                setIsBoardModalOpen(false);
                                                setBoardSearchQuery('');
                                            }}
                                            style={{
                                                background: '#ffffff',
                                                borderRadius: '14px',
                                                border: isSelected ? `2px solid ${board.primaryColor || '#2563eb'}` : '1px solid #e2e8f0',
                                                padding: '14px 16px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '14px',
                                                boxShadow: isSelected ? '0 8px 20px -4px rgba(37, 99, 235, 0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
                                                transition: 'all 0.15s ease',
                                                position: 'relative'
                                            }}
                                        >
                                            {/* Official Crest Logo */}
                                            <BoardCrestLogo 
                                                boardId={board.id} 
                                                size={48} 
                                                primaryColor={board.primaryColor} 
                                                accentColor={board.accentColor} 
                                                symbol={board.symbol} 
                                            />

                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <h4 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: '#0f172a' }}>
                                                        {board.name}
                                                    </h4>
                                                    {board.slogan && (
                                                        <span style={{
                                                            background: '#fef3c7',
                                                            color: '#92400e',
                                                            fontSize: '11px',
                                                            fontWeight: '800',
                                                            padding: '2px 8px',
                                                            borderRadius: '6px',
                                                            fontFamily: 'system-ui'
                                                        }}>
                                                            {board.slogan}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontWeight: '500' }}>
                                                    <em>"{board.sloganEn}"</em>
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    📍 {board.districts}
                                                </div>
                                            </div>

                                            {isSelected && (
                                                <div style={{
                                                    width: '26px',
                                                    height: '26px',
                                                    borderRadius: '50%',
                                                    background: '#10b981',
                                                    color: '#ffffff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0
                                                }}>
                                                    <Check size={16} strokeWidth={3} />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BoardTOSStudio;
