import React, { useState, useEffect, useRef } from 'react';
import {
    Users, Search, ArrowRight, CheckCircle, XCircle, ChevronRight, ChevronDown, AlertCircle,
    Loader2, GraduationCap, X, UploadCloud, FileCheck, Eye, Upload, Sparkles
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
    const [isDemoMode, setIsDemoMode] = useState(false);
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

            // Auto-restore previously selected class if returning from another page, or default to first class
            const savedClassId = localStorage.getItem('promotions_selected_class_id');
            if (savedClassId) {
                const matchedClass = classesData.find(c => c.id === savedClassId);
                if (matchedClass) {
                    handleClassSelect(matchedClass, classesData);
                } else if (classesData.length > 0) {
                    handleClassSelect(classesData[0], classesData);
                }
            } else if (classesData.length > 0) {
                handleClassSelect(classesData[0], classesData);
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

            // Standard terms to track
            const termsToTrack = [
                { key: 'first', label: '1st Term', regex: /(1st|first|term[_\-\s]?1)/i },
                { key: 'mid', label: '2nd Term', regex: /(2nd|second|mid|half|term[_\-\s]?2)/i },
                { key: 'final', label: 'Final Exam', regex: /(final|annual|3rd|third|term[_\-\s]?3)/i }
            ];

            const fetchedStudents = snapshot.docs.map(doc => {
                const data = doc.data();
                const studentId = doc.id;

                let totalObtainedAllTerms = 0;
                let totalMaxAllTerms = 0;
                let hasAnyTermFailed = false;
                let termsWithRealDataCount = 0;

                const termsScores = termsToTrack.map(termMeta => {
                    const matchedExams = examsList.filter(e =>
                        termMeta.regex.test(e.id || '') || termMeta.regex.test(e.title || '')
                    );

                    let termObtained = 0;
                    let termMax = 0;
                    let hasMarks = false;
                    let termFailed = false;

                    const relevantExamIds = matchedExams.length > 0
                        ? matchedExams.map(e => e.id)
                        : [termMeta.key];

                    marksDocs.forEach(md => {
                        const mdExamId = (md.examId || md.id || '').toString();
                        const isForThisTerm = relevantExamIds.some(eid =>
                            mdExamId.toLowerCase().includes(eid.toLowerCase()) ||
                            termMeta.regex.test(mdExamId) ||
                            termMeta.regex.test(md.examTitle || '')
                        );

                        if (isForThisTerm) {
                            const entry = md.studentMarks?.[studentId] || md.students?.[studentId] || md.studentEntry?.[studentId];
                            const sMax = parseFloat(md.totalMarks) || 100;
                            const sPass = parseFloat(md.passingMarks) || 33;

                            if (entry) {
                                if (entry.isAbsent) {
                                    hasMarks = true;
                                    termFailed = true;
                                    termMax += sMax;
                                } else if (entry.marks !== undefined && entry.marks !== null && entry.marks !== '') {
                                    hasMarks = true;
                                    const mVal = parseFloat(entry.marks) || 0;
                                    termObtained += mVal;
                                    termMax += sMax;
                                    if (mVal < sPass) termFailed = true;
                                }
                            }
                        }
                    });

                    if (hasMarks && termMax > 0) {
                        const isPassed = !termFailed && (termObtained / termMax >= 0.33);
                        if (!isPassed) hasAnyTermFailed = true;
                        totalObtainedAllTerms += termObtained;
                        totalMaxAllTerms += termMax;
                        termsWithRealDataCount++;
                        return {
                            termKey: termMeta.key,
                            examTitle: termMeta.label,
                            obtained: termObtained,
                            max: termMax,
                            scoreText: `${termObtained} / ${termMax}`,
                            hasMarks: true,
                            isPassed: isPassed
                        };
                    } else {
                        return {
                            termKey: termMeta.key,
                            examTitle: termMeta.label,
                            obtained: 0,
                            max: 0,
                            scoreText: '-- / --',
                            hasMarks: false,
                            isPassed: null
                        };
                    }
                });

                // Cumulative calculations based on all terms combined
                const cumulativePct = totalMaxAllTerms > 0
                    ? parseFloat(((totalObtainedAllTerms / totalMaxAllTerms) * 100).toFixed(1))
                    : 0;

                const isCumulativePassed = totalMaxAllTerms > 0 ? (cumulativePct >= 33 && !hasAnyTermFailed) : true;
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
                    totalObtainedAllTerms,
                    totalMaxAllTerms,
                    cumulativePercentage: cumulativePct,
                    cumulativeGrade: totalMaxAllTerms > 0 ? grade : '-',
                    cumulativeIsPassed: isCumulativePassed,
                    hasRealTermData: termsWithRealDataCount > 0,
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

    const handleToggleDemoMode = () => {
        const nextDemo = !isDemoMode;
        setIsDemoMode(nextDemo);

        if (nextDemo) {
            const currentIndex = classes.findIndex(c => c.id === selectedClass?.id);
            const nextClass = classes[currentIndex + 1] || null;
            const previousClass = classes[currentIndex - 1] || null;

            const nextClassName = nextClass ? nextClass.name : 'Class 2';
            const prevClassName = previousClass ? previousClass.name : 'Nursery';

            const demoList = [
                {
                    id: 'demo_1',
                    name: 'Muhammad Huzaifa',
                    rollNo: '01',
                    fatherName: 'Tariq Mehmood',
                    termsScores: [
                        { termKey: 'first', examTitle: '1st Term', obtained: 385, max: 400, scoreText: '385 / 400', hasMarks: true, isPassed: true },
                        { termKey: 'mid', examTitle: '2nd Term', obtained: 390, max: 400, scoreText: '390 / 400', hasMarks: true, isPassed: true },
                        { termKey: 'final', examTitle: 'Final Exam', obtained: 395, max: 400, scoreText: '395 / 400', hasMarks: true, isPassed: true }
                    ],
                    totalObtainedAllTerms: 1170,
                    totalMaxAllTerms: 1200,
                    cumulativePercentage: 97.5,
                    cumulativeGrade: 'A+',
                    cumulativeIsPassed: true,
                    promotionStatus: 'promote',
                    examScore: '97.5',
                    result: 'pass',
                    nextClassId: nextClass?.id || 'next',
                    nextClassName,
                    previousClassId: previousClass?.id || null,
                    previousClassName: prevClassName
                },
                {
                    id: 'demo_2',
                    name: 'Ayesha Fatima',
                    rollNo: '02',
                    fatherName: 'Abdul Rehman',
                    termsScores: [
                        { termKey: 'first', examTitle: '1st Term', obtained: 310, max: 400, scoreText: '310 / 400', hasMarks: true, isPassed: true },
                        { termKey: 'mid', examTitle: '2nd Term', obtained: 325, max: 400, scoreText: '325 / 400', hasMarks: true, isPassed: true },
                        { termKey: 'final', examTitle: 'Final Exam', obtained: 340, max: 400, scoreText: '340 / 400', hasMarks: true, isPassed: true }
                    ],
                    totalObtainedAllTerms: 975,
                    totalMaxAllTerms: 1200,
                    cumulativePercentage: 81.3,
                    cumulativeGrade: 'A+',
                    cumulativeIsPassed: true,
                    promotionStatus: 'promote',
                    examScore: '81.3',
                    result: 'pass',
                    nextClassId: nextClass?.id || 'next',
                    nextClassName,
                    previousClassId: previousClass?.id || null,
                    previousClassName: prevClassName
                },
                {
                    id: 'demo_3',
                    name: 'Usman Farooq',
                    rollNo: '03',
                    fatherName: 'Farooq Ahmed',
                    termsScores: [
                        { termKey: 'first', examTitle: '1st Term', obtained: 110, max: 400, scoreText: '110 / 400', hasMarks: true, isPassed: false },
                        { termKey: 'mid', examTitle: '2nd Term', obtained: 280, max: 400, scoreText: '280 / 400', hasMarks: true, isPassed: true },
                        { termKey: 'final', examTitle: 'Final Exam', obtained: 310, max: 400, scoreText: '310 / 400', hasMarks: true, isPassed: true }
                    ],
                    totalObtainedAllTerms: 700,
                    totalMaxAllTerms: 1200,
                    cumulativePercentage: 58.3,
                    cumulativeGrade: 'C',
                    cumulativeIsPassed: true,
                    promotionStatus: 'promote',
                    examScore: '58.3',
                    result: 'pass',
                    nextClassId: nextClass?.id || 'next',
                    nextClassName,
                    previousClassId: previousClass?.id || null,
                    previousClassName: prevClassName
                },
                {
                    id: 'demo_4',
                    name: 'Zubair Shah',
                    rollNo: '04',
                    fatherName: 'Syed Shah',
                    termsScores: [
                        { termKey: 'first', examTitle: '1st Term', obtained: 290, max: 400, scoreText: '290 / 400', hasMarks: true, isPassed: true },
                        { termKey: 'mid', examTitle: '2nd Term', obtained: 115, max: 400, scoreText: '115 / 400', hasMarks: true, isPassed: false },
                        { termKey: 'final', examTitle: 'Final Exam', obtained: 300, max: 400, scoreText: '300 / 400', hasMarks: true, isPassed: true }
                    ],
                    totalObtainedAllTerms: 705,
                    totalMaxAllTerms: 1200,
                    cumulativePercentage: 58.8,
                    cumulativeGrade: 'C',
                    cumulativeIsPassed: true,
                    promotionStatus: 'promote',
                    examScore: '58.8',
                    result: 'pass',
                    nextClassId: nextClass?.id || 'next',
                    nextClassName,
                    previousClassId: previousClass?.id || null,
                    previousClassName: prevClassName
                },
                {
                    id: 'demo_5',
                    name: 'Zayan Ghani',
                    rollNo: '05',
                    fatherName: 'Faizan Ghani',
                    termsScores: [
                        { termKey: 'first', examTitle: '1st Term', obtained: 100, max: 400, scoreText: '100 / 400', hasMarks: true, isPassed: false },
                        { termKey: 'mid', examTitle: '2nd Term', obtained: 110, max: 400, scoreText: '110 / 400', hasMarks: true, isPassed: false },
                        { termKey: 'final', examTitle: 'Final Exam', obtained: 95, max: 400, scoreText: '95 / 400', hasMarks: true, isPassed: false }
                    ],
                    totalObtainedAllTerms: 305,
                    totalMaxAllTerms: 1200,
                    cumulativePercentage: 25.4,
                    cumulativeGrade: 'F',
                    cumulativeIsPassed: false,
                    promotionStatus: 'retain',
                    examScore: '25.4',
                    result: 'fail',
                    nextClassId: nextClass?.id || 'next',
                    nextClassName,
                    previousClassId: previousClass?.id || null,
                    previousClassName: prevClassName
                },
                {
                    id: 'demo_6',
                    name: 'Hamza Ali',
                    rollNo: '06',
                    fatherName: 'Ali Asghar',
                    termsScores: [
                        { termKey: 'first', examTitle: '1st Term', obtained: 85, max: 400, scoreText: '85 / 400', hasMarks: true, isPassed: false },
                        { termKey: 'mid', examTitle: '2nd Term', obtained: 80, max: 400, scoreText: '80 / 400', hasMarks: true, isPassed: false },
                        { termKey: 'final', examTitle: 'Final Exam', obtained: 90, max: 400, scoreText: '90 / 400', hasMarks: true, isPassed: false }
                    ],
                    totalObtainedAllTerms: 255,
                    totalMaxAllTerms: 1200,
                    cumulativePercentage: 21.3,
                    cumulativeGrade: 'F',
                    cumulativeIsPassed: false,
                    promotionStatus: 'demote',
                    examScore: '21.3',
                    result: 'fail',
                    nextClassId: nextClass?.id || 'next',
                    nextClassName,
                    previousClassId: previousClass?.id || 'prev',
                    previousClassName: prevClassName
                },
                {
                    id: 'demo_7',
                    name: 'Khadija Bibi',
                    rollNo: '07',
                    fatherName: 'Muhammad Yousaf',
                    termsScores: [
                        { termKey: 'first', examTitle: '1st Term', obtained: 340, max: 400, scoreText: '340 / 400', hasMarks: true, isPassed: true },
                        { termKey: 'mid', examTitle: '2nd Term', obtained: 350, max: 400, scoreText: '350 / 400', hasMarks: true, isPassed: true },
                        { termKey: 'final', examTitle: 'Final Exam', obtained: 0, max: 0, scoreText: '-- / --', hasMarks: false, isPassed: null }
                    ],
                    totalObtainedAllTerms: 690,
                    totalMaxAllTerms: 800,
                    cumulativePercentage: 86.3,
                    cumulativeGrade: 'A+',
                    cumulativeIsPassed: true,
                    promotionStatus: 'promote',
                    examScore: '86.3',
                    result: 'pass',
                    nextClassId: nextClass?.id || 'next',
                    nextClassName,
                    previousClassId: previousClass?.id || null,
                    previousClassName: prevClassName
                }
            ];
            setStudents(demoList);
        } else {
            if (selectedClass) {
                handleClassSelect(selectedClass);
            }
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

            {/* Standard Clean Class Dropdown (Exams style, Left-aligned) */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Class Selector (Exams Style, Left-Aligned) */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Select Class</label>
                        <div className="relative min-w-[240px] sm:min-w-[280px]">
                            <select
                                value={selectedClass?.id || ''}
                                onChange={(e) => {
                                    const found = classes.find(c => c.id === e.target.value);
                                    if (found) handleClassSelect(found);
                                }}
                                className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-slate-800 text-xs sm:text-sm font-bold rounded-xl px-3.5 py-2.5 pr-9 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-colors cursor-pointer appearance-none"
                            >
                                <option value="" disabled>Choose Class...</option>
                                {classes.map(cls => (
                                    <option key={cls.id} value={cls.id}>
                                        {cls.name} • ({cls.students || 0} Students)
                                    </option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                                <ChevronDown size={16} />
                            </div>
                        </div>
                    </div>

                    {selectedClass && (
                        <div className="sm:mt-5 flex items-center gap-2">
                            <span className="text-xs font-extrabold px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1.5">
                                <Users size={14} />
                                {selectedClass.students || students.length || 0} Enrolled Students
                            </span>
                        </div>
                    )}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            {/* Demo Data Feed Toggle (Visible ONLY for Demo School 6257) */}
                            {String(schoolId) === '6257' && (
                                <button
                                    type="button"
                                    onClick={handleToggleDemoMode}
                                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-xs ${
                                        isDemoMode
                                            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200 ring-2 ring-amber-400/40'
                                            : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                                    }`}
                                    title="Toggle realistic sample students (Pass / Fail / Demote / Pending)"
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>{isDemoMode ? 'Exit Demo Data' : '✨ Try Demo Data'}</span>
                                </button>
                            )}

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

                            {/* Filter Status Pills (Sharp, High Contrast, No Glow) */}
                            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('all')}
                                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all ${
                                        statusFilter === 'all'
                                            ? 'bg-slate-900 text-white shadow-xs'
                                            : 'text-slate-700 hover:text-slate-900 hover:bg-white'
                                    }`}
                                >
                                    All ({students.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('promote')}
                                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                                        statusFilter === 'promote'
                                            ? 'bg-emerald-600 text-white shadow-xs'
                                            : 'text-emerald-950 hover:bg-emerald-50'
                                    }`}
                                >
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                                    <span>Promote ({students.filter(s => (s.promotionStatus || 'promote') === 'promote').length})</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('retain')}
                                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                                        statusFilter === 'retain'
                                            ? 'bg-rose-600 text-white shadow-xs'
                                            : 'text-rose-950 hover:bg-rose-50'
                                    }`}
                                >
                                    <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                                    <span>Retain ({students.filter(s => s.promotionStatus === 'retain').length})</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('demote')}
                                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                                        statusFilter === 'demote'
                                            ? 'bg-amber-600 text-white shadow-xs'
                                            : 'text-amber-950 hover:bg-amber-50'
                                    }`}
                                >
                                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                                    <span>Demote ({students.filter(s => s.promotionStatus === 'demote').length})</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('leave')}
                                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 ${
                                        statusFilter === 'leave'
                                            ? 'bg-slate-800 text-white shadow-xs'
                                            : 'text-slate-800 hover:bg-slate-200'
                                    }`}
                                >
                                    <span className="w-2 h-2 rounded-full bg-slate-400 inline-block"></span>
                                    <span>Leave ({students.filter(s => s.promotionStatus === 'leave').length})</span>
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

                                    // Clean, Flat 2D Card Border & Header Theme
                                    const card2dTheme = isPromote
                                        ? 'border-2 border-emerald-500 bg-white'
                                        : isRetain
                                        ? 'border-2 border-rose-500 bg-white'
                                        : isDemote
                                        ? 'border-2 border-amber-500 bg-white'
                                        : 'border-2 border-slate-400 bg-white';

                                    const status2dBadge = isPromote
                                        ? 'bg-emerald-600 text-white'
                                        : isRetain
                                        ? 'bg-rose-600 text-white'
                                        : isDemote
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-slate-700 text-white';

                                    const roll2dBadge = isPromote
                                        ? 'bg-emerald-50 text-emerald-950 border border-emerald-200'
                                        : isRetain
                                        ? 'bg-rose-50 text-rose-950 border border-rose-200'
                                        : isDemote
                                        ? 'bg-amber-50 text-amber-950 border border-amber-200'
                                        : 'bg-slate-100 text-slate-900 border border-slate-200';

                                    const summaryStripTheme = isPromote
                                        ? 'bg-emerald-50/70 border border-emerald-200 text-emerald-950'
                                        : isRetain
                                        ? 'bg-rose-50/70 border border-rose-200 text-rose-950'
                                        : isDemote
                                        ? 'bg-amber-50/70 border border-amber-200 text-amber-950'
                                        : 'bg-slate-100 border border-slate-200 text-slate-900';

                                    return (
                                        <div
                                            key={student.id}
                                            className={`p-5 rounded-2xl transition-all duration-200 shadow-sm flex flex-col justify-between gap-3.5 select-none ${card2dTheme}`}
                                        >
                                            {/* Top Row: Roll + Student Info + Live Decision Badge */}
                                            <div className="flex items-start justify-between gap-2.5 min-w-0">
                                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                    {/* Clean Theme-Matching Roll Badge */}
                                                    <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center font-black flex-shrink-0 ${roll2dBadge}`}>
                                                        <span className="text-[9px] opacity-70 leading-none uppercase font-extrabold">Roll</span>
                                                        <span className="text-sm font-black leading-tight">{student.rollNo || '#'}</span>
                                                    </div>

                                                    <div className="min-w-0 flex-1 overflow-hidden">
                                                        <h4 className="font-black text-sm sm:text-base text-slate-900 tracking-tight leading-tight uppercase truncate" title={student.name}>
                                                            {student.name}
                                                        </h4>
                                                        <p className="text-xs font-bold text-slate-500 truncate mt-0.5">
                                                            S/O {student.fatherName || 'N/A'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Decision Badge (Always constrained inside the card) */}
                                                <div className="flex-shrink-0">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black uppercase tracking-wide whitespace-nowrap shadow-xs ${status2dBadge}`}>
                                                        {isPromote && `🟢 PROMOTE → ${student.nextClassName}`}
                                                        {isRetain && `🔴 RETAIN (${selectedClass.name})`}
                                                        {isDemote && `🟠 DEMOTE → ${student.previousClassName}`}
                                                        {isLeave && `⚪ LEFT SCHOOL`}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Multi-Term Real Scores (Obtained / Total) */}
                                            <div className="space-y-2">
                                                <div className="text-[11px] font-black text-slate-500 uppercase tracking-wide flex items-center justify-between">
                                                    <span>📊 Real Term Exam Scores</span>
                                                    <span className="text-[10px] text-slate-400 font-bold">Obtained / Total</span>
                                                </div>

                                                {/* 3 Real Terms Grid (Color Coded Green on Pass, Red on Fail) */}
                                                <div className="grid grid-cols-3 gap-2.5">
                                                    {(student.termsScores || []).map((term, tIdx) => {
                                                        const hasMarks = term.hasMarks;
                                                        const isPass = term.isPassed;
                                                        return (
                                                            <div
                                                                key={tIdx}
                                                                className={`p-2.5 rounded-xl text-center transition-all ${
                                                                    !hasMarks
                                                                        ? 'bg-slate-50 border-2 border-dashed border-slate-300 text-slate-500'
                                                                        : isPass
                                                                        ? 'bg-emerald-50 border-2 border-emerald-400 text-emerald-950 shadow-xs'
                                                                        : 'bg-rose-50 border-2 border-rose-400 text-rose-950 shadow-xs'
                                                                }`}
                                                            >
                                                                <span className={`text-[11px] font-black block truncate ${
                                                                    !hasMarks ? 'text-slate-500' : isPass ? 'text-emerald-900' : 'text-rose-900'
                                                                }`}>
                                                                    {term.examTitle}
                                                                </span>
                                                                <div className={`font-black text-sm sm:text-base mt-0.5 ${
                                                                    !hasMarks ? 'text-slate-400' : isPass ? 'text-emerald-950' : 'text-rose-950'
                                                                }`}>
                                                                    {term.scoreText}
                                                                </div>
                                                                <div className="mt-1">
                                                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md inline-block ${
                                                                        !hasMarks
                                                                            ? 'bg-slate-200 text-slate-600'
                                                                            : isPass
                                                                            ? 'bg-emerald-600 text-white'
                                                                            : 'bg-rose-600 text-white'
                                                                    }`}>
                                                                        {!hasMarks ? 'PENDING' : isPass ? 'PASSED' : 'FAILED'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Combined Annual Calculation Strip (Theme-Matching Light) */}
                                                <div className={`rounded-xl p-2.5 flex items-center justify-between transition-all ${summaryStripTheme}`}>
                                                    <div>
                                                        <span className="text-[10px] text-slate-500 block uppercase font-extrabold">Combined 3-Terms Total</span>
                                                        <span className="font-black text-xs text-slate-900">
                                                            {student.totalMaxAllTerms > 0 ? `${student.totalObtainedAllTerms} / ${student.totalMaxAllTerms}` : 'No Marks Entered'}
                                                        </span>
                                                    </div>

                                                    <div className="text-right">
                                                        <span className="text-[10px] text-slate-500 block uppercase font-extrabold">Overall Annual %</span>
                                                        <span className={`font-black text-sm ${isPromote ? 'text-emerald-700' : isRetain ? 'text-rose-700' : isDemote ? 'text-amber-700' : 'text-slate-800'}`}>
                                                            {student.totalMaxAllTerms > 0 ? `${student.cumulativePercentage}% (Grade ${student.cumulativeGrade})` : '--'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 4 Flat 2D Action Buttons (Sharp, High Contrast Text) */}
                                            <div className="pt-2 border-t border-slate-100">
                                                <div className="grid grid-cols-4 gap-2">
                                                    {/* 1. Promote */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleIndividualAction(student.id, 'promote')}
                                                        className={`py-2.5 px-1.5 rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center ${
                                                            isPromote
                                                                ? 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-700'
                                                                : 'bg-slate-50 hover:bg-emerald-50 text-slate-800 border border-slate-200'
                                                        }`}
                                                    >
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                            <span>Promote</span>
                                                        </span>
                                                        <span className={`text-[10px] truncate max-w-full font-extrabold mt-0.5 ${isPromote ? 'text-emerald-100' : 'text-slate-500'}`}>
                                                            → {student.nextClassName}
                                                        </span>
                                                    </button>

                                                    {/* 2. Retain */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleIndividualAction(student.id, 'retain')}
                                                        className={`py-2.5 px-1.5 rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center ${
                                                            isRetain
                                                                ? 'bg-rose-600 text-white shadow-xs ring-1 ring-rose-700'
                                                                : 'bg-slate-50 hover:bg-rose-50 text-slate-800 border border-slate-200'
                                                        }`}
                                                    >
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                                            <span>Retain</span>
                                                        </span>
                                                        <span className={`text-[10px] truncate max-w-full font-extrabold mt-0.5 ${isRetain ? 'text-rose-100' : 'text-slate-500'}`}>
                                                            in {selectedClass.name}
                                                        </span>
                                                    </button>

                                                    {/* 3. Demote */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleIndividualAction(student.id, 'demote')}
                                                        disabled={!student.previousClassId}
                                                        className={`py-2.5 px-1.5 rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center ${
                                                            !student.previousClassId
                                                                ? 'opacity-30 cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200'
                                                                : isDemote
                                                                ? 'bg-amber-600 text-white shadow-xs ring-1 ring-amber-700'
                                                                : 'bg-slate-50 hover:bg-amber-50 text-slate-800 border border-slate-200'
                                                        }`}
                                                    >
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                                            <span>Demote</span>
                                                        </span>
                                                        <span className={`text-[10px] truncate max-w-full font-extrabold mt-0.5 ${isDemote ? 'text-amber-100' : 'text-slate-500'}`}>
                                                            {student.previousClassName ? `→ ${student.previousClassName}` : 'N/A'}
                                                        </span>
                                                    </button>

                                                    {/* 4. Leave */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleIndividualAction(student.id, 'leave')}
                                                        className={`py-2.5 px-1.5 rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center ${
                                                            isLeave
                                                                ? 'bg-slate-800 text-white shadow-xs ring-1 ring-slate-900'
                                                                : 'bg-slate-50 hover:bg-slate-200 text-slate-800 border border-slate-200'
                                                        }`}
                                                    >
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                                            <span>Leave</span>
                                                        </span>
                                                        <span className={`text-[10px] truncate max-w-full font-extrabold mt-0.5 ${isLeave ? 'text-slate-200' : 'text-slate-500'}`}>
                                                            SLC / Out
                                                        </span>
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
