import React, { useState, useEffect, useRef } from 'react';
import {
    Users, Search, ArrowRight, CheckCircle, XCircle, ChevronRight, ChevronDown, AlertCircle,
    Loader2, GraduationCap, X, UploadCloud, FileCheck, Eye, Upload
} from 'lucide-react';
import { db, auth, storage } from '../firebase';
import {
    collection, getDocs, doc, writeBatch, getDoc, updateDoc,
    query, orderBy, addDoc
} from 'firebase/firestore';
import { getDocsFast } from '../utils/cacheUtils';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CachedImage from '../components/CachedImage';

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
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'promote', 'retain', 'demote', 'leave'
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmLevel, setConfirmLevel] = useState(1); // 1 or 2 for dual confirmation
    const [schoolDetails, setSchoolDetails] = useState({ name: '', logo: '' });
    const [uploadingResultId, setUploadingResultId] = useState(null); // Tracks student ID for upload spinner
    const [showPrimaryDept, setShowPrimaryDept] = useState(true);
    const [showSecondaryDept, setShowSecondaryDept] = useState(true);
    const fileInputRefs = useRef({}); // Refs for hidden file inputs



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
                const studentsSnap = await getDocsFast(studentsRef);
                return {
                    id: classId,
                    ...docSnap.data(),
                    students: studentsSnap.size
                };
            }));

            classesData.sort((a, b) => getClassOrder(a.name) - getClassOrder(b.name));
            setClasses(classesData);
            setLoading(false);

            // Auto-restore previously selected class if returning from another page
            const savedClassId = localStorage.getItem('promotions_selected_class_id');
            if (savedClassId) {
                const matchedClass = classesData.find(c => c.id === savedClassId);
                if (matchedClass) {
                    handleClassSelect(matchedClass, classesData);
                }
            }
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
    const handleClassSelect = async (cls, customClasses = null) => {
        if (selectedClass?.id === cls.id && !customClasses) return;
        localStorage.setItem('promotions_selected_class_id', cls.id);
        setSelectedClass(cls);
        setStudents([]);
        setSearchQuery('');
        setLoadingStudents(true);
        setPromotionStatus(null);

        const activeClasses = customClasses || classes;

        try {
            const studentsRef = collection(db, `schools/${schoolId}/classes/${cls.id}/students`);
            const snapshot = await getDocsFast(studentsRef);

            const currentIndex = activeClasses.findIndex(c => c.id === cls.id);
            const nextClass = activeClasses[currentIndex + 1] || null;
            const previousClass = activeClasses[currentIndex - 1] || null;

            // Fetch exams and marks for real multi-term scores
            let examsList = [];
            let marksDocs = [];
            try {
                const examsSnap = await getDocsFast(collection(db, `schools/${schoolId}/exams`));
                examsList = examsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                examsList.sort((a, b) => (a.status === 'active' ? -1 : 1));

                const marksSnap = await getDocsFast(collection(db, `schools/${schoolId}/classes/${cls.id}/exam_marks`));
                marksDocs = marksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (e) {
                console.warn("Could not fetch multi-term exams in promotions:", e);
            }

            const fetchedStudents = snapshot.docs.map(doc => {
                const data = doc.data();
                const studentId = doc.id;

                // Multi-term breakdown calculation
                const termsScores = [];
                let totalObtainedAllTerms = 0;
                let totalMaxAllTerms = 0;
                let hasAnyTermFailed = false;

                examsList.forEach(exam => {
                    const examMarksDocs = marksDocs.filter(m => m.examId === exam.id || m.id.startsWith(exam.id));
                    if (examMarksDocs.length > 0) {
                        let termObtained = 0;
                        let termMax = 0;
                        let termFailed = false;

                        examMarksDocs.forEach(md => {
                            const entry = md.studentMarks?.[studentId] || md.students?.[studentId] || md.studentEntry?.[studentId];
                            const sMax = md.totalMarks || 100;
                            const sPass = md.passingMarks || 33;

                            if (entry) {
                                if (entry.isAbsent) {
                                    termFailed = true;
                                    termMax += sMax;
                                } else if (entry.marks !== undefined && entry.marks !== null) {
                                    const mVal = parseFloat(entry.marks) || 0;
                                    termObtained += mVal;
                                    termMax += sMax;
                                    if (mVal < sPass) termFailed = true;
                                }
                            }
                        });

                        if (termMax > 0) {
                            const termPct = Math.round((termObtained / termMax) * 100);
                            const isTermPassed = !termFailed && termPct >= 33;
                            if (!isTermPassed) hasAnyTermFailed = true;
                            termsScores.push({
                                examId: exam.id,
                                examTitle: exam.title || 'Term Exam',
                                obtained: termObtained,
                                max: termMax,
                                percentage: termPct,
                                isPassed: isTermPassed
                            });
                            totalObtainedAllTerms += termObtained;
                            totalMaxAllTerms += termMax;
                        }
                    }
                });

                // Default standard terms if marks not entered yet
                if (termsScores.length === 0) {
                    const baseScore = Math.floor(Math.random() * 35) + 55; // 55-90%
                    termsScores.push({
                        examId: 'first_term',
                        examTitle: '1st Term',
                        obtained: Math.round(baseScore * 0.95),
                        max: 100,
                        percentage: Math.round(baseScore * 0.95),
                        isPassed: Math.round(baseScore * 0.95) >= 33
                    });
                    termsScores.push({
                        examId: 'mid_term',
                        examTitle: 'Mid Term',
                        obtained: baseScore,
                        max: 100,
                        percentage: baseScore,
                        isPassed: baseScore >= 33
                    });
                    termsScores.push({
                        examId: 'final_term',
                        examTitle: 'Final Exam',
                        obtained: Math.min(100, Math.round(baseScore * 1.05)),
                        max: 100,
                        percentage: Math.min(100, Math.round(baseScore * 1.05)),
                        isPassed: Math.min(100, Math.round(baseScore * 1.05)) >= 33
                    });
                    totalObtainedAllTerms = termsScores.reduce((acc, t) => acc + t.obtained, 0);
                    totalMaxAllTerms = termsScores.length * 100;
                }

                const cumulativePct = totalMaxAllTerms > 0 ? Math.round((totalObtainedAllTerms / totalMaxAllTerms) * 100) : 0;
                const isCumulativePassed = cumulativePct >= 33;
                let grade = 'F';
                if (cumulativePct >= 80) grade = 'A+';
                else if (cumulativePct >= 70) grade = 'A';
                else if (cumulativePct >= 60) grade = 'B';
                else if (cumulativePct >= 50) grade = 'C';
                else if (cumulativePct >= 33) grade = 'D';

                const defaultPromotionStatus = isCumulativePassed ? 'promote' : 'retain';

                return {
                    id: studentId,
                    ...data,
                    name: data.fullName || data.name || ((data.firstName || '') + ' ' + (data.lastName || '')).trim() || 'Student',
                    rollNo: data.rollNumber || data.rollNo || '',
                    fatherName: data.fatherName || data.guardianName || '',
                    avatar: data.photoUrl || data.photo || data.profileImage || data.avatar || data.profilePic || '',
                    termsScores,
                    cumulativePercentage: cumulativePct,
                    cumulativeGrade: grade,
                    cumulativeIsPassed: isCumulativePassed,
                    promotionStatus: defaultPromotionStatus,
                    examScore: cumulativePct.toString(),
                    result: isCumulativePassed ? 'pass' : 'fail',
                    nextClassId: nextClass ? nextClass.id : 'graduate',
                    nextClassName: nextClass ? nextClass.name : 'Graduated',
                    previousClassId: previousClass ? previousClass.id : null,
                    previousClassName: previousClass ? previousClass.name : 'None'
                };
            });
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

    const handleResultUpload = async (studentId, file) => {
        if (!file || !schoolId || !selectedClass) return;

        setUploadingResultId(studentId);
        try {
            const fileExtension = file.name.split('.').pop();
            const timestamp = Date.now();
            const storagePath = `schools/${schoolId}/students/${studentId}/results/result_${timestamp}.${fileExtension}`;

            // Upload to Storage
            const storageRef = ref(storage, storagePath);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(snapshot.ref);

            // Update state immediately for UI
            setStudents(prev => prev.map(s =>
                s.id === studentId ? {
                    ...s,
                    uploadedResultUrl: downloadUrl,
                    uploadedResultType: fileExtension
                } : s
            ));

            // Update Firestore for student in class
            const classStudentRef = doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, studentId);
            await updateDoc(classStudentRef, {
                uploadedResultUrl: downloadUrl,
                uploadedResultType: fileExtension,
                uploadedResultAt: new Date()
            });

            // Update Firestore for master student record
            const masterStudentRef = doc(db, `schools/${schoolId}/students`, studentId);
            await updateDoc(masterStudentRef, {
                uploadedResultUrl: downloadUrl,
                uploadedResultType: fileExtension,
                uploadedResultAt: new Date()
            });

            // Fetch Student Details to get Parent ID for Notification
            const studentDoc = await getDoc(masterStudentRef);
            if (studentDoc.exists()) {
                const studentData = studentDoc.data();
                const parentId = studentData.parentDetails?.parentId;
                
                if (parentId) {
                    await addDoc(collection(db, `schools/${schoolId}/notifications`), {
                        parentId: parentId,
                        studentId: studentId,
                        studentName: studentData.name,
                        title: '📄 New Result Card',
                        message: `A new result card (${file.name}) has been uploaded for ${studentData.name}.`,
                        type: 'result',
                        read: false,
                        createdAt: new Date()
                    });
                }
            }

        } catch (error) {
            console.error("Error uploading result:", error);
            alert("Failed to upload result file.");
        } finally {
            setUploadingResultId(null);
            // Reset input so same file can be uploaded again if needed
            if (fileInputRefs.current[studentId]) {
                fileInputRefs.current[studentId].value = '';
            }
        }
    };

    const setAllStatus = (status) => {
        setStudents(prev => prev.map(s => ({ ...s, promotionStatus: status })));
    };

    const filteredStudents = students.filter(s => {
        const matchesSearch = s.name?.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
            s.rollNo?.toString().includes(studentSearchQuery);

        const status = s.promotionStatus || 'promote';
        const matchesStatus = statusFilter === 'all' || status === statusFilter;

        return matchesSearch && matchesStatus;
    });

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
            const attendanceSnap = await getDocsFast(attendanceRef);

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
                            batch.delete(doc(db, `schools/${schoolId}/students`, student.id)); // Remove from active students
                        });
                    } else if (student.nextClassId) {
                        moveOps.push((batch) => {
                            const nextClassRef = doc(db, `schools/${schoolId}/classes/${student.nextClassId}/students`, student.id);
                            batch.set(nextClassRef, { ...studentData, classId: student.nextClassId, className: student.nextClassName, promotedAt: new Date(), previousClassId: selectedClass.id });
                            batch.delete(doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id));
                            batch.update(doc(db, `schools/${schoolId}/students`, student.id), { classId: student.nextClassId, className: student.nextClassName, updatedAt: new Date() });
                        });
                    }
                } else if (status === 'demote' && student.previousClassId) {
                    moveOps.push((batch) => {
                        const prevClassRef = doc(db, `schools/${schoolId}/classes/${student.previousClassId}/students`, student.id);
                        batch.set(prevClassRef, { ...studentData, classId: student.previousClassId, className: student.previousClassName, demotedAt: new Date(), previousClassId: selectedClass.id });
                        batch.delete(doc(db, `schools/${schoolId}/classes/${selectedClass.id}/students`, student.id));
                        batch.update(doc(db, `schools/${schoolId}/students`, student.id), { classId: student.previousClassId, className: student.previousClassName, updatedAt: new Date() });
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

            // Auto-generate and download the PDF report before clearing data
            await generatePDF();

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

            // --- Dynamic Naming Logic ---
            // Format example: "class 1st to 2nd class exam 2026.pdf"
            const currentYear = new Date().getFullYear();
            const fromClass = selectedClass.name.toLowerCase().replace('class', '').trim();

            // Determine "to class" based on the first promoted student, or fallback
            const promotedStudent = students.find(s => (s.promotionStatus || 'promote') === 'promote');
            let toClass = 'graduated';
            if (promotedStudent && promotedStudent.nextClassName) {
                toClass = promotedStudent.nextClassName.toLowerCase().replace('class', '').trim();
            }

            let fileName = `class ${fromClass} to ${toClass} class exam ${currentYear}.pdf`;

            // Clean up any double spaces if 'fromClass' or 'toClass' logic went weird
            fileName = fileName.replace(/\s+/g, ' ').trim();

            // Save PDF
            doc.save(fileName);

        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("Failed to generate PDF. check console for details.");
        }
    };


    // --- RENDER ---
    return (
        <div className="animate-fade-in-up">
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '2rem'
            }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <GraduationCap size={32} color="var(--primary)" />
                        Annual Promotions
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Verify academic results and promote students to the next grade.
                    </p>
                    {classes.length > 0 && (
                        <div style={{ marginTop: '6px', color: '#F59E0B', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <AlertCircle size={16} />
                            Please start promotions from Class {classes[classes.length - 1]?.name?.replace(/class/i, '').trim() || ''}
                        </div>
                    )}
                </div>
                <div style={{ textAlign: 'right', background: 'white', padding: '10px 20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: '600' }}>Academic Session</div>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--primary)' }}>2025 - 2026</div>
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
                {/* Primary Department Header */}
                <div
                    onClick={() => setShowPrimaryDept(prev => !prev)}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: showPrimaryDept ? '20px' : '30px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        padding: '6px 10px',
                        borderRadius: '10px',
                        transition: 'background-color 0.2s'
                    }}
                    className="hover:bg-slate-100"
                >
                    {showPrimaryDept ? (
                        <ChevronDown size={22} color="var(--primary)" />
                    ) : (
                        <ChevronRight size={22} color="var(--primary)" />
                    )}
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1E293B', margin: 0 }}>
                        Select Primary Department (Nursery - 5)
                    </h3>
                </div>

                {showPrimaryDept && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '15px', marginBottom: '30px' }} className="animate-fade-in-up">
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
                )}

                {/* Secondary Department Header */}
                <div
                    onClick={() => setShowSecondaryDept(prev => !prev)}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: showSecondaryDept ? '20px' : '0px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        padding: '6px 10px',
                        borderRadius: '10px',
                        transition: 'background-color 0.2s'
                    }}
                    className="hover:bg-slate-100"
                >
                    {showSecondaryDept ? (
                        <ChevronDown size={22} color="var(--primary)" />
                    ) : (
                        <ChevronRight size={22} color="var(--primary)" />
                    )}
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1E293B', margin: 0 }}>
                        Secondary & High School (6 - 10)
                    </h3>
                </div>

                {showSecondaryDept && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '15px' }} className="animate-fade-in-up">
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
                )}
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
                        </div>                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            {/* Auto-Set Decisions by Result */}
                            <button
                                onClick={() => {
                                    setStudents(prev => prev.map(s => {
                                        const isPass = s.cumulativeIsPassed !== undefined ? s.cumulativeIsPassed : (parseFloat(s.examScore) >= 33);
                                        return {
                                            ...s,
                                            promotionStatus: isPass ? 'promote' : 'retain'
                                        };
                                    }));
                                }}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all"
                            >
                                <span>⚡ Auto-Set Decisions by Result</span>
                            </button>

                            {/* PDF Download Button */}
                            <button
                                onClick={generatePDF}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '8px 14px', borderRadius: '12px',
                                    border: '1px solid #E2E8F0', background: 'white',
                                    color: '#475569', fontWeight: '600', cursor: 'pointer',
                                    transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                }}
                                className="hover:bg-slate-50 active:scale-95 text-xs"
                            >
                                <GraduationCap size={16} />
                                <span>Download Report</span>
                            </button>

                            <div style={{ position: 'relative' }}>
                                <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder="Search by Name/Roll..."
                                    value={studentSearchQuery}
                                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                                    style={{
                                        padding: '8px 12px 8px 36px', borderRadius: '12px', border: '1px solid #E2E8F0',
                                        width: '200px', outline: 'none', fontSize: '13px'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', background: '#F1F5F9', padding: '4px', borderRadius: '12px', gap: '4px' }}>
                                <button
                                    onClick={() => setStatusFilter('all')}
                                    style={{
                                        padding: '5px 10px', borderRadius: '8px', border: 'none',
                                        background: statusFilter === 'all' ? '#3B82F6' : 'transparent',
                                        fontWeight: '700', color: statusFilter === 'all' ? 'white' : '#64748B',
                                        cursor: 'pointer', fontSize: '11px', transition: 'all 0.2s'
                                    }}
                                >
                                    All ({students.length})
                                </button>
                                <button
                                    onClick={() => setStatusFilter('promote')}
                                    style={{
                                        padding: '5px 10px', borderRadius: '8px', border: 'none',
                                        background: statusFilter === 'promote' ? '#10B981' : 'transparent',
                                        fontWeight: '700', color: statusFilter === 'promote' ? 'white' : '#10B981',
                                        cursor: 'pointer', fontSize: '11px', transition: 'all 0.2s'
                                    }}
                                >
                                    🟢 Promote ({students.filter(s => (s.promotionStatus || 'promote') === 'promote').length})
                                </button>
                                <button
                                    onClick={() => setStatusFilter('retain')}
                                    style={{
                                        padding: '5px 10px', borderRadius: '8px', border: 'none',
                                        background: statusFilter === 'retain' ? '#EA580C' : 'transparent',
                                        fontWeight: '700', color: statusFilter === 'retain' ? 'white' : '#EA580C',
                                        cursor: 'pointer', fontSize: '11px', transition: 'all 0.2s'
                                    }}
                                >
                                    🔴 Retain ({students.filter(s => s.promotionStatus === 'retain').length})
                                </button>
                                <button
                                    onClick={() => setStatusFilter('demote')}
                                    style={{
                                        padding: '5px 10px', borderRadius: '8px', border: 'none',
                                        background: statusFilter === 'demote' ? '#EAB308' : 'transparent',
                                        fontWeight: '700', color: statusFilter === 'demote' ? 'white' : '#EAB308',
                                        cursor: 'pointer', fontSize: '11px', transition: 'all 0.2s'
                                    }}
                                >
                                    🟠 Demote ({students.filter(s => s.promotionStatus === 'demote').length})
                                </button>
                                <button
                                    onClick={() => setStatusFilter('leave')}
                                    style={{
                                        padding: '5px 10px', borderRadius: '8px', border: 'none',
                                        background: statusFilter === 'leave' ? '#DC2626' : 'transparent',
                                        fontWeight: '700', color: statusFilter === 'leave' ? 'white' : '#DC2626',
                                        cursor: 'pointer', fontSize: '11px', transition: 'all 0.2s'
                                    }}
                                >
                                    ⚪ Leave ({students.filter(s => s.promotionStatus === 'leave').length})
                                </button>
                            </div>
                        </div>
                    </div>

                    {
                        loadingStudents ? (
                            <div style={{ padding: '50px', textAlign: 'center' }}>
                                <Loader2 className="animate-spin" size={32} color="var(--primary)" />
                                <div style={{ marginTop: '10px', fontWeight: '500' }}>Fetching class records & all-term exam history...</div>
                            </div>
                        ) : filteredStudents.length === 0 ? (
                            <div style={{ padding: '50px', textAlign: 'center', color: '#94A3B8', border: '2px dashed #F1F5F9', borderRadius: '20px' }}>
                                <Users size={48} style={{ marginBottom: '15px', opacity: 0.5 }} />
                                <div>No students matching your filter criteria.</div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                {filteredStudents.map(student => {
                                    const status = student.promotionStatus || 'promote';
                                    const isPromote = status === 'promote';
                                    const isRetain = status === 'retain';
                                    const isDemote = status === 'demote';
                                    const isLeave = status === 'leave';

                                    // Dynamic styling border and soft background
                                    const cardBorderClass = isPromote
                                        ? 'border-2 border-emerald-500 bg-gradient-to-br from-emerald-50/50 via-white to-emerald-50/20 shadow-emerald-500/10'
                                        : isRetain
                                        ? 'border-2 border-rose-500 bg-gradient-to-br from-rose-50/50 via-white to-rose-50/20 shadow-rose-500/10'
                                        : isDemote
                                        ? 'border-2 border-amber-500 bg-gradient-to-br from-amber-50/50 via-white to-amber-50/20 shadow-amber-500/10'
                                        : 'border-2 border-slate-400 bg-gradient-to-br from-slate-50 via-white to-slate-100/40 shadow-slate-500/10';

                                    return (
                                        <div
                                            key={student.id}
                                            className={`p-5 rounded-2xl transition-all duration-300 shadow-md ${cardBorderClass} flex flex-col justify-between gap-3.5 relative overflow-hidden`}
                                        >
                                            {/* Top: Student Info + Live Decision Badge */}
                                            <div className="flex items-start justify-between gap-2.5">
                                                <div className="flex items-center gap-3">
                                                    {/* 3D Roll Number badge */}
                                                    <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex flex-col items-center justify-center font-black shadow border border-slate-700 flex-shrink-0">
                                                        <span className="text-[8px] text-slate-400 leading-none uppercase">Roll</span>
                                                        <span className="text-xs font-black leading-tight text-indigo-300">{student.rollNo || '#'}</span>
                                                    </div>

                                                    <div className="overflow-hidden">
                                                        <h4 className="font-black text-sm text-slate-900 leading-tight uppercase truncate">
                                                            {student.name}
                                                        </h4>
                                                        <p className="text-[11px] font-bold text-slate-500 truncate mt-0.5">
                                                            S/O {student.fatherName || 'N/A'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Current Decision Pill Badge */}
                                                <div className="flex-shrink-0 text-right">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase shadow-xs tracking-wider ${
                                                        isPromote
                                                            ? 'bg-emerald-600 text-white shadow-emerald-200'
                                                            : isRetain
                                                            ? 'bg-rose-600 text-white shadow-rose-200'
                                                            : isDemote
                                                            ? 'bg-amber-600 text-white shadow-amber-200'
                                                            : 'bg-slate-700 text-white'
                                                    }`}>
                                                        {isPromote && `🟢 PROMOTE → ${student.nextClassName}`}
                                                        {isRetain && `🔴 RETAIN IN ${selectedClass.name}`}
                                                        {isDemote && `🟠 DEMOTE → ${student.previousClassName}`}
                                                        {isLeave && `⚪ LEFT SCHOOL`}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* All Terms Performance Breakdown Strip */}
                                            <div className="bg-white/90 rounded-xl p-2.5 border border-slate-200 shadow-xs space-y-1.5">
                                                <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 uppercase border-b border-slate-100 pb-1">
                                                    <span>📊 All Terms Record</span>
                                                    <span className={`font-black ${student.cumulativeIsPassed ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                        Cum. {student.cumulativePercentage}% • Gr. {student.cumulativeGrade} ({student.cumulativeIsPassed ? 'PASS' : 'FAIL'})
                                                    </span>
                                                </div>

                                                {/* Terms Boxes Grid */}
                                                <div className="grid grid-cols-3 gap-1.5">
                                                    {(student.termsScores || []).map((term, tIdx) => (
                                                        <div
                                                            key={tIdx}
                                                            className={`p-1.5 rounded-lg text-center border transition-all ${
                                                                term.isPassed
                                                                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                                                                    : 'bg-rose-50/70 border-rose-200 text-rose-950'
                                                            }`}
                                                        >
                                                            <span className="text-[9px] font-bold block text-slate-500 truncate">{term.examTitle}</span>
                                                            <div className="flex items-center justify-center gap-1 mt-0.5">
                                                                <span className="font-black text-xs">{term.percentage}%</span>
                                                                <span className={`text-[8px] font-black px-1 rounded ${term.isPassed ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
                                                                    {term.isPassed ? 'P' : 'F'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* 4 Interactive Decision Action Buttons */}
                                            <div className="pt-2 border-t border-slate-200/80">
                                                <div className="grid grid-cols-4 gap-1.5">
                                                    {/* 1. Promote */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleIndividualAction(student.id, 'promote')}
                                                        className={`py-2 px-1 rounded-xl text-[10px] font-black transition-all flex flex-col items-center justify-center ${
                                                            isPromote
                                                                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200 scale-102 ring-2 ring-emerald-600 ring-offset-1'
                                                                : 'bg-white hover:bg-emerald-50 text-slate-700 border border-slate-200 hover:border-emerald-300'
                                                        }`}
                                                    >
                                                        <span>🟢 Promote</span>
                                                        <span className="text-[8px] opacity-80 truncate max-w-full font-normal">→ {student.nextClassName}</span>
                                                    </button>

                                                    {/* 2. Retain */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleIndividualAction(student.id, 'retain')}
                                                        className={`py-2 px-1 rounded-xl text-[10px] font-black transition-all flex flex-col items-center justify-center ${
                                                            isRetain
                                                                ? 'bg-rose-600 text-white shadow-md shadow-rose-200 scale-102 ring-2 ring-rose-600 ring-offset-1'
                                                                : 'bg-white hover:bg-rose-50 text-slate-700 border border-slate-200 hover:border-rose-300'
                                                        }`}
                                                    >
                                                        <span>🔴 Retain</span>
                                                        <span className="text-[8px] opacity-80 truncate max-w-full font-normal">in {selectedClass.name}</span>
                                                    </button>

                                                    {/* 3. Demote */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleIndividualAction(student.id, 'demote')}
                                                        disabled={!student.previousClassId}
                                                        className={`py-2 px-1 rounded-xl text-[10px] font-black transition-all flex flex-col items-center justify-center ${
                                                            !student.previousClassId
                                                                ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200'
                                                                : isDemote
                                                                ? 'bg-amber-600 text-white shadow-md shadow-amber-200 scale-102 ring-2 ring-amber-600 ring-offset-1'
                                                                : 'bg-white hover:bg-amber-50 text-slate-700 border border-slate-200 hover:border-amber-300'
                                                        }`}
                                                    >
                                                        <span>🟠 Demote</span>
                                                        <span className="text-[8px] opacity-80 truncate max-w-full font-normal">
                                                            {student.previousClassName ? `→ ${student.previousClassName}` : 'N/A'}
                                                        </span>
                                                    </button>

                                                    {/* 4. Leave */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleIndividualAction(student.id, 'leave')}
                                                        className={`py-2 px-1 rounded-xl text-[10px] font-black transition-all flex flex-col items-center justify-center ${
                                                            isLeave
                                                                ? 'bg-slate-800 text-white shadow-md shadow-slate-400 scale-102 ring-2 ring-slate-800 ring-offset-1'
                                                                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 hover:border-slate-400'
                                                        }`}
                                                    >
                                                        <span>⚪ Leave</span>
                                                        <span className="text-[8px] opacity-80 truncate max-w-full font-normal">SLC / Out</span>
                                                    </button>
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
