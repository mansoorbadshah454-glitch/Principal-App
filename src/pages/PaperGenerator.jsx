import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    FileCheck, Sparkles, Printer, RefreshCw, ChevronRight, 
    BookOpen, Layers, CheckSquare, Settings2, Sliders, 
    Trash2, Edit3, Plus, ArrowLeftRight, Check, Eye, EyeOff, 
    HelpCircle, Award, FileText, School, Download, AlertTriangle,
    Clock, Calendar, CheckCircle2, Copy, Shield, Bookmark, LayoutGrid, ListFilter,
    Loader2, AlertCircle, ChevronDown, MoveUp, MoveDown, Type, AlignLeft,
    FileSpreadsheet, Sparkle, X, Moon, Sun, ZoomIn, ZoomOut, File
} from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { getDocsFast } from '../utils/cacheUtils';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const COMPREHENSIVE_SUBJECTS = [
    'Urdu', 'Islamiat', 'Islamiyat', 'Tarjuma-tul-Quran', 'Nazra Quran', 'Arabic', 
    'English', 'Mathematics', 'General Science', 'Physics', 'Chemistry', 'Biology', 
    'Computer Science', 'Pak Studies', 'Social Studies', 'General Knowledge', 'Geography', 
    'History', 'Sindhi', 'Pashto', 'Ethics / Akhlaqiat', 'Economics', 'Accounting', 
    'Commerce', 'Civics', 'Home Economics', 'Arts & Drawing'
];

const EXAM_PRESETS = [
    { id: 'primary_worksheet', name: 'Primary School Worksheet (25 Marks)', badge: 'Class 1-5', totalMarks: 25, timeAllowed: '45 Minutes', mcqCount: 5, mcqMarksEach: 1, blankCount: 5, blankMarksEach: 1, tfCount: 5, tfMarksEach: 1, shortCount: 5, shortAttempt: 5, shortMarksEach: 2, longCount: 0, longAttempt: 0, longMarksEach: 0, showAnswerLines: true, defaultPages: 1 },
    { id: 'monthly_test', name: 'Monthly Class Test (25 Marks)', badge: 'Class 6-10', totalMarks: 25, timeAllowed: '45 Minutes', mcqCount: 5, mcqMarksEach: 1, blankCount: 0, blankMarksEach: 1, tfCount: 0, tfMarksEach: 1, shortCount: 6, shortAttempt: 4, shortMarksEach: 2, longCount: 2, longAttempt: 1, longMarksEach: 6, showAnswerLines: false, defaultPages: 2 },
    { id: 'mid_term', name: 'Mid Term Exam (50 Marks)', badge: 'Standard 50M', totalMarks: 50, timeAllowed: '1 Hour 30 Mins', mcqCount: 10, mcqMarksEach: 1, blankCount: 0, blankMarksEach: 1, tfCount: 0, tfMarksEach: 1, shortCount: 8, shortAttempt: 6, shortMarksEach: 3, longCount: 3, longAttempt: 2, longMarksEach: 6, showAnswerLines: false, defaultPages: 2 },
    { id: 'final_board', name: 'Annual / Board Pattern (75 Marks)', badge: 'Board 75M', totalMarks: 75, timeAllowed: '3 Hours', mcqCount: 15, mcqMarksEach: 1, blankCount: 0, blankMarksEach: 1, tfCount: 0, tfMarksEach: 1, shortCount: 15, shortAttempt: 10, shortMarksEach: 2, longCount: 5, longAttempt: 3, longMarksEach: 8, showAnswerLines: false, defaultPages: 2 },
    { id: 'grand_test', name: 'Grand Test / Pre-Board (100 Marks)', badge: 'Pre-Board 100M', totalMarks: 100, timeAllowed: '3 Hours', mcqCount: 20, mcqMarksEach: 1, blankCount: 0, blankMarksEach: 1, tfCount: 0, tfMarksEach: 1, shortCount: 18, shortAttempt: 12, shortMarksEach: 2, longCount: 6, longAttempt: 4, longMarksEach: 8, showAnswerLines: false, defaultPages: 3 }
];

