import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Wallet, Users, CheckCircle, Ban, Plus, Trash2, X, Download, 
    Printer, Search, FileText, Loader2, Sparkles, Building2, Phone, 
    Calendar, Clock, DollarSign, ArrowUpRight, ArrowDownRight, 
    ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Edit3, 
    ShieldCheck, Eye, RefreshCw, Layers, TrendingUp, Info, HelpCircle
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '../firebase';
import { 
    collection, onSnapshot, query, doc, getDoc, setDoc, 
    getDocs, updateDoc, serverTimestamp, orderBy 
} from 'firebase/firestore';
import { getDocsFast, getDocFast } from '../utils/cacheUtils';

// Helper: Convert number to Words
const numberToWords = (num) => {
    const a = [
        '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const inWords = (n) => {
        if ((n = n.toString()).length > 9) return 'overflow';
        let nArray = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!nArray) return '';
        let str = '';
        str += (Number(nArray[1]) !== 0) ? (a[Number(nArray[1])] || b[nArray[1][0]] + ' ' + a[nArray[1][1]]) + ' Crore ' : '';
        str += (Number(nArray[2]) !== 0) ? (a[Number(nArray[2])] || b[nArray[2][0]] + ' ' + a[nArray[2][1]]) + ' Lakh ' : '';
        str += (Number(nArray[3]) !== 0) ? (a[Number(nArray[3])] || b[nArray[3][0]] + ' ' + a[nArray[3][1]]) + ' Thousand ' : '';
        str += (Number(nArray[4]) !== 0) ? (a[Number(nArray[4])] || b[nArray[4][0]] + ' ' + a[nArray[4][1]]) + ' Hundred ' : '';
        str += (Number(nArray[5]) !== 0) ? ((str !== '') ? 'and ' : '') + (a[Number(nArray[5])] || b[nArray[5][0]] + ' ' + a[nArray[5][1]]) + ' ' : '';
        return str.trim();
    };

    const rounded = Math.round(Number(num) || 0);
    if (rounded === 0) return 'Zero Rupees Only';
    return inWords(rounded) + ' Rupees Only';
};

