import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Users, UserCheck, CreditCard, PieChart as PieIcon,
    Send, Activity, Award, User, Clock, ChevronRight, ChevronLeft, Wallet, X, ChevronDown, GraduationCap, MessageCircle, MessagesSquare, Trash2, Paperclip, BookOpen, CheckCircle2, CircleDashed,
    Wifi, WifiOff, RefreshCw, Loader2, Sparkles, ClipboardList, Trophy, Medal
} from 'lucide-react';
import FinancesDashboard from '../components/FinancesDashboard';
import { useAuthPermissions } from '../context/AuthPermissionsContext';
import { checkFeeTabAccess } from '../constants/permissions';
import { db, auth, functions } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, setDoc, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { cacheDashboardStats, getCachedDashboardStats, cacheDashboardFullData, getCachedDashboardFullData } from '../utils/offlineDataEngine';
import { getDocsFast } from '../utils/cacheUtils';
import {
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
    CartesianGrid, Tooltip, BarChart, Bar, Cell, LineChart, Line, RadialBarChart, RadialBar, Legend
} from 'recharts';

const getTeacherInitials = (name) => {
    if (!name) return 'T';
    const clean = String(name).replace(/^(mr\.|mrs\.|ms\.|dr\.|sir\s+|teacher\s+)/i, '').trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.substring(0, 2).toUpperCase();
};

const MetricTooltipPill = ({ label, value, fullTitle, weight, extraInfo }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    return (
        <div 
            style={{ position: 'relative', display: 'inline-flex' }}
            onMouseEnter={(e) => { e.stopPropagation(); setShowTooltip(true); }}
            onMouseLeave={(e) => { e.stopPropagation(); setShowTooltip(false); }}
        >
            <span style={{ 
                fontSize: '0.65rem', 
                padding: '2px 7px', 
                borderRadius: '4px', 
                background: showTooltip ? '#dbeafe' : '#eff6ff', 
                color: '#1d4ed8', 
                fontWeight: '600', 
                border: showTooltip ? '1px solid #93c5fd' : '1px solid #dbeafe',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'inline-flex',
                alignItems: 'center',
                whiteSpace: 'nowrap'
            }}>
                {label}: {value}%
            </span>
            {showTooltip && (
                <div style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 7px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#0f172a',
                    color: '#ffffff',
                    padding: '6px 10px',
                    borderRadius: '7px',
                    fontSize: '0.72rem',
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
                    zIndex: 9999,
                    pointerEvents: 'none',
                    border: '1px solid rgba(255,255,255,0.1)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ color: '#f8fafc' }}>{fullTitle}: </span>
                        <span style={{ color: '#38bdf8', fontWeight: '800' }}>{value}% </span>
                        <span style={{ color: '#94a3b8', fontSize: '0.65rem', fontWeight: '500' }}>({weight}% Weight)</span>
                    </div>
                    {extraInfo && (
                        <div style={{ color: '#67e8f9', fontSize: '0.65rem', marginTop: '2px', fontWeight: '500' }}>
                            📊 {extraInfo}
                        </div>
                    )}
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 0,
                        height: 0,
                        borderLeft: '5px solid transparent',
                        borderRight: '5px solid transparent',
                        borderTop: '5px solid #0f172a'
                    }} />
                </div>
            )}
        </div>
    );
};

