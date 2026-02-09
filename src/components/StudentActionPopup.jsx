import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Camera, User, Phone, Briefcase,
    Loader2, CheckCircle2, AlertCircle, Trash2, Key
} from 'lucide-react';
import { db, storage, auth } from '../firebase';
import { doc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

const StudentActionPopup = ({ isOpen, onClose, student, schoolId, classId }) => {
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [previewImage, setPreviewImage] = useState(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [password, setPassword] = useState('');
    const [verifying, setVerifying] = useState(false);

    // Reset state when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setPreviewImage(null);
            setMessage({ type: '', text: '' });
            setError(null);
            setShowLeaveConfirm(false);
            setPassword('');
            setVerifying(false);
            setSuccess(false);
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
            const storagePath = `schools/${schoolId}/students/${student.id}/profile.jpg`;
            const imageRef = ref(storage, storagePath);
            await uploadString(imageRef, previewImage, 'data_url');
            const downloadURL = await getDownloadURL(imageRef);

            const classStudentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, student.id);
            const masterStudentRef = doc(db, `schools/${schoolId}/students`, student.id);

            const updateData = {
                profilePic: downloadURL,
                avatar: downloadURL
            };

            await updateDoc(classStudentRef, updateData);
            await updateDoc(masterStudentRef, updateData);

            setMessage({ type: 'success', text: 'Profile updated successfully!' });

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

    const handleLeave = async () => {
        if (!password) {
            setError("Password is required");
            return;
        }

        setVerifying(true);
        setError(null);

        try {
            let isVerified = false;

            if (auth.currentUser) {
                try {
                    const credential = EmailAuthProvider.credential(auth.currentUser.email, password);
                    await reauthenticateWithCredential(auth.currentUser, credential);
                    isVerified = true;
                } catch (err) {
                    console.error("Re-auth failed", err);
                }
            }

            if (!isVerified) {
                const manualSession = localStorage.getItem('manual_session');
                if (manualSession) {
                    const session = JSON.parse(manualSession);
                    const userRef = doc(db, `schools/${schoolId}/users`, session.uid);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists() && userSnap.data().manualPassword === password) {
                        isVerified = true;
                    }
                }
            }

            if (!isVerified) {
                setError("Incorrect password");
                setVerifying(false);
                return;
            }

            setLoading(true);

            const classStudentRef = doc(db, `schools/${schoolId}/classes/${classId}/students`, student.id);
            await deleteDoc(classStudentRef);

            const masterStudentRef = doc(db, `schools/${schoolId}/students`, student.id);
            await deleteDoc(masterStudentRef);

            setSuccess(true);
            setTimeout(() => {
                onClose();
            }, 2000);

        } catch (err) {
            console.error("Error during student leave:", err);
            setError("Failed to process student leave. Please try again.");
        } finally {
            setLoading(false);
            setVerifying(false);
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
                    <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', filter: 'blur(40px)' }} />

                    <div style={styles.header}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#1e293b' }}>Student Actions</h2>
                        <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', padding: '0.5rem', borderRadius: '12px', cursor: 'pointer', color: '#64748b' }}>
                            <X size={18} />
                        </button>
                    </div>

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

                    {(message.text || error || success) && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', borderRadius: '12px', marginBottom: '1rem',
                            fontSize: '0.85rem', fontWeight: '600',
                            backgroundColor: (message.type === 'success' || success) ? '#dcfce7' : '#fee2e2',
                            color: (message.type === 'success' || success) ? '#166534' : '#991b1b'
                        }}>
                            {(message.type === 'success' || success) ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                            {message.text || error || (success && "Student deleted successfully")}
                        </div>
                    )}

                    {previewImage && !message.text && !success && (
                        <button
                            style={styles.saveBtn}
                            onClick={handleUpload}
                            disabled={uploading}
                            className="hover:shadow-lg active:scale-95 transition-all"
                        >
                            {uploading ? <Loader2 size={18} className="animate-spin" /> : 'Save New Profile'}
                        </button>
                    )}

                    {!success && (
                        <div style={{ marginTop: '2rem', borderTop: '1px solid #fee2e2', paddingTop: '1.5rem' }}>
                            {!showLeaveConfirm ? (
                                <button
                                    onClick={() => setShowLeaveConfirm(true)}
                                    style={{
                                        width: '100%',
                                        padding: '0.875rem',
                                        borderRadius: '16px',
                                        border: '1px solid #fee2e2',
                                        background: 'transparent',
                                        color: '#ef4444',
                                        fontSize: '0.9rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.75rem',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = '#fef2f2';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                    }}
                                >
                                    <Trash2 size={18} />
                                    Student Leave
                                </button>
                            ) : (
                                <div style={{ animation: 'slideUp 0.3s ease-out' }}>
                                    <p style={{
                                        fontSize: '0.8rem',
                                        color: '#991b1b',
                                        marginBottom: '0.75rem',
                                        fontWeight: '600',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem'
                                    }}>
                                        <AlertCircle size={14} />
                                        Principal Password Required:
                                    </p>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <div style={{ position: 'relative', flex: 1 }}>
                                            <input
                                                type="password"
                                                placeholder="Password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.6rem 0.6rem 0.6rem 2.2rem',
                                                    borderRadius: '10px',
                                                    border: '1px solid #fda4af',
                                                    outline: 'none',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                            <Key size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                                        </div>
                                        <button
                                            onClick={handleLeave}
                                            disabled={verifying || loading}
                                            style={{
                                                padding: '0.6rem 1rem',
                                                borderRadius: '10px',
                                                border: 'none',
                                                background: '#ef4444',
                                                color: 'white',
                                                fontWeight: '700',
                                                cursor: (verifying || loading) ? 'not-allowed' : 'pointer',
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            {(verifying || loading) ? <Loader2 size={16} className="animate-spin" /> : 'Leave'}
                                        </button>
                                        <button
                                            onClick={() => setShowLeaveConfirm(false)}
                                            style={{
                                                padding: '0.6rem',
                                                borderRadius: '10px',
                                                border: '1px solid #e2e8f0',
                                                background: 'white',
                                                color: '#64748b',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default StudentActionPopup;
