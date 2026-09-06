

import React, { useState, useEffect } from 'react';
import { Camera, Save, Loader2, Shield, Copy, CheckCircle2, Clock, Building, Briefcase, Plus, Trash2, Users, Info, BookOpen, Sparkles, Bot, Key, ExternalLink } from 'lucide-react';
import { db, storage, auth } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import BulkUploadCard from '../components/BulkUploadCard';
import UploadSyllabusTab from '../components/UploadSyllabusTab';
import CachedImage from '../components/CachedImage';

const Settings = () => {
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [schoolId, setSchoolId] = useState(null);
    const [activeTab, setActiveTab] = useState('details'); // details, timing, import
    
    const [schoolData, setSchoolData] = useState({
        name: '',
        profileImage: '',
        address: '',
        email: '',
        phone: '',
        landline: '',
        emergencyContact: '',
        aboutText: '',
        teacherStartTime: '08:00',
        teacherEndTime: '14:00',
        breakStartTime: '10:30',
        breakEndTime: '11:00',
        schoolStartTime: '08:00',
        schoolEndTime: '14:00'
    });
    
    const [bankAccounts, setBankAccounts] = useState([]);
    const [previewImage, setPreviewImage] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const [feeSettings, setFeeSettings] = useState({ dueDate: '', penaltyAmount: '' });
    const [aiSettings, setAiSettings] = useState({ apiKey: '', botName: 'Principal AI Copilot' });
    const [savingAi, setSavingAi] = useState(false);
    const [aiSavedSuccess, setAiSavedSuccess] = useState(false);
    const [copied, setCopied] = useState(false);
    const [errors, setErrors] = useState({});
    const [fetchError, setFetchError] = useState(false);

    const handleCopy = () => {
        if (schoolId) {
            navigator.clipboard.writeText(schoolId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    useEffect(() => {
        const session = localStorage.getItem('manual_session');
        if (!session) {
            setInitialLoading(false);
            return;
        }

        const { schoolId: id } = JSON.parse(session);
        setSchoolId(id);

        let isMounted = true;

        // Fetch profile settings from settings/profile using onSnapshot
        const profileRef = doc(db, `schools/${id}/settings`, 'profile');
        const unsubProfile = onSnapshot(profileRef, async (profileSnap) => {
            if (!isMounted) return;
            
            if (profileSnap.exists()) {
                const data = profileSnap.data();
                setSchoolData(prev => ({
                    ...prev,
                    ...data,
                    address: data.address || '',
                    email: data.email || '',
                    phone: data.phone || '',
                    landline: data.landline || '',
                    emergencyContact: data.emergencyContact || '',
                    aboutText: data.aboutText || '',
                    teacherStartTime: data.teacherStartTime || '08:00',
                    teacherEndTime: data.teacherEndTime || '14:00',
                    breakStartTime: data.breakStartTime || '10:30',
                    breakEndTime: data.breakEndTime || '11:00',
                    schoolStartTime: data.schoolStartTime || '08:00',
                    schoolEndTime: data.schoolEndTime || '14:00'
                }));
                setFetchError(false);
            } else {
                // NEVER write to the DB automatically here to avoid cache wipe race conditions on deployment.
                // Just map safe local defaults to the UI. The DB will safely update when they press "Save".
                const defaultData = { 
                    name: 'My School', 
                    profileImage: '', 
                    aboutText: '', 
                    teacherStartTime: '08:00', 
                    teacherEndTime: '14:00', 
                    breakStartTime: '10:30', 
                    breakEndTime: '11:00', 
                    schoolStartTime: '08:00', 
                    schoolEndTime: '14:00' 
                };
                setSchoolData(prev => ({ ...prev, ...defaultData }));
                setFetchError(false);
            }
            setInitialLoading(false);
        }, (err) => {
            console.error("Error fetching profile settings:", err);
            setFetchError(true);
            setInitialLoading(false);
        });

        // Fetch banking settings from settings/banking using onSnapshot
        const bankingRef = doc(db, `schools/${id}/settings`, 'banking');
        const unsubBanking = onSnapshot(bankingRef, (bankingSnap) => {
            if (!isMounted) return;
            
            if (bankingSnap.exists()) {
                setBankAccounts(bankingSnap.data().accounts || []);
            }
        }, (err) => {
            console.error("Error fetching banking settings:", err);
        });

        // Fetch fee settings using onSnapshot
        const feeSettingsRef = doc(db, `schools/${id}/settings`, 'feeSettings');
        const unsubFeeSettings = onSnapshot(feeSettingsRef, (feeSnap) => {
            if (!isMounted) return;
            
            if (feeSnap.exists()) {
                setFeeSettings({
                    dueDate: feeSnap.data().dueDate || '',
                    penaltyAmount: feeSnap.data().penaltyAmount || ''
                });
            }
        }, (err) => {
            console.error("Error fetching fee settings:", err);
        });


        // Fetch AI settings using onSnapshot
        const aiRef = doc(db, `schools/${id}/settings`, 'ai');
        const unsubAi = onSnapshot(aiRef, (aiSnap) => {
            if (!isMounted) return;
            if (aiSnap.exists()) {
                const data = aiSnap.data();
                setAiSettings({
                    apiKey: data.apiKey || '',
                    botName: data.botName || 'Principal AI Copilot'
                });
            }
        }, (err) => {
            console.warn("AI settings listener warning:", err);
        });

        return () => {
            isMounted = false;
            unsubProfile();
            unsubBanking();
            unsubFeeSettings();
            unsubAi();
        };
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

    const addBankAccount = () => {
        setBankAccounts([...bankAccounts, { bankName: '', accountTitle: '', accountNumber: '', iban: '' }]);
    };

    const removeBankAccount = (index) => {
        const newAccounts = [...bankAccounts];
        newAccounts.splice(index, 1);
        setBankAccounts(newAccounts);
    };

    const handleBankChange = (index, field, value) => {
        const newAccounts = [...bankAccounts];
        newAccounts[index][field] = value;
        setBankAccounts(newAccounts);
    };

    const validateInputs = () => {
        const newErrors = {};
        const phoneRegex = /^\+?[0-9\s\-()]{10,20}$/;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (schoolData.address && schoolData.address.trim().length < 5) {
            newErrors.address = "Address is too short. Minimum 5 characters.";
        }
        if (schoolData.email && !emailRegex.test(schoolData.email.trim())) {
            newErrors.email = "Invalid email format.";
        }
        if (schoolData.phone && !phoneRegex.test(schoolData.phone.trim())) {
            newErrors.phone = "Invalid phone format. Ensure at least 10 digits.";
        }
        if (schoolData.landline && !phoneRegex.test(schoolData.landline.trim())) {
            newErrors.landline = "Invalid landline format. Ensure at least 10 digits.";
        }
        if (schoolData.emergencyContact && !phoneRegex.test(schoolData.emergencyContact.trim())) {
            newErrors.emergencyContact = "Invalid emergency contact format. Ensure at least 10 digits.";
        }

        // Validate banks if partially filled
        bankAccounts.forEach((acc, idx) => {
            if (acc.bankName || acc.accountTitle || acc.accountNumber || acc.iban) {
                if (!acc.bankName || !acc.accountTitle || !acc.accountNumber) {
                    newErrors[`bank_${idx}`] = "Bank Name, Title, and Number are strictly required.";
                }
            }
        });

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = async () => {
        if (fetchError) {
            alert("Cannot save settings: Database read permission denied. Please refresh or re-login.");
            return;
        }

        // Run validations strictly before continuing
        if (!validateInputs()) {
            alert("Please fix the validation errors before saving.");
            return;
        }

        setLoading(true);

        const timeoutId = setTimeout(() => {
            console.warn("Save timeout - forcing loading state reset");
            setLoading(false);
        }, 15000);

        try {
            let currentSchoolId = schoolId || JSON.parse(localStorage.getItem('manual_session'))?.schoolId;

            if (!currentSchoolId || !auth.currentUser) {
                console.error("Not authenticated");
                alert("Security Session Expired. Please Logout and Login again to verify your identity.");
                clearTimeout(timeoutId);
                setLoading(false);
                return;
            }

            let imageUrl = schoolData.profileImage;

            if (imageFile) {
                const storageRef = ref(storage, `schools/${currentSchoolId}/profile_${Date.now()}`);
                await uploadBytes(storageRef, imageFile);
                imageUrl = await getDownloadURL(storageRef);
            }

            const settingsData = {
                name: schoolData.name,
                profileImage: imageUrl,
                address: schoolData.address,
                email: schoolData.email,
                phone: schoolData.phone,
                landline: schoolData.landline,
                emergencyContact: schoolData.emergencyContact,
                aboutText: schoolData.aboutText,
                teacherStartTime: schoolData.teacherStartTime,
                teacherEndTime: schoolData.teacherEndTime,
                breakStartTime: schoolData.breakStartTime,
                breakEndTime: schoolData.breakEndTime,
                schoolStartTime: schoolData.schoolStartTime,
                schoolEndTime: schoolData.schoolEndTime
            };

            // 1. Profile document
            await setDoc(doc(db, `schools/${currentSchoolId}/settings`, 'profile'), settingsData, { merge: true });
            
            // 2. Banking document 
            // Avoid polluting `profile` and keep banking details encapsulated for better security and future separation
            await setDoc(doc(db, `schools/${currentSchoolId}/settings`, 'banking'), { accounts: bankAccounts }, { merge: true });

            // 3. Fee settings document
            await setDoc(doc(db, `schools/${currentSchoolId}/settings`, 'feeSettings'), feeSettings, { merge: true });

            setSchoolData(settingsData);
            setPreviewImage(null);
            setImageFile(null);

            clearTimeout(timeoutId);
            setLoading(false);
            alert('Settings saved successfully!');

        } catch (error) {
            console.error("Error saving settings:", error);
            clearTimeout(timeoutId);
            setLoading(false);
            alert(`Failed to save settings: ${error.message}`);
        }
    };

    const handleSaveAiSettings = async () => {
        let currentSchoolId = schoolId || JSON.parse(localStorage.getItem('manual_session') || '{}')?.schoolId;
        if (!currentSchoolId) {
            alert('School ID not found.');
            return;
        }

        setSavingAi(true);
        setAiSavedSuccess(false);

        try {
            // Save to Firestore
            const aiRef = doc(db, `schools/${currentSchoolId}/settings`, 'ai');
            await setDoc(aiRef, {
                apiKey: aiSettings.apiKey.trim(),
                botName: aiSettings.botName.trim() || 'Principal AI Copilot',
                updatedAt: new Date().toISOString()
            }, { merge: true });

            // Also cache in localStorage for instant offline access
            localStorage.setItem(`gemini_api_key_${currentSchoolId}`, aiSettings.apiKey.trim());
            localStorage.setItem('gemini_api_key', aiSettings.apiKey.trim());

            setAiSavedSuccess(true);
            setTimeout(() => setAiSavedSuccess(false), 3000);
        } catch (err) {
            console.error('Error saving AI settings:', err);
            alert(`Could not save AI settings: ${err.message}`);
        } finally {
            setSavingAi(false);
        }
    };

    if (initialLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <Loader2 className="animate-spin" size={32} color="var(--primary)" />
            </div>
        );
    }

    const inputStyle = (error) => ({
        width: '100%', padding: '0.6rem', borderRadius: '6px',
        border: `1px solid ${error ? '#ef4444' : '#e2e8f0'}`, outline: 'none',
        fontSize: '0.95rem'
    });

    const errorMsgStyle = { color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' };
    const labelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.25rem', color: 'var(--text-secondary)' };

    const renderTabHeader = () => (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '2px solid #f1f5f9' }}>
            <button
                onClick={() => setActiveTab('details')}
                style={{
                    padding: '0.75rem 1rem', border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: '1rem', fontWeight: '600',
                    color: activeTab === 'details' ? 'var(--primary)' : 'var(--text-secondary)',
                    borderBottom: activeTab === 'details' ? '3px solid var(--primary)' : '3px solid transparent',
                    display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                }}
            >
                <Building size={18} /> School details
            </button>
            <button
                onClick={() => setActiveTab('timing')}
                style={{
                    padding: '0.75rem 1rem', border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: '1rem', fontWeight: '600',
                    color: activeTab === 'timing' ? 'var(--primary)' : 'var(--text-secondary)',
                    borderBottom: activeTab === 'timing' ? '3px solid var(--primary)' : '3px solid transparent',
                    display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                }}
            >
                <Clock size={18} /> School timing
            </button>
            <button
                onClick={() => setActiveTab('about')}
                style={{
                    padding: '0.75rem 1rem', border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: '1rem', fontWeight: '600',
                    color: activeTab === 'about' ? 'var(--primary)' : 'var(--text-secondary)',
                    borderBottom: activeTab === 'about' ? '3px solid var(--primary)' : '3px solid transparent',
                    display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                }}
            >
                <Info size={18} /> About
            </button>
            <button
                onClick={() => setActiveTab('import')}
                style={{
                    padding: '0.75rem 1rem', border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: '1rem', fontWeight: '600',
                    color: activeTab === 'import' ? 'var(--primary)' : 'var(--text-secondary)',
                    borderBottom: activeTab === 'import' ? '3px solid var(--primary)' : '3px solid transparent',
                    display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                }}
            >
                <Users size={18} /> Import Students
            </button>
            <button
                onClick={() => setActiveTab('upload_syllabus')}
                style={{
                    padding: '0.75rem 1rem', border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: '1rem', fontWeight: '600',
                    color: activeTab === 'upload_syllabus' ? 'var(--primary)' : 'var(--text-secondary)',
                    borderBottom: activeTab === 'upload_syllabus' ? '3px solid var(--primary)' : '3px solid transparent',
                    display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                }}
            >
                <BookOpen size={18} /> Upload Syllabus
            </button>
            <button
                onClick={() => setActiveTab('ai_assistant')}
                style={{
                    padding: '0.75rem 1rem', border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: '1rem', fontWeight: '600',
                    color: activeTab === 'ai_assistant' ? 'var(--primary)' : 'var(--text-secondary)',
                    borderBottom: activeTab === 'ai_assistant' ? '3px solid var(--primary)' : '3px solid transparent',
                    display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                }}
            >
                <Sparkles size={18} /> AI Copilot
            </button>
        </div>
    );

    return (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: '800', margin: 0 }}>School Settings</h1>

                {/* School ID Badge */}
                {schoolId && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem',
                        background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                        borderRadius: '12px', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
                        color: 'white', border: '1px solid rgba(255, 255, 255, 0.1)'
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
                                background: 'rgba(255, 255, 255, 0.15)', border: 'none', borderRadius: '8px',
                                padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', transition: 'all 0.2s', color: 'white'
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

            {renderTabHeader()}

            <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                {activeTab === 'details' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'fadeIn 0.3s ease-out' }}>
                        
                        {/* Profile Section */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ position: 'relative' }}>
                                <div style={{
                                    width: '100px', height: '100px', borderRadius: '50%',
                                    background: '#f1f5f9', overflow: 'hidden',
                                    border: '2px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {previewImage || schoolData.profileImage ? (
                                        <CachedImage src={previewImage || schoolData.profileImage} alt="School Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <Shield size={36} color="#cbd5e1" />
                                    )}
                                </div>
                                <label style={{
                                    position: 'absolute', bottom: '0', right: '0',
                                    background: 'var(--primary)', color: 'white', width: '32px', height: '32px', borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                }}>
                                    <Camera size={16} />
                                    <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                                </label>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={labelStyle}>School Name</label>
                                <input
                                    type="text" value={schoolData.name} onChange={(e) => setSchoolData({ ...schoolData, name: e.target.value })}
                                    placeholder="Enter School Name" style={inputStyle()}
                                />
                            </div>
                        </div>

                        {/* Contact Info Section */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>Address</label>
                                <textarea
                                    value={schoolData.address} onChange={(e) => { setSchoolData({ ...schoolData, address: e.target.value }); setErrors({...errors, address: null}); }}
                                    placeholder="Full School Address" rows={3} style={{ ...inputStyle(errors.address), resize: 'vertical' }}
                                />
                                {errors.address && <div style={errorMsgStyle}>{errors.address}</div>}
                            </div>
                            
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={labelStyle}>Email Address</label>
                                <input
                                    type="email" value={schoolData.email} onChange={(e) => { setSchoolData({ ...schoolData, email: e.target.value }); setErrors({...errors, email: null}); }}
                                    placeholder="info@school.com" style={inputStyle(errors.email)}
                                />
                                {errors.email && <div style={errorMsgStyle}>{errors.email}</div>}
                            </div>
                            
                            <div>
                                <label style={labelStyle}>Primary Phone Number</label>
                                <input
                                    type="text" value={schoolData.phone} onChange={(e) => { setSchoolData({ ...schoolData, phone: e.target.value }); setErrors({...errors, phone: null}); }}
                                    placeholder="+1 234 567 890" style={inputStyle(errors.phone)}
                                />
                                {errors.phone && <div style={errorMsgStyle}>{errors.phone}</div>}
                            </div>
                            <div>
                                <label style={labelStyle}>Landline Number</label>
                                <input
                                    type="text" value={schoolData.landline} onChange={(e) => { setSchoolData({ ...schoolData, landline: e.target.value }); setErrors({...errors, landline: null}); }}
                                    placeholder="(555) 123-4567" style={inputStyle(errors.landline)}
                                />
                                {errors.landline && <div style={errorMsgStyle}>{errors.landline}</div>}
                            </div>
                            <div>
                                <label style={labelStyle}>Emergency Contact</label>
                                <input
                                    type="text" value={schoolData.emergencyContact} onChange={(e) => { setSchoolData({ ...schoolData, emergencyContact: e.target.value }); setErrors({...errors, emergencyContact: null}); }}
                                    placeholder="Emergency Phone Number" style={inputStyle(errors.emergencyContact)}
                                />
                                {errors.emergencyContact && <div style={errorMsgStyle}>{errors.emergencyContact}</div>}
                            </div>
                        </div>

                        {/* Fee Configuration Section */}
                        <div style={{ marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9' }}>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '1rem', color: '#1e293b' }}>Fee Collection Settings</h3>
                            <div style={{
                                padding: '1rem', background: '#eff6ff', borderLeft: '4px solid #3b82f6',
                                borderRadius: '0 6px 6px 0', marginBottom: '1.5rem', color: '#1e3a8a', fontSize: '0.9rem'
                            }}>
                                <strong>Note:</strong> Set the automated monthly fee deadline and penalty charges. These sync directly to the Parent's App Calendar.
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                                <div>
                                    <label style={labelStyle}>Due Date (e.g. 10th)</label>
                                    <input
                                        type="text" value={feeSettings.dueDate} onChange={(e) => setFeeSettings({...feeSettings, dueDate: e.target.value})}
                                        placeholder="e.g. 10th" style={inputStyle()}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Late Penalty Amount (Rs)</label>
                                    <input
                                        type="number" value={feeSettings.penaltyAmount} onChange={(e) => setFeeSettings({...feeSettings, penaltyAmount: e.target.value})}
                                        placeholder="e.g. 500" style={inputStyle()}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Banking Section */}
                        <div style={{ marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1e293b', margin: 0 }}>
                                    <Briefcase size={20} color="var(--primary)" /> Bank Account Details
                                </h3>
                                <button
                                    onClick={addBankAccount}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem',
                                        background: '#f8fafc', color: 'var(--primary)', border: '1px solid #e2e8f0', borderRadius: '6px',
                                        fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
                                >
                                    <Plus size={16} /> Add another bank account
                                </button>
                            </div>
                            
                            {/* Blue Info Badge */}
                            <div style={{
                                padding: '1rem', background: '#eff6ff', borderLeft: '4px solid #3b82f6',
                                borderRadius: '0 6px 6px 0', marginBottom: '1.5rem', color: '#1e3a8a', fontSize: '0.9rem',
                                display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}>
                                <strong>Note:</strong> This banking information will be securely displayed in the Parent's App to facilitate fee remittances.
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {bankAccounts.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '2rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#94a3b8' }}>
                                        No bank accounts added yet. Click "Add another bank account" to setup fee collections.
                                    </div>
                                )}
                                {bankAccounts.map((acc, index) => (
                                    <div key={index} style={{
                                        position: 'relative', padding: '1.5rem', background: '#f8fafc',
                                        borderRadius: '8px', border: errors[`bank_${index}`] ? '1px solid #ef4444' : '1px solid #e2e8f0',
                                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem'
                                    }}>
                                        <button
                                            onClick={() => removeBankAccount(index)}
                                            style={{
                                                position: 'absolute', top: '1rem', right: '1rem', background: 'transparent',
                                                border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px'
                                            }}
                                            title="Remove Account"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                        
                                        <div>
                                            <label style={labelStyle}>Bank Name</label>
                                            <input
                                                type="text" value={acc.bankName} onChange={(e) => {handleBankChange(index, 'bankName', e.target.value); setErrors({...errors, [`bank_${index}`]: null});}}
                                                placeholder="e.g. Chase Bank" style={inputStyle()}
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Account Title</label>
                                            <input
                                                type="text" value={acc.accountTitle} onChange={(e) => {handleBankChange(index, 'accountTitle', e.target.value); setErrors({...errors, [`bank_${index}`]: null});}}
                                                placeholder="e.g. School Treasury" style={inputStyle()}
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Account Number</label>
                                            <input
                                                type="text" value={acc.accountNumber} onChange={(e) => {handleBankChange(index, 'accountNumber', e.target.value); setErrors({...errors, [`bank_${index}`]: null});}}
                                                placeholder="Account #" style={inputStyle()}
                                            />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>IBAN / Routing (Optional)</label>
                                            <input
                                                type="text" value={acc.iban} onChange={(e) => handleBankChange(index, 'iban', e.target.value)}
                                                placeholder="IBAN / Routing #" style={inputStyle()}
                                            />
                                        </div>
                                        {errors[`bank_${index}`] && <div style={{...errorMsgStyle, gridColumn: '1 / -1'}}>{errors[`bank_${index}`]}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={handleSave} disabled={loading} className="btn-primary"
                            style={{
                                padding: '0.8rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '0.5rem', fontSize: '1rem', width: '100%', marginTop: '1rem'
                            }}
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                            Save School Details
                        </button>
                    </div>
                )}

                {activeTab === 'timing' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'fadeIn 0.3s ease-out' }}>
                        
                        {/* Orange Info Badge */}
                        <div style={{
                            padding: '1rem', background: '#fff7ed', borderLeft: '4px solid #f97316',
                            borderRadius: '0 6px 6px 0', color: '#9a3412', fontSize: '0.9rem',
                            display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}>
                            <strong>Note:</strong> These official school timings will be consistently displayed across both the Teacher's App and Parent's App.
                        </div>

                        {/* Teachers duty time */}
                        <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: '#1e293b', marginTop: 0 }}>Teachers Duty Time</h3>
                            <div style={{ display: 'flex', gap: '1.5rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>Start Time</label>
                                    <input
                                        type="time" value={schoolData.teacherStartTime} onChange={(e) => setSchoolData({ ...schoolData, teacherStartTime: e.target.value })}
                                        style={{...inputStyle(), fontFamily: 'monospace'}}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>End Time</label>
                                    <input
                                        type="time" value={schoolData.teacherEndTime} onChange={(e) => setSchoolData({ ...schoolData, teacherEndTime: e.target.value })}
                                        style={{...inputStyle(), fontFamily: 'monospace'}}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Break Time */}
                        <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: '#1e293b', marginTop: 0 }}>Break Time</h3>
                            <div style={{ display: 'flex', gap: '1.5rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>Start Time</label>
                                    <input
                                        type="time" value={schoolData.breakStartTime} onChange={(e) => setSchoolData({ ...schoolData, breakStartTime: e.target.value })}
                                        style={{...inputStyle(), fontFamily: 'monospace'}}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>End Time</label>
                                    <input
                                        type="time" value={schoolData.breakEndTime} onChange={(e) => setSchoolData({ ...schoolData, breakEndTime: e.target.value })}
                                        style={{...inputStyle(), fontFamily: 'monospace'}}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* School time */}
                        <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: '#1e293b', marginTop: 0 }}>School Time (Student Class Hours)</h3>
                            <div style={{ display: 'flex', gap: '1.5rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>Start Time</label>
                                    <input
                                        type="time" value={schoolData.schoolStartTime} onChange={(e) => setSchoolData({ ...schoolData, schoolStartTime: e.target.value })}
                                        style={{...inputStyle(), fontFamily: 'monospace'}}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>End Time</label>
                                    <input
                                        type="time" value={schoolData.schoolEndTime} onChange={(e) => setSchoolData({ ...schoolData, schoolEndTime: e.target.value })}
                                        style={{...inputStyle(), fontFamily: 'monospace'}}
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleSave} disabled={loading} className="btn-primary"
                            style={{
                                padding: '0.8rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '0.5rem', fontSize: '1rem', width: '100%'
                            }}
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                            Save Timings
                        </button>
                    </div>
                )}

                {activeTab === 'about' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'fadeIn 0.3s ease-out' }}>
                        
                        {/* Blue Info Badge */}
                        <div style={{
                            padding: '1rem', background: '#eff6ff', borderLeft: '4px solid #3b82f6',
                            borderRadius: '0 6px 6px 0', color: '#1e3a8a', fontSize: '0.9rem',
                            display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}>
                            <strong>Note:</strong> This description will be dynamically shown in the "About" section of the Parent App.
                        </div>

                        <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: '#1e293b', marginTop: 0 }}>School Mission & Description</h3>
                            <textarea
                                value={schoolData.aboutText}
                                onChange={(e) => setSchoolData({ ...schoolData, aboutText: e.target.value })}
                                placeholder="Enter your school's mission, history, and core values here..."
                                rows={8}
                                style={{ ...inputStyle(), resize: 'vertical' }}
                            />
                        </div>

                        <button
                            onClick={handleSave} disabled={loading} className="btn-primary"
                            style={{
                                padding: '0.8rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '0.5rem', fontSize: '1rem', width: '100%'
                            }}
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                            Save About Details
                        </button>
                    </div>
                )}

                {activeTab === 'import' && (
                    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                        {schoolId ? <BulkUploadCard schoolId={schoolId} /> : <div>Generating School ID...</div>}
                    </div>
                )}

                {activeTab === 'upload_syllabus' && (
                    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                        {schoolId ? <UploadSyllabusTab schoolId={schoolId} /> : <div>Generating School ID...</div>}
                    </div>
                )}

                {activeTab === 'ai_assistant' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.3s ease-out' }}>
                        {/* Info Header Card */}
                        <div style={{
                            padding: '1.25rem', background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)',
                            border: '1px solid #dbeafe', borderRadius: '12px',
                            display: 'flex', alignItems: 'flex-start', gap: '1rem'
                        }}>
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '10px',
                                background: '#4f46e5', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', color: 'white', flexShrink: 0
                            }}>
                                <Bot size={22} />
                            </div>
                            <div>
                                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', fontWeight: '700', color: '#1e1b4b' }}>
                                    Principal AI Copilot Settings
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: '1.4' }}>
                                    Aapka AI Assistant school ke real-time data (Fees, Salaries, Exam Terms & Results, Attendance) ke 100% accurate jawab deta hai. 
                                    Aap apni <strong>Free Google Gemini API Key</strong> connect karke isko mazeed conversational bana sakte hain.
                                </p>
                            </div>
                        </div>

                        {/* Status Badge */}
                        <div style={{
                            padding: '0.9rem 1.2rem', borderRadius: '10px',
                            background: aiSettings.apiKey ? '#f0fdf4' : '#f8fafc',
                            border: `1px solid ${aiSettings.apiKey ? '#bbf7d0' : '#e2e8f0'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <div style={{
                                    width: '10px', height: '10px', borderRadius: '50%',
                                    background: aiSettings.apiKey ? '#22c55e' : '#3b82f6',
                                    boxShadow: aiSettings.apiKey ? '0 0 8px #22c55e' : '0 0 8px #3b82f6'
                                }} />
                                <span style={{ fontSize: '0.9rem', fontWeight: '600', color: aiSettings.apiKey ? '#15803d' : '#334155' }}>
                                    {aiSettings.apiKey ? 'Google Gemini AI Connected (1,500 Free Requests/Day)' : 'Instant Smart Engine Active (100% Free & Unlimited)'}
                                </span>
                            </div>
                            <span style={{ fontSize: '0.75rem', background: 'white', padding: '3px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: '600' }}>
                                Multi-Tenant BYOK
                            </span>
                        </div>

                        {/* Settings Form */}
                        <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label style={labelStyle}>AI Assistant Name / Title</label>
                                <input
                                    type="text"
                                    value={aiSettings.botName}
                                    onChange={(e) => setAiSettings({ ...aiSettings, botName: e.target.value })}
                                    placeholder="e.g. Principal AI Copilot"
                                    style={inputStyle()}
                                />
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                    <label style={{ ...labelStyle, marginBottom: 0 }}>Google Gemini API Key (Optional)</label>
                                    <a
                                        href="https://aistudio.google.com/app/apikey"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            fontSize: '0.75rem', color: '#4f46e5', fontWeight: '600',
                                            display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none'
                                        }}
                                    >
                                        Get Free Key from Google AI Studio <ExternalLink size={12} />
                                    </a>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="password"
                                        value={aiSettings.apiKey}
                                        onChange={(e) => setAiSettings({ ...aiSettings, apiKey: e.target.value })}
                                        placeholder="AIzaSy..."
                                        style={{ ...inputStyle(), fontFamily: 'monospace', paddingLeft: '2.5rem' }}
                                    />
                                    <Key size={16} color="#94a3b8" style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)' }} />
                                </div>
                                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem', margin: 0 }}>
                                    Yeh key aapke school ke database mein mehfooz rahegi. Agar blank chorenge toh system bina kisi API key ke built-in instant smart engine use karega.
                                </p>
                            </div>
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSaveAiSettings}
                            disabled={savingAi}
                            className="btn-primary"
                            style={{
                                padding: '0.8rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '0.5rem', fontSize: '1rem', width: '100%'
                            }}
                        >
                            {savingAi ? <Loader2 className="animate-spin" size={20} /> : (aiSavedSuccess ? <CheckCircle2 size={20} /> : <Save size={20} />)}
                            {savingAi ? 'Saving AI Settings...' : (aiSavedSuccess ? 'AI Settings Saved!' : 'Save AI Settings')}
                        </button>
                    </div>
                )}
            </div>
            
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default Settings;
