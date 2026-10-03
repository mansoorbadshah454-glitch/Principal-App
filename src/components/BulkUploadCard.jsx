import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, writeBatch, doc, serverTimestamp, increment } from 'firebase/firestore';
import { 
    Upload, FileUp, FileDown, CheckCircle, AlertCircle, Loader2, Users, 
    CheckCircle2, AlertTriangle, Sparkles, RefreshCw 
} from 'lucide-react';

// Header Synonyms Dictionary for flexible mapping of any CSV style
const COLUMN_SYNONYMS = {
    fullName: ['fullname', 'full_name', 'studentname', 'student_name', 'name', 'childname', 'student'],
    className: ['class', 'classname', 'class_name', 'grade', 'standard', 'currentclass'],
    section: ['section', 'sec', 'classsection', 'class_section'],
    rollNo: ['rollno', 'roll_no', 'roll', 'rollnumber', 'roll_number'],
    admissionNo: ['admissionno', 'admission_no', 'admissionnumber', 'admission', 'regno', 'reg_no', 'registrationno', 'registration_no', 'grno', 'gr_no'],
    fatherName: ['fathername', 'father_name', 'father', 'guardianname', 'guardian_name', 'parentname', 'parent_name'],
    fatherPhone: ['fatherphone', 'father_phone', 'phone', 'phonenumber', 'mobile', 'cell', 'contact', 'whatsapp', 'parentphone'],
    fatherCnic: ['fathercnic', 'father_cnic', 'cnic', 'nic', 'fathernic', 'father_nic', 'bform', 'b_form', 'idcard'],
    gender: ['gender', 'sex'],
    dob: ['dob', 'dateofbirth', 'date_of_birth', 'birthdate', 'birth_date'],
    admissionDate: ['admissiondate', 'admission_date', 'dateofadmission', 'date_of_admission', 'joiningdate', 'joining_date'],
    religion: ['religion', 'mazhab']
};

// Robust CSV Line Parser that handles quotes and commas inside cells
const parseCSVLine = (text) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            if (inQuotes && text[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            result.push(cur.trim());
            cur = '';
        } else {
            cur += c;
        }
    }
    result.push(cur.trim());
    return result;
};

// Clean string for fuzzy column & class comparison
const normalizeKey = (str) => {
    return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
};

