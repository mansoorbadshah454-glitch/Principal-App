import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from '../firebase';
import { collection, getDocs, writeBatch, doc, serverTimestamp, increment, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Upload, FileUp, FileDown, CheckCircle, AlertCircle, Loader2, Users, ImageIcon, ArrowRight, SkipForward, XCircle } from 'lucide-react';

const BulkUploadCard = ({ schoolId }) => {
    const [loading, setLoading] = useState(false);
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState('');
    const [file, setFile] = useState(null);
    const [previewData, setPreviewData] = useState([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const fileInputRef = useRef(null);
    const imagesInputRef = useRef(null);

    // Wizard State
    const [step, setStep] = useState(1);
    const [recentlyAddedStudents, setRecentlyAddedStudents] = useState([]);
    const [matchedImages, setMatchedImages] = useState([]);
    const [unmatchedImages, setUnmatchedImages] = useState([]);
    const [imageUploadLoading, setImageUploadLoading] = useState(false);
    const [imageUploadProgress, setImageUploadProgress] = useState(0);

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
        const cleanLines = lines.filter(line => line.trim() !== '');

        if (cleanLines.length < 2) {
            setError("CSV file is empty or missing data.");
            return;
        }

        const headers = cleanLines[0].split(',').map(h => h.trim());
        const requiredHeaders = ["FirstName", "LastName"]; 
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

        if (missingHeaders.length > 0) {
            setError(`Missing required columns: ${missingHeaders.join(', ')}`);
            return;
        }

        const data = [];
        for (let i = 1; i < cleanLines.length; i++) {
            const obj = {};
            const currentline = cleanLines[i].split(',');

            for (let j = 0; j < headers.length; j++) {
                obj[headers[j]] = currentline[j]?.trim();
            }
            if (obj.FirstName && obj.LastName) {
                data.push(obj);
            }
        }
        setPreviewData(data);
    };

    // CSV Upload Logic
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
            const addedStudents = [];

            previewData.forEach((student) => {
                const newStudentRef = doc(collection(db, 'schools', schoolId, 'classes', selectedClass, 'students'));
                const studentId = newStudentRef.id;

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
                    parentDetails: null
                };

                batch.set(newStudentRef, studentData);

                const masterRef = doc(db, 'schools', schoolId, 'students', studentId);
                batch.set(masterRef, studentData);

                addedStudents.push(studentData);
                count++;
            });

            const classRef = doc(db, 'schools', schoolId, 'classes', selectedClass);
            batch.update(classRef, {
                students: increment(count)
            });

            await batch.commit();

            setSuccess(`Successfully uploaded ${count} students! Proceeding to Step 2...`);
            setRecentlyAddedStudents(addedStudents);
            
            setTimeout(() => {
                setStep(2);
                setSuccess('');
                setFile(null);
                setPreviewData([]);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }, 1500);

        } catch (err) {
            console.error("Batch upload failed:", err);
            setError("Upload failed. Please check the console for details.");
        } finally {
            setLoading(false);
        }
    };

    // --- STEP 2: IMAGE UPLOAD LOGIC ---

    const handleImageFilesChange = (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        let matched = [];
        let unmatched = [];

        files.forEach(file => {
            const fileNameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')).toLowerCase().trim();
            
            // Match by RollNo first, then by First_Last name
            const match = recentlyAddedStudents.find(s => 
                (s.rollNo && s.rollNo.toLowerCase().trim() === fileNameWithoutExt) ||
                (s.name && s.name.replace(/\s+/g, '_').toLowerCase() === fileNameWithoutExt)
            );

            const previewUrl = URL.createObjectURL(file);

            if (match) {
                // Ensure no double matching for the same student
                if (matched.some(m => m.student.id === match.id) || matchedImages.some(m => m.student.id === match.id)) {
                    unmatched.push({ file, previewUrl });
                } else {
                    matched.push({ student: match, file, previewUrl });
                }
            } else {
                unmatched.push({ file, previewUrl });
            }
        });

        setMatchedImages(prev => [...prev, ...matched]);
        setUnmatchedImages(prev => [...prev, ...unmatched]);
        if (imagesInputRef.current) imagesInputRef.current.value = '';
    };

    const removeMatchedImage = (index) => {
        const newMatched = [...matchedImages];
        URL.revokeObjectURL(newMatched[index].previewUrl);
        newMatched.splice(index, 1);
        setMatchedImages(newMatched);
    };

    const removeUnmatchedImage = (index) => {
        const newUnmatched = [...unmatchedImages];
        URL.revokeObjectURL(newUnmatched[index].previewUrl);
        newUnmatched.splice(index, 1);
        setUnmatchedImages(newUnmatched);
    };

    const handleImageUpload = async () => {
        if (matchedImages.length === 0) return;
        setImageUploadLoading(true);
        setError('');
        setImageUploadProgress(0);

        try {
            let successCount = 0;
            
            for (let i = 0; i < matchedImages.length; i++) {
                const { student, file } = matchedImages[i];
                const storageRef = ref(storage, `schools/${schoolId}/profile_images/students/${student.id}_${Date.now()}`);
                await uploadBytes(storageRef, file);
                const downloadURL = await getDownloadURL(storageRef);

                const classStudentRef = doc(db, 'schools', schoolId, 'classes', selectedClass, 'students', student.id);
                const masterStudentRef = doc(db, 'schools', schoolId, 'students', student.id);

                await updateDoc(classStudentRef, { profileImageUrl: downloadURL });
                await updateDoc(masterStudentRef, { profileImageUrl: downloadURL });

                successCount++;
                setImageUploadProgress(Math.round((successCount / matchedImages.length) * 100));
            }

            setSuccess(`Successfully uploaded ${successCount} profile images!`);
            setStep(3);
        } catch (err) {
            console.error("Image upload failed:", err);
            setError("Image upload failed. Please check the console.");
        } finally {
            setImageUploadLoading(false);
        }
    };

    const handleSkip = () => {
        setStep(3);
        setSuccess('Student import complete. Image upload skipped.');
    };

    const resetWizard = () => {
        setStep(1);
        setRecentlyAddedStudents([]);
        setMatchedImages([]);
        setUnmatchedImages([]);
        setSuccess('');
        setError('');
        setSelectedClass('');
    };

    return (
        <div className="card" style={{ height: 'fit-content', border: '1px solid #e2e8f0', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    <Users size={20} color="var(--primary)" />
                    Bulk Import Students
                </h2>
                
                {/* Wizard Steps Indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: '600', color: '#64748b' }}>
                    <span style={{ color: step >= 1 ? 'var(--primary)' : 'inherit' }}>1. Data</span>
                    <ArrowRight size={14} />
                    <span style={{ color: step >= 2 ? 'var(--primary)' : 'inherit' }}>2. Images</span>
                </div>
            </div>

            {/* Feedback Messages */}
            {error && (
                <div style={{ padding: '0.75rem', background: '#fef2f2', color: '#ef4444', borderRadius: '6px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {success && step !== 3 && (
                <div style={{ padding: '0.75rem', background: '#f0fdf4', color: '#16a34a', borderRadius: '6px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <CheckCircle size={16} /> {success}
                </div>
            )}

            {/* STEP 1: CSV UPLOAD */}
            {step === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.3s' }}>
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
                                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Roll No</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.slice(0, 50).map((row, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '0.5rem' }}>{row.FirstName}</td>
                                                <td style={{ padding: '0.5rem' }}>{row.LastName}</td>
                                                <td style={{ padding: '0.5rem' }}>{row.RollNo}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

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
                        {loading ? 'Uploading Data...' : 'Import Data'}
                    </button>
                </div>
            )}

            {/* STEP 2: IMAGE UPLOAD */}
            {step === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.3s' }}>
                    <div style={{ padding: '1rem', background: '#eff6ff', borderRadius: '8px', borderLeft: '4px solid #3b82f6', color: '#1e3a8a' }}>
                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ImageIcon size={18} /> Upload Profile Images
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.4' }}>
                            Select multiple image files to upload. For automatic matching, name the files using the student's <strong>Roll Number</strong> (e.g., <code style={{background: 'rgba(255,255,255,0.5)', padding: '2px 4px', borderRadius: '4px'}}>101.jpg</code>).
                        </p>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                            Select Images (Multiple allowed)
                        </label>
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            ref={imagesInputRef}
                            onChange={handleImageFilesChange}
                            style={{
                                width: '100%', padding: '0.75rem', borderRadius: '8px',
                                border: '1px dashed #cbd5e1', cursor: 'pointer',
                                background: '#f8fafc'
                            }}
                        />
                    </div>

                    {/* Matched Images Preview */}
                    {matchedImages.length > 0 && (
                        <div>
                            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <CheckCircle size={16} /> Auto-Matched ({matchedImages.length})
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem', maxHeight: '250px', overflowY: 'auto', padding: '0.5rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                {matchedImages.map((item, idx) => (
                                    <div key={idx} style={{ position: 'relative', background: 'white', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                                        <button onClick={() => removeMatchedImage(idx)} style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'white', border: 'none', borderRadius: '50%', padding: 0, cursor: 'pointer', color: '#ef4444' }}>
                                            <XCircle size={18} />
                                        </button>
                                        <img src={item.previewUrl} alt={item.student.name} style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 0.5rem auto', display: 'block', border: '2px solid #e2e8f0' }} />
                                        <div style={{ fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.student.name}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Roll: {item.student.rollNo}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Unmatched Images Preview */}
                    {unmatchedImages.length > 0 && (
                        <div>
                            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <AlertCircle size={16} /> Unmatched Files ({unmatchedImages.length})
                            </h4>
                            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0.5rem', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a' }}>
                                {unmatchedImages.map((item, idx) => (
                                    <div key={idx} style={{ position: 'relative', minWidth: '60px' }}>
                                        <button onClick={() => removeUnmatchedImage(idx)} style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'white', border: 'none', borderRadius: '50%', padding: 0, cursor: 'pointer', color: '#ef4444', zIndex: 10 }}>
                                            <XCircle size={14} />
                                        </button>
                                        <img src={item.previewUrl} alt="unmatched" style={{ width: '50px', height: '50px', borderRadius: '6px', objectFit: 'cover', opacity: 0.7 }} title={item.file.name} />
                                    </div>
                                ))}
                            </div>
                            <p style={{ fontSize: '0.75rem', color: '#92400e', margin: '0.25rem 0 0 0' }}>These files couldn't be auto-matched. Please rename them to match the exact Roll Number.</p>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button
                            onClick={handleSkip}
                            disabled={imageUploadLoading}
                            style={{
                                flex: 1, padding: '0.75rem', borderRadius: '8px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                fontSize: '0.95rem', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
                                cursor: 'pointer', fontWeight: '600'
                            }}
                        >
                            <SkipForward size={18} /> Skip Image Upload
                        </button>
                        
                        <button
                            onClick={handleImageUpload}
                            disabled={imageUploadLoading || matchedImages.length === 0}
                            className="btn-primary"
                            style={{
                                flex: 2, padding: '0.75rem', borderRadius: '8px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                fontSize: '0.95rem',
                                opacity: (imageUploadLoading || matchedImages.length === 0) ? 0.6 : 1,
                                cursor: (imageUploadLoading || matchedImages.length === 0) ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {imageUploadLoading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                            {imageUploadLoading ? `Uploading ${imageUploadProgress}%` : `Upload ${matchedImages.length} Images`}
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 3: DONE */}
            {step === 3 && (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', animation: 'fadeIn 0.3s' }}>
                    <div style={{ width: '64px', height: '64px', background: '#f0fdf4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                        <CheckCircle size={32} color="#16a34a" />
                    </div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.5rem' }}>Import Completed!</h3>
                    <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '2rem' }}>
                        {success || 'Students and images have been successfully imported.'}
                    </p>
                    
                    <button
                        onClick={resetWizard}
                        className="btn-primary"
                        style={{
                            padding: '0.75rem 2rem', borderRadius: '8px',
                            fontSize: '1rem', fontWeight: '600', border: 'none', cursor: 'pointer'
                        }}
                    >
                        Import Another Class
                    </button>
                </div>
            )}
        </div>
    );
};

export default BulkUploadCard;

