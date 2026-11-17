import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Users, Camera, Upload, Sparkles, CheckCircle2, AlertTriangle,
    ArrowRight, RefreshCw, X, Eye, FileText, ShieldAlert, ShieldCheck,
    Layers, HelpCircle, Save, Database, Trash2, Plus, Beaker,
    PlayCircle, Download, FileSpreadsheet, Check, ArrowUpRight
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
} from '../exam-importer/CanvasImageProcessor';
import {
    getGeminiApiKey,
    extractStudentRegisterWithAI,
    mergeMultiPageStudents
} from './GeminiStudentVisionService';
import { generateSampleRegisterImage, SAMPLE_CUTTINGS_STUDENT_DATA } from './SampleStudentRegisterGenerator';
import {
    getNextAdmissionNumber,
    updateAdmissionCounter,
    parseAndIncrementSequence,
    getClassOrder
} from '../../utils/studentSequenceHelper';
import StudentVerificationWorkspaceModal from './StudentVerificationWorkspaceModal';

export default function StudentRegisterImporter({ schoolId, classes: initialClasses = [] }) {
    // 1. School Classes State
    const [classes, setClasses] = useState(initialClasses);
    const [loadingClasses, setLoadingClasses] = useState(false);
    const [selectedClassId, setSelectedClassId] = useState('');
    const [targetClassName, setTargetClassName] = useState(() => initialClasses[0]?.name || '');
    const [selectedSection, setSelectedSection] = useState('A');

    // 2. Class Students in DB (for duplicate checking)
    const [existingStudents, setExistingStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [nextAdmissionNo, setNextAdmissionNo] = useState('ADM-001');

    // 3. Multi-Image Queue State
    const [imageQueue, setImageQueue] = useState([]);
    const [isProcessingCanvas, setIsProcessingCanvas] = useState(false);

    // 4. AI & Extraction State
    const [isExtractingAI, setIsExtractingAI] = useState(false);
    const [aiProgressText, setAiProgressText] = useState('');
    const [geminiKey, setGeminiKey] = useState(() => getGeminiApiKey(schoolId) || '');
    const [showKeyModal, setShowKeyModal] = useState(false);

    // 5. Verification Workspace Overlay State
    const [showWorkspace, setShowWorkspace] = useState(false);
    const [workingRoster, setWorkingRoster] = useState([]);
    const [isSavingFirestore, setIsSavingFirestore] = useState(false);
    const [successBanner, setSuccessBanner] = useState('');

    // Fetch classes if not provided
    useEffect(() => {
        if (!schoolId) return;
        const fetchClassesList = async () => {
            setLoadingClasses(true);
            try {
                const snap = await getDocs(collection(db, `schools/${schoolId}/classes`));
                const list = snap.docs.map(d => ({
                    id: d.id,
                    name: d.data().name || d.data().className || d.id,
                    sections: d.data().sections || ['A']
                }));
                setClasses(list);
                if (list.length > 0 && !selectedClassId) {
                    setSelectedClassId(list[0].id);
                    setTargetClassName(list[0].name);
                } else if (list.length === 0 && !targetClassName) {
                    setTargetClassName('');
                }
            } catch (err) {
                console.error("Error loading classes:", err);
            } finally {
                setLoadingClasses(false);
            }
        };

        const fetchNextAdm = async () => {
            try {
                const nextNo = await getNextAdmissionNumber(schoolId, db);
                setNextAdmissionNo(nextNo);
            } catch (err) {
                console.warn("Could not fetch next admission no:", err);
            }
        };

        fetchClassesList();
        fetchNextAdm();
    }, [schoolId]);

    // Fetch existing students when class changes
    useEffect(() => {
        if (!schoolId || !selectedClassId) return;

        const loadClassStudents = async () => {
            setLoadingStudents(true);
            try {
                const studSnap = await getDocs(collection(db, `schools/${schoolId}/classes/${selectedClassId}/students`));
                const list = studSnap.docs.map(d => ({
                    id: d.id,
                    studentId: d.id,
                    ...d.data()
                }));
                setExistingStudents(list);
            } catch (err) {
                console.error("Error loading existing class students:", err);
            } finally {
                setLoadingStudents(false);
            }
        };

        loadClassStudents();
    }, [schoolId, selectedClassId]);

    // Selected Class Name Helper
    const activeClassName = useMemo(() => {
        if (targetClassName && targetClassName.trim()) {
            return targetClassName.trim();
        }
        const found = classes.find(c => c.id === selectedClassId);
        return found?.name || 'Selected Class';
    }, [classes, selectedClassId, targetClassName]);

    // Demo Account Detection (School ID 6257 / SCHOOL_6257)
    const isDemoAccount = useMemo(() => {
        const sId = String(schoolId || '').trim().toLowerCase();
        return sId.includes('6257') || sId.includes('demo');
    }, [schoolId]);

    // Handle Image Files Selected (with Canvas Preprocessing & Blur Check)
    const handleImageFilesSelected = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setIsProcessingCanvas(true);
        const newQueue = [...imageQueue];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const partIndex = newQueue.length + 1;
            try {
                // 1. Optimize & Compress to optimal dimension
                const optimized = await optimizeAndCompressImage(file, 1600, 0.85);
                // 2. Blur detection via Laplacian Variance
                const blurReport = await detectImageBlur(optimized.base64, 110);
                // 3. High-Contrast document filter for dark handwriting
                const enhanced = await applyHighContrastFilter(optimized.base64);

                newQueue.push({
                    file,
                    base64: optimized.base64,
                    previewUrl: optimized.previewUrl,
                    enhancedBase64: enhanced,
                    isBlurry: blurReport.isBlurry,
                    variance: blurReport.variance,
                    label: `Part ${partIndex} (Register Page ${partIndex})`
                });
            } catch (err) {
                console.error("Canvas processing failed:", file.name, err);
            }
        }

        setImageQueue(newQueue);
        setIsProcessingCanvas(false);
        e.target.value = '';
    };

    const removeImage = (index) => {
        setImageQueue(prev => prev.filter((_, i) => i !== index));
    };

    // 🧪 1-Click All-in-One Demo Launcher (School 6257)
    // Instantly loads register photo + demo roster (with normal, cuttings/orange, and error/red test cases)
    const handleLaunchAllInOneDemoTest = () => {
        const { base64, previewUrl } = generateSampleRegisterImage(8);
        const demoImg = {
            base64,
            previewUrl,
            enhancedBase64: base64,
            isBlurry: false,
            variance: 280,
            label: 'Part 1 (Demo Register Photo - School 6257)'
        };
        setImageQueue([demoImg]);

        const demoRoster = SAMPLE_CUTTINGS_STUDENT_DATA.map((st, i) => ({
            ...st,
            tempId: `st_demo_${i + 1}`,
            admissionNo: '',
            section: selectedSection || 'A',
            sourceImageIndex: 0
        }));

        setWorkingRoster(demoRoster);
        setShowWorkspace(true);
    };

    // Launch Manual Offline Entry (Zero AI / Zero Internet)
    const handleLaunchManualMode = () => {
        const initialCount = 10;
        const blankRoster = Array.from({ length: initialCount }, (_, i) => ({
            tempId: `st_manual_${i + 1}`,
            rollNo: String(i + 1),
            fullName: '',
            fatherName: '',
            phone: '',
            cnic: '',
            gender: 'Male',
            dob: '',
            admissionNo: '',
            section: selectedSection || 'A',
            lowConfidence: false,
            sourceImageIndex: 0
        }));

        setWorkingRoster(blankRoster);
        setShowWorkspace(true);
    };

    // Trigger AI Vision Extraction
    const handleStartAiExtraction = async () => {
        if (imageQueue.length === 0) {
            alert("Please upload or generate at least 1 register photo.");
            return;
        }

        const effectiveKey = geminiKey || getGeminiApiKey(schoolId);
        if (!effectiveKey) {
            setShowKeyModal(true);
            return;
        }

        setIsExtractingAI(true);
        const extractedPages = [];

        try {
            for (let i = 0; i < imageQueue.length; i++) {
                const img = imageQueue[i];
                setAiProgressText(`AI scanning ${img.label} (${i + 1}/${imageQueue.length})...`);

                const result = await extractStudentRegisterWithAI({
                    base64Image: img.enhancedBase64 || img.base64,
                    imageIndex: i,
                    imageLabel: img.label,
                    schoolId,
                    customApiKey: effectiveKey
                });

                extractedPages.push(result);
            }

            setAiProgressText('Merging rows & verifying sequence continuity...');
            const finalMerged = mergeMultiPageStudents(extractedPages);

            setWorkingRoster(finalMerged);
            setShowWorkspace(true);
        } catch (err) {
            console.error("AI extraction error:", err);
            alert("AI Extraction Notice: " + err.message + "\n\nYou can also launch 'Instant Test Workspace' or 'Rapid Offline Entry' to verify data directly.");
        } finally {
            setIsExtractingAI(false);
            setAiProgressText('');
        }
    };

    // Save Students to Firestore
    const handleSaveStudentsToFirestore = async (finalRoster) => {
        const finalClassName = (targetClassName || '').trim();
        if (!schoolId || !finalClassName) {
            alert("Please specify a Target Class name.");
            return;
        }

        setIsSavingFirestore(true);
        try {
            let actualClassId = selectedClassId;

            // 1. Resolve or Automatically Create Class Document in Firestore (Classes page card)
            if (!actualClassId) {
                const existing = classes.find(c => (c.name || '').trim().toLowerCase() === finalClassName.toLowerCase());
                if (existing) {
                    actualClassId = existing.id;
                } else {
                    const newClassRef = doc(collection(db, 'schools', schoolId, 'classes'));
                    actualClassId = newClassRef.id;

                    const newClassData = {
                        name: finalClassName,
                        teacher: '',
                        students: finalRoster.length,
                        sections: [selectedSection.trim().toUpperCase() || 'A'],
                        subjects: ['English', 'Urdu', 'Mathematics', 'Islamiyat'],
                        order: getClassOrder(finalClassName),
                        createdAt: serverTimestamp()
                    };

                    await setDoc(newClassRef, newClassData);

                    const newlyCreatedClass = { id: actualClassId, ...newClassData };
                    setClasses(prev => [...prev, newlyCreatedClass]);
                    setSelectedClassId(actualClassId);
                }
            } else {
                // If class already exists, ensure section is registered and increment student count
                try {
                    const sec = selectedSection.trim().toUpperCase() || 'A';
                    const classDocRef = doc(db, 'schools', schoolId, 'classes', actualClassId);
                    const currentCls = classes.find(c => c.id === actualClassId);
                    const currentSections = Array.isArray(currentCls?.sections) ? currentCls.sections : ['A'];
                    const updatedSections = currentSections.includes(sec) ? currentSections : [...currentSections, sec];

                    await updateDoc(classDocRef, {
                        sections: updatedSections,
                        students: (currentCls?.students || 0) + finalRoster.length
                    });
                } catch (clsUpdErr) {
                    console.warn("Could not update class document meta:", clsUpdErr);
                }
            }

            const BATCH_SIZE = 200;
            let currentBatch = writeBatch(db);
            let opCount = 0;
            let savedCount = 0;
            let currentAdmNo = nextAdmissionNo || 'ADM-001';

            for (const st of finalRoster) {
                // If student doesn't have an admission number, auto-assign from sequence
                let admNo = (st.admissionNo || '').trim();
                if (!admNo) {
                    admNo = currentAdmNo;
                    currentAdmNo = parseAndIncrementSequence(currentAdmNo, 'ADM-001');
                }

                // Reference in class subcollection
                const classStudentRef = doc(collection(db, 'schools', schoolId, 'classes', actualClassId, 'students'));
                const studentId = classStudentRef.id;

                const nameParts = (st.fullName || '').trim().split(/\s+/);
                const firstName = nameParts[0] || '';
                const lastName = nameParts.slice(1).join(' ') || '';

                const studentData = {
                    id: studentId,
                    name: st.fullName.trim(),
                    firstName,
                    lastName,
                    rollNo: st.rollNo.trim(),
                    admissionNo: admNo,
                    registrationNo: admNo,
                    section: st.section || selectedSection || 'A',
                    gender: st.gender || 'Male',
                    dob: st.dob || '',
                    admissionDate: new Date().toISOString().split('T')[0],
                    fatherName: st.fatherName.trim(),
                    fatherPhone: st.phone.trim(),
                    fatherCnic: st.cnic.trim(),
                    className: finalClassName,
                    classId: actualClassId,
                    createdAt: serverTimestamp(),
                    parentDetails: {
                        fatherName: st.fatherName.trim(),
                        phone: st.phone.trim(),
                        fatherCnic: st.cnic.trim(),
                        address: '',
                        occupation: '',
                        emergencyPhone: ''
                    }
                };

                // 1. Write to Class subcollection
                currentBatch.set(classStudentRef, studentData);
                opCount++;

                // 2. Write to Master students collection
                const masterStudentRef = doc(db, 'schools', schoolId, 'students', studentId);
                currentBatch.set(masterStudentRef, studentData);
                opCount++;

                savedCount++;

                // Commit if approaching Firestore batch ceiling
                if (opCount >= BATCH_SIZE) {
                    await currentBatch.commit();
                    currentBatch = writeBatch(db);
                    opCount = 0;
                }
            }

            if (opCount > 0) {
                await currentBatch.commit();
            }

            // Update Admission Counter in Settings
            try {
                await updateAdmissionCounter(schoolId, db, currentAdmNo);
                setNextAdmissionNo(currentAdmNo);
            } catch (cntErr) {
                console.warn("Could not update admission counter:", cntErr);
            }

            setShowWorkspace(false);
            setSuccessBanner(`🎉 Successfully onboarded ${savedCount} students into ${finalClassName} with verified sequence!`);

            // Refresh existing students in class
            const updatedSnap = await getDocs(collection(db, 'schools', schoolId, 'classes', actualClassId, 'students'));
            setExistingStudents(updatedSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) {
            console.error("Error saving students to Firestore:", err);
            alert("Failed to save students: " + err.message);
        } finally {
            setIsSavingFirestore(false);
        }
    };

    return (
        <div className="w-full space-y-6">

            {/* Success Banner */}
            {successBanner && (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-center justify-between gap-3 text-emerald-800 shadow-sm animate-in fade-in">
                    <div className="flex items-center gap-2.5">
                        <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                        <span className="text-xs sm:text-sm font-semibold">{successBanner}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSuccessBanner('')}
                        className="p-1 hover:bg-emerald-100 rounded-lg text-emerald-700"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Target Class & Section Configuration */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                        <Users size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">Target Class for Import</h3>
                        <p className="text-xs text-slate-500">
                            Select which class to enroll students into &bull; {existingStudents.length} students currently enrolled
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Class Selector / Typeable Field */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-[11px] font-bold text-slate-500 uppercase">Class Name</label>
                            {selectedClassId ? (
                                <span className="text-[10px] text-emerald-600 font-bold">Existing</span>
                            ) : (
                                <span className="text-[10px] text-indigo-600 font-bold">+ New Class Card</span>
                            )}
                        </div>
                        <div className="relative">
                            <input
                                list="school-classes-datalist"
                                type="text"
                                value={targetClassName}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setTargetClassName(val);
                                    const matched = classes.find(c => (c.name || '').trim().toLowerCase() === val.trim().toLowerCase());
                                    if (matched) {
                                        setSelectedClassId(matched.id);
                                    } else {
                                        setSelectedClassId('');
                                    }
                                }}
                                placeholder="Type or select class..."
                                className="w-44 sm:w-52 px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:bg-white focus:border-indigo-500 outline-none transition"
                            />
                            <datalist id="school-classes-datalist">
                                {classes.map(c => (
                                    <option key={c.id} value={c.name} />
                                ))}
                            </datalist>
                        </div>
                    </div>

                    {/* Section Selector */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Section</label>
                        <input
                            type="text"
                            value={selectedSection}
                            onChange={(e) => setSelectedSection(e.target.value)}
                            placeholder="A"
                            className="w-16 px-3 py-2 text-xs font-bold text-center bg-slate-50 border border-slate-300 rounded-xl text-slate-800 uppercase focus:bg-white focus:border-indigo-500 outline-none"
                        />
                    </div>

                    {/* Next Admission No Preview */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Next Adm No</label>
                        <span className="inline-block px-3 py-2 text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl">
                            {nextAdmissionNo}
                        </span>
                    </div>
                </div>
            </div>

            {/* Upload Zone & Action Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LEFT 2 COLS: Multi-Image Queue */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-bold text-slate-800">Physical Register Photos</h3>
                            <p className="text-xs text-slate-500">
                                Upload 1 or more pages of your admission register (Part 1, Part 2, etc.)
                            </p>
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">
                            {imageQueue.length} {imageQueue.length === 1 ? 'Page' : 'Pages'} Loaded
                        </span>
                    </div>

                    {/* Dropzone */}
                    <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50/60 hover:bg-indigo-50/20 rounded-2xl p-6 text-center transition flex flex-col items-center justify-center gap-3 relative">
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleImageFilesSelected}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                        <div className="w-12 h-12 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-indigo-600">
                            {isProcessingCanvas ? (
                                <RefreshCw size={22} className="animate-spin text-indigo-600" />
                            ) : (
                                <Camera size={22} />
                            )}
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-700">Click to capture or upload register photo</p>
                            <p className="text-xs text-slate-400 mt-0.5">Supports high-res JPG, PNG, WebP &bull; Auto-rotated & B&W filtered</p>
                        </div>
                    </div>

                    {/* Image Queue Previews */}
                    {imageQueue.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                            {imageQueue.map((img, idx) => (
                                <div key={idx} className="relative group rounded-xl border border-slate-200 overflow-hidden bg-slate-100 shadow-sm">
                                    <img
                                        src={img.previewUrl || img.base64}
                                        alt={img.label}
                                        className="w-full h-32 object-cover"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent flex flex-col justify-between p-2">
                                        <button
                                            type="button"
                                            onClick={() => removeImage(idx)}
                                            className="self-end p-1 bg-slate-900/80 hover:bg-rose-600 text-white rounded-lg transition"
                                        >
                                            <X size={14} />
                                        </button>
                                        <div className="text-white text-[11px] font-bold truncate">
                                            {img.label}
                                        </div>
                                    </div>
                                    {img.isBlurry && (
                                        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-amber-500 text-slate-950 rounded text-[10px] font-bold flex items-center gap-1 shadow">
                                            <AlertTriangle size={11} />
                                            <span>Blurry Photo</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Action Bar */}
                    <div className="pt-2 flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            disabled={imageQueue.length === 0 || isExtractingAI}
                            onClick={handleStartAiExtraction}
                            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md shadow-indigo-100 disabled:opacity-40 transition"
                        >
                            {isExtractingAI ? (
                                <>
                                    <RefreshCw size={15} className="animate-spin" />
                                    <span>{aiProgressText || 'AI Digitizing...'}</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles size={15} />
                                    <span>AI Auto-Extract ({imageQueue.length} Pages)</span>
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={handleLaunchManualMode}
                            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-2 transition border border-slate-200"
                        >
                            <FileText size={15} />
                            <span>Rapid Offline Entry (Zero AI)</span>
                        </button>
                    </div>
                </div>

                {/* RIGHT 1 COL: Conditional Demo Lab for School 6257 OR Clean Guide for Regular Schools */}
                {isDemoAccount ? (
                    <div className="bg-gradient-to-b from-indigo-50/70 to-violet-50/50 p-6 rounded-2xl border border-indigo-200 shadow-sm space-y-4 flex flex-col justify-between">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-indigo-700">
                                    <Beaker size={20} className="shrink-0" />
                                    <h3 className="text-sm font-bold">1-Click Test Laboratory</h3>
                                </div>
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded-full">
                                    Demo (6257)
                                </span>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                1-Click interactive test environment with sample register image, verified students, cuttings (orange), and error checks (red).
                            </p>

                            <div className="space-y-3 pt-2">
                                {/* Single Unified Demo Launcher Button */}
                                <button
                                    type="button"
                                    onClick={handleLaunchAllInOneDemoTest}
                                    className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-indigo-200 active:scale-[0.99]"
                                >
                                    <Sparkles size={16} />
                                    <span>🧪 Launch Demo Test Workspace</span>
                                </button>

                                {/* Optional Sample Image File Download */}
                                <div className="text-center pt-1 border-t border-indigo-100">
                                    <a
                                        href="/sample_student_register.jpg"
                                        download="sample_student_register.jpg"
                                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1.5 hover:underline"
                                    >
                                        <Download size={13} />
                                        <span>Download Sample Register File</span>
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="p-3 bg-white/90 rounded-xl border border-indigo-100 text-[11px] text-slate-500 space-y-1">
                            <p className="font-bold text-slate-700 flex items-center gap-1">
                                <ShieldCheck size={14} className="text-emerald-600" />
                                <span>1000% Accuracy Guarantee:</span>
                            </p>
                            <p>
                                Data is never saved blindly. Split-screen verification lets you confirm every student against the photo before saving.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-slate-800">
                                <HelpCircle size={20} className="text-indigo-600 shrink-0" />
                                <h3 className="text-sm font-bold">Scanning Instructions</h3>
                            </div>
                            <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside leading-relaxed">
                                <li>Ensure adequate lighting across the entire physical page.</li>
                                <li>Hold camera steady directly parallel to the register to minimize distortion.</li>
                                <li>For multi-page registers, take photos sequentially (Page 1, Page 2).</li>
                                <li>System automatically enhances pencil/ink contrast and detects blur.</li>
                            </ul>
                        </div>

                        <div className="p-3 bg-white rounded-xl border border-slate-200 text-[11px] text-slate-500 space-y-1">
                            <p className="font-bold text-slate-700 flex items-center gap-1">
                                <ShieldCheck size={14} className="text-emerald-600" />
                                <span>Safe Verification Shield:</span>
                            </p>
                            <p>
                                Every student row is cross-checked against missing roll numbers and duplicates in your database.
                            </p>
                        </div>
                    </div>
                )}

            </div>

            {/* Split Screen Verification Modal */}
            <StudentVerificationWorkspaceModal
                isOpen={showWorkspace}
                onClose={() => setShowWorkspace(false)}
                imageQueue={imageQueue}
                initialRoster={workingRoster}
                classNameTitle={activeClassName}
                classId={selectedClassId}
                targetSection={selectedSection}
                existingStudentsInClass={existingStudents}
                startingAdmissionNo={nextAdmissionNo}
                onSaveToFirestore={handleSaveStudentsToFirestore}
                isSavingFirestore={isSavingFirestore}
            />

            {/* Gemini API Key Modal */}
            {showKeyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-indigo-600 font-bold">
                                <Sparkles size={20} />
                                <span>Gemini API Key Required</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowKeyModal(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Google Gemini Free Tier is 100% free with zero monthly charges. Enter your key below or configure it once in Settings &gt; AI Copilot.
                        </p>
                        <input
                            type="password"
                            value={geminiKey}
                            onChange={(e) => setGeminiKey(e.target.value)}
                            placeholder="AIzaSy..."
                            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl outline-none focus:border-indigo-500"
                        />
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowKeyModal(false)}
                                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (geminiKey.trim()) {
                                        localStorage.setItem(`gemini_api_key_${schoolId}`, geminiKey.trim());
                                        setShowKeyModal(false);
                                        handleStartAiExtraction();
                                    }
                                }}
                                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm"
                            >
                                Save Key & Scan
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
