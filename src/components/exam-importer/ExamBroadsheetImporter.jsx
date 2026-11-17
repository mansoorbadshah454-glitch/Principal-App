import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Award, BookOpen, Users, Camera, Upload, Sparkles, CheckCircle2,
    AlertTriangle, ArrowRight, ArrowLeft, RefreshCw, X, Eye, FileText,
    ShieldAlert, ShieldCheck, Layers, HelpCircle, Save, Database, Trash2,
    Plus, Beaker, PlayCircle, Download, FileSpreadsheet, Check, Percent, Sliders
} from 'lucide-react';
import { db } from '../../firebase';
import {
    collection, doc, getDocs, getDoc, setDoc, query, where,
    serverTimestamp, writeBatch
} from 'firebase/firestore';
import {
    optimizeAndCompressImage,
    detectImageBlur,
    applyHighContrastFilter
} from './CanvasImageProcessor';
import {
    getGeminiApiKey,
    extractBroadsheetPageWithAI,
    mergeMultiImageResults,
    detectSubjectsFromRegisterImage
} from './GeminiVisionService';
import { generateSampleRegisterImage } from './SampleRegisterGenerator';
import {
    downloadExamCsvTemplate,
    parseExamCsv
} from './CsvBroadsheetParser';
import MathLockWorkspaceModal from './MathLockWorkspaceModal';
import { getGradeAndRemarksFromScale, DEFAULT_GRADING_SCALE } from '../../pages/Exams';

// Compute Grade and Remarks with support for School's Custom Scale
function computeGradeWithScale(obtained, total, customScale, mode = 'default') {
    if (obtained === null || obtained === undefined || total <= 0) return { grade: '—', remarks: '—' };
    if (obtained === -1) return { grade: 'ABS', remarks: 'Absent' };
    const pct = Math.round((obtained / total) * 100);
    return getGradeAndRemarksFromScale(pct, customScale, mode);
}

const COMMON_EXTRA_SUBJECTS = [
    'Computer Science', 'Tarjuma-tul-Quran', 'Social Study',
    'General Knowledge', 'Drawing / Art', 'Pak Studies',
    'Physics', 'Chemistry', 'Biology', 'Arabic', 'Sindhi'
];

