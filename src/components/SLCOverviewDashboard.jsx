import React, { useState, useEffect, useMemo } from 'react';
import {
    TrendingUp, TrendingDown, Users, UserPlus, LogOut, Archive, Award,
    AlertCircle, Sparkles, CheckCircle2, ChevronRight, ChevronDown, Calendar, Layers,
    Filter, ArrowUpRight, ArrowDownRight, BarChart3, PieChart, ShieldCheck,
    Folder, BookOpen, Clock, Printer, RefreshCw, AlertTriangle, Database, X
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis,
    CartesianGrid, Tooltip, Legend, Cell
} from 'recharts';
import { db } from '../firebase';
import { collection, query, getDocs } from 'firebase/firestore';
import { getDocsFast } from '../utils/cacheUtils';

export default function SLCOverviewDashboard({
    schoolId,
    slcHistory = [],
    classes = [],
    onNavigateToCupboard,
    onNavigateToStudio,
    demoMode = false
}) {
    // Current reference year
    const currentYear = useMemo(() => new Date().getFullYear(), []);
    const [selectedYearFilter, setSelectedYearFilter] = useState(currentYear); // number or 'all'
    const [isDemoActive, setIsDemoActive] = useState(demoMode);
    const [students, setStudents] = useState([]);
    const [loadingAdmissions, setLoadingAdmissions] = useState(false);

    // 1. Fetch Students/Admissions for Growth Comparison (Cached offline-first)
    useEffect(() => {
        let isMounted = true;

        const fetchAdmissionsData = async () => {
            if (!schoolId) {
                // If demo mode or no session, provide mock admissions matching demo SLCs
                if (isMounted) {
                    setStudents(generateDemoAdmissions(currentYear));
                }
                return;
            }

            setLoadingAdmissions(true);

            // Check local cache for fast 0ms load
            try {
                const cachedRaw = localStorage.getItem(`slc_overview_admissions_cache_${schoolId}`);
                if (cachedRaw) {
                    const cached = JSON.parse(cachedRaw);
                    if (Array.isArray(cached) && cached.length > 0 && isMounted) {
                        setStudents(cached);
                        setLoadingAdmissions(false);
                    }
                }
            } catch (e) {}

            try {
                // A. Try master students collection
                const studentsRef = collection(db, `schools/${schoolId}/students`);
                const snap = await getDocsFast(studentsRef);
                let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

                // B. Fallback: Aggregate class subcollections if master collection is empty
                if (list.length === 0 && classes.length > 0) {
                    const classPromises = classes.map(async (cls) => {
                        try {
                            const subQ = collection(db, `schools/${schoolId}/classes/${cls.id}/students`);
                            const subSnap = await getDocsFast(subQ);
                            return subSnap.docs.map(sd => ({
                                id: sd.id,
                                classId: cls.id,
                                className: cls.name,
                                ...sd.data()
                            }));
                        } catch {
                            return [];
                        }
                    });
                    const nested = await Promise.all(classPromises);
                    list = nested.flat();
                }

                if (isMounted) {
                    // If DB has no active students, provide realistic base for showcase
                    if (list.length === 0 && demoMode) {
                        list = generateDemoAdmissions(currentYear);
                    }
                    setStudents(list);
                    try {
                        localStorage.setItem(`slc_overview_admissions_cache_${schoolId}`, JSON.stringify(list));
                    } catch (e) {}
                }
            } catch (err) {
                console.warn("[SLCOverviewDashboard] Failed to fetch admissions:", err);
            } finally {
                if (isMounted) setLoadingAdmissions(false);
            }
        };

        fetchAdmissionsData();

        return () => {
            isMounted = false;
        };
    }, [schoolId, classes, currentYear, demoMode]);

    // Helper: Parse Admission Year safely
    const getAdmissionYear = (stu) => {
        if (stu.admissionDate) {
            const yr = parseInt(String(stu.admissionDate).split('-')[0]);
            if (!isNaN(yr) && yr > 1950 && yr < 2100) return yr;
        }
        if (stu.createdAt) {
            if (typeof stu.createdAt.toDate === 'function') {
                return stu.createdAt.toDate().getFullYear();
            }
            if (stu.createdAt.seconds) {
                return new Date(stu.createdAt.seconds * 1000).getFullYear();
            }
            const d = new Date(stu.createdAt);
            if (!isNaN(d.getTime())) return d.getFullYear();
        }
        return currentYear;
    };

    // Helper: Parse Leaving Year safely
    const getLeavingYear = (rec) => {
        if (rec.year) {
            const yr = parseInt(rec.year);
            if (!isNaN(yr)) return yr;
        }
        if (rec.leavingDate) {
            const yr = parseInt(String(rec.leavingDate).split('-')[0]);
            if (!isNaN(yr)) return yr;
        }
        if (rec.session) {
            const parts = String(rec.session).split('-');
            const yr = parseInt(parts[1] || parts[0]);
            if (!isNaN(yr)) return yr;
        }
        if (rec.createdAt) {
            if (typeof rec.createdAt.toDate === 'function') {
                return rec.createdAt.toDate().getFullYear();
            }
            if (rec.createdAt.seconds) {
                return new Date(rec.createdAt.seconds * 1000).getFullYear();
            }
            const d = new Date(rec.createdAt);
            if (!isNaN(d.getTime())) return d.getFullYear();
        }
        return currentYear;
    };

    // Effective records based on Demo Data status
    const effectiveSlcHistory = useMemo(() => {
        if (isDemoActive) {
            return generateMockSLCHistory(currentYear);
        }
        return slcHistory;
    }, [isDemoActive, slcHistory, currentYear]);

    const effectiveStudents = useMemo(() => {
        if (isDemoActive) {
            return generateDemoAdmissions(currentYear);
        }
        return students;
    }, [isDemoActive, students, currentYear]);

    // 2. Multi-Year Analytics Computations
    const analytics = useMemo(() => {
        // Group leavings by year
        const leavingsByYear = new Map();
        effectiveSlcHistory.forEach(rec => {
            const yr = getLeavingYear(rec);
            leavingsByYear.set(yr, (leavingsByYear.get(yr) || 0) + 1);
        });

        // Group admissions by year
        const admissionsByYear = new Map();
        effectiveStudents.forEach(stu => {
            const yr = getAdmissionYear(stu);
            admissionsByYear.set(yr, (admissionsByYear.get(yr) || 0) + 1);
        });

        // Specific Year Totals
        const thisYearLeavers = leavingsByYear.get(currentYear) || 0;
        const lastYearLeavers = leavingsByYear.get(currentYear - 1) || 0;
        const thisYearAdmissions = admissionsByYear.get(currentYear) || 0;
        const lastYearAdmissions = admissionsByYear.get(currentYear - 1) || 0;

        // Selected Year Specific Data
        const isAll = selectedYearFilter === 'all';
        const targetYear = typeof selectedYearFilter === 'number' ? selectedYearFilter : currentYear;

        const filteredLeaversCount = isAll
            ? effectiveSlcHistory.length
            : (leavingsByYear.get(targetYear) || 0);

        const filteredAdmissionsCount = isAll
            ? effectiveStudents.length
            : (admissionsByYear.get(targetYear) || 0);

        // Net Growth: Admissions - Leavers
        const netStudentGain = filteredAdmissionsCount - filteredLeaversCount;
        const isGrowing = netStudentGain >= 0;
        const netGrowthRate = filteredAdmissionsCount > 0
            ? Math.round((netStudentGain / filteredAdmissionsCount) * 100)
            : (netStudentGain > 0 ? 100 : (netStudentGain < 0 ? -100 : 0));

        // YoY Leavers Variance (% difference vs previous year)
        const previousYear = targetYear - 1;
        const prevLeavers = leavingsByYear.get(previousYear) || 0;
        const leaversYoYDiff = prevLeavers > 0
            ? Math.round(((filteredLeaversCount - prevLeavers) / prevLeavers) * 100)
            : (filteredLeaversCount > 0 ? 100 : 0);

        // Almari (Cupboard) Records Stats
        const totalAlmariRecords = effectiveSlcHistory.length;
        const legacyRegisterRecords = effectiveSlcHistory.filter(r => r.isLegacyManualEntry).length;
        const liveStudioRecords = totalAlmariRecords - legacyRegisterRecords;

        // Years Range in Almari
        const allYears = Array.from(leavingsByYear.keys()).sort((a, b) => a - b);
        const oldestAlmariYear = allYears.length > 0 ? allYears[0] : 1975;
        const newestAlmariYear = allYears.length > 0 ? allYears[allYears.length - 1] : currentYear;

        // Class-Wise Leavers Breakdown (for selected year or all-time)
        const targetLeaversList = isAll
            ? effectiveSlcHistory
            : effectiveSlcHistory.filter(r => getLeavingYear(r) === targetYear);

        const classMapCount = new Map();
        const reasonMapCount = new Map();

        targetLeaversList.forEach(rec => {
            const rawCls = (rec.classAtLeaving || rec.className || 'Unknown Class').trim();
            classMapCount.set(rawCls, (classMapCount.get(rawCls) || 0) + 1);

            const rawReason = (rec.reason || 'Personal / Other').trim();
            reasonMapCount.set(rawReason, (reasonMapCount.get(rawReason) || 0) + 1);
        });

        // Sorted Class-wise Leaderboard
        const classLeaderboard = Array.from(classMapCount.entries())
            .map(([className, count]) => {
                const percentage = targetLeaversList.length > 0
                    ? Math.round((count / targetLeaversList.length) * 100)
                    : 0;

                // Detect if it's natural terminal exit (Class 10 / Matric / 12) or mid-tenure alert
                const lower = className.toLowerCase();
                const isTerminalGraduation = lower.includes('10') || lower.includes('matric') || lower.includes('12') || lower.includes('fsc') || lower.includes('fa');

                return {
                    className,
                    count,
                    percentage,
                    isTerminalGraduation
                };
            })
            .sort((a, b) => b.count - a.count);

        const topDepartureClass = classLeaderboard.length > 0 ? classLeaderboard[0] : null;

        // Reasons Breakdown list
        const reasonsList = Array.from(reasonMapCount.entries())
            .map(([reason, count]) => ({
                reason,
                count,
                percentage: targetLeaversList.length > 0 ? Math.round((count / targetLeaversList.length) * 100) : 0
            }))
            .sort((a, b) => b.count - a.count);

        // Multi-Year Comparison Chart Data (Last 5 Years)
        const chartYears = [
            currentYear - 4,
            currentYear - 3,
            currentYear - 2,
            currentYear - 1,
            currentYear
        ];

        const trendChartData = chartYears.map(yr => {
            const adm = admissionsByYear.get(yr) || 0;
            const lvg = leavingsByYear.get(yr) || 0;
            const net = adm - lvg;
            return {
                year: String(yr),
                admissions: adm,
                leavings: lvg,
                netGrowth: net
            };
        });

        return {
            thisYearLeavers,
            lastYearLeavers,
            thisYearAdmissions,
            lastYearAdmissions,
            filteredLeaversCount,
            filteredAdmissionsCount,
            netStudentGain,
            isGrowing,
            netGrowthRate,
            leaversYoYDiff,
            totalAlmariRecords,
            legacyRegisterRecords,
            liveStudioRecords,
            oldestAlmariYear,
            newestAlmariYear,
            classLeaderboard,
            topDepartureClass,
            reasonsList,
            trendChartData,
            targetLeaversCount: targetLeaversList.length
        };
    }, [effectiveSlcHistory, effectiveStudents, currentYear, selectedYearFilter]);

    // Handle Year Switch Options
    const quickYearFilters = useMemo(() => {
        return [
            { label: `${currentYear} (Current)`, value: currentYear },
            { label: `${currentYear - 1} (Last Year)`, value: currentYear - 1 }
        ];
    }, [currentYear]);

    // Extended 10-Year Sessions list for the smart dropdown
    const pastSessionsList = useMemo(() => {
        const years = [];
        for (let y = currentYear - 2; y >= currentYear - 10; y--) {
            years.push({ label: `Session ${y}`, value: y });
        }
        return years;
    }, [currentYear]);

    return (
        <div className="space-y-6 animate-fadeIn font-sans">
            {/* Top Showcase Banner & Interactive Session Filters */}
            <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-800 rounded-3xl p-6 sm:p-7 text-white shadow-xl relative overflow-hidden border border-blue-500/40">
                {/* Decorative background glow circles */}
                <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-blue-300/20 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 border border-white/25 rounded-full text-blue-100 text-xs font-black tracking-wide uppercase mb-3">
                            <Sparkles size={13} className="text-amber-300" />
                            <span>School Retention & Departure Intelligence</span>
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                            <span>Overview & Growth Analytics</span>
                        </h2>
                        <p className="text-blue-100 text-xs sm:text-sm font-medium mt-1 max-w-2xl leading-relaxed">
                            Complete visibility on student turnover, Admissions vs. SLC Leavings comparison, 50-Year Almari vault census, and class-wise exit patterns.
                        </p>
                    </div>

                    {/* Quick Session Filter Pills & Demo Toggle */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Demo Data Inject / Exit Master Button */}
                        <button
                            type="button"
                            onClick={() => setIsDemoActive(prev => !prev)}
                            className={`px-3.5 py-2 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 shadow-md border ${
                                isDemoActive
                                    ? 'bg-rose-500 hover:bg-rose-600 text-white border-rose-400/80 ring-2 ring-rose-300/50'
                                    : 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-400/80 ring-2 ring-emerald-300/50'
                            }`}
                            title={isDemoActive ? "Click to Exit Demo Data and show real school database" : "Click to Inject Demo Data for presentation"}
                        >
                            {isDemoActive ? (
                                <>
                                    <X size={14} className="stroke-[3]" />
                                    <span>Exit Demo Data</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles size={14} className="animate-spin text-amber-200" />
                                    <span>Inject Demo Data</span>
                                </>
                            )}
                        </button>

                        {/* Option A: Quick Session Filter Pills + Historical Year Dropdown */}
                        <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-blue-100 shadow-md">
                            <span className="text-[11px] font-black text-slate-900 px-2.5 uppercase tracking-wider flex items-center gap-1.5">
                                <Calendar size={13} className="text-blue-600" />
                                <span>Session:</span>
                            </span>

                            {/* 1. Quick Current Year & Last Year Buttons */}
                            {quickYearFilters.map(filter => {
                                const isSelected = selectedYearFilter === filter.value;
                                return (
                                    <button
                                        key={filter.value}
                                        type="button"
                                        onClick={() => setSelectedYearFilter(filter.value)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                                            isSelected
                                                ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-700'
                                                : 'bg-slate-100/90 text-slate-800 hover:bg-blue-50 hover:text-blue-700'
                                        }`}
                                    >
                                        {filter.label}
                                    </button>
                                );
                            })}

                            {/* 2. Historical Multi-Year Dropdown (5 to 10 Years Back + All Time) */}
                            <div className="relative inline-flex items-center">
                                <select
                                    value={
                                        selectedYearFilter === currentYear || selectedYearFilter === currentYear - 1
                                            ? ''
                                            : selectedYearFilter
                                    }
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === 'all') {
                                            setSelectedYearFilter('all');
                                        } else if (val) {
                                            setSelectedYearFilter(parseInt(val));
                                        }
                                    }}
                                    className={`px-3 py-1.5 pr-7 rounded-xl text-xs font-black transition-all cursor-pointer appearance-none border outline-none ${
                                        selectedYearFilter !== currentYear && selectedYearFilter !== currentYear - 1
                                            ? 'bg-blue-600 text-white border-blue-700 shadow-sm ring-1 ring-blue-700'
                                            : 'bg-slate-100/90 text-slate-800 border-slate-200 hover:bg-blue-50 hover:text-blue-700'
                                    }`}
                                    title="View Historical 5 to 10 Years Sessions"
                                >
                                    <option value="" disabled className="bg-white text-slate-400 font-bold">
                                        More Sessions ▾
                                    </option>
                                    <option value="all" className="bg-white text-slate-900 font-black">
                                        🌟 All Sessions (Lifetime)
                                    </option>
                                    <optgroup label="Past Historical Sessions" className="bg-white text-slate-500 font-bold">
                                        {pastSessionsList.map(session => (
                                            <option key={session.value} value={session.value} className="bg-white text-slate-900 font-extrabold">
                                                {session.label} ({session.value})
                                            </option>
                                        ))}
                                    </optgroup>
                                </select>
                                <ChevronDown size={13} className={`absolute right-2 pointer-events-none ${
                                    selectedYearFilter !== currentYear && selectedYearFilter !== currentYear - 1
                                        ? 'text-white'
                                        : 'text-slate-600'
                                }`} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* SECTION 1: HERO GROWTH VS DEGROWTH ENGINE (Glass Effect with Shining Specular Edges) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* 1. Net School Growth Meter Card (Glassmorphic with Specular Shining Edges) */}
                <div
                    className={`p-6 rounded-2xl transition-all duration-300 relative overflow-hidden flex flex-col justify-between backdrop-blur-xl group hover:shadow-2xl ${
                        analytics.isGrowing
                            ? 'bg-gradient-to-br from-emerald-500/15 via-white/85 to-emerald-500/5 border border-emerald-300/60 shadow-[inset_0_1px_2px_0_rgba(255,255,255,0.9),0_12px_24px_-4px_rgba(16,185,129,0.15)]'
                            : 'bg-gradient-to-br from-rose-500/15 via-white/85 to-rose-500/5 border border-rose-300/60 shadow-[inset_0_1px_2px_0_rgba(255,255,255,0.9),0_12px_24px_-4px_rgba(244,63,94,0.15)]'
                    }`}
                >
                    {/* Top Specular Edge Shine */}
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-white to-transparent opacity-90 pointer-events-none" />
                    {/* Corner Ambient Glass Glow */}
                    <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/40 rounded-full blur-xl pointer-events-none" />
                    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-white/50 to-transparent pointer-events-none" />

                    <div className="relative z-10">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5 drop-shadow-2xs">
                                <div className={`p-1.5 rounded-lg border shadow-xs ${
                                    analytics.isGrowing
                                        ? 'bg-emerald-100/90 text-emerald-700 border-emerald-300/80'
                                        : 'bg-rose-100/90 text-rose-700 border-rose-300/80'
                                }`}>
                                    <TrendingUp size={14} />
                                </div>
                                <span>Net School Growth Rate</span>
                            </span>
                            <span className={`text-[11px] font-black px-3 py-1 rounded-full border shadow-xs backdrop-blur-md ${
                                analytics.isGrowing
                                    ? 'bg-emerald-500/15 text-emerald-800 border-emerald-300'
                                    : 'bg-rose-500/15 text-rose-800 border-rose-300'
                            }`}>
                                {analytics.isGrowing ? '🟢 Expanding School' : '🔴 Degrowth Alert'}
                            </span>
                        </div>

                        <div className="mt-4 flex items-baseline gap-3">
                            <div className={`text-4xl sm:text-5xl font-black tracking-tight drop-shadow-xs ${
                                analytics.isGrowing ? 'text-emerald-700' : 'text-rose-700'
                            }`}>
                                {analytics.netStudentGain >= 0 ? `+${analytics.netStudentGain}` : analytics.netStudentGain}
                            </div>
                            <div className="text-xs font-extrabold text-slate-600">
                                Net Students ({selectedYearFilter === 'all' ? 'All Sessions' : `Session ${selectedYearFilter}`})
                            </div>
                        </div>

                        <p className="text-xs text-slate-700 font-bold mt-2.5 leading-relaxed">
                            {analytics.isGrowing
                                ? `Admissions exceeded leavings by ${analytics.netStudentGain} students (${analytics.netGrowthRate}% net expansion rate).`
                                : `School experienced a net contraction of ${Math.abs(analytics.netStudentGain)} students. Review class departure patterns below.`}
                        </p>
                    </div>

                    {/* Visual Growth Gauge Mini Bar */}
                    <div className="mt-5 pt-4 border-t border-slate-200/80 relative z-10">
                        <div className="flex justify-between text-[11px] font-black text-slate-700 mb-1.5">
                            <span>Admissions ({analytics.filteredAdmissionsCount})</span>
                            <span>Leavings ({analytics.filteredLeaversCount})</span>
                        </div>
                        <div className="h-2.5 w-full bg-slate-200/80 rounded-full overflow-hidden flex border border-white/60 shadow-inner">
                            <div
                                style={{ width: `${(analytics.filteredAdmissionsCount / ((analytics.filteredAdmissionsCount + analytics.filteredLeaversCount) || 1)) * 100}%` }}
                                className="bg-emerald-500 h-full rounded-l-full transition-all duration-500 shadow-sm"
                                title="New Admissions"
                            />
                            <div
                                style={{ width: `${(analytics.filteredLeaversCount / ((analytics.filteredAdmissionsCount + analytics.filteredLeaversCount) || 1)) * 100}%` }}
                                className="bg-rose-500 h-full rounded-r-full transition-all duration-500 shadow-sm"
                                title="SLC Departures"
                            />
                        </div>
                    </div>
                </div>

                {/* 2. New Admissions Metric (Glassmorphic with Specular Shining Edges) */}
                <div
                    className="p-6 rounded-2xl transition-all duration-300 relative overflow-hidden flex flex-col justify-between backdrop-blur-xl group hover:shadow-2xl bg-gradient-to-br from-indigo-500/15 via-white/85 to-blue-500/5 border border-indigo-300/60 shadow-[inset_0_1px_2px_0_rgba(255,255,255,0.9),0_12px_24px_-4px_rgba(99,102,241,0.15)]"
                >
                    {/* Top Specular Edge Shine */}
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-white to-transparent opacity-90 pointer-events-none" />
                    {/* Corner Ambient Glass Glow */}
                    <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/40 rounded-full blur-xl pointer-events-none" />
                    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-white/50 to-transparent pointer-events-none" />

                    <div className="relative z-10">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5 drop-shadow-2xs">
                                <div className="p-1.5 rounded-lg bg-indigo-100/90 text-indigo-700 border border-indigo-300/80 shadow-xs">
                                    <UserPlus size={14} />
                                </div>
                                <span>New Student Admissions</span>
                            </span>
                            <span className="text-[10px] font-black px-3 py-1 bg-indigo-500/15 text-indigo-800 rounded-full border border-indigo-300/80 shadow-xs backdrop-blur-md">
                                Fresh Inflow
                            </span>
                        </div>
                        <div className="mt-4 flex items-baseline gap-2">
                            <div className="text-4xl font-black text-slate-900 tracking-tight drop-shadow-xs">
                                {analytics.filteredAdmissionsCount}
                            </div>
                            <span className="text-xs font-black text-slate-600">Students Enrolled</span>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-700">
                            <span>This Year: <strong className="text-slate-950 font-black">{analytics.thisYearAdmissions}</strong></span>
                            <span>•</span>
                            <span>Last Year: <strong className="text-slate-950 font-black">{analytics.lastYearAdmissions}</strong></span>
                        </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-slate-200/80 text-xs text-indigo-800 font-extrabold flex items-center gap-1.5 relative z-10">
                        <CheckCircle2 size={14} className="text-indigo-600" />
                        <span>Active Master Roster Admissions</span>
                    </div>
                </div>

                {/* 3. SLC Leavers Metric (Glassmorphic with Specular Shining Edges) */}
                <div
                    className="p-6 rounded-2xl transition-all duration-300 relative overflow-hidden flex flex-col justify-between backdrop-blur-xl group hover:shadow-2xl bg-gradient-to-br from-amber-500/15 via-white/85 to-orange-500/5 border border-amber-300/60 shadow-[inset_0_1px_2px_0_rgba(255,255,255,0.9),0_12px_24px_-4px_rgba(245,158,11,0.15)]"
                >
                    {/* Top Specular Edge Shine */}
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-white to-transparent opacity-90 pointer-events-none" />
                    {/* Corner Ambient Glass Glow */}
                    <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/40 rounded-full blur-xl pointer-events-none" />
                    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-white/50 to-transparent pointer-events-none" />

                    <div className="relative z-10">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5 drop-shadow-2xs">
                                <div className="p-1.5 rounded-lg bg-amber-100/90 text-amber-800 border border-amber-300/80 shadow-xs">
                                    <LogOut size={14} />
                                </div>
                                <span>School Leavings (SLCs)</span>
                            </span>
                            <span className="text-[10px] font-black px-3 py-1 bg-amber-500/15 text-amber-900 rounded-full border border-amber-300/80 shadow-xs backdrop-blur-md">
                                Total Exits
                            </span>
                        </div>
                        <div className="mt-4 flex items-baseline gap-2">
                            <div className="text-4xl font-black text-slate-900 tracking-tight drop-shadow-xs">
                                {analytics.filteredLeaversCount}
                            </div>
                            <span className="text-xs font-black text-slate-600">SLC Certificates Issued</span>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-700">
                            <span>This Year: <strong className="text-slate-950 font-black">{analytics.thisYearLeavers}</strong></span>
                            <span>•</span>
                            <span>Last Year: <strong className="text-slate-950 font-black">{analytics.lastYearLeavers}</strong></span>
                        </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-slate-200/80 text-xs font-bold flex items-center justify-between relative z-10">
                        <span className="text-slate-700 font-extrabold">YoY Leaving Variance:</span>
                        <span className={`font-black flex items-center gap-0.5 px-2.5 py-1 rounded-lg border shadow-xs ${
                            analytics.leaversYoYDiff > 0
                                ? 'bg-amber-100 text-amber-900 border-amber-300'
                                : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        }`}>
                            {analytics.leaversYoYDiff > 0 ? (
                                <ArrowUpRight size={13} />
                            ) : (
                                <ArrowDownRight size={13} />
                            )}
                            {analytics.leaversYoYDiff > 0 ? `+${analytics.leaversYoYDiff}% higher` : `${Math.abs(analytics.leaversYoYDiff)}% fewer`}
                        </span>
                    </div>
                </div>
            </div>

            {/* SECTION 2: 4-KPI SHOWCASE STRIP (With Dashboard-style Theme Gradients, Glass Shines & Sharp Edges) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* KPI 1: This Year Leavers (Vivid Blue Dashboard Theme) */}
                <div
                    className="relative overflow-hidden p-5 rounded-xl border border-white/25 shadow-lg transition-all duration-300 hover:scale-102 hover:shadow-xl group"
                    style={{
                        background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                        boxShadow: '0 10px 20px -3px rgba(37, 99, 235, 0.35)'
                    }}
                >
                    {/* Glass Geometric Shine Pattern */}
                    <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/15 rounded-xl rotate-12 backdrop-blur-xs pointer-events-none group-hover:scale-110 transition-transform" />
                    <div className="absolute -bottom-8 -left-8 w-20 h-20 bg-white/10 rounded-lg -rotate-12 pointer-events-none" />

                    <div className="relative z-10 flex flex-col justify-between h-full">
                        <div className="flex items-center justify-between">
                            <span className="text-white font-black text-[11px] sm:text-xs uppercase tracking-wider drop-shadow-xs opacity-95">
                                This Year Exits
                            </span>
                            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-xs">
                                <Calendar size={16} />
                            </div>
                        </div>

                        <div className="mt-3">
                            <div className="text-3xl sm:text-4xl font-black text-white tracking-tight drop-shadow-sm">
                                {analytics.thisYearLeavers}
                            </div>
                            <div className="text-blue-100 font-extrabold text-xs mt-1.5 flex items-center gap-1.5 drop-shadow-2xs">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                                <span>Current Session {currentYear}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* KPI 2: Last Year Leavers (Indigo / Purple Dashboard Theme) */}
                <div
                    className="relative overflow-hidden p-5 rounded-xl border border-white/25 shadow-lg transition-all duration-300 hover:scale-102 hover:shadow-xl group"
                    style={{
                        background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                        boxShadow: '0 10px 20px -3px rgba(99, 102, 241, 0.35)'
                    }}
                >
                    {/* Glass Geometric Shine Pattern */}
                    <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/15 rounded-xl rotate-12 backdrop-blur-xs pointer-events-none group-hover:scale-110 transition-transform" />
                    <div className="absolute -bottom-8 -left-8 w-20 h-20 bg-white/10 rounded-lg -rotate-12 pointer-events-none" />

                    <div className="relative z-10 flex flex-col justify-between h-full">
                        <div className="flex items-center justify-between">
                            <span className="text-white font-black text-[11px] sm:text-xs uppercase tracking-wider drop-shadow-xs opacity-95">
                                Last Year Exits
                            </span>
                            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-xs">
                                <Clock size={16} />
                            </div>
                        </div>

                        <div className="mt-3">
                            <div className="text-3xl sm:text-4xl font-black text-white tracking-tight drop-shadow-sm">
                                {analytics.lastYearLeavers}
                            </div>
                            <div className="text-indigo-100 font-extrabold text-xs mt-1.5 flex items-center gap-1.5 drop-shadow-2xs">
                                <span>Previous Session {currentYear - 1}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* KPI 3: Almaari Digital Vault Total (Vivid Amber / Gold Dashboard Theme) */}
                <div
                    onClick={onNavigateToCupboard}
                    className="relative overflow-hidden p-5 rounded-xl border border-white/25 shadow-lg transition-all duration-300 hover:scale-102 hover:shadow-xl cursor-pointer group"
                    style={{
                        background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                        boxShadow: '0 10px 20px -3px rgba(217, 119, 6, 0.35)'
                    }}
                    title="Click to open 50-Year Almari Vault"
                >
                    {/* Glass Geometric Shine Pattern */}
                    <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/15 rounded-xl rotate-12 backdrop-blur-xs pointer-events-none group-hover:scale-110 transition-transform" />
                    <div className="absolute -bottom-8 -left-8 w-20 h-20 bg-white/10 rounded-lg -rotate-12 pointer-events-none" />

                    <div className="relative z-10 flex flex-col justify-between h-full">
                        <div className="flex items-center justify-between">
                            <span className="text-white font-black text-[11px] sm:text-xs uppercase tracking-wider drop-shadow-xs opacity-95 flex items-center gap-1.5">
                                <Archive size={14} className="text-amber-200" />
                                <span>Almari Records</span>
                            </span>
                            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-xs group-hover:bg-white/30 transition-all">
                                <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                            </div>
                        </div>

                        <div className="mt-3">
                            <div className="text-3xl sm:text-4xl font-black text-white tracking-tight drop-shadow-sm">
                                {analytics.totalAlmariRecords.toLocaleString()}
                            </div>
                            <div className="text-amber-100 font-extrabold text-xs mt-1.5 flex items-center gap-1 drop-shadow-2xs">
                                <span>50-Year Archive Vault ➔</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* KPI 4: Top Departure Class (Vivid Rose / Crimson Dashboard Theme) */}
                <div
                    className="relative overflow-hidden p-5 rounded-xl border border-white/25 shadow-lg transition-all duration-300 hover:scale-102 hover:shadow-xl group"
                    style={{
                        background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
                        boxShadow: '0 10px 20px -3px rgba(225, 29, 72, 0.35)'
                    }}
                >
                    {/* Glass Geometric Shine Pattern */}
                    <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/15 rounded-xl rotate-12 backdrop-blur-xs pointer-events-none group-hover:scale-110 transition-transform" />
                    <div className="absolute -bottom-8 -left-8 w-20 h-20 bg-white/10 rounded-lg -rotate-12 pointer-events-none" />

                    <div className="relative z-10 flex flex-col justify-between h-full">
                        <div className="flex items-center justify-between">
                            <span className="text-white font-black text-[11px] sm:text-xs uppercase tracking-wider drop-shadow-xs opacity-95">
                                Highest Exit Class
                            </span>
                            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-xs">
                                <Award size={16} />
                            </div>
                        </div>

                        <div className="mt-3">
                            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight drop-shadow-sm truncate">
                                {analytics.topDepartureClass ? analytics.topDepartureClass.className : 'N/A'}
                            </div>
                            <div className="text-rose-100 font-extrabold text-xs mt-1.5 truncate drop-shadow-2xs">
                                {analytics.topDepartureClass ? `${analytics.topDepartureClass.count} Students (${analytics.topDepartureClass.percentage}%)` : 'No leavers recorded'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* SECTION 3: VISUAL ANALYTICS (Side-by-Side: Admissions vs Leavings Comparison Chart & Class-wise Exit Ranking) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Recharts Multi-Year Trend Bar Chart (7 Cols) */}
                <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div>
                            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                <BarChart3 size={18} className="text-indigo-600" />
                                <span>Admissions vs. Leavings Trend (5-Year Comparison)</span>
                            </h3>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">
                                Annual school intake vs. certified school leaving certificates.
                            </p>
                        </div>
                        {/* Demo Data Inject / Exit Button for Admissions vs Leavings Trend */}
                        <button
                            type="button"
                            onClick={() => setIsDemoActive(prev => !prev)}
                            className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer flex items-center gap-1.5 border shrink-0 ${
                                isDemoActive
                                    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                            }`}
                            title={isDemoActive ? "Click to Exit Demo Data and restore real database" : "Click to Inject Demo Data into Trend Chart"}
                        >
                            {isDemoActive ? (
                                <>
                                    <X size={12} className="stroke-[3]" />
                                    <span>Exit Demo</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles size={12} className="text-indigo-600" />
                                    <span>Inject Demo Data</span>
                                </>
                            )}
                        </button>
                    </div>

                    <div className="h-72 w-full pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analytics.trendChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" strokeOpacity={1} vertical={true} horizontal={true} />
                                <XAxis dataKey="year" stroke="#64748b" fontSize={12} tickLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} allowDecimals={false} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1e293b',
                                        borderRadius: '16px',
                                        border: 'none',
                                        color: '#fff',
                                        fontSize: '12px',
                                        padding: '10px 14px'
                                    }}
                                    formatter={(value, name) => [
                                        value,
                                        name === 'admissions' ? 'New Admissions' : 'SLC Departures'
                                    ]}
                                />
                                <Legend
                                    verticalAlign="top"
                                    height={36}
                                    formatter={(value) => (
                                        <span className="text-xs font-bold text-slate-600">
                                            {value === 'admissions' ? 'New Admissions 📥' : 'SLC Leavers 📤'}
                                        </span>
                                    )}
                                />
                                <Bar dataKey="admissions" fill="#6366f1" radius={[8, 8, 0, 0]} barSize={26} />
                                <Bar dataKey="leavings" fill="#f43f5e" radius={[8, 8, 0, 0]} barSize={26} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70 text-xs text-slate-600 flex items-center justify-between">
                        <span className="font-medium">Summary: Over the last 5 sessions, the school admitted <strong className="text-indigo-700">{analytics.trendChartData.reduce((acc, c) => acc + c.admissions, 0)}</strong> students and certified <strong className="text-rose-600">{analytics.trendChartData.reduce((acc, c) => acc + c.leavings, 0)}</strong> exits.</span>
                    </div>
                </div>

                {/* Right: Class-Wise Exit Ranking Leaderboard (5 Cols) */}
                <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                    <Award size={18} className="text-amber-500" />
                                    <span>Class-Wise Exit Leaderboard</span>
                                </h3>
                                <p className="text-xs text-slate-500 font-medium mt-0.5">
                                    Sab se zyada kis class se students chhor rahe hain?
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Demo Data Inject / Exit Button for Class-Wise Exit Leaderboard */}
                                <button
                                    type="button"
                                    onClick={() => setIsDemoActive(prev => !prev)}
                                    className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition-all cursor-pointer flex items-center gap-1 border shrink-0 ${
                                        isDemoActive
                                            ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                            : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                    }`}
                                    title={isDemoActive ? "Click to Exit Demo Data" : "Click to Inject Demo Data into Leaderboard"}
                                >
                                    {isDemoActive ? (
                                        <>
                                            <X size={11} className="stroke-[3]" />
                                            <span>Exit Demo</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={11} className="text-amber-600" />
                                            <span>Inject Demo</span>
                                        </>
                                    )}
                                </button>
                                <span className="text-[10px] font-black px-2 py-0.5 bg-slate-100 text-slate-700 rounded-lg">
                                    {analytics.classLeaderboard.length} Classes
                                </span>
                            </div>
                        </div>

                        {/* Leaderboard List */}
                        <div className="mt-4 space-y-3 max-h-72 overflow-y-auto pr-1">
                            {analytics.classLeaderboard.length === 0 ? (
                                <div className="text-center py-8 text-slate-400 text-xs">
                                    No school leaving records found for this selection.
                                </div>
                            ) : (
                                analytics.classLeaderboard.map((cls, idx) => (
                                    <div
                                        key={cls.className}
                                        className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200/70 transition-all"
                                    >
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] ${
                                                    idx === 0
                                                        ? 'bg-amber-400 text-slate-950 font-black'
                                                        : (idx === 1 ? 'bg-slate-300 text-slate-800' : 'bg-slate-200 text-slate-600')
                                                }`}>
                                                    {idx + 1}
                                                </span>
                                                <span className="font-extrabold text-slate-900">{cls.className}</span>
                                                {cls.isTerminalGraduation ? (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
                                                        🎓 Graduation
                                                    </span>
                                                ) : (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-md">
                                                        ⚠️ Mid-Session
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <span className="font-black text-slate-900">{cls.count}</span>
                                                <span className="text-[10px] font-bold text-slate-400 ml-1">({cls.percentage}%)</span>
                                            </div>
                                        </div>

                                        {/* Colored Progress Bar */}
                                        <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                                            <div
                                                style={{ width: `${cls.percentage}%` }}
                                                className={`h-full rounded-full ${
                                                    idx === 0
                                                        ? 'bg-amber-500'
                                                        : (cls.isTerminalGraduation ? 'bg-indigo-500' : 'bg-rose-500')
                                                }`}
                                            />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-medium">
                        💡 <em>Tip: Terminal classes (Class 10) have expected exits upon graduation. High exits in lower classes warrant teacher/curriculum review.</em>
                    </div>
                </div>
            </div>

            {/* SECTION 4: 50-YEAR DIGITAL ALMARI SHOWCASE & REASONS BREAKDOWN */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: 50-Year Almari Vault Showcase Box (6 Cols) - Matches Almari Records Card */}
                <div
                    className="lg:col-span-6 p-6 sm:p-7 rounded-2xl shadow-xl border border-white/25 relative overflow-hidden flex flex-col justify-between text-white group"
                    style={{
                        background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                        boxShadow: '0 12px 28px -4px rgba(217, 119, 6, 0.35)'
                    }}
                >
                    {/* Top Specular Edge Shine & Geometric Reflections */}
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-white to-transparent opacity-90 pointer-events-none" />
                    <div className="absolute -top-10 -right-10 w-44 h-44 bg-white/15 rounded-2xl rotate-12 backdrop-blur-xs pointer-events-none group-hover:scale-105 transition-transform" />
                    <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-white/10 rounded-xl -rotate-12 pointer-events-none" />

                    <div className="relative z-10">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2 drop-shadow-xs">
                                <div className="p-1.5 rounded-lg bg-white/20 backdrop-blur-md border border-white/30 text-white shadow-xs">
                                    <Archive size={16} />
                                </div>
                                <span>50-Year Interactive Digital Cupboard (Almari)</span>
                            </span>
                            <div className="flex items-center gap-2">
                                {/* Demo Data Inject / Exit Button for Almari Vault */}
                                <button
                                    type="button"
                                    onClick={() => setIsDemoActive(prev => !prev)}
                                    className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition-all cursor-pointer flex items-center gap-1 border shadow-xs ${
                                        isDemoActive
                                            ? 'bg-rose-500/90 text-white border-rose-300 hover:bg-rose-600'
                                            : 'bg-white/20 text-white border-white/30 hover:bg-white/30 backdrop-blur-md'
                                    }`}
                                    title={isDemoActive ? "Click to Exit Demo Data and restore real Almari count" : "Click to Inject Demo Data (50-Year records) into Almari"}
                                >
                                    {isDemoActive ? (
                                        <>
                                            <X size={11} className="stroke-[3]" />
                                            <span>Exit Demo</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={11} className="text-amber-200" />
                                            <span>Inject Demo</span>
                                        </>
                                    )}
                                </button>
                                <span className="text-[10px] font-black px-3 py-1 bg-white/20 text-white rounded-full border border-white/30 shadow-xs backdrop-blur-md">
                                    Permanent Vault
                                </span>
                            </div>
                        </div>

                        <div className="mt-5 flex items-baseline gap-3">
                            <div className="text-4xl sm:text-5xl font-black text-white tracking-tight drop-shadow-sm">
                                {analytics.totalAlmariRecords.toLocaleString()}
                            </div>
                            <div className="text-xs font-extrabold text-amber-100 drop-shadow-2xs">
                                Total Certificates Preserved in Almari
                            </div>
                        </div>

                        <p className="text-xs text-white/90 font-medium mt-3 leading-relaxed">
                            Every leaving certificate issued digitally plus physical school registers digitized over a 50-year horizon ({analytics.oldestAlmariYear} – {analytics.newestAlmariYear}) are safely preserved.
                        </p>

                        {/* Breakdown pills: White Background with Black Text */}
                        <div className="grid grid-cols-2 gap-3 mt-5">
                            <div className="p-3.5 bg-white rounded-xl border border-white/80 shadow-md">
                                <span className="text-[10px] font-black text-slate-800 uppercase tracking-wider block">Live Digital Issued</span>
                                <div className="text-2xl font-black text-slate-950 mt-0.5">{analytics.liveStudioRecords}</div>
                                <span className="text-[10px] text-slate-600 font-bold">From SLC Studio</span>
                            </div>
                            <div className="p-3.5 bg-white rounded-xl border border-white/80 shadow-md">
                                <span className="text-[10px] font-black text-slate-800 uppercase tracking-wider block">Old Registers Digitized</span>
                                <div className="text-2xl font-black text-slate-950 mt-0.5">{analytics.legacyRegisterRecords}</div>
                                <span className="text-[10px] text-slate-600 font-bold">Physical Books Vault</span>
                            </div>
                        </div>
                    </div>

                    {/* 1-Click Jumper Button to Cupboard Tab */}
                    <div className="mt-6 pt-5 border-t border-white/20 flex items-center justify-between relative z-10">
                        <span className="text-xs font-bold text-amber-100">Want to inspect historical shelves?</span>
                        <button
                            type="button"
                            onClick={onNavigateToCupboard}
                            className="px-4 py-2 bg-white text-amber-900 hover:bg-amber-50 font-black text-xs rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                        >
                            <span>Open 50-Year Almari</span>
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>

                {/* Right: Why Students Leave? (Top Departure Reasons) (6 Cols) */}
                <div className="lg:col-span-6 bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/90 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                    <PieChart size={18} className="text-indigo-600" />
                                    <span>Why Students Leave? (Primary Reasons)</span>
                                </h3>
                                <p className="text-xs text-slate-500 font-medium mt-0.5">
                                    Exit rationale recorded on certificates.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Demo Data Inject / Exit Button for Why Students Leave */}
                                <button
                                    type="button"
                                    onClick={() => setIsDemoActive(prev => !prev)}
                                    className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition-all cursor-pointer flex items-center gap-1 border shrink-0 ${
                                        isDemoActive
                                            ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                            : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                                    }`}
                                    title={isDemoActive ? "Click to Exit Demo Data" : "Click to Inject Demo Data into Reasons"}
                                >
                                    {isDemoActive ? (
                                        <>
                                            <X size={11} className="stroke-[3]" />
                                            <span>Exit Demo</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={11} className="text-indigo-600" />
                                            <span>Inject Demo</span>
                                        </>
                                    )}
                                </button>
                                <span className="text-[10px] font-black px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-lg">
                                    {analytics.reasonsList.length} Categories
                                </span>
                            </div>
                        </div>

                        <div className="mt-4 space-y-3 max-h-64 overflow-y-auto pr-1">
                            {analytics.reasonsList.length === 0 ? (
                                <div className="text-center py-8 text-slate-400 text-xs">
                                    No reasons recorded for this selection.
                                </div>
                            ) : (
                                analytics.reasonsList.map((item, idx) => (
                                    <div
                                        key={item.reason}
                                        className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70"
                                    >
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-bold text-slate-800 truncate max-w-[75%]">
                                                {item.reason}
                                            </span>
                                            <span className="font-black text-slate-900">
                                                {item.count} <span className="text-[10px] text-slate-400 font-bold">({item.percentage}%)</span>
                                            </span>
                                        </div>
                                        <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                                            <div
                                                style={{ width: `${item.percentage}%` }}
                                                className={`h-full rounded-full ${
                                                    idx === 0 ? 'bg-indigo-600' : (idx === 1 ? 'bg-sky-500' : 'bg-purple-500')
                                                }`}
                                            />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Quick Studio Action */}
                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500">Need to issue a new SLC certificate?</span>
                        <button
                            type="button"
                            onClick={onNavigateToStudio}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                        >
                            <span>Go to Live SLC Studio</span>
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Helper: Generates realistic mock admission records when in demo mode or no live students found
function generateDemoAdmissions(currentYear) {
    const list = [];
    const counts = [
        { year: currentYear, count: 52 },
        { year: currentYear - 1, count: 48 },
        { year: currentYear - 2, count: 42 },
        { year: currentYear - 3, count: 39 },
        { year: currentYear - 4, count: 35 }
    ];

    counts.forEach(({ year, count }) => {
        for (let i = 0; i < count; i++) {
            list.push({
                id: `demo_adm_${year}_${i}`,
                admissionDate: `${year}-04-15`,
                createdAt: `${year}-04-15T10:00:00Z`
            });
        }
    });

    return list;
}

// Helper: Generates rich, realistic mock SLC records for the 50-Year Almari, 5-Year Trends, Class Leaderboard, and Reasons
function generateMockSLCHistory(currentYear) {
    const list = [];
    let certNumCounter = 1001;

    // A. 5-Year Recent Breakdown (Session Trend Data & Class Distributions)
    const recentYearProfiles = [
        {
            year: currentYear,
            classes: [
                { name: 'Class 10-A', count: 14, reason: 'Completed Secondary Education (Matric Pass)' },
                { name: 'Class 10-B', count: 12, reason: 'Passed Board Exam / Higher Secondary Admission' },
                { name: 'Class 9-A', count: 6, reason: 'Family Relocating / City Transfer' },
                { name: 'Class 8', count: 4, reason: 'Shifted to Cadet College / Boarding School' },
                { name: 'Class 7', count: 2, reason: 'Financial / Distance Constraint' }
            ]
        },
        {
            year: currentYear - 1,
            classes: [
                { name: 'Class 10-A', count: 15, reason: 'Completed Secondary Education (Matric Pass)' },
                { name: 'Class 10-B', count: 11, reason: 'Completed Secondary Education (Matric Pass)' },
                { name: 'Class 9-B', count: 5, reason: 'Family Relocating / City Transfer' },
                { name: 'Class 8', count: 3, reason: 'Personal / Domestic Reason' },
                { name: 'Class 6', count: 2, reason: 'Distance & Commute Issue' }
            ]
        },
        {
            year: currentYear - 2,
            classes: [
                { name: 'Class 10-A', count: 13, reason: 'Completed Secondary Education (Matric Pass)' },
                { name: 'Class 10-B', count: 10, reason: 'Higher Secondary Admission' },
                { name: 'Class 9-A', count: 4, reason: 'Family Relocating / City Transfer' },
                { name: 'Class 7', count: 3, reason: 'Shifted to Native Village' }
            ]
        },
        {
            year: currentYear - 3,
            classes: [
                { name: 'Class 10-A', count: 12, reason: 'Completed Secondary Education (Matric Pass)' },
                { name: 'Class 10-B', count: 9, reason: 'Completed Secondary Education (Matric Pass)' },
                { name: 'Class 8', count: 4, reason: 'Family Relocating / City Transfer' },
                { name: 'Class 5', count: 2, reason: 'Admission in Madrassa / Hifz' }
            ]
        },
        {
            year: currentYear - 4,
            classes: [
                { name: 'Class 10-A', count: 11, reason: 'Completed Secondary Education (Matric Pass)' },
                { name: 'Class 9-A', count: 4, reason: 'Family Relocating / City Transfer' },
                { name: 'Class 8', count: 3, reason: 'Financial / Family Hardship' }
            ]
        }
    ];

    recentYearProfiles.forEach(({ year, classes: classEntries }) => {
        classEntries.forEach(({ name: className, count, reason }) => {
            for (let i = 0; i < count; i++) {
                certNumCounter++;
                list.push({
                    id: `demo_slc_${year}_${certNumCounter}`,
                    certificateNumber: `SLC-${year}-${certNumCounter}`,
                    studentName: `Student ${certNumCounter}`,
                    fatherName: `Guardian ${certNumCounter}`,
                    classAtLeaving: className,
                    className: className,
                    reason: reason,
                    year: year,
                    leavingDate: `${year}-05-20`,
                    createdAt: `${year}-05-20T10:00:00Z`,
                    isLegacyManualEntry: false
                });
            }
        });
    });

    // B. Historical 50-Year Cupboard (Almari) Archival Registers (1976 – 2021)
    // Populate realistic vintage batches so Almari counter shows rich records (~1,840)
    for (let yr = currentYear - 5; yr >= currentYear - 50; yr -= 2) {
        const batchSize = 35 + (yr % 15);
        for (let b = 0; b < batchSize; b++) {
            certNumCounter++;
            list.push({
                id: `demo_almari_${yr}_${certNumCounter}`,
                certificateNumber: `ALM-${yr}-${certNumCounter}`,
                studentName: `Archived Student ${certNumCounter}`,
                fatherName: `Archived Father`,
                classAtLeaving: (b % 3 === 0) ? 'Class 10' : ((b % 3 === 1) ? 'Class 8' : 'Class 5'),
                className: (b % 3 === 0) ? 'Class 10' : ((b % 3 === 1) ? 'Class 8' : 'Class 5'),
                reason: (b % 2 === 0) ? 'Passed Matriculation Examination' : 'Family Relocating',
                year: yr,
                leavingDate: `${yr}-04-10`,
                createdAt: `${yr}-04-10T09:00:00Z`,
                isLegacyManualEntry: true // Digitized old register
            });
        }
    }

    return list;
}