const BulkUploadCard = ({ schoolId }) => {
    const [loading, setLoading] = useState(false);
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState('auto'); // 'auto' | classId
    const [file, setFile] = useState(null);
    const [previewData, setPreviewData] = useState([]);
    const [skippedRows, setSkippedRows] = useState([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [importCompleted, setImportCompleted] = useState(false);
    const [completedSummary, setCompletedSummary] = useState(null);
    const fileInputRef = useRef(null);

    // Fetch Classes on Mount
    useEffect(() => {
        const fetchClasses = async () => {
            if (!schoolId) return;
            try {
                const querySnapshot = await getDocs(collection(db, 'schools', schoolId, 'classes'));
                const classesList = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    name: doc.data().name || doc.data().className || doc.id,
                    ...doc.data()
                }));
                setClasses(classesList);
            } catch (err) {
                console.error("Error fetching classes:", err);
                setError("Failed to load classes from database.");
            }
        };
        fetchClasses();
    }, [schoolId]);

    // Download Template with full updated schema & multi-class sample data
    const downloadTemplate = () => {
        const headers = [
            "FullName",
            "Class",
            "Section",
            "RollNo",
            "AdmissionNo",
            "FatherName",
            "FatherPhone",
            "FatherCNIC",
            "Gender",
            "DOB",
            "AdmissionDate",
            "Religion"
        ];

        const rows = [
            ["Muhammad Ali Khan", "Class 5", "A", "101", "ADM-2026-001", "Tariq Khan", "03001234567", "35201-1234567-1", "Male", "2015-04-12", "2026-03-01", "Muslim"],
            ["Ayesha Fatima", "Class 5", "A", "102", "ADM-2026-002", "Usman Ahmed", "03219876543", "35202-7654321-2", "Female", "2015-08-20", "2026-03-01", "Muslim"],
            ["Hamza Bilal", "Class 1", "Green", "101", "ADM-2026-003", "Bilal Tariq", "03451122334", "35201-5544332-1", "Male", "2019-01-15", "2026-03-01", "Muslim"]
        ];

        const csvContent = "\uFEFF" + headers.join(",") + "\n"
            + rows.map(e => e.map(val => `"${val}"`).join(",")).join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "student_bulk_import_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // Helper: Match CSV class string to school's Firestore classes
    const matchClass = (rawClassStr) => {
        if (!rawClassStr && selectedClass !== 'auto') {
            const fallback = classes.find(c => c.id === selectedClass);
            if (fallback) return fallback;
        }

        const clean = normalizeKey(rawClassStr);
        if (!clean) {
            if (selectedClass !== 'auto') {
                return classes.find(c => c.id === selectedClass) || null;
            }
            return null;
        }

        // 1. Exact match (case-insensitive)
        let found = classes.find(c => (c.name || '').trim().toLowerCase() === rawClassStr.trim().toLowerCase());
        if (found) return found;

        // 2. Normalized alphanumeric match
        found = classes.find(c => normalizeKey(c.name) === clean);
        if (found) return found;

        // 3. Substring / digits match (e.g., "5" matches "Class 5" or "Grade 5")
        const digits = clean.replace(/[^0-9]/g, '');
        if (digits) {
            found = classes.find(c => {
                const cDigits = normalizeKey(c.name).replace(/[^0-9]/g, '');
                return cDigits === digits;
            });
            if (found) return found;
        }

        return null;
    };

    // CSV Parsing
    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        setFile(selectedFile);
        setError('');
        setSuccess('');
        setImportCompleted(false);
        setCompletedSummary(null);
        setPreviewData([]);
        setSkippedRows([]);

        if (!selectedFile) return;

        const reader = new FileReader();
        reader.onload = function (event) {
            const text = event.target.result;
            processCSV(text);
        };
        reader.readAsText(selectedFile);
    };

    const processCSV = (str) => {
        // Strip UTF-8 BOM if present
        const cleanStr = str.replace(/^\uFEFF/, '');
        const lines = cleanStr.split(/\r?\n/).filter(line => line.trim() !== '');

        if (lines.length < 2) {
            setError("CSV file is empty or missing data rows.");
            return;
        }

        const rawHeaders = parseCSVLine(lines[0]);
        
        // Map raw CSV header positions to our standard schema keys
        const headerIndexMap = {};
        rawHeaders.forEach((rawH, colIdx) => {
            const normalized = normalizeKey(rawH);
            for (const [fieldKey, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
                if (synonyms.some(syn => normalizeKey(syn) === normalized)) {
                    headerIndexMap[fieldKey] = colIdx;
                    break;
                }
            }
            // Any column not in our recognized dictionary is gracefully ignored!
        });

        // Verify required columns exist in CSV header
        const missingHeaders = [];
        if (headerIndexMap.fullName === undefined) missingHeaders.push("FullName / Student Name");
        if (headerIndexMap.rollNo === undefined) missingHeaders.push("RollNo / Roll #");
        if (headerIndexMap.admissionNo === undefined) missingHeaders.push("AdmissionNo / Reg No");
        if (headerIndexMap.className === undefined && selectedClass === 'auto') {
            missingHeaders.push("Class (or select target class from dropdown)");
        }

        if (missingHeaders.length > 0) {
            setError(`Missing required columns in CSV: ${missingHeaders.join(', ')}`);
            return;
        }

        const validList = [];
        const skippedList = [];

        for (let i = 1; i < lines.length; i++) {
            const currentLine = parseCSVLine(lines[i]);
            // Skip fully blank lines
            if (currentLine.every(cell => !cell || cell.trim() === '')) continue;

            const getValue = (fieldKey) => {
                const idx = headerIndexMap[fieldKey];
                return idx !== undefined ? (currentLine[idx] || '').trim() : '';
            };

            const fullName = getValue('fullName');
            const rollNo = getValue('rollNo');
            const admissionNo = getValue('admissionNo');
            const rawClass = getValue('className');
            const section = getValue('section');
            const fatherName = getValue('fatherName');
            const fatherPhone = getValue('fatherPhone');
            const fatherCnic = getValue('fatherCnic');
            const gender = getValue('gender');
            const dob = getValue('dob');
            const admissionDate = getValue('admissionDate');
            const religion = getValue('religion');

            // 1. Strict Validation: Required Fields
            const rowNumber = i + 1;
            if (!fullName) {
                skippedList.push({ rowNumber, reason: "Missing Student Full Name" });
                continue;
            }
            if (!rollNo) {
                skippedList.push({ rowNumber, name: fullName, reason: "Missing Roll Number" });
                continue;
            }
            if (!admissionNo) {
                skippedList.push({ rowNumber, name: fullName, reason: "Missing Admission Number" });
                continue;
            }

            // 2. Class Resolution
            const matchedCls = matchClass(rawClass);
            if (!matchedCls) {
                skippedList.push({
                    rowNumber,
                    name: fullName,
                    reason: rawClass 
                        ? `Class "${rawClass}" does not exist in school. Please create it first.` 
                        : "No Class specified for this row."
                });
                continue;
            }

            // 3. Graceful handling of optional fields
            validList.push({
                rowNumber,
                fullName,
                rollNo,
                admissionNo,
                classId: matchedCls.id,
                className: matchedCls.name || rawClass,
                section: section || '',
                fatherName: fatherName || '',
                fatherPhone: fatherPhone || '',
                fatherCnic: fatherCnic || '',
                gender: gender || '',
                dob: dob || '',
                admissionDate: admissionDate || '',
                religion: religion || ''
            });
        }

        setPreviewData(validList);
        setSkippedRows(skippedList);

        if (validList.length === 0) {
            setError("No valid student records found. Please check skipped row notices below.");
        }
    };

    // Grouping of valid preview data by class for visual transparency
    const classBreakdown = useMemo(() => {
        const counts = {};
        previewData.forEach(st => {
            const key = st.className || 'Unknown';
            counts[key] = (counts[key] || 0) + 1;
        });
        return counts;
    }, [previewData]);

    // CSV Upload Logic (Chunked Batch Writes for 1000% Firestore Safety)
    const handleUpload = async () => {
        if (previewData.length === 0) {
            setError("No valid student data found in CSV to import.");
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Group students by classId to accurately update class counters
            const studentsByClass = {};
            previewData.forEach(st => {
                if (!studentsByClass[st.classId]) {
                    studentsByClass[st.classId] = [];
                }
                studentsByClass[st.classId].push(st);
            });

            const addedStudents = [];
            const BATCH_SIZE = 200; // Defensively stay well below Firestore's 500-write limit
            let currentBatch = writeBatch(db);
            let opCount = 0;

            for (const student of previewData) {
                const classStudentRef = doc(collection(db, 'schools', schoolId, 'classes', student.classId, 'students'));
                const studentId = classStudentRef.id;

                // Split FullName into firstName and lastName for backward compatibility
                const nameParts = (student.fullName || '').trim().split(/\s+/);
                const firstName = nameParts[0] || '';
                const lastName = nameParts.slice(1).join(' ') || '';

                const studentData = {
                    id: studentId,
                    name: student.fullName,
                    firstName: firstName,
                    lastName: lastName,
                    rollNo: student.rollNo,
                    admissionNo: student.admissionNo,
                    registrationNo: student.admissionNo, // Unified with registrationNo
                    section: student.section,
                    gender: student.gender,
                    dob: student.dob,
                    admissionDate: student.admissionDate,
                    religion: student.religion,
                    fatherName: student.fatherName,
                    fatherPhone: student.fatherPhone,
                    fatherCnic: student.fatherCnic,
                    className: student.className,
                    classId: student.classId,
                    createdAt: serverTimestamp(),
                    parentDetails: {
                        fatherName: student.fatherName,
                        phone: student.fatherPhone,
                        fatherCnic: student.fatherCnic,
                        address: '',
                        occupation: '',
                        emergencyPhone: ''
                    }
                };

                // 1. Write to target class subcollection
                currentBatch.set(classStudentRef, studentData);
                opCount++;

                // 2. Write to master students collection
                const masterRef = doc(db, 'schools', schoolId, 'students', studentId);
                currentBatch.set(masterRef, studentData);
                opCount++;

                addedStudents.push(studentData);

                if (opCount >= BATCH_SIZE) {
                    await currentBatch.commit();
                    currentBatch = writeBatch(db);
                    opCount = 0;
                }
            }

            // 3. Update student count on each affected class
            for (const [clsId, list] of Object.entries(studentsByClass)) {
                const classRef = doc(db, 'schools', schoolId, 'classes', clsId);
                currentBatch.update(classRef, {
                    students: increment(list.length)
                });
                opCount++;

                if (opCount >= BATCH_SIZE) {
                    await currentBatch.commit();
                    currentBatch = writeBatch(db);
                    opCount = 0;
                }
            }

            // Final batch commit if remaining
            if (opCount > 0) {
                await currentBatch.commit();
            }

            const totalUploaded = addedStudents.length;
            const classCount = Object.keys(studentsByClass).length;
            
            setCompletedSummary({
                total: totalUploaded,
                classCount: classCount,
                breakdown: Object.entries(studentsByClass).map(([cid, list]) => ({
                    className: list[0]?.className || 'Class',
                    count: list.length
                }))
            });
            setImportCompleted(true);
            setSuccess(`Successfully imported ${totalUploaded} student${totalUploaded !== 1 ? 's' : ''} across ${classCount} class${classCount !== 1 ? 'es' : ''}!`);
            setFile(null);
            setPreviewData([]);
            setSkippedRows([]);
            if (fileInputRef.current) fileInputRef.current.value = '';

        } catch (err) {
            console.error("Batch upload failed:", err);
            setError("Upload failed: " + (err.message || "Please check browser console."));
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setImportCompleted(false);
        setCompletedSummary(null);
        setSuccess('');
        setError('');
        setFile(null);
        setPreviewData([]);
        setSkippedRows([]);
        setSelectedClass('auto');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="card" style={{ height: 'fit-content', border: '1px solid #e2e8f0', position: 'relative', borderRadius: '16px', background: '#ffffff', padding: '1.75rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, color: '#0f172a' }}>
                        <Users size={24} color="var(--primary)" />
                        Bulk Import Students
                    </h2>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                        Upload students for single or multiple classes in one CSV file. Multi-class files are automatically routed.
                    </p>
                </div>
            </div>

            {/* Feedback Messages */}
            {error && (
                <div style={{ padding: '0.85rem 1rem', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '10px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
                    <AlertCircle size={18} /> {error}
                </div>
            )}

            {/* SUCCESS / COMPLETION VIEW */}
            {importCompleted && completedSummary && (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', animation: 'fadeIn 0.3s' }}>
                    <div style={{ width: '70px', height: '70px', background: '#f0fdf4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto' }}>
                        <CheckCircle size={38} color="#16a34a" />
                    </div>
                    <h3 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.5rem' }}>
                        Import Successfully Completed!
                    </h3>
                    <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
                        Successfully imported <strong>{completedSummary.total} students</strong> across <strong>{completedSummary.classCount} classes</strong> into the system.
                    </p>

                    {/* Breakdown Badges */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem', marginBottom: '2rem', maxWidth: '550px', margin: '0 auto 2rem auto' }}>
                        {completedSummary.breakdown.map((item, idx) => (
                            <span key={idx} style={{ 
                                padding: '0.35rem 0.75rem', borderRadius: '8px', 
                                background: '#f0fdf4', border: '1px solid #bbf7d0', 
                                fontSize: '0.85rem', fontWeight: '700', color: '#15803d' 
                            }}>
                                {item.className}: <strong>{item.count} students</strong>
                            </span>
                        ))}
                    </div>

                    <button
                        onClick={resetForm}
                        className="btn-primary"
                        style={{
                            padding: '0.85rem 2rem', borderRadius: '10px',
                            fontSize: '1rem', fontWeight: '700', border: 'none', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                        }}
                    >
                        <RefreshCw size={18} /> Import Another CSV File
                    </button>
                </div>
            )}

            {/* CSV UPLOAD FORM */}
            {!importCompleted && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.3s' }}>
                    
                    {/* Class Mode Selector */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                            <label style={{ fontSize: '0.88rem', fontWeight: '700', color: '#334155' }}>
                                1. Target Class Mode <span style={{ color: '#6366f1' }}>(Smart Multi-Class)</span>
                            </label>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                Leave as Auto-detect if CSV contains a "Class" column
                            </span>
                        </div>
                        <select
                            value={selectedClass}
                            onChange={(e) => setSelectedClass(e.target.value)}
                            style={{
                                width: '100%', padding: '0.75rem 1rem', borderRadius: '10px',
                                border: '1.5px solid #cbd5e1', outline: 'none', fontSize: '0.95rem',
                                cursor: 'pointer', background: '#f8fafc', fontWeight: '600', color: '#1e293b'
                            }}
                        >
                            <option value="auto">✨ Auto-Detect From CSV (Recommended for Mixed Classes)</option>
                            {classes.map(cls => (
                                <option key={cls.id} value={cls.id}>Specific Class: {cls.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Template Downloader Card */}
                    <div style={{ padding: '1.25rem', background: 'linear-gradient(to right, #f8fafc, #f1f5f9)', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FileDown size={18} color="var(--primary)" />
                                <span style={{ fontWeight: '700', fontSize: '0.95rem', color: '#1e293b' }}>
                                    2. Download Updated Student Import Template
                                </span>
                            </div>
                            <button
                                onClick={downloadTemplate}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    color: '#4338ca', fontSize: '0.85rem', fontWeight: '700',
                                    background: '#e0e7ff', border: 'none', cursor: 'pointer',
                                    padding: '0.45rem 0.9rem', borderRadius: '8px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <FileDown size={15} /> Download CSV Template
                            </button>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0, lineHeight: '1.5' }}>
                            Template includes: <strong>FullName, Class, Section, RollNo, AdmissionNo, FatherName, FatherPhone, FatherCNIC, Gender, DOB, AdmissionDate, Religion</strong>. Extra columns in your CSV are safely ignored.
                        </p>
                    </div>

                    {/* File Upload Input */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: '700', color: '#334155', marginBottom: '0.4rem' }}>
                            3. Select CSV File
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="file"
                                accept=".csv"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                style={{
                                    width: '100%', padding: '0.75rem', borderRadius: '10px',
                                    border: '1.5px solid #cbd5e1', cursor: 'pointer',
                                    background: 'white', fontSize: '0.9rem'
                                }}
                            />
                            <FileUp size={20} style={{ position: 'absolute', right: '14px', top: '12px', color: '#94a3b8', pointerEvents: 'none' }} />
                        </div>
                    </div>

                    {/* Multi-Class Breakdown Badges */}
                    {Object.keys(classBreakdown).length > 0 && (
                        <div style={{ padding: '1rem', background: '#eef2ff', borderRadius: '10px', border: '1px solid #c7d2fe' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <Sparkles size={16} color="#4f46e5" />
                                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#312e81' }}>
                                    Detected Classes ({Object.keys(classBreakdown).length}) & Student Distribution:
                                </span>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {Object.entries(classBreakdown).map(([cName, count]) => (
                                    <span key={cName} style={{ 
                                        padding: '0.25rem 0.65rem', borderRadius: '6px', 
                                        background: '#ffffff', border: '1px solid #a5b4fc', 
                                        fontSize: '0.8rem', fontWeight: '700', color: '#4338ca' 
                                    }}>
                                        {cName}: <strong>{count} students</strong>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Skipped / Incomplete Rows Alert */}
                    {skippedRows.length > 0 && (
                        <div style={{ padding: '0.85rem 1rem', background: '#fffbeb', borderRadius: '10px', border: '1px solid #fde68a' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#b45309', fontWeight: '700', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                                <AlertTriangle size={16} /> {skippedRows.length} Row(s) Skipped (Missing Required Fields or Invalid Class)
                            </div>
                            <div style={{ maxHeight: '90px', overflowY: 'auto', fontSize: '0.75rem', color: '#92400e' }}>
                                {skippedRows.slice(0, 10).map((r, idx) => (
                                    <div key={idx} style={{ padding: '2px 0' }}>
                                        • Row {r.rowNumber}{r.name ? ` (${r.name})` : ''}: {r.reason}
                                    </div>
                                ))}
                                {skippedRows.length > 10 && <div>... and {skippedRows.length - 10} more rows</div>}
                            </div>
                        </div>
                    )}

                    {/* Preview Table */}
                    {previewData.length > 0 && (
                        <div style={{ marginTop: '0.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b' }}>
                                    Preview Valid Records ({previewData.length} students ready to import)
                                </span>
                            </div>
                            <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1, borderBottom: '1.5px solid #e2e8f0' }}>
                                        <tr>
                                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '700', color: '#475569' }}>Student Name</th>
                                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '700', color: '#475569' }}>Class</th>
                                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '700', color: '#475569' }}>Sec</th>
                                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '700', color: '#475569' }}>Roll #</th>
                                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '700', color: '#475569' }}>Adm #</th>
                                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '700', color: '#475569' }}>Father Name</th>
                                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '700', color: '#475569' }}>Father CNIC</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.slice(0, 100).map((row, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fcfcfd' }}>
                                                <td style={{ padding: '0.5rem 0.75rem', fontWeight: '700', color: '#0f172a' }}>{row.fullName}</td>
                                                <td style={{ padding: '0.5rem 0.75rem', color: '#4338ca', fontWeight: '600' }}>{row.className}</td>
                                                <td style={{ padding: '0.5rem 0.75rem', color: '#64748b' }}>{row.section || '--'}</td>
                                                <td style={{ padding: '0.5rem 0.75rem', fontWeight: '600' }}>{row.rollNo}</td>
                                                <td style={{ padding: '0.5rem 0.75rem', color: '#059669', fontWeight: '600' }}>{row.admissionNo}</td>
                                                <td style={{ padding: '0.5rem 0.75rem', color: '#475569' }}>{row.fatherName || '--'}</td>
                                                <td style={{ padding: '0.5rem 0.75rem', color: '#64748b', fontSize: '0.75rem' }}>{row.fatherCnic || '--'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={handleUpload}
                        disabled={loading || previewData.length === 0}
                        className="btn-primary"
                        style={{
                            padding: '0.85rem 1.5rem', borderRadius: '10px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                            fontSize: '1rem', fontWeight: '700', marginTop: '0.5rem',
                            opacity: (loading || previewData.length === 0) ? 0.6 : 1,
                            cursor: (loading || previewData.length === 0) ? 'not-allowed' : 'pointer',
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                        }}
                    >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
                        {loading ? 'Importing Students...' : `Confirm & Import ${previewData.length} Students`}
                    </button>
                </div>
            )}
        </div>
    );
};

export default BulkUploadCard;
