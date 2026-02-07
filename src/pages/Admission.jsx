import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Admission.css'; // Import the custom CSS
import {
    Users, User, Phone, Mail, MapPin, Briefcase,
    Calendar, School, Trash2, Plus, Save, Loader2, Camera, ChevronRight, ChevronLeft
} from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, setDoc, doc, updateDoc, increment, serverTimestamp, query, orderBy, where, limit, arrayUnion } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const Admission = () => {
    const [parentDetails, setParentDetails] = useState({
        fatherName: '',
        occupation: '',
        phone: '',
        email: '',
        address: '',
        username: '', // New field for parent login
        password: ''  // New field for parent login
    });

    // Parent Search & Link Logic
    const [searchPhone, setSearchPhone] = useState('');
    const [existingParent, setExistingParent] = useState(null);
    const [isSearchingParent, setIsSearchingParent] = useState(false);

    // Existing Sibling Linking Logic
    const [showLinkSibling, setShowLinkSibling] = useState(false);
    const [siblingClassId, setSiblingClassId] = useState('');
    const [availableSiblings, setAvailableSiblings] = useState([]);
    const [selectedSiblingId, setSelectedSiblingId] = useState('');
    const [linkedSiblings, setLinkedSiblings] = useState([]); // Students already in school to link to this parent

    const [students, setStudents] = useState([
        {
            firstName: '',
            lastName: '',
            dob: '',
            gender: 'select',
            admissionClass: '', // This will now store the Class ID
            previousSchool: '',
            rollNo: '',
            profilePic: null
        }
    ]);

    const [availableClasses, setAvailableClasses] = useState([]);
    const [schoolId, setSchoolId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const fetchSchoolAndClasses = async () => {
            const manualSession = localStorage.getItem('manual_session');
            if (manualSession) {
                const userData = JSON.parse(manualSession);
                setSchoolId(userData.schoolId);

                try {
                    const q = query(collection(db, `schools/${userData.schoolId}/classes`));
                    const querySnapshot = await getDocs(q);
                    const classesList = querySnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));

                    // Simple sort or use the enhanced sort info if available
                    // We'll trust the alphabetical/display order for now or sort by name
                    classesList.sort((a, b) => {
                        const getClassOrder = (name) => {
                            const lower = name.toLowerCase();
                            if (lower.includes('nursery')) return -2;
                            if (lower.includes('prep')) return -1;
                            return parseInt(name.replace(/\D/g, '')) || 0;
                        };
                        return getClassOrder(a.name) - getClassOrder(b.name);
                    });

                    setAvailableClasses(classesList);
                } catch (error) {
                    console.error("Error fetching classes:", error);
                }
            }
        };

        fetchSchoolAndClasses();
    }, []);

    const handleParentChange = (e) => {
        const { name, value } = e.target;
        setParentDetails(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleStudentChange = (index, e) => {
        const { name, value } = e.target;
        const newStudents = [...students];
        newStudents[index] = {
            ...newStudents[index],
            [name]: value
        };
        setStudents(newStudents);
    };

    const handleImageUpload = (index, e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const newStudents = [...students];
                newStudents[index] = {
                    ...newStudents[index],
                    profilePic: reader.result // Store base64 string
                };
                setStudents(newStudents);
            };
            reader.readAsDataURL(file);
        }
    };

    // --- Parent Search Logic ---
    const handleSearchParent = async () => {
        if (!searchPhone || !schoolId) return;
        setIsSearchingParent(true);
        try {
            const q = query(
                collection(db, `schools/${schoolId}/parents`),
                where('phone', '==', searchPhone),
                limit(1)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
                const pData = snap.docs[0].data();
                setExistingParent({ id: snap.docs[0].id, ...pData });
                setParentDetails({
                    fatherName: pData.name,
                    occupation: pData.occupation || '', // Assuming occupation might not be in basic parent schema sometimes
                    phone: pData.phone,
                    email: pData.email || '',
                    address: pData.address || '',
                    username: '', // Clear credentials as we won't create new ones
                    password: ''
                });
                alert(`Parent Found: ${pData.name}`);
            } else {
                setExistingParent(null);
                alert("No existing parent account found with this number.");
            }
        } catch (err) {
            console.error("Error searching parent:", err);
            alert("Error searching parent.");
        } finally {
            setIsSearchingParent(false);
        }
    };

    const handleResetParent = () => {
        setExistingParent(null);
        setParentDetails({ fatherName: '', occupation: '', phone: '', email: '', address: '', username: '', password: '' });
        setSearchPhone('');
    };

    // --- Sibling Linking Logic ---
    useEffect(() => {
        if (!schoolId || !siblingClassId) {
            setAvailableSiblings([]);
            return;
        }
        const fetchSiblings = async () => {
            try {
                const q = query(collection(db, `schools/${schoolId}/classes/${siblingClassId}/students`));
                const snap = await getDocs(q);
                // Filter out students who are already linked locally
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setAvailableSiblings(list);
            } catch (err) { console.error(err); }
        };
        fetchSiblings();
    }, [schoolId, siblingClassId]);

    const addSiblingLink = () => {
        if (!selectedSiblingId || !siblingClassId) return;
        const cls = availableClasses.find(c => c.id === siblingClassId);
        const stu = availableSiblings.find(s => s.id === selectedSiblingId);
        if (cls && stu) {
            if (!linkedSiblings.some(l => l.studentId === stu.id)) {
                setLinkedSiblings([...linkedSiblings, {
                    studentId: stu.id,
                    studentName: stu.name || `${stu.firstName} ${stu.lastName}`,
                    classId: cls.id,
                    className: cls.name
                }]);
            }
        }
        setSelectedSiblingId('');
    };

    const removeSiblingLink = (sid) => {
        setLinkedSiblings(linkedSiblings.filter(l => l.studentId !== sid));
    };

    const addStudent = () => {
        setStudents([...students, {
            firstName: '',
            lastName: '',
            dob: '',
            gender: 'select',
            admissionClass: '',
            previousSchool: '',
            rollNo: '',
            profilePic: null
        }]);
    };

    const removeStudent = (index) => {
        if (students.length > 1) {
            const newStudents = students.filter((_, i) => i !== index);
            setStudents(newStudents);
        }
    };

    const [parentInputStep, setParentInputStep] = useState(1);

    const handleParentNext = () => {
        // We allow going to next step even if empty, so user can Search in Step 2 to auto-fill
        setParentInputStep(2);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Manual Validation since hidden inputs don't trigger HTML5 required
        if (!parentDetails.fatherName || !parentDetails.phone) {
            alert("Please fill in Parent Details (Father Name, Phone) before submitting.");
            setParentInputStep(1);
            return;
        }

        if (!schoolId) {
            alert("School ID missing. Please relogin.");
            return;
        }

        setIsLoading(true);

        try {
            // STEP 1: Handle Parent Account
            let finalParentId = existingParent ? existingParent.id : null;

            if (!finalParentId) {
                // Create New Parent via Server-Side Function (Secure)
                const functions = getFunctions();
                const createSchoolUserFn = httpsCallable(functions, 'createSchoolUser');

                const result = await createSchoolUserFn({
                    email: parentDetails.email ? parentDetails.email.trim() : '',
                    password: parentDetails.password, // Admission form should have password field if new
                    name: parentDetails.fatherName.trim(),
                    role: 'parent',
                    schoolId: schoolId,
                    phone: parentDetails.phone.trim(),
                    address: parentDetails.address,
                    username: parentDetails.username.trim(),
                    occupation: parentDetails.occupation,
                    linkedStudents: [] // We link students after creating them below
                });

                finalParentId = result.data.uid;

            } else {
                // Optional: Update Existing Parent Details if needed? 
                // For now, we trust the search result or leave it as is to avoid overwrites.
            }

            // STEP 2: Process New Students
            const newStudentLinks = [];

            const admissionPromises = students.map(async (student) => {
                if (!student.admissionClass) return;

                const selectedClass = availableClasses.find(c => c.id === student.admissionClass);
                const className = selectedClass ? selectedClass.name : 'Unknown';

                // Prepare Student Data Object
                const studentData = {
                    name: `${student.firstName} ${student.lastName}`,
                    firstName: student.firstName,
                    lastName: student.lastName,
                    dob: student.dob,
                    gender: student.gender,
                    previousSchool: student.previousSchool,
                    profilePic: student.profilePic || null,
                    parentDetails: { ...parentDetails, parentId: finalParentId }, // Link Ref in Student Doc
                    rollNo: student.rollNo || `TPP-${Math.floor(1000 + Math.random() * 9000)}`,
                    status: 'present',
                    avgScore: 0,
                    homework: 0,
                    classId: student.admissionClass, // Ensure classId is in the doc
                    className: className,
                    createdAt: serverTimestamp()
                };

                // Generate ID via ref (so we use same ID for both locations)
                const studentRef = doc(collection(db, `schools/${schoolId}/classes/${student.admissionClass}/students`));
                const studentId = studentRef.id;

                // 1. Save to Class Sub-collection
                await setDoc(studentRef, studentData);

                // 2. Save to Master "Students" Collection (Sync for easy search/listing)
                const masterStudentRef = doc(db, `schools/${schoolId}/students`, studentId);
                await setDoc(masterStudentRef, studentData);

                // Add to links array
                // Add to links array
                newStudentLinks.push({
                    studentId: studentId,
                    studentName: `${student.firstName} ${student.lastName}`,
                    classId: student.admissionClass,
                    className: className
                });

                // Update Class Count
                const classRef = doc(db, `schools/${schoolId}/classes`, student.admissionClass);
                await updateDoc(classRef, {
                    students: increment(1)
                });
            });

            await Promise.all(admissionPromises);

            // STEP 3: Link Students (New + Sibling) to Parent Account
            const allLinks = [...newStudentLinks, ...linkedSiblings];

            // We use arrayUnion to add without duplicates
            // However, arrayUnion works on primitives or exact object matches.
            // Since these are new objects, we should fetch current and unique them, or just add.
            // Using updateDoc with arrayUnion is safest.
            const parentRef = doc(db, `schools/${schoolId}/parents`, finalParentId);

            // To be 100% safe with arrayUnion on objects, we handle it carefully.
            // But since these are NEW students, unique ID guarantees uniqueness.
            // For linkedSiblings, we might duplicate if already there? 
            // Better to pull, check, push. But arrayUnion is fine for now usually.

            if (allLinks.length > 0) {
                await updateDoc(parentRef, {
                    linkedStudents: arrayUnion(...allLinks)
                });
            }

            alert('Admission & Parent Account Linked Successfully!');

            // Reset
            setParentDetails({ fatherName: '', occupation: '', phone: '', email: '', address: '', username: '', password: '' });
            setStudents([{ firstName: '', lastName: '', dob: '', gender: 'select', admissionClass: '', previousSchool: '', profilePic: null }]);
            setExistingParent(null);
            setSearchPhone('');
            setLinkedSiblings([]);

        } catch (error) {
            console.error("Error submitting admission:", error);
            alert("Failed to submit admission. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="admission-container">
            {/* Header */}
            <header className="page-header">
                <div>
                    <h1 className="page-title">New Admission</h1>
                    <p className="page-subtitle">Enroll one or more students for the academic year</p>
                </div>
                <button className="submit-btn" onClick={handleSubmit} disabled={isLoading}>
                    {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                    <span>{isLoading ? 'Processing...' : 'Complete Admission'}</span>
                </button>
            </header>

            <form onSubmit={handleSubmit}>
                {/* Parent Details Section */}
                <section className="form-section">
                    <div className="bg-decor-icon">
                        <Users size={200} />
                    </div>

                    <div className="section-header" style={{ justifyContent: 'space-between', paddingRight: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div className="section-icon-box">
                                <Users size={24} />
                            </div>
                            <h2 className="section-title-text">
                                {parentInputStep === 1 ? 'Parent / Guardian Details' : 'Account Setup & Linking'}
                            </h2>
                        </div>
                        {parentInputStep === 1 ? (
                            <button type="button" onClick={handleParentNext} className="submit-btn" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', gap: '0.5rem' }}>
                                Next <ChevronRight size={18} />
                            </button>
                        ) : (
                            <button type="button" onClick={() => setParentInputStep(1)} className="submit-btn" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', gap: '0.5rem', background: '#64748b' }}>
                                <ChevronLeft size={18} /> Back
                            </button>
                        )}
                    </div>

                    {parentInputStep === 1 && (
                        <>
                            <div className="form-grid">
                                <div className="input-group">
                                    <label className="input-label">Father's Name</label>
                                    <div className="input-wrapper">
                                        <input
                                            type="text"
                                            name="fatherName"
                                            value={parentDetails.fatherName}
                                            onChange={handleParentChange}
                                            className="modern-input"
                                            placeholder="Enter father's name"
                                            required
                                        />
                                        <User className="input-icon" size={20} />
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Parent's Occupation</label>
                                    <div className="input-wrapper">
                                        <input
                                            type="text"
                                            name="occupation"
                                            value={parentDetails.occupation}
                                            onChange={handleParentChange}
                                            className="modern-input"
                                            placeholder="Enter occupation"
                                            required
                                        />
                                        <Briefcase className="input-icon" size={20} />
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Phone Number</label>
                                    <div className="input-wrapper">
                                        <input
                                            type="tel"
                                            name="phone"
                                            value={parentDetails.phone}
                                            onChange={handleParentChange}
                                            className="modern-input"
                                            placeholder="Enter primary contact"
                                            required
                                        />
                                        <Phone className="input-icon" size={20} />
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Email Address</label>
                                    <div className="input-wrapper">
                                        <input
                                            type="email"
                                            name="email"
                                            value={parentDetails.email}
                                            onChange={handleParentChange}
                                            className="modern-input"
                                            placeholder="Enter email address"
                                        />
                                        <Mail className="input-icon" size={20} />
                                    </div>
                                </div>

                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Residential Address</label>
                                    <div className="input-wrapper">
                                        <textarea
                                            name="address"
                                            value={parentDetails.address}
                                            onChange={handleParentChange}
                                            className="modern-input modern-textarea"
                                            placeholder="Enter full address"
                                            required
                                        />
                                        <MapPin className="input-icon" size={20} style={{ top: '1.5rem', transform: 'none' }} />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {parentInputStep === 2 && (
                        <>
                            <div className="parent-search-box" style={{
                                margin: '0 1.5rem 2rem', background: '#f8fafc', padding: '1.5rem',
                                borderRadius: '12px', border: existingParent ? '2px solid #10b981' : '1px solid #e2e8f0'
                            }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                                    Check for Existing Parent Account
                                </label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Enter Phone Number..."
                                        value={searchPhone}
                                        onChange={(e) => setSearchPhone(e.target.value)}
                                        style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                        disabled={existingParent !== null}
                                    />
                                    {existingParent ? (
                                        <button type="button" onClick={handleResetParent} style={{
                                            padding: '0 1.5rem', background: '#ef4444', color: 'white',
                                            border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600'
                                        }}>
                                            Reset
                                        </button>
                                    ) : (
                                        <button type="button" onClick={handleSearchParent} style={{
                                            padding: '0 1.5rem', background: 'var(--primary)', color: 'white',
                                            border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600'
                                        }}>
                                            {isSearchingParent ? 'Searching...' : 'Search'}
                                        </button>
                                    )}
                                </div>
                                {existingParent && (
                                    <div style={{ marginTop: '1rem', color: '#047857', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div style={{ width: 20, height: 20, background: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px' }}>✓</div>
                                        Existing Account Found: {existingParent.name} (Linked Students: {existingParent.linkedStudents ? existingParent.linkedStudents.length : 0})
                                    </div>
                                )}
                                {!existingParent && searchPhone.length > 5 && !isSearchingParent && (
                                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        No account pulled yet. Fill below to create a new one.
                                    </div>
                                )}
                            </div>

                            {!existingParent && (
                                <>
                                    <div className="form-grid" style={{ marginTop: '1.5rem' }}>
                                        <div className="input-group">
                                            <label className="input-label">Create Username</label>
                                            <div className="input-wrapper">
                                                <input
                                                    type="text"
                                                    name="username"
                                                    value={parentDetails.username}
                                                    onChange={handleParentChange}
                                                    className="modern-input"
                                                    placeholder="e.g. john.doe"
                                                    required={!existingParent}
                                                />
                                            </div>
                                        </div>
                                        <div className="input-group">
                                            <label className="input-label">Create Password</label>
                                            <div className="input-wrapper">
                                                <input
                                                    type="text"
                                                    name="password"
                                                    value={parentDetails.password}
                                                    onChange={handleParentChange}
                                                    className="modern-input"
                                                    placeholder="Set secure password"
                                                    required={!existingParent}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Link Sibling Widget */}
                            <div style={{ marginTop: '2rem', background: '#eff6ff', padding: '1.5rem', borderRadius: '16px', border: '1px dashed #6366f1' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setShowLinkSibling(!showLinkSibling)}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                                            <Plus size={16} color="var(--primary)" />
                                        </div>
                                        <label className="input-label" style={{ marginBottom: 0, cursor: 'pointer', color: 'var(--primary)', fontSize: '1rem' }}>
                                            Link Existing Siblings (Optional)
                                        </label>
                                    </div>
                                    <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{showLinkSibling ? '▲' : '▼'}</span>
                                </div>

                                {showLinkSibling && (
                                    <div className="animate-fade-in-up" style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(99, 102, 241, 0.1)' }}>
                                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: '1.5' }}>
                                            If this family already has other children in our school, find and add them here. This ensures all children appear under the same parent account.
                                        </p>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '1rem', marginBottom: '1rem' }}>
                                            <select
                                                value={siblingClassId}
                                                onChange={(e) => setSiblingClassId(e.target.value)}
                                                style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                                            >
                                                <option value="">Select Sibling's Class</option>
                                                {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                            <select
                                                value={selectedSiblingId}
                                                onChange={(e) => setSelectedSiblingId(e.target.value)}
                                                disabled={!siblingClassId}
                                                style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', opacity: siblingClassId ? 1 : 0.6 }}
                                            >
                                                <option value="">Select Student</option>
                                                {availableSiblings.map(s => <option key={s.id} value={s.id}>{s.name} ({s.rollNo})</option>)}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={addSiblingLink}
                                                disabled={!selectedSiblingId}
                                                style={{
                                                    background: 'var(--primary)', color: 'white', border: 'none',
                                                    padding: '0 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '600',
                                                    opacity: selectedSiblingId ? 1 : 0.6
                                                }}
                                            >
                                                Link
                                            </button>
                                        </div>

                                        {linkedSiblings.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                                {linkedSiblings.map(sib => (
                                                    <div key={sib.studentId} style={{
                                                        background: 'white', border: '1px solid #e2e8f0', padding: '0.5rem 1rem',
                                                        borderRadius: '24px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                        color: 'var(--text-main)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                                    }}>
                                                        <span style={{ fontWeight: '600', color: 'var(--primary)' }}>{sib.studentName}</span>
                                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>{sib.className}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeSiblingLink(sib.studentId)}
                                                            style={{
                                                                background: '#fee2e2', border: 'none', borderRadius: '50%',
                                                                width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                cursor: 'pointer', color: '#ef4444'
                                                            }}
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </section>

                {/* Dynamic Students Section */}
                <div style={{ paddingBottom: '3rem' }}>
                    <div className="section-header" style={{ marginBottom: '1rem' }}>
                        <div className="section-icon-box" style={{ background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.1), rgba(59, 130, 246, 0.1))', color: 'var(--secondary)' }}>
                            <School size={24} />
                        </div>
                        <h2 className="section-title-text">Student Details</h2>
                    </div>

                    <AnimatePresence>
                        {students.map((student, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                                transition={{ duration: 0.3 }}
                                className="student-card"
                            >
                                <div className="student-header">
                                    <h3 className="section-title-text" style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center' }}>
                                        <span className="student-number-badge">
                                            {index + 1}
                                        </span>
                                        Student Information
                                    </h3>
                                    {students.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeStudent(index)}
                                            className="remove-btn"
                                            title="Remove Student"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>

                                <div className="form-grid">
                                    <div className="input-group">
                                        <label className="input-label">First Name</label>
                                        <div className="input-wrapper">
                                            <input
                                                type="text"
                                                name="firstName"
                                                value={student.firstName}
                                                onChange={(e) => handleStudentChange(index, e)}
                                                className="modern-input"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="input-group">
                                        <label className="input-label">Last Name</label>
                                        <div className="input-wrapper">
                                            <input
                                                type="text"
                                                name="lastName"
                                                value={student.lastName}
                                                onChange={(e) => handleStudentChange(index, e)}
                                                className="modern-input"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="input-group">
                                        <label className="input-label">Roll Number</label>
                                        <div className="input-wrapper">
                                            <input
                                                type="text"
                                                name="rollNo"
                                                value={student.rollNo}
                                                onChange={(e) => handleStudentChange(index, e)}
                                                className="modern-input"
                                                placeholder="e.g. 101"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="input-group">
                                        <label className="input-label">Date of Birth</label>
                                        <div className="input-wrapper">
                                            <input
                                                type="date"
                                                name="dob"
                                                value={student.dob}
                                                onChange={(e) => handleStudentChange(index, e)}
                                                className="modern-input"
                                                required
                                            />
                                            <Calendar className="input-icon" size={20} />
                                        </div>
                                    </div>

                                    <div className="input-group">
                                        <label className="input-label">Gender</label>
                                        <div className="input-wrapper">
                                            <select
                                                name="gender"
                                                value={student.gender}
                                                onChange={(e) => handleStudentChange(index, e)}
                                                className="modern-input modern-select"
                                            >
                                                <option value="select" disabled>Select Gender</option>
                                                <option value="Male">Male</option>
                                                <option value="Female">Female</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="input-group">
                                        <label className="input-label">Admission Class</label>
                                        <div className="input-wrapper">
                                            <select
                                                name="admissionClass"
                                                value={student.admissionClass}
                                                onChange={(e) => handleStudentChange(index, e)}
                                                className="modern-input modern-select"
                                                required
                                            >
                                                <option value="" disabled>Select Class</option>
                                                {availableClasses.length > 0 ? (
                                                    availableClasses.map((cls) => (
                                                        <option key={cls.id} value={cls.id}>
                                                            {cls.name}
                                                        </option>
                                                    ))
                                                ) : (
                                                    <option value="" disabled>Loading classes...</option>
                                                )}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="input-group">
                                        <label className="input-label">Previous School</label>
                                        <div className="input-wrapper">
                                            <input
                                                type="text"
                                                name="previousSchool"
                                                value={student.previousSchool}
                                                onChange={(e) => handleStudentChange(index, e)}
                                                className="modern-input"
                                                placeholder="Optional"
                                            />
                                        </div>
                                    </div>

                                    <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                        <label className="input-label">Student Photo</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: '0.5rem' }}>
                                            <div style={{
                                                width: '80px', height: '80px', borderRadius: '50%',
                                                background: '#f1f5f9', border: '2px dashed #cbd5e1',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                overflow: 'hidden', position: 'relative'
                                            }}>
                                                {student.profilePic ? (
                                                    <img src={student.profilePic} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <Camera size={32} color="#94a3b8" />
                                                )}
                                            </div>
                                            <div>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) => handleImageUpload(index, e)}
                                                    id={`photo-upload-${index}`}
                                                    style={{ display: 'none' }}
                                                />
                                                <label
                                                    htmlFor={`photo-upload-${index}`}
                                                    style={{
                                                        display: 'inline-block',
                                                        padding: '0.6rem 1.2rem',
                                                        background: 'white',
                                                        border: '1px solid #e2e8f0',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.9rem',
                                                        fontWeight: '600',
                                                        color: 'var(--text-main)',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    Upload Photo
                                                </label>
                                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                                    JPG, PNG up to 2MB
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    <button
                        type="button"
                        onClick={addStudent}
                        className="add-sibling-btn"
                    >
                        <Plus size={24} />
                        Add Another Sibling
                    </button>
                </div>
            </form>
        </div>
    );
};

export default Admission;