const PaperGenerator = () => {
    // School & Auth state
    const [schoolId, setSchoolId] = useState(null);
    const [schoolInfo, setSchoolInfo] = useState({
        name: 'The Superior Academy & High School',
        address: 'Main Campus, Educational Complex',
        contact: '+92 300 1234567',
        logoUrl: null
    });

    // Real Firestore Classes & Subjects
    const [classes, setClasses] = useState([]);
    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedClassName, setSelectedClassName] = useState('');
    const [availableSubjects, setAvailableSubjects] = useState([]);
    const [selectedSubject, setSelectedSubject] = useState('');

    // Real Firestore Chapters (From Upload Syllabus)
    const [firestoreChapters, setFirestoreChapters] = useState([]);
    const [loadingChapters, setLoadingChapters] = useState(false);
    const [selectedChapterIds, setSelectedChapterIds] = useState([]);

    // UI Tab for Left Studio Sidebar
    const [leftActiveTab, setLeftActiveTab] = useState('add_questions'); // 'add_questions' | 'blueprint' | 'chapters' | 'settings'

    // Multi-Page Canvas Controls
    const [pageCountMode, setPageCountMode] = useState(2); // 1 | 2 | 3 pages
    const [activePageTab, setActivePageTab] = useState('all'); // 'all' | 1 | 2 | 3
    const [canvasZoom, setCanvasZoom] = useState(100); // 75 | 90 | 100

    // Exam Header & Metadata
    const [examTitle, setExamTitle] = useState('First Term Examination 2026');
    const [academicSession, setAcademicSession] = useState('2025-2026');
    const [campusName, setCampusName] = useState('Main Campus');
    const [classSection, setClassSection] = useState('Section A');
    const [examDate, setExamDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [timeAllowed, setTimeAllowed] = useState('1 Hour 30 Minutes');
    const [instructions, setInstructions] = useState('Use blue or black pen only. Overwriting or cutting in Section-A (Objective) will result in zero marks.');
    const [showWatermark, setShowWatermark] = useState(true);
    const [showSchoolLogo, setShowSchoolLogo] = useState(true);

    // Exam Blueprint & Preset
    const [selectedPreset, setSelectedPreset] = useState('mid_term');
    const [mcqMarksEach, setMcqMarksEach] = useState(1);
    const [blankMarksEach, setBlankMarksEach] = useState(1);
    const [tfMarksEach, setTfMarksEach] = useState(1);
    const [shortAttempt, setShortAttempt] = useState(6);
    const [shortMarksEach, setShortMarksEach] = useState(3);
    const [showAnswerLines, setShowAnswerLines] = useState(false);
    const [answerLineCount, setAnswerLineCount] = useState(2);
    const [longAttempt, setLongAttempt] = useState(2);
    const [longMarksEach, setLongMarksEach] = useState(6);

    // Typesetting & Layout
    const [languageMode, setLanguageMode] = useState('bilingual');
    const [paperStyle, setPaperStyle] = useState('board_standard');
    const [fontSize, setFontSize] = useState('normal'); // 'compact' | 'normal' | 'large'
    const [mcqLayout, setMcqLayout] = useState('4_col'); // '2_col' | '4_col'
    const [urduOptionFormat, setUrduOptionFormat] = useState('alif_bay');

    // Live Paper State (Always Active on Canvas)
    const [paperQuestions, setPaperQuestions] = useState({
        mcqs: [],
        blanks: [],
        true_false: [],
        shorts: [],
        longs: []
    });

    // Unassigned pool from syllabus for swapping & adding
    const [availablePool, setAvailablePool] = useState({
        mcqs: [],
        blanks: [],
        true_false: [],
        shorts: [],
        longs: []
    });

    const [isGenerating, setIsGenerating] = useState(false);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

    // Editing modal state for editing any question
    const [editingQuestion, setEditingQuestion] = useState(null); // { type, index, data }

    const pagesContainerRef = useRef(null);

    // Helper: Extract Chapter Number
    const extractChapterNumber = (title) => {
        if (!title) return 999;
        const match = title.match(/(?:chapter|unit|ch|sabaq|unwan)?\s*(\d+)/i) || title.match(/\d+/);
        return match ? parseInt(match[1] || match[0], 10) : 999;
    };

    // Helper: Accurately detect if text is Urdu/Arabic
    const isUrduText = (text, subject = '') => {
        if (!text) return false;
        const isUrduSubject = /^(urdu|islamiat|islamiyat|arabic|sindhi|pashto|tarjuma)/i.test((subject || '').trim());
        const urduChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
        const latinChars = (text.match(/[a-zA-Z]/g) || []).length;

        if (urduChars > latinChars && urduChars > 3) return true;
        if (latinChars === 0 && urduChars > 0) return true;
        if (isUrduSubject && latinChars < 5 && urduChars > 0) return true;
        return false;
    };

    // Dynamic pool from currently selected chapters in Firestore
    const selectedChapterObjs = useMemo(() => {
        return firestoreChapters.filter(c => selectedChapterIds.includes(c.id));
    }, [firestoreChapters, selectedChapterIds]);

    const allSyllabusQuestions = useMemo(() => {
        return selectedChapterObjs.flatMap(c => (c.questions || []).map(q => ({
            ...q,
            chapterId: c.id,
            chapterTitle: c.title
        })));
    }, [selectedChapterObjs]);

    const syllabusCounts = useMemo(() => {
        return {
            mcq: allSyllabusQuestions.filter(q => q.type === 'mcq').length,
            blank: allSyllabusQuestions.filter(q => q.type === 'blank').length,
            true_false: allSyllabusQuestions.filter(q => q.type === 'true_false').length,
            short: allSyllabusQuestions.filter(q => q.type === 'short' || (!q.type && q.type !== 'mcq' && q.type !== 'long' && q.type !== 'blank' && q.type !== 'true_false')).length,
            long: allSyllabusQuestions.filter(q => q.type === 'long').length,
            total: allSyllabusQuestions.length
        };
    }, [allSyllabusQuestions]);

    // Live Total Marks calculation based on actual questions currently placed on canvas
    const actualShortAttempt = Math.min(shortAttempt, paperQuestions.shorts.length || 0);
    const actualLongAttempt = Math.min(longAttempt, paperQuestions.longs.length || 0);

    const totalMarks = useMemo(() => {
        const mcqTotal = paperQuestions.mcqs.length * mcqMarksEach;
        const blankTotal = paperQuestions.blanks.length * blankMarksEach;
        const tfTotal = paperQuestions.true_false.length * tfMarksEach;
        const shortTotal = (actualShortAttempt > 0 ? actualShortAttempt : paperQuestions.shorts.length) * shortMarksEach;
        const longTotal = (actualLongAttempt > 0 ? actualLongAttempt : paperQuestions.longs.length) * longMarksEach;
        return mcqTotal + blankTotal + tfTotal + shortTotal + longTotal;
    }, [paperQuestions, mcqMarksEach, blankMarksEach, tfMarksEach, shortMarksEach, longMarksEach, actualShortAttempt, actualLongAttempt]);

    // Ensure full-bleed zero padding on .main-content while on Paper Generator
    useEffect(() => {
        const mainEl = document.querySelector('.main-content');
        if (mainEl) {
            const prevPadding = mainEl.style.padding;
            const prevBg = mainEl.style.backgroundColor;
            mainEl.style.padding = '0px';
            mainEl.style.backgroundColor = '#0b0f19';
            return () => {
                mainEl.style.padding = prevPadding;
                mainEl.style.backgroundColor = prevBg;
            };
        }
    }, []);

    // 1. Resolve School Details & Classes from Firestore
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

                    // Fetch School Classes
                    const classesSnap = await getDocsFast(collection(db, 'schools', sId, 'classes'));
                    const list = classesSnap.docs.map(d => ({
                        id: d.id,
                        name: d.data().name || d.id,
                        subjects: Array.isArray(d.data().subjects) ? d.data().subjects : []
                    }));
                    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
                    setClasses(list);

                    if (list.length > 0) {
                        setSelectedClassId(list[0].id);
                        setSelectedClassName(list[0].name);
                    }
                } catch (err) {
                    console.log("Error loading school profile/classes:", err);
                }
            }
        };

        resolveSchool();
    }, []);

    // 2. Update Subjects when Class changes
    useEffect(() => {
        if (!selectedClassId) {
            setAvailableSubjects([]);
            setSelectedSubject('');
            setSelectedClassName('');
            return;
        }
        const currentClass = classes.find(c => c.id === selectedClassId);
        if (currentClass) {
            setSelectedClassName(currentClass.name);
            const classSubjects = Array.isArray(currentClass.subjects) ? currentClass.subjects : [];
            setAvailableSubjects(classSubjects);
            
            if (classSubjects.length > 0) {
                setSelectedSubject(prev => classSubjects.includes(prev) ? prev : classSubjects[0]);
            } else {
                setSelectedSubject('');
            }

            const classNameLower = (currentClass.name || '').toLowerCase();
            const isPrimary = /\b(1|2|3|4|5|nursery|kg|prep|primary|playgroup)\b/.test(classNameLower);
            if (isPrimary && (selectedPreset === 'mid_term' || selectedPreset === 'final_board')) {
                handleApplyPreset('primary_worksheet');
            }
        }
    }, [selectedClassId, classes]);

    // 3. Fetch Real Chapters from Firestore
    useEffect(() => {
        const fetchSyllabusChapters = async () => {
            if (!schoolId || !selectedClassId || !selectedSubject) {
                setFirestoreChapters([]);
                setSelectedChapterIds([]);
                return;
            }

            setLoadingChapters(true);
            try {
                const chapRef = collection(db, 'schools', schoolId, 'classes', selectedClassId, 'syllabus', selectedSubject, 'chapters');
                const snap = await getDocs(chapRef);
                const list = snap.docs.map(d => ({
                    id: d.id,
                    ...d.data(),
                    num: extractChapterNumber(d.data().title)
                }));

                list.sort((a, b) => a.num - b.num);
                setFirestoreChapters(list);
                setSelectedChapterIds(list.map(c => c.id));
            } catch (err) {
                console.error("Error fetching chapters from Firestore:", err);
                setFirestoreChapters([]);
            } finally {
                setLoadingChapters(false);
            }
        };

        fetchSyllabusChapters();
    }, [schoolId, selectedClassId, selectedSubject]);

    // Apply Preset parameters
    const handleApplyPreset = (presetId) => {
        setSelectedPreset(presetId);
        const preset = EXAM_PRESETS.find(p => p.id === presetId);
        if (preset) {
            setTimeAllowed(preset.timeAllowed);
            setMcqMarksEach(preset.mcqMarksEach);
            setBlankMarksEach(preset.blankMarksEach || 1);
            setTfMarksEach(preset.tfMarksEach || 1);
            setShortAttempt(preset.shortAttempt);
            setShortMarksEach(preset.shortMarksEach);
            setLongAttempt(preset.longAttempt);
            setLongMarksEach(preset.longMarksEach);
            if (preset.defaultPages) {
                setPageCountMode(preset.defaultPages);
            }
            if (typeof preset.showAnswerLines === 'boolean') {
                setShowAnswerLines(preset.showAnswerLines);
            }
        }
    };

    // Auto-generate or populate paper whenever chapters/questions are loaded
    const buildPaperFromSyllabus = (customCounts = null) => {
        if (allSyllabusQuestions.length === 0) {
            return;
        }

        const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

        let mcqPool = shuffle(allSyllabusQuestions.filter(q => q.type === 'mcq'));
        let blankPool = shuffle(allSyllabusQuestions.filter(q => q.type === 'blank'));
        let tfPool = shuffle(allSyllabusQuestions.filter(q => q.type === 'true_false'));
        let shortPool = shuffle(allSyllabusQuestions.filter(q => q.type === 'short' || (!q.type && q.type !== 'mcq' && q.type !== 'long' && q.type !== 'blank' && q.type !== 'true_false')));
        let longPool = shuffle(allSyllabusQuestions.filter(q => q.type === 'long'));

        const preset = EXAM_PRESETS.find(p => p.id === selectedPreset) || EXAM_PRESETS[2];

        const targetMcqs = customCounts?.mcqCount ?? Math.min(preset.mcqCount, mcqPool.length);
        const targetBlanks = customCounts?.blankCount ?? Math.min(preset.blankCount || 0, blankPool.length);
        const targetTfs = customCounts?.tfCount ?? Math.min(preset.tfCount || 0, tfPool.length);
        const targetShorts = customCounts?.shortCount ?? Math.min(preset.shortCount, shortPool.length);
        const targetLongs = customCounts?.longCount ?? Math.min(preset.longCount, longPool.length);

        setPaperQuestions({
            mcqs: mcqPool.slice(0, targetMcqs),
            blanks: blankPool.slice(0, targetBlanks),
            true_false: tfPool.slice(0, targetTfs),
            shorts: shortPool.slice(0, targetShorts),
            longs: longPool.slice(0, targetLongs)
        });

        setAvailablePool({
            mcqs: mcqPool.slice(targetMcqs),
            blanks: blankPool.slice(targetBlanks),
            true_false: tfPool.slice(targetTfs),
            shorts: shortPool.slice(targetShorts),
            longs: longPool.slice(targetLongs)
        });
    };

    // Trigger initial population when chapters change
    useEffect(() => {
        if (allSyllabusQuestions.length > 0) {
            buildPaperFromSyllabus();
        }
    }, [allSyllabusQuestions.length]);

    // Quick Add Question to Canvas
    const handleAddQuestionToSection = (type) => {
        let poolKey = type === 'mcq' ? 'mcqs' : type === 'blank' ? 'blanks' : type === 'true_false' ? 'true_false' : type === 'short' ? 'shorts' : 'longs';
        const currentPool = [...(availablePool[poolKey] || [])];
        let newQ = null;

        if (currentPool.length > 0) {
            newQ = currentPool.shift();
            setAvailablePool(prev => ({
                ...prev,
                [poolKey]: currentPool
            }));
        } else {
            const placeholderNumber = (paperQuestions[poolKey]?.length || 0) + 1;
            if (type === 'mcq') {
                newQ = {
                    id: 'custom_' + Date.now(),
                    type: 'mcq',
                    question: `Sample MCQ Question ${placeholderNumber} (Click edit icon to customize)`,
                    options: ['Option A', 'Option B', 'Option C', 'Option D'],
                    correctAnswer: 'Option A'
                };
            } else if (type === 'blank') {
                newQ = {
                    id: 'custom_' + Date.now(),
                    type: 'blank',
                    question: `The capital of Pakistan is ______________________.`,
                    correctAnswer: 'Islamabad'
                };
            } else if (type === 'true_false') {
                newQ = {
                    id: 'custom_' + Date.now(),
                    type: 'true_false',
                    question: `Sound travels faster in air than in water. (T/F)`,
                    correctAnswer: 'False'
                };
            } else if (type === 'short') {
                newQ = {
                    id: 'custom_' + Date.now(),
                    type: 'short',
                    question: `Define and state the formula for Question ${placeholderNumber}?`,
                    correctAnswer: ''
                };
            } else {
                newQ = {
                    id: 'custom_' + Date.now(),
                    type: 'long',
                    question: `Explain in detail with diagram: Topic ${placeholderNumber}.`,
                    correctAnswer: ''
                };
            }
        }

        setPaperQuestions(prev => ({
            ...prev,
            [poolKey]: [...prev[poolKey], newQ]
        }));
    };

    // Remove single question from paper
    const handleRemoveQuestion = (type, index) => {
        let poolKey = type === 'mcq' ? 'mcqs' : type === 'blank' ? 'blanks' : type === 'true_false' ? 'true_false' : type === 'short' ? 'shorts' : 'longs';
        const removed = paperQuestions[poolKey][index];
        const updatedList = paperQuestions[poolKey].filter((_, i) => i !== index);

        setPaperQuestions(prev => ({
            ...prev,
            [poolKey]: updatedList
        }));

        if (removed && removed.chapterId) {
            setAvailablePool(prev => ({
                ...prev,
                [poolKey]: [removed, ...(prev[poolKey] || [])]
            }));
        }
    };

    // Swap single question with alternate from pool
    const handleSwapQuestion = (type, index) => {
        let poolKey = type === 'mcq' ? 'mcqs' : type === 'blank' ? 'blanks' : type === 'true_false' ? 'true_false' : type === 'short' ? 'shorts' : 'longs';
        let currentPool = [...(availablePool[poolKey] || [])];
        let currentList = [...(paperQuestions[poolKey] || [])];

        if (currentPool.length === 0) {
            alert(`No more alternate ${type.toUpperCase().replace('_', ' ')} questions available in the current scanned chapter pool.`);
            return;
        }

        const oldQuestion = currentList[index];
        const newQuestion = currentPool.shift();
        currentPool.push(oldQuestion);

        currentList[index] = newQuestion;

        setPaperQuestions(prev => ({
            ...prev,
            [poolKey]: currentList
        }));

        setAvailablePool(prev => ({
            ...prev,
            [poolKey]: currentPool
        }));
    };

    // Move question Up or Down
    const handleMoveQuestion = (type, index, direction) => {
        let poolKey = type === 'mcq' ? 'mcqs' : type === 'blank' ? 'blanks' : type === 'true_false' ? 'true_false' : type === 'short' ? 'shorts' : 'longs';
        const list = [...paperQuestions[poolKey]];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= list.length) return;

        const temp = list[index];
        list[index] = list[targetIndex];
        list[targetIndex] = temp;

        setPaperQuestions(prev => ({
            ...prev,
            [poolKey]: list
        }));
    };

    // Save edited question
    const handleSaveEditedQuestion = () => {
        if (!editingQuestion) return;
        const { type, index, data } = editingQuestion;
        let poolKey = type === 'mcq' ? 'mcqs' : type === 'blank' ? 'blanks' : type === 'true_false' ? 'true_false' : type === 'short' ? 'shorts' : 'longs';
        
        const list = [...paperQuestions[poolKey]];
        list[index] = { ...data };

        setPaperQuestions(prev => ({
            ...prev,
            [poolKey]: list
        }));

        setEditingQuestion(null);
    };

    // Download High-Fidelity Multi-Page PDF Document
    const handleDownloadPdf = async () => {
        if (!pagesContainerRef.current) return;
        setIsDownloadingPdf(true);
        const originalZoom = pagesContainerRef.current.style.zoom;
        try {
            pagesContainerRef.current.style.zoom = '100%';
            const pageElements = Array.from(pagesContainerRef.current.querySelectorAll('.printable-paper-sheet'));
            if (pageElements.length === 0) return;

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            for (let i = 0; i < pageElements.length; i++) {
                if (i > 0) pdf.addPage();
                const pageEl = pageElements[i];

                const canvas = await html2canvas(pageEl, {
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

                const pageImgData = canvas.toDataURL('image/jpeg', 0.98);
                pdf.addImage(pageImgData, 'JPEG', 0, 0, 210, 297);
            }

            const cleanSubject = (selectedSubject || 'Subject').replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `${schoolInfo.name.replace(/[^a-zA-Z0-9]/g, '_')}_Class${selectedClassName}_${cleanSubject}_ExamPaper.pdf`;
            pdf.save(fileName);
        } catch (err) {
            console.error("PDF download error:", err);
            window.print();
        } finally {
            if (pagesContainerRef.current) {
                pagesContainerRef.current.style.zoom = originalZoom || '100%';
            }
            setIsDownloadingPdf(false);
        }
    };

    const handlePrintPaper = () => {
        window.print();
    };

    // Render Section A: MCQs
    const renderSectionA = () => {
        if (paperQuestions.mcqs.length === 0) return null;
        return (
            <div style={{ marginBottom: '1.25rem', position: 'relative', zIndex: 1 }}>
                <div className="paper-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #000', paddingBottom: '0.2rem', marginBottom: '0.65rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: '800', margin: 0, textTransform: 'uppercase' }}>
                        Section - A (Objective Type / MCQs)
                    </h3>
                    <span style={{ fontWeight: '800', fontSize: '0.9rem' }}>
                        [Marks: {paperQuestions.mcqs.length * mcqMarksEach}]
                    </span>
                </div>
                <p style={{ fontSize: '0.8rem', fontStyle: 'italic', marginBottom: '0.65rem' }}>
                    <strong>Q.1:</strong> Choose the correct option for each of the following questions. Each carries {mcqMarksEach} mark.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    {paperQuestions.mcqs.map((q, idx) => {
                        const isUrduQ = isUrduText(q.question, selectedSubject);
                        const urduAlpha = ['(الف)', '(ب)', '(ج)', '(د)'];

                        return (
                            <div key={q.id || idx} className="question-item canvas-question-hover" style={{ breakInside: 'avoid', marginBottom: '0.2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                    <div 
                                        dir={isUrduQ ? "rtl" : "ltr"}
                                        style={{ 
                                            display: 'flex', 
                                            alignItems: 'baseline', 
                                            gap: '0.4rem', 
                                            flex: 1,
                                            direction: isUrduQ ? 'rtl' : 'ltr',
                                            textAlign: isUrduQ ? 'right' : 'left'
                                        }}
                                    >
                                        <strong style={{ flexShrink: 0, fontSize: isUrduQ ? '1rem' : '0.9rem' }}>({idx + 1})</strong>
                                        <span 
                                            className={isUrduQ ? 'urdu-paper-font' : ''} 
                                            style={{ 
                                                fontSize: isUrduQ ? '1.1rem' : '0.9rem', 
                                                fontWeight: isUrduQ ? '600' : '500', 
                                                lineHeight: isUrduQ ? '2.1' : '1.45',
                                                flex: 1
                                            }}
                                        >
                                            {q.question}
                                        </span>
                                    </div>

                                    {/* Hover Tooling */}
                                    <div className="question-actions no-print" data-html2canvas-ignore="true" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                                        <button
                                            onClick={() => handleSwapQuestion('mcq', idx)}
                                            title="Swap with alternate from bank"
                                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 5px', fontSize: '0.65rem', color: '#1e40af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
                                        >
                                            <RefreshCw size={10} /> Swap
                                        </button>
                                        <button
                                            onClick={() => setEditingQuestion({ type: 'mcq', index: idx, data: { ...q } })}
                                            title="Edit Question Text"
                                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 5px', fontSize: '0.65rem', color: '#334155', cursor: 'pointer' }}
                                        >
                                            <Edit3 size={10} />
                                        </button>
                                        <button
                                            onClick={() => handleMoveQuestion('mcq', idx, 'up')}
                                            disabled={idx === 0}
                                            title="Move Up"
                                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 4px', fontSize: '0.65rem', color: '#64748b', cursor: idx === 0 ? 'not-allowed' : 'pointer' }}
                                        >
                                            <MoveUp size={10} />
                                        </button>
                                        <button
                                            onClick={() => handleMoveQuestion('mcq', idx, 'down')}
                                            disabled={idx === paperQuestions.mcqs.length - 1}
                                            title="Move Down"
                                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 4px', fontSize: '0.65rem', color: '#64748b', cursor: idx === paperQuestions.mcqs.length - 1 ? 'not-allowed' : 'pointer' }}
                                        >
                                            <MoveDown size={10} />
                                        </button>
                                        <button
                                            onClick={() => handleRemoveQuestion('mcq', idx)}
                                            title="Remove Question"
                                            style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '4px', padding: '2px 4px', fontSize: '0.65rem', color: '#dc2626', cursor: 'pointer' }}
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                </div>

                                {q.options?.length > 0 && (
                                    <div 
                                        dir={isUrduQ ? "rtl" : "ltr"}
                                        style={{ 
                                            display: 'grid', 
                                            gridTemplateColumns: mcqLayout === '2_col' ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', 
                                            gap: '0.4rem', 
                                            marginTop: '0.25rem', 
                                            paddingLeft: isUrduQ ? '0' : '1.25rem',
                                            paddingRight: isUrduQ ? '1.25rem' : '0',
                                            fontSize: isUrduQ ? '1rem' : '0.85rem',
                                            direction: isUrduQ ? 'rtl' : 'ltr',
                                            textAlign: isUrduQ ? 'right' : 'left'
                                        }}
                                    >
                                        {q.options.map((opt, oIdx) => (
                                            <div key={oIdx} className={isUrduQ ? 'urdu-paper-font' : ''}>
                                                <strong>
                                                    {isUrduQ && urduOptionFormat === 'alif_bay' 
                                                        ? (urduAlpha[oIdx] || `(${String.fromCharCode(65 + oIdx)})`) 
                                                        : `(${String.fromCharCode(65 + oIdx)})`
                                                    }
                                                </strong> {opt}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Render Section B: Blanks & Section C: True/False
    const renderSectionBC = () => {
        return (
            <>
                {/* Blanks */}
                {paperQuestions.blanks.length > 0 && (
                    <div style={{ marginBottom: '1.25rem', position: 'relative', zIndex: 1 }}>
                        <div className="paper-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #000', paddingBottom: '0.2rem', marginBottom: '0.65rem' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: '800', margin: 0, textTransform: 'uppercase' }}>
                                Section - B: Fill in the Blanks (خالی جگہ پر کریں)
                            </h3>
                            <span style={{ fontWeight: '800', fontSize: '0.9rem' }}>
                                [Marks: {paperQuestions.blanks.length * blankMarksEach}]
                            </span>
                        </div>
                        <p style={{ fontSize: '0.8rem', fontStyle: 'italic', marginBottom: '0.65rem' }}>
                            <strong>Q.2:</strong> Fill in the blanks with suitable answers. Each carries {blankMarksEach} mark.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                            {paperQuestions.blanks.map((q, idx) => {
                                const isUrduQ = isUrduText(q.question, selectedSubject);
                                let displayText = q.question || '';
                                if (!displayText.includes('____')) displayText += ' ______________________';

                                return (
                                    <div key={q.id || idx} className="question-item canvas-question-hover" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', breakInside: 'avoid', marginBottom: '0.2rem', gap: '0.5rem' }}>
                                        <div 
                                            dir={isUrduQ ? "rtl" : "ltr"}
                                            style={{ 
                                                display: 'flex', 
                                                alignItems: 'baseline', 
                                                gap: '0.4rem', 
                                                flex: 1,
                                                direction: isUrduQ ? 'rtl' : 'ltr',
                                                textAlign: isUrduQ ? 'right' : 'left'
                                            }}
                                        >
                                            <strong style={{ flexShrink: 0, fontSize: isUrduQ ? '1rem' : '0.9rem' }}>({idx + 1})</strong>
                                            <span className={isUrduQ ? 'urdu-paper-font' : ''} style={{ fontSize: isUrduQ ? '1.1rem' : '0.9rem', lineHeight: isUrduQ ? '2.1' : '1.45', flex: 1 }}>
                                                {displayText}
                                            </span>
                                        </div>

                                        <div className="question-actions no-print" data-html2canvas-ignore="true" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                                            <button onClick={() => handleSwapQuestion('blank', idx)} title="Swap" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 5px', fontSize: '0.65rem', color: '#059669', cursor: 'pointer' }}>
                                                <RefreshCw size={10} />
                                            </button>
                                            <button onClick={() => setEditingQuestion({ type: 'blank', index: idx, data: { ...q } })} title="Edit" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 5px', fontSize: '0.65rem', color: '#334155', cursor: 'pointer' }}>
                                                <Edit3 size={10} />
                                            </button>
                                            <button onClick={() => handleRemoveQuestion('blank', idx)} title="Remove" style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '4px', padding: '2px 4px', fontSize: '0.65rem', color: '#dc2626', cursor: 'pointer' }}>
                                                <Trash2 size={10} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* True / False */}
                {paperQuestions.true_false.length > 0 && (
                    <div style={{ marginBottom: '1.25rem', position: 'relative', zIndex: 1 }}>
                        <div className="paper-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #000', paddingBottom: '0.2rem', marginBottom: '0.65rem' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: '800', margin: 0, textTransform: 'uppercase' }}>
                                Section - C: True or False (درست یا غلط)
                            </h3>
                            <span style={{ fontWeight: '800', fontSize: '0.9rem' }}>
                                [Marks: {paperQuestions.true_false.length * tfMarksEach}]
                            </span>
                        </div>
                        <p style={{ fontSize: '0.8rem', fontStyle: 'italic', marginBottom: '0.65rem' }}>
                            <strong>Q.3:</strong> Mark <strong>True (T)</strong> or <strong>False (F)</strong> in the box provided.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                            {paperQuestions.true_false.map((q, idx) => {
                                const isUrduQ = isUrduText(q.question, selectedSubject);
                                return (
                                    <div key={q.id || idx} className="question-item canvas-question-hover" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', breakInside: 'avoid', marginBottom: '0.2rem', gap: '0.5rem' }}>
                                        <div 
                                            dir={isUrduQ ? "rtl" : "ltr"}
                                            style={{ 
                                                display: 'flex', 
                                                alignItems: 'baseline', 
                                                gap: '0.4rem', 
                                                flex: 1,
                                                direction: isUrduQ ? 'rtl' : 'ltr',
                                                textAlign: isUrduQ ? 'right' : 'left'
                                            }}
                                        >
                                            <strong style={{ flexShrink: 0, fontSize: isUrduQ ? '1rem' : '0.9rem' }}>({idx + 1})</strong>
                                            <span className={isUrduQ ? 'urdu-paper-font' : ''} style={{ fontSize: isUrduQ ? '1.1rem' : '0.9rem', lineHeight: isUrduQ ? '2.1' : '1.45', flex: 1 }}>
                                                {q.question}
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                                            <span style={{ border: '1.5px solid #000', padding: '1px 10px', borderRadius: '3px', fontSize: '0.8rem', fontWeight: '700', minWidth: '40px', textAlign: 'center' }}>
                                                [&nbsp;&nbsp;&nbsp;&nbsp;]
                                            </span>
                                            <div className="question-actions no-print" data-html2canvas-ignore="true" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                <button onClick={() => handleSwapQuestion('true_false', idx)} title="Swap" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 5px', fontSize: '0.65rem', color: '#7c3aed', cursor: 'pointer' }}>
                                                    <RefreshCw size={10} />
                                                </button>
                                                <button onClick={() => setEditingQuestion({ type: 'true_false', index: idx, data: { ...q } })} title="Edit" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 5px', fontSize: '0.65rem', color: '#334155', cursor: 'pointer' }}>
                                                    <Edit3 size={10} />
                                                </button>
                                                <button onClick={() => handleRemoveQuestion('true_false', idx)} title="Remove" style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '4px', padding: '2px 4px', fontSize: '0.65rem', color: '#dc2626', cursor: 'pointer' }}>
                                                    <Trash2 size={10} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </>
        );
    };

    // Render Section D: Short Questions
    const renderSectionD = () => {
        if (paperQuestions.shorts.length === 0) return null;
        return (
            <div style={{ marginBottom: '1.25rem', position: 'relative', zIndex: 1 }}>
                <div className="paper-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #000', paddingBottom: '0.2rem', marginBottom: '0.65rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: '800', margin: 0, textTransform: 'uppercase' }}>
                        Section - {paperQuestions.blanks.length > 0 || paperQuestions.true_false.length > 0 ? 'D' : 'B'} (Short Questions / مختصر جوابات)
                    </h3>
                    <span style={{ fontWeight: '800', fontSize: '0.9rem' }}>
                        [Marks: {actualShortAttempt * shortMarksEach}]
                    </span>
                </div>
                <p style={{ fontSize: '0.8rem', fontStyle: 'italic', marginBottom: '0.65rem' }}>
                    <strong>Q.4:</strong> Answer any <strong>{actualShortAttempt}</strong> out of the following <strong>{paperQuestions.shorts.length}</strong> questions. Each carries {shortMarksEach} marks.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    {paperQuestions.shorts.map((q, idx) => {
                        const isUrduQ = isUrduText(q.question, selectedSubject);

                        return (
                            <div key={q.id || idx} className="question-item canvas-question-hover" style={{ display: 'flex', flexDirection: 'column', breakInside: 'avoid', marginBottom: '0.25rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                    <div 
                                        dir={isUrduQ ? "rtl" : "ltr"}
                                        style={{ 
                                            display: 'flex', 
                                            alignItems: 'baseline', 
                                            gap: '0.4rem', 
                                            flex: 1,
                                            direction: isUrduQ ? 'rtl' : 'ltr',
                                            textAlign: isUrduQ ? 'right' : 'left'
                                        }}
                                    >
                                        <strong style={{ flexShrink: 0, fontSize: isUrduQ ? '1rem' : '0.9rem' }}>({idx + 1})</strong>
                                        <span className={isUrduQ ? 'urdu-paper-font' : ''} style={{ fontSize: isUrduQ ? '1.1rem' : '0.9rem', lineHeight: isUrduQ ? '2.1' : '1.45', flex: 1 }}>
                                            {q.question}
                                        </span>
                                    </div>

                                    <div className="question-actions no-print" data-html2canvas-ignore="true" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                                        <button onClick={() => handleSwapQuestion('short', idx)} title="Swap" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 5px', fontSize: '0.65rem', color: '#4f46e5', cursor: 'pointer' }}>
                                            <RefreshCw size={10} /> Swap
                                        </button>
                                        <button onClick={() => setEditingQuestion({ type: 'short', index: idx, data: { ...q } })} title="Edit" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 5px', fontSize: '0.65rem', color: '#334155', cursor: 'pointer' }}>
                                            <Edit3 size={10} />
                                        </button>
                                        <button onClick={() => handleMoveQuestion('short', idx, 'up')} disabled={idx === 0} title="Move Up" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 4px', fontSize: '0.65rem', color: '#64748b', cursor: idx === 0 ? 'not-allowed' : 'pointer' }}>
                                            <MoveUp size={10} />
                                        </button>
                                        <button onClick={() => handleMoveQuestion('short', idx, 'down')} disabled={idx === paperQuestions.shorts.length - 1} title="Move Down" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 4px', fontSize: '0.65rem', color: '#64748b', cursor: idx === paperQuestions.shorts.length - 1 ? 'not-allowed' : 'pointer' }}>
                                            <MoveDown size={10} />
                                        </button>
                                        <button onClick={() => handleRemoveQuestion('short', idx)} title="Remove" style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '4px', padding: '2px 4px', fontSize: '0.65rem', color: '#dc2626', cursor: 'pointer' }}>
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                </div>

                                {showAnswerLines && (
                                    <div style={{ marginTop: '0.4rem', paddingLeft: isUrduQ ? '0' : '1.25rem', paddingRight: isUrduQ ? '1.25rem' : '0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {Array.from({ length: answerLineCount || 2 }).map((_, lineIdx) => (
                                            <div key={lineIdx} style={{ borderBottom: '1px dotted #94a3b8', height: '14px', width: '100%' }} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Render Section E: Long Questions
    const renderSectionE = () => {
        if (paperQuestions.longs.length === 0) return null;
        return (
            <div style={{ marginBottom: '1.25rem', position: 'relative', zIndex: 1 }}>
                <div className="paper-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #000', paddingBottom: '0.2rem', marginBottom: '0.65rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: '800', margin: 0, textTransform: 'uppercase' }}>
                        Section - {paperQuestions.blanks.length > 0 || paperQuestions.true_false.length > 0 ? 'E' : 'C'} (Long Questions / تفصیلی سوالات)
                    </h3>
                    <span style={{ fontWeight: '800', fontSize: '0.9rem' }}>
                        [Marks: {actualLongAttempt * longMarksEach}]
                    </span>
                </div>
                <p style={{ fontSize: '0.8rem', fontStyle: 'italic', marginBottom: '0.65rem' }}>
                    <strong>Note:</strong> Attempt any <strong>{actualLongAttempt}</strong> out of the following <strong>{paperQuestions.longs.length}</strong> questions. Each carries {longMarksEach} marks.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    {paperQuestions.longs.map((q, idx) => {
                        const isUrduQ = isUrduText(q.question, selectedSubject);
                        return (
                            <div key={q.id || idx} className="question-item canvas-question-hover" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', breakInside: 'avoid', marginBottom: '0.25rem', gap: '0.5rem' }}>
                                <div 
                                    dir={isUrduQ ? "rtl" : "ltr"}
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'baseline', 
                                        gap: '0.4rem', 
                                        flex: 1,
                                        direction: isUrduQ ? 'rtl' : 'ltr',
                                        textAlign: isUrduQ ? 'right' : 'left'
                                    }}
                                >
                                    <strong style={{ flexShrink: 0, fontSize: isUrduQ ? '1rem' : '0.9rem' }}>Q.{idx + 5}:</strong>
                                    <span className={isUrduQ ? 'urdu-paper-font' : ''} style={{ fontSize: isUrduQ ? '1.1rem' : '0.9rem', lineHeight: isUrduQ ? '2.1' : '1.45', flex: 1 }}>
                                        {q.question}
                                    </span>
                                </div>

                                <div className="question-actions no-print" data-html2canvas-ignore="true" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                                    <button onClick={() => handleSwapQuestion('long', idx)} title="Swap" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 5px', fontSize: '0.65rem', color: '#b45309', cursor: 'pointer' }}>
                                        <RefreshCw size={10} /> Swap
                                    </button>
                                    <button onClick={() => setEditingQuestion({ type: 'long', index: idx, data: { ...q } })} title="Edit" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 5px', fontSize: '0.65rem', color: '#334155', cursor: 'pointer' }}>
                                        <Edit3 size={10} />
                                    </button>
                                    <button onClick={() => handleRemoveQuestion('long', idx)} title="Remove" style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '4px', padding: '2px 4px', fontSize: '0.65rem', color: '#dc2626', cursor: 'pointer' }}>
                                        <Trash2 size={10} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div style={{ width: '100%', minHeight: '100vh', background: '#0b0f19', color: '#f8fafc', display: 'flex', flexDirection: 'column', margin: 0, padding: 0 }}>
            
            {/* Scoped Typography & Print Rules */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap');
                
                .main-content {
                    padding: 0px !important;
                    background-color: #0b0f19 !important;
                }

                .paper-studio-container {
                    font-family: 'Outfit', sans-serif;
                }

                .urdu-paper-font {
                    font-family: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaliq', 'Urdu Typesetting', 'Amiri', 'Segoe UI', Tahoma, serif !important;
                    line-height: 2.1 !important;
                    letter-spacing: 0px !important;
                    word-spacing: 0px !important;
                    font-feature-settings: "liga" 1;
                    text-rendering: optimizeLegibility;
                }

                /* Standard A4 Paper Sheet (210mm x 297mm) */
                .printable-paper-sheet {
                    width: 794px;
                    height: 1123px;
                    background: #ffffff;
                    color: #000000;
                    padding: 2.25rem 2.75rem;
                    box-sizing: border-box;
                    position: relative;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45);
                    font-family: "Times New Roman", "Noto Nastaliq Urdu", Times, serif;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    justifyContent: space-between;
                }

                .canvas-question-hover {
                    transition: all 0.15s ease;
                    border-radius: 6px;
                    padding: 3px 5px;
                }

                .canvas-question-hover:hover {
                    background: #f8fafc;
                    box-shadow: 0 0 0 1px #cbd5e1;
                }

                .canvas-question-hover .question-actions {
                    opacity: 0;
                    transition: opacity 0.15s ease;
                }

                .canvas-question-hover:hover .question-actions {
                    opacity: 1;
                }

                @media print {
                    .no-print { display: none !important; }
                    body { background: #ffffff !important; margin: 0 !important; padding: 0 !important; }
                    .printable-paper-sheet { 
                        border: none !important; 
                        box-shadow: none !important; 
                        width: 100% !important; 
                        height: auto !important;
                        min-height: 100vh !important;
                        page-break-after: always !important;
                        break-after: page !important;
                        padding: 1.5rem !important;
                    }
                }
            `}</style>

            {/* 🔝 1. STICKY TOP UNIVERSAL BAR (NIGHT MODE) */}
            <header className="no-print" style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                background: '#0f172a',
                borderBottom: '1px solid #1e293b',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                padding: '0.75rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                {/* Brand & Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4)'
                    }}>
                        <FileCheck size={22} color="#ffffff" />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <h1 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#ffffff', margin: 0, letterSpacing: '-0.01em' }}>
                                Paper Studio
                            </h1>
                            <span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '2px 8px', borderRadius: '20px', background: 'rgba(79, 70, 229, 0.25)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.4)' }}>
                                LIVE CANVA NIGHT
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            Standard A4 Question Paper Editor
                        </div>
                    </div>
                </div>

                {/* Dropdowns (Class, Subject, Preset) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {/* Class */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#1e293b', padding: '5px 10px', borderRadius: '10px', border: '1px solid #334155' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#94a3b8' }}>Class:</span>
                        <select
                            value={selectedClassId}
                            onChange={(e) => setSelectedClassId(e.target.value)}
                            style={{ background: 'transparent', border: 'none', outline: 'none', fontWeight: '700', fontSize: '0.85rem', color: '#ffffff', cursor: 'pointer' }}
                        >
                            {classes.map(c => (
                                <option key={c.id} value={c.id} style={{ background: '#1e293b', color: '#fff' }}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Subject */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#1e293b', padding: '5px 10px', borderRadius: '10px', border: '1px solid #334155' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#94a3b8' }}>Subject:</span>
                        <select
                            value={selectedSubject}
                            onChange={(e) => setSelectedSubject(e.target.value)}
                            disabled={availableSubjects.length === 0}
                            style={{ background: 'transparent', border: 'none', outline: 'none', fontWeight: '700', fontSize: '0.85rem', color: availableSubjects.length === 0 ? '#64748b' : '#ffffff', cursor: availableSubjects.length === 0 ? 'not-allowed' : 'pointer' }}
                        >
                            {availableSubjects.length === 0 ? (
                                <option value="" style={{ background: '#1e293b' }}>No subjects</option>
                            ) : (
                                availableSubjects.map(s => (
                                    <option key={s} value={s} style={{ background: '#1e293b', color: '#fff' }}>{s}</option>
                                ))
                            )}
                        </select>
                    </div>

                    {/* Preset */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#1e293b', padding: '5px 10px', borderRadius: '10px', border: '1px solid #334155' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#94a3b8' }}>Preset:</span>
                        <select
                            value={selectedPreset}
                            onChange={(e) => handleApplyPreset(e.target.value)}
                            style={{ background: 'transparent', border: 'none', outline: 'none', fontWeight: '700', fontSize: '0.85rem', color: '#818cf8', cursor: 'pointer' }}
                        >
                            {EXAM_PRESETS.map(p => (
                                <option key={p.id} value={p.id} style={{ background: '#1e293b', color: '#fff' }}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Right: Total Marks & Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    {/* Live Total Marks Ticker */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.45rem 0.9rem',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                        color: '#ffffff',
                        boxShadow: '0 2px 10px rgba(79, 70, 229, 0.4)'
                    }}>
                        <Award size={16} color="#fbbf24" />
                        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase', opacity: 0.9 }}>Total Marks</span>
                            <span style={{ fontSize: '1.05rem', fontWeight: '900' }}>{totalMarks}</span>
                        </div>
                    </div>

                    {/* Shuffle Button */}
                    <button
                        onClick={() => buildPaperFromSyllabus()}
                        disabled={loadingChapters || allSyllabusQuestions.length === 0}
                        title="Shuffle questions from syllabus"
                        style={{
                            padding: '0.5rem 0.85rem',
                            borderRadius: '10px',
                            fontWeight: '700',
                            fontSize: '0.8rem',
                            cursor: loadingChapters || allSyllabusQuestions.length === 0 ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            background: '#1e293b',
                            color: '#ffffff',
                            border: '1px solid #334155'
                        }}
                    >
                        <RefreshCw size={14} />
                        <span>Shuffle</span>
                    </button>

                    {/* Download PDF Button */}
                    <button
                        onClick={handleDownloadPdf}
                        disabled={isDownloadingPdf}
                        style={{
                            padding: '0.5rem 1.15rem',
                            borderRadius: '10px',
                            fontWeight: '800',
                            fontSize: '0.85rem',
                            cursor: isDownloadingPdf ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: '#ffffff',
                            border: 'none',
                            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                        }}
                    >
                        {isDownloadingPdf ? (
                            <>
                                <RefreshCw className="animate-spin" size={15} />
                                <span>Exporting...</span>
                            </>
                        ) : (
                            <>
                                <Download size={15} />
                                <span>Download PDF</span>
                            </>
                        )}
                    </button>
                </div>
            </header>

            {/* 🖥️ 2. MAIN SPLIT-SCREEN WORKSPACE (NIGHT THEME) */}
            <div className="paper-studio-container" style={{ flex: 1, display: 'flex', minHeight: 'calc(100vh - 65px)' }}>
                
                {/* 👈 LEFT SIDEBAR: CREATOR TOOLBOX (DARK NIGHT THEME) */}
                <aside className="no-print" style={{
                    width: '350px',
                    flexShrink: 0,
                    background: '#0f172a',
                    borderRight: '1px solid #1e293b',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: 'calc(100vh - 65px)',
                    position: 'sticky',
                    top: '65px',
                    overflowY: 'auto'
                }}>
                    
                    {/* Tool Tabs */}
                    <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', background: '#090d16', padding: '5px' }}>
                        {[
                            { id: 'add_questions', label: 'Add Items', icon: Plus },
                            { id: 'blueprint', label: 'Scores', icon: Sliders },
                            { id: 'chapters', label: 'Chapters', icon: BookOpen },
                            { id: 'settings', label: 'Setup', icon: Settings2 }
                        ].map(tab => {
                            const isActive = leftActiveTab === tab.id;
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setLeftActiveTab(tab.id)}
                                    style={{
                                        flex: 1,
                                        padding: '0.6rem 0.2rem',
                                        fontSize: '0.75rem',
                                        fontWeight: '700',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '0.2rem',
                                        border: 'none',
                                        borderRadius: '8px',
                                        background: isActive ? '#4f46e5' : 'transparent',
                                        color: isActive ? '#ffffff' : '#94a3b8',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <Icon size={16} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    <div style={{ padding: '1.25rem', flex: 1, overflowY: 'auto' }}>
                        
                        {/* TAB 1: ➕ ADD QUESTIONS */}
                        {leftActiveTab === 'add_questions' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#ffffff', margin: '0 0 0.25rem 0' }}>
                                        Insert into Paper
                                    </h3>
                                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
                                        Button click karte hi question live paper canvas par add ho jayega.
                                    </p>
                                </div>

                                {/* Rich Colored Action Buttons with Pure White Text */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                    
                                    {/* Short Qs Button */}
                                    <button
                                        onClick={() => handleAddQuestionToSection('short')}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            borderRadius: '10px',
                                            border: 'none',
                                            background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                                            color: '#ffffff',
                                            fontWeight: '700',
                                            fontSize: '0.85rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Plus size={16} color="#ffffff" />
                                            <span>+ Short Question (مختصر سوال)</span>
                                        </div>
                                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.2)', color: '#ffffff' }}>
                                            {paperQuestions.shorts.length}
                                        </span>
                                    </button>

                                    {/* MCQ Button */}
                                    <button
                                        onClick={() => handleAddQuestionToSection('mcq')}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            borderRadius: '10px',
                                            border: 'none',
                                            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                                            color: '#ffffff',
                                            fontWeight: '700',
                                            fontSize: '0.85rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Plus size={16} color="#ffffff" />
                                            <span>+ MCQ Option (معروضی)</span>
                                        </div>
                                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.2)', color: '#ffffff' }}>
                                            {paperQuestions.mcqs.length}
                                        </span>
                                    </button>

                                    {/* Fill in Blanks Button */}
                                    <button
                                        onClick={() => handleAddQuestionToSection('blank')}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            borderRadius: '10px',
                                            border: 'none',
                                            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                                            color: '#ffffff',
                                            fontWeight: '700',
                                            fontSize: '0.85rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Plus size={16} color="#ffffff" />
                                            <span>+ Fill in the Blanks (خالی جگہ)</span>
                                        </div>
                                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.2)', color: '#ffffff' }}>
                                            {paperQuestions.blanks.length}
                                        </span>
                                    </button>

                                    {/* True/False Button */}
                                    <button
                                        onClick={() => handleAddQuestionToSection('true_false')}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            borderRadius: '10px',
                                            border: 'none',
                                            background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                                            color: '#ffffff',
                                            fontWeight: '700',
                                            fontSize: '0.85rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Plus size={16} color="#ffffff" />
                                            <span>+ True / False (درست یا غلط)</span>
                                        </div>
                                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.2)', color: '#ffffff' }}>
                                            {paperQuestions.true_false.length}
                                        </span>
                                    </button>

                                    {/* Long Qs Button */}
                                    <button
                                        onClick={() => handleAddQuestionToSection('long')}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            borderRadius: '10px',
                                            border: 'none',
                                            background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                                            color: '#ffffff',
                                            fontWeight: '700',
                                            fontSize: '0.85rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(217, 119, 6, 0.3)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Plus size={16} color="#ffffff" />
                                            <span>+ Long Question (تفصیلی سوال)</span>
                                        </div>
                                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.2)', color: '#ffffff' }}>
                                            {paperQuestions.longs.length}
                                        </span>
                                    </button>
                                </div>

                                {/* Scanned syllabus availability stats */}
                                <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '12px', border: '1px solid #334155', marginTop: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                        <BookOpen size={14} color="#818cf8" />
                                        <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#ffffff' }}>
                                            Syllabus Bank Status
                                        </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                                        <div>MCQs: <strong style={{ color: '#fff' }}>{syllabusCounts.mcq}</strong></div>
                                        <div>Blanks: <strong style={{ color: '#fff' }}>{syllabusCounts.blank}</strong></div>
                                        <div>T/F: <strong style={{ color: '#fff' }}>{syllabusCounts.true_false}</strong></div>
                                        <div>Shorts: <strong style={{ color: '#fff' }}>{syllabusCounts.short}</strong></div>
                                        <div>Longs: <strong style={{ color: '#fff' }}>{syllabusCounts.long}</strong></div>
                                        <div>Total Qs: <strong style={{ color: '#fff' }}>{syllabusCounts.total}</strong></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB 2: 🎯 SCORES & BLUEPRINT */}
                        {leftActiveTab === 'blueprint' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#ffffff', margin: '0 0 0.25rem 0' }}>
                                        Scores Scheme
                                    </h3>
                                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
                                        Section ke marks change karein, real-time recalculate honge.
                                    </p>
                                </div>

                                {/* MCQ Marks */}
                                <div style={{ background: '#1e293b', padding: '0.75rem', borderRadius: '10px', border: '1px solid #334155' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                        <span style={{ fontWeight: '700', fontSize: '0.8rem', color: '#f1f5f9' }}>MCQ Marks Each</span>
                                        <span style={{ fontWeight: '800', fontSize: '0.8rem', color: '#60a5fa' }}>
                                            {paperQuestions.mcqs.length * mcqMarksEach} Marks
                                        </span>
                                    </div>
                                    <input
                                        type="number"
                                        min="1"
                                        max="5"
                                        value={mcqMarksEach}
                                        onChange={(e) => setMcqMarksEach(Math.max(1, Number(e.target.value)))}
                                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', fontSize: '0.85rem', fontWeight: '700' }}
                                    />
                                </div>

                                {/* Blank Marks */}
                                <div style={{ background: '#1e293b', padding: '0.75rem', borderRadius: '10px', border: '1px solid #334155' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                        <span style={{ fontWeight: '700', fontSize: '0.8rem', color: '#f1f5f9' }}>Blank Marks Each</span>
                                        <span style={{ fontWeight: '800', fontSize: '0.8rem', color: '#34d399' }}>
                                            {paperQuestions.blanks.length * blankMarksEach} Marks
                                        </span>
                                    </div>
                                    <input
                                        type="number"
                                        min="1"
                                        max="5"
                                        value={blankMarksEach}
                                        onChange={(e) => setBlankMarksEach(Math.max(1, Number(e.target.value)))}
                                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', fontSize: '0.85rem', fontWeight: '700' }}
                                    />
                                </div>

                                {/* Short Qs Scheme */}
                                <div style={{ background: '#1e293b', padding: '0.75rem', borderRadius: '10px', border: '1px solid #334155' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                        <span style={{ fontWeight: '700', fontSize: '0.8rem', color: '#f1f5f9' }}>Short Questions</span>
                                        <span style={{ fontWeight: '800', fontSize: '0.8rem', color: '#a5b4fc' }}>
                                            {actualShortAttempt * shortMarksEach} Marks
                                        </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Attempt</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max={Math.max(1, paperQuestions.shorts.length)}
                                                value={shortAttempt}
                                                onChange={(e) => setShortAttempt(Math.max(1, Number(e.target.value)))}
                                                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', fontSize: '0.85rem', fontWeight: '700' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Marks Each</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="10"
                                                value={shortMarksEach}
                                                onChange={(e) => setShortMarksEach(Math.max(1, Number(e.target.value)))}
                                                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', fontSize: '0.85rem', fontWeight: '700' }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Long Qs Scheme */}
                                <div style={{ background: '#1e293b', padding: '0.75rem', borderRadius: '10px', border: '1px solid #334155' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                        <span style={{ fontWeight: '700', fontSize: '0.8rem', color: '#f1f5f9' }}>Long Questions</span>
                                        <span style={{ fontWeight: '800', fontSize: '0.8rem', color: '#fbbf24' }}>
                                            {actualLongAttempt * longMarksEach} Marks
                                        </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Attempt</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max={Math.max(1, paperQuestions.longs.length)}
                                                value={longAttempt}
                                                onChange={(e) => setLongAttempt(Math.max(1, Number(e.target.value)))}
                                                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', fontSize: '0.85rem', fontWeight: '700' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Marks Each</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="15"
                                                value={longMarksEach}
                                                onChange={(e) => setLongMarksEach(Math.max(1, Number(e.target.value)))}
                                                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', fontSize: '0.85rem', fontWeight: '700' }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB 3: 📚 CHAPTERS */}
                        {leftActiveTab === 'chapters' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#ffffff', margin: '0 0 0.25rem 0' }}>
                                        Syllabus Scope
                                    </h3>
                                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
                                        Chapters select karein jaha se paper pick hoga.
                                    </p>
                                </div>

                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={() => setSelectedChapterIds(firestoreChapters.map(c => c.id))}
                                        style={{ padding: '0.35rem 0.65rem', background: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                                    >
                                        All Chapters
                                    </button>
                                    <button
                                        onClick={() => {
                                            const mid = Math.ceil(firestoreChapters.length / 2);
                                            setSelectedChapterIds(firestoreChapters.slice(0, mid).map(c => c.id));
                                        }}
                                        style={{ padding: '0.35rem 0.65rem', background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
                                    >
                                        1st Half
                                    </button>
                                    <button
                                        onClick={() => {
                                            const mid = Math.ceil(firestoreChapters.length / 2);
                                            setSelectedChapterIds(firestoreChapters.slice(mid).map(c => c.id));
                                        }}
                                        style={{ padding: '0.35rem 0.65rem', background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
                                    >
                                        2nd Half
                                    </button>
                                </div>

                                {loadingChapters ? (
                                    <div style={{ textAlign: 'center', padding: '2rem 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                                        <Loader2 className="animate-spin" size={20} color="#818cf8" style={{ margin: '0 auto 0.5rem' }} />
                                        Loading syllabus chapters...
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '350px', overflowY: 'auto' }}>
                                        {firestoreChapters.map(ch => {
                                            const isSelected = selectedChapterIds.includes(ch.id);
                                            return (
                                                <label
                                                    key={ch.id}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        padding: '0.65rem 0.75rem',
                                                        borderRadius: '8px',
                                                        border: isSelected ? '1px solid #6366f1' : '1px solid #334155',
                                                        background: isSelected ? '#312e81' : '#1e293b',
                                                        cursor: 'pointer',
                                                        fontSize: '0.8rem',
                                                        color: '#ffffff'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => {
                                                                setSelectedChapterIds(prev => 
                                                                    prev.includes(ch.id) ? prev.filter(id => id !== ch.id) : [...prev, ch.id]
                                                                );
                                                            }}
                                                            style={{ accentColor: '#4f46e5' }}
                                                        />
                                                        <span>{ch.title}</span>
                                                    </div>
                                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                        {(ch.questions || []).length} Qs
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB 4: ⚙️ SETUP */}
                        {leftActiveTab === 'settings' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#ffffff', margin: '0 0 0.25rem 0' }}>
                                        Header & Typesetting
                                    </h3>
                                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
                                        Paper title, timings, aur visual styling.
                                    </p>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#cbd5e1', marginBottom: '0.2rem' }}>Exam Title</label>
                                    <input
                                        type="text"
                                        value={examTitle}
                                        onChange={(e) => setExamTitle(e.target.value)}
                                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #334155', background: '#1e293b', color: '#fff', fontSize: '0.85rem' }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#cbd5e1', marginBottom: '0.2rem' }}>Time Allowed</label>
                                    <input
                                        type="text"
                                        value={timeAllowed}
                                        onChange={(e) => setTimeAllowed(e.target.value)}
                                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #334155', background: '#1e293b', color: '#fff', fontSize: '0.85rem' }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#cbd5e1', marginBottom: '0.2rem' }}>Exam Date</label>
                                    <input
                                        type="date"
                                        value={examDate}
                                        onChange={(e) => setExamDate(e.target.value)}
                                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #334155', background: '#1e293b', color: '#fff', fontSize: '0.85rem' }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#cbd5e1', marginBottom: '0.2rem' }}>Student Instructions</label>
                                    <textarea
                                        rows="2"
                                        value={instructions}
                                        onChange={(e) => setInstructions(e.target.value)}
                                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #334155', background: '#1e293b', color: '#fff', fontSize: '0.8rem', resize: 'vertical' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid #334155', paddingTop: '0.75rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: '600', color: '#cbd5e1', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={showSchoolLogo}
                                            onChange={(e) => setShowSchoolLogo(e.target.checked)}
                                            style={{ accentColor: '#4f46e5' }}
                                        />
                                        Show School Logo in Header
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: '600', color: '#cbd5e1', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={showWatermark}
                                            onChange={(e) => setShowWatermark(e.target.checked)}
                                            style={{ accentColor: '#4f46e5' }}
                                        />
                                        Show Background Watermark
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: '600', color: '#cbd5e1', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={showAnswerLines}
                                            onChange={(e) => setShowAnswerLines(e.target.checked)}
                                            style={{ accentColor: '#4f46e5' }}
                                        />
                                        Student Ruled Answer Lines
                                    </label>
                                </div>
                            </div>
                        )}

                    </div>
                </aside>

                {/* 👉 RIGHT SIDE: LIVE A4 PAPER CANVA VIEWPORT (NIGHT BACKGROUND) */}
                <main style={{
                    flex: 1,
                    background: '#080c14',
                    padding: '1.5rem 1rem 3rem 1rem',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                }}>
                    
                    {/* Canva Page Selector & Zoom Bar (Hidden on Print) */}
                    <div className="no-print" style={{
                        width: '794px',
                        background: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '12px',
                        padding: '0.65rem 1rem',
                        marginBottom: '1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                        flexWrap: 'wrap',
                        gap: '0.75rem'
                    }}>
                        {/* Page Selector Tabs */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>
                                Pages:
                            </span>

                            <button
                                onClick={() => setActivePageTab('all')}
                                style={{
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    border: 'none',
                                    background: activePageTab === 'all' ? '#4f46e5' : '#1e293b',
                                    color: '#ffffff'
                                }}
                            >
                                All Pages ({pageCountMode})
                            </button>

                            <button
                                onClick={() => setActivePageTab(1)}
                                style={{
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    border: 'none',
                                    background: activePageTab === 1 ? '#4f46e5' : '#1e293b',
                                    color: '#ffffff'
                                }}
                            >
                                📄 Page 1
                            </button>

                            <button
                                onClick={() => setActivePageTab(2)}
                                style={{
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    border: 'none',
                                    background: activePageTab === 2 ? '#4f46e5' : '#1e293b',
                                    color: '#ffffff'
                                }}
                            >
                                📄 Page 2
                            </button>

                            {pageCountMode >= 3 && (
                                <button
                                    onClick={() => setActivePageTab(3)}
                                    style={{
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '8px',
                                        fontWeight: '700',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        border: 'none',
                                        background: activePageTab === 3 ? '#4f46e5' : '#1e293b',
                                        color: '#ffffff'
                                    }}
                                >
                                    📄 Page 3
                                </button>
                            )}
                        </div>

                        {/* Zoom & Layout Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            {/* Layout Selector */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Layout:</span>
                                <select
                                    value={pageCountMode}
                                    onChange={(e) => setPageCountMode(Number(e.target.value))}
                                    style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '6px', padding: '3px 8px', fontSize: '0.75rem', fontWeight: '700', outline: 'none' }}
                                >
                                    <option value={1}>1 Page (Worksheet)</option>
                                    <option value={2}>2 Pages (Standard Board)</option>
                                    <option value={3}>3 Pages (Grand Test)</option>
                                </select>
                            </div>

                            {/* Canva-Style Zoom In / Zoom Out Controls */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '2px 4px' }}>
                                <button
                                    onClick={() => setCanvasZoom(prev => Math.max(20, prev - 10))}
                                    title="Zoom Out (-10%)"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '4px',
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#cbd5e1',
                                        cursor: 'pointer'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = '#cbd5e1'}
                                >
                                    <ZoomOut size={13} />
                                </button>

                                <select
                                    value={canvasZoom}
                                    onChange={(e) => setCanvasZoom(Number(e.target.value))}
                                    style={{
                                        background: '#0f172a',
                                        border: '1px solid #334155',
                                        color: '#38bdf8',
                                        fontWeight: '800',
                                        fontSize: '0.75rem',
                                        borderRadius: '4px',
                                        padding: '2px 6px',
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value={20}>20%</option>
                                    <option value={35}>35%</option>
                                    <option value={50}>50%</option>
                                    <option value={60}>60%</option>
                                    <option value={70}>70%</option>
                                    <option value={85}>85%</option>
                                    <option value={100}>100% (Actual)</option>
                                    <option value={125}>125%</option>
                                    <option value={150}>150%</option>
                                </select>

                                <button
                                    onClick={() => setCanvasZoom(prev => Math.min(150, prev + 10))}
                                    title="Zoom In (+10%)"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '4px',
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#cbd5e1',
                                        cursor: 'pointer'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = '#cbd5e1'}
                                >
                                    <ZoomIn size={13} />
                                </button>

                                {canvasZoom !== 100 && (
                                    <button
                                        onClick={() => setCanvasZoom(100)}
                                        title="Reset Zoom to 100%"
                                        style={{
                                            fontSize: '0.68rem',
                                            fontWeight: '700',
                                            padding: '1px 5px',
                                            borderRadius: '4px',
                                            background: '#334155',
                                            color: '#94a3b8',
                                            border: 'none',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Reset
                                    </button>
                                )}
                            </div>

                            <span style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: '800' }}>
                                Standard A4 (210×297mm)
                            </span>
                        </div>
                    </div>

                    {/* PHYSICAL A4 PAPER SHEETS CONTAINER */}
                    <div
                        ref={pagesContainerRef}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2rem',
                            alignItems: 'center',
                            zoom: `${canvasZoom}%`,
                            transition: 'zoom 0.15s ease'
                        }}
                    >
                        
                        {/* 📄 PAGE 1 (OBJECTIVE / SECTION A, B, C) */}
                        {(activePageTab === 'all' || activePageTab === 1) && (
                            <div className="printable-paper-sheet">
                                <div>
                                    {/* Anti-Piracy Watermark */}
                                    {showWatermark && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '50%',
                                            left: '50%',
                                            transform: 'translate(-50%, -50%) rotate(-35deg)',
                                            fontSize: '3.75rem',
                                            fontWeight: '900',
                                            color: 'rgba(0, 0, 0, 0.035)',
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
                                    <div className="school-header" style={{ textAlign: 'center', borderBottom: '2px solid #000000', paddingBottom: '0.65rem', marginBottom: '0.85rem', position: 'relative', zIndex: 1 }}>
                                        <h1 style={{ fontSize: '1.65rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                                            {schoolInfo.name}
                                        </h1>
                                        <p style={{ fontSize: '0.8rem', margin: '0.15rem 0', fontStyle: 'italic' }}>
                                            {schoolInfo.address} {schoolInfo.contact ? `| Ph: ${schoolInfo.contact}` : ''}
                                        </p>
                                        <h2 style={{ fontSize: '1.1rem', fontWeight: '700', margin: '0.3rem 0 0', textDecoration: 'underline' }}>
                                            {examTitle} ({academicSession})
                                        </h2>
                                    </div>

                                    {/* STUDENT & EXAM METADATA BOX */}
                                    <div className="paper-meta-box" style={{ border: '1px solid #000000', padding: '0.45rem 0.65rem', marginBottom: '0.9rem', fontSize: '0.85rem', lineHeight: '1.45', position: 'relative', zIndex: 1 }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.4rem', marginBottom: '0.25rem' }}>
                                            <div><strong>Student Name:</strong> ______________________</div>
                                            <div><strong>Roll No:</strong> ____________</div>
                                            <div><strong>Date:</strong> {examDate}</div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.4rem' }}>
                                            <div><strong>Class:</strong> {selectedClassName} &nbsp;|&nbsp; <strong>Subject:</strong> {selectedSubject}</div>
                                            <div><strong>Time Allowed:</strong> {timeAllowed}</div>
                                            <div><strong>Total Marks:</strong> {totalMarks}</div>
                                        </div>
                                    </div>

                                    {/* GENERAL INSTRUCTIONS */}
                                    {instructions && (
                                        <div style={{ fontSize: '0.75rem', fontStyle: 'italic', marginBottom: '0.85rem', borderBottom: '1px dashed #cbd5e1', paddingBottom: '0.35rem' }}>
                                            <strong>Instructions:</strong> {instructions}
                                        </div>
                                    )}

                                    {/* PAGE 1 CONTENT */}
                                    {renderSectionA()}
                                    {renderSectionBC()}

                                    {/* If 1 Page Mode: render short questions as well */}
                                    {pageCountMode === 1 && (
                                        <>
                                            {renderSectionD()}
                                            {renderSectionE()}
                                        </>
                                    )}
                                </div>

                                {/* Page 1 Footer */}
                                <div style={{ borderTop: '1px solid #000', paddingTop: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', fontWeight: '700' }}>
                                    <span>{selectedSubject} - Class {selectedClassName}</span>
                                    <span>Page 1 of {pageCountMode} {pageCountMode > 1 ? '(Turn Over →)' : ''}</span>
                                </div>
                            </div>
                        )}

                        {/* 📄 PAGE 2 (SUBJECTIVE / SECTION D & SECTION E) */}
                        {pageCountMode >= 2 && (activePageTab === 'all' || activePageTab === 2) && (
                            <div className="printable-paper-sheet">
                                <div>
                                    {/* Mini Header for Page 2 */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #000', paddingBottom: '0.35rem', marginBottom: '1rem', fontSize: '0.85rem', fontWeight: '700' }}>
                                        <span>{schoolInfo.name}</span>
                                        <span>{examTitle}</span>
                                        <span>Subject: {selectedSubject} (Class {selectedClassName})</span>
                                    </div>

                                    {/* PAGE 2 CONTENT */}
                                    {renderSectionD()}
                                    {pageCountMode === 2 && renderSectionE()}
                                </div>

                                {/* Page 2 Footer */}
                                <div style={{ borderTop: '1px solid #000', paddingTop: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', fontWeight: '700' }}>
                                    <span>{schoolInfo.name} &bull; Examination Branch</span>
                                    <span>Page 2 of {pageCountMode} {pageCountMode === 2 ? '(End of Paper)' : '(Turn Over →)'}</span>
                                </div>
                            </div>
                        )}

                        {/* 📄 PAGE 3 (LONG QUESTIONS / GRAND TEST MODE) */}
                        {pageCountMode >= 3 && (activePageTab === 'all' || activePageTab === 3) && (
                            <div className="printable-paper-sheet">
                                <div>
                                    {/* Mini Header for Page 3 */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #000', paddingBottom: '0.35rem', marginBottom: '1rem', fontSize: '0.85rem', fontWeight: '700' }}>
                                        <span>{schoolInfo.name}</span>
                                        <span>Section - E (Descriptive Long Questions)</span>
                                        <span>Class {selectedClassName}</span>
                                    </div>

                                    {/* PAGE 3 CONTENT */}
                                    {renderSectionE()}
                                </div>

                                {/* Page 3 Footer */}
                                <div style={{ borderTop: '1px solid #000', paddingTop: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', fontWeight: '700' }}>
                                    <span>End of Examination Paper</span>
                                    <span>Page 3 of {pageCountMode}</span>
                                </div>
                            </div>
                        )}

                    </div>
                </main>
            </div>

            {/* 📝 3. MODAL FOR EDITING ANY QUESTION TEXT (NIGHT THEME) */}
            {editingQuestion && (
                <div className="no-print" style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(6px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem'
                }}>
                    <div style={{
                        background: '#0f172a',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '560px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        padding: '1.5rem',
                        border: '1px solid #334155',
                        color: '#ffffff'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Edit3 size={18} color="#818cf8" />
                                Edit Question Text
                            </h3>
                            <button
                                onClick={() => setEditingQuestion(null)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                                    Question Text (Urdu or English)
                                </label>
                                <textarea
                                    rows="3"
                                    value={editingQuestion.data.question}
                                    onChange={(e) => setEditingQuestion(prev => ({
                                        ...prev,
                                        data: { ...prev.data, question: e.target.value }
                                    }))}
                                    style={{
                                        width: '100%',
                                        padding: '0.65rem',
                                        borderRadius: '8px',
                                        border: '1px solid #334155',
                                        background: '#1e293b',
                                        color: '#ffffff',
                                        fontSize: '0.95rem',
                                        resize: 'vertical',
                                        fontFamily: isUrduText(editingQuestion.data.question) ? "'Noto Nastaliq Urdu', serif" : 'inherit',
                                        lineHeight: isUrduText(editingQuestion.data.question) ? '2' : '1.5'
                                    }}
                                />
                            </div>

                            {/* Options if MCQ */}
                            {editingQuestion.type === 'mcq' && editingQuestion.data.options && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                                        Options (A, B, C, D)
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                        {editingQuestion.data.options.map((opt, oIdx) => (
                                            <input
                                                key={oIdx}
                                                type="text"
                                                value={opt}
                                                onChange={(e) => {
                                                    const updatedOpts = [...editingQuestion.data.options];
                                                    updatedOpts[oIdx] = e.target.value;
                                                    setEditingQuestion(prev => ({
                                                        ...prev,
                                                        data: { ...prev.data, options: updatedOpts }
                                                    }));
                                                }}
                                                placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                                                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #334155', background: '#1e293b', color: '#fff', fontSize: '0.85rem' }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                                    Correct Answer Key (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={editingQuestion.data.correctAnswer || ''}
                                    onChange={(e) => setEditingQuestion(prev => ({
                                        ...prev,
                                        data: { ...prev.data, correctAnswer: e.target.value }
                                    }))}
                                    placeholder="e.g. Option A or 9.8 m/s²"
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #334155', background: '#1e293b', color: '#fff', fontSize: '0.85rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.5rem' }}>
                                <button
                                    onClick={() => setEditingQuestion(null)}
                                    style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveEditedQuestion}
                                    style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)', color: '#ffffff', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}
                                >
                                    Apply Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default PaperGenerator;
