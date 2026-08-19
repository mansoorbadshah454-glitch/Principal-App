import React, { useState, useEffect, useRef } from 'react';
import { 
    FileCheck, Sparkles, Printer, RefreshCw, ChevronRight, 
    BookOpen, Layers, CheckSquare, Settings2, Sliders, 
    Trash2, Edit3, Plus, ArrowLeftRight, Check, Eye, EyeOff, 
    HelpCircle, Award, FileText, School, Download, AlertTriangle,
    Clock, Calendar, CheckCircle2, Copy, Shield, Bookmark, LayoutGrid, ListFilter
} from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// REAL CHAPTER TOPICS DATABASE FOR MATRIC / SECONDARY
const SUBJECT_CHAPTERS = {
    'Physics': {
        '9': [
            { num: 1, name: 'Physical Quantities and Measurement' },
            { num: 2, name: 'Kinematics' },
            { num: 3, name: 'Dynamics' },
            { num: 4, name: 'Turning Effect of Forces' },
            { num: 5, name: 'Gravitation' },
            { num: 6, name: 'Work and Energy' },
            { num: 7, name: 'Properties of Matter' },
            { num: 8, name: 'Thermal Properties of Matter' },
            { num: 9, name: 'Transfer of Heat' }
        ],
        '10': [
            { num: 10, name: 'Simple Harmonic Motion and Waves' },
            { num: 11, name: 'Sound' },
            { num: 12, name: 'Geometrical Optics' },
            { num: 13, name: 'Electrostatics' },
            { num: 14, name: 'Current Electricity' },
            { num: 15, name: 'Electromagnetism' },
            { num: 16, name: 'Basic Electronics' },
            { num: 17, name: 'Information and Communication Technology' },
            { num: 18, name: 'Atomic and Nuclear Physics' }
        ]
    },
    'Chemistry': {
        '9': [
            { num: 1, name: 'Fundamentals of Chemistry' },
            { num: 2, name: 'Structure of Atoms' },
            { num: 3, name: 'Periodic Table & Periodicity of Properties' },
            { num: 4, name: 'Structure of Molecules' },
            { num: 5, name: 'Physical States of Matter' },
            { num: 6, name: 'Solutions' },
            { num: 7, name: 'Electrochemistry' },
            { num: 8, name: 'Chemical Reactivity' }
        ],
        '10': [
            { num: 9, name: 'Chemical Equilibrium' },
            { num: 10, name: 'Acids, Bases and Salts' },
            { num: 11, name: 'Organic Chemistry' },
            { num: 12, name: 'Hydrocarbons' },
            { num: 13, name: 'Biochemistry' },
            { num: 14, name: 'The Atmosphere' },
            { num: 15, name: 'Water' },
            { num: 16, name: 'Chemical Industries' }
        ]
    },
    'Mathematics': {
        '9': [
            { num: 1, name: 'Matrices and Determinants' },
            { num: 2, name: 'Real and Complex Numbers' },
            { num: 3, name: 'Logarithms' },
            { num: 4, name: 'Algebraic Expressions and Formulas' },
            { num: 5, name: 'Factorization' },
            { num: 6, name: 'Algebraic Manipulation' },
            { num: 7, name: 'Linear Equations and Inequalities' },
            { num: 8, name: 'Linear Graphs and their Applications' },
            { num: 9, name: 'Introduction to Coordinate Geometry' }
        ],
        '10': [
            { num: 1, name: 'Quadratic Equations' },
            { num: 2, name: 'Theory of Quadratic Equations' },
            { num: 3, name: 'Variations' },
            { num: 4, name: 'Partial Fractions' },
            { num: 5, name: 'Sets and Functions' },
            { num: 6, name: 'Basic Statistics' },
            { num: 7, name: 'Introduction to Trigonometry' }
        ]
    },
    'Biology': {
        '9': [
            { num: 1, name: 'Introduction to Biology' },
            { num: 2, name: 'Solving a Biological Problem' },
            { num: 3, name: 'Biodiversity' },
            { num: 4, name: 'Cells and Tissues' },
            { num: 5, name: 'Cell Cycle' },
            { num: 6, name: 'Enzymes' },
            { num: 7, name: 'Bioenergetics' },
            { num: 8, name: 'Nutrition' },
            { num: 9, name: 'Transport' }
        ],
        '10': [
            { num: 10, name: 'Gaseous Exchange' },
            { num: 11, name: 'Homeostasis' },
            { num: 12, name: 'Coordination and Control' },
            { num: 13, name: 'Support and Movement' },
            { num: 14, name: 'Reproduction' },
            { num: 15, name: 'Inheritance' },
            { num: 16, name: 'Man and his Environment' },
            { num: 17, name: 'Biotechnology' },
            { num: 18, name: 'Pharmacology' }
        ]
    },
    'Computer Science': {
        '9': [
            { num: 1, name: 'Problem Solving' },
            { num: 2, name: 'Binary System' },
            { num: 3, name: 'Networks' },
            { num: 4, name: 'Data and Cyber Security' },
            { num: 5, name: 'Designing Websites (HTML)' }
        ],
        '10': [
            { num: 1, name: 'Introduction to Programming (C-Language)' },
            { num: 2, name: 'User Interaction & Variables' },
            { num: 3, name: 'Conditional Logic' },
            { num: 4, name: 'Data Structures & Arrays' },
            { num: 5, name: 'Functions' }
        ]
    },
    'English': {
        '9': [
            { num: 1, name: 'The Saviour of Mankind' },
            { num: 2, name: 'Patriotism' },
            { num: 3, name: 'Media and Its Impact' },
            { num: 4, name: 'Hazrat Asma (R.A)' },
            { num: 5, name: 'Daffodils (Poem)' },
            { num: 6, name: 'The Quaid’s Vision and Pakistan' },
            { num: 7, name: 'Sultan Ahmad Mosque' },
            { num: 8, name: 'Stopping by Woods on a Snowy Evening' }
        ],
        '10': [
            { num: 1, name: 'Hazrat Muhammad (PBUH) An Embodiment of Justice' },
            { num: 2, name: 'Chinese New Year' },
            { num: 3, name: 'Try Again' },
            { num: 4, name: 'First Aid' },
            { num: 5, name: 'The Rain' },
            { num: 6, name: 'Television vs Newspapers' }
        ]
    },
    'Urdu': {
        '9': [
            { num: 1, name: 'ہجرت نبوی ﷺ' },
            { num: 2, name: 'مرزا غالب کے عادات و خصائل' },
            { num: 3, name: 'کاہلی' },
            { num: 4, name: 'شاعروں کے لطیفے' },
            { num: 5, name: 'نصوح اور سلیم کی گفتگو' },
            { num: 6, name: 'پنچایت' }
        ],
        '10': [
            { num: 1, name: 'مرزا محمد سعید' },
            { num: 2, name: 'نظریہ پاکستان' },
            { num: 3, name: 'پرستان کی شہزادی' },
            { num: 4, name: 'اردو ادب میں عید الفطر' }
        ]
    },
    'Islamiat': {
        '9': [
            { num: 1, name: 'سورۃ الانفال (رکوع 1 تا 5)' },
            { num: 2, name: 'احادیث نبویہ (1 تا 10)' },
            { num: 3, name: 'قرآن مجید کا تعارف اور حفاظت' },
            { num: 4, name: 'ایمان بالرسالت اور ختم نبوت' }
        ],
        '10': [
            { num: 1, name: 'سورۃ الاحزاب' },
            { num: 2, name: 'احادیث نبویہ (11 تا 20)' },
            { num: 3, name: 'علم کی اہمیت اور فرضیت' },
            { num: 4, name: 'عائلی زندگی اور صلہ رحمی' }
        ]
    },
    'Pak Studies': {
        '9': [
            { num: 1, name: 'Ideological Basis of Pakistan' },
            { num: 2, name: 'Making of Pakistan (1857-1947)' },
            { num: 3, name: 'Land and Environment' },
            { num: 4, name: 'History of Pakistan (Part 1)' }
        ],
        '10': [
            { num: 1, name: 'History of Pakistan (Part 2: 1971 to Present)' },
            { num: 2, name: 'Foreign Policy of Pakistan' },
            { num: 3, name: 'Economic Development of Pakistan' },
            { num: 4, name: 'Population, Society and Culture of Pakistan' }
        ]
    }
};

