

import React, { useState, useEffect } from 'react';
import { Camera, Save, Loader2, Shield, Copy, CheckCircle2, Clock } from 'lucide-react';
import { db, storage, auth } from '../firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import BulkUploadCard from '../components/BulkUploadCard';
import CachedImage from '../components/CachedImage';

const Settings = () => {
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [schoolId, setSchoolId] = useState(null);
    const [schoolData, setSchoolData] = useState({
        name: '',
        profileImage: '',
        teacherStartTime: '08:00',
        teacherEndTime: '14:00'
    });
    const [previewImage, setPreviewImage] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (schoolId) {
            navigator.clipboard.writeText(schoolId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    useEffect(() => {
        const fetchSettings = async () => {
            const session = localStorage.getItem('manual_session');
            if (session) {
                const { schoolId: id } = JSON.parse(session);
                setSchoolId(id);
                try {
                    const docRef = doc(db, `schools/${id}/settings`, 'profile');
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setSchoolData({
                            ...data,
                            teacherStartTime: data.teacherStartTime || '08:00',
                            teacherEndTime: data.teacherEndTime || '14:00'
                        });
                    } else {
                        // Initialize if not exists
                        await setDoc(docRef, { name: 'My School', profileImage: '', teacherStartTime: '08:00', teacherEndTime: '14:00' });
                    }
                } catch (err) {
                    console.error("Error fetching settings:", err);
                } finally {
                    setInitialLoading(false);
                }
            } else {
                setInitialLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewImage(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        console.log("Save button clicked");
        setLoading(true);

        // Failsafe: Force reset loading after 10 seconds
        const timeoutId = setTimeout(() => {
            console.warn("Save timeout - forcing loading state reset");
            setLoading(false);
        }, 10000);

        try {
            // Use state schoolId if available, fallback to localStorage
            let currentSchoolId = schoolId;
            if (!currentSchoolId) {
                const session = localStorage.getItem('manual_session');
                if (session) {
                    const parsed = JSON.parse(session);
                    currentSchoolId = parsed.schoolId;
                }
            }

            console.log("School ID:", currentSchoolId);
            console.log("Auth User:", auth.currentUser);

            if (!currentSchoolId) {
                console.error("No School ID found");
                alert("No School ID found. Please relogin.");
                clearTimeout(timeoutId);
                setLoading(false);
                return;
            }

            // Check if actually authenticated with Firebase
            if (!auth.currentUser) {
                console.error("Not authenticated with Firebase");
                alert("Security Session Expired. Please Logout and Login again to verify your identity.");
                clearTimeout(timeoutId);
                setLoading(false);
                return;
            }

            console.log("Starting save process...");
            let imageUrl = schoolData.profileImage;

            if (imageFile) {
                console.log("Uploading image...");
                const storageRef = ref(storage, `schools/${currentSchoolId}/profile_${Date.now()}`);
                await uploadBytes(storageRef, imageFile);
                imageUrl = await getDownloadURL(storageRef);
                console.log("Image uploaded successfully:", imageUrl);
            }

            console.log("Saving to Firestore...");
            const settingsData = {
                name: schoolData.name,
                profileImage: imageUrl,
                teacherStartTime: schoolData.teacherStartTime,
                teacherEndTime: schoolData.teacherEndTime
            };

            await setDoc(doc(db, `schools/${currentSchoolId}/settings`, 'profile'), settingsData, { merge: true });

            console.log("Save successful!");

            // Update local state with saved data
            setSchoolData(settingsData);
            setPreviewImage(null);
            setImageFile(null);

            clearTimeout(timeoutId);
            setLoading(false);
            alert('Settings saved successfully!');

        } catch (error) {
            console.error("Error saving settings:", error);
            console.error("Error details:", error.code, error.message);
            clearTimeout(timeoutId);
            setLoading(false);
            alert(`Failed to save settings: ${error.message}`);
        }
    };

    if (initialLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <Loader2 className="animate-spin" size={32} color="var(--primary)" />
            </div>
        );
    }

    // Using inline styles for strict component isolation
    return (
        <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: '800', margin: 0 }}>School Settings</h1>

                {/* School ID Badge */}
                {schoolId && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.5rem 1rem',
                        background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                        borderRadius: '12px',
                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
                        color: 'white',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
                                School ID
                            </span>
                            <span style={{ fontSize: '1rem', fontWeight: '700', fontFamily: 'monospace' }}>
                                {schoolId}
                            </span>
                        </div>
                        <button
                            onClick={handleCopy}
                            style={{
                                background: 'rgba(255, 255, 255, 0.15)',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s',
                                color: 'white'
                            }}
                            title="Copy School ID"
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                        >
                            {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                        </button>
                    </div>
                )}
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                gap: '1.5rem'
            }}>
                {/* 1. General Profile Card (Compacted) */}
                <div className="card" style={{ height: 'fit-content' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Shield size={20} color="var(--primary)" />
                        General Profile
                    </h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                        {/* Profile Image & Name - Side by Side now */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ position: 'relative' }}>
                                <div style={{
                                    width: '80px', height: '80px', borderRadius: '50%',
                                    background: '#f1f5f9', overflow: 'hidden',
                                    border: '2px solid #e2e8f0',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {previewImage || schoolData.profileImage ? (
                                        <CachedImage
                                            src={previewImage || schoolData.profileImage}
                                            alt="School Profile"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    ) : (
                                        <Shield size={30} color="#cbd5e1" />
                                    )}
                                </div>
                                <label style={{
                                    position: 'absolute', bottom: '-5px', right: '-5px',
                                    background: 'var(--primary)', color: 'white',
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                }}>
                                    <Camera size={14} />
                                    <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                                </label>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                                    School Name
                                </label>
                                <input
                                    type="text"
                                    value={schoolData.name}
                                    onChange={(e) => setSchoolData({ ...schoolData, name: e.target.value })}
                                    placeholder="Enter School Name"
                                    style={{
                                        width: '100%', padding: '0.5rem', borderRadius: '6px',
                                        border: '1px solid #e2e8f0', outline: 'none',
                                        fontSize: '0.95rem'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className="btn-primary"
                            style={{
                                padding: '0.6rem', borderRadius: '8px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                fontSize: '0.9rem', width: '100%'
                            }}
                        >
                            {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                            Save Changes
                        </button>
                    </div>
                </div>

                {/* Teachers duty time Card */}
                <div className="card" style={{ height: 'fit-content' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Clock size={20} color="var(--primary)" />
                        Teachers duty time
                    </h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                                    Start Time
                                </label>
                                <input
                                    type="time"
                                    value={schoolData.teacherStartTime}
                                    onChange={(e) => setSchoolData({ ...schoolData, teacherStartTime: e.target.value })}
                                    style={{
                                        width: '100%', padding: '0.5rem', borderRadius: '6px',
                                        border: '1px solid #e2e8f0', outline: 'none',
                                        fontSize: '0.95rem', fontFamily: 'monospace'
                                    }}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                                    End Time
                                </label>
                                <input
                                    type="time"
                                    value={schoolData.teacherEndTime}
                                    onChange={(e) => setSchoolData({ ...schoolData, teacherEndTime: e.target.value })}
                                    style={{
                                        width: '100%', padding: '0.5rem', borderRadius: '6px',
                                        border: '1px solid #e2e8f0', outline: 'none',
                                        fontSize: '0.95rem', fontFamily: 'monospace'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className="btn-primary"
                            style={{
                                padding: '0.6rem', borderRadius: '8px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                fontSize: '0.9rem', width: '100%'
                            }}
                        >
                            {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                            Save Timings
                        </button>
                    </div>
                </div>

                {/* 2. Bulk Upload Card */}
                {schoolId && <BulkUploadCard schoolId={schoolId} />}
            </div>
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default Settings;
