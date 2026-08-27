import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { 
    collection, getDocs, doc, setDoc, updateDoc, deleteDoc, 
    serverTimestamp, writeBatch 
} from 'firebase/firestore';
import { 
    FileImage, Sparkles, Loader2, Trash2, BookOpen, Layers, 
    CheckSquare, Save, RefreshCw, ChevronDown, 
    ChevronUp, X, Plus
} from 'lucide-react';
import { getDocsFast } from '../utils/cacheUtils';
import { scanBookIndexPage, scanExercisePages } from '../utils/aiVisionService';

const COMPREHENSIVE_SUBJECTS = [
    'Urdu', 'Islamiat', 'Islamiyat', 'Tarjuma-tul-Quran', 'Nazra Quran', 'Arabic', 
    'English', 'Mathematics', 'General Science', 'Physics', 'Chemistry', 'Biology', 
    'Computer Science', 'Pak Studies', 'Social Studies', 'General Knowledge', 'Geography', 
    'History', 'Sindhi', 'Pashto', 'Ethics / Akhlaqiat', 'Economics', 'Accounting', 
    'Commerce', 'Civics', 'Home Economics', 'Arts & Drawing'
];

const UploadSyllabusTab = ({ schoolId }) => {
    // School Classes & Subjects
    const [classes, setClasses] = useState([]);
    const [selectedClassId, setSelectedClassId] = useState('');
    const [availableSubjects, setAvailableSubjects] = useState(COMPREHENSIVE_SUBJECTS);
    const [selectedSubject, setSelectedSubject] = useState('Urdu');
    const [customSubjectInput, setCustomSubjectInput] = useState('');
    const [showCustomSubjectModal, setShowCustomSubjectModal] = useState(false);

    // Chapters in Firestore for the chosen Class & Subject
    const [chapters, setChapters] = useState([]);
    const [loadingChapters, setLoadingChapters] = useState(false);

    // --- STEP 1: INDEX PAGE SCAN (Auto-Generate All Chapters) ---
    const [indexImage, setIndexImage] = useState(null);
    const [indexImagePreview, setIndexImagePreview] = useState(null);
    const [isScanningIndex, setIsScanningIndex] = useState(false);
    const [indexMessage, setIndexMessage] = useState({ type: '', text: '' });
    const [manualChapterTitle, setManualChapterTitle] = useState('');
    const [showManualChapterInput, setShowManualChapterInput] = useState(false);
    const indexFileInputRef = useRef(null);

    // --- STEP 2: EXERCISE QUESTIONS SCAN ---
    const [selectedChapterId, setSelectedChapterId] = useState('');
    const [exerciseImages, setExerciseImages] = useState([]);
    const [exercisePreviews, setExercisePreviews] = useState([]);
    const [isScanningExercise, setIsScanningExercise] = useState(false);
    const [exerciseMessage, setExerciseMessage] = useState({ type: '', text: '' });
    const [extractedQuestions, setExtractedQuestions] = useState([]);
    const [extractedTopics, setExtractedTopics] = useState([]);
    const [isSavingQuestions, setIsSavingQuestions] = useState(false);
    const exerciseFileInputRef = useRef(null);

    // --- BOTTOM VIEW: ACCORDION & DELETE ---
    const [expandedChapterId, setExpandedChapterId] = useState(null);
    const [deleteConfirmChapter, setDeleteConfirmChapter] = useState(null);

    // 1. Fetch Classes on Mount
    useEffect(() => {
        const fetchClasses = async () => {
            if (!schoolId) return;
            try {
                const snap = await getDocsFast(collection(db, 'schools', schoolId, 'classes'));
                const list = snap.docs.map(d => ({
                    id: d.id,
                    name: d.data().name || d.id,
                    subjects: d.data().subjects || []
                }));
                list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
                setClasses(list);
                if (list.length > 0) {
                    setSelectedClassId(list[0].id);
                }
            } catch (err) {
                console.error("Error fetching classes:", err);
            }
        };
        fetchClasses();
    }, [schoolId]);

    // 2. Update Subjects when Class changes (Combine Class subjects + Comprehensive List)
    useEffect(() => {
        if (!selectedClassId) return;
        const currentClass = classes.find(c => c.id === selectedClassId);
        const classSubjects = currentClass?.subjects || [];
        
        const combined = Array.from(new Set([...classSubjects, ...COMPREHENSIVE_SUBJECTS]));
        setAvailableSubjects(combined);
        
        if (combined.length > 0) {
            setSelectedSubject(prev => combined.includes(prev) ? prev : combined[0]);
        }
    }, [selectedClassId, classes]);

    // Add Custom Subject Handler
    const handleAddCustomSubject = () => {
        const trimmed = customSubjectInput.trim();
        if (!trimmed) return;
        if (!availableSubjects.includes(trimmed)) {
            setAvailableSubjects(prev => [trimmed, ...prev]);
        }
        setSelectedSubject(trimmed);
        setCustomSubjectInput('');
        setShowCustomSubjectModal(false);
    };

    // Helper: Extract Chapter Number
    const extractChapterNumber = (title) => {
        if (!title) return 999;
        const match = title.match(/(?:chapter|unit|ch|sabaq|unwan)?\s*(\d+)/i) || title.match(/\d+/);
        return match ? parseInt(match[1] || match[0], 10) : 999;
    };

    // 3. Fetch Existing Chapters for Selected Class & Subject
    const fetchChapters = async () => {
        if (!schoolId || !selectedClassId || !selectedSubject) return;
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
            setChapters(list);

            if (list.length > 0) {
                if (!selectedChapterId || !list.some(c => c.id === selectedChapterId)) {
                    setSelectedChapterId(list[0].id);
                }
            } else {
                setSelectedChapterId('');
            }
        } catch (err) {
            console.error("Error fetching chapters:", err);
        } finally {
            setLoadingChapters(false);
        }
    };

    useEffect(() => {
        fetchChapters();
        setExtractedQuestions([]);
        setExtractedTopics([]);
        setExerciseImages([]);
        setExercisePreviews([]);
        setExerciseMessage({ type: '', text: '' });
    }, [schoolId, selectedClassId, selectedSubject]);

    // Convert File to Base64
    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = (error) => reject(error);
        });
    };

    // =========================================================================
    // STEP 1: SCAN BOOK INDEX PAGE (Auto-Extract All Chapters)
    // =========================================================================
    const handleIndexImageSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setIndexImage(file);
            setIndexImagePreview(URL.createObjectURL(file));
            setIndexMessage({ type: '', text: '' });
        }
    };

    const handleScanIndexPage = async () => {
        if (!indexImage) {
            setIndexMessage({ type: 'error', text: 'Please select a photo/screenshot of the Book Table of Contents / Index page.' });
            return;
        }

        setIsScanningIndex(true);
        setIndexMessage({ type: '', text: '' });

        try {
            const base64Data = await fileToBase64(indexImage);
            const extractedChapters = await scanBookIndexPage(base64Data, indexImage.type, selectedSubject);

            if (extractedChapters.length === 0) {
                throw new Error('No chapters could be identified from this image. Please ensure the index page is clear.');
            }

            const batch = writeBatch(db);
            const baseTime = new Date('2026-01-01T00:00:00Z').getTime();

            extractedChapters.forEach((ch, idx) => {
                const num = Number(ch.chapterNumber) || (idx + 1);
                const title = ch.title || `Chapter ${num}`;
                const cleanSlug = `ch_${num}_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 30)}`;
                const docRef = doc(db, 'schools', schoolId, 'classes', selectedClassId, 'syllabus', selectedSubject, 'chapters', cleanSlug);
                
                const sequentialDate = new Date(baseTime + (num * 60 + idx) * 1000);

                batch.set(docRef, {
                    title: title,
                    time: ch.time || '2 Weeks',
                    status: 'Pending',
                    topics: [],
                    questions: [],
                    createdAt: sequentialDate,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            });

            await batch.commit();

            setIndexMessage({ type: 'success', text: `Success! ${extractedChapters.length} chapters automatically generated for ${selectedSubject} and added to dropdown below.` });
            setIndexImage(null);
            setIndexImagePreview(null);
            await fetchChapters();

        } catch (err) {
            console.error("Index Scan Error:", err);
            setIndexMessage({ type: 'error', text: `Scan failed: ${err.message}` });
        } finally {
            setIsScanningIndex(false);
        }
    };

    // Quick Add Single Chapter Manually
    const handleAddManualChapter = async () => {
        if (!manualChapterTitle.trim()) return;
        try {
            const num = extractChapterNumber(manualChapterTitle.trim());
            const cleanSlug = `ch_${num}_${Date.now().toString().slice(-4)}`;
            const docRef = doc(db, 'schools', schoolId, 'classes', selectedClassId, 'syllabus', selectedSubject, 'chapters', cleanSlug);
            
            await setDoc(docRef, {
                title: manualChapterTitle.trim(),
                time: '2 Weeks',
                status: 'Pending',
                topics: [],
                questions: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            setManualChapterTitle('');
            setShowManualChapterInput(false);
            await fetchChapters();
            setSelectedChapterId(cleanSlug);
        } catch (err) {
            alert(`Error adding chapter: ${err.message}`);
        }
    };

    // =========================================================================
    // STEP 2: SCAN CHAPTER EXERCISE (Questions Extraction)
    // =========================================================================
    const handleExerciseImagesSelect = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        setExerciseImages(prev => [...prev, ...files]);
        const newPreviews = files.map(file => URL.createObjectURL(file));
        setExercisePreviews(prev => [...prev, ...newPreviews]);
        setExerciseMessage({ type: '', text: '' });
    };

    const removeExerciseImage = (index) => {
        setExerciseImages(prev => prev.filter((_, i) => i !== index));
        setExercisePreviews(prev => {
            const updated = [...prev];
            URL.revokeObjectURL(updated[index]);
            return updated.filter((_, i) => i !== index);
        });
    };

    const handleScanExercisePages = async () => {
        if (!selectedChapterId) {
            setExerciseMessage({ type: 'error', text: 'Please select a chapter from the dropdown first.' });
            return;
        }
        if (exerciseImages.length === 0) {
            setExerciseMessage({ type: 'error', text: 'Please upload at least one photo/screenshot of the chapter exercise.' });
            return;
        }

        setIsScanningExercise(true);
        setExerciseMessage({ type: '', text: '' });

        try {
            const selectedChapterObj = chapters.find(c => c.id === selectedChapterId);
            const chapterName = selectedChapterObj ? selectedChapterObj.title : 'Selected Chapter';

            const imageParts = await Promise.all(
                exerciseImages.map(async (file) => {
                    const base64Data = await fileToBase64(file);
                    return {
                        inlineData: {
                            data: base64Data,
                            mimeType: file.type || 'image/jpeg'
                        }
                    };
                })
            );

            const result = await scanExercisePages(imageParts, selectedSubject, chapterName);
            const qList = result.questions || [];
            const tList = result.topics || [];

            const formattedQuestions = qList.map((q, idx) => ({
                id: `q_${Date.now()}_${idx}`,
                type: q.type === 'mcq' ? 'mcq' : q.type === 'long' ? 'long' : 'short',
                question: q.question || '',
                options: Array.isArray(q.options) && q.options.length > 0 ? q.options : (q.type === 'mcq' ? ['', '', '', ''] : []),
                correctAnswer: q.correctAnswer || (q.options?.[0] || ''),
                marks: Number(q.marks) || (q.type === 'mcq' ? 1 : q.type === 'long' ? 5 : 2)
            }));

            setExtractedQuestions(formattedQuestions);
            setExtractedTopics(tList);
            setExerciseMessage({ type: 'success', text: `Extracted ${formattedQuestions.length} questions! Review below and click "Save Questions".` });

        } catch (err) {
            console.error("Exercise Scan Error:", err);
            setExerciseMessage({ type: 'error', text: `Scan failed: ${err.message}` });
        } finally {
            setIsScanningExercise(false);
        }
    };

    // Save Questions to Selected Chapter
    const handleSaveQuestionsToFirestore = async () => {
        if (!selectedChapterId) return;
        setIsSavingQuestions(true);
        try {
            const chapDocRef = doc(db, 'schools', schoolId, 'classes', selectedClassId, 'syllabus', selectedSubject, 'chapters', selectedChapterId);
            
            const currentChap = chapters.find(c => c.id === selectedChapterId);
            const combinedTopics = Array.from(new Set([...(currentChap?.topics || []), ...extractedTopics]));

            await updateDoc(chapDocRef, {
                questions: extractedQuestions,
                topics: combinedTopics,
                updatedAt: serverTimestamp()
            });

            setExerciseMessage({ type: 'success', text: `All ${extractedQuestions.length} questions saved to "${currentChap?.title}" successfully!` });
            
            setExerciseImages([]);
            setExercisePreviews([]);
            setExtractedQuestions([]);
            setExtractedTopics([]);
            await fetchChapters();

        } catch (err) {
            console.error("Error saving questions:", err);
            setExerciseMessage({ type: 'error', text: `Failed to save: ${err.message}` });
        } finally {
            setIsSavingQuestions(false);
        }
    };

    // Delete entire chapter
    const handleDeleteChapter = async (chapterId) => {
        try {
            const chapDocRef = doc(db, 'schools', schoolId, 'classes', selectedClassId, 'syllabus', selectedSubject, 'chapters', chapterId);
            await deleteDoc(chapDocRef);
            setChapters(prev => prev.filter(c => c.id !== chapterId));
            setDeleteConfirmChapter(null);
            if (selectedChapterId === chapterId) {
                setSelectedChapterId('');
            }
        } catch (err) {
            console.error("Error deleting chapter:", err);
            alert("Failed to delete chapter.");
        }
    };

    // Delete single question from existing chapter
    const handleDeleteQuestionFromChapter = async (chapter, qId) => {
        try {
            const updatedQuestions = (chapter.questions || []).filter(q => (q.id || q.question) !== qId);
            const chapDocRef = doc(db, 'schools', schoolId, 'classes', selectedClassId, 'syllabus', selectedSubject, 'chapters', chapter.id);
            await updateDoc(chapDocRef, { questions: updatedQuestions });
            
            setChapters(prev => prev.map(c => {
                if (c.id === chapter.id) {
                    return { ...c, questions: updatedQuestions };
                }
                return c;
            }));
        } catch (err) {
            console.error("Error deleting question:", err);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.3s ease-out' }}>
            
            {/* Scoped Urdu Nastaliq Book Typography */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap');
                .urdu-book-font {
                    font-family: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaliq', 'Urdu Typesetting', 'Amiri', Tahoma, serif !important;
                    line-height: 2.2 !important;
                    letter-spacing: 0.02em;
                }
            `}</style>

            {/* Top Bar: Class & Subject Selector */}
            <div style={{
                background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem'
            }}>
                <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', flex: 1 }}>
                    <div style={{ minWidth: '200px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
                            1. Select Class
                        </label>
                        <select
                            value={selectedClassId}
                            onChange={(e) => setSelectedClassId(e.target.value)}
                            style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', fontWeight: '700', color: '#1e293b' }}
                        >
                            {classes.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ minWidth: '240px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569' }}>
                                2. Select Subject
                            </label>
                            <button
                                onClick={() => setShowCustomSubjectModal(true)}
                                style={{
                                    border: 'none', background: 'transparent', color: '#4f46e5',
                                    fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px'
                                }}
                            >
                                <Plus size={14} /> Add Custom
                            </button>
                        </div>
                        <select
                            value={selectedSubject}
                            onChange={(e) => setSelectedSubject(e.target.value)}
                            style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', fontWeight: '700', color: '#1e293b' }}
                        >
                            {availableSubjects.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Add Custom Subject Modal */}
            {showCustomSubjectModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
                }}>
                    <div style={{ background: 'white', borderRadius: '12px', padding: '1.75rem', width: '100%', maxWidth: '400px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700', color: '#1e293b' }}>
                                + Add Custom Subject
                            </h3>
                            <button onClick={() => setShowCustomSubjectModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.75rem' }}>
                            Enter the subject name (e.g. <em>Tarjuma-tul-Quran, Coding, Robotics, German</em>):
                        </p>
                        <input
                            type="text"
                            value={customSubjectInput}
                            onChange={(e) => setCustomSubjectInput(e.target.value)}
                            placeholder="Subject name..."
                            autoFocus
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', marginBottom: '1.25rem' }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddCustomSubject();
                            }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                onClick={() => setShowCustomSubjectModal(false)}
                                style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddCustomSubject}
                                style={{ padding: '0.5rem 1.2rem', borderRadius: '6px', border: 'none', background: 'var(--primary, #4f46e5)', color: 'white', fontWeight: '600', cursor: 'pointer' }}
                            >
                                Add Subject
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* CARD 1: SCAN BOOK INDEX / TABLE OF CONTENTS (One-Time Setup)              */}
            {/* ========================================================================= */}
            <div style={{
                background: 'white', padding: '1.5rem', borderRadius: '12px',
                border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                    <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', color: '#6366f1', letterSpacing: '0.05em' }}>
                            STEP 1 (ONE-TIME SETUP)
                        </span>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#1e293b', margin: '0.2rem 0 0 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <BookOpen size={20} color="var(--primary, #4f46e5)" /> Scan Book Index Page (Auto-Create All Chapters for {selectedSubject})
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
                            Upload a photo of the <strong>{selectedSubject}</strong> book's Table of Contents (Index). Built-in AI will automatically extract all chapter names into the dropdown below!
                        </p>
                    </div>

                    <button
                        onClick={() => setShowManualChapterInput(!showManualChapterInput)}
                        style={{
                            padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1',
                            background: '#f8fafc', color: '#475569', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer'
                        }}
                    >
                        {showManualChapterInput ? 'Hide Manual' : '+ Add Single Chapter Manually'}
                    </button>
                </div>

                {/* Manual Chapter Input Drawer */}
                {showManualChapterInput && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                        <input
                            type="text"
                            value={manualChapterTitle}
                            onChange={(e) => setManualChapterTitle(e.target.value)}
                            placeholder="e.g. سبق 1: حمد (نظم) or Chapter 1: Measurements"
                            className="urdu-book-font"
                            style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1rem' }}
                        />
                        <button
                            onClick={handleAddManualChapter}
                            style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: 'var(--primary, #4f46e5)', color: 'white', fontWeight: '600', fontSize: '0.85rem', cursor: 'pointer' }}
                        >
                            + Add Chapter
                        </button>
                    </div>
                )}

                {/* Index Image Upload Trigger & Scan Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => indexFileInputRef.current?.click()}
                        style={{
                            padding: '0.65rem 1.25rem', borderRadius: '8px', border: '1px solid #cbd5e1',
                            background: '#f8fafc', color: '#334155', fontWeight: '600', fontSize: '0.9rem',
                            display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'
                        }}
                    >
                        <FileImage size={18} color="var(--primary, #4f46e5)" /> 
                        {indexImage ? indexImage.name : `📷 Upload ${selectedSubject} Book Index Photo`}
                    </button>
                    <input
                        ref={indexFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleIndexImageSelect}
                        style={{ display: 'none' }}
                    />

                    {indexImage && (
                        <button
                            onClick={handleScanIndexPage}
                            disabled={isScanningIndex}
                            style={{
                                padding: '0.65rem 1.5rem', borderRadius: '8px', border: 'none',
                                background: isScanningIndex ? '#cbd5e1' : 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                                color: 'white', fontWeight: '700', fontSize: '0.9rem', cursor: isScanningIndex ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)'
                            }}
                        >
                            {isScanningIndex ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            {isScanningIndex ? 'AI Reading Index Page...' : '⚡ Auto-Generate All Chapters'}
                        </button>
                    )}

                    {indexImagePreview && (
                        <div style={{ position: 'relative', width: '48px', height: '48px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                            <img src={indexImagePreview} alt="Index preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button
                                onClick={() => { setIndexImage(null); setIndexImagePreview(null); }}
                                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}
                </div>

                {indexMessage.text && (
                    <div style={{
                        marginTop: '0.75rem', padding: '0.7rem 1rem', borderRadius: '6px', fontSize: '0.85rem',
                        background: indexMessage.type === 'success' ? '#f0fdf4' : '#fef2f2',
                        color: indexMessage.type === 'success' ? '#166534' : '#991b1b',
                        borderLeft: `4px solid ${indexMessage.type === 'success' ? '#22c55e' : '#ef4444'}`
                    }}>
                        {indexMessage.text}
                    </div>
                )}
            </div>

            {/* ========================================================================= */}
            {/* CARD 2: SCAN CHAPTER EXERCISE (Select Chapter & Upload Exercise)          */}
            {/* ========================================================================= */}
            <div style={{
                background: 'white', padding: '1.5rem', borderRadius: '12px',
                border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', color: '#059669', letterSpacing: '0.05em' }}>
                    STEP 2
                </span>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#1e293b', margin: '0.2rem 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckSquare size={20} color="#059669" /> Select Chapter & Upload Exercise Photo
                </h3>

                {chapters.length === 0 ? (
                    <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                        No chapters found for <strong>{selectedSubject}</strong> yet. Use <strong>Step 1</strong> above to scan the book Index page first.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        
                        {/* Chapter Dropdown Picker */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.4rem' }}>
                                Choose Chapter to Add Exercise Questions:
                            </label>
                            <select
                                value={selectedChapterId}
                                onChange={(e) => {
                                    setSelectedChapterId(e.target.value);
                                    setExtractedQuestions([]);
                                    setExtractedTopics([]);
                                    setExerciseImages([]);
                                    setExercisePreviews([]);
                                    setExerciseMessage({ type: '', text: '' });
                                }}
                                className="urdu-book-font"
                                style={{
                                    width: '100%', padding: '0.75rem', borderRadius: '8px', border: '2px solid #2563eb',
                                    background: '#eff6ff', fontWeight: '700', fontSize: '1.15rem', color: '#1e3a8a'
                                }}
                            >
                                {chapters.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.title} {c.questions?.length > 0 ? `(${c.questions.length} Qs already added)` : '(No Qs yet)'}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Exercise Photo Upload */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.4rem' }}>
                                Upload Exercise Page(s) Photo / Screenshot:
                            </label>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => exerciseFileInputRef.current?.click()}
                                    style={{
                                        padding: '0.65rem 1.25rem', borderRadius: '8px', border: '1px solid #cbd5e1',
                                        background: '#f8fafc', color: '#334155', fontWeight: '600', fontSize: '0.9rem',
                                        display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'
                                    }}
                                >
                                    <FileImage size={18} color="var(--primary, #4f46e5)" /> + Add Exercise Pages
                                </button>
                                <input
                                    ref={exerciseFileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleExerciseImagesSelect}
                                    style={{ display: 'none' }}
                                />

                                <button
                                    onClick={handleScanExercisePages}
                                    disabled={isScanningExercise || exerciseImages.length === 0}
                                    style={{
                                        padding: '0.65rem 1.5rem', borderRadius: '8px', border: 'none',
                                        background: isScanningExercise || exerciseImages.length === 0 ? '#cbd5e1' : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                        color: 'white', fontWeight: '700', fontSize: '0.9rem', cursor: isScanningExercise || exerciseImages.length === 0 ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
                                    }}
                                >
                                    {isScanningExercise ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                    {isScanningExercise ? 'AI Scanning Exercise...' : '⚡ Scan & Extract Exercise Questions'}
                                </button>
                            </div>
                        </div>

                        {/* Exercise Previews */}
                        {exercisePreviews.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.75rem' }}>
                                {exercisePreviews.map((src, index) => (
                                    <div key={index} style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden', border: '1px solid #cbd5e1', height: '110px', background: '#f8fafc' }}>
                                        <img src={src} alt={`Exercise ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        <button
                                            onClick={() => removeExerciseImage(index)}
                                            style={{
                                                position: 'absolute', top: '3px', right: '3px', background: 'rgba(239, 68, 68, 0.9)',
                                                color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                                            }}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {exerciseMessage.text && (
                            <div style={{
                                padding: '0.7rem 1rem', borderRadius: '6px', fontSize: '0.85rem',
                                background: exerciseMessage.type === 'success' ? '#f0fdf4' : '#fef2f2',
                                color: exerciseMessage.type === 'success' ? '#166534' : '#991b1b',
                                borderLeft: `4px solid ${exerciseMessage.type === 'success' ? '#22c55e' : '#ef4444'}`
                            }}>
                                {exerciseMessage.text}
                            </div>
                        )}

                        {/* Pre-Save Question Review & Cards */}
                        {extractedQuestions.length > 0 && (
                            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>
                                        Review Extracted Questions ({extractedQuestions.length})
                                    </h4>
                                    <button
                                        onClick={() => setExtractedQuestions(prev => [...prev, { id: `q_${Date.now()}`, type: 'short', question: '', marks: 2 }])}
                                        style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' }}
                                    >
                                        + Add Question
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                    {extractedQuestions.map((q, idx) => (
                                        <div key={q.id || idx} style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: q.type === 'mcq' ? '#6366f1' : q.type === 'long' ? '#d97706' : '#059669' }}>
                                                    Q{idx + 1}. [{q.type}] ({q.marks} Marks)
                                                </span>
                                                <button
                                                    onClick={() => setExtractedQuestions(prev => prev.filter((_, i) => i !== idx))}
                                                    style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                                                    title="Delete question"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                            <textarea
                                                value={q.question}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setExtractedQuestions(prev => prev.map((item, i) => i === idx ? { ...item, question: val } : item));
                                                }}
                                                rows={2}
                                                className="urdu-book-font"
                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1.05rem', background: 'white' }}
                                            />
                                        </div>
                                    ))}
                                </div>

                                {/* Save Button */}
                                <button
                                    onClick={handleSaveQuestionsToFirestore}
                                    disabled={isSavingQuestions}
                                    style={{
                                        padding: '0.75rem', borderRadius: '8px', border: 'none',
                                        background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)', color: 'white',
                                        fontWeight: '700', fontSize: '1rem', cursor: isSavingQuestions ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem',
                                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
                                    }}
                                >
                                    {isSavingQuestions ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                    💾 Save Questions to "{chapters.find(c => c.id === selectedChapterId)?.title}"
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ========================================================================= */}
            {/* VIEW 3: CURRENT SUBJECT SYLLABUS LIST (BLUE BACKGROUND & WHITE BOOK FONT) */}
            {/* ========================================================================= */}
            <div style={{
                background: 'white', padding: '1.5rem', borderRadius: '12px',
                border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Layers size={20} color="#2563eb" /> 
                        Current Syllabus for {selectedSubject} ({chapters.length} Chapters)
                    </h3>
                    <button
                        onClick={fetchChapters}
                        style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.8rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}
                    >
                        <RefreshCw size={14} /> Refresh
                    </button>
                </div>

                {chapters.length === 0 ? (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                        No chapters added for <strong>{selectedSubject}</strong> yet.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        {chapters.map((ch, idx) => {
                            const isExpanded = expandedChapterId === ch.id;
                            const chQuestions = ch.questions || [];
                            const isUrduText = /[\u0600-\u06FF]/.test(ch.title || '');

                            return (
                                <div 
                                    key={ch.id} 
                                    style={{ 
                                        borderRadius: '10px', 
                                        overflow: 'hidden',
                                        boxShadow: '0 3px 8px rgba(30, 64, 175, 0.15)',
                                        border: '1px solid #1e40af'
                                    }}
                                >
                                    {/* Blue Chapter Header Card */}
                                    <div
                                        onClick={() => setExpandedChapterId(isExpanded ? null : ch.id)}
                                        style={{
                                            padding: '1rem 1.25rem',
                                            background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
                                            color: '#ffffff',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                                            {/* Chapter Number Badge */}
                                            <span style={{
                                                width: '32px', height: '32px', borderRadius: '50%',
                                                background: '#ffffff', color: '#1e40af',
                                                fontWeight: '800', fontSize: '0.95rem',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.15)', flexShrink: 0
                                            }}>
                                                {idx + 1}
                                            </span>

                                            {/* Urdu Book Font Title */}
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                                <span 
                                                    className={isUrduText ? 'urdu-book-font' : ''}
                                                    style={{
                                                        color: '#ffffff',
                                                        fontWeight: '700',
                                                        fontSize: isUrduText ? '1.25rem' : '1.05rem',
                                                        textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                                                        letterSpacing: isUrduText ? '0.02em' : 'normal'
                                                    }}
                                                >
                                                    {ch.title}
                                                </span>

                                                {/* Glass Pill Badge for Question Count */}
                                                <span style={{
                                                    background: 'rgba(255, 255, 255, 0.22)',
                                                    border: '1px solid rgba(255, 255, 255, 0.4)',
                                                    color: '#ffffff',
                                                    padding: '0.2rem 0.65rem',
                                                    borderRadius: '20px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '700',
                                                    letterSpacing: '0.02em'
                                                }}>
                                                    {chQuestions.length} Questions
                                                </span>
                                            </div>
                                        </div>

                                        {/* Action Controls */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }} onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => setDeleteConfirmChapter(ch)}
                                                style={{
                                                    border: '1px solid rgba(255, 255, 255, 0.3)',
                                                    background: 'rgba(239, 68, 68, 0.35)',
                                                    color: '#ffffff',
                                                    padding: '7px',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'background 0.2s'
                                                }}
                                                title="Delete Chapter"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => setExpandedChapterId(isExpanded ? null : ch.id)}
                                                style={{ border: 'none', background: 'transparent', color: '#ffffff', cursor: 'pointer' }}
                                            >
                                                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Questions List (Ice-Blue Background) */}
                                    {isExpanded && (
                                        <div style={{ padding: '1.25rem', background: '#f0f7ff', borderTop: '2px solid rgba(255,255,255,0.2)' }}>
                                            {chQuestions.length === 0 ? (
                                                <div style={{ fontSize: '0.9rem', color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>
                                                    No questions added to this chapter yet. Select this chapter in Step 2 above to upload exercise photos.
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                                    {chQuestions.map((q, qIdx) => {
                                                        const isQuestionUrdu = /[\u0600-\u06FF]/.test(q.question || '');

                                                        return (
                                                            <div 
                                                                key={q.id || qIdx} 
                                                                style={{ 
                                                                    padding: '0.85rem 1rem', background: '#ffffff', 
                                                                    borderRadius: '8px', border: '1px solid #dbeafe',
                                                                    borderLeft: '4px solid #2563eb',
                                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                                                                }}
                                                            >
                                                                <div style={{ flex: 1, paddingRight: '1rem' }}>
                                                                    <span style={{ 
                                                                        fontSize: '0.75rem', fontWeight: '800', 
                                                                        color: q.type === 'mcq' ? '#4f46e5' : q.type === 'long' ? '#d97706' : '#059669',
                                                                        textTransform: 'uppercase', marginRight: '0.5rem'
                                                                    }}>
                                                                        [{q.type || 'short'}]
                                                                    </span>
                                                                    <span 
                                                                        className={isQuestionUrdu ? 'urdu-book-font' : ''}
                                                                        style={{ 
                                                                            fontSize: isQuestionUrdu ? '1.1rem' : '0.95rem', 
                                                                            color: '#1e293b',
                                                                            fontWeight: '600'
                                                                        }}
                                                                    >
                                                                        {q.question}
                                                                    </span>
                                                                </div>
                                                                <button
                                                                    onClick={() => handleDeleteQuestionFromChapter(ch, q.id || q.question)}
                                                                    style={{ border: 'none', background: '#fee2e2', color: '#ef4444', cursor: 'pointer', padding: '6px', borderRadius: '6px' }}
                                                                    title="Delete this question"
                                                                >
                                                                    <Trash2 size={15} />
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Delete Chapter Confirmation Modal */}
            {deleteConfirmChapter && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
                }}>
                    <div style={{ background: 'white', borderRadius: '12px', padding: '1.75rem', width: '100%', maxWidth: '400px' }}>
                        <h3 style={{ margin: '0 0 0.5rem 0', color: '#ef4444', fontSize: '1.15rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Trash2 size={18} /> Delete Chapter?
                        </h3>
                        <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1.25rem' }}>
                            Are you sure you want to delete <strong>"{deleteConfirmChapter.title}"</strong>?
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                onClick={() => setDeleteConfirmChapter(null)}
                                style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteChapter(deleteConfirmChapter.id)}
                                style={{ padding: '0.5rem 1.2rem', borderRadius: '6px', border: 'none', background: '#ef4444', color: 'white', fontWeight: '600', cursor: 'pointer' }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default UploadSyllabusTab;
