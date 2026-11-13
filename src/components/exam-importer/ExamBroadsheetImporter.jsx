import React, { useState, useEffect, useMemo } from 'react';
import {
    Award, BookOpen, Users, Camera, Upload, Sparkles, CheckCircle2,
    AlertTriangle, ArrowRight, ArrowLeft, RefreshCw, X, Eye, FileText,
    ShieldAlert, ShieldCheck, Layers, HelpCircle, Save, Database, Trash2,
    Plus, Beaker, PlayCircle
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
    mergeMultiImageResults
} from './GeminiVisionService';
import { generateSampleRegisterImage } from './SampleRegisterGenerator';
import MathLockWorkspaceModal from './MathLockWorkspaceModal';

// Standard Grade calculator matching Exams.jsx
function computeGrade(obtained, total) {
    if (obtained === null || obtained === undefined || total <= 0) return '—';
    if (obtained === -1) return 'ABS';
    const pct = (obtained / total) * 100;
    if (pct >= 90) return 'A++';
    if (pct >= 80) return 'A+';
    if (pct >= 70) return 'A';
    if (pct >= 60) return 'B';
    if (pct >= 50) return 'C';
    if (pct >= 40) return 'D';
    if (pct >= 33) return 'E';
    return 'F';
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

    // 2. Class Students & Subjects State
    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [subjects, setSubjects] = useState([]); // [{ subjectId, name, maxMarks }]
    const [newSubjectInput, setNewSubjectInput] = useState('');
    const [newSubjectMax, setNewSubjectMax] = useState('100');

    // 3. Multi-Image Queue State
    const [imageQueue, setImageQueue] = useState([]);
    const [isProcessingCanvas, setIsProcessingCanvas] = useState(false);

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

        fetchClassesList();
        fetchExams();
    }, [schoolId]);

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

    // Demo Account Detection (School ID 6257)
    const isDemoAccount = useMemo(() => {
        const sId = String(schoolId || '').trim();
        return sId === '6257' || sId.toLowerCase().includes('demo');
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
            for (let i = 0; i < imageQueue.length; i++) {
                const img = imageQueue[i];
                setAiProgressText(`AI scanning ${img.label} (${i + 1}/${imageQueue.length})...`);

                const result = await extractBroadsheetPageWithAI({
                    base64Image: img.enhancedBase64 || img.base64,
                    imageIndex: i,
                    students,
                    subjects,
                    schoolId,
                    customApiKey: effectiveKey
                });

                extractedParts.push(result);
            }

            setAiProgressText('Merging rows & running Math-Lock checks...');
            const finalMerged = mergeMultiImageResults({
                extractedParts,
                students,
                subjects
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
                status: 'completed',
                isLocked: true,
                isCompleted: true,
                lockedReason: 'Onboarded via Smart Exam Broadsheet Importer',
                defaultTotalMarks: 100,
                passingMarks: 33,
                source: 'broadsheet_importer',
                updatedAt: serverTimestamp()
            }, { merge: true });

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

                    marksMap[student.studentId] = {
                        obtainedMarks: numObtained,
                        baseMarks: numObtained,
                        graceMarks: 0,
                        isAbsent,
                        grade: computeGrade(rawVal, sub.maxMarks),
                        remarks: isAbsent ? 'Absent' : '',
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
        <div className="w-full space-y-6">
            {/* Top Info Banner */}
            <div className="w-full bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 rounded-2xl p-6 text-white shadow-md border border-indigo-700/40 relative overflow-hidden">
                <div className="relative z-10">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center shrink-0">
                                <Award className="text-amber-400" size={24} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold">Smart Exam Broadsheet Digitizer & Math-Lock Studio</h2>
                                <p className="text-xs text-indigo-200">
                                    Digitize 1st Term & 2nd Term offline handwritten register records with 100% mathematical zero-error accuracy.
                                </p>
                            </div>
                        </div>

                        {/* One-Click Instant Test Generator Button */}
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleLoadSampleRegister}
                                className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                                title="No camera or physical register? Click to generate a sample broadsheet image instantly."
                            >
                                <Beaker size={15} className="text-amber-400" />
                                <span>🧪 Load Demo Sample Register</span>
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                        <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-3 py-1 rounded-full font-semibold flex items-center gap-1.5">
                            <ShieldCheck size={14} /> Zero Math Errors Engine
                        </span>
                        <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-3 py-1 rounded-full font-semibold flex items-center gap-1.5">
                            <Sparkles size={14} /> 2-Key Rapid Verification (Enter skips Green rows)
                        </span>
                        <span className="bg-slate-700/60 text-slate-300 border border-slate-600 px-3 py-1 rounded-full font-semibold flex items-center gap-1.5">
                            <Layers size={14} /> Multi-Part Photo Stitching
                        </span>
                    </div>
                </div>
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

                {/* Subject Column Sequence Mapper (Dynamic Add, Remove & Reorder) */}
                <div className="mt-2 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div>
                            <span className="text-xs font-bold text-slate-700">
                                Subject Column Sequence Mapper ({subjects.length} Subjects Active)
                            </span>
                            <p className="text-[11px] text-slate-500">
                                Match the exact left-to-right columns as written on the physical register. Add any extra subjects if needed.
                            </p>
                        </div>

                        {/* Custom Subject Quick Add Form */}
                        <div className="flex items-center gap-1.5">
                            <input
                                type="text"
                                placeholder="Subject name..."
                                value={newSubjectInput}
                                onChange={(e) => setNewSubjectInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAddSubject(newSubjectInput, newSubjectMax);
                                }}
                                className="px-2.5 py-1 text-xs rounded border border-slate-300 bg-white w-32 focus:border-indigo-500"
                            />
                            <input
                                type="number"
                                placeholder="Max"
                                value={newSubjectMax}
                                onChange={(e) => setNewSubjectMax(e.target.value)}
                                className="px-1.5 py-1 text-xs font-mono w-14 text-center rounded border border-slate-300 bg-white"
                                title="Max Marks"
                            />
                            <button
                                type="button"
                                onClick={() => handleAddSubject(newSubjectInput, newSubjectMax)}
                                className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold flex items-center gap-1"
                                title="Add Subject to Register"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Quick Suggestion Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-3 pt-1">
                        <span className="text-[10px] text-slate-400 font-semibold mr-1">Quick Add:</span>
                        {COMMON_EXTRA_SUBJECTS.filter(name => !subjects.some(s => s.name.toLowerCase() === name.toLowerCase())).slice(0, 5).map(name => (
                            <button
                                key={name}
                                type="button"
                                onClick={() => handleAddSubject(name, 100)}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/70 hover:bg-indigo-100 hover:text-indigo-700 text-slate-700 font-medium transition"
                            >
                                + {name}
                            </button>
                        ))}
                    </div>

                    {/* Reorderable Subject Pills Grid */}
                    <div className="flex flex-wrap gap-2 pt-1">
                        {subjects.map((sub, idx) => (
                            <div
                                key={sub.subjectId}
                                className="bg-white border border-slate-300 rounded-lg p-2 flex items-center gap-2 shadow-xs text-xs"
                            >
                                <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-mono font-bold text-[10px] flex items-center justify-center">
                                    {idx + 1}
                                </span>
                                <span className="font-bold text-slate-800">{sub.name}</span>

                                <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                                    <span className="text-[10px] text-slate-400">max:</span>
                                    <input
                                        type="number"
                                        value={sub.maxMarks}
                                        onChange={(e) => updateMaxMarks(idx, e.target.value)}
                                        className="w-12 text-center text-xs font-mono font-bold py-0.5 border border-slate-200 rounded"
                                    />
                                </div>

                                <div className="flex items-center gap-0.5 border-l border-slate-200 pl-1">
                                    <button
                                        type="button"
                                        disabled={idx === 0}
                                        onClick={() => moveSubject(idx, -1)}
                                        className="p-1 text-slate-500 hover:text-indigo-600 disabled:opacity-30"
                                        title="Move Left"
                                    >
                                        <ArrowLeft size={13} />
                                    </button>
                                    <button
                                        type="button"
                                        disabled={idx === subjects.length - 1}
                                        onClick={() => moveSubject(idx, 1)}
                                        className="p-1 text-slate-500 hover:text-indigo-600 disabled:opacity-30"
                                        title="Move Right"
                                    >
                                        <ArrowRight size={13} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveSubject(idx)}
                                        className="p-1 text-rose-500 hover:text-rose-700 ml-0.5"
                                        title="Remove Subject"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Step 2: Multi-Image Queue & Canvas Pipeline */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">2</span>
                        <h3 className="text-sm font-bold text-slate-800">Upload Broadsheet Photos (Multi-Part Support)</h3>
                    </div>
                    <span className="text-xs text-slate-500">
                        {imageQueue.length} photo(s) queued
                    </span>
                </div>

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
                                    <span className="text-slate-400 font-mono text-[10px]">
                                        Enhanced
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Step 3: Launch Modes (Instant Test vs AI Extract vs. Offline Manual Mode) */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
                <div>
                    <h3 className="text-sm font-bold text-slate-800">Ready to Digitize</h3>
                    <p className="text-xs text-slate-500">
                        Extract numbers automatically via Gemini Flash Vision, or enter directly via 2-Key rapid keyboard workspace.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
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
            />
        </div>
    );
}
