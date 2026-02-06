
import React, { useState, useEffect } from 'react';
import { Camera, Save, Loader2, Shield } from 'lucide-react';
import { db, storage } from '../firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const Settings = () => {
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [schoolData, setSchoolData] = useState({
        name: '',
        profileImage: ''
    });
    const [previewImage, setPreviewImage] = useState(null);
    const [imageFile, setImageFile] = useState(null);

    useEffect(() => {
        const fetchSettings = async () => {
            const session = localStorage.getItem('manual_session');
            if (session) {
                const { schoolId } = JSON.parse(session);
                try {
                    const docRef = doc(db, `schools/${schoolId}/settings`, 'profile');
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        setSchoolData(docSnap.data());
                    } else {
                        // Initialize if not exists
                        await setDoc(docRef, { name: 'My School', profileImage: '' });
                    }
                } catch (err) {
                    console.error("Error fetching settings:", err);
                } finally {
                    setInitialLoading(false);
                }
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
        setLoading(true);
        const session = localStorage.getItem('manual_session');
        if (!session) return;
        const { schoolId } = JSON.parse(session);

        try {
            let imageUrl = schoolData.profileImage;

            if (imageFile) {
                const storageRef = ref(storage, `schools/${schoolId}/settings/profile_${Date.now()}`);
                await uploadBytes(storageRef, imageFile);
                imageUrl = await getDownloadURL(storageRef);
            }

            await updateDoc(doc(db, `schools/${schoolId}/settings`, 'profile'), {
                name: schoolData.name,
                profileImage: imageUrl
            });

            setSchoolData(prev => ({ ...prev, profileImage: imageUrl }));
            setPreviewImage(null);
            setImageFile(null);
            alert('Settings saved successfully!');
        } catch (error) {
            console.error("Error saving settings:", error);
            alert('Failed to save settings.');
        } finally {
            setLoading(false);
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
            <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '2rem' }}>School Settings</h1>

            <div className="card" style={{ width: '100%' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Shield size={20} color="var(--primary)" />
                    General Profile
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* Profile Image Upload */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div style={{ position: 'relative' }}>
                            <div style={{
                                width: '100px', height: '100px', borderRadius: '50%',
                                background: '#f1f5f9', overflow: 'hidden',
                                border: '2px solid #e2e8f0',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                {previewImage || schoolData.profileImage ? (
                                    <img
                                        src={previewImage || schoolData.profileImage}
                                        alt="School Profile"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    <Shield size={40} color="#cbd5e1" />
                                )}
                            </div>
                            <label style={{
                                position: 'absolute', bottom: '0', right: '0',
                                background: 'var(--primary)', color: 'white',
                                width: '32px', height: '32px', borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }}>
                                <Camera size={16} />
                                <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                            </label>
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.25rem' }}>School Logo / Profile</h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                This image will appear on your News Feed posts and header.
                            </p>
                        </div>
                    </div>

                    {/* School Name Input */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                            School Name
                        </label>
                        <input
                            type="text"
                            value={schoolData.name}
                            onChange={(e) => setSchoolData({ ...schoolData, name: e.target.value })}
                            placeholder="Enter School Name"
                            style={{
                                width: '100%', padding: '0.75rem', borderRadius: '8px',
                                border: '1px solid #e2e8f0', outline: 'none',
                                fontSize: '1rem'
                            }}
                        />
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="btn-primary"
                        style={{
                            padding: '0.75rem 1.5rem', borderRadius: '8px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            fontSize: '1rem', marginTop: '1rem'
                        }}
                    >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                        Save Changes
                    </button>
                </div>
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
