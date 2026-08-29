import React, { useState, useEffect, useMemo, useRef } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    collection,
    doc,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    setDoc,
    query,
    where,
    getDocs,
    serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import {
    Award,
    Plus,
    Calendar,
    Search,
    Printer,
    Download,
    FileSpreadsheet,
    CheckCircle2,
    XCircle,
    Clock,
    AlertCircle,
    User,
    BookOpen,
    Edit2,
    Trash2,
    TrendingUp,
    ChevronDown,
    Filter,
    School,
    Check,
    FileText,
    Star,
    Layers,
    Upload,
    Palette,
    Settings2,
    ImageIcon
} from 'lucide-react';

const STANDARD_EXAM_PRESETS = [
    {
        id: 'first_term_2026',
        title: 'First Term Examination 2026',
        session: '2025-2026',
        status: 'active',
        description: 'First comprehensive academic term assessment.'
    },
    {
        id: 'mid_term_2026',
        title: 'Mid Term Examination 2026',
        session: '2025-2026',
        status: 'active',
        description: 'Mid-session evaluation test.'
    },
    {
        id: 'monthly_test',
        title: 'Monthly Class Test',
        session: '2025-2026',
        status: 'active',
        description: 'Monthly subject knowledge evaluation test.'
    },
    {
        id: 'final_term_2026',
        title: 'Annual / Final Examination 2026',
        session: '2025-2026',
        status: 'upcoming',
        description: 'Final annual comprehensive examination.'
    }
];

