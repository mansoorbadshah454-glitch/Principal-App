import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
    Upload, Image as ImageIcon, CheckCircle2, AlertCircle, 
    Save, RefreshCw, Trash2, Search, Filter, Loader2, Sparkles, UserCheck, UserX
} from 'lucide-react';
import { db, storage } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressImage } from '../utils/imageCompressor';
import CachedImage from './CachedImage';
import { getStudentAvatar } from '../utils/defaultAvatar';

const ClassPhotoStudio = ({ schoolId, classId, students = [] }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'missing', 'uploaded'
    
    // Map of studentId -> { file, previewUrl, originalSize, compressedSize, isSaving, saveError, isSaved }
    const [stagedPhotos, setStagedPhotos] = useState({});
    const [isBatchSaving, setIsBatchSaving] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, percentage: 0 });
    const [globalMessage, setGlobalMessage] = useState(null); // { type: 'success' | 'error', text: '' }
    const [dragOverStudentId, setDragOverStudentId] = useState(null);

    // Hidden input refs per student or generic
    const fileInputRefs = useRef({});

    // Cleanup object URLs on unmount to prevent memory leaks
    useEffect(() => {
        return () => {
            Object.values(stagedPhotos).forEach(item => {
                if (item?.previewUrl && item.previewUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(item.previewUrl);
                }
            });
        };
    }, [stagedPhotos]);

    // Format bytes for display
    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    // Check if student has an existing real uploaded photo (not dicebear avatar default)
    const hasRealPhoto = (student) => {
        const photo = student.profilePic || student.avatar || student.profileImageUrl || student.photoUrl || student.image || '';
        return Boolean(photo && typeof photo === 'string' && !photo.includes('api.dicebear.com'));
    };

    // Filter & search students
    const filteredStudents = useMemo(() => {
        return students.filter(student => {
            const hasPhoto = hasRealPhoto(student);
            const isStaged = Boolean(stagedPhotos[student.id]);

            // Status filter
            if (statusFilter === 'missing' && (hasPhoto || isStaged)) return false;
            if (statusFilter === 'uploaded' && !hasPhoto && !isStaged) return false;

            // Search filter
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const name = (student.name || `${student.firstName || ''} ${student.lastName || ''}`).toLowerCase();
                const rollNo = (student.rollNo || '').toString().toLowerCase();
                const fatherName = (student.fatherName || '').toLowerCase();
                return name.includes(term) || rollNo.includes(term) || fatherName.includes(term);
            }

            return true;
        });
    }, [students, statusFilter, searchTerm, stagedPhotos]);

    // Counters for quick stats
    const stats = useMemo(() => {
        let total = students.length;
        let withPhoto = 0;
        let missing = 0;

        students.forEach(s => {
            if (hasRealPhoto(s) || stagedPhotos[s.id]?.isSaved) {
                withPhoto++;
            } else {
                missing++;
            }
        });

        const pendingCount = Object.keys(stagedPhotos).filter(id => !stagedPhotos[id]?.isSaved).length;

        return { total, withPhoto, missing, pendingCount };
    }, [students, stagedPhotos]);

    // Process and compress image file for a student
    const handleFileProcess = async (studentId, rawFile) => {
        if (!rawFile || !rawFile.type.startsWith('image/')) {
            setGlobalMessage({ type: 'error', text: 'Please select a valid image file (JPG, PNG, WebP).' });
            return;
        }

        try {
            const originalSize = rawFile.size;
            // High compression: max 400x400, WebP, quality 0.8 -> typically ~25KB - 40KB
            const compressedBlob = await compressImage(rawFile, {
                maxDimension: 400,
                quality: 0.8,
                outputType: 'image/webp'
            });

            const previewUrl = URL.createObjectURL(compressedBlob);

            setStagedPhotos(prev => {
                // Revoke old URL if existed
                if (prev[studentId]?.previewUrl && prev[studentId].previewUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(prev[studentId].previewUrl);
                }
                return {
                    ...prev,
                    [studentId]: {
                        file: compressedBlob,
                        previewUrl: previewUrl,
                        originalSize: originalSize,
                        compressedSize: compressedBlob.size,
                        isSaving: false,
                        saveError: null,
                        isSaved: false
                    }
                };
            });

            setGlobalMessage(null);
        } catch (err) {
            console.error("Image compression error:", err);
            setGlobalMessage({ type: 'error', text: `Failed to compress image for student: ${err.message}` });
        }
    };

    // Drag and Drop handlers
    const handleDragOver = (e, studentId) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverStudentId(studentId);
    };

    const handleDragLeave = (e, studentId) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragOverStudentId === studentId) {
            setDragOverStudentId(null);
        }
    };

    const handleDrop = async (e, studentId) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverStudentId(null);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            await handleFileProcess(studentId, files[0]);
        }
    };

    // Remove staged photo for a single student
    const handleRemoveStaged = (studentId) => {
        setStagedPhotos(prev => {
            const copy = { ...prev };
            if (copy[studentId]?.previewUrl && copy[studentId].previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(copy[studentId].previewUrl);
            }
            delete copy[studentId];
            return copy;
        });
    };

    // Reset all staged photos
    const handleResetAllStaged = () => {
        Object.values(stagedPhotos).forEach(item => {
            if (item?.previewUrl && item.previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(item.previewUrl);
            }
        });
        setStagedPhotos({});
        setGlobalMessage({ type: 'success', text: 'All unsaved photos have been cleared.' });
    };

    // Single student save
    const handleSaveSingle = async (studentId) => {
        const staged = stagedPhotos[studentId];
        if (!staged || !staged.file || !schoolId || !classId) return;

        setStagedPhotos(prev => ({
            ...prev,
            [studentId]: { ...prev[studentId], isSaving: true, saveError: null }
        }));

        try {
            const timestamp = Date.now();
            const safeExt = staged.file.type === 'image/webp' ? '.webp' : '.jpg';
            const storagePath = `schools/${schoolId}/profile_images/students/${studentId}_${timestamp}${safeExt}`;
            const imageRef = ref(storage, storagePath);

            await uploadBytes(imageRef, staged.file);
            const downloadURL = await getDownloadURL(imageRef);

            // Cross-App Compatibility: Write all matching photo fields to both class student doc & master student doc
            const photoUpdatePayload = {
                profilePic: downloadURL,
                avatar: downloadURL,
                photoUrl: downloadURL,
                image: downloadURL,
                profileImageUrl: downloadURL,
                updatedAt: serverTimestamp()
            };

            const classStudentRef = doc(db, 'schools', schoolId, 'classes', classId, 'students', studentId);
            const masterStudentRef = doc(db, 'schools', schoolId, 'students', studentId);

            await Promise.all([
                updateDoc(classStudentRef, photoUpdatePayload),
                updateDoc(masterStudentRef, photoUpdatePayload)
            ]);

            setStagedPhotos(prev => ({
                ...prev,
                [studentId]: { ...prev[studentId], isSaving: false, isSaved: true }
            }));

            setGlobalMessage({ type: 'success', text: `Photo successfully updated for student!` });
        } catch (err) {
            console.error("Single photo upload error:", err);
            setStagedPhotos(prev => ({
                ...prev,
                [studentId]: { ...prev[studentId], isSaving: false, saveError: err.message }
            }));
            setGlobalMessage({ type: 'error', text: `Failed to save photo: ${err.message}` });
        }
    };

    // Batch save all pending photos
    const handleBatchSaveAll = async () => {
        const pendingStudentIds = Object.keys(stagedPhotos).filter(id => !stagedPhotos[id]?.isSaved && stagedPhotos[id]?.file);
        if (pendingStudentIds.length === 0 || !schoolId || !classId) return;

        setIsBatchSaving(true);
        setBatchProgress({ current: 0, total: pendingStudentIds.length, percentage: 0 });
        setGlobalMessage(null);

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < pendingStudentIds.length; i++) {
            const studentId = pendingStudentIds[i];
            const staged = stagedPhotos[studentId];

            setStagedPhotos(prev => ({
                ...prev,
                [studentId]: { ...prev[studentId], isSaving: true, saveError: null }
            }));

            try {
                const timestamp = Date.now();
                const safeExt = staged.file.type === 'image/webp' ? '.webp' : '.jpg';
                const storagePath = `schools/${schoolId}/profile_images/students/${studentId}_${timestamp}${safeExt}`;
                const imageRef = ref(storage, storagePath);

                await uploadBytes(imageRef, staged.file);
                const downloadURL = await getDownloadURL(imageRef);

                const photoUpdatePayload = {
                    profilePic: downloadURL,
                    avatar: downloadURL,
                    photoUrl: downloadURL,
                    image: downloadURL,
                    profileImageUrl: downloadURL,
                    updatedAt: serverTimestamp()
                };

                const classStudentRef = doc(db, 'schools', schoolId, 'classes', classId, 'students', studentId);
                const masterStudentRef = doc(db, 'schools', schoolId, 'students', studentId);

                await Promise.all([
                    updateDoc(classStudentRef, photoUpdatePayload),
                    updateDoc(masterStudentRef, photoUpdatePayload)
                ]);

                setStagedPhotos(prev => ({
                    ...prev,
                    [studentId]: { ...prev[studentId], isSaving: false, isSaved: true }
                }));

                successCount++;
            } catch (err) {
                console.error(`Batch save error for ${studentId}:`, err);
                failCount++;
                setStagedPhotos(prev => ({
                    ...prev,
                    [studentId]: { ...prev[studentId], isSaving: false, saveError: err.message }
                }));
            }

            const current = i + 1;
            setBatchProgress({
                current,
                total: pendingStudentIds.length,
                percentage: Math.round((current / pendingStudentIds.length) * 100)
            });
        }

        setIsBatchSaving(false);

        if (failCount === 0) {
            setGlobalMessage({ type: 'success', text: `🎉 Successfully uploaded and synchronized all ${successCount} student photos!` });
        } else {
            setGlobalMessage({ type: 'error', text: `Uploaded ${successCount} photos, but ${failCount} failed. Please retry failed students.` });
        }
    };

    return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Top Stat Ribbon & Action Controls */}
            <div style={{ 
                background: 'white', 
                borderRadius: '16px', 
                padding: '1.5rem', 
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.06)',
                border: '1px solid #f1f5f9',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Sparkles size={22} color="#6366f1" />
                            Class Photo Studio
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.2rem' }}>
                            Drag & drop or select photos directly for each student. Zero rename needed — auto-compressed in WebP for near-zero storage cost.
                        </p>
                    </div>

                    {/* Batch Action Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {stats.pendingCount > 0 && (
                            <button
                                onClick={handleResetAllStaged}
                                disabled={isBatchSaving}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    padding: '0.65rem 1rem',
                                    borderRadius: '10px',
                                    border: '1px solid #e2e8f0',
                                    background: '#f8fafc',
                                    color: '#64748b',
                                    fontSize: '0.875rem',
                                    fontWeight: '600',
                                    cursor: isBatchSaving ? 'not-allowed' : 'pointer'
                                }}
                            >
                                <Trash2 size={16} />
                                Clear Pending ({stats.pendingCount})
                            </button>
                        )}

                        <button
                            onClick={handleBatchSaveAll}
                            disabled={isBatchSaving || stats.pendingCount === 0}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.65rem 1.4rem',
                                borderRadius: '10px',
                                border: 'none',
                                background: stats.pendingCount > 0 ? '#6366f1' : '#cbd5e1',
                                color: 'white',
                                fontSize: '0.9rem',
                                fontWeight: '700',
                                cursor: (isBatchSaving || stats.pendingCount === 0) ? 'not-allowed' : 'pointer',
                                boxShadow: stats.pendingCount > 0 ? '0 4px 12px rgba(99, 102, 241, 0.35)' : 'none',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {isBatchSaving ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Saving... ({batchProgress.current}/{batchProgress.total})
                                </>
                            ) : (
                                <>
                                    <Save size={18} />
                                    Save All Pending ({stats.pendingCount})
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Batch Progress Bar */}
                {isBatchSaving && (
                    <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '600', color: '#6366f1', marginBottom: '0.35rem' }}>
                            <span>Uploading & Synchronizing across Apps...</span>
                            <span>{batchProgress.percentage}%</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: '#e0e7ff', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${batchProgress.percentage}%`, height: '100%', background: '#6366f1', transition: 'width 0.3s ease' }} />
                        </div>
                    </div>
                )}

                {/* Global Notification Banner */}
                {globalMessage && (
                    <div style={{
                        padding: '0.85rem 1rem',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        background: globalMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
                        color: globalMessage.type === 'success' ? '#166534' : '#991b1b',
                        border: `1px solid ${globalMessage.type === 'success' ? '#bbf7d0' : '#fecaca'}`
                    }}>
                        {globalMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                        <span>{globalMessage.text}</span>
                    </div>
                )}

                {/* Filters & Search Toolbar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                    
                    {/* Status Filter Tabs */}
                    <div style={{ display: 'flex', gap: '0.5rem', background: '#f8fafc', padding: '0.3rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        <button
                            onClick={() => setStatusFilter('all')}
                            style={{
                                padding: '0.45rem 0.9rem',
                                borderRadius: '7px',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.825rem',
                                fontWeight: '700',
                                background: statusFilter === 'all' ? '#6366f1' : 'transparent',
                                color: statusFilter === 'all' ? 'white' : '#64748b',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            All ({stats.total})
                        </button>
                        <button
                            onClick={() => setStatusFilter('missing')}
                            style={{
                                padding: '0.45rem 0.9rem',
                                borderRadius: '7px',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.825rem',
                                fontWeight: '700',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                background: statusFilter === 'missing' ? '#fee2e2' : 'transparent',
                                color: statusFilter === 'missing' ? '#991b1b' : '#64748b',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <UserX size={14} />
                            Missing Photos ({stats.missing})
                        </button>
                        <button
                            onClick={() => setStatusFilter('uploaded')}
                            style={{
                                padding: '0.45rem 0.9rem',
                                borderRadius: '7px',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.825rem',
                                fontWeight: '700',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                background: statusFilter === 'uploaded' ? '#dcfce7' : 'transparent',
                                color: statusFilter === 'uploaded' ? '#166534' : '#64748b',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <UserCheck size={14} />
                            Has Photo ({stats.withPhoto})
                        </button>
                    </div>

                    {/* Search Input */}
                    <div style={{ position: 'relative', minWidth: '260px', flex: '1', maxWidth: '380px' }}>
                        <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="Search by name, roll no, father..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.5rem 0.85rem 0.5rem 2.4rem',
                                borderRadius: '10px',
                                border: '1px solid #cbd5e1',
                                outline: 'none',
                                fontSize: '0.875rem',
                                background: '#f8fafc',
                                color: 'var(--text-main)'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Students Photo Grid */}
            {filteredStudents.length === 0 ? (
                <div style={{
                    background: 'white',
                    borderRadius: '16px',
                    padding: '3rem 2rem',
                    textAlign: 'center',
                    border: '1px dashed #cbd5e1',
                    color: '#64748b'
                }}>
                    <ImageIcon size={42} color="#94a3b8" style={{ margin: '0 auto 0.75rem auto' }} />
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)' }}>No students match your filter</h3>
                    <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>Try clearing the search or switching the filter tab.</p>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '1.25rem'
                }}>
                    {filteredStudents.map((student) => {
                        const staged = stagedPhotos[student.id];
                        const hasExisting = hasRealPhoto(student);
                        const isDragActive = dragOverStudentId === student.id;

                        // Display image source priority:
                        // 1. Staged preview URL
                        // 2. Existing avatar/photo or clean neutral default avatar
                        const displayImage = staged?.previewUrl || getStudentAvatar(student);

                        const isPendingSave = staged && !staged.isSaved;

                        return (
                            <div
                                key={student.id}
                                onDragOver={(e) => handleDragOver(e, student.id)}
                                onDragLeave={(e) => handleDragLeave(e, student.id)}
                                onDrop={(e) => handleDrop(e, student.id)}
                                style={{
                                    background: 'white',
                                    borderRadius: '16px',
                                    padding: '1.25rem',
                                    boxShadow: isDragActive ? '0 8px 20px rgba(99, 102, 241, 0.25)' : '0 4px 6px -1px rgba(0,0,0,0.05)',
                                    border: isDragActive 
                                        ? '2px dashed #6366f1' 
                                        : isPendingSave 
                                            ? '2px solid #6366f1' 
                                            : '1px solid #f1f5f9',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    textAlign: 'center',
                                    position: 'relative',
                                    transition: 'all 0.2s ease',
                                    transform: isDragActive ? 'scale(1.02)' : 'none'
                                }}
                            >
                                {/* Status Indicator Badge */}
                                <div style={{ position: 'absolute', top: '0.85rem', right: '0.85rem' }}>
                                    {isPendingSave ? (
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: '800',
                                            padding: '0.2rem 0.5rem',
                                            borderRadius: '20px',
                                            background: '#e0e7ff',
                                            color: '#4338ca',
                                            border: '1px solid #c7d2fe',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem'
                                        }}>
                                            🔵 Ready to Save
                                        </span>
                                    ) : (hasExisting || staged?.isSaved) ? (
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: '800',
                                            padding: '0.2rem 0.5rem',
                                            borderRadius: '20px',
                                            background: '#dcfce7',
                                            color: '#166534',
                                            border: '1px solid #bbf7d0',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem'
                                        }}>
                                            <CheckCircle2 size={11} /> Uploaded
                                        </span>
                                    ) : (
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: '800',
                                            padding: '0.2rem 0.5rem',
                                            borderRadius: '20px',
                                            background: '#fee2e2',
                                            color: '#991b1b',
                                            border: '1px solid #fecaca',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem'
                                        }}>
                                            <AlertCircle size={11} /> Missing
                                        </span>
                                    )}
                                </div>

                                {/* Student Roll No Tag */}
                                <div style={{ position: 'absolute', top: '0.85rem', left: '0.85rem' }}>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        fontWeight: '700',
                                        color: '#64748b',
                                        background: '#f1f5f9',
                                        padding: '0.2rem 0.55rem',
                                        borderRadius: '8px'
                                    }}>
                                        Roll #{student.rollNo || 'N/A'}
                                    </span>
                                </div>

                                {/* Avatar & Drag Target */}
                                <div 
                                    onClick={() => fileInputRefs.current[student.id]?.click()}
                                    style={{
                                        width: '96px',
                                        height: '96px',
                                        borderRadius: '50%',
                                        marginTop: '1.5rem',
                                        marginBottom: '0.85rem',
                                        background: '#f8fafc',
                                        overflow: 'hidden',
                                        border: isPendingSave ? '3px solid #6366f1' : '3px solid white',
                                        boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                                        position: 'relative',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <CachedImage
                                        src={displayImage}
                                        alt={student.name || 'Student'}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                    
                                    {/* Hover Overlay */}
                                    <div 
                                        className="photo-hover-overlay"
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            background: 'rgba(15, 23, 42, 0.45)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'white',
                                            opacity: isDragActive ? 1 : 0,
                                            transition: 'opacity 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                        onMouseLeave={(e) => {
                                            if (!isDragActive) e.currentTarget.style.opacity = '0';
                                        }}
                                    >
                                        <Upload size={20} />
                                        <span style={{ fontSize: '0.65rem', fontWeight: '700', marginTop: '0.2rem' }}>Drop / Click</span>
                                    </div>
                                </div>

                                {/* Hidden file input for this student */}
                                <input
                                    type="file"
                                    accept="image/*"
                                    ref={(el) => fileInputRefs.current[student.id] = el}
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                        if (e.target.files?.[0]) {
                                            handleFileProcess(student.id, e.target.files[0]);
                                            e.target.value = ''; // Reset input
                                        }
                                    }}
                                />

                                {/* Name & Metadata */}
                                <h4 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.2rem', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {student.name || `${student.firstName || ''} ${student.lastName || ''}`}
                                </h4>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                                    {student.fatherName ? `Father: ${student.fatherName}` : (student.gender || 'Student')}
                                </p>

                                {/* Compression details if staged */}
                                {staged && (
                                    <div style={{
                                        fontSize: '0.725rem',
                                        color: '#475569',
                                        background: '#f8fafc',
                                        padding: '0.35rem 0.6rem',
                                        borderRadius: '8px',
                                        width: '100%',
                                        marginBottom: '0.75rem',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        border: '1px solid #e2e8f0'
                                    }}>
                                        <span>Size: {formatBytes(staged.originalSize)}</span>
                                        <span style={{ color: '#16a34a', fontWeight: '700' }}>➔ {formatBytes(staged.compressedSize)} (WebP)</span>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div style={{ width: '100%', display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                                    {isPendingSave ? (
                                        <>
                                            <button
                                                onClick={() => handleRemoveStaged(student.id)}
                                                disabled={staged?.isSaving || isBatchSaving}
                                                style={{
                                                    flex: '1',
                                                    padding: '0.45rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #e2e8f0',
                                                    background: '#ffffff',
                                                    color: '#ef4444',
                                                    fontSize: '0.8rem',
                                                    fontWeight: '600',
                                                    cursor: (staged?.isSaving || isBatchSaving) ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={() => handleSaveSingle(student.id)}
                                                disabled={staged?.isSaving || isBatchSaving}
                                                style={{
                                                    flex: '2',
                                                    padding: '0.45rem',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    background: '#6366f1',
                                                    color: 'white',
                                                    fontSize: '0.8rem',
                                                    fontWeight: '700',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '0.35rem',
                                                    cursor: (staged?.isSaving || isBatchSaving) ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                {staged?.isSaving ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : (
                                                    <Save size={14} />
                                                )}
                                                Save Photo
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={() => fileInputRefs.current[student.id]?.click()}
                                            disabled={isBatchSaving}
                                            style={{
                                                width: '100%',
                                                padding: '0.5rem',
                                                borderRadius: '8px',
                                                border: '1px dashed #cbd5e1',
                                                background: '#f8fafc',
                                                color: '#475569',
                                                fontSize: '0.8rem',
                                                fontWeight: '600',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.35rem',
                                                cursor: isBatchSaving ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            <Upload size={14} />
                                            {hasExisting ? 'Change Photo' : 'Upload Photo'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ClassPhotoStudio;