// PROFESSIONAL PRESETS
const EXAM_PRESETS = [
    {
        id: 'chapter_test',
        badge: 'Weekly / Daily',
        name: 'Chapter Assessment Test',
        timeAllowed: '40 Minutes',
        totalMarks: 25,
        mcqCount: 5,
        mcqMarksEach: 1,
        shortCount: 6,
        shortAttempt: 4,
        shortMarksEach: 2,
        longCount: 2,
        longAttempt: 1,
        longMarksEach: 5
    },
    {
        id: 'monthly_test',
        badge: 'Monthly Unit',
        name: 'Monthly Assessment Exam',
        timeAllowed: '1 Hour',
        totalMarks: 35,
        mcqCount: 7,
        mcqMarksEach: 1,
        shortCount: 8,
        shortAttempt: 5,
        shortMarksEach: 2,
        longCount: 3,
        longAttempt: 2,
        longMarksEach: 5
    },
    {
        id: 'mid_term',
        badge: 'Term Exam',
        name: 'Mid-Term / Half-Book Exam',
        timeAllowed: '1 Hour 45 Minutes',
        totalMarks: 50,
        mcqCount: 10,
        mcqMarksEach: 1,
        shortCount: 12,
        shortAttempt: 8,
        shortMarksEach: 2,
        longCount: 4,
        longAttempt: 2,
        longMarksEach: 6
    },
    {
        id: 'bise_board',
        badge: 'Official Board Standard',
        name: 'Full Board Pattern (BISE)',
        timeAllowed: '2 Hours 45 Minutes',
        totalMarks: 75,
        mcqCount: 12,
        mcqMarksEach: 1,
        shortCount: 15,
        shortAttempt: 10,
        shortMarksEach: 2,
        longCount: 5,
        longAttempt: 3,
        longMarksEach: 7
    },
    {
        id: 'custom',
        badge: 'Custom Blueprint',
        name: 'Custom Configuration',
        timeAllowed: '1 Hour 30 Minutes',
        totalMarks: 40,
        mcqCount: 8,
        mcqMarksEach: 1,
        shortCount: 8,
        shortAttempt: 5,
        shortMarksEach: 2,
        longCount: 3,
        longAttempt: 1,
        longMarksEach: 5
    }
];

