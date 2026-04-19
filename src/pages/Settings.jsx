

import React, { useState, useEffect } from 'react';
import { Camera, Save, Loader2, Shield, Copy, CheckCircle2, Clock, Building, Briefcase, Plus, Trash2, Users } from 'lucide-react';
import { db, storage, auth } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import BulkUploadCard from '../components/BulkUploadCard';
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
        phone: '',
        landline: '',
        emergencyContact: '',
        teacherStartTime: '08:00',
        teacherEndTime: '14:00',
        schoolStartTime: '08:00',
        schoolEndTime: '14:00'
    });
    
    const [bankAccounts, setBankAccounts] = useState([]);
    const [previewImage, setPreviewImage] = useState(null);
    const [imageFile, setImageFile] = useState(null);
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
                    phone: data.phone || '',
                    landline: data.landline || '',
                    emergencyContact: data.emergencyContact || '',
                    teacherStartTime: data.teacherStartTime || '08:00',
                    teacherEndTime: data.teacherEndTime || '14:00',
                    schoolStartTime: data.schoolStartTime || '08:00',
                    schoolEndTime: data.schoolEndTime || '14:00'
                }));
                setFetchError(false);
            } else {
                // Initialize if it doesn't exist
                const defaultData = { name: 'My School', profileImage: '', teacherStartTime: '08:00', teacherEndTime: '14:00', schoolStartTime: '08:00', schoolEndTime: '14:00' };
                try {
                    await setDoc(profileRef, defaultData);
                    setSchoolData(prev => ({ ...prev, ...defaultData }));
                } catch (e) {
                    console.error("Set Default profile error:", e);
                }
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

        return () => {
            isMounted = false;
            unsubProfile();
            unsubBanking();
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
        
        if (schoolData.address && schoolData.address.trim().length < 5) {
            newErrors.address = "Address is too short. Minimum 5 characters.";
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
                phone: schoolData.phone,
                landline: schoolData.landline,
                emergencyContact: schoolData.emergencyContact,
                teacherStartTime: schoolData.teacherStartTime,
                teacherEndTime: schoolData.teacherEndTime,
                schoolStartTime: schoolData.schoolStartTime,
                schoolEndTime: schoolData.schoolEndTime
            };

            // 1. Profile document
            await setDoc(doc(db, `schools/${currentSchoolId}/settings`, 'profile'), settingsData, { merge: true });
            
            // 2. Banking document 
            // Avoid polluting `profile` and keep banking details encapsulated for better security and future separation
            await setDoc(doc(db, `schools/${currentSchoolId}/settings`, 'banking'), { accounts: bankAccounts }, { merge: true });

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

                {activeTab === 'import' && (
                    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                        {schoolId ? <BulkUploadCard schoolId={schoolId} /> : <div>Generating School ID...</div>}
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