export default function ExamBroadsheetImporter({ schoolId, classes: initialClasses = [] }) {
    // 1. School Classes & Terms State
    const [classes, setClasses] = useState(initialClasses);
    const [loadingClasses, setLoadingClasses] = useState(false);
    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedTermId, setSelectedTermId] = useState('first_term_2026');
    const [customTermTitle, setCustomTermTitle] = useState('');
    const [existingExams, setExistingExams] = useState([]);

    // 1b. School Exam Settings (Grading Scale & Term Weights)
    const [examSettings, setExamSettings] = useState({
        weights: {},
        gradingScaleMode: 'default',
        customGradingScale: DEFAULT_GRADING_SCALE
    });
    const [termWeight, setTermWeight] = useState(20);

    // 2. Class Students & Subjects State
    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [subjects, setSubjects] = useState([]); // [{ subjectId, name, maxMarks }]
    const [isAutoDetectedFromImage, setIsAutoDetectedFromImage] = useState(false);
    const [isDetectingHeader, setIsDetectingHeader] = useState(false);
    const [showManualColumnEditor, setShowManualColumnEditor] = useState(false);
    const [newSubjectInput, setNewSubjectInput] = useState('');
    const [newSubjectMax, setNewSubjectMax] = useState('100');

    // 3. Source Mode & Multi-Image Queue State
    const [sourceMode, setSourceMode] = useState('camera'); // 'camera' | 'csv'
    const [imageQueue, setImageQueue] = useState([]);
    const [isProcessingCanvas, setIsProcessingCanvas] = useState(false);

    // 3b. CSV Import State
    const [csvFileName, setCsvFileName] = useState('');
    const [csvSummary, setCsvSummary] = useState(null); // { matchedCount, totalParsed, totalClassStudents }
    const [csvError, setCsvError] = useState('');
    const [isDraggingCsv, setIsDraggingCsv] = useState(false);
    const csvFileInputRef = useRef(null);

    // 4. AI & Extraction State
    const [isExtractingAI, setIsExtractingAI] = useState(false);
    const [aiProgressText, setAiProgressText] = useState('');
    const [geminiKey, setGeminiKey] = useState(() => getGeminiApiKey(schoolId) || '');
    const [showKeyModal, setShowKeyModal] = useState(false);

    // 5. Math-Lock Workspace Overlay State
    const [showWorkspace, setShowWorkspace] = useState(false);
    const [mergedRoster, setMergedRoster] = useState([]);
    const [isSavingFirestore, setIsSavingFirestore] = useState(false);
    const [successBanner, setSuccessBanner] = useState('');
    const [demoRosterCache, setDemoRosterCache] = useState(null);

    // Fetch classes if not provided or empty
    useEffect(() => {
        if (!schoolId) return;
        const fetchClassesList = async () => {
            setLoadingClasses(true);
            try {
                const snap = await getDocs(collection(db, `schools/${schoolId}/classes`));
                const list = snap.docs.map(d => ({
                    id: d.id,
                    name: d.data().name || d.id,
                    subjects: d.data().subjects || []
                }));
                setClasses(list);
                if (list.length > 0 && !selectedClassId) {
                    setSelectedClassId(list[0].id);
                }
            } catch (err) {
                console.error("Error loading classes:", err);
            } finally {
                setLoadingClasses(false);
            }
        };

        const fetchExams = async () => {
            try {
                const snap = await getDocs(collection(db, `schools/${schoolId}/exams`));
                setExistingExams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (err) {
                console.error("Error loading exams:", err);
            }
        };

        const fetchExamSettings = async () => {
            try {
                const sRef = doc(db, `schools/${schoolId}/settings`, 'exam_settings');
                const snap = await getDoc(sRef);
                if (snap.exists()) {
                    const d = snap.data();
                    setExamSettings({
                        weights: d.weights || {},
                        gradingScaleMode: d.gradingScaleMode || 'default',
                        customGradingScale: Array.isArray(d.customGradingScale) ? d.customGradingScale : DEFAULT_GRADING_SCALE
                    });
                }
            } catch (err) {
                console.warn("Error loading exam settings:", err);
            }
        };

        fetchClassesList();
        fetchExams();
        fetchExamSettings();
    }, [schoolId]);

    // Sync Term Weight when Term or Exam Settings change
    useEffect(() => {
        if (examSettings.weights && typeof examSettings.weights[selectedTermId] === 'number') {
            setTermWeight(examSettings.weights[selectedTermId]);
        } else if (selectedTermId === 'first_term_2026') {
            setTermWeight(20);
        } else if (selectedTermId === 'mid_term_2026') {
            setTermWeight(30);
        } else if (selectedTermId === 'final_term_2026') {
            setTermWeight(50);
        } else {
            setTermWeight(20);
        }
    }, [selectedTermId, examSettings.weights]);

    // When Class changes: fetch students & initialize subject sequence
    useEffect(() => {
        if (!schoolId || !selectedClassId) return;

        const loadClassDetails = async () => {
            setLoadingStudents(true);
            try {
                // 1. Fetch Students
                const studSnap = await getDocs(collection(db, `schools/${schoolId}/classes/${selectedClassId}/students`));
                const rawStudents = studSnap.docs.map(d => ({
                    id: d.id,
                    studentId: d.id,
                    ...d.data()
                }));

                // Sort numerically by Roll No
                rawStudents.sort((a, b) => {
                    const rA = parseInt(a.rollNo || a.rollNumber || 0, 10);
                    const rB = parseInt(b.rollNo || b.rollNumber || 0, 10);
                    return rA - rB;
                });
                setStudents(rawStudents);

                // 2. Fetch Class Doc for official subjects list
                const selectedCls = classes.find(c => c.id === selectedClassId);
                let classSubjects = selectedCls?.subjects || [];

                if (!classSubjects || classSubjects.length === 0) {
                    const clsDocSnap = await getDoc(doc(db, `schools/${schoolId}/classes`, selectedClassId));
                    if (clsDocSnap.exists() && clsDocSnap.data().subjects) {
                        classSubjects = clsDocSnap.data().subjects;
                    }
                }

                // Fallback default subjects if empty
                if (!classSubjects || classSubjects.length === 0) {
                    classSubjects = ['Urdu', 'English', 'Mathematics', 'General Science', 'Islamiyat'];
                }

                const initialMappedSubjects = classSubjects.map((s, idx) => ({
                    subjectId: s.toLowerCase().replace(/[^a-z0-9]/g, '_') || `subj_${idx + 1}`,
                    name: s,
                    maxMarks: 100
                }));
                setSubjects(initialMappedSubjects);
            } catch (err) {
                console.error("Error loading class students & subjects:", err);
            } finally {
                setLoadingStudents(false);
            }
        };

        loadClassDetails();
    }, [schoolId, selectedClassId, classes]);

    // Selected Term Title Resolver
    const activeExamTitle = useMemo(() => {
        if (selectedTermId === 'first_term_2026') return 'First Term Examination 2026';
        if (selectedTermId === 'mid_term_2026') return 'Mid Term Examination 2026';
        if (selectedTermId === 'final_term_2026') return 'Annual Final Examination 2026';
        if (selectedTermId === 'custom') return customTermTitle.trim() || 'Custom Term Assessment';
        const found = existingExams.find(e => e.id === selectedTermId);
        return found?.title || 'Examination';
    }, [selectedTermId, customTermTitle, existingExams]);

    // Demo Account Detection (School ID 6257 / SCHOOL_6257)
    const isDemoAccount = useMemo(() => {
        const sId = String(schoolId || '').trim().toLowerCase();
        return sId.includes('6257') || sId.includes('demo');
    }, [schoolId]);

    // Automatically inject realistic dummy register image for School ID 6257 / Demo account
    useEffect(() => {
        if (!isDemoAccount) return;
        if (imageQueue.length > 0) return;

        const timer = setTimeout(() => {
            const currentSubs = subjects.length > 0 ? subjects : [
                { subjectId: 'english', name: 'English', maxMarks: 100 },
                { subjectId: 'urdu', name: 'Urdu', maxMarks: 100 },
                { subjectId: 'mathematics', name: 'Mathematics', maxMarks: 100 },
                { subjectId: 'science', name: 'General Science', maxMarks: 100 },
                { subjectId: 'islamiyat', name: 'Islamiyat', maxMarks: 100 }
            ];
            const { base64, previewUrl, demoRoster } = generateSampleRegisterImage(currentSubs, 10);
            setImageQueue([{
                base64,
                previewUrl,
                enhancedBase64: base64,
                isBlurry: false,
                variance: 260,
                label: 'Part 1 (Demo Register Photo - School 6257)'
            }]);
            setDemoRosterCache(demoRoster);

            setStudents(prev => {
                if (prev.length === 0) {
                    return demoRoster.map(r => ({
                        id: r.studentId,
                        studentId: r.studentId,
                        name: r.name,
                        rollNo: r.rollNo,
                        fatherName: r.fatherName
                    }));
                }
                return prev;
            });
        }, 150);

        return () => clearTimeout(timer);
    }, [isDemoAccount, subjects, imageQueue.length]);

    // Subject Sequence Reordering & Custom Subject Helpers
    const moveSubject = (index, direction) => {
        const newIdx = index + direction;
        if (newIdx < 0 || newIdx >= subjects.length) return;
        const updated = [...subjects];
        const [moved] = updated.splice(index, 1);
        updated.splice(newIdx, 0, moved);
        setSubjects(updated);
    };

    const updateMaxMarks = (index, val) => {
        const num = parseInt(val, 10);
        setSubjects(prev => {
            const next = [...prev];
            next[index] = { ...next[index], maxMarks: isNaN(num) ? 100 : num };
            return next;
        });
    };

    const handleAddSubject = (subjectName, max = 100) => {
        const cleanName = (subjectName || '').trim();
        if (!cleanName) return;

        const cleanId = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        if (subjects.some(s => s.name.toLowerCase() === cleanName.toLowerCase())) {
            alert(`Subject "${cleanName}" is already in the broadsheet columns.`);
            return;
        }

        setSubjects(prev => [
            ...prev,
            { subjectId: cleanId || `subj_${Date.now()}`, name: cleanName, maxMarks: parseInt(max, 10) || 100 }
        ]);
        setNewSubjectInput('');
    };

    const handleRemoveSubject = (index) => {
        if (subjects.length <= 1) {
            alert("At least 1 subject is required for the exam broadsheet.");
            return;
        }
        setSubjects(prev => prev.filter((_, i) => i !== index));
    };

    // Handle Uploading Multi-Part Images with Canvas Preprocessing
    const handleImageFilesSelected = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setIsProcessingCanvas(true);
        const newQueue = [...imageQueue];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const partIndex = newQueue.length + 1;
            try {
                // Step 1: Compress & Resize
                const optimized = await optimizeAndCompressImage(file, 1600, 0.82);
                // Step 2: Blur Detection
                const blurReport = await detectImageBlur(optimized.base64, 110);
                // Step 3: High Contrast Document Filter
                const enhanced = await applyHighContrastFilter(optimized.base64);

                newQueue.push({
                    file,
                    base64: optimized.base64,
                    previewUrl: optimized.previewUrl,
                    enhancedBase64: enhanced,
                    isBlurry: blurReport.isBlurry,
                    variance: blurReport.variance,
                    label: `Part ${partIndex} (Page ${partIndex})`
                });
            } catch (err) {
                console.error("Canvas processing failed for file:", file.name, err);
            }
        }

        setImageQueue(newQueue);
        setIsProcessingCanvas(false);
        e.target.value = '';

        // Auto-detect register columns from the first uploaded image automatically (Zero buttons needed)
        if (newQueue.length > 0) {
            const firstImg = newQueue[0].enhancedBase64 || newQueue[0].base64;
            const effectiveKey = geminiKey || getGeminiApiKey(schoolId);
            if (firstImg && effectiveKey) {
                handleAutoDetectHeader(firstImg);
            }
        }
    };

    const removeImage = (index) => {
        setImageQueue(prev => prev.filter((_, i) => i !== index));
    };

    // 🧪 Instant Test Feature: Generates a realistic Canvas register image for 0-hassle testing
    const handleLoadSampleRegister = () => {
        const { base64, previewUrl, demoRoster } = generateSampleRegisterImage(subjects, 10);
        const sampleImageItem = {
            base64,
            previewUrl,
            enhancedBase64: base64,
            isBlurry: false,
            variance: 240,
            label: 'Part 1 (Sample Register Image)'
        };

        setImageQueue([sampleImageItem]);
        setDemoRosterCache(demoRoster);

        // If class has no students in DB, use demo students roster
        if (students.length === 0) {
            setStudents(demoRoster.map(r => ({
                id: r.studentId,
                studentId: r.studentId,
                name: r.name,
                rollNo: r.rollNo,
                fatherName: r.fatherName
            })));
        }

        setSuccessBanner("🧪 Sample Broadsheet Register photo generated! You can now test 'AI Auto-Extract' with Gemini, or click 'Instant Test Workspace' below to test the 2-Key Math-Lock engine directly!");
    };

    // Instant Test Workspace without needing AI call
    const handleLaunchDemoWorkspace = () => {
        let currentQueue = imageQueue;
        let currentRoster = demoRosterCache;

        if (currentQueue.length === 0 || !currentRoster) {
            const { base64, previewUrl, demoRoster } = generateSampleRegisterImage(subjects, 10);
            const demoImg = {
                base64,
                previewUrl,
                enhancedBase64: base64,
                isBlurry: false,
                variance: 260,
                label: 'Part 1 (Demo Register Photo - School 6257)'
            };
            currentQueue = [demoImg];
            currentRoster = demoRoster;
            setImageQueue(currentQueue);
            setDemoRosterCache(currentRoster);
        }

        setMergedRoster(currentRoster);
        setShowWorkspace(true);
    };

    // 📊 CSV Broadsheet Operations
    const handleDownloadCsvTemplate = () => {
        const currentCls = classes.find(c => c.id === selectedClassId);
        const className = currentCls?.name || 'Class';
        downloadExamCsvTemplate(className, subjects, students);
    };

    const processCsvContent = (csvText, fileName = 'broadsheet.csv') => {
        setCsvError('');
        try {
            const result = parseExamCsv({
                csvText,
                students,
                subjects
            });

            setCsvFileName(fileName);
            setCsvSummary({
                matchedCount: result.matchedCount,
                totalParsed: result.totalParsed,
                totalClassStudents: students.length
            });
            setMergedRoster(result.roster);
            setSuccessBanner(`📊 CSV Broadsheet Parsed! ${result.matchedCount} of ${result.totalParsed} students matched with class roster.`);
        } catch (err) {
            console.error("CSV Parse Error:", err);
            setCsvError(err.message || "Failed to parse CSV file.");
        }
    };

    const handleCsvFileSelected = (file) => {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.csv') && !file.type.includes('csv')) {
            setCsvError("Please upload a valid .csv file.");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            processCsvContent(content, file.name);
        };
        reader.onerror = () => {
            setCsvError("Could not read file. Please try again.");
        };
        reader.readAsText(file);
    };

    const handleLoadSampleCsv = () => {
        const currentCls = classes.find(c => c.id === selectedClassId);
        const className = currentCls?.name || 'Class';

        const sampleList = students.length > 0 ? students : [
            { rollNo: '1', name: 'Muhammad Ali' },
            { rollNo: '2', name: 'Fatima Zahra' },
            { rollNo: '3', name: 'Ahmed Bilal' },
            { rollNo: '4', name: 'Ayesha Khan' },
            { rollNo: '5', name: 'Zainab Bibi' },
            { rollNo: '6', name: 'Hamza Tariq' },
            { rollNo: '7', name: 'Usman Ghani' },
            { rollNo: '8', name: 'Hafsa Noor' },
            { rollNo: '9', name: 'Bilal Hassan' },
            { rollNo: '10', name: 'Mariam Siddiqui' }
        ];

        if (students.length === 0) {
            setStudents(sampleList.map((st, i) => ({
                id: `std_demo_${i + 1}`,
                studentId: `std_demo_${i + 1}`,
                name: st.name,
                rollNo: st.rollNo
            })));
        }

        const headers = ['Roll No', 'Student Name', ...subjects.map(s => `${s.name} (Max ${s.maxMarks})`), 'Total Marks'];
        const rows = sampleList.map((st, idx) => {
            const rNo = st.rollNo || (idx + 1);
            const name = st.name;
            let sum = 0;
            const marks = subjects.map((sub, sIdx) => {
                const m = Math.min(sub.maxMarks, Math.floor(sub.maxMarks * (0.68 + ((idx * 5 + sIdx * 7) % 28) / 100)));
                sum += m;
                return m;
            });
            // Row 3 has a discrepancy for Math-Lock demonstration
            const total = idx === 2 ? sum + 10 : sum;
            return [rNo, name, ...marks, total];
        });

        const csvString = headers.map(h => `"${h}"`).join(',') + '\n' +
            rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');

        processCsvContent(csvString, `${className}_Sample_Broadsheet.csv`);
    };

    const handleLaunchCsvWorkspace = () => {
        if (!mergedRoster || mergedRoster.length === 0) {
            alert("Please upload or load a CSV broadsheet first.");
            return;
        }
        setShowWorkspace(true);
    };

    // Auto-detect subject columns directly from register photo header
    const handleAutoDetectHeader = async (targetBase64 = null) => {
        const base64ToScan = targetBase64 || imageQueue[0]?.enhancedBase64 || imageQueue[0]?.base64;
        if (!base64ToScan) {
            alert("Please upload or capture at least one register photo first.");
            return;
        }

        const effectiveKey = geminiKey || getGeminiApiKey(schoolId);
        if (!effectiveKey) {
            setShowKeyModal(true);
            return;
        }

        setIsDetectingHeader(true);
        try {
            const detected = await detectSubjectsFromRegisterImage({
                base64Image: base64ToScan,
                defaultSubjects: subjects,
                schoolId,
                customApiKey: effectiveKey
            });

            if (detected && detected.length > 0) {
                setSubjects(detected);
                setIsAutoDetectedFromImage(true);
            }
        } catch (err) {
            console.warn("Auto-detect header notice:", err);
        } finally {
            setIsDetectingHeader(false);
        }
    };

    // Trigger AI Vision Extraction
    const handleStartAiExtraction = async () => {
        if (imageQueue.length === 0) {
            alert("Please upload or generate at least 1 broadsheet image.");
            return;
        }
        if (students.length === 0) {
            alert("No students found in this class. Click 'Load Sample Register' to populate test students.");
            return;
        }

        const effectiveKey = geminiKey || getGeminiApiKey(schoolId);
        if (!effectiveKey) {
            setShowKeyModal(true);
            return;
        }

        setIsExtractingAI(true);
        const extractedParts = [];

        try {
            let activeSubjects = [...subjects];
            for (let i = 0; i < imageQueue.length; i++) {
                const img = imageQueue[i];
                setAiProgressText(`AI scanning ${img.label} (${i + 1}/${imageQueue.length})...`);

                const result = await extractBroadsheetPageWithAI({
                    base64Image: img.enhancedBase64 || img.base64,
                    imageIndex: i,
                    students,
                    subjects: activeSubjects,
                    schoolId,
                    customApiKey: effectiveKey
                });

                // Auto-adopt columns from register image if detected by AI
                if (Array.isArray(result?.detectedSubjects) && result.detectedSubjects.length > 0) {
                    activeSubjects = result.detectedSubjects;
                    setSubjects(activeSubjects);
                    setIsAutoDetectedFromImage(true);
                }

                extractedParts.push(result);
            }

            setAiProgressText('Register columns matched! Merging rows & running Math-Lock checks...');
            const finalMerged = mergeMultiImageResults({
                extractedParts,
                students,
                subjects: activeSubjects
            });

            setMergedRoster(finalMerged);
            setShowWorkspace(true);
        } catch (err) {
            console.error("AI extraction error:", err);
            alert("AI Extraction Notice: " + err.message + "\n\nYou can also launch 'Manual Rapid Mode' or 'Instant Test Workspace' to verify offline.");
        } finally {
            setIsExtractingAI(false);
            setAiProgressText('');
        }
    };

    // Launch Manual Rapid-Entry Mode (100% Offline with Zero AI)
    const handleLaunchManualMode = () => {
        if (students.length === 0) {
            alert("No students found in this class to enter marks for.");
            return;
        }

        const emptyMerged = mergeMultiImageResults({
            extractedParts: [],
            students,
            subjects
        });

        setMergedRoster(emptyMerged);
        setShowWorkspace(true);
    };

    // Save Verified Results into Firestore using Atomic Batches
    const handleSaveVerifiedResults = async (verifiedRoster) => {
        if (!schoolId || !selectedClassId) return;

        setIsSavingFirestore(true);
        try {
            const currentCls = classes.find(c => c.id === selectedClassId);
            const targetExamId = selectedTermId === 'custom'
                ? `exam_${(customTermTitle || 'custom').toLowerCase().replace(/[^a-z0-9]/g, '_')}`
                : selectedTermId;

            // 1. Ensure the exam header document exists in schools/${schoolId}/exams (Locked & Completed)
            const examDocRef = doc(db, `schools/${schoolId}/exams`, targetExamId);
            await setDoc(examDocRef, {
                id: targetExamId,
                title: activeExamTitle,
                session: '2025-2026',
                weight: Number(termWeight) || 20,
                status: 'completed',
                isLocked: true,
                isCompleted: true,
                lockedReason: 'Onboarded via Smart Exam Broadsheet Importer',
                defaultTotalMarks: 100,
                passingMarks: 33,
                source: 'broadsheet_importer',
                updatedAt: serverTimestamp()
            }, { merge: true });

            // 1b. Automatically sync this term's weight into School Exam Settings for Annual Aggregate
            try {
                const settingsRef = doc(db, `schools/${schoolId}/settings`, 'exam_settings');
                await setDoc(settingsRef, {
                    weights: {
                        ...(examSettings.weights || {}),
                        [targetExamId]: Number(termWeight) || 20
                    },
                    updatedAt: serverTimestamp()
                }, { merge: true });
            } catch (wErr) {
                console.warn("Could not sync term weight into exam_settings:", wErr);
            }

            // 2. Prepare atomic writeBatch for exam_marks per subject
            const batch = writeBatch(db);

            subjects.forEach(sub => {
                const cleanSubj = sub.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const marksDocId = `${targetExamId}_${selectedClassId}_${cleanSubj}`;
                const marksDocRef = doc(db, `schools/${schoolId}/classes/${selectedClassId}/exam_marks`, marksDocId);

                const marksMap = {};
                verifiedRoster.forEach(student => {
                    const rawVal = student.marks[sub.subjectId];
                    const isAbsent = rawVal === -1;
                    const numObtained = isAbsent ? null : (Number(rawVal) || 0);

                    const scaleResult = computeGradeWithScale(
                        rawVal,
                        sub.maxMarks,
                        examSettings.customGradingScale,
                        examSettings.gradingScaleMode
                    );

                    // If teacher supplied a custom remark (e.g. from CSV), prioritize it; otherwise use school scale remarks
                    const finalRemarks = isAbsent
                        ? 'Absent'
                        : (student.remarks && student.remarks.trim() ? student.remarks.trim() : (scaleResult.remarks || ''));

                    marksMap[student.studentId] = {
                        obtainedMarks: numObtained,
                        baseMarks: numObtained,
                        graceMarks: 0,
                        isAbsent,
                        grade: scaleResult.grade,
                        remarks: finalRemarks,
                        updatedAt: new Date().toISOString()
                    };
                });

                batch.set(marksDocRef, {
                    examId: targetExamId,
                    examTitle: activeExamTitle,
                    classId: selectedClassId,
                    className: currentCls?.name || 'Class',
                    subject: sub.name,
                    totalMarks: sub.maxMarks || 100,
                    passingMarks: Math.round((sub.maxMarks || 100) * 0.33),
                    marks: marksMap,
                    source: 'broadsheet_digitizer',
                    updatedAt: serverTimestamp()
                }, { merge: true });
            });

            await batch.commit();

            // 3. Automatically sync the exact broadsheet subjects to the Class Card in Firestore
            try {
                const exactSubjectNames = subjects.map(s => s.name.trim()).filter(Boolean);
                if (exactSubjectNames.length > 0) {
                    const classDocRef = doc(db, `schools/${schoolId}/classes`, selectedClassId);
                    await setDoc(classDocRef, {
                        subjects: exactSubjectNames,
                        updatedAt: serverTimestamp()
                    }, { merge: true });

                    setClasses(prev => prev.map(c => {
                        if (c.id === selectedClassId) {
                            return { ...c, subjects: exactSubjectNames };
                        }
                        return c;
                    }));
                }
            } catch (syncErr) {
                console.warn("Could not sync broadsheet subjects to class card:", syncErr);
            }

            setShowWorkspace(false);
            setSuccessBanner(`🎉 Successfully digitized and committed ${verifiedRoster.length} student broadsheet records for ${currentCls?.name || 'Class'} into ${activeExamTitle}!`);
            setTimeout(() => setSuccessBanner(''), 7000);
        } catch (err) {
            console.error("Firestore batch save error:", err);
            alert("Failed to save verified results: " + err.message);
        } finally {
            setIsSavingFirestore(false);
        }
    };

    return (
        <div className="w-full space-y-4">
            {/* Top Toolbar (Load Demo Sample Register) */}
            <div className="flex items-center justify-end">
                <button
                    type="button"
                    onClick={handleLoadSampleRegister}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                    title="No camera or physical register? Click to generate a sample broadsheet image instantly."
                >
                    <Beaker size={14} className="text-amber-600" />
                    <span>🧪 Load Demo Sample Register</span>
                </button>
            </div>

            {/* Success Message Banner */}
            {successBanner && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-sm font-semibold flex items-center gap-3 animate-fadeIn shadow-sm">
                    <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                    <span>{successBanner}</span>
                </div>
            )}

            {/* Step 1: Context Lock & Selection Bar */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col gap-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">1</span>
                        <h3 className="text-sm font-bold text-slate-800">Select Target Class & Exam Term</h3>
                    </div>
                    {schoolId && (
                        <div className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            School: {schoolId}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Class Selector */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Class / Section</label>
                        <select
                            value={selectedClassId}
                            onChange={(e) => setSelectedClassId(e.target.value)}
                            disabled={loadingClasses}
                            className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 text-slate-800 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        >
                            {classes.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        <div className="mt-1 text-[11px] text-slate-500">
                            {loadingStudents ? 'Fetching students...' : `${students.length} registered students loaded`}
                        </div>
                    </div>

                    {/* Term Selector */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Exam Term</label>
                        <select
                            value={selectedTermId}
                            onChange={(e) => setSelectedTermId(e.target.value)}
                            className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 text-slate-800 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        >
                            <option value="first_term_2026">First Term Examination 2026 (Onboarding)</option>
                            <option value="mid_term_2026">Mid Term Examination 2026 (Onboarding)</option>
                            <option value="final_term_2026">Annual / Final Examination 2026</option>
                            {existingExams.map(ex => (
                                <option key={ex.id} value={ex.id}>{ex.title}</option>
                            ))}
                            <option value="custom">✨ Custom Examination Title...</option>
                        </select>

                        {selectedTermId === 'custom' && (
                            <input
                                type="text"
                                placeholder="e.g., 1st Assessment March 2026"
                                value={customTermTitle}
                                onChange={(e) => setCustomTermTitle(e.target.value)}
                                className="mt-2 w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:border-indigo-500"
                            />
                        )}
                    </div>
                </div>

                {/* School Exam Policy & Term Weightage Card */}
                <div className="mt-3 p-3.5 bg-gradient-to-r from-indigo-50/70 to-violet-50/70 rounded-xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                            <Percent size={18} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-800">Annual Aggregate Weightage & Grading</span>
                                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-700">
                                    School Policy Linked
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                                Active Scale: <strong className="text-slate-700">{examSettings.gradingScaleMode === 'custom' ? 'Custom School Grading Scale' : 'Standard 8-Tier Scale (A++, A+, A...)'}</strong>. Percentages, grades & remarks will auto-calculate according to this school policy.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 bg-white/80 px-3 py-1.5 rounded-lg border border-indigo-200/60 shadow-2xs">
                        <label className="text-xs font-bold text-slate-700 whitespace-nowrap">Term Weight in Annual:</label>
                        <div className="relative w-20">
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={termWeight}
                                onChange={(e) => setTermWeight(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                                className="w-full px-2 py-1 text-xs font-bold text-indigo-900 bg-indigo-50/50 border border-indigo-200 rounded text-center pr-5 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Step 2: Data Ingestion (Register Photos AI OCR vs. Excel / CSV File) */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-3">
                    <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">2</span>
                        <h3 className="text-sm font-bold text-slate-800">Choose Broadsheet Source</h3>
                    </div>

                    {/* Mode Toggle Switch */}
                    <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
                        <button
                            type="button"
                            onClick={() => setSourceMode('camera')}
                            className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                                sourceMode === 'camera'
                                    ? 'bg-white text-indigo-700 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <Camera size={14} />
                            <span>📸 Register Photos (AI OCR)</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setSourceMode('csv')}
                            className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                                sourceMode === 'csv'
                                    ? 'bg-white text-emerald-700 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <FileSpreadsheet size={14} />
                            <span>📊 Excel / CSV File (Drag & Drop)</span>
                        </button>
                    </div>
                </div>

                {/* MODE A: CAMERA / REGISTER PHOTOS */}
                {sourceMode === 'camera' && (
                    <div className="space-y-4 animate-fadeIn">
                        {/* Upload Drag/Select Box */}
                        <label className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 hover:bg-indigo-50/70 transition-colors rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer text-center">
                            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 mb-2">
                                <Camera size={24} />
                            </div>
                            <span className="text-xs font-bold text-slate-700">
                                Click or Drop Register Photos Here (Part 1, Part 2, etc.)
                            </span>
                            <span className="text-[11px] text-slate-500 mt-1 max-w-md">
                                Take horizontal photos of the broadsheet. For long classes, take Part 1 (Roll 1-15), Part 2 (Roll 16-30), etc.
                                Our client-side canvas will auto-detect blur and boost contrast.
                            </span>
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handleImageFilesSelected}
                                className="hidden"
                            />
                        </label>

                        {isProcessingCanvas && (
                            <div className="flex items-center justify-center gap-2 text-xs text-indigo-600 font-semibold py-2">
                                <RefreshCw size={14} className="animate-spin" />
                                <span>Running client-side HTML5 Canvas sharpness & contrast check...</span>
                            </div>
                        )}

                        {/* Uploaded Photos Cards */}
                        {imageQueue.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                                {imageQueue.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className={`rounded-xl border p-3 flex flex-col gap-2 relative bg-white shadow-xs ${
                                            item.isBlurry ? 'border-rose-400 bg-rose-50/30' : 'border-slate-200'
                                        }`}
                                    >
                                        <div className="h-32 rounded-lg bg-slate-900 overflow-hidden flex items-center justify-center relative">
                                            <img
                                                src={item.enhancedBase64 || item.base64}
                                                alt={item.label}
                                                className="h-full w-full object-cover"
                                            />
                                            <div className="absolute top-1.5 left-1.5 bg-black/70 text-white font-mono text-[10px] px-2 py-0.5 rounded">
                                                {item.label}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeImage(idx)}
                                                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center"
                                                title="Remove Photo"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>

                                        <div className="flex items-center justify-between text-[11px]">
                                            {item.isBlurry ? (
                                                <span className="text-rose-700 font-bold flex items-center gap-1 bg-rose-100 px-2 py-0.5 rounded">
                                                    <AlertTriangle size={12} /> Blurry (Variance: {item.variance})
                                                </span>
                                            ) : (
                                                <span className="text-emerald-700 font-bold flex items-center gap-1 bg-emerald-100 px-2 py-0.5 rounded">
                                                    <CheckCircle2 size={12} /> Sharp (Clear)
                                                </span>
                                            )}

                                            {isDetectingHeader ? (
                                                <span className="text-[10px] text-indigo-600 font-bold flex items-center gap-1">
                                                    <RefreshCw size={11} className="animate-spin" />
                                                    Auto-syncing...
                                                </span>
                                            ) : isAutoDetectedFromImage ? (
                                                <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                                    <CheckCircle2 size={11} className="text-emerald-600" />
                                                    Auto-Matched ({subjects.length} Cols)
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 font-mono text-[10px]">
                                                    Enhanced
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* MODE B: EXCEL / CSV DRAG & DROP */}
                {sourceMode === 'csv' && (
                    <div className="space-y-4 animate-fadeIn">
                        {/* CSV Drag & Drop Zone */}
                        <div
                            onDragOver={(e) => {
                                e.preventDefault();
                                setIsDraggingCsv(true);
                            }}
                            onDragLeave={() => setIsDraggingCsv(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setIsDraggingCsv(false);
                                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                    handleCsvFileSelected(e.dataTransfer.files[0]);
                                }
                            }}
                            onClick={() => csvFileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer text-center transition-all ${
                                isDraggingCsv
                                    ? 'border-emerald-500 bg-emerald-50/80 scale-[1.01]'
                                    : 'border-emerald-200 hover:border-emerald-400 bg-emerald-50/30 hover:bg-emerald-50/60'
                            }`}
                        >
                            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-2">
                                <FileSpreadsheet size={24} />
                            </div>
                            <span className="text-xs font-bold text-slate-800">
                                Click or Drag & Drop Broadsheet CSV / Excel File
                            </span>
                            <span className="text-[11px] text-slate-500 mt-1 max-w-md">
                                Supports .csv files exported from Excel, Google Sheets, or school legacy databases.
                                Columns like Roll No, Student Name, Subjects, and Grand Total will auto-match automatically.
                            </span>

                            <input
                                ref={csvFileInputRef}
                                type="file"
                                accept=".csv,text/csv"
                                onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        handleCsvFileSelected(e.target.files[0]);
                                    }
                                }}
                                className="hidden"
                            />
                        </div>

                        {/* CSV Actions Toolbar */}
                        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleDownloadCsvTemplate}
                                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-indigo-400 hover:text-indigo-600 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                                    title="Download pre-formatted CSV template tailored to your current class subjects and student list"
                                >
                                    <Download size={14} className="text-indigo-600" />
                                    <span>Download Broadsheet Template (.CSV)</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={handleLoadSampleCsv}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                                    title="Instant Test with realistic sample CSV data"
                                >
                                    <Beaker size={14} className="text-emerald-600" />
                                    <span>🧪 Load Demo CSV Data</span>
                                </button>
                            </div>

                            <span className="text-[11px] text-slate-500">
                                UTF-8 Encoded • Comma-separated
                            </span>
                        </div>

                        {/* CSV Error Banner */}
                        {csvError && (
                            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                                <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                                <span>{csvError}</span>
                            </div>
                        )}

                        {/* CSV Success Card & Match Summary */}
                        {csvFileName && csvSummary && (
                            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-300 text-slate-800 space-y-2 animate-fadeIn">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 font-bold text-xs text-emerald-900">
                                        <CheckCircle2 size={16} className="text-emerald-600" />
                                        <span>File Loaded: {csvFileName}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCsvFileName('');
                                            setCsvSummary(null);
                                            setMergedRoster([]);
                                        }}
                                        className="text-slate-400 hover:text-rose-600 text-xs flex items-center gap-1"
                                    >
                                        <X size={14} /> Clear
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                                    <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
                                        <div className="text-[10px] text-slate-500">Rows in File</div>
                                        <div className="text-base font-bold text-slate-800 font-mono">{csvSummary.totalParsed}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
                                        <div className="text-[10px] text-slate-500">Matched with Class Roster</div>
                                        <div className="text-base font-bold text-emerald-700 font-mono">
                                            {csvSummary.matchedCount} / {csvSummary.totalClassStudents || csvSummary.totalParsed}
                                        </div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-lg border border-emerald-200 col-span-2 sm:col-span-1">
                                        <div className="text-[10px] text-slate-500">Subjects Mapped</div>
                                        <div className="text-base font-bold text-indigo-700 font-mono">{subjects.length} Subjects</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Step 3: Launch Modes */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
                <div>
                    <h3 className="text-sm font-bold text-slate-800">
                        {sourceMode === 'csv' ? 'Ready to Verify CSV Broadsheet' : 'Ready to Digitize'}
                    </h3>
                    <p className="text-xs text-slate-500">
                        {sourceMode === 'csv'
                            ? 'Run mathematical consistency check against file totals and finalize into Firestore.'
                            : 'Extract numbers automatically via Gemini Flash Vision, or enter directly via 2-Key rapid keyboard workspace.'}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {sourceMode === 'csv' ? (
                        <>
                            <button
                                type="button"
                                onClick={handleDownloadCsvTemplate}
                                className="px-3.5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center gap-1.5"
                            >
                                <Download size={15} />
                                <span>Get Template</span>
                            </button>

                            <button
                                type="button"
                                disabled={!csvFileName || mergedRoster.length === 0}
                                onClick={handleLaunchCsvWorkspace}
                                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2 ${
                                    !csvFileName || mergedRoster.length === 0
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-500/25 cursor-pointer'
                                }`}
                            >
                                <ShieldCheck size={16} />
                                <span>Open Math-Lock Studio ({mergedRoster.length} Records)</span>
                            </button>
                        </>
                    ) : (
                        <>
                            {/* Instant Test Workspace Button */}
                            <button
                                type="button"
                                onClick={handleLaunchDemoWorkspace}
                                className="px-3.5 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                                title="Instant Test: Launches workspace with sample broadsheet data to test 2-Key navigation & Math-Lock"
                            >
                                <PlayCircle size={15} className="text-amber-600" />
                                <span>Instant Test Workspace</span>
                            </button>

                            {/* Manual Rapid-Entry Mode (100% Offline) */}
                            <button
                                type="button"
                                onClick={handleLaunchManualMode}
                                className="px-3.5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center gap-1.5"
                                title="Enter marks rapidly using keyboard without internet or AI"
                            >
                                <Layers size={15} />
                                <span>Manual Rapid Mode (100% Offline)</span>
                            </button>

                            {/* AI Vision Auto-Extraction Button */}
                            <button
                                type="button"
                                disabled={isExtractingAI || imageQueue.length === 0}
                                onClick={handleStartAiExtraction}
                                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2 ${
                                    isExtractingAI || imageQueue.length === 0
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-500/25 cursor-pointer'
                                }`}
                            >
                                {isExtractingAI ? (
                                    <>
                                        <RefreshCw size={15} className="animate-spin" />
                                        <span>{aiProgressText || 'Extracting with Gemini...'}</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles size={15} />
                                        <span>AI Auto-Extract Broadsheet</span>
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Gemini API Key Modal if missing */}
            {showKeyModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 animate-fadeIn">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <Sparkles size={16} className="text-indigo-600" />
                                <span>Google Gemini API Key Required</span>
                            </h3>
                            <button onClick={() => setShowKeyModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={16} />
                            </button>
                        </div>
                        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                            Google AI Studio provides <b>1,500 free scans per day</b> (100% Zero Cost). Enter your key below or get one in 1 minute from Google AI Studio.
                        </p>
                        <input
                            type="password"
                            placeholder="AIzaSy..."
                            value={geminiKey}
                            onChange={(e) => setGeminiKey(e.target.value)}
                            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:border-indigo-500 mb-4"
                        />
                        <div className="flex items-center justify-between">
                            <a
                                href="https://aistudio.google.com/app/apikey"
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-indigo-600 font-semibold hover:underline"
                            >
                                Get Free Key &rarr;
                            </a>
                            <button
                                type="button"
                                onClick={() => {
                                    if (geminiKey.trim()) {
                                        localStorage.setItem(`gemini_api_key_${schoolId}`, geminiKey.trim());
                                        localStorage.setItem('gemini_api_key', geminiKey.trim());
                                        setShowKeyModal(false);
                                        handleStartAiExtraction();
                                    }
                                }}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
                            >
                                Save & Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 4: Full-Screen Split Workspace Modal */}
            <MathLockWorkspaceModal
                isOpen={showWorkspace}
                onClose={() => setShowWorkspace(false)}
                classDetails={classes.find(c => c.id === selectedClassId)}
                examTitle={activeExamTitle}
                subjects={subjects}
                processedImages={imageQueue}
                initialRoster={mergedRoster}
                onSaveVerifiedResults={handleSaveVerifiedResults}
                isSaving={isSavingFirestore}
                csvInfo={sourceMode === 'csv' ? { fileName: csvFileName, ...csvSummary } : null}
            />
        </div>
    );
}
