import React, { useState, useEffect, useRef } from 'react';
import {
    FileText, Award, Users, Search, Plus, Trash2, Printer, Download,
    Check, Sparkles, X, ChevronRight, Eye, Calendar, User, Phone,
    DollarSign, Shield, RefreshCw, Send, CheckCircle2, Copy, ExternalLink,
    BookmarkCheck, Briefcase, FileCheck, Layers, AlertCircle
} from 'lucide-react';
import { db } from '../firebase';
import {
    collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot
} from 'firebase/firestore';
import { useAuthPermissions } from '../context/AuthPermissionsContext';
import { useAlert } from '../context/AlertContext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// =========================================================================
// DOCUMENT TEMPLATES DEFINITION
// =========================================================================

const DOCUMENT_TYPES = [
    {
        id: 'appointment',
        label: 'Appointment Letter',
        subtitle: 'Formal Employment Contract & Terms',
        icon: '📄',
        badgeColor: '#0284c7',
        defaultSubject: 'Letter of Appointment for the Post of Teacher'
    },
    {
        id: 'experience',
        label: 'Experience Certificate',
        subtitle: 'Service & Character Recommendation',
        icon: '📜',
        badgeColor: '#059669',
        defaultSubject: 'Certificate of Service & Experience'
    },
    {
        id: 'job_offer',
        label: 'Job Offer Letter',
        subtitle: 'Formal Offer of Employment with Acceptance',
        icon: '✉️',
        badgeColor: '#4f46e5',
        defaultSubject: 'Offer of Employment'
    },
    {
        id: 'relieving_noc',
        label: 'Relieving & Clearance (NOC)',
        subtitle: 'No Objection & Dues Clearance Certificate',
        icon: '📋',
        badgeColor: '#d97706',
        defaultSubject: 'Relieving Order & Clearance Certificate (NOC)'
    },
    {
        id: 'appreciation',
        label: 'Teacher Appreciation',
        subtitle: 'Certificate of Excellence & Recognition',
        icon: '🏆',
        badgeColor: '#e11d48',
        defaultSubject: 'Letter of Appreciation & Commendation'
    },
    {
        id: 'bonafide',
        label: 'Employment Verification',
        subtitle: 'Bonafide Certificate for Bank / Visa / Official',
        icon: '🏛️',
        badgeColor: '#475569',
        defaultSubject: 'To Whom It May Concern (Employment Verification)'
    }
];

