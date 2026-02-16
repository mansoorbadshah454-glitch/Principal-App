import React, { useState, useEffect } from 'react';
import {
    Users, Search, ArrowRight, CheckCircle, XCircle, ChevronRight, AlertCircle,
    Loader2, GraduationCap, X
} from 'lucide-react';
import { db, auth } from '../firebase';
import {
    collection, getDocs, doc, writeBatch, getDoc,
    query, orderBy, addDoc, getCountFromServer
} from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Promotions = () => {
    const [schoolId, setSchoolId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [studentSearchQuery, setStudentSearchQuery] = useState('');
    const [processing, setProcessing] = useState(false);
    const [promotionStatus, setPromotionStatus] = useState(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmLevel, setConfirmLevel] = useState(1); // 1 or 2 for dual confirmation
    const [schoolDetails, setSchoolDetails] = useState({ name: '', logo: '' });


    // Helper: Class Sorting order
    const getClassOrder = (name) => {
        if (!name || typeof name !== 'string') return 0;
        const lower = name.toLowerCase();
        if (lower.includes('nursery')) return -2;
        if (lower.includes('prep')) return -1;
        return parseInt(name.replace(/\D/g, '')) || 0;
    };

    // 1. Init User & Global Safety Timeout
    useEffect(() => {
        // Global Safety Timeout - Force stop loading after 8 seconds no matter what
        const globalTimeout = setTimeout(() => {
            if (loading) {
                console.warn("Global timeout triggered - forcing render");
                setLoading(false);
            }
        }, 8000);

        const fetchUser = () => {
            try {
                const manualSession = localStorage.getItem('manual_session');
                if (manualSession) {
                    const userData = JSON.parse(manualSession);
                    if (userData.schoolId) {
                        setSchoolId(userData.schoolId);
                        // Fetch School Details for PDF
                        fetchSchoolDetails(userData.schoolId);
                    } else {
                        console.error("No schoolId in manual session");
                        setLoading(false);
                    }
                } else if (auth.currentUser) {
                    // Fallback: If auth exists but no manual session
                    // We need to fetch schoolId from claims or profile but for now just log warning
                    console.warn("Auth exists but no manual session found");
                    setLoading(false);
                } else {
                    setLoading(false);
                }
            } catch (e) {
                console.error("Auth check failed", e);
                setLoading(false);
            }
        };
        fetchUser();

        return () => clearTimeout(globalTimeout);
    }, []);

    // 1.5 Fetch School Details
    const fetchSchoolDetails = async (id) => {
        try {
            const docRef = doc(db, `schools/${id}/settings`, 'profile');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setSchoolDetails({
                    name: data.name || 'School Name',
                    logo: data.profileImage || ''
                });
            }
        } catch (e) {
            console.error("Error fetching school details:", e);
        }
    };


    // 2. Fetch Classes
    const fetchClasses = async () => {
        if (!schoolId) return;
        try {
            const q = query(collection(db, `schools/${schoolId}/classes`));
            const snapshot = await getDocs(q);

            // Fetch real student counts for each class
            const classesData = await Promise.all(snapshot.docs.map(async (docSnap) => {
                const classId = docSnap.id;
                const studentsRef = collection(db, `schools/${schoolId}/classes/${classId}/students`);
                const countSnapshot = await getCountFromServer(studentsRef);
                return {
                    id: classId,
                    ...docSnap.data(),
                    students: countSnapshot.data().count
                };
            }));

            classesData.sort((a, b) => getClassOrder(a.name) - getClassOrder(b.name));
            setClasses(classesData);
            setLoading(false);
        } catch (error) {
            console.error("Error fetching classes:", error);
            setLoading(false);
        }
    };

    useEffect(() => {
        if (schoolId) {
            fetchClasses();

            // Safety Timeout
            const timeout = setTimeout(() => {
                if (loading) {
                    console.warn("Loading classes timed out.");
                    setLoading(false);
                }
            }, 5000);
            return () => clearTimeout(timeout);
        }
    }, [schoolId]);

    // 3. Handle Class Selection
    const handleClassSelect = async (cls) => {
        if (selectedClass?.id === cls.id) return;
        setSelectedClass(cls);
        setStudents([]);
        setSearchQuery('');
        setLoadingStudents(true);
        setPromotionStatus(null);

        try {
            const studentsRef = collection(db, `schools/${schoolId}/classes/${cls.id}/students`);
            const snapshot = await getDocs(studentsRef);

            const currentIndex = classes.findIndex(c => c.id === cls.id);
            const nextClass = classes[currentIndex + 1] || null;
            const previousClass = classes[currentIndex - 1] || null;

            const fetchedStudents = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                promotionStatus: 'promote',
                examScore: '',
                result: 'pass', // Default to pass
                nextClassId: nextClass ? nextClass.id : 'graduate',
                nextClassName: nextClass ? nextClass.name : 'Graduated',
                previousClassId: previousClass ? previousClass.id : null,
                previousClassName: previousClass ? previousClass.name : 'None'
            }));
            setStudents(fetchedStudents);
        } catch (error) {
            console.error("Error fetching students:", error);
        } finally {
            setLoadingStudents(false);
        }
    };

    const handleIndividualAction = (studentId, action) => {
        setStudents(prev => prev.map(s =>
            s.id === studentId ? { ...s, promotionStatus: action } : s
        ));
    };

    const handleScoreChange = (studentId, score) => {
        const numericScore = parseFloat(score);
        setStudents(prev => prev.map(s => {
            if (s.id === studentId) {
                let result = s.result;
                if (!isNaN(numericScore)) {
                    result = numericScore >= 33 ? 'pass' : 'fail';
                }
                return { ...s, examScore: score, result };
            }
            return s;
        }));
    };

    const handleResultToggle = (studentId, result) => {
        setStudents(prev => prev.map(s =>
            s.id === studentId ? { ...s, result } : s
        ));
    };

    const setAllStatus = (status) => {
        setStudents(prev => prev.map(s => ({ ...s, promotionStatus: status })));
    };

    const filteredStudents = students.filter(s =>
        s.name?.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
        s.rollNo?.toString().includes(studentSearchQuery)
    );

    const classColors = {
        'nursery': '#F43F5E',
        'prep': '#F59E0B',
        '1': '#10B981',
        '2': '#3B82F6',
        '3': '#8B5CF6',
        '4': '#EC4899',
        '5': '#06B6D4',
        '6': '#6366F1',
        '7': '#84CC16',
        '8': '#D946EF',
        '9': '#F97316',
        '10': '#14B8A6'
    };

    const getClassColor = (name) => {
        const key = name.toLowerCase().replace('class ', '').trim();
        return classColors[key] || '#64748B';
    };

    const row1Classes = classes.filter(c => getClassOrder(c.name) <= 5);
    const row2Classes = classes.filter(c => getClassOrder(c.name) > 5);

    // 4. Process Promotions - SAFE CHUNKED VERSION
    const processPromotions = async () => {
        setShowConfirmModal(false);
        setProcessing(true);
        try {
            // Helper to commit batches in chunks
            const commitBatchChunks = async (operations, batchSize = 400) => {
                for (let i = 0; i < operations.length; i += batchSize) {
                    const batch = writeBatch(db);
                    const chunk = operations.slice(i, i + batchSize);
                    chunk.forEach(op => op(batch));
                    await batch.commit();
                    console.log(`Committed batch ${Math.floor(i / batchSize) + 1}`);
                }
            };

            // 1. Annual Purge: Delete all attendance history
            // We fetch and delete in chunks to avoid blowing up memory or batch limits
            console.log("Starting Attendance Purge...");
            const attendanceRef = collection(db, `schools/${schoolId}/attendance`);
            const attendanceSnap = await getDocs(attendanceRef);

            if (!attendanceSnap.empty) {
                const deleteOps = attendanceSnap.docs.map(docSnap => (batch) => {
                    batch.delete(docSnap.ref);
                });
                await commitBatchChunks(deleteOps, 400); // Safe limit
                console.log("Attendance Purge Complete");
            }

            // 2. Process Student Moves
            console.log("Starting Student Moves...");
            const moveOps = [];

            for (const student of students) {
                const status = student.promotionStatus || 'promote';
                const studentData = {
                    ...student,
                    examScore: student.examScore || 0,
                    result: student.result || 'pass',
                    status: null, // Reset daily attendance status
                    academicScores: [], // Clear school-year academic history
                    wellness: { behavior: null, health: null, hygiene: null }, // Reset health/behavior
                    homework: 0, // Reset homework percentage
                    attendance: { percentage: 0 }, // Reset historical attendance rate
                    updatedAt: new Date()
                };

                // Define operation based on status
                if (status === 'promote') {
                    if (student.nextClassId === 'graduate') {
                        moveOps.push((batch) => {
                            const alumniRef = doc(db, `schools/${schoolId}/alumni`, student.id);
                            batch.set(alumniRef, { ...studentData, graduatedAt: new Date(), previousClassId: selectedClass.id });
                            batch.delete(doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id));
                        });
                    } else if (student.nextClassId) {
                        moveOps.push((batch) => {
                            const nextClassRef = doc(db, `schools/${schoolId}/classes/${student.nextClassId}/students`, student.id);
                            batch.set(nextClassRef, { ...studentData, promotedAt: new Date(), previousClassId: selectedClass.id });
                            batch.delete(doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id));
                        });
                    }
                } else if (status === 'demote' && student.previousClassId) {
                    moveOps.push((batch) => {
                        const prevClassRef = doc(db, `schools/${schoolId}/classes/${student.previousClassId}/students`, student.id);
                        batch.set(prevClassRef, { ...studentData, demotedAt: new Date(), previousClassId: selectedClass.id });
                        batch.delete(doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id));
                    });
                } else if (status === 'leave') {
                    moveOps.push((batch) => {
                        batch.delete(doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id));
                        batch.delete(doc(db, `schools/${schoolId}/students`, student.id));
                    });
                } else {
                    // Retain
                    moveOps.push((batch) => {
                        const currentStudentRef = doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id);
                        batch.update(currentStudentRef, { ...studentData, retained: true, retainedAt: new Date() });
                    });
                }
            }

            if (moveOps.length > 0) {
                await commitBatchChunks(moveOps, 400); // Safe limit for moves
                console.log("Student Moves Complete");
            }

            setPromotionStatus('success');
            setSelectedClass(null);
            setStudents([]);
            // Refresh counts after processing
            fetchClasses();

        } catch (error) {
            console.error("Promotion failed:", error);
            setPromotionStatus('error');
        } finally {
            setProcessing(false);
        }
    };

    // 5. Generate PDF Report
    const generatePDF = async () => {
        if (!selectedClass || students.length === 0) return;

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // --- Helper: Load Image ---
        const loadImage = async (url) => {
            if (!url) return null;
            try {
                const response = await fetch(url);
                const blob = await response.blob();
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            } catch (error) {
                console.error("Error loading image:", error);
                return null;
            }
        };

        try {
            // 1. Header Section - Blue Background
            doc.setFillColor(30, 58, 138); // Blue-900 (Dark Blue)
            doc.rect(0, 0, pageWidth, 50, 'F');

            // Logo
            if (schoolDetails.logo) {
                try {
                    const imgData = await loadImage(schoolDetails.logo);
                    if (imgData) {
                        doc.addImage(imgData, 'PNG', 15, 12, 26, 26);
                    }
                } catch (e) {
                    console.error("Error adding logo to PDF", e);
                }
            }

            // School Name
            doc.setFontSize(22);
            doc.setTextColor(255, 255, 255); // White
            doc.setFont("helvetica", "bold");
            doc.text(schoolDetails.name.toUpperCase(), 50, 22);

            // Report Title
            doc.setFontSize(14);
            doc.setTextColor(203, 213, 225); // Slate-300
            doc.setFont("helvetica", "normal");
            doc.text("Annual Promotion Report", 50, 30);

            // Session
            doc.setFontSize(10);
            doc.setTextColor(148, 163, 184); // Slate-400
            doc.text("Academic Session: 2025 - 2026", 50, 36);

            // Class Info
            let yPos = 65; // Pushed down below header
            doc.setFontSize(12);
            doc.setTextColor(30, 41, 59); // Back to Dark Text
            doc.setFont("helvetica", "bold");
            doc.text(`Class: ${selectedClass.name}`, 15, yPos);

            doc.setFont("helvetica", "normal");
            doc.text(`Total Students: ${students.length}`, pageWidth - 15, yPos, { align: 'right' });

            if (selectedClass.teacher) {
                doc.text(`Class Teacher: ${selectedClass.teacher}`, 15, yPos + 6);
            }

            // 2. Table Data
            const tableColumn = ["Roll No", "Name", "Score", "Result", "Status", "Next Class"];
            const tableRows = [];

            students.forEach(student => {
                const status = student.promotionStatus || 'promote';
                let statusText = 'Promote';
                if (status === 'retain') statusText = 'Retain';
                if (status === 'demote') statusText = 'Demote';
                if (status === 'leave') statusText = 'Left School';

                let nextClassText = '-';
                if (status === 'promote') nextClassText = student.nextClassName || 'Graduated';
                if (status === 'demote') nextClassText = student.previousClassName || '-';
                if (status === 'retain') nextClassText = selectedClass.name;

                const rowData = [
                    student.rollNo || '-',
                    student.name,
                    student.examScore ? `${student.examScore}%` : '-',
                    (student.result || 'pass').toUpperCase(),
                    statusText.toUpperCase(),
                    nextClassText
                ];
                tableRows.push(rowData);
            });

            // 3. Generate Table
            autoTable(doc, {
                startY: yPos + 15,
                head: [tableColumn],
                body: tableRows,
                theme: 'grid',
                headStyles: {
                    fillColor: [79, 70, 229], // Indigo-600
                    textColor: 255,
                    fontSize: 10,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                bodyStyles: {
                    textColor: 50,
                    fontSize: 9,
                    halign: 'center'
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252] // Slate-50
                },
                columnStyles: {
                    1: { halign: 'left' } // Name left-aligned
                },
                margin: { top: 20 }
            });

            // Footer
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Generated on ${new Date().toLocaleDateString()}`, 15, doc.internal.pageSize.getHeight() - 10);
                doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() - 20, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
            }

            // Save PDF
            doc.save(`Promotion_Report_${selectedClass.name.replace(/\s+/g, '_')}_2025-26.pdf`);

        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("Failed to generate PDF. check console for details.");
        }
    };


    // --- RENDER ---
    if (loading) {
        return (
            <div style={{
                height: '80vh', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '20px'
            }}>
                <Loader2 size={48} className="animate-spin" color="var(--primary)" />
                <p style={{ fontWeight: '600', color: '#64748B' }}>Loading Annual Promotions...</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '30px', maxWidth: '1400px', margin: '0 auto' }} className="animate-fade-in-up">
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                marginBottom: '40px', background: 'white', padding: '25px', borderRadius: '20px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #F1F5F9'
            }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#1E293B', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <GraduationCap size={32} color="var(--primary)" />
                        Annual Promotions
                    </h1>
                    <p style={{ color: '#64748B', fontSize: '16px' }}>Verify academic results and promote students to the next grade.</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '5px' }}>Academic Session</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--primary)' }}>2025 - 2026</div>
                </div>
            </div>

            {/* Notification */}
            {promotionStatus && (
                <div style={{
                    padding: '15px 20px', borderRadius: '12px', marginBottom: '25px', display: 'flex',
                    alignItems: 'center', gap: '12px', animation: 'slideDown 0.3s ease-out',
                    background: promotionStatus === 'success' ? '#DCFCE7' : '#FEE2E2',
                    color: promotionStatus === 'success' ? '#15803D' : '#B91C1C',
                    border: `1px solid ${promotionStatus === 'success' ? '#BBF7D0' : '#FECACA'}`
                }}>
                    {promotionStatus === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    <span style={{ fontWeight: '600' }}>
                        {promotionStatus === 'success' ? 'Promotions processed successfully!' : 'Error processing promotions. Please try again.'}
                    </span>
                    <button onClick={() => setPromotionStatus(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
                        <X size={18} />
                    </button>
                </div>
            )}

            {/* Class Selection - Two Rows */}
            <div style={{ marginBottom: '40px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1E293B', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ChevronRight size={20} color="var(--primary)" />
                    Select Primary Department (Nursery - 5)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '15px', marginBottom: '30px' }}>
                    {row1Classes.map(cls => (
                        <div
                            key={cls.id}
                            onClick={() => handleClassSelect(cls)}
                            style={{
                                padding: '20px', borderRadius: '16px', cursor: 'pointer', transition: 'all 0.3s',
                                background: getClassColor(cls.name), color: 'white',
                                border: selectedClass?.id === cls.id ? '4px solid white' : 'none',
                                boxShadow: selectedClass?.id === cls.id ? '0 0 0 2px var(--primary), 0 10px 15px rgba(0,0,0,0.1)' : '0 4px 6px rgba(0,0,0,0.05)',
                                transform: selectedClass?.id === cls.id ? 'translateY(-5px)' : 'none',
                                position: 'relative'
                            }}
                        >
                            <div style={{ fontSize: '14px', fontWeight: '500', opacity: 0.9, marginBottom: '4px' }}>Class</div>
                            <div style={{ fontSize: '22px', fontWeight: '800' }}>{cls.name}</div>
                            <div style={{ fontSize: '12px', marginTop: '10px', opacity: 0.8 }}>{cls.students || 0} Students</div>
                            {selectedClass?.id === cls.id && (
                                <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                                    <CheckCircle size={18} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1E293B', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ChevronRight size={20} color="var(--primary)" />
                    Secondary & High School (6 - 10)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '15px' }}>
                    {row2Classes.map(cls => (
                        <div
                            key={cls.id}
                            onClick={() => handleClassSelect(cls)}
                            style={{
                                padding: '20px', borderRadius: '16px', cursor: 'pointer', transition: 'all 0.3s',
                                background: getClassColor(cls.name), color: 'white',
                                border: selectedClass?.id === cls.id ? '4px solid white' : 'none',
                                boxShadow: selectedClass?.id === cls.id ? '0 0 0 2px var(--primary), 0 10px 15px rgba(0,0,0,0.1)' : '0 4px 6px rgba(0,0,0,0.05)',
                                transform: selectedClass?.id === cls.id ? 'translateY(-5px)' : 'none',
                                position: 'relative'
                            }}
                        >
                            <div style={{ fontSize: '14px', fontWeight: '500', opacity: 0.9, marginBottom: '4px' }}>Class</div>
                            <div style={{ fontSize: '22px', fontWeight: '800' }}>{cls.name}</div>
                            <div style={{ fontSize: '12px', marginTop: '10px', opacity: 0.8 }}>{cls.students || 0} Students</div>
                            {selectedClass?.id === cls.id && (
                                <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                                    <CheckCircle size={18} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Student Management Section */}
            {selectedClass && (
                <div className="card animate-fade-in-up" style={{ padding: '30px', borderRadius: '24px', border: '1px solid #E2E8F0', background: 'white' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                        <div>
                            <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#1E293B' }}>
                                Students: {selectedClass.name}
                            </h2>
                            <p style={{ color: '#64748B' }}>Set results and promotion status for each student.</p>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            {/* PDF Download Button */}
                            <button
                                onClick={generatePDF}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '10px 16px', borderRadius: '12px',
                                    border: '1px solid #E2E8F0', background: 'white',
                                    color: '#475569', fontWeight: '600', cursor: 'pointer',
                                    transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                }}
                                className="hover:bg-slate-50 active:scale-95"
                            >
                                <GraduationCap size={18} />
                                <span>Download Report</span>
                            </button>

                            <div style={{ position: 'relative' }}>
                                <Search size={18} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder="Search by Name/Roll..."
                                    value={studentSearchQuery}
                                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                                    style={{
                                        padding: '10px 15px 10px 40px', borderRadius: '12px', border: '1px solid #E2E8F0',
                                        width: '250px', outline: 'none', fontSize: '14px'
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', background: '#F1F5F9', padding: '4px', borderRadius: '12px', gap: '4px' }}>
                                <button onClick={() => setAllStatus('promote')} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: 'white', fontWeight: '600', color: '#10B981', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', fontSize: '12px' }}>Promote All</button>
                                <button onClick={() => setAllStatus('retain')} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: 'transparent', fontWeight: '600', color: '#F59E0B', cursor: 'pointer', fontSize: '12px' }}>Retain All</button>
                                <button onClick={() => setAllStatus('demote')} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: 'transparent', fontWeight: '600', color: '#6366F1', cursor: 'pointer', fontSize: '12px' }}>Demote All</button>
                                <button onClick={() => setAllStatus('leave')} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: 'transparent', fontWeight: '600', color: '#EF4444', cursor: 'pointer', fontSize: '12px' }}>Leave All</button>
                            </div>
                        </div>
                    </div>

                    {
                        loadingStudents ? (
                            <div style={{ padding: '50px', textAlign: 'center' }}>
                                <Loader2 className="animate-spin" size={32} color="var(--primary)" />
                                <div style={{ marginTop: '10px', fontWeight: '500' }}>Fetching class records...</div>
                            </div>
                        ) : filteredStudents.length === 0 ? (
                            <div style={{ padding: '50px', textAlign: 'center', color: '#94A3B8', border: '2px dashed #F1F5F9', borderRadius: '20px' }}>
                                <Users size={48} style={{ marginBottom: '15px', opacity: 0.5 }} />
                                <div>No students matching your search.</div>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' }}>
                                {filteredStudents.map(student => {
                                    const status = student.promotionStatus || 'promote';
                                    const isPass = student.result === 'pass';
                                    return (
                                        <div key={student.id} style={{
                                            padding: '20px', borderRadius: '20px', border: '1px solid #F1F5F9',
                                            background: '#FCFDFF', display: 'flex', flexDirection: 'column', gap: '15px',
                                            transition: 'all 0.2s hover', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                        }}>
                                            <div style={{ display: 'flex', gap: '15px' }}>
                                                <div style={{
                                                    width: '50px', height: '50px', borderRadius: '15px', background: '#F1F5F9',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                                                    border: '2px solid #F1F5F9'
                                                }}>
                                                    {(student.avatar || student.profilePic) ? (
                                                        <img src={student.avatar || student.profilePic} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--primary)' }}>{student.name?.charAt(0)}</span>
                                                    )}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: '800', fontSize: '16px', color: '#1E293B' }}>{student.name}</div>
                                                    <div style={{ fontSize: '13px', color: '#64748B' }}>Roll No: {student.rollNo || '-'}</div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>Exam Score</div>
                                                    <input
                                                        type="number"
                                                        value={student.examScore}
                                                        onChange={(e) => handleScoreChange(student.id, e.target.value)}
                                                        placeholder="%"
                                                        style={{
                                                            width: '60px', padding: '6px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                                            textAlign: 'center', fontWeight: '700', outline: 'none'
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                <div style={{ flex: 1, display: 'flex', gap: '4px' }}>
                                                    <button
                                                        onClick={() => handleResultToggle(student.id, 'pass')}
                                                        style={{
                                                            flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                                            background: isPass ? '#10B981' : '#F1F5F9', color: isPass ? 'white' : '#64748B',
                                                            fontWeight: '700', fontSize: '12px', transition: 'all 0.2s'
                                                        }}
                                                    >PASS</button>
                                                    <button
                                                        onClick={() => handleResultToggle(student.id, 'fail')}
                                                        style={{
                                                            flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                                            background: !isPass ? '#EF4444' : '#F1F5F9', color: !isPass ? 'white' : '#64748B',
                                                            fontWeight: '700', fontSize: '12px', transition: 'all 0.2s'
                                                        }}
                                                    >FAIL</button>
                                                </div>
                                                <div style={{ width: '1px', height: '20px', background: '#E2E8F0' }} />
                                                <div style={{ flex: 2, display: 'flex', gap: '4px' }}>
                                                    <button
                                                        onClick={() => handleIndividualAction(student.id, 'promote')}
                                                        title={`To: ${student.nextClassName}`}
                                                        style={{
                                                            flex: 1, padding: '8px 4px', borderRadius: '8px', border: '1px solid #E2E8F0', cursor: 'pointer',
                                                            background: status === 'promote' ? '#DCFCE7' : 'white', color: status === 'promote' ? '#15803D' : '#64748B',
                                                            fontWeight: '700', fontSize: '10px'
                                                        }}
                                                    >Promote</button>
                                                    <button
                                                        onClick={() => handleIndividualAction(student.id, 'retain')}
                                                        style={{
                                                            flex: 1, padding: '8px 4px', borderRadius: '8px', border: '1px solid #E2E8F0', cursor: 'pointer',
                                                            background: status === 'retain' ? '#FFFBEB' : 'white', color: status === 'retain' ? '#D97706' : '#64748B',
                                                            fontWeight: '700', fontSize: '10px'
                                                        }}
                                                    >Retain</button>
                                                    {student.previousClassId && (
                                                        <button
                                                            onClick={() => handleIndividualAction(student.id, 'demote')}
                                                            title={`Back to: ${student.previousClassName}`}
                                                            style={{
                                                                flex: 1, padding: '8px 4px', borderRadius: '8px', border: '1px solid #E2E8F0', cursor: 'pointer',
                                                                background: status === 'demote' ? '#EEF2FF' : 'white', color: status === 'demote' ? '#4F46E5' : '#64748B',
                                                                fontWeight: '700', fontSize: '10px'
                                                            }}
                                                        >Demote</button>
                                                    )}
                                                    <button
                                                        onClick={() => handleIndividualAction(student.id, 'leave')}
                                                        style={{
                                                            flex: 1, padding: '8px 4px', borderRadius: '8px', border: '1px solid #E2E8F0', cursor: 'pointer',
                                                            background: status === 'leave' ? '#FEF2F2' : 'white', color: status === 'leave' ? '#DC2626' : '#64748B',
                                                            fontWeight: '700', fontSize: '10px'
                                                        }}
                                                    >Leave</button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    }

                    {
                        !loadingStudents && filteredStudents.length > 0 && (
                            <div style={{ marginTop: '40px', padding: '30px', background: '#F8FAFC', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '14px', color: '#64748B' }}>Total Ready to Sync</div>
                                    <div style={{ fontSize: '24px', fontWeight: '800', color: '#1E293B' }}>{students.length} Student Records</div>
                                </div>
                                <button
                                    onClick={() => { setShowConfirmModal(true); setConfirmLevel(1); }}
                                    disabled={processing}
                                    style={{
                                        padding: '16px 40px', background: 'var(--primary)', color: 'white', border: 'none',
                                        borderRadius: '16px', fontSize: '18px', fontWeight: '800', cursor: 'pointer',
                                        boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.4)', transition: 'all 0.2s'
                                    }}
                                    className="hover:scale-105 active:scale-95 transition-transform"
                                >
                                    {processing ? 'Uploading Data...' : 'Confirm & Process All'}
                                </button>
                            </div>
                        )
                    }
                </div >
            )
            }

            {/* Hidden Debug Footer (Previous Task) */}
            {/* Debug Footer
            <div style={{ marginTop: '50px', padding: '10px', fontSize: '10px', color: '#ccc', borderTop: '1px solid #eee' }}>
                <p>Debug School ID: {schoolId || 'Not Found'}</p>
                <p>Raw Session: {localStorage.getItem('manual_session') || 'NULL'}</p>
                <button onClick={() => window.location.reload()} style={{ marginTop: '10px', padding: '4px' }}>Reload</button>
            </div>
            */}

            {/* Confirmation Modal */}
            {
                showConfirmModal && (
                    <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
                    }}>
                        <div style={{ background: 'white', padding: '40px', borderRadius: '32px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
                            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                                <div style={{
                                    width: '80px', height: '80px', borderRadius: '50%', background: confirmLevel === 1 ? '#E0E7FF' : '#FEE2E2',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: confirmLevel === 1 ? 'var(--primary)' : '#EF4444'
                                }}>
                                    <AlertCircle size={40} />
                                </div>
                                <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#1E293B', marginBottom: '10px' }}>
                                    {confirmLevel === 1 ? 'Confirm Promotions?' : 'Final Warning!'}
                                </h2>
                                <p style={{ color: '#64748B', lineHeight: '1.6' }}>
                                    {confirmLevel === 1
                                        ? `You are about to process ${students.length} students from ${selectedClass.name}. This action will move student records across classes. Are you sure?`
                                        : `This action is irreversible. It will update the database permanently. Do you wish to proceed with the synchronization?`
                                    }
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '15px' }}>
                                <button
                                    onClick={() => setShowConfirmModal(false)}
                                    style={{ flex: 1, padding: '15px', borderRadius: '14px', border: '1px solid #E2E8F0', background: 'white', fontWeight: '700', cursor: 'pointer' }}
                                >Cancel</button>
                                <button
                                    onClick={() => {
                                        if (confirmLevel === 1) {
                                            setConfirmLevel(2);
                                        } else {
                                            processPromotions();
                                        }
                                    }}
                                    style={{
                                        flex: 1, padding: '15px', borderRadius: '14px', border: 'none',
                                        background: confirmLevel === 1 ? 'var(--primary)' : '#EF4444', color: 'white', fontWeight: '700', cursor: 'pointer'
                                    }}
                                >
                                    {confirmLevel === 1 ? 'Yes, Confirm' : 'Yes, Process Now'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Promotions;