// Helper: Convert URL image to Base64
const getBase64ImageFromUrl = async (imageUrl) => {
    if (!imageUrl) return null;
    try {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn("Base64 fetch fallback:", e);
        return null;
    }
};

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const PayrollDashboard = ({ schoolId, schoolInfo }) => {
    const today = new Date();
    const [selectedYear, setSelectedYear] = useState(today.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1); // 1-12

    const [teachers, setTeachers] = useState([]);
    const [schoolTiming, setSchoolTiming] = useState({
        teacherStartTime: '08:00',
        teacherEndTime: '14:00'
    });
    const [attendanceMap, setAttendanceMap] = useState({}); // { [teacherId]: { [dateStr]: attendanceDoc } }
    const [payrollMeta, setPayrollMeta] = useState({}); // { [teacherId]: { isPaid, paidDate, adjustments: [], dayOverrides: {} } }
    
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'paid' | 'unpaid'
    
    // Modal states
    const [selectedTeacherModal, setSelectedTeacherModal] = useState(null);
    const [modalActiveTab, setModalActiveTab] = useState('timeline'); // 'timeline' | 'adjustments' | 'slip'
    const [newAdjustment, setNewAdjustment] = useState({ title: '', amount: '', type: 'bonus' });
    const [isSavingAdjustment, setIsSavingAdjustment] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [isSyncingFinances, setIsSyncingFinances] = useState(false);

    // 1. Fetch School Timings
    useEffect(() => {
        if (!schoolId) return;
        const profileRef = doc(db, `schools/${schoolId}/settings`, 'profile');
        const unsub = onSnapshot(profileRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setSchoolTiming({
                    teacherStartTime: data.teacherStartTime || '08:00',
                    teacherEndTime: data.teacherEndTime || '14:00'
                });
            }
        });
        return () => unsub();
    }, [schoolId]);

    // 2. Fetch Teachers List
    useEffect(() => {
        if (!schoolId) return;
        const teachersRef = collection(db, `schools/${schoolId}/teachers`);
        const q = query(teachersRef, orderBy('name'));
        const unsub = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            }));
            setTeachers(list);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching teachers:", err);
            setLoading(false);
        });
        return () => unsub();
    }, [schoolId]);

    // 3. Fetch Selected Month Attendance Logs for all teachers
    useEffect(() => {
        if (!schoolId || teachers.length === 0) return;

        let isMounted = true;
        const monthPrefix = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

        const loadAttendance = async () => {
            const newMap = {};
            const fetchPromises = teachers.map(async (t) => {
                try {
                    const logsRef = collection(db, `schools/${schoolId}/teachers/${t.id}/attendance_logs`);
                    const snap = await getDocsFast(logsRef);
                    newMap[t.id] = {};
                    snap.docs.forEach(docSnap => {
                        const dateId = docSnap.id; // YYYY-MM-DD
                        if (dateId.startsWith(monthPrefix)) {
                            newMap[t.id][dateId] = { id: dateId, ...docSnap.data() };
                        }
                    });
                } catch (e) {
                    console.warn(`Could not load logs for teacher ${t.id}:`, e);
                }
            });

            await Promise.all(fetchPromises);
            if (isMounted) {
                setAttendanceMap(newMap);
            }
        };

        loadAttendance();

        return () => { isMounted = false; };
    }, [schoolId, teachers, selectedYear, selectedMonth]);

    // 4. Fetch / Listen to Payroll Meta (Adjustments, Overrides, Paid Status) for this Month
    const payrollDocId = `${selectedYear}_${String(selectedMonth).padStart(2, '0')}`;
    useEffect(() => {
        if (!schoolId) return;
        const payrollDocRef = doc(db, `schools/${schoolId}/settings`, `payroll_${payrollDocId}`);
        const unsub = onSnapshot(payrollDocRef, (snap) => {
            if (snap.exists()) {
                setPayrollMeta(snap.data()?.teachers || {});
            } else {
                setPayrollMeta({});
            }
        }, (err) => {
            console.warn("Payroll snapshot listener warning:", err);
        });
        return () => unsub();
    }, [schoolId, payrollDocId]);

    // Calculate total days in selected month
    const totalDaysInMonth = useMemo(() => {
        return new Date(selectedYear, selectedMonth, 0).getDate();
    }, [selectedYear, selectedMonth]);

    // Generate array of date objects for the month
    const monthDatesList = useMemo(() => {
        const list = [];
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);

        for (let day = 1; day <= totalDaysInMonth; day++) {
            const dateObj = new Date(selectedYear, selectedMonth - 1, day);
            const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayOfWeek = dateObj.getDay(); // 0 is Sunday
            const isSunday = dayOfWeek === 0;
            const isFuture = dateObj > todayDate;
            const isToday = dateObj.getTime() === todayDate.getTime();

            list.push({
                day,
                dateStr,
                dateObj,
                dayName: dateObj.toLocaleDateString('en-US', { weekday: 'short' }),
                isSunday,
                isFuture,
                isToday
            });
        }
        return list;
    }, [selectedYear, selectedMonth, totalDaysInMonth]);

    // Count Total Working Days (exclude Sundays)
    const workingDaysCount = useMemo(() => {
        return monthDatesList.filter(d => !d.isSunday).length;
    }, [monthDatesList]);

    // Format Timestamp to HH:MM AM/PM
    const formatTimeFromTimestamp = (ts) => {
        if (!ts) return null;
        let d = null;
        if (ts.toDate) d = ts.toDate();
        else if (ts.seconds) d = new Date(ts.seconds * 1000);
        else if (typeof ts === 'string') d = new Date(ts);
        else if (ts instanceof Date) d = ts;

        if (!d || isNaN(d.getTime())) return null;
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    // Extract 24-hour HH:MM for time math
    const getHourMinute = (ts) => {
        if (!ts) return null;
        let d = null;
        if (ts.toDate) d = ts.toDate();
        else if (ts.seconds) d = new Date(ts.seconds * 1000);
        else if (typeof ts === 'string') d = new Date(ts);
        else if (ts instanceof Date) d = ts;
        if (!d || isNaN(d.getTime())) return null;
        return { hour: d.getHours(), minute: d.getMinutes(), totalMinutes: d.getHours() * 60 + d.getMinutes() };
    };

    // Parse '08:00' to minutes
    const parseTimeStringToMinutes = (str) => {
        if (!str) return 480; // 08:00 default
        const [h, m] = str.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    };

    const schoolStartMinutes = parseTimeStringToMinutes(schoolTiming.teacherStartTime);
    const schoolEndMinutes = parseTimeStringToMinutes(schoolTiming.teacherEndTime);

    // Compute Attendance & Salary Breakdown for a single teacher
    const computeTeacherPayroll = (teacher) => {
        const teacherId = teacher.id;
        const teacherLogs = attendanceMap[teacherId] || {};
        const meta = payrollMeta[teacherId] || {};
        const dayOverrides = meta.dayOverrides || {};
        const adjustments = meta.adjustments || [];

        const baseSalary = Number(teacher.salary) || 0;
        const perDaySalary = workingDaysCount > 0 ? (baseSalary / 30) : 0; // standard 30-day corporate base

        let presentCount = 0;
        let lateCount = 0;
        let halfDayCount = 0;
        let absentCount = 0;
        let approvedLeaveCount = 0;
        let autoDeductions = 0;

        const timeline = monthDatesList.map(item => {
            const { dateStr, isSunday, isFuture, isToday } = item;
            
            // 1. Check for manual override by Principal
            if (dayOverrides[dateStr]) {
                const override = dayOverrides[dateStr];
                const status = override.status; // 'Present' | 'Approved Leave' | 'Half Day' | 'Absent'
                let dayDeduction = 0;
                if (status === 'Present' || status === 'Approved Leave') {
                    if (status === 'Approved Leave') approvedLeaveCount++;
                    else presentCount++;
                } else if (status === 'Half Day') {
                    halfDayCount++;
                    dayDeduction = Math.round(perDaySalary * 0.5);
                } else if (status === 'Absent') {
                    absentCount++;
                    dayDeduction = Math.round(perDaySalary * 1.0);
                }
                autoDeductions += dayDeduction;
                return {
                    ...item,
                    isOverride: true,
                    status,
                    reason: override.reason || 'Principal Override',
                    checkInFormatted: override.checkIn || '-',
                    checkOutFormatted: override.checkOut || '-',
                    deduction: dayDeduction
                };
            }

            // 2. Sundays
            if (isSunday) {
                return {
                    ...item,
                    status: 'Weekend',
                    checkInFormatted: '-',
                    checkOutFormatted: '-',
                    deduction: 0
                };
            }

            // 3. Future dates
            if (isFuture && !isToday) {
                return {
                    ...item,
                    status: 'Upcoming',
                    checkInFormatted: '-',
                    checkOutFormatted: '-',
                    deduction: 0
                };
            }

            // 4. Log Evaluation
            const log = teacherLogs[dateStr];
            if (log) {
                const checkInFormatted = formatTimeFromTimestamp(log.checkIn) || '-';
                const checkOutFormatted = formatTimeFromTimestamp(log.checkOut) || '-';
                const inTime = getHourMinute(log.checkIn);
                const outTime = getHourMinute(log.checkOut);

                let isLate = false;
                let isEarlyOut = false;
                let dayStatus = log.status || 'Present';
                let dayDeduction = 0;

                // Late check: > 15 mins grace
                if (inTime && inTime.totalMinutes > schoolStartMinutes + 15) {
                    isLate = true;
                    lateCount++;
                }

                // Early checkout: strictly before teacherEndTime
                if (outTime && outTime.totalMinutes < schoolEndMinutes - 10) {
                    isEarlyOut = true;
                }

                // Half day determination
                if (dayStatus === 'Half Day' || (isEarlyOut && outTime.totalMinutes <= schoolStartMinutes + 180)) {
                    dayStatus = 'Half Day';
                    halfDayCount++;
                    dayDeduction = Math.round(perDaySalary * 0.5);
                } else if (isLate && isEarlyOut) {
                    dayStatus = 'Late & Early Out (Half Day)';
                    halfDayCount++;
                    dayDeduction = Math.round(perDaySalary * 0.5);
                } else if (isLate) {
                    dayStatus = 'Late Arrival';
                    presentCount++;
                    // Late arrival penalty: small nominal deduction
                    dayDeduction = Math.round(perDaySalary * 0.15);
                } else {
                    dayStatus = 'Present';
                    presentCount++;
                    dayDeduction = 0;
                }

                autoDeductions += dayDeduction;
                return {
                    ...item,
                    status: dayStatus,
                    checkInFormatted,
                    checkOutFormatted,
                    isLate,
                    isEarlyOut,
                    deduction: dayDeduction
                };
            } else {
                // Past working day with no log -> Absent
                if (!isToday) {
                    absentCount++;
                    const dayDeduction = Math.round(perDaySalary * 1.0);
                    autoDeductions += dayDeduction;
                    return {
                        ...item,
                        status: 'Absent',
                        checkInFormatted: 'No Check-In',
                        checkOutFormatted: 'No Check-Out',
                        deduction: dayDeduction
                    };
                } else {
                    // Today not checked in yet
                    return {
                        ...item,
                        status: 'Pending Today',
                        checkInFormatted: 'Pending',
                        checkOutFormatted: 'Pending',
                        deduction: 0
                    };
                }
            }
        });

        // Compute Manual Adjustments
        let manualBonuses = 0;
        let manualFines = 0;

        adjustments.forEach(adj => {
            const amt = Number(adj.amount) || 0;
            if (adj.type === 'bonus' || adj.type === 'allowance') {
                manualBonuses += amt;
            } else if (adj.type === 'fine' || adj.type === 'advance' || adj.type === 'deduction') {
                manualFines += amt;
            }
        });

        const totalEarnings = baseSalary + manualBonuses;
        const totalDeductions = autoDeductions + manualFines;
        const netSalary = Math.max(0, totalEarnings - totalDeductions);

        return {
            teacher,
            baseSalary,
            perDaySalary,
            presentCount,
            lateCount,
            halfDayCount,
            absentCount,
            approvedLeaveCount,
            autoDeductions,
            manualBonuses,
            manualFines,
            totalEarnings,
            totalDeductions,
            netSalary,
            isPaid: !!meta.isPaid,
            paidDate: meta.paidDate || null,
            paymentMode: meta.paymentMode || 'Cash',
            adjustments,
            dayOverrides,
            timeline
        };
    };

    // Calculate all payroll list
    const computedPayrolls = useMemo(() => {
        return teachers.map(t => computeTeacherPayroll(t));
    }, [teachers, attendanceMap, payrollMeta, monthDatesList, schoolStartMinutes, schoolEndMinutes, workingDaysCount]);

    // Filtered Payrolls
    const filteredPayrolls = useMemo(() => {
        return computedPayrolls.filter(p => {
            const q = searchQuery.toLowerCase().trim();
            const matchesSearch = !q || 
                (p.teacher.name || '').toLowerCase().includes(q) ||
                (p.teacher.email || '').toLowerCase().includes(q) ||
                (p.teacher.phone || '').toLowerCase().includes(q) ||
                (Array.isArray(p.teacher.subjects) && p.teacher.subjects.some(s => s.toLowerCase().includes(q)));

            const matchesStatus = filterStatus === 'all' ||
                (filterStatus === 'paid' && p.isPaid) ||
                (filterStatus === 'unpaid' && !p.isPaid);

            return matchesSearch && matchesStatus;
        });
    }, [computedPayrolls, searchQuery, filterStatus]);

    // Grand Totals Overview
    const grandTotals = useMemo(() => {
        let totalBase = 0;
        let totalAutoDeductions = 0;
        let totalManualBonuses = 0;
        let totalManualFines = 0;
        let totalNet = 0;
        let paidCount = 0;

        computedPayrolls.forEach(p => {
            totalBase += p.baseSalary;
            totalAutoDeductions += p.autoDeductions;
            totalManualBonuses += p.manualBonuses;
            totalManualFines += p.manualFines;
            totalNet += p.netSalary;
            if (p.isPaid) paidCount++;
        });

        return {
            totalBase,
            totalAutoDeductions,
            totalManualBonuses,
            totalManualFines,
            totalNet,
            paidCount,
            totalTeachers: computedPayrolls.length
        };
    }, [computedPayrolls]);

    // Handlers for adjustments
    const handleSaveAdjustment = async (teacherId) => {
        if (!newAdjustment.title.trim() || !newAdjustment.amount) {
            alert("Please enter a valid title and amount.");
            return;
        }

        setIsSavingAdjustment(true);
        try {
            const currentTeacherMeta = payrollMeta[teacherId] || {};
            const currentAdjustments = currentTeacherMeta.adjustments || [];

            const updatedAdjustments = [
                ...currentAdjustments,
                {
                    id: Date.now().toString(),
                    title: newAdjustment.title.trim(),
                    amount: Number(newAdjustment.amount),
                    type: newAdjustment.type,
                    createdAt: new Date().toISOString()
                }
            ];

            const updatedTeachersMeta = {
                ...payrollMeta,
                [teacherId]: {
                    ...currentTeacherMeta,
                    adjustments: updatedAdjustments
                }
            };
            setPayrollMeta(updatedTeachersMeta);

            const payrollDocRef = doc(db, `schools/${schoolId}/settings`, `payroll_${payrollDocId}`);
            await setDoc(payrollDocRef, {
                teachers: updatedTeachersMeta,
                lastUpdated: serverTimestamp()
            }, { merge: true });

            setNewAdjustment({ title: '', amount: '', type: 'bonus' });
        } catch (err) {
            console.error("Error saving adjustment:", err);
            alert("Failed to save adjustment.");
        }
        setIsSavingAdjustment(false);
    };

    const handleDeleteAdjustment = async (teacherId, adjId) => {
        try {
            const currentTeacherMeta = payrollMeta[teacherId] || {};
            const currentAdjustments = currentTeacherMeta.adjustments || [];
            const updatedAdjustments = currentAdjustments.filter(a => a.id !== adjId);

            const updatedTeachersMeta = {
                ...payrollMeta,
                [teacherId]: {
                    ...currentTeacherMeta,
                    adjustments: updatedAdjustments
                }
            };
            setPayrollMeta(updatedTeachersMeta);

            const payrollDocRef = doc(db, `schools/${schoolId}/settings`, `payroll_${payrollDocId}`);
            await setDoc(payrollDocRef, {
                teachers: updatedTeachersMeta,
                lastUpdated: serverTimestamp()
            }, { merge: true });
        } catch (err) {
            console.error("Error deleting adjustment:", err);
            alert("Failed to delete adjustment.");
        }
    };

    // Handler to override a day's status
    const handleOverrideDay = async (teacherId, dateStr, newStatus, reason = '') => {
        try {
            const currentTeacherMeta = payrollMeta[teacherId] || {};
            const currentOverrides = currentTeacherMeta.dayOverrides || {};

            let updatedOverrides = { ...currentOverrides };
            if (!newStatus || newStatus === 'Reset') {
                delete updatedOverrides[dateStr];
            } else {
                updatedOverrides[dateStr] = {
                    status: newStatus,
                    reason: reason || 'Principal Override',
                    updatedAt: new Date().toISOString()
                };
            }

            const updatedTeachersMeta = {
                ...payrollMeta,
                [teacherId]: {
                    ...currentTeacherMeta,
                    dayOverrides: updatedOverrides
                }
            };
            setPayrollMeta(updatedTeachersMeta);

            const payrollDocRef = doc(db, `schools/${schoolId}/settings`, `payroll_${payrollDocId}`);
            await setDoc(payrollDocRef, {
                teachers: updatedTeachersMeta,
                lastUpdated: serverTimestamp()
            }, { merge: true });

            // Also sync to teacher's actual attendance log
            try {
                const logRef = doc(db, `schools/${schoolId}/teachers/${teacherId}/attendance_logs`, dateStr);
                if (newStatus && newStatus !== 'Reset') {
                    await setDoc(logRef, {
                        date: dateStr,
                        status: newStatus,
                        isOverride: true,
                        overriddenBy: 'Principal'
                    }, { merge: true });
                }
            } catch (logErr) {
                console.warn("Direct attendance log sync skipped:", logErr);
            }
        } catch (err) {
            console.error("Error updating day override:", err);
            alert("Failed to update status: " + (err?.message || err));
        }
    };

    // Handler to Toggle Paid Status (with optional Finances Expense logging)
    const handleTogglePaidStatus = async (payrollItem, autoAddExpense = true) => {
        const teacherId = payrollItem.teacher.id;
        const currentTeacherMeta = payrollMeta[teacherId] || {};
        const willBePaid = !currentTeacherMeta.isPaid;
        const now = new Date();
        const paidDateStr = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

        setIsSyncingFinances(true);
        try {
            const updatedTeachersMeta = {
                ...payrollMeta,
                [teacherId]: {
                    ...currentTeacherMeta,
                    isPaid: willBePaid,
                    paidDate: willBePaid ? paidDateStr : null,
                    paidAmount: willBePaid ? payrollItem.netSalary : 0,
                    paidAt: willBePaid ? serverTimestamp() : null
                }
            };
            setPayrollMeta(updatedTeachersMeta);

            const payrollDocRef = doc(db, `schools/${schoolId}/settings`, `payroll_${payrollDocId}`);
            await setDoc(payrollDocRef, {
                teachers: updatedTeachersMeta,
                lastUpdated: serverTimestamp()
            }, { merge: true });

            // If marking as paid and auto-add expense is active, write to finances
            if (willBePaid && autoAddExpense) {
                const finDocRef = doc(db, `schools/${schoolId}/settings`, 'finances');
                const finDocSnap = await getDocFast(finDocRef);
                const currentFinData = finDocSnap.exists() ? finDocSnap.data() : { incomes: [], expenses: [] };
                let currentExpenses = [...(currentFinData.expenses || [])];

                const expenseId = `payroll-${payrollDocId}-${teacherId}`;
                const expenseTitle = `Teacher Salary: ${payrollItem.teacher.name} (${MONTH_NAMES[selectedMonth - 1]} ${selectedYear})`;
                
                // Remove existing if any to avoid duplication
                currentExpenses = currentExpenses.filter(e => e.id !== expenseId && e.name !== expenseTitle);

                currentExpenses.push({
                    id: expenseId,
                    name: expenseTitle,
                    amount: Number(payrollItem.netSalary),
                    type: 'one-time',
                    category: 'Salary',
                    date: paidDateStr,
                    dateString: paidDateStr,
                    remarks: `Auto-recorded from Payroll for ${payrollItem.teacher.name}`,
                    timestamp: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                });

                await setDoc(finDocRef, {
                    ...currentFinData,
                    expenses: currentExpenses
                }, { merge: true });
            } else if (!willBePaid) {
                // If unmarking as paid, remove the auto-recorded expense
                const finDocRef = doc(db, `schools/${schoolId}/settings`, 'finances');
                const finDocSnap = await getDocFast(finDocRef);
                if (finDocSnap.exists()) {
                    const currentFinData = finDocSnap.data();
                    const expenseId = `payroll-${payrollDocId}-${teacherId}`;
                    const expenseTitle = `Teacher Salary: ${payrollItem.teacher.name} (${MONTH_NAMES[selectedMonth - 1]} ${selectedYear})`;
                    const filteredExpenses = (currentFinData.expenses || []).filter(e => e.id !== expenseId && e.name !== expenseTitle);
                    await setDoc(finDocRef, {
                        ...currentFinData,
                        expenses: filteredExpenses
                    }, { merge: true });
                }
            }
        } catch (err) {
            console.error("Error toggling payment status:", err);
            alert("Failed to update payment status.");
        }
        setIsSyncingFinances(false);
    };

    // Download / Print Professional Salary Slip (PDF)
    const handleDownloadSalarySlip = async (p) => {
        setIsGeneratingPDF(true);
        try {
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 14;

            // 1. Header Bar
            doc.setFillColor(15, 23, 42); // Navy Slate-900
            doc.rect(0, 0, pageWidth, 44, 'F');

            // Emerald Brand Accent Top Strip
            doc.setFillColor(16, 185, 129); // Emerald-500
            doc.rect(0, 0, pageWidth, 4, 'F');

            // 2. School Logo
            let hasLogo = false;
            if (schoolInfo?.logo) {
                const base64Logo = await getBase64ImageFromUrl(schoolInfo.logo);
                if (base64Logo) {
                    try {
                        doc.addImage(base64Logo, 'PNG', margin, 9, 26, 26);
                        hasLogo = true;
                    } catch (e) {
                        console.warn("Logo draw error:", e);
                    }
                }
            }

            // 3. School Header Titles
            const headerTextX = hasLogo ? 44 : margin;
            const currentSchoolName = (schoolInfo?.name || 'School Name').toUpperCase();

            doc.setFontSize(16);
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.text(currentSchoolName, headerTextX, 17);

            doc.setFontSize(10.5);
            doc.setTextColor(52, 211, 153); // Emerald-400
            doc.setFont("helvetica", "bold");
            doc.text("CONFIDENTIAL SALARY DISBURSEMENT SLIP", headerTextX, 24);

            doc.setFontSize(8);
            doc.setTextColor(203, 213, 225); // Slate-300
            doc.setFont("helvetica", "normal");
            const now = new Date();
            const issueDateStr = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            doc.text(`Pay Period: ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}  |  Issue Date: ${issueDateStr}  |  Slip #: PAY-${selectedYear}${String(selectedMonth).padStart(2, '0')}-${p.teacher.id.slice(0, 5).toUpperCase()}`, headerTextX, 31);
            doc.text("Computer Generated Official Salary Voucher • Principal Office Management System", headerTextX, 37);

            // 4. Employee Information Card
            const cardY = 49;
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.3);
            doc.roundedRect(margin, cardY, pageWidth - (margin * 2), 25, 2, 2, 'FD');

            doc.setFontSize(8.5);
            doc.setTextColor(71, 85, 105);
            doc.setFont("helvetica", "bold");
            
            // Left Column
            doc.text("Teacher Name:", margin + 4, cardY + 7);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(15, 23, 42);
            doc.text(p.teacher.name || 'N/A', margin + 30, cardY + 7);

            doc.setFont("helvetica", "bold");
            doc.setTextColor(71, 85, 105);
            doc.text("Designation / Subj:", margin + 4, cardY + 14);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(15, 23, 42);
            const subjectsStr = Array.isArray(p.teacher.subjects) ? p.teacher.subjects.join(', ') : (p.teacher.subject || 'Faculty');
            doc.text(subjectsStr || 'Teacher', margin + 34, cardY + 14);

            doc.setFont("helvetica", "bold");
            doc.setTextColor(71, 85, 105);
            doc.text("Assigned Classes:", margin + 4, cardY + 21);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(15, 23, 42);
            const classesStr = Array.isArray(p.teacher.assignedClasses) ? p.teacher.assignedClasses.join(', ') : (p.teacher.assignedClass || 'General');
            doc.text(classesStr || 'N/A', margin + 34, cardY + 21);

            // Right Column
            const midX = pageWidth / 2 + 10;
            doc.setFont("helvetica", "bold");
            doc.setTextColor(71, 85, 105);
            doc.text("Teacher Phone:", midX, cardY + 7);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(15, 23, 42);
            doc.text(p.teacher.phone || 'N/A', midX + 28, cardY + 7);

            doc.setFont("helvetica", "bold");
            doc.setTextColor(71, 85, 105);
            doc.text("Email / ID:", midX, cardY + 14);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(15, 23, 42);
            doc.text(p.teacher.email || p.teacher.username || 'N/A', midX + 28, cardY + 14);

            doc.setFont("helvetica", "bold");
            doc.setTextColor(71, 85, 105);
            doc.text("Disbursement Status:", midX, cardY + 21);
            doc.setFont("helvetica", "bold");
            if (p.isPaid) {
                doc.setTextColor(5, 150, 105); // Green
                doc.text(`PAID (${p.paidDate || issueDateStr})`, midX + 35, cardY + 21);
            } else {
                doc.setTextColor(220, 38, 38); // Red
                doc.text("UNPAID / PENDING", midX + 35, cardY + 21);
            }

            // 5. Attendance Summary Highlights Bar
            const attY = 78;
            const attWidth = (pageWidth - (margin * 2) - 12) / 5;
            const attHeight = 15;

            const attCards = [
                { label: "PRESENT DAYS", val: `${p.presentCount}`, bg: [236, 253, 245], border: [167, 243, 208], color: [5, 150, 105] },
                { label: "LATE ARRIVALS", val: `${p.lateCount}`, bg: [255, 251, 235], border: [253, 230, 138], color: [217, 119, 6] },
                { label: "HALF DAYS", val: `${p.halfDayCount}`, bg: [239, 246, 255], border: [191, 219, 254], color: [29, 78, 216] },
                { label: "ABSENT DAYS", val: `${p.absentCount}`, bg: [254, 242, 242], border: [254, 202, 202], color: [220, 38, 38] },
                { label: "APPROVED LEAVES", val: `${p.approvedLeaveCount}`, bg: [245, 243, 255], border: [221, 214, 254], color: [109, 40, 217] },
            ];

            attCards.forEach((c, idx) => {
                const x = margin + idx * (attWidth + 3);
                doc.setFillColor(c.bg[0], c.bg[1], c.bg[2]);
                doc.setDrawColor(c.border[0], c.border[1], c.border[2]);
                doc.setLineWidth(0.3);
                doc.roundedRect(x, attY, attWidth, attHeight, 1.5, 1.5, 'FD');

                doc.setFontSize(6.5);
                doc.setTextColor(100, 116, 139);
                doc.setFont("helvetica", "bold");
                doc.text(c.label, x + (attWidth / 2), attY + 5, { align: 'center' });

                doc.setFontSize(10.5);
                doc.setTextColor(c.color[0], c.color[1], c.color[2]);
                doc.text(c.val, x + (attWidth / 2), attY + 12, { align: 'center' });
            });

            // 6. Side-by-Side Dual Breakdown Table (Earnings vs Deductions)
            const tableY = 98;
            
            const earningsBody = [
                ['Base Monthly Salary', `Rs ${p.baseSalary.toLocaleString()}`]
            ];
            p.adjustments.filter(a => a.type === 'bonus' || a.type === 'allowance').forEach(a => {
                earningsBody.push([`${a.title} (${a.type.toUpperCase()})`, `Rs ${Number(a.amount).toLocaleString()}`]);
            });

            const deductionsBody = [];
            if (p.absentCount > 0) {
                deductionsBody.push([`Absents (${p.absentCount} Days)`, `-Rs ${(p.absentCount * Math.round(p.perDaySalary)).toLocaleString()}`]);
            }
            if (p.halfDayCount > 0) {
                deductionsBody.push([`Half-Days (${p.halfDayCount} Days)`, `-Rs ${(p.halfDayCount * Math.round(p.perDaySalary * 0.5)).toLocaleString()}`]);
            }
            if (p.lateCount > 0) {
                deductionsBody.push([`Late Arrivals (${p.lateCount} Days Penalty)`, `-Rs ${(p.lateCount * Math.round(p.perDaySalary * 0.15)).toLocaleString()}`]);
            }
            p.adjustments.filter(a => a.type === 'fine' || a.type === 'advance' || a.type === 'deduction').forEach(a => {
                deductionsBody.push([`${a.title} (${a.type.toUpperCase()})`, `-Rs ${Number(a.amount).toLocaleString()}`]);
            });

            if (deductionsBody.length === 0) {
                deductionsBody.push(['No Attendance or Fine Deductions', 'Rs 0']);
            }

            // Dual Table Generation via jsPDF AutoTable
            const halfTableWidth = (pageWidth - (margin * 2) - 8) / 2;

            // Earnings Table (Left)
            autoTable(doc, {
                startY: tableY,
                margin: { left: margin, right: pageWidth - margin - halfTableWidth },
                head: [['EARNINGS & ALLOWANCES', 'AMOUNT']],
                body: earningsBody,
                foot: [['GROSS TOTAL EARNINGS', `Rs ${p.totalEarnings.toLocaleString()}`]],
                theme: 'grid',
                headStyles: {
                    fillColor: [16, 185, 129], // Emerald
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 8.5
                },
                footStyles: {
                    fillColor: [240, 253, 244],
                    textColor: [5, 150, 105],
                    fontStyle: 'bold',
                    fontSize: 9
                },
                styles: { fontSize: 8, cellPadding: 2.5 }
            });

            // Deductions Table (Right)
            autoTable(doc, {
                startY: tableY,
                margin: { left: margin + halfTableWidth + 8, right: margin },
                head: [['DEDUCTIONS & FINES', 'AMOUNT']],
                body: deductionsBody,
                foot: [['TOTAL DEDUCTIONS', `-Rs ${p.totalDeductions.toLocaleString()}`]],
                theme: 'grid',
                headStyles: {
                    fillColor: [239, 68, 68], // Red
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 8.5
                },
                footStyles: {
                    fillColor: [254, 242, 242],
                    textColor: [220, 38, 38],
                    fontStyle: 'bold',
                    fontSize: 9
                },
                styles: { fontSize: 8, cellPadding: 2.5 }
            });

            // 7. Net Payable Grand Box
            const finalY = Math.max(doc.lastAutoTable.finalY + 8, 170);
            
            doc.setFillColor(15, 23, 42); // Navy Slate-900
            doc.roundedRect(margin, finalY, pageWidth - (margin * 2), 24, 2, 2, 'F');

            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184); // Slate-400
            doc.setFont("helvetica", "bold");
            doc.text("NET PAYABLE SALARY (DISBURSED)", margin + 6, finalY + 8);

            doc.setFontSize(17);
            doc.setTextColor(52, 211, 153); // Emerald-400
            doc.text(`Rs ${p.netSalary.toLocaleString()}/-`, margin + 6, finalY + 17);

            // Amount in words
            doc.setFontSize(8.5);
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "italic");
            const inWordsText = `In Words: ${numberToWords(p.netSalary)}`;
            doc.text(inWordsText, pageWidth - margin - 6, finalY + 13, { align: 'right' });

            // 8. Signatures Block
            const sigY = finalY + 42;
            const sigWidth = 55;
            doc.setDrawColor(148, 163, 184);
            doc.setLineWidth(0.5);

            // Left Signature (Teacher)
            doc.line(margin + 6, sigY, margin + 6 + sigWidth, sigY);
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.setFont("helvetica", "bold");
            doc.text("Teacher / Employee", margin + 6, sigY + 5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text("Signature & Date", margin + 6, sigY + 9);

            // Right Signature (Principal / Cashier)
            const rightSigX = pageWidth - margin - sigWidth - 6;
            doc.line(rightSigX, sigY, rightSigX + sigWidth, sigY);
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.setFont("helvetica", "bold");
            doc.text("Principal / Administrator", rightSigX, sigY + 5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text("Official Stamp & Approval", rightSigX, sigY + 9);

            // Footer
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text("This is a computer-verified official payroll disbursement record.", margin, pageHeight - 8);
            doc.text(`Page 1 of 1`, pageWidth - margin, pageHeight - 8, { align: 'right' });

            const safeTeacherName = (p.teacher.name || 'Teacher').replace(/ /g, '_');
            const fileName = `Salary_Slip_${safeTeacherName}_${MONTH_NAMES[selectedMonth - 1]}_${selectedYear}.pdf`;
            doc.save(fileName);
        } catch (err) {
            console.error("Salary slip generation error:", err);
            alert("Failed to generate PDF salary slip.");
        }
        setIsGeneratingPDF(false);
    };

    // Modal Active Teacher Payroll item
    const activeModalPayroll = useMemo(() => {
        if (!selectedTeacherModal) return null;
        return computedPayrolls.find(p => p.teacher.id === selectedTeacherModal.id) || null;
    }, [selectedTeacherModal, computedPayrolls]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Top Toolbar Card: Month Selector & Realtime KPI Stats */}
            <div className="card animate-fade-in-up" style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '1.5rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 12px -2px rgba(15, 23, 42, 0.08)'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    marginBottom: '1.25rem',
                    paddingBottom: '1rem',
                    borderBottom: '1px solid #f1f5f9'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div style={{
                            padding: '0.55rem',
                            borderRadius: '12px',
                            background: '#ecfdf5',
                            border: '1px solid #a7f3d0',
                            color: '#059669'
                        }}>
                            <Wallet size={24} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                Teachers Payroll & Attendance Salary Engine <Sparkles size={16} color="#059669" />
                            </h3>
                            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '500' }}>
                                Automated salary calculation matched with school timings ({schoolTiming.teacherStartTime} - {schoolTiming.teacherEndTime})
                            </span>
                        </div>
                    </div>

                    {/* Month / Year Navigator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f8fafc', padding: '0.35rem 0.6rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <button
                            onClick={() => {
                                if (selectedMonth === 1) {
                                    setSelectedMonth(12);
                                    setSelectedYear(prev => prev - 1);
                                } else {
                                    setSelectedMonth(prev => prev - 1);
                                }
                            }}
                            style={{
                                background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px',
                                width: '32px', height: '32px', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', cursor: 'pointer', color: '#334155'
                            }}
                            title="Previous Month"
                        >
                            <ChevronLeft size={18} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                style={{
                                    border: 'none', background: 'transparent', fontWeight: '700',
                                    fontSize: '0.95rem', color: '#0f172a', outline: 'none', cursor: 'pointer'
                                }}
                            >
                                {MONTH_NAMES.map((m, idx) => (
                                    <option key={idx + 1} value={idx + 1}>{m}</option>
                                ))}
                            </select>

                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                style={{
                                    border: 'none', background: 'transparent', fontWeight: '700',
                                    fontSize: '0.95rem', color: '#059669', outline: 'none', cursor: 'pointer'
                                }}
                            >
                                {[today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={() => {
                                if (selectedMonth === 12) {
                                    setSelectedMonth(1);
                                    setSelectedYear(prev => prev + 1);
                                } else {
                                    setSelectedMonth(prev => prev + 1);
                                }
                            }}
                            style={{
                                background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px',
                                width: '32px', height: '32px', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', cursor: 'pointer', color: '#334155'
                            }}
                            title="Next Month"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>

                {/* 4 Grand Summary Metric Cards (Matching Main Dashboard Design) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
                    {/* Card 1: Total Base Payroll (Indigo) */}
                    <div
                        className="card"
                        style={{
                            padding: '1.5rem',
                            position: 'relative',
                            overflow: 'hidden',
                            border: 'none',
                            borderRadius: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1.15rem',
                            background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                            color: 'white',
                            boxShadow: '0 20px 25px -5px rgba(99, 102, 241, 0.4)',
                            transition: 'all 0.3s ease'
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
                                width: '50px',
                                height: '50px',
                                borderRadius: '15px',
                                background: 'rgba(255, 255, 255, 0.2)',
                                backdropFilter: 'blur(10px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid rgba(255, 255, 255, 0.3)'
                            }}>
                                <Wallet size={26} color="white" />
                            </div>
                            <div style={{
                                padding: '0.35rem 0.75rem',
                                borderRadius: '12px',
                                background: 'rgba(255, 255, 255, 0.18)',
                                color: 'white',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                border: '1px solid rgba(255, 255, 255, 0.25)'
                            }}>
                                Base
                            </div>
                        </div>

                        <div style={{ position: 'relative', zIndex: 2 }}>
                            <p style={{ fontSize: '0.88rem', fontWeight: '500', opacity: 0.9, marginBottom: '0.35rem', letterSpacing: '0.02em', color: 'white' }}>
                                Total Base Payroll
                            </p>
                            <h3 style={{ fontSize: '1.95rem', fontWeight: '800', letterSpacing: '-0.02em', color: 'white', margin: 0 }}>
                                Rs {grandTotals.totalBase.toLocaleString()}
                            </h3>
                            <span style={{ fontSize: '0.78rem', opacity: 0.85, marginTop: '0.25rem', display: 'block' }}>
                                {grandTotals.totalTeachers} Faculty Members
                            </span>
                        </div>
                    </div>

                    {/* Card 2: Auto Deductions (Crimson Red) */}
                    <div
                        className="card"
                        style={{
                            padding: '1.5rem',
                            position: 'relative',
                            overflow: 'hidden',
                            border: 'none',
                            borderRadius: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1.15rem',
                            background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                            color: 'white',
                            boxShadow: '0 20px 25px -5px rgba(239, 68, 68, 0.4)',
                            transition: 'all 0.3s ease'
                        }}
                    >
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
                                width: '50px',
                                height: '50px',
                                borderRadius: '15px',
                                background: 'rgba(255, 255, 255, 0.2)',
                                backdropFilter: 'blur(10px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid rgba(255, 255, 255, 0.3)'
                            }}>
                                <ArrowDownRight size={26} color="white" />
                            </div>
                            <div style={{
                                padding: '0.35rem 0.75rem',
                                borderRadius: '12px',
                                background: 'rgba(255, 255, 255, 0.18)',
                                color: 'white',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                border: '1px solid rgba(255, 255, 255, 0.25)'
                            }}>
                                Auto Deduct
                            </div>
                        </div>

                        <div style={{ position: 'relative', zIndex: 2 }}>
                            <p style={{ fontSize: '0.88rem', fontWeight: '500', opacity: 0.9, marginBottom: '0.35rem', letterSpacing: '0.02em', color: 'white' }}>
                                Total Auto Deductions
                            </p>
                            <h3 style={{ fontSize: '1.95rem', fontWeight: '800', letterSpacing: '-0.02em', color: 'white', margin: 0 }}>
                                - Rs {grandTotals.totalAutoDeductions.toLocaleString()}
                            </h3>
                            <span style={{ fontSize: '0.78rem', opacity: 0.85, marginTop: '0.25rem', display: 'block' }}>
                                Absents, Half-days & Late Penalties
                            </span>
                        </div>
                    </div>

                    {/* Card 3: Net Payable Amount (Emerald Green) */}
                    <div
                        className="card"
                        style={{
                            padding: '1.5rem',
                            position: 'relative',
                            overflow: 'hidden',
                            border: 'none',
                            borderRadius: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1.15rem',
                            background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                            color: 'white',
                            boxShadow: '0 20px 25px -5px rgba(16, 185, 129, 0.4)',
                            transition: 'all 0.3s ease'
                        }}
                    >
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
                                width: '50px',
                                height: '50px',
                                borderRadius: '15px',
                                background: 'rgba(255, 255, 255, 0.2)',
                                backdropFilter: 'blur(10px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid rgba(255, 255, 255, 0.3)'
                            }}>
                                <CheckCircle2 size={26} color="white" />
                            </div>
                            <div style={{
                                padding: '0.35rem 0.75rem',
                                borderRadius: '12px',
                                background: 'rgba(255, 255, 255, 0.18)',
                                color: 'white',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                border: '1px solid rgba(255, 255, 255, 0.25)'
                            }}>
                                Payable
                            </div>
                        </div>

                        <div style={{ position: 'relative', zIndex: 2 }}>
                            <p style={{ fontSize: '0.88rem', fontWeight: '500', opacity: 0.9, marginBottom: '0.35rem', letterSpacing: '0.02em', color: 'white' }}>
                                Net Payable Salary
                            </p>
                            <h3 style={{ fontSize: '1.95rem', fontWeight: '800', letterSpacing: '-0.02em', color: 'white', margin: 0 }}>
                                Rs {grandTotals.totalNet.toLocaleString()}
                            </h3>
                            <span style={{ fontSize: '0.78rem', opacity: 0.85, marginTop: '0.25rem', display: 'block' }}>
                                Final Disbursable Amount
                            </span>
                        </div>
                    </div>

                    {/* Card 4: Disbursement Status (Sky / Ocean Blue) */}
                    <div
                        className="card"
                        style={{
                            padding: '1.5rem',
                            position: 'relative',
                            overflow: 'hidden',
                            border: 'none',
                            borderRadius: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1.15rem',
                            background: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
                            color: 'white',
                            boxShadow: '0 20px 25px -5px rgba(14, 165, 233, 0.4)',
                            transition: 'all 0.3s ease'
                        }}
                    >
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
                                width: '50px',
                                height: '50px',
                                borderRadius: '15px',
                                background: 'rgba(255, 255, 255, 0.2)',
                                backdropFilter: 'blur(10px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid rgba(255, 255, 255, 0.3)'
                            }}>
                                <Users size={26} color="white" />
                            </div>
                            <div style={{
                                padding: '0.35rem 0.75rem',
                                borderRadius: '12px',
                                background: 'rgba(255, 255, 255, 0.18)',
                                color: 'white',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                border: '1px solid rgba(255, 255, 255, 0.25)'
                            }}>
                                Status
                            </div>
                        </div>

                        <div style={{ position: 'relative', zIndex: 2 }}>
                            <p style={{ fontSize: '0.88rem', fontWeight: '500', opacity: 0.9, marginBottom: '0.35rem', letterSpacing: '0.02em', color: 'white' }}>
                                Disbursement Progress
                            </p>
                            <h3 style={{ fontSize: '1.95rem', fontWeight: '800', letterSpacing: '-0.02em', color: 'white', margin: 0 }}>
                                {grandTotals.paidCount} / {grandTotals.totalTeachers} Paid
                            </h3>
                            <span style={{ fontSize: '0.78rem', opacity: 0.85, marginTop: '0.25rem', display: 'block' }}>
                                {grandTotals.totalTeachers > 0 ? Math.round((grandTotals.paidCount / grandTotals.totalTeachers) * 100) : 0}% of faculty processed
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    background: 'white', padding: '0.5rem 0.85rem', borderRadius: '12px',
                    border: '1px solid #cbd5e1', width: '320px', maxWidth: '100%'
                }}>
                    <Search size={18} color="#64748b" />
                    <input
                        type="text"
                        placeholder="Search by teacher name, subject..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.88rem' }}
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                            <X size={16} />
                        </button>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => setFilterStatus('all')}
                        style={{
                            padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer',
                            border: '1px solid', borderColor: filterStatus === 'all' ? '#059669' : '#e2e8f0',
                            background: filterStatus === 'all' ? '#059669' : 'white',
                            color: filterStatus === 'all' ? 'white' : '#64748b'
                        }}
                    >
                        All Teachers ({computedPayrolls.length})
                    </button>
                    <button
                        onClick={() => setFilterStatus('unpaid')}
                        style={{
                            padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer',
                            border: '1px solid', borderColor: filterStatus === 'unpaid' ? '#dc2626' : '#e2e8f0',
                            background: filterStatus === 'unpaid' ? '#dc2626' : 'white',
                            color: filterStatus === 'unpaid' ? 'white' : '#64748b'
                        }}
                    >
                        Unpaid ({computedPayrolls.filter(p => !p.isPaid).length})
                    </button>
                    <button
                        onClick={() => setFilterStatus('paid')}
                        style={{
                            padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer',
                            border: '1px solid', borderColor: filterStatus === 'paid' ? '#2563eb' : '#e2e8f0',
                            background: filterStatus === 'paid' ? '#2563eb' : 'white',
                            color: filterStatus === 'paid' ? 'white' : '#64748b'
                        }}
                    >
                        Paid ({computedPayrolls.filter(p => p.isPaid).length})
                    </button>
                </div>
            </div>

            {/* Teachers Payroll Master Table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 0.75rem auto', color: '#059669' }} />
                    <span style={{ fontWeight: '600' }}>Calculating Faculty Attendance & Salaries...</span>
                </div>
            ) : filteredPayrolls.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <Users size={36} style={{ margin: '0 auto 0.75rem auto', color: '#cbd5e1' }} />
                    <h4 style={{ margin: 0, color: '#334155', fontWeight: '700' }}>No Teachers Found</h4>
                    <span style={{ fontSize: '0.85rem' }}>No teachers match the current search filter.</span>
                </div>
            ) : (
                <div style={{
                    background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 12px -2px rgba(15, 23, 42, 0.05)', overflow: 'hidden'
                }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    <th style={{ padding: '1rem 1.25rem', fontWeight: '800' }}>Teacher & Subject</th>
                                    <th style={{ padding: '1rem 1rem', fontWeight: '800' }}>Base Salary</th>
                                    <th style={{ padding: '1rem 1rem', fontWeight: '800' }}>Attendance Stats</th>
                                    <th style={{ padding: '1rem 1rem', fontWeight: '800' }}>Auto Deductions</th>
                                    <th style={{ padding: '1rem 1rem', fontWeight: '800' }}>Manual Adj (+/-)</th>
                                    <th style={{ padding: '1rem 1.25rem', fontWeight: '800' }}>Net Payable</th>
                                    <th style={{ padding: '1rem 1rem', fontWeight: '800' }}>Status</th>
                                    <th style={{ padding: '1rem 1.25rem', fontWeight: '800', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPayrolls.map((p) => {
                                    const teacher = p.teacher;
                                    const subjectsStr = Array.isArray(teacher.subjects) ? teacher.subjects.join(', ') : (teacher.subject || 'Teacher');

                                    return (
                                        <tr key={teacher.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }}>
                                            {/* Teacher Details */}
                                            <td style={{ padding: '1rem 1.25rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div style={{
                                                        width: '38px', height: '38px', borderRadius: '10px',
                                                        background: '#f1f5f9', border: '1px solid #e2e8f0',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontWeight: '800', color: '#0f172a', fontSize: '0.95rem'
                                                    }}>
                                                        {(teacher.name || 'T')[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.92rem' }}>
                                                            {teacher.name}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                            {subjectsStr}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Base Salary */}
                                            <td style={{ padding: '1rem 1rem', fontWeight: '700', color: '#334155' }}>
                                                Rs {p.baseSalary.toLocaleString()}
                                            </td>

                                            {/* Attendance Badges */}
                                            <td style={{ padding: '1rem 1rem' }}>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                    <span style={{ fontSize: '0.73rem', fontWeight: '700', padding: '0.2rem 0.5rem', borderRadius: '6px', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }} title="Full Present Days">
                                                        {p.presentCount} Present
                                                    </span>
                                                    {p.lateCount > 0 && (
                                                        <span style={{ fontSize: '0.73rem', fontWeight: '700', padding: '0.2rem 0.5rem', borderRadius: '6px', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }} title="Late Check-in Days">
                                                            {p.lateCount} Late
                                                        </span>
                                                    )}
                                                    {p.halfDayCount > 0 && (
                                                        <span style={{ fontSize: '0.73rem', fontWeight: '700', padding: '0.2rem 0.5rem', borderRadius: '6px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }} title="Half Days or Early Checkouts">
                                                            {p.halfDayCount} Half-Day
                                                        </span>
                                                    )}
                                                    {p.absentCount > 0 && (
                                                        <span style={{ fontSize: '0.73rem', fontWeight: '700', padding: '0.2rem 0.5rem', borderRadius: '6px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }} title="Absent Days (No check-in)">
                                                            {p.absentCount} Absent
                                                        </span>
                                                    )}
                                                    {p.approvedLeaveCount > 0 && (
                                                        <span style={{ fontSize: '0.73rem', fontWeight: '700', padding: '0.2rem 0.5rem', borderRadius: '6px', background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' }} title="Principal Approved Leaves">
                                                            {p.approvedLeaveCount} Leave
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Auto Deductions */}
                                            <td style={{ padding: '1rem 1rem' }}>
                                                {p.autoDeductions > 0 ? (
                                                    <span style={{ color: '#dc2626', fontWeight: '700' }}>
                                                        - Rs {p.autoDeductions.toLocaleString()}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#059669', fontSize: '0.8rem', fontWeight: '600' }}>
                                                        Rs 0
                                                    </span>
                                                )}
                                            </td>

                                            {/* Manual Adj */}
                                            <td style={{ padding: '1rem 1rem' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.78rem' }}>
                                                    {p.manualBonuses > 0 && (
                                                        <span style={{ color: '#059669', fontWeight: '700' }}>
                                                            + Rs {p.manualBonuses.toLocaleString()}
                                                        </span>
                                                    )}
                                                    {p.manualFines > 0 && (
                                                        <span style={{ color: '#dc2626', fontWeight: '700' }}>
                                                            - Rs {p.manualFines.toLocaleString()}
                                                        </span>
                                                    )}
                                                    {p.manualBonuses === 0 && p.manualFines === 0 && (
                                                        <span style={{ color: '#94a3b8' }}>None</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Net Payable */}
                                            <td style={{ padding: '1rem 1.25rem' }}>
                                                <span style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                                                    Rs {p.netSalary.toLocaleString()}
                                                </span>
                                            </td>

                                            {/* Status Badge */}
                                            <td style={{ padding: '1rem 1rem' }}>
                                                {p.isPaid ? (
                                                    <div style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                                        padding: '0.3rem 0.65rem', borderRadius: '20px',
                                                        background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0',
                                                        fontSize: '0.75rem', fontWeight: '800'
                                                    }}>
                                                        <CheckCircle2 size={13} />
                                                        PAID
                                                    </div>
                                                ) : (
                                                    <div style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                                        padding: '0.3rem 0.65rem', borderRadius: '20px',
                                                        background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                                                        fontSize: '0.75rem', fontWeight: '800'
                                                    }}>
                                                        <AlertCircle size={13} />
                                                        UNPAID
                                                    </div>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.45rem' }}>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedTeacherModal(p.teacher);
                                                            setModalActiveTab('timeline');
                                                        }}
                                                        style={{
                                                            padding: '0.45rem 0.85rem', borderRadius: '8px',
                                                            background: '#f8fafc', border: '1px solid #cbd5e1',
                                                            color: '#334155', fontWeight: '700', fontSize: '0.8rem',
                                                            display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer'
                                                        }}
                                                        title="Inspect Attendance & Adjustments"
                                                    >
                                                        <Eye size={15} />
                                                        Inspect
                                                    </button>

                                                    <button
                                                        onClick={() => handleDownloadSalarySlip(p)}
                                                        disabled={isGeneratingPDF}
                                                        style={{
                                                            padding: '0.45rem 0.85rem', borderRadius: '8px',
                                                            background: '#ecfdf5', border: '1px solid #a7f3d0',
                                                            color: '#059669', fontWeight: '700', fontSize: '0.8rem',
                                                            display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer'
                                                        }}
                                                        title="Download Official Slip (PDF)"
                                                    >
                                                        <Printer size={15} />
                                                        Print Slip
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Drill-Down & Adjustment Inspection Modal */}
            {selectedTeacherModal && activeModalPayroll && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 9999, padding: '1rem'
                }}>
                    <div className="card animate-scale-in" style={{
                        background: 'white', borderRadius: '20px', width: '920px', maxWidth: '100%',
                        maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #e2e8f0'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '1.25rem 1.5rem', background: '#0f172a', color: 'white',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{
                                    width: '42px', height: '42px', borderRadius: '12px',
                                    background: '#1e293b', border: '1px solid #334155',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: '800', color: '#34d399', fontSize: '1.1rem'
                                }}>
                                    {(activeModalPayroll.teacher.name || 'T')[0].toUpperCase()}
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: 'white' }}>
                                        {activeModalPayroll.teacher.name} — Payroll Audit
                                    </h3>
                                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                                        Period: {MONTH_NAMES[selectedMonth - 1]} {selectedYear} • Base Salary: Rs {activeModalPayroll.baseSalary.toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={() => setSelectedTeacherModal(null)}
                                style={{
                                    background: '#1e293b', border: 'none', borderRadius: '10px',
                                    width: '34px', height: '34px', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', color: '#cbd5e1', cursor: 'pointer'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Nav Tabs */}
                        <div style={{
                            display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
                            padding: '0 1.5rem'
                        }}>
                            <button
                                onClick={() => setModalActiveTab('timeline')}
                                style={{
                                    padding: '0.85rem 1.25rem', background: 'none', border: 'none',
                                    borderBottom: modalActiveTab === 'timeline' ? '3px solid #059669' : '3px solid transparent',
                                    color: modalActiveTab === 'timeline' ? '#059669' : '#64748b',
                                    fontWeight: '700', fontSize: '0.88rem', cursor: 'pointer'
                                }}
                            >
                                Daily Attendance Timeline ({activeModalPayroll.timeline.length} Days)
                            </button>

                            <button
                                onClick={() => setModalActiveTab('adjustments')}
                                style={{
                                    padding: '0.85rem 1.25rem', background: 'none', border: 'none',
                                    borderBottom: modalActiveTab === 'adjustments' ? '3px solid #059669' : '3px solid transparent',
                                    color: modalActiveTab === 'adjustments' ? '#059669' : '#64748b',
                                    fontWeight: '700', fontSize: '0.88rem', cursor: 'pointer'
                                }}
                            >
                                Custom Adjustments & Fines ({activeModalPayroll.adjustments.length})
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            
                            {/* Live Formula Summary Strip */}
                            <div style={{
                                padding: '0.85rem 1.25rem', borderRadius: '12px', background: '#f8fafc',
                                border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.82rem'
                            }}>
                                <div>
                                    <span style={{ color: '#64748b' }}>Base: </span>
                                    <strong style={{ color: '#0f172a' }}>Rs {activeModalPayroll.baseSalary.toLocaleString()}</strong>
                                </div>
                                <div>
                                    <span style={{ color: '#64748b' }}>Auto Deduct: </span>
                                    <strong style={{ color: '#dc2626' }}>- Rs {activeModalPayroll.autoDeductions.toLocaleString()}</strong>
                                </div>
                                <div>
                                    <span style={{ color: '#64748b' }}>Manual Allowances: </span>
                                    <strong style={{ color: '#059669' }}>+ Rs {activeModalPayroll.manualBonuses.toLocaleString()}</strong>
                                </div>
                                <div>
                                    <span style={{ color: '#64748b' }}>Manual Fines: </span>
                                    <strong style={{ color: '#dc2626' }}>- Rs {activeModalPayroll.manualFines.toLocaleString()}</strong>
                                </div>
                                <div style={{ background: '#ecfdf5', padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                                    <span style={{ color: '#047857', fontWeight: '800' }}>Net Payable: </span>
                                    <strong style={{ color: '#059669', fontSize: '0.98rem' }}>Rs {activeModalPayroll.netSalary.toLocaleString()}</strong>
                                </div>
                            </div>

                            {/* TAB 1: Attendance Timeline */}
                            {modalActiveTab === 'timeline' && (
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: '700' }}>
                                                <th style={{ padding: '0.65rem 1rem' }}>Date & Day</th>
                                                <th style={{ padding: '0.65rem 0.75rem' }}>Check-In</th>
                                                <th style={{ padding: '0.65rem 0.75rem' }}>Check-Out</th>
                                                <th style={{ padding: '0.65rem 0.75rem' }}>Status</th>
                                                <th style={{ padding: '0.65rem 0.75rem' }}>Deduction</th>
                                                <th style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>Override</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeModalPayroll.timeline.map((item, idx) => {
                                                const isWeekend = item.isSunday;
                                                const isUpcoming = item.isFuture && !item.isToday;

                                                let statusColor = '#059669';
                                                let statusBg = '#ecfdf5';
                                                if (item.status.includes('Absent')) {
                                                    statusColor = '#dc2626';
                                                    statusBg = '#fef2f2';
                                                } else if (item.status.includes('Half') || item.status.includes('Early')) {
                                                    statusColor = '#2563eb';
                                                    statusBg = '#eff6ff';
                                                } else if (item.status.includes('Late')) {
                                                    statusColor = '#d97706';
                                                    statusBg = '#fffbeb';
                                                } else if (isWeekend || isUpcoming) {
                                                    statusColor = '#64748b';
                                                    statusBg = '#f1f5f9';
                                                }

                                                return (
                                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: item.isOverride ? '#fefce8' : 'white' }}>
                                                        <td style={{ padding: '0.6rem 1rem', fontWeight: '700', color: '#0f172a' }}>
                                                            {item.day} {MONTH_NAMES[selectedMonth - 1].slice(0, 3)} ({item.dayName})
                                                            {item.isToday && <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', background: '#059669', color: 'white', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>TODAY</span>}
                                                        </td>
                                                        <td style={{ padding: '0.6rem 0.75rem', color: '#334155' }}>
                                                            {item.checkInFormatted}
                                                        </td>
                                                        <td style={{ padding: '0.6rem 0.75rem', color: '#334155' }}>
                                                            {item.checkOutFormatted}
                                                        </td>
                                                        <td style={{ padding: '0.6rem 0.75rem' }}>
                                                            <span style={{
                                                                padding: '0.2rem 0.5rem', borderRadius: '6px',
                                                                background: statusBg, color: statusColor, fontWeight: '700', fontSize: '0.75rem'
                                                            }}>
                                                                {item.status}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '0.6rem 0.75rem', fontWeight: '700', color: item.deduction > 0 ? '#dc2626' : '#64748b' }}>
                                                            {item.deduction > 0 ? `- Rs ${item.deduction.toLocaleString()}` : 'Rs 0'}
                                                        </td>
                                                        <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>
                                                            {!isWeekend && !isUpcoming && (
                                                                <select
                                                                    value={item.isOverride ? item.status : ''}
                                                                    onChange={(e) => handleOverrideDay(activeModalPayroll.teacher.id, item.dateStr, e.target.value)}
                                                                    style={{
                                                                        fontSize: '0.75rem', padding: '0.25rem 0.5rem',
                                                                        borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none'
                                                                    }}
                                                                >
                                                                    <option value="">Auto (Default)</option>
                                                                    <option value="Present">Force Present (0 Ded)</option>
                                                                    <option value="Approved Leave">Approved Leave (0 Ded)</option>
                                                                    <option value="Half Day">Force Half Day</option>
                                                                    <option value="Absent">Force Absent</option>
                                                                </select>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* TAB 2: Custom Adjustments */}
                            {modalActiveTab === 'adjustments' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    
                                    {/* Add Adjustment Form */}
                                    <div style={{
                                        padding: '1rem', background: '#f8fafc', borderRadius: '12px',
                                        border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.75rem'
                                    }}>
                                        <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a', fontWeight: '800' }}>
                                            + Add Custom Allowance, Bonus or Fine
                                        </h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '0.75rem' }}>
                                            <input
                                                type="text"
                                                placeholder="Title / Reason (e.g. Lab breakage fine, Bonus)"
                                                value={newAdjustment.title}
                                                onChange={(e) => setNewAdjustment({ ...newAdjustment, title: e.target.value })}
                                                style={{ padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                            />
                                            <input
                                                type="number"
                                                placeholder="Amount (Rs)"
                                                value={newAdjustment.amount}
                                                onChange={(e) => setNewAdjustment({ ...newAdjustment, amount: e.target.value })}
                                                style={{ padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                            />
                                            <select
                                                value={newAdjustment.type}
                                                onChange={(e) => setNewAdjustment({ ...newAdjustment, type: e.target.value })}
                                                style={{ padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '600' }}
                                            >
                                                <option value="bonus">+ Bonus (Addition)</option>
                                                <option value="allowance">+ Allowance (Addition)</option>
                                                <option value="fine">- Fine (Deduction)</option>
                                                <option value="advance">- Advance Loan (Deduction)</option>
                                            </select>
                                            <button
                                                onClick={() => handleSaveAdjustment(activeModalPayroll.teacher.id)}
                                                disabled={isSavingAdjustment}
                                                style={{
                                                    padding: '0.55rem 1.25rem', borderRadius: '8px', background: '#059669',
                                                    color: 'white', fontWeight: '700', border: 'none', cursor: 'pointer', fontSize: '0.85rem'
                                                }}
                                            >
                                                {isSavingAdjustment ? 'Saving...' : 'Add'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Active Adjustments List */}
                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: '700' }}>
                                                    <th style={{ padding: '0.65rem 1rem' }}>Title / Reason</th>
                                                    <th style={{ padding: '0.65rem 0.75rem' }}>Type</th>
                                                    <th style={{ padding: '0.65rem 0.75rem' }}>Amount</th>
                                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {activeModalPayroll.adjustments.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={4} style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>
                                                            No manual adjustments or fines added for this month yet.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    activeModalPayroll.adjustments.map((adj) => {
                                                        const isAddition = adj.type === 'bonus' || adj.type === 'allowance';
                                                        return (
                                                            <tr key={adj.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '0.6rem 1rem', fontWeight: '700', color: '#0f172a' }}>
                                                                    {adj.title}
                                                                </td>
                                                                <td style={{ padding: '0.6rem 0.75rem' }}>
                                                                    <span style={{
                                                                        padding: '0.2rem 0.5rem', borderRadius: '6px',
                                                                        background: isAddition ? '#ecfdf5' : '#fef2f2',
                                                                        color: isAddition ? '#059669' : '#dc2626',
                                                                        fontWeight: '700', fontSize: '0.75rem'
                                                                    }}>
                                                                        {adj.type.toUpperCase()}
                                                                    </span>
                                                                </td>
                                                                <td style={{ padding: '0.6rem 0.75rem', fontWeight: '800', color: isAddition ? '#059669' : '#dc2626' }}>
                                                                    {isAddition ? '+' : '-'} Rs {Number(adj.amount).toLocaleString()}
                                                                </td>
                                                                <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>
                                                                    <button
                                                                        onClick={() => handleDeleteAdjustment(activeModalPayroll.teacher.id, adj.id)}
                                                                        style={{
                                                                            background: 'none', border: 'none', color: '#ef4444',
                                                                            cursor: 'pointer', padding: '0.25rem'
                                                                        }}
                                                                        title="Delete Adjustment"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                        </div>

                        {/* Modal Footer Actions */}
                        <div style={{
                            padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <button
                                onClick={() => handleDownloadSalarySlip(activeModalPayroll)}
                                disabled={isGeneratingPDF}
                                style={{
                                    padding: '0.55rem 1.1rem', borderRadius: '10px', background: '#0f172a',
                                    color: 'white', fontWeight: '700', border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem'
                                }}
                            >
                                <Printer size={16} />
                                Print Official Slip (PDF)
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <button
                                    onClick={() => setSelectedTeacherModal(null)}
                                    style={{
                                        padding: '0.55rem 1.1rem', borderRadius: '10px', background: 'white',
                                        border: '1px solid #cbd5e1', color: '#64748b', fontWeight: '700',
                                        cursor: 'pointer', fontSize: '0.85rem'
                                    }}
                                >
                                    Close
                                </button>

                                <button
                                    onClick={() => handleTogglePaidStatus(activeModalPayroll, true)}
                                    disabled={isSyncingFinances}
                                    style={{
                                        padding: '0.55rem 1.25rem', borderRadius: '10px',
                                        background: activeModalPayroll.isPaid ? '#ef4444' : '#059669',
                                        color: 'white', fontWeight: '800', border: 'none',
                                        cursor: 'pointer', fontSize: '0.85rem'
                                    }}
                                >
                                    {activeModalPayroll.isPaid ? 'Mark as Unpaid' : 'Mark as Paid & Sync Expense'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PayrollDashboard;
