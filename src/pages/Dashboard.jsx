import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Users, UserCheck, CreditCard, PieChart as PieIcon,
    Send, Activity, Award, User, Clock, ChevronRight, X, ChevronDown, GraduationCap, MessageCircle, Trash2, Paperclip, BookOpen, CheckCircle2, CircleDashed
} from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import {
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
    CartesianGrid, Tooltip, BarChart, Bar, Cell, LineChart, Line, RadialBarChart, RadialBar, Legend
} from 'recharts';

const Dashboard = () => {
    const navigate = useNavigate();

    // 1. Shared Data State
    const [schoolId, setSchoolId] = useState(null);
    const [currentUserId, setCurrentUserId] = useState('principal');
    const [currentUserRole, setCurrentUserRole] = useState('principal');
    const [currentUserName, setCurrentUserName] = useState('');

    // messagingId is 'principal' for the principal, and UID for admins.
    const messagingId = (currentUserRole === 'principal') ? 'principal' : currentUserId;

    const [fetchedClasses, setFetchedClasses] = useState([]);
    const [messages, setMessages] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [collectionStats, setCollectionStats] = useState({ paid: 0, unpaid: 0, total: 0 });
    const [attendanceStats, setAttendanceStats] = useState({ present: 0, absent: 0 });
    const [statsLoaded, setStatsLoaded] = useState(false);

    // 2. UI State
    const [selectedTeacher, setSelectedTeacher] = useState(null);
    const [messageText, setMessageText] = useState('');
    const [isSending, setIsSending] = useState(false);

    const [modalPos, setModalPos] = useState(null); // New state for popup position
    const [performanceTab, setPerformanceTab] = useState('subjects');
    const [selectedClass, setSelectedClass] = useState('all');
    const [showClassDropdown, setShowClassDropdown] = useState(false);
    const [rankingPage, setRankingPage] = useState(0);

    // Syllabus Widget State
    const [syllabusWidgetClass, setSyllabusWidgetClass] = useState('');
    const [syllabusWidgetSubject, setSyllabusWidgetSubject] = useState('');
    const [syllabusWidgetData, setSyllabusWidgetData] = useState([]);
    const [syllabusWidgetLoading, setSyllabusWidgetLoading] = useState(false);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good Morning";
        if (hour < 17) return "Good Afternoon";
        return "Good Evening";
    };

    // 3. Resolve School ID First
    useEffect(() => {
        const resolveUser = async () => {
            // Priority 1: Manual Session
            const manualSession = localStorage.getItem('manual_session');
            if (manualSession) {
                try {
                    const data = JSON.parse(manualSession);
                    if (data.schoolId) {
                        setSchoolId(data.schoolId);
                        setCurrentUserRole((data.role || 'principal').toLowerCase());
                        setCurrentUserId(data.uid || 'principal');
                        // In manual bypass, email is usually saved. Let's extract name from it if no displayName
                        let name = 'Principal';
                        if (data.role === 'school Admin') {
                            if (data.email) {
                                name = data.email.split('@')[0];
                                // Capitalize first letter
                                name = name.charAt(0).toUpperCase() + name.slice(1);
                            } else {
                                name = 'Admin';
                            }
                        }
                        setCurrentUserName(data.displayName || name);
                        return; // Found it, stop checking
                    }
                } catch (e) {
                    console.error("[Dashboard] Error parsing session:", e);
                }
            }

            // Priority 2: Firebase Auth Token Claims
            const unsubscribe = auth.onAuthStateChanged(async (user) => {
                if (user) {
                    try {
                        const token = await user.getIdTokenResult();
                        if (token.claims.schoolId) {
                            setSchoolId(token.claims.schoolId);
                            setCurrentUserRole((token.claims.role || 'principal').toLowerCase());
                            setCurrentUserId(user.uid);
                            setCurrentUserName(user.displayName || (token.claims.role === 'school Admin' ? 'Admin' : 'Principal'));
                        } else {
                            console.warn("[Dashboard] User authenticated but no schoolId claim found.");
                            setStatsLoaded(true); // Don't hang on Loading...
                        }
                    } catch (e) {
                        console.error("[Dashboard] Token err:", e);
                        setStatsLoaded(true);
                    }
                } else {
                    setStatsLoaded(true); // Not logged in
                }
            });
            return () => unsubscribe();
        };
        resolveUser();
    }, []);


    useEffect(() => {
        if (!schoolId || !currentUserId) return;

        const q = query(
            collection(db, `schools/${schoolId}/messages`),
            where("participants", "array-contains", messagingId)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                // Filter to messages where I am the recipient
                if (data.toId === messagingId || data.to === messagingId || data.toId === currentUserId) {
                    list.push({ id: doc.id, ...data });
                }
            });

            // Client-side sort
            list.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

            console.log("Dashboard: Real-time messages:", list.length);
            setMessages(list);
        }, (error) => {
            console.error("Dashboard: Message Listener Error:", error);
        });
        return () => unsubscribe();
    }, [schoolId, messagingId, currentUserId]);

    // Syllabus Widget Data Fetching
    useEffect(() => {
        if (!schoolId || !syllabusWidgetClass || !syllabusWidgetSubject) {
            setSyllabusWidgetData([]);
            return;
        }

        setSyllabusWidgetLoading(true);

        const classId = fetchedClasses.find(c => c.name === syllabusWidgetClass)?.id;
        if (!classId) {
            setSyllabusWidgetData([]);
            setSyllabusWidgetLoading(false);
            return;
        }

        const q = query(collection(db, `schools/${schoolId}/classes/${classId}/syllabus/${syllabusWidgetSubject}/chapters`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSyllabusWidgetData(list);
            setSyllabusWidgetLoading(false);
        }, (err) => {
            console.error("Syllabus Fetch Error:", err);
            setSyllabusWidgetLoading(false);
        });

        return () => unsubscribe();
    }, [schoolId, syllabusWidgetClass, syllabusWidgetSubject, fetchedClasses]);

    // Mock Data for Charts


    const overviewStats = [
        {
            label: 'Total Students',
            value: statsLoaded ? collectionStats.total.toLocaleString() : 'Loading...',
            icon: Users,
            gradient: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
            shadow: 'rgba(99, 102, 241, 0.4)',
            showTag: false,
            path: '/classes'
        },
        {
            label: 'Present Today',
            value: statsLoaded ? attendanceStats.present.toLocaleString() : '...',
            subValue: null,
            icon: UserCheck,
            gradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
            shadow: 'rgba(16, 185, 129, 0.4)',
            showTag: true,
            path: '/classes'
        },
        {
            label: 'Total Students Paid',
            value: statsLoaded ? collectionStats.paid.toLocaleString() : '...',
            subValue: null,
            icon: CreditCard,
            gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
            shadow: 'rgba(14, 165, 233, 0.4)',
            showTag: false,
            path: '/collections'
        },
        {
            label: 'Total Students Unpaid',
            value: statsLoaded ? collectionStats.unpaid.toLocaleString() : '...',
            subValue: null,
            icon: PieIcon,
            gradient: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
            shadow: 'rgba(245, 158, 11, 0.4)',
            showTag: false,
            path: '/collections'
        },
    ];


    // Helper function to check if it's a new day (same as Teacher App)
    const isNewDay = (lastUpdateTimestamp) => {
        if (!lastUpdateTimestamp) return false; // Return false if null to prevent flickering "Off" on new writes

        const lastUpdate = lastUpdateTimestamp.toDate ? lastUpdateTimestamp.toDate() : new Date(lastUpdateTimestamp);
        const now = new Date();

        // Compare dates (ignoring time)
        const lastDate = new Date(lastUpdate.getFullYear(), lastUpdate.getMonth(), lastUpdate.getDate());
        const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        return currentDate > lastDate;
    };

    useEffect(() => {
        if (!schoolId) return;
        const q = query(collection(db, `schools/${schoolId}/teachers`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => {
                const data = doc.data();

                // Get duty status from database
                const dutyStatus = data.isOnDuty || false;
                const lastDutyUpdate = data.lastDutyUpdate;

                // Debug Log
                if (data.name) {
                    console.log(`[Dashboard] Teacher ${data.name}:`, {
                        isOnDuty: data.isOnDuty,
                        lastDutyUpdate: lastDutyUpdate ? 'Exists' : 'Null',
                        dutyStatus,
                        isNewDay: isNewDay(lastDutyUpdate)
                    });
                }

                // Check if it's a new day - if so, consider status as 'off'
                const isOff = isNewDay(lastDutyUpdate) || !dutyStatus;

                const today = new Date();
                const year = today.getFullYear();
                const month = String(today.getMonth() + 1).padStart(2, '0');
                const day = String(today.getDate()).padStart(2, '0');
                const todayStr = `${year}-${month}-${day}`;

                return {
                    id: doc.id,
                    name: data.name,
                    class: Array.isArray(data.assignedClasses) && data.assignedClasses.length > 0
                        ? data.assignedClasses[0]
                        : (data.assignedClasses || 'Unassigned'),
                    status: isOff ? 'off' : 'on',
                    isPresent: data.lastAttendanceDate === todayStr,
                    score: 75 + (doc.id.charCodeAt(0) % 20)
                };
            });
            setTeachers(list);
        });
        return () => unsubscribe();
    }, [schoolId]);



    useEffect(() => {
        if (!schoolId) return;

        console.log("[Dashboard] Listening for classes for school:", schoolId);
        const qClasses = query(collection(db, `schools/${schoolId}/classes`));
        const unsubClasses = onSnapshot(qClasses, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Sort numerically
            list.sort((a, b) => {
                const nameA = a.name || '';
                const nameB = b.name || '';
                const numA = parseInt(nameA.replace(/\D/g, '')) || 0;
                const numB = parseInt(nameB.replace(/\D/g, '')) || 0;
                return numA - numB;
            });

            console.log(`[Dashboard] Found ${list.length} classes`);
            setFetchedClasses(list);

            if (list.length === 0) {
                setCollectionStats({ paid: 0, unpaid: 0, total: 0 });
                setStatsLoaded(true);
            }
        });

        return () => unsubClasses();
    }, [schoolId]);

    // 4. Consolidated Student Listener (Fees, Attendance, Performance)
    const [allClassesData, setAllClassesData] = useState(new Map());

    useEffect(() => {
        if (!schoolId || fetchedClasses.length === 0) return;

        console.log("[Dashboard] Starting Consolidated Student Listeners for", fetchedClasses.length, "classes");

        const unsubscribers = [];
        const classDataMap = new Map();

        const updateAggregates = () => {
            // Recalculate Totals
            let totalPaid = 0, totalUnpaid = 0, totalStudents = 0;
            let totalPresent = 0, totalAbsent = 0;

            classDataMap.forEach((data) => {
                totalPaid += data.fees.paid;
                totalUnpaid += data.fees.unpaid;
                totalStudents += data.total;
                totalPresent += data.attendance.present;
                totalAbsent += data.attendance.absent;
            });

            console.log(`[Dashboard] Aggregated - Students: ${totalStudents}, Paid: ${totalPaid}, Present: ${totalPresent}`);
            setCollectionStats({ paid: totalPaid, unpaid: totalUnpaid, total: totalStudents });
            setAttendanceStats({ present: totalPresent, absent: totalAbsent });

            // Update the map state for Charts to use
            setAllClassesData(new Map(classDataMap));
            setStatsLoaded(true);
        };

        fetchedClasses.forEach(cls => {
            const qStudents = query(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
            const unsubStudents = onSnapshot(qStudents, (snap) => {
                const todayStr = new Date().toISOString().split('T')[0];
                const classStats = {
                    fees: { paid: 0, unpaid: 0 },
                    attendance: { present: 0, absent: 0 },
                    subjects: {}, // { "Math": { total: 1560, count: 20 } }
                    homework: {}, // { "Math": { total: 1800, count: 20 } }
                    total: snap.size
                };

                snap.docs.forEach(doc => {
                    const data = doc.data();

                    // 1. Fees
                    if (data.monthlyFeeStatus === 'paid') classStats.fees.paid++;
                    else classStats.fees.unpaid++;

                    // 2. Attendance
                    if (data.status === 'present' && data.lastAttendanceDate === todayStr) classStats.attendance.present++;
                    else classStats.attendance.absent++;

                    // 3. Subject Scores
                    if (data.academicScores && Array.isArray(data.academicScores)) {
                        data.academicScores.forEach(scoreObj => {
                            const subj = scoreObj.subject;
                            const val = parseInt(scoreObj.score) || 0;
                            if (!classStats.subjects[subj]) classStats.subjects[subj] = { total: 0, count: 0 };
                            classStats.subjects[subj].total += val;
                            classStats.subjects[subj].count++;
                        });
                    }

                    // 4. Homework Scores
                    if (data.homeworkScores && Array.isArray(data.homeworkScores)) {
                        data.homeworkScores.forEach(scoreObj => {
                            const subj = scoreObj.subject;
                            const val = parseInt(scoreObj.score) || 0;
                            if (!classStats.homework[subj]) classStats.homework[subj] = { total: 0, count: 0 };
                            classStats.homework[subj].total += val;
                            classStats.homework[subj].count++;
                        });
                    }
                });

                classDataMap.set(cls.id, classStats);
                updateAggregates();
            });
            unsubscribers.push(unsubStudents);
        });

        return () => {
            console.log("[Dashboard] Cleaning up consolidated listeners");
            unsubscribers.forEach(u => u());
        };
    }, [schoolId, fetchedClasses]);

    // Safety Timeout
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!statsLoaded) {
                console.warn("[Dashboard] Data timeout - forcing loaded state");
                setStatsLoaded(true);
            }
        }, 8000);
        return () => clearTimeout(timer);
    }, [statsLoaded]);

    const allPotentialSubjects = [
        'English', 'Urdu', 'Mathematics', 'Islamiyat', 'QURAN',
        'Social Study', 'Art', 'Science', 'Biology', 'Chemistry', 'Physic'
    ];

    // Data Derivation for Charts
    const currentData = useMemo(() => {
        const combinedSubjects = {};
        const combinedHomework = {};

        // Helper to process a single class's data
        const processClassData = (classData) => {
            if (!classData) return;

            // Subjects
            Object.entries(classData.subjects).forEach(([subj, stats]) => {
                if (!combinedSubjects[subj]) combinedSubjects[subj] = { total: 0, count: 0 };
                combinedSubjects[subj].total += stats.total;
                combinedSubjects[subj].count += stats.count;
            });

            // Homework
            Object.entries(classData.homework).forEach(([subj, stats]) => {
                if (!combinedHomework[subj]) combinedHomework[subj] = { total: 0, count: 0 };
                combinedHomework[subj].total += stats.total;
                combinedHomework[subj].count += stats.count;
            });
        };

        if (selectedClass === 'all') {
            allClassesData.forEach((data) => processClassData(data));
        } else {
            const classId = fetchedClasses.find(c => c.name === selectedClass)?.id;
            if (classId) processClassData(allClassesData.get(classId));
        }

        // Transform to Array
        return allPotentialSubjects
            .filter(subj => combinedSubjects[subj] || combinedHomework[subj]) // Only show subjects with data
            .map((subject, index) => {

                const subjStats = combinedSubjects[subject] || { total: 0, count: 1 };
                const hwStats = combinedHomework[subject] || { total: 0, count: 1 };

                const subjAvg = subjStats.count > 0 ? Math.round(subjStats.total / subjStats.count) : 0;
                const hwAvg = hwStats.count > 0 ? Math.round(hwStats.total / hwStats.count) : 0;

                return {
                    name: subject,
                    score: subjAvg,
                    completion: hwAvg,
                    fill: `hsl(${220 + (index * 30) % 360}, 80%, 65%)`
                };
            }).sort((a, b) => b.score - a.score); // Sort by performance

    }, [selectedClass, allClassesData, fetchedClasses]);

    const subjectsData = currentData;
    const homeworkData = currentData;

    // 5. Attendance Chart Data (Real-time)
    const [attendanceChartData, setAttendanceChartData] = useState([]);

    useEffect(() => {
        if (!schoolId) return;

        // Calculate date 6 weeks ago to limit query
        const sixWeeksAgo = new Date();
        sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42); // 6 weeks * 7 days
        const sixWeeksAgoStr = sixWeeksAgo.toISOString().split('T')[0];

        const qAttendance = query(
            collection(db, `schools/${schoolId}/attendance`),
            where("date", ">=", sixWeeksAgoStr),
            orderBy("date", "asc")
        );

        const unsubscribe = onSnapshot(qAttendance, (snapshot) => {
            if (selectedClass === 'all') {
                const classTotals = {};
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const cId = data.classId;
                    if (!cId) return;

                    if (data.records && Array.isArray(data.records)) {
                        const total = data.records.length;
                        const present = data.records.filter(r => r.status === 'present').length;
                        if (!classTotals[cId]) {
                            classTotals[cId] = { present: 0, total: 0 };
                        }
                        classTotals[cId].present += present;
                        classTotals[cId].total += total;
                    }
                });

                const chartData = fetchedClasses.map(cls => {
                    const stats = classTotals[cls.id];
                    const percentage = stats && stats.total > 0 ? (stats.present / stats.total) * 100 : 0;

                    return {
                        name: cls.name || 'Unknown',
                        percentage: Math.round(percentage),
                        fill: '#10b981'
                    };
                });

                setAttendanceChartData(chartData);
            } else {
                const classObj = fetchedClasses.find(c => c.name === selectedClass);
                if (!classObj) {
                    setAttendanceChartData([]);
                    return;
                }

                const rawData = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.classId !== classObj.id) return;

                    if (data.records && Array.isArray(data.records)) {
                        const total = data.records.length;
                        const present = data.records.filter(r => r.status === 'present').length;
                        const percentage = total > 0 ? (present / total) * 100 : 0;
                        rawData.push({
                            date: data.date,
                            percentage: percentage
                        });
                    }
                });

                const processWeeklyData = (dailyData) => {
                    const weeks = [];
                    const now = new Date();

                    for (let i = 5; i >= 0; i--) {
                        const weekEnd = new Date(now);
                        weekEnd.setDate(weekEnd.getDate() - (i * 7));

                        const weekStart = new Date(weekEnd);
                        weekStart.setDate(weekStart.getDate() - 6);

                        weekStart.setHours(0, 0, 0, 0);
                        weekEnd.setHours(23, 59, 59, 999);

                        let sum = 0;
                        let count = 0;

                        dailyData.forEach(day => {
                            const dayDate = new Date(day.date);
                            dayDate.setHours(12, 0, 0, 0);

                            if (dayDate >= weekStart && dayDate <= weekEnd) {
                                sum += day.percentage;
                                count++;
                            }
                        });

                        weeks.push({
                            name: `Week ${6 - i}`,
                            percentage: count > 0 ? Math.round(sum / count) : 0
                        });
                    }
                    return weeks;
                };

                const chartData = processWeeklyData(rawData);
                setAttendanceChartData(chartData);
            }
        });

        return () => unsubscribe();
    }, [schoolId, selectedClass, fetchedClasses]);

    const attendanceData = attendanceChartData.length > 0
        ? attendanceChartData
        : (selectedClass === 'all'
            ? fetchedClasses.map(c => ({ name: c.name, percentage: 0, fill: '#cbd5e1' }))
            : [
                { name: 'Week 1', percentage: 0 },
                { name: 'Week 2', percentage: 0 },
                { name: 'Week 3', percentage: 0 },
                { name: 'Week 4', percentage: 0 },
                { name: 'Week 5', percentage: 0 },
                { name: 'Week 6', percentage: 0 },
            ]
        );

    // 6. Classes Chart Data (New)
    const classesChartData = useMemo(() => {
        if (!statsLoaded || fetchedClasses.length === 0) return [];

        const data = fetchedClasses.map(cls => {
            const classId = cls.id;
            const stats = allClassesData.get(classId);

            if (!stats) return { name: cls.name, score: 0, fill: '#cbd5e1' };

            // Calculate overall academic score for the class
            // Aggregate all subject totals and counts
            let totalScore = 0;
            let totalCount = 0;

            Object.values(stats.subjects).forEach(subj => {
                totalScore += subj.total;
                totalCount += subj.count;
            });

            const avgScore = totalCount > 0 ? Math.round(totalScore / totalCount) : 0;

            // Determine Color based on Class Name (Department)
            // Primary (Nursery - 5): Purple #8b5cf6
            // Secondary (6 - 10): Blue #3b82f6
            const className = cls.name || '';
            const lowerName = className.toLowerCase();
            let color = '#3b82f6'; // Default Blue (Secondary)

            // Check for Primary keywords
            if (
                lowerName.includes('nursery') ||
                lowerName.includes('prep') ||
                lowerName.includes('kg') ||
                ['1', '2', '3', '4', '5'].some(num => lowerName.includes(num) && !lowerName.includes('10')) // Avoid matching 10 with 1
            ) {
                color = '#8b5cf6'; // Purple (Primary)
            }

            return {
                name: cls.name,
                score: avgScore,
                fill: color
            };
        });

        return data;
    }, [statsLoaded, fetchedClasses, allClassesData]);

    const availableClasses = ['All School', ...fetchedClasses.map(c => c.name)];


    const handleSendMessage = async () => {
        if (!messageText.trim() || !selectedTeacher) return;

        setIsSending(true);
        try {
            const session = localStorage.getItem('manual_session');
            if (session) {
                const { schoolId } = JSON.parse(session);

                // Send to single teacher
                await addDoc(collection(db, `schools/${schoolId}/messages`), {
                    to: selectedTeacher.role === 'Teacher' ? 'teacher' : 'admin',
                    toId: selectedTeacher.id,
                    toName: selectedTeacher.name,
                    toRole: selectedTeacher.role === 'Teacher' ? 'teacher' : 'school Admin',
                    from: currentUserRole === 'principal' ? 'principal' : 'admin',
                    fromName: currentUserName,
                    fromId: messagingId,
                    fromRole: currentUserRole,
                    participants: [messagingId, selectedTeacher.id],
                    text: messageText,
                    timestamp: serverTimestamp(),
                    read: false,
                    type: 'direct-message'
                });

                setMessageText('');
                setSelectedTeacher(null);
                setModalPos(null);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            alert("FAILED TO SEND MESSAGE: " + error.message);
        } finally {
            setIsSending(false);
        }
    };

    const handleDeleteFeedback = async (msgId) => {
        if (!confirm("Delete this feedback?")) return;
        try {
            const { deleteDoc, doc } = await import('firebase/firestore');
            await deleteDoc(doc(db, `schools/${schoolId}/messages`, msgId));
        } catch (error) {
            console.error("Error deleting feedback:", error);
        }
    };

    const displayClasses = fetchedClasses.length > 0 ? fetchedClasses : [{ id: 'demo-class', name: 'Demo Class 10', subjects: ['Demo Physics', 'Demo Mathematics'] }];
    const selectedClassObj = displayClasses.find(c => c.name === syllabusWidgetClass);
    const displaySubjects = selectedClassObj?.subjects?.length > 0 ? selectedClassObj.subjects : ['Demo Subject 1', 'Demo Subject 2'];


    return (
        <div className="animate-fade-in-up">
            {/* Header Area */}
            <div className="flex-between" style={{ marginBottom: '2.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>{getGreeting()}, {currentUserName}</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Here's what's happening in your school today.</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <div className="card" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Clock size={18} color="var(--primary)" />
                        <span style={{ fontWeight: '600' }}>{new Date().toLocaleDateString()}</span>
                    </div>
                </div>
            </div>


            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                {/* Left Column Content (Now Full Width) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                    {/* Overview Stats */}
                    <div className="stats-grid">
                        {overviewStats.map((stat, i) => (
                            <div
                                key={i}
                                className="card"
                                onClick={() => stat.path && navigate(stat.path)}
                                style={{
                                    padding: '1.5rem',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    border: 'none',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1.25rem',
                                    background: stat.gradient,
                                    color: 'white',
                                    boxShadow: `0 20px 25px -5px ${stat.shadow}`,
                                    transition: 'all 0.3s ease',
                                    cursor: stat.path ? 'pointer' : 'default'
                                }}
                            >
                                {/* 2D Geometric Pattern (Square) */}
                                <div style={{
                                    position: 'absolute',
                                    top: '-15%',
                                    right: '-10%',
                                    width: '130px',
                                    height: '130px',
                                    background: 'rgba(255, 255, 255, 0.12)',
                                    borderRadius: '35px',
                                    transform: 'rotate(20deg)',
                                    zIndex: 1
                                }} />

                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    position: 'relative',
                                    zIndex: 2
                                }}>
                                    <div style={{
                                        width: '52px',
                                        height: '52px',
                                        borderRadius: '16px',
                                        background: 'rgba(255, 255, 255, 0.2)',
                                        backdropFilter: 'blur(10px)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '1px solid rgba(255, 255, 255, 0.3)'
                                    }}>
                                        <stat.icon size={28} color="white" />
                                    </div>
                                    {stat.showTag && (
                                        <div style={{
                                            padding: '0.4rem 0.8rem',
                                            borderRadius: '12px',
                                            background: 'rgba(255, 255, 255, 0.15)',
                                            color: 'white',
                                            fontSize: '0.75rem',
                                            fontWeight: '700',
                                            border: '1px solid rgba(255, 255, 255, 0.2)'
                                        }}>
                                            Live
                                        </div>
                                    )}
                                </div>

                                <div style={{ position: 'relative', zIndex: 2 }}>
                                    <p style={{ fontSize: '0.9rem', fontWeight: '500', opacity: 0.9, marginBottom: '0.4rem', letterSpacing: '0.02em' }}>{stat.label}</p>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                                        <h3 style={{ fontSize: '2.125rem', fontWeight: '800', letterSpacing: '-0.02em', color: 'white' }}>{stat.value}</h3>
                                        {stat.subValue && (
                                            <span style={{
                                                fontSize: '0.85rem',
                                                fontWeight: '600',
                                                background: 'rgba(255,255,255,0.2)',
                                                padding: '2px 8px',
                                                borderRadius: '6px',
                                                backdropFilter: 'blur(4px)'
                                            }}>
                                                {stat.subValue}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Interactive Syllabus Viewer Widget */}
                    <div className="card" style={{
                        background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.85) 0%, rgba(3, 105, 161, 0.85) 100%)',
                        backdropFilter: 'blur(16px)',
                        padding: '1.5rem',
                        position: 'relative',
                        overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.2)',
                        boxShadow: '0 10px 30px -5px rgba(14, 165, 233, 0.5)'
                    }}>
                        {/* Background Floating Elements */}
                        <div style={{ position: 'absolute', top: '-10px', right: '-20px', opacity: 0.1, animation: 'spin 20s linear infinite', color: 'white' }}>
                            <BookOpen size={150} />
                        </div>
                        <div style={{ position: 'absolute', bottom: '10px', right: '40%', opacity: 0.1, animation: 'bounce 5s infinite', color: 'white' }}>
                            <GraduationCap size={100} />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 2, flexWrap: 'wrap', gap: '2rem' }}>
                            <div style={{ flex: '1 1 400px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                                    <div style={{ padding: '0.5rem', background: 'rgba(255, 255, 255, 0.2)', backdropFilter: 'blur(8px)', borderRadius: '10px', color: 'white', border: '1px solid rgba(255, 255, 255, 0.3)' }}>
                                        <BookOpen size={24} />
                                    </div>
                                    <div>
                                        <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'white', margin: 0, textShadow: '2px 2px 0px rgba(0,0,0,0.4)' }}>Live Syllabus Viewer</h2>
                                        <p style={{ color: '#e0f2fe', fontSize: '0.9rem', margin: 0 }}>Select a class and subject to track real-time progress</p>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <select 
                                            value={syllabusWidgetClass} 
                                            onChange={(e) => {
                                                setSyllabusWidgetClass(e.target.value);
                                                setSyllabusWidgetSubject('');
                                            }}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.3)', outline: 'none', background: 'rgba(255, 255, 255, 0.15)', backdropFilter: 'blur(10px)', fontWeight: '600', color: 'white', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1)' }}
                                        >
                                            <option value="" style={{ background: '#0369a1', color: 'white' }}>-- Class --</option>
                                            {displayClasses.map(c => (
                                                <option key={c.id} value={c.name} style={{ background: '#0369a1', color: 'white' }}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <select 
                                            value={syllabusWidgetSubject} 
                                            onChange={(e) => setSyllabusWidgetSubject(e.target.value)}
                                            disabled={!syllabusWidgetClass}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.3)', outline: 'none', background: !syllabusWidgetClass ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.15)', backdropFilter: 'blur(10px)', fontWeight: '600', color: !syllabusWidgetClass ? 'rgba(255,255,255,0.6)' : 'white', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1)' }}
                                        >
                                            <option value="" style={{ background: '#0369a1', color: 'white' }}>-- Subject --</option>
                                            {syllabusWidgetClass && displaySubjects.map(s => (
                                                <option key={s} value={s} style={{ background: '#0369a1', color: 'white' }}>{s}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {syllabusWidgetClass && syllabusWidgetSubject && (
                                    <div style={{ background: '#f1f5f9', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)' }}>
                                        {syllabusWidgetLoading ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#334155' }}>
                                                <div className="animate-spin"><CircleDashed size={20} /></div> Loading...
                                            </div>
                                        ) : syllabusWidgetData.length === 0 ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '1rem' }}>
                                                <p style={{ color: '#334155', fontSize: '0.9rem', margin: 0 }}>No chapters found for this subject.</p>
                                            </div>
                                        ) : (
                                            <div style={{ maxHeight: '180px', overflowY: 'auto', paddingRight: '0.5rem' }} className="custom-scrollbar">
                                                {syllabusWidgetData.map((chap, i) => (
                                                    <div key={chap.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: i < syllabusWidgetData.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                                                        {chap.status === 'Completed' ? (
                                                            <CheckCircle2 size={18} color="#10b981" />
                                                        ) : chap.status === 'In Progress' ? (
                                                            <Activity size={18} color="#f59e0b" />
                                                        ) : (
                                                            <CircleDashed size={18} color="#64748b" />
                                                        )}
                                                        <div style={{ flex: 1 }}>
                                                            <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a', fontWeight: chap.status === 'Completed' ? '500' : '600', textDecoration: chap.status === 'Completed' ? 'line-through' : 'none' }}>{chap.title}</h4>
                                                            <span style={{ fontSize: '0.75rem', color: '#475569' }}>{chap.time}</span>
                                                            {chap.topics && chap.topics.length > 0 && (
                                                                <div style={{ marginTop: '0.35rem', padding: '0.35rem 0.6rem', background: '#e2e8f0', borderRadius: '6px', fontSize: '0.75rem', color: '#1e293b', border: '1px solid #cbd5e1' }}>
                                                                    <strong>Topics:</strong> {chap.topics.join(', ')}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', fontWeight: '700', padding: '3px 10px', borderRadius: '12px', background: chap.status === 'Completed' ? 'rgba(16, 185, 129, 0.15)' : chap.status === 'In Progress' ? 'rgba(245, 158, 11, 0.15)' : '#e2e8f0', color: chap.status === 'Completed' ? '#047857' : chap.status === 'In Progress' ? '#b45309' : '#475569' }}>
                                                            {chap.status || 'Pending'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Circular Progress Indicator */}
                            <div style={{ width: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                {(() => {
                                    const total = syllabusWidgetData.length;
                                    const completed = syllabusWidgetData.filter(c => c.status === 'Completed').length;
                                    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
                                    const radius = 60;
                                    const circumference = 2 * Math.PI * radius;
                                    const offset = circumference - (percentage / 100) * circumference;

                                    return (
                                        <div style={{ position: 'relative', width: '140px', height: '140px' }}>
                                            <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
                                                <circle cx="70" cy="70" r={radius} fill="transparent" stroke="rgba(255,255,255,0.2)" strokeWidth="12" />
                                                <circle 
                                                    cx="70" cy="70" r={radius} 
                                                    fill="transparent" 
                                                    stroke={percentage === 100 ? '#10b981' : 'white'} 
                                                    strokeWidth="12" 
                                                    strokeDasharray={circumference} 
                                                    strokeDashoffset={syllabusWidgetLoading || !syllabusWidgetClass || !syllabusWidgetSubject ? circumference : offset} 
                                                    strokeLinecap="round"
                                                    style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)', filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.4))' }}
                                                />
                                            </svg>
                                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                                <span style={{ fontSize: '1.75rem', fontWeight: '800', color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>{syllabusWidgetLoading || !syllabusWidgetClass || !syllabusWidgetSubject ? '-' : percentage}%</span>
                                                <span style={{ fontSize: '0.75rem', color: '#e0f2fe', fontWeight: '600' }}>Completed</span>
                                            </div>
                                        </div>
                                    );
                                })()}
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', width: '100%' }}>
                                    <button 
                                        onClick={() => navigate('/teachers?tab=syllabus')}
                                        style={{ flex: 1, padding: '0.6rem 1rem', background: 'rgba(255, 255, 255, 0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '8px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.3s', backdropFilter: 'blur(8px)', boxShadow: '0 4px 6px rgba(0,0,0, 0.1)' }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#0ea5e9'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0, 0.15)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'; e.currentTarget.style.color = 'white'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0, 0.1)'; }}
                                    >
                                        Edit Syllabus
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>


                    {/* School Performance Card */}
                    <div className="card" style={{
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.95) 0%, rgba(139, 92, 246, 0.95) 100%)',
                        padding: '1.25rem',
                        position: 'relative',
                        overflow: 'visible',
                        border: 'none'
                    }}>
                        <style>
                            {`
                                .custom-scrollbar::-webkit-scrollbar {
                                    width: 8px;
                                }
                                .custom-scrollbar::-webkit-scrollbar-track {
                                    background: rgba(241, 245, 249, 0.5);
                                    border-radius: 8px;
                                }
                                .custom-scrollbar::-webkit-scrollbar-thumb {
                                    background: rgba(139, 92, 246, 0.3);
                                    border-radius: 8px;
                                }
                                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                                    background: rgba(139, 92, 246, 0.5);
                                }
                            `}
                        </style>
                        {/* Decorative background elements */}
                        <div style={{
                            position: 'absolute',
                            top: '-50px',
                            right: '-50px',
                            width: '200px',
                            height: '200px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            borderRadius: '50%',
                            filter: 'blur(40px)'
                        }} />
                        <div style={{
                            position: 'absolute',
                            bottom: '-30px',
                            left: '-30px',
                            width: '150px',
                            height: '150px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            borderRadius: '50%',
                            filter: 'blur(30px)'
                        }} />

                        {/* Header */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '1rem',
                            position: 'relative',
                            zIndex: 2
                        }}>
                            <h2 style={{
                                fontSize: '1.25rem',
                                fontWeight: '700',
                                color: 'white',
                                margin: 0,
                                textShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
                            }}>
                                SCHOOL PERFORMANCE
                            </h2>

                            {/* Class Selector Dropdown */}
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setShowClassDropdown(!showClassDropdown)}
                                    style={{
                                        padding: '0.75rem 1.5rem',
                                        background: 'rgba(255, 255, 255, 0.95)',
                                        color: 'var(--primary)',
                                        border: 'none',
                                        borderRadius: '12px',
                                        fontSize: '0.95rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                                        transition: 'var(--transition)'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.transform = 'translateY(-2px)';
                                        e.target.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.transform = 'translateY(0)';
                                        e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                                    }}
                                >
                                    {selectedClass === 'all' ? 'All School' : selectedClass}
                                    <ChevronDown size={18} style={{
                                        transform: showClassDropdown ? 'rotate(180deg)' : 'rotate(0)',
                                        transition: 'var(--transition)'
                                    }} />
                                </button>

                                {/* Dropdown Menu */}
                                {/* Dropdown Menu */}
                                {showClassDropdown && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 'calc(100% + 0.5rem)',
                                        right: 0,
                                        background: 'white',
                                        borderRadius: '12px',
                                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
                                        minWidth: '180px',
                                        maxHeight: '300px',
                                        overflowY: 'auto',
                                        zIndex: 1000,
                                        animation: 'slideDown 0.2s ease-out'
                                    }} className="custom-scrollbar">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedClass('all');
                                                setShowClassDropdown(false);
                                            }}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                padding: '0.75rem 1rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                border: 'none',
                                                borderBottom: '2px solid #f1f5f9',
                                                background: selectedClass === 'all' ? '#f8fafc' : 'transparent',
                                                fontWeight: selectedClass === 'all' ? '700' : '600',
                                                color: selectedClass === 'all' ? 'var(--primary)' : 'var(--text-main)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                fontSize: '0.95rem',
                                                fontFamily: 'inherit'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseLeave={(e) => {
                                                if (selectedClass !== 'all') {
                                                    e.currentTarget.style.background = 'transparent';
                                                }
                                            }}
                                        >
                                            All School
                                            {selectedClass === 'all' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }} />}
                                        </button>
                                        {availableClasses.slice(1).map((cls, idx) => {
                                            const isSelected = selectedClass === cls;
                                            return (
                                                <button
                                                    key={idx}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedClass(cls);
                                                        setShowClassDropdown(false);
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        textAlign: 'left',
                                                        padding: '0.75rem 1rem',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease',
                                                        border: 'none',
                                                        borderBottom: idx < availableClasses.length - 2 ? '1px solid #f8fafc' : 'none',
                                                        background: isSelected ? '#f8fafc' : 'transparent',
                                                        fontWeight: isSelected ? '700' : '500',
                                                        color: isSelected ? 'var(--primary)' : 'var(--text-main)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        fontSize: '0.95rem',
                                                        fontFamily: 'inherit'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseLeave={(e) => {
                                                        if (!isSelected) {
                                                            e.currentTarget.style.background = 'transparent';
                                                        }
                                                    }}
                                                >
                                                    {cls}
                                                    {isSelected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tab Buttons & Month Selector */}
                        <div style={{
                            display: 'flex',
                            gap: '0.75rem',
                            marginBottom: '1rem',
                            position: 'relative',
                            zIndex: 2,
                            flexWrap: 'wrap'
                        }}>
                            {[
                                { id: 'classes', label: 'Classes', color: '#06b6d4' },
                                { id: 'subjects', label: 'Subjects', color: '#ec4899' },
                                { id: 'homework', label: 'Homework', color: '#f59e0b' },
                                { id: 'attendance', label: 'Attendance', color: '#10b981' }
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setPerformanceTab(tab.id)}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: performanceTab === tab.id ? tab.color : 'rgba(255, 255, 255, 0.2)',
                                        color: 'white',
                                        border: performanceTab === tab.id ? 'none' : '2px solid rgba(255, 255, 255, 0.3)',
                                        borderRadius: '10px',
                                        fontSize: '0.9rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        transform: performanceTab === tab.id ? 'scale(1.05)' : 'scale(1)',
                                        boxShadow: performanceTab === tab.id ? `0 6px 16px ${tab.color}60` : 'none'
                                    }}
                                >
                                    {tab.label}
                                </button>
                            ))}


                        </div>

                        {/* Chart Area */}
                        <div style={{
                            background: 'rgba(255, 255, 255, 0.95)',
                            borderRadius: '16px',
                            padding: '0.75rem',
                            minHeight: '220px',
                            position: 'relative',
                            zIndex: 1,
                            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)'
                        }}>
                            {/* Classes Chart (New) */}
                            {performanceTab === 'classes' && (
                                <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
                                    <h3 style={{
                                        fontSize: '1rem',
                                        fontWeight: '700',
                                        marginBottom: '0.75rem',
                                        color: 'var(--text-main)'
                                    }}>
                                        Class-wise Performance
                                    </h3>
                                    <ResponsiveContainer width="100%" height={180}>
                                        <BarChart data={classesChartData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                            <XAxis
                                                dataKey="name"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#64748b', fontSize: 11, fontWeight: '600' }}
                                                dy={10}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#64748b', fontSize: 11 }}
                                                domain={[0, 100]}
                                            />
                                            <Tooltip
                                                contentStyle={{
                                                    background: 'white',
                                                    border: 'none',
                                                    borderRadius: '12px',
                                                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                                                    padding: '12px'
                                                }}
                                                cursor={{ fill: '#fef3c7' }}
                                            />
                                            <Bar
                                                dataKey="score"
                                                radius={[6, 6, 0, 0]}
                                                animationDuration={1500}
                                                animationEasing="ease-out"
                                                barSize={40}
                                            >
                                                {classesChartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* Subjects Chart - Bar Chart */}
                            {performanceTab === 'subjects' && (
                                <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
                                    <h3 style={{
                                        fontSize: '1rem',
                                        fontWeight: '700',
                                        marginBottom: '0.75rem',
                                        color: 'var(--text-main)'
                                    }}>
                                        Subject-wise Performance
                                    </h3>
                                    <ResponsiveContainer width="100%" height={180}>
                                        <BarChart data={subjectsData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                            <XAxis
                                                dataKey="name"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#64748b', fontSize: 11, fontWeight: '600' }}
                                                dy={10}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#64748b', fontSize: 11 }}
                                                domain={[0, 100]}
                                            />
                                            <Tooltip
                                                contentStyle={{
                                                    background: 'white',
                                                    border: 'none',
                                                    borderRadius: '12px',
                                                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                                                    padding: '12px'
                                                }}
                                                cursor={{ fill: '#fef3c7' }}
                                            />
                                            <Bar
                                                dataKey="score"
                                                fill="#ec4899"
                                                radius={[6, 6, 0, 0]}
                                                animationDuration={1000}
                                                animationBegin={0}
                                                barSize={40}
                                            >
                                                {subjectsData.map((entry, index) => (
                                                    <Cell
                                                        key={`cell-${index}`}
                                                        fill={`hsl(${330 - index * 10}, 80%, ${60 + index * 5}%)`}
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* Homework Chart - Bar Chart */}
                            {performanceTab === 'homework' && (
                                <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
                                    <h3 style={{
                                        fontSize: '1rem',
                                        fontWeight: '700',
                                        marginBottom: '0.75rem',
                                        color: 'var(--text-main)'
                                    }}>
                                        Homework Completion Rate
                                    </h3>
                                    <ResponsiveContainer width="100%" height={180}>
                                        <BarChart data={homeworkData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                            <XAxis
                                                dataKey="name"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#64748b', fontSize: 11, fontWeight: '600' }}
                                                dy={10}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#64748b', fontSize: 11 }}
                                                domain={[0, 100]}
                                            />
                                            <Tooltip
                                                contentStyle={{
                                                    background: 'white',
                                                    border: 'none',
                                                    borderRadius: '12px',
                                                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                                                    padding: '12px'
                                                }}
                                                cursor={{ fill: '#fef3c7' }}
                                            />
                                            <Bar
                                                dataKey="completion"
                                                fill="#f59e0b"
                                                radius={[6, 6, 0, 0]}
                                                animationDuration={1000}
                                                animationBegin={0}
                                                barSize={40}
                                            >
                                                {homeworkData.map((entry, index) => (
                                                    <Cell
                                                        key={`cell-${index}`}
                                                        fill={`hsl(${45 - index * 3}, 93%, ${50 + index * 2}%)`}
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* Attendance Chart */}
                            {performanceTab === 'attendance' && (
                                <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
                                    <h3 style={{
                                        fontSize: '1rem',
                                        fontWeight: '700',
                                        marginBottom: '0.75rem',
                                        color: 'var(--text-main)'
                                    }}>
                                        {selectedClass === 'all' ? 'All Classes Attendance (6 Weeks)' : 'Weekly Attendance Percentage'}
                                    </h3>
                                    <ResponsiveContainer width="100%" height={180}>
                                        {selectedClass === 'all' ? (
                                            <BarChart data={attendanceData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: '600' }} dy={10} />
                                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 100]} />
                                                <Tooltip contentStyle={{ background: 'white', border: 'none', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)', padding: '12px' }} cursor={{ fill: '#fef3c7' }} />
                                                <Bar dataKey="percentage" radius={[6, 6, 0, 0]} animationDuration={1000} barSize={40}>
                                                    {attendanceData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.fill || '#10b981'} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        ) : (
                                            <AreaChart data={attendanceData}>
                                                <defs>
                                                    <linearGradient id="colorAttendance" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                                <XAxis
                                                    dataKey="name"
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: '600' }}
                                                    dy={10}
                                                />
                                                <YAxis
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fill: '#64748b', fontSize: 11 }}
                                                    domain={[0, 100]}
                                                />
                                                <Tooltip
                                                    contentStyle={{
                                                        background: 'white',
                                                        border: 'none',
                                                        borderRadius: '12px',
                                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                                                        padding: '12px'
                                                    }}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="percentage"
                                                    stroke="#10b981"
                                                    strokeWidth={3}
                                                    fillOpacity={1}
                                                    fill="url(#colorAttendance)"
                                                    animationDuration={1000}
                                                    animationBegin={0}
                                                />
                                            </AreaChart>
                                        )}
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </div>


                    {/* Teacher Feedback Card Removed */}

                    {/* Teachers Performance */}
                    <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '2rem' }}>
                        <div className="card" style={{
                            padding: '0',
                            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(6, 182, 212, 0.08) 100%)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            border: '1px solid rgba(99, 102, 241, 0.2)',
                            boxShadow: '0 8px 32px rgba(79, 70, 229, 0.15), 0 0 0 1px rgba(99, 102, 241, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            {/* Animated gradient overlay */}
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.03) 0%, rgba(6, 182, 212, 0.03) 100%)',
                                pointerEvents: 'none',
                                zIndex: 0
                            }} />

                            {/* Glass shine effect */}
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                height: '2px',
                                background: 'linear-gradient(90deg, transparent, rgba(99, 102, 241, 0.6), rgba(6, 182, 212, 0.6), transparent)',
                                zIndex: 1
                            }} />
                            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(241, 245, 249, 0.6)', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', zIndex: 2 }}>
                                <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Teachers Live</h3>

                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', width: '100%' }}>
                                    <button
                                        onClick={() => navigate('/inbox')}
                                        style={{
                                            flex: 1,
                                            padding: '0.75rem 1rem',
                                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '12px',
                                            fontSize: '0.875rem',
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.625rem',
                                            transition: 'var(--transition)',
                                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
                                            position: 'relative'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'translateY(-2px)';
                                            e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.25)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.15)';
                                        }}
                                    >
                                        <MessageCircle size={18} />
                                        <span>Inbox</span>

                                        {messages.filter(m => m.read === false).length > 0 && (
                                            <span style={{
                                                background: '#ef4444',
                                                color: 'white',
                                                fontSize: '0.75rem',
                                                fontWeight: '800',
                                                padding: '2px 8px',
                                                borderRadius: '20px',
                                                marginLeft: '0.5rem',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                                border: '1.5px solid rgba(255,255,255,0.3)'
                                            }}>
                                                {messages.filter(m => m.read === false).length}
                                            </span>
                                        )}
                                    </button>
                                </div>
                            </div>
                            <div className="custom-scrollbar" style={{ padding: '1rem', maxHeight: '400px', overflowY: 'auto', position: 'relative', zIndex: 2 }}>
                                {teachers.map((teacher, i) => (
                                    <div key={i} className="flex-between" style={{ padding: '1rem', borderRadius: '12px', transition: 'var(--transition)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ position: 'relative' }}>
                                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justify: 'center' }}>
                                                    <User size={20} color="#64748b" />
                                                </div>
                                                <div style={{
                                                    position: 'absolute', bottom: '-2px', right: '-2px',
                                                    width: '12px', height: '12px', borderRadius: '50%', border: '2px solid white',
                                                    background: teacher.status === 'on' ? 'var(--success)' : 'var(--danger)'
                                                }} />
                                            </div>
                                            <div>
                                                <p
                                                    onClick={(e) => {
                                                        setSelectedTeacher(teacher);
                                                        setIsBroadcast(false);
                                                        if (e && e.currentTarget) {
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setModalPos({
                                                                top: rect.bottom + 10,
                                                                left: Math.min(rect.left, window.innerWidth - 420)
                                                            });
                                                        } else {
                                                            setModalPos(null);
                                                        }
                                                    }}
                                                    style={{
                                                        fontWeight: '600',
                                                        fontSize: '0.9rem',
                                                        cursor: 'pointer',
                                                        transition: 'var(--transition)'
                                                    }}
                                                    onMouseEnter={(e) => e.target.style.color = 'var(--primary)'}
                                                    onMouseLeave={(e) => e.target.style.color = 'inherit'}
                                                >
                                                    {teacher.name}
                                                    <span style={{
                                                        marginLeft: '0.75rem',
                                                        fontSize: '0.65rem',
                                                        padding: '0.2rem 0.5rem',
                                                        borderRadius: '8px',
                                                        background: teacher.isPresent ? '#3b82f6' : '#ef4444',
                                                        color: 'white',
                                                        verticalAlign: 'middle',
                                                        fontWeight: '600'
                                                    }}>
                                                        {teacher.isPresent ? 'Present' : 'Absent'}
                                                    </span>
                                                </p>
                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{teacher.class}</p>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <p style={{ fontSize: '0.7rem', color: teacher.status === 'on' ? 'var(--success)' : 'var(--danger)', fontWeight: '600' }}>
                                                {teacher.status === 'on' ? 'On Class' : 'Off Class'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Quick Notes */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>



                            {/* Teacher Performance Ranking Card */}
                            <div className="card" style={{
                                position: 'relative',
                                background: 'linear-gradient(135deg, #ffffff 0%, #fefce8 100%)',
                                border: '1px solid #fef08a'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <h3 style={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#854d0e' }}>
                                        <Award size={20} fill="#facc15" color="#ca8a04" />
                                        Performance Ranking
                                    </h3>
                                    <span style={{ fontSize: '0.8rem', color: '#a16207', background: '#fef9c3', padding: '0.25rem 0.5rem', borderRadius: '8px', fontWeight: '600' }}>
                                        Top Performers
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {teachers
                                        .map(t => ({
                                            ...t,
                                            // Simulated weighted score: 40% App Usage (mocked via status), 60% Student Impact (mock score)
                                            performanceScore: Math.round(((t.status === 'on' ? 95 : 85) * 0.4) + (t.score * 0.6))
                                        }))
                                        .sort((a, b) => b.performanceScore - a.performanceScore)
                                        .slice(rankingPage * 5, (rankingPage + 1) * 5)
                                        .map((teacher, index) => {
                                            const actualRank = (rankingPage * 5) + index + 1;
                                            return (
                                                <div
                                                    key={index}
                                                    onClick={() => navigate('/teachers', { state: { selectedTeacherId: teacher.id } })}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '1rem',
                                                        padding: '0.75rem', borderRadius: '12px',
                                                        background: actualRank === 1 ? 'linear-gradient(90deg, #fef9c3 0%, #ffffff 100%)' : '#ffffff',
                                                        border: actualRank === 1 ? '1px solid #fde047' : '1px solid #f1f5f9',
                                                        boxShadow: actualRank === 1 ? '0 4px 6px -1px rgba(250, 204, 21, 0.1)' : 'none',
                                                        cursor: 'pointer',
                                                        transition: 'transform 0.2s',
                                                        zIndex: 1
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(4px)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'translateX(0)'}
                                                >
                                                    {/* Rank Badge */}
                                                    <div style={{
                                                        width: '28px', height: '28px', borderRadius: '50%',
                                                        background: actualRank === 1 ? '#fbbf24' : (actualRank === 2 ? '#e2e8f0' : (actualRank === 3 ? '#fb923c' : '#f8fafc')),
                                                        color: actualRank > 3 ? '#64748b' : 'white',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontWeight: '700', fontSize: '0.85rem',
                                                        boxShadow: actualRank < 4 ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                                                    }}>
                                                        {actualRank}
                                                    </div>

                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                                            <span style={{ fontWeight: '600', fontSize: '0.9rem', color: '#1e293b' }}>{teacher.name}</span>
                                                            <span style={{ fontWeight: '700', fontSize: '0.9rem', color: actualRank === 1 ? '#ca8a04' : 'var(--primary)' }}>
                                                                {teacher.performanceScore}%
                                                            </span>
                                                        </div>
                                                        <div style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                                            <div style={{
                                                                width: `${teacher.performanceScore}%`,
                                                                height: '100%',
                                                                background: actualRank === 1 ? '#eab308' : 'var(--primary)',
                                                                borderRadius: '3px',
                                                                transition: 'width 1s ease-out'
                                                            }} />
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                                                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{teacher.class}</span>
                                                            {actualRank === 1 && <span style={{ fontSize: '0.7rem', color: '#ca8a04', fontWeight: '600' }}>🏆 Top Performer</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>

                                {/* Pagination Controls */}
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
                                    <button
                                        onClick={() => setRankingPage(Math.max(0, rankingPage - 1))}
                                        disabled={rankingPage === 0}
                                        style={{
                                            border: 'none', background: 'transparent', cursor: rankingPage === 0 ? 'default' : 'pointer',
                                            color: rankingPage === 0 ? '#cbd5e1' : '#64748b', fontSize: '0.85rem', fontWeight: '600',
                                            display: 'flex', alignItems: 'center', gap: '0.25rem'
                                        }}
                                    >
                                        <ChevronDown size={16} style={{ transform: 'rotate(90deg)' }} /> Prev
                                    </button>
                                    <button
                                        onClick={() => setRankingPage(rankingPage + 1)}
                                        disabled={(rankingPage + 1) * 5 >= teachers.length}
                                        style={{
                                            border: 'none', background: 'transparent', cursor: (rankingPage + 1) * 5 >= teachers.length ? 'default' : 'pointer',
                                            color: (rankingPage + 1) * 5 >= teachers.length ? '#cbd5e1' : '#64748b', fontSize: '0.85rem', fontWeight: '600',
                                            display: 'flex', alignItems: 'center', gap: '0.25rem'
                                        }}
                                    >
                                        Next <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>


                </div>
            </div>

            {/* Message Modal */}
            {selectedTeacher && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'transparent', // Removed dark overlay
                        zIndex: 1000,
                    }}
                    onClick={() => {
                        setSelectedTeacher(null);
                        setModalPos(null);
                    }}
                >
                    <div
                        style={{
                            position: modalPos ? 'absolute' : 'relative',
                            top: modalPos ? `${modalPos.top}px` : 'auto',
                            left: modalPos ? `${modalPos.left}px` : 'auto',
                            background: 'rgba(255, 255, 255, 0.98)', // Less transparent
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            borderRadius: '16px', // Slightly smaller radius
                            padding: '1.5rem', // Reduced padding
                            width: '90%',
                            maxWidth: '400px', // Smaller max width
                            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)', // Professional shadow
                            animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                            ...(modalPos ? {} : { margin: '15vh auto' }) // Fallback centering
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Glass shine effect */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '2px',
                            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 1), transparent)',
                            borderRadius: '24px 24px 0 0'
                        }} />

                        {/* Close button */}
                        <button
                            onClick={() => {
                                setSelectedTeacher(null);
                                setModalPos(null);
                            }}
                            style={{
                                position: 'absolute',
                                top: '1rem',
                                right: '1rem',
                                background: 'rgba(0, 0, 0, 0.05)',
                                border: 'none',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'var(--transition)'
                            }}
                            onMouseEnter={(e) => e.target.style.background = 'rgba(0, 0, 0, 0.1)'}
                            onMouseLeave={(e) => e.target.style.background = 'rgba(0, 0, 0, 0.05)'}
                        >
                            <X size={18} color="#64748b" />
                        </button>

                        {/* Header */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                                Send Message
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                To: <span style={{ fontWeight: '600', color: 'var(--primary)' }}>{selectedTeacher.name}</span> ({selectedTeacher.class})
                            </p>
                        </div>

                        {/* Message Input */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{
                                display: 'block',
                                marginBottom: '0.5rem',
                                fontWeight: '600',
                                fontSize: '0.9rem',
                                color: 'var(--text-main)'
                            }}>
                                Message
                            </label>
                            <textarea
                                value={messageText}
                                onChange={(e) => setMessageText(e.target.value)}
                                placeholder="Type your message here..."
                                style={{
                                    width: '100%',
                                    minHeight: '120px',
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    border: '2px solid #f1f5f9',
                                    fontSize: '0.95rem',
                                    fontFamily: 'inherit',
                                    resize: 'vertical',
                                    outline: 'none',
                                    transition: 'var(--transition)',
                                    background: 'rgba(255, 255, 255, 0.8)'
                                }}
                                onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                                onBlur={(e) => e.target.style.borderColor = '#f1f5f9'}
                            />
                        </div>

                        {/* Send Button */}
                        <button
                            onClick={handleSendMessage}
                            disabled={!messageText.trim() || isSending}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                background: messageText.trim() ? 'var(--primary)' : '#cbd5e1',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                fontSize: '1rem',
                                fontWeight: '600',
                                cursor: messageText.trim() ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                transition: 'var(--transition)',
                                boxShadow: messageText.trim() ? '0 4px 12px rgba(79, 70, 229, 0.3)' : 'none'
                            }}
                            onMouseEnter={(e) => {
                                if (messageText.trim()) {
                                    e.target.style.background = '#4338ca';
                                    e.target.style.transform = 'translateY(-2px)';
                                    e.target.style.boxShadow = '0 6px 16px rgba(79, 70, 229, 0.4)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (messageText.trim()) {
                                    e.target.style.background = 'var(--primary)';
                                    e.target.style.transform = 'translateY(0)';
                                    e.target.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.3)';
                                }
                            }}
                        >
                            <Send size={18} />
                            {isSending ? 'Sending...' : 'Send Message'}
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
            `}</style>
        </div>
    );
};



export default Dashboard;
