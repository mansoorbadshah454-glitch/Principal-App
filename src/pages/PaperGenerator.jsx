import React, { useState, useEffect, useRef } from 'react';
import { 
    FileCheck, Sparkles, Printer, RefreshCw, ChevronRight, 
    BookOpen, Layers, CheckSquare, Settings2, Sliders, 
    Trash2, Edit3, Plus, ArrowLeftRight, Check, Eye, EyeOff, 
    HelpCircle, Award, FileText, School, Download, AlertTriangle,
    Clock, Calendar, CheckCircle2, Copy, Shield, Bookmark, LayoutGrid, ListFilter,
    Loader2, AlertCircle
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
    { id: 'primary_worksheet', name: 'Primary School Worksheet (25 Marks)', badge: 'Class 1-5', totalMarks: 25, timeAllowed: '45 Minutes', mcqCount: 5, mcqMarksEach: 1, blankCount: 5, blankMarksEach: 1, tfCount: 5, tfMarksEach: 1, shortCount: 5, shortAttempt: 5, shortMarksEach: 2, longCount: 0, longAttempt: 0, longMarksEach: 0, showAnswerLines: true },
    { id: 'primary_comprehensive', name: 'Primary Term Exam (50 Marks)', badge: 'Class 1-5', totalMarks: 50, timeAllowed: '1 Hour 30 Mins', mcqCount: 10, mcqMarksEach: 1, blankCount: 10, blankMarksEach: 1, tfCount: 5, tfMarksEach: 1, shortCount: 8, shortAttempt: 8, shortMarksEach: 2, longCount: 1, longAttempt: 1, longMarksEach: 5, showAnswerLines: true },
    { id: 'monthly_test', name: 'Monthly Class Test (25 Marks)', badge: 'Class 6-10', totalMarks: 25, timeAllowed: '45 Minutes', mcqCount: 5, mcqMarksEach: 1, blankCount: 0, blankMarksEach: 1, tfCount: 0, tfMarksEach: 1, shortCount: 6, shortAttempt: 4, shortMarksEach: 2, longCount: 2, longAttempt: 1, longMarksEach: 6, showAnswerLines: false },
    { id: 'mid_term', name: 'Mid Term Exam (50 Marks)', badge: 'Standard 50M', totalMarks: 50, timeAllowed: '1 Hour 30 Mins', mcqCount: 10, mcqMarksEach: 1, blankCount: 0, blankMarksEach: 1, tfCount: 0, tfMarksEach: 1, shortCount: 8, shortAttempt: 6, shortMarksEach: 3, longCount: 3, longAttempt: 2, longMarksEach: 6, showAnswerLines: false },
    { id: 'final_board', name: 'Annual / Board Pattern (75 Marks)', badge: 'Board 75M', totalMarks: 75, timeAllowed: '3 Hours', mcqCount: 15, mcqMarksEach: 1, blankCount: 0, blankMarksEach: 1, tfCount: 0, tfMarksEach: 1, shortCount: 15, shortAttempt: 10, shortMarksEach: 2, longCount: 5, longAttempt: 3, longMarksEach: 8, showAnswerLines: false },
    { id: 'grand_test', name: 'Grand Test / Pre-Board (100 Marks)', badge: 'Pre-Board 100M', totalMarks: 100, timeAllowed: '3 Hours', mcqCount: 20, mcqMarksEach: 1, blankCount: 0, blankMarksEach: 1, tfCount: 0, tfMarksEach: 1, shortCount: 18, shortAttempt: 12, shortMarksEach: 2, longCount: 6, longAttempt: 4, longMarksEach: 8, showAnswerLines: false }
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

    // --- STEP 1: PAPER SETTINGS STATE ---
    const [activeSettingsTab, setActiveSettingsTab] = useState('syllabus'); // 'exam_info' | 'syllabus' | 'blueprint' | 'typesetting'
    
    // 1. Exam Header & Info
    const [examTitle, setExamTitle] = useState('First Term Examination 2026');
    const [academicSession, setAcademicSession] = useState('2025-2026');
    const [campusName, setCampusName] = useState('Main Campus');
    const [classSection, setClassSection] = useState('Section A');
    const [examDate, setExamDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [timeAllowed, setTimeAllowed] = useState('1 Hour 30 Minutes');
    const [instructions, setInstructions] = useState('Use blue or black pen only. Overwriting or cutting in Section-A (Objective) will result in zero marks.');
    const [showWatermark, setShowWatermark] = useState(true);
    const [showSchoolLogo, setShowSchoolLogo] = useState(true);

    // 2. Exam Blueprint & Preset
    const [selectedPreset, setSelectedPreset] = useState('mid_term');
    const [mcqCount, setMcqCount] = useState(10);
    const [mcqMarksEach, setMcqMarksEach] = useState(1);

    // Fill in the Blanks & True/False (Primary / Activity Style)
    const [blankCount, setBlankCount] = useState(0);
    const [blankMarksEach, setBlankMarksEach] = useState(1);

    const [tfCount, setTfCount] = useState(0);
    const [tfMarksEach, setTfMarksEach] = useState(1);

    const [shortCount, setShortCount] = useState(8);
    const [shortAttempt, setShortAttempt] = useState(6);
    const [shortMarksEach, setShortMarksEach] = useState(3);
    const [showAnswerLines, setShowAnswerLines] = useState(false);
    const [answerLineCount, setAnswerLineCount] = useState(2);

    const [longCount, setLongCount] = useState(3);
    const [longAttempt, setLongAttempt] = useState(2);
    const [longMarksEach, setLongMarksEach] = useState(6);

    // 3. Typesetting & Language
    const [languageMode, setLanguageMode] = useState('bilingual'); // 'english' | 'urdu' | 'bilingual'
    const [paperStyle, setPaperStyle] = useState('board_standard');
    const [fontSize, setFontSize] = useState('normal'); // 'compact' | 'normal' | 'large'
    const [mcqLayout, setMcqLayout] = useState('4_col'); // '2_col' | '4_col'
    const [urduOptionFormat, setUrduOptionFormat] = useState('alif_bay'); // 'alif_bay' | 'abcd'
    const [showAnswerKey, setShowAnswerKey] = useState(true);

    // Dynamic question pool aggregated strictly from selected chapters
    const selectedChapterObjs = firestoreChapters.filter(c => selectedChapterIds.includes(c.id));
    const allSelectedQuestions = selectedChapterObjs.flatMap(c => (c.questions || []));

    const availableCounts = {
        mcq: allSelectedQuestions.filter(q => q.type === 'mcq').length,
        blank: allSelectedQuestions.filter(q => q.type === 'blank').length,
        true_false: allSelectedQuestions.filter(q => q.type === 'true_false').length,
        short: allSelectedQuestions.filter(q => q.type === 'short' || (!q.type && q.type !== 'mcq' && q.type !== 'long' && q.type !== 'blank' && q.type !== 'true_false')).length,
        long: allSelectedQuestions.filter(q => q.type === 'long').length,
        total: allSelectedQuestions.length
    };

    // Auto-adjust default counts when availableCounts changes to prevent out-of-bound configurations
    useEffect(() => {
        if (availableCounts.mcq > 0) {
            setMcqCount(prev => prev === 0 ? Math.min(10, availableCounts.mcq) : Math.min(prev, availableCounts.mcq));
        } else {
            setMcqCount(0);
        }

        if (availableCounts.blank > 0) {
            setBlankCount(prev => prev === 0 ? Math.min(5, availableCounts.blank) : Math.min(prev, availableCounts.blank));
        } else {
            setBlankCount(0);
        }

        if (availableCounts.true_false > 0) {
            setTfCount(prev => prev === 0 ? Math.min(5, availableCounts.true_false) : Math.min(prev, availableCounts.true_false));
        } else {
            setTfCount(0);
        }

        if (availableCounts.short > 0) {
            setShortCount(prev => {
                const target = prev === 0 ? Math.min(8, availableCounts.short) : Math.min(prev, availableCounts.short);
                return target;
            });
            setShortAttempt(prev => {
                const maxShort = Math.min(shortCount || 8, availableCounts.short);
                return prev === 0 ? Math.min(6, maxShort) : Math.min(prev, maxShort);
            });
        } else {
            setShortCount(0);
            setShortAttempt(0);
        }

        if (availableCounts.long > 0) {
            setLongCount(prev => {
                const target = prev === 0 ? Math.min(3, availableCounts.long) : Math.min(prev, availableCounts.long);
                return target;
            });
            setLongAttempt(prev => {
                const maxLong = Math.min(longCount || 3, availableCounts.long);
                return prev === 0 ? Math.min(2, maxLong) : Math.min(prev, maxLong);
            });
        } else {
            setLongCount(0);
            setLongAttempt(0);
        }
    }, [selectedChapterIds, firestoreChapters]);

    // Calculated Blueprint Metrics
    const totalMarks = (mcqCount * mcqMarksEach) + 
                       (blankCount * blankMarksEach) + 
                       (tfCount * tfMarksEach) + 
                       (shortAttempt * shortMarksEach) + 
                       (longAttempt * longMarksEach);

    // --- STEP 2: GENERATED PAPER STATE ---
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedPaper, setGeneratedPaper] = useState(null);
    const [availablePool, setAvailablePool] = useState({ mcqs: [], blanks: [], true_false: [], shorts: [], longs: [] });
    const [activeView, setActiveView] = useState('config'); // 'config' | 'preview'
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

    const printRef = useRef(null);

    // Helper: Extract Chapter Number
    const extractChapterNumber = (title) => {
        if (!title) return 999;
        const match = title.match(/(?:chapter|unit|ch|sabaq|unwan)?\s*(\d+)/i) || title.match(/\d+/);
        return match ? parseInt(match[1] || match[0], 10) : 999;
    };

    // Helper: Accurately detect if text is predominantly Urdu or English (prevents BiDi scramble for inline Arabic Durood)
    const isUrduText = (text, subject = '') => {
        if (!text) return false;
        const isUrduSubject = /^(urdu|islamiat|islamiyat|arabic|sindhi|pashto|tarjuma)/i.test((subject || '').trim());
        
        const urduChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
        const latinChars = (text.match(/[a-zA-Z]/g) || []).length;

        // If text has significantly more Urdu characters than English/Latin characters
        if (urduChars > latinChars && urduChars > 3) return true;
        
        // If text has NO English characters and has Urdu/Arabic
        if (latinChars === 0 && urduChars > 0) return true;
        
        // If subject is specifically Urdu/Islamiat and has very few Latin characters
        if (isUrduSubject && latinChars < 5 && urduChars > 0) return true;

        return false;
    };

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

                    // Fetch School's Classes
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

    // 2. Update Subjects when Class changes & auto-recommend preset
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

            // Smart preset recommendation for Primary (Class 1-5) vs Secondary (Class 6-10)
            const classNameLower = (currentClass.name || '').toLowerCase();
            const isPrimary = /\b(1|2|3|4|5|nursery|kg|prep|primary|playgroup)\b/.test(classNameLower);
            if (isPrimary && (selectedPreset === 'mid_term' || selectedPreset === 'final_board')) {
                handleApplyPreset('primary_worksheet');
            }
        }
    }, [selectedClassId, classes]);

    // 3. Fetch Real Chapters from Firestore (from Upload Syllabus)
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

                // Auto-select all uploaded chapters by default
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

    // Quick Syllabus Selection Helpers
    const handleSelectAllChapters = () => {
        setSelectedChapterIds(firestoreChapters.map(c => c.id));
    };

    const handleSelectHalfBook = (half) => {
        const total = firestoreChapters.length;
        const mid = Math.ceil(total / 2);
        if (half === 1) {
            setSelectedChapterIds(firestoreChapters.slice(0, mid).map(c => c.id));
        } else {
            setSelectedChapterIds(firestoreChapters.slice(mid).map(c => c.id));
        }
    };

    const handleToggleChapter = (chId) => {
        setSelectedChapterIds(prev => {
            if (prev.includes(chId)) {
                if (prev.length === 1) return prev; // Keep at least one
                return prev.filter(id => id !== chId);
            } else {
                return [...prev, chId];
            }
        });
    };

    // Apply Preset (Clamped to available questions in syllabus)
    const handleApplyPreset = (presetId) => {
        setSelectedPreset(presetId);
        const preset = EXAM_PRESETS.find(p => p.id === presetId);
        if (preset) {
            setTimeAllowed(preset.timeAllowed);
            setMcqCount(Math.min(preset.mcqCount, availableCounts.mcq));
            setMcqMarksEach(preset.mcqMarksEach);
            setBlankCount(Math.min(preset.blankCount || 0, availableCounts.blank));
            setBlankMarksEach(preset.blankMarksEach || 1);
            setTfCount(Math.min(preset.tfCount || 0, availableCounts.true_false));
            setTfMarksEach(preset.tfMarksEach || 1);
            const targetShort = Math.min(preset.shortCount, availableCounts.short);
            setShortCount(targetShort);
            setShortAttempt(Math.min(preset.shortAttempt, targetShort));
            setShortMarksEach(preset.shortMarksEach);
            const targetLong = Math.min(preset.longCount, availableCounts.long);
            setLongCount(targetLong);
            setLongAttempt(Math.min(preset.longAttempt, targetLong));
            setLongMarksEach(preset.longMarksEach);
            if (typeof preset.showAnswerLines === 'boolean') {
                setShowAnswerLines(preset.showAnswerLines);
            }
        }
    };

    // 4. Generate Paper from REAL Scanned Questions
    const handleGeneratePaper = () => {
        if (firestoreChapters.length === 0) {
            alert(`No chapters found for ${selectedSubject} in ${selectedClassName}. Please upload syllabus in "Settings -> Upload Syllabus" first.`);
            return;
        }

        if (selectedChapterIds.length === 0) {
            alert('Please select at least one chapter to generate the exam paper.');
            return;
        }

        setIsGenerating(true);
        try {
            const selectedChapterObjs = firestoreChapters.filter(c => selectedChapterIds.includes(c.id));
            
            // Gather all real questions from the selected chapters
            let allQuestions = [];
            selectedChapterObjs.forEach(ch => {
                const qs = ch.questions || [];
                qs.forEach(q => {
                    allQuestions.push({
                        ...q,
                        chapterId: ch.id,
                        chapterTitle: ch.title
                    });
                });
            });

            if (allQuestions.length === 0) {
                alert(`No exercise questions have been saved yet for the selected chapters of ${selectedSubject}.\n\nPlease go to "Settings -> Upload Syllabus", select the chapter, and scan exercise photos or upload PDF to save questions.`);
                setIsGenerating(false);
                return;
            }

            // Segregate by Type
            let mcqPool = allQuestions.filter(q => q.type === 'mcq');
            let blankPool = allQuestions.filter(q => q.type === 'blank');
            let tfPool = allQuestions.filter(q => q.type === 'true_false');
            let shortPool = allQuestions.filter(q => q.type === 'short' || (!q.type && q.type !== 'mcq' && q.type !== 'long'));
            let longPool = allQuestions.filter(q => q.type === 'long');

            // Fisher-Yates Shuffle
            const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

            const shuffledMcqs = shuffle(mcqPool);
            const shuffledBlanks = shuffle(blankPool);
            const shuffledTfs = shuffle(tfPool);
            const shuffledShorts = shuffle(shortPool);
            const shuffledLongs = shuffle(longPool);

            // Determine actual questions to display
            const targetMcqs = Math.min(mcqCount, shuffledMcqs.length);
            const targetBlanks = Math.min(blankCount, shuffledBlanks.length);
            const targetTfs = Math.min(tfCount, shuffledTfs.length);
            const targetShorts = Math.min(shortCount, shuffledShorts.length);
            const targetLongs = Math.min(longCount, shuffledLongs.length);

            const pickedMcqs = shuffledMcqs.slice(0, targetMcqs);
            const pickedBlanks = shuffledBlanks.slice(0, targetBlanks);
            const pickedTfs = shuffledTfs.slice(0, targetTfs);
            const pickedShorts = shuffledShorts.slice(0, targetShorts);
            const pickedLongs = shuffledLongs.slice(0, targetLongs);

            const actualShortAttempt = Math.min(shortAttempt, targetShorts);
            const actualLongAttempt = Math.min(longAttempt, targetLongs);

            const actualTotalMarks = (targetMcqs * mcqMarksEach) + 
                                     (targetBlanks * blankMarksEach) + 
                                     (targetTfs * tfMarksEach) + 
                                     (actualShortAttempt * shortMarksEach) + 
                                     (actualLongAttempt * longMarksEach);

            setAvailablePool({
                mcqs: shuffledMcqs.slice(targetMcqs),
                blanks: shuffledBlanks.slice(targetBlanks),
                true_false: shuffledTfs.slice(targetTfs),
                shorts: shuffledShorts.slice(targetShorts),
                longs: shuffledLongs.slice(targetLongs)
            });

            setGeneratedPaper({
                examTitle,
                academicSession,
                campusName,
                classSection,
                examDate,
                class: selectedClassName,
                subject: selectedSubject,
                chapters: selectedChapterObjs.map(c => c.title),
                timeAllowed,
                instructions,
                showWatermark,
                showSchoolLogo,
                languageMode,
                paperStyle,
                fontSize,
                mcqLayout,
                urduOptionFormat,
                showAnswerLines,
                answerLineCount,
                totalMarks: actualTotalMarks,
                mcqs: pickedMcqs,
                blanks: pickedBlanks,
                true_false: pickedTfs,
                shorts: pickedShorts,
                longs: pickedLongs,
                mcqMarksEach,
                blankMarksEach,
                tfMarksEach,
                shortMarksEach,
                longMarksEach,
                shortAttempt: actualShortAttempt,
                longAttempt: actualLongAttempt
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

    // Swap single question with alternate from pool
    const handleSwapQuestion = (type, index) => {
        if (!generatedPaper) return;

        let poolKey = type === 'mcq' ? 'mcqs' : type === 'blank' ? 'blanks' : type === 'true_false' ? 'true_false' : type === 'short' ? 'shorts' : 'longs';
        let currentPool = [...(availablePool[poolKey] || [])];
        let currentList = [...(generatedPaper[poolKey] || [])];

        if (currentPool.length === 0) {
            alert(`No more alternate ${type.toUpperCase().replace('_', ' ')} questions available in the current scanned pool.`);
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

    // Download High-Fidelity Multi-Page PDF Document
    const handleDownloadPdf = async () => {
        if (!printRef.current) return;
        setIsDownloadingPdf(true);
        try {
            const paperEl = printRef.current;

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

            const pdfWidth = 210;
            const pdfHeight = 297;
            const marginMm = 10;
            const contentWidthMm = pdfWidth - (marginMm * 2);
            const contentHeightMm = pdfHeight - (marginMm * 2);

            const scaleRatio = canvas.width / paperEl.offsetWidth;
            const maxPageCanvasHeight = (contentHeightMm / contentWidthMm) * canvas.width;

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

                let targetEndY = currentY + maxPageCanvasHeight;
                if (targetEndY >= canvas.height) {
                    targetEndY = canvas.height;
                } else {
                    const validBreaks = breakPointsPx.filter(bp => bp > currentY + 100 && bp <= targetEndY);
                    if (validBreaks.length > 0) {
                        targetEndY = validBreaks[validBreaks.length - 1];
                    }
                }

                const sliceHeight = targetEndY - currentY;
                if (sliceHeight <= 0) break;

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
            const fileName = `${schoolInfo.name.replace(/[^a-zA-Z0-9]/g, '_')}_Class${selectedClassName}_${cleanSubject}_ExamPaper.pdf`;
            pdf.save(fileName);
        } catch (err) {
            console.error("PDF download error:", err);
            window.print();
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    const handlePrintPaper = () => {
        window.print();
    };

    return (
        <div style={{ padding: '1.5rem', color: '#1e293b', minHeight: '100vh', background: '#f8fafc' }}>
            
            {/* Scoped Urdu Nastaliq Book Typography & Print Rules */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap');
                .urdu-paper-font {
                    font-family: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaliq', 'Urdu Typesetting', 'Amiri', 'Segoe UI', Tahoma, serif !important;
                    line-height: 2.2 !important;
                    letter-spacing: 0px !important;
                    word-spacing: 0px !important;
                    font-feature-settings: "liga" 1;
                    text-rendering: optimizeLegibility;
                }
                @media print {
                    .no-print { display: none !important; }
                    body { background: #ffffff !important; }
                    .printable-paper { 
                        border: none !important; 
                        box-shadow: none !important; 
                        padding: 0 !important; 
                        margin: 0 !important; 
                        width: 100% !important; 
                    }
                }
            `}</style>

            {/* Top Navigation Bar (Hidden on Print) */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem', background: '#ffffff', padding: '1.25rem 1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: '10px', background: 'linear-gradient(135deg, #1e40af, #2563eb)', display: 'flex' }}>
                            <FileCheck size={22} color="#ffffff" />
                        </div>
                        Exam Paper Studio & Question Bank
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                        Generates genuine exam papers directly from your <strong>Uploaded Syllabus & Scanned Exercise Questions</strong>
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
                            background: activeView === 'config' ? '#1e40af' : '#f1f5f9',
                            color: activeView === 'config' ? '#ffffff' : '#475569',
                            border: '1px solid ' + (activeView === 'config' ? '#1e40af' : '#cbd5e1')
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
                                    background: activeView === 'preview' ? '#1e40af' : '#f1f5f9',
                                    color: activeView === 'preview' ? '#ffffff' : '#475569',
                                    border: '1px solid ' + (activeView === 'preview' ? '#1e40af' : '#cbd5e1')
                                }}
                            >
                                <Eye size={16} />
                                View Paper Canvas
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
                                    background: 'linear-gradient(135deg, #1e40af, #2563eb)',
                                    color: '#ffffff',
                                    border: 'none',
                                    boxShadow: '0 4px 12px rgba(30, 64, 175, 0.3)'
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
                            { id: 'syllabus', label: '1. Syllabus & Chapter Selector', icon: BookOpen },
                            { id: 'blueprint', label: '2. Blueprint & Marks Scheme', icon: Sliders },
                            { id: 'exam_info', label: '3. Exam Profile & Header', icon: School },
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
                                        borderBottom: isActive ? '3px solid #1e40af' : '3px solid transparent',
                                        background: isActive ? '#ffffff' : 'rgba(255,255,255,0.6)',
                                        color: isActive ? '#1e40af' : '#64748b',
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
                        
                        {/* TAB 1: SYLLABUS & CHAPTER SELECTOR (Real Uploaded Chapters) */}
                        {activeSettingsTab === 'syllabus' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <BookOpen size={22} color="#1e40af" />
                                        Target Class, Subject & Uploaded Chapters
                                    </h2>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                                        Choose the class and subject to load all scanned chapters from your school's database. Select which chapters to include in this exam paper.
                                    </p>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>1. Select Target Class</label>
                                        <select
                                            value={selectedClassId}
                                            onChange={(e) => setSelectedClassId(e.target.value)}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', fontWeight: '700', color: '#1e293b', background: '#fff' }}
                                        >
                                            {classes.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>2. Select Subject</label>
                                        <select
                                            value={selectedSubject}
                                            onChange={(e) => setSelectedSubject(e.target.value)}
                                            disabled={availableSubjects.length === 0}
                                            style={{
                                                width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', fontWeight: '700',
                                                color: availableSubjects.length === 0 ? '#94a3b8' : '#1e293b',
                                                background: availableSubjects.length === 0 ? '#f8fafc' : '#fff',
                                                cursor: availableSubjects.length === 0 ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            {availableSubjects.length === 0 ? (
                                                <option value="">No subjects assigned to this class</option>
                                            ) : (
                                                availableSubjects.map(s => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))
                                            )}
                                        </select>
                                    </div>
                                </div>

                                {loadingChapters ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: '#475569', gap: '0.5rem' }}>
                                        <Loader2 className="animate-spin" size={24} color="#1e40af" />
                                        <span>Loading uploaded chapters from Firestore...</span>
                                    </div>
                                ) : firestoreChapters.length === 0 ? (
                                    <div style={{ padding: '2.5rem', background: '#f8fafc', borderRadius: '12px', border: '2px dashed #cbd5e1', textAlign: 'center' }}>
                                        <AlertCircle size={36} color="#d97706" style={{ margin: '0 auto 0.75rem' }} />
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                                            No Syllabus Uploaded for {selectedSubject} ({selectedClassName})
                                        </h3>
                                        <p style={{ fontSize: '0.9rem', color: '#64748b', margin: '0.5rem 0 1.25rem 0' }}>
                                            Please go to <strong>Settings &rarr; Upload Syllabus</strong> to upload the book index and exercise questions.
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Fast Range Selection Bar */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', background: '#eff6ff', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #dbeafe' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <ListFilter size={16} />
                                                Quick Range Selection:
                                            </span>
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    onClick={handleSelectAllChapters}
                                                    style={{ padding: '0.35rem 0.75rem', background: '#ffffff', border: '1px solid #93c5fd', color: '#1e40af', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer' }}
                                                >
                                                    Full Book (All {firestoreChapters.length} Chapters)
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
                                                    onClick={() => setSelectedChapterIds(firestoreChapters.slice(0, 1).map(c => c.id))}
                                                    style={{ padding: '0.35rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' }}
                                                >
                                                    Chapter 1 Only
                                                </button>
                                            </div>
                                        </div>

                                        {/* Chapters Grid with Blue Background & Urdu Nastaliq Typography */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.6rem' }}>
                                                Select Chapters to Include in Exam Paper ({selectedChapterIds.length} of {firestoreChapters.length} Selected):
                                            </label>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.85rem' }}>
                                                {firestoreChapters.map((ch, idx) => {
                                                    const isSelected = selectedChapterIds.includes(ch.id);
                                                    const isUrdu = isUrduText(ch.title, selectedSubject);
                                                    const qCount = ch.questions?.length || 0;
                                                    const mcqCountInChapter = (ch.questions || []).filter(q => q.type === 'mcq').length;
                                                    const shortCountInChapter = (ch.questions || []).filter(q => q.type === 'short' || !q.type).length;
                                                    const longCountInChapter = (ch.questions || []).filter(q => q.type === 'long').length;

                                                    return (
                                                        <div
                                                            key={ch.id}
                                                            onClick={() => handleToggleChapter(ch.id)}
                                                            dir={isUrdu ? "rtl" : "ltr"}
                                                            style={{
                                                                padding: '1rem',
                                                                borderRadius: '12px',
                                                                border: isSelected ? '2px solid #1e40af' : '1px solid #cbd5e1',
                                                                background: isSelected 
                                                                    ? 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)' 
                                                                    : '#ffffff',
                                                                color: isSelected ? '#ffffff' : '#1e293b',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'flex-start',
                                                                gap: '0.85rem',
                                                                boxShadow: isSelected ? '0 4px 12px rgba(30, 64, 175, 0.25)' : 'none',
                                                                transition: 'all 0.2s ease'
                                                            }}
                                                        >
                                                            {/* Number / Check Badge */}
                                                            <div style={{
                                                                width: '30px',
                                                                height: '30px',
                                                                borderRadius: '50%',
                                                                background: isSelected ? '#ffffff' : '#f1f5f9',
                                                                color: isSelected ? '#1e40af' : '#64748b',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontSize: '0.85rem',
                                                                fontWeight: '800',
                                                                flexShrink: 0,
                                                                marginTop: '2px'
                                                            }}>
                                                                {isSelected ? '✓' : (idx + 1)}
                                                            </div>

                                                            <div style={{ flex: 1 }}>
                                                                <div 
                                                                    dir={isUrdu ? "rtl" : "ltr"}
                                                                    style={{ 
                                                                        fontSize: isUrdu ? '1.08rem' : '0.95rem', 
                                                                        fontWeight: '700', 
                                                                        color: isSelected ? '#ffffff' : '#1e293b',
                                                                        lineHeight: isUrdu ? '1.8' : '1.4',
                                                                        fontFamily: isUrdu ? '"Noto Nastaliq Urdu", "Noto Sans Arabic", "Jameel Noori Nastaleeq", serif' : 'inherit',
                                                                        textAlign: isUrdu ? 'right' : 'left'
                                                                    }}
                                                                >
                                                                    {ch.title}
                                                                </div>

                                                                {/* Question Stats Pill */}
                                                                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                                                                    <span style={{
                                                                        fontSize: '0.72rem',
                                                                        padding: '2px 8px',
                                                                        borderRadius: '12px',
                                                                        background: isSelected ? 'rgba(255,255,255,0.25)' : '#eff6ff',
                                                                        color: isSelected ? '#ffffff' : '#1e40af',
                                                                        fontWeight: '700',
                                                                        border: isSelected ? '1px solid rgba(255,255,255,0.3)' : '1px solid #dbeafe'
                                                                    }}>
                                                                        {qCount > 0 ? `${qCount} Scanned Questions (${mcqCountInChapter} MCQs, ${shortCountInChapter} Short, ${longCountInChapter} Long)` : 'No Questions Yet'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* TAB 2: BLUEPRINT & MARKS SCHEME (100% Dynamic & Syllabus-Adaptive) */}
                        {activeSettingsTab === 'blueprint' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Sliders size={22} color="#1e40af" />
                                        Paper Blueprint & Marks Scheme
                                    </h2>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                                        Customized automatically based on your <strong>Step 1 Syllabus & Chapter Selection</strong>. Only available question types are shown.
                                    </p>
                                </div>

                                {/* Dynamic Scope & Pool Breakdown Banner */}
                                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '12px', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <BookOpen size={16} />
                                                Syllabus Scope:
                                            </span>
                                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#0c4a6e' }}>
                                                {selectedClassName || 'No Class'} • {selectedSubject || 'No Subject'} ({selectedChapterIds.length} of {firestoreChapters.length} Chapters Selected)
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#0284c7', background: '#e0f2fe', padding: '3px 12px', borderRadius: '20px', border: '1px solid #bae6fd' }}>
                                            {availableCounts.total} Questions in Selected Syllabus
                                        </span>
                                    </div>

                                    {/* Breakdown Tags */}
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px dashed #bae6fd' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b' }}>Detected Pools:</span>
                                        {availableCounts.mcq > 0 ? (
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: '#dbeafe', color: '#1e40af', fontWeight: '700', border: '1px solid #bfdbfe' }}>
                                                ✓ {availableCounts.mcq} MCQs
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: '#f1f5f9', color: '#94a3b8', fontWeight: '600' }}>
                                                0 MCQs
                                            </span>
                                        )}
                                        
                                        {availableCounts.blank > 0 ? (
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: '#d1fae5', color: '#065f46', fontWeight: '700', border: '1px solid #a7f3d0' }}>
                                                ✓ {availableCounts.blank} Blanks
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: '#f1f5f9', color: '#94a3b8', fontWeight: '600' }}>
                                                0 Blanks
                                            </span>
                                        )}

                                        {availableCounts.true_false > 0 ? (
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: '#ede9fe', color: '#5b21b6', fontWeight: '700', border: '1px solid #ddd6fe' }}>
                                                ✓ {availableCounts.true_false} True/False
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: '#f1f5f9', color: '#94a3b8', fontWeight: '600' }}>
                                                0 True/False
                                            </span>
                                        )}

                                        {availableCounts.short > 0 ? (
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: '#e0e7ff', color: '#3730a3', fontWeight: '700', border: '1px solid #c7d2fe' }}>
                                                ✓ {availableCounts.short} Short Qs
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: '#f1f5f9', color: '#94a3b8', fontWeight: '600' }}>
                                                0 Short Qs
                                            </span>
                                        )}

                                        {availableCounts.long > 0 ? (
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: '#fef3c7', color: '#92400e', fontWeight: '700', border: '1px solid #fde68a' }}>
                                                ✓ {availableCounts.long} Long Qs
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: '#f1f5f9', color: '#94a3b8', fontWeight: '600' }}>
                                                0 Long Qs
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {availableCounts.total === 0 ? (
                                    /* Empty State Warning if no questions exist in chosen chapters */
                                    <div style={{ padding: '2.5rem', background: '#fffbeb', borderRadius: '12px', border: '2px dashed #fcd34d', textAlign: 'center' }}>
                                        <AlertTriangle size={40} color="#d97706" style={{ margin: '0 auto 0.75rem' }} />
                                        <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#92400e', margin: 0 }}>
                                            No Scanned Questions Found in Selected Chapters
                                        </h3>
                                        <p style={{ fontSize: '0.9rem', color: '#b45309', margin: '0.5rem 0 1.25rem 0', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
                                            The chapters currently selected in <strong>Step 1</strong> do not have any scanned exercise questions saved yet. Please go to <strong>Settings &rarr; Upload Syllabus</strong> to scan book exercises, or select other chapters with questions.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setActiveSettingsTab('syllabus')}
                                            style={{
                                                padding: '0.65rem 1.5rem',
                                                borderRadius: '8px',
                                                background: '#1e40af',
                                                color: '#fff',
                                                fontWeight: '700',
                                                fontSize: '0.875rem',
                                                border: 'none',
                                                cursor: 'pointer',
                                                boxShadow: '0 2px 8px rgba(30,64,175,0.25)'
                                            }}
                                        >
                                            &larr; Return to Step 1 (Chapter Selector)
                                        </button>
                                    </div>
                                ) : (
                                    /* Dynamic Question Sections Grid */
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
                                        
                                        {/* SECTION: MCQs (Shown only if MCQs exist in selected chapters) */}
                                        {availableCounts.mcq > 0 && (
                                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '0.5rem' }}>
                                                        <div>
                                                            <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#1e293b' }}>Objective MCQs</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>کثیر الانتخابی سوالات</div>
                                                        </div>
                                                        <span style={{ background: '#1e40af', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '800', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                                            {mcqCount * mcqMarksEach} Marks
                                                        </span>
                                                    </div>

                                                    {/* Live Availability Badge */}
                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: '700', color: '#1e40af', background: '#dbeafe', padding: '3px 8px', borderRadius: '6px' }}>
                                                            🟢 Available in Syllabus: {availableCounts.mcq} MCQs
                                                        </span>
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>
                                                                Number of MCQs
                                                                <span style={{ color: '#64748b', fontWeight: '400', marginLeft: '4px' }}>(Max: {availableCounts.mcq})</span>
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={availableCounts.mcq}
                                                                value={mcqCount}
                                                                onChange={(e) => {
                                                                    const val = Number(e.target.value);
                                                                    setMcqCount(Math.min(Math.max(0, val), availableCounts.mcq));
                                                                }}
                                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: '700', marginTop: '4px' }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>Marks Each</label>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="5"
                                                                value={mcqMarksEach}
                                                                onChange={(e) => setMcqMarksEach(Math.max(1, Number(e.target.value)))}
                                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: '700', marginTop: '4px' }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* SECTION: FILL IN THE BLANKS (Shown only if Blanks exist in selected chapters) */}
                                        {availableCounts.blank > 0 && (
                                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '0.5rem' }}>
                                                        <div>
                                                            <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#1e293b' }}>Fill in the Blanks</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>خالی جگہ پر کریں</div>
                                                        </div>
                                                        <span style={{ background: '#059669', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '800', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                                            {blankCount * blankMarksEach} Marks
                                                        </span>
                                                    </div>

                                                    {/* Live Availability Badge */}
                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: '700', color: '#065f46', background: '#d1fae5', padding: '3px 8px', borderRadius: '6px' }}>
                                                            🟢 Available in Syllabus: {availableCounts.blank} Blanks
                                                        </span>
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>
                                                                Number of Blanks
                                                                <span style={{ color: '#64748b', fontWeight: '400', marginLeft: '4px' }}>(Max: {availableCounts.blank})</span>
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={availableCounts.blank}
                                                                value={blankCount}
                                                                onChange={(e) => {
                                                                    const val = Number(e.target.value);
                                                                    setBlankCount(Math.min(Math.max(0, val), availableCounts.blank));
                                                                }}
                                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: '700', marginTop: '4px' }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>Marks Each</label>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="5"
                                                                value={blankMarksEach}
                                                                onChange={(e) => setBlankMarksEach(Math.max(1, Number(e.target.value)))}
                                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: '700', marginTop: '4px' }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* SECTION: TRUE / FALSE (Shown only if True/False exist in selected chapters) */}
                                        {availableCounts.true_false > 0 && (
                                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '0.5rem' }}>
                                                        <div>
                                                            <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#1e293b' }}>True / False</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>درست یا غلط</div>
                                                        </div>
                                                        <span style={{ background: '#7c3aed', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '800', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                                            {tfCount * tfMarksEach} Marks
                                                        </span>
                                                    </div>

                                                    {/* Live Availability Badge */}
                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: '700', color: '#5b21b6', background: '#ede9fe', padding: '3px 8px', borderRadius: '6px' }}>
                                                            🟢 Available in Syllabus: {availableCounts.true_false} Questions
                                                        </span>
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>
                                                                Number of True/False
                                                                <span style={{ color: '#64748b', fontWeight: '400', marginLeft: '4px' }}>(Max: {availableCounts.true_false})</span>
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={availableCounts.true_false}
                                                                value={tfCount}
                                                                onChange={(e) => {
                                                                    const val = Number(e.target.value);
                                                                    setTfCount(Math.min(Math.max(0, val), availableCounts.true_false));
                                                                }}
                                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: '700', marginTop: '4px' }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>Marks Each</label>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="5"
                                                                value={tfMarksEach}
                                                                onChange={(e) => setTfMarksEach(Math.max(1, Number(e.target.value)))}
                                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: '700', marginTop: '4px' }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* SECTION: SHORT QUESTIONS (Shown only if Short Qs exist in selected chapters) */}
                                        {availableCounts.short > 0 && (
                                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '0.5rem' }}>
                                                        <div>
                                                            <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#1e293b' }}>Short Questions</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>مختصر سوالات</div>
                                                        </div>
                                                        <span style={{ background: '#1e40af', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '800', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                                            {shortAttempt * shortMarksEach} Marks
                                                        </span>
                                                    </div>

                                                    {/* Live Availability Badge */}
                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: '700', color: '#1e40af', background: '#dbeafe', padding: '3px 8px', borderRadius: '6px' }}>
                                                            🟢 Available in Syllabus: {availableCounts.short} Short Questions
                                                        </span>
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>
                                                                Given Qs
                                                                <span style={{ color: '#64748b', fontWeight: '400', display: 'block', fontSize: '0.7rem' }}>(Max: {availableCounts.short})</span>
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={availableCounts.short}
                                                                value={shortCount}
                                                                onChange={(e) => {
                                                                    const val = Number(e.target.value);
                                                                    const clamped = Math.min(Math.max(0, val), availableCounts.short);
                                                                    setShortCount(clamped);
                                                                    if (shortAttempt > clamped) setShortAttempt(clamped);
                                                                }}
                                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: '700', marginTop: '4px' }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>
                                                                To Attempt
                                                                <span style={{ color: '#64748b', fontWeight: '400', display: 'block', fontSize: '0.7rem' }}>(Max: {shortCount})</span>
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={shortCount}
                                                                value={shortAttempt}
                                                                onChange={(e) => {
                                                                    const val = Number(e.target.value);
                                                                    setShortAttempt(Math.min(Math.max(0, val), shortCount));
                                                                }}
                                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: '700', marginTop: '4px' }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>
                                                                Marks Each
                                                                <span style={{ color: '#64748b', fontWeight: '400', display: 'block', fontSize: '0.7rem' }}>&nbsp;</span>
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="10"
                                                                value={shortMarksEach}
                                                                onChange={(e) => setShortMarksEach(Math.max(1, Number(e.target.value)))}
                                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: '700', marginTop: '4px' }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Answer Writing Ruled Lines Toggle */}
                                                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: '600', color: '#334155', cursor: 'pointer' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={showAnswerLines}
                                                                onChange={(e) => setShowAnswerLines(e.target.checked)}
                                                                style={{ width: '16px', height: '16px', accentColor: '#1e40af' }}
                                                            />
                                                            Student Ruled Lines
                                                        </label>
                                                        {showAnswerLines && (
                                                            <select
                                                                value={answerLineCount}
                                                                onChange={(e) => setAnswerLineCount(Number(e.target.value))}
                                                                style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.75rem', fontWeight: '600' }}
                                                            >
                                                                <option value="2">2 Lines</option>
                                                                <option value="3">3 Lines</option>
                                                                <option value="4">4 Lines</option>
                                                            </select>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* SECTION: LONG QUESTIONS (Shown only if Long Qs exist in selected chapters) */}
                                        {availableCounts.long > 0 && (
                                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '0.5rem' }}>
                                                        <div>
                                                            <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#1e293b' }}>Long Questions</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>تفصیلی سوالات</div>
                                                        </div>
                                                        <span style={{ background: '#b45309', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '800', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                                            {longAttempt * longMarksEach} Marks
                                                        </span>
                                                    </div>

                                                    {/* Live Availability Badge */}
                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: '700', color: '#92400e', background: '#fef3c7', padding: '3px 8px', borderRadius: '6px' }}>
                                                            🟢 Available in Syllabus: {availableCounts.long} Long Questions
                                                        </span>
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>
                                                                Given Qs
                                                                <span style={{ color: '#64748b', fontWeight: '400', display: 'block', fontSize: '0.7rem' }}>(Max: {availableCounts.long})</span>
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={availableCounts.long}
                                                                value={longCount}
                                                                onChange={(e) => {
                                                                    const val = Number(e.target.value);
                                                                    const clamped = Math.min(Math.max(0, val), availableCounts.long);
                                                                    setLongCount(clamped);
                                                                    if (longAttempt > clamped) setLongAttempt(clamped);
                                                                }}
                                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: '700', marginTop: '4px' }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>
                                                                To Attempt
                                                                <span style={{ color: '#64748b', fontWeight: '400', display: 'block', fontSize: '0.7rem' }}>(Max: {longCount})</span>
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={longCount}
                                                                value={longAttempt}
                                                                onChange={(e) => {
                                                                    const val = Number(e.target.value);
                                                                    setLongAttempt(Math.min(Math.max(0, val), longCount));
                                                                }}
                                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: '700', marginTop: '4px' }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>
                                                                Marks Each
                                                                <span style={{ color: '#64748b', fontWeight: '400', display: 'block', fontSize: '0.7rem' }}>&nbsp;</span>
                                                            </label>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="15"
                                                                value={longMarksEach}
                                                                onChange={(e) => setLongMarksEach(Math.max(1, Number(e.target.value)))}
                                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: '700', marginTop: '4px' }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB 3: EXAM PROFILE & HEADER */}
                        {activeSettingsTab === 'exam_info' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <School size={22} color="#1e40af" />
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
                                            style={{ width: '18px', height: '18px', accentColor: '#1e40af' }}
                                        />
                                        Include Official School Logo in Header
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', color: '#334155' }}>
                                        <input
                                            type="checkbox"
                                            checked={showWatermark}
                                            onChange={(e) => setShowWatermark(e.target.checked)}
                                            style={{ width: '18px', height: '18px', accentColor: '#1e40af' }}
                                        />
                                        Render Light Anti-Piracy Watermark on Paper
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* TAB 4: TYPESETTING & LANGUAGE STYLE */}
                        {activeSettingsTab === 'typesetting' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <LayoutGrid size={22} color="#1e40af" />
                                        Paper Layout, Language & Print Typography
                                    </h2>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                                        Set your page density and font rendering style.
                                    </p>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.25rem' }}>
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
                                            <option value="normal">Standard (11pt / 12pt)</option>
                                            <option value="large">Large Print (13pt / 14pt Easy-to-Read)</option>
                                            <option value="compact">Compact Print (10pt)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* BLUEPRINT SUMMARY & LAUNCH BAR */}
                    <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)', color: '#ffffff', padding: '1.5rem 2rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem', boxShadow: '0 8px 24px rgba(30, 64, 175, 0.25)' }}>
                        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '700' }}>TOTAL MARKS</span>
                                <div style={{ fontSize: '2rem', fontWeight: '900', color: '#ffffff', lineHeight: 1 }}>{totalMarks}</div>
                            </div>
                            <div style={{ height: '36px', width: '1px', background: 'rgba(255,255,255,0.2)' }} />
                            <div>
                                <span style={{ fontSize: '0.75rem', color: '#93c5fd', fontWeight: '600' }}>Blueprint Summary</span>
                                <div style={{ fontSize: '0.95rem', fontWeight: '700' }}>
                                    {mcqCount} MCQs + {shortAttempt}/{shortCount} Short Qs + {longAttempt}/{longCount} Long Qs
                                </div>
                            </div>
                            <div style={{ height: '36px', width: '1px', background: 'rgba(255,255,255,0.2)' }} />
                            <div>
                                <span style={{ fontSize: '0.75rem', color: '#93c5fd', fontWeight: '600' }}>Syllabus Scope</span>
                                <div style={{ fontSize: '0.95rem', fontWeight: '700' }}>
                                    {selectedSubject} ({selectedClassName}) &bull; {selectedChapterIds.length} Chapters
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleGeneratePaper}
                            disabled={isGenerating || firestoreChapters.length === 0}
                            style={{
                                padding: '0.9rem 2.25rem',
                                borderRadius: '12px',
                                fontWeight: '800',
                                fontSize: '1.05rem',
                                cursor: isGenerating || firestoreChapters.length === 0 ? 'not-allowed' : 'pointer',
                                background: isGenerating || firestoreChapters.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                color: '#ffffff',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.6rem',
                                boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)'
                            }}
                        >
                            {isGenerating ? (
                                <>
                                    <RefreshCw className="animate-spin" size={20} />
                                    Synthesizing Real Paper...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={20} />
                                    1-Click Generate Paper from Syllabus
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
                            <span style={{ padding: '0.2rem 0.5rem', background: '#2563eb', borderRadius: '4px', fontWeight: '700' }}>Live Preview</span>
                            <span>Click <strong>"🔄 Swap"</strong> next to any question to pick an alternate from the scanned pool.</span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                onClick={handleDownloadPdf}
                                disabled={isDownloadingPdf}
                                style={{ padding: '0.45rem 1.1rem', background: '#1e40af', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '700', fontSize: '0.8rem', cursor: isDownloadingPdf ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
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
                            fontFamily: '"Times New Roman", "Noto Nastaliq Urdu", Times, serif',
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
                                <div><strong>Class:</strong> {generatedPaper.class} &nbsp;|&nbsp; <strong>Subject:</strong> {generatedPaper.subject}</div>
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
                                        [Marks: {generatedPaper.mcqs.length * generatedPaper.mcqMarksEach}]
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.75rem' }}>
                                    <strong>Q.1:</strong> Choose the correct option for each of the following questions. Each question carries {generatedPaper.mcqMarksEach} mark.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    {generatedPaper.mcqs.map((q, idx) => {
                                        const isUrduQ = isUrduText(q.question, generatedPaper.subject);
                                        const urduAlpha = ['(الف)', '(ب)', '(ج)', '(د)'];

                                        return (
                                            <div key={q.id || idx} className="question-item" style={{ breakInside: 'avoid', pageBreakInside: 'avoid', marginBottom: '0.35rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
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
                                                        <strong style={{ flexShrink: 0, fontSize: isUrduQ ? '1.05rem' : '0.95rem' }}>({idx + 1})</strong>
                                                        <span 
                                                            className={isUrduQ ? 'urdu-paper-font' : ''} 
                                                            style={{ 
                                                                fontSize: isUrduQ 
                                                                    ? (generatedPaper.fontSize === 'large' ? '1.3rem' : generatedPaper.fontSize === 'compact' ? '1.05rem' : '1.15rem') 
                                                                    : (generatedPaper.fontSize === 'large' ? '1.05rem' : generatedPaper.fontSize === 'compact' ? '0.85rem' : '0.95rem'), 
                                                                fontWeight: isUrduQ ? '600' : '500', 
                                                                lineHeight: isUrduQ ? '2.2' : '1.5',
                                                                flex: 1
                                                            }}
                                                        >
                                                            {q.question}
                                                        </span>
                                                    </div>

                                                    <button
                                                        onClick={() => handleSwapQuestion('mcq', idx)}
                                                        data-html2canvas-ignore="true"
                                                        className="no-print"
                                                        style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: '#1e40af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.5rem', flexShrink: 0 }}
                                                        title="Swap with alternate question from bank"
                                                    >
                                                        <RefreshCw size={11} /> Swap
                                                    </button>
                                                </div>

                                                {/* Options Grid */}
                                                {q.options?.length > 0 && (
                                                    <div 
                                                        dir={isUrduQ ? "rtl" : "ltr"}
                                                        style={{ 
                                                            display: 'grid', 
                                                            gridTemplateColumns: generatedPaper.mcqLayout === '2_col' ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', 
                                                            gap: '0.5rem', 
                                                            marginTop: '0.35rem', 
                                                            paddingLeft: isUrduQ ? '0' : '1.25rem',
                                                            paddingRight: isUrduQ ? '1.25rem' : '0',
                                                            fontSize: isUrduQ ? '1.05rem' : '0.9rem',
                                                            direction: isUrduQ ? 'rtl' : 'ltr',
                                                            textAlign: isUrduQ ? 'right' : 'left'
                                                        }}
                                                    >
                                                        {q.options.map((opt, oIdx) => (
                                                            <div key={oIdx} className={isUrduQ ? 'urdu-paper-font' : ''}>
                                                                <strong>
                                                                    {isUrduQ && generatedPaper.urduOptionFormat === 'alif_bay' 
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
                        )}

                        {/* SECTION B: FILL IN THE BLANKS (خالی جگہ پر کریں) */}
                        {generatedPaper.blanks?.length > 0 && (
                            <div style={{ marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
                                <div className="paper-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #000', paddingBottom: '0.25rem', marginBottom: '0.75rem', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', margin: 0, textTransform: 'uppercase' }}>
                                        Section - B: Fill in the Blanks (خالی جگہ پر کریں)
                                    </h3>
                                    <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>
                                        [Marks: {generatedPaper.blanks.length * generatedPaper.blankMarksEach}]
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.75rem' }}>
                                    <strong>Q.2:</strong> Fill in the blanks with suitable words / answers. Each question carries {generatedPaper.blankMarksEach} mark.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    {generatedPaper.blanks.map((q, idx) => {
                                        const isUrduQ = isUrduText(q.question, generatedPaper.subject);
                                        let displayText = q.question || '';
                                        if (!displayText.includes('____')) {
                                            displayText += ' ______________________';
                                        }

                                        return (
                                            <div key={q.id || idx} className="question-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', breakInside: 'avoid', pageBreakInside: 'avoid', marginBottom: '0.35rem', gap: '0.75rem' }}>
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
                                                    <strong style={{ flexShrink: 0, fontSize: isUrduQ ? '1.05rem' : '0.95rem' }}>({idx + 1})</strong>
                                                    <span 
                                                        className={isUrduQ ? 'urdu-paper-font' : ''} 
                                                        style={{ 
                                                            fontSize: isUrduQ 
                                                                ? (generatedPaper.fontSize === 'large' ? '1.3rem' : generatedPaper.fontSize === 'compact' ? '1.05rem' : '1.15rem')
                                                                : (generatedPaper.fontSize === 'large' ? '1.05rem' : generatedPaper.fontSize === 'compact' ? '0.85rem' : '0.95rem'), 
                                                            lineHeight: isUrduQ ? '2.2' : '1.5',
                                                            flex: 1
                                                        }}
                                                    >
                                                        {displayText}
                                                    </span>
                                                </div>

                                                <button
                                                    onClick={() => handleSwapQuestion('blank', idx)}
                                                    data-html2canvas-ignore="true"
                                                    className="no-print"
                                                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: '#1e40af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.5rem', flexShrink: 0 }}
                                                    title="Swap blank question"
                                                >
                                                    <RefreshCw size={11} /> Swap
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* SECTION C: TRUE / FALSE (درست یا غلط) */}
                        {generatedPaper.true_false?.length > 0 && (
                            <div style={{ marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
                                <div className="paper-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #000', paddingBottom: '0.25rem', marginBottom: '0.75rem', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', margin: 0, textTransform: 'uppercase' }}>
                                        Section - C: State True or False (درست یا غلط کی نشان دہی کریں)
                                    </h3>
                                    <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>
                                        [Marks: {generatedPaper.true_false.length * generatedPaper.tfMarksEach}]
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.75rem' }}>
                                    <strong>Q.3:</strong> Read the following statements and mark <strong>True (T)</strong> or <strong>False (F)</strong> in the box provided.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    {generatedPaper.true_false.map((q, idx) => {
                                        const isUrduQ = isUrduText(q.question, generatedPaper.subject);

                                        return (
                                            <div key={q.id || idx} className="question-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', breakInside: 'avoid', pageBreakInside: 'avoid', marginBottom: '0.35rem', gap: '0.75rem' }}>
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
                                                    <strong style={{ flexShrink: 0, fontSize: isUrduQ ? '1.05rem' : '0.95rem' }}>({idx + 1})</strong>
                                                    <span 
                                                        className={isUrduQ ? 'urdu-paper-font' : ''} 
                                                        style={{ 
                                                            fontSize: isUrduQ 
                                                                ? (generatedPaper.fontSize === 'large' ? '1.3rem' : generatedPaper.fontSize === 'compact' ? '1.05rem' : '1.15rem')
                                                                : (generatedPaper.fontSize === 'large' ? '1.05rem' : generatedPaper.fontSize === 'compact' ? '0.85rem' : '0.95rem'), 
                                                            lineHeight: isUrduQ ? '2.2' : '1.5',
                                                            flex: 1
                                                        }}
                                                    >
                                                        {q.question}
                                                    </span>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                                                    {/* Bracket / Box for marking */}
                                                    <span style={{ 
                                                        border: '1.5px solid #000', 
                                                        padding: '2px 14px', 
                                                        borderRadius: '4px', 
                                                        fontSize: '0.85rem', 
                                                        fontWeight: '700',
                                                        minWidth: '50px',
                                                        textAlign: 'center'
                                                    }}>
                                                        [&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;]
                                                    </span>

                                                    <button
                                                        onClick={() => handleSwapQuestion('true_false', idx)}
                                                        data-html2canvas-ignore="true"
                                                        className="no-print"
                                                        style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: '#1e40af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                                                        title="Swap true/false question"
                                                    >
                                                        <RefreshCw size={11} /> Swap
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* SECTION D: SHORT QUESTIONS */}
                        {generatedPaper.shorts?.length > 0 && (
                            <div style={{ marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
                                <div className="paper-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #000', paddingBottom: '0.25rem', marginBottom: '0.75rem', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', margin: 0, textTransform: 'uppercase' }}>
                                        Section - {generatedPaper.blanks?.length > 0 || generatedPaper.true_false?.length > 0 ? 'D' : 'B'} (Short Questions / مختصر جوابات)
                                    </h3>
                                    <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>
                                        [Marks: {generatedPaper.shortAttempt * generatedPaper.shortMarksEach}]
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.75rem' }}>
                                    <strong>Q.4:</strong> Answer any <strong>{generatedPaper.shortAttempt}</strong> out of the following <strong>{generatedPaper.shorts.length}</strong> questions. Each carries {generatedPaper.shortMarksEach} marks.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    {generatedPaper.shorts.map((q, idx) => {
                                        const isUrduQ = isUrduText(q.question, generatedPaper.subject);

                                        return (
                                            <div key={q.id || idx} className="question-item" style={{ display: 'flex', flexDirection: 'column', breakInside: 'avoid', pageBreakInside: 'avoid', marginBottom: '0.5rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
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
                                                        <strong style={{ flexShrink: 0, fontSize: isUrduQ ? '1.05rem' : '0.95rem' }}>({idx + 1})</strong>
                                                        <span 
                                                            className={isUrduQ ? 'urdu-paper-font' : ''} 
                                                            style={{ 
                                                                fontSize: isUrduQ 
                                                                    ? (generatedPaper.fontSize === 'large' ? '1.3rem' : generatedPaper.fontSize === 'compact' ? '1.05rem' : '1.15rem')
                                                                    : (generatedPaper.fontSize === 'large' ? '1.05rem' : generatedPaper.fontSize === 'compact' ? '0.85rem' : '0.95rem'), 
                                                                lineHeight: isUrduQ ? '2.2' : '1.5',
                                                                flex: 1
                                                            }}
                                                        >
                                                            {q.question}
                                                        </span>
                                                    </div>

                                                    <button
                                                        onClick={() => handleSwapQuestion('short', idx)}
                                                        data-html2canvas-ignore="true"
                                                        className="no-print"
                                                        style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: '#1e40af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.5rem', flexShrink: 0 }}
                                                        title="Swap question"
                                                    >
                                                        <RefreshCw size={11} /> Swap
                                                    </button>
                                                </div>

                                                {/* Student Answer Writing Ruled Lines (Primary Worksheet Mode) */}
                                                {generatedPaper.showAnswerLines && (
                                                    <div style={{ marginTop: '0.5rem', paddingLeft: isUrduQ ? '0' : '1.25rem', paddingRight: isUrduQ ? '1.25rem' : '0', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                                        {Array.from({ length: generatedPaper.answerLineCount || 2 }).map((_, lineIdx) => (
                                                            <div key={lineIdx} style={{ borderBottom: '1px dotted #94a3b8', height: '18px', width: '100%' }} />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* SECTION E: LONG / DETAILED QUESTIONS */}
                        {generatedPaper.longs?.length > 0 && (
                            <div style={{ marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
                                <div className="paper-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #000', paddingBottom: '0.25rem', marginBottom: '0.75rem', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', margin: 0, textTransform: 'uppercase' }}>
                                        Section - {generatedPaper.blanks?.length > 0 || generatedPaper.true_false?.length > 0 ? 'E' : 'C'} (Long / Descriptive Questions)
                                    </h3>
                                    <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>
                                        [Marks: {generatedPaper.longAttempt * generatedPaper.longMarksEach}]
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.75rem' }}>
                                    <strong>Note:</strong> Attempt any <strong>{generatedPaper.longAttempt}</strong> out of the following <strong>{generatedPaper.longs.length}</strong> questions. Each carries {generatedPaper.longMarksEach} marks.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    {generatedPaper.longs.map((q, idx) => {
                                        const isUrduQ = isUrduText(q.question, generatedPaper.subject);
                                        return (
                                            <div key={q.id || idx} className="question-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', breakInside: 'avoid', pageBreakInside: 'avoid', marginBottom: '0.35rem', gap: '0.75rem' }}>
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
                                                    <strong style={{ flexShrink: 0, fontSize: isUrduQ ? '1.05rem' : '0.95rem' }}>Q.{idx + 5}:</strong>
                                                    <span 
                                                        className={isUrduQ ? 'urdu-paper-font' : ''} 
                                                        style={{ 
                                                            fontSize: isUrduQ 
                                                                ? (generatedPaper.fontSize === 'large' ? '1.3rem' : generatedPaper.fontSize === 'compact' ? '1.05rem' : '1.15rem')
                                                                : (generatedPaper.fontSize === 'large' ? '1.05rem' : generatedPaper.fontSize === 'compact' ? '0.85rem' : '0.95rem'), 
                                                            lineHeight: isUrduQ ? '2.2' : '1.5',
                                                            flex: 1
                                                        }}
                                                    >
                                                        {q.question}
                                                    </span>
                                                </div>

                                                <button
                                                    onClick={() => handleSwapQuestion('long', idx)}
                                                    data-html2canvas-ignore="true"
                                                    className="no-print"
                                                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: '#1e40af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.5rem', flexShrink: 0 }}
                                                    title="Swap question"
                                                >
                                                    <RefreshCw size={11} /> Swap
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* TEACHER ANSWER KEY & MARKING GUIDE */}
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
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.4rem', fontSize: '0.85rem' }}>
                                            {generatedPaper.mcqs.map((q, idx) => (
                                                <div key={idx} style={{ padding: '0.25rem 0.5rem', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                                    <strong>Q.{idx + 1}:</strong> {q.correctAnswer || 'Key'}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Blanks & True/False Solutions */}
                                {(generatedPaper.blanks?.length > 0 || generatedPaper.true_false?.length > 0) && (
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <h4 style={{ fontSize: '0.95rem', fontWeight: '700', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.25rem', marginBottom: '0.5rem' }}>
                                            Section B & C: Blanks & True/False Keys
                                        </h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.4rem', fontSize: '0.85rem' }}>
                                            {generatedPaper.blanks?.map((q, idx) => (
                                                <div key={`b_${idx}`} style={{ padding: '0.25rem 0.5rem', background: '#f0fdf4', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                                                    <strong>Blank {idx + 1}:</strong> {q.correctAnswer || 'Key'}
                                                </div>
                                            ))}
                                            {generatedPaper.true_false?.map((q, idx) => (
                                                <div key={`tf_${idx}`} style={{ padding: '0.25rem 0.5rem', background: '#faf5ff', borderRadius: '4px', border: '1px solid #e9d5ff' }}>
                                                    <strong>T/F {idx + 1}:</strong> {q.correctAnswer || 'Key'}
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

        </div>
    );
};

export default PaperGenerator;
