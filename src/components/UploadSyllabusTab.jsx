import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { 
    collection, getDocs, doc, setDoc, updateDoc, deleteDoc, 
    serverTimestamp, writeBatch 
} from 'firebase/firestore';
import { 
    FileImage, Sparkles, Loader2, Trash2, BookOpen, Layers, 
    CheckSquare, Save, RefreshCw, ChevronDown, 
    ChevronUp, X, Plus, FileText, UploadCloud, CheckCircle2,
    FileCheck2, HelpCircle, Edit2, ArrowRight
} from 'lucide-react';
import { getDocsFast } from '../utils/cacheUtils';
import { scanCompleteBookPdf } from '../utils/aiVisionService';
import { jsPDF } from 'jspdf';

const COMPREHENSIVE_SUBJECTS = [
    'Urdu', 'Islamiat', 'Islamiyat', 'Tarjuma-tul-Quran', 'Nazra Quran', 'Arabic', 
    'English', 'Mathematics', 'General Science', 'Physics', 'Chemistry', 'Biology', 
    'Computer Science', 'Pak Studies', 'Social Studies', 'General Knowledge', 'Geography', 
    'History', 'Sindhi', 'Pashto', 'Ethics / Akhlaqiat', 'Economics', 'Accounting', 
    'Commerce', 'Civics', 'Home Economics', 'Arts & Drawing'
];