export default function Exams() {
    // --- State Management ---
    const [activeTab, setActiveTab] = useState('setup'); // 'setup' | 'gazette' | 'dmc'
    const [schoolId, setSchoolId] = useState('');
    const [schoolProfile, setSchoolProfile] = useState({
        name: 'School Name',
        profileImage: '',
        address: '',
        phone: '',
        email: ''
    });

    // Core Data
    const [exams, setExams] = useState([]);
    const [classes, setClasses] = useState([]);
    const [selectedExamId, setSelectedExamId] = useState('');
    const [selectedClassId, setSelectedClassId] = useState('');
    
    // Tab 2 & 3 Data
    const [students, setStudents] = useState([]);
    const [classMarksDocs, setClassMarksDocs] = useState([]);
    const [loadingData, setLoadingData] = useState(false);
    
    // Filters & Sorting
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'pass' | 'fail' | 'top10'
    const [sortBy, setSortBy] = useState('position'); // 'position' | 'roll' | 'name' | 'percentage' | 'obtained'
    const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'
    const [selectedStudentForDmc, setSelectedStudentForDmc] = useState(null);
    const [selectedStudentIdsForBatch, setSelectedStudentIdsForBatch] = useState(new Set());
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
    const [logoBase64, setLogoBase64] = useState(null);

    // DMC Template & Layout Customization State
    const [dmcLayout, setDmcLayout] = useState('standard'); // 'standard' | 'modern' | 'preprinted' | 'custom_bg'
    const [customBgImage, setCustomBgImage] = useState(null);
    const [showSchoolHeader, setShowSchoolHeader] = useState(true);
    const [showSignatures, setShowSignatures] = useState(true);

    const handleUploadCustomBg = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            setCustomBgImage(reader.result);
            setDmcLayout('custom_bg');
        };
        reader.readAsDataURL(file);
    };

    // Pre-convert school logo for sharp jsPDF rendering
    useEffect(() => {
        if (schoolProfile.profileImage) {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || img.width;
                    canvas.height = img.naturalHeight || img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const dataURL = canvas.toDataURL('image/png');
                    setLogoBase64(dataURL);
                } catch (e) {
                    console.warn("Logo canvas toDataURL error:", e);
                }
            };
            img.onerror = () => {
                fetch(schoolProfile.profileImage, { mode: 'cors' })
                    .then(res => res.blob())
                    .then(blob => {
                        const reader = new FileReader();
                        reader.onloadend = () => setLogoBase64(reader.result);
                        reader.readAsDataURL(blob);
                    })
                    .catch(err => console.warn("Fetch logo blob fallback error:", err));
            };
            img.src = schoolProfile.profileImage;
        } else {
            setLogoBase64(null);
        }
    }, [schoolProfile.profileImage]);

    // Modal States
    const [showExamModal, setShowExamModal] = useState(false);
    const [editingExam, setEditingExam] = useState(null);
    const [examForm, setExamForm] = useState({
        presetId: 'first_term_2026',
        title: 'First Term Examination 2026',
        session: '2025-2026',
        status: 'active',
        startDate: '',
        endDate: '',
        defaultTotalMarks: 100,
        passingMarks: 33,
        description: 'First comprehensive academic term assessment.'
    });

    // --- 1. Fetch School Session & Profile ---
    useEffect(() => {
        const session = localStorage.getItem('manual_session');
        if (session) {
            try {
                const { schoolId: id } = JSON.parse(session);
                setSchoolId(id);

                // Listen to School Profile Settings
                const profileRef = doc(db, `schools/${id}/settings`, 'profile');
                const unsubProfile = onSnapshot(profileRef, (snap) => {
                    if (snap.exists()) {
                        const d = snap.data();
                        setSchoolProfile({
                            name: d.name || 'School Name',
                            profileImage: d.profileImage || '',
                            address: d.address || '',
                            phone: d.phone || d.landline || '',
                            email: d.email || ''
                        });
                    }
                });

                // Listen to Exams List
                const examsRef = collection(db, `schools/${id}/exams`);
                const unsubExams = onSnapshot(examsRef, (snap) => {
                    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    // Sort active first, then by date
                    list.sort((a, b) => (a.status === 'active' ? -1 : 1));
                    setExams(list);

                    if (list.length > 0 && !selectedExamId) {
                        setSelectedExamId(list[0].id);
                    }
                });

                // Listen to Classes List
                const classesRef = collection(db, `schools/${id}/classes`);
                const unsubClasses = onSnapshot(classesRef, (snap) => {
                    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                    setClasses(list);

                    if (list.length > 0 && !selectedClassId) {
                        setSelectedClassId(list[0].id);
                    }
                });

                return () => {
                    unsubProfile();
                    unsubExams();
                    unsubClasses();
                };
            } catch (err) {
                console.error("Session parse error:", err);
            }
        }
    }, []);

    // --- 2. Real-time Listeners for Class Students & Exam Marks ---
    useEffect(() => {
        if (!schoolId || !selectedClassId) {
            setStudents([]);
            setClassMarksDocs([]);
            return;
        }

        setLoadingData(true);

        // Fetch students of this class
        const studentsRef = collection(db, `schools/${schoolId}/classes/${selectedClassId}/students`);
        const unsubStudents = onSnapshot(studentsRef, (snap) => {
            const list = snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    name: data.fullName || data.name || ((data.firstName || '') + ' ' + (data.lastName || '')).trim() || 'Student',
                    rollNumber: data.rollNumber || data.rollNo || '',
                    fatherName: data.fatherName || data.guardianName || '',
                    photoUrl: data.photoUrl || data.profilePic || data.avatar || '',
                    ...data
                };
            });
            // Sort students by Roll Number numerically / alphabetically
            list.sort((a, b) => {
                const rollA = parseInt(a.rollNumber) || 999999;
                const rollB = parseInt(b.rollNumber) || 999999;
                if (rollA !== rollB) return rollA - rollB;
                return a.name.localeCompare(b.name);
            });
            setStudents(list);
            // By default select all for batch print
            setSelectedStudentIdsForBatch(new Set(list.map(s => s.id)));
            setLoadingData(false);
        }, (err) => {
            console.error("Students stream error:", err);
            setLoadingData(false);
        });

        // Fetch exam_marks of this class
        const marksRef = collection(db, `schools/${schoolId}/classes/${selectedClassId}/exam_marks`);
        const unsubMarks = onSnapshot(marksRef, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setClassMarksDocs(list);
        }, (err) => {
            console.error("Marks stream error:", err);
        });

        return () => {
            unsubStudents();
            unsubMarks();
        };
    }, [schoolId, selectedClassId]);

    // Current Exam Object
    const currentExam = useMemo(() => {
        return exams.find(e => e.id === selectedExamId) || {
            id: selectedExamId || 'default',
            title: 'Term Examination',
            session: '2025-2026',
            defaultTotalMarks: 100,
            passingMarks: 33
        };
    }, [exams, selectedExamId]);

    // Current Class Object
    const currentClass = useMemo(() => {
        return classes.find(c => c.id === selectedClassId) || {
            id: selectedClassId,
            name: 'Selected Class',
            subjects: []
        };
    }, [classes, selectedClassId]);

    // --- 3. Compute Consolidated Tabulation Matrix ---
    const tabulationData = useMemo(() => {
        if (!selectedExamId || students.length === 0) return { subjects: [], rows: [], stats: {} };

        const selectedExamObj = exams.find(e => e.id === selectedExamId);
        const selectedExamTitle = (selectedExamObj?.title || currentExam?.title || '').toLowerCase().trim();
        const cleanSelectedId = (selectedExamId || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        // 1. Filter marks documents for the selected exam (resilient to ID & Title variations)
        const relevantMarksDocs = classMarksDocs.filter(d => {
            const docExamId = (d.examId || '').toString().toLowerCase();
            const docExamTitle = (d.examTitle || '').toString().toLowerCase().trim();
            const cleanDocId = d.id.toLowerCase().replace(/[^a-z0-9]/g, '');

            // Exact match
            if (docExamId === selectedExamId.toLowerCase() || d.id.startsWith(selectedExamId + '_')) return true;

            // Title match
            if (selectedExamTitle && docExamTitle && (selectedExamTitle === docExamTitle || selectedExamTitle.includes(docExamTitle) || docExamTitle.includes(selectedExamTitle))) return true;

            // Normalized slug match (e.g. first_term_2026 vs firsttermexamination2026)
            const cleanDocExamId = docExamId.replace(/[^a-z0-9]/g, '');
            if (cleanDocExamId && cleanSelectedId && (cleanDocExamId === cleanSelectedId || cleanSelectedId.includes(cleanDocExamId) || cleanDocExamId.includes(cleanSelectedId))) return true;

            // Prefix match on document id
            if (cleanSelectedId && cleanDocId.startsWith(cleanSelectedId)) return true;

            // Single exam fallback
            if (exams.length <= 1) return true;

            return false;
        });

        // 2. Discover all subjects for this class (teacher entered + class registered)
        const subjectsSet = new Set();
        const subjectConfigs = {}; // subject -> { totalMarks, passingMarks }

        relevantMarksDocs.forEach(doc => {
            const subjName = (doc.subject || '').trim();
            if (subjName) {
                subjectsSet.add(subjName);
                const teacherTotal = typeof doc.totalMarks === 'number' && doc.totalMarks > 0 ? doc.totalMarks : 100;
                const teacherPass = typeof doc.passingMarks === 'number' && doc.passingMarks > 0 ? doc.passingMarks : 33;
                subjectConfigs[subjName] = {
                    totalMarks: teacherTotal,
                    passingMarks: teacherPass,
                };
            }
        });

        // Also include registered class subjects
        const classSubjs = Array.isArray(currentClass.subjects) ? currentClass.subjects : [];
        classSubjs.forEach(s => {
            const clean = typeof s === 'string' ? s.trim() : (s?.name || '').trim();
            if (clean) {
                subjectsSet.add(clean);
                if (!subjectConfigs[clean]) {
                    subjectConfigs[clean] = {
                        totalMarks: 100,
                        passingMarks: 33
                    };
                }
            }
        });

        const subjectList = Array.from(subjectsSet).sort();

        // 3. Build Student Rows
        const studentRows = students.map(student => {
            const subjectMarks = {};
            let totalObtained = 0;
            let totalMax = 0;
            let subjectsEvaluatedCount = 0;
            let failedSubjectsCount = 0;
            let hasAnyAbsent = false;

            subjectList.forEach(subject => {
                const sConf = subjectConfigs[subject] || { totalMarks: 100, passingMarks: 33 };
                const marksDoc = relevantMarksDocs.find(d => (d.subject || '').trim().toLowerCase() === subject.toLowerCase());
                
                let entryData = null;
                if (marksDoc && marksDoc.marks && marksDoc.marks[student.id]) {
                    entryData = marksDoc.marks[student.id];
                }

                if (entryData) {
                    const isAbsent = entryData.isAbsent === true;
                    const obtained = typeof entryData.obtainedMarks === 'number' ? entryData.obtainedMarks : null;

                    subjectMarks[subject] = {
                        obtained: obtained,
                        isAbsent: isAbsent,
                        totalMarks: sConf.totalMarks,
                        passingMarks: sConf.passingMarks,
                        grade: entryData.grade || (isAbsent ? 'ABS' : obtained !== null ? calculateGrade(obtained, sConf.totalMarks) : '-'),
                        remarks: entryData.remarks || ''
                    };

                    totalMax += sConf.totalMarks;

                    if (isAbsent) {
                        hasAnyAbsent = true;
                        failedSubjectsCount++;
                    } else if (obtained !== null) {
                        totalObtained += obtained;
                        subjectsEvaluatedCount++;
                        if (obtained < sConf.passingMarks) {
                            failedSubjectsCount++;
                        }
                    }
                } else {
                    subjectMarks[subject] = {
                        obtained: null,
                        isAbsent: false,
                        totalMarks: sConf.totalMarks,
                        passingMarks: sConf.passingMarks,
                        grade: '-',
                        remarks: ''
                    };
                    totalMax += sConf.totalMarks;
                }
            });

            const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
            const isPassed = failedSubjectsCount === 0 && subjectsEvaluatedCount > 0;
            const overallGrade = calculateGrade(totalObtained, totalMax);

            // Extract live attendance from student document (0 extra cost)
            let attendancePct = '95%';
            if (typeof student.attendance === 'number') {
                attendancePct = `${student.attendance}%`;
            } else if (typeof student.attendancePercentage === 'number') {
                attendancePct = `${student.attendancePercentage}%`;
            } else if (typeof student.attendanceScore === 'number') {
                attendancePct = `${student.attendanceScore}%`;
            } else if (student.attendance && typeof student.attendance === 'object') {
                if (typeof student.attendance.percentage === 'number') {
                    attendancePct = `${student.attendance.percentage}%`;
                } else if (student.attendance.present !== undefined && student.attendance.total) {
                    attendancePct = `${Math.round((student.attendance.present / student.attendance.total) * 100)}%`;
                }
            } else if (typeof student.attendance === 'string' && student.attendance.trim()) {
                attendancePct = student.attendance.includes('%') ? student.attendance : `${student.attendance}%`;
            }

            return {
                studentId: student.id,
                name: student.name,
                rollNumber: student.rollNumber || 'N/A',
                fatherName: student.fatherName || 'N/A',
                photoUrl: student.photoUrl,
                attendance: attendancePct,
                subjectMarks,
                totalObtained,
                totalMax,
                percentage: parseFloat(percentage.toFixed(1)),
                grade: overallGrade,
                isPassed,
                failedSubjectsCount,
                subjectsEvaluatedCount,
                hasAnyAbsent,
                position: 0 // calculated in next step
            };
        });

        // 4. Calculate Class Positions (Rank by Total Obtained / Percentage)
        const rankedRows = [...studentRows].sort((a, b) => {
            if (b.totalObtained !== a.totalObtained) return b.totalObtained - a.totalObtained;
            return b.percentage - a.percentage;
        });

        const positionMap = {};
        rankedRows.forEach((row, idx) => {
            if (row.subjectsEvaluatedCount > 0 && row.totalObtained > 0) {
                positionMap[row.studentId] = idx + 1;
            } else {
                positionMap[row.studentId] = '-';
            }
        });

        const finalizedRows = studentRows.map(row => ({
            ...row,
            position: positionMap[row.studentId]
        }));

        // 5. Summary Statistics
        const evaluatedStudents = finalizedRows.filter(r => r.subjectsEvaluatedCount > 0);
        const passedCount = evaluatedStudents.filter(r => r.isPassed).length;
        const failedCount = evaluatedStudents.filter(r => !r.isPassed).length;
        const highestPct = evaluatedStudents.length > 0 ? Math.max(...evaluatedStudents.map(r => r.percentage)) : 0;
        const avgPct = evaluatedStudents.length > 0
            ? evaluatedStudents.reduce((acc, r) => acc + r.percentage, 0) / evaluatedStudents.length
            : 0;

        return {
            subjects: subjectList,
            subjectConfigs,
            rows: finalizedRows,
            stats: {
                totalStudents: students.length,
                evaluatedCount: evaluatedStudents.length,
                passedCount,
                failedCount,
                passingRate: evaluatedStudents.length > 0 ? ((passedCount / evaluatedStudents.length) * 100).toFixed(1) : '0',
                highestPercentage: highestPct.toFixed(1),
                averagePercentage: avgPct.toFixed(1)
            }
        };
    }, [students, classMarksDocs, selectedExamId, currentExam, currentClass]);

    // Helper: Grade Calculator
    function calculateGrade(obtained, total) {
        if (obtained === null || total <= 0) return '-';
        const pct = (obtained / total) * 100;
        if (pct >= 80) return 'A+';
        if (pct >= 70) return 'A';
        if (pct >= 60) return 'B';
        if (pct >= 50) return 'C';
        if (pct >= 40) return 'D';
        if (pct >= 33) return 'E';
        return 'F';
    }

    // Helper: Ordinal Suffix (1st, 2nd, 3rd)
    function getOrdinal(n) {
        if (typeof n !== 'number' || isNaN(n)) return n;
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    // --- Filtered Rows for Tabulation Sheet ---
    const filteredRows = useMemo(() => {
        let list = tabulationData.rows || [];

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(r =>
                r.name.toLowerCase().includes(q) ||
                r.rollNumber.toLowerCase().includes(q) ||
                r.fatherName.toLowerCase().includes(q)
            );
        }

        if (filterStatus === 'pass') {
            list = list.filter(r => r.isPassed);
        } else if (filterStatus === 'fail') {
            list = list.filter(r => !r.isPassed && r.subjectsEvaluatedCount > 0);
        } else if (filterStatus === 'top10') {
            list = [...list].filter(r => typeof r.position === 'number').sort((a, b) => a.position - b.position).slice(0, 10);
        }

        // Apply dynamic sorting (Default: Position 1st, 2nd, 3rd on top)
        list = [...list].sort((a, b) => {
            if (sortBy === 'position') {
                const posA = typeof a.position === 'number' ? a.position : 999999;
                const posB = typeof b.position === 'number' ? b.position : 999999;
                if (posA !== posB) return sortOrder === 'asc' ? posA - posB : posB - posA;
                return b.percentage - a.percentage;
            }
            if (sortBy === 'roll') {
                const rollA = parseInt(a.rollNumber) || 999999;
                const rollB = parseInt(b.rollNumber) || 999999;
                if (rollA !== rollB) return sortOrder === 'asc' ? rollA - rollB : rollB - rollA;
                return a.name.localeCompare(b.name);
            }
            if (sortBy === 'obtained') {
                return sortOrder === 'asc' ? a.totalObtained - b.totalObtained : b.totalObtained - a.totalObtained;
            }
            if (sortBy === 'percentage') {
                return sortOrder === 'asc' ? a.percentage - b.percentage : b.percentage - a.percentage;
            }
            if (sortBy === 'name') {
                return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
            }
            return 0;
        });

        return list;
    }, [tabulationData.rows, searchQuery, filterStatus, sortBy, sortOrder]);

    const handleToggleSort = (key) => {
        if (sortBy === key) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(key);
            if (key === 'percentage' || key === 'obtained') {
                setSortOrder('desc');
            } else {
                setSortOrder('asc');
            }
        }
    };

    // --- Actions: Create/Edit Exam ---
    const handleOpenCreateExam = () => {
        setEditingExam(null);
        const firstPreset = STANDARD_EXAM_PRESETS[0];
        setExamForm({
            presetId: firstPreset.id,
            title: firstPreset.title,
            session: firstPreset.session,
            status: firstPreset.status,
            startDate: new Date().toISOString().split('T')[0],
            endDate: '',
            defaultTotalMarks: 100,
            passingMarks: 33,
            description: firstPreset.description
        });
        setShowExamModal(true);
    };

    const handlePresetChange = (selectedId) => {
        const preset = STANDARD_EXAM_PRESETS.find(p => p.id === selectedId);
        if (preset) {
            setExamForm(prev => ({
                ...prev,
                presetId: preset.id,
                title: preset.id === 'custom' ? (prev.title || '') : preset.title,
                status: preset.status,
                description: preset.description
            }));
        }
    };

    const handleOpenEditExam = (exam) => {
        setEditingExam(exam);
        const matchedPreset = STANDARD_EXAM_PRESETS.find(p => p.id === exam.id || p.title === exam.title);
        setExamForm({
            presetId: matchedPreset ? matchedPreset.id : 'custom',
            title: exam.title || '',
            session: exam.session || '2025-2026',
            status: exam.status || 'active',
            startDate: exam.startDate || '',
            endDate: exam.endDate || '',
            defaultTotalMarks: exam.defaultTotalMarks || 100,
            passingMarks: exam.passingMarks || 33,
            description: exam.description || ''
        });
        setShowExamModal(true);
    };

    const handleSaveExam = async (e) => {
        e.preventDefault();
        if (!examForm.title.trim() || !schoolId) return;

        try {
            const dataToSave = {
                title: examForm.title.trim(),
                session: examForm.session.trim(),
                status: examForm.status,
                startDate: examForm.startDate || null,
                endDate: examForm.endDate || null,
                defaultTotalMarks: parseInt(examForm.defaultTotalMarks) || 100,
                passingMarks: parseInt(examForm.passingMarks) || 33,
                description: examForm.description.trim(),
                updatedAt: serverTimestamp()
            };

            let targetDocId = editingExam ? editingExam.id : '';
            if (!targetDocId) {
                if (examForm.presetId && examForm.presetId !== 'custom') {
                    targetDocId = examForm.presetId;
                } else {
                    targetDocId = examForm.title.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 40);
                }
                dataToSave.createdAt = serverTimestamp();
            }

            await setDoc(doc(db, `schools/${schoolId}/exams`, targetDocId), dataToSave, { merge: true });
            setSelectedExamId(targetDocId);
            setShowExamModal(false);
        } catch (err) {
            console.error("Save exam error:", err);
            alert("Failed to save exam: " + err.message);
        }
    };

    const handleDeleteExam = async (examId, title) => {
        if (!window.confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) return;
        try {
            await deleteDoc(doc(db, `schools/${schoolId}/exams`, examId));
            if (selectedExamId === examId) {
                const remaining = exams.filter(e => e.id !== examId);
                setSelectedExamId(remaining.length > 0 ? remaining[0].id : '');
            }
        } catch (err) {
            console.error("Delete exam error:", err);
            alert("Failed to delete: " + err.message);
        }
    };

    // --- Actions: Export CSV ---
    const handleExportCSV = () => {
        if (tabulationData.rows.length === 0) return;

        const headers = ['Roll No', 'Student Name', 'Father Name', ...tabulationData.subjects, 'Total Obtained', 'Max Marks', 'Percentage', 'Grade', 'Position', 'Status'];
        const csvRows = [headers.join(',')];

        tabulationData.rows.forEach(r => {
            const subjectScores = tabulationData.subjects.map(s => {
                const m = r.subjectMarks[s];
                if (!m) return '-';
                if (m.isAbsent) return 'ABS';
                return m.obtained !== null ? m.obtained : '-';
            });

            const rowData = [
                `"${r.rollNumber}"`,
                `"${r.name}"`,
                `"${r.fatherName}"`,
                ...subjectScores,
                r.totalObtained,
                r.totalMax,
                `"${r.percentage}%"`,
                `"${r.grade}"`,
                `"${r.position}"`,
                `"${r.isPassed ? 'PASSED' : 'FAILED'}"`
            ];
            csvRows.push(rowData.join(','));
        });

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${currentClass.name}_${currentExam.title}_Gazette.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- Actions: Print Triggers ---
    const handlePrintTabulation = () => {
        window.print();
    };

    const handleBatchPrintDmc = () => {
        window.print();
    };

    // --- Actions: Vector PDF Generation ---
    const generateStudentDmcPdf = async (studentRow, autoSave = true) => {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // 1. Background / Frame Layout Handling
        if (dmcLayout === 'custom_bg' && customBgImage) {
            try {
                doc.addImage(customBgImage, 'PNG', 0, 0, pageWidth, pageHeight);
            } catch (err) {
                console.warn("Custom background render error:", err);
            }
        } else if (dmcLayout === 'modern') {
            // Modern Academy: Elegant top accent banner
            doc.setFillColor(79, 70, 229);
            doc.rect(0, 0, pageWidth, 6, 'F');
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.6);
            doc.rect(8, 10, pageWidth - 16, pageHeight - 18);
        } else if (dmcLayout === 'standard') {
            // Classic Double Border Frame
            doc.setDrawColor(30, 41, 59); // slate-800
            doc.setLineWidth(1.2);
            doc.rect(8, 8, pageWidth - 16, pageHeight - 16);
            doc.setLineWidth(0.4);
            doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
        }
        // If 'preprinted', no background borders are drawn (clean blank stationery mode)

        // 2. School Logo & Header (Only if showSchoolHeader is true and not preprinted)
        const shouldShowHeader = showSchoolHeader && dmcLayout !== 'preprinted';
        if (shouldShowHeader) {
            let activeLogo = logoBase64;
            if (!activeLogo && schoolProfile.profileImage) {
                try {
                    activeLogo = await new Promise((resolve) => {
                        const img = new Image();
                        img.crossOrigin = 'Anonymous';
                        img.onload = () => {
                            try {
                                const canvas = document.createElement('canvas');
                                canvas.width = img.naturalWidth || img.width;
                                canvas.height = img.naturalHeight || img.height;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(img, 0, 0);
                                resolve(canvas.toDataURL('image/png'));
                            } catch (e) {
                                resolve(null);
                            }
                        };
                        img.onerror = () => resolve(null);
                        img.src = schoolProfile.profileImage;
                    });
                } catch (e) {
                    console.warn("Direct logo load error:", e);
                }
            }

            if (activeLogo) {
                try {
                    // Add School Logo on top-left: x=14, y=14, w=20, h=20
                    doc.addImage(activeLogo, 'PNG', 14, 14, 20, 20);
                } catch (err) {
                    console.warn("Could not render logo in PDF:", err);
                }
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.setTextColor(15, 23, 42);
            doc.text((schoolProfile.name || 'SMART PUBLIC SCHOOL').toUpperCase(), pageWidth / 2, 21, { align: 'center' });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(71, 85, 105);
            const contactInfo = `${schoolProfile.address || 'Campus Address'} ${schoolProfile.phone ? '• Phone: ' + schoolProfile.phone : ''}`;
            doc.text(contactInfo, pageWidth / 2, 27, { align: 'center' });

            // Title Badge
            doc.setFillColor(30, 41, 59);
            doc.roundedRect(pageWidth / 2 - 45, 33, 90, 7, 3, 3, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(255, 255, 255);
            doc.text('DETAILED MARKS CERTIFICATE (DMC)', pageWidth / 2, 38, { align: 'center' });
        }

        // 3. Student Details Box
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.roundedRect(14, 44, pageWidth - 28, 24, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);

        // Row 1
        doc.text('STUDENT NAME:', 18, 51);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text((studentRow.name || '').toUpperCase(), 45, 51);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text('CLASS / SECTION:', 115, 51);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text((currentClass.name || '').toUpperCase(), 148, 51);

        // Row 2
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text("FATHER'S NAME:", 18, 58);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text(studentRow.fatherName || 'N/A', 45, 58);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text('EXAMINATION:', 115, 58);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text(currentExam.title || 'Term Exam', 148, 58);

        // Row 3
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text('ROLL NUMBER:', 18, 65);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(79, 70, 229);
        doc.text(studentRow.rollNumber || 'N/A', 45, 65);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text('ACADEMIC SESSION:', 115, 65);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text(currentExam.session || '2025-2026', 148, 65);

        // 4. Subject-wise Marks Table (autoTable)
        const tableBody = tabulationData.subjects.map((subj, idx) => {
            const m = studentRow.subjectMarks[subj];
            const totalMarks = m?.totalMarks || 100;
            const passMarks = m?.passingMarks || 33;
            const obtained = m ? (m.isAbsent ? 'ABS' : m.obtained !== null ? m.obtained : '-') : '-';
            const grade = m ? m.grade : '-';
            const remarks = m?.remarks || (grade === 'A+' ? 'Excellent' : grade === 'A' ? 'Very Good' : grade === 'B' ? 'Good' : grade === 'F' ? 'Needs Improvement' : 'Satisfactory');

            return [
                idx + 1,
                subj,
                totalMarks,
                passMarks,
                obtained,
                grade,
                remarks
            ];
        });

        autoTable(doc, {
            startY: 72,
            margin: { left: 14, right: 14 },
            head: [['Sr.', 'Subject Name', 'Total Marks', 'Pass Marks', 'Marks Obtained', 'Grade', 'Remarks']],
            body: tableBody,
            foot: [[
                '—',
                'GRAND TOTAL',
                studentRow.totalMax,
                '—',
                studentRow.totalObtained,
                studentRow.grade,
                studentRow.isPassed ? 'PROMOTED / PASSED' : 'HELD / REAPPEAR'
            ]],
            theme: 'grid',
            styles: {
                fontSize: 8.5,
                cellPadding: 3,
                textColor: [15, 23, 42],
                lineColor: [203, 213, 225],
                lineWidth: 0.2
            },
            headStyles: {
                fillColor: [241, 245, 249],
                textColor: [15, 23, 42],
                fontStyle: 'bold',
                halign: 'center'
            },
            footStyles: {
                fillColor: [241, 245, 249],
                textColor: [15, 23, 42],
                fontStyle: 'bold',
                halign: 'center'
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 10 },
                1: { halign: 'left', fontStyle: 'bold', cellWidth: 42 },
                2: { halign: 'center', cellWidth: 24 },
                3: { halign: 'center', cellWidth: 24 },
                4: { halign: 'center', fontStyle: 'bold', cellWidth: 28 },
                5: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
                6: { halign: 'left', fontStyle: 'italic', cellWidth: 'auto' }
            }
        });

        const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 160;

        // 5. Summary Strip Box
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(14, finalY + 5, pageWidth - 28, 16, 2, 2, 'FD');

        const colWidth = (pageWidth - 28) / 5;
        
        // 1. Percentage
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('PERCENTAGE', 14 + colWidth * 0.5, finalY + 10, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(`${studentRow.percentage}%`, 14 + colWidth * 0.5, finalY + 17, { align: 'center' });

        // 2. Overall Grade
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('OVERALL GRADE', 14 + colWidth * 1.5, finalY + 10, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(79, 70, 229);
        doc.text(`${studentRow.grade}`, 14 + colWidth * 1.5, finalY + 17, { align: 'center' });

        // 3. Class Position
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('CLASS POSITION', 14 + colWidth * 2.5, finalY + 10, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(16, 185, 129);
        doc.text(`${getOrdinal(studentRow.position)}`, 14 + colWidth * 2.5, finalY + 17, { align: 'center' });

        // 4. Attendance Percentage
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('ATTENDANCE', 14 + colWidth * 3.5, finalY + 10, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text(`${studentRow.attendance || '95%'}`, 14 + colWidth * 3.5, finalY + 17, { align: 'center' });

        // 5. Final Status
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text('RESULT STATUS', 14 + colWidth * 4.5, finalY + 10, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        if (studentRow.isPassed) {
            doc.setTextColor(16, 185, 129);
            doc.text('PASSED', 14 + colWidth * 4.5, finalY + 17, { align: 'center' });
        } else {
            doc.setTextColor(225, 29, 72);
            doc.text('FAILED', 14 + colWidth * 4.5, finalY + 17, { align: 'center' });
        }

        // 6. Signatures (Optional)
        if (showSignatures) {
            const sigY = pageHeight - 35;
            doc.setDrawColor(71, 85, 105);
            doc.setLineWidth(0.4);

            // Signature line 1: Class Teacher
            doc.line(22, sigY, 65, sigY);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(51, 65, 85);
            doc.text('CLASS TEACHER', 43.5, sigY + 5, { align: 'center' });

            // Signature line 2: Controller of Exams
            doc.line(pageWidth / 2 - 22, sigY, pageWidth / 2 + 22, sigY);
            doc.text('CONTROLLER OF EXAMS', pageWidth / 2, sigY + 5, { align: 'center' });

            // Signature line 3: Principal
            doc.line(pageWidth - 65, sigY, pageWidth - 22, sigY);
            doc.text('PRINCIPAL STAMP & SIGN', pageWidth - 43.5, sigY + 5, { align: 'center' });
        }

        // Security Footer
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`Generated securely via School Management System • Date: ${new Date().toLocaleDateString()}`, pageWidth / 2, pageHeight - 14, { align: 'center' });

        if (autoSave) {
            const cleanName = (studentRow.name || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
            doc.save(`${cleanName}_Roll_${studentRow.rollNumber}_DMC.pdf`);
        }
        return doc;
    };

    const handleBatchDownloadPdf = async () => {
        const selectedRows = tabulationData.rows.filter(r => selectedStudentIdsForBatch.has(r.studentId));
        if (selectedRows.length === 0) return;

        setIsDownloadingPdf(true);
        try {
            for (let i = 0; i < selectedRows.length; i++) {
                const student = selectedRows[i];
                generateStudentDmcPdf(student, true);
                if (selectedRows.length > 1) {
                    await new Promise(res => setTimeout(res, 500));
                }
            }
        } catch (err) {
            console.error("Batch download PDF error:", err);
            alert("PDF Download failed: " + err.message);
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 w-full space-y-6">
            {/* Scoped Print Styles for Clean Page-Breaks */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    /* Hide sidebar, navigation, headers, and UI controls */
                    .sidebar, nav, .no-print, button, input, select, .tab-navigation, header {
                        display: none !important;
                    }
                    body {
                        background: white !important;
                        color: black !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .print-only {
                        display: block !important;
                    }
                    .dmc-card-page {
                        page-break-after: always !important;
                        break-after: page !important;
                        margin: 0 !important;
                        padding: 20px !important;
                        height: 100vh !important;
                        box-sizing: border-box !important;
                    }
                    .gazette-print-table {
                        width: 100% !important;
                        border-collapse: collapse !important;
                        font-size: 10pt !important;
                    }
                    .gazette-print-table th, .gazette-print-table td {
                        border: 1px solid #333 !important;
                        padding: 4px 6px !important;
                    }
                }
            `}} />

            {/* --- Top Header & Breadcrumbs --- */}
            <div className="no-print flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                        <Award className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Exams & Result Center</h1>
                            <span className="px-2.5 py-0.5 text-xs font-bold bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
                                {schoolProfile.name}
                            </span>
                        </div>
                        <p className="text-sm font-medium text-slate-500">
                            Schedule terms, examine class gazettes, and generate 1-click printable student report cards
                        </p>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div className="flex items-center bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                    <button
                        onClick={() => setActiveTab('setup')}
                        className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                            activeTab === 'setup'
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Layers className="w-4 h-4" />
                        Exam Terms
                    </button>
                    <button
                        onClick={() => setActiveTab('gazette')}
                        className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                            activeTab === 'gazette'
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <FileSpreadsheet className="w-4 h-4" />
                        Class Gazette
                    </button>
                    <button
                        onClick={() => setActiveTab('dmc')}
                        className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                            activeTab === 'dmc'
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Printer className="w-4 h-4" />
                        Result Cards (DMC)
                    </button>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* TAB 1: EXAMS SETUP & SCHEDULING                                          */}
            {/* ========================================================================= */}
            {activeTab === 'setup' && (
                <div className="no-print space-y-6">
                    {/* Action Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Examination Terms & Sessions</h2>
                            <p className="text-xs text-slate-500">Configure academic terms available for marks entry across Teacher Mobile Apps</p>
                        </div>
                        <button
                            onClick={handleOpenCreateExam}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-100 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Create New Exam Term
                        </button>
                    </div>

                    {/* Exams Cards Grid */}
                    {exams.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
                            <Award className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                            <h3 className="text-base font-bold text-slate-800">No Exam Terms Created Yet</h3>
                            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                                Create your first examination term (e.g., First Term Examination 2026) so teachers can begin submitting subject marks.
                            </p>
                            <button
                                onClick={handleOpenCreateExam}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-sm"
                            >
                                <Plus className="w-4 h-4" />
                                Add First Exam
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {exams.map(exam => {
                                const isActive = exam.status === 'active';
                                const isUpcoming = exam.status === 'upcoming';
                                return (
                                    <div
                                        key={exam.id}
                                        className={`bg-white rounded-2xl p-6 border transition-all hover:shadow-md ${
                                            isActive ? 'border-indigo-200 ring-2 ring-indigo-500/10' : 'border-slate-200'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-3">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md ${
                                                        isActive
                                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                            : isUpcoming
                                                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                                                    }`}>
                                                        {exam.status || 'Active'}
                                                    </span>
                                                    <span className="text-xs font-semibold text-slate-400">
                                                        Session: {exam.session || 'N/A'}
                                                    </span>
                                                </div>
                                                <h3 className="text-lg font-bold text-slate-800">{exam.title}</h3>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleOpenEditExam(exam)}
                                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    title="Edit Exam"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteExam(exam.id, exam.title)}
                                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                    title="Delete Exam"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {exam.description && (
                                            <p className="text-xs text-slate-500 line-clamp-2 mb-4">
                                                {exam.description}
                                            </p>
                                        )}

                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 mb-4 text-xs">
                                            <div className="flex items-center justify-between text-slate-600">
                                                <span className="text-slate-400 text-[10px] font-bold uppercase">Schedule</span>
                                                <span className="font-semibold">{exam.startDate ? `${exam.startDate} ${exam.endDate ? `to ${exam.endDate}` : ''}` : 'Active Term'}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    setSelectedExamId(exam.id);
                                                    setActiveTab('gazette');
                                                }}
                                                className="flex-1 py-2 text-center text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                                            >
                                                View Class Gazette
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedExamId(exam.id);
                                                    setActiveTab('dmc');
                                                }}
                                                className="flex-1 py-2 text-center text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                            >
                                                Print Result Cards
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: CLASS GAZETTE / TABULATION SHEET                                  */}
            {/* ========================================================================= */}
            {activeTab === 'gazette' && (
                <div className="space-y-6">
                    {/* Control Panel: Class & Exam Selectors */}
                    <div className="no-print bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Exam Term Selector */}
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Select Exam Term</label>
                                    <select
                                        value={selectedExamId}
                                        onChange={(e) => setSelectedExamId(e.target.value)}
                                        className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    >
                                        {exams.map(e => (
                                            <option key={e.id} value={e.id}>{e.title} ({e.session || 'Term'})</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Class Selector */}
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Select Class</label>
                                    <select
                                        value={selectedClassId}
                                        onChange={(e) => setSelectedClassId(e.target.value)}
                                        className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    >
                                        {classes.map(c => (
                                            <option key={c.id} value={c.id}>{c.name || 'Class'}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Export & Print Action Buttons */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleExportCSV}
                                    disabled={tabulationData.rows.length === 0}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
                                >
                                    <Download className="w-4 h-4" />
                                    Export CSV
                                </button>
                                <button
                                    onClick={handlePrintTabulation}
                                    disabled={tabulationData.rows.length === 0}
                                    className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-100 transition-colors disabled:opacity-50"
                                >
                                    <Printer className="w-4 h-4" />
                                    Print Gazette
                                </button>
                            </div>
                        </div>

                        {/* Search & Filter Bar */}
                        <div className="flex flex-col sm:flex-row items-center gap-3 pt-3 border-t border-slate-100">
                            <div className="relative flex-1 w-full">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Search student by name or roll number..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="flex items-center gap-1.5 w-full sm:w-auto">
                                {[
                                    { id: 'all', label: 'All' },
                                    { id: 'pass', label: 'Passed' },
                                    { id: 'fail', label: 'Failed' },
                                    { id: 'top10', label: 'Top 10' }
                                ].map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => setFilterStatus(f.id)}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                                            filterStatus === f.id
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Summary Metric Stats */}
                    <div className="no-print grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Students</span>
                            <span className="text-xl font-black text-slate-800">{tabulationData.stats.totalStudents || 0}</span>
                        </div>
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Evaluated</span>
                            <span className="text-xl font-black text-indigo-600">{tabulationData.stats.evaluatedCount || 0}</span>
                        </div>
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Passed</span>
                            <span className="text-xl font-black text-emerald-600">{tabulationData.stats.passedCount || 0}</span>
                        </div>
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Failed</span>
                            <span className="text-xl font-black text-rose-600">{tabulationData.stats.failedCount || 0}</span>
                        </div>
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Pass Rate</span>
                            <span className="text-xl font-black text-slate-800">{tabulationData.stats.passingRate || 0}%</span>
                        </div>
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Highest Score</span>
                            <span className="text-xl font-black text-amber-500">{tabulationData.stats.highestPercentage || 0}%</span>
                        </div>
                    </div>

                    {/* Print Header for Tabulation Gazette */}
                    <div className="hidden print:block text-center mb-6 pb-4 border-b-2 border-slate-800">
                        <h1 className="text-xl font-black uppercase tracking-wider">{schoolProfile.name}</h1>
                        <p className="text-xs font-semibold">{schoolProfile.address} • Phone: {schoolProfile.phone}</p>
                        <div className="mt-2 inline-block px-4 py-1 bg-slate-100 border border-slate-800 rounded">
                            <h2 className="text-sm font-black uppercase">
                                TABULATION SHEET / GAZETTE • {currentClass.name} • {currentExam.title} ({currentExam.session})
                            </h2>
                        </div>
                    </div>

                    {/* Tabulation Table */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        {loadingData ? (
                            <div className="p-12 text-center text-slate-400">
                                <div className="inline-block animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mb-2" />
                                <p className="text-xs font-bold">Loading examination records...</p>
                            </div>
                        ) : filteredRows.length === 0 ? (
                            <div className="p-12 text-center text-slate-400">
                                <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                <p className="text-sm font-bold text-slate-700">No student records found</p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Ensure students are enrolled in this class and teachers have submitted marks via their mobile apps.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse gazette-print-table">
                                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider">
                                        <tr>
                                            <th 
                                                onClick={() => handleToggleSort('roll')} 
                                                className="p-3.5 text-center w-14 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                            >
                                                <div className="flex items-center justify-center gap-1">
                                                    <span>Roll</span>
                                                    {sortBy === 'roll' && (<span className="text-indigo-600">{sortOrder === 'asc' ? '▲' : '▼'}</span>)}
                                                </div>
                                            </th>
                                            <th 
                                                onClick={() => handleToggleSort('name')} 
                                                className="p-3.5 min-w-[140px] cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                            >
                                                <div className="flex items-center gap-1">
                                                    <span>Student Name</span>
                                                    {sortBy === 'name' && (<span className="text-indigo-600">{sortOrder === 'asc' ? '▲' : '▼'}</span>)}
                                                </div>
                                            </th>
                                            {tabulationData.subjects.map(subj => (
                                                <th key={subj} className="p-3.5 text-center min-w-[70px]">
                                                    <div>{subj}</div>
                                                    <div className="text-[9px] font-normal text-slate-400">
                                                        Max: {tabulationData.subjectConfigs[subj]?.totalMarks || 100}
                                                    </div>
                                                </th>
                                            ))}
                                            <th 
                                                onClick={() => handleToggleSort('obtained')} 
                                                className="p-3.5 text-center font-black cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                            >
                                                <div className="flex items-center justify-center gap-1">
                                                    <span>Obtained</span>
                                                    {sortBy === 'obtained' && (<span className="text-indigo-600">{sortOrder === 'asc' ? '▲' : '▼'}</span>)}
                                                </div>
                                            </th>
                                            <th 
                                                onClick={() => handleToggleSort('percentage')} 
                                                className="p-3.5 text-center font-black cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                            >
                                                <div className="flex items-center justify-center gap-1">
                                                    <span>%</span>
                                                    {sortBy === 'percentage' && (<span className="text-indigo-600">{sortOrder === 'asc' ? '▲' : '▼'}</span>)}
                                                </div>
                                            </th>
                                            <th className="p-3.5 text-center font-black">Grade</th>
                                            <th 
                                                onClick={() => handleToggleSort('position')} 
                                                className="p-3.5 text-center font-black cursor-pointer bg-indigo-50/50 hover:bg-indigo-100 text-indigo-700 transition-colors select-none"
                                                title="Click to toggle 1st, 2nd, 3rd positions ascending / descending"
                                            >
                                                <div className="flex items-center justify-center gap-1">
                                                    <span>Pos</span>
                                                    {sortBy === 'position' && (<span className="text-indigo-600">{sortOrder === 'asc' ? '▲ (1st)' : '▼'}</span>)}
                                                </div>
                                            </th>
                                            <th className="p-3.5 text-center font-black">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                                        {filteredRows.map((row, idx) => (
                                            <tr key={row.studentId} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="p-3.5 text-center font-bold text-indigo-600 bg-indigo-50/20">
                                                    {row.rollNumber}
                                                </td>
                                                <td className="p-3.5">
                                                    <div className="font-bold text-slate-800">{row.name}</div>
                                                    <div className="text-[10px] text-slate-400 font-normal">S/O: {row.fatherName}</div>
                                                </td>

                                                {tabulationData.subjects.map(subj => {
                                                    const m = row.subjectMarks[subj];
                                                    if (!m || m.obtained === null) {
                                                        return (
                                                            <td key={subj} className="p-3.5 text-center text-slate-300">
                                                                {m?.isAbsent ? <span className="text-rose-500 font-bold">ABS</span> : '-'}
                                                            </td>
                                                        );
                                                    }
                                                    const isFail = m.obtained < m.passingMarks;
                                                    return (
                                                        <td key={subj} className="p-3.5 text-center font-bold">
                                                            <span className={isFail ? 'text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded' : 'text-slate-800'}>
                                                                {m.obtained}
                                                            </span>
                                                        </td>
                                                    );
                                                })}

                                                <td className="p-3.5 text-center font-black text-slate-900 bg-slate-50/50">
                                                    {row.totalObtained} <span className="text-[10px] font-normal text-slate-400">/ {row.totalMax}</span>
                                                </td>
                                                <td className="p-3.5 text-center font-black text-slate-800">
                                                    {row.percentage}%
                                                </td>
                                                <td className="p-3.5 text-center">
                                                    <span className={`px-2 py-0.5 rounded font-black text-[11px] ${
                                                        row.grade === 'A+' ? 'bg-emerald-100 text-emerald-800' :
                                                        row.grade === 'A' ? 'bg-emerald-50 text-emerald-700' :
                                                        row.grade === 'B' ? 'bg-blue-50 text-blue-700' :
                                                        row.grade === 'C' ? 'bg-amber-50 text-amber-700' :
                                                        row.grade === 'F' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                                                    }`}>
                                                        {row.grade}
                                                    </span>
                                                </td>
                                                <td className="p-3.5 text-center font-black text-indigo-700">
                                                    {getOrdinal(row.position)}
                                                </td>
                                                <td className="p-3.5 text-center">
                                                    {row.subjectsEvaluatedCount === 0 ? (
                                                        <span className="text-slate-400 font-semibold text-[10px]">Pending</span>
                                                    ) : row.isPassed ? (
                                                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">PASS</span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-black text-[10px]">FAIL</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: 1-CLICK PRINTABLE RESULT CARDS (DMC)                               */}
            {/* ========================================================================= */}
            {activeTab === 'dmc' && (
                <div className="space-y-6">
                    {/* Control Panel */}
                    <div className="no-print bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Exam Term</label>
                                <select
                                    value={selectedExamId}
                                    onChange={(e) => setSelectedExamId(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:outline-none"
                                >
                                    {exams.map(e => (
                                        <option key={e.id} value={e.id}>{e.title}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Class</label>
                                <select
                                    value={selectedClassId}
                                    onChange={(e) => setSelectedClassId(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:outline-none"
                                >
                                    {classes.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                onClick={() => {
                                    if (selectedStudentIdsForBatch.size === students.length) {
                                        setSelectedStudentIdsForBatch(new Set());
                                    } else {
                                        setSelectedStudentIdsForBatch(new Set(students.map(s => s.id)));
                                    }
                                }}
                                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                            >
                                {selectedStudentIdsForBatch.size === students.length ? 'Deselect All' : 'Select All (' + students.length + ')'}
                            </button>
                            <button
                                onClick={handleBatchPrintDmc}
                                disabled={selectedStudentIdsForBatch.size === 0}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-black rounded-xl shadow-lg shadow-indigo-200 transition-all disabled:opacity-50"
                            >
                                <Printer className="w-4 h-4" />
                                1-Click Batch Print ({selectedStudentIdsForBatch.size})
                            </button>
                            <button
                                onClick={handleBatchDownloadPdf}
                                disabled={selectedStudentIdsForBatch.size === 0 || isDownloadingPdf}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-200 transition-all disabled:opacity-50"
                            >
                                <Download className="w-4 h-4" />
                                {isDownloadingPdf ? 'Generating PDFs...' : `Download PDF (${selectedStudentIdsForBatch.size})`}
                            </button>
                        </div>

                        {/* DMC Card Design & Layout Customizer Toolbar */}
                        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
                                    <Palette className="w-3.5 h-3.5 text-indigo-600" />
                                    Card Layout:
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                                    <button
                                        onClick={() => setDmcLayout('standard')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                            dmcLayout === 'standard' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        Standard / Board
                                    </button>
                                    <button
                                        onClick={() => setDmcLayout('modern')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                            dmcLayout === 'modern' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        Modern Academy
                                    </button>
                                    <button
                                        onClick={() => setDmcLayout('preprinted')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                            dmcLayout === 'preprinted' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                        title="Prints only dynamic student data & marks (hides headers/borders) for physical pre-printed school stationery"
                                    >
                                        Pre-Printed Stationery
                                    </button>
                                    <button
                                        onClick={() => setDmcLayout('custom_bg')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                            dmcLayout === 'custom_bg' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        Custom Background Artwork
                                    </button>
                                </div>
                            </div>

                            {/* Upload School Custom Artwork Frame Button */}
                            {dmcLayout === 'custom_bg' && (
                                <div className="flex items-center gap-2">
                                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200 transition-colors">
                                        <Upload className="w-3.5 h-3.5" />
                                        {customBgImage ? 'Change Artwork Image' : 'Upload School DMC Background (PNG/JPG)'}
                                        <input
                                            type="file"
                                            accept="image/png, image/jpeg, image/jpg"
                                            onChange={handleUploadCustomBg}
                                            className="hidden"
                                        />
                                    </label>
                                    {customBgImage && (
                                        <span className="text-[11px] text-emerald-600 font-bold">✓ Artwork Loaded</span>
                                    )}
                                </div>
                            )}

                            {/* Quick Header and Signature Toggles */}
                            <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={showSchoolHeader}
                                        onChange={(e) => setShowSchoolHeader(e.target.checked)}
                                        className="rounded text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span>Header & Logo</span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={showSignatures}
                                        onChange={(e) => setShowSignatures(e.target.checked)}
                                        className="rounded text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span>Signature Lines</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Interactive Student Card Grid (Screen Preview) */}
                    <div className="no-print grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {tabulationData.rows.map(studentRow => {
                            const isSelected = selectedStudentIdsForBatch.has(studentRow.studentId);
                            return (
                                <div
                                    key={studentRow.studentId}
                                    className={`bg-white rounded-2xl p-5 border transition-all hover:shadow-md cursor-pointer ${
                                        isSelected ? 'border-indigo-300 ring-2 ring-indigo-500/10' : 'border-slate-200 opacity-75'
                                    }`}
                                    onClick={() => {
                                        const next = new Set(selectedStudentIdsForBatch);
                                        if (next.has(studentRow.studentId)) next.delete(studentRow.studentId);
                                        else next.add(studentRow.studentId);
                                        setSelectedStudentIdsForBatch(next);
                                    }}
                                >
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 font-black flex items-center justify-center border border-indigo-100 text-sm">
                                                {studentRow.rollNumber}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 text-sm">{studentRow.name}</h4>
                                                <p className="text-xs text-slate-400">S/O {studentRow.fatherName}</p>
                                            </div>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => {}} // Handled by card click
                                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        />
                                    </div>

                                    <div className="grid grid-cols-4 gap-1.5 p-2.5 bg-slate-50 rounded-xl text-center text-xs mb-3 border border-slate-100">
                                        <div>
                                            <span className="text-[9px] text-slate-400 block uppercase font-bold">Obtained</span>
                                            <span className="font-black text-slate-800 text-[11px]">{studentRow.totalObtained} / {studentRow.totalMax}</span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] text-slate-400 block uppercase font-bold">Grade</span>
                                            <span className="font-black text-indigo-600 text-[11px]">{studentRow.grade}</span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] text-slate-400 block uppercase font-bold">Position</span>
                                            <span className="font-black text-emerald-600 text-[11px]">{getOrdinal(studentRow.position)}</span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] text-slate-400 block uppercase font-bold">Attendance</span>
                                            <span className="font-black text-blue-600 text-[11px]">{studentRow.attendance || '95%'}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedStudentForDmc(studentRow);
                                            }}
                                            className="flex-1 py-2 text-center text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-100"
                                        >
                                            Preview Card
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                generateStudentDmcPdf(studentRow, true);
                                            }}
                                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200"
                                            title="Download PDF Result Card"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            PDF
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ========================================================================= */}
                    {/* BATCH PRINT CONTAINER (Visible only in Print Mode or Preview)             */}
                    {/* ========================================================================= */}
                    <div className="hidden print:block">
                        {tabulationData.rows
                            .filter(r => selectedStudentIdsForBatch.has(r.studentId))
                            .map((studentRow, idx) => (
                                <div
                                    key={studentRow.studentId}
                                    className="dmc-card-page"
                                    style={
                                        (dmcLayout === 'custom_bg' && customBgImage)
                                            ? { backgroundImage: 'url(' + customBgImage + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }
                                            : {}
                                    }
                                >
                                    <div className={`p-8 rounded-2xl h-full flex flex-col justify-between relative ${
                                        dmcLayout === 'preprinted' ? 'bg-transparent border-0' :
                                        dmcLayout === 'modern' ? 'bg-white border-2 border-indigo-200 shadow-sm' :
                                        dmcLayout === 'custom_bg' ? 'bg-transparent border-0' :
                                        'bg-white border-4 border-double border-slate-800'
                                    }`}>
                                        {/* Corner Decorative Badges */}
                                        {dmcLayout !== 'preprinted' && (
                                            <>
                                                <div className="absolute top-2 left-2 text-[10px] font-bold text-slate-400 tracking-widest uppercase">
                                                    Official Student Assessment Report
                                                </div>
                                                <div className="absolute top-2 right-2 text-[10px] font-bold text-slate-400">
                                                    Roll: #{studentRow.rollNumber}
                                                </div>
                                            </>
                                        )}

                                        {/* 1. School Header */}
                                        {(showSchoolHeader && dmcLayout !== 'preprinted') && (
                                            <div>
                                                <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4 mb-4">
                                                    <div className="w-20 h-20 flex items-center justify-center">
                                                        {schoolProfile.profileImage ? (
                                                            <img src={schoolProfile.profileImage} alt="Logo" className="max-h-20 max-w-20 object-contain" />
                                                        ) : (
                                                            <div className="w-16 h-16 rounded-full border-2 border-slate-800 flex items-center justify-center font-black text-xl text-slate-800">
                                                                {schoolProfile.name.substring(0, 2).toUpperCase()}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex-1 text-center px-4">
                                                        <h1 className="text-2xl font-black tracking-wider uppercase text-slate-900">
                                                            {schoolProfile.name}
                                                        </h1>
                                                        <p className="text-xs font-semibold text-slate-600">
                                                            {schoolProfile.address || 'Campus Address'} • Contact: {schoolProfile.phone || 'Phone'}
                                                        </p>
                                                        <div className="mt-2 inline-block px-5 py-1 bg-slate-900 text-white rounded-full">
                                                            <h2 className="text-xs font-black uppercase tracking-widest">
                                                                DETAILED MARKS CERTIFICATE (DMC)
                                                            </h2>
                                                        </div>
                                                    </div>

                                                    <div className="w-20 text-right">
                                                        <div className="w-16 h-20 border border-slate-300 rounded bg-slate-50 flex items-center justify-center text-[10px] text-slate-400 text-center ml-auto">
                                                            Student Photo
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* 2. Student Information Table */}
                                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200 mb-5">
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Student Name:</span> <span className="font-black text-slate-900 text-sm ml-1">{studentRow.name}</span></div>
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Class / Section:</span> <span className="font-black text-slate-900 ml-1">{currentClass.name}</span></div>
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Father's Name:</span> <span className="font-semibold text-slate-800 ml-1">{studentRow.fatherName}</span></div>
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Examination:</span> <span className="font-bold text-slate-800 ml-1">{currentExam.title}</span></div>
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Roll Number:</span> <span className="font-black text-slate-900 ml-1">{studentRow.rollNumber}</span></div>
                                            <div><span className="font-bold text-slate-500 uppercase text-[10px]">Academic Session:</span> <span className="font-bold text-slate-800 ml-1">{currentExam.session || '2025-2026'}</span></div>
                                        </div>

                                            {/* 3. Subject-wise Marks Table */}
                                            <table className="w-full text-xs border-collapse border border-slate-400 mb-6">
                                                <thead>
                                                    <tr className="bg-slate-100 text-slate-800 text-[11px] font-black uppercase text-center border-b border-slate-400">
                                                        <th className="border border-slate-400 p-2 w-12">Sr.</th>
                                                        <th className="border border-slate-400 p-2 text-left">Subject</th>
                                                        <th className="border border-slate-400 p-2 w-20">Total Marks</th>
                                                        <th className="border border-slate-400 p-2 w-20">Pass Marks</th>
                                                        <th className="border border-slate-400 p-2 w-24">Marks Obtained</th>
                                                        <th className="border border-slate-400 p-2 w-16">Grade</th>
                                                        <th className="border border-slate-400 p-2 text-left">Remarks</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {tabulationData.subjects.map((subj, sIdx) => {
                                                        const m = studentRow.subjectMarks[subj];
                                                        const obtained = m ? (m.isAbsent ? 'ABS' : m.obtained !== null ? m.obtained : '-') : '-';
                                                        const grade = m ? m.grade : '-';
                                                        const isFail = m && m.obtained !== null && m.obtained < m.passingMarks;

                                                        return (
                                                            <tr key={subj} className="text-center font-medium">
                                                                <td className="border border-slate-400 p-2 text-slate-500">{sIdx + 1}</td>
                                                                <td className="border border-slate-400 p-2 text-left font-bold text-slate-900">{subj}</td>
                                                                <td className="border border-slate-400 p-2 font-semibold">{m?.totalMarks || 100}</td>
                                                                <td className="border border-slate-400 p-2 font-semibold">{m?.passingMarks || 33}</td>
                                                                <td className={`border border-slate-400 p-2 font-black text-sm ${isFail ? 'text-rose-600' : 'text-slate-900'}`}>
                                                                    {obtained}
                                                                </td>
                                                                <td className="border border-slate-400 p-2 font-black">{grade}</td>
                                                                <td className="border border-slate-400 p-2 text-left text-[11px] text-slate-600 italic">
                                                                    {m?.remarks || (grade === 'A+' ? 'Excellent' : grade === 'A' ? 'Very Good' : grade === 'B' ? 'Good' : grade === 'F' ? 'Needs Improvement' : 'Satisfactory')}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="bg-slate-100 font-black text-sm text-center border-t-2 border-slate-800">
                                                        <td colSpan={2} className="border border-slate-400 p-2 text-left uppercase">Grand Total</td>
                                                        <td className="border border-slate-400 p-2">{studentRow.totalMax}</td>
                                                        <td className="border border-slate-400 p-2">-</td>
                                                        <td className="border border-slate-400 p-2 text-indigo-900 text-base">{studentRow.totalObtained}</td>
                                                        <td className="border border-slate-400 p-2 text-indigo-900">{studentRow.grade}</td>
                                                        <td className="border border-slate-400 p-2 text-left text-xs font-bold">
                                                            {studentRow.isPassed ? 'PROMOTED / PASSED' : 'HELD / REAPPEAR'}
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            </table>

                                            {/* 4. Performance Summary Strip */}
                                            <div className="grid grid-cols-5 gap-3 p-3 bg-slate-50 border border-slate-300 rounded-lg text-center text-xs mb-6">
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Percentage</span>
                                                    <span className="text-base font-black text-slate-900">{studentRow.percentage}%</span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Overall Grade</span>
                                                    <span className="text-base font-black text-indigo-700">{studentRow.grade}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Class Position</span>
                                                    <span className="text-base font-black text-emerald-700">{getOrdinal(studentRow.position)}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Attendance</span>
                                                    <span className="text-base font-black text-blue-700">{studentRow.attendance || '95%'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Result Status</span>
                                                    <span className={`text-sm font-black uppercase ${studentRow.isPassed ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                        {studentRow.isPassed ? 'PASSED' : 'FAILED'}
                                                    </span>
                                                </div>
                                            </div>

                                        {/* 5. Signatures and Stamp */}
                                        {showSignatures && (
                                            <div className="pt-8 border-t border-slate-300 mt-auto">
                                                <div className="grid grid-cols-3 gap-8 text-center text-xs">
                                                    <div>
                                                        <div className="border-b border-slate-800 pb-1 mb-1.5 mx-4 font-bold text-slate-800">
                                                            {currentClass.classTeacherName || 'Class Incharge'}
                                                        </div>
                                                        <span className="text-[10px] font-bold uppercase text-slate-500">Class Teacher</span>
                                                    </div>
                                                    <div>
                                                        <div className="border-b border-slate-800 pb-1 mb-1.5 mx-4 font-bold text-slate-800">
                                                            Examination Dept.
                                                        </div>
                                                        <span className="text-[10px] font-bold uppercase text-slate-500">Controller of Exams</span>
                                                    </div>
                                                    <div>
                                                        <div className="border-b border-slate-800 pb-1 mb-1.5 mx-4 font-bold text-slate-800">
                                                            Principal Stamp & Sign
                                                        </div>
                                                        <span className="text-[10px] font-bold uppercase text-slate-500">School Principal</span>
                                                    </div>
                                                </div>
                                                <div className="text-center text-[9px] text-slate-400 mt-6">
                                                    Generated securely via School Management Cloud System • Date: {new Date().toLocaleDateString()}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL: CREATE / EDIT EXAM TERM                                            */}
            {/* ========================================================================= */}
            {showExamModal && (
                <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
                        <div className="p-6 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Award className="w-6 h-6" />
                                <h3 className="font-bold text-lg">{editingExam ? 'Edit Examination Term' : 'Create New Examination Term'}</h3>
                            </div>
                            <button onClick={() => setShowExamModal(false)} className="text-white/80 hover:text-white text-lg font-bold">✕</button>
                        </div>

                        <form onSubmit={handleSaveExam} className="p-6 space-y-4 text-xs font-semibold text-slate-700">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Select Examination Preset / Title *</label>
                                <select
                                    value={examForm.presetId}
                                    onChange={(e) => handlePresetChange(e.target.value)}
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800"
                                >
                                    {STANDARD_EXAM_PRESETS.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.title}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Academic Session</label>
                                    <input
                                        type="text"
                                        placeholder="e.g., 2025-2026"
                                        value={examForm.session}
                                        onChange={(e) => setExamForm({ ...examForm, session: e.target.value })}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Status</label>
                                    <select
                                        value={examForm.status}
                                        onChange={(e) => setExamForm({ ...examForm, status: e.target.value })}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                                    >
                                        <option value="active">Active</option>
                                        <option value="upcoming">Upcoming</option>
                                        <option value="completed">Completed</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Start Date</label>
                                    <input
                                        type="date"
                                        value={examForm.startDate}
                                        onChange={(e) => setExamForm({ ...examForm, startDate: e.target.value })}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">End Date</label>
                                    <input
                                        type="date"
                                        value={examForm.endDate}
                                        onChange={(e) => setExamForm({ ...examForm, endDate: e.target.value })}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Description / Guidelines</label>
                                <textarea
                                    rows="2"
                                    placeholder="Optional notes for teachers..."
                                    value={examForm.description}
                                    onChange={(e) => setExamForm({ ...examForm, description: e.target.value })}
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setShowExamModal(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-100 transition-colors"
                                >
                                    {editingExam ? 'Update Exam' : 'Save Exam Term'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL: SINGLE DMC PREVIEW & PRINT                                         */}
            {/* ========================================================================= */}
            {selectedStudentForDmc && (
                <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Award className="w-5 h-5 text-indigo-400" />
                                <h3 className="font-bold text-sm">Result Card Preview — {selectedStudentForDmc.name} (Roll #{selectedStudentForDmc.rollNumber})</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => generateStudentDmcPdf(selectedStudentForDmc, true)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Download PDF
                                </button>
                                <button
                                    onClick={() => window.print()}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                                >
                                    <Printer className="w-3.5 h-3.5" />
                                    Print Card
                                </button>
                                <button
                                    onClick={() => setSelectedStudentForDmc(null)}
                                    className="p-1.5 text-white/80 hover:text-white text-base font-bold"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
                            {/* Card Layout */}
                            <div className="bg-white p-6 rounded-xl border-2 border-slate-800 shadow-md">
                                <div className="text-center border-b pb-3 mb-3">
                                    <h2 className="text-lg font-black uppercase text-slate-900">{schoolProfile.name}</h2>
                                    <p className="text-[10px] text-slate-500 font-semibold">{schoolProfile.address}</p>
                                    <span className="inline-block mt-1 px-3 py-0.5 bg-slate-900 text-white text-[10px] font-black uppercase rounded-full">
                                        {currentExam.title} Result Certificate
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg mb-4">
                                    <div><span className="font-bold text-slate-500">Student:</span> <span className="font-black text-slate-900">{selectedStudentForDmc.name}</span></div>
                                    <div><span className="font-bold text-slate-500">Class:</span> <span className="font-bold text-slate-800">{currentClass.name}</span></div>
                                    <div><span className="font-bold text-slate-500">Father:</span> <span className="font-bold text-slate-800">{selectedStudentForDmc.fatherName}</span></div>
                                    <div><span className="font-bold text-slate-500">Roll No:</span> <span className="font-black text-slate-900">{selectedStudentForDmc.rollNumber}</span></div>
                                </div>

                                <table className="w-full text-xs border-collapse border border-slate-300 mb-4 text-center">
                                    <thead>
                                        <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                                            <th className="border border-slate-300 p-1.5 text-left">Subject</th>
                                            <th className="border border-slate-300 p-1.5 w-16">Total</th>
                                            <th className="border border-slate-300 p-1.5 w-16">Obtained</th>
                                            <th className="border border-slate-300 p-1.5 w-14">Grade</th>
                                            <th className="border border-slate-300 p-1.5 text-left">Remarks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tabulationData.subjects.map(subj => {
                                            const m = selectedStudentForDmc.subjectMarks[subj];
                                            const obtained = m ? (m.isAbsent ? 'ABS' : m.obtained !== null ? m.obtained : '-') : '-';
                                            return (
                                                <tr key={subj}>
                                                    <td className="border border-slate-300 p-1.5 text-left font-bold">{subj}</td>
                                                    <td className="border border-slate-300 p-1.5">{m?.totalMarks || 100}</td>
                                                    <td className="border border-slate-300 p-1.5 font-black">{obtained}</td>
                                                    <td className="border border-slate-300 p-1.5 font-black">{m?.grade || '-'}</td>
                                                    <td className="border border-slate-300 p-1.5 text-left text-[10px] text-slate-500 italic">{m?.remarks || 'Satisfactory'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-100 font-black border-t border-slate-300">
                                            <td className="border border-slate-300 p-1.5 text-left">Total Marks</td>
                                            <td className="border border-slate-300 p-1.5">{selectedStudentForDmc.totalMax}</td>
                                            <td className="border border-slate-300 p-1.5 text-indigo-700">{selectedStudentForDmc.totalObtained}</td>
                                            <td className="border border-slate-300 p-1.5 text-indigo-700">{selectedStudentForDmc.grade}</td>
                                            <td className="border border-slate-300 p-1.5 text-left text-[11px]">
                                                {selectedStudentForDmc.isPassed ? 'PASSED' : 'FAILED'}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>

                                <div className="grid grid-cols-4 gap-2 text-center text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                                    <div><span className="text-[10px] text-slate-400 block uppercase font-bold">Percentage</span> <span className="font-black text-sm">{selectedStudentForDmc.percentage}%</span></div>
                                    <div><span className="text-[10px] text-slate-400 block uppercase font-bold">Class Position</span> <span className="font-black text-sm text-emerald-600">{getOrdinal(selectedStudentForDmc.position)}</span></div>
                                    <div><span className="text-[10px] text-slate-400 block uppercase font-bold">Attendance</span> <span className="font-black text-sm text-blue-600">{selectedStudentForDmc.attendance || '95%'}</span></div>
                                    <div><span className="text-[10px] text-slate-400 block uppercase font-bold">Result</span> <span className={`font-black text-sm ${selectedStudentForDmc.isPassed ? 'text-emerald-700' : 'text-rose-700'}`}>{selectedStudentForDmc.isPassed ? 'PASSED' : 'FAILED'}</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