const ALL_CLASSES = ['Nursery', 'Prep', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

const SUBJECTS_BY_CLASS = {
    'Nursery': ['English (Alphabets)', 'Urdu (Huroof-e-Tahajji)', 'Mathematics (Counting)', 'General Knowledge & Rhymes'],
    'Prep': ['English (Words & Phonics)', 'Urdu (Jor-Tor)', 'Mathematics (Shapes & Numbers)', 'General Knowledge & Drawing'],
    '1': ['General Science', 'Mathematics', 'English', 'Urdu', 'Islamiat', 'General Knowledge'],
    '2': ['General Science', 'Mathematics', 'English', 'Urdu', 'Islamiat', 'General Knowledge', 'Computer'],
    '3': ['General Science', 'Mathematics', 'English', 'Urdu', 'Islamiat', 'Social Studies', 'Computer'],
    '4': ['General Science', 'Mathematics', 'English', 'Urdu', 'Islamiat', 'Social Studies', 'Computer'],
    '5': ['General Science', 'Mathematics', 'English', 'Urdu', 'Islamiat', 'Social Studies', 'Computer'],
    '6': ['General Science', 'Mathematics', 'English', 'Urdu', 'Islamiat', 'History', 'Geography', 'Computer Education'],
    '7': ['General Science', 'Mathematics', 'English', 'Urdu', 'Islamiat', 'History', 'Geography', 'Computer Education'],
    '8': ['General Science', 'Mathematics', 'English', 'Urdu', 'Islamiat', 'History', 'Geography', 'Computer Education'],
    '9': ['Physics', 'Chemistry', 'Biology', 'Mathematics', 'Computer Science', 'English', 'Urdu', 'Islamiat', 'Pak Studies', 'General Science'],
    '10': ['Physics', 'Chemistry', 'Biology', 'Mathematics', 'Computer Science', 'English', 'Urdu', 'Islamiat', 'Pak Studies', 'General Science']
};

const DEFAULT_PRIMARY_CHAPTERS = {
    'General Science': [
        { num: 1, name: 'Classification of Living Organisms' },
        { num: 2, name: 'Microorganisms and Human Health' },
        { num: 3, name: 'Flowers, Seeds and Reproduction' },
        { num: 4, name: 'Environmental Pollution & Protection' },
        { num: 5, name: 'Physical and Chemical Changes of Matter' },
        { num: 6, name: 'Light, Sound and Reflection' },
        { num: 7, name: 'Electricity and Magnetism' },
        { num: 8, name: 'Structure of the Earth & Rocks' },
        { num: 9, name: 'Space, Solar System and Satellites' }
    ],
    'Mathematics': [
        { num: 1, name: 'Whole Numbers and Operations' },
        { num: 2, name: 'HCF and LCM' },
        { num: 3, name: 'Fractions (Addition, Subtraction & Division)' },
        { num: 4, name: 'Decimals and Percentages' },
        { num: 5, name: 'Distance, Time and Temperature' },
        { num: 6, name: 'Unitary Method and Financial Math' },
        { num: 7, name: 'Geometry (Angles, Triangles & Polygons)' },
        { num: 8, name: 'Perimeter and Area' },
        { num: 9, name: 'Information Handling and Graphs' }
    ],
    'English': [
        { num: 1, name: 'The Grateful Heart' },
        { num: 2, name: 'Women as Role Models' },
        { num: 3, name: 'Unforgettable Historical Moments' },
        { num: 4, name: 'Saving Our Nature & Trees' },
        { num: 5, name: 'Kindness and Good Manners' },
        { num: 6, name: 'Dignity of Work' },
        { num: 7, name: 'The Power of Imagination' },
        { num: 8, name: 'Safety First (Health & Hygiene)' }
    ],
    'English (Alphabets)': [
        { num: 1, name: 'Capital Letters (A to M) & Phonics' },
        { num: 2, name: 'Capital Letters (N to Z) & Phonics' },
        { num: 3, name: 'Small Letters (a to z) Tracing' },
        { num: 4, name: 'Missing Letters & Picture Matching' }
    ],
    'Urdu (Huroof-e-Tahajji)': [
        { num: 1, name: 'حروفِ تہجی (الف تا ژ)' },
        { num: 2, name: 'حروفِ تہجی (س تا ے)' },
        { num: 3, name: 'تصویر دیکھ کر پہلا حرف لکھیں' },
        { num: 4, name: 'خالی جگہ اور درست حرف کا انتخاب' }
    ],
    'Mathematics (Counting)': [
        { num: 1, name: 'Counting (1 to 20) & Tracing' },
        { num: 2, name: 'Count and Match the Objects' },
        { num: 3, name: 'Basic Shapes (Circle, Square, Triangle)' },
        { num: 4, name: 'Big vs Small / More vs Less' }
    ]
};

const PaperGenerator = () => {
    // School & Auth state
    const [schoolId, setSchoolId] = useState(null);
    const [schoolInfo, setSchoolInfo] = useState({
        name: 'The Superior Academy & High School',
        address: 'Main Campus, Educational Complex',
        contact: '+92 300 1234567',
        logoUrl: null
    });

    // --- STEP 1: PAPER SETTINGS STATE ---
    const [activeSettingsTab, setActiveSettingsTab] = useState('exam_info'); // 'exam_info' | 'syllabus' | 'blueprint' | 'typesetting'
    
    // 1. Exam Header & Info
    const [examTitle, setExamTitle] = useState('First Term Examination 2026');
    const [academicSession, setAcademicSession] = useState('2025-2026');
    const [campusName, setCampusName] = useState('Main Campus');
    const [classSection, setClassSection] = useState('Section A');
    const [examDate, setExamDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [timeAllowed, setTimeAllowed] = useState('1 Hour 30 Minutes');
    const [instructions, setInstructions] = useState('Use blue or black pen only. Overwriting, cutting, or using lead pencil in Section-A (Objective) will result in zero marks.');
    const [showWatermark, setShowWatermark] = useState(true);
    const [showSchoolLogo, setShowSchoolLogo] = useState(true);

    // 2. Class & Syllabus
    const [selectedClass, setSelectedClass] = useState('9');
    const [selectedSubject, setSelectedSubject] = useState('Physics');
    const [selectedChapters, setSelectedChapters] = useState([1, 2]);

    // 3. Exam Blueprint & Preset
    const [selectedPreset, setSelectedPreset] = useState('mid_term');
    const [mcqCount, setMcqCount] = useState(10);
    const [mcqMarksEach, setMcqMarksEach] = useState(1);

    const [shortCount, setShortCount] = useState(12);
    const [shortAttempt, setShortAttempt] = useState(8);
    const [shortMarksEach, setShortMarksEach] = useState(2);

    const [longCount, setLongCount] = useState(4);
    const [longAttempt, setLongAttempt] = useState(2);
    const [longMarksEach, setLongMarksEach] = useState(6);

    // 4. Typesetting & Language
    const [languageMode, setLanguageMode] = useState('bilingual'); // 'english' | 'urdu' | 'bilingual'
    const [paperStyle, setPaperStyle] = useState('board_standard'); // 'board_standard' | 'compact' | 'with_lines'
    const [fontSize, setFontSize] = useState('normal'); // 'compact' | 'normal' | 'large'
    const [showAnswerKey, setShowAnswerKey] = useState(true);

    // Calculated Blueprint Metrics
    const totalMarks = (mcqCount * mcqMarksEach) + (shortAttempt * shortMarksEach) + (longAttempt * longMarksEach);
    const totalQuestionsGiven = mcqCount + shortCount + longCount;
    const totalQuestionsToAttempt = mcqCount + shortAttempt + longAttempt;

    // --- STEP 2: GENERATED PAPER STATE ---
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedPaper, setGeneratedPaper] = useState(null);
    const [availablePool, setAvailablePool] = useState({ mcqs: [], shorts: [], longs: [] });
    const [activeView, setActiveView] = useState('config'); // 'config' | 'preview'

    const printRef = useRef(null);

    // 1. Resolve School Details from Firestore
    useEffect(() => {
        const resolveSchool = async () => {
            let sId = null;
            const manualSession = localStorage.getItem('manual_session');
            if (manualSession) {
                try {
                    const parsed = JSON.parse(manualSession);
                    sId = parsed.schoolId;
                } catch (e) {
                    console.error("Session error:", e);
                }
            }
            if (!sId && auth.currentUser) {
                try {
                    const token = await auth.currentUser.getIdTokenResult();
                    sId = token.claims?.schoolId;
                } catch (e) {
                    console.error("Token error:", e);
                }
            }

            if (sId) {
                setSchoolId(sId);
                try {
                    const schoolDoc = await getDoc(doc(db, 'schools', sId));
                    if (schoolDoc.exists()) {
                        const sData = schoolDoc.data();
                        setSchoolInfo(prev => ({
                            name: sData.name || prev.name,
                            address: sData.address || prev.address,
                            contact: sData.contact || prev.contact,
                            logoUrl: sData.logoUrl || null
                        }));
                    }
                } catch (err) {
                    console.log("Error loading school profile:", err);
                }
            }
        };

        resolveSchool();
    }, []);

    // Get current subject's chapter list dynamically
    const availableClassSubjects = SUBJECTS_BY_CLASS[selectedClass] || [
        'Physics', 'Chemistry', 'Biology', 'Mathematics', 'Computer Science', 'English', 'Urdu', 'Islamiat', 'Pak Studies'
    ];

    const currentSubjectChapters = SUBJECT_CHAPTERS[selectedSubject]?.[selectedClass] || 
        DEFAULT_PRIMARY_CHAPTERS[selectedSubject] || [
        { num: 1, name: `${selectedSubject} - Unit 1: Foundations & Concepts` },
        { num: 2, name: `${selectedSubject} - Unit 2: Principles & Practical Rules` },
        { num: 3, name: `${selectedSubject} - Unit 3: Exercises & Key Applications` },
        { num: 4, name: `${selectedSubject} - Unit 4: Review & Assessment Tasks` }
    ];

    // Quick Syllabus Selection Helpers
    const handleSelectAllChapters = () => {
        setSelectedChapters(currentSubjectChapters.map(c => c.num));
    };

    const handleSelectHalfBook = (half) => {
        const total = currentSubjectChapters.length;
        const mid = Math.ceil(total / 2);
        if (half === 1) {
            setSelectedChapters(currentSubjectChapters.slice(0, mid).map(c => c.num));
        } else {
            setSelectedChapters(currentSubjectChapters.slice(mid).map(c => c.num));
        }
    };

    const handleToggleChapter = (chNum) => {
        setSelectedChapters(prev => {
            if (prev.includes(chNum)) {
                if (prev.length === 1) return prev; // Keep at least one
                return prev.filter(c => c !== chNum);
            } else {
                return [...prev, chNum].sort((a, b) => a - b);
            }
        });
    };

    // Apply Preset
    const handleApplyPreset = (presetId) => {
        setSelectedPreset(presetId);
        const preset = EXAM_PRESETS.find(p => p.id === presetId);
        if (preset) {
            setTimeAllowed(preset.timeAllowed);
            setMcqCount(preset.mcqCount);
            setMcqMarksEach(preset.mcqMarksEach);
            setShortCount(preset.shortCount);
            setShortAttempt(preset.shortAttempt);
            setShortMarksEach(preset.shortMarksEach);
            setLongCount(preset.longCount);
            setLongAttempt(preset.longAttempt);
            setLongMarksEach(preset.longMarksEach);
        }
    };

    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

    // 2. High-Performance Balanced Question Generation
    const handleGeneratePaper = async () => {
        setIsGenerating(true);
        try {
            const activeChs = selectedChapters?.length > 0 ? selectedChapters : [1];
            let allMatched = [];

            // Attempt to load from global Firestore question bank (Graceful fallback)
            try {
                const qRef = collection(db, 'global_question_bank');
                const qQuery = query(
                    qRef,
                    where('class', '==', String(selectedClass)),
                    where('subject', '==', selectedSubject)
                );

                const snap = await getDocs(qQuery);
                snap.forEach(d => {
                    const data = d.data();
                    if (activeChs.includes(Number(data.chapterNumber))) {
                        allMatched.push({ id: d.id, ...data });
                    }
                });
            } catch (dbErr) {
                console.warn("Firestore query fallback to dynamic generator:", dbErr.message);
            }

            let mcqPool = allMatched.filter(q => q.type === 'mcq');
            let shortPool = allMatched.filter(q => q.type === 'short');
            let longPool = allMatched.filter(q => q.type === 'long');

            // Fallback generation tailored to class, subject, and topic names
            if (mcqPool.length < mcqCount) {
                const needed = Math.max(mcqCount + 6, 12);
                const generatedMcqs = Array.from({ length: needed }, (_, i) => {
                    const ch = currentSubjectChapters[i % currentSubjectChapters.length];
                    const isUrduLang = selectedSubject.toLowerCase().includes('urdu') || selectedSubject.toLowerCase().includes('islamiat');
                    
                    let qText = `Conceptual multiple-choice question #${i+1} covering ${selectedSubject} (${ch.name}).`;
                    let qUrdu = `معروضی سوال نمبر ${i+1} برائے ${selectedSubject} (${ch.name})`;
                    let opts = ['Option A (Correct Principle)', 'Option B (Accurate Rule)', 'Option C (Secondary Alternative)', 'Option D (Comprehensive)'];
                    let ans = 'Option A (Correct Principle)';

                    if (selectedClass === 'Nursery' || selectedClass === 'Prep') {
                        qText = `Choose the correct letter / object matching with (${ch.name}):`;
                        opts = ['Cat (C)', 'Apple (A)', 'Ball (B)', 'Dog (D)'];
                        ans = 'Apple (A)';
                    }

                    return {
                        id: `gen_mcq_${i+1}_${Date.now()}`,
                        type: 'mcq',
                        chapterNumber: ch.num,
                        chapterName: ch.name,
                        question: qText,
                        questionUrdu: qUrdu,
                        options: opts,
                        correctAnswer: ans,
                        marks: mcqMarksEach
                    };
                });
                mcqPool = [...mcqPool, ...generatedMcqs];
            }

            if (shortPool.length < shortCount) {
                const needed = Math.max(shortCount + 8, 16);
                const generatedShorts = Array.from({ length: needed }, (_, i) => {
                    const ch = currentSubjectChapters[i % currentSubjectChapters.length];
                    let qText = `Define and briefly explain the key concept and core applications of ${ch.name}.`;
                    let qUrdu = `${ch.name} کے اہم اصول اور وضاحتی نکات تحریر کریں۔`;

                    if (selectedClass === 'Nursery' || selectedClass === 'Prep') {
                        qText = `Write the missing letter / word related to ${ch.name}.`;
                        qUrdu = `خالی جگہ میں درست حرف یا لفظ تحریر کریں۔`;
                    }

                    return {
                        id: `gen_short_${i+1}_${Date.now()}`,
                        type: 'short',
                        chapterNumber: ch.num,
                        chapterName: ch.name,
                        question: qText,
                        questionUrdu: qUrdu,
                        correctAnswer: `Model Answer: 1. Core definition. 2. Scientific/Theoretical justification. 3. Practical application.`,
                        marks: shortMarksEach
                    };
                });
                shortPool = [...shortPool, ...generatedShorts];
            }

            if (longPool.length < longCount) {
                const needed = Math.max(longCount + 4, 8);
                const generatedLongs = Array.from({ length: needed }, (_, i) => {
                    const ch = currentSubjectChapters[i % currentSubjectChapters.length];
                    return {
                        id: `gen_long_${i+1}_${Date.now()}`,
                        type: 'long',
                        chapterNumber: ch.num,
                        chapterName: ch.name,
                        question: `Comprehensive Question: Explain ${ch.name} in detail with labeled diagram, full mathematical derivation and practical significance in ${selectedSubject}.`,
                        questionUrdu: `جامع سوال: ضروری خاکے اور حسابی فارمولے کی مدد سے تفصیلی وضاحت تحریر کریں۔`,
                        correctAnswer: `Marking Scheme: Statement/Diagram (2M), Theoretical Proof (3M), Practical Significance (2M).`,
                        marks: longMarksEach
                    };
                });
                longPool = [...longPool, ...generatedLongs];
            }

            // Balanced Fisher-Yates shuffle
            const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

            const shuffledMcqs = shuffle(mcqPool);
            const shuffledShorts = shuffle(shortPool);
            const shuffledLongs = shuffle(longPool);

            const pickedMcqs = shuffledMcqs.slice(0, mcqCount);
            const pickedShorts = shuffledShorts.slice(0, shortCount);
            const pickedLongs = shuffledLongs.slice(0, longCount);

            setAvailablePool({
                mcqs: shuffledMcqs.slice(mcqCount),
                shorts: shuffledShorts.slice(shortCount),
                longs: shuffledLongs.slice(longCount)
            });

            setGeneratedPaper({
                examTitle,
                academicSession,
                campusName,
                classSection,
                examDate,
                class: selectedClass,
                subject: selectedSubject,
                chapters: activeChs,
                timeAllowed,
                instructions,
                showWatermark,
                showSchoolLogo,
                languageMode,
                paperStyle,
                fontSize,
                totalMarks,
                mcqs: pickedMcqs,
                shorts: pickedShorts,
                longs: pickedLongs,
                shortAttempt: Math.min(shortAttempt, shortCount),
                longAttempt: Math.min(longAttempt, longCount)
            });

            setActiveView('preview');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            console.error("Paper generation error:", err);
            alert("Paper Generation Error: " + err.message);
        } finally {
            setIsGenerating(false);
        }
    };

    // Download Clean, High-Fidelity Multi-Page PDF Document (Zero Question Cut)
    const handleDownloadPdf = async () => {
        if (!printRef.current) return;
        setIsDownloadingPdf(true);
        try {
            const paperEl = printRef.current;

            // 1. Capture with html2canvas (strictly ignoring all buttons, swap icons, and no-print UI)
            const canvas = await html2canvas(paperEl, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                ignoreElements: (el) => {
                    return el.classList?.contains('no-print') || 
                           el.hasAttribute?.('data-html2canvas-ignore') || 
                           el.tagName === 'BUTTON';
                }
            });

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = 210; // A4 mm
            const pdfHeight = 297; // A4 mm
            const marginMm = 10;
            const contentWidthMm = pdfWidth - (marginMm * 2);
            const contentHeightMm = pdfHeight - (marginMm * 2);

            const scaleRatio = canvas.width / paperEl.offsetWidth;
            const maxPageCanvasHeight = (contentHeightMm / contentWidthMm) * canvas.width;

            // 2. Identify clean splitting boundary coordinates based on actual question elements
            const breakElements = Array.from(paperEl.querySelectorAll('.question-item, .paper-section-header, .paper-meta-box, .school-header, .paper-answer-key'));
            const breakPointsPx = breakElements.map(el => {
                const rect = el.getBoundingClientRect();
                const parentRect = paperEl.getBoundingClientRect();
                return (rect.top - parentRect.top) * scaleRatio;
            }).filter(top => top > 0);

            breakPointsPx.push(canvas.height);

            let currentY = 0;
            let pageIndex = 0;

            while (currentY < canvas.height - 10) {
                if (pageIndex > 0) {
                    pdf.addPage();
                }

                // Target end position for this page
                let targetEndY = currentY + maxPageCanvasHeight;

                if (targetEndY >= canvas.height) {
                    targetEndY = canvas.height;
                } else {
                    // Find the best clean breakpoint just before the page limit
                    const validBreaks = breakPointsPx.filter(bp => bp > currentY + 100 && bp <= targetEndY);
                    if (validBreaks.length > 0) {
                        targetEndY = validBreaks[validBreaks.length - 1];
                    }
                }

                const sliceHeight = targetEndY - currentY;
                if (sliceHeight <= 0) break;

                // Create a temporary canvas for this clean page slice
                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = canvas.width;
                pageCanvas.height = sliceHeight;
                const pageCtx = pageCanvas.getContext('2d');

                pageCtx.drawImage(
                    canvas,
                    0, currentY, canvas.width, sliceHeight,
                    0, 0, canvas.width, sliceHeight
                );

                const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.95);
                const renderedHeightMm = (sliceHeight * contentWidthMm) / canvas.width;

                pdf.addImage(pageImgData, 'JPEG', marginMm, marginMm, contentWidthMm, renderedHeightMm);

                currentY = targetEndY;
                pageIndex++;
            }

            const cleanSubject = selectedSubject.replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `${schoolInfo.name.replace(/[^a-zA-Z0-9]/g, '_')}_Class${selectedClass}_${cleanSubject}_ExamPaper.pdf`;
            pdf.save(fileName);
        } catch (err) {
            console.error("PDF download error:", err);
            window.print();
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    // Swap single question with alternate from pool
    const handleSwapQuestion = (type, index) => {
        if (!generatedPaper) return;

        let poolKey = type === 'mcq' ? 'mcqs' : type === 'short' ? 'shorts' : 'longs';
        let currentPool = [...availablePool[poolKey]];
        let currentList = [...generatedPaper[poolKey]];

        if (currentPool.length === 0) {
            alert(`No more alternate ${type.toUpperCase()} questions available in the current bank pool.`);
            return;
        }

        const oldQuestion = currentList[index];
        const newQuestion = currentPool.shift();
        currentPool.push(oldQuestion);

        currentList[index] = newQuestion;

        setGeneratedPaper(prev => ({
            ...prev,
            [poolKey]: currentList
        }));

        setAvailablePool(prev => ({
            ...prev,
            [poolKey]: currentPool
        }));
    };

    const handlePrintPaper = () => {
        window.print();
    };

    return (
        <div style={{ padding: '1.5rem', color: '#1e293b', minHeight: '100vh', background: '#f8fafc' }}>
            {/* Top Navigation Bar (Hidden on Print) */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem', background: '#ffffff', padding: '1.25rem 1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: '10px', background: 'linear-gradient(135deg, #4f46e5, #06b6d4)', display: 'flex' }}>
                            <FileCheck size={22} color="#ffffff" />
                        </div>
                        Exam Paper Studio & Settings
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                        Professional Board Pattern (BISE) Blueprint Configurator & One-Click Generation Engine
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setActiveView('config')}
                        style={{
                            padding: '0.6rem 1.2rem',
                            borderRadius: '10px',
                            fontWeight: '600',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            background: activeView === 'config' ? '#4f46e5' : '#f1f5f9',
                            color: activeView === 'config' ? '#ffffff' : '#475569',
                            border: '1px solid ' + (activeView === 'config' ? '#4f46e5' : '#cbd5e1')
                        }}
                    >
                        <Settings2 size={16} />
                        Paper Settings
                    </button>

                    {generatedPaper && (
                        <>
                            <button
                                onClick={() => setActiveView('preview')}
                                style={{
                                    padding: '0.6rem 1.2rem',
                                    borderRadius: '10px',
                                    fontWeight: '600',
                                    fontSize: '0.875rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    background: activeView === 'preview' ? '#4f46e5' : '#f1f5f9',
                                    color: activeView === 'preview' ? '#ffffff' : '#475569',
                                    border: '1px solid ' + (activeView === 'preview' ? '#4f46e5' : '#cbd5e1')
                                }}
                            >
                                <Eye size={16} />
                                View Paper Canvas
                            </button>

                            <button
                                onClick={() => setShowAnswerKey(!showAnswerKey)}
                                style={{
                                    padding: '0.6rem 1.2rem',
                                    borderRadius: '10px',
                                    fontWeight: '600',
                                    fontSize: '0.875rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    background: showAnswerKey ? '#10b981' : '#f1f5f9',
                                    color: showAnswerKey ? '#ffffff' : '#475569',
                                    border: '1px solid ' + (showAnswerKey ? '#10b981' : '#cbd5e1')
                                }}
                            >
                                <CheckSquare size={16} />
                                {showAnswerKey ? 'Answer Key (ON)' : 'Answer Key (OFF)'}
                            </button>

                            <button
                                onClick={handleDownloadPdf}
                                disabled={isDownloadingPdf}
                                style={{
                                    padding: '0.6rem 1.3rem',
                                    borderRadius: '10px',
                                    fontWeight: '700',
                                    fontSize: '0.875rem',
                                    cursor: isDownloadingPdf ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                    color: '#ffffff',
                                    border: 'none',
                                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
                                }}
                            >
                                {isDownloadingPdf ? (
                                    <>
                                        <RefreshCw className="animate-spin" size={16} />
                                        Generating PDF...
                                    </>
                                ) : (
                                    <>
                                        <Download size={16} />
                                        Download PDF
                                    </>
                                )}
                            </button>

                            <button
                                onClick={handlePrintPaper}
                                style={{
                                    padding: '0.6rem 1.3rem',
                                    borderRadius: '10px',
                                    fontWeight: '700',
                                    fontSize: '0.875rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    background: 'linear-gradient(135deg, #059669, #10b981)',
                                    color: '#ffffff',
                                    border: 'none',
                                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                                }}
                            >
                                <Printer size={16} />
                                Print
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* VIEW 1: PROFESSIONAL SETTINGS WIZARD */}
            {activeView === 'config' && (
                <div className="no-print" style={{ width: '100%', maxWidth: '100%' }}>
                    {/* Settings Navigation Tabs */}
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.25rem', flexWrap: 'wrap', width: '100%' }}>
                        {[
                            { id: 'exam_info', label: '1. Exam Profile & Header', icon: School },
                            { id: 'syllabus', label: '2. Syllabus & Chapter Selector', icon: BookOpen },
                            { id: 'blueprint', label: '3. Blueprint & Marks Scheme', icon: Sliders },
                            { id: 'typesetting', label: '4. Layout & Language Style', icon: LayoutGrid }
                        ].map(tab => {
                            const isActive = activeSettingsTab === tab.id;
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveSettingsTab(tab.id)}
                                    style={{
                                        flex: '1 1 200px',
                                        padding: '0.85rem 1.25rem',
                                        borderRadius: '12px 12px 0 0',
                                        fontWeight: '700',
                                        fontSize: '0.95rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.6rem',
                                        border: 'none',
                                        borderBottom: isActive ? '3px solid #4f46e5' : '3px solid transparent',
                                        background: isActive ? '#ffffff' : 'rgba(255,255,255,0.6)',
                                        color: isActive ? '#4f46e5' : '#64748b',
                                        boxShadow: isActive ? '0 -2px 10px rgba(0,0,0,0.04)' : 'none',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <Icon size={20} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* MAIN SETTINGS CONTAINER */}
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', marginBottom: '1.5rem' }}>
                        
                        {/* TAB 1: EXAM PROFILE & HEADER */}
                        {activeSettingsTab === 'exam_info' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <School size={22} color="#4f46e5" />
                                        Institutional Branding & Exam Meta Details
                                    </h2>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                                        Customize how the top banner, institution details, student boxes, and guidelines appear on the printed paper.
                                    </p>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>Exam / Term Title</label>
                                        <input
                                            type="text"
                                            value={examTitle}
                                            onChange={(e) => setExamTitle(e.target.value)}
                                            placeholder="e.g. First Term Assessment 2026"
                                            style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>Academic Session</label>
                                        <input
                                            type="text"
                                            value={academicSession}
                                            onChange={(e) => setAcademicSession(e.target.value)}
                                            placeholder="e.g. 2025-2026"
                                            style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>Campus / Branch</label>
                                        <input
                                            type="text"
                                            value={campusName}
                                            onChange={(e) => setCampusName(e.target.value)}
                                            placeholder="e.g. Main Campus / Boys Wing"
                                            style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>Exam Date</label>
                                        <input
                                            type="date"
                                            value={examDate}
                                            onChange={(e) => setExamDate(e.target.value)}
                                            style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>General Instructions for Students</label>
                                    <textarea
                                        rows="2"
                                        value={instructions}
                                        onChange={(e) => setInstructions(e.target.value)}
                                        style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', resize: 'vertical' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>
                                        <input
                                            type="checkbox"
                                            checked={showSchoolLogo}
                                            onChange={(e) => setShowSchoolLogo(e.target.checked)}
                                            style={{ width: '18px', height: '18px', accentColor: '#4f46e5' }}
                                        />
                                        Include Official School Logo in Header
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>
                                        <input
                                            type="checkbox"
                                            checked={showWatermark}
                                            onChange={(e) => setShowWatermark(e.target.checked)}
                                            style={{ width: '18px', height: '18px', accentColor: '#4f46e5' }}
                                        />
                                        Render Light Anti-Piracy Watermark on Paper
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* TAB 2: SYLLABUS & CHAPTER SELECTOR */}
                        {activeSettingsTab === 'syllabus' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <BookOpen size={22} color="#4f46e5" />
                                        Target Subject & Topic Weightage Selector
                                    </h2>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                                        Select the class, subject, and the exact chapters or topics you want to include in this exam paper.
                                    </p>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>Target Class</label>
                                        <select
                                            value={selectedClass}
                                            onChange={(e) => {
                                                const newClass = e.target.value;
                                                setSelectedClass(newClass);
                                                const subs = SUBJECTS_BY_CLASS[newClass] || [];
                                                if (subs.length > 0) {
                                                    setSelectedSubject(subs[0]);
                                                }
                                                setSelectedChapters([1, 2]);
                                            }}
                                            style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#fff' }}
                                        >
                                            {ALL_CLASSES.map(c => <option key={c} value={c}>{c === 'Nursery' || c === 'Prep' ? c : `Class ${c}`}</option>)}
                                        </select>
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>Target Subject</label>
                                        <select
                                            value={selectedSubject}
                                            onChange={(e) => {
                                                setSelectedSubject(e.target.value);
                                                setSelectedChapters([1, 2]);
                                            }}
                                            style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#fff' }}
                                        >
                                            {availableClassSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Fast Range Selection Bar */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', background: '#f1f5f9', padding: '0.75rem 1rem', borderRadius: '10px' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#334155', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <ListFilter size={16} />
                                        Quick Range Presets:
                                    </span>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            onClick={handleSelectAllChapters}
                                            style={{ padding: '0.35rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' }}
                                        >
                                            Full Book (All {currentSubjectChapters.length} Chapters)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSelectHalfBook(1)}
                                            style={{ padding: '0.35rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' }}
                                        >
                                            1st Half Book
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSelectHalfBook(2)}
                                            style={{ padding: '0.35rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' }}
                                        >
                                            2nd Half Book
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedChapters([1])}
                                            style={{ padding: '0.35rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' }}
                                        >
                                            Chapter 1 Only
                                        </button>
                                    </div>
                                </div>

                                {/* Chapters Grid with Topic Names */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.5rem' }}>
                                        Topic Breakdown (Click to Select / Deselect):
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                                        {currentSubjectChapters.map(ch => {
                                            const isSelected = selectedChapters.includes(ch.num);
                                            return (
                                                <div
                                                    key={ch.num}
                                                    onClick={() => handleToggleChapter(ch.num)}
                                                    style={{
                                                        padding: '0.75rem 1rem',
                                                        borderRadius: '10px',
                                                        border: '2px solid ' + (isSelected ? '#4f46e5' : '#e2e8f0'),
                                                        background: isSelected ? '#eef2ff' : '#ffffff',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'flex-start',
                                                        gap: '0.75rem',
                                                        transition: 'all 0.2s ease'
                                                    }}
                                                >
                                                    <div style={{
                                                        width: '24px',
                                                        height: '24px',
                                                        borderRadius: '6px',
                                                        background: isSelected ? '#4f46e5' : '#e2e8f0',
                                                        color: isSelected ? '#fff' : '#64748b',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '700',
                                                        flexShrink: 0,
                                                        marginTop: '2px'
                                                    }}>
                                                        {isSelected ? '✓' : ch.num}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: '0.88rem', fontWeight: '700', color: isSelected ? '#312e81' : '#1e293b' }}>
                                                            Ch {ch.num}: {ch.name}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: isSelected ? '#4f46e5' : '#94a3b8', marginTop: '0.15rem' }}>
                                                            {isSelected ? 'Included in Exam Blueprint' : 'Click to add'}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB 3: BLUEPRINT & MARKS SCHEME */}
                        {activeSettingsTab === 'blueprint' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Sliders size={22} color="#4f46e5" />
                                        Paper Blueprint & Question Sections
                                    </h2>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                                        Choose standard official board presets or customize question counts, choices, and marks for each section.
                                    </p>
                                </div>

                                {/* Preset Selector Cards */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.5rem' }}>Select Standard Pattern Preset</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                                        {EXAM_PRESETS.map(preset => {
                                            const isSelected = selectedPreset === preset.id;
                                            return (
                                                <div
                                                    key={preset.id}
                                                    onClick={() => handleApplyPreset(preset.id)}
                                                    style={{
                                                        padding: '1rem',
                                                        borderRadius: '12px',
                                                        border: '2px solid ' + (isSelected ? '#4f46e5' : '#e2e8f0'),
                                                        background: isSelected ? '#f5f3ff' : '#ffffff',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease'
                                                    }}
                                                >
                                                    <span style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: isSelected ? '#4f46e5' : '#f1f5f9', color: isSelected ? '#fff' : '#64748b', fontWeight: '700' }}>
                                                        {preset.badge}
                                                    </span>
                                                    <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#1e293b', margin: '0.5rem 0 0.25rem' }}>
                                                        {preset.name}
                                                    </h3>
                                                    <div style={{ fontSize: '0.8rem', color: '#4f46e5', fontWeight: '700' }}>
                                                        {preset.totalMarks} Marks &nbsp;|&nbsp; {preset.timeAllowed}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Granular Section Settings */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
                                    
                                    {/* SECTION A */}
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                            <span style={{ fontWeight: '800', fontSize: '0.95rem', color: '#1e293b' }}>Section A: Objective (MCQs)</span>
                                            <span style={{ background: '#4f46e5', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '800', fontSize: '0.8rem' }}>
                                                {mcqCount * mcqMarksEach} Marks
                                            </span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Total MCQs Given</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="30"
                                                    value={mcqCount}
                                                    onChange={(e) => setMcqCount(Number(e.target.value))}
                                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Marks per MCQ</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="5"
                                                    value={mcqMarksEach}
                                                    onChange={(e) => setMcqMarksEach(Number(e.target.value))}
                                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* SECTION B */}
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                            <span style={{ fontWeight: '800', fontSize: '0.95rem', color: '#1e293b' }}>Section B: Short Questions</span>
                                            <span style={{ background: '#059669', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '800', fontSize: '0.8rem' }}>
                                                {shortAttempt * shortMarksEach} Marks
                                            </span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Total Given</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="30"
                                                    value={shortCount}
                                                    onChange={(e) => setShortCount(Number(e.target.value))}
                                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>To Attempt</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max={shortCount}
                                                    value={shortAttempt}
                                                    onChange={(e) => setShortAttempt(Number(e.target.value))}
                                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Marks Each</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="5"
                                                    value={shortMarksEach}
                                                    onChange={(e) => setShortMarksEach(Number(e.target.value))}
                                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* SECTION C */}
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                            <span style={{ fontWeight: '800', fontSize: '0.95rem', color: '#1e293b' }}>Section C: Long / Detailed</span>
                                            <span style={{ background: '#d97706', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '800', fontSize: '0.8rem' }}>
                                                {longAttempt * longMarksEach} Marks
                                            </span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Total Given</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="10"
                                                    value={longCount}
                                                    onChange={(e) => setLongCount(Number(e.target.value))}
                                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>To Attempt</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max={longCount}
                                                    value={longAttempt}
                                                    onChange={(e) => setLongAttempt(Number(e.target.value))}
                                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Marks Each</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="15"
                                                    value={longMarksEach}
                                                    onChange={(e) => setLongMarksEach(Number(e.target.value))}
                                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB 4: TYPESETTING & LANGUAGE STYLE */}
                        {activeSettingsTab === 'typesetting' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <LayoutGrid size={22} color="#4f46e5" />
                                        Paper Layout, Language & Print Typography
                                    </h2>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                                        Set your language preference (Bilingual English/Urdu), page density, and font rendering style.
                                    </p>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.25rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>Language Format</label>
                                        <select
                                            value={languageMode}
                                            onChange={(e) => setLanguageMode(e.target.value)}
                                            style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#fff' }}
                                        >
                                            <option value="bilingual">Bilingual (English + Urdu side by side)</option>
                                            <option value="english">English Language Only</option>
                                            <option value="urdu">Urdu Language Only</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>Paper Density & Spacing</label>
                                        <select
                                            value={paperStyle}
                                            onChange={(e) => setPaperStyle(e.target.value)}
                                            style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#fff' }}
                                        >
                                            <option value="board_standard">Official Board Standard (Classic A4)</option>
                                            <option value="compact">Eco-Compact (Saves Maximum Paper)</option>
                                            <option value="with_lines">Spacious with Student Answer Lines</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>Font Typography Size</label>
                                        <select
                                            value={fontSize}
                                            onChange={(e) => setFontSize(e.target.value)}
                                            style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#fff' }}
                                        >
                                            <option value="normal">Standard (11pt / 12pt Times New Roman)</option>
                                            <option value="large">Large Print (13pt / 14pt Easy-to-Read)</option>
                                            <option value="compact">Compact Print (10pt)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* BLUEPRINT SUMMARY & LAUNCH BAR */}
                    <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', color: '#ffffff', padding: '1.5rem 2rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem', boxShadow: '0 8px 24px rgba(79, 70, 229, 0.25)' }}>
                        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '700' }}>TOTAL MARKS</span>
                                <div style={{ fontSize: '2rem', fontWeight: '900', color: '#ffffff', lineHeight: 1 }}>{totalMarks}</div>
                            </div>
                            <div style={{ height: '36px', width: '1px', background: 'rgba(255,255,255,0.2)' }} />
                            <div>
                                <span style={{ fontSize: '0.75rem', color: '#a5b4fc', fontWeight: '600' }}>Blueprint Summary</span>
                                <div style={{ fontSize: '0.95rem', fontWeight: '700' }}>
                                    {mcqCount} MCQs + {shortAttempt}/{shortCount} Short Qs + {longAttempt}/{longCount} Long Qs
                                </div>
                            </div>
                            <div style={{ height: '36px', width: '1px', background: 'rgba(255,255,255,0.2)' }} />
                            <div>
                                <span style={{ fontSize: '0.75rem', color: '#a5b4fc', fontWeight: '600' }}>Syllabus Scope</span>
                                <div style={{ fontSize: '0.95rem', fontWeight: '700' }}>
                                    {selectedSubject} (Class {selectedClass}) &bull; {selectedChapters.length} Chapters
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleGeneratePaper}
                            disabled={isGenerating}
                            style={{
                                padding: '0.9rem 2.25rem',
                                borderRadius: '12px',
                                fontWeight: '800',
                                fontSize: '1.05rem',
                                cursor: isGenerating ? 'not-allowed' : 'pointer',
                                background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                                color: '#ffffff',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.6rem',
                                boxShadow: '0 4px 16px rgba(236, 72, 153, 0.4)'
                            }}
                        >
                            {isGenerating ? (
                                <>
                                    <RefreshCw className="animate-spin" size={20} />
                                    Synthesizing Paper...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={20} />
                                    1-Click Generate Paper Now
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* VIEW 2: LIVE BOARD-STANDARD PAPER CANVAS (Printable) */}
            {activeView === 'preview' && generatedPaper && (
                <div style={{ maxWidth: '850px', margin: '0 auto' }}>
                    {/* Floating Controls Bar (Hidden on Print) */}
                    <div className="no-print" style={{ background: '#1e293b', color: '#f8fafc', padding: '0.75rem 1.25rem', borderRadius: '12px', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                            <span style={{ padding: '0.2rem 0.5rem', background: '#3b82f6', borderRadius: '4px', fontWeight: '700' }}>Live Preview</span>
                            <span>Click <strong>"🔄 Swap"</strong> next to any question to instantly pick an alternate from the bank.</span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                onClick={handleDownloadPdf}
                                disabled={isDownloadingPdf}
                                style={{ padding: '0.45rem 1rem', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '700', fontSize: '0.8rem', cursor: isDownloadingPdf ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                                {isDownloadingPdf ? (
                                    <>
                                        <RefreshCw className="animate-spin" size={14} />
                                        Generating PDF...
                                    </>
                                ) : (
                                    <>
                                        <Download size={14} />
                                        Download PDF
                                    </>
                                )}
                            </button>

                            <button
                                onClick={handlePrintPaper}
                                style={{ padding: '0.45rem 1rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                                <Printer size={14} />
                                Print Now
                            </button>
                        </div>
                    </div>

                    {/* PHYSICAL PAPER CANVAS */}
                    <div 
                        ref={printRef}
                        className="printable-paper" 
                        style={{ 
                            background: '#ffffff', 
                            padding: '2.5rem 3rem', 
                            borderRadius: '8px', 
                            border: '1px solid #cbd5e1', 
                            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                            fontFamily: '"Times New Roman", Times, serif',
                            color: '#000000',
                            position: 'relative'
                        }}
                    >
                        {/* Optional Watermark */}
                        {generatedPaper.showWatermark && (
                            <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%) rotate(-35deg)',
                                fontSize: '4.5rem',
                                fontWeight: '900',
                                color: 'rgba(0, 0, 0, 0.04)',
                                whiteSpace: 'nowrap',
                                pointerEvents: 'none',
                                zIndex: 0,
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em'
                            }}>
                                {schoolInfo.name}
                            </div>
                        )}

                        {/* SCHOOL HEADER */}
                        <div className="school-header" style={{ textAlign: 'center', borderBottom: '2px solid #000000', paddingBottom: '0.75rem', marginBottom: '1rem', position: 'relative', zIndex: 1, breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                            <h1 style={{ fontSize: '1.75rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                                {schoolInfo.name}
                            </h1>
                            <p style={{ fontSize: '0.85rem', margin: '0.15rem 0', fontStyle: 'italic' }}>
                                {schoolInfo.address} {schoolInfo.contact ? `| Ph: ${schoolInfo.contact}` : ''}
                            </p>
                            <h2 style={{ fontSize: '1.15rem', fontWeight: '700', margin: '0.35rem 0 0', textDecoration: 'underline' }}>
                                {generatedPaper.examTitle} ({generatedPaper.academicSession})
                            </h2>
                        </div>

                        {/* STUDENT & EXAM METADATA BOX */}
                        <div className="paper-meta-box" style={{ border: '1px solid #000000', padding: '0.5rem 0.75rem', marginBottom: '1.25rem', fontSize: '0.9rem', lineHeight: '1.5', position: 'relative', zIndex: 1, breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.35rem' }}>
                                <div><strong>Student Name:</strong> ______________________</div>
                                <div><strong>Roll No:</strong> ____________</div>
                                <div><strong>Date:</strong> {generatedPaper.examDate}</div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.5rem' }}>
                                <div><strong>Class:</strong> {generatedPaper.class}th &nbsp;|&nbsp; <strong>Subject:</strong> {generatedPaper.subject}</div>
                                <div><strong>Time Allowed:</strong> {generatedPaper.timeAllowed}</div>
                                <div><strong>Total Marks:</strong> {generatedPaper.totalMarks}</div>
                            </div>
                        </div>

                        {/* INSTRUCTIONS */}
                        {generatedPaper.instructions && (
                            <div style={{ fontSize: '0.8rem', fontStyle: 'italic', marginBottom: '1rem', borderBottom: '1px dashed #cbd5e1', paddingBottom: '0.5rem' }}>
                                <strong>Instructions:</strong> {generatedPaper.instructions}
                            </div>
                        )}

                        {/* SECTION A: OBJECTIVE / MCQs */}
                        {generatedPaper.mcqs?.length > 0 && (
                            <div style={{ marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
                                <div className="paper-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #000', paddingBottom: '0.25rem', marginBottom: '0.75rem', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', margin: 0, textTransform: 'uppercase' }}>
                                        Section - A (Objective Type / MCQs)
                                    </h3>
                                    <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>
                                        [Marks: {generatedPaper.mcqs.length * mcqMarksEach}]
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.75rem' }}>
                                    <strong>Q.1:</strong> Choose the correct option for each of the following questions. Each question carries {mcqMarksEach} mark.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    {generatedPaper.mcqs.map((q, idx) => (
                                        <div key={q.id || idx} className="question-item" style={{ breakInside: 'avoid', pageBreakInside: 'avoid', marginBottom: '0.35rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div style={{ fontSize: '0.92rem', fontWeight: '600', flex: 1 }}>
                                                    <strong>({idx + 1})</strong> {q.question}
                                                    {generatedPaper.languageMode !== 'english' && q.questionUrdu && (
                                                        <div dir="rtl" style={{ direction: 'rtl', textAlign: 'right', fontSize: '0.9rem', fontWeight: 'normal', marginTop: '0.15rem', unicodeBidi: 'plaintext' }}>
                                                            {q.questionUrdu}
                                                        </div>
                                                    )}
                                                </div>

                                                <button
                                                    onClick={() => handleSwapQuestion('mcq', idx)}
                                                    data-html2canvas-ignore="true"
                                                    className="no-print"
                                                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: '#4f46e5', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.5rem' }}
                                                    title="Swap with alternate question from bank"
                                                >
                                                    <RefreshCw size={11} /> Swap
                                                </button>
                                            </div>

                                            {/* Options Grid */}
                                            {q.options?.length > 0 && (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginTop: '0.35rem', paddingLeft: '1.25rem', fontSize: '0.88rem' }}>
                                                    {q.options.map((opt, oIdx) => (
                                                        <div key={oIdx}>
                                                            <strong>({String.fromCharCode(65 + oIdx)})</strong> {opt}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* SECTION B: SHORT QUESTIONS */}
                        {generatedPaper.shorts?.length > 0 && (
                            <div style={{ marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
                                <div className="paper-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #000', paddingBottom: '0.25rem', marginBottom: '0.75rem', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', margin: 0, textTransform: 'uppercase' }}>
                                        Section - B (Short Questions)
                                    </h3>
                                    <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>
                                        [Marks: {generatedPaper.shortAttempt * shortMarksEach}]
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.75rem' }}>
                                    <strong>Q.2:</strong> Answer any <strong>{generatedPaper.shortAttempt}</strong> out of the following <strong>{generatedPaper.shorts.length}</strong> questions. Each carries {shortMarksEach} marks.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {generatedPaper.shorts.map((q, idx) => (
                                        <div key={q.id || idx} className="question-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', breakInside: 'avoid', pageBreakInside: 'avoid', marginBottom: '0.25rem' }}>
                                            <div style={{ fontSize: '0.92rem', flex: 1 }}>
                                                <strong>(i{idx === 0 ? '' : idx + 1})</strong> {q.question}
                                                {generatedPaper.languageMode !== 'english' && q.questionUrdu && (
                                                    <div dir="rtl" style={{ direction: 'rtl', textAlign: 'right', fontSize: '0.9rem', marginTop: '0.15rem', unicodeBidi: 'plaintext' }}>
                                                        {q.questionUrdu}
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => handleSwapQuestion('short', idx)}
                                                data-html2canvas-ignore="true"
                                                className="no-print"
                                                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: '#4f46e5', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.5rem' }}
                                                title="Swap question"
                                            >
                                                <RefreshCw size={11} /> Swap
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* SECTION C: LONG / DETAILED QUESTIONS */}
                        {generatedPaper.longs?.length > 0 && (
                            <div style={{ marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
                                <div className="paper-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #000', paddingBottom: '0.25rem', marginBottom: '0.75rem', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', margin: 0, textTransform: 'uppercase' }}>
                                        Section - C (Long / Descriptive Questions)
                                    </h3>
                                    <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>
                                        [Marks: {generatedPaper.longAttempt * longMarksEach}]
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.75rem' }}>
                                    <strong>Note:</strong> Attempt any <strong>{generatedPaper.longAttempt}</strong> out of the following <strong>{generatedPaper.longs.length}</strong> questions. Each carries {longMarksEach} marks.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    {generatedPaper.longs.map((q, idx) => (
                                        <div key={q.id || idx} className="question-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', breakInside: 'avoid', pageBreakInside: 'avoid', marginBottom: '0.35rem' }}>
                                            <div style={{ fontSize: '0.92rem', flex: 1 }}>
                                                <strong>Q.{idx + 3}:</strong> {q.question}
                                                {generatedPaper.languageMode !== 'english' && q.questionUrdu && (
                                                    <div dir="rtl" style={{ direction: 'rtl', textAlign: 'right', fontSize: '0.9rem', marginTop: '0.15rem', unicodeBidi: 'plaintext' }}>
                                                        {q.questionUrdu}
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => handleSwapQuestion('long', idx)}
                                                data-html2canvas-ignore="true"
                                                className="no-print"
                                                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: '#4f46e5', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.5rem' }}
                                                title="Swap question"
                                            >
                                                <RefreshCw size={11} /> Swap
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* TEACHER ANSWER KEY & MARKING GUIDE (Optional Toggle / Page 2) */}
                        {showAnswerKey && (
                            <div className="paper-answer-key" style={{ marginTop: '2.5rem', borderTop: '2px dashed #000000', paddingTop: '1.5rem', breakBefore: 'page', pageBreakBefore: 'always', position: 'relative', zIndex: 1 }}>
                                <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                                    <h3 style={{ fontSize: '1.2rem', fontWeight: '800', textTransform: 'uppercase', margin: 0 }}>
                                        Teacher Grading Guide & Solution Key
                                    </h3>
                                    <p style={{ fontSize: '0.85rem', fontStyle: 'italic', margin: '0.2rem 0' }}>
                                        Confidential - For Teacher Evaluation & Marking Reference Only
                                    </p>
                                </div>

                                {/* MCQ Solutions */}
                                {generatedPaper.mcqs?.length > 0 && (
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <h4 style={{ fontSize: '0.95rem', fontWeight: '700', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.25rem', marginBottom: '0.5rem' }}>
                                            Section A: MCQ Answer Keys
                                        </h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
                                            {generatedPaper.mcqs.map((q, idx) => (
                                                <div key={idx} style={{ border: '1px solid #cbd5e1', padding: '0.3rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                                                    <strong>Q{idx + 1}:</strong> {q.correctAnswer}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Short Questions Key Points */}
                                {generatedPaper.shorts?.length > 0 && (
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <h4 style={{ fontSize: '0.95rem', fontWeight: '700', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.25rem', marginBottom: '0.5rem' }}>
                                            Section B: Short Question Marking Scheme
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                                            {generatedPaper.shorts.map((q, idx) => (
                                                <div key={idx} style={{ background: '#f8fafc', padding: '0.4rem 0.6rem', borderRadius: '4px', borderLeft: '3px solid #10b981' }}>
                                                    <strong>(i{idx === 0 ? '' : idx + 1}) Key Points:</strong> {q.correctAnswer || 'Accurate definition with 1 example.'}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Scoped CSS for Perfect A4 Printing */}
            <style>{`
                @media print {
                    body {
                        background: #ffffff !important;
                        color: #000000 !important;
                    }
                    .no-print, .sidebar, nav, header, button, [data-html2canvas-ignore="true"] {
                        display: none !important;
                    }
                    .printable-paper {
                        box-shadow: none !important;
                        border: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                    }
                    .question-item, .paper-section-header, .paper-meta-box, .school-header {
                        break-inside: avoid !important;
                        page-break-inside: avoid !important;
                    }
                    @page {
                        size: A4 portrait;
                        margin: 12mm 15mm 15mm 15mm;
                    }
                }
            `}</style>
        </div>
    );
};

export default PaperGenerator;
