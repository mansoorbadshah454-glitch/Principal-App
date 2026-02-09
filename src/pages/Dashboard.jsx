import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Users, UserCheck, CreditCard, PieChart as PieIcon,
    Send, Activity, Award, User, Clock, ChevronRight, X, ChevronDown, GraduationCap
} from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import {
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
    CartesianGrid, Tooltip, BarChart, Bar, Cell, LineChart, Line, RadialBarChart, RadialBar, Legend
} from 'recharts';

const Dashboard = () => {
    const navigate = useNavigate();

    // 1. Shared Data State
    const [schoolId, setSchoolId] = useState(null);
    const [fetchedClasses, setFetchedClasses] = useState([]);
    const [messages, setMessages] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [collectionStats, setCollectionStats] = useState({ paid: 0, unpaid: 0, total: 0 });
    const [statsLoaded, setStatsLoaded] = useState(false);

    // 2. UI State
    const [selectedTeacher, setSelectedTeacher] = useState(null);
    const [messageText, setMessageText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isBroadcast, setIsBroadcast] = useState(false);
    const [performanceTab, setPerformanceTab] = useState('subjects');
    const [selectedClass, setSelectedClass] = useState('all');
    const [showClassDropdown, setShowClassDropdown] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState('February');
    const [showMonthDropdown, setShowMonthDropdown] = useState(false);
    const [rankingPage, setRankingPage] = useState(0);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good Morning";
        if (hour < 17) return "Good Afternoon";
        return "Good Evening";
    };

    // 3. Resolve School ID First
    React.useEffect(() => {
        const manualSession = localStorage.getItem('manual_session');
        if (manualSession) {
            try {
                const sessionData = JSON.parse(manualSession);
                if (sessionData.schoolId) {
                    setSchoolId(sessionData.schoolId);
                }
            } catch (e) {
                console.error("[Dashboard] Error parsing session:", e);
                setStatsLoaded(true);
            }
        } else {
            console.warn("[Dashboard] No manual_session found");
            setStatsLoaded(true);
        }
    }, []);


    React.useEffect(() => {
        if (!schoolId) return;

        const q = query(
            collection(db, `schools/${schoolId}/messages`),
            where("to", "==", "principal"),
            orderBy("timestamp", "desc")
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = [];
            snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
            setMessages(list);
        });
        return () => unsubscribe();
    }, [schoolId]);

    // Mock Data for Charts


    const presentCount = collectionStats.total > 0 ? Math.round(collectionStats.total * 0.94) : 0;
    const absentCount = collectionStats.total > 0 ? collectionStats.total - presentCount : 0;

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
            value: statsLoaded ? presentCount.toLocaleString() : '...',
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


    React.useEffect(() => {
        if (!schoolId) return;
        const q = query(collection(db, `schools/${schoolId}/teachers`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => {
                const data = doc.data();
                const seed = doc.id.charCodeAt(0) + (data.name?.length || 0);
                return {
                    id: doc.id,
                    name: data.name,
                    class: Array.isArray(data.assignedClasses) && data.assignedClasses.length > 0
                        ? data.assignedClasses[0]
                        : (data.assignedClasses || 'Unassigned'),
                    status: seed % 2 === 0 ? 'on' : 'off',
                    score: 75 + (seed % 20)
                };
            });
            setTeachers(list);
        });
        return () => unsubscribe();
    }, [schoolId]);



    React.useEffect(() => {
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

    useEffect(() => {
        if (!schoolId || fetchedClasses.length === 0) return;

        console.log("[Dashboard] Starting Student Listeners for", fetchedClasses.length, "classes");

        const unsubscribers = [];
        const classStatsMap = new Map();

        const updateAggregates = () => {
            let totalPaid = 0;
            let totalUnpaid = 0;
            let totalStudents = 0;

            classStatsMap.forEach((stats, cid) => {
                totalPaid += stats.paid;
                totalUnpaid += stats.unpaid;
                totalStudents += stats.total;
            });

            console.log(`[Dashboard] Aggregated Totals - Paid: ${totalPaid}, Unpaid: ${totalUnpaid}, Total: ${totalStudents}`);
            setCollectionStats({ paid: totalPaid, unpaid: totalUnpaid, total: totalStudents });
            setStatsLoaded(true);
        };

        fetchedClasses.forEach(cls => {
            const qStudents = query(collection(db, `schools/${schoolId}/classes/${cls.id}/students`));
            const unsubStudents = onSnapshot(qStudents, (snap) => {
                let cPaid = 0;
                let cUnpaid = 0;

                snap.docs.forEach(doc => {
                    const status = doc.data().monthlyFeeStatus || 'unpaid';
                    if (status === 'paid') cPaid++;
                    else cUnpaid++;
                });

                console.log(`[Dashboard] Class ${cls.name} Update - Paid: ${cPaid}, Unpaid: ${cUnpaid}`);
                classStatsMap.set(cls.id, { paid: cPaid, unpaid: cUnpaid, total: snap.size });
                updateAggregates();
            });
            unsubscribers.push(unsubStudents);
        });

        return () => {
            console.log("[Dashboard] Cleaning up student listeners");
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

    const generateClassData = (clsName) => {
        let subjectsToShow = [];

        if (clsName === 'all') {
            subjectsToShow = allPotentialSubjects;
        } else {
            const foundClass = fetchedClasses.find(c => c.name === clsName);
            subjectsToShow = foundClass?.subjects || ['English', 'Urdu', 'Mathematics', 'Science'];
        }

        const seed = clsName === 'all' ? 999 : (clsName.charCodeAt(clsName.length - 1) * 7);

        return subjectsToShow.map((subject, index) => {
            // Consistent random logic
            const basevariance = clsName === 'all' ? 0 : ((index % 3 === 0) ? 5 : -3);
            const randomFactor = (seed * (index + 1) % 20);
            const baseScore = 75 + randomFactor + basevariance;
            const score = Math.min(100, Math.max(60, baseScore));

            return {
                name: subject,
                score: score,
                fill: `hsl(${220 + (index * 30) % 360}, 80%, 65%)`,
                completion: Math.min(100, score + (index % 2 === 0 ? 3 : -2))
            };
        });
    };

    const currentData = React.useMemo(() => generateClassData(selectedClass), [selectedClass, fetchedClasses]);

    // Derived data for charts
    const subjectsData = currentData.map(d => ({ name: d.name, score: d.score, fill: d.fill }));
    const homeworkData = currentData.map(d => ({ name: d.name, completion: d.completion }));

    const attendanceData = [
        { name: 'Week 1', percentage: selectedClass === 'all' ? 96 : 94 + (selectedClass?.length || 0 % 4) },
        { name: 'Week 2', percentage: selectedClass === 'all' ? 94 : 92 + (selectedClass?.length || 0 % 5) },
        { name: 'Week 3', percentage: selectedClass === 'all' ? 98 : 95 + (selectedClass?.length || 0 % 3) },
        { name: 'Week 4', percentage: selectedClass === 'all' ? 92 : 88 + (selectedClass?.length || 0 % 6) },
        { name: 'Week 5', percentage: selectedClass === 'all' ? 95 : 91 + (selectedClass?.length || 0 % 2) },
        { name: 'Week 6', percentage: selectedClass === 'all' ? 97 : 96 },
    ];



    const monthsList = [
        'This Year', 'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const availableClasses = ['All School', ...fetchedClasses.map(c => c.name)];

    const handleSendBroadcast = () => {
        setIsBroadcast(true);
        setSelectedTeacher({ name: 'All Teachers', class: 'Broadcast Message' });
    };

    const handleSendMessage = async () => {
        if (!messageText.trim() || !selectedTeacher) return;

        setIsSending(true);
        try {
            const session = localStorage.getItem('manual_session');
            if (session) {
                const { schoolId } = JSON.parse(session);

                if (isBroadcast) {
                    // Send to all teachers
                    const promises = teachers.map(teacher =>
                        addDoc(collection(db, `schools/${schoolId}/messages`), {
                            to: teacher.name,
                            from: 'principal',
                            fromName: 'Principal',
                            text: messageText,
                            timestamp: serverTimestamp(),
                            read: false
                        })
                    );
                    await Promise.all(promises);
                } else {
                    // Send to single teacher
                    await addDoc(collection(db, `schools/${schoolId}/messages`), {
                        to: selectedTeacher.name,
                        from: 'principal',
                        fromName: 'Principal',
                        text: messageText,
                        timestamp: serverTimestamp(),
                        read: false
                    });
                }

                setMessageText('');
                setSelectedTeacher(null);
                setIsBroadcast(false);
            }
        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="animate-fade-in-up">
            {/* Header Area */}
            <div className="flex-between" style={{ marginBottom: '2.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>{getGreeting()}, Principal</h1>
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

                            {/* Month Selector Button */}
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setShowMonthDropdown(!showMonthDropdown)}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: 'white',
                                        color: '#8b5cf6',
                                        border: 'none',
                                        borderRadius: '10px',
                                        fontSize: '0.9rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                                        transition: 'var(--transition)'
                                    }}
                                >
                                    {selectedMonth}
                                    <ChevronDown size={16} />
                                </button>

                                {showMonthDropdown && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 'calc(100% + 0.5rem)',
                                        left: 0,
                                        background: 'white',
                                        borderRadius: '12px',
                                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
                                        minWidth: '150px',
                                        maxHeight: '250px',
                                        overflowY: 'auto',
                                        zIndex: 1000,
                                        animation: 'slideDown 0.2s ease-out'
                                    }} className="custom-scrollbar">
                                        {monthsList.map((month, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => {
                                                    setSelectedMonth(month);
                                                    setShowMonthDropdown(false);
                                                }}
                                                style={{
                                                    padding: '0.6rem 1rem',
                                                    cursor: 'pointer',
                                                    fontSize: '0.85rem',
                                                    transition: 'var(--transition)',
                                                    borderBottom: idx < monthsList.length - 1 ? '1px solid #f1f5f9' : 'none',
                                                    background: selectedMonth === month ? '#f8fafc' : 'transparent',
                                                    color: selectedMonth === month ? '#8b5cf6' : 'var(--text-main)',
                                                    fontWeight: selectedMonth === month ? '600' : '400'
                                                }}
                                                onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                                                onMouseLeave={(e) => {
                                                    if (selectedMonth !== month) {
                                                        e.target.style.background = 'transparent';
                                                    }
                                                }}
                                            >
                                                {month}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
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

                            {/* Attendance Chart - Area Chart */}
                            {performanceTab === 'attendance' && (
                                <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
                                    <h3 style={{
                                        fontSize: '1rem',
                                        fontWeight: '700',
                                        marginBottom: '0.75rem',
                                        color: 'var(--text-main)'
                                    }}>
                                        Weekly Attendance Percentage
                                    </h3>
                                    <ResponsiveContainer width="100%" height={180}>
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
                                                domain={[85, 100]}
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
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </div>


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
                            <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(241, 245, 249, 0.6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 2 }}>
                                <h3 style={{ fontSize: '1.125rem' }}>Teachers Live</h3>
                                <button
                                    onClick={handleSendBroadcast}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: 'var(--primary)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontSize: '0.85rem',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        transition: 'var(--transition)',
                                        boxShadow: '0 2px 8px rgba(79, 70, 229, 0.2)'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.background = '#4338ca';
                                        e.target.style.transform = 'translateY(-1px)';
                                        e.target.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.3)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.background = 'var(--primary)';
                                        e.target.style.transform = 'translateY(0)';
                                        e.target.style.boxShadow = '0 2px 8px rgba(79, 70, 229, 0.2)';
                                    }}
                                >
                                    <Send size={16} />
                                    Send Note to All
                                </button>
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
                                                    onClick={() => setSelectedTeacher(teacher)}
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
                                                </p>
                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{teacher.class}</p>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <p style={{ fontSize: '0.7rem', color: teacher.status === 'on' ? 'var(--success)' : 'var(--danger)', fontWeight: '600' }}>
                                                {teacher.status === 'on' ? 'Duty On' : 'Duty Off'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Quick Notes */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                            {/* Messages from Teachers */}
                            <div className="card">
                                <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>Teacher Feedback</h3>
                                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {messages.length === 0 ? (
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No messages yet.</p>
                                    ) : messages.map(msg => (
                                        <div key={msg.id} style={{ padding: '0.75rem', borderRadius: '10px', background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                                            <p style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--primary)', marginBottom: '0.25rem' }}>{msg.fromName}</p>
                                            <p style={{ fontSize: '0.8rem', color: '#1e293b' }}>{msg.text}</p>
                                            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                                                {msg.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

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
                        background: 'rgba(0, 0, 0, 0.5)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        animation: 'fadeIn 0.2s ease-out'
                    }}
                    onClick={() => setSelectedTeacher(null)}
                >
                    <div
                        style={{
                            background: 'rgba(255, 255, 255, 0.95)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            borderRadius: '24px',
                            padding: '2rem',
                            width: '90%',
                            maxWidth: '500px',
                            boxShadow: '0 20px 60px rgba(79, 70, 229, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.8), inset 0 1px 0 rgba(255, 255, 255, 1)',
                            border: '1px solid rgba(255, 255, 255, 0.8)',
                            position: 'relative',
                            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
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
                            onClick={() => setSelectedTeacher(null)}
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
