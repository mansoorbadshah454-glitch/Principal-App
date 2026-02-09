import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, getDocs, writeBatch, doc, serverTimestamp, increment } from 'firebase/firestore';
import { Upload, FileUp, FileDown, CheckCircle, AlertCircle, Loader2, Users } from 'lucide-react';

const BulkUploadCard = ({ schoolId }) => {
    const [loading, setLoading] = useState(false);
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState('');
    const [file, setFile] = useState(null);
    const [previewData, setPreviewData] = useState([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const fileInputRef = useRef(null);

    // Fetch Classes on Mount
    useEffect(() => {
        const fetchClasses = async () => {
            if (!schoolId) return;
            try {
                const querySnapshot = await getDocs(collection(db, 'schools', schoolId, 'classes'));
                const classesList = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setClasses(classesList);
            } catch (err) {
                console.error("Error fetching classes:", err);
                setError("Failed to load classes.");
            }
        };
        fetchClasses();
    }, [schoolId]);

    // Download Template
    const downloadTemplate = () => {
        const headers = ["FirstName", "LastName", "RollNo", "Gender", "DOB", "FatherName", "FatherPhone"];
        const rows = [
            ["John", "Doe", "101", "Male", "2015-01-01", "Robert Doe", "9876543210"],
            ["Jane", "Smith", "102", "Female", "2015-05-15", "Michael Smith", "9123456780"]
        ];

        let csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "student_upload_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // CSV Parsing
    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        setFile(selectedFile);
        setError('');
        setSuccess('');
        setPreviewData([]);

        if (!selectedFile) return;

        const reader = new FileReader();
        reader.onload = function (event) {
            const text = event.target.result;
            processCSV(text);
        };
        reader.readAsText(selectedFile);
    };

    const processCSV = (str) => {
        const lines = str.split('\n');
        // Remove empty lines
        const cleanLines = lines.filter(line => line.trim() !== '');

        if (cleanLines.length < 2) {
            setError("CSV file is empty or missing data.");
            return;
        }

        const headers = cleanLines[0].split(',').map(h => h.trim());
        const requiredHeaders = ["FirstName", "LastName"]; // Minimal check
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

        if (missingHeaders.length > 0) {
            setError(`Missing required columns: ${missingHeaders.join(', ')}`);
            return;
        }

        const data = [];
        for (let i = 1; i < cleanLines.length; i++) {
            const obj = {};
            const currentline = cleanLines[i].split(',');

            if (currentline.length !== headers.length) {
                // Skip malformed lines or handle leniently? 
                // For now, let's try to map what we can
            }

            for (let j = 0; j < headers.length; j++) {
                obj[headers[j]] = currentline[j]?.trim();
            }
            if (obj.FirstName && obj.LastName) {
                data.push(obj);
            }
        }
        setPreviewData(data);
    };

    // Upload Logic
    const handleUpload = async () => {
        if (!selectedClass) {
            setError("Please select a target class first.");
            return;
        }
        if (previewData.length === 0) {
            setError("No valid student data found in CSV.");
            return;
        }

        setLoading(true);
        setError('');

        try {
            const batch = writeBatch(db);
            const targetClass = classes.find(c => c.id === selectedClass);
            const className = targetClass ? targetClass.name : 'Unknown';

            let count = 0;

            previewData.forEach((student) => {
                const newStudentRef = doc(collection(db, 'schools', schoolId, 'classes', selectedClass, 'students'));
                const studentId = newStudentRef.id;

                // 1. Data Object
                const studentData = {
                    id: studentId,
                    firstName: student.FirstName || '',
                    lastName: student.LastName || '',
                    name: `${student.FirstName || ''} ${student.LastName || ''}`.trim(),
                    rollNo: student.RollNo || '',
                    gender: student.Gender || '',
                    dob: student.DOB || '',
                    fatherName: student.FatherName || '',
                    fatherPhone: student.FatherPhone || '',
                    className: className,
                    classId: selectedClass,
                    createdAt: serverTimestamp(),
                    parentDetails: null // Explicitly null as agreed
                };

                // 2. Add to Class Subcollection
                batch.set(newStudentRef, studentData);

                // 3. Add to Master Collection (for global searching)
                const masterRef = doc(db, 'schools', schoolId, 'students', studentId);
                batch.set(masterRef, studentData);

                count++;
            });

            // 4. Update Class Student Count
            const classRef = doc(db, 'schools', schoolId, 'classes', selectedClass);
            batch.update(classRef, {
                students: increment(count)
            });

            await batch.commit();

            setSuccess(`Successfully uploaded ${count} students to ${className}!`);
            setFile(null);
            setPreviewData([]);
            if (fileInputRef.current) fileInputRef.current.value = '';

        } catch (err) {
            console.error("Batch upload failed:", err);
            setError("Upload failed. Please check the console for details.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card" style={{ height: 'fit-content', border: '1px solid #e2e8f0' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={20} color="var(--primary)" />
                Bulk Import Students
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Step 1: Select Class */}
                <div>
                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                        1. Select Target Class <span style={{ color: 'red' }}>*</span>
                    </label>
                    <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        style={{
                            width: '100%', padding: '0.75rem', borderRadius: '8px',
                            border: '1px solid #cbd5e1', outline: 'none', fontSize: '1rem',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="">-- Select Class --</option>
                        {classes.map(cls => (
                            <option key={cls.id} value={cls.id}>{cls.name}</option>
                        ))}
                    </select>
                </div>

                {/* Step 2: Download Template */}
                <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>2. Prepare CSV</span>
                        <button
                            onClick={downloadTemplate}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                color: 'var(--primary)', fontSize: '0.85rem', fontWeight: '600',
                                background: 'transparent', border: 'none', cursor: 'pointer'
                            }}
                        >
                            <FileDown size={16} /> Download Template
                        </button>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        Download the template and fill in student details. Do not change the header names.
                    </p>
                </div>

                {/* Step 3: Upload & Preview */}
                <div>
                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                        3. Upload CSV
                    </label>
                    <div style={{ position: 'relative' }}>
                        <input
                            type="file"
                            accept=".csv"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            style={{
                                width: '100%', padding: '0.75rem', borderRadius: '8px',
                                border: '1px solid #cbd5e1', cursor: 'pointer',
                                background: 'white'
                            }}
                        />
                        <FileUp size={20} style={{ position: 'absolute', right: '10px', top: '10px', color: '#94a3b8', pointerEvents: 'none' }} />
                    </div>
                </div>

                {/* Feedback Messages */}
                {error && (
                    <div style={{ padding: '0.75rem', background: '#fef2f2', color: '#ef4444', borderRadius: '6px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                {success && (
                    <div style={{ padding: '0.75rem', background: '#f0fdf4', color: '#16a34a', borderRadius: '6px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <CheckCircle size={16} /> {success}
                    </div>
                )}

                {/* Preview Table */}
                {previewData.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>Preview ({previewData.length} students)</span>
                        </div>
                        <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0 }}>
                                    <tr>
                                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>First Name</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Last Name</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Gender</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Father Phone</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.slice(0, 50).map((row, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.5rem' }}>{row.FirstName}</td>
                                            <td style={{ padding: '0.5rem' }}>{row.LastName}</td>
                                            <td style={{ padding: '0.5rem' }}>{row.Gender}</td>
                                            <td style={{ padding: '0.5rem' }}>{row.FatherPhone}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {previewData.length > 50 && <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Showing first 50 rows only.</p>}
                    </div>
                )}

                {/* Action Button */}
                <button
                    onClick={handleUpload}
                    disabled={loading || previewData.length === 0 || !selectedClass}
                    className="btn-primary"
                    style={{
                        padding: '0.75rem', borderRadius: '8px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                        fontSize: '1rem', marginTop: '0.5rem',
                        opacity: (loading || previewData.length === 0 || !selectedClass) ? 0.6 : 1,
                        cursor: (loading || previewData.length === 0 || !selectedClass) ? 'not-allowed' : 'pointer'
                    }}
                >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
                    {loading ? 'Uploading...' : 'Start Import'}
                </button>
            </div>
        </div>
    );
};

export default BulkUploadCard;
