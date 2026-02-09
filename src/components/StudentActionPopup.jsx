import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Camera, User, Phone, Briefcase,
    Loader2, CheckCircle2, AlertCircle
} from 'lucide-react';
import { db, storage } from '../firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';

const StudentActionPopup = ({ isOpen, onClose, student, schoolId, classId }) => {
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [previewImage, setPreviewImage] = useState(null);

    // Reset state when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setPreviewImage(null);
            setMessage({ type: '', text: '' });
        }
    }, [isOpen]);

    if (!isOpen || !student) return null;

    const parentInfo = student.parentDetails || {};

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewImage(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleUpload = async () => {
        if (!previewImage) return;

        setUploading(true);
        setMessage({ type: '', text: '' });

        try {
            // 1. Upload to Storage
            const storagePath = `schools/${schoolId}/students/${student.id}/profile.jpg`;
            const imageRef = ref(storage, storagePath);
            await uploadString(imageRef, previewImage, 'data_url');
            const downloadURL = await getDownloadURL(imageRef);

            // 2. Update Firestore (Dual Write Strategy)
            const classStudentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, student.id);
            const masterStudentRef = doc(db, `schools/${schoolId}/students`, student.id);

            const updateData = {
                profilePic: downloadURL,
                avatar: downloadURL // Maintain consistency with current logic
            };

            await updateDoc(classStudentRef, updateData);
            await updateDoc(masterStudentRef, updateData);

            setMessage({ type: 'success', text: 'Profile updated successfully!' });

            // Auto close after success
            setTimeout(() => {
                onClose();
            }, 1500);

        } catch (error) {
            console.error("Upload error:", error);
            setMessage({ type: 'error', text: 'Failed to update profile image.' });
        } finally {
            setUploading(false);
        }
    };

    const styles = {
        overlay: {
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'transparent',
        },
        modal: {
            background: 'rgba(255, 255, 255, 0.95)',
            width: '90%', maxWidth: '380px',
            borderRadius: '28px',
            padding: '2rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            position: 'relative',
            overflow: 'hidden'
        },
        header: {
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem'
        },
        avatarWrapper: {
            position: 'relative', margin: '0 auto 1.5rem', width: '120px', height: '120px'
        },
        avatar: {
            width: '120px', height: '120px', borderRadius: '40px', objectFit: 'cover',
            border: '4px solid white', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
        },
        cameraBtn: {
            position: 'absolute', bottom: '-5px', right: '-5px',
            width: '40px', height: '40px', borderRadius: '15px',
            background: 'var(--primary)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', border: '3px solid white',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            transition: 'transform 0.2s'
        },
        infoSection: {
            background: '#f8fafc', borderRadius: '20px', padding: '1.25rem', marginBottom: '1.5rem',
            display: 'flex', flexDirection: 'column', gap: '1rem'
        },
        infoItem: {
            display: 'flex', alignItems: 'center', gap: '1rem'
        },
        iconBox: {
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--primary)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
        },
        label: { fontSize: '0.75rem', color: '#64748b', fontWeight: '600', marginBottom: '0.1rem' },
        value: { fontSize: '0.9rem', color: '#1e293b', fontWeight: '700' },
        saveBtn: {
            width: '100%', padding: '0.875rem', borderRadius: '16px', border: 'none',
            background: 'var(--primary)', color: 'white', fontWeight: '700',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)',
            transition: 'all 0.2s'
        }
    };

    return (
        <AnimatePresence>
            <div style={styles.overlay} onClick={onClose}>
                <motion.div
                    style={styles.modal}
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Background Blur Decor */}
                    <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', filter: 'blur(40px)' }} />

                    <div style={styles.header}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#1e293b' }}>Student Actions</h2>
                        <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', padding: '0.5rem', borderRadius: '12px', cursor: 'pointer', color: '#64748b' }}>
                            <X size={18} />
                        </button>
                    </div>

                    {/* Image Upload Section */}
                    <div style={styles.avatarWrapper}>
                        <img
                            src={previewImage || student.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${student.id}`}
                            alt="Student"
                            style={styles.avatar}
                        />
                        <label style={styles.cameraBtn} className="hover:scale-110 active:scale-95 transition-transform">
                            <Camera size={20} />
                            <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                        </label>
                    </div>

                    <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem', fontWeight: '500' }}>
                        Click the camera icon to update profile photo
                    </p>

                    {/* Parent Info Section */}
                    <div style={styles.infoSection}>
                        <div style={styles.infoItem}>
                            <div style={styles.iconBox}><User size={18} /></div>
                            <div>
                                <p style={styles.label}>Parent Name</p>
                                <p style={styles.value}>{parentInfo.fatherName || '--'}</p>
                            </div>
                        </div>
                        <div style={styles.infoItem}>
                            <div style={styles.iconBox}><Phone size={18} /></div>
                            <div>
                                <p style={styles.label}>Phone Number</p>
                                <p style={styles.value}>{parentInfo.phone || '--'}</p>
                            </div>
                        </div>
                        <div style={styles.infoItem}>
                            <div style={styles.iconBox}><Briefcase size={18} /></div>
                            <div>
                                <p style={styles.label}>Occupation</p>
                                <p style={styles.value}>{parentInfo.occupation || '--'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Message Display */}
                    {message.text && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', borderRadius: '12px', marginBottom: '1rem',
                            fontSize: '0.85rem', fontWeight: '600',
                            backgroundColor: message.type === 'success' ? '#dcfce7' : '#fee2e2',
                            color: message.type === 'success' ? '#166534' : '#991b1b'
                        }}>
                            {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                            {message.text}
                        </div>
                    )}

                    {/* Action Button */}
                    {previewImage && !message.text && (
                        <button
                            style={styles.saveBtn}
                            onClick={handleUpload}
                            disabled={uploading}
                            className="hover:shadow-lg active:scale-95 transition-all"
                        >
                            {uploading ? <Loader2 size={18} className="animate-spin" /> : 'Save New Profile'}
                        </button>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default StudentActionPopup;