const HRDocuments = () => {
    const { schoolId: authSchoolId, userProfile } = useAuthPermissions();
    const { showAlert } = useAlert();

    // Fallback School ID resolution
    const [schoolId, setSchoolId] = useState(() => {
        if (authSchoolId) return authSchoolId;
        try {
            const sess = localStorage.getItem('manual_session');
            if (sess) return JSON.parse(sess).schoolId || '';
        } catch (e) { }
        return '';
    });

    useEffect(() => {
        if (authSchoolId) {
            setSchoolId(authSchoolId);
        } else if (!schoolId) {
            getDocs(collection(db, 'schools')).then(snap => {
                if (!snap.empty) setSchoolId(snap.docs[0].id);
            }).catch(console.error);
        }
    }, [authSchoolId]);

    // Active Navigation Tabs
    const [activeTab, setActiveTab] = useState('studio'); // 'studio', 'archive'

    // School Profile Info
    const [schoolInfo, setSchoolInfo] = useState({
        name: 'The Smart School & College',
        address: 'Main Campus, Lahore, Pakistan',
        phone: '042-35800000 / 0300-1234567',
        email: 'info@school.edu.pk',
        logoUrl: '',
        principalName: 'Principal / Director'
    });

    // Teachers List Cache
    const [teachersList, setTeachersList] = useState([]);
    const [selectedTeacherId, setSelectedTeacherId] = useState('');
    const [loadingTeachers, setLoadingTeachers] = useState(true);

    // Issued Documents Archive
    const [issuedArchive, setIssuedArchive] = useState([]);
    const [archiveSearch, setArchiveSearch] = useState('');
    const [archiveTypeFilter, setArchiveTypeFilter] = useState('All');
    const [isSavingToArchive, setIsSavingToArchive] = useState(false);

    // Document Generator Form State
    const [docType, setDocType] = useState('appointment');
    const [formData, setFormData] = useState({
        refNo: `SCH/HR/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`,
        issueDate: new Date().toISOString().slice(0, 10),
        candidateName: '',
        fatherName: '',
        cnic: '',
        phone: '',
        email: '',
        address: '',
        designation: 'Senior Science Teacher',
        department: 'Secondary Wing',
        qualification: 'M.Sc Physics / B.Ed',
        monthlySalary: '45,000',
        joiningDate: new Date().toISOString().slice(0, 10),
        probationMonths: '3 Months',
        workingHours: '07:45 AM to 02:00 PM (Monday to Saturday)',
        noticePeriod: '1 Month written notice or salary in lieu thereof',
        tenureFrom: '01-Aug-2023',
        tenureTo: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        performanceRating: 'Outstanding & Highly Dedicated',
        verificationPurpose: 'Opening of Salary Bank Account',
        appreciationReason: 'Exceptional 100% Board Exam Results & Exemplary Classroom Discipline',
        customRemarks: 'We appreciate the teacher\'s valuable contribution to the academic excellence of our institution.',
        signatoryName: 'Prof. Muhammad Tariq',
        signatoryTitle: 'Principal / Head of Institution'
    });

    const letterheadRef = useRef(null);

    // -------------------------------------------------------------
    // 1. Fetch School Info & Teachers List
    // -------------------------------------------------------------
    useEffect(() => {
        if (!schoolId) return;

        // Fetch School Info
        getDoc(doc(db, 'schools', schoolId)).then(snap => {
            if (snap.exists()) {
                const d = snap.data();
                setSchoolInfo({
                    name: d.name || 'School Name',
                    address: d.address || 'Campus Address',
                    phone: d.phone || d.emergencyContact || '',
                    email: d.email || 'info@school.edu.pk',
                    logoUrl: d.profileImage || d.logoUrl || '',
                    principalName: d.principalName || 'Principal'
                });
                if (d.principalName) {
                    setFormData(prev => ({ ...prev, signatoryName: d.principalName }));
                }
            }
        }).catch(console.error);

        // Fetch Teachers List
        const unsubTeachers = onSnapshot(collection(db, `schools/${schoolId}/teachers`), snap => {
            const list = snap.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            }));
            setTeachersList(list);
            setLoadingTeachers(false);
        }, err => {
            console.error('Teachers load error:', err);
            setLoadingTeachers(false);
        });

        // Fetch Issued Documents Archive
        const archiveRef = doc(db, `schools/${schoolId}/settings/hr_documents_archive`);
        const unsubArchive = onSnapshot(archiveRef, snap => {
            if (snap.exists()) {
                const d = snap.data();
                setIssuedArchive(Array.isArray(d.records) ? d.records : []);
            } else {
                setIssuedArchive([]);
            }
        }, err => console.error('Archive load error:', err));

        return () => {
            unsubTeachers();
            unsubArchive();
        };
    }, [schoolId]);

    // -------------------------------------------------------------
    // 2. Teacher Selection Auto-Fill
    // -------------------------------------------------------------
    const handleSelectTeacher = (teacherId) => {
        setSelectedTeacherId(teacherId);
        if (!teacherId || teacherId === 'custom') {
            return;
        }

        const teacher = teachersList.find(t => t.id === teacherId);
        if (teacher) {
            setFormData(prev => ({
                ...prev,
                candidateName: teacher.name || teacher.fullName || '',
                fatherName: teacher.fatherName || teacher.husbandName || '',
                cnic: teacher.cnic || teacher.nationalId || '',
                phone: teacher.phone || teacher.mobile || '',
                email: teacher.email || '',
                address: teacher.address || teacher.residentialAddress || '',
                designation: teacher.designation || teacher.subject || 'Senior Teacher',
                qualification: teacher.qualification || teacher.education || 'Master Degree / B.Ed',
                monthlySalary: teacher.salary ? Number(teacher.salary).toLocaleString() : prev.monthlySalary,
                joiningDate: teacher.joiningDate || teacher.dateOfJoining || prev.joiningDate,
                tenureFrom: teacher.joiningDate || prev.tenureFrom
            }));
            showAlert(`Loaded profile details for ${teacher.name}!`, 'success');
        }
    };

    // -------------------------------------------------------------
    // 3. Generate New Ref No
    // -------------------------------------------------------------
    const handleGenerateNewRef = () => {
        const prefix = (schoolInfo.name || 'SCH').split(' ').map(w => w[0]).join('').slice(0, 4).toUpperCase() || 'SCH';
        const newRef = `${prefix}/HR/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;
        setFormData(prev => ({ ...prev, refNo: newRef }));
    };

    // -------------------------------------------------------------
    // 4. Print & PDF Export
    // -------------------------------------------------------------
    const handlePrintLetter = () => {
        window.print();
    };

    const handleDownloadPDF = async () => {
        if (!letterheadRef.current) return;
        try {
            showAlert('Generating high-resolution official PDF...', 'info');
            const canvas = await html2canvas(letterheadRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.98);
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            const fileName = `${formData.candidateName || 'Staff'}_${docType}_${formData.refNo.replace(/\//g, '_')}.pdf`;
            pdf.save(fileName);
            showAlert('Official HR Document PDF downloaded!', 'success');
        } catch (err) {
            console.error('PDF error:', err);
            showAlert('Failed to generate PDF: ' + err.message, 'error');
        }
    };

    // -------------------------------------------------------------
    // 5. Save to Issued Archive
    // -------------------------------------------------------------
    const handleSaveToArchive = async () => {
        if (!formData.candidateName.trim()) {
            showAlert('Please specify the candidate/teacher name before saving!', 'error');
            return;
        }

        setIsSavingToArchive(true);
        try {
            const newRecord = {
                id: `hr_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
                refNo: formData.refNo,
                docType,
                docTypeLabel: DOCUMENT_TYPES.find(d => d.id === docType)?.label || docType,
                candidateName: formData.candidateName,
                fatherName: formData.fatherName,
                cnic: formData.cnic,
                phone: formData.phone,
                designation: formData.designation,
                issueDate: formData.issueDate,
                formDataSnapshot: { ...formData },
                createdAt: new Date().toISOString()
            };

            const updatedRecords = [newRecord, ...issuedArchive.filter(r => r.refNo !== formData.refNo)];
            const archiveDocRef = doc(db, `schools/${schoolId}/settings/hr_documents_archive`);
            await setDoc(archiveDocRef, { records: updatedRecords, updatedAt: new Date().toISOString() }, { merge: true });

            setIssuedArchive(updatedRecords);
            showAlert(`Saved "${newRecord.docTypeLabel}" to HR Archive with Ref: ${formData.refNo}!`, 'success');
        } catch (error) {
            console.error('Save error:', error);
            showAlert('Failed to save to archive: ' + error.message, 'error');
        } finally {
            setIsSavingToArchive(false);
        }
    };

    const handleDeleteArchiveItem = async (recordId) => {
        if (!window.confirm('Are you sure you want to delete this document from the archive?')) return;
        try {
            const updated = issuedArchive.filter(r => r.id !== recordId);
            const archiveDocRef = doc(db, `schools/${schoolId}/settings/hr_documents_archive`);
            await setDoc(archiveDocRef, { records: updated, updatedAt: new Date().toISOString() }, { merge: true });
            setIssuedArchive(updated);
            showAlert('Document removed from archive.', 'success');
        } catch (error) {
            showAlert('Failed to delete: ' + error.message, 'error');
        }
    };

    const handleLoadArchivedDoc = (record) => {
        if (record.formDataSnapshot) {
            setFormData(record.formDataSnapshot);
            setDocType(record.docType);
            setActiveTab('studio');
            showAlert(`Loaded archived document ${record.refNo}!`, 'info');
        }
    };

    // -------------------------------------------------------------
    // 6. Send WhatsApp Notification
    // -------------------------------------------------------------
    const handleSendWhatsApp = () => {
        if (!formData.phone) {
            showAlert('Please enter teacher phone number first!', 'warning');
            return;
        }

        let phone = formData.phone.replace(/[^0-9]/g, '');
        if (phone.startsWith('0')) phone = '92' + phone.slice(1);
        if (phone.startsWith('0092')) phone = '92' + phone.slice(4);

        const currentType = DOCUMENT_TYPES.find(d => d.id === docType)?.label || 'HR Document';
        const text = `*${schoolInfo.name.toUpperCase()}*\n*OFFICIAL HR NOTIFICATION*\n\nDear *${formData.candidateName}*,\nYour official *${currentType}* has been issued.\n\n📄 *Document Details:*\n• *Reference No:* ${formData.refNo}\n• *Designation:* ${formData.designation}\n• *Date of Issue:* ${formData.issueDate}\n\nPlease collect your signed copy from the School Administration Office or contact the HR department.\n\n*Regards,*\n*${formData.signatoryName}*\n${formData.signatoryTitle}\n${schoolInfo.name}`;

        const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    return (
        <div style={{ width: '100%', padding: '0.25rem 0.75rem' }}>
            {/* Header Banner */}
            <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0369a1 100%)',
                color: 'white',
                padding: '1.5rem 1.75rem',
                borderRadius: '16px',
                marginBottom: '1.25rem',
                boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.25)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                        <span style={{ background: '#38bdf8', color: '#0f172a', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '800' }}>
                            HUMAN RESOURCES & CONTRACTS
                        </span>
                        <span style={{ fontSize: '0.82rem', color: '#93c5fd' }}>
                            {schoolInfo.name}
                        </span>
                    </div>
                    <h1 style={{ fontSize: '1.7rem', fontWeight: '900', margin: '0 0 0.4rem 0', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <FileCheck size={28} color="#38bdf8" /> Official HR Document Generator
                    </h1>
                    <p style={{ margin: 0, fontSize: '0.88rem', color: '#cbd5e1', maxWidth: '680px' }}>
                        Generate customized, print-ready appointment letters, experience certificates, job offers, relieving orders, and bonafide letters with automatic school logo letterheads.
                    </p>
                </div>

                {/* Tab Switcher in Header */}
                <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.1)', padding: '0.35rem', borderRadius: '10px', backdropFilter: 'blur(8px)' }}>
                    <button
                        onClick={() => setActiveTab('studio')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.55rem 1rem',
                            borderRadius: '8px',
                            border: 'none',
                            background: activeTab === 'studio' ? '#ffffff' : 'transparent',
                            color: activeTab === 'studio' ? '#0f172a' : '#cbd5e1',
                            fontWeight: '800',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <FileText size={15} /> Document Studio
                    </button>
                    <button
                        onClick={() => setActiveTab('archive')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.55rem 1rem',
                            borderRadius: '8px',
                            border: 'none',
                            background: activeTab === 'archive' ? '#ffffff' : 'transparent',
                            color: activeTab === 'archive' ? '#0f172a' : '#cbd5e1',
                            fontWeight: '800',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <Layers size={15} /> Issued Archive ({issuedArchive.length})
                    </button>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* TAB 1: DOCUMENT GENERATOR STUDIO */}
            {/* ========================================================================= */}
            {activeTab === 'studio' && (
                <div>
                    {/* Template Selection Pills */}
                    <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
                        {DOCUMENT_TYPES.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setDocType(t.id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.65rem 1.1rem',
                                    borderRadius: '10px',
                                    border: '1.5px solid',
                                    borderColor: docType === t.id ? t.badgeColor : '#cbd5e1',
                                    background: docType === t.id ? '#ffffff' : '#f8fafc',
                                    color: docType === t.id ? '#0f172a' : '#475569',
                                    fontWeight: docType === t.id ? '800' : '600',
                                    fontSize: '0.86rem',
                                    cursor: 'pointer',
                                    boxShadow: docType === t.id ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <span style={{ fontSize: '1.1rem' }}>{t.icon}</span>
                                <span>{t.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Main Split Grid (Left: Form Inputs | Right: Live A4 Preview) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '430px 1fr', gap: '1.25rem', alignItems: 'flex-start', width: '100%' }}>

                        {/* LEFT COLUMN: FORM CONTROLS */}
                        <div className="card" style={{ padding: '1.25rem', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#ffffff', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.6rem' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                                    ⚙️ Document Parameters
                                </h3>
                                <button
                                    onClick={handleGenerateNewRef}
                                    title="Generate Fresh Serial Ref Number"
                                    className="btn"
                                    style={{ background: '#f1f5f9', color: '#0284c7', padding: '0.25rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700' }}
                                >
                                    <RefreshCw size={12} /> New Ref #
                                </button>
                            </div>

                            {/* Teacher Database Quick-Select */}
                            <div style={{ background: '#f0f9ff', padding: '0.85rem', borderRadius: '10px', border: '1px solid #bae6fd', marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '800', color: '#0369a1', marginBottom: '0.35rem' }}>
                                    ⚡ Auto-Fill from Registered Staff Database:
                                </label>
                                <select
                                    value={selectedTeacherId}
                                    onChange={(e) => handleSelectTeacher(e.target.value)}
                                    style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #0284c7', fontSize: '0.85rem', fontWeight: '600' }}
                                >
                                    <option value="">-- Choose Existing Teacher to Auto-Populate --</option>
                                    <option value="custom">✍️ Custom Candidate (Manual Entry)</option>
                                    {teachersList.map(tch => (
                                        <option key={tch.id} value={tch.id}>
                                            {tch.name || tch.fullName} ({tch.designation || tch.subject || 'Staff'})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Form Input Fields */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Ref Number *:</label>
                                        <input
                                            type="text"
                                            value={formData.refNo}
                                            onChange={(e) => setFormData({ ...formData, refNo: e.target.value })}
                                            style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '700', color: '#0f172a' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Issue Date *:</label>
                                        <input
                                            type="date"
                                            value={formData.issueDate}
                                            onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                                            style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Candidate / Teacher Full Name *:</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Ms. Ayesha Siddiqa"
                                        value={formData.candidateName}
                                        onChange={(e) => setFormData({ ...formData, candidateName: e.target.value })}
                                        style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '700' }}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Father / Husband Name:</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Muhammad Aslam"
                                            value={formData.fatherName}
                                            onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                                            style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>CNIC Number:</label>
                                        <input
                                            type="text"
                                            placeholder="35201-1234567-8"
                                            value={formData.cnic}
                                            onChange={(e) => setFormData({ ...formData, cnic: e.target.value })}
                                            style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Designation / Post:</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Senior Science Teacher"
                                            value={formData.designation}
                                            onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                                            style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Qualification:</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. M.Sc / B.Ed"
                                            value={formData.qualification}
                                            onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                                            style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Phone / WhatsApp:</label>
                                        <input
                                            type="text"
                                            placeholder="0300-1234567"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Monthly Salary (PKR):</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. 45,000"
                                            value={formData.monthlySalary}
                                            onChange={(e) => setFormData({ ...formData, monthlySalary: e.target.value })}
                                            style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: '700', color: '#059669' }}
                                        />
                                    </div>
                                </div>

                                {/* Template Specific Dynamic Fields */}
                                {(docType === 'appointment' || docType === 'job_offer') && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Joining Date:</label>
                                            <input
                                                type="date"
                                                value={formData.joiningDate}
                                                onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                                                style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Probation Period:</label>
                                            <input
                                                type="text"
                                                value={formData.probationMonths}
                                                onChange={(e) => setFormData({ ...formData, probationMonths: e.target.value })}
                                                style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {(docType === 'experience' || docType === 'relieving_noc') && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Service Tenure From:</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. 01-Aug-2023"
                                                value={formData.tenureFrom}
                                                onChange={(e) => setFormData({ ...formData, tenureFrom: e.target.value })}
                                                style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Service Tenure To:</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. 31-Aug-2026"
                                                value={formData.tenureTo}
                                                onChange={(e) => setFormData({ ...formData, tenureTo: e.target.value })}
                                                style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {docType === 'bonafide' && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Verification Purpose / Bank:</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Opening of Salary Account / Visa Application"
                                            value={formData.verificationPurpose}
                                            onChange={(e) => setFormData({ ...formData, verificationPurpose: e.target.value })}
                                            style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                        />
                                    </div>
                                )}

                                {docType === 'appreciation' && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Achievement / Commendation Reason:</label>
                                        <textarea
                                            rows={2}
                                            value={formData.appreciationReason}
                                            onChange={(e) => setFormData({ ...formData, appreciationReason: e.target.value })}
                                            style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                        />
                                    </div>
                                )}

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#475569', marginBottom: '0.2rem' }}>Signatory Name & Title:</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                        <input
                                            type="text"
                                            placeholder="Signatory Name"
                                            value={formData.signatoryName}
                                            onChange={(e) => setFormData({ ...formData, signatoryName: e.target.value })}
                                            style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Signatory Title"
                                            value={formData.signatoryTitle}
                                            onChange={(e) => setFormData({ ...formData, signatoryTitle: e.target.value })}
                                            style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: REAL-TIME A4 LIVE LETTERHEAD PREVIEW */}
                        <div>
                            {/* Action Bar Above Preview */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.6rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#0f172a' }}>
                                        📄 A4 Official Letterhead Live Preview
                                    </span>
                                </div>

                                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={handlePrintLetter}
                                        className="btn hover-lift"
                                        style={{ background: '#0f172a', color: 'white', padding: '0.5rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700' }}
                                    >
                                        <Printer size={15} /> Print A4 Letter
                                    </button>
                                    <button
                                        onClick={handleDownloadPDF}
                                        className="btn hover-lift"
                                        style={{ background: '#0284c7', color: 'white', padding: '0.5rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700' }}
                                    >
                                        <Download size={15} /> Download PDF
                                    </button>
                                    <button
                                        disabled={isSavingToArchive}
                                        onClick={handleSaveToArchive}
                                        className="btn hover-lift"
                                        style={{ background: '#059669', color: 'white', padding: '0.5rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700' }}
                                    >
                                        <BookmarkCheck size={15} /> {isSavingToArchive ? 'Saving...' : 'Save to Archive'}
                                    </button>
                                    {formData.phone && (
                                        <button
                                            onClick={handleSendWhatsApp}
                                            className="btn hover-lift"
                                            style={{ background: '#25d366', color: 'white', padding: '0.5rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700' }}
                                        >
                                            <Send size={15} /> WhatsApp
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* A4 Physical Letterhead Paper Container */}
                            <div style={{ background: '#cbd5e1', padding: '1.25rem', borderRadius: '12px', display: 'flex', justifyContent: 'center', overflowX: 'auto', width: '100%' }}>
                                <div
                                    ref={letterheadRef}
                                    id="official-letterhead-print"
                                    style={{
                                        width: '100%',
                                        maxWidth: '840px',
                                        minHeight: '980px',
                                        background: '#ffffff',
                                        padding: '2.5rem 2.85rem',
                                        borderRadius: '2px',
                                        boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        fontFamily: 'Georgia, Cambria, "Times New Roman", serif',
                                        color: '#0f172a',
                                        lineHeight: 1.6
                                    }}
                                >
                                    {/* TOP SECTION: SCHOOL LETTERHEAD */}
                                    <div>
                                        {/* School Header Banner */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', borderBottom: '3px double #0f172a', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
                                            {/* School Logo */}
                                            {schoolInfo.logoUrl ? (
                                                <img
                                                    src={schoolInfo.logoUrl}
                                                    alt="School Logo"
                                                    style={{ width: '80px', height: '80px', objectFit: 'contain' }}
                                                />
                                            ) : (
                                                <div style={{
                                                    width: '76px', height: '76px', borderRadius: '50%',
                                                    background: 'linear-gradient(135deg, #0f172a, #0369a1)',
                                                    color: 'white', display: 'flex', alignItems: 'center',
                                                    justifyContent: 'center', fontSize: '1.6rem', fontWeight: 'bold'
                                                }}>
                                                    🏛️
                                                </div>
                                            )}

                                            <div style={{ flex: 1 }}>
                                                <h1 style={{
                                                    fontSize: '1.6rem',
                                                    fontWeight: '900',
                                                    color: '#0f172a',
                                                    margin: '0 0 0.2rem 0',
                                                    letterSpacing: '-0.01em',
                                                    textTransform: 'uppercase',
                                                    fontFamily: 'system-ui, -apple-system, sans-serif'
                                                }}>
                                                    {schoolInfo.name}
                                                </h1>
                                                <p style={{ fontSize: '0.8rem', color: '#475569', margin: '0 0 0.15rem 0', fontFamily: 'system-ui, sans-serif' }}>
                                                    {schoolInfo.address}
                                                </p>
                                                <p style={{ fontSize: '0.76rem', color: '#64748b', margin: 0, fontFamily: 'system-ui, sans-serif' }}>
                                                    Phone: {schoolInfo.phone} {schoolInfo.email && ` | Email: ${schoolInfo.email}`}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Ref No & Date Row */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', marginBottom: '1.5rem', fontFamily: 'system-ui, sans-serif', fontWeight: '600' }}>
                                            <div>
                                                <strong>Ref:</strong> <span style={{ color: '#0284c7' }}>{formData.refNo}</span>
                                            </div>
                                            <div>
                                                <strong>Date:</strong> {new Date(formData.issueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                                            </div>
                                        </div>

                                        {/* DOCUMENT TITLE HEADER */}
                                        <div style={{ textAlign: 'center', margin: '1.25rem 0' }}>
                                            <h2 style={{
                                                display: 'inline-block',
                                                fontSize: '1.18rem',
                                                fontWeight: '900',
                                                color: '#0f172a',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.06em',
                                                borderBottom: '2px solid #0f172a',
                                                paddingBottom: '0.2rem',
                                                margin: 0,
                                                fontFamily: 'system-ui, sans-serif'
                                            }}>
                                                {docType === 'appointment' && 'LETTER OF APPOINTMENT'}
                                                {docType === 'experience' && 'EXPERIENCE & SERVICE CERTIFICATE'}
                                                {docType === 'job_offer' && 'OFFICIAL OFFER OF EMPLOYMENT'}
                                                {docType === 'relieving_noc' && 'RELIEVING ORDER & CLEARANCE CERTIFICATE'}
                                                {docType === 'appreciation' && 'CERTIFICATE OF APPRECIATION & EXCELLENCE'}
                                                {docType === 'bonafide' && 'TO WHOM IT MAY CONCERN'}
                                            </h2>
                                        </div>

                                        {/* ------------------------------------------------------------- */}
                                        {/* TEMPLATE 1: APPOINTMENT LETTER */}
                                        {/* ------------------------------------------------------------- */}
                                        {docType === 'appointment' && (
                                            <div style={{ fontSize: '0.92rem', color: '#1e293b', textAlign: 'justify' }}>
                                                <p style={{ margin: '0 0 1rem 0' }}>
                                                    To,<br />
                                                    <strong>{formData.candidateName || '[Candidate Name]'}</strong><br />
                                                    {formData.fatherName && <span>S/O, D/O, W/O: {formData.fatherName}<br /></span>}
                                                    {formData.cnic && <span>CNIC: {formData.cnic}<br /></span>}
                                                    {formData.address && <span>Address: {formData.address}</span>}
                                                </p>

                                                <p>
                                                    <strong>Subject: Appointment for the Post of {formData.designation}</strong>
                                                </p>

                                                <p>
                                                    Dear <strong>{formData.candidateName || 'Candidate'}</strong>,
                                                </p>

                                                <p>
                                                    We are pleased to appoint you as <strong>{formData.designation}</strong> in <strong>{schoolInfo.name}</strong>, with effect from <strong>{new Date(formData.joiningDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</strong> on the following terms and conditions:
                                                </p>

                                                <ol style={{ paddingLeft: '1.25rem', margin: '0.75rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    <li>
                                                        <strong>Emoluments:</strong> You will be paid a monthly gross salary of <strong>PKR {formData.monthlySalary}/-</strong> (Inclusive of all allowances).
                                                    </li>
                                                    <li>
                                                        <strong>Probation Period:</strong> You will be on probation for a period of <strong>{formData.probationMonths}</strong>. Upon satisfactory performance, your appointment will be formally confirmed in writing.
                                                    </li>
                                                    <li>
                                                        <strong>Working Hours & Duties:</strong> Your official duty timings will be <strong>{formData.workingHours}</strong>. You shall faithfully perform all teaching, examination evaluation, lesson planning, and co-curricular duties assigned by the School Administration.
                                                    </li>
                                                    <li>
                                                        <strong>Code of Conduct:</strong> You are required to observe strict professional ethics, punctual attendance, respectful demeanor towards students, parents, and colleagues, and maintain total confidentiality of school examination records.
                                                    </li>
                                                    <li>
                                                        <strong>Termination / Resignation:</strong> During or after probation, either party may terminate this contract by giving <strong>{formData.noticePeriod}</strong>.
                                                    </li>
                                                </ol>

                                                <p style={{ marginTop: '1rem' }}>
                                                    We welcome you to our academic team and look forward to your sincere dedication towards shaping the future of our students.
                                                </p>
                                            </div>
                                        )}

                                        {/* ------------------------------------------------------------- */}
                                        {/* TEMPLATE 2: EXPERIENCE CERTIFICATE */}
                                        {/* ------------------------------------------------------------- */}
                                        {docType === 'experience' && (
                                            <div style={{ fontSize: '0.94rem', color: '#1e293b', textAlign: 'justify', lineHeight: 1.8 }}>
                                                <p style={{ marginTop: '1.5rem' }}>
                                                    This is to solemnly certify that <strong>{formData.candidateName || '[Staff Name]'}</strong>
                                                    {formData.fatherName && ` S/O, D/O, W/O ${formData.fatherName}`},
                                                    {formData.cnic && ` holding CNIC No. ${formData.cnic}`},
                                                    has served as <strong>{formData.designation}</strong> in <strong>{schoolInfo.name}</strong> from <strong>{formData.tenureFrom}</strong> to <strong>{formData.tenureTo}</strong>.
                                                </p>

                                                <p style={{ marginTop: '1rem' }}>
                                                    During their tenure with our institution, we found them to be highly dedicated, hardworking, punctual, and intellectually proficient in their subject domain. They maintained excellent classroom discipline, demonstrated great empathy towards students, and actively participated in all school co-curricular activities.
                                                </p>

                                                <p style={{ marginTop: '1rem' }}>
                                                    Their conduct and moral character remained exemplary throughout their service period. They are leaving the institution upon their own request for better career prospects, and we have no objection whatsoever to their seeking employment elsewhere.
                                                </p>

                                                <p style={{ marginTop: '1.25rem', fontStyle: 'italic' }}>
                                                    We wholeheartedly appreciate their valuable services to the institution and wish them the very best in all their future personal and professional endeavors.
                                                </p>
                                            </div>
                                        )}

                                        {/* ------------------------------------------------------------- */}
                                        {/* TEMPLATE 3: JOB OFFER LETTER */}
                                        {/* ------------------------------------------------------------- */}
                                        {docType === 'job_offer' && (
                                            <div style={{ fontSize: '0.92rem', color: '#1e293b', textAlign: 'justify' }}>
                                                <p style={{ margin: '0 0 1rem 0' }}>
                                                    To,<br />
                                                    <strong>{formData.candidateName || '[Candidate Name]'}</strong><br />
                                                    {formData.phone && <span>Contact: {formData.phone}<br /></span>}
                                                    {formData.email && <span>Email: {formData.email}</span>}
                                                </p>

                                                <p>
                                                    <strong>Subject: Offer of Employment - {formData.designation}</strong>
                                                </p>

                                                <p>
                                                    Dear <strong>{formData.candidateName || 'Candidate'}</strong>,
                                                </p>

                                                <p>
                                                    Following your interview and demonstration, we are delighted to offer you the position of <strong>{formData.designation}</strong> at <strong>{schoolInfo.name}</strong>.
                                                </p>

                                                <p>
                                                    Your proposed monthly salary package will be <strong>PKR {formData.monthlySalary}/-</strong> per month. Your expected date of joining will be <strong>{new Date(formData.joiningDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>.
                                                </p>

                                                <p>
                                                    Please sign and return the duplicate copy of this offer letter within 3 days as an acknowledgment of your acceptance, failing which this offer shall stand revoked.
                                                </p>

                                                <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '0.85rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                    <strong>Candidate Acceptance:</strong><br />
                                                    I hereby accept the employment offer on the terms and conditions outlined above.<br /><br />
                                                    Candidate Signature: _______________________ Date: ___________________
                                                </div>
                                            </div>
                                        )}

                                        {/* ------------------------------------------------------------- */}
                                        {/* TEMPLATE 4: RELIEVING & CLEARANCE CERTIFICATE (NOC) */}
                                        {/* ------------------------------------------------------------- */}
                                        {docType === 'relieving_noc' && (
                                            <div style={{ fontSize: '0.94rem', color: '#1e293b', textAlign: 'justify', lineHeight: 1.8 }}>
                                                <p style={{ marginTop: '1.5rem' }}>
                                                    This is to certify that <strong>{formData.candidateName || '[Staff Name]'}</strong>
                                                    {formData.fatherName && ` S/O, D/O, W/O ${formData.fatherName}`},
                                                    {formData.cnic && ` CNIC: ${formData.cnic}`},
                                                    employed as <strong>{formData.designation}</strong> at <strong>{schoolInfo.name}</strong>, has been formally relieved of their duties with effect from the close of business hours on <strong>{formData.tenureTo}</strong>.
                                                </p>

                                                <p style={{ marginTop: '1rem' }}>
                                                    All administrative handovers, including syllabus logbooks, student examination records, school property, and keys, have been duly completed. There are no outstanding financial or inventory dues against them.
                                                </p>

                                                <p style={{ marginTop: '1rem' }}>
                                                    This institution holds <strong>No Objection (NOC)</strong> for their employment in any other public or private educational institution or organization.
                                                </p>

                                                <p style={{ marginTop: '1.25rem' }}>
                                                    We thank them for their contributions and wish them continued success in their career.
                                                </p>
                                            </div>
                                        )}

                                        {/* ------------------------------------------------------------- */}
                                        {/* TEMPLATE 5: TEACHER APPRECIATION CERTIFICATE */}
                                        {/* ------------------------------------------------------------- */}
                                        {docType === 'appreciation' && (
                                            <div style={{ fontSize: '0.94rem', color: '#1e293b', textAlign: 'center', lineHeight: 1.9 }}>
                                                <div style={{ margin: '1.5rem 0', fontSize: '2.5rem' }}>🏆</div>
                                                <p style={{ fontSize: '1.15rem', fontStyle: 'italic', margin: '0 0 0.5rem 0' }}>
                                                    This certificate of excellence is proudly presented to
                                                </p>
                                                <h3 style={{ fontSize: '1.75rem', fontWeight: '900', color: '#0284c7', margin: '0.5rem 0', textDecoration: 'underline' }}>
                                                    {formData.candidateName || '[Teacher Name]'}
                                                </h3>
                                                <p style={{ fontSize: '1rem', fontWeight: '600', color: '#475569', margin: '0 0 1.25rem 0' }}>
                                                    {formData.designation}
                                                </p>

                                                <p style={{ textAlign: 'justify', margin: '1rem 0' }}>
                                                    In sincere recognition and appreciation of their <strong>{formData.appreciationReason}</strong>. Their tireless dedication, creative pedagogical techniques, and passionate commitment have brought immense honor and academic distinction to <strong>{schoolInfo.name}</strong>.
                                                </p>

                                                <p style={{ fontStyle: 'italic', color: '#059669', fontWeight: 'bold' }}>
                                                    "A great teacher inspires hope, ignites the imagination, and instills a love of learning."
                                                </p>
                                            </div>
                                        )}

                                        {/* ------------------------------------------------------------- */}
                                        {/* TEMPLATE 6: EMPLOYMENT VERIFICATION / BONAFIDE */}
                                        {/* ------------------------------------------------------------- */}
                                        {docType === 'bonafide' && (
                                            <div style={{ fontSize: '0.94rem', color: '#1e293b', textAlign: 'justify', lineHeight: 1.8 }}>
                                                <p style={{ marginTop: '1.5rem' }}>
                                                    This is to verify and certify that <strong>{formData.candidateName || '[Staff Name]'}</strong>
                                                    {formData.fatherName && ` S/O, D/O, W/O ${formData.fatherName}`},
                                                    {formData.cnic && ` holding CNIC No. ${formData.cnic}`},
                                                    is currently a bona fide permanent employee of <strong>{schoolInfo.name}</strong>, working as <strong>{formData.designation}</strong> since <strong>{new Date(formData.joiningDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>.
                                                </p>

                                                <p style={{ marginTop: '1rem' }}>
                                                    Their present monthly gross salary is <strong>PKR {formData.monthlySalary}/-</strong>.
                                                </p>

                                                <p style={{ marginTop: '1rem' }}>
                                                    This certificate is being issued at the specific request of the employee for the purpose of <strong>{formData.verificationPurpose}</strong> without any financial liability on part of the school administration.
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* BOTTOM SECTION: SIGNATURES & OFFICIAL STAMP */}
                                    <div style={{ marginTop: '3rem', paddingTop: '1.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontFamily: 'system-ui, sans-serif' }}>
                                            {/* Candidate / Employee Signature */}
                                            {docType === 'appointment' || docType === 'job_offer' ? (
                                                <div style={{ textAlign: 'center', width: '220px' }}>
                                                    <div style={{ borderBottom: '1.5px solid #0f172a', height: '40px', marginBottom: '0.35rem' }} />
                                                    <strong style={{ fontSize: '0.85rem', color: '#0f172a', display: 'block' }}>
                                                        {formData.candidateName || 'Employee Signature'}
                                                    </strong>
                                                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Appointee / Signature</span>
                                                </div>
                                            ) : (
                                                <div style={{ width: '200px' }}>
                                                    {/* Empty space for alignment */}
                                                </div>
                                            )}

                                            {/* Principal / Head Signature & Seal */}
                                            <div style={{ textAlign: 'center', width: '240px' }}>
                                                <div style={{
                                                    border: '1.5px dashed #94a3b8',
                                                    borderRadius: '8px',
                                                    height: '52px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '0.72rem',
                                                    color: '#94a3b8',
                                                    marginBottom: '0.35rem'
                                                }}>
                                                    [ Official School Seal / Stamp ]
                                                </div>
                                                <strong style={{ fontSize: '0.92rem', color: '#0f172a', display: 'block' }}>
                                                    {formData.signatoryName || schoolInfo.principalName}
                                                </strong>
                                                <span style={{ fontSize: '0.76rem', color: '#475569', fontWeight: '600' }}>
                                                    {formData.signatoryTitle}
                                                </span>
                                                <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>
                                                    {schoolInfo.name}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: ISSUED DOCUMENTS ARCHIVE */}
            {/* ========================================================================= */}
            {activeTab === 'archive' && (
                <div>
                    {/* Filter Bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative', width: '280px' }}>
                                <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder="Search by Teacher, Ref No, or CNIC..."
                                    value={archiveSearch}
                                    onChange={(e) => setArchiveSearch(e.target.value)}
                                    style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                />
                            </div>

                            <select
                                value={archiveTypeFilter}
                                onChange={(e) => setArchiveTypeFilter(e.target.value)}
                                style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                            >
                                <option value="All">All Document Types</option>
                                {DOCUMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                        </div>

                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                            Total Archived Documents: <strong>{issuedArchive.length}</strong>
                        </span>
                    </div>

                    {/* Archive Table */}
                    <div className="card" style={{ padding: '1.25rem', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', fontSize: '0.88rem', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                                        <th style={{ padding: '0.75rem 1rem' }}>Ref Number</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>Document Type</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>Teacher / Candidate</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>Designation</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>Issue Date</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {issuedArchive
                                        .filter(rec => {
                                            const matchesSearch = rec.candidateName?.toLowerCase().includes(archiveSearch.toLowerCase()) ||
                                                rec.refNo?.toLowerCase().includes(archiveSearch.toLowerCase()) ||
                                                rec.cnic?.includes(archiveSearch);
                                            const matchesType = archiveTypeFilter === 'All' || rec.docType === archiveTypeFilter;
                                            return matchesSearch && matchesType;
                                        })
                                        .map(rec => (
                                            <tr key={rec.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '0.85rem 1rem', fontWeight: '800', color: '#0284c7' }}>
                                                    {rec.refNo}
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem' }}>
                                                    <span style={{
                                                        padding: '0.2rem 0.6rem',
                                                        borderRadius: '6px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '700',
                                                        background: '#f1f5f9',
                                                        color: '#334155'
                                                    }}>
                                                        {rec.docTypeLabel || rec.docType}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', fontWeight: '700', color: '#0f172a' }}>
                                                    {rec.candidateName}
                                                    {rec.fatherName && <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', fontWeight: 'normal' }}>S/O, D/O: {rec.fatherName}</span>}
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', color: '#475569' }}>
                                                    {rec.designation}
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', color: '#64748b' }}>
                                                    {rec.issueDate}
                                                </td>
                                                <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem' }}>
                                                        <button
                                                            onClick={() => handleLoadArchivedDoc(rec)}
                                                            className="btn hover-lift"
                                                            style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700' }}
                                                        >
                                                            <Eye size={13} /> View / Re-Print
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteArchiveItem(rec.id)}
                                                            style={{ background: '#fee2e2', border: 'none', color: '#ef4444', padding: '0.35rem', borderRadius: '6px', cursor: 'pointer' }}
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}

                                    {issuedArchive.length === 0 && (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                                No HR documents saved in the archive yet. Generate and click "Save to Archive" in the Document Studio.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HRDocuments;
