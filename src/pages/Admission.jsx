import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Admission.css'; // Import the custom CSS
import {
    Users, User, Phone, Mail, MapPin, Briefcase,
    Calendar, School, Trash2, Plus, Save, Loader2, Camera
} from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, doc, updateDoc, increment, serverTimestamp, query, orderBy } from 'firebase/firestore';

const Admission = () => {
    const [parentDetails, setParentDetails] = useState({
        fatherName: '',
        occupation: '',
        phone: '',
        email: '',
        address: ''
    });

    const [students, setStudents] = useState([
        {
            firstName: '',
            lastName: '',
            dob: '',
            gender: 'select',
            admissionClass: '', // This will now store the Class ID
            previousSchool: '',
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

    const addStudent = () => {
        setStudents([...students, {
            firstName: '',
            lastName: '',
            dob: '',
            gender: 'select',
            admissionClass: '',
            previousSchool: '',
            profilePic: null
        }]);
    };

    const removeStudent = (index) => {
        if (students.length > 1) {
            const newStudents = students.filter((_, i) => i !== index);
            setStudents(newStudents);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!schoolId) {
            alert("School ID missing. Please relogin.");
            return;
        }

        setIsLoading(true);

        try {
            // Process each student admission
            const admissionPromises = students.map(async (student) => {
                if (!student.admissionClass) return; // Skip if no class selected

                // Get Class Name for reference
                const selectedClass = availableClasses.find(c => c.id === student.admissionClass);
                const className = selectedClass ? selectedClass.name : 'Unknown';

                // 1. Add Student to Class Sub-collection
                // Structure: schools/{schoolId}/classes/{classId}/students/{studentId}
                await addDoc(collection(db, `schools/${schoolId}/classes/${student.admissionClass}/students`), {
                    name: `${student.firstName} ${student.lastName}`,
                    firstName: student.firstName,
                    lastName: student.lastName,
                    dob: student.dob,
                    gender: student.gender,
                    previousSchool: student.previousSchool,
                    profilePic: student.profilePic || null,
                    parentDetails: parentDetails, // Embed parent details for easy access
                    rollNo: `TPP-${Math.floor(1000 + Math.random() * 9000)}`, // Temp Roll No logic
                    status: 'present', // Default status
                    avgScore: 0,
                    homework: 0,
                    createdAt: serverTimestamp()
                });

                // 2. Update Class Student Count
                const classRef = doc(db, `schools/${schoolId}/classes`, student.admissionClass);
                await updateDoc(classRef, {
                    students: increment(1)
                });
            });

            await Promise.all(admissionPromises);

            alert('Admission Submitted Successfully!');
            // Reset form
            setParentDetails({ fatherName: '', occupation: '', phone: '', email: '', address: '' });
            setStudents([{ firstName: '', lastName: '', dob: '', gender: 'select', admissionClass: '', previousSchool: '', profilePic: null }]);

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

                    <div className="section-header">
                        <div className="section-icon-box">
                            <Users size={24} />
                        </div>
                        <h2 className="section-title-text">Parent / Guardian Details</h2>
                    </div>

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