// Helper: Accurately detect if text is predominantly Urdu or English
const checkIsUrdu = (text, subject = '') => {
    if (!text) return false;
    const isUrduSubject = /^(urdu|islamiat|islamiyat|arabic|sindhi|pashto|tarjuma)/i.test((subject || '').trim());
    
    const urduChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const latinChars = (text.match(/[a-zA-Z]/g) || []).length;

    if (urduChars > latinChars && urduChars > 2) return true;
    if (latinChars === 0 && urduChars > 0) return true;
    if (isUrduSubject && latinChars < 5 && urduChars > 0) return true;

    return false;
};

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

    // 1-CLICK MULTI-PAGE BOOK / EXERCISE PDF SCANNER
    const [pdfFile, setPdfFile] = useState(null);
    const [isScanningPdf, setIsScanningPdf] = useState(false);
    const [pdfScanMessage, setPdfScanMessage] = useState({ type: '', text: '' });
    const [extractedPdfChapters, setExtractedPdfChapters] = useState([]);
    const [isSavingAllPdfChapters, setIsSavingAllPdfChapters] = useState(false);
    const [expandedPdfChapterIdx, setExpandedPdfChapterIdx] = useState(0);
    const pdfFileInputRef = useRef(null);

    // BOTTOM VIEW: ACCORDION & DELETE
    const [expandedChapterId, setExpandedChapterId] = useState(null);
    const [deleteConfirmChapter, setDeleteConfirmChapter] = useState(null);
    const [showClearAllModal, setShowClearAllModal] = useState(false);
    const [isClearingAll, setIsClearingAll] = useState(false);

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
        } catch (err) {
            console.error("Error fetching chapters:", err);
        } finally {
            setLoadingChapters(false);
        }
    };

    useEffect(() => {
        fetchChapters();
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
    // NEW: 1-CLICK MULTI-PAGE BOOK / EXERCISE PDF SCANNER (AI Vision Auto-Extract)
    // =========================================================================
    const handlePdfFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setPdfFile(file);
            setPdfScanMessage({ type: '', text: '' });
            setExtractedPdfChapters([]);
        }
    };

    const handleScanCompletePdf = async () => {
        if (!pdfFile) {
            setPdfScanMessage({ type: 'error', text: 'Please upload or select a Book / Exercise PDF or scanned images first.' });
            return;
        }

        setIsScanningPdf(true);
        setPdfScanMessage({ type: 'info', text: 'AI is analyzing all pages of your PDF. Extracting all chapters, MCQs, short, and long questions...' });

        try {
            const base64Data = await fileToBase64(pdfFile);
            const currentClass = classes.find(c => c.id === selectedClassId);
            const className = currentClass ? currentClass.name : selectedClassId;

            const results = await scanCompleteBookPdf(base64Data, pdfFile.type || 'application/pdf', selectedSubject, className);

            if (!results || results.length === 0) {
                throw new Error('No chapters or questions could be identified from this document. Please ensure the scan is clear and legible.');
            }

            const formattedChapters = results.map((ch, chIdx) => {
                const num = Number(ch.chapterNumber) || (chIdx + 1);
                const title = ch.title || `Chapter ${num}`;
                const questions = (ch.questions || []).map((q, qIdx) => ({
                    id: `q_${Date.now()}_${chIdx}_${qIdx}`,
                    type: ['mcq', 'blank', 'true_false', 'short', 'long'].includes(q.type) ? q.type : 'short',
                    question: q.question || '',
                    options: Array.isArray(q.options) && q.options.length > 0 ? q.options : (q.type === 'mcq' ? ['', '', '', ''] : []),
                    correctAnswer: q.correctAnswer || (q.options?.[0] || ''),
                    marks: Number(q.marks) || (['mcq', 'blank', 'true_false'].includes(q.type) ? 1 : q.type === 'long' ? 5 : 2)
                }));

                return {
                    chapterNumber: num,
                    title: title,
                    time: ch.time || '2 Weeks',
                    topics: ch.topics || [],
                    questions: questions
                };
            });

            setExtractedPdfChapters(formattedChapters);
            const totalQs = formattedChapters.reduce((acc, c) => acc + (c.questions?.length || 0), 0);
            setPdfScanMessage({ 
                type: 'success', 
                text: `✨ Successfully extracted ${formattedChapters.length} Chapters and ${totalQs} total questions for ${selectedSubject}! Review below and click "Save to Syllabus Database".` 
            });

        } catch (err) {
            console.error("PDF Scan Error:", err);
            setPdfScanMessage({ type: 'error', text: `Scan failed: ${err.message}` });
        } finally {
            setIsScanningPdf(false);
        }
    };

    const handleSaveAllPdfChaptersToFirestore = async () => {
        if (!extractedPdfChapters || extractedPdfChapters.length === 0) return;
        if (!schoolId || !selectedClassId || !selectedSubject) return;

        setIsSavingAllPdfChapters(true);
        try {
            const batch = writeBatch(db);
            const baseTime = new Date('2026-01-01T00:00:00Z').getTime();

            extractedPdfChapters.forEach((ch, idx) => {
                const num = Number(ch.chapterNumber) || (idx + 1);
                const title = ch.title || `Chapter ${num}`;
                const cleanSlug = `ch_${num}_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 30)}`;
                const docRef = doc(db, 'schools', schoolId, 'classes', selectedClassId, 'syllabus', selectedSubject, 'chapters', cleanSlug);
                const sequentialDate = new Date(baseTime + (num * 60 + idx) * 1000);

                batch.set(docRef, {
                    title: title,
                    time: ch.time || '2 Weeks',
                    status: 'Pending',
                    topics: ch.topics || [],
                    questions: ch.questions || [],
                    createdAt: sequentialDate,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            });

            await batch.commit();

            setPdfScanMessage({ 
                type: 'success', 
                text: `🎉 Successfully saved all ${extractedPdfChapters.length} chapters & questions to ${selectedSubject} Syllabus!` 
            });
            setExtractedPdfChapters([]);
            setPdfFile(null);
            await fetchChapters();

        } catch (err) {
            console.error("Error saving bulk chapters:", err);
            setPdfScanMessage({ type: 'error', text: `Failed to save chapters: ${err.message}` });
        } finally {
            setIsSavingAllPdfChapters(false);
        }
    };

    // Delete entire chapter
    const handleDeleteChapter = async (chapterId) => {
        try {
            const chapDocRef = doc(db, 'schools', schoolId, 'classes', selectedClassId, 'syllabus', selectedSubject, 'chapters', chapterId);
            await deleteDoc(chapDocRef);
            setChapters(prev => prev.filter(c => c.id !== chapterId));
            setDeleteConfirmChapter(null);
        } catch (err) {
            console.error("Error deleting chapter:", err);
            alert("Failed to delete chapter.");
        }
    };

    // Delete all chapters for this subject in 1 click
    const handleClearAllChapters = async () => {
        if (!schoolId || !selectedClassId || !selectedSubject) return;
        setIsClearingAll(true);
        try {
            const batch = writeBatch(db);
            chapters.forEach(ch => {
                const docRef = doc(db, 'schools', schoolId, 'classes', selectedClassId, 'syllabus', selectedSubject, 'chapters', ch.id);
                batch.delete(docRef);
            });
            await batch.commit();
            setChapters([]);
            setSelectedChapterId('');
            setShowClearAllModal(false);
        } catch (err) {
            console.error("Error clearing all chapters:", err);
            alert("Failed to clear chapters: " + err.message);
        } finally {
            setIsClearingAll(false);
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
            
            {/* Scoped Authentic Pakistani Urdu Nastaliq Book Typography */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;500;600;700&family=Gulzar&display=swap');
                .urdu-book-font {
                    font-family: 'Noto Nastaliq Urdu', 'Gulzar', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', serif !important;
                    line-height: 2.2 !important;
                    letter-spacing: 0.01em;
                    font-feature-settings: "kern" 1, "liga" 1;
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
            {/* PRIMARY VIEW: 1-CLICK MULTI-PAGE BOOK / EXERCISE PDF SCANNER              */}
            {/* ========================================================================= */}
            <div style={{
                background: 'white', padding: '1.75rem', borderRadius: '14px',
                border: '1px solid #c7d2fe', boxShadow: '0 4px 20px rgba(79, 70, 229, 0.08)'
            }}>
                <div style={{ marginBottom: '1.25rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', color: '#4f46e5', letterSpacing: '0.05em' }}>
                        ULTRA-FAST SYLLABUS & QUESTION BANK CREATOR
                    </span>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#1e293b', margin: '0.25rem 0 0.4rem 0', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <BookOpen size={24} color="#4f46e5" /> 1-Click Multi-Page Book / Exercise PDF Scanner
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                        Drop your <strong>CamScanner Multi-Page PDF</strong> (or downloaded Book PDF) containing index and chapter exercises. 
                        AI Vision will automatically detect <strong>All Chapters</strong>, separate <strong>MCQs, Short Questions, and Long Questions</strong>, and organize everything for <strong>{selectedSubject}</strong> in seconds!
                    </p>
                </div>

                {/* PDF Dropzone Area */}
                <div
                    onClick={() => pdfFileInputRef.current?.click()}
                    style={{
                        border: '2px dashed #818cf8', borderRadius: '12px', padding: '2rem 1.5rem',
                        background: pdfFile ? '#eef2ff' : '#f8fafc', textAlign: 'center', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: '0.75rem', transition: 'all 0.2s ease', position: 'relative'
                    }}
                >
                    <input
                        ref={pdfFileInputRef}
                        type="file"
                        accept=".pdf,application/pdf,image/*"
                        onChange={handlePdfFileSelect}
                        style={{ display: 'none' }}
                    />

                    {pdfFile ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', background: 'white', padding: '0.75rem 1.25rem', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #c7d2fe' }}>
                            <FileText size={32} color="#4f46e5" />
                            <div style={{ textAlign: 'left' }}>
                                <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.95rem' }}>{pdfFile.name}</div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                    {(pdfFile.size / (1024 * 1024)).toFixed(2)} MB • {pdfFile.type || 'Document/PDF'}
                                </div>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); setPdfFile(null); setExtractedPdfChapters([]); }}
                                style={{ marginLeft: '1rem', border: 'none', background: '#fee2e2', color: '#ef4444', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <>
                            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <UploadCloud size={28} color="#4f46e5" />
                            </div>
                            <div>
                                <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '1.05rem', marginBottom: '0.2rem' }}>
                                    Click to Upload or Drag & Drop Book / CamScanner PDF
                                </div>
                                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                    Supports Multi-Page PDF files and batch scanned photos (Class {classes.find(c => c.id === selectedClassId)?.name || selectedClassId} - {selectedSubject})
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Action Scan Trigger */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleScanCompletePdf}
                        disabled={isScanningPdf || !pdfFile}
                        style={{
                            padding: '0.75rem 1.75rem', borderRadius: '10px', border: 'none',
                            background: isScanningPdf || !pdfFile ? '#cbd5e1' : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                            color: 'white', fontWeight: '800', fontSize: '0.95rem',
                            cursor: isScanningPdf || !pdfFile ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.6rem',
                            boxShadow: isScanningPdf || !pdfFile ? 'none' : '0 4px 14px rgba(79, 70, 229, 0.35)',
                            transition: 'all 0.2s'
                        }}
                    >
                        {isScanningPdf ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                        {isScanningPdf ? 'AI Vision Reading Pages & Extracting Questions...' : '⚡ Scan Entire PDF & Extract Chapters + Exercise Questions'}
                    </button>
                </div>

                {/* Scan Progress / Status Message */}
                {pdfScanMessage.text && (
                    <div style={{
                        marginTop: '1rem', padding: '0.85rem 1.15rem', borderRadius: '8px', fontSize: '0.9rem',
                        background: pdfScanMessage.type === 'success' ? '#f0fdf4' : pdfScanMessage.type === 'info' ? '#eff6ff' : '#fef2f2',
                        color: pdfScanMessage.type === 'success' ? '#166534' : pdfScanMessage.type === 'info' ? '#1e40af' : '#991b1b',
                        borderLeft: `4px solid ${pdfScanMessage.type === 'success' ? '#22c55e' : pdfScanMessage.type === 'info' ? '#3b82f6' : '#ef4444'}`,
                        display: 'flex', alignItems: 'center', gap: '0.6rem'
                    }}>
                        {pdfScanMessage.type === 'info' && <Loader2 size={16} className="animate-spin" />}
                        {pdfScanMessage.type === 'success' && <CheckCircle2 size={18} color="#22c55e" />}
                        <span>{pdfScanMessage.text}</span>
                    </div>
                )}

                {/* EXTRACTED CHAPTERS & QUESTIONS PREVIEW (ACCORDION & REVIEW) */}
                {extractedPdfChapters.length > 0 && (
                    <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '2px dashed #cbd5e1' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#1e293b' }}>
                                    Extracted Syllabus & Question Bank Preview ({extractedPdfChapters.length} Chapters)
                                </h4>
                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem', borderRadius: '6px', background: '#e0e7ff', color: '#4338ca', fontWeight: '700' }}>
                                        {extractedPdfChapters.reduce((a, c) => a + c.questions.filter(q => q.type === 'mcq').length, 0)} MCQs
                                    </span>
                                    <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem', borderRadius: '6px', background: '#dcfce7', color: '#15803d', fontWeight: '700' }}>
                                        {extractedPdfChapters.reduce((a, c) => a + c.questions.filter(q => q.type === 'short').length, 0)} Short Questions
                                    </span>
                                    <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem', borderRadius: '6px', background: '#fef3c7', color: '#b45309', fontWeight: '700' }}>
                                        {extractedPdfChapters.reduce((a, c) => a + c.questions.filter(q => q.type === 'long').length, 0)} Long Questions
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={handleSaveAllPdfChaptersToFirestore}
                                disabled={isSavingAllPdfChapters}
                                style={{
                                    padding: '0.8rem 1.75rem', borderRadius: '10px', border: 'none',
                                    background: 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)', color: 'white',
                                    fontWeight: '800', fontSize: '1rem', cursor: isSavingAllPdfChapters ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                                    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.35)'
                                }}
                            >
                                {isSavingAllPdfChapters ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                💾 Save All to Syllabus Database
                            </button>
                        </div>

                        {/* Extracted Chapters Accordion */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {extractedPdfChapters.map((ch, chIdx) => {
                                const isOpen = expandedPdfChapterIdx === chIdx;
                                const isUrduTitle = checkIsUrdu(ch.title, selectedSubject);

                                return (
                                    <div key={chIdx} style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #cbd5e1', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                                        {/* Chapter Header */}
                                        <div
                                            onClick={() => setExpandedPdfChapterIdx(isOpen ? null : chIdx)}
                                            style={{
                                                padding: '1rem 1.25rem', background: '#f8fafc',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                cursor: 'pointer', borderBottom: isOpen ? '1px solid #e2e8f0' : 'none'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                                                <span style={{
                                                    width: '28px', height: '28px', borderRadius: '50%',
                                                    background: '#4f46e5', color: 'white', fontWeight: '800',
                                                    fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                    {ch.chapterNumber || (chIdx + 1)}
                                                </span>
                                                <span
                                                    dir={isUrduTitle ? "rtl" : "ltr"}
                                                    style={{ 
                                                        fontWeight: '700', 
                                                        fontSize: isUrduTitle ? '1.15rem' : '1.05rem', 
                                                        lineHeight: isUrduTitle ? '2.1' : '1.4',
                                                        fontFamily: isUrduTitle ? "'Noto Nastaliq Urdu', 'Gulzar', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', serif" : 'inherit',
                                                        color: '#1e293b' 
                                                    }}
                                                >
                                                    {ch.title}
                                                </span>
                                                <span style={{ background: '#e0e7ff', color: '#4338ca', fontSize: '0.75rem', fontWeight: '700', padding: '2px 8px', borderRadius: '12px' }}>
                                                    {ch.questions?.length || 0} Questions
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {isOpen ? <ChevronUp size={18} color="#64748b" /> : <ChevronDown size={18} color="#64748b" />}
                                            </div>
                                        </div>

                                        {/* Questions Inside Chapter */}
                                        {isOpen && (
                                            <div style={{ padding: '1rem 1.25rem', background: 'white', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                {ch.questions?.length === 0 ? (
                                                    <div style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>No questions detected for this chapter.</div>
                                                ) : (
                                                    ch.questions.map((q, qIdx) => {
                                                        const isQUrdu = /[\u0600-\u06FF]/.test(q.question || '');

                                                        return (
                                                            <div key={q.id || qIdx} style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                                                    <span style={{
                                                                        fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase',
                                                                        color: q.type === 'mcq' ? '#4f46e5' : q.type === 'long' ? '#d97706' : '#059669'
                                                                    }}>
                                                                        Q{qIdx + 1}. [{q.type}] ({q.marks} Marks)
                                                                    </span>
                                                                    <button
                                                                        onClick={() => {
                                                                            setExtractedPdfChapters(prev => prev.map((c, i) => i === chIdx ? { ...c, questions: c.questions.filter((_, qi) => qi !== qIdx) } : c));
                                                                        }}
                                                                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                                                                        title="Delete question"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>

                                                                <div className={isQUrdu ? 'urdu-book-font' : ''} style={{ fontSize: isQUrdu ? '1.1rem' : '0.95rem', fontWeight: '600', color: '#1e293b' }}>
                                                                    {q.question}
                                                                </div>

                                                                {/* MCQ Options Display */}
                                                                {q.type === 'mcq' && Array.isArray(q.options) && q.options.length > 0 && (
                                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
                                                                        {q.options.map((opt, optIdx) => {
                                                                            const isCorrect = opt === q.correctAnswer;
                                                                            return (
                                                                                <div
                                                                                    key={optIdx}
                                                                                    style={{
                                                                                        padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '0.85rem',
                                                                                        background: isCorrect ? '#dcfce7' : 'white',
                                                                                        border: `1px solid ${isCorrect ? '#86efac' : '#cbd5e1'}`,
                                                                                        color: isCorrect ? '#15803d' : '#334155',
                                                                                        fontWeight: isCorrect ? '700' : '500'
                                                                                    }}
                                                                                >
                                                                                    {String.fromCharCode(65 + optIdx)}) {opt} {isCorrect && '✓'}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Bottom Save Button */}
                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={handleSaveAllPdfChaptersToFirestore}
                                disabled={isSavingAllPdfChapters}
                                style={{
                                    padding: '0.85rem 2rem', borderRadius: '10px', border: 'none',
                                    background: 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)', color: 'white',
                                    fontWeight: '800', fontSize: '1.05rem', cursor: isSavingAllPdfChapters ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                                    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.35)'
                                }}
                            >
                                {isSavingAllPdfChapters ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                                💾 Save All Chapters & Questions to Database
                            </button>
                        </div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Layers size={20} color="#2563eb" /> 
                        Current Syllabus for {selectedSubject} ({chapters.length} Chapters)
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {chapters.length > 0 && (
                            <button
                                onClick={() => setShowClearAllModal(true)}
                                style={{
                                    padding: '0.4rem 0.8rem', borderRadius: '6px',
                                    border: '1px solid #fecaca', background: '#fef2f2',
                                    color: '#dc2626', fontSize: '0.8rem', fontWeight: '700',
                                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <Trash2 size={13} /> Delete All {selectedSubject} Chapters
                            </button>
                        )}
                        <button
                            onClick={fetchChapters}
                            style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.8rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}
                        >
                            <RefreshCw size={14} /> Refresh
                        </button>
                    </div>
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
                                            {(() => {
                                                const isUrduTitle = checkIsUrdu(ch.title, selectedSubject);
                                                return (
                                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                                        <span 
                                                            dir={isUrduTitle ? "rtl" : "ltr"}
                                                            style={{
                                                                color: '#ffffff',
                                                                fontWeight: '700',
                                                                fontSize: isUrduTitle ? '1.18rem' : '1.05rem',
                                                                lineHeight: isUrduTitle ? '2.1' : '1.4',
                                                                fontFamily: isUrduTitle ? "'Noto Nastaliq Urdu', 'Gulzar', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', serif" : 'inherit',
                                                                textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                                                                direction: isUrduTitle ? 'rtl' : 'ltr'
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
                                                );
                                            })()}
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
                                                        const isQuestionUrdu = checkIsUrdu(q.question, selectedSubject);

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
                                                                        dir={isQuestionUrdu ? "rtl" : "ltr"}
                                                                        style={{ 
                                                                            fontSize: isQuestionUrdu ? '1.12rem' : '0.95rem', 
                                                                            color: '#1e293b',
                                                                            fontWeight: '600',
                                                                            lineHeight: isQuestionUrdu ? '2.2' : '1.5',
                                                                            fontFamily: isQuestionUrdu ? "'Noto Nastaliq Urdu', 'Gulzar', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', serif" : 'inherit',
                                                                            direction: isQuestionUrdu ? 'rtl' : 'ltr'
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

            {/* Delete All Chapters Confirmation Modal */}
            {showClearAllModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
                }}>
                    <div style={{ background: 'white', borderRadius: '12px', padding: '1.75rem', width: '100%', maxWidth: '420px' }}>
                        <h3 style={{ margin: '0 0 0.5rem 0', color: '#ef4444', fontSize: '1.15rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Trash2 size={18} /> Delete All {selectedSubject} Chapters?
                        </h3>
                        <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1.25rem' }}>
                            Are you sure you want to delete all <strong>{chapters.length} chapters</strong> for <strong>{selectedSubject}</strong>? This will permanently remove all test/dummy chapters.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                onClick={() => setShowClearAllModal(false)}
                                disabled={isClearingAll}
                                style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleClearAllChapters}
                                disabled={isClearingAll}
                                style={{ padding: '0.5rem 1.2rem', borderRadius: '6px', border: 'none', background: '#ef4444', color: 'white', fontWeight: '700', cursor: isClearingAll ? 'not-allowed' : 'pointer' }}
                            >
                                {isClearingAll ? 'Deleting All...' : 'Yes, Delete All'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default UploadSyllabusTab;
