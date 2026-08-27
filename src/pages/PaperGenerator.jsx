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
    { id: 'mid_term', name: 'Mid Term Exam (50 Marks)', badge: '50 Marks', totalMarks: 50, timeAllowed: '1 Hour 30 Mins', mcqCount: 10, mcqMarksEach: 1, shortCount: 8, shortAttempt: 6, shortMarksEach: 3, longCount: 3, longAttempt: 2, longMarksEach: 6 },
    { id: 'monthly_test', name: 'Monthly Class Test (25 Marks)', badge: '25 Marks', totalMarks: 25, timeAllowed: '45 Minutes', mcqCount: 5, mcqMarksEach: 1, shortCount: 6, shortAttempt: 4, shortMarksEach: 2, longCount: 2, longAttempt: 1, longMarksEach: 6 },
    { id: 'final_board', name: 'Annual / Board Pattern (75 Marks)', badge: '75 Marks', totalMarks: 75, timeAllowed: '3 Hours', mcqCount: 15, mcqMarksEach: 1, shortCount: 15, shortAttempt: 10, shortMarksEach: 2, longCount: 5, longAttempt: 3, longMarksEach: 8 },
    { id: 'grand_test', name: 'Grand Test / Pre-Board (100 Marks)', badge: '100 Marks', totalMarks: 100, timeAllowed: '3 Hours', mcqCount: 20, mcqMarksEach: 1, shortCount: 18, shortAttempt: 12, shortMarksEach: 2, longCount: 6, longAttempt: 4, longMarksEach: 8 }
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
    const [availableSubjects, setAvailableSubjects] = useState(COMPREHENSIVE_SUBJECTS);
    const [selectedSubject, setSelectedSubject] = useState('Urdu');

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

    const [shortCount, setShortCount] = useState(8);
    const [shortAttempt, setShortAttempt] = useState(6);
    const [shortMarksEach, setShortMarksEach] = useState(3);

    const [longCount, setLongCount] = useState(3);
    const [longAttempt, setLongAttempt] = useState(2);
    const [longMarksEach, setLongMarksEach] = useState(6);

    // 3. Typesetting & Language
    const [languageMode, setLanguageMode] = useState('bilingual'); // 'english' | 'urdu' | 'bilingual'
    const [paperStyle, setPaperStyle] = useState('board_standard');
    const [fontSize, setFontSize] = useState('normal');
    const [showAnswerKey, setShowAnswerKey] = useState(true);

    // Calculated Blueprint Metrics
    const totalMarks = (mcqCount * mcqMarksEach) + (shortAttempt * shortMarksEach) + (longAttempt * longMarksEach);

    // --- STEP 2: GENERATED PAPER STATE ---
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedPaper, setGeneratedPaper] = useState(null);
    const [availablePool, setAvailablePool] = useState({ mcqs: [], shorts: [], longs: [] });
    const [activeView, setActiveView] = useState('config'); // 'config' | 'preview'
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

    const printRef = useRef(null);

    // Helper: Extract Chapter Number
    const extractChapterNumber = (title) => {
        if (!title) return 999;
        const match = title.match(/(?:chapter|unit|ch|sabaq|unwan)?\s*(\d+)/i) || title.match(/\d+/);
        return match ? parseInt(match[1] || match[0], 10) : 999;
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
                        subjects: d.data().subjects || []
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
        if (!selectedClassId) return;
        const currentClass = classes.find(c => c.id === selectedClassId);
        if (currentClass) {
            setSelectedClassName(currentClass.name);
            const classSubjects = currentClass.subjects || [];
            const combined = Array.from(new Set([...classSubjects, ...COMPREHENSIVE_SUBJECTS]));
            setAvailableSubjects(combined);
            if (!combined.includes(selectedSubject)) {
                setSelectedSubject(combined[0]);
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
                alert(`No exercise questions have been saved yet for the selected chapters of ${selectedSubject}.\n\nPlease go to "Settings -> Upload Syllabus", select the chapter, and scan exercise photos to save questions.`);
                setIsGenerating(false);
                return;
            }

            // Segregate by Type
            let mcqPool = allQuestions.filter(q => q.type === 'mcq');
            let shortPool = allQuestions.filter(q => q.type === 'short' || !q.type);
            let longPool = allQuestions.filter(q => q.type === 'long');

            // Fisher-Yates Shuffle
            const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

            const shuffledMcqs = shuffle(mcqPool);
            const shuffledShorts = shuffle(shortPool);
            const shuffledLongs = shuffle(longPool);

            // Determine actual questions to display
            const targetMcqs = Math.min(mcqCount, shuffledMcqs.length);
            const targetShorts = Math.min(shortCount, shuffledShorts.length);
            const targetLongs = Math.min(longCount, shuffledLongs.length);

            const pickedMcqs = shuffledMcqs.slice(0, targetMcqs);
            const pickedShorts = shuffledShorts.slice(0, targetShorts);
            const pickedLongs = shuffledLongs.slice(0, targetLongs);

            const actualShortAttempt = Math.min(shortAttempt, targetShorts);
            const actualLongAttempt = Math.min(longAttempt, targetLongs);

            const actualTotalMarks = (targetMcqs * mcqMarksEach) + 
                                     (actualShortAttempt * shortMarksEach) + 
                                     (actualLongAttempt * longMarksEach);

            setAvailablePool({
                mcqs: shuffledMcqs.slice(targetMcqs),
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
                totalMarks: actualTotalMarks,
                mcqs: pickedMcqs,
                shorts: pickedShorts,
                longs: pickedLongs,
                mcqMarksEach,
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

        let poolKey = type === 'mcq' ? 'mcqs' : type === 'short' ? 'shorts' : 'longs';
        let currentPool = [...availablePool[poolKey]];
        let currentList = [...generatedPaper[poolKey]];

        if (currentPool.length === 0) {
            alert(`No more alternate ${type.toUpperCase()} questions available in the current scanned pool.`);
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
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', fontWeight: '700', color: '#1e293b', background: '#fff' }}
                                        >
                                            {availableSubjects.map(s => (
                                                <option key={s} value={s}>{s}</option>
                                            ))}
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
                                                    const isUrdu = /[\u0600-\u06FF]/.test(ch.title || '');
                                                    const qCount = ch.questions?.length || 0;
                                                    const mcqCountInChapter = (ch.questions || []).filter(q => q.type === 'mcq').length;
                                                    const shortCountInChapter = (ch.questions || []).filter(q => q.type === 'short' || !q.type).length;
                                                    const longCountInChapter = (ch.questions || []).filter(q => q.type === 'long').length;

                                                    return (
                                                        <div
                                                            key={ch.id}
                                                            onClick={() => handleToggleChapter(ch.id)}
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
                                                                    className={isUrdu ? 'urdu-paper-font' : ''}
                                                                    style={{ 
                                                                        fontSize: isUrdu ? '1.2rem' : '0.95rem', 
                                                                        fontWeight: '700', 
                                                                        color: isSelected ? '#ffffff' : '#1e293b',
                                                                        lineHeight: isUrdu ? '2.0' : '1.4',
                                                                        textShadow: isSelected ? '0 1px 2px rgba(0,0,0,0.2)' : 'none'
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

                        {/* TAB 2: BLUEPRINT & MARKS SCHEME */}
                        {activeSettingsTab === 'blueprint' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Sliders size={22} color="#1e40af" />
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
                                                        border: '2px solid ' + (isSelected ? '#1e40af' : '#e2e8f0'),
                                                        background: isSelected ? '#eff6ff' : '#ffffff',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease'
                                                    }}
                                                >
                                                    <span style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: isSelected ? '#1e40af' : '#f1f5f9', color: isSelected ? '#fff' : '#64748b', fontWeight: '700' }}>
                                                        {preset.badge}
                                                    </span>
                                                    <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#1e293b', margin: '0.5rem 0 0.25rem' }}>
                                                        {preset.name}
                                                    </h3>
                                                    <div style={{ fontSize: '0.8rem', color: '#1e40af', fontWeight: '700' }}>
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
                                            <span style={{ background: '#1e40af', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '800', fontSize: '0.8rem' }}>
                                                {mcqCount * mcqMarksEach} Marks
                                            </span>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Number of MCQs</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="50"
                                                    value={mcqCount}
                                                    onChange={(e) => setMcqCount(Number(e.target.value))}
                                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Marks Each</label>
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
                                            <span style={{ background: '#1e40af', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '800', fontSize: '0.8rem' }}>
                                                {shortAttempt * shortMarksEach} Marks
                                            </span>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Given Qs</label>
                                                <input
                                                    type="number"
                                                    min="1"
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
                                                    max="10"
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
                                            <span style={{ fontWeight: '800', fontSize: '0.95rem', color: '#1e293b' }}>Section C: Long Questions</span>
                                            <span style={{ background: '#1e40af', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '800', fontSize: '0.8rem' }}>
                                                {longAttempt * longMarksEach} Marks
                                            </span>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Given Qs</label>
                                                <input
                                                    type="number"
                                                    min="1"
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
                                style={{ padding: '0.45rem 1rem', background: '#1e40af', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '700', fontSize: '0.8rem', cursor: isDownloadingPdf ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
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
                                        const isUrduQ = /[\u0600-\u06FF]/.test(q.question || '');
                                        return (
                                            <div key={q.id || idx} className="question-item" style={{ breakInside: 'avoid', pageBreakInside: 'avoid', marginBottom: '0.35rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                                                    <div 
                                                        dir={isUrduQ ? "rtl" : "ltr"}
                                                        style={{ 
                                                            display: 'flex', 
                                                            alignItems: 'baseline', 
                                                            gap: '0.5rem', 
                                                            flex: 1,
                                                            direction: isUrduQ ? 'rtl' : 'ltr',
                                                            textAlign: isUrduQ ? 'right' : 'left'
                                                        }}
                                                    >
                                                        <strong style={{ flexShrink: 0, fontSize: '0.95rem' }}>({idx + 1})</strong>
                                                        <span 
                                                            className={isUrduQ ? 'urdu-paper-font' : ''} 
                                                            style={{ 
                                                                fontSize: isUrduQ ? '1.15rem' : '0.95rem', 
                                                                fontWeight: '600', 
                                                                lineHeight: isUrduQ ? '2.2' : '1.4'
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
                                                            gridTemplateColumns: 'repeat(4, 1fr)', 
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
                                                                <strong>({String.fromCharCode(65 + oIdx)})</strong> {opt}
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

                        {/* SECTION B: SHORT QUESTIONS */}
                        {generatedPaper.shorts?.length > 0 && (
                            <div style={{ marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
                                <div className="paper-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #000', paddingBottom: '0.25rem', marginBottom: '0.75rem', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', margin: 0, textTransform: 'uppercase' }}>
                                        Section - B (Short Questions)
                                    </h3>
                                    <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>
                                        [Marks: {generatedPaper.shortAttempt * generatedPaper.shortMarksEach}]
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.75rem' }}>
                                    <strong>Q.2:</strong> Answer any <strong>{generatedPaper.shortAttempt}</strong> out of the following <strong>{generatedPaper.shorts.length}</strong> questions. Each carries {generatedPaper.shortMarksEach} marks.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {generatedPaper.shorts.map((q, idx) => {
                                        const isUrduQ = /[\u0600-\u06FF]/.test(q.question || '');
                                        return (
                                            <div key={q.id || idx} className="question-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', breakInside: 'avoid', pageBreakInside: 'avoid', marginBottom: '0.35rem', gap: '0.75rem' }}>
                                                <div 
                                                    dir={isUrduQ ? "rtl" : "ltr"}
                                                    style={{ 
                                                        display: 'flex', 
                                                        alignItems: 'baseline', 
                                                        gap: '0.5rem', 
                                                        flex: 1,
                                                        direction: isUrduQ ? 'rtl' : 'ltr',
                                                        textAlign: isUrduQ ? 'right' : 'left'
                                                    }}
                                                >
                                                    <strong style={{ flexShrink: 0, fontSize: '0.95rem' }}>({idx + 1})</strong>
                                                    <span 
                                                        className={isUrduQ ? 'urdu-paper-font' : ''} 
                                                        style={{ 
                                                            fontSize: isUrduQ ? '1.15rem' : '0.95rem', 
                                                            lineHeight: isUrduQ ? '2.2' : '1.4'
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
                                        );
                                    })}
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
                                        [Marks: {generatedPaper.longAttempt * generatedPaper.longMarksEach}]
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.75rem' }}>
                                    <strong>Note:</strong> Attempt any <strong>{generatedPaper.longAttempt}</strong> out of the following <strong>{generatedPaper.longs.length}</strong> questions. Each carries {generatedPaper.longMarksEach} marks.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    {generatedPaper.longs.map((q, idx) => {
                                        const isUrduQ = /[\u0600-\u06FF]/.test(q.question || '');
                                        return (
                                            <div key={q.id || idx} className="question-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', breakInside: 'avoid', pageBreakInside: 'avoid', marginBottom: '0.35rem', gap: '0.75rem' }}>
                                                <div 
                                                    dir={isUrduQ ? "rtl" : "ltr"}
                                                    style={{ 
                                                        display: 'flex', 
                                                        alignItems: 'baseline', 
                                                        gap: '0.5rem', 
                                                        flex: 1,
                                                        direction: isUrduQ ? 'rtl' : 'ltr',
                                                        textAlign: isUrduQ ? 'right' : 'left'
                                                    }}
                                                >
                                                    <strong style={{ flexShrink: 0, fontSize: '0.95rem' }}>Q.{idx + 3}:</strong>
                                                    <span 
                                                        className={isUrduQ ? 'urdu-paper-font' : ''} 
                                                        style={{ 
                                                            fontSize: isUrduQ ? '1.15rem' : '0.95rem', 
                                                            lineHeight: isUrduQ ? '2.2' : '1.4'
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
                                                    <strong>Q.{idx + 1}:</strong> {q.correctAnswer || 'Answer Key'}
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