const Dashboard = () => {
    const navigate = useNavigate();

    // 1. Instant Cached Session & School Initialization
    const initialSession = useMemo(() => {
        try {
            const manualSession = localStorage.getItem('manual_session');
            return manualSession ? JSON.parse(manualSession) : null;
        } catch (_) {
            return null;
        }
    }, []);

    const initialSchoolId = initialSession?.schoolId || null;

    const cachedInitialData = useMemo(() => {
        try {
            if (!initialSchoolId) return null;
            const full = getCachedDashboardFullData(initialSchoolId);
            const stats = getCachedDashboardStats(initialSchoolId);
            return {
                ...stats,
                ...full
            };
        } catch (_) {
            return null;
        }
    }, [initialSchoolId]);

    const [schoolId, setSchoolId] = useState(() => initialSchoolId);
    const [currentUserId, setCurrentUserId] = useState(() => initialSession?.uid || 'principal');
    const [currentUserRole, setCurrentUserRole] = useState(() => (initialSession?.role || 'principal').toLowerCase());
    const [currentUserName, setCurrentUserName] = useState(() => {
        if (!initialSession) return '';
        if (initialSession.displayName) return initialSession.displayName;
        if (initialSession.role === 'school Admin' && initialSession.email) {
            const name = initialSession.email.split('@')[0];
            return name.charAt(0).toUpperCase() + name.slice(1);
        }
        return initialSession.role === 'school Admin' ? 'Admin' : 'Principal';
    });

    // messagingId is 'principal' for the principal, and UID for admins.
    const messagingId = (currentUserRole === 'principal') ? 'principal' : currentUserId;

    // Dual-Dashboard Slide Navigation (Overview <---> Finance Hub)
    const [dashboardView, setDashboardView] = useState('overview'); // 'overview' | 'finance'
    const [hasOpenedFinance, setHasOpenedFinance] = useState(false);

    // Auth Permissions Guard for Finance Access (Strictly hides Finance Hub for unauthorized User Admins)
    const authPerms = useAuthPermissions();
    const canAccessFinances = useMemo(() => {
        if (!authPerms) return currentUserRole === 'principal';
        if (authPerms.isPrincipal) return true;
        const role = authPerms.role || currentUserRole;
        const perms = authPerms.permissions || {};
        return checkFeeTabAccess(role, perms, 'finances');
    }, [authPerms, currentUserRole]);

    const [fetchedClasses, setFetchedClasses] = useState(() => cachedInitialData?.classes || []);
    const [messages, setMessages] = useState([]);
    const [teachers, setTeachers] = useState(() => cachedInitialData?.teachers || []);

    const [collectionStats, setCollectionStats] = useState(() => cachedInitialData?.collectionStats || { paid: 0, unpaid: 0, total: 0 });
    const [attendanceStats, setAttendanceStats] = useState(() => cachedInitialData?.attendanceStats || { present: 0, absent: 0 });
    const [atomicCounts, setAtomicCounts] = useState(() => cachedInitialData?.atomicCounts || { studentCount: null, parentCount: null, teacherCount: null });
    const [statsLoaded, setStatsLoaded] = useState(() => Boolean(
        cachedInitialData?.collectionStats?.total ||
        cachedInitialData?.atomicCounts?.studentCount ||
        (cachedInitialData?.classes && cachedInitialData.classes.length > 0)
    ));
    const [allClassesData, setAllClassesData] = useState(() => {
        if (cachedInitialData?.classStatsMap) {
            return new Map(Object.entries(cachedInitialData.classStatsMap));
        }
        return new Map();
    });

    // 2. UI State
    const [selectedTeacher, setSelectedTeacher] = useState(null);
    const [messageText, setMessageText] = useState('');
    const [isSending, setIsSending] = useState(false);

    const [modalPos, setModalPos] = useState(null); // New state for popup position
    const [performanceTab, setPerformanceTab] = useState('subjects');
    const [selectedClass, setSelectedClass] = useState('all');
    const [showClassDropdown, setShowClassDropdown] = useState(false);
    const [rankingPage, setRankingPage] = useState(0);
    const [rankingData, setRankingData] = useState(() => cachedInitialData?.rankingData || []);
    const [rankingCycle, setRankingCycle] = useState(() => cachedInitialData?.rankingCycle || '');
    const [isSyncingRankings, setIsSyncingRankings] = useState(false);
    const [lastRankingSync, setLastRankingSync] = useState(null);
    const [teacherHomeworkCounts, setTeacherHomeworkCounts] = useState(() => cachedInitialData?.teacherHomeworkCounts || {});
    const [teacherMonthlyAttendance, setTeacherMonthlyAttendance] = useState(() => cachedInitialData?.teacherMonthlyAttendance || {});
    const [teacherSyllabusScores, setTeacherSyllabusScores] = useState(() => cachedInitialData?.teacherSyllabusScores || {});
    const [teacherAcademicScores, setTeacherAcademicScores] = useState(() => cachedInitialData?.teacherAcademicScores || {});
    const [masterTimetable, setMasterTimetable] = useState(() => cachedInitialData?.masterTimetable || null);
    const [isInjectingDemo, setIsInjectingDemo] = useState(false);
    const [isInjectingSyllabus, setIsInjectingSyllabus] = useState(false);

    // Syllabus Widget State
    const [syllabusWidgetClass, setSyllabusWidgetClass] = useState('');
    const [syllabusWidgetSubject, setSyllabusWidgetSubject] = useState('');
    const [syllabusWidgetData, setSyllabusWidgetData] = useState([]);
    const [syllabusWidgetLoading, setSyllabusWidgetLoading] = useState(false);

    // Global System Connection & Offline Queues Monitor
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [pendingCount, setPendingCount] = useState(0);

    const checkPendingQueues = () => {
        try {
            const manualSession = localStorage.getItem('manual_session');
            const sid = schoolId || (manualSession ? JSON.parse(manualSession)?.schoolId : null);
            if (!sid) {
                setPendingCount(0);
                return;
            }
            const feeQueue = JSON.parse(localStorage.getItem(`offline_fee_queue_${sid}`) || '[]');
            const admQueue = JSON.parse(localStorage.getItem(`offline_admissions_queue_${sid}`) || '[]');
            setPendingCount((feeQueue.length || 0) + (admQueue.length || 0));
        } catch (e) {
            setPendingCount(0);
        }
    };

    useEffect(() => {
        checkPendingQueues();
        const handleOnline = () => {
            setIsOnline(true);
            checkPendingQueues();
        };
        const handleOffline = () => {
            setIsOnline(false);
            checkPendingQueues();
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const interval = setInterval(checkPendingQueues, 4000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, [schoolId]);

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

    // Fetch Atomic Counters
    useEffect(() => {
        if (!schoolId) return;
        const fetchCounters = async () => {
            try {
                const snap = await getDoc(doc(db, `schools/${schoolId}/metrics`, 'counts'));
                if (snap.exists()) {
                    const cData = snap.data();
                    setAtomicCounts(cData);
                    cacheDashboardFullData(schoolId, { atomicCounts: cData });
                }
            } catch (err) {
                console.error("Dashboard: Error fetching atomic counters", err);
            }
        };
        fetchCounters();
    }, [schoolId]);

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
            value: statsLoaded ? (collectionStats.total || atomicCounts.studentCount || 0).toLocaleString() : 'Loading...',
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
                    name: data.name || 'Teacher',
                    class: Array.isArray(data.assignedClasses) && data.assignedClasses.length > 0
                        ? data.assignedClasses[0]
                        : (data.assignedClasses || 'Unassigned'),
                    status: isOff ? 'off' : 'on',
                    isPresent: data.lastAttendanceDate === todayStr,
                    score: 75 + (((doc.id || 'A').charCodeAt(0)) % 20)
                };
            });
            setTeachers(list);
            if (schoolId) {
                cacheDashboardFullData(schoolId, { teachers: list });
                if (list.length === 0) {
                    setAtomicCounts(prev => ({ ...prev, teacherCount: 0 }));
                    setRankingData([]);
                    setDoc(doc(db, `schools/${schoolId}/metrics`, 'teacherRanking'), {
                        rankings: [],
                        totalTeachers: 0,
                        lastCalculatedAt: serverTimestamp()
                    }, { merge: true }).catch(() => {});
                    try {
                        const raw = localStorage.getItem(`cached_dash_full_${schoolId}`);
                        if (raw) {
                            const parsed = JSON.parse(raw);
                            if (parsed.atomicCounts) {
                                parsed.atomicCounts.teacherCount = 0;
                            }
                            parsed.teachers = [];
                            parsed.rankingData = [];
                            localStorage.setItem(`cached_dash_full_${schoolId}`, JSON.stringify(parsed));
                        }
                    } catch (_) {}
                }
            }
        });
        return () => unsubscribe();
    }, [schoolId]);

    // Listen to Pre-aggregated Teacher Rankings (Fast O(1) Load)
    useEffect(() => {
        if (!schoolId) return;
        const rankingDocRef = doc(db, `schools/${schoolId}/metrics`, 'teacherRanking');
        const unsubscribe = onSnapshot(rankingDocRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (Array.isArray(data.rankings) && data.rankings.length > 0) {
                    setRankingData(data.rankings);
                }
                if (data.cycle?.label) {
                    setRankingCycle(data.cycle.label);
                }
                if (data.lastCalculatedAt) {
                    const dateObj = data.lastCalculatedAt.toDate ? data.lastCalculatedAt.toDate() : new Date(data.lastCalculatedAt);
                    setLastRankingSync(dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                }
                if (schoolId && Array.isArray(data.rankings)) {
                    cacheDashboardFullData(schoolId, {
                        rankingData: data.rankings,
                        rankingCycle: data.cycle?.label || ''
                    });
                }
            }
        }, (err) => {
            console.error("[Dashboard] Ranking Listener Error:", err);
        });
        return () => unsubscribe();
    }, [schoolId]);

    // Real-Time Listener for School Weekly Master Timetable (Single Document, Zero DB Overhead, 100% Offline Cached)
    useEffect(() => {
        if (!schoolId) return;
        const ttRef = doc(db, 'schools', schoolId, 'timetables', 'weeklyMaster');
        const unsub = onSnapshot(ttRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setMasterTimetable(data);
                if (schoolId) {
                    cacheDashboardFullData(schoolId, { masterTimetable: data });
                }
            }
        }, (err) => {
            console.warn("[Dashboard] Error fetching master timetable:", err);
        });
        return () => unsub();
    }, [schoolId]);

    // Helper: Extract all unique { className, subjectName } slots for a teacher from master timetable (with fallback)
    const getTeacherTimetableSlots = (t, timetable) => {
        const slots = [];
        if (!t) return slots;
        const tId = String(t.id || '').trim();
        const tName = String(t.name || '').trim().toLowerCase();

        if (timetable && Array.isArray(timetable.rows)) {
            const row = timetable.rows.find(r => 
                String(r.teacherId || '').trim() === tId ||
                String(r.id || '').trim() === tId ||
                String(r.teacherName || '').trim().toLowerCase() === tName
            );
            if (row && Array.isArray(row.cells)) {
                row.cells.forEach(cell => {
                    const cName = String(cell?.class || '').trim();
                    const sName = String(cell?.subject || '').trim();
                    if (cName && sName && cName !== 'FREE' && cName !== 'BREAK') {
                        if (!slots.some(s => s.className.toLowerCase() === cName.toLowerCase() && s.subjectName.toLowerCase() === sName.toLowerCase())) {
                            slots.push({ className: cName, subjectName: sName });
                        }
                    }
                });
            }
        }

        // Fallback: If no slots found in timetable, fallback to teacher's assignedClasses & subjects
        if (slots.length === 0) {
            const assignedClasses = Array.isArray(t.assignedClasses) && t.assignedClasses.length > 0
                ? t.assignedClasses
                : (t.assignedClass ? [t.assignedClass] : (t.class ? [t.class] : []));
            const assignedSubjects = Array.isArray(t.subjects) && t.subjects.length > 0
                ? t.subjects
                : (Array.isArray(t.displaySubjects) && t.displaySubjects.length > 0 ? t.displaySubjects : (t.subject ? [t.subject] : []));

            assignedClasses.forEach(cName => {
                assignedSubjects.forEach(sName => {
                    const cn = String(cName || '').trim();
                    const sn = String(sName || '').trim();
                    if (cn && sn && !slots.some(s => s.className.toLowerCase() === cn.toLowerCase() && s.subjectName.toLowerCase() === sn.toLowerCase())) {
                        slots.push({ className: cn, subjectName: sn });
                    }
                });
            });
        }

        return slots;
    };

    // Helper: Compute Academic Score for a teacher strictly from their assigned subjects in their assigned classes
    const computeTeacherAcademicScore = (t, timetable, classesList, classDataMap) => {
        const slots = getTeacherTimetableSlots(t, timetable);
        if (slots.length === 0 || !classesList || classesList.length === 0 || !classDataMap) return 0;

        let totalSubjMarks = 0;
        let totalSubjCount = 0;
        let totalHwMarks = 0;
        let totalHwCount = 0;

        slots.forEach(slot => {
            const normC = slot.className.trim().toLowerCase();
            const matchedCls = classesList.find(fc => 
                fc.id === slot.className || 
                String(fc.name || '').trim().toLowerCase() === normC ||
                String(fc.name || '').trim().toLowerCase().replace(/\s+/g, '') === normC.replace(/\s+/g, '')
            );
            if (!matchedCls) return;

            const stats = classDataMap.get(matchedCls.id);
            if (!stats) return;

            const targetSubjLower = slot.subjectName.trim().toLowerCase();

            // Match subject in stats.subjects
            if (stats.subjects && typeof stats.subjects === 'object') {
                for (const [sKey, sData] of Object.entries(stats.subjects)) {
                    if (String(sKey || '').trim().toLowerCase() === targetSubjLower) {
                        totalSubjMarks += sData.total || 0;
                        totalSubjCount += sData.count || 0;
                        break;
                    }
                }
            }

            // Match subject in stats.homework
            if (stats.homework && typeof stats.homework === 'object') {
                for (const [hKey, hData] of Object.entries(stats.homework)) {
                    if (String(hKey || '').trim().toLowerCase() === targetSubjLower) {
                        totalHwMarks += hData.total || 0;
                        totalHwCount += hData.count || 0;
                        break;
                    }
                }
            }
        });

        const avgSubj = totalSubjCount > 0 ? (totalSubjMarks / totalSubjCount) : 0;
        const avgHw = totalHwCount > 0 ? (totalHwMarks / totalHwCount) : 0;

        let finalScore = 0;
        if (totalSubjCount > 0 && totalHwCount > 0) {
            finalScore = Math.round((avgSubj + avgHw) / 2);
        } else if (totalSubjCount > 0) {
            finalScore = Math.round(avgSubj);
        } else if (totalHwCount > 0) {
            finalScore = Math.round(avgHw);
        }

        return Math.min(100, Math.max(0, finalScore));
    };

    // Manual / On-Demand Teacher Ranking Sync
    const handleSyncTeacherRankings = async () => {
        if (!schoolId || isSyncingRankings) return;
        setIsSyncingRankings(true);
        try {
            // Priority 1: Try Cloud Function if deployed
            try {
                const syncCallable = httpsCallable(functions, 'syncSchoolTeacherRankings');
                const res = await syncCallable({ schoolId });
                if (res.data?.rankings && Array.isArray(res.data.rankings) && res.data.rankings.length > 0) {
                    setRankingData(res.data.rankings);
                    if (res.data?.cycle) setRankingCycle(res.data.cycle);
                    setLastRankingSync(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                    setIsSyncingRankings(false);
                    return;
                }
            } catch (cfErr) {
                console.info("[Dashboard] Cloud function sync not available or failed, computing live rankings client-side...", cfErr);
            }

            // Priority 2: Real Client-side ranking calculation (Zero-Mock, Pure Data)
            if (teachers.length > 0) {
                const now = new Date();
                const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                const currentMonthName = monthNames[now.getMonth()];
                const cycleLabel = `${currentMonthName} ${now.getFullYear()} (30-Day Cycle)`;
                setRankingCycle(cycleLabel);

                const currentYear = now.getFullYear();
                const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
                const startOfMonthStr = `${currentYear}-${currentMonth}-01`;
                const endOfMonthStr = `${currentYear}-${currentMonth}-31`;

                // 1. Gather all homework across fetched classes
                const hwCounts = {};
                for (const cls of fetchedClasses) {
                    try {
                        const hwRef = collection(db, `schools/${schoolId}/classes/${cls.id}/homework`);
                        const hwSnap = await getDocsFast(hwRef);
                        hwSnap.docs.forEach(d => {
                            const data = d.data();
                            const aDate = data.assignedDate || '';
                            if (!aDate || aDate >= startOfMonthStr) {
                                const tid = data.teacherId ? String(data.teacherId).trim() : null;
                                const tname = data.teacherName ? String(data.teacherName).trim().toLowerCase() : null;
                                if (tid) hwCounts[tid] = (hwCounts[tid] || 0) + 1;
                                if (tname) hwCounts[tname] = (hwCounts[tname] || 0) + 1;
                            }
                        });
                    } catch (_) {}
                }
                setTeacherHomeworkCounts(hwCounts);

                // Find max homework count among all teachers as benchmark
                let maxHwCount = 0;
                teachers.forEach(t => {
                    const count = Math.max(
                        hwCounts[t.id] || 0,
                        hwCounts[String(t.name || '').trim().toLowerCase()] || 0
                    );
                    if (count > maxHwCount) maxHwCount = count;
                });

                // 2. Compute individual 4-pillar scores per teacher
                const calculated = await Promise.all(teachers.map(async (t) => {
                    const tName = String(t.name || t.id || 'Teacher');
                    const tId = t.id;

                    // A. Pillar 4: Homework Activity (10%)
                    const tHw = Math.max(
                        hwCounts[tId] || 0,
                        hwCounts[tName.trim().toLowerCase()] || 0
                    );
                    const homeworkScore = maxHwCount > 0
                        ? Math.min(100, Math.max(0, Math.round((tHw / maxHwCount) * 100)))
                        : (tHw > 0 ? 100 : 0);

                    // B. Pillar 3: Attendance (25%) - Current Month Calendar Working Days
                    let teacherStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    if (t.createdAt || t.joiningDate) {
                        const joinRaw = t.joiningDate || (t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt));
                        const joinDate = new Date(joinRaw);
                        if (!isNaN(joinDate.getTime()) && joinDate > teacherStartDate && joinDate <= now) {
                            teacherStartDate = new Date(joinDate.getFullYear(), joinDate.getMonth(), joinDate.getDate());
                        }
                    }

                    let totalWorkingDays = 0;
                    const curDate = new Date(teacherStartDate);
                    const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    while (curDate <= todayDateOnly) {
                        if (curDate.getDay() !== 0) { // Exclude Sundays
                            totalWorkingDays++;
                        }
                        curDate.setDate(curDate.getDate() + 1);
                    }
                    if (totalWorkingDays === 0) totalWorkingDays = 1;

                    let presentPoints = 0;
                    let leavesCount = 0;
                    let loggedDays = 0;

                    try {
                        const attRef = collection(db, `schools/${schoolId}/teachers/${tId}/attendance_logs`);
                        const attQuery = query(attRef, where('date', '>=', startOfMonthStr), where('date', '<=', endOfMonthStr));
                        const attSnap = await getDocsFast(attQuery);
                        if (!attSnap.empty) {
                            attSnap.docs.forEach(ad => {
                                const st = ad.data().status;
                                loggedDays++;
                                if (st === 'Present') presentPoints += 1.0;
                                else if (st === 'Half Day') presentPoints += 0.5;
                                else if (st === 'Leave') leavesCount++;
                            });
                        }
                    } catch (_) {}

                    let presentDays = presentPoints;
                    let absentDays = 0;
                    let attendanceScore = 0;

                    if (loggedDays > 0) {
                        absentDays = Math.max(0, Math.round(totalWorkingDays - presentPoints - leavesCount));
                        attendanceScore = Math.min(100, Math.max(0, Math.round((presentPoints / totalWorkingDays) * 100)));
                    } else {
                        const isPres = t.isPresent || (t.lastAttendanceDate === endOfMonthStr);
                        presentDays = isPres ? 1 : 0;
                        absentDays = Math.max(0, totalWorkingDays - presentDays);
                        attendanceScore = Math.min(100, Math.max(0, Math.round((presentDays / totalWorkingDays) * 100)));
                    }

                    // C. Pillar 1: Academics - Timetable-based Subject & Homework performance across all taught classes
                    const academicScore = computeTeacherAcademicScore(t, masterTimetable, fetchedClasses, allClassesData);

                    // D. Pillar 2: Syllabus - Real Completed Chapters Query based on timetable slots
                    let syllabusScore = 0;
                    try {
                        const slots = getTeacherTimetableSlots(t, masterTimetable);
                        let totalChapters = 0;
                        let completedChapters = 0;

                        for (const slot of slots) {
                            const normC = slot.className.trim().toLowerCase();
                            const matchedCls = fetchedClasses.find(fc => 
                                fc.id === slot.className || 
                                String(fc.name || '').trim().toLowerCase() === normC ||
                                String(fc.name || '').trim().toLowerCase().replace(/\s+/g, '') === normC.replace(/\s+/g, '')
                            );
                            if (!matchedCls) continue;

                            try {
                                const chapRef = collection(db, `schools/${schoolId}/classes/${matchedCls.id}/syllabus/${slot.subjectName}/chapters`);
                                const snap = await getDocsFast(chapRef);
                                if (!snap.empty) {
                                    snap.docs.forEach(cd => {
                                        totalChapters++;
                                        if (cd.data().status === 'Completed') completedChapters++;
                                    });
                                }
                            } catch (_) {}
                        }

                        if (totalChapters > 0) {
                            syllabusScore = Math.min(100, Math.max(0, Math.round((completedChapters / totalChapters) * 100)));
                        }
                    } catch (_) {}

                    // Flat Equal Average Score (25% Academics + 25% Syllabus + 25% Attendance + 25% Homework)
                    const performanceScore = Math.min(100, Math.max(0, Math.round(
                        (academicScore + syllabusScore + attendanceScore + homeworkScore) / 4
                    )));

                    return {
                        ...t,
                        teacherId: tId,
                        performanceScore,
                        tier: performanceScore >= 85 ? 'Top Performer' : (performanceScore >= 75 ? 'Consistent' : 'Developing'),
                        badge: performanceScore >= 85 ? 'Top' : (performanceScore >= 75 ? 'Good' : 'Standard'),
                        breakdown: {
                            academicScore,
                            syllabusScore,
                            attendanceScore,
                            homeworkScore,
                            homeworkCount: tHw,
                            attendanceInfo: {
                                presentDays,
                                absentDays,
                                totalWorkingDays
                            }
                        }
                    };
                }));

                // Strict Score-Based Sort (Highest to Lowest) with tie-breakers
                calculated.sort((a, b) => {
                    if (b.performanceScore !== a.performanceScore) {
                        return b.performanceScore - a.performanceScore;
                    }
                    const hwB = b.breakdown?.homeworkScore ?? 0;
                    const hwA = a.breakdown?.homeworkScore ?? 0;
                    if (hwB !== hwA) return hwB - hwA;

                    const attB = b.breakdown?.attendanceScore ?? 0;
                    const attA = a.breakdown?.attendanceScore ?? 0;
                    return attB - attA;
                });

                calculated.forEach((t, i) => { t.rank = i + 1; });
                setRankingData(calculated);
                setLastRankingSync(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

                try {
                    await setDoc(doc(db, `schools/${schoolId}/metrics`, 'teacherRanking'), {
                        rankings: calculated,
                        totalTeachers: calculated.length,
                        cycle: {
                            month: currentMonthName,
                            year: now.getFullYear(),
                            label: cycleLabel,
                            days: 30
                        },
                        lastCalculatedAt: serverTimestamp()
                    }, { merge: true });
                } catch (e) {
                    console.error("[Dashboard] Error saving local ranking fallback:", e);
                }
            }
        } catch (error) {
            console.error("[Dashboard] Ranking sync error:", error);
        } finally {
            setIsSyncingRankings(false);
        }
    };




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
            if (schoolId) {
                cacheDashboardFullData(schoolId, { classes: list });
            }

            if (list.length === 0) {
                setCollectionStats({ paid: 0, unpaid: 0, total: 0 });
                setStatsLoaded(true);
            }
        });

        return () => unsubClasses();
    }, [schoolId]);

    // Automatic Background Sync of Monthly Homework Counts per Teacher across classes
    useEffect(() => {
        if (!schoolId || !fetchedClasses || fetchedClasses.length === 0) return;

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const startOfMonthStr = `${currentYear}-${currentMonth}-01`;

        let isMounted = true;
        const loadHomeworkCounts = async () => {
            const counts = {};
            try {
                await Promise.all(fetchedClasses.map(async (cls) => {
                    try {
                        const hwRef = collection(db, `schools/${schoolId}/classes/${cls.id}/homework`);
                        const snap = await getDocsFast(hwRef);
                        snap.docs.forEach(d => {
                            const data = d.data();
                            const assignDate = data.assignedDate || '';
                            if (!assignDate || assignDate >= startOfMonthStr) {
                                const tid = data.teacherId ? String(data.teacherId).trim() : null;
                                const tname = data.teacherName ? String(data.teacherName).trim().toLowerCase() : null;
                                if (tid) counts[tid] = (counts[tid] || 0) + 1;
                                if (tname) counts[tname] = (counts[tname] || 0) + 1;
                            }
                        });
                    } catch (_) {}
                }));
                if (isMounted) {
                    setTeacherHomeworkCounts(counts);
                    if (schoolId) cacheDashboardFullData(schoolId, { teacherHomeworkCounts: counts });
                }
            } catch (err) {
                console.warn("[Dashboard] Error loading homework counts:", err);
            }
        };

        loadHomeworkCounts();
        return () => { isMounted = false; };
    }, [schoolId, fetchedClasses]);

    // Automatic Background Sync of Monthly Attendance Logs per Teacher
    useEffect(() => {
        if (!schoolId || !teachers || teachers.length === 0) return;

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const startOfMonthStr = `${currentYear}-${currentMonth}-01`;
        const endOfMonthStr = `${currentYear}-${currentMonth}-31`;
        const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        let isMounted = true;
        const loadTeacherAttendance = async () => {
            const attMap = {};
            try {
                await Promise.all(teachers.map(async (t) => {
                    const tId = t.id;
                    let teacherStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    if (t.createdAt || t.joiningDate) {
                        const joinRaw = t.joiningDate || (t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt));
                        const joinDate = new Date(joinRaw);
                        if (!isNaN(joinDate.getTime()) && joinDate > teacherStartDate && joinDate <= now) {
                            teacherStartDate = new Date(joinDate.getFullYear(), joinDate.getMonth(), joinDate.getDate());
                        }
                    }

                    let totalWorkingDays = 0;
                    const curDate = new Date(teacherStartDate);
                    while (curDate <= todayDateOnly) {
                        if (curDate.getDay() !== 0) { // Exclude Sundays
                            totalWorkingDays++;
                        }
                        curDate.setDate(curDate.getDate() + 1);
                    }
                    if (totalWorkingDays === 0) totalWorkingDays = 1;

                    let presentPoints = 0;
                    let leavesCount = 0;
                    let loggedDays = 0;

                    try {
                        const attRef = collection(db, `schools/${schoolId}/teachers/${tId}/attendance_logs`);
                        const attQuery = query(attRef, where('date', '>=', startOfMonthStr), where('date', '<=', endOfMonthStr));
                        const attSnap = await getDocsFast(attQuery);
                        if (!attSnap.empty) {
                            attSnap.docs.forEach(ad => {
                                const st = ad.data().status;
                                loggedDays++;
                                if (st === 'Present') presentPoints += 1.0;
                                else if (st === 'Half Day') presentPoints += 0.5;
                                else if (st === 'Leave') leavesCount++;
                            });
                        }
                    } catch (_) {}

                    let presentDays = presentPoints;
                    let absentDays = 0;
                    let attendanceScore = 0;

                    if (loggedDays > 0) {
                        absentDays = Math.max(0, Math.round(totalWorkingDays - presentPoints - leavesCount));
                        attendanceScore = Math.min(100, Math.max(0, Math.round((presentPoints / totalWorkingDays) * 100)));
                    } else {
                        const isPres = t.isPresent || (t.lastAttendanceDate === `${currentYear}-${currentMonth}-${String(now.getDate()).padStart(2, '0')}`);
                        presentDays = isPres ? 1 : 0;
                        absentDays = Math.max(0, totalWorkingDays - presentDays);
                        attendanceScore = Math.min(100, Math.max(0, Math.round((presentDays / totalWorkingDays) * 100)));
                    }

                    attMap[tId] = {
                        presentDays,
                        absentDays,
                        totalWorkingDays,
                        attendanceScore
                    };
                }));

                if (isMounted) {
                    setTeacherMonthlyAttendance(attMap);
                    if (schoolId) cacheDashboardFullData(schoolId, { teacherMonthlyAttendance: attMap });
                }
            } catch (err) {
                console.warn("[Dashboard] Error loading teacher attendance:", err);
            }
        };

        loadTeacherAttendance();
        return () => { isMounted = false; };
    }, [schoolId, teachers]);

    // Automatic Background Sync of Real Syllabus Progress per Teacher from Firestore based on Timetable
    useEffect(() => {
        if (!schoolId || !teachers || teachers.length === 0 || !fetchedClasses || fetchedClasses.length === 0) return;

        let isMounted = true;
        const loadTeacherSyllabus = async () => {
            const sylMap = {};
            try {
                await Promise.all(teachers.map(async (t) => {
                    const tId = t.id;
                    const slots = getTeacherTimetableSlots(t, masterTimetable);

                    let totalChapters = 0;
                    let completedChapters = 0;

                    for (const slot of slots) {
                        const normC = slot.className.trim().toLowerCase();
                        const matchedCls = fetchedClasses.find(fc => 
                            fc.id === slot.className || 
                            String(fc.name || '').trim().toLowerCase() === normC ||
                            String(fc.name || '').trim().toLowerCase().replace(/\s+/g, '') === normC.replace(/\s+/g, '')
                        );
                        if (!matchedCls) continue;

                        try {
                            const chapRef = collection(db, `schools/${schoolId}/classes/${matchedCls.id}/syllabus/${slot.subjectName}/chapters`);
                            const snap = await getDocsFast(chapRef);
                            if (!snap.empty) {
                                snap.docs.forEach(cd => {
                                    totalChapters++;
                                    if (cd.data().status === 'Completed') completedChapters++;
                                });
                            }
                        } catch (_) {}
                    }

                    const syllabusScore = totalChapters > 0
                        ? Math.min(100, Math.max(0, Math.round((completedChapters / totalChapters) * 100)))
                        : 0;

                    sylMap[tId] = {
                        totalChapters,
                        completedChapters,
                        syllabusScore
                    };
                }));

                if (isMounted) {
                    setTeacherSyllabusScores(sylMap);
                    if (schoolId) cacheDashboardFullData(schoolId, { teacherSyllabusScores: sylMap });
                }
            } catch (err) {
                console.warn("[Dashboard] Error loading teacher syllabus progress:", err);
            }
        };

        loadTeacherSyllabus();
        return () => { isMounted = false; };
    }, [schoolId, teachers, fetchedClasses, masterTimetable]);

    // Automatic Background Sync of Real Academic Scores per Teacher from Timetable & Class Metrics
    useEffect(() => {
        if (!schoolId || !teachers || teachers.length === 0 || !fetchedClasses || fetchedClasses.length === 0) return;

        let isMounted = true;
        const loadTeacherAcademics = () => {
            const acadMap = {};
            try {
                teachers.forEach(t => {
                    const tId = t.id;
                    const academicScore = computeTeacherAcademicScore(t, masterTimetable, fetchedClasses, allClassesData);
                    acadMap[tId] = {
                        academicScore
                    };
                });

                if (isMounted) {
                    setTeacherAcademicScores(acadMap);
                    if (schoolId) {
                        cacheDashboardFullData(schoolId, { teacherAcademicScores: acadMap });
                    }
                }
            } catch (err) {
                console.warn("[Dashboard] Error loading teacher academics from timetable:", err);
            }
        };

        loadTeacherAcademics();
        return () => { isMounted = false; };
    }, [schoolId, teachers, fetchedClasses, allClassesData, masterTimetable]);

    // Auto-sync teacher rankings if cache/db schema is outdated or empty
    useEffect(() => {
        if (!schoolId || !teachers || teachers.length === 0 || isSyncingRankings) return;
        const needsSync = !rankingData || rankingData.length === 0 || rankingData.some(r => r.breakdown?.homeworkScore === undefined || !r.breakdown?.attendanceInfo);
        if (needsSync) {
            handleSyncTeacherRankings();
        }
    }, [schoolId, teachers.length]);

    // 4. Consolidated Student Listener (Fees, Attendance, Performance)
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
            const newColStats = { paid: totalPaid, unpaid: totalUnpaid, total: totalStudents };
            const newAttStats = { present: totalPresent, absent: totalAbsent };
            setCollectionStats(newColStats);
            setAttendanceStats(newAttStats);

            const classStatsObj = {};
            classDataMap.forEach((val, key) => {
                classStatsObj[key] = val;
            });

            if (schoolId) {
                cacheDashboardStats(schoolId, {
                    collectionStats: newColStats,
                    attendanceStats: newAttStats
                });
                cacheDashboardFullData(schoolId, {
                    collectionStats: newColStats,
                    attendanceStats: newAttStats,
                    classStatsMap: classStatsObj
                });
            }

            // Update the map state for Charts to use
            setAllClassesData(new Map(classDataMap));
            setStatsLoaded(true);
        };

        // Helper for robust date & timezone matching
        const isDateToday = (targetDate) => {
            if (!targetDate) return false;
            let targetStr = targetDate;
            if (typeof targetDate === 'object' && targetDate.toDate) {
                const d = targetDate.toDate();
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                targetStr = `${y}-${m}-${day}`;
            }

            const d = new Date();
            const localYear = d.getFullYear();
            const localMonth = String(d.getMonth() + 1).padStart(2, '0');
            const localDay = String(d.getDate()).padStart(2, '0');
            const localToday = `${localYear}-${localMonth}-${localDay}`;
            const utcToday = d.toISOString().split('T')[0];

            return targetStr === localToday || targetStr === utcToday;
        };

        fetchedClasses.forEach(cls => {
            const qStudents = query(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
            const unsubStudents = onSnapshot(qStudents, (snap) => {
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

                    // 2. Attendance (Strict Today Check, Case-Insensitive, Timezone Resilient)
                    const isMarkedToday = isDateToday(data.lastAttendanceDate);
                    const statusLower = (data.status || '').toLowerCase();

                    if (isMarkedToday && statusLower === 'present') {
                        classStats.attendance.present++;
                    } else if (isMarkedToday && statusLower === 'absent') {
                        classStats.attendance.absent++;
                    }

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

    // Derived 4-Pillar Teacher Performance Rankings (Strictly Score-Sorted, Fully Dynamic)
    const effectiveRankings = useMemo(() => {
        if (!teachers || teachers.length === 0) return [];

        // Determine max homework count among all teachers for relative benchmarking
        const hwCounts = teachers.map(t => Math.max(
            teacherHomeworkCounts[t.id] || 0,
            teacherHomeworkCounts[String(t.name || '').trim().toLowerCase()] || 0
        ));
        const maxHw = Math.max(...hwCounts, 0);

        const list = teachers.map((t) => {
            const tId = t.id;
            const tName = String(t.name || tId || 'Teacher');
            const tNameLower = tName.trim().toLowerCase();

            // Match ranking document breakdown if available
            const rMatch = (rankingData || []).find(r => r.teacherId === tId || r.id === tId);
            const b = rMatch?.breakdown || {};

            // 1. Pillar 4: Homework Activity - Strictly based on live homework
            const liveHwCount = Math.max(
                teacherHomeworkCounts[tId] || 0,
                teacherHomeworkCounts[tNameLower] || 0,
                b.homeworkCount || 0
            );
            const homeworkScore = maxHw > 0
                ? Math.min(100, Math.max(0, Math.round((liveHwCount / maxHw) * 100)))
                : (liveHwCount > 0 ? 100 : 0);

            // 2. Pillar 3: Attendance - Real mobile check-in/out logs
            const attInfo = teacherMonthlyAttendance[tId] || b.attendanceInfo || {};
            const presentDays = attInfo.presentDays !== undefined ? attInfo.presentDays : (t.isPresent ? 1 : 0);
            const absentDays = attInfo.absentDays !== undefined ? attInfo.absentDays : 0;
            const totalWorkingDays = attInfo.totalWorkingDays || (presentDays + absentDays || 1);
            const attendanceScore = attInfo.attendanceScore !== undefined
                ? attInfo.attendanceScore
                : (b.attendanceScore !== undefined ? b.attendanceScore : Math.min(100, Math.max(0, Math.round((presentDays / totalWorkingDays) * 100))));

            // 3. Pillar 1: Academics - Timetable-based Subject & Homework performance across all taught classes
            const liveAcademicScore = computeTeacherAcademicScore(t, masterTimetable, fetchedClasses, allClassesData);
            const acadInfo = teacherAcademicScores[tId] || {};
            const academicScore = acadInfo.academicScore !== undefined
                ? acadInfo.academicScore
                : liveAcademicScore;

            // 4. Pillar 2: Syllabus Progress - Real completed chapters from teacherSyllabusScores
            const sylInfo = teacherSyllabusScores[tId] || {};
            const syllabusScore = sylInfo.syllabusScore !== undefined
                ? sylInfo.syllabusScore
                : 0;

            // Flat Equal Average Score (25% Academics + 25% Syllabus + 25% Attendance + 25% Homework)
            const performanceScore = Math.min(100, Math.max(0, Math.round(
                (academicScore + syllabusScore + attendanceScore + homeworkScore) / 4
            )));

            return {
                ...t,
                teacherId: tId,
                name: tName,
                performanceScore,
                tier: performanceScore >= 85 ? 'Top Performer' : (performanceScore >= 75 ? 'Consistent' : 'Developing'),
                badge: performanceScore >= 85 ? 'Top' : (performanceScore >= 75 ? 'Good' : 'Standard'),
                breakdown: {
                    academicScore,
                    syllabusScore,
                    attendanceScore,
                    homeworkScore,
                    homeworkCount: liveHwCount,
                    attendanceInfo: {
                        presentDays,
                        absentDays,
                        totalWorkingDays
                    }
                }
            };
        });

        // STRICT SCORE-BASED SORTING (HIGHEST TO LOWEST - ZERO ALPHABET BIAS)
        list.sort((a, b) => {
            if (b.performanceScore !== a.performanceScore) {
                return b.performanceScore - a.performanceScore;
            }
            // Tie-breaker 1: Homework score
            const hwB = b.breakdown?.homeworkScore ?? 0;
            const hwA = a.breakdown?.homeworkScore ?? 0;
            if (hwB !== hwA) return hwB - hwA;

            // Tie-breaker 2: Attendance score
            const attB = b.breakdown?.attendanceScore ?? 0;
            const attA = a.breakdown?.attendanceScore ?? 0;
            return attB - attA;
        });

        return list.map((t, idx) => ({ ...t, rank: idx + 1 }));
    }, [rankingData, teachers, teacherHomeworkCounts, teacherMonthlyAttendance, teacherSyllabusScores, teacherAcademicScores, allClassesData, fetchedClasses, masterTimetable]);

    // 5. Attendance Chart Data (Real-time)
    const [attendanceChartData, setAttendanceChartData] = useState(() => cachedInitialData?.attendanceChartData || []);

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
                if (schoolId) {
                    cacheDashboardFullData(schoolId, { attendanceChartData: chartData });
                }
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

    // Strict Demo Account Check: Only school 6257 can view or trigger demo injection
    const isDemoSchool = useMemo(() => {
        try {
            const sid = schoolId || (localStorage.getItem('manual_session') ? JSON.parse(localStorage.getItem('manual_session'))?.schoolId : '');
            return String(sid || '').trim() === '6257';
        } catch (_) {
            return false;
        }
    }, [schoolId]);

    const handleInjectPerformanceDemoData = async () => {
        const session = localStorage.getItem('manual_session');
        const activeSchoolId = schoolId || (session ? JSON.parse(session).schoolId : null);
        if (!activeSchoolId) {
            alert("School ID not found. Please log in again.");
            return;
        }

        if (String(activeSchoolId).trim() !== '6257') {
            alert("Restricted: Demo performance injection is only allowed on Demo Account 6257.");
            return;
        }

        setIsInjectingDemo(true);
        try {
            // 1. Identify target classes or create if empty
            let targetClasses = [...fetchedClasses];

            if (targetClasses.length === 0) {
                const sampleClasses = [
                    { name: 'Class 10', section: 'A' },
                    { name: 'Class 9', section: 'A' },
                    { name: 'Class 8', section: 'A' },
                    { name: 'Class 5', section: 'A' }
                ];
                for (const sc of sampleClasses) {
                    const classRef = await addDoc(collection(db, `schools/${activeSchoolId}/classes`), {
                        name: sc.name,
                        section: sc.section,
                        createdAt: serverTimestamp()
                    });
                    targetClasses.push({ id: classRef.id, name: sc.name, section: sc.section });
                }
            }

            const studentNames = [
                "Muhammad Ali", "Fatima Zahra", "Ahmed Raza", "Zainab Bibi",
                "Hamza Tariq", "Ayesha Malik", "Bilal Khan", "Maryam Noor"
            ];

            const today = new Date();
            const localYear = today.getFullYear();
            const localMonth = String(today.getMonth() + 1).padStart(2, '0');
            const localDay = String(today.getDate()).padStart(2, '0');
            const todayStr = `${localYear}-${localMonth}-${localDay}`;

            // 2. Populate realistic students and scores for each class
            for (let cIdx = 0; cIdx < targetClasses.length; cIdx++) {
                const cls = targetClasses[cIdx];
                const studentsCol = collection(db, `schools/${activeSchoolId}/classes/${cls.id}/students`);
                const createdStudentIds = [];

                for (let sIdx = 0; sIdx < 6; sIdx++) {
                    const name = studentNames[(cIdx * 2 + sIdx) % studentNames.length];
                    const rollNo = `${(cIdx + 1) * 100 + (sIdx + 1)}`;
                    const baseAcademic = 75 + ((cIdx * 5 + sIdx * 7) % 20);
                    const baseHw = 80 + ((cIdx * 7 + sIdx * 5) % 18);

                    const sDoc = await addDoc(studentsCol, {
                        name,
                        rollNo,
                        status: sIdx === 5 ? 'absent' : 'present',
                        lastAttendanceDate: todayStr,
                        monthlyFeeStatus: sIdx % 4 === 0 ? 'unpaid' : 'paid',
                        academicScores: [
                            { subject: 'Mathematics', score: Math.min(99, baseAcademic + 4) },
                            { subject: 'English', score: Math.min(99, baseAcademic - 3) },
                            { subject: 'Urdu', score: Math.min(99, baseAcademic + 2) },
                            { subject: 'Science', score: Math.min(99, baseAcademic + 6) },
                            { subject: 'Islamiyat', score: Math.min(99, baseAcademic + 8) },
                            { subject: 'Social Study', score: Math.min(99, baseAcademic - 2) }
                        ],
                        homeworkScores: [
                            { subject: 'Mathematics', score: Math.min(100, baseHw + 5) },
                            { subject: 'English', score: Math.min(100, baseHw + 2) },
                            { subject: 'Urdu', score: Math.min(100, baseHw + 4) },
                            { subject: 'Science', score: Math.min(100, baseHw + 8) },
                            { subject: 'Islamiyat', score: Math.min(100, baseHw + 6) },
                            { subject: 'Social Study', score: Math.min(100, baseHw) }
                        ],
                        createdAt: serverTimestamp()
                    });
                    createdStudentIds.push(sDoc.id);
                }

                // 3. Inject attendance records across past 6 weeks for attendance trends
                for (let w = 0; w < 6; w++) {
                    const pastDate = new Date();
                    pastDate.setDate(pastDate.getDate() - (w * 7 + (cIdx % 3)));
                    const pYear = pastDate.getFullYear();
                    const pMonth = String(pastDate.getMonth() + 1).padStart(2, '0');
                    const pDay = String(pastDate.getDate()).padStart(2, '0');
                    const pDateStr = `${pYear}-${pMonth}-${pDay}`;

                    await addDoc(collection(db, `schools/${activeSchoolId}/attendance`), {
                        classId: cls.id,
                        className: cls.name,
                        date: pDateStr,
                        records: createdStudentIds.map((stId, rIdx) => ({
                            studentId: stId,
                            status: (rIdx === 0 && w % 2 === 1) ? 'absent' : 'present'
                        })),
                        timestamp: serverTimestamp()
                    });
                }
            }

            alert("✨ Demo Performance Data Injected Successfully!\n\nAll 4 tabs (Classes, Subjects, Homework, and Attendance) are now active with live data.");
        } catch (error) {
            console.error("Error injecting demo performance data:", error);
            alert("Error injecting demo data: " + error.message);
        } finally {
            setIsInjectingDemo(false);
        }
    };

    const handleInjectSyllabusDemoData = async () => {
        const session = localStorage.getItem('manual_session');
        const activeSchoolId = schoolId || (session ? JSON.parse(session).schoolId : null);
        if (!activeSchoolId) {
            alert("School ID not found. Please log in again.");
            return;
        }

        if (String(activeSchoolId).trim() !== '6257') {
            alert("Restricted: Demo syllabus injection is only allowed on Demo Account 6257.");
            return;
        }

        setIsInjectingSyllabus(true);
        try {
            const primaryClasses = [
                { name: 'Class 1', section: 'A' },
                { name: 'Class 2', section: 'A' },
                { name: 'Class 3', section: 'A' },
                { name: 'Class 4', section: 'A' },
                { name: 'Class 5', section: 'A' }
            ];

            const primarySubjects = ['Mathematics', 'English', 'General Science', 'Urdu', 'Islamiyat'];

            const syllabusDataBySubject = {
                'Mathematics': [
                    { title: "Unit 1: Numbers & Counting (1 to 1000)", time: "2 weeks", status: "Completed", topics: ["Counting & Writing Numbers", "Odd & Even Numbers", "Place Value Chart"] },
                    { title: "Unit 2: Addition & Subtraction Fundamentals", time: "3 weeks", status: "Completed", topics: ["2-Digit & 3-Digit Addition", "Carrying Over & Borrowing", "Word Problems"] },
                    { title: "Unit 3: Multiplication Tables (2 to 10)", time: "3 weeks", status: "Completed", topics: ["Skip Counting Drills", "Mental Math Shortcuts", "Multiplication Tables"] },
                    { title: "Unit 4: Division & Equal Sharing", time: "2 weeks", status: "In Progress", topics: ["Concept of Equal Sharing", "Single Digit Division", "Remainders"] },
                    { title: "Unit 5: 2D & 3D Basic Geometry", time: "2 weeks", status: "Pending", topics: ["Circle, Triangle, Rectangle", "Edges, Vertices and Faces", "Drawing Patterns"] },
                    { title: "Unit 6: Measurement, Money & Telling Time", time: "2 weeks", status: "Pending", topics: ["Reading Analog Clocks", "Pakistani Rupee Coins & Notes", "Length in Meters & Centimeters"] }
                ],
                'General Science': [
                    { title: "Unit 1: Human Body & Five Senses", time: "2 weeks", status: "Completed", topics: ["Sight, Hearing, Smell, Taste, Touch", "Healthy Habits & Cleanliness", "Body Parts"] },
                    { title: "Unit 2: Plants & Living Things", time: "2 weeks", status: "Completed", topics: ["Parts of a Plant (Roots, Stem, Leaves)", "Seeds Germination Process", "What Plants Need to Grow"] },
                    { title: "Unit 3: Animals & Their Habitats", time: "2 weeks", status: "Completed", topics: ["Domestic vs Wild Animals", "Birds, Fish and Insects", "Herbivores and Carnivores"] },
                    { title: "Unit 4: Matter, Materials & Water", time: "2 weeks", status: "In Progress", topics: ["Solids, Liquids and Gases", "Water Cycle in Nature", "Sink or Float Fun Experiment"] },
                    { title: "Unit 5: Earth, Sun & Weather Seasons", time: "2 weeks", status: "Pending", topics: ["Day & Night Rotation", "Four Seasons of Pakistan", "Clouds, Rain & Wind"] }
                ],
                'English': [
                    { title: "Unit 1: The Magic Garden (Reading)", time: "2 weeks", status: "Completed", topics: ["Reading Fluency & Phonics", "New Vocabulary Words", "Nouns & Proper Nouns"] },
                    { title: "Unit 2: Friends in Need (Story)", time: "2 weeks", status: "Completed", topics: ["Moral Story Reading", "Action Verbs & Simple Present", "Making Sentences"] },
                    { title: "Unit 3: Poem - Twinkling Stars", time: "1 week", status: "Completed", topics: ["Rhyming Words & Rhythm", "Recitation & Expression", "Short Comprehension Questions"] },
                    { title: "Unit 4: A Wonderful Zoo Visit", time: "2 weeks", status: "In Progress", topics: ["Creative Paragraph Writing", "Adjectives & Describing Words", "Punctuation Rules"] },
                    { title: "Unit 5: Clean City, Green Pakistan", time: "2 weeks", status: "Pending", topics: ["Civic Sense & Hygiene", "Pronouns & Conjunctions", "Spelling Bee Activity"] }
                ],
                'Urdu': [
                    { title: "سبق نمبر 1: حمد باری تعالیٰ", time: "2 ہفتے", status: "Completed", topics: ["اشعار کی درست پڑھائی اور مفہوم", "مشکل الفاظ کے معانی", "املا اور جملہ سازی"] },
                    { title: "سبق نمبر 2: نعت رسول مقبول ﷺ", time: "2 ہفتے", status: "Completed", topics: ["سیرت پاک کی جھلکیاں", "نظم خوانی ترنم کے ساتھ", "ہم قافیہ الفاظ"] },
                    { title: "سبق نمبر 3: سچ بولنے کی برکت", time: "2 ہفتے", status: "Completed", topics: ["سبق آموز کہانی و فہم", "اسم، فعل اور حرف کی پہچان", "خوشخطی مشق"] },
                    { title: "سبق نمبر 4: ہماری پیاری دھرتی (پاکستان)", time: "2 ہفتے", status: "In Progress", topics: ["وطن سے محبت و قومی پرچم", "مختصر سوال جواب", "مضمون نویسی کی مشق"] },
                    { title: "سبق نمبر 5: وقت کی پابندی اور محنت", time: "2 ہفتے", status: "Pending", topics: ["روزمرہ کا ٹائم ٹیبل", "قواعد و انشا پردازی", "واحد جمع اور متضاد الفاظ"] }
                ],
                'Islamiyat': [
                    { title: "باب 1: بنیادی عقائد و ارکانِ اسلام", time: "2 ہفتے", status: "Completed", topics: ["کلمہ طیبہ اور توحید کا مفہوم", "نماز کی پابندی", "روزہ اور زکوٰۃ کا بنیادی تعارف"] },
                    { title: "باب 2: سیرت طیبہ حضرت محمد ﷺ", time: "3 ہفتے", status: "Completed", topics: ["ولادت باسعادت اور بچپن", "صادق اور امین کے اوصاف", "بچوں اور بزرگوں پر شفقت"] },
                    { title: "باب 3: طہارت، وضو اور نماز", time: "2 ہفتے", status: "Completed", topics: ["وضو کے فرائض و سنن", "نماز کے ارکان اور دعائیں", "عملی وضو و نماز مشق"] },
                    { title: "باب 4: حسن اخلاق اور والدین کا احترام", time: "2 ہفتے", status: "In Progress", topics: ["والدین اور اساتذہ کا ادب", "سلام میں پہل کرنا", "سچائی اور امانت داری"] },
                    { title: "باب 5: روزمرہ کی مسنون دعائیں اور کلمات", time: "2 ہفتے", status: "Pending", topics: ["کھانے سے پہلے اور بعد کی دعا", "سونے اور جاگنے کی دعا", "حفظ و ترجمہ"] }
                ]
            };

            for (const pc of primaryClasses) {
                // Find existing class or create
                let classDoc = fetchedClasses.find(c => c.name?.toLowerCase().trim() === pc.name.toLowerCase().trim());
                let classId = classDoc?.id;

                if (!classId) {
                    const classRef = await addDoc(collection(db, `schools/${activeSchoolId}/classes`), {
                        name: pc.name,
                        section: pc.section,
                        subjects: primarySubjects,
                        createdAt: serverTimestamp()
                    });
                    classId = classRef.id;
                } else {
                    // Update subjects list
                    await setDoc(doc(db, `schools/${activeSchoolId}/classes`, classId), {
                        subjects: primarySubjects
                    }, { merge: true });
                }

                // Inject chapters for all 5 subjects
                for (const subj of primarySubjects) {
                    const chapters = syllabusDataBySubject[subj] || [];
                    for (let chIdx = 0; chIdx < chapters.length; chIdx++) {
                        const chapter = chapters[chIdx];
                        const chapRef = doc(db, `schools/${activeSchoolId}/classes/${classId}/syllabus/${subj}/chapters`, `chap_${chIdx + 1}`);
                        await setDoc(chapRef, {
                            ...chapter,
                            order: chIdx + 1,
                            updatedAt: serverTimestamp()
                        }, { merge: true });
                    }
                }
            }

            // Immediately switch widget to Class 1 - Mathematics for instant live presentation!
            setSyllabusWidgetClass('Class 1');
            setSyllabusWidgetSubject('Mathematics');

            alert("✨ Demo Syllabus Injected Successfully!\n\nClass 1 to Class 5 syllabi (Mathematics, General Science, English, Urdu, Islamiyat) are now live and ready for presentation.");
        } catch (error) {
            console.error("Error injecting demo syllabus:", error);
            alert("Error injecting syllabus demo data: " + error.message);
        } finally {
            setIsInjectingSyllabus(false);
        }
    };

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
        <div className="animate-fade-in-up" style={{ width: '100%', overflowX: 'hidden' }}>
            <div style={{
                display: 'flex',
                width: canAccessFinances ? '200%' : '100%',
                transform: (canAccessFinances && dashboardView === 'finance') ? 'translateX(-50%)' : 'translateX(0%)',
                transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                alignItems: 'flex-start'
            }}>
                {/* SLIDE 1: MAIN ACADEMIC DASHBOARD */}
                <div style={{ width: canAccessFinances ? '50%' : '100%', flexShrink: 0, boxSizing: 'border-box', minWidth: 0 }}>
                    {/* Header Area */}
                    <div className="flex-between" style={{ marginBottom: '2.5rem' }}>
                        <div>
                            <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>{getGreeting()}, {currentUserName}</h1>
                            <p style={{ color: 'var(--text-muted)' }}>Here's what's happening in your school today.</p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
                            {/* Dynamic System Connection & Offline Queues Status Badge */}
                            {!isOnline ? (
                                <div className="card" style={{
                                    padding: '0.5rem 0.95rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    background: '#fff7ed',
                                    borderColor: '#fed7aa',
                                    color: '#ea580c'
                                }}>
                                    <WifiOff size={16} color="#ea580c" />
                                    <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>
                                        Offline Mode {pendingCount > 0 ? `(${pendingCount} Saved)` : '(Local)'}
                                    </span>
                                </div>
                            ) : pendingCount > 0 ? (
                                <div className="card" style={{
                                    padding: '0.5rem 0.95rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    background: '#eff6ff',
                                    borderColor: '#bfdbfe',
                                    color: '#2563eb'
                                }}>
                                    <RefreshCw size={16} color="#2563eb" />
                                    <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>
                                        Online ({pendingCount} Syncing...)
                                    </span>
                                </div>
                            ) : (
                                <div className="card" style={{
                                    padding: '0.5rem 0.95rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    background: '#ecfdf5',
                                    borderColor: '#a7f3d0',
                                    color: '#059669'
                                }}>
                                    <Wifi size={16} color="#059669" />
                                    <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>
                                        Cloud Connected
                                    </span>
                                </div>
                            )}

                            <div className="card" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Clock size={18} color="var(--primary)" />
                                <span style={{ fontWeight: '600' }}>{new Date().toLocaleDateString()}</span>
                            </div>

                            {/* Slide to Finance Dashboard Shortcut Button (Strictly Guarded by Permissions) */}
                            {canAccessFinances && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setHasOpenedFinance(true);
                                        setDashboardView('finance');
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    className="card"
                                    style={{
                                        padding: '0.5rem 0.95rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        background: '#ecfdf5',
                                        borderColor: '#a7f3d0',
                                        color: '#059669',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        userSelect: 'none'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = '#d1fae5';
                                        e.currentTarget.style.borderColor = '#6ee7b7';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = '#ecfdf5';
                                        e.currentTarget.style.borderColor = '#a7f3d0';
                                    }}
                                    title="Slide to Finance & Fee Dashboard"
                                >
                                    <Wallet size={16} color="#059669" />
                                    <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>
                                        Finance Hub
                                    </span>
                                    <ChevronRight size={16} color="#059669" />
                                </button>
                            )}
                        </div>
                    </div>


            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                {/* Left Column Content (Now Full Width) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                    {/* Overview Stats */}
                    <div className="stats-grid" style={{ gap: '1rem', marginBottom: '0' }}>
                        {overviewStats.map((stat, i) => (
                            <div
                                key={i}
                                className="card"
                                onClick={() => stat.path && navigate(stat.path)}
                                style={{
                                    padding: '1rem 1.15rem',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    border: 'none',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.75rem',
                                    background: stat.gradient,
                                    color: 'white',
                                    boxShadow: `0 10px 15px -3px ${stat.shadow}`,
                                    transition: 'all 0.3s ease',
                                    cursor: stat.path ? 'pointer' : 'default'
                                }}
                            >
                                {/* 2D Geometric Pattern (Square) */}
                                <div style={{
                                    position: 'absolute',
                                    top: '-15%',
                                    right: '-10%',
                                    width: '90px',
                                    height: '90px',
                                    background: 'rgba(255, 255, 255, 0.12)',
                                    borderRadius: '24px',
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
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '12px',
                                        background: 'rgba(255, 255, 255, 0.2)',
                                        backdropFilter: 'blur(10px)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '1px solid rgba(255, 255, 255, 0.3)'
                                    }}>
                                        <stat.icon size={20} color="white" />
                                    </div>
                                    {stat.showTag && (
                                        <div style={{
                                            padding: '0.25rem 0.6rem',
                                            borderRadius: '8px',
                                            background: 'rgba(255, 255, 255, 0.15)',
                                            color: 'white',
                                            fontSize: '0.7rem',
                                            fontWeight: '700',
                                            border: '1px solid rgba(255, 255, 255, 0.2)'
                                        }}>
                                            Live
                                        </div>
                                    )}
                                </div>

                                <div style={{ position: 'relative', zIndex: 2 }}>
                                    <p style={{ fontSize: '0.8rem', fontWeight: '500', opacity: 0.9, marginBottom: '0.2rem', letterSpacing: '0.02em' }}>{stat.label}</p>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                                        <h3 style={{ fontSize: '1.5rem', fontWeight: '800', letterSpacing: '-0.02em', color: 'white', margin: 0 }}>{stat.value}</h3>
                                        {stat.subValue && (
                                            <span style={{
                                                fontSize: '0.75rem',
                                                fontWeight: '600',
                                                background: 'rgba(255,255,255,0.2)',
                                                padding: '2px 6px',
                                                borderRadius: '5px',
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

                    {/* School Performance Card */}
                    <div className="card" style={{
                        background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                        boxShadow: '0 20px 25px -5px rgba(99, 102, 241, 0.4)',
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
                        {/* 2D Geometric Pattern (Matching Overview Cards) */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            overflow: 'hidden',
                            borderRadius: 'inherit',
                            pointerEvents: 'none',
                            zIndex: 0
                        }}>
                            {/* 2D Geometric Pattern (Square) */}
                            <div style={{
                                position: 'absolute',
                                top: '-25%',
                                right: '-5%',
                                width: '220px',
                                height: '220px',
                                background: 'rgba(255, 255, 255, 0.12)',
                                borderRadius: '45px',
                                transform: 'rotate(20deg)'
                            }} />
                        </div>

                        {/* Header */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '1rem',
                            position: 'relative',
                            zIndex: 2,
                            flexWrap: 'wrap',
                            gap: '0.75rem'
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

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                                {/* Inject Demo Data Button (Only for Demo School 6257) */}
                                {isDemoSchool && (
                                    <button
                                        onClick={handleInjectPerformanceDemoData}
                                        disabled={isInjectingDemo}
                                        title="Inject realistic demo data for all 4 performance tabs"
                                        style={{
                                            padding: '0.65rem 1.1rem',
                                            background: isInjectingDemo ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.22)',
                                            backdropFilter: 'blur(10px)',
                                            color: '#ffffff',
                                            border: '1.5px solid rgba(255, 255, 255, 0.4)',
                                            borderRadius: '12px',
                                            fontSize: '0.88rem',
                                            fontWeight: '700',
                                            cursor: isInjectingDemo ? 'not-allowed' : 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.45rem',
                                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
                                            transition: 'all 0.2s ease',
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isInjectingDemo) {
                                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.35)';
                                                e.currentTarget.style.transform = 'translateY(-1px)';
                                                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isInjectingDemo) {
                                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.22)';
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.12)';
                                            }
                                        }}
                                    >
                                        {isInjectingDemo ? (
                                            <>
                                                <Loader2 size={16} className="animate-spin" />
                                                <span>Injecting...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles size={16} color="#fde047" />
                                                <span>Inject Demo Data</span>
                                            </>
                                        )}
                                    </button>
                                )}

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

                    {/* Interactive Syllabus Viewer Widget (Windows 10 Clean Style) */}
                    <div className="card" style={{
                        background: '#ffffff',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        position: 'relative',
                        overflow: 'hidden',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.06), 0 2px 6px -1px rgba(0, 0, 0, 0.04)'
                    }}>
                        {/* Windows Accent Top Line */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '3px',
                            background: '#0078d4'
                        }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 2, flexWrap: 'wrap', gap: '2rem' }}>
                            <div style={{ flex: '1 1 400px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ 
                                            padding: '0.6rem', 
                                            background: '#eff6ff', 
                                            borderRadius: '8px', 
                                            color: '#0078d4', 
                                            border: '1px solid #dbeafe',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <BookOpen size={22} />
                                        </div>
                                        <div>
                                            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>Live Syllabus Viewer</h2>
                                            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '2px 0 0 0' }}>Select a class and subject to track real-time progress</p>
                                        </div>
                                    </div>

                                    {/* Demo Syllabus Inject Button (Only for Demo School 6257) */}
                                    {isDemoSchool && (
                                        <button
                                            onClick={handleInjectSyllabusDemoData}
                                            disabled={isInjectingSyllabus}
                                            title="Inject realistic demo syllabus for Class 1 to 5 for presentation"
                                            style={{
                                                padding: '0.55rem 0.95rem',
                                                background: isInjectingSyllabus ? '#f1f5f9' : '#eff6ff',
                                                color: '#1d4ed8',
                                                border: '1.5px solid #bfdbfe',
                                                borderRadius: '8px',
                                                fontSize: '0.82rem',
                                                fontWeight: '700',
                                                cursor: isInjectingSyllabus ? 'not-allowed' : 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.45rem',
                                                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                                                transition: 'all 0.2s ease',
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!isInjectingSyllabus) {
                                                    e.currentTarget.style.background = '#dbeafe';
                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!isInjectingSyllabus) {
                                                    e.currentTarget.style.background = '#eff6ff';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                }
                                            }}
                                        >
                                            {isInjectingSyllabus ? (
                                                <>
                                                    <Loader2 size={15} className="animate-spin" />
                                                    <span>Injecting...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles size={15} color="#2563eb" />
                                                    <span>Inject Demo Syllabus (Class 1-5)</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <select 
                                            value={syllabusWidgetClass} 
                                            onChange={(e) => {
                                                setSyllabusWidgetClass(e.target.value);
                                                setSyllabusWidgetSubject('');
                                            }}
                                            style={{ 
                                                width: '100%', 
                                                padding: '0.65rem 0.85rem', 
                                                borderRadius: '6px', 
                                                border: '1px solid #cbd5e1', 
                                                outline: 'none', 
                                                background: '#ffffff', 
                                                fontWeight: '600', 
                                                color: '#1e293b', 
                                                fontSize: '0.9rem',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                                            }}
                                        >
                                            <option value="" style={{ background: '#ffffff', color: '#64748b' }}>-- Select Class --</option>
                                            {displayClasses.map(c => (
                                                <option key={c.id} value={c.name} style={{ background: '#ffffff', color: '#1e293b' }}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <select 
                                            value={syllabusWidgetSubject} 
                                            onChange={(e) => setSyllabusWidgetSubject(e.target.value)}
                                            disabled={!syllabusWidgetClass}
                                            style={{ 
                                                width: '100%', 
                                                padding: '0.65rem 0.85rem', 
                                                borderRadius: '6px', 
                                                border: '1px solid #cbd5e1', 
                                                outline: 'none', 
                                                background: !syllabusWidgetClass ? '#f1f5f9' : '#ffffff', 
                                                fontWeight: '600', 
                                                color: !syllabusWidgetClass ? '#94a3b8' : '#1e293b', 
                                                fontSize: '0.9rem',
                                                cursor: !syllabusWidgetClass ? 'not-allowed' : 'pointer',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                                            }}
                                        >
                                            <option value="" style={{ background: '#ffffff', color: '#64748b' }}>-- Select Subject --</option>
                                            {syllabusWidgetClass && displaySubjects.map(s => (
                                                <option key={s} value={s} style={{ background: '#ffffff', color: '#1e293b' }}>{s}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {syllabusWidgetClass && syllabusWidgetSubject && (
                                    <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        {syllabusWidgetLoading ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#475569', fontSize: '0.9rem', padding: '0.5rem' }}>
                                                <div className="animate-spin"><CircleDashed size={18} color="#0078d4" /></div> Loading chapters...
                                            </div>
                                        ) : syllabusWidgetData.length === 0 ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '1rem' }}>
                                                <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>No chapters recorded for this subject yet.</p>
                                            </div>
                                        ) : (
                                            <div style={{ maxHeight: '220px', overflowY: 'auto', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }} className="custom-scrollbar">
                                                {syllabusWidgetData.map((chap, i) => {
                                                    const isUrdu = /[\u0600-\u06FF]/.test(chap.title || '');
                                                    return (
                                                        <div 
                                                            key={chap.id || i} 
                                                            style={{ 
                                                                display: 'flex', 
                                                                alignItems: 'center', 
                                                                gap: '0.75rem', 
                                                                padding: '0.75rem 1rem', 
                                                                background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
                                                                borderRadius: '10px',
                                                                color: '#ffffff',
                                                                boxShadow: '0 2px 6px rgba(30, 64, 175, 0.18)',
                                                                border: '1px solid #1d4ed8'
                                                            }}
                                                        >
                                                            <div style={{ 
                                                                width: '28px', height: '28px', borderRadius: '50%', 
                                                                background: '#ffffff', color: '#1e40af', 
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                                                fontWeight: '800', fontSize: '0.85rem', flexShrink: 0 
                                                            }}>
                                                                {i + 1}
                                                            </div>
                                                            <div style={{ flex: 1 }}>
                                                                <h4 
                                                                    style={{ 
                                                                        margin: 0, 
                                                                        fontSize: isUrdu ? '1.15rem' : '0.95rem', 
                                                                        color: '#ffffff', 
                                                                        fontWeight: '700',
                                                                        fontFamily: isUrdu ? "'Noto Nastaliq Urdu', 'Jameel Noori Nastaliq', 'Urdu Typesetting', Tahoma, serif" : 'inherit',
                                                                        lineHeight: isUrdu ? '2.0' : '1.4',
                                                                        textDecoration: chap.status === 'Completed' ? 'line-through' : 'none',
                                                                        textShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                                                    }}
                                                                >
                                                                    {chap.title}
                                                                </h4>
                                                                {chap.time && <span style={{ fontSize: '0.75rem', color: '#e0e7ff', fontWeight: '500' }}>Duration: {chap.time}</span>}
                                                                {chap.topics && chap.topics.length > 0 && (
                                                                    <div style={{ 
                                                                        marginTop: '0.35rem', padding: '0.3rem 0.55rem', 
                                                                        background: 'rgba(255, 255, 255, 0.15)', 
                                                                        borderRadius: '6px', fontSize: '0.75rem', 
                                                                        color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.25)',
                                                                        fontFamily: isUrdu ? "'Noto Nastaliq Urdu', Tahoma, serif" : 'inherit',
                                                                        lineHeight: isUrdu ? '1.8' : '1.3'
                                                                    }}>
                                                                        <strong>Topics:</strong> {chap.topics.join(', ')}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div style={{ 
                                                                fontSize: '0.7rem', 
                                                                fontWeight: '700', 
                                                                padding: '4px 10px', 
                                                                borderRadius: '20px', 
                                                                background: chap.status === 'Completed' ? 'rgba(34, 197, 94, 0.35)' : chap.status === 'In Progress' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255, 255, 255, 0.2)', 
                                                                color: '#ffffff',
                                                                border: '1px solid rgba(255, 255, 255, 0.4)',
                                                                letterSpacing: '0.02em',
                                                                flexShrink: 0
                                                            }}>
                                                                {chap.status || 'Pending'}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
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
                                    const radius = 58;
                                    const circumference = 2 * Math.PI * radius;
                                    const offset = circumference - (percentage / 100) * circumference;

                                    return (
                                        <div style={{ position: 'relative', width: '140px', height: '140px' }}>
                                            <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
                                                <circle cx="70" cy="70" r={radius} fill="transparent" stroke="#f1f5f9" strokeWidth="10" />
                                                <circle 
                                                    cx="70" cy="70" r={radius} 
                                                    fill="transparent" 
                                                    stroke={percentage === 100 ? '#10b981' : '#0078d4'} 
                                                    strokeWidth="10" 
                                                    strokeDasharray={circumference} 
                                                    strokeDashoffset={syllabusWidgetLoading || !syllabusWidgetClass || !syllabusWidgetSubject ? circumference : offset} 
                                                    strokeLinecap="round"
                                                    style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
                                                />
                                            </svg>
                                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                                <span style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a' }}>{syllabusWidgetLoading || !syllabusWidgetClass || !syllabusWidgetSubject ? '-' : percentage}%</span>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Completed</span>
                                            </div>
                                        </div>
                                    );
                                })()}
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', width: '100%' }}>
                                    <button 
                                        onClick={() => navigate('/teachers?tab=syllabus')}
                                        style={{ 
                                            flex: 1, 
                                            padding: '0.65rem 1rem', 
                                            background: '#0078d4', 
                                            border: '1px solid #0078d4', 
                                            color: '#ffffff', 
                                            borderRadius: '6px', 
                                            fontWeight: '600', 
                                            fontSize: '0.85rem', 
                                            cursor: 'pointer', 
                                            transition: 'all 0.2s ease', 
                                            boxShadow: '0 2px 4px rgba(0, 120, 212, 0.2)' 
                                        }}
                                        onMouseEnter={(e) => { 
                                            e.currentTarget.style.background = '#0067b8'; 
                                            e.currentTarget.style.borderColor = '#0067b8';
                                        }}
                                        onMouseLeave={(e) => { 
                                            e.currentTarget.style.background = '#0078d4'; 
                                            e.currentTarget.style.borderColor = '#0078d4';
                                        }}
                                    >
                                        Edit Syllabus
                                    </button>
                                </div>
                            </div>
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
                                        <MessagesSquare size={18} />
                                        <span>Chat</span>

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
                                    <div key={i} className="flex-between" style={{ padding: '0.85rem 1rem', borderRadius: '12px', transition: 'background 0.2s ease', borderBottom: '1px solid rgba(241, 245, 249, 0.6)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                                            <div style={{ position: 'relative' }}>
                                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <User size={20} color="#64748b" />
                                                </div>
                                                <div style={{
                                                    position: 'absolute', bottom: '-2px', right: '-2px',
                                                    width: '12px', height: '12px', borderRadius: '50%', border: '2px solid white',
                                                    background: teacher.status === 'on' ? '#10b981' : '#ef4444'
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
                                                        fontWeight: '700',
                                                        fontSize: '0.9rem',
                                                        color: '#1e293b',
                                                        cursor: 'pointer',
                                                        margin: 0,
                                                        transition: 'color 0.2s ease'
                                                    }}
                                                    onMouseEnter={(e) => { e.currentTarget.style.color = '#4f46e5'; }}
                                                    onMouseLeave={(e) => { e.currentTarget.style.color = '#1e293b'; }}
                                                >
                                                    {teacher.name}
                                                </p>
                                                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '2px 0 0 0' }}>{teacher.class || 'No Class'}</p>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                            {/* Present / Absent Badge (Stacked on Top) */}
                                            <span style={{
                                                fontSize: '0.65rem',
                                                padding: '2px 8px',
                                                borderRadius: '6px',
                                                background: teacher.isPresent ? '#3b82f6' : '#ef4444',
                                                color: '#ffffff',
                                                fontWeight: '700',
                                                letterSpacing: '0.3px',
                                                display: 'inline-block'
                                            }}>
                                                {teacher.isPresent ? 'Present' : 'Absent'}
                                            </span>

                                            {/* On / Off Class Status (Stacked on Bottom) */}
                                            <span style={{
                                                fontSize: '0.68rem',
                                                color: teacher.status === 'on' ? '#10b981' : '#ef4444',
                                                fontWeight: '600',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}>
                                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: teacher.status === 'on' ? '#10b981' : '#ef4444' }} />
                                                {teacher.status === 'on' ? 'On Class' : 'Off Class'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Quick Notes */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>



                            {/* Teacher Performance Ranking Card (4-Pillar Weighted Model) */}
                            <div className="card" style={{
                                position: 'relative',
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '16px',
                                padding: '1.25rem 1.5rem',
                                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '8px',
                                            background: '#fef3c7',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            border: '1px solid #fde68a'
                                        }}>
                                            <Trophy size={16} color="#d97706" />
                                        </div>
                                        <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                                            Teacher Performance Ranking
                                        </h3>
                                        <span style={{ fontSize: '0.72rem', color: '#64748b', background: '#f8fafc', padding: '3px 8px', borderRadius: '6px', fontWeight: '600', border: '1px solid #e2e8f0' }}>
                                            {rankingCycle || 'Monthly Cycle (30 Days)'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                        {lastRankingSync && (
                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '500' }}>
                                                Synced: {lastRankingSync}
                                            </span>
                                        )}
                                        <button
                                            onClick={handleSyncTeacherRankings}
                                            disabled={isSyncingRankings}
                                            title="Recalculate & Sync Teacher Rankings"
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                fontSize: '0.75rem',
                                                color: '#334155',
                                                background: '#ffffff',
                                                border: '1px solid #e2e8f0',
                                                padding: '0.35rem 0.75rem',
                                                borderRadius: '8px',
                                                fontWeight: '600',
                                                cursor: isSyncingRankings ? 'not-allowed' : 'pointer',
                                                transition: 'all 0.2s ease',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!isSyncingRankings) e.currentTarget.style.background = '#f8fafc';
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!isSyncingRankings) e.currentTarget.style.background = '#ffffff';
                                            }}
                                        >
                                            <RefreshCw size={12} style={{ animation: isSyncingRankings ? 'spin 1s linear infinite' : 'none' }} />
                                            {isSyncingRankings ? 'Syncing...' : 'Sync Now'}
                                        </button>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {effectiveRankings.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b' }}>
                                            <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600' }}>No teacher records found.</p>
                                        </div>
                                    ) : (
                                        effectiveRankings
                                            .slice(rankingPage * 5, (rankingPage + 1) * 5)
                                        .map((teacher, index) => {
                                            const actualRank = (rankingPage * 5) + index + 1;
                                            const isRank1 = actualRank === 1;
                                            const isRank2 = actualRank === 2;
                                            const isRank3 = actualRank === 3;
                                            const b = teacher.breakdown || {};

                                            const acadVal = b.academicScore ?? 80;
                                            const syllVal = b.syllabusScore ?? 75;
                                            const attVal = b.attendanceScore ?? 90;
                                            const hwVal = b.homeworkScore ?? 0;
                                            const hwTasks = b.homeworkCount ?? 0;
                                            const attInfo = b.attendanceInfo || {};
                                            const presentDays = attInfo.presentDays !== undefined ? attInfo.presentDays : (teacher.isPresent ? 22 : 20);
                                            const absentDays = attInfo.absentDays !== undefined ? attInfo.absentDays : (teacher.isPresent ? 2 : 4);
                                            const totalDays = attInfo.totalWorkingDays || (presentDays + absentDays);

                                            // Visual weighted segments for composite bar (adds up to 100%)
                                            // Dynamic Color Scale for Standard Tracks (0-30% Red, 31-59% Orange, 60-100% Green)
                                            const getScoreColorConfig = (score) => {
                                                if (score <= 30) return { bar: '#ef4444', track: '#fee2e2', text: '#dc2626' };
                                                if (score <= 59) return { bar: '#f59e0b', track: '#fef3c7', text: '#d97706' };
                                                return { bar: '#10b981', track: '#dcfce7', text: '#059669' };
                                            };

                                            // School Standard Strict Attendance (>=80% Green, 65-79% Orange, <65% Red)
                                            const getAttendanceColorConfig = (score, absCount) => {
                                                let bar = '#10b981';
                                                let track = '#dcfce7';
                                                if (score < 65) {
                                                    bar = '#ef4444';
                                                    track = '#fee2e2';
                                                } else if (score < 80) {
                                                    bar = '#f59e0b';
                                                    track = '#fef3c7';
                                                }
                                                const absentColor = absCount === 0 ? '#10b981' : (absCount <= 2 ? '#f59e0b' : '#ef4444');
                                                return { bar, track, absentColor };
                                            };

                                            const overallColors = getScoreColorConfig(teacher.performanceScore);
                                            const acadColors = getScoreColorConfig(acadVal);
                                            const syllColors = getScoreColorConfig(syllVal);
                                            const hwColors = getScoreColorConfig(hwVal);
                                            const attColors = getAttendanceColorConfig(attVal, absentDays);

                                            return (
                                                <div
                                                    key={teacher.id || index}
                                                    onClick={() => navigate('/teachers', { state: { selectedTeacherId: teacher.id || teacher.teacherId } })}
                                                    style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '0.85rem',
                                                        padding: '1rem 1.15rem',
                                                        borderRadius: '12px',
                                                        background: '#ffffff',
                                                        border: isRank1 ? '1.5px solid #fcd34d' : '1px solid #e2e8f0',
                                                        boxShadow: isRank1 
                                                            ? '0 3px 10px rgba(245, 158, 11, 0.08)' 
                                                            : '0 1px 3px rgba(0, 0, 0, 0.02)',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s ease',
                                                        position: 'relative'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.06)';
                                                        e.currentTarget.style.borderColor = isRank1 ? '#f59e0b' : '#cbd5e1';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(0)';
                                                        e.currentTarget.style.boxShadow = isRank1 
                                                            ? '0 3px 10px rgba(245, 158, 11, 0.08)' 
                                                            : '0 1px 3px rgba(0, 0, 0, 0.02)';
                                                        e.currentTarget.style.borderColor = isRank1 ? '#fcd34d' : '#e2e8f0';
                                                    }}
                                                >
                                                    {/* Top Row: Simple Rank Badge, Avatar, Name & Overall Score */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            {/* Simple Modern Rank Badge */}
                                                            <div style={{
                                                                minWidth: '42px',
                                                                height: '28px',
                                                                padding: '0 8px',
                                                                borderRadius: '8px',
                                                                background: isRank1 
                                                                    ? '#fef3c7' 
                                                                    : isRank2 
                                                                    ? '#f1f5f9' 
                                                                    : isRank3 
                                                                    ? '#ffedd5' 
                                                                    : '#f8fafc',
                                                                color: isRank1 
                                                                    ? '#b45309' 
                                                                    : isRank2 
                                                                    ? '#334155' 
                                                                    : isRank3 
                                                                    ? '#9a3412' 
                                                                    : '#64748b',
                                                                border: isRank1 
                                                                    ? '1px solid #fde68a' 
                                                                    : isRank2 
                                                                    ? '1px solid #e2e8f0' 
                                                                    : isRank3 
                                                                    ? '1px solid #fed7aa' 
                                                                    : '1px solid #f1f5f9',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                gap: '4px',
                                                                fontSize: '0.8rem',
                                                                fontWeight: '800',
                                                                flexShrink: 0
                                                            }}>
                                                                {isRank1 && <Trophy size={13} color="#d97706" />}
                                                                {isRank2 && <Medal size={13} color="#64748b" />}
                                                                {isRank3 && <Medal size={13} color="#ea580c" />}
                                                                #{actualRank}
                                                            </div>

                                                            {/* Teacher Avatar Initials */}
                                                            <div style={{
                                                                width: '36px',
                                                                height: '36px',
                                                                borderRadius: '50%',
                                                                background: '#f8fafc',
                                                                border: '1.5px solid #e2e8f0',
                                                                color: '#334155',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontWeight: '700',
                                                                fontSize: '0.82rem',
                                                                flexShrink: 0
                                                            }}>
                                                                {getTeacherInitials(teacher.name)}
                                                            </div>

                                                            {/* Teacher Name & Class/Tier */}
                                                            <div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                                    <span style={{ fontWeight: '700', fontSize: '0.95rem', color: '#0f172a' }}>
                                                                        {teacher.name}
                                                                    </span>
                                                                    <span style={{
                                                                        fontSize: '0.68rem',
                                                                        padding: '2px 7px',
                                                                        borderRadius: '5px',
                                                                        fontWeight: '600',
                                                                        background: teacher.performanceScore >= 85 ? '#eff6ff' : (teacher.performanceScore >= 75 ? '#f0fdf4' : '#f8fafc'),
                                                                        color: teacher.performanceScore >= 85 ? '#1d4ed8' : (teacher.performanceScore >= 75 ? '#15803d' : '#475569'),
                                                                        border: teacher.performanceScore >= 85 ? '1px solid #dbeafe' : (teacher.performanceScore >= 75 ? '1px solid #bbf7d0' : '1px solid #e2e8f0'),
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center'
                                                                    }}>
                                                                        {teacher.tier || 'Developing'}
                                                                    </span>
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '2px' }}>
                                                                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>
                                                                        {teacher.class || 'All Classes'}
                                                                    </span>
                                                                    <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#cbd5e1' }} />
                                                                    <span style={{
                                                                        fontSize: '0.7rem',
                                                                        fontWeight: '600',
                                                                        color: teacher.isPresent ? '#10b981' : '#94a3b8'
                                                                    }}>
                                                                        {teacher.isPresent ? '● Present Today' : '○ Absent Today'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Overall Score Dial */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                                            <div style={{ textAlign: 'right' }}>
                                                                <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                                                    Overall Score
                                                                </div>
                                                                <div style={{
                                                                    fontSize: '1.4rem',
                                                                    fontWeight: '800',
                                                                    color: overallColors.text,
                                                                    lineHeight: 1.1
                                                                }}>
                                                                    {teacher.performanceScore}%
                                                                </div>
                                                            </div>
                                                            <ChevronRight size={16} color="#94a3b8" />
                                                        </div>
                                                    </div>

                                                    {/* Single Solid Dynamic Overall Score Progress Bar */}
                                                    <div style={{ width: '100%' }}>
                                                        <div style={{
                                                            width: '100%',
                                                            height: '6px',
                                                            background: overallColors.track,
                                                            borderRadius: '999px',
                                                            overflow: 'hidden'
                                                        }}>
                                                            <div
                                                                title={`Overall Score: ${teacher.performanceScore}%`}
                                                                style={{
                                                                    width: `${teacher.performanceScore}%`,
                                                                    height: '100%',
                                                                    background: overallColors.bar,
                                                                    borderRadius: '999px',
                                                                    transition: 'width 0.6s ease'
                                                                }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* 4 Dedicated Score Lines (Tracks) Grid - 100% Performance Metric Display */}
                                                    <div 
                                                        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.42fr_1.08fr]"
                                                        style={{
                                                            gap: '0.65rem',
                                                            padding: '0.75rem 0.85rem',
                                                            background: '#f8fafc',
                                                            borderRadius: '10px',
                                                            border: '1px solid #f1f5f9'
                                                        }} 
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {/* Track 1: Academics (35%) */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', minHeight: '18px', whiteSpace: 'nowrap' }}>
                                                                <span style={{ fontWeight: '600', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                                    <GraduationCap size={13} color="#2563eb" /> Academics
                                                                </span>
                                                                <span style={{ fontWeight: '700', color: acadColors.text, flexShrink: 0 }}>
                                                                    {acadVal}% <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: '500' }}>/ 100%</span>
                                                                </span>
                                                            </div>
                                                            <div style={{ width: '100%', height: '5px', background: acadColors.track, borderRadius: '999px', overflow: 'hidden' }}>
                                                                <div style={{ width: `${acadVal}%`, height: '100%', background: acadColors.bar, borderRadius: '999px', transition: 'width 0.6s ease' }} />
                                                            </div>
                                                        </div>

                                                        {/* Track 2: Syllabus (30%) */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', minHeight: '18px', whiteSpace: 'nowrap' }}>
                                                                <span style={{ fontWeight: '600', color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                                    <BookOpen size={13} color="#7c3aed" /> Syllabus
                                                                </span>
                                                                <span style={{ fontWeight: '700', color: syllColors.text, flexShrink: 0 }}>
                                                                    {syllVal}% <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: '500' }}>/ 100%</span>
                                                                </span>
                                                            </div>
                                                            <div style={{ width: '100%', height: '5px', background: syllColors.track, borderRadius: '999px', overflow: 'hidden' }}>
                                                                <div style={{ width: `${syllVal}%`, height: '100%', background: syllColors.bar, borderRadius: '999px', transition: 'width 0.6s ease' }} />
                                                            </div>
                                                        </div>

                                                        {/* Track 3: Attendance (25%) */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', minHeight: '18px', whiteSpace: 'nowrap' }}>
                                                                <span style={{ fontWeight: '600', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                                    <Clock size={13} color="#0284c7" /> Attendance
                                                                </span>
                                                                <span style={{ fontWeight: '700', color: '#1e293b', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                                                                    <span style={{ color: '#0284c7' }}>{presentDays} Present</span>
                                                                    <span style={{ color: '#94a3b8', margin: '0 3px' }}>•</span>
                                                                    <span style={{ color: attColors.absentColor }}>{absentDays} Absent</span>
                                                                    <span 
                                                                        title="School working days (excluding Sundays)"
                                                                        style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: '500', marginLeft: '4px', cursor: 'help', whiteSpace: 'nowrap' }}
                                                                    >
                                                                        ({totalDays}&nbsp;working&nbsp;days)
                                                                    </span>
                                                                </span>
                                                            </div>
                                                            <div style={{ width: '100%', height: '5px', background: attColors.track, borderRadius: '999px', overflow: 'hidden' }}>
                                                                <div style={{ width: `${attVal}%`, height: '100%', background: attColors.bar, borderRadius: '999px', transition: 'width 0.6s ease' }} />
                                                            </div>
                                                        </div>

                                                        {/* Track 4: Homework (10%) */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', minHeight: '18px', whiteSpace: 'nowrap' }}>
                                                                <span style={{ fontWeight: '600', color: '#047857', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                                    <ClipboardList size={13} color="#059669" /> Homework
                                                                </span>
                                                                <span style={{ fontWeight: '700', color: hwColors.text, flexShrink: 0 }}>
                                                                    {hwVal}% <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: '500' }}>/ 100%</span>
                                                                    <span style={{ fontSize: '0.62rem', fontWeight: '500', color: '#64748b', marginLeft: '3px', whiteSpace: 'nowrap' }}>
                                                                        ({hwTasks} tasks)
                                                                    </span>
                                                                </span>
                                                            </div>
                                                            <div style={{ width: '100%', height: '5px', background: hwColors.track, borderRadius: '999px', overflow: 'hidden' }}>
                                                                <div style={{
                                                                    width: `${hwVal}%`,
                                                                    height: '100%',
                                                                    background: hwColors.bar,
                                                                    borderRadius: '999px',
                                                                    transition: 'width 0.6s ease'
                                                                }} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                {/* Pagination Controls */}
                                {effectiveRankings.length > 5 && (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
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
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>
                                            Page {rankingPage + 1} of {Math.ceil(effectiveRankings.length / 5)}
                                        </span>
                                        <button
                                            onClick={() => setRankingPage(rankingPage + 1)}
                                            disabled={(rankingPage + 1) * 5 >= effectiveRankings.length}
                                            style={{
                                                border: 'none', background: 'transparent', cursor: (rankingPage + 1) * 5 >= effectiveRankings.length ? 'default' : 'pointer',
                                                color: (rankingPage + 1) * 5 >= effectiveRankings.length ? '#cbd5e1' : '#64748b', fontSize: '0.85rem', fontWeight: '600',
                                                display: 'flex', alignItems: 'center', gap: '0.25rem'
                                            }}
                                        >
                                            Next <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>


                </div>
            </div>
                </div>

                {/* SLIDE 2: FINANCE & FEE COLLECTIONS HUB (Guarded by Permissions) */}
                {canAccessFinances && (
                    <div style={{ width: '50%', flexShrink: 0, boxSizing: 'border-box', minWidth: 0 }}>
                        {hasOpenedFinance && (
                            <div>
                                {/* Slide 2 Header Area */}
                                <div className="flex-between" style={{ marginBottom: '2.5rem' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{
                                                width: '38px',
                                                height: '38px',
                                                borderRadius: '10px',
                                                background: '#ecfdf5',
                                                border: '1px solid #a7f3d0',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#059669'
                                            }}>
                                                <Wallet size={20} />
                                            </div>
                                            <div>
                                                <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: 0, lineHeight: 1.2 }}>
                                                    Finance & Accounts Hub
                                                </h1>
                                                <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
                                                    Direct synchronized access from Fee Collections module.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
                                        {/* Synced Status Badge */}
                                        <div className="card" style={{
                                            padding: '0.5rem 0.95rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            background: '#ecfdf5',
                                            borderColor: '#a7f3d0',
                                            color: '#059669'
                                        }}>
                                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981' }} />
                                            <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>
                                                Collections Synced
                                            </span>
                                        </div>

                                        {/* Back to School Overview Button (Positioned at exact top-right spot) */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setDashboardView('overview');
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                            }}
                                            className="card"
                                            style={{
                                                padding: '0.5rem 0.95rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                background: '#ecfdf5',
                                                borderColor: '#a7f3d0',
                                                color: '#059669',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease',
                                                userSelect: 'none'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = '#d1fae5';
                                                e.currentTarget.style.borderColor = '#6ee7b7';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = '#ecfdf5';
                                                e.currentTarget.style.borderColor = '#a7f3d0';
                                            }}
                                            title="Back to School Academic Overview"
                                        >
                                            <ChevronLeft size={16} color="#059669" />
                                            <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>
                                                School Overview
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                {/* Direct Modular Finances Component */}
                                <FinancesDashboard
                                    schoolId={schoolId}
                                    currentAction="view"
                                    schoolInfo={{}}
                                    classes={fetchedClasses}
                                />
                            </div>
                        )}
                    </div>
                )}
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
